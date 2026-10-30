/**
 * Estrutura compartilhada de DOCUMENTO IMPRESSO de várias páginas.
 *
 * Os documentos clínicos eram montados como um único bloco flex de 297 mm:
 * quando o conteúdo passava de uma folha, o cabeçalho saía somente na primeira
 * página e o rodapé apenas na última — as páginas do meio ficavam SEM
 * identificação do paciente e do emissor, e listas/assinaturas eram partidas ao
 * meio. Em documento médico isso é falha grave.
 *
 * Navegadores repetem cabeçalho e rodapé em todas as páginas impressas apenas
 * quando eles estão em `thead`/`tfoot` de uma tabela. Estes helpers
 * padronizam essa estrutura e as regras de quebra de página.
 */

/** CSS da estrutura paginada (tabela com cabeçalho/rodapé repetidos). */
export function cssDocumentoPaginado(): string {
  return [
  '@page { size: A4; margin: 0; }',
  '.doc { width: 210mm; margin: 0 auto; border-collapse: collapse; table-layout: fixed; }',
  '.doc > thead { display: table-header-group; }',
  '.doc > tfoot { display: table-footer-group; }',
  '.doc > tbody { display: table-row-group; }',
  '.doc > thead > tr > td, .doc > tfoot > tr > td { padding: 0; }',
  '.doc > tbody > tr > td { padding: 0; vertical-align: top; }',
  // Faixa de identificação repetida em cada página
  '.faixa-id { padding: 5px 28px; border-bottom: 1px solid #dbeafe; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 12px; }',
  '.faixa-id strong { color: #1e3a5f; }'].
  join('\n');
}

/** Regras de quebra de página: nada de item, linha ou assinatura partidos. */
export function cssQuebrasPagina(escopo = '.body'): string {
  return [
  `${escopo} p, ${escopo} li { orphans: 3; widows: 3; page-break-inside: avoid; }`,
  `${escopo} li, ${escopo} tr { page-break-inside: avoid; }`,
  `${escopo} h1, ${escopo} h2, ${escopo} h3 { page-break-after: avoid; page-break-inside: avoid; }`,
  '.assinatura, .assinatura-bloco, .info-block, .paciente-line, .secao-titulo { page-break-inside: avoid; }',
  '.secao-titulo, .doc-title, .descricao-titulo { page-break-after: avoid; }'].
  join('\n');
}

/** Faixa de identificação exibida no topo de TODAS as páginas. */
export function faixaIdentificacao(
pacienteNome?: string,
documento?: string,
data?: string)
: string {
  const paciente = (pacienteNome || '').trim().toUpperCase() || '—';
  const direita = [documento, data].filter(Boolean).join(' — ');
  return (
    '<div class="faixa-id">' +
    `<span><strong>Paciente:</strong> ${paciente}</span>` + (
    direita ? `<span><strong>${direita}</strong></span>` : '') +
    '</div>');

}

/**
 * Monta o documento paginado: cabeçalho e rodapé repetem em cada folha e o
 * corpo flui por quantas páginas precisar.
 */
export function montarDocumentoPaginado(partes: {
  cabecalho: string;
  rodape: string;
  corpo: string;
}): string {
  return [
  '<table class="doc">',
  '<thead><tr><td>',
  partes.cabecalho,
  '</td></tr></thead>',
  // O rodapé precisa ser declarado ANTES do corpo para o navegador repeti-lo.
  '<tfoot><tr><td>',
  partes.rodape,
  '</td></tr></tfoot>',
  '<tbody><tr><td>',
  partes.corpo,
  '</td></tr></tbody>',
  '</table>'].
  join('\n');
}