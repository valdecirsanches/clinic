import { useState, useEffect, useCallback, useMemo } from 'react';
import { Parcela, StatusParcela } from '../types';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
interface UseBoletosReturn {
  boletos: Parcela[];
  loading: boolean;
  error: string | null;
  stats: {
    totalEmitido: number;
    totalPago: number;
    totalPendente: number;
    totalVencido: number;
  };
  carregarBoletos: () => Promise<void>;
  criarBoleto: (dados: Omit<Parcela, 'id' | 'criadoEm'>) => Promise<void>;
  atualizarBoleto: (id: string, dados: Partial<Parcela>) => Promise<void>;
  deletarBoleto: (id: string) => Promise<void>;
  marcarComoPago: (id: string, dataPagamento?: string, formaPagamento?: string) => Promise<void>;
}
export function useBoletos(clinicaId: string): UseBoletosReturn {
  const [boletos, setBoletos] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carregarBoletos = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    setError(null);
    try {
      // Reutiliza o endpoint de parcelas, mas busca todas da clínica
      // Nota: O backend atual filtra por pacienteId se fornecido, ou retorna todas se não.
      // Precisamos garantir que o backend suporte listar todas as parcelas da clínica.
      // Se não suportar, teremos que ajustar o backend ou filtrar no frontend.
      // Assumindo que o backend suporta listar todas as parcelas da clínica se pacienteId não for passado.
      const response = await fetch(`${API_BASE_URL}/api/parcelas?clinicaId=${clinicaId}`);
      if (!response.ok) {
        throw new Error('Erro ao carregar boletos');
      }
      const data = await response.json();

      // Filtra apenas parcelas que são "boletos" ou cobranças gerais
      // Por enquanto, consideramos todas as parcelas como cobranças
      setBoletos(data);
    } catch (err: any) {
      console.error('Erro ao carregar boletos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  useEffect(() => {
    carregarBoletos();
  }, [carregarBoletos]);
  // Baixas e novos boletos gerados em outro terminal refletem aqui
  useRevalidacao(carregarBoletos, {
    intervalo: 60000,
    pausado: !clinicaId
  });
  const criarBoleto = async (dados: Omit<Parcela, 'id' | 'criadoEm'>) => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          ...dados
        })
      });
      if (!response.ok) {
        throw new Error('Erro ao criar boleto');
      }
      await carregarBoletos();
    } catch (err: any) {
      console.error('Erro ao criar boleto:', err);
      throw err;
    }
  };
  const atualizarBoleto = async (id: string, dados: Partial<Parcela>) => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          ...dados
        })
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar boleto');
      }
      await carregarBoletos();
    } catch (err: any) {
      console.error('Erro ao atualizar boleto:', err);
      throw err;
    }
  };
  const deletarBoleto = async (id: string) => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Erro ao deletar boleto');
      }
      await carregarBoletos();
    } catch (err: any) {
      console.error('Erro ao deletar boleto:', err);
      throw err;
    }
  };
  const marcarComoPago = async (id: string, dataPagamento?: string, formaPagamento?: string) => {
    const hoje = new Date().toISOString().split('T')[0];
    await atualizarBoleto(id, {
      status: 'pago',
      dataPagamento: dataPagamento || hoje,
      formaPagamento: formaPagamento as any || 'pix'
    });
  };

  // ⭐ FIX: Memoiza stats para não recalcular a cada render
  const stats = useMemo(() => {
    return boletos.reduce((acc, boleto) => {
      if (boleto.status === 'cancelado') return acc;
      acc.totalEmitido += boleto.valorParcela;
      if (boleto.status === 'pago') {
        acc.totalPago += boleto.valorParcela;
      } else if (boleto.status === 'vencido') {
        acc.totalVencido += boleto.valorParcela;
        acc.totalPendente += boleto.valorParcela;
      } else {
        acc.totalPendente += boleto.valorParcela;
      }
      return acc;
    }, {
      totalEmitido: 0,
      totalPago: 0,
      totalPendente: 0,
      totalVencido: 0
    });
  }, [boletos]);
  return {
    boletos,
    loading,
    error,
    stats,
    carregarBoletos,
    criarBoleto,
    atualizarBoleto,
    deletarBoleto,
    marcarComoPago
  };
}