// ==================== BAIXA DA FATURA DA ASSINATURA ====================
// ÚNICO caminho que torna uma fatura "paga": confirmação do Mercado Pago ou
// baixa manual do super admin. A clínica apenas INFORMA o pagamento (status
// "em_analise"). Depois da baixa, a NFS-e é emitida automaticamente.

const dbGlobal = require('../databaseGlobal');
const calculo = require('./assinaturaCalculo');
const nfse = require('./nfseAssinatura');

const FORMAS = ['pix', 'boleto', 'cartao_credito', 'transferencia', 'dinheiro'];

/**
 * @param {string} faturaId
 * @param {{ formaPagamento: string, origem: 'mercadopago'|'manual', mpPaymentId?: string, mpStatus?: string }} dados
 */
async function confirmarPagamento(faturaId, dados) {
  await calculo.garantirTabelas();
  const fatura = await calculo.buscarFaturaBruta(faturaId);
  if (!fatura) {
    const erro = new Error('Fatura não encontrada');
    erro.status = 404;
    throw erro;
  }
  if (fatura.status === 'paga') {
    return { fatura: calculo.normalizarFatura(fatura), jaPaga: true };
  }
  const forma = FORMAS.includes(dados.formaPagamento) ? dados.formaPagamento : 'pix';

  // Condição no WHERE: dois avisos simultâneos não dão baixa duas vezes
  const resultado = await dbGlobal.
  prepare(
    `UPDATE assinatura_faturas
          SET status = 'paga', formaPagamento = ?, pagoEm = ?, origemPagamento = ?,
              mpPaymentId = COALESCE(?, mpPaymentId), mpStatus = COALESCE(?, mpStatus)
        WHERE id = ? AND status <> 'paga'`
  ).
  run(
    forma,
    new Date().toISOString(),
    dados.origem,
    dados.mpPaymentId || null,
    dados.mpStatus || null,
    faturaId
  );

  const alteradas = resultado && (resultado.changes ?? resultado.affectedRows);
  console.log(`💳 ✅ [assinatura] Fatura ${faturaId} paga (${dados.origem}, ${forma})`);

  let resultadoNfse = null;
  if (alteradas !== 0 && nfse.emitirAoPagar()) {
    resultadoNfse = await nfse.emitirNfseDaFatura(faturaId);
  }

  const atualizada = await calculo.buscarFaturaBruta(faturaId);
  return { fatura: calculo.normalizarFatura(atualizada), nfse: resultadoNfse };
}

module.exports = { confirmarPagamento, FORMAS };