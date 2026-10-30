import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

export interface PlanoDisponivel {
  id: string;
  nome: string;
  preco: number;
  limitePacientes: number | null;
  limites: {
    usuarios?: number;
    armazenamentoGb?: number;
    sms?: boolean;
  };
}

export interface UsoClinica {
  pacientes: number;
  usuarios: number;
  armazenamentoGb: number;
}

/** Planos que a clínica pode escolher, com o consumo atual dela */
export function usePlanosClinica(clinicaId?: string, usuarioId?: string) {
  const [planos, setPlanos] = useState<PlanoDisponivel[]>([]);
  const [planoAtualId, setPlanoAtualId] = useState<string | null>(null);
  const [uso, setUso] = useState<UsoClinica | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/assinatura/planos?clinicaId=${clinicaId}`);
      const dados = await r.json().catch(() => null);
      if (!r.ok) throw new Error(dados?.error || 'Não foi possível carregar os planos.');
      setPlanos(dados.planos || []);
      setPlanoAtualId(dados.planoAtualId || null);
      setUso(dados.uso || null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao carregar os planos.');
    } finally {
      setCarregando(false);
    }
  }, [clinicaId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const escolher = useCallback(
    async (planoId: string) => {
      const r = await fetch(`${API_BASE_URL}/api/assinatura/plano`, {
        method: 'POST',
        // text/plain evita o preflight que o proxy não repassa
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ clinicaId, planoId, usuarioId })
      });
      const dados = await r.json().catch(() => null);
      if (!r.ok) throw new Error(dados?.error || `Falha ao trocar o plano (HTTP ${r.status}).`);
      setPlanoAtualId(planoId);
      return dados.plano as {id: string;nome: string;preco: number;};
    },
    [clinicaId, usuarioId]
  );

  return { planos, planoAtualId, uso, carregando, erro, recarregar, escolher };
}

/** O consumo atual cabe nos limites do plano? Devolve o que excede. */
export function excessosNoPlano(plano: PlanoDisponivel, uso: UsoClinica | null): string[] {
  if (!uso) return [];
  const excede: string[] = [];
  if (plano.limitePacientes && uso.pacientes > plano.limitePacientes) {
    excede.push(`${uso.pacientes} pacientes`);
  }
  if (plano.limites.usuarios && uso.usuarios > plano.limites.usuarios) {
    excede.push(`${uso.usuarios} usuários`);
  }
  if (plano.limites.armazenamentoGb && uso.armazenamentoGb > plano.limites.armazenamentoGb) {
    excede.push(`${uso.armazenamentoGb.toLocaleString('pt-BR')} GB de documentos`);
  }
  return excede;
}