// ==================== ROTAS DE WHATSAPP (PROXY) ====================
// VERSÃO: 9.8.0 - 2026-03-05
// Refatorado: Código compartilhado em whatsapp-shared.js, webhook em webhook.js
// Este arquivo contém APENAS as rotas proxy/API

const express = require('express');
const router = express.Router();

const shared = require('./whatsapp-shared');
const {
  fetch, getClinicaDB, dbGlobal,
  WHATSAPP_MODULE_VERSION, WHATSAPP_MODULE_BUILD,
  normalizarTelefoneComDDD, buscarUfClinica,
  ultimosWebhooks, MAX_WEBHOOKS_DEBUG,
  getWahaApiKey, getWahaHeaders, cleanUrl, enviarMensagemRobusta,
  dialogosAjuda, dialogosFoto,
  lidCache, mensagensProcessadas,
  TEMPO_EXPIRACAO_IDENTIFICACAO,
  garantirTabelaSolicitacoes,
  criarSolicitacao, buscarSolicitacaoPendente, cancelarSolicitacao,
  getApiKeyForClinica, buscarClinicaPorSession,
  salvarMensagemHistorico,
  salvarWhatsAppChatId,
  fecharMensagensPendentes,
  limparTodosDialogosUsuario,
  conversasAguardandoMotivo
} = shared;

// ⭐⭐⭐ NOVA ROTA: Ativar diálogo de ajuda externamente ⭐⭐⭐
router.post('/ativar-dialogo', async (req, res) => {
  const { clinicaId, telefone, pacienteId, pacienteNome } = req.body;

  if (!clinicaId || !telefone) {
    return res.status(400).json({ error: 'clinicaId e telefone são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v9.9: Normaliza telefone usando últimos 9 dígitos para matching robusto ⭐⭐⭐
  let telLimpo = telefone.replace(/\D/g, '');
  if (telLimpo.startsWith('55') && telLimpo.length > 11) {
    telLimpo = telLimpo.substring(2);
  }
  // ⭐⭐⭐ FIX v9.9: Extrai últimos 9 dígitos como chave CANÔNICA ⭐⭐⭐
  // Isso garante matching mesmo quando o número vem sem DDD (ex: 997010404)
  // e o WhatsApp retorna com DDD (ex: 11997010404)
  const ultimos9 = telLimpo.slice(-9);

  // Salva com MÚLTIPLAS chaves para garantir matching
  const chave = `${clinicaId}_${telLimpo}`;
  const chave9 = `${clinicaId}_9_${ultimos9}`; // ⭐ Chave canônica por últimos 9 dígitos

  console.log(`\n📱📱📱 [ativar-dialogo v9.9] ========================================`);
  console.log(`📱 [ativar-dialogo] Ativando diálogo de ajuda`);
  console.log(`📱 [ativar-dialogo] Telefone original: ${telefone}`);
  console.log(`📱 [ativar-dialogo] Telefone limpo: ${telLimpo}`);
  console.log(`📱 [ativar-dialogo] Últimos 9: ${ultimos9}`);
  console.log(`📱 [ativar-dialogo] Chave principal: ${chave}`);
  console.log(`📱 [ativar-dialogo] Chave canônica (9 dígitos): ${chave9}`);
  console.log(`📱 [ativar-dialogo] PacienteId: ${pacienteId || '(não informado)'}`);
  console.log(`📱 [ativar-dialogo] PacienteNome: ${pacienteNome || '(não informado)'}`);

  // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
  limparTodosDialogosUsuario(clinicaId, chave, chave9);

  const dialogoData = {
    pacienteId: pacienteId || `tel_${telLimpo}`,
    pacienteNome: pacienteNome || 'Paciente',
    telefoneOriginal: telLimpo,
    ultimos9,
    timestamp: Date.now()
  };

  dialogosAjuda.set(chave, dialogoData);
  dialogosAjuda.set(chave9, dialogoData); // ⭐ Salva também com chave canônica

  console.log(`📱 [ativar-dialogo] ✅ Diálogo ativado com 2 chaves!`);
  console.log(`📱 [ativar-dialogo] Total de diálogos ativos: ${dialogosAjuda.size}`);
  console.log(`📱📱📱 ======================================== FIM\n`);

  res.json({ success: true, chave, chave9 });
});

// ⭐⭐⭐ NOVA ROTA: Iniciar diálogo de foto (aguardar paciente enviar foto de perfil) ⭐⭐⭐
router.post('/iniciar-dialogo-foto', async (req, res) => {
  const { clinicaId, pacienteId, pacienteNome, telefone } = req.body;

  if (!clinicaId || !pacienteId || !telefone) {
    return res.status(400).json({ error: 'clinicaId, pacienteId e telefone são obrigatórios' });
  }

  // Normaliza o telefone
  let telLimpo = telefone.replace(/\D/g, '');
  if (telLimpo.startsWith('55') && telLimpo.length > 11) {
    telLimpo = telLimpo.substring(2);
  }
  // ⭐⭐⭐ FIX v11.3: Extrai últimos 9 dígitos como chave CANÔNICA (igual ativar-dialogo) ⭐⭐⭐
  const ultimos9 = telLimpo.slice(-9);

  const chave = `${clinicaId}_${telLimpo}`;
  const chave9 = `${clinicaId}_9_${ultimos9}`; // ⭐ Chave canônica por últimos 9 dígitos
  const chaveCom55 = `${clinicaId}_55${telLimpo}`; // ⭐ Chave com prefixo 55

  console.log(`\n📸📸📸 [iniciar-dialogo-foto v11.3] ========================================`);
  console.log(`📸 Iniciando diálogo de foto`);
  console.log(`📸 Chave principal: ${chave}`);
  console.log(`📸 Chave canônica (9 dígitos): ${chave9}`);
  console.log(`📸 Chave com 55: ${chaveCom55}`);
  console.log(`📸 Últimos 9: ${ultimos9}`);
  console.log(`📸 PacienteId: ${pacienteId}`);
  console.log(`📸 PacienteNome: ${pacienteNome || '(não informado)'}`);
  console.log(`📸 Telefone: ${telLimpo}`);

  // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
  limparTodosDialogosUsuario(clinicaId, chave, chave9);

  // ⭐⭐⭐ FIX v11.3: Registra com MÚLTIPLAS chaves para matching robusto ⭐⭐⭐
  const dialogoData = {
    clinicaId,
    pacienteId,
    pacienteNome: pacienteNome || 'Paciente',
    telefone: telLimpo,
    ultimos9,
    timestamp: Date.now()
  };

  dialogosFoto.set(chave, dialogoData);
  dialogosFoto.set(chave9, dialogoData); // ⭐ Chave canônica
  dialogosFoto.set(chaveCom55, dialogoData); // ⭐ Chave com prefixo 55

  console.log(`📸 ✅ Diálogo de foto ativado com 3 chaves!`);
  console.log(`📸 Total de diálogos de foto ativos: ${dialogosFoto.size}`);

  // ⭐ Também cria uma solicitação pendente no banco para persistência
  try {
    const solicitacaoId = await criarSolicitacao(clinicaId, pacienteId, pacienteNome || 'Paciente', telLimpo, 'foto', 'foto');
    console.log(`📸 ✅ Solicitação pendente criada: ${solicitacaoId}`);
    console.log(`📸📸📸 ======================================== FIM\n`);
    res.json({ success: true, chave, solicitacaoId });
  } catch (err) {
    console.error(`📸 ❌ Erro ao criar solicitação:`, err.message);
    // Mesmo com erro no banco, o diálogo em memória está ativo
    console.log(`📸📸📸 ======================================== FIM\n`);
    res.json({ success: true, chave, warning: 'Diálogo ativo em memória, mas erro ao persistir' });
  }
});

router.get('/config', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    const db = getClinicaDB(clinicaId);
    const config = await new Promise((r) => db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [clinicaId], (e, row) => r(row)));
    if (!config) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(config);
  } catch (e) {res.status(500).json({ error: e.message });}
});

router.post('/contact-info', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, number, apiKey } = req.body;
  if (!rawServerUrl || !sessionName || !number) return res.status(400).json({ error: 'Parâmetros faltando' });

  // ⭐⭐⭐ FIX v9.0: Remove barra final do serverUrl (causa URLs com barra dupla → 401) ⭐⭐⭐
  const serverUrl = rawServerUrl.replace(/\/+$/, '');

  console.log(`\n👤👤👤 [contact-info v12.0] ========================================`);
  console.log(`👤 PARÂMETROS RECEBIDOS DO FRONTEND:`);
  console.log(`👤   serverUrl (raw): "${rawServerUrl}"`);
  console.log(`👤   serverUrl (limpo): "${serverUrl}"`);
  console.log(`👤   sessionName: "${sessionName}"`);
  console.log(`👤   number: "${number}"`);

  try {
    // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
    const wahaApiKey = getWahaApiKey();
    console.log(`👤   apiKey: "${wahaApiKey ? '***' + wahaApiKey.slice(-4) : '(VAZIA!)'}"`);
    console.log(`👤 ========================================`);

    const headers = getWahaHeaders(wahaApiKey);

    // Formata o contactId no formato do WAHA
    let contactId = number.replace(/\D/g, '');
    if (!contactId.startsWith('55') && contactId.length <= 11) contactId = '55' + contactId;
    const contactIdWaha = `${contactId}@c.us`;
    const contactIdWhatsApp = `${contactId}@s.whatsapp.net`; // ⭐ v12.0: Formato alternativo

    console.log(`\n👤 [contact-info v13.0] Buscando info para ${contactIdWaha}`);
    console.log(`👤 [contact-info] serverUrl: ${serverUrl}`);
    console.log(`👤 [contact-info] sessionName: ${sessionName}`);
    console.log(`👤 [contact-info] apiKey: ${wahaApiKey ? '***' + wahaApiKey.slice(-4) : '(vazia)'}`);

    let contactData = { number: contactId, name: null, profilePicUrl: null, isRegistered: null };

    // ⭐⭐⭐ FIX v11.0: Variável para armazenar o LID (Linked ID) retornado pelo check-exists ⭐⭐⭐
    let lidChatId = null;
    let lidNumber = null; // ⭐ v12.0: Número puro do LID (sem @lid)

    // ⭐⭐⭐ FIX v10.1: Headers CORRETOS para GET - SEM Content-Type ⭐⭐⭐
    const headersGet = { 'Accept': '*/*' };
    if (wahaApiKey) headersGet['X-Api-Key'] = wahaApiKey;

    // ⭐⭐⭐ PASSO 1: check-exists ⭐⭐⭐
    const checkExistsEndpoints = [
    { url: `${serverUrl}/api/contacts/check-exists?phone=${encodeURIComponent(contactId)}&session=${encodeURIComponent(sessionName)}`, desc: 'GET /api/contacts/check-exists' }];


    for (const endpoint of checkExistsEndpoints) {
      try {
        console.log(`👤 [contact-info] Tentando check-exists: ${endpoint.desc}`);
        const r = await fetch(endpoint.url, { method: 'GET', headers: headersGet });
        console.log(`   Status: ${r.status}`);

        if (r.ok) {
          const data = await r.json();
          console.log(`👤 [contact-info] ✅ check-exists resposta:`, JSON.stringify(data).substring(0, 300));

          if (data.numberExists === true || data.isRegistered === true || data.chatId || data.jid) {
            contactData.isRegistered = true;
            contactData.number = data.chatId?.replace('@c.us', '')?.replace('@lid', '')?.replace('@s.whatsapp.net', '') || data.jid?.replace('@s.whatsapp.net', '')?.replace('@lid', '') || contactId;

            // ⭐⭐⭐ FIX v12.0: Extrai LID e número puro do LID ⭐⭐⭐
            if (data.chatId && data.chatId.includes('@lid')) {
              lidChatId = data.chatId;
              lidNumber = data.chatId.replace('@lid', '');
              console.log(`👤 [contact-info] 🆔 LID detectado: ${lidChatId}`);
              console.log(`👤 [contact-info] 🆔 LID número puro: ${lidNumber}`);
              // ⭐⭐⭐ FIX v13.1: Aquece lidCache para que o webhook resolva em Fase 1 ⭐⭐⭐
              // Quando contact-info descobre que telefone X tem LID Y, salva no cache.
              // Assim, quando o webhook receber mensagem de Y@lid, resolve instantaneamente.
              lidCache.set(lidNumber, contactId);
              console.log(`👤 [contact-info] 🆔 [FIX v13.1] lidCache aquecido: ${lidNumber} → ${contactId}`);
            }
            if (data.jid && data.jid.includes('@lid')) {
              lidChatId = data.jid;
              lidNumber = data.jid.replace('@lid', '');
              console.log(`👤 [contact-info] 🆔 LID detectado via jid: ${lidChatId}`);
              console.log(`👤 [contact-info] 🆔 LID número puro: ${lidNumber}`);
              // ⭐⭐⭐ FIX v13.1: Aquece lidCache ⭐⭐⭐
              lidCache.set(lidNumber, contactId);
              console.log(`👤 [contact-info] 🆔 [FIX v13.1] lidCache aquecido via jid: ${lidNumber} → ${contactId}`);
            }

            console.log(`👤 [contact-info] ✅ Número REGISTRADO no WhatsApp via check-exists`);
          } else if (data.numberExists === false || data.isRegistered === false) {
            contactData.isRegistered = false;
            console.log(`👤 [contact-info] ❌ Número NÃO registrado via check-exists`);
          }
          break;
        }
      } catch (e) {
        console.log(`   ❌ Erro: ${e.message}`);
        continue;
      }
    }

    // ⭐⭐⭐ PASSO 2: Busca informações detalhadas do contato ⭐⭐⭐
    const infoEndpoints = [
    { url: `${serverUrl}/api/contacts?contactId=${encodeURIComponent(contactIdWaha)}&session=${encodeURIComponent(sessionName)}`, desc: 'GET /api/contacts' }];


    if (lidChatId) {
      infoEndpoints.unshift({ url: `${serverUrl}/api/contacts?contactId=${encodeURIComponent(lidChatId)}&session=${encodeURIComponent(sessionName)}`, desc: `GET /api/contacts (LID: ${lidChatId})` });
    }

    for (const endpoint of infoEndpoints) {
      try {
        console.log(`👤 [contact-info] Tentando info: ${endpoint.desc}`);
        const r = await fetch(endpoint.url, { method: 'GET', headers: headersGet });
        console.log(`   Status: ${r.status}`);

        if (r.ok) {
          const data = await r.json();
          console.log(`👤 [contact-info] ✅ Info obtida via ${endpoint.desc}:`, JSON.stringify(data).substring(0, 300));

          contactData.name = data.name || data.pushname || data.shortName || contactData.name;

          if (contactData.isRegistered === null) {
            contactData.isRegistered = data.isWAContact !== undefined ? data.isWAContact : data.isUser !== undefined ? data.isUser : true;
          }

          contactData.number = data.number || contactId;
          if (data.profilePicUrl || data.imgUrl || data.picture) {
            contactData.profilePicUrl = data.profilePicUrl || data.imgUrl || data.picture;
          }
          break;
        }
      } catch (e) {
        console.log(`   ❌ Erro: ${e.message}`);
        continue;
      }
    }

    if (contactData.isRegistered === null) {
      contactData.isRegistered = true;
      console.log(`👤 [contact-info] ⚠️ isRegistered indefinido - assumindo TRUE`);
    }

    // ⭐⭐⭐ PASSO 3: Busca foto de perfil ⭐⭐⭐
    if (!contactData.profilePicUrl) {
      // ⭐⭐⭐ FIX v13.0: Headers IDÊNTICOS ao código que funciona ⭐⭐⭐
      // O WAHA Premium usa content negotiation - com 'accept: application/json' retorna {url: "..."}
      // Com 'accept: */*' retorna {profilePictureURL: null} (formato diferente!)
      const picHeaders = {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      };
      if (wahaApiKey) picHeaders['X-Api-Key'] = wahaApiKey;

      // ⭐⭐⭐ FIX v13.0: Tenta PRIMEIRO o formato EXATO do código que funciona ⭐⭐⭐
      // Código que funciona: GET /api/contacts/profile-picture?contactId={number}@c.us&session={session}
      // Headers: { accept: 'application/json', Content-Type: 'application/json', X-Api-Key: '...' }
      // Resposta: { url: "https://..." } (campo 'url' no WAHA Premium)
      const picEndpoints = [];

      // ⭐⭐⭐ PRIORIDADE 0: Formato EXATO do código que funciona (sem refresh, @c.us) ⭐⭐⭐
      picEndpoints.push(
        { url: `${serverUrl}/api/contacts/profile-picture?contactId=${contactId}@c.us&session=${sessionName}`, desc: `EXATO formato funcional (@c.us sem encode, sem refresh) ⭐⭐⭐` }
      );

      // ⭐⭐⭐ PRIORIDADE 0.5: Formato com session no PATH (WAHA v2024+) ⭐⭐⭐
      picEndpoints.push(
        { url: `${serverUrl}/api/${encodeURIComponent(sessionName)}/contacts/profile-picture?contactId=${contactId}@c.us`, desc: `session-in-path @c.us (WAHA v2024+)` }
      );

      // ⭐⭐⭐ PRIORIDADE 1: LID (formato novo do WhatsApp) ⭐⭐⭐
      if (lidChatId) {
        picEndpoints.push(
          { url: `${serverUrl}/api/contacts/profile-picture?contactId=${lidChatId}&session=${sessionName}`, desc: `LID @lid sem encode` },
          { url: `${serverUrl}/api/${encodeURIComponent(sessionName)}/contacts/profile-picture?contactId=${encodeURIComponent(lidChatId)}`, desc: `LID @lid session-in-path` },
          { url: `${serverUrl}/api/contacts/profile-picture?contactId=${encodeURIComponent(lidChatId)}&refresh=true&session=${sessionName}`, desc: `LID @lid encoded refresh=true` }
        );
      }

      // ⭐⭐⭐ PRIORIDADE 2: LID número com @s.whatsapp.net ⭐⭐⭐
      if (lidNumber) {
        const lidWhatsApp = `${lidNumber}@s.whatsapp.net`;
        picEndpoints.push(
          { url: `${serverUrl}/api/contacts/profile-picture?contactId=${lidWhatsApp}&session=${sessionName}`, desc: `LID @s.whatsapp.net sem encode` },
          { url: `${serverUrl}/api/contacts/profile-picture?contactId=${encodeURIComponent(lidWhatsApp)}&refresh=true&session=${sessionName}`, desc: `LID @s.whatsapp.net encoded refresh=true` }
        );
      }

      // ⭐⭐⭐ PRIORIDADE 3: @c.us com refresh e encoded ⭐⭐⭐
      picEndpoints.push(
        { url: `${serverUrl}/api/contacts/profile-picture?contactId=${encodeURIComponent(contactIdWaha)}&refresh=true&session=${sessionName}`, desc: 'profile-picture @c.us encoded refresh=true' },
        { url: `${serverUrl}/api/contacts/profile-picture?contactId=${encodeURIComponent(contactIdWhatsApp)}&refresh=true&session=${sessionName}`, desc: 'profile-picture @s.whatsapp.net encoded refresh=true' }
      );

      // ⭐⭐⭐ PRIORIDADE 4: Número puro ⭐⭐⭐
      picEndpoints.push(
        { url: `${serverUrl}/api/contacts/profile-picture?contactId=${contactId}&session=${sessionName}`, desc: 'profile-picture número puro' }
      );

      console.log(`📷 [contact-info v13.1] 🔍 Total de formatos para tentar: ${picEndpoints.length}`);
      console.log(`📷 [contact-info v13.1] 🔑 Headers: accept=application/json, Content-Type=application/json (igual código funcional)`);
      if (lidChatId) console.log(`📷 [contact-info] 🆔 LID disponível: ${lidChatId} (número: ${lidNumber})`);

      // ⭐⭐⭐ FIX v13.1: Rastreia se WAHA retornou 200 com null (= privacidade) ⭐⭐⭐
      // Se o WAHA responde 200 mas com foto null, significa que o contato existe mas a foto
      // está oculta por privacidade. Nesse caso, tentar outros formatos é inútil.
      let wahaRetornou200SemFoto = 0;

      for (const endpoint of picEndpoints) {
        try {
          console.log(`📷 [contact-info] Tentando foto: ${endpoint.desc}`);
          const r = await fetch(endpoint.url, { method: 'GET', headers: picHeaders });
          console.log(`   Status: ${r.status}, Content-Type: ${r.headers.get('content-type')}`);

          if (r.ok) {
            const contentType = r.headers.get('content-type') || '';

            if (contentType.includes('application/json') || contentType.includes('json')) {
              const data = await r.json();
              // ⭐⭐⭐ FIX v13.0: Log COMPLETO da resposta (todas as chaves) ⭐⭐⭐
              console.log(`📷 [contact-info] ✅ Foto JSON COMPLETO:`, JSON.stringify(data));
              console.log(`📷 [contact-info] Chaves da resposta:`, Object.keys(data).join(', '));

              // ⭐⭐⭐ FIX v13.0: Verifica TODOS os campos possíveis ⭐⭐⭐
              // WAHA Premium retorna no campo 'url'
              // WAHA Free retorna no campo 'profilePictureURL'
              contactData.profilePicUrl = data.url || data.profilePictureURL || data.profilePicUrl || data.profilePictureUrl ||
              data.imgUrl || data.picture || data.pictureUrl || data.image || data.src || data.href || null;

              // ⭐⭐⭐ FIX v13.0: Se o resultado é um objeto aninhado, busca dentro ⭐⭐⭐
              if (!contactData.profilePicUrl && typeof data === 'object') {
                const subFields = ['data', 'result', 'contact', 'profile', 'response'];
                for (const field of subFields) {
                  if (data[field] && typeof data[field] === 'object') {
                    const sub = data[field];
                    contactData.profilePicUrl = sub.url || sub.profilePictureURL || sub.profilePicUrl || sub.profilePictureUrl ||
                    sub.imgUrl || sub.picture || sub.pictureUrl || sub.image || null;
                    if (contactData.profilePicUrl) {
                      console.log(`📷 [contact-info] ✅ Foto encontrada em data.${field}`);
                      break;
                    }
                  }
                }
              }

              // ⭐⭐⭐ FIX v13.0: Busca QUALQUER valor string que pareça URL em qualquer campo ⭐⭐⭐
              if (!contactData.profilePicUrl) {
                for (const [key, value] of Object.entries(data)) {
                  if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:image'))) {
                    console.log(`📷 [contact-info] ✅ URL encontrada no campo '${key}': ${value.substring(0, 80)}...`);
                    contactData.profilePicUrl = value;
                    break;
                  }
                }
              }
            } else if (contentType.includes('image')) {
              const buffer = await r.arrayBuffer();
              if (buffer.byteLength > 100) {
                const base64 = Buffer.from(buffer).toString('base64');
                contactData.profilePicUrl = `data:${contentType};base64,${base64}`;
                console.log(`📷 [contact-info] ✅ Foto binária recebida: ${buffer.byteLength} bytes`);
              }
            } else {
              const text = await r.text();
              console.log(`📷 [contact-info] Resposta texto (${contentType}): ${text.substring(0, 200)}`);
              if (text.startsWith('http')) {
                contactData.profilePicUrl = text.trim();
                console.log(`📷 [contact-info] ✅ Foto URL em texto: ${text.substring(0, 100)}`);
              }
            }

            if (contactData.profilePicUrl) {
              console.log(`📷 [contact-info] ✅✅✅ FOTO ENCONTRADA via: ${endpoint.desc}`);
              break;
            } else {
              wahaRetornou200SemFoto++;
              console.log(`📷 [contact-info] ⚠️ Resposta OK mas sem foto (null) - contagem: ${wahaRetornou200SemFoto}`);
              // ⭐⭐⭐ FIX v13.1: Se WAHA retornou 200 com null 2+ vezes, é privacidade ⭐⭐⭐
              // Não adianta tentar mais formatos - o WAHA reconhece o contato mas a foto está oculta
              if (wahaRetornou200SemFoto >= 2) {
                console.log(`📷 [contact-info] 🔒 [FIX v13.1] WAHA retornou 200 sem foto ${wahaRetornou200SemFoto}x → foto oculta por PRIVACIDADE. Parando tentativas GET.`);
                break;
              }
            }
          } else {
            const errText = await r.text().catch(() => '');
            console.log(`📷 [contact-info] ❌ ${r.status}: ${errText.substring(0, 150)}`);
          }
        } catch (e) {
          console.log(`   ❌ Erro: ${e.message}`);
          continue;
        }
      }

      // ⭐⭐⭐ FIX v13.1: Só tenta POST se WAHA NÃO confirmou privacidade (200 sem foto) ⭐⭐⭐
      // Se GET retornou 200 com null, POST vai retornar o mesmo - economiza requests
      if (!contactData.profilePicUrl && wahaRetornou200SemFoto < 2) {
        const postHeaders = {
          'accept': 'application/json',
          'Content-Type': 'application/json'
        };
        if (wahaApiKey) postHeaders['X-Api-Key'] = wahaApiKey;

        const postPicBodies = [
        { contactId: contactIdWaha, session: sessionName },
        { contactId: contactIdWhatsApp, session: sessionName }];

        if (lidChatId) {
          postPicBodies.unshift({ contactId: lidChatId, session: sessionName });
        }
        if (lidNumber) {
          postPicBodies.splice(1, 0, { contactId: `${lidNumber}@s.whatsapp.net`, session: sessionName });
        }

        for (const body of postPicBodies) {
          try {
            console.log(`📷 [contact-info] Tentando foto via POST: contactId=${body.contactId}`);
            const r = await fetch(`${serverUrl}/api/contacts/profile-picture`, {
              method: 'POST',
              headers: postHeaders,
              body: JSON.stringify(body)
            });
            console.log(`   Status: ${r.status}`);

            if (r.ok) {
              const contentType = r.headers.get('content-type') || '';
              if (contentType.includes('json')) {
                const data = await r.json();
                console.log(`📷 [contact-info] POST JSON COMPLETO:`, JSON.stringify(data));
                contactData.profilePicUrl = data.url || data.profilePictureURL || data.profilePicUrl || data.profilePictureUrl ||
                data.imgUrl || data.picture || null;
                if (!contactData.profilePicUrl) {
                  // Busca qualquer URL na resposta
                  for (const [key, value] of Object.entries(data)) {
                    if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:image'))) {
                      contactData.profilePicUrl = value;
                      console.log(`📷 [contact-info] ✅ URL encontrada no campo '${key}' via POST`);
                      break;
                    }
                  }
                }
                if (contactData.profilePicUrl) {
                  console.log(`📷 [contact-info] ✅ Foto encontrada via POST com ${body.contactId}!`);
                  break;
                }
              } else if (contentType.includes('image')) {
                const buffer = await r.arrayBuffer();
                if (buffer.byteLength > 100) {
                  const base64 = Buffer.from(buffer).toString('base64');
                  contactData.profilePicUrl = `data:${contentType};base64,${base64}`;
                  console.log(`📷 [contact-info] ✅ Foto binária via POST: ${buffer.byteLength} bytes`);
                  break;
                }
              }
            }
          } catch (e) {
            console.log(`   ❌ Erro POST: ${e.message}`);
            continue;
          }
        }
      }

      if (!contactData.profilePicUrl) {
        if (wahaRetornou200SemFoto >= 2) {
          console.log(`📷 [contact-info] 🔒 Foto INDISPONÍVEL (privacidade do contato) - WAHA confirmou ${wahaRetornou200SemFoto}x com 200/null`);
          if (lidChatId) console.log(`📷 [contact-info] 💡 LID: ${lidChatId} - contato reconhecido mas foto oculta`);
        } else {
          console.log(`📷 [contact-info] ⚠️ Nenhum formato retornou foto de perfil`);
          if (lidChatId) {
            console.log(`📷 [contact-info] 💡 LID detectado (${lidChatId}) mas foto não disponível`);
            console.log(`📷 [contact-info] 💡 Formatos tentados: exato funcional, session-in-path, @lid, @s.whatsapp.net, @c.us, número puro`);
            console.log(`📷 [contact-info] 💡 O contato pode ter a foto oculta por privacidade`);
          } else {
            console.log(`📷 [contact-info] 💡 Sem LID - formatos tentados: @c.us, session-in-path, @s.whatsapp.net, número puro`);
            console.log(`📷 [contact-info] 💡 O contato pode ter a foto oculta por privacidade`);
          }
        }
      }
    }

    // ⭐⭐⭐ FIX v8.8: Se profilePicUrl é URL HTTP, BAIXA e converte para base64 ⭐⭐⭐
    // URLs do CDN do WhatsApp (pps.whatsapp.net) têm CORS restritivo e expiram rápido
    // O browser do cliente NÃO consegue carregar essas URLs diretamente
    // Solução: servidor baixa a imagem e retorna como data:image/...;base64,...
    if (contactData.profilePicUrl && contactData.profilePicUrl.startsWith('http')) {
      console.log(`📷 [contact-info] 🔄 profilePicUrl é URL HTTP - baixando para converter em base64...`);
      console.log(`📷 [contact-info] URL: ${contactData.profilePicUrl.substring(0, 120)}...`);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const imgHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*'
        };
        if (wahaApiKey) imgHeaders['X-Api-Key'] = wahaApiKey;

        const imgResponse = await fetch(contactData.profilePicUrl, {
          headers: imgHeaders,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (imgResponse.ok) {
          const imgContentType = imgResponse.headers.get('content-type') || 'image/jpeg';
          const imgBuffer = await imgResponse.arrayBuffer();

          // ⭐⭐⭐ FIX v10.4: Reduzido threshold para 20 bytes (fotos de perfil podem ser MUITO pequenas) ⭐⭐⭐
          // Fotos de perfil do WhatsApp em thumbnail podem ter apenas ~1-2KB
          // O threshold anterior de 50 bytes já era baixo, mas vamos ser ainda mais permissivos
          if (imgBuffer.byteLength > 20) {
            const imgBase64 = Buffer.from(imgBuffer).toString('base64');
            const mimeType = imgContentType.includes('image') ? imgContentType.split(';')[0] : 'image/jpeg';
            contactData.profilePicUrl = `data:${mimeType};base64,${imgBase64}`;
            console.log(`📷 [contact-info] ✅ Foto convertida para base64! ${imgBuffer.byteLength} bytes (~${Math.round(imgBuffer.byteLength / 1024)} KB)`);
          } else {
            console.log(`📷 [contact-info] ⚠️ Imagem muito pequena (${imgBuffer.byteLength} bytes) - descartando`);
            contactData.profilePicUrl = null;
          }
        } else {
          console.log(`📷 [contact-info] ❌ Erro ao baixar foto: HTTP ${imgResponse.status}`);
          // URL expirada ou inacessível - limpa para não enviar URL quebrada ao frontend
          contactData.profilePicUrl = null;
        }
      } catch (imgErr) {
        if (imgErr.name === 'AbortError') {
          console.log(`📷 [contact-info] ❌ Timeout ao baixar foto (15s)`);
        } else {
          console.log(`📷 [contact-info] ❌ Erro ao baixar foto: ${imgErr.message}`);
        }
        // Limpa URL inacessível
        contactData.profilePicUrl = null;
      }
    }

    console.log(`👤 [contact-info] Resultado final:`);
    console.log(`   Nome: ${contactData.name}`);
    console.log(`   Registrado: ${contactData.isRegistered}`);
    console.log(`   LID: ${lidChatId || '(sem LID)'}`);
    console.log(`   Foto: ${contactData.profilePicUrl ? contactData.profilePicUrl.substring(0, 80) + '...' : '(sem foto)'}`);

    res.json({ contact: contactData });
  } catch (e) {
    console.error(`👤 [contact-info] ❌ Erro geral: ${e.message}`);
    res.json({ contact: { number, isRegistered: null } });
  }
});

// ==================== SINCRONIZAÇÃO IDEMPOTENTE DE WEBHOOK ====================
const WEBHOOK_EVENTS = ['message', 'message.any', 'session.status'];

function normalizarWebhookUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function webhookAtendeConfiguracao(webhook, webhookUrl) {
  if (normalizarWebhookUrl(webhook?.url) !== normalizarWebhookUrl(webhookUrl)) {
    return false;
  }
  const events = new Set(Array.isArray(webhook?.events) ? webhook.events : []);
  return WEBHOOK_EVENTS.every((event) => events.has(event));
}

async function buscarWebhooksNoWaha(serverUrl, sessionName, headers) {
  const encodedSessionName = encodeURIComponent(sessionName);
  const endpoints = [
  `${serverUrl}/api/sessions/${encodedSessionName}`,
  `${serverUrl}/api/sessions`];


  for (const url of endpoints) {
    try {
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) continue;
      const data = await response.json();
      const sessionData = Array.isArray(data) ?
      data.find((session) => (session?.name || session?.id) === sessionName) :
      data;
      if (!sessionData) continue;
      return {
        success: true,
        config: sessionData.config || {},
        webhooks: Array.isArray(sessionData.config?.webhooks) ?
        sessionData.config.webhooks :
        []
      };
    } catch (error) {
      console.log(`🔔 [webhook-sync] Falha ao consultar WAHA: ${error.message}`);
    }
  }

  return { success: false, config: null, webhooks: [] };
}

async function configurarWebhookNoWaha(serverUrl, sessionName, webhookUrl, apiKey) {
  console.log(`\n🔔 [webhook-sync] ========================================`);
  console.log(`🔔 Sessão: ${sessionName}`);
  console.log(`🔔 Webhook desejado: ${webhookUrl}`);

  const headers = getWahaHeaders(apiKey);
  const current = await buscarWebhooksNoWaha(serverUrl, sessionName, headers);
  if (current.success && current.webhooks.some((webhook) => webhookAtendeConfiguracao(webhook, webhookUrl))) {
    console.log('🔔 ✅ Webhook já está sincronizado; nenhuma atualização necessária.');
    console.log(`🔔 ========================================\n`);
    return { success: true, updated: false, method: 'verificação WAHA' };
  }

  console.log('🔔 Configuração ausente ou divergente; atualizando WAHA...');
  const encodedSessionName = encodeURIComponent(sessionName);
  const webhookConfig = {
    url: webhookUrl,
    events: WEBHOOK_EVENTS,
    retries: {
      policy: 'constant',
      delaySeconds: 2,
      attempts: 3
    }
  };
  // O PUT de sessões do WAHA pode substituir a configuração inteira. Mantém as
  // opções atuais (engine, mídia, proxy etc.) e altera somente os webhooks.
  const sessionConfig = current.success && current.config && typeof current.config === 'object' ?
  { ...current.config, webhooks: [webhookConfig] } :
  { webhooks: [webhookConfig] };
  const endpoints = [
  {
    method: 'PUT',
    url: `${serverUrl}/api/sessions/${encodedSessionName}`,
    body: { config: sessionConfig },
    desc: 'PUT /api/sessions/{session}'
  },
  {
    method: 'PATCH',
    url: `${serverUrl}/api/sessions/${encodedSessionName}`,
    body: { config: sessionConfig },
    desc: 'PATCH /api/sessions/{session}'
  },
  {
    method: 'POST',
    url: `${serverUrl}/api/sessions/${encodedSessionName}/webhooks`,
    body: webhookConfig,
    desc: 'POST /api/sessions/{session}/webhooks'
  },
  {
    method: 'PUT',
    url: `${serverUrl}/api/webhook`,
    body: { ...webhookConfig, session: sessionName },
    desc: 'PUT /api/webhook'
  }];


  for (const endpoint of endpoints) {
    try {
      console.log(`🔔 Tentando: ${endpoint.desc}`);
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers,
        body: JSON.stringify(endpoint.body)
      });
      console.log(`   Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const confirmado = await buscarWebhooksNoWaha(serverUrl, sessionName, headers);
        if (confirmado.success && confirmado.webhooks.some((webhook) => webhookAtendeConfiguracao(webhook, webhookUrl))) {
          console.log(`🔔 ✅ Webhook atualizado e confirmado via ${endpoint.desc}!`);
          console.log(`🔔 ========================================\n`);
          return { success: true, updated: true, method: endpoint.desc, data };
        }
        console.log(`🔔 ⚠️ ${endpoint.desc} respondeu ${response.status}, mas o WAHA ainda não confirmou os eventos ${WEBHOOK_EVENTS.join(', ')}.`);
        continue;
      }
      if (response.status !== 404) {
        const errText = await response.text().catch(() => '');
        console.log(`   ❌ ${response.status}: ${errText.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
  }

  console.log('🔔 ❌ O WAHA não confirmou a configuração de eventos de mensagem');
  console.log(`🔔 ========================================\n`);
  return {
    success: false,
    error: `O WAHA não confirmou os eventos obrigatórios (${WEBHOOK_EVENTS.join(', ')}). A sessão pode ter recusado a atualização; tente novamente e verifique a sessão no WAHA.`
  };
}

// ⭐⭐⭐ ROTA: Configurar webhook no WAHA ⭐⭐⭐
router.post('/configure-webhook', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, webhookUrl, apiKey, clinicaId } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v9.1: Remove barra final do serverUrl ⭐⭐⭐
  const serverUrl = cleanUrl(rawServerUrl);

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  let finalWebhookUrl = String(webhookUrl || '').trim();
  if (!finalWebhookUrl) {
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      finalWebhookUrl = `https://${host}/api/webhook/whatsapp`;
    } else {
      finalWebhookUrl = `${protocol}://${host}/api/webhook/whatsapp`;
    }
  }

  try {
    const parsedWebhookUrl = new URL(finalWebhookUrl);
    if (!['http:', 'https:'].includes(parsedWebhookUrl.protocol)) {
      throw new Error('protocol inválido');
    }
    finalWebhookUrl = normalizarWebhookUrl(parsedWebhookUrl.toString());
  } catch {
    return res.status(400).json({
      error: 'A URL do webhook deve ser um endereço HTTP(S) válido.'
    });
  }

  // A atualização de configuração também precisa ser estritamente não criativa.
  // Alguns provedores interpretam PUT/PATCH de sessão ausente como criação.
  const configuredSessionName = String(sessionName).trim();
  const confirmation = await confirmarSessaoExistente(
    serverUrl,
    encodeURIComponent(configuredSessionName),
    configuredSessionName,
    getWahaHeaders(wahaApiKey)
  );
  if (confirmation.unauthorized) {
    return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
  }
  if (!confirmation.exists) {
    return res.status(404).json({
      error: `A sessão configurada "${configuredSessionName}" não existe no WAHA. O webhook não foi alterado e nenhuma sessão foi criada.`,
      sessionName: configuredSessionName,
      attempts: confirmation.attempts
    });
  }

  console.log(`\n🔔🔔🔔 [configure-webhook] ========================================`);
  console.log(`🔔 Configurando webhook: ${finalWebhookUrl}`);

  const result = await configurarWebhookNoWaha(serverUrl, configuredSessionName, finalWebhookUrl, wahaApiKey);

  if (result.success) {
    res.json({
      success: true,
      updated: result.updated === true,
      webhookUrl: finalWebhookUrl,
      method: result.method
    });
  } else {
    res.status(500).json({ success: false, error: result.error, webhookUrl: finalWebhookUrl });
  }
});

// ⭐⭐⭐ ROTA: Verificar webhook configurado no WAHA ⭐⭐⭐
router.get('/check-webhook', async (req, res) => {
  const { serverUrl, sessionName, apiKey } = req.query;

  if (!serverUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  const headers = getWahaHeaders(wahaApiKey);

  console.log(`\n🔍 [check-webhook] Verificando webhook para sessão ${sessionName}...`);

  const endpoints = [
  `${serverUrl}/api/sessions/${sessionName}`,
  `${serverUrl}/api/sessions`];


  for (const url of endpoints) {
    try {
      const r = await fetch(url, { method: 'GET', headers });
      if (r.ok) {
        const data = await r.json();

        let sessionData = data;
        if (Array.isArray(data)) {
          sessionData = data.find((s) => s.name === sessionName) || data[0] || {};
        }

        const webhooks = sessionData.config?.webhooks || [];
        const hasWebhook = webhooks.length > 0;
        console.log(`🔍 [check-webhook] Webhooks encontrados: ${webhooks.length}`);
        if (hasWebhook) {
          webhooks.forEach((w, i) => {
            console.log(`   ${i + 1}. URL: ${w.url}, Events: ${(w.events || []).join(', ')}`);
          });
        }
        return res.json({
          hasWebhook,
          webhooks,
          sessionName: sessionData.name || sessionName,
          status: sessionData.status || 'unknown'
        });
      }
    } catch (e) {
      continue;
    }
  }

  res.json({ hasWebhook: false, webhooks: [], error: 'Não foi possível verificar' });
});

// ⭐⭐⭐ FUNÇÃO PARA CONFIGURAR MEDIA DOWNLOAD NO WAHA ⭐⭐⭐
async function configurarMediaDownload(serverUrl, sessionName, apiKey) {
  console.log(`\n📸 [configurarMediaDownload] ========================================`);
  console.log(`📸 Configurando download de mídia em qualidade máxima`);
  console.log(`📸 serverUrl: ${serverUrl}, sessionName: ${sessionName}`);

  const headers = getWahaHeaders(apiKey);

  const mediaConfig = {
    config: {
      media: {
        download: true,
        attachments: true
      },
      noweb: {
        store: {
          enabled: true,
          fullSync: false
        }
      },
      metadata: {
        enabled: true
      }
    }
  };

  const endpoints = [
  { method: 'PUT', url: `${serverUrl}/api/sessions/${sessionName}`, body: mediaConfig, desc: 'PUT /api/sessions/{session}' },
  { method: 'PATCH', url: `${serverUrl}/api/sessions/${sessionName}`, body: mediaConfig, desc: 'PATCH /api/sessions/{session}' },
  { method: 'PUT', url: `${serverUrl}/api/sessions/${sessionName}/config`, body: mediaConfig.config, desc: 'PUT /api/sessions/{session}/config' },
  { method: 'POST', url: `${serverUrl}/api/sessions/${sessionName}/config`, body: mediaConfig.config, desc: 'POST /api/sessions/{session}/config' }];


  for (const endpoint of endpoints) {
    try {
      console.log(`📸 Tentando: ${endpoint.desc}`);
      const r = await fetch(endpoint.url, {
        method: endpoint.method,
        headers,
        body: JSON.stringify(endpoint.body)
      });

      console.log(`   Status: ${r.status}`);

      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        console.log(`📸 ✅ Media download configurado via ${endpoint.desc}!`);

        const configAtual = data.config || data;
        if (configAtual.media) {
          console.log(`📸 Config media no WAHA:`, JSON.stringify(configAtual.media));
        }

        console.log(`📸 ========================================\n`);
        return { success: true, method: endpoint.desc };
      } else if (r.status === 404) {
        continue;
      } else {
        const errText = await r.text().catch(() => '');
        console.log(`   ❌ ${r.status}: ${errText.substring(0, 100)}`);
        continue;
      }
    } catch (e) {
      console.log(`   ❌ Erro: ${e.message}`);
      continue;
    }
  }

  console.log(`📸 ❌ Nenhum endpoint de config funcionou`);
  console.log(`📸 💡 Configure manualmente no WAHA Dashboard: Session → Config → media.download = true`);
  console.log(`📸 ========================================\n`);
  return { success: false };
}

// ⭐⭐⭐ ROTA: Configurar media download ⭐⭐⭐
router.post('/configure-media', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, apiKey, clinicaId } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v9.1: Remove barra final do serverUrl ⭐⭐⭐
  const serverUrl = cleanUrl(rawServerUrl);

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  console.log(`\n📸📸📸 [configure-media] ========================================`);
  console.log(`📸 Configurando media download para sessão ${sessionName}`);

  const result = await configurarMediaDownload(serverUrl, sessionName, wahaApiKey);

  if (result.success) {
    console.log(`📸 Reiniciando sessão para aplicar configuração...`);
    try {
      const restartEndpoints = [
      `${serverUrl}/api/sessions/${sessionName}/restart`,
      `${serverUrl}/api/sessions/restart`];


      for (const url of restartEndpoints) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: getWahaHeaders(wahaApiKey),
            body: JSON.stringify({ name: sessionName })
          });
          if (r.ok) {
            console.log(`📸 ✅ Sessão reiniciada para aplicar config`);
            break;
          }
        } catch (e) {continue;}
      }
    } catch (e) {
      console.log(`📸 ⚠️ Não foi possível reiniciar: ${e.message}`);
    }

    res.json({ success: true, method: result.method, message: 'Media download configurado! A sessão foi reiniciada para aplicar.' });
  } else {
    res.status(500).json({
      success: false,
      error: 'Não foi possível configurar automaticamente',
      instructions: 'Configure manualmente no WAHA Dashboard: Session → Config → media.download = true'
    });
  }
});

// ⭐⭐⭐ ROTA: Diagnóstico de qualidade de mídia ⭐⭐⭐
router.get('/media-diagnostico', async (req, res) => {
  const { serverUrl, sessionName, apiKey } = req.query;

  if (!serverUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();
  const headers = getWahaHeaders(wahaApiKey);

  console.log(`\n🔍 [media-diagnostico] Verificando config de mídia...`);

  const resultado = {
    version: WHATSAPP_MODULE_VERSION,
    sessionName,
    mediaConfig: null,
    webhookConfig: null,
    recomendacoes: []
  };

  try {
    const endpoints = [
    `${serverUrl}/api/sessions/${sessionName}`,
    `${serverUrl}/api/sessions`];


    for (const url of endpoints) {
      try {
        const r = await fetch(url, { method: 'GET', headers });
        if (r.ok) {
          const data = await r.json();
          let sessionData = data;
          if (Array.isArray(data)) {
            sessionData = data.find((s) => s.name === sessionName) || data[0] || {};
          }

          resultado.mediaConfig = sessionData.config?.media || null;
          resultado.webhookConfig = sessionData.config?.webhooks || null;

          if (!sessionData.config?.media?.download) {
            resultado.recomendacoes.push('⚠️ media.download NÃO está habilitado! Imagens serão recebidas como thumbnails de baixa qualidade.');
            resultado.recomendacoes.push('💡 Use o botão "Ativar Download de Mídia" nas configurações, ou configure manualmente no WAHA Dashboard.');
          } else {
            resultado.recomendacoes.push('✅ media.download está habilitado - mídia deve ser recebida em qualidade original.');
          }

          break;
        }
      } catch (e) {continue;}
    }
  } catch (e) {
    resultado.recomendacoes.push(`❌ Erro ao verificar config: ${e.message}`);
  }

  if (!resultado.mediaConfig) {
    resultado.recomendacoes.push('❓ Não foi possível verificar a configuração de mídia da sessão.');
    resultado.recomendacoes.push('💡 Acesse o WAHA Dashboard e verifique: Session → Config → media');
  }

  res.json(resultado);
});

// ⭐⭐⭐ ROTA DE DEBUG: Ver últimos webhooks recebidos ⭐⭐⭐
router.get('/webhook-debug', async (req, res) => {
  console.log(`\n🔍 [webhook-debug] Retornando ${ultimosWebhooks.length} últimos webhooks`);

  res.json({
    version: WHATSAPP_MODULE_VERSION,
    build: WHATSAPP_MODULE_BUILD,
    totalWebhooksRecebidos: ultimosWebhooks.length,
    dialogosFotoAtivos: dialogosFoto.size,
    dialogosAjudaAtivos: dialogosAjuda.size,
    lidCacheSize: lidCache.size,
    mensagensProcessadasSize: mensagensProcessadas.size,
    webhooks: ultimosWebhooks
  });
});

// ⭐⭐⭐ NOVO v8.5: DIAGNÓSTICO COMPLETO DA SESSÃO ⭐⭐⭐
router.get('/diagnostico-sessao', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, apiKey } = req.query;

  if (!rawServerUrl) {
    return res.status(400).json({ error: 'serverUrl é obrigatório' });
  }

  const serverUrl = rawServerUrl.replace(/\/+$/, '');
  const session = sessionName || 'default';

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  console.log(`\n🩺🩺🩺 [diagnostico-sessao v8.5] ========================================`);
  console.log(`🩺 serverUrl: ${serverUrl}`);
  console.log(`🩺 sessionName: ${session}`);
  console.log(`🩺 apiKey: ${wahaApiKey ? '***' + wahaApiKey.slice(-4) : '(vazia)'}`);

  const headersGet = { 'Accept': '*/*' };
  if (wahaApiKey) headersGet['X-Api-Key'] = wahaApiKey;

  const resultado = {
    version: WHATSAPP_MODULE_VERSION,
    build: WHATSAPP_MODULE_BUILD,
    timestamp: new Date().toISOString(),
    serverUrl,
    sessionName: session,
    apiKeyPresent: !!wahaApiKey,
    apiKeyLast4: wahaApiKey ? wahaApiKey.slice(-4) : null,
    endpoints: [],
    conclusao: '',
    sessaoEncontrada: false,
    statusFinal: null
  };

  // ⭐ PASSO 1: Testa cada endpoint individualmente
  const endpointsParaTestar = [
  { url: `${serverUrl}/api/sessions/${session}`, desc: `GET /api/sessions/${session}`, tipo: 'session-specific' },
  { url: `${serverUrl}/api/sessions?all=true`, desc: 'GET /api/sessions?all=true', tipo: 'list-all' },
  { url: `${serverUrl}/api/sessions`, desc: 'GET /api/sessions', tipo: 'list' },
  { url: `${serverUrl}/api/${session}/status`, desc: `GET /api/${session}/status`, tipo: 'legacy-status' },
  { url: `${serverUrl}/health`, desc: 'GET /health', tipo: 'health' },
  { url: `${serverUrl}/api/health`, desc: 'GET /api/health', tipo: 'health' },
  { url: `${serverUrl}/api/server/status`, desc: 'GET /api/server/status', tipo: 'server-status' }];


  for (const ep of endpointsParaTestar) {
    const epResult = {
      url: ep.url,
      desc: ep.desc,
      tipo: ep.tipo,
      httpStatus: null,
      responseBody: null,
      error: null,
      tempoMs: null,
      sessionFound: false,
      wahaStatus: null
    };

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const r = await fetch(ep.url, {
        method: 'GET',
        headers: headersGet,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      epResult.httpStatus = r.status;
      epResult.tempoMs = Date.now() - startTime;

      if (r.ok) {
        const contentType = r.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const data = await r.json();
          epResult.responseBody = JSON.stringify(data).substring(0, 2000);

          // Analisa a resposta
          if (Array.isArray(data)) {
            const sessoes = data.map((s) => ({ name: s.name, status: s.status, engine: s.config?.engine }));
            epResult.responseBody = JSON.stringify({ totalSessions: data.length, sessions: sessoes });
            const match = data.find((s) => s.name === session);
            if (match) {
              epResult.sessionFound = true;
              epResult.wahaStatus = match.status;
            } else if (data.length > 0) {
              epResult.responseBody += ` | ATENÇÃO: sessão "${session}" NÃO encontrada! Sessões disponíveis: ${data.map((s) => s.name).join(', ')}`;
            }
          } else if (data.status || data.state || data.name) {
            epResult.sessionFound = true;
            epResult.wahaStatus = data.status || data.state;
            epResult.responseBody = JSON.stringify({
              name: data.name,
              status: data.status,
              state: data.state,
              isReady: data.isReady,
              me: data.me,
              engine: data.config?.engine,
              hasWebhooks: (data.config?.webhooks || []).length > 0
            });
          }
        } else {
          const text = await r.text();
          epResult.responseBody = text.substring(0, 500);
        }
      } else {
        const errText = await r.text().catch(() => '');
        epResult.responseBody = errText.substring(0, 500);
        if (r.status === 401) {
          epResult.error = 'API Key inválida ou não informada';
        } else if (r.status === 404) {
          epResult.error = 'Endpoint não encontrado (404)';
        }
      }
    } catch (e) {
      epResult.tempoMs = Date.now() - startTime;
      if (e.name === 'AbortError') {
        epResult.error = 'Timeout (10s)';
      } else {
        epResult.error = e.message;
      }
    }

    resultado.endpoints.push(epResult);
    console.log(`🩺 ${ep.desc}: HTTP ${epResult.httpStatus || 'ERR'} (${epResult.tempoMs}ms) ${epResult.sessionFound ? '✅ SESSÃO ENCONTRADA' : ''} ${epResult.wahaStatus ? `Status: ${epResult.wahaStatus}` : ''} ${epResult.error || ''}`);
  }

  // ⭐ PASSO 2: Analisa resultados e gera conclusão
  const endpointComSessao = resultado.endpoints.find((e) => e.sessionFound);
  const endpointCom401 = resultado.endpoints.find((e) => e.httpStatus === 401);
  const endpointComResposta = resultado.endpoints.find((e) => e.httpStatus === 200);
  const todosTimeout = resultado.endpoints.every((e) => e.error?.includes('Timeout'));
  const todosErro = resultado.endpoints.every((e) => e.error || e.httpStatus && e.httpStatus >= 400);

  if (endpointComSessao) {
    resultado.sessaoEncontrada = true;
    resultado.statusFinal = endpointComSessao.wahaStatus;
    resultado.conclusao = `✅ Sessão "${session}" encontrada com status: ${endpointComSessao.wahaStatus}. O proxy deveria retornar este status corretamente.`;
  } else if (endpointCom401) {
    resultado.conclusao = `❌ WAHA retornou 401 (Unauthorized). A API Key está incorreta ou não foi enviada.`;
  } else if (endpointComResposta) {
    const listEndpoint = resultado.endpoints.find((e) => e.tipo === 'list-all' && e.httpStatus === 200);
    if (listEndpoint) {
      resultado.conclusao = `⚠️ Servidor WAHA está online mas a sessão "${session}" NÃO foi encontrada na lista de sessões. Resposta: ${listEndpoint.responseBody}`;
    } else {
      resultado.conclusao = `⚠️ Servidor respondeu mas a sessão "${session}" não foi encontrada. Pode ser necessário criar a sessão primeiro.`;
    }
  } else if (todosTimeout) {
    resultado.conclusao = `❌ Todos os endpoints deram timeout. O servidor WAHA não está acessível a partir do servidor API.`;
  } else if (todosErro) {
    resultado.conclusao = `❌ Todos os endpoints falharam. Verifique se o servidor WAHA está rodando e acessível.`;
  } else {
    resultado.conclusao = `⚠️ Resultado inconclusivo. Verifique os detalhes de cada endpoint.`;
  }

  console.log(`🩺 CONCLUSÃO: ${resultado.conclusao}`);
  console.log(`🩺🩺🩺 ======================================== FIM\n`);

  res.json(resultado);
});

// ⭐⭐⭐ ROTA DE DEBUG: Listar solicitações pendentes ⭐⭐⭐
router.get('/solicitacoes-debug', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaSolicitacoes(db);

    const pendentes = await new Promise((r) => db.all(
      `SELECT * FROM solicitacoes_pendentes ORDER BY criadoEm DESC LIMIT 20`,
      [], (err, rows) => r(rows || [])
    ));

    // Lista diálogos de foto em memória
    const dialogosFotoAtivos = [];
    for (const [key, val] of dialogosFoto.entries()) {
      if (key.startsWith(clinicaId + '_')) {
        dialogosFotoAtivos.push({
          chave: key,
          ...val,
          expirado: Date.now() - val.timestamp > TEMPO_EXPIRACAO_IDENTIFICACAO,
          tempoRestante: Math.max(0, TEMPO_EXPIRACAO_IDENTIFICACAO - (Date.now() - val.timestamp)) / 1000 + 's'
        });
      }
    }

    res.json({
      clinicaId,
      solicitacoes: pendentes,
      dialogosFotoEmMemoria: dialogosFotoAtivos,
      totalDialogosFoto: dialogosFoto.size
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ⭐⭐⭐ ROTA: Buscar QR Code Image do WAHA (PROXY) ⭐⭐⭐
router.get('/qr-image', async (req, res) => {
  const { serverUrl, sessionName, apiKey } = req.query;

  if (!serverUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  const headers = getWahaHeaders(wahaApiKey);

  console.log(`\n📱 [qr-image] Buscando QR Code image para sessão ${sessionName}...`);

  const endpoints = [
  { url: `${serverUrl}/api/${sessionName}/auth/qr`, desc: 'GET /api/{session}/auth/qr' },
  { url: `${serverUrl}/api/sessions/${sessionName}/auth/qr`, desc: 'GET /api/sessions/{session}/auth/qr' },
  { url: `${serverUrl}/api/auth/qr?session=${encodeURIComponent(sessionName)}`, desc: 'GET /api/auth/qr?session=' },
  { url: `${serverUrl}/api/sessions/${sessionName}/screenshot`, desc: 'GET /api/sessions/{session}/screenshot' },
  { url: `${serverUrl}/api/sessions/${sessionName}/qr`, desc: 'GET /api/sessions/{session}/qr' },
  { url: `${serverUrl}/api/${sessionName}/qr`, desc: 'GET /api/{session}/qr' }];


  for (const endpoint of endpoints) {
    try {
      console.log(`📱 Tentando: ${endpoint.desc}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const r = await fetch(endpoint.url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log(`   Status: ${r.status}, Content-Type: ${r.headers.get('content-type')}`);

      if (r.ok) {
        const contentType = r.headers.get('content-type') || '';

        if (contentType.includes('image')) {
          console.log(`📱 ✅ QR Image recebida como imagem!`);
          const buffer = Buffer.from(await r.arrayBuffer());
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.send(buffer);
        }

        if (contentType.includes('application/json')) {
          const data = await r.json();
          console.log(`📱 JSON keys:`, Object.keys(data));

          const qrImage = data.qr || data.qrCode || data.image || data.qrCodeImage || data.data;

          if (qrImage && typeof qrImage === 'string') {
            if (qrImage.startsWith('data:image')) {
              console.log(`📱 ✅ QR Image como data URL!`);
              const base64Part = qrImage.split(',')[1];
              const mimeMatch = qrImage.match(/data:([^;]+)/);
              const mime = mimeMatch ? mimeMatch[1] : 'image/png';
              const buffer = Buffer.from(base64Part, 'base64');
              res.setHeader('Content-Type', mime);
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              return res.send(buffer);
            }
            if (qrImage.startsWith('/9j/') || qrImage.startsWith('iVBOR') || qrImage.length > 1000) {
              console.log(`📱 ✅ QR Image como base64 puro!`);
              const buffer = Buffer.from(qrImage, 'base64');
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              return res.send(buffer);
            }
            if (qrImage.startsWith('http')) {
              console.log(`📱 Redirecionando para URL: ${qrImage}`);
              return res.redirect(qrImage);
            }
          }

          if (data.qr && typeof data.qr === 'object') {
            const imgUrl = data.qr.image || data.qr.url || data.qr.base64;
            if (imgUrl) {
              if (imgUrl.startsWith('data:image') || imgUrl.startsWith('/9j/') || imgUrl.startsWith('iVBOR')) {
                const base64Data = imgUrl.includes(',') ? imgUrl.split(',')[1] : imgUrl;
                const buffer = Buffer.from(base64Data, 'base64');
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                return res.send(buffer);
              }
              if (imgUrl.startsWith('http')) {
                return res.redirect(imgUrl);
              }
            }
          }
        }

        if (contentType.includes('text')) {
          const text = await r.text();
          if (text.startsWith('http')) {
            return res.redirect(text.trim());
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`   ❌ Timeout`);
      } else {
        console.log(`   ❌ Erro: ${e.message}`);
      }
      continue;
    }
  }

  console.log(`📱 ❌ Nenhum endpoint retornou QR Code image`);
  res.status(404).json({ error: 'QR Code image não disponível. Tente recarregar.' });
});

// ⭐⭐⭐ HELPER: Normalizar resposta de status do WAHA ⭐⭐⭐
function normalizarStatusWaha(data, sessionName) {
  let sessionData = null;

  if (Array.isArray(data)) {
    // A listagem só representa a sessão solicitada quando houver correspondência
    // exata. Usar data[0] aqui fazia uma sessão diferente parecer conectada.
    sessionData =
    data.find((session) => (session?.name || session?.id) === sessionName) ||
    null;
  } else if (data && data.sessions && Array.isArray(data.sessions)) {
    sessionData =
    data.sessions.find(
      (session) => (session?.name || session?.id) === sessionName
    ) || null;
  } else if (data && (data.status || data.state || data.name || data.id)) {
    const returnedName = data.name || data.id;
    sessionData = returnedName && returnedName !== sessionName ? null : data;
  }

  if (!sessionData) {
    return {
      status: 'NOT_FOUND',
      isReady: false,
      sessionExists: false,
      qrCode: null,
      qrCodeImage: null,
      name: sessionName
    };
  }

  const rawStatus = (sessionData.status || sessionData.state || '').toUpperCase();
  let normalizedStatus = rawStatus;

  if (['WORKING', 'CONNECTED', 'ONLINE'].includes(rawStatus)) {
    normalizedStatus = 'WORKING';
  } else if (['SCAN_QR_CODE', 'WAITING_SCAN', 'QR', 'WAITING_QR'].includes(rawStatus)) {
    normalizedStatus = 'SCAN_QR_CODE';
  } else if (['STARTING', 'INITIALIZING'].includes(rawStatus)) {
    normalizedStatus = 'STARTING';
  } else if (['FAILED', 'ERROR'].includes(rawStatus)) {
    normalizedStatus = 'FAILED';
  } else if (['STOPPED', 'DISCONNECTED', 'LOGOUT'].includes(rawStatus)) {
    normalizedStatus = 'STOPPED';
  }

  const qrCode = sessionData.qrCode || sessionData.qr || null;
  const qrCodeImage = sessionData.qrCodeImage || (
  sessionData.qr && typeof sessionData.qr === 'object' ? sessionData.qr.image || sessionData.qr.url : null) ||
  null;

  const me = sessionData.me || null;

  return {
    status: normalizedStatus,
    isReady: sessionData.isReady === true || normalizedStatus === 'WORKING',
    sessionExists: true,
    qrCode: typeof qrCode === 'string' ? qrCode : null,
    qrCodeImage,
    me,
    name: sessionData.name || sessionData.id || sessionName,
    config: sessionData.config || null
  };
}

// ==================== ROTAS DE PROXY PARA O WAHA ====================

// ==================== HEALTH CHECK (PROXY) ====================
router.get('/health', async (req, res) => {
  const { serverUrl: rawServerUrl, apiKey, sessionName } = req.query;

  if (!rawServerUrl) {
    return res.status(400).json({ error: 'serverUrl é obrigatório' });
  }

  // ⭐ Remove barra final para evitar URLs com barra dupla (//api/sessions)
  const serverUrl = rawServerUrl.replace(/\/+$/, '');

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  // ⭐⭐⭐ v8.3: HEADERS CORRETOS - GET requests NÃO devem enviar Content-Type ⭐⭐⭐
  const headersGet = { 'Accept': '*/*' };
  if (wahaApiKey) headersGet['X-Api-Key'] = wahaApiKey;

  console.log(`\n🏥 [health v8.3] Verificando saúde do servidor WAHA: ${serverUrl}`);
  console.log(`🏥 [health] apiKey: ${wahaApiKey ? '***' + wahaApiKey.slice(-4) : '(vazia)'}`);
  console.log(`🏥 [health] sessionName: ${sessionName || '(não informado)'}`);

  // ⭐⭐⭐ v8.3: ENDPOINTS EXPANDIDOS - inclui session-specific quando disponível ⭐⭐⭐
  const endpoints = [];

  // Prioridade 1: Session-specific (mais confiável quando temos o nome da sessão)
  if (sessionName) {
    endpoints.push({ url: `${serverUrl}/api/sessions/${sessionName}`, desc: `GET /api/sessions/${sessionName}` });
  }

  // Prioridade 2: Endpoints genéricos
  endpoints.push(
    { url: `${serverUrl}/api/sessions?all=true`, desc: 'GET /api/sessions?all=true' },
    { url: `${serverUrl}/api/sessions`, desc: 'GET /api/sessions (sem param)' },
    { url: `${serverUrl}/health`, desc: 'GET /health' },
    { url: `${serverUrl}/api/health`, desc: 'GET /api/health' },
    { url: `${serverUrl}/api/server/status`, desc: 'GET /api/server/status' }
  );

  for (const endpoint of endpoints) {
    try {
      console.log(`🏥 Tentando: ${endpoint.desc}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const r = await fetch(endpoint.url, {
        method: 'GET',
        headers: headersGet,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log(`   Status: ${r.status}`);

      if (r.ok) {
        console.log(`🏥 ✅ Servidor online via ${endpoint.desc}`);
        return res.json({ status: 'OK', endpoint: endpoint.desc });
      } else if (r.status === 401) {
        console.log(`🏥 ❌ 401 Unauthorized`);
        return res.status(401).json({
          status: 'Unauthorized',
          statusCode: 401,
          message: 'Unauthorized',
          error: 'API Key inválida ou não informada. Configure a API Key do WAHA.'
        });
      } else if (r.status === 403) {
        console.log(`🏥 ❌ 403 Forbidden`);
        return res.status(403).json({
          status: 'Forbidden',
          statusCode: 403,
          message: 'Forbidden',
          error: 'Acesso negado ao servidor WAHA.'
        });
      } else if (r.status === 404 && sessionName) {
        // ⭐⭐⭐ v8.3: 404 para session-specific = servidor está online, sessão não existe ⭐⭐⭐
        if (endpoint.desc.includes(sessionName)) {
          console.log(`🏥 ✅ Servidor online (sessão ${sessionName} não existe, mas servidor respondeu)`);
          return res.json({ status: 'OK', endpoint: endpoint.desc, sessionNotFound: true });
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`   ❌ Timeout (10s)`);
      } else {
        console.log(`   ❌ Erro: ${e.message}`);
      }
      continue;
    }
  }

  console.log(`🏥 ❌ Servidor não respondeu em nenhum endpoint`);
  res.status(503).json({ status: 'offline', error: 'Servidor WAHA não está respondendo' });
});

// ==================== STATUS DA SESSÃO (PROXY) ====================
// ⭐ Cache de status para evitar DNS lookups repetidos quando servidor WAHA está inacessível
const statusCache = new Map(); // key: serverUrl → { result, timestamp }
const STATUS_CACHE_TTL_OK = 15000; // 15s se conectado
const STATUS_CACHE_TTL_FAIL = 60000; // 60s se falhou (evita retry agressivo)

router.get('/status', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, apiKey } = req.query;

  if (!rawServerUrl) {
    return res.status(400).json({ error: 'serverUrl é obrigatório' });
  }

  const serverUrl = rawServerUrl.replace(/\/+$/, '');
  const session = sessionName || 'default';
  const cacheKey = `${serverUrl}_${session}`;

  // ⭐ Retorna do cache se ainda válido (evita DNS lookups repetidos)
  const cached = statusCache.get(cacheKey);
  if (cached) {
    const ttl = cached.ok ? STATUS_CACHE_TTL_OK : STATUS_CACHE_TTL_FAIL;
    if (Date.now() - cached.timestamp < ttl) {
      return res.json(cached.result);
    }
  }

  const wahaApiKey = getWahaApiKey();
  const headersGet = { 'Accept': '*/*' };
  if (wahaApiKey) headersGet['X-Api-Key'] = wahaApiKey;

  const endpoints = [
  { url: `${serverUrl}/api/sessions/${session}`, desc: `GET /api/sessions/${session}` },
  { url: `${serverUrl}/api/sessions?all=true`, desc: 'GET /api/sessions?all=true' },
  { url: `${serverUrl}/api/sessions`, desc: 'GET /api/sessions' },
  { url: `${serverUrl}/api/${session}/status`, desc: `GET /api/${session}/status` }];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      // ⭐ Timeout reduzido de 15s para 4s (evita bloquear o servidor)
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const r = await fetch(endpoint.url, {
        method: 'GET',
        headers: headersGet,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (r.ok) {
        const data = await r.json();
        const normalized = normalizarStatusWaha(data, session);
        statusCache.set(cacheKey, { result: normalized, ok: true, timestamp: Date.now() });
        return res.json(normalized);
      } else if (r.status === 401) {
        return res.status(401).json({
          status: 'DISCONNECTED',
          isReady: false,
          error: 'API Key inválida',
          statusCode: 401,
          message: 'Unauthorized'
        });
      } else if (r.status === 404) {
        continue;
      } else {
        await r.text().catch(() => '');
      }
    } catch (e) {
      continue;
    }
  }

  // Não confunda indisponibilidade do WAHA com uma sessão parada. Sem uma
  // confirmação positiva de existência, o frontend deve manter ações bloqueadas.
  const failResult = {
    status: 'UNAVAILABLE',
    isReady: false,
    sessionExists: false,
    qrCode: null,
    qrCodeImage: null,
    error: 'Não foi possível confirmar a sessão no WAHA.'
  };
  statusCache.set(cacheKey, { result: failResult, ok: false, timestamp: Date.now() });
  res.json(failResult);
});

// Confirma que a sessão existe sem executar nenhum comando que possa criá-la.
// Alguns provedores só a expõem na listagem geral; nesse caso, o nome precisa
// corresponder exatamente à sessão configurada.
async function confirmarSessaoExistente(serverUrl, encodedSessionName, sessionName, headers) {
  const attempts = [];

  try {
    const detailsResponse = await fetch(
      `${serverUrl}/api/sessions/${encodedSessionName}`,
      { method: 'GET', headers }
    );
    attempts.push({
      method: `GET /api/sessions/${sessionName}`,
      status: detailsResponse.status
    });

    if (detailsResponse.status === 401) {
      return { exists: false, unauthorized: true, attempts };
    }

    if (detailsResponse.ok) {
      return { exists: true, attempts };
    }
  } catch (error) {
    attempts.push({
      method: `GET /api/sessions/${sessionName}`,
      error: error.message
    });
  }

  try {
    const listResponse = await fetch(`${serverUrl}/api/sessions?all=true`, {
      method: 'GET',
      headers
    });
    attempts.push({
      method: 'GET /api/sessions?all=true',
      status: listResponse.status
    });

    if (listResponse.status === 401) {
      return { exists: false, unauthorized: true, attempts };
    }

    if (!listResponse.ok) {
      return { exists: false, attempts };
    }

    const sessions = await listResponse.json().catch(() => []);
    const exists = Array.isArray(sessions) && sessions.some((session) => {
      const candidateName =
      typeof session === 'string' ? session : session?.name || session?.id;
      return candidateName === sessionName;
    });

    return { exists, attempts };
  } catch (error) {
    attempts.push({
      method: 'GET /api/sessions?all=true',
      error: error.message
    });
    return { exists: false, attempts };
  }
}

// ==================== INICIAR SESSÃO JÁ CONFIGURADA (PROXY) ====================
// Segurança: esta rota jamais cria uma sessão. Ela só pode iniciar uma sessão
// que já exista no WAHA com exatamente o nome recebido.
router.post('/session/start', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  const serverUrl = cleanUrl(rawServerUrl);
  const configuredSessionName = String(sessionName).trim();
  const encodedSessionName = encodeURIComponent(configuredSessionName);
  const wahaApiKey = getWahaApiKey();
  const headers = getWahaHeaders(wahaApiKey);
  const attempts = [];

  console.log(`\n▶️ [session/start] Iniciando somente a sessão existente "${configuredSessionName}"`);

  // Confirma a existência ANTES de enviar qualquer comando de start. Isso impede
  // que variantes do WAHA interpretem um start como criação de sessão.
  const confirmation = await confirmarSessaoExistente(
    serverUrl,
    encodedSessionName,
    configuredSessionName,
    headers
  );
  attempts.push(...confirmation.attempts);

  if (confirmation.unauthorized) {
    return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
  }

  if (!confirmation.exists) {
    return res.status(404).json({
      error: `A sessão configurada "${configuredSessionName}" não existe no WAHA. Nenhuma sessão nova foi criada.`,
      sessionName: configuredSessionName,
      attempts
    });
  }

  // Usa somente o endpoint específico da sessão. POST /api/sessions e PUT
  // /api/sessions/{nome} foram removidos porque podem criar sessões novas.
  try {
    const startResponse = await fetch(
      `${serverUrl}/api/sessions/${encodedSessionName}/start`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      }
    );
    const data = await startResponse.json().catch(() => ({}));
    attempts.push({
      method: `POST /api/sessions/${configuredSessionName}/start`,
      status: startResponse.status
    });

    if (startResponse.status === 401) {
      return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
    }

    if (startResponse.ok || startResponse.status === 409 || startResponse.status === 422) {
      // O próximo poll precisa consultar o WAHA de verdade. Sem esta limpeza,
      // a tela poderia mostrar por até 15s o estado anterior ao start.
      statusCache.delete(`${serverUrl}_${configuredSessionName}`);
      return res.json({
        success: true,
        alreadyRunning: startResponse.status === 409 || startResponse.status === 422,
        method: `POST /api/sessions/${configuredSessionName}/start`,
        ...data
      });
    }

    return res.status(502).json({
      error: `Não foi possível iniciar a sessão configurada "${configuredSessionName}". Nenhuma sessão nova foi criada.`,
      sessionName: configuredSessionName,
      attempts
    });
  } catch (error) {
    attempts.push({
      method: `POST /api/sessions/${configuredSessionName}/start`,
      error: error.message
    });
    return res.status(502).json({
      error: `Não foi possível iniciar a sessão configurada "${configuredSessionName}". Nenhuma sessão nova foi criada.`,
      sessionName: configuredSessionName,
      attempts
    });
  }
});

// ==================== PARAR SESSÃO (PROXY) ====================
router.post('/session/stop', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, apiKey, clinicaId } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v9.1: Remove barra final do serverUrl ⭐⭐⭐
  const serverUrl = cleanUrl(rawServerUrl);

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();
  const headers = getWahaHeaders(wahaApiKey);

  console.log(`\n🛑 [session/stop] Parando sessão ${sessionName}`);

  const endpoints = [
  { method: 'POST', url: `${serverUrl}/api/sessions/stop`, body: { name: sessionName }, desc: 'POST /api/sessions/stop' },
  { method: 'POST', url: `${serverUrl}/api/sessions/${sessionName}/stop`, body: {}, desc: `POST /api/sessions/${sessionName}/stop` },
  { method: 'DELETE', url: `${serverUrl}/api/sessions/${sessionName}`, body: null, desc: `DELETE /api/sessions/${sessionName}` }];


  for (const endpoint of endpoints) {
    try {
      console.log(`🛑 Tentando: ${endpoint.desc}`);
      const options = { method: endpoint.method, headers };
      if (endpoint.body) options.body = JSON.stringify(endpoint.body);

      const r = await fetch(endpoint.url, options);
      console.log(`   Status: ${r.status}`);

      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        console.log(`🛑 ✅ Sessão parada via ${endpoint.desc}`);
        return res.json({ success: true, ...data });
      }
    } catch (e) {
      console.log(`   ❌ Erro: ${e.message}`);
      continue;
    }
  }

  res.status(500).json({ error: 'Não foi possível parar a sessão' });
});

// ==================== REINICIAR SESSÃO (PROXY) ====================
router.post('/session/restart', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  const serverUrl = cleanUrl(rawServerUrl);
  const configuredSessionName = String(sessionName).trim();
  const encodedSessionName = encodeURIComponent(configuredSessionName);
  const wahaApiKey = getWahaApiKey();
  const headers = getWahaHeaders(wahaApiKey);
  const attempts = [];

  console.log(`\n🔄 [session/restart] Recuperando somente a sessão configurada "${configuredSessionName}"`);

  // Nunca tenta recuperar uma sessão que não exista. Esta confirmação impede que
  // qualquer endpoint do provedor possa interpretar o reinício como criação.
  const confirmation = await confirmarSessaoExistente(
    serverUrl,
    encodedSessionName,
    configuredSessionName,
    headers
  );
  attempts.push(...confirmation.attempts);

  if (confirmation.unauthorized) {
    return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
  }

  if (!confirmation.exists) {
    return res.status(404).json({
      error: `A sessão configurada "${configuredSessionName}" não existe no WAHA. Nenhuma sessão nova foi criada.`,
      sessionName: configuredSessionName,
      attempts
    });
  }

  const callEndpoint = async (endpoint) => {
    try {
      console.log(`🔄 Tentando: ${endpoint.desc}`);
      const options = { method: endpoint.method, headers };
      if (endpoint.body !== undefined) options.body = JSON.stringify(endpoint.body);

      const response = await fetch(endpoint.url, options);
      const data = await response.json().catch(() => ({}));
      attempts.push({ method: endpoint.desc, status: response.status });

      if (response.status === 401) {
        return { unauthorized: true, data };
      }

      return { success: response.ok, status: response.status, data };
    } catch (error) {
      attempts.push({ method: endpoint.desc, error: error.message });
      console.log(`   ❌ Erro: ${error.message}`);
      return { success: false };
    }
  };

  const nativeRestartEndpoints = [
  {
    method: 'POST',
    url: `${serverUrl}/api/sessions/${encodedSessionName}/restart`,
    body: {},
    desc: `POST /api/sessions/${configuredSessionName}/restart`
  }];


  for (const endpoint of nativeRestartEndpoints) {
    const result = await callEndpoint(endpoint);
    if (result.unauthorized) {
      return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
    }
    if (
    result.success ||
    result.status === 409 ||
    result.status === 422 ||
    result.data?.statusCode === 409 ||
    result.data?.statusCode === 422)
    {
      console.log(`🔄 ✅ Sessão reiniciada ou já em processamento via ${endpoint.desc}`);
      statusCache.delete(`${serverUrl}_${configuredSessionName}`);
      return res.json({ success: true, method: endpoint.desc, ...result.data });
    }
  }

  // Alguns provedores WAHA não oferecem restart nativo. Nesse caso, tentamos
  // todos os formatos conhecidos de stop e start antes de reportar falha.
  console.log(`🔄 Restart nativo indisponível; iniciando recuperação stop + start`);

  const stopEndpoints = [
  {
    method: 'POST',
    url: `${serverUrl}/api/sessions/${encodedSessionName}/stop`,
    body: {},
    desc: `POST /api/sessions/${configuredSessionName}/stop`
  }];


  for (const endpoint of stopEndpoints) {
    const result = await callEndpoint(endpoint);
    if (result.unauthorized) {
      return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
    }
    if (result.success) break;
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // A recuperação só usa o endpoint específico da sessão já confirmada.
  // Endpoints genéricos foram removidos para não abrir qualquer chance de criação.
  const startEndpoints = [
  {
    method: 'POST',
    url: `${serverUrl}/api/sessions/${encodedSessionName}/start`,
    body: {},
    desc: `POST /api/sessions/${configuredSessionName}/start`
  }];


  for (const endpoint of startEndpoints) {
    const result = await callEndpoint(endpoint);
    if (result.unauthorized) {
      return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
    }
    if (
    result.success ||
    result.status === 409 ||
    result.status === 422 ||
    result.data?.statusCode === 409 ||
    result.data?.statusCode === 422)
    {
      console.log(`🔄 ✅ Sessão recuperada via stop + start (${endpoint.desc})`);
      statusCache.delete(`${serverUrl}_${configuredSessionName}`);
      return res.json({
        success: true,
        method: `stop + start: ${endpoint.desc}`,
        ...result.data
      });
    }
  }

  res.status(502).json({
    error: `Não foi possível reiniciar a sessão configurada "${sessionName}". Nenhuma nova sessão foi criada.`,
    detail: 'O WAHA não aceitou os comandos de reinício ou stop/start para esta sessão.',
    sessionName,
    attempts
  });
});

// ==================== TROCAR TELEFONE DA SESSÃO (PROXY) ====================
// Esta ação é explícita na interface e só desvincula o aparelho da sessão
// existente e confirmada. Ela nunca cria, renomeia ou substitui sessões.
router.post('/session/change-phone', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  const serverUrl = cleanUrl(rawServerUrl);
  const configuredSessionName = String(sessionName).trim();
  const encodedSessionName = encodeURIComponent(configuredSessionName);
  const headers = getWahaHeaders(getWahaApiKey());
  const attempts = [];

  const confirmation = await confirmarSessaoExistente(
    serverUrl,
    encodedSessionName,
    configuredSessionName,
    headers
  );
  attempts.push(...confirmation.attempts);

  if (confirmation.unauthorized) {
    return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
  }
  if (!confirmation.exists) {
    return res.status(404).json({
      error: `A sessão configurada "${configuredSessionName}" não existe no WAHA. Nenhuma sessão foi criada.`,
      sessionName: configuredSessionName,
      attempts
    });
  }

  try {
    // Usa somente a rota específica. A rota genérica de logout aceita nomes no
    // corpo e não é apropriada para uma operação sensível de troca de aparelho.
    const logoutResponse = await fetch(
      `${serverUrl}/api/sessions/${encodedSessionName}/logout`,
      { method: 'POST', headers, body: JSON.stringify({}) }
    );
    const logoutData = await logoutResponse.json().catch(() => ({}));
    attempts.push({
      method: `POST /api/sessions/${configuredSessionName}/logout`,
      status: logoutResponse.status
    });

    if (logoutResponse.status === 401) {
      return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
    }
    if (!logoutResponse.ok && logoutResponse.status !== 409 && logoutResponse.status !== 422) {
      return res.status(502).json({
        error: `Não foi possível desvincular o aparelho da sessão "${configuredSessionName}".`,
        sessionName: configuredSessionName,
        attempts
      });
    }

    // Algumas versões do WAHA passam automaticamente a aguardar QR após logout;
    // outras precisam do start específico. Este comando nunca pode criar sessão.
    const startResponse = await fetch(
      `${serverUrl}/api/sessions/${encodedSessionName}/start`,
      { method: 'POST', headers, body: JSON.stringify({}) }
    );
    const startData = await startResponse.json().catch(() => ({}));
    attempts.push({
      method: `POST /api/sessions/${configuredSessionName}/start`,
      status: startResponse.status
    });

    if (startResponse.status === 401) {
      return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
    }
    if (!startResponse.ok && startResponse.status !== 409 && startResponse.status !== 422) {
      return res.status(502).json({
        error: `O aparelho foi desvinculado, mas o WAHA não iniciou a sessão "${configuredSessionName}" para exibir o QR Code.`,
        sessionName: configuredSessionName,
        attempts
      });
    }

    statusCache.delete(`${serverUrl}_${configuredSessionName}`);
    return res.json({
      success: true,
      sessionName: configuredSessionName,
      message: 'Aparelho desvinculado. A sessão está pronta para apresentar um novo QR Code.',
      logout: logoutData,
      start: startData
    });
  } catch (error) {
    attempts.push({ error: error.message });
    return res.status(502).json({
      error: `Não foi possível preparar a sessão "${configuredSessionName}" para troca de telefone.`,
      sessionName: configuredSessionName,
      attempts
    });
  }
});

// ==================== LOGOUT SESSÃO (PROXY) ====================
router.post('/session/logout', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, apiKey, clinicaId } = req.body;

  if (!rawServerUrl || !sessionName) {
    return res.status(400).json({ error: 'serverUrl e sessionName são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v9.1: Remove barra final do serverUrl ⭐⭐⭐
  const serverUrl = cleanUrl(rawServerUrl);

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();
  const headers = getWahaHeaders(wahaApiKey);

  console.log(`\n🚪 [session/logout] Logout da sessão ${sessionName}`);

  const endpoints = [
  { method: 'POST', url: `${serverUrl}/api/sessions/logout`, body: { name: sessionName }, desc: 'POST /api/sessions/logout' },
  { method: 'POST', url: `${serverUrl}/api/sessions/${sessionName}/logout`, body: {}, desc: `POST /api/sessions/${sessionName}/logout` }];


  for (const endpoint of endpoints) {
    try {
      console.log(`🚪 Tentando: ${endpoint.desc}`);
      const r = await fetch(endpoint.url, {
        method: endpoint.method,
        headers,
        body: JSON.stringify(endpoint.body)
      });
      console.log(`   Status: ${r.status}`);

      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        console.log(`🚪 ✅ Logout via ${endpoint.desc}`);
        return res.json({ success: true, ...data });
      }
    } catch (e) {
      console.log(`   ❌ Erro: ${e.message}`);
      continue;
    }
  }

  // Fallback: tenta stop
  try {
    const stopR = await fetch(`${serverUrl}/api/sessions/stop`, {
      method: 'POST', headers, body: JSON.stringify({ name: sessionName })
    });
    if (stopR.ok) {
      return res.json({ success: true, method: 'stop (fallback)' });
    }
  } catch (e) {}

  res.status(500).json({ error: 'Não foi possível fazer logout da sessão' });
});

// ==================== ENVIAR MENSAGEM (PROXY) ====================
router.post('/send-message', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, number, message, apiKey, clinicaId, pacienteId, pacienteNome, consultaId } = req.body;

  if (!rawServerUrl || !sessionName || !number || !message) {
    return res.status(400).json({ error: 'serverUrl, sessionName, number e message são obrigatórios' });
  }

  // ⭐⭐⭐ FIX v9.1: Remove barra final do serverUrl ⭐⭐⭐
  const serverUrl = cleanUrl(rawServerUrl);

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  console.log(`📤 [send-message v15.0] apiKey: ${wahaApiKey ? '***' + wahaApiKey.slice(-4) : '⚠️ VAZIA'} (fonte: .env.local)`);
  if (!wahaApiKey) {
    console.log(`📤 ⚠️ [send-message] WAHA_API_KEY não definida em .env.local! Defina WAHA_API_KEY=sua_chave no .env.local`);
  }

  const headers = getWahaHeaders(wahaApiKey);

  // ⭐⭐⭐ FIX v9.6: Normaliza telefone com DDD automático ⭐⭐⭐
  let ufClinica = '';
  if (clinicaId) {
    ufClinica = await buscarUfClinica(clinicaId);
  }

  const resultado = normalizarTelefoneComDDD(number, ufClinica);
  let chatId = resultado.numero;

  if (resultado.semDDD) {
    console.log(`📤 [send-message] ⚠️ AVISO: Número ${number} não tem DDD e a clínica não tem UF configurada!`);
    return res.status(400).json({
      error: `O número ${number} não possui DDD (código de área). Configure o estado (UF) da clínica nas configurações ou informe o número completo com DDD.`,
      code: 'MISSING_DDD',
      numero: number
    });
  }

  if (resultado.dddAdicionado) {
    console.log(`📤 [send-message] DDD ${resultado.dddUsado} adicionado automaticamente (UF: ${resultado.uf})`);
  }

  chatId = `${chatId}@c.us`;

  console.log(`\n📤 [send-message] Enviando para ${chatId} via sessão ${sessionName} → ${serverUrl}`);

  try {
    // ⭐⭐⭐ FIX v15.0: Envio direto com key do .env.local ⭐⭐⭐
    const envioResult = await enviarMensagemRobusta(serverUrl, wahaApiKey, chatId, message, sessionName);

    if (envioResult && envioResult.success) {
      const wahaChatId = envioResult.chatId || chatId;
      console.log(`📤 ✅ [send-message] Mensagem enviada! chatId WAHA: ${wahaChatId}`);

      // ⭐⭐⭐ FIX v13.1: Se WAHA retornou um LID, aquece o cache para resolução rápida no webhook ⭐⭐⭐
      if (wahaChatId && wahaChatId.includes('@lid')) {
        const lidNum = wahaChatId.replace('@lid', '').replace(/\D/g, '');
        const phoneNum = chatId.replace('@c.us', '').replace(/\D/g, '');
        if (lidNum && phoneNum && lidNum !== phoneNum) {
          lidCache.set(lidNum, phoneNum);
          console.log(`📤 [FIX v13.1] lidCache aquecido via send-message: ${lidNum} → ${phoneNum}`);
        }
      }

      // Salva no histórico
      // ⭐⭐⭐ FIX v16.6: TODA mensagem enviada que espera resposta deve ser salva como 'pendente' ⭐⭐⭐
      // Isso inclui: lembretes, confirmações, pedidos de foto/documento, menus, etc.
      // Ao abrir um novo diálogo pendente, FECHA todos os anteriores primeiro.
      // O diálogo permanece 'pendente' até ser fechado explicitamente com fecharMensagensPendentes.
      if (clinicaId) {
        const msgUpper = (message || '').toUpperCase();

        // Detecta se a mensagem espera uma resposta do paciente
        const isDiálogoFoto = msgUpper.includes('FOTO SUA') || msgUpper.includes('FOTO DE PERFIL') || msgUpper.includes('SELFIE DE ROSTO') || msgUpper.includes('FOTO DO SEU ROSTO') || msgUpper.includes('ENVIE UMA FOTO') || msgUpper.includes('TROCAR FOTO');
        const isDiálogoDocumento = msgUpper.includes('ENVIAR DOCUMENTO') || msgUpper.includes('ENVIE O DOCUMENTO') || msgUpper.includes('ENVIAR O DOCUMENTO');
        const isLembrete = msgUpper.includes('LEMBRAMOS QUE VOCÊ TEM') || msgUpper.includes('LEMBRETE DE CONSULTA') || msgUpper.includes('CONSULTA AGENDADA');
        const isConfirmacao = (msgUpper.includes('CONFIRMAR') || msgUpper.includes('CONFIRME')) && (msgUpper.includes('CANCELAR') || msgUpper.includes('PRESENÇA'));
        const isMenu = msgUpper.includes('COMO POSSO AJUDAR') || msgUpper.includes('DIGITE O NÚMERO') || msgUpper.includes('DIGITE OUTRO NÚMERO') || msgUpper.includes('MINHAS CONSULTAS') && msgUpper.includes('HORÁRIO DE FUNCIONAMENTO');

        // ⭐⭐⭐ FIX v21.0: Se consultaId foi passado, SEMPRE salva como 'pendente' ⭐⭐⭐
        // Isso garante que templates customizados (que podem não conter as palavras-chave)
        // ainda sejam reconhecidos como mensagens que esperam resposta do paciente.
        const esperaResposta = isDiálogoFoto || isDiálogoDocumento || isLembrete || isConfirmacao || isMenu || !!consultaId;
        const statusMsg = esperaResposta ? 'pendente' : 'enviada';

        if (esperaResposta) {
          // ⭐⭐⭐ FIX v16.6: Fecha TODOS os diálogos pendentes anteriores ANTES de criar o novo ⭐⭐⭐
          const tipoDetectado = isDiálogoFoto ? 'FOTO' : isDiálogoDocumento ? 'DOCUMENTO' : isLembrete ? 'LEMBRETE' : isConfirmacao ? 'CONFIRMAÇÃO' : 'MENU';
          console.log(`📤 [FIX v16.6] Mensagem que espera resposta (${tipoDetectado}) → fechando pendentes anteriores e salvando como 'pendente'`);
          await fecharMensagensPendentes(clinicaId, wahaChatId);
        }

        await salvarMensagemHistorico(clinicaId, pacienteId || 'desconhecido', pacienteNome || 'Desconhecido', 'enviada', message, statusMsg, wahaChatId, consultaId || null);
        if (pacienteId && pacienteId !== 'desconhecido') {
          salvarWhatsAppChatId(clinicaId, pacienteId, wahaChatId).catch(() => {});
        }
      }

      return res.json({ ...(envioResult.data || {}), success: true, chatId: wahaChatId });
    }

    // ⭐⭐⭐ FIX v22.1: Mensagem específica quando WAHA redireciona para Status ⭐⭐⭐
    if (envioResult && envioResult.statusRedirect) {
      console.log(`📤 ❌ [send-message] WAHA redirecionou mensagem para o STATUS! Sessão "${sessionName}" precisa ser reconectada.`);
      return res.status(502).json({
        error: 'A mensagem foi redirecionada para o Status do WhatsApp em vez do contato. A sessão WAHA precisa ser reconectada.',
        success: false,
        statusRedirect: true,
        diagnostico: {
          serverUrl,
          sessionName,
          chatId,
          chatIdRetornado: envioResult.chatId,
          dica: 'Reconecte a sessão WAHA: vá em Configurações → WhatsApp → Reconectar Sessão'
        }
      });
    }

    console.log(`📤 ❌ [send-message] enviarMensagemRobusta retornou falha`);
    res.status(500).json({
      error: 'Não foi possível enviar a mensagem. Verifique se o WhatsApp está conectado.',
      diagnostico: {
        serverUrl,
        sessionName,
        chatId,
        apiKeyPresente: !!wahaApiKey,
        blocked: envioResult?.blocked || false,
        dica: 'Verifique se o WAHA está rodando e a sessão está conectada'
      }
    });
  } catch (err) {
    console.error(`📤 ❌ [send-message] EXCEÇÃO: ${err.message}`);
    res.status(500).json({
      error: `Erro ao enviar mensagem: ${err.message}`,
      diagnostico: {
        serverUrl,
        sessionName,
        chatId,
        apiKeyPresente: !!wahaApiKey,
        erroInterno: err.message
      }
    });
  }
});

// ==================== ENVIAR ARQUIVO/MÍDIA (PROXY) ====================
// ⭐⭐⭐ v6.0 - SIMPLIFICADO: Baseado no padrão Python que funciona ⭐⭐⭐
// Python: POST /api/sendFile → { chatId, file: { mimetype, url, filename }, caption, session }
router.post('/send-file', async (req, res) => {
  const { serverUrl: rawServerUrl, sessionName, number, apiKey, clinicaId, caption, mimetype, filename } = req.body;
  let { file } = req.body;

  if (!rawServerUrl || !sessionName || !number || !file) {
    return res.status(400).json({ error: 'serverUrl, sessionName, number e file são obrigatórios' });
  }

  const serverUrl = cleanUrl(rawServerUrl);

  // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
  const wahaApiKey = getWahaApiKey();

  const headers = getWahaHeaders(wahaApiKey);

  let chatId = number.replace(/\D/g, '');
  if (!chatId.startsWith('55') && chatId.length <= 11) {
    chatId = '55' + chatId;
  }
  chatId = `${chatId}@c.us`;

  // ⭐ Detecta mimetype e extrai base64
  let base64Data = file;
  let detectedMimetype = mimetype || 'application/octet-stream';

  if (file.startsWith('data:')) {
    // ⭐⭐⭐ FIX v6.1: Parser robusto para data URI ⭐⭐⭐
    // jsPDF gera: data:application/pdf;filename=generated.pdf;base64,XXXX
    // O regex antigo falhava porque não esperava o ";filename=..." extra
    const base64Marker = ';base64,';
    const base64Index = file.indexOf(base64Marker);
    if (base64Index !== -1) {
      // Extrai mimetype: tudo entre "data:" e o primeiro ";"
      const headerPart = file.substring(5, base64Index); // remove "data:"
      detectedMimetype = headerPart.split(';')[0]; // pega só o mimetype (ex: application/pdf)
      base64Data = file.substring(base64Index + base64Marker.length);
      console.log(`📎 [send-file] Data URI parseado: mimetype=${detectedMimetype}, headerExtra="${headerPart}"`);
    } else {
      // Fallback: tenta formato simples data:mimetype,DATA (sem base64)
      const commaIndex = file.indexOf(',');
      if (commaIndex !== -1) {
        const headerPart = file.substring(5, commaIndex);
        detectedMimetype = headerPart.split(';')[0];
        base64Data = file.substring(commaIndex + 1);
        console.log(`📎 [send-file] Data URI simples (sem ;base64): mimetype=${detectedMimetype}`);
      }
    }
  }

  base64Data = base64Data.replace(/[\s\r\n]/g, '');

  const finalMimetype = mimetype || detectedMimetype;
  const finalFilename = filename || `arquivo.${finalMimetype.includes('pdf') ? 'pdf' : finalMimetype.includes('image') ? 'jpg' : 'bin'}`;

  console.log(`\n📎📎📎 [send-file v6.0] ========================================`);
  console.log(`📎 Enviando para ${chatId}`);
  console.log(`📎 filename: ${finalFilename}`);
  console.log(`📎 mimetype: ${finalMimetype}`);
  console.log(`📎 base64 length: ${base64Data.length} chars (~${Math.round(base64Data.length * 0.75 / 1024)} KB)`);

  // ⭐⭐⭐ PASSO 1: Salva arquivo temp e gera URL pública ⭐⭐⭐
  // (Igual ao padrão Python: WAHA baixa o arquivo via URL)
  const path = require('path');
  const fs = require('fs');
  const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFileName = `wha_${Date.now()}_${Math.random().toString(36).slice(2)}_${finalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const tempFilePath = path.join(tempDir, tempFileName);
  let tempFileUrl = '';
  let tempFileSize = 0;

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    tempFileSize = buffer.length;
    fs.writeFileSync(tempFilePath, buffer);

    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      tempFileUrl = `https://${host}/uploads/temp/${encodeURIComponent(tempFileName)}`;
    } else {
      tempFileUrl = `${protocol}://${host}/uploads/temp/${encodeURIComponent(tempFileName)}`;
    }
    // Link assinado (1 h): o WAHA baixa o anexo sem precisar de login
    tempFileUrl = require('../services/uploadsSeguros').assinarUrlUpload(tempFileUrl, 3600);
    console.log(`📎 ✅ Arquivo temp: ${tempFileSize} bytes → ${tempFileUrl}`);
  } catch (fsErr) {
    console.error(`📎 ❌ Erro ao salvar arquivo temp:`, fsErr.message);
  }

  // Limpa arquivo temporário após 120 segundos
  if (tempFilePath) {
    setTimeout(() => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {/* ignora */}
    }, 120000);
  }

  // ⭐⭐⭐ PASSO 2: Envia igual ao Python - POST /api/sendFile com file.url ⭐⭐⭐
  // Prioridade 1: URL (WAHA baixa o arquivo - mais confiável, igual Python)
  // Prioridade 2: base64 no file.data (fallback se URL não funcionar)
  const tentativas = [];

  if (tempFileUrl) {
    tentativas.push({
      body: {
        chatId,
        file: { mimetype: finalMimetype, filename: finalFilename, url: tempFileUrl },
        caption: caption || '',
        session: sessionName
      },
      desc: 'file.url (padrão Python)'
    });
  }

  tentativas.push({
    body: {
      chatId,
      file: { mimetype: finalMimetype, filename: finalFilename, data: base64Data },
      caption: caption || '',
      session: sessionName
    },
    desc: 'file.data (base64 fallback)'
  });

  let lastError = '';

  for (const tentativa of tentativas) {
    try {
      console.log(`📎 Tentando: POST /api/sendFile (${tentativa.desc})`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      // ⭐⭐⭐ FIX v11.9: POST /api/sendFile - tenta formato chatting ⭐⭐⭐
      const sendFileUrl = `${serverUrl}/api/${encodeURIComponent(sessionName)}/chatting/sendFile`;
      const r = await fetch(sendFileUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(tentativa.body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log(`   Status: ${r.status}`);

      if (r.ok || r.status === 201) {
        const data = await r.json().catch(() => ({}));
        console.log(`📎 ✅ Arquivo enviado via ${tentativa.desc}`);
        console.log(`📎📎📎 ======================================== FIM\n`);
        return res.json({ success: true, ...data, method: tentativa.desc });
      } else if (r.status === 401) {
        console.log(`📎📎📎 ======================================== FIM\n`);
        return res.status(401).json({ error: 'API Key inválida', statusCode: 401 });
      } else {
        const errText = await r.text().catch(() => '');
        lastError = `${r.status}: ${errText}`;
        console.log(`   ❌ ${r.status}: ${errText.substring(0, 500)}`);

        if (r.status === 500) {
          try {
            const errJson = JSON.parse(errText);
            if (errJson.message) console.log(`   🔍 Mensagem: ${errJson.message}`);
          } catch (parseErr) {/* não é JSON */}
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        lastError = 'Timeout (30s)';
        console.log(`   ❌ Timeout (30s)`);
      } else {
        lastError = e.message;
        console.log(`   ❌ Erro: ${e.message}`);
      }
      continue;
    }
  }

  console.log(`📎 ❌ Nenhuma tentativa funcionou`);
  console.log(`📎 Último erro: ${lastError}`);
  console.log(`📎📎📎 ======================================== FIM\n`);
  res.status(500).json({
    error: 'Não foi possível enviar o arquivo. Verifique se o WAHA está conectado.',
    lastError,
    diagnostico: { serverUrl, sessionName, fileSize: tempFileSize, mimetype: finalMimetype, filename: finalFilename, tempFileUrl: tempFileUrl || '(não gerado)' }
  });
});

// ==================== SOLICITAR DOCUMENTO VIA WHATSAPP ====================
router.post('/solicitar-documento', async (req, res) => {
  const { clinicaId, pacienteId, pacienteNome, telefone, tipo, categoria, especialidade, serverUrl, sessionName, apiKey } = req.body;

  if (!clinicaId || !pacienteId || !telefone || !tipo) {
    return res.status(400).json({ error: 'clinicaId, pacienteId, telefone e tipo são obrigatórios' });
  }

  console.log(`\n📄 [solicitar-documento] ========================================`);
  console.log(`📄 Tipo: ${tipo}, Categoria: ${categoria || 'outros'}, Especialidade: ${especialidade || '(não definida)'}`);
  console.log(`📄 Paciente: ${pacienteNome} (${pacienteId})`);

  try {
    const solicitacaoId = await criarSolicitacao(clinicaId, pacienteId, pacienteNome, telefone, tipo, categoria || 'outros', especialidade || null);

    // Envia mensagem ao paciente via WhatsApp
    if (serverUrl && sessionName) {
      // ⭐⭐⭐ FIX v15.0: ÚNICA fonte de apiKey = .env.local ⭐⭐⭐
      const wahaApiKey = getWahaApiKey();

      let chatId = telefone.replace(/\D/g, '');
      if (!chatId.startsWith('55') && chatId.length <= 11) chatId = '55' + chatId;
      chatId = `${chatId}@c.us`;

      const categoriaLabels = { 'exames': 'exame', 'laudos': 'laudo', 'receitas': 'receita', 'atestados': 'atestado', 'imagens': 'imagem/raio-x', 'foto': 'foto de perfil', 'outros': 'documento' };
      const tipoLabel = categoriaLabels[categoria] || categoriaLabels[tipo] || 'documento';

      let mensagem;
      if (tipo === 'foto' || categoria === 'foto') {
        mensagem = `📷 *SOLICITAÇÃO DE FOTO DE PERFIL*\n\nOlá ${pacienteNome || ''}! A clínica está solicitando uma foto sua para o cadastro.\n\n📸 Por favor, envie uma foto do seu rosto nesta conversa.\n\n_A foto será salva como sua foto de perfil no sistema._`;
      } else {
        mensagem = `📄 *SOLICITAÇÃO DE DOCUMENTO*\n\nOlá ${pacienteNome || ''}! A clínica está solicitando o envio de um ${tipoLabel}.\n\n📎 Por favor, envie o ${tipoLabel} como foto ou arquivo nesta conversa.\n\n_O documento será salvo automaticamente no seu prontuário._`;
      }

      const envioResult = await enviarMensagemRobusta(serverUrl, wahaApiKey, chatId, mensagem, sessionName);

      if (envioResult && envioResult.success) {
        console.log(`📄 ✅ Mensagem de solicitação enviada!`);
        // ⭐⭐⭐ FIX v10.1: Usa chatId da resposta do WAHA ⭐⭐⭐
        const wahaChatId = envioResult.chatId || chatId;
        // ⭐⭐⭐ FIX v20.3: Solicitação ESPERA resposta → fecha pendentes anteriores e salva como 'pendente' ⭐⭐⭐
        await fecharMensagensPendentes(clinicaId, wahaChatId);
        await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', mensagem, 'pendente', wahaChatId);
      }
    }

    res.json({ success: true, solicitacaoId });
  } catch (e) {
    console.error(`📄 ❌ Erro: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ==================== CANCELAR SOLICITAÇÃO ====================
router.post('/cancelar-solicitacao', async (req, res) => {
  const { clinicaId, solicitacaoId } = req.body;

  if (!clinicaId || !solicitacaoId) {
    return res.status(400).json({ error: 'clinicaId e solicitacaoId são obrigatórios' });
  }

  try {
    await cancelarSolicitacao(clinicaId, solicitacaoId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== LISTAR SOLICITAÇÕES PENDENTES ====================
router.get('/solicitacoes', async (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaSolicitacoes(db);

    let query = `SELECT * FROM solicitacoes_pendentes WHERE clinicaId = ?`;
    const params = [clinicaId];

    if (pacienteId) {
      query += ` AND pacienteId = ?`;
      params.push(pacienteId);
    }

    query += ` ORDER BY criadoEm DESC LIMIT 50`;

    const solicitacoes = await new Promise((r) => db.all(query, params, (err, rows) => r(rows || [])));
    res.json(solicitacoes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;