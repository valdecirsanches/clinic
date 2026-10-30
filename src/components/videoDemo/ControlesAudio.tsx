import React, { useEffect, useRef, useState } from 'react';
import { MusicIcon, PauseIcon, PlayIcon, UploadIcon, Volume2Icon, VolumeXIcon, XIcon } from 'lucide-react';
import type { AjustesAudio, MusicaEscolhida } from '../../types/videoDemo';

interface ControlesAudioProps {
  audio: AjustesAudio;
  setAudio: (a: AjustesAudio) => void;
  /** Trilha composta pelo sistema (null enquanto prepara) */
  musicaSistemaUrl: string | null;
  musicaArquivo: MusicaEscolhida | null;
  onEscolherArquivo: (arquivo: File) => void;
  onRemoverArquivo: () => void;
  /** Música efetivamente usada */
  musica: MusicaEscolhida | null;
  temNarracao: boolean;
  desabilitado: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Escolha da música de fundo e controles de volume da apresentação */
export function ControlesAudio(p: ControlesAudioProps) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const ouvirRef = useRef<HTMLAudioElement>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState('');
  const set = (parcial: Partial<AjustesAudio>) => p.setAudio({ ...p.audio, ...parcial });

  // Para a amostra se a música trocar
  useEffect(() => {
    ouvirRef.current?.pause();
    setOuvindo(false);
  }, [p.musica?.url]);

  useEffect(() => {
    if (ouvirRef.current) ouvirRef.current.volume = p.audio.volumeMusica;
  }, [p.audio.volumeMusica]);

  const alternarAmostra = () => {
    const el = ouvirRef.current;
    if (!el) return;
    if (ouvindo) {
      el.pause();
      setOuvindo(false);
    } else {
      el.volume = p.audio.volumeMusica;
      el.play().then(() => setOuvindo(true)).catch(() => setOuvindo(false));
    }
  };

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('audio/')) {
      setErroArquivo('Escolha um arquivo de áudio (MP3, WAV, M4A ou OGG).');
      return;
    }
    if (arquivo.size > 30 * 1048576) {
      setErroArquivo('O arquivo passa de 30 MB. Escolha uma música menor.');
      return;
    }
    setErroArquivo('');
    p.onEscolherArquivo(arquivo);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900">Música de fundo</h3>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={p.audio.musicaAtiva}
            onChange={(e) => set({ musicaAtiva: e.target.checked })}
            disabled={p.desabilitado || !p.musica}
            className="rounded accent-teal-600" />
          
          Usar
        </label>
      </div>

      <div className="space-y-1.5" role="radiogroup" aria-label="Escolha da música">
        <button
          type="button"
          role="radio"
          aria-checked={p.musica?.origem === 'sistema'}
          disabled={p.desabilitado || !p.musicaSistemaUrl}
          onClick={p.onRemoverArquivo}
          className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left text-sm transition-colors disabled:opacity-50 ${
          p.musica?.origem === 'sistema' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}`
          }>
          
          <MusicIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-gray-900">Trilha do sistema</span>
            <span className="block text-xs text-gray-500">{p.musicaSistemaUrl ? 'Instrumental suave, sem direitos autorais' : 'Preparando...'}</span>
          </span>
        </button>

        {p.musicaArquivo ?
        <div
          role="radio"
          aria-checked={p.musica?.origem === 'arquivo'}
          className="w-full flex items-center gap-2 p-2 rounded-lg border border-teal-500 bg-teal-50 text-sm">
          
            <UploadIcon className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-gray-900 truncate" title={p.musicaArquivo.nome}>
                {p.musicaArquivo.nome}
              </span>
              <span className="block text-xs text-gray-500">Sua música</span>
            </span>
            <button
            type="button"
            onClick={p.onRemoverArquivo}
            disabled={p.desabilitado}
            className="p-1 rounded text-gray-500 hover:bg-white hover:text-gray-800"
            aria-label="Remover música escolhida">
            
              <XIcon className="w-4 h-4" />
            </button>
          </div> :

        <button
          type="button"
          onClick={() => entradaRef.current?.click()}
          disabled={p.desabilitado}
          className="w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-gray-300 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          
            <UploadIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
            Escolher música do computador...
          </button>
        }
        <input ref={entradaRef} type="file" accept="audio/*" className="hidden" onChange={escolher} />
        {erroArquivo && <p className="text-xs text-red-700">{erroArquivo}</p>}
        <p className="text-xs text-gray-500">Use uma música que você tenha direito de usar no vídeo.</p>
      </div>

      {p.musica &&
      <div className="flex items-center gap-2">
          <button
          type="button"
          onClick={alternarAmostra}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          
            {ouvindo ? <PauseIcon className="w-4 h-4" aria-hidden="true" /> : <PlayIcon className="w-4 h-4" aria-hidden="true" />}
            {ouvindo ? 'Parar' : 'Ouvir a música'}
          </button>
          <audio ref={ouvirRef} src={p.musica.url} onEnded={() => setOuvindo(false)} preload="none" />
        </div>
      }

      <div className="space-y-3 pt-3 border-t border-gray-100">
        <ControleVolume
          rotulo="Volume da música"
          valor={p.audio.volumeMusica}
          max={0.8}
          desabilitado={!p.audio.musicaAtiva || !p.musica}
          onChange={(v) => set({ volumeMusica: v })} />
        
        <ControleVolume
          rotulo="Volume da narração"
          valor={p.audio.volumeNarracao}
          max={1}
          desabilitado={!p.temNarracao}
          onChange={(v) => set({ volumeNarracao: v })} />
        
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={p.audio.abaixarNaFala}
            onChange={(e) => set({ abaixarNaFala: e.target.checked })}
            className="mt-0.5 rounded accent-teal-600" />
          
          <span>
            Abaixar a música quando a voz fala
            <span className="block text-xs text-gray-500">Deixa a narração sempre clara.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={p.audio.suavizar}
            onChange={(e) => set({ suavizar: e.target.checked })}
            disabled={p.desabilitado}
            className="mt-0.5 rounded accent-teal-600" />
          
          <span>
            Entrada e saída suaves
            <span className="block text-xs text-gray-500">A música cresce no início e some no final.</span>
          </span>
        </label>
      </div>
    </div>);

}

function ControleVolume({
  rotulo,
  valor,
  max,
  desabilitado,
  onChange






}: {rotulo: string;valor: number;max: number;desabilitado: boolean;onChange: (v: number) => void;}) {
  const mudo = valor === 0;
  return (
    <div className={desabilitado ? 'opacity-50' : ''}>
      <div className="flex items-center justify-between text-sm text-gray-700">
        <span>{rotulo}</span>
        <span className="tabular-nums text-gray-500">{pct(valor)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(mudo ? Math.min(max, 0.3) : 0)}
          disabled={desabilitado}
          className="p-1 rounded text-gray-500 hover:bg-gray-100"
          aria-label={mudo ? `Ativar ${rotulo.toLowerCase()}` : `Silenciar ${rotulo.toLowerCase()}`}>
          
          {mudo ? <VolumeXIcon className="w-4 h-4" /> : <Volume2Icon className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={max}
          step={0.05}
          value={valor}
          disabled={desabilitado}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-teal-600"
          aria-label={rotulo} />
        
      </div>
    </div>);

}