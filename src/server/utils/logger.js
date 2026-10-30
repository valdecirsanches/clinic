
// ==================== LOGGER CONDICIONAL DO SERVIDOR ====================
// Em produção: só mostra erros e avisos críticos
// Para debug: defina DEBUG_SERVER=1 no .env.local ou variável de ambiente
//
// Uso: const { log, debug, warn, error } = require('./utils/logger');
//   log('mensagem')    → sempre aparece (startup, eventos importantes)
//   debug('mensagem')  → só aparece com DEBUG_SERVER=1
//   warn('mensagem')   → sempre aparece (avisos)
//   error('mensagem')  → sempre aparece (erros)

const DEBUG = process.env.DEBUG_SERVER === '1' || process.env.DEBUG_SERVER === 'true';

function debug(...args) {
  if (DEBUG) console.log(...args);
}

function log(...args) {
  console.log(...args);
}

function warn(...args) {
  console.warn(...args);
}

function error(...args) {
  console.error(...args);
}

module.exports = { debug, log, warn, error, DEBUG };