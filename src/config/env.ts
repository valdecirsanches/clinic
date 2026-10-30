/**
 * ⭐ Configuração de Ambiente — FONTE ÚNICA
 *
 * 🔧 Os valores vêm de variáveis de ambiente (Vite: import.meta.env.VITE_*) quando
 *    disponíveis. Defina-as em `.env.local` (NÃO versionado) em cada servidor.
 *    Se `import.meta.env` ou a variável não existir, usa o valor padrão abaixo —
 *    então o app funciona em qualquer ambiente (preview, produção, localhost) sem
 *    configuração extra e este arquivo não precisa ser editado por ambiente.
 *
 * Variáveis suportadas (ver .env.example):
 *   VITE_SERVER_DB        → URL do servidor de banco de dados / API
 *   VITE_WAHA_SERVER_URL  → URL do servidor WAHA (WhatsApp HTTP API)
 *   VITE_WAHA_API_KEY     → Chave da API do WAHA
 *
 * @version 3.1.0 — Acesso seguro a import.meta.env (com fallback)
 */

// ⭐ CADA variável é lida pelo caminho COMPLETO `import.meta.env.VITE_*`.
//    Isso é obrigatório: o Vite faz substituição ESTÁTICA de texto no build.
//    Guardar `import.meta.env` numa variável (ou desestruturar) devolve apenas
//    as chaves internas do Vite (MODE, DEV, PROD...) — as variáveis VITE_* do
//    `.env.local` desaparecem e o app cai silenciosamente nos padrões abaixo.
//    Era exatamente essa a causa de o servidor continuar usando a API antiga
//    mesmo com VITE_SERVER_DB apontando para outro domínio.
//    O try/catch cobre ambientes (ex.: preview) em que import.meta.env não existe.
function lerEnv(): Record<string, string | undefined> {
  try {
    return {
      VITE_SERVER_DB: import.meta.env.VITE_SERVER_DB,
      VITE_WAHA_SERVER_URL: import.meta.env.VITE_WAHA_SERVER_URL,
      VITE_WAHA_API_KEY: import.meta.env.VITE_WAHA_API_KEY,
      VITE_BIOMETRIA_WS_URL: import.meta.env.VITE_BIOMETRIA_WS_URL,
      VITE_VIDEO_BASE_URL: import.meta.env.VITE_VIDEO_BASE_URL,
      VITE_VIDEO_PROVIDER: import.meta.env.VITE_VIDEO_PROVIDER,
      VITE_APP_BASE_URL: import.meta.env.VITE_APP_BASE_URL,
      VITE_BACKUP_API_URL: import.meta.env.VITE_BACKUP_API_URL
    };
  } catch {
    return {};
  }
}
const viteEnv: Record<string, string | undefined> = lerEnv();
// Fica visível no console qual origem foi usada, para diagnosticar rapidamente
// uma variável que não chegou ao build.
// ⭐⭐⭐ A API SEGUE O ENDEREÇO ABERTO NO NAVEGADOR ⭐⭐⭐
// Quem abre clinic.sky9.com.br usa clinic-api.sky9.com.br; quem abre
// clinic-app.x-star.com.br usa clinic-api.x-star.com.br. Isso vale MESMO que o
// build tenha sido gerado com o .env.local de outra instalação (ou sem ele) —
// antes, nesses casos, a produção caía silenciosamente na API de teste
// (x-star) e gravava no banco errado.
const DOMINIOS_COM_API_PROPRIA = ['sky9.com.br', 'x-star.com.br'];

function hostAtual(): string {
  try {
    return window.location.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Domínio principal (ex.: "sky9.com.br") de um host ou URL */
function dominioDe(valor: string): string {
  let host = valor;
  try {
    host = new URL(valor).hostname;
  } catch {

    // já é um host
  }return DOMINIOS_COM_API_PROPRIA.find((d) => host.toLowerCase() === d || host.toLowerCase().endsWith(`.${d}`)) || '';
}

/** API da instalação aberta no navegador, se for um domínio conhecido */
function apiDoEnderecoAberto(): string {
  const dominio = dominioDe(hostAtual());
  return dominio ? `https://clinic-api.${dominio}` : '';
}

const API_DERIVADA = apiDoEnderecoAberto();
const API_ENV = (viteEnv.VITE_SERVER_DB || '').trim();
// O .env.local manda, exceto quando aponta para OUTRA instalação conhecida
const ENV_DE_OUTRA_INSTALACAO = Boolean(API_DERIVADA && API_ENV && dominioDe(API_ENV) && dominioDe(API_ENV) !== dominioDe(API_DERIVADA));

if (ENV_DE_OUTRA_INSTALACAO) {
  console.error(
    `🚨 VITE_SERVER_DB (${API_ENV}) é de outra instalação. ` +
    `Esta página está em ${hostAtual()}, então a API usada é ${API_DERIVADA}. Corrija o .env.local deste servidor.`
  );
}

export const ENV_SERVER_DB_ORIGEM = ENV_DE_OUTRA_INSTALACAO ?
`endereço aberto (${hostAtual()}) — .env.local ignorado por apontar para outra instalação` :
API_ENV ?
'.env.local (VITE_SERVER_DB)' :
API_DERIVADA ?
`endereço aberto (${hostAtual()})` :
'padrão do código';

// ⭐ URL do servidor de banco de dados / API
export const ENV_SERVER_DB =
(ENV_DE_OUTRA_INSTALACAO ? API_DERIVADA : API_ENV) || API_DERIVADA || 'https://clinic-api.sky9.com.br';

// ⭐ Servidor que faz o BACKUP (opcional). Vazio = o mesmo da API.
//    Também nunca atravessa para outra instalação: o backup de quem está na
//    sky9 é sempre feito pela API da sky9.
const BACKUP_ENV = (viteEnv.VITE_BACKUP_API_URL || '').trim();
export const ENV_BACKUP_API_URL =
BACKUP_ENV && API_DERIVADA && dominioDe(BACKUP_ENV) && dominioDe(BACKUP_ENV) !== dominioDe(API_DERIVADA) ? '' : BACKUP_ENV;

// ⭐ URL do servidor WAHA (WhatsApp HTTP API)
export const ENV_WAHA_SERVER_URL =
viteEnv.VITE_WAHA_SERVER_URL || 'https://whatsapp2.x-star.com.br';

// ⭐ Chave da API do WAHA (WhatsApp)
export const ENV_WAHA_API_KEY = viteEnv.VITE_WAHA_API_KEY || '';

// ⭐ URL do WebSocket do aplicativo de biometria DigitalPersona (leitor LOCAL).
//    Cada clínica instala o app BiometriaDigitalPersona na MESMA máquina onde
//    roda o navegador, então o padrão é ws://localhost:5555/biometria. Como é o
//    NAVEGADOR (não o servidor central) que abre essa conexão, "localhost"
//    aponta corretamente para o leitor daquela clínica.
//    Só altere (via VITE_BIOMETRIA_WS_URL no .env.local) se o leitor estiver em
//    OUTRA máquina da mesma rede local — aí use o IP dela (ex.: ws://localhost:5555/biometria).
export const ENV_BIOMETRIA_WS_URL =
viteEnv.VITE_BIOMETRIA_WS_URL || 'ws://localhost:5555/biometria';

// ⭐ Provedor da SALA DE VÍDEO da consulta online (telemedicina).
//    ⚠️ NÃO usamos mais `meet.jit.si` como padrão: o host oficial do 8x8 CONECTA
//    normalmente, MAS quando a sala é EMBUTIDA em outro app (via external_api.js)
//    ele encerra a chamada em 5 MINUTOS e exibe o aviso "incorporação apenas para
//    demonstração". Esse limite é política do servidor do 8x8 e NÃO pode ser
//    desligado por configuração/código — inviabiliza a telemedicina embutida.
//
//    Padrão agora: `https://meet.ffmuc.net` — instância Jitsi pública e ABERTA
//    (Freifunk München) que roda o Jitsi "vanilla": SEM login, SEM cartão, SEM
//    limite de 5 minutos e SEM travar em "aguardando moderador" (o primeiro a
//    entrar vira moderador automaticamente). O paciente entra anônimo pelo mesmo
//    link enviado no WhatsApp.
//
//    Para máxima confiabilidade/privacidade em produção, a clínica pode apontar
//    para o seu PRÓPRIO servidor Jitsi (ou domínio JaaS pago) via
//    VITE_VIDEO_BASE_URL — o restante do sistema não muda.
export const ENV_VIDEO_BASE_URL =
viteEnv.VITE_VIDEO_BASE_URL || 'https://meet.ffmuc.net';

// ⭐ Provedor de vídeo da consulta online: 'jitsi' (padrão) ou 'bbb'
// (BigBlueButton — mais profissional: sala de espera, gravação, sem limite de
// tempo, hospedado no servidor da clínica). Ao usar 'bbb', o link de entrada é
// gerado/assinado pelo BACKEND (rota /api/video/bbb/join) com o BBB_SECRET —
// o segredo NUNCA fica no frontend. Configure também BBB_URL e BBB_SECRET no
// server/.env.local (ver .env.example).
export const ENV_VIDEO_PROVIDER = (
viteEnv.VITE_VIDEO_PROVIDER || 'jitsi').
toLowerCase();

// ⭐ URL pública do próprio app, usada nos links enviados ao paciente (SMS).
//    Sem definição, o link é montado com a origem do navegador em uso.
export const ENV_APP_BASE_URL = (viteEnv.VITE_APP_BASE_URL || '').replace(
  /\/+$/,
  ''
);