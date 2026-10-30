/**
 * Setup global para testes
 * Configura mocks de ambiente (window, localStorage, etc.)
 */

// Mock do window para testes que usam config/api.ts
if (typeof globalThis.window === 'undefined') {
  ;
  (globalThis as any).window = {
    location: {
      hostname: 'localhost',
      href: 'http://localhost:3000',
      protocol: 'http:'
    }
  };
}

// Mock do localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    }
  };
}