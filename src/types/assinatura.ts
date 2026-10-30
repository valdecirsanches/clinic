/**
 * Tipos do FINANCEIRO DA ASSINATURA (plataforma → clínica).
 *
 * ⚠️ Não confundir com o financeiro operacional (clínica → paciente), que vive
 * em `types/index.ts` (Financeiro, Parcela, Boleto). Aqui é a cobrança do uso
 * do próprio sistema pela clínica cliente.
 */

/** Serviços cobráveis da plataforma */
export type ServicoAssinaturaId =
'sistema' |
'memed' |
'whatsapp' |
'sms' |
'armazenamento' |
'ponto_biometrico' |
'nfse' |
'assistente_voz';

/** Como o serviço é cobrado */
export type ModeloCobranca = 'mensal' | 'por_uso';

export interface ServicoAssinaturaConfig {
  id: ServicoAssinaturaId;
  nome: string;
  descricao: string;
  modelo: ModeloCobranca;
  /** Rótulo da unidade quando o modelo é por uso (ex.: "SMS enviado") */
  unidade?: string;
}

/** Catálogo fixo dos serviços — a ordem é a ordem exibida na fatura */
export const SERVICOS_ASSINATURA: ServicoAssinaturaConfig[] = [
{
  id: 'sistema',
  nome: 'Taxa de uso do sistema',
  descricao: 'Acesso ao sistema, prontuário, agenda e suporte.',
  modelo: 'mensal'
},
{
  id: 'memed',
  nome: 'Integração Memed',
  descricao: 'Prescrição digital integrada, por profissional habilitado.',
  modelo: 'por_uso',
  unidade: 'profissional habilitado'
},
{
  id: 'whatsapp',
  nome: 'Uso do WhatsApp',
  descricao: 'Envio de avisos, lembretes e documentos por WhatsApp.',
  modelo: 'mensal'
},
{
  id: 'sms',
  nome: 'Uso do SMS',
  descricao:
  'Medido a cada envio. SMS longos contam as partes cobradas pela operadora.',
  modelo: 'por_uso',
  unidade: 'SMS (parte cobrada)'
},
{
  id: 'armazenamento',
  nome: 'Espaço de documentação',
  descricao:
  'Espaço ocupado por exames, imagens e documentos. Franquia em GB.',
  modelo: 'por_uso',
  unidade: 'GB'
},
{
  id: 'ponto_biometrico',
  nome: 'Ponto facial e biométrico',
  descricao: 'Registro de ponto por reconhecimento facial e digital.',
  modelo: 'mensal'
},
{
  id: 'nfse',
  nome: 'Emissão de NFS-e',
  descricao: 'Cobrado por nota fiscal de serviço emitida.',
  modelo: 'por_uso',
  unidade: 'nota emitida'
},
{
  id: 'assistente_voz',
  nome: 'Assistente de voz (IA)',
  descricao:
  'Marcação e consulta da agenda por voz. Cobrado por pedido atendido; o administrador da clínica ativa.',
  modelo: 'por_uso',
  unidade: 'pedido atendido'
}];


/** Preço + ativação de um serviço para a clínica */
export interface ServicoAssinaturaClinica {
  servico: ServicoAssinaturaId;
  /** Cobra na fatura: exige estar contratado E habilitado */
  ativo: boolean;
  contratado?: boolean;
  /** Ligado na configuração real do serviço; `null` se não depende disso */
  habilitado?: boolean | null;
  /** De onde vem a mensalidade do sistema */
  origemValor?: 'plano' | 'tabela' | 'contrato';
  planoNome?: string;
  /** true quando a clínica não tem plano nem valor contratado */
  semPlano?: boolean;
  valorMensal: number;
  valorUnitario: number;
  franquia: number;
}

/** Item já calculado dentro de uma fatura */
export interface ItemFatura {
  servico: ServicoAssinaturaId;
  nome: string;
  modelo: ModeloCobranca;
  quantidade: number;
  franquia?: number;
  /** Quantidade que passou da franquia — é a base de cálculo */
  quantidadeCobravel: number;
  valorUnitario: number;
  valor: number;
  unidade?: string;
}

export type StatusFatura =
'aberta' |
'em_analise' |
'paga' |
'vencida' |
'cancelada';

export type FormaPagamentoAssinatura =
'pix' |
'boleto' |
'cartao_credito' |
'transferencia';

export type StatusNfse =
'processando' |
'autorizada' |
'rejeitada' |
'erro' |
'pendente_dados';

export interface NfseFatura {
  status: StatusNfse;
  numero: string | null;
  link: string | null;
  erro: string | null;
  ambiente: 'homologacao' | 'producao' | null;
  emitidaEm: string | null;
}

export interface FaturaAssinatura {
  id: string;
  clinicaId: string;
  clinicaNome?: string;
  /** Competência no formato AAAA-MM */
  competencia: string;
  itens: ItemFatura[];
  valorTotal: number;
  status: StatusFatura;
  vencimento: string;
  formaPagamento?: FormaPagamentoAssinatura | 'dinheiro' | null;
  pagoEm?: string | null;
  /** Quando a clínica informou o pagamento (aguardando confirmação) */
  informadoEm?: string | null;
  origemPagamento?: 'mercadopago' | 'manual' | null;
  criadoEm: string;
  mercadoPago?: {paymentId: string;status: string | null;} | null;
  nfse?: NfseFatura | null;
}

export const FORMAS_PAGAMENTO_ASSINATURA: {
  id: FormaPagamentoAssinatura;
  nome: string;
  descricao: string;
}[] = [
{
  id: 'pix',
  nome: 'PIX',
  descricao: 'Confirmação imediata. QR Code ou copia e cola.'
},
{
  id: 'boleto',
  nome: 'Boleto bancário',
  descricao: 'Compensação em até 2 dias úteis.'
},
{
  id: 'cartao_credito',
  nome: 'Cartão de crédito',
  descricao: 'Pagamento seguro pelo Mercado Pago.'
},
{
  id: 'transferencia',
  nome: 'Transferência bancária',
  descricao: 'Confirmada pela equipe após a conferência.'
}];


export const ROTULO_STATUS_FATURA: Record<StatusFatura, string> = {
  aberta: 'Em aberto',
  em_analise: 'Em análise',
  paga: 'Paga',
  vencida: 'Vencida',
  cancelada: 'Cancelada'
};

export const ESTILO_STATUS_FATURA: Record<StatusFatura, string> = {
  aberta: 'bg-amber-100 text-amber-800',
  em_analise: 'bg-sky-100 text-sky-800',
  paga: 'bg-green-100 text-green-800',
  vencida: 'bg-red-100 text-red-800',
  cancelada: 'bg-gray-100 text-gray-600'
};

export const ROTULO_STATUS_NFSE: Record<StatusNfse, string> = {
  processando: 'NFS-e em processamento',
  autorizada: 'NFS-e autorizada',
  rejeitada: 'NFS-e rejeitada',
  erro: 'Falha na NFS-e',
  pendente_dados: 'NFS-e pendente de dados'
};

/** Formata uma quantidade de uso (GB com 2 casas, demais inteiras) */
export function formatarQuantidadeUso(item: Pick<ItemFatura, 'servico' | 'quantidade'>): string {
  if (item.servico === 'armazenamento') {
    return `${item.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
  }
  return item.quantidade.toLocaleString('pt-BR');
}

export function formatarMoeda(valor: number): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  const meses = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return `${meses[Number(mes) - 1] || mes} de ${ano}`;
}