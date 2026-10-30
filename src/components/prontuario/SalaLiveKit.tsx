// ⭐ Sala de vídeo LiveKit embutida (telemedicina)
//
// A conexão exige um TOKEN assinado pelo servidor com a API Key + Secret do
// LiveKit — nenhuma credencial passa pelo navegador. Este componente pede o
// token e conecta.
//
// ⚠️ O SDK do LiveKit é carregado por <script> a partir do CDN, e NÃO como
// dependência npm: neste ambiente o `npm install` da raiz não instala as
// dependências deste app, então um import quebraria o build. É o mesmo padrão
// já usado para a API externa do Jitsi.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  SendIcon,
  SwitchCameraIcon,
  VideoIcon,
  VideoOffIcon } from
'lucide-react';
import { API_BASE_URL } from '../../config/api';

declare global {
  interface Window {
    LivekitClient?: any;
  }
}

const LIVEKIT_CDN =
'https://cdn.jsdelivr.net/npm/livekit-client@2.5.7/dist/livekit-client.umd.min.js';

let scriptPromise: Promise<any> | null = null;

/** Carrega o SDK do LiveKit uma única vez por sessão. */
function carregarSdk(): Promise<any> {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIVEKIT_CDN;
    script.async = true;
    script.onload = () => {
      if (window.LivekitClient) resolve(window.LivekitClient);else
      reject(new Error('SDK de vídeo carregou, mas não foi inicializado.'));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(
        new Error(
          'Não foi possível carregar o componente de vídeo. Verifique a conexão com a internet.'
        )
      );
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface SalaLiveKitProps {
  clinicaId?: string;
  consultaId?: string;
  nome?: string;
  /** 'moderator' = profissional (cria/administra a sala); 'attendee' = paciente */
  role?: 'moderator' | 'attendee';
  onSair?: () => void;
  /** Envia o link da sala ao paciente por WhatsApp (ou SMS, se indisponível). */
  onConvidarPaciente?: () => Promise<boolean> | void;
}

type Estado = 'conectando' | 'conectada' | 'erro';

export function SalaLiveKit({
  clinicaId,
  consultaId,
  nome,
  role = 'moderator',
  onSair,
  onConvidarPaciente
}: SalaLiveKitProps) {
  const [estado, setEstado] = useState<Estado>('conectando');
  const [erro, setErro] = useState<string | null>(null);
  const [micAtivo, setMicAtivo] = useState(true);
  const [camAtiva, setCamAtiva] = useState(true);
  const [remotos, setRemotos] = useState(0);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [convidando, setConvidando] = useState(false);
  const [lente, setLente] = useState<'user' | 'environment'>('user');
  const lenteRef = useRef<'user' | 'environment'>('user');
  // Só faz sentido oferecer a troca de câmera onde existe mais de uma.
  const [temVariasCameras, setTemVariasCameras] = useState(false);

  const remotosRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<any>(null);
  const onSairRef = useRef(onSair);
  onSairRef.current = onSair;

  useEffect(() => {
    let cancelado = false;
    let room: any = null;

    async function entrar() {
      setEstado('conectando');
      setErro(null);
      try {
        // 1) Token assinado pelo servidor (a Secret nunca vem para cá)
        const resposta =
        role === 'attendee' ?
        await fetch(
          `${API_BASE_URL}/api/livekit/paciente/${encodeURIComponent(
            clinicaId || 'clinica'
          )}/${encodeURIComponent(
            consultaId || ''
          )}?nome=${encodeURIComponent(nome || 'Paciente')}`
        ) :
        await fetch(`${API_BASE_URL}/api/livekit/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId,
            nome,
            role
          })
        });
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok || !dados?.url || !dados?.token) {
          throw new Error(
            dados?.error ||
            `Não foi possível entrar na sala de vídeo (${resposta.status}).`
          );
        }

        // 2) SDK
        const LK = await carregarSdk();
        if (cancelado) return;
        const { Room, RoomEvent } = LK;

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          // ⭐ No celular, o padrão do navegador pode abrir a câmera TRASEIRA —
          // inútil numa consulta. `facingMode: 'user'` força a frontal, que é a
          // que filma o paciente. Ele ainda pode alternar pelo botão da sala.
          videoCaptureDefaults: {
            facingMode: 'user'
          }
        });
        roomRef.current = room;

        const anexarTrack = (track: any) => {
          const container = remotosRef.current;
          if (!container) return;
          const el = track.attach();
          el.setAttribute('playsinline', 'true');
          if (track.kind === 'audio') {
            // Áudio não ocupa espaço no mosaico — só precisa tocar.
            el.style.display = 'none';
            container.appendChild(el);
          } else {
            el.className = 'w-full h-full object-cover rounded-lg bg-black';
            const tile = document.createElement('div');
            tile.className = 'relative min-h-[180px] flex-1 basis-[300px]';
            tile.dataset.tile = 'video';
            tile.appendChild(el);
            container.appendChild(tile);
          }
          setRemotos(container.querySelectorAll('[data-tile="video"]').length);
        };

        room.
        on(RoomEvent.TrackSubscribed, (track: any) => {
          if (track.kind === 'video' || track.kind === 'audio') anexarTrack(track);
        }).
        on(RoomEvent.TrackUnsubscribed, (track: any) => {
          track.detach().forEach((el: HTMLElement) => {
            const tile = el.closest('[data-tile="video"]');
            if (tile) tile.remove();else
            el.remove();
          });
          setRemotos(
            remotosRef.current?.querySelectorAll('[data-tile="video"]').length || 0
          );
        }).
        on(RoomEvent.LocalTrackPublished, (pub: any) => {
          if (pub.track?.kind === 'video' && localRef.current) {
            localRef.current.innerHTML = '';
            const el = pub.track.attach();
            el.className = 'w-full h-full object-cover rounded-lg bg-black';
            el.muted = true;
            el.setAttribute('playsinline', 'true');
            localRef.current.appendChild(el);
          }
        }).
        on(RoomEvent.Disconnected, () => {
          onSairRef.current?.();
        });

        // 3) Conecta e publica câmera/microfone
        await room.connect(dados.url, dados.token);
        if (cancelado) {
          room.disconnect();
          return;
        }
        setEstado('conectada');
        // Descobre se o aparelho tem mais de uma câmera (frontal/traseira).
        navigator.mediaDevices?.
        enumerateDevices?.().
        then((lista) => {
          const cams = lista.filter((d) => d.kind === 'videoinput');
          if (!cancelado) setTemVariasCameras(cams.length > 1);
        }).
        catch(() => {

          /* sem permissão para listar — botão apenas não aparece */});
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          await room.localParticipant.setCameraEnabled(true, {
            facingMode: 'user'
          });
        } catch {
          // Permissão negada não derruba a sala: o usuário continua vendo e
          // ouvindo o outro lado e pode liberar depois pelo navegador.
          setMicAtivo(false);
          setCamAtiva(false);
        }
      } catch (err: any) {
        if (cancelado) return;
        setErro(err?.message || 'Falha ao conectar à sala de vídeo.');
        setEstado('erro');
      }
    }

    entrar();
    return () => {
      cancelado = true;
      try {
        room?.disconnect();
      } catch {

        /* sala já encerrada */}
      roomRef.current = null;
    };
  }, [clinicaId, consultaId, nome, role]);

  const alternarMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const novo = !micAtivo;
    await room.localParticipant.setMicrophoneEnabled(novo);
    setMicAtivo(novo);
  }, [micAtivo]);

  const alternarCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const novo = !camAtiva;
    await room.localParticipant.setCameraEnabled(
      novo,
      novo ?
      {
        facingMode: lenteRef.current
      } :
      undefined
    );
    setCamAtiva(novo);
  }, [camAtiva]);

  // Alterna entre a câmera frontal e a traseira (útil para o paciente mostrar
  // uma lesão, receita ou exame ao profissional).
  const trocarLente = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nova = lenteRef.current === 'user' ? 'environment' : 'user';
    lenteRef.current = nova;
    try {
      await room.localParticipant.setCameraEnabled(true, {
        facingMode: nova
      });
      setCamAtiva(true);
      setLente(nova);
    } catch {
      lenteRef.current = nova === 'user' ? 'environment' : 'user';
    }
  }, []);

  // Link público do paciente — é por ele (WhatsApp/SMS) que o paciente fica
  // sabendo da consulta e entra na mesma sala.
  const copiarLinkPaciente = useCallback(async () => {
    const url = `${window.location.origin}/consulta-online/${encodeURIComponent(
      clinicaId || 'clinica'
    )}/${encodeURIComponent(consultaId || '')}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      window.setTimeout(() => setLinkCopiado(false), 2500);
    } catch {
      window.prompt('Copie o link do paciente:', url);
    }
  }, [clinicaId, consultaId]);

  const sair = useCallback(() => {
    try {
      roomRef.current?.disconnect();
    } catch {

      /* já desconectada */}
    onSairRef.current?.();
  }, []);

  if (estado === 'erro') {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 bg-gray-900 p-6 text-center">
        <AlertTriangleIcon className="h-8 w-8 text-amber-400" aria-hidden="true" />
        <p className="max-w-md text-sm text-gray-200">{erro}</p>
      </div>);

  }

  return (
    <div className="relative flex h-full min-h-[320px] flex-col bg-gray-900">
      {/* Participantes remotos */}
      {/* `min-h-0` é o que impede o vídeo de empurrar a barra de controles para
           fora da tela quando o participante remoto entra. */}
      <div
        ref={remotosRef}
        className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-3 overflow-hidden p-3 [&>video]:max-h-full [&>video]:rounded-lg [&>video]:object-contain" />
      

      {estado === 'conectando' &&
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
          <Loader2Icon
          className="h-8 w-8 animate-spin text-teal-400"
          aria-hidden="true" />
        
          <p className="text-sm text-gray-300">Conectando à sala de vídeo…</p>
        </div>
      }

      {estado === 'conectada' && remotos === 0 &&
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium text-gray-200">
            {role === 'attendee' ?
          'Você já está na sala. Aguardando o profissional…' :
          'Aguardando o paciente entrar na sala…'}
          </p>
          {role === 'attendee' ?
        <p className="text-xs text-gray-400">
              Mantenha esta página aberta — o atendimento começa assim que o
              profissional entrar.
            </p> :

        <>
              <p className="max-w-sm text-xs text-gray-400">
                O paciente só entra pelo link de acesso. Envie-o por WhatsApp ou
                SMS — ele abre a sala direto no celular, sem instalar nada.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
              {onConvidarPaciente &&
            <button
              type="button"
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
              className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-60">
              
                  {convidando ?
              <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> :

              <SendIcon className="h-4 w-4" aria-hidden="true" />
              }
                  {convidando ? 'Enviando convite…' : 'Convidar por WhatsApp/SMS'}
                </button>
            }
              <button
              type="button"
              onClick={copiarLinkPaciente}
              className="inline-flex items-center gap-2 rounded-md bg-gray-800 px-3 py-2 text-xs font-medium text-gray-100 transition-colors hover:bg-gray-700">
              
                {linkCopiado ?
              <CheckIcon className="h-4 w-4" aria-hidden="true" /> :

              <CopyIcon className="h-4 w-4" aria-hidden="true" />
              }
                {linkCopiado ? 'Link copiado' : 'Copiar link do paciente'}
              </button>
              </div>
            </>
        }
        </div>
      }

      {/* Prévia local — fica ACIMA da barra de controles (nunca por baixo dela)
           e espelhada na câmera frontal, como o usuário se vê no espelho. */}
      <div
        ref={localRef}
        data-espelhado={lente === 'user' ? 'true' : 'false'}
        className="pointer-events-none absolute right-3 h-24 w-32 overflow-hidden rounded-lg border border-gray-700 bg-black shadow-lg sm:h-28 sm:w-40 [&>video]:h-full [&>video]:w-full [&>video]:object-cover [&[data-espelhado='true']>video]:-scale-x-100"
        style={{
          bottom: 'calc(var(--sala-controles-h, 88px) + 12px)'
        }} />
      

      {/* Controles — barra fixa, alvos grandes e rótulo em texto para não
           restar dúvida sobre o que cada botão faz (o paciente costuma estar no
           celular, muitas vezes na primeira consulta por vídeo da vida dele). */}
      <div
        className="relative z-10 flex shrink-0 items-end justify-center gap-2 border-t border-gray-800 bg-gray-950 px-2 py-3 sm:gap-4"
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          ['--sala-controles-h' as string]: '88px'
        }}>
        
        <BotaoControle
          onClick={alternarMic}
          ativo={micAtivo}
          rotulo={micAtivo ? 'Microfone' : 'Sem áudio'}
          aria={micAtivo ? 'Desligar microfone' : 'Ligar microfone'}
          icone={
          micAtivo ?
          <MicIcon className="h-6 w-6" aria-hidden="true" /> :

          <MicOffIcon className="h-6 w-6" aria-hidden="true" />

          } />
        
        <BotaoControle
          onClick={alternarCam}
          ativo={camAtiva}
          rotulo={camAtiva ? 'Câmera' : 'Sem vídeo'}
          aria={camAtiva ? 'Desligar câmera' : 'Ligar câmera'}
          icone={
          camAtiva ?
          <VideoIcon className="h-6 w-6" aria-hidden="true" /> :

          <VideoOffIcon className="h-6 w-6" aria-hidden="true" />

          } />
        
        {temVariasCameras &&
        <BotaoControle
          onClick={trocarLente}
          ativo
          rotulo="Virar"
          aria={
          lente === 'user' ?
          'Usar a câmera traseira' :
          'Usar a câmera frontal'
          }
          icone={<SwitchCameraIcon className="h-6 w-6" aria-hidden="true" />} />

        }
        <BotaoControle
          onClick={sair}
          encerrar
          rotulo="Sair"
          aria="Sair da consulta"
          icone={<PhoneOffIcon className="h-6 w-6" aria-hidden="true" />} />
        
      </div>
    </div>);

}

/**
 * Botão da barra de controles: área de toque confortável (56px), estado visível
 * pela cor e rótulo em texto abaixo do ícone.
 */
function BotaoControle({
  onClick,
  icone,
  rotulo,
  aria,
  ativo = true,
  encerrar = false







}: {onClick: () => void;icone: React.ReactNode;rotulo: string;aria: string;ativo?: boolean;encerrar?: boolean;}) {
  const cor = encerrar ?
  'bg-red-600 hover:bg-red-500' :
  ativo ?
  'bg-gray-700 hover:bg-gray-600' :
  'bg-red-600 hover:bg-red-500';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      title={aria}
      className="flex w-16 flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 sm:w-20">
      
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition-colors ${cor}`}>
        
        {icone}
      </span>
      <span className="text-[11px] font-medium leading-none text-gray-300">
        {rotulo}
      </span>
    </button>);

}