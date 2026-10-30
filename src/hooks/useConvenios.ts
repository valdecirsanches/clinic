import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { Convenio, PlanoSaude } from '../types';
import { invalidarCachePlanos } from './usePlanosSaude';
import { useRevalidacao } from './useRevalidacao';

// Cache global para evitar requisições repetidas
const cacheConvenios = new Map<string, {
  data: Convenio[];
  timestamp: number;
}>();
// ⭐ Era 5 MINUTOS: uma alteração feita em outro terminal só aparecia depois
// desse tempo. Agora o cache serve apenas para evitar rajadas de requisições.
const CACHE_TTL = 15 * 1000; // 15 segundos

export function useConvenios(clinicaId: string) {
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carregandoRef = useRef(false);
  const clinicaIdRef = useRef<string | null>(null);
  const carregar = useCallback(async (forcar = false) => {
    if (!clinicaId) return;
    if (carregandoRef.current) {
      return;
    }
    const cacheKey = clinicaId;
    const cached = cacheConvenios.get(cacheKey);
    if (!forcar && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setConvenios(cached.data);
      return;
    }
    carregandoRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/convenios?clinicaId=${clinicaId}`);
      if (!response.ok) {
        throw new Error('Erro ao carregar convênios');
      }
      const data = await response.json();
      setConvenios(data);
      cacheConvenios.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error('❌ Erro ao carregar convênios:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }, [clinicaId]);
  useEffect(() => {
    if (!clinicaId) return;
    if (clinicaIdRef.current === clinicaId) {
      return;
    }
    clinicaIdRef.current = clinicaId;
    carregar();
  }, [clinicaId, carregar]);

  // Traz alterações feitas em outros terminais ao voltar o foco / periodicamente
  useRevalidacao(() => carregar(true), {
    intervalo: 60000
  });
  const criar = async (convenio: Partial<Convenio>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/convenios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...convenio,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao criar convênio');
    }
    const novoConvenio = await response.json();
    setConvenios((prev) => [...prev, novoConvenio].sort((a, b) => a.nome.localeCompare(b.nome)));
    cacheConvenios.delete(clinicaId);
    return novoConvenio;
  };
  const atualizar = async (id: string, convenio: Partial<Convenio>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/convenios/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...convenio,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao atualizar convênio');
    }
    setConvenios((prev) => prev.map((c) => c.id === id ? {
      ...c,
      ...convenio
    } : c).sort((a, b) => a.nome.localeCompare(b.nome)));
    cacheConvenios.delete(clinicaId);
  };
  const deletar = async (id: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/convenios/${id}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao deletar convênio');
    }
    setConvenios((prev) => prev.filter((c) => c.id !== id));
    cacheConvenios.delete(clinicaId);
  };
  const criarPlano = async (convenioId: string, plano: Partial<PlanoSaude>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/convenios/${convenioId}/planos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...plano,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao criar plano');
    }
    const novoPlano = await response.json();
    setConvenios((prev) => prev.map((c) => {
      if (c.id === convenioId) {
        return {
          ...c,
          planos: [...(c.planos || []), novoPlano]
        };
      }
      return c;
    }));
    cacheConvenios.delete(clinicaId);
    invalidarCachePlanos(clinicaId);
    return novoPlano;
  };
  const atualizarPlano = async (convenioId: string, planoId: string, plano: Partial<PlanoSaude>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/planos-saude/${planoId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...plano,
        convenioId,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao atualizar plano');
    }
    setConvenios((prev) => prev.map((c) => {
      if (c.id === convenioId) {
        return {
          ...c,
          planos: (c.planos || []).map((p) => p.id === planoId ? {
            ...p,
            ...plano
          } : p)
        };
      }
      return c;
    }));
    cacheConvenios.delete(clinicaId);
    invalidarCachePlanos(clinicaId);
  };
  const deletarPlano = async (convenioId: string, planoId: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/planos-saude/${planoId}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao deletar plano');
    }
    setConvenios((prev) => prev.map((c) => {
      if (c.id === convenioId) {
        return {
          ...c,
          planos: (c.planos || []).filter((p) => p.id !== planoId)
        };
      }
      return c;
    }));
    cacheConvenios.delete(clinicaId);
    invalidarCachePlanos(clinicaId);
  };
  const forcarRecarregamento = () => {
    cacheConvenios.delete(clinicaId);
    clinicaIdRef.current = null;
    carregar(true);
  };
  return {
    convenios,
    loading,
    error,
    carregar,
    criar,
    atualizar,
    deletar,
    criarPlano,
    atualizarPlano,
    deletarPlano,
    forcarRecarregamento
  };
}