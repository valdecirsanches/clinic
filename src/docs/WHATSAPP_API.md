
# 📱 WhatsApp API - Guia Completo

Documentação completa da integração com a API do WhatsApp.

## 🚀 Início Rápido

```typescript
import { useWhatsAppApi } from '../hooks/useWhatsAppApi'

function MyComponent() {
  const api = useWhatsAppApi('https://seu-servidor.ngrok.io')
  
  // Enviar mensagem
  const handleSend = async () => {
    await api.sendMessage('teste', {
      number: '5511999999999',
      message: 'Olá!'
    })
  }
  
  return <button onClick={handleSend}>Enviar</button>
}
```

## 📚 Índice

- [Sessões](#sessões)
- [Webhook](#webhook)
- [Mensagens](#mensagens)
- [Informações](#informações)
- [Monitoramento](#monitoramento)

---

## 🔐 Sessões

### Listar Sessões

```typescript
const sessions = await api.listSessions()
// Retorna: ['teste', 'producao', 'dev']
```

### Detalhes da Sessão

```typescript
const details = await api.getSessionDetails('teste')
// Retorna: { sessionId, status, qrCode, messageCount, ... }
```

### Criar Sessão

```typescript
await api.createSession({
  sessionId: 'nova-sessao',
  sessionName: 'Sessão de Produção',
  webhookUrl: 'https://meu-webhook.com/whatsapp'
})
```

### Inicializar (Gerar QR Code)

```typescript
await api.initializeSession('teste')
// Gera novo QR Code para escaneamento
```

### Reconectar (Sem QR Code)

```typescript
await api.reconnectSession('teste')
// Tenta reconectar sessão existente
```

### Desconectar

```typescript
await api.disconnectSession('teste')
// Desconecta mas mantém os dados
```

### Logout (Trocar Número)

```typescript
await api.logoutSession('teste', 'Trocar de número')
// Remove autenticação, permite novo QR Code
```

### Excluir Sessão

```typescript
await api.deleteSession('teste')
// Remove completamente a sessão
```

---

## 🔔 Webhook

### Configurar Webhook

```typescript
await api.updateWebhook('teste', {
  webhookUrl: 'https://meu-webhook.com/whatsapp'
})
```

### Testar Webhook

```typescript
await api.testWebhook('teste')
// Envia evento de teste para o webhook configurado
```

---

## 💬 Mensagens

### Mensagem de Texto

```typescript
await api.sendMessage('teste', {
  number: '5511999999999',
  message: 'Olá! Como posso ajudar?'
})
```

### Enviar Imagem

```typescript
await api.sendMedia('teste', {
  number: '5511999999999',
  mediaUrl: 'https://example.com/imagem.jpg',
  caption: 'Confira esta imagem!',
  mediaType: 'image'
})
```

### Enviar Documento

```typescript
await api.sendMedia('teste', {
  number: '5511999999999',
  mediaUrl: 'https://example.com/documento.pdf',
  fileName: 'Contrato.pdf',
  mediaType: 'document'
})
```

### Enviar Áudio

```typescript
await api.sendMedia('teste', {
  number: '5511999999999',
  mediaUrl: 'https://example.com/audio.mp3',
  mediaType: 'audio'
})
```

### Enviar Localização

```typescript
await api.sendLocation('teste', {
  number: '5511999999999',
  latitude: -23.5505,
  longitude: -46.6333,
  description: 'São Paulo, Brasil'
})
```

### Enviar Contato

```typescript
await api.sendContact('teste', {
  number: '5511999999999',
  contactName: 'João Silva',
  contactPhone: '5511988887777'
})
```

### Enviar Botões

```typescript
await api.sendButtons('teste', {
  number: '5511999999999',
  title: 'Escolha uma opção',
  body: 'Como podemos ajudar?',
  buttons: [
    { id: '1', text: 'Suporte' },
    { id: '2', text: 'Vendas' },
    { id: '3', text: 'Financeiro' }
  ]
})
```

---

## ℹ️ Informações

### Informações do Contato

```typescript
const info = await api.getContactInfo('teste', {
  number: '5511999999999'
})

// Retorna:
// {
//   success: true,
//   contact: {
//     number: '5511999999999',
//     name: 'João Silva',
//     profilePicUrl: 'https://...',
//     isRegistered: true
//   }
// }
```

### URL do QR Code

```typescript
const qrCodeUrl = api.getQrCodeImageUrl('teste')
// Retorna: 'https://servidor.com/api/sessions/teste/qrcode'

// Usar em uma imagem:
<img src={qrCodeUrl} alt="QR Code" />
```

---

## 🏥 Monitoramento

### Health Check Completo

```typescript
const health = await api.healthCheck()

// Retorna:
// {
//   status: 'OK',
//   sessions: { total: 6, connected: 4, disconnected: 2 },
//   server: { uptime: 1234, version: '1.0.0' }
// }
```

### Health Check Simples

```typescript
const health = await api.healthCheckSimple()
// Retorna: { status: 'ok' }
```

### Debug de Webhook

```typescript
await api.webhookDebug({
  event: 'message',
  data: { test: true }
})
```

---

## 🎯 Exemplos Práticos

### Enviar Lembrete de Consulta

```typescript
async function enviarLembreteConsulta(
  sessionId: string,
  paciente: { nome: string; telefone: string },
  consulta: { data: string; horario: string; profissional: string }
) {
  const api = useWhatsAppApi('https://servidor.ngrok.io')
  
  const mensagem = `
Olá ${paciente.nome}! 👋

Lembramos que você tem uma consulta agendada:

📅 Data: ${consulta.data}
🕐 Horário: ${consulta.horario}
👨‍⚕️ Profissional: ${consulta.profissional}

Por favor, confirme sua presença respondendo esta mensagem.
  `.trim()
  
  await api.sendMessage(sessionId, {
    number: paciente.telefone,
    message: mensagem
  })
}
```

### Enviar Resultado de Exame

```typescript
async function enviarResultadoExame(
  sessionId: string,
  paciente: { nome: string; telefone: string },
  exameUrl: string
) {
  const api = useWhatsAppApi('https://servidor.ngrok.io')
  
  // Primeiro envia mensagem
  await api.sendMessage(sessionId, {
    number: paciente.telefone,
    message: `Olá ${paciente.nome}! Seu resultado de exame está pronto.`
  })
  
  // Depois envia o documento
  await api.sendMedia(sessionId, {
    number: paciente.telefone,
    mediaUrl: exameUrl,
    fileName: 'Resultado_Exame.pdf',
    mediaType: 'document',
    caption: 'Resultado do seu exame'
  })
}
```

### Enviar Localização da Clínica

```typescript
async function enviarLocalizacaoClinica(
  sessionId: string,
  telefone: string
) {
  const api = useWhatsAppApi('https://servidor.ngrok.io')
  
  await api.sendLocation(sessionId, {
    number: telefone,
    latitude: -23.5505,
    longitude: -46.6333,
    description: 'Clínica Médica - Av. Paulista, 1000'
  })
}
```

---

## 🛠️ Tratamento de Erros

```typescript
const api = useWhatsAppApi('https://servidor.ngrok.io')

// Verificar erro
if (api.error) {
  console.error('Erro:', api.error)
}

// Limpar erro
api.clearError()

// Verificar loading
if (api.isLoading) {
  return <div>Carregando...</div>
}
```

---

## 🔥 Dicas e Boas Práticas

1. **Sempre use o header ngrok-skip-browser-warning**
   - Já incluído automaticamente no serviço

2. **Verifique o status da sessão antes de enviar**
   ```typescript
   const details = await api.getSessionDetails('teste')
   if (details?.isReady) {
     // Pode enviar mensagens
   }
   ```

3. **Use reconectar em vez de inicializar quando possível**
   ```typescript
   // Tenta reconectar primeiro (mais rápido)
   await api.reconnectSession('teste')
   
   // Se falhar, inicializa (gera QR Code)
   await api.initializeSession('teste')
   ```

4. **Configure webhook para receber eventos**
   ```typescript
   await api.updateWebhook('teste', {
     webhookUrl: 'https://meu-servidor.com/webhook'
   })
   ```

5. **Monitore a saúde do servidor**
   ```typescript
   const health = await api.healthCheck()
   if (health?.status !== 'OK') {
     // Servidor com problemas
   }
   ```

---

## 📦 Estrutura de Arquivos

```
services/
  └── whatsappApi.ts       # Serviço de API (classe)

hooks/
  └── useWhatsAppApi.ts    # Hook React customizado

components/
  └── WhatsAppApiDemo.tsx  # Componente de demonstração

docs/
  └── WHATSAPP_API.md      # Esta documentação
```

---

## 🚀 Próximos Passos

1. Teste as funcionalidades no componente de demonstração
2. Implemente envio de lembretes de consulta
3. Configure webhooks para receber mensagens
4. Adicione logs e monitoramento

---

**Desenvolvido com ❤️ para o Sistema de Clínica**
