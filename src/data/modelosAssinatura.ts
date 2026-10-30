import type { TipoAssinatura } from '../hooks/useAssinaturas';

// Textos sugeridos ao escolher o tipo de documento na solicitação de
// assinatura. O profissional pode editar antes de enviar. São modelos
// genéricos: revise com a assessoria jurídica da clínica.

interface Contexto {
  paciente: string;
  clinica: string;
}

export interface ModeloAssinatura {
  titulo: string;
  texto: (c: Contexto) => string;
}

export const MODELOS_ASSINATURA: Record<TipoAssinatura, ModeloAssinatura> = {
  termo_consentimento: {
    titulo: 'Termo de Consentimento Livre e Esclarecido',
    texto: ({ paciente, clinica }) =>
    `Eu, ${paciente}, declaro que fui informado(a) pelo(a) profissional responsável, de forma clara e em linguagem que compreendi, sobre o diagnóstico, o tratamento proposto, seus benefícios, riscos, possíveis complicações e as alternativas existentes, inclusive a de não realizar o tratamento.

Tive a oportunidade de fazer perguntas, e todas foram respondidas de forma satisfatória. Comprometo-me a seguir as orientações recebidas e a informar qualquer alteração no meu estado de saúde.

Estou ciente de que posso revogar este consentimento a qualquer momento antes do início do procedimento.

Autorizo o registro deste atendimento no meu prontuário e o tratamento dos meus dados pessoais e de saúde por ${clinica}, exclusivamente para fins de assistência à saúde, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).`
  },
  autorizacao_procedimento: {
    titulo: 'Autorização para Procedimento',
    texto: ({ paciente, clinica }) =>
    `Eu, ${paciente}, autorizo ${clinica} e o(a) profissional responsável a realizar o procedimento indicado no meu plano de tratamento, conforme me foi explicado.

Declaro que recebi as orientações sobre os cuidados antes e depois do procedimento, que fui informado(a) sobre os riscos e possíveis intercorrências e que as informações de saúde que prestei são verdadeiras.

Estou ciente de que, durante o procedimento, o(a) profissional poderá adotar condutas diferentes das planejadas quando isso for necessário para a minha segurança.`
  },
  contrato: {
    titulo: 'Contrato de Prestação de Serviços',
    texto: ({ paciente, clinica }) =>
    `Eu, ${paciente}, contrato com ${clinica} a prestação dos serviços de saúde descritos no meu plano de tratamento, pelos valores e condições de pagamento que me foram apresentados e com os quais concordo.

Estou ciente de que o resultado do tratamento depende também da minha colaboração, incluindo comparecer às consultas marcadas e seguir as orientações recebidas.

Em caso de cancelamento ou desistência, aplicam-se as condições informadas pela clínica no momento da contratação.`
  },
  outro: {
    titulo: '',
    texto: () => ''
  }
};

export function nomeClinicaDaSessao(): string {
  try {
    const s = JSON.parse(localStorage.getItem('sessao') || '{}');
    return s?.clinicaAtual?.nome || 'a clínica';
  } catch {
    return 'a clínica';
  }
}

/** (85) 99999-0000 */
export function formatarTelefoneBR(valor: string): string {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const telefoneCompleto = (valor: string) => {
  const d = String(valor || '').replace(/\D/g, '');
  const sem55 = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  return sem55.length === 10 || sem55.length === 11;
};
