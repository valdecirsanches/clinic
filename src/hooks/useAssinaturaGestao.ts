import { useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../config/api';
import type { FaturaAssinatura, ItemFatura, ServicoAssinaturaClinica } from '../types/assinatura';

export interface PlanoGestao {
  id: string;
  nome: string;
  preco: number;
  limitePacientes: number | null;
  limites: Record<string, unknown>;
}

export interface LinhaClinicaGestao {
  clinicaId: string;
  clinicaNome: string;
  plano?: {id: string;nome: string;encontrado: boolean;} | null;
  valorMensalFixo?: number | null;
  mensalidade?: number;
  sms?: {quantidade: number;valor: number;};
  armazenamentoGb?: number;
  previaTotal?: number;
  fatura?: FaturaAssinatura | null;
  erro?: string;
}

export interface DetalheClinicaGestao {
  clinicaId: string;
  competencia: string;
  servicos: ServicoAssinaturaClinica[];
  previa: {itens: ItemFatura[];valorTotal: number;};
  plano: {id: string;nome: string;preco: number;encontrado: boolean;} | null;
  contrato: {valorMensalFixo: number | null;observacoes?: string;};
  faturas: FaturaAssinatura[];
  pendenciasNfse: string[];
}

export interface ConfigGestao {
  mercadoPago: {
    configurado: boolean;
    ambiente: string;
    accessToken: string | null;
    payerEmail: string | null;
    validadePixMin: number;
    urlWebhook: string;
  };
  nfse: {
    url: string;
    ambiente: 'homologacao' | 'producao';
    configurado: boolean;
    emitirAoPagar: boolean;
    codigoServico: string | null;
    aliquotaIss: number | null;
    discriminacao: string;
    porAmbiente: Record<string, {token: string | null;configurado: boolean;}>;
  };
}

function usuarioDaSessao(): string {
  try {
    const bruto = localStorage.getItem('sessao');
    return bruto ? String(JSON.parse(bruto)?.usuario?.id || '') : '';
  } catch {
    return '';
  }
}

/** Chamadas da gestão de assinaturas — o servidor confere o super admin. */
export function useAssinaturaGestao() {
  const usuarioId = useMemo(usuarioDaSessao, []);

  const pedir = useCallback(
    async <T,>(caminho: string, corpo?: object): Promise<T> => {
      const separador = caminho.includes('?') ? '&' : '?';
      const url = `${API_BASE_URL}/api/assinatura-gestao${caminho}${separador}usuarioId=${encodeURIComponent(usuarioId)}`;
      const resposta = await fetch(
        url,
        corpo ?
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ ...corpo, usuarioId })
        } :
        undefined
      );
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        throw new Error(dados?.error || dados?.erro || `Falha na operação (HTTP ${resposta.status}).`);
      }
      return dados as T;
    },
    [usuarioId]
  );

  return useMemo(() => ({
    usuarioId,
    carregarConfig: () => pedir<ConfigGestao>('/config'),
    carregarPlanos: () => pedir<PlanoGestao[]>('/planos'),
    carregarClinicas: (competencia: string) =>
    pedir<{competencia: string;clinicas: LinhaClinicaGestao[];}>(
      `/clinicas?competencia=${competencia}`
    ),
    carregarDetalhe: (clinicaId: string, competencia: string) =>
    pedir<DetalheClinicaGestao>(`/clinicas/${clinicaId}?competencia=${competencia}`),
    salvarContrato: (
    clinicaId: string,
    dados: {plano: string;valorMensalFixo: number | null;observacoes: string;}) =>
    pedir<{ok: boolean;}>(`/clinicas/${clinicaId}/contrato`, dados),
    fecharFatura: (clinicaId: string, competencia: string) =>
    pedir<FaturaAssinatura>('/fechar', { clinicaId, competencia }),
    fecharTodas: (competencia: string) =>
    pedir<{
      fechadas: {clinicaNome: string;valorTotal: number;}[];
      ignoradas: {clinicaNome: string;motivo: string;}[];
    }>('/fechar-todas', { competencia }),
    darBaixa: (faturaId: string, formaPagamento: string) =>
    pedir<FaturaAssinatura>(`/faturas/${faturaId}/baixa`, { formaPagamento }),
    emitirNfse: (faturaId: string) =>
    pedir<{ok: boolean;erro?: string;}>(`/faturas/${faturaId}/nfse`, {}),
    testarMercadoPago: () =>
    pedir<{ok: boolean;conta: {apelido: string;email: string;ambiente: string;};}>(
      '/mercadopago/testar',
      {}
    ),
    testarNfse: () =>
    pedir<{ok: boolean;ambiente: string;totalNotas: number;}>('/nfse/testar', {})
  }), [pedir, usuarioId]);
}