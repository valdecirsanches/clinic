import { useState, useCallback, useMemo } from 'react';
import { WhatsAppApiService, createWhatsAppApi, SessionDetails, CreateSessionRequest, SendMediaRequest, SendLocationRequest, SendContactRequest, SendButtonsRequest, ContactInfoRequest, UpdateWebhookRequest } from '../services/whatsappApi';
import { SendMessageRequest } from '../types/whatsapp';

/**
 * Hook customizado para usar a API do WhatsApp (DIRETO ao WAHA)
 *
 * @example
 * const api = useWhatsAppApi('https://seu-servidor.com', 'sua-api-key')
 *
 * // Listar sessões
 * const sessions = await api.listSessions()
 *
 * // Enviar mensagem
 * await api.sendMessage('default', { number: '5511999999999', message: 'Olá!' })
 */
export function useWhatsAppApi(serverUrl: string, apiKey?: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cria instância do serviço (memoizada) - agora com apiKey
  const api = useMemo(() => createWhatsAppApi(serverUrl, apiKey), [serverUrl, apiKey]);

  // Wrapper para adicionar loading e error handling
  const withLoadingAndError = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err: any) {
      console.error('API Error:', err);
      setError(err.message || 'Erro desconhecido');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==========================================================================
  // SESSÕES
  // ==========================================================================

  const listSessions = useCallback(() => withLoadingAndError(() => api.listSessions()), [api, withLoadingAndError]);
  const getSessionDetails = useCallback((sessionId: string) => withLoadingAndError(() => api.getSessionDetails(sessionId)), [api, withLoadingAndError]);
  const createSession = useCallback((data: CreateSessionRequest) => withLoadingAndError(() => api.createSession(data)), [api, withLoadingAndError]);
  const initializeSession = useCallback((sessionId: string) => withLoadingAndError(() => api.initializeSession(sessionId)), [api, withLoadingAndError]);
  const reconnectSession = useCallback((sessionId: string) => withLoadingAndError(() => api.reconnectSession(sessionId)), [api, withLoadingAndError]);
  const disconnectSession = useCallback((sessionId: string) => withLoadingAndError(() => api.disconnectSession(sessionId)), [api, withLoadingAndError]);
  const logoutSession = useCallback((sessionId: string, reason?: string) => withLoadingAndError(() => api.logoutSession(sessionId, reason)), [api, withLoadingAndError]);
  const reauthSession = useCallback((sessionId: string, reason?: string) => withLoadingAndError(() => api.reauthSession(sessionId, reason)), [api, withLoadingAndError]);
  const deleteSession = useCallback((sessionId: string) => withLoadingAndError(() => api.deleteSession(sessionId)), [api, withLoadingAndError]);

  // ==========================================================================
  // WEBHOOK
  // ==========================================================================

  const updateWebhook = useCallback((sessionId: string, data: UpdateWebhookRequest) => withLoadingAndError(() => api.updateWebhook(sessionId, data)), [api, withLoadingAndError]);
  const testWebhook = useCallback((sessionId: string) => withLoadingAndError(() => api.testWebhook(sessionId)), [api, withLoadingAndError]);

  // ==========================================================================
  // ENVIO DE MENSAGENS
  // ==========================================================================

  const sendMessage = useCallback((sessionId: string, data: SendMessageRequest) => withLoadingAndError(() => api.sendMessage(sessionId, data)), [api, withLoadingAndError]);
  const sendMedia = useCallback((sessionId: string, data: SendMediaRequest) => withLoadingAndError(() => api.sendMedia(sessionId, data)), [api, withLoadingAndError]);
  const sendLocation = useCallback((sessionId: string, data: SendLocationRequest) => withLoadingAndError(() => api.sendLocation(sessionId, data)), [api, withLoadingAndError]);
  const sendContact = useCallback((sessionId: string, data: SendContactRequest) => withLoadingAndError(() => api.sendContact(sessionId, data)), [api, withLoadingAndError]);
  const sendButtons = useCallback((sessionId: string, data: SendButtonsRequest) => withLoadingAndError(() => api.sendButtons(sessionId, data)), [api, withLoadingAndError]);

  // ==========================================================================
  // INFORMAÇÕES
  // ==========================================================================

  const getContactInfo = useCallback((sessionId: string, data: ContactInfoRequest) => withLoadingAndError(() => api.getContactInfo(sessionId, data)), [api, withLoadingAndError]);
  const getQrCodeImageUrl = useCallback((sessionId: string) => api.getQrCodeImageUrl(sessionId), [api]);

  // ==========================================================================
  // MONITORAMENTO
  // ==========================================================================

  const healthCheck = useCallback(() => withLoadingAndError(() => api.healthCheck()), [api, withLoadingAndError]);
  const healthCheckSimple = useCallback(() => withLoadingAndError(() => api.healthCheckSimple()), [api, withLoadingAndError]);
  const webhookDebug = useCallback((data: any) => withLoadingAndError(() => api.webhookDebug(data)), [api, withLoadingAndError]);
  return {
    // Estado
    isLoading,
    error,
    clearError: () => setError(null),
    // Sessões
    listSessions,
    getSessionDetails,
    createSession,
    initializeSession,
    reconnectSession,
    disconnectSession,
    logoutSession,
    reauthSession,
    deleteSession,
    // Webhook
    updateWebhook,
    testWebhook,
    // Mensagens
    sendMessage,
    sendMedia,
    sendLocation,
    sendContact,
    sendButtons,
    // Informações
    getContactInfo,
    getQrCodeImageUrl,
    // Monitoramento
    healthCheck,
    healthCheckSimple,
    webhookDebug,
    // Instância direta (para casos avançados)
    api
  };
}