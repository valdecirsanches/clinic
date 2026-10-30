// ==================== ROTAS DE PRESCRIÇÕES ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Garante que a tabela de remédios existe com todos os campos
function garantirTabelaMedicamentos(db) {
  return new Promise((resolve) => {
    // MySQL: TEXT/BLOB não aceita DEFAULT — usar VARCHAR para campos curtos
    db.run(`
      CREATE TABLE IF NOT EXISTS atendimento_prescricoes_remedios (
        id VARCHAR(191) PRIMARY KEY,
        prescricaoId VARCHAR(191) NOT NULL,
        remedioId VARCHAR(191),
        nome VARCHAR(255) NOT NULL,
        dosagem VARCHAR(255),
        quantidade VARCHAR(100),
        unidade VARCHAR(100),
        posologia TEXT,
        tipo VARCHAR(50) DEFAULT 'medicamento',
        ordem INT DEFAULT 0,
        criadoEm VARCHAR(50),
        atualizadoEm VARCHAR(50)
      )
    `, (err) => {
      if (err) {
        console.error('⚠️ Erro ao criar tabela atendimento_prescricoes_remedios:', err.message);
      }
      // Garante campos que podem faltar em tabelas já existentes
      let pending = 4;
      const done = () => {if (--pending <= 0) resolve();};
      db.run(`ALTER TABLE atendimento_prescricoes_remedios ADD COLUMN remedioId VARCHAR(191)`, () => done());
      db.run(`ALTER TABLE atendimento_prescricoes_remedios ADD COLUMN ordem INT DEFAULT 0`, () => done());
      db.run(`ALTER TABLE atendimento_prescricoes_remedios ADD COLUMN atualizadoEm VARCHAR(50)`, () => done());
      db.run(`ALTER TABLE atendimento_prescricoes_remedios ADD COLUMN tipo VARCHAR(50) DEFAULT 'medicamento'`, () => done());
    });
  });
}

// ⭐ Garante campo descricao na tabela atendimento_prescricoes
function garantirCampoDescricao(db) {
  return new Promise((resolve) => {
    db.run(`ALTER TABLE atendimento_prescricoes ADD COLUMN descricao TEXT`, (err) => {
      // Ignora erro se coluna já existe
      resolve();
    });
  });
}

// ⭐ Salva medicamentos na tabela separada (substitui todos da prescrição)
// Usa db.run() (wrapper MySQL compatível) — NÃO usa db.prepare() que não existe no wrapper
async function salvarMedicamentosSeparados(db, prescricaoId, medicamentos) {
  await garantirTabelaMedicamentos(db);

  return new Promise((resolve, reject) => {
    // Remove medicamentos antigos desta prescrição
    db.run('DELETE FROM atendimento_prescricoes_remedios WHERE prescricaoId = ?', [prescricaoId], (err) => {
      if (err) {
        console.error('⚠️ Erro ao limpar medicamentos antigos:', err.message);
      }

      if (!medicamentos || !Array.isArray(medicamentos) || medicamentos.length === 0) {
        return resolve();
      }

      const agora = new Date().toISOString();
      let completed = 0;
      let hasError = false;

      medicamentos.forEach((med, index) => {
        const medId = med.id || `med_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 6)}`;
        db.run(
          `INSERT INTO atendimento_prescricoes_remedios (id, prescricaoId, remedioId, nome, dosagem, quantidade, unidade, posologia, tipo, ordem, criadoEm, atualizadoEm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
          medId,
          prescricaoId,
          med.remedioId || '',
          med.nome || '',
          med.dosagem || '',
          med.quantidade || '',
          med.unidade || '',
          med.posologia || '',
          med.tipo || 'medicamento',
          index,
          agora,
          agora],

          (err) => {
            if (err && !hasError) {
              console.error('❌ Erro ao salvar medicamento:', err.message);
              hasError = true;
              return reject(err);
            }
            completed++;
            if (completed === medicamentos.length && !hasError) {
              console.log(`✅ ${medicamentos.length} medicamento(s) salvos para prescrição ${prescricaoId}`);
              resolve();
            }
          }
        );
      });
    });
  });
}

// ⭐ Carrega medicamentos da tabela separada
async function carregarMedicamentosSeparados(db, prescricaoId) {
  await garantirTabelaMedicamentos(db);

  return new Promise((resolve) => {
    db.all(
      'SELECT * FROM atendimento_prescricoes_remedios WHERE prescricaoId = ? ORDER BY ordem ASC',
      [prescricaoId],
      (err, rows) => {
        if (err) {
          console.error('⚠️ Erro ao carregar medicamentos:', err.message);
          return resolve([]);
        }
        resolve(rows || []);
      }
    );
  });
}

// ⭐ Carrega medicamentos para múltiplas prescrições de uma vez
async function carregarMedicamentosMultiplos(db, prescricaoIds) {
  await garantirTabelaMedicamentos(db);

  if (!prescricaoIds || prescricaoIds.length === 0) return {};

  return new Promise((resolve) => {
    const placeholders = prescricaoIds.map(() => '?').join(',');
    db.all(
      `SELECT * FROM atendimento_prescricoes_remedios WHERE prescricaoId IN (${placeholders}) ORDER BY ordem ASC`,
      prescricaoIds,
      (err, rows) => {
        if (err) {
          console.error('⚠️ Erro ao carregar medicamentos múltiplos:', err.message);
          return resolve({});
        }
        // Agrupa por prescricaoId
        const agrupado = {};
        (rows || []).forEach((row) => {
          if (!agrupado[row.prescricaoId]) agrupado[row.prescricaoId] = [];
          agrupado[row.prescricaoId].push(row);
        });
        resolve(agrupado);
      }
    );
  });
}

// ⭐ Mapeia row de medicamento para o formato de retorno (inclui remedioId)
function mapMedicamento(m) {
  return {
    id: m.id,
    remedioId: m.remedioId || '',
    nome: m.nome || '',
    dosagem: m.dosagem || '',
    quantidade: m.quantidade || '',
    unidade: m.unidade || '',
    posologia: m.posologia || '',
    tipo: m.tipo || 'medicamento'
  };
}

// GET /api/prescricoes?clinicaId=X&pacienteId=Y - Lista prescrições de um paciente
// GET /api/prescricoes?clinicaId=X&consultaId=Y - Busca prescrição de uma consulta
router.get('/', async (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  await garantirCampoDescricao(db);

  let query = 'SELECT * FROM atendimento_prescricoes';
  let params = [];

  if (consultaId) {
    query += ' WHERE consultaId = ?';
    params.push(consultaId);
  } else if (pacienteId) {
    query += ' WHERE pacienteId = ? OR consultaId COLLATE utf8mb4_unicode_ci IN (SELECT id COLLATE utf8mb4_unicode_ci FROM consultas WHERE pacienteId = ?)';
    params.push(pacienteId, pacienteId);
  }

  query += ' ORDER BY data DESC, criadoEm DESC';

  db.all(query, params, async (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar prescrições:', err);
      return res.status(500).json({ error: err.message });
    }

    const prescricoes = rows || [];

    // ⭐ Carrega medicamentos da tabela separada para todas as prescrições
    const prescricaoIds = prescricoes.map((p) => p.id);
    const medicamentosMap = await carregarMedicamentosMultiplos(db, prescricaoIds);

    const resultado = prescricoes.map((row) => {
      // ⭐ PRIORIDADE: tabela separada > JSON legado
      const medsSeparados = medicamentosMap[row.id] || [];

      if (medsSeparados.length > 0) {
        row.medicamentos = medsSeparados.map(mapMedicamento);
      } else {
        // Fallback: parse do JSON legado
        try {
          if (row.medicamentos && typeof row.medicamentos === 'string') {
            row.medicamentos = JSON.parse(row.medicamentos);
          } else if (!row.medicamentos) {
            row.medicamentos = [];
          }
        } catch (e) {
          row.medicamentos = [];
        }
      }

      return row;
    });

    res.json(resultado);
  });
});

// GET /api/prescricoes/:id?clinicaId=X - Busca prescrição por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  await garantirCampoDescricao(db);

  db.get('SELECT * FROM atendimento_prescricoes WHERE id = ?', [id], async (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar prescrição:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Prescrição não encontrada' });
    }

    // ⭐ Carrega medicamentos da tabela separada
    const medsSeparados = await carregarMedicamentosSeparados(db, id);

    if (medsSeparados.length > 0) {
      row.medicamentos = medsSeparados.map(mapMedicamento);
    } else {
      // Fallback: JSON legado
      try {
        if (row.medicamentos && typeof row.medicamentos === 'string') {
          row.medicamentos = JSON.parse(row.medicamentos);
        }
      } catch (e) {
        row.medicamentos = [];
      }
    }

    res.json(row);
  });
});

// POST /api/prescricoes - Cria nova prescrição
router.post('/', async (req, res) => {
  const { clinicaId, consultaId, pacienteId, ...dados } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }
  if (!consultaId) {
    return res.status(400).json({ error: 'consultaId é obrigatório' });
  }
  if (!pacienteId) {
    return res.status(400).json({ error: 'pacienteId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  await garantirCampoDescricao(db);
  const agora = new Date().toISOString();
  const id = dados.id || `presc_${Date.now()}`;

  // ⭐ Mantém JSON para compatibilidade, mas salva também na tabela separada
  const medicamentosArray = Array.isArray(dados.medicamentos) ? dados.medicamentos : [];
  const medicamentosJSON = JSON.stringify(medicamentosArray);

  db.run(
    `INSERT INTO atendimento_prescricoes (id, consultaId, pacienteId, descricao, controleEspecial, data, generico, medicamentos, profissionalId, profissional, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    id, consultaId, pacienteId,
    dados.descricao || '',
    dados.controleEspecial ? 1 : 0,
    dados.data || agora.split('T')[0],
    dados.generico || null,
    medicamentosJSON,
    dados.profissionalId || null,
    dados.profissional || null,
    agora, agora],

    async function (err) {
      if (err) {
        console.error('❌ Erro ao criar prescrição:', err);
        return res.status(500).json({ error: err.message });
      }

      // ⭐ Salva medicamentos na tabela separada (com remedioId)
      try {
        await salvarMedicamentosSeparados(db, id, medicamentosArray);
      } catch (errMed) {
        console.error('⚠️ Erro ao salvar medicamentos separados (prescrição criada):', errMed.message);
      }

      console.log(`✅ Prescrição criada: ${id} → consulta ${consultaId} | desc: "${dados.descricao || ''}" | ${medicamentosArray.length} medicamento(s)`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/prescricoes/:id - Atualiza prescrição
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, ...updates } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  await garantirCampoDescricao(db);
  const agora = new Date().toISOString();

  // ⭐ Extrai medicamentos para salvar na tabela separada
  let medicamentosParaSalvar = null;
  if ('medicamentos' in updates) {
    medicamentosParaSalvar = Array.isArray(updates.medicamentos) ? updates.medicamentos : [];
    // Mantém JSON para compatibilidade
    updates.medicamentos = JSON.stringify(medicamentosParaSalvar);
  }

  // Converte controleEspecial para INTEGER
  if ('controleEspecial' in updates) {
    updates.controleEspecial = updates.controleEspecial ? 1 : 0;
  }

  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0 && !medicamentosParaSalvar) {
    return res.json({ success: true });
  }

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(
    `UPDATE atendimento_prescricoes SET ${setClause}, atualizadoEm = ? WHERE id = ?`,
    [...valores, agora, id],
    async function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar prescrição:', err);
        return res.status(500).json({ error: err.message });
      }

      // ⭐ Atualiza medicamentos na tabela separada (com remedioId)
      if (medicamentosParaSalvar !== null) {
        try {
          await salvarMedicamentosSeparados(db, id, medicamentosParaSalvar);
        } catch (errMed) {
          console.error('⚠️ Erro ao atualizar medicamentos separados:', errMed.message);
        }
      }

      console.log(`✅ Prescrição atualizada: ${id}${medicamentosParaSalvar ? ` | ${medicamentosParaSalvar.length} medicamento(s)` : ''}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/prescricoes/:id?clinicaId=X - Deleta prescrição
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // ⭐ Deleta medicamentos da tabela separada primeiro
  try {
    await garantirTabelaMedicamentos(db);
    await new Promise((resolve) => {
      db.run('DELETE FROM atendimento_prescricoes_remedios WHERE prescricaoId = ?', [id], (err) => {
        if (err) console.error('⚠️ Erro ao deletar medicamentos:', err.message);
        resolve();
      });
    });
  } catch (e) {
    console.error('⚠️ Erro ao limpar medicamentos da prescrição:', e.message);
  }

  db.run('DELETE FROM atendimento_prescricoes WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar prescrição:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Prescrição deletada: ${id} (com medicamentos)`);
    res.json({ success: true });
  });
});

module.exports = router;