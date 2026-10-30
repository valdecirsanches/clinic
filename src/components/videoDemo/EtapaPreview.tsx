import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  DownloadIcon,
  LoaderIcon,
  MonitorIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SmartphoneIcon,
  Trash2Icon,
  VideoIcon } from
'lucide-react';
import { Button } from '../ui/Button';
import type { CenaDemo } from '../../data/demoRoteiro';
import { duracaoCena, ReprodutorDemo } from '../../utils/reprodutorDemo';
import { navegarPalco, PalcoDemo, TAMANHOS_DEMO, type FormatoDemo } from './PalcoDemo';

export interface ResultadoVideo {
  url: string;
  extensao: string;
  tamanho: number;
}

interface EtapaPreviewProps {
  cenas: CenaDemo[];
  /** Áudios atuais (id → url) e suas durações */
  urls: Record<string, string>;
  duracoes: Record<string, number>;
  pendentes: number;
  preparandoNarracoes: {feitas: number;total: number;} | null;
  onPrepararNarracoes: () => Promise<boolean>;
  formato: FormatoDemo;
  setFormato: (f: FormatoDemo) => void;
  legendas: boolean;
  setLegendas: (v: boolean) => void;
  musica: {url: string;nome: string;} | null;
  setMusica: (m: {url: string;nome: string;} | null) => void;
  volumeMusica: number;
  setVolumeMusica: (v: number) => void;
  volumeNarracao: number;
  setVolumeNarracao: (v: number) => void;
  bloqueioGravacao: string | null;
  onGravar: () => void;
  resultado: ResultadoVideo | null;
  onDescartarResultado: () => void;
}

type EstadoPreview = 'carregando' | 'parado' | 'tocando' | 'pausado';

const minSeg = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function EtapaPreview(p: EtapaPreviewProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reprodutorRef = useRef<ReprodutorDemo | null>(null);
  const urlsRef = useRef(p.urls);
  urlsRef.current = p.urls;
  const [largura, setLargura] = useState(800);
  const [estado, setEstado] = useState<EstadoPreview>('carregando');
  const [indice, setIndice] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [assistido, setAssistido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [musicaAberta, setMusicaAberta] = useState(Boolean(p.musica));

  // A largura disponível define a escala do palco
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { w, h } = TAMANHOS_DEMO[p.formato];
  const escala = Math.min(largura / w, (p.formato === 'celular' ? 620 : 560) / h, 1);

  const duracoes = p.cenas.map((c) => duracaoCena(c, p.urls[c.id] ? p.duracoes[c.id] || 0 : 0));
  const total = duracoes.reduce((s, d) => s + d, 0);
  const decorridoAntes = duracoes.slice(0, indice).reduce((s, d) => s + d, 0);

  // Qualquer mudança no que vai para o vídeo pede uma nova conferência
  const chaveConteudo = JSON.stringify([p.cenas, Object.keys(p.urls), p.formato, p.legendas, p.musica?.nome, p.volumeMusica, p.volumeNarracao]);
  useEffect(() => {
    setAssistido(false);
  }, [chaveConteudo]);

  useEffect(() => () => reprodutorRef.current?.fechar(), []);

  const tocarDe = useCallback(
    async (inicio: number) => {
      setErro(null);
      if (p.pendentes > 0) {
        const ok = await p.onPrepararNarracoes();
        if (!ok) {
          setErro('Não foi possível gerar todas as narrações. Veja o motivo acima ou continue: as cenas sem narração ficam em silêncio.');
          return;
        }
        await new Promise((r) => window.setTimeout(r, 0)); // aguarda os áudios novos chegarem
      }
      reprodutorRef.current?.fechar();
      const reprodutor = new ReprodutorDemo({
        cenas: p.cenas,
        audios: urlsRef.current,
        musica: p.musica ? { url: p.musica.url, volume: p.volumeMusica } : null,
        volumeNarracao: p.volumeNarracao,
        navegar: (pg) => navegarPalco(iframeRef.current, pg),
        onCena: setIndice,
        onTempo: setTempo
      });
      reprodutorRef.current = reprodutor;
      setEstado('tocando');
      const completo = await reprodutor.executar(inicio);
      if (reprodutorRef.current !== reprodutor) return;
      if (completo) {
        setAssistido(true);
        setEstado('parado');
        setIndice(0);
        setTempo(0);
      }
    },
    [p]
  );

  const pularPara = (i: number) => {
    const alvo = Math.max(0, Math.min(p.cenas.length - 1, i));
    if (estado === 'tocando' || estado === 'pausado') {
      tocarDe(alvo);
    } else {
      setIndice(alvo);
      setTempo(0);
      navegarPalco(iframeRef.current, p.cenas[alvo].pagina);
    }
  };

  const alternar = () => {
    const r = reprodutorRef.current;
    if (estado === 'tocando' && r) {
      r.pausar();
      setEstado('pausado');
    } else if (estado === 'pausado' && r) {
      r.retomar();
      setEstado('tocando');
    } else {
      tocarDe(indice);
    }
  };

  const reiniciar = () => {
    reprodutorRef.current?.parar();
    setEstado('parado');
    setIndice(0);
    setTempo(0);
    if (p.cenas[0]) navegarPalco(iframeRef.current, p.cenas[0].pagina);
  };

  const cena = p.cenas[indice] || null;
  const preparando = Boolean(p.preparandoNarracoes);
  const emExecucao = estado === 'tocando' || estado === 'pausado';

  return (
    <div className="space-y-6">
      {p.resultado &&
      <section className="bg-white border border-gray-200 rounded-lg p-5 grid md:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start" aria-labelledby="titulo-resultado">
          <video src={p.resultado.url} controls className="w-full rounded-lg bg-black max-h-[480px]" />
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <CheckCircle2Icon className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />
              <div>
                <h2 id="titulo-resultado" className="font-semibold text-gray-900">
                  Vídeo gerado
                </h2>
                <p className="text-sm text-gray-600">Assista ao lado. Se estiver bom, baixe; se não, ajuste e grave de novo.</p>
              </div>
            </div>
            <a
            href={p.resultado.url}
            download={`demonstracao-easyclin-${p.formato}.${p.resultado.extensao}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
            
              <DownloadIcon className="w-4 h-4" aria-hidden="true" /> Baixar {p.resultado.extensao.toUpperCase()} · {(p.resultado.tamanho / 1048576).toFixed(1)} MB
            </a>
            {p.resultado.extensao !== 'mp4' &&
          <p className="text-xs text-gray-500">
                Este navegador grava em WebM, que toca no Chrome, Edge, Firefox e VLC. Para MP4, use o Chrome atualizado.
              </p>
          }
            <Button variant="ghost" size="sm" onClick={p.onDescartarResultado}>
              Descartar este vídeo
            </Button>
          </div>
        </section>
      }

      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* Player */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden" aria-label="Pré-visualização do vídeo">
          <div ref={areaRef} className="bg-gray-900 flex justify-center p-4 sm:p-6">
            <div className="relative">
              <PalcoDemo
                formato={p.formato}
                escala={escala}
                cena={emExecucao ? cena : null}
                mostrarLegendas={p.legendas}
                iframeRef={iframeRef}
                onCarregado={() => {
                  setEstado((e) => e === 'carregando' ? 'parado' : e);
                  if (p.cenas[0]) navegarPalco(iframeRef.current, p.cenas[0].pagina);
                }} />
              
              {(estado === 'carregando' || preparando) &&
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70 text-white text-sm gap-2">
                  <LoaderIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {preparando ?
                `Gerando narrações (${(p.preparandoNarracoes?.feitas || 0) + 1} de ${p.preparandoNarracoes?.total})...` :
                'Carregando o sistema...'}
                </div>
              }
              {estado === 'parado' && !preparando &&
              <button
                type="button"
                onClick={() => tocarDe(indice)}
                className="absolute inset-0 flex items-center justify-center group"
                aria-label="Reproduzir pré-visualização">
                
                  <span className="w-16 h-16 rounded-full bg-gray-900/80 text-white flex items-center justify-center group-hover:bg-teal-600 transition-colors">
                    <PlayIcon className="w-7 h-7 ml-1" aria-hidden="true" />
                  </span>
                </button>
              }
            </div>
          </div>

          {/* Linha do tempo: cada trecho é uma cena, proporcional à duração */}
          <div className="px-5 pt-4">
            <div className="flex gap-0.5 h-2" role="group" aria-label="Cenas">
              {p.cenas.map((c, i) => {
                const preenchido = i < indice ? 100 : i === indice ? Math.min(100, tempo / duracoes[i] * 100) : 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pularPara(i)}
                    title={`${i + 1}. ${c.titulo}`}
                    aria-label={`Ir para a cena ${i + 1}: ${c.titulo}`}
                    className="relative h-full rounded-sm bg-gray-200 hover:bg-gray-300 overflow-hidden"
                    style={{ flexGrow: duracoes[i] }}>
                    
                    <span className="absolute inset-y-0 left-0 bg-teal-600" style={{ width: `${preenchido}%` }} />
                  </button>);

              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => pularPara(indice - 1)} disabled={indice === 0 || preparando} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Cena anterior">
                <SkipBackIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={alternar}
                disabled={estado === 'carregando' || preparando}
                className="w-11 h-11 rounded-full bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 disabled:opacity-40 transition-colors"
                aria-label={estado === 'tocando' ? 'Pausar' : 'Reproduzir'}>
                
                {estado === 'tocando' ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
              </button>
              <button type="button" onClick={() => pularPara(indice + 1)} disabled={indice >= p.cenas.length - 1 || preparando} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Próxima cena">
                <SkipForwardIcon className="w-5 h-5" />
              </button>
              <button type="button" onClick={reiniciar} disabled={preparando} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Voltar ao início">
                <RotateCcwIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {indice + 1}. {cena?.titulo}
              </p>
              <p className="text-xs text-gray-500 tabular-nums">
                {minSeg(decorridoAntes + (emExecucao ? tempo : 0))} / {minSeg(total)}
              </p>
            </div>
          </div>
        </section>

        {/* Ajustes e geração */}
        <aside className="space-y-6 xl:sticky xl:top-0">
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4" aria-labelledby="titulo-formato">
            <h2 id="titulo-formato" className="font-semibold text-gray-900">
              Formato
            </h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato do vídeo">
              {([
              { id: 'desktop', nome: 'Computador', detalhe: '1280×720', Icone: MonitorIcon },
              { id: 'celular', nome: 'Celular', detalhe: 'vertical', Icone: SmartphoneIcon }] as
              const).map((f) =>
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={p.formato === f.id}
                onClick={() => p.setFormato(f.id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                p.formato === f.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}`
                }>
                
                  <f.Icone className={`w-5 h-5 shrink-0 ${p.formato === f.id ? 'text-teal-600' : 'text-gray-400'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{f.nome}</span>
                    <span className="block text-xs text-gray-500">{f.detalhe}</span>
                  </span>
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={p.legendas} onChange={(e) => p.setLegendas(e.target.checked)} className="rounded accent-teal-600" />
              Mostrar legendas
            </label>

            <div className="pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setMusicaAberta((v) => !v)}
                aria-expanded={musicaAberta}
                className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                
                <ChevronDownIcon className={`w-4 h-4 transition-transform duration-150 ${musicaAberta ? 'rotate-180' : ''}`} aria-hidden="true" />
                Música de fundo {p.musica ? `· ${p.musica.nome}` : '(opcional)'}
              </button>
              {musicaAberta &&
              <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                      <MusicIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{p.musica ? p.musica.nome : 'Escolher arquivo de áudio'}</span>
                      <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (p.musica) URL.revokeObjectURL(p.musica.url);
                        p.setMusica({ url: URL.createObjectURL(f), nome: f.name });
                      }} />
                    
                    </label>
                    {p.musica &&
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(p.musica!.url);
                      p.setMusica(null);
                    }}
                    className="p-2 text-gray-400 hover:text-red-600"
                    aria-label="Remover música de fundo">
                    
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                  }
                  </div>
                  <label className="block">
                    <span className="flex justify-between text-sm text-gray-700">
                      Volume da música <span className="tabular-nums text-gray-500">{Math.round(p.volumeMusica * 100)}%</span>
                    </span>
                    <input type="range" min={0} max={1} step={0.05} value={p.volumeMusica} onChange={(e) => p.setVolumeMusica(Number(e.target.value))} className="w-full accent-teal-600" />
                  </label>
                  <label className="block">
                    <span className="flex justify-between text-sm text-gray-700">
                      Volume da voz <span className="tabular-nums text-gray-500">{Math.round(p.volumeNarracao * 100)}%</span>
                    </span>
                    <input type="range" min={0} max={1.5} step={0.05} value={p.volumeNarracao} onChange={(e) => p.setVolumeNarracao(Number(e.target.value))} className="w-full accent-teal-600" />
                  </label>
                </div>
              }
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3" aria-labelledby="titulo-gerar">
            <h2 id="titulo-gerar" className="font-semibold text-gray-900">
              Gerar o vídeo
            </h2>
            {p.bloqueioGravacao ?
            <p className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {p.bloqueioGravacao}
              </p> :
            assistido ?
            <p className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2Icon className="w-4 h-4" aria-hidden="true" /> Pré-visualização assistida até o fim.
              </p> :

            <p className="text-sm text-gray-600">Assista à pré-visualização até o fim. O vídeo será gravado exatamente como ela.</p>
            }
            <Button className="w-full" disabled={!assistido || !!p.bloqueioGravacao || emExecucao || preparando} onClick={p.onGravar}>
              <VideoIcon className="w-4 h-4 mr-1.5 inline" aria-hidden="true" /> Gerar vídeo
            </Button>
            <p className="text-xs text-gray-500">
              A gravação leva o mesmo tempo do vídeo ({minSeg(total)}). Use o Chrome ou o Edge no computador e, quando o
              navegador perguntar, escolha <strong>Esta aba</strong>.
            </p>
          </section>
        </aside>
      </div>

      {erro &&
      <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erro}
        </p>
      }
    </div>);

}