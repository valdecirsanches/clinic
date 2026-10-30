// ============ ROTAS DO WHATSAPP OFICIAL DA META (Cloud API) ============
// TERCEIRO canal de aviso ao paciente, ao lado do WAHA e do SMS. Os três são
// independentes e opcionais: cada clínica liga o que quiser.
//
// Por que um arquivo separado do whatsapp.js (WAHA): são protocolos diferentes.
// O WAHA controla um WhatsApp comum via sessão; a Cloud API é a API oficial da
// Meta, com token permanente e — fora da janela de 24h — SOMENTE templates
// aprovados. Misturar os dois no mesmo arquivo tornaria as duas coisas frágeis.
//
// ⭐ REGRA DE OURO (a mesma do sms.js): a rota SEMPRE responde, e responde
// RÁPIDO. Se a resposta demora, o proxy/CDN à frente da API corta a conexão e
// devolve um 504 SEM cabeçalhos CORS — o navegador só consegue dizer
// "Failed to fetch". Por isso toda chamada externa tem teto de tempo, e o
// registro no histórico acontece DEPOIS de responder.

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const { salvarMensagemHistorico } = require('./whatsapp-shared');
const { registrarEnvioMeta } = require('./whatsapp-meta-envios');

const GRAPH_BASE_URL = 'https://graph.facebook.com';
const API_VERSION_PADRAO = 'v21.0';

// ⭐ Marcador de versão: aparece em /disponivel e /diag para provar QUAL código
// está de fato no ar (evita depurar um backend desatualizado).
const META_ROUTES_VERSAO = '2026-08-29-meta-header-logo';

let fetchCompat = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
if (!fetchCompat) {
  try {
    const nodeFetch = require('node-fetch');
    fetchCompat = (...args) => nodeFetch(...args);
    console.log('🟢 [META] Usando node-fetch (Node sem fetch nativo)');
  } catch (e) {
    fetchCompat = null;
  }
}

// ==================== LOGOTIPO PÚBLICO DA CLÍNICA ====================
// A Meta baixa a imagem do cabeçalho pela INTERNET: ela precisa de uma URL
// pública HTTPS. O logo da clínica está gravado como base64 no cadastro, que a
// Meta não consegue ler — então publicamos esse mesmo logo nesta rota, sem
// exigir que o usuário hospede a imagem em outro lugar.

const dbGlobal = require('../databaseGlobal');

function baseUrlPublica(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/** URL pública do logo desta clínica (a que é enviada à Meta). */
function urlLogoClinica(req, clinicaId) {
  return `${baseUrlPublica(req)}/api/whatsapp-meta/logo/${encodeURIComponent(clinicaId)}.png`;
}

// GET /api/whatsapp-meta/logo/:arquivo — PÚBLICA (a Meta acessa sem token)
router.get('/logo/:arquivo', async (req, res) => {
  const clinicaId = String(req.params.arquivo || '').replace(/\.(png|jpg|jpeg)$/i, '');
  try {
    const row = await dbGlobal.
    prepare('SELECT logoUrl FROM clinicas WHERE id = ?').
    get(clinicaId);
    const valor = String(row?.logoUrl || '');
    if (!valor) return res.status(404).send('Clínica sem logotipo cadastrado');

    // Já é uma URL hospedada: encaminha para lá
    if (/^https?:\/\//i.test(valor)) return res.redirect(valor);

    const casa = valor.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!casa) return res.status(404).send('Formato de logotipo não suportado');

    const buffer = Buffer.from(casa[2], 'base64');
    res.setHeader('Content-Type', casa[1]);
    // A Meta busca a imagem a cada envio: cache longo evita tráfego repetido.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(buffer);
  } catch (err) {
    console.error('🟢 [META] Falha ao servir logotipo:', err.message);
    return res.status(500).send('Falha ao ler o logotipo');
  }
});

/**
 * ⭐ Número do canal LIVRE da clínica, em dígitos com DDI (5511999999999).
 *
 * O número oficial da Meta só dispara template; a conversa humana acontece no
 * WhatsApp comum da recepção. Ordem: número configurado em WhatsApp Oficial →
 * WhatsApp → celular → telefone do cadastro.
 */
async function numeroAtendimentoClinica(clinicaId) {
  try {
    const row = await dbGlobal.
    prepare('SELECT * FROM clinicas WHERE id = ?').
    get(clinicaId);
    let configurado = '';
    try {
      const config = await buscarConfigMeta(clinicaId);
      configurado = String(config?.textos?.numeroAtendimento || '');
    } catch (e) {
      configurado = '';
    }
    const digitos = [configurado, row?.whatsapp, row?.celular, row?.telefone, row?.telefone2].
    map((v) => String(v || '').replace(/\D/g, '')).
    find((v) => v.length >= 10);
    if (!digitos) return '';
    return digitos.startsWith('55') ? digitos : `55${digitos}`;
  } catch (e) {
    return '';
  }
}

/** Link direto de conversa livre com a clínica (vazio se não houver número). */
async function linkWaMeClinica(clinicaId, texto) {
  const numero = await numeroAtendimentoClinica(clinicaId);
  if (!numero) return '';
  return texto ?
  `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` :
  `https://wa.me/${numero}`;
}

// GET /api/whatsapp-meta/falar/:clinicaId — PÚBLICA
// Destino do botão "Falar conosco" (tipo "Acessar o site") dos templates.
// Redireciona o paciente para o WhatsApp da clínica, evitando depender da
// Calling API — que exigiria habilitar chamadas no número (erro #138000).
router.get('/falar/:clinicaId', async (req, res) => {
  const clinicaId = String(req.params.clinicaId || '');
  try {
    const row = await dbGlobal.prepare('SELECT * FROM clinicas WHERE id = ?').get(clinicaId);
    // ⭐ CANAL LIVRE: a conversa atendida por pessoas acontece no WhatsApp comum
    // da clínica — nunca no número oficial da Meta, que só envia template.
    // 1º) número configurado em WhatsApp Oficial · 2º) cadastro da clínica.
    let numeroConfigurado = '';
    try {
      const config = await buscarConfigMeta(clinicaId);
      numeroConfigurado = String(config?.textos?.numeroAtendimento || '');
    } catch (e) {
      numeroConfigurado = '';
    }
    const candidatos = [
    numeroConfigurado,
    row?.whatsapp,
    row?.celular,
    row?.telefone,
    row?.telefone2];

    const digitos = candidatos.
    map((v) => String(v || '').replace(/\D/g, '')).
    find((v) => v.length >= 10);
    if (!digitos) {
      return res.status(404).type('html').send(
        paginaFalarConosco({
          titulo: 'WhatsApp não cadastrado',
          texto:
          'Esta clínica ainda não cadastrou um número de atendimento. Entre em contato pelos canais habituais.'
        })
      );
    }
    const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
    const texto = encodeURIComponent(
      `Olá! Preciso falar sobre minha consulta${row?.nome ? ` na ${row.nome}` : ''}.`
    );
    const destino = `https://wa.me/${numero}?text=${texto}`;

    // ⚠️ NÃO usar redirect 302 aqui. O botão do template é aberto DENTRO do
    // navegador embutido do WhatsApp, e esse navegador ignora redirecionamentos
    // para wa.me — o paciente ficava numa tela em branco, sem abrir a conversa.
    // Uma página com âncora real resolve: o toque do usuário sai do webview e
    // entrega o link ao aplicativo.
    return res.type('html').send(
      paginaFalarConosco({
        titulo: row?.nome ? `Falar com ${row.nome}` : 'Falar com a clínica',
        texto: 'Toque no botão abaixo para abrir a conversa no WhatsApp.',
        destino
      })
    );
  } catch (err) {
    console.error('🟢 [META] Falha no redirecionamento "Falar conosco":', err.message);
    return res.status(500).type('html').send(
      paginaFalarConosco({
        titulo: 'Não foi possível abrir a conversa',
        texto: 'Tente novamente em instantes ou ligue para a clínica.'
      })
    );
  }
});

/**
 * Página mínima do "Falar conosco". Sem framework de propósito: ela roda dentro
 * do navegador embutido do WhatsApp, onde carregar o app inteiro é lento e
 * frequentemente falha.
 */
function paginaFalarConosco({ titulo, texto, destino }) {
  const escapar = (v) =>
  String(v || '').replace(
    /[&<>"']/g,
    (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
  const botao = destino ?
  `<a class="btn" href="${escapar(destino)}">Abrir conversa no WhatsApp</a>` :
  '';
  // A tentativa automática cobre o navegador comum; a âncora cobre o webview.
  const auto = destino ?
  `<script>setTimeout(function(){location.href=${JSON.stringify(destino)}},600)</script>` :
  '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;max-width:380px;
width:100%;text-align:center}
h1{font-size:18px;color:#111827;margin:0 0 8px}
p{font-size:14px;color:#4b5563;margin:0 0 20px;line-height:1.5}
.btn{display:block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;
font-size:15px;padding:14px 20px;border-radius:10px}
</style></head><body><div class="card">
<h1>${escapar(titulo)}</h1><p>${escapar(texto)}</p>${botao}
</div>${auto}</body></html>`;
}

/** O logotipo desta clínica está disponível para virar cabeçalho na Meta? */
async function clinicaTemLogo(clinicaId) {
  try {
    const row = await dbGlobal.
    prepare('SELECT logoUrl FROM clinicas WHERE id = ?').
    get(clinicaId);
    return Boolean(String(row?.logoUrl || '').trim());
  } catch (e) {
    return false;
  }
}

// ==================== TABELA (criada/migrada preguiçosamente) ====================

// As migrações são idempotentes, mas rodavam a CADA requisição — inclusive as
// ALTER que já falham por a coluna existir. Uma vez por processo/clínica basta.
const tabelaPronta = new Set();

function garantirTabelaMeta(db, done) {
  const chave = db && db.dbName ? String(db.dbName) : 'padrao';
  if (tabelaPronta.has(chave)) return done();
  db.run(
    `CREATE TABLE IF NOT EXISTS whatsapp_meta_config (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      apiVersion VARCHAR(20) DEFAULT 'v21.0',
      phoneNumberId VARCHAR(191),
      wabaId VARCHAR(191),
      accessToken TEXT,
      numeroExibicao VARCHAR(50),
      ativo TINYINT(1) DEFAULT 0,
      preferencial TINYINT(1) DEFAULT 0,
      templates TEXT,
      textos TEXT,
      verifyToken VARCHAR(191),
      atualizadoEm VARCHAR(50) NOT NULL
    )`,
    () => {
      const migrations = [
      // Tokens permanentes da Meta passam de 200 caracteres
      `ALTER TABLE whatsapp_meta_config MODIFY COLUMN accessToken TEXT`,
      `ALTER TABLE whatsapp_meta_config ADD COLUMN preferencial TINYINT(1) DEFAULT 0`,
      `ALTER TABLE whatsapp_meta_config ADD COLUMN templates TEXT`,
      `ALTER TABLE whatsapp_meta_config ADD COLUMN numeroExibicao VARCHAR(50)`,
      // ⭐ Token que a Meta usa para validar a URL do webhook de ENTRADA
      // (respostas e arquivos do paciente). É por clínica, não global.
      `ALTER TABLE whatsapp_meta_config ADD COLUMN verifyToken VARCHAR(191)`,
      // ⭐ Textos fixos das variáveis que não vêm de cadastro (local,
      // instruções pré-consulta, informações importantes).
      `ALTER TABLE whatsapp_meta_config ADD COLUMN textos TEXT`,
      // ⭐ Uma clínica = uma configuração. Sem esta chave, um UPDATE que o MySQL
      // reporta como "0 linhas alteradas" (valores idênticos) fazia o fallback
      // INSERIR uma segunda linha para a mesma clínica — e a leitura seguinte
      // podia devolver a linha antiga (em branco). Limpa duplicatas antes.
      `DELETE t1 FROM whatsapp_meta_config t1
           JOIN whatsapp_meta_config t2
             ON t1.clinicaId = t2.clinicaId
            AND (t1.atualizadoEm < t2.atualizadoEm
                 OR (t1.atualizadoEm = t2.atualizadoEm AND t1.id < t2.id))`,
      `ALTER TABLE whatsapp_meta_config ADD UNIQUE KEY uk_meta_clinica (clinicaId)`];

      const proxima = (i) => {
        if (i >= migrations.length) {
          tabelaPronta.add(chave);
          return done();
        }
        db.run(migrations[i], () => proxima(i + 1));
      };
      proxima(0);
    }
  );
}

function normalizarConfig(row) {
  let templates = {};
  try {
    templates = row.templates ? JSON.parse(row.templates) : {};
  } catch (e) {
    templates = {};
  }
  let textos = {};
  try {
    textos = row.textos ? JSON.parse(row.textos) : {};
  } catch (e) {
    textos = {};
  }
  return {
    ...row,
    textos,
    apiVersion: row.apiVersion || API_VERSION_PADRAO,
    phoneNumberId: String(row.phoneNumberId || '').trim(),
    wabaId: String(row.wabaId || '').trim(),
    accessToken: String(row.accessToken || '').trim(),
    verifyToken: String(row.verifyToken || '').trim(),
    ativo: Boolean(row.ativo),
    preferencial: Boolean(row.preferencial),
    templates
  };
}

async function buscarConfigMeta(clinicaId) {
  const db = getClinicaDB(clinicaId);
  await new Promise((r) => garantirTabelaMeta(db, r));
  const row = await new Promise((r) =>
  db.get(
    'SELECT * FROM whatsapp_meta_config WHERE clinicaId = ? ORDER BY atualizadoEm DESC',
    [clinicaId],
    (err, found) => r(err ? null : found || null)
  )
  );
  return row ? normalizarConfig(row) : null;
}

// ==================== HELPERS DE REDE ====================

// A Cloud API exige E.164 sem o "+". No Brasil, celulares de números antigos
// podem ou não ter o nono dígito — enviamos como está cadastrado, pois a Meta
// resolve o formato canônico do lado dela.
function normalizarTelefoneMeta(telefone) {
  let numero = String(telefone || '').replace(/\D/g, '');
  if (!numero) return null;
  numero = numero.replace(/^0+/, '');
  if (!numero.startsWith('55')) numero = '55' + numero;
  if (numero.length < 12 || numero.length > 13) return null;
  return numero;
}

function comOrcamento(promessa, ms, mensagem) {
  return new Promise((resolve) => {
    let encerrado = false;
    const timer = setTimeout(() => {
      if (encerrado) return;
      encerrado = true;
      resolve({ success: false, error: mensagem, timeout: true });
    }, ms);
    Promise.resolve(promessa).
    then((valor) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      resolve(valor);
    }).
    catch((err) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      resolve({ success: false, error: err?.message || 'Falha inesperada no envio.' });
    });
  });
}

async function fetchComTeto(url, opcoes = {}, ms = 8000) {
  if (!fetchCompat) {
    throw new Error('Servidor sem fetch disponível (use Node 18+ ou instale node-fetch).');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
  try {
    const resposta = await fetchCompat(url, {
      ...opcoes,
      signal: controller ? controller.signal : undefined
    });
    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch (e) {
      dados = null;
    }
    return { resposta, dados, texto };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ⭐ Traduz o erro da Meta numa mensagem acionável para a clínica.
// Os códigos abaixo são os que realmente aparecem no dia a dia da Cloud API.
function descreverErroMeta(dados, status) {
  const erro = dados?.error || {};
  const codigo = erro.code;
  const subcodigo = erro.error_subcode;
  const detalhe = erro.error_user_msg || erro.message || `A Meta respondeu ${status}`;

  if (status === 401 || codigo === 190) {
    return 'Token da Meta inválido ou expirado. Gere um token permanente pelo System User (o token de teste do painel dura 24h).';
  }
  if (codigo === 131030) {
    return 'Número do paciente não está na lista de destinatários permitidos. Enquanto o app estiver em modo de teste, só números adicionados no painel recebem mensagem.';
  }
  if (codigo === 131047) {
    return 'Fora da janela de 24h: só é possível enviar template aprovado para este paciente.';
  }
  if (codigo === 132000 || codigo === 132001) {
    return `Template não encontrado ou com número de variáveis diferente do aprovado. Confira o nome e o idioma em WhatsApp Manager → Modelos. (${detalhe})`;
  }
  if (codigo === 132012) {
    // ⚠️ NÃO é template reprovado (esse é o 132015). O 132012 é divergência
    // entre o que enviamos e o modelo aprovado: quantidade de variáveis
    // diferente, ou valor com quebra de linha / tabulação / 4+ espaços.
    return `As variáveis enviadas não batem com o modelo aprovado na Meta. Normalmente é o aviso vinculado a um template com outra quantidade de variáveis — confira o vínculo em WhatsApp Oficial. (${detalhe})`;
  }
  if (codigo === 132015) {
    return `Template reprovado ou pausado pela Meta. Verifique o status dele em WhatsApp Manager → Modelos. (${detalhe})`;
  }
  if (codigo === 133010) {
    return 'O número da clínica ainda não está registrado na Cloud API. Conclua o registro do número no painel da Meta.';
  }
  if (codigo === 80007 || status === 429) {
    return 'Limite de envios da Meta atingido. Tente novamente em instantes.';
  }
  if (codigo === 100 && subcodigo === 33) {
    return 'Phone Number ID ou WABA ID incorreto — a Meta não reconhece esse identificador com o token informado.';
  }
  return detalhe;
}

// ==================== DISPONIBILIDADE ====================

async function metaDisponivel(clinicaId) {
  const config = await buscarConfigMeta(clinicaId);
  const base = { versao: META_ROUTES_VERSAO };
  if (!config) return { ...base, disponivel: false, motivo: 'Canal Meta não configurado' };
  if (!config.phoneNumberId) return { ...base, disponivel: false, motivo: 'Phone Number ID não informado' };
  if (!config.accessToken) return { ...base, disponivel: false, motivo: 'Token de acesso não informado' };
  if (!config.ativo) return { ...base, disponivel: false, motivo: 'Canal Meta desativado nas configurações' };
  return {
    ...base,
    disponivel: true,
    preferencial: config.preferencial,
    numeroExibicao: config.numeroExibicao || '',
    templates: config.templates,
    // Textos fixos das variáveis configuradas pela clínica (local, instruções…)
    textos: config.textos || {}
  };
}

// ==================== ENVIO ====================

/**
 * Envia pela Cloud API. Dois modos:
 *  - texto livre  → só funciona DENTRO da janela de 24h (paciente escreveu antes)
 *  - template     → funciona sempre, desde que aprovado pela Meta
 * Nunca lança exceção: devolve sempre { success, ... }.
 */
async function enviarWhatsappMeta(
clinicaId,
telefone,
{ mensagem, template, botaoUrl, permitirInativo = false, baseUrl = '' } = {})
{
  const config = await buscarConfigMeta(clinicaId);
  if (!config) return { success: false, error: 'Canal Meta não configurado para esta clínica.' };
  // O teste da tela de configurações valida credenciais ANTES de ativar o canal
  // — exigir "ativo" aqui tornava impossível validar antes de ligar.
  if (!config.ativo && !permitirInativo) {
    return { success: false, error: 'Canal Meta está desativado nas configurações.' };
  }
  if (!config.phoneNumberId || !config.accessToken) {
    return { success: false, error: 'Informe o Phone Number ID e o token de acesso da Meta.' };
  }

  const destino = normalizarTelefoneMeta(telefone);
  if (!destino) return { success: false, error: `Telefone inválido: ${telefone}` };
  if (!mensagem && !template) {
    return { success: false, error: 'Informe a mensagem (janela de 24h) ou o template aprovado.' };
  }

  // A Meta recusa (132012) qualquer parâmetro com quebra de linha, tabulação
  // ou 4+ espaços seguidos. O "local" da clínica (nome + endereço) e textos
  // colados caem nisso com facilidade, então normalizamos antes de enviar.
  const paramMeta = (valor) =>
  String(valor ?? '').
  replace(/[\r\n\t]+/g, ' ').
  replace(/ {4,}/g, '   ').
  trim();

  const corpo = template ?
  {
    messaging_product: 'whatsapp',
    to: destino,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language || 'pt_BR' },
      components: (template.params || []).length ?
      [
      {
        type: 'body',
        parameters: template.params.map((valor) => ({
          type: 'text',
          text: paramMeta(valor)
        }))
      }] :

      []
    }
  } :
  botaoUrl?.url ?
  // ⭐ Mensagem livre COM botão. Dentro da janela de 24h a Meta aceita o
  // formato interativo "cta_url" — é assim que a resposta automática leva
  // o botão "Falar conosco" sem depender de template aprovado.
  {
    messaging_product: 'whatsapp',
    to: destino,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: String(mensagem) },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: String(botaoUrl.texto || 'Falar conosco').slice(0, 20),
          url: String(botaoUrl.url)
        }
      }
    }
  } :
  {
    messaging_product: 'whatsapp',
    to: destino,
    type: 'text',
    text: { preview_url: true, body: String(mensagem) }
  };

  // ⭐ LOGOTIPO DA CLÍNICA: na Meta o logo não vai no corpo do texto — ele é o
  // cabeçalho de mídia do template. Se o modelo aprovado tem HEADER de imagem,
  // a Meta EXIGE esse parâmetro; enviamos a URL pública configurada.
  if (template) {
    // ⚠️ Botão "Ligar no WhatsApp" (VOICE_CALL) exige a Calling API habilitada
    // no número. Sem isso a Meta recusa a mensagem INTEIRA com #138000 — mesmo
    // com corpo e variáveis corretos. Avisamos antes de gastar o envio.
    const botaoLigacao = await templateTemBotaoLigacao(config, template);
    if (botaoLigacao) {
      return {
        success: false,
        error:
        'O template aprovado tem o botão "Ligar no WhatsApp" (chamada de voz), e a Meta recusa a mensagem porque a Calling API não está habilitada neste número (#138000). No WhatsApp Manager, troque esse botão por "Acessar o site" apontando para https://<seu-dominio>/falar/{{1}} — o sistema redireciona para o WhatsApp da clínica. Assim não é preciso habilitar chamadas.'
      };
    }

    const formatoHeader = await formatoHeaderTemplate(config, template);
    if (formatoHeader === 'IMAGE') {
      // 1º) URL informada na configuração · 2º) o logo do cadastro da clínica,
      // publicado automaticamente pela rota /logo (o base64 do cadastro não
      // serve: a Meta baixa a imagem pela internet).
      let logo = String(config.textos?.logoUrl || '').trim();
      if (!/^https:\/\//i.test(logo) && baseUrl && (await clinicaTemLogo(clinicaId))) {
        logo = `${baseUrl}/api/whatsapp-meta/logo/${encodeURIComponent(clinicaId)}.png`;
      }
      if (/^https:\/\//i.test(logo)) {
        corpo.template.components.unshift({
          type: 'header',
          parameters: [{ type: 'image', image: { link: logo } }]
        });
      } else {
        return {
          success: false,
          error:
          'O template aprovado tem cabeçalho de IMAGEM (logotipo) e a Meta exige a imagem em cada envio. Cadastre o logotipo da clínica em Administração → Clínicas (ele é publicado automaticamente), ou informe uma URL pública HTTPS em WhatsApp Oficial → Textos das mensagens.'
        };
      }
    }
  }

  // ⭐ O parâmetro do botão SÓ pode ir se o template aprovado tiver um botão de
  // URL DINÂMICA. Mandá-lo para um template sem botão (ou com botão estático)
  // faz a Meta recusar com 132012 — era exatamente o caso do confirma_consulta.
  // A verificação é feita AQUI, no servidor, e não depende do que a tela gravou.
  if (template?.urlParam) {
    const aceita = await templateAceitaBotao(config, template);
    if (aceita === false) {
      console.log(
        `🟢 [META] Template "${template.name}" não tem botão de URL dinâmica — o link não será enviado como parâmetro de botão.`
      );
      delete template.urlParam;
    }
  }

  // Botões de URL dinâmica (usado no link de confirmação/consulta online)
  if (template?.urlParam) {
    // ⭐ Num botão de URL dinâmica a Meta NÃO recebe a URL inteira: a base está
    // fixa no template aprovado e o parâmetro é apenas o SUFIXO. Mandar o link
    // completo produzia URLs quebradas — era a causa do "Falar conosco" (e do
    // link de confirmação) não funcionar ao ser clicado.
    const sufixo = await sufixoBotaoUrl(config, template, clinicaId);
    corpo.template.components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: paramMeta(sufixo) }]
    });
  }

  try {
    const url = `${GRAPH_BASE_URL}/${config.apiVersion}/${config.phoneNumberId}/messages`;
    const { resposta, dados } = await fetchComTeto(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(corpo)
      },
      12000
    );
    if (!resposta.ok) {
      let erro = descreverErroMeta(dados, resposta.status);
      // ⭐ Em vez de palpite: quando o erro é divergência de formato, o próprio
      // servidor busca o template APROVADO na Meta e diz, campo por campo, o
      // que está diferente do que acabamos de enviar.
      const codigo = dados?.error?.code;
      if ([132000, 132001, 132012].includes(codigo) && template?.name) {
        const laudo = await compararComTemplateAprovado(config, template, corpo);
        if (laudo) erro = `${erro}\n\n${laudo}`;
      }
      // ⭐ A mensagem importa mais que o botão: se a Meta recusar o formato
      // interativo (número/versão sem suporte a cta_url), reenviamos como texto
      // com o link no corpo — o paciente nunca fica sem a resposta.
      if (botaoUrl?.url && !template) {
        console.log(`🟢 [META] cta_url recusado (${erro}). Reenviando como texto.`);
        return enviarWhatsappMeta(clinicaId, telefone, {
          mensagem: `${mensagem}\n\n${botaoUrl.texto || 'Falar conosco'}: ${botaoUrl.url}`,
          permitirInativo,
          baseUrl
        });
      }
      return { success: false, error: erro };
    }
    const id = dados?.messages?.[0]?.id || null;
    console.log(`🟢 [META] Enviado para ${destino} (id: ${id})`);
    return { success: true, id, canal: 'meta' };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: 'A Meta não respondeu em 12s. Verifique se o servidor tem saída HTTPS para graph.facebook.com.'
      };
    }
    return { success: false, error: err?.message || 'Falha ao falar com a Meta.' };
  }
}

// Estrutura dos templates aprovados, por clínica. Evita uma consulta à Meta em
// cada envio; 5 minutos é curto o bastante para refletir uma alteração feita no
// painel sem obrigar a reiniciar o servidor.
const cacheTemplates = new Map(); // wabaId -> { em, lista }
const CACHE_TEMPLATES_MS = 5 * 60 * 1000;

async function listarTemplatesAprovados(config) {
  if (!config.wabaId || !config.accessToken) return null;
  const cache = cacheTemplates.get(config.wabaId);
  if (cache && Date.now() - cache.em < CACHE_TEMPLATES_MS) return cache.lista;
  try {
    const url = `${GRAPH_BASE_URL}/${config.apiVersion}/${config.wabaId}/message_templates?limit=200&fields=name,language,status,components`;
    const { resposta, dados } = await fetchComTeto(
      url,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
      8000
    );
    if (!resposta.ok) return null;
    const lista = dados?.data || [];
    cacheTemplates.set(config.wabaId, { em: Date.now(), lista });
    return lista;
  } catch (e) {
    return null;
  }
}

/**
 * O template aprovado tem botão de URL DINÂMICA (com {{1}} na URL)?
 * true = aceita o parâmetro do botão · false = recusa · null = indeterminado
 * (sem WABA ID ou sem resposta da Meta — nesse caso não mexemos no envio).
 */
async function templateAprovadoDaMeta(config, template) {
  const lista = await listarTemplatesAprovados(config);
  if (!lista) return null;
  const iguais = lista.filter((t) => t.name === template.name);
  if (!iguais.length) return null;
  return (
    iguais.find((t) => t.language === (template.language || 'pt_BR')) || iguais[0]);

}

async function templateAceitaBotao(config, template) {
  const aprovado = await templateAprovadoDaMeta(config, template);
  if (!aprovado) return null;
  const botoes =
  (aprovado.components || []).find((c) => c.type === 'BUTTONS')?.buttons || [];
  const botaoUrl = botoes.find((b) => b.type === 'URL');
  return Boolean(botaoUrl && /\{\{\d+\}\}/.test(botaoUrl.url || ''));
}

/**
 * ⭐ O VALOR correto do parâmetro do botão de URL dinâmica.
 *
 * A Meta concatena: URL do template (com {{1}} no fim) + parâmetro. Portanto o
 * parâmetro é o SUFIXO, nunca a URL completa. Duas situações reais:
 *   • .../falar/{{1}}     → o sufixo é o ID DA CLÍNICA (redireciona ao wa.me)
 *   • .../confirmar/{{1}} → o sufixo é o TOKEN do link de confirmação
 *
 * Quando não é possível ler o template aprovado, devolvemos o último segmento
 * do link — que é o comportamento correto na esmagadora maioria dos casos.
 */
async function sufixoBotaoUrl(config, template, clinicaId) {
  const valor = String(template.urlParam || '');
  const ultimoSegmento = () => {
    const limpo = valor.replace(/[?#].*$/, '').replace(/\/+$/, '');
    const partes = limpo.split('/');
    return partes[partes.length - 1] || valor;
  };

  const aprovado = await templateAprovadoDaMeta(config, template);
  const botoes =
  (aprovado?.components || []).find((c) => c.type === 'BUTTONS')?.buttons || [];
  const urlTemplate = String(
    botoes.find((b) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || ''))?.url || ''
  );

  if (!urlTemplate) return ultimoSegmento();

  const prefixo = urlTemplate.replace(/\{\{\d+\}\}.*$/, '');

  // ⭐ CAMINHO DIRETO (o que todo mundo usa): o botão do template aponta para
  // https://wa.me/{{1}} e o parâmetro é o PRÓPRIO NÚMERO da clínica. Sem
  // servidor no meio, sem redirecionamento — o WhatsApp abre a conversa
  // nativamente, inclusive dentro do navegador embutido do aplicativo.
  if (/wa\.me\/?$/i.test(prefixo) || /api\.whatsapp\.com\/send\/?/i.test(prefixo)) {
    const numero = await numeroAtendimentoClinica(clinicaId);
    return numero || ultimoSegmento();
  }

  // "Falar conosco" via servidor: o sufixo identifica a CLÍNICA.
  if (/\/falar\/?$/i.test(prefixo)) return String(clinicaId || '');

  // O link já foi montado sobre a mesma base: manda só o que sobra dela.
  if (valor && prefixo && valor.toLowerCase().startsWith(prefixo.toLowerCase())) {
    return valor.slice(prefixo.length);
  }

  return ultimoSegmento();
}

/**
 * O template aprovado tem botão de CHAMADA DE VOZ ("Ligar no WhatsApp")?
 * Esse botão só funciona com a Calling API habilitada no número; sem isso a
 * Meta rejeita o envio inteiro (#138000).
 * true = tem · false = não tem · null = indeterminado.
 */
async function templateTemBotaoLigacao(config, template) {
  const aprovado = await templateAprovadoDaMeta(config, template);
  if (!aprovado) return null;
  const botoes =
  (aprovado.components || []).find((c) => c.type === 'BUTTONS')?.buttons || [];
  return botoes.some((b) =>
  ['VOICE_CALL', 'PHONE_NUMBER_CALL', 'CALL'].includes(String(b.type || ''))
  );
}

/**
 * ⭐ O template aprovado tem cabeçalho de IMAGEM? Nesse caso a Meta EXIGE o
 * parâmetro de header em todo envio — é por ali que vai o logotipo da clínica
 * (o logo não vai no corpo do texto).
 * Devolve 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | null (indeterminado).
 */
async function formatoHeaderTemplate(config, template) {
  const aprovado = await templateAprovadoDaMeta(config, template);
  if (!aprovado) return null;
  const header = (aprovado.components || []).find((c) => c.type === 'HEADER');
  if (!header) return 'NENHUM';
  return header.format || 'TEXT';
}

/**
 * ⭐ DIAGNÓSTICO REAL: busca o template aprovado na WABA e compara, item por
 * item, com o que foi enviado. Devolve um texto pronto para a tela — ou null
 * se não for possível consultar (sem wabaId, sem permissão, etc.).
 *
 * É a única forma de sair do "tentativa e erro": a causa do 132012 está sempre
 * na diferença entre os componentes aprovados e os componentes enviados.
 */
async function compararComTemplateAprovado(config, template, corpoEnviado) {
  if (!config.wabaId) {
    return 'Não foi possível comparar com o modelo aprovado: o WABA ID não está configurado.';
  }
  try {
    const url = `${GRAPH_BASE_URL}/${config.apiVersion}/${config.wabaId}/message_templates?limit=200&fields=name,language,status,components`;
    const { resposta, dados } = await fetchComTeto(
      url,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
      10000
    );
    if (!resposta.ok) return null;

    const lista = dados?.data || [];
    const iguais = lista.filter((t) => t.name === template.name);
    if (!iguais.length) {
      const nomes = lista.
      map((t) => `${t.name} (${t.language})`).
      slice(0, 15).
      join(', ');
      return `A WABA configurada NÃO tem nenhum template chamado "${template.name}". Templates disponíveis: ${nomes || 'nenhum'}.`;
    }
    const idiomaPedido = template.language || 'pt_BR';
    const aprovado = iguais.find((t) => t.language === idiomaPedido) || iguais[0];

    const linhas = [];
    if (aprovado.language !== idiomaPedido) {
      linhas.push(
        `• Idioma: o template está aprovado em "${aprovado.language}", mas o envio pediu "${idiomaPedido}".`
      );
    }

    // BODY: quantidade de variáveis distintas
    const body = (aprovado.components || []).find((c) => c.type === 'BODY');
    const posicoes = new Set((body?.text || '').match(/\{\{\d+\}\}/g) || []);
    const enviadas =
    (corpoEnviado.template?.components || []).find((c) => c.type === 'body')?.
    parameters?.length || 0;
    if (posicoes.size !== enviadas) {
      linhas.push(
        `• Variáveis: o modelo aprovado usa ${posicoes.size} ({{${[...posicoes].
        map((p) => p.replace(/\D/g, '')).
        join('}}, {{')}}}), mas o envio mandou ${enviadas}.`
      );
    }

    // HEADER de mídia/texto com variável exige parâmetro próprio
    const header = (aprovado.components || []).find((c) => c.type === 'HEADER');
    const headerEnviado = (corpoEnviado.template?.components || []).some(
      (c) => c.type === 'header'
    );
    if (header && !headerEnviado) {
      const formato = header.format || 'TEXT';
      const varsHeader = (header.text || '').match(/\{\{\d+\}\}/g) || [];
      if (formato !== 'TEXT' || varsHeader.length) {
        linhas.push(
          `• Cabeçalho: o modelo aprovado tem um header do tipo ${formato}${
          varsHeader.length ? ' com variável' : ''}, e o envio não manda nenhum parâmetro de header. A Meta exige esse parâmetro.`

        );
      }
    }

    // BOTÕES: dinâmico exige parâmetro; estático recusa parâmetro
    const botoes =
    (aprovado.components || []).find((c) => c.type === 'BUTTONS')?.buttons || [];
    const botaoUrl = botoes.find((b) => b.type === 'URL');
    const urlDinamica = Boolean(botaoUrl && /\{\{\d+\}\}/.test(botaoUrl.url || ''));
    const enviouBotao = (corpoEnviado.template?.components || []).some(
      (c) => c.type === 'button'
    );
    if (enviouBotao && !urlDinamica) {
      linhas.push(
        botaoUrl ?
        '• Botão: o botão de URL aprovado é ESTÁTICO (a URL não tem {{1}}), mas o envio mandou o parâmetro do botão. A Meta recusa. Recadastre o botão com a URL terminando em {{1}} ou desvincule o link.' :
        '• Botão: o modelo aprovado NÃO tem botão de URL, mas o envio mandou o parâmetro de um botão. É esta a divergência.'
      );
    }
    if (!enviouBotao && urlDinamica) {
      linhas.push(
        '• Botão: o botão de URL aprovado é DINÂMICO ({{1}} na URL) e exige o parâmetro do botão, que não foi enviado.'
      );
    }

    if (!linhas.length) {
      return `Comparação com o modelo aprovado "${aprovado.name}" (${aprovado.language}, ${aprovado.status}): variáveis e botões conferem. Se o erro persistir, verifique se algum valor enviado contém quebra de linha ou 4 espaços seguidos.`;
    }
    return [
    `O que está diferente do modelo aprovado "${aprovado.name}" (${aprovado.language}):`,
    ...linhas].
    join('\n');
  } catch (e) {
    return null;
  }
}

// Registro no histórico é fire-and-forget: NUNCA antes de responder ao navegador.
function registrarHistoricoMeta(clinicaId, pacienteId, pacienteNome, mensagem, status, erro, consultaId) {
  if (!pacienteId && !pacienteNome) return;
  Promise.resolve().
  then(() =>
  salvarMensagemHistorico(
    clinicaId,
    pacienteId,
    pacienteNome,
    'enviada',
    `[WhatsApp Meta] ${mensagem}`,
    status,
    erro,
    consultaId
  )
  ).
  catch((err) => console.error('🟢 [META] Falha ao gravar histórico:', err?.message));
}

// ==================== CORPO text/plain (evita preflight de CORS) ====================
// Um POST com application/json obriga o navegador a mandar um OPTIONS antes.
// Onde o proxy não repassa OPTIONS, o POST nem sai e o navegador só diz
// "Failed to fetch". Com text/plain o POST é requisição simples e passa.
router.use((req, res, next) => {
  const tipo = String(req.headers['content-type'] || '');
  if (!tipo.includes('text/plain') || req.body && Object.keys(req.body).length) {
    return next();
  }
  let bruto = '';
  req.setEncoding('utf8');
  req.on('data', (parte) => {
    bruto += parte;
    if (bruto.length > 1e6) req.destroy();
  });
  req.on('end', () => {
    try {
      req.body = bruto ? JSON.parse(bruto) : {};
    } catch (e) {
      req.body = {};
    }
    next();
  });
  req.on('error', () => next());
});

// ==================== CONFIGURAÇÃO ====================

router.get('/config', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  garantirTabelaMeta(db, () => {
    db.get(
      'SELECT * FROM whatsapp_meta_config WHERE clinicaId = ? ORDER BY atualizadoEm DESC',
      [clinicaId],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Configuração não encontrada' });
        const config = normalizarConfig(row);
        // O token NUNCA volta inteiro para a tela — só a confirmação de que existe.
        res.json({
          ...config,
          accessToken: '',
          tokenConfigurado: Boolean(config.accessToken)
        });
      }
    );
  });
});

router.post('/config', (req, res) => {
  const { clinicaId, ...dados } = req.body || {};
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  console.log(`💾 POST /api/whatsapp-meta/config - clinicaId: ${clinicaId}`);

  const db = getClinicaDB(clinicaId);
  const id = `meta_${Date.now()}`;
  const atualizadoEm = new Date().toISOString();
  // Token em branco NÃO apaga o que já está salvo (a tela nunca o devolve).
  const temToken = typeof dados.accessToken === 'string' && dados.accessToken.trim() !== '';
  const ativoVal = dados.ativo ? 1 : 0;
  const preferencialVal = dados.preferencial ? 1 : 0;
  const templatesJson = JSON.stringify(dados.templates || {});
  const textosJson = JSON.stringify(dados.textos || {});
  // ⭐ O verify token do webhook é gerado pelo sistema, não digitado: ele só
  // precisa ser igual aqui e no painel da Meta, e um valor aleatório evita que
  // alguém adivinhe a URL de entrada. Gerado uma vez e preservado depois.
  const verifyTokenVal =
  String(dados.verifyToken || '').trim() ||
  require('crypto').randomBytes(16).toString('hex');

  garantirTabelaMeta(db, () => {
    // ⭐ Uma única instrução resolve criação E atualização. O padrão anterior
    // (UPDATE e, se "0 linhas alteradas", INSERT) criava linhas duplicadas
    // porque o MySQL relata 0 quando os valores enviados são iguais aos gravados.
    const colunas = [
    'id',
    'clinicaId',
    'apiVersion',
    'phoneNumberId',
    'wabaId',
    'accessToken',
    'numeroExibicao',
    'ativo',
    'preferencial',
    'templates',
    'textos',
    'verifyToken',
    'atualizadoEm'];

    const valores = [
    id,
    clinicaId,
    dados.apiVersion || API_VERSION_PADRAO,
    String(dados.phoneNumberId || '').trim(),
    String(dados.wabaId || '').trim(),
    temToken ? dados.accessToken.trim() : '',
    String(dados.numeroExibicao || '').trim(),
    ativoVal,
    preferencialVal,
    templatesJson,
    textosJson,
    verifyTokenVal,
    atualizadoEm];

    // Token em branco preserva o que já está gravado (a tela nunca o devolve).
    const atualiza = [
    'apiVersion=VALUES(apiVersion)',
    'phoneNumberId=VALUES(phoneNumberId)',
    'wabaId=VALUES(wabaId)',
    'numeroExibicao=VALUES(numeroExibicao)',
    'ativo=VALUES(ativo)',
    'preferencial=VALUES(preferencial)',
    'templates=VALUES(templates)',
    'atualizadoEm=VALUES(atualizadoEm)'];

    // Só sobrescreve os textos quando a tela realmente os enviou — assim uma
    // gravação parcial (ex.: desconectar o número) não apaga o que a clínica
    // configurou.
    if (dados.textos && typeof dados.textos === 'object') {
      atualiza.push('textos=VALUES(textos)');
    }
    // Preserva o verify token já cadastrado no painel da Meta: trocá-lo a cada
    // gravação invalidaria o webhook que a clínica já configurou.
    if (String(dados.verifyToken || '').trim()) {
      atualiza.push('verifyToken=VALUES(verifyToken)');
    } else {
      atualiza.push('verifyToken=COALESCE(NULLIF(verifyToken, \'\'), VALUES(verifyToken))');
    }
    if (temToken) atualiza.push('accessToken=VALUES(accessToken)');

    db.run(
      `INSERT INTO whatsapp_meta_config (${colunas.join(',')})
       VALUES (${colunas.map(() => '?').join(',')})
       ON DUPLICATE KEY UPDATE ${atualiza.join(',')}`,
      valores,
      (err) => {
        if (err) {
          console.error('🟢 [META] Falha ao gravar configuração:', err.message);
          return res.status(500).json({ error: err.message });
        }
        // ⭐ Devolve o que REALMENTE ficou gravado (leitura de volta), em vez de
        // repetir o que a tela enviou. Assim uma gravação que não persistiu
        // aparece na hora, e não só depois de reiniciar o app.
        db.get(
          'SELECT * FROM whatsapp_meta_config WHERE clinicaId = ? ORDER BY atualizadoEm DESC',
          [clinicaId],
          (leituraErr, row) => {
            if (leituraErr || !row) {
              return res.status(500).json({
                error:
                'A configuração foi enviada, mas não foi encontrada no banco após a gravação.'
              });
            }
            const gravado = normalizarConfig(row);
            res.json({
              ...gravado,
              accessToken: '',
              tokenConfigurado: Boolean(gravado.accessToken)
            });
          }
        );
      }
    );
  });
});

// ==================== AÇÕES ====================

// A agenda/fila usa para decidir se oferece o canal Meta
router.get('/disponivel', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    res.json(await metaDisponivel(clinicaId));
  } catch (err) {
    res.status(500).json({ disponivel: false, motivo: err.message, versao: META_ROUTES_VERSAO });
  }
});

async function tratarEnvio(req, res, origem) {
  const dados = origem === 'query' ? req.query : req.body || {};
  const { clinicaId, telefone, mensagem, pacienteId, pacienteNome, consultaId } = dados;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!telefone) return res.status(400).json({ error: 'telefone é obrigatório' });

  let template = dados.template;
  if (typeof template === 'string' && template) {
    try {
      template = JSON.parse(template);
    } catch (e) {
      template = { name: template };
    }
  }
  if (!mensagem && !template) {
    return res.status(400).json({ error: 'Informe mensagem ou template' });
  }

  const resultado = await comOrcamento(
    enviarWhatsappMeta(clinicaId, telefone, {
      mensagem,
      template,
      // Necessário para publicar o logotipo da clínica como cabeçalho
      baseUrl: baseUrlPublica(req)
    }),
    14000,
    'O envio não retornou em 14s. Verifique se o servidor tem saída HTTPS para graph.facebook.com (teste: /api/whatsapp-meta/diag).'
  );

  const textoHistorico = template ?
  `Template ${template.name}${template.params?.length ? ` (${template.params.join(' | ')})` : ''}` :
  String(mensagem);

  if (!resultado.success) {
    // 400 em vez de 502: o 502 se confunde com falha de gateway no navegador e
    // esconde o motivo real devolvido pela Meta.
    res.status(400).json({ error: resultado.error });
  } else {
    res.json({ success: true, id: resultado.id, canal: 'meta' });
    // ⭐ Guarda o id da mensagem (wamid) junto do paciente e da consulta. É por
    // ele que a RESPOSTA será atribuída — buscar o paciente pelo telefone é
    // inconsistente (mesmo número para mãe e filhos, envio para terceiros).
    registrarEnvioMeta(clinicaId, {
      wamid: resultado.id,
      consultaId,
      pacienteId,
      pacienteNome,
      telefone,
      tipo: template?.name || 'texto'
    }).catch(() => {});
  }
  registrarHistoricoMeta(
    clinicaId,
    pacienteId,
    pacienteNome,
    textoHistorico,
    resultado.success ? 'enviada' : 'erro',
    resultado.success ? null : resultado.error,
    consultaId
  );
}

router.post('/send-message', (req, res) => tratarEnvio(req, res, 'body'));
// ⭐ Mesmo envio por GET: contorno para ambientes onde o proxy/CDN barra o POST
// nesta rota (a resposta de bloqueio não tem CORS e o navegador só consegue
// dizer "Failed to fetch"). O GET simples passa.
router.get('/send-message', (req, res) => tratarEnvio(req, res, 'query'));

// Dados que o usuário precisa colar no painel da Meta para RECEBER as
// respostas. A URL é derivada do host da própria requisição: fixá-la em
// variável de ambiente já se provou frágil neste servidor.
router.get('/webhook-info', async (req, res) => {
  const { clinicaId } = req.query;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const callbackUrl = `${proto}://${host}/api/whatsapp-meta/webhook`;

  const base = {
    callbackUrl,
    campoObrigatorio: 'messages',
    verifyTokenConfigurado: false,
    phoneNumberId: null,
    tokenConfigurado: false
  };

  if (!clinicaId) return res.json(base);

  try {
    const config = await buscarConfigMeta(clinicaId);
    res.json({
      ...base,
      verifyTokenConfigurado: Boolean(config?.verifyToken),
      phoneNumberId: config?.phoneNumberId || null,
      tokenConfigurado: Boolean(config?.accessToken)
    });
  } catch (err) {
    // A URL e o campo a assinar não dependem da configuração: responder 200
    // com o que se sabe é melhor que derrubar a tela por causa do banco.
    console.error('⚠️ [META] webhook-info:', err.message);
    res.json(base);
  }
});

// Lista os templates da WABA, com status de aprovação — a tela usa para o
// usuário escolher pelo nome real, sem digitar errado.
router.get('/templates', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    const config = await buscarConfigMeta(clinicaId);
    if (!config?.accessToken) {
      return res.status(400).json({ error: 'Informe e salve o token de acesso da Meta.' });
    }
    if (!config.wabaId) {
      return res.status(400).json({ error: 'Informe o WABA ID (WhatsApp Business Account ID).' });
    }
    const url = `${GRAPH_BASE_URL}/${config.apiVersion}/${config.wabaId}/message_templates?limit=100&fields=name,status,language,category,components`;
    const { resposta, dados } = await fetchComTeto(
      url,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
      10000
    );
    if (!resposta.ok) {
      // ⚠️ Nunca 502/5xx aqui: o app trata 5xx como "servidor fora" e mostra o
      // aviso de sem conexão, escondendo o motivo real vindo da Meta.
      return res.status(400).json({ error: descreverErroMeta(dados, resposta.status) });
    }
    const templates = (dados?.data || []).map((t) => ({
      name: t.name,
      status: t.status,
      language: t.language,
      category: t.category,
      // Nº de variáveis do corpo: a tela avisa se o mapeamento não confere
      variaveis: (() => {
        const corpo = (t.components || []).find((c) => c.type === 'BODY');
        const texto = corpo?.text || '';
        // Contagem por posição DISTINTA: um template que repete {{1}} tem
        // 1 variável, não 2 — contar repetições inventava divergência.
        const encontrados = texto.match(/\{\{\d+\}\}/g) || [];
        return new Set(encontrados).size;
      })(),
      temBotaoUrl: (t.components || []).some(
        (c) => c.type === 'BUTTONS' && (c.buttons || []).some((b) => b.type === 'URL')
      )
    }));
    res.json({ templates, total: templates.length });
  } catch (err) {
    const motivo =
    err?.name === 'AbortError' ?
    'A Meta não respondeu em 10s (verifique a saída HTTPS para graph.facebook.com).' :
    err.message;
    res.status(400).json({ error: motivo });
  }
});

// Envio de teste a partir da tela de configurações
router.post('/testar', async (req, res) => {
  const { clinicaId, telefone, templateName, templateLanguage, params, urlParam } =
  req.body || {};
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!telefone) return res.status(400).json({ error: 'telefone é obrigatório' });

  const template = templateName ?
  {
    name: templateName,
    language: templateLanguage || 'pt_BR',
    params: Array.isArray(params) ? params : [],
    // Template com botão de URL dinâmica EXIGE o parâmetro do botão
    urlParam: urlParam || undefined
  } :
  null;

  const resultado = await comOrcamento(
    enviarWhatsappMeta(clinicaId, telefone, {
      template,
      mensagem: template ? undefined : 'Teste de integração do WhatsApp oficial (Meta).',
      // Validar credenciais é justamente o passo ANTES de ativar o canal
      permitirInativo: true,
      baseUrl: baseUrlPublica(req)
    }),
    14000,
    'O teste não retornou em 14s. Verifique a saída HTTPS do servidor para graph.facebook.com.'
  );

  if (!resultado.success) {
    // ⚠️ Nunca responder 502 aqui: no navegador isso se confunde com falha de
    // gateway/proxy e esconde o motivo real. 400 = há algo a corrigir na config.
    let erro = resultado.error;
    if (!template) {
      erro = `${erro} — Este teste usou TEXTO LIVRE, que a Meta só entrega se o paciente tiver escrito para a clínica nas últimas 24h. Para validar a integração, clique em "Carregar templates" e escolha um template aprovado no campo "Template do teste".`;
    }
    return res.status(400).json({ error: erro, semTemplate: !template });
  }
  res.json({ success: true, id: resultado.id });
});

// Diagnóstico em UMA URL: diz onde está parando, sem expor segredo
router.get('/diag', async (req, res) => {
  const { clinicaId } = req.query;
  const relatorio = { versao: META_ROUTES_VERSAO, etapas: [] };
  if (!clinicaId) {
    relatorio.etapas.push({ etapa: 'clinicaId', ok: false, detalhe: 'Informe ?clinicaId=' });
    return res.json(relatorio);
  }
  try {
    const config = await buscarConfigMeta(clinicaId);
    relatorio.etapas.push({
      etapa: 'configuração',
      ok: Boolean(config),
      detalhe: config ?
      `ativo: ${config.ativo}, preferencial: ${config.preferencial}, phoneNumberId: ${config.phoneNumberId ? 'informado' : 'AUSENTE'}, wabaId: ${config.wabaId ? 'informado' : 'AUSENTE'}, token: ${config.accessToken ? 'informado' : 'AUSENTE'}, templates mapeados: ${Object.keys(config.templates || {}).length}` :
      'Nenhuma configuração salva para esta clínica'
    });
    if (!config?.accessToken || !config?.phoneNumberId) return res.json(relatorio);

    const inicio = Date.now();
    try {
      const { resposta, dados } = await fetchComTeto(
        `${GRAPH_BASE_URL}/${config.apiVersion}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${config.accessToken}` } },
        8000
      );
      relatorio.etapas.push({
        etapa: 'saída HTTPS + credencial (graph.facebook.com)',
        ok: resposta.ok,
        ms: Date.now() - inicio,
        detalhe: resposta.ok ?
        `Número: ${dados?.display_phone_number || '?'} (${dados?.verified_name || 'sem nome verificado'}), qualidade: ${dados?.quality_rating || '?'}` :
        descreverErroMeta(dados, resposta.status)
      });
    } catch (err) {
      relatorio.etapas.push({
        etapa: 'saída HTTPS (graph.facebook.com)',
        ok: false,
        ms: Date.now() - inicio,
        detalhe:
        err?.name === 'AbortError' ?
        'Sem resposta em 8s — o servidor provavelmente não tem saída HTTPS liberada para graph.facebook.com' :
        err.message
      });
    }
    res.json(relatorio);
  } catch (err) {
    relatorio.etapas.push({ etapa: 'erro inesperado', ok: false, detalhe: err.message });
    res.json(relatorio);
  }
});

module.exports = router;
module.exports.enviarWhatsappMeta = enviarWhatsappMeta;
module.exports.metaDisponivel = metaDisponivel;
module.exports.buscarConfigMeta = buscarConfigMeta;
module.exports.normalizarTelefoneMeta = normalizarTelefoneMeta;
module.exports.numeroAtendimentoClinica = numeroAtendimentoClinica;
module.exports.linkWaMeClinica = linkWaMeClinica;