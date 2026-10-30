import React, { useCallback, useEffect, useState, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/useToast';
import {
  Camera,
  UserPlus,
  CheckCircle,
  Loader2,
  MapPin,
  ArrowLeft,
  ScanFace } from
'lucide-react';
import { Button } from '../components/ui/Button';
// CDN para os modelos do face-api
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
// Distância máxima Euclidiana para considerar um "match" (menor é mais rigoroso)
const MATCH_THRESHOLD = 0.45;
interface FuncionarioBiometria {
  id: string;
  nome: string;
  descriptors: number[][];
}
interface Funcionario {
  id: string;
  nome: string;
  tem_biometria: boolean;
}
interface MatchResult {
  funcionarioId: string;
  nome: string;
  tipo: 'entrada' | 'saida';
  confianca: number;
}
// Resolve a clínica atual (mesma estratégia usada na BiometriaPage de digital)
function getClinicaId(): string {
  try {
    const sessao = JSON.parse(localStorage.getItem('sessao') || '{}');
    return sessao?.clinicaAtual?.id || sessao?.usuario?.clinicaId || '';
  } catch (_) {
    return '';
  }
}
// ⭐ Raio máximo permitido (em metros) para bater ponto a partir da clínica.
const RAIO_PERMITIDO_METROS = 200;
// Coordenadas configuradas da clínica atual (se houver). Quando ausentes,
// não é possível travar por localização e o ponto é liberado.
function getClinicaCoords(): {
  lat: number;
  lng: number;
} | null {
  try {
    const sessao = JSON.parse(localStorage.getItem('sessao') || '{}');
    const c = sessao?.clinicaAtual || {};
    const lat = parseFloat(c.latitude);
    const lng = parseFloat(c.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && (lat !== 0 || lng !== 0)) {
      return {
        lat,
        lng
      };
    }
  } catch (_) {}
  return null;
}
// Distância em metros entre dois pontos (fórmula de Haversine).
function distanciaMetros(
lat1: number,
lng1: number,
lat2: number,
lng2: number)
: number {
  const R = 6371000; // raio da Terra em metros
  const toRad = (g: number) => g * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
  Math.sin(dLat / 2) * Math.sin(dLat / 2) +
  Math.cos(toRad(lat1)) *
  Math.cos(toRad(lat2)) *
  Math.sin(dLng / 2) *
  Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function BiometriaFacialPage({
  onNavigate


}: {onNavigate?: (page: string) => void;}) {
  const { success, error, info } = useToast();
  const clinicaId = getClinicaId();
  const [mode, setMode] = useState<'ponto' | 'cadastro'>('ponto');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Carregando modelos de IA...');
  const [funcionariosBiometria, setFuncionariosBiometria] = useState<
    FuncionarioBiometria[]>(
    []);
  const [funcionariosCadastro, setFuncionariosCadastro] = useState<
    Funcionario[]>(
    []);
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [tipoPonto, setTipoPonto] = useState<'entrada' | 'saida'>('entrada');
  const [gpsStatus, setGpsStatus] = useState<string>('');
  // Estado da câmera para diagnóstico/fallback manual
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);
  // Trava de GPS: dentroDoRaio = true (liberado), false (bloqueado), null (verificando)
  const [dentroDoRaio, setDentroDoRaio] = useState<boolean | null>(null);
  const coordsRef = useRef<{
    lat: number;
    lng: number;
  } | null>(null);
  const clinicaCoords = getClinicaCoords();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  // ---------- Carregar modelos de IA ----------
  useEffect(() => {
    let cancelado = false;
    const loadModels = async () => {
      try {
        setLoadingMsg('Carregando modelos de IA...');
        await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL)]
        );
        if (!cancelado) setModelsLoaded(true);
      } catch (err: any) {
        console.error('Erro ao carregar modelos:', err);
        if (!cancelado)
        setLoadingMsg(
          'Falha ao carregar os modelos de IA. Verifique a conexão.'
        );
      }
    };
    loadModels();
    return () => {
      cancelado = true;
    };
  }, []);
  // ---------- Carregar dados conforme o modo ----------
  const loadFuncionariosBiometria = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/funcionarios-biometria?clinicaId=${clinicaId}`
      );
      const data = await res.json();
      const lista: FuncionarioBiometria[] = Array.isArray(data) ? data : [];
      setFuncionariosBiometria(lista);
      const labeled = lista.
      filter((f) => Array.isArray(f.descriptors) && f.descriptors.length > 0).
      map(
        (f) =>
        new faceapi.LabeledFaceDescriptors(
          f.id,
          f.descriptors.map((d) => new Float32Array(d))
        )
      );
      faceMatcherRef.current =
      labeled.length > 0 ?
      new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD) :
      null;
    } catch (err) {
      console.error('Erro ao carregar funcionários com biometria:', err);
      setFuncionariosBiometria([]);
      faceMatcherRef.current = null;
    }
  }, [clinicaId]);
  const loadFuncionariosCadastro = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/funcionarios?clinicaId=${clinicaId}`
      );
      const data = await res.json();
      setFuncionariosCadastro(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar funcionários:', err);
      setFuncionariosCadastro([]);
    }
  }, [clinicaId]);
  useEffect(() => {
    if (!modelsLoaded) return;
    if (mode === 'ponto') loadFuncionariosBiometria();else
    loadFuncionariosCadastro();
  }, [modelsLoaded, mode, loadFuncionariosBiometria, loadFuncionariosCadastro]);
  // ---------- GPS (trava por raio da clínica, ativada por padrão) ----------
  const capturarLocalizacao = useCallback(() => {
    const coords = getClinicaCoords();
    // Sem coordenadas configuradas na clínica não há como travar: libera.
    if (!coords) {
      setDentroDoRaio(true);
      setGpsStatus('Localização da clínica não configurada — trava desativada');
      return;
    }
    if (!navigator.geolocation) {
      setDentroDoRaio(false);
      setGpsStatus('GPS indisponível neste dispositivo — ponto bloqueado');
      return;
    }
    setDentroDoRaio(null);
    setGpsStatus('Verificando localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        coordsRef.current = {
          lat: latitude,
          lng: longitude
        };
        const dist = distanciaMetros(
          latitude,
          longitude,
          coords.lat,
          coords.lng
        );
        if (dist <= RAIO_PERMITIDO_METROS) {
          setDentroDoRaio(true);
          setGpsStatus(`Na clínica (${Math.round(dist)} m)`);
        } else {
          setDentroDoRaio(false);
          setGpsStatus(
            `Fora da clínica (${Math.round(dist)} m) — ponto bloqueado`
          );
        }
      },
      () => {
        setDentroDoRaio(false);
        setGpsStatus('Localização não autorizada — ponto bloqueado');
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    );
  }, []);
  // ---------- Câmera ----------
  const startCamera = useCallback(async () => {
    setStartingCamera(true);
    setCameraError(null);
    setCameraReady(false);
    // Pré-checagem de contexto seguro: getUserMedia exige HTTPS (ou localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      setStartingCamera(false);
      setCameraError(
        !window.isSecureContext ?
        'A câmera exige uma conexão segura (HTTPS). Abra o sistema por uma URL https:// e tente novamente.' :
        'Este navegador não suporta acesso à câmera. Use o Chrome ou Safari atualizado.'
      );
      return;
    }
    try {
      // Encerra qualquer stream anterior antes de reabrir
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user'
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            setCameraReady(true);
          } catch (e) {
            console.error('Erro ao reproduzir vídeo:', e);
          }
        };
      }
    } catch (err: any) {
      console.error('Erro ao acessar a câmera:', err);
      let msg = `Não foi possível acessar a câmera: ${err?.message || err}`;
      if (err?.name === 'NotAllowedError') {
        msg =
        'Permissão negada. Toque no ícone de cadeado/câmera na barra do navegador e permita o acesso à câmera.';
      } else if (err?.name === 'NotFoundError') {
        msg = 'Nenhuma câmera encontrada neste dispositivo.';
      } else if (err?.name === 'NotReadableError') {
        msg =
        'A câmera está em uso por outro aplicativo. Feche-o e tente novamente.';
      }
      setCameraError(msg);
      error('Câmera', msg);
    } finally {
      setStartingCamera(false);
    }
  }, [error]);
  const stopCamera = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);
  // Liga a câmera quando os modelos carregam, religa ao trocar de modo
  useEffect(() => {
    if (!modelsLoaded) return;
    startCamera();
    if (mode === 'ponto') capturarLocalizacao();
    return () => stopCamera();
  }, [modelsLoaded, mode, startCamera, stopCamera, capturarLocalizacao]);
  // ---------- Detecção contínua para bater ponto ----------
  const detectarParaPonto = useCallback(async () => {
    if (!videoRef.current || isProcessing || matchResult) return;
    const matcher = faceMatcherRef.current;
    if (!matcher) return;
    try {
      const deteccao = await faceapi.
      detectSingleFace(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions()
      ).
      withFaceLandmarks().
      withFaceDescriptor();
      if (!deteccao) return;
      const best = matcher.findBestMatch(deteccao.descriptor);
      if (best.label === 'unknown' || best.distance > MATCH_THRESHOLD) return;
      const func = funcionariosBiometria.find((f) => f.id === best.label);
      if (!func) return;
      setMatchResult({
        funcionarioId: func.id,
        nome: func.nome,
        tipo: tipoPonto,
        confianca: best.distance
      });
    } catch (err) {

      // Ignora falhas pontuais de detecção
    }}, [isProcessing, matchResult, funcionariosBiometria, tipoPonto]);
  useEffect(() => {
    if (mode !== 'ponto' || !modelsLoaded) return;
    if (detectionIntervalRef.current)
    clearInterval(detectionIntervalRef.current);
    detectionIntervalRef.current = setInterval(detectarParaPonto, 700);
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [mode, modelsLoaded, detectarParaPonto]);
  // ---------- Confirmar registro de ponto ----------
  const confirmarPonto = async () => {
    if (!matchResult) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/registros-ponto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          funcionario_id: matchResult.funcionarioId,
          tipo: matchResult.tipo,
          confianca: matchResult.confianca,
          clinicaId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
      throw new Error(data.error || 'Falha ao registrar ponto');
      success('Ponto Registrado', `${matchResult.nome} — ${matchResult.tipo}`);
      // Tela de sucesso some sozinha após 4s
      setTimeout(() => {
        setMatchResult(null);
      }, 4000);
    } catch (err: any) {
      error('Erro', err.message || 'Não foi possível registrar o ponto');
      setMatchResult(null);
    } finally {
      setIsProcessing(false);
    }
  };
  // ---------- Cadastro de rosto ----------
  const handleCadastrarRosto = async () => {
    if (!selectedFuncionario) {
      info('Selecione', 'Escolha um funcionário antes de cadastrar.');
      return;
    }
    if (!videoRef.current) return;
    setIsProcessing(true);
    try {
      const deteccao = await faceapi.
      detectSingleFace(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions()
      ).
      withFaceLandmarks().
      withFaceDescriptor();
      if (!deteccao) {
        error(
          'Rosto não detectado',
          'Posicione o rosto no centro e tente novamente.'
        );
        return;
      }
      const descriptor = Array.from(deteccao.descriptor);
      const res = await fetch(`${API_BASE_URL}/api/biometria-facial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          funcionario_id: selectedFuncionario,
          descriptor
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
      throw new Error(data.error || 'Falha ao cadastrar rosto');
      success('Rosto Cadastrado', 'Amostra registrada com sucesso.');
      await loadFuncionariosCadastro();
    } catch (err: any) {
      error('Erro', err.message || 'Não foi possível cadastrar o rosto');
    } finally {
      setIsProcessing(false);
    }
  };
  // ---------- Render ----------
  if (!modelsLoaded) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center text-white z-50">
        <Loader2 className="w-12 h-12 animate-spin text-teal-400 mb-4" />
        <p className="text-lg font-medium">{loadingMsg}</p>
        <p className="text-sm text-gray-400 mt-2">
          Pode levar alguns segundos na primeira vez.
        </p>
      </div>);

  }
  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <header className="bg-gray-800 text-white p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate?.('dashboard')}
            className="p-2 hover:bg-gray-700 rounded-full transition-colors"
            aria-label="Voltar">
            
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ScanFace className="w-6 h-6 text-teal-400" />
            Ponto Facial
          </h1>
        </div>
        <div className="flex bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => {
              setMatchResult(null);
              setMode('ponto');
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'ponto' ? 'bg-teal-600 text-white' : 'text-gray-300'}`}>
            
            Bater Ponto
          </button>
          <button
            onClick={() => {
              setMatchResult(null);
              setMode('cadastro');
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'cadastro' ? 'bg-teal-600 text-white' : 'text-gray-300'}`}>
            
            Cadastrar
          </button>
        </div>
      </header>

      {/* Área da câmera */}
      <main className="flex-1 relative flex flex-col items-center justify-center bg-black overflow-y-auto p-4">
        <div className="relative w-full max-w-2xl aspect-[4/3] bg-gray-800 rounded-xl overflow-hidden shadow-2xl border border-gray-700">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{
              transform: 'scaleX(-1)'
            }} />
          

          {/* Iniciando câmera */}
          {startingCamera &&
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 text-white z-30">
              <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-3" />
              <p className="text-sm">Iniciando câmera...</p>
            </div>
          }

          {/* Erro / fallback manual */}
          {!startingCamera && (cameraError || !cameraReady) &&
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 text-white z-30 p-6 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                <Camera className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-sm text-gray-200 mb-5 max-w-sm">
                {cameraError || 'Toque para ativar a câmera.'}
              </p>
              <Button onClick={startCamera} className="px-6 py-3">
                <Camera className="w-5 h-5 mr-2" />
                Ativar câmera
              </Button>
              <p className="text-xs text-gray-500 mt-4">
                A câmera exige conexão segura (HTTPS) e permissão do navegador.
              </p>
            </div>
          }

          {/* Guia de enquadramento */}
          {cameraReady &&
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-56 border-2 border-dashed border-white/30 rounded-full" />
            </div>
          }

          {/* Overlay de sucesso */}
          {matchResult &&
          <div className="absolute inset-0 bg-teal-900/90 flex flex-col items-center justify-center text-white z-20">
              <CheckCircle className="w-24 h-24 text-teal-400 mb-4" />
              <h2 className="text-3xl font-bold mb-2">{matchResult.nome}</h2>
              <p className="text-xl text-teal-200 mb-6">
                Marcar <strong className="uppercase">{matchResult.tipo}</strong>
                ?
              </p>
              <div className="flex gap-3">
                <Button
                onClick={confirmarPonto}
                disabled={isProcessing}
                className="px-8 py-3 text-lg">
                
                  {isProcessing ?
                <Loader2 className="w-5 h-5 animate-spin" /> :

                'Confirmar'
                }
                </Button>
                <Button
                variant="ghost"
                onClick={() => setMatchResult(null)}
                className="px-6 py-3 text-lg text-white">
                
                  Cancelar
                </Button>
              </div>
              <p className="text-sm text-teal-400/60 mt-6">
                Confiança: {(1 - matchResult.confianca).toFixed(2)}
              </p>
            </div>
          }

          {/* Loader de processamento */}
          {isProcessing && !matchResult &&
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            </div>
          }
        </div>

        {/* Painel inferior */}
        <div className="w-full max-w-2xl mt-6">
          {mode === 'ponto' ?
          <div className="text-center text-gray-400">
              <p className="text-lg">
                {faceMatcherRef.current ?
              'Posicione o rosto para bater o ponto.' :
              'Nenhum funcionário com rosto cadastrado ainda.'}
              </p>
              <div className="flex justify-center gap-3 mt-4">
                <button
                onClick={() => setTipoPonto('entrada')}
                className={`px-6 py-3 rounded-lg font-medium ${tipoPonto === 'entrada' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                
                  Entrada
                </button>
                <button
                onClick={() => setTipoPonto('saida')}
                className={`px-6 py-3 rounded-lg font-medium ${tipoPonto === 'saida' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                
                  Saída
                </button>
              </div>
              {gpsStatus &&
            <p
              className={`text-sm mt-4 flex items-center justify-center gap-1 ${dentroDoRaio === false ? 'text-red-400' : dentroDoRaio === true ? 'text-teal-400' : 'text-gray-500'}`}>
              
                  <MapPin className="w-4 h-4" />
                  {gpsStatus}
                </p>
            }
            </div> :

          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-400" />
                Cadastrar rosto do funcionário
              </h3>
              <div className="flex gap-3">
                <select
                value={selectedFuncionario}
                onChange={(e) => setSelectedFuncionario(e.target.value)}
                className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2">
                
                  <option value="">Selecione um funcionário...</option>
                  {funcionariosCadastro.map((f) =>
                <option key={f.id} value={f.id}>
                      {f.nome} {f.tem_biometria ? '✓' : '(sem rosto)'}
                    </option>
                )}
                </select>
                <Button
                onClick={handleCadastrarRosto}
                disabled={isProcessing || !selectedFuncionario}>
                
                  {isProcessing ?
                <Loader2 className="w-5 h-5 animate-spin" /> :

                <Camera className="w-5 h-5" />
                }
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Posicione o rosto centralizado e toque no botão da câmera.
                Capture 2 a 3 vezes para melhor precisão.
              </p>
            </div>
          }
        </div>
      </main>
    </div>);

}