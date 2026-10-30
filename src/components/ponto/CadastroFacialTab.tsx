import React, { useEffect, useState, useRef, createElement } from 'react';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../hooks/useToast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import {
  CameraIcon,
  CheckCircleIcon,
  Loader2Icon,
  AlertTriangleIcon } from
'lucide-react';
interface Funcionario {
  id: string;
  nome: string;
}
interface Props {
  clinicaId: string;
  funcionarios: Funcionario[];
}
export function CadastroFacialTab({ clinicaId, funcionarios }: Props) {
  const { success, error } = useToast();
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading_models' | 'ready' | 'capturing' | 'success' | 'error'>(
    'idle');
  const [amostras, setAmostras] = useState<Float32Array[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [cadastrados, setCadastrados] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<any>(null);
  useEffect(() => {
    carregarCadastros();
  }, [clinicaId]);
  const carregarCadastros = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ponto/facial/descritores?clinicaId=${clinicaId}`
      );
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>(data.map((d: any) => d.usuarioId));
        setCadastrados(ids);
      }
    } catch (err) {
      console.error('Erro ao carregar cadastros faciais', err);
    }
  };
  // Carregar face-api
  const loadFaceApi = async () => {
    setStatus('loading_models');
    try {
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
      iniciarCamera();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage('Falha ao carregar modelos de IA.');
    }
  };
  const iniciarCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: {
            ideal: 640
          },
          height: {
            ideal: 480
          }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setStatus('ready');
        };
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage('Permissão de câmera negada ou câmera não encontrada.');
    }
  };
  const pararCamera = () => {
    if (detectionIntervalRef.current) {
      cancelAnimationFrame(detectionIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };
  useEffect(() => {
    return () => pararCamera();
  }, []);
  const handleIniciarCadastro = () => {
    if (!selectedFuncionario) {
      error('Atenção', 'Selecione um funcionário primeiro.');
      return;
    }
    setAmostras([]);
    loadFaceApi();
  };
  // Loop contínuo para desenhar landmarks e capturar automaticamente
  const iniciarEscaneamento = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const faceapi = (window as any).faceapi;
    if (!faceapi) return;
    setStatus('capturing');
    let amostrasColetadas: Float32Array[] = [];
    let lastCaptureTime = 0;
    const detect = async () => {
      if (
      !videoRef.current ||
      videoRef.current.paused ||
      videoRef.current.ended ||
      amostrasColetadas.length >= 4)

      return;
      try {
        const detection = await faceapi.
        detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5
          })
        ).
        withFaceLandmarks().
        withFaceDescriptor();
        const canvas = canvasRef.current;
        if (canvas && videoRef.current) {
          const displaySize = {
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          };
          if (canvas.width !== displaySize.width) {
            faceapi.matchDimensions(canvas, displaySize);
          }
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          if (detection) {
            const resizedDetections = faceapi.resizeResults(
              detection,
              displaySize
            );
            // Desenha a malha do rosto com cor verde (indicando que achou)
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections, {
              drawLines: true,
              color: '#10b981'
            });
            const now = Date.now();
            // Captura 1 amostra por segundo se o rosto estiver bem detectado
            if (now - lastCaptureTime > 1000) {
              amostrasColetadas.push(detection.descriptor);
              setAmostras([...amostrasColetadas]);
              lastCaptureTime = now;
              success(
                'Amostra Capturada',
                `${amostrasColetadas.length} de 4 amostras.`
              );
              if (amostrasColetadas.length >= 4) {
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
                await salvarCadastro(amostrasColetadas);
                return; // Fim do loop
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
      if (amostrasColetadas.length < 4) {
        detectionIntervalRef.current = requestAnimationFrame(detect);
      }
    };
    detect();
  };
  const salvarCadastro = async (descritores: Float32Array[]) => {
    try {
      const func = funcionarios.find((f) => f.id === selectedFuncionario);
      // Converter Float32Array para array normal para o JSON
      const descritoresArray = descritores.map((d) => Array.from(d));
      const res = await fetch(`${API_BASE_URL}/api/ponto/facial/cadastrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          usuarioId: selectedFuncionario,
          usuarioNome: func?.nome,
          descritores: descritoresArray
        })
      });
      if (!res.ok) throw new Error('Falha ao salvar no servidor');
      setStatus('success');
      pararCamera();
      success('Sucesso', 'Cadastro facial concluído com sucesso!');
      carregarCadastros();
      setTimeout(() => {
        setStatus('idle');
        setSelectedFuncionario('');
        setAmostras([]);
      }, 3000);
    } catch (err) {
      setStatus('error');
      setErrorMessage('Erro ao salvar cadastro facial.');
      error('Erro', 'Não foi possível salvar o cadastro.');
    }
  };
  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Cadastro Facial</h2>
        <p className="text-gray-500 mt-1">
          Capture 4 amostras do rosto do funcionário para habilitar o ponto
          digital.
        </p>
      </div>

      {status === 'idle' &&
      <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selecione o Funcionário
            </label>
            <Select
            value={selectedFuncionario}
            onChange={(e) => setSelectedFuncionario(e.target.value)}
            options={[
            {
              value: '',
              label: 'Selecione um funcionário...'
            },
            ...funcionarios.map((f) => ({
              value: f.id,
              label: cadastrados.has(f.id) ?
              `${f.nome} (✅ Cadastrado)` :
              f.nome
            }))]
            } />
          
          </div>
          <Button
          className="w-full"
          onClick={handleIniciarCadastro}
          disabled={!selectedFuncionario}>
          
            <CameraIcon className="w-5 h-5 mr-2" />
            Iniciar Captura
          </Button>
        </div>
      }

      {(status === 'loading_models' ||
      status === 'ready' ||
      status === 'capturing' ||
      status === 'error') &&
      <div className="space-y-4">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
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
            {status === 'capturing' &&
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="w-full h-1 bg-teal-400/80 shadow-[0_0_15px_rgba(45,212,191,0.8)] animate-[scan_2s_ease-in-out_infinite]" />
              </div>
          }

            {status === 'loading_models' &&
          <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center text-white z-10">
                <Loader2Icon className="w-8 h-8 animate-spin mb-2 text-teal-500" />
                <p>Carregando IA...</p>
              </div>
          }

            {status === 'error' &&
          <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center text-white p-4 text-center z-10">
                <AlertTriangleIcon className="w-8 h-8 mb-2 text-red-500" />
                <p>{errorMessage}</p>
                <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => setStatus('idle')}>
              
                  Voltar
                </Button>
              </div>
          }

            {(status === 'ready' || status === 'capturing') &&
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
              className={`w-48 h-64 border-2 rounded-[100%] border-dashed transition-colors duration-300 ${status === 'capturing' ? 'border-teal-400' : 'border-white/50'}`} />
            
              </div>
          }
          </div>

          {(status === 'ready' || status === 'capturing') &&
        <div className="text-center">
              <div className="mb-4">
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>Progresso do Escaneamento</span>
                  <span>{amostras.length} / 4</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                className="bg-teal-600 h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${amostras.length / 4 * 100}%`
                }}>
              </div>
                </div>
              </div>

              {status === 'ready' ?
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={iniciarEscaneamento}>
            
                  <CameraIcon className="w-5 h-5 mr-2" /> Iniciar Escaneamento
                  Automático
                </Button> :

          <Button className="w-full" disabled variant="secondary">
                  <Loader2Icon className="w-5 h-5 animate-spin mr-2" />{' '}
                  Escaneando o rosto... Mova-se levemente.
                </Button>
          }
            </div>
        }
        </div>
      }

      {status === 'success' &&
      <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900">
            Cadastro Concluído!
          </h3>
          <p className="text-gray-500 mt-2">
            O funcionário já pode bater ponto no kiosk facial.
          </p>
        </div>
      }
    </Card>);

}