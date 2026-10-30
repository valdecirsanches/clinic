
// ==================== ROTAS DE BIOMETRIA FACIAL / PONTO ====================
// Reconhecimento facial para marcação de ponto. O "descritor facial" é um vetor
// de 128 números (float) gerado no dispositivo/tablet. A comparação (distância
// euclidiana 1:N) acontece NO APP — por isso a lista de funcionários entrega os
// descritores. Aqui o backend apenas armazena e serve esses vetores.
//
// Contrato (consumido pelo app web do tablet):
//   1. GET  /api/funcionarios-biometria  -> lista funcionários + descritores faciais
//   2. POST /api/biometria-facial         -> cadastra um rosto (1 descritor) de um funcionário
//   3. POST /api/registros-ponto          -> registra ponto (entrada/saida) com confiança do match
//   4. GET  /api/funcionarios             -> lista funcionários com flag tem_biometria
//
// ⭐ Os descritores ficam em uma tabela dedicada `biometria_facial` (banco GLOBAL).
//    Um funcionário pode ter VÁRIOS descritores (várias capturas do mesmo rosto),
//    por isso o retorno usa "descriptors" no plural. `funcionarioId` referencia
//    `usuarios.id` (string). Os registros de ponto ficam no banco da CLÍNICA, na
//    tabela `ponto_biometrico` (compartilhada com a biometria digital), agora com
//    coluna `confianca`.
//
// 🔒 Segurança opcional por API Key: se a env BIOMETRIA_API_KEY estiver definida,
//    todas as rotas exigem o header `Authorization: Bearer <chave>`. Se não estiver
//    definida, as rotas ficam abertas (modo inicial).

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

const BIOMETRIA_API_KEY = process.env.BIOMETRIA_API_KEY || '';

// ⭐ Middleware opcional de API Key (ligado só quando BIOMETRIA_API_KEY existe).
const exigirApiKey = (req, res, next) => {
  if (!BIOMETRIA_API_KEY) return next();
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token && token === BIOMETRIA_API_KEY) return next();
  return res.status(401).json({ error: 'Não autorizado. Envie Authorization: Bearer <chave>.' });
};
router.use(exigirApiKey);

const promisify = (db, metodo, sql, params = []) =>
new Promise((resolve, reject) => {
  db[metodo](sql, params, (err, resultado) => {
    if (err) reject(err);else resolve(resultado);
  });
});

// ⭐ Garante a tabela dedicada `biometria_facial` (banco global).
//    Vários descritores por funcionário (sem UNIQUE em funcionarioId).
let _tabelaFacialFeita = false;
const garantirTabelaFacial = async () => {
  if (_tabelaFacialFeita) return;
  _tabelaFacialFeita = true;
  try {
    await dbGlobal.exec(`
      CREATE TABLE IF NOT EXISTS biometria_facial (
        id VARCHAR(191) PRIMARY KEY,
        funcionarioId VARCHAR(191) NOT NULL,
        descriptor LONGTEXT NOT NULL,
        criadoEm VARCHAR(50) NOT NULL,
        INDEX idx_facial_funcionario (funcionarioId)
      )
    `);
    console.log('✅ [biometria-facial] Tabela `biometria_facial` verificada/criada (banco global)');
  } catch (err) {
    console.error('❌ [biometria-facial] Erro ao criar tabela biometria_facial:', err.message);
  }
};

// ⭐ Garante a coluna `confianca` na tabela ponto_biometrico (banco da clínica).
//    Bancos antigos não têm essa coluna; adiciona de forma defensiva.
const garantirColunaConfianca = async (db) => {
  try {
    await promisify(db, 'run', 'ALTER TABLE ponto_biometrico ADD COLUMN confianca FLOAT', []);
    console.log('🧩 [biometria-facial] Coluna ponto_biometrico.confianca adicionada');
  } catch (_) {

    // Ignora se a coluna já existe
  }};

// Normaliza o descritor para um array de números (aceita array ou JSON string).
const parseDescriptor = (valor) => {
  if (!valor) return null;
  try {
    const parsed = typeof valor === 'string' ? JSON.parse(valor) : valor;
    if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => !Number.isNaN(n));
  } catch (_) {
    return null;
  }
  return null;
};

// ============================================================
// 1) GET /api/funcionarios-biometria
//    Lista funcionários ativos QUE POSSUEM ao menos um descritor facial,
//    agrupando todos os descritores de cada um. O app baixa isso para
//    comparar 1:N no dispositivo.
//    Query (opcionais): clinicaId, operadoraId
//    -> [{ id, nome, descriptors: [[128 floats], ...] }]
// ============================================================
router.get('/funcionarios-biometria', async (req, res) => {
  try {
    await garantirTabelaFacial();
    const { clinicaId, operadoraId } = req.query;

    let query =
    `SELECT u.id, u.nome, f.descriptor
         FROM usuarios u
         JOIN biometria_facial f ON f.funcionarioId = u.id`;
    const params = [];
    const conditions = ['u.ativo = 1'];
    if (clinicaId) {conditions.push('u.clinicaId = ?');params.push(clinicaId);}
    if (operadoraId) {conditions.push('u.operadoraId = ?');params.push(operadoraId);}
    query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY u.nome ASC';

    const rows = await dbGlobal.prepare(query).all(...params);

    // Agrupa os descritores por funcionário
    const porFuncionario = new Map();
    for (const row of rows || []) {
      const desc = parseDescriptor(row.descriptor);
      if (!desc) continue;
      if (!porFuncionario.has(row.id)) {
        porFuncionario.set(row.id, { id: row.id, nome: row.nome, descriptors: [] });
      }
      porFuncionario.get(row.id).descriptors.push(desc);
    }

    const funcionarios = Array.from(porFuncionario.values());
    console.log(`✅ [biometria-facial] ${funcionarios.length} funcionário(s) com rosto enviados ao app`);
    res.json(funcionarios);
  } catch (err) {
    console.error('❌ [biometria-facial] Erro ao listar funcionários com biometria:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2) POST /api/biometria-facial
//    Cadastra o rosto (1 descritor de 128 números) de um funcionário.
//    Body: { funcionario_id, descriptor: [0.12, -0.04, ...128 números...] }
//    -> { ok: true, id }
// ============================================================
router.post('/biometria-facial', async (req, res) => {
  try {
    await garantirTabelaFacial();

    const funcionarioId = req.body.funcionario_id || req.body.funcionarioId;
    const descriptor = parseDescriptor(req.body.descriptor);

    if (!funcionarioId) {
      return res.status(400).json({ error: 'funcionario_id é obrigatório' });
    }
    if (!descriptor || descriptor.length === 0) {
      return res.status(400).json({ error: 'descriptor deve ser um array de números (128 floats)' });
    }
    if (descriptor.length !== 128) {
      console.warn(`⚠️ [biometria-facial] descriptor com ${descriptor.length} valores (esperado 128) — salvando mesmo assim`);
    }

    const usuario = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE id = ?').get(funcionarioId);
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const id = `face_${funcionarioId}_${Date.now()}`;
    const agora = new Date().toISOString();
    await dbGlobal.
    prepare('INSERT INTO biometria_facial (id, funcionarioId, descriptor, criadoEm) VALUES (?, ?, ?, ?)').
    run(id, funcionarioId, JSON.stringify(descriptor), agora);

    console.log(`✅ [biometria-facial] Rosto cadastrado para ${usuario.nome} (${funcionarioId}) — id ${id}`);
    res.json({ ok: true, id });
  } catch (err) {
    console.error('❌ [biometria-facial] Erro ao cadastrar rosto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3) POST /api/registros-ponto
//    Registra o ponto (entrada/saida) de um funcionário, guardando a confiança
//    (distância do match) calculada no app.
//    Body: { funcionario_id, tipo, confianca, clinicaId? }
//      - clinicaId: se omitido, usa o clinicaId do próprio funcionário (usuarios).
//    -> { ok: true, registrado_em }
// ============================================================
router.post('/registros-ponto', async (req, res) => {
  try {
    const funcionarioId = req.body.funcionario_id || req.body.funcionarioId;
    const tipoRaw = (req.body.tipo || '').toString().trim().toLowerCase();
    const confianca = req.body.confianca != null ? Number(req.body.confianca) : null;
    let clinicaId = req.body.clinicaId || req.body.clinica_id;

    if (!funcionarioId) {
      return res.status(400).json({ error: 'funcionario_id é obrigatório' });
    }

    const usuario = await dbGlobal.prepare('SELECT id, nome, clinicaId FROM usuarios WHERE id = ?').get(funcionarioId);
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Resolve a clínica (corpo da requisição ou a do próprio funcionário)
    clinicaId = clinicaId || usuario.clinicaId;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório (não foi possível inferir do funcionário)' });
    }

    const db = getClinicaDB(clinicaId);
    await garantirColunaConfianca(db);

    const agora = new Date();
    const dataHora = agora.toISOString();
    const dia = dataHora.split('T')[0];

    // tipo explícito (entrada/saida) ou alternância automática
    let tipoFinal = tipoRaw === 'entrada' || tipoRaw === 'saida' ? tipoRaw : null;
    if (!tipoFinal) {
      const ultimo = await promisify(
        db,
        'get',
        'SELECT tipo FROM ponto_biometrico WHERE usuarioId = ? AND dia = ? ORDER BY dataHora DESC LIMIT 1',
        [usuario.id, dia]
      );
      tipoFinal = ultimo && ultimo.tipo === 'entrada' ? 'saida' : 'entrada';
    }

    const id = `ponto_${Date.now()}`;
    await promisify(
      db,
      'run',
      `INSERT INTO ponto_biometrico (id, usuarioId, usuarioNome, tipo, dataHora, dia, origem, biometriaId, confianca, observacoes, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, usuario.id, usuario.nome, tipoFinal, dataHora, dia, 'facial', funcionarioId, confianca, null, dataHora]
    );

    console.log(`✅ [biometria-facial] Ponto de ${tipoFinal} (facial) registrado para ${usuario.nome} (confiança=${confianca ?? 'n/d'})`);
    res.json({ ok: true, registrado_em: dataHora, tipo: tipoFinal, funcionario_id: usuario.id });
  } catch (err) {
    console.error('❌ [biometria-facial] Erro ao registrar ponto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4) GET /api/funcionarios
//    Lista funcionários ativos com flag de biometria facial (para a tela de
//    cadastro saber quem ainda falta cadastrar o rosto).
//    Query (opcionais): clinicaId, operadoraId
//    -> [{ id, nome, tem_biometria }]
// ============================================================
router.get('/funcionarios', async (req, res) => {
  try {
    await garantirTabelaFacial();
    const { clinicaId, operadoraId } = req.query;

    let query =
    `SELECT u.id, u.nome,
              (SELECT COUNT(*) FROM biometria_facial f WHERE f.funcionarioId = u.id) AS qtdDescritores
         FROM usuarios u`;
    const params = [];
    const conditions = ['u.ativo = 1'];
    if (clinicaId) {conditions.push('u.clinicaId = ?');params.push(clinicaId);}
    if (operadoraId) {conditions.push('u.operadoraId = ?');params.push(operadoraId);}
    query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY u.nome ASC';

    const rows = await dbGlobal.prepare(query).all(...params);
    const funcionarios = (rows || []).map((row) => ({
      id: row.id,
      nome: row.nome,
      tem_biometria: Number(row.qtdDescritores) > 0
    }));

    console.log(`✅ [biometria-facial] ${funcionarios.length} funcionário(s) listados (flag tem_biometria)`);
    res.json(funcionarios);
  } catch (err) {
    console.error('❌ [biometria-facial] Erro ao listar funcionários:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;