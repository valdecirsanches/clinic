import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangleIcon, LoaderIcon } from 'lucide-react';
import { PalcoGravacao } from '../components/videoDemo/PalcoGravacao';
import type { FormatoDemo } from '../components/videoDemo/PalcoDemo';
import { PlayerApresentacao, type ResultadoVideo } from '../components/videoDemo/PlayerApresentacao';
import { ROTEIRO_APRESENTACAO } from '../data/demoRoteiro';
import { useVideoDemo, type AjustesVoz, type StatusVideoDemo, type VozElevenLabs } from '../hooks/useVideoDemo';
import { useNarracoesDemo } from '../hooks/useNarracoesDemo';
import { duracaoCena } from '../utils/reprodutorDemo';
import { musicaDeFundo } from '../utils/musicaDemo';
import { diagnosticarGravacao, escolherFormato } from '../utils/gravadorDemo';
import { converterParaMp4 } from '../utils/converterMp4';
import { apagarMusica, lerMusica, salvarMusica } from '../utils/musicaSalva';
import type { AjustesAudio, MusicaEscolhida } from '../types/videoDemo';

const CHAVE_PREFS = 'videoDemo.apresentacao';
/** Ajustes fixos: voz natural e estável para apresentação */
const AJUSTES_VOZ: AjustesVoz = { estabilidade: 0.55, similaridade: 0.75, estilo: 0.15, velocidade: 1 };

interface Prefs {
  formato: FormatoDemo;
  legendas: boolean;
  audio: AjustesAudio;
}

const AUDIO_PADRAO: AjustesAudio = { musicaAtiva: true, volumeMusica: 0.2, volumeNarracao: 1, abaixarNaFala: true, suavizar: true };

function lerPrefs(): Prefs {
  const padrao: Prefs = { formato: 'desktop', legendas: true, audio: AUDIO_PADRAO };
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_PREFS) || 'null');
    if (!bruto) return padrao;
    // Compatível com as preferências da versão anterior (musicaAtiva/volumeMusica soltos)
    const audio: AjustesAudio = {
      ...AUDIO_PADRAO,
      ...(typeof bruto.musicaAtiva === 'boolean' ? { musicaAtiva: bruto.musicaAtiva } : {}),
      ...(typeof bruto.volumeMusica === 'number' ? { volumeMusica: bruto.volumeMusica } : {}),
      ...(bruto.audio || {})
    };
    return { formato: bruto.formato || padrao.formato, legendas: bruto.legendas ?? true, audio };
  } catch {
    return padrao;
  }
}

/** Voz em português quando a conta tiver; senão, a primeira da lista */
function escolherVoz(lista: VozElevenLabs[]): VozElevenLabs | null {
  return lista.find((v) => /portug|brazil|brasil|pt-br/i.test(`${v.sotaque || ''} ${v.nome}`)) || lista[0] || null;
}

/** Só precisa de MediaRecorder: sem captura de tela, grava em modo compatível */
function extensaoSuportada(): 'mp4' | 'webm' | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return escolherFormato().extensao;
}

const cenas = ROTEIRO_APRESENTACAO;

export function VideoDemoPage() {
  const api = useVideoDemo();
  const prefs = useMemo(lerPrefs, []);
  const [status, setStatus] = useState<StatusVideoDemo | null>(null);
  const [voz, setVoz] = useState<VozElevenLabs | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [formato, setFormato] = useState<FormatoDemo>(prefs.formato);
  const [legendas, setLegendas] = useState(prefs.legendas);
  const [audio, setAudio] = useState<AjustesAudio>(prefs.audio);
  const [musicaSistemaUrl, setMusicaSistemaUrl] = useState<string | null>(null);
  const [musicaArquivo, setMusicaArquivo] = useState<MusicaEscolhida | null>(null);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoVideo | null>(null);
  const [convertendo, setConvertendo] = useState(false);
  const extensao = useMemo(extensaoSuportada, []);
  const modoGravacao = useMemo(diagnosticarGravacao, []);

  const musicaEscolhida: MusicaEscolhida | null =
  musicaArquivo || (musicaSistemaUrl ? { origem: 'sistema', nome: 'Trilha do sistema', url: musicaSistemaUrl } : null);

  const mostrarResultado = (blob: Blob, ext: string) => {
    setResultado((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior.url);
      return { url: URL.createObjectURL(blob), extensao: ext, tamanho: blob.size };
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Navegador que só grava WebM: o servidor converte para MP4 */
  const finalizarVideo = async (blob: Blob, ext: 'mp4' | 'webm') => {
    if (ext === 'mp4') return mostrarResultado(blob, 'mp4');
    setConvertendo(true);
    setErroGeral(null);
    try {
      mostrarResultado(await converterParaMp4(blob), 'mp4');
    } catch (e) {
      // Não perde a gravação: entrega o WebM e explica por que não virou MP4
      mostrarResultado(blob, 'webm');
      setErroGeral(`O vídeo foi gravado, mas não virou MP4: ${(e as Error).message} O arquivo WebM está disponível para baixar.`);
    } finally {
      setConvertendo(false);
    }
  };

  const narracoes = useNarracoesDemo(api.narracao, voz?.id || '', AJUSTES_VOZ, cenas);
  const vozDisponivel = Boolean(status?.elevenLabs.configurado && voz);

  useEffect(() => {
    musicaDeFundo().
    then(setMusicaSistemaUrl).
    catch(() => undefined);
    // Música escolhida numa visita anterior
    lerMusica().then((salva) => {
      if (salva) setMusicaArquivo({ origem: 'arquivo', nome: salva.nome, url: URL.createObjectURL(salva.blob) });
    });
  }, []);

  const escolherMusica = (arquivo: File) => {
    setMusicaArquivo((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior.url);
      return { origem: 'arquivo', nome: arquivo.name, url: URL.createObjectURL(arquivo) };
    });
    setAudio((a) => ({ ...a, musicaAtiva: true }));
    salvarMusica(arquivo).catch(() => undefined);
  };

  const removerMusica = () => {
    setMusicaArquivo((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior.url);
      return null;
    });
    apagarMusica();
  };

  useEffect(() => {
    api.
    status().
    then((s) => {
      setStatus(s);
      if (s.elevenLabs.configurado) return api.vozes().then((lista) => setVoz(escolherVoz(lista)));
    }).
    catch((e: Error) => setErroGeral(`Narração indisponível: ${e.message}`));
  }, [api]);

  useEffect(() => {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify({ formato, legendas, audio }));
  }, [formato, legendas, audio]);

  const duracoes = useMemo(
    () => Object.fromEntries(Object.entries(narracoes.audios).map(([id, a]) => [id, a.duracao])),
    [narracoes.audios]
  );
  const total = cenas.reduce((s, c) => s + duracaoCena(c, narracoes.urlsAtuais[c.id] ? duracoes[c.id] || 0 : 0), 0);

  const infoNarracao = vozDisponivel ?
  `Narração com a voz "${voz?.nome}" (ElevenLabs), gerada ao dar play pela primeira vez.` :
  status && !status.elevenLabs.configurado ?
  'Sem narração: defina ELEVENLABS_API_KEY no servidor para a apresentação ter voz.' :
  'Carregando a narração...';

  return (
    <main className="w-full min-h-full bg-gray-50 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Apresentação do EasyClin</h1>
          <p className="text-sm text-gray-600 mt-1">
            Todos os recursos do sistema com dados fictícios da Clínica Vida Plena. Assista à pré-visualização e gere o vídeo.
          </p>
        </div>
        <p className="text-sm text-gray-500 tabular-nums">
          {cenas.length} cenas · {Math.floor(total / 60)}min {Math.round(total % 60)}s
        </p>
      </header>

      {convertendo &&
      <p role="status" className="flex items-center gap-2 text-sm text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-3">
          <LoaderIcon className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          Convertendo o vídeo para MP4 no servidor. Isso leva cerca de um minuto; não feche esta página.
        </p>
      }

      {(erroGeral || narracoes.erro) &&
      <p role="alert" className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {erroGeral || narracoes.erro}
        </p>
      }

      <PlayerApresentacao
        cenas={cenas}
        urls={narracoes.urlsAtuais}
        duracoes={duracoes}
        pendentes={vozDisponivel ? narracoes.pendentes.length : 0}
        preparandoNarracoes={narracoes.lote}
        onPrepararNarracoes={narracoes.gerarPendentes}
        infoNarracao={infoNarracao}
        formato={formato}
        setFormato={setFormato}
        legendas={legendas}
        setLegendas={setLegendas}
        audio={audio}
        setAudio={setAudio}
        musicaSistemaUrl={musicaSistemaUrl}
        musicaArquivo={musicaArquivo}
        onEscolherMusica={escolherMusica}
        onRemoverMusica={removerMusica}
        musicaEscolhida={musicaEscolhida}
        extensaoGravacao={extensao}
        modoGravacao={modoGravacao}
        onGravar={() => !convertendo && setGravando(true)}
        resultado={resultado}
        onDescartarResultado={() => {
          if (resultado) URL.revokeObjectURL(resultado.url);
          setResultado(null);
        }} />
      

      {gravando &&
      <PalcoGravacao
        cenas={cenas}
        audios={narracoes.urlsAtuais}
        formato={formato}
        musica={audio.musicaAtiva && musicaEscolhida ? { url: musicaEscolhida.url, volume: audio.volumeMusica } : null}
        volumeNarracao={audio.volumeNarracao}
        abaixarNaFala={audio.abaixarNaFala}
        suavizar={audio.suavizar}
        mostrarLegendas={legendas}
        onFechar={() => setGravando(false)}
        onFim={(video, msg) => {
          setGravando(false);
          if (msg) setErroGeral(msg);
          if (video) void finalizarVideo(video.blob, video.extensao);
        }} />

      }
    </main>);

}