import { Parcela } from '../types';
import { gerarNumeroDocumento, gerarNossoNumero, gerarLinhaDigitavel, gerarCodigoBarras, formatarMoeda, formatarCNPJ, formatarCPF } from './boletoGenerator';
export interface DadosCarne {
  parcelas: Parcela[];
  totalParcelas: number;
  sacado: {
    nome: string;
    cpf: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
  };
  cedente: {
    nome: string;
    cnpj: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
  };
  banco?: {
    nome: string;
    codigo: string;
    agencia: string;
    conta: string;
    carteira: string;
    convenio?: string;
    codigoCedente?: string;
  };
  instrucoes?: string[];
}
function buildBoletoCompacto(parcela: Parcela, index: number, dados: DadosCarne): string {
  const vencDate = new Date(parcela.dataVencimento + 'T12:00:00');
  const dataVencFormatada = vencDate.toLocaleDateString('pt-BR');
  const dataEmissao = parcela.dataEmissao ? new Date(parcela.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  const valor = parcela.valorParcela;
  const valorFormatado = formatarMoeda(valor);
  const numDoc = gerarNumeroDocumento('CN' + parcela.numeroParcela);
  const nossoNumero = gerarNossoNumero(numDoc);
  const codigoBanco = dados.banco?.codigo || '';
  const agencia = dados.banco?.agencia?.replace(/\D/g, '') || '';
  const conta = dados.banco?.conta?.replace(/\D/g, '') || '';
  const carteira = dados.banco?.carteira || '';
  const convenio = dados.banco?.convenio || '';
  const codigoCedente = dados.banco?.codigoCedente || '';
  const linhaDigitavel = gerarLinhaDigitavel(valor, parcela.dataVencimento, codigoBanco, agencia, conta, carteira, nossoNumero, convenio, codigoCedente);
  const codigoBarras = gerarCodigoBarras(valor, parcela.dataVencimento, codigoBanco, agencia, conta, carteira, nossoNumero, convenio, codigoCedente);
  const instrucoes = dados.instrucoes || ['Nao receber apos o vencimento.', 'Juros de 1% ao mes apos o vencimento.', 'Multa de 2% apos o vencimento.'];
  const agenciaDisplay = dados.banco ? dados.banco.agencia + ' / ' + dados.banco.conta : '';
  const p: string[] = [];

  // Boleto container
  p.push('<div class="boleto">');

  // Parcela label
  p.push('<div class="parcela-label">Parcela ' + parcela.numeroParcela + '/' + dados.totalParcelas + '</div>');

  // Bank header
  p.push('<div class="bank-header">');
  p.push('<div class="bank-logo">' + (dados.banco?.nome || 'BANCO').toUpperCase().substring(0, 15) + '</div>');
  p.push('<div class="bank-code">' + (codigoBanco ? codigoBanco + '-9' : '') + '</div>');
  p.push('<div class="bank-linha">' + linhaDigitavel + '</div>');
  p.push('</div>');

  // Row 1: Local pagamento / Vencimento
  p.push('<div class="row">');
  p.push('<div class="cell flex-1"><span class="lbl">Local de Pagamento</span><span class="val">PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO</span></div>');
  p.push('<div class="cell w-right"><span class="lbl">Vencimento</span><span class="val bold big">' + dataVencFormatada + '</span></div>');
  p.push('</div>');

  // Row 2: Cedente / Agencia
  p.push('<div class="row">');
  p.push('<div class="cell flex-1"><span class="lbl">Cedente</span><span class="val">' + dados.cedente.nome + (dados.cedente.cnpj ? ' - CNPJ: ' + formatarCNPJ(dados.cedente.cnpj) : '') + '</span></div>');
  p.push('<div class="cell w-right"><span class="lbl">Agencia / Cod. Cedente</span><span class="val">' + agenciaDisplay + '</span></div>');
  p.push('</div>');

  // Row 3: Data Doc / No Doc / Especie / Aceite / Nosso Numero
  p.push('<div class="row">');
  p.push('<div class="cell" style="width:55px"><span class="lbl">Data Doc.</span><span class="val">' + dataEmissao + '</span></div>');
  p.push('<div class="cell" style="width:75px"><span class="lbl">No Documento</span><span class="val">' + numDoc + '</span></div>');
  p.push('<div class="cell" style="width:35px"><span class="lbl">Especie</span><span class="val">DM</span></div>');
  p.push('<div class="cell" style="width:30px"><span class="lbl">Aceite</span><span class="val">N</span></div>');
  p.push('<div class="cell flex-1"><span class="lbl">Carteira</span><span class="val">' + carteira + '</span></div>');
  p.push('<div class="cell w-right"><span class="lbl">Nosso Numero</span><span class="val">' + nossoNumero + '</span></div>');
  p.push('</div>');

  // Row 4: Valor
  p.push('<div class="row">');
  p.push('<div class="cell flex-1"><span class="lbl">Instrucoes</span><div class="instrucoes">' + instrucoes.map(function (i) {
    return '<div>' + i + '</div>';
  }).join('') + '</div></div>');
  p.push('<div class="cell w-right"><span class="lbl">(=) Valor do Documento</span><span class="val bold big">' + valorFormatado + '</span></div>');
  p.push('</div>');

  // Row 5: Sacado
  p.push('<div class="row">');
  p.push('<div class="cell flex-1"><span class="lbl">Sacado</span><span class="val">' + dados.sacado.nome + (dados.sacado.cpf ? ' - CPF: ' + formatarCPF(dados.sacado.cpf) : '') + '</span>');
  if (dados.sacado.endereco) {
    p.push('<div class="val" style="margin-top:1px">' + dados.sacado.endereco + (dados.sacado.cidade ? ' - ' + dados.sacado.cidade + '/' + dados.sacado.uf : '') + '</div>');
  }
  p.push('</div>');
  p.push('</div>');

  // Barcode
  p.push('<div class="barcode-area">');
  p.push('<div class="barcode"></div>');
  p.push('<div class="barcode-num">' + codigoBarras + '</div>');
  p.push('</div>');
  p.push('</div>'); // end boleto
  return p.join('\n');
}
function buildCss(): string {
  const at = String.fromCharCode(64);
  return [at + 'page { size: A4 portrait; margin: 0; }', '* { margin: 0; padding: 0; box-sizing: border-box; }', 'body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }', '.page { width: 210mm; height: 297mm; padding: 8mm 12mm; display: flex; flex-direction: column; gap: 6mm; }', '.boleto { border: 1.5px solid #333; flex: 1; display: flex; flex-direction: column; overflow: hidden; page-break-inside: avoid; position: relative; }', '.parcela-label { position: absolute; top: 1px; right: 4px; font-size: 7px; color: #999; font-weight: bold; z-index: 1; }', '.bank-header { display: flex; border-bottom: 2px solid #000; height: 24px; }', '.bank-logo { width: 80px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10px; border-right: 2px solid #000; letter-spacing: 0.5px; }', '.bank-code { width: 50px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; border-right: 2px solid #000; }', ".bank-linha { flex: 1; display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; font-size: 8px; font-weight: bold; letter-spacing: 0.5px; font-family: 'Courier New', monospace; }", '.row { display: flex; border-bottom: 1px solid #333; }', '.cell { padding: 1px 3px; border-right: 1px solid #333; min-height: 16px; }', '.cell:last-child { border-right: none; }', '.flex-1 { flex: 1; }', '.w-right { width: 110px; }', '.lbl { display: block; font-size: 5.5px; color: #555; text-transform: uppercase; line-height: 1; margin-bottom: 0.5px; }', '.val { display: block; font-size: 8px; line-height: 1.1; }', '.val.bold { font-weight: 700; }', '.val.big { font-size: 9px; }', '.instrucoes { font-size: 6px; line-height: 1.3; margin-top: 1px; }', '.barcode-area { padding: 3px 4px; flex-shrink: 0; }', '.barcode { height: 22px; width: 65%; background: repeating-linear-gradient(90deg, #000 0px, #000 1px, #fff 1px, #fff 2px, #000 2px, #000 2.5px, #fff 2.5px, #fff 4px, #000 4px, #000 5px, #fff 5px, #fff 6px); }', ".barcode-num { font-family: 'Courier New', monospace; font-size: 7px; margin-top: 1px; letter-spacing: 1px; color: #333; }", '.corte { border: none; border-top: 1px dashed #aaa; margin: 0; }', at + 'media print { .page { page-break-after: always; } .page:last-child { page-break-after: auto; } }'].join('\n');
}
export function gerarCarneHTML(dados: DadosCarne): string {
  const css = buildCss();
  const pages: string[] = [];
  for (let i = 0; i < dados.parcelas.length; i += 3) {
    const pageParcelas = dados.parcelas.slice(i, i + 3);
    const boletosHTML = pageParcelas.map(function (p, idx) {
      return buildBoletoCompacto(p, i + idx, dados);
    }).join('\n<hr class="corte">\n');
    pages.push('<div class="page">' + boletosHTML + '</div>');
  }
  const styleOpen = '<sty' + 'le>';
  const styleClose = '</sty' + 'le>';
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Carne - ' + dados.sacado.nome + '</title>' + styleOpen + css + styleClose + '</head><body>' + pages.join('') + '</body></html>';
}