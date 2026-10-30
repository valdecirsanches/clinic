// ==================== ROTAS DE CONFIGURAÇÕES BANCÁRIAS ====================
// CRUD para configurações de bancos para emissão de boletos registrados

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/configuracoes-banco?clinicaId=xxx - Lista todas as configurações bancárias
router.get('/', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.all('SELECT * FROM configuracoes_banco ORDER BY ativo DESC, bancoNome ASC', [], (err, rows) => {
      if (err) {
        console.error('❌ [configuracoes-banco] Erro ao listar:', err.message);
        return res.status(500).json({ error: err.message });
      }
      // ⭐ FIX: Normaliza campos numéricos (segurança contra tipos inconsistentes do mysql2 query())
      const normalized = (rows || []).map((row) => ({
        ...row,
        ativo: Number(row.ativo) || 0,
        boletoRegistrado: Number(row.boletoRegistrado) || 0,
        tipoAmbiente: Number(row.tipoAmbiente) || 2,
        tipoJuros: Number(row.tipoJuros) || 5,
        tipoMulta: Number(row.tipoMulta) || 3,
        multa: Number(row.multa) || 0,
        juros: Number(row.juros) || 0,
        diasProtesto: Number(row.diasProtesto) || 0
      }));
      res.json(normalized);
    });
  } catch (err) {
    console.error('❌ [configuracoes-banco] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/configuracoes-banco/:id?clinicaId=xxx - Busca uma configuração por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.get('SELECT * FROM configuracoes_banco WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('❌ [configuracoes-banco] Erro ao buscar:', err.message);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Configuração bancária não encontrada' });
      }
      // ⭐ FIX: Normaliza campos numéricos (segurança contra tipos inconsistentes do mysql2 query())
      res.json({
        ...row,
        ativo: Number(row.ativo) || 0,
        boletoRegistrado: Number(row.boletoRegistrado) || 0,
        tipoAmbiente: Number(row.tipoAmbiente) || 2,
        tipoJuros: Number(row.tipoJuros) || 5,
        tipoMulta: Number(row.tipoMulta) || 3,
        multa: Number(row.multa) || 0,
        juros: Number(row.juros) || 0,
        diasProtesto: Number(row.diasProtesto) || 0
      });
    });
  } catch (err) {
    console.error('❌ [configuracoes-banco] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/configuracoes-banco - Cria nova configuração bancária
router.post('/', async (req, res) => {
  const {
    clinicaId, banco, bancoNome, agencia, agenciaDigito,
    conta, contaDigito, carteira, convenio, codigoCedente,
    nomeCedente, cnpjCedente, enderecoCedente, cidadeCedente,
    ufCedente, cepCedente, multa, juros, diasProtesto,
    instrucao1, instrucao2, instrucao3,
    clientId, clientSecret, itauKey, tipoAmbiente,
    tipoJuros, tipoMulta, boletoRegistrado
  } = req.body;

  console.log('📝 POST /api/configuracoes-banco - clinicaId:', clinicaId, 'banco:', banco);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }
  if (!banco) {
    return res.status(400).json({ error: 'Código do banco é obrigatório' });
  }
  if (!agencia) {
    return res.status(400).json({ error: 'Agência é obrigatória' });
  }
  if (!conta) {
    return res.status(400).json({ error: 'Conta é obrigatória' });
  }
  if (!contaDigito) {
    return res.status(400).json({ error: 'Dígito da conta é obrigatório' });
  }
  if (!carteira) {
    return res.status(400).json({ error: 'Carteira é obrigatória' });
  }
  if (!nomeCedente) {
    return res.status(400).json({ error: 'Nome do cedente é obrigatório' });
  }
  if (!cnpjCedente) {
    return res.status(400).json({ error: 'CNPJ do cedente é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    const id = `banco_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const agora = new Date().toISOString();

    db.run(
      `INSERT INTO configuracoes_banco (
        id, banco, bancoNome, agencia, agenciaDigito,
        conta, contaDigito, carteira, convenio, codigoCedente,
        nomeCedente, cnpjCedente, enderecoCedente, cidadeCedente,
        ufCedente, cepCedente, multa, juros, diasProtesto,
        instrucao1, instrucao2, instrucao3,
        clientId, clientSecret, itauKey, tipoAmbiente,
        tipoJuros, tipoMulta, boletoRegistrado,
        ativo, criadoEm, atualizadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
      id, banco, bancoNome || null, agencia, agenciaDigito || null,
      conta, contaDigito, carteira, convenio || null, codigoCedente || null,
      nomeCedente, cnpjCedente, enderecoCedente || null, cidadeCedente || null,
      ufCedente || null, cepCedente || null, multa || 2.0, juros || 1.0, diasProtesto || 0,
      instrucao1 || null, instrucao2 || null, instrucao3 || null,
      clientId || null, clientSecret || null, itauKey || null, tipoAmbiente || 2,
      tipoJuros || 5, tipoMulta || 3, boletoRegistrado ? 1 : 0,
      1, agora, agora],

      function (err) {
        if (err) {
          console.error('❌ [configuracoes-banco] Erro ao criar:', err.message);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ [configuracoes-banco] Configuração criada: ${id} (banco: ${banco})`);
        res.json({
          id, banco, bancoNome, agencia, agenciaDigito,
          conta, contaDigito, carteira, convenio, codigoCedente,
          nomeCedente, cnpjCedente, enderecoCedente, cidadeCedente,
          ufCedente, cepCedente, multa: multa || 2.0, juros: juros || 1.0,
          diasProtesto: diasProtesto || 0,
          instrucao1, instrucao2, instrucao3,
          clientId, clientSecret, itauKey, tipoAmbiente: tipoAmbiente || 2,
          tipoJuros: tipoJuros || 5, tipoMulta: tipoMulta || 3,
          boletoRegistrado: boletoRegistrado ? 1 : 0,
          ativo: 1, criadoEm: agora, atualizadoEm: agora
        });
      }
    );
  } catch (err) {
    console.error('❌ [configuracoes-banco] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/configuracoes-banco/:id - Atualiza configuração bancária
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    clinicaId, banco, bancoNome, agencia, agenciaDigito,
    conta, contaDigito, carteira, convenio, codigoCedente,
    nomeCedente, cnpjCedente, enderecoCedente, cidadeCedente,
    ufCedente, cepCedente, multa, juros, diasProtesto,
    instrucao1, instrucao2, instrucao3, ativo,
    clientId, clientSecret, itauKey, tipoAmbiente,
    tipoJuros, tipoMulta, boletoRegistrado
  } = req.body;

  console.log('📝 PUT /api/configuracoes-banco/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    const agora = new Date().toISOString();

    db.run(
      `UPDATE configuracoes_banco SET
        banco = ?, bancoNome = ?, agencia = ?, agenciaDigito = ?,
        conta = ?, contaDigito = ?, carteira = ?, convenio = ?, codigoCedente = ?,
        nomeCedente = ?, cnpjCedente = ?, enderecoCedente = ?, cidadeCedente = ?,
        ufCedente = ?, cepCedente = ?, multa = ?, juros = ?, diasProtesto = ?,
        instrucao1 = ?, instrucao2 = ?, instrucao3 = ?,
        clientId = ?, clientSecret = ?, itauKey = ?, tipoAmbiente = ?,
        tipoJuros = ?, tipoMulta = ?, boletoRegistrado = ?,
        ativo = ?, atualizadoEm = ?
      WHERE id = ?`,
      [
      banco, bancoNome || null, agencia, agenciaDigito || null,
      conta, contaDigito, carteira, convenio || null, codigoCedente || null,
      nomeCedente, cnpjCedente, enderecoCedente || null, cidadeCedente || null,
      ufCedente || null, cepCedente || null, multa || 2.0, juros || 1.0, diasProtesto || 0,
      instrucao1 || null, instrucao2 || null, instrucao3 || null,
      clientId || null, clientSecret || null, itauKey || null, tipoAmbiente || 2,
      tipoJuros || 5, tipoMulta || 3, boletoRegistrado ? 1 : 0,
      ativo !== undefined ? ativo : 1, agora, id],

      function (err) {
        if (err) {
          console.error('❌ [configuracoes-banco] Erro ao atualizar:', err.message);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Configuração não encontrada' });
        }
        console.log(`✅ [configuracoes-banco] Configuração atualizada: ${id} | boletoRegistrado: ${boletoRegistrado ? 1 : 0}`);

        // ⭐ FIX: Retorna o registro completo após atualizar
        db.get('SELECT * FROM configuracoes_banco WHERE id = ?', [id], (err, row) => {
          if (err) {
            console.error('❌ [configuracoes-banco] Erro ao buscar registro atualizado:', err.message);
            return res.json({ success: true, atualizadoEm: agora });
          }
          res.json(row || { success: true, atualizadoEm: agora });
        });
      }
    );
  } catch (err) {
    console.error('❌ [configuracoes-banco] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/configuracoes-banco/:id?clinicaId=xxx - Deleta configuração bancária
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🗑️ DELETE /api/configuracoes-banco/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.run('DELETE FROM configuracoes_banco WHERE id = ?', [id], function (err) {
      if (err) {
        console.error('❌ [configuracoes-banco] Erro ao deletar:', err.message);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }
      console.log(`✅ [configuracoes-banco] Configuração deletada: ${id}`);
      res.json({ success: true });
    });
  } catch (err) {
    console.error('❌ [configuracoes-banco] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;