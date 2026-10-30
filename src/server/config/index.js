// ==================== CONFIGURAÇÕES DO SERVIDOR ====================

const SERVER_VERSION = '2.43.1';
const BUILD_DATE = '2026-07-14';
const DEPLOYMENT_MARKER = 'agenda-manual-hours-schema-v1';
const PORT = process.env.PORT || 5171; // ⭐ CORRIGIDO: Porta 5171 como padrão

module.exports = {
  SERVER_VERSION,
  BUILD_DATE,
  DEPLOYMENT_MARKER,
  PORT
};