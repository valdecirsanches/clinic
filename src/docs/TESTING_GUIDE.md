
# 🧪 Guia de Testes - EasyClin

## Setup Rápido

```bash
# 1. Instalar dependências (inclui vitest)
npm install

# 2. Rodar todos os testes
npm test

# 3. Rodar em modo watch (re-executa ao salvar)
npm run test:watch

# 4. Ver cobertura de código
npm run test:coverage

# 5. Interface visual dos testes (abre no browser)
npm run test:ui
```

## Estrutura dos Testes

```
tests/
├── setup.ts                              # Setup global (mocks de window, localStorage)
├── services/
│   └── whatsappMessages.test.ts          # Templates de mensagem, validação de telefone
├── utils/
│   └── boletoGenerator.test.ts           # Formatação de moeda, CPF, CNPJ, boletos
└── types/
    └── types.test.ts                     # Permissões, planos, configurações
```

## O que está coberto

### ✅ WhatsApp Messages (`services/whatsappMessages.ts`)
- Validação de telefone (aceitar/rejeitar formatos)
- Formatação de telefone para WhatsApp
- Geração de mensagem de lembrete (padrão e customizada)
- Geração de mensagem de confirmação
- Geração de mensagem de cancelamento (com/sem motivo)
- Geração de menu de ajuda (padrão e customizado)
- Substituição de variáveis em templates

### ✅ Boleto Generator (`utils/boletoGenerator.ts`)
- Formatação de moeda (R$)
- Formatação de CPF e CNPJ
- Geração de número de documento
- Geração de linha digitável
- Geração de código de barras
- Geração de HTML do boleto

### ✅ Types & Permissões (`types/index.ts`)
- Planos existem e estão corretos
- Permissões por tipo de usuário
- Atendente NÃO acessa prontuários
- Super admin acessa TUDO
- Menu items têm IDs únicos

## Como Adicionar Novos Testes

1. Crie um arquivo em `tests/` seguindo a estrutura
2. Use `describe` para agrupar e `it` para cada caso
3. Rode `npm run test:watch` para ver em tempo real

```typescript
// Exemplo: tests/hooks/useAgenda.test.ts
import { describe, it, expect } from 'vitest'

describe('minha funcionalidade', () => {
  it('deve fazer X quando Y', () => {
    const resultado = minhaFuncao('input')
    expect(resultado).toBe('esperado')
  })
})
```

## Próximos Testes Recomendados

Por prioridade de risco:

1. **`server/routes/whatsapp.js`** - Webhook é o mais crítico (requer Jest + Supertest no server/)
2. **`server/routes/consultas.js`** - CRUD de consultas
3. **`server/routes/pacientes.js`** - CRUD de pacientes
4. **`hooks/useAgenda.ts`** - Lógica de agenda (requer @testing-library/react-hooks)
5. **`contexts/AuthContext.tsx`** - Autenticação

## Dicas

- **Antes de cada deploy:** rode `npm test` para garantir que nada quebrou
- **Ao modificar permissões:** os testes de `types.test.ts` vão pegar regressões
- **Ao modificar templates WhatsApp:** os testes de `whatsappMessages.test.ts` validam
- **Mode watch** (`npm run test:watch`) é ideal durante desenvolvimento
