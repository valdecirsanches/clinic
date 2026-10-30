/**
 * ⭐ Resolver de Especialidades — FONTE ÚNICA
 *
 * O cadastro de usuário salva as especialidades como um array de IDs
 * (ex: ["11","15"]). Na impressão de atestados/receitas/relatórios isso
 * vinha sendo renderizado CRU ("[\"11\",\"15\"]") ao invés do nome legível.
 *
 * Este helper converte esses IDs (ou nomes já prontos) em um texto legível
 * separado por vírgula. IDs desconhecidos que já são nomes são mantidos.
 */

// Lista padrão id → nome (deve espelhar a lista em UsuarioForm.tsx)
export const ESPECIALIDADES_PADRAO: Record<string, string> = {
  '1': 'Clínica Geral',
  '2': 'Cardiologia',
  '3': 'Dermatologia',
  '4': 'Ginecologia',
  '5': 'Ortopedia',
  '6': 'Pediatria',
  '7': 'Psiquiatria',
  '8': 'Neurologia',
  '9': 'Endocrinologia',
  '10': 'Oftalmologia',
  '11': 'Odontologia Geral',
  '12': 'Ortodontia',
  '13': 'Implantodontia',
  '14': 'Periodontia',
  '15': 'Endodontia'
};

/**
 * Converte uma única entrada (id, nome ou objeto) no nome legível.
 */
function resolverEntrada(entrada: any): string {
  if (entrada == null) return '';
  // Objeto { id?, nome? }
  if (typeof entrada === 'object') {
    if (entrada.nome) return String(entrada.nome).trim();
    if (entrada.id != null && ESPECIALIDADES_PADRAO[String(entrada.id)]) {
      return ESPECIALIDADES_PADRAO[String(entrada.id)];
    }
    return '';
  }
  const str = String(entrada).trim();
  if (!str) return '';
  // ID numérico conhecido → nome
  if (ESPECIALIDADES_PADRAO[str]) return ESPECIALIDADES_PADRAO[str];
  // ID numérico desconhecido → ignora (evita imprimir "16", "23"...)
  if (/^\d+$/.test(str)) return '';
  // Já é um nome legível
  return str;
}

/**
 * Normaliza um valor que pode ser:
 *  - string JSON de array de ids/nomes/objetos: '["11","15"]'
 *  - string simples já legível: 'Cardiologia'
 *  - array já parseado
 */
function extrairLista(valor: any): string[] {
  if (valor == null) return [];
  if (Array.isArray(valor)) return valor.map(resolverEntrada).filter(Boolean);
  const str = String(valor).trim();
  if (!str || str === '[]' || str === 'null' || str === 'undefined') return [];
  // Tenta parsear como JSON array
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr.map(resolverEntrada).filter(Boolean);
    } catch {

      /* ignore — cai no fallback abaixo */}
  }
  // String simples (pode conter vários nomes separados por vírgula)
  return str.
  split(',').
  map((p) => resolverEntrada(p)).
  filter(Boolean);
}

/**
 * Resolve a especialidade legível a partir dos campos do profissional.
 * Prioriza `especialidades` (array de ids do cadastro) e cai para
 * `especialidade` (campo legado, que pode já ser um nome).
 *
 * @returns string legível separada por vírgula, ou '' se nada resolvível.
 */
export function resolverEspecialidade(
especialidade?: any,
especialidades?: any)
: string {
  // 1) Tenta o campo plural (array de ids do cadastro)
  let nomes = extrairLista(especialidades);
  // 2) Se vazio, tenta o campo singular
  if (nomes.length === 0) nomes = extrairLista(especialidade);
  // Dedupe preservando ordem
  const vistos = new Set<string>();
  const unicos = nomes.filter((n) => {
    const k = n.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return unicos.join(', ');
}

// IDs odontológicos na lista padrão (espelha UsuarioForm.tsx)
const IDS_ODONTOLOGICOS = new Set(['11', '12', '13', '14', '15']);

/**
 * Detecta se o profissional é odontológico a partir das especialidades.
 * Reconhece por ID padrão (11–15) ou por palavras-chave no nome.
 */
export function isOdontologica(
especialidade?: any,
especialidades?: any)
: boolean {
  // Verifica IDs crus antes de resolver (mais confiável)
  const idsCrus: string[] = [];
  const coletarIds = (valor: any) => {
    if (valor == null) return;
    if (Array.isArray(valor)) {
      valor.forEach((v) => idsCrus.push(String(v)));
      return;
    }
    const str = String(valor).trim();
    if (!str) return;
    if (str.startsWith('[')) {
      try {
        const arr = JSON.parse(str);
        if (Array.isArray(arr)) arr.forEach((v) => idsCrus.push(String(v)));
        return;
      } catch {

        /* ignore */}
    }
    str.split(',').forEach((p) => idsCrus.push(p.trim()));
  };
  coletarIds(especialidades);
  coletarIds(especialidade);
  if (idsCrus.some((id) => IDS_ODONTOLOGICOS.has(id))) return true;
  // Fallback por nome
  const texto = resolverEspecialidade(
    especialidade,
    especialidades
  ).toLowerCase();
  return /odonto|dent[áa]rio|ortodont|endodont|periodont|implantodont|odontol/.test(
    texto
  );
}

/**
 * Resolve o conselho profissional correto:
 *  - CRO para dentistas (por tipo OU por especialidade odontológica OU se o número contiver CRO)
 *  - CRM para os demais
 */
export function resolverConselho(
tipo?: any,
especialidade?: any,
especialidades?: any,
crmString?: string)
: 'CRM' | 'CRO' {
  if (String(tipo) === 'dentista') return 'CRO';
  if (isOdontologica(especialidade, especialidades)) return 'CRO';
  if (crmString && String(crmString).toUpperCase().includes('CRO')) return 'CRO';
  return 'CRM';
}