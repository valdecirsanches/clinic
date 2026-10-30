// ==================== ROTAS DE CARTEIRINHA DIGITAL ====================
// VERSÃO: 1.0.2 - 2026-02-27
// ✅ FIX: Usa fetch nativo do Node 18+ com fallback para node-fetch

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getClinicaDB } = require('../databaseClinica');

// ⭐⭐⭐ FIX v1.0.2: FETCH ROBUSTO ⭐⭐⭐
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

// Diretório para salvar as carteirinhas
const CARTEIRINHAS_DIR = path.join(__dirname, '..', 'uploads', 'carteirinhas');

// Garante que o diretório existe
if (!fs.existsSync(CARTEIRINHAS_DIR)) {
  fs.mkdirSync(CARTEIRINHAS_DIR, { recursive: true });
  console.log('📁 Diretório de carteirinhas criado:', CARTEIRINHAS_DIR);
}

console.log('🪪 [Carteirinha] Módulo carregado - diretório:', CARTEIRINHAS_DIR);

// POST /api/carteirinha/upload - Salva imagem da carteirinha e retorna URL
router.post('/upload', async (req, res) => {
  console.log('\n🪪🪪🪪 POST /api/carteirinha/upload ========================================');

  try {
    const { base64, pacienteId, clinicaId, operadoraId } = req.body;

    console.log('🪪 pacienteId:', pacienteId);
    console.log('🪪 clinicaId:', clinicaId);
    console.log('🪪 base64 length:', base64?.length || 0);

    if (!base64) {
      console.log('🪪 ❌ base64 é obrigatório');
      return res.status(400).json({ error: 'base64 é obrigatório' });
    }

    if (!pacienteId) {
      console.log('🪪 ❌ pacienteId é obrigatório');
      return res.status(400).json({ error: 'pacienteId é obrigatório' });
    }

    // Remove o prefixo data:image/jpeg;base64, se existir
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

    // Gera nome único para o arquivo
    const timestamp = Date.now();
    const fileName = `carteirinha_${clinicaId || 'c'}_${pacienteId}_${timestamp}.jpg`;
    const filePath = path.join(CARTEIRINHAS_DIR, fileName);

    console.log('🪪 Salvando arquivo:', filePath);

    // Salva o arquivo
    fs.writeFileSync(filePath, base64Data, 'base64');

    console.log('🪪 ✅ Arquivo salvo!');

    // Monta a URL pública - USA A URL DE PRODUÇÃO
    const serverUrl = process.env.SERVER_DB || process.env.API_URL || process.env.APP_URL || 'https://api.x-star.com.br';
    const publicUrl = `${serverUrl}/uploads/carteirinhas/${fileName}`;

    console.log('🪪 URL pública:', publicUrl);
    console.log('🪪🪪🪪 ======================================== FIM ✅\n');

    res.json({
      success: true,
      url: publicUrl,
      fileName: fileName
    });

  } catch (err) {
    console.error('🪪 ❌ Erro ao salvar carteirinha:', err);
    console.log('🪪🪪🪪 ======================================== FIM ❌\n');
    res.status(500).json({ error: err.message });
  }
});

// ⭐⭐⭐ POST /api/carteirinha/enviar-menu - Envia menu de ajuda após carteirinha ⭐⭐⭐
router.post('/enviar-menu', async (req, res) => {
  console.log('\n🪪📱 POST /api/carteirinha/enviar-menu ========================================');

  try {
    const { clinicaId, pacienteId, pacienteNome, telefone } = req.body;

    console.log('🪪📱 clinicaId:', clinicaId);
    console.log('🪪📱 pacienteId:', pacienteId);
    console.log('🪪📱 pacienteNome:', pacienteNome);
    console.log('🪪📱 telefone:', telefone);

    if (!clinicaId || !telefone) {
      console.log('🪪📱 ❌ Parâmetros faltando');
      return res.status(400).json({ error: 'clinicaId e telefone são obrigatórios' });
    }

    // Busca config do WhatsApp
    const db = getClinicaDB(clinicaId);
    const config = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [clinicaId], (err, row) => {
        if (err) reject(err);else
        resolve(row);
      });
    });

    console.log('🪪📱 Config WhatsApp:', config ? 'encontrada' : 'NÃO ENCONTRADA');

    if (!config || !config.serverUrl || !config.sessionName) {
      console.log('🪪📱 ❌ WhatsApp não configurado');
      return res.status(400).json({ error: 'WhatsApp não configurado' });
    }

    console.log('🪪📱 serverUrl:', config.serverUrl);
    console.log('🪪📱 sessionName:', config.sessionName);

    // Formata telefone
    let numero = telefone.replace(/\D/g, '');
    if (!numero.startsWith('55')) {
      numero = '55' + numero;
    }

    console.log('🪪📱 Número formatado:', numero);

    // ⭐⭐⭐ FIX v21.2: Verifica menuAjudaSituacoes antes de incluir menu ⭐⭐⭐
    let menuPermitido = true;
    try {
      const situacoesRaw = config.menuAjudaSituacoes;
      if (situacoesRaw && situacoesRaw.trim().length > 2) {
        const sit = JSON.parse(situacoesRaw);
        const algumHab = Object.values(sit).some((v) => v === true || v === 1 || v === '1' || v === 'true');
        if (!algumHab) {
          menuPermitido = false;
          console.log('🪪📱 ⛔ Menu de ajuda BLOQUEADO — todas as situações desabilitadas');
        }
      }
    } catch (e) {
      console.log(`🪪📱 ⚠️ Erro ao verificar menuAjudaSituacoes: ${e.message}`);
    }

    let menuMensagem;
    if (menuPermitido) {
      menuMensagem = `👋 Olá, *${pacienteNome || 'Paciente'}*!

Sua carteirinha digital foi enviada! 🪪✅

*Como posso ajudar?*

1️⃣ Minhas consultas
2️⃣ Horário de funcionamento
3️⃣ 📍 Endereço / Como chegar
4️⃣ 💰 Emissão da 2ª via de boleto
5️⃣ 📷 Trocar foto de perfil
6️⃣ 📄 Enviar documento
7️⃣ ✅ Cheguei na clínica
0️⃣ Sair

_Digite o número da opção desejada._`;
    } else {
      menuMensagem = `👋 Olá, *${pacienteNome || 'Paciente'}*!\n\nSua carteirinha digital foi enviada! 🪪✅`;
    }

    // Envia mensagem
    const url = `${config.serverUrl}/api/sessions/${config.sessionName}/send-message`;
    console.log('🪪📱 URL envio:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: numero,
        message: menuMensagem
      })
    });

    console.log('🪪📱 Response status:', response.status);

    if (response.ok) {
      console.log('🪪📱 ✅ Menu de ajuda enviado!');

      // ⭐⭐⭐ ATIVA O DIÁLOGO DE AJUDA ⭐⭐⭐
      if (typeof global.ativarDialogoAjuda === 'function') {
        const resultado = global.ativarDialogoAjuda(
          clinicaId,
          telefone,
          pacienteId,
          pacienteNome
        );
        console.log('🪪📱 ✅ Diálogo de ajuda ativado:', resultado);
      } else {
        console.log('🪪📱 ⚠️ global.ativarDialogoAjuda não disponível');
      }

      console.log('🪪📱 ======================================== FIM ✅\n');
      res.json({ success: true, message: 'Menu enviado e diálogo ativado' });
    } else {
      const errorText = await response.text();
      console.error('🪪📱 ❌ Erro ao enviar menu:', errorText);
      console.log('🪪📱 ======================================== FIM ❌\n');
      res.status(500).json({ error: 'Erro ao enviar menu: ' + errorText });
    }

  } catch (err) {
    console.error('🪪📱 ❌ Erro:', err);
    console.log('🪪📱 ======================================== FIM ❌\n');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/carteirinha/:fileName - Retorna a imagem da carteirinha
router.get('/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(CARTEIRINHAS_DIR, fileName);

  console.log('🪪 GET /api/carteirinha/' + fileName);

  if (!fs.existsSync(filePath)) {
    console.log('🪪 ❌ Arquivo não encontrado:', filePath);
    return res.status(404).json({ error: 'Carteirinha não encontrada' });
  }

  console.log('🪪 ✅ Enviando arquivo:', filePath);
  res.sendFile(filePath);
});

module.exports = router;