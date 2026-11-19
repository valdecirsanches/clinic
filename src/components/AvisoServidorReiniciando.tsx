import { useEffect, useRef, useState } from 'react';
import { CheckCircle2Icon, Loader2Icon, WifiOffIcon } from 'lucide-react';
import { DEMO_VIDEO } from '../utils/modoDemo';

// ==================== AVISO "ATUALIZANDO O SISTEMA" ====================
// Enquanto a API reinicia (publicação de versão), as chamadas esperam e são
// repetidas sozinhas (utils/autenticacaoApi.ts). Este aviso discreto explica a
// pausa em vez de erros na tela; some quando o servidor volta.

type Estado = 'oculto' | 'aguardando' | 'voltou' | 'desistiu';

/** Só aparece se a espera passar disto (evita piscar em reinícios rápidos). */
const ATRASO_PARA_MOSTRAR = 1500;

export function AvisoServidorReiniciando() {
  const [estado, setEstado] = useState<Estado>('oculto');
  const [semInternet, setSemInternet] = useState(false);
  const timerMostrar = useRef<number>();
  const timerSumir = useRef<number>();
  const visivel = useRef(false);

  useEffect(() => {
    if (DEMO_VIDEO) return;
    const limpar = () => {
      window.clearTimeout(timerMostrar.current);
      window.clearTimeout(timerSumir.current);
    };
    const aoReiniciar = () => {
      limpar();
      setSemInternet(typeof navigator !== 'undefined' && navigator.onLine === false);
      timerMostrar.current = window.setTimeout(() => {
        visivel.current = true;
        setEstado('aguardando');
      }, ATRASO_PARA_MOSTRAR);
    };
    const aoVoltar = () => {
      limpar();
      if (!visivel.current) return; // reinício rápido: nem chegou a aparecer
      setEstado('voltou');
      timerSumir.current = window.setTimeout(() => {
        visivel.current = false;
        setEstado('oculto');
      }, 3000);
    };
    const aoDesistir = () => {
      limpar();
      visivel.current = true;
      setEstado('desistiu');
    };
    window.addEventListener('servidor-reiniciando', aoReiniciar);
    window.addEventListener('servidor-voltou', aoVoltar);
    window.addEventListener('servidor-desistiu', aoDesistir);
    return () => {
      limpar();
      window.removeEventListener('servidor-reiniciando', aoReiniciar);
      window.removeEventListener('servidor-voltou', aoVoltar);
      window.removeEventListener('servidor-desistiu', aoDesistir);
    };
  }, []);

  if (estado === 'oculto') return null;

  const conteudo = {
    aguardando: {
      icone: <Loader2Icon className="h-4 w-4 animate-spin text-teal-600" />,
      texto: semInternet ?
      'Sem internet. Aguardando a conexão voltar…' :
      'Atualizando o sistema… aguarde alguns segundos. Nada do que você está fazendo se perde.',
      cor: 'border-teal-200'
    },
    voltou: {
      icone: <CheckCircle2Icon className="h-4 w-4 text-green-600" />,
      texto: 'Conectado novamente.',
      cor: 'border-green-200'
    },
    desistiu: {
      icone: <WifiOffIcon className="h-4 w-4 text-red-500" />,
      texto: 'O servidor não respondeu. Verifique a internet ou tente de novo em instantes.',
      cor: 'border-red-200'
    }
  }[estado];

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="aviso-servidor-reiniciando"
      className={`fixed bottom-4 left-1/2 z-[85] flex w-[min(520px,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-xl border ${conteudo.cor} bg-white px-4 py-3 text-sm text-gray-800 shadow-2xl`}>

      {conteudo.icone}
      <span className="flex-1">{conteudo.texto}</span>
      {estado === 'desistiu' &&
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700">

          Recarregar
        </button>
      }
    </div>);

}
