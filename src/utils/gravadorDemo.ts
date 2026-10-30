/**
 * Grava a apresentação com áudio mixado. Dois modos:
 *  • "aba": getDisplayMedia na própria aba, recortando o palco num canvas —
 *    fiel ao que aparece na tela. Exige https e navegador de computador.
 *  • "compativel": sem captura de tela. O sistema desenha cada quadro do
 *    palco (html2canvas) num canvas, com capa e legenda. Funciona onde a
 *    captura de tela não está disponível (http, moldura, política do servidor).
 */
import type { CenaDemo } from '../data/demoRoteiro';
import { DURACAO_CLIQUE_MS, posicaoCursor } from './cursorDemo';

/** Mouse simulado no modo compatível (o mesmo desenho da camada do palco) */
function desenharCursor(ctx: CanvasRenderingContext2D, k: number) {
  const p = posicaoCursor;
  if (!p.visivel) return;
  const x = p.x * k;
  const y = p.y * k;
  const t = (performance.now() - p.cliqueEm) / DURACAO_CLIQUE_MS;
  if (t >= 0 && t < 1) {
    ctx.save();
    ctx.globalAlpha = 0.55 * (1 - t);
    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(x, y, 22 * (0.4 + t) * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (p.toque) {
    ctx.fillStyle = 'rgba(17, 24, 39, 0.3)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(x, y, 14 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    const seta = new Path2D('M1 1 L1 23 L6.5 18 L10.5 27.5 L14 26 L10 16.8 L17.5 16.8 Z');
    ctx.fillStyle = '#111827';
    ctx.fill(seta);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke(seta);
  }
  ctx.restore();
}

export interface Gravador {
  contexto: AudioContext;
  destinoAudio: MediaStreamAudioDestinationNode;
  parar: () => Promise<Blob>;
  cancelar: () => void;
  extensao: 'mp4' | 'webm';
}

export type ModoGravacao = 'aba' | 'compativel';

/** Formato que este navegador consegue gravar (MP4 quando disponível) */
export function escolherFormato(): {mime: string;extensao: 'mp4' | 'webm';} {
  const opcoes: {mime: string;extensao: 'mp4' | 'webm';}[] = [
  { mime: 'video/mp4;codecs=avc1,mp4a.40.2', extensao: 'mp4' },
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extensao: 'mp4' },
  { mime: 'video/mp4;codecs=avc1', extensao: 'mp4' },
  { mime: 'video/mp4', extensao: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', extensao: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', extensao: 'webm' },
  { mime: 'video/webm', extensao: 'webm' }];

  const suportado = typeof MediaRecorder !== 'undefined' && opcoes.find((o) => MediaRecorder.isTypeSupported(o.mime));
  // Nenhum confirmado: deixa o navegador escolher (vira WebM no Chrome)
  return suportado || { mime: '', extensao: 'webm' };
}

/** Qual modo de gravação este navegador permite, e por quê */
export function diagnosticarGravacao(): {modo: ModoGravacao;motivo?: string;} {
  if (!window.isSecureContext) {
    return {
      modo: 'compativel',
      motivo: `a página está aberta em ${window.location.protocol}// e o navegador só libera a captura de tela em https://.`
    };
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { modo: 'compativel', motivo: 'este navegador não oferece captura de tela (comum em celular e tablet).' };
  }
  return { modo: 'aba' };
}

function criarGravador(canvas: HTMLCanvasElement, contexto: AudioContext, aoEncerrar: () => void): Gravador {
  const destinoAudio = contexto.createMediaStreamDestination();
  const fluxo = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...destinoAudio.stream.getAudioTracks()]);
  const formato = escolherFormato();
  const gravador = new MediaRecorder(
    fluxo,
    formato.mime ? { mimeType: formato.mime, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 }
  );
  const tipo = (formato.mime || gravador.mimeType || 'video/webm').split(';')[0];
  const extensao: 'mp4' | 'webm' = tipo.includes('mp4') ? 'mp4' : 'webm';
  const partes: Blob[] = [];
  gravador.ondataavailable = (ev) => ev.data.size && partes.push(ev.data);
  gravador.start(1000);

  const encerrar = () => {
    aoEncerrar();
    fluxo.getTracks().forEach((t) => t.stop());
  };

  return {
    contexto,
    destinoAudio,
    extensao,
    parar: () =>
    new Promise<Blob>((resolve) => {
      gravador.onstop = () => {
        encerrar();
        resolve(new Blob(partes, { type: tipo }));
      };
      if (gravador.state !== 'inactive') gravador.stop();else
      gravador.onstop(new Event('stop'));
    }),
    cancelar: () => {
      if (gravador.state !== 'inactive') gravador.stop();
      encerrar();
    }
  };
}

/** Modo "aba": captura a própria aba e recorta o palco */
export async function iniciarGravacao(palco: HTMLElement, contexto: AudioContext): Promise<Gravador> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Este navegador não grava a tela.');
  }
  const captura = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30, displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include'
  } as DisplayMediaStreamOptions);

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = captura;
  await video.play();

  const rect = palco.getBoundingClientRect();
  const escala = video.videoWidth / window.innerWidth || window.devicePixelRatio || 1;
  const largura = Math.round(rect.width * escala / 2) * 2;
  const altura = Math.round(rect.height * escala / 2) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('Canvas indisponível.');

  let ativo = true;
  const desenhar = () => {
    if (!ativo) return;
    const r = palco.getBoundingClientRect();
    const e = video.videoWidth / window.innerWidth || escala;
    ctx2d.drawImage(video, r.left * e, r.top * e, r.width * e, r.height * e, 0, 0, largura, altura);
    requestAnimationFrame(desenhar);
  };
  desenhar();

  return criarGravador(canvas, contexto, () => {
    ativo = false;
    captura.getTracks().forEach((t) => t.stop());
  });
}

interface OpcoesCompativel {
  iframe: HTMLIFrameElement;
  largura: number;
  altura: number;
  celular: boolean;
  contexto: AudioContext;
  cenaAtual: () => CenaDemo | null;
  mostrarLegendas: boolean;
}

/** Modo "compatível": desenha o palco quadro a quadro, sem captura de tela */
export async function iniciarGravacaoCompativel(o: OpcoesCompativel): Promise<Gravador> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(o.largura / 2) * 2;
  canvas.height = Math.round(o.altura / 2) * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');

  let ativo = true;
  let quadro: HTMLCanvasElement | null = null;

  // Fotografa o sistema continuamente (cada foto leva de 100 a 600 ms)
  const fotografar = async () => {
    while (ativo) {
      const doc = o.iframe.contentDocument;
      if (doc?.body) {
        try {
          quadro = await html2canvas(doc.body, {
            width: o.largura,
            height: o.altura,
            windowWidth: o.largura,
            windowHeight: o.altura,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0,
            scale: 1,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          });
        } catch {

          // tenta de novo no próximo ciclo
        }}
      await new Promise((r) => window.setTimeout(r, 120));
    }
  };
  void fotografar();

  const desenhar = () => {
    const cena = o.cenaAtual();
    const w = canvas.width;
    const h = canvas.height;
    if (cena?.capa) {
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${o.celular ? 64 : 88}px Inter, system-ui, sans-serif`;
      ctx.fillText(cena.capa.titulo, w / 2, h / 2 - (o.celular ? 50 : 40), w * 0.9);
      ctx.fillStyle = '#f0fdfa';
      ctx.font = `400 ${o.celular ? 28 : 32}px Inter, system-ui, sans-serif`;
      escreverLinhas(ctx, cena.capa.subtitulo, w / 2, h / 2 + (o.celular ? 30 : 50), w * 0.85, o.celular ? 36 : 40);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (quadro) ctx.drawImage(quadro, 0, 0, w, h);
    desenharCursor(ctx, w / o.largura);
    if (o.mostrarLegendas && cena?.legenda) desenharLegenda(ctx, cena.legenda, w, h, o.celular);
  };
  const relogio = window.setInterval(desenhar, 1000 / 30);
  desenhar();

  return criarGravador(canvas, o.contexto, () => {
    ativo = false;
    window.clearInterval(relogio);
  });
}

function quebrar(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(teste).width > larguraMax && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function escreverLinhas(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, larguraMax: number, altura: number) {
  quebrar(ctx, texto, larguraMax).forEach((linha, i) => ctx.fillText(linha, x, y + i * altura));
}

function desenharLegenda(ctx: CanvasRenderingContext2D, texto: string, w: number, h: number, celular: boolean) {
  const tamanho = celular ? 30 : 26;
  ctx.font = `500 ${tamanho}px Inter, system-ui, sans-serif`;
  const linhas = quebrar(ctx, texto, w * 0.92 - 46);
  const alturaLinha = tamanho * 1.3;
  const largura = Math.min(w * 0.92, Math.max(...linhas.map((l) => ctx.measureText(l).width)) + 46);
  const altura = linhas.length * alturaLinha + 26;
  const margem = celular ? 32 : 16;
  const x = (w - largura) / 2;
  const y = h - margem - altura;
  ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, r);
  ctx.arcTo(x + largura, y + altura, x, y + altura, r);
  ctx.arcTo(x, y + altura, x, y, r);
  ctx.arcTo(x, y, x + largura, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  linhas.forEach((l, i) => ctx.fillText(l, w / 2, y + 13 + alturaLinha / 2 + i * alturaLinha));
}