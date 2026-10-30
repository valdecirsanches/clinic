// ============ CONFIRMAÇÃO PÚBLICA DE CONSULTA (link enviado por SMS) ============
// O SMS não tem menu interativo como o WhatsApp, então o paciente recebe um LINK
// curto e responde numa página pública: confirma ou cancela informando o motivo.
//
// O token carrega a clínica (clinicaId.hex) porque a página é aberta sem login e
// cada clínica tem o seu próprio banco.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getClinicaDB } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');

function gerarHex() {
  return crypto.randomBytes(24).toString('hex');
}

function separarToken(token) {
  const bruto = String(token || '');
  const separador = bruto.indexOf('.');
  if (separador <= 0) return null;
  return {
    clinicaId: bruto.slice(0, separador),
    token: bruto
  };
}

// As colunas são criadas sob demanda para não exigir migração manual
function garantirColunas(db) {
  return new Promise((resolve) => {
    const migrations = [
    `ALTER TABLE consultas ADD COLUMN confirmacaoToken VARCHAR(191)`,
    `ALTER TABLE consultas ADD COLUMN confirmacaoCanal VARCHAR(30)`,
    `ALTER TABLE consultas ADD COLUMN canalCancelamento VARCHAR(30)`];

    const executarProxima = (index) => {
      if (index >= migrations.length) return resolve();
      db.run(migrations[index], () => executarProxima(index + 1));
    };
    executarProxima(0);
  });
}

// POST /api/confirmacao/gerar — cria (ou reaproveita) o link do paciente
// Body: { clinicaId, consultaId }
router.post('/gerar', async (req, res) => {
  const { clinicaId, consultaId } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!consultaId) return res.status(400).json({ error: 'consultaId é obrigatório' });

  try {
    const db = getClinicaDB(clinicaId);
    await garantirColunas(db);

    const consulta = await new Promise((r) =>
    db.get('SELECT id, confirmacaoToken FROM consultas WHERE id = ?', [consultaId], (err, row) =>
    r(err ? null : row || null)
    )
    );
    if (!consulta) return res.status(404).json({ error: 'Consulta não encontrada' });

    if (consulta.confirmacaoToken) {
      return res.json({ token: consulta.confirmacaoToken });
    }

    const token = `${clinicaId}.${gerarHex()}`;
    await new Promise((resolve, reject) =>
    db.run(
      'UPDATE consultas SET confirmacaoToken = ? WHERE id = ?',
      [token, consultaId],
      (err) => err ? reject(err) : resolve()
    )
    );
    res.json({ token });
  } catch (err) {
    console.error('❌ [confirmacao] Erro ao gerar token:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/confirmacao/:token — dados que o paciente vê (público, sem login)
router.get('/:token', async (req, res) => {
  const info = separarToken(req.params.token);
  if (!info) return res.status(400).json({ error: 'Link inválido' });

  try {
    const db = getClinicaDB(info.clinicaId);
    await garantirColunas(db);

    const consulta = await new Promise((r) =>
    db.get(
      `SELECT id, pacienteNome, data, horario, profissional, status, tipo,
              modalidade, motivoCancelamento, confirmacaoRecebidaEm
         FROM consultas WHERE confirmacaoToken = ?`,
      [info.token],
      (err, row) => r(err ? null : row || null)
    )
    );
    if (!consulta) return res.status(404).json({ error: 'Link inválido ou expirado' });

    // Nome da clínica para o paciente reconhecer de onde vem o aviso
    let clinicaNome = null;
    try {
      const clinica = await dbGlobal.
      prepare('SELECT nome FROM clinicas WHERE id = ?').
      get(info.clinicaId);
      clinicaNome = clinica?.nome || null;
    } catch (e) {
      clinicaNome = null;
    }

    res.json({ ...consulta, clinicaNome });
  } catch (err) {
    console.error('❌ [confirmacao] Erro ao carregar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/confirmacao/:token/responder — { acao: 'confirmar' | 'cancelar', motivo? }
router.post('/:token/responder', async (req, res) => {
  const info = separarToken(req.params.token);
  if (!info) return res.status(400).json({ error: 'Link inválido' });

  const { acao, motivo } = req.body;
  if (acao !== 'confirmar' && acao !== 'cancelar') {
    return res.status(400).json({ error: "acao deve ser 'confirmar' ou 'cancelar'" });
  }
  if (acao === 'cancelar' && !String(motivo || '').trim()) {
    return res.status(400).json({ error: 'Informe o motivo do cancelamento' });
  }

  try {
    const db = getClinicaDB(info.clinicaId);
    await garantirColunas(db);

    const consulta = await new Promise((r) =>
    db.get(
      'SELECT id, status, motivoCancelamento, confirmacaoRecebidaEm FROM consultas WHERE confirmacaoToken = ?',
      [info.token],
      (err, row) => r(err ? null : row || null)
    )
    );
    if (!consulta) return res.status(404).json({ error: 'Link inválido ou expirado' });

    // ⭐ O link é de uso ÚNICO por decisão: se o paciente já respondeu, nada é
    // sobrescrito. Isso evita que um segundo clique cancele uma consulta já
    // confirmada (ou o contrário) sem o conhecimento da clínica.
    if (consulta.status === 'confirmada' || consulta.status === 'cancelada') {
      return res.status(409).json({
        error: 'Esta consulta já foi respondida.',
        jaRespondido: true,
        status: consulta.status,
        respondidoEm: consulta.confirmacaoRecebidaEm || null,
        motivoCancelamento: consulta.motivoCancelamento || null
      });
    }

    const agora = new Date().toISOString();

    if (acao === 'confirmar') {
      await new Promise((resolve, reject) =>
      db.run(
        `UPDATE consultas
            SET status = 'confirmada', confirmacaoRecebidaEm = ?, confirmacaoCanal = 'sms'
          WHERE id = ?`,
        [agora, consulta.id],
        (err) => err ? reject(err) : resolve()
      )
      );
      console.log(`📲 ✅ [confirmacao] Consulta ${consulta.id} CONFIRMADA pelo paciente (link SMS)`);
      return res.json({ status: 'confirmada' });
    }

    await new Promise((resolve, reject) =>
    db.run(
      `UPDATE consultas
          SET status = 'cancelada', motivoCancelamento = ?, confirmacaoRecebidaEm = ?,
              confirmacaoCanal = 'sms', canalCancelamento = 'sms'
        WHERE id = ?`,
      [String(motivo).trim(), agora, consulta.id],
      (err) => err ? reject(err) : resolve()
    )
    );
    console.log(`📲 🚫 [confirmacao] Consulta ${consulta.id} CANCELADA pelo paciente (link SMS)`);
    res.json({ status: 'cancelada' });
  } catch (err) {
    console.error('❌ [confirmacao] Erro ao responder:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;