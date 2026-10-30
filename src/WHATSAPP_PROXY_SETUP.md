
# 📱 Configuração dos Endpoints Proxy do WhatsApp

## ⚠️ IMPORTANTE
Estes endpoints devem ser adicionados ao servidor de produção `https://api.x-star.com.br`

## 🎯 Endpoints Necessários

### 1. POST /api/whatsapp/send-message
Envia mensagem via WhatsApp

### 2. POST /api/whatsapp/contact-info
Busca informações e foto do contato

### 3. GET /api/whatsapp/status
Verifica status da sessão WhatsApp

---

## 📝 Código para Adicionar no Servidor

Adicione este código no arquivo principal do servidor (ex: `server.js`):

```javascript
// ==================== WHATSAPP PROXY ====================

// POST /api/whatsapp/send-message - Proxy para enviar mensagem
app.post('/api/whatsapp/send-message', async (req, res) => {
  const { serverUrl, sessionName, number, message } = req.body;
  
  console.log('📤 POST /api/whatsapp/send-message - Proxy');
  console.log('   - serverUrl:', serverUrl);
  console.log('   - sessionName:', sessionName);
  console.log('   - number:', number);
  
  if (!serverUrl || !sessionName || !number || !message) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
  }
  
  try {
    const url = `${serverUrl}/api/sessions/${sessionName}/send-message`;
    console.log('🔗 Chamando:', url);
    
    // Usa fetch nativo do Node.js 18+ (sem precisar de node-fetch)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ number, message }),
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro ao enviar mensagem:', errorText);
      return res.status(response.status).json({ 
        success: false,
        error: errorText 
      });
    }
    
    const data = await response.json();
    console.log('✅ Mensagem enviada com sucesso:', data);
    
    res.json(data);
  } catch (err) {
    console.error('❌ Erro no proxy de envio:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Erro ao enviar mensagem' 
    });
  }
});

// POST /api/whatsapp/contact-info - Proxy para buscar info do contato
app.post('/api/whatsapp/contact-info', async (req, res) => {
  const { serverUrl, sessionName, number } = req.body;
  
  console.log('📞 POST /api/whatsapp/contact-info - Proxy');
  console.log('   - serverUrl:', serverUrl);
  console.log('   - sessionName:', sessionName);
  console.log('   - number:', number);
  
  if (!serverUrl || !sessionName || !number) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
  }
  
  try {
    const url = `${serverUrl}/api/sessions/${sessionName}/contact-info`;
    console.log('🔗 Chamando:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ number }),
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro ao buscar contato:', errorText);
      return res.status(response.status).json({ 
        success: false,
        error: errorText 
      });
    }
    
    const data = await response.json();
    console.log('✅ Contato encontrado:', data);
    
    res.json(data);
  } catch (err) {
    console.error('❌ Erro no proxy de contato:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Erro ao buscar contato' 
    });
  }
});

// GET /api/whatsapp/status - Proxy para buscar status da sessão
app.get('/api/whatsapp/status', async (req, res) => {
  const { serverUrl, sessionName } = req.query;
  
  console.log('🔍 GET /api/whatsapp/status - Proxy');
  console.log('   - serverUrl:', serverUrl);
  console.log('   - sessionName:', sessionName);
  
  if (!serverUrl || !sessionName) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
  }
  
  try {
    const url = `${serverUrl}/api/sessions/${sessionName}`;
    console.log('🔗 Chamando:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro ao buscar status:', errorText);
      return res.status(response.status).json({ 
        success: false,
        error: errorText 
      });
    }
    
    const data = await response.json();
    console.log('✅ Status obtido:', data);
    
    res.json(data);
  } catch (err) {
    console.error('❌ Erro no proxy de status:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Erro ao buscar status' 
    });
  }
});
```

---

## ✅ Checklist de Instalação

- [ ] Copiar código acima
- [ ] Colar no arquivo principal do servidor (`server.js`)
- [ ] Colocar **ANTES** da linha `app.listen(PORT, ...)`
- [ ] Reiniciar o servidor
- [ ] Testar com curl:
  ```bash
  curl -X POST https://api.x-star.com.br/api/whatsapp/contact-info \
    -H "Content-Type: application/json" \
    -d '{"serverUrl":"https://whatsapp.x-star.com.br","sessionName":"teste","number":"5511980361080"}'
  ```
- [ ] Deve retornar dados do contato ✅

---

## 🔧 Requisitos

- Node.js 18+ (para usar `fetch` nativo)
- Se usar Node.js < 18, instale: `npm install node-fetch`
- CORS já configurado no servidor (`app.use(cors())`)

---

## 🎯 Resultado Esperado

Depois de adicionar os endpoints:
1. ✅ Frontend chama `https://api.x-star.com.br/api/whatsapp/contact-info`
2. ✅ Servidor proxy chama `https://whatsapp.x-star.com.br/api/sessions/teste/contact-info`
3. ✅ Retorna foto do contato
4. ✅ Sem erros de CORS!
