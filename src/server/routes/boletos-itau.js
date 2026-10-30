/**
 * Rotas para Boletos Registrados via API Itaú
 */

const express = require('express');
const router = express.Router();
const { registrarBoleto, consultarSituacao } = require('../services/itauBoleto');
const { getClinicaDB } = require('../databaseClinica');
const { getDb } = require('../databaseGlobal');

/**
 * POST /api/boletos-itau/registrar
 * Registra um boleto na API do Itaú
 */
router.post('/registrar', async (req, res) => {
  try {
    const {
      bancoConfigId,
      nossoNumero,
      valor,
      dataVencimento,
      dataEmissao,
      sacadoNome,
      sacadoCpf,
      sacadoEndereco,
      sacadoBairro,
      sacadoCidade,
      sacadoUf,
      sacadoCep
    } = req.body;

    // Validações
    if (!bancoConfigId) {
      return res.status(400).json({ error: 'bancoConfigId é obrigatório' });
    }

    if (!nossoNumero) {
      return res.status(400).json({ error: 'nossoNumero é obrigatório' });
    }

    if (!valor || valor <= 0) {
      return res.status(400).json({ error: 'valor deve ser maior que zero' });
    }

    if (!dataVencimento) {
      return res.status(400).json({ error: 'dataVencimento é obrigatório' });
    }

    if (!sacadoNome) {
      return res.status(400).json({ error: 'sacadoNome é obrigatório' });
    }

    const dadosBoleto = {
      nossoNumero,
      valor: parseFloat(valor),
      dataVencimento,
      dataEmissao: dataEmissao || new Date().toISOString().split('T')[0],
      sacadoNome,
      sacadoCpf: sacadoCpf || '',
      sacadoEndereco: sacadoEndereco || '',
      sacadoBairro: sacadoBairro || '',
      sacadoCidade: sacadoCidade || '',
      sacadoUf: sacadoUf || 'SP',
      sacadoCep: sacadoCep || ''
    };

    console.log('📋 [API] Registrando boleto Itaú:', {
      nossoNumero,
      valor,
      vencimento: dataVencimento
    });

    const resultado = await registrarBoleto(bancoConfigId, dadosBoleto);

    res.json(resultado);

  } catch (error) {
    console.error('❌ [API] Erro ao registrar boleto:', error);
    res.status(500).json({
      error: error.message || 'Erro ao registrar boleto'
    });
  }
});

/**
 * POST /api/boletos-itau/consultar
 * Consulta situação de um boleto registrado
 */
router.post('/consultar', async (req, res) => {
  try {
    const { bancoConfigId, nossoNumero } = req.body;

    if (!bancoConfigId) {
      return res.status(400).json({ error: 'bancoConfigId é obrigatório' });
    }

    if (!nossoNumero) {
      return res.status(400).json({ error: 'nossoNumero é obrigatório' });
    }

    console.log('🔍 [API] Consultando boleto Itaú:', nossoNumero);

    const resultado = await consultarSituacao(bancoConfigId, nossoNumero);

    res.json(resultado);

  } catch (error) {
    console.error('❌ [API] Erro ao consultar boleto:', error);
    res.status(500).json({
      error: error.message || 'Erro ao consultar boleto'
    });
  }
});

/**
 * GET /api/boletos-itau/teste-conexao/:bancoConfigId
 * Testa conexão com API do Itaú (obtém token OAuth)
 */
router.get('/teste-conexao/:bancoConfigId', async (req, res) => {
  try {
    const { bancoConfigId } = req.params;

    if (!bancoConfigId) {
      return res.status(400).json({ error: 'bancoConfigId é obrigatório' });
    }

    const { obterTokenItau } = require('../services/itauBoleto');

    console.log('🔌 [API] Testando conexão com Itaú...');

    // Força renovação do token para testar credenciais
    const token = await obterTokenItau(bancoConfigId, true);

    res.json({
      sucesso: true,
      mensagem: 'Conexão com API do Itaú estabelecida com sucesso!',
      tokenObtido: !!token
    });

  } catch (error) {
    console.error('❌ [API] Erro ao testar conexão:', error);
    res.status(500).json({
      sucesso: false,
      error: error.message || 'Erro ao conectar com API do Itaú'
    });
  }
});

/**
 * POST /api/boletos-itau/webhook
 * Webhook do Itaú - recebe notificações de pagamento de boletos
 * 
 * O Itaú envia um POST quando o status de um boleto muda (ex: pago, liquidado).
 * Este endpoint encontra a parcela correspondente e atualiza o status automaticamente.
 * 
 * Documentação: API Boletos (v3) - Webhook da Cobrança
 */
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    console.log('🔔 [Webhook Itaú] Notificação recebida:', JSON.stringify(payload).substring(0, 500));

    // O Itaú pode enviar diferentes formatos dependendo da versão da API
    // Extraímos os campos relevantes de forma flexível
    const nossoNumero = payload.nosso_numero || payload.nossoNumero ||
    payload.dados?.nosso_numero || payload.dados?.nossoNumero ||
    payload.titulo?.nosso_numero || '';
    const situacao = (payload.situacao || payload.status ||
    payload.dados?.situacao || payload.titulo?.situacao || '').toUpperCase();
    const dataPagamento = payload.data_pagamento || payload.dataPagamento ||
    payload.dados?.data_pagamento ||
    new Date().toISOString().split('T')[0];
    const valorPago = payload.valor_pago || payload.valorPago ||
    payload.dados?.valor_pago || 0;
    const codigoBarras = payload.codigo_barras || payload.codigoBarras ||
    payload.dados?.codigo_barras || '';

    if (!nossoNumero) {
      console.warn('⚠️ [Webhook Itaú] Notificação sem nosso_numero, ignorando');
      return res.status(200).json({
        recebido: true,
        processado: false,
        motivo: 'nosso_numero ausente'
      });
    }

    console.log('📋 [Webhook Itaú] Dados extraídos:', {
      nossoNumero,
      situacao,
      dataPagamento,
      valorPago,
      codigoBarras: codigoBarras ? '***' : 'N/A'
    });

    // Verifica se é uma notificação de pagamento
    const situacoesPagamento = ['PAGO', 'LIQUIDADO', 'BAIXADO', 'QUITADO', 'CONFIRMADO'];
    const isPagamento = situacoesPagamento.some((s) => situacao.includes(s));

    if (!isPagamento) {
      console.log(`ℹ️ [Webhook Itaú] Situação "${situacao}" não é pagamento, registrando sem alterar parcela`);
      // Loga o evento mesmo sem ser pagamento
      await logWebhookEvent(nossoNumero, situacao, payload);
      return res.status(200).json({
        recebido: true,
        processado: true,
        situacao,
        acao: 'registrado_sem_alteracao'
      });
    }

    // Busca a parcela pelo nossoNumero em todas as clínicas
    const resultado = await buscarEAtualizarParcela(nossoNumero, dataPagamento, valorPago);

    if (resultado.encontrada) {
      console.log(`✅ [Webhook Itaú] Parcela ${resultado.parcelaId} atualizada para PAGO (clínica: ${resultado.clinicaId})`);
      await logWebhookEvent(nossoNumero, 'PAGO', payload, resultado.clinicaId, resultado.parcelaId);
      return res.status(200).json({
        recebido: true,
        processado: true,
        parcelaId: resultado.parcelaId,
        clinicaId: resultado.clinicaId,
        status: 'pago'
      });
    } else {
      console.warn(`⚠️ [Webhook Itaú] Parcela com nossoNumero ${nossoNumero} não encontrada`);
      await logWebhookEvent(nossoNumero, situacao, payload, null, null, 'parcela_nao_encontrada');
      return res.status(200).json({
        recebido: true,
        processado: false,
        motivo: 'parcela_nao_encontrada'
      });
    }

  } catch (error) {
    console.error('❌ [Webhook Itaú] Erro ao processar:', error);
    // Sempre retorna 200 para o Itaú não reenviar indefinidamente
    return res.status(200).json({
      recebido: true,
      processado: false,
      erro: error.message
    });
  }
});

/**
 * Busca parcela pelo nossoNumero em todas as clínicas e atualiza para pago
 */
async function buscarEAtualizarParcela(nossoNumero, dataPagamento, valorPago) {
  const dbGlobal = getDb();

  // Busca todas as clínicas ativas
  const clinicas = await new Promise((resolve, reject) => {
    dbGlobal.all(
      'SELECT id FROM clinicas WHERE ativo = 1 OR ativo IS NULL',
      (err, rows) => {
        if (err) reject(err);else resolve(rows || []);
      }
    );
  });

  // Percorre cada clínica buscando a parcela
  for (const clinica of clinicas) {
    try {
      const dbClinica = getClinicaDB(clinica.id);

      const parcela = await new Promise((resolve, reject) => {
        dbClinica.get(
          'SELECT id, pacienteId, numeroParcela, valorParcela, status FROM parcelas WHERE nossoNumero = ? AND status != ?',
          [nossoNumero, 'pago'],
          (err, row) => {
            if (err) reject(err);else resolve(row);
          }
        );
      });

      if (parcela) {
        // Atualiza a parcela para pago
        await new Promise((resolve, reject) => {
          dbClinica.run(
            'UPDATE parcelas SET status = ?, dataPagamento = ?, formaPagamento = COALESCE(formaPagamento, ?) WHERE id = ?',
            ['pago', dataPagamento, 'boleto', parcela.id],
            (err) => {
              if (err) reject(err);else resolve();
            }
          );
        });

        return {
          encontrada: true,
          parcelaId: parcela.id,
          clinicaId: clinica.id,
          pacienteId: parcela.pacienteId,
          numeroParcela: parcela.numeroParcela
        };
      }
    } catch (err) {
      console.warn(`⚠️ [Webhook Itaú] Erro ao buscar na clínica ${clinica.id}:`, err.message);
      continue;
    }
  }

  return { encontrada: false };
}

/**
 * Registra evento do webhook para auditoria
 */
async function logWebhookEvent(nossoNumero, situacao, payload, clinicaId, parcelaId, erro) {
  try {
    const dbGlobal = getDb();

    // Cria tabela de log se não existir
    await new Promise((resolve, reject) => {
      dbGlobal.run(`
        CREATE TABLE IF NOT EXISTS webhook_itau_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nossoNumero VARCHAR(50),
          situacao VARCHAR(50),
          clinicaId VARCHAR(191),
          parcelaId VARCHAR(191),
          erro VARCHAR(255),
          payload TEXT,
          criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      dbGlobal.run(
        'INSERT INTO webhook_itau_log (nossoNumero, situacao, clinicaId, parcelaId, erro, payload) VALUES (?, ?, ?, ?, ?, ?)',
        [nossoNumero, situacao, clinicaId || null, parcelaId || null, erro || null, JSON.stringify(payload).substring(0, 2000)],
        (err) => {
          if (err) reject(err);else resolve();
        }
      );
    });
  } catch (err) {
    console.error('⚠️ [Webhook Itaú] Erro ao registrar log:', err.message);
  }
}

module.exports = router;