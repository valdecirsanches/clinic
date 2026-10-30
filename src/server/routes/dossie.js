// ==================== DOSSIÊ DE CONFIGURAÇÃO (SUPER ADMIN) ====================
// Retrato completo de como esta instalação está configurada: banco MySQL,
// ambiente do servidor, integrações e inventário de clínicas/bancos.
//
// ⚠️ SEGREDOS NUNCA SÃO DEVOLVIDOS. Senha do MySQL, tokens e chaves de API
// aparecem apenas como "definido / não definido" (e, quando ajuda no suporte,
// os 4 últimos caracteres). Um dossiê que vaza credencial deixa de ser
// diagnóstico e passa a ser risco.
//
// A autorização é verificada NO SERVIDOR contra a tabela `usuarios`: o sistema
// não tem middleware de autenticação, e confiar no "tipo" enviado pelo
// navegador tornaria esta rota pública na prática.

const express = require('express');
const mysql = require('mysql2');
const os = require('os');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const dbGlobal = require('../databaseGlobal');
const {
  MYSQL_CONFIG,
  GLOBAL_DB_NAME,
  getClinicaDbName
} = require('../config/mysql');

// ==================== AUTORIZAÇÃO ====================

async function exigirSuperAdmin(req, res) {
  const usuarioId = String(
    req.query.usuarioId || req.body?.usuarioId || ''
  ).trim();
  if (!usuarioId) {
    res.status(400).json({ error: 'usuarioId é obrigatório.' });
    return null;
  }
  try {
    const usuario = await dbGlobal.
    prepare('SELECT id, nome, email, tipo, ativo FROM usuarios WHERE id = ?').
    get(usuarioId);
    if (!usuario || !usuario.ativo || usuario.tipo !== 'super_admin') {
      res.
      status(403).
      json({ error: 'Acesso restrito ao super administrador.' });
      return null;
    }
    return usuario;
  } catch (err) {
    res.status(500).json({ error: err.message });
    return null;
  }
}

// ==================== HELPERS ====================

/** Mostra que o segredo existe, sem revelá-lo. */
function marcarSegredo(valor) {
  const texto = String(valor || '');
  if (!texto) return { definido: false, tamanho: 0, final: '' };
  return {
    definido: true,
    tamanho: texto.length,
    final: texto.length > 4 ? `...${texto.slice(-4)}` : '****'
  };
}

function segundosParaTexto(segundos) {
  const s = Math.floor(segundos);
  const d = Math.floor(s / 86400);
  const h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60);
  if (d) return `${d}d ${h}h ${m}min`;
  if (h) return `${h}h ${m}min`;
  return `${m}min`;
}

async function consultar(sql, params = []) {
  return dbGlobal.prepare(sql).all(...params);
}

/**
 * Estado real da conexão: versão do MySQL, uptime e tamanho dos bancos.
 * Usa um pool próprio SEM database para poder ler information_schema por
 * inteiro (o pool global está preso ao banco global).
 */
async function inspecionarMysql() {
  const info = {
    host: MYSQL_CONFIG.host,
    porta: MYSQL_CONFIG.port,
    usuario: MYSQL_CONFIG.user,
    senha: marcarSegredo(MYSQL_CONFIG.password),
    bancoGlobal: GLOBAL_DB_NAME,
    charset: MYSQL_CONFIG.charset,
    limiteConexoes: MYSQL_CONFIG.connectionLimit,
    timeoutConexao: MYSQL_CONFIG.connectTimeout,
    conectado: false
  };

  let pool = null;
  try {
    pool = mysql.
    createPool({ ...MYSQL_CONFIG, database: undefined, connectionLimit: 2 }).
    promise();

    const [versao] = await pool.query(
      "SELECT VERSION() AS versao, @@hostname AS hostname, @@port AS porta, @@character_set_server AS charset, @@max_connections AS maxConexoes"
    );
    const [uptime] = await pool.query(
      "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Queries')"
    );
    const [bancos] = await pool.query(
      `SELECT table_schema AS banco,
              COUNT(*) AS tabelas,
              ROUND(SUM(data_length + index_length) / 1048576, 2) AS mb
         FROM information_schema.tables
        WHERE table_schema LIKE 'easyclin%'
        GROUP BY table_schema
        ORDER BY table_schema`
    );

    const status = {};
    (uptime || []).forEach((r) => {
      status[r.Variable_name] = r.Value;
    });

    info.conectado = true;
    info.versao = versao?.[0]?.versao || null;
    info.hostnameServidor = versao?.[0]?.hostname || null;
    info.portaEfetiva = versao?.[0]?.porta || null;
    info.charsetServidor = versao?.[0]?.charset || null;
    info.maxConexoes = versao?.[0]?.maxConexoes || null;
    info.uptime = status.Uptime ? segundosParaTexto(Number(status.Uptime)) : null;
    info.conexoesAtivas = status.Threads_connected || null;
    info.consultasDesdeStart = status.Queries || null;
    info.bancos = (bancos || []).map((b) => ({
      banco: b.banco,
      tabelas: Number(b.tabelas),
      mb: Number(b.mb || 0)
    }));
    info.totalMb = info.bancos.reduce((t, b) => t + b.mb, 0);
  } catch (err) {
    info.erro = err.message;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (_) {

        /* pool já encerrado */}
    }
  }
  return info;
}

/** Variáveis de ambiente lidas pelo servidor, agrupadas por assunto. */
function inspecionarAmbiente() {
  const publico = (nome) => ({
    nome,
    valor: process.env[nome] || null,
    definido: Boolean(process.env[nome])
  });
  const secreto = (nome) => ({
    nome,
    ...marcarSegredo(process.env[nome])
  });

  return {
    servidor: {
      node: process.version,
      plataforma: `${os.type()} ${os.release()} (${process.arch})`,
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memoriaTotalMb: Math.round(os.totalmem() / 1048576),
      memoriaLivreMb: Math.round(os.freemem() / 1048576),
      memoriaProcessoMb: Math.round(process.memoryUsage().rss / 1048576),
      uptimeProcesso: segundosParaTexto(process.uptime()),
      uptimeMaquina: segundosParaTexto(os.uptime()),
      porta: process.env.PORT || '5171',
      diretorio: process.cwd(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      horaServidor: new Date().toISOString()
    },
    grupos: [
    {
      titulo: 'Banco de dados',
      vars: [
      publico('MYSQL_HOST'),
      publico('MYSQL_PORT'),
      publico('MYSQL_USER'),
      secreto('MYSQL_PASSWORD'),
      publico('MYSQL_GLOBAL_DB')]

    },
    {
      titulo: 'Endereços públicos',
      vars: [
      publico('PUBLIC_API_URL'),
      publico('APP_URL'),
      publico('SERVER_DB'),
      publico('API_URL'),
      publico('CLOUD_STORAGE_URL')]

    },
    {
      titulo: 'WhatsApp oficial (Meta)',
      vars: [
      publico('META_APP_ID'),
      secreto('META_APP_SECRET'),
      publico('META_EMBEDDED_SIGNUP_CONFIG_ID'),
      publico('META_API_VERSION'),
      publico('META_CREDIT_LINE_ID'),
      secreto('META_PARTNER_TOKEN'),
      secreto('META_WEBHOOK_VERIFY_TOKEN')]

    },
    {
      titulo: 'WhatsApp (WAHA)',
      vars: [secreto('WAHA_API_KEY'), secreto('VITE_WAHA_API_KEY')]
    },
    {
      titulo: 'Consulta online (LiveKit / BBB)',
      vars: [
      publico('LIVEKIT_URL'),
      publico('LIVEKIT_API_KEY'),
      secreto('LIVEKIT_API_SECRET'),
      publico('BBB_URL'),
      secreto('BBB_SECRET'),
      publico('VIDEO_FALLBACK_URL')]

    },
    {
      titulo: 'Ponto / biometria',
      vars: [
      publico('BIOMETRIA_WS_URL'),
      publico('BIOMETRIA_WS_TIMEOUT'),
      publico('BIOMETRIA_NUM_AMOSTRAS'),
      publico('BIOMETRIA_PONTO_INTERVALO'),
      publico('BIOMETRIA_PONTO_LISTENER')]

    },
    {
      titulo: 'Outros',
      vars: [secreto('PRINTSERVER_TOKEN'), publico('DEBUG_SERVER')]
    }]

  };
}

/** Qual arquivo .env o servidor realmente carregou. */
function localizarEnv() {
  const candidatos = [
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'server', '.env.local'),
  path.join(process.cwd(), '..', '.env.local')];

  return candidatos.map((arquivo) => {
    let existe = false;
    let atualizadoEm = null;
    try {
      const st = fs.statSync(arquivo);
      existe = true;
      atualizadoEm = st.mtime.toISOString();
    } catch (_) {

      /* arquivo ausente */}
    return { arquivo, existe, atualizadoEm };
  });
}

/** Estado das integrações, clínica por clínica. */
async function inspecionarIntegracoes() {
  const resultado = {
    clinicas: [],
    chavesConfig: [],
    erros: []
  };

  let clinicas = [];
  try {
    clinicas = await consultar(
      'SELECT id, nome, ativa FROM clinicas ORDER BY nome'
    );
  } catch (err) {
    resultado.erros.push(`clinicas: ${err.message}`);
    return resultado;
  }

  // Configs em tabelas dedicadas
  let waha = [];
  let meta = [];
  let sms = [];
  try {
    waha = await consultar('SELECT * FROM whatsapp_config');
  } catch (err) {
    resultado.erros.push(`whatsapp_config: ${err.message}`);
  }
  try {
    meta = await consultar('SELECT * FROM whatsapp_meta_config');
  } catch (err) {
    resultado.erros.push(`whatsapp_meta_config: ${err.message}`);
  }
  try {
    sms = await consultar('SELECT * FROM sms_config');
  } catch (err) {
    resultado.erros.push(`sms_config: ${err.message}`);
  }

  // Configs em chave/valor (aniversário, preços, banco etc.)
  try {
    const chaves = await consultar(
      'SELECT chave, atualizadoEm, CHAR_LENGTH(valor) AS tamanho FROM configuracoes_globais ORDER BY chave'
    );
    resultado.chavesConfig = (chaves || []).map((c) => ({
      chave: c.chave,
      tamanho: Number(c.tamanho || 0),
      atualizadoEm: c.atualizadoEm || null
    }));
  } catch (err) {
    resultado.erros.push(`configuracoes_globais: ${err.message}`);
  }

  const porClinica = (lista, id) =>
  (lista || []).find((r) => String(r.clinicaId) === String(id));

  resultado.clinicas = clinicas.map((c) => {
    const w = porClinica(waha, c.id);
    const m = porClinica(meta, c.id);
    const s = porClinica(sms, c.id);
    let templatesMeta = 0;
    try {
      const t = m?.templates ? JSON.parse(m.templates) : {};
      templatesMeta = Object.values(t || {}).filter(
        (v) => v && v.name
      ).length;
    } catch (_) {
      templatesMeta = 0;
    }
    return {
      id: c.id,
      nome: c.nome,
      ativa: Boolean(c.ativa),
      banco: getClinicaDbName(c.id),
      waha: w ?
      {
        configurado: true,
        ativo: Boolean(Number(w.ativo)),
        sessao: w.sessionName || w.sessao || null,
        url: w.apiUrl || w.url || null
      } :
      { configurado: false },
      meta: m ?
      {
        configurado: Boolean(m.phoneNumberId),
        ativo: Boolean(Number(m.ativo)),
        preferencial: Boolean(Number(m.preferencial)),
        numero: m.numeroExibicao || null,
        phoneNumberId: m.phoneNumberId || null,
        wabaId: m.wabaId || null,
        apiVersion: m.apiVersion || null,
        token: marcarSegredo(m.accessToken),
        templatesVinculados: templatesMeta
      } :
      { configurado: false },
      sms: s ?
      {
        configurado: Boolean(s.apiKey || s.bearerToken),
        ativo: Boolean(Number(s.ativo)),
        remetente: s.remetente || null,
        usarComoFallback: Boolean(Number(s.usarComoFallback)),
        apiUrl: s.apiUrl || null,
        chave: marcarSegredo(s.apiKey)
      } :
      { configurado: false }
    };
  });

  return resultado;
}

/** Contagens que dizem o tamanho real da instalação. */
async function inspecionarInventario() {
  const contar = async (tabela) => {
    try {
      const r = await dbGlobal.
      prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).
      get();
      return Number(r?.total || 0);
    } catch (_) {
      return null;
    }
  };
  return {
    operadoras: await contar('operadoras'),
    clinicas: await contar('clinicas'),
    usuarios: await contar('usuarios'),
    pacientes: await contar('pacientes'),
    consultas: await contar('consultas'),
    especialidades: await contar('especialidades'),
    procedimentos: await contar('procedimentos'),
    planos: await contar('planos')
  };
}

// ==================== ROTAS ====================

/**
 * GET /api/dossie?usuarioId=...
 * Dossiê completo em JSON (consumido pela tela).
 */
router.get('/', async (req, res) => {
  const usuario = await exigirSuperAdmin(req, res);
  if (!usuario) return;
  try {
    const [mysqlInfo, integracoes, inventario] = await Promise.all([
    inspecionarMysql(),
    inspecionarIntegracoes(),
    inspecionarInventario()]
    );
    res.json({
      geradoEm: new Date().toISOString(),
      geradoPor: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      mysql: mysqlInfo,
      ambiente: inspecionarAmbiente(),
      arquivosEnv: localizarEnv(),
      integracoes,
      inventario
    });
  } catch (err) {
    console.error('❌ [DOSSIE]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dossie/texto?usuarioId=...
 * Mesma informação em texto puro, para colar em um ticket de suporte.
 */
router.get('/texto', async (req, res) => {
  const usuario = await exigirSuperAdmin(req, res);
  if (!usuario) return;
  try {
    const [m, integracoes, inventario] = await Promise.all([
    inspecionarMysql(),
    inspecionarIntegracoes(),
    inspecionarInventario()]
    );
    const amb = inspecionarAmbiente();
    const L = [];
    L.push('=== DOSSIÊ DE CONFIGURAÇÃO ===');
    L.push(`gerado em   : ${new Date().toISOString()}`);
    L.push(`gerado por  : ${usuario.nome} (${usuario.email})`);
    L.push('');
    L.push('--- MYSQL ---');
    L.push(`host:porta  : ${m.host}:${m.porta}`);
    L.push(`usuário     : ${m.usuario}`);
    L.push(`senha       : ${m.senha.definido ? `definida (${m.senha.tamanho} chars)` : 'NÃO DEFINIDA'}`);
    L.push(`banco global: ${m.bancoGlobal}`);
    L.push(`conectado   : ${m.conectado ? 'SIM' : `NÃO — ${m.erro || 'sem detalhe'}`}`);
    if (m.conectado) {
      L.push(`versão      : ${m.versao} (uptime ${m.uptime})`);
      L.push(`conexões    : ${m.conexoesAtivas} ativas / máx ${m.maxConexoes}`);
      L.push(`bancos      : ${m.bancos.length} · ${m.totalMb.toFixed(2)} MB`);
      m.bancos.forEach((b) =>
      L.push(`  ${b.banco} — ${b.tabelas} tabelas, ${b.mb} MB`)
      );
    }
    L.push('');
    L.push('--- SERVIDOR ---');
    Object.entries(amb.servidor).forEach(([k, v]) => L.push(`${k.padEnd(20)}: ${v}`));
    L.push('');
    L.push('--- VARIÁVEIS DE AMBIENTE ---');
    amb.grupos.forEach((g) => {
      L.push(`[${g.titulo}]`);
      g.vars.forEach((v) => {
        const estado =
        'valor' in v ?
        v.definido ?
        v.valor :
        '(não definida)' :
        v.definido ?
        `definido (${v.tamanho} chars, ${v.final})` :
        '(não definido)';
        L.push(`  ${v.nome.padEnd(34)} = ${estado}`);
      });
    });
    L.push('');
    L.push('--- ARQUIVOS .ENV ---');
    localizarEnv().forEach((a) =>
    L.push(`  ${a.existe ? '✔' : '✘'} ${a.arquivo}${a.existe ? ` (${a.atualizadoEm})` : ''}`)
    );
    L.push('');
    L.push('--- INVENTÁRIO GLOBAL ---');
    Object.entries(inventario).forEach(([k, v]) =>
    L.push(`  ${k.padEnd(16)}: ${v === null ? 'tabela ausente' : v}`)
    );
    L.push('');
    L.push(`--- INTEGRAÇÕES POR CLÍNICA (${integracoes.clinicas.length}) ---`);
    integracoes.clinicas.forEach((c) => {
      L.push(`\n${c.nome} (${c.id})${c.ativa ? '' : ' [INATIVA]'}`);
      L.push(`  banco : ${c.banco}`);
      L.push(
        `  WAHA  : ${c.waha.configurado ? `${c.waha.ativo ? 'ativo' : 'inativo'} · sessão ${c.waha.sessao || '—'}` : 'não configurado'}`
      );
      L.push(
        `  Meta  : ${c.meta.configurado ? `${c.meta.ativo ? 'ativo' : 'inativo'} · ${c.meta.numero || 's/ número'} · ${c.meta.templatesVinculados} template(s)` : 'não configurado'}`
      );
      L.push(
        `  SMS   : ${c.sms.configurado ? `${c.sms.ativo ? 'ativo' : 'inativo'} · remetente ${c.sms.remetente || '—'}` : 'não configurado'}`
      );
    });
    if (integracoes.chavesConfig.length) {
      L.push('');
      L.push('--- CHAVES EM configuracoes_globais ---');
      integracoes.chavesConfig.forEach((c) =>
      L.push(`  ${c.chave.padEnd(44)} ${String(c.tamanho).padStart(7)} chars  ${c.atualizadoEm || ''}`)
      );
    }
    if (integracoes.erros.length) {
      L.push('');
      L.push('--- LEITURAS QUE FALHARAM ---');
      integracoes.erros.forEach((e) => L.push(`  ${e}`));
    }
    L.push('');
    L.push('OBS: senhas, tokens e chaves nunca são exibidos — apenas se estão definidos.');
    res.type('text/plain; charset=utf-8').send(L.join('\n'));
  } catch (err) {
    console.error('❌ [DOSSIE/texto]', err);
    res.status(500).type('text/plain').send(`Erro: ${err.message}`);
  }
});

module.exports = router;