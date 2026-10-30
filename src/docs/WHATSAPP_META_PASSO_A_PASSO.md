# WhatsApp oficial da Meta (Cloud API) — passo a passo

Canal **opcional**, independente do WAHA e do SMS. Os três convivem: cada clínica
liga o que quiser em **Configurações → WhatsApp oficial (Meta)**.

---

## Parte 1 — No painel da Meta (uma vez)

1. **Conta Meta Business verificada** (business.facebook.com), com o CNPJ da clínica.
2. Em **developers.facebook.com** → *Criar app* → tipo **Business** → adicionar o
   produto **WhatsApp**.
3. **Cadastrar o número** da clínica. Ele **não pode estar em uso** no WhatsApp
   comum nem no WhatsApp Business app — se estiver, apague a conta de lá antes.
   Para testar sem custo, use o número de teste que a Meta fornece.
4. Anote o **Phone Number ID** e o **WABA ID** (WhatsApp Business Account ID).
5. **Token permanente**: Business Manager → *Usuários do sistema* → criar System
   User → conceder ao app as permissões `whatsapp_business_messaging` e
   `whatsapp_business_management` → **Gerar token** sem expiração.
   ⚠️ O token que aparece no painel do app dura **24h** e não serve em produção.

## Parte 2 — Nas Configurações do sistema

1. Cole **Phone Number ID**, **WABA ID** e o **token permanente**.
2. **Salve**. O token fica somente no servidor e nunca volta para a tela.
3. Clique em **Buscar na Meta** para listar os templates da WABA.
4. Vincule cada aviso ao template correspondente (seção seguinte).
5. Use **Enviar mensagem de teste** para validar.
6. Só então clique em **Ativar**.

> Marque **"Usar a Meta antes do WAHA"** se quiser que os avisos saiam pela API
> oficial, deixando o WAHA como alternativa. Desmarcado, o WAHA continua principal
> e a Meta entra apenas quando ele não entrega.

## Parte 3 — Os templates (WhatsApp Manager → Modelos de mensagem)

Fora de uma conversa iniciada pelo paciente, a Meta **só entrega template
aprovado**. Crie os modelos abaixo na categoria **Utility** (utilitário), idioma
**Português (BR)**. As variáveis são posicionais: `{{1}}`, `{{2}}`… na ordem exata.

| Aviso | Variáveis (na ordem) | Corpo sugerido |
|---|---|---|
| Lembrete de consulta | nome, data, horário, profissional | `Ola {{1}}, lembrete da sua consulta em {{2}} as {{3}} com {{4}}.` |
| Pedido de confirmação | nome, data, horário, profissional | `Ola {{1}}, sua consulta esta marcada para {{2}} as {{3}} com {{4}}. Podemos confirmar sua presenca?` |
| Aviso de cancelamento | nome, data, horário | `Ola {{1}}, sua consulta de {{2}} as {{3}} foi cancelada. Entre em contato para reagendar.` |
| Link da consulta online | nome, data, horário | `Ola {{1}}, sua consulta online de {{2}} as {{3}} esta pronta. Toque no botao abaixo para entrar na sala.` |
| Solicitação de documento | nome, documento solicitado | `Ola {{1}}, a clinica solicitou o envio de: {{2}}. Responda esta mensagem anexando o arquivo.` |

**Botão de URL dinâmica** (necessário em *Pedido de confirmação* e *Link da
consulta online*): ao criar o modelo, adicione um botão do tipo **URL** com
*URL dinâmica*. A base é o domínio do sistema e o sufixo é preenchido pelo envio.

Regras que evitam recusa da Meta:
- O **número de variáveis** do modelo aprovado tem de bater com o da tabela. Se
  divergir, a tela avisa em vermelho e a Meta recusa o envio.
- Modelos aguardando aprovação (`PENDING`) ou reprovados (`REJECTED`) não
  entregam. O status aparece ao lado do nome na tela.
- Sem acento no corpo não é obrigatório aqui (diferente do SMS), mas mantenha o
  texto objetivo: templates promocionais tendem a ser reprovados.

## Parte 4 — Diagnóstico

Uma URL responde onde está parando, sem expor segredo:

```
https://<sua-api>/api/whatsapp-meta/diag?clinicaId=<id-da-clinica>
```

Ela informa: se a configuração existe e está ativa, se o servidor tem **saída
HTTPS** para `graph.facebook.com` (com o tempo de resposta) e se a **credencial**
é aceita pela Meta.

Erros comuns já traduzidos na tela:
- **Token inválido/expirado** → gere o token permanente pelo System User.
- **Número não está na lista de permitidos** → app em modo de teste; adicione o
  número do destinatário no painel.
- **Fora da janela de 24h** → só template aprovado é entregue.
- **Template não encontrado / variáveis diferentes** → confira nome, idioma e
  quantidade de variáveis.

## Parte 5 — Receber as respostas e os arquivos (webhook)

As credenciais fazem a clínica **enviar**. Para **receber** a resposta do paciente
e os documentos que ele manda, é preciso cadastrar a URL de entrada.

1. Em Configurações → WhatsApp oficial (Meta), o bloco **Recebimento de respostas
   e arquivos** mostra a **Callback URL** e o **Verify token** (gerado pelo
   sistema na primeira gravação — não é digitado).
2. No painel da Meta, em **WhatsApp → Configuração → Webhook**, cole as duas
   informações e assine o campo **`messages`**.
3. Confira em:
   ```
   https://<sua-api>/api/whatsapp-meta/webhook-info?clinicaId=<id-da-clinica>
   ```

O que o sistema faz com o que chega:
- **Resposta de botão** (Confirmar/Cancelar) → atualiza a agenda na hora. Não
  depende de interpretar texto livre.
- **Cancelamento** → o sistema pede o motivo e grava a resposta seguinte no
  campo de motivo da consulta.
- **Arquivo (foto ou PDF)** → é baixado da Meta (media_id → URL autenticada) e
  arquivado na **especialidade e categoria que a clínica solicitou**, fechando a
  solicitação pendente. Mesma classificação do fluxo do WAHA.
- Toda mensagem recebida entra no **histórico do paciente**, mesmo quando o
  sistema não a interpreta.

> O receptor do WAHA (`/api/whatsapp/webhook`) **não foi alterado**: são
> protocolos diferentes, em arquivos separados. Os dois podem operar ao mesmo tempo.

## Parte 6 — Cada clínica com o SEU número (recomendado)

Em vez de todas as clínicas enviarem pelo número da plataforma, a clínica conecta
o próprio número pela janela oficial da Meta — botão **Conectar WhatsApp**:

```
[Conectar WhatsApp] → login do responsável → empresa dele → cria/seleciona WABA
→ cadastra o número → código por SMS → verifica → conectado
```

O sistema recebe **WABA ID + Phone Number ID** e um código de uso único; o
**token é obtido pelo servidor** (o App Secret nunca vai ao navegador). Em
seguida o servidor assina o webhook na WABA da clínica e registra o número para
envio — se alguma dessas etapas falhar, a tela informa qual.

Para habilitar, defina no `server/.env.local` as credenciais do **app da
plataforma** (uma vez, não por clínica):

```
META_APP_ID=...
META_APP_SECRET=...
META_EMBEDDED_SIGNUP_CONFIG_ID=...   # criado em "Embedded Signup" no app da Meta
META_CREDIT_LINE_ID=...              # linha de crédito do parceiro (cobrança na plataforma)
META_PARTNER_TOKEN=...               # opcional: token do usuário de sistema do BM da plataforma
```

Sem essas variáveis o botão aparece desabilitado e o preenchimento manual das
credenciais continua funcionando.

## Cobrança das conversas na plataforma

A clínica **apenas cadastra o número**: ela não precisa informar cartão nem
cadastrar forma de pagamento na Meta. Ao concluir a conexão, o servidor
compartilha a **linha de crédito do parceiro** com a WABA da clínica
(`whatsapp_credit_sharing_and_attach`), e todas as conversas passam a ser
debitadas na forma de pagamento da plataforma.

Onde obter o `META_CREDIT_LINE_ID`: no **Business Manager da plataforma** →
Configurações do negócio → Pagamentos → linha de crédito estendida (é o ID do
objeto `extendedcredit`). O `META_PARTNER_TOKEN` é o token do usuário de sistema
desse Business Manager; sem ele o sistema usa o token do app, que atende à
maioria dos casos.

Se o compartilhamento falhar, a conexão **não é desfeita** — o assistente mostra
"Cobrança das conversas: na conta da clínica" com o motivo, e a clínica só
conseguirá enviar depois de cadastrar um meio de pagamento próprio.

Vantagens de cada clínica ter o seu número: o paciente vê o remetente da própria
clínica; e limite de envio, qualidade e eventual bloqueio não são compartilhados
entre clínicas.

## O que muda em relação ao WAHA

- Texto livre só é entregue **dentro de 24h** após o paciente escrever; fora
  disso, template.
- A cobrança da Meta é **por conversa**, não por mensagem.
- Os botões de confirmar/cancelar passam a ser **botões nativos** do template —
  mais confiável que interpretar texto livre.
