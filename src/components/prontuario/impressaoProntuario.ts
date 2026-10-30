// ==================== IMPRESSÃO DO PRONTUÁRIO ====================
// Extraído de pages/ProntuarioAtendimentoPage.tsx (antes ~390 linhas dentro
// do componente). Recebe os dados já carregados na tela e monta o documento.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { paraHtmlImpressao } from '../../utils/htmlTexto';
import { registrarAuditoria } from '../../utils/auditLog';
import { cssDocumentoPaginado, cssQuebrasPagina, faixaIdentificacao } from '../../utils/documentoImpressao';

export interface ContextoImpressaoProntuario {
  paciente: any;
  consulta: any;
  pacienteId: any;
  anamneseData: any;
  exameFisicoData: any;
  examesData: any;
  diagnosticoData: any;
  evolucaoData: any;
  prescricoesData: any;
  profissionalDaConsulta: any;
  ultimoProfissional: any;
  profissionaisDisponiveis: any;
  clinicaId: any;
  prontuarioId: any;
}

export function imprimirProntuario(ctx: ContextoImpressaoProntuario): void {
  const {
    paciente,
    consulta,
    pacienteId,
    anamneseData,
    exameFisicoData,
    examesData,
    diagnosticoData,
    evolucaoData,
    prescricoesData,
    profissionalDaConsulta,
    ultimoProfissional,
    profissionaisDisponiveis,
    clinicaId,
    prontuarioId,
  } = ctx;
    if (!paciente) return;
  const secoes: {
    titulo: string;
    conteudo: string;
  }[] = [];
  // Profissional info
  const profissionalNome =
  profissionalDaConsulta?.nome ||
  ultimoProfissional?.nome ||
  consulta?.profissional ||
  '';
  const profissionalCrm =
  profissionalDaConsulta?.crm ||
  ultimoProfissional?.crm ||
  (consulta as any)?.profissionalCrm ||
  '';
  const profissionalUf =
  profissionalDaConsulta?.uf ||
  ultimoProfissional?.uf ||
  (consulta as any)?.profissionalUf ||
  '';
  const rawEspecialidade = profissionalDaConsulta?.especialidade || '';
  const profissionalEspecialidade =
  rawEspecialidade &&
  rawEspecialidade !== '[]' &&
  rawEspecialidade !== 'null' ?
  rawEspecialidade :
  '';
  const profissionalTitulo =
  (profissionalDaConsulta as any)?.titulo ||
  (ultimoProfissional as any)?.titulo ||
  consulta?.profissionalTitulo ||
  '';
  const profissionalCabecalho =
  (profissionalDaConsulta as any)?.cabecalhoRelatorio ||
  (ultimoProfissional as any)?.cabecalhoRelatorio ||
  '';
  const profissionalTipo =
  profissionalDaConsulta?.tipo ||
  profissionaisDisponiveis.find((p) => p.id === profissionalDaConsulta?.id)?.
  tipo ||
  consulta?.profissionalTipo ||
  '';
  const prefixoConselho = profissionalTipo === 'dentista' ? 'CRO' : 'CRM';
  let profissionalRqes: any[] = [];
  try {
    const rqesRaw =
    (profissionalDaConsulta as any)?.rqes ||
    (ultimoProfissional as any)?.rqes;
    if (typeof rqesRaw === 'string') profissionalRqes = JSON.parse(rqesRaw);else
    if (Array.isArray(rqesRaw)) profissionalRqes = rqesRaw;
  } catch {

    /* ignore */}
  // Clinica info
  const sessaoStr = localStorage.getItem('sessao');
  let clinicaNome = '',
    clinicaEndereco = '',
    clinicaTelefone = '',
    clinicaEmail = '';
  let operadoraLogoUrl = '',
    clinicaLogoUrl = '';
  if (sessaoStr) {
    try {
      const sessao = JSON.parse(sessaoStr);
      const cl = sessao.clinicaAtual || {};
      clinicaNome = cl.nome || cl.nomeFantasia || '';
      clinicaEndereco = [cl.endereco, cl.numero, cl.bairro, cl.cidade, cl.uf].
      filter(Boolean).
      join(', ');
      clinicaTelefone = cl.telefone || '';
      clinicaEmail = cl.email || '';
      clinicaLogoUrl = cl.logoUrl || '';
      operadoraLogoUrl = sessao.operadoraSelecionada?.logoUrl || '';
    } catch {

      /* ignore */}
  }
  // Idade
  let idade: number | null = null;
  if (paciente.dataNascimento) {
    const nascimento = new Date(paciente.dataNascimento);
    const hoje = new Date();
    idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || m === 0 && hoje.getDate() < nascimento.getDate()) idade--;
  }
  // Seções
  if (anamneseData) {
    const parts: string[] = [];
    if (anamneseData.queixaPrincipal)
    parts.push(
      '<strong>Queixa Principal:</strong> ' + anamneseData.queixaPrincipal
    );
    if (anamneseData.historiaQueixa)
    parts.push('<strong>História:</strong> ' + anamneseData.historiaQueixa);
    if (anamneseData.alergias)
    parts.push('<strong>Alergias:</strong> ' + anamneseData.alergias);
    if (anamneseData.medicamentosEmUso)
    parts.push(
      '<strong>Medicamentos:</strong> ' + anamneseData.medicamentosEmUso
    );
    if (parts.length > 0)
    secoes.push({
      titulo: 'Anamnese',
      conteudo: parts.join('<br/>')
    });
  }
  if (exameFisicoData) {
    const parts: string[] = [];
    if (exameFisicoData.pressaoArterial)
    parts.push('PA: ' + exameFisicoData.pressaoArterial);
    if (exameFisicoData.peso)
    parts.push('Peso: ' + exameFisicoData.peso + 'kg');
    if (exameFisicoData.altura)
    parts.push('Altura: ' + exameFisicoData.altura + 'cm');
    if (exameFisicoData.temperatura)
    parts.push('Temp: ' + exameFisicoData.temperatura + '°C');
    if (exameFisicoData.observacoesGerais)
    parts.push(exameFisicoData.observacoesGerais);
    if (parts.length > 0)
    secoes.push({
      titulo: 'Exame Físico',
      conteudo: parts.join(' | ')
    });
  }
  if (diagnosticoData) {
    let conteudo = '';
    if (diagnosticoData.diagnosticoPrincipal) {
      conteudo +=
      diagnosticoData.diagnosticoPrincipal.codigo +
      ' - ' +
      diagnosticoData.diagnosticoPrincipal.descricao;
    }
    if (diagnosticoData.observacoes)
    conteudo += '<br/>' + diagnosticoData.observacoes;
    if (conteudo)
    secoes.push({
      titulo: 'Diagnóstico',
      conteudo
    });
  }
  if (evolucaoData?.evolucaoAtual) {
    secoes.push({
      titulo: 'Evolução',
      // A evolução vem do editor: preserva a formatação; texto puro (registros
      // antigos) continua com as quebras de linha convertidas.
      conteudo: paraHtmlImpressao(evolucaoData.evolucaoAtual)
    });
  }
  if (examesData?.descricao || examesData?.pedido) {
    const parts: string[] = [];
    if (examesData.descricao) parts.push(examesData.descricao);
    // O pedido pode conter formatação do editor — preserva na impressão.
    if (examesData.pedido) parts.push(paraHtmlImpressao(examesData.pedido));
    secoes.push({
      titulo: 'Exames Solicitados',
      conteudo: parts.join('<br/>')
    });
  }
  if (prescricoesData?.prescricoes) {
    let conteudo = prescricoesData.prescricoes;
    try {
      const parsed = JSON.parse(conteudo);
      if (parsed.generico) conteudo = parsed.generico;
      if (parsed.medicamentos?.length > 0) {
        conteudo = parsed.medicamentos.
        map((m: any) => `${m.nome} — ${m.posologia || ''}`).
        join('<br/>');
        if (parsed.generico) conteudo = parsed.generico + '<br/>' + conteudo;
      }
    } catch {

      /* use raw */}
    conteudo = conteudo.
    replace(/\\r\\n/g, '\n').
    replace(/\\n/g, '\n').
    replace(/\n/g, '<br/>').
    trim();
    if (conteudo)
    secoes.push({
      titulo: 'Prescrições',
      conteudo
    });
  }
  const dataAtual = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const dataHoraAtual = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const logoUrl = operadoraLogoUrl || clinicaLogoUrl || '';
  const logoHtml = logoUrl ?
  '<img src="' +
  logoUrl +
  '" alt="Logo" style="max-height:80px;max-width:120px;object-fit:contain;" />' :
  '';
  const idadeStr = idade !== null ? ', ' + idade + ' anos' : '';
  const profissaoStr = (paciente as any).profissao ?
  ' | ' + (paciente as any).profissao :
  '';
  const convenioStr =
  (paciente as any).convenio || (paciente as any).planoSaudeNome ?
  ' | Convênio: ' + (
  (paciente as any).planoSaudeNome || (paciente as any).convenio) :
  '';
  if (clinicaId) {
    const idPaciente = consulta?.pacienteId || pacienteId || '';
    registrarAuditoria({
      clinicaId,
      acao: 'IMPRESSAO_PRONTUARIO',
      entidade: 'prontuario',
      entidadeId: prontuarioId || '',
      pacienteId: idPaciente,
      pacienteNome: paciente?.nome || '',
      detalhes: `Imprimiu prontuário com ${secoes.length} seção(ões): ${secoes.map((s) => s.titulo).join(', ')}`
    });
  }
  const tituloDisplay = profissionalTitulo ? profissionalTitulo + ' ' : '';
  const profNomeDisplay = profissionalNome ?
  tituloDisplay + profissionalNome :
  clinicaNome || 'Prontuário Médico';
  const cssStyles = `
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }
    ${cssDocumentoPaginado()}
    ${cssQuebrasPagina('.body')}
    .header { background: #eef4fb; border-bottom: 2px solid #3b82f6; padding: 18px 28px 14px; display: flex; align-items: center; gap: 18px; }
    .header-logo { flex-shrink: 0; width: 80px; display: flex; align-items: center; justify-content: center; }
    .header-logo img { max-height: 70px; max-width: 80px; object-fit: contain; border-radius: 8px; }
    .header-center { flex: 1; text-align: center; }
    .header-center h1 { font-size: 18px; font-weight: bold; color: #1e3a5f; letter-spacing: 0.5px; margin-bottom: 3px; text-transform: uppercase; }
    .header-center .clinica-nome { font-size: 11px; color: #475569; margin-bottom: 2px; }
    .header-center .clinica-endereco { font-size: 9px; color: #64748b; margin-bottom: 1px; }
    .body { padding: 16px 32px 22px; }
    .data-impressao { font-size: 10px; color: #64748b; text-align: right; margin-bottom: 12px; }
    .prontuario-title { font-size: 18px; font-weight: bold; color: #1e293b; text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
    .prontuario-title-line { border-bottom: 2px solid #1e3a5f; width: 180px; margin: 0 auto 16px; }
    .paciente-info { font-size: 11px; color: #334155; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; line-height: 1.6; }
    .paciente-info strong { color: #0f172a; font-size: 12px; }
    /* Uma seção pode ser MAIOR que uma folha (evolução longa, por exemplo):
       com "page-break-inside: avoid" o excesso era simplesmente cortado.
       A seção pode quebrar, mas nunca separando o título do conteúdo. */
    .secao { margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; page-break-inside: auto; }
    .secao-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; page-break-after: avoid; page-break-inside: avoid; }
    .secao-numero { width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; flex-shrink: 0; }
    .secao-titulo { font-size: 13px; font-weight: bold; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.3px; }
    .secao-data { font-size: 9px; color: #94a3b8; margin-left: auto; font-style: italic; }
    .secao-conteudo { font-size: 11px; color: #334155; line-height: 1.7; padding-left: 34px; }
    .assinatura-box { margin-top: 40px; text-align: center; page-break-inside: avoid; }
    .assinatura-linha { border-top: 1px solid #1e3a5f; width: 300px; margin: 0 auto 8px; }
    .assinatura-nome { font-size: 13px; font-weight: bold; color: #1e293b; text-transform: uppercase; }
    .assinatura-crm { font-size: 11px; color: #475569; margin-top: 2px; }
    .assinatura-esp { font-size: 10px; color: #64748b; }
    .footer { background: #eef4fb; border-top: 2px solid #3b82f6; padding: 12px 28px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9px; color: #475569; line-height: 1.5; }
    .footer-left { text-align: left; }
    .footer-left .clinica-nome { font-size: 12px; font-weight: bold; color: #1e3a5f; margin-bottom: 2px; }
    .footer-left .clinica-info { font-size: 8px; color: #64748b; }
    .footer-right { text-align: right; font-size: 9px; color: #64748b; font-style: italic; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc { margin: 0; } }
  `;
  const secoesHtml = secoes.
  map(
    (s, i) =>
    '<div class="secao"><div class="secao-header"><div class="secao-numero">' + (
    i + 1) +
    '</div><div class="secao-titulo">' +
    s.titulo +
    '</div><div class="secao-data">' +
    dataHoraAtual +
    '</div></div><div class="secao-conteudo">' +
    s.conteudo +
    '</div></div>'
  ).
  join('');
  const assinaturaHtml =
  '<div class="assinatura-box"><div class="assinatura-linha"></div><div class="assinatura-nome">' + (
  profissionalNome ? tituloDisplay + profissionalNome : '') +
  '</div>' + (
  profissionalCrm ?
  '<div class="assinatura-crm">' +
  prefixoConselho +
  ' ' +
  profissionalCrm + (
  profissionalUf ? '/' + profissionalUf : '') +
  '</div>' :
  '') + (
  profissionalEspecialidade ?
  '<div class="assinatura-esp">' + profissionalEspecialidade + '</div>' :
  '') + (
  profissionalRqes.length > 0 ?
  profissionalRqes.
  map(
    (r: any) =>
    '<div class="assinatura-esp">' +
    r.especialidade +
    ' — RQE ' +
    r.rqe +
    '</div>'
  ).
  join('') :
  '') +
  '</div>';
  const headerClinicaInfo = [
  clinicaEndereco || '',
  [
  clinicaTelefone ? 'Tel: ' + clinicaTelefone : '',
  clinicaEmail ? 'Email: ' + clinicaEmail : ''].

  filter(Boolean).
  join(' | ')].

  filter(Boolean).
  join('<br/>');
  const footerLeftHtml =
  '<div class="footer-left"><div class="clinica-nome">' + (
  clinicaNome || '') +
  '</div><div class="clinica-info">' +
  [
  clinicaEndereco || '',
  clinicaTelefone ? 'Telefone: ' + clinicaTelefone : '',
  clinicaEmail ? 'Email: ' + clinicaEmail : ''].

  filter(Boolean).
  join('<br/>') +
  '</div></div>';
  const htmlContent =
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Prontuário - ' +
  paciente.nome +
  '</title>' +
  '<sty' +
  'le>' +
  cssStyles +
  '</sty' +
  'le>' +
  // Documento de várias páginas: cabeçalho (thead) e rodapé (tfoot) são
  // repetidos pelo navegador em TODAS as folhas do prontuário.
  '</head><body><table class="doc"><thead><tr><td><div class="header">' + (
  logoHtml ? '<div class="header-logo">' + logoHtml + '</div>' : '') +
  '<div class="header-center"><h1>' +
  profNomeDisplay +
  '</h1>' + (
  clinicaNome ?
  '<div class="clinica-nome">' + clinicaNome + '</div>' :
  '') + (
  profissionalCabecalho ?
  '<div class="clinica-endereco">' +
  profissionalCabecalho.replace(/\n/g, '<br/>') +
  '</div>' :
  headerClinicaInfo ?
  '<div class="clinica-endereco">' + headerClinicaInfo + '</div>' :
  '') +
  '</div></div>' +
  faixaIdentificacao(paciente.nome, 'Prontuário', dataAtual) +
  '</td></tr></thead>' +
  '<tfoot><tr><td><div class="footer">' +
  footerLeftHtml +
  '<div class="footer-right">Documento emitido eletronicamente</div>' +
  '</div></td></tr></tfoot>' +
  '<tbody><tr><td><div class="body"><div class="data-impressao">Data: ' +
  dataAtual +
  '</div><div class="prontuario-title">Prontuário</div><div class="prontuario-title-line"></div><div class="paciente-info"><strong>' +
  paciente.nome.toUpperCase() +
  '</strong>' +
  idadeStr +
  profissaoStr +
  convenioStr +
  '</div>' +
  secoesHtml +
  assinaturaHtml +
  '</div></td></tr></tbody></table></body></html>';
  import('../../utils/pdfGenerator').then(({ previewDocumentoPDF }) => {
    const nomeArquivo = `Prontuario_${paciente.nome.replace(/\s+/g, '_')}_${dataAtual.replace(/\//g, '-')}.pdf`;
    previewDocumentoPDF(htmlContent, {
      fileName: nomeArquivo
    });
  });
}
