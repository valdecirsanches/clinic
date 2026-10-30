// ==================== ODONTOGRAMA — MODELO DE DADOS ====================
// Formato gravado em consulta.odontograma (JSON), por dente (numeração FDI):
//   {
//     status: '...'                       ← resumo do dente (formato antigo, mantido)
//     faces: { oclusal: true, ... }       ← faces afetadas (formato antigo, mantido)
//     condicoesFaces: { mesial: 'cariado', oclusal: 'restaurado' }   ← novo
//     marcas: ['tratamento_canal', 'protese']                        ← novo
//     observacao: '...'
//   }
// `status` e `faces` continuam sendo gravados (derivados dos campos novos) para
// que registros e telas antigas sigam funcionando.

export type Face = 'vestibular' | 'lingual' | 'mesial' | 'distal' | 'oclusal';
export type CondicaoFace = 'cariado' | 'restaurado' | 'selante';
export type MarcaDente =
'tratamento_canal' |
'protese' |
'implante' |
'fratura' |
'extracao_indicada' |
'extraido' |
// registros antigos: dente inteiro marcado sem indicar as faces
'cariado' |
'restaurado';

export interface DenteRegistro {
  status: string;
  faces?: Partial<Record<Face, boolean>>;
  condicoesFaces?: Partial<Record<Face, CondicaoFace>>;
  marcas?: MarcaDente[];
  observacao?: string;
}
export type OdontogramaDados = Record<string, DenteRegistro>;

export type Ferramenta = 'selecionar' | 'borracha' | CondicaoFace | Exclude<MarcaDente, 'cariado' | 'restaurado'>;

/** Vermelho = precisa de tratamento · Azul = já tratado (convenção clínica). */
export const COR = {
  tratar: '#E5484D',
  tratarClaro: '#FDECEC',
  tratado: '#2F6FED',
  tratadoClaro: '#E8F0FE',
  selante: '#0E9F8E',
  selanteClaro: '#E0F5F2',
  esmalte: '#FFFFFF',
  esmalteBorda: '#AEB8C4',
  raiz: '#F4EFE6',
  raizBorda: '#C8BCA8',
  ausente: '#CBD5E1',
  gengiva: '#F7D9DC',
  texto: '#475569'
} as const;

export interface DefinicaoFerramenta {
  id: Ferramenta;
  nome: string;
  tipo: 'face' | 'dente' | 'acao';
  grupo: 'tratar' | 'tratado' | 'preventivo' | 'acao';
  atalho?: string;
  descricao: string;
}

export const FERRAMENTAS: DefinicaoFerramenta[] = [
{ id: 'selecionar', nome: 'Selecionar', tipo: 'acao', grupo: 'acao', atalho: 'Esc', descricao: 'Clique em um dente para ver e editar os detalhes' },
{ id: 'cariado', nome: 'Cárie', tipo: 'face', grupo: 'tratar', atalho: '1', descricao: 'Clique nas faces com cárie' },
{ id: 'restaurado', nome: 'Restauração', tipo: 'face', grupo: 'tratado', atalho: '2', descricao: 'Clique nas faces restauradas' },
{ id: 'selante', nome: 'Selante', tipo: 'face', grupo: 'preventivo', atalho: '3', descricao: 'Clique nas faces com selante' },
{ id: 'tratamento_canal', nome: 'Canal', tipo: 'dente', grupo: 'tratado', atalho: '4', descricao: 'Clique no dente com tratamento de canal' },
{ id: 'protese', nome: 'Coroa / prótese', tipo: 'dente', grupo: 'tratado', atalho: '5', descricao: 'Clique no dente com coroa ou prótese' },
{ id: 'implante', nome: 'Implante', tipo: 'dente', grupo: 'tratado', atalho: '6', descricao: 'Clique no dente com implante' },
{ id: 'fratura', nome: 'Fratura', tipo: 'dente', grupo: 'tratar', atalho: '7', descricao: 'Clique no dente fraturado' },
{ id: 'extracao_indicada', nome: 'Extração indicada', tipo: 'dente', grupo: 'tratar', atalho: '8', descricao: 'Clique no dente a extrair' },
{ id: 'extraido', nome: 'Ausente', tipo: 'dente', grupo: 'acao', atalho: '9', descricao: 'Clique no dente ausente ou extraído' },
{ id: 'borracha', nome: 'Apagar', tipo: 'acao', grupo: 'acao', atalho: '0', descricao: 'Clique em uma face ou dente para apagar a marcação' }];


export const NOME_CONDICAO: Record<string, string> = {
  saudavel: 'Hígido',
  cariado: 'Cárie',
  restaurado: 'Restauração',
  selante: 'Selante',
  tratamento_canal: 'Tratamento de canal',
  protese: 'Coroa / prótese',
  implante: 'Implante',
  fratura: 'Fratura',
  extracao_indicada: 'Extração indicada',
  extraido: 'Ausente / extraído'
};

export function corDaCondicao(c: string): {forte: string;clara: string;} {
  if (c === 'selante') return { forte: COR.selante, clara: COR.selanteClaro };
  if (c === 'cariado' || c === 'fratura' || c === 'extracao_indicada') return { forte: COR.tratar, clara: COR.tratarClaro };
  if (c === 'extraido') return { forte: '#94A3B8', clara: '#F1F5F9' };
  if (c === 'saudavel') return { forte: COR.esmalteBorda, clara: '#FFFFFF' };
  return { forte: COR.tratado, clara: COR.tratadoClaro };
}

// ==================== DENTES ====================
export type TipoDente = 'incisivo' | 'canino' | 'premolar' | 'molar';

export const ARCADAS = {
  permanente: {
    superior: [['18', '17', '16', '15', '14', '13', '12', '11'], ['21', '22', '23', '24', '25', '26', '27', '28']],
    inferior: [['48', '47', '46', '45', '44', '43', '42', '41'], ['31', '32', '33', '34', '35', '36', '37', '38']]
  },
  decidua: {
    superior: [['55', '54', '53', '52', '51'], ['61', '62', '63', '64', '65']],
    inferior: [['85', '84', '83', '82', '81'], ['71', '72', '73', '74', '75']]
  }
};

export type Denticao = 'permanente' | 'decidua' | 'mista';

export function infoDente(numero: string) {
  const q = Number(numero[0]);
  const p = Number(numero[1]);
  const decidua = q >= 5;
  const superior = q === 1 || q === 2 || q === 5 || q === 6;
  // Lado do paciente: quadrantes 1/4/5/8 = direito (aparecem à esquerda de quem olha)
  const direito = q === 1 || q === 4 || q === 5 || q === 8;
  let tipo: TipoDente;
  if (decidua) tipo = p <= 2 ? 'incisivo' : p === 3 ? 'canino' : 'molar';else
  tipo = p <= 2 ? 'incisivo' : p === 3 ? 'canino' : p <= 5 ? 'premolar' : 'molar';
  const nomes: Record<string, string> = decidua ?
  { '1': 'Incisivo central', '2': 'Incisivo lateral', '3': 'Canino', '4': 'Primeiro molar', '5': 'Segundo molar' } :
  { '1': 'Incisivo central', '2': 'Incisivo lateral', '3': 'Canino', '4': 'Primeiro pré-molar', '5': 'Segundo pré-molar', '6': 'Primeiro molar', '7': 'Segundo molar', '8': 'Terceiro molar' };
  const nome = `${nomes[String(p)] || 'Dente'} ${superior ? 'superior' : 'inferior'} ${direito ? 'direito' : 'esquerdo'}${decidua ? ' (decíduo)' : ''}`;
  return { q, p, decidua, superior, direito, tipo, nome, anterior: tipo === 'incisivo' || tipo === 'canino' };
}

export function nomeFace(face: Face, numero: string): string {
  const i = infoDente(numero);
  if (face === 'oclusal') return i.anterior ? 'Incisal' : 'Oclusal';
  if (face === 'lingual') return i.superior ? 'Palatina' : 'Lingual';
  return face === 'vestibular' ? 'Vestibular' : face === 'mesial' ? 'Mesial' : 'Distal';
}
export function siglaFace(face: Face, numero: string): string {
  const i = infoDente(numero);
  if (face === 'oclusal') return i.anterior ? 'I' : 'O';
  if (face === 'lingual') return i.superior ? 'P' : 'L';
  return face === 'vestibular' ? 'V' : face === 'mesial' ? 'M' : 'D';
}

// ==================== NORMALIZAÇÃO E DERIVAÇÃO ====================
const FACES: Face[] = ['vestibular', 'lingual', 'mesial', 'distal', 'oclusal'];
const CONDICOES_FACE: CondicaoFace[] = ['cariado', 'restaurado', 'selante'];
const ORDEM_STATUS = ['extraido', 'implante', 'protese', 'tratamento_canal', 'extracao_indicada', 'fratura', 'cariado', 'restaurado', 'selante'];

/** Lê um registro (novo ou antigo) no formato novo. */
export function normalizarDente(r: Partial<DenteRegistro> | undefined): {condicoesFaces: Partial<Record<Face, CondicaoFace>>;marcas: MarcaDente[];observacao: string;} {
  const condicoesFaces: Partial<Record<Face, CondicaoFace>> = { ...(r?.condicoesFaces || {}) };
  let marcas: MarcaDente[] = Array.isArray(r?.marcas) ? [...r!.marcas!] : [];
  if (!r?.condicoesFaces && !r?.marcas && r?.status && r.status !== 'saudavel') {
    // Registro antigo: um status para o dente + faces marcadas (booleanos)
    const facesAntigas = FACES.filter((f) => r.faces?.[f]);
    if (CONDICOES_FACE.includes(r.status as CondicaoFace) && facesAntigas.length) {
      facesAntigas.forEach((f) => {condicoesFaces[f] = r.status as CondicaoFace;});
    } else {
      marcas = [r.status as MarcaDente];
    }
  }
  return { condicoesFaces, marcas, observacao: r?.observacao || '' };
}

/** Monta o registro a gravar (com status/faces derivados) ou null se o dente ficou hígido. */
export function montarDente(condicoesFaces: Partial<Record<Face, CondicaoFace>>, marcas: MarcaDente[], observacao: string): DenteRegistro | null {
  const facesUsadas = FACES.filter((f) => condicoesFaces[f]);
  const presentes = new Set<string>([...marcas, ...facesUsadas.map((f) => condicoesFaces[f] as string)]);
  if (!presentes.size && !observacao.trim()) return null;
  const status = ORDEM_STATUS.find((s) => presentes.has(s)) || 'saudavel';
  const faces: Partial<Record<Face, boolean>> = {};
  facesUsadas.forEach((f) => {faces[f] = true;});
  const reg: DenteRegistro = { status, faces };
  if (facesUsadas.length) {
    const cf: Partial<Record<Face, CondicaoFace>> = {};
    facesUsadas.forEach((f) => {cf[f] = condicoesFaces[f];});
    reg.condicoesFaces = cf;
  }
  if (marcas.length) reg.marcas = Array.from(new Set(marcas));
  if (observacao.trim()) reg.observacao = observacao.trim();
  return reg;
}

export interface Achado {
  dente: string;
  texto: string;
  grupo: 'tratar' | 'tratado' | 'preventivo' | 'outro';
}

/** Lista legível do que foi marcado, dente a dente (tela, resumo e impressão). */
export function listarAchados(dados: OdontogramaDados): Achado[] {
  const achados: Achado[] = [];
  Object.keys(dados || {}).
  sort((a, b) => Number(a) - Number(b)).
  forEach((dente) => {
    const { condicoesFaces, marcas, observacao } = normalizarDente(dados[dente]);
    const porCondicao = new Map<string, string[]>();
    // Ordem clínica das siglas: M O D V L (ex.: "MOD")
    (['mesial', 'oclusal', 'distal', 'vestibular', 'lingual'] as Face[]).filter((f) => condicoesFaces[f]).forEach((f) => {
      const c = condicoesFaces[f] as string;
      if (!porCondicao.has(c)) porCondicao.set(c, []);
      porCondicao.get(c)!.push(siglaFace(f, dente));
    });
    const grupoDe = (c: string): Achado['grupo'] =>
    c === 'selante' ? 'preventivo' : ['cariado', 'fratura', 'extracao_indicada'].includes(c) ? 'tratar' : c === 'extraido' ? 'outro' : 'tratado';
    porCondicao.forEach((faces, c) => achados.push({ dente, texto: `${NOME_CONDICAO[c]} (${faces.join('')})`, grupo: grupoDe(c) }));
    marcas.forEach((m) => achados.push({ dente, texto: NOME_CONDICAO[m] || m, grupo: grupoDe(m) }));
    if (observacao && !porCondicao.size && !marcas.length) achados.push({ dente, texto: 'Observação', grupo: 'outro' });
  });
  return achados;
}

export function denticaoSugerida(dataNascimento?: string): Denticao {
  if (!dataNascimento) return 'permanente';
  const n = new Date(dataNascimento);
  if (isNaN(n.getTime())) return 'permanente';
  const anos = (Date.now() - n.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (anos < 6) return 'decidua';
  if (anos < 12) return 'mista';
  return 'permanente';
}
