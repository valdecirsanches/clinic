/**
 * Configuração da URL base da API
 *
 * @version 5.0.0 - Fonte única: config/env.ts
 *
 * ⭐ Para mudar a URL do servidor, edite config/env.ts
 */

import { ENV_BACKUP_API_URL, ENV_SERVER_DB, ENV_SERVER_DB_ORIGEM, ENV_WAHA_API_KEY, ENV_WAHA_SERVER_URL } from './env';

// Detecta se está rodando no Magic Patterns
export const isMagicPatterns = window.location.hostname.includes('magicpatterns.com');

// Detecta se está em localhost
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Detecta domínio de produção da clínica
const isClinicApp = window.location.hostname === 'clinic-app.x-star.com.br';

// Detecta qualquer subdomínio x-star.com.br
const isXStar = window.location.hostname.endsWith('.x-star.com.br');

// ⭐ SERVER_DB vem de config/env.ts (fonte única e confiável)
const SERVER_DB: string = ENV_SERVER_DB.trim();

// URL base da API por ambiente
export const API_BASE_URL = isLocalhost ? 'http://localhost:5171' : SERVER_DB;

// Servidor do backup: VITE_BACKUP_API_URL do .env.local, ou o da API
export const BACKUP_API_URL: string = ENV_BACKUP_API_URL.trim().replace(/\/+$/, '') || API_BASE_URL;

// Exporta SERVER_DB para uso em verificações de domínio (fetch interceptor, etc.)
export const SERVER_DB_URL = SERVER_DB;

// Compatibilidade com componentes que usam essas exports
export const envServerDbLoaded = true;
export const serverDbSourceInfo = ENV_SERVER_DB_ORIGEM;

// WAHA API Key e Server URL
export const WAHA_API_KEY: string = ENV_WAHA_API_KEY.trim();
export const WAHA_SERVER_URL: string = ENV_WAHA_SERVER_URL.trim().replace(/\/+$/, '');
const ambiente = isLocalhost ? 'Localhost' : isClinicApp ? 'Clinic App (Produção)' : isMagicPatterns ? 'Magic Patterns' : isXStar ? `X-Star (${window.location.hostname})` : `Outro (${window.location.hostname})`;

// Logs
console.log(`🌐 Ambiente: ${ambiente}`);
console.log(`🌐 API URL: ${API_BASE_URL}`);
console.log(`📦 Fonte: ${ENV_SERVER_DB_ORIGEM} → ${SERVER_DB}`);
console.log(`🔑 WAHA: ${WAHA_API_KEY ? '✅' : '⚠️ não definida'}`);

// ⭐ GLOBAL FETCH INTERCEPTOR para Magic Patterns
// Intercepta TODAS as chamadas à API quando rodando no Magic Patterns,
// retornando respostas mock vazias para evitar erros 520.
if (isMagicPatterns) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    // Intercepta apenas chamadas à nossa API
    if (url.includes(API_BASE_URL) || url.includes('/api/')) {
      console.log(`🚫 [MagicPatterns] Bloqueando fetch: ${url}`);
      // Retorna resposta mock vazia com status 200
      const mockBody = url.includes('?') || url.endsWith('/') ? '[]' : '[]';
      return new Response(mockBody, {
        status: 200,
        statusText: 'OK (Mock - Magic Patterns)',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Deixa passar chamadas externas (Google Fonts, CDNs, etc.)
    return originalFetch(input, init);
  };
  console.log('🛡️ [MagicPatterns] Fetch interceptor ativo — chamadas à API bloqueadas');
}

// ⭐ Health check — testa se o servidor DB/API está acessível
export async function checkApiHealth(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  url: string;
  source: string;
}> {
  const url = `${API_BASE_URL}/api/health`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });
    clearTimeout(timeout);
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        url: API_BASE_URL,
        source: 'config/env.ts'
      };
    }
    return {
      ok: false,
      status: response.status,
      error: `HTTP ${response.status}`,
      url: API_BASE_URL,
      source: 'config/env.ts'
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        error: 'Timeout: servidor não respondeu em 8 segundos',
        url: API_BASE_URL,
        source: 'config/env.ts'
      };
    }
    return {
      ok: false,
      error: err.message || 'Erro de conexão',
      url: API_BASE_URL,
      source: 'config/env.ts'
    };
  }
}