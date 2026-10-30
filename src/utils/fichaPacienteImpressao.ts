import { API_BASE_URL } from '../config/api';

/**
 * Ficha Cadastral do Paciente — documento A4 para impressão.
 *
 * Reaproveita os dados já carregados na ficha (paciente), a clínica ativa e o
 * usuário logado da sessão, e busca as consultas pelo endpoint já existente.
 * Nada é gravado: o documento é apenas montado e enviado para a visualização
 * de impressão do navegador (o usuário escolhe impressora ou salvar em PDF).
 */

export interface DadosFichaPaciente {
  matricula?: string;
  nome?: string;
  dataCadastro?: string;
  dataNascimento?: string;
  genero?: string;
  rg?: string;
  cpf?: string;
  profissao?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefoneResidencial?: string;
  telefone?: string;
  email?: string;
  nomeMae?: string;
  convenio?: string;
  plano?: string;
  numeroCarteirinha?: string;
}

interface ConsultaFicha {
  data?: string;
  horario?: string;
  profissional?: string;
  profissionalNomeJoin?: string;
  procedimentoNome?: string;
  procedimentoNomeJoin?: string;
  tipo?: string;
  status?: string;
}

const GENEROS: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
  nao_informar: 'Não informado'
};

const STATUS_CONSULTA: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  em_atendimento: 'Em atendimento',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  falta: 'Falta',
  aguardando: 'Aguardando'
};

const TIPOS_CONSULTA: Record<string, string> = {
  medica: 'Médica',
  odontologica: 'Odontológica'
};

function escapar(valor?: string | null): string {
  if (valor === undefined || valor === null) return '';
  return String(valor).
  replace(/&/g, '&amp;').
  replace(/</g, '&lt;').
  replace(/>/g, '&gt;').
  replace(/"/g, '&quot;');
}

/** Data ISO/serializada → DD/MM/AAAA (sem deslocamento de fuso) */
function formatarData(valor?: string | null): string {
  if (!valor) return '';
  const somenteData = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(somenteData)) return String(valor);
  const [ano, mes, dia] = somenteData.split('-');
  return `${dia}/${mes}/${ano}`;
}

function calcularIdade(dataNascimento?: string): string {
  if (!dataNascimento) return '';
  const somenteData = String(dataNascimento).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(somenteData)) return '';
  const nascimento = new Date(`${somenteData}T12:00:00`);
  if (Number.isNaN(nascimento.getTime())) return '';
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || mes === 0 && hoje.getDate() < nascimento.getDate()) {
    idade -= 1;
  }
  return idade >= 0 ? `${idade} anos` : '';
}

function formatarCpf(cpf?: string): string {
  if (!cpf) return '';
  const digitos = String(cpf).replace(/\D/g, '');
  if (digitos.length !== 11) return String(cpf);
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarCep(cep?: string): string {
  if (!cep) return '';
  const digitos = String(cep).replace(/\D/g, '');
  if (digitos.length !== 8) return String(cep);
  return digitos.replace(/(\d{5})(\d{3})/, '$1-$2');
}

/** Lê a clínica ativa e o usuário logado da sessão (padrão do sistema) */
function lerSessao() {
  try {
    const bruto = localStorage.getItem('sessao');
    if (!bruto) return {};
    const sessao = JSON.parse(bruto);
    return {
      clinica: sessao?.clinicaAtual || {},
      operadora: sessao?.operadoraSelecionada || {},
      usuario: sessao?.usuario || {}
    };
  } catch {
    return {};
  }
}

/** Busca as consultas do paciente pelo endpoint já existente */
async function buscarConsultas(
clinicaId?: string,
pacienteId?: string)
: Promise<ConsultaFicha[]> {
  if (!clinicaId || !pacienteId) return [];
  try {
    const resposta = await fetch(
      `${API_BASE_URL}/api/consultas?clinicaId=${encodeURIComponent(
        clinicaId
      )}&pacienteId=${encodeURIComponent(pacienteId)}&limit=100`
    );
    if (!resposta.ok) return [];
    const dados = await resposta.json();
    const lista: ConsultaFicha[] = Array.isArray(dados) ?
    dados :
    dados?.consultas || [];
    return lista.sort((a, b) =>
    String(b.data || '').localeCompare(String(a.data || ''))
    );
  } catch (erro) {
    console.error('❌ [FichaPaciente] Falha ao buscar consultas:', erro);
    return [];
  }
}

function linhaCampo(label: string, valor?: string): string {
  return `
    <div class="campo">
      <span class="campo-label">${escapar(label)}</span>
      <span class="campo-valor">${escapar(valor) || '&mdash;'}</span>
    </div>`;
}

/**
 * Monta e abre a Ficha Cadastral do paciente na visualização de impressão.
 */
export async function imprimirFichaPaciente(
paciente: DadosFichaPaciente,
opcoes: {pacienteId?: string;clinicaId?: string;} = {})
: Promise<void> {
  const { clinica = {}, operadora = {}, usuario = {} } = lerSessao() as any;

  const clinicaId =
  opcoes.clinicaId || clinica.id || undefined;
  const consultas = await buscarConsultas(clinicaId, opcoes.pacienteId);

  const logoUrl = clinica.logoUrl || operadora.logoUrl || '';
  const enderecoClinica = [clinica.endereco, clinica.cidade, clinica.uf].
  filter(Boolean).
  join(' - ');

  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const enderecoPaciente = [
  paciente.logradouro,
  paciente.numero ? `nº ${paciente.numero}` : '',
  paciente.complemento].

  filter(Boolean).
  join(', ');

  const linhasConsultas = consultas.length ?
  consultas.
  map(
    (consulta) => `
          <tr>
            <td>${escapar(formatarData(consulta.data))}</td>
            <td>${escapar(consulta.horario) || '&mdash;'}</td>
            <td>${
    escapar(
      consulta.profissionalNomeJoin || consulta.profissional
    ) || '&mdash;'}</td>
            <td>${

    escapar(
      consulta.procedimentoNomeJoin || consulta.procedimentoNome
    ) || '&mdash;'}</td>
            <td>${
    escapar(
      TIPOS_CONSULTA[String(consulta.tipo)] || consulta.tipo || ''
    ) || '&mdash;'}</td>
            <td>${escapar(
      STATUS_CONSULTA[String(consulta.status)] || consulta.status || ''
    ) || '&mdash;'}</td>
          </tr>`
  ).
  join('') :
  `<tr><td colspan="6" class="vazio">Nenhuma consulta registrada para este paciente.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Ficha Cadastral - ${escapar(paciente.nome) || 'Paciente'}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1f2937;
      font-size: 11px;
      margin: 0;
    }
    .cabecalho {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 8px;
    }
    .cabecalho-identidade { display: flex; gap: 10px; align-items: center; }
    .cabecalho-logo {
      width: 58px; height: 58px; object-fit: contain;
      border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px;
    }
    .clinica-nome { font-size: 15px; font-weight: bold; color: #0f766e; }
    .clinica-dados { font-size: 10px; color: #4b5563; line-height: 1.45; }
    .cabecalho-meta { text-align: right; font-size: 10px; color: #4b5563; line-height: 1.5; }
    .cabecalho-meta strong { color: #1f2937; }
    h2 {
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
      color: #0f766e; margin: 14px 0 6px; padding-bottom: 3px;
      border-bottom: 1px solid #d1d5db;
    }
    .grade {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px 14px;
    }
    .campo {
      display: flex; flex-direction: column;
      border-bottom: 1px dotted #d1d5db; padding: 3px 0;
    }
    .campo-label {
      font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em;
      color: #6b7280; font-weight: bold;
    }
    .campo-valor { font-size: 11px; color: #111827; }
    .campo-largo { grid-column: span 2; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th {
      background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 6px;
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em;
      text-align: left; color: #334155;
    }
    td { border: 1px solid #e2e8f0; padding: 4px 6px; font-size: 10px; }
    .vazio { text-align: center; color: #6b7280; font-style: italic; }
    .rodape {
      margin-top: 18px; border-top: 1px solid #d1d5db; padding-top: 6px;
      font-size: 9px; color: #6b7280; display: flex; justify-content: space-between;
    }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header class="cabecalho">
    <div class="cabecalho-identidade">
      ${
  logoUrl ?
  `<img class="cabecalho-logo" src="${escapar(logoUrl)}" alt="" />` :
  ''}
      <div>
        <div class="clinica-nome">${

  escapar(clinica.nome) || 'Clínica'}</div>
        <div class="clinica-dados">
          ${
  enderecoClinica ? `${escapar(enderecoClinica)}<br/>` : ''}
          ${clinica.cep ? `CEP: ${escapar(formatarCep(clinica.cep))}` : ''}
          ${clinica.cep && clinica.telefone ? ' &nbsp;|&nbsp; ' : ''}
          ${clinica.telefone ? `Tel: ${escapar(clinica.telefone)}` : ''}
        </div>
      </div>
    </div>
    <div class="cabecalho-meta">
      <div><strong>Emitido em</strong><br/>${escapar(geradoEm)}</div>
      <div style="margin-top:4px"><strong>Usuário</strong><br/>${
  escapar(usuario.nome) || '&mdash;'}</div>
    </div>
  </header>

  <h2>Ficha Cadastral do Paciente</h2>
  <section class="grade">
    ${
  linhaCampo('Data de cadastro', formatarData(paciente.dataCadastro))}
    ${linhaCampo('Código / Matrícula', paciente.matricula)}
    ${linhaCampo('Sexo', GENEROS[String(paciente.genero)] || paciente.genero)}
    <div class="campo campo-largo">
      <span class="campo-label">Nome</span>
      <span class="campo-valor">${escapar(paciente.nome) || '&mdash;'}</span>
    </div>
    ${linhaCampo('Data de nascimento', formatarData(paciente.dataNascimento))}
    ${linhaCampo('Idade', calcularIdade(paciente.dataNascimento))}
    ${linhaCampo('RG', paciente.rg)}
    ${linhaCampo('CPF', formatarCpf(paciente.cpf))}
    ${linhaCampo('Profissão', paciente.profissao)}
    <div class="campo campo-largo">
      <span class="campo-label">Endereço</span>
      <span class="campo-valor">${
  escapar(enderecoPaciente) || '&mdash;'}</span>
    </div>
    ${
  linhaCampo('Bairro', paciente.bairro)}
    ${linhaCampo('Cidade', paciente.cidade)}
    ${linhaCampo('UF', paciente.uf)}
    ${linhaCampo('CEP', formatarCep(paciente.cep))}
    ${linhaCampo('Telefone', paciente.telefoneResidencial)}
    ${linhaCampo('Celular', paciente.telefone)}
    ${linhaCampo('Nome da mãe', paciente.nomeMae)}
    ${linhaCampo('Convênio', paciente.convenio)}
    ${linhaCampo('Plano', paciente.plano)}
    ${linhaCampo('Carteirinha', paciente.numeroCarteirinha)}
    <div class="campo campo-largo">
      <span class="campo-label">E-mail</span>
      <span class="campo-valor">${escapar(paciente.email) || '&mdash;'}</span>
    </div>
  </section>

  <h2>Consultas</h2>
  <table>
    <thead>
      <tr>
        <th style="width:12%">Data</th>
        <th style="width:9%">Hora</th>
        <th style="width:26%">Médico</th>
        <th style="width:25%">Ação</th>
        <th style="width:14%">Tipo</th>
        <th style="width:14%">Status</th>
      </tr>
    </thead>
    <tbody>${linhasConsultas}</tbody>
  </table>

  <footer class="rodape">
    <span>${escapar(clinica.nome) || ''}</span>
    <span>Ficha cadastral emitida em ${escapar(geradoEm)}</span>
  </footer>
</body>
</html>`;

  const janela = window.open('', '_blank');
  if (!janela) {
    throw new Error(
      'Não foi possível abrir a visualização. Libere as janelas pop-up para este site.'
    );
  }
  janela.document.write(html);
  janela.document.close();
  setTimeout(() => {
    try {
      janela.focus();
      janela.print();
    } catch {

      /* o usuário pode imprimir manualmente pela janela aberta */}
  }, 500);
}