
# 🚀 PLANO DE MIGRAÇÃO: localStorage → API

## 📋 PROBLEMA ATUAL

O sistema usa `localStorage` extensivamente, causando:
- ❌ Dessincronização entre componentes
- ❌ Dados desatualizados
- ❌ Difícil debugar
- ❌ Não funciona em múltiplas abas
- ❌ Conflitos entre modal e página principal

## ✅ SOLUÇÃO: SINGLE SOURCE OF TRUTH (API)

### FASE 1: AuthContext (✅ CRIADO)

**Arquivo:** `contexts/AuthContext.tsx`

**O que faz:**
- Gerencia sessão do usuário via API
- Armazena apenas token JWT no localStorage
- Todos os dados vêm da API
- Context compartilhado em toda aplicação

**Como usar:**
```tsx
import { useAuth } from '../contexts/AuthContext'

function MeuComponente() {
  const { usuario, clinicaAtual, operadoraSelecionada } = useAuth()
  
  // Não precisa mais de localStorage!
  console.log(clinicaAtual.id) // Sempre atualizado
}
```

### FASE 2: Endpoints de Autenticação (PRÓXIMO PASSO)

**Criar no servidor:**

1. `POST /api/auth/login`
   - Valida credenciais
   - Retorna token JWT + dados do usuário

2. `GET /api/auth/me`
   - Valida token
   - Retorna dados atualizados do usuário

3. `POST /api/auth/selecionar-clinica`
   - Atualiza clínica atual
   - Retorna nova clínica

### FASE 3: Atualizar App.tsx

**Remover:**
```tsx
// ❌ REMOVER
const [sessao, setSessao] = useState(() => {
  const stored = localStorage.getItem('sessao')
  return stored ? JSON.parse(stored) : null
})
```

**Adicionar:**
```tsx
// ✅ ADICIONAR
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <AuthProvider>
      {/* resto do app */}
    </AuthProvider>
  )
}
```

### FASE 4: Atualizar todos os componentes

**Componentes que precisam mudar:**

1. **Header.tsx**
   - Substituir `localStorage.getItem('sessao')` por `useAuth()`

2. **Sidebar.tsx**
   - Substituir `localStorage.getItem('sessao')` por `useAuth()`

3. **ConfiguracoesPage.tsx**
   - Substituir `localStorage.getItem('sessao')` por `useAuth()`
   - Remover leitura de `whatsapp_config` do localStorage

4. **WhatsAppConfig.tsx**
   - Remover TODOS os `localStorage` relacionados a WhatsApp
   - Usar apenas `useWhatsAppConfig(clinicaId)`

5. **WhatsAppSessionManager.tsx**
   - Remover tentativa de ler da API
   - Usar apenas props recebidas

6. **WhatsAppStatusButton.tsx**
   - Usar `useAuth()` para pegar clinicaId
   - Usar `useWhatsAppConfig(clinicaId)` para config

### FASE 5: Limpar código legado

**Buscar e remover:**
```bash
# Buscar todos os usos de localStorage
grep -r "localStorage" --include="*.tsx" --include="*.ts"

# Remover:
- localStorage.getItem('sessao')
- localStorage.setItem('sessao', ...)
- localStorage.getItem('whatsapp_config')
- localStorage.setItem('whatsapp_config', ...)
- localStorage.getItem('whatsapp_session_status')
- localStorage.setItem('whatsapp_session_status', ...)
```

## 🎯 BENEFÍCIOS APÓS MIGRAÇÃO

1. ✅ **Single Source of Truth:** API é a única fonte
2. ✅ **Sincronização automática:** Todos os componentes sempre atualizados
3. ✅ **Fácil debug:** Logs centralizados
4. ✅ **Múltiplas abas:** Funciona perfeitamente
5. ✅ **Sem conflitos:** Modal e página sempre sincronizados

## 📝 ORDEM DE EXECUÇÃO

1. ✅ Criar AuthContext (FEITO)
2. ⏳ Criar endpoints de autenticação no servidor
3. ⏳ Atualizar App.tsx para usar AuthProvider
4. ⏳ Atualizar Header, Sidebar, páginas
5. ⏳ Remover localStorage de WhatsApp
6. ⏳ Testar tudo
7. ⏳ Limpar código legado

## 🚨 IMPORTANTE

**Durante a migração:**
- Testar cada fase antes de continuar
- Manter backup do código antigo
- Documentar mudanças

**Após a migração:**
- Limpar localStorage antigo dos usuários
- Forçar re-login para gerar novo token
- Monitorar logs para erros
