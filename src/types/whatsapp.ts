export type WhatsAppProvider = 'meta' | 'session';
export type WhatsAppStatus =
'disconnected' |
'initializing' |
'waiting_scan' |
'authenticated' |
'connected' |
'auth_failure' |
'error';
export interface WhatsAppConfig {
  provider: WhatsAppProvider;

  // Meta (EDSSolution)
  metaApiKey?: string;
  metaPhoneNumberId?: string;

  // Sessão Própria
  serverUrl?: string;
  sessionName?: string;
  apiKey?: string; // ⭐ API Key do WAHA (autenticação)

  // Configurações gerais
  horasAntecedencia: number;
  mensagemTemplate: string;
  enviarConfirmacao: boolean;

  // Webhook de respostas para confirmação/cancelamento via WhatsApp
  webhookUrl?: string;
  webhookAtivo?: boolean;
}
export interface WhatsAppStatusResponse {
  status: WhatsAppStatus;
  isReady: boolean;
  qrCode: string | null;
  qrCodeImage: string | null;
  error?: string;
}

// Estrutura real da API /Health
export interface WhatsAppHealthResponse {
  status: string;
  timestamp: string;
  sessionManager: {
    available: boolean;
    initialized: boolean;
  };
  sessions: {
    total: number;
    connected: number;
    disconnected: number;
    withWebhook: number;
  };
  server: {
    uptime: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    version: string;
  };
}
export interface SendMessageRequest {
  number: string;
  message: string;
}
export interface SendMessageResponse {
  success: boolean;
  message: string;
  to: string;
  content: string;
  timestamp: string;
}