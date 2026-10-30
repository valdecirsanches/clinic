// ==================== NFS-e DA ASSINATURA (API nfe-api.sky9.com.br) ====================
// Emite a nota do serviço prestado à CLÍNICA (tomador) quando a fatura da
// assinatura é paga. Configuração FIXA no server/.env.local:
//
//   NFSE_API_URL=https://nfe-api.sky9.com.br
//   NFSE_AMBIENTE=homologacao            (homologacao | producao)
//   NFSE_API_TOKEN_HOMOLOGACAO=<JWT da empresa emissora em homologação>
//   NFSE_API_TOKEN_PRODUCAO=<JWT da empresa emissora em produção>
//     — ou, em vez do token fixo, login automático:
//   NFSE_API_EMAIL_HOMOLOGACAO / NFSE_API_SENHA_HOMOLOGACAO
//   NFSE_API_EMAIL_PRODUCAO / NFSE_API_SENHA_PRODUCAO
//   NFSE_API_LOGIN_PATH=/api/auth/login  (opcional)
//   NFSE_EMITIR_AO_PAGAR=true
//   NFSE_CODIGO_SERVICO=1.03             (opcional; a API usa o da empresa se vazio)
//   NFSE_ALIQUOTA_ISS=2                  (opcional; a API recalcula pela config da empresa)
//   NFSE_DISCRIMINACAO=Licença de uso do sistema EasyClin — competência {competencia} — fatura {fatura}
//
// Contrato da API (server/routes/nfse.js da nfe-api):
//   POST /api/nfse              → cria a NFS-e pendente  → { id, numero, ... }
//   POST /api/nfse/:id/emitir   → autoriza               → { numero, codigoVerificacao, link, chaveAcesso }
//                                 422 { error, motivo }  → rejeitada
//                                 503 { error, detalhe } → falha de comunicação
//   Autenticação: Bearer (authenticateToken); a empresa vem do próprio token.
//
// ⭐ Uma fatura NUNCA gera duas notas: o id da NFS-e criada na API é gravado
// na fatura ANTES de emitir. Repetir a emissão reaproveita esse id — e a
// própria API devolve a nota já autorizada em vez de transmitir de novo.

const dbGlobal = require('../databaseGlobal');
const { requisitar, motivoErro, marcarSegredo } = require('./httpJson');
const calculo = require('./assinaturaCalculo');

const aprovador = require('./nfseAprovadorAssinatura');

const tokensEmCache = {};

/**
 * Provedor: "aprovador" (contrato /api/empresas/{id}/nfse, o mesmo do outro
 * app) ou "sky9" (POST /api/nfse + /emitir). Sem NFSE_PROVEDOR, usa o
 * Aprovador sempre que NFSE_API_EMPRESA_ID estiver definido.
 */
function provedor() {
  const p = String(process.env.NFSE_PROVEDOR || '').trim().toLowerCase();
  if (p === 'aprovador' || p === 'sky9') return p;
  return process.env.NFSE_API_EMPRESA_ID ? 'aprovador' : 'sky9';
}

function ambienteAtual() {
  return String(process.env.NFSE_AMBIENTE || 'homologacao').toLowerCase() === 'producao' ?
  'producao' :
  'homologacao';
}

function sufixo(amb) {
  return amb === 'producao' ? 'PRODUCAO' : 'HOMOLOGACAO';
}

function baseUrl() {
  return String(process.env.NFSE_API_URL || 'https://nfe-api.sky9.com.br').trim().replace(/\/+$/, '');
}

function credenciais(amb) {
  const s = sufixo(amb);
  return {
    token: String(process.env[`NFSE_API_TOKEN_${s}`] || process.env.NFSE_API_TOKEN || '').trim(),
    email: String(process.env[`NFSE_API_EMAIL_${s}`] || process.env.NFSE_API_EMAIL || '').trim(),
    senha: String(process.env[`NFSE_API_SENHA_${s}`] || process.env.NFSE_API_SENHA || '').trim()
  };
}

function emitirAoPagar() {
  return String(process.env.NFSE_EMITIR_AO_PAGAR || 'true').toLowerCase() !== 'false';
}

function configurado(amb = ambienteAtual()) {
  if (provedor() === 'aprovador') return aprovador.configurado();
  const c = credenciais(amb);
  return Boolean(c.token || c.email && c.senha);
}

function resumoConfig() {
  const amb = ambienteAtual();
  const porAmbiente = {};
  for (const a of ['homologacao', 'producao']) {
    const c = credenciais(a);
    porAmbiente[a] = {
      token: marcarSegredo(c.token),
      login: c.email ? { email: c.email, senha: marcarSegredo(c.senha) } : null,
      configurado: configurado(a)
    };
  }
  return {
    provedor: provedor(),
    aprovador: provedor() === 'aprovador' ? aprovador.resumoConfig() : null,
    url: baseUrl(),
    ambiente: amb,
    configurado: configurado(amb),
    emitirAoPagar: emitirAoPagar(),
    codigoServico: process.env.NFSE_CODIGO_SERVICO || null,
    aliquotaIss: process.env.NFSE_ALIQUOTA_ISS ? Number(process.env.NFSE_ALIQUOTA_ISS) : null,
    discriminacao: modeloDiscriminacao(),
    porAmbiente
  };
}

function modeloDiscriminacao() {
  return (
    process.env.NFSE_DISCRIMINACAO ||
    'Licença de uso do sistema de gestão clínica — competência {competencia} — fatura {fatura}');

}

async function obterToken(amb) {
  const c = credenciais(amb);
  if (c.token) return c.token;
  if (!c.email || !c.senha) {
    throw new Error(
      `API de NFS-e sem credencial para ${amb}: defina NFSE_API_TOKEN_${sufixo(amb)} no server/.env.local`
    );
  }
  const cache = tokensEmCache[amb];
  if (cache && cache.expira > Date.now()) return cache.token;

  const caminho = process.env.NFSE_API_LOGIN_PATH || '/api/auth/login';
  const resposta = await requisitar(`${baseUrl()}${caminho}`, {
    method: 'POST',
    body: { email: c.email, senha: c.senha, password: c.senha },
    timeoutMs: 15000
  });
  const d = resposta.dados || {};
  const token = d.token || d.accessToken || d.access_token || d.data && d.data.token;
  if (!resposta.ok || !token) {
    throw new Error(`Login na API de NFS-e recusado: ${motivoErro(resposta)}`);
  }
  tokensEmCache[amb] = { token, expira: Date.now() + 6 * 3600 * 1000 };
  return token;
}

async function chamarApi(amb, caminho, opcoes = {}) {
  const token = await obterToken(amb);
  const headers = { Authorization: `Bearer ${token}` };
  if (process.env.NFSE_API_EMPRESA_ID) headers['X-Empresa-Id'] = process.env.NFSE_API_EMPRESA_ID;
  const resposta = await requisitar(`${baseUrl()}${caminho}`, {
    ...opcoes,
    headers,
    timeoutMs: opcoes.timeoutMs || 60000
  });
  if (resposta.status === 401 || resposta.status === 403) {
    delete tokensEmCache[amb];
  }
  return resposta;
}

/** Testa a conexão listando 1 nota */
async function testarConexao() {
  if (provedor() === 'aprovador') return aprovador.testarConexao();
  const amb = ambienteAtual();
  const resposta = await chamarApi(amb, '/api/nfse?limit=1&todos=true', { timeoutMs: 15000 });
  if (!resposta.ok) throw new Error(motivoErro(resposta));
  return { ambiente: amb, totalNotas: resposta.dados && resposta.dados.total || 0 };
}

async function atualizarFatura(faturaId, campos) {
  const chaves = Object.keys(campos);
  if (!chaves.length) return;
  await dbGlobal.
  prepare(`UPDATE assinatura_faturas SET ${chaves.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).
  run(...chaves.map((c) => campos[c]), faturaId);
}

/** Dados do tomador (clínica) — nada é inventado; lista o que falta */
async function tomadorDaClinica(clinicaId) {
  const c = await dbGlobal.
  prepare('SELECT * FROM clinicas WHERE id = ?').
  get(clinicaId);
  if (!c) return { faltando: ['Cadastro da clínica'] };
  const faltando = [];
  const doc = String(c.cnpj || '').replace(/\D/g, '');
  if (!c.nome) faltando.push('razão social');
  if (doc.length !== 14 && doc.length !== 11) faltando.push('CNPJ');
  if (!c.email) faltando.push('e-mail');
  if (!c.logradouro && !c.endereco) faltando.push('endereço');
  if (!c.bairro) faltando.push('bairro');
  if (!c.cidade) faltando.push('cidade');
  if (!c.uf) faltando.push('UF');
  if (String(c.cep || '').replace(/\D/g, '').length !== 8) faltando.push('CEP');
  return { clinica: c, documento: doc, faltando };
}

function textoDiscriminacao(fatura, clinicaNome) {
  const [ano, mes] = String(fatura.competencia).split('-');
  const itens = (calculo.lerJson(fatura.itens, []) || []).
  map((i) => `${i.nome}: R$ ${Number(i.valor).toFixed(2).replace('.', ',')}`).
  join('; ');
  const base = modeloDiscriminacao().
  replace(/\{competencia\}/g, `${mes}/${ano}`).
  replace(/\{fatura\}/g, fatura.id).
  replace(/\{clinica\}/g, clinicaNome || '');
  return `${base}${itens ? `. Itens: ${itens}` : ''}`.slice(0, 1900);
}

/**
 * Emite a NFS-e de uma fatura PAGA. Nunca lança: o resultado fica gravado na
 * própria fatura (nfseStatus/nfseErro) e é devolvido.
 */
async function emitirNfseDaFatura(faturaId) {
  await calculo.garantirTabelas();
  const fatura = await calculo.buscarFaturaBruta(faturaId);
  if (!fatura) return { ok: false, erro: 'Fatura não encontrada' };
  if (fatura.status !== 'paga') {
    return { ok: false, erro: 'A NFS-e só é emitida para fatura paga.' };
  }
  if (fatura.nfseStatus === 'autorizada') {
    return { ok: true, jaAutorizada: true, numero: fatura.nfseNumero, link: fatura.nfseLink };
  }

  const amb = fatura.nfseAmbiente || ambienteAtual();
  if (!configurado(amb)) {
    const erro = `API de NFS-e não configurada para ${amb} (server/.env.local).`;
    await atualizarFatura(faturaId, { nfseStatus: 'erro', nfseErro: erro, nfseAmbiente: amb });
    return { ok: false, erro };
  }

  const { clinica, documento, faltando } = await tomadorDaClinica(fatura.clinicaId);
  if (faltando.length) {
    const erro = `Falta no cadastro da clínica: ${faltando.join(', ')}. Corrija em Administração → Clínicas e reemita.`;
    await atualizarFatura(faturaId, { nfseStatus: 'pendente_dados', nfseErro: erro, nfseAmbiente: amb });
    return { ok: false, erro };
  }

  await atualizarFatura(faturaId, { nfseStatus: 'processando', nfseErro: null, nfseAmbiente: amb });

  if (provedor() === 'aprovador') {
    try {
      const r = await aprovador.emitir({
        fatura,
        clinica,
        documento,
        discriminacao: textoDiscriminacao(fatura, clinica.nome),
        apiIdAnterior: fatura.nfseApiId || null
      });
      if (!r.ok) {
        const status = r.pendenteDados ? 'pendente_dados' : r.rejeitada ? 'rejeitada' : 'erro';
        await atualizarFatura(faturaId, {
          nfseStatus: status,
          nfseErro: r.erro,
          ...(r.documentoId ? { nfseApiId: String(r.documentoId) } : {})
        });
        return { ok: false, erro: r.erro, status };
      }
      await atualizarFatura(faturaId, {
        nfseStatus: 'autorizada',
        nfseApiId: r.documentoId ? String(r.documentoId) : fatura.nfseApiId || null,
        nfseNumero: r.numero || null,
        nfseLink: r.link || null,
        nfseErro: null,
        nfseEmitidaEm: new Date().toISOString()
      });
      return { ok: true, numero: r.numero, link: r.link || null };
    } catch (err) {
      console.error(`🧾 ❌ [NFS-e] Fatura ${faturaId}: ${err.message}`);
      await atualizarFatura(faturaId, { nfseStatus: 'erro', nfseErro: err.message }).catch(() => {});
      return { ok: false, erro: err.message };
    }
  }

  try {
    let apiId = fatura.nfseApiId;
    if (!apiId) {
      const corpo = {
        tomadorNome: clinica.nome,
        tomadorCpfCnpj: documento,
        tomadorEmail: clinica.email,
        discriminacaoServico: textoDiscriminacao(fatura, clinica.nome),
        valorServico: Number(fatura.valorTotal),
        dataEmissao: new Date().toISOString(),
        dataVencimento: fatura.vencimento || null
      };
      if (process.env.NFSE_CODIGO_SERVICO) corpo.codigoServico = process.env.NFSE_CODIGO_SERVICO;
      if (process.env.NFSE_ALIQUOTA_ISS) corpo.aliquotaIss = Number(process.env.NFSE_ALIQUOTA_ISS);

      const criada = await chamarApi(amb, '/api/nfse', { method: 'POST', body: corpo });
      if (!criada.ok || !criada.dados || !criada.dados.id) {
        throw new Error(`Criação da NFS-e recusada: ${motivoErro(criada)}`);
      }
      apiId = String(criada.dados.id);
      // Gravado ANTES de emitir: uma nova tentativa reaproveita esta nota
      await atualizarFatura(faturaId, { nfseApiId: apiId });
    }

    const emitida = await chamarApi(amb, `/api/nfse/${encodeURIComponent(apiId)}/emitir`, {
      method: 'POST',
      body: {},
      timeoutMs: 90000
    });

    if (!emitida.ok) {
      const motivo = motivoErro(emitida);
      const status = emitida.status === 422 ? 'rejeitada' : 'erro';
      await atualizarFatura(faturaId, { nfseStatus: status, nfseErro: motivo });
      return { ok: false, erro: motivo, status };
    }

    const d = emitida.dados || {};
    await atualizarFatura(faturaId, {
      nfseStatus: 'autorizada',
      nfseNumero: d.numero ? String(d.numero) : null,
      nfseLink: d.link || null,
      nfseErro: null,
      nfseEmitidaEm: new Date().toISOString()
    });
    console.log(`🧾 ✅ [NFS-e] Fatura ${faturaId} → NFS-e nº ${d.numero} (${amb})`);
    return { ok: true, numero: d.numero, link: d.link || null };
  } catch (err) {
    console.error(`🧾 ❌ [NFS-e] Fatura ${faturaId}: ${err.message}`);
    await atualizarFatura(faturaId, { nfseStatus: 'erro', nfseErro: err.message }).catch(() => {});
    return { ok: false, erro: err.message };
  }
}

module.exports = {
  provedor,
  ambienteAtual,
  configurado,
  emitirAoPagar,
  resumoConfig,
  testarConexao,
  emitirNfseDaFatura,
  tomadorDaClinica
};