import { useState, useEffect, useCallback } from 'react';
import { Procedimento, TipoConsulta } from '../types';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export function useProcedimentos(clinicaId?: string) {
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadProcedimentos = useCallback(async () => {
    if (!clinicaId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      console.log('📋 Carregando procedimentos via API:', clinicaId);
      const response = await fetch(`${API_BASE_URL}/api/procedimentos?clinicaId=${clinicaId}`);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ Procedimentos carregados:', data.length);
      setProcedimentos(data as Procedimento[]);
    } catch (err: any) {
      console.error('❌ Erro ao carregar procedimentos:', err);
      setError(err.message);
      setProcedimentos([]);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  useEffect(() => {
    loadProcedimentos();
  }, [loadProcedimentos]);
  // Traz alterações feitas em outros terminais
  useRevalidacao(loadProcedimentos, {
    intervalo: 60000,
    pausado: !clinicaId
  });
  const addProcedimento = async (procedimento: Omit<Procedimento, 'id' | 'criadoEm' | 'clinicaId'>): Promise<Procedimento> => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log('➕ Adicionando procedimento:', procedimento);
      const response = await fetch(`${API_BASE_URL}/api/procedimentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...procedimento,
          clinicaId
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      const newProcedimento = await response.json();
      console.log('✅ Procedimento criado:', newProcedimento);
      await loadProcedimentos();
      return newProcedimento;
    } catch (err: any) {
      console.error('❌ Erro ao adicionar procedimento:', err);
      throw err;
    }
  };
  const updateProcedimento = async (id: string, updates: Partial<Procedimento>): Promise<void> => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log('📝 Atualizando procedimento:', id, updates);
      const response = await fetch(`${API_BASE_URL}/api/procedimentos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updates,
          clinicaId
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ Procedimento atualizado');
      await loadProcedimentos();
    } catch (err: any) {
      console.error('❌ Erro ao atualizar procedimento:', err);
      throw err;
    }
  };
  const deleteProcedimento = async (id: string): Promise<void> => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    try {
      console.log('🗑️ Deletando procedimento:', id);
      const response = await fetch(`${API_BASE_URL}/api/procedimentos/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ Procedimento deletado');
      await loadProcedimentos();
    } catch (err: any) {
      console.error('❌ Erro ao deletar procedimento:', err);
      throw err;
    }
  };

  // Filtra procedimentos por tipo
  const getProcedimentosPorTipo = useCallback((tipo: TipoConsulta): Procedimento[] => {
    return procedimentos.filter((p) => p.tipo === tipo && p.ativo);
  }, [procedimentos]);

  // Busca procedimento por ID
  const getProcedimentoById = useCallback((id: string): Procedimento | undefined => {
    return procedimentos.find((p) => p.id === id);
  }, [procedimentos]);
  return {
    procedimentos,
    procedimentosAtivos: procedimentos.filter((p) => p.ativo),
    loading,
    error,
    addProcedimento,
    updateProcedimento,
    deleteProcedimento,
    getProcedimentosPorTipo,
    getProcedimentoById,
    refresh: loadProcedimentos
  };
}