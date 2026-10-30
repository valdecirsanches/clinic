import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export interface BancoConfig {
  id: string;
  banco: string;
  bancoNome: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  carteira: string;
  convenio: string;
  codigoCedente: string;
  nomeCedente: string;
  cnpjCedente: string;
  enderecoCedente: string;
  cidadeCedente: string;
  ufCedente: string;
  cepCedente: string;
  multa: number;
  juros: number;
  diasProtesto: number;
  instrucao1: string;
  instrucao2: string;
  instrucao3: string;
  ativo: number | boolean;
  criadoEm: string;
  atualizadoEm: string;
  // ⭐ Campos OAuth Itaú
  clientId?: string;
  clientSecret?: string;
  itauKey?: string;
  tipoAmbiente?: number;
  tokenOAuth?: string;
  tokenValidade?: string;
  tipoJuros?: number;
  tipoMulta?: number;
  boletoRegistrado?: number | boolean;
}
export interface BancoConfigForm {
  banco: string;
  bancoNome: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  carteira: string;
  convenio: string;
  codigoCedente: string;
  nomeCedente: string;
  cnpjCedente: string;
  enderecoCedente: string;
  cidadeCedente: string;
  ufCedente: string;
  cepCedente: string;
  multa: number;
  juros: number;
  diasProtesto: number;
  instrucao1: string;
  instrucao2: string;
  instrucao3: string;
  // ⭐ Campos OAuth Itaú
  clientId?: string;
  clientSecret?: string;
  itauKey?: string;
  tipoAmbiente?: number;
  tipoJuros?: number;
  tipoMulta?: number;
  boletoRegistrado?: boolean;
}

// Bancos suportados
export const BANCOS_SUPORTADOS = [{
  codigo: '001',
  nome: 'Banco do Brasil',
  carteiras: ['17', '18', '21', '11', '12', '31', '51']
}, {
  codigo: '033',
  nome: 'Santander',
  carteiras: ['101', '102', '201', 'CSR']
}, {
  codigo: '041',
  nome: 'Banrisul',
  carteiras: ['1', '2', '3', '06', '08', 'R']
}, {
  codigo: '077',
  nome: 'Banco Inter',
  carteiras: ['112']
}, {
  codigo: '104',
  nome: 'Caixa Econômica Federal',
  carteiras: ['SR', 'RG', '14', '24']
}, {
  codigo: '208',
  nome: 'BTG Pactual',
  carteiras: ['1', '2']
}, {
  codigo: '237',
  nome: 'Bradesco',
  carteiras: ['09', '06', '03', '19', '25', '26', '21']
}, {
  codigo: '260',
  nome: 'Nubank',
  carteiras: ['1']
}, {
  codigo: '336',
  nome: 'C6 Bank',
  carteiras: ['1']
}, {
  codigo: '341',
  nome: 'Itaú Unibanco',
  carteiras: ['109', '175', '176', '178', '104']
}, {
  codigo: '389',
  nome: 'Banco Mercantil',
  carteiras: ['1', '2']
}, {
  codigo: '399',
  nome: 'HSBC',
  carteiras: ['CNR', 'CSB']
}, {
  codigo: '422',
  nome: 'Safra',
  carteiras: ['1', '2']
}, {
  codigo: '707',
  nome: 'Daycoval',
  carteiras: ['3', '17']
}, {
  codigo: '748',
  nome: 'Sicredi',
  carteiras: ['1', 'A']
}, {
  codigo: '756',
  nome: 'Sicoob',
  carteiras: ['1', '3']
}] as const;
export function useBancosConfig(clinicaId: string) {
  const [configs, setConfigs] = useState<BancoConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carregarConfigs = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/configuracoes-banco?clinicaId=${clinicaId}`);
      if (!response.ok) {
        throw new Error('Erro ao carregar configurações bancárias');
      }
      const data = await response.json();
      setConfigs(data);
    } catch (err: any) {
      console.error('❌ [useBancosConfig] Erro ao carregar:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  useEffect(() => {
    carregarConfigs();
  }, [carregarConfigs]);
  // Configurações bancárias alteradas em outro terminal refletem aqui
  useRevalidacao(carregarConfigs, {
    intervalo: 120000,
    pausado: !clinicaId
  });
  const salvarConfig = async (dados: BancoConfigForm, id?: string): Promise<BancoConfig | null> => {
    if (!clinicaId) return null;
    try {
      const url = id ? `${API_BASE_URL}/api/configuracoes-banco/${id}` : `${API_BASE_URL}/api/configuracoes-banco`;
      const response = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          ...dados
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar configuração bancária');
      }
      const result = await response.json();
      await carregarConfigs();
      return result;
    } catch (err: any) {
      console.error('❌ [useBancosConfig] Erro ao salvar:', err);
      throw err;
    }
  };
  const deletarConfig = async (id: string) => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/configuracoes-banco/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao deletar configuração bancária');
      }
      await carregarConfigs();
    } catch (err: any) {
      console.error('❌ [useBancosConfig] Erro ao deletar:', err);
      throw err;
    }
  };
  const toggleAtivo = async (id: string, ativo: boolean) => {
    if (!clinicaId) return;
    const config = configs.find((c) => c.id === id);
    if (!config) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/configuracoes-banco/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          ...config,
          ativo: ativo ? 1 : 0
        })
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar status');
      }
      await carregarConfigs();
    } catch (err: any) {
      console.error('❌ [useBancosConfig] Erro ao toggle ativo:', err);
      throw err;
    }
  };

  // Retorna a config ativa do banco especificado (ou a primeira ativa)
  const getConfigAtiva = (codigoBanco?: string): BancoConfig | null => {
    if (codigoBanco) {
      return configs.find((c) => c.banco === codigoBanco && (c.ativo === 1 || c.ativo === true)) || null;
    }
    return configs.find((c) => c.ativo === 1 || c.ativo === true) || null;
  };
  return {
    configs,
    loading,
    error,
    carregarConfigs,
    salvarConfig,
    deletarConfig,
    toggleAtivo,
    getConfigAtiva
  };
}