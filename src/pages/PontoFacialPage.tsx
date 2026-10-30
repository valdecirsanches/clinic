import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  createElement,
  Component } from
'react';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
import { useConfiguracoesGlobais } from '../hooks/useConfiguracoesGlobais';
import {
  ConfigLocalPonto,
  CONFIG_LOCAL_PONTO_PADRAO,
  chaveConfigLocalPonto,
  distanciaEmMetros } from
'../types/pontoLocalizacao';
import {
  CameraIcon,
  CheckCircleIcon,
  MapPinIcon,
  AlertTriangleIcon,
  Loader2Icon,
  RefreshCcwIcon,
  LockIcon } from
'lucide-react';
interface PontoFacialConfig {
  ativo: boolean;
  ativadoEm?: string;
  ativadoPor?: string;
}
// Intervalo mínimo entre duas marcações do MESMO funcionário (anti-rebote)
const COOLDOWN_MS = 60000;
function getClinicaId(): string {
  try {
    const raw = localStorage.getItem('sessao');
    return raw ? JSON.parse(raw).clinicaAtual?.id || '' : '';
  } catch {
    return '';
  }
}
export function PontoFacialPage() {
  const clinicaId = getClinicaId();
  const pontoFacialConfig = useConfiguracoesGlobais<PontoFacialConfig>(
    `ponto_facial_ativo_${clinicaId}`,
    {
      ativo: false
    }
  );
  // ⭐ Trava de localização: referência e raio vêm da configuração da clínica
  // (Ponto → Facial), não de geocodificação em tempo de execução.
  const configLocalHook = useConfiguracoesGlobais<ConfigLocalPonto>(
    chaveConfigLocalPonto(clinicaId),
    CONFIG_LOCAL_PONTO_PADRAO
  );
  const configLocal = {
    ...CONFIG_LOCAL_PONTO_PADRAO,
    ...configLocalHook.valor
  };
  const raioPermitido = Math.max(50, Number(configLocal.raioMetros) || 150);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<
    'loading_models' |
    'checking_gps' |
    'gps_error' |
    'camera_error' |
    'ready' |
    'detecting' |
    'success' |
    'not_recognized' |
    'ja_registrado' |
    'no_data' |
    'servico_inativo'>(
    'loading_models');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [descritores, setDescritores] = useState<any[]>([]);
  const detectionIntervalRef = useRef<any>(null);
  // Refs para o loop de detecção (evitam ler estado "velho" do closure e re-render a cada frame)
  const descritoresRef = useRef<any[]>([]);
  const statusRef = useRef<string>('loading_models');
  const runningRef = useRef<boolean>(false);
  const faceVistaDesdeRef = useRef<number>(0);
  const ultimaDeteccaoRef = useRef<number>(0);
  // Anti-rebote: lembra a última pessoa marcada e exige que o rosto saia antes de remarcar
  const ultimoUsuarioRef = useRef<string>('');
  const ultimoRegistroEmRef = useRef<number>(0);
  const precisaSairRef = useRef<boolean>(false);
  // Atualiza o status só quando muda de verdade (evita o "piscando igual doido")
  const setStatusSafe = useCallback((novo: any) => {
    if (statusRef.current === novo) return;
    statusRef.current = novo;
    setStatus(novo);
  }, []);
  // 1. Verifica se o serviço está ativo para esta clínica; se sim, carrega face-api
  useEffect(() => {
    // Aguarda o carregamento da configuração de ativação
    if (pontoFacialConfig.loading) return;
    // Serviço não ativado -> bloqueia o kiosk (não inicia câmera/modelos)
    if (!pontoFacialConfig.valor.ativo) {
      setStatus('servico_inativo');
      return;
    }
    const loadFaceApi = async () => {
      try {
        // Injeta script se não existir
        if (!(window as any).faceapi) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src =
            'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        const faceapi = (window as any).faceapi;
        // ⚠️ Os pesos dos modelos NÃO são publicados na pasta /model do pacote
        // npm (404). Eles vivem no repositório GitHub do @vladmandic/face-api,
        // servido de forma confiável pelo caminho `gh` do jsDelivr.
        const MODEL_URL =
        'https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model/';
        await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]
        );
        setStatus('checking_gps');
      } catch (err) {
        console.error('Erro ao carregar face-api:', err);
        setStatus('camera_error');
        setErrorMessage('Falha ao carregar modelos de IA. Verifique a conexão.');
      }
    };
    loadFaceApi();
  }, [pontoFacialConfig.loading, pontoFacialConfig.valor.ativo]);
  // 2. Checar GPS — compara a posição atual com o ponto de referência da clínica
  useEffect(() => {
    if (status !== 'checking_gps') return;
    // Espera a configuração da clínica antes de decidir (sem isso o kiosk
    // aplicaria o padrão e poderia bloquear indevidamente).
    if (configLocalHook.loading) return;
    // Valores primitivos: o efeito não pode depender do objeto (recriado a
    // cada renderização), senão o GPS seria consultado em laço.
    const validar = configLocal.validar;
    const latitude = configLocal.latitude;
    const longitude = configLocal.longitude;
    // Exigência desligada em Ponto → Facial: segue sem consultar o GPS.
    if (!validar) {
      carregarDescritores();
      return;
    }
    if (!navigator.geolocation) {
      setStatus('gps_error');
      setErrorMessage('Geolocalização não suportada pelo navegador.');
      return;
    }
    const verificar = () => {
      // ⭐ A referência é a coordenada CAPTURADA NO LOCAL e guardada em
      // Ponto → Facial. Antes o endereço era geocodificado em tempo de
      // execução e, quando o serviço falhava, caía num ponto fixo de São Paulo
      // — era isso que acusava quilômetros de distância com o funcionário
      // dentro da clínica. Nunca mais há coordenada "chutada".
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        setStatus('gps_error');
        setErrorMessage(
          'A clínica ainda não tem um ponto de referência definido. Um administrador precisa abrir Ponto → Facial e usar "Usar minha localização atual" dentro da clínica — ou desligar a exigência de localização.'
        );
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dist = distanciaEmMetros(
            pos.coords.latitude,
            pos.coords.longitude,
            latitude,
            longitude
          );
          // A margem do próprio GPS entra na conta: em ambiente fechado a
          // precisão costuma passar de 50 m, e reprovar por isso é injusto.
          const margem = Math.min(Math.round(pos.coords.accuracy || 0), 200);
          if (dist > raioPermitido + margem) {
            setStatus('gps_error');
            setErrorMessage(
              `Você está a ${Math.round(dist)} m do ponto de referência da clínica — fora do raio permitido (${raioPermitido} m).`
            );
          } else {
            carregarDescritores();
          }
        },
        () => {
          setStatus('gps_error');
          setErrorMessage(
            'Permissão de localização negada ou erro ao obter GPS.'
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    };
    verificar();
  }, [
  status,
  configLocalHook.loading,
  configLocal.validar,
  configLocal.latitude,
  configLocal.longitude,
  raioPermitido]
  );
  // 3. Carregar descritores do backend
  const carregarDescritores = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ponto/facial/descritores?clinicaId=${clinicaId}`
      );
      if (!res.ok) throw new Error('Falha ao carregar cadastros');
      const data = await res.json();
      if (isMagicPatterns || data.length === 0) {
        setStatusSafe('no_data');
        return;
      }
      descritoresRef.current = data;
      setDescritores(data);
      iniciarCamera();
    } catch (err) {
      console.error(err);
      setStatus('camera_error');
      setErrorMessage('Erro ao conectar com o servidor.');
    }
  };
  // 4. Iniciar Câmera
  const iniciarCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setStatusSafe('ready');
          iniciarDeteccao();
        };
      }
    } catch (err: any) {
      setStatusSafe('camera_error');
      if (err.name === 'NotAllowedError') {
        setErrorMessage(
          'Permissão de câmera negada. Libere o acesso no navegador.'
        );
      } else if (err.name === 'NotFoundError') {
        setErrorMessage('Nenhuma câmera encontrada.');
      } else {
        setErrorMessage('A câmera está sendo usada por outro app ou falhou.');
      }
    }
  };
  // 5. Loop de detecção — controlado por refs (não re-renderiza a cada frame)
  const iniciarDeteccao = () => {
    if (runningRef.current) return; // evita loops sobrepostos
    if (!videoRef.current || !canvasRef.current) return;
    const faceapi = (window as any).faceapi;
    if (!faceapi) return;
    runningRef.current = true;
    faceVistaDesdeRef.current = 0;
    const detect = async () => {
      // Encerra o loop se a tela saiu do modo de captura
      if (
      !runningRef.current ||
      statusRef.current === 'success' ||
      !videoRef.current ||
      videoRef.current.paused ||
      videoRef.current.ended)
      {
        runningRef.current = false;
        return;
      }
      // Throttle: roda a detecção pesada no máx ~a cada 250ms
      const agora = Date.now();
      if (agora - ultimaDeteccaoRef.current < 250) {
        detectionIntervalRef.current = requestAnimationFrame(detect);
        return;
      }
      ultimaDeteccaoRef.current = agora;
      try {
        const detection = await faceapi.
        detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,
            scoreThreshold: 0.5
          })
        ).
        withFaceLandmarks().
        withFaceDescriptor();
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && videoRef.current) {
          const displaySize = {
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          };
          if (canvas.width !== displaySize.width) {
            faceapi.matchDimensions(canvas, displaySize);
          }
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          if (detection) {
            const resizedDetections = faceapi.resizeResults(
              detection,
              displaySize
            );
            // Compara contra os descritores carregados (via ref, sempre atualizado)
            let bestMatch = {
              distance: 1.0,
              usuarioId: '',
              usuarioNome: ''
            };
            for (const func of descritoresRef.current) {
              for (const desc of func.descritores) {
                const floatArray = new Float32Array(Object.values(desc));
                const distance = faceapi.euclideanDistance(
                  detection.descriptor,
                  floatArray
                );
                if (distance < bestMatch.distance) {
                  bestMatch = {
                    distance,
                    usuarioId: func.usuarioId,
                    usuarioNome: func.usuarioNome
                  };
                }
              }
            }
            const isRecognized = bestMatch.distance < 0.5;
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections, {
              drawLines: true,
              color: isRecognized ? '#10b981' : '#facc15'
            });
            if (isRecognized) {
              const mesmoUsuario =
              bestMatch.usuarioId === ultimoUsuarioRef.current;
              const dentroDoCooldown =
              agora - ultimoRegistroEmRef.current < COOLDOWN_MS;
              // Anti-rebote: não remarca a mesma pessoa enquanto ela não sair da
              // frente da câmera (precisaSair) OU dentro do intervalo mínimo.
              if (
              mesmoUsuario && (
              precisaSairRef.current || dentroDoCooldown))
              {
                setStatusSafe('ja_registrado');
              } else {
                runningRef.current = false;
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
                registrarPonto(bestMatch.usuarioId, bestMatch.usuarioNome);
                return;
              }
            } else {
              // Rosto presente mas ainda não bateu: mostra "analisando" sem piscar.
              // Só marca "não reconhecido" se persistir por mais de 4s.
              if (faceVistaDesdeRef.current === 0) {
                faceVistaDesdeRef.current = agora;
              }
              if (agora - faceVistaDesdeRef.current > 4000) {
                setStatusSafe('not_recognized');
              } else {
                setStatusSafe('detecting');
              }
            }
          } else {
            // Sem rosto na frente: a pessoa saiu -> zera cronômetro e libera nova marcação
            faceVistaDesdeRef.current = 0;
            precisaSairRef.current = false;
            setStatusSafe('ready');
          }
        }
      } catch (e) {
        console.error(e);
      }
      if (runningRef.current && statusRef.current !== 'success') {
        detectionIntervalRef.current = requestAnimationFrame(detect);
      }
    };
    detect();
  };
  // 6. Registrar Ponto
  const registrarPonto = async (usuarioId: string, usuarioNome: string) => {
    runningRef.current = false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/ponto/registrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          usuarioId,
          observacoes: 'Reconhecimento Facial'
        })
      });
      const data = await res.json();
      // Marca essa pessoa como "já tratada" e exige que ela saia antes de remarcar
      ultimoUsuarioRef.current = usuarioId;
      ultimoRegistroEmRef.current = Date.now();
      precisaSairRef.current = true;
      if (res.ok && data.ignorado) {
        // Backend recusou por estar dentro do intervalo mínimo (anti-rebote)
        setStatusSafe('ja_registrado');
      } else if (res.ok) {
        const hora = new Date(data.dataHora).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });
        // Se a marcação caiu dentro do intervalo de almoço configurado,
        // mostra "Saída para almoço" / "Retorno do almoço".
        let tipoStr;
        if (data.dentroAlmoco) {
          tipoStr =
          data.tipo === 'saida' ?
          'Saída para almoço registrada' :
          'Retorno do almoço registrado';
        } else {
          tipoStr =
          data.tipo === 'entrada' ? 'Entrada registrada' : 'Saída registrada';
        }
        setSuccessMessage(`Olá, ${usuarioNome}! ${tipoStr} às ${hora}`);
        setStatusSafe('success');
      } else {
        setErrorMessage(data.error || 'Erro ao registrar');
        setStatusSafe('camera_error');
      }
    } catch (err) {
      setErrorMessage('Erro de conexão ao registrar ponto.');
      setStatusSafe('camera_error');
    }
    // Reset após 4s — volta a procurar o próximo rosto (a trava anti-rebote
    // impede remarcar a mesma pessoa que ainda estiver na frente da câmera)
    setTimeout(() => {
      setSuccessMessage('');
      faceVistaDesdeRef.current = 0;
      setStatusSafe('ready');
      iniciarDeteccao();
    }, 4000);
  };
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (detectionIntervalRef.current) {
        cancelAnimationFrame(detectionIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Header Kiosk */}
      <div className="absolute top-8 left-0 right-0 text-center z-10">
        <h1 className="text-3xl font-bold text-white tracking-wider">
          PONTO DIGITAL
        </h1>
        <p className="text-gray-400 mt-2">
          Posicione seu rosto no centro da tela
        </p>
      </div>

      {/* Área da Câmera */}
      <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-gray-800">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover absolute inset-0"
          style={{
            transform: 'scaleX(-1)'
          }} />
        

        <canvas
          ref={canvasRef}
          className="w-full h-full absolute inset-0 pointer-events-none"
          style={{
            transform: 'scaleX(-1)'
          }} />
        

        {/* Scanner Overlay Animation */}
        {(status === 'detecting' || status === 'not_recognized') &&
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
            className={`w-full h-1 shadow-[0_0_15px_rgba(45,212,191,0.8)] animate-[scan_2s_ease-in-out_infinite] ${status === 'not_recognized' ? 'bg-red-500 shadow-red-500' : 'bg-teal-400 shadow-teal-400'}`} />
          
          </div>
        }

        {/* Guia Oval */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className={`w-3/4 h-2/3 rounded-[100%] border-4 transition-colors duration-300 ${status === 'ready' ? 'border-white/50' : status === 'detecting' ? 'border-teal-400' : status === 'success' ? 'border-green-500' : status === 'ja_registrado' ? 'border-sky-400' : status === 'not_recognized' ? 'border-red-500' : 'border-transparent'}`} />
          
        </div>

        {/* Overlays de Status */}
        {status === 'loading_models' &&
        <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center text-white">
            <Loader2Icon className="w-12 h-12 animate-spin mb-4 text-blue-500" />
            <p>Carregando IA Facial...</p>
          </div>
        }

        {status === 'checking_gps' &&
        <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center text-white">
            <MapPinIcon className="w-12 h-12 animate-bounce mb-4 text-blue-500" />
            <p>Verificando Localização...</p>
          </div>
        }

        {status === 'gps_error' &&
        <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center text-white p-6 text-center">
            <MapPinIcon className="w-16 h-16 mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">Bloqueio de GPS</h2>
            <p className="text-gray-300 mb-6">{errorMessage}</p>
            <button
            onClick={() => setStatus('checking_gps')}
            className="px-6 py-3 bg-blue-600 rounded-full font-medium hover:bg-blue-700 transition">
            
              Tentar Novamente
            </button>
            {/* Não existe mais atalho para furar a trava aqui: liberar a
               marcação sem localização é decisão de administrador, feita em
               Ponto → Facial. */}
            <p className="text-gray-500 text-xs mt-6 max-w-xs">
              A exigência de localização e o ponto de referência da clínica são
              definidos pelo administrador em Ponto → Facial.
            </p>
          </div>
        }

        {status === 'camera_error' &&
        <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center text-white p-6 text-center">
            <CameraIcon className="w-16 h-16 mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">Erro na Câmera</h2>
            <p className="text-gray-300 mb-6">{errorMessage}</p>
            <button
            onClick={iniciarCamera}
            className="px-6 py-3 bg-blue-600 rounded-full font-medium hover:bg-blue-700 transition flex items-center gap-2">
            
              <RefreshCcwIcon className="w-5 h-5" /> Tentar Novamente
            </button>
          </div>
        }

        {status === 'no_data' &&
        <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center text-white p-6 text-center">
            <AlertTriangleIcon className="w-16 h-16 mb-4 text-orange-500" />
            <h2 className="text-xl font-bold mb-2">Nenhum Rosto Cadastrado</h2>
            <p className="text-gray-300">
              Acesse o painel de gestão para cadastrar as faces dos
              funcionários.
            </p>
          </div>
        }

        {status === 'servico_inativo' &&
        <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center text-white p-6 text-center">
            <LockIcon className="w-16 h-16 mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">Serviço não ativado</h2>
            <p className="text-gray-300 mb-2">
              O reconhecimento facial de ponto não está ativado para esta
              clínica.
            </p>
            <p className="text-sm text-gray-400">
              Solicite a ativação no painel de gestão: Ponto e Frequência →
              Cadastro Facial.
            </p>
          </div>
        }

        {status === 'not_recognized' &&
        <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-sm">
            <AlertTriangleIcon className="w-16 h-16 mb-4 text-white" />
            <h2 className="text-2xl font-bold mb-2">Rosto não reconhecido</h2>
            <p className="text-white/90">
              Aproxime-se da câmera ou procure o gestor.
            </p>
          </div>
        }

        {status === 'success' &&
        <div className="absolute inset-0 bg-green-600/90 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-md">
            <CheckCircleIcon className="w-20 h-20 mb-4 text-white" />
            <h2 className="text-3xl font-bold mb-2 leading-tight">
              {successMessage.split('! ')[0]}!
            </h2>
            <p className="text-xl font-medium text-green-100">
              {successMessage.split('! ')[1]}
            </p>
          </div>
        }

        {status === 'ja_registrado' &&
        <div className="absolute inset-0 bg-sky-900/85 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-sm">
            <CheckCircleIcon className="w-16 h-16 mb-4 text-sky-300" />
            <h2 className="text-2xl font-bold mb-2">Ponto já registrado</h2>
            <p className="text-white/90">
              Pode se afastar da câmera. Aguarde para marcar novamente.
            </p>
          </div>
        }
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-8 left-0 right-0 text-center z-10">
        <p className="text-gray-500 text-sm">
          Sistema de Ponto Biométrico Facial
        </p>
      </div>
    </div>);

}