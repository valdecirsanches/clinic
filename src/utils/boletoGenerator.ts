/**
 * Utilitário para geração de boletos bancários
 * Gera boletos usando dados bancários REAIS configurados pelo usuário
 * (agência, conta, carteira, cedente, convênio, instruções, multa, juros)
 *
 * Os boletos usam os dados bancários cadastrados em Configurações → Configurações Bancárias
 * O código PIX EMV é gerado no padrão oficial do Banco Central (BR.GOV.BCB.PIX)
 *
 * Linha digitável e código de barras seguem o padrão FEBRABAN
 * com campo livre calculado conforme regras de cada banco
 */

export interface DadosBoleto {
  // Dados do Cedente (quem recebe)
  cedente: {
    nome: string;
    cnpj: string;
    endereco: string;
    cidade: string;
    uf: string;
  };
  // Dados do Sacado (quem paga)
  sacado: {
    nome: string;
    cpf: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
  };
  // Dados do Boleto
  valor: number;
  dataVencimento: string;
  dataEmissao?: string;
  numeroDocumento: string;
  instrucoes?: string[];
  descricao?: string;
  // Dados Bancários reais (configurados em Configurações Bancárias)
  banco?: string;
  codigoBanco?: string;
  agencia?: string;
  conta?: string;
  carteira?: string;
  convenio?: string;
  codigoCedente?: string;
  nossoNumero?: string;
}

/**
 * Gera um número de documento único baseado na data e um ID
 */
export function gerarNumeroDocumento(prefixo: string = 'DOC'): string {
  const agora = new Date();
  const ano = agora.getFullYear().toString().slice(-2);
  const mes = (agora.getMonth() + 1).toString().padStart(2, '0');
  const dia = agora.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefixo}${ano}${mes}${dia}${random}`;
}

/**
 * Gera o Nosso Número baseado no número do documento
 * Formato padronizado com 8 dígitos
 */
export function gerarNossoNumero(numeroDocumento: string): string {
  // Extrai apenas dígitos do número do documento
  const digitos = numeroDocumento.replace(/\D/g, '');
  return digitos.padStart(8, '0').slice(-8);
}

/**
 * Calcula dígito verificador módulo 10 (usado em campos da linha digitável)
 */
function calcularDVMod10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let resultado = parseInt(numero[i]) * peso;
    if (resultado > 9) resultado = Math.floor(resultado / 10) + resultado % 10;
    soma += resultado;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/**
 * Calcula dígito verificador módulo 11 (usado no código de barras geral)
 * Pesos de 2 a 9, da direita para esquerda
 */
function calcularDVMod11Barras(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += parseInt(numero[i]) * peso;
    peso++;
    if (peso > 9) peso = 2;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  // Se DV for 0, 1, 10 ou 11, usa 1
  if (dv === 0 || dv === 1 || dv === 10 || dv === 11) return 1;
  return dv;
}

/**
 * Calcula o fator de vencimento FEBRABAN
 * Base: 07/10/1997
 */
function calcularFatorVencimento(dataVencimento: string): string {
  const dataVenc = new Date(dataVencimento + 'T12:00:00');
  const dataBase = new Date('1997-10-07T12:00:00');
  const diffMs = dataVenc.getTime() - dataBase.getTime();
  let fator = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  // ⭐ FEBRABAN: o fator chegou a 9999 em 21/02/2025 e RECOMEÇA em 1000 no dia
  // seguinte (ciclos de 9000 dias). Sem isto, todo vencimento a partir de
  // 22/02/2025 gerava fator de 5 dígitos e código de barras com 45 dígitos
  // (inválido no banco).
  if (fator > 9999) fator = ((fator - 10000) % 9000) + 1000;
  return fator.toString().padStart(4, '0');
}

/**
 * Gera o campo livre (25 dígitos) conforme regras de cada banco
 * Usa dados REAIS: agência, conta, carteira, convênio, nosso número
 */
function gerarCampoLivre(codigoBanco: string, agencia: string, conta: string, carteira: string, nossoNumero: string, convenio?: string, codigoCedente?: string): string {
  // Limpa dados
  const ag = (agencia || '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const cc = (conta || '').replace(/\D/g, '').padStart(7, '0');
  const cart = (carteira || '').replace(/\D/g, '').padStart(2, '0');
  const nn = (nossoNumero || '').replace(/\D/g, '').padStart(8, '0');
  const conv = (convenio || '').replace(/\D/g, '');
  const cedente = (codigoCedente || '').replace(/\D/g, '');
  let campoLivre = '';
  switch (codigoBanco) {
    case '341':
      // Itaú
      // Carteira(3) + NossoNumero(8) + DAC_NN(1) + Agência(4) + Conta(5) + DAC_AG_CC(1) + Zeros(3)
      const cartItau = cart.padStart(3, '0').slice(0, 3);
      const nnItau = nn.padStart(8, '0').slice(0, 8);
      const dacNN = calcularDVMod10(ag + cc.slice(0, 5) + cartItau + nnItau);
      const dacAgCc = calcularDVMod10(ag + cc.slice(0, 5));
      campoLivre = cartItau + nnItau + dacNN + ag + cc.slice(0, 5) + dacAgCc + '000';
      break;
    case '237':
      // Bradesco
      // Agência(4) + Carteira(2) + NossoNumero(11) + Conta(7) + Zero(1)
      const nnBradesco = nn.padStart(11, '0').slice(0, 11);
      campoLivre = ag + cart.slice(0, 2) + nnBradesco + cc.slice(0, 7) + '0';
      break;
    case '001':
      // Banco do Brasil
      if (conv.length >= 7) {
        // Convênio 7 dígitos: Convênio(7) + NossoNumero(10) + Carteira(2) + Zeros(6)
        const nnBB7 = nn.padStart(10, '0').slice(0, 10);
        campoLivre = conv.padStart(7, '0').slice(0, 7) + nnBB7 + cart.slice(0, 2) + '000000';
      } else if (conv.length >= 6) {
        // Convênio 6 dígitos: NossoNumero(5) + Convênio(6) + Agência(4) + Conta(8) + Carteira(2)
        const nnBB6 = nn.padStart(5, '0').slice(0, 5);
        campoLivre = nnBB6 + conv.padStart(6, '0').slice(0, 6) + ag + cc.padStart(8, '0').slice(0, 8) + cart.slice(0, 2);
      } else {
        // Convênio 4 dígitos: NossoNumero(7) + Agência(4) + Conta(8) + Carteira(2) + Zeros(4)
        const nnBB4 = nn.padStart(7, '0').slice(0, 7);
        campoLivre = nnBB4 + ag + cc.padStart(8, '0').slice(0, 8) + cart.slice(0, 2) + '0000';
      }
      break;
    case '033':
      // Santander
      // Fixo(1) + Agência(4) + Conta(7+1dv) + NossoNumero(7) + IOS(1) + Carteira(3)
      const nnSantander = nn.padStart(7, '0').slice(0, 7);
      const contaSantander = cc.padStart(8, '0').slice(0, 8);
      campoLivre = '9' + ag + contaSantander + nnSantander + '0' + cart.padStart(3, '0').slice(0, 3);
      break;
    case '104':
      // Caixa
      // CódigoCedente(6) + DV(1) + NossoNumero(3 primeiros) + Tipo(1) + NossoNumero(3 seguintes) + Tipo(1) + NossoNumero(9 restantes)
      const cedenteCaixa = (cedente || conv || '').padStart(6, '0').slice(0, 6);
      const nnCaixa = nn.padStart(17, '0').slice(0, 17);
      const dvCedente = calcularDVMod10(cedenteCaixa);
      campoLivre = cedenteCaixa + dvCedente + nnCaixa.slice(0, 3) + '1' + nnCaixa.slice(3, 6) + '4' + nnCaixa.slice(6, 15);
      break;
    case '748':
      // Sicredi
      // Tipo(1) + Carteira(1) + NossoNumero(8) + DV(1) + Agência(4) + Posto(2) + Cedente(5) + Indicador(1) + Zero(1) + Zero(1)
      const nnSicredi = nn.padStart(8, '0').slice(0, 8);
      const cedenteSicredi = (cedente || '').padStart(5, '0').slice(0, 5);
      const dvSicredi = calcularDVMod10(ag + '01' + cedenteSicredi + nnSicredi);
      campoLivre = '1' + cart.slice(0, 1) + nnSicredi + dvSicredi + ag + '01' + cedenteSicredi + '10';
      break;
    case '756':
      // Sicoob
      // Carteira(1) + Agência(4) + Modalidade(2) + CódigoCedente(7) + NossoNumero(8) + Parcela(3)
      const cedenteSicoob = (cedente || conv || '').padStart(7, '0').slice(0, 7);
      const nnSicoob = nn.padStart(8, '0').slice(0, 8);
      campoLivre = cart.slice(0, 1) + ag + '01' + cedenteSicoob + nnSicoob + '001';
      break;
    case '077':
      // Inter
      // NossoNumero(11) + Agência(4) + Conta(7) + Carteira(2) + Zero(1)
      const nnInter = nn.padStart(11, '0').slice(0, 11);
      campoLivre = nnInter + ag + cc.slice(0, 7) + cart.slice(0, 2) + '0';
      break;
    default:
      // Formato genérico: Agência(4) + Carteira(2) + NossoNumero(11) + Conta(7) + Zero(1)
      const nnGenerico = nn.padStart(11, '0').slice(0, 11);
      campoLivre = ag + cart.slice(0, 2) + nnGenerico + cc.slice(0, 7) + '0';
      break;
  }

  // Garante exatamente 25 dígitos
  campoLivre = campoLivre.replace(/\D/g, '');
  if (campoLivre.length > 25) campoLivre = campoLivre.slice(0, 25);
  if (campoLivre.length < 25) campoLivre = campoLivre.padEnd(25, '0');
  return campoLivre;
}

/**
 * Gera código de barras no padrão FEBRABAN (44 dígitos)
 * Formato: Banco(3) + Moeda(1) + DV(1) + FatorVenc(4) + Valor(10) + CampoLivre(25)
 */
export function gerarCodigoBarras(valor: number, vencimento: string, codigoBanco?: string, agencia?: string, conta?: string, carteira?: string, nossoNumero?: string, convenio?: string, codigoCedente?: string): string {
  const banco = (codigoBanco || '001').padStart(3, '0');
  const moeda = '9';
  const fatorVencimento = calcularFatorVencimento(vencimento);
  const valorStr = Math.round(valor * 100).toString().padStart(10, '0');
  const nn = nossoNumero || gerarNossoNumero(gerarNumeroDocumento());
  const campoLivre = gerarCampoLivre(banco, agencia || '', conta || '', carteira || '', nn, convenio, codigoCedente);

  // Monta sem DV para calcular
  const semDV = banco + moeda + fatorVencimento + valorStr + campoLivre;
  const dv = calcularDVMod11Barras(semDV);
  return banco + moeda + dv + fatorVencimento + valorStr + campoLivre;
}

/**
 * Gera linha digitável a partir do código de barras (47 dígitos formatados)
 * Formato: AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV
 */
export function gerarLinhaDigitavel(valor: number, vencimento: string, codigoBanco?: string, agencia?: string, conta?: string, carteira?: string, nossoNumero?: string, convenio?: string, codigoCedente?: string): string {
  const barras = gerarCodigoBarras(valor, vencimento, codigoBanco, agencia, conta, carteira, nossoNumero, convenio, codigoCedente);

  // Extrai partes do código de barras
  const banco = barras.substring(0, 3); // Banco
  const moeda = barras.substring(3, 4); // Moeda
  const dv = barras.substring(4, 5); // DV geral
  const fatorValor = barras.substring(5, 19); // Fator + Valor (14 dígitos)
  const campoLivre = barras.substring(19, 44); // Campo livre (25 dígitos)

  // Campo 1: Banco(3) + Moeda(1) + CampoLivre[0..4](5) = 9 dígitos + DV mod10
  const campo1Dados = banco + moeda + campoLivre.substring(0, 5);
  const dv1 = calcularDVMod10(campo1Dados);
  const campo1 = campo1Dados.substring(0, 5) + '.' + campo1Dados.substring(5) + dv1;

  // Campo 2: CampoLivre[5..14](10) + DV mod10
  const campo2Dados = campoLivre.substring(5, 15);
  const dv2 = calcularDVMod10(campo2Dados);
  const campo2 = campo2Dados.substring(0, 5) + '.' + campo2Dados.substring(5) + dv2;

  // Campo 3: CampoLivre[15..24](10) + DV mod10
  const campo3Dados = campoLivre.substring(15, 25);
  const dv3 = calcularDVMod10(campo3Dados);
  const campo3 = campo3Dados.substring(0, 5) + '.' + campo3Dados.substring(5) + dv3;

  // Campo 4: DV geral do código de barras
  const campo4 = dv;

  // Campo 5: Fator de vencimento(4) + Valor(10)
  const campo5 = fatorValor;
  return `${campo1} ${campo2} ${campo3} ${campo4} ${campo5}`;
}

/**
 * Formata valor para exibição em moeda brasileira
 */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/**
 * Formata CPF para exibição
 */
export function formatarCPF(cpf: string): string {
  if (!cpf) return '';
  const numeros = cpf.replace(/\D/g, '');
  if (numeros.length !== 11) return cpf;
  return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6, 9)}-${numeros.slice(9)}`;
}

/**
 * Formata CNPJ para exibição
 */
export function formatarCNPJ(cnpj: string): string {
  if (!cnpj) return '';
  const numeros = cnpj.replace(/\D/g, '');
  if (numeros.length !== 14) return cnpj;
  return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8, 12)}-${numeros.slice(12)}`;
}

/**
 * Gera o HTML completo do boleto para impressão
 * Layout: 2 vias na mesma folha A4 com linha de corte
 * Usa dados bancários REAIS configurados pelo usuário
 */
export function gerarHTMLBoleto(dados: DadosBoleto): string {
  const codigoBanco = dados.codigoBanco || (dados.banco?.match(/^\d{3}/) ? dados.banco.substring(0, 3) : undefined);
  const nossoNumero = dados.nossoNumero || gerarNossoNumero(dados.numeroDocumento);
  const linhaDigitavel = gerarLinhaDigitavel(dados.valor, dados.dataVencimento, codigoBanco, dados.agencia?.replace(/\D/g, ''), dados.conta?.replace(/\D/g, ''), dados.carteira, nossoNumero, dados.convenio, dados.codigoCedente);
  const codigoBarras = gerarCodigoBarras(dados.valor, dados.dataVencimento, codigoBanco, dados.agencia?.replace(/\D/g, ''), dados.conta?.replace(/\D/g, ''), dados.carteira, nossoNumero, dados.convenio, dados.codigoCedente);
  const dataVencFormatada = new Date(dados.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
  const dataEmissaoFormatada = dados.dataEmissao ? new Date(dados.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  const instrucoes = dados.instrucoes || ['Não receber após o vencimento.', 'Juros de 1% ao mês após o vencimento.', 'Multa de 2% após o vencimento.'];

  // Gera uma via do boleto (reutilizada para 1ª e 2ª via)
  const gerarVia = (viaLabel: string) => `
    <div class="via">
      <div class="via-label">${viaLabel}</div>
      
      <!-- Header do Banco -->
      <div class="bank-header">
        <div class="bank-logo">${dados.banco || 'BANCO'}</div>
        <div class="bank-code">${dados.codigoBanco ? dados.codigoBanco + '-9' : ''}</div>
        <div class="bank-linha">${linhaDigitavel}</div>
      </div>
      
      <!-- Local de Pagamento / Vencimento -->
      <div class="row">
        <div class="cell flex-1">
          <span class="lbl">Local de Pagamento</span>
          <span class="val">PAGÁVEL EM QUALQUER BANCO ATÉ O VENCIMENTO</span>
        </div>
        <div class="cell w-right">
          <span class="lbl">Vencimento</span>
          <span class="val bold big">${dataVencFormatada}</span>
        </div>
      </div>
      
      <!-- Cedente / Agência -->
      <div class="row">
        <div class="cell flex-1">
          <span class="lbl">Cedente</span>
          <span class="val">${dados.cedente.nome} - CNPJ: ${formatarCNPJ(dados.cedente.cnpj)}</span>
        </div>
        <div class="cell w-right">
          <span class="lbl">Agência / Código Cedente</span>
          <span class="val">${dados.agencia ? dados.agencia + ' / ' + (dados.conta || '') : ''}</span>
        </div>
      </div>
      
      <!-- Data Doc / Nº Doc / Espécie / Aceite / Processamento / Nosso Número -->
      <div class="row">
        <div class="cell" style="width:80px">
          <span class="lbl">Data Doc.</span>
          <span class="val">${dataEmissaoFormatada}</span>
        </div>
        <div class="cell" style="width:110px">
          <span class="lbl">Nº Documento</span>
          <span class="val">${dados.numeroDocumento}</span>
        </div>
        <div class="cell" style="width:55px">
          <span class="lbl">Espécie</span>
          <span class="val">DM</span>
        </div>
        <div class="cell" style="width:45px">
          <span class="lbl">Aceite</span>
          <span class="val">N</span>
        </div>
        <div class="cell flex-1">
          <span class="lbl">Data Processamento</span>
          <span class="val">${dataEmissaoFormatada}</span>
        </div>
        <div class="cell w-right">
          <span class="lbl">Nosso Número</span>
          <span class="val">${nossoNumero}</span>
        </div>
      </div>
      
      <!-- Carteira / Espécie / Valor -->
      <div class="row">
        <div class="cell" style="width:80px">
          <span class="lbl">Uso do Banco</span>
          <span class="val"></span>
        </div>
        <div class="cell" style="width:60px">
          <span class="lbl">Carteira</span>
          <span class="val">${dados.carteira || ''}</span>
        </div>
        <div class="cell" style="width:55px">
          <span class="lbl">Espécie</span>
          <span class="val">R$</span>
        </div>
        <div class="cell flex-1">
          <span class="lbl">Quantidade</span>
          <span class="val"></span>
        </div>
        <div class="cell w-right">
          <span class="lbl">(=) Valor do Documento</span>
          <span class="val bold big">${formatarMoeda(dados.valor)}</span>
        </div>
      </div>
      
      <!-- Instruções + Descontos -->
      <div class="row row-instrucoes">
        <div class="cell flex-1">
          <span class="lbl">Instruções (Texto de responsabilidade do cedente)</span>
          <div class="instrucoes">
            ${instrucoes.map((i) => '<div>• ' + i + '</div>').join('')}
            ${dados.descricao ? '<div style="margin-top:4px"><b>Ref.:</b> ' + dados.descricao + '</div>' : ''}
          </div>
        </div>
        <div class="cell w-right descontos">
          <div><span class="lbl">(-) Desconto</span></div>
          <div><span class="lbl">(-) Deduções</span></div>
          <div><span class="lbl">(+) Mora/Multa</span></div>
          <div><span class="lbl">(+) Acréscimos</span></div>
          <div><span class="lbl">(=) Valor Cobrado</span></div>
        </div>
      </div>
      
      <!-- Sacado -->
      <div class="row sacado-row">
        <div class="cell flex-1" style="border-right:none">
          <span class="lbl">Sacado</span>
          <span class="val">${dados.sacado.nome} - CPF: ${formatarCPF(dados.sacado.cpf)}</span>
          ${dados.sacado.endereco ? '<div class="val" style="margin-top:1px">' + dados.sacado.endereco + (dados.sacado.cidade ? ' - ' + dados.sacado.cidade + '/' + dados.sacado.uf : '') + '</div>' : ''}
        </div>
      </div>
      
      <!-- Código de Barras -->
      <div class="barcode-area">
        <div class="barcode"></div>
        <div class="barcode-num">${codigoBarras}</div>
      </div>
    </div>
  `;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Boleto - ${dados.numeroDocumento}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; background: #fff; }
    .page { max-width: 780px; margin: 10px auto; padding: 0 15px; }
    
    /* Via do boleto */
    .via {
      border: 1px solid #333;
      padding: 0;
      position: relative;
      page-break-inside: avoid;
      margin-bottom: 0;
    }
    .via-label {
      position: absolute;
      top: 2px;
      right: 6px;
      font-size: 8px;
      color: #999;
      font-weight: bold;
    }
    
    /* Header do banco */
    .bank-header {
      display: flex;
      border-bottom: 2px solid #000;
      height: 32px;
    }
    .bank-logo {
      width: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 14px;
      border-right: 2px solid #000;
      letter-spacing: 1px;
    }
    .bank-code {
      width: 65px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 16px;
      border-right: 2px solid #000;
    }
    .bank-linha {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 1px;
      font-family: 'Courier New', monospace;
    }
    
    /* Linhas e células */
    .row {
      display: flex;
      border-bottom: 1px solid #333;
    }
    .cell {
      padding: 2px 5px;
      border-right: 1px solid #333;
      min-height: 22px;
    }
    .cell:last-child { border-right: none; }
    .flex-1 { flex: 1; }
    .w-right { width: 140px; }
    
    .lbl {
      display: block;
      font-size: 7px;
      color: #555;
      text-transform: uppercase;
      line-height: 1;
      margin-bottom: 1px;
    }
    .val {
      display: block;
      font-size: 10px;
      line-height: 1.2;
    }
    .val.bold { font-weight: 700; }
    .val.big { font-size: 12px; }
    
    /* Instruções */
    .row-instrucoes .cell.flex-1 { min-height: 55px; }
    .instrucoes { font-size: 8px; line-height: 1.4; margin-top: 2px; }
    .descontos { display: flex; flex-direction: column; justify-content: space-between; }
    .descontos div { border-bottom: 1px dotted #ccc; padding: 1px 0; }
    .descontos div:last-child { border-bottom: none; }
    
    /* Sacado */
    .sacado-row .cell { min-height: 28px; }
    
    /* Código de barras */
    .barcode-area {
      padding: 6px 8px;
      text-align: left;
    }
    .barcode {
      height: 36px;
      width: 70%;
      background: repeating-linear-gradient(
        90deg,
        #000 0px, #000 1.5px,
        #fff 1.5px, #fff 3px,
        #000 3px, #000 4px,
        #fff 4px, #fff 6.5px,
        #000 6.5px, #000 7.5px,
        #fff 7.5px, #fff 9px
      );
    }
    .barcode-num {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      margin-top: 2px;
      letter-spacing: 1.5px;
      color: #333;
    }
    
    /* Linha de corte entre as vias */
    .corte {
      border: none;
      border-top: 1.5px dashed #999;
      margin: 14px 0;
      position: relative;
    }
    .corte::before {
      content: '✂  Corte aqui';
      position: absolute;
      top: -8px;
      left: 10px;
      background: #fff;
      padding: 0 6px;
      font-size: 9px;
      color: #999;
    }
    
    /* Impressão */
    @media print {
      body { margin: 0; }
      .page { margin: 0; max-width: 100%; padding: 8px 15px; }
    }
  </style>
</head>
<body>
  <div class="page">
    ${gerarVia('1ª Via - Banco')}
    
    <hr class="corte">
    
    ${gerarVia('2ª Via - Sacado')}
  </div>
  
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  </script>
</body>
</html>`;
}

/**
 * Abre uma nova janela com o boleto para impressão
 */
export function imprimirBoleto(dados: DadosBoleto): void {
  const html = gerarHTMLBoleto(dados);
  // ⭐ Abre preview antes de salvar
  import('./pdfGenerator').then(({
    previewDocumentoPDF
  }) => {
    const nomeArquivo = `Boleto_${dados.numeroDocumento}_${(dados.sacado.nome || 'Paciente').replace(/\s+/g, '_')}.pdf`;
    previewDocumentoPDF(html, {
      fileName: nomeArquivo
    });
  });
}