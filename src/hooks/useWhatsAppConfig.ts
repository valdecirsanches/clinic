import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { ConfigWhatsApp } from '../types';
import { isWhatsAppAuthBlocked } from './useWhatsApp';
export function useWhatsAppConfig(clinicaId: string | undefined) {
  const [config, setConfig] = useState<ConfigWhatsApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  // Carrega configuração da API
  const carregar = useCallback(async () => {
    if (!clinicaId) {
      setLoading(false);
      setConfig(null);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`);
      if (response.status === 404) {
        setConfig(null);
        setLoading(false);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log(`🔑 [useWhatsAppConfig] Config carregada - apiKey: ${data.apiKey ? '***' + data.apiKey.slice(-4) : '(vazia)'}`);
      setConfig(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);

  // Verifica status da sessão WhatsApp silenciosamente
  const verificarStatus = useCallback(async () => {
    if (!config?.serverUrl || !config?.sessionName) {
      setStatus('disconnected');
      return 'disconnected';
    }

    // ⭐⭐⭐ FIX: Verifica cache global de auth error ⭐⭐⭐
    if (isWhatsAppAuthBlocked(config.serverUrl)) {
      console.log('🛑 [useWhatsAppConfig] verificarStatus BLOQUEADO (auth cache)');
      setStatus('disconnected');
      return 'disconnected';
    }
    try {
      // API Key é gerenciada pelo servidor via .env.local (getWahaApiKey)
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/status?serverUrl=${encodeURIComponent(config.serverUrl)}&sessionName=${encodeURIComponent(config.sessionName)}`);
      if (response.ok) {
        const data = await response.json();
        const wahaStatus = (data.status || '').toUpperCase();
        const isConnected = wahaStatus === 'WORKING' || wahaStatus === 'CONNECTED' || wahaStatus === 'ONLINE' || data.status === 'connected' || data.isReady === true;
        const newStatus = isConnected ? 'connected' : 'disconnected';
        setStatus(newStatus);

        // Salva no localStorage (SEM disparar evento para evitar loop)
        localStorage.setItem('whatsapp_session_status', JSON.stringify({
          status: newStatus,
          isReady: isConnected,
          timestamp: Date.now(),
          clinicaId
        }));
        return newStatus;
      } else {
        setStatus('disconnected');
        return 'disconnected';
      }
    } catch (err) {
      setStatus('disconnected');
      return 'disconnected';
    }
  }, [config?.serverUrl, config?.sessionName, clinicaId]);

  // Salva configuração na API
  const salvar = useCallback(async (novaConfig: ConfigWhatsApp) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      const payload: any = {
        clinicaId,
        ...novaConfig
      };
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      setConfig(novaConfig);
      setError(null);

      // Dispara evento APENAS quando usuário salva config manualmente
      window.dispatchEvent(new Event('whatsapp-config-updated'));

      // Verifica status após salvar
      setTimeout(() => verificarStatus(), 2000);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [clinicaId, verificarStatus]);

  // Carrega na montagem e quando clinicaId muda
  useEffect(() => {
    carregar();
  }, [carregar]);

  // Verifica status quando config está carregada
  useEffect(() => {
    if (config?.serverUrl && config?.sessionName && !loading) {
      verificarStatus();
    }
  }, [config?.serverUrl, config?.sessionName, loading, verificarStatus]);
  return {
    config,
    loading,
    error,
    status,
    salvar,
    recarregar: carregar,
    verificarStatus
  };
}