import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
import type {
  FaturaAssinatura,
  FormaPagamentoAssinatura,
  ItemFatura,
  ServicoAssinaturaClinica } from
'../types/assinatura';

export interface PreviaFatura {
  competencia: string;
  itens: ItemFatura[];
  valorTotal: number;
  parcial: boolean;
  plano?: {
    id: string;
    nome: string;
    preco: number;
    encontrado: boolean;
    limitePacientes: number | null;
    limites?: {
      usuarios?: number;
      armazenamentoGb?: number;
      sms?: boolean;
      diasTeste?: number;
    };
  } | null;
  valorMensalContratado?: number | null;
  armazenamentoGb?: number;
}

export interface PixMercadoPago {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  expiraEm: string;
}

interface UseAssinaturaResult {
  servicos: ServicoAssinaturaClinica[];
  previa: PreviaFatura | null;
  faturas: FaturaAssinatura[];
  mercadoPagoAtivo: boolean;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
  fecharFatura: (competencia?: string) => Promise<FaturaAssinatura>;
  informarPagamento: (
  faturaId: string,
  formaPagamento: FormaPagamentoAssinatura)
  => Promise<FaturaAssinatura>;
  gerarPix: (faturaId: string) => Promise<PixMercadoPago>;
  abrirCheckout: (faturaId: string) => Promise<string>;
  verificarPagamento: (faturaId: string) => Promise<boolean>;
}

/** POST como text/plain: evita o preflight que o proxy não repassa */
async function postar<T>(caminho: string, corpo: object): Promise<T> {
  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(corpo)
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(dados?.error || `Falha na operação (HTTP ${resposta.status}).`);
  }
  return dados as T;
}

/**
 * Dados do financeiro da ASSINATURA da clínica (uso do próprio sistema).
 * Não confundir com useFinanceiro/useBoletos (clínica → paciente).
 */
export function useAssinatura(clinicaId?: string): UseAssinaturaResult {
  const [servicos, setServicos] = useState<ServicoAssinaturaClinica[]>([]);
  const [previa, setPrevia] = useState<PreviaFatura | null>(null);
  const [faturas, setFaturas] = useState<FaturaAssinatura[]>([]);
  const [mercadoPagoAtivo, setMercadoPagoAtivo] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!clinicaId) {
      setServicos([]);
      setPrevia(null);
      setFaturas([]);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const [resServicos, resPrevia, resFaturas, resPagamento] = await Promise.all([
      fetch(`${API_BASE_URL}/api/assinatura/servicos?clinicaId=${clinicaId}`),
      fetch(`${API_BASE_URL}/api/assinatura/previa?clinicaId=${clinicaId}`),
      fetch(`${API_BASE_URL}/api/assinatura/faturas?clinicaId=${clinicaId}`),
      fetch(`${API_BASE_URL}/api/assinatura/pagamento/config`).catch(() => null)]
      );
      if (!resServicos.ok || !resPrevia.ok || !resFaturas.ok) {
        throw new Error('Não foi possível carregar os dados da assinatura.');
      }
      setServicos(await resServicos.json());
      setPrevia(await resPrevia.json());
      setFaturas(await resFaturas.json());
      if (resPagamento && resPagamento.ok) {
        const config = await resPagamento.json().catch(() => null);
        setMercadoPagoAtivo(Boolean(config?.mercadoPago));
      }
    } catch (err: any) {
      setErro(err.message || 'Falha ao carregar a assinatura.');
    } finally {
      setCarregando(false);
    }
  }, [clinicaId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Fatura e pagamentos feitos em outro terminal refletem aqui
  useRevalidacao(recarregar, {
    intervalo: 60000,
    pausado: !clinicaId
  });

  const fecharFatura = useCallback(
    async (competencia?: string) => {
      const dados = await postar<FaturaAssinatura>('/api/assinatura/faturas/fechar', {
        clinicaId,
        competencia
      });
      await recarregar();
      return dados;
    },
    [clinicaId, recarregar]
  );

  const informarPagamento = useCallback(
    async (faturaId: string, formaPagamento: FormaPagamentoAssinatura) => {
      const dados = await postar<FaturaAssinatura>(
        `/api/assinatura/faturas/${faturaId}/informar-pagamento`,
        { formaPagamento }
      );
      await recarregar();
      return dados;
    },
    [recarregar]
  );

  const gerarPix = useCallback(
    (faturaId: string) =>
    postar<PixMercadoPago>(`/api/assinatura/faturas/${faturaId}/mercadopago/pix`, {}),
    []
  );

  const abrirCheckout = useCallback(async (faturaId: string) => {
    const dados = await postar<{url: string;}>(
      `/api/assinatura/faturas/${faturaId}/mercadopago/checkout`,
      { urlRetorno: window.location.origin.startsWith('https') ? window.location.href : '' }
    );
    if (!dados?.url) throw new Error('O Mercado Pago não devolveu o link de pagamento.');
    return dados.url;
  }, []);

  const verificarPagamento = useCallback(
    async (faturaId: string) => {
      const dados = await postar<{pago: boolean;}>(
        `/api/assinatura/faturas/${faturaId}/verificar`,
        {}
      );
      if (dados?.pago) await recarregar();
      return Boolean(dados?.pago);
    },
    [recarregar]
  );

  return {
    servicos,
    previa,
    faturas,
    mercadoPagoAtivo,
    carregando,
    erro,
    recarregar,
    fecharFatura,
    informarPagamento,
    gerarPix,
    abrirCheckout,
    verificarPagamento
  };
}