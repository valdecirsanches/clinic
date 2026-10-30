// ============ BACKUP NA MÁQUINA DO CLIENTE (admin da clínica) ============
// Fluxo em 3 passos, para não depender de uma única requisição longa:
//
//   GET /api/backup-cliente/preparar?clinicaId=&usuarioId=  → começa a gerar (responde na hora)
//   GET /api/backup-cliente/status?clinicaId=&usuarioId=    → andamento + último backup
//   GET /api/backup-cliente/baixar?clinicaId=&usuarioId=    → envia o .sql.gz pronto
//
// Por quê: antes, o arquivo era gerado DENTRO da requisição de download.
// Num banco grande isso passa de 1 minuto sem enviar nada, e o proxy encerra
// a conexão (HTTP 502/504) — o cliente via "falha" sem explicação. E o limite
// diário era gravado ANTES do envio: uma falha bloqueava o dia inteiro.
//
// ⭐ Limite: UM backup concluído por clínica por dia. Só conta depois que o
// arquivo foi entregue por completo. O super admin não tem esse limite.
// O arquivo pronto fica no servidor por até 2 horas (para tentar de novo o
// download sem gerar outro) e é apagado assim que é entregue.

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const router = express.Router();
const backup = require('../services/backupClinica');
const { exigirAdminDaClinica } = require('../services/adminClinica');

// Pasta de montagem: BACKUP_TEMP_DIR permite usar um disco maior que o /tmp
const PASTA_TEMP = process.env.BACKUP_TEMP_DIR || path.join(os.tmpdir(), 'easyclin-backup-cliente');
const VALIDADE_MS = 2 * 60 * 60 * 1000;
/** "gerando" sem nenhuma atualização por este tempo = processo morreu/reiniciou */
const SEM_SINAL_MS = 3 * 60 * 1000;

/**
 * clinicaId → { estado: 'gerando'|'pronto'|'erro', iniciadoEm, atualizadoEm, prontoEm,
 *   arquivo, tamanho, caminho, erro, progresso }
 *
 * ⭐ O estado também é gravado em disco (estado_<clínica>.json). Com o
 * servidor em vários processos (PM2 cluster), a consulta de andamento pode
 * cair em outro processo: em memória ele nunca via o backup e a tela ficava
 * esperando para sempre.
 */
const trabalhos = new Map();

/** Quando ESTE processo do servidor começou (detecta reinício no meio do backup) */
const PROCESSO_INICIADO_EM = new Date(Date.now() - process.uptime() * 1000).toISOString();
/** Vários processos (PM2 cluster): não dá para concluir que o outro morreu só pela data */
const EM_CLUSTER = process.env.NODE_APP_INSTANCE !== undefined || require('cluster').isWorker;
const ARQUIVO_ENCERRAMENTO = path.join(PASTA_TEMP, 'ultimo_encerramento.json');

function arquivoEstado(clinicaId) {
  return path.join(PASTA_TEMP, `estado_${backup.nomePasta(clinicaId)}.json`);
}

const chaveTrabalho = (clinicaId) => `backup_cliente_trabalho_${clinicaId}`;

/**
 * Grava o andamento em DOIS lugares:
 *  • arquivo (gravação atômica: arquivo temporário + rename — um leitor
 *    nunca encontra o arquivo pela metade, o que antes virava "sem backup");
 *  • banco (configuracoes_globais) — vale mesmo se o disco temporário não
 *    aceitar gravação ou cada processo enxergar um /tmp diferente.
 */
function salvarEstado(clinicaId, t) {
  try {
    fs.mkdirSync(PASTA_TEMP, { recursive: true });
    const destino = arquivoEstado(clinicaId);
    const temporario = `${destino}.${process.pid}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(t));
    fs.renameSync(temporario, destino);
  } catch (err) {
    console.error(`💾 ⚠️ [backup-cliente] Estado não gravado em disco: ${err.message}`);
  }
  backup.gravarChave(chaveTrabalho(clinicaId), t).catch((err) => {
    console.error(`💾 ⚠️ [backup-cliente] Estado não gravado no banco: ${err.message}`);
  });
}

function removerEstado(clinicaId) {
  fs.unlink(arquivoEstado(clinicaId), () => {});
  backup.gravarChave(chaveTrabalho(clinicaId), null).catch(() => {});
}

function lerArquivoEstado(clinicaId) {
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      return JSON.parse(fs.readFileSync(arquivoEstado(clinicaId), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
    }
  }
  return null;
}

/** Último encerramento registrado do servidor (sinal recebido, horário, memória) */
function lerEncerramento() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_ENCERRAMENTO, 'utf8'));
  } catch {
    return null;
  }
}

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Explica por que o backup foi interrompido, com o que se sabe do reinício */
function motivoReinicio(t) {
  const partes = [`O servidor foi reiniciado às ${hora(PROCESSO_INICIADO_EM)}, no meio do backup (iniciado às ${hora(t.iniciadoEm)}).`];
  const enc = lerEncerramento();
  if (enc && new Date(enc.em) >= new Date(t.iniciadoEm)) {
    partes.push(
      enc.sinal ?
      `Ele recebeu o comando de parar (${enc.sinal}) às ${hora(enc.em)} — reinício manual, deploy, PM2 ou nodemon.` :
      `Ele encerrou às ${hora(enc.em)} (código ${enc.codigo}).`
    );
  } else if (t.memoriaMb) {
    partes.push(`Não houve comando de parar: o processo caiu. Último uso de memória registrado: ${t.memoriaMb} MB — se o PM2 tem "max_memory_restart" abaixo disso, foi ele.`);
  }
  return partes.join(' ');
}

/** Estado atual: memória deste processo, arquivo ou banco (gravados por qualquer processo) */
async function lerTrabalho(clinicaId) {
  let t = trabalhos.get(clinicaId) || lerArquivoEstado(clinicaId);
  if (!t) t = await backup.lerChave(chaveTrabalho(clinicaId), null);
  if (!t) return null;
  if (t.estado === 'gerando' && !trabalhos.has(clinicaId)) {
    const ultimo = new Date(t.atualizadoEm || t.iniciadoEm).getTime();
    // O processo que gerava é anterior a este e não há outros processos: morreu.
    const processoAnterior =
    !EM_CLUSTER && t.processoIniciadoEm && new Date(t.processoIniciadoEm) < new Date(PROCESSO_INICIADO_EM);
    if (processoAnterior || t.pid === process.pid || Date.now() - ultimo > SEM_SINAL_MS) {
      t = {
        ...t,
        estado: 'erro',
        codigo: 'SERVIDOR_REINICIADO',
        prontoEm: new Date().toISOString(),
        erro: motivoReinicio(t)
      };
      salvarEstado(clinicaId, t);
    }
  }
  return t;
}

/**
 * Registra COMO o servidor encerrou. Sem isso, "o servidor reiniciou" não
 * dizia se foi deploy, PM2, nodemon ou queda por memória.
 */
function registrarEncerramento(dados) {
  try {
    fs.mkdirSync(PASTA_TEMP, { recursive: true });
    const gerando = [...trabalhos.entries()].filter(([, t]) => t.estado === 'gerando').map(([id]) => id);
    fs.writeFileSync(
      ARQUIVO_ENCERRAMENTO,
      JSON.stringify({ ...dados, em: new Date().toISOString(), pid: process.pid, memoriaMb: Math.round(process.memoryUsage().rss / 1048576), backupsEmAndamento: gerando })
    );
    if (gerando.length) console.error(`💾 ❌ [backup-cliente] Servidor encerrando com backup em andamento: ${gerando.join(', ')}`);
  } catch {

    // sem disco: nada a registrar
  }}
for (const sinal of ['SIGTERM', 'SIGINT', 'SIGUSR2']) {
  // Só assume o sinal se ninguém mais trata — e mantém o encerramento normal
  if (process.listenerCount(sinal) === 0) {
    process.once(sinal, () => {
      registrarEncerramento({ sinal });
      process.kill(process.pid, sinal);
    });
  }
}
process.on('exit', (codigo) => {
  const enc = lerEncerramento();
  // Não sobrescreve o registro do sinal feito há pouco
  if (!enc || enc.pid !== process.pid || Date.now() - new Date(enc.em).getTime() > 5000) registrarEncerramento({ codigo });
});

function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const chave = (clinicaId) => `backup_cliente_${clinicaId}`;

function apagar(caminho) {
  if (caminho) fs.unlink(caminho, () => {});
}

/** Remove arquivos prontos que ninguém baixou */
function limparVencidos() {
  const agora = Date.now();
  // Estados gravados em disco (inclusive de outros processos)
  try {
    for (const nome of fs.readdirSync(PASTA_TEMP)) {
      if (!/^estado_.+\.json$/.test(nome)) continue;
      const caminho = path.join(PASTA_TEMP, nome);
      try {
        const t = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        const referencia = new Date(t.prontoEm || t.atualizadoEm || t.iniciadoEm).getTime();
        if (t.estado !== 'gerando' && agora - referencia > VALIDADE_MS) {
          apagar(t.caminho);
          apagar(caminho);
        }
      } catch {
        apagar(caminho);
      }
    }
  } catch {

    // pasta ainda não existe
  }for (const [clinicaId, t] of trabalhos) {
    const referencia = new Date(t.prontoEm || t.iniciadoEm).getTime();
    if (t.estado !== 'gerando' && agora - referencia > VALIDADE_MS) {
      apagar(t.caminho);
      trabalhos.delete(clinicaId);
      removerEstado(clinicaId);
    }
  }
}
setInterval(limparVencidos, 10 * 60 * 1000).unref();

/** O que o navegador precisa saber do andamento (sem caminho interno) */
function publico(t) {
  if (!t) return null;
  return {
    estado: t.estado,
    iniciadoEm: t.iniciadoEm,
    atualizadoEm: t.atualizadoEm || t.iniciadoEm,
    prontoEm: t.prontoEm || null,
    arquivo: t.arquivo || null,
    tamanho: t.tamanho || null,
    erro: t.erro || null,
    codigo: t.codigo || null,
    progresso: t.progresso || null
  };
}

/** Traduz falhas do banco/disco para algo que o administrador entende */
function motivoLegivel(err) {
  const msg = String(err && err.message || err || '');
  if (/ENOSPC/i.test(msg)) return 'O servidor ficou sem espaço em disco para montar o backup. Avise o suporte.';
  if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|Too many connections/i.test(msg)) {
    return 'O servidor não conseguiu acessar o banco de dados agora. Tente de novo em alguns minutos.';
  }
  if (/parou de avançar/i.test(msg)) return `${msg} Tente de novo fora do horário de maior movimento; se repetir, avise o suporte.`;
  if (/não existe|not exist|Unknown database/i.test(msg)) return 'O banco de dados desta clínica não foi encontrado no servidor. Avise o suporte.';
  if (/Clínica não encontrada/i.test(msg)) return 'Clínica não encontrada.';
  return `O servidor não conseguiu gerar o backup: ${msg}`;
}

/**
 * Rotas assíncronas: o Express 4 não captura erros de funções async. Sem
 * isto, uma falha (banco fora, permissão) deixava a requisição sem resposta
 * — a tela esperava até estourar o tempo — ou derrubava o processo.
 */
const seguro = (fn) => (req, res, next) =>
Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(`💾 ❌ [backup-cliente] ${req.path}: ${err && err.stack ? err.stack : err}`);
  if (!res.headersSent) res.status(500).json({ codigo: 'ERRO_INTERNO', error: motivoLegivel(err) });
});

async function jaFeitoHoje(usuario, clinicaId) {
  if (usuario.tipo === 'super_admin') return null;
  const anterior = await backup.lerChave(chave(clinicaId), null);
  return anterior && anterior.data === hoje() ? anterior : null;
}

router.get('/status', seguro(async (req, res) => {
  const clinicaId = String(req.query.clinicaId || '');
  const usuario = await exigirAdminDaClinica(req, res, clinicaId);
  if (!usuario) return;
  limparVencidos();
  const ultimo = await backup.lerChave(chave(clinicaId), null);
  res.json({
    ultimo,
    hoje: hoje(),
    podeHoje: usuario.tipo === 'super_admin' || !ultimo || ultimo.data !== hoje(),
    trabalho: publico(await lerTrabalho(clinicaId))
  });
}));

router.get('/preparar', seguro(async (req, res) => {
  const clinicaId = String(req.query.clinicaId || '');
  const usuario = await exigirAdminDaClinica(req, res, clinicaId);
  if (!usuario) return;
  limparVencidos();

  const feito = await jaFeitoHoje(usuario, clinicaId);
  if (feito) {
    return res.status(429).json({
      codigo: 'LIMITE_DIARIO',
      error: `O backup de hoje já foi feito às ${new Date(feito.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${feito.usuarioNome ? ` por ${feito.usuarioNome}` : ''}. O próximo pode ser feito amanhã.`,
      ultimo: feito
    });
  }

  const atual = await lerTrabalho(clinicaId);
  // Já gerando ou já pronto (com o arquivo ainda lá): reaproveita
  const arquivoOk = atual && atual.estado === 'pronto' && atual.caminho && fs.existsSync(atual.caminho);
  if (atual && (atual.estado === 'gerando' || arquivoOk)) return res.json({ trabalho: publico(atual) });

  const agora = new Date().toISOString();
  const memoriaMb = () => Math.round(process.memoryUsage().rss / 1048576);
  const trabalho = {
    estado: 'gerando',
    iniciadoEm: agora,
    atualizadoEm: agora,
    usuarioId: usuario.id,
    progresso: null,
    pid: process.pid,
    processoIniciadoEm: PROCESSO_INICIADO_EM,
    memoriaMb: memoriaMb()
  };
  trabalhos.set(clinicaId, trabalho);
  salvarEstado(clinicaId, trabalho);
  res.json({ trabalho: publico(trabalho) });

  // Gera em segundo plano — a resposta acima já foi enviada.
  // O progresso é gravado no máximo a cada 2s (e sempre na troca de tabela).
  let ultimaGravacao = 0;
  let ultimaTabela = '';
  const aoProgresso = (p) => {
    trabalho.progresso = p;
    trabalho.atualizadoEm = new Date().toISOString();
    if (Date.now() - ultimaGravacao > 2000 || p.tabela !== ultimaTabela) {
      trabalho.memoriaMb = memoriaMb();
      ultimaGravacao = Date.now();
      ultimaTabela = p.tabela;
      salvarEstado(clinicaId, trabalho);
    }
  };
  // Sinal de vida mesmo durante uma consulta longa, para não parecer processo morto
  const pulso = setInterval(() => {
    trabalho.atualizadoEm = new Date().toISOString();
    trabalho.memoriaMb = memoriaMb();
    salvarEstado(clinicaId, trabalho);
  }, 30000);
  pulso.unref();

  try {
    fs.mkdirSync(PASTA_TEMP, { recursive: true });
    const resultado = await backup.gerarBackupClinica(clinicaId, PASTA_TEMP, 'cliente', aoProgresso);
    Object.assign(trabalho, {
      estado: 'pronto',
      prontoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      arquivo: resultado.arquivo,
      tamanho: resultado.tamanho,
      caminho: path.join(PASTA_TEMP, backup.nomePasta(clinicaId), resultado.arquivo)
    });
  } catch (err) {
    console.error(`💾 ❌ [backup-cliente] ${clinicaId}: ${err.message}`);
    Object.assign(trabalho, {
      estado: 'erro',
      prontoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      erro: err.status === 409 ? 'Já existe um backup desta clínica sendo gerado. Aguarde alguns minutos e tente de novo.' : motivoLegivel(err)
    });
  } finally {
    clearInterval(pulso);
    salvarEstado(clinicaId, trabalho);
    // ⭐ Continua em memória até ser baixado ou vencer. Antes era apagado
    // aqui: se o arquivo de estado não fosse gravado, a consulta seguinte não
    // achava nada e a tela dizia "o servidor reiniciou" — escondendo o
    // resultado real (pronto ou o erro verdadeiro).
  }
}));

router.get('/baixar', seguro(async (req, res) => {
  const clinicaId = String(req.query.clinicaId || '');
  const usuario = await exigirAdminDaClinica(req, res, clinicaId);
  if (!usuario) return;

  const trabalho = await lerTrabalho(clinicaId);
  if (!trabalho || trabalho.estado !== 'pronto' || !trabalho.caminho || !fs.existsSync(trabalho.caminho)) {
    if (trabalho && trabalho.estado === 'pronto') {
      trabalhos.delete(clinicaId);
      removerEstado(clinicaId);
    }
    return res.status(404).json({
      codigo: 'NAO_PREPARADO',
      error: 'O arquivo do backup não está mais disponível no servidor. Faça o backup de novo.'
    });
  }

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Length', String(trabalho.tamanho));
  res.setHeader('X-Backup-Arquivo', trabalho.arquivo);
  res.setHeader('Access-Control-Expose-Headers', 'X-Backup-Arquivo, Content-Length');
  res.setHeader('Content-Disposition', `attachment; filename="${trabalho.arquivo}"`);

  const leitura = fs.createReadStream(trabalho.caminho);
  leitura.on('error', (err) => {
    console.error(`💾 ❌ [backup-cliente] Envio: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'Falha ao ler o arquivo do backup no servidor.' });else
    res.destroy(err);
  });

  // ⭐ Só depois da entrega COMPLETA: conta no limite diário e apaga o arquivo.
  // Se a conexão cair no meio, o arquivo continua pronto para nova tentativa.
  res.on('finish', async () => {
    try {
      if (usuario.tipo !== 'super_admin') {
        await backup.gravarChave(chave(clinicaId), {
          data: hoje(),
          em: new Date().toISOString(),
          arquivo: trabalho.arquivo,
          tamanho: trabalho.tamanho,
          usuarioId: usuario.id,
          usuarioNome: usuario.nome
        });
      }
    } catch (err) {
      console.error(`💾 ⚠️ [backup-cliente] Registro do backup: ${err.message}`);
    }
    apagar(trabalho.caminho);
    trabalhos.delete(clinicaId);
    removerEstado(clinicaId);
  });

  leitura.pipe(res);
}));

// Compatibilidade com telas antigas ainda abertas: gera e entrega numa chamada só
router.get('/gerar', (req, res) => {
  res.status(410).json({
    codigo: 'ATUALIZAR_PAGINA',
    error: 'O sistema foi atualizado. Recarregue a página (F5) e faça o backup de novo.'
  });
});

module.exports = router;