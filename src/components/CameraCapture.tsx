import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { CameraIcon, RotateCcwIcon, CheckIcon, FlipHorizontalIcon } from 'lucide-react';
interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}
export function CameraCapture({
  isOpen,
  onClose,
  onCapture,
  title = 'Capturar Documento'
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  // ⭐⭐⭐ FIX: Ref para facingMode - garante que startCamera sempre usa o valor atual ⭐⭐⭐
  const facingModeRef = useRef(facingMode);
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);
  // Para a câmera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);
  // Inicializa a câmera
  // ⭐⭐⭐ FIX: Usa facingModeRef em vez de facingMode no closure ⭐⭐⭐
  // Isso garante que toggleFacingMode sempre inicia com o modo correto
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setHasPermission(null);
      setCameraReady(false);
      // Para stream anterior se existir
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      // Aguarda um pouco para garantir que a câmera foi liberada
      await new Promise((resolve) => setTimeout(resolve, 200));
      // ⭐ Usa ref para pegar o valor mais recente do facingMode
      const currentFacingMode = facingModeRef.current;
      // Configurações da câmera
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: currentFacingMode,
          width: {
            ideal: 1920
          },
          height: {
            ideal: 1080
          }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Aguarda o vídeo estar pronto
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            setCameraReady(true);
          } catch (e) {
            console.error('Erro ao reproduzir vídeo:', e);
          }
        };
      }
      setHasPermission(true);
      // Lista dispositivos disponíveis
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = deviceList.filter((device) => device.kind === 'videoinput');
      setDevices(videoDevices);
    } catch (err: any) {
      console.error('Erro ao acessar câmera:', err);
      setHasPermission(false);
      setCameraReady(false);
      if (err.name === 'NotAllowedError') {
        setError('Permissão negada. Por favor, permita o acesso à câmera nas configurações do navegador.');
      } else if (err.name === 'NotFoundError') {
        setError('Nenhuma câmera encontrada neste dispositivo.');
      } else if (err.name === 'NotReadableError') {
        setError('A câmera está sendo usada por outro aplicativo.');
      } else {
        setError(`Erro ao acessar câmera: ${err.message}`);
      }
    }
  }, []); // ⭐ Sem dependência de facingMode - usa ref
  // Inicia câmera quando modal abre
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setError(null);
      setIsProcessing(false);
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setError(null);
      setIsProcessing(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);
  // Captura a imagem - SEM FILTRO DE CONTRASTE
  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) {
      setIsCapturing(false);
      return;
    }
    // Define tamanho do canvas igual ao vídeo
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    // Desenha o frame atual do vídeo no canvas - SEM NENHUM FILTRO
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Converte para data URL diretamente - SEM PROCESSAMENTO
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    setIsCapturing(false);
    // Para a câmera após capturar
    stopCamera();
  }, [stopCamera]);
  // Refaz a captura
  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);
  // Confirma e envia a imagem
  const handleConfirm = useCallback(async () => {
    if (!capturedImage) return;
    setIsProcessing(true);
    try {
      // Converte data URL para Blob de forma robusta
      const base64Data = capturedImage.split(',')[1];
      if (!base64Data) {
        throw new Error('Formato de imagem inválido');
      }
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: 'image/jpeg'
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File([blob], `documento_${timestamp}.jpg`, {
        type: 'image/jpeg'
      });
      onCapture(file);
      onClose();
    } catch (err: any) {
      console.error('Erro ao processar imagem:', err);
      setError(`Erro ao processar imagem: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImage, onCapture, onClose]);
  // Alterna câmera frontal/traseira
  const toggleFacingMode = useCallback(() => {
    setFacingMode((prev) => {
      const newMode = prev === 'user' ? 'environment' : 'user';
      // Reinicia a câmera com o novo modo após um pequeno delay
      setTimeout(() => startCamera(), 100);
      return newMode;
    });
  }, [startCamera]);
  // Fecha o modal
  const handleClose = useCallback(() => {
    stopCamera();
    setCapturedImage(null);
    setError(null);
    onClose();
  }, [stopCamera, onClose]);
  return <Modal isOpen={isOpen} onClose={handleClose} title={title} size="large">
      <div className="space-y-4">
        {/* Área de visualização */}
        <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3]">
          {/* Vídeo da câmera */}
          {!capturedImage && <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{
          transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
        }} />}

          {/* Imagem capturada */}
          {capturedImage && <img src={capturedImage} alt="Documento capturado" className="w-full h-full object-contain bg-gray-900" />}

          {/* Canvas oculto para processamento */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Overlay de guia para documento */}
          {!capturedImage && hasPermission && cameraReady && <div className="absolute inset-0 pointer-events-none">
              {/* Guia de enquadramento */}
              <div className="absolute inset-8 border-2 border-white/50 rounded-lg">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
              </div>

              {/* Texto de instrução */}
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
                  📄 Posicione o documento dentro da área
                </p>
              </div>
            </div>}

          {/* Estado de carregamento */}
          {hasPermission === null && !error && <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white">Iniciando câmera...</p>
              </div>
            </div>}

          {/* Estado de erro */}
          {error && <div className="absolute inset-0 flex items-center justify-center bg-gray-900 p-6">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CameraIcon className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-white mb-4">{error}</p>
                <Button onClick={startCamera} variant="secondary">
                  <RotateCcwIcon className="w-4 h-4 mr-2" />
                  Tentar Novamente
                </Button>
              </div>
            </div>}

          {/* Flash de captura */}
          {isCapturing && <div className="absolute inset-0 bg-white animate-pulse" />}
        </div>

        {/* Controles */}
        <div className="flex items-center justify-between">
          {/* Controles da esquerda */}
          <div className="flex items-center gap-2">
            {devices.length > 1 && !capturedImage && <Button variant="ghost" size="sm" onClick={toggleFacingMode} title="Alternar câmera">
              
                <FlipHorizontalIcon className="w-5 h-5" />
              </Button>}
          </div>

          {/* Botão principal */}
          <div className="flex items-center gap-4">
            {!capturedImage ? <button onClick={handleCapture} disabled={!hasPermission || isCapturing || !cameraReady} className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 hover:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center group" title="Capturar">
              
                <div className="w-12 h-12 rounded-full bg-white group-hover:bg-blue-50 transition-colors" />
              </button> : <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={handleRetake} className="text-gray-600" disabled={isProcessing}>
                
                  <RotateCcwIcon className="w-5 h-5 mr-2" />
                  Refazer
                </Button>
                <Button onClick={handleConfirm} disabled={isProcessing}>
                  {isProcessing ? <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Salvando...
                    </> : <>
                      <CheckIcon className="w-5 h-5 mr-2" />
                      Usar Esta Foto
                    </>}
                </Button>
              </div>}
          </div>

          {/* Controles da direita */}
          <div className="w-10" />
        </div>

        {/* Dicas */}
        {!capturedImage && hasPermission && <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">
              💡 Dicas para uma boa captura:
            </h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>
                • Posicione o documento em uma superfície plana e bem iluminada
              </li>
              <li>• Evite sombras e reflexos sobre o documento</li>
              <li>• Mantenha a câmera paralela ao documento</li>
              <li>• Certifique-se de que todo o conteúdo está visível</li>
            </ul>
          </div>}
      </div>
    </Modal>;
}