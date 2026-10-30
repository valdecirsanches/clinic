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

    const resposta = await fetchOriginal(novoInput as any, novoInit);
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
