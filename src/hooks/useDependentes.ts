import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { Dependente } from '../types';
import { useRevalidacao } from './useRevalidacao';

/**
 * ⚠️ CORREÇÃO IMPORTANTE
 * Este hook guardava os dependentes em `localStorage['dependentes']`, ou seja,
 * dentro do navegador. Cada terminal tinha a SUA lista: nada do que era
 * cadastrado em um aparecia no outro, nem depois de recarregar, nem com o mesmo
 * usuário. Agora os dados vêm e vão para o servidor (/api/dependentes), como o
 * restante do sistema.
 */
export function useDependentes(clinicaId?: string, titularId?: string) {
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) {
      setDependentes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({
        clinicaId
      });
      if (titularId) parametros.set('titularId', titularId);
      const resposta = await fetch(
        `${API_BASE_URL}/api/dependentes?${parametros.toString()}`
      );
      if (!resposta.ok) throw new Error('Erro ao carregar dependentes');
      setDependentes(await resposta.json());
    } catch (err: any) {
      console.error('❌ [useDependentes] Erro ao carregar:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, titularId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Alterações feitas em outro terminal aparecem ao voltar o foco
  useRevalidacao(carregar, {
    intervalo: 60000
  });

  const addDependente = useCallback(
    async (dependente: Omit<Dependente, 'id' | 'criadoEm'>) => {
      const resposta = await fetch(`${API_BASE_URL}/api/dependentes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...dependente,
          clinicaId
        })
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        throw new Error(dados?.error || 'Não foi possível salvar o dependente.');
      }
      await carregar();
      return dados;
    },
    [clinicaId, carregar]
  );

  const updateDependente = useCallback(
    async (id: string, updates: Partial<Dependente>) => {
      const resposta = await fetch(`${API_BASE_URL}/api/dependentes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updates,
          clinicaId
        })
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        throw new Error(dados?.error || 'Não foi possível atualizar o dependente.');
      }
      await carregar();
      return dados;
    },
    [clinicaId, carregar]
  );

  const deleteDependente = useCallback(
    async (id: string) => {
      const resposta = await fetch(
        `${API_BASE_URL}/api/dependentes/${id}?clinicaId=${clinicaId || ''}`,
        {
          method: 'DELETE'
        }
      );
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.error || 'Não foi possível excluir o dependente.');
      }
      await carregar();
    },
    [clinicaId, carregar]
  );

  return {
    dependentes,
    loading,
    error,
    recarregar: carregar,
    addDependente,
    updateDependente,
    deleteDependente
  };
}