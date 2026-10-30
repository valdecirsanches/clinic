/**
 * Hook para gerenciar boletos registrados via API Itaú
 */

import { useState } from 'react';
import { API_BASE_URL } from '../config/api';
export interface DadosBoletoItau {
  bancoConfigId: string;
  nossoNumero: string;
  valor: number;
  dataVencimento: string;
  dataEmissao?: string;
  sacadoNome: string;
  sacadoCpf?: string;
  sacadoEndereco?: string;
  sacadoBairro?: string;
  sacadoCidade?: string;
  sacadoUf?: string;
  sacadoCep?: string;
}
export interface ResultadoBoletoItau {
  sucesso: boolean;
  codigoBarras?: string;
  linhaDigitavel?: string;
  localPagamento?: string;
  mensagem?: string;
}
export function useBoletoItau() {
  const [registrando, setRegistrando] = useState(false);
  const [consultando, setConsultando] = useState(false);

  /**
   * Registra um boleto na API do Itaú
   */
  const registrarBoleto = async (dados: DadosBoletoItau): Promise<ResultadoBoletoItau> => {
    setRegistrando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/boletos-itau/registrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dados)
      });
      const resultado = await response.json();
      if (!response.ok) {
        throw new Error(resultado.error || 'Erro ao registrar boleto');
      }
      return resultado;
    } catch (error: any) {
      console.error('❌ [useBoletoItau] Erro ao registrar:', error);
      throw error;
    } finally {
      setRegistrando(false);
    }
  };

  /**
   * Consulta situação de um boleto registrado
   */
  const consultarSituacao = async (bancoConfigId: string, nossoNumero: string): Promise<ResultadoBoletoItau> => {
    setConsultando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/boletos-itau/consultar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bancoConfigId,
          nossoNumero
        })
      });
      const resultado = await response.json();
      if (!response.ok) {
        throw new Error(resultado.error || 'Erro ao consultar boleto');
      }
      return resultado;
    } catch (error: any) {
      console.error('❌ [useBoletoItau] Erro ao consultar:', error);
      throw error;
    } finally {
      setConsultando(false);
    }
  };

  /**
   * Testa conexão com API do Itaú (obtém token OAuth)
   */
  const testarConexao = async (bancoConfigId: string): Promise<{
    sucesso: boolean;
    mensagem?: string;
    error?: string;
  }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/boletos-itau/teste-conexao/${bancoConfigId}`);
      const resultado = await response.json();
      if (!response.ok) {
        throw new Error(resultado.error || 'Erro ao testar conexão');
      }
      return resultado;
    } catch (error: any) {
      console.error('❌ [useBoletoItau] Erro ao testar conexão:', error);
      throw error;
    }
  };
  return {
    registrando,
    consultando,
    registrarBoleto,
    consultarSituacao,
    testarConexao
  };
}