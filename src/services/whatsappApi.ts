/**
 * WhatsApp API Service
 * Serviço completo para integração DIRETA com a API do WAHA
 *
 * @version 2.0.0 - Endpoints alinhados com WAHA Premium
 * Referência: https://waha.devlike.pro/docs/
 */

import { WhatsAppStatusResponse, WhatsAppHealthResponse, SendMessageRequest, SendMessageResponse } from '../types/whatsapp';

// ============================================================================
// TIPOS ADICIONAIS
// ============================================================================

export interface SessionDetails {
  sessionId: string;
  sessionName: string;
  status: string;
  isReady: boolean;
  qrCode: string | null;
  qrCodeImage: string | null;
  webhookUrl: string | null;
  messageCount: number;
  createdAt: string;
  lastActivity: string;
}
export interface CreateSessionRequest {
  sessionId: string;
  sessionName: string;
  webhookUrl?: string;
}
export interface UpdateWebhookRequest {
  webhookUrl: string;
}
export interface SendMediaRequest {
  number: string;
  mediaUrl: string;
  caption?: string;
  fileName?: string;
  mediaType: 'image' | 'document' | 'audio' | 'video';
}
export interface SendLocationRequest {
  number: string;
  latitude: number;
  longitude: number;
  description?: string;
}
export interface SendContactRequest {
  number: string;
  contactName: string;
  contactPhone: string;
}
export interface SendButtonsRequest {
  number: string;
  title: string;
  body: string;
  buttons: Array<{
    id: string;
    text: string;
  }>;
}
export interface ContactInfoRequest {
  number: string;
}
export interface ContactInfoResponse {
  success: boolean;
  contact: {
    number: string;
    name: string;
    profilePicUrl?: string;
    isRegistered: boolean;
  };
}
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// ============================================================================
// CLASSE DE SERVIÇO - ENDPOINTS ALINHADOS COM WAHA
// ============================================================================

export class WhatsAppApiService {
  private baseUrl: string;
  private apiKey: string;
  private defaultHeaders: HeadersInit;
  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey || '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(apiKey ? {
        'X-Api-Key': apiKey
      } : {})
    };
  }

  /**
   * Atualiza a API Key (útil quando carregada do banco depois)
   */
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(apiKey ? {
        'X-Api-Key': apiKey
      } : {})
    };
  }

  /**
   * Formata número para chatId do WAHA: "5511999999999@c.us"
   */
  private formatChatId(number: string): string {
    let clean = number.replace(/\D/g, '');
    if (!clean.startsWith('55') && clean.length <= 11) {
      clean = '55' + clean;
    }
    return `${clean}@c.us`;
  }

  // ==========================================================================
  // SESSÕES - WAHA: /api/sessions
  // ==========================================================================

  /**
   * Lista todas as sessões disponíveis
   * WAHA: GET /api/sessions?all=true
   */
  async listSessions(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/sessions?all=true`, {
      method: 'GET',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Obtém detalhes completos de uma sessão específica
   * WAHA: GET /api/sessions/{session}
   */
  async getSessionDetails(sessionId: string): Promise<SessionDetails> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'GET',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to get session details: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Cria/inicia uma nova sessão
   * WAHA: POST /api/sessions/{session}/start
   */
  async createSession(data: CreateSessionRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${data.sessionId}/start`, {
      method: 'POST',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Inicializa/Conecta uma sessão (gera QR Code)
   * WAHA: POST /api/sessions/{session}/start
   */
  async initializeSession(sessionId: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to initialize session: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Reconecta/reinicia uma sessão existente
   * WAHA: POST /api/sessions/{session}/restart
   */
  async reconnectSession(sessionId: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/restart`, {
      method: 'POST',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to reconnect session: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Desconecta/para uma sessão (mantém os dados)
   * WAHA: POST /api/sessions/{session}/stop
   */
  async disconnectSession(sessionId: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to disconnect session: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Logout completo (remove autenticação, permite novo QR Code)
   * WAHA: POST /api/sessions/{session}/logout
   */
  async logoutSession(sessionId: string, reason?: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/logout`, {
      method: 'POST',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to logout session: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Reautenticação (mesmo que logout no WAHA)
   * WAHA: POST /api/sessions/{session}/logout
   */
  async reauthSession(sessionId: string, reason?: string): Promise<ApiResponse> {
    return this.logoutSession(sessionId, reason);
  }

  /**
   * Exclui uma sessão completamente
   * WAHA: DELETE /api/sessions/{session}
   */
  async deleteSession(sessionId: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
    return response.json();
  }

  // ==========================================================================
  // WEBHOOK - WAHA: PUT /api/sessions/{session}
  // ==========================================================================

  /**
   * Configura/Atualiza o webhook de uma sessão
   * WAHA: PUT /api/sessions/{session} com config.webhooks
   */
  async updateWebhook(sessionId: string, data: UpdateWebhookRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        config: {
          webhooks: [{
            url: data.webhookUrl,
            events: ['message', 'message.any', 'session.status']
          }]
        }
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to update webhook: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Testa o webhook (envia evento de teste)
   * Nota: WAHA não tem endpoint nativo para isso, simula via status check
   */
  async testWebhook(sessionId: string): Promise<ApiResponse> {
    // WAHA não tem endpoint de teste de webhook nativo
    // Retorna status da sessão como verificação
    const details = await this.getSessionDetails(sessionId);
    return {
      success: true,
      data: details,
      timestamp: new Date().toISOString()
    };
  }

  // ==========================================================================
  // ENVIO DE MENSAGENS - WAHA: POST /api/sendText, /api/sendImage, etc.
  // ==========================================================================

  /**
   * Envia mensagem de texto
   * WAHA: POST /api/sendText
   * Body: { chatId: "number@c.us", text, session, linkPreview, reply_to }
   */
  async sendMessage(sessionId: string, data: SendMessageRequest): Promise<SendMessageResponse> {
    const response = await fetch(`${this.baseUrl}/api/sendText`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        chatId: this.formatChatId(data.number),
        text: data.message,
        session: sessionId,
        linkPreview: true,
        reply_to: null
      })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to send message: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Envia mídia (imagem/documento/áudio/vídeo)
   * WAHA: POST /api/sendImage, /api/sendFile, /api/sendVideo
   * Body: { chatId, file: { mimetype, filename, url }, session, caption, reply_to }
   */
  async sendMedia(sessionId: string, data: SendMediaRequest): Promise<ApiResponse> {
    // Mapeia tipo de mídia para endpoint WAHA correto
    const endpointMap: Record<string, string> = {
      image: 'sendImage',
      document: 'sendFile',
      audio: 'sendFile',
      video: 'sendVideo'
    };
    const endpoint = endpointMap[data.mediaType] || 'sendFile';

    // Mapeia mimetype baseado no tipo
    const mimeMap: Record<string, string> = {
      image: 'image/jpeg',
      document: 'application/pdf',
      audio: 'audio/ogg',
      video: 'video/mp4'
    };
    const response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        chatId: this.formatChatId(data.number),
        file: {
          mimetype: mimeMap[data.mediaType] || 'application/octet-stream',
          filename: data.fileName || `file.${data.mediaType === 'image' ? 'jpg' : data.mediaType === 'video' ? 'mp4' : 'pdf'}`,
          url: data.mediaUrl
        },
        caption: data.caption || '',
        session: sessionId,
        reply_to: null
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to send media: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Envia localização
   * WAHA: POST /api/sendLocation
   * Body: { chatId, latitude, longitude, description, session }
   */
  async sendLocation(sessionId: string, data: SendLocationRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sendLocation`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        chatId: this.formatChatId(data.number),
        latitude: data.latitude,
        longitude: data.longitude,
        description: data.description || '',
        session: sessionId
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to send location: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Envia contato (vCard)
   * WAHA: POST /api/sendContactVcard
   * Body: { chatId, contacts: [{ fullName, organization, phoneNumber }], session }
   */
  async sendContact(sessionId: string, data: SendContactRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sendContactVcard`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        chatId: this.formatChatId(data.number),
        contacts: [{
          fullName: data.contactName,
          phoneNumber: data.contactPhone
        }],
        session: sessionId
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to send contact: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Envia mensagem com botões
   * WAHA: POST /api/sendButtons (se suportado pela versão)
   * Body: { chatId, title, body, buttons, session }
   */
  async sendButtons(sessionId: string, data: SendButtonsRequest): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/sendButtons`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        chatId: this.formatChatId(data.number),
        title: data.title,
        body: data.body,
        buttons: data.buttons,
        session: sessionId
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to send buttons: ${response.status}`);
    }
    return response.json();
  }

  // ==========================================================================
  // INFORMAÇÕES - WAHA: GET /api/contacts
  // ==========================================================================

  /**
   * Obtém informações de um contato
   * WAHA: GET /api/contacts?contactId=number@c.us&session=sessionId
   */
  async getContactInfo(sessionId: string, data: ContactInfoRequest): Promise<ContactInfoResponse> {
    const contactId = this.formatChatId(data.number);
    const response = await fetch(`${this.baseUrl}/api/contacts?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: this.defaultHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to get contact info: ${response.status}`);
    }
    const wahaData = await response.json();

    // Normaliza resposta do WAHA para nosso formato
    return {
      success: true,
      contact: {
        number: data.number,
        name: wahaData.name || wahaData.pushname || wahaData.shortName || '',
        profilePicUrl: wahaData.profilePicUrl || wahaData.imgUrl || undefined,
        isRegistered: wahaData.isWAContact !== undefined ? wahaData.isWAContact : true
      }
    };
  }

  /**
   * Obtém foto de perfil de um contato
   * WAHA: GET /api/contacts/profile-picture?contactId=number@c.us&session=sessionId
   */
  async getProfilePicture(sessionId: string, number: string): Promise<string | null> {
    const contactId = this.formatChatId(number);
    try {
      const response = await fetch(`${this.baseUrl}/api/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        headers: this.defaultHeaders
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.profilePictureURL || data.url || null;
    } catch {
      return null;
    }
  }

  /**
   * Obtém QR Code como URL de imagem
   * WAHA: GET /api/{session}/auth/qr?format=image
   */
  getQrCodeImageUrl(sessionId: string): string {
    return `${this.baseUrl}/api/${sessionId}/auth/qr?format=image`;
  }

  // ==========================================================================
  // MONITORAMENTO
  // ==========================================================================

  /**
   * Health check - verifica se o servidor WAHA está online
   * Tenta múltiplos endpoints conhecidos
   */
  async healthCheck(): Promise<WhatsAppHealthResponse> {
    // Tenta /api/sessions primeiro (mais confiável)
    const endpoints = [`${this.baseUrl}/api/sessions?all=true`, `${this.baseUrl}/health`, `${this.baseUrl}/api/health`];
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: this.defaultHeaders
        });
        if (response.ok) {
          return {
            status: 'OK'
          } as any;
        }
      } catch {
        continue;
      }
    }
    throw new Error('Health check failed: servidor não respondeu');
  }

  /**
   * Health check simples
   */
  async healthCheckSimple(): Promise<{
    status: string;
  }> {
    return this.healthCheck() as any;
  }

  /**
   * Debug de webhook - não nativo no WAHA
   */
  async webhookDebug(data: any): Promise<ApiResponse> {
    return {
      success: true,
      data: {
        message: 'Webhook debug não disponível diretamente no WAHA'
      },
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Cria uma instância do serviço de API
 * @param baseUrl URL do servidor WAHA (ex: http://157.245.2.154:5001)
 * @param apiKey API Key do WAHA (opcional)
 */
export function createWhatsAppApi(baseUrl: string, apiKey?: string): WhatsAppApiService {
  return new WhatsAppApiService(baseUrl, apiKey);
}