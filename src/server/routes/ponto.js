
// ==================== ROTAS DE PONTO / FREQUÊNCIA DE FUNCIONÁRIOS ====================
// Módulo de controle de ponto SEM biometria. O usuário escolhe o funcionário e
// registra o ponto; o sistema decide AUTOMATICAMENTE se é entrada ou saída com
// base no último registro do dia (alternância por horário). Os registros ficam
// no banco da CLÍNICA, na tabela `ponto_biometrico` (origem = 'manual').
//
// Endpoints:
//   GET  /api/ponto/funcionarios  -> lista funcionários ativos da clínica
//   POST /api/ponto/registrar     -> registra ponto (entrada/saida automática por horário)
//   GET  /api/ponto/registros     -> histórico de registros (filtros: período, funcionário)
//   GET  /api/ponto/relatorio     -> relatório de horas trabalhadas por funcionário no período

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

const promisify = (db, metodo, sql, params = []) =>
new Promise((resolve, reject) => {
  db[metodo](sql, params, (err, resultado) => {
    if (err) reject(err);else resolve(resultado);
  });
});

// "HH:MM" -> minutos desde a meia-noite (ou null se inválido)
const hhmmParaMinutos = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

// minutos do dia (hora local) para um Date
const minutosDoDia = (date) => date.getHours() * 60 + date.getMinutes();

// Garante (uma vez por clínica/processo) que a tabela `ponto_biometrico` exista
// e tenha a coluna `almoco`. Antes isto dependia da inicialização da clínica e de
// uma flag GLOBAL — clínicas provisionadas antes da tabela existir, ou clínicas
// diferentes da primeira a rodar, ficavam sem a tabela/coluna e o INSERT falhava
// silenciosamente (ponto não gravava). Agora garantimos por clínica, sob demanda.
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
    // Bancos antigos: garante colunas que podem não existir em tabelas criadas
    // por versões anteriores do schema (CREATE TABLE IF NOT EXISTS não altera
    // tabelas já existentes). Cada ALTER é idempotente via try/catch.
    const colunasOpcionais = [
    'ALTER TABLE ponto_biometrico ADD COLUMN almoco TINYINT DEFAULT 0',
    "ALTER TABLE ponto_biometrico ADD COLUMN origem VARCHAR(50) DEFAULT 'biometria'",
    'ALTER TABLE ponto_biometrico ADD COLUMN biometriaId VARCHAR(191)',
    'ALTER TABLE ponto_biometrico ADD COLUMN confianca FLOAT'];

    for (const alter of colunasOpcionais) {
      try {
        await promisify(db, 'run', alter);
      } catch (_) {

        // Coluna já existe — ignora
      }}
    _pontoTabelaOk.add(chave);
  } catch (err) {
    console.error('❌ [ponto] Erro ao garantir tabela ponto_biometrico:', err.message);
  }
};

// Compat: mantém o nome usado em outros pontos do arquivo
const garantirColunaAlmoco = async (db, clinicaId) => garantirTabelaPonto(db, clinicaId);

// ============================================================
// GET /api/ponto/funcionarios
//    Lista funcionários ativos da clínica (para escolher quem vai bater ponto).
//    Query: clinicaId (obrigatório), operadoraId (opcional)
//    -> [{ id, nome, tipo }]
// ============================================================
router.get('/funcionarios', async (req, res) => {
  try {
    const { clinicaId, operadoraId } = req.query;
    if (!clinicaId && !operadoraId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    // Resolve a operadora da clínica para incluir administradores que não
    // estão vinculados diretamente a uma clínica específica.
    let operadoraResolvida = operadoraId || null;
    if (!operadoraResolvida && clinicaId) {
      try {
        const clinicaRow = await dbGlobal.
        prepare('SELECT operadoraId FROM clinicas WHERE id = ?').
        get(clinicaId);
        if (clinicaRow && clinicaRow.operadoraId) {
          operadoraResolvida = clinicaRow.operadoraId;
        }
      } catch (e) {
        console.warn('⚠️ [ponto] Não foi possível resolver operadoraId da clínica:', e.message);
      }
    }

    // Monta condição: usuários ativos da clínica (qualquer tipo) OU
    // administradores ativos da mesma operadora (admin costuma ter clinicaId nulo).
    const params = [];
    const orClauses = [];

    if (clinicaId) {
      orClauses.push('clinicaId = ?');
      params.push(clinicaId);
    }
    if (operadoraId) {
      orClauses.push('operadoraId = ?');
      params.push(operadoraId);
    }
    if (operadoraResolvida) {
      // Admin/super_admin da operadora, mesmo sem clinicaId definido
      orClauses.push("(tipo IN ('admin','super_admin') AND operadoraId = ?)");
      params.push(operadoraResolvida);
    } else {
      // Sem operadora resolvida: ao menos garante que admins/super_admins apareçam
      orClauses.push("tipo IN ('admin','super_admin')");
    }

    const whereClause = orClauses.length ?
    `WHERE ativo = 1 AND (${orClauses.join(' OR ')})` :
    'WHERE ativo = 1';

    const query = `SELECT id, nome, tipo FROM usuarios ${whereClause} ORDER BY nome ASC`;

    const rows = await dbGlobal.prepare(query).all(...params);
    res.json(rows || []);
  } catch (err) {
    console.error('❌ [ponto] Erro ao listar funcionários:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/ponto/registrar
//    Registra o ponto de um funcionário. O tipo (entrada/saida) é decidido
//    AUTOMATICAMENTE pela alternância do último registro do dia: se o último
//    foi 'entrada', o novo é 'saida', e vice-versa. Primeiro do dia = 'entrada'.
//    Body: { clinicaId, usuarioId, observacoes? }
//    -> { ok: true, tipo, dataHora, usuarioNome }
// ============================================================
router.post('/registrar', async (req, res) => {
  try {
    const { usuarioId, observacoes } = req.body;
    let clinicaId = req.body.clinicaId || req.body.clinica_id;

    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId é obrigatório' });
    }

    const usuario = await dbGlobal.
    prepare('SELECT id, nome, clinicaId, intervaloAlmocoAtivo, intervaloAlmocoInicio, intervaloAlmocoFim FROM usuarios WHERE id = ?').
    get(usuarioId);
    if (!usuario) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    clinicaId = clinicaId || usuario.clinicaId;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);
    const agora = new Date();
    const dataHora = agora.toISOString();
    const dia = dataHora.split('T')[0];

    // ⭐ Verifica se a marcação cai DENTRO do intervalo de almoço configurado
    const almocoAtivo = !!usuario.intervaloAlmocoAtivo;
    const almocoIni = hhmmParaMinutos(usuario.intervaloAlmocoInicio);
    const almocoFim = hhmmParaMinutos(usuario.intervaloAlmocoFim);
    const agoraMin = minutosDoDia(agora);
    const dentroAlmoco =
    almocoAtivo &&
    almocoIni != null &&
    almocoFim != null &&
    almocoFim > almocoIni &&
    agoraMin >= almocoIni &&
    agoraMin <= almocoFim;

    // Alternância automática por horário: olha o último registro do dia
    const ultimo = await promisify(
      db,
      'get',
      'SELECT tipo, dataHora FROM ponto_biometrico WHERE usuarioId = ? AND dia = ? ORDER BY dataHora DESC LIMIT 1',
      [usuario.id, dia]
    );

    // ⭐ Trava anti-rebote: ignora batidas repetidas do mesmo funcionário dentro
    // de um intervalo mínimo (evita marcar entrada/saída em loop quando a pessoa
    // permanece em frente à câmera). Default 60s, configurável via body.
    const intervaloMinimoSegundos = Number(req.body.intervaloMinimoSegundos) || 60;
    if (ultimo && ultimo.dataHora) {
      const segundosDesdeUltimo =
      (agora.getTime() - new Date(ultimo.dataHora).getTime()) / 1000;
      if (segundosDesdeUltimo < intervaloMinimoSegundos) {
        console.log(
          `⏳ [ponto] Batida ignorada para ${usuario.nome} (última há ${Math.round(segundosDesdeUltimo)}s, mínimo ${intervaloMinimoSegundos}s)`
        );
        return res.json({
          ok: true,
          ignorado: true,
          tipo: ultimo.tipo,
          dataHora: ultimo.dataHora,
          dia,
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
          mensagem: 'Ponto já registrado há instantes. Aguarde para marcar novamente.'
        });
      }
    }

    const tipoFinal = ultimo && ultimo.tipo === 'entrada' ? 'saida' : 'entrada';

    const id = `ponto_${Date.now()}`;
    // Insere apenas as colunas essenciais (biometriaId/confianca eram sempre NULL
    // e podem não existir em tabelas de bancos antigos).
    await promisify(
      db,
      'run',
      `INSERT INTO ponto_biometrico (id, usuarioId, usuarioNome, tipo, dataHora, dia, origem, observacoes, almoco, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, usuario.id, usuario.nome, tipoFinal, dataHora, dia, 'manual', observacoes || null, dentroAlmoco ? 1 : 0, dataHora]
    );

    console.log(`✅ [ponto] ${tipoFinal} registrada para ${usuario.nome} (${dataHora})${dentroAlmoco ? ' [intervalo de almoço]' : ''}`);
    res.json({
      ok: true,
      id,
      tipo: tipoFinal,
      dataHora,
      dia,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      dentroAlmoco,
      intervaloAlmoco: almocoAtivo ?
      { inicio: usuario.intervaloAlmocoInicio, fim: usuario.intervaloAlmocoFim } :
      null
    });
  } catch (err) {
    console.error('❌ [ponto] Erro ao registrar ponto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/ponto/registros
//    Histórico de registros de ponto.
//    Query: clinicaId (obrigatório), inicio? (YYYY-MM-DD), fim? (YYYY-MM-DD), usuarioId?
//    -> [{ id, usuarioId, usuarioNome, tipo, dataHora, dia, observacoes }]
// ============================================================
router.get('/registros', async (req, res) => {
  try {
    const { clinicaId, inicio, fim, usuarioId } = req.query;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);
    let query = 'SELECT id, usuarioId, usuarioNome, tipo, dataHora, dia, observacoes FROM ponto_biometrico';
    const params = [];
    const conditions = [];
    if (inicio) {conditions.push('dia >= ?');params.push(inicio);}
    if (fim) {conditions.push('dia <= ?');params.push(fim);}
    if (usuarioId) {conditions.push('usuarioId = ?');params.push(usuarioId);}
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY dataHora DESC';

    const rows = await promisify(db, 'all', query, params);
    res.json(rows || []);
  } catch (err) {
    console.error('❌ [ponto] Erro ao consultar registros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/ponto/relatorio
//    Relatório de horas trabalhadas por funcionário no período. Pareia cada
//    'entrada' com a próxima 'saida' do mesmo dia para somar a duração.
//    Query: clinicaId (obrigatório), inicio? (YYYY-MM-DD), fim? (YYYY-MM-DD), usuarioId?
//    -> { periodo: {inicio, fim}, funcionarios: [{ usuarioId, usuarioNome,
//         totalMinutos, totalHoras, dias: [{ dia, minutos, registros: [...] }] }] }
// ============================================================
router.get('/relatorio', async (req, res) => {
  try {
    const { clinicaId, inicio, fim, usuarioId } = req.query;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);
    let query = 'SELECT id, usuarioId, usuarioNome, tipo, dataHora, dia FROM ponto_biometrico';
    const params = [];
    const conditions = [];
    if (inicio) {conditions.push('dia >= ?');params.push(inicio);}
    if (fim) {conditions.push('dia <= ?');params.push(fim);}
    if (usuarioId) {conditions.push('usuarioId = ?');params.push(usuarioId);}
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY usuarioId ASC, dataHora ASC';

    const rows = await promisify(db, 'all', query, params);

    // Agrupa por funcionário -> dia -> pareia entrada/saida
    const porFunc = new Map();
    for (const r of rows || []) {
      if (!porFunc.has(r.usuarioId)) {
        porFunc.set(r.usuarioId, {
          usuarioId: r.usuarioId,
          usuarioNome: r.usuarioNome,
          totalMinutos: 0,
          diasMap: new Map()
        });
      }
      const f = porFunc.get(r.usuarioId);
      if (!f.diasMap.has(r.dia)) {
        f.diasMap.set(r.dia, { dia: r.dia, minutos: 0, registros: [], aberturaPendente: null });
      }
      const d = f.diasMap.get(r.dia);
      d.registros.push({ id: r.id, tipo: r.tipo, dataHora: r.dataHora });
      if (r.tipo === 'entrada') {
        d.aberturaPendente = new Date(r.dataHora);
      } else if (r.tipo === 'saida' && d.aberturaPendente) {
        const minutos = Math.max(
          0,
          Math.round((new Date(r.dataHora) - d.aberturaPendente) / 60000)
        );
        d.minutos += minutos;
        f.totalMinutos += minutos;
        d.aberturaPendente = null;
      }
    }

    // ⭐ Carrega config de intervalo de almoço de cada funcionário envolvido
    const ids = Array.from(porFunc.keys());
    const almocoPorUsuario = new Map();
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const cfgs = await dbGlobal.
      prepare(`SELECT id, intervaloAlmocoAtivo, intervaloAlmocoInicio, intervaloAlmocoFim FROM usuarios WHERE id IN (${placeholders})`).
      all(...ids);
      for (const c of cfgs || []) almocoPorUsuario.set(c.id, c);
    }

    const funcionarios = Array.from(porFunc.values()).map((f) => {
      const cfg = almocoPorUsuario.get(f.usuarioId);
      const almocoAtivo = cfg && !!cfg.intervaloAlmocoAtivo;
      const almocoIni = cfg ? hhmmParaMinutos(cfg.intervaloAlmocoInicio) : null;
      const almocoFim = cfg ? hhmmParaMinutos(cfg.intervaloAlmocoFim) : null;
      const almocoValido =
      almocoAtivo && almocoIni != null && almocoFim != null && almocoFim > almocoIni;
      const duracaoAlmoco = almocoValido ? almocoFim - almocoIni : 0;

      let totalMinutos = 0;
      const dias = Array.from(f.diasMap.values()).
      map((d) => {
        let minutos = d.minutos;
        let almocoDescontado = 0;
        if (almocoValido && d.registros.length > 0) {
          // Já marcou o almoço manualmente? (uma 'saida' caindo dentro da janela)
          const almocoJaMarcado = d.registros.some((r) => {
            if (r.tipo !== 'saida') return false;
            const min = minutosDoDia(new Date(r.dataHora));
            return min >= almocoIni && min <= almocoFim;
          });
          // O período trabalhado cobre a janela de almoço?
          const mins = d.registros.map((r) => minutosDoDia(new Date(r.dataHora)));
          const primeiro = Math.min(...mins);
          const ultimo = Math.max(...mins);
          const cobreAlmoco = primeiro <= almocoFim && ultimo >= almocoIni;
          if (!almocoJaMarcado && cobreAlmoco) {
            almocoDescontado = Math.min(duracaoAlmoco, minutos);
            minutos = Math.max(0, minutos - almocoDescontado);
          }
        }
        totalMinutos += minutos;
        return { dia: d.dia, minutos, almocoDescontado, registros: d.registros };
      }).
      sort((a, b) => a.dia.localeCompare(b.dia));

      return {
        usuarioId: f.usuarioId,
        usuarioNome: f.usuarioNome,
        intervaloAlmoco: almocoValido ?
        { inicio: cfg.intervaloAlmocoInicio, fim: cfg.intervaloAlmocoFim, minutos: duracaoAlmoco } :
        null,
        totalMinutos,
        totalHoras: Number((totalMinutos / 60).toFixed(2)),
        dias
      };
    });

    res.json({ periodo: { inicio: inicio || null, fim: fim || null }, funcionarios });
  } catch (err) {
    console.error('❌ [ponto] Erro ao gerar relatório:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /api/ponto/registros/:id
//    Edita o horário (e opcionalmente o tipo / observações) de um registro de
//    ponto existente. Usado no relatório para corrigir marcações.
//    Body: { clinicaId, dataHora? (ISO ou 'YYYY-MM-DDTHH:MM'), tipo?, observacoes? }
// ============================================================
router.patch('/registros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clinicaId, dataHora, tipo, observacoes } = req.body;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }
    if (dataHora === undefined && tipo === undefined && observacoes === undefined) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);

    const registro = await promisify(
      db,
      'get',
      'SELECT * FROM ponto_biometrico WHERE id = ?',
      [id]
    );
    if (!registro) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    const sets = [];
    const params = [];

    if (dataHora !== undefined) {
      const novaData = new Date(dataHora);
      if (Number.isNaN(novaData.getTime())) {
        return res.status(400).json({ error: 'dataHora inválida' });
      }
      const novoIso = novaData.toISOString();
      sets.push('dataHora = ?');
      params.push(novoIso);
      sets.push('dia = ?');
      params.push(novoIso.split('T')[0]);
    }
    if (tipo !== undefined) {
      const tipoNorm = tipo === 'chegada' ? 'entrada' : tipo;
      if (tipoNorm !== 'entrada' && tipoNorm !== 'saida') {
        return res.status(400).json({ error: "tipo deve ser 'entrada' ou 'saida'" });
      }
      sets.push('tipo = ?');
      params.push(tipoNorm);
    }
    if (observacoes !== undefined) {
      sets.push('observacoes = ?');
      params.push(observacoes || null);
    }

    params.push(id);
    await promisify(db, 'run', `UPDATE ponto_biometrico SET ${sets.join(', ')} WHERE id = ?`, params);

    const atualizado = await promisify(db, 'get', 'SELECT * FROM ponto_biometrico WHERE id = ?', [id]);
    console.log(`✏️ [ponto] Registro ${id} atualizado (${atualizado.usuarioNome} -> ${atualizado.tipo} ${atualizado.dataHora})`);
    res.json({ ok: true, registro: atualizado });
  } catch (err) {
    console.error('❌ [ponto] Erro ao editar registro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/ponto/registros/:id
//    Remove um registro de ponto (correção de marcação indevida).
//    Query/Body: clinicaId (obrigatório)
// ============================================================
router.delete('/registros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clinicaId = req.body.clinicaId || req.query.clinicaId;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }
    const db = getClinicaDB(clinicaId);
    await garantirTabelaPonto(db, clinicaId);
    await promisify(db, 'run', 'DELETE FROM ponto_biometrico WHERE id = ?', [id]);
    console.log(`🗑️ [ponto] Registro ${id} removido`);
    res.json({ ok: true, id });
  } catch (err) {
    console.error('❌ [ponto] Erro ao remover registro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/ponto/facial/descritores
//    Retorna todos os descritores faciais cadastrados na clínica
//    para o reconhecimento no frontend.
// ============================================================
router.get('/facial/descritores', async (req, res) => {
  try {
    const { clinicaId } = req.query;
    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    const db = getClinicaDB(clinicaId);

    // Garante que a tabela existe
    await promisify(db, 'run', `
      CREATE TABLE IF NOT EXISTS ponto_facial_descritores (
        id VARCHAR(191) PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL,
        usuarioNome VARCHAR(255),
        descritores LONGTEXT NOT NULL,
        criadoEm VARCHAR(50) NOT NULL,
        INDEX idx_facial_usuario (usuarioId)
      )
    `);

    const rows = await promisify(db, 'all', 'SELECT usuarioId, usuarioNome, descritores FROM ponto_facial_descritores');

    // Converte de volta para array de arrays
    const cadastros = (rows || []).map((r) => ({
      usuarioId: r.usuarioId,
      usuarioNome: r.usuarioNome,
      descritores: JSON.parse(r.descritores)
    }));

    res.json(cadastros);
  } catch (err) {
    console.error('❌ [ponto] Erro ao buscar descritores faciais:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/ponto/facial/cadastrar
//    Salva as 4 amostras (descritores) de um funcionário.
//    Body: { clinicaId, usuarioId, usuarioNome, descritores: number[][] }
// ============================================================
router.post('/facial/cadastrar', async (req, res) => {
  try {
    const { clinicaId, usuarioId, usuarioNome, descritores } = req.body;

    if (!clinicaId || !usuarioId || !descritores || !Array.isArray(descritores)) {
      return res.status(400).json({ error: 'Dados incompletos para cadastro facial' });
    }

    const db = getClinicaDB(clinicaId);

    await promisify(db, 'run', `
      CREATE TABLE IF NOT EXISTS ponto_facial_descritores (
        id VARCHAR(191) PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL,
        usuarioNome VARCHAR(255),
        descritores LONGTEXT NOT NULL,
        criadoEm VARCHAR(50) NOT NULL,
        INDEX idx_facial_usuario (usuarioId)
      )
    `);

    // Remove cadastro anterior se existir
    await promisify(db, 'run', 'DELETE FROM ponto_facial_descritores WHERE usuarioId = ?', [usuarioId]);

    const id = `facial_${Date.now()}`;
    const agora = new Date().toISOString();

    await promisify(
      db,
      'run',
      'INSERT INTO ponto_facial_descritores (id, usuarioId, usuarioNome, descritores, criadoEm) VALUES (?, ?, ?, ?, ?)',
      [id, usuarioId, usuarioNome, JSON.stringify(descritores), agora]
    );

    console.log(`✅ [ponto] Cadastro facial salvo para ${usuarioNome} (${descritores.length} amostras)`);
    res.json({ ok: true, mensagem: 'Cadastro facial realizado com sucesso' });
  } catch (err) {
    console.error('❌ [ponto] Erro ao cadastrar biometria facial:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;