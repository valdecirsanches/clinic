import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';

export interface ConfigSms {
  provider: 'smsgo';
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  remetente?: string;
  ativo: boolean;
  usarComoFallback: boolean;
  mensagemTemplate?: string;
  /** Credenciais SMSGo definidas no server/.env.local (somente leitura) */
  credenciaisServidor?: boolean;
}

export const CONFIG_SMS_PADRAO: ConfigSms = {
  provider: 'smsgo',
  baseUrl: 'https://api.smsgo.com.br',
  apiKey: '',
  bearerToken: '',
  remetente: '',
  ativo: false,
  usarComoFallback: true,
  mensagemTemplate:
  'Ola {nome}, sua consulta esta agendada para {data} as {horario} com {profissional}.'
};

/** `credenciaisServidor` é só informativo — não é gravado na clínica */
function semCampoDoServidor(config: ConfigSms): Omit<ConfigSms, 'credenciaisServidor'> {
  const { credenciaisServidor: _informativo, ...resto } = config;
  return resto;
}

export function useSmsConfig(clinicaId: string | undefined) {
  const [config, setConfig] = useState<ConfigSms | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) {
      setLoading(false);
      setConfig(null);
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sms-config?clinicaId=${clinicaId}`
      );
      if (response.status === 404) {
        const corpo = await response.json().catch(() => null);
        // Sem cadastro na clínica, mas com credenciais fixas no servidor
        setConfig(
          corpo?.credenciaisServidor ?
          { ...CONFIG_SMS_PADRAO, credenciaisServidor: true } :
          null
        );
        setError(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setConfig({
        ...CONFIG_SMS_PADRAO,
        ...data
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);

  const salvar = useCallback(
    async (novaConfig: ConfigSms) => {
      if (!clinicaId) {
        throw new Error('clinicaId não definido');
      }
      const response = await fetch(`${API_BASE_URL}/api/sms-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          ...semCampoDoServidor(novaConfig)
        })
      });
      if (!response.ok) {
        const texto = await response.text();
        throw new Error(`HTTP ${response.status}: ${texto}`);
      }
      const data = await response.json();
      setConfig({
        ...novaConfig
      });
      setError(null);
      return data;
    },
    [clinicaId]
  );

  const enviarTeste = useCallback(
    async (telefone: string) => {
      if (!clinicaId) {
        throw new Error('clinicaId não definido');
      }
      const response = await fetch(`${API_BASE_URL}/api/sms/testar`, {
        method: 'POST',
        // text/plain evita o preflight OPTIONS do CORS (o servidor aceita ambos)
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify({
          clinicaId,
          telefone
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      return data;
    },
    [clinicaId]
  );

  const consultarSaldo = useCallback(async () => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    const response = await fetch(
      `${API_BASE_URL}/api/sms/saldo?clinicaId=${clinicaId}`
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data as {
      balance: number | null;
      currency: string;
      company: string | null;
    };
  }, [clinicaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return {
    config,
    loading,
    error,
    salvar,
    recarregar: carregar,
    enviarTeste,
    consultarSaldo
  };
}