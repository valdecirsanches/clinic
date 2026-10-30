// ==================== ROTAS DE CLÍNICAS ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getDbPathForClinica } = require('../databaseClinica');
const fs = require('fs');
const path = require('path');

// Garante que as colunas extras existam (chamado na inicialização)
const ensureColumns = async () => {
  const extras = [
  { name: 'cep', type: 'VARCHAR(10)' },
  { name: 'logradouro', type: 'VARCHAR(255)' },
  { name: 'numero', type: 'VARCHAR(20)' },
  { name: 'complemento', type: 'VARCHAR(255)' },
  { name: 'bairro', type: 'VARCHAR(255)' },
  { name: 'cidade', type: 'VARCHAR(255)' },
  { name: 'uf', type: 'VARCHAR(2)' },
  { name: 'plano', type: 'VARCHAR(50)' },
  { name: 'logoUrl', type: 'TEXT' },
  { name: 'latitude', type: 'DOUBLE' },
  { name: 'longitude', type: 'DOUBLE' }];

  try {
    const existing = await dbGlobal.pragma('table_info(clinicas)');
    const existingNames = existing.map((c) => c.name);
    for (const col of extras) {
      if (!existingNames.includes(col.name)) {
        try {
          await dbGlobal.prepare(`ALTER TABLE clinicas ADD COLUMN ${col.name} ${col.type}`).run();
          console.log(`✅ Migração: Coluna ${col.name} adicionada à tabela clinicas`);
        } catch (e) {/* já existe */}
      }
    }
  } catch (err) {
    console.warn('⚠️ ensureColumns clinicas:', err.message);
  }
};

// ⭐ NÃO executa no require() — o pool MySQL ainda não existe neste momento.
// As colunas já são criadas em databaseGlobal.initGlobalDatabase() e utils/migrations.js
// ensureColumns() pode ser chamado manualmente se necessário após o init.

// GET /api/clinicas
router.get('/', async (req, res) => {
  try {
    const { operadoraId } = req.query;
    let rows;
    if (operadoraId) {
      rows = await dbGlobal.prepare('SELECT * FROM clinicas WHERE operadoraId = ?').all(operadoraId);
    } else {
      rows = await dbGlobal.prepare('SELECT * FROM clinicas').all();
    }
    const clinicas = rows.map((row) => ({
      ...row,
      ativa: Boolean(row.ativa),
      plano: row.plano || 'gratuito'
    }));
    console.log(`✅ Retornando ${clinicas.length} clínicas`);
    res.json(clinicas);
  } catch (err) {
    console.error('❌ Erro ao buscar clínicas:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clinicas/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await dbGlobal.prepare('SELECT * FROM clinicas WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Clínica não encontrada' });
    res.json({ ...row, ativa: Boolean(row.ativa), plano: row.plano || 'gratuito' });
  } catch (err) {
    console.error('❌ Erro ao buscar clínica:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clinicas
router.post('/', async (req, res) => {
  try {
    const { operadoraId, nome, cnpj, telefone, email, endereco, ativa, plano,
      cep, logradouro, numero, complemento, bairro, cidade, uf, logoUrl } = req.body;
    const id = `c${Date.now()}`;
    const criadoEm = new Date().toISOString().split('T')[0];

    await dbGlobal.prepare(`
      INSERT INTO clinicas (id, operadoraId, nome, cnpj, telefone, email, endereco, ativa, criadoEm,
        cep, logradouro, numero, complemento, bairro, cidade, uf, plano, logoUrl)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, operadoraId, nome, cnpj, telefone, email, endereco, ativa ? 1 : 0, criadoEm,
    cep || null, logradouro || null, numero || null, complemento || null,
    bairro || null, cidade || null, uf || null, plano || 'gratuito', logoUrl || null);

    console.log(`✅ Clínica criada: ${id}`);
    res.json({ id, operadoraId, nome, cnpj, telefone, email, endereco, ativa, criadoEm,
      cep, logradouro, numero, complemento, bairro, cidade, uf, plano: plano || 'gratuito', logoUrl });
  } catch (err) {
    console.error('❌ Erro ao criar clínica:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clinicas/:id/plano — troca APENAS o plano da clínica.
// ⚠️ Esta rota é a que a tela de Planos chama. Antes ela não existia: o PUT caía
// fora de `/:id` (segmento extra) e voltava 404, então o plano NUNCA era salvo
// — era essa a causa de "não aceita o plano ao selecionar".
router.put('/:id/plano', async (req, res) => {
  try {
    const { id } = req.params;
    const { plano } = req.body;
    if (!plano) return res.status(400).json({ error: 'plano é obrigatório' });

    const clinica = await dbGlobal.
    prepare('SELECT id FROM clinicas WHERE id = ?').
    get(id);
    if (!clinica) return res.status(404).json({ error: 'Clínica não encontrada' });

    // Confirma que o plano existe e está ativo (evita gravar id inválido)
    const planoDb = await dbGlobal.
    prepare('SELECT id, nome, preco FROM planos WHERE id = ?').
    get(plano);
    if (!planoDb && plano !== 'gratuito') {
      return res.status(400).json({ error: 'Plano inexistente' });
    }

    await dbGlobal.prepare('UPDATE clinicas SET plano = ? WHERE id = ?').run(plano, id);
    console.log(`✅ Plano da clínica ${id} atualizado para: ${plano}`);
    res.json({
      success: true,
      plano,
      planoNome: planoDb ? planoDb.nome : 'Gratuito',
      valorMensal: planoDb ? Number(planoDb.preco) || 0 : 0
    });
  } catch (err) {
    console.error('❌ Erro ao atualizar plano da clínica:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clinicas/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, cnpj, telefone, email, endereco, ativa, plano,
      cep, logradouro, numero, complemento, bairro, cidade, uf, logoUrl } = req.body;

    // Atualização apenas do plano
    if (plano !== undefined && Object.keys(req.body).length === 1) {
      await dbGlobal.prepare('UPDATE clinicas SET plano = ? WHERE id = ?').run(plano, id);
      console.log(`✅ Plano da clínica ${id} atualizado para: ${plano}`);
      return res.json({ success: true });
    }

    // Atualização apenas do logotipo (tela do WhatsApp Oficial). Precisa de
    // caminho próprio: o UPDATE completo abaixo sobrescreveria nome, CNPJ e
    // endereço com nulo, já que esses campos não vêm no corpo.
    if (logoUrl !== undefined && Object.keys(req.body).length === 1) {
      await dbGlobal.prepare('UPDATE clinicas SET logoUrl = ? WHERE id = ?').run(logoUrl || null, id);
      console.log(`✅ Logotipo da clínica ${id} ${logoUrl ? 'atualizado' : 'removido'}`);
      return res.json({ success: true });
    }

    // ⭐ `plano` entra no UPDATE (antes ficava fora do SET e era descartado).
    //    COALESCE preserva o plano atual quando o formulário não envia o campo.
    //    Idem para o logotipo: sem COALESCE, qualquer edição de cadastro que
    //    não reenviasse a imagem apagava o logo da clínica.
    await dbGlobal.prepare(`
      UPDATE clinicas SET
        nome = ?, cnpj = ?, telefone = ?, email = ?, endereco = ?, ativa = ?,
        cep = ?, logradouro = ?, numero = ?, complemento = ?, bairro = ?, cidade = ?, uf = ?,
        logoUrl = COALESCE(?, logoUrl),
        plano = COALESCE(?, plano)
      WHERE id = ?
    `).run(nome, cnpj, telefone, email, endereco, ativa ? 1 : 0,
    cep || null, logradouro || null, numero || null, complemento || null,
    bairro || null, cidade || null, uf || null,
    logoUrl === undefined ? null : logoUrl,
    plano || null, id);

    console.log(`✅ Clínica atualizada: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar clínica:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clinicas/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ DELETE /api/clinicas/${id} - Iniciando exclusão em cascata...`);

  try {
    // 1. Desvincula usuários da clínica
    const upd = await dbGlobal.prepare('UPDATE usuarios SET clinicaId = NULL WHERE clinicaId = ?').run(id);
    console.log(`✅ ${upd.changes} usuários desvinculados da clínica`);

    // 2. Deleta a clínica
    await dbGlobal.prepare('DELETE FROM clinicas WHERE id = ?').run(id);
    console.log(`✅ Clínica ${id} deletada do banco global`);

    // Nota: O banco MySQL da clínica (database) pode ser dropado manualmente se necessário
    // DROP DATABASE easyclin_c{id}

    res.json({ success: true, message: 'Clínica e todos os dados vinculados foram excluídos' });
  } catch (err) {
    console.error('❌ Erro na exclusão em cascata:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;