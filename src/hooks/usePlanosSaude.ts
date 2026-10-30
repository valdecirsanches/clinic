import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { PlanoSaude } from '../types';

// ⭐⭐⭐ CACHE GLOBAL para evitar requisições repetidas entre componentes ⭐⭐⭐
const cachePlanos = new Map<string, {
  data: PlanoSaude[];
  timestamp: number;
}>();
// ⭐ Era 5 MINUTOS: alterações feitas em outro terminal demoravam esse tempo
// para aparecer. Mantido curto, só para evitar rajadas de requisições.
const CACHE_TTL = 15 * 1000; // 15 segundos

// Função para invalidar cache externamente (ex: quando convênios criam planos)
export function invalidarCachePlanos(clinicaId?: string) {
  if (clinicaId) {
    // Remove todas as entradas que começam com esse clinicaId
    for (const key of cachePlanos.keys()) {
      if (key.startsWith(clinicaId)) {
        cachePlanos.delete(key);
      }
    }
  } else {
    cachePlanos.clear();
  }
}
export function usePlanosSaude(clinicaId: string, convenioId?: string) {
  const [planos, setPlanos] = useState<PlanoSaude[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⭐ Refs para controlar carregamento
  const carregandoRef = useRef(false);
  const clinicaIdRef = useRef<string | null>(null);
  const carregar = useCallback(async (forcar = false) => {
    if (!clinicaId) return;

    // ⭐ Evita chamadas duplicadas
    if (carregandoRef.current) {
      console.log('⚠️ [usePlanosSaude] Já está carregando, ignorando...');
      return;
    }

    // ⭐ Verifica cache global
    const cacheKey = `${clinicaId}${convenioId ? `-${convenioId}` : ''}`;
    const cached = cachePlanos.get(cacheKey);
    if (!forcar && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ [usePlanosSaude] Usando cache de planos');
      setPlanos(cached.data);
      return;
    }
    carregandoRef.current = true;
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 [usePlanosSaude] Carregando planos para ${clinicaId}...`);
      const url = convenioId ? `${API_BASE_URL}/api/planos-saude?clinicaId=${clinicaId}&convenioId=${convenioId}` : `${API_BASE_URL}/api/planos-saude?clinicaId=${clinicaId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Erro ao carregar planos de saúde');
      }
      const data = await response.json();
      setPlanos(data);

      // ⭐ Salva no cache global
      cachePlanos.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      console.log(`✅ [usePlanosSaude] Carregados ${data.length} planos`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar planos de saúde:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }, [clinicaId, convenioId]);

  // ⭐ Effect único - carrega quando clinicaId muda OU quando cache foi invalidado
  useEffect(() => {
    if (!clinicaId) return;
    const currentRef = `${clinicaId}${convenioId ? `-${convenioId}` : ''}`;
    const cacheKey = currentRef;
    const cached = cachePlanos.get(cacheKey);

    // Carrega se clinicaId mudou OU se cache foi invalidado
    if (clinicaIdRef.current === currentRef && cached) {
      console.log('⚠️ [usePlanosSaude] clinicaId não mudou e cache válido, ignorando...');
      return;
    }
    clinicaIdRef.current = currentRef;
    console.log(`🔄 [usePlanosSaude] Carregando planos para ${clinicaId}`);
    carregar();
  }, [clinicaId, convenioId, carregar]);
  const criar = async (plano: Partial<PlanoSaude>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/planos-saude`, {
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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar plano de saúde');
      } else {
        throw new Error(`Erro ao criar plano de saúde: Servidor retornou ${response.status}. Verifique se o servidor está rodando.`);
      }
    }
    const novoPlano = await response.json();
    setPlanos((prev) => [...prev, novoPlano].sort((a, b) => a.nome.localeCompare(b.nome)));

    // ⭐ Invalida cache
    cachePlanos.delete(clinicaId);
    return novoPlano;
  };
  const atualizar = async (id: string, plano: Partial<PlanoSaude>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/planos-saude/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...plano,
        clinicaId
      })
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar plano de saúde');
      } else {
        throw new Error(`Erro ao atualizar plano de saúde: Servidor retornou ${response.status}`);
      }
    }
    setPlanos((prev) => prev.map((p) => p.id === id ? {
      ...p,
      ...plano
    } : p).sort((a, b) => a.nome.localeCompare(b.nome)));

    // ⭐ Invalida cache
    cachePlanos.delete(clinicaId);
  };
  const deletar = async (id: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/planos-saude/${id}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao deletar plano de saúde');
      } else {
        throw new Error(`Erro ao deletar plano de saúde: Servidor retornou ${response.status}`);
      }
    }
    setPlanos((prev) => prev.filter((p) => p.id !== id));

    // ⭐ Invalida cache
    cachePlanos.delete(clinicaId);
  };
  const buscarPacientes = async (planoId: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/planos-saude/${planoId}/pacientes?clinicaId=${clinicaId}`);
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao buscar pacientes');
      } else {
        throw new Error(`Erro ao buscar pacientes: Servidor retornou ${response.status}`);
      }
    }
    return response.json();
  };

  // ⭐ Função para forçar recarregamento
  const forcarRecarregamento = () => {
    cachePlanos.delete(clinicaId);
    clinicaIdRef.current = null;
    carregar(true);
  };
  return {
    planos,
    loading,
    error,
    carregar,
    criar,
    atualizar,
    deletar,
    buscarPacientes,
    forcarRecarregamento
  };
}