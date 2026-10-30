// ============ PAGAMENTO DA ASSINATURA PELO MERCADO PAGO ============
// Montado em /api/assinatura (antes do router principal).
//   GET  /pagamento/config                  → o que está disponível para a clínica
//   POST /faturas/:id/mercadopago/pix       → QR Code PIX dinâmico
//   POST /faturas/:id/mercadopago/checkout  → link de cartão/boleto
//   POST /faturas/:id/verificar             → consulta o MP e dá baixa se aprovado
//   POST /webhook/mercadopago               → aviso do MP (sempre reconsultado)

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const calculo = require('../services/assinaturaCalculo');
const mp = require('../services/mercadoPago');
const { confirmarPagamento } = require('../services/baixaFatura');
const { lerCorpoTexto } = require('../services/superAdmin');
const { urlPublicaApi } = require('../services/httpJson');

router.use(lerCorpoTexto);

function urlWebhook(req) {
  const base = urlPublicaApi(req);
  return base ? `${base}/api/assinatura/webhook/mercadopago` : '';
}

async function dadosClinica(clinicaId) {
  return await dbGlobal.
  prepare('SELECT id, nome, email, cnpj FROM clinicas WHERE id = ?').
  get(clinicaId).
  catch(() => null);
}

async function faturaPagavel(req, res) {
  const fatura = await calculo.buscarFaturaBruta(req.params.id);
  if (!fatura) {
    res.status(404).json({ error: 'Fatura não encontrada' });
    return null;
  }
  if (fatura.status === 'paga') {
    res.status(409).json({ error: 'Esta fatura já está paga.', fatura: calculo.normalizarFatura(fatura) });
    return null;
  }
  if (Number(fatura.valorTotal) <= 0) {
    res.status(400).json({ error: 'Fatura sem valor a pagar.' });
    return null;
  }
  return fatura;
}

/** Valida o pagamento do MP contra a fatura e dá baixa */
async function baixarSeAprovado(fatura, pagamento) {
  if (!pagamento) return null;
  await dbGlobal.
  prepare('UPDATE assinatura_faturas SET mpStatus = ? WHERE id = ?').
  run(pagamento.status, fatura.id);
  if (pagamento.status !== 'approved') return null;
  if (pagamento.referencia !== fatura.id) {
    console.warn(`💳 ⚠️ [MP] Pagamento ${pagamento.id} não pertence à fatura ${fatura.id}`);
    return null;
  }
  if (pagamento.valor + 0.01 < Number(fatura.valorTotal)) {
    console.warn(`💳 ⚠️ [MP] Pagamento ${pagamento.id} de R$ ${pagamento.valor} não cobre R$ ${fatura.valorTotal}`);
    return null;
  }
  return await confirmarPagamento(fatura.id, {
    formaPagamento: mp.formaDoMetodo(pagamento.metodo),
    origem: 'mercadopago',
    mpPaymentId: pagamento.id,
    mpStatus: pagamento.status
  });
}

router.get('/pagamento/config', (req, res) => {
  res.json({ mercadoPago: mp.configurado(), ambiente: mp.ambiente() });
});

router.post('/faturas/:id/mercadopago/pix', async (req, res) => {
  try {
    await calculo.garantirTabelas();
    const fatura = await faturaPagavel(req, res);
    if (!fatura) return;

    // Reaproveita o QR ainda válido: não cria cobranças duplicadas
    if (
    fatura.mpPixQr &&
    fatura.mpPixExpira &&
    fatura.mpPixExpira > new Date(Date.now() + 60000).toISOString() &&
    fatura.mpStatus !== 'cancelled')
    {
      return res.json({
        paymentId: fatura.mpPaymentId,
        status: fatura.mpStatus,
        qrCode: fatura.mpPixQr,
        qrCodeBase64: fatura.mpPixQrBase64,
        expiraEm: fatura.mpPixExpira,
        reaproveitado: true
      });
    }

    const clinica = await dadosClinica(fatura.clinicaId);
    const pix = await mp.criarPix({
      fatura: calculo.normalizarFatura(fatura),
      clinica,
      urlWebhook: urlWebhook(req)
    });
    await dbGlobal.
    prepare(
      `UPDATE assinatura_faturas
            SET mpPaymentId = ?, mpStatus = ?, mpPixQr = ?, mpPixQrBase64 = ?, mpPixExpira = ?
          WHERE id = ?`
    ).
    run(pix.paymentId, pix.status, pix.qrCode, pix.qrCodeBase64, pix.expiraEm, fatura.id);
    res.json(pix);
  } catch (err) {
    console.error('💳 ❌ [MP] PIX:', err.message);
    res.status(err.status && err.status < 500 ? 400 : 502).json({ error: err.message });
  }
});

router.post('/faturas/:id/mercadopago/checkout', async (req, res) => {
  try {
    await calculo.garantirTabelas();
    const fatura = await faturaPagavel(req, res);
    if (!fatura) return;
    const clinica = await dadosClinica(fatura.clinicaId);
    const retorno = String(req.body && req.body.urlRetorno || '').trim();
    const checkout = await mp.criarCheckout({
      fatura: calculo.normalizarFatura(fatura),
      clinica,
      urlWebhook: urlWebhook(req),
      urlRetorno: /^https:\/\//.test(retorno) ? retorno : ''
    });
    await dbGlobal.
    prepare('UPDATE assinatura_faturas SET mpCheckoutUrl = ? WHERE id = ?').
    run(checkout.url, fatura.id);
    res.json(checkout);
  } catch (err) {
    console.error('💳 ❌ [MP] Checkout:', err.message);
    res.status(err.status && err.status < 500 ? 400 : 502).json({ error: err.message });
  }
});

router.post('/faturas/:id/verificar', async (req, res) => {
  try {
    await calculo.garantirTabelas();
    const fatura = await calculo.buscarFaturaBruta(req.params.id);
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });
    if (fatura.status === 'paga') {
      return res.json({ pago: true, fatura: calculo.normalizarFatura(fatura) });
    }
    if (!mp.configurado()) {
      return res.json({ pago: false, fatura: calculo.normalizarFatura(fatura) });
    }

    let pagamento = null;
    if (fatura.mpPaymentId) pagamento = await mp.consultarPagamento(fatura.mpPaymentId);
    if (!pagamento || pagamento.status !== 'approved') {
      pagamento = (await mp.buscarAprovadoDaFatura(fatura.id)) || pagamento;
    }
    const baixa = await baixarSeAprovado(fatura, pagamento);
    const atual = await calculo.buscarFaturaBruta(fatura.id);
    res.json({
      pago: Boolean(baixa) || atual.status === 'paga',
      statusMercadoPago: pagamento ? pagamento.status : null,
      fatura: calculo.normalizarFatura(atual)
    });
  } catch (err) {
    console.error('💳 ❌ [MP] Verificação:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Webhook: responde 200 de imediato e processa em seguida (o MP reenvia se
// não receber 200 rápido). O aviso só traz o id: a verdade vem da consulta.
router.post('/webhook/mercadopago', (req, res) => {
  res.sendStatus(200);
  const corpo = req.body || {};
  const tipo = corpo.type || corpo.topic || req.query.type || req.query.topic;
  const paymentId =
  corpo.data && corpo.data.id || req.query['data.id'] || req.query.id || corpo.id;
  if (!paymentId || tipo && tipo !== 'payment') return;

  setImmediate(async () => {
    try {
      await calculo.garantirTabelas();
      const pagamento = await mp.consultarPagamento(paymentId);
      if (!pagamento.referencia) return;
      const fatura = await calculo.buscarFaturaBruta(pagamento.referencia);
      if (!fatura) return;
      const baixa = await baixarSeAprovado(fatura, pagamento);
      console.log(
        `💳 [MP webhook] Pagamento ${paymentId} (${pagamento.status}) fatura ${fatura.id}${baixa ? ' → BAIXADA' : ''}`
      );
    } catch (err) {
      console.error(`💳 ❌ [MP webhook] ${paymentId}: ${err.message}`);
    }
  });
});

module.exports = router;