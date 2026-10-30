import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export function useConfiguracoesGlobais<T>(chave: string, valorPadrao: T) {
  const [valor, setValor] = useState<T>(valorPadrao);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Usa ref para evitar loop infinito com objetos
  const valorPadraoRef = useRef(valorPadrao);

  // Carrega configuração do banco
  const carregar = useCallback(async () => {
    try {
      console.log(`🔍 [useConfiguracoesGlobais] Carregando: ${chave}`);
      const response = await fetch(`${API_BASE_URL}/api/configuracoes-globais/${chave}`);
      if (response.status === 404) {
        console.log(`⚠️ [useConfiguracoesGlobais] Não encontrado, usando padrão: ${chave}`);
        setValor(valorPadraoRef.current);
        setLoading(false);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log(`✅ [useConfiguracoesGlobais] Carregado: ${chave}`, data.valor);
      // ⭐ FIX: Garante que valor nunca é null/undefined — usa padrão se API retornar valor inválido
      setValor(data.valor != null ? data.valor : valorPadraoRef.current);
      setError(null);
    } catch (err: any) {
      console.error(`❌ [useConfiguracoesGlobais] Erro ao carregar ${chave}:`, err);
      setError(err.message);
      setValor(valorPadraoRef.current);
    } finally {
      setLoading(false);
    }
  }, [chave]);

  // Salva configuração no banco
  const salvar = useCallback(async (novoValor: T) => {
    try {
      console.log(`💾 [useConfiguracoesGlobais] Salvando: ${chave}`, novoValor);
      const response = await fetch(`${API_BASE_URL}/api/configuracoes-globais`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chave,
          valor: novoValor
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log(`✅ [useConfiguracoesGlobais] Salvo: ${chave}`);
      setValor(novoValor);
      setError(null);
      return data;
    } catch (err: any) {
      console.error(`❌ [useConfiguracoesGlobais] Erro ao salvar ${chave}:`, err);
      setError(err.message);
      throw err;
    }
  }, [chave]);

  // Carrega na montagem
  useEffect(() => {
    carregar();
  }, [carregar]);
  // Configurações alteradas em outro terminal refletem aqui
  useRevalidacao(carregar, {
    intervalo: 90000
  });
  return {
    valor,
    loading,
    error,
    salvar,
    recarregar: carregar
  };
}