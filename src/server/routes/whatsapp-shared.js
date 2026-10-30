// ==================== WHATSAPP SHARED STATE & UTILITIES ====================
// Módulo compartilhado entre whatsapp.js (rotas proxy) e webhook.js (handler de webhook)
// Extraído cirurgicamente de whatsapp.js v9.8.0 - PRESERVANDO TODO O CÓDIGO ORIGINAL
// VERSÃO: 9.8.0 - 2026-03-05

// ⭐⭐⭐ FIX v8.7.1: FETCH - Prioriza node-fetch@2 (mais estável para servidor) ⭐⭐⭐
// O fetch nativo do Node 18+ (undici) tem comportamentos diferentes que podem causar
// problemas com download de mídia, headers e timeouts.
// node-fetch@2 é CommonJS, battle-tested e já está no package.json.
let fetch;
try {
  fetch = require('node-fetch');
  console.log('✅ [WhatsApp] Usando node-fetch@2 (CommonJS - RECOMENDADO para servidor)');
} catch (e) {
  if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch;
    console.log('⚠️ [WhatsApp] Usando fetch NATIVO do Node.js (fallback - pode ter comportamento diferente)');
  } else {
    console.error('❌ [WhatsApp] ERRO CRÍTICO: Nenhum fetch disponível!');
    console.error('   Solução: Execute "npm install node-fetch@2" no diretório server/');
    fetch = async () => {
      throw new Error('fetch não disponível. Execute: cd server && npm install node-fetch@2');
    };
  }
}

const path = require('path');
const fs = require('fs');
const { uploadToCloud } = require('../services/cloudStorage');

// ⭐⭐⭐ FIX v15.1: Garante que .env.local seja carregado AQUI também ⭐⭐⭐
// (caso start-server.js não tenha conseguido carregar)
if (!process.env.WAHA_API_KEY && !process.env.VITE_WAHA_API_KEY) {
  try {
    const dotenv = require('dotenv');
    const searchPaths = [
    path.join(__dirname, '..', '.env.local'), // server/../.env.local
    path.resolve(__dirname, '..', '..', '.env.local'), // 2 níveis acima
    path.resolve(__dirname, '..', '..', '..', '.env.local'), // 3 níveis
    path.join(process.cwd(), '.env.local') // cwd
    ];
    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`🔑 [whatsapp-shared] .env.local carregado de: ${p}`);
        const k = process.env.WAHA_API_KEY || process.env.VITE_WAHA_API_KEY || '';
        console.log(`🔑 [whatsapp-shared] WAHA_API_KEY: ${k ? '✅ ***' + k.slice(-4) : '⚠️ vazia mesmo após carregar!'}`);
        break;
      }
    }
  } catch (e) {
    console.log(`⚠️ [whatsapp-shared] dotenv não disponível: ${e.message}`);
  }
}

const { getClinicaDB } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');

const WHATSAPP_MODULE_VERSION = '9.8.0';
const WHATSAPP_MODULE_BUILD = '2026-03-05-FIX-MENU-AJUDA-CONFIRMACAO-CONFLITO';

// ⭐⭐⭐ NOVO v9.6: MAPA UF → DDD PADRÃO (código de área principal do estado) ⭐⭐⭐
const UF_DDD_MAP = {
  'AC': '68', 'AL': '82', 'AM': '92', 'AP': '96', 'BA': '71',
  'CE': '85', 'DF': '61', 'ES': '27', 'GO': '62', 'MA': '98',
  'MG': '31', 'MS': '67', 'MT': '65', 'PA': '91', 'PB': '83',
  'PE': '81', 'PI': '86', 'PR': '41', 'RJ': '21', 'RN': '84',
  'RO': '69', 'RR': '95', 'RS': '51', 'SC': '48', 'SE': '79',
  'SP': '11', 'TO': '63'
};

// ⭐⭐⭐ NOVO v9.6: Detecta se número tem DDD e adiciona automaticamente se necessário ⭐⭐⭐
function normalizarTelefoneComDDD(numero, ufClinica) {
  let limpo = (numero || '').replace(/\D/g, '');

  // Remove prefixo 55 se presente para analisar
  let semPrefixo = limpo;
  if (semPrefixo.startsWith('55') && semPrefixo.length > 11) {
    semPrefixo = semPrefixo.substring(2);
  }

  // Se tem 10-11 dígitos, já tem DDD (ex: 6199999999 ou 61999999999)
  if (semPrefixo.length >= 10 && semPrefixo.length <= 11) {
    // ⭐⭐⭐ FIX v9.9.1: SEMPRE adiciona código do país 55 ⭐⭐⭐
    // Antes: if (!limpo.startsWith('55')) → FALHAVA quando DDD era 55 (Santa Maria/RS)
    // Ex: 55997010404 (DDD 55 + 997010404) era tratado como se já tivesse código do país
    // Agora: semPrefixo tem 10-11 dígitos = número NACIONAL com DDD → SEMPRE adiciona 55
    limpo = '55' + semPrefixo;
    console.log(`📞 [normalizarTelefone] Número com DDD: ${semPrefixo} → ${limpo} (adicionado código país 55)`);
    return { numero: limpo, dddAdicionado: false, dddUsado: semPrefixo.substring(0, 2) };
  }

  // Se tem 8-9 dígitos, NÃO tem DDD
  if (semPrefixo.length >= 8 && semPrefixo.length <= 9) {
    const uf = (ufClinica || '').toUpperCase().trim();
    const ddd = UF_DDD_MAP[uf];

    if (ddd) {
      limpo = '55' + ddd + semPrefixo;
      console.log(`📞 [normalizarTelefone] DDD ausente! Adicionado DDD ${ddd} (UF: ${uf}) → ${limpo}`);
      return { numero: limpo, dddAdicionado: true, dddUsado: ddd, uf };
    } else {
      // Sem UF configurada - não consegue adicionar DDD
      console.log(`📞 [normalizarTelefone] ⚠️ DDD ausente e UF não configurada! Número: ${semPrefixo}`);
      // Tenta enviar mesmo assim com 55 + número (vai falhar no WhatsApp)
      if (!limpo.startsWith('55')) {
        limpo = '55' + semPrefixo;
      }
      return { numero: limpo, dddAdicionado: false, semDDD: true };
    }
  }

  // Número muito curto ou muito longo - retorna como está
  if (!limpo.startsWith('55') && limpo.length <= 11) {
    limpo = '55' + limpo;
  }
  return { numero: limpo, dddAdicionado: false };
}

// ⭐⭐⭐ NOVO v9.6: Busca UF da clínica no banco ⭐⭐⭐
async function buscarUfClinica(clinicaId) {
  try {
    const clinica = await dbGlobal.prepare('SELECT uf FROM clinicas WHERE id = ?').get(clinicaId);
    return clinica?.uf || '';
  } catch (e) {
    return '';
  }
}

// ⭐⭐⭐ DEBUG: Armazena últimos webhooks recebidos para diagnóstico ⭐⭐⭐
const ultimosWebhooks = [];
const MAX_WEBHOOKS_DEBUG = 10;

// ⭐⭐⭐ FIX v15.3: HARDCODED FALLBACK — garante que a key SEMPRE esteja disponível ⭐⭐⭐
// Prioridade: 1) process.env, 2) fallback hardcoded
const WAHA_API_KEY_FALLBACK = '';

// ⭐⭐⭐ NOVA FUNÇÃO: Retorna a API key com fallback — USE EM TODAS AS ROTAS ⭐⭐⭐
function getWahaApiKey() {
  return (process.env.WAHA_API_KEY || process.env.VITE_WAHA_API_KEY || WAHA_API_KEY_FALLBACK).trim();
}

function getWahaHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  const key = apiKey || getWahaApiKey();
  if (key) {
    headers['X-Api-Key'] = key;
  }
  return headers;
}

// ⭐⭐⭐ FIX v12.4: cleanUrl SÓ remove barra final — NÃO força HTTPS ⭐⭐⭐
// Cada função (enviarMensagemRobusta, baixarMidia, baixarMidiaViaWaha) tenta HTTP e HTTPS individualmente.
// Forçar HTTPS aqui quebrava baixarMidiaViaWaha quando o WAHA aceita apenas HTTP.
function cleanUrl(url) {
  return (url || '').replace(/\/+$/, '');
}

// ⭐⭐⭐ NOVA FUNÇÃO v8.2: ENVIO ROBUSTO DE MENSAGEM (múltiplos endpoints + fallback) ⭐⭐⭐
// ⭐⭐⭐ FIX v10.1: Retorna objeto com chatId da resposta do WAHA (em vez de apenas true/false) ⭐⭐⭐
async function enviarMensagemRobusta(serverUrl, apiKey, chatId, text, sessionId) {
  const headers = getWahaHeaders(apiKey);
  // ⭐⭐⭐ FIX: Remove barra final do serverUrl ⭐⭐⭐
  const cleanServerUrl = (serverUrl || '').replace(/\/+$/, '');

  // ⭐⭐⭐ FIX v22.0: PROTEÇÃO CONTRA ENVIO AO STATUS DO WHATSAPP ⭐⭐⭐
  // Se chatId é vazio, 'status@broadcast', ou não contém '@c.us', bloqueia o envio
  if (!chatId || chatId === 'status@broadcast' || chatId.includes('status@')) {
    console.log(`📤 ❌ [FIX v22.0] BLOQUEADO: Tentativa de enviar para Status! chatId="${chatId}"`);
    return { success: false, chatId: null, data: null, blocked: true };
  }
  // Garante que chatId termina com @c.us (formato correto para contatos individuais)
  if (!chatId.includes('@')) {
    console.log(`📤 ⚠️ [FIX v22.0] chatId sem @: "${chatId}" — adicionando @c.us`);
    chatId = `${chatId}@c.us`;
  }

  // ⭐⭐⭐ FIX v12.2: Gera variantes HTTP/HTTPS para tentar ambos ⭐⭐⭐
  const urlVariants = [cleanServerUrl];
  if (cleanServerUrl.startsWith('http://') && !cleanServerUrl.includes('localhost') && !cleanServerUrl.includes('127.0.0.1')) {
    urlVariants.push(cleanServerUrl.replace('http://', 'https://'));
  } else if (cleanServerUrl.startsWith('https://')) {
    // HTTPS primeiro (já está), adiciona HTTP como fallback
    urlVariants.push(cleanServerUrl.replace('https://', 'http://'));
  }

  console.log(`📤 [enviarRobusta v22.0] serverUrl: ${cleanServerUrl}, session: "${sessionId}", chatId: ${chatId}`);
  console.log(`📤 [enviarRobusta] URLs a tentar: ${urlVariants.join(' → ')}`);

  // ⭐⭐⭐ FIX v22.0: Body idêntico ao Python que funciona ⭐⭐⭐
  // Python: { "chatId": "55...@c.us", "text": texto, "session": session, "linkPreview": True, "reply_to": None }
  const body = { chatId, text, session: sessionId, linkPreview: true, reply_to: null };
  const bodyStr = JSON.stringify(body);
  console.log(`📤 [enviarRobusta v22.0] Body completo: ${bodyStr.substring(0, 300)}`);

  for (const baseUrl of urlVariants) {
    const url = `${baseUrl}/api/sendText`;
    try {
      console.log(`📤 [enviarRobusta] Tentando: ${url}`);
      const r = await fetch(url, { method: 'POST', headers, body: bodyStr });

      if (r.ok || r.status === 201) {
        const data = await r.json().catch(() => ({}));
        const wahaChatId = data.chatId || data.key?.remoteJid || data.to || data.chat?.id || chatId;
        console.log(`📤 [enviarRobusta] ✅ Enviado via ${baseUrl} (WAHA chatId: ${wahaChatId})`);
        // ⭐⭐⭐ FIX v22.1: DETECTA se WAHA redirecionou para Status e RETORNA ERRO ⭐⭐⭐
        // Antes: detectava mas retornava success:true (mensagem ia pro Status e usuário achava que enviou)
        // Agora: retorna success:false para que o frontend mostre erro ao usuário
        if (wahaChatId && (wahaChatId.includes('status@') || wahaChatId === 'status@broadcast')) {
          console.log(`📤 ⚠️⚠️⚠️ [FIX v22.1] ALERTA CRÍTICO: WAHA retornou chatId "${wahaChatId}" — mensagem FOI PARA O STATUS!`);
          console.log(`📤 ⚠️ chatId enviado: ${chatId} | chatId retornado: ${wahaChatId}`);
          console.log(`📤 ⚠️ SOLUÇÃO: Reconecte a sessão "${sessionId}" no WAHA ou verifique a versão do WAHA`);
          console.log(`📤 ⚠️ Body enviado: ${bodyStr.substring(0, 200)}`);
          return { success: false, chatId: wahaChatId, data, statusRedirect: true, error: 'Mensagem foi redirecionada para o Status do WhatsApp em vez do contato. Reconecte a sessão WAHA.' };
        }
        return { success: true, chatId: wahaChatId, data };
      } else if (r.status === 401) {
        console.log(`📤 [enviarRobusta] ❌ 401 - API KEY INVÁLIDA`);
        return { success: false, chatId: null, data: null };
      } else {
        const errText = await r.text().catch(() => '');
        console.log(`📤 [enviarRobusta] ❌ ${r.status}: ${errText.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`📤 [enviarRobusta] ❌ Erro de rede em ${baseUrl}: ${e.message}`);
    }
  }
  console.log(`📤 [enviarRobusta] ❌ FALHA TOTAL: Não enviou para ${chatId}. Tentou ${urlVariants.length} URLs.`);
  return { success: false, chatId: null, data: null };
}

// ⭐⭐⭐ NOVO v19.2: ENVIO DE LOCALIZAÇÃO VIA WAHA (/api/sendLocation) ⭐⭐⭐
async function enviarLocalizacao(serverUrl, apiKey, chatId, latitude, longitude, title, address, sessionId) {
  const headers = getWahaHeaders(apiKey);
  const cleanServerUrl = (serverUrl || '').replace(/\/+$/, '');

  const urlVariants = [cleanServerUrl];
  if (cleanServerUrl.startsWith('http://') && !cleanServerUrl.includes('localhost') && !cleanServerUrl.includes('127.0.0.1')) {
    urlVariants.push(cleanServerUrl.replace('http://', 'https://'));
  } else if (cleanServerUrl.startsWith('https://')) {
    urlVariants.push(cleanServerUrl.replace('https://', 'http://'));
  }

  console.log(`📍 [enviarLocalizacao] lat=${latitude}, lng=${longitude}, title="${title}"`);

  const body = JSON.stringify({
    chatId,
    latitude,
    longitude,
    title: title || '',
    address: address || '',
    session: sessionId
  });

  for (const baseUrl of urlVariants) {
    const url = `${baseUrl}/api/sendLocation`;
    try {
      console.log(`📍 [enviarLocalizacao] Tentando: ${url}`);
      const r = await fetch(url, { method: 'POST', headers, body });

      if (r.ok || r.status === 201) {
        const data = await r.json().catch(() => ({}));
        console.log(`📍 [enviarLocalizacao] ✅ Localização enviada via ${baseUrl}`);
        return { success: true, data };
      } else {
        const errText = await r.text().catch(() => '');
        console.log(`📍 [enviarLocalizacao] ❌ ${r.status}: ${errText.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`📍 [enviarLocalizacao] ❌ Erro de rede em ${baseUrl}: ${e.message}`);
    }
  }
  console.log(`📍 [enviarLocalizacao] ❌ FALHA: Não enviou localização para ${chatId}`);
  return { success: false, data: null };
}

// ⭐⭐⭐ NOVO v19.2: GEOCODIFICAÇÃO VIA NOMINATIM (OpenStreetMap - gratuito) ⭐⭐⭐
async function geocodificarEndereco(endereco) {
  if (!endereco || endereco.trim().length < 5) return null;

  try {
    const enderecoEncoded = encodeURIComponent(endereco + ', Brasil');
    const url = `https://nominatim.openstreetmap.org/search?q=${enderecoEncoded}&format=json&limit=1&countrycodes=br`;

    console.log(`🌍 [geocodificar] Buscando coordenadas para: "${endereco}"`);

    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'EasyClin-WhatsApp/1.0',
        'Accept': 'application/json'
      }
    });

    if (!r.ok) {
      console.log(`🌍 [geocodificar] ❌ HTTP ${r.status}`);
      return null;
    }

    const results = await r.json();

    if (results && results.length > 0) {
      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);
      console.log(`🌍 [geocodificar] ✅ Encontrado: lat=${lat}, lng=${lng} (${results[0].display_name})`);
      return { latitude: lat, longitude: lng, displayName: results[0].display_name };
    }

    console.log(`🌍 [geocodificar] ⚠️ Nenhum resultado para: "${endereco}"`);
    return null;
  } catch (e) {
    console.log(`🌍 [geocodificar] ❌ Erro: ${e.message}`);
    return null;
  }
}

// ⭐ APENAS DIÁLOGOS DE CONVERSA (não foto/documento)
const conversasAguardandoMotivo = new Map();
const dialogosAjuda = new Map();
const dialogosIdentificacao = new Map();
const pacientesIdentificados = new Map();
const midiasPendentes = new Map();

// ⭐⭐⭐ FIX v25.2: COOLDOWN PÓS-CONFIRMAÇÃO ⭐⭐⭐
// Após confirmar/cancelar uma consulta, ignora mensagens seguintes por 3 minutos
// para evitar que mensagens casuais do paciente sejam processadas como
// confirmação/cancelamento de OUTRA consulta pendente.
// Chave: `${clinicaId}_${ultimos9}` → { timestamp, consultaId, acao }
const cooldownConfirmacao = new Map();
const TEMPO_COOLDOWN_CONFIRMACAO = 3 * 60 * 1000; // 3 minutos

// ⭐⭐⭐ NOVO: Cache de LID → Telefone (para resolver Linked IDs do WhatsApp) ⭐⭐⭐
const lidCache = new Map(); // lid_number → phone_number

// ⭐⭐⭐ NOVO: DIÁLOGOS DE FOTO (aguardando paciente enviar foto de perfil) ⭐⭐⭐
const dialogosFoto = new Map();

// ⭐⭐⭐ FIX v19.0: LIMPA TODOS OS DIÁLOGOS ANTERIORES AO INICIAR UM NOVO ⭐⭐⭐
// Um novo diálogo SEMPRE elimina todos os diálogos anteriores do mesmo usuário/telefone.
// Isso evita conflitos entre diálogos de motivo, ajuda, foto, identificação, etc.
function limparTodosDialogosUsuario(clinicaId, chaveDialogo, chave9) {
  const mapas = [
  { nome: 'conversasAguardandoMotivo', mapa: conversasAguardandoMotivo },
  { nome: 'dialogosAjuda', mapa: dialogosAjuda },
  { nome: 'dialogosFoto', mapa: dialogosFoto },
  { nome: 'dialogosIdentificacao', mapa: dialogosIdentificacao },
  { nome: 'midiasPendentes', mapa: midiasPendentes }];

  let totalRemovidos = 0;
  for (const { nome, mapa } of mapas) {
    if (mapa.has(chaveDialogo)) {
      mapa.delete(chaveDialogo);
      totalRemovidos++;
    }
    if (chave9 && mapa.has(chave9)) {
      mapa.delete(chave9);
      totalRemovidos++;
    }
    // Também limpa variações com prefixo 55
    for (const [key] of mapa.entries()) {
      if (!key.startsWith(clinicaId + '_')) continue;
      // Se a chave contém os mesmos últimos 9 dígitos, remove
      const chaveUltimos9 = chaveDialogo.slice(-9);
      const keyUltimos9 = key.replace(`${clinicaId}_`, '').replace('9_', '').slice(-9);
      if (chaveUltimos9.length >= 9 && keyUltimos9 === chaveUltimos9) {
        mapa.delete(key);
        totalRemovidos++;
      }
    }
  }
  if (totalRemovidos > 0) {
    console.log(`🧹 [FIX v19.0] limparTodosDialogosUsuario: ${totalRemovidos} diálogos removidos para ${chaveDialogo}`);
  }
}

// ⭐⭐⭐ EXPORTA FUNÇÃO PARA ATIVAR DIÁLOGO EXTERNAMENTE ⭐⭐⭐
global.ativarDialogoAjuda = function (clinicaId, telefone, pacienteId, pacienteNome) {
  // Normaliza o telefone
  let telLimpo = telefone.replace(/\D/g, '');
  if (telLimpo.startsWith('55') && telLimpo.length > 11) {
    telLimpo = telLimpo.substring(2);
  }

  // ⭐⭐⭐ FIX v9.9: Usa últimos 9 dígitos como chave canônica ⭐⭐⭐
  const ultimos9 = telLimpo.slice(-9);
  const chave = `${clinicaId}_${telLimpo}`;
  const chave9 = `${clinicaId}_9_${ultimos9}`;

  console.log(`\n📱📱📱 [global.ativarDialogoAjuda v9.9] ========================================`);
  console.log(`📱 Ativando diálogo de ajuda`);
  console.log(`📱 Chave principal: ${chave}`);
  console.log(`📱 Chave canônica: ${chave9}`);
  console.log(`📱 PacienteId: ${pacienteId || '(não informado)'}`);
  console.log(`📱 PacienteNome: ${pacienteNome || '(não informado)'}`);

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
  dialogosAjuda.set(chave9, dialogoData);

  console.log(`📱 ✅ Diálogo ativado com 2 chaves!`);
  console.log(`📱 Total de diálogos ativos: ${dialogosAjuda.size}`);
  console.log(`📱📱📱 ======================================== FIM\n`);

  return { success: true, chave, chave9 };
};

// ⭐⭐⭐ EXPORTA MAPA DE DIÁLOGOS DE FOTO GLOBALMENTE ⭐⭐⭐
global.dialogosFoto = dialogosFoto;

// ⭐⭐⭐ EXPORTA FUNÇÃO PARA VERIFICAR DIÁLOGO DE FOTO ⭐⭐⭐
global.verificarDialogoFoto = function (clinicaId, telefone) {
  // Normaliza o telefone
  let telLimpo = telefone.replace(/\D/g, '');
  if (telLimpo.startsWith('55') && telLimpo.length > 11) {
    telLimpo = telLimpo.substring(2);
  }

  const chave = `${clinicaId}_${telLimpo}`;
  const dialogo = dialogosFoto.get(chave);

  if (dialogo && Date.now() - dialogo.timestamp < TEMPO_EXPIRACAO_IDENTIFICACAO) {
    console.log(`📸 [verificarDialogoFoto] Diálogo de foto ATIVO para ${chave}`);
    return dialogo;
  }

  // Tenta variações do telefone
  for (const [key, val] of dialogosFoto.entries()) {
    if (key.startsWith(clinicaId + '_') && val.telefone) {
      const telDialogo = val.telefone.replace(/\D/g, '');
      if (telLimpo.endsWith(telDialogo.slice(-9)) || telDialogo.endsWith(telLimpo.slice(-9))) {
        if (Date.now() - val.timestamp < TEMPO_EXPIRACAO_IDENTIFICACAO) {
          console.log(`📸 [verificarDialogoFoto] Diálogo de foto ATIVO (match parcial) para ${key}`);
          return val;
        }
      }
    }
  }

  return null;
};

// ⭐⭐⭐ EXPORTA FUNÇÃO PARA REMOVER DIÁLOGO DE FOTO ⭐⭐⭐
global.removerDialogoFoto = function (clinicaId, telefone) {
  let telLimpo = telefone.replace(/\D/g, '');
  if (telLimpo.startsWith('55') && telLimpo.length > 11) {
    telLimpo = telLimpo.substring(2);
  }
  const chave = `${clinicaId}_${telLimpo}`;
  dialogosFoto.delete(chave);
  console.log(`📸 [removerDialogoFoto] Diálogo removido para ${chave}`);
};

// ⭐ PROTEÇÃO CONTRA DUPLICATAS
const mensagensProcessadas = new Map();
const TEMPO_EXPIRACAO_DUPLICATA = 60000;

// ⭐ TEMPOS DE EXPIRAÇÃO
const TEMPO_EXPIRACAO_IDENTIFICACAO = 5 * 60 * 1000;
const TEMPO_EXPIRACAO_AJUDA = 5 * 60 * 1000;
const TEMPO_EXPIRACAO_MOTIVO = 10 * 60 * 1000;

// ⭐⭐⭐ v9.3: PADRÕES DE CONFIRMAÇÃO/CANCELAMENTO DE CONSULTA ⭐⭐⭐
const PADROES_CONFIRMACAO = ['SIM', 'S', '1', 'CONFIRMO', 'CONFIRMAR', 'CONFIRMADO', 'CONFIRMA', 'CONFIRMADA', 'OK', 'PODE', 'CERTO', 'VOU', 'ESTAREI', 'CLARO', 'COM CERTEZA', 'POSITIVO', 'ISSO', 'EXATO'];
const PADROES_CANCELAMENTO = ['NÃO', 'NAO', 'N', '2', 'CANCELAR', 'CANCELO', 'CANCELADO', 'CANCELA', 'DESMARCAR', 'DESISTO', 'NÃO VOU', 'NAO VOU', 'REMARCAR', 'NEGATIVO', 'NÃO POSSO', 'NAO POSSO', 'NÃO CONSIGO', 'NAO CONSIGO'];

// ⭐⭐⭐ FIX v10.9: MATCHING FUZZY DE CONFIRMAÇÃO/CANCELAMENTO ⭐⭐⭐
// Remove pontuação, acentos, espaços extras e faz matching parcial
// Isso captura: "sim!", "Sim, vou", "sim sim", "ok!", "pode ser", "tudo bem", etc.
function normalizarTextoParaMatching(texto) {
  return (texto || '').
  toUpperCase().
  normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
  .replace(/[^A-Z0-9\s]/g, '') // Remove pontuação
  .replace(/\s+/g, ' ') // Normaliza espaços
  .trim();
}

function matchConfirmacao(textoOriginal) {
  const textoUpper = textoOriginal.trim().toUpperCase();
  const textoNorm = normalizarTextoParaMatching(textoOriginal);

  // Match exato primeiro (mais rápido)
  if (PADROES_CONFIRMACAO.includes(textoUpper)) return true;

  // Match normalizado (sem acentos/pontuação)
  if (PADROES_CONFIRMACAO.includes(textoNorm)) return true;

  // Match parcial: se o texto CONTÉM algum padrão de confirmação
  // Ex: "sim, vou" contém "SIM", "ok, pode ser" contém "OK"
  const palavras = textoNorm.split(' ');
  for (const padrao of PADROES_CONFIRMACAO) {
    // Palavra isolada no texto
    if (palavras.includes(padrao)) return true;
    // ⭐⭐⭐ FIX v25.1: Só faz startsWith com espaço depois (palavra completa)
    // Bug potencial: 'S' matchava qualquer texto começando com 'S' (ex: "Sábado vou levar...")
    if (padrao.length > 1 && textoNorm.startsWith(padrao + ' ')) return true;
  }

  // Padrões adicionais comuns (frases completas)
  const frasesConfirmacao = [
  'PODE SER', 'TUDO BEM', 'COMBINADO', 'ESTAREI LA', 'ESTAREI AI',
  'VOU SIM', 'VOU ESTAR', 'PODE CONFIRMAR', 'TA BOM', 'TABOM',
  'BELEZA', 'BLZA', 'DE ACORDO', 'PERFEITO', 'OTIMO', 'SHOW',
  'COM CERTEZA', 'SIM SIM', 'SIIIM', 'SIIM', 'SS', 'SSS',
  'VOU COMPARECER', 'IREI', 'CONFIRMO SIM', 'OK CONFIRMADO',
  'CERTO ESTAREI', 'PODE CONFIRMA', 'CONFIRMA POR FAVOR',
  'TA CONFIRMADO', 'ESTA CONFIRMADO', 'JA CONFIRMEI',
  'VOU IR', 'EU VOU', 'IREI SIM', 'ESTAREI PRESENTE',
  'CONFIRMO PRESENCA', 'CONFIRMO PRESENÇA'];

  for (const frase of frasesConfirmacao) {
    if (textoNorm.includes(frase)) return true;
  }

  return false;
}

function matchCancelamento(textoOriginal) {
  const textoUpper = textoOriginal.trim().toUpperCase();
  const textoNorm = normalizarTextoParaMatching(textoOriginal);

  // Match exato primeiro
  if (PADROES_CANCELAMENTO.includes(textoUpper)) return true;

  // Match normalizado
  if (PADROES_CANCELAMENTO.includes(textoNorm)) return true;

  // Match parcial — apenas palavras completas
  const palavras = textoNorm.split(' ');
  for (const padrao of PADROES_CANCELAMENTO) {
    if (palavras.includes(padrao)) return true;
    // ⭐⭐⭐ FIX v25.0: Só faz startsWith com espaço depois (palavra completa)
    // Bug anterior: 'N' matchava "NO MESMO DIA..." porque startsWith('N') era true
    if (padrao.length > 1 && textoNorm.startsWith(padrao + ' ')) return true;
  }

  // Padrões adicionais comuns
  const frasesCancelamento = [
  'NAO VOU', 'NAO POSSO', 'NAO CONSIGO', 'NAO DA', 'NAO PODEREI',
  'NÃO VOU', 'NÃO POSSO', 'NÃO CONSIGO', 'NÃO DA', 'NÃO PODEREI',
  'QUERO CANCELAR', 'QUERO DESMARCAR', 'PRECISO CANCELAR',
  'PRECISO DESMARCAR', 'VOU CANCELAR', 'VOU DESMARCAR',
  'CANCELA POR FAVOR', 'DESMARCA POR FAVOR',
  'NAO IREI', 'NÃO IREI', 'DESISTO DA CONSULTA',
  'NAO VOU PODER', 'NÃO VOU PODER', 'INFELIZMENTE NAO',
  'INFELIZMENTE NÃO', 'NAO SERA POSSIVEL', 'NÃO SERÁ POSSÍVEL'];

  for (const frase of frasesCancelamento) {
    const fraseNorm = normalizarTextoParaMatching(frase);
    if (textoNorm.includes(fraseNorm)) return true;
  }

  return false;
}

// ⭐⭐⭐ v9.3: BUSCAR CONSULTA AGUARDANDO CONFIRMAÇÃO DO PACIENTE ⭐⭐⭐
async function buscarConsultaAguardandoConfirmacao(db, pacienteId) {
  // Busca consultas agendadas com lembrete enviado (aguardando resposta)
  // Prioriza a consulta mais próxima
  // ⭐⭐⭐ FIX v9.10: Também busca status 'aguardando_confirmacao' (não só 'agendada')
  // ⭐⭐⭐ FIX v10.9.3: REMOVIDO LEFT JOIN com usuarios (tabela consultas NÃO tem profissionalId!)
  // Usa c.profissional diretamente (campo TEXT que já contém o nome)
  const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const consulta = await new Promise((r) => db.get(
    `SELECT c.*, c.profissional as profissionalNome FROM consultas c
     WHERE c.pacienteId = ? 
       AND c.data >= ? 
       AND (c.status = 'agendada' OR c.status = 'aguardando_confirmacao')
       AND c.lembreteEnviado = 1
       AND c.confirmacaoRecebidaEm IS NULL
     ORDER BY c.data ASC, c.horario ASC 
     LIMIT 1`,
    [pacienteId, hoje],
    (err, row) => {
      if (err) {
        console.log(`📅 [buscarConsultaAguardandoConfirmacao] Erro: ${err.message}`);
        r(null);
      } else {
        r(row);
      }
    }
  ));

  return consulta;
}

// ⭐⭐⭐ FUNÇÃO PARA GARANTIR TABELA DE SOLICITAÇÕES ⭐⭐⭐
async function garantirTabelaSolicitacoes(db) {
  return new Promise((resolve) => {
    // MySQL: Cria tabela se não existir (sem verificar sqlite_master)
    db.run(`
      CREATE TABLE IF NOT EXISTS solicitacoes_pendentes (
        id VARCHAR(191) PRIMARY KEY,
        clinicaId VARCHAR(191) NOT NULL,
        pacienteId VARCHAR(191) NOT NULL,
        pacienteNome VARCHAR(255),
        telefone VARCHAR(50) NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        categoria VARCHAR(50) DEFAULT 'outros',
        especialidade VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'pendente',
        criadoEm VARCHAR(50) NOT NULL,
        expiraEm VARCHAR(50) NOT NULL,
        recebidoEm VARCHAR(50),
        arquivoUrl TEXT
      )
    `, () => {
      // Migração: adiciona coluna especialidade se não existir
      db.run('ALTER TABLE solicitacoes_pendentes ADD COLUMN especialidade VARCHAR(255)', () => resolve());
    });
  });
}

// ⭐⭐⭐ CRIAR SOLICITAÇÃO PENDENTE (CORRIGIDO v6.0) ⭐⭐⭐
async function criarSolicitacao(clinicaId, pacienteId, pacienteNome, telefone, tipo, categoria = 'outros', especialidade = null) {
  const db = getClinicaDB(clinicaId);
  await garantirTabelaSolicitacoes(db);

  const telNormalizado = telefone.replace(/\D/g, '');
  const id = `sol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const criadoEm = new Date().toISOString();
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  console.log(`\n🆕🆕🆕 [criarSolicitacao v6.0] ========================================`);
  console.log(`🆕 Tipo solicitado: ${tipo}`);
  console.log(`🆕 Categoria: ${categoria}`);
  console.log(`🆕 Paciente: ${pacienteNome} (${pacienteId})`);
  console.log(`🆕 Telefone: ${telNormalizado}`);

  // ⭐⭐⭐ v6.0: LIMPA DIÁLOGOS EM MEMÓRIA ao criar nova solicitação ⭐⭐⭐
  // Se a nova solicitação NÃO é foto, remove qualquer diálogo de foto pendente
  // Isso evita que um diálogo de foto antigo interfira com solicitações de documento
  let telLimpoParaChave = telNormalizado;
  if (telLimpoParaChave.startsWith('55') && telLimpoParaChave.length > 11) {
    telLimpoParaChave = telLimpoParaChave.substring(2);
  }
  const chaveDialogo = `${clinicaId}_${telLimpoParaChave}`;

  if (tipo !== 'foto' && categoria !== 'foto') {
    // Nova solicitação NÃO é foto → limpa diálogo de foto antigo
    if (dialogosFoto.has(chaveDialogo)) {
      dialogosFoto.delete(chaveDialogo);
      console.log(`🆕 🧹 Diálogo de foto em memória REMOVIDO (nova solicitação é ${tipo}/${categoria})`);
    }
    // Tenta variações da chave
    for (const [key, val] of dialogosFoto.entries()) {
      if (key.startsWith(clinicaId + '_')) {
        const telDialogo = val.telefone?.replace(/\D/g, '') || '';
        if (telLimpoParaChave.endsWith(telDialogo.slice(-9)) || telDialogo.endsWith(telLimpoParaChave.slice(-9))) {
          dialogosFoto.delete(key);
          console.log(`🆕 🧹 Diálogo de foto em memória REMOVIDO (match parcial: ${key})`);
        }
      }
    }
  }

  // Se a nova solicitação É foto, limpa diálogos de foto antigos e recria
  if (tipo === 'foto' || categoria === 'foto') {
    if (dialogosFoto.has(chaveDialogo)) {
      console.log(`🆕 🔄 Atualizando diálogo de foto em memória`);
    }
    dialogosFoto.set(chaveDialogo, {
      clinicaId,
      pacienteId,
      pacienteNome: pacienteNome || 'Paciente',
      telefone: telLimpoParaChave,
      timestamp: Date.now()
    });
  }

  // ⭐⭐⭐ PASSO 1: Lista todas as solicitações pendentes ANTES de cancelar
  const pendentesAntes = await new Promise((r) => db.all(
    `SELECT id, tipo, categoria, especialidade, pacienteNome, telefone FROM solicitacoes_pendentes WHERE status = 'pendente'`,
    [], (err, rows) => r(rows || [])
  ));

  // ⭐ PRESERVA A CLASSIFICAÇÃO FEITA NA CLÍNICA
  // Quando o paciente aciona o menu genérico ("enviar documento"), esta função
  // é chamada sem categoria/especialidade e cancelaria a solicitação criada na
  // clínica — fazendo o arquivo cair em "Outros". Herdamos a classificação da
  // solicitação de documento que está sendo substituída.
  let categoriaFinal = categoria;
  let especialidadeFinal = especialidade;
  if (tipo !== 'foto' && categoria !== 'foto') {
    const ultimos9Heranca = telNormalizado.slice(-9);
    const anteriorDocumento = pendentesAntes.find(
      (s) =>
      s.tipo !== 'foto' &&
      s.categoria !== 'foto' &&
      String(s.telefone || '').replace(/\D/g, '').endsWith(ultimos9Heranca)
    );
    if (anteriorDocumento) {
      if ((!categoriaFinal || categoriaFinal === 'outros') && anteriorDocumento.categoria) {
        categoriaFinal = anteriorDocumento.categoria;
      }
      if (!especialidadeFinal && anteriorDocumento.especialidade) {
        especialidadeFinal = anteriorDocumento.especialidade;
      }
      console.log(`🆕 ♻️ Classificação herdada da solicitação anterior: ${categoriaFinal} / ${especialidadeFinal || 'sem especialidade'}`);
    }
  }

  console.log(`🆕 Solicitações pendentes ANTES: ${pendentesAntes.length}`);
  pendentesAntes.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.tipo} (${s.categoria}) - ${s.pacienteNome} - Tel: ${s.telefone}`);
  });

  // ⭐⭐⭐ PASSO 2: Cancela TODAS as solicitações pendentes (por pacienteId)
  const canceladasPorPaciente = await new Promise((r) => {
    db.run(
      `UPDATE solicitacoes_pendentes SET status = 'cancelado' WHERE pacienteId = ? AND status = 'pendente'`,
      [pacienteId],
      function () {r(this.changes);}
    );
  });

  if (canceladasPorPaciente > 0) {
    console.log(`🗑️ ${canceladasPorPaciente} solicitação(ões) cancelada(s) por pacienteId`);
  }

  // ⭐⭐⭐ PASSO 3: Cancela TODAS as solicitações pendentes (por telefone)
  const canceladasPorTelefone = await new Promise((r) => {
    db.run(
      `UPDATE solicitacoes_pendentes SET status = 'cancelado' WHERE telefone = ? AND status = 'pendente'`,
      [telNormalizado],
      function () {r(this.changes);}
    );
  });

  if (canceladasPorTelefone > 0) {
    console.log(`🗑️ ${canceladasPorTelefone} solicitação(ões) cancelada(s) por telefone`);
  }

  // ⭐⭐⭐ v6.0: TAMBÉM cancela por variações de telefone (com/sem 55) ⭐⭐⭐
  const telCom55 = telNormalizado.startsWith('55') ? telNormalizado : '55' + telNormalizado;
  const telSem55 = telNormalizado.startsWith('55') ? telNormalizado.substring(2) : telNormalizado;
  const ultimos9 = telNormalizado.slice(-9);

  const canceladasVariacoes = await new Promise((r) => {
    db.run(
      `UPDATE solicitacoes_pendentes SET status = 'cancelado' 
       WHERE status = 'pendente' AND (telefone = ? OR telefone = ? OR telefone LIKE ?)`,
      [telCom55, telSem55, `%${ultimos9}`],
      function () {r(this.changes);}
    );
  });

  if (canceladasVariacoes > 0) {
    console.log(`🗑️ ${canceladasVariacoes} solicitação(ões) cancelada(s) por variações de telefone`);
  }

  // ⭐⭐⭐ PASSO 4: Verifica se realmente cancelou tudo
  const pendentesDepois = await new Promise((r) => db.all(
    `SELECT id, tipo, categoria, pacienteNome, telefone FROM solicitacoes_pendentes WHERE status = 'pendente'`,
    [], (err, rows) => r(rows || [])
  ));

  console.log(`🆕 Solicitações pendentes DEPOIS de cancelar: ${pendentesDepois.length}`);
  if (pendentesDepois.length > 0) {
    console.log(`⚠️ Ainda há solicitações pendentes!`);
    pendentesDepois.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.tipo} (${s.categoria}) - ${s.pacienteNome} - Tel: ${s.telefone}`);
    });
  }

  // ⭐⭐⭐ PASSO 5: Cria a nova solicitação
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO solicitacoes_pendentes (id, clinicaId, pacienteId, pacienteNome, telefone, tipo, categoria, especialidade, status, criadoEm, expiraEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`,
      [id, clinicaId, pacienteId, pacienteNome, telNormalizado, tipo, categoriaFinal, especialidadeFinal || null, criadoEm, expiraEm],
      (err) => {
        if (err) {
          console.log(`🆕 ❌ Erro ao criar: ${err.message}`);
          reject(err);
        } else {
          console.log(`🆕 ✅ SOLICITAÇÃO CRIADA COM SUCESSO!`);
          console.log(`   ID: ${id}`);
          console.log(`   Tipo: ${tipo}`);
          console.log(`   Categoria: ${categoriaFinal}`);
          console.log(`   Especialidade: ${especialidadeFinal || '(não definida)'}`);
          resolve(id);
        }
      }
    );
  });

  // ⭐⭐⭐ PASSO 6: Verifica se a solicitação foi criada corretamente
  const solicitacaoCriada = await new Promise((r) => db.get(
    `SELECT * FROM solicitacoes_pendentes WHERE id = ?`,
    [id], (err, row) => r(row)
  ));

  if (solicitacaoCriada) {
    console.log(`🆕 ✅ Verificação: Solicitação ${id} existe no banco`);
    console.log(`   Tipo no banco: ${solicitacaoCriada.tipo}`);
    console.log(`   Categoria no banco: ${solicitacaoCriada.categoria}`);
  } else {
    console.log(`🆕 ❌ ERRO: Solicitação ${id} NÃO foi encontrada no banco!`);
  }

  console.log(`🆕🆕🆕 ======================================== FIM\n`);

  return id;
}

// ⭐⭐⭐ BUSCAR SOLICITAÇÕES PENDENTES (CORRIGIDO v3.5) ⭐⭐⭐
async function buscarSolicitacaoPendente(clinicaId, telefone) {
  const db = getClinicaDB(clinicaId);
  await garantirTabelaSolicitacoes(db);

  // ⭐⭐⭐ NORMALIZA O TELEFONE
  let telNormalizado = telefone.replace(/\D/g, '');
  if (!telNormalizado.startsWith('55') && telNormalizado.length <= 11) {
    telNormalizado = '55' + telNormalizado;
  }
  const ultimos9 = telNormalizado.slice(-9);
  const agora = new Date().toISOString();

  console.log(`\n🔎 [buscarSolicitacaoPendente v3.5] ========================================`);
  console.log(`🔎 Telefone original: ${telefone}`);
  console.log(`🔎 Telefone normalizado: ${telNormalizado}`);
  console.log(`🔎 Últimos 9 dígitos: ${ultimos9}`);
  console.log(`🔎 ClinicaId: ${clinicaId}`);

  // Expira solicitações antigas
  const expiradas = await new Promise((r) => {
    db.run(
      `UPDATE solicitacoes_pendentes SET status = 'expirado' WHERE status = 'pendente' AND expiraEm < ?`,
      [agora],
      function () {r(this.changes);}
    );
  });

  if (expiradas > 0) {
    console.log(`🔎 ${expiradas} solicitação(ões) expirada(s)`);
  }

  // ⭐ Lista TODAS as solicitações pendentes para debug
  const todasPendentes = await new Promise((r) => db.all(
    `SELECT id, tipo, categoria, pacienteNome, telefone, criadoEm FROM solicitacoes_pendentes 
     WHERE status = 'pendente' ORDER BY criadoEm DESC`,
    [],
    (err, rows) => r(rows || [])
  ));

  console.log(`🔎 Total de solicitações pendentes no banco: ${todasPendentes.length}`);
  if (todasPendentes.length > 0) {
    todasPendentes.forEach((s, i) => {
      console.log(`   ${i + 1}. [${s.id}] ${s.tipo}${s.categoria !== 'outros' ? ` (${s.categoria})` : ''} - ${s.pacienteNome} - Tel: ${s.telefone}`);
    });
  }

  // ⭐⭐⭐ BUSCA com múltiplas variações de telefone
  const solicitacao = await new Promise((r) => db.get(
    `SELECT * FROM solicitacoes_pendentes 
     WHERE (
       telefone LIKE ? OR 
       telefone LIKE ? OR 
       telefone = ? OR
       telefone = ?
     ) AND status = 'pendente' AND expiraEm > ?
     ORDER BY criadoEm DESC LIMIT 1`,
    [`%${ultimos9}`, `%${ultimos9}%`, telNormalizado, telefone.replace(/\D/g, ''), agora],
    (err, row) => {
      if (err) console.log(`🔎 ❌ Erro na busca: ${err.message}`);
      r(row);
    }
  ));

  if (solicitacao) {
    console.log(`🔎 ✅ SOLICITAÇÃO ENCONTRADA:`);
    console.log(`   ID: ${solicitacao.id}`);
    console.log(`   Tipo: ${solicitacao.tipo}`);
    console.log(`   Categoria: ${solicitacao.categoria}`);
    console.log(`   Paciente: ${solicitacao.pacienteNome} (${solicitacao.pacienteId})`);
    console.log(`   Telefone no banco: ${solicitacao.telefone}`);
    console.log(`   Criada em: ${solicitacao.criadoEm}`);
  } else {
    console.log(`🔎 ❌ Nenhuma solicitação pendente encontrada para este telefone`);
  }

  console.log(`🔎 ========================================\n`);

  return solicitacao;
}

// ⭐⭐⭐ FIX v16.0: BUSCAR SOLICITAÇÃO PENDENTE POR PACIENTE ID ⭐⭐⭐
// Fallback robusto para quando o matching por telefone falha (ex: LID não resolvido)
async function buscarSolicitacaoPendentePorPacienteId(clinicaId, pacienteId) {
  if (!clinicaId || !pacienteId || pacienteId === 'desconhecido' || pacienteId.startsWith('tel_')) return null;

  const db = getClinicaDB(clinicaId);
  await garantirTabelaSolicitacoes(db);

  const agora = new Date().toISOString();

  console.log(`\n🔎 [buscarSolicitacaoPendentePorPacienteId v16.0] ========================================`);
  console.log(`🔎 PacienteId: ${pacienteId}`);
  console.log(`🔎 ClinicaId: ${clinicaId}`);

  const solicitacao = await new Promise((r) => db.get(
    `SELECT * FROM solicitacoes_pendentes 
     WHERE pacienteId = ? AND status = 'pendente' AND expiraEm > ?
     ORDER BY criadoEm DESC LIMIT 1`,
    [pacienteId, agora],
    (err, row) => {
      if (err) console.log(`🔎 ❌ Erro na busca por pacienteId: ${err.message}`);
      r(row || null);
    }
  ));

  if (solicitacao) {
    console.log(`🔎 ✅ SOLICITAÇÃO ENCONTRADA VIA PACIENTE ID:`);
    console.log(`   ID: ${solicitacao.id}`);
    console.log(`   Tipo: ${solicitacao.tipo}`);
    console.log(`   Categoria: ${solicitacao.categoria}`);
    console.log(`   Paciente: ${solicitacao.pacienteNome} (${solicitacao.pacienteId})`);
  } else {
    console.log(`🔎 ❌ Nenhuma solicitação pendente para pacienteId ${pacienteId}`);
  }

  console.log(`🔎 ========================================\n`);
  return solicitacao;
}

// ⭐ RECUPERA A ÚLTIMA CLASSIFICAÇÃO PEDIDA PARA DOCUMENTOS DESTE PACIENTE
// Usada nos caminhos de fallback: mesmo quando a solicitação não é localizada
// como "pendente", o arquivo deve ser arquivado na especialidade/categoria que
// a clínica pediu — nunca em "Outros" por padrão.
async function buscarUltimaClassificacaoDocumento(clinicaId, pacienteId, telefone) {
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaSolicitacoes(db);

    const telNormalizado = String(telefone || '').replace(/\D/g, '');
    const ultimos9 = telNormalizado.slice(-9);

    const row = await new Promise((r) => db.get(
      `SELECT categoria, especialidade FROM solicitacoes_pendentes
       WHERE tipo != 'foto' AND categoria != 'foto'
         AND (pacienteId = ? OR (? != '' AND telefone LIKE ?))
       ORDER BY criadoEm DESC LIMIT 1`,
      [pacienteId || '', ultimos9, `%${ultimos9}`],
      (err, found) => r(err ? null : found || null)
    ));

    if (row) {
      console.log(`♻️ [classificação recuperada] categoria: ${row.categoria}, especialidade: ${row.especialidade || '(não definida)'}`);
    }
    return row || null;
  } catch (e) {
    console.log(`♻️ ⚠️ Erro ao recuperar classificação: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ MARCAR SOLICITACAO COMO RECEBIDA ⭐⭐⭐
async function marcarSolicitacaoRecebida(clinicaId, solicitacaoId, arquivoUrl) {
  const db = getClinicaDB(clinicaId);
  await new Promise((r) => db.run(
    `UPDATE solicitacoes_pendentes SET status = 'recebido', recebidoEm = ?, arquivoUrl = ? WHERE id = ?`,
    [new Date().toISOString(), arquivoUrl, solicitacaoId], () => r()
  ));
  console.log(`✅ Solicitação ${solicitacaoId} marcada como recebida`);
}

// ⭐⭐⭐ CANCELAR SOLICITAÇÃO ⭐⭐⭐
async function cancelarSolicitacao(clinicaId, solicitacaoId) {
  const db = getClinicaDB(clinicaId);
  await new Promise((r) => db.run(
    `UPDATE solicitacoes_pendentes SET status = 'cancelado' WHERE id = ?`,
    [solicitacaoId], () => r()
  ));
}

// ⭐⭐⭐ FUNÇÃO PARA BUSCAR API KEY DE CLÍNICA ⭐⭐⭐
async function getApiKeyForClinica(clinicaId) {
  const db = getClinicaDB(clinicaId);
  return new Promise((r) => db.get('SELECT apiKey FROM whatsapp_config WHERE clinicaId = ?', [clinicaId], (e, row) => r(row?.apiKey || '')));
}

// ⭐⭐⭐ FUNÇÃO BUSCAR CLÍNICA POR SESSION ⭐⭐⭐
// ⭐⭐⭐ FIX v10.2: Cache de sessão + sem ALTER TABLE em cada chamada ⭐⭐⭐
const sessionClinicaCache = new Map(); // sessionId → { clinicaId, config, timestamp }
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function buscarClinicaPorSession(sessionId) {
  // ⭐ Verifica cache primeiro
  const cached = sessionClinicaCache.get(sessionId);
  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL) {
    console.log(`📩 [buscarClinicaPorSession] ✅ Cache hit para sessão "${sessionId}" → clínica ${cached.clinicaId}`);
    return { clinicaId: cached.clinicaId, config: cached.config };
  }

  console.log(`📩 [buscarClinicaPorSession] Buscando clínica para sessão "${sessionId}"...`);

  const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();
  console.log(`📩 [buscarClinicaPorSession] Total de clínicas no sistema: ${clinicas.length}`);

  let fallbackClinica = null; // Se só tem 1 clínica, usa como fallback

  for (const c of clinicas) {
    try {
      const db = getClinicaDB(c.id);

      // ⭐⭐⭐ FIX v10.2: Migração de apiKey apenas uma vez (com flag) ⭐⭐⭐
      if (!buscarClinicaPorSession._migratedApiKey) {
        buscarClinicaPorSession._migratedApiKey = new Set();
      }
      if (!buscarClinicaPorSession._migratedApiKey.has(c.id)) {
        await new Promise((r) => db.run(`ALTER TABLE whatsapp_config ADD COLUMN apiKey TEXT DEFAULT ''`, () => r()));
        buscarClinicaPorSession._migratedApiKey.add(c.id);
      }

      const cfg = await new Promise((r) => db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [c.id], (e, row) => r(row)));

      if (cfg) {
        // Guarda como fallback se só tem 1 clínica
        if (clinicas.length === 1) {
          fallbackClinica = { clinicaId: c.id, config: cfg };
        }

        if (cfg.sessionName === sessionId) {
          console.log(`📩 [buscarClinicaPorSession] ✅ Clínica encontrada: ${c.id} (sessionName: ${cfg.sessionName})`);
          // Salva no cache
          sessionClinicaCache.set(sessionId, { clinicaId: c.id, config: cfg, timestamp: Date.now() });
          return { clinicaId: c.id, config: cfg };
        }
      }
    } catch (e) {
      console.log(`📩 [buscarClinicaPorSession] ⚠️ Erro ao verificar clínica ${c.id}: ${e.message}`);
    }
  }

  // ⭐⭐⭐ FIX v10.2: Se só tem 1 clínica e não encontrou por sessionName, usa como fallback ⭐⭐⭐
  if (fallbackClinica) {
    console.log(`📩 [buscarClinicaPorSession] ⚠️ Sessão "${sessionId}" não encontrada, mas só existe 1 clínica → usando fallback: ${fallbackClinica.clinicaId}`);
    console.log(`📩 [buscarClinicaPorSession] ⚠️ SessionName no banco: "${fallbackClinica.config.sessionName}" ≠ "${sessionId}" do WAHA`);
    console.log(`📩 [buscarClinicaPorSession] 💡 DICA: Atualize o sessionName nas Configurações para "${sessionId}"`);
    // Salva no cache com o sessionId do WAHA
    sessionClinicaCache.set(sessionId, { clinicaId: fallbackClinica.clinicaId, config: fallbackClinica.config, timestamp: Date.now() });
    return fallbackClinica;
  }

  console.log(`📩 [buscarClinicaPorSession] ❌ Nenhuma clínica encontrada para sessão "${sessionId}"`);
  console.log(`📩 [buscarClinicaPorSession] 💡 Sessões configuradas no sistema:`);
  for (const c of clinicas) {
    try {
      const db = getClinicaDB(c.id);
      const cfg = await new Promise((r) => db.get('SELECT sessionName, serverUrl FROM whatsapp_config WHERE clinicaId = ?', [c.id], (e, row) => r(row)));
      if (cfg) {
        console.log(`   - Clínica ${c.id}: sessionName="${cfg.sessionName}" serverUrl="${cfg.serverUrl}"`);
      } else {
        console.log(`   - Clínica ${c.id}: SEM configuração WhatsApp`);
      }
    } catch (e) {/* ignore */}
  }

  return null;
}

// ⭐⭐⭐ FIX v22.0: Buscar clínica pelo chatId do paciente (lógica correta) ⭐⭐⭐
// Uma sessão pode servir várias clínicas. O correto é achar o paciente pelo chatId,
// e o banco onde ele está É a clínica.
async function buscarClinicaPorChatId(chatId) {
  if (!chatId) return null;
  try {
    const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();
    for (const c of clinicas) {
      try {
        const db = getClinicaDB(c.id);
        // Busca paciente com este whatsappChatId
        const paciente = await new Promise((r) => db.get(
          `SELECT id, nome FROM pacientes WHERE whatsappChatId = ? LIMIT 1`,
          [chatId],
          (err, row) => r(err ? null : row)
        ));
        if (paciente) {
          // Encontrou! Busca config do WhatsApp desta clínica
          const cfg = await new Promise((r) => db.get(
            'SELECT * FROM whatsapp_config WHERE clinicaId = ?',
            [c.id],
            (e, row) => r(row)
          ));
          if (cfg) {
            console.log(`📩 [buscarClinicaPorChatId] ✅ chatId ${chatId} → paciente ${paciente.id} (${paciente.nome}) → clínica ${c.id}`);
            // Atualiza cache de sessão para acelerar próximas buscas
            if (cfg.sessionName) {
              sessionClinicaCache.set(cfg.sessionName, { clinicaId: c.id, config: cfg, timestamp: Date.now() });
            }
            return { clinicaId: c.id, config: cfg, pacienteId: paciente.id, pacienteNome: paciente.nome };
          }
        }
      } catch (e) {
















        // Ignora erros de clínicas individuais (coluna pode não existir ainda)
      }}console.log(`📩 [buscarClinicaPorChatId] ❌ Nenhum paciente encontrado com chatId ${chatId}`);return null;} catch (e) {console.error(`❌ [buscarClinicaPorChatId] Erro: ${e.message}`);return null;}} // ⭐⭐⭐ FIX v16.4: Buscar TODAS as clínicas que compartilham a mesma sessão WhatsApp ⭐⭐⭐
async function buscarTodasClinicasPorSession(sessionId) {const resultado = [];try {const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();for (const c of clinicas) {try {const db = getClinicaDB(c.id);
        const cfg = await new Promise((r) => db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [c.id], (e, row) => r(row)));
        if (cfg && cfg.sessionName === sessionId) {
          resultado.push({ clinicaId: c.id, config: cfg });
        }
      } catch (e) {/* ignore */}
    }
  } catch (e) {
    console.error(`❌ [buscarTodasClinicasPorSession] Erro: ${e.message}`);
  }
  return resultado;
}

// ⭐⭐⭐ FIX v10.2: Limpa cache quando config é atualizada ⭐⭐⭐
global.limparCacheSessionClinica = function () {
  sessionClinicaCache.clear();
  console.log('🧹 [buscarClinicaPorSession] Cache de sessão limpo');
};

// ⭐⭐⭐ NOVO v10.3: Buscar paciente pelo chatId do WhatsApp (busca DIRETA e RÁPIDA) ⭐⭐⭐
async function buscarPacientePorWhatsAppChatId(clinicaId, chatId) {
  if (!clinicaId || !chatId) return null;
  try {
    const db = getClinicaDB(clinicaId);

    // Migração: adiciona coluna whatsappChatId se não existir
    await new Promise((r) => db.run(`ALTER TABLE pacientes ADD COLUMN whatsappChatId TEXT`, () => r()));

    const row = await new Promise((r) => db.get(
      `SELECT id, nome, telefone, celular, whatsappChatId FROM pacientes WHERE whatsappChatId = ? LIMIT 1`,
      [chatId],
      (err, row) => r(row || null)
    ));

    if (row) {
      console.log(`📩 [buscarPacientePorWhatsAppChatId] ✅ Paciente encontrado via chatId: ${row.nome} (${row.id})`);
    }
    return row;
  } catch (e) {
    console.error(`❌ [buscarPacientePorWhatsAppChatId] Erro: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ NOVO v10.3: Salvar chatId do WhatsApp no paciente (para buscas futuras) ⭐⭐⭐
async function salvarWhatsAppChatId(clinicaId, pacienteId, chatId) {
  if (!clinicaId || !pacienteId || !chatId) return false;
  // Não salva para pacientes não identificados
  if (pacienteId === 'desconhecido' || pacienteId.startsWith('tel_')) return false;

  try {
    const db = getClinicaDB(clinicaId);

    // Migração: adiciona coluna whatsappChatId se não existir
    await new Promise((r) => db.run(`ALTER TABLE pacientes ADD COLUMN whatsappChatId TEXT`, () => r()));

    await new Promise((r) => db.run(
      `UPDATE pacientes SET whatsappChatId = ? WHERE id = ? AND (whatsappChatId IS NULL OR whatsappChatId = '' OR whatsappChatId != ?)`,
      [chatId, pacienteId, chatId],
      function (err) {
        if (err) {
          console.log(`❌ [salvarWhatsAppChatId] Erro: ${err.message}`);
        } else if (this.changes > 0) {
          console.log(`📩 [salvarWhatsAppChatId] ✅ chatId "${chatId}" salvo para paciente ${pacienteId}`);
        }
        r();
      }
    ));
    return true;
  } catch (e) {
    console.error(`❌ [salvarWhatsAppChatId] Erro: ${e.message}`);
    return false;
  }
}

// Limpa diálogos expirados
setInterval(() => {
  const agora = Date.now();
  for (const [id, timestamp] of mensagensProcessadas.entries()) {
    if (agora - timestamp > TEMPO_EXPIRACAO_DUPLICATA) mensagensProcessadas.delete(id);
  }
  for (const [chave, dados] of pacientesIdentificados.entries()) {
    if (agora - dados.timestamp > 1800000) pacientesIdentificados.delete(chave);
  }
  for (const [chave, dados] of midiasPendentes.entries()) {
    if (agora - dados.timestamp > TEMPO_EXPIRACAO_IDENTIFICACAO) midiasPendentes.delete(chave);
  }
  for (const [chave, dados] of conversasAguardandoMotivo.entries()) {
    if (dados.timestamp && agora - dados.timestamp > TEMPO_EXPIRACAO_MOTIVO) conversasAguardandoMotivo.delete(chave);
  }
  for (const [chave, dados] of dialogosAjuda.entries()) {
    if (dados.timestamp && agora - dados.timestamp > TEMPO_EXPIRACAO_AJUDA) dialogosAjuda.delete(chave);
  }
  for (const [chave, dados] of dialogosIdentificacao.entries()) {
    if (dados.timestamp && agora - dados.timestamp > TEMPO_EXPIRACAO_IDENTIFICACAO) {
      dialogosIdentificacao.delete(chave);
      midiasPendentes.delete(chave);
    }
  }
  // ⭐⭐⭐ NOVO: Limpa diálogos de foto expirados (5 minutos) ⭐⭐⭐
  for (const [chave, dados] of dialogosFoto.entries()) {
    if (dados.timestamp && agora - dados.timestamp > TEMPO_EXPIRACAO_IDENTIFICACAO) {
      dialogosFoto.delete(chave);
    }
  }
  // ⭐⭐⭐ NOVO: Limpa cache de LID após 24h ⭐⭐⭐
  // LID cache não tem timestamp, mantém por 24h (limpa tudo a cada 24h)
  if (lidCache.size > 1000) {
    console.log(`🧹 Limpando cache de LID (${lidCache.size} entradas)`);
    lidCache.clear();
  }
}, 30000);

function formatarData(d) {
  if (!d) return 'N/A';
  try {
    // ⭐⭐⭐ FIX v10.9.4: Limpa data com hora antes de formatar ⭐⭐⭐
    // "2026-03-13 00:00:00" → "2026-03-13" → "13/03/2026"
    // "2026-03-13T00:00:00" → "2026-03-13" → "13/03/2026"
    let dataLimpa = d.toString().trim();
    if (dataLimpa.includes(' ')) dataLimpa = dataLimpa.split(' ')[0];
    if (dataLimpa.includes('T')) dataLimpa = dataLimpa.split('T')[0];
    const [a, m, dia] = dataLimpa.split('-');
    if (!a || !m || !dia) return d;
    return `${dia}/${m}/${a}`;
  } catch (e) {return d;}
}

function isMensagemDoBot(texto) {
  if (!texto) return false;
  const textoUpper = texto.toUpperCase();
  const padroesBot = [
  '✅ CONFIRMADA', '✅ FOTO DE PERFIL', '✅ DOCUMENTO RECEBIDO', '❌ NÃO CONSEGUI',
  '📷 AGUARDANDO', '📄 ENVIAR DOCUMENTO', '📝 INFORME O MOTIVO', '👋 OBRIGADO',
  '📋 SEM CONSULTAS', 'COMO POSSO AJUDAR', 'SOLICITAÇÃO DE DOCUMENTO',
  'ENVIE UMA FOTO', 'DOCUMENTO SERÁ SALVO', 'DIGITE *0*', 'DIGITE OUTRO NÚMERO', 'RECEBI SUA MÍDIA',
  // Prontuário e Prescrição enviados pela clínica
  '📋 *PRONTUÁRIO', 'PRONTUÁRIO -', '📝 *PRESCRIÇÃO', 'PRESCRIÇÃO MÉDICA',
  'DOCUMENTO GERADO PELO SISTEMA', 'SISTEMA EASYCLIN', '👨‍⚕️ *PROFISSIONAL',
  '🩺 *QUEIXA PRINCIPAL', '🎯 *DIAGNÓSTICO', '💊 *TRATAMENTO', '💊 *MEDICAMENTOS'];

  return padroesBot.some((padrao) => textoUpper.includes(padrao));
}

async function salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, tipo, conteudo, status = 'enviada', chatId = null, consultaId = null) {
  if (!clinicaId || !tipo || !conteudo) return null;
  try {
    const db = getClinicaDB(clinicaId);
    // ⭐⭐⭐ FIX v10.0: Tabela mensagens com campo chatId ⭐⭐⭐
    // ⭐⭐⭐ FIX v18.0: Adicionado campo consultaId ⭐⭐⭐
    await new Promise((r) => db.run(`CREATE TABLE IF NOT EXISTS mensagens (
      id VARCHAR(191) PRIMARY KEY, clinicaId VARCHAR(191), chatId VARCHAR(191), consultaId VARCHAR(191),
      pacienteId VARCHAR(191), pacienteNome VARCHAR(255),
      tipo VARCHAR(50), conteudo LONGTEXT, dataHora VARCHAR(50), status VARCHAR(50), erro TEXT, criadoEm VARCHAR(50),
      INDEX idx_mensagens_clinica (clinicaId),
      INDEX idx_mensagens_paciente (pacienteId)
    )`, () => r()));

    // ⭐ Migração: adiciona colunas se não existirem
    await new Promise((r) => db.run(`ALTER TABLE mensagens ADD COLUMN chatId TEXT`, () => r()));
    await new Promise((r) => db.run(`ALTER TABLE mensagens ADD COLUMN fechadoEm TEXT`, () => r()));
    // ⭐⭐⭐ FIX v18.0: Migração - adiciona coluna consultaId ⭐⭐⭐
    await new Promise((r) => db.run(`ALTER TABLE mensagens ADD COLUMN consultaId TEXT`, () => r()));

    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // ⭐⭐⭐ FIX v10.6: Só marca como 'pendente' mensagens que REALMENTE esperam resposta ⭐⭐⭐
    // Mensagens de confirmação (contêm opções 1/2), menus (contêm opções numéricas),
    // e solicitações de foto/documento esperam resposta do paciente.
    // Todas as outras (respostas do bot, orientações, etc.) ficam como 'enviada'.
    let statusFinal = status;
    if (tipo === 'enviada') {
      const conteudoUpper = (conteudo || '').toUpperCase();
      const esperaResposta =
      conteudoUpper.includes('RESPONDA COM O NÚMERO') ||
      conteudoUpper.includes('DIGITE O NÚMERO') ||
      conteudoUpper.includes('DIGITE OUTRO NÚMERO') ||
      conteudoUpper.includes('COMO POSSO AJUDAR') ||
      conteudoUpper.includes('ENVIE UMA FOTO') ||
      conteudoUpper.includes('ENVIE O DOCUMENTO') ||
      conteudoUpper.includes('INFORME O MOTIVO') ||
      conteudoUpper.includes('CONFIRME SUA PRESENÇA') ||
      // ⭐⭐⭐ FIX v10.9.2: Lembretes de consulta TAMBÉM esperam resposta! ⭐⭐⭐
      conteudoUpper.includes('LEMBRAMOS QUE VOCÊ TEM') ||
      conteudoUpper.includes('LEMBRETE DE CONSULTA') ||
      conteudoUpper.includes('CONFIRMAR SUA PRESENÇA') ||
      conteudoUpper.includes('CONSULTA AGENDADA PARA') ||
      conteudoUpper.includes('RESPONDA *SIM*') ||
      conteudoUpper.includes('RESPONDA SIM') ||
      conteudoUpper.includes('DIGITE *SIM*') ||
      conteudoUpper.includes('DIGITE SIM') ||
      // ⭐⭐⭐ FIX v11.4: Re-prompts com formato 1/2 também esperam resposta ⭐⭐⭐
      conteudoUpper.includes('CONFIRMAR') && conteudoUpper.includes('CANCELAR') && conteudoUpper.includes('PRESENÇA') ||
      // ⭐⭐⭐ FIX v10.9.2: Re-prompts de confirmação também esperam resposta ⭐⭐⭐
      conteudoUpper.includes('CONSULTA PENDENTE DE CONFIRMAÇÃO') && (conteudoUpper.includes('SIM') || conteudoUpper.includes('CONFIRMAR')) ||
      conteudoUpper.includes('✅ *SIM*') && conteudoUpper.includes('❌ *NÃO*');

      // ⭐⭐⭐ FIX v21.0: Se consultaId foi passado, SEMPRE marca como 'pendente' ⭐⭐⭐
      // Templates customizados podem não conter as palavras-chave esperadas
      statusFinal = esperaResposta || !!consultaId ? 'pendente' : 'enviada';
    }

    // ⭐⭐⭐ FIX v26.0: CONVENÇÃO DE DIÁLOGO ÚNICO — FECHA TODOS OS ANTERIORES ANTES DE ABRIR NOVO ⭐⭐⭐
    // Quando uma nova mensagem 'pendente' é salva (= novo diálogo aberto), TODAS as mensagens
    // 'pendente' anteriores do mesmo usuário são automaticamente fechadas.
    // Isso garante que a próxima resposta do paciente será processada APENAS contra o diálogo atual.
    // Convenção: status='pendente' = diálogo aberto, status='fechado' = diálogo encerrado.
    if (statusFinal === 'pendente' && chatId) {
      const fechouAntes = await new Promise((r) => db.run(
        `UPDATE mensagens SET status = 'fechado', fechadoEm = ? 
         WHERE clinicaId = ? AND status = 'pendente' 
         AND (chatId = ? OR pacienteId = ?)`,
        [now, clinicaId, chatId, pacienteId || 'desconhecido'],
        function (err) {
          if (err) {
            console.log(`📋 [FIX v26.0] ⚠️ Erro ao fechar pendentes anteriores: ${err.message}`);
            r(0);
          } else {
            if (this.changes > 0) {
              console.log(`📋 [FIX v26.0] ✅ ${this.changes} diálogo(s) anterior(es) FECHADO(s) para ${chatId} antes de abrir novo`);
            }
            r(this.changes);
          }
        }
      ));
    }

    await new Promise((r) => db.run(
      `INSERT INTO mensagens (id, clinicaId, chatId, consultaId, pacienteId, pacienteNome, tipo, conteudo, dataHora, status, erro, criadoEm) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, clinicaId, chatId || null, consultaId || null, pacienteId || 'desconhecido', pacienteNome || 'Desconhecido', tipo, conteudo, now, statusFinal, null, now],
      () => r()
    ));

    // ⭐⭐⭐ FIX v12.5: Atualiza status do diálogo automaticamente ⭐⭐⭐
    // Quando o bot ENVIA uma mensagem com status 'enviada' (resposta final), marca diálogo como 'enviado'
    // Quando envia com status 'pendente' (esperando resposta), o diálogo continua 'pendente'
    if (chatId && tipo === 'enviada' && statusFinal === 'enviada') {
      // Resposta final enviada → diálogo fica "enviado"
      marcarDialogoEnviado(clinicaId, chatId).catch(() => {});
    }

    return id;
  } catch (e) {return null;}
}

// ⭐⭐⭐ NOVA FUNÇÃO: ATUALIZAR CONTEÚDO E PACIENTE DE UMA MENSAGEM ⭐⭐⭐
async function atualizarMensagemHistorico(clinicaId, msgId, novoConteudo, pacienteId, pacienteNome) {
  if (!clinicaId || !msgId) return false;
  try {
    const db = getClinicaDB(clinicaId);
    const campos = [];
    const valores = [];

    if (novoConteudo) {
      campos.push('conteudo = ?');
      valores.push(novoConteudo);
    }
    if (pacienteId) {
      campos.push('pacienteId = ?');
      valores.push(pacienteId);
    }
    if (pacienteNome) {
      campos.push('pacienteNome = ?');
      valores.push(pacienteNome);
    }

    if (campos.length === 0) return false;

    valores.push(msgId);

    await new Promise((resolve) => {
      db.run(
        `UPDATE mensagens SET ${campos.join(', ')} WHERE id = ?`,
        valores,
        function (err) {
          if (err) {
            console.log(`❌ [atualizarMensagemHistorico] Erro: ${err.message}`);
          } else {
            console.log(`✅ [atualizarMensagemHistorico] Mensagem ${msgId} atualizada (${this.changes} linhas)`);
          }
          resolve();
        }
      );
    });
    return true;
  } catch (e) {
    console.error(`❌ [atualizarMensagemHistorico] Erro: ${e.message}`);
    return false;
  }
}

// ⭐⭐⭐ FUNÇÃO CORRIGIDA: SALVAR FOTO DO PACIENTE ⭐⭐⭐
async function salvarFotoPaciente(clinicaId, pacienteId, base64Data, mimetype) {
  console.log(`\n📸📸📸 [salvarFotoPaciente] ========================================`);
  console.log(`📸 Salvando foto para paciente ${pacienteId}`);
  console.log(`📸 Base64 tamanho: ${base64Data?.length || 0} chars`);
  console.log(`📸 Mimetype: ${mimetype}`);

  if (!base64Data || base64Data.length < 1000) {
    console.log(`📸 ❌ Base64 muito pequeno ou vazio!`);
    return null;
  }

  try {
    const db = getClinicaDB(clinicaId);
    // ⭐⭐⭐ FIX v9.8.1: dbGlobal agora é MySQL (ASSÍNCRONO) — precisa de await! ⭐⭐⭐
    // Sem await, retornava Promise e operadoraId sempre era 'geral'
    const clinica = await dbGlobal.prepare('SELECT operadoraId FROM clinicas WHERE id = ?').get(clinicaId);
    const operadoraId = clinica?.operadoraId || 'geral';
    console.log(`📸 operadoraId resolvido: ${operadoraId} (clinicaId: ${clinicaId})`);
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const fotosDir = path.join(uploadsDir, operadoraId, clinicaId, pacienteId, 'fotos');

    console.log(`📸 Diretório: ${fotosDir}`);

    if (!fs.existsSync(fotosDir)) {
      fs.mkdirSync(fotosDir, { recursive: true });
      console.log(`📸 Diretório criado!`);
    }

    let ext = '.jpg';
    if (mimetype?.includes('png')) ext = '.png';else
    if (mimetype?.includes('webp')) ext = '.webp';

    const fileName = `perfil_whatsapp_${Date.now()}${ext}`;
    const filePath = path.join(fotosDir, fileName);

    // ⭐ Limpa o base64 de possíveis prefixos
    let base64Limpo = base64Data;
    if (base64Limpo.includes(',')) {
      base64Limpo = base64Limpo.split(',')[1];
    }
    base64Limpo = base64Limpo.replace(/\s/g, '');

    const buffer = Buffer.from(base64Limpo, 'base64');

    console.log(`📸 Arquivo: ${fileName}`);
    console.log(`📸 Buffer tamanho: ${buffer.length} bytes`);

    if (buffer.length < 1000) {
      console.log(`📸 ❌ Buffer muito pequeno! Possível erro de decodificação.`);
      return null;
    }

    fs.writeFileSync(filePath, buffer);
    console.log(`📸 ✅ Arquivo salvo em disco!`);

    let fotoUrl = `/uploads/${operadoraId}/${clinicaId}/${pacienteId}/fotos/${fileName}`;

    // ⭐⭐⭐ CLOUD STORAGE: Envia para nuvem e usa URL da nuvem ⭐⭐⭐
    try {
      const cloudResult = await uploadToCloud(buffer, fileName, mimetype);
      if (cloudResult?.cloudUrl) {
        fotoUrl = cloudResult.cloudUrl;
        console.log(`📸 ☁️ Foto enviada para nuvem: ${fotoUrl}`);
      }
    } catch (cloudErr) {
      console.log(`📸 ⚠️ Nuvem indisponível, usando caminho local: ${cloudErr.message}`);
    }

    // ⭐⭐⭐ ATUALIZA NO BANCO COM VERIFICAÇÃO ⭐⭐⭐
    console.log(`📸 Atualizando banco de dados...`);

    await new Promise((resolve, reject) => {
      db.run(`UPDATE pacientes SET fotoUrl = ? WHERE id = ?`, [fotoUrl, pacienteId], function (err) {
        if (err) {
          console.log(`📸 ❌ Erro ao atualizar banco: ${err.message}`);
          reject(err);
        } else {
          console.log(`📸 ✅ Banco atualizado! Linhas afetadas: ${this.changes}`);
          if (this.changes === 0) {
            console.log(`📸 ⚠️ ATENÇÃO: Nenhuma linha foi atualizada! Paciente ${pacienteId} existe?`);
          }
          resolve();
        }
      });
    });

    // ⭐ Verifica se realmente salvou
    const paciente = await new Promise((r) => db.get('SELECT id, nome, fotoUrl FROM pacientes WHERE id = ?', [pacienteId], (e, row) => r(row)));
    console.log(`📸 Verificação: Paciente ${paciente?.nome || 'NÃO ENCONTRADO'}`);
    console.log(`📸 Verificação: fotoUrl no banco = ${paciente?.fotoUrl || 'VAZIO'}`);

    if (paciente?.fotoUrl !== fotoUrl) {
      console.log(`📸 ⚠️ PROBLEMA: fotoUrl no banco não corresponde ao esperado!`);
    }

    // ⭐ Notifica via SSE
    if (global.notificarFotoAtualizada) {
      console.log(`📸 🔔 Notificando via SSE...`);
      global.notificarFotoAtualizada(pacienteId, fotoUrl, paciente?.nome || 'Paciente');
    }

    console.log(`📸📸📸 ======================================== FIM ✅\n`);
    return fotoUrl;
  } catch (e) {
    console.error(`📸 ❌ ERRO: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ FUNÇÃO CORRIGIDA: SALVAR DOCUMENTO ⭐⭐⭐
// ⭐ FIX: Aceita especialidade como parâmetro para separar documentos por especialidade
async function salvarDocumentoPaciente(clinicaId, pacienteId, pacienteNome, base64Data, mimetype, msgType, categoria = 'outros', especialidade = null) {
  console.log(`\n📄📄📄 [salvarDocumentoPaciente] ========================================`);
  console.log(`📄 Salvando documento para ${pacienteNome} (${pacienteId})`);
  console.log(`📄 Base64 tamanho: ${base64Data?.length || 0} chars`);
  console.log(`📄 Mimetype: ${mimetype}`);
  console.log(`📄 MsgType: ${msgType}`);
  console.log(`📄 Categoria: ${categoria}`);
  console.log(`📄 Especialidade: ${especialidade || '(não definida)'}`);

  if (!base64Data || base64Data.length < 1000) {
    console.log(`📄 ❌ Base64 muito pequeno ou vazio!`);
    return null;
  }

  try {
    const db = getClinicaDB(clinicaId);
    // ⭐⭐⭐ FIX v9.8.1: dbGlobal agora é MySQL (ASSÍNCRONO) — precisa de await! ⭐⭐⭐
    // Sem await, retornava Promise e operadoraId sempre era 'geral'
    const clinica = await dbGlobal.prepare('SELECT operadoraId FROM clinicas WHERE id = ?').get(clinicaId);
    const operadoraId = clinica?.operadoraId || 'geral';
    console.log(`📄 operadoraId resolvido: ${operadoraId} (clinicaId: ${clinicaId})`);
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const docsDir = path.join(uploadsDir, operadoraId, clinicaId, pacienteId, 'documentos');

    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // ⭐⭐⭐ v7.3: DETECÇÃO DE EXTENSÃO MELHORADA ⭐⭐⭐
    // Prioriza mimetype sobre msgType para determinar extensão
    let ext = '.bin'; // fallback genérico
    const mime = (mimetype || '').toLowerCase();

    // Imagens
    if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = '.jpg';else
    if (mime.includes('image/png')) ext = '.png';else
    if (mime.includes('image/webp')) ext = '.webp';else
    if (mime.includes('image/gif')) ext = '.gif';else
    if (mime.includes('image/bmp')) ext = '.bmp';else
    if (mime.includes('image/')) ext = '.jpg'; // fallback para imagens
    // Vídeos
    else if (mime.includes('video/mp4')) ext = '.mp4';else
    if (mime.includes('video/quicktime') || mime.includes('video/mov')) ext = '.mov';else
    if (mime.includes('video/3gpp') || mime.includes('video/3gp')) ext = '.3gp';else
    if (mime.includes('video/x-msvideo') || mime.includes('video/avi')) ext = '.avi';else
    if (mime.includes('video/webm')) ext = '.webm';else
    if (mime.includes('video/x-matroska') || mime.includes('video/mkv')) ext = '.mkv';else
    if (mime.includes('video/')) ext = '.mp4'; // fallback para vídeos
    // Áudio
    else if (mime.includes('audio/ogg') || mime.includes('audio/opus')) ext = '.ogg';else
    if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) ext = '.mp3';else
    if (mime.includes('audio/aac')) ext = '.aac';else
    if (mime.includes('audio/wav')) ext = '.wav';else
    if (mime.includes('audio/')) ext = '.ogg'; // fallback para áudio
    // Documentos
    else if (mime.includes('application/pdf')) ext = '.pdf';else
    if (mime.includes('application/msword') || mime.includes('application/vnd.openxmlformats-officedocument.wordprocessing')) ext = '.docx';else
    if (mime.includes('application/vnd.ms-excel') || mime.includes('application/vnd.openxmlformats-officedocument.spreadsheet')) ext = '.xlsx';else
    if (mime.includes('application/vnd.ms-powerpoint') || mime.includes('application/vnd.openxmlformats-officedocument.presentation')) ext = '.pptx';else
    if (mime.includes('application/zip')) ext = '.zip';else
    if (mime.includes('application/x-rar') || mime.includes('application/vnd.rar')) ext = '.rar';
    // Fallback por msgType quando mimetype é genérico (application/octet-stream etc)
    else if (msgType === 'video') ext = '.mp4';else
    if (msgType === 'audio' || msgType === 'ptt') ext = '.ogg';else
    if (msgType === 'image') ext = '.jpg';else
    if (msgType === 'document') ext = '.pdf'; // último recurso para document
    else ext = '.bin';

    console.log(`📄 Extensão detectada: ${ext} (mime: ${mime}, msgType: ${msgType})`);

    const fileName = `doc_whatsapp_${Date.now()}${ext}`;
    const filePath = path.join(docsDir, fileName);

    // ⭐ Limpa o base64
    let base64Limpo = base64Data;
    if (base64Limpo.includes(',')) base64Limpo = base64Limpo.split(',')[1];
    base64Limpo = base64Limpo.replace(/\s/g, '');

    const buffer = Buffer.from(base64Limpo, 'base64');

    console.log(`📄 Arquivo: ${fileName}`);
    console.log(`📄 Buffer tamanho: ${buffer.length} bytes`);

    if (buffer.length < 1000) {
      console.log(`📄 ❌ Buffer muito pequeno!`);
      return null;
    }

    fs.writeFileSync(filePath, buffer);
    console.log(`📄 ✅ Arquivo salvo!`);

    const caminho = `/uploads/${operadoraId}/${clinicaId}/${pacienteId}/documentos/${fileName}`;

    // ⭐⭐⭐ CLOUD STORAGE: Envia para nuvem ⭐⭐⭐
    let cloudUrl = null;
    try {
      const cloudResult = await uploadToCloud(buffer, fileName, mimetype);
      if (cloudResult?.cloudUrl) {
        cloudUrl = cloudResult.cloudUrl;
        console.log(`📄 ☁️ Documento enviado para nuvem: ${cloudUrl}`);
      }
    } catch (cloudErr) {
      console.log(`📄 ⚠️ Nuvem indisponível, usando caminho local: ${cloudErr.message}`);
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const criadoEm = new Date().toISOString();

    await new Promise((r) => db.run(`
      CREATE TABLE IF NOT EXISTS documentos (
        id VARCHAR(255) PRIMARY KEY, pacienteId VARCHAR(255) NOT NULL, nome VARCHAR(500) NOT NULL, nomeOriginal VARCHAR(500),
        tipo VARCHAR(100), categoria VARCHAR(100), caminho TEXT, url TEXT, tamanho INTEGER, observacoes TEXT, criadoPor VARCHAR(255), especialidade VARCHAR(255), criadoEm VARCHAR(50)
      )
    `, () => r()));
    // ⭐ Migração: adiciona coluna especialidade se não existir
    await new Promise((r) => db.run('ALTER TABLE documentos ADD COLUMN especialidade VARCHAR(255)', () => r()));

    const categoriaLabels = { 'exames': 'Exame', 'laudos': 'Laudo', 'receitas': 'Receita', 'atestados': 'Atestado', 'imagens': 'Imagem/Raio-X', 'outros': 'Documento' };

    // ⭐⭐⭐ v7.3: Tipo MIME correto baseado na extensão final ⭐⭐⭐
    let tipoMime = mimetype || 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') tipoMime = 'image/jpeg';else
    if (ext === '.png') tipoMime = 'image/png';else
    if (ext === '.webp') tipoMime = 'image/webp';else
    if (ext === '.gif') tipoMime = 'image/gif';else
    if (ext === '.pdf') tipoMime = 'application/pdf';else
    if (ext === '.mp4') tipoMime = 'video/mp4';else
    if (ext === '.mov') tipoMime = 'video/quicktime';else
    if (ext === '.3gp') tipoMime = 'video/3gpp';else
    if (ext === '.avi') tipoMime = 'video/x-msvideo';else
    if (ext === '.webm') tipoMime = 'video/webm';else
    if (ext === '.mkv') tipoMime = 'video/x-matroska';else
    if (ext === '.ogg') tipoMime = 'audio/ogg';else
    if (ext === '.mp3') tipoMime = 'audio/mpeg';else
    if (ext === '.aac') tipoMime = 'audio/aac';else
    if (ext === '.docx') tipoMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.sheet';else
    if (ext === '.xlsx') tipoMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // ⭐⭐⭐ v7.3: Nome do documento indica se é vídeo/áudio ⭐⭐⭐
    let tipoLabel = categoriaLabels[categoria] || 'Documento';
    if (ext === '.mp4' || ext === '.mov' || ext === '.3gp' || ext === '.avi' || ext === '.webm' || ext === '.mkv') {
      tipoLabel = 'Vídeo';
    } else if (ext === '.ogg' || ext === '.mp3' || ext === '.aac' || ext === '.wav') {
      tipoLabel = 'Áudio';
    }

    const nomeDoc = `${tipoLabel} via WhatsApp - ${new Date().toLocaleDateString('pt-BR')}`;

    await new Promise((r) => db.run(
      `INSERT INTO documentos (id, pacienteId, nome, nomeOriginal, tipo, categoria, caminho, url, tamanho, observacoes, criadoPor, especialidade, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [docId, pacienteId, nomeDoc, fileName, tipoMime, categoria, caminho, cloudUrl, buffer.length, `Enviado via WhatsApp por ${pacienteNome}`, 'WhatsApp', especialidade || null, criadoEm],
      () => r()
    ));

    console.log(`📄 ✅ Documento salvo no banco! (${tipoLabel}: ${fileName}, especialidade: ${especialidade || 'N/A'})`);

    if (global.notificarDocumentoRecebido) {
      global.notificarDocumentoRecebido(pacienteId, { id: docId, pacienteId, nome: nomeDoc, tipo: tipoMime, categoria, especialidade: especialidade || null, caminho, tamanho: buffer.length, criadoEm, pacienteNome });
    }

    console.log(`📄📄📄 ======================================== FIM ✅\n`);
    return { docId, caminho, categoria };
  } catch (e) {
    console.error(`📄 ❌ ERRO: ${e.message}`);
    return null;
  }
}

async function salvarMidiaRecebida(clinicaId, pacienteId, base64Data, mimetype, msgType) {
  try {
    // ⭐⭐⭐ FIX v9.8.1: dbGlobal agora é MySQL (ASSÍNCRONO) — precisa de await! ⭐⭐⭐
    const clinica = await dbGlobal.prepare('SELECT operadoraId FROM clinicas WHERE id = ?').get(clinicaId);
    const operadoraId = clinica?.operadoraId || 'geral';
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const midiasDir = path.join(uploadsDir, operadoraId, clinicaId, 'mensagens', pacienteId);
    if (!fs.existsSync(midiasDir)) fs.mkdirSync(midiasDir, { recursive: true });

    // ⭐⭐⭐ v7.3: Detecção de extensão melhorada ⭐⭐⭐
    const mime = (mimetype || '').toLowerCase();
    let ext = '.bin';
    if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = '.jpg';else
    if (mime.includes('image/png')) ext = '.png';else
    if (mime.includes('image/webp')) ext = '.webp';else
    if (mime.includes('image/')) ext = '.jpg';else
    if (mime.includes('video/mp4')) ext = '.mp4';else
    if (mime.includes('video/quicktime') || mime.includes('video/mov')) ext = '.mov';else
    if (mime.includes('video/3gpp')) ext = '.3gp';else
    if (mime.includes('video/')) ext = '.mp4';else
    if (mime.includes('audio/ogg') || mime.includes('audio/opus')) ext = '.ogg';else
    if (mime.includes('audio/mpeg')) ext = '.mp3';else
    if (mime.includes('audio/')) ext = '.ogg';else
    if (mime.includes('application/pdf')) ext = '.pdf';else
    if (mime.includes('application/')) ext = '.bin';
    // Fallback por msgType
    else if (msgType === 'video') ext = '.mp4';else
    if (msgType === 'audio' || msgType === 'ptt') ext = '.ogg';else
    if (msgType === 'image') ext = '.jpg';else
    if (msgType === 'document') ext = '.pdf';

    const fileName = `${msgType || 'midia'}_${Date.now()}${ext}`;
    const filePath = path.join(midiasDir, fileName);

    let base64Limpo = base64Data;
    if (base64Limpo.includes(',')) base64Limpo = base64Limpo.split(',')[1];

    const buffer = Buffer.from(base64Limpo, 'base64');
    fs.writeFileSync(filePath, buffer);

    let midiaUrl = `/uploads/${operadoraId}/${clinicaId}/mensagens/${pacienteId}/${fileName}`;

    // ⭐⭐⭐ CLOUD STORAGE: Envia para nuvem ⭐⭐⭐
    try {
      const cloudResult = await uploadToCloud(buffer, fileName, mimetype);
      if (cloudResult?.cloudUrl) {
        midiaUrl = cloudResult.cloudUrl;
        console.log(`📁 ☁️ Mídia enviada para nuvem: ${midiaUrl}`);
      }
    } catch (cloudErr) {
      console.log(`📁 ⚠️ Nuvem indisponível, usando caminho local: ${cloudErr.message}`);
    }

    console.log(`📁 Mídia salva: ${midiaUrl} (${buffer.length} bytes)`);
    return midiaUrl;
  } catch (e) {
    console.error('❌ Erro ao salvar mídia:', e.message);
    return null;
  }
}

// ⭐⭐⭐ FUNÇÃO ROBUSTA: BAIXAR MÍDIA (FIX v12.3: tenta HTTP e HTTPS) ⭐⭐⭐
async function baixarMidia(url, apiKey) {
  console.log(`\n🔗 [baixarMidia v12.3] Tentando baixar: ${url}`);
  console.log(`🔗 [baixarMidia] apiKey: ${apiKey ? '***' + apiKey.slice(-4) : '(sem chave)'}`);

  // ⭐⭐⭐ FIX v12.3: Gera variantes HTTP/HTTPS para tentar ambos ⭐⭐⭐
  const urlVariants = [url];
  if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    urlVariants.push(url.replace('http://', 'https://'));
  } else if (url.startsWith('https://')) {
    urlVariants.push(url.replace('https://', 'http://'));
  }

  for (const tryUrl of urlVariants) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      // ⭐⭐⭐ v7.6: ENVIA API KEY + HEADERS CORRETOS PARA DOWNLOAD ⭐⭐⭐
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      };
      // Se tem apiKey e a URL parece ser do WAHA, envia o header
      if (apiKey) {
        headers['X-Api-Key'] = apiKey;
      }

      console.log(`🔗 [baixarMidia] Tentando: ${tryUrl}`);
      const response = await fetch(tryUrl, {
        signal: controller.signal,
        headers
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        console.log(`🔗 ✅ Sucesso! Tamanho: ${base64.length} chars (${buffer.byteLength} bytes) Content-Type: ${contentType}`);
        return base64;
      } else {
        const errText = await response.text().catch(() => '');
        console.log(`🔗 ❌ HTTP ${response.status}: ${errText.substring(0, 200)}`);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`🔗 ❌ Timeout (30s) em ${tryUrl}`);
      } else {
        console.log(`🔗 ❌ Erro em ${tryUrl}: ${e.message}`);
      }
    }
  }
  return null;
}

// ⭐⭐⭐ FUNÇÃO ROBUSTA: BAIXAR MÍDIA VIA WAHA (QUALIDADE MÁXIMA) v12.4 ⭐⭐⭐
// FIX v12.4: Tenta HTTP e HTTPS automaticamente (mesmo fix de enviarMensagemRobusta)
async function baixarMidiaViaWaha(serverUrl, sessionName, messageId, apiKey, msgType) {
  // ⭐⭐⭐ FIX v12.4: Gera variantes HTTP/HTTPS do serverUrl ⭐⭐⭐
  const serverUrls = [serverUrl];
  if (serverUrl.startsWith('http://') && !serverUrl.includes('localhost') && !serverUrl.includes('127.0.0.1')) {
    serverUrls.push(serverUrl.replace('http://', 'https://'));
  } else if (serverUrl.startsWith('https://')) {
    serverUrls.push(serverUrl.replace('https://', 'http://'));
  }

  for (const tryServerUrl of serverUrls) {
    const result = await _baixarMidiaViaWahaInternal(tryServerUrl, sessionName, messageId, apiKey, msgType);
    if (result) return result;
    console.log(`🔗 [baixarMidiaViaWaha v12.4] Tentando próximo protocolo...`);
  }
  console.log(`🔗 [baixarMidiaViaWaha v12.4] ❌ Nenhum protocolo funcionou`);
  return null;
}

async function _baixarMidiaViaWahaInternal(serverUrl, sessionName, messageId, apiKey, msgType) {
  console.log(`\n🔗 [baixarMidiaViaWaha v12.4] ========================================`);
  console.log(`🔗 serverUrl: ${serverUrl}`);
  console.log(`🔗 sessionName: ${sessionName}`);
  console.log(`🔗 messageId: ${messageId}`);
  console.log(`🔗 msgType: ${msgType || '(não informado)'}`);
  console.log(`🔗 apiKey: ${apiKey ? '***' + apiKey.slice(-4) : '(sem chave)'}`);

  if (!serverUrl || !sessionName || !messageId) {
    console.log(`🔗 ❌ Parâmetros faltando`);
    return null;
  }

  // ⭐⭐⭐ REJEITA EVENT IDs (evt_...) - NÃO SÃO MESSAGE IDs VÁLIDOS ⭐⭐⭐
  if (typeof messageId === 'string' && messageId.startsWith('evt_')) {
    console.log(`🔗 ❌ messageId "${messageId}" é um event ID, não um message ID válido!`);
    console.log(`🔗 ========================================\n`);
    return null;
  }

  let cleanMessageId = messageId;
  console.log(`🔗 messageId limpo: ${cleanMessageId}`);

  const encodedMessageId = encodeURIComponent(cleanMessageId);

  // ⭐⭐⭐ v7.6: HEADERS CORRETOS POR TIPO DE REQUEST ⭐⭐⭐
  function getHeadersForGet() {
    const h = { 'Accept': '*/*' };
    if (apiKey) h['X-Api-Key'] = apiKey;
    return h;
  }
  function getHeadersForPost() {
    const h = { 'Content-Type': 'application/json', 'Accept': '*/*' };
    if (apiKey) h['X-Api-Key'] = apiKey;
    return h;
  }

  // ⭐⭐⭐ v7.7: DELAY MUITO MAIOR PARA VÍDEO - O WAHA PRECISA DE TEMPO PARA PROCESSAR ⭐⭐⭐
  const isVideo = msgType === 'video';
  const isAudio = msgType === 'audio' || msgType === 'ptt';
  const isHeavyMedia = isVideo || isAudio;

  if (isHeavyMedia) {
    const delayMs = isVideo ? 8000 : 3000; // 8s para vídeo, 3s para áudio
    console.log(`🔗 ⏳ Aguardando ${delayMs}ms para WAHA processar ${msgType}...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  // ⭐⭐⭐ v7.7: TAMANHOS MÍDIA MÍNIMOS REALISTAS ⭐⭐⭐
  const MIN_SIZE_BYTES = {
    video: 50000, // 50KB mínimo para vídeo
    audio: 5000, // 5KB mínimo para áudio
    ptt: 5000, // 5KB mínimo para áudio
    image: 50000, // 50KB mínimo para imagem
    document: 1000, // 1KB mínimo para documento
    default: 1000 // 1KB fallback
  };
  const minAcceptBytes = MIN_SIZE_BYTES[msgType] || MIN_SIZE_BYTES.default;
  console.log(`🔗 Tamanho mínimo aceitável para ${msgType}: ${minAcceptBytes} bytes (~${Math.round(minAcceptBytes / 1024)} KB)`);

  // ⭐⭐⭐ v7.7: ENDPOINTS PRIORIZADOS ⭐⭐⭐
  const mediaEndpoints = [
  { method: 'GET', url: `${serverUrl}/api/sessions/${sessionName}/messages/${encodedMessageId}/media`, desc: '⭐ WAHA /sessions/messages/media (encoded)', timeout: 60000 },
  { method: 'GET', url: `${serverUrl}/api/sessions/${sessionName}/messages/${cleanMessageId}/media`, desc: '⭐ WAHA /sessions/messages/media (raw)', timeout: 60000 },
  { method: 'GET', url: `${serverUrl}/api/${sessionName}/messages/${encodedMessageId}/download-media`, desc: 'WAHA download-media', timeout: 60000 },
  { method: 'GET', url: `${serverUrl}/api/sessions/${sessionName}/messages/${encodedMessageId}/download-media`, desc: 'WAHA sessions download-media', timeout: 60000 },
  { method: 'GET', url: `${serverUrl}/api/${sessionName}/messages/${encodedMessageId}/media`, desc: 'WAHA media (sem sessions)', timeout: 60000 },
  { method: 'GET', url: `${serverUrl}/api/sessions/${sessionName}/messages/${encodedMessageId}/download`, desc: 'WAHA download', timeout: 60000 }];

  const postEndpoints = [
  { method: 'POST', url: `${serverUrl}/api/${sessionName}/chatting/getMedia`, body: { messageId: cleanMessageId }, desc: 'WAHA chatting/getMedia', timeout: 60000 },
  { method: 'POST', url: `${serverUrl}/api/chatting/getMedia`, body: { messageId: cleanMessageId, session: sessionName }, desc: 'WAHA chatting/getMedia (global)', timeout: 60000 },
  { method: 'POST', url: `${serverUrl}/api/sessions/${sessionName}/messages/download`, body: { messageId: cleanMessageId, session: sessionName }, desc: 'WAHA POST download', timeout: 60000 },
  { method: 'POST', url: `${serverUrl}/api/sessions/${sessionName}/getMessageMedia`, body: { messageId: cleanMessageId }, desc: 'WAHA getMessageMedia', timeout: 60000 },
  { method: 'POST', url: `${serverUrl}/api/messages/download`, body: { messageId: cleanMessageId, session: sessionName }, desc: 'WAHA POST download global', timeout: 60000 }];

  // Files endpoint (ÚLTIMO RECURSO - NÃO funciona para vídeo/áudio)
  let fileEndpoints = [];
  if (!isVideo && !isAudio) {
    let extensions = ['jpeg', 'jpg', 'png', 'webp'];
    if (msgType === 'document') {
      extensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    } else if (msgType === 'sticker') {
      extensions = ['webp', 'png'];
    }
    extensions.push('bin');

    fileEndpoints = extensions.map((ext) => ({
      method: 'GET',
      url: `${serverUrl}/api/files/${sessionName}/${cleanMessageId}.${ext}`,
      desc: `WAHA FILES .${ext}`,
      timeout: 8000
    }));
  } else {
    console.log(`🔗 ⏭️ Pulando files endpoint para ${msgType} (não funciona para vídeo/áudio)`);
  }

  // ⭐⭐⭐ v7.7: PARA VÍDEO, TENTA COM RETRIES PROGRESSIVOS ⭐⭐⭐
  const maxRounds = isVideo ? 3 : 1;
  const delayBetweenRounds = isVideo ? 10000 : 0;

  let melhorBase64 = null;
  let melhorTamanho = 0;
  let melhorEndpoint = '';

  for (let round = 0; round < maxRounds; round++) {
    if (round > 0) {
      console.log(`🔗 🔄 RODADA ${round + 1}/${maxRounds}: Aguardando ${delayBetweenRounds / 1000}s antes de tentar novamente...`);
      await new Promise((r) => setTimeout(r, delayBetweenRounds));
    }

    const endpoints = round === 0 ?
    [...mediaEndpoints, ...postEndpoints, ...fileEndpoints] :
    [...mediaEndpoints];

    console.log(`🔗 Rodada ${round + 1}: ${endpoints.length} endpoints a tentar`);

    for (const endpoint of endpoints) {
      try {
        console.log(`🔗 Tentando: ${endpoint.desc} [${endpoint.method}]`);

        const controller = new AbortController();
        const timeoutMs = endpoint.timeout || 60000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const options = {
          method: endpoint.method,
          headers: endpoint.method === 'GET' ? getHeadersForGet() : getHeadersForPost(),
          signal: controller.signal
        };
        if (endpoint.body) options.body = JSON.stringify(endpoint.body);

        const response = await fetch(endpoint.url, options);
        clearTimeout(timeoutId);

        console.log(`🔗 Status: ${response.status}`);

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const contentLength = response.headers.get('content-length');
          console.log(`🔗 Content-Type: ${contentType}, Content-Length: ${contentLength}`);

          // ⭐⭐⭐ v7.7: VERIFICA CONTENT-LENGTH ANTES DE BAIXAR ⭐⭐⭐
          if (contentLength && parseInt(contentLength, 10) < minAcceptBytes && isHeavyMedia) {
            console.log(`🔗 ⚠️ Content-Length (${contentLength}) menor que mínimo (${minAcceptBytes}) - mídia provavelmente ainda não processada`);
            continue;
          }

          if (contentType.includes('image') || contentType.includes('video') || contentType.includes('audio') || contentType.includes('octet-stream') || contentType.includes('application/pdf')) {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength >= minAcceptBytes) {
              const base64 = Buffer.from(buffer).toString('base64');
              const sizeKB = Math.round(buffer.byteLength / 1024);
              console.log(`🔗 ✅✅✅ BINÁRIO RECEBIDO! ${base64.length} chars (${buffer.byteLength} bytes / ~${sizeKB} KB)`);

              if (base64.length > melhorTamanho) {
                melhorTamanho = base64.length;
                melhorBase64 = base64;
                melhorEndpoint = endpoint.desc;
              }

              const goodSizeBytes = isVideo ? 100000 : isAudio ? 5000 : 50000;
              if (buffer.byteLength >= goodSizeBytes) {
                console.log(`🔗 ✅✅✅ QUALIDADE EXCELENTE (~${sizeKB} KB) via ${endpoint.desc}! Retornando.`);
                console.log(`🔗 ========================================\n`);
                return melhorBase64;
              } else {
                console.log(`🔗 ⚠️ Tamanho OK mas abaixo do ideal (~${sizeKB} KB) - continuando busca por melhor qualidade`);
              }
            } else {
              console.log(`🔗 ⚠️ Binário muito pequeno: ${buffer.byteLength} bytes (mínimo: ${minAcceptBytes}) - provavelmente thumbnail ou fragmento`);
            }
          } else if (contentType.includes('application/json')) {
            const data = await response.json();
            console.log(`🔗 JSON keys:`, Object.keys(data));
            console.log(`🔗 JSON preview:`, JSON.stringify(data).substring(0, 500));

            if (data.error || data.message?.includes('not found') || data.message?.includes('not ready')) {
              console.log(`🔗 ⚠️ WAHA retornou erro: ${data.error || data.message}`);
              continue;
            }

            const possiveisBase64 = [
            data.data, data.base64, data.mediaData, data.content, data.media,
            data.file, data.body, data.image, data.fileData, data.mediaBase64,
            data.result, data.message?.media, data.message?.data, data.message?.mediaData];

            for (const val of possiveisBase64) {
              if (val && typeof val === 'string' && val.length > 1000) {
                let base64 = val.includes(',') ? val.split(',')[1] : val;
                base64 = base64.replace(/\s/g, '');

                const estimatedBytes = Math.round(base64.length * 0.75);
                if (estimatedBytes < minAcceptBytes) {
                  console.log(`🔗 ⚠️ Base64 muito pequeno: ~${Math.round(estimatedBytes / 1024)} KB (mínimo: ${Math.round(minAcceptBytes / 1024)} KB)`);
                  continue;
                }

                if (base64.length > melhorTamanho) {
                  melhorTamanho = base64.length;
                  melhorBase64 = base64;
                  melhorEndpoint = endpoint.desc;
                  const sizeKB = Math.round(estimatedBytes / 1024);
                  console.log(`🔗 ✅ Base64 do JSON! Tamanho: ${base64.length} chars (~${sizeKB} KB)`);
                }
              }
            }

            const possiveisUrls = [
            data.url, data.mediaUrl, data.downloadUrl, data.link,
            data.fileUrl, data.directPath,
            data.media?.url, data.media?.link];

            for (const url of possiveisUrls) {
              if (url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('/'))) {
                const fullUrl = url.startsWith('http') ? url : `${serverUrl}${url}`;
                console.log(`🔗 URL encontrada no JSON: ${fullUrl}`);
                const downloaded = await baixarMidia(fullUrl, apiKey);
                if (downloaded && downloaded.length > melhorTamanho) {
                  const estimatedBytes = Math.round(downloaded.length * 0.75);
                  if (estimatedBytes >= minAcceptBytes) {
                    melhorTamanho = downloaded.length;
                    melhorBase64 = downloaded;
                    melhorEndpoint = `${endpoint.desc} → URL`;
                    console.log(`🔗 ✅ Baixado de URL! Tamanho: ${downloaded.length} chars (~${Math.round(estimatedBytes / 1024)} KB)`);
                  }
                }
              }
            }
          }

          // Se encontrou algo de boa qualidade, retorna
          if (melhorBase64) {
            const estimatedBytes = Math.round(melhorTamanho * 0.75);
            const goodSizeBytes = isVideo ? 100000 : isAudio ? 5000 : 66000;
            if (estimatedBytes >= goodSizeBytes) {
              console.log(`🔗 ✅✅✅ QUALIDADE BOA encontrada via ${melhorEndpoint}! (~${Math.round(estimatedBytes / 1024)} KB) Retornando.`);
              console.log(`🔗 ========================================\n`);
              return melhorBase64;
            }
          }
        } else if (response.status === 404) {
          if (!endpoint.desc.includes('FILES')) {
            console.log(`🔗 404 - tentando próximo...`);
          }
        } else if (response.status === 401) {
          console.log(`🔗 401 - API Key inválida ou não enviada!`);
        } else if (response.status === 406) {
          // ⭐⭐⭐ v7.7: 406 = mídia ainda não processada, retry com delay maior ⭐⭐⭐
          const retryDelay = isVideo ? 8000 : 3000;
          console.log(`🔗 406 - Mídia ainda não processada pelo WAHA. Aguardando ${retryDelay / 1000}s e tentando novamente...`);
          await new Promise((r) => setTimeout(r, retryDelay));
          try {
            const retryResponse = await fetch(endpoint.url, {
              method: endpoint.method,
              headers: endpoint.method === 'GET' ? getHeadersForGet() : getHeadersForPost()
            });
            if (retryResponse.ok) {
              const retryContentType = retryResponse.headers.get('content-type') || '';
              if (retryContentType.includes('image') || retryContentType.includes('video') || retryContentType.includes('audio') || retryContentType.includes('octet-stream')) {
                const buffer = await retryResponse.arrayBuffer();
                if (buffer.byteLength >= minAcceptBytes) {
                  const base64 = Buffer.from(buffer).toString('base64');
                  console.log(`🔗 ✅ RETRY SUCESSO! ${buffer.byteLength} bytes (~${Math.round(buffer.byteLength / 1024)} KB) via ${endpoint.desc}`);
                  if (base64.length > melhorTamanho) {
                    melhorTamanho = base64.length;
                    melhorBase64 = base64;
                    melhorEndpoint = `${endpoint.desc} (retry 406)`;
                  }
                  const goodSizeBytes = isVideo ? 100000 : 5000;
                  if (buffer.byteLength >= goodSizeBytes) {
                    console.log(`🔗 ========================================\n`);
                    return melhorBase64;
                  }
                }
              }
            }
          } catch (retryErr) {
            console.log(`🔗 ❌ Retry falhou: ${retryErr.message}`);
          }
        } else {
          const errText = await response.text().catch(() => '');
          console.log(`🔗 ❌ HTTP ${response.status}: ${errText.substring(0, 200)}`);
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          if (!endpoint.desc.includes('FILES')) {
            console.log(`🔗 ❌ Timeout`);
          }
        } else {
          console.log(`🔗 ❌ Erro: ${e.message}`);
        }
      }
    }

    // Se já encontrou algo aceitável (mesmo que não ideal), para de tentar
    if (melhorBase64) {
      const estimatedBytes = Math.round(melhorTamanho * 0.75);
      if (estimatedBytes >= minAcceptBytes) {
        console.log(`🔗 ✅ Melhor resultado da rodada ${round + 1}: ~${Math.round(estimatedBytes / 1024)} KB via ${melhorEndpoint}`);
        if (!isVideo || estimatedBytes >= 100000) {
          break;
        }
        console.log(`🔗 ⚠️ Vídeo muito pequeno (~${Math.round(estimatedBytes / 1024)} KB) - tentando próxima rodada para melhor qualidade`);
      }
    }
  }

  // ⭐⭐⭐ v7.7: RETRY FINAL AGRESSIVO para vídeo - espera 15s e tenta 2x ⭐⭐⭐
  if (isVideo && (!melhorBase64 || Math.round(melhorTamanho * 0.75) < 100000)) {
    for (let finalRetry = 0; finalRetry < 2; finalRetry++) {
      const waitTime = (finalRetry + 1) * 10000; // 10s, 20s
      console.log(`🔗 🔄 RETRY FINAL ${finalRetry + 1}/2: Aguardando ${waitTime / 1000}s e tentando endpoint principal...`);
      await new Promise((r) => setTimeout(r, waitTime));

      const retryUrl = `${serverUrl}/api/sessions/${sessionName}/messages/${encodedMessageId}/media`;
      try {
        const retryResponse = await fetch(retryUrl, {
          method: 'GET',
          headers: getHeadersForGet()
        });
        console.log(`🔗 RETRY FINAL Status: ${retryResponse.status}`);
        if (retryResponse.ok) {
          const contentType = retryResponse.headers.get('content-type') || '';
          const contentLength = retryResponse.headers.get('content-length');
          console.log(`🔗 RETRY FINAL Content-Type: ${contentType}, Content-Length: ${contentLength}`);

          if (contentType.includes('video') || contentType.includes('audio') || contentType.includes('octet-stream') || contentType.includes('image')) {
            const buffer = await retryResponse.arrayBuffer();
            const sizeKB = Math.round(buffer.byteLength / 1024);
            console.log(`🔗 RETRY FINAL: ${buffer.byteLength} bytes (~${sizeKB} KB)`);

            if (buffer.byteLength >= minAcceptBytes) {
              const base64 = Buffer.from(buffer).toString('base64');
              if (base64.length > melhorTamanho) {
                melhorTamanho = base64.length;
                melhorBase64 = base64;
                melhorEndpoint = `RETRY FINAL ${finalRetry + 1}`;
              }
              if (buffer.byteLength >= 100000) {
                console.log(`🔗 ✅✅✅ RETRY FINAL SUCESSO! ${buffer.byteLength} bytes (~${sizeKB} KB)`);
                console.log(`🔗 ========================================\n`);
                return melhorBase64;
              }
            }
          }
        }
      } catch (e) {
        console.log(`🔗 ❌ Retry final ${finalRetry + 1} falhou: ${e.message}`);
      }
    }
  }

  if (melhorBase64) {
    const estimatedBytes = Math.round(melhorTamanho * 0.75);
    const sizeKB = Math.round(estimatedBytes / 1024);
    console.log(`🔗 ✅ MELHOR BASE64: ${melhorTamanho} chars (~${sizeKB} KB) via ${melhorEndpoint}`);
    if (isVideo && sizeKB < 100) {
      console.log(`🔗 ⚠️⚠️⚠️ ATENÇÃO: Vídeo muito pequeno (~${sizeKB} KB) - PROVAVELMENTE É THUMBNAIL OU FRAGMENTO!`);
      console.log(`🔗 💡 O WAHA pode não ter terminado de processar. Verifique se media.download=true na config da sessão.`);
    } else if (sizeKB < 30 && !isAudio) {
      console.log(`🔗 ⚠️ ATENÇÃO: Tamanho pequeno (~${sizeKB} KB) - pode ser thumbnail!`);
    }
    console.log(`🔗 ========================================\n`);
    return melhorBase64;
  }

  console.log(`🔗 ❌ Nenhum endpoint retornou mídia válida (mínimo: ${Math.round(minAcceptBytes / 1024)} KB)`);
  console.log(`🔗 💡 Teste manual: curl -H "x-api-key: SUA_KEY" ${serverUrl}/api/sessions/${sessionName}/messages/MESSAGE_ID/media --output video.mp4`);
  console.log(`🔗 💡 Verifique se media.download=true na configuração da sessão WAHA`);
  console.log(`🔗 ========================================\n`);
  return null;
}

// ⭐⭐⭐ NOVO v10.0: Buscar pacienteId real pelo chatId (de mensagens anteriores) ⭐⭐⭐
async function buscarPacienteIdPorChatId(clinicaId, chatId) {
  if (!clinicaId || !chatId) return null;
  try {
    const db = getClinicaDB(clinicaId);

    // ⭐ Migração: adiciona coluna chatId se não existir
    await new Promise((r) => db.run(`ALTER TABLE mensagens ADD COLUMN chatId TEXT`, () => r()));

    // Busca a mensagem mais recente com este chatId que tenha um pacienteId REAL (não tel_...)
    // Busca em chatId E whatsappChatId (compatibilidade com dados antigos)
    const row = await new Promise((r) => db.get(
      `SELECT pacienteId, pacienteNome FROM mensagens 
       WHERE clinicaId = ? AND (chatId = ? OR whatsappChatId = ?) AND pacienteId IS NOT NULL 
         AND pacienteId != 'desconhecido' AND pacienteId NOT LIKE 'tel_%'
       ORDER BY dataHora DESC LIMIT 1`,
      [clinicaId, chatId, chatId],
      (err, row) => {
        if (err) {
          // Se whatsappChatId não existe, tenta só com chatId
          db.get(
            `SELECT pacienteId, pacienteNome FROM mensagens 
             WHERE clinicaId = ? AND chatId = ? AND pacienteId IS NOT NULL 
               AND pacienteId != 'desconhecido' AND pacienteId NOT LIKE 'tel_%'
             ORDER BY dataHora DESC LIMIT 1`,
            [clinicaId, chatId],
            (err2, row2) => r(row2 || null)
          );
        } else {
          r(row || null);
        }
      }
    ));
    if (row) {
      console.log(`🔗 [buscarPacienteIdPorChatId] chatId ${chatId} → pacienteId ${row.pacienteId} (${row.pacienteNome})`);
      return { pacienteId: row.pacienteId, pacienteNome: row.pacienteNome };
    }
    return null;
  } catch (e) {
    console.error(`❌ [buscarPacientePorWhatsAppChatId] Erro: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ NOVO v10.0: Garantir tabela de diálogos WhatsApp ⭐⭐⭐
async function garantirTabelaDialogos(db) {
  return new Promise((resolve) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS dialogos_whatsapp (
        id TEXT PRIMARY KEY,
        clinicaId TEXT NOT NULL,
        chatId TEXT NOT NULL,
        pacienteId TEXT,
        pacienteNome TEXT,
        status TEXT NOT NULL DEFAULT 'pendente',
        criadoEm TEXT NOT NULL,
        fechadoEm TEXT
      )
    `, () => resolve());
  });
}

// ⭐⭐⭐ NOVO v10.0 / FIX v12.5: Buscar diálogo ativo (pendente OU enviado) por chatId ⭐⭐⭐
async function buscarDialogoAtivo(clinicaId, chatId) {
  if (!clinicaId || !chatId) return null;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaDialogos(db);
    const row = await new Promise((r) => db.get(
      `SELECT * FROM dialogos_whatsapp WHERE clinicaId = ? AND chatId = ? AND status IN ('pendente', 'enviado') ORDER BY criadoEm DESC LIMIT 1`,
      [clinicaId, chatId],
      (err, row) => r(row || null)
    ));
    return row;
  } catch (e) {
    console.error(`❌ [buscarDialogoAtivo] Erro: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ NOVO v10.0 / FIX v12.5: Abrir diálogo (status = pendente) ⭐⭐⭐
// Ao abrir novo diálogo, TODOS os anteriores (pendente OU enviado) ficam "fechado"
async function abrirDialogo(clinicaId, chatId, pacienteId, pacienteNome) {
  if (!clinicaId || !chatId) return null;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaDialogos(db);

    // ⭐⭐⭐ FIX v12.5: Fecha diálogos anteriores com status 'pendente' OU 'enviado' ⭐⭐⭐
    const fechadosCount = await new Promise((r) => db.run(
      `UPDATE dialogos_whatsapp SET status = 'fechado', fechadoEm = ? WHERE clinicaId = ? AND chatId = ? AND status IN ('pendente', 'enviado')`,
      [new Date().toISOString(), clinicaId, chatId],
      function () {r(this.changes || 0);}
    ));
    if (fechadosCount > 0) {
      console.log(`📋 [abrirDialogo] ${fechadosCount} diálogo(s) anterior(es) fechado(s) para chatId ${chatId}`);
    }

    const id = `dlg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await new Promise((r) => db.run(
      `INSERT INTO dialogos_whatsapp (id, clinicaId, chatId, pacienteId, pacienteNome, status, criadoEm) VALUES (?, ?, ?, ?, ?, 'pendente', ?)`,
      [id, clinicaId, chatId, pacienteId || null, pacienteNome || null, now],
      () => r()
    ));

    console.log(`📋 [abrirDialogo] Diálogo aberto: ${id} para chatId ${chatId} (${pacienteNome || 'Desconhecido'}) → status: pendente`);
    return id;
  } catch (e) {
    console.error(`❌ [abrirDialogo] Erro: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ NOVO v10.0 / FIX v12.5: Fechar diálogo (status = fechado) ⭐⭐⭐
// Fecha diálogos com status 'pendente' OU 'enviado' → ambos viram 'fechado'
async function fecharDialogo(clinicaId, chatId) {
  if (!clinicaId || !chatId) return false;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaDialogos(db);
    const now = new Date().toISOString();
    await new Promise((r) => db.run(
      `UPDATE dialogos_whatsapp SET status = 'fechado', fechadoEm = ? WHERE clinicaId = ? AND chatId = ? AND status IN ('pendente', 'enviado')`,
      [now, clinicaId, chatId],
      () => r()
    ));
    console.log(`📋 [fecharDialogo] Diálogo fechado para chatId ${chatId}`);
    return true;
  } catch (e) {
    console.error(`❌ [fecharDialogo] Erro: ${e.message}`);
    return false;
  }
}

// ⭐⭐⭐ NOVO v12.5: Marcar diálogo como "enviado" (resposta enviada ao paciente) ⭐⭐⭐
// Quando o bot envia uma resposta dentro de um diálogo ativo, muda de "pendente" → "enviado"
async function marcarDialogoEnviado(clinicaId, chatId) {
  if (!clinicaId || !chatId) return false;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaDialogos(db);
    await new Promise((r) => db.run(
      `UPDATE dialogos_whatsapp SET status = 'enviado' WHERE clinicaId = ? AND chatId = ? AND status = 'pendente'`,
      [clinicaId, chatId],
      function () {
        if (this.changes > 0) {
          console.log(`📋 [marcarDialogoEnviado] Diálogo marcado como 'enviado' para chatId ${chatId}`);
        }
        r();
      }
    ));
    return true;
  } catch (e) {
    console.error(`❌ [marcarDialogoEnviado] Erro: ${e.message}`);
    return false;
  }
}

// ⭐⭐⭐ NOVO v10.0 / FIX v12.5: Atualizar pacienteId no diálogo ativo ⭐⭐⭐
async function atualizarDialogoPaciente(clinicaId, chatId, pacienteId, pacienteNome) {
  if (!clinicaId || !chatId || !pacienteId) return false;
  try {
    const db = getClinicaDB(clinicaId);
    await new Promise((r) => db.run(
      `UPDATE dialogos_whatsapp SET pacienteId = ?, pacienteNome = ? WHERE clinicaId = ? AND chatId = ? AND status IN ('pendente', 'enviado')`,
      [pacienteId, pacienteNome || null, clinicaId, chatId],
      () => r()
    ));
    return true;
  } catch (e) {return false;}
}

// ⭐⭐⭐ NOVO v10.4: Buscar mensagem pendente pelo chatId (diálogo em aberto) ⭐⭐⭐
async function buscarMensagemPendente(clinicaId, chatId) {
  if (!clinicaId || !chatId) return null;
  try {
    const db = getClinicaDB(clinicaId);

    // ⭐⭐⭐ FIX v10.6: Garante que a coluna fechadoEm existe ⭐⭐⭐
    await new Promise((r) => db.run(`ALTER TABLE mensagens ADD COLUMN fechadoEm TEXT`, () => r()));

    // ⭐⭐⭐ FIX v10.7: Busca por chatId EXATO primeiro ⭐⭐⭐
    let row = await new Promise((r) => db.get(
      `SELECT * FROM mensagens 
       WHERE clinicaId = ? AND chatId = ? AND status = 'pendente' 
       ORDER BY dataHora DESC LIMIT 1`,
      [clinicaId, chatId],
      (err, row) => r(row || null)
    ));

    if (row) return row;

    // ⭐⭐⭐ FIX v10.7: Se não encontrou por chatId exato, busca por pacienteId ⭐⭐⭐
    // Isso cobre o caso onde a mensagem foi enviada com telefone (5561999999999@c.us)
    // mas o paciente respondeu via LID (185224809992420@lid)
    // Busca a mensagem pendente mais recente para o MESMO paciente
    const chatIdLimpo = chatId.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
    const ultimos9 = chatIdLimpo.slice(-9);

    // Tenta buscar pelo paciente que tem este chatId/telefone
    row = await new Promise((r) => db.get(
      `SELECT m.* FROM mensagens m
       INNER JOIN (
         SELECT pacienteId FROM mensagens 
         WHERE clinicaId = ? AND chatId = ? AND pacienteId IS NOT NULL AND pacienteId != 'desconhecido'
         ORDER BY dataHora DESC LIMIT 1
       ) recent ON m.pacienteId = recent.pacienteId
       WHERE m.clinicaId = ? AND m.status = 'pendente' AND m.tipo = 'enviada'
       ORDER BY m.dataHora DESC LIMIT 1`,
      [clinicaId, chatId, clinicaId],
      (err, row) => {
        if (err) {
          console.log(`📋 [buscarMensagemPendente] Erro na busca por paciente: ${err.message}`);
          r(null);
        } else {
          r(row || null);
        }
      }
    ));

    if (row) {
      console.log(`📋 [buscarMensagemPendente] ✅ Encontrada via pacienteId (chatId diferente): msg ${row.id} para ${row.pacienteNome}`);
      return row;
    }

    // ⭐⭐⭐ FIX v10.7: Último recurso - busca por pacienteId via tabela pacientes (whatsappChatId) ⭐⭐⭐
    const pacienteViaChat = await new Promise((r) => db.get(
      `SELECT id FROM pacientes WHERE whatsappChatId = ? LIMIT 1`,
      [chatId],
      (err, row) => r(row || null)
    ));

    if (pacienteViaChat) {
      row = await new Promise((r) => db.get(
        `SELECT * FROM mensagens 
         WHERE clinicaId = ? AND pacienteId = ? AND status = 'pendente' AND tipo = 'enviada'
         ORDER BY dataHora DESC LIMIT 1`,
        [clinicaId, pacienteViaChat.id],
        (err, row) => r(row || null)
      ));

      if (row) {
        console.log(`📋 [buscarMensagemPendente] ✅ Encontrada via whatsappChatId→pacienteId: msg ${row.id} para ${row.pacienteNome}`);
        return row;
      }
    }

    return null;
  } catch (e) {
    console.error(`❌ [buscarMensagemPendente] Erro: ${e.message}`);
    return null;
  }
}

// ⭐⭐⭐ NOVO v10.4: Fechar todas as mensagens pendentes de um chatId (diálogo concluído) ⭐⭐⭐
async function fecharMensagensPendentes(clinicaId, chatId) {
  if (!clinicaId || !chatId) return false;
  try {
    const db = getClinicaDB(clinicaId);

    // ⭐⭐⭐ FIX v10.6: Garante que a coluna fechadoEm existe ANTES do UPDATE ⭐⭐⭐
    await new Promise((r) => db.run(`ALTER TABLE mensagens ADD COLUMN fechadoEm TEXT`, () => r()));

    const now = new Date().toISOString();

    // ⭐⭐⭐ FIX v10.7: Fecha por chatId EXATO ⭐⭐⭐
    let totalFechadas = 0;
    const result1 = await new Promise((r) => db.run(
      `UPDATE mensagens SET status = 'fechado', fechadoEm = ? WHERE clinicaId = ? AND chatId = ? AND status = 'pendente'`,
      [now, clinicaId, chatId],
      function (err) {
        if (err) {
          console.error(`❌ [fecharMensagensPendentes] Erro SQL (chatId): ${err.message}`);
          r(0);
        } else {
          r(this.changes);
        }
      }
    ));
    totalFechadas += result1;

    // ⭐⭐⭐ FIX v10.7: TAMBÉM fecha por pacienteId (cobre mismatch chatId vs LID) ⭐⭐⭐
    // Busca o pacienteId associado a este chatId
    const pacienteInfo = await new Promise((r) => db.get(
      `SELECT pacienteId FROM mensagens WHERE clinicaId = ? AND chatId = ? AND pacienteId IS NOT NULL AND pacienteId != 'desconhecido' ORDER BY dataHora DESC LIMIT 1`,
      [clinicaId, chatId],
      (err, row) => r(row || null)
    ));

    if (pacienteInfo && pacienteInfo.pacienteId) {
      const result2 = await new Promise((r) => db.run(
        `UPDATE mensagens SET status = 'fechado', fechadoEm = ? WHERE clinicaId = ? AND pacienteId = ? AND status = 'pendente'`,
        [now, clinicaId, pacienteInfo.pacienteId],
        function (err) {
          if (err) {
            console.error(`❌ [fecharMensagensPendentes] Erro SQL (pacienteId): ${err.message}`);
            r(0);
          } else {
            r(this.changes);
          }
        }
      ));
      totalFechadas += result2;
    }

    // Também tenta via whatsappChatId na tabela pacientes
    const pacienteViaChatId = await new Promise((r) => db.get(
      `SELECT id FROM pacientes WHERE whatsappChatId = ? LIMIT 1`,
      [chatId],
      (err, row) => r(row || null)
    ));

    if (pacienteViaChatId && pacienteViaChatId.id) {
      const result3 = await new Promise((r) => db.run(
        `UPDATE mensagens SET status = 'fechado', fechadoEm = ? WHERE clinicaId = ? AND pacienteId = ? AND status = 'pendente'`,
        [now, clinicaId, pacienteViaChatId.id],
        function (err) {
          if (err) r(0);else
          r(this.changes);
        }
      ));
      totalFechadas += result3;
    }

    console.log(`📋 [fecharMensagensPendentes] ${totalFechadas} mensagem(ns) fechada(s) para chatId ${chatId}`);
    return totalFechadas > 0;
  } catch (e) {
    console.error(`❌ [fecharMensagensPendentes] Erro: ${e.message}`);
    return false;
  }
}

// ==================== EXPORTS ====================
module.exports = {
  fetch,
  getClinicaDB,
  dbGlobal,
  WHATSAPP_MODULE_VERSION,
  WHATSAPP_MODULE_BUILD,
  UF_DDD_MAP,
  normalizarTelefoneComDDD,
  buscarUfClinica,
  ultimosWebhooks,
  MAX_WEBHOOKS_DEBUG,
  getWahaApiKey,
  getWahaHeaders,
  cleanUrl,
  enviarMensagemRobusta,
  enviarLocalizacao,
  geocodificarEndereco,
  // Maps
  conversasAguardandoMotivo,
  dialogosAjuda,
  dialogosIdentificacao,
  pacientesIdentificados,
  midiasPendentes,
  lidCache,
  dialogosFoto,
  mensagensProcessadas,
  cooldownConfirmacao,
  // Constants
  TEMPO_EXPIRACAO_DUPLICATA,
  TEMPO_EXPIRACAO_IDENTIFICACAO,
  TEMPO_EXPIRACAO_AJUDA,
  TEMPO_EXPIRACAO_MOTIVO,
  TEMPO_COOLDOWN_CONFIRMACAO,
  PADROES_CONFIRMACAO,
  PADROES_CANCELAMENTO,
  // ⭐⭐⭐ FIX v10.9: Funções de matching fuzzy ⭐⭐⭐
  normalizarTextoParaMatching,
  matchConfirmacao,
  matchCancelamento,
  // DB functions
  buscarConsultaAguardandoConfirmacao,
  garantirTabelaSolicitacoes,
  criarSolicitacao,
  buscarSolicitacaoPendente,
  buscarSolicitacaoPendentePorPacienteId,
  buscarUltimaClassificacaoDocumento,
  marcarSolicitacaoRecebida,
  cancelarSolicitacao,
  getApiKeyForClinica,
  buscarClinicaPorChatId,
  buscarClinicaPorSession,
  buscarTodasClinicasPorSession,
  // ⭐⭐⭐ NOVO v10.0 / FIX v12.5: Funções de diálogo e chatId ⭐⭐⭐
  buscarPacienteIdPorChatId,
  garantirTabelaDialogos,
  buscarDialogoAtivo,
  abrirDialogo,
  fecharDialogo,
  marcarDialogoEnviado,
  atualizarDialogoPaciente,
  // ⭐⭐⭐ NOVO v10.3: Funções de WhatsApp chatId no paciente ⭐⭐⭐
  buscarPacientePorWhatsAppChatId,
  salvarWhatsAppChatId,
  // ⭐⭐⭐ NOVO v10.4: Funções de mensagem pendente (diálogo em aberto) ⭐⭐⭐
  buscarMensagemPendente,
  fecharMensagensPendentes,
  // ⭐⭐⭐ FIX v19.0: Limpa todos os diálogos ao iniciar novo ⭐⭐⭐
  limparTodosDialogosUsuario,
  // Helpers
  formatarData,
  isMensagemDoBot,
  salvarMensagemHistorico,
  atualizarMensagemHistorico,
  // Media
  salvarFotoPaciente,
  salvarDocumentoPaciente,
  salvarMidiaRecebida,
  baixarMidia,
  baixarMidiaViaWaha
};