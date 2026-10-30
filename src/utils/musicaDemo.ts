/**
 * Música de fundo da apresentação, composta no próprio navegador:
 * acordes suaves com arpejo leve, em laço de 32 segundos. Não depende de
 * arquivo externo nem de direitos autorais de terceiros.
 */

const TAXA = 44100;
const DURACAO = 32;
const TEMPO_ACORDE = 4;

// Cmaj7 · Am7 · Fmaj7 · G6 (duas voltas)
const PROGRESSAO = [
[60, 64, 67, 71],
[57, 60, 64, 67],
[53, 57, 60, 64],
[55, 59, 62, 64]];


const hz = (nota: number) => 440 * 2 ** ((nota - 69) / 12);

function envelope(g: GainNode, inicio: number, ataque: number, nivel: number, fim: number, soltura: number) {
  g.gain.setValueAtTime(0, inicio);
  g.gain.linearRampToValueAtTime(nivel, inicio + ataque);
  g.gain.setValueAtTime(nivel, Math.max(inicio + ataque, fim - soltura));
  g.gain.linearRampToValueAtTime(0, fim);
}

function nota(ctx: OfflineAudioContext, saida: AudioNode, tipo: OscillatorType, freq: number, inicio: number, fim: number, nivel: number, ataque: number, soltura: number, detune = 0) {
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  const g = ctx.createGain();
  envelope(g, inicio, ataque, nivel, fim, soltura);
  osc.connect(g);
  g.connect(saida);
  osc.start(inicio);
  osc.stop(fim + 0.05);
}

function paraWav(buffer: AudioBuffer): Blob {
  const canais = buffer.numberOfChannels;
  const amostras = buffer.length;
  const bytes = 44 + amostras * canais * 2;
  const dv = new DataView(new ArrayBuffer(bytes));
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => dv.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  dv.setUint32(4, bytes - 8, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, canais, true);
  dv.setUint32(24, buffer.sampleRate, true);
  dv.setUint32(28, buffer.sampleRate * canais * 2, true);
  dv.setUint16(32, canais * 2, true);
  dv.setUint16(34, 16, true);
  texto(36, 'data');
  dv.setUint32(40, amostras * canais * 2, true);
  const dados = Array.from({ length: canais }, (_, c) => buffer.getChannelData(c));
  let pos = 44;
  for (let i = 0; i < amostras; i += 1) {
    for (let c = 0; c < canais; c += 1) {
      const v = Math.max(-1, Math.min(1, dados[c][i]));
      dv.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([dv], { type: 'audio/wav' });
}

async function compor(): Promise<string> {
  const ctx = new OfflineAudioContext(2, TAXA * DURACAO, TAXA);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 2400;
  const mestre = ctx.createGain();
  mestre.gain.value = 0.9;
  filtro.connect(mestre);
  mestre.connect(ctx.destination);

  const voltas = DURACAO / TEMPO_ACORDE;
  for (let i = 0; i < voltas; i += 1) {
    const acorde = PROGRESSAO[i % PROGRESSAO.length];
    const inicio = i * TEMPO_ACORDE;
    const ultimo = i === voltas - 1;
    const fim = ultimo ? DURACAO : inicio + TEMPO_ACORDE + 0.4;

    // Pad: duas camadas levemente desafinadas
    for (const n of acorde) {
      nota(ctx, filtro, 'sine', hz(n), inicio, fim, 0.045, 1.1, 1, -6);
      nota(ctx, filtro, 'triangle', hz(n), inicio, fim, 0.02, 1.4, 1, 7);
    }
    // Baixo
    nota(ctx, filtro, 'sine', hz(acorde[0] - 24), inicio, fim, 0.09, 0.3, 0.8);

    // Arpejo em colcheias, uma oitava acima
    const passos = TEMPO_ACORDE / 0.5;
    for (let s = 0; s < passos; s += 1) {
      const t = inicio + s * 0.5;
      const n = acorde[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]] + 12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.48);
      osc.connect(g);
      g.connect(filtro);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  const buffer = await ctx.startRendering();
  return URL.createObjectURL(paraWav(buffer));
}

let pronta: Promise<string> | null = null;

/** URL (blob) da música — composta uma única vez por sessão */
export function musicaDeFundo(): Promise<string> {
  if (!pronta) {
    pronta = compor().catch((err) => {
      pronta = null;
      throw err;
    });
  }
  return pronta;
}