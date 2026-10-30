import { useState, useEffect, useCallback } from 'react';
import { Operadora } from '../types';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export function useOperadoras() {
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [loading, setLoading] = useState(true);
  // ⭐ useCallback: referência estável, exigida pela revalidação
  const loadOperadoras = useCallback(async () => {
    if (isMagicPatterns) {
      setOperadoras([]);
      setLoading(false);
      return;
    }
    try {
      console.log('📋 Carregando operadoras via API');
      const response = await fetch(`${API_BASE_URL}/api/operadoras`);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ Operadoras carregadas via API:', data);
      setOperadoras(data as Operadora[]);
    } catch (error) {
      console.error('❌ Erro ao carregar operadoras via API:', error);
      setOperadoras([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadOperadoras();
  }, [loadOperadoras]);
  // Operadoras alteradas em outro terminal refletem aqui
  useRevalidacao(loadOperadoras, {
    intervalo: 120000
  });
  const addOperadora = async (operadora: Omit<Operadora, 'id' | 'criadoEm'>) => {
    try {
      console.log('➕ Adicionando operadora via API:', operadora);
      const response = await fetch(`${API_BASE_URL}/api/operadoras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(operadora)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      const newOperadora = await response.json();
      console.log('✅ Operadora criada via API:', newOperadora);
      await loadOperadoras();
      return newOperadora;
    } catch (error: any) {
      console.error('❌ Erro ao adicionar operadora via API:', error);
      throw error;
    }
  };
  const updateOperadora = async (id: string, updates: Partial<Operadora>) => {
    try {
      console.log('📝 Atualizando operadora via API:', id, updates);
      const response = await fetch(`${API_BASE_URL}/api/operadoras/${id}`, {
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
      console.log('✅ Operadora atualizada via API');
      await loadOperadoras();
    } catch (error: any) {
      console.error('❌ Erro ao atualizar operadora via API:', error);
      throw error;
    }
  };
  const deleteOperadora = async (id: string) => {
    try {
      console.log('🗑️ Deletando operadora via API:', id);
      const response = await fetch(`${API_BASE_URL}/api/operadoras/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      console.log('✅ Operadora deletada via API');
      await loadOperadoras();
    } catch (error: any) {
      console.error('❌ Erro ao deletar operadora via API:', error);
      throw error;
    }
  };
  const getOperadoraById = (id: string): Operadora | undefined => {
    return operadoras.find((o) => o.id === id);
  };
  const getOperadoraByCnpj = (cnpj: string): Operadora | undefined => {
    return operadoras.find((o) => o.cnpj === cnpj);
  };
  return {
    operadoras,
    loading,
    addOperadora,
    updateOperadora,
    deleteOperadora,
    getOperadoraById,
    getOperadoraByCnpj,
    refresh: loadOperadoras
  };
}