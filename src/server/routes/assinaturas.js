// ==================== ROTAS DE ASSINATURAS DIGITAIS ====================
// VERSÃO: 1.1.0 - 2026-02-27
// ✅ FIX: Usa fetch nativo do Node 18+ com fallback para node-fetch
// ✅ FIX v1.1.0: Usa enviarMensagemRobusta do whatsapp-shared.js (mesmo endpoint que TODO o sistema)

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getClinicaDB } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');

// ⭐⭐⭐ FIX v1.1.0: Usa enviarMensagemRobusta do whatsapp-shared.js (mesmo endpoint que TODO o sistema) ⭐⭐⭐
const { enviarMensagemRobusta, getWahaApiKey } = require('./whatsapp-shared');

// ⭐⭐⭐ FIX v1.0.3: FETCH ROBUSTO ⭐⭐⭐
let fetch;
if (typeof globalThis.fetch === 'function') {
  fetch = globalThis.fetch;
} else {
  try {fetch = require('node-fetch');} catch (e1) {
    try {
      const _importDynamic = new Function('modulePath', 'return import(modulePath)');
      fetch = async (...args) => {const mod = await _importDynamic('node-fetch');return mod.default(...args);};
    } catch (e2) {
      fetch = async () => {throw new Error('fetch não disponível. Use Node.js 18+ ou instale node-fetch@2');};
    }
  }
}

const ASSINATURAS_VERSION = '1.1.0';

console.log('📝 [Assinaturas] Módulo carregado - versão', ASSINATURAS_VERSION);

// ==================== VERIFICAR SE TABELA EXISTE (MySQL + SQLite) ====================
function checkTableExists(db, tableName) {
  return new Promise((resolve) => {
    db.get(`SHOW TABLES LIKE '${tableName}'`, [], (err, row) => {
      if (err) {
        // Fallback: SQLite syntax
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`, [], (err2, row2) => {
          resolve(!!row2);
        });
      } else {
        resolve(!!row);
      }
    });
  });
}

// ==================== CRIAR TABELA SE NÃO EXISTIR ====================
async function ensureAssinaturasTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS assinaturas (
        id VARCHAR(191) PRIMARY KEY,
        token VARCHAR(191) UNIQUE NOT NULL,
        clinicaId VARCHAR(191) NOT NULL,
        pacienteId VARCHAR(191) NOT NULL,
        pacienteNome VARCHAR(500) NOT NULL,
        pacienteTelefone VARCHAR(50),
        tipo VARCHAR(50) NOT NULL,
        titulo VARCHAR(500) NOT NULL,
        descricao TEXT,
        assinaturaBase64 LONGTEXT,
        status VARCHAR(20) DEFAULT 'pendente',
        criadoEm VARCHAR(50) NOT NULL,
        assinadoEm VARCHAR(50),
        expiraEm VARCHAR(50) NOT NULL,
        atendimentoId VARCHAR(191)
      )
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela assinaturas:', err);
        reject(err);
      } else {
        // Adiciona coluna atendimentoId se não existir
        db.run(`ALTER TABLE assinaturas ADD COLUMN atendimentoId TEXT`, () => {
          resolve();
        });
      }
    });
  });
}

// ==================== PROCURAR TOKEN NUMA CLÍNICA ====================
// Uma clínica com banco indisponível não pode derrubar a busca inteira
// (antes virava erro 500 e o paciente via "link inválido").
async function buscarTokenNaClinica(clinicaId, token) {
  try {
    const db = getClinicaDB(clinicaId);
    if (!(await checkTableExists(db, 'assinaturas'))) return null;
    return await new Promise((resolve) => {
      db.get('SELECT * FROM assinaturas WHERE token = ?', [token], (err, row) => {
        if (err) {
          console.warn(`⚠️ [Assinaturas] Clínica ${clinicaId} ignorada na busca do token: ${err.message}`);
          resolve(null);
        } else {
          resolve(row || null);
        }
      });
    });
  } catch (err) {
    console.warn(`⚠️ [Assinaturas] Clínica ${clinicaId} ignorada na busca do token: ${err.message}`);
    return null;
  }
}

// ==================== GERAR TOKEN ÚNICO ====================
function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ==================== ENVIAR WHATSAPP ====================
async function enviarWhatsApp(clinicaId, telefone, mensagem) {
  console.log('\n📤📤📤 [Assinaturas] ========================================');
  console.log('📤 [Assinaturas] Iniciando envio WhatsApp via enviarMensagemRobusta...');
  console.log('📤 [Assinaturas] clinicaId:', clinicaId);
  console.log('📤 [Assinaturas] telefone:', telefone);

  try {
    const db = getClinicaDB(clinicaId);

    // ⭐ GARANTE QUE A TABELA EXISTE
    await new Promise((resolve) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_config (
          id TEXT PRIMARY KEY,
          clinicaId TEXT NOT NULL,
          provider TEXT,
          serverUrl TEXT,
          sessionName TEXT,
          ativo INTEGER DEFAULT 0,
          horasAntecedencia INTEGER DEFAULT 24,
          mensagemTemplate TEXT,
          enviarConfirmacao INTEGER DEFAULT 1,
          atualizadoEm TEXT
        )
      `, () => resolve());
    });

    const config = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [clinicaId], (err, row) => {
        if (err) {
          console.error('❌ [Assinaturas] Erro ao buscar config:', err);
          reject(err);
        } else {
          console.log('📤 [Assinaturas] Config encontrada:', row ? 'SIM' : 'NÃO');
          if (row) {
            console.log('📤 [Assinaturas] Config detalhes:', {
              serverUrl: row.serverUrl || '(vazio)',
              sessionName: row.sessionName || '(vazio)',
              ativo: row.ativo
            });
          }
          resolve(row);
        }
      });
    });

    if (!config) {
      console.log('⚠️ [Assinaturas] Nenhuma config de WhatsApp encontrada para clínica:', clinicaId);
      console.log('📤📤📤 ======================================== FIM (sem config)\n');
      return { enviado: false, motivo: 'WhatsApp não configurado para esta clínica' };
    }

    if (!config.serverUrl || !config.sessionName) {
      console.log('⚠️ [Assinaturas] WhatsApp não configurado (serverUrl ou sessionName vazio)');
      console.log('📤📤📤 ======================================== FIM (config incompleta)\n');
      return { enviado: false, motivo: 'WhatsApp não configurado corretamente (falta serverUrl ou sessionName)' };
    }

    let numero = telefone.replace(/\D/g, '');
    if (!numero.startsWith('55')) {
      numero = '55' + numero;
    }
    const chatId = `${numero}@c.us`;

    console.log('📤 [Assinaturas] Enviando WhatsApp para:', chatId);
    console.log('📤 [Assinaturas] serverUrl:', config.serverUrl);
    console.log('📤 [Assinaturas] sessionName:', config.sessionName);

    // ⭐⭐⭐ FIX v1.1.0: Usa enviarMensagemRobusta — mesma função usada por TODO o sistema ⭐⭐⭐
    // Endpoint correto: /api/sendText (NÃO /api/sessions/.../send-message que retorna 404)
    const apiKey = config.apiKey || getWahaApiKey();
    const resultado = await enviarMensagemRobusta(config.serverUrl, apiKey, chatId, mensagem, config.sessionName);

    if (resultado.success) {
      console.log('✅ [Assinaturas] WhatsApp enviado com sucesso via enviarMensagemRobusta!');
      console.log('📤📤📤 ======================================== FIM (sucesso)\n');
      return { enviado: true };
    } else {
      const motivo = resultado.error || resultado.statusRedirect ? 'Mensagem redirecionada para Status' : 'Falha no envio';
      console.error('❌ [Assinaturas] Erro ao enviar WhatsApp:', motivo);
      console.log('📤📤📤 ======================================== FIM (erro)\n');
      return { enviado: false, motivo };
    }
  } catch (err) {
    console.error('❌ [Assinaturas] Exceção ao enviar WhatsApp:', err.message);
    console.log('📤📤📤 ======================================== FIM (exceção)\n');
    return { enviado: false, motivo: err.message };
  }
}

// ==================== SOLICITAR ASSINATURA ====================
router.post('/solicitar', async (req, res) => {
  console.log('\n📝📝📝 POST /api/assinaturas/solicitar ========================================');
  console.log('📝 Body:', JSON.stringify(req.body, null, 2));

  try {
    const { clinicaId, pacienteId, pacienteNome, pacienteTelefone, tipo, titulo, descricao, atendimentoId } = req.body;

    if (!clinicaId) {
      console.log('❌ clinicaId é obrigatório');
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }
    if (!pacienteId) {
      console.log('❌ pacienteId é obrigatório');
      return res.status(400).json({ error: 'pacienteId é obrigatório' });
    }
    if (!pacienteNome) {
      console.log('❌ pacienteNome é obrigatório');
      return res.status(400).json({ error: 'pacienteNome é obrigatório' });
    }
    if (!tipo) {
      console.log('❌ tipo é obrigatório');
      return res.status(400).json({ error: 'tipo é obrigatório' });
    }
    if (!titulo) {
      console.log('❌ titulo é obrigatório');
      return res.status(400).json({ error: 'titulo é obrigatório' });
    }

    console.log('📝 Parâmetros validados:');
    console.log('   clinicaId:', clinicaId);
    console.log('   pacienteId:', pacienteId);
    console.log('   pacienteNome:', pacienteNome);
    console.log('   pacienteTelefone:', pacienteTelefone || '(vazio)');
    console.log('   tipo:', tipo);
    console.log('   titulo:', titulo);

    const db = getClinicaDB(clinicaId);
    await ensureAssinaturasTable(db);

    const id = `ass_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const token = gerarToken();
    const criadoEm = new Date().toISOString();
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO assinaturas (id, token, clinicaId, pacienteId, pacienteNome, pacienteTelefone, tipo, titulo, descricao, status, criadoEm, expiraEm, atendimentoId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)
      `, [id, token, clinicaId, pacienteId, pacienteNome, pacienteTelefone || '', tipo, titulo, descricao || '', criadoEm, expiraEm, atendimentoId || null], (err) => {
        if (err) reject(err);else
        resolve();
      });
    });

    console.log('✅ [Assinaturas] Assinatura criada:', id);

    // ⭐ O link aponta para o MESMO sistema que pediu a assinatura.
    // Antes ele usava APP_URL fixo: um pedido feito numa instalação (ex.:
    // x-star) gerava link para outra (ex.: sky9), cujo servidor usa outro
    // banco — o paciente abria e via "Link inválido ou expirado".
    // O Origin é posto pelo navegador e identifica o front que fez o pedido;
    // esse front conversa com este servidor, logo encontra o token.
    // Ordem: VITE_APP_BASE_URL da instalação (enviado pela tela como appUrl)
    // → Origin do navegador → APP_URL do servidor.
    const origin = req.body.appUrl || req.headers.origin || req.headers.referer;
    let baseUrl = process.env.APP_URL || 'https://clinic-app.sky9.com.br';
    try {
      if (origin) {
        const originUrl = new URL(String(origin));
        if (originUrl.protocol === 'https:' || originUrl.protocol === 'http:') {
          baseUrl = `${originUrl.protocol}//${originUrl.host}`;
        }
      }
    } catch {

      // Origin malformado: mantém APP_URL
    }
    const linkAssinatura = `${baseUrl}/assinar/${token}`;

    console.log('🔗 [Assinaturas] Origin:', origin);
    console.log('🔗 [Assinaturas] Base URL:', baseUrl);
    console.log('🔗 [Assinaturas] Link:', linkAssinatura);

    let whatsappEnviado = false;
    let whatsappErro = null;

    if (pacienteTelefone) {
      console.log('📱 [Assinaturas] Telefone informado, tentando enviar WhatsApp...');

      const mensagem = `📝 *Solicitação de Assinatura Digital*\n\n` +
      `Olá, ${pacienteNome}!\n\n` +
      `Você recebeu uma solicitação para assinar digitalmente:\n\n` +
      `📄 *${titulo}*\n` +
      `${descricao ? `\n${descricao}\n` : ''}\n` +
      `🔗 Clique no link abaixo para assinar:\n${linkAssinatura}\n\n` +
      `⏰ Este link é válido por 7 dias.\n\n` +
      `_Assinatura digital com validade jurídica._`;

      const resultado = await enviarWhatsApp(clinicaId, pacienteTelefone, mensagem);
      whatsappEnviado = resultado.enviado;
      whatsappErro = resultado.motivo;

      console.log('📱 [Assinaturas] Resultado do envio:', { whatsappEnviado, whatsappErro });
    } else {
      console.log('📱 [Assinaturas] Sem telefone - não enviará WhatsApp');
      whatsappErro = 'Paciente sem telefone cadastrado';
    }

    const response = {
      success: true,
      id,
      token,
      linkAssinatura,
      whatsappEnviado,
      whatsappErro,
      expiraEm
    };

    console.log('📝 [Assinaturas] Resposta:', JSON.stringify(response, null, 2));
    console.log('📝📝📝 ======================================== FIM\n');

    res.json(response);

  } catch (err) {
    console.error('❌ [Assinaturas] Erro:', err);
    console.log('📝📝📝 ======================================== FIM (erro)\n');
    res.status(500).json({ error: err.message });
  }
});

// ==================== BUSCAR ASSINATURA POR TOKEN ====================
router.get('/:token', async (req, res) => {
  console.log('\n📝 GET /api/assinaturas/:token');

  try {
    const { token } = req.params;

    if (!token || token.length < 10) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    // ⭐⭐⭐ FIX v1.1.0: dbGlobal usa MySQL — API é prepare().all(), NÃO .all(callback) ⭐⭐⭐
    const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();

    let assinatura = null;

    for (const clinica of clinicas) {
      const found = await buscarTokenNaClinica(clinica.id, token);
      if (found) {
        assinatura = found;
        break;
      }
    }

    if (!assinatura) {
      console.warn(`⚠️ [Assinaturas] Token não encontrado em ${clinicas.length} clínica(s) deste servidor`);
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    if (new Date(assinatura.expiraEm) < new Date()) {
      return res.status(410).json({ error: 'Link de assinatura expirado' });
    }

    // ⭐ CORREÇÃO: Retorna status 'assinado' corretamente para mostrar tela de sucesso
    res.json({
      id: assinatura.id,
      token: assinatura.token,
      clinicaId: assinatura.clinicaId,
      pacienteId: assinatura.pacienteId,
      pacienteNome: assinatura.pacienteNome,
      tipo: assinatura.tipo,
      titulo: assinatura.titulo,
      descricao: assinatura.descricao,
      status: assinatura.status,
      criadoEm: assinatura.criadoEm,
      expiraEm: assinatura.expiraEm,
      assinadoEm: assinatura.assinadoEm
    });

  } catch (err) {
    console.error('❌ [Assinaturas] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ASSINAR DOCUMENTO ====================
router.post('/:token/assinar', async (req, res) => {
  console.log('\n📝 POST /api/assinaturas/:token/assinar');

  try {
    const { token } = req.params;
    const { assinaturaBase64 } = req.body;

    if (!token || token.length < 10) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    if (!assinaturaBase64) {
      return res.status(400).json({ error: 'assinaturaBase64 é obrigatório' });
    }

    // ⭐⭐⭐ FIX v1.1.0: dbGlobal usa MySQL — API é prepare().all(), NÃO .all(callback) ⭐⭐⭐
    const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();

    let assinatura = null;
    let clinicaDb = null;

    for (const clinica of clinicas) {
      const found = await buscarTokenNaClinica(clinica.id, token);
      if (found) {
        assinatura = found;
        clinicaDb = getClinicaDB(clinica.id);
        break;
      }
    }

    if (!assinatura) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    if (new Date(assinatura.expiraEm) < new Date()) {
      return res.status(410).json({ error: 'Link de assinatura expirado' });
    }

    if (assinatura.status === 'assinado') {
      return res.status(400).json({ error: 'Documento já foi assinado' });
    }

    const assinadoEm = new Date().toISOString();

    // 1. Atualiza tabela de assinaturas
    await new Promise((resolve, reject) => {
      clinicaDb.run(`
        UPDATE assinaturas 
        SET assinaturaBase64 = ?, status = 'assinado', assinadoEm = ?
        WHERE token = ?
      `, [assinaturaBase64, assinadoEm, token], (err) => {
        if (err) reject(err);else
        resolve();
      });
    });

    console.log('✅ [Assinaturas] Tabela assinaturas atualizada');

    // 2. ⭐ FIX: Atualiza o ÚLTIMO atendimento do paciente com a assinatura
    // MySQL não permite subquery UPDATE na mesma tabela — busca o ID primeiro
    const ultimoAtendimento = await new Promise((resolve, reject) => {
      clinicaDb.get(
        `SELECT id FROM atendimentos WHERE pacienteId = ? ORDER BY criadoEm DESC LIMIT 1`,
        [assinatura.pacienteId],
        (err, row) => {
          if (err) {console.error('⚠️ [Assinaturas] Erro ao buscar último atendimento:', err.message);resolve(null);} else
          resolve(row);
        }
      );
    });

    if (ultimoAtendimento) {
      await new Promise((resolve) => {
        clinicaDb.run(`
          UPDATE atendimentos 
          SET assinaturaPaciente = ?, dataAssinatura = ?
          WHERE id = ? AND (assinaturaPaciente IS NULL OR assinaturaPaciente = '')
        `, [assinaturaBase64, assinadoEm, ultimoAtendimento.id], function (err) {
          if (err) {
            console.error('⚠️ [Assinaturas] Erro ao atualizar atendimento:', err.message);
          } else {
            console.log('✅ [Assinaturas] Atendimento atualizado:', this.changes, 'registro(s)', '| id:', ultimoAtendimento.id);
          }
          resolve();
        });
      });
    } else {
      console.log('⚠️ [Assinaturas] Nenhum atendimento encontrado para paciente:', assinatura.pacienteId);
    }

    // 3. ⭐ NOVO: Também atualiza o prontuário se tiver atendimentoId específico
    if (assinatura.atendimentoId) {
      await new Promise((resolve, reject) => {
        clinicaDb.run(`
          UPDATE atendimentos 
          SET assinaturaPaciente = ?, dataAssinatura = ?
          WHERE id = ?
        `, [assinaturaBase64, assinadoEm, assinatura.atendimentoId], function (err) {
          if (err) {
            console.error('⚠️ [Assinaturas] Erro ao atualizar atendimento específico:', err.message);
          } else {
            console.log('✅ [Assinaturas] Atendimento específico atualizado:', this.changes, 'registro(s)');
          }
          resolve();
        });
      });
    }

    console.log('✅ [Assinaturas] Documento assinado:', assinatura.id);
    console.log('📡 [Assinaturas] Verificando notificação SSE...');
    console.log('📡 [Assinaturas] global.notificarAssinatura existe?', typeof global.notificarAssinatura);

    // 4. Notifica via SSE
    if (typeof global.notificarAssinatura === 'function') {
      console.log('📡 [Assinaturas] Enviando notificação SSE para paciente:', assinatura.pacienteId);
      global.notificarAssinatura(assinatura.pacienteId, {
        type: 'assinatura_concluida',
        assinaturaId: assinatura.id,
        titulo: assinatura.titulo,
        pacienteNome: assinatura.pacienteNome,
        assinadoEm
      });
      console.log('✅ [Assinaturas] Notificação SSE enviada!');
    } else {
      console.log('⚠️ [Assinaturas] global.notificarAssinatura não está disponível');
    }

    // 5. ⭐⭐⭐ NOVO: Envia confirmação por WhatsApp + Menu de Ajuda ⭐⭐⭐
    if (assinatura.pacienteTelefone) {
      console.log('📱 [Assinaturas] Enviando confirmação de assinatura por WhatsApp...');

      const dataFormatada = new Date(assinadoEm).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // ⭐⭐⭐ FIX v21.2: Verifica menuAjudaSituacoes antes de incluir menu ⭐⭐⭐
      let menuTexto = '';
      try {
        const dbCheck = getClinicaDB(assinatura.clinicaId);
        const cfgCheck = await new Promise((resolve) => dbCheck.get(
          'SELECT menuAjudaSituacoes FROM whatsapp_config WHERE clinicaId = ?',
          [assinatura.clinicaId], (err, row) => resolve(row || null)
        ));
        let menuPermitido = true;
        if (cfgCheck && cfgCheck.menuAjudaSituacoes && cfgCheck.menuAjudaSituacoes.trim().length > 2) {
          try {
            const sit = JSON.parse(cfgCheck.menuAjudaSituacoes);
            const algumHab = Object.values(sit).some((v) => v === true || v === 1 || v === '1' || v === 'true');
            if (!algumHab) menuPermitido = false;
          } catch (e) {}
        }
        if (menuPermitido) {
          menuTexto = `\n\n━━━━━━━━━━━━━━━━━━━━\n\n*Como posso ajudar?*\n\n1️⃣ Minhas consultas\n2️⃣ Horário de funcionamento\n3️⃣ 📍 Endereço / Como chegar\n4️⃣ 💰 Emissão da 2ª via de boleto\n5️⃣ 📷 Trocar foto de perfil\n6️⃣ 📄 Enviar documento\n7️⃣ ✅ Cheguei na clínica\n0️⃣ Sair`;
        } else {
          console.log(`📱 [Assinaturas] Menu de ajuda BLOQUEADO — todas as situações desabilitadas`);
        }
      } catch (e) {
        console.log(`📱 [Assinaturas] ⚠️ Erro ao verificar menuAjudaSituacoes: ${e.message}`);
        menuTexto = `\n\n━━━━━━━━━━━━━━━━━━━━\n\n*Como posso ajudar?*\n\n1️⃣ Minhas consultas\n2️⃣ Horário de funcionamento\n3️⃣ 📍 Endereço / Como chegar\n4️⃣ 💰 Emissão da 2ª via de boleto\n5️⃣ 📷 Trocar foto de perfil\n6️⃣ 📄 Enviar documento\n7️⃣ ✅ Cheguei na clínica\n0️⃣ Sair`;
      }

      const mensagemConfirmacao = `✅ *Assinatura Registrada com Sucesso!*\n\n` +
      `Olá, *${assinatura.pacienteNome}*! 👋\n\n` +
      `Sua assinatura digital foi registrada:\n\n` +
      `📄 *Documento:* ${assinatura.titulo}\n` +
      `📅 *Data/Hora:* ${dataFormatada}\n\n` +
      `Obrigado por assinar digitalmente! 🙏${menuTexto}`;

      const resultadoEnvio = await enviarWhatsApp(assinatura.clinicaId, assinatura.pacienteTelefone, mensagemConfirmacao);

      if (resultadoEnvio.enviado) {
        console.log('✅ [Assinaturas] Confirmação enviada por WhatsApp com sucesso!');

        // ⭐⭐⭐ Ativa o diálogo de ajuda usando função global ⭐⭐⭐
        if (typeof global.ativarDialogoAjuda === 'function') {
          const resultado = global.ativarDialogoAjuda(
            assinatura.clinicaId,
            assinatura.pacienteTelefone,
            assinatura.pacienteId,
            assinatura.pacienteNome
          );
          console.log('✅ [Assinaturas] Diálogo de ajuda ativado:', resultado);
        } else {
          console.log('⚠️ [Assinaturas] global.ativarDialogoAjuda não está disponível');
        }
      } else {
        console.log('⚠️ [Assinaturas] Não foi possível enviar confirmação por WhatsApp:', resultadoEnvio.motivo);
      }
    } else {
      console.log('📱 [Assinaturas] Paciente sem telefone - confirmação não enviada por WhatsApp');
    }

    res.json({
      success: true,
      message: 'Documento assinado com sucesso!',
      assinadoEm
    });

  } catch (err) {
    console.error('❌ [Assinaturas] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== LISTAR ASSINATURAS DO PACIENTE ====================
router.get('/paciente/:pacienteId', async (req, res) => {
  console.log('\n📝 GET /api/assinaturas/paciente/:pacienteId');

  try {
    const { pacienteId } = req.params;
    const { clinicaId } = req.query;

    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    const db = getClinicaDB(clinicaId);

    const tableExists = await checkTableExists(db, 'assinaturas');

    if (!tableExists) {
      return res.json([]);
    }

    const assinaturas = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM assinaturas WHERE pacienteId = ? ORDER BY criadoEm DESC', [pacienteId], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    const resultado = assinaturas.map((a) => ({
      ...a,
      assinaturaBase64: a.assinaturaBase64 ? '[ASSINADO]' : null
    }));

    res.json(resultado);

  } catch (err) {
    console.error('❌ [Assinaturas] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== VERSÃO ====================
router.get('/version', (req, res) => {
  res.json({ version: ASSINATURAS_VERSION });
});

// ==================== VINCULAR ASSINATURA AO ATENDIMENTO ====================
// POST /api/assinaturas/:id/vincular { clinicaId, atendimentoId }
// A assinatura pode ser pedida num "Novo atendimento" ainda não gravado
// (atendimentoId = 'NOVO'). Quando o atendimento real passa a existir, a tela
// liga a assinatura a ele — assim o prontuário fica assinado de fato.
router.post('/:id/vincular', async (req, res) => {
  try {
    const { clinicaId, atendimentoId } = req.body || {};
    if (!clinicaId || !atendimentoId || atendimentoId === 'NOVO') {
      return res.status(400).json({ error: 'clinicaId e atendimentoId são obrigatórios' });
    }
    const db = getClinicaDB(clinicaId);
    const assinatura = await new Promise((resolve) => {
      db.get('SELECT * FROM assinaturas WHERE id = ?', [req.params.id], (err, row) => resolve(err ? null : row));
    });
    if (!assinatura) return res.status(404).json({ error: 'Assinatura não encontrada' });
    if (assinatura.status !== 'assinado') return res.status(409).json({ error: 'A assinatura ainda não foi feita' });
    if (assinatura.atendimentoId && assinatura.atendimentoId !== 'NOVO' && assinatura.atendimentoId !== atendimentoId) {
      return res.status(409).json({ error: 'Esta assinatura já pertence a outro atendimento' });
    }
    const executar = (sql, params) =>
    new Promise((resolve, reject) => db.run(sql, params, (err) => err ? reject(err) : resolve()));
    await executar('UPDATE assinaturas SET atendimentoId = ? WHERE id = ?', [atendimentoId, assinatura.id]);
    await executar(
      `UPDATE atendimentos SET assinaturaPaciente = ?, dataAssinatura = ?
       WHERE id = ? AND (assinaturaPaciente IS NULL OR assinaturaPaciente = '')`,
      [assinatura.assinaturaBase64, assinatura.assinadoEm, atendimentoId]
    );
    console.log(`✅ [Assinaturas] Assinatura ${assinatura.id} vinculada ao atendimento ${atendimentoId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [Assinaturas] Erro ao vincular:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;