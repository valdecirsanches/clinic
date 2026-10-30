
# 🚀 Migração para API Real - EasyClin

## ✅ O que foi feito

Todos os hooks foram migrados do localStorage (mocks) para a API real:

### Hooks Atualizados:
- ✅ **useAgendaProfissional** - JÁ estava usando API
- ✅ **useOperadoras** - Migrado para API
- ✅ **useClinicas** - Migrado para API
- ✅ **useAuth** - Migrado para API (incluindo login)
- ✅ **usePacientes** - Migrado para API
- ✅ **useAgenda** - Migrado para API (consultas)

### Endpoints Criados:

#### Banco GLOBAL (easyclin-global.db):
- `GET /api/operadoras` - Lista operadoras
- `POST /api/operadoras` - Cria operadora
- `PUT /api/operadoras/:id` - Atualiza operadora
- `DELETE /api/operadoras/:id` - Deleta operadora

- `GET /api/clinicas?operadoraId=op1` - Lista clínicas (filtro opcional)
- `POST /api/clinicas` - Cria clínica
- `PUT /api/clinicas/:id` - Atualiza clínica
- `DELETE /api/clinicas/:id` - Deleta clínica

- `GET /api/usuarios?operadoraId=op1&clinicaId=c1` - Lista usuários (filtros opcionais)
- `POST /api/usuarios` - Cria usuário
- `PUT /api/usuarios/:id` - Atualiza usuário
- `DELETE /api/usuarios/:id` - Deleta usuário
- `POST /api/auth/login` - Login (retorna usuário)

#### Banco POR CLÍNICA (easyclin-clinica-{clinicaId}.db):
- `GET /api/pacientes?clinicaId=c1` - Lista pacientes
- `POST /api/pacientes` - Cria paciente
- `PUT /api/pacientes/:id` - Atualiza paciente
- `DELETE /api/pacientes/:id` - Deleta paciente

- `GET /api/consultas?clinicaId=c1` - Lista consultas
- `POST /api/consultas` - Cria consulta
- `PUT /api/consultas/:id` - Atualiza consulta
- `DELETE /api/consultas/:id` - Deleta consulta

- `GET /api/agendas?clinicaId=c1` - Lista agendas profissionais
- `POST /api/agendas` - Cria agenda
- `PUT /api/agendas/:id` - Atualiza agenda
- `DELETE /api/agendas/:id` - Deleta agenda

## 📦 Como Popular o Banco de Dados

### 1. Instalar dependências do servidor (se ainda não fez):
```bash
cd server
npm install
```

### 2. Popular o banco com dados de teste:
```bash
node scripts/populateDatabase.js
```

Isso vai criar:
- 2 Operadoras
- 3 Clínicas
- 7 Usuários (super_admin, admin, médicos, dentistas, atendente)
- 5 Pacientes
- 4 Agendas Profissionais
- 15 Horários de Trabalho
- 5 Consultas

### 3. Iniciar o servidor:
```bash
cd server
npm start
```

O servidor vai rodar em `http://localhost:5001`

## 🔐 Credenciais de Teste

Após popular o banco, você pode fazer login com:

- **Super Admin**: `admin@easyclin.com` / `admin123`
- **Admin**: `joao@saudetotal.com` / `123456`
- **Médica**: `ana@saudetotal.com` / `123456`
- **Dentista**: `carlos@saudetotal.com` / `123456`
- **Atendente**: `maria@saudetotal.com` / `123456`

## 🎯 Como Usar

### 1. Inicie o servidor da API:
```bash
cd server
npm start
```

### 2. Inicie o frontend (em outro terminal):
```bash
npm start
```

### 3. Faça login com uma das credenciais acima

### 4. Tudo funcionará automaticamente via API! 🎉

## 🔍 Verificação

Para verificar se está tudo funcionando:

1. Abra o console do navegador (F12)
2. Você verá logs como:
   - `📋 Carregando operadoras via API`
   - `✅ Operadoras carregadas via API: [...]`
   - `🔐 Tentando login via API: admin@easyclin.com`
   - `✅ Login bem-sucedido: {...}`

3. No terminal do servidor, você verá:
   - `📥 GET /api/operadoras`
   - `✅ Retornando 2 operadoras`
   - `📥 POST /api/auth/login`
   - `✅ Login bem-sucedido: admin@easyclin.com`

## 🗑️ Limpar localStorage (opcional)

Se quiser garantir que não há dados antigos no localStorage:

```javascript
// Cole no console do navegador (F12):
localStorage.clear()
location.reload()
```

## 📊 Estrutura dos Bancos

### Banco GLOBAL (easyclin-global.db):
- Operadoras
- Clínicas
- Usuários
- Configurações Globais

### Banco POR CLÍNICA (easyclin-clinica-c1.db):
- Pacientes
- Agendas Profissionais
- Horários de Trabalho
- Consultas
- Configurações da Clínica

## 🎉 Pronto!

Agora seu sistema está 100% conectado à API real. Não há mais mocks ou localStorage sendo usado para dados principais.

Todos os dados são persistidos no banco de dados SQLite e sincronizados via API REST.
