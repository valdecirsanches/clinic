
// ==================== ROTAS DE ATENDIMENTOS (LEGADO / COMPATIBILIDADE) ====================
// ⚠️ FILOSOFIA OFICIAL: "a CONSULTA é o atendimento". A entidade central do prontuário
//    é a tabela `consultas` (ver server/routes/consultas.js e prontuarios.js). Os dados
//    clínicos ficam nas tabelas separadas ligadas por consultaId:
//    anamneses, exames_fisicos, diagnosticos, prescricoes, exames_solicitados, evolucoes.
//
//    Esta tabela `atendimentos` é LEGADO mantido apenas para compatibilidade com
//    consumidores antigos (ex.: ProntuariosPage.handleSaveProntuario). NÃO use como base
//    para novos desenvolvimentos e NÃO exclua a tabela (há histórico importado).
//    Novos fluxos devem gravar usando consultaId da consulta real.
// ============================================================================================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/atendimentos?clinicaId=X
router.get('/', (req, res) => {
  const { clinicaId, prontuarioId, pacienteId, consultaId } = req.query;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  let query = 'SELECT * FROM atendimentos';
  let params = [];
  let conditions = [];

  if (prontuarioId) {conditions.push('prontuarioId = ?');params.push(prontuarioId);}
  if (pacienteId) {conditions.push('pacienteId = ?');params.push(pacienteId);}
  if (consultaId) {conditions.push('consultaId = ?');params.push(consultaId);}

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY data DESC, criadoEm DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar atendimentos:', err);
      return res.status(500).json({ error: err.message });
    }

    const atendimentos = (rows || []).map((row) => ({
      ...row,
      odontograma: row.odontograma ? JSON.parse(row.odontograma) : null
    }));

    res.json(atendimentos);
  });
});

// GET /api/atendimentos/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM atendimentos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Atendimento não encontrado' });

    res.json({
      ...row,
      odontograma: row.odontograma ? JSON.parse(row.odontograma) : null
    });
  });
});

// POST /api/atendimentos
router.post('/', (req, res) => {
  const { clinicaId, prontuarioId, pacienteId, ...dados } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!prontuarioId) return res.status(400).json({ error: 'prontuarioId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const id = `atend_${Date.now()}`;
  const criadoEm = new Date().toISOString();

  db.run(
    `INSERT INTO atendimentos (
      id, prontuarioId, pacienteId, consultaId, data, tipo, status,
      profissional, profissionalId, observacoes, odontograma,
      assinaturaPaciente, dataAssinatura, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    id,
    prontuarioId,
    pacienteId || null,
    dados.consultaId || null,
    dados.data || criadoEm.split('T')[0],
    dados.tipo || 'medica',
    dados.status || 'em_andamento',
    dados.profissional || null,
    dados.profissionalId || null,
    dados.observacoes || null,
    dados.odontograma ? JSON.stringify(dados.odontograma) : null,
    dados.assinaturaPaciente || null,
    dados.dataAssinatura || null,
    criadoEm],

    function (err) {
      if (err) {
        console.error('❌ Erro ao criar atendimento:', err);
        return res.status(500).json({ error: err.message });
      }

      // Atualiza data do prontuário
      db.run('UPDATE prontuarios SET atualizadoEm = ? WHERE id = ?', [criadoEm, prontuarioId]);

      console.log(`✅ Atendimento criado: ${id} | profissional: ${dados.profissional || '?'} | profissionalId: ${dados.profissionalId || '?'}`);
      res.json({ id, prontuarioId, pacienteId, ...dados, criadoEm });
    }
  );
});

// PUT /api/atendimentos/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, ...updates } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  // Verifica se está assinado
  db.get('SELECT assinaturaPaciente FROM atendimentos WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row && row.assinaturaPaciente) {
      return res.status(403).json({
        error: 'Atendimento bloqueado',
        message: 'Este atendimento já foi assinado pelo paciente e não pode ser editado.'
      });
    }

    // Campos permitidos na tabela simplificada
    const camposPermitidos = [
    'consultaId', 'data', 'tipo', 'status',
    'profissional', 'profissionalId',
    'observacoes', 'odontograma',
    'assinaturaPaciente', 'dataAssinatura'];


    const campos = [];
    const valores = [];

    camposPermitidos.forEach((campo) => {
      if (updates[campo] !== undefined) {
        campos.push(`${campo} = ?`);
        if (campo === 'odontograma' && updates[campo]) {
          valores.push(JSON.stringify(updates[campo]));
        } else {
          valores.push(updates[campo]);
        }
      }
    });

    if (campos.length === 0) return res.json({ success: true });

    valores.push(id);

    db.run(
      `UPDATE atendimentos SET ${campos.join(', ')} WHERE id = ?`,
      valores,
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar atendimento:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Atendimento atualizado: ${id}`);
        res.json({ success: true });
      }
    );
  });
});

// DELETE /api/atendimentos/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  db.get('SELECT assinaturaPaciente FROM atendimentos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row && row.assinaturaPaciente) {
      return res.status(403).json({
        error: 'Atendimento bloqueado',
        message: 'Este atendimento já foi assinado e não pode ser excluído.'
      });
    }

    db.run('DELETE FROM atendimentos WHERE id = ?', [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      console.log(`✅ Atendimento deletado: ${req.params.id}`);
      res.json({ success: true });
    });
  });
});

module.exports = router;