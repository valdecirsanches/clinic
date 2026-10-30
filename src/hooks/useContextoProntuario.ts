import { useEffect, useState } from 'react';
import { EVENTO_CONTEXTO, lerContextoProntuario, type ContextoProntuario } from '../utils/ditadoProntuario';

/** Prontuário aberto agora (ou null): etapa, paciente e se aceita ditado. */
export function useContextoProntuario(): ContextoProntuario | null {
  const [contexto, setContexto] = useState<ContextoProntuario | null>(() => lerContextoProntuario());
  useEffect(() => {
    const atualizar = () => setContexto(lerContextoProntuario());
    window.addEventListener(EVENTO_CONTEXTO, atualizar);
    atualizar();
    return () => window.removeEventListener(EVENTO_CONTEXTO, atualizar);
  }, []);
  return contexto;
}