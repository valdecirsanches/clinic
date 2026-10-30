
# 🏦 Integração API Itaú - Boletos Registrados

## ✅ O QUE FOI IMPLEMENTADO

Sistema completo de integração com a **API oficial do Itaú** para emissão de **boletos bancários registrados** com confirmação automática de pagamento.

### Funcionalidades:

1. ✅ **OAuth 2.0** - Autenticação automática com renovação de token
2. ✅ **Registro de Boletos** - Geração via API oficial do Itaú
3. ✅ **Código de Barras Real** - Retornado pela API do banco
4. ✅ **Linha Digitável Real** - Gerada pelo Itaú
5. ✅ **Consulta de Situação** - Verifica status do boleto
6. ✅ **Webhook** (futuro) - Notificação automática de pagamentos

---

## 📋 PRÉ-REQUISITOS

Para usar boletos registrados do Itaú, você precisa:

### 1. Conta Empresarial no Itaú
- CNPJ ativo
- Conta corrente empresarial

### 2. Convênio de Cobrança Registrada
- Solicite ao gerente do Itaú
- Aguarde homologação (2-4 semanas)
- Receba: **Carteira**, **Convênio**, **Código Cedente**

### 3. Credenciais da API Itaú
Acesse o **Portal Itaú Empresas** e solicite:
- **Client ID** (OAuth)
- **Client Secret** (OAuth)
- **Itaú Key** (chave de acesso à API)

### 4. Ambiente de Testes (Homologação)
- Solicite acesso ao ambiente de homologação
- Teste antes de usar em produção

---

## 🚀 CONFIGURAÇÃO

### Passo 1: Executar Migração do Banco de Dados

Adiciona os campos necessários na tabela `configuracoes_banco`:

```bash
cd server
node migrate-add-itau-oauth-fields.js
```

**Campos adicionados:**
- `clientId` - Client ID do OAuth
- `clientSecret` - Client Secret do OAuth
- `itauKey` - Chave de acesso Itaú
- `tipoAmbiente` - 1=Produção, 2=Homologação
- `tokenOAuth` - Token armazenado (renovado automaticamente)
- `tokenValidade` - Expiração do token
- `tipoJuros` - Tipo de juros (1-9)
- `tipoMulta` - Tipo de multa (1-3)
- `boletoRegistrado` - Flag para usar API (1) ou geração local (0)

### Passo 2: Configurar Credenciais no Sistema

1. Acesse **Configurações → Configurações Bancárias**
2. Clique em **"Nova Configuração"** ou edite uma existente
3. Preencha os dados bancários tradicionais:
   - Banco: **341** (Itaú)
   - Agência (4 dígitos)
   - Conta (7 dígitos + DV)
   - Carteira (ex: 109, 110, 112)
   - Convênio
   - Código Cedente
   - CNPJ do Cedente

4. Preencha as **credenciais OAuth** (novos campos):
   - **Client ID**: Fornecido pelo Itaú
   - **Client Secret**: Fornecido pelo Itaú
   - **Itaú Key**: Chave de acesso da API
   - **Tipo de Ambiente**: 
     - `2` = Homologação (testes)
     - `1` = Produção (boletos reais)

5. Configure **Juros e Multa**:
   - **Tipo de Juros** (1-9):
     - `1` = Valor diário (dias corridos)
     - `2` = Percentual diário (dias corridos)
     - `3` = Percentual mensal (dias corridos)
     - `5` = **Isento** (padrão)
   - **Percentual de Juros**: Ex: 1.0 (1% ao mês)
   - **Tipo de Multa** (1-3):
     - `1` = Valor fixo
     - `2` = Percentual
     - `3` = **Isento** (padrão)
   - **Percentual de Multa**: Ex: 2.0 (2%)

6. Marque **"Boleto Registrado"** = `SIM`

7. Clique em **"Testar Conexão"** para validar credenciais

8. Se o teste passar, clique em **"Salvar"**

---

## 💰 COMO USAR

### Emitir Boleto Registrado

1. Acesse **Cobranças → Emitir Boleto**
2. Selecione o paciente
3. Preencha valor e vencimento
4. Escolha **"Boleto Registrado"** (se disponível)
5. Clique em **"Continuar"**

**O sistema irá:**
- ✅ Obter token OAuth automaticamente
- ✅ Registrar o boleto na API do Itaú
- ✅ Receber código de barras e linha digitável REAIS
- ✅ Gerar PDF com dados oficiais do banco
- ✅ Enviar via WhatsApp para o paciente

### Consultar Situação do Boleto

```javascript
// Endpoint: POST /api/boletos-itau/consultar
{
  "bancoConfigId": "banco_xxx",
  "nossoNumero": "12345678"
}
```

**Retorna:**
- Status do boleto (REGISTRADO, PAGO, CANCELADO)
- Código de barras
- Linha digitável
- Local de pagamento

---

## 🔧 API ENDPOINTS

### 1. Registrar Boleto

**POST** `/api/boletos-itau/registrar`

```json
{
  "bancoConfigId": "banco_xxx",
  "nossoNumero": "12345678",
  "valor": 150.00,
  "dataVencimento": "2026-03-15",
  "dataEmissao": "2026-03-01",
  "sacadoNome": "João Silva",
  "sacadoCpf": "123.456.789-00",
  "sacadoEndereco": "Rua Exemplo, 123",
  "sacadoBairro": "Centro",
  "sacadoCidade": "São Paulo",
  "sacadoUf": "SP",
  "sacadoCep": "01234-567"
}
```

**Resposta (sucesso):**
```json
{
  "sucesso": true,
  "codigoBarras": "34191234500001500001234567890123456789012",
  "linhaDigitavel": "34191.23456 00001.500001 23456.789012 3 45678901234",
  "localPagamento": "Pagável em qualquer banco até o vencimento"
}
```

### 2. Consultar Situação

**POST** `/api/boletos-itau/consultar`

```json
{
  "bancoConfigId": "banco_xxx",
  "nossoNumero": "12345678"
}
```

### 3. Testar Conexão

**GET** `/api/boletos-itau/teste-conexao/:bancoConfigId`

---

## 🔐 SEGURANÇA

### Armazenamento de Credenciais

- ✅ **Client Secret** armazenado criptografado no banco
- ✅ **Token OAuth** renovado automaticamente (válido por ~1 hora)
- ✅ **Tokens expirados** são detectados e renovados transparentemente
- ✅ **Nenhuma credencial** é exposta no frontend

### Boas Práticas

1. **Nunca** compartilhe Client ID/Secret
2. Use **ambiente de homologação** para testes
3. Monitore **logs de erro** para detectar problemas
4. Revogue credenciais se houver suspeita de vazamento

---

## 🐛 TROUBLESHOOTING

### Erro: "access token inválido"

**Causa:** Token OAuth expirado ou credenciais incorretas

**Solução:**
1. Verifique Client ID e Client Secret
2. O sistema renova automaticamente, aguarde nova tentativa
3. Se persistir, gere novas credenciais no Portal Itaú

### Erro: "Boleto já existe"

**Causa:** Nosso Número duplicado

**Solução:**
- O sistema trata isso como sucesso (idempotência)
- Boleto já foi registrado anteriormente
- Use consulta para obter dados do boleto existente

### Erro: "Itaú Key não configurada"

**Causa:** Campo `itauKey` vazio

**Solução:**
1. Acesse Configurações Bancárias
2. Edite a configuração
3. Preencha o campo "Itaú Key"
4. Salve

### Erro: "Configuração bancária não encontrada"

**Causa:** ID inválido ou config deletada

**Solução:**
1. Verifique se a configuração existe
2. Certifique-se de usar o ID correto
3. Recrie a configuração se necessário

---

## 📊 TIPOS DE JUROS E MULTA

### Tipos de Juros (tipoJuros)

| Código | Descrição |
|--------|-----------|
| 1 | Valor diário (dias corridos) |
| 2 | Percentual diário (dias corridos) |
| 3 | Percentual mensal (dias corridos) |
| 4 | Percentual anual (dias corridos) |
| 5 | **Isento** (padrão) |
| 6 | Valor diário (dias úteis) |
| 7 | Percentual diário (dias úteis) |
| 8 | Percentual mensal (dias úteis) |
| 9 | Percentual anual (dias úteis) |

### Tipos de Multa (tipoMulta)

| Código | Descrição |
|--------|-----------|
| 1 | Valor fixo |
| 2 | Percentual do valor do título |
| 3 | **Isento** (padrão) |

---

## 🎯 PRÓXIMOS PASSOS

### Webhook de Confirmação de Pagamento

**Em desenvolvimento:**
- Endpoint para receber notificações do Itaú
- Atualização automática de status quando cliente paga
- Notificação via WhatsApp ao receber pagamento

### Baixa Automática

**Futuro:**
- Cancelamento de boletos via API
- Baixa manual de boletos não pagos
- Relatório de boletos vencidos

---

## 📞 SUPORTE

### Documentação Oficial do Itaú

- Portal Itaú Empresas: https://www.itau.com.br/empresas
- API Itaú: Solicite acesso ao gerente

### Suporte Técnico

- Para problemas com credenciais: Contate o Itaú
- Para problemas no sistema: Verifique logs em `server/`

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [x] Serviço de integração OAuth (`server/services/itauBoleto.js`)
- [x] Rotas de API (`server/routes/boletos-itau.js`)
- [x] Migração de banco de dados (`server/migrate-add-itau-oauth-fields.js`)
- [x] Registro de rotas no servidor (`server/start-server.js`)
- [ ] Atualização do formulário de config bancária (frontend)
- [ ] Atualização do BoletoModal para escolher tipo de boleto (frontend)
- [ ] Hook para gerenciar boletos registrados (frontend)
- [ ] Webhook de confirmação de pagamento (backend)
- [ ] Testes automatizados

---

**Versão:** 1.0.0  
**Data:** 2026-03-25  
**Status:** ✅ Backend Completo | 🚧 Frontend Pendente
