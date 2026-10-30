
# 🖨️ PrintServer - Integração de Impressão Remota

## Arquitetura

```
[EasyClin API] ──HTTP──▶ [WebSocket Hub] ◀──WebSocket── [PrintServer Cliente A]
                                         ◀──WebSocket── [PrintServer Cliente B]
                                         ◀──WebSocket── [PrintServer Cliente C]
```

O Hub mantém conexões WebSocket persistentes com os PrintServers instalados nas máquinas dos clientes e roteia comandos de impressão via API REST.

## Configuração

### 1. Instalar dependência

```bash
cd server && npm install
```

O pacote `ws` já está no `package.json`.

### 2. Variáveis de ambiente (opcional)

No `.env.local`:

```env
# Token de autenticação para PrintServers (opcional, mas recomendado em produção)
PRINTSERVER_TOKEN=seu_token_secreto_aqui
```

Se definido, os PrintServers precisam enviar o token na conexão WebSocket.

### 3. Iniciar o servidor

```bash
node server/start-server.js
```

O Hub inicia automaticamente junto com o servidor HTTP na mesma porta.

---

## API REST

### Enviar Impressão

```
POST /api/printserver/imprimir
```

**Body:**
```json
{
  "clientId": "10765",
  "dados": [
    {"ACAO": "AUTENTICACAO"},
    {"contrato": "10765"},
    {"valor": "150.00"},
    {"usuario": "ADMINISTRADOR"},
    {"formapag": "1"},
    {"formapag_descricao": "DINHEIRO"},
    {"dt": "25/06/2020"},
    {"hr": "16:54:03"},
    {"parcela": "11"},
    {"vrparcela": "150.00"},
    {"vencto": "25/06/2020"},
    {"emp_nome": "MINHA CLINICA"},
    {"clinica": "Comprovante de pagamento/MINHA CLINICA"},
    {"nome_sacado": "JOAO DA SILVA"},
    {"matricula": "01.004.0017.00000010765"}
  ],
  "enqueue": false
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `clientId` | string | ✅ | ID do PrintServer (contrato do cliente) |
| `dados` | array | ✅ | Array de objetos com dados da impressão |
| `enqueue` | boolean | ❌ | Se `true`, enfileira quando cliente offline |

**Resposta (sucesso):**
```json
{
  "success": true,
  "jobId": "m1abc123def",
  "status": "sent",
  "message": "Impressão enviada para o PrintServer do cliente"
}
```

**Resposta (cliente offline, sem enqueue):**
```json
{
  "error": "PrintServer não conectado",
  "message": "O cliente precisa estar com o PrintServer aberto",
  "clientId": "10765"
}
```

### Tipos de Impressão (ACAO)

| ACAO | Descrição |
|------|-----------|
| `AUTENTICACAO` | Comprovante de pagamento |
| `TICKET` | Comprovante de agendamento |
| `RECIBO` | Recibo de procedimento |

---

### Listar PrintServers Conectados

```
GET /api/printserver/clientes
```

**Resposta:**
```json
{
  "total": 2,
  "clientes": [
    {
      "clientId": "10765",
      "clientName": "Clínica Centro",
      "impressoras": 2,
      "printers": [
        {"name": "EPSON TM-T20", "displayName": "EPSON TM-T20", "isDefault": true}
      ],
      "conectadoEm": "2026-03-26T10:00:00.000Z",
      "ultimoPing": "2026-03-26T10:05:00.000Z"
    }
  ]
}
```

### Status de um Cliente

```
GET /api/printserver/cliente/:clientId/status
```

**Resposta:**
```json
{
  "clientId": "10765",
  "connected": true,
  "message": "PrintServer online e pronto para imprimir"
}
```

### Status de um Job

```
GET /api/printserver/job/:jobId
```

**Resposta:**
```json
{
  "jobId": "m1abc123def",
  "clientId": "10765",
  "action": "AUTENTICACAO",
  "status": "success",
  "createdAt": "2026-03-26T10:00:00.000Z",
  "completedAt": "2026-03-26T10:00:02.000Z",
  "error": null
}
```

### Jobs de um Cliente

```
GET /api/printserver/cliente/:clientId/jobs?limit=50
```

### Estatísticas

```
GET /api/printserver/stats
```

**Resposta:**
```json
{
  "clientesConectados": 3,
  "totalJobs": 150,
  "jobsPendentes": 0,
  "jobsEnviados": 2,
  "jobsSucesso": 145,
  "jobsErro": 3,
  "jobsNaFila": 0
}
```

---

## Conexão WebSocket (lado do PrintServer)

### URL de Conexão

```
ws://seuservidor.com:5171/printserver?clientId=10765
```

Com autenticação:
```
ws://seuservidor.com:5171/printserver?clientId=10765&token=seu_token
```

### Protocolo de Mensagens

**1. Após conectar, registrar o PrintServer:**
```json
{
  "type": "register",
  "clientName": "Clínica Centro",
  "printers": [
    {"name": "EPSON TM-T20", "displayName": "EPSON TM-T20", "isDefault": true}
  ],
  "printerConfig": {
    "AUTENTICACAO": "EPSON TM-T20",
    "TICKET": "EPSON TM-T20",
    "RECIBO": "HP LaserJet"
  }
}
```

**2. Receber comando de impressão:**
```json
{
  "type": "print",
  "jobId": "m1abc123def",
  "action": "AUTENTICACAO",
  "data": {
    "ACAO": "AUTENTICACAO",
    "contrato": "10765",
    "valor": "150.00"
  }
}
```

**3. Enviar resultado da impressão:**
```json
{
  "type": "print_result",
  "jobId": "m1abc123def",
  "success": true,
  "error": null
}
```

Ou em caso de erro:
```json
{
  "type": "print_result",
  "jobId": "m1abc123def",
  "success": false,
  "error": "Impressora offline"
}
```

---

## Recursos

- ✅ **Autenticação por token** (opcional via `PRINTSERVER_TOKEN`)
- ✅ **Fila de jobs** — enfileira quando cliente offline, envia ao reconectar
- ✅ **Reconexão automática** — substitui conexão antiga sem duplicar
- ✅ **Ping/pong** — detecta clientes inativos (timeout 60s)
- ✅ **Rate limiting** — 60 req/min por IP
- ✅ **Cleanup automático** — remove jobs com mais de 24h
- ✅ **Estatísticas** — endpoint `/stats` para monitoramento

## Rate Limiting

As rotas REST têm limite de **60 requisições por minuto por IP**. Se excedido, retorna:

```json
{
  "error": "Muitas requisições",
  "message": "Limite de 60 requisições por minuto excedido.",
  "retryAfter": 45
}
```
