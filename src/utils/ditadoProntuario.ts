/**
 * Ditado no prontuário: ponte entre o assistente (fora da tela) e as etapas
 * (cada uma dona do seu formulário e do seu salvamento automático).
 *
 *   assistente → 'ditado:preencher' { id, etapa, valores, modo }
 *   etapa      → 'ditado:resultado' { id, ok, campos, motivo }
 *
 * A etapa só existe na tela quando a aba está aberta; por isso o envio
 * troca de aba, espera ela montar e repete até receber a resposta.
 */

export const EVENTO_PREENCHER = 'ditado:preencher';
export const EVENTO_RESULTADO = 'ditado:resultado';
export const EVENTO_CONTEXTO = 'ditado:contexto';

/** O prontuário aberto se anuncia aqui; o assistente lê. */
export interface ContextoProntuario {
  etapaAtual: string;
  paciente: string;
  somenteLeitura: boolean;
  abrirEtapa: (etapa: string) => void;
}

let contextoAtual: ContextoProntuario | null = null;

export function definirContextoProntuario(contexto: ContextoProntuario | null) {
  contextoAtual = contexto;
  window.dispatchEvent(new Event(EVENTO_CONTEXTO));
}

export function lerContextoProntuario() {
  return contextoAtual;
}

export const ETAPAS_DITAVEIS: EtapaDitavel[] = ['anamnese', 'exame_fisico', 'diagnostico', 'evolucao'];

export type EtapaDitavel = 'anamnese' | 'exame_fisico' | 'diagnostico' | 'evolucao';
export type ModoDitado = 'acrescentar' | 'substituir';

export interface PedidoPreencher {
  id: string;
  etapa: EtapaDitavel;
  valores: Record<string, string>;
  modo: ModoDitado;
}

export interface ResultadoPreencher {
  id: string;
  ok: boolean;
  campos: string[];
  motivo?: 'somente_leitura' | 'sem_campos' | 'sem_resposta';
}

export const NOME_ETAPA: Record<string, string> = {
  resumo_atendimento: 'Resumo',
  anamnese: 'Anamnese',
  exame_fisico: 'Exame Físico',
  diagnostico: 'Diagnóstico',
  evolucao: 'Evolução',
  exames: 'Exames',
  prescricoes: 'Prescrições',
  relatorios: 'Relatórios',
  atestado: 'Atestado',
  imagens: 'Imagens',
  odontograma: 'Odontograma',
  resumo: 'Prontuário'
};

export const NOME_CAMPO: Record<string, string> = {
  queixaPrincipal: 'Queixa principal',
  historiaQueixa: 'História da queixa (HDA)',
  historicoDoencas: 'Doenças pregressas',
  alergias: 'Alergias',
  medicamentosEmUso: 'Medicamentos em uso',
  historicoFamiliar: 'Histórico familiar',
  habitosVida: 'Hábitos de vida',
  altura: 'Altura',
  peso: 'Peso',
  pressaoArterial: 'Pressão arterial',
  pulso: 'Pulso',
  temperatura: 'Temperatura',
  saturacaoO2: 'Saturação O₂',
  frequenciaRespiratoria: 'Frequência respiratória',
  glicemia: 'Glicemia',
  observacoesGerais: 'Observações do exame',
  cid: 'Busca de CID',
  observacoes: 'Observações do diagnóstico',
  evolucaoAtual: 'Evolução'
};

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Texto ditado → parágrafos do editor rico. */
export function textoParaHtml(texto: string) {
  return texto.
  split(/\n+/).
  map((l) => l.trim()).
  filter(Boolean).
  map((l) => `<p>${escaparHtml(l)}</p>`).
  join('');
}

function htmlVazio(html: string) {
  return !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export function juntarHtml(atual: string, novo: string, modo: ModoDitado) {
  const html = textoParaHtml(novo);
  if (modo === 'substituir' || htmlVazio(atual)) return html;
  return `${atual}${html}`;
}

export function juntarTexto(atual: string, novo: string, modo: ModoDitado) {
  const limpo = novo.trim();
  if (modo === 'substituir' || !String(atual || '').trim()) return limpo;
  return `${atual.trim()}\n${limpo}`;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Entrega o ditado à etapa, abrindo a aba se preciso. */
export async function entregarNaEtapa(
etapa: EtapaDitavel,
valores: Record<string, string>,
modo: ModoDitado,
etapaAtual: string,
abrirEtapa: (etapa: EtapaDitavel) => void)
: Promise<ResultadoPreencher> {
  const id = `dit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (etapaAtual !== etapa) {
    abrirEtapa(etapa);
    await esperar(350);
  }
  return new Promise((resolve) => {
    let encerrado = false;
    const ouvir = (ev: Event) => {
      const r = (ev as CustomEvent<ResultadoPreencher>).detail;
      if (!r || r.id !== id || encerrado) return;
      encerrado = true;
      window.removeEventListener(EVENTO_RESULTADO, ouvir);
      clearInterval(repetir);
      resolve(r);
    };
    window.addEventListener(EVENTO_RESULTADO, ouvir);
    const enviar = () =>
    window.dispatchEvent(new CustomEvent<PedidoPreencher>(EVENTO_PREENCHER, { detail: { id, etapa, valores, modo } }));
    enviar();
    const repetir = window.setInterval(enviar, 300);
    setTimeout(() => {
      if (encerrado) return;
      encerrado = true;
      clearInterval(repetir);
      window.removeEventListener(EVENTO_RESULTADO, ouvir);
      resolve({ id, ok: false, campos: [], motivo: 'sem_resposta' });
    }, 2500);
  });
}