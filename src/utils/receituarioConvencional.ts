/**
 * Receituário CONVENCIONAL — papel timbrado do profissional.
 *
 * Reproduz o modelo tradicional usado em consultório: cabeçalho com o nome do
 * profissional, especialidade, títulos e CRM; corpo com o paciente em uma
 * linha, os medicamentos em linhas pontilhadas (quantidade à direita) e a
 * posologia abaixo; assinatura alinhada à direita com os RQEs; e rodapé com os
 * dados da clínica.
 *
 * Quando a prescrição está marcada como CONTROLE ESPECIAL, o título passa a
 * "RECEITUARIO DE CONTROLE ESPECIAL", o documento é emitido em 2 vias e recebe
 * os quadros de identificação do comprador e do fornecedor.
 *
 * Este layout NÃO substitui os modelos oficiais da Anvisa: ele existe porque a
 * prescrição comum não segue modelo padronizado e porque muitos profissionais
 * já utilizam o próprio papel timbrado.
 */

import type { DadosReceituario, MedicamentoReceituario } from './receituarioControlado';
import { paraHtmlImpressao } from './htmlTexto';

function esc(valor?: string): string {
  if (!valor) return '';
  return String(valor).
  replace(/&/g, '&amp;').
  replace(/</g, '&lt;').
  replace(/>/g, '&gt;').
  replace(/"/g, '&quot;');
}

const MESES = [
'janeiro',
'fevereiro',
'março',
'abril',
'maio',
'junho',
'julho',
'agosto',
'setembro',
'outubro',
'novembro',
'dezembro'];


/** "Osasco, 13 de agosto de 2026" — local e data de emissão do documento */
function localEData(cidade: string | undefined, valor?: string): string {
  const base = String(valor || '').slice(0, 10);
  const hoje = new Date();
  let dia = hoje.getDate();
  let mes = hoje.getMonth();
  let ano = hoje.getFullYear();
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    const [a, m, d] = base.split('-');
    ano = Number(a);
    mes = Number(m) - 1;
    dia = Number(d);
  }
  const dataTexto = `${dia} de ${MESES[mes] || ''} de ${ano}`;
  const local = String(cidade || '').trim();
  return local ? `${local}, ${dataTexto}` : dataTexto;
}

/** Idade em anos completos — derivada da data de nascimento, nunca inventada */
function calcularIdade(dataNascimento?: string): string {
  const base = String(dataNascimento || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return '';
  const nascimento = new Date(`${base}T12:00:00`);
  if (Number.isNaN(nascimento.getTime())) return '';
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || mes === 0 && hoje.getDate() < nascimento.getDate()) idade--;
  if (idade < 0 || idade > 130) return '';
  return `${idade} ANOS`;
}

function linhaMedicamento(med: MedicamentoReceituario): string {
  const nome = [med.nome, med.dosagem].
  filter((p) => String(p || '').trim()).
  map((p) => esc(String(p).trim())).
  join(' ');
  const quantidade = [med.quantidade, med.unidade].
  filter((p) => String(p || '').trim()).
  map((p) => esc(String(p).trim())).
  join(' ');
  const posologia = med.posologia?.trim() ?
  `<div class="med-pos">${esc(med.posologia).replace(/\n/g, '<br/>')}</div>` :
  '';
  return `
      <div class="med">
        <div class="med-linha">
          <span class="med-nome">${nome}</span>
          <span class="med-pontos"></span>
          <span class="med-qtd">${quantidade}</span>
        </div>
        ${posologia}
      </div>`;
}

/** Monta o HTML do receituário no papel timbrado do profissional */
export function gerarHtmlReceituarioConvencional(
dados: DadosReceituario)
: string {
  const especial = !!dados.controleEspecial;
  const titulo = especial ?
  'RECEITUÁRIO DE CONTROLE ESPECIAL' :
  'RECEITUÁRIO';
  // Controle especial em papel timbrado também exige 2 vias.
  const vias = especial ?
  [
  '1ª VIA — RETENÇÃO DA FARMÁCIA OU DROGARIA',
  '2ª VIA — ORIENTAÇÃO AO PACIENTE'] :

  ['VIA DO PACIENTE'];

  const tituloPrescritor = dados.prescritor.titulo ?
  `${dados.prescritor.titulo} ` :
  '';
  const nomePrescritor = esc(tituloPrescritor + (dados.prescritor.nome || ''));
  const conselho = esc(dados.prescritor.conselho || 'CRM');
  const registro = esc(dados.prescritor.registro || '');

  const pacienteLinha = [
  dados.paciente.nome ? esc(dados.paciente.nome).toUpperCase() : '',
  calcularIdade(dados.paciente.dataNascimento),
  dados.paciente.cpf?.trim() ? `CPF: ${esc(dados.paciente.cpf)}` : ''].

  filter(Boolean).
  join(', ');

  const medsHtml = dados.medicamentos.map(linhaMedicamento).join('');

  const rqesHtml = (dados.prescritor.rqes || []).
  filter((r) => r?.especialidade && r?.rqe).
  map(
    (r) =>
    `<div class="assin-linha">${esc(r.especialidade)}- RQE: ${esc(r.rqe)}</div>`
  ).
  join('');

  // Contatos podem vir com separadores vazios do cadastro ("(11) 1234-5678 / /").
  // Sem limpeza, esses restos apareciam impressos no rodapé.
  const limparContato = (valor?: string): string => {
    const limpo = String(valor || '').
    split(/[\/;|]+/).
    map((p) => p.trim()).
    filter((p) => p && /[0-9A-Za-zÀ-ÿ]/.test(p));
    return limpo.join(' / ');
  };
  const telefoneRodape = limparContato(dados.emitente.telefone);
  const linhaContato = [
  telefoneRodape ? `Telefone: ${esc(telefoneRodape)}` : '',
  limparContato(dados.emitente.email) ?
  `Email: ${esc(limparContato(dados.emitente.email))}` :
  '',
  limparContato(dados.emitente.site) ?
  `Site: ${esc(limparContato(dados.emitente.site))}` :
  ''].

  filter(Boolean).
  join(' &nbsp;•&nbsp; ');
  const rodapeContato = [
  dados.emitente.endereco ? esc(dados.emitente.endereco) : '',
  linhaContato].
  filter(Boolean);

  const quadrosControle = especial ?
  `
      <div class="quadros">
        <div class="quadro">
          <div class="quadro-titulo">Identificação do comprador</div>
          <div class="quadro-corpo">
            <div class="preencher">Nome:</div>
            <div class="preencher">Documento de identidade nº:</div>
            <div class="preencher">Órgão emissor / UF:</div>
            <div class="preencher">Endereço:</div>
            <div class="preencher">Cidade / UF:</div>
            <div class="preencher">Telefone:</div>
          </div>
        </div>
        <div class="quadro">
          <div class="quadro-titulo">Identificação do fornecedor</div>
          <div class="quadro-corpo">
            <div class="preencher">Farmácia / Drogaria:</div>
            <div class="preencher">CNPJ:</div>
            <div class="preencher">Cidade / UF:</div>
            <div class="preencher">Assinatura do farmacêutico:</div>
            <div class="preencher">CRF / UF:</div>
            <div class="preencher">Data:</div>
          </div>
        </div>
      </div>` :
  '';

  const paginas = vias.
  map(
    (rotuloVia, indice) => `
  <section class="page">
    <header class="cabecalho">
      <div class="cab-texto">
        <h1>${nomePrescritor}</h1>
        ${
    dados.prescritor.especialidade ?
    `<div class="cab-esp">${esc(
      dados.prescritor.especialidade
    ).toUpperCase()}</div>` :
    ''}
        ${

    dados.prescritor.cabecalho?.trim() ?
    `<div class="cab-titulos">${esc(dados.prescritor.cabecalho).replace(
      /\n/g,
      '<br/>'
    )}</div>` :
    ''}
      </div>
      ${

    dados.emitente.logoUrl ?
    `<img class="cab-logo" src="${esc(dados.emitente.logoUrl)}" alt="" />` :
    ''}
    </header>
    ${
    registro ? `<div class="cab-crm">${conselho} <strong>${registro}</strong></div>` : ''}

    <div class="doc-titulo">
      <span>${esc(titulo)}</span>
      <span class="doc-via">${esc(rotuloVia)}</span>
    </div>

    <div class="corpo">
      <div class="paciente">
        ${pacienteLinha ? `<div>PACIENTE: ${pacienteLinha}</div>` : ''}
        ${
    especial && dados.paciente.endereco?.trim() ?
    `<div>ENDEREÇO: ${esc(dados.paciente.endereco)}</div>` :
    ''}
      </div>

      ${

    dados.descricao?.trim() ?
    // Preserva a formatação feita no editor (alinhamento, cor, listas…)
    `<div class="descricao">${paraHtmlImpressao(dados.descricao)}</div>` :
    ''}

      <div class="meds">${
    medsHtml}</div>

      ${
    dados.observacoes?.trim() ?
    `<div class="observacoes">${paraHtmlImpressao(dados.observacoes)}</div>` :
    ''}
    </div>

    <div class="assinatura">
      <div class="assin-local">${
    esc(
      localEData(
        [dados.emitente.cidade, dados.emitente.uf].filter(Boolean).join(' - '),
        dados.data
      )
    )}</div>
      <div class="assin-rubrica"></div>
      <div class="assin-nome">${esc(dados.prescritor.nome || '').toUpperCase()}</div>
      ${rqesHtml}
      ${registro ? `<div class="assin-linha">${conselho} ${registro}</div>` : ''}
    </div>

    ${quadrosControle}

    <footer class="rodape">
      <div class="rodape-conteudo">
        ${dados.emitente.nome ? `<div class="rodape-nome">${esc(dados.emitente.nome)}</div>` : ''}
        ${
    dados.emitente.descricao ?
    `<div class="rodape-desc">${esc(dados.emitente.descricao)}</div>` :
    ''}
        ${

    rodapeContato.length ?
    `<div class="rodape-info">${rodapeContato.join('<br/>')}</div>` :
    ''}
        ${

    dados.emitente.cnpj ?
    `<div class="rodape-cnpj">CNPJ: ${esc(dados.emitente.cnpj)}</div>` :
    ''}
      </div>
      <div class="rodape-via">${
    esc(rotuloVia)}</div>
    </footer>
  </section>
  ${indice < vias.length - 1 ? '<div class="quebra"></div>' : ''}`
  ).
  join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(titulo)} - ${esc(dados.paciente.nome || '')}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11px; }
  .page { display: flex; flex-direction: column; min-height: 262mm; }
  .cabecalho {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; background: #dbeafe; padding: 8px 12px;
  }
  /* min-width:0 impede o texto de invadir a área do logo, e o logo não encolhe:
     antes os títulos passavam POR BAIXO da imagem no cabeçalho. */
  .cab-texto { flex: 1 1 auto; min-width: 0; text-align: center; overflow-wrap: break-word; }
  .cabecalho h1 {
    font-size: 19px; letter-spacing: 0.01em; text-transform: uppercase;
    overflow-wrap: break-word;
  }
  .cab-esp {
    font-size: 11px; letter-spacing: 0.06em; margin-top: 2px;
    padding-bottom: 4px; border-bottom: 1px solid #1e3a8a;
  }
  .cab-titulos { font-size: 8px; line-height: 1.6; margin-top: 5px; text-transform: uppercase; }
  .cab-logo {
    flex: 0 0 auto; max-height: 74px; max-width: 88px; object-fit: contain;
  }
  .cab-crm { text-align: right; font-size: 11px; margin-top: 3px; }
  .doc-titulo {
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
    font-size: 15px; font-weight: bold; text-transform: uppercase;
    margin: 12px 0 4px; padding-bottom: 4px; border-bottom: 1.5px solid #111827;
  }
  /* Identificação da via também no topo: na 1ª folha o rodapé pode não ser lido */
  .doc-via { font-size: 8.5px; font-weight: bold; white-space: nowrap; }
  /* O corpo cresce e empurra assinatura, quadros e rodapé para baixo, sem deixar
     um vão morto no meio da folha. */
  .corpo { flex: 1 1 auto; }
  .paciente { font-size: 11.5px; line-height: 1.8; text-transform: uppercase; }
  /* A descrição vem do editor de documento: sai exatamente como está na tela,
     por isso NÃO recebe transformações (uppercase) nem cor forçada. */
  .descricao { font-size: 11px; margin-top: 8px; }
  .descricao p { margin: 0 0 6px; }
  .descricao ul, .descricao ol { margin: 0 0 6px 18px; }
  .descricao li { margin-bottom: 2px; }
  .descricao h1 { font-size: 15px; margin: 8px 0 4px; }
  .descricao h2 { font-size: 13px; margin: 8px 0 4px; }
  .descricao h3 { font-size: 12px; margin: 6px 0 3px; }
  .descricao table { border-collapse: collapse; width: 100%; margin: 6px 0; }
  .descricao td, .descricao th { border: 1px solid #9ca3af; padding: 3px 5px; }
  .descricao img { max-width: 100%; }
  .meds { margin-top: 12px; }
  .med { margin-bottom: 12px; page-break-inside: avoid; }
  /* Nomes longos QUEBRAM em vez de estourar a margem da folha. A quantidade
     fica fixa à direita e o nome ocupa o espaço restante. */
  .med-linha {
    display: flex; align-items: baseline; gap: 6px; padding-left: 12px;
    padding-right: 2px;
  }
  .med-nome {
    font-size: 11.5px; text-transform: uppercase; flex: 0 1 auto;
    min-width: 0; max-width: 72%;
    overflow-wrap: break-word; word-break: break-word;
  }
  .med-pontos {
    flex: 1 1 24px; min-width: 12px; border-bottom: 1px dotted #6b7280;
    align-self: flex-end; margin-bottom: 2px;
  }
  .med-qtd {
    font-size: 11.5px; text-transform: uppercase; flex: 0 0 auto;
    max-width: 40%; text-align: right; overflow-wrap: break-word;
  }
  .med-pos {
    font-size: 11px; padding-left: 24px; margin-top: 3px;
    border-bottom: 1px solid #d1d5db; padding-bottom: 3px;
    overflow-wrap: break-word; word-break: break-word;
  }
  .descricao, .observacoes, .paciente { overflow-wrap: break-word; }
  .observacoes { font-size: 11px; margin-top: 10px; }
  .assinatura {
    margin-top: 18px; text-align: right; page-break-inside: avoid;
  }
  /* Local e data de emissão — exigidos em qualquer receita */
  .assin-local { font-size: 11px; margin-bottom: 26px; }
  /* Linha para a assinatura de próprio punho do prescritor */
  .assin-rubrica {
    width: 62mm; margin-left: auto; border-top: 1px solid #111827;
    margin-bottom: 3px;
  }
  .assin-nome { font-size: 10.5px; text-transform: uppercase; font-weight: bold; }
  .assin-linha { font-size: 10px; }
  .quadros { display: flex; gap: 8px; margin-top: 18px; page-break-inside: avoid; }
  .quadro { flex: 1; border: 1px solid #111827; }
  .quadro-titulo {
    background: #dbeafe; border-bottom: 1px solid #111827; text-align: center;
    font-size: 9.5px; font-weight: bold; padding: 3px 4px;
  }
  .quadro-corpo { padding: 7px 8px 4px; }
  /* Linha de preenchimento contínua: os underscores desalinhavam entre os
     quadros e cortavam quando o rótulo era longo. */
  .preencher {
    font-size: 9.5px; border-bottom: 1px solid #111827;
    padding: 7px 0 2px; margin-bottom: 4px;
  }
  .preencher:last-child { margin-bottom: 2px; }
  .rodape { margin-top: auto; padding-top: 14px; }
  .rodape-conteudo { background: #dbeafe; text-align: center; padding: 6px 10px; }
  .rodape-nome { font-size: 12px; font-weight: bold; }
  .rodape-desc { font-size: 8.5px; margin-top: 2px; }
  .rodape-info { font-size: 8.5px; line-height: 1.6; margin-top: 4px; }
  .rodape-cnpj { font-size: 8px; margin-top: 2px; }
  .rodape-via { text-align: right; font-size: 9px; font-weight: bold; margin-top: 4px; }
  .quebra { page-break-after: always; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${paginas}
</body>
</html>`;
}