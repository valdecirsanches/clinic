
// ==================== CONFIGURAÇÃO MYSQL ====================
// Conexão com o banco de dados MySQL
// Host: localhost | User: <usuario> | Password: ***

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  port: parseInt(process.env.MYSQL_PORT || '3306'),

  // Pool settings
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,

  // Timeouts
  connectTimeout: 10000,

  // Charset
  charset: 'utf8mb4'
};

// Nome do banco global
const GLOBAL_DB_NAME = process.env.MYSQL_GLOBAL_DB || 'easyclin_global';

// ⭐ Mostra no log, SEMPRE, qual MySQL este processo vai usar e de onde veio
// o valor. Sem MYSQL_HOST no .env.local, o código cai no endereço padrão
// localhost — que pode não ser o banco oficial desta instalação.
(() => {
  const origem = (nome) => process.env[nome] ? '.env.local/ambiente' : '⚠️ PADRÃO DO CÓDIGO';
  console.log('🗄️  ================ MYSQL EM USO ================');
  console.log(`🗄️  Host:  ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}   (${origem('MYSQL_HOST')})`);
  console.log(`🗄️  User:  ${MYSQL_CONFIG.user}   (${origem('MYSQL_USER')})`);
  console.log(`🗄️  Banco global: ${GLOBAL_DB_NAME}   (${origem('MYSQL_GLOBAL_DB')})`);
  if (!process.env.MYSQL_HOST) {
    console.warn('🗄️  ⚠️ MYSQL_HOST NÃO está definido: usando localhost. Se este não for o banco oficial, defina MYSQL_HOST no .env.local e reinicie.');
  }
  console.log('🗄️  ==============================================');
})();

// Prefixo para bancos de clínica: easyclin_c{clinicaId}
// Ex: easyclin_c1770079554106
const CLINICA_DB_PREFIX = 'easyclin_';

function getClinicaDbName(clinicaId) {
  // Sanitiza o ID para nome de banco MySQL válido
  const idLimpo = clinicaId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${CLINICA_DB_PREFIX}${idLimpo}`;
}

module.exports = {
  MYSQL_CONFIG,
  GLOBAL_DB_NAME,
  CLINICA_DB_PREFIX,
  getClinicaDbName
};