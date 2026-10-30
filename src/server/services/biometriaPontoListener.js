
// ==================== LISTENER PERSISTENTE DE PONTO (BiometriaDigitalPersona) ====================
// O app WPF (WebSocketConnectionManager) faz BROADCAST do evento `ponto_marcado`
// para TODOS os clientes conectados quando um funcionário encosta o dedo no leitor
// em modo comparação. O problema: o backend só abria o WebSocket durante uma
// chamada /cadastro e fechava logo em seguida — então nenhum `ponto_marcado` era
// recebido e o ponto NÃO era gravado.
//
// Este serviço mantém UMA conexão persistente com o leitor (com reconexão
// automática) e, ao receber `ponto_marcado`, registra o ponto na tabela
// `ponto_biometrico` da clínica informada pelo app (alternância entrada/saída).

const WebSocket = require('ws');
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

const BIOMETRIA_WS_URL = process.env.BIOMETRIA_WS_URL || 'ws://localhost:5555';
// Intervalo mínimo entre marcações do mesmo funcionário (anti-rebote), em segundos.
const INTERVALO_MINIMO_SEG = parseInt(process.env.BIOMETRIA_PONTO_INTERVALO || '60', 10);
// Tempo de espera antes de tentar reconectar ao leitor (ms).
const RECONNECT_MS = parseInt(process.env.BIOMETRIA_RECONNECT_MS || '15000', 10);

const montarWsUrl = () => {
  let base = BIOMETRIA_WS_URL.replace(/\/+$/, '');
  if (!/\/biometria$/i.test(base)) base += '/biometria';
  return base;
};

const promisify = (db, metodo, sql, params = []) =>
new Promise((resolve, reject) => {
  db[metodo](sql, params, (err, resultado) => {
    if (err) reject(err);else resolve(resultado);
  });
});

const _pontoTabelaOk = new Set();
const garantirTabelaPonto = async (db, clinicaId) => {
  const chave = clinicaId || 'default';
  if (_pontoTabelaOk.has(chave)) return;
  try {
    await promisify(
      db,
      'run',
      `CREATE TABLE IF NOT EXISTS ponto_biometrico (
        id VARCHAR(191) PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL,
        usuarioNome VARCHAR(255),
        tipo VARCHAR(20) NOT NULL,
        dataHora VARCHAR(50) NOT NULL,
        dia VARCHAR(20) NOT NULL,
        origem VARCHAR(50) DEFAULT 'biometria',
        biometriaId VARCHAR(191),
        confianca FLOAT,
        observacoes TEXT,
        almoco TINYINT DEFAULT 0,
        criadoEm VARCHAR(50) NOT NULL,
        INDEX idx_ponto_usuario (usuarioId),
        INDEX idx_ponto_dia (dia),
        INDEX idx_ponto_tipo (tipo)
      )`
    );
    _pontoTabelaOk.add(chave);
  } catch (err) {
    console.error('❌ [biometria-ponto] Erro ao garantir tabela ponto_biometrico:', err.message);
  }
};

// Registra um ponto a partir de um evento `ponto_marcado` do leitor.
// payload: { funcionarioId | usuarioId | biometriaId, clinicaId?, score?, tipo? }
const registrarPonto = async (payload) => {
  const funcionarioId = payload.funcionarioId || payload.usuarioId;
  const biometriaId = payload.biometriaId || null;
  let clinicaId = payload.clinicaId || payload.clinica_id;
  const confianca = payload.score != null ? Number(payload.score) : null;

  // Resolve o funcionário (por id direto, ou pela digital via tabela biometrias).
  let usuario;
  if (funcionarioId) {
    usuario = await dbGlobal.
    prepare('SELECT id, nome, clinicaId FROM usuarios WHERE id = ?').
    get(funcionarioId);
  } else if (biometriaId) {
    usuario = await dbGlobal.
    prepare(
      `SELECT u.id, u.nome, u.clinicaId
           FROM usuarios u JOIN biometrias b ON b.usuarioId = u.id
          WHERE b.biometriaId = ?`
    ).
    get(biometriaId);
  }
  if (!usuario) {
    console.warn('⚠️ [biometria-ponto] ponto_marcado sem funcionário resolvível:', JSON.stringify(payload));
    return;
  }

  clinicaId = clinicaId || usuario.clinicaId;
  if (!clinicaId) {
    console.warn('⚠️ [biometria-ponto] ponto_marcado sem clinicaId resolvível para', usuario.nome);
    return;
  }

  const db = getClinicaDB(clinicaId);
  await garantirTabelaPonto(db, clinicaId);
  const agora = new Date();
  const dataHora = agora.toISOString();
  const dia = dataHora.split('T')[0];

  const ultimo = await promisify(
    db,
    'get',
    'SELECT tipo, dataHora FROM ponto_biometrico WHERE usuarioId = ? AND dia = ? ORDER BY dataHora DESC LIMIT 1',
    [usuario.id, dia]
  );

  // Anti-rebote: ignora batidas repetidas dentro do intervalo mínimo.
  if (ultimo && ultimo.dataHora) {
    const segundos = (agora.getTime() - new Date(ultimo.dataHora).getTime()) / 1000;
    if (segundos < INTERVALO_MINIMO_SEG) {
      console.log(`⏳ [biometria-ponto] Batida ignorada p/ ${usuario.nome} (há ${Math.round(segundos)}s).`);
      return;
    }
  }

  // Tipo: explícito (chegada/saida/entrada) ou alternância automática.
  let tipoFinal = payload.tipo;
  if (tipoFinal === 'chegada') tipoFinal = 'entrada';
  if (tipoFinal !== 'entrada' && tipoFinal !== 'saida') {
    tipoFinal = ultimo && ultimo.tipo === 'entrada' ? 'saida' : 'entrada';
  }

  const id = `ponto_${Date.now()}`;
  await promisify(
    db,
    'run',
    `INSERT INTO ponto_biometrico (id, usuarioId, usuarioNome, tipo, dataHora, dia, origem, biometriaId, confianca, almoco, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, usuario.id, usuario.nome, tipoFinal, dataHora, dia, 'biometria', biometriaId, confianca, 0, dataHora]
  );
  console.log(`✅ [biometria-ponto] ${tipoFinal} registrada por digital para ${usuario.nome} (${dataHora})`);
};

let _ws = null;
let _parar = false;

const conectar = () => {
  if (_parar) return;
  const url = montarWsUrl();
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.error('❌ [biometria-ponto] Falha ao abrir WebSocket:', err.message);
    return agendarReconexao();
  }
  _ws = ws;

  ws.on('open', () => {
    console.log(`🟢 [biometria-ponto] Conectado ao leitor (${url}) — escutando marcações de ponto...`);
  });

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    const evento = (msg.evento || msg.status || '').toString().toLowerCase();
    // O app WPF emite `ponto_marcado` (Eventos.PontoMarcado) ao identificar
    // alguém no leitor. Aceita aliases por segurança.
    if (
    evento === 'ponto_marcado' ||
    evento === 'pontomarcado' ||
    evento === 'usuario_identificado' ||
    evento === 'identificado')
    {
      try {
        await registrarPonto(msg);
      } catch (err) {
        console.error('❌ [biometria-ponto] Erro ao gravar ponto recebido:', err.message);
      }
    }
  });

  ws.on('error', (err) => {
    console.warn('⚠️ [biometria-ponto] Erro na conexão com o leitor:', err.message);
  });

  ws.on('close', () => {
    if (_parar) return;
    console.warn(`🔌 [biometria-ponto] Conexão encerrada — reconectando em ${Math.round(RECONNECT_MS / 1000)}s...`);
    agendarReconexao();
  });
};

const agendarReconexao = () => {
  if (_parar) return;
  setTimeout(conectar, RECONNECT_MS);
};

// Inicia o listener. Chamado uma vez no boot do servidor.
//
// ⚠️ OPT-IN: na implantação padrão, cada clínica instala o leitor em
// ws://localhost:5555 da PRÓPRIA máquina, e quem escuta as marcações é o
// NAVEGADOR (kiosk de ponto rodando na clínica) — NÃO o servidor central, que
// não enxerga o "localhost" nem a LAN de cada cliente. Por isso este listener
// fica DESLIGADO por padrão. Ative-o (BIOMETRIA_PONTO_LISTENER=on) APENAS quando
// o leitor estiver na MESMA rede do servidor e você definir BIOMETRIA_WS_URL
// explicitamente apontando para ele.
const iniciarBiometriaPontoListener = () => {
  const ligado = process.env.BIOMETRIA_PONTO_LISTENER === 'on';
  if (!ligado) {
    console.log('ℹ️ [biometria-ponto] Listener no servidor DESLIGADO (padrão). O navegador da clínica escuta o leitor local. Para ligar no servidor: BIOMETRIA_PONTO_LISTENER=on + BIOMETRIA_WS_URL=<url do leitor na rede>.');
    return;
  }
  if (!process.env.BIOMETRIA_WS_URL) {
    console.warn('⚠️ [biometria-ponto] BIOMETRIA_PONTO_LISTENER=on mas BIOMETRIA_WS_URL não definido — listener NÃO iniciado (evita reconectar a um localhost inexistente).');
    return;
  }
  _parar = false;
  console.log(`🔄 [biometria-ponto] Iniciando listener de ponto do leitor (${montarWsUrl()})...`);
  conectar();
};

const pararBiometriaPontoListener = () => {
  _parar = true;
  try {if (_ws) _ws.close();} catch (_) {}
};

module.exports = { iniciarBiometriaPontoListener, pararBiometriaPontoListener, registrarPonto };