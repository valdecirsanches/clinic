// ==================== ROTAS DE DIAGNÓSTICOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Auto-criação da tabela se não existir (MySQL compatível)
function ensureTable(db, callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS diagnosticos (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191),
      pacienteId VARCHAR(191) NOT NULL,
      diagnosticoPrincipalCodigo VARCHAR(20),
      diagnosticoPrincipalDescricao TEXT,
      outrosDiagnosticos TEXT,
      observacoes TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    )
  `, (err) => {
    if (err && err.code !== 'ER_TABLE_EXISTS_ERROR') {
      console.error('❌ Erro ao criar tabela diagnosticos:', err.message);
    }
    if (callback) callback();
  });
}

// GET /api/diagnosticos?clinicaId=X&pacienteId=Y
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  ensureTable(db, () => {
    let query = 'SELECT * FROM diagnosticos';
    let params = [];

    if (consultaId) {query += ' WHERE consultaId = ?';params.push(consultaId);} else
    if (pacienteId) {
      query += ' WHERE pacienteId = ? OR consultaId COLLATE utf8mb4_unicode_ci IN (SELECT id COLLATE utf8mb4_unicode_ci FROM consultas WHERE pacienteId = ?)';
      params.push(pacienteId, pacienteId);
    }

    query += ' ORDER BY data DESC, criadoEm DESC';

    db.all(query, params, (err, rows) => {
      if (err) {console.error('❌ Erro ao buscar diagnósticos:', err);return res.status(500).json({ error: err.message });}
      // Reconstrói o objeto estruturado para o frontend
      const resultado = (rows || []).map((row) => {
        let outrosDiag = [];
        if (row.outrosDiagnosticos) {
          try {
            const parsed = JSON.parse(row.outrosDiagnosticos);
            outrosDiag = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            // Se não é JSON válido, trata como texto simples (ex: "B45.1")
            console.warn(`⚠️ [Diagnósticos] outrosDiagnosticos não é JSON válido para id=${row.id}: "${row.outrosDiagnosticos}"`);
            outrosDiag = [{ codigo: row.outrosDiagnosticos, descricao: '' }];
          }
        }
        return {
          ...row,
          diagnosticoPrincipal: row.diagnosticoPrincipalCodigo ? {
            codigo: row.diagnosticoPrincipalCodigo,
            descricao: row.diagnosticoPrincipalDescricao || ''
          } : null,
          outrosDiagnosticos: outrosDiag
        };
      });
      res.json(resultado);
    });
  });
});

// GET /api/diagnosticos/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM diagnosticos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Diagnóstico não encontrado' });
    row.diagnosticoPrincipal = row.diagnosticoPrincipalCodigo ? {
      codigo: row.diagnosticoPrincipalCodigo,
      descricao: row.diagnosticoPrincipalDescricao || ''
    } : null;
    try {
      const parsed = row.outrosDiagnosticos ? JSON.parse(row.outrosDiagnosticos) : [];
      row.outrosDiagnosticos = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      row.outrosDiagnosticos = row.outrosDiagnosticos ? [{ codigo: row.outrosDiagnosticos, descricao: '' }] : [];
    }
    res.json(row);
  });
});

// POST /api/diagnosticos
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!consultaId) return res.status(400).json({ error: 'consultaId é obrigatório' });
  if (!pacienteId) return res.status(400).json({ error: 'pacienteId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `diag_${Date.now()}`;

  // Extrai dados estruturados
  const diagPrincipal = dados.diagnosticoPrincipal;
  const outrosDiag = dados.outrosDiagnosticos;

  db.run(
    `INSERT INTO diagnosticos (id, consultaId, pacienteId, diagnosticoPrincipalCodigo, diagnosticoPrincipalDescricao, outrosDiagnosticos, observacoes, profissionalId, profissional, data, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, consultaId, pacienteId,
    diagPrincipal?.codigo || null,
    diagPrincipal?.descricao || null,
    outrosDiag ? JSON.stringify(outrosDiag) : null,
    dados.observacoes || null,
    dados.profissionalId || null, dados.profissional || null,
    dados.data || agora.split('T')[0], agora, agora],
    function (err) {
      if (err) {console.error('❌ Erro ao criar diagnóstico:', err);return res.status(500).json({ error: err.message });}
      console.log(`✅ Diagnóstico criado: ${id}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/diagnosticos/:id
router.put('/:id', (req, res) => {
  const { clinicaId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();

  // Monta os campos para update
  const updates = {};
  if (dados.diagnosticoPrincipal !== undefined) {
    updates.diagnosticoPrincipalCodigo = dados.diagnosticoPrincipal?.codigo || null;
    updates.diagnosticoPrincipalDescricao = dados.diagnosticoPrincipal?.descricao || null;
  }
  if (dados.outrosDiagnosticos !== undefined) {
    updates.outrosDiagnosticos = JSON.stringify(dados.outrosDiagnosticos);
  }
  if (dados.observacoes !== undefined) {
    updates.observacoes = dados.observacoes;
  }

  const campos = Object.keys(updates);
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(`UPDATE diagnosticos SET ${setClause}, atualizadoEm = ? WHERE id = ?`, [...valores, agora, req.params.id], function (err) {
    if (err) {console.error('❌ Erro ao atualizar diagnóstico:', err);return res.status(500).json({ error: err.message });}
    console.log(`✅ Diagnóstico atualizado: ${req.params.id}`);
    res.json({ success: true });
  });
});

// DELETE /api/diagnosticos/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.run('DELETE FROM diagnosticos WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;