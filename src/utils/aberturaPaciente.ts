/**
 * Ponte assistente → tela de Pacientes para abrir um cadastro.
 * O pedido fica guardado até a tela montar (ela pode ainda não estar aberta).
 */
export const EVENTO_ABRIR_PACIENTE = 'assistente:abrir-paciente';

export interface PedidoAberturaPaciente {
  pacienteId: string | null; // null = cadastro novo
  nome?: string;
}

let pendente: PedidoAberturaPaciente | null = null;

export function pedirAberturaPaciente(pedido: PedidoAberturaPaciente) {
  pendente = pedido;
  window.dispatchEvent(new Event(EVENTO_ABRIR_PACIENTE));
}

/** A tela de Pacientes consome o pedido (uma vez só). */
export function consumirAberturaPaciente(): PedidoAberturaPaciente | null {
  const p = pendente;
  pendente = null;
  return p;
}