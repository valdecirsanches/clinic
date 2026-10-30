// ==================== MERCADO PAGO (recebimento das assinaturas) ====================
// Configuração FIXA no server/.env.local:
//   MERCADOPAGO_ACCESS_TOKEN=APP_USR-... (produção) ou TEST-... (teste)
//   MERCADOPAGO_PAYER_EMAIL=financeiro@... (opcional, e-mail padrão do pagador)
//   MERCADOPAGO_PIX_VALIDADE_MIN=1440 (opcional, validade do QR em minutos)
//   PUBLIC_API_URL=https://clinic-api.sky9.com.br (opcional, base do webhook)
//
// ⚠️ Nada aqui confia no aviso do webhook: a situação do pagamento é sempre
// CONSULTADA na API do Mercado Pago antes de dar baixa.

const crypto = require('crypto');
const { requisitar, motivoErro, marcarSegredo } = require('./httpJson');

const API = 'https://api.mercadopago.com';

function token() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

function configurado() {
  return Boolean(token());
}

function ambiente() {
  const t = token();
  if (!t) return null;
  return t.startsWith('TEST-') ? 'teste' : 'producao';
}

function resumoConfig(urlWebhook) {
  return {
    configurado: configurado(),
    ambiente: ambiente(),
    accessToken: marcarSegredo(token()),
    payerEmail: String(process.env.MERCADOPAGO_PAYER_EMAIL || '').trim() || null,
    validadePixMin: validadePixMin(),
    urlWebhook
  };
}

function validadePixMin() {
  const v = Number(process.env.MERCADOPAGO_PIX_VALIDADE_MIN || 1440);
  return Number.isFinite(v) && v >= 30 ? v : 1440;
}

function cabecalhos(chaveIdempotencia) {
  const h = { Authorization: `Bearer ${token()}` };
  if (chaveIdempotencia) h['X-Idempotency-Key'] = chaveIdempotencia;
  return h;
}

async function chamar(caminho, opcoes = {}) {
  if (!configurado()) {
    throw new Error('Mercado Pago não configurado: defina MERCADOPAGO_ACCESS_TOKEN no server/.env.local');
  }
  const resposta = await requisitar(`${API}${caminho}`, {
    ...opcoes,
    headers: { ...cabecalhos(opcoes.idempotencia), ...(opcoes.headers || {}) },
    timeoutMs: 20000
  });
  if (!resposta.ok) {
    const erro = new Error(`Mercado Pago: ${motivoErro(resposta)}`);
    erro.status = resposta.status;
    throw erro;
  }
  return resposta.dados;
}

/** Testa a credencial (GET /users/me) */
async function testarCredencial() {
  const dados = await chamar('/users/me');
  return {
    id: dados.id,
    apelido: dados.nickname,
    email: dados.email,
    pais: dados.site_id,
    ambiente: ambiente()
  };
}

function descricaoFatura(fatura, clinicaNome) {
  const [ano, mes] = String(fatura.competencia).split('-');
  return `Assinatura ${mes}/${ano}${clinicaNome ? ` — ${clinicaNome}` : ''}`.slice(0, 120);
}

/** Cria cobrança PIX dinâmica */
async function criarPix({ fatura, clinica, urlWebhook }) {
  const expira = new Date(Date.now() + validadePixMin() * 60000);
  const email = clinica && clinica.email || process.env.MERCADOPAGO_PAYER_EMAIL;
  if (!email) {
    throw new Error('Informe o e-mail da clínica no cadastro (ou MERCADOPAGO_PAYER_EMAIL) para gerar o PIX.');
  }
  const corpo = {
    transaction_amount: Number(Number(fatura.valorTotal).toFixed(2)),
    description: descricaoFatura(fatura, clinica && clinica.nome),
    payment_method_id: 'pix',
    external_reference: fatura.id,
    date_of_expiration: expira.toISOString().replace('Z', '-00:00'),
    payer: {
      email,
      first_name: String(clinica && clinica.nome || 'Clinica').slice(0, 60)
    }
  };
  const cnpj = String(clinica && clinica.cnpj || '').replace(/\D/g, '');
  if (cnpj.length === 14) corpo.payer.identification = { type: 'CNPJ', number: cnpj };
  if (urlWebhook) corpo.notification_url = urlWebhook;

  const dados = await chamar('/v1/payments', {
    method: 'POST',
    body: corpo,
    idempotencia: crypto.randomUUID()
  });
  const td = dados.point_of_interaction && dados.point_of_interaction.transaction_data || {};
  return {
    paymentId: String(dados.id),
    status: dados.status,
    qrCode: td.qr_code || '',
    qrCodeBase64: td.qr_code_base64 || '',
    ticketUrl: td.ticket_url || '',
    expiraEm: expira.toISOString()
  };
}

/** Checkout Pro (cartão, boleto, saldo MP) */
async function criarCheckout({ fatura, clinica, urlWebhook, urlRetorno }) {
  const corpo = {
    items: [
    {
      id: fatura.id,
      title: descricaoFatura(fatura, clinica && clinica.nome),
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(Number(fatura.valorTotal).toFixed(2))
    }],

    external_reference: fatura.id,
    statement_descriptor: 'ASSINATURA'
  };
  if (clinica && clinica.email) corpo.payer = { email: clinica.email, name: clinica.nome };
  if (urlWebhook) corpo.notification_url = urlWebhook;
  if (urlRetorno) {
    corpo.back_urls = { success: urlRetorno, pending: urlRetorno, failure: urlRetorno };
  }
  const dados = await chamar('/checkout/preferences', {
    method: 'POST',
    body: corpo,
    idempotencia: crypto.randomUUID()
  });
  return {
    preferenciaId: dados.id,
    url: ambiente() === 'teste' ? dados.sandbox_init_point || dados.init_point : dados.init_point
  };
}

async function consultarPagamento(paymentId) {
  const dados = await chamar(`/v1/payments/${encodeURIComponent(paymentId)}`);
  return normalizarPagamento(dados);
}

/** Procura pagamento aprovado de uma fatura (quando o aviso não chegou) */
async function buscarAprovadoDaFatura(faturaId) {
  const dados = await chamar(
    `/v1/payments/search?external_reference=${encodeURIComponent(faturaId)}&sort=date_created&criteria=desc&limit=20`
  );
  const resultados = dados && dados.results || [];
  const aprovado = resultados.find((p) => p.status === 'approved');
  return aprovado ? normalizarPagamento(aprovado) : null;
}

function normalizarPagamento(p) {
  return {
    id: String(p.id),
    status: p.status,
    detalhe: p.status_detail,
    valor: Number(p.transaction_amount) || 0,
    referencia: p.external_reference || null,
    metodo: p.payment_type_id || p.payment_method_id || null,
    aprovadoEm: p.date_approved || null
  };
}

/** Forma de pagamento da fatura a partir do tipo do Mercado Pago */
function formaDoMetodo(metodo) {
  if (metodo === 'bank_transfer' || metodo === 'pix') return 'pix';
  if (metodo === 'ticket') return 'boleto';
  if (metodo === 'credit_card' || metodo === 'debit_card') return 'cartao_credito';
  return 'pix';
}

module.exports = {
  configurado,
  ambiente,
  resumoConfig,
  testarCredencial,
  criarPix,
  criarCheckout,
  consultarPagamento,
  buscarAprovadoDaFatura,
  formaDoMetodo
};