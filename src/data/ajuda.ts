// ==================== AJUDA DAS TELAS ====================
// Os textos vêm de server/ajuda/ajudaTelas.json — o MESMO arquivo que o
// servidor narra com a voz da ElevenLabs. Mudou um texto? Mude só lá.
import catalogo from '../server/ajuda/ajudaTelas.json';

export interface TopicoAjuda {
  id: string;
  grupo: string;
  titulo: string;
  resumo: string;
  passos: string[];
  dicas: string[];
  palavras?: string[];
  /** Só aparece para estes perfis (sem o campo: todos). */
  perfis?: string[];
  /** Tour guiado da tela (sem o campo: usa resumo + passos). */
  tour?: PassoTour[];
}

export interface PassoTour {
  /** Texto visível na tela (botão, título) ou "css:<seletor>". null = centralizado. */
  alvo: string | null;
  texto: string;
}

export const topicosAjuda: TopicoAjuda[] = (catalogo as {topicos: TopicoAjuda[];}).topicos;

const porId = new Map(topicosAjuda.map((t) => [t.id, t]));

export function buscarTopicoAjuda(id: string | null | undefined): TopicoAjuda | null {
  return id ? porId.get(id) || null : null;
}

/**
 * Passos do tour guiado. ⚠️ Mesma regra de server/ajuda/catalogo.js
 * (passosDoTour) — o servidor narra o passo pelo índice.
 */
export function passosDoTour(topico: TopicoAjuda): PassoTour[] {
  if (Array.isArray(topico.tour) && topico.tour.length) {
    return topico.tour.map((p) => ({ alvo: p.alvo || null, texto: String(p.texto || '') }));
  }
  return [topico.resumo, ...(topico.passos || [])].filter(Boolean).map((texto) => ({ alvo: null, texto }));
}

/** Tópico da tela atual; no prontuário, o da aba aberta. */
export function topicoDaTela(tela: string, prontuarioStep?: string | null): TopicoAjuda {
  if (tela === 'prontuario_atendimento' && prontuarioStep) {
    const daAba = porId.get(`prontuario_atendimento:${prontuarioStep}`);
    if (daAba) return daAba;
  }
  return porId.get(tela) || porId.get('inicio')!;
}

export function topicoVisivelPara(topico: TopicoAjuda, tipoUsuario: string): boolean {
  return !topico.perfis || topico.perfis.length === 0 || topico.perfis.includes(tipoUsuario);
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busca por título, palavras-chave e conteúdo (sem diferenciar acentos). */
export function pesquisarAjuda(termo: string, tipoUsuario: string): TopicoAjuda[] {
  const visiveis = topicosAjuda.filter((t) => topicoVisivelPara(t, tipoUsuario));
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return visiveis;
  const pontuados = visiveis.
  map((t) => {
    const titulo = normalizar(`${t.titulo} ${t.grupo}`);
    const chaves = normalizar((t.palavras || []).join(' '));
    const corpo = normalizar([t.resumo, ...t.passos, ...t.dicas].join(' '));
    let pontos = 0;
    for (const p of palavras) {
      if (titulo.includes(p)) pontos += 5;else
      if (chaves.includes(p)) pontos += 3;else
      if (corpo.includes(p)) pontos += 1;else
      return { t, pontos: 0 };
    }
    return { t, pontos };
  }).
  filter((x) => x.pontos > 0).
  sort((a, b) => b.pontos - a.pontos);
  return pontuados.map((x) => x.t);
}

/** Agrupa mantendo a ordem do catálogo. */
export function agruparAjuda(topicos: TopicoAjuda[]): {grupo: string;topicos: TopicoAjuda[];}[] {
  const grupos: {grupo: string;topicos: TopicoAjuda[];}[] = [];
  for (const t of topicos) {
    let g = grupos.find((x) => x.grupo === t.grupo);
    if (!g) {
      g = { grupo: t.grupo, topicos: [] };
      grupos.push(g);
    }
    g.topicos.push(t);
  }
  return grupos;
}
