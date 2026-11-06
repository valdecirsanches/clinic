// ==================== ANÚNCIOS (Google AdSense) ====================
// GET /api/anuncios?clinicaId=…  → { exibir: boolean }
// Anúncios só para clínicas SEM plano pago. Super admin nunca vê anúncio.
// O acesso à clínica pedida já é conferido pelo middleware de autenticação.
const express = require('express');
const { clinicaPagante } = require('../services/limitesPlano');

const router = express.Router();

router.get('/', async (req, res) => {
  const usuario = req.usuario || null;
  if (usuario && usuario.tipo === 'super_admin') return res.json({ exibir: false });
  const clinicaId = String(req.query.clinicaId || usuario && usuario.clinicaId || '').trim();
  if (!clinicaId) return res.json({ exibir: false });
  const pagante = await clinicaPagante(clinicaId);
  res.json({ exibir: !pagante });
});

module.exports = router;
