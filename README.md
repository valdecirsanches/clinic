# EasyClin

Sistema de gestão para clínicas médicas e odontológicas (agenda, prontuário, Memed,
financeiro, WhatsApp, teleconsulta).

- **Front-end:** React + Vite em `src/` (porta 5173 em desenvolvimento).
- **API:** Node/Express em `src/server/` (porta 5171) com MySQL/MariaDB.

## Rodar em desenvolvimento

Pré-requisitos: Node 22 e um MySQL/MariaDB com um usuário que possa criar bancos.

```bash
npm run instalar          # instala front e API
# crie src/server/.env.local (veja src/.env.example): MYSQL_*, ADMIN_EMAIL, ADMIN_SENHA
npm run server            # API em http://localhost:5171
npm run dev               # em outro terminal: app em http://localhost:5173
```

No primeiro início com banco vazio, o servidor cria só o super administrador
(`ADMIN_EMAIL` / `ADMIN_SENHA`; sem senha definida, gera uma e mostra no log).

## Produção

- Front: `npm run build` e servir `src/dist` (devolvendo `index.html` em qualquer rota).
- API: `node src/server/start-server.js` com PM2/systemd, atrás de HTTPS.
- Variáveis em `src/.env.example` (banco, autenticação, links assinados de arquivos).

## Testes

`npm test` (vitest, em `src/tests`).
