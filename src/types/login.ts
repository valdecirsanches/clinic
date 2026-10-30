/** Código enviado pelo WhatsApp na verificação em duas etapas */
export interface DesafioLogin {
  id: string;
  /** Celular mascarado, ex.: (11) •••••-1234 */
  destino: string;
  expiraEmSeg: number;
  reenvioEmSeg: number;
}

export interface ResultadoLogin {
  success: boolean;
  error?: string;
  /** Presente quando falta confirmar o código recebido no WhatsApp */
  desafio?: DesafioLogin;
}