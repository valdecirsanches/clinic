import { useState, useEffect, useCallback, useRef } from 'react';
import {
  WhatsAppStatus,
  WhatsAppStatusResponse,
  WhatsAppHealthResponse,
  SendMessageRequest,
  SendMessageResponse } from
'../types/whatsapp';
import { API_BASE_URL, WAHA_API_KEY } from '../config/api';
import { urlComToken } from '../utils/autenticacaoApi';

// ⭐⭐⭐ GLOBAL AUTH ERROR CACHE - compartilhado entre TODAS as instâncias do hook ⭐⭐⭐
// Quando qualquer instância detecta 401, TODAS param de fazer chamadas por 5 minutos
const authErrorCache = new Map<string, number>();
const AUTH_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutos

function isAuthBlocked(serverUrl: string): boolean {
  if (!serverUrl) return false;
  const timestamp = authErrorCache.get(serverUrl);
  if (!timestamp) return false;
  if (Date.now() - timestamp > AUTH_ERROR_COOLDOWN) {
    authErrorCache.delete(serverUrl);
    return false;
  }
  return true;
}
function setAuthError(serverUrl: string) {
  if (serverUrl) {
    console.log(
      `🛑 [useWhatsApp] AUTH BLOCKED: ${serverUrl} — todas as chamadas bloqueadas por 5 min`
    );
    authErrorCache.set(serverUrl, Date.now());
  }
}

// Exporta para outros módulos poderem verificar/limpar
export function clearWhatsAppAuthError(serverUrl: string) {
  if (serverUrl) {
    console.log(`🔓 [useWhatsApp] AUTH UNBLOCKED: ${serverUrl}`);
    authErrorCache.delete(serverUrl);
  }
}
export function isWhatsAppAuthBlocked(serverUrl: string): boolean {
  return isAuthBlocked(serverUrl);
}
export function useWhatsApp(
serverUrl: string,
sessionName: string,
apiKeyProp?: string)
{
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [isReady, setIsReady] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const statusRef = useRef<WhatsAppStatus>('disconnected');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ⭐ Track da apiKey anterior para detectar mudanças
  const prevApiKeyRef = useRef<string | undefined>(apiKeyProp);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // ⭐⭐⭐ Limpa cache de auth error quando apiKey muda (usuário corrigiu a key) ⭐⭐⭐
  useEffect(() => {
    if (apiKeyProp && apiKeyProp !== prevApiKeyRef.current && serverUrl) {
      console.log('🔑 [useWhatsApp] API Key mudou, limpando bloqueio de auth');
      clearWhatsAppAuthError(serverUrl);
    }
    prevApiKeyRef.current = apiKeyProp;
  }, [apiKeyProp, serverUrl]);
  const getApiKey = useCallback(async (): Promise<string> => {
    // 1. Prioridade máxima: variável de ambiente (.env.local)
    if (WAHA_API_KEY && WAHA_API_KEY.trim() !== '') {
      return WAHA_API_KEY;
    }
    // 2. Prop passada diretamente
    if (apiKeyProp && apiKeyProp.trim() !== '') {
      return apiKeyProp;
    }
    // 3. Fallback: busca do banco (config da clínica)
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        const cId = parsed.clinicaAtual?.id || '';
        if (cId) {
          const configResp = await fetch(
            `${API_BASE_URL}/api/whatsapp-config?clinicaId=${cId}`
          );
          if (configResp.ok) {
            const cfgData = await configResp.json();
            if (cfgData.apiKey && cfgData.apiKey.trim() !== '') {
              return cfgData.apiKey;
            }
          }
        }
      }
    } catch (e) {

      /* ignora */}
    return '';
  }, [apiKeyProp]);

  // ⭐ Helper: pega clinicaId do localStorage para fallback de apiKey no servidor
  const getClinicaId = useCallback((): string => {
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        return parsed.clinicaAtual?.id || '';
      }
    } catch (e) {

      /* ignora */}
    return '';
  }, []);

  // Carrega status inicial do localStorage
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    let clinicaId = '';
    if (sessao) {
      const parsed = JSON.parse(sessao);
      clinicaId = parsed.clinicaAtual?.id || '';
    }
    if (!clinicaId) {
      console.log('⚠️ [useWhatsApp] Sem clínica selecionada');
      return;
    }
    const statusKey = `whatsapp_session_status_${clinicaId}`;
    const storedStatus = localStorage.getItem(statusKey);
    if (storedStatus) {
      try {
        const parsed = JSON.parse(storedStatus);
        const isRecent = Date.now() - parsed.timestamp < 5 * 60 * 1000;
        if (parsed.sessionName === sessionName && isRecent) {
          setStatus(parsed.status);
          setIsReady(parsed.isReady);
        } else {
          setStatus('disconnected');
          setIsReady(false);
        }
      } catch (err) {
        console.error('❌ Erro ao carregar status do localStorage:', err);
      }
    }
  }, [sessionName]);

  // ==================== HEALTH CHECK (VIA PROXY) ====================
  const checkHealth = useCallback(async (): Promise<boolean> => {
    // ⭐⭐⭐ GLOBAL CHECK: Se auth está bloqueado, nem tenta ⭐⭐⭐
    if (isAuthBlocked(serverUrl)) {
      console.log('🛑 [useWhatsApp] checkHealth BLOQUEADO (auth error cache)');
      return false;
    }
    try {
      const apiKey = await getApiKey();
      const apiKeyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';
      const proxyUrl = `${API_BASE_URL}/api/whatsapp/health?serverUrl=${encodeURIComponent(serverUrl)}${apiKeyParam}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          setAuthError(serverUrl);
          return false;
        }
        try {
          const errorData = await response.json();
          if (
          errorData.statusCode === 401 ||
          errorData.message === 'Unauthorized')
          {
            setAuthError(serverUrl);
            return false;
          }
        } catch (e) {}
        return false;
      }
      const data = await response.json();
      if (data.statusCode === 401 || data.message === 'Unauthorized') {
        setAuthError(serverUrl);
        return false;
      }
      return data.status === 'OK' || data.status === 'ok';
    } catch (err) {
      console.error('❌ Health check error:', err);
      return false;
    }
  }, [serverUrl, getApiKey]);

  // ==================== GET STATUS (VIA PROXY) ====================
  const getStatus = useCallback(async () => {
    if (!serverUrl) return;

    // ⭐⭐⭐ GLOBAL CHECK: Se auth está bloqueado, nem tenta ⭐⭐⭐
    if (isAuthBlocked(serverUrl)) {
      console.log('🛑 [useWhatsApp] getStatus BLOQUEADO (auth error cache)');
      setError('API Key inválida ou ausente (401)');
      setStatus('disconnected');
      setIsReady(false);
      return;
    }
    try {
      const apiKey = await getApiKey();
      const apiKeyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';
      const proxyUrl = `${API_BASE_URL}/api/whatsapp/status?serverUrl=${encodeURIComponent(serverUrl)}&sessionName=${encodeURIComponent(sessionName)}${apiKeyParam}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          setAuthError(serverUrl);
          setError('API Key inválida ou ausente (401)');
          setStatus('disconnected');
          setIsReady(false);
          setIsLoading(false);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.statusCode === 401 || data.message === 'Unauthorized') {
        setAuthError(serverUrl);
        setError('API Key inválida ou ausente (401)');
        setStatus('disconnected');
        setIsReady(false);
        setIsLoading(false);
        return;
      }
      console.log(
        '✅ [useWhatsApp] Status:',
        JSON.stringify(data).substring(0, 300)
      );

      // Normaliza o status do WAHA para nosso formato
      let normalizedStatus: WhatsAppStatus = 'disconnected';
      const wahaStatus = (data.status || data.state || '').toUpperCase();
      if (
      wahaStatus === 'WORKING' ||
      wahaStatus === 'CONNECTED' ||
      wahaStatus === 'ONLINE')
      {
        normalizedStatus = 'connected';
        setIsReady(true);
      } else if (
      wahaStatus === 'SCAN_QR_CODE' ||
      wahaStatus === 'WAITING_SCAN' ||
      wahaStatus === 'QR')
      {
        normalizedStatus = 'waiting_scan';
        setIsReady(false);
      } else if (wahaStatus === 'STARTING' || wahaStatus === 'INITIALIZING') {
        normalizedStatus = 'initializing';
        setIsReady(false);
      } else if (wahaStatus === 'FAILED' || wahaStatus === 'ERROR') {
        normalizedStatus = 'error';
        setIsReady(false);
      } else if (wahaStatus === 'NOT_FOUND') {
        // Uma sessão ausente nunca pode herdar o estado de outra sessão.
        normalizedStatus = 'disconnected';
        setIsReady(false);
      } else if (wahaStatus === 'STOPPED' || wahaStatus === 'DISCONNECTED') {
        normalizedStatus = 'disconnected';
        setIsReady(false);
      } else {
        setIsReady(data.isReady || false);
        normalizedStatus = data.status || 'disconnected';
      }
      setStatus(normalizedStatus);

      // ⭐⭐⭐ EXTRAI QR CODE DE MÚLTIPLOS FORMATOS ⭐⭐⭐
      const rawQrCode = data.qrCode || data.qr || null;
      setQrCode(rawQrCode);

      // ⭐⭐⭐ EXTRAI QR CODE IMAGE - MÚLTIPLAS FONTES ⭐⭐⭐
      let resolvedQrImage: string | null = null;

      // 1. Imagem retornada diretamente pelo proxy (base64 data URL)
      if (data.qrCodeImage) {
        resolvedQrImage = data.qrCodeImage;
        console.log('🔍 [useWhatsApp] QR Image: via data.qrCodeImage');
      }
      // 2. QR como objeto com image/url
      else if (data.qr && typeof data.qr === 'object') {
        resolvedQrImage = data.qr.image || data.qr.url || null;
        if (resolvedQrImage)
        console.log('🔍 [useWhatsApp] QR Image: via data.qr.image/url');
      }
      // 3. QR como data URL string
      else if (typeof rawQrCode === 'string' && rawQrCode.startsWith('data:')) {
        resolvedQrImage = rawQrCode;
        console.log('🔍 [useWhatsApp] QR Image: via data URL string');
      }
      // 4. ⭐⭐⭐ FALLBACK: Constrói URL para buscar QR image do WAHA via proxy ⭐⭐⭐
      else if (
      normalizedStatus === 'waiting_scan' &&
      serverUrl &&
      sessionName)
      {
        // Usa o proxy do servidor para buscar a imagem do QR
        const qrImageUrl = `${API_BASE_URL}/api/whatsapp/qr-image?serverUrl=${encodeURIComponent(serverUrl)}&sessionName=${encodeURIComponent(sessionName)}${apiKeyParam}&t=${Date.now()}`;
        resolvedQrImage = urlComToken(qrImageUrl);
        console.log('🔍 [useWhatsApp] QR Image: via proxy qr-image endpoint');
      }
      setQrCodeImage(resolvedQrImage);
      if (normalizedStatus === 'waiting_scan') {
        console.log(
          `🔍 [useWhatsApp] QR Code raw: ${rawQrCode ? rawQrCode.substring(0, 50) + '...' : 'null'}`
        );
        console.log(
          `🔍 [useWhatsApp] QR Image: ${resolvedQrImage ? resolvedQrImage.substring(0, 80) + '...' : 'null'}`
        );
      }
      setError(null);

      // Salva no localStorage
      const sessao = localStorage.getItem('sessao');
      let clinicaId = '';
      if (sessao) {
        const parsed = JSON.parse(sessao);
        clinicaId = parsed.clinicaAtual?.id || '';
      }
      if (clinicaId) {
        localStorage.setItem(
          `whatsapp_session_status_${clinicaId}`,
          JSON.stringify({
            sessionName,
            status: normalizedStatus,
            isReady: normalizedStatus === 'connected',
            timestamp: Date.now()
          })
        );
      }
      if (
      normalizedStatus === 'connected' ||
      normalizedStatus === 'authenticated')
      {
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('❌ [useWhatsApp] Get status failed:', err);
      setError(err.message);
      setIsLoading(false);
    }
  }, [serverUrl, sessionName, getApiKey]);

  // ⭐⭐⭐ FIX: Busca status quando params mudam, MAS respeita auth cache ⭐⭐⭐
  useEffect(() => {
    if (sessionName && serverUrl && !isAuthBlocked(serverUrl)) {
      const timer = setTimeout(() => {
        getStatus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [sessionName, serverUrl, getStatus, apiKeyProp]);

  // ==================== INITIALIZE (VIA PROXY) ====================
  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setQrCode(null);
    setQrCodeImage(null);
    try {
      console.log('🚀 [useWhatsApp] Inicializando via proxy...');
      const apiKey = await getApiKey();
      const clinicaId = getClinicaId();
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/session/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl,
            sessionName,
            apiKey,
            clinicaId
          })
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Initialize failed:', response.status, errorText);
        throw new Error(`Falha ao inicializar: ${response.status}`);
      }
      const result = await response.json();
      console.log('✅ Initialize:', result);
      setStatus('initializing');

      // ⭐⭐⭐ POLLING CORRIGIDO: usa statusRef para evitar stale closure ⭐⭐⭐
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      let pollCount = 0;
      const maxPolls = 30;
      pollIntervalRef.current = setInterval(async () => {
        pollCount++;
        console.log(
          `⏰ Polling status (${pollCount}/${maxPolls})... status atual: ${statusRef.current}`
        );
        await getStatus();

        // ⭐ Usa statusRef.current em vez de status (evita stale closure)
        if (pollCount >= maxPolls || statusRef.current === 'connected') {
          console.log(
            `⏰ Polling finalizado: ${statusRef.current === 'connected' ? 'Conectado!' : 'Timeout'}`
          );
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsLoading(false);
        }
      }, 2000);
      return true;
    } catch (err: any) {
      console.error('❌ Initialize failed:', err);
      setError(err.message || 'Falha ao inicializar');
      setIsLoading(false);
      return false;
    }
  }, [serverUrl, sessionName, getStatus, getApiKey, getClinicaId]);

  // ==================== RECONNECT (VIA PROXY) ====================
  const reconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 [useWhatsApp] Reconectando via proxy...');
      const apiKey = await getApiKey();
      const clinicaId = getClinicaId();
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/session/restart`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl,
            sessionName,
            apiKey,
            clinicaId
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Falha ao reconectar: ${response.status}`);
      }
      console.log('✅ Reconectado');
      await getStatus();
      return true;
    } catch (err: any) {
      console.error('❌ Reconnect failed:', err);
      setError(err.message || 'Falha ao reconectar');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, sessionName, getStatus, getApiKey, getClinicaId]);

  // ==================== DISCONNECT (VIA PROXY) ====================
  const disconnect = useCallback(async () => {
    try {
      console.log('🔌 [useWhatsApp] Desconectando via proxy...');
      const apiKey = await getApiKey();
      const clinicaId = getClinicaId();
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/session/stop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl,
            sessionName,
            apiKey,
            clinicaId
          })
        }
      );
      if (!response.ok) {
        throw new Error('Falha ao desconectar');
      }
      console.log('✅ Desconectado');
      setStatus('disconnected');
      setIsReady(false);
      setQrCode(null);
      setQrCodeImage(null);
      return true;
    } catch (err: any) {
      console.error('❌ Disconnect failed:', err);
      setError('Falha ao desconectar');
      return false;
    }
  }, [serverUrl, sessionName, getApiKey, getClinicaId]);

  // ==================== LOGOUT (VIA PROXY) ====================
  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🚪 [useWhatsApp] Fazendo logout via proxy...');
      const apiKey = await getApiKey();
      const clinicaId = getClinicaId();
      await fetch(`${API_BASE_URL}/api/whatsapp/session/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl,
          sessionName,
          apiKey,
          clinicaId
        })
      });
      setStatus('disconnected');
      setIsReady(false);
      setQrCode(null);
      setQrCodeImage(null);
      console.log('✅ Logout realizado');
      return true;
    } catch (err: any) {
      console.error('❌ Logout failed:', err);
      setError(err.message || 'Falha ao fazer logout');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, sessionName, getApiKey, getClinicaId]);

  // ==================== START CONFIGURED SESSION (LEGACY API) ====================
  // Mantém a assinatura pública antiga, mas não cria sessão: o servidor só inicia
  // a sessão existente cujo nome foi configurado.
  const createSession = useCallback(
    async (sessionId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        console.log(
          `▶️ [useWhatsApp] Iniciando sessão configurada: ${sessionId}`
        );
        const apiKey = await getApiKey();
        const clinicaId = getClinicaId();
        const response = await fetch(
          `${API_BASE_URL}/api/whatsapp/session/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              serverUrl,
              sessionName: sessionId,
              apiKey,
              clinicaId
            })
          }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            result.error ||
            `Falha ao iniciar a sessão configurada: ${response.status}`
          );
        }
        console.log('✅ Sessão configurada iniciada:', result);
        setStatus('initializing');
        setTimeout(() => getStatus(), 1500);
        return { success: true, session: result };
      } catch (err: any) {
        console.error('❌ Start configured session failed:', err);
        setError(err.message || 'Falha ao iniciar a sessão configurada');
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [serverUrl, getStatus, getApiKey, getClinicaId]
  );

  // ==================== RESTART SERVER (VIA PROXY) ====================
  const restartServer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 [useWhatsApp] Reiniciando servidor via proxy...');
      const apiKey = await getApiKey();
      const clinicaId = getClinicaId();

      // Tenta restart
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/session/restart`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl,
            sessionName,
            apiKey,
            clinicaId
          })
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload.error || 'Não foi possível reiniciar a sessão configurada.'
        );
      }
      console.log('✅ Sessão configurada reiniciada');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await getStatus();
      return true;
    } catch (err: any) {
      console.error('❌ Restart failed:', err);
      setError(err.message || 'Falha ao reiniciar servidor');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, sessionName, getStatus, getApiKey, getClinicaId]);

  // ==================== SEND MESSAGE (VIA PROXY) ====================
  const sendMessage = async (
  number: string,
  message: string,
  options?: {
    clinicaId?: string;
    pacienteId?: string;
    pacienteNome?: string;
    consultaId?: string;
  }) =>
  {
    if (!serverUrl) {
      return {
        success: false,
        error: 'Servidor não configurado'
      };
    }
    try {
      console.log('📤 [sendMessage] Enviando mensagem via proxy...');
      console.log('   - Número:', number);
      const apiKey = await getApiKey();
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/send-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl,
            sessionName,
            number,
            message,
            apiKey,
            clinicaId: options?.clinicaId || null,
            pacienteId: options?.pacienteId || null,
            pacienteNome: options?.pacienteNome || null,
            consultaId: options?.consultaId || null
          })
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro ao enviar:', errorText);
        return {
          success: false,
          error: errorText || 'Falha ao enviar'
        };
      }
      const result = await response.json();
      console.log('✅ Mensagem enviada:', result);
      return {
        success: true,
        data: result
      };
    } catch (err: any) {
      console.error('❌ Erro no envio:', err);
      return {
        success: false,
        error: err.message || 'Erro ao enviar'
      };
    }
  };
  return {
    status,
    isReady,
    qrCode,
    qrCodeImage,
    error,
    isLoading,
    checkHealth,
    getStatus,
    initialize,
    reconnect,
    disconnect,
    logout,
    createSession,
    restartServer,
    sendMessage
  };
}