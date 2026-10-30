/**
 * Guarda de saída: uma tela com alterações não salvas (o prontuário) registra
 * aqui uma função que diz o que está pendente. A navegação do App consulta
 * antes de trocar de tela.
 */
type Verificador = () => string | null;
let verificador: Verificador | null = null;

export function registrarGuardaSaida(fn: Verificador): () => void {
  verificador = fn;
  return () => {
    if (verificador === fn) verificador = null;
  };
}

/** true = pode sair. Pergunta ao usuário quando há algo pendente. */
export function confirmarSaida(): boolean {
  const mensagem = verificador ? verificador() : null;
  if (!mensagem) return true;
  return window.confirm(mensagem);
}
