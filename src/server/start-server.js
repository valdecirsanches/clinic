#!/usr/bin/env node
// ==================== SCRIPT DE INICIALIZAÇÃO DO SERVIDOR ====================
// Este script inicia o servidor original e adiciona as rotas faltantes
// Execute com: node server/start-server.js (de qualquer diretório)

// ⭐⭐⭐ REDE DE SEGURANÇA DO PROCESSO ⭐⭐⭐
// Sem estes handlers, UMA exceção assíncrona ou promessa rejeitada em QUALQUER
// rota derruba o processo inteiro (comportamento padrão do Node 15+). O navegador
// vê a requisição morrer no meio e mostra "Failed to fetch", enquanto o systemd
// reinicia o serviço — foi exatamente o que acontecia no envio/saldo de SMS e
// também é a causa de "o app fica reiniciando e perdemos o que não foi salvo".
process.on('unhandledRejection', (motivo) => {
  console.error('🛑 [PROCESSO] Promessa rejeitada sem tratamento:', motivo);
});
process.on('uncaughtException', (err) => {
  console.error('🛑 [PROCESSO] Exceção não tratada:', err && err.stack || err);
});

// ⭐⭐⭐ FIX v15.1: Carrega .env.local de TODOS os caminhos possíveis ⭐⭐⭐
const path = require('path');
const fs = require('fs');
try {
  const dotenv = require('dotenv');

  // Busca .env.local em vários caminhos possíveis
  const searchPaths = [
  path.join(__dirname, '.env.local'), // server/.env.local
  path.resolve(__dirname, '..', '.env.local'), // 1 nível acima (src/)
  path.resolve(__dirname, '..', '..', '.env.local'), // 2 níveis acima (raiz do projeto)
  path.resolve(__dirname, '..', '..', '..', '.env.local'), // 3 níveis acima
  path.join(process.cwd(), '.env.local') // diretório de execução
  ];

  let loaded = false;
  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      // ⭐ override: o .env.local VENCE o ambiente herdado. Sem isso, o PM2
      // mantinha as variáveis da primeira vez que subiu o processo (ex.:
      // MYSQL_HOST do teste) e "pm2 restart" nunca trocava o banco, por mais
      // que o .env.local fosse corrigido.
      dotenv.config({ path: envPath, override: true });
      console.log(`🔑 .env.local encontrado em: ${envPath}`);
      console.log(`🗄️  MySQL em uso: ${process.env.MYSQL_HOST || '(MYSQL_HOST não definido → padrão do código)'} / banco ${process.env.MYSQL_DATABASE || process.env.MYSQL_DB || '(padrão)'}`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    console.log(`⚠️ .env.local NÃO encontrado! Caminhos verificados:`);
    searchPaths.forEach((p) => console.log(`   ❌ ${p}`));
    console.log(`   💡 Crie o arquivo .env.local em um destes caminhos com: WAHA_API_KEY=sua_chave`);
  }

  const envKey = process.env.WAHA_API_KEY || process.env.WAHA_API_KEY || '';
  console.log(`🔑 WAHA_API_KEY (server): ${envKey ? '✅ ' + '***' + envKey.slice(-4) : '⚠️ não definida'}`);
} catch (e) {
  console.log('⚠️ dotenv não instalado — variáveis de ambiente serão lidas apenas de process.env');
  console.log('   Para instalar: cd server && npm install dotenv');
  console.log(`   Erro: ${e.message}`);
}

const express = require('express');
const cors = require('cors');
// fs já importado acima para busca do .env.local

// ==================== CONFIGURAÇÃO DE DIRETÓRIO ====================
// Garante que os requires funcionem independente de onde o script é executado
const SERVER_DIR = __dirname;

// Importa banco de dados
const dbGlobal = require(path.join(SERVER_DIR, 'databaseGlobal'));
const { getClinicaDB } = require(path.join(SERVER_DIR, 'databaseClinica'));

// ⭐⭐⭐ FIX v2.44.1: FETCH ROBUSTO - Prioriza node-fetch@2 (mais estável) ⭐⭐⭐
// O fetch nativo do Node 18+ (undici) tem comportamentos diferentes que causam
// problemas com download de mídia, headers e timeouts no WAHA.
// node-fetch@2 é CommonJS, battle-tested e já está no package.json.
let fetch;
try {
  fetch = require('node-fetch');
  console.log('✅ [Server] Usando node-fetch@2 (CommonJS - RECOMENDADO)');
} catch (e1) {
  if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch;
    console.log('⚠️ [Server] Usando fetch NATIVO do Node.js (fallback)');
  } else {
    try {
      const _importDynamic = new Function('modulePath', 'return import(modulePath)');
      fetch = async (...args) => {const mod = await _importDynamic('node-fetch');return mod.default(...args);};
      console.log('⚠️ [Server] Usando node-fetch (ESM dynamic import - fallback)');
    } catch (e2) {
      console.error('❌ [Server] fetch não disponível - Execute: cd server && npm install node-fetch@2');
      fetch = async () => {throw new Error('fetch não disponível');};
    }
  }
}

// Importa módulos necessários para upload de arquivos
const multer = require('multer');

// ==================== VERSÃO E IDENTIDADE DO PROCESSO ====================
const SERVER_VERSION = '2.43.1';
const BUILD_DATE = '2026-07-14';
const SERVER_STARTED_AT = new Date().toISOString();
const DEPLOYMENT_MARKER = 'agenda-manual-hours-schema-v1';
const SERVER_FILE_MODIFIED_AT = (() => {
  try {
    return fs.statSync(__filename).mtime.toISOString();
  } catch {
    return null;
  }
})();
const PORT = process.env.PORT || 5171; // ⭐ CORRIGIDO: Porta 5171 como padrão

const app = express();

// ==================== MIDDLEWARE ====================
// ⭐⭐⭐ CORS: Aceita TODAS as origens (Magic Patterns, clinic-app, localhost, etc.) ⭐⭐⭐
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Requested-With'],
  credentials: true
}));
// Responde preflight OPTIONS explicitamente para qualquer rota
app.options('*', cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Requested-With'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ⭐⭐⭐ NUNCA CACHEAR RESPOSTAS DE DADOS ⭐⭐⭐
// Sem estes cabeçalhos, navegador, proxy e CDN (Cloudflare) podiam guardar as
// respostas de /api e servir dados VELHOS — dois terminais viam versões
// diferentes do mesmo registro. Dados de clínica são sempre dinâmicos.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve arquivos estáticos de uploads
const uploadsDir = path.join(SERVER_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// ⭐⭐⭐ FIX: Serve uploads com headers CORS e cache corretos ⭐⭐⭐
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  // Para requisições OPTIONS (preflight), responde imediatamente
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(uploadsDir));

// ⭐ Pasta de downloads (instaladores, ferramentas, etc.)
const downloadsDir = path.join(SERVER_DIR, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  console.log(`📁 Pasta downloads criada: ${downloadsDir}`);
}
app.use('/downloads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Disposition', 'attachment');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(downloadsDir));

// ⭐ Rota dedicada para download de arquivo específico (mais robusto que static com espaços)
app.get('/api/downloads/arquivo/:nome', (req, res) => {
  const nomeArquivo = decodeURIComponent(req.params.nome);
  const filePath = path.join(downloadsDir, nomeArquivo);

  console.log(`📥 Download solicitado: "${nomeArquivo}"`);
  console.log(`   Caminho: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Arquivo não encontrado: ${filePath}`);
    // Lista arquivos disponíveis para debug
    const disponiveis = fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir) : [];
    console.log(`   Arquivos disponíveis: [${disponiveis.join(', ')}]`);
    return res.status(404).json({
      error: 'Arquivo não encontrado',
      arquivo: nomeArquivo,
      disponiveis
    });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.download(filePath, nomeArquivo, (err) => {
    if (err) {
      console.error(`❌ Erro ao enviar download: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    } else {
      console.log(`✅ Download enviado: ${nomeArquivo}`);
    }
  });
});

// ⭐ Rota para listar arquivos disponíveis para download
app.get('/api/downloads/listar', (req, res) => {
  try {
    if (!fs.existsSync(downloadsDir)) {
      return res.json([]);
    }
    const arquivos = fs.readdirSync(downloadsDir).map((nome) => {
      const stats = fs.statSync(path.join(downloadsDir, nome));
      return {
        nome,
        tamanho: stats.size,
        tamanhoFormatado: stats.size > 1024 * 1024 ?
        (stats.size / (1024 * 1024)).toFixed(1) + ' MB' :
        (stats.size / 1024).toFixed(0) + ' KB',
        modificado: stats.mtime.toISOString()
      };
    });
    res.json(arquivos);
  } catch (err) {
    console.error('❌ Erro ao listar downloads:', err);
    res.json([]);
  }
});

// ==================== IMPORTA ROTAS ====================

// Rotas existentes (usando path.join para caminhos absolutos)
const authRoutes = require(path.join(SERVER_DIR, 'routes/auth'));
const operadorasRoutes = require(path.join(SERVER_DIR, 'routes/operadoras'));
const clinicasRoutes = require(path.join(SERVER_DIR, 'routes/clinicas'));
const usuariosRoutes = require(path.join(SERVER_DIR, 'routes/usuarios'));
const pacientesRoutes = require(path.join(SERVER_DIR, 'routes/pacientes'));
const consultasRoutes = require(path.join(SERVER_DIR, 'routes/consultas'));
const agendasRoutes = require(path.join(SERVER_DIR, 'routes/agendas'));
const configuracoesRoutes = require(path.join(SERVER_DIR, 'routes/configuracoes'));
const mensagensRoutes = require(path.join(SERVER_DIR, 'routes/mensagens'));
const smsRoutes = require(path.join(SERVER_DIR, 'routes/sms'));
// ⭐ NOVO: WhatsApp oficial da Meta (Cloud API) — terceiro canal, opcional
const whatsappMetaRoutes = require(path.join(SERVER_DIR, 'routes/whatsapp-meta'));
// Entrada da Meta (respostas e arquivos do paciente) e conexão do número da
// clínica. Arquivos separados: o webhook do WAHA não é tocado.
const whatsappMetaWebhookRoutes = require(path.join(SERVER_DIR, 'routes/whatsapp-meta-webhook'));
const whatsappMetaSignupRoutes = require(path.join(SERVER_DIR, 'routes/whatsapp-meta-signup'));
const confirmacaoPublicaRoutes = require(path.join(SERVER_DIR, 'routes/confirmacao-publica'));
const assinaturaRoutes = require(path.join(SERVER_DIR, 'routes/assinatura'));
const whatsappRoutes = require(path.join(SERVER_DIR, 'routes/whatsapp'));
const webhookRoutes = require(path.join(SERVER_DIR, 'routes/webhook'));
const diagnosticoRoutes = require(path.join(SERVER_DIR, 'routes/diagnostico'));
// ⭐ NOVO: Vídeo — BigBlueButton (consulta online profissional, opcional)
let videoBbbRoutes;
try {
  videoBbbRoutes = require(path.join(SERVER_DIR, 'routes/video-bbb'));
} catch (err) {
  console.error('⚠️ Rota video-bbb não encontrada:', err.message);
}
// ⭐ NOVO: Vídeo — LiveKit (consulta online no servidor próprio da clínica)
let livekitRoutes;
try {
  livekitRoutes = require(path.join(SERVER_DIR, 'routes/livekit'));
} catch (err) {
  console.error('⚠️ Rota livekit não encontrada:', err.message);
}

// Rotas novas (que estavam faltando)
const prontuariosRoutes = require(path.join(SERVER_DIR, 'routes/prontuarios'));
const procedimentosRoutes = require(path.join(SERVER_DIR, 'routes/procedimentos'));
const atendimentosRoutes = require(path.join(SERVER_DIR, 'routes/atendimentos'));
const documentosRoutes = require(path.join(SERVER_DIR, 'routes/documentos'));
const financeiroRoutes = require(path.join(SERVER_DIR, 'routes/financeiro'));
const parcelasRoutes = require(path.join(SERVER_DIR, 'routes/parcelas'));
const dependentesRoutes = require(path.join(SERVER_DIR, 'routes/dependentes'));
const empresasConveniadasRoutes = require(path.join(SERVER_DIR, 'routes/empresas-conveniadas'));
const memedProfissionaisRoutes = require(path.join(SERVER_DIR, 'routes/memed-profissionais'));
const medicamentosRoutes = require(path.join(SERVER_DIR, 'routes/medicamentos'));
const planosSaudeRoutes = require(path.join(SERVER_DIR, 'routes/planos-saude'));

// ⭐ NOVO: Planos do Sistema (Grátis, Básico, Profissional)
const planosRoutes = require(path.join(SERVER_DIR, 'routes/planos'));

// ⭐ NOVO: Rotas de carteirinha digital
const carteirinhaRoutes = require(path.join(SERVER_DIR, 'routes/carteirinha'));

// ⭐ NOVO: Rotas de especialidades
const especialidadesRoutes = require(path.join(SERVER_DIR, 'routes/especialidades'));

// ⭐ NOVO: Rotas de CID-10
const cid10Routes = require(path.join(SERVER_DIR, 'routes/cid10'));

// ⭐ NOVO: Rotas de Convênios
const conveniosRoutes = require(path.join(SERVER_DIR, 'routes/convenios'));

// ⭐ NOVO: Rotas de Anamneses (tabela separada por etapa)
const anamnesesRoutes = require(path.join(SERVER_DIR, 'routes/anamneses'));

// ⭐ NOVO: Rotas de Evoluções (tabela separada por etapa)
const evolucoesRoutes = require(path.join(SERVER_DIR, 'routes/evolucoes'));

// ⭐ NOVO: Rotas de Exames Físicos (tabela separada por etapa)
const examesFisicosRoutes = require(path.join(SERVER_DIR, 'routes/exames-fisicos'));

// ⭐ NOVO: Rotas de Diagnósticos (tabela separada por etapa)
const diagnosticosRoutes = require(path.join(SERVER_DIR, 'routes/diagnosticos'));

// ⭐ NOVO: Rotas de Exames Solicitados (tabela separada por etapa)
let examesSolicitadosRoutes;
try {
  examesSolicitadosRoutes = require(path.join(SERVER_DIR, 'routes/exames-solicitados'));
} catch (err) {
  console.error('⚠️ Rota exames-solicitados não encontrada:', err.message);
}

// ⭐ NOVO: Rotas de Padrões de Exames (por profissional)
let padroesExamesRoutes;
try {
  padroesExamesRoutes = require(path.join(SERVER_DIR, 'routes/padroes-exames'));
} catch (err) {
  console.error('⚠️ Rota padroes-exames não encontrada:', err.message);
}

// ⭐ NOVO: Rotas de Prescrições (tabela separada por etapa)
const prescricoesRoutes = require(path.join(SERVER_DIR, 'routes/prescricoes'));

// ⭐ NOVO: Relatórios (tabela separada por etapa)
let relatoriosRoutes;
try {
  relatoriosRoutes = require(path.join(SERVER_DIR, 'routes/relatorios'));
} catch (err) {
  console.error('⚠️ Rota relatorios não encontrada:', err.message);
}

// ⭐ NOVO: Padrões de Relatórios (por profissional)
let padroesRelatoriosRoutes;
try {
  padroesRelatoriosRoutes = require(path.join(SERVER_DIR, 'routes/padroes-relatorios'));
} catch (err) {
  console.error('⚠️ Rota padroes-relatorios não encontrada:', err.message);
}

// ⭐ NOVO: Padrões de Prescrições (por profissional)
let padroesPrescricoesRoutes;
try {
  padroesPrescricoesRoutes = require(path.join(SERVER_DIR, 'routes/padroes-prescricoes'));
} catch (err) {
  console.error('⚠️ Rota padroes-prescricoes não encontrada:', err.message);
}

// ⭐ NOVO: Atestados (Lei 14.724/2023)
let atestadosRoutes;
try {
  atestadosRoutes = require(path.join(SERVER_DIR, 'routes/atestados'));
} catch (err) {
  console.error('⚠️ Rota atestados não encontrada:', err.message);
}

// ⭐ NOVO: Log de Auditoria (LGPD)
const auditLogRoutes = require(path.join(SERVER_DIR, 'routes/audit-log'));

// ⭐ NOVO: Configurações Bancárias (boletos registrados)
let configuracoesBancoRoutes;
try {
  configuracoesBancoRoutes = require(path.join(SERVER_DIR, 'routes/configuracoes-banco'));
} catch (err) {
  console.error('⚠️ Rota configuracoes-banco não encontrada:', err.message);
}

// ⭐ NOVO: PrintServer (impressão remota via WebSocket)
let printserverRoutes;
try {
  printserverRoutes = require(path.join(SERVER_DIR, 'routes/printserver'));
} catch (err) {
  console.error('⚠️ Rota printserver não encontrada:', err.message);
}

// ⭐ NOVO: Boletos Itaú (API registrada)
let boletosItauRoutes;
try {
  boletosItauRoutes = require(path.join(SERVER_DIR, 'routes/boletos-itau'));
} catch (err) {
  console.error('⚠️ Rota boletos-itau não encontrada:', err.message);
}

// ⭐ NOVO: Exames Gratuitos (por clínica)
let examesGratuitosRoutes;
try {
  examesGratuitosRoutes = require(path.join(SERVER_DIR, 'routes/exames-gratuitos'));
} catch (err) {
  console.error('⚠️ Rota exames-gratuitos não encontrada:', err.message);
}

// ⭐ NOVO: Sessões de Usuários (quem está conectado)
let sessionsRoutes;
try {
  sessionsRoutes = require(path.join(SERVER_DIR, 'routes/sessions'));
} catch (err) {
  console.error('⚠️ Rota sessions não encontrada:', err.message);
}

// ⭐ NOVO: Importações
const importacaoRoutes = require(path.join(SERVER_DIR, 'routes/importacao'));

// ⭐ NOVO: Ponto / Frequência de funcionários (marcação automática por horário, sem biometria)
let pontoRoutes;
try {
  pontoRoutes = require(path.join(SERVER_DIR, 'routes/ponto'));
} catch (err) {
  console.error('⚠️ Rota ponto não encontrada:', err.message);
}

// ⭐ Biometria (DigitalPersona): cadastro/identificação de digitais alimentado pelo
// aplicativo Windows BiometriaDigitalPersona (BiometriaWS).
let biometriaRoutes;
try {
  biometriaRoutes = require(path.join(SERVER_DIR, 'routes/biometria'));
} catch (err) {
  console.error('⚠️ Rota biometria não encontrada:', err.message);
}

// ⭐ NOVO: Rotas de Aniversários (felicitação via WhatsApp)
let aniversariosRoutes;
try {
  aniversariosRoutes = require(path.join(SERVER_DIR, 'routes/aniversarios'));
} catch (err) {
  console.error('⚠️ Rota aniversarios não encontrada:', err.message);
}

// ⭐ NOVO: Dossiê de configuração (super admin)
let dossieRoutes;
try {
  dossieRoutes = require(path.join(SERVER_DIR, 'routes/dossie'));
} catch (err) {
  console.error('⚠️ Rota dossie não encontrada:', err.message);
}

// ==================== REGISTRA ROTAS ====================

// Autenticação
app.use('/api/auth', authRoutes);
console.log('   ✅ /api/auth');

// Dossiê de configuração (restrito ao super admin — verificado na própria rota)
if (dossieRoutes) {
  app.use('/api/dossie', dossieRoutes);
  console.log('   ✅ /api/dossie');
}

// Sessões
if (sessionsRoutes) {
  app.use('/api/sessions', sessionsRoutes);
  console.log('   ✅ /api/sessions');
}

// Aniversários
if (aniversariosRoutes) {
  app.use('/api/aniversarios', aniversariosRoutes);
  console.log('   ✅ /api/aniversarios');
}

// Entidades principais
app.use('/api/operadoras', operadorasRoutes);
console.log('   ✅ /api/operadoras');

app.use('/api/clinicas', clinicasRoutes);
console.log('   ✅ /api/clinicas');

app.use('/api/usuarios', usuariosRoutes);
console.log('   ✅ /api/usuarios');

app.use('/api/pacientes', pacientesRoutes);
console.log('   ✅ /api/pacientes');

app.use('/api/consultas', consultasRoutes);
console.log('   ✅ /api/consultas');

// ⭐ NOVO: Vídeo — BigBlueButton (opcional; só ativa se BBB_URL/BBB_SECRET existirem)
if (videoBbbRoutes) {
  app.use('/api/video/bbb', videoBbbRoutes);
  console.log('   ✅ /api/video/bbb');
}

// ⭐ NOVO: Vídeo — LiveKit (só ativa com LIVEKIT_URL/KEY/SECRET no .env)
if (livekitRoutes) {
  app.use('/api/livekit', livekitRoutes);
  console.log('   ✅ /api/livekit');
}

app.use('/api/agendas', agendasRoutes);
console.log('   ✅ /api/agendas');

// Assistente de voz (OpenAI). A chave fica só no servidor: OPENAI_API_KEY.
try {
  app.use('/api/assistente', require('./routes/assistente'));
  console.log(`   ✅ /api/assistente (OpenAI ${process.env.OPENAI_API_KEY ? 'configurada' : 'SEM OPENAI_API_KEY'})`);
} catch (err) {
  console.error('   ❌ /api/assistente não carregou:', err.message);
}

// Configurações
app.use('/api/configuracoes-globais', (req, res, next) => {
  req.url = '/globais' + req.url;
  configuracoesRoutes(req, res, next);
});
console.log('   ✅ /api/configuracoes-globais');

app.use('/api/whatsapp-config', (req, res, next) => {
  req.url = '/whatsapp' + (req.url === '/' ? '' : req.url);
  configuracoesRoutes(req, res, next);
});
console.log('   ✅ /api/whatsapp-config');

app.use('/api/sms-config', (req, res, next) => {
  req.url = '/sms' + (req.url === '/' ? '' : req.url);
  configuracoesRoutes(req, res, next);
});
console.log('   ✅ /api/sms-config');

// SMS (SMSGo)
app.use('/api/sms', smsRoutes);
console.log('   ✅ /api/sms');

// WhatsApp oficial da Meta (Cloud API) — canal independente do WAHA.
// ⭐ O webhook de ENTRADA vem ANTES: a Meta manda application/json e o router de
// envio tem um leitor de corpo próprio (text/plain) que não deve interceptá-lo.
app.use('/api/whatsapp-meta', whatsappMetaWebhookRoutes);
console.log('   ✅ /api/whatsapp-meta/webhook (entrada: respostas e arquivos)');
app.use('/api/whatsapp-meta', whatsappMetaSignupRoutes);
console.log('   ✅ /api/whatsapp-meta/signup (clínica conecta o próprio número)');
app.use('/api/whatsapp-meta', whatsappMetaRoutes);
console.log('   ✅ /api/whatsapp-meta');

// Confirmação pública de consulta (link enviado ao paciente por SMS)
app.use('/api/confirmacao', confirmacaoPublicaRoutes);
console.log('   ✅ /api/confirmacao');

// Financeiro da assinatura (plataforma → clínica): mensalidades e faturas.
// Pagamentos (Mercado Pago + webhook) vêm antes, no mesmo prefixo.
try {
  app.use('/api/assinatura', require(path.join(SERVER_DIR, 'routes/assinatura-pagamento')));
  console.log('   ✅ /api/assinatura (Mercado Pago)');
} catch (err) {
  console.error('⚠️ Rota assinatura-pagamento não carregada:', err.message);
}
app.use('/api/assinatura', assinaturaRoutes);
console.log('   ✅ /api/assinatura');

// Gestão de assinaturas (super admin — verificado na própria rota)
try {
  app.use('/api/assinatura-gestao', require(path.join(SERVER_DIR, 'routes/assinatura-gestao')));
  console.log('   ✅ /api/assinatura-gestao');
} catch (err) {
  console.error('⚠️ Rota assinatura-gestao não carregada:', err.message);
}

// ⭐ Rota que não carregou responde 503 com o MOTIVO, em vez de um 404 mudo.
// Antes, um erro no arquivo do backup aparecia na tela só como "serviço não
// encontrado", sem nenhuma pista do que corrigir.
function rotaComFalha(nome, err) {
  const r = express.Router();
  r.all('*', (req, res) =>
  res.status(503).json({
    codigo: 'ROTA_NAO_CARREGADA',
    error: `O serviço de ${nome} não iniciou no servidor: ${err.message}`
  })
  );
  return r;
}

// Backup gravado na máquina do cliente (admin da clínica, 1x por dia)
try {
  app.use('/api/backup-cliente', require(path.join(SERVER_DIR, 'routes/backup-cliente')));
  console.log('   ✅ /api/backup-cliente');
} catch (err) {
  console.error('⚠️ Rota backup-cliente não carregada:', err.stack || err.message);
  app.use('/api/backup-cliente', rotaComFalha('backup', err));
}

// Backup das clínicas + agendador (super admin)
try {
  app.use('/api/backup', require(path.join(SERVER_DIR, 'routes/backup')));
  console.log('   ✅ /api/backup');
} catch (err) {
  console.error('⚠️ Rota backup não carregada:', err.stack || err.message);
  app.use('/api/backup', rotaComFalha('backup', err));
}

// Vídeo de demonstração — narração ElevenLabs (super admin)
try {
  app.use('/api/video-demo', require(path.join(SERVER_DIR, 'routes/video-demo')));
  console.log('   ✅ /api/video-demo');
} catch (err) {
  console.error('⚠️ Rota video-demo não carregada:', err.message);
}

// Mensagens
app.use('/api/mensagens', mensagensRoutes);
console.log('   ✅ /api/mensagens');

// WhatsApp
app.use('/api/whatsapp', whatsappRoutes);
console.log('   ✅ /api/whatsapp');

// WhatsApp Webhook (extraído de whatsapp.js)
app.use('/api/whatsapp', webhookRoutes);
console.log('   ✅ /api/whatsapp/webhook (webhook.js)');

// ==================== WEBHOOK ALTERNATIVO (COMPATIBILIDADE) ====================
// O server.js original usava /api/webhook/whatsapp
// Adiciona rota alternativa para compatibilidade com servidores WhatsApp já configurados
app.post('/api/webhook/whatsapp', (req, res) => {
  console.log('📩 POST /api/webhook/whatsapp (redirecionando para /api/whatsapp/webhook)');
  req.url = '/webhook';
  webhookRoutes(req, res);
});

// ⭐⭐⭐ WEBHOOK COMPATIBILIDADE: /webhook/resposta/ ⭐⭐⭐
// O WAHA pode estar configurado com esta URL - redireciona para o webhook principal
app.post('/webhook/resposta', (req, res) => {
  console.log('📩 POST /webhook/resposta (redirecionando para /api/whatsapp/webhook)');
  req.url = '/webhook';
  webhookRoutes(req, res);
});
app.post('/webhook/resposta/', (req, res) => {
  console.log('📩 POST /webhook/resposta/ (redirecionando para /api/whatsapp/webhook)');
  req.url = '/webhook';
  webhookRoutes(req, res);
});

// ⭐⭐⭐ CATCH-ALL: Qualquer variação de webhook ⭐⭐⭐
app.post('/webhook', (req, res) => {
  console.log('📩 POST /webhook (redirecionando para /api/whatsapp/webhook)');
  req.url = '/webhook';
  webhookRoutes(req, res);
});
app.post('/webhook/:any', (req, res) => {
  console.log(`📩 POST /webhook/${req.params.any} (redirecionando para /api/whatsapp/webhook)`);
  req.url = '/webhook';
  webhookRoutes(req, res);
});
app.post('/webhook/:any/:any2', (req, res) => {
  console.log(`📩 POST /webhook/${req.params.any}/${req.params.any2} (redirecionando para /api/whatsapp/webhook)`);
  req.url = '/webhook';
  webhookRoutes(req, res);
});

const responderStatusWebhook = (req, res) => {
  console.log(`🔍 GET ${req.originalUrl} - Verificação do webhook`);
  res.json({
    status: 'ok',
    message: 'Webhook EasyClin ativo',
    version: '2.43.1',
    endpoints: {
      principal: 'POST /api/webhook/whatsapp',
      compatibilidade: 'POST /webhook/whatsapp',
      legado: 'POST /api/whatsapp/webhook',
      verificacao: 'GET /api/webhook/whatsapp ou /webhook/whatsapp'
    },
    comandos: {
      'AJUDA/OI/OLA': 'Abre menu de ajuda',
      '1': 'Minhas consultas',
      '2': 'Horário de funcionamento',
      '3': 'Endereço / Como chegar',
      '4': 'Emissão da 2ª via de boleto',
      '5': 'Trocar foto de perfil',
      '6': 'Enviar documento',
      '7': 'Cheguei na clínica',
      '0': 'Sair'
    }
  });
};

app.get('/api/webhook/whatsapp', responderStatusWebhook);
app.get('/webhook/whatsapp', responderStatusWebhook);

// Diagnóstico
app.use('/api', diagnosticoRoutes);
app.use('/api/diagnostico', diagnosticoRoutes);
console.log('   ✅ /api/diagnostico');

// ==================== ROTAS NOVAS (ANTES FALTANDO) ====================
console.log('\n📋 Carregando rotas adicionais...\n');

app.use('/api/prontuarios', prontuariosRoutes);
console.log('   ✅ /api/prontuarios');

app.use('/api/procedimentos', procedimentosRoutes);
console.log('   ✅ /api/procedimentos');

// ⭐ Procedimentos do Prontuário (múltiplos por consulta)
const procedimentosProntuarioRoutes = require(path.join(SERVER_DIR, 'routes/procedimentos-prontuario'));
app.use('/api/procedimentos-prontuario', procedimentosProntuarioRoutes);
console.log('   ✅ /api/procedimentos-prontuario');

// ⭐ Avaliações do Prontuário (múltiplos por consulta)
const avaliacoesProntuarioRoutes = require(path.join(SERVER_DIR, 'routes/avaliacoes-prontuario'));
app.use('/api/avaliacoes-prontuario', avaliacoesProntuarioRoutes);
console.log('   ✅ /api/avaliacoes-prontuario');

app.use('/api/atendimentos', atendimentosRoutes);
console.log('   ✅ /api/atendimentos');

app.use('/api/documentos', documentosRoutes);
console.log('   ✅ /api/documentos');

app.use('/api/financeiro', financeiroRoutes);
console.log('   ✅ /api/financeiro');

app.use('/api/parcelas', parcelasRoutes);
console.log('   ✅ /api/parcelas');

app.use('/api/dependentes', dependentesRoutes);
console.log('   ✅ /api/dependentes');

app.use('/api/empresas-conveniadas', empresasConveniadasRoutes);
console.log('   ✅ /api/empresas-conveniadas');

// Planos de Saúde (convênios das clínicas)
app.use('/api/planos-saude', planosSaudeRoutes);
console.log('   ✅ /api/planos-saude');

// ⭐ NOVO: Planos do Sistema (Grátis, Básico, Profissional)
app.use('/api/planos', planosRoutes);
console.log('   ✅ /api/planos');

// Memed Profissionais
app.use('/api/memed-profissionais', memedProfissionaisRoutes);
console.log('   ✅ /api/memed-profissionais');

// Medicamentos
app.use('/api/medicamentos', medicamentosRoutes);
console.log('   ✅ /api/medicamentos');

// ⭐ NOVO: Carteirinha Digital
app.use('/api/carteirinha', carteirinhaRoutes);
console.log('   ✅ /api/carteirinha');

// ⭐ NOVO: Especialidades
app.use('/api/especialidades', especialidadesRoutes);
console.log('   ✅ /api/especialidades');

// ⭐ NOVO: CID-10
app.use('/api/cid10', cid10Routes);
console.log('   ✅ /api/cid10');

// ⭐ NOVO: Convênios
app.use('/api/convenios', conveniosRoutes);
console.log('   ✅ /api/convenios');

// ⭐ NOVO: Anamneses (tabela separada por etapa)
app.use('/api/anamneses', anamnesesRoutes);
console.log('   ✅ /api/anamneses');

// ⭐ NOVO: Evoluções (tabela separada por etapa)
app.use('/api/evolucoes', evolucoesRoutes);
console.log('   ✅ /api/evolucoes');

// ⭐ NOVO: Exames Físicos (tabela separada por etapa)
app.use('/api/exames-fisicos', examesFisicosRoutes);
console.log('   ✅ /api/exames-fisicos');

// ⭐ NOVO: Diagnósticos (tabela separada por etapa)
app.use('/api/diagnosticos', diagnosticosRoutes);
console.log('   ✅ /api/diagnosticos');

// ⭐ NOVO: Exames Solicitados (tabela separada por etapa)
if (examesSolicitadosRoutes) {
  app.use('/api/exames-solicitados', examesSolicitadosRoutes);
  console.log('   ✅ /api/exames-solicitados');
} else {
  console.log('   ⚠️ /api/exames-solicitados - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Padrões de Exames (por profissional)
if (padroesExamesRoutes) {
  app.use('/api/padroes-exames', padroesExamesRoutes);
  console.log('   ✅ /api/padroes-exames');
} else {
  console.log('   ⚠️ /api/padroes-exames - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Prescrições (tabela separada por etapa)
app.use('/api/prescricoes', prescricoesRoutes);
console.log('   ✅ /api/prescricoes');

// ⭐ NOVO: Relatórios (tabela separada por etapa)
if (relatoriosRoutes) {
  app.use('/api/relatorios', relatoriosRoutes);
  console.log('   ✅ /api/relatorios');
} else {
  console.log('   ⚠️ /api/relatorios - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Padrões de Relatórios (por profissional)
if (padroesRelatoriosRoutes) {
  app.use('/api/padroes-relatorios', padroesRelatoriosRoutes);
  console.log('   ✅ /api/padroes-relatorios');
} else {
  console.log('   ⚠️ /api/padroes-relatorios - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Padrões de Prescrições (por profissional)
if (padroesPrescricoesRoutes) {
  app.use('/api/padroes-prescricoes', padroesPrescricoesRoutes);
  console.log('   ✅ /api/padroes-prescricoes');
} else {
  console.log('   ⚠️ /api/padroes-prescricoes - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Atestados (Lei 14.724/2023)
if (atestadosRoutes) {
  app.use('/api/atestados', atestadosRoutes);
  console.log('   ✅ /api/atestados');
} else {
  console.log('   ⚠️ /api/atestados - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Log de Auditoria (LGPD)
app.use('/api/audit-log', auditLogRoutes);
console.log('   ✅ /api/audit-log');

// ⭐ NOVO: Configurações Bancárias (boletos registrados)
if (configuracoesBancoRoutes) {
  app.use('/api/configuracoes-banco', configuracoesBancoRoutes);
  console.log('   ✅ /api/configuracoes-banco');
} else {
  console.log('   ⚠️ /api/configuracoes-banco - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Boletos Itaú (API registrada)
if (boletosItauRoutes) {
  app.use('/api/boletos-itau', boletosItauRoutes);
  console.log('   ✅ /api/boletos-itau');
} else {
  console.log('   ⚠️ /api/boletos-itau - NÃO DISPONÍVEL');
}

// ⭐ NOVO: PrintServer (impressão remota via WebSocket)
if (printserverRoutes) {
  app.use('/api/printserver', printserverRoutes);
  console.log('   ✅ /api/printserver');
} else {
  console.log('   ⚠️ /api/printserver - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Exames Gratuitos (por clínica)
if (examesGratuitosRoutes) {
  app.use('/api/exames-gratuitos', examesGratuitosRoutes);
  console.log('   ✅ /api/exames-gratuitos');
} else {
  console.log('   ⚠️ /api/exames-gratuitos - NÃO DISPONÍVEL');
}

// ⭐ NOVO: Importações
app.use('/api/importacao', importacaoRoutes);
console.log('   ✅ /api/importacao');

// ⭐ NOVO: Ponto / Frequência de funcionários (marcação automática por horário)
if (pontoRoutes) {
  app.use('/api/ponto', pontoRoutes);
  console.log('   ✅ /api/ponto');
} else {
  console.log('   ⚠️ /api/ponto - NÃO DISPONÍVEL');
}

// ⭐ Biometria por impressão digital (DigitalPersona)
if (biometriaRoutes) {
  app.use('/api/biometria', biometriaRoutes);
  console.log('   ✅ /api/biometria');
} else {
  console.log('   ⚠️ /api/biometria - NÃO DISPONÍVEL');
}

// Assinaturas Digitais
console.log('\n📝 Tentando carregar rotas de assinaturas...');
let assinaturasRoutes;
try {
  assinaturasRoutes = require(path.join(SERVER_DIR, 'routes/assinaturas'));
  console.log('   📝 Módulo assinaturas carregado, registrando rota...');
  app.use('/api/assinaturas', assinaturasRoutes);
  console.log('   ✅ /api/assinaturas - REGISTRADO COM SUCESSO');
} catch (err) {
  console.error('   ❌ /api/assinaturas - Erro ao carregar:', err.message);
  console.error('   ❌ Stack:', err.stack);
}

// ==================== SSE (Server-Sent Events) PARA ATUALIZAÇÕES EM TEMPO REAL ====================
// Mapa de clientes SSE conectados por pacienteId
const sseClients = new Map(); // pacienteId -> Set<response>

// Rota SSE para receber atualizações de foto do paciente
app.get('/api/sse/paciente/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;

  console.log(`📡 SSE: Cliente conectando para paciente ${pacienteId}`);

  // Configura headers para SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Adiciona cliente ao mapa
  if (!sseClients.has(pacienteId)) {
    sseClients.set(pacienteId, new Set());
  }
  sseClients.get(pacienteId).add(res);

  console.log(`📡 SSE: ${sseClients.get(pacienteId).size} cliente(s) conectado(s) para paciente ${pacienteId}`);

  // Envia evento de conexão
  res.write(`event: connected\ndata: ${JSON.stringify({ pacienteId, timestamp: Date.now() })}\n\n`);

  // Heartbeat a cada 30 segundos
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Remove cliente quando desconectar
  req.on('close', () => {
    console.log(`📡 SSE: Cliente desconectado para paciente ${pacienteId}`);
    clearInterval(heartbeat);
    sseClients.get(pacienteId)?.delete(res);
    if (sseClients.get(pacienteId)?.size === 0) {
      sseClients.delete(pacienteId);
    }
  });
});

// Função para notificar clientes SSE sobre atualização de foto
function notificarFotoAtualizada(pacienteId, fotoUrl, pacienteNome) {
  const clients = sseClients.get(pacienteId);

  if (!clients || clients.size === 0) {
    console.log(`📡 SSE: Nenhum cliente conectado para paciente ${pacienteId}`);
    return;
  }

  const evento = {
    type: 'foto_atualizada',
    pacienteId,
    pacienteNome,
    fotoUrl,
    timestamp: Date.now()
  };

  console.log(`📡 SSE: Notificando ${clients.size} cliente(s) sobre foto atualizada para ${pacienteNome}`);

  clients.forEach((client) => {
    try {
      client.write(`event: foto_atualizada\ndata: ${JSON.stringify(evento)}\n\n`);
    } catch (err) {
      console.error(`📡 SSE: Erro ao enviar notificação:`, err.message);
    }
  });
}

// Função para notificar clientes SSE sobre assinatura concluída
function notificarAssinatura(pacienteId, dados) {
  const clients = sseClients.get(pacienteId);

  if (!clients || clients.size === 0) {
    console.log(`📡 SSE: Nenhum cliente conectado para paciente ${pacienteId} (assinatura)`);
    return;
  }

  const evento = {
    ...dados,
    pacienteId,
    timestamp: Date.now()
  };

  console.log(`📡 SSE: Notificando ${clients.size} cliente(s) sobre assinatura para paciente ${pacienteId}`);

  clients.forEach((client) => {
    try {
      client.write(`event: assinatura\ndata: ${JSON.stringify(evento)}\n\n`);
    } catch (err) {
      console.error(`📡 SSE: Erro ao enviar notificação de assinatura:`, err.message);
    }
  });
}

// ⭐ NOVA: Função para notificar clientes SSE sobre documento recebido
function notificarDocumentoRecebido(pacienteId, documento) {
  const clients = sseClients.get(pacienteId);

  if (!clients || clients.size === 0) {
    console.log(`📡 SSE: Nenhum cliente conectado para paciente ${pacienteId} (documento)`);
    return;
  }

  const evento = {
    type: 'documento_recebido',
    pacienteId,
    documento,
    timestamp: Date.now()
  };

  console.log(`📡 SSE: Notificando ${clients.size} cliente(s) sobre documento recebido para paciente ${pacienteId}`);

  clients.forEach((client) => {
    try {
      client.write(`event: documento_recebido\ndata: ${JSON.stringify(evento)}\n\n`);
    } catch (err) {
      console.error(`📡 SSE: Erro ao enviar notificação de documento:`, err.message);
    }
  });
}

global.notificarFotoAtualizada = notificarFotoAtualizada;
global.sseClients = sseClients;
global.notificarAssinatura = notificarAssinatura;
global.notificarDocumentoRecebido = notificarDocumentoRecebido;

console.log('   ✅ /api/sse/paciente/:pacienteId (SSE)');

// ==================== ROTAS DE SISTEMA ====================

// Versão — use este endpoint para confirmar que a API publicada recebeu o release.
app.get('/api/version', (req, res) => {
  res.json({
    version: SERVER_VERSION,
    build: BUILD_DATE,
    deploymentMarker: DEPLOYMENT_MARKER,
    startedAt: SERVER_STARTED_AT,
    sourceModifiedAt: SERVER_FILE_MODIFIED_AT,
    complete: true
  });
});

// Fallback de health. A rota de diagnóstico registrada acima atende /api/health,
// mas mantém a mesma identidade caso a ordem das rotas mude no futuro.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: SERVER_VERSION,
    build: BUILD_DATE,
    deploymentMarker: DEPLOYMENT_MARKER,
    startedAt: SERVER_STARTED_AT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==================== INICIALIZAÇÃO ASSÍNCRONA (MySQL) ====================
// dbGlobal já importado no topo do arquivo
const { initAllClinicas } = require(path.join(SERVER_DIR, 'databaseClinica'));

async function startServer() {
  try {
    // 1. Inicializa banco global MySQL
    console.log('\n🔄 Inicializando banco de dados MySQL...\n');
    await dbGlobal.init();

    // 2. Pré-inicializa bancos de clínicas
    await initAllClinicas();

    // 3. ⚠️ A limpeza de aberturas "sem marcação" foi REMOVIDA: ela apagava do
    // banco os dias liberados pelo usuário que ainda não tinham paciente
    // marcado, fazendo o cadeado voltar. Liberar o dia é definitivo.

    // 4. Roda migrações
    const { runAllMigrations } = require(path.join(SERVER_DIR, 'utils/migrations'));
    try {await runAllMigrations();} catch (e) {console.warn('⚠️ Migrações:', e.message);}

    // 5. Inicia o servidor HTTP
    console.log(`\n🔄 Tentando iniciar servidor na porta ${PORT}...`);

    // ⭐ Cria HTTP server para compartilhar com WebSocket Hub
    const http = require('http');
    const httpServer = http.createServer(app);

    // ⭐ Inicializa PrintServer WebSocket Hub
    try {
      const { PrintServerHub } = require(path.join(SERVER_DIR, 'services/printServerHub'));
      const printHub = new PrintServerHub(httpServer, {
        authToken: process.env.PRINTSERVER_TOKEN || null
      });
      app.locals.printHub = printHub;
      console.log('   ✅ PrintServer WebSocket Hub iniciado em /printserver');
    } catch (err) {
      console.error('   ⚠️ PrintServer Hub não inicializado:', err.message);
    }

    const server = httpServer.listen(PORT, '0.0.0.0', () => {
      console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                                                            ║');
      console.log('║   🏥 EASYCLIN API SERVER (MySQL)                          ║');
      console.log('║                                                            ║');
      console.log(`║   📌 Versão: ${SERVER_VERSION.padEnd(44)}║`);
      console.log(`║   📅 Build: ${BUILD_DATE.padEnd(45)}║`);
      console.log(`║   🌐 Porta: ${String(PORT).padEnd(45)}║`);
      console.log(`║   🗄️  DB: MySQL                                            ║`);
      console.log(`║   🖨️  WS: ws://localhost:${String(PORT).padEnd(38)}║`);
      console.log('║                                                            ║');
      console.log('║   ✅ Servidor iniciado com sucesso!                       ║');
      console.log('║                                                            ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('\n');
      console.log('✅ Todas as rotas estão disponíveis!');
      console.log('\n');

      // ⭐ CRON: Felicitação de Aniversário automática
      // Verifica a cada hora; envia entre 8h-9h da manhã
      const iniciarCronAniversario = () => {
        console.log('🎂 [CRON] Cron de aniversário iniciado (verifica a cada hora)');
        setInterval(async () => {
          const agora = new Date();
          const hora = agora.getHours();
          if (hora !== 8) return; // Só envia às 8h da manhã

          console.log('🎂 [CRON] Verificando aniversariantes do dia...');
          try {
            // Busca todas as clínicas
            const clinicas = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE ativa = 1').all();
            for (const clinica of clinicas) {
              try {
                // ⚠️ A verificação do `habilitado` NÃO é repetida aqui de
                // propósito: duas cópias da mesma regra divergem com o tempo, e
                // foi assim que a felicitação continuou saindo mesmo desativada.
                // A trava vive no endpoint /enviar-todos, que recusa o lote.

                // Usa fetch interno para chamar o próprio endpoint
                const url = `http://localhost:${PORT}/api/aniversarios/enviar-todos`;
                const resp = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ clinicaId: clinica.id })
                });
                const result = await resp.json();
                if (result.disabled) {
                  console.log(`🎂 [CRON] Felicitação desativada para clínica ${clinica.nome} — lote recusado pelo endpoint`);
                } else if (result.enviados > 0) {
                  console.log(`🎂 [CRON] Clínica ${clinica.nome}: ${result.enviados} felicitações enviadas`);
                }
              } catch (err) {
                console.error(`🎂 [CRON] Erro na clínica ${clinica.id}:`, err.message);
              }
            }
          } catch (err) {
            console.error('🎂 [CRON] Erro geral:', err.message);
          }
        }, 3600000); // 1 hora
      };
      // Inicia cron após 30s de delay
      setTimeout(iniciarCronAniversario, 30000);

      // ⭐ Listener persistente de PONTO do leitor biométrico (DigitalPersona).
      // Escuta o evento `ponto_marcado` do app WPF e grava o ponto. Sem ele, as
      // marcações feitas no leitor nunca chegavam ao servidor.
      try {
        const { iniciarBiometriaPontoListener } = require(path.join(SERVER_DIR, 'services/biometriaPontoListener'));
        setTimeout(iniciarBiometriaPontoListener, 5000);
        console.log('   ✅ Listener de ponto biométrico (DigitalPersona) agendado');
      } catch (err) {
        console.error('   ⚠️ Listener de ponto biométrico não iniciado:', err.message);
      }

    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌❌❌ ERRO: Porta ${PORT} já está em uso!`);
        console.error(`💡 Execute: kill $(lsof -t -i:${PORT})`);
      } else {
        console.error(`\n❌❌❌ ERRO ao iniciar servidor:`, err.message);
      }
      process.exit(1);
    });

    setTimeout(() => {
      if (!server.listening) {
        console.error('\n⏰ TIMEOUT: Servidor não iniciou em 10 segundos!');
        process.exit(1);
      }
    }, 10000);

  } catch (err) {
    console.error('\n❌❌❌ ERRO FATAL ao inicializar:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// ⭐ Remove a inicialização síncrona antiga e substitui pela async
// Remove: const { runAllMigrations } = require(...)
// Remove: runAllMigrations();
// Remove: const server = app.listen(...)
// Remove: server.on('error', ...)
// Remove: setTimeout(...)

startServer();

module.exports = app;