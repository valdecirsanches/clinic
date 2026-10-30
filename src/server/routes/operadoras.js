// ==================== ROTAS DE OPERADORAS ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getDbPathForClinica } = require('../databaseClinica');
const fs = require('fs');
const path = require('path');

// ⭐⭐⭐ FETCH para consulta de CNPJ na Receita Federal ⭐⭐⭐
let fetch;
try {
  fetch = require('node-fetch');
} catch (e) {
  if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch;
  } else {
    fetch = async () => {throw new Error('fetch não disponível');};
  }
}

// ⭐⭐⭐ NOVA ROTA: Consulta CNPJ na Receita Federal via BrasilAPI ⭐⭐⭐
router.get('/consulta-cnpj/:cnpj', async (req, res) => {
  const { cnpj } = req.params;
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  if (cnpjLimpo.length !== 14) {
    return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
  }

  console.log(`\n🔍 [consulta-cnpj] Consultando CNPJ: ${cnpjLimpo}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'CNPJ não encontrado na Receita Federal', cnpj: cnpjLimpo, encontrado: false });
      }
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Erro ao consultar Receita Federal (HTTP ${response.status})`, encontrado: false });
    }

    const data = await response.json();
    const partesEndereco = [data.logradouro, data.numero, data.complemento, data.bairro, data.municipio ? `${data.municipio}/${data.uf}` : data.uf, data.cep ? `CEP: ${data.cep}` : null].filter(Boolean);
    let telefone = '';
    if (data.ddd_telefone_1) {
      const tel = data.ddd_telefone_1.replace(/\D/g, '');
      telefone = tel.length >= 10 ? `(${tel.substring(0, 2)}) ${tel.substring(2, 6)}-${tel.substring(6)}` : data.ddd_telefone_1;
    }

    res.json({
      encontrado: true, cnpj: cnpjLimpo, razaoSocial: data.razao_social || '', nomeFantasia: data.nome_fantasia || '',
      telefone, email: (data.email || '').toLowerCase(), endereco: partesEndereco.join(', '),
      situacaoCadastral: data.situacao_cadastral, descricaoSituacao: data.descricao_situacao_cadastral || '',
      naturezaJuridica: data.natureza_juridica || '', atividadePrincipal: data.cnae_fiscal_descricao || '',
      uf: data.uf || '', municipio: data.municipio || '', dataAbertura: data.data_inicio_atividade || ''
    });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Timeout ao consultar Receita Federal', encontrado: false });
    res.status(500).json({ error: `Erro ao consultar: ${err.message}`, encontrado: false });
  }
});

// GET /api/operadoras - Lista todas operadoras
router.get('/', async (req, res) => {
  try {
    const rows = await dbGlobal.prepare('SELECT * FROM operadoras').all();
    const operadoras = rows.map((row) => ({
      ...row,
      ativa: Boolean(row.ativa),
      planoId: row.planoId || 'gratuito'
    }));
    console.log(`✅ Retornando ${operadoras.length} operadoras`);
    res.json(operadoras);
  } catch (err) {
    console.error('❌ Erro ao buscar operadoras:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operadoras - Cria nova operadora
router.post('/', async (req, res) => {
  try {
    const { nome, cnpj, razaoSocial, telefone, email, endereco, ativa, planoId, logoUrl } = req.body;
    const id = `op${Date.now()}`;
    const criadoEm = new Date().toISOString().split('T')[0];

    // Garante colunas extras
    const columns = await dbGlobal.pragma('table_info(operadoras)');
    const colNames = columns.map((c) => c.name);
    if (!colNames.includes('planoId')) {
      try {await dbGlobal.exec("ALTER TABLE operadoras ADD COLUMN planoId VARCHAR(50) DEFAULT 'gratuito'");} catch (e) {}
    }
    if (!colNames.includes('logoUrl')) {
      try {await dbGlobal.exec('ALTER TABLE operadoras ADD COLUMN logoUrl LONGTEXT');} catch (e) {}
    }

    await dbGlobal.prepare(`
      INSERT INTO operadoras (id, nome, cnpj, razaoSocial, telefone, email, endereco, ativa, planoId, logoUrl, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, nome, cnpj, razaoSocial, telefone, email, endereco, ativa ? 1 : 0, planoId || 'gratuito', logoUrl || null, criadoEm);

    console.log(`✅ Operadora criada: ${id} com plano ${planoId || 'gratuito'}`);
    res.json({ id, nome, cnpj, razaoSocial, telefone, email, endereco, ativa, planoId: planoId || 'gratuito', logoUrl: logoUrl || null, criadoEm });
  } catch (err) {
    console.error('❌ Erro ao criar operadora:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operadoras/:id - Atualiza operadora
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, cnpj, razaoSocial, telefone, email, endereco, ativa, planoId, logoUrl } = req.body;

    // Garante colunas extras
    const columns = await dbGlobal.pragma('table_info(operadoras)');
    const colNames = columns.map((c) => c.name);
    if (!colNames.includes('planoId')) {
      try {await dbGlobal.exec("ALTER TABLE operadoras ADD COLUMN planoId VARCHAR(50) DEFAULT 'gratuito'");} catch (e) {}
    }
    if (!colNames.includes('logoUrl')) {
      try {await dbGlobal.exec('ALTER TABLE operadoras ADD COLUMN logoUrl LONGTEXT');} catch (e) {}
    }

    await dbGlobal.prepare(`
      UPDATE operadoras SET nome = ?, cnpj = ?, razaoSocial = ?, telefone = ?, email = ?, endereco = ?, ativa = ?, planoId = ?, logoUrl = ? WHERE id = ?
    `).run(nome, cnpj, razaoSocial, telefone, email, endereco, ativa ? 1 : 0, planoId || 'gratuito', logoUrl !== undefined ? logoUrl : null, id);

    console.log(`✅ Operadora atualizada: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar operadora:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/operadoras/:id - Deleta operadora COM CASCATA
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ DELETE /api/operadoras/${id} - Iniciando exclusão em cascata...`);

  try {
    // 1. Busca todas as clínicas da operadora
    const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas WHERE operadoraId = ?').all(id);
    console.log(`📋 Encontradas ${clinicas.length} clínicas para deletar`);

    // 2. Deleta arquivos de banco de cada clínica
    for (const clinica of clinicas) {
      const dbPath = getDbPathForClinica(clinica.id);
      try {
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          console.log(`✅ Banco da clínica ${clinica.id} deletado: ${dbPath}`);
        }
        const oldPaths = [
        path.join(__dirname, '..', `easyclin-clinica-${clinica.id}.db`),
        path.join(__dirname, '..', 'data', `easyclin-clinica-${clinica.id}.db`)];

        for (const oldDbPath of oldPaths) {
          if (fs.existsSync(oldDbPath)) {
            fs.unlinkSync(oldDbPath);
            console.log(`✅ Banco antigo da clínica ${clinica.id} deletado: ${oldDbPath}`);
          }
        }
      } catch (fsErr) {
        console.error(`❌ Erro ao deletar banco da clínica ${clinica.id}:`, fsErr);
      }
    }

    // 3. Deleta usuários da operadora
    const delUsuarios = await dbGlobal.prepare('DELETE FROM usuarios WHERE operadoraId = ?').run(id);
    console.log(`✅ ${delUsuarios.changes} usuários deletados`);

    // 4. Deleta clínicas da operadora
    const delClinicas = await dbGlobal.prepare('DELETE FROM clinicas WHERE operadoraId = ?').run(id);
    console.log(`✅ ${delClinicas.changes} clínicas deletadas`);

    // 5. Deleta a operadora
    await dbGlobal.prepare('DELETE FROM operadoras WHERE id = ?').run(id);
    console.log(`✅ Operadora ${id} deletada`);

    res.json({
      success: true,
      message: 'Operadora e todos os dados vinculados foram excluídos',
      deletados: { clinicas: clinicas.length }
    });
  } catch (err) {
    console.error('❌ Erro na exclusão em cascata:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;