/**
 * Autenticação das chamadas à API.
 *
 * O servidor exige o token emitido no login em todo /api (exceto as rotas
 * públicas). Em vez de alterar as centenas de `fetch` espalhadas pelo app,
 * este módulo instala, uma única vez:
 *   • um interceptor de `fetch` que acrescenta `Authorization: Bearer <token>`
 *     às chamadas para o nosso servidor;
 *   • um `EventSource` que acrescenta `?_auth=<token>` (EventSource não envia
 *     cabeçalhos);
 *   • o tratamento de 401: sessão expirada/revogada → volta para o login.
 *
 * Imagens, downloads e links abertos direto pelo navegador usam o cookie
 * HttpOnly que o servidor grava no login. Para montar um link à mão, use
 * `urlComToken()`.
 */
import { API_BASE_URL, BACKUP_API_URL } from '../config/api';

const CHAVE_TOKEN = 'easyclin_auth_token';
const PARAM = '_auth';

export function obterToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function salvarToken(token: string | null | undefined) {
  try {
    if (token && token !== 'dummy-token') localStorage.setItem(CHAVE_TOKEN, token);else
    localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* navegador sem storage: a sessão dura só esta aba */
  }
}

function origemDe(url: string): string | null {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return null;
  }
}

const origensDaApi = new Set(
  [API_BASE_URL, BACKUP_API_URL].map((u) => u && origemDe(u)).filter(Boolean) as string[]
);

/** A URL é do nosso servidor de API? */
export function ehUrlDaApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    // /uploads também: arquivos de pacientes exigem sessão
    if (!u.pathname.startsWith('/api/') && !u.pathname.startsWith('/uploads/')) return false;
    return origensDaApi.has(u.origin) || u.origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Acrescenta o token a uma URL da API (para links, <a download>, EventSource). */
export function urlComToken(url: string): string {
  const token = obterToken();
  if (!token || !ehUrlDaApi(url)) return url;
  try {
    const u = new URL(url, window.location.href);
    u.searchParams.set(PARAM, token);
    return u.toString();
  } catch {
    return url;
  }
}

let sessaoExpiradaAvisada = false;
function sessaoExpirou() {
  if (sessaoExpiradaAvisada) return;
  sessaoExpiradaAvisada = true;
  salvarToken(null);
  try {
    localStorage.removeItem('sessao');
  } catch {
    /* ignora */
  }
  window.dispatchEvent(new CustomEvent('sessao-expirada'));
  // Recarrega para cair na tela de login com o estado limpo
  setTimeout(() => window.location.reload(), 300);
}

// ==================== SERVIDOR REINICIANDO (deploy) ====================
// Ao publicar uma versão, a API reinicia. Antes, toda chamada feita nesse
// intervalo falhava (502 do Cloudflare, conexão recusada ou 503): telas vazias,
// "erro de API" e "Salvar" perdido para todos os usuários logados.
// Agora a chamada espera o servidor voltar e é repetida sozinha; a tela só
// mostra "Atualizando o sistema…" (components/AvisoServidorReiniciando).

/** Quanto tempo uma chamada espera o servidor voltar antes de desistir. */
const ESPERA_MAXIMA_MS = 3 * 60 * 1000;
const INTERVALO_SONDAGEM_MS = 2000;

/** Proxy/Cloudflare não alcançou o servidor: a chamada não foi processada. */
const STATUS_ORIGEM_FORA = new Set([502, 520, 521, 522, 523]);

let esperaEmCurso: Promise<boolean> | null = null;

function urlSaude(): string {
  return `${API_BASE_URL}/api/health`;
}

/** O servidor está no ar e pronto? (usa o fetch original, sem interceptor) */
async function servidorPronto(fetchOriginal: typeof fetch): Promise<boolean> {
  try {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 5000);
    const r = await fetchOriginal(`${urlSaude()}?t=${Date.now()}`, { cache: 'no-store', signal: controle.signal });
    clearTimeout(timer);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Espera o servidor voltar. Todas as chamadas que falharem ao mesmo tempo
 * compartilham a mesma espera (uma única sondagem a cada 2 s).
 */
export function aguardarServidor(fetchOriginal: typeof fetch): Promise<boolean> {
  if (esperaEmCurso) return esperaEmCurso;
  window.dispatchEvent(new CustomEvent('servidor-reiniciando'));
  esperaEmCurso = (async () => {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, INTERVALO_SONDAGEM_MS));
      if (await servidorPronto(fetchOriginal)) {
        window.dispatchEvent(new CustomEvent('servidor-voltou'));
        return true;
      }
    }
    window.dispatchEvent(new CustomEvent('servidor-desistiu'));
    return false;
  })().finally(() => {
    esperaEmCurso = null;
  });
  return esperaEmCurso;
}

/** A resposta é o 503 que a API dá enquanto inicia/encerra? */
async function ehRespostaDeReinicio(resposta: Response): Promise<boolean> {
  if (STATUS_ORIGEM_FORA.has(resposta.status)) return true;
  if (resposta.status !== 503) return false;
  try {
    const corpo = await resposta.clone().json();
    return corpo?.codigo === 'SERVIDOR_REINICIANDO';
  } catch {
    // 503 sem JSON: veio do proxy (servidor fora)
    return true;
  }
}

/** Corpo que pode ser enviado de novo (stream já consumido não pode). */
function podeReenviar(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (input instanceof Request && input.body) return false;
  const corpo = init?.body as any;
  return !(corpo && typeof corpo.getReader === 'function');
}

function abortada(init?: RequestInit): boolean {
  return Boolean(init?.signal?.aborted);
}

/**
 * Faz a chamada; se o servidor estiver reiniciando, espera ele voltar e repete.
 * Leituras (GET) sempre repetem. Gravações só repetem quando é certo que não
 * chegaram a ser processadas: 503 "reiniciando" da própria API, 502/52x do
 * proxy, ou falha de conexão com o servidor confirmadamente fora do ar.
 */
export async function buscarEsperandoServidor(
fetchOriginal: typeof fetch,
input: RequestInfo | URL,
init: RequestInit | undefined,
metodo: string,
url: string)
: Promise<Response> {
  const leitura = metodo === 'GET' || metodo === 'HEAD';
  const ignorar = /\/api\/(sse|health)(\/|\?|$)/.test(url) || !podeReenviar(input, init);
  for (;;) {
    let resposta: Response;
    try {
      resposta = await fetchOriginal(input as any, init);
    } catch (err: any) {
      if (err?.name === 'AbortError' || ignorar || abortada(init)) throw err;
      // Gravação: só repete se o servidor estiver mesmo fora (a chamada não
      // chegou). Se ele responde, a falha foi outra — não arrisca duplicar.
      if (!leitura && (await servidorPronto(fetchOriginal))) throw err;
      const voltou = await aguardarServidor(fetchOriginal);
      if (!voltou || abortada(init)) throw err;
      continue;
    }
    if (!ignorar && (await ehRespostaDeReinicio(resposta))) {
      const voltou = await aguardarServidor(fetchOriginal);
      if (!voltou || abortada(init)) return resposta;
      continue;
    }
    return resposta;
  }
}

const emAndamento = new Map<string, Promise<Response>>();
let instalado = false;
export function instalarAutenticacaoApi() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;

  // ---------- fetch ----------
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (!ehUrlDaApi(url)) return fetchOriginal(input as any, init);

    const token = obterToken();
    const ehRotaDeLogin = /\/api\/auth\//.test(url);
    let novoInit: RequestInit | undefined = init;
    let novoInput: RequestInfo | URL = input;

    if (token) {
      if (input instanceof Request && !init) {
        const headers = new Headers(input.headers);
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        novoInput = new Request(input, { headers });
      } else {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        novoInit = { ...(init || {}), headers };
      }
    }
    // As rotas de login gravam/limpam o cookie usado por imagens e downloads;
    // em outra origem (api.* × app.*) o navegador só o aceita com credentials.
    if (ehRotaDeLogin) novoInit = { ...(novoInit || {}), credentials: 'include' };

    // GET idêntico já em andamento (mesma URL e mesmo token): reaproveita a
    // mesma resposta em vez de ir de novo ao servidor. Várias telas pedem o
    // mesmo dado ao mesmo tempo ao abrir (paciente, prontuário, Memed).
    const metodo = (novoInit?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const compartilhavel = metodo === 'GET' && !novoInit?.signal && !(input instanceof Request);
    const chave = compartilhavel ? `${url}|${token || ''}` : '';
    let promessa: Promise<Response>;
    if (chave && emAndamento.has(chave)) {
      promessa = emAndamento.get(chave)!;
    } else {
      promessa = buscarEsperandoServidor(fetchOriginal, novoInput, novoInit, metodo, url);
      if (chave) {
        emAndamento.set(chave, promessa);
        promessa.finally(() => emAndamento.delete(chave)).catch(() => {});
      }
    }
    const resposta = chave ? (await promessa).clone() : await promessa;
    if (resposta.status === 401 && token && !ehRotaDeLogin) {
      // Só derruba a sessão se o servidor disser que o TOKEN é inválido
      // (outros 401, como "senha atual não confere", seguem normais).
      resposta.clone().json().then((corpo) => {
        if (corpo && corpo.codigo === 'NAO_AUTENTICADO') sessaoExpirou();
      }).catch(() => {});
    }
    return resposta;
  };

  // ---------- EventSource ----------
  const EventSourceOriginal = window.EventSource;
  if (EventSourceOriginal) {
    const Proxy = function (this: any, url: string | URL, config?: EventSourceInit) {
      return new EventSourceOriginal(urlComToken(String(url)), config);
    } as unknown as typeof EventSource;
    Proxy.prototype = EventSourceOriginal.prototype;
    (Proxy as any).CONNECTING = EventSourceOriginal.CONNECTING;
    (Proxy as any).OPEN = EventSourceOriginal.OPEN;
    (Proxy as any).CLOSED = EventSourceOriginal.CLOSED;
    window.EventSource = Proxy;
  }

  // Sessões abertas antes desta versão têm token mas ainda não têm o cookie
  // (usado por <img> e downloads): pede ao servidor para gravá-lo.
  if (obterToken()) {
    window.fetch(`${API_BASE_URL}/api/auth/cookie`, { method: 'POST' }).catch(() => {});
  }
}
