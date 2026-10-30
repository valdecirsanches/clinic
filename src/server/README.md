# EasyClin API Server

## Servidor Principal

**Use `start-server.js` para iniciar o servidor:**

```bash
cd server
node start-server.js
```

Ou de qualquer diretório:
```bash
node server/start-server.js
```

## Estrutura Modular

O servidor usa uma arquitetura modular com rotas separadas em `server/routes/`:

- `auth.js` - Autenticação
- `operadoras.js` - Gestão de operadoras
- `clinicas.js` - Gestão de clínicas
- `usuarios.js` - Gestão de usuários
- `pacientes.js` - Gestão de pacientes
- `consultas.js` - Gestão de consultas
- `agendas.js` - Gestão de agendas
- `prontuarios.js` - Prontuários médicos
- `procedimentos.js` - Procedimentos
- `atendimentos.js` - Atendimentos
- `documentos.js` - Documentos
- `financeiro.js` - Financeiro
- `dependentes.js` - Dependentes
- `empresas-conveniadas.js` - Empresas conveniadas
- `memed-profissionais.js` - Integração Memed
- `configuracoes.js` - Configurações globais e WhatsApp
- `mensagens.js` - Histórico de mensagens
- `whatsapp.js` - Webhook e proxy WhatsApp
- `diagnostico.js` - Diagnóstico do sistema

## Endpoints Principais

### Autenticação
- `POST /api/auth/login` - Login

### Entidades
- `/api/operadoras` - CRUD de operadoras
- `/api/clinicas` - CRUD de clínicas
- `/api/usuarios` - CRUD de usuários
- `/api/pacientes` - CRUD de pacientes (por clínica)
- `/api/consultas` - CRUD de consultas (por clínica)
- `/api/agendas` - CRUD de agendas (por clínica)

### Funcionalidades
- `/api/prontuarios` - Prontuários médicos
- `/api/procedimentos` - Procedimentos
- `/api/atendimentos` - Atendimentos
- `/api/documentos` - Upload de documentos
- `/api/financeiro` - Gestão financeira
- `/api/dependentes` - Dependentes de pacientes
- `/api/empresas-conveniadas` - Empresas conveniadas
- `/api/memed-profissionais` - Integração Memed

### Configurações
- `/api/configuracoes-globais` - Configurações globais
- `/api/whatsapp-config` - Configuração do WhatsApp

### WhatsApp
- `/api/whatsapp/webhook` - Webhook principal
- `/api/webhook/whatsapp` - Webhook alternativo (compatibilidade)
- `/api/whatsapp/send-message` - Enviar mensagem
- `/api/whatsapp/status` - Status da sessão
- `/api/mensagens` - Histórico de mensagens

### Sistema
- `GET /api/health` - Health check
- `GET /api/version` - Versão do servidor
- `GET /api/diagnostico/*` - Diagnóstico

## Versão

- **Versão:** 1.7.0
- **Build:** 2026-02-02