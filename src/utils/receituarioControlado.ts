/**
 * Receituários sujeitos a controle especial — modelos oficiais vigentes.
 *
 * BASE NORMATIVA (consultada em fontes oficiais da Anvisa):
 * - RDC Anvisa nº 1.000/2025, que alterou a Portaria SVS/MS nº 344/1998 e a
 *   Portaria SVS/MS nº 6/1999 e REVOGOU os modelos que constavam dos anexos da
 *   Portaria 344/1998.
 * - Modelos oficiais publicados pela Anvisa na página do SNCR
 *   ("Modelos de receituários"), obrigatórios para todos os receituários
 *   IMPRESSOS emitidos a partir de 18/05/2026.
 * - Perguntas e Respostas RDC 1.000/2025 (1ª ed.), item 8: para a Receita de
 *   Controle Especial é admitido layout alternativo, DESDE QUE mantidos todos
 *   os campos previstos na norma e claramente indicada a identificação
 *   "Receita de Controle Especial". É nesse permissivo que este layout se apoia.
 *
 * MUDANÇAS RELEVANTES DA RDC 1.000/2025 REFLETIDAS AQUI:
 * - Identificação do usuário passou a exigir NOME + CPF (ou passaporte, para
 *   estrangeiro). O ENDEREÇO DO PACIENTE FOI RETIRADO do modelo.
 * - Identificação do emitente institucional passou a exigir CNPJ ou CNES
 *   (estabelecimentos públicos), endereço completo e telefone.
 * - Identificação do comprador: nome, CPF/passaporte, endereço completo e
 *   telefone (campo de preenchimento da farmácia/drogaria).
 * - Identificação do estabelecimento dispensador: nome, CNPJ/CNES, data,
 *   assinatura e nome legível do dispensador (admitido carimbo).
 *
 * Este arquivo NÃO declara conformidade legal: ele materializa os campos
 * exigidos pela norma vigente na data de implementação. A estrutura
 * `MODELOS_RECEITUARIO` existe para permitir atualizar/versionar os modelos
 * quando a legislação mudar, sem reescrever a impressão.
 */

import { paraHtmlImpressao } from './htmlTexto';

export type TipoReceituario =
'convencional' |
'controle_especial' |
'notificacao_a' |
'notificacao_b' |
'notificacao_b2' |
'notificacao_retinoides';

export interface ModeloReceituario {
  id: TipoReceituario;
  /** Título impresso no documento — a norma exige identificação clara */
  titulo: string;
  /** Rótulo curto para a interface */
  rotulo: string;
  descricao: string;
  /** Nº de vias impressas exigidas para o receituário em papel */
  vias: string[];
  /** Notificações de Receita exigem numeração concedida pela Vig. Sanitária */
  exigeNumeracao: boolean;
  /** Cor do papel definida pela norma (informativa na interface) */
  observacao: string;
  /**
   * `oficial` → layout em quadros dos modelos vigentes da Anvisa.
   * `convencional` → papel timbrado do profissional (cabeçalho com nome,
   * especialidade, títulos e CRM; rodapé com os dados da clínica).
   */
  layout: 'oficial' | 'convencional';
  /**
   * `norma` exige todos os campos do modelo oficial (CPF do paciente, CNPJ,
   * endereço e telefone da clínica...). `basica` exige apenas o essencial de
   * uma receita: paciente, prescritor com registro, data e medicamentos.
   */
  validacao: 'norma' | 'basica';
}

export const MODELOS_RECEITUARIO: Record<TipoReceituario, ModeloReceituario> = {
  convencional: {
    id: 'convencional',
    titulo: 'RECEITUARIO',
    rotulo: 'Convencional (papel timbrado)',
    descricao:
    'Receituário simples no papel timbrado do profissional, com o cabeçalho e o rodapé da clínica.',
    vias: ['Via Paciente'],
    exigeNumeracao: false,
    observacao:
    'Quando a prescrição estiver marcada como Controle Especial, o documento é emitido como "Receituario de Controle Especial", em 2 vias e com os quadros de comprador e fornecedor.',
    layout: 'convencional',
    validacao: 'basica'
  },
  controle_especial: {
    id: 'controle_especial',
    titulo: 'RECEITA DE CONTROLE ESPECIAL',
    rotulo: 'Receita de Controle Especial',
    descricao:
    'Medicamentos das listas C1, C5 e demais sujeitos a receita de controle especial.',
    vias: [
    '1ª VIA — RETENÇÃO DA FARMÁCIA OU DROGARIA',
    '2ª VIA — ORIENTAÇÃO AO PACIENTE'],

    exigeNumeracao: false,
    observacao: 'Emitida em 2 (duas) vias, conforme a Portaria SVS/MS 344/1998.',
    layout: 'oficial',
    validacao: 'norma'
  },
  notificacao_a: {
    id: 'notificacao_a',
    titulo: 'NOTIFICAÇÃO DE RECEITA A',
    rotulo: 'Notificação de Receita A',
    descricao: 'Listas A1, A2 e A3 (entorpecentes e psicotrópicos).',
    vias: ['NOTIFICAÇÃO DE RECEITA A'],
    exigeNumeracao: true,
    observacao:
    'Exige talonário numerado, impresso em gráfica, com numeração concedida pela autoridade sanitária local.',
    layout: 'oficial',
    validacao: 'norma'
  },
  notificacao_b: {
    id: 'notificacao_b',
    titulo: 'NOTIFICAÇÃO DE RECEITA B',
    rotulo: 'Notificação de Receita B',
    descricao: 'Listas B1 e B2 (psicotrópicos).',
    vias: ['NOTIFICAÇÃO DE RECEITA B'],
    exigeNumeracao: true,
    observacao:
    'Exige talonário numerado, impresso em gráfica, com numeração concedida pela autoridade sanitária local.',
    layout: 'oficial',
    validacao: 'norma'
  },
  notificacao_b2: {
    id: 'notificacao_b2',
    titulo: 'NOTIFICAÇÃO DE RECEITA B2',
    rotulo: 'Notificação de Receita B2',
    descricao: 'Substâncias anorexígenas.',
    vias: ['NOTIFICAÇÃO DE RECEITA B2'],
    exigeNumeracao: true,
    observacao:
    'Exige talonário numerado e o termo de responsabilidade previsto na norma.',
    layout: 'oficial',
    validacao: 'norma'
  },
  notificacao_retinoides: {
    id: 'notificacao_retinoides',
    titulo: 'NOTIFICAÇÃO DE RECEITA ESPECIAL — RETINOIDES DE USO SISTÊMICO',
    rotulo: 'Notificação de Receita — Retinoides',
    descricao: 'Retinoides de uso sistêmico.',
    vias: ['NOTIFICAÇÃO DE RECEITA ESPECIAL — RETINOIDES'],
    exigeNumeracao: true,
    observacao:
    'Exige talonário numerado e o termo de consentimento previsto na norma.',
    layout: 'oficial',
    validacao: 'norma'
  }
};

export interface MedicamentoReceituario {
  nome: string;
  dosagem?: string;
  quantidade?: string;
  unidade?: string;
  posologia?: string;
  tipo?: 'medicamento' | 'formula';
}

export interface DadosReceituario {
  modelo: TipoReceituario;
  /** Numeração do talonário, quando o modelo exigir */
  numeracao?: string;
  data: string;
  descricao?: string;
  observacoes?: string;
  medicamentos: MedicamentoReceituario[];
  paciente: {
    nome?: string;
    cpf?: string;
    passaporte?: string;
    dataNascimento?: string;
    /** Usado apenas no layout convencional */
    endereco?: string;
  };
  prescritor: {
    nome?: string;
    conselho?: string;
    registro?: string;
    especialidade?: string;
    titulo?: string;
    /** Cabeçalho personalizado (layout convencional) */
    cabecalho?: string;
    /** Registros de qualificação de especialista (layout convencional) */
    rqes?: {especialidade: string;rqe: string;}[];
  };
  emitente: {
    nome?: string;
    cnpj?: string;
    cnes?: string;
    endereco?: string;
    telefone?: string;
    logoUrl?: string;
    /** Cidade e UF do emitente — usados no local/data de emissão */
    cidade?: string;
    uf?: string;
    /** Rodapé do layout convencional */
    descricao?: string;
    email?: string;
    site?: string;
  };
  /**
   * Marca a prescrição como de controle especial. No layout convencional é o
   * que define o título e a inclusão dos quadros de comprador e fornecedor.
   */
  controleEspecial?: boolean;
}

/* ============================ VALIDAÇÃO ============================ */

export interface CampoPendente {
  campo: string;
  onde: string;
}

/**
 * Valida os campos obrigatórios do modelo antes de permitir a impressão.
 * Nada é preenchido automaticamente: campo ausente é reportado ao usuário.
 */
export function validarReceituario(dados: DadosReceituario): CampoPendente[] {
  const pendencias: CampoPendente[] = [];
  const modelo = MODELOS_RECEITUARIO[dados.modelo];

  if (!dados.paciente.nome?.trim()) {
    pendencias.push({
      campo: 'Nome completo do paciente',
      onde: 'Cadastro do paciente'
    });
  }
  if (
  modelo.validacao === 'norma' &&
  !dados.paciente.cpf?.trim() &&
  !dados.paciente.passaporte?.trim())
  {
    pendencias.push({
      campo: 'CPF do paciente (ou passaporte, no caso de estrangeiro)',
      onde: 'Cadastro do paciente'
    });
  }
  if (!dados.prescritor.nome?.trim()) {
    pendencias.push({
      campo: 'Nome do profissional prescritor',
      onde: 'Cadastro do profissional'
    });
  }
  if (!dados.prescritor.registro?.trim()) {
    pendencias.push({
      campo: 'Inscrição no Conselho Regional com a sigla da UF',
      onde: 'Cadastro do profissional'
    });
  }
  // Os dados institucionais abaixo são exigidos pelos modelos OFICIAIS. No
  // layout convencional (papel timbrado) a receita é válida com o cabeçalho do
  // profissional, por isso não bloqueiam a impressão.
  if (modelo.validacao === 'norma') {
    if (!dados.emitente.nome?.trim()) {
      pendencias.push({ campo: 'Nome da clínica', onde: 'Cadastro da clínica' });
    }
    if (!dados.emitente.cnpj?.trim() && !dados.emitente.cnes?.trim()) {
      pendencias.push({
        campo: 'CNPJ da clínica (ou CNES, em estabelecimento público)',
        onde: 'Cadastro da clínica'
      });
    }
    if (!dados.emitente.endereco?.trim()) {
      pendencias.push({
        campo: 'Endereço completo da clínica',
        onde: 'Cadastro da clínica'
      });
    }
    if (!dados.emitente.telefone?.trim()) {
      pendencias.push({
        campo: 'Telefone da clínica',
        onde: 'Cadastro da clínica'
      });
    }
  }
  // No convencional marcado como Controle Especial, a norma exige CPF e
  // endereço do paciente para retenção da receita na farmácia.
  if (modelo.validacao === 'basica' && dados.controleEspecial) {
    if (!dados.paciente.cpf?.trim() && !dados.paciente.passaporte?.trim()) {
      pendencias.push({
        campo: 'CPF do paciente (obrigatório em controle especial)',
        onde: 'Cadastro do paciente'
      });
    }
    if (!dados.paciente.endereco?.trim()) {
      pendencias.push({
        campo: 'Endereço do paciente (obrigatório em controle especial)',
        onde: 'Cadastro do paciente'
      });
    }
  }
  if (!dados.data?.trim()) {
    pendencias.push({ campo: 'Data de emissão', onde: 'Tela de prescrição' });
  }
  if (!dados.medicamentos.length) {
    pendencias.push({
      campo: 'Pelo menos um medicamento prescrito',
      onde: 'Tela de prescrição'
    });
  }
  dados.medicamentos.forEach((med, i) => {
    const ordem = `Medicamento ${i + 1}`;
    if (!med.nome?.trim()) {
      pendencias.push({ campo: `${ordem}: nome`, onde: 'Tela de prescrição' });
    }
    if (med.tipo !== 'formula' && !String(med.quantidade || '').trim()) {
      pendencias.push({
        campo: `${ordem}: quantidade`,
        onde: 'Tela de prescrição'
      });
    }
    if (!med.posologia?.trim()) {
      pendencias.push({
        campo: `${ordem}: posologia`,
        onde: 'Tela de prescrição'
      });
    }
  });
  if (modelo.exigeNumeracao && !dados.numeracao?.trim()) {
    pendencias.push({
      campo: `Numeração do talonário da ${modelo.rotulo}`,
      onde: 'Informe a numeração fornecida pela Vigilância Sanitária'
    });
  }
  return pendencias;
}

/* ======================= QUANTIDADE POR EXTENSO ======================= */

const UNIDADES = [
'',
'um',
'dois',
'três',
'quatro',
'cinco',
'seis',
'sete',
'oito',
'nove'];

const DEZ_A_DEZENOVE = [
'dez',
'onze',
'doze',
'treze',
'quatorze',
'quinze',
'dezesseis',
'dezessete',
'dezoito',
'dezenove'];

const DEZENAS = [
'',
'',
'vinte',
'trinta',
'quarenta',
'cinquenta',
'sessenta',
'setenta',
'oitenta',
'noventa'];

const CENTENAS = [
'',
'cento',
'duzentos',
'trezentos',
'quatrocentos',
'quinhentos',
'seiscentos',
'setecentos',
'oitocentos',
'novecentos'];


function abaixoDeMil(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto <= 19) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d > 0) partes.push(DEZENAS[d]);
    if (u > 0) partes.push(UNIDADES[u]);
  }
  return partes.join(' e ');
}

/**
 * Quantidade por extenso — exigida pela norma na Receita de Controle Especial.
 * Deriva do valor digitado; não inventa quantidade.
 */
export function quantidadePorExtenso(valor?: string): string {
  if (!valor) return '';
  const bruto = String(valor).replace(',', '.');
  const achado = bruto.match(/\d+(\.\d+)?/);
  if (!achado) return '';
  const numero = Number(achado[0]);
  if (!Number.isFinite(numero) || numero <= 0) return '';
  if (!Number.isInteger(numero)) return '';
  if (numero >= 1000000) return '';
  if (numero === 1000) return 'mil';
  if (numero > 1000) {
    const milhares = Math.floor(numero / 1000);
    const resto = numero % 1000;
    const prefixo =
    milhares === 1 ? 'mil' : `${abaixoDeMil(milhares)} mil`;
    if (resto === 0) return prefixo;
    return `${prefixo} e ${abaixoDeMil(resto)}`;
  }
  return abaixoDeMil(numero);
}

/* ============================ IMPRESSÃO ============================ */

function esc(valor?: string): string {
  if (!valor) return '';
  return String(valor).
  replace(/&/g, '&amp;').
  replace(/</g, '&lt;').
  replace(/>/g, '&gt;').
  replace(/"/g, '&quot;');
}

function formatarData(valor?: string): string {
  const somenteData = String(valor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(somenteData)) {
    return new Date().toLocaleDateString('pt-BR');
  }
  const [ano, mes, dia] = somenteData.split('-');
  return `${dia}/${mes}/${ano}`;
}

function blocoMedicamentos(meds: MedicamentoReceituario[]): string {
  return meds.
  map((med, i) => {
    const partes: string[] = [];
    // Nome + concentração/dosagem + forma farmacêutica (campo `unidade`)
    const identificacao = [med.nome, med.dosagem, med.unidade].
    filter((p) => String(p || '').trim()).
    map((p) => esc(String(p).trim())).
    join(' — ');
    partes.push(
      `<div class="med-linha"><span class="med-num">${i + 1}.</span>` +
      `<span class="med-nome">${identificacao}</span></div>`
    );
    if (med.tipo !== 'formula') {
      const extenso = quantidadePorExtenso(med.quantidade);
      const quantidade = String(med.quantidade || '').trim();
      if (quantidade) {
        partes.push(
          `<div class="med-qtd"><strong>Quantidade:</strong> ${esc(
            quantidade
          )}${extenso ? ` (${esc(extenso)})` : ''}</div>`
        );
      }
    }
    if (med.posologia?.trim()) {
      partes.push(
        `<div class="med-pos">${esc(med.posologia).replace(
          /\n/g,
          '<br/>'
        )}</div>`
      );
    }
    return `<div class="med-item">${partes.join('')}</div>`;
  }).
  join('');
}

/**
 * Monta o HTML do receituário controlado, com uma página A4 por via.
 * O conteúdo flui livremente: com muitos medicamentos a via pagina, e o bloco
 * de assinatura acompanha o conteúdo (nunca é sobreposto nem cortado).
 */
export function gerarHtmlReceituarioControlado(
dados: DadosReceituario)
: string {
  const modelo = MODELOS_RECEITUARIO[dados.modelo];
  const dataFormatada = formatarData(dados.data);
  const medsHtml = blocoMedicamentos(dados.medicamentos);
  const tituloPrescritor = dados.prescritor.titulo ?
  `${dados.prescritor.titulo} ` :
  '';
  const documentoPaciente = dados.paciente.cpf?.trim() ?
  `CPF: ${dados.paciente.cpf}` :
  dados.paciente.passaporte?.trim() ?
  `Passaporte: ${dados.paciente.passaporte}` :
  '';

  const vias = modelo.vias.
  map(
    (rotuloVia, indice) => `
  <section class="via">
    <div class="via-rotulo">${esc(rotuloVia)}</div>

    <div class="titulo-doc">${esc(modelo.titulo)}</div>
    ${
    dados.numeracao?.trim() ?
    `<div class="numeracao">Nº ${esc(dados.numeracao)}</div>` :
    ''}

    <div class="quadro">
      <div class="quadro-titulo">Identificação do emitente</div>
      <div class="quadro-corpo">
        <div class="linha-emitente">
          ${

    dados.emitente.logoUrl ?
    `<img class="logo" src="${esc(dados.emitente.logoUrl)}" alt="" />` :
    ''}
          <div>
            <div class="prescritor">${
    esc(
      tituloPrescritor + (dados.prescritor.nome || '')
    )}</div>
            <div class="prescritor-registro">${esc(
      dados.prescritor.conselho || 'CRM'
    )} ${esc(dados.prescritor.registro || '')}</div>
            ${
    dados.prescritor.especialidade ?
    `<div class="prescritor-esp">${esc(
      dados.prescritor.especialidade
    )}</div>` :
    ''}
            <div class="emitente-dados">
              <strong>${
    esc(dados.emitente.nome || '')}</strong><br/>
              ${esc(dados.emitente.endereco || '')}<br/>
              ${
    dados.emitente.cnpj ?
    `CNPJ: ${esc(dados.emitente.cnpj)}` :
    dados.emitente.cnes ?
    `CNES: ${esc(dados.emitente.cnes)}` :
    ''}
              ${
    dados.emitente.telefone ? ` &nbsp;|&nbsp; Tel: ${esc(dados.emitente.telefone)}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="quadro">
      <div class="quadro-titulo">Identificação do usuário (paciente)</div>
      <div class="quadro-corpo">
        <div class="campo-inline"><span>Nome:</span> ${esc(
      dados.paciente.nome || ''
    )}</div>
        <div class="campo-inline"><span>${
    documentoPaciente ? '' : 'CPF:'}</span> ${
    esc(documentoPaciente)}</div>
      </div>
    </div>

    <div class="quadro quadro-prescricao">
      <div class="quadro-titulo">Prescrição</div>
      <div class="quadro-corpo">
        ${
    dados.descricao?.trim() ?
    // Preserva a formatação feita no editor (alinhamento, cor, listas…)
    `<div class="descricao">${paraHtmlImpressao(dados.descricao)}</div>` :
    ''}
        ${
    medsHtml}
        ${
    dados.observacoes?.trim() ?
    `<div class="observacoes"><strong>Observações:</strong><br/>${paraHtmlImpressao(
      dados.observacoes
    )}</div>` :
    ''}
      </div>
    </div>

    <div class="assinatura-bloco">
      <div class="data-emissao">Data de emissão: ${
    esc(dataFormatada)}</div>
      <div class="linha-assinatura"></div>
      <div class="assinatura-nome">${esc(
      tituloPrescritor + (dados.prescritor.nome || '')
    )}</div>
      <div class="assinatura-registro">${esc(
      dados.prescritor.conselho || 'CRM'
    )} ${esc(dados.prescritor.registro || '')}</div>
      <div class="assinatura-legenda">Assinatura do prescritor</div>
    </div>

    <div class="quadro quadro-farmacia">
      <div class="quadro-titulo">
        Identificação do comprador &nbsp;<span>(preenchimento da farmácia ou drogaria)</span>
      </div>
      <div class="quadro-corpo">
        <div class="preencher">Nome: ______________________________________________</div>
        <div class="preencher">CPF / Passaporte: ______________________  Tel: ______________</div>
        <div class="preencher">Endereço completo: ___________________________________</div>
        <div class="preencher">____________________________________________________</div>
      </div>
    </div>

    <div class="quadro quadro-farmacia">
      <div class="quadro-titulo">
        Identificação do estabelecimento dispensador &nbsp;<span>(carimbo)</span>
      </div>
      <div class="quadro-corpo">
        <div class="preencher">Nome / Razão social: _________________________________</div>
        <div class="preencher">CNPJ / CNES: ______________________  Data: ____/____/______</div>
        <div class="preencher">Nome legível do dispensador: __________________________</div>
        <div class="preencher">Assinatura: __________________________________________</div>
      </div>
    </div>

    <div class="rodape-via">
      ${esc(modelo.observacao)}
    </div>
  </section>
  ${indice < modelo.vias.length - 1 ? '<div class="quebra"></div>' : ''}`
  ).
  join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(modelo.titulo)} - ${esc(dados.paciente.nome || '')}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10.5px; }
  .via { padding-bottom: 4mm; }
  .via-rotulo {
    border: 1.5px solid #111827; text-align: center; font-weight: bold;
    font-size: 10px; letter-spacing: 0.06em; padding: 4px 6px; margin-bottom: 6px;
    text-transform: uppercase;
  }
  .titulo-doc {
    text-align: center; font-size: 14px; font-weight: bold; letter-spacing: 0.04em;
    text-transform: uppercase; margin-bottom: 2px;
  }
  .numeracao { text-align: right; font-size: 11px; font-weight: bold; margin-bottom: 4px; }
  .quadro { border: 1px solid #111827; margin-top: 6px; }
  .quadro-titulo {
    background: #f3f4f6; border-bottom: 1px solid #111827; padding: 3px 6px;
    font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .quadro-titulo span { font-weight: normal; text-transform: none; letter-spacing: 0; color: #4b5563; }
  .quadro-corpo { padding: 6px; }
  .linha-emitente { display: flex; gap: 10px; align-items: flex-start; }
  .logo { max-height: 54px; max-width: 90px; object-fit: contain; }
  .prescritor { font-size: 12px; font-weight: bold; text-transform: uppercase; }
  .prescritor-registro { font-size: 10.5px; font-weight: bold; }
  .prescritor-esp { font-size: 10px; color: #374151; }
  .emitente-dados { font-size: 9.5px; color: #374151; line-height: 1.5; margin-top: 3px; }
  .campo-inline { font-size: 11px; line-height: 1.7; }
  .campo-inline span { font-weight: bold; }
  .quadro-prescricao .quadro-corpo { min-height: 55mm; }
  /* Vem do editor de documento: preserva alinhamento, cor e listas da tela */
  .descricao { font-size: 10.5px; margin-bottom: 8px; }
  .descricao p { margin: 0 0 5px; }
  .descricao ul, .descricao ol { margin: 0 0 5px 18px; }
  .descricao h1 { font-size: 14px; margin: 6px 0 3px; }
  .descricao h2 { font-size: 12.5px; margin: 6px 0 3px; }
  .descricao h3 { font-size: 11.5px; margin: 5px 0 3px; }
  .descricao table { border-collapse: collapse; width: 100%; margin: 5px 0; }
  .descricao td, .descricao th { border: 1px solid #9ca3af; padding: 3px 5px; }
  /* Nomes longos quebram em vez de estourar a margem */
  .med-item { margin-bottom: 9px; page-break-inside: avoid; overflow-wrap: break-word; }
  .med-linha { font-size: 11.5px; font-weight: bold; overflow-wrap: break-word; word-break: break-word; }
  .med-num { margin-right: 4px; }
  .med-qtd { font-size: 10.5px; margin-left: 14px; }
  .med-pos { font-size: 10.5px; margin-left: 14px; color: #1f2937; }
  .observacoes { font-size: 10px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #9ca3af; }
  .assinatura-bloco {
    margin-top: 10px; text-align: center; page-break-inside: avoid;
  }
  .data-emissao { font-size: 10.5px; text-align: right; margin-bottom: 12px; }
  .linha-assinatura {
    width: 62mm; margin: 0 auto; border-top: 1px solid #111827;
  }
  .assinatura-nome { font-size: 10.5px; font-weight: bold; text-transform: uppercase; margin-top: 2px; }
  .assinatura-registro { font-size: 10px; font-weight: bold; }
  .assinatura-legenda { font-size: 8.5px; color: #6b7280; }
  .quadro-farmacia .quadro-corpo { padding: 8px 6px; }
  .preencher { font-size: 10px; line-height: 2.1; color: #374151; }
  .rodape-via { font-size: 8.5px; color: #6b7280; margin-top: 5px; text-align: center; }
  .quebra { page-break-after: always; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${vias}
</body>
</html>`;
}