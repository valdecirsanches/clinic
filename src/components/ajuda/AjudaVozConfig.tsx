import { useEffect, useRef, useState } from 'react';
import { Volume2Icon, SaveIcon, Loader2Icon, SquareIcon, RefreshCwIcon, PlayIcon, CheckIcon } from 'lucide-react';
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
  /** Amostra pronta da ElevenLabs (toca sem gastar créditos). */
  previewUrl?: string | null;
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
  /** Voz que está tocando (ou carregando) e erro do último teste. */
  const [vozTocando, setVozTocando] = useState<string | null>(null);
  const [erroTeste, setErroTeste] = useState('');
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
    setVozTocando(null);
  };

  const tocar = async (url: string, liberar?: () => void) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setTestando('nao');
      setVozTocando(null);
      liberar?.();
    };
    await audio.play();
    setTestando('tocando');
  };

  /**
   * Ouve uma voz. Com amostra pronta da ElevenLabs e sem pedir os ajustes,
   * toca a amostra (sem custo); senão o servidor gera a frase de teste com
   * os ajustes atuais.
   */
  const testar = async (voz: {id: string;previewUrl?: string | null;}, comAjustes = false) => {
    if (!config || !voz.id) return;
    audioRef.current?.pause();
    setErroTeste('');
    setVozTocando(voz.id);
    setTestando('carregando');
    try {
      if (voz.previewUrl && !comAjustes) {
        try {
          await tocar(voz.previewUrl);
          return;
        } catch {/* amostra indisponível: gera pelo servidor */}
      }
      const r = await enviar('/teste', { vozId: voz.id, ajustes: config.ajustes });
      if (!r.ok) throw await erroDe(r);
      const url = URL.createObjectURL(await r.blob());
      await tocar(url, () => URL.revokeObjectURL(url));
    } catch (e: any) {
      setTestando('nao');
      setVozTocando(null);
      const motivo = e?.name === 'NotAllowedError' ? 'O navegador bloqueou o som. Clique de novo.' : e?.message || 'Falha ao tocar.';
      setErroTeste(motivo);
      error('Não foi possível ouvir a voz', motivo);
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
            Narração da ajuda e do tour de cada tela (botão “Ajuda” no topo ou tecla F1), com voz da ElevenLabs
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

          {/* Voz: lista com ▶ em cada uma */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">
                Voz {config.vozNome && <span className="font-normal text-gray-500">— escolhida: {config.vozNome}</span>}
              </span>
              <button
              type="button"
              onClick={() => carregarVozes(true)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-teal-700">
              
                <RefreshCwIcon className="h-3 w-3" /> Atualizar lista
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Clique em <PlayIcon className="inline h-3 w-3" /> para ouvir e em “Usar esta” para escolher.
            </p>
            <ul role="radiogroup" aria-label="Vozes" className="max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
              {vozes.map((v) => {
              const escolhida = config.vozId === v.id;
              const tocandoEsta = vozTocando === v.id;
              return (
                <li key={v.id} className={`flex items-center gap-3 px-3 py-2 ${escolhida ? 'bg-teal-50' : ''}`}>
                    <button
                    type="button"
                    onClick={() => tocandoEsta && testando === 'tocando' ? pararTeste() : testar(v)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-teal-600 text-teal-700 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    aria-label={tocandoEsta ? `Parar ${v.nome}` : `Ouvir ${v.nome}`}
                    title={tocandoEsta ? 'Parar' : 'Ouvir'}>
                    
                      {tocandoEsta && testando === 'carregando' ?
                    <Loader2Icon className="h-4 w-4 animate-spin" /> :
                    tocandoEsta && testando === 'tocando' ?
                    <SquareIcon className="h-3.5 w-3.5" /> :
                    <PlayIcon className="h-4 w-4" />}
                    </button>
                    <span className="min-w-0 flex-1 text-sm text-gray-800">{descreverVoz(v)}</span>
                    <button
                    type="button"
                    role="radio"
                    aria-checked={escolhida}
                    onClick={() => alterar({ vozId: v.id, vozNome: v.nome })}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${escolhida ? 'bg-teal-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    
                      {escolhida ? <><CheckIcon className="h-3.5 w-3.5" /> Escolhida</> : 'Usar esta'}
                    </button>
                  </li>);

            })}
              {!vozes.length &&
            <li className="px-3 py-3 text-sm text-gray-500">{erroVozes ? 'Lista de vozes indisponível.' : 'Carregando vozes…'}</li>
            }
            </ul>
            {erroVozes && <p className="mt-1 text-xs text-red-600">{erroVozes}</p>}
            {erroTeste && <p role="alert" className="mt-1 text-xs text-red-600">Não foi possível ouvir: {erroTeste}</p>}
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

          {config.vozId &&
          <div>
              <Button
              variant="secondary"
              onClick={() => vozTocando === config.vozId && testando === 'tocando' ? pararTeste() : testar({ id: config.vozId }, true)}
              disabled={testando === 'carregando'}>
              
                {testando === 'carregando' && vozTocando === config.vozId ?
              <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> :
              <Volume2Icon className="w-4 h-4 mr-2" />}
                Ouvir a voz escolhida com estes ajustes
              </Button>
            </div>
          }

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">
              Cada explicação é gerada uma vez e guardada no servidor. Trocar a voz ou os ajustes gera novos
              áudios conforme forem ouvidos.
            </p>
            {alterado && <span className="text-xs font-medium text-amber-700">Alterações não salvas</span>}
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
