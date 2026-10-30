import React, { useRef, useState } from 'react';
import { CheckCircle2Icon, ChevronDownIcon, LoaderIcon, PauseIcon, PlayIcon, Volume2Icon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CenaDemo } from '../../data/demoRoteiro';
import type { AjustesVoz, VozElevenLabs } from '../../hooks/useVideoDemo';
import type { AudioCena } from '../../hooks/useNarracoesDemo';

interface EtapaNarracaoProps {
  configurado: boolean;
  vozes: VozElevenLabs[];
  voiceId: string;
  setVoiceId: (id: string) => void;
  ajustes: AjustesVoz;
  setAjustes: React.Dispatch<React.SetStateAction<AjustesVoz>>;
  cenas: CenaDemo[];
  audios: Record<string, AudioCena>;
  atualizado: (c: CenaDemo) => boolean;
  gerando: string | null;
  lote: {feitas: number;total: number;} | null;
  pendentes: number;
  onGerar: (c: CenaDemo) => void;
  onGerarTodas: () => void;
  onContinuar: () => void;
}

function Controle({
  rotulo,
  valor,
  min,
  max,
  passo,
  formato,
  onChange








}: {rotulo: string;valor: number;min: number;max: number;passo: number;formato: (v: number) => string;onChange: (v: number) => void;}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm text-gray-700">
        {rotulo}
        <span className="tabular-nums text-gray-500">{formato(valor)}</span>
      </span>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-teal-600" />
    </label>);

}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function EtapaNarracao(p: EtapaNarracaoProps) {
  const [avancado, setAvancado] = useState(false);
  const [tocando, setTocando] = useState<string | null>(null);
  const tocadorRef = useRef<HTMLAudioElement | null>(null);
  const voz = p.vozes.find((v) => v.id === p.voiceId);

  const ouvir = (id: string, url: string) => {
    tocadorRef.current?.pause();
    if (tocando === id) return setTocando(null);
    const a = new Audio(url);
    a.onended = () => setTocando(null);
    a.play().catch(() => setTocando(null));
    tocadorRef.current = a;
    setTocando(id);
  };

  if (!p.configurado) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <p className="text-sm text-gray-700">
          A narração por voz precisa da chave <code>ELEVENLABS_API_KEY</code> no <code>server/.env.local</code> (reinicie o
          backend depois de definir).
        </p>
        <p className="text-sm text-gray-500">Sem ela, o vídeo é gerado só com legendas e a música de fundo.</p>
        <Button onClick={p.onContinuar}>Continuar sem narração</Button>
      </div>);

  }

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
      {/* Voz */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4" aria-labelledby="titulo-voz">
        <h2 id="titulo-voz" className="font-semibold text-gray-900">
          Voz
        </h2>
        <select
          value={p.voiceId}
          onChange={(e) => p.setVoiceId(e.target.value)}
          disabled={!p.vozes.length}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Voz da narração">
          
          {!p.vozes.length && <option value="">Carregando vozes...</option>}
          {p.vozes.map((v) =>
          <option key={v.id} value={v.id}>
              {v.nome}
              {v.genero ? ` · ${v.genero === 'female' ? 'feminina' : v.genero === 'male' ? 'masculina' : v.genero}` : ''}
            </option>
          )}
        </select>
        {voz?.previewUrl && <audio controls src={voz.previewUrl} className="w-full h-9" aria-label={`Amostra da voz ${voz.nome}`} />}
        <Controle rotulo="Velocidade da fala" valor={p.ajustes.velocidade} min={0.7} max={1.2} passo={0.05} formato={(v) => `${v.toFixed(2)}×`} onChange={(v) => p.setAjustes((a) => ({ ...a, velocidade: v }))} />

        <button
          type="button"
          onClick={() => setAvancado((v) => !v)}
          aria-expanded={avancado}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          
          <ChevronDownIcon className={`w-4 h-4 transition-transform duration-150 ${avancado ? 'rotate-180' : ''}`} aria-hidden="true" />
          Ajustes finos da voz
        </button>
        {avancado &&
        <div className="space-y-4 pt-1">
            <Controle rotulo="Estabilidade" valor={p.ajustes.estabilidade} min={0} max={1} passo={0.05} formato={pct} onChange={(v) => p.setAjustes((a) => ({ ...a, estabilidade: v }))} />
            <Controle rotulo="Fidelidade à voz" valor={p.ajustes.similaridade} min={0} max={1} passo={0.05} formato={pct} onChange={(v) => p.setAjustes((a) => ({ ...a, similaridade: v }))} />
            <Controle rotulo="Expressividade" valor={p.ajustes.estilo} min={0} max={1} passo={0.05} formato={pct} onChange={(v) => p.setAjustes((a) => ({ ...a, estilo: v }))} />
          </div>
        }
        <p className="text-xs text-gray-500">Mudar a voz ou os ajustes pede para gerar as narrações de novo.</p>
      </section>

      {/* Narrações */}
      <section className="bg-white border border-gray-200 rounded-lg" aria-labelledby="titulo-narracoes">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div>
            <h2 id="titulo-narracoes" className="font-semibold text-gray-900">
              Narrações
            </h2>
            <p className="text-sm text-gray-500">
              {p.lote ?
              `Gerando ${p.lote.feitas + 1} de ${p.lote.total}...` :
              p.pendentes ?
              `${p.pendentes} cena(s) sem narração atualizada.` :
              'Todas as narrações estão prontas.'}
            </p>
          </div>
          <Button variant="secondary" disabled={!p.pendentes || !!p.gerando || !p.voiceId} onClick={p.onGerarTodas}>
            {p.lote ? <LoaderIcon className="w-4 h-4 mr-1.5 inline animate-spin" aria-hidden="true" /> : <Volume2Icon className="w-4 h-4 mr-1.5 inline" aria-hidden="true" />}
            {p.pendentes ? `Gerar ${p.pendentes === 1 ? 'a narração' : `as ${p.pendentes} narrações`}` : 'Tudo pronto'}
          </Button>
        </div>
        <ol className="divide-y divide-gray-100">
          {p.cenas.map((c, i) => {
            const audio = p.audios[c.id];
            const ok = p.atualizado(c);
            return (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                <span className="text-sm tabular-nums text-gray-400 w-5 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.titulo}</p>
                  <p className="text-xs text-gray-500 truncate">{c.narracao || 'Sem texto — a cena fica em silêncio.'}</p>
                </div>
                {!c.narracao.trim() ? null : p.gerando === c.id ?
                <span className="flex items-center gap-1 text-xs text-gray-500">
                    <LoaderIcon className="w-4 h-4 animate-spin" aria-hidden="true" /> Gerando
                  </span> :
                ok ?
                <>
                    <CheckCircle2Icon className="w-4 h-4 text-green-600 shrink-0" aria-label="Narração pronta" />
                    <button type="button" onClick={() => ouvir(c.id, audio.url)} className="flex items-center gap-1 text-sm text-teal-700 hover:underline shrink-0 whitespace-nowrap">
                      {tocando === c.id ? <PauseIcon className="w-4 h-4" aria-hidden="true" /> : <PlayIcon className="w-4 h-4" aria-hidden="true" />}
                      Ouvir · {audio.duracao.toFixed(0)}s
                    </button>
                  </> :

                <button
                  type="button"
                  onClick={() => p.onGerar(c)}
                  disabled={!!p.gerando || !p.voiceId}
                  className="text-sm text-teal-700 hover:underline disabled:opacity-40 shrink-0 whitespace-nowrap">
                  
                    {audio ? 'Texto mudou · gerar de novo' : 'Gerar'}
                  </button>
                }
              </li>);

          })}
        </ol>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
          <Button onClick={p.onContinuar}>Continuar para a pré-visualização</Button>
        </div>
      </section>
    </div>);

}