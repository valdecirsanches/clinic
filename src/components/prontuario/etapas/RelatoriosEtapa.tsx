import React, { useEffect, useState, useRef, Component } from 'react';
import {
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  PrinterIcon,
  PlusIcon,
  TagIcon,
  EditIcon,
  TrashIcon,
  CopyIcon,
  BuildingIcon,
  CalendarIcon,
  RefreshCwIcon,
  SearchIcon,
  ActivityIcon,
  Loader2Icon,
  ChevronsRightIcon,
  ChevronsLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon } from
'lucide-react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EditorDocumento } from '../EditorDocumento';
import {
  paraHtml,
  paraHtmlImpressao,
  paraTextoSimples,
  pareceHtml } from
'../../../utils/htmlTexto';
import {
  resolverEspecialidade,
  resolverConselho } from
'../../../utils/especialidadeHelper';
import { PadroesRelatorioModal } from './PadroesRelatorioModal';
import { API_BASE_URL } from '../../../config/api';
interface RelatorioItem {
  id: string;
  data: string;
  titulo?: string;
  tipo: string;
  destinatario: string;
  conteudo: string;
  medico: string;
  cid10?: string;
}
interface RelatorioData {
  titulo: string;
  tipo: string;
  destinatario: string;
  data: string;
  conteudo: string;
  cid10: string;
}
interface RelatoriosEtapaProps {
  data?: RelatorioData;
  historico?: RelatorioItem[];
  tiposRelatorio?: {
    id: string;
    nome: string;
    template?: string;
  }[];
  onChange?: (data: RelatorioData) => void;
  onSave?: (data: RelatorioData) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
  /** Há alterações não salvas (rascunho restaurado ou texto de outra aba): Salvar já começa habilitado. */
  naoSalvo?: boolean;
  clinicaId?: string;
  profissionalId?: string;
  pacienteNome?: string;
  // ⭐ FIX: Dados do profissional da consulta (para impressão — NUNCA usa o logado)
  profissionalDoProntuario?: {
    id?: string;
    nome?: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
    titulo?: string;
    cabecalhoRelatorio?: string;
    rqes?: any;
  };
}
// Tipos de relatório padrão
const TIPOS_RELATORIO_PADRAO = [
{
  id: 'laudo_medico',
  nome: 'Laudo Médico',
  template:
  'Atesto para os devidos fins que o(a) paciente [NOME] encontra-se em acompanhamento médico...'
},
{
  id: 'relatorio_cirurgico',
  nome: 'Relatório Cirúrgico',
  template: 'Relatório de procedimento cirúrgico realizado em [DATA]...'
},
{
  id: 'parecer_medico',
  nome: 'Parecer Médico',
  template: 'Parecer técnico referente ao paciente [NOME]...'
},
{
  id: 'relatorio_alta',
  nome: 'Relatório de Alta',
  template: 'Relatório de alta hospitalar do paciente [NOME]...'
},
{
  id: 'encaminhamento',
  nome: 'Encaminhamento',
  template:
  'Encaminho o(a) paciente [NOME] para avaliação especializada em...'
},
{
  id: 'solicitacao_exames',
  nome: 'Solicitação de Exames',
  template: 'Solicito a realização dos seguintes exames complementares...'
},
{
  id: 'relatorio_acompanhamento',
  nome: 'Relatório de Acompanhamento',
  template: 'Relatório de acompanhamento clínico do paciente [NOME]...'
},
{
  id: 'declaracao_comparecimento',
  nome: 'Declaração de Comparecimento',
  template:
  'Declaro para os devidos fins que o(a) paciente [NOME] compareceu a esta unidade de saúde...'
}];

// Preferência de exibição do painel lateral (apenas visual)
const CHAVE_PAINEL_RELATORIOS = 'prontuario_relatorios_painel';

export function RelatoriosEtapa({
  data,
  historico = [],
  tiposRelatorio,
  onChange,
  onSave,
  onDelete,
  readOnly = false,
  naoSalvo = false,
  clinicaId,
  profissionalId,
  pacienteNome,
  profissionalDoProntuario
}: RelatoriosEtapaProps) {
  const [formData, setFormData] = useState<RelatorioData>({
    titulo: data?.titulo || '',
    tipo: data?.tipo || '',
    destinatario: data?.destinatario || '',
    data: data?.data || new Date().toISOString().split('T')[0],
    conteudo: data?.conteudo || '',
    cid10: data?.cid10 || ''
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(naoSalvo);
  const [isNew, setIsNew] = useState(true);
  const [showCidDropdown, setShowCidDropdown] = useState(false);
  const [cidSearch, setCidSearch] = useState('');
  // ⭐ Busca CID-10 na API (igual ao DiagnosticoEtapa) — sem lista hardcoded.
  const [cidResultados, setCidResultados] = useState<
    {
      codigo: string;
      descricao: string;
    }[]>(
    []);
  const [cidLoading, setCidLoading] = useState(false);
  const [cidDescricoes, setCidDescricoes] = useState<Record<string, string>>({});
  const [showPadroesModal, setShowPadroesModal] = useState(false);
  // ⭐ Cabeçalho do relatório: começa RECOLHIDO para o documento já abrir
  //    ocupando a tela. Recolhe também ao entrar no documento. Os dados
  //    permanecem no formulário — recolher é apenas visual.
  const [infoRecolhido, setInfoRecolhido] = useState(true);
  // ⭐ Painel de Histórico/Dicas: oculto por padrão para o documento usar toda a
  // largura. A escolha do usuário fica guardada entre as sessões.
  const [painelVisivel, setPainelVisivel] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAVE_PAINEL_RELATORIOS) === '1';
    } catch {
      return false;
    }
  });
  const alternarPainel = () => {
    setPainelVisivel((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(CHAVE_PAINEL_RELATORIOS, proximo ? '1' : '0');
      } catch {

        /* preferência apenas visual */}
      return proximo;
    });
  };
  const tipos = tiposRelatorio || TIPOS_RELATORIO_PADRAO;
  // ⭐ Com HTML, um documento "vazio" pode conter só <p><br></p>: por isso a
  //    verificação usa o texto legível, não a string bruta.
  const conteudoVazio = !paraTextoSimples(formData.conteudo).trim();
  // ⭐ Resumo da barra compacta: título (ou "Novo relatório") e data. Acompanha
  //    o formulário em tempo real, pois deriva do próprio formData.
  // A data pode chegar como 'AAAA-MM-DD' ou com hora: formata sem depender do
  // fuso e sem exibir "Invalid Date" quando o formato for inesperado.
  const dataResumo = (() => {
    const somenteData = String(formData.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(somenteData)) return '';
    const [ano, mes, dia] = somenteData.split('-');
    return `${dia}/${mes}/${ano}`;
  })();
  const resumoInformacoes = [
  formData.titulo.trim() || 'Novo relatório',
  dataResumo].

  filter(Boolean).
  join(' | ');
  // Mock de histórico para visualização
  const historicoExibir = historico.length > 0 ? historico : [];
  // ⭐ Busca CID-10 na API com debounce (substitui o filtro local).
  useEffect(() => {
    const termo = cidSearch.trim();
    if (termo.length < 2) {
      setCidResultados([]);
      setCidLoading(false);
      return;
    }
    setCidLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/cid10/buscar?q=${encodeURIComponent(termo)}&limit=15`
        );
        if (response.ok) {
          const cids = await response.json();
          const items = (cids || []).map((c: any) => ({
            codigo: c.codigo,
            descricao: c.descricao
          }));
          setCidResultados(items);
          setCidDescricoes((prev) => {
            const next = {
              ...prev
            };
            items.forEach((c: {codigo: string;descricao: string;}) => {
              next[c.codigo.toUpperCase()] = c.descricao;
            });
            return next;
          });
        } else {
          setCidResultados([]);
        }
      } catch (err) {
        console.error('Erro ao buscar CIDs:', err);
        setCidResultados([]);
      } finally {
        setCidLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cidSearch]);
  useEffect(() => {
    if (data) {
      setFormData({
        titulo: data.titulo || '',
        tipo: data.tipo || '',
        destinatario: data.destinatario || '',
        data: data.data || new Date().toISOString().split('T')[0],
        conteudo: data.conteudo || '',
        cid10: data.cid10 || ''
      });
    }
  }, [data]);
  const handleChange = (field: keyof RelatorioData, value: string) => {
    const newData = {
      ...formData,
      [field]: value
    };
    setFormData(newData);
    setHasChanges(true);
    setIsNew(false);
    onChange?.(newData);
  };
  const handleTipoChange = (tipoId: string) => {
    const tipoSelecionado = tipos.find((t) => t.id === tipoId);
    const newData = {
      ...formData,
      tipo: tipoId,
      conteudo: tipoSelecionado?.template || formData.conteudo
    };
    setFormData(newData);
    setHasChanges(true);
    setIsNew(false);
    onChange?.(newData);
  };
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave?.(formData);
      setLastSaved(new Date());
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };
  // ⭐ Auto-save com debounce de 2 segundos
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  useEffect(() => {
    if (!hasChanges || !onSave || readOnly || isSaving) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await onSave(formDataRef.current);
        setLastSaved(new Date());
        setHasChanges(false);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasChanges, formData, onSave, readOnly, isSaving]);
  const handleNovo = () => {
    setFormData({
      titulo: '',
      tipo: '',
      destinatario: '',
      data: new Date().toISOString().split('T')[0],
      conteudo: '',
      cid10: ''
    });
    setIsNew(true);
    setHasChanges(false);
    setCidSearch('');
  };
  const handleEdit = (item: RelatorioItem) => {
    setFormData({
      titulo: item.titulo || '',
      tipo: item.tipo,
      destinatario: item.destinatario,
      data: item.data,
      conteudo: item.conteudo,
      cid10: item.cid10 || ''
    });
    setCidSearch('');
    setIsNew(false);
    setHasChanges(false);
  };
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    return lastSaved.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  // ⭐ Helper: busca descrição do CID pelo código (a partir do cache da API)
  const getCidDescricao = (codigo: string) => {
    return cidDescricoes[codigo.trim().toUpperCase()] || '';
  };
  // ⭐ Helper: parse CID string para array de códigos
  const parseCidCodes = (cid10: string): string[] => {
    if (!cid10) return [];
    return cid10.
    split(',').
    map((c) => c.trim()).
    filter(Boolean);
  };
  // Resultados disponíveis = API menos os já selecionados.
  const filteredCids = cidResultados.filter(
    (cid) =>
    !parseCidCodes(formData.cid10).
    map((c) => c.toUpperCase()).
    includes(cid.codigo.toUpperCase())
  );
  // ⭐ Geração de PDF profissional do relatório
  const handlePrint = () => {
    const dataFormatada = formData.data ?
    new Date(formData.data + 'T12:00:00').toLocaleDateString('pt-BR') :
    new Date().toLocaleDateString('pt-BR');
    const tipoNome =
    tipos.find((t) => t.id === formData.tipo)?.nome ||
    formData.tipo ||
    'Relatório Médico';
    // Dados da clínica e profissional do localStorage
    let clinicaNome = '';
    let clinicaEndereco = '';
    let clinicaTelefone = '';
    let clinicaEmail = '';
    let clinicaCnpj = '';
    let clinicaLogoUrl = '';
    let profissionalNome = '';
    let profissionalCrm = '';
    let profissionalEspecialidade = '';
    let prefixoConselho = 'CRM';
    let profissionalTitulo = '';
    let profissionalCabecalho = '';
    let profissionalRqes: Array<{
      especialidade: string;
      rqe: string;
    }> = [];
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        clinicaNome = parsed.clinicaAtual?.nome || '';
        clinicaEndereco = parsed.clinicaAtual?.endereco || '';
        clinicaTelefone = parsed.clinicaAtual?.telefone || '';
        clinicaEmail = parsed.clinicaAtual?.email || '';
        clinicaCnpj = parsed.clinicaAtual?.cnpj || '';
        clinicaLogoUrl =
        parsed.clinicaAtual?.logoUrl ||
        parsed.operadoraSelecionada?.logoUrl ||
        '';
        // ⭐ FIX CRÍTICO: NUNCA usa parsed.usuario como profissional (pode ser atendente!)
        // Profissional vem EXCLUSIVAMENTE de profissionalDoProntuario
      }
    } catch {

      /* ignore */}
    // ⭐ FIX: Resolve profissional do prontuário (NUNCA do usuário logado)
    if (profissionalDoProntuario) {
      profissionalNome = profissionalDoProntuario.nome || '';
      profissionalCrm = profissionalDoProntuario.crm || '';
      if (profissionalDoProntuario.uf && profissionalCrm) {
        profissionalCrm = profissionalCrm + '/' + profissionalDoProntuario.uf;
      }
      // ⭐ FIX: Resolve IDs de especialidade (ex: ["11","15"]) para nomes legíveis
      profissionalEspecialidade = resolverEspecialidade(
        profissionalDoProntuario.especialidade,
        profissionalDoProntuario.especialidades
      );
      // ⭐ FIX: CRO para dentista (por tipo OU especialidade odontológica)
      prefixoConselho = resolverConselho(
        profissionalDoProntuario.tipo,
        profissionalDoProntuario.especialidade,
        profissionalDoProntuario.especialidades,
        profissionalDoProntuario.crm
      );
      profissionalTitulo = profissionalDoProntuario.titulo || '';
      profissionalCabecalho = profissionalDoProntuario.cabecalhoRelatorio || '';
      try {
        const rawRqes = profissionalDoProntuario.rqes;
        const parsedRqes =
        typeof rawRqes === 'string' ? JSON.parse(rawRqes) : rawRqes;
        if (Array.isArray(parsedRqes))
        profissionalRqes = parsedRqes.filter(
          (r: any) => r.especialidade && r.rqe
        );
      } catch {

        /* ignore */}
    }
    // ⭐ REMOVIDO: Fallback para localStorage/parsed.usuario que causava "Atendente" no PDF
    const logoHtml = clinicaLogoUrl ?
    '<img src="' +
    clinicaLogoUrl +
    '" alt="Logo" style="max-height:70px;max-width:110px;object-fit:contain;border-radius:6px;" />' :
    '';
    const cidCodes = parseCidCodes(formData.cid10);
    const cidHtml =
    cidCodes.length > 0 ?
    '<div class="info-row"><span class="info-label">CID-10:</span> <span class="info-value">' +
    cidCodes.join(', ') +
    '</span></div>' :
    '';
    // ⭐ Preserva a formatação do editor. Registros antigos (texto puro)
    //    continuam impressos com as quebras de linha corretas.
    // Sai IGUAL à tela: preserva alinhamento, cor, listas e tabelas do editor
    const conteudoHtml = paraHtmlImpressao(formData.conteudo);
    const h: string[] = [];
    h.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">');
    h.push('<title>' + tipoNome + '</title>');
    const styleTag = '<sty' + 'le>';
    const styleCloseTag = '</sty' + 'le>';
    h.push(styleTag);
    h.push('@page { size: A4; margin: 0; }');
    h.push('* { margin: 0; padding: 0; box-sizing: border-box; }');
    h.push(
      'body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }'
    );
    // ⭐ DOCUMENTO DE VÁRIAS PÁGINAS.
    // O layout anterior era um único bloco flex: o cabeçalho e o rodapé saíam
    // SÓ na primeira/última folha, deixando as páginas seguintes sem qualquer
    // identificação do paciente e do emissor — falha grave em documento médico.
    // Uma tabela com thead/tfoot é a única estrutura que os navegadores
    // repetem em TODAS as páginas impressas.
    h.push(
      '.doc { width: 210mm; margin: 0 auto; border-collapse: collapse; table-layout: fixed; }'
    );
    h.push('thead { display: table-header-group; }');
    h.push('tfoot { display: table-footer-group; }');
    h.push('tbody { display: table-row-group; }');
    h.push('.doc > thead > tr > td, .doc > tfoot > tr > td { padding: 0; }');
    // Espaço para o cabeçalho/rodapé repetidos não colarem no conteúdo
    h.push('.corpo-celula { padding: 0; vertical-align: top; }');
    // Header
    h.push(
      '.header { background: #edf3fb; border-bottom: 3px solid #3b82f6; padding: 20px 28px; display: flex; align-items: center; gap: 20px; }'
    );
    h.push(
      '.header-logo { flex-shrink: 0; width: 100px; display: flex; align-items: center; justify-content: center; }'
    );
    h.push('.header-logo img { border-radius: 8px; }');
    h.push('.header-center { flex: 1; text-align: center; }');
    h.push(
      '.header-center h1 { font-size: 20px; font-weight: bold; color: #1e3a5f; text-transform: uppercase; margin-bottom: 2px; }'
    );
    h.push(
      '.header-center .especialidade { font-size: 12px; font-weight: bold; color: #2563eb; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }'
    );
    h.push(
      '.header-center .info { font-size: 9px; color: #475569; line-height: 1.5; }'
    );
    // Sem posicionamento absoluto: dentro do cabeçalho repetido ele escaparia
    // da folha nas páginas seguintes.
    h.push(
      '.header-crm { flex-shrink: 0; width: 100px; text-align: right; }'
    );
    h.push('.header-crm .label { font-size: 9px; color: #64748b; }');
    h.push(
      '.header-crm .numero { font-size: 15px; font-weight: bold; color: #1e3a5f; }'
    );
    // Faixa de identificação repetida em toda página: quem é o paciente e que
    // documento é este — exigência básica de um documento clínico paginado.
    h.push(
      '.faixa-id { padding: 5px 28px; border-bottom: 1px solid #dbeafe; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 12px; }'
    );
    h.push('.faixa-id strong { color: #1e3a5f; }');
    // Body
    h.push('.body { padding: 20px 28px 26px; }');
    h.push(
      '.doc-title { font-size: 16px; font-weight: bold; color: #1e3a5f; border-bottom: 3px solid #3b82f6; padding-bottom: 6px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; text-align: center; }'
    );
    h.push(
      '.info-block { background: #f8fafc; padding: 10px 14px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-bottom: 18px; font-size: 11px; line-height: 1.8; }'
    );
    h.push('.info-row { margin-bottom: 2px; }');
    h.push('.info-label { font-weight: bold; color: #0f172a; }');
    h.push('.info-value { color: #334155; }');
    // ⭐ Conteúdo do editor já vem em HTML (parágrafos, listas, tabelas): com
    //    `pre-wrap` as quebras do próprio HTML virariam linhas em branco. Texto
    //    puro (registros antigos) continua com `pre-wrap` para manter as
    //    quebras digitadas.
    h.push(
      // Sem `text-align` forçado: o alinhamento é o que o usuário definiu no
      // editor (esquerda, centro, direita, justificado).
      '.conteudo { font-size: 12px; color: #1e293b; line-height: 1.8; margin-top: 16px; white-space: ' + (
      pareceHtml(formData.conteudo) ? 'normal' : 'pre-wrap') +
      '; }'
    );
    // Nada de altura fixa: o conteúdo flui por quantas páginas A4 precisar.
    h.push('.conteudo p { margin: 0 0 10px; }');
    h.push(
      '.conteudo ul, .conteudo ol { margin: 0 0 10px; padding-left: 24px; }'
    );
    h.push('.conteudo ul { list-style: disc; }');
    h.push('.conteudo ol { list-style: decimal; }');
    h.push('.conteudo li { margin-bottom: 3px; }');
    h.push(
      '.conteudo h1 { font-size: 15px; margin: 0 0 10px; }'
    );
    h.push('.conteudo h2 { font-size: 13px; margin: 12px 0 8px; }');
    h.push('.conteudo h3 { font-size: 12px; margin: 10px 0 6px; }');
    h.push(
      '.conteudo table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11px; }'
    );
    h.push(
      '.conteudo th, .conteudo td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }'
    );
    h.push('.conteudo th { background: #f1f5f9; font-weight: bold; }');
    h.push('.conteudo table, .conteudo tr { page-break-inside: avoid; }');
    // Assinatura — alinhada à direita
    h.push(
      '.assinatura { margin-top: 50px; text-align: right; page-break-inside: avoid; font-size: 10px; line-height: 1.6; }'
    );
    h.push(
      '.assinatura-nome { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #1e293b; }'
    );
    h.push(
      '.assinatura-crm { font-size: 10px; color: #0D47A1; font-weight: bold; }'
    );
    h.push('.assinatura-esp { font-size: 10px; color: #475569; }');
    // Footer — modelo médico padrão
    h.push(
      '.footer { background: #edf3fb; border-top: 3px solid #1565C0; padding: 10px 28px; text-align: center; font-size: 9px; color: #475569; line-height: 1.5; }'
    );
    h.push(
      '.footer .nome { font-size: 14px; font-weight: bold; color: #0D47A1; margin-bottom: 2px; }'
    );
    h.push('.footer .cnpj { font-size: 8px; color: #64748b; }');
    h.push(
      '.footer .pag { font-size: 8px; color: #999; text-align: right; margin-top: 4px; }'
    );
    h.push(
      '.data-impressao { font-size: 9px; color: #94a3b8; text-align: right; margin-bottom: 12px; }'
    );
    // Quebra de página organizada: nenhum item de lista, linha de tabela,
    // bloco de identificação ou assinatura pode ser partido ao meio; parágrafos
    // não deixam linhas órfãs/viúvas soltas no fim da folha.
    h.push('.conteudo li, .conteudo tr { page-break-inside: avoid; }');
    h.push(
      '.conteudo p, .conteudo li { orphans: 3; widows: 3; page-break-inside: avoid; }'
    );
    h.push(
      '.conteudo h1, .conteudo h2, .conteudo h3 { page-break-after: avoid; page-break-inside: avoid; }'
    );
    h.push('.info-block, .doc-title { page-break-inside: avoid; }');
    h.push('.doc-title { page-break-after: avoid; }');
    h.push(
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc { margin: 0; } }'
    );
    h.push(styleCloseTag);
    h.push('</head><body>');
    // Documento paginado: thead (cabeçalho) e tfoot (rodapé) repetem em todas
    // as folhas; o corpo flui pelo número de páginas que precisar.
    h.push('<table class="doc"><thead><tr><td>');
    // Header
    h.push('<div class="header">');
    if (logoHtml) h.push('<div class="header-logo">' + logoHtml + '</div>');
    h.push('<div class="header-center">');
    // ⭐ NOVO: Usa titulo do cadastro do profissional ao invés de 'Dr(a).' hardcoded
    const tituloDisplay = profissionalTitulo ? profissionalTitulo + ' ' : '';
    h.push(
      '<h1>' + (
      profissionalNome ?
      tituloDisplay + profissionalNome :
      clinicaNome || 'Relatório Médico') +
      '</h1>'
    );
    if (profissionalEspecialidade)
    h.push(
      '<div class="especialidade">' + profissionalEspecialidade + '</div>'
    );
    // ⭐ NOVO: Se tem cabecalhoRelatorio personalizado, usa ele; senão monta automaticamente
    if (profissionalCabecalho) {
      h.push(
        '<div class="info">' +
        profissionalCabecalho.replace(/\n/g, '<br/>') +
        '</div>'
      );
    } else {
      const infoLines: string[] = [];
      if (clinicaNome) infoLines.push(clinicaNome);
      if (clinicaEndereco) infoLines.push(clinicaEndereco);
      const contato = [
      clinicaTelefone ? 'Tel: ' + clinicaTelefone : '',
      clinicaEmail ? 'Email: ' + clinicaEmail : ''].

      filter(Boolean).
      join(' | ');
      if (contato) infoLines.push(contato);
      if (infoLines.length > 0)
      h.push('<div class="info">' + infoLines.join('<br/>') + '</div>');
    }
    h.push('</div>');
    if (profissionalCrm) {
      h.push(
        '<div class="header-crm"><div class="label">' +
        prefixoConselho +
        '</div><div class="numero">' +
        profissionalCrm +
        '</div></div>'
      );
    }
    h.push('</div>');
    // Faixa de identificação — repetida em cada página junto do cabeçalho
    h.push('<div class="faixa-id">');
    h.push(
      '<span><strong>Paciente:</strong> ' + (
      pacienteNome ? pacienteNome.toUpperCase() : '—') +
      '</span>'
    );
    h.push(
      '<span><strong>' + tipoNome + '</strong> — ' + dataFormatada + '</span>'
    );
    h.push('</div>');
    h.push('</td></tr></thead>');
    // Rodapé declarado ANTES do corpo: exigência da estrutura de tabela para
    // o navegador repeti-lo ao pé de todas as páginas.
    h.push('<tfoot><tr><td>');
    h.push('<div class="footer">');
    if (clinicaNome) h.push('<div class="nome">' + clinicaNome + '</div>');
    if (clinicaCnpj) h.push('<div class="cnpj">CNPJ: ' + clinicaCnpj + '</div>');
    const rodapeContato: string[] = [];
    if (clinicaEndereco) rodapeContato.push(clinicaEndereco);
    if (clinicaTelefone) rodapeContato.push('Tel: ' + clinicaTelefone);
    if (clinicaEmail) rodapeContato.push('Email: ' + clinicaEmail);
    if (rodapeContato.length > 0)
    h.push('<div>' + rodapeContato.join(' | ') + '</div>');
    h.push('</div>');
    h.push('</td></tr></tfoot>');
    // Body
    h.push('<tbody><tr><td class="corpo-celula">');
    h.push('<div class="body">');
    h.push(
      '<div class="data-impressao"><strong>Impresso em ' +
      new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) +
      '</strong></div>'
    );
    h.push('<div class="doc-title">' + tipoNome + '</div>');
    // Info block
    h.push('<div class="info-block">');
    if (pacienteNome)
    h.push(
      '<div class="info-row"><span class="info-label">Paciente:</span> <span class="info-value">' +
      pacienteNome.toUpperCase() +
      '</span></div>'
    );
    if (formData.titulo)
    h.push(
      '<div class="info-row"><span class="info-label">Título:</span> <span class="info-value">' +
      formData.titulo +
      '</span></div>'
    );
    h.push(
      '<div class="info-row"><span class="info-label">Data:</span> <span class="info-value">' +
      dataFormatada +
      '</span></div>'
    );
    if (formData.destinatario)
    h.push(
      '<div class="info-row"><span class="info-label">Destinatário:</span> <span class="info-value">' +
      formData.destinatario +
      '</span></div>'
    );
    if (cidHtml) h.push(cidHtml);
    h.push('</div>');
    // Conteúdo
    h.push('<div class="conteudo">' + conteudoHtml + '</div>');
    // Assinatura
    h.push('<div class="assinatura">');
    if (profissionalNome)
    h.push(
      '<div class="assinatura-nome">' +
      tituloDisplay +
      profissionalNome +
      '</div>'
    );
    if (profissionalCrm)
    h.push(
      '<div class="assinatura-crm">' +
      prefixoConselho +
      ' ' +
      profissionalCrm +
      '</div>'
    );
    if (profissionalEspecialidade)
    h.push(
      '<div class="assinatura-esp">' + profissionalEspecialidade + '</div>'
    );
    // ⭐ NOVO: Exibe RQEs na assinatura
    if (profissionalRqes.length > 0) {
      profissionalRqes.forEach((r) => {
        h.push(
          '<div class="assinatura-esp">' +
          r.especialidade +
          ' — RQE ' +
          r.rqe +
          '</div>'
        );
      });
    }
    h.push('</div>');
    h.push('</div>'); // body
    h.push('</td></tr></tbody>');
    h.push('</table>');
    h.push('</body></html>');
    // ⭐ Abre preview antes de salvar
    import('../../../utils/pdfGenerator').then(({ previewDocumentoPDF }) => {
      const nomeArquivo = `Relatorio_${formData.data || new Date().toISOString().split('T')[0]}.pdf`;
      previewDocumentoPDF(h.join('\n'), {
        fileName: nomeArquivo
      });
    });
  };
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* ===== HEADER FIXO ===== */}
      <div className="flex-shrink-0 border-b border-gray-100 pb-2 mb-3 bg-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-medium text-teal-700 flex items-center gap-2">
              <FileTextIcon className="w-5 h-5" />
              Relatórios
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Gere relatórios médicos padronizados para solicitantes
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center mr-2">
              {isSaving ?
              <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                  <RefreshCwIcon className="w-3 h-3 animate-spin" /> Salvando...
                </span> :
              lastSaved && !hasChanges ?
              <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                  <CheckCircleIcon className="w-3 h-3" /> Salvo às{' '}
                  {formatLastSaved()}
                </span> :
              hasChanges ?
              <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                  <ClockIcon className="w-3 h-3" /> Não salvo
                </span> :
              null}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={alternarPainel}
              aria-pressed={painelVisivel}
              title={
              painelVisivel ?
              'Esconder histórico e dicas' :
              'Mostrar histórico e dicas'
              }
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              
              {painelVisivel ?
              <ChevronsRightIcon className="w-4 h-4 sm:mr-2" /> :

              <ChevronsLeftIcon className="w-4 h-4 sm:mr-2" />
              }
              <span className="hidden sm:inline">
                {painelVisivel ? 'Esconder painel' : 'Histórico e dicas'}
              </span>
            </Button>

            {!readOnly &&
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPadroesModal(true)}
              className="text-teal-600 border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-colors">
              
                <TagIcon className="w-4 h-4 mr-2" />
                Padrões
              </Button>
            }

            {!readOnly &&
            <Button
              variant="outline"
              size="sm"
              onClick={handleNovo}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              
                <PlusIcon className="w-4 h-4 mr-2" /> Novo Relatório
              </Button>
            }

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={conteudoVazio}
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              
              <PrinterIcon className="w-4 h-4 mr-2" /> Imprimir
            </Button>

            {!readOnly &&
            <Button
              size="sm"
              onClick={handleSave}
              data-salvar-etapa
              title="Salvar (Ctrl+S)"
              disabled={isSaving || !hasChanges}
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow transition-all">
              
                <SaveIcon className="w-4 h-4 mr-2" /> Salvar
              </Button>
            }
          </div>
        </div>
      </div>

      {/* ===== ÁREA DE TRABALHO — editor protagonista + painel opcional ===== */}
      {/* Em telas menores o conteúdo rola normalmente; no desktop a área é
           contida (overflow-hidden) e o ÚNICO scroll fica dentro do documento.
           `min-h-0` em toda a cadeia é o que permite ao editor encolher até a
           altura disponível — sem isso ele estoura a tela e o texto some. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-y-auto lg:overflow-hidden">
        {/* ===== COLUNA PRINCIPAL — ocupa toda a largura disponível ===== */}
        <div className="flex-1 min-w-0 lg:min-h-0 flex flex-col">
          {/* Sem `gap` entre os filhos: quando o formulário está recolhido ele
               fica com altura zero e não deve sobrar espaço vazio acima do
               documento — o espaçamento vem das margens condicionais. */}
          <div className="flex flex-col lg:min-h-0 lg:flex-1">
            {/* ===== BARRA DE INFORMAÇÕES — abre e fecha o formulário ===== */}
            <button
              type="button"
              onClick={() => setInfoRecolhido((atual) => !atual)}
              aria-expanded={!infoRecolhido}
              title={
              infoRecolhido ?
              'Mostrar as informações do relatório' :
              'Recolher as informações e ampliar o documento'
              }
              className="flex-shrink-0 w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-md border border-teal-200 bg-teal-50/70 text-left hover:bg-teal-50 transition-colors">
              
              {infoRecolhido ?
              <ChevronDownIcon className="w-4 h-4 text-teal-700 flex-shrink-0" /> :

              <ChevronUpIcon className="w-4 h-4 text-teal-700 flex-shrink-0" />
              }
              <span className="text-xs font-medium text-teal-800 flex-shrink-0">
                Informações do relatório:
              </span>
              <span className="text-xs text-gray-700 truncate">
                {resumoInformacoes}
              </span>
            </button>

            {/* Cabeçalho do documento — campos compactos */}
            <Card
              className={`flex-shrink-0 shadow-sm overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out ${
              infoRecolhido ?
              'max-h-0 opacity-0 mb-0 border-transparent pointer-events-none' :
              'max-h-[700px] opacity-100 mb-2 border-t-4 border-t-teal-500'}`
              }
              aria-hidden={infoRecolhido}
              noPadding>
              
              <div className="space-y-3 p-3">
                {/* ⭐ Título, Tipo e Data — uma linha só, para sobrar altura
                     para o documento */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="xl:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <FileTextIcon className="w-3.5 h-3.5 text-teal-600" />
                      Título / Descrição Resumida
                    </label>
                    <input
                      type="text"
                      value={formData.titulo}
                      onChange={(e) => handleChange('titulo', e.target.value)}
                      placeholder="Ex: Laudo para INSS, Relatório Cirúrgico Joelho Direito..."
                      disabled={readOnly}
                      className="block w-full border border-gray-300 rounded-md px-2 py-1.5 bg-gray-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm transition-all hover:border-gray-400" />
                    
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tipo de Relatório
                    </label>
                    <select
                      value={formData.tipo}
                      onChange={(e) => handleTipoChange(e.target.value)}
                      disabled={readOnly}
                      className="w-full border border-gray-200 rounded-md p-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed">
                      
                      <option value="">Selecione o tipo...</option>
                      {tipos.map((tipo) =>
                      <option key={tipo.id} value={tipo.id}>
                          {tipo.nome}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Data
                    </label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="date"
                        value={formData.data}
                        onChange={(e) => handleChange('data', e.target.value)}
                        disabled={readOnly}
                        className="w-full border border-gray-200 rounded-md p-2 pl-8 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" />
                      
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Destinatário */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Destinatário / Solicitante
                    </label>
                    <div className="relative">
                      <BuildingIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={formData.destinatario}
                        onChange={(e) =>
                        handleChange('destinatario', e.target.value)
                        }
                        placeholder="Ex: INSS - Perícia Médica, Empresa XYZ, Dr. João Silva..."
                        disabled={readOnly}
                        className="w-full border border-gray-200 rounded-md p-2 pl-8 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" />
                      
                    </div>
                  </div>

                  {/* ⭐ CID-10 com tags removíveis */}
                  <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    <ActivityIcon className="w-3.5 h-3.5 text-teal-600" />
                    CID-10 (Opcional — pode adicionar múltiplos)
                  </label>

                  {/* Tags selecionadas */}
                  {formData.cid10 &&
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {parseCidCodes(formData.cid10).map((codigo, idx) => {
                        const descricao = getCidDescricao(codigo);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-800 text-[10px] font-medium rounded-full border border-teal-200"
                            title={descricao || codigo}>
                            
                            <span className="font-bold">{codigo}</span>
                            {descricao &&
                            <span className="text-teal-600 max-w-[150px] truncate">
                                {descricao}
                              </span>
                            }
                            {!readOnly &&
                            <button
                              type="button"
                              onClick={() => {
                                const codes = parseCidCodes(formData.cid10);
                                codes.splice(idx, 1);
                                handleChange('cid10', codes.join(','));
                              }}
                              className="ml-0.5 p-0.5 rounded-full hover:bg-teal-200 transition-colors">
                              
                                <svg
                                className="w-2.5 h-2.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                
                                  <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M6 18L18 6M6 6l12 12" />
                                
                                </svg>
                              </button>
                            }
                          </span>);

                      })}
                    </div>
                    }

                  {/* Campo de busca (sempre limpo) */}
                  <div className="relative">
                    <div className="relative">
                      <input
                          type="text"
                          value={cidSearch}
                          onChange={(e) => {
                            setCidSearch(e.target.value);
                            setShowCidDropdown(true);
                          }}
                          onFocus={() => setShowCidDropdown(true)}
                          onBlur={() =>
                          setTimeout(() => setShowCidDropdown(false), 200)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && cidSearch.trim()) {
                              e.preventDefault();
                              const codes = parseCidCodes(formData.cid10);
                              codes.push(cidSearch.trim().toUpperCase());
                              handleChange('cid10', codes.join(','));
                              setCidSearch('');
                              setShowCidDropdown(false);
                            }
                          }}
                          placeholder="Buscar CID por código ou descrição..."
                          disabled={readOnly}
                          className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed text-sm" />
                        

                      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>

                    {showCidDropdown &&
                      !readOnly &&
                      cidSearch.trim().length >= 2 &&
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                          {cidLoading ?
                        <div className="px-3 py-2 text-gray-500 text-sm flex items-center gap-2">
                              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                              Buscando...
                            </div> :
                        filteredCids.length > 0 ?
                        filteredCids.map((cid) =>
                        <button
                          key={cid.codigo}
                          onClick={() => {
                            const codes = parseCidCodes(formData.cid10);
                            codes.push(cid.codigo);
                            handleChange('cid10', codes.join(','));
                            setCidSearch('');
                            setCidResultados([]);
                            setShowCidDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-teal-50 transition-colors flex items-center gap-2 border-b border-gray-50 last:border-0">
                          
                                <span className="inline-block px-1.5 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded font-mono">
                                  {cid.codigo}
                                </span>
                                <span className="text-xs text-gray-700 truncate">
                                  {cid.descricao}
                                </span>
                              </button>
                        ) :

                        <div className="px-3 py-2 text-gray-500 text-xs">
                              Nenhum CID encontrado. Verifique se a tabela
                              CID-10 foi importada.
                            </div>
                        }
                        </div>
                      }
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Busque e selecione da lista, ou digite e pressione Enter
                      para adicionar manualmente.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* ===== DOCUMENTO — protagonista da tela ===== */}
            {/* No desktop o editor ocupa exatamente o espaço restante
                 (flex-1 + min-h-0). Em telas pequenas ganha uma altura
                 confortável e a página rola. */}
            <div className="flex flex-col min-h-[70vh] lg:min-h-0 lg:flex-1">
              <div className="flex-shrink-0 flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">
                  Conteúdo do Relatório
                </label>
                <span className="text-[10px] text-gray-400 hidden sm:inline">
                  Ctrl+B negrito · Ctrl+I itálico · Ctrl+Z desfazer
                </span>
              </div>
              <div className="flex-1 min-h-0 flex">
                <EditorDocumento
                  value={formData.conteudo}
                  onChange={(html) => handleChange('conteudo', html)}
                  onFocus={() => setInfoRecolhido(true)}
                  placeholder="Digite o conteúdo do relatório ou selecione um tipo para usar o template..."
                  disabled={readOnly}
                  larguraTotal />
                
              </div>
            </div>
          </div>
        </div>

        {/* ===== PAINEL LATERAL OPCIONAL — Histórico e Dicas ===== */}
        {painelVisivel &&
        <aside
          aria-label="Histórico e dicas"
          className="w-full lg:w-80 xl:w-96 lg:flex-shrink-0 lg:min-h-0 lg:overflow-y-auto space-y-4 pb-1 animate-in fade-in slide-in-from-right-2 duration-200">
          
            {/* Histórico de Relatórios */}
            <Card className="p-0 bg-white border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-teal-600" />
                  Histórico de Relatórios
                </h3>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                  {historicoExibir.length}
                </span>
              </div>

              {historicoExibir.length > 0 ?
            <div className="max-h-[45vh] overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                  {historicoExibir.map((item, index) =>
              <div
                key={item.id || index}
                onClick={() => handleEdit(item)}
                className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all group relative cursor-pointer"
                title="Clique para carregar este relatório">
                
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded uppercase tracking-wide border border-gray-100">
                          {item.data}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="p-1.5 text-teal-600 text-xs font-medium flex items-center gap-1">
                            <CopyIcon className="w-3 h-3" /> Carregar
                          </span>
                        </div>
                      </div>

                      <p className="text-sm font-medium text-gray-800 mb-1">
                        {tipos.find((t) => t.id === item.tipo)?.nome ||
                  item.tipo}
                      </p>

                      {item.destinatario &&
                <p className="text-xs text-gray-600 mb-1.5 truncate">
                          Para: {item.destinatario}
                        </p>
                }

                      {item.medico &&
                <p className="text-[10px] text-gray-500 flex items-center gap-1.5 border-t border-gray-50 pt-1.5 mt-1.5">
                          {item.medico}
                        </p>
                }
                    </div>
              )}
                </div> :

            <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ClockIcon className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">
                    Nenhum histórico disponível
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Os relatórios anteriores aparecerão aqui.
                  </p>
                </div>
            }
            </Card>

            {/* Dicas */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-100 shadow-sm">
              <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                <div className="p-1 bg-blue-100 rounded-md">
                  <FileTextIcon className="w-3.5 h-3.5 text-blue-700" />
                </div>
                Dicas de Preenchimento
              </h4>
              <ul className="text-xs text-blue-800 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>
                    Selecione um <strong>tipo de relatório</strong> para
                    carregar um template.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>
                    Substitua os campos <strong>[NOME]</strong> e{' '}
                    <strong>[DATA]</strong> pelos dados do paciente.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>
                    Use <strong>Padrões</strong> para salvar e reutilizar
                    relatórios frequentes.
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        }
      </div>

      <PadroesRelatorioModal
        isOpen={showPadroesModal}
        onClose={() => setShowPadroesModal(false)}
        currentData={formData}
        clinicaId={
        clinicaId ||
        (() => {
          try {
            const s = localStorage.getItem('sessao');
            return s ? JSON.parse(s).clinicaAtual?.id || 'default' : 'default';
          } catch {
            return 'default';
          }
        })()
        }
        profissionalId={
        profissionalId || profissionalDoProntuario?.id || undefined
        }
        onSelect={(padraoData) => {
          const newData = {
            ...formData,
            ...padraoData
          };
          setFormData(newData);
          setHasChanges(true);
          setIsNew(false);
          onChange?.(newData);
        }} />
      
    </div>);

}