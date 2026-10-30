
# 📚 Arquitetura de Banco de Dados - EasyClin

## 🎯 Visão Geral

O EasyClin utiliza uma arquitetura de **dois níveis de bancos de dados** para separar dados globais de dados específicos por clínica:

### 1️⃣ **main.db** - Banco Principal (Global)
Contém dados compartilhados entre todas as clínicas:
- ✅ Operadoras
- ✅ Clínicas
- ✅ Usuários
- ✅ Configurações Globais

### 2️⃣ **clinica-{id}.db** - Banco por Clínica
Cada clínica possui seu próprio banco isolado:
- ✅ Pacientes
- ✅ Dependentes
- ✅ Consultas
- ✅ Prontuários
- ✅ Agendas Profissionais
- ✅ Configurações da Clínica

---

## 📁 Estrutura de Arquivos

```
database/
├── mainDb.ts          # Banco principal (operadoras, clínicas, usuários)
├── clinicaDb.ts       # Gerenciador de bancos por clínica
└── README.md          # Este arquivo
```

---

## 🔧 Como Usar

### Banco Principal (main.db)

```typescript
import { mainDb } from '../database/mainDb'

// Buscar todos os usuários
const usuarios = await mainDb.getAll('usuarios')

// Buscar usuário por ID
const usuario = await mainDb.get('usuarios', 'u1')

// Buscar usuários de uma clínica
const usuariosDaClinica = await mainDb.getAllFromIndex(
  'usuarios',
  'by-clinica',
  'c1'
)

// Adicionar/Atualizar usuário
await mainDb.put('usuarios', {
  id: 'u4',
  nome: 'Dr. Pedro',
  email: 'pedro@easyclin.com',
  senha: '123456',
  tipo: 'medico',
  operadoraId: 'op1',
  clinicaId: 'c1',
  ativo: true,
  criadoEm: '2024-01-15',
})

// Deletar usuário
await mainDb.delete('usuarios', 'u4')
```

### Banco por Clínica (clinica-{id}.db)

```typescript
import { clinicaDb } from '../database/clinicaDb'

const clinicaId = 'c1' // ID da clínica

// Buscar todos os pacientes da clínica
const pacientes = await clinicaDb.getAll(clinicaId, 'pacientes')

// Buscar paciente por ID
const paciente = await clinicaDb.get(clinicaId, 'pacientes', 'p1')

// Buscar consultas de um paciente
const consultas = await clinicaDb.getAllFromIndex(
  clinicaId,
  'consultas',
  'by-paciente',
  'p1'
)

// Adicionar/Atualizar paciente
await clinicaDb.put(clinicaId, 'pacientes', {
  id: 'p3',
  nome: 'Carlos Souza',
  cpf: '111.222.333-44',
  dataNascimento: '1995-03-10',
  telefone: '(11) 99999-8888',
  email: 'carlos@email.com',
  endereco: 'Rua C, 789',
  criadoEm: '2024-01-15',
})

// Deletar paciente
await clinicaDb.delete(clinicaId, 'pacientes', 'p3')
```

---

## 🎨 Exemplo Prático: Hook useAgendaProfissional

```typescript
import { useState, useEffect } from 'react'
import { clinicaDb } from '../database/clinicaDb'
import { AgendaProfissional } from '../types'

export function useAgendaProfissional(clinicaId?: string) {
  const [agendas, setAgendas] = useState<AgendaProfissional[]>([])

  useEffect(() => {
    if (!clinicaId) return
    loadAgendas()
  }, [clinicaId])

  const loadAgendas = async () => {
    if (!clinicaId) return
    const data = await clinicaDb.getAll(clinicaId, 'agendas')
    setAgendas(data as AgendaProfissional[])
  }

  const addAgenda = async (agenda: Omit<AgendaProfissional, 'id' | 'criadoEm'>) => {
    if (!clinicaId) throw new Error('clinicaId não definido')
    
    const newAgenda = {
      ...agenda,
      id: `ag${Date.now()}`,
      criadoEm: new Date().toISOString().split('T')[0],
    }
    
    await clinicaDb.put(clinicaId, 'agendas', newAgenda)
    await loadAgendas()
    return newAgenda
  }

  return { agendas, addAgenda, loadAgendas }
}
```

---

## 🔄 Migração Automática

Ambos os bancos possuem **migração automática** de dados antigos:

### main.db migra de:
- ✅ localStorage (`operadoras`, `clinicas`, `usuarios`)
- ✅ Banco antigo `easyclin-main`

### clinica-{id}.db migra de:
- ✅ localStorage (`pacientes`, `consultas`, `agendas_profissionais`)
- ✅ Banco antigo `easyclin-agendas`
- ✅ Remove automaticamente o campo `clinicaId` dos dados migrados

---

## 🌱 Dados Mock

### main.db popula automaticamente:
- 1 Operadora: "Saúde Total"
- 1 Clínica: "Clínica Central"
- 3 Usuários: Admin, Dra. Ana Costa, Dr. Carlos Silva

### clinica-c1.db popula automaticamente:
- 2 Pacientes: João Silva, Maria Santos
- 1 Agenda: Dra. Ana Costa (segunda a quarta, 8h-18h)
- Configuração WhatsApp padrão

---

## ✅ Vantagens desta Arquitetura

1. **Isolamento de Dados**: Cada clínica tem seu próprio banco
2. **Escalabilidade**: Fácil adicionar novas clínicas
3. **Performance**: Queries mais rápidas (menos dados por banco)
4. **Segurança**: Dados de uma clínica não vazam para outra
5. **Manutenção**: Estrutura clara e organizada
6. **Migração**: Automática de dados antigos

---

## 🚀 Próximos Passos

Hooks que precisam ser atualizados para usar a nova estrutura:

### Já Atualizados ✅
- `useAgendaProfissional` → usa `clinicaDb`

### Pendentes 🔄
- `useAuth` → deve usar `mainDb` para usuários
- `useClinicas` → deve usar `mainDb` para clínicas
- `useOperadoras` → deve usar `mainDb` para operadoras
- `usePacientes` → deve usar `clinicaDb` para pacientes
- `useDependentes` → deve usar `clinicaDb` para dependentes
- `useAgenda` → deve usar `clinicaDb` para consultas

---

## 📝 Notas Importantes

1. **clinicaId é obrigatório** para acessar dados de clínica
2. **Não há mais campo clinicaId** nos dados da clínica (redundante)
3. **Cache de instâncias**: Cada clínica mantém uma conexão em cache
4. **Migração é automática**: Roda na primeira vez que o banco é aberto
5. **Dados mock**: Populados apenas se o banco estiver vazio

---

## 🐛 Debug

Para inspecionar os bancos no DevTools:

```javascript
// No console do navegador:

// Ver banco principal
const mainDB = await indexedDB.databases()
console.log('Bancos:', mainDB)

// Abrir banco principal
const db = await indexedDB.open('main.db')

// Abrir banco de clínica
const clinicaDB = await indexedDB.open('clinica-c1.db')
```

---

**Última atualização:** Janeiro 2024
**Versão:** 1.0.0
