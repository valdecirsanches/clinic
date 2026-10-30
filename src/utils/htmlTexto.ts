/**
 * Conversões entre texto simples e HTML.
 *
 * O conteúdo dos relatórios era sempre texto puro. Com o editor de documento,
 * passa a ser HTML — mas os registros ANTIGOS continuam em texto puro. Estes
 * helpers permitem que os dois formatos convivam sem perda: exibição, impressão
 * e pré-visualizações funcionam para ambos.
 */

/** Indica se o conteúdo já está em HTML (foi criado no editor de documento) */
export function pareceHtml(conteudo?: string | null): boolean {
  if (!conteudo) return false;
  return /<\/?(p|div|br|ul|ol|li|h[1-6]|table|strong|b|em|i|u|span|font)\b[^>]*>/i.test(
    conteudo
  );
}

/** Escapa caracteres que quebrariam o HTML */
function escaparHtml(texto: string): string {
  return texto.
  replace(/&/g, '&amp;').
  replace(/</g, '&lt;').
  replace(/>/g, '&gt;');
}

/**
 * Prepara qualquer conteúdo para ser exibido/impresso como HTML.
 * Texto puro tem as quebras de linha preservadas; HTML passa intacto.
 */
export function paraHtml(conteudo?: string | null): string {
  if (!conteudo) return '';
  if (pareceHtml(conteudo)) return conteudo;
  return escaparHtml(conteudo).replace(/\n/g, '<br/>');
}

/**
 * Prepara conteúdo do editor para IMPRESSÃO preservando a formatação
 * (centralização, cor, negrito, listas, tabelas) exatamente como está na tela.
 *
 * Remove apenas o que não pertence a um documento: scripts, estilos globais,
 * iframes, objetos incorporados e manipuladores de evento. Texto puro (registros
 * antigos) continua com as quebras de linha preservadas.
 */
export function paraHtmlImpressao(conteudo?: string | null): string {
  const html = paraHtml(conteudo);
  if (!html) return '';
  return (
    html.
    replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, '').
    replace(/<\s*(script|style|iframe|object|embed)\b[^>]*\/?\s*>/gi, '')
    // Handlers inline (onclick, onerror…) não têm função em documento impresso
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '').
    replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '').
    replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '').
    replace(/javascript:/gi, ''));

}

/**
 * Extrai o texto legível de um conteúdo (para prévias, resumos e listas).
 * Evita que tags apareçam cruas em pré-visualizações truncadas.
 */
export function paraTextoSimples(conteudo?: string | null): string {
  if (!conteudo) return '';
  if (!pareceHtml(conteudo)) return conteudo;
  return conteudo.
  replace(/<\s*br\s*\/?>/gi, '\n').
  replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n').
  replace(/<[^>]+>/g, '').
  replace(/&nbsp;/gi, ' ').
  replace(/&amp;/gi, '&').
  replace(/&lt;/gi, '<').
  replace(/&gt;/gi, '>').
  replace(/\n{3,}/g, '\n\n').
  trim();
}