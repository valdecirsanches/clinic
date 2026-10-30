// ⭐ PRIMEIRO import: no vídeo de demonstração (?demo=1) isola o sistema dos
// dados reais antes de qualquer outra coisa rodar.
import './utils/modoDemo';
import React, { useEffect, createElement } from 'react';
// Silence verbose console output in production builds (Phase 1 — performance).
// Keeps console.error so real failures still surface, but no-ops the chatty
// log/info/debug/warn/group/time methods that were costing CPU on every render.
// Development builds (import.meta.env.DEV) are unaffected — full logs remain.
if ((import.meta as any)?.env?.PROD === true && typeof window !== 'undefined') {
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.warn = noop;
  // eslint-disable-next-line no-console
  console.group = noop;
  // eslint-disable-next-line no-console
  console.groupEnd = noop;
  // eslint-disable-next-line no-console
  console.time = noop;
  // eslint-disable-next-line no-console
  console.timeEnd = noop;
  // eslint-disable-next-line no-console
  console.table = noop;
  // console.error stays active intentionally.
}
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { clearWhatsAppCache } from './utils/clearWhatsAppCache';
// Expõe função de limpeza globalmente
if (typeof window !== 'undefined') {
  ;
  (window as any).clearWhatsAppCache = clearWhatsAppCache;
}
// ⭐ FIX: Desabilita tradução automática do navegador (Google Translate, Edge, etc.).
// Tradutores reescrevem nós de texto do DOM, e o React, ao reconciliar, lança
// "Failed to execute 'insertBefore' on 'Node'" porque os nós que ele guardou
// internamente não são mais filhos do nó pai esperado. Bloqueando a tradução
// no nível do documento, eliminamos a maior fonte recorrente desse erro.
if (typeof document !== 'undefined') {
  try {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.classList.add('notranslate');
    // Meta tag específica do Google Translate
    if (!document.querySelector('meta[name="google"][content="notranslate"]')) {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'google');
      meta.setAttribute('content', 'notranslate');
      document.head.appendChild(meta);
    }
  } catch {


    // ignore — não bloquear o boot se algo falhar aqui
  }}
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
// ⭐ FIX requisições duplicadas: o React.StrictMode monta cada componente DUAS
// vezes em desenvolvimento (mount → unmount → mount), fazendo todo useEffect com
// fetch disparar 2x — era a origem das chamadas repetidas (GET /api/pacientes,
// usuários, operadoras) que apareciam em loop no log do servidor. Removendo o
// StrictMode, cada efeito roda uma única vez.
root.render(<App />);