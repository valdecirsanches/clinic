import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { EmpresaConveniada } from '../types';
import { useRevalidacao } from './useRevalidacao';

// Tipo para Unidade da Empresa
export interface UnidadeEmpresa {
  id: string;
  empresaConveniadaId: string;
  nome: string;
  codigo?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
  responsavel?: string;
  observacoes?: string;
  ativa: boolean;
  criadoEm: string;
  empresaNome?: string; // Quando vem do JOIN
}

// ⭐⭐⭐ CACHE GLOBAL para evitar requisições repetidas entre componentes ⭐⭐⭐
const cacheEmpresas = new Map<string, {
  data: EmpresaConveniada[];
  timestamp: number;
}>();
const cacheUnidades = new Map<string, {
  data: UnidadeEmpresa[];
  timestamp: number;
}>();
// ⭐ Era 5 MINUTOS: alterações feitas em outro terminal demoravam esse tempo
// para aparecer. Mantido curto, só para evitar rajadas de requisições.
const CACHE_TTL = 15 * 1000; // 15 segundos

export function useEmpresasConveniadas(clinicaId: string) {
  const [empresas, setEmpresas] = useState<EmpresaConveniada[]>([]);
  const [unidades, setUnidades] = useState<UnidadeEmpresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⭐ Refs para controlar carregamento
  const carregandoRef = useRef(false);
  const clinicaIdRef = useRef<string | null>(null);
  const carregar = useCallback(async (forcar = false) => {
    if (!clinicaId) return;

    // ⭐ Evita chamadas duplicadas
    if (carregandoRef.current) {
      console.log('⚠️ [useEmpresasConveniadas] Já está carregando, ignorando...');
      return;
    }

    // ⭐ Verifica cache global
    const cacheKey = clinicaId;
    const cached = cacheEmpresas.get(cacheKey);
    if (!forcar && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ [useEmpresasConveniadas] Usando cache de empresas');
      setEmpresas(cached.data);
      return;
    }
    carregandoRef.current = true;
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 [useEmpresasConveniadas] Carregando empresas para ${clinicaId}...`);
      const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas?clinicaId=${clinicaId}`);
      if (!response.ok) {
        throw new Error('Erro ao carregar empresas conveniadas');
      }
      const data = await response.json();
      setEmpresas(data);

      // ⭐ Salva no cache global
      cacheEmpresas.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      console.log(`✅ [useEmpresasConveniadas] Carregadas ${data.length} empresas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar empresas conveniadas:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }, [clinicaId]);

  // Carrega todas as unidades de todas as empresas
  const carregarTodasUnidades = useCallback(async (forcar = false) => {
    if (!clinicaId) return;

    // ⭐ Verifica cache global
    const cacheKey = clinicaId;
    const cached = cacheUnidades.get(cacheKey);
    if (!forcar && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('✅ [useEmpresasConveniadas] Usando cache de unidades');
      setUnidades(cached.data);
      return;
    }
    try {
      console.log(`🔄 [useEmpresasConveniadas] Carregando unidades para ${clinicaId}...`);
      const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/todas/unidades?clinicaId=${clinicaId}`);
      if (!response.ok) {
        throw new Error('Erro ao carregar unidades');
      }
      const data = await response.json();
      setUnidades(data);

      // ⭐ Salva no cache global
      cacheUnidades.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      console.log(`✅ [useEmpresasConveniadas] Carregadas ${data.length} unidades`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar unidades:', err);
    }
  }, [clinicaId]);

  // ⭐ Effect único para carregar dados - SÓ quando clinicaId REALMENTE muda
  useEffect(() => {
    if (!clinicaId) return;

    // ⭐ Só carrega se clinicaId mudou de verdade
    if (clinicaIdRef.current === clinicaId) {
      console.log('⚠️ [useEmpresasConveniadas] clinicaId não mudou, ignorando...');
      return;
    }
    clinicaIdRef.current = clinicaId;
    console.log(`🔄 [useEmpresasConveniadas] clinicaId mudou para ${clinicaId}`);
    carregar();
    carregarTodasUnidades();
  }, [clinicaId]);
  // Empresas/unidades alteradas em outro terminal refletem aqui
  useRevalidacao(
    () => {
      carregar(true);
      carregarTodasUnidades(true);
    },
    {
      intervalo: 90000,
      pausado: !clinicaId
    }
  );
  const criar = async (empresa: Partial<EmpresaConveniada>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...empresa,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao criar empresa');
    }
    const novaEmpresa = await response.json();
    setEmpresas((prev) => [...prev, novaEmpresa].sort((a, b) => a.nome.localeCompare(b.nome)));

    // ⭐ Invalida cache
    cacheEmpresas.delete(clinicaId);
    return novaEmpresa;
  };
  const atualizar = async (id: string, empresa: Partial<EmpresaConveniada>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...empresa,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao atualizar empresa');
    }
    setEmpresas((prev) => prev.map((e) => e.id === id ? {
      ...e,
      ...empresa
    } : e).sort((a, b) => a.nome.localeCompare(b.nome)));

    // ⭐ Invalida cache
    cacheEmpresas.delete(clinicaId);
  };
  const deletar = async (id: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${id}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao deletar empresa');
    }
    setEmpresas((prev) => prev.filter((e) => e.id !== id));

    // ⭐ Invalida cache
    cacheEmpresas.delete(clinicaId);
  };
  const buscarPacientes = async (empresaId: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/pacientes?clinicaId=${clinicaId}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao buscar pacientes');
    }
    return response.json();
  };

  // ==================== FUNÇÕES DE UNIDADES ====================

  const buscarUnidades = async (empresaId: string): Promise<UnidadeEmpresa[]> => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades?clinicaId=${clinicaId}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao buscar unidades');
    }
    return response.json();
  };
  const criarUnidade = async (empresaId: string, unidade: Partial<UnidadeEmpresa>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...unidade,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao criar unidade');
    }
    const novaUnidade = await response.json();
    setUnidades((prev) => [...prev, novaUnidade].sort((a, b) => a.nome.localeCompare(b.nome)));

    // ⭐ Invalida cache
    cacheUnidades.delete(clinicaId);
    return novaUnidade;
  };
  const atualizarUnidade = async (empresaId: string, unidadeId: string, unidade: Partial<UnidadeEmpresa>) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades/${unidadeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...unidade,
        clinicaId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao atualizar unidade');
    }
    setUnidades((prev) => prev.map((u) => u.id === unidadeId ? {
      ...u,
      ...unidade
    } : u));

    // ⭐ Invalida cache
    cacheUnidades.delete(clinicaId);
  };
  const deletarUnidade = async (empresaId: string, unidadeId: string) => {
    if (!clinicaId) throw new Error('clinicaId é obrigatório');
    const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades/${unidadeId}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao deletar unidade');
    }
    setUnidades((prev) => prev.filter((u) => u.id !== unidadeId));

    // ⭐ Invalida cache
    cacheUnidades.delete(clinicaId);
  };
  const getUnidadesPorEmpresa = (empresaId: string): UnidadeEmpresa[] => {
    return unidades.filter((u) => u.empresaConveniadaId === empresaId && u.ativa);
  };

  // ⭐ Função para forçar recarregamento
  const forcarRecarregamento = () => {
    // ⭐ Invalida caches
    cacheEmpresas.delete(clinicaId);
    cacheUnidades.delete(clinicaId);
    clinicaIdRef.current = null; // Força recarregamento
    carregar(true);
    carregarTodasUnidades(true);
  };
  return {
    empresas,
    unidades,
    loading,
    error,
    carregar,
    carregarTodasUnidades,
    criar,
    atualizar,
    deletar,
    buscarPacientes,
    buscarUnidades,
    criarUnidade,
    atualizarUnidade,
    deletarUnidade,
    getUnidadesPorEmpresa,
    forcarRecarregamento
  };
}