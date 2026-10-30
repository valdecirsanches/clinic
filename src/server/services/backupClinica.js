// ==================== BACKUP DAS CLÍNICAS ====================
// Gera um arquivo .sql.gz restaurável com `gunzip -c arquivo | mysql -u ... -p`
// contendo:
//   1. o banco inteiro da clínica (estrutura + dados) — inclui documentos,
//      prontuários, agenda, financeiro etc.;
//   2. as linhas do banco GLOBAL que pertencem à clínica (cadastro da clínica,
//      usuários, configurações com clinicaId), como REPLACE INTO.
//
// Configuração e histórico ficam em configuracoes_globais:
//   backup_config    → { ativo, pasta, horario, dias, clinicas, manter }
//   backup_historico → últimas execuções
// A pasta é um caminho NO SERVIDOR (onde o backend roda).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mysql = require('mysql2');
const dbGlobal = require('../databaseGlobal');
const { MYSQL_CONFIG, GLOBAL_DB_NAME, getClinicaDbName } = require('../config/mysql');

const CHAVE_CONFIG = 'backup_config';
const CHAVE_HISTORICO = 'backup_historico';
const LINHAS_POR_INSERT = 200;

const CONFIG_PADRAO = {
  ativo: false,
  pasta: process.env.BACKUP_DIR || '',
  horario: '02:00',
  dias: [0, 1, 2, 3, 4, 5, 6],
  clinicas: 'todas',
  manter: 7
};

const emExecucao = new Map(); // clinicaId → início
let ultimaChaveAgendada = '';
let agendador = null;

// ==================== CONFIGURAÇÃO ====================

async function lerChave(chave, padrao) {
  const row = await dbGlobal.
  prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
  get(chave).
  catch(() => null);
  if (!row || row.valor == null) return padrao;
  try {
    return typeof row.valor === 'string' ? JSON.parse(row.valor) : row.valor;
  } catch {
    return padrao;
  }
}

async function gravarChave(chave, valor) {
  const texto = JSON.stringify(valor);
  const agora = new Date().toISOString();
  const upd = await dbGlobal.
  prepare('UPDATE configuracoes_globais SET valor = ?, atualizadoEm = ? WHERE chave = ?').
  run(texto, agora, chave);
  if (!upd || upd.changes === 0) {
    await dbGlobal.
    prepare('INSERT INTO configuracoes_globais (id, chave, valor, atualizadoEm) VALUES (?, ?, ?, ?)').
    run(`cfg${Date.now()}${Math.floor(Math.random() * 1000)}`, chave, texto, agora);
  }
}

async function lerConfig() {
  return { ...CONFIG_PADRAO, ...(await lerChave(CHAVE_CONFIG, {})) };
}

function validarConfig(entrada) {
  const c = { ...CONFIG_PADRAO, ...entrada };
  const erros = [];
  c.pasta = String(c.pasta || '').trim();
  if (!c.pasta) erros.push('Informe a pasta de destino.');else
  if (!path.isAbsolute(c.pasta)) erros.push('A pasta precisa ser um caminho absoluto no servidor (ex.: /var/backups/easyclin).');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.horario))) erros.push('Horário inválido (use HH:MM).');
  c.dias = Array.isArray(c.dias) ? [...new Set(c.dias.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [];
  if (c.ativo && !c.dias.length) erros.push('Selecione ao menos um dia da semana.');
  c.manter = Math.min(365, Math.max(1, Number(c.manter) || 7));
  if (c.clinicas !== 'todas') {
    c.clinicas = Array.isArray(c.clinicas) ? c.clinicas.map(String).filter(Boolean) : [];
    if (!c.clinicas.length) erros.push('Selecione ao menos uma clínica.');
  }
  c.ativo = Boolean(c.ativo);
  return { config: c, erros };
}

/** Garante que a pasta existe e aceita escrita */
function verificarPasta(pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  const teste = path.join(pasta, `.teste_escrita_${Date.now()}`);
  fs.writeFileSync(teste, 'ok');
  fs.unlinkSync(teste);
  const livre = fs.statfsSync ? fs.statfsSync(pasta) : null;
  return { livreBytes: livre ? livre.bavail * livre.bsize : null };
}

async function salvarConfig(entrada) {
  const { config, erros } = validarConfig(entrada);
  if (erros.length) {
    const e = new Error(erros.join(' '));
    e.status = 400;
    throw e;
  }
  try {
    verificarPasta(config.pasta);
  } catch (err) {
    const e = new Error(`Não foi possível gravar na pasta ${config.pasta}: ${err.message}`);
    e.status = 400;
    throw e;
  }
  await gravarChave(CHAVE_CONFIG, config);
  return config;
}

// ==================== HISTÓRICO ====================

async function registrarHistorico(entrada) {
  const lista = await lerChave(CHAVE_HISTORICO, []);
  const nova = [entrada, ...(Array.isArray(lista) ? lista : [])].slice(0, 100);
  await gravarChave(CHAVE_HISTORICO, nova).catch((err) =>
  console.error(`💾 ❌ [backup] Histórico não gravado: ${err.message}`)
  );
}

async function lerHistorico() {
  const lista = await lerChave(CHAVE_HISTORICO, []);
  return Array.isArray(lista) ? lista : [];
}

// ==================== GERAÇÃO DO ARQUIVO ====================

function nomePasta(clinicaId) {
  return String(clinicaId).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function carimbo(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function escreverAguardando(saida, texto) {
  return new Promise((resolve, reject) => {
    if (saida.write(texto)) return resolve();
    const aoDrenar = () => {
      saida.off('error', aoErro);
      resolve();
    };
    const aoErro = (err) => {
      saida.off('drain', aoDrenar);
      reject(err);
    };
    saida.once('drain', aoDrenar);
    saida.once('error', aoErro);
  });
}

// Colunas JSON chegam do mysql2 como objeto. escape() de um objeto gera
// "`chave` = valor" (sintaxe de SET), o que deixava o arquivo impossível de
// restaurar. Objetos viram o texto JSON original.
function valorSql(v) {
  if (v === null || typeof v !== 'object' || Buffer.isBuffer(v) || v instanceof Date) return v;
  return JSON.stringify(v);
}

// Um INSERT nunca passa de ~1 MB de texto. Antes o lote era só por número de
// linhas (200): em tabelas de documentos em base64, 200 linhas viravam
// centenas de MB numa única string — o servidor ficava sem memória e o
// backup "travava" sem nunca terminar nem dar erro.
const BYTES_POR_INSERT = 1024 * 1024;

/** Lê a tabela em fluxo (sem carregar tudo na memória) e grava INSERTs em lotes */
function despejarLinhas(conexao, banco, tabela, saida, verbo = 'INSERT INTO', filtro = '', params = [], aoAvancar = () => {}) {
  return new Promise((resolve, reject) => {
    let lote = [];
    let bytesLote = 0;
    let colunas = null;
    let total = 0;
    let terminado = false;
    const consulta = conexao.query(`SELECT * FROM \`${banco}\`.\`${tabela}\` ${filtro}`, params);
    const fluxo = consulta.stream({ highWaterMark: 50 });

    const falhar = (err) => {
      if (terminado) return;
      terminado = true;
      fluxo.destroy();
      reject(err);
    };

    const descarregar = async () => {
      if (!lote.length) return;
      const valores = lote;
      const bytes = bytesLote;
      lote = [];
      bytesLote = 0;
      await escreverAguardando(
        saida,
        `${verbo} \`${tabela}\` (${colunas.map((c) => `\`${c}\``).join(',')}) VALUES\n${valores.join(',\n')};\n`
      );
      aoAvancar({ linhas: valores.length, bytes });
    };

    fluxo.on('data', (linha) => {
      if (terminado) return;
      try {
        if (!colunas) colunas = Object.keys(linha);
        const valor = `(${colunas.map((c) => conexao.escape(valorSql(linha[c]))).join(',')})`;
        lote.push(valor);
        bytesLote += valor.length;
        total += 1;
      } catch (err) {
        falhar(err);
        return;
      }
      if (lote.length >= LINHAS_POR_INSERT || bytesLote >= BYTES_POR_INSERT) {
        fluxo.pause();
        descarregar().then(() => !terminado && fluxo.resume(), falhar);
      }
    });
    fluxo.on('end', () =>
    descarregar().then(() => {
      if (terminado) return;
      terminado = true;
      resolve(total);
    }, falhar)
    );
    fluxo.on('error', falhar);
  });
}

function consultarCb(conexao, sql, params = []) {
  return new Promise((resolve, reject) =>
  conexao.query(sql, params, (err, linhas) => err ? reject(err) : resolve(linhas))
  );
}

/** Sem nenhum avanço por este tempo, o backup é dado como travado e abortado */
const LIMITE_SEM_AVANCO_MS = Number(process.env.BACKUP_LIMITE_SEM_AVANCO_MS) || 5 * 60 * 1000;

/**
 * @param {(p: object) => void} [aoProgresso] recebe { etapa, tabela, tabelaAtual,
 *   tabelasTotal, linhas, bytesLidos, bytesEstimados } a cada lote gravado
 */
async function gerarBackupClinica(clinicaId, pastaBase, origem = 'manual', aoProgresso = () => {}) {
  if (emExecucao.has(clinicaId)) {
    const e = new Error('Já existe um backup desta clínica em andamento.');
    e.status = 409;
    throw e;
  }
  emExecucao.set(clinicaId, new Date().toISOString());
  const inicio = Date.now();
  const banco = getClinicaDbName(clinicaId);
  const pasta = path.join(pastaBase, nomePasta(clinicaId));
  const arquivo = path.join(pasta, `backup_${nomePasta(clinicaId)}_${carimbo()}.sql.gz`);
  const temporario = `${arquivo}.parcial`;
  let conexao = null;
  let clinicaNome = clinicaId;
  let vigia = null;
  let gzip = null;
  let destino = null;
  let corrida = (promessa) => promessa;

  // Progresso: também alimenta o vigia de travamento
  const progresso = { etapa: 'conectando', tabela: '', tabelaAtual: 0, tabelasTotal: 0, linhas: 0, bytesLidos: 0, bytesEstimados: 0 };
  let ultimoAvanco = Date.now();
  const avisar = (parcial = {}) => {
    Object.assign(progresso, parcial);
    ultimoAvanco = Date.now();
    try {
      aoProgresso({ ...progresso });
    } catch {

      // quem escuta o progresso nunca derruba o backup
    }};

  try {
    const clinica = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE id = ?').get(clinicaId);
    if (!clinica) throw new Error('Clínica não encontrada.');
    clinicaNome = clinica.nome;
    fs.mkdirSync(pasta, { recursive: true });

    conexao = mysql.createConnection({ ...MYSQL_CONFIG, database: undefined, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });

    // ⭐ Erro de disco ou da compressão interrompe TUDO na hora. Antes, um
    // disco cheio parava o arquivo, mas a gravação continuava esperando o
    // "drain" que nunca vinha — o backup ficava parado para sempre.
    gzip = zlib.createGzip({ level: 6 });
    destino = fs.createWriteStream(temporario);
    let erroFluxo = null;
    let rejeitarAborto = () => {};
    const abortado = new Promise((_, reject) => {
      rejeitarAborto = reject;
    });
    abortado.catch(() => {});
    // Qualquer etapa (consulta, leitura, gravação) termina se o backup for abortado
    corrida = (promessa) => Promise.race([promessa, abortado]);
    const abortar = (err) => {
      if (erroFluxo) return;
      erroFluxo = err;
      rejeitarAborto(err);
      try {
        gzip.destroy(err);
      } catch {}
      try {
        if (conexao) conexao.destroy();
      } catch {}
    };
    // ⭐ Sem este ouvinte, uma queda da conexão com o MySQL fora de uma
    // consulta (tempo ocioso, reinício do banco) virava "erro não tratado" e
    // DERRUBAVA O SERVIDOR inteiro — o backup sumia sem mensagem.
    conexao.on('error', (err) => {
      console.error(`💾 ⚠️ [backup] Conexão com o banco: ${err.message}`);
      abortar(err);
    });
    const terminou = new Promise((resolve, reject) => {
      destino.on('finish', resolve);
      destino.on('error', (err) => {
        abortar(err);
        reject(err);
      });
      gzip.on('error', (err) => {
        abortar(err);
        reject(err);
      });
    });
    terminou.catch(() => {}); // a falha é tratada no fluxo principal
    gzip.pipe(destino);

    // Vigia: sem avanço por tempo demais → aborta com motivo claro
    vigia = setInterval(() => {
      if (Date.now() - ultimoAvanco > LIMITE_SEM_AVANCO_MS) {
        const minutos = Math.round(LIMITE_SEM_AVANCO_MS / 60000);
        abortar(new Error(`O backup parou de avançar por ${minutos} minutos${progresso.tabela ? ` na tabela ${progresso.tabela}` : ''} e foi interrompido.`));
      }
    }, 15000);
    vigia.unref();

    const existe = await corrida(consultarCb(conexao, 'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [banco]));
    if (!existe.length) throw new Error(`Banco ${banco} não existe.`);

    // Tamanho estimado: dá a porcentagem e confere o espaço livre antes de começar
    const [tamanhoBanco] = await corrida(consultarCb(
      conexao,
      'SELECT COALESCE(SUM(DATA_LENGTH), 0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [banco]
    ));
    const bytesEstimados = Number(tamanhoBanco && tamanhoBanco.bytes) || 0;
    if (fs.statfsSync && bytesEstimados > 0) {
      const disco = fs.statfsSync(pasta);
      const livre = disco.bavail * disco.bsize;
      // o .gz costuma ficar bem menor que o banco; metade é uma margem segura
      if (livre < bytesEstimados * 0.5) {
        throw new Error(`ENOSPC: espaço livre insuficiente no servidor (${Math.round(livre / 1048576)} MB livres, banco com ~${Math.round(bytesEstimados / 1048576)} MB).`);
      }
    }
    avisar({ etapa: 'gerando', bytesEstimados });

    const escreverOuFalhar = async (texto) => {
      if (erroFluxo) throw erroFluxo;
      await corrida(escreverAguardando(gzip, texto));
      if (erroFluxo) throw erroFluxo;
    };

    await escreverOuFalhar(
      `-- Backup EasyClin\n-- Clínica: ${clinica.nome} (${clinicaId})\n-- Gerado em: ${new Date().toISOString()}\n` +
      `-- Restaurar: gunzip -c ${path.basename(arquivo)} | mysql -u USUARIO -p\n\n` +
      'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE=\'NO_AUTO_VALUE_ON_ZERO\';\n\n' +
      `CREATE DATABASE IF NOT EXISTS \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE \`${banco}\`;\n\n`
    );

    // 1) Banco da clínica, inteiro
    const tabelas = await consultarCb(
      conexao,
      `SELECT TABLE_NAME AS nome FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [banco]
    );
    let linhasTotal = 0;
    const aoAvancar = ({ linhas, bytes }) =>
    avisar({ linhas: progresso.linhas + linhas, bytesLidos: progresso.bytesLidos + bytes });
    for (let i = 0; i < tabelas.length; i += 1) {
      const { nome } = tabelas[i];
      avisar({ tabela: nome, tabelaAtual: i + 1, tabelasTotal: tabelas.length });
      const [criacao] = await corrida(consultarCb(conexao, `SHOW CREATE TABLE \`${banco}\`.\`${nome}\``));
      await escreverOuFalhar(`-- Tabela ${nome}\nDROP TABLE IF EXISTS \`${nome}\`;\n${criacao['Create Table']};\n`);
      linhasTotal += await corrida(despejarLinhas(conexao, banco, nome, gzip, 'INSERT INTO', '', [], aoAvancar));
      await escreverOuFalhar('\n');
    }

    // 2) Dados globais que pertencem à clínica
    avisar({ etapa: 'finalizando', tabela: 'dados da clínica' });
    await escreverOuFalhar(`\n-- ===== Dados globais da clínica =====\nUSE \`${GLOBAL_DB_NAME}\`;\n`);
    const globais = await consultarCb(
      conexao,
      `SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND COLUMN_NAME IN ('clinicaId', 'clinica_id')`,
      [GLOBAL_DB_NAME]
    );
    linhasTotal += await corrida(despejarLinhas(conexao, GLOBAL_DB_NAME, 'clinicas', gzip, 'REPLACE INTO', 'WHERE id = ?', [clinicaId], aoAvancar));
    for (const { tabela, coluna } of globais) {
      if (tabela === 'clinicas') continue;
      linhasTotal += await corrida(despejarLinhas(conexao, GLOBAL_DB_NAME, tabela, gzip, 'REPLACE INTO', `WHERE \`${coluna}\` = ?`, [clinicaId], aoAvancar));
    }
    await escreverOuFalhar('\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n-- Fim do backup\n');

    gzip.end();
    await corrida(terminou);
    if (erroFluxo) throw erroFluxo;
    fs.renameSync(temporario, arquivo);

    const tamanho = fs.statSync(arquivo).size;
    const resultado = {
      clinicaId,
      clinicaNome,
      origem,
      ok: true,
      arquivo: path.basename(arquivo),
      tamanho,
      tabelas: tabelas.length,
      linhas: linhasTotal,
      duracaoSeg: Math.round((Date.now() - inicio) / 1000),
      em: new Date().toISOString()
    };
    await registrarHistorico(resultado);
    console.log(`💾 ✅ [backup] ${clinicaNome}: ${resultado.arquivo} (${(tamanho / 1048576).toFixed(1)} MB, ${linhasTotal} linhas)`);
    return resultado;
  } catch (err) {
    try {
      if (gzip) gzip.destroy();
      if (destino) destino.destroy();
    } catch {}
    try {
      if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
    } catch {

      // arquivo parcial já removido
    }const falha = {
      clinicaId,
      clinicaNome,
      origem,
      ok: false,
      erro: err.message,
      duracaoSeg: Math.round((Date.now() - inicio) / 1000),
      em: new Date().toISOString()
    };
    await registrarHistorico(falha);
    console.error(`💾 ❌ [backup] ${clinicaNome}: ${err.message}`);
    throw err;
  } finally {
    if (vigia) clearInterval(vigia);
    emExecucao.delete(clinicaId);
    if (conexao) {
      // end() espera a conexão terminar; se ela travou, destroy() garante a saída
      try {
        conexao.end(() => {});
      } catch {}
      setTimeout(() => {
        try {
          conexao.destroy();
        } catch {}
      }, 5000).unref();
    }
  }
}

/** Mantém só os N backups mais recentes de cada clínica */
function aplicarRetencao(pastaBase, clinicaId, manter) {
  const pasta = path.join(pastaBase, nomePasta(clinicaId));
  if (!fs.existsSync(pasta)) return 0;
  const arquivos = fs.
  readdirSync(pasta).
  filter((n) => n.startsWith('backup_') && n.endsWith('.sql.gz')).
  sort().
  reverse();
  let removidos = 0;
  for (const nome of arquivos.slice(manter)) {
    try {
      fs.unlinkSync(path.join(pasta, nome));
      removidos += 1;
    } catch (err) {
      console.warn(`💾 ⚠️ [backup] Não removi ${nome}: ${err.message}`);
    }
  }
  return removidos;
}

async function clinicasAlvo(config) {
  const ativas = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE ativa = 1 ORDER BY nome').all();
  if (config.clinicas === 'todas') return ativas || [];
  const ids = new Set(config.clinicas);
  return (ativas || []).filter((c) => ids.has(c.id));
}

/** Executa para as clínicas configuradas, uma por vez (poupa o MySQL) */
async function executarRotina(origem = 'agendado', somenteClinicaId = null) {
  const config = await lerConfig();
  if (!config.pasta) throw Object.assign(new Error('Configure a pasta de destino antes de executar.'), { status: 400 });
  verificarPasta(config.pasta);
  const alvos = somenteClinicaId ?
  [{ id: somenteClinicaId }] :
  await clinicasAlvo(config);
  const resultados = [];
  for (const c of alvos) {
    try {
      resultados.push(await gerarBackupClinica(c.id, config.pasta, origem));
      aplicarRetencao(config.pasta, c.id, config.manter);
    } catch (err) {
      resultados.push({ clinicaId: c.id, ok: false, erro: err.message });
    }
  }
  return resultados;
}

function listarArquivos(pastaBase, clinicaId) {
  const pasta = path.join(pastaBase, nomePasta(clinicaId));
  if (!pastaBase || !fs.existsSync(pasta)) return [];
  return fs.
  readdirSync(pasta).
  filter((n) => n.startsWith('backup_') && n.endsWith('.sql.gz')).
  map((nome) => {
    const st = fs.statSync(path.join(pasta, nome));
    return { nome, tamanho: st.size, em: st.mtime.toISOString() };
  }).
  sort((a, b) => a.nome < b.nome ? 1 : -1);
}

/** Caminho seguro de um arquivo de backup (impede ../) */
function caminhoArquivo(pastaBase, clinicaId, nome) {
  if (!/^backup_[A-Za-z0-9_-]+\.sql\.gz$/.test(String(nome))) return null;
  const pasta = path.resolve(pastaBase, nomePasta(clinicaId));
  const alvo = path.resolve(pasta, nome);
  if (!alvo.startsWith(pasta + path.sep) || !fs.existsSync(alvo)) return null;
  return alvo;
}

// ==================== AGENDADOR ====================

function iniciarAgendador() {
  if (agendador) return;
  agendador = setInterval(async () => {
    try {
      const config = await lerConfig();
      if (!config.ativo || !config.pasta) return;
      const agora = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const horaAtual = `${p(agora.getHours())}:${p(agora.getMinutes())}`;
      if (horaAtual !== config.horario || !config.dias.includes(agora.getDay())) return;
      const chave = `${agora.toDateString()} ${horaAtual}`;
      if (chave === ultimaChaveAgendada) return;
      ultimaChaveAgendada = chave;
      console.log(`💾 [backup] Rotina agendada iniciada (${horaAtual})`);
      const r = await executarRotina('agendado');
      console.log(`💾 [backup] Rotina agendada concluída: ${r.filter((x) => x.ok).length}/${r.length} ok`);
    } catch (err) {
      console.error(`💾 ❌ [backup] Agendador: ${err.message}`);
    }
  }, 30000);
  console.log('💾 [backup] Agendador de backup iniciado (verifica a cada 30s)');
}

function proximaExecucao(config) {
  if (!config.ativo || !config.dias.length) return null;
  const [h, m] = config.horario.split(':').map(Number);
  const agora = new Date();
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(agora);
    d.setDate(agora.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d > agora && config.dias.includes(d.getDay())) return d.toISOString();
  }
  return null;
}

module.exports = {
  gerarBackupClinica,
  nomePasta,
  lerChave,
  gravarChave,
  lerConfig,
  salvarConfig,
  lerHistorico,
  executarRotina,
  listarArquivos,
  caminhoArquivo,
  iniciarAgendador,
  proximaExecucao,
  clinicasEmExecucao: () => [...emExecucao.keys()],
  verificarPasta
};