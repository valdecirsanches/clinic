import { useEffect, useRef, useState } from 'react';
import { Volume2Icon, SaveIcon, Loader2Icon, SquareIcon, RefreshCwIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../hooks/useToast';
import { esquecerConfigAjudaVoz } from '../../hooks/useAjudaVoz';

// ==================== AJUDA POR VOZ — CONFIGURAÇÃO (SUPER ADMIN) ====================
// Liga a narração da ajuda das telas e escolhe a voz da ElevenLabs.
// A chave da ElevenLabs fica no servidor (ELEVENLABS_API_KEY no .env.local).

interface Voz {
  id: string;
  nome: string;
  genero: string | null;
  sotaque: string | null;
  categoria: string | null;
}

interface Ajustes {
  estabilidade: number;
  similaridade: number;
  estilo: number;
  velocidade: number;
}

interface ConfigVoz {
  ativo: boolean;
  vozId: string;
  vozNome: string;
  ajustes: Ajustes;
}

const BASE = `${API_BASE_URL}/api/ajuda-voz`;

async function erroDe(r: Response): Promise<Error> {
  const dados = await r.json().catch(() => null);
  return new Error(dados?.error || `Falha (HTTP ${r.status}).`);
}

function enviar(caminho: string, corpo: unknown) {
  // text/plain evita o preflight que o proxy não repassa (mesmo padrão das outras telas)
  return fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(corpo)
  });
}

function descreverVoz(v: Voz) {
  const genero = v.genero === 'female' ? 'feminina' : v.genero === 'male' ? 'masculina' : '';
  return [v.nome, genero, v.sotaque].filter(Boolean).join(' · ');
}

export function AjudaVozConfig() {
  const { success, error } = useToast();
  const [carregando, setCarregando] = useState(true);
  const [chaveConfigurada, setChaveConfigurada] = useState(false);
  const [config, setConfig] = useState<ConfigVoz | null>(null);
  const [salvo, setSalvo] = useState<string>('');
  const [vozes, setVozes] = useState<Voz[]>([]);
  const [erroVozes, setErroVozes] = useState('');
  const [testando, setTestando] = useState<'nao' | 'carregando' | 'tocando'>('nao');
  const [salvando, setSalvando] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const carregarVozes = async (atualizar = false) => {
    setErroVozes('');
    try {
      const r = await fetch(`${BASE}/vozes${atualizar ? '?atualizar=1' : ''}`);
      if (!r.ok) throw await erroDe(r);
      setVozes(await r.json());
    } catch (e: any) {
      setErroVozes(e.message);
    }
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${BASE}/admin`);
        if (!r.ok) throw await erroDe(r);
        const dados = await r.json();
        if (!vivo) return;
        if (!dados?.config) throw new Error('Configuração da ajuda por voz indisponível.');
        setConfig(dados.config);
        setSalvo(JSON.stringify(dados.config));
        setChaveConfigurada(Boolean(dados.elevenLabs?.configurado));
        if (dados.elevenLabs?.configurado) await carregarVozes();
      } catch (e: any) {
        if (vivo) setErroVozes(e.message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
      audioRef.current?.pause();
    };
  }, []);

  const alterar = (parcial: Partial<ConfigVoz>) => setConfig((c) => c ? { ...c, ...parcial } : c);
  const alterarAjuste = (campo: keyof Ajustes, valor: number) =>
  setConfig((c) => c ? { ...c, ajustes: { ...c.ajustes, [campo]: valor } } : c);

  const pararTeste = () => {
    audioRef.current?.pause();
    setTestando('nao');
  };

  const testar = async () => {
    if (!config?.vozId) return;
    pararTeste();
    setTestando('carregando');
    try {
      const r = await enviar('/teste', { vozId: config.vozId, ajustes: config.ajustes });
      if (!r.ok) throw await erroDe(r);
      const url = URL.createObjectURL(await r.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setTestando('nao');
        URL.revokeObjectURL(url);
      };
      await audio.play();
      setTestando('tocando');
    } catch (e: any) {
      setTestando('nao');
      error('Não foi possível testar a voz', e.message);
    }
  };

  const salvar = async () => {
    if (!config) return;
    if (config.ativo && !config.vozId) {
      error('Escolha uma voz', 'Selecione a voz antes de ativar a ajuda por voz.');
      return;
    }
    setSalvando(true);
    try {
      const r = await enviar('/admin', config);
      if (!r.ok) throw await erroDe(r);
      const dados = await r.json();
      setConfig(dados.config);
      setSalvo(JSON.stringify(dados.config));
      esquecerConfigAjudaVoz();
      success(
        'Ajuda por voz salva',
        dados.config.ativo ?
        `A ajuda das telas será narrada com a voz ${dados.config.vozNome || 'escolhida'}.` :
        'A ajuda continua disponível em texto, sem narração.'
      );
    } catch (e: any) {
      error('Erro ao salvar', e.message);
    } finally {
      setSalvando(false);
    }
  };

  const alterado = config && JSON.stringify(config) !== salvo;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
          <Volume2Icon className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Ajuda por voz</h3>
          <p className="text-sm text-gray-500">
            Narração da ajuda de cada tela (botão “?” no cabeçalho ou tecla F1), com voz da ElevenLabs
          </p>
        </div>
      </div>

      {carregando || !config ?
      <p className="text-sm text-gray-500 py-4">{erroVozes || 'Carregando...'}</p> :
      !chaveConfigurada ?
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          A narração precisa da chave <code>ELEVENLABS_API_KEY</code> no <code>server/.env.local</code>{' '}
          (a mesma usada no Vídeo de Demonstração). Defina a chave e reinicie o servidor. Enquanto isso, a
          ajuda continua disponível em texto para todos.
        </div> :

      <div className="space-y-5">
          {/* Ligar / desligar */}
          <label className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
            <span>
              <span className="block font-medium text-gray-900">Narrar a ajuda das telas</span>
              <span className="block text-sm text-gray-500">
                {config.ativo ?
              'Os usuários veem o botão “Ouvir explicação” na ajuda.' :
              'A ajuda aparece só em texto.'}
              </span>
            </span>
            <input
            type="checkbox"
            checked={config.ativo}
            onChange={(e) => alterar({ ativo: e.target.checked })}
            className="h-5 w-5 accent-teal-600" />

          </label>

          {/* Voz */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ajuda-voz-select" className="text-sm font-medium text-gray-700">
                Voz
              </label>
              <button
              type="button"
              onClick={() => carregarVozes(true)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-teal-700">

                <RefreshCwIcon className="h-3 w-3" /> Atualizar lista
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
              id="ajuda-voz-select"
              value={config.vozId}
              onChange={(e) => {
                const v = vozes.find((x) => x.id === e.target.value);
                pararTeste();
                alterar({ vozId: e.target.value, vozNome: v?.nome || '' });
              }}
              className="flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30">

                <option value="">Selecione a voz…</option>
                {config.vozId && !vozes.some((v) => v.id === config.vozId) &&
              <option value={config.vozId}>{config.vozNome || config.vozId}</option>
              }
                {vozes.map((v) =>
              <option key={v.id} value={v.id}>
                    {descreverVoz(v)}
                  </option>
              )}
              </select>
              {testando === 'tocando' ?
            <Button variant="secondary" onClick={pararTeste}>
                  <SquareIcon className="w-4 h-4 mr-2" /> Parar
                </Button> :

            <Button variant="secondary" onClick={testar} disabled={!config.vozId || testando === 'carregando'}>
                  {testando === 'carregando' ?
              <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> :
              <Volume2Icon className="w-4 h-4 mr-2" />}
                  Ouvir
                </Button>
            }
            </div>
            {erroVozes && <p className="mt-1 text-xs text-red-600">{erroVozes}</p>}
            <p className="mt-1 text-xs text-gray-500">
              É também a voz das respostas do assistente de voz. Para a melhor pronúncia em português, prefira vozes multilíngues ou vozes brasileiras da sua conta.
            </p>
          </div>

          {/* Ajustes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Controle
            rotulo="Velocidade"
            valor={config.ajustes.velocidade}
            min={0.7}
            max={1.2}
            passo={0.05}
            formatar={(v) => `${v.toFixed(2).replace('.', ',')}×`}
            onChange={(v) => alterarAjuste('velocidade', v)} />

            <Controle
            rotulo="Estabilidade"
            dica="Mais alto = fala mais uniforme; mais baixo = mais expressiva"
            valor={config.ajustes.estabilidade}
            min={0}
            max={1}
            passo={0.05}
            formatar={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => alterarAjuste('estabilidade', v)} />

          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">
              Cada explicação é gerada uma vez e guardada no servidor. Trocar a voz ou os ajustes gera novos
              áudios conforme forem ouvidos.
            </p>
            <Button onClick={salvar} disabled={salvando || !alterado}>
              {salvando ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <SaveIcon className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </div>
      }
    </Card>);

}

function Controle({
  rotulo,
  dica,
  valor,
  min,
  max,
  passo,
  formatar,
  onChange






}: {rotulo: string;dica?: string;valor: number;min: number;max: number;passo: number;formatar: (v: number) => string;onChange: (v: number) => void;}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm font-medium text-gray-700">
        {rotulo}
        <span className="text-xs font-normal text-gray-500">{formatar(valor)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-teal-600" />

      {dica && <span className="block text-xs text-gray-400 mt-1">{dica}</span>}
    </label>);

}
