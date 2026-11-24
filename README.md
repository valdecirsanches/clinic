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

## WhatsApp: WAHA ou Evolution API

Cada clínica usa o WAHA (padrão) ou a Evolution API. Quem escolhe é o administrador da
clínica ou o super administrador, em Configurações › Conexão WhatsApp › "Servidor do
WhatsApp" (`GET/POST /api/whatsapp/servidor`). A escolha fica em
`whatsapp_config.servidorWhatsapp` e o endereço do WAHA da clínica continua guardado para
voltar a ele. O servidor da Evolution vem do `.env.local` (`EVOLUTION_URL`,
`EVOLUTION_API_KEY` e, opcional, `EVOLUTION_WEBHOOK_URL`) e a instância tem o nome da sessão
da clínica.

O sistema continua "falando WAHA": o fetch do WhatsApp (`whatsapp-shared.js`) passa por
`server/services/evolution.js`, que manda para a Evolution só os pedidos de sessões de
clínicas que a escolheram e devolve as respostas no formato do WAHA (sessão, QR Code,
envios, número com WhatsApp, foto, LID e mídia). Clínicas no WAHA não mudam nada.

Endereços no `.env.local`, fora da tela: `WAHA_URL` (o endereço do WAHA para todas as
clínicas; o gravado na clínica só vale sem ele) e as URLs do webhook `WAHA_WEBHOOK_URL` /
`EVOLUTION_WEBHOOK_URL` (sem elas: a gravada na clínica ou `https://<esta API>/api/webhook/whatsapp`).
Os servidores próprios do código de acesso (`WAHA_2FA_SERVER_URL`, `CADASTRO_WAHA_SERVER_URL`)
continuam como estão.

Webhook automático: a tela não tem mais o bloco do webhook. Sempre que a sessão é conferida
(`/api/whatsapp/status`) e ao conectar a clínica, o servidor grava no WAHA/Evolution a URL do
`.env.local` se a dele estiver diferente (no máximo uma tentativa a cada 10 minutos por sessão).
Sem `WAHA_WEBHOOK_URL` / `EVOLUTION_WEBHOOK_URL`, nada é alterado e o bloco "Servidor do
WhatsApp" avisa o super administrador e o administrador.

Webhook na Evolution (mesmo critério do Inno): o webhook é
gravado na Evolution com `MESSAGES_UPSERT` e `CONNECTION_UPDATE`, mídia em base64 e
"Webhook by Events" desligado. O evento da Evolution vira o evento `message` do WAHA logo
na entrada de `/api/webhook/whatsapp`; com "Webhook by Events" ligado, o endereço
`/api/webhook/whatsapp/<evento>` (inclusive com barra dupla) também é aceito. Contato
`@lid`: o telefone é procurado nas chaves do evento (remoteJidAlt, senderPn,
participantPn...) e, se não vier, nos contatos da instância.

Códigos da plataforma (login em duas etapas e cadastro): saem pelo WAHA
(`WAHA_2FA_SERVER_URL`, `WAHA_2FA_SESSION`) ou, com `WHATSAPP_2FA_SERVIDOR=evolution`, pela
Evolution (`EVOLUTION_URL` / `EVOLUTION_API_KEY`) na instância `EVOLUTION_2FA_INSTANCIA`
(padrão: `WAHA_2FA_SESSION`). O cadastro segue a mesma escolha ou a sua
(`CADASTRO_WHATSAPP_SERVIDOR`, `CADASTRO_EVOLUTION_INSTANCIA`). Na Evolution o envio vai direto
para a instância, sem depender da sessão de alguma clínica.

Teste: `src/tests/services/evolution.test.ts` (Evolution falsa).

## Testes

`npm test` (vitest, em `src/tests`).
