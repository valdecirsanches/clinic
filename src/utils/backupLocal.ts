// ==================== BACKUP GRAVADO NA MÁQUINA DO CLIENTE ====================
// O navegador grava direto numa pasta escolhida pelo usuário (File System
// Access API — Chrome e Edge no computador). A pasta fica lembrada
// (IndexedDB); a configuração, no localStorage por clínica.
//
// Limite: um backup por dia por clínica — conferido aqui E no servidor.

import { BACKUP_API_URL } from '../config/api';
import { urlComToken } from './autenticacaoApi';

// ─── Tipos mínimos da File System Access API (ainda fora do lib.dom) ─────────
type Permissao = 'granted' | 'denied' | 'prompt';
interface Gravador extends WritableStream<Uint8Array> {
  write(dados: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
interface ArquivoHandle {
  createWritable(): Promise<Gravador>;
}
export interface PastaHandle {
  name: string;
  queryPermission(o: {mode: 'readwrite';}): Promise<Permissao>;
  requestPermission(o: {mode: 'readwrite';}): Promise<Permissao>;
  getFileHandle(nome: string, o?: {create?: boolean;}): Promise<ArquivoHandle>;
  removeEntry(nome: string): Promise<void>;
  values(): AsyncIterable<{kind: 'file' | 'directory';name: string;}>;
}

export interface ConfigBackupLocal {
  ativo: boolean;
  horario: string;
  manter: number;
  ultimo?: {data: string;em: string;arquivo: string;tamanho: number;} | null;
  ultimoErro?: {em: string;mensagem: string;oQueFazer?: string;} | null;
  /** Data em que o servidor informou que o backup do dia já foi feito em outro computador */
  feitoEmOutroLugar?: string | null;
}

export const CONFIG_BACKUP_LOCAL_PADRAO: ConfigBackupLocal = {
  ativo: false,
  horario: '12:30',
  manter: 7,
  ultimo: null,
  ultimoErro: null
};

export const EVENTO_BACKUP_LOCAL = 'easyclin:backup-local';

export function suportaBackupLocal(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─── Configuração ───────────────────────────────────────────────────────────
const chaveConfig = (clinicaId: string) => `backupLocal:${clinicaId}`;

export function lerConfigBackupLocal(clinicaId: string): ConfigBackupLocal {
  try {
    const bruto = localStorage.getItem(chaveConfig(clinicaId));
    return { ...CONFIG_BACKUP_LOCAL_PADRAO, ...(bruto ? JSON.parse(bruto) : {}) };
  } catch {
    return { ...CONFIG_BACKUP_LOCAL_PADRAO };
  }
}

export function salvarConfigBackupLocal(clinicaId: string, config: ConfigBackupLocal): void {
  localStorage.setItem(chaveConfig(clinicaId), JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENTO_BACKUP_LOCAL, { detail: { clinicaId } }));
}

/** Está na hora e ainda não houve backup hoje? */
export function backupDevido(config: ConfigBackupLocal, agora = new Date()): boolean {
  if (!config.ativo) return false;
  if (config.ultimo?.data === hojeLocal()) return false;
  if (config.feitoEmOutroLugar === hojeLocal()) return false;
  const [h, m] = config.horario.split(':').map(Number);
  return agora.getHours() * 60 + agora.getMinutes() >= h * 60 + m;
}

// ─── Pasta lembrada (IndexedDB) ─────────────────────────────────────────────
function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('easyclin-backup', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('pastas');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function lerPastaBackup(clinicaId: string): Promise<PastaHandle | null> {
  try {
    const banco = await abrirBanco();
    return await new Promise((resolve) => {
      const req = banco.transaction('pastas').objectStore('pastas').get(clinicaId);
      req.onsuccess = () => resolve(req.result as PastaHandle || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function guardarPastaBackup(clinicaId: string, pasta: PastaHandle): Promise<void> {
  const banco = await abrirBanco();
  await new Promise<void>((resolve, reject) => {
    const tx = banco.transaction('pastas', 'readwrite');
    tx.objectStore('pastas').put(pasta, clinicaId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function escolherPastaBackup(): Promise<PastaHandle> {
  const seletor = (window as unknown as {
    showDirectoryPicker: (o: {id: string;mode: 'readwrite';}) => Promise<PastaHandle>;
  }).showDirectoryPicker;
  return seletor({ id: 'easyclin-backup', mode: 'readwrite' });
}

// ─── Execução ───────────────────────────────────────────────────────────────
let emExecucao = false;
export const backupLocalEmExecucao = () => emExecucao;

/** Em que passo o backup está — mostrado ao usuário */
export type EtapaBackup = 'preparando' | 'baixando' | 'finalizando';

/**
 * Falha explicada em duas partes: o que aconteceu e o que fazer.
 * `podeTentar` = um novo clique tem chance de resolver.
 */
export class ErroBackup extends Error {
  constructor(
  public titulo: string,
  public oQueFazer: string,
  public podeTentar = true,
  public limiteDiario = false)
  {
    super(titulo);
  }
}

const ESPERA_STATUS_MS = 2000;
/** Consulta de andamento que não responde neste tempo é refeita */
const TIMEOUT_STATUS_MS = 20000;
/** Falhas seguidas de rede/servidor toleradas durante a espera */
const FALHAS_TOLERADAS = 6;
/** Sem nenhum sinal novo do servidor por este tempo = travou */
const SEM_SINAL_MS = 7 * 60 * 1000;

/** Andamento da geração no servidor, mostrado na tela */
export interface AndamentoBackup {
  tabela: string;
  tabelaAtual: number;
  tabelasTotal: number;
  linhas: number;
  bytesLidos: number;
  bytesEstimados: number;
  /** 0–100, estimado pelo tamanho do banco */
  percentual: number | null;
}

function urlBackup(rota: string, clinicaId: string, usuarioId: string) {
  return urlComToken(`${BACKUP_API_URL}/api/backup-cliente/${rota}?clinicaId=${encodeURIComponent(clinicaId)}&usuarioId=${encodeURIComponent(usuarioId)}`);
}

async function chamar(url: string, timeoutMs?: number): Promise<Response> {
  const controle = timeoutMs ? new AbortController() : null;
  const timer = controle ? window.setTimeout(() => controle.abort(), timeoutMs) : 0;
  try {
    return await fetch(url, { cache: 'no-store', signal: controle?.signal });
  } catch {
    throw new ErroBackup(
      'Não foi possível falar com o servidor.',
      'Confira a internet deste computador e tente de novo. Se o sistema também parou de responder, o servidor pode estar fora do ar.'
    );
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function lerAndamento(p: Record<string, number | string> | null | undefined): AndamentoBackup | null {
  if (!p) return null;
  const bytesLidos = Number(p.bytesLidos) || 0;
  const bytesEstimados = Number(p.bytesEstimados) || 0;
  const porTabela = Number(p.tabelasTotal) ? (Number(p.tabelaAtual) - 1) / Number(p.tabelasTotal) * 100 : null;
  const porBytes = bytesEstimados ? bytesLidos / bytesEstimados * 100 : null;
  const percentual = porBytes ?? porTabela;
  return {
    tabela: String(p.tabela || ''),
    tabelaAtual: Number(p.tabelaAtual) || 0,
    tabelasTotal: Number(p.tabelasTotal) || 0,
    linhas: Number(p.linhas) || 0,
    bytesLidos,
    bytesEstimados,
    percentual: percentual === null ? null : Math.max(1, Math.min(99, Math.round(percentual)))
  };
}

/** Converte uma resposta de erro do servidor em mensagem clara */
async function erroDaResposta(resposta: Response): Promise<ErroBackup> {
  const dados = await resposta.json().catch(() => null);
  const texto = dados?.error as string | undefined;
  if (dados?.codigo === 'ROTA_NAO_CARREGADA' || dados?.codigo === 'ERRO_INTERNO') {
    return new ErroBackup(texto || 'O servidor não conseguiu fazer o backup.', 'Envie esta mensagem ao suporte: ela diz exatamente o que precisa ser corrigido no servidor.');
  }
  if (resposta.status === 429) {
    return new ErroBackup(texto || 'O backup de hoje já foi feito.', 'O limite é de um backup por dia. O próximo pode ser feito amanhã.', false, true);
  }
  if (resposta.status === 400 || resposta.status === 403) {
    return new ErroBackup(texto || 'Você não tem permissão para fazer o backup desta clínica.', 'Entre com um usuário administrador desta clínica.', false);
  }
  if (resposta.status === 404 || resposta.status === 410) {
    let servidor = 'da API';
    try {
      servidor = new URL(resposta.url).host;
    } catch {

      // mantém genérico
    }return new ErroBackup(
      texto || `O servidor ${servidor} não tem o serviço de backup.`,
      resposta.status === 410 ?
      'Recarregue a página (F5).' :
      `O backend em ${servidor} está rodando uma versão antiga, sem o backup. Publique a versão nova NESSE servidor e reinicie o backend (ex.: pm2 restart).`
    );
  }
  if (resposta.status === 502 || resposta.status === 503 || resposta.status === 504) {
    return new ErroBackup('O servidor demorou para responder.', 'Tente de novo em alguns minutos.');
  }
  return new ErroBackup(texto || `O servidor recusou o backup (erro ${resposta.status}).`, 'Tente de novo. Se continuar, avise o suporte com esta mensagem.');
}

/** Erros da pasta do computador (File System Access API) */
function erroDaPasta(err: unknown): ErroBackup | null {
  if (!(err instanceof DOMException)) return null;
  if (err.name === 'NotFoundError') {
    return new ErroBackup('A pasta escolhida não existe mais neste computador.', 'Ela pode ter sido movida, renomeada ou o disco removido. Clique em "Trocar pasta" e escolha de novo.');
  }
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
    return new ErroBackup('O navegador não autorizou gravar na pasta.', 'Clique em "Fazer backup agora" e, quando o navegador perguntar, escolha "Permitir".');
  }
  if (err.name === 'QuotaExceededError') {
    return new ErroBackup('Não há espaço livre suficiente no disco da pasta escolhida.', 'Libere espaço ou escolha outra pasta (um disco externo, por exemplo).');
  }
  if (err.name === 'NoModificationAllowedError' || err.name === 'InvalidStateError') {
    return new ErroBackup('A pasta escolhida não aceita gravação.', 'Ela pode estar protegida ou em uso. Escolha outra pasta.');
  }
  return null;
}

const pausa = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Pede ao servidor para gerar e espera ficar pronto */
async function aguardarPreparo(
clinicaId: string,
usuarioId: string,
onAndamento?: (a: AndamentoBackup | null) => void,
cancelado?: () => boolean)
: Promise<void> {
  const pedir = async () => {
    const resposta = await chamar(urlBackup('preparar', clinicaId, usuarioId), TIMEOUT_STATUS_MS);
    if (!resposta.ok) throw await erroDaResposta(resposta);
  };
  await pedir();
  let falhas = 0;
  let semRegistro = 0;
  // Se o servidor reiniciar no meio, o backup recomeça sozinho UMA vez
  let recomecou = false;
  let ultimoSinal = '';
  let ultimoSinalEm = Date.now();
  for (;;) {
    if (cancelado?.()) throw new ErroBackup('Backup cancelado.', 'Clique em "Fazer backup agora" quando quiser tentar de novo.');
    let trabalho: {
      estado?: string;
      erro?: string;
      codigo?: string | null;
      atualizadoEm?: string;
      progresso?: Record<string, number | string> | null;
    } | null = null;
    try {
      const r = await chamar(urlBackup('status', clinicaId, usuarioId), TIMEOUT_STATUS_MS);
      if (r.status >= 500) throw new ErroBackup('O servidor demorou para responder.', 'Tente de novo em alguns minutos.');
      if (!r.ok) throw await erroDaResposta(r);
      trabalho = (await r.json()).trabalho;
      falhas = 0;
    } catch (err) {
      // Um tropeço de rede não derruba um backup que está andando no servidor
      const transitorio = err instanceof ErroBackup && err.podeTentar && !err.limiteDiario;
      falhas += 1;
      if (!transitorio || falhas > FALHAS_TOLERADAS) throw err;
      await pausa(ESPERA_STATUS_MS * 2);
      continue;
    }
    if (trabalho?.estado === 'pronto') return;
    const reiniciou = trabalho?.estado === 'erro' && trabalho.codigo === 'SERVIDOR_REINICIADO';
    if ((reiniciou || !trabalho && semRegistro >= 3) && !recomecou) {
      // Recomeça sem obrigar o usuário a clicar de novo
      recomecou = true;
      semRegistro = 0;
      onAndamento?.(null);
      await pedir();
      ultimoSinal = '';
      ultimoSinalEm = Date.now();
      await pausa(ESPERA_STATUS_MS);
      continue;
    }
    if (trabalho?.estado === 'erro') {
      throw new ErroBackup(
        trabalho.erro || 'O servidor não conseguiu gerar o backup.',
        reiniciou ?
        'O backup já foi recomeçado uma vez automaticamente e o servidor reiniciou de novo. Envie esta mensagem ao suporte: o motivo do reinício está nela.' :
        'Tente de novo. Se continuar, avise o suporte com esta mensagem.'
      );
    }
    if (!trabalho) {
      // Pode ser só o registro ainda não visível neste processo do servidor
      semRegistro += 1;
      if (semRegistro < 3 || !recomecou) {
        await pausa(ESPERA_STATUS_MS);
        continue;
      }
      throw new ErroBackup(
        'O servidor perdeu o registro do backup em andamento, mesmo depois de recomeçar.',
        'Avise o suporte: o servidor pode estar reiniciando sozinho ou rodando em mais de uma instalação ao mesmo tempo.'
      );
    }
    semRegistro = 0;
    onAndamento?.(lerAndamento(trabalho.progresso));
    const sinal = `${trabalho.atualizadoEm}|${JSON.stringify(trabalho.progresso)}`;
    if (sinal !== ultimoSinal) {
      ultimoSinal = sinal;
      ultimoSinalEm = Date.now();
    } else if (Date.now() - ultimoSinalEm > SEM_SINAL_MS) {
      throw new ErroBackup('O servidor parou de responder sobre o andamento do backup.', 'Tente de novo. Se repetir, avise o suporte.');
    }
    await pausa(ESPERA_STATUS_MS);
  }
}

/**
 * Gera o backup no servidor, baixa e grava na pasta. Precisa de permissão
 * "granted" na pasta (pedida antes, num clique do usuário).
 * Lança sempre `ErroBackup`, com o que aconteceu e o que fazer.
 */
export async function executarBackupLocal(params: {
  clinicaId: string;
  usuarioId: string;
  pasta: PastaHandle;
  onEtapa?: (etapa: EtapaBackup) => void;
  onProgresso?: (recebido: number, total: number | null) => void;
  onAndamento?: (a: AndamentoBackup | null) => void;
  cancelado?: () => boolean;
}): Promise<{arquivo: string;tamanho: number;}> {
  const { clinicaId, usuarioId, pasta, onEtapa, onProgresso, onAndamento, cancelado } = params;
  if (emExecucao) throw new ErroBackup('Já há um backup em andamento.', 'Aguarde ele terminar.', false);
  emExecucao = true;
  const config = lerConfigBackupLocal(clinicaId);
  let nomeArquivo = '';
  try {
    if ((await pasta.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new ErroBackup('O navegador ainda não autorizou gravar na pasta.', 'Clique em "Fazer backup agora" e escolha "Permitir".');
    }

    onEtapa?.('preparando');
    await aguardarPreparo(clinicaId, usuarioId, onAndamento, cancelado);

    onEtapa?.('baixando');
    const resposta = await chamar(urlBackup('baixar', clinicaId, usuarioId));
    if (!resposta.ok || !resposta.body) throw await erroDaResposta(resposta);
    nomeArquivo = resposta.headers.get('X-Backup-Arquivo') || `backup_${clinicaId}_${hojeLocal()}.sql.gz`;
    const total = Number(resposta.headers.get('Content-Length')) || null;

    const gravador = await (await pasta.getFileHandle(nomeArquivo, { create: true })).createWritable();
    const leitor = resposta.body.getReader();
    let recebido = 0;
    try {
      for (;;) {
        let parte: ReadableStreamReadResult<Uint8Array>;
        try {
          parte = await leitor.read();
        } catch {
          throw new ErroBackup('A conexão caiu durante o download.', 'Tente de novo: o arquivo continua pronto no servidor, não será gerado outra vez.');
        }
        if (parte.done) break;
        await gravador.write(parte.value);
        recebido += parte.value.byteLength;
        onProgresso?.(recebido, total);
      }
      if (total && recebido < total) {
        throw new ErroBackup('O download foi interrompido antes do fim.', 'Tente de novo: o arquivo continua pronto no servidor.');
      }
      onEtapa?.('finalizando');
      await gravador.close();
    } catch (err) {
      await gravador.abort().catch(() => undefined);
      await pasta.removeEntry(nomeArquivo).catch(() => undefined);
      throw err;
    }

    await aplicarRetencao(pasta, config.manter).catch(() => undefined);
    salvarConfigBackupLocal(clinicaId, {
      ...lerConfigBackupLocal(clinicaId),
      ultimo: { data: hojeLocal(), em: new Date().toISOString(), arquivo: nomeArquivo, tamanho: recebido },
      ultimoErro: null
    });
    return { arquivo: nomeArquivo, tamanho: recebido };
  } catch (err) {
    const erro =
    err instanceof ErroBackup ?
    err :
    erroDaPasta(err) ||
    new ErroBackup(err instanceof Error ? err.message : String(err), 'Tente de novo. Se continuar, avise o suporte com esta mensagem.');
    // Limite diário não é falha: é o backup de hoje já feito (outro computador
    // ou aba). Só anota a data para o automático não insistir até amanhã.
    // Cancelado pelo usuário também não é registrado como erro.
    if (cancelado?.()) {

      // nada a registrar
    } else if (erro.limiteDiario) {salvarConfigBackupLocal(clinicaId, { ...lerConfigBackupLocal(clinicaId), feitoEmOutroLugar: hojeLocal() });
    } else {
      salvarConfigBackupLocal(clinicaId, {
        ...lerConfigBackupLocal(clinicaId),
        ultimoErro: { em: new Date().toISOString(), mensagem: erro.titulo, oQueFazer: erro.oQueFazer }
      });
    }
    throw erro;
  } finally {
    emExecucao = false;
  }
}

/** Mantém só os N backups mais recentes desta pasta */
async function aplicarRetencao(pasta: PastaHandle, manter: number): Promise<void> {
  const nomes: string[] = [];
  for await (const entrada of pasta.values()) {
    if (entrada.kind === 'file' && /^backup_.+\.sql\.gz$/.test(entrada.name)) nomes.push(entrada.name);
  }
  nomes.sort().reverse(); // o nome termina com data/hora: ordem = cronologia
  for (const antigo of nomes.slice(Math.max(1, manter))) {
    await pasta.removeEntry(antigo).catch(() => undefined);
  }
}

export function formatarTamanho(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}