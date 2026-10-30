import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  createElement,
  Component } from
'react';
import {
  XIcon,
  VideoIcon,
  VideoOffIcon,
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  Maximize2Icon,
  Minimize2Icon,
  InfoIcon,
  Loader2Icon,
  SendIcon,
  PhoneOffIcon,
  UserIcon } from
'lucide-react';
import { SalaLiveKit } from './SalaLiveKit';
declare global {
  interface Window {
    JitsiMeetExternalAPI?: any;
  }
}
interface ConsultaOnlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** URL determinística da sala de vídeo desta consulta. */
  link: string;
  pacienteNome?: string;
  profissionalNome?: string;
  /**
   * Envia o link da sala ao paciente (WhatsApp da clínica e, se ele não estiver
   * disponível, SMS). Sem o link o paciente não tem como entrar na consulta —
   * por isso a ação fica sempre à mão, dentro da própria sala.
   */
  onConvidarPaciente?: () => Promise<boolean> | void;
  /** Encerra a sala de vídeo desta consulta (não finaliza o prontuário). */
  onEncerrarConsultaOnline?: () => void;
  /** Desfaz a escolha por vídeo: volta o atendimento para presencial. */
  onTrocarParaPresencial?: () => void;
}
type EstadoSala = 'carregando' | 'conectada' | 'falha';
/**
 * ⭐ Consulta Online — janela EMBUTIDA no app (stay-on-top), profissional.
 *
 * A sala de vídeo é montada DENTRO do app usando a API oficial de embed do
 * Jitsi (`external_api.js`). Um <iframe src="..."> simples NÃO funciona porque
 * os provedores públicos de Jitsi enviam `X-Frame-Options`/`frame-ancestors`
 * que BLOQUEIAM a exibição embutida — daí a tela cinza / "falha na conexão". A
 * API externa do Jitsi injeta a sala de um jeito suportado, sem esbarrar nesse
 * bloqueio.
 *
 * ⚠️ NÃO usamos `meet.jit.si` embutido: ele conecta, mas o 8x8 encerra a chamada
 * embutida em 5 min ("apenas para demonstração"). O provedor padrão é uma
 * instância Jitsi aberta (ver config/env.ts), sem esse limite.
 *
 * Se, por qualquer motivo, o embed falhar (script não carrega, provedor fora do
 * ar, timeout), o profissional recebe um fallback claro para abrir a MESMA sala
 * em uma nova aba — nunca fica preso numa tela quebrada.
 *
 * A sala é determinística (mesmo link enviado ao paciente por WhatsApp), então
 * médico e paciente entram exatamente na mesma sala.
 */
export function ConsultaOnlineModal({
  isOpen,
  onClose,
  link,
  pacienteNome,
  profissionalNome,
  onConvidarPaciente,
  onEncerrarConsultaOnline,
  onTrocarParaPresencial
}: ConsultaOnlineModalProps) {
  const [expandido, setExpandido] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [convidando, setConvidando] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [estado, setEstado] = useState<EstadoSala>('carregando');
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  // ⭐ Refs para valores que MUDAM de identidade a cada render do pai (o pai tem
  // um cronômetro de atendimento que re-renderiza a cada segundo). Se estes
  // fossem dependências do efeito de montagem, a sala Jitsi seria destruída e
  // recriada a cada segundo → PISCA e "nunca conecta". Lendo via ref, o efeito
  // roda só quando a sala REALMENTE muda (abrir / trocar de sala / recarregar).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const profissionalNomeRef = useRef(profissionalNome);
  profissionalNomeRef.current = profissionalNome;
  // ⭐ Detecta se o link é do provedor BigBlueButton (endpoint do nosso backend
  // que assina a entrada e redireciona para o cliente BBB). O BBB é embutido via
  // <iframe> simples — NÃO usa a external_api do Jitsi.
  const isBBB = useMemo(() => /\/api\/video\/bbb\//.test(link || ''), [link]);
  // ⭐ LiveKit: o link é a página pública do próprio sistema
  // (/consulta-online/<clinicaId>/<consultaId>). Aqui o profissional não abre
  // essa página — entra direto na sala nativa, como moderador.
  const salaLiveKit = useMemo(() => {
    const m = /\/consulta-online\/([^/?#]+)\/([^/?#]+)/.exec(link || '');
    if (!m) return null;
    return {
      clinicaId: decodeURIComponent(m[1]),
      consultaId: decodeURIComponent(m[2])
    };
  }, [link]);
  // Extrai domínio + nome da sala do link determinístico (formato
  // `https://<dominio>/<sala>`). Feito de forma defensiva — se o link não puder
  // ser interpretado, cai direto no fallback de "abrir em nova aba".
  const parsed = useMemo(() => {
    try {
      const url = new URL(link);
      const room = decodeURIComponent(
        url.pathname.replace(/^\/+/, '').split('/')[0] || ''
      );
      if (!url.hostname || !room) return null;
      return {
        domain: url.hostname,
        room
      };
    } catch {
      return null;
    }
  }, [link]);
  // Fecha com ESC (padrão dos outros modais do app). Lê onClose via ref para não
  // re-anexar o listener a cada render do pai (cronômetro tickando).
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);
  useEffect(() => {
    if (copiado) {
      const t = setTimeout(() => setCopiado(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copiado]);
  // Carrega o external_api.js do domínio da sala (uma única vez por domínio).
  const carregarScript = useCallback((domain: string): Promise<void> => {
    const src = `https://${domain}/external_api.js`;
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    const existente = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existente) {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) return resolve();
        existente.addEventListener('load', () => resolve());
        existente.addEventListener('error', () =>
        reject(new Error('script error'))
        );
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('script error'));
      document.body.appendChild(script);
    });
  }, []);
  // Monta / remonta a sala sempre que abrir, trocar de sala ou pedir recarregar.
  useEffect(() => {
    // BBB é embutido por <iframe> (JSX abaixo); não montamos a external_api aqui.
    // LiveKit tem sala nativa própria — também não usa a external_api do Jitsi.
    if (isBBB || salaLiveKit) return;
    if (!isOpen || !parsed) {
      if (!parsed && isOpen) setEstado('falha');
      return;
    }
    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    setEstado('carregando');
    const montar = async () => {
      try {
        await carregarScript(parsed.domain);
        if (cancelado) return;
        const JitsiMeetExternalAPI = window.JitsiMeetExternalAPI;
        if (!JitsiMeetExternalAPI || !containerRef.current) {
          setEstado('falha');
          return;
        }
        // Limpa instância anterior antes de recriar.
        if (apiRef.current) {
          try {
            apiRef.current.dispose();
          } catch {

            /* ignore */}
          apiRef.current = null;
        }
        containerRef.current.innerHTML = '';
        const nomeProf = profissionalNomeRef.current;
        const api = new JitsiMeetExternalAPI(parsed.domain, {
          roomName: parsed.room,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: nomeProf ?
          {
            displayName: nomeProf
          } :
          undefined,
          configOverwrite: {
            // Entra DIRETO na sala, sem a tela intermediária de "prejoin"/lobby
            // que deixava o médico preso sem conseguir avançar.
            prejoinPageEnabled: false,
            prejoinConfig: {
              enabled: false
            },
            disableDeepLinking: true,
            // Não exige moderador para começar — a sala conecta imediatamente.
            enableLobbyChat: false,
            requireDisplayName: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false
          }
        });
        apiRef.current = api;
        // ⭐ Revela a sala assim que o IFRAME do Jitsi carrega (o médico passa a
        // ver e interagir imediatamente). NÃO esperamos por `videoConferenceJoined`
        // para esconder o overlay — esse evento só dispara depois de entrar, e se a
        // instância mostrar qualquer tela intermediária o médico ficaria preso atrás
        // do overlay ("nunca conecta").
        const revelarSala = () => {
          if (cancelado || apiRef.current !== api) return;
          if (timeoutId) clearTimeout(timeoutId);
          setEstado('conectada');
        };
        // Timeout de segurança: se o iframe NÃO carregar em ~12s (instância fora do
        // ar / bloqueio), mostra o fallback de "abrir em nova aba".
        timeoutId = setTimeout(() => {
          if (!cancelado && apiRef.current === api) setEstado('falha');
        }, 12000);
        try {
          const iframe: HTMLIFrameElement | null =
          typeof api.getIFrame === 'function' ? api.getIFrame() : null;
          if (iframe) {
            iframe.addEventListener('load', revelarSala);
            // Rede de segurança: revela mesmo que o evento 'load' não dispare.
            setTimeout(revelarSala, 2500);
          } else {
            setTimeout(revelarSala, 2500);
          }
        } catch {
          setTimeout(revelarSala, 2500);
        }
        // Sinais de que a sala está viva (redundância defensiva).
        api.addEventListener('videoConferenceJoined', revelarSala);
        api.addEventListener('participantRoleChanged', revelarSala);
        api.addEventListener('readyToClose', () => {
          if (!cancelado) onCloseRef.current?.();
        });
        // Só tratamos como falha erros de CONEXÃO/CONFIG (não erros triviais de UI).
        api.addEventListener('errorOccurred', (e: any) => {
          const tipo = e?.error?.type || e?.type || '';
          const isConnFatal =
          typeof tipo === 'string' && (
          tipo.includes('connection') || tipo.includes('config'));
          if (isConnFatal && !cancelado && apiRef.current === api) {
            setEstado('falha');
          }
        });
      } catch {
        if (!cancelado) setEstado('falha');
      }
    };
    montar();
    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch {

          /* ignore */}
        apiRef.current = null;
      }
    };
    // ⭐ Dependências APENAS de primitivos estáveis: a sala só remonta ao abrir,
    // trocar de domínio/sala, ou pedir recarregar. NÃO depende de onClose nem de
    // profissionalNome (lidos via ref) — evita o loop de destruir/recriar a cada
    // render do pai que causava o "pisca e nunca conecta".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, parsed?.domain, parsed?.room, reloadKey, isBBB, salaLiveKit]);
  // ⭐ BBB: o cliente HTML5 do BigBlueButton, por padrão, NÃO pode ser exibido
  // embutido em outro domínio (envia X-Frame-Options / frame-ancestors e depende
  // de cookies de sessão que os navegadores bloqueiam em iframe de terceiros) →
  // daí a tela "Oops, something went wrong". A forma CONFIÁVEL de entrar é abrir
  // a sala numa JANELA do navegador (onde funciona). Ainda assim oferecemos a
  // opção "tentar exibir aqui dentro" (funciona SE o servidor BBB estiver
  // configurado para permitir framing — ver instruções no chat).
  const [tentarEmbutirBBB, setTentarEmbutirBBB] = useState(false);
  useEffect(() => {
    if (!isBBB || !isOpen) return;
    // Sem embed por padrão → estado "conectada" só para não mostrar overlay.
    if (!tentarEmbutirBBB) setEstado('conectada');else
    setEstado('carregando');
  }, [isBBB, isOpen, reloadKey, tentarEmbutirBBB]);
  // Abre a sala do BBB numa JANELA COMPANHEIRA (popup dimensionado, sobre o app —
  // o mais próximo de um "modal" que o BBB permite de forma confiável). Se o
  // popup for bloqueado, cai para uma aba normal.
  const abrirBBBJanela = useCallback(() => {
    const w = Math.min(1200, Math.floor(window.screen.availWidth * 0.8));
    const h = Math.min(800, Math.floor(window.screen.availHeight * 0.85));
    const left = Math.floor((window.screen.availWidth - w) / 2);
    const top = Math.floor((window.screen.availHeight - h) / 2);
    const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    const win = window.open(link, 'consultaBBB', features);
    // Popup bloqueado → tenta aba normal como último recurso.
    if (!win) window.open(link, '_blank', 'noopener,noreferrer');else
    win.focus();
  }, [link]);
  if (!isOpen || !link) return null;
  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {

      /* ignore */}
  };
  const handleRecarregar = () => setReloadKey((k) => k + 1);
  // Container: tela cheia embutida (com backdrop) ou janela flutuante no canto.
  const containerClasses = expandido ?
  'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60' :
  'fixed bottom-4 right-4 z-[60]';
  const janelaClasses = expandido ?
  'relative bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/10' :
  'relative bg-white rounded-xl shadow-2xl w-[420px] h-[300px] flex flex-col overflow-hidden ring-1 ring-black/10';
  return (
    <div
      className={containerClasses}
      role="dialog"
      aria-modal="true"
      aria-label="Consulta online">
      
      <div className={janelaClasses}>
        {/* Barra de título — limpa e profissional */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-600 text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <VideoIcon className="w-4 h-4 flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold leading-tight truncate">
                Consulta online
              </span>
              {(pacienteNome || profissionalNome) &&
              <span className="text-[11px] text-indigo-100 leading-tight truncate">
                  {[pacienteNome, profissionalNome].filter(Boolean).join(' • ')}
                </span>
              }
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onConvidarPaciente &&
            <button
              onClick={async () => {
                if (convidando) return;
                setConvidando(true);
                try {
                  await onConvidarPaciente();
                } finally {
                  setConvidando(false);
                }
              }}
              disabled={convidando}
              className="mr-1 inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/25 disabled:opacity-60"
              title="Enviar o link da sala ao paciente (WhatsApp ou SMS)">
              
                {convidando ?
              <Loader2Icon className="h-4 w-4 animate-spin" /> :

              <SendIcon className="h-4 w-4" />
              }
                <span className="hidden sm:inline">
                  {convidando ? 'Enviando…' : 'Convidar paciente'}
                </span>
              </button>
            }
            <button
              onClick={handleRecarregar}
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors"
              title="Recarregar a sala">
              
              <RefreshCwIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleCopiar}
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors"
              title="Copiar link da sala">
              
              {copiado ?
              <CheckIcon className="w-4 h-4" /> :

              <CopyIcon className="w-4 h-4" />
              }
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors"
              title="Abrir em nova aba">
              
              <ExternalLinkIcon className="w-4 h-4" />
            </a>
            <button
              onClick={() => setExpandido((v) => !v)}
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors"
              title={expandido ? 'Reduzir para o canto' : 'Expandir'}>
              
              {expandido ?
              <Minimize2Icon className="w-4 h-4" /> :

              <Maximize2Icon className="w-4 h-4" />
              }
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors"
              title="Encerrar visualização (não finaliza o atendimento)">
              
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sala de vídeo.
             - Jitsi: a External API monta o iframe dentro de containerRef (embute bem).
             - BBB: o cliente HTML5 do BigBlueButton NÃO embute em outro domínio
               (X-Frame-Options + cookies de terceiros → "Oops"). Por isso o BBB
               usa um LANÇADOR que abre a sala em uma aba do navegador. */}
        <div className="relative flex-1 bg-gray-900 min-h-0">
          {salaLiveKit ?
          // LiveKit: sala nativa embutida — sem iframe e sem limite de tempo.
          <div className="absolute inset-0 w-full h-full">
              <SalaLiveKit
              clinicaId={salaLiveKit.clinicaId}
              consultaId={salaLiveKit.consultaId}
              nome={profissionalNome || 'Profissional'}
              role="moderator"
              onSair={onClose}
              onConvidarPaciente={onConvidarPaciente} />
            
            </div> :
          isBBB ?
          tentarEmbutirBBB ?
          <iframe
            key={reloadKey}
            title="Consulta online"
            src={link}
            className="absolute inset-0 w-full h-full border-0"
            allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
            allowFullScreen
            onLoad={() => setEstado('conectada')} /> :


          <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-5 bg-gray-900 text-gray-200 text-center px-6">
                <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                  <VideoIcon className="w-8 h-8 text-indigo-400" />
                </div>
                <div className="max-w-md">
                  <p className="text-lg font-semibold text-white">
                    Sala pronta no BigBlueButton
                  </p>
                  <p className="text-sm text-gray-400 mt-1.5">
                    A sala abre em uma janela dedicada, sobre o app (a câmera e
                    o microfone do BigBlueButton só funcionam fora de um embed).
                    É exatamente a mesma sala que o paciente acessa pelo
                    WhatsApp.
                  </p>
                </div>
                <button
              onClick={abrirBBBJanela}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm">
              
                  <VideoIcon className="w-4 h-4" />
                  Entrar na consulta
                </button>
                <div className="flex items-center gap-3 text-[11px]">
                  <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-200 underline underline-offset-2 flex items-center gap-1">
                
                    <ExternalLinkIcon className="w-3 h-3" />
                    Abrir em nova aba
                  </a>
                  <span className="text-gray-600">•</span>
                  <button
                onClick={() => setTentarEmbutirBBB(true)}
                className="text-gray-400 hover:text-gray-200 underline underline-offset-2"
                title="Só funciona se o servidor BBB permitir exibição embutida">
                
                    Tentar exibir aqui dentro
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Fechar esta janela não encerra o atendimento.
                </p>
              </div> :


          <div
            ref={containerRef}
            className="absolute inset-0 w-full h-full" />

          }

          {/* Overlay de carregamento — SEMPRE oferece uma saída garantida (nova aba)
            para o médico nunca ficar preso esperando o embed (apenas Jitsi). */}
          {!isBBB && !salaLiveKit && estado === 'carregando' &&
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-900 text-gray-200 text-center px-6">
              <Loader2Icon className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm">Conectando à sala de vídeo…</p>
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[11px] text-gray-400">
                  Está demorando? Abra a sala direto no navegador:
                </p>
                <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5">
                
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                  Abrir sala em nova aba
                </a>
              </div>
            </div>
          }

          {/* Fallback quando o embed do Jitsi falha (provedor bloqueia ou fora do ar) */}
          {!isBBB && !salaLiveKit && estado === 'falha' &&
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-900 text-gray-200 text-center px-6">
              <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
                <VideoOffIcon className="w-7 h-7 text-gray-400" />
              </div>
              <div className="max-w-sm">
                <p className="text-base font-semibold text-white">
                  Não foi possível carregar a sala aqui dentro
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  O provedor de vídeo não permitiu a exibição embutida. Abra a
                  sala em uma nova aba — é exatamente a mesma sala que o
                  paciente acessa pelo link do WhatsApp.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2 shadow-sm">
                
                  <ExternalLinkIcon className="w-4 h-4" />
                  Abrir sala em nova aba
                </a>
                <button
                onClick={handleRecarregar}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2">
                
                  <RefreshCwIcon className="w-4 h-4" />
                  Tentar novamente
                </button>
              </div>
            </div>
          }

          {/* BBB em modo "tentar embutir": barra de escape SEMPRE visível no topo,
             pois não é possível detectar a tela "Oops" dentro de um iframe de
             outro domínio. Se aparecer o "Oops", o médico volta ao lançador. */}
          {isBBB && tentarEmbutirBBB &&
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full text-[11px] text-gray-200">
              <span>Apareceu "Oops"? O servidor bloqueia o embed.</span>
              <button
              onClick={() => setTentarEmbutirBBB(false)}
              className="px-2 py-0.5 bg-white/15 hover:bg-white/25 rounded-full font-medium transition-colors">
              
                Voltar ao lançador
              </button>
            </div>
          }
        </div>

        {/* Rodapé: dica + ações que decidem o DESTINO da consulta.
             Fechar a janela (X) apenas esconde a sala; encerrar de fato ou
             voltar ao presencial são decisões explícitas e ficam aqui, para o
             profissional não ficar preso na modalidade escolhida por engano. */}
        {expandido &&
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-gray-50 border-t border-gray-100 flex-shrink-0">
            <div className="flex items-start gap-2 text-[11px] text-gray-500 min-w-[240px] flex-1">
              <InfoIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-px" />
              <span>
                O paciente entra pelo mesmo link enviado por WhatsApp ou SMS.
                Fechar esta janela não encerra o atendimento.
              </span>
            </div>
            {(onTrocarParaPresencial || onEncerrarConsultaOnline) &&
          <div className="flex items-center gap-2">
                {onTrocarParaPresencial &&
            <button
              onClick={onTrocarParaPresencial}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
              title="Encerra a sala e mantém o atendimento como presencial">
              
                    <UserIcon className="w-3.5 h-3.5" />
                    Mudar para presencial
                  </button>
            }
                {onEncerrarConsultaOnline &&
            <button
              onClick={onEncerrarConsultaOnline}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
              title="Encerra a sala de vídeo para você e para o paciente">
              
                    <PhoneOffIcon className="w-3.5 h-3.5" />
                    Encerrar consulta online
                  </button>
            }
              </div>
          }
          </div>
        }
      </div>
    </div>);

}