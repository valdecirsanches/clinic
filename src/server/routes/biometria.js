
// ==================== ROTAS DE BIOMETRIA / PONTO DE FUNCIONÁRIOS ====================
// Contrato consumido pelo programa externo BiometriaDigitalPersona (app WPF + WebSocket)
// instalado na máquina onde o leitor U.are.U 4500 está conectado, em standby
// aguardando digitais. O servidor central é o GERENCIADOR:
//   1. GET  /api/biometria/funcionarios            -> lista funcionários (e quem já tem digital)
//   2. POST /api/biometria/funcionarios/:id/digital -> grava/associa a digital ao funcionário
//   3. POST /api/biometria/cadastro                 -> aciona o leitor (WS) e grava amostras + fmdXml
//   4. POST /api/biometria/identificar              -> localiza funcionário pela digital
//   5. POST /api/biometria/ponto                    -> registra ponto de chegada/saída
//   + GET  /api/biometria/ponto                     -> consulta registros (página de gestão)
//   + GET  /api/biometria/cadastros                 -> status enxuto p/ a aba (cadastrado/pendente)
//   + DELETE /api/biometria/cadastro/:usuarioId     -> remove a digital de um funcionário
//
// ⭐ As BIOMETRIAS ficam em uma TABELA DEDICADA `biometrias` (banco GLOBAL), para
//    não sobrecarregar a tabela `usuarios`. Cada funcionário tem no máximo uma
//    linha (1:1 por usuarioId). Os pontos ficam no banco da CLÍNICA.
//
// ⭐ Protocolo do app WPF (WebSocketConnectionManager): o app emite eventos no
//    campo `evento`:
//      - conectado / comando_recebido / status        (informativos)
//      - captura       { atual, total }                (progresso do dedo)
//      - amostra       { digital(base64), indice, total }
//      - cadastro_concluido { fmdXml, template, biometriaId, final:true }
//      - erro          { mensagem/erro }
//    O comando de cadastro pode ir tanto na QUERY STRING (?acao=cadastro&...)
//    quanto como mensagem JSON após o "open". Enviamos os dois para compatibilidade.

const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

// ⭐ URL base do leitor biométrico (app WPF). Pode ser sobrescrita por env.
//    Ex.: ws://localhost:5555  (sem o sufixo /biometria — ele é adicionado abaixo)
const BIOMETRIA_WS_URL = process.env.BIOMETRIA_WS_URL || 'ws://localhost:5555';
// Tempo máximo aguardando o usuário posicionar o dedo no leitor (ms)
const BIOMETRIA_WS_TIMEOUT = parseInt(process.env.BIOMETRIA_WS_TIMEOUT || '60000', 10);
// ⭐ Quantidade de amostras de digital coletadas no cadastro (o leitor envia
//    várias passadas do mesmo dedo para melhorar o matching posterior).
const BIOMETRIA_NUM_AMOSTRAS = parseInt(process.env.BIOMETRIA_NUM_AMOSTRAS || '4', 10);

// ⭐ Monta a URL final do WebSocket. O app WPF expõe o endpoint em /biometria.
//    Se a env já vier com /biometria, não duplica.
const montarWsUrl = (query) => {
  let base = BIOMETRIA_WS_URL.replace(/\/+$/, '');
  if (!/\/biometria$/i.test(base)) base += '/biometria';
  return `${base}/?${query}`;
};

// ⭐ Normaliza as amostras armazenadas para sempre ser um array (string[]).
const parseAmostras = (template) => {
  if (!template) return [];
  try {
    const parsed = JSON.parse(template);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === 'string') return [parsed];
  } catch (_) {
    return [template];
  }
  return [template];
};

// ⭐ Garante a tabela dedicada `biometrias` (banco global). 1 linha por
//    funcionário (usuarioId UNIQUE).
//      - amostras: JSON array das digitais/templates capturados (string[])
//      - fmdXml:   XML enviado pelo leitor (campo fmdXml do JSON do WS)
let _tabelaBiometriasFeita = false;
const garantirTabelaBiometrias = async () => {
  if (_tabelaBiometriasFeita) return;
  try {
    await dbGlobal.exec(`
      CREATE TABLE IF NOT EXISTS biometrias (
        id VARCHAR(191) PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL UNIQUE,
        biometriaId VARCHAR(191),
        amostras LONGTEXT,
        fmdXml LONGTEXT,
        numAmostras INT DEFAULT 0,
        criadoEm VARCHAR(50) NOT NULL,
        atualizadoEm VARCHAR(50) NOT NULL
      )
    `);
    // ⭐ Só marca como pronta APÓS sucesso. Se a primeira tentativa falhar
    //    (ex.: timing de conexão do banco no boot), a flag NÃO trava — a próxima
    //    chamada tenta de novo, evitando o estado "não grava mais nunca" em que
    //    todos os INSERTs falhavam silenciosamente por tabela inexistente.
    _tabelaBiometriasFeita = true;
    console.log('✅ [biometria] Tabela `biometrias` verificada/criada (banco global)');
  } catch (err) {
    console.error('❌ [biometria] Erro ao criar tabela biometrias:', err.message);
  }
};

// Garante a tabela de ponto da clínica.
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
    console.error('❌ [biometria] Erro ao garantir tabela ponto_biometrico:', err.message);
  }
};

// ⭐ Upsert da biometria de um funcionário na tabela dedicada.
const salvarBiometria = async ({ usuarioId, biometriaId, amostras, fmdXml }) => {
  const agora = new Date().toISOString();
  const id = `bio_${usuarioId}`;
  const amostrasJson = JSON.stringify(amostras || []);
  await dbGlobal.
  prepare(
    `INSERT INTO biometrias (id, usuarioId, biometriaId, amostras, fmdXml, numAmostras, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         biometriaId = VALUES(biometriaId),
         amostras = VALUES(amostras),
         fmdXml = VALUES(fmdXml),
         numAmostras = VALUES(numAmostras),
         atualizadoEm = VALUES(atualizadoEm)`
  ).
  run(
    id,
    usuarioId,
    biometriaId || usuarioId,
    amostrasJson,
    fmdXml || null,
    (amostras || []).length,
    agora,
    agora
  );
  return { id, usuarioId, biometriaId: biometriaId || usuarioId };
};

const promisify = (db, metodo, sql, params = []) =>
new Promise((resolve, reject) => {
  db[metodo](sql, params, (err, resultado) => {
    if (err) reject(err);else resolve(resultado);
  });
});

// ============================================================
// 1) GET /api/biometria/funcionarios
//    Lista funcionários para o programa BiometriaDigitalPersona, fazendo JOIN
//    com a tabela `biometrias`. Cada item traz temBiometria, numAmostras, o
//    array de amostras e o fmdXml (necessários ao matching no leitor).
//    Query: clinicaId?, operadoraId?, comDigital=true?
// ============================================================
router.get('/funcionarios', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { clinicaId, operadoraId, comDigital } = req.query;

    let query =
    `SELECT u.id, u.nome, u.email, u.tipo, u.crm, u.cpf, u.telefone, u.operadoraId, u.clinicaId, u.ativo,
              b.biometriaId, b.amostras, b.fmdXml, b.numAmostras
         FROM usuarios u
         LEFT JOIN biometrias b ON b.usuarioId = u.id`;
    const params = [];
    const conditions = ['u.ativo = 1'];
    if (clinicaId) {
      conditions.push('u.clinicaId = ?');
      params.push(clinicaId);
    }
    if (operadoraId) {
      conditions.push('u.operadoraId = ?');
      params.push(operadoraId);
    }
    if (comDigital === 'true' || comDigital === '1') {
      conditions.push('(b.fmdXml IS NOT NULL OR (b.amostras IS NOT NULL AND b.amostras <> \'[]\'))');
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY u.nome ASC';

    const rows = await dbGlobal.prepare(query).all(...params);
    const funcionarios = (rows || []).map((row) => {
      const amostras = parseAmostras(row.amostras);
      // ⭐ Considera cadastrado quem tem amostras OU fmdXml (o leitor pode
      //    devolver só o fmdXml no cadastro_concluido).
      const temFmd = Boolean(row.fmdXml);
      const temBiometria = amostras.length > 0 || temFmd;
      return {
        id: row.id,
        nome: row.nome,
        email: row.email,
        tipo: row.tipo,
        crm: row.crm,
        cpf: row.cpf,
        telefone: row.telefone,
        operadoraId: row.operadoraId,
        clinicaId: row.clinicaId,
        ativo: Boolean(row.ativo),
        biometriaId: row.biometriaId || null,
        temBiometria,
        numAmostras: amostras.length > 0 ? amostras.length : temFmd ? 1 : 0,
        amostrasEsperadas: BIOMETRIA_NUM_AMOSTRAS,
        amostras,
        fmdXml: row.fmdXml || null
      };
    });

    console.log(
      `✅ [biometria] ${funcionarios.length} funcionário(s) enviados ao leitor (comDigital=${comDigital || 'false'})`
    );
    res.json(funcionarios);
  } catch (err) {
    console.error('❌ [biometria] Erro ao listar funcionários:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/biometria/cadastros
//    Status enxuto (cadastrado/pendente) para a aba "Biometria Digital".
//    NÃO retorna o template — apenas metadados para a UI.
//    Query: clinicaId (obrigatório), operadoraId?
// ============================================================
router.get('/cadastros', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { clinicaId, operadoraId } = req.query;
    if (!clinicaId && !operadoraId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    let query =
    `SELECT u.id, u.nome, u.tipo, b.numAmostras, b.atualizadoEm, b.amostras, b.fmdXml
         FROM usuarios u
         LEFT JOIN biometrias b ON b.usuarioId = u.id`;
    const params = [];
    const conditions = ['u.ativo = 1'];
    if (clinicaId) {conditions.push('u.clinicaId = ?');params.push(clinicaId);}
    if (operadoraId) {conditions.push('u.operadoraId = ?');params.push(operadoraId);}
    query += ' WHERE ' + conditions.join(' AND ') + ' ORDER BY u.nome ASC';

    const rows = await dbGlobal.prepare(query).all(...params);
    const resultado = (rows || []).map((row) => {
      const amostras = parseAmostras(row.amostras);
      // ⭐ O leitor pode concluir o cadastro enviando APENAS o fmdXml (sem o
      //    array de amostras individuais). Nesse caso o funcionário está
      //    cadastrado mesmo com amostras.length === 0.
      const temFmd = Boolean(row.fmdXml);
      const cadastrado = amostras.length > 0 || temFmd;
      return {
        usuarioId: row.id,
        usuarioNome: row.nome,
        tipo: row.tipo,
        cadastrado,
        numAmostras: amostras.length > 0 ? amostras.length : temFmd ? 1 : 0,
        atualizadoEm: row.atualizadoEm || null
      };
    });
    res.json(resultado);
  } catch (err) {
    console.error('❌ [biometria] Erro ao listar cadastros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2) POST /api/biometria/funcionarios/:id/digital
//    Grava/associa a digital ao funcionário selecionado (upload direto).
//    Body: biometriaTemplate (string) OU amostras (string[]); fmdXml?; biometriaId?
// ============================================================
router.post('/funcionarios/:id/digital', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { id } = req.params;
    const { biometriaTemplate, amostras, fmdXml, biometriaId } = req.body;

    const listaAmostras = Array.isArray(amostras) ?
    amostras.filter(Boolean) :
    biometriaTemplate ?
    [biometriaTemplate] :
    [];

    if (listaAmostras.length === 0 && !fmdXml) {
      return res.status(400).json({ error: 'biometriaTemplate, amostras ou fmdXml é obrigatório' });
    }

    const usuario = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const salvo = await salvarBiometria({
      usuarioId: id,
      biometriaId,
      amostras: listaAmostras,
      fmdXml
    });

    console.log(`✅ [biometria] Digital gravada para ${usuario.nome} (${id})`);
    res.json({
      success: true,
      id,
      nome: usuario.nome,
      biometriaId: salvo.biometriaId,
      numAmostras: listaAmostras.length,
      temBiometria: listaAmostras.length > 0
    });
  } catch (err) {
    console.error('❌ [biometria] Erro ao gravar digital:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/biometria/cadastrar
//    PERSISTÊNCIA do template capturado PELO NAVEGADOR (modelo padrão: cada
//    clínica abre o ws://localhost do leitor no navegador, coleta as amostras e
//    envia o resultado aqui). Grava na tabela global `biometrias`.
//    Body: { usuarioId, biometriaId?, fmdXml?, amostras?, numAmostras? }
// ============================================================
router.post('/cadastrar', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { usuarioId, biometriaId, fmdXml } = req.body;
    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId é obrigatório' });
    }
    const listaAmostras = Array.isArray(req.body.amostras) ?
    req.body.amostras.filter(Boolean) :
    req.body.amostras ?
    [req.body.amostras] :
    [];
    if (listaAmostras.length === 0 && !fmdXml) {
      return res.status(400).json({ error: 'Envie amostras ou fmdXml' });
    }

    const usuario = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE id = ?').get(usuarioId);
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const salvo = await salvarBiometria({
      usuarioId,
      biometriaId,
      amostras: listaAmostras,
      fmdXml
    });

    console.log(`✅ [biometria] Template recebido do navegador e gravado para ${usuario.nome} (${usuarioId})`);
    res.json({
      success: true,
      usuarioId,
      nome: usuario.nome,
      biometriaId: salvo.biometriaId,
      numAmostras: listaAmostras.length,
      temBiometria: listaAmostras.length > 0,
      temFmdXml: Boolean(fmdXml)
    });
  } catch (err) {
    console.error('❌ [biometria] Erro ao gravar template recebido:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3) POST /api/biometria/cadastro  (modo LAN: servidor abre o WS)
//    Alternativo ao /cadastrar. Usado quando o leitor está na MESMA REDE do
//    servidor. O servidor abre o WebSocket em
//      ws://<ip>:<porta>/biometria/?acao=cadastro&clinicaId=...&funcionarioId=...&amostras=4
//    e TAMBÉM envia o mesmo comando como JSON após o "open". Acumula cada amostra
//    (evento 'amostra' -> campo 'digital') e o fmdXml (evento 'cadastro_concluido'),
//    e ao receber final/cadastro_concluido grava tudo na tabela `biometrias`.
//    Body: { clinicaId, funcionarioId, numAmostras? }
// ============================================================
router.post('/cadastro', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { clinicaId, funcionarioId } = req.body;
    const numAmostras = parseInt(req.body.numAmostras, 10) > 0 ?
    parseInt(req.body.numAmostras, 10) :
    BIOMETRIA_NUM_AMOSTRAS;

    if (!clinicaId || !funcionarioId) {
      return res.status(400).json({ error: 'clinicaId e funcionarioId são obrigatórios' });
    }

    const usuario = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE id = ?').get(funcionarioId);
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const query =
    `acao=cadastro&clinicaId=${encodeURIComponent(clinicaId)}` +
    `&funcionarioId=${encodeURIComponent(funcionarioId)}` +
    `&nome=${encodeURIComponent(usuario.nome || '')}&amostras=${numAmostras}`;
    const wsUrl = montarWsUrl(query);
    console.log(`🔵 [biometria] Solicitando cadastro de ${numAmostras} amostra(s) ao leitor: ${wsUrl}`);

    const amostras = [];
    let fmdXmlFinal = null;
    let templateFinal = null;
    let biometriaIdFinal = funcionarioId;
    let respondido = false;

    const responder = (status, payload) => {
      if (respondido) return;
      respondido = true;
      try {res.status(status).json(payload);} catch (_) {}
    };

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (errConn) {
      console.error('❌ [biometria] Falha ao abrir WebSocket com o leitor:', errConn);
      return responder(502, {
        error: 'Não foi possível conectar ao leitor biométrico',
        detalhe: errConn.message,
        url: wsUrl
      });
    }

    const timeout = setTimeout(() => {
      console.warn('⚠️ [biometria] Tempo esgotado aguardando amostras do leitor');
      try {ws.terminate();} catch (_) {}
      responder(504, {
        error: 'Tempo esgotado aguardando as digitais. Verifique o leitor e tente novamente.',
        amostrasRecebidas: amostras.length
      });
    }, BIOMETRIA_WS_TIMEOUT);

    const finalizarCadastro = async () => {
      clearTimeout(timeout);
      try {ws.close();} catch (_) {}
      try {
        // Se o leitor mandou template no cadastro_concluido mas nenhuma amostra
        // individual, usa o template como amostra única.
        const listaAmostras = amostras.length > 0 ?
        amostras :
        templateFinal ? [templateFinal] : [];
        const salvo = await salvarBiometria({
          usuarioId: funcionarioId,
          biometriaId: biometriaIdFinal,
          amostras: listaAmostras,
          fmdXml: fmdXmlFinal
        });
        console.log(`✅ [biometria] ${listaAmostras.length} amostra(s)${fmdXmlFinal ? ' + fmdXml' : ''} cadastrada(s) para ${usuario.nome} (${funcionarioId})`);
        return responder(200, {
          success: true,
          funcionarioId,
          clinicaId,
          nome: usuario.nome,
          biometriaId: salvo.biometriaId,
          numAmostras: listaAmostras.length,
          amostrasEsperadas: numAmostras,
          temBiometria: listaAmostras.length > 0,
          temFmdXml: Boolean(fmdXmlFinal)
        });
      } catch (errSave) {
        console.error('❌ [biometria] Erro ao gravar amostras recebidas:', errSave);
        return responder(500, { error: 'Digitais capturadas mas falhou ao salvar', detalhe: errSave.message });
      }
    };

    ws.on('open', () => {
      console.log('✅ [biometria] Conectado ao leitor — aguardando amostras...');
      try {
        ws.send(JSON.stringify({
          acao: 'cadastro',
          clinicaId,
          funcionarioId,
          nome: usuario.nome || '',
          amostras: numAmostras
        }));
      } catch (_) {}
    });

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
      } catch (_) {
        console.warn('⚠️ [biometria] Mensagem do leitor não é JSON válido, ignorando');
        return;
      }

      // O app WPF identifica cada mensagem por `evento`; mantemos `status` p/ compat.
      const evento = (msg.evento || msg.status || '').toString().toLowerCase();

      // Erro reportado pelo leitor
      if (evento === 'erro' || msg.erro || msg.error) {
        clearTimeout(timeout);
        try {ws.close();} catch (_) {}
        return responder(422, {
          error: msg.mensagem || msg.erro || msg.error || 'Falha no leitor',
          amostrasRecebidas: amostras.length
        });
      }

      if (msg.biometriaId) biometriaIdFinal = msg.biometriaId;
      // Captura o fmdXml/template em qualquer mensagem que os traga.
      if (msg.fmdXml) fmdXmlFinal = msg.fmdXml;
      if (msg.template) templateFinal = msg.template;

      // Evento 'amostra' (app WPF) -> campo 'digital' (base64). Aceita aliases.
      const digital = msg.digital || msg.template || msg.biometriaTemplate || msg.amostra;
      if ((evento === 'amostra' || !evento) && digital && typeof digital === 'string') {
        amostras.push(digital);
        console.log(`🟢 [biometria] Amostra ${amostras.length}/${numAmostras} recebida de ${usuario.nome}`);
      }

      // Conclusão: app WPF envia evento 'cadastro_concluido' com final=true.
      const concluido =
      evento === 'cadastro_concluido' || evento === 'concluido' || evento === 'final' ||
      msg.final === true || msg.completo === true || msg.concluido === true;

      if (concluido && (amostras.length > 0 || fmdXmlFinal || templateFinal)) {
        return finalizarCadastro();
      }
      // Fallback: atingiu a quantidade esperada de amostras sem flag final.
      if (numAmostras > 0 && amostras.length >= numAmostras) {
        return finalizarCadastro();
      }
    });

    ws.on('error', (errWs) => {
      console.error('❌ [biometria] Erro na conexão com o leitor:', errWs);
      clearTimeout(timeout);
      responder(502, {
        error: 'Erro de comunicação com o leitor biométrico',
        detalhe: errWs.message,
        url: wsUrl
      });
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      // Se o leitor fechou após enviar dados (sem flag final), grava o que veio.
      if (!respondido && (amostras.length > 0 || fmdXmlFinal || templateFinal)) {
        return finalizarCadastro();
      }
      responder(502, {
        error: 'Conexão com o leitor encerrada antes de receber as digitais.',
        amostrasRecebidas: amostras.length,
        url: wsUrl
      });
    });
  } catch (err) {
    console.error('❌ [biometria] Erro no cadastro de digital:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/biometria/cadastro/:usuarioId
//    Remove o cadastro de digital de um funcionário.
// ============================================================
router.delete('/cadastro/:usuarioId', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { usuarioId } = req.params;
    await dbGlobal.prepare('DELETE FROM biometrias WHERE usuarioId = ?').run(usuarioId);
    console.log(`🗑️ [biometria] Cadastro de digital removido para usuário ${usuarioId}`);
    res.json({ success: true, usuarioId });
  } catch (err) {
    console.error('❌ [biometria] Erro ao remover cadastro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4) POST /api/biometria/identificar
//    Localiza o funcionário a partir de uma digital capturada na marcação de
//    ponto. Lê da tabela dedicada `biometrias`.
//      a) o leitor já identificou e envia { biometriaId } ou { funcionarioId }
//      b) o leitor envia a digital crua { digital } -> match exato.
//    Body: { funcionarioId?, biometriaId?, digital? }
// ============================================================
router.post('/identificar', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { funcionarioId, biometriaId, digital } = req.body;

    if (funcionarioId || biometriaId) {
      const usuario = funcionarioId ?
      await dbGlobal.
      prepare(
        `SELECT u.id, u.nome, u.tipo, b.biometriaId, b.fmdXml
                 FROM usuarios u
                 LEFT JOIN biometrias b ON b.usuarioId = u.id
                WHERE u.id = ?`
      ).
      get(funcionarioId) :
      await dbGlobal.
      prepare(
        `SELECT u.id, u.nome, u.tipo, b.biometriaId, b.fmdXml
                 FROM usuarios u
                 JOIN biometrias b ON b.usuarioId = u.id
                WHERE b.biometriaId = ?`
      ).
      get(biometriaId);

      if (!usuario) {
        return res.status(404).json({ error: 'Funcionário não encontrado para a identificação informada' });
      }
      return res.json({
        encontrado: true,
        funcionarioId: usuario.id,
        nome: usuario.nome,
        tipo: usuario.tipo,
        biometriaId: usuario.biometriaId || usuario.id,
        fmdXml: usuario.fmdXml || null
      });
    }

    if (!digital) {
      return res.status(400).json({ error: 'Informe funcionarioId, biometriaId ou digital' });
    }

    const rows = await dbGlobal.
    prepare(
      `SELECT u.id, u.nome, u.tipo, b.biometriaId, b.amostras, b.fmdXml
           FROM biometrias b
           JOIN usuarios u ON u.id = b.usuarioId
          WHERE b.amostras IS NOT NULL AND u.ativo = 1`
    ).
    all();

    for (const row of rows || []) {
      const amostras = parseAmostras(row.amostras);
      if (amostras.includes(digital)) {
        console.log(`✅ [biometria] Funcionário identificado por digital: ${row.nome} (${row.id})`);
        return res.json({
          encontrado: true,
          funcionarioId: row.id,
          nome: row.nome,
          tipo: row.tipo,
          biometriaId: row.biometriaId || row.id,
          fmdXml: row.fmdXml || null
        });
      }
    }

    console.log('⚠️ [biometria] Nenhum funcionário correspondente à digital informada');
    return res.json({ encontrado: false });
  } catch (err) {
    console.error('❌ [biometria] Erro ao identificar funcionário:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 5) POST /api/biometria/ponto
//    Registra ponto de chegada/saída do funcionário.
//    Body: { clinicaId, usuarioId|biometriaId, tipo?, observacoes? }
// ============================================================
router.post('/ponto', async (req, res) => {
  try {
    await garantirTabelaBiometrias();
    const { clinicaId, usuarioId, biometriaId, tipo, observacoes } = req.body;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }
    if (!usuarioId && !biometriaId) {
      return res.status(400).json({ error: 'usuarioId ou biometriaId é obrigatório' });
    }

    let usuario;
    if (usuarioId) {
      usuario = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE id = ?').get(usuarioId);
    } else {
      usuario = await dbGlobal.
      prepare(
        `SELECT u.id, u.nome
             FROM usuarios u
             JOIN biometrias b ON b.usuarioId = u.id
            WHERE b.biometriaId = ?`
      ).
      get(biometriaId);
    }
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado para a identificação informada' });
    }

    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);
    const agora = new Date();
    const dataHora = agora.toISOString();
    const dia = dataHora.split('T')[0];

    let tipoFinal = tipo === 'chegada' || tipo === 'saida' ? tipo : null;
    if (!tipoFinal) {
      const ultimo = await promisify(
        db,
        'get',
        'SELECT tipo FROM ponto_biometrico WHERE usuarioId = ? AND dia = ? ORDER BY dataHora DESC LIMIT 1',
        [usuario.id, dia]
      );
      tipoFinal = ultimo && ultimo.tipo === 'chegada' ? 'saida' : 'chegada';
    }

    const id = `ponto_${Date.now()}`;
    await promisify(
      db,
      'run',
      `INSERT INTO ponto_biometrico (id, usuarioId, usuarioNome, tipo, dataHora, dia, origem, biometriaId, observacoes, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, usuario.id, usuario.nome, tipoFinal, dataHora, dia, 'biometria', biometriaId || usuarioId || null, observacoes || null, dataHora]
    );

    console.log(`✅ [biometria] Ponto de ${tipoFinal} registrado para ${usuario.nome} (${dataHora})`);
    res.json({
      success: true,
      id,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      tipo: tipoFinal,
      dataHora,
      dia
    });
  } catch (err) {
    console.error('❌ [biometria] Erro ao registrar ponto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/biometria/ponto
//    Consulta registros de ponto (para a página de gestão).
//    Query: clinicaId (obrigatório), dia? (YYYY-MM-DD), usuarioId?
// ============================================================
router.get('/ponto', async (req, res) => {
  try {
    const { clinicaId, dia, usuarioId } = req.query;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }
    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);
    let query = 'SELECT * FROM ponto_biometrico';
    const params = [];
    const conditions = [];
    if (dia) {conditions.push('dia = ?');params.push(dia);}
    if (usuarioId) {conditions.push('usuarioId = ?');params.push(usuarioId);}
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY dataHora DESC';
    const rows = await promisify(db, 'all', query, params);
    console.log(`✅ [biometria] ${(rows || []).length} ponto(s) retornados (dia=${dia || 'todos'})`);
    res.json(rows || []);
  } catch (err) {
    console.error('❌ [biometria] Erro ao consultar pontos:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;