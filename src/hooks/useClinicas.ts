import { useState, useEffect, useCallback } from 'react';
import { Clinica } from '../types';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export function useClinicas(operadoraId?: string) {
  const [clinicas, setClinicas] = useState<Clinica[]>([]);
  const [loading, setLoading] = useState(true);
  // ⭐ useCallback: referência estável, exigida pela revalidação
  const loadClinicas = useCallback(async () => {
    if (!operadoraId || isMagicPatterns) {
      setClinicas([]);
      setLoading(false);
      return;
    }
    try {
      console.log('📋 [useClinicas] Carregando clínicas da operadora:', operadoraId);
      const url = `${API_BASE_URL}/api/clinicas?operadoraId=${operadoraId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ [useClinicas] Clínicas carregadas:', data.length);
      setClinicas(data as Clinica[]);
    } catch (error) {
      console.error('❌ [useClinicas] Erro ao carregar clínicas:', error);
      setClinicas([]);
    } finally {
      setLoading(false);
    }
  }, [operadoraId]);
  useEffect(() => {
    // CORREÇÃO: Só carrega clínicas se tiver operadoraId definido
    // Isso evita carregar TODAS as clínicas do sistema quando não há operadora selecionada
    if (operadoraId) {
      loadClinicas();
    } else {
      console.log('⚠️ [useClinicas] Nenhuma operadoraId fornecida, retornando array vazio');
      setClinicas([]);
      setLoading(false);
    }
  }, [operadoraId, loadClinicas]);
  // Clínicas criadas/editadas em outro terminal refletem aqui
  useRevalidacao(loadClinicas, {
    intervalo: 90000,
    pausado: !operadoraId
  });
  const addClinica = async (clinica: Omit<Clinica, 'id' | 'criadoEm'>) => {
    try {
      console.log('➕ [useClinicas] Adicionando clínica:', clinica);
      const response = await fetch(`${API_BASE_URL}/api/clinicas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clinica)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      const newClinica = await response.json();
      console.log('✅ [useClinicas] Clínica criada:', newClinica);
      await loadClinicas();
      return newClinica;
    } catch (error: any) {
      console.error('❌ [useClinicas] Erro ao adicionar clínica:', error);
      throw error;
    }
  };
  const updateClinica = async (id: string, updates: Partial<Clinica>) => {
    try {
      console.log('📝 [useClinicas] Atualizando clínica:', id, updates);
      const response = await fetch(`${API_BASE_URL}/api/clinicas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ [useClinicas] Clínica atualizada');
      await loadClinicas();
    } catch (error: any) {
      console.error('❌ [useClinicas] Erro ao atualizar clínica:', error);
      throw error;
    }
  };
  const deleteClinica = async (id: string) => {
    try {
      console.log('🗑️ [useClinicas] Deletando clínica:', id);
      const response = await fetch(`${API_BASE_URL}/api/clinicas/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ [useClinicas] Clínica deletada');
      await loadClinicas();
    } catch (error: any) {
      console.error('❌ [useClinicas] Erro ao deletar clínica:', error);
      throw error;
    }
  };
  const getClinicaById = useCallback((id: string): Clinica | undefined => {
    return clinicas.find((c) => c.id === id);
  }, [clinicas]);
  return {
    clinicas,
    loading,
    addClinica,
    updateClinica,
    deleteClinica,
    getClinicaById,
    refresh: loadClinicas
  };
}