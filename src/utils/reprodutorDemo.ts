import type { CenaDemo } from '../data/demoRoteiro';
import type { CursorDemo } from './cursorDemo';

/**
 * Toca o roteiro do vídeo de demonstração: navega o sistema cena a cena,
 * toca a narração e a música de fundo, e respeita a duração mínima.
 * Usado igualmente na pré-visualização e na gravação — o que se vê na
 * pré-visualização é exatamente o que vai para o vídeo.
 */
export interface OpcoesReprodutor {
  cenas: CenaDemo[];
  /** id da cena → URL do áudio da narração */
  audios: Record<string, string>;
  musica: {url: string;volume: number;} | null;
  volumeNarracao: number;
  /** Abaixa a música enquanto a voz fala */
  abaixarNaFala?: boolean;
  /** Música entra e sai suavemente (fade) */
  suavizar?: boolean;
  navegar: (pagina: string) => void;
  onCena: (indice: number) => void;
  /** Tempo decorrido da cena atual (s), para a barra de progresso */
  onTempo?: (segundos: number) => void;
  /** Saída extra de áudio (a gravação) */
  destino?: AudioNode;
  contexto?: AudioContext;
  /** Mouse simulado: clica no menu antes de cada troca e passeia pela tela */
  cursor?: CursorDemo;
}

/** Pausa entre a troca de tela e o início da fala, para a tela carregar */
export const PAUSA_TROCA_MS = 700;

export function duracaoCena(cena: CenaDemo, duracaoAudio = 0): number {
  return Math.max(cena.duracaoMin, duracaoAudio + PAUSA_TROCA_MS / 1000 + 0.6);
}

export class ReprodutorDemo {
  private contexto: AudioContext;
  private proprioContexto: boolean;
  private rodada = 0;
  private pausado = false;
  private fala: HTMLAudioElement | null = null;
  private fundo: HTMLAudioElement | null = null;
  private ganhoFala: GainNode | null = null;
  private ganhoFundo: GainNode | null = null;
  private falando = false;

  constructor(private o: OpcoesReprodutor) {
    this.contexto = o.contexto ?? new AudioContext();
    this.proprioContexto = !o.contexto;
  }

  get estaPausado() {
    return this.pausado;
  }

  /** Volume que a música deve ter agora (abaixa durante a fala) */
  private alvoFundo() {
    const v = this.o.musica?.volume ?? 0;
    return this.falando && this.o.abaixarNaFala ? v * 0.35 : v;
  }

  private rampaFundo(alvo: number, segundos = 0.25) {
    const g = this.ganhoFundo?.gain;
    if (!g) return;
    const agora = this.contexto.currentTime;
    g.cancelScheduledValues(agora);
    g.setValueAtTime(g.value, agora);
    g.linearRampToValueAtTime(alvo, agora + segundos);
  }

  /** Ajusta volumes durante a reprodução (controles de áudio) */
  ajustar(v: {volumeMusica?: number;volumeNarracao?: number;abaixarNaFala?: boolean;}) {
    if (v.volumeMusica !== undefined && this.o.musica) this.o.musica = { ...this.o.musica, volume: v.volumeMusica };
    if (v.volumeNarracao !== undefined) {
      this.o.volumeNarracao = v.volumeNarracao;
      if (this.ganhoFala) this.ganhoFala.gain.value = v.volumeNarracao;
    }
    if (v.abaixarNaFala !== undefined) this.o.abaixarNaFala = v.abaixarNaFala;
    this.rampaFundo(this.alvoFundo(), 0.15);
  }

  private tocar(url: string, volume: number): {el: HTMLAudioElement;ganho: GainNode;} {
    const el = new Audio(url);
    el.crossOrigin = 'anonymous';
    const fonte = this.contexto.createMediaElementSource(el);
    const ganho = this.contexto.createGain();
    ganho.gain.value = volume;
    fonte.connect(ganho);
    ganho.connect(this.contexto.destination);
    if (this.o.destino) ganho.connect(this.o.destino);
    return { el, ganho };
  }

  /** Espera `ms` sem contar o tempo em pausa. false = interrompido */
  private esperar(ms: number, ativo: () => boolean, aoPassar?: (decorrido: number) => void): Promise<boolean> {
    return new Promise((resolve) => {
      let decorrido = 0;
      let anterior = performance.now();
      const t = window.setInterval(() => {
        const agora = performance.now();
        if (!this.pausado) decorrido += agora - anterior;
        anterior = agora;
        aoPassar?.(decorrido);
        if (!ativo()) {
          window.clearInterval(t);
          resolve(false);
        } else if (decorrido >= ms) {
          window.clearInterval(t);
          resolve(true);
        }
      }, 100);
    });
  }

  /**
   * Toca a partir da cena `inicio`. Resolve true se chegou ao fim,
   * false se foi interrompido (parar ou pular para outra cena).
   */
  async executar(inicio = 0): Promise<boolean> {
    this.interromperAudio();
    const minha = ++this.rodada;
    this.pausado = false;
    const ativo = () => this.rodada === minha;
    if (this.contexto.state === 'suspended') await this.contexto.resume().catch(() => undefined);

    const { cenas, audios, musica } = this.o;
    this.falando = false;
    if (musica) {
      const comecoDoVideo = inicio === 0 && this.o.suavizar;
      const { el, ganho } = this.tocar(musica.url, comecoDoVideo ? 0 : musica.volume);
      this.fundo = el;
      this.ganhoFundo = ganho;
      el.loop = true;
      el.play().catch(() => undefined);
      if (comecoDoVideo) this.rampaFundo(this.alvoFundo(), 2);
    }

    for (let i = inicio; i < cenas.length; i += 1) {
      if (!ativo()) return false;
      const cena = cenas[i];
      this.o.onCena(i);
      this.o.onTempo?.(0);
      if (this.o.cursor) {
        await this.o.cursor.irParaMenu(cena.pagina, Boolean(cena.capa));
        if (!ativo()) return false;
      }
      this.o.navegar(cena.pagina);
      void this.o.cursor?.trabalhar(cena.pagina, Boolean(cena.capa));
      const relogio = performance.now();
      let pausadoMs = 0;
      const marcarTempo = () => this.o.onTempo?.((performance.now() - relogio - pausadoMs) / 1000);

      if (!(await this.esperar(PAUSA_TROCA_MS, ativo, (d) => this.o.onTempo?.(d / 1000)))) return false;

      let decorridoFala = 0;
      if (audios[cena.id]) {
        const { el: fala, ganho } = this.tocar(audios[cena.id], this.o.volumeNarracao);
        this.fala = fala;
        this.ganhoFala = ganho;
        this.falando = true;
        this.rampaFundo(this.alvoFundo());
        const terminou = await new Promise<boolean>((resolve) => {
          let ultimo = performance.now();
          const vigia = window.setInterval(() => {
            const agora = performance.now();
            if (this.pausado) pausadoMs += agora - ultimo;
            ultimo = agora;
            marcarTempo();
            if (!ativo()) {
              window.clearInterval(vigia);
              fala.pause();
              resolve(false);
            }
          }, 100);
          const fim = () => {
            window.clearInterval(vigia);
            resolve(true);
          };
          fala.onended = fim;
          fala.onerror = fim;
          fala.play().catch(fim);
        });
        this.falando = false;
        if (!terminou) return false;
        this.rampaFundo(this.alvoFundo(), 0.6);
        decorridoFala = fala.duration && Number.isFinite(fala.duration) ? fala.duration * 1000 : 0;
        this.fala = null;
        this.ganhoFala = null;
      }
      const restante = cena.duracaoMin * 1000 - PAUSA_TROCA_MS - decorridoFala;
      const base = PAUSA_TROCA_MS + decorridoFala;
      if (!(await this.esperar(Math.max(restante, 600), ativo, (d) => this.o.onTempo?.((base + d) / 1000)))) return false;
    }

    if (!ativo()) return false;
    // Saída suave da música no fim do vídeo
    if (this.fundo && this.o.suavizar) {
      this.rampaFundo(0, 1.5);
      if (!(await this.esperar(1500, ativo))) return false;
    }
    this.interromperAudio();
    this.o.cursor?.parar();
    return true;
  }

  pausar() {
    this.pausado = true;
    this.o.cursor?.pausar();
    this.fala?.pause();
    this.fundo?.pause();
  }

  retomar() {
    this.pausado = false;
    this.o.cursor?.retomar();
    if (this.contexto.state === 'suspended') this.contexto.resume().catch(() => undefined);
    this.fala?.play().catch(() => undefined);
    this.fundo?.play().catch(() => undefined);
  }

  /** Interrompe a execução atual (a promessa de executar resolve false) */
  parar() {
    this.rodada += 1;
    this.pausado = false;
    this.o.cursor?.parar();
    this.interromperAudio();
  }

  fechar() {
    this.parar();
    if (this.proprioContexto) this.contexto.close().catch(() => undefined);
  }

  private interromperAudio() {
    this.fala?.pause();
    this.fundo?.pause();
    this.fala = null;
    this.fundo = null;
    this.ganhoFala = null;
    this.ganhoFundo = null;
    this.falando = false;
  }
}