// ==================== REQUISIÇÃO HTTP COM TEMPO LIMITE ====================
// Toda chamada a serviço externo (Mercado Pago, API de NFS-e, ElevenLabs)
// passa por aqui. Sem teto de tempo, uma chamada pendurada segura a resposta
// até o proxy cortar a conexão — e o navegador só mostra "Failed to fetch".
// Esta função NUNCA fica pendurada: ou responde, ou falha com motivo legível.

function obterFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  try {
    // eslint-disable-next-line global-require
    const nodeFetch = require('node-fetch');
    return nodeFetch.default || nodeFetch;
  } catch (e) {
    throw new Error('fetch indisponível neste Node — atualize para Node 18+ ou instale node-fetch');
  }
}

/**
 * @returns {Promise<{ ok: boolean, status: number, dados: any, texto: string, buffer?: Buffer, headers: any }>}
 */
async function requisitar(url, opcoes = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20000,
    binario = false
  } = opcoes;

  const fetchFn = obterFetch();
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);

  const cabecalhos = { Accept: 'application/json', ...headers };
  let corpo = body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    cabecalhos['Content-Type'] = cabecalhos['Content-Type'] || 'application/json';
    corpo = JSON.stringify(body);
  }

  try {
    const resposta = await fetchFn(url, {
      method,
      headers: cabecalhos,
      body: corpo,
      signal: controle.signal
    });

    if (binario && resposta.ok) {
      const arrayBuffer = await resposta.arrayBuffer();
      return {
        ok: true,
        status: resposta.status,
        dados: null,
        texto: '',
        buffer: Buffer.from(arrayBuffer),
        headers: resposta.headers
      };
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch (e) {
      dados = null;
    }
    return { ok: resposta.ok, status: resposta.status, dados, texto, headers: resposta.headers };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const host = (() => {
        try {
          return new URL(url).host;
        } catch (e) {
          return url;
        }
      })();
      throw new Error(`${host} não respondeu em ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new Error(err && err.message ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Extrai a mensagem de erro mais útil de uma resposta de API */
function motivoErro(resposta) {
  const d = resposta && resposta.dados;
  if (d) {
    const partes = [d.error, d.motivo, d.message, d.detalhe, d.detail].
    filter((v) => typeof v === 'string' && v.trim());
    if (Array.isArray(d.cause) && d.cause.length) {
      partes.push(d.cause.map((c) => c.description || c.code).filter(Boolean).join('; '));
    }
    if (partes.length) return [...new Set(partes)].join(' — ');
  }
  const texto = String(resposta && resposta.texto || '').slice(0, 300);
  return texto || `HTTP ${resposta ? resposta.status : '?'}`;
}

/** Mostra que o segredo existe, sem revelá-lo */
function marcarSegredo(valor) {
  const texto = String(valor || '');
  if (!texto) return { definido: false, tamanho: 0, final: '' };
  return {
    definido: true,
    tamanho: texto.length,
    final: texto.length > 4 ? `...${texto.slice(-4)}` : '****'
  };
}

/** URL pública da API, para callbacks (webhook) — sempre https */
function urlPublicaApi(req) {
  const fixa = String(process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (fixa) return fixa;
  const host = req ? req.get('x-forwarded-host') || req.get('host') : '';
  return host ? `https://${host}` : '';
}

module.exports = { requisitar, motivoErro, marcarSegredo, urlPublicaApi };