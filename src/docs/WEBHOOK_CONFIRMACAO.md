# Webhook de Confirmação de Consulta via WhatsApp

## Visão Geral

O EasyClin possui um webhook para processar respostas de confirmação de consulta enviadas pelos pacientes via WhatsApp.

## Endpoint

```
POST /api/webhook/whatsapp
GET  /api/webhook/whatsapp (verificação)
```

## Respostas Aceitas

| Resposta | Ação | Novo Status |
|----------|------|-------------|
| **1** | Confirma a consulta | `confirmada` |
| **2** | Cancela a consulta | `cancelada` |

> **Nota:** A opção "Remarcar" (antiga opção 3) foi removida na v2.2. Agora são apenas 2 opções para simplificar a experiência do paciente.

## Formato do Payload (POST)

O webhook aceita diferentes formatos de payload para compatibilidade com diversos servidores WhatsApp:

```json
{
  "from": "5511999999999@c.us",
  "body": "1",
  "sessionName": "minha_clinica_c123456"
}
```

### Campos Aceitos

| Campo | Alternativas | Descrição |
|-------|--------------|-----------|
| `from` | `phone`, `number` | Número do remetente |
| `body` | `message`, `text` | Conteúdo da mensagem |
| `sessionName` | - | Nome da sessão WhatsApp |
| `clinicaId` | - | ID da clínica (opcional) |

## Fluxo de Processamento

1. **Recebe a mensagem** do servidor WhatsApp
2. **Normaliza o telefone** (remove @c.us, caracteres especiais)
3. **Verifica se é resposta válida** (1, 2 ou 3)
4. **Busca a clínica** pelo sessionName ou em todas as clínicas
5. **Busca o paciente** pelo telefone
6. **Busca consulta pendente** do paciente
7. **Atualiza o status** da consulta
8. **Envia resposta automática** ao paciente (se configurado)

## Resposta do Webhook

### Sucesso - Mensagem Processada
```json
{
  "success": true,
  "processed": true,
  "consultaId": "cons1234567890",
  "paciente": "João da Silva",
  "resposta": "1",
  "novoStatus": "confirmada",
  "respostaEnviada": true
}
```

### Sucesso - Mensagem Não Processada
```json
{
  "success": true,
  "processed": false,
  "reason": "Mensagem não é uma resposta de confirmação (esperado: 1, 2 ou 3)"
}
```

### Erro
```json
{
  "success": false,
  "error": "Descrição do erro"
}
```

## Configuração no Servidor WhatsApp

### WPPConnect / Baileys

Configure o webhook no seu servidor WhatsApp para enviar mensagens recebidas para:

```
https://seu-servidor.com/api/webhook/whatsapp
```

Exemplo de configuração no WPPConnect:
```javascript
// Ao receber mensagem
client.onMessage(async (message) => {
  await fetch('https://api.x-star.com.br/api/webhook/whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: message.from,
      body: message.body,
      sessionName: 'nome_da_sessao'
    })
  });
});
```

### WhatsApp Business API

Configure o webhook URL nas configurações da API:
```
https://api.x-star.com.br/api/webhook/whatsapp
```

## Mensagens Automáticas de Resposta

Quando o paciente responde, o sistema envia automaticamente uma mensagem de confirmação:

### Resposta 1 (Confirma)
```
✅ Consulta CONFIRMADA!

📅 Data: 15/01/2025
🕐 Horário: 14:30
👨‍⚕️ Profissional: Dr. João Silva

Agradecemos a confirmação! Até breve! 😊
```

### Resposta 2 (Cancela)
```
❌ Consulta CANCELADA.

📅 Data: 15/01/2025
🕐 Horário: 14:30

Sua consulta foi cancelada conforme solicitado. Caso precise reagendar, entre em contato conosco.
```

## Requisitos para Funcionamento

1. **Lembrete ou confirmação enviada**: A consulta deve ter `lembreteEnviado = 1`
2. **Status válido**: A consulta deve estar com status `agendada` ou `aguardando_confirmacao`
3. **Data futura**: A consulta deve ser para hoje ou data futura
4. **Telefone cadastrado**: O paciente deve ter telefone cadastrado
5. **Sem resposta anterior**: O campo `confirmacaoRecebidaEm` deve ser NULL

## Testando o Webhook

### Via cURL
```bash
curl -X POST https://api.x-star.com.br/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5511999999999",
    "body": "1",
    "sessionName": "minha_clinica"
  }'
```

### Via JavaScript
```javascript
fetch('https://api.x-star.com.br/api/webhook/whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: '5511999999999',
    body: '1',
    sessionName: 'minha_clinica'
  })
})
.then(res => res.json())
.then(console.log);
```

## Verificação do Webhook

Para verificar se o webhook está ativo:

```bash
curl https://api.x-star.com.br/api/webhook/whatsapp
```

Resposta esperada:
```json
{
  "status": "ok",
  "message": "Webhook EasyClin ativo",
  "endpoints": {
    "confirmacao": "POST /api/webhook/whatsapp",
    "verificacao": "GET /api/webhook/whatsapp"
  },
  "respostas": {
    "1": "Confirma consulta",
    "2": "Cancela consulta"
  }
}
```

## Logs

O webhook gera logs detalhados no console do servidor:

```
📩 ==================== WEBHOOK WHATSAPP ====================
📥 POST /api/webhook/whatsapp - Mensagem recebida
📦 Body: { "from": "5511999999999", "body": "1" }
📱 Número limpo: 5511999999999
💬 Mensagem: 1
🏥 Clínica encontrada: c1234567890
📋 Consulta encontrada: { id: "cons123", paciente: "João", ... }
✅ Status da consulta cons123 atualizado para: confirmada
📤 Enviando resposta automática...
✅ Resposta automática enviada com sucesso!
==================== FIM WEBHOOK ====================
```