// ⭐ Consulta Online — utilitário de SALA DE VÍDEO (telemedicina)
//
// IMPORTANTE: o WhatsApp NÃO permite iniciar chamada de vídeo de forma
// programática (nem a API oficial da Meta, nem as integrações de sessão/QR).
// Por isso a videoconsulta acontece em uma SALA DE VÍDEO própria (WebRTC) e o
// WhatsApp é usado apenas para ENVIAR O LINK dessa sala ao paciente.
//
// ⚠️ POR QUE NÃO USAMOS MAIS meet.jit.si:
// O Jitsi público em `meet.jit.si` (8x8) CONECTA normalmente, MAS quando a sala
// é EMBUTIDA em outro app (external_api.js) ele DESLIGA a chamada em 5 MINUTOS e
// mostra "incorporação apenas para demonstração". Esse limite é política do
// servidor do 8x8 e NÃO pode ser desligado por código — inviabiliza a
// telemedicina embutida. Por isso o padrão agora é `meet.ffmuc.net`, uma
// instância Jitsi pública ABERTA (sem login, sem cartão, sem limite de 5 min e
// sem trava de "aguardando moderador").
//
// O provedor é configurável por VITE_VIDEO_BASE_URL (ver config/env.ts): a
// clínica pode apontar para o seu PRÓPRIO servidor Jitsi ou domínio pago
// (JaaS, Daily, Whereby, 100ms, etc.) sem alterar o restante do sistema.

import {
  ENV_APP_BASE_URL,
  ENV_VIDEO_BASE_URL,
  ENV_VIDEO_PROVIDER } from
'../config/env';
import { API_BASE_URL } from '../config/api';
import { urlComToken } from './autenticacaoApi';

// Remove barra final para evitar `//` ao concatenar com o nome da sala.
const VIDEO_BASE_URL = (ENV_VIDEO_BASE_URL || 'https://meet.ffmuc.net').replace(
  /\/+$/,
  ''
);
const ROOM_PREFIX = 'EasyClin';

// ⭐ Provedor de vídeo CONFIGURADO: 'jitsi' (padrão) ou 'bbb' (BigBlueButton).
// Este é apenas a PREFERÊNCIA declarada em VITE_VIDEO_PROVIDER — o provedor
// realmente usado (ver `provedorEfetivo`) só será 'bbb' se o servidor BBB
// estiver de fato configurado (com secret). Assim nunca geramos um link de BBB
// quebrado quando o secret ainda não foi definido.
export const VIDEO_PROVIDER: 'jitsi' | 'bbb' | 'livekit' =
ENV_VIDEO_PROVIDER === 'bbb' ?
'bbb' :
ENV_VIDEO_PROVIDER === 'livekit' ?
'livekit' :
'jitsi';

// ⭐ LiveKit: servidor de vídeo próprio da clínica. Diferente de Jitsi/BBB, o
// acesso não é por "link de sala" e sim por TOKEN assinado no backend com a
// API Key + Secret. O link enviado ao paciente aponta para uma página NOSSA
// (/consulta-online/...), que pede o token ao servidor e abre a sala embutida.
const LIVEKIT_CACHE_KEY = 'easyclin:livekit:configurado';

// ⚠️ O status NÃO depende de VITE_VIDEO_PROVIDER. Se o servidor tem LiveKit
// configurado (URL + API Key + Secret), ele é o provedor — ponto. Exigir também
// a variável do frontend só criava um caminho silencioso de volta ao Jitsi
// público quando o .env do build não era lido.
// ⭐ O LiveKit é o provedor PADRÃO. O Jitsi só entra em cena se o servidor
// RESPONDER explicitamente que o LiveKit não está configurado. Antes era o
// contrário (presumia Jitsi até provar o LiveKit) — e qualquer atraso de rede,
// corrida na inicialização ou rota indisponível jogava a consulta de volta no
// meet.ffmuc.net, que está fora do ar. Na dúvida, agora usamos o servidor
// próprio: é o comportamento correto e o erro, se houver, aparece escrito na
// sala em vez de abrir um host público quebrado.
type StatusLiveKit = 'desconhecido' | 'ok' | 'indisponivel';

let livekitStatus: StatusLiveKit = (() => {
  try {
    const salvo = window.localStorage.getItem(LIVEKIT_CACHE_KEY);
    if (salvo === '1') return 'ok';
    if (salvo === '0') return 'indisponivel';
  } catch {

    /* armazenamento indisponível */}
  return 'desconhecido';
})();

// Promessa da sondagem: quem for GERAR um link pode esperar por ela e assim
// nunca cai no provedor errado por causa de corrida na primeira chamada.
const livekitStatusPromise: Promise<boolean> = fetch(
  `${API_BASE_URL}/api/livekit/status`
).
then((r) => r.ok ? r.json() : null).
then((data) => {
  // Só marcamos como indisponível quando o servidor RESPONDEU dizendo isso.
  livekitStatus = data && data.configurado === false ? 'indisponivel' : 'ok';
  try {
    window.localStorage.setItem(
      LIVEKIT_CACHE_KEY,
      livekitStatus === 'ok' ? '1' : '0'
    );
  } catch {

    /* armazenamento indisponível — segue só em memória */}
  return livekitStatus === 'ok';
}).
catch(() => {
  // Falha de rede NÃO é motivo para voltar ao Jitsi público: mantemos o
  // provedor próprio e o erro de conexão fica visível na sala.
  return livekitStatus !== 'indisponivel';
});

/**
 * Aguarda a verificação do servidor de vídeo. Chame antes de gerar o link da
 * consulta para garantir que o provedor correto seja usado já na primeira vez.
 */
export function aguardarStatusLiveKit(): Promise<boolean> {
  return livekitStatusPromise;
}

/**
 * O LiveKit é usado sempre, EXCETO quando o servidor respondeu explicitamente
 * que não está configurado (sem API Key/Secret).
 */
export function livekitDisponivel(): boolean {
  return livekitStatus !== 'indisponivel';
}

/**
 * Link do paciente para a sala LiveKit: uma página pública do próprio sistema,
 * que troca a identificação da consulta por um token de acesso no backend.
 */
export function gerarLinkSalaLiveKit(params: {
  clinicaId?: string;
  consultaId?: string;
  /** Nome do paciente: vai no link para ele não precisar digitar nada. */
  nome?: string;
}): string {
  const base = (
  ENV_APP_BASE_URL || (
  typeof window !== 'undefined' ? window.location.origin : '')).
  replace(/\/+$/, '');
  const url = `${base}/consulta-online/${encodeURIComponent(
    params.clinicaId || 'clinica'
  )}/${encodeURIComponent(params.consultaId || '')}`;
  const nome = (params.nome || '').trim();
  return nome ? `${url}?nome=${encodeURIComponent(nome)}` : url;
}

// ⭐ Cache do status do BBB no servidor. Começa em `false` (assume Jitsi) e só
// vira `true` quando a sondagem a /api/video/bbb/status confirmar que o BBB tem
// URL + SECRET configurados. Enquanto não confirmar, o app gera links JITSI
// diretos — que o modal embute corretamente (external_api) e que funcionam em
// nova aba. Quando o secret for configurado no servidor, o BBB passa a ser usado
// automaticamente, sem mudar código.
let bbbConfiguradoCache = false;
let bbbProbeIniciada = false;

function sondarStatusBBB(): void {
  if (bbbProbeIniciada || VIDEO_PROVIDER !== 'bbb') return;
  bbbProbeIniciada = true;
  // Fire-and-forget: não bloqueia a UI. Em falha, mantém Jitsi (seguro).
  fetch(`${API_BASE_URL}/api/video/bbb/status`).
  then((r) => r.ok ? r.json() : null).
  then((data) => {
    bbbConfiguradoCache = !!(data && data.configurado);
  }).
  catch(() => {
    bbbConfiguradoCache = false;
  });
}
// Dispara a sondagem assim que o módulo carrega (só tem efeito se preferir BBB).
sondarStatusBBB();

/**
 * Provedor de vídeo REALMENTE usado agora: só é 'bbb' quando a preferência é BBB
 * E o servidor confirmou que o BBB está configurado. Caso contrário, 'jitsi'.
 */
export function provedorEfetivo(): 'jitsi' | 'bbb' {
  return VIDEO_PROVIDER === 'bbb' && bbbConfiguradoCache ? 'bbb' : 'jitsi';
}

/**
 * Monta a URL de entrada na sala BBB para um papel específico. O link aponta
 * para o NOSSO backend (/api/video/bbb/join), que cria a sala (idempotente) e
 * redireciona para a URL ASSINADA do BBB — o segredo fica só no servidor. Como
 * o endpoint é determinístico por (clínica + consulta), o link é ESTÁVEL e pode
 * ser reenviado ao paciente pelo WhatsApp quantas vezes for preciso.
 */
export function gerarLinkSalaBBB(params: {
  clinicaId?: string;
  consultaId?: string;
  role?: 'moderator' | 'attendee';
  nome?: string;
}): string {
  const qs = new URLSearchParams({
    clinicaId: params.clinicaId || 'default',
    consultaId: params.consultaId || '',
    role: params.role === 'moderator' ? 'moderator' : 'attendee',
    nome: params.nome || ''
  }).toString();
  const url = `${API_BASE_URL}/api/video/bbb/join?${qs}`;
  // Só o link do profissional (moderador) leva o token; o do paciente é público.
  return params.role === 'moderator' ? urlComToken(url) : url;
}

/**
 * Sanitiza um pedaço de string para compor o nome da sala (só [A-Za-z0-9-]).
 */
function slug(value: string): string {
  return (value || '').
  toString().
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '') // remove acentos
  .replace(/[^A-Za-z0-9-]/g, '') // mantém apenas caracteres seguros
  .slice(0, 40);
}

export interface GerarLinkSalaVideoParams {
  clinicaId?: string;
  consultaId?: string;
  /** Se já existir um link salvo na consulta, reutiliza (não regenera). */
  linkExistente?: string;
  /**
   * Papel do participante (relevante apenas no provedor BBB): 'moderator' para
   * o médico (entra na sala e admite o paciente) ou 'attendee' para o paciente
   * (padrão — é o link enviado por WhatsApp).
   */
  role?: 'moderator' | 'attendee';
  /** Nome exibido do participante (relevante no BBB). */
  nome?: string;
}

/**
 * Gera (ou reutiliza) a URL da sala de vídeo da consulta.
 * A sala é determinística por (clínica + consulta), garantindo que médico e
 * paciente entrem exatamente na mesma sala.
 *
 * No provedor BBB, o link aponta para o backend (que assina a entrada); o papel
 * (médico = moderador, paciente = attendee) é definido por `role`.
 */
export function gerarLinkSalaVideo({
  clinicaId,
  consultaId,
  linkExistente,
  role,
  nome
}: GerarLinkSalaVideoParams): string {
  // ⭐ Provedor BBB (SÓ quando o servidor confirmou que o BBB está configurado):
  // o link é o endpoint determinístico do backend, que assina a entrada. Se o
  // BBB não estiver configurado ainda, caímos no Jitsi direto abaixo — que o
  // modal embute corretamente e que funciona em nova aba.
  // ⭐ LiveKit (servidor próprio): o link é a página pública do sistema, que
  // pede o token assinado ao backend. Só é usado quando o servidor confirmou
  // que há URL + API Key + Secret configurados.
  if (livekitDisponivel()) {
    return gerarLinkSalaLiveKit({
      clinicaId,
      consultaId,
      // No link do PACIENTE o nome já vai embutido, para ele entrar direto.
      nome: role === 'attendee' ? nome : undefined
    });
  }
  if (provedorEfetivo() === 'bbb') {
    return gerarLinkSalaBBB({ clinicaId, consultaId, role, nome });
  }
  // Nome de sala determinístico por (clínica + consulta) no host ATUAL.
  const partes = [
  ROOM_PREFIX,
  slug(clinicaId || 'clinica'),
  slug(consultaId || '')].

  filter(Boolean).
  join('-');
  const room = consultaId ?
  partes :
  `${partes}-${Math.random().toString(36).slice(2, 8)}`;
  const linkAtual = `${VIDEO_BASE_URL}/${room}`;

  // Reutiliza o link salvo SOMENTE se ele já estiver no host ATUAL. Consultas
  // antigas podem ter um link de um host anterior (ex.: meet.ffmuc.net,
  // meet.systemli.org) que parou de conectar. Nesses casos MIGRAMOS para o host
  // atual mantendo o MESMO nome de sala, para que médico e paciente continuem
  // entrando na mesma sala.
  if (linkExistente && linkExistente.trim()) {
    const existente = linkExistente.trim();
    try {
      const hostExistente = new URL(existente).host;
      const hostAtual = new URL(VIDEO_BASE_URL).host;
      if (hostExistente === hostAtual) {
        return existente;
      }
    } catch {

      // Link salvo inválido → ignora e usa o link atual.
    }}
  return linkAtual;
}

export interface MensagemConsultaOnlineParams {
  pacienteNome: string;
  profissional?: string;
  data?: string;
  horario?: string;
  link: string;
  clinicaNome?: string;
}

/**
 * Monta a mensagem (pt-BR) enviada ao paciente por WhatsApp com o link da sala.
 */
/**
 * Formata a data da consulta em pt-BR de forma ROBUSTA, sem nunca produzir
 * "Invalid Date". Aceita:
 *  - 'aaaa-mm-dd' (formato do banco)
 *  - ISO completo ('aaaa-mm-ddThh:mm:ss...')
 *  - já formatada 'dd/mm/aaaa' (retorna como está)
 * Se não for possível interpretar, retorna string vazia (a linha da data é omitida).
 */
function formatarDataConsulta(data?: string): string {
  if (!data) return '';
  const bruto = data.trim();
  if (!bruto) return '';
  // Já está no formato brasileiro dd/mm/aaaa → usa direto.
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(bruto)) return bruto;
  // Data pura aaaa-mm-dd → fixa meio-dia para evitar deslocamento de fuso.
  const dataPura = /^\d{4}-\d{2}-\d{2}$/.test(bruto) ?
  `${bruto}T12:00:00` :
  bruto;
  const d = new Date(dataPura);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

/** Data da consulta em pt-BR (usada também pela mensagem de SMS). */
export function formatarDataConsultaSimples(data?: string): string {
  return formatarDataConsulta(data);
}

export function montarMensagemConsultaOnline({
  pacienteNome,
  profissional,
  data,
  horario,
  link,
  clinicaNome
}: MensagemConsultaOnlineParams): string {
  const dataFmt = formatarDataConsulta(data);
  const linhas: string[] = [];
  linhas.push('🎥 *Consulta Online*');
  if (clinicaNome) linhas.push(clinicaNome);
  linhas.push('');
  if (pacienteNome) linhas.push(`Olá, ${pacienteNome}!`);
  linhas.push(
    'Sua consulta será por vídeo. Para entrar, toque no link abaixo no horário combinado:'
  );
  linhas.push('');
  linhas.push(link);
  linhas.push('');
  const detalhe = [
  profissional ? `👨‍⚕️ Profissional: ${profissional}` : '',
  dataFmt ? `📅 Data: ${dataFmt}` : '',
  horario ? `🕐 Horário: ${horario}` : ''].
  filter(Boolean);
  if (detalhe.length) {
    linhas.push(...detalhe);
    linhas.push('');
  }
  linhas.push(
    '_Dica: use um navegador atualizado e permita o acesso à câmera e ao microfone._'
  );
  return linhas.join('\n');
}