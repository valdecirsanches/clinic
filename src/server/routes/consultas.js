// ==================== ROTAS DE CONSULTAS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const { GLOBAL_DB_NAME, getClinicaDbName } = require('../config/mysql');

// ⭐ Cache de índices já criados (evita verificar toda vez)
const indicesCriados = new Set();

// ⭐ Garante que os índices existam (roda apenas 1x por clínica) — MySQL-compatible
function garantirIndices(db, clinicaId, callback) {
  const cacheKey = `idx_${clinicaId}`;
  if (indicesCriados.has(cacheKey)) {
    return callback();
  }

  // MySQL não suporta CREATE INDEX IF NOT EXISTS
  // Usa callback que ignora erro "Duplicate key name"
  const criarIndice = (sql, nome) => {
    return new Promise((resolve) => {
      db.run(sql, (err) => {
        if (err && !err.message.includes('Duplicate key name') && !err.message.includes('Duplicate entry')) {
          console.error(`❌ Erro ${nome}:`, err.message);
        }
        resolve();
      });
    });
  };

  (async () => {
    // ⭐ FIX: Corrige coluna horario se for TEXT/BLOB (migração legada)
    // Converte para VARCHAR(10) para permitir índices sem key length
    await new Promise((resolve) => {
      db.run(`ALTER TABLE consultas MODIFY COLUMN horario VARCHAR(10) NOT NULL DEFAULT ''`, (err) => {
        if (err) {
          // Ignora erros — coluna pode já estar correta
          if (!err.message.includes('Unknown column')) {
            console.log(`⚠️ [${clinicaId}] horario MODIFY:`, err.message);
          }
        } else {
          console.log(`✅ [${clinicaId}] Coluna horario corrigida para VARCHAR(10)`);
        }
        resolve();
      });
    });

    await criarIndice(`CREATE INDEX idx_consultas_data ON consultas(data)`, 'idx_data');
    await criarIndice(`CREATE INDEX idx_consultas_data_prof ON consultas(data, profissionalId)`, 'idx_data_prof');
    await criarIndice(`CREATE INDEX idx_consultas_profissional ON consultas(profissionalId)`, 'idx_profissional');
    await criarIndice(`CREATE INDEX idx_consultas_status ON consultas(status)`, 'idx_status');
    await criarIndice(`CREATE INDEX idx_consultas_paciente ON consultas(pacienteId)`, 'idx_paciente');
    await criarIndice(`CREATE INDEX idx_consultas_paciente_data ON consultas(pacienteId, data, horario)`, 'idx_paciente_data');
    await criarIndice(`CREATE INDEX idx_consultas_paciente_status_data ON consultas(pacienteId, status, data)`, 'idx_paciente_status_data');
    await criarIndice(`CREATE INDEX idx_consultas_lembrete ON consultas(lembreteEnviado, data, status)`, 'idx_lembrete');

    // ⭐ Garante colunas de cancelamento existem ANTES do SELECT que as referencia.
    // Sem isso, se a coluna nao existir, o SELECT inteiro da agenda falha e NADA aparece.
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN dataCancelamento VARCHAR(20)`, () => resolve()));
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN horaCancelamento VARCHAR(10)`, () => resolve()));
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN taxaCancelamento VARCHAR(120)`, () => resolve()));
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN canceladoPor VARCHAR(60)`, () => resolve()));
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN canalCancelamento VARCHAR(40)`, () => resolve()));

    // ⭐ Garante colunas de modalidade (presencial/online) e link de vídeo existem.
    // Sem isso, salvar/atualizar uma consulta com modalidade online falha com
    // "Unknown column 'modalidade' in 'field list'".
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN modalidade VARCHAR(20) DEFAULT 'presencial'`, () => resolve()));
    await new Promise((resolve) => db.run(`ALTER TABLE consultas ADD COLUMN linkVideo VARCHAR(500)`, () => resolve()));

    // ⭐ Garante coluna procedimentoAnotacoes existe
    await new Promise((resolve) => {
      db.run(`ALTER TABLE consultas ADD COLUMN procedimentoAnotacoes TEXT`, (err) => {
        if (err && !err.message.includes('Duplicate column')) {






          // Ignora — coluna já existe
        }resolve();});});indicesCriados.add(cacheKey);callback();
  })();
}

// ⭐ Helper: Normaliza uma row de consulta
const STATUS_MAP = {
  'AGENDADO': 'agendada',
  'AGENDADA': 'agendada',
  'CONFIRMADO': 'confirmada',
  'CONFIRMADA': 'confirmada',
  'AGUARDANDO': 'aguardando',
  'AGUARDANDO_CONFIRMACAO': 'aguardando_confirmacao',
  'REALIZADO': 'realizada',
  'REALIZADA': 'realizada',
  'ATENDIDO': 'realizada',
  'ATENDIDA': 'realizada',
  'CANCELADO': 'cancelada',
  'CANCELADA': 'cancelada',
  'AGUARDANDO_REMARCACAO': 'aguardando_remarcacao',
  'COMPARECEU': 'compareceu',
  'FALTOU': 'faltou'
};

function normalizarConsulta(row) {
  // Normaliza data: "2026-03-05 00:00:00" → "2026-03-05"
  let data = (row.data || '').toString().trim();
  if (data.includes(' ')) data = data.split(' ')[0];
  if (data.includes('T')) data = data.split('T')[0];

  // Normaliza horario: "13:00:00" → "13:00"
  let horario = (row.horario || '').toString().trim();
  if (horario && horario.split(':').length > 2) {
    const p = horario.split(':');
    horario = `${p[0]}:${p[1]}`;
  }

  // Normaliza status: "AGENDADO" → "agendada"
  let status = (row.status || 'agendada').toString().trim();
  const upper = status.toUpperCase().trim();
  if (STATUS_MAP[upper]) {
    status = STATUS_MAP[upper];
  } else if (status === upper && status.length > 0) {
    status = status.toLowerCase();
  }

  // ⭐ FIX: Deriva o TIPO da consulta a partir do TIPO DO PROFISSIONAL (fonte confiável).
  // O campo row.tipo é frequentemente vazio/errado em registros importados, o que fazia
  // qualquer valor diferente de 'medica' cair em "Odontológica" por padrão (bug: ginecologista
  // aparecendo como Odontologia). O profissional é a autoridade: dentista → odontologica,
  // qualquer outro (medico, ginecologista, etc.) → medica. Mantém row.tipo se o profissional
  // for desconhecido e, em último caso, assume 'medica' (default seguro, não odontológica).
  const profTipo = (row.profissionalTipo || '').toString().trim().toLowerCase();
  let tipoConsulta;
  if (profTipo === 'dentista') {
    tipoConsulta = 'odontologica';
  } else if (profTipo === 'medico') {
    tipoConsulta = 'medica';
  } else {
    const tipoSalvo = (row.tipo || '').toString().trim().toLowerCase();
    tipoConsulta = tipoSalvo === 'odontologica' ? 'odontologica' : 'medica';
  }

  // ⭐ CRÍTICO: NÃO usa spread operator para evitar incluir campos desnormalizados da tabela consultas
  // Retorna APENAS os campos explícitos do SELECT (que usa JOIN para nomes atualizados)
  return {
    id: row.id,
    pacienteId: row.pacienteId,
    profissionalId: row.profissionalId,
    procedimentoId: row.procedimentoId,
    data,
    horario,
    status,
    observacoes: row.observacoes,
    tipo: tipoConsulta,
    duracao: row.duracao,
    lembreteEnviado: Boolean(row.lembreteEnviado),
    tipoAgendamento: row.tipoAgendamento,
    motivoCancelamento: row.motivoCancelamento,
    dataCancelamento: row.dataCancelamento,
    horaCancelamento: row.horaCancelamento,
    taxaCancelamento: row.taxaCancelamento,
    canceladoPor: row.canceladoPor,
    canalCancelamento: row.canalCancelamento,
    cor: row.cor,
    confirmacaoRecebidaEm: row.confirmacaoRecebidaEm,
    whatsappTelefone: row.whatsappTelefone,
    odontograma: row.odontograma,
    assinaturaPaciente: row.assinaturaPaciente,
    dataAssinatura: row.dataAssinatura,
    horaChegada: row.horaChegada,
    horaInicioAtendimento: row.horaInicioAtendimento,
    horaPausaAtendimento: row.horaPausaAtendimento,
    horaFimAtendimento: row.horaFimAtendimento,
    tempoTotalAtendimento: row.tempoTotalAtendimento,
    statusAtendimento: row.statusAtendimento,
    // ⭐ FIX: modalidade (presencial/online) e linkVideo precisam chegar ao frontend.
    // Sem estes campos, a tela de atendimento não sabe que a consulta é online e o
    // botão "Reconectar consulta online" fica escondido (bug do botão que "não aparece").
    // Default 'presencial' para linhas legadas que ainda não têm a coluna preenchida.
    modalidade: (row.modalidade || 'presencial').toString().trim().toLowerCase(),
    linkVideo: row.linkVideo || null,
    pacienteNome: row.pacienteNome,
    pacienteDificuldadeLocomocao: row.pacienteDificuldadeLocomocao,
    pacienteNecessidadeEspecial: row.pacienteNecessidadeEspecial,
    pacienteFotoUrl: row.pacienteFotoUrl,
    pacienteDataNascimento: row.pacienteDataNascimento,
    pacienteConvenio: row.pacienteConvenio,
    pacienteTelefone: row.pacienteTelefone,
    pacienteNumeroContrato: row.pacienteNumeroContrato,
    pacienteMatricula: row.pacienteMatricula,
    pacienteEmpresaConveniadaId: row.pacienteEmpresaConveniadaId,
    pacienteTitularId: row.pacienteTitularId,
    pacienteParentesco: row.pacienteParentesco,
    pacienteEmpresaNome: row.pacienteEmpresaNome,
    pacienteConvenioNome: row.pacienteConvenioNome,
    procedimentoNome: row.procedimento || row.procedimentoNomeSalvo || null,
    procedimentoNomeJoin: row.procedimento || row.procedimentoNomeSalvo || null,
    procedimentoAnotacoes: row.procedimentoAnotacoes || null,
    profissional: row.profissional,
    profissionalCrm: row.profissionalCrm,
    profissionalUf: row.profissionalUf,
    profissionalTipo: row.profissionalTipo,
    profissionalTitulo: row.profissionalTitulo,
    profissionalNomeJoin: row.profissionalNome,
    profissionalCabecalhoRelatorio: row.profissionalCabecalhoRelatorio,
    profissionalRqes: row.profissionalRqes,
    profissionalEspecialidades: row.profissionalEspecialidades,
    valor: row.valor || 0
  };
}

// ⭐ DIAGNÓSTICO: Rota para debugar consultas — MySQL-compatible
router.get('/diagnostico', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  console.log(`\n🔍 ========== DIAGNÓSTICO CONSULTAS ==========`);
  console.log(`🔍 clinicaId recebido: "${clinicaId}"`);

  const db = getClinicaDB(clinicaId);

  try {
    // MySQL: usa SHOW COLUMNS em vez de PRAGMA table_info
    const columns = await new Promise((resolve, reject) => {
      db.all("SHOW COLUMNS FROM consultas", [], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    const columnNames = columns.map((c) => c.Field || c.name);
    console.log(`🔍 Colunas: [${columnNames.join(', ')}]`);

    const countRow = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM consultas', [], (err, row) => {
        if (err) reject(err);else
        resolve(row);
      });
    });

    const total = countRow ? countRow.total : 0;
    console.log(`🔍 Total de consultas: ${total}`);

    // MySQL: usa SHOW INDEX em vez de sqlite_master
    const indexes = await new Promise((resolve, reject) => {
      db.all("SHOW INDEX FROM consultas", [], (err, rows) => {
        if (err) resolve([]);else
        resolve(rows || []);
      });
    });
    const indexNames = [...new Set(indexes.map((i) => i.Key_name || i.name))];
    console.log(`🔍 Índices: [${indexNames.join(', ')}]`);

    const rawRows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM consultas LIMIT 5', [], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    rawRows.forEach((row, i) => {
      console.log(`   ${i + 1}. id="${row.id}" data="${row.data}" horario="${row.horario}" status="${row.status}" profissional="${row.profissional}"`);
    });

    const datas = await new Promise((resolve, reject) => {
      db.all('SELECT DISTINCT SUBSTR(data, 1, 10) as dataLimpa FROM consultas ORDER BY dataLimpa DESC LIMIT 20', [], (err, rows) => {
        if (err) resolve([]);else
        resolve(rows || []);
      });
    });
    const datasDistintas = datas.map((d) => d.dataLimpa);

    const statuses = await new Promise((resolve, reject) => {
      db.all('SELECT DISTINCT status FROM consultas', [], (err, rows) => {
        if (err) resolve([]);else
        resolve(rows || []);
      });
    });
    const statusDistintos = statuses.map((s) => s.status);

    console.log(`🔍 ========== FIM DIAGNÓSTICO ==========\n`);

    res.json({
      clinicaId,
      totalConsultas: total,
      colunas: columnNames,
      indices: indexNames,
      datasDistintas,
      statusDistintos,
      primeiros5Raw: rawRows,
      primeiros5Normalizados: rawRows.map(normalizarConsulta),
      mensagem: total === 0 ?
      '⚠️ NENHUMA consulta encontrada neste banco!' :
      `✅ ${total} consultas encontradas`
    });
  } catch (err) {
    console.error('❌ Erro no diagnóstico:', err);
    res.status(500).json({ error: err.message });
  }
});

// ⭐ NOVO: Endpoint LEVE para datas com consultas (para o calendário)
// Retorna apenas as datas que têm consultas, sem carregar os dados completos
router.get('/datas-com-consultas', (req, res) => {
  const { clinicaId, mesInicio, mesFim } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  garantirIndices(db, clinicaId, () => {
    // Filtra por período se fornecido (ex: mesInicio=2026-03-01, mesFim=2026-03-31)
    let sql = `SELECT DISTINCT SUBSTR(data, 1, 10) as data FROM consultas`;
    const params = [];

    if (mesInicio && mesFim) {
      sql += ` WHERE SUBSTR(data, 1, 10) BETWEEN ? AND ?`;
      params.push(mesInicio, mesFim);
    } else if (mesInicio) {
      sql += ` WHERE SUBSTR(data, 1, 10) >= ?`;
      params.push(mesInicio);
    }

    sql += ` ORDER BY data`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar datas:', err);
        return res.status(500).json({ error: err.message });
      }

      const datas = rows.map((r) => {
        let d = (r.data || '').toString().trim();
        if (d.includes(' ')) d = d.split(' ')[0];
        if (d.includes('T')) d = d.split('T')[0];
        return d;
      }).filter((d) => d.length === 10);

      res.json(datas);
    });
  });
});

// GET /api/consultas?clinicaId=c1 - Lista consultas de uma clínica
// ⭐ OTIMIZADO: Agora aceita filtros por data para evitar carregar 470K registros
// Parâmetros opcionais:
//   dataInicio - Data início (YYYY-MM-DD) 
//   dataFim    - Data fim (YYYY-MM-DD)
//   data       - Data específica (YYYY-MM-DD) - atalho para dataInicio=dataFim
//   profissionalId - Filtrar por profissional
//   pacienteId - Filtrar por paciente
//   limit      - Máximo de registros (default: 15000, max: 50000)
//   excludePlaceholders - boolean para excluir consultas marcador de placeholder
router.get('/', (req, res) => {
  const { clinicaId, dataInicio, dataFim, data, profissionalId, pacienteId, limit, excludePlaceholders } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const startTime = Date.now();
  const db = getClinicaDB(clinicaId);

  garantirIndices(db, clinicaId, () => {
    // ⭐ FIX: Qualifica TODAS as tabelas com nome do banco explícito (cross-database JOIN)
    const clinicaDbName = getClinicaDbName(clinicaId);
    let sql = `SELECT 
      c.id, c.pacienteId, c.profissionalId, c.procedimentoId, c.data, c.horario, 
      c.status, c.observacoes, c.tipo, c.duracao, c.lembreteEnviado,
      c.tipoAgendamento, c.motivoCancelamento, c.dataCancelamento, c.horaCancelamento, c.taxaCancelamento, c.canceladoPor, c.canalCancelamento, c.cor, c.confirmacaoRecebidaEm,
      c.whatsappTelefone, c.odontograma, c.assinaturaPaciente, c.dataAssinatura,
      c.horaChegada, c.horaInicioAtendimento, c.horaPausaAtendimento, c.horaFimAtendimento,
      c.tempoTotalAtendimento, c.statusAtendimento, c.valor,
      c.modalidade, c.linkVideo,
      c.procedimentoNome AS procedimentoNomeSalvo,
      c.procedimentoAnotacoes,
      p.nome AS pacienteNome,
      p.dificuldadeLocomocao AS pacienteDificuldadeLocomocao, 
      p.necessidadeEspecial AS pacienteNecessidadeEspecial, 
      p.fotoUrl AS pacienteFotoUrl, 
      p.dataNascimento AS pacienteDataNascimento,
      p.convenio AS pacienteConvenio, 
      p.telefone AS pacienteTelefone, 
      p.numeroContrato AS pacienteNumeroContrato,
      p.matricula AS pacienteMatricula,
      p.empresaConveniadaId AS pacienteEmpresaConveniadaId,
      p.titularId AS pacienteTitularId,
      p.parentesco AS pacienteParentesco,
      emp.nome AS pacienteEmpresaNome,
      conv.nome AS pacienteConvenioNome, 
      proc.nome AS procedimento,
      u.crm AS profissionalCrm,
      u.uf AS profissionalUf,
      u.tipo AS profissionalTipo,
      u.titulo AS profissionalTitulo,
      u.nome AS profissionalNome,
      u.cabecalhoRelatorio AS profissionalCabecalhoRelatorio,
      u.rqes AS profissionalRqes,
      u.especialidades AS profissionalEspecialidades,
      COALESCE(u.nome, c.profissional) AS profissional
    FROM ${clinicaDbName}.consultas c 
    LEFT JOIN ${clinicaDbName}.pacientes p ON c.pacienteId = p.id 
    LEFT JOIN ${clinicaDbName}.convenios conv ON p.convenioId = conv.id 
    LEFT JOIN ${clinicaDbName}.empresas_conveniadas emp ON p.empresaConveniadaId = emp.id 
    LEFT JOIN ${clinicaDbName}.procedimentos proc ON c.procedimentoId = proc.id
    LEFT JOIN ${GLOBAL_DB_NAME}.usuarios u ON c.profissionalId = u.id`;
    const conditions = [];
    const params = [];

    // Filtro por data — usa c.data BETWEEN com datetime completo (compatível MySQL)
    if (data) {
      conditions.push(`c.data BETWEEN ? AND ?`);
      params.push(`${data} 00:00:00`, `${data} 23:59:59`);
    } else if (dataInicio && dataFim) {
      conditions.push(`c.data BETWEEN ? AND ?`);
      params.push(`${dataInicio} 00:00:00`, `${dataFim} 23:59:59`);
    } else if (dataInicio) {
      conditions.push(`c.data >= ?`);
      params.push(`${dataInicio} 00:00:00`);
    } else if (dataFim) {
      conditions.push(`c.data <= ?`);
      params.push(`${dataFim} 23:59:59`);
    }

    // Filtro por profissional
    if (profissionalId) {
      conditions.push(`c.profissionalId = ?`);
      params.push(profissionalId);
    }

    // Filtro por paciente
    if (pacienteId) {
      conditions.push(`c.pacienteId = ?`);
      params.push(pacienteId);
    }

    // ⭐ Exclui placeholders ("Horário Disponível") — reduz drasticamente o volume de dados
    // Placeholders AUTOMÁTICOS são regenerados dinamicamente no frontend via gerarHorariosDisponiveis.
    // PORÉM, horários criados MANUALMENTE (ex.: transformar 11:00 -> 08:15) NÃO são regeráveis pela
    // grade — eles são registros reais e PRECISAM sobreviver ao reload. Por isso só excluímos os
    // placeholders automáticos (observacoes = 'Horário criado automaticamente').
    if (excludePlaceholders === 'true' || excludePlaceholders === '1') {
      conditions.push(
        `NOT (c.pacienteId = 'disponivel' AND (c.observacoes IS NULL OR c.observacoes != 'Horário criado manualmente'))`
      );
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // ⭐ FIX DUPLICAÇÃO: agrupa por c.id para neutralizar "fan-out" de LEFT JOIN
    // (quando pacientes/convenios/empresas têm linhas com id repetido, cada consulta
    // aparecia duplicada na grade). GROUP BY c.id garante 1 linha por consulta.
    sql += ' GROUP BY c.id';

    sql += ' ORDER BY c.data, c.horario';

    // ⭐ Limite razoável para performance — 15K cobre 3 meses de clínica movimentada
    const maxLimit = Math.min(parseInt(limit) || 15000, 50000);
    sql += ` LIMIT ${maxLimit}`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar consultas:', err);
        return res.status(500).json({ error: err.message });
      }

      // ⭐ Se retornou o máximo de linhas, avisa que dados podem estar faltando
      if (rows.length >= maxLimit) {
        console.warn(`⚠️ [consultas] TRUNCAMENTO DETECTADO para clinica ${clinicaId}: ${rows.length} rows = limite ${maxLimit}. Datas futuras podem estar faltando! Range: ${dataInicio || 'N/A'} a ${dataFim || 'N/A'}`);
        res.set('X-Truncation-Warning', `Result truncated at ${maxLimit} rows`);
      }

      // Normaliza
      const consultas = rows.map(normalizarConsulta);
      const durationMs = Date.now() - startTime;
      console.log(`⏱️ Consulta de ${consultas.length} registros para clinicaId=${clinicaId} em ${durationMs}ms`);
      res.json(consultas);
    });
  });
});

// POST /api/consultas - Cria nova consulta
router.post('/', (req, res) => {
  const { clinicaId, ...consultaData } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  // ⭐ FIX CRÍTICO: ID precisa ser único mesmo em inserts no MESMO milissegundo.
  // O fluxo de "transformar horário" cria 2 consultas em sequência rápida; com apenas
  // Date.now() ambas recebiam o MESMO id (ex.: cons1782216), causando colisão de chave
  // primária — uma sobrescrevia/derrubava a outra (o 11:00 sumia e o 8:15 não aparecia).
  const id = `cons${Date.now()}${Math.floor(Math.random() * 100000).
  toString().
  padStart(5, '0')}`;

  // ⭐ Índices são criados no GET (cache garante que roda só 1x). POST não precisa esperar.
  garantirIndices(db, clinicaId, () => {});

  // Filtra campos válidos (remove undefined/null keys que não existem na tabela)
  const fields = Object.keys(consultaData).filter((k) => consultaData[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => consultaData[k]);

  db.run(
    `INSERT INTO consultas (id, ${fields.join(', ')}, lembreteEnviado) VALUES (?, ${placeholders}, 0)`,
    [id, ...values],
    function (err) {
      if (err) {
        console.error('❌ Erro ao criar consulta:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id, ...consultaData, lembreteEnviado: false });
    }
  );
});

// PUT /api/consultas/:id - Atualiza consulta
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, ...updates } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // ⭐ Se está atualizando dados clínicos, verifica se a consulta está assinada
  const camposClinicosProtegidos = ['odontograma'];
  const tentandoAlterarClinico = camposClinicosProtegidos.some((c) => updates[c] !== undefined);

  const executarUpdate = () => {
    // Filtra campos válidos
    const validUpdates = {};
    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        // Serializa odontograma se for objeto
        if (key === 'odontograma' && typeof updates[key] === 'object') {
          validUpdates[key] = JSON.stringify(updates[key]);
        } else {
          validUpdates[key] = updates[key];
        }
      }
    });

    const setClause = Object.keys(validUpdates).map((key) => `${key} = ?`).join(', ');
    const values = [...Object.values(validUpdates), id];

    if (!setClause) {
      return res.json({ success: true, message: 'Nada para atualizar' });
    }

    db.run(
      `UPDATE consultas SET ${setClause} WHERE id = ?`,
      values,
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar consulta:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Consulta atualizada: ${id}`);
        res.json({ success: true });
      }
    );
  };

  if (tentandoAlterarClinico) {
    // Verifica assinatura antes de permitir alteração
    db.get('SELECT assinaturaPaciente FROM consultas WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.assinaturaPaciente) {
        return res.status(403).json({
          error: 'Consulta bloqueada',
          message: 'Esta consulta já foi assinada pelo paciente e não pode ser editada.'
        });
      }
      executarUpdate();
    });
  } else {
    executarUpdate();
  }
});

// DELETE /api/consultas/:id - Deleta consulta
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run(`DELETE FROM consultas WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar consulta:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Consulta deletada: ${id}`);
    res.json({ success: true });
  });
});

// POST /api/consultas/migrate-profissional-id
router.post('/migrate-profissional-id', async (req, res) => {
  const { clinicaId, usuarios } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!usuarios || !Array.isArray(usuarios)) {
    return res.status(400).json({ error: 'Lista de usuários é obrigatória' });
  }

  const db = getClinicaDB(clinicaId);

  const nomeParaId = {};
  usuarios.forEach((u) => {
    if (u.nome && u.id) {
      nomeParaId[u.nome.toLowerCase()] = u.id;
    }
  });

  db.all('SELECT id, profissional FROM consultas WHERE profissionalId IS NULL OR profissionalId = ""', [], (err, consultas) => {
    if (err) return res.status(500).json({ error: err.message });

    if (consultas.length === 0) {
      return res.json({ success: true, migradas: 0, message: 'Nenhuma consulta para migrar' });
    }

    let migradas = 0,erros = 0,processadas = 0;

    consultas.forEach((consulta) => {
      const profissionalNome = consulta.profissional?.toLowerCase();
      const profissionalId = nomeParaId[profissionalNome];

      if (profissionalId) {
        db.run('UPDATE consultas SET profissionalId = ? WHERE id = ?', [profissionalId, consulta.id], (updateErr) => {
          processadas++;
          if (updateErr) erros++;else
          migradas++;
          if (processadas === consultas.length) {
            res.json({ success: true, migradas, erros, total: consultas.length });
          }
        });
      } else {
        processadas++;
        if (processadas === consultas.length) {
          res.json({ success: true, migradas, erros, total: consultas.length });
        }
      }
    });
  });
});

module.exports = router;