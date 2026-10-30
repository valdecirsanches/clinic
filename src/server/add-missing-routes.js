
// ==================== ADICIONA ROTAS FALTANTES AO SERVIDOR ====================
// Este arquivo deve ser importado no server.js para adicionar as rotas que estavam faltando

const prontuariosRoutes = require('./routes/prontuarios');
const procedimentosRoutes = require('./routes/procedimentos');
const atendimentosRoutes = require('./routes/atendimentos');
const documentosRoutes = require('./routes/documentos');
const financeiroRoutes = require('./routes/financeiro');
const dependentesRoutes = require('./routes/dependentes');
const empresasConveniadasRoutes = require('./routes/empresas-conveniadas');

function addMissingRoutes(app) {
  console.log('📋 Adicionando rotas faltantes...');

  // Rotas de prontuários
  app.use('/api/prontuarios', prontuariosRoutes);
  console.log('   ✅ /api/prontuarios');

  // Rotas de procedimentos
  app.use('/api/procedimentos', procedimentosRoutes);
  console.log('   ✅ /api/procedimentos');

  // Rotas de atendimentos
  app.use('/api/atendimentos', atendimentosRoutes);
  console.log('   ✅ /api/atendimentos');

  // Rotas de documentos
  app.use('/api/documentos', documentosRoutes);
  console.log('   ✅ /api/documentos');

  // Rotas de financeiro
  app.use('/api/financeiro', financeiroRoutes);
  console.log('   ✅ /api/financeiro');

  // Rotas de dependentes
  app.use('/api/dependentes', dependentesRoutes);
  console.log('   ✅ /api/dependentes');

  // Rotas de empresas conveniadas
  app.use('/api/empresas-conveniadas', empresasConveniadasRoutes);
  console.log('   ✅ /api/empresas-conveniadas');

  console.log('✅ Todas as rotas faltantes foram adicionadas!\n');
}

module.exports = { addMissingRoutes };