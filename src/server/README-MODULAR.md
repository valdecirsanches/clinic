
# 🏥 EasyClin API Server - Estrutura Modular

## 📁 Estrutura de Arquivos

```
server/
├── server.js                 # Servidor original (completo, com webhook)
├── server-modular.js         # Servidor modular (sem webhook ainda)
├── config/
│   └── index.js              # Configurações (versão, porta, etc)
├── middleware/
│   └── upload.js             # Configuração de upload de arquivos
├── routes/
│   ├── operadoras.js         # CRUD de operadoras
│   ├── clinicas.js           # CRUD de clínicas
│   ├── usuarios.js           # CRUD de usuários + login
│   ├── pacientes.js          # CRUD de pacientes + foto
│   ├── consultas.js          # CRUD de consultas
│   ├── agendas.js            # CRUD de agendas + horários
│   ├── configuracoes.js      # Configs globais + WhatsApp
│   ├── mensagens.js          # Histórico de mensagens
│   ├── whatsapp.js           # Proxy para API WhatsApp
│   └── diagnostico.js        # Endpoints de diagnóstico
├── utils/
│   ├── helpers.js            # Funções auxiliares
│   └── migrations.js         # Migrações de banco
├── databaseGlobal.js         # Conexão banco global
└── databaseClinica.js        # Conexão bancos por clínica
```

## 🚀 Como Usar

### Opção 1: Servidor Original (Recomendado por enquanto)
```bash
cd server
node server.js
```
O servidor original contém TODAS as funcionalidades, incluindo o webhook do WhatsApp.

### Opção 2: Servidor Modular (Em desenvolvimento)
```bash
cd server
node server-modular.js
```
⚠️ **ATENÇÃO**: O servidor modular ainda NÃO inclui:
- Webhook do WhatsApp (`/api/webhook/whatsapp`)
- Rotas de prontuários
- Rotas de documentos
- Rotas de assinaturas
- Rotas de parcelas/financeiro
- SSE (Server-Sent Events)

## 📋 Rotas Disponíveis

### Entidades Principais
| Rota | Descrição |
|------|-----------|
| `GET/POST /api/operadoras` | Lista/Cria operadoras |
| `PUT/DELETE /api/operadoras/:id` | Atualiza/Deleta operadora |
| `GET/POST /api/clinicas` | Lista/Cria clínicas |
| `PUT/DELETE /api/clinicas/:id` | Atualiza/Deleta clínica |
| `GET/POST /api/usuarios` | Lista/Cria usuários |
| `PUT/DELETE /api/usuarios/:id` | Atualiza/Deleta usuário |
| `POST /api/auth/login` | Login de usuário |

### Pacientes
| Rota | Descrição |
|------|-----------|
| `GET /api/pacientes?clinicaId=X` | Lista pacientes (paginado) |
| `GET /api/pacientes/:id?clinicaId=X` | Busca paciente por ID |
| `POST /api/pacientes` | Cria paciente |
| `PUT /api/pacientes/:id` | Atualiza paciente |
| `DELETE /api/pacientes/:id?clinicaId=X` | Deleta paciente (soft delete) |
| `POST /api/pacientes/foto` | Upload de foto |

### Consultas e Agendas
| Rota | Descrição |
|------|-----------|
| `GET/POST /api/consultas?clinicaId=X` | Lista/Cria consultas |
| `PUT/DELETE /api/consultas/:id` | Atualiza/Deleta consulta |
| `GET/POST /api/agendas?clinicaId=X` | Lista/Cria agendas |
| `PUT/DELETE /api/agendas/:id` | Atualiza/Deleta agenda |

### Configurações
| Rota | Descrição |
|------|-----------|
| `GET /api/configuracoes-globais/:chave` | Busca config global |
| `POST /api/configuracoes-globais` | Salva config global |
| `GET /api/whatsapp-config?clinicaId=X` | Busca config WhatsApp |
| `POST /api/whatsapp-config` | Salva config WhatsApp |

### Mensagens
| Rota | Descrição |
|------|-----------|
| `GET /api/mensagens?clinicaId=X` | Lista mensagens |
| `POST /api/mensagens` | Salva mensagem |
| `PUT /api/mensagens/:id` | Atualiza status |
| `DELETE /api/mensagens?clinicaId=X&pacienteId=Y` | Deleta mensagens |

### WhatsApp (Proxy)
| Rota | Descrição |
|------|-----------|
| `POST /api/whatsapp/send-message` | Envia mensagem texto |
| `POST /api/whatsapp/send-media` | Envia mídia (URL) |
| `POST /api/whatsapp/send-media-base64` | Envia mídia (base64) |
| `POST /api/whatsapp/contact-info` | Busca info do contato |
| `GET /api/whatsapp/status` | Status da sessão |

### Diagnóstico
| Rota | Descrição |
|------|-----------|
| `GET /api/health` | Health check |
| `GET /api/version` | Versão do servidor |
| `GET /api/diagnostico/mensagens/:clinicaId` | Diagnóstico de mensagens |
| `POST /api/diagnostico/mensagens/teste` | Testa gravação de mensagem |
| `GET /api/diagnostico/tabelas/:clinicaId` | Lista tabelas da clínica |

## 🔧 Migrações

As migrações são executadas automaticamente na inicialização do servidor:

1. **Usuários**: Adiciona colunas `crm`, `uf`, `cpf`, `telefone`, `dataNascimento`
2. **Clínicas**: Adiciona coluna `plano`
3. **Operadoras**: Adiciona coluna `planoId`
4. **Consultas**: Adiciona colunas `motivoCancelamento`, `procedimentoId`, `procedimentoNome`, `duracao`
5. **Pacientes**: Adiciona coluna `fotoUrl`
6. **Prontuários**: Adiciona colunas `atualizadoEm`, `criadoEm`
7. **Assinaturas**: Cria tabela `assinaturas_pendentes`

## 📝 Próximos Passos para Modularização Completa

1. [ ] Separar webhook do WhatsApp em `routes/webhook.js`
2. [ ] Criar `routes/prontuarios.js`
3. [ ] Criar `routes/documentos.js`
4. [ ] Criar `routes/assinaturas.js`
5. [ ] Criar `routes/parcelas.js`
6. [ ] Criar `routes/sse.js` para Server-Sent Events
7. [ ] Atualizar `server-modular.js` para incluir todas as rotas
8. [ ] Testar completamente
9. [ ] Substituir `server.js` pelo modular

## 🐛 Debug

Para verificar se as mensagens estão sendo salvas:

```bash
# Via curl
curl "https://api.x-star.com.br/api/diagnostico/mensagens/SEU_CLINICA_ID"

# Teste de gravação
curl -X POST "https://api.x-star.com.br/api/diagnostico/mensagens/teste" \
  -H "Content-Type: application/json" \
  -d '{"clinicaId": "SEU_CLINICA_ID"}'
```
