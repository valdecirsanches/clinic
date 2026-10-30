// ==================== WEBHOOK HANDLER DO WHATSAPP ====================
// Extraído cirurgicamente de whatsapp.js v9.8.0 - PRESERVANDO TODO O CÓDIGO ORIGINAL
// VERSÃO: 9.8.0 - 2026-03-05

const express = require('express');
const router = express.Router();

const shared = require('./whatsapp-shared');
const {
  fetch, getClinicaDB, dbGlobal,
  WHATSAPP_MODULE_VERSION, WHATSAPP_MODULE_BUILD,
  ultimosWebhooks, MAX_WEBHOOKS_DEBUG,
  cleanUrl, getWahaApiKey, getWahaHeaders, enviarMensagemRobusta,
  enviarLocalizacao, geocodificarEndereco,
  conversasAguardandoMotivo, dialogosAjuda, dialogosFoto,
  dialogosIdentificacao, pacientesIdentificados, midiasPendentes,
  lidCache, mensagensProcessadas, cooldownConfirmacao,
  TEMPO_EXPIRACAO_DUPLICATA, TEMPO_EXPIRACAO_IDENTIFICACAO,
  TEMPO_EXPIRACAO_AJUDA, TEMPO_EXPIRACAO_MOTIVO, TEMPO_COOLDOWN_CONFIRMACAO,
  PADROES_CONFIRMACAO, PADROES_CANCELAMENTO,
  // ⭐⭐⭐ FIX v10.9: Importa funções de matching fuzzy ⭐⭐⭐
  matchConfirmacao, matchCancelamento,
  buscarConsultaAguardandoConfirmacao,
  criarSolicitacao, buscarSolicitacaoPendente, buscarSolicitacaoPendentePorPacienteId, buscarUltimaClassificacaoDocumento, marcarSolicitacaoRecebida,
  buscarClinicaPorChatId, buscarClinicaPorSession, buscarTodasClinicasPorSession,
  formatarData, isMensagemDoBot,
  salvarMensagemHistorico,
  salvarFotoPaciente, salvarDocumentoPaciente, salvarMidiaRecebida,
  baixarMidia, baixarMidiaViaWaha,
  buscarPacienteIdPorChatId,
  buscarDialogoAtivo, abrirDialogo, fecharDialogo, marcarDialogoEnviado, atualizarDialogoPaciente,
  buscarPacientePorWhatsAppChatId, salvarWhatsAppChatId,
  buscarMensagemPendente, fecharMensagensPendentes,
  limparTodosDialogosUsuario
} = shared;

// ==================== WEBHOOK - RECEBE MENSAGENS DO WAHA ====================

// ⭐⭐⭐ Helper: data/hora ATUAL do cancelamento no fuso do Brasil (America/Sao_Paulo) ⭐⭐⭐
// Retorna { dataCancelamento: 'YYYY-MM-DD', horaCancelamento: 'HH:MM' } — os mesmos
// formatos usados no cancelamento manual, para o card da agenda exibir corretamente.
// (Antes esta função era chamada mas nunca definida, quebrando o fluxo de cancelamento.)
function agoraCancelamentoBR() {
  const agora = new Date();
  const tz = 'America/Sao_Paulo';
  let dataCancelamento;
  let horaCancelamento;
  try {
    // Data no formato YYYY-MM-DD via en-CA (que já usa hífens nessa ordem)
    dataCancelamento = agora.toLocaleDateString('en-CA', { timeZone: tz });
    horaCancelamento = agora.toLocaleTimeString('pt-BR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    // Ambiente Node sem ICU completo pode não aceitar timeZone → fallback sem TZ,
    // para NUNCA deixar a data/hora vazia (era um dos motivos de não gravar).
    dataCancelamento = agora.toLocaleDateString('en-CA');
    horaCancelamento = agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return { dataCancelamento, horaCancelamento };
}

// ⭐⭐⭐ Gravação BEST-EFFORT de TODOS os metadados de cancelamento. ⭐⭐⭐
// (dataCancelamento, horaCancelamento, canceladoPor, canalCancelamento)
//
// CAUSA-RAIZ do bug "data/hora não chega ao banco": antes a data/hora eram gravadas
// na MESMA instrução SQL que mudava o status para 'cancelada'. Em MySQL, se QUALQUER
// dessas colunas ainda não existisse na tabela da clínica no instante do webhook,
// o UPDATE INTEIRO falhava — e, como o erro só era logado, NADA era gravado (nem a
// data, nem às vezes o status). Solução: o status é gravado à parte (só com colunas
// garantidas) e os metadados de cancelamento vão AQUI, num UPDATE separado que:
//   1) tenta gravar as 4 colunas;
//   2) se uma coluna não existir, faz ALTER TABLE (auto-cura) e tenta UMA vez de novo;
//   3) NUNCA propaga erro (best-effort), então a data/hora sempre é persistida assim
//      que as colunas passam a existir, sem depender de nenhuma migração externa.
function gravarMetadadosCancelamento(db, id, opts = {}) {
  const {
    por = 'Paciente',
    canal = 'WhatsApp',
    data = null, // 'YYYY-MM-DD'
    hora = null // 'HH:MM'
  } = opts;
  return new Promise((resolve) => {
    // Lista dos campos a gravar, cada um com seu tipo de coluna. Só entram os
    // campos fornecidos (data/hora podem ser omitidos quando o chamador só quer
    // registrar a proveniência).
    const campos = [
    { col: 'canceladoPor', tipo: 'VARCHAR(60)', valor: por },
    { col: 'canalCancelamento', tipo: 'VARCHAR(40)', valor: canal }];

    if (data != null) campos.push({ col: 'dataCancelamento', tipo: 'VARCHAR(20)', valor: data });
    if (hora != null) campos.push({ col: 'horaCancelamento', tipo: 'VARCHAR(10)', valor: hora });

    // ⭐ Garante TODAS as 4 colunas ANTES de qualquer gravação (ALTER idempotente;
    // erros como "coluna já existe" são ignorados). Assim não dependemos do texto
    // do erro do driver — as colunas passam a existir de forma proativa.
    const garantirColunas = (cb) => {
      db.run(`ALTER TABLE consultas ADD COLUMN dataCancelamento VARCHAR(20)`, () => {
        db.run(`ALTER TABLE consultas ADD COLUMN horaCancelamento VARCHAR(10)`, () => {
          db.run(`ALTER TABLE consultas ADD COLUMN canceladoPor VARCHAR(60)`, () => {
            db.run(`ALTER TABLE consultas ADD COLUMN canalCancelamento VARCHAR(40)`, () => cb());
          });
        });
      });
    };

    // ⭐ Fallback à prova de falhas: grava CADA coluna em seu próprio UPDATE, de
    // forma independente. Se uma coluna específica der problema, as OUTRAS ainda
    // são gravadas — a data/hora nunca são bloqueadas por outro campo.
    const gravarCadaColuna = () => {
      let pendentes = campos.length;
      if (pendentes === 0) return resolve();
      campos.forEach(({ col, valor }) => {
        db.run(`UPDATE consultas SET ${col} = ? WHERE id = ?`, [valor, id], function (err) {
          if (err) console.log(`📅 ⚠️ [META-CANCEL] Falha ao gravar ${col}: ${err.message}`);else
          console.log(`📅 ✅ [META-CANCEL] ${col}="${valor}" na consulta ${id} (changes=${this?.changes ?? 'N/A'})`);
          if (--pendentes === 0) resolve();
        });
      });
    };

    // 1) Garante as colunas. 2) Tenta o UPDATE combinado (rápido). 3) Se falhar por
    //    qualquer motivo, cai no fallback coluna-a-coluna (best-effort).
    garantirColunas(() => {
      const sets = campos.map((c) => `${c.col} = ?`);
      const params = campos.map((c) => c.valor);
      params.push(id);
      const sql = `UPDATE consultas SET ${sets.join(', ')} WHERE id = ?`;
      try {
        db.run(sql, params, function (err) {
          if (err) {
            console.log(`📅 ⚠️ [META-CANCEL] UPDATE combinado falhou (${err.message}) → gravando coluna a coluna`);
            gravarCadaColuna();
            return;
          }
          console.log(`📅 ✅ [META-CANCEL] consulta ${id} → data=${data ?? '-'} hora=${hora ?? '-'} canal=${canal} por=${por} (changes=${this?.changes ?? 'N/A'})`);
          resolve();
        });
      } catch (e) {
        gravarCadaColuna();
      }
    });
  });
}

// Compat: mantém a assinatura antiga (só proveniência) usada em pontos que não têm
// a data/hora à mão. Encaminha para o helper unificado.
function gravarProvenienciaCancelamento(db, id, por = 'Paciente', canal = 'WhatsApp') {
  return gravarMetadadosCancelamento(db, id, { por, canal });
}

// ⭐⭐⭐ FIX v23.1: Helper para buscar nome correto do paciente pela tabela pacientes ⭐⭐⭐
// Quando consultas.pacienteNome está NULL (ex: dados importados sem esse campo),
// busca o nome real na tabela pacientes usando o pacienteId da consulta.
async function buscarNomePacientePorId(db, pacienteId) {
  if (!pacienteId) return null;
  try {
    const row = await new Promise((r) => db.get(
      `SELECT nome FROM pacientes WHERE id = ?`,
      [pacienteId],
      (err, row) => r(err ? null : row)
    ));
    return row?.nome || null;
  } catch (e) {
    return null;
  }
}

// ⭐⭐⭐ FIX v23.1: Resolve o nome correto do paciente com 3 fontes (consulta > pacientes table > telefone) ⭐⭐⭐
async function resolverNomePaciente(db, consulta, nomeFallbackTelefone) {
  // 1. Nome da consulta (mais direto)
  if (consulta.pacienteNome && consulta.pacienteNome.trim()) {
    return consulta.pacienteNome.trim();
  }
  // 2. Busca na tabela pacientes pelo pacienteId da consulta (confiável)
  const nomeDaTabela = await buscarNomePacientePorId(db, consulta.pacienteId);
  if (nomeDaTabela) {
    console.log(`📅 [FIX v23.1] pacienteNome vazio na consulta ${consulta.id}, buscou na tabela pacientes: "${nomeDaTabela}"`);
    return nomeDaTabela;
  }
  // 3. Último recurso: nome da busca por telefone (pode ser errado se múltiplos pacientes compartilham telefone)
  console.log(`📅 [FIX v23.1] ⚠️ Não encontrou nome na tabela pacientes para pacienteId=${consulta.pacienteId}, usando fallback telefone: "${nomeFallbackTelefone}"`);
  return nomeFallbackTelefone || 'Paciente';
}

router.post('/webhook', async (req, res) => {
  // Responde imediatamente para o WAHA não dar timeout
  res.status(200).json({ received: true });

  const body = req.body;

  // ⭐ Armazena para debug
  ultimosWebhooks.unshift({
    timestamp: new Date().toISOString(),
    event: body.event || 'unknown',
    from: body.payload?.from || body.from || 'unknown',
    hasMedia: !!(body.payload?.hasMedia || body.payload?.mediaUrl),
    bodyKeys: Object.keys(body),
    payloadKeys: body.payload ? Object.keys(body.payload) : []
  });
  if (ultimosWebhooks.length > MAX_WEBHOOKS_DEBUG) ultimosWebhooks.pop();

  try {
    const event = body.event || '';
    const payload = body.payload || body;

    // Ignora eventos que não são mensagens
    if (!event.includes('message') && event !== '' && !event.includes('msg')) {
      console.log(`📩 [webhook] Evento ignorado: ${event}`);

      // ⭐⭐⭐ FIX v21.1: Auto-reconfigura webhook se só recebe session.status ⭐⭐⭐
      // Se recebemos session.status mas nunca recebemos mensagens, o webhook pode estar
      // configurado sem eventos de mensagem. Tenta reconfigurar automaticamente.
      if (event === 'session.status' && body.session) {
        const sessionId = body.session;
        const cacheKey = `webhook_reconfig_${sessionId}`;
        const lastReconfig = global[cacheKey] || 0;
        const RECONFIG_INTERVAL = 5 * 60 * 1000; // Máximo 1 vez a cada 5 minutos

        if (Date.now() - lastReconfig > RECONFIG_INTERVAL) {
          global[cacheKey] = Date.now();
          console.log(`🔔 [FIX v21.1] session.status recebido para "${sessionId}" — verificando se webhook tem eventos de mensagem...`);

          try {
            const clinicaInfo = await buscarClinicaPorSession(sessionId);
            if (clinicaInfo && clinicaInfo.config) {
              const cfg = clinicaInfo.config;
              const srvUrl = cleanUrl(cfg.serverUrl || cfg.wahaUrl || '');
              const wahaApiKey = getWahaApiKey();

              if (srvUrl) {
                // Verifica configuração atual do webhook no WAHA
                const headers = getWahaHeaders(wahaApiKey);
                const checkUrl = `${srvUrl}/api/sessions/${sessionId}`;
                const checkResp = await fetch(checkUrl, { method: 'GET', headers });

                if (checkResp.ok) {
                  const sessionData = await checkResp.json();
                  const webhooks = sessionData.config?.webhooks || [];
                  const hasMessageEvents = webhooks.some((w) =>
                  w.events && (w.events.includes('message') || w.events.includes('message.any'))
                  );

                  if (!hasMessageEvents) {
                    console.log(`🔔 [FIX v21.1] ⚠️ Webhook SEM eventos de mensagem! Reconfigurando...`);
                    const host = req.get('host');
                    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
                    const webhookUrl = host && !host.includes('localhost') ?
                    `https://${host}/api/webhook/whatsapp` :
                    `${protocol}://${host}/api/webhook/whatsapp`;

                    // Tenta PUT para reconfigurar com todos os eventos
                    const putResp = await fetch(`${srvUrl}/api/sessions/${sessionId}`, {
                      method: 'PUT',
                      headers,
                      body: JSON.stringify({
                        config: {
                          webhooks: [{
                            url: webhookUrl,
                            events: ['message', 'message.any', 'session.status']
                          }]
                        }
                      })
                    });

                    if (putResp.ok) {
                      console.log(`🔔 [FIX v21.1] ✅ Webhook reconfigurado com eventos de mensagem!`);
                    } else {
                      console.log(`🔔 [FIX v21.1] ❌ Falha ao reconfigurar: ${putResp.status}`);
                    }
                  } else {
                    console.log(`🔔 [FIX v21.1] ✅ Webhook já tem eventos de mensagem configurados`);
                  }
                }
              }
            }
          } catch (e21) {
            console.log(`🔔 [FIX v21.1] ⚠️ Erro ao verificar/reconfigurar webhook: ${e21.message}`);
          }
        }
      }

      return;
    }

    // Extrai dados da mensagem
    const from = payload.from || payload.chatId || payload.key?.remoteJid || '';
    const messageId = payload.id || payload.key?.id || payload._data?.id?.id || `evt_${Date.now()}`;
    const isFromMe = payload.fromMe || payload.key?.fromMe || false;
    const msgType = payload.type || payload.messageType || 'chat';
    const text = payload.body || payload.text || payload.message?.conversation || payload.message?.extendedTextMessage?.text || '';
    const hasMedia = payload.hasMedia || !!(payload.mediaUrl || payload.media || payload.mediaData);
    const mimetype = payload.mimetype || payload.media?.mimetype || payload.messageMedia?.mimetype || '';

    // Ignora mensagens enviadas por nós
    if (isFromMe) {
      return;
    }

    // Ignora mensagens do bot
    if (isMensagemDoBot(text)) {
      return;
    }

    // Proteção contra duplicatas
    if (mensagensProcessadas.has(messageId)) {
      return;
    }
    mensagensProcessadas.set(messageId, Date.now());

    // Extrai telefone do remetente
    let telefone = from.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');

    // ⭐⭐⭐ FIX v8.8: RESOLVE LID (Linked ID) DO WHATSAPP - FASE 1 (sem API) ⭐⭐⭐
    // LIDs são IDs internos do WhatsApp (ex: 185224809992420@lid) que NÃO são números de telefone.
    const isLid = from.includes('@lid');

    if (isLid) {
      const lidNumber = telefone; // já foi limpo acima
      console.log(`📩 ⚠️ MENSAGEM VIA LID DETECTADA: ${lidNumber}`);

      let realPhone = null;

      // 1. Verifica cache de LID
      if (lidCache.has(lidNumber)) {
        realPhone = lidCache.get(lidNumber);
        console.log(`📩 ✅ LID resolvido via CACHE: ${lidNumber} → ${realPhone}`);
      }

      // 2. Tenta extrair do payload (participant, author, etc.)
      if (!realPhone) {
        const possibleSources = [
        payload.participant,
        payload._data?.participant,
        payload._data?.author,
        payload._data?.from,
        payload.chat?.id];


        for (const source of possibleSources) {
          if (source && typeof source === 'string') {
            const cleaned = source.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
            if (cleaned.length >= 10 && cleaned.length <= 13 && cleaned !== lidNumber) {
              realPhone = cleaned;
              lidCache.set(lidNumber, realPhone);
              console.log(`📩 ✅ LID resolvido via payload (${source.substring(0, 30)}): ${lidNumber} → ${realPhone}`);
              break;
            }
          }
        }
      }

      if (realPhone) {
        telefone = realPhone;
      } else {
        console.log(`📩 ⚠️ LID ${lidNumber} não resolvido na Fase 1 - tentará Fase 2 após buscar clínica`);
      }
    } else {
      // Atualiza cache de LID para mensagens normais @c.us
      if (from.includes('@c.us') && telefone) {
        const possibleLid = payload._data?.author || payload._data?.participant || '';
        if (possibleLid && possibleLid.includes('@lid')) {
          const lidNum = possibleLid.replace('@lid', '').replace(/\D/g, '');
          lidCache.set(lidNum, telefone);
          console.log(`📩 LID cache atualizado: ${lidNum} → ${telefone}`);
        }
      }
    }

    // Remove prefixo 55 para busca
    let telLimpo = telefone;
    if (telLimpo.startsWith('55') && telLimpo.length > 11) {
      telLimpo = telLimpo.substring(2);
    }

    console.log(`\n📩📩📩 [webhook] ========================================`);
    console.log(`📩 Evento: ${event}`);
    console.log(`📩 De: ${from} → Tel: ${telefone} (limpo: ${telLimpo})${isLid ? ' [LID]' : ''}`);
    console.log(`📩 Tipo: ${msgType}`);
    console.log(`📩 Texto: ${text ? text.substring(0, 100) : '(sem texto)'}`);
    console.log(`📩 Mídia: ${hasMedia} (mimetype: ${mimetype})`);
    console.log(`📩 MessageId: ${messageId}`);

    // ⭐ Busca a clínica associada a esta sessão
    const sessionId = body.session || payload.session || 'default';
    const clinicaInfo = await buscarClinicaPorSession(sessionId);

    if (!clinicaInfo) {
      console.log(`📩 ❌ Nenhuma clínica encontrada para sessão ${sessionId}`);
      return;
    }

    const { clinicaId, config } = clinicaInfo;
    // ⭐⭐⭐ FIX v9.1: LIMPA serverUrl do banco (pode ter barra final que causa 401) ⭐⭐⭐
    const serverUrl = cleanUrl(config.serverUrl);
    const wahaApiKey = getWahaApiKey();

    console.log(`📩 Clínica: ${clinicaId}, Sessão: ${sessionId}`);

    // ⭐⭐⭐ FIX v21.7: Declara MENU_AJUDA_BLOQUEADO ANTES do processamento de mídia ⭐⭐⭐
    // Bug anterior: `let` na linha do texto criava temporal dead zone — referência na seção de mídia
    // causava ReferenceError que crashava o servidor (520 no Cloudflare).
    let MENU_AJUDA_BLOQUEADO = false;

    // ⭐⭐⭐ FIX v8.8: RESOLVE LID - FASE 2 (com API e banco) ⭐⭐⭐
    if (isLid && telefone === from.replace('@lid', '').replace(/\D/g, '')) {
      // LID ainda não resolvido - tenta com API e banco
      const lidNumber = telefone;
      let realPhone = null;

      // 3. Tenta resolver via WAHA contacts API
      try {
        const contactHeaders = { 'Accept': 'application/json' };
        if (wahaApiKey) contactHeaders['X-Api-Key'] = wahaApiKey;

        const contactUrl = `${serverUrl}/api/contacts?contactId=${encodeURIComponent(from)}&session=${encodeURIComponent(sessionId)}`;
        const contactResp = await fetch(contactUrl, { method: 'GET', headers: contactHeaders }).catch(() => null);
        if (contactResp && contactResp.ok) {
          const contactData = await contactResp.json().catch(() => null);
          if (contactData) {
            const possiblePhone = contactData.number || contactData.id?.replace('@c.us', '') || contactData.jid?.replace('@s.whatsapp.net', '');
            if (possiblePhone) {
              const cleaned = possiblePhone.replace(/\D/g, '');
              if (cleaned.length >= 10 && cleaned !== lidNumber) {
                realPhone = cleaned;
                lidCache.set(lidNumber, realPhone);
                console.log(`📩 ✅ LID resolvido via WAHA API: ${lidNumber} → ${realPhone}`);
              }
            }
          }
        }
      } catch (e) {
        console.log(`📩 ⚠️ Erro ao resolver LID via API: ${e.message}`);
      }

      // 4. Fallback: busca solicitação pendente mais recente
      if (!realPhone) {
        const db2 = getClinicaDB(clinicaId);
        const solicitacaoRecente = await new Promise((r) => db2.get(
          `SELECT telefone, pacienteNome FROM solicitacoes_pendentes 
           WHERE status = 'pendente' AND clinicaId = ?
           ORDER BY criadoEm DESC LIMIT 1`,
          [clinicaId],
          (err, row) => r(row)
        ));

        if (solicitacaoRecente) {
          realPhone = solicitacaoRecente.telefone;
          lidCache.set(lidNumber, realPhone);
          console.log(`📩 ✅ LID resolvido via solicitação pendente: ${lidNumber} → ${realPhone} (${solicitacaoRecente.pacienteNome})`);
        }
      }

      if (realPhone) {
        telefone = realPhone;
        telLimpo = telefone;
        if (telLimpo.startsWith('55') && telLimpo.length > 11) {
          telLimpo = telLimpo.substring(2);
        }
        console.log(`📩 📱 Telefone final (LID resolvido Fase 2): ${telefone} (limpo: ${telLimpo})`);
      } else {
        console.log(`📩 ❌ LID ${lidNumber} NÃO pôde ser resolvido - matching de solicitação vai falhar`);
      }
    }

    // ⭐ Busca paciente pelo telefone
    const db = getClinicaDB(clinicaId);
    const ultimos9 = telLimpo.slice(-9);

    // ⭐⭐⭐ FIX v10.3: BUSCA PACIENTE EM 4 ETAPAS (prioridade: chatId > telefone > mensagens > diálogo) ⭐⭐⭐

    // ETAPA 1: Busca DIRETA pelo whatsappChatId (mais rápida e confiável)
    let paciente = await buscarPacientePorWhatsAppChatId(clinicaId, from);

    // ETAPA 2: Se não encontrou por chatId, busca por telefone (fuzzy)
    if (!paciente) {
      paciente = await new Promise((r) => db.get(
        `SELECT id, nome, telefone, celular FROM pacientes 
         WHERE telefone LIKE ? OR celular LIKE ? OR telefone LIKE ? OR celular LIKE ?
         LIMIT 1`,
        [`%${ultimos9}`, `%${ultimos9}`, `%${telefone}%`, `%${telefone}%`],
        (err, row) => r(row)
      ));
    }

    // ⭐⭐⭐ FIX v10.3: Se encontrou paciente (por qualquer método), SALVA o chatId para buscas futuras ⭐⭐⭐
    let pacienteId = paciente?.id || null;
    let pacienteNome = paciente?.nome || 'Desconhecido';

    if (pacienteId) {
      // Salva o chatId do WhatsApp no paciente para buscas futuras (não bloqueia)
      salvarWhatsAppChatId(clinicaId, pacienteId, from).catch(() => {});
    }

    // ETAPA 3: Se não encontrou por telefone, tenta pelo chatId em mensagens anteriores
    if (!pacienteId) {
      const resolvidoPorChat = await buscarPacienteIdPorChatId(clinicaId, from);
      if (resolvidoPorChat) {
        pacienteId = resolvidoPorChat.pacienteId;
        pacienteNome = resolvidoPorChat.pacienteNome || 'Desconhecido';
        console.log(`📩 ✅ [FIX v10.3] PacienteId resolvido via histórico de mensagens: ${pacienteId} (${pacienteNome})`);
        // Salva chatId para próxima vez
        salvarWhatsAppChatId(clinicaId, pacienteId, from).catch(() => {});
      }
    }

    // ETAPA 4: Tenta via diálogo ativo
    if (!pacienteId) {
      const dialogoAtivo = await buscarDialogoAtivo(clinicaId, from);
      if (dialogoAtivo && dialogoAtivo.pacienteId && !dialogoAtivo.pacienteId.startsWith('tel_')) {
        pacienteId = dialogoAtivo.pacienteId;
        pacienteNome = dialogoAtivo.pacienteNome || 'Desconhecido';
        console.log(`📩 ✅ [FIX v10.3] PacienteId resolvido via diálogo ativo: ${pacienteId} (${pacienteNome})`);
        salvarWhatsAppChatId(clinicaId, pacienteId, from).catch(() => {});
      }
    }

    // Se não encontrou paciente por nenhum método
    if (!pacienteId) {
      console.log(`📩 ⚠️ [FIX v10.3] Paciente NÃO encontrado para chatId ${from} / tel ${telLimpo} - pacienteId ficará null`);
    }

    console.log(`📩 Paciente: ${pacienteNome} (${pacienteId || 'NÃO IDENTIFICADO'})`);

    // ⭐⭐⭐ FIX v10.0: Gerencia diálogo - abre se não existe ⭐⭐⭐
    let dialogoAtual = await buscarDialogoAtivo(clinicaId, from);
    if (!dialogoAtual) {
      await abrirDialogo(clinicaId, from, pacienteId, pacienteNome);
      console.log(`📩 📋 [FIX v10.0] Novo diálogo aberto (pendente) para chatId ${from}`);
    } else if (pacienteId && (!dialogoAtual.pacienteId || dialogoAtual.pacienteId !== pacienteId)) {
      // Atualiza pacienteId no diálogo se encontrou o paciente agora
      await atualizarDialogoPaciente(clinicaId, from, pacienteId, pacienteNome);
      console.log(`📩 📋 [FIX v10.0] Diálogo atualizado com pacienteId ${pacienteId}`);
    }

    // ⭐⭐⭐ VERIFICA SE HÁ SOLICITAÇÃO PENDENTE (foto ou documento) ⭐⭐⭐
    const chaveDialogo = `${clinicaId}_${telLimpo}`;

    // ⭐⭐⭐ FIX v11.3: BUSCA DIÁLOGO DE FOTO COM MATCHING FLEXÍVEL (igual dialogosAjuda) ⭐⭐⭐
    // Tenta múltiplas chaves: chave exata, chave canônica (últimos 9 dígitos), chave com 55, e busca por variações
    const chave9Foto = `${clinicaId}_9_${ultimos9}`;
    const chaveCom55Foto = `${clinicaId}_55${telLimpo}`;

    let dialogoFoto = dialogosFoto.get(chaveDialogo);

    // Se não encontrou pela chave exata, tenta pela chave canônica (últimos 9 dígitos)
    if (!dialogoFoto) {
      dialogoFoto = dialogosFoto.get(chave9Foto);
      if (dialogoFoto) {
        console.log(`📩 📸 [FIX v11.3] Diálogo de foto encontrado via chave canônica: ${chave9Foto}`);
      }
    }

    // Tenta com prefixo 55
    if (!dialogoFoto) {
      dialogoFoto = dialogosFoto.get(chaveCom55Foto);
      if (dialogoFoto) {
        console.log(`📩 📸 [FIX v11.3] Diálogo de foto encontrado via chave com 55: ${chaveCom55Foto}`);
      }
    }

    // Se ainda não encontrou, busca por variações de telefone em todas as chaves (fuzzy)
    if (!dialogoFoto) {
      for (const [key, val] of dialogosFoto.entries()) {
        if (!key.startsWith(clinicaId + '_')) continue;
        // Compara últimos 9 dígitos
        const keyUltimos9 = key.replace(`${clinicaId}_`, '').replace('9_', '').slice(-9);
        if (keyUltimos9 === ultimos9 && val.timestamp && Date.now() - val.timestamp < TEMPO_EXPIRACAO_IDENTIFICACAO) {
          dialogoFoto = val;
          console.log(`📩 📸 [FIX v11.3] Diálogo de foto encontrado via matching de últimos 9 dígitos: ${key} (${keyUltimos9} === ${ultimos9})`);
          break;
        }
      }
    }

    // ⭐⭐⭐ FIX v11.3: Se encontrou diálogo de foto por qualquer método, loga para debug ⭐⭐⭐
    if (dialogoFoto) {
      console.log(`📩 📸 [FIX v11.3] ✅ Diálogo de foto ENCONTRADO! PacienteId: ${dialogoFoto.pacienteId}, Nome: ${dialogoFoto.pacienteNome}`);
    }

    const dialogoFotoAtivo = dialogoFoto && Date.now() - dialogoFoto.timestamp < TEMPO_EXPIRACAO_IDENTIFICACAO;

    // PASSO 2: Verifica solicitação pendente no banco
    const solicitacao = await buscarSolicitacaoPendente(clinicaId, telefone);

    // ⭐⭐⭐ PROCESSAMENTO DE MÍDIA (foto, documento, vídeo, áudio) ⭐⭐⭐
    if (hasMedia || msgType === 'image' || msgType === 'video' || msgType === 'audio' || msgType === 'ptt' || msgType === 'document' || msgType === 'sticker') {
      console.log(`📩 🖼️ Mídia recebida! Tipo: ${msgType}`);

      // Tenta baixar a mídia
      let base64Data = null;
      let mediaUrl = payload.mediaUrl || payload.media?.url || payload._data?.mediaUrl || '';

      // ⭐⭐⭐ FIX v8.8: Se mediaUrl aponta para localhost, substitui pelo serverUrl do WAHA ⭐⭐⭐
      if (mediaUrl && (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1'))) {
        const originalMediaUrl = mediaUrl;
        try {
          const urlObj = new URL(mediaUrl);
          const wahaUrlObj = new URL(serverUrl);
          urlObj.protocol = wahaUrlObj.protocol;
          urlObj.hostname = wahaUrlObj.hostname;
          urlObj.port = wahaUrlObj.port || '';
          mediaUrl = urlObj.toString();
          console.log(`📩 🔄 mediaUrl corrigida: ${originalMediaUrl} → ${mediaUrl}`);
        } catch (e) {
          // Fallback: substituição simples
          mediaUrl = mediaUrl.replace(/http:\/\/localhost:\d+/, serverUrl).replace(/http:\/\/127\.0\.0\.1:\d+/, serverUrl);
          console.log(`📩 🔄 mediaUrl corrigida (fallback): ${originalMediaUrl} → ${mediaUrl}`);
        }
      }

      // ⭐⭐⭐ FIX v12.4: NÃO força HTTPS na mediaUrl — baixarMidia() já tenta HTTP e HTTPS ⭐⭐⭐

      // ⭐⭐⭐ FIX v9.4/v9.6: PARA VÍDEO/ÁUDIO E FOTOS DE PERFIL, NUNCA usar payload.body ⭐⭐⭐
      const isVideoOrAudio = msgType === 'video' || msgType === 'audio' || msgType === 'ptt';
      // ⭐⭐⭐ FIX v9.6: Fotos de perfil também devem forçar download de qualidade máxima ⭐⭐⭐
      const isFotoPerfil = dialogoFotoAtivo && (msgType === 'image' || (mimetype || '').includes('image'));
      // ⭐⭐⭐ FIX v9.7: Documentos solicitados (imagens) também devem forçar download de qualidade máxima ⭐⭐⭐
      // Quando há uma solicitação pendente de documento e o paciente envia uma imagem,
      // payload.body contém apenas o THUMBNAIL (~2KB). Precisamos baixar a imagem completa via API.
      const isDocumentoSolicitado = solicitacao && (msgType === 'image' || (mimetype || '').includes('image'));
      const forceApiDownload = isVideoOrAudio || isFotoPerfil || isDocumentoSolicitado;

      if (forceApiDownload) {
        // ⭐⭐⭐ VÍDEO/ÁUDIO/FOTO PERFIL/DOCUMENTO SOLICITADO: Só aceita mediaData explícito (base64 do arquivo real) ⭐⭐⭐
        // NÃO usa payload.body nem _data.body (são thumbnails!)
        base64Data = payload.mediaData || payload.media?.data || null;

        // Verifica se o que veio é realmente grande o suficiente
        const minSizeForPayload = isVideoOrAudio ?
        msgType === 'video' ? 100000 : 10000 :
        66000; // 50KB para foto de perfil ou documento solicitado (queremos qualidade boa)

        if (base64Data && base64Data.length < minSizeForPayload) {
          const tipo = isFotoPerfil ? 'foto de perfil' : isDocumentoSolicitado ? 'documento solicitado (imagem)' : msgType;
          console.log(`📩 ⚠️ [FIX v9.7] payload.mediaData muito pequeno para ${tipo} (${base64Data.length} chars ~${Math.round(base64Data.length * 0.75 / 1024)} KB) - PROVAVELMENTE THUMBNAIL! Ignorando e baixando via API.`);
          base64Data = null;
        }

        if (base64Data) {
          const tipo = isFotoPerfil ? 'foto de perfil' : isDocumentoSolicitado ? 'documento solicitado (imagem)' : msgType;
          console.log(`📩 ✅ [FIX v9.7] ${tipo}: mediaData do payload parece real (${base64Data.length} chars ~${Math.round(base64Data.length * 0.75 / 1024)} KB)`);
        } else {
          const tipo = isFotoPerfil ? 'foto de perfil' : isDocumentoSolicitado ? 'documento solicitado (imagem)' : msgType;
          console.log(`📩 📥 [FIX v9.7] ${tipo}: Forçando download via API (payload não contém mídia real ou qualidade insuficiente)`);
        }
      } else {
        // Imagens normais e documentos: pode usar payload normalmente
        base64Data = payload.mediaData || payload.media?.data || payload.body || payload._data?.body || null;
      }

      // Se não veio no payload, baixa via WAHA API
      if (!base64Data || base64Data.length < 1000) {
        if (mediaUrl) {
          base64Data = await baixarMidia(mediaUrl, wahaApiKey);
        }
        if (!base64Data || base64Data.length < 1000) {
          base64Data = await baixarMidiaViaWaha(serverUrl, sessionId, messageId, wahaApiKey, msgType);
        }
      }

      if (base64Data && base64Data.length > 1000) {
        // ⭐⭐⭐ FIX v9.5: MIMETYPE FALLBACK BASEADO NO msgType (NÃO hardcoded 'image/jpeg') ⭐⭐⭐
        // Bug anterior: fallback era 'image/jpeg' → vídeo salvo como .jpg → CORROMPIDO!
        // Agora: usa o msgType para determinar o mimetype correto quando não vem no payload
        let mediaMimetype = mimetype || payload.media?.mimetype || '';
        if (!mediaMimetype) {
          switch (msgType) {
            case 'video':mediaMimetype = 'video/mp4';break;
            case 'audio':case 'ptt':mediaMimetype = 'audio/ogg';break;
            case 'image':mediaMimetype = 'image/jpeg';break;
            case 'document':mediaMimetype = 'application/octet-stream';break;
            case 'sticker':mediaMimetype = 'image/webp';break;
            default:mediaMimetype = 'application/octet-stream';break;
          }
          console.log(`📩 [FIX v9.5] mimetype não veio no payload - usando fallback baseado em msgType="${msgType}": ${mediaMimetype}`);
        }

        // ⭐⭐⭐ FIX v9.5: VALIDAÇÃO DE TAMANHO MÍNIMO PARA VÍDEO/ÁUDIO ⭐⭐⭐
        // Mesmo após baixar via API, o resultado pode ser um thumbnail se o WAHA não processou
        // Vídeo real: mínimo ~50KB (base64 ~66000 chars)
        // Áudio real: mínimo ~5KB (base64 ~6600 chars)
        if (isVideoOrAudio) {
          const estimatedBytes = Math.round(base64Data.length * 0.75);
          const minBytes = msgType === 'video' ? 50000 : 5000;
          if (estimatedBytes < minBytes) {
            console.log(`📩 ⚠️ [FIX v9.5] ${msgType} muito pequeno após download (~${Math.round(estimatedBytes / 1024)} KB, mínimo: ${Math.round(minBytes / 1024)} KB) - PROVAVELMENTE THUMBNAIL!`);
            console.log(`📩 ⚠️ [FIX v9.5] NÃO salvando como ${msgType} para evitar arquivo corrompido.`);
            console.log(`📩 💡 Verifique se media.download=true na configuração da sessão WAHA.`);
            // Salva no histórico como mídia não baixada
            await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'recebida', `[${msgType}] (mídia muito pequena - possível thumbnail, não salva)`, 'recebida', from);
            console.log(`📩📩📩 ======================================== FIM\n`);
            return;
          }
          console.log(`📩 ✅ [FIX v9.5] ${msgType} tamanho OK: ~${Math.round(estimatedBytes / 1024)} KB (mínimo: ${Math.round(minBytes / 1024)} KB)`);
        }

        // ⭐⭐⭐ FIX v26.2: GUARDA DEFINITIVA — só processa mídia se houver DIÁLOGO ABERTO NESTA CLÍNICA ⭐⭐⭐
        // Regra do usuário: "só pode dar resposta automática pelo webhook se houver diálogo aberto...
        // caso contrário deve prevalecer a configuração de desabilitação de respostas"
        //
        // Sinais aceitos de diálogo aberto NESTA clínica:
        //   1. dialogoFotoAtivo (memória)        — pedimos foto há pouco
        //   2. solicitacao                       — solicitação pendente no banco (foto/doc)
        //   3. mensagemPendenteNestaClinica      — mensagem com status='pendente' nesta clínica
        //   4. solicitacaoPorPacienteIdNesta     — solicitação pendente por pacienteId nesta clínica
        //
        // Sem NENHUM destes sinais aqui, o cliente está mandando mídia espontânea (ex.: foto pessoal em conversa
        // casual). Salvamos apenas no histórico e SAÍMOS — nada de trocar foto de perfil, nada de busca
        // cross-clínica, nada de auto-resposta. Respeita a configuração de desabilitação de respostas.
        const mensagemPendenteNestaClinica = await buscarMensagemPendente(clinicaId, from);
        let solicitacaoPorPacienteIdNesta = null;
        if (!dialogoFotoAtivo && !solicitacao && !mensagemPendenteNestaClinica &&
        pacienteId && pacienteId !== 'desconhecido' && !String(pacienteId).startsWith('tel_')) {
          try {
            solicitacaoPorPacienteIdNesta = await buscarSolicitacaoPendentePorPacienteId(clinicaId, pacienteId);
          } catch (eSolPac) {
            console.log(`📩 ⚠️ [FIX v26.2] Erro ao buscar solicitação por pacienteId: ${eSolPac.message}`);
          }
        }

        const haDialogoAbertoNestaClinica = !!(
        dialogoFotoAtivo ||
        solicitacao ||
        mensagemPendenteNestaClinica ||
        solicitacaoPorPacienteIdNesta);


        if (!haDialogoAbertoNestaClinica) {
          console.log(`📩 🚫 [FIX v26.2] Mídia recebida SEM diálogo aberto nesta clínica (${clinicaId})`);
          console.log(`📩 🚫 [FIX v26.2] Regra: sem diálogo aberto → respeita config de desabilitação, não dispara nada automático`);
          console.log(`📩 🚫 [FIX v26.2] Salvando como mídia genérica no histórico e encerrando (sem resposta, sem trocar foto, sem busca cross-clínica)`);

          const midiaUrlGenerica = await salvarMidiaRecebida(clinicaId, pacienteId, base64Data, mediaMimetype, msgType);
          await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'recebida', `[${msgType}] ${midiaUrlGenerica || '(mídia)'}`, 'recebida', from);
          console.log(`📩📩📩 ======================================== FIM\n`);
          return;
        }

        console.log(`📩 ✅ [FIX v26.2] Diálogo aberto detectado nesta clínica — prosseguindo com processamento de mídia`);
        console.log(`   • dialogoFotoAtivo: ${!!dialogoFotoAtivo}`);
        console.log(`   • solicitacao (DB): ${!!solicitacao}`);
        console.log(`   • mensagemPendenteNestaClinica: ${!!mensagemPendenteNestaClinica}`);
        console.log(`   • solicitacaoPorPacienteIdNesta: ${!!solicitacaoPorPacienteIdNesta}`);

        // ⭐ CASO 1: Diálogo de foto ativo → salva como foto de perfil
        if (dialogoFotoAtivo && (msgType === 'image' || mediaMimetype.includes('image'))) {
          const targetPacienteId = dialogoFoto.pacienteId || pacienteId;
          const targetPacienteNome = dialogoFoto.pacienteNome || pacienteNome;

          console.log(`📩 📸 Salvando como FOTO DE PERFIL para ${targetPacienteNome}`);
          const fotoUrl = await salvarFotoPaciente(clinicaId, targetPacienteId, base64Data, mediaMimetype);

          if (fotoUrl) {
            // ⭐⭐⭐ FIX v11.3: Remove diálogo de foto de TODAS as chaves possíveis ⭐⭐⭐
            dialogosFoto.delete(chaveDialogo);
            dialogosFoto.delete(chave9Foto);
            dialogosFoto.delete(chaveCom55Foto);
            if (dialogoFoto?.telefone) {
              dialogosFoto.delete(`${clinicaId}_${dialogoFoto.telefone}`);
              dialogosFoto.delete(`${clinicaId}_55${dialogoFoto.telefone}`);
            }

            // Marca solicitação como recebida
            if (solicitacao && (solicitacao.tipo === 'foto' || solicitacao.categoria === 'foto')) {
              await marcarSolicitacaoRecebida(clinicaId, solicitacao.id, fotoUrl);
            }

            // ⭐⭐⭐ FIX v11.1: Fecha mensagem pendente (pedido de foto) ⭐⭐⭐
            await fecharMensagensPendentes(clinicaId, from);

            // Confirma ao paciente
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *FOTO DE PERFIL ATUALIZADA!*\n\nObrigado, ${targetPacienteNome}! Sua foto foi salva com sucesso. 📸`, sessionId);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Foto de perfil atualizada', 'enviada', from);
          } else {
            // ⭐⭐⭐ FIX v11.2: Falha ao salvar foto (CASO 1) → mantém pendente para retry ⭐⭐⭐
            const msgErroFoto1 = `❌ Não consegui salvar sua foto. Por favor, tente enviar novamente.`;
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroFoto1, sessionId);
            await fecharMensagensPendentes(clinicaId, from);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroFoto1, 'pendente', from);
            console.log(`📩 📸 [FIX v11.2] CASO 1: Foto falhou - mensagem de erro salva como PENDENTE para retry`);
          }

          // Salva mensagem recebida no histórico
          const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
          await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Foto de perfil] ${midiaUrl || ''}`, 'recebida', from);
          return;
        }

        // ⭐⭐⭐ CASO 1.5 (FIX v10.9.8): Solicitação de FOTO pendente no banco → salva como foto de perfil ⭐⭐⭐
        // Cobre o caso onde o diálogo em memória expirou ou a chave não bateu (ex: LID resolve para telefone diferente)
        // mas a solicitação no banco FOI encontrada (usa matching por últimos 9 dígitos)
        if (solicitacao && (solicitacao.tipo === 'foto' || solicitacao.categoria === 'foto') && (msgType === 'image' || mediaMimetype.includes('image'))) {
          const targetPacienteId = solicitacao.pacienteId || pacienteId;
          const targetPacienteNome = solicitacao.pacienteNome || pacienteNome;

          console.log(`📩 📸 [FIX v10.9.8] Solicitação de FOTO encontrada no banco (sem diálogo em memória)`);
          console.log(`📩 📸 Salvando como FOTO DE PERFIL para ${targetPacienteNome} (${targetPacienteId})`);
          const fotoUrl = await salvarFotoPaciente(clinicaId, targetPacienteId, base64Data, mediaMimetype);

          if (fotoUrl) {
            // Marca solicitação como recebida
            await marcarSolicitacaoRecebida(clinicaId, solicitacao.id, fotoUrl);

            // ⭐⭐⭐ FIX v11.3: Remove diálogo de foto de TODAS as chaves possíveis ⭐⭐⭐
            dialogosFoto.delete(chaveDialogo);
            dialogosFoto.delete(chave9Foto);
            dialogosFoto.delete(chaveCom55Foto);
            const chaveOriginal = `${clinicaId}_${solicitacao.telefone}`;
            dialogosFoto.delete(chaveOriginal);
            if (solicitacao.telefone) {
              const sol9 = solicitacao.telefone.slice(-9);
              dialogosFoto.delete(`${clinicaId}_9_${sol9}`);
              dialogosFoto.delete(`${clinicaId}_55${solicitacao.telefone}`);
            }

            // ⭐⭐⭐ FIX v11.1: Fecha mensagem pendente (pedido de foto) ⭐⭐⭐
            await fecharMensagensPendentes(clinicaId, from);

            // Confirma ao paciente
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *FOTO DE PERFIL ATUALIZADA!*\n\nObrigado, ${targetPacienteNome}! Sua foto foi salva com sucesso. 📸`, sessionId);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Foto de perfil atualizada', 'enviada', from);
          } else {
            // ⭐⭐⭐ FIX v11.2: Falha ao salvar foto (CASO 1.5) → mantém pendente para retry ⭐⭐⭐
            const msgErroFoto15 = `❌ Não consegui salvar sua foto. Por favor, tente enviar novamente.`;
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroFoto15, sessionId);
            await fecharMensagensPendentes(clinicaId, from);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroFoto15, 'pendente', from);
            console.log(`📩 📸 [FIX v11.2] CASO 1.5: Foto falhou - mensagem de erro salva como PENDENTE para retry`);
          }

          // Salva mensagem recebida no histórico
          const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
          await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Foto de perfil] ${midiaUrl || ''}`, 'recebida', from);
          console.log(`📩📩📩 ======================================== FIM\n`);
          return;
        }

        // ⭐ CASO 2: Solicitação de documento pendente → salva como documento
        if (solicitacao && solicitacao.tipo !== 'foto' && solicitacao.categoria !== 'foto') {
          const targetPacienteId = solicitacao.pacienteId || pacienteId;
          const targetPacienteNome = solicitacao.pacienteNome || pacienteNome;
          const docCategoria = solicitacao.categoria || 'outros';

          const docEspecialidade = solicitacao.especialidade || null;
          console.log(`📩 📄 Salvando como DOCUMENTO (${docCategoria}, esp: ${docEspecialidade || 'N/A'}) para ${targetPacienteNome}`);
          const resultado = await salvarDocumentoPaciente(clinicaId, targetPacienteId, targetPacienteNome, base64Data, mediaMimetype, msgType, docCategoria, docEspecialidade);

          if (resultado) {
            await marcarSolicitacaoRecebida(clinicaId, solicitacao.id, resultado.caminho);
            // ⭐⭐⭐ FIX v11.1: Fecha mensagem pendente (pedido de documento) ⭐⭐⭐
            await fecharMensagensPendentes(clinicaId, from);
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *DOCUMENTO RECEBIDO!*\n\nObrigado, ${targetPacienteNome}! Seu documento foi salvo com sucesso no prontuário. 📄`, sessionId);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Documento recebido e salvo', 'enviada', from);
          } else {
            // ⭐⭐⭐ FIX v11.2: Falha ao salvar documento (CASO 2) → mantém pendente para retry ⭐⭐⭐
            const msgErroDoc2 = `❌ Não consegui salvar o documento. Por favor, tente enviar novamente.`;
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroDoc2, sessionId);
            await fecharMensagensPendentes(clinicaId, from);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroDoc2, 'pendente', from);
            console.log(`📩 📄 [FIX v11.2] CASO 2: Documento falhou - mensagem de erro salva como PENDENTE para retry`);
          }

          const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
          await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Documento: ${docCategoria}] ${midiaUrl || ''}`, 'recebida', from);
          return;
        }

        // ⭐⭐⭐ FIX v11.1: CASO 3 - Verifica mensagem pendente ANTES de salvar como genérica ⭐⭐⭐
        // Quando o diálogo em memória expirou E a solicitação no banco não existe,
        // a mensagem pendente no banco pode indicar que estávamos esperando uma foto/documento.
        const mensagemPendenteMidia = await buscarMensagemPendente(clinicaId, from);

        if (mensagemPendenteMidia) {
          const conteudoPendenteMidia = (mensagemPendenteMidia.conteudo || '').toUpperCase();
          const isPedidoFoto = conteudoPendenteMidia.includes('FOTO DE PERFIL') || conteudoPendenteMidia.includes('TROCAR FOTO') || conteudoPendenteMidia.includes('ENVIE UMA FOTO');
          const isPedidoDocumento = conteudoPendenteMidia.includes('ENVIAR DOCUMENTO') || conteudoPendenteMidia.includes('ENVIE O DOCUMENTO');

          if (isPedidoFoto && (msgType === 'image' || msgType === 'chat' && mediaMimetype.includes('image'))) {
            // ⭐⭐⭐ FIX v11.1: Mensagem pendente é pedido de FOTO → salva como foto de perfil ⭐⭐⭐
            const targetPacienteId = mensagemPendenteMidia.pacienteId || pacienteId;
            const targetPacienteNome = mensagemPendenteMidia.pacienteNome || pacienteNome;

            console.log(`📩 📸 [FIX v11.1] Mensagem pendente é PEDIDO DE FOTO! Salvando como foto de perfil para ${targetPacienteNome}`);
            const fotoUrl = await salvarFotoPaciente(clinicaId, targetPacienteId, base64Data, mediaMimetype);

            if (fotoUrl) {
              await fecharMensagensPendentes(clinicaId, from);
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *FOTO DE PERFIL ATUALIZADA!*\n\nObrigado, ${targetPacienteNome}! Sua foto foi salva com sucesso. 📸`, sessionId);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Foto de perfil atualizada', 'enviada', from);

              // Remove diálogo de foto de todas as chaves possíveis
              dialogosFoto.delete(chaveDialogo);
              dialogosFoto.delete(`${clinicaId}_${telefone}`);
              dialogosFoto.delete(`${clinicaId}_9_${ultimos9}`);
            } else {
              // ⭐⭐⭐ FIX v11.2: Falha ao salvar foto → mantém pendente para retry ⭐⭐⭐
              const msgErroFoto = `❌ Não consegui salvar sua foto. Por favor, tente enviar novamente.`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroFoto, sessionId);
              // Fecha pendente anterior e salva nova como 'pendente' (espera nova tentativa)
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroFoto, 'pendente', from);
              console.log(`📩 📸 [FIX v11.2] Foto falhou - mensagem de erro salva como PENDENTE para retry`);
            }

            const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Foto de perfil via pendente] ${midiaUrl || ''}`, 'recebida', from);
            console.log(`📩📩📩 ======================================== FIM\n`);
            return;
          }

          if (isPedidoDocumento) {
            // ⭐⭐⭐ FIX v11.1: Mensagem pendente é pedido de DOCUMENTO → salva como documento ⭐⭐⭐
            const targetPacienteId = mensagemPendenteMidia.pacienteId || pacienteId;
            const targetPacienteNome = mensagemPendenteMidia.pacienteNome || pacienteNome;

            // ⭐ Usa a classificação pedida pela clínica; só cai em "outros" se
            // realmente não houver nenhuma solicitação registrada.
            const classificacaoPendente = await buscarUltimaClassificacaoDocumento(clinicaId, targetPacienteId, from);
            const catPendente = classificacaoPendente?.categoria || 'outros';
            const espPendente = classificacaoPendente?.especialidade || null;

            console.log(`📩 📄 [FIX v11.1] Mensagem pendente é PEDIDO DE DOCUMENTO! Salvando para ${targetPacienteNome} (${catPendente}, esp: ${espPendente || 'N/A'})`);
            const resultado = await salvarDocumentoPaciente(clinicaId, targetPacienteId, targetPacienteNome, base64Data, mediaMimetype, msgType, catPendente, espPendente);

            if (resultado) {
              await fecharMensagensPendentes(clinicaId, from);
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *DOCUMENTO RECEBIDO!*\n\nObrigado, ${targetPacienteNome}! Seu documento foi salvo com sucesso no prontuário. 📄`, sessionId);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Documento recebido e salvo', 'enviada', from);
            } else {
              // ⭐⭐⭐ FIX v11.2: Falha ao salvar documento → mantém pendente para retry ⭐⭐⭐
              const msgErroDoc = `❌ Não consegui salvar o documento. Por favor, tente enviar novamente.`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroDoc, sessionId);
              // Fecha pendente anterior e salva nova como 'pendente' (espera nova tentativa)
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroDoc, 'pendente', from);
              console.log(`📩 📄 [FIX v11.2] Documento falhou - mensagem de erro salva como PENDENTE para retry`);
            }

            const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Documento via pendente] ${midiaUrl || ''}`, 'recebida', from);
            console.log(`📩📩📩 ======================================== FIM\n`);
            return;
          }
        }

        // ⭐⭐⭐ FIX v16.0: CASO 2.5 - Fallback por pacienteId (resolve problema de LID) ⭐⭐⭐
        // Quando o matching por telefone falha (ex: LID não resolvido), mas o paciente FOI identificado
        // via whatsappChatId, busca solicitação pendente pelo pacienteId no banco
        if (pacienteId && pacienteId !== 'desconhecido' && !pacienteId.startsWith('tel_')) {
          const solicitacaoPorPaciente = await buscarSolicitacaoPendentePorPacienteId(clinicaId, pacienteId);

          if (solicitacaoPorPaciente && (solicitacaoPorPaciente.tipo === 'foto' || solicitacaoPorPaciente.categoria === 'foto') && (msgType === 'image' || mediaMimetype.includes('image'))) {
            const targetPacienteId = solicitacaoPorPaciente.pacienteId || pacienteId;
            const targetPacienteNome = solicitacaoPorPaciente.pacienteNome || pacienteNome;

            console.log(`📩 📸 [FIX v16.0] CASO 2.5: Solicitação de FOTO encontrada via pacienteId (fallback LID)`);
            console.log(`📩 📸 Salvando como FOTO DE PERFIL para ${targetPacienteNome} (${targetPacienteId})`);
            const fotoUrl = await salvarFotoPaciente(clinicaId, targetPacienteId, base64Data, mediaMimetype);

            if (fotoUrl) {
              await marcarSolicitacaoRecebida(clinicaId, solicitacaoPorPaciente.id, fotoUrl);
              await fecharMensagensPendentes(clinicaId, from);

              // Remove diálogo de foto de todas as chaves possíveis
              dialogosFoto.delete(chaveDialogo);
              dialogosFoto.delete(chave9Foto);
              dialogosFoto.delete(chaveCom55Foto);
              if (solicitacaoPorPaciente.telefone) {
                const solTel = solicitacaoPorPaciente.telefone.replace(/\D/g, '');
                dialogosFoto.delete(`${clinicaId}_${solTel}`);
                dialogosFoto.delete(`${clinicaId}_9_${solTel.slice(-9)}`);
                dialogosFoto.delete(`${clinicaId}_55${solTel}`);
              }

              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *FOTO DE PERFIL ATUALIZADA!*\n\nObrigado, ${targetPacienteNome}! Sua foto foi salva com sucesso. 📸`, sessionId);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Foto de perfil atualizada', 'enviada', from);
            } else {
              const msgErroFoto25 = `❌ Não consegui salvar sua foto. Por favor, tente enviar novamente.`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroFoto25, sessionId);
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroFoto25, 'pendente', from);
              console.log(`📩 📸 [FIX v16.0] CASO 2.5: Foto falhou - mensagem de erro salva como PENDENTE para retry`);
            }

            const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Foto de perfil via pacienteId] ${midiaUrl || ''}`, 'recebida', from);
            console.log(`📩📩📩 ======================================== FIM\n`);
            return;
          }

          // Também verifica documentos por pacienteId
          if (solicitacaoPorPaciente && solicitacaoPorPaciente.tipo !== 'foto' && solicitacaoPorPaciente.categoria !== 'foto') {
            const targetPacienteId = solicitacaoPorPaciente.pacienteId || pacienteId;
            const targetPacienteNome = solicitacaoPorPaciente.pacienteNome || pacienteNome;
            const docCategoria = solicitacaoPorPaciente.categoria || 'outros';

            const docEspecialidade25 = solicitacaoPorPaciente.especialidade || null;
            console.log(`📩 📄 [FIX v16.0] CASO 2.5: Solicitação de DOCUMENTO encontrada via pacienteId (fallback LID, esp: ${docEspecialidade25 || 'N/A'})`);
            const resultado = await salvarDocumentoPaciente(clinicaId, targetPacienteId, targetPacienteNome, base64Data, mediaMimetype, msgType, docCategoria, docEspecialidade25);

            if (resultado) {
              await marcarSolicitacaoRecebida(clinicaId, solicitacaoPorPaciente.id, resultado.caminho);
              await fecharMensagensPendentes(clinicaId, from);
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *DOCUMENTO RECEBIDO!*\n\nObrigado, ${targetPacienteNome}! Seu documento foi salvo com sucesso no prontuário. 📄`, sessionId);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', '✅ Documento recebido e salvo', 'enviada', from);
            } else {
              const msgErroDoc25 = `❌ Não consegui salvar o documento. Por favor, tente enviar novamente.`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErroDoc25, sessionId);
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'enviada', msgErroDoc25, 'pendente', from);
            }

            const midiaUrl = await salvarMidiaRecebida(clinicaId, targetPacienteId, base64Data, mediaMimetype, msgType);
            await salvarMensagemHistorico(clinicaId, targetPacienteId, targetPacienteNome, 'recebida', `[Documento via pacienteId: ${docCategoria}] ${midiaUrl || ''}`, 'recebida', from);
            console.log(`📩📩📩 ======================================== FIM\n`);
            return;
          }
        }

        // ⭐⭐⭐ FIX v16.4: CASO 2.9 - BUSCA CROSS-CLÍNICA ⭐⭐⭐
        // Problema: múltiplas clínicas compartilham a mesma sessão WhatsApp.
        // A solicitação/mensagem pendente pode estar em OUTRA clínica.
        // Busca em TODAS as clínicas da sessão por solicitação pendente OU mensagem pendente.
        if (msgType === 'image' || mediaMimetype.includes('image')) {
          try {
            const todasClinicas = await buscarTodasClinicasPorSession(sessionId);
            console.log(`📩 [FIX v16.4] CASO 2.9: Buscando cross-clínica em ${todasClinicas.length} clínica(s) da sessão "${sessionId}"`);

            for (const altClinica of todasClinicas) {
              if (altClinica.clinicaId === clinicaId) continue; // Já buscamos nesta

              const altClinicaId = altClinica.clinicaId;
              console.log(`📩 [FIX v16.4] Tentando clínica alternativa: ${altClinicaId}`);

              // 1. Busca solicitação pendente por telefone nesta clínica
              const solAlt = await buscarSolicitacaoPendente(altClinicaId, telefone);

              if (solAlt && (solAlt.tipo === 'foto' || solAlt.categoria === 'foto')) {
                const altPacienteId = solAlt.pacienteId;
                const altPacienteNome = solAlt.pacienteNome || pacienteNome;

                console.log(`📩 📸 [FIX v16.4] ✅ SOLICITAÇÃO DE FOTO encontrada na clínica ${altClinicaId}!`);
                console.log(`   Paciente: ${altPacienteNome} (${altPacienteId})`);

                const fotoUrl = await salvarFotoPaciente(altClinicaId, altPacienteId, base64Data, mediaMimetype);

                if (fotoUrl) {
                  await marcarSolicitacaoRecebida(altClinicaId, solAlt.id, fotoUrl);
                  await fecharMensagensPendentes(altClinicaId, from);
                  // Também fecha na clínica primária (pode ter mensagens lá)
                  await fecharMensagensPendentes(clinicaId, from);

                  dialogosFoto.delete(chaveDialogo);
                  dialogosFoto.delete(chave9Foto);
                  dialogosFoto.delete(chaveCom55Foto);
                  if (solAlt.telefone) {
                    const solTel = solAlt.telefone.replace(/\D/g, '');
                    dialogosFoto.delete(`${altClinicaId}_${solTel}`);
                    dialogosFoto.delete(`${altClinicaId}_9_${solTel.slice(-9)}`);
                    dialogosFoto.delete(`${altClinicaId}_55${solTel}`);
                  }

                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *FOTO DE PERFIL ATUALIZADA!*\n\nObrigado, ${altPacienteNome}! Sua foto foi salva com sucesso. 📸`, sessionId);
                  await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'enviada', '✅ Foto de perfil atualizada', 'enviada', from);
                } else {
                  const msgErro = `❌ Não consegui salvar sua foto. Por favor, tente enviar novamente.`;
                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErro, sessionId);
                  await fecharMensagensPendentes(altClinicaId, from);
                  await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'enviada', msgErro, 'pendente', from);
                }

                const midiaUrl = await salvarMidiaRecebida(altClinicaId, altPacienteId, base64Data, mediaMimetype, msgType);
                await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'recebida', `[Foto cross-clínica] ${midiaUrl || ''}`, 'recebida', from);
                console.log(`📩📩📩 ======================================== FIM\n`);
                return;
              }

              // 2. Busca solicitação de documento
              if (solAlt && solAlt.tipo !== 'foto' && solAlt.categoria !== 'foto') {
                const altPacienteId = solAlt.pacienteId;
                const altPacienteNome = solAlt.pacienteNome || pacienteNome;
                const docCategoria = solAlt.categoria || 'outros';

                const docEspecialidadeAlt = solAlt.especialidade || null;
                console.log(`📩 📄 [FIX v16.4] ✅ SOLICITAÇÃO DE DOCUMENTO encontrada na clínica ${altClinicaId}! (esp: ${docEspecialidadeAlt || 'N/A'})`);
                const resultado = await salvarDocumentoPaciente(altClinicaId, altPacienteId, altPacienteNome, base64Data, mediaMimetype, msgType, docCategoria, docEspecialidadeAlt);

                if (resultado) {
                  await marcarSolicitacaoRecebida(altClinicaId, solAlt.id, resultado.caminho);
                  await fecharMensagensPendentes(altClinicaId, from);
                  await fecharMensagensPendentes(clinicaId, from);
                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *DOCUMENTO RECEBIDO!*\n\nObrigado, ${altPacienteNome}! Seu documento foi salvo com sucesso. 📄`, sessionId);
                  await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'enviada', '✅ Documento recebido e salvo', 'enviada', from);
                }

                const midiaUrl = await salvarMidiaRecebida(altClinicaId, altPacienteId, base64Data, mediaMimetype, msgType);
                await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'recebida', `[Documento cross-clínica] ${midiaUrl || ''}`, 'recebida', from);
                console.log(`📩📩📩 ======================================== FIM\n`);
                return;
              }

              // 3. Busca mensagem pendente de foto nesta clínica alternativa
              const msgPendenteAlt = await buscarMensagemPendente(altClinicaId, from);
              if (msgPendenteAlt) {
                const conteudoAlt = (msgPendenteAlt.conteudo || '').toUpperCase();
                const isFotoAlt = conteudoAlt.includes('FOTO DE PERFIL') || conteudoAlt.includes('TROCAR FOTO') || conteudoAlt.includes('ENVIE UMA FOTO') || conteudoAlt.includes('FOTO SUA') || conteudoAlt.includes('SELFIE DE ROSTO');

                if (isFotoAlt) {
                  const altPacienteId = msgPendenteAlt.pacienteId || pacienteId;
                  const altPacienteNome = msgPendenteAlt.pacienteNome || pacienteNome;

                  console.log(`📩 📸 [FIX v16.4] ✅ MENSAGEM PENDENTE DE FOTO encontrada na clínica ${altClinicaId}!`);
                  console.log(`   Paciente: ${altPacienteNome} (${altPacienteId})`);

                  const fotoUrl = await salvarFotoPaciente(altClinicaId, altPacienteId, base64Data, mediaMimetype);

                  if (fotoUrl) {
                    await fecharMensagensPendentes(altClinicaId, from);
                    await fecharMensagensPendentes(clinicaId, from);
                    dialogosFoto.delete(chaveDialogo);
                    dialogosFoto.delete(chave9Foto);
                    dialogosFoto.delete(chaveCom55Foto);

                    await enviarMensagemRobusta(serverUrl, wahaApiKey, from, `✅ *FOTO DE PERFIL ATUALIZADA!*\n\nObrigado, ${altPacienteNome}! Sua foto foi salva com sucesso. 📸`, sessionId);
                    await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'enviada', '✅ Foto de perfil atualizada', 'enviada', from);
                  } else {
                    const msgErro = `❌ Não consegui salvar sua foto. Por favor, tente enviar novamente.`;
                    await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErro, sessionId);
                    await fecharMensagensPendentes(altClinicaId, from);
                    await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'enviada', msgErro, 'pendente', from);
                  }

                  const midiaUrl = await salvarMidiaRecebida(altClinicaId, altPacienteId, base64Data, mediaMimetype, msgType);
                  await salvarMensagemHistorico(altClinicaId, altPacienteId, altPacienteNome, 'recebida', `[Foto cross-clínica via pendente] ${midiaUrl || ''}`, 'recebida', from);
                  console.log(`📩📩📩 ======================================== FIM\n`);
                  return;
                }
              }
            }

            console.log(`📩 [FIX v16.4] CASO 2.9: Nenhuma solicitação/pendente encontrada em nenhuma clínica`);
          } catch (e29) {
            console.log(`📩 ⚠️ [FIX v16.4] Erro no CASO 2.9: ${e29.message}`);
          }
        }

        // ⭐ CASO 3: Mídia sem solicitação → salva como mídia genérica no histórico
        const midiaUrl = await salvarMidiaRecebida(clinicaId, pacienteId, base64Data, mediaMimetype, msgType);
        await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'recebida', `[${msgType}] ${midiaUrl || '(mídia)'}`, 'recebida', from);
        console.log(`📩 Mídia salva no histórico (sem solicitação pendente)`);

        // ⭐⭐⭐ FIX v21.6: Se menu bloqueado, NÃO orienta paciente a digitar AJUDA ⭐⭐⭐
        if (MENU_AJUDA_BLOQUEADO) {
          console.log(`📩 [FIX v21.6] ⛔ Mídia sem contexto + menu bloqueado → silencioso`);
          // Não envia nenhuma mensagem automática — canal livre
        } else {
          // ⭐⭐⭐ FIX v20.3: Mídia sem contexto → orienta paciente → espera resposta → 'pendente' ⭐⭐⭐
          const msgMidiaSemCtx = `📩 Recebemos sua mídia, ${pacienteNome !== 'Desconhecido' ? pacienteNome : ''}!\n\nSe deseja trocar sua foto de perfil ou enviar um documento, digite *AJUDA* e escolha a opção correspondente.\n\nDigite *0* para sair.`;
          await fecharMensagensPendentes(clinicaId, from);
          await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgMidiaSemCtx, sessionId);
          await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgMidiaSemCtx, 'pendente', from);
        }
      } else {
        console.log(`📩 ⚠️ Não foi possível baixar a mídia`);
        await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'recebida', `[${msgType}] (mídia não baixada)`, 'recebida', from);
      }

      console.log(`📩📩📩 ======================================== FIM\n`);
      return;
    }

    // ⭐⭐⭐ PROCESSAMENTO DE TEXTO ⭐⭐⭐
    if (!text) {
      console.log(`📩 Mensagem sem texto e sem mídia - ignorando`);
      return;
    }

    // Salva mensagem recebida no histórico
    await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'recebida', text, 'recebida', from);

    const textoUpper = text.trim().toUpperCase();

    // ⭐⭐⭐ FIX v21.5: Verifica campo menuAjudaAtivo do banco — simples e direto ⭐⭐⭐
    // O campo menuAjudaAtivo é um TINYINT(1) no banco: 1 = ativo, 0 = bloqueado
    // Controlado pelo toggle "Menu de Ajuda Ativo" na tela de Configurações
    // ⭐ FIX v21.7: Variável já declarada no topo — aqui só reatribui
    MENU_AJUDA_BLOQUEADO = config ? config.menuAjudaAtivo : false;
    try {
      // 1. Tenta ler do config já carregado (cache de buscarClinicaPorSession)
      let menuAjudaAtivo = config ? config.menuAjudaAtivo : undefined;
      console.log(`📩 [FIX v21.5] config.menuAjudaAtivo = ${menuAjudaAtivo} (tipo: ${typeof menuAjudaAtivo})`);

      // 2. Se não existe no config (coluna nova, cache antigo), busca direto do banco
      if (menuAjudaAtivo === undefined || menuAjudaAtivo === null) {
        console.log(`📩 [FIX v21.5] menuAjudaAtivo não encontrado no config — buscando do banco...`);
        try {
          await new Promise((r) => db.run(`ALTER TABLE whatsapp_config ADD COLUMN menuAjudaAtivo TINYINT(1) DEFAULT 1`, () => r()));
          const dbRow = await new Promise((resolve) => db.get(
            'SELECT menuAjudaAtivo FROM whatsapp_config WHERE clinicaId = ?',
            [clinicaId], (err, row) => {
              if (err) {console.log(`📩 [FIX v21.5] Erro SQL: ${err.message}`);resolve(null);} else
              resolve(row || null);
            }
          ));
          if (dbRow) {
            menuAjudaAtivo = dbRow.menuAjudaAtivo;
            console.log(`📩 [FIX v21.5] Banco retornou menuAjudaAtivo = ${menuAjudaAtivo}`);
          }
        } catch (dbErr) {
          console.log(`📩 [FIX v21.5] Erro ao buscar do banco: ${dbErr.message}`);
        }
      }

      // 3. Decide: se menuAjudaAtivo é 0, false, ou '0' → BLOQUEADO
      // ⭐⭐⭐ FIX v21.6: Comparação robusta — qualquer valor falsy exceto undefined/null = BLOQUEADO ⭐⭐⭐
      if (menuAjudaAtivo === 0 || menuAjudaAtivo === false || menuAjudaAtivo === '0' || menuAjudaAtivo === 'false') {
        MENU_AJUDA_BLOQUEADO = true;
      }
    } catch (e) {
      console.log(`📩 [FIX v21.6] Erro ao verificar menuAjudaAtivo: ${e.message}`);
    }
    console.log(`📩 [FIX v21.6] ====> MENU_AJUDA_BLOQUEADO = ${MENU_AJUDA_BLOQUEADO}`);

    // ⭐⭐⭐ FIX v10.4 + FIX v22.0: BUSCA MENSAGEM PENDENTE EM TODAS AS CLÍNICAS DA SESSÃO ⭐⭐⭐
    // Problema anterior: lembrete salvo na clínica A, webhook resolve para clínica B.
    // buscarMensagemPendente só buscava na clínica primária → consultaId não encontrado → fallback errado.
    // Agora busca primeiro na clínica primária, depois em TODAS as clínicas da sessão.
    let mensagemPendente = await buscarMensagemPendente(clinicaId, from);
    let mensagemPendenteClinicaId = clinicaId; // Clínica onde a mensagem pendente foi encontrada

    // ⭐⭐⭐ FIX v22.0: Se não encontrou na clínica primária, busca em TODAS as clínicas da sessão ⭐⭐⭐
    if (!mensagemPendente) {
      try {
        const todasClinicasSessao = await buscarTodasClinicasPorSession(sessionId);
        for (const altClinica of todasClinicasSessao) {
          if (altClinica.clinicaId === clinicaId) continue;
          const altMsg = await buscarMensagemPendente(altClinica.clinicaId, from);
          if (altMsg) {
            mensagemPendente = altMsg;
            mensagemPendenteClinicaId = altClinica.clinicaId;
            console.log(`📩 [FIX v22.0] ✅ Mensagem pendente encontrada na clínica ALTERNATIVA: ${altClinica.clinicaId}`);
            console.log(`   - consultaId: ${altMsg.consultaId || '(não gravado)'}`);
            break;
          }
        }
      } catch (e22) {
        console.log(`📩 [FIX v22.0] ⚠️ Erro na busca cross-clínica de pendentes: ${e22.message}`);
      }
    }

    if (mensagemPendente) {
      console.log(`📩 [FIX v10.4] ✅ DIÁLOGO EM ABERTO encontrado via mensagem pendente!`);
      console.log(`   - Msg pendente ID: ${mensagemPendente.id}`);
      console.log(`   - Paciente: ${mensagemPendente.pacienteNome} (${mensagemPendente.pacienteId})`);
      console.log(`   - consultaId: ${mensagemPendente.consultaId || '(não gravado)'}`);
      console.log(`   - Clínica da mensagem: ${mensagemPendenteClinicaId}`);
      console.log(`   - Conteúdo original: ${mensagemPendente.conteudo?.substring(0, 60)}...`);

      // Se não tínhamos pacienteId, usa o da mensagem pendente
      if (!pacienteId || pacienteId === 'desconhecido') {
        pacienteId = mensagemPendente.pacienteId;
        pacienteNome = mensagemPendente.pacienteNome || pacienteNome;
        console.log(`📩 [FIX v10.4] PacienteId resolvido via mensagem pendente: ${pacienteId} (${pacienteNome})`);
      }
    } else {
      console.log(`📩 [FIX v10.4] Nenhuma mensagem pendente para chatId ${from} em nenhuma clínica da sessão`);
    }

    // ⭐⭐⭐ FIX v10.9.6: VERIFICA MOTIVO DE CANCELAMENTO ANTES DE TUDO ⭐⭐⭐
    // Mover esta verificação para ANTES da busca de consultas pendentes.
    // Problema anterior: quando o paciente respondia com o motivo (ex: "não posso ir"),
    // matchCancelamento() retornava true e o sistema tentava cancelar OUTRA consulta
    // em vez de registrar o motivo do cancelamento anterior.
    const chaveDialogoMotivo = `${clinicaId}_${telLimpo}`;
    const aguardandoMotivoPreCheck = conversasAguardandoMotivo.get(chaveDialogoMotivo);

    // Também tenta chaves alternativas (últimos 9 dígitos, telefone com 55, etc.)
    let aguardandoMotivoFinal = aguardandoMotivoPreCheck;
    if (!aguardandoMotivoFinal) {
      // Tenta com chave canônica
      const chave9Motivo = `${clinicaId}_9_${ultimos9}`;
      aguardandoMotivoFinal = conversasAguardandoMotivo.get(chave9Motivo);
      if (aguardandoMotivoFinal) {
        console.log(`📩 [FIX v10.9.6] Motivo encontrado via chave canônica: ${chave9Motivo}`);
      }
    }
    if (!aguardandoMotivoFinal) {
      // Busca por variações de telefone
      for (const [key, val] of conversasAguardandoMotivo.entries()) {
        if (!key.startsWith(clinicaId + '_')) continue;
        const keyUltimos9 = key.replace(`${clinicaId}_`, '').replace('9_', '').slice(-9);
        if (keyUltimos9 === ultimos9 && val.timestamp && Date.now() - val.timestamp < TEMPO_EXPIRACAO_MOTIVO) {
          aguardandoMotivoFinal = val;
          console.log(`📩 [FIX v10.9.6] Motivo encontrado via matching parcial: ${key}`);
          break;
        }
      }
    }

    if (aguardandoMotivoFinal && Date.now() - aguardandoMotivoFinal.timestamp < TEMPO_EXPIRACAO_MOTIVO) {
      // ⭐⭐⭐ FIX v10.9.6: Paciente respondeu com motivo de cancelamento - PRIORIDADE MÁXIMA ⭐⭐⭐
      console.log(`📩 [FIX v10.9.6] ✅ MOTIVO DE CANCELAMENTO RECEBIDO (prioridade máxima): ${text}`);
      console.log(`   Consulta cancelada: ${aguardandoMotivoFinal.consultaId}`);

      // Remove de TODAS as chaves possíveis
      conversasAguardandoMotivo.delete(chaveDialogoMotivo);
      conversasAguardandoMotivo.delete(`${clinicaId}_9_${ultimos9}`);
      // Remove qualquer chave que tenha o mesmo consultaId
      for (const [key, val] of conversasAguardandoMotivo.entries()) {
        if (val.consultaId === aguardandoMotivoFinal.consultaId) {
          conversasAguardandoMotivo.delete(key);
        }
      }

      // ⭐ Salva o motivo na consulta (campo motivoCancelamento E observacoes)
      const motivoPacienteId = aguardandoMotivoFinal.pacienteId || pacienteId;
      const motivoPacienteNome = aguardandoMotivoFinal.pacienteNome || pacienteNome;

      if (aguardandoMotivoFinal.consultaId) {
        // ⭐⭐⭐ FIX v22.1: Usa db da clínica correta (onde a consulta está) ⭐⭐⭐
        const dbMotivo = aguardandoMotivoFinal.clinicaId ? getClinicaDB(aguardandoMotivoFinal.clinicaId) : db;
        const clinicaIdMotivo = aguardandoMotivoFinal.clinicaId || clinicaId;
        console.log(`📩 [FIX v22.1] Salvando motivo na clínica ${clinicaIdMotivo}, consulta ${aguardandoMotivoFinal.consultaId}`);

        // ⭐⭐⭐ Garante data/hora do cancelamento de forma EXPLÍCITA (sem COALESCE/NULLIF).
        // Antes usávamos COALESCE(NULLIF(dataCancelamento,''), ?), que só gravava a data
        // se o valor atual fosse exatamente NULL ou ''. Se a coluna tivesse qualquer outro
        // conteúdo, a data NOVA era descartada silenciosamente — e a data "não chegava ao banco".
        // Agora: LEMOS o valor atual, decidimos em JS e gravamos o valor FINAL diretamente.
        const cancelBRmotivo = agoraCancelamentoBR();

        // 1. Lê o que já existe na consulta (pode ter sido gravado no evento de cancelamento).
        const rowAtual = await new Promise((r) => dbMotivo.get(
          `SELECT dataCancelamento, horaCancelamento FROM consultas WHERE id = ?`,
          [aguardandoMotivoFinal.consultaId],
          (err, row) => r(err ? null : row)
        ));
        const dataExistente = (rowAtual?.dataCancelamento || '').toString().trim();
        const horaExistente = (rowAtual?.horaCancelamento || '').toString().trim();
        // 2. Valor final: preserva o original se existir; senão usa agora (Brasil).
        const dataFinal = dataExistente || cancelBRmotivo.dataCancelamento;
        const horaFinal = horaExistente || cancelBRmotivo.horaCancelamento;
        console.log(`📩 [MOTIVO] Gravando data/hora → dataFinal="${dataFinal}" horaFinal="${horaFinal}" (existente: "${dataExistente}"/"${horaExistente}") na consulta ${aguardandoMotivoFinal.consultaId}`);

        // 3. Status + motivo + observações usam SÓ colunas garantidas (motivoCancelamento
        //    e observacoes já existem há muito tempo), então este UPDATE nunca falha por
        //    coluna ausente.
        //
        // ⭐⭐⭐ REDUNDÂNCIA À PROVA DE FALHAS: embutimos a data/hora do cancelamento
        // DENTRO do texto de observações, no formato EXATO que o card da agenda sabe
        // recuperar por regex ("CANCELADO em DD/MM/AAAA às HH:MM"). Assim, mesmo que
        // as colunas dedicadas (dataCancelamento/horaCancelamento) não persistam — por
        // migração pendente, banco antigo ou backend não reiniciado — o card AINDA
        // exibe a data/hora, extraindo-a de observacoes. É a garantia final de que a
        // pergunta "cadê a data/hora do cancelamento?" nunca mais fique sem resposta.
        const dataBRmotivo = (dataFinal || '').includes('-') ?
        dataFinal.split('-').reverse().join('/') :
        dataFinal;
        const carimboCancel = dataBRmotivo && horaFinal ?
        ` | CANCELADO em ${dataBRmotivo} às ${horaFinal}` :
        '';
        await new Promise((r) => dbMotivo.run(
          `UPDATE consultas SET status = 'cancelada', motivoCancelamento = ?, observacoes = CONCAT(COALESCE(observacoes, ''), ' | Motivo cancelamento: ', ?, ?) WHERE id = ?`,
          [text, text, carimboCancel, aguardandoMotivoFinal.consultaId],
          function (err) {
            if (err) console.log(`📩 ⚠️ Erro ao salvar motivo: ${err.message}`);else
            console.log(`📩 ✅ Motivo gravado na consulta ${aguardandoMotivoFinal.consultaId} changes=${this?.changes ?? 'N/A'}`);
            r();
          }
        ));
        // Data/hora + proveniência (canal/responsável) via helper best-effort auto-curável —
        // nunca quebra o motivo/status, e garante a persistência da data mesmo que as
        // colunas ainda não existissem.
        await gravarMetadadosCancelamento(dbMotivo, aguardandoMotivoFinal.consultaId, {
          data: dataFinal, hora: horaFinal
        });

        // Verificação pós-UPDATE
        const verificaMotivo = await new Promise((r) => dbMotivo.get(
          `SELECT motivoCancelamento, dataCancelamento, horaCancelamento, observacoes FROM consultas WHERE id = ?`,
          [aguardandoMotivoFinal.consultaId],
          (err, row) => r(row)
        ));
        console.log(`📩 [FIX v22.1] Verificação pós-gravação: motivo="${verificaMotivo?.motivoCancelamento}", data="${verificaMotivo?.dataCancelamento}", hora="${verificaMotivo?.horaCancelamento}"`);
        // Guarda para enviar no SSE abaixo.
        aguardandoMotivoFinal._dataCancelamento = verificaMotivo?.dataCancelamento || dataFinal;
        aguardandoMotivoFinal._horaCancelamento = verificaMotivo?.horaCancelamento || horaFinal;
      }

      await enviarMensagemRobusta(serverUrl, wahaApiKey, from,
      `👋 Obrigado por informar, ${motivoPacienteNome}. Sua consulta foi cancelada.\n\n📝 *Motivo:* ${text}${!MENU_AJUDA_BLOQUEADO ? '\n\nSe precisar de algo, digite *AJUDA*.' : ''}`,
      sessionId);
      const clinicaIdMotivo2 = aguardandoMotivoFinal.clinicaId || clinicaId;
      await salvarMensagemHistorico(clinicaIdMotivo2, motivoPacienteId, motivoPacienteNome, 'enviada', `Cancelamento registrado. Motivo: ${text}`, 'enviada', from);

      await fecharMensagensPendentes(clinicaIdMotivo2, from);
      if (clinicaIdMotivo2 !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
      await fecharDialogo(clinicaId, from);

      // ⭐⭐⭐ FIX v22.1: Notifica SSE para atualizar o card da agenda em tempo real ⭐⭐⭐
      if (global.notificarChegadaPaciente) {
        global.notificarChegadaPaciente({
          tipo: 'motivo_cancelamento', clinicaId: clinicaIdMotivo2,
          consultaId: aguardandoMotivoFinal.consultaId, pacienteId: motivoPacienteId, pacienteNome: motivoPacienteNome,
          motivoCancelamento: text, status: 'cancelada',
          dataCancelamento: aguardandoMotivoFinal._dataCancelamento,
          horaCancelamento: aguardandoMotivoFinal._horaCancelamento,
          canceladoPor: 'Paciente', canalCancelamento: 'WhatsApp'
        });
      }

      console.log(`📩📩📩 ======================================== FIM\n`);
      return;
    }

    // ⭐⭐⭐ FIX v9.9: BUSCA DIÁLOGO DE AJUDA COM MATCHING FLEXÍVEL ⭐⭐⭐
    // Tenta múltiplas chaves: chave exata, chave canônica (últimos 9 dígitos), e busca por variações
    const chave9Webhook = `${clinicaId}_9_${ultimos9}`;

    let dialogoAjudaPreCheck = dialogosAjuda.get(chaveDialogo);

    // Se não encontrou pela chave exata, tenta pela chave canônica (últimos 9 dígitos)
    if (!dialogoAjudaPreCheck) {
      dialogoAjudaPreCheck = dialogosAjuda.get(chave9Webhook);
      if (dialogoAjudaPreCheck) {
        console.log(`📩 [FIX v9.9] Diálogo encontrado via chave canônica: ${chave9Webhook}`);
      }
    }

    // Se ainda não encontrou, busca por variações de telefone em todas as chaves
    if (!dialogoAjudaPreCheck) {
      for (const [key, val] of dialogosAjuda.entries()) {
        if (!key.startsWith(clinicaId + '_')) continue;
        // Compara últimos 9 dígitos
        const keyUltimos9 = key.replace(`${clinicaId}_`, '').replace('9_', '').slice(-9);
        if (keyUltimos9 === ultimos9 && val.timestamp && Date.now() - val.timestamp < TEMPO_EXPIRACAO_AJUDA) {
          dialogoAjudaPreCheck = val;
          console.log(`📩 [FIX v9.9] Diálogo encontrado via matching de últimos 9 dígitos: ${key} (${keyUltimos9} === ${ultimos9})`);
          break;
        }
      }
    }

    let dialogoAjudaAtivoPreCheck = dialogoAjudaPreCheck && Date.now() - dialogoAjudaPreCheck.timestamp < TEMPO_EXPIRACAO_AJUDA;
    const isOpcaoMenu = ['1', '2', '3', '4', '5', '6', '7', '0'].includes(textoUpper);

    // ⭐⭐⭐ FIX v20.2: "0" É COMANDO DE SAÍDA UNIVERSAL ⭐⭐⭐
    // Se o paciente digita "0", SEMPRE trata como "sair" — nunca como confirmação/cancelamento.
    // Isso evita que o paciente fique preso num loop de confirmação quando quer apenas sair.
    if (textoUpper === '0') {
      console.log(`📩 [FIX v20.2] ⏹️ Paciente digitou "0" — SAÍDA UNIVERSAL`);

      // Fecha tudo: diálogos, pendentes, etc.
      dialogosAjuda.delete(chaveDialogo);
      dialogosAjuda.delete(`${clinicaId}_9_${ultimos9}`);
      await fecharMensagensPendentes(clinicaId, from);
      await fecharDialogo(clinicaId, from);

      const msgSaida = `👋 Obrigado pelo contato, ${pacienteNome !== 'Desconhecido' ? pacienteNome : ''}!${!MENU_AJUDA_BLOQUEADO ? ' Se precisar de algo, digite *AJUDA* a qualquer momento.' : ''}`;
      await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgSaida, sessionId);
      await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgSaida, 'enviada', from);

      console.log(`📩 [FIX v20.2] ✅ Tudo fechado. Paciente liberado.`);
      console.log(`📩📩📩 ======================================== FIM\n`);
      return;
    }

    // ⭐⭐⭐ FIX v10.9: CONFIRMAÇÃO DE CONSULTA TEM PRIORIDADE SOBRE MENU ⭐⭐⭐
    // Verifica se há consulta pendente de confirmação ANTES de processar menu de ajuda.
    // Isso resolve o problema de "Não entendi" quando paciente responde ao lembrete.

    // PASSO 1: Resolve pacienteId via mensagem pendente se necessário
    if ((!pacienteId || pacienteId === 'desconhecido' || pacienteId.startsWith('tel_')) && mensagemPendente) {
      const mpPacienteId = mensagemPendente.pacienteId;
      if (mpPacienteId && mpPacienteId !== 'desconhecido' && !mpPacienteId.startsWith('tel_')) {
        console.log(`📅 [FIX v10.9] PacienteId resolvido via mensagem pendente: ${mpPacienteId}`);
        pacienteId = mpPacienteId;
        pacienteNome = mensagemPendente.pacienteNome || pacienteNome;
      }
    }

    // PASSO 2: Busca consulta pendente de confirmação
    let consultaParaProcessar = null;
    let consultaViaFallback = false;
    // ⭐⭐⭐ FIX v19.0: Declaração antecipada para uso no bloco de busca direta por consultaId ⭐⭐⭐
    let dbParaUpdate = db; // Por padrão, usa o db da clínica primária
    let clinicaIdParaUpdate = clinicaId;

    // ⭐⭐⭐ FIX v10.9.1: Detecta se a mensagem pendente é de CONFIRMAÇÃO DE CONSULTA ⭐⭐⭐
    // Isso é CRUCIAL: se o lembrete foi enviado, a mensagem pendente contém o texto do lembrete.
    // Usamos isso para saber que o paciente está respondendo a uma confirmação.
    const mensagemPendenteConteudo = (mensagemPendente?.conteudo || '').toUpperCase();
    // ⭐⭐⭐ FIX v20.2: Indicadores de que a mensagem é do MENU DE AJUDA (NÃO é confirmação) ⭐⭐⭐
    const isMenuIndicator = mensagemPendenteConteudo.includes('DIGITE OUTRO NÚMERO') ||
    mensagemPendenteConteudo.includes('COMO POSSO AJUDAR') ||
    mensagemPendenteConteudo.includes('OPÇÃO DESEJADA') ||
    mensagemPendenteConteudo.includes('SUAS PRÓXIMAS CONSULTAS');
    // ⭐⭐⭐ FIX v21.0: Se a mensagem pendente tem consultaId, É confirmação (independente do template) ⭐⭐⭐
    const temConsultaIdNaMensagem = !!mensagemPendente?.consultaId;
    const isPendenciaConfirmacao = mensagemPendente && !isMenuIndicator && (
    temConsultaIdNaMensagem ||
    mensagemPendenteConteudo.includes('LEMBRAMOS QUE VOCÊ TEM') ||
    mensagemPendenteConteudo.includes('LEMBRETE DE CONSULTA') ||
    mensagemPendenteConteudo.includes('CONFIRME SUA PRESENÇA') ||
    mensagemPendenteConteudo.includes('CONFIRMAR SUA PRESENÇA') ||
    mensagemPendenteConteudo.includes('CONSULTA AGENDADA') ||
    mensagemPendenteConteudo.includes('CONFIRMAR') && mensagemPendenteConteudo.includes('CANCELAR') && mensagemPendenteConteudo.includes('RESPONDA COM O NÚMERO') ||
    mensagemPendenteConteudo.includes('CONFIRMAR') && mensagemPendenteConteudo.includes('PRESENÇA') && !mensagemPendenteConteudo.includes('MINHAS CONSULTAS'));


    if (isPendenciaConfirmacao) {
      console.log(`📅 [FIX v10.9.1] ✅ Mensagem pendente é CONFIRMAÇÃO DE CONSULTA!`);
      console.log(`   Conteúdo: ${mensagemPendente.conteudo?.substring(0, 80)}...`);
      console.log(`   consultaId na mensagem: ${mensagemPendente.consultaId || '(NÃO GRAVADO)'}`);
    }

    // ⭐⭐⭐ FIX v19.0 + FIX v22.0: Se a mensagem pendente tem consultaId, busca a consulta DIRETAMENTE por ID ⭐⭐⭐
    // v22.0: Busca PRIMEIRO na clínica onde a mensagem pendente foi encontrada (mais confiável)
    const consultaIdDaMensagemPendente = mensagemPendente?.consultaId || null;
    if (consultaIdDaMensagemPendente && isPendenciaConfirmacao) {
      console.log(`📅 [FIX v22.0] ✅ consultaId encontrado na mensagem pendente: ${consultaIdDaMensagemPendente} (clínica da msg: ${mensagemPendenteClinicaId})`);

      // ⭐⭐⭐ FIX v22.0: Busca PRIMEIRO na clínica da mensagem pendente (onde o lembrete foi salvo) ⭐⭐⭐
      const dbDaMensagem = getClinicaDB(mensagemPendenteClinicaId);
      const consultaDireta = await new Promise((r) => dbDaMensagem.get(
        `SELECT c.*, c.profissional as profissionalNome FROM consultas c WHERE c.id = ? LIMIT 1`,
        [consultaIdDaMensagemPendente],
        (err, row) => {
          if (err) console.log(`📅 [FIX v22.0] Erro busca direta na clínica ${mensagemPendenteClinicaId}: ${err.message}`);
          r(row || null);
        }
      ));

      if (consultaDireta) {
        console.log(`📅 [FIX v22.0] ✅ Consulta encontrada na clínica da mensagem pendente: ${consultaDireta.id} (status=${consultaDireta.status}, data=${consultaDireta.data}, prof=${consultaDireta.profissional})`);
        consultaParaProcessar = consultaDireta;
        dbParaUpdate = dbDaMensagem;
        clinicaIdParaUpdate = mensagemPendenteClinicaId;
      } else {
        // Se não encontrou na clínica da mensagem, tenta na primária e depois cross-clínica
        console.log(`📅 [FIX v22.0] Consulta ${consultaIdDaMensagemPendente} não encontrada na clínica ${mensagemPendenteClinicaId} - tentando outras...`);

        // Tenta na clínica primária (se diferente)
        if (mensagemPendenteClinicaId !== clinicaId) {
          const consultaPrimaria = await new Promise((r) => db.get(
            `SELECT c.*, c.profissional as profissionalNome FROM consultas c WHERE c.id = ? LIMIT 1`,
            [consultaIdDaMensagemPendente],
            (err, row) => r(row || null)
          ));
          if (consultaPrimaria) {
            console.log(`📅 [FIX v22.0] ✅ Consulta encontrada na clínica primária ${clinicaId}`);
            consultaParaProcessar = consultaPrimaria;
          }
        }

        // Tenta cross-clínica
        if (!consultaParaProcessar) {
          try {
            const todasClinicas = await buscarTodasClinicasPorSession(sessionId);
            for (const altClinica of todasClinicas) {
              if (altClinica.clinicaId === clinicaId || altClinica.clinicaId === mensagemPendenteClinicaId) continue;
              const altDb = getClinicaDB(altClinica.clinicaId);
              const altConsulta = await new Promise((r) => altDb.get(
                `SELECT c.*, c.profissional as profissionalNome FROM consultas c WHERE c.id = ? LIMIT 1`,
                [consultaIdDaMensagemPendente],
                (err, row) => r(row || null)
              ));
              if (altConsulta) {
                console.log(`📅 [FIX v22.0] ✅ Consulta encontrada na clínica ${altClinica.clinicaId}!`);
                consultaParaProcessar = altConsulta;
                dbParaUpdate = altDb;
                clinicaIdParaUpdate = altClinica.clinicaId;
                break;
              }
            }
          } catch (e19) {
            console.log(`📅 [FIX v22.0] ⚠️ Erro cross-clínica: ${e19.message}`);
          }
        }
      }
    }

    // ⭐⭐⭐ FIX v20.2: Se há diálogo de ajuda ATIVO e o texto é opção de menu (1-7), ⭐⭐⭐
    // SEMPRE processar como opção do menu — NUNCA como confirmação/cancelamento de consulta!
    // "1" no menu = "Minhas consultas", NÃO "Confirmar consulta"
    // "2" no menu = "Horário de funcionamento", NÃO "Cancelar consulta"
    // Para confirmar/cancelar consulta, paciente deve usar SIM/NÃO/CONFIRMAR/CANCELAR (palavras).
    // REMOVIDO FIX v12.6: A exceção que dava prioridade à confirmação causava confusão —
    // paciente no menu digitava "1" esperando "Minhas consultas" e confirmava consulta sem querer.
    const isMenuAtivoComOpcao = dialogoAjudaAtivoPreCheck && isOpcaoMenu;

    if (isMenuAtivoComOpcao) {
      console.log(`📅 [FIX v20.2] ⏭️ MENU DE AJUDA ATIVO + opção "${textoUpper}" → PROCESSANDO COMO MENU (nunca como confirmação)`);
    }

    // ⭐⭐⭐ FIX v26.1: CONVENÇÃO DE DIÁLOGO ÚNICO — SÓ busca consulta se há diálogo aberto ⭐⭐⭐
    // Sem mensagem 'pendente' (diálogo aberto), o sistema NÃO busca consultas.
    // O paciente DEVE ter recebido um prompt (lembrete, menu, etc.) antes de sua resposta ser processada.
    // Isso impede que mensagens casuais "ressuscitem" diálogos e cancelem/confirmem consultas indevidamente.
    if (pacienteId && !pacienteId.startsWith('tel_') && !isMenuAtivoComOpcao && isPendenciaConfirmacao) {
      // ⭐⭐⭐ FIX v19.0: Se já encontrou via consultaId direto, pula busca por pacienteId ⭐⭐⭐
      if (!consultaParaProcessar) {
        const consultaPendente = await buscarConsultaAguardandoConfirmacao(db, pacienteId);

        if (consultaPendente) {
          consultaParaProcessar = consultaPendente;
          console.log(`📅 [FIX v10.9] ✅ Consulta encontrada via busca PADRÃO: ${consultaPendente.id}`);
        }
      } else {
        console.log(`📅 [FIX v19.0] ⏭️ Consulta já encontrada via consultaId direto (${consultaParaProcessar.id}) - pulando busca por pacienteId`);
      }

      if (!consultaParaProcessar) {
        // Usa matchConfirmacao/matchCancelamento (fuzzy) em vez de lista fixa
        const pareceResposta = matchConfirmacao(text) || matchCancelamento(text);

        // ⭐⭐⭐ FIX v26.1: Só processa como resposta se há diálogo aberto (isPendenciaConfirmacao já garantido acima) ⭐⭐⭐
        const deveProcessarComoResposta = pareceResposta || isPendenciaConfirmacao;

        if (deveProcessarComoResposta) {
          console.log(`📅 [FIX v10.9.1] Texto "${textoUpper}" - pareceResposta: ${pareceResposta}, isPendenciaConfirmacao: ${isPendenciaConfirmacao}`);
          console.log(`📅 [FIX v10.9.1] Buscando consulta com critérios AMPLOS...`);

          const hoje = new Date().toISOString().split('T')[0];

          // ⭐⭐⭐ FIX v10.9.3: REMOVIDO LEFT JOIN com usuarios - tabela consultas NÃO tem profissionalId! ⭐⭐⭐
          // Usa c.profissional diretamente (campo TEXT que já contém o nome do profissional)
          let consultaFallback = await new Promise((r) => db.get(
            `SELECT c.*, c.profissional as profissionalNome FROM consultas c
             WHERE c.pacienteId = ? 
               AND c.data >= ? 
               AND c.status != 'cancelada'
               AND c.confirmacaoRecebidaEm IS NULL
             ORDER BY c.data ASC, c.horario ASC 
             LIMIT 1`,
            [pacienteId, hoje],
            (err, row) => {
              if (err) console.log(`📅 [FIX v10.9.3] Erro busca ampla: ${err.message}`);
              r(row || null);
            }
          ));

          // ⭐⭐⭐ FIX v10.9.1: Se ainda não encontrou, tenta com data de ontem (problema de timezone) ⭐⭐⭐
          if (!consultaFallback) {
            const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            console.log(`📅 [FIX v10.9.3] Não encontrou com data >= ${hoje}, tentando >= ${ontem}...`);
            consultaFallback = await new Promise((r) => db.get(
              `SELECT c.*, c.profissional as profissionalNome FROM consultas c
               WHERE c.pacienteId = ? 
                 AND c.data >= ? 
                 AND c.status != 'cancelada'
                 AND c.confirmacaoRecebidaEm IS NULL
               ORDER BY c.data ASC, c.horario ASC 
               LIMIT 1`,
              [pacienteId, ontem],
              (err, row) => {
                if (err) console.log(`📅 [FIX v10.9.3] Erro busca ontem: ${err.message}`);
                r(row || null);
              }
            ));
          }

          // ⭐⭐⭐ FIX v22.0: REMOVIDO fallback "QUALQUER consulta" sem filtro de data ⭐⭐⭐
          // Esse fallback era PERIGOSO: encontrava consultas de 2014, de outras clínicas, etc.
          // Se já temos consultaId da mensagem pendente e não encontramos, NÃO devemos adivinhar.
          if (!consultaFallback && !consultaIdDaMensagemPendente) {
            // Só usa fallback amplo se NÃO temos consultaId (caso raro de mensagens antigas sem consultaId)
            const umaSemanaAtras = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            console.log(`📅 [FIX v22.0] Não encontrou com filtros normais. Tentando consultas recentes (>= ${umaSemanaAtras})...`);
            consultaFallback = await new Promise((r) => db.get(
              `SELECT c.*, c.profissional as profissionalNome FROM consultas c
               WHERE c.pacienteId = ? 
                 AND c.data >= ?
                 AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
                 AND c.confirmacaoRecebidaEm IS NULL
               ORDER BY c.data DESC, c.horario DESC 
               LIMIT 1`,
              [pacienteId, umaSemanaAtras],
              (err, row) => {
                if (err) console.log(`📅 [FIX v10.9.3] Erro busca última: ${err.message}`);
                r(row || null);
              }
            ));
            if (consultaFallback) {
              console.log(`📅 [FIX v10.9.3] ✅ Encontrada consulta (sem filtro de data): ${consultaFallback.id} data=${consultaFallback.data} status=${consultaFallback.status}`);
            }
          }

          // ⭐⭐⭐ FIX v10.9.1: DEBUG - lista todas as consultas do paciente se nada foi encontrado ⭐⭐⭐
          if (!consultaFallback) {
            console.log(`📅 [FIX v10.9.3] ❌ NENHUMA consulta encontrada para pacienteId=${pacienteId}. Listando todas:`);
            const todasConsultas = await new Promise((r) => db.all(
              `SELECT id, data, horario, status, lembreteEnviado, confirmacaoRecebidaEm, profissional 
               FROM consultas WHERE pacienteId = ? ORDER BY data DESC LIMIT 10`,
              [pacienteId],
              (err, rows) => r(rows || [])
            ));
            todasConsultas.forEach((c, i) => {
              console.log(`   ${i + 1}. ID=${c.id} Data=${c.data} Hora=${c.horario} Status=${c.status} Lembrete=${c.lembreteEnviado} ConfirmadaEm=${c.confirmacaoRecebidaEm} Prof=${c.profissional}`);
            });
            if (todasConsultas.length === 0) {
              console.log(`   (NENHUMA consulta no banco para este pacienteId!)`);
              // ⭐ Busca por nome REMOVIDA — somente IDs são usados para localizar consultas
              console.log(`📅 [webhook] Nenhuma consulta encontrada para pacienteId=${pacienteId}. Busca por nome desabilitada.`);
            }
          }

          if (consultaFallback) {
            console.log(`📅 [FIX v10.9.1] ✅ Consulta via FALLBACK: ${consultaFallback.id} (data=${consultaFallback.data}, status=${consultaFallback.status})`);
            consultaParaProcessar = consultaFallback;
            consultaViaFallback = true;
            // Marca lembreteEnviado para consistência
            await new Promise((r) => db.run(
              `UPDATE consultas SET lembreteEnviado = 1 WHERE id = ?`,
              [consultaFallback.id], () => r()
            ));
          } else {
            console.log(`📅 [FIX v10.9.1] ❌ NENHUMA consulta encontrada por NENHUM método para pacienteId=${pacienteId}`);
          }
        }
      }
    }

    // ⭐⭐⭐ FIX v17.0: BUSCA CROSS-CLÍNICA PARA CONFIRMAÇÃO DE CONSULTA ⭐⭐⭐
    // Problema: múltiplas clínicas compartilham a mesma sessão WhatsApp.
    // O lembrete pode ter sido enviado por uma clínica diferente da que o webhook resolveu.
    // Se não encontrou consulta na clínica primária, busca em TODAS as clínicas da sessão.
    // (dbParaUpdate e clinicaIdParaUpdate já declarados acima no PASSO 2)

    if (!consultaParaProcessar && !isMenuAtivoComOpcao) {
      const pareceRespostaCross = matchConfirmacao(text) || matchCancelamento(text);

      // ⭐⭐⭐ FIX v26.1: Só busca cross-clínica quando HÁ diálogo aberto (mensagem pendente) ⭐⭐⭐
      // Sem diálogo aberto, NENHUMA busca por consultas é feita — nem na clínica primária, nem cross-clínica.
      // O paciente DEVE ter recebido um prompt (lembrete) que criou uma mensagem 'pendente' primeiro.
      // Se o lembrete foi enviado por outra clínica, buscarMensagemPendente (linha ~1062) já o encontra cross-clínica.
      if (isPendenciaConfirmacao) {
        try {
          const todasClinicas = await buscarTodasClinicasPorSession(sessionId);
          const outrasClinicas = todasClinicas.filter((c) => c.clinicaId !== clinicaId);

          if (outrasClinicas.length > 0) {
            console.log(`📅 [FIX v17.0] 🔍 BUSCA CROSS-CLÍNICA: ${outrasClinicas.length} clínica(s) alternativa(s) para sessão "${sessionId}"`);

            for (const altClinica of outrasClinicas) {
              const altDb = getClinicaDB(altClinica.clinicaId);

              // 1. Busca mensagem pendente (lembrete) nesta clínica alternativa
              const altMsgPendente = await buscarMensagemPendente(altClinica.clinicaId, from);

              if (altMsgPendente) {
                const altConteudo = (altMsgPendente.conteudo || '').toUpperCase();
                const altIsPendenciaConfirmacao =
                altConteudo.includes('LEMBRAMOS QUE VOCÊ TEM') ||
                altConteudo.includes('LEMBRETE DE CONSULTA') ||
                altConteudo.includes('CONFIRME SUA PRESENÇA') ||
                altConteudo.includes('CONFIRMAR SUA PRESENÇA') ||
                altConteudo.includes('CONSULTA AGENDADA') ||
                altConteudo.includes('CONFIRMAR') && altConteudo.includes('CANCELAR') && altConteudo.includes('RESPONDA COM O NÚMERO') ||
                altConteudo.includes('CONFIRMAR') && altConteudo.includes('CANCELAR') && altConteudo.includes('PRESENÇA') ||
                altConteudo.includes('CONSULTA') && (altConteudo.includes('CONFIRMAR') || altConteudo.includes('CONFIRME') || altConteudo.includes('PRESENÇA'));


                if (altIsPendenciaConfirmacao) {
                  console.log(`📅 [FIX v17.0] ✅ LEMBRETE encontrado na clínica ${altClinica.clinicaId}!`);
                  console.log(`   Conteúdo: ${altMsgPendente.conteudo?.substring(0, 80)}...`);

                  // Busca paciente nesta clínica
                  const altPacienteId = altMsgPendente.pacienteId || pacienteId;

                  if (altPacienteId && !altPacienteId.startsWith('tel_')) {
                    // Busca consulta aguardando confirmação
                    let altConsulta = await buscarConsultaAguardandoConfirmacao(altDb, altPacienteId);

                    // Se não encontrou com critérios estritos, tenta amplo
                    if (!altConsulta) {
                      const hoje = new Date().toISOString().split('T')[0];
                      altConsulta = await new Promise((r) => altDb.get(
                        `SELECT c.*, c.profissional as profissionalNome FROM consultas c
                         WHERE c.pacienteId = ? 
                           AND c.data >= ? 
                           AND c.status != 'cancelada'
                           AND c.confirmacaoRecebidaEm IS NULL
                         ORDER BY c.data ASC, c.horario ASC 
                         LIMIT 1`,
                        [altPacienteId, hoje],
                        (err, row) => r(row || null)
                      ));
                    }

                    if (altConsulta) {
                      console.log(`📅 [FIX v17.0] ✅ CONSULTA ENCONTRADA cross-clínica! ID=${altConsulta.id} na clínica ${altClinica.clinicaId}`);
                      console.log(`   Data: ${altConsulta.data} Hora: ${altConsulta.horario} Prof: ${altConsulta.profissional}`);
                      consultaParaProcessar = altConsulta;
                      dbParaUpdate = altDb;
                      clinicaIdParaUpdate = altClinica.clinicaId;
                      // Fecha pendentes na clínica alternativa
                      await fecharMensagensPendentes(altClinica.clinicaId, from);
                      break;
                    }
                  }
                }
              }

              // 2. Mesmo sem mensagem pendente, busca consulta diretamente se o paciente existe lá
              if (!consultaParaProcessar && pacienteId && !pacienteId.startsWith('tel_')) {
                const altConsultaDireta = await buscarConsultaAguardandoConfirmacao(altDb, pacienteId);
                if (altConsultaDireta) {
                  console.log(`📅 [FIX v17.0] ✅ CONSULTA ENCONTRADA cross-clínica (busca direta)! ID=${altConsultaDireta.id} na clínica ${altClinica.clinicaId}`);
                  consultaParaProcessar = altConsultaDireta;
                  dbParaUpdate = altDb;
                  clinicaIdParaUpdate = altClinica.clinicaId;
                  break;
                }
              }
            }

            if (!consultaParaProcessar) {
              console.log(`📅 [FIX v17.0] ❌ Nenhuma consulta encontrada em nenhuma clínica da sessão`);
            }
          }
        } catch (crossErr) {
          console.log(`📅 [FIX v17.0] ⚠️ Erro na busca cross-clínica: ${crossErr.message}`);
        }
      }
    }

    // PASSO 3: Se há consulta pendente, processa confirmação/cancelamento
    const isComandoMenu = ['AJUDA', 'OI', 'OLA', 'OLÁ', 'MENU', 'BOM DIA', 'BOA TARDE', 'BOA NOITE', 'HELLO', 'HI'].includes(textoUpper);
    const isRespostaConfirmacao = matchConfirmacao(text);
    const isRespostaCancelamento = matchCancelamento(text);

    // ⭐⭐⭐ DIAGNÓSTICO v23.0: Log detalhado para debug de confirmação ⭐⭐⭐
    console.log(`📅 [DIAG v23.0] === DECISÃO DE CONFIRMAÇÃO ===`);
    console.log(`   Texto: "${textoUpper}" | matchConfirmacao: ${isRespostaConfirmacao} | matchCancelamento: ${isRespostaCancelamento}`);
    console.log(`   consultaParaProcessar: ${consultaParaProcessar ? consultaParaProcessar.id + ' (status=' + consultaParaProcessar.status + ', data=' + consultaParaProcessar.data + ')' : '❌ NULL'}`);
    console.log(`   pacienteId: ${pacienteId || '❌ NULL'} | pacienteNome: ${pacienteNome}`);
    console.log(`   mensagemPendente: ${mensagemPendente ? 'SIM (id=' + mensagemPendente.id + ', consultaId=' + (mensagemPendente.consultaId || 'N/A') + ', clínica=' + mensagemPendenteClinicaId + ')' : '❌ NENHUMA'}`);
    console.log(`   isPendenciaConfirmacao: ${isPendenciaConfirmacao} | isMenuAtivoComOpcao: ${isMenuAtivoComOpcao} | isComandoMenu: ${isComandoMenu}`);
    console.log(`   dialogoAjudaAtivo: ${dialogoAjudaAtivoPreCheck} | isOpcaoMenu: ${isOpcaoMenu}`);
    if (!consultaParaProcessar && isRespostaConfirmacao) {
      console.log(`   ⚠️ PROBLEMA: Paciente enviou confirmação mas NÃO há consulta para processar!`);
      if (!pacienteId || pacienteId === 'desconhecido' || pacienteId.startsWith('tel_')) {
        console.log(`   ⚠️ CAUSA PROVÁVEL: pacienteId não resolvido (${pacienteId}) — telefone do remetente não bate com nenhum paciente`);
      }
      if (!mensagemPendente) {
        console.log(`   ⚠️ CAUSA PROVÁVEL: Nenhuma mensagem pendente encontrada para chatId ${from}`);
      }
    }
    if (isMenuAtivoComOpcao && isRespostaConfirmacao) {
      console.log(`   ⚠️ CONFLITO: "1" seria confirmação MAS menu de ajuda está ativo → será tratado como opção do menu!`);
    }
    console.log(`📅 [DIAG v23.0] ==============================`);

    // ⭐⭐⭐ FIX v10.9.4: Não processar confirmação/cancelamento se menu de ajuda está ativo ⭐⭐⭐
    if (consultaParaProcessar && (isRespostaConfirmacao || isRespostaCancelamento) && !isComandoMenu && !isMenuAtivoComOpcao) {

      // ⭐⭐⭐ FIX v23.1: Resolve nome correto via consulta > tabela pacientes > telefone ⭐⭐⭐
      const nomePacienteCorreto = await resolverNomePaciente(dbParaUpdate, consultaParaProcessar, pacienteNome);
      const pacienteIdCorreto = consultaParaProcessar.pacienteId || pacienteId;
      console.log(`📅 [FIX v23.1] Nome da consulta: "${consultaParaProcessar.pacienteNome}" | Nome do telefone: "${pacienteNome}" | Resolvido: "${nomePacienteCorreto}"`);

      console.log(`📅 [FIX v10.9] ✅ PRIORIDADE: CONFIRMAÇÃO/CANCELAMENTO (consulta ${consultaParaProcessar.id})`);
      console.log(`   Texto: "${text}" → Confirmação: ${isRespostaConfirmacao}, Cancelamento: ${isRespostaCancelamento}`);

      if (isRespostaConfirmacao) {
        console.log(`📅 ✅ Paciente CONFIRMOU a consulta ${consultaParaProcessar.id}`);
        const agora = new Date().toISOString();
        await new Promise((r) => dbParaUpdate.run(
          `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ? WHERE id = ?`,
          [agora, consultaParaProcessar.id],
          function (err) {
            if (err) console.log(`📅 ❌ Erro ao confirmar: ${err.message}`);else
            console.log(`📅 ✅ Consulta ${consultaParaProcessar.id} → 'confirmada' (changes: ${this?.changes || 'N/A'})`);
            r();
          }
        ));
        // ⭐⭐⭐ FIX: Verificação pós-UPDATE para garantir que gravou ⭐⭐⭐
        const verificacaoMain = await new Promise((r) => dbParaUpdate.get(
          `SELECT status, confirmacaoRecebidaEm FROM consultas WHERE id = ?`,
          [consultaParaProcessar.id],
          (err, row) => r(row)
        ));
        if (!verificacaoMain || verificacaoMain.status !== 'confirmada') {
          console.log(`📅 ⚠️ [MAIN] VERIFICAÇÃO FALHOU! status=${verificacaoMain?.status}, confirmacaoRecebidaEm=${verificacaoMain?.confirmacaoRecebidaEm} → RETRY`);
          await new Promise((r) => dbParaUpdate.run(
            `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ? WHERE id = ?`,
            [agora, consultaParaProcessar.id],
            function (err) {
              if (err) console.log(`📅 ❌ [MAIN] RETRY erro: ${err.message}`);else
              console.log(`📅 ✅ [MAIN] RETRY OK (changes: ${this?.changes || 'N/A'})`);
              r();
            }
          ));
        } else {
          console.log(`📅 ✅ [MAIN] VERIFICAÇÃO OK: status=${verificacaoMain.status}, confirmacaoRecebidaEm=${verificacaoMain.confirmacaoRecebidaEm}`);
        }

        // ⭐⭐⭐ FIX v24.0: Confirma TODAS as consultas do mesmo paciente no mesmo dia ⭐⭐⭐
        // Quando paciente tem 2+ horários no mesmo dia, confirma todos de uma vez
        const pacIdConfirm = consultaParaProcessar.pacienteId;
        const dataConfirm = consultaParaProcessar.data;
        if (pacIdConfirm && dataConfirm) {
          const outrasConfirmadas = await new Promise((r) => dbParaUpdate.run(
            `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ? WHERE pacienteId = ? AND data = ? AND id != ? AND status IN ('agendada', 'aguardando_confirmacao')`,
            [agora, pacIdConfirm, dataConfirm, consultaParaProcessar.id],
            function (err) {
              if (err) {
                console.log(`📅 [FIX v24.0] ⚠️ Erro ao confirmar outras consultas: ${err.message}`);
                r(0);
              } else {
                console.log(`📅 [FIX v24.0] ✅ ${this?.changes || 0} consulta(s) adicional(is) confirmada(s) para paciente ${pacIdConfirm} em ${dataConfirm}`);
                r(this?.changes || 0);
              }
            }
          ));
        }

        const profNome = consultaParaProcessar.profissionalNome || consultaParaProcessar.profissional || 'o profissional';
        const dataFormatada = formatarData(consultaParaProcessar.data);
        const refConsulta = consultaParaProcessar.id ? `CON-${consultaParaProcessar.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
        // ⭐⭐⭐ FIX v23.0: Usa nomePacienteCorreto (da consulta) em vez de pacienteNome (do telefone) ⭐⭐⭐
        const msgConfirmacao = `✅ *CONSULTA CONFIRMADA!*\n\n📅 ${dataFormatada} às ${consultaParaProcessar.horario}\n👨‍⚕️ ${profNome}${refConsulta ? `\n🔖 *Ref:* ${refConsulta}` : ''}\n\nObrigado, ${nomePacienteCorreto}! Sua presença está confirmada.${!MENU_AJUDA_BLOQUEADO ? '\n\n_Se precisar de algo, digite *AJUDA*._' : ''}`;

        await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgConfirmacao, sessionId);
        // ⭐⭐⭐ FIX v18.0 + v23.0: Usa pacienteIdCorreto e nomePacienteCorreto ⭐⭐⭐
        await salvarMensagemHistorico(clinicaIdParaUpdate, pacienteIdCorreto, nomePacienteCorreto, 'enviada', msgConfirmacao, 'enviada', from, consultaParaProcessar.id);
        await fecharMensagensPendentes(clinicaIdParaUpdate, from);
        // Também fecha pendentes na clínica primária e na clínica da mensagem pendente
        if (clinicaIdParaUpdate !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
        if (mensagemPendenteClinicaId && mensagemPendenteClinicaId !== clinicaIdParaUpdate && mensagemPendenteClinicaId !== clinicaId) {
          await fecharMensagensPendentes(mensagemPendenteClinicaId, from);
        }
        dialogosAjuda.delete(chaveDialogo);
        dialogosAjuda.delete(`${clinicaId}_9_${ultimos9}`);

        if (global.notificarChegadaPaciente) {
          global.notificarChegadaPaciente({
            tipo: 'confirmacao_consulta', clinicaId: clinicaIdParaUpdate,
            consultaId: consultaParaProcessar.id, pacienteId: pacienteIdCorreto, pacienteNome: nomePacienteCorreto,
            data: consultaParaProcessar.data, horario: consultaParaProcessar.horario,
            profissional: profNome, status: 'confirmada'
          });
        }
        // ⭐⭐⭐ FIX v25.2: COOLDOWN — impede que mensagens seguintes sejam processadas como confirmação/cancelamento de OUTRA consulta ⭐⭐⭐
        cooldownConfirmacao.set(chaveDialogo, { timestamp: Date.now(), consultaId: consultaParaProcessar.id, acao: 'confirmada' });
        cooldownConfirmacao.set(`${clinicaId}_9_${ultimos9}`, { timestamp: Date.now(), consultaId: consultaParaProcessar.id, acao: 'confirmada' });
        console.log(`📅 [FIX v25.2] ✅ Cooldown ativado para ${chaveDialogo} (3 min)`);

        console.log(`📅📅📅 ======================================== FIM\n`);
        return;
      }

      if (isRespostaCancelamento) {
        console.log(`📅 ❌ Paciente CANCELOU a consulta ${consultaParaProcessar.id}`);
        const agora = new Date().toISOString();
        const cancelBR1 = agoraCancelamentoBR();
        // Status gravado SÓ com colunas garantidas (nunca falha por coluna ausente).
        await new Promise((r) => dbParaUpdate.run(
          `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ? WHERE id = ?`,
          [agora, consultaParaProcessar.id],
          function (err) {
            if (err) console.log(`📅 ❌ Erro ao cancelar: ${err.message}`);else
            console.log(`📅 ✅ Consulta ${consultaParaProcessar.id} → 'cancelada' (changes: ${this?.changes || 'N/A'})`);
            r();
          }
        ));
        // Data/hora + proveniência via helper best-effort auto-curável.
        await gravarMetadadosCancelamento(dbParaUpdate, consultaParaProcessar.id, {
          data: cancelBR1.dataCancelamento, hora: cancelBR1.horaCancelamento
        });
        // ⭐⭐⭐ FIX: Verificação pós-UPDATE para garantir que gravou ⭐⭐⭐
        const verificacaoCancel = await new Promise((r) => dbParaUpdate.get(
          `SELECT status, confirmacaoRecebidaEm FROM consultas WHERE id = ?`,
          [consultaParaProcessar.id],
          (err, row) => r(row)
        ));
        if (!verificacaoCancel || verificacaoCancel.status !== 'cancelada') {
          console.log(`📅 ⚠️ [CANCEL] VERIFICAÇÃO FALHOU! status=${verificacaoCancel?.status} → RETRY`);
          await new Promise((r) => dbParaUpdate.run(
            `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ? WHERE id = ?`,
            [agora, consultaParaProcessar.id],
            function (err) {
              if (err) console.log(`📅 ❌ [CANCEL] RETRY erro: ${err.message}`);else
              console.log(`📅 ✅ [CANCEL] RETRY OK (changes: ${this?.changes || 'N/A'})`);
              r();
            }
          ));
          await gravarMetadadosCancelamento(dbParaUpdate, consultaParaProcessar.id, {
            data: cancelBR1.dataCancelamento, hora: cancelBR1.horaCancelamento
          });
        } else {
          console.log(`📅 ✅ [CANCEL] VERIFICAÇÃO OK: status=${verificacaoCancel.status}`);
        }

        const profNome = consultaParaProcessar.profissionalNome || consultaParaProcessar.profissional || 'o profissional';
        const dataFormatada = formatarData(consultaParaProcessar.data);
        // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
        limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
        // ⭐⭐⭐ FIX v10.9.7 + v23.0: Salva motivo com nomes corretos da consulta ⭐⭐⭐
        const motivoData = {
          consultaId: consultaParaProcessar.id, pacienteId: pacienteIdCorreto, pacienteNome: nomePacienteCorreto, clinicaId: clinicaIdParaUpdate, timestamp: Date.now()
        };
        conversasAguardandoMotivo.set(chaveDialogo, motivoData);
        conversasAguardandoMotivo.set(`${clinicaId}_9_${ultimos9}`, motivoData);
        console.log(`📩 [FIX v10.9.7] Motivo aguardado com chaves: ${chaveDialogo} e ${clinicaId}_9_${ultimos9}`);

        const refConsultaCancel = consultaParaProcessar.id ? `CON-${consultaParaProcessar.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
        const msgCancelamento = `❌ *CONSULTA CANCELADA*\n\n📅 ${dataFormatada} às ${consultaParaProcessar.horario}\n👨‍⚕️ ${profNome}${refConsultaCancel ? `\n🔖 *Ref:* ${refConsultaCancel}` : ''}\n\n📝 Por favor, informe o *MOTIVO DO CANCELAMENTO*:`;
        await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgCancelamento, sessionId);
        // ⭐⭐⭐ FIX v11.0: Fecha pendentes anteriores ANTES de salvar nova pendente ⭐⭐⭐
        await fecharMensagensPendentes(clinicaIdParaUpdate, from);
        if (clinicaIdParaUpdate !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
        // ⭐⭐⭐ FIX v18.0 + v23.0: Usa pacienteIdCorreto e nomePacienteCorreto ⭐⭐⭐
        await salvarMensagemHistorico(clinicaIdParaUpdate, pacienteIdCorreto, nomePacienteCorreto, 'enviada', msgCancelamento, 'pendente', from, consultaParaProcessar.id);

        if (global.notificarChegadaPaciente) {
          global.notificarChegadaPaciente({
            tipo: 'cancelamento_consulta', clinicaId: clinicaIdParaUpdate,
            consultaId: consultaParaProcessar.id, pacienteId: pacienteIdCorreto, pacienteNome: nomePacienteCorreto,
            data: consultaParaProcessar.data, horario: consultaParaProcessar.horario,
            profissional: profNome, status: 'cancelada',
            dataCancelamento: cancelBR1.dataCancelamento, horaCancelamento: cancelBR1.horaCancelamento,
            canceladoPor: 'Paciente', canalCancelamento: 'WhatsApp'
          });
        }
        // ⭐⭐⭐ FIX v25.2: COOLDOWN — impede re-processamento de mensagens seguintes ⭐⭐⭐
        cooldownConfirmacao.set(chaveDialogo, { timestamp: Date.now(), consultaId: consultaParaProcessar.id, acao: 'cancelada' });
        cooldownConfirmacao.set(`${clinicaId}_9_${ultimos9}`, { timestamp: Date.now(), consultaId: consultaParaProcessar.id, acao: 'cancelada' });
        console.log(`📅 [FIX v25.2] ✅ Cooldown ativado para ${chaveDialogo} (3 min) — cancelamento`);

        console.log(`📅📅📅 ======================================== FIM\n`);
        return;
      }
    }

    // ⭐⭐⭐ FIX v25.2: VERIFICA COOLDOWN PÓS-CONFIRMAÇÃO/CANCELAMENTO ⭐⭐⭐
    // Se o paciente acabou de confirmar/cancelar uma consulta, NÃO processa mensagens
    // seguintes como confirmação/cancelamento de OUTRA consulta. Isso evita o bug onde
    // "No mesmo dia, manutenção de aparelho as 9:50" cancelava outra consulta.
    let emCooldown = cooldownConfirmacao.get(chaveDialogo) || cooldownConfirmacao.get(`${clinicaId}_9_${ultimos9}`);
    if (emCooldown && Date.now() - emCooldown.timestamp < TEMPO_COOLDOWN_CONFIRMACAO) {
      console.log(`📅 [FIX v25.2] ⏳ COOLDOWN ATIVO — paciente acabou de ${emCooldown.acao} consulta ${emCooldown.consultaId} há ${Math.round((Date.now() - emCooldown.timestamp) / 1000)}s`);
      console.log(`   Mensagem "${textoUpper.substring(0, 50)}" será IGNORADA para fins de confirmação/cancelamento de outras consultas`);
      // Limpa consultaParaProcessar para que PASSO 4 e buscas cross-clínica não re-processem
      consultaParaProcessar = null;
    } else if (emCooldown) {
      // Cooldown expirado, limpa
      cooldownConfirmacao.delete(chaveDialogo);
      cooldownConfirmacao.delete(`${clinicaId}_9_${ultimos9}`);
    }

    // PASSO 4: Se há consulta pendente mas texto não é confirmação/cancelamento claro
    // e NÃO é comando de menu, re-envia as opções
    // ⭐⭐⭐ FIX v10.9.4: Também pula se menu de ajuda está ativo com opção numérica ⭐⭐⭐
    if (consultaParaProcessar && !isComandoMenu && !isRespostaConfirmacao && !isRespostaCancelamento && !isMenuAtivoComOpcao) {
      const isOpcaoMenuComDialogo = dialogoAjudaAtivoPreCheck && ['1', '2', '3', '4', '5', '6', '7', '0'].includes(textoUpper);

      if (!isOpcaoMenuComDialogo) {
        console.log(`📅 [FIX v10.9] Consulta pendente mas "${textoUpper}" não reconhecida - re-enviando opções`);
        const profNome = consultaParaProcessar.profissionalNome || consultaParaProcessar.profissional || 'o profissional';
        const dataFormatada = formatarData(consultaParaProcessar.data);
        const refConsultaRePrompt = consultaParaProcessar.id ? `CON-${consultaParaProcessar.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
        const msgRePrompt = `Olá, ${pacienteNome}! 👋\n\nVocê tem uma consulta pendente de confirmação:\n\n📅 *Data:* ${dataFormatada}\n🕐 *Horário:* ${consultaParaProcessar.horario}\n👨‍⚕️ *Profissional:* ${profNome}${refConsultaRePrompt ? `\n🔖 *Ref:* ${refConsultaRePrompt}` : ''}\n\nResponda com o número:\n1️⃣ *Confirmar* presença\n2️⃣ *Cancelar* consulta\n\n_Ou responda *SIM* / *NÃO*. Digite *AJUDA* para ver outras opções._`;
        // ⭐⭐⭐ FIX v11.0: Fecha pendente anterior antes de salvar novo re-prompt como 'pendente' ⭐⭐⭐
        await fecharMensagensPendentes(clinicaIdParaUpdate, from);
        if (clinicaIdParaUpdate !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
        await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgRePrompt, sessionId);
        // ⭐⭐⭐ FIX v18.0: Passa consultaId no salvarMensagemHistorico ⭐⭐⭐
        await salvarMensagemHistorico(clinicaIdParaUpdate, pacienteId, pacienteNome, 'enviada', msgRePrompt, 'pendente', from, consultaParaProcessar.id);
        await new Promise((r) => dbParaUpdate.run(`UPDATE consultas SET lembreteEnviado = 1 WHERE id = ?`, [consultaParaProcessar.id], () => r()));
        console.log(`📩📩📩 ======================================== FIM\n`);
        return;
      }
    }

    // ⭐⭐⭐ FIX v10.9.2 + FIX v17.1 + FIX v26.0: CASO CRÍTICO - Consulta não encontrada mas texto parece resposta ⭐⭐⭐
    // FIX v26.0: SÓ entra quando há diálogo aberto (isPendenciaConfirmacao). Sem diálogo aberto,
    // mensagens casuais NÃO devem disparar busca ampla por consultas — isso causava cancelamentos indevidos.
    const pareceRespostaV10 = matchConfirmacao(text) || matchCancelamento(text);
    if (isPendenciaConfirmacao && !consultaParaProcessar && !isComandoMenu && !isMenuAtivoComOpcao) {
      console.log(`📅 [FIX v10.9.2/v17.1] ⚠️ CASO CRÍTICO: Nenhuma consulta encontrada! isPendencia=${!!isPendenciaConfirmacao}, pareceResposta=${pareceRespostaV10}`);
      console.log(`   pacienteId: ${pacienteId}, texto: "${textoUpper}"`);

      // ⭐⭐⭐ FIX v10.9.3: REMOVIDO LEFT JOIN - usa c.profissional diretamente ⭐⭐⭐
      let consultaJaConfirmada = null;
      let dbParaUpdateV10 = db;
      let clinicaIdParaUpdateV10 = clinicaId;

      if (pacienteId && !pacienteId.startsWith('tel_')) {
        // Busca na clínica primária primeiro
        consultaJaConfirmada = await new Promise((r) => db.get(
          `SELECT c.*, c.profissional as profissionalNome FROM consultas c
           WHERE c.pacienteId = ? 
             AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
           ORDER BY c.data DESC, c.horario DESC 
           LIMIT 1`,
          [pacienteId],
          (err, row) => {
            if (err) console.log(`📅 [FIX v10.9.3] Erro busca última tentativa: ${err.message}`);
            r(row || null);
          }
        ));

        // Também tenta com pacienteId como string e como número
        if (!consultaJaConfirmada) {
          const pacienteIdNum = parseInt(pacienteId, 10);
          const pacienteIdStr = String(pacienteId);
          if (!isNaN(pacienteIdNum)) {
            consultaJaConfirmada = await new Promise((r) => db.get(
              `SELECT c.*, c.profissional as profissionalNome FROM consultas c
               WHERE (c.pacienteId = ? OR c.pacienteId = ? OR CAST(c.pacienteId AS CHAR) = ?)
                 AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
               ORDER BY c.data DESC LIMIT 1`,
              [pacienteIdNum, pacienteIdStr, pacienteIdStr],
              (err, row) => {
                if (err) console.log(`📅 [FIX v10.9.3] Erro busca cast: ${err.message}`);
                r(row || null);
              }
            ));
          }
        }

        // ⭐⭐⭐ FIX v17.2: Se não encontrou na clínica primária, busca CROSS-CLÍNICA ⭐⭐⭐
        // IMPORTANTE: O pacienteId pode ser DIFERENTE em cada clínica!
        // Primeiro busca o paciente pelo TELEFONE na outra clínica, depois busca a consulta.
        if (!consultaJaConfirmada) {
          try {
            const todasClinicasV10 = await buscarTodasClinicasPorSession(sessionId);
            const outrasClinicasV10 = todasClinicasV10.filter((c) => c.clinicaId !== clinicaId);

            for (const altClinica of outrasClinicasV10) {
              const altDb = getClinicaDB(altClinica.clinicaId);

              // 1. Busca paciente pelo TELEFONE nesta clínica alternativa
              const altPaciente = await new Promise((r) => altDb.get(
                `SELECT id, nome FROM pacientes 
                 WHERE telefone LIKE ? OR celular LIKE ? OR telefone LIKE ? OR celular LIKE ?
                 LIMIT 1`,
                [`%${ultimos9}`, `%${ultimos9}`, `%${from}%`, `%${from}%`],
                (err, row) => r(row || null)
              ));

              const altPacienteId = altPaciente?.id || pacienteId;
              console.log(`📅 [FIX v17.2] Clínica ${altClinica.clinicaId}: paciente por tel → ${altPaciente ? altPaciente.id + ' (' + altPaciente.nome + ')' : 'não encontrado, usando ' + pacienteId}`);

              // 2. Busca consulta com o pacienteId DESTA clínica
              consultaJaConfirmada = await new Promise((r) => altDb.get(
                `SELECT c.*, c.profissional as profissionalNome FROM consultas c
                 WHERE c.pacienteId = ? 
                   AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
                 ORDER BY c.data DESC, c.horario DESC 
                 LIMIT 1`,
                [altPacienteId],
                (err, row) => r(row || null)
              ));

              // 3. Se não encontrou com pacienteId local, tenta com pacienteId original
              if (!consultaJaConfirmada && altPacienteId !== pacienteId) {
                consultaJaConfirmada = await new Promise((r) => altDb.get(
                  `SELECT c.*, c.profissional as profissionalNome FROM consultas c
                   WHERE c.pacienteId = ? 
                     AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
                   ORDER BY c.data DESC, c.horario DESC 
                   LIMIT 1`,
                  [pacienteId],
                  (err, row) => r(row || null)
                ));
              }

              if (consultaJaConfirmada) {
                dbParaUpdateV10 = altDb;
                clinicaIdParaUpdateV10 = altClinica.clinicaId;
                console.log(`📅 [FIX v17.2] ✅ Consulta encontrada CROSS-CLÍNICA em ${altClinica.clinicaId}! ID=${consultaJaConfirmada.id}, pacienteId=${consultaJaConfirmada.pacienteId}`);
                break;
              }
            }
          } catch (crossErr) {
            console.log(`📅 [FIX v17.2] ⚠️ Erro cross-clínica: ${crossErr.message}`);
          }
        }
      }

      if (consultaJaConfirmada) {
        // Consulta encontrada! Pode ser que confirmacaoRecebidaEm já estava preenchido
        const jaConfirmada = !!consultaJaConfirmada.confirmacaoRecebidaEm;
        console.log(`📅 [FIX v10.9.2] ✅ Consulta encontrada na última tentativa! ID=${consultaJaConfirmada.id}, jaConfirmada=${jaConfirmada}, status=${consultaJaConfirmada.status}`);

        // ⭐⭐⭐ FIX v17.1: Se já confirmada MAS paciente quer CANCELAR, permite cancelamento! ⭐⭐⭐
        if (jaConfirmada && consultaJaConfirmada.status === 'confirmada' && (isRespostaCancelamento || matchCancelamento(text))) {
          console.log(`📅 [FIX v17.1] ⚠️ Consulta já confirmada mas paciente quer CANCELAR → processando cancelamento!`);
          const agora = new Date().toISOString();
          const cancelBRv17 = agoraCancelamentoBR();
          await new Promise((r) => dbParaUpdateV10.run(
            `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ? WHERE id = ?`,
            [agora, consultaJaConfirmada.id],
            function (err) {
              if (err) console.log(`📅 ❌ [FIX v17.1] Erro ao cancelar: ${err.message}`);else
              console.log(`📅 ✅ [FIX v17.1] Consulta ${consultaJaConfirmada.id} → 'cancelada' (changes: ${this?.changes || 'N/A'})`);
              r();
            }
          ));
          await gravarMetadadosCancelamento(dbParaUpdateV10, consultaJaConfirmada.id, {
            data: cancelBRv17.dataCancelamento, hora: cancelBRv17.horaCancelamento
          });
          const profNome = consultaJaConfirmada.profissionalNome || consultaJaConfirmada.profissional || 'o profissional';
          const dataFormatada = formatarData(consultaJaConfirmada.data);
          // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
          limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
          // ⭐⭐⭐ FIX v23.1: Resolve nome correto via consulta > tabela pacientes > telefone ⭐⭐⭐
          const nomeCorretoV17 = await resolverNomePaciente(dbV10, consultaJaConfirmada, pacienteNome);
          const idCorretoV17 = consultaJaConfirmada.pacienteId || pacienteId;
          const motivoDataV17 = {
            consultaId: consultaJaConfirmada.id, pacienteId: idCorretoV17, pacienteNome: nomeCorretoV17, clinicaId: clinicaIdParaUpdateV10, timestamp: Date.now()
          };
          conversasAguardandoMotivo.set(chaveDialogo, motivoDataV17);
          conversasAguardandoMotivo.set(`${clinicaId}_9_${ultimos9}`, motivoDataV17);
          const refV17Cancel = consultaJaConfirmada.id ? `CON-${consultaJaConfirmada.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
          const msgCancelamento = `❌ *CONSULTA CANCELADA*\n\n📅 ${dataFormatada} às ${consultaJaConfirmada.horario}\n👨‍⚕️ ${profNome}${refV17Cancel ? `\n🔖 *Ref:* ${refV17Cancel}` : ''}\n\n📝 Por favor, informe o *MOTIVO DO CANCELAMENTO*:`;
          await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgCancelamento, sessionId);
          await fecharMensagensPendentes(clinicaIdParaUpdateV10, from);
          if (clinicaIdParaUpdateV10 !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
          await salvarMensagemHistorico(clinicaIdParaUpdateV10, idCorretoV17, nomeCorretoV17, 'enviada', msgCancelamento, 'pendente', from, consultaJaConfirmada.id);
          if (global.notificarChegadaPaciente) {
            global.notificarChegadaPaciente({
              tipo: 'cancelamento_consulta', clinicaId: clinicaIdParaUpdateV10,
              consultaId: consultaJaConfirmada.id, pacienteId: idCorretoV17, pacienteNome: nomeCorretoV17,
              data: consultaJaConfirmada.data, horario: consultaJaConfirmada.horario,
              profissional: profNome, status: 'cancelada',
              dataCancelamento: cancelBRv17.dataCancelamento, horaCancelamento: cancelBRv17.horaCancelamento,
              canceladoPor: 'Paciente', canalCancelamento: 'WhatsApp'
            });
          }
          console.log(`📅📅📅 ======================================== FIM\n`);
          return;
        } else if (jaConfirmada && consultaJaConfirmada.status === 'confirmada') {
          const profNome = consultaJaConfirmada.profissionalNome || consultaJaConfirmada.profissional || 'o profissional';
          const dataFormatada = formatarData(consultaJaConfirmada.data);
          const nomeCorretoJaConf = await resolverNomePaciente(dbV10, consultaJaConfirmada, pacienteNome);
          const idCorretoJaConf = consultaJaConfirmada.pacienteId || pacienteId;
          const refJaConf = consultaJaConfirmada.id ? `CON-${consultaJaConfirmada.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
          const msgJaConfirmada = `✅ Olá, ${nomeCorretoJaConf}! Sua consulta já está *confirmada*! 😊\n\n📅 ${dataFormatada} às ${consultaJaConfirmada.horario}\n👨‍⚕️ ${profNome}${refJaConf ? `\n🔖 *Ref:* ${refJaConf}` : ''}\n\nAguardamos você!${!MENU_AJUDA_BLOQUEADO ? ' Se precisar de algo, digite *AJUDA*.' : ''}`;
          await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgJaConfirmada, sessionId);
          await salvarMensagemHistorico(clinicaIdParaUpdateV10, idCorretoJaConf, nomeCorretoJaConf, 'enviada', msgJaConfirmada, 'enviada', from, consultaJaConfirmada.id);
          await fecharMensagensPendentes(clinicaIdParaUpdateV10, from);
          if (clinicaIdParaUpdateV10 !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
          console.log(`📩📩📩 ======================================== FIM\n`);
          return;
        } else {
          // Consulta encontrada mas não confirmada - processa agora!
          console.log(`📅 [FIX v10.9.2] Processando confirmação/cancelamento agora...`);
          consultaParaProcessar = consultaJaConfirmada;

          if (isRespostaConfirmacao || matchConfirmacao(text)) {
            const agora = new Date().toISOString();
            await new Promise((r) => dbParaUpdateV10.run(
              `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ? WHERE id = ?`,
              [agora, consultaJaConfirmada.id],
              function (err) {
                if (err) console.log(`📅 ❌ [FIX v10.9.2] Erro ao confirmar: ${err.message}`);else
                console.log(`📅 ✅ [FIX v10.9.2] Consulta ${consultaJaConfirmada.id} → 'confirmada' (changes: ${this?.changes || 'N/A'})`);
                r();
              }
            ));
            // ⭐⭐⭐ FIX: Verificação pós-UPDATE para garantir que gravou ⭐⭐⭐
            const verificacao = await new Promise((r) => dbParaUpdateV10.get(
              `SELECT status, confirmacaoRecebidaEm FROM consultas WHERE id = ?`,
              [consultaJaConfirmada.id],
              (err, row) => r(row)
            ));
            if (!verificacao || verificacao.status !== 'confirmada') {
              console.log(`📅 ⚠️ [FIX v10.9.2] VERIFICAÇÃO FALHOU! status=${verificacao?.status}, confirmacaoRecebidaEm=${verificacao?.confirmacaoRecebidaEm} → RETRY`);
              await new Promise((r) => dbParaUpdateV10.run(
                `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ? WHERE id = ?`,
                [agora, consultaJaConfirmada.id],
                function (err) {
                  if (err) console.log(`📅 ❌ [FIX v10.9.2] RETRY erro: ${err.message}`);else
                  console.log(`📅 ✅ [FIX v10.9.2] RETRY OK (changes: ${this?.changes || 'N/A'})`);
                  r();
                }
              ));
            } else {
              console.log(`📅 ✅ [FIX v10.9.2] VERIFICAÇÃO OK: status=${verificacao.status}, confirmacaoRecebidaEm=${verificacao.confirmacaoRecebidaEm}`);
            }
            const profNome = consultaJaConfirmada.profissionalNome || consultaJaConfirmada.profissional || 'o profissional';
            const dataFormatada = formatarData(consultaJaConfirmada.data);
            const refV10Conf = consultaJaConfirmada.id ? `CON-${consultaJaConfirmada.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
            // ⭐⭐⭐ FIX v23.1: Resolve nome correto via consulta > tabela pacientes > telefone ⭐⭐⭐
            const nomeCorretoV10 = await resolverNomePaciente(dbV10, consultaJaConfirmada, pacienteNome);
            const idCorretoV10 = consultaJaConfirmada.pacienteId || pacienteId;
            const msgConfirmacao = `✅ *CONSULTA CONFIRMADA!*\n\n📅 ${dataFormatada} às ${consultaJaConfirmada.horario}\n👨‍⚕️ ${profNome}${refV10Conf ? `\n🔖 *Ref:* ${refV10Conf}` : ''}\n\nObrigado, ${nomeCorretoV10}! Sua presença está confirmada.${!MENU_AJUDA_BLOQUEADO ? '\n\n_Se precisar de algo, digite *AJUDA*._' : ''}`;
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgConfirmacao, sessionId);
            // ⭐⭐⭐ FIX v18.0 + v23.0 ⭐⭐⭐
            await salvarMensagemHistorico(clinicaIdParaUpdateV10, idCorretoV10, nomeCorretoV10, 'enviada', msgConfirmacao, 'enviada', from, consultaJaConfirmada.id);
            await fecharMensagensPendentes(clinicaIdParaUpdateV10, from);
            if (clinicaIdParaUpdateV10 !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
            if (global.notificarChegadaPaciente) {
              global.notificarChegadaPaciente({
                tipo: 'confirmacao_consulta', clinicaId: clinicaIdParaUpdateV10,
                consultaId: consultaJaConfirmada.id, pacienteId: idCorretoV10, pacienteNome: nomeCorretoV10,
                data: consultaJaConfirmada.data, horario: consultaJaConfirmada.horario,
                profissional: profNome, status: 'confirmada'
              });
            }
            console.log(`📅📅📅 ======================================== FIM\n`);
            return;
          } else if (isRespostaCancelamento || matchCancelamento(text)) {
            const agora = new Date().toISOString();
            // ⭐ Grava AUTOMATICAMENTE data/hora do cancelamento (fuso do Brasil).
            const cancelBRv10 = agoraCancelamentoBR();
            await new Promise((r) => dbParaUpdateV10.run(
              `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ? WHERE id = ?`,
              [agora, consultaJaConfirmada.id],
              function (err) {
                if (err) console.log(`📅 ❌ [FIX v10.9.2 CANCEL] Erro: ${err.message}`);else
                console.log(`📅 ✅ [FIX v10.9.2 CANCEL] Consulta ${consultaJaConfirmada.id} → 'cancelada' (changes: ${this?.changes || 'N/A'})`);
                r();
              }
            ));
            await gravarMetadadosCancelamento(dbParaUpdateV10, consultaJaConfirmada.id, {
              data: cancelBRv10.dataCancelamento, hora: cancelBRv10.horaCancelamento
            });
            // ⭐⭐⭐ FIX: Verificação pós-UPDATE ⭐⭐⭐
            const verificacaoC2 = await new Promise((r) => dbParaUpdateV10.get(
              `SELECT status, confirmacaoRecebidaEm FROM consultas WHERE id = ?`,
              [consultaJaConfirmada.id],
              (err, row) => r(row)
            ));
            if (!verificacaoC2 || verificacaoC2.status !== 'cancelada') {
              console.log(`📅 ⚠️ [FIX v10.9.2 CANCEL] VERIFICAÇÃO FALHOU! → RETRY`);
              await new Promise((r) => dbParaUpdateV10.run(
                `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ? WHERE id = ?`,
                [agora, consultaJaConfirmada.id],
                function (err) {
                  if (err) console.log(`📅 ❌ [FIX v10.9.2 CANCEL] RETRY erro: ${err.message}`);else
                  console.log(`📅 ✅ [FIX v10.9.2 CANCEL] RETRY OK`);
                  r();
                }
              ));
              await gravarMetadadosCancelamento(dbParaUpdateV10, consultaJaConfirmada.id, {
                data: cancelBRv10.dataCancelamento, hora: cancelBRv10.horaCancelamento
              });
            } else {
              console.log(`📅 ✅ [FIX v10.9.2 CANCEL] VERIFICAÇÃO OK`);
            }
            const profNome = consultaJaConfirmada.profissionalNome || consultaJaConfirmada.profissional || 'o profissional';
            const dataFormatada = formatarData(consultaJaConfirmada.data);
            // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
            limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
            // ⭐⭐⭐ FIX v10.9.7: Salva motivo com MÚLTIPLAS chaves para matching robusto ⭐⭐⭐
            // ⭐⭐⭐ FIX v23.1: Resolve nome correto via consulta > tabela pacientes > telefone ⭐⭐⭐
            const nomeCorreto2 = await resolverNomePaciente(dbV10, consultaJaConfirmada, pacienteNome);
            const idCorreto2 = consultaJaConfirmada.pacienteId || pacienteId;
            const motivoData2 = {
              consultaId: consultaJaConfirmada.id, pacienteId: idCorreto2, pacienteNome: nomeCorreto2, clinicaId: clinicaIdParaUpdateV10, timestamp: Date.now()
            };
            conversasAguardandoMotivo.set(chaveDialogo, motivoData2);
            conversasAguardandoMotivo.set(`${clinicaId}_9_${ultimos9}`, motivoData2);
            console.log(`📩 [FIX v10.9.7] Motivo aguardado (v10.9.2) com chaves: ${chaveDialogo} e ${clinicaId}_9_${ultimos9}`);

            const refV10Cancel = consultaJaConfirmada.id ? `CON-${consultaJaConfirmada.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
            const msgCancelamento = `❌ *CONSULTA CANCELADA*\n\n📅 ${dataFormatada} às ${consultaJaConfirmada.horario}\n👨‍⚕️ ${profNome}${refV10Cancel ? `\n🔖 *Ref:* ${refV10Cancel}` : ''}\n\n📝 Por favor, informe o *MOTIVO DO CANCELAMENTO*:`;
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgCancelamento, sessionId);
            await fecharMensagensPendentes(clinicaIdParaUpdateV10, from);
            if (clinicaIdParaUpdateV10 !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
            await salvarMensagemHistorico(clinicaIdParaUpdateV10, idCorreto2, nomeCorreto2, 'enviada', msgCancelamento, 'pendente', from, consultaJaConfirmada.id);
            if (global.notificarChegadaPaciente) {
              global.notificarChegadaPaciente({
                tipo: 'cancelamento_consulta', clinicaId: clinicaIdParaUpdateV10,
                consultaId: consultaJaConfirmada.id, pacienteId: idCorreto2, pacienteNome: nomeCorreto2,
                data: consultaJaConfirmada.data, horario: consultaJaConfirmada.horario,
                profissional: profNome, status: 'cancelada',
                dataCancelamento: cancelBRv10.dataCancelamento, horaCancelamento: cancelBRv10.horaCancelamento,
                canceladoPor: 'Paciente', canalCancelamento: 'WhatsApp'
              });
            }
            console.log(`📅📅📅 ======================================== FIM\n`);
            return;
          } else {
            // Texto não reconhecido como confirmação/cancelamento - re-prompt
            const profNome = consultaJaConfirmada.profissionalNome || consultaJaConfirmada.profissional || 'o profissional';
            const dataFormatada = formatarData(consultaJaConfirmada.data);
            const nomeCorretoRP = await resolverNomePaciente(dbV10, consultaJaConfirmada, pacienteNome);
            const idCorretoRP = consultaJaConfirmada.pacienteId || pacienteId;
            const refV10RePrompt = consultaJaConfirmada.id ? `CON-${consultaJaConfirmada.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
            const msgRePrompt = `Olá, ${nomeCorretoRP}! 👋\n\nVocê tem uma consulta pendente de confirmação:\n\n📅 *Data:* ${dataFormatada}\n🕐 *Horário:* ${consultaJaConfirmada.horario}\n👨‍⚕️ *Profissional:* ${profNome}${refV10RePrompt ? `\n🔖 *Ref:* ${refV10RePrompt}` : ''}\n\nResponda com o número:\n1️⃣ *Confirmar* presença\n2️⃣ *Cancelar* consulta\n\n_Ou responda *SIM* / *NÃO*. Digite *AJUDA* para ver outras opções._`;
            await fecharMensagensPendentes(clinicaIdParaUpdateV10, from);
            if (clinicaIdParaUpdateV10 !== clinicaId) await fecharMensagensPendentes(clinicaId, from);
            await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgRePrompt, sessionId);
            await salvarMensagemHistorico(clinicaId, idCorretoRP, nomeCorretoRP, 'enviada', msgRePrompt, 'pendente', from, consultaJaConfirmada.id);
            console.log(`📩📩📩 ======================================== FIM\n`);
            return;
          }
        }
      }

      // ⭐⭐⭐ FIX v10.9.2: REALMENTE não encontrou nenhuma consulta - libera o paciente do loop ⭐⭐⭐
      console.log(`📅 [FIX v10.9.2] ❌ DEFINITIVAMENTE sem consulta. Fechando pendência.`);
      await fecharMensagensPendentes(clinicaId, from);

      // ⭐⭐⭐ FIX v21.6: Se menu bloqueado, NÃO envia mensagem de "sem consulta" ⭐⭐⭐
      if (MENU_AJUDA_BLOQUEADO) {
        console.log(`📩 [FIX v21.6] ⛔ Menu bloqueado — sem consulta encontrada → silencioso`);
        console.log(`📩📩📩 ======================================== FIM\n`);
        return;
      }

      const msgSemConsulta = `Olá, ${pacienteNome}! 👋\n\nRecebemos sua resposta, mas não encontramos uma consulta pendente de confirmação no momento.\n\nSe você acredita que deveria ter uma consulta agendada, por favor entre em contato com a recepção.\n\nDigite *AJUDA* para ver outras opções ou *0* para sair.`;
      await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgSemConsulta, sessionId);
      // ⭐⭐⭐ FIX v20.3: Orienta paciente → espera resposta → 'pendente' ⭐⭐⭐
      await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgSemConsulta, 'pendente', from);
      console.log(`📩📩📩 ======================================== FIM\n`);
      return;
    }

    // ⭐⭐⭐ FIX v10.8: RE-ATIVA DIÁLOGO DE AJUDA SE MENSAGEM PENDENTE É UM MENU ⭐⭐⭐
    // Quando o servidor reinicia, o timeout expira (5min), ou o telefone chega em formato diferente (LID),
    // o dialogosAjuda (Map em memória) perde a entrada. Mas a mensagem pendente no banco persiste.
    // Se o paciente responde com uma opção numérica (1-7, 0) e a mensagem pendente contém um menu,
    // re-ativamos o diálogo de ajuda para que a opção seja processada corretamente.
    if (mensagemPendente && isOpcaoMenu && !dialogoAjudaAtivoPreCheck) {
      const conteudoPendente = (mensagemPendente.conteudo || '').toUpperCase();
      // ⭐⭐⭐ FIX v20.2: Detecção melhorada de menu vs confirmação ⭐⭐⭐
      // "DIGITE OUTRO NÚMERO" = resposta de opção do menu (FIX v20.0 MSG_CONTINUAR)
      // "COMO POSSO AJUDAR" = menu principal
      // "MINHAS CONSULTAS" + "HORÁRIO" = menu principal
      const isMenuPendente = conteudoPendente.includes('COMO POSSO AJUDAR') ||
      conteudoPendente.includes('DIGITE O NÚMERO') ||
      conteudoPendente.includes('OPÇÃO DESEJADA') ||
      conteudoPendente.includes('DIGITE OUTRO NÚMERO') ||
      conteudoPendente.includes('1️⃣') && conteudoPendente.includes('MINHAS CONSULTAS') ||
      conteudoPendente.includes('MINHAS CONSULTAS') && conteudoPendente.includes('HORÁRIO DE FUNCIONAMENTO') ||
      conteudoPendente.includes('MINHAS CONSULTAS') && (conteudoPendente.includes('FALAR COM ATENDENTE') || conteudoPendente.includes('BOLETO')) ||
      conteudoPendente.includes('SUAS PRÓXIMAS CONSULTAS') && conteudoPendente.includes('DIGITE OUTRO NÚMERO');

      // ⭐⭐⭐ FIX v20.2: Confirmação pendente REAL = prompt específico de confirmar/cancelar consulta ⭐⭐⭐
      // Deve conter "CONFIRMAR" + "PRESENÇA" (prompt de confirmação real)
      // E NÃO deve conter indicadores de menu (DIGITE OUTRO NÚMERO, COMO POSSO AJUDAR, etc.)
      const isConfirmacaoPendente = (conteudoPendente.includes('CONFIRMAR') || conteudoPendente.includes('CONFIRME')) &&
      conteudoPendente.includes('PRESENÇA') &&
      !conteudoPendente.includes('DIGITE OUTRO NÚMERO') &&
      !conteudoPendente.includes('COMO POSSO AJUDAR');

      if (isMenuPendente && !isConfirmacaoPendente && !MENU_AJUDA_BLOQUEADO) {
        console.log(`📩 [FIX v10.8] ✅ Mensagem pendente é um MENU DE AJUDA! Re-ativando diálogo...`);
        // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de reativar ⭐⭐⭐
        limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
        const dialogoReativado = {
          pacienteId: pacienteId || (mensagemPendente ? mensagemPendente.pacienteId : null),
          pacienteNome: pacienteNome || (mensagemPendente ? mensagemPendente.pacienteNome : 'Paciente'),
          ultimos9,
          timestamp: Date.now()
        };
        dialogosAjuda.set(chaveDialogo, dialogoReativado);
        dialogosAjuda.set(`${clinicaId}_9_${ultimos9}`, dialogoReativado);
        dialogoAjudaPreCheck = dialogoReativado;
        dialogoAjudaAtivoPreCheck = true;
        console.log(`📩 [FIX v10.8] Diálogo re-ativado com chaves: ${chaveDialogo} e ${clinicaId}_9_${ultimos9}`);
      } else if (isConfirmacaoPendente) {
        console.log(`📩 [FIX v10.9] Mensagem pendente é CONFIRMAÇÃO DE CONSULTA - já processado acima pelo FIX v10.9`);
      }
    }

    // ⭐⭐⭐ FIX v10.9: A lógica de confirmação/cancelamento foi MOVIDA para ANTES deste bloco ⭐⭐⭐
    // Não precisa mais do bloco antigo de confirmação aqui.
    // O código abaixo agora só processa o MENU DE AJUDA e suas opções.

    // ⭐ VERIFICA SE HÁ DIÁLOGO DE AJUDA ATIVO
    const dialogoAjuda = dialogoAjudaPreCheck;
    const dialogoAjudaAtivo = dialogoAjudaAtivoPreCheck;

    // ⭐ COMANDOS PRINCIPAIS
    if (['AJUDA', 'OI', 'OLA', 'OLÁ', 'MENU', 'BOM DIA', 'BOA TARDE', 'BOA NOITE', 'HELLO', 'HI'].includes(textoUpper) || dialogoAjudaAtivo) {

      // ⭐⭐⭐ FIX v21.4 DEFINITIVO: Se menu está bloqueado, NÃO processa comandos de menu ⭐⭐⭐
      if (MENU_AJUDA_BLOQUEADO) {
        console.log(`📩 [FIX v21.4] ⛔ BLOQUEADO — Ignorando comando "${textoUpper}" (menu desabilitado)`);
        // Limpa diálogos ativos que possam existir
        dialogosAjuda.delete(chaveDialogo);
        dialogosAjuda.delete(`${clinicaId}_9_${ultimos9}`);
        await fecharMensagensPendentes(clinicaId, from);
        await fecharDialogo(clinicaId, from);
        // NÃO envia nenhuma mensagem automática — apenas ignora silenciosamente
        // (a mensagem já foi salva no histórico na linha 967)
        console.log(`📩📩📩 ======================================== FIM\n`);
        return;
      }

      // Se é um comando numérico dentro de diálogo ativo
      if (dialogoAjudaAtivo && ['1', '2', '3', '4', '5', '6', '7', '0'].includes(textoUpper)) {
        // ⭐⭐⭐ FIX v20.0: MENSAGEM DE RETORNO AO MENU — mantém diálogo aberto ⭐⭐⭐
        // Após responder opções 1-4, 7: NÃO fecha o diálogo, envia mensagem 'pendente'
        // para que o paciente possa continuar escolhendo opções sem digitar AJUDA de novo.
        // Apenas opção 0 (sair) e opções 5/6 (sub-diálogos de foto/documento) fecham o diálogo.
        const MSG_CONTINUAR = `\n\n━━━━━━━━━━━━━━━━━━\n📋 *Digite outro número* para continuar ou *0* para sair.`;

        switch (textoUpper) {
          case '1':{
              // Minhas consultas
              // ⭐⭐⭐ FIX v10.9.3: REMOVIDO LEFT JOIN - usa c.profissional diretamente ⭐⭐⭐
              // Também corrigido c.hora → c.horario (nome correto da coluna)
              const consultas = await new Promise((r) => db.all(
                `SELECT c.*, c.profissional as profissionalNome FROM consultas c
               WHERE c.pacienteId = ? AND c.data >= CURDATE() AND c.status != 'cancelada'
               ORDER BY c.data ASC, c.horario ASC LIMIT 5`,
                [pacienteId], (err, rows) => r(rows || [])
              ));

              if (consultas.length > 0) {
                let msg = `📋 *SUAS PRÓXIMAS CONSULTAS:*\n\n`;
                consultas.forEach((c, i) => {
                  const refItem = c.id ? `CON-${c.id.replace(/-/g, '').substring(0, 8).toUpperCase()}` : '';
                  msg += `${i + 1}. 📅 ${formatarData(c.data)} às ${c.horario || 'N/A'}\n`;
                  msg += `   👨‍⚕️ ${c.profissionalNome || c.profissional || 'Profissional'}\n`;
                  msg += `   📌 Status: ${c.status || 'agendada'}`;
                  if (refItem) msg += ` | 🔖 ${refItem}`;
                  msg += `\n\n`;
                });
                msg += `Para confirmar, cancelar ou remarcar, entre em contato com a clínica.`;
                msg += MSG_CONTINUAR;
                await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msg, sessionId);
                // ⭐⭐⭐ FIX v20.0: Salva como 'pendente' para manter diálogo aberto ⭐⭐⭐
                await fecharMensagensPendentes(clinicaId, from);
                await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msg, 'pendente', from);
              } else {
                const msgSem = `📋 Sem consultas agendadas no momento.${MSG_CONTINUAR}`;
                await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgSem, sessionId);
                await fecharMensagensPendentes(clinicaId, from);
                await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgSem, 'pendente', from);
              }
              // ⭐⭐⭐ FIX v20.0: NÃO deleta dialogosAjuda — mantém diálogo ativo ⭐⭐⭐
              // Atualiza timestamp para evitar expiração
              if (dialogoAjuda) dialogoAjuda.timestamp = Date.now();
              break;
            }
          case '2':{
              // Horário de funcionamento
              const msgHorario = `🕐 *HORÁRIO DE FUNCIONAMENTO*\n\nSegunda a Sexta: 08:00 às 18:00\nSábado: 08:00 às 12:00${MSG_CONTINUAR}`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgHorario, sessionId);
              // ⭐⭐⭐ FIX v20.0: Mantém diálogo aberto ⭐⭐⭐
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgHorario, 'pendente', from);
              if (dialogoAjuda) dialogoAjuda.timestamp = Date.now();
              break;
            }
          case '3':{
              // ⭐⭐⭐ FIX v20.0: Endereço + PIN DE LOCALIZAÇÃO + LINK GOOGLE MAPS ⭐⭐⭐
              console.log(`📍 [webhook] Opção 3 - Endereço da clínica ${clinicaId}`);

              let msgEndereco = '';
              let enderecoCompleto = '';
              let clinicaNome = 'Clínica';

              try {
                // Busca dados da clínica no banco global (inclui latitude/longitude se existirem)
                const clinicaData = await dbGlobal.prepare('SELECT nome, endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, telefone, latitude, longitude FROM clinicas WHERE id = ?').get(clinicaId);

                if (clinicaData) {
                  clinicaNome = clinicaData.nome || 'Clínica';

                  // Monta endereço completo
                  if (clinicaData.logradouro) {
                    const partes = [
                    clinicaData.logradouro,
                    clinicaData.numero ? `nº ${clinicaData.numero}` : null,
                    clinicaData.complemento,
                    clinicaData.bairro,
                    clinicaData.cidade,
                    clinicaData.uf].
                    filter(Boolean);
                    enderecoCompleto = partes.join(', ');
                  } else if (clinicaData.endereco) {
                    enderecoCompleto = clinicaData.endereco;
                  }

                  if (enderecoCompleto) {
                    msgEndereco = `📍 *ENDEREÇO*\n\n🏥 *${clinicaNome}*\n\n📌 ${enderecoCompleto}`;
                    if (clinicaData.cep) {
                      msgEndereco += `\n📮 CEP: ${clinicaData.cep}`;
                    }
                    if (clinicaData.telefone) {
                      msgEndereco += `\n📞 ${clinicaData.telefone}`;
                    }
                  } else {
                    msgEndereco = `📍 *ENDEREÇO*\n\n🏥 *${clinicaNome}*\n\nEndereço não cadastrado. Entre em contato com a recepção para mais informações.`;
                    if (clinicaData.telefone) {
                      msgEndereco += `\n📞 ${clinicaData.telefone}`;
                    }
                  }

                  // ⭐⭐⭐ FIX v20.0: Tenta obter coordenadas para pin + link Google Maps ⭐⭐⭐
                  let lat = clinicaData.latitude ? parseFloat(clinicaData.latitude) : null;
                  let lng = clinicaData.longitude ? parseFloat(clinicaData.longitude) : null;
                  let pinEnviado = false;

                  if (enderecoCompleto) {
                    // Se não tem coordenadas salvas, tenta geocodificar
                    if (!lat || !lng) {
                      console.log(`📍 [webhook] Sem coordenadas salvas, tentando geocodificar...`);
                      try {
                        const geo = await geocodificarEndereco(enderecoCompleto);
                        if (geo) {
                          lat = geo.latitude;
                          lng = geo.longitude;
                          // Salva as coordenadas no banco para não precisar geocodificar de novo
                          try {
                            await dbGlobal.prepare('UPDATE clinicas SET latitude = ?, longitude = ? WHERE id = ?').run(lat, lng, clinicaId);
                            console.log(`📍 [webhook] ✅ Coordenadas salvas no banco: lat=${lat}, lng=${lng}`);
                          } catch (saveErr) {
                            console.log(`📍 [webhook] ⚠️ Erro ao salvar coordenadas: ${saveErr.message}`);
                          }
                        }
                      } catch (geoErr) {
                        console.log(`📍 [webhook] ⚠️ Erro na geocodificação: ${geoErr.message}`);
                      }
                    }

                    // ⭐⭐⭐ FIX v20.0: SEMPRE adiciona link do Google Maps (funciona mesmo sem pin) ⭐⭐⭐
                    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                      const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                      msgEndereco += `\n\n🗺️ *Abrir no mapa:*\n${googleMapsLink}`;

                      // Tenta enviar pin de localização (não bloqueia se falhar)
                      try {
                        console.log(`📍 [webhook] Enviando pin de localização: lat=${lat}, lng=${lng}`);
                        const locResult = await enviarLocalizacao(serverUrl, wahaApiKey, from, lat, lng, clinicaNome, enderecoCompleto, sessionId);
                        if (locResult.success) {
                          pinEnviado = true;
                          console.log(`📍 [webhook] ✅ Pin de localização enviado com sucesso!`);
                        } else {
                          console.log(`📍 [webhook] ⚠️ Falha ao enviar pin, mas link do Google Maps foi incluído na mensagem`);
                        }
                      } catch (pinErr) {
                        console.log(`📍 [webhook] ⚠️ Erro ao enviar pin: ${pinErr.message} — link do Google Maps incluído como fallback`);
                      }
                    } else {
                      // Sem coordenadas — adiciona link de busca do Google Maps pelo endereço
                      const enderecoEncoded = encodeURIComponent(enderecoCompleto + ', Brasil');
                      const googleMapsSearchLink = `https://www.google.com/maps/search/?api=1&query=${enderecoEncoded}`;
                      msgEndereco += `\n\n🗺️ *Abrir no mapa:*\n${googleMapsSearchLink}`;
                      console.log(`📍 [webhook] ⚠️ Sem coordenadas — usando link de busca do Google Maps`);
                    }
                  }

                  // ⭐⭐⭐ FIX v20.0: Adiciona opção de continuar no diálogo ⭐⭐⭐
                  msgEndereco += MSG_CONTINUAR;

                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgEndereco, sessionId);
                  await fecharMensagensPendentes(clinicaId, from);
                  await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgEndereco, 'pendente', from);

                } else {
                  msgEndereco = `📍 *ENDEREÇO*\n\nPara informações sobre endereço e como chegar, entre em contato com a recepção.${MSG_CONTINUAR}`;
                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgEndereco, sessionId);
                  await fecharMensagensPendentes(clinicaId, from);
                  await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgEndereco, 'pendente', from);
                }
              } catch (e) {
                console.log(`📍 ⚠️ Erro ao buscar endereço da clínica: ${e.message}`);
                msgEndereco = `📍 *ENDEREÇO*\n\nPara informações sobre endereço e como chegar, entre em contato com a recepção.${MSG_CONTINUAR}`;
                await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgEndereco, sessionId);
                await fecharMensagensPendentes(clinicaId, from);
                await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgEndereco, 'pendente', from);
              }

              // ⭐⭐⭐ FIX v20.0: NÃO deleta dialogosAjuda — mantém diálogo ativo ⭐⭐⭐
              if (dialogoAjuda) dialogoAjuda.timestamp = Date.now();
              break;
            }
          case '4':{
              // ⭐ Emissão da 2ª via de boleto - busca parcelas pendentes/vencidas do paciente
              console.log(`💰 [webhook] Opção 4 - Emissão 2ª via boleto para ${pacienteNome} (${pacienteId}) clinicaId=${clinicaId}`);
              try {
                const dbClinica = getClinicaDB(clinicaId);

                // Busca parcelas pendentes ou vencidas do paciente
                const parcelas = await new Promise((resolve, reject) => {
                  dbClinica.all(
                    `SELECT * FROM parcelas WHERE pacienteId = ? AND status IN ('pendente', 'vencido') ORDER BY dataVencimento ASC`,
                    [pacienteId],
                    (err, rows) => {
                      if (err) {
                        console.log(`💰 ⚠️ Erro ao buscar parcelas: ${err.message}`);
                        resolve([]);
                      } else {
                        resolve(rows || []);
                      }
                    }
                  );
                });

                if (parcelas.length === 0) {
                  // Sem boletos registrados
                  const msgSemBoleto = `💰 *EMISSÃO DA 2ª VIA DE BOLETO*\n\nNão há boletos pendentes ou a vencer em seu nome.\n\nCaso tenha dúvidas, entre em contato com a recepção da clínica.${MSG_CONTINUAR}`;
                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgSemBoleto, sessionId);
                  await fecharMensagensPendentes(clinicaId, from);
                  await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgSemBoleto, 'pendente', from);
                } else {
                  // Busca configuração bancária para PIX
                  let pixInfo = '';
                  try {
                    const bancoConfig = await new Promise((resolve, reject) => {
                      dbClinica.get(
                        `SELECT * FROM configuracoes_banco WHERE ativo = 1 LIMIT 1`,
                        [],
                        (err, row) => {
                          if (err) resolve(null);else
                          resolve(row);
                        }
                      );
                    });
                    if (bancoConfig && bancoConfig.chavePix) {
                      pixInfo = `\n\n📱 *PIX para pagamento:*\nChave: \`${bancoConfig.chavePix}\`\nTipo: ${bancoConfig.tipoChavePix || 'CNPJ'}\nFavorecido: ${bancoConfig.cedenteNome || bancoConfig.bancoNome || 'Clínica'}`;
                    }
                  } catch (e) {
                    console.log(`💰 ⚠️ Erro ao buscar config bancária: ${e.message}`);
                  }

                  // Formata lista de parcelas
                  let listaParcelas = '';
                  let totalPendente = 0;
                  parcelas.forEach((p, i) => {
                    const valor = parseFloat(p.valorParcela || 0);
                    totalPendente += valor;
                    const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const vencimento = p.dataVencimento ? new Date(p.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
                    const hoje = new Date();
                    hoje.setHours(0, 0, 0, 0);
                    const dtVenc = new Date(p.dataVencimento + 'T12:00:00');
                    dtVenc.setHours(0, 0, 0, 0);
                    const statusIcon = dtVenc < hoje ? '🔴 Vencida' : '🟡 Pendente';
                    listaParcelas += `\n${i + 1}. Parcela ${p.numeroParcela || i + 1} — ${valorFmt}\n   📅 Vencimento: ${vencimento}\n   ${statusIcon}`;
                  });

                  const totalFmt = totalPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  const msgBoleto = `💰 *EMISSÃO DA 2ª VIA DE BOLETO*\n\nOlá, *${pacienteNome}*!\n\nVocê possui *${parcelas.length} parcela(s)* pendente(s) ou a vencer:\n${listaParcelas}\n\n💵 *Total:* ${totalFmt}${pixInfo}\n\n_Para emissão da 2ª via ou mais informações, entre em contato com a recepção._${MSG_CONTINUAR}`;
                  await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgBoleto, sessionId);
                  await fecharMensagensPendentes(clinicaId, from);
                  await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgBoleto, 'pendente', from);
                }
              } catch (e) {
                console.log(`💰 ❌ Erro geral ao processar boleto: ${e.message}`);
                const msgErro = `💰 *EMISSÃO DA 2ª VIA DE BOLETO*\n\nNão foi possível consultar seus boletos no momento. Por favor, entre em contato com a recepção da clínica.${MSG_CONTINUAR}`;
                await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgErro, sessionId);
                await fecharMensagensPendentes(clinicaId, from);
                await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgErro, 'pendente', from);
              }
              if (dialogoAjuda) dialogoAjuda.timestamp = Date.now();
              break;
            }
          case '5':{
              // ⭐⭐⭐ OPÇÃO 5: Trocar foto de perfil ⭐⭐⭐
              console.log(`📸 [webhook] Opção 5 - Trocar foto de perfil para ${pacienteNome} (${pacienteId})`);

              // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir foto ⭐⭐⭐
              limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
              // ⭐⭐⭐ FIX v19.1: Ativa diálogo de foto com MÚLTIPLAS chaves (igual iniciar-dialogo-foto) ⭐⭐⭐
              const dialogoFotoData5 = {
                clinicaId,
                pacienteId,
                pacienteNome,
                telefone: telLimpo,
                ultimos9,
                timestamp: Date.now()
              };
              dialogosFoto.set(chaveDialogo, dialogoFotoData5);
              dialogosFoto.set(`${clinicaId}_9_${ultimos9}`, dialogoFotoData5); // Chave canônica
              dialogosFoto.set(`${clinicaId}_55${telLimpo}`, dialogoFotoData5); // Chave com prefixo 55
              console.log(`📸 [FIX v19.1] Diálogo de foto ativado com 3 chaves: ${chaveDialogo}, ${clinicaId}_9_${ultimos9}, ${clinicaId}_55${telLimpo}`);

              // Cria solicitação pendente no banco
              try {
                await criarSolicitacao(clinicaId, pacienteId, pacienteNome, telLimpo, 'foto', 'foto');
              } catch (e) {
                console.log(`📸 ⚠️ Erro ao criar solicitação de foto: ${e.message}`);
              }

              const msgFoto = `📷 *TROCAR FOTO DE PERFIL*\n\nOlá, ${pacienteNome}! 📸\n\nEnvie uma foto do seu rosto nesta conversa e ela será salva como sua foto de perfil no sistema.\n\n⏳ Você tem *5 minutos* para enviar a foto.\n\nDigite *0* para cancelar.`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgFoto, sessionId);
              // ⭐⭐⭐ FIX v11.0: Fecha pendentes anteriores (menu) e salva pedido de foto como 'pendente' ⭐⭐⭐
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgFoto, 'pendente', from);
              dialogosAjuda.delete(chaveDialogo);
              break;
            }
          case '6':{
              // ⭐⭐⭐ OPÇÃO 6: Enviar documento ⭐⭐⭐
              console.log(`📄 [webhook] Opção 6 - Enviar documento para ${pacienteNome} (${pacienteId})`);

              // Cria solicitação pendente de documento
              try {
                await criarSolicitacao(clinicaId, pacienteId, pacienteNome, telLimpo, 'documento', 'outros');
              } catch (e) {
                console.log(`📄 ⚠️ Erro ao criar solicitação de documento: ${e.message}`);
              }

              const msgDoc = `📄 *ENVIAR DOCUMENTO*\n\nOlá, ${pacienteNome}!\n\nEnvie o documento (foto, PDF ou arquivo) nesta conversa.\nO documento será salvo automaticamente no seu prontuário. 📋\n\n⏳ Você tem *24 horas* para enviar.\n\nDigite *0* para cancelar.`;
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgDoc, sessionId);
              // ⭐⭐⭐ FIX v11.0: Fecha pendentes anteriores (menu) e salva pedido de documento como 'pendente' ⭐⭐⭐
              await fecharMensagensPendentes(clinicaId, from);
              await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgDoc, 'pendente', from);
              dialogosAjuda.delete(chaveDialogo);
              break;
            }
          case '7':{
              // ⭐⭐⭐ OPÇÃO 7: Cheguei na clínica ⭐⭐⭐
              console.log(`✅ [webhook] Opção 7 - Chegada na clínica de ${pacienteNome} (${pacienteId})`);

              // ⭐⭐⭐ FIX v10.9.3: REMOVIDO LEFT JOIN - usa c.profissional diretamente ⭐⭐⭐
              const consultaHoje = await new Promise((r) => db.get(
                `SELECT c.*, c.profissional as profissionalNome FROM consultas c
               WHERE c.pacienteId = ? AND c.data = CURDATE() AND c.status != 'cancelada'
               ORDER BY c.horario ASC LIMIT 1`,
                [pacienteId],
                (err, row) => r(row)
              ));

              if (consultaHoje) {
                // ⭐⭐⭐ FIX v20.1: Atualiza horaChegada + statusAtendimento (igual ao botão da agenda) ⭐⭐⭐
                const agoraISO = new Date().toISOString();
                const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                await new Promise((r) => db.run(
                  `UPDATE consultas SET status = 'confirmada', horaChegada = ?, statusAtendimento = 'aguardando', observacoes = CONCAT(COALESCE(observacoes, ''), ' | Chegada via WhatsApp: ', NOW()) WHERE id = ?`,
                  [agoraISO, consultaHoje.id],
                  () => r()
                ));

                const profNome = consultaHoje.profissionalNome || consultaHoje.profissional || 'o profissional';
                const msgChegada = `✅ *CHEGADA REGISTRADA!*\n\n${pacienteNome}, sua chegada foi registrada com sucesso! 🏥\n\n📅 Consulta de hoje às ${consultaHoje.horario}\n👨‍⚕️ ${profNome}\n⏰ Chegada: ${horaFormatada}\n\nAguarde ser chamado(a). Obrigado! 😊${MSG_CONTINUAR}`;
                await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgChegada, sessionId);
                // ⭐⭐⭐ FIX v20.0: Mantém diálogo aberto ⭐⭐⭐
                await fecharMensagensPendentes(clinicaId, from);
                await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgChegada, 'pendente', from);

                // Notifica via SSE (para a fila de atendimento)
                if (global.notificarChegadaPaciente) {
                  global.notificarChegadaPaciente({
                    tipo: 'chegada_paciente',
                    clinicaId,
                    consultaId: consultaHoje.id,
                    pacienteId,
                    pacienteNome,
                    data: consultaHoje.data,
                    horario: consultaHoje.horario,
                    profissional: profNome,
                    horaChegadaFormatada: horaFormatada,
                    status: 'confirmada',
                    viaWhatsApp: true
                  });
                }
              } else {
                const msgSemConsulta = `⚠️ ${pacienteNome}, não encontramos uma consulta agendada para hoje no seu nome.\n\nSe você tem uma consulta, por favor dirija-se à recepção para confirmar.${MSG_CONTINUAR}`;
                await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgSemConsulta, sessionId);
                await fecharMensagensPendentes(clinicaId, from);
                await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgSemConsulta, 'pendente', from);
              }

              // ⭐⭐⭐ FIX v20.0: NÃO deleta dialogosAjuda — mantém diálogo ativo ⭐⭐⭐
              if (dialogoAjuda) dialogoAjuda.timestamp = Date.now();
              break;
            }
          case '0':{
              // Sair - ⭐⭐⭐ FIX v10.0: Fecha o diálogo (status = fechado) ⭐⭐⭐
              await enviarMensagemRobusta(serverUrl, wahaApiKey, from,
              `👋 Obrigado pelo contato!${!MENU_AJUDA_BLOQUEADO ? ' Se precisar de algo, digite *AJUDA* a qualquer momento.' : ''}`,
              sessionId);
              await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', '👋 Obrigado pelo contato!', 'enviada', from);
              dialogosAjuda.delete(chaveDialogo);
              // ⭐⭐⭐ FIX v10.4: Fecha mensagens pendentes E diálogo ⭐⭐⭐
              await fecharMensagensPendentes(clinicaId, from);
              await fecharDialogo(clinicaId, from);
              console.log(`📩 📋 [FIX v10.4] Diálogo e mensagens pendentes FECHADOS para chatId ${from}`);
              break;
            }
        }
        return;
      }

      // Menu principal
      // ⭐⭐⭐ FIX v21.6: Menu BLOQUEADO → TOTALMENTE SILENCIOSO (não envia NENHUMA mensagem) ⭐⭐⭐
      if (MENU_AJUDA_BLOQUEADO) {
        console.log(`📩 [FIX v21.6] ⛔ Menu BLOQUEADO — NÃO envia menu NEM mensagem genérica. Canal 100% livre.`);
        await fecharMensagensPendentes(clinicaId, from);
        // NÃO envia nenhuma mensagem — canal totalmente livre para conversas manuais
        return;
      }

      // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
      limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
      // ⭐⭐⭐ FIX v9.9: Salva diálogo com múltiplas chaves para matching robusto ⭐⭐⭐
      const dialogoMenuData = {
        pacienteId,
        pacienteNome,
        ultimos9,
        timestamp: Date.now()
      };
      dialogosAjuda.set(chaveDialogo, dialogoMenuData);
      dialogosAjuda.set(`${clinicaId}_9_${ultimos9}`, dialogoMenuData); // Chave canônica

      // ⭐⭐⭐ FIX v21.3: Usa config já carregado (sem query extra) + corrige texto antigo da opção 4 ⭐⭐⭐
      let menuMsg = '';

      // Tenta usar o template do config já carregado
      const templateDoBanco = config ? config.menuAjudaTemplate : null;
      if (templateDoBanco && String(templateDoBanco).trim().length > 10) {
        menuMsg = String(templateDoBanco).replace(/\{nome\}/g, pacienteNome !== 'Desconhecido' ? pacienteNome : 'Paciente');
        // ⭐ FIX: Corrige texto antigo "Falar com atendente" → "Emissão da 2ª via de boleto" (templates salvos antes da correção)
        menuMsg = menuMsg.replace(/Falar com atendente/gi, 'Emissão da 2ª via de boleto');
        menuMsg = menuMsg.replace(/Via de boleto bancário/gi, 'Emissão da 2ª via de boleto');
        console.log(`📩 [FIX v21.3] ✅ Usando menuAjudaTemplate do config (já carregado)`);
      }

      // Fallback: menu padrão completo com TODAS as opções (1-7 + 0)
      if (!menuMsg) {
        menuMsg = `👋 Olá${pacienteNome !== 'Desconhecido' ? `, *${pacienteNome}*` : ''}! Como posso ajudar?\n\nDigite o número da opção desejada:\n\n*1* - 📋 Minhas consultas\n*2* - 🕐 Horário de funcionamento\n*3* - 📍 Endereço / Como chegar\n*4* - 💰 Emissão da 2ª via de boleto\n*5* - 📷 Trocar foto de perfil\n*6* - 📄 Enviar documento\n*7* - ✅ Cheguei na clínica\n*0* - 🚪 Sair`;
        console.log(`📩 [FIX v21.3] ℹ️ Usando menu padrão (template não encontrado)`);
      }

      // ⭐⭐⭐ FIX v11.0: Fecha TODOS os pendentes anteriores antes de enviar novo menu ⭐⭐⭐
      await fecharMensagensPendentes(clinicaId, from);
      await enviarMensagemRobusta(serverUrl, wahaApiKey, from, menuMsg, sessionId);
      // ⭐⭐⭐ FIX v11.0: Menu espera resposta (opção 1-7, 0) → salva como 'pendente' ⭐⭐⭐
      await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', menuMsg, 'pendente', from);
      return;
    }

    console.log(`📩 Mensagem de texto sem comando reconhecido: "${text.substring(0, 50)}"`);

    // ⭐⭐⭐ FIX v26.1: SAFETY NET COMPLETAMENTE DESABILITADO ⭐⭐⭐
    // Convenção de diálogo único: sem mensagem 'pendente' (diálogo aberto), o sistema
    // NÃO busca consultas e NÃO confirma/cancela NADA. O paciente DEVE ter recebido
    // um prompt (lembrete) antes. Se o lembrete não foi enviado ou a mensagem pendente
    // expirou, o paciente precisa receber um novo lembrete antes de poder confirmar.
    // Isso elimina 100% dos falsos positivos de confirmação/cancelamento.
    const isConfirmacaoFinal = false; // DESABILITADO
    const isCancelamentoFinal = false; // DESABILITADO

    if (false && pacienteId && !pacienteId.startsWith('tel_')) {
      console.log(`📅 [FIX v11.4] ⚠️ SAFETY NET: Texto "${textoUpper}" é CONFIRMAÇÃO mas não foi capturado antes!`);
      console.log(`   Tentando busca AMPLA de consulta como último recurso...`);

      const hoje = new Date().toISOString().split('T')[0];
      const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Busca qualquer consulta futura não cancelada/finalizada
      let consultaUltimoRecurso = await new Promise((r) => db.get(
        `SELECT c.*, c.profissional as profissionalNome FROM consultas c
         WHERE c.pacienteId = ? 
           AND c.data >= ? 
           AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
           AND c.confirmacaoRecebidaEm IS NULL
         ORDER BY c.data ASC, c.horario ASC 
         LIMIT 1`,
        [pacienteId, ontem],
        (err, row) => {
          if (err) console.log(`📅 [FIX v11.4] Erro busca: ${err.message}`);
          r(row || null);
        }
      ));

      // Tenta sem filtro de data como último recurso
      if (!consultaUltimoRecurso) {
        consultaUltimoRecurso = await new Promise((r) => db.get(
          `SELECT c.*, c.profissional as profissionalNome FROM consultas c
           WHERE c.pacienteId = ? 
             AND c.status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
             AND c.confirmacaoRecebidaEm IS NULL
           ORDER BY c.data DESC, c.horario DESC 
           LIMIT 1`,
          [pacienteId],
          (err, row) => r(row || null)
        ));
      }

      if (consultaUltimoRecurso) {
        console.log(`📅 [FIX v11.4] ✅ Consulta encontrada via SAFETY NET: ${consultaUltimoRecurso.id} (data=${consultaUltimoRecurso.data})`);

        if (isConfirmacaoFinal) {
          const agora = new Date().toISOString();
          await new Promise((r) => db.run(
            `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ?, lembreteEnviado = 1 WHERE id = ?`,
            [agora, consultaUltimoRecurso.id],
            function (err) {
              if (err) console.log(`📅 ❌ [SAFETY NET] Erro ao confirmar: ${err.message}`);else
              console.log(`📅 ✅ [SAFETY NET] Consulta ${consultaUltimoRecurso.id} → 'confirmada' (changes: ${this?.changes || 'N/A'})`);
              r();
            }
          ));
          // ⭐⭐⭐ FIX: Verificação pós-UPDATE ⭐⭐⭐
          const verificacaoSN = await new Promise((r) => db.get(
            `SELECT status, confirmacaoRecebidaEm FROM consultas WHERE id = ?`,
            [consultaUltimoRecurso.id],
            (err, row) => r(row)
          ));
          if (!verificacaoSN || verificacaoSN.status !== 'confirmada') {
            console.log(`📅 ⚠️ [SAFETY NET] VERIFICAÇÃO FALHOU! status=${verificacaoSN?.status} → RETRY`);
            await new Promise((r) => db.run(
              `UPDATE consultas SET status = 'confirmada', confirmacaoRecebidaEm = ?, lembreteEnviado = 1 WHERE id = ?`,
              [agora, consultaUltimoRecurso.id],
              function (err) {
                if (err) console.log(`📅 ❌ [SAFETY NET] RETRY erro: ${err.message}`);else
                console.log(`📅 ✅ [SAFETY NET] RETRY OK (changes: ${this?.changes || 'N/A'})`);
                r();
              }
            ));
          } else {
            console.log(`📅 ✅ [SAFETY NET] VERIFICAÇÃO OK: status=${verificacaoSN.status}`);
          }
          const profNome = consultaUltimoRecurso.profissionalNome || consultaUltimoRecurso.profissional || 'o profissional';
          const dataFormatada = formatarData(consultaUltimoRecurso.data);
          // ⭐⭐⭐ FIX v23.1: Resolve nome correto via consulta > tabela pacientes > telefone ⭐⭐⭐
          const nomeCorretoSN = await resolverNomePaciente(db, consultaUltimoRecurso, pacienteNome);
          const idCorretoSN = consultaUltimoRecurso.pacienteId || pacienteId;
          const msgConfirmacao = `✅ *CONSULTA CONFIRMADA!*\n\n📅 ${dataFormatada} às ${consultaUltimoRecurso.horario}\n👨‍⚕️ ${profNome}\n\nObrigado, ${nomeCorretoSN}! Sua presença está confirmada.${!MENU_AJUDA_BLOQUEADO ? '\n\n_Se precisar de algo, digite *AJUDA*._' : ''}`;
          await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgConfirmacao, sessionId);
          // ⭐⭐⭐ FIX v18.0 + v23.0 ⭐⭐⭐
          await salvarMensagemHistorico(clinicaId, idCorretoSN, nomeCorretoSN, 'enviada', msgConfirmacao, 'enviada', from, consultaUltimoRecurso.id);
          await fecharMensagensPendentes(clinicaId, from);
          dialogosAjuda.delete(chaveDialogo);
          dialogosAjuda.delete(`${clinicaId}_9_${ultimos9}`);
          if (global.notificarChegadaPaciente) {
            global.notificarChegadaPaciente({
              tipo: 'confirmacao_consulta', clinicaId,
              consultaId: consultaUltimoRecurso.id, pacienteId: idCorretoSN, pacienteNome: nomeCorretoSN,
              data: consultaUltimoRecurso.data, horario: consultaUltimoRecurso.horario,
              profissional: profNome, status: 'confirmada'
            });
          }
          console.log(`📅 [FIX v11.4] ✅ Consulta CONFIRMADA via safety net!`);
          console.log(`📩📩📩 ======================================== FIM\n`);
          return;
        }

        if (isCancelamentoFinal) {
          const agora = new Date().toISOString();
          const cancelBRsn = agoraCancelamentoBR();
          await new Promise((r) => db.run(
            `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ?, lembreteEnviado = 1 WHERE id = ?`,
            [agora, consultaUltimoRecurso.id],
            function (err) {
              if (err) console.log(`📅 ❌ [SAFETY NET CANCEL] Erro: ${err.message}`);else
              console.log(`📅 ✅ [SAFETY NET CANCEL] Consulta ${consultaUltimoRecurso.id} → 'cancelada' (changes: ${this?.changes || 'N/A'})`);
              r();
            }
          ));
          await gravarMetadadosCancelamento(db, consultaUltimoRecurso.id, {
            data: cancelBRsn.dataCancelamento, hora: cancelBRsn.horaCancelamento
          });
          // ⭐⭐⭐ FIX: Verificação pós-UPDATE ⭐⭐⭐
          const verificacaoSNC = await new Promise((r) => db.get(
            `SELECT status, confirmacaoRecebidaEm FROM consultas WHERE id = ?`,
            [consultaUltimoRecurso.id],
            (err, row) => r(row)
          ));
          if (!verificacaoSNC || verificacaoSNC.status !== 'cancelada') {
            console.log(`📅 ⚠️ [SAFETY NET CANCEL] VERIFICAÇÃO FALHOU! → RETRY`);
            await new Promise((r) => db.run(
              `UPDATE consultas SET status = 'cancelada', confirmacaoRecebidaEm = ?, lembreteEnviado = 1 WHERE id = ?`,
              [agora, consultaUltimoRecurso.id],
              function (err) {
                if (err) console.log(`📅 ❌ [SAFETY NET CANCEL] RETRY erro: ${err.message}`);else
                console.log(`📅 ✅ [SAFETY NET CANCEL] RETRY OK`);
                r();
              }
            ));
            await gravarMetadadosCancelamento(db, consultaUltimoRecurso.id, {
              data: cancelBRsn.dataCancelamento, hora: cancelBRsn.horaCancelamento
            });
          } else {
            console.log(`📅 ✅ [SAFETY NET CANCEL] VERIFICAÇÃO OK`);
          }
          const profNome = consultaUltimoRecurso.profissionalNome || consultaUltimoRecurso.profissional || 'o profissional';
          const dataFormatada = formatarData(consultaUltimoRecurso.data);
          // ⭐⭐⭐ FIX v19.0: Limpa TODOS os diálogos anteriores antes de abrir novo ⭐⭐⭐
          limparTodosDialogosUsuario(clinicaId, chaveDialogo, `${clinicaId}_9_${ultimos9}`);
          // ⭐⭐⭐ FIX v23.1: Resolve nome correto via consulta > tabela pacientes > telefone ⭐⭐⭐
          const nomeCorretoSNCancel = await resolverNomePaciente(db, consultaUltimoRecurso, pacienteNome);
          const idCorretoSNCancel = consultaUltimoRecurso.pacienteId || pacienteId;
          const motivoData = { consultaId: consultaUltimoRecurso.id, pacienteId: idCorretoSNCancel, pacienteNome: nomeCorretoSNCancel, clinicaId, timestamp: Date.now() };
          conversasAguardandoMotivo.set(chaveDialogo, motivoData);
          conversasAguardandoMotivo.set(`${clinicaId}_9_${ultimos9}`, motivoData);
          const msgCancelamento = `❌ *CONSULTA CANCELADA*\n\n📅 ${dataFormatada} às ${consultaUltimoRecurso.horario}\n👨‍⚕️ ${profNome}\n\n📝 Por favor, informe o *MOTIVO DO CANCELAMENTO*:`;
          await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgCancelamento, sessionId);
          await fecharMensagensPendentes(clinicaId, from);
          await salvarMensagemHistorico(clinicaId, idCorretoSNCancel, nomeCorretoSNCancel, 'enviada', msgCancelamento, 'pendente', from, consultaUltimoRecurso.id);
          if (global.notificarChegadaPaciente) {
            global.notificarChegadaPaciente({
              tipo: 'cancelamento_consulta', clinicaId,
              consultaId: consultaUltimoRecurso.id, pacienteId: idCorretoSNCancel, pacienteNome: nomeCorretoSNCancel,
              data: consultaUltimoRecurso.data, horario: consultaUltimoRecurso.horario,
              profissional: profNome, status: 'cancelada',
              dataCancelamento: cancelBRsn.dataCancelamento, horaCancelamento: cancelBRsn.horaCancelamento,
              canceladoPor: 'Paciente', canalCancelamento: 'WhatsApp'
            });
          }
          console.log(`📅 [FIX v11.4] ❌ Consulta CANCELADA via safety net!`);
          console.log(`📩📩📩 ======================================== FIM\n`);
          return;
        }
      } else {
        console.log(`📅 [FIX v11.4] ❌ Nenhuma consulta encontrada mesmo via safety net`);
      }
    }

    // ⭐⭐⭐ FIX v21.4: Se menu bloqueado, NÃO envia "Não entendi" nem direciona para AJUDA ⭐⭐⭐
    if (MENU_AJUDA_BLOQUEADO) {
      console.log(`📩 [FIX v21.4] ⛔ Menu bloqueado — ignorando mensagem "${text.substring(0, 50)}" silenciosamente`);
      console.log(`📩📩📩 ======================================== FIM\n`);
      return;
    }

    // ⭐⭐⭐ FIX v26.2: GUARDA DEFINITIVA — "Não entendi" só dispara se houver DIÁLOGO ABERTO NESTA CLÍNICA ⭐⭐⭐
    // Regra do usuário: "só pode dar resposta automática pelo webhook se houver diálogo aberto...
    // caso contrário deve prevalecer a configuração de desabilitação de respostas"
    //
    // Sem mensagem pendente nesta clínica, a mensagem é espontânea (conversa casual). Não respondemos
    // "Não entendi / digite AJUDA" — apenas registramos no histórico e saímos silenciosos.
    const mensagemPendenteOrientacao = await buscarMensagemPendente(clinicaId, from);
    if (!mensagemPendenteOrientacao) {
      console.log(`📩 🚫 [FIX v26.2] Mensagem espontânea SEM diálogo aberto nesta clínica — não envia "Não entendi"`);
      console.log(`📩 🚫 [FIX v26.2] Regra: sem diálogo aberto → respeita config de desabilitação, encerra silenciosamente`);
      await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'recebida', text, 'recebida', from);
      console.log(`📩📩📩 ======================================== FIM\n`);
      return;
    }

    // ⭐⭐⭐ FIX v20.3: "Não entendi" espera resposta → fecha pendentes anteriores e salva como 'pendente' ⭐⭐⭐
    const msgOrientacao = `Olá${pacienteNome !== 'Desconhecido' ? `, ${pacienteNome}` : ''}! 👋\n\nNão entendi sua mensagem.\n\nDigite *AJUDA* para ver as opções disponíveis.\nOu responda *SIM* / *NÃO* se você recebeu um lembrete de consulta.\n\nDigite *0* para sair.`;
    await fecharMensagensPendentes(clinicaId, from);
    await enviarMensagemRobusta(serverUrl, wahaApiKey, from, msgOrientacao, sessionId);
    await salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, 'enviada', msgOrientacao, 'pendente', from);

    console.log(`📩 [FIX v20.3] "Não entendi" salvo como PENDENTE (espera resposta do paciente)`);

    console.log(`📩📩📩 ======================================== FIM\n`);

  } catch (e) {
    console.error(`📩 ❌ ERRO NO WEBHOOK: ${e.message}`);
    console.error(e.stack);
  }
});

// ==================== SSE PARA NOTIFICAÇÃO DE CHEGADA ====================

// ⭐⭐⭐ NOVO v9.0: SSE para notificação de chegada de pacientes ⭐⭐⭐
// ⭐ FIX multi-tenant v23: cada cliente conectado agora carrega o clinicaId
// na URL (?clinicaId=...), e a função notificarChegadaPaciente filtra os
// destinatários por clinicaId. Antes, o Set era global e qualquer chegada em
// qualquer clínica era broadcast para TODOS os usuários — paciente da clínica
// A apareceria como "chegou" para usuários logados na clínica B.
// Estrutura: Map<res, { clinicaId, connectedAt }>
const chegadaClients = new Map();

router.get('/chegada-sse', (req, res) => {
  const clinicaIdClient = String(req.query.clinicaId || '').trim();

  if (!clinicaIdClient) {
    console.warn('🔔 [chegada-sse] ⚠️ Conexão SEM clinicaId — recusada para evitar leak cross-tenant');
    res.status(400).end('clinicaId é obrigatório');
    return;
  }

  console.log(`🔔 [chegada-sse] Cliente SSE conectado (clinicaId=${clinicaIdClient})`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  chegadaClients.set(res, { clinicaId: clinicaIdClient, connectedAt: Date.now() });

  // Heartbeat a cada 30s para manter conexão viva
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
  }, 30000);

  req.on('close', () => {
    console.log(`🔔 [chegada-sse] Cliente SSE desconectado (clinicaId=${clinicaIdClient})`);
    clearInterval(heartbeat);
    chegadaClients.delete(res);
  });
});

// Função global para notificar eventos de paciente via SSE
// ⭐⭐⭐ FIX v10.9.9: Usa o tipo REAL do evento em vez de hardcodar 'chegada_paciente' ⭐⭐⭐
// ⭐⭐⭐ FIX v23 multi-tenant: filtra clientes por clinicaId — só envia para
// quem está logado na MESMA clínica do evento.
global.notificarChegadaPaciente = function (dados) {
  const tipoEvento = dados.tipo || 'chegada_paciente';
  const clinicaIdEvento = dados.clinicaId ? String(dados.clinicaId) : null;

  if (!clinicaIdEvento) {
    // Defensivo: se um caller esquecer de passar clinicaId, NÃO broadcast — log loud.
    console.error(`🔔 [chegada-sse] ❌ Evento SEM clinicaId — bloqueado para evitar leak cross-tenant. tipo=${tipoEvento}, paciente=${dados.pacienteNome}`);
    return;
  }

  let enviados = 0;
  let ignorados = 0;
  chegadaClients.forEach((meta, client) => {
    // ⭐ Só envia para clientes da MESMA clínica do evento
    if (String(meta.clinicaId) !== clinicaIdEvento) {
      ignorados++;
      return;
    }
    try {
      client.write(`data: ${JSON.stringify({ type: tipoEvento, ...dados })}\n\n`);
      enviados++;
    } catch (e) {
      console.error('🔔 [chegada-sse] Erro ao enviar:', e.message);
    }
  });
  console.log(`🔔 [chegada-sse] Notificado clinicaId=${clinicaIdEvento}: ${enviados} cliente(s), ${ignorados} ignorado(s) de outras clínicas — tipo=${tipoEvento}, paciente=${dados.pacienteNome}`);
};

module.exports = router;