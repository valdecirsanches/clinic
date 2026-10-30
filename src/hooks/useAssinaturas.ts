import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { ENV_APP_BASE_URL } from '../config/env';
export type TipoAssinatura = 'termo_consentimento' | 'autorizacao_procedimento' | 'contrato' | 'outro';
export type StatusAssinatura = 'pendente' | 'assinado' | 'expirado' | 'cancelado';
export interface AssinaturaPendente {
  id: string;
  token: string;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  tipo: TipoAssinatura;
  titulo: string;
  descricao?: string;
  assinaturaBase64?: string;
  status: StatusAssinatura;
  criadoEm: string;
  assinadoEm?: string;
  expiraEm: string;
}
export interface SolicitarAssinaturaParams {
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  tipo: TipoAssinatura;
  titulo: string;
  descricao?: string;
  atendimentoId?: string;
}
export function useAssinaturas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const solicitarAssinatura = useCallback(async (params: SolicitarAssinaturaParams) => {
    console.log('📝 [useAssinaturas] Solicitando assinatura:', params);
    console.log('📝 [useAssinaturas] API_BASE_URL:', API_BASE_URL);
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE_URL}/api/assinaturas/solicitar`;
      console.log('📝 [useAssinaturas] URL:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        // ⭐ Endereço do link enviado ao paciente: VITE_APP_BASE_URL do
        //    .env.local desta instalação; sem ele, o endereço aberto agora.
        body: JSON.stringify({ ...params, appUrl: ENV_APP_BASE_URL || window.location.origin })
      });
      console.log('📝 [useAssinaturas] Response status:', response.status);
      const data = await response.json();
      console.log('📝 [useAssinaturas] Response data:', data);
      if (!response.ok) {
        throw new Error(data.error || `Erro ${response.status}: Falha ao solicitar assinatura`);
      }
      return data;
    } catch (err: any) {
      console.error('❌ [useAssinaturas] Erro:', err);
      const errorMessage = err.message || 'Erro ao solicitar assinatura';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);
  const getAssinaturaPorToken = useCallback(async (token: string): Promise<AssinaturaPendente> => {
    console.log('📝 [useAssinaturas] Buscando assinatura por token:', token);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/assinaturas/${token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Assinatura não encontrada ou inválida');
      }
      return await response.json();
    } catch (err: any) {
      console.error('❌ [useAssinaturas] Erro:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  const assinarDocumento = useCallback(async (token: string, assinaturaBase64: string) => {
    console.log('📝 [useAssinaturas] Assinando documento:', token);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/assinaturas/${token}/assinar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assinaturaBase64
        })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao salvar assinatura');
      }
      return await response.json();
    } catch (err: any) {
      console.error('❌ [useAssinaturas] Erro:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  return {
    loading,
    error,
    solicitarAssinatura,
    getAssinaturaPorToken,
    assinarDocumento
  };
}