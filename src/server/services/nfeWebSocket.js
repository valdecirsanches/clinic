
// server/services/nfeWebSocket.js
// ============================================================
// Cliente WebSocket para ACBrMonitorPLUS — Emissão de NFe
// ============================================================
// Protocolo:
//   ws.send(JSON.stringify({ cmd: "NFe.CriarEnviarNFe(...)", url: null }))
//   Aguardar mensagem de resposta com OK: ou ERRO:
// ============================================================

const WebSocket = require('ws');

const DEFAULT_WS_URL = 'ws://localhost:3433';
const DEFAULT_TIMEOUT = 60000; // NFe pode demorar mais que NFSe

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitiza string para uso no XML da NFe.
 * Remove acentos (NFe autorizada usa texto sem acentos),
 * remove caracteres de controle e inválidos em XML.
 */
function sanitizarTextoNFe(texto) {
  if (!texto) return '';
  let s = String(texto);
  // Remover caracteres de controle (exceto \n \r \t)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Remover acentos — normaliza para NFD e remove diacríticos
  // Dália → Dalia, Carapicuíba → Carapicuiba, CAÇA → CACA, COLEÇÃO → COLECAO
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Substituir & que quebra XML
  s = s.replace(/&/g, 'e');
  // Remover < > que quebram XML
  s = s.replace(/</g, '');
  s = s.replace(/>/g, '');
  // Remover qualquer caractere não-ASCII restante (segurança extra)
  s = s.replace(/[^\x20-\x7E]/g, '');
  // Normalizar espaços múltiplos
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extrairCampoIni(texto, chave) {
  const re = new RegExp(`^${chave}=(.*)$`, 'im');
  const m = texto.match(re);
  return m ? m[1].trim() : '';
}

function extrairErrosIni(texto) {
  const erros = [];
  const reSecao = /\[Erro\d+\]([\s\S]*?)(?=\[|\s*$)/gi;
  let m;
  while ((m = reSecao.exec(texto)) !== null) {
    const bloco = m[1];
    const desc = extrairCampoIni(bloco, 'Descricao') ||
    extrairCampoIni(bloco, 'xMotivo') ||
    extrairCampoIni(bloco, 'Mensagem') ||
    extrairCampoIni(bloco, 'Codigo');
    if (desc) erros.push(desc);
  }
  return erros;
}

function fmtValor(v, casas = 2) {
  return parseFloat(v || 0).toFixed(casas);
}

/**
 * Formata data ISO para DD/MM/AAAA (formato ACBrMonitor INI)
 */
function formatarData(isoDate) {
  try {
    const d = new Date(isoDate);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
  } catch {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }
}

/**
 * Formata data/hora para DD/MM/AAAA HH:MM:SS (formato ACBrLib)
 * A ACBrLib converte internamente para ISO 8601 com timezone.
 * NÃO enviar em ISO — a lib quebra o formato.
 * Exemplo: 28/02/2026 15:36:22
 */
function formatarDataHora(isoDate) {
  try {
    const d = new Date(isoDate);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const seg = String(d.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${hora}:${min}:${seg}`;
  } catch {
    const now = new Date();
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const ano = now.getFullYear();
    return `${dia}/${mes}/${ano} 00:00:00`;
  }
}

// Mapa UF → cUF (código IBGE do estado)
const CUF_MAP = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17'
};

/**
 * Monta a URL WebSocket para NFe a partir da config
 */
function montarWsUrl(config) {
  const raw = (config.acbr_nfe_ws_url || config.acbr_ws_url || DEFAULT_WS_URL).trim();
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw;
  const clean = raw.replace(/^https?:\/\//, '');
  const parts = clean.split(':');
  const host = parts[0] || 'localhost';
  const port = parts[1] ? parseInt(parts[1], 10) : 3433;
  return `ws://${host}:${port}`;
}

/**
 * Monta o INI da NFe no formato ACBrMonitor
 * Baseado na estrutura padrão do ACBr para NFe layout 4.00
 * Referência: XML autorizado pela SEFAZ-SP
 */
function montarIniNFe(venda, itensVenda, empresa, config) {
  const cnpjEmitente = (empresa.cnpj || '').replace(/\D/g, '');
  const ufEmitente = (empresa.uf || 'SP').toUpperCase();
  const cUF = CUF_MAP[ufEmitente] || '35';
  const ambiente = (config.nfe_ambiente || 'homologacao') === 'producao' ? '1' : '2';
  const serie = config.nfe_serie || '1';
  const naturezaOp = sanitizarTextoNFe(config.nfe_natureza_operacao || 'Vendas de producao propria ou de terceiros');
  const tipoEmissao = config.nfe_tipo_emissao || '1';
  const finalidade = config.nfe_finalidade_emissao || '1';
  const indicadorPresenca = config.nfe_indicador_presenca || '1';
  const modalidadeFrete = config.nfe_modalidade_frete || '9';
  const formatoImpressao = config.nfe_formato_impressao || '1';
  const infoComplementares = sanitizarTextoNFe(config.nfe_informacoes_complementares || '');
  const regimeTributario = empresa.regime_tributario || '1';
  const isSimples = ['1', '2', '4'].includes(regimeTributario); // 1=SN, 2=SN Excesso, 4=MEI

  // Número da NFe — baseado no ambiente
  const proximoNumero = ambiente === '1' ?
  config.nfe_proximo_numero_producao || 1 :
  config.nfe_proximo_numero_homologacao || 1;
  const numeroNFe = String(proximoNumero).padStart(9, '0');

  const dataEmissao = formatarDataHora(venda.data || new Date().toISOString());

  // Destinatário
  const destDoc = (venda.cliente_cpf_cnpj || '').replace(/\D/g, '');
  const destTipo = destDoc.length <= 11 ? 'CPF' : 'CNPJ';
  const destIE = (venda.cliente_ie || '').trim();
  const indIEDest = destIE && destIE.toUpperCase() !== 'ISENTO' && destIE.length > 0 ? '1' : '9';

  // Código IBGE do município do emitente
  const codMunEmitente = empresa.codigo_ibge || config.nfse_codigo_municipio || '3534401';

  const linhas = [];

  // ══════════════════════════════════════════════════════════════════════════
  // ── Identificação da NFe ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  linhas.push(
    '[infNFe]',
    `versao=${config.nfe_versao || '4.00'}`,
    '',
    '[Identificacao]',
    `cUF=${cUF}`,
    `natOp=${naturezaOp}`,
    `mod=55`,
    `serie=${serie}`,
    `nNF=${numeroNFe}`,
    `dhEmi=${dataEmissao}`,
    `dhSaiEnt=${dataEmissao}`,
    `tpNF=1`,
    `idDest=1`,
    `cMunFG=${codMunEmitente}`,
    `tpImp=${formatoImpressao}`,
    `tpEmis=${tipoEmissao}`,
    `tpAmb=${ambiente}`,
    `finNFe=${finalidade}`,
    `indFinal=1`,
    `indPres=${indicadorPresenca}`,
    `indIntermed=0`,
    `procEmi=0`,
    `verProc=1.0`,
    ''
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── Emitente ──────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  linhas.push(
    '[Emitente]',
    `CNPJ=${cnpjEmitente}`,
    `xNome=${sanitizarTextoNFe(empresa.razao_social || '')}`,
    `xFant=${sanitizarTextoNFe(empresa.nome_fantasia || empresa.razao_social || '')}`,
    `IE=${(empresa.inscricao_estadual || '').replace(/\D/g, '')}`,
    `CRT=${regimeTributario}`,
    `xLgr=${sanitizarTextoNFe(empresa.endereco || '')}`,
    `nro=${sanitizarTextoNFe(empresa.numero || 'SN')}`,
    empresa.complemento ? `xCpl=${sanitizarTextoNFe(empresa.complemento)}` : '',
    `xBairro=${sanitizarTextoNFe(empresa.bairro || '')}`,
    `cMun=${codMunEmitente}`,
    `xMun=${sanitizarTextoNFe(empresa.cidade || '')}`,
    `UF=${ufEmitente}`,
    `CEP=${(empresa.cep || '').replace(/\D/g, '')}`,
    `cPais=1058`,
    `xPais=BRASIL`,
    `fone=${(empresa.telefone || '').replace(/\D/g, '')}`,
    ''
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── Destinatário ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const destFone = (venda.cliente_telefone || '').replace(/\D/g, '');
  linhas.push(
    '[Destinatario]',
    `${destTipo}=${destDoc}`,
    `xNome=${sanitizarTextoNFe(venda.cliente_nome || '')}`,
    `indIEDest=${indIEDest}`,
    indIEDest === '1' && destIE ? `IE=${destIE.replace(/\D/g, '')}` : '',
    `xLgr=${sanitizarTextoNFe(venda.cliente_endereco || 'RUA NAO INFORMADA')}`,
    `nro=${sanitizarTextoNFe(venda.cliente_numero || venda.cliente_endereco_numero || 'SN')}`,
    venda.cliente_complemento ? `xCpl=${sanitizarTextoNFe(venda.cliente_complemento)}` : '',
    `xBairro=${sanitizarTextoNFe(venda.cliente_bairro || 'CENTRO')}`,
    `cMun=${venda.cliente_codigo_ibge || codMunEmitente}`,
    `xMun=${sanitizarTextoNFe(venda.cliente_cidade || '')}`,
    `UF=${(venda.cliente_uf || ufEmitente).toUpperCase()}`,
    `CEP=${(venda.cliente_cep || '').replace(/\D/g, '')}`,
    `cPais=1058`,
    `xPais=BRASIL`,
    destFone ? `fone=${destFone}` : '',
    `email=${sanitizarTextoNFe(venda.cliente_email || '')}`,
    ''
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── Endereço de Entrega (se diferente do destinatário) ────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (venda.entrega_logradouro || venda.entrega_cep) {
    const entregaDoc = (venda.entrega_cpf_cnpj || destDoc || '').replace(/\D/g, '');
    const entregaTipo = entregaDoc.length <= 11 ? 'CPF' : 'CNPJ';
    linhas.push(
      '[Entrega]',
      `${entregaTipo}=${entregaDoc}`,
      `xLgr=${sanitizarTextoNFe(venda.entrega_logradouro || '')}`,
      `nro=${sanitizarTextoNFe(venda.entrega_numero || 'SN')}`,
      `xBairro=${sanitizarTextoNFe(venda.entrega_bairro || '')}`,
      `cMun=${venda.entrega_codigo_ibge || venda.cliente_codigo_ibge || codMunEmitente}`,
      `xMun=${sanitizarTextoNFe(venda.entrega_cidade || venda.cliente_cidade || '')}`,
      `UF=${(venda.entrega_uf || venda.cliente_uf || ufEmitente).toUpperCase()}`,
      `cPais=1058`,
      `xPais=BRASIL`,
      ''
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Produtos ──────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  let totalProdutos = 0;
  let totalDesconto = 0;
  let totalICMS = 0;
  let totalPIS = 0;
  let totalCOFINS = 0;

  itensVenda.forEach((item, idx) => {
    const num = String(idx + 1).padStart(3, '0');
    const valorItem = parseFloat(item.valor_total || 0);
    const valorUnit = parseFloat(item.valor_unitario || 0);
    const qtd = parseFloat(item.quantidade || 1);
    const desconto = parseFloat(item.desconto || 0);
    const ncm = (item.ncm || '00000000').replace(/\D/g, '');
    const cfop = (item.cfop || '5102').replace(/\D/g, '');
    const cst = item.cst || '00';
    const cest = (item.cest || '').replace(/\D/g, '');
    const ean = sanitizarTextoNFe(item.ean || item.codigo_barras || 'SEM GTIN');
    const aliqICMS = parseFloat(item.aliquota_icms || 0);
    const aliqPIS = parseFloat(item.aliquota_pis || 0);
    const aliqCOFINS = parseFloat(item.aliquota_cofins || 0);

    // Para Simples Nacional: vBC=0, vICMS=0
    const baseCalcICMS = isSimples ? 0 : valorItem - desconto;
    const valorICMS = isSimples ? 0 : baseCalcICMS * aliqICMS / 100;
    const baseCalcPIS = isSimples ? 0 : valorItem;
    const valorPIS = isSimples ? 0 : valorItem * aliqPIS / 100;
    const baseCalcCOFINS = isSimples ? 0 : valorItem;
    const valorCOFINS = isSimples ? 0 : valorItem * aliqCOFINS / 100;

    totalProdutos += valorItem;
    totalDesconto += desconto;
    totalICMS += valorICMS;
    totalPIS += valorPIS;
    totalCOFINS += valorCOFINS;

    linhas.push(
      `[Produto${num}]`,
      `cProd=${sanitizarTextoNFe(item.codigo || item.produto_id)}`,
      `cEAN=${ean}`,
      `xProd=${sanitizarTextoNFe(item.descricao || 'Produto')}`,
      `NCM=${ncm}`,
      cest ? `CEST=${cest}` : '',
      `CFOP=${cfop}`,
      `uCom=${sanitizarTextoNFe(item.unidade || 'UN')}`,
      `qCom=${fmtValor(qtd, 4)}`,
      `vUnCom=${fmtValor(valorUnit, 10)}`,
      `vProd=${fmtValor(valorItem)}`,
      `cEANTrib=${ean}`,
      `uTrib=${sanitizarTextoNFe(item.unidade || 'UN')}`,
      `qTrib=${fmtValor(qtd, 4)}`,
      `vUnTrib=${fmtValor(valorUnit, 10)}`,
      desconto > 0 ? `vDesc=${fmtValor(desconto)}` : '',
      `indTot=1`,
      `xPed=0`,
      `nItemPed=${idx + 1}`,
      ''
    );

    // ── ICMS ──────────────────────────────────────────────────────────────
    if (isSimples) {
      // Simples Nacional / MEI — usa CSOSN
      const csosn = item.csosn || '102';
      linhas.push(
        `[ICMS${num}]`,
        `orig=0`,
        `CSOSN=${csosn}`,
        ''
      );
    } else {
      // Regime Normal — usa CST
      linhas.push(
        `[ICMS${num}]`,
        `orig=0`,
        `CST=${cst}`,
        `modBC=0`,
        `vBC=${fmtValor(baseCalcICMS)}`,
        `pICMS=${fmtValor(aliqICMS)}`,
        `vICMS=${fmtValor(valorICMS)}`,
        ''
      );
    }

    // ── IPI (obrigatório para indústria/importação, incluir com alíquota 0) ──
    linhas.push(
      `[IPI${num}]`,
      `cEnq=999`,
      `CST=99`,
      `vBC=${fmtValor(valorItem)}`,
      `pIPI=0.0000`,
      `vIPI=0.00`,
      ''
    );

    // ── PIS ───────────────────────────────────────────────────────────────
    if (isSimples) {
      // Simples Nacional: PISOutr CST=99, vBC=0
      linhas.push(
        `[PIS${num}]`,
        `CST=99`,
        `vBC=0.00`,
        `pPIS=0.0000`,
        `vPIS=0.00`,
        ''
      );
    } else {
      linhas.push(
        `[PIS${num}]`,
        `CST=01`,
        `vBC=${fmtValor(valorItem)}`,
        `pPIS=${fmtValor(aliqPIS, 4)}`,
        `vPIS=${fmtValor(valorPIS)}`,
        ''
      );
    }

    // ── COFINS ────────────────────────────────────────────────────────────
    if (isSimples) {
      // Simples Nacional: COFINSOutr CST=99, vBC=0
      linhas.push(
        `[COFINS${num}]`,
        `CST=99`,
        `vBC=0.00`,
        `pCOFINS=0.0000`,
        `vCOFINS=0.00`,
        ''
      );
    } else {
      linhas.push(
        `[COFINS${num}]`,
        `CST=01`,
        `vBC=${fmtValor(valorItem)}`,
        `pCOFINS=${fmtValor(aliqCOFINS, 4)}`,
        `vCOFINS=${fmtValor(valorCOFINS)}`,
        ''
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ── Pagamento (ACBrLib 4.00: [pag001] já representa <detPag>) ─────────────
  // ══════════════════════════════════════════════════════════════════════════
  const valorNF = totalProdutos - totalDesconto;
  linhas.push(
    '[pag001]',
    `tPag=01`,
    `vPag=${fmtValor(valorNF)}`,
    ''
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── Totais ────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  linhas.push(
    '[Total]',
    `vBC=${isSimples ? '0.00' : fmtValor(totalProdutos - totalDesconto)}`,
    `vICMS=${isSimples ? '0.00' : fmtValor(totalICMS)}`,
    `vICMSDeson=0.00`,
    `vFCP=0.00`,
    `vBCST=0.00`,
    `vST=0.00`,
    `vFCPST=0.00`,
    `vFCPSTRet=0.00`,
    `vProd=${fmtValor(totalProdutos)}`,
    `vFrete=0.00`,
    `vSeg=0.00`,
    `vDesc=${fmtValor(totalDesconto)}`,
    `vII=0.00`,
    `vIPI=0.00`,
    `vIPIDevol=0.00`,
    `vPIS=${isSimples ? '0.00' : fmtValor(totalPIS)}`,
    `vCOFINS=${isSimples ? '0.00' : fmtValor(totalCOFINS)}`,
    `vOutro=0.00`,
    `vNF=${fmtValor(valorNF)}`,
    ''
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── Transporte ────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  linhas.push(
    '[Transportador]',
    `modFrete=${modalidadeFrete}`,
    ''
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ── Informações Adicionais ────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (infoComplementares) {
    linhas.push(
      '[InfAdic]',
      `infCpl=${infoComplementares}`,
      ''
    );
  }

  // IMPORTANTE: Manter linhas em branco ('') como separadores de seção do INI.
  // O ACBrMonitor PRECISA dessas linhas em branco para separar seções como
  // [pag] de [detPag001]. Sem elas, o ACBr não reconhece as sub-seções.
  // Só remover undefined (de campos condicionais que não se aplicam).
  return linhas.filter((l) => l !== undefined).join('\n');
}

/**
 * Parseia a resposta de emissão da NFe
 */
function parsearRespostaEmissao(resposta) {
  let texto = resposta;

  // Tentar extrair do JSON do WebSocket
  try {
    const parsed = JSON.parse(resposta);
    console.log(`[NFe-WS] JSON recebido, chaves: ${Object.keys(parsed).join(', ')}`);

    // ── Tratar JSON com chave ERRO diretamente ──────────────────────────
    if (parsed.ERRO) {
      const erroObj = parsed.ERRO;
      let erroTexto = '';
      if (typeof erroObj === 'string') {
        erroTexto = erroObj;
      } else {
        erroTexto = erroObj.xMotivo || erroObj.mensagem || erroObj.erro || erroObj.bruto || JSON.stringify(erroObj);
      }
      const cStat = (typeof erroObj === 'object' ? erroObj.cStat : '') || '';

      // ══════════════════════════════════════════════════════════════════
      // IMPORTANTE: O ACBrMonitorPLUS às vezes retorna ERRO no JSON mas
      // o conteúdo bruto contém "OK:" com dados de sucesso.
      // Isso acontece quando há um erro de sistema (ex: [Errno 2]) mas
      // a NFe foi emitida com sucesso pela SEFAZ.
      // Precisamos verificar se dentro do "erro" há sinais de sucesso.
      // ══════════════════════════════════════════════════════════════════
      const erroUpper = erroTexto.toUpperCase();

      // Verificar se contém "OK:" dentro do texto de erro
      if (erroUpper.includes('OK:')) {
        console.log(`[NFe-WS] ⚠️ ERRO JSON contém "OK:" — verificando se é sucesso disfarçado...`);

        // Extrair a parte após "OK:"
        const posOkInErro = erroUpper.indexOf('OK:');
        const conteudoOk = erroTexto.substring(posOkInErro).replace(/^OK:\s*/i, '').trim();

        // Tentar extrair chave de acesso do caminho do PDF ou do texto
        // Padrão: chave de 44 dígitos no nome do arquivo ou no texto
        const chaveMatch = erroTexto.match(/(\d{44})/);
        const chaveAcesso = chaveMatch ? chaveMatch[1] : '';

        // Extrair campos INI se disponíveis
        const protocolo = extrairCampoIni(conteudoOk, 'Protocolo') || extrairCampoIni(conteudoOk, 'nProt') || '';
        const numero = extrairCampoIni(conteudoOk, 'nNF') || '';
        const cStatOk = extrairCampoIni(conteudoOk, 'cStat') || '';
        const xMotivo = extrairCampoIni(conteudoOk, 'xMotivo') || '';

        // Se encontrou chave de 44 dígitos ou "Arquivo criado", é sucesso
        if (chaveAcesso || erroUpper.includes('ARQUIVO CRIADO') || erroUpper.includes('AUTORIZADO')) {
          console.log(`[NFe-WS] ✅ SUCESSO detectado dentro de ERRO — Chave="${chaveAcesso}" Protocolo="${protocolo}"`);
          return {
            ok: true,
            chaveAcesso,
            protocolo,
            numero,
            serie: '',
            xml: '',
            cStat: cStatOk || '100',
            xMotivo: xMotivo || 'Autorizado o uso da NF-e',
            raw: erroTexto
          };
        }
      }

      // Verificar se é rejeição da SEFAZ com cStat
      if (cStat) {
        console.log(`[NFe-WS] ❌ ERRO JSON com cStat=${cStat}: "${erroTexto.substring(0, 200)}"`);
        return { ok: false, erro: erroTexto, cStat, raw: resposta };
      }

      // Erro genérico
      console.log(`[NFe-WS] ❌ ERRO JSON direto: "${erroTexto.substring(0, 200)}"`);
      return { ok: false, erro: erroTexto, cStat, raw: resposta };
    }

    // ── Tratar JSON com chave OK diretamente ────────────────────────────
    if (parsed.OK) {
      const okObj = parsed.OK;
      if (typeof okObj === 'string') {
        texto = okObj;
      } else if (okObj.bruto) {
        texto = okObj.bruto;
      } else {
        // Extrair campos do objeto OK
        const chaveAcesso = okObj.ChaveNFe || okObj.chNFe || okObj.Chave || '';
        const protocolo = okObj.Protocolo || okObj.nProt || '';
        const cStat = okObj.cStat || '';
        const xMotivo = okObj.xMotivo || '';
        if (chaveAcesso || protocolo) {
          console.log(`[NFe-WS] ✅ OK JSON direto — Chave="${chaveAcesso}" Protocolo="${protocolo}"`);
          return { ok: true, chaveAcesso, protocolo, numero: okObj.nNF || '', serie: okObj.serie || '', xml: okObj.XML || '', cStat, xMotivo, raw: resposta };
        }
        texto = okObj.bruto || JSON.stringify(okObj);
      }
    }

    if (parsed.ERRO?.bruto) texto = parsed.ERRO.bruto;else
    if (parsed.OK?.bruto) texto = parsed.OK.bruto;else
    if (parsed.bruto) texto = parsed.bruto;else
    if (parsed.response) texto = parsed.response;else
    if (parsed.result) texto = parsed.result;else
    if (typeof parsed === 'string') texto = parsed;
    // Se já tratou ERRO/OK acima, não chega aqui
  } catch {/* não é JSON */}

  console.log(`[NFe-WS] Resposta para parsear (800 chars):\n${texto.substring(0, 800)}`);

  // ── Buscar OK: e ERRO: em qualquer posição do texto ──────────────────
  const upper = texto.toUpperCase();

  // Buscar todas as ocorrências de OK: (pode estar no meio do texto)
  let posOk = -1;
  const okPatterns = ['OK:', '\nOK:', ' OK:'];
  for (const pat of okPatterns) {
    const idx = upper.indexOf(pat);
    if (idx >= 0) {
      posOk = idx + (pat.length - 3); // posição do "OK:"
      break;
    }
  }

  let posErro = -1;
  const erroPatterns = ['ERRO:', '\nERRO:', ' ERRO:'];
  for (const pat of erroPatterns) {
    const idx = upper.indexOf(pat);
    if (idx >= 0) {
      posErro = idx + (pat.length - 5); // posição do "ERRO:"
      break;
    }
  }

  // Se tem ERRO: antes de OK:, verificar se OK: aparece depois (sucesso real)
  if (posErro >= 0 && posOk >= 0 && posOk > posErro) {
    // Tem ERRO: e depois OK: — priorizar OK:
    console.log(`[NFe-WS] ⚠️ Texto contém ERRO: e depois OK: — priorizando OK:`);
  } else if (posErro >= 0 && (posOk < 0 || posErro < posOk)) {
    const erroTexto = texto.substring(posErro).replace(/^ERRO:\s*/i, '').trim();
    return { ok: false, erro: erroTexto };
  }

  if (posOk >= 0) {
    const conteudo = texto.substring(posOk).replace(/^OK:\s*/i, '').trim();

    // Extrair campos da resposta
    const chaveAcesso = extrairCampoIni(conteudo, 'ChaveNFe') || extrairCampoIni(conteudo, 'chNFe') || extrairCampoIni(conteudo, 'Chave');
    const protocolo = extrairCampoIni(conteudo, 'Protocolo') || extrairCampoIni(conteudo, 'nProt');
    const numero = extrairCampoIni(conteudo, 'nNF') || extrairCampoIni(conteudo, 'Numero');
    const serie = extrairCampoIni(conteudo, 'serie') || extrairCampoIni(conteudo, 'Serie');
    const xml = extrairCampoIni(conteudo, 'XmlRetorno') || extrairCampoIni(conteudo, 'XML');
    const cStat = extrairCampoIni(conteudo, 'cStat');
    const xMotivo = extrairCampoIni(conteudo, 'xMotivo');

    // cStat 100 = Autorizado, 150 = Autorizado fora prazo
    if (cStat && cStat !== '100' && cStat !== '150') {
      // Verificar se é rejeição
      const erros = extrairErrosIni(conteudo);
      const erroMsg = xMotivo || (erros.length > 0 ? erros.join(' | ') : `Rejeição cStat=${cStat}`);
      console.log(`[NFe-WS] ❌ Rejeitada: cStat=${cStat} xMotivo="${erroMsg}"`);
      return { ok: false, erro: erroMsg, cStat, raw: conteudo };
    }

    // Se tem chave de acesso ou protocolo, é sucesso
    if (chaveAcesso || protocolo) {
      console.log(`[NFe-WS] ✅ OK — Chave="${chaveAcesso}" Protocolo="${protocolo}" cStat="${cStat}"`);
      return { ok: true, chaveAcesso, protocolo, numero, serie, xml, cStat, xMotivo, raw: conteudo };
    }

    // Tentar extrair chave de 44 dígitos do conteúdo (pode estar no caminho do PDF)
    const chaveMatch = conteudo.match(/(\d{44})/);
    if (chaveMatch) {
      console.log(`[NFe-WS] ✅ OK — Chave extraída do texto: "${chaveMatch[1]}"`);
      return { ok: true, chaveAcesso: chaveMatch[1], protocolo: '', numero, serie, xml, cStat: cStat || '100', xMotivo: xMotivo || 'Autorizado o uso da NF-e', raw: conteudo };
    }

    // Verificar se menciona "Arquivo criado" (PDF gerado = sucesso)
    if (conteudo.toUpperCase().includes('ARQUIVO CRIADO')) {
      console.log(`[NFe-WS] ✅ OK — "Arquivo criado" detectado (PDF gerado)`);
      return { ok: true, chaveAcesso: '', protocolo: '', numero, serie, xml, cStat: '100', xMotivo: 'Autorizado o uso da NF-e', raw: conteudo };
    }

    // Sem chave nem protocolo — verificar erros
    const erros = extrairErrosIni(conteudo);
    if (erros.length > 0) {
      return { ok: false, erro: erros.join(' | '), raw: conteudo };
    }

    // Resposta OK mas sem dados claros — considerar sucesso parcial
    console.log(`[NFe-WS] ⚠️ OK sem chave/protocolo — resposta:\n${conteudo.substring(0, 300)}`);
    return { ok: true, chaveAcesso: '', protocolo: '', raw: conteudo };
  }

  // ── Último recurso: verificar se tem chave de 44 dígitos no texto ─────
  const chaveMatch = texto.match(/(\d{44})/);
  if (chaveMatch && (upper.includes('ARQUIVO CRIADO') || upper.includes('AUTORIZADO') || upper.includes('.PDF'))) {
    console.log(`[NFe-WS] ✅ Sucesso detectado por chave+PDF no texto: "${chaveMatch[1]}"`);
    return { ok: true, chaveAcesso: chaveMatch[1], protocolo: '', numero: '', serie: '', xml: '', cStat: '100', xMotivo: 'Autorizado o uso da NF-e', raw: texto };
  }

  console.warn(`[NFe-WS] Sem OK:/ERRO: na resposta:\n${texto.substring(0, 300)}`);
  return { ok: false, erro: `Resposta inesperada: ${texto.substring(0, 200)}` };
}

/**
 * Envia um comando via WebSocket
 * @param {string} comando - Comando ACBr
 * @param {string} wsUrl - URL do WebSocket
 * @param {number} timeout - Timeout em ms
 * @param {string|null} callbackUrl - URL para o ACBr enviar PDF+XML após emissão
 * @param {string|null} empresaId - ID da empresa para roteamento no WebSocket
 * @param {string|null} cnpj - CNPJ limpo da empresa
 */
function enviarComandoWS(comando, wsUrl, timeout = DEFAULT_TIMEOUT, callbackUrl = null, empresaId = null, cnpj = null) {
  return new Promise((resolve, reject) => {
    console.log(`[NFe-WS] Conectando em ${wsUrl}`);
    if (callbackUrl) console.log(`[NFe-WS] Callback URL: ${callbackUrl}`);
    if (empresaId) console.log(`[NFe-WS] Empresa ID: ${empresaId}`);
    if (cnpj) console.log(`[NFe-WS] CNPJ: ${cnpj}`);

    const ws = new WebSocket(wsUrl);
    let resposta = '';
    let resolvido = false;

    const timer = setTimeout(() => {
      if (!resolvido) {
        resolvido = true;
        ws.terminate();
        reject(new Error(`Timeout WebSocket NFe (${timeout}ms)`));
      }
    }, timeout);

    const finalizar = (resultado, erro) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(timer);
      ws.terminate();
      if (erro) reject(erro);else
      resolve(resultado);
    };

    ws.on('open', () => {
      console.log(`[NFe-WS] Conectado. Enviando comando...`);
      const payload = JSON.stringify({
        cmd: comando,
        url: callbackUrl,
        empresa_id: empresaId ? parseInt(empresaId, 10) : null,
        cnpj: cnpj || null
      });
      console.log(`[NFe-WS] Payload: ${payload.substring(0, 200)}...`);
      ws.send(payload);
    });

    ws.on('message', (data) => {
      const texto = data.toString();
      resposta += texto;
      console.log(`[NFe-WS] Mensagem recebida (${texto.length} chars): ${texto.substring(0, 100)}`);

      const upper = resposta.toUpperCase();
      if (upper.includes('OK:') || upper.includes('ERRO:')) {
        finalizar(resposta.trim());
        return;
      }

      try {
        JSON.parse(resposta);
        finalizar(resposta.trim());
      } catch {/* aguardar mais dados */}
    });

    ws.on('error', (err) => {
      finalizar(null, new Error(`Erro WebSocket NFe: ${err.message}`));
    });

    ws.on('close', () => {
      if (!resolvido && resposta) finalizar(resposta.trim());else
      if (!resolvido) finalizar(null, new Error('WebSocket NFe fechado sem resposta'));
    });
  });
}

/**
 * Emite uma NFe via WebSocket ACBrMonitor
 * @param {object} venda - Dados da venda
 * @param {array} itensVenda - Itens da venda
 * @param {object} empresa - Dados da empresa
 * @param {object} config - Configurações
 * @param {string|null} callbackUrl - URL para o ACBr enviar PDF+XML (se null, ACBr tenta imprimir localmente)
 */
async function emitir(venda, itensVenda, empresa, config, callbackUrl = null) {
  const wsUrl = montarWsUrl(config);
  const timeout = (config.acbr_timeout || 60) * 1000;
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = (empresa.cnpj || '').replace(/\D/g, '');

  // Validar empresa_id
  if (!empresaId) {
    throw new Error('Empresa não configurada para emissão de NFe. Configure o "ID no Emissor NFe" em Configurações → Empresa.');
  }

  console.log(`[NFe-WS] ════════════════════════════════════════`);
  console.log(`[NFe-WS] Emitindo NFe para Venda #${venda.numero}`);
  console.log(`[NFe-WS] URL: ${wsUrl}`);
  console.log(`[NFe-WS] Empresa ID: ${empresaId}, CNPJ: ${cnpjLimpo}`);
  console.log(`[NFe-WS] Callback: ${callbackUrl || '(nenhum — impressão local)'}`);
  console.log(`[NFe-WS] Timeout: ${timeout}ms`);
  console.log(`[NFe-WS] Ambiente: ${config.nfe_ambiente || 'homologacao'}`);
  console.log(`[NFe-WS] Cliente: ${venda.cliente_nome} (${venda.cliente_cpf_cnpj})`);
  console.log(`[NFe-WS] Itens: ${itensVenda.length}`);
  console.log(`[NFe-WS] Valor: R$ ${venda.valor_total}`);
  console.log(`[NFe-WS] ════════════════════════════════════════`);

  const ini = montarIniNFe(venda, itensVenda, empresa, config);
  console.log(`[NFe-WS] INI montado:\n${ini}`);

  const iniEscapado = ini.replace(/"/g, '\\"');
  const clienteDoc = (venda.cliente_cpf_cnpj || '').replace(/\D/g, '');

  // Comando ACBrMonitor para criar e enviar NFe
  const lote = Date.now();
  const cmdEmitir = `NFe.CriarEnviarNFe("${iniEscapado}", ${lote}, 0, 1)`;

  const respEmitir = await enviarComandoWS(cmdEmitir, wsUrl, timeout, callbackUrl, empresaId, cnpjLimpo);
  console.log(`[NFe-WS] Resposta emissão (3000 chars):\n${respEmitir.substring(0, 3000)}`);

  return parsearRespostaEmissao(respEmitir);
}

/**
 * Cancela uma NFe via WebSocket
 * @param {object} nfe - Dados da NFe {numero, chave_acesso, protocolo}
 * @param {object} empresa - Dados da empresa
 * @param {object} config - Configurações
 * @param {string|null} callbackUrl - URL para o ACBr enviar PDF+XML do evento de cancelamento
 */
async function cancelar(nfe, empresa, config, callbackUrl = null) {
  const wsUrl = montarWsUrl(config);
  const timeout = (config.acbr_timeout || 60) * 1000;
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = (empresa.cnpj || '').replace(/\D/g, '');

  if (!empresaId) {
    throw new Error('Empresa não configurada para emissão de NFe. Configure o "ID no Emissor NFe" em Configurações → Empresa.');
  }

  console.log(`[NFe-WS] ════════════════════════════════════════`);
  console.log(`[NFe-WS] Cancelando NFe #${nfe.numero} Chave: ${nfe.chave_acesso}`);
  console.log(`[NFe-WS] URL: ${wsUrl}`);
  console.log(`[NFe-WS] Empresa ID: ${empresaId}, CNPJ: ${cnpjLimpo}`);
  console.log(`[NFe-WS] Callback URL recebida: ${callbackUrl || '(NULO!)'}`);
  console.log(`[NFe-WS] Protocolo: ${nfe.protocolo || '(vazio)'}`);
  console.log(`[NFe-WS] ════════════════════════════════════════`);

  const protocolo = nfe.protocolo || '';

  // NFe.Cancelar(chave, justificativa, CNPJ, protocolo)
  const cmdCancelar = `NFe.Cancelar("${nfe.chave_acesso}", "Cancelamento solicitado pelo emissor", "${cnpjLimpo}", "${protocolo}")`;
  console.log(`[NFe-WS] Comando: ${cmdCancelar}`);

  const respCancelar = await enviarComandoWS(cmdCancelar, wsUrl, timeout, callbackUrl, empresaId, cnpjLimpo);
  console.log(`[NFe-WS] Resposta cancelamento: ${respCancelar.substring(0, 500)}`);

  const upper = respCancelar.toUpperCase();

  // Verificar se é JSON
  let texto = respCancelar;
  try {
    const parsed = JSON.parse(respCancelar);
    if (parsed.OK) {
      const okContent = typeof parsed.OK === 'string' ? parsed.OK : parsed.OK.bruto || JSON.stringify(parsed.OK);
      const cStat = extrairCampoIni(okContent, 'cStat') || '';
      const xMotivo = extrairCampoIni(okContent, 'xMotivo') || '';
      const nProt = extrairCampoIni(okContent, 'nProt') || extrairCampoIni(okContent, 'Protocolo') || '';
      const xmlRetorno = extrairCampoIni(okContent, 'XML') || '';
      console.log(`[NFe-WS] ✅ Cancelamento OK: cStat=${cStat} ${xMotivo}`);
      return { ok: true, resposta: okContent, cStat, xMotivo, protocolo: nProt, xml: xmlRetorno };
    }
    if (parsed.ERRO) {
      const erroContent = typeof parsed.ERRO === 'string' ? parsed.ERRO : parsed.ERRO.bruto || parsed.ERRO.xMotivo || JSON.stringify(parsed.ERRO);
      const cStat = typeof parsed.ERRO === 'object' ? parsed.ERRO.cStat || '' : '';
      console.log(`[NFe-WS] ❌ Cancelamento ERRO: ${erroContent.substring(0, 200)}`);
      return { ok: false, erro: erroContent, cStat };
    }
    if (parsed.bruto) texto = parsed.bruto;
  } catch {/* não é JSON */}

  // Verificar OK:/ERRO: no texto
  const posOk = upper.indexOf('OK:');
  const posErro = upper.indexOf('ERRO:');

  if (posOk >= 0 && (posErro < 0 || posOk < posErro)) {
    const conteudo = texto.substring(posOk).replace(/^OK:\s*/i, '').trim();
    const cStat = extrairCampoIni(conteudo, 'cStat') || conteudo.match(/cStat=(\d+)/i)?.[1] || '';
    const xMotivo = extrairCampoIni(conteudo, 'xMotivo') || conteudo.match(/xMotivo=(.+)/im)?.[1]?.trim() || '';
    const nProt = extrairCampoIni(conteudo, 'nProt') || extrairCampoIni(conteudo, 'Protocolo') || '';

    if (cStat && cStat !== '101' && cStat !== '135') {
      console.log(`[NFe-WS] ❌ Cancelamento rejeitado: cStat=${cStat} ${xMotivo}`);
      return { ok: false, erro: xMotivo || `Cancelamento rejeitado (cStat=${cStat})`, cStat };
    }

    console.log(`[NFe-WS] ✅ Cancelamento OK — cStat=${cStat} ${xMotivo}`);
    return { ok: true, resposta: conteudo, cStat, xMotivo, protocolo: nProt };
  }

  if (posErro >= 0) {
    const erroTexto = texto.substring(posErro).replace(/^ERRO:\s*/i, '').trim();
    console.log(`[NFe-WS] ❌ Cancelamento ERRO: ${erroTexto.substring(0, 200)}`);
    return { ok: false, erro: erroTexto };
  }

  if (upper.includes('CANCELAMENTO') && (upper.includes('HOMOLOGADO') || upper.includes('101'))) {
    console.log(`[NFe-WS] ✅ Cancelamento detectado como sucesso pelo conteúdo`);
    return { ok: true, resposta: texto };
  }

  console.warn(`[NFe-WS] Resposta de cancelamento inesperada: ${texto.substring(0, 300)}`);
  return { ok: false, erro: `Resposta inesperada: ${texto.substring(0, 200)}` };
}

/**
 * Testa a conexão WebSocket para NFe
 */
async function testarConexao(config, empresa) {
  const wsUrl = montarWsUrl(config);
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = empresa ? (empresa.cnpj || '').replace(/\D/g, '') : '';
  try {
    const resp = await enviarComandoWS('NFe.StatusServico', wsUrl, 10000, null, empresaId, cnpjLimpo);
    return { ok: true, wsUrl, empresaId, resposta: resp.substring(0, 300) };
  } catch (err) {
    return { ok: false, wsUrl, empresaId, erro: err.message };
  }
}

/**
 * Configura o ambiente no ACBrMonitor via WebSocket
 */
async function configurarAmbiente(config, ambiente, empresa) {
  const wsUrl = montarWsUrl(config);
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = empresa ? (empresa.cnpj || '').replace(/\D/g, '') : '';
  const acbrAmbiente = ambiente === 'producao' ? '1' : '2';
  const ambienteLabel = ambiente === 'producao' ? 'Produção' : 'Homologação';

  console.log(`[NFe-WS] ════════════════════════════════════════`);
  console.log(`[NFe-WS] Configurando ambiente: ${ambienteLabel} (${acbrAmbiente})`);
  console.log(`[NFe-WS] URL: ${wsUrl}`);
  console.log(`[NFe-WS] Empresa ID: ${empresaId || '(não configurado)'}, CNPJ: ${cnpjLimpo || '(não informado)'}`);
  console.log(`[NFe-WS] ════════════════════════════════════════`);

  try {
    const cmd = `NFe.SetAmbiente(${acbrAmbiente})`;
    const resp = await enviarComandoWS(cmd, wsUrl, 10000, null, empresaId, cnpjLimpo);
    console.log(`[NFe-WS] Resposta SetAmbiente: ${resp.substring(0, 200)}`);

    const upper = resp.toUpperCase();
    const ok = upper.includes('OK');

    if (ok) {
      console.log(`[NFe-WS] ✅ Ambiente configurado para ${ambienteLabel}`);
    } else {
      console.warn(`[NFe-WS] ⚠️ Resposta inesperada ao configurar ambiente: ${resp.substring(0, 200)}`);
    }

    return { ok, ambiente: ambienteLabel, resposta: resp.substring(0, 200) };
  } catch (err) {
    console.error(`[NFe-WS] ❌ Erro ao configurar ambiente: ${err.message}`);
    return { ok: false, ambiente: ambienteLabel, erro: err.message };
  }
}

/**
 * Gera o DANFE em PDF via ACBrMonitor WebSocket
 */
async function gerarDanfePdf(xmlContent, config, empresa) {
  const wsUrl = montarWsUrl(config);
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = empresa ? (empresa.cnpj || '').replace(/\D/g, '') : '';

  console.log(`[NFe-WS] ════════════════════════════════════════`);
  console.log(`[NFe-WS] Gerando DANFE PDF`);
  console.log(`[NFe-WS] URL: ${wsUrl}`);
  console.log(`[NFe-WS] Empresa ID: ${empresaId || '(não configurado)'}, CNPJ: ${cnpjLimpo || '(não informado)'}`);
  console.log(`[NFe-WS] XML length: ${xmlContent.length}`);
  console.log(`[NFe-WS] ════════════════════════════════════════`);

  try {
    // 1. Carregar o XML na memória do ACBr
    const xmlEscapado = xmlContent.replace(/"/g, '\\"');
    const cmdCarregar = `NFe.CarregarXML("${xmlEscapado}")`;
    const respCarregar = await enviarComandoWS(cmdCarregar, wsUrl, 15000, null, empresaId, cnpjLimpo);
    console.log(`[NFe-WS] Resposta CarregarXML: ${respCarregar.substring(0, 200)}`);

    // 2. Gerar o PDF do DANFE
    const cmdPdf = `NFe.ImprimirDANFEPDF`;
    const respPdf = await enviarComandoWS(cmdPdf, wsUrl, 30000, null, empresaId, cnpjLimpo);
    console.log(`[NFe-WS] Resposta ImprimirDANFEPDF: ${respPdf.substring(0, 300)}`);

    const upper = respPdf.toUpperCase();

    // Verificar se retornou erro
    if (upper.includes('ERRO:')) {
      const erroTexto = respPdf.replace(/^.*ERRO:\s*/i, '').trim();
      console.error(`[NFe-WS] ❌ Erro ao gerar PDF: ${erroTexto}`);
      return { ok: false, erro: erroTexto };
    }

    // A resposta pode conter o PDF em base64 após "OK:"
    // Ou pode conter o caminho do arquivo gerado
    const conteudo = respPdf.replace(/^.*OK:\s*/i, '').trim();

    // Verificar se é base64 (PDF começa com JVBERi0 em base64)
    if (conteudo.startsWith('JVBERi0') || conteudo.length > 1000) {
      console.log(`[NFe-WS] ✅ PDF recebido em base64 (${conteudo.length} chars)`);
      return { ok: true, pdfBase64: conteudo };
    }

    // Pode ser um caminho de arquivo
    if (conteudo.includes('.pdf') || conteudo.includes('\\') || conteudo.includes('/')) {
      console.log(`[NFe-WS] ✅ PDF salvo em: ${conteudo}`);
      return { ok: true, pdfPath: conteudo };
    }

    // Resposta OK genérica — PDF pode ter sido gerado no diretório padrão do ACBr
    console.log(`[NFe-WS] ⚠️ PDF gerado mas resposta não contém base64 nem caminho`);
    return { ok: true, resposta: conteudo.substring(0, 500) };
  } catch (err) {
    console.error(`[NFe-WS] ❌ Erro ao gerar DANFE PDF: ${err.message}`);
    return { ok: false, erro: err.message };
  }
}

/**
 * Salva o PDF do DANFE em um caminho específico via ACBrMonitor
 * Usa NFe.SalvarPDF que salva no caminho indicado
 */
async function salvarDanfePdf(xmlContent, caminhoDestino, config, empresa) {
  const wsUrl = montarWsUrl(config);
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = empresa ? (empresa.cnpj || '').replace(/\D/g, '') : '';

  try {
    // 1. Carregar o XML
    const xmlEscapado = xmlContent.replace(/"/g, '\\"');
    const cmdCarregar = `NFe.CarregarXML("${xmlEscapado}")`;
    await enviarComandoWS(cmdCarregar, wsUrl, 15000, null, empresaId, cnpjLimpo);

    // 2. Salvar PDF no caminho
    const caminhoEscapado = caminhoDestino.replace(/"/g, '\\"');
    const cmdSalvar = `NFe.SalvarPDF("${caminhoEscapado}")`;
    const resp = await enviarComandoWS(cmdSalvar, wsUrl, 30000, null, empresaId, cnpjLimpo);

    const upper = resp.toUpperCase();
    if (upper.includes('ERRO:')) {
      return { ok: false, erro: resp.replace(/^.*ERRO:\s*/i, '').trim() };
    }

    return { ok: true, caminho: caminhoDestino };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/**
 * Envia Carta de Correção (CC-e) via WebSocket ACBrMonitor
 * Usa o formato INI com [EVENTO] / [EVENTO001] e o comando NFe.EnviarEvento
 * 
 * @param {object} nfe - Dados da NFe {chave_acesso, numero}
 * @param {string} correcao - Texto da correção
 * @param {number} nSeqEvento - Número sequencial do evento (1, 2, 3...)
 * @param {object} empresa - Dados da empresa {cnpj, uf}
 * @param {object} config - Configurações
 * @param {string|null} callbackUrl - URL para o ACBr enviar PDF+XML do evento
 */
async function cartaCorrecao(nfe, correcao, nSeqEvento, empresa, config, callbackUrl = null) {
  const wsUrl = montarWsUrl(config);
  const timeout = (config.acbr_timeout || 60) * 1000;
  const empresaId = config.nfe_empresa_id || null;
  const cnpjLimpo = (empresa.cnpj || '').replace(/\D/g, '');

  if (!empresaId) {
    throw new Error('Empresa não configurada para emissão de NFe. Configure o "ID no Emissor NFe" em Configurações → Empresa.');
  }

  const ufEmitente = (empresa.uf || 'SP').toUpperCase();
  const cOrgao = CUF_MAP[ufEmitente] || '35';
  const correcaoSanitizada = sanitizarTextoNFe(correcao);
  const dhEvento = formatarDataHora(new Date().toISOString());

  console.log(`[NFe-WS] ════════════════════════════════════════`);
  console.log(`[NFe-WS] Carta de Correção NFe #${nfe.numero}`);
  console.log(`[NFe-WS] Chave: ${nfe.chave_acesso}`);
  console.log(`[NFe-WS] Empresa ID: ${empresaId}`);
  console.log(`[NFe-WS] Seq: ${nSeqEvento}`);
  console.log(`[NFe-WS] cOrgao: ${cOrgao} (${ufEmitente})`);
  console.log(`[NFe-WS] CNPJ: ${cnpjLimpo}`);
  console.log(`[NFe-WS] Correção: ${correcaoSanitizada.substring(0, 100)}`);
  console.log(`[NFe-WS] URL: ${wsUrl}`);
  console.log(`[NFe-WS] Callback: ${callbackUrl || '(nenhum)'}`);
  console.log(`[NFe-WS] ════════════════════════════════════════`);

  // ── Montar INI do Evento de Carta de Correção ─────────────────────────
  const iniEvento = [
  '[EVENTO]',
  'idLote=1',
  '',
  '[EVENTO001]',
  `cOrgao=${cOrgao}`,
  `CNPJ=${cnpjLimpo}`,
  `chNFe=${nfe.chave_acesso}`,
  `dhEvento=${dhEvento}`,
  `tpEvento=110110`,
  `nSeqEvento=${nSeqEvento}`,
  `versaoEvento=1.00`,
  `xCorrecao=${correcaoSanitizada}`].
  join('\n');

  console.log(`[NFe-WS] INI Evento CCe:\n${iniEvento}`);

  // ── Enviar via NFe.EnviarEvento ───────────────────────────────────────
  const iniEscapado = iniEvento.replace(/"/g, '\\"');
  const cmdCCe = `NFe.EnviarEvento("${iniEscapado}")`;

  const respCCe = await enviarComandoWS(cmdCCe, wsUrl, timeout, callbackUrl, empresaId, cnpjLimpo);

  // ── Parsear resposta ──────────────────────────────────────────────────
  let texto = respCCe;
  try {
    const parsed = JSON.parse(respCCe);
    if (parsed.OK) {
      const okContent = typeof parsed.OK === 'string' ? parsed.OK : parsed.OK.bruto || JSON.stringify(parsed.OK);
      const cStat = extrairCampoIni(okContent, 'cStat') || '';
      const xMotivo = extrairCampoIni(okContent, 'xMotivo') || '';
      const nProt = extrairCampoIni(okContent, 'nProt') || extrairCampoIni(okContent, 'Protocolo') || '';
      console.log(`[NFe-WS] ✅ CCe OK: cStat=${cStat} ${xMotivo}`);
      return { ok: true, resposta: okContent, cStat, xMotivo, protocolo: nProt };
    }
    if (parsed.ERRO) {
      const erroContent = typeof parsed.ERRO === 'string' ? parsed.ERRO : parsed.ERRO.bruto || parsed.ERRO.xMotivo || JSON.stringify(parsed.ERRO);
      const cStat = typeof parsed.ERRO === 'object' ? parsed.ERRO.cStat || '' : '';
      console.log(`[NFe-WS] ❌ CCe ERRO: ${erroContent.substring(0, 200)}`);
      return { ok: false, erro: erroContent, cStat };
    }
    if (parsed.bruto) texto = parsed.bruto;
  } catch {/* não é JSON */}

  const upper = texto.toUpperCase();
  const posOk = upper.indexOf('OK:');
  const posErro = upper.indexOf('ERRO:');

  if (posOk >= 0 && (posErro < 0 || posOk < posErro)) {
    const conteudo = texto.substring(posOk).replace(/^OK:\s*/i, '').trim();
    const cStat = extrairCampoIni(conteudo, 'cStat') || '';
    const xMotivo = extrairCampoIni(conteudo, 'xMotivo') || '';
    const nProt = extrairCampoIni(conteudo, 'nProt') || extrairCampoIni(conteudo, 'Protocolo') || '';

    // cStat 135 = Evento registrado e vinculado a NF-e
    // cStat 136 = Evento registrado, mas não vinculado a NF-e
    if (cStat && cStat !== '135' && cStat !== '136') {
      console.log(`[NFe-WS] ❌ CCe rejeitada: cStat=${cStat} ${xMotivo}`);
      return { ok: false, erro: xMotivo || `CCe rejeitada (cStat=${cStat})`, cStat };
    }

    console.log(`[NFe-WS] ✅ CCe OK — cStat=${cStat} ${xMotivo}`);
    return { ok: true, resposta: conteudo, cStat, xMotivo, protocolo: nProt };
  }

  if (posErro >= 0) {
    const erroTexto = texto.substring(posErro).replace(/^ERRO:\s*/i, '').trim();
    return { ok: false, erro: erroTexto };
  }

  // Verificar sucesso pelo conteúdo
  if (upper.includes('REGISTRADO') || upper.includes('135') || upper.includes('136')) {
    return { ok: true, resposta: texto };
  }

  return { ok: false, erro: `Resposta inesperada: ${texto.substring(0, 200)}` };
}

module.exports = { emitir, cancelar, testarConexao, montarWsUrl, montarIniNFe, configurarAmbiente, gerarDanfePdf, salvarDanfePdf, cartaCorrecao };