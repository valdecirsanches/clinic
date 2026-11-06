// ============================================================================
// Aparência da tela, escolhida POR USUÁRIO (cabeçalho › Aparência).
//
// Como funciona: as cores "teal-*" (destaque do EasyClin: botões, links, item
// ativo do menu) e "gray-*" do Tailwind leem variáveis CSS (vite.config.ts).
// Trocar o tema = trocar essas variáveis no <html>, sem recarregar a página.
// O modo escuro inverte a escala de cinza e escurece os fundos brancos
// (regras em index.css, classe .tema-escuro).
//
// Sem tema salvo (null) = aparência padrão. O usuário volta ao padrão pelo
// botão "Voltar ao padrão" da janela de Aparência, que grava null.
// ============================================================================

export type Escala = Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>;

export interface CorTema {
  id: string;
  nome: string;
  /** Tons da cor de destaque, "r g b". */
  destaque: Escala;
}

export interface PreferenciaTema {
  cor: string;
  modo: 'claro' | 'escuro';
  letra: 'normal' | 'grande';
  cantos: 'arredondados' | 'retos';
}

export const TEMA_PADRAO: PreferenciaTema = { cor: 'verde-agua', modo: 'claro', letra: 'normal', cantos: 'arredondados' };

const TONS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
const escala = (s: string[]): Escala => Object.fromEntries(TONS.map((k, i) => [k, s[i]])) as Escala;

export const CORES: CorTema[] = [
{
  id: 'verde-agua', nome: 'EasyClin',
  destaque: escala(['240 253 250', '204 251 241', '153 246 228', '94 234 212', '45 212 191', '20 184 166', '13 148 136', '15 118 110', '17 94 89', '19 78 74', '4 47 46'])
},
{
  id: 'azul', nome: 'Azul',
  destaque: escala(['239 246 255', '219 234 254', '191 219 254', '147 197 253', '96 165 250', '59 130 246', '37 99 235', '29 78 216', '30 64 175', '30 58 138', '23 37 84'])
},
{
  id: 'verde', nome: 'Verde',
  destaque: escala(['236 253 245', '209 250 229', '167 243 208', '110 231 183', '52 211 153', '16 185 129', '5 150 105', '4 120 87', '6 95 70', '6 78 59', '2 44 34'])
},
{
  id: 'roxo', nome: 'Roxo',
  destaque: escala(['245 243 255', '237 233 254', '221 214 254', '196 181 253', '167 139 250', '139 92 246', '124 58 237', '109 40 217', '91 33 182', '76 29 149', '46 16 101'])
},
{
  id: 'vinho', nome: 'Vinho',
  destaque: escala(['255 241 242', '255 228 230', '254 205 211', '253 164 175', '251 113 133', '244 63 94', '225 29 72', '190 18 60', '159 18 57', '136 19 55', '76 5 25'])
},
{
  id: 'laranja', nome: 'Laranja',
  destaque: escala(['255 247 237', '255 237 213', '254 215 170', '253 186 116', '251 146 60', '249 115 22', '234 88 12', '194 65 12', '154 52 18', '124 45 18', '67 20 7'])
},
{
  id: 'grafite', nome: 'Grafite',
  destaque: escala(['248 250 252', '241 245 249', '226 232 240', '203 213 225', '148 163 184', '100 116 139', '71 85 105', '51 65 85', '30 41 59', '15 23 42', '2 6 23'])
}];


/** Cinzas do Tailwind (claro) e a mesma escala invertida (escuro). */
const CINZA_CLARO = ['249 250 251', '243 244 246', '229 231 235', '209 213 219', '156 163 175', '107 114 128', '75 85 99', '55 65 81', '31 41 55', '17 24 39', '3 7 18'];
const CINZA_ESCURO = ['22 27 36', '31 38 50', '45 54 69', '64 75 92', '107 118 135', '148 158 173', '178 187 200', '203 210 220', '226 231 238', '241 244 248', '250 251 252'];

const CHAVE_LOCAL = 'easyclin-tema';

/** Aceita o objeto, o JSON gravado no banco (texto) ou nada. */
export function normalizarTema(t: unknown): PreferenciaTema {
  let v: any = t;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  if (!v || typeof v !== 'object') return TEMA_PADRAO;
  return {
    cor: CORES.some((c) => c.id === v.cor) ? v.cor : TEMA_PADRAO.cor,
    modo: v.modo === 'escuro' ? 'escuro' : 'claro',
    letra: v.letra === 'grande' ? 'grande' : 'normal',
    cantos: v.cantos === 'retos' ? 'retos' : 'arredondados'
  };
}

export function ehTemaPadrao(t: PreferenciaTema) {
  return JSON.stringify(normalizarTema(t)) === JSON.stringify(TEMA_PADRAO);
}

/** Último tema usado neste navegador (para a tela não piscar ao abrir). */
export function lerTemaLocal(): PreferenciaTema {
  try {
    return normalizarTema(localStorage.getItem(CHAVE_LOCAL));
  } catch {
    return TEMA_PADRAO;
  }
}

/** Mistura duas cores "r g b": peso = quanto fica da primeira. */
function mistura(a: string, b: string, peso: number) {
  const pa = a.split(' ').map(Number);
  const pb = b.split(' ').map(Number);
  return pa.map((v, i) => Math.round(v * peso + pb[i] * (1 - peso))).join(' ');
}

/** Aplica o tema na página inteira (e guarda neste navegador para a próxima abertura). */
export function aplicarTema(preferencia: unknown) {
  if (typeof document === 'undefined') return;
  const t = normalizarTema(preferencia);
  const cor = CORES.find((c) => c.id === t.cor) || CORES[0];
  const raiz = document.documentElement;
  const escuro = t.modo === 'escuro';
  Object.entries(cor.destaque).forEach(([k, v]) => raiz.style.setProperty(`--destaque-${k}`, v));
  // No escuro, os tons mais claros do destaque (fundos "teal-50/100") viram
  // tons escuros da mesma cor, para não acender a tela.
  if (escuro) {
    raiz.style.setProperty('--destaque-50', mistura(cor.destaque['900'], '22 27 36', 0.35));
    raiz.style.setProperty('--destaque-100', mistura(cor.destaque['800'], '22 27 36', 0.45));
  }
  (escuro ? CINZA_ESCURO : CINZA_CLARO).forEach((v, i) => raiz.style.setProperty(`--cinza-${TONS[i]}`, v));
  raiz.classList.toggle('tema-escuro', escuro);
  raiz.classList.toggle('tema-cantos-retos', t.cantos === 'retos');
  raiz.style.colorScheme = escuro ? 'dark' : 'light';
  raiz.style.fontSize = t.letra === 'grande' ? '17.5px' : '';
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(t));
  } catch {

    /* sem armazenamento local */}
}
