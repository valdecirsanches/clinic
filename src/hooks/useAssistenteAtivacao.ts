import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

export interface AtivacaoAssistente {
  /** Ligado na clínica E chave da OpenAI configurada no servidor */
  ativo: boolean;
  ativoNaClinica: boolean;
  configurado: boolean;
  alteradoPor: string | null;
  alteradoEm: string | null;
  valorUnitario: number;
  franquia: number;
}

const EVENTO = 'assistente-ativacao';

export function useAssistenteAtivacao(clinicaId: string | undefined) {
  const [ativacao, setAtivacao] = useState<AtivacaoAssistente | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/assistente/ativacao?clinicaId=${encodeURIComponent(clinicaId)}`);
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || (r.status === 404 ? 'O servidor ainda não tem o assistente.' : `Erro ${r.status}`));
      setAtivacao(d);
      setErro(null);
    } catch (e: any) {
      setAtivacao(null);
      setErro(e.message);
    }
  }, [clinicaId]);

  useEffect(() => {
    carregar();
    window.addEventListener(EVENTO, carregar);
    return () => window.removeEventListener(EVENTO, carregar);
  }, [carregar]);

  const alterar = async (ativo: boolean, usuarioId: string) => {
    const r = await fetch(`${API_BASE_URL}/api/assistente/ativacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ clinicaId, usuarioId, ativo })
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
    window.dispatchEvent(new Event(EVENTO));
  };

  return { ativacao, erro, alterar, recarregar: carregar };
}