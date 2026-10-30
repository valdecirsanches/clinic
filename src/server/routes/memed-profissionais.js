// ==================== ROTAS DE MEMED PROFISSIONAIS ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');

// ⭐ Carrega node-fetch (CommonJS) para as rotas proxy
let nodeFetch;
try {
  nodeFetch = require('node-fetch');
  console.log('✅ [Memed Proxy] node-fetch carregado');
} catch (e) {
  if (typeof globalThis.fetch === 'function') {
    nodeFetch = globalThis.fetch;
    console.log('⚠️ [Memed Proxy] Usando fetch nativo do Node.js');
  } else {
    console.error('❌ [Memed Proxy] fetch não disponível - Execute: cd server && npm install node-fetch@2');
    nodeFetch = async () => {throw new Error('fetch não disponível no servidor');};
  }
}

// ⭐ Tabela memed_profissionais já é criada em databaseGlobal.initGlobalDatabase()
// Não precisa criar aqui (o pool MySQL ainda não existe no momento do require)

// GET /api/memed-profissionais
router.get('/', async (req, res) => {
  try {
    const { usuarioId } = req.query;
    if (usuarioId) {
      const row = await dbGlobal.prepare('SELECT * FROM memed_profissionais WHERE usuarioId = ?').get(usuarioId);
      if (!row) return res.status(404).json({ error: 'Profissional não encontrado' });
      return res.json(row);
    }
    const rows = await dbGlobal.prepare('SELECT * FROM memed_profissionais').all();
    res.json(rows || []);
  } catch (err) {
    console.error('❌ Erro ao listar profissionais Memed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/memed-profissionais/usuario/:usuarioId
router.get('/usuario/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const row = await dbGlobal.prepare('SELECT * FROM memed_profissionais WHERE usuarioId = ?').get(usuarioId);
    if (!row) return res.status(404).json({ error: 'Profissional não encontrado' });
    res.json(row);
  } catch (err) {
    console.error('❌ Erro ao buscar profissional Memed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memed-profissionais
router.post('/', async (req, res) => {
  try {
    const { usuarioId, external_id, nome, sobrenome, cpf, email, telefone,
      board_code, board_number, board_state, token, status } = req.body;
    if (!usuarioId) return res.status(400).json({ error: 'usuarioId é obrigatório' });
    const agora = new Date().toISOString();

    const upd = await dbGlobal.prepare(`
      UPDATE memed_profissionais SET
        external_id=?,nome=?,sobrenome=?,cpf=?,email=?,telefone=?,
        board_code=?,board_number=?,board_state=?,token=?,status=?,atualizadoEm=?
      WHERE usuarioId=?
    `).run(external_id, nome, sobrenome, cpf, email, telefone, board_code, board_number, board_state, token, status || 'Ativo', agora, usuarioId);

    if (upd.changes === 0) {
      const id = `memed_${Date.now()}`;
      await dbGlobal.prepare(`
        INSERT INTO memed_profissionais
          (id,usuarioId,external_id,nome,sobrenome,cpf,email,telefone,board_code,board_number,board_state,token,status,criadoEm,atualizadoEm)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(id, usuarioId, external_id, nome, sobrenome, cpf, email, telefone, board_code, board_number, board_state, token, status || 'Ativo', agora, agora);
      console.log(`✅ Profissional Memed criado: ${nome} (${usuarioId})`);
      res.json({ id, usuarioId, external_id, nome, sobrenome, cpf, email, telefone, board_code, board_number, board_state, token, status: status || 'Ativo', criadoEm: agora, atualizadoEm: agora });
    } else {
      console.log(`✅ Profissional Memed atualizado: ${nome} (${usuarioId})`);
      res.json({ usuarioId, external_id, nome, sobrenome, cpf, email, telefone, board_code, board_number, board_state, token, status: status || 'Ativo', atualizadoEm: agora });
    }
  } catch (err) {
    console.error('❌ Erro ao salvar profissional Memed:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memed-profissionais/:usuarioId
router.delete('/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    await dbGlobal.prepare('DELETE FROM memed_profissionais WHERE usuarioId = ?').run(usuarioId);
    console.log(`✅ Profissional Memed deletado: ${usuarioId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao deletar profissional Memed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ⭐ PROXY ROUTES — Evita CORS ao chamar API Memed pelo backend
// ============================================================

// Helper: busca config Memed do banco
async function getMemedConfig() {
  try {
    const row = await dbGlobal.prepare(
      "SELECT valor FROM configuracoes_globais WHERE chave = 'memed_config'"
    ).get();
    if (row && row.valor) {
      const config = typeof row.valor === 'string' ? JSON.parse(row.valor) : row.valor;
      return config;
    }
  } catch (err) {
    console.error('❌ [Memed Proxy] Erro ao buscar config:', err);
  }
  return null;
}

// POST /api/memed-profissionais/proxy/cadastrar — Cadastra profissional na Memed
router.post('/proxy/cadastrar', async (req, res) => {
  try {
    const config = await getMemedConfig();
    if (!config || !config.apiKey || !config.secretKey) {
      return res.status(400).json({ error: 'Memed não configurado. Configure em Configurações Globais.' });
    }
    const url = `https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios?api-key=${config.apiKey}&secret-key=${config.secretKey}`;

    // ⭐ DEBUG: Log detalhado do payload enviado
    const bodyToSend = JSON.stringify(req.body);
    console.log('📤 [Memed Proxy] Cadastrando profissional...');
    console.log('📤 [Memed Proxy] Payload:', bodyToSend);

    // ⭐ FIX: Content-Type deve ser application/json (como no código Python que funciona)
    // O Python usa json= no requests.post que envia Content-Type: application/json
    const response = await nodeFetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/json'
      },
      body: bodyToSend
    });

    const text = await response.text();
    console.log('📥 [Memed Proxy] Status:', response.status);
    console.log('📥 [Memed Proxy] Response:', text);

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (err) {
    console.error('❌ [Memed Proxy] Erro ao cadastrar:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/memed-profissionais/proxy/token/:identifier — Busca token do profissional
router.get('/proxy/token/:identifier', async (req, res) => {
  try {
    const config = await getMemedConfig();
    if (!config || !config.apiKey || !config.secretKey) {
      return res.status(400).json({ error: 'Memed não configurado.' });
    }
    const { identifier } = req.params;
    const url = `https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios/${identifier}?api-key=${config.apiKey}&secret-key=${config.secretKey}`;
    console.log('🔍 [Memed Proxy] Buscando token para:', identifier);

    const response = await nodeFetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/vnd.api+json' }
    });

    const text = await response.text();
    console.log('📥 [Memed Proxy] Status:', response.status);

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (err) {
    console.error('❌ [Memed Proxy] Erro ao buscar token:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memed-profissionais/proxy/excluir/:identifier — Exclui profissional da Memed
router.delete('/proxy/excluir/:identifier', async (req, res) => {
  try {
    const config = await getMemedConfig();
    if (!config || !config.apiKey || !config.secretKey) {
      return res.status(400).json({ error: 'Memed não configurado.' });
    }
    const { identifier } = req.params;
    const url = `https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios/${identifier}?api-key=${config.apiKey}&secret-key=${config.secretKey}`;
    console.log('🗑️ [Memed Proxy] Excluindo profissional:', identifier);

    const response = await nodeFetch(url, {
      method: 'DELETE',
      headers: { 'Accept': 'application/vnd.api+json' }
    });

    const text = await response.text();
    console.log('📥 [Memed Proxy] Status:', response.status);

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (err) {
    console.error('❌ [Memed Proxy] Erro ao excluir:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/memed-profissionais/proxy/cidades — Busca cidades na Memed (necessário para cadastro)
router.get('/proxy/cidades', async (req, res) => {
  try {
    const config = await getMemedConfig();
    if (!config || !config.apiKey || !config.secretKey) {
      return res.status(400).json({ error: 'Memed não configurado.' });
    }
    const { uf, q } = req.query;
    const url = `https://integrations.api.memed.com.br/v1/cidades/?filter[uf]=${uf || ''}&filter[q]=${q || ''}`;
    console.log('🏙️ [Memed Proxy] Buscando cidade:', uf, q);

    const response = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Accept': 'application/vnd.api+json' }
    });

    const text = await response.text();
    console.log('📥 [Memed Proxy] Cidades Status:', response.status);

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (err) {
    console.error('❌ [Memed Proxy] Erro ao buscar cidades:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;