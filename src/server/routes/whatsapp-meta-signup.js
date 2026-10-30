// ============ EMBEDDED SIGNUP: A CLÍNICA CADASTRA O PRÓPRIO NÚMERO ============
// Sem isto, todas as clínicas enviariam pelo MESMO número (o da plataforma) — o
// paciente veria um remetente que não é o da clínica dele, e o limite de envio,
// a qualidade e um eventual bloqueio seriam compartilhados por todos.
//
// O fluxo é o oficial da Meta (Embedded Signup):
//   [Conectar WhatsApp] → janela da Meta → login do cliente → empresa dele →
//   cria/seleciona a WABA → cadastra o número → código SMS → verifica
//   → a Meta devolve WABA ID + Phone Number ID + um "code"
//
// O navegador NUNCA recebe token: ele entrega apenas o `code`, e é o SERVIDOR
// que o troca pelo token permanente da clínica (o App Secret não pode sair daqui).

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getClinicaDB } = require('../databaseClinica');
const { buscarConfigMeta } = require('./whatsapp-meta');

const GRAPH_BASE_URL = 'https://graph.facebook.com';
const API_VERSION_PADRAO = 'v21.0';

let fetchCompat =
typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
if (!fetchCompat) {
  try {
    const nodeFetch = require('node-fetch');
    fetchCompat = (...args) => nodeFetch(...args);
  } catch (e) {
    fetchCompat = null;
  }
}

function comOrcamento(promessa, ms, mensagem) {
  return Promise.race([
  promessa,
  new Promise((_, reject) => setTimeout(() => reject(new Error(mensagem)), ms))]
  );
}

// Credenciais do APP da plataforma (não da clínica). Ficam só no servidor.
function credenciaisApp() {
  return {
    appId: String(process.env.META_APP_ID || '').trim(),
    appSecret: String(process.env.META_APP_SECRET || '').trim(),
    configId: String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '').trim()
  };
}

/**
 * Credenciais da COBRANÇA (linha de crédito do parceiro).
 * O token do parceiro é o do usuário de sistema do Business Manager da
 * plataforma; sem ele, cai no token do app, que serve para a maioria dos casos.
 */
function credenciaisCobranca(appId, appSecret) {
  return {
    creditLineId: String(process.env.META_CREDIT_LINE_ID || '').trim(),
    partnerToken:
    String(process.env.META_PARTNER_TOKEN || '').trim() || `${appId}|${appSecret}`
  };
}

// GET /api/whatsapp-meta/signup/config — o que a tela precisa para abrir a janela
// da Meta. Devolve o App ID e o Config ID (ambos públicos por natureza); o App
// Secret nunca sai daqui.
router.get('/signup/config', (req, res) => {
  const { appId, appSecret, configId } = credenciaisApp();
  res.json({
    disponivel: Boolean(appId && appSecret && configId),
    appId,
    configId,
    apiVersion: process.env.META_API_VERSION || API_VERSION_PADRAO,
    faltando: [
    !appId && 'META_APP_ID',
    !appSecret && 'META_APP_SECRET',
    !configId && 'META_EMBEDDED_SIGNUP_CONFIG_ID'].
    filter(Boolean)
  });
});

// POST /api/whatsapp-meta/signup/concluir
// Body: { clinicaId, code, wabaId, phoneNumberId }
router.post('/signup/concluir', async (req, res) => {
  const { clinicaId, code, wabaId, phoneNumberId } = req.body || {};
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!code) return res.status(400).json({ error: 'O código devolvido pela Meta não chegou' });
  if (!wabaId || !phoneNumberId) {
    return res.status(400).json({
      error:
      'A Meta não devolveu a conta (WABA) e o número. Repita a conexão até concluir a verificação do número por SMS.'
    });
  }

  const { appId, appSecret } = credenciaisApp();
  if (!appId || !appSecret) {
    return res.status(400).json({
      error:
      'O app da plataforma não está configurado no servidor (META_APP_ID / META_APP_SECRET).'
    });
  }
  if (!fetchCompat) {
    return res.status(500).json({ error: 'Ambiente sem fetch disponível' });
  }

  const versao = process.env.META_API_VERSION || API_VERSION_PADRAO;

  try {
    // 1) code → token permanente da clínica (é este token que envia as mensagens)
    const url =
    `${GRAPH_BASE_URL}/${versao}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&code=${encodeURIComponent(code)}`;

    const tokenResp = await comOrcamento(
      fetchCompat(url),
      15000,
      'A Meta não respondeu à troca do código em 15s'
    );
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson.access_token) {
      return res.status(400).json({
        error:
        tokenJson?.error?.message ||
        'A Meta não devolveu o token de acesso para este código.'
      });
    }
    const accessToken = tokenJson.access_token;

    // 2) Assina o app na WABA da clínica — sem isto, NADA chega no webhook:
    // as respostas e os arquivos do paciente simplesmente não seriam entregues.
    let assinaturaOk = false;
    let assinaturaErro = null;
    try {
      const subResp = await comOrcamento(
        fetchCompat(`${GRAPH_BASE_URL}/${versao}/${wabaId}/subscribed_apps`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        15000,
        'A Meta não respondeu à assinatura do webhook em 15s'
      );
      const subJson = await subResp.json();
      assinaturaOk = Boolean(subResp.ok && subJson.success);
      if (!assinaturaOk) assinaturaErro = subJson?.error?.message || 'Falha ao assinar a conta';
    } catch (e) {
      assinaturaErro = e.message;
    }

    // 3) Registra o número na Cloud API. Um número recém-verificado precisa disso
    // antes do primeiro envio, senão a Meta recusa com "not registered".
    let registroOk = false;
    let registroErro = null;
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    try {
      const regResp = await comOrcamento(
        fetchCompat(`${GRAPH_BASE_URL}/${versao}/${phoneNumberId}/register`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', pin })
        }),
        20000,
        'A Meta não respondeu ao registro do número em 20s'
      );
      const regJson = await regResp.json();
      registroOk = Boolean(regResp.ok && regJson.success);
      if (!registroOk) {
        // "already registered" não é erro: o número já está apto a enviar.
        const msg = regJson?.error?.message || '';
        registroOk = /already/i.test(msg);
        if (!registroOk) registroErro = msg || 'Falha ao registrar o número';
      }
    } catch (e) {
      registroErro = e.message;
    }

    // 3.5) ⭐ COBRANÇA NA PLATAFORMA: compartilha a linha de crédito do parceiro
    // com a WABA da clínica. Sem isto, a Meta exige que a própria clínica
    // cadastre um cartão na conta dela — e as mensagens só saem depois disso.
    // Com o crédito compartilhado, a clínica apenas cadastra o NÚMERO e as
    // conversas são debitadas na forma de pagamento da plataforma.
    const { creditLineId, partnerToken } = credenciaisCobranca(appId, appSecret);
    let cobrancaPlataforma = false;
    let cobrancaErro = null;
    if (!creditLineId) {
      cobrancaErro =
      'META_CREDIT_LINE_ID não está configurado no servidor: a cobrança continuará na conta da clínica.';
    } else {
      try {
        const compResp = await comOrcamento(
          fetchCompat(
            `${GRAPH_BASE_URL}/${versao}/${creditLineId}/whatsapp_credit_sharing_and_attach` +
            `?waba_id=${encodeURIComponent(wabaId)}&waba_currency=BRL`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${partnerToken}` }
            }
          ),
          20000,
          'A Meta não respondeu ao compartilhamento de crédito em 20s'
        );
        const compJson = await compResp.json();
        cobrancaPlataforma = Boolean(compResp.ok && compJson?.allocation_config_id);
        if (!cobrancaPlataforma) {
          const msg = compJson?.error?.message || '';
          // Já compartilhado antes (reconexão) não é erro.
          cobrancaPlataforma = /already|existing/i.test(msg);
          if (!cobrancaPlataforma) {
            cobrancaErro = msg || 'Falha ao compartilhar a linha de crédito';
          }
        }
      } catch (e) {
        cobrancaErro = e.message;
      }
    }
    if (cobrancaErro) {
      console.warn(`🟢 [META-SIGNUP] ⚠️ Cobrança na plataforma: ${cobrancaErro}`);
    }

    // 4) Número de exibição, para a clínica reconhecer o que foi conectado
    let numeroExibicao = '';
    try {
      const numResp = await comOrcamento(
        fetchCompat(`${GRAPH_BASE_URL}/${versao}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        10000,
        'sem resposta'
      );
      const numJson = await numResp.json();
      numeroExibicao = numJson?.display_phone_number || '';
    } catch (e) {
      numeroExibicao = '';
    }

    // 5) Grava na configuração da clínica, preservando os templates já vinculados
    const anterior = await buscarConfigMeta(clinicaId).catch(() => null);
    const db = getClinicaDB(clinicaId);
    const verifyToken =
    anterior?.verifyToken || crypto.randomBytes(16).toString('hex');
    const agora = new Date().toISOString();

    await new Promise((resolve, reject) =>
    db.run(
      `INSERT INTO whatsapp_meta_config
           (id, clinicaId, apiVersion, phoneNumberId, wabaId, accessToken,
            numeroExibicao, ativo, preferencial, templates, verifyToken, atualizadoEm)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           apiVersion=VALUES(apiVersion),
           phoneNumberId=VALUES(phoneNumberId),
           wabaId=VALUES(wabaId),
           accessToken=VALUES(accessToken),
           numeroExibicao=VALUES(numeroExibicao),
           verifyToken=VALUES(verifyToken),
           atualizadoEm=VALUES(atualizadoEm)`,
      [
      `meta_${Date.now()}`,
      clinicaId,
      versao,
      String(phoneNumberId),
      String(wabaId),
      accessToken,
      numeroExibicao,
      anterior?.ativo ? 1 : 0,
      anterior?.preferencial ? 1 : 0,
      JSON.stringify(anterior?.templates || {}),
      verifyToken,
      agora],

      (err) => err ? reject(err) : resolve()
    )
    );

    console.log(
      `🟢 [META-SIGNUP] ✅ Clínica ${clinicaId} conectou o número ${numeroExibicao || phoneNumberId} (WABA ${wabaId})`
    );

    res.json({
      sucesso: true,
      phoneNumberId: String(phoneNumberId),
      wabaId: String(wabaId),
      numeroExibicao,
      // Avisos honestos: o token foi gravado, mas estas duas etapas podem ter
      // falhado — e sem elas o canal não funciona por inteiro.
      webhookAssinado: assinaturaOk,
      webhookErro: assinaturaErro,
      numeroRegistrado: registroOk,
      registroErro,
      // A cobrança das conversas vai para a plataforma (linha de crédito
      // compartilhada) ou ficou na conta da clínica?
      cobrancaPlataforma,
      cobrancaErro
    });
  } catch (err) {
    console.error('🟢 [META-SIGNUP] 🛑 Falha ao concluir conexão:', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;