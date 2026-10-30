// ==================== NFS-e DA ASSINATURA — API "APROVADOR" ====================
// Mesmo contrato do provedor Aprovador do outro app (nfseAprovadorApi.js):
//
//   POST {NFSE_API_URL}/api/empresas/{NFSE_API_EMPRESA_ID}/nfse
//        Authorization: Bearer <token> · Idempotency-Key: <chave>
//        corpo = { numeroDps, dataEmissao, dataCompetencia, tomador, servico,
//                  valores, configuracao, informacoesComplementares }
//   GET  {NFSE_API_URL}/api/nfse/{id}             → situação (status 3 = autorizada)
//   GET  {NFSE_API_URL}/api/nfse/{id}/danfse.pdf  → DANFSe
//
// O PRESTADOR é a empresa dona da plataforma (cadastrada na API com o
// certificado A1); o TOMADOR é a clínica. Toda a configuração fiscal do
// prestador vem do server/.env.local — a API não completa nada sozinha:
//
//   NFSE_API_URL, NFSE_API_EMPRESA_ID, NFSE_API_TOKEN (ou _HOMOLOGACAO/_PRODUCAO)
//   NFSE_AMBIENTE=homologacao|producao
//   NFSE_PADRAO=1 (Nacional) | 2 (ABRASF) | 3 (Osasco eGoverneISS)
//   NFSE_SERIE_DPS=1
//   NFSE_OP_SIMP_NAC=1 não optante | 2 MEI | 3 ME/EPP
//   NFSE_REG_AP_TRIB_SN=1   NFSE_REG_ESP_TRIB=0
//   NFSE_CODIGO_MUNICIPIO=<IBGE 7 dígitos do prestador>
//   NFSE_INSCRICAO_MUNICIPAL=<IM do prestador>
//   NFSE_ITEM_LISTA_SERVICO=1.03   NFSE_COD_TRIB_NACIONAL=010301
//   NFSE_CODIGO_TRIBUTACAO_MUNICIPAL=1.03 (Osasco/ABRASF)  NFSE_CNAE=6311900
//   NFSE_CODIGO_NBS=  NFSE_ALIQUOTA_ISS=2  NFSE_TRIBUTACAO_ISSQN=1
//   NFSE_OSASCO_CHAVE=  (padrão 3)
//   NFSE_ABRASF_URL= NFSE_ABRASF_URL_PRODUCAO= NFSE_ABRASF_VERSAO= NFSE_ABRASF_USUARIO= NFSE_ABRASF_SENHA= (padrão 2)
//   NFSE_PRESTADOR_LOGRADOURO/NUMERO/BAIRRO/CIDADE/UF/CEP (endereço da prestação — exigido no padrão 3)
//
// ⭐ A numeração da DPS é DESTE app, por ambiente, em configuracoes_globais
// (nfse_assinatura_dps_homologacao / _producao). Toda tentativa que chegou à
// API consome o número, exceto falha de token (a API nem olhou a nota).

const crypto = require('crypto');
const dbGlobal = require('../databaseGlobal');
const { requisitar, motivoErro } = require('./httpJson');

const TIMEOUT_EMISSAO = 120000;

const env = (nome, padrao = '') => String(process.env[nome] ?? padrao).trim();
const digitos = (v) => String(v || '').replace(/\D/g, '');
const inteiro = (v, padrao) => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : padrao;
};
function comValor(alvo, chave, valor) {
  const v = typeof valor === 'string' ? valor.trim() : valor;
  if (v === '' || v === null || v === undefined) return;
  alvo[chave] = v;
}

function ambiente() {
  return env('NFSE_AMBIENTE', 'homologacao').toLowerCase() === 'producao' ? 'producao' : 'homologacao';
}
function baseUrl() {
  return env('NFSE_API_URL', 'https://nfe-api.sky9.com.br').replace(/\/+$/, '');
}
function token(amb = ambiente()) {
  const s = amb === 'producao' ? 'PRODUCAO' : 'HOMOLOGACAO';
  return env(`NFSE_API_TOKEN_${s}`) || env('NFSE_API_TOKEN');
}
function empresaId() {
  return env('NFSE_API_EMPRESA_ID');
}
function padrao() {
  const p = inteiro(env('NFSE_PADRAO'), 1);
  return [1, 2, 3].includes(p) ? p : 1;
}
const NOME_PADRAO = { 1: 'Nacional (SEFIN)', 2: 'ABRASF', 3: 'Osasco — eGoverneISS' };

function cabecalhos(chaveIdempotencia) {
  const h = { Authorization: `Bearer ${token()}` };
  if (chaveIdempotencia) h['Idempotency-Key'] = chaveIdempotencia;
  return h;
}

function itemListaNormalizado(valor) {
  const v = String(valor || '').trim();
  const comPonto = v.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (comPonto) return `${comPonto[1].padStart(2, '0')}.${comPonto[2].padStart(2, '0')}`;
  const d = digitos(v);
  if (d.length === 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length === 3) return `0${d[0]}.${d.slice(1)}`;
  return '';
}
function codigoTributacaoNacional() {
  const explicito = digitos(env('NFSE_COD_TRIB_NACIONAL'));
  if (explicito.length === 6) return explicito;
  const item = itemListaNormalizado(env('NFSE_ITEM_LISTA_SERVICO') || env('NFSE_CODIGO_SERVICO'));
  return item ? `${item.replace('.', '')}01` : '';
}
function urlWebservice() {
  const homolog = env('NFSE_ABRASF_URL');
  return ambiente() === 'producao' ? env('NFSE_ABRASF_URL_PRODUCAO') || homolog : homolog;
}

/** `2026-09-02T10:15:00-03:00` */
function dataComFuso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${off >= 0 ? '+' : '-'}${p(Math.floor(abs / 60))}:${p(abs % 60)}`);

}

/** A competência é o último dia do mês faturado — nunca posterior à emissão. */
function competenciaFiscal(competencia) {
  const hoje = dataComFuso().slice(0, 10);
  const [ano, mes] = String(competencia || '').split('-').map(Number);
  if (!ano || !mes) return hoje;
  const ultimo = new Date(ano, mes, 0);
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`;
  return iso > hoje ? hoje : iso;
}

function configurado() {
  return Boolean(baseUrl() && empresaId() && token());
}

function resumoConfig() {
  return {
    provedor: 'aprovador',
    padrao: padrao(),
    padraoNome: NOME_PADRAO[padrao()],
    serie: env('NFSE_SERIE_DPS', '1'),
    empresaId: empresaId() || null,
    codigoMunicipio: digitos(env('NFSE_CODIGO_MUNICIPIO')) || null,
    inscricaoMunicipal: env('NFSE_INSCRICAO_MUNICIPAL') || null,
    codigoTributacaoNacional: codigoTributacaoNacional() || null,
    pendencias: problemasDeConfiguracao()
  };
}

/** O que falta no .env.local para emitir — conferido antes de gastar DPS. */
function problemasDeConfiguracao() {
  const p = [];
  if (!empresaId()) p.push('NFSE_API_EMPRESA_ID (ID do emissor na API)');
  if (!token()) p.push(`NFSE_API_TOKEN_${ambiente() === 'producao' ? 'PRODUCAO' : 'HOMOLOGACAO'} (token da API)`);
  if (digitos(env('NFSE_CODIGO_MUNICIPIO')).length !== 7) p.push('NFSE_CODIGO_MUNICIPIO (IBGE, 7 dígitos)');
  if (!digitos(env('NFSE_INSCRICAO_MUNICIPAL'))) p.push('NFSE_INSCRICAO_MUNICIPAL');
  if (codigoTributacaoNacional().length !== 6) p.push('NFSE_COD_TRIB_NACIONAL (6 dígitos) ou NFSE_ITEM_LISTA_SERVICO');
  if (!/^[A-Za-z0-9]{1,5}$/.test(env('NFSE_SERIE_DPS', '1'))) p.push('NFSE_SERIE_DPS (até 5 caracteres)');
  if (padrao() === 1 && digitos(env('NFSE_CODIGO_MUNICIPIO')) === '3534401') {
    p.push('NFSE_PADRAO: Osasco não usa o emissor nacional (rejeição E0039) — use NFSE_PADRAO=3');
  }
  if (padrao() === 3 && !env('NFSE_OSASCO_CHAVE')) p.push('NFSE_OSASCO_CHAVE (padrão 3)');
  if (padrao() === 2 && !urlWebservice()) p.push('NFSE_ABRASF_URL (padrão 2)');
  if (padrao() !== 1 && !(Number(env('NFSE_ALIQUOTA_ISS')) > 0)) p.push('NFSE_ALIQUOTA_ISS (a prefeitura exige)');
  return p;
}

function montarPayload({ fatura, clinica, documento, discriminacao }) {
  const pd = padrao();
  const municipio = digitos(env('NFSE_CODIGO_MUNICIPIO'));

  const tomador = {};
  comValor(tomador, 'documento', documento);
  comValor(tomador, 'nome', clinica.nome);
  comValor(tomador, 'email', clinica.email);
  comValor(tomador, 'logradouro', clinica.logradouro || clinica.endereco);
  comValor(tomador, 'numero', clinica.numero);
  comValor(tomador, 'bairro', clinica.bairro);
  comValor(tomador, 'cep', digitos(clinica.cep));
  comValor(tomador, 'codigoMunicipio', digitos(clinica.codigoIbge || clinica.codigo_ibge));
  comValor(tomador, 'cidade', clinica.cidade);
  comValor(tomador, 'nomeMunicipio', clinica.cidade);
  comValor(tomador, 'uf', String(clinica.uf || '').toUpperCase());

  const servico = {};
  comValor(servico, 'codigoMunicipioPrestacao', municipio);
  comValor(servico, 'codigoTributacaoNacional', codigoTributacaoNacional());
  const codMun = env('NFSE_CODIGO_TRIBUTACAO_MUNICIPAL');
  // No Nacional, cTribMun só vale com 3 dígitos — "1.03" causa E0314
  if (pd !== 1 || /^\d{3}$/.test(codMun)) comValor(servico, 'codigoTributacaoMunicipal', codMun);
  comValor(servico, 'codigoNbs', env('NFSE_CODIGO_NBS'));
  comValor(servico, 'descricao', discriminacao.slice(0, 2000));
  comValor(servico, 'itemListaServico', itemListaNormalizado(env('NFSE_ITEM_LISTA_SERVICO') || env('NFSE_CODIGO_SERVICO')));
  comValor(servico, 'cnae', digitos(env('NFSE_CNAE')));
  if (pd === 3) {
    comValor(servico, 'enderecoPrestacaoServico', env('NFSE_PRESTADOR_LOGRADOURO'));
    comValor(servico, 'numeroPrestacaoServico', env('NFSE_PRESTADOR_NUMERO'));
    comValor(servico, 'bairroPrestacaoServico', env('NFSE_PRESTADOR_BAIRRO'));
    comValor(servico, 'cidadePrestacaoServico', env('NFSE_PRESTADOR_CIDADE'));
    comValor(servico, 'estadoPrestacaoServico', env('NFSE_PRESTADOR_UF'));
    comValor(servico, 'cepPrestacaoServico', digitos(env('NFSE_PRESTADOR_CEP')));
    comValor(servico, 'codigoCidadeIBGEPrestacaoServico', municipio);
    comValor(servico, 'paisPrestacaoServico', 'BRASIL');
  }

  const valorServico = Math.round(Number(fatura.valorTotal) * 100) / 100;
  const aliquota = Number(env('NFSE_ALIQUOTA_ISS')) || 0;
  const tributacao = inteiro(env('NFSE_TRIBUTACAO_ISSQN'), 1);
  const valores = {
    valorServico,
    tributacaoIssqn: [1, 2, 3, 4].includes(tributacao) ? tributacao : 1,
    retencaoIssqn: 1
  };
  // Nacional: em operação tributável, <pAliq> é rejeitado (E1235) — quem
  // aplica a alíquota é o SEFIN. Osasco/ABRASF exigem alíquota e ISS.
  if (pd !== 1 && aliquota > 0) {
    valores.aliquotaIss = aliquota;
    valores.valorIss = Math.round(valorServico * aliquota) / 100;
  }

  const opSimpNac = inteiro(env('NFSE_OP_SIMP_NAC'), 1);
  const configuracao = {
    padrao: pd,
    ambiente: ambiente() === 'producao' ? 1 : 2,
    serie: env('NFSE_SERIE_DPS', '1'),
    opSimpNac: [1, 2, 3].includes(opSimpNac) ? opSimpNac : 1,
    regEspTrib: inteiro(env('NFSE_REG_ESP_TRIB'), 0),
    codigoMunicipioEmissao: municipio,
    inscricaoMunicipal: digitos(env('NFSE_INSCRICAO_MUNICIPAL'))
  };
  if (configuracao.opSimpNac === 3) configuracao.regApTribSN = inteiro(env('NFSE_REG_AP_TRIB_SN'), 1);
  if (pd === 3) configuracao.osascoChaveAutenticacao = env('NFSE_OSASCO_CHAVE');
  if (pd === 2) {
    configuracao.abrasfUrl = urlWebservice();
    comValor(configuracao, 'abrasfVersao', env('NFSE_ABRASF_VERSAO'));
    comValor(configuracao, 'abrasfUsuario', env('NFSE_ABRASF_USUARIO'));
    configuracao.abrasfSenha = env('NFSE_ABRASF_SENHA');
  }

  const payload = {
    dataEmissao: dataComFuso(),
    dataCompetencia: competenciaFiscal(fatura.competencia),
    tomador,
    servico,
    valores,
    configuracao
  };
  comValor(payload, 'informacoesComplementares', `Fatura ${fatura.id}`);
  return payload;
}

/** Exigências do tomador conforme o padrão — devolvidas em português */
function problemasDoTomador(payload) {
  const t = payload.tomador;
  const p = [];
  if (![11, 14].includes(String(t.documento || '').length)) p.push('CNPJ/CPF da clínica');
  if (t.cep && t.cep.length !== 8) p.push('CEP da clínica (8 dígitos)');
  if (padrao() !== 1) {
    if (!t.logradouro) p.push('endereço da clínica');
    if (!t.numero) p.push('número do endereço da clínica');
    if (!t.bairro) p.push('bairro da clínica');
    if (!t.codigoMunicipio) p.push('código IBGE da cidade da clínica');
  }
  return p;
}

// ─── Numeração da DPS ────────────────────────────────────────────────────────

const chaveDps = (amb) => `nfse_assinatura_dps_${amb}`;
let filaDps = Promise.resolve();

async function lerDps(amb) {
  const row = await dbGlobal.
  prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
  get(chaveDps(amb)).
  catch(() => null);
  const n = inteiro(row && String(row.valor).replace(/"/g, ''), 0);
  if (n > 0) return n;
  return inteiro(env(`NFSE_DPS_INICIAL_${amb === 'producao' ? 'PRODUCAO' : 'HOMOLOGACAO'}`), 1);
}

async function gravarDps(amb, numero) {
  const agora = new Date().toISOString();
  const upd = await dbGlobal.
  prepare('UPDATE configuracoes_globais SET valor = ?, atualizadoEm = ? WHERE chave = ?').
  run(String(numero), agora, chaveDps(amb));
  if (!upd || (upd.changes ?? upd.affectedRows) === 0) {
    await dbGlobal.
    prepare('INSERT INTO configuracoes_globais (id, chave, valor, atualizadoEm) VALUES (?, ?, ?, ?)').
    run(`cfg${Date.now()}${Math.floor(Math.random() * 1000)}`, chaveDps(amb), String(numero), agora);
  }
}

/** Uma emissão por vez: duas faturas nunca usam a mesma DPS. */
function comTrava(fn) {
  const atual = filaDps.catch(() => {}).then(fn);
  filaDps = atual.catch(() => {});
  return atual;
}

function autorizado(dados) {
  if (!dados) return false;
  if (Number(dados.status) === 3) return true;
  return /^autorizad/i.test(String(dados.status || '')) || /^autorizad/i.test(String(dados.statusDescricao || ''));
}

function linkDe(doc) {
  const v = String(
    doc.link || doc.Link || doc.url || doc.linkNfse || doc.linkNotaFiscal ||
    doc.notaFiscalGerada && doc.notaFiscalGerada.link || ''
  ).trim();
  return /^https?:\/\//i.test(v) ? v : '';
}

/** Situação de uma DPS já enviada (para não emitir duas vezes) */
async function consultarDocumento(id) {
  if (!id) return null;
  try {
    const r = await requisitar(`${baseUrl()}/api/nfse/${encodeURIComponent(id)}`, {
      headers: cabecalhos(),
      timeoutMs: 20000
    });
    return r.ok ? r.dados : null;
  } catch {
    return null;
  }
}

async function testarConexao() {
  const pend = problemasDeConfiguracao();
  const r = await requisitar(`${baseUrl()}/api/empresas/${encodeURIComponent(empresaId())}`, {
    headers: cabecalhos(),
    timeoutMs: 15000
  });
  if (r.status === 401 || r.status === 403) throw new Error('Token recusado pela API (401/403). Confira NFSE_API_TOKEN.');
  if (r.status === 404) throw new Error(`O emissor ${empresaId()} não existe na API ${baseUrl()}.`);
  if (!r.ok) throw new Error(motivoErro(r));
  const ativa = r.dados && r.dados.ativa !== false;
  return {
    ambiente: ambiente(),
    padrao: NOME_PADRAO[padrao()],
    emissor: r.dados && (r.dados.razaoSocial || r.dados.nome) || empresaId(),
    emissorAtivo: ativa,
    proximaDps: await lerDps(ambiente()),
    pendencias: pend
  };
}

/**
 * Emite a NFS-e. `apiIdAnterior` = documento de uma tentativa anterior desta
 * fatura: se já estiver autorizado, é reaproveitado (nunca duas notas).
 * @returns {{ ok, numero?, link?, chaveAcesso?, documentoId?, erro?, rejeitada? }}
 */
async function emitir({ fatura, clinica, documento, discriminacao, apiIdAnterior }) {
  const pend = problemasDeConfiguracao();
  if (pend.length) {
    return { ok: false, erro: `Configuração da NFS-e incompleta no server/.env.local: ${pend.join('; ')}.` };
  }

  if (apiIdAnterior) {
    const doc = await consultarDocumento(apiIdAnterior);
    if (autorizado(doc)) {
      return {
        ok: true,
        numero: String(doc.numeroNfse || doc.numeroDps || ''),
        link: linkDe(doc),
        chaveAcesso: doc.chaveAcesso || null,
        documentoId: apiIdAnterior,
        reaproveitada: true
      };
    }
  }

  const payload = montarPayload({ fatura, clinica, documento, discriminacao });
  const faltaTomador = problemasDoTomador(payload);
  if (faltaTomador.length) {
    return { ok: false, erro: `Falta no cadastro da clínica: ${faltaTomador.join(', ')}.`, pendenteDados: true };
  }

  const amb = ambiente();
  const caminho = `/api/empresas/${encodeURIComponent(empresaId())}/nfse`;

  return comTrava(async () => {
    const numeroDps = await lerDps(amb);
    payload.numeroDps = numeroDps;
    const chave = `assinatura-${fatura.id}-${amb}-${numeroDps}-${crypto.randomUUID()}`;
    let resposta;
    try {
      resposta = await requisitar(`${baseUrl()}${caminho}`, {
        method: 'POST',
        headers: cabecalhos(chave),
        body: payload,
        timeoutMs: TIMEOUT_EMISSAO
      });
    } catch (err) {
      // Sem resposta não se sabe se a API usou o número: avança por segurança
      await gravarDps(amb, numeroDps + 1);
      return { ok: false, erro: `Sem resposta da API de NFS-e: ${err.message}` };
    }
    if (resposta.status === 401 || resposta.status === 403) {
      return { ok: false, erro: 'Token da API de NFS-e recusado (401/403). Confira NFSE_API_TOKEN no server/.env.local.' };
    }
    await gravarDps(amb, numeroDps + 1);

    let doc = resposta.dados || {};
    if (!autorizado(doc) && doc.id) {
      // Confere a situação real antes de dar como recusada
      const conferido = await consultarDocumento(doc.id);
      if (autorizado(conferido)) doc = { ...doc, ...conferido };
    }
    if (!autorizado(doc)) {
      const partes = [doc.erro, ...(Array.isArray(doc.erros) ? doc.erros : []), doc.motivoRetorno, doc.detail, doc.message].
      filter((v) => typeof v === 'string' && v.trim());
      const motivo = partes.length ? [...new Set(partes)].join(' — ') : motivoErro(resposta);
      console.error(`🧾 ❌ [NFS-e Aprovador] DPS ${numeroDps} não autorizada (HTTP ${resposta.status}): ${motivo}`);
      return { ok: false, erro: motivo, rejeitada: resposta.status === 422 || Boolean(doc.id), documentoId: doc.id || null };
    }
    console.log(`🧾 ✅ [NFS-e Aprovador] DPS ${numeroDps} → NFS-e ${doc.numeroNfse || '?'} (${amb})`);
    return {
      ok: true,
      numero: String(doc.numeroNfse || doc.numeroDps || ''),
      link: linkDe(doc),
      chaveAcesso: doc.chaveAcesso || null,
      documentoId: doc.id || null
    };
  });
}

module.exports = {
  configurado,
  resumoConfig,
  problemasDeConfiguracao,
  testarConexao,
  emitir,
  NOME_PADRAO
};