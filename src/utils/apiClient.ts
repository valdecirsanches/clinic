/**
 * API Client with retry logic and better error handling
 */

import { API_BASE_URL } from '../config/api';
interface ApiError extends Error {
  status?: number;
  isNetworkError?: boolean;
  isServerError?: boolean;
}
interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
}

// ⭐⭐⭐ BLOQUEIO GLOBAL DE REQUISIÇÕES REPETIDAS ⭐⭐⭐
const requestTracker = new Map<string, {
  count: number;
  firstCall: number;
  blocked: boolean;
}>();
const REQUEST_WINDOW = 5000; // 5 segundos
const MAX_REQUESTS_PER_WINDOW = 10; // Máximo 10 requisições iguais em 5 segundos

function shouldBlockRequest(url: string): boolean {
  const now = Date.now();
  const key = url;
  const entry = requestTracker.get(key);
  if (!entry) {
    requestTracker.set(key, {
      count: 1,
      firstCall: now,
      blocked: false
    });
    return false;
  }

  // Se já está bloqueado, mantém bloqueado por 30 segundos
  if (entry.blocked) {
    if (now - entry.firstCall > 30000) {
      // Reset após 30 segundos
      requestTracker.set(key, {
        count: 1,
        firstCall: now,
        blocked: false
      });
      return false;
    }
    return true;
  }

  // Se passou a janela, reseta
  if (now - entry.firstCall > REQUEST_WINDOW) {
    requestTracker.set(key, {
      count: 1,
      firstCall: now,
      blocked: false
    });
    return false;
  }

  // Incrementa contador
  entry.count++;

  // Se excedeu limite, bloqueia
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    console.error(`🛑 [API BLOQUEADO] Requisição bloqueada por loop infinito: ${url} (${entry.count} chamadas em ${now - entry.firstCall}ms)`);
    entry.blocked = true;
    return true;
  }
  return false;
}

// Limpa tracker periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestTracker.entries()) {
    if (now - entry.firstCall > 60000) {
      requestTracker.delete(key);
    }
  }
}, 30000);

/**
 * Creates a user-friendly error message based on the HTTP status code
 */
function getErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Requisição inválida. Verifique os dados enviados.';
    case 401:
      return 'Não autorizado. Faça login novamente.';
    case 403:
      return 'Acesso negado. Você não tem permissão para esta ação.';
    case 404:
      return 'Recurso não encontrado.';
    case 408:
      return 'Tempo de requisição esgotado. Tente novamente.';
    case 429:
      return 'Muitas requisições. Aguarde um momento e tente novamente.';
    case 500:
      return 'Erro interno do servidor. Tente novamente mais tarde.';
    case 502:
      return 'Servidor temporariamente indisponível. Tente novamente em alguns instantes.';
    case 503:
      return 'Serviço indisponível. O servidor está em manutenção.';
    case 504:
      return 'Tempo de resposta do servidor esgotado. Tente novamente.';
    case 520:
      return 'Servidor não respondeu (erro 520). O backend pode estar reiniciando. Aguarde alguns segundos e tente novamente.';
    case 521:
      return 'Servidor offline (erro 521). O backend está fora do ar.';
    case 522:
      return 'Tempo de conexão esgotado (erro 522). O servidor não respondeu a tempo.';
    case 524:
      return 'Tempo de resposta esgotado (erro 524). A requisição demorou demais.';
    default:
      if (status >= 500) {
        return 'Erro no servidor. Tente novamente mais tarde.';
      }
      return `Erro na requisição (código ${status}).`;
  }
}

/**
 * Delay helper for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enhanced fetch with retry logic and better error handling
 */
export async function apiFetch<T = any>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const {
    retries = 2,
    retryDelay = 1000,
    ...fetchOptions
  } = options;
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  // ⭐⭐⭐ VERIFICA SE DEVE BLOQUEAR ⭐⭐⭐
  if (shouldBlockRequest(url)) {
    console.warn(`⚠️ [apiFetch] Requisição bloqueada (loop detectado): ${url}`);
    // Retorna array vazio ou objeto vazio dependendo do endpoint
    if (url.includes('/unidades')) {
      return [] as T;
    }
    return {} as T;
  }
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 [apiFetch] Tentativa ${attempt + 1} de ${retries + 1}...`);
        await delay(retryDelay * attempt); // Exponential backoff
      }
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers
        }
      });

      // If successful, return the data
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        return {} as T;
      }

      // Create error with status info
      const error: ApiError = new Error(getErrorMessage(response.status));
      error.status = response.status;
      error.isServerError = response.status >= 500;

      // Try to get error details from response
      try {
        const errorData = await response.json();
        if (errorData.message || errorData.error) {
          error.message = errorData.message || errorData.error;
        }
      } catch {


        // Ignore JSON parse errors
      } // Only retry on server errors (5xx)
      if (response.status >= 500 && attempt < retries) {lastError = error;
        console.warn(`⚠️ [apiFetch] Erro ${response.status}, tentando novamente...`);
        continue;
      }
      throw error;
    } catch (err: any) {
      // Network errors (no response)
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        const networkError: ApiError = new Error('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
        networkError.isNetworkError = true;
        if (attempt < retries) {
          lastError = networkError;
          console.warn('⚠️ [apiFetch] Erro de rede, tentando novamente...');
          continue;
        }
        throw networkError;
      }

      // If it's already an ApiError, just rethrow
      if (err.status !== undefined) {
        throw err;
      }

      // Unknown error
      lastError = err;
      if (attempt < retries) {
        console.warn('⚠️ [apiFetch] Erro desconhecido, tentando novamente...');
        continue;
      }
      throw err;
    }
  }

  // If we get here, all retries failed
  throw lastError || new Error('Falha na requisição após múltiplas tentativas.');
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any,>(endpoint: string, options?: FetchOptions) => apiFetch<T>(endpoint, {
    ...options,
    method: 'GET'
  }),
  post: <T = any,>(endpoint: string, data?: any, options?: FetchOptions) => apiFetch<T>(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined
  }),
  put: <T = any,>(endpoint: string, data?: any, options?: FetchOptions) => apiFetch<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined
  }),
  delete: <T = any,>(endpoint: string, options?: FetchOptions) => apiFetch<T>(endpoint, {
    ...options,
    method: 'DELETE'
  })
};
export default api;