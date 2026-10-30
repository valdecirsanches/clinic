import { useState, useEffect, useCallback } from 'react';
import { Parcela, StatusParcela } from '../types';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
interface UseFinanceiroReturn {
  parcelas: Parcela[];
  loading: boolean;
  error: string | null;
  resumo: {
    total: number;
    pago: number;
    pendente: number;
    vencido: number;
    cancelado: number;
  };
  carregarParcelas: () => Promise<void>;
  criarParcela: (dados: Omit<Parcela, 'id' | 'criadoEm'>) => Promise<void>;
  gerarContrato: (dados: {
    valorTotal: number;
    numeroParcelas: number;
    diaVencimento: number;
    formaPagamento: string;
    profissionalId?: string;
    observacoes?: string;
  }) => Promise<void>;
  atualizarParcela: (id: string, dados: Partial<Parcela>) => Promise<void>;
  deletarParcela: (id: string) => Promise<void>;
  deletarTodasParcelas: () => Promise<void>;
  marcarComoPago: (id: string, dataPagamento?: string, formaPagamento?: string) => Promise<void>;
  quitarContrato: (dataPagamento?: string, formaPagamento?: string) => Promise<void>;
}
export function useFinanceiro(clinicaId: string, pacienteId?: string): UseFinanceiroReturn {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carregarParcelas = useCallback(async () => {
    if (!clinicaId || !pacienteId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas?clinicaId=${clinicaId}&pacienteId=${pacienteId}`);
      if (!response.ok) {
        throw new Error('Erro ao carregar parcelas');
      }
      const data = await response.json();
      setParcelas(data);
    } catch (err: any) {
      console.error('Erro ao carregar parcelas:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, pacienteId]);
  useEffect(() => {
    carregarParcelas();
  }, [carregarParcelas]);
  // Pagamentos lançados em outro terminal refletem aqui
  useRevalidacao(carregarParcelas, {
    intervalo: 45000,
    pausado: !clinicaId
  });
  const criarParcela = async (dados: Omit<Parcela, 'id' | 'criadoEm'>) => {
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
        throw new Error('Erro ao criar parcela');
      }
      await carregarParcelas();
    } catch (err: any) {
      console.error('Erro ao criar parcela:', err);
      throw err;
    }
  };
  const gerarContrato = async (dados: {
    valorTotal: number;
    numeroParcelas: number;
    diaVencimento: number;
    formaPagamento: string;
    profissionalId?: string;
    observacoes?: string;
  }) => {
    if (!clinicaId || !pacienteId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas/gerar-contrato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          pacienteId,
          ...dados
        })
      });
      if (!response.ok) {
        throw new Error('Erro ao gerar contrato');
      }
      await carregarParcelas();
    } catch (err: any) {
      console.error('Erro ao gerar contrato:', err);
      throw err;
    }
  };
  const atualizarParcela = async (id: string, dados: Partial<Parcela>) => {
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
        throw new Error('Erro ao atualizar parcela');
      }
      await carregarParcelas();
    } catch (err: any) {
      console.error('Erro ao atualizar parcela:', err);
      throw err;
    }
  };
  const deletarParcela = async (id: string) => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Erro ao deletar parcela');
      }
      await carregarParcelas();
    } catch (err: any) {
      console.error('Erro ao deletar parcela:', err);
      throw err;
    }
  };
  const deletarTodasParcelas = async () => {
    if (!clinicaId || !pacienteId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/parcelas?clinicaId=${clinicaId}&pacienteId=${pacienteId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Erro ao deletar contrato');
      }
      await carregarParcelas();
    } catch (err: any) {
      console.error('Erro ao deletar contrato:', err);
      throw err;
    }
  };
  const marcarComoPago = async (id: string, dataPagamento?: string, formaPagamento?: string) => {
    const hoje = new Date().toISOString().split('T')[0];
    await atualizarParcela(id, {
      status: 'pago',
      dataPagamento: dataPagamento || hoje,
      formaPagamento: formaPagamento
    });
  };
  const quitarContrato = async (dataPagamento?: string, formaPagamento?: string) => {
    if (!clinicaId) return;
    const hoje = new Date().toISOString().split('T')[0];
    const parcelasPendentes = parcelas.filter((p) => p.status !== 'pago' && p.status !== 'cancelado');

    // Atualiza todas as parcelas pendentes para pago
    for (const parcela of parcelasPendentes) {
      await atualizarParcela(parcela.id, {
        status: 'pago',
        dataPagamento: dataPagamento || hoje,
        formaPagamento: formaPagamento
      });
    }
  };

  // Cálculos de resumo
  const resumo = parcelas.reduce((acc, p) => {
    // Ignora cancelados no total geral, mas conta no total de cancelados
    if (p.status === 'cancelado') {
      acc.cancelado += p.valorParcela;
      return acc;
    }
    acc.total += p.valorParcela;
    if (p.status === 'pago') {
      acc.pago += p.valorParcela;
    } else if (p.status === 'vencido') {
      acc.vencido += p.valorParcela;
      acc.pendente += p.valorParcela; // Vencido também é pendente de pagamento
    } else {
      acc.pendente += p.valorParcela;
    }
    return acc;
  }, {
    total: 0,
    pago: 0,
    pendente: 0,
    vencido: 0,
    cancelado: 0
  });
  return {
    parcelas,
    loading,
    error,
    resumo,
    carregarParcelas,
    criarParcela,
    gerarContrato,
    atualizarParcela,
    deletarParcela,
    deletarTodasParcelas,
    marcarComoPago,
    quitarContrato
  };
}