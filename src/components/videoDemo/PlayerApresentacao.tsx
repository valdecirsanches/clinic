import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  LoaderIcon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SmartphoneIcon,
  VideoIcon } from
'lucide-react';
import { Button } from '../ui/Button';
import type { CenaDemo } from '../../data/demoRoteiro';
import { duracaoCena, ReprodutorDemo } from '../../utils/reprodutorDemo';
import { CursorDemo } from '../../utils/cursorDemo';
import { navegarPalco, PalcoDemo, TAMANHOS_DEMO, type FormatoDemo } from './PalcoDemo';
import { ControlesAudio } from './ControlesAudio';
import type { AjustesAudio, MusicaEscolhida } from '../../types/videoDemo';

export interface ResultadoVideo {
  url: string;
  extensao: string;
  tamanho: number;
}

interface PlayerApresentacaoProps {
  cenas: CenaDemo[];
  /** Narrações prontas (id da cena → url) e durações (s) */
  urls: Record<string, string>;
  duracoes: Record<string, number>;
  pendentes: number;
  preparandoNarracoes: {feitas: number;total: number;} | null;
  onPrepararNarracoes: () => Promise<boolean>;
  /** Texto sobre a voz usada (ou por que não há narração) */
  infoNarracao: string;
  formato: FormatoDemo;
  setFormato: (f: FormatoDemo) => void;
  legendas: boolean;
  setLegendas: (v: boolean) => void;
  audio: AjustesAudio;
  setAudio: (a: AjustesAudio) => void;
  musicaSistemaUrl: string | null;
  musicaArquivo: MusicaEscolhida | null;
  onEscolherMusica: (arquivo: File) => void;
  onRemoverMusica: () => void;
  /** Música efetivamente usada (arquivo escolhido ou trilha do sistema) */
  musicaEscolhida: MusicaEscolhida | null;
  extensaoGravacao: 'mp4' | 'webm' | null;
  /** Como a gravação vai capturar a tela, e por quê */
  modoGravacao: {modo: 'aba' | 'compativel';motivo?: string;};
  onGravar: () => void;
  resultado: ResultadoVideo | null;
  onDescartarResultado: () => void;
}

type EstadoPlayer = 'carregando' | 'parado' | 'tocando' | 'pausado';

const minSeg = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Pré-visualização da apresentação pronta e geração do vídeo */
export function PlayerApresentacao(p: PlayerApresentacaoProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reprodutorRef = useRef<ReprodutorDemo | null>(null);
  const urlsRef = useRef(p.urls);
  urlsRef.current = p.urls;
  const [largura, setLargura] = useState(800);
  const [estado, setEstado] = useState<EstadoPlayer>('carregando');
  const [indice, setIndice] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [assistido, setAssistido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { w, h } = TAMANHOS_DEMO[p.formato];
  const escala = Math.min((largura - 32) / w, (p.formato === 'celular' ? 640 : 600) / h, 1);

  const duracoes = p.cenas.map((c) => duracaoCena(c, p.urls[c.id] ? p.duracoes[c.id] || 0 : 0));
  const total = duracoes.reduce((s, d) => s + d, 0);
  const decorridoAntes = duracoes.slice(0, indice).reduce((s, d) => s + d, 0);
  const musica = p.audio.musicaAtiva && p.musicaEscolhida ? { url: p.musicaEscolhida.url, volume: p.audio.volumeMusica } : null;

  // Mudou o que vai para o vídeo: pede uma nova conferência.
  // Volumes não entram: são ajustados ao vivo durante a pré-visualização.
  const chaveConteudo = JSON.stringify([Object.keys(p.urls), p.formato, p.legendas, p.audio.musicaAtiva, p.musicaEscolhida?.url]);
  useEffect(() => {
    setAssistido(false);
  }, [chaveConteudo]);

  // Controles de áudio valem na hora, com a apresentação tocando
  useEffect(() => {
    reprodutorRef.current?.ajustar({
      volumeMusica: p.audio.volumeMusica,
      volumeNarracao: p.audio.volumeNarracao,
      abaixarNaFala: p.audio.abaixarNaFala
    });
  }, [p.audio.volumeMusica, p.audio.volumeNarracao, p.audio.abaixarNaFala]);

  useEffect(() => () => reprodutorRef.current?.fechar(), []);

  const tocarDe = useCallback(
    async (inicio: number) => {
      setErro(null);
      if (p.pendentes > 0) {
        const ok = await p.onPrepararNarracoes();
        if (!ok) setErro('Algumas narrações não foram geradas. Essas cenas ficam só com música e legenda.');
        await new Promise((r) => window.setTimeout(r, 0));
      }
      reprodutorRef.current?.fechar();
      const reprodutor = new ReprodutorDemo({
        cenas: p.cenas,
        audios: urlsRef.current,
        musica,
        volumeNarracao: p.audio.volumeNarracao,
        abaixarNaFala: p.audio.abaixarNaFala,
        suavizar: p.audio.suavizar,
        navegar: (pg) => navegarPalco(iframeRef.current, pg),
        cursor: new CursorDemo(() => iframeRef.current, TAMANHOS_DEMO[p.formato], p.formato === 'celular'),
        onCena: setIndice,
        onTempo: setTempo
      });
      reprodutorRef.current = reprodutor;
      setEstado('tocando');
      const completo = await reprodutor.executar(inicio);
      if (reprodutorRef.current !== reprodutor) return;
      if (completo) {
        if (inicio === 0) setAssistido(true);
        setEstado('parado');
        setIndice(0);
        setTempo(0);
      }
    },
    [p, musica]
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
                <p className="text-sm text-gray-600">Assista ao lado e baixe o arquivo.</p>
              </div>
            </div>
            <a
            href={p.resultado.url}
            download={`apresentacao-easyclin-${p.formato}.${p.resultado.extensao}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
            
              <DownloadIcon className="w-4 h-4" aria-hidden="true" /> Baixar {p.resultado.extensao.toUpperCase()} · {(p.resultado.tamanho / 1048576).toFixed(1)} MB
            </a>
            <Button variant="ghost" size="sm" onClick={p.onDescartarResultado}>
              Descartar este vídeo
            </Button>
          </div>
        </section>
      }

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden" aria-label="Pré-visualização da apresentação">
          <div ref={areaRef} className="bg-gray-900 flex justify-center p-4">
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
                `Preparando a narração (${(p.preparandoNarracoes?.feitas || 0) + 1} de ${p.preparandoNarracoes?.total})...` :
                'Carregando a demonstração...'}
                </div>
              }
              {estado === 'parado' && !preparando &&
              <button
                type="button"
                onClick={() => tocarDe(indice)}
                className="absolute inset-0 flex items-center justify-center group"
                aria-label="Assistir à apresentação">
                
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
                    title={c.titulo}
                    aria-label={`Ir para ${c.titulo}`}
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
              <p className="text-sm font-medium text-gray-900 truncate">{cena?.titulo}</p>
              <p className="text-xs text-gray-500 tabular-nums">
                {minSeg(decorridoAntes + (emExecucao ? tempo : 0))} / {minSeg(total)}
              </p>
            </div>
          </div>

          {/* Capítulos (somente leitura) */}
          <div className="border-t border-gray-100 px-5 py-4">
            <h2 className="text-sm font-medium text-gray-900">O que a apresentação mostra</h2>
            <ol className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
              {p.cenas.map((c, i) =>
              <li key={c.id}>
                  <button
                  type="button"
                  onClick={() => pularPara(i)}
                  className={`w-full flex items-center justify-between gap-3 py-1.5 text-left text-sm rounded transition-colors ${
                  i === indice ? 'text-teal-700 font-medium' : 'text-gray-700 hover:text-gray-900'}`
                  }>
                  
                    <span className="truncate">{c.titulo}</span>
                    <span className="text-xs text-gray-400 tabular-nums shrink-0">{minSeg(duracoes[i])}</span>
                  </button>
                </li>
              )}
            </ol>
          </div>
        </section>

        <aside className="space-y-6 xl:sticky xl:top-0">
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4" aria-labelledby="titulo-ajustes">
            <h2 id="titulo-ajustes" className="font-semibold text-gray-900">
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
                disabled={emExecucao}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 ${
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

            <div className="pt-3 border-t border-gray-100 space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={p.legendas} onChange={(e) => p.setLegendas(e.target.checked)} className="rounded accent-teal-600" />
                Legendas
              </label>
              <p className="text-xs text-gray-500">{p.infoNarracao}</p>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5" aria-label="Áudio">
            <ControlesAudio
              audio={p.audio}
              setAudio={p.setAudio}
              musicaSistemaUrl={p.musicaSistemaUrl}
              musicaArquivo={p.musicaArquivo}
              onEscolherArquivo={p.onEscolherMusica}
              onRemoverArquivo={p.onRemoverMusica}
              musica={p.musicaEscolhida}
              temNarracao={Object.keys(p.urls).length > 0 || p.pendentes > 0}
              desabilitado={emExecucao} />
            
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3" aria-labelledby="titulo-gerar">
            <h2 id="titulo-gerar" className="font-semibold text-gray-900">
              Gerar MP4
            </h2>
            {assistido ?
            <p className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2Icon className="w-4 h-4" aria-hidden="true" /> Pré-visualização assistida até o fim.
              </p> :

            <p className="text-sm text-gray-600">Assista à pré-visualização do início ao fim. O vídeo sai exatamente igual.</p>
            }
            <Button className="w-full" disabled={!assistido || emExecucao || preparando || !p.extensaoGravacao} onClick={p.onGravar}>
              <VideoIcon className="w-4 h-4 mr-1.5 inline" aria-hidden="true" /> Gerar MP4
            </Button>
            {p.extensaoGravacao === 'webm' &&
            <p className="text-xs text-gray-500">
                Este navegador grava em WebM; ao terminar, o servidor converte para MP4 automaticamente.
              </p>
            }
            {!p.extensaoGravacao &&
            <p className="text-xs text-red-700">Este navegador não tem gravador de vídeo (MediaRecorder). Use o Chrome ou o Edge atualizado.</p>
            }
            {p.extensaoGravacao && p.modoGravacao.modo === 'compativel' &&
            <p className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <AlertTriangleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Gravação em modo compatível: {p.modoGravacao.motivo} O vídeo é montado quadro a quadro pelo próprio sistema, com a mesma narração e música.
                </span>
              </p>
            }
            <p className="text-xs text-gray-500">
              A gravação leva o mesmo tempo da apresentação ({minSeg(total)}).
              {p.modoGravacao.modo === 'aba' &&
              <>
                  {' '}Quando o navegador perguntar, escolha <strong>Esta aba</strong>.
                </>
              }
            </p>
          </section>
        </aside>
      </div>

      {erro &&
      <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {erro}
        </p>
      }
    </div>);

}