import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, XIcon, Volume2Icon, VolumeXIcon, Loader2Icon } from 'lucide-react';
import { buscarTopicoAjuda, passosDoTour } from '../../data/ajuda';
import { useAjudaVoz } from '../../hooks/useAjudaVoz';

// ==================== TOUR GUIADO DA TELA ====================
// Escurece a tela, destaca o elemento de cada passo e explica. O alvo de cada
// passo vem do catálogo (server/ajuda/ajudaTelas.json): um texto visível
// (nome do botão, título) ou "css:<seletor>". Sem alvo na tela, o cartão
// aparece no centro. Com a ajuda por voz ligada, cada passo é narrado.

const CHAVE_NARRAR = 'easyclin-tour-narrar';
const MARCA_UI = 'data-ajuda-ui'; // elementos da própria ajuda: nunca são alvo

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function visivel(el: Element) {
  if (el.closest(`[${MARCA_UI}]`)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const estilo = window.getComputedStyle(el);
  return estilo.visibility !== 'hidden' && estilo.display !== 'none';
}

const INTERATIVOS = 'button, a, label, th, [role="tab"], [role="switch"], [role="button"], input, select, h1, h2, h3, h4';

/** Encontra o elemento do passo (prefere o conteúdo da página ao menu lateral). */
export function acharAlvo(alvo: string | null, raiz: Document = document): HTMLElement | null {
  if (!alvo) return null;
  if (alvo.startsWith('css:')) {
    try {
      const lista = Array.from(raiz.querySelectorAll<HTMLElement>(alvo.slice(4)));
      return lista.find(visivel) || null;
    } catch {
      return null;
    }
  }
  const procurado = normalizar(alvo);
  if (!procurado) return null;
  const achados: {el: HTMLElement;nota: number;}[] = [];
  const caminhante = raiz.createTreeWalker(raiz.body, NodeFilter.SHOW_TEXT);
  let no = caminhante.nextNode();
  while (no) {
    const texto = normalizar(no.textContent || '');
    if (texto && texto.length <= procurado.length + 40 && texto.includes(procurado)) {
      const pai = no.parentElement;
      if (pai && visivel(pai)) {
        const el = (pai.closest(INTERATIVOS) as HTMLElement) || pai;
        let nota = texto === procurado ? 3 : texto.startsWith(procurado) ? 2 : 1;
        if (el.closest('main')) nota += 3;
        if (el.closest('nav, aside')) nota -= 1;
        achados.push({ el, nota });
      }
    }
    no = caminhante.nextNode();
  }
  achados.sort((a, b) => b.nota - a.nota);
  return achados[0]?.el || null;
}

// Usado pela verificação automática dos tours (scripts de teste no navegador).
if (typeof window !== 'undefined') (window as any).__easyclinAcharAlvo = (alvo: string) => Boolean(acharAlvo(alvo));

interface Retangulo {top: number;left: number;width: number;height: number;}

interface TourGuiadoProps {
  topicoId: string;
  onFechar: () => void;
}

export function TourGuiado({ topicoId, onFechar }: TourGuiadoProps) {
  const topico = buscarTopicoAjuda(topicoId);
  const passos = useMemo(() => topico ? passosDoTour(topico) : [], [topico]);
  const [indice, setIndice] = useState(0);
  const [ret, setRet] = useState<Retangulo | null>(null);
  const [narrar, setNarrar] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_NARRAR) !== 'nao';
    } catch {
      return true;
    }
  });
  const voz = useAjudaVoz();
  const alvoRef = useRef<HTMLElement | null>(null);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const [tamCartao, setTamCartao] = useState({ w: 360, h: 180 });

  const passo = passos[indice];
  const ultimo = indice === passos.length - 1;

  const medir = useCallback(() => {
    const el = alvoRef.current;
    if (!el || !el.isConnected) {
      setRet(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRet({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Novo passo: acha o alvo, rola até ele e mede.
  useEffect(() => {
    if (!passo) return;
    const el = acharAlvo(passo.alvo);
    alvoRef.current = el;
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    medir();
    const t = window.setTimeout(medir, 350);
    return () => window.clearTimeout(t);
  }, [passo, medir]);

  useEffect(() => {
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [medir]);

  useLayoutEffect(() => {
    const c = cartaoRef.current;
    if (c) setTamCartao({ w: c.offsetWidth, h: c.offsetHeight });
  }, [indice, ret]);

  // Narração de cada passo
  const { ouvir, parar } = voz;
  useEffect(() => {
    if (voz.config.ativo && narrar && passo) ouvir(topicoId, indice);else
    parar();
  }, [voz.config.ativo, narrar, indice, topicoId, passo, ouvir, parar]);

  const fechar = useCallback(() => {
    parar();
    onFechar();
  }, [parar, onFechar]);

  const avancar = useCallback(() => {
    if (ultimo) fechar();else
    setIndice((i) => i + 1);
  }, [ultimo, fechar]);
  const voltar = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();else
      if (e.key === 'ArrowRight') avancar();else
      if (e.key === 'ArrowLeft') voltar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar, avancar, voltar]);

  if (!topico || !passo) return null;

  // Posição do cartão: abaixo do alvo, ou acima se não couber; sem alvo, no centro.
  const margem = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let posicao: CSSProperties;
  if (ret) {
    const cabeAbaixo = ret.top + ret.height + margem + tamCartao.h < vh;
    const top = cabeAbaixo ? ret.top + ret.height + margem : Math.max(margem, ret.top - tamCartao.h - margem);
    const left = Math.min(Math.max(margem, ret.left), vw - tamCartao.w - margem);
    posicao = { top, left };
  } else {
    posicao = { top: Math.max(margem, (vh - tamCartao.h) / 2), left: Math.max(margem, (vw - tamCartao.w) / 2) };
  }

  const alternarNarracao = () => {
    const novo = !narrar;
    setNarrar(novo);
    try {
      localStorage.setItem(CHAVE_NARRAR, novo ? 'sim' : 'nao');
    } catch {/* navegador sem armazenamento */}
  };

  const carregandoVoz = voz.estado === 'carregando' && voz.topicoTocando === `${topicoId}#${indice}`;

  return (
    <div {...{ [MARCA_UI]: '' }} role="dialog" aria-modal="true" aria-label={`Tour: ${topico.titulo}`}>
      {/* Fundo: bloqueia cliques na tela durante o tour */}
      <div className="fixed inset-0 z-[90]" onClick={(e) => e.stopPropagation()} style={ret ? undefined : { background: 'rgba(17,24,39,0.55)' }} />
      {ret &&
      <div
        className="pointer-events-none fixed z-[91] rounded-lg ring-4 ring-teal-400 transition-all duration-200"
        style={{
          top: ret.top - 6,
          left: ret.left - 6,
          width: ret.width + 12,
          height: ret.height + 12,
          boxShadow: '0 0 0 9999px rgba(17,24,39,0.55)'
        }} />

      }
      <div
        ref={cartaoRef}
        className="fixed z-[92] w-[min(360px,calc(100vw-1.5rem))] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
        style={posicao}>

        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
            {topico.titulo} · {indice + 1} de {passos.length}
          </p>
          <button type="button" onClick={fechar} className="-mr-1 -mt-1 rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Encerrar tour">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">{passo.texto}</p>
        {voz.erro && <p className="mt-1 text-xs text-red-600">{voz.erro}</p>}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {voz.config.ativo &&
            <button
              type="button"
              onClick={alternarNarracao}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              title={narrar ? 'Desligar a narração' : 'Ligar a narração'}
              aria-label={narrar ? 'Desligar a narração' : 'Ligar a narração'}>

                {carregandoVoz ?
              <Loader2Icon className="h-4 w-4 animate-spin" /> :
              narrar ?
              <Volume2Icon className="h-4 w-4" /> :
              <VolumeXIcon className="h-4 w-4" />}
              </button>
            }
            <div className="flex gap-1" aria-hidden="true">
              {passos.map((_, i) =>
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === indice ? 'bg-teal-600' : 'bg-gray-300'}`} />
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {indice > 0 &&
            <button
              type="button"
              onClick={voltar}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">

                <ChevronLeftIcon className="h-4 w-4" /> Anterior
              </button>
            }
            <button
              type="button"
              onClick={avancar}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300">

              {ultimo ? 'Concluir' : <>Próximo <ChevronRightIcon className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>);

}
