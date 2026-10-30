import React, { useEffect, useState, useRef, Component } from 'react';
import {
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  PrinterIcon,
  PlusIcon,
  AlertCircleIcon,
  UserIcon,
  CalendarIcon,
  ClockIcon as TimeIcon,
  SearchIcon,
  XIcon,
  Edit3Icon,
  StethoscopeIcon,
  RefreshCwIcon } from
'lucide-react';
import { Button } from '../../ui/Button';
import {
  resolverEspecialidade,
  resolverConselho } from
'../../../utils/especialidadeHelper';
import { API_BASE_URL } from '../../../config/api';
import {
  cssDocumentoPaginado,
  cssQuebrasPagina,
  faixaIdentificacao } from
'../../../utils/documentoImpressao';
import { Loader2Icon } from 'lucide-react';
interface AtestadoItem {
  id: string;
  dataEmissao: string;
  usuario: string;
  dataReferencia: string;
  cid10: string;
  horaChegada: string;
  horaSaida: string;
  qtdeDias: number;
  solicitante: string;
  // ⭐ Campos extras para edição completa
  medico?: string;
  finalidadePresenca?: string;
  outrosComunicamos?: string;
}
interface AtestadoData {
  medico: string;
  dataReferencia: string;
  solicitante: string;
  horaChegada: string;
  horaSaida: string;
  finalidadePresenca: string;
  outrosComunicamos: string;
  cid10: string;
  qtdeDias: number;
}
interface AtestadoEtapaProps {
  data?: AtestadoData;
  historico?: AtestadoItem[];
  medicos?: {
    id: string;
    nome: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
  }[];
  onChange?: (data: AtestadoData) => void;
  onSave?: (data: AtestadoData) => void;
  readOnly?: boolean;
  /** Há alterações não salvas (rascunho restaurado ou texto de outra aba): Salvar já começa habilitado. */
  naoSalvo?: boolean;
  // ⭐ NOVO: Profissional do prontuário (para auto-preencher e impressão)
  profissionalDoProntuario?: {
    id?: string;
    nome?: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
  };
  // ⭐ Callback para selecionar um atestado do histórico (editar)
  onSelectHistorico?: (item: AtestadoItem) => void;
  // ⭐ Permite a página limpar o registro atual antes de iniciar outro.
  onNew?: () => void;
  // ⭐ Nome do paciente (para nome do arquivo PDF)
  pacienteNome?: string;
}
// Opções de finalidade da presença
const FINALIDADES_PRESENCA = [
{
  id: 'consulta',
  nome: 'Consulta'
},
{
  id: 'exame',
  nome: 'Exame'
},
{
  id: 'procedimento',
  nome: 'Procedimento'
},
{
  id: 'retorno',
  nome: 'Retorno'
},
{
  id: 'acompanhante',
  nome: 'Acompanhante'
},
{
  id: 'outros',
  nome: 'Outros'
}];

// Opções de comunicado (nova lei)
const OPCOES_COMUNICADO = [
{
  id: 'pode_voltar',
  nome: 'Pode voltar ao trabalho em seguida'
},
{
  id: 'afastamento_1',
  nome: 'Necessita afastamento de 1 dia'
},
{
  id: 'afastamento_2',
  nome: 'Necessita afastamento de 2 dias'
},
{
  id: 'afastamento_3',
  nome: 'Necessita afastamento de 3 dias'
},
{
  id: 'afastamento_mais',
  nome: 'Necessita afastamento por período maior'
},
{
  id: 'repouso_domiciliar',
  nome: 'Recomenda-se repouso domiciliar'
},
{
  id: 'restricao_atividades',
  nome: 'Restrição de atividades físicas'
}];

export function AtestadoEtapa({
  data,
  historico = [],
  medicos = [],
  onChange,
  onSave,
  readOnly = false,
  naoSalvo = false,
  profissionalDoProntuario,
  onSelectHistorico,
  onNew,
  pacienteNome
}: AtestadoEtapaProps) {
  const hoje = new Date().toISOString().split('T')[0];
  const horaAtual = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const [formData, setFormData] = useState<AtestadoData>({
    medico: data?.medico || profissionalDoProntuario?.nome || '',
    dataReferencia: data?.dataReferencia || hoje,
    solicitante: data?.solicitante || '',
    horaChegada: data?.horaChegada || '08:00',
    horaSaida: data?.horaSaida || horaAtual,
    finalidadePresenca: data?.finalidadePresenca || 'consulta',
    outrosComunicamos: data?.outrosComunicamos || 'pode_voltar',
    cid10: data?.cid10 || '',
    qtdeDias: data?.qtdeDias || 0
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(naoSalvo);
  const [showCidDropdown, setShowCidDropdown] = useState(false);
  const [cidSearch, setCidSearch] = useState('');
  // ⭐ Busca CID-10 na API (igual ao DiagnosticoEtapa) — NÃO usa lista hardcoded.
  // Isso garante que qualquer CID importado (ex.: K081) seja encontrado aqui.
  const [cidResultados, setCidResultados] = useState<
    {
      codigo: string;
      descricao: string;
    }[]>(
    []);
  const [cidLoading, setCidLoading] = useState(false);
  // Cache de descrições já vistas, para exibir nas tags selecionadas.
  const [cidDescricoes, setCidDescricoes] = useState<Record<string, string>>({});
  // ⭐ NOVO: ID do atestado selecionado no histórico
  const [selectedHistoricoId, setSelectedHistoricoId] = useState<string | null>(
    null
  );
  // ⭐ FIX: Usa lista real de médicos — sem mock data
  const medicosList = medicos;
  // Mock de histórico para visualização
  const historicoExibir = historico.length > 0 ? historico : [];
  // ⭐ Auto-preenche médico do prontuário quando disponível e campo está vazio
  useEffect(() => {
    if (profissionalDoProntuario?.nome && !formData.medico) {
      const newData = {
        ...formData,
        medico: profissionalDoProntuario.nome
      };
      setFormData(newData);
      onChange?.(newData);
    }
  }, [profissionalDoProntuario?.nome]);
  // Atualiza quando data externa muda, preservando o profissional responsável
  // que já é exibido no atestado quando o registro salvo ainda não tiver médico.
  useEffect(() => {
    if (data) {
      setFormData({
        ...data,
        medico: data.medico || profissionalDoProntuario?.nome || ''
      });
    }
  }, [data, profissionalDoProntuario?.nome]);
  const handleChange = (field: keyof AtestadoData, value: any) => {
    const newData = {
      ...formData,
      [field]: value
    };
    // Calcula quantidade de dias automaticamente baseado no comunicado
    if (field === 'outrosComunicamos') {
      if (value === 'pode_voltar') newData.qtdeDias = 0;else
      if (value === 'afastamento_1') newData.qtdeDias = 1;else
      if (value === 'afastamento_2') newData.qtdeDias = 2;else
      if (value === 'afastamento_3') newData.qtdeDias = 3;
    }
    setFormData(newData);
    setHasChanges(true);
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
    const newData: AtestadoData = {
      medico: profissionalDoProntuario?.nome || medicosList[0]?.nome || '',
      dataReferencia: hoje,
      solicitante: '',
      horaChegada: '08:00',
      horaSaida: horaAtual,
      finalidadePresenca: 'consulta',
      outrosComunicamos: 'pode_voltar',
      cid10: '',
      qtdeDias: 0
    };
    setSelectedHistoricoId(null);
    setCidSearch('');
    setCidResultados([]);
    setFormData(newData);
    setHasChanges(false);
    onChange?.(newData);
    onNew?.();
  };
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    return lastSaved.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  // ⭐ Busca CID-10 na API com debounce (substitui o filtro local de CID_SUGESTOES).
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
          // Memoriza descrições para mostrar nas tags
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
  // Resultados disponíveis = os da API que ainda não foram selecionados.
  const filteredCids = cidResultados.filter(
    (cid) =>
    !(formData.cid10 || '').
    split(',').
    map((c) => c.trim().toUpperCase()).
    includes(cid.codigo.toUpperCase())
  );
  // ⭐ NOVO: Selecionar atestado do histórico para edição
  const handleSelectHistorico = (item: AtestadoItem) => {
    setSelectedHistoricoId(item.id);
    // Carrega dados do item no formulário
    const newData: AtestadoData = {
      medico: item.medico || item.usuario || '',
      dataReferencia: item.dataReferencia || hoje,
      solicitante: item.solicitante || '',
      horaChegada: item.horaChegada || '08:00',
      horaSaida: item.horaSaida || '',
      finalidadePresenca: item.finalidadePresenca || 'consulta',
      outrosComunicamos: item.outrosComunicamos || 'pode_voltar',
      cid10: item.cid10 || '',
      qtdeDias: item.qtdeDias || 0
    };
    setFormData(newData);
    setHasChanges(false);
    onChange?.(newData);
    onSelectHistorico?.(item);
    // Scroll para o topo do formulário
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };
  // ⭐ NOVO: Imprimir um atestado específico do histórico
  const handlePrintItem = (item: AtestadoItem) => {
    // ⭐ FIX: Passa dados diretamente para handlePrint (sem depender de state/closure)
    const tempData: AtestadoData = {
      medico: item.medico || item.usuario || '',
      dataReferencia: item.dataReferencia || hoje,
      solicitante: item.solicitante || '',
      horaChegada: item.horaChegada || '08:00',
      horaSaida: item.horaSaida || '',
      finalidadePresenca: item.finalidadePresenca || 'consulta',
      outrosComunicamos: item.outrosComunicamos || 'pode_voltar',
      cid10: item.cid10 || '',
      qtdeDias: item.qtdeDias || 0
    };
    handlePrint(tempData);
  };
  // ⭐ Geração de PDF profissional do atestado (Lei 14.724/2023)
  const handlePrint = (dadosOverride?: AtestadoData) => {
    const dados = dadosOverride || formData;
    const dataFormatada = dados.dataReferencia ?
    new Date(dados.dataReferencia + 'T12:00:00').toLocaleDateString('pt-BR') :
    new Date().toLocaleDateString('pt-BR');
    const finalidadeNome =
    FINALIDADES_PRESENCA.find((f) => f.id === dados.finalidadePresenca)?.
    nome ||
    dados.finalidadePresenca ||
    'Consulta';
    const comunicadoNome =
    OPCOES_COMUNICADO.find((o) => o.id === dados.outrosComunicamos)?.nome ||
    dados.outrosComunicamos ||
    'Pode voltar ao trabalho em seguida';
    // Dados da clínica do localStorage
    let clinicaNome = '',
      clinicaEndereco = '',
      clinicaTelefone = '',
      clinicaEmail = '',
      clinicaCnpj = '',
      clinicaLogoUrl = '';
    // ⭐ CORRIGIDO: Dados do profissional vêm do prontuário, NUNCA do usuário logado
    let profissionalNome = '',
      profissionalCrm = '',
      profissionalEspecialidade = '',
      prefixoConselho = 'CRM',
      profissionalTitulo = '',
      profissionalCabecalho = '',
      profissionalRqes: Array<{
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
      }
    } catch {

      /* ignore */}
    // ⭐ CORRIGIDO: PRIORIDADE: profissionalDoProntuario > médico selecionado no
    // formulário (resolvido na lista `medicos`, que carrega crm/uf/tipo) > NUNCA localStorage.
    // Isto garante que "CRM 12345"/"CRO 12345" apareça MESMO quando o profissional
    // foi escolhido no dropdown do formulário em vez de vinculado à consulta.
    let profEfetivo: {
      nome?: string;
      crm?: string;
      uf?: string;
      tipo?: string;
      especialidade?: string;
      especialidades?: string;
      titulo?: string;
      cabecalhoRelatorio?: string;
      rqes?: any;
    } | null = profissionalDoProntuario ?
    {
      ...profissionalDoProntuario
    } :
    null;
    if ((!profEfetivo || !profEfetivo.crm) && dados.medico) {
      const mSel = medicos.find((m) => m.nome === dados.medico);
      if (mSel) {
        profEfetivo = {
          nome: profEfetivo?.nome || mSel.nome,
          crm: profEfetivo?.crm || mSel.crm,
          uf: profEfetivo?.uf || mSel.uf,
          tipo: profEfetivo?.tipo || mSel.tipo,
          especialidade: profEfetivo?.especialidade || mSel.especialidade,
          especialidades: profEfetivo?.especialidades || mSel.especialidades,
          titulo: (profEfetivo as any)?.titulo,
          cabecalhoRelatorio: (profEfetivo as any)?.cabecalhoRelatorio,
          rqes: (profEfetivo as any)?.rqes
        };
      }
    }
    if (profEfetivo) {
      profissionalNome = profEfetivo.nome || '';
      profissionalCrm = profEfetivo.crm || '';
      if (profEfetivo.uf && profissionalCrm)
      profissionalCrm = profissionalCrm + '/' + profEfetivo.uf;
      // ⭐ FIX: Resolve IDs de especialidade (ex: ["11","15"]) para nomes legíveis
      profissionalEspecialidade = resolverEspecialidade(
        profEfetivo.especialidade,
        profEfetivo.especialidades
      );
      // ⭐ FIX: CRO para dentista (por tipo OU especialidade odontológica)
      prefixoConselho = resolverConselho(
        profEfetivo.tipo,
        profEfetivo.especialidade,
        profEfetivo.especialidades,
        profEfetivo.crm
      );
      // ⭐ NOVO: Extrai titulo, cabecalhoRelatorio e RQEs do profissional
      const rawTitulo = (profEfetivo as any).titulo || '';
      // Sanitiza: se vier como array ou JSON, extrai string limpa
      if (typeof rawTitulo === 'string') {
        try {
          const parsed = JSON.parse(rawTitulo);
          profissionalTitulo = Array.isArray(parsed) ?
          parsed[0] || '' :
          String(parsed);
        } catch {
          profissionalTitulo = rawTitulo;
        }
      } else if (Array.isArray(rawTitulo)) {
        profissionalTitulo = rawTitulo[0] || '';
      } else {
        profissionalTitulo = String(rawTitulo || '');
      }
      profissionalCabecalho = (profEfetivo as any).cabecalhoRelatorio || '';
      try {
        const rawRqes = (profEfetivo as any).rqes;
        const parsed =
        typeof rawRqes === 'string' ? JSON.parse(rawRqes) : rawRqes;
        if (Array.isArray(parsed))
        profissionalRqes = parsed.filter((r: any) => r.especialidade && r.rqe);
      } catch {

        /* ignore */}
    } else if (dados.medico) {
      // ⭐ CORRIGIDO: Usa o nome selecionado no formulário, NÃO o usuário logado
      profissionalNome = dados.medico;
      // Sem CRM/UF disponível neste fallback
    }
    // ⭐ REMOVIDO: Fallback para localStorage que causava "Admin Sistema" no PDF
    const logoHtml = clinicaLogoUrl ?
    '<img src="' +
    clinicaLogoUrl +
    '" alt="Logo" style="max-height:70px;max-width:110px;object-fit:contain;border-radius:6px;" />' :
    '';
    const cidCodes = dados.cid10 ?
    dados.cid10.
    split(',').
    map((c) => c.trim()).
    filter(Boolean) :
    [];
    const cidHtml =
    cidCodes.length > 0 ?
    '<div class="info-row"><span class="info-label">CID-10:</span> <span class="info-value">' +
    cidCodes.join(', ') +
    '</span></div>' :
    '';
    const h: string[] = [];
    h.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">');
    h.push('<title>Atestado Médico</title>');
    const styleTag = '<sty' + 'le>';
    const styleCloseTag = '</sty' + 'le>';
    h.push(styleTag);
    h.push('@page { size: A4; margin: 0; }');
    h.push('* { margin: 0; padding: 0; box-sizing: border-box; }');
    h.push(
      'body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }'
    );
    // Documento de várias páginas com cabeçalho e rodapé repetidos em todas
    // as folhas (ver utils/documentoImpressao).
    h.push(cssDocumentoPaginado());
    h.push(cssQuebrasPagina('.body'));
    h.push(
      '.header { background: #edf3fb; border-bottom: 3px solid #3b82f6; padding: 20px 28px; display: flex; align-items: center; gap: 20px; }'
    );
    h.push(
      '.header-logo { flex-shrink: 0; width: 100px; display: flex; align-items: center; justify-content: center; }'
    );
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
    h.push('.header-crm { flex-shrink: 0; width: 100px; text-align: right; }');
    h.push('.header-crm .label { font-size: 9px; color: #64748b; }');
    h.push(
      '.header-crm .numero { font-size: 15px; font-weight: bold; color: #1e3a5f; }'
    );
    h.push('.body { padding: 20px 28px 26px; }');
    h.push(
      '.doc-title { font-size: 18px; font-weight: bold; color: #1e3a5f; border-bottom: 3px solid #3b82f6; padding-bottom: 6px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; text-align: center; }'
    );
    h.push(
      '.lei-ref { font-size: 9px; color: #64748b; text-align: center; margin-bottom: 16px; font-style: italic; }'
    );
    h.push(
      '.info-block { background: #f8fafc; padding: 12px 14px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-bottom: 18px; font-size: 11px; line-height: 2; }'
    );
    h.push('.info-row { margin-bottom: 2px; }');
    h.push('.info-label { font-weight: bold; color: #0f172a; }');
    h.push('.info-value { color: #334155; }');
    h.push(
      '.conteudo { font-size: 12px; color: #1e293b; line-height: 1.8; text-align: justify; margin-top: 16px; }'
    );
    h.push(
      '.destaque { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 12px; }'
    );
    h.push('.destaque strong { color: #1e40af; }');
    h.push(
      '.assinatura { margin-top: 50px; text-align: center; page-break-inside: avoid; }'
    );
    h.push(
      '.assinatura-linha { border-top: 1px solid #1e3a5f; width: 280px; margin: 0 auto 8px; }'
    );
    h.push(
      '.assinatura-nome { font-size: 14px; font-weight: bold; color: #1e293b; }'
    );
    h.push('.assinatura-crm { font-size: 12px; color: #475569; }');
    h.push('.assinatura-esp { font-size: 11px; color: #64748b; }');
    h.push(
      '.footer { background: #edf3fb; border-top: 3px solid #3b82f6; padding: 12px 28px; text-align: center; font-size: 9px; color: #475569; line-height: 1.5; }'
    );
    h.push(
      '.footer .nome { font-size: 13px; font-weight: bold; color: #1e3a5f; margin-bottom: 2px; }'
    );
    h.push('.footer .cnpj { font-size: 8px; color: #64748b; }');
    h.push(
      '.data-impressao { font-size: 10px; color: #475569; text-align: right; margin-bottom: 12px; font-weight: 700; }'
    );
    h.push('.data-impressao strong { font-weight: 700; }');
    h.push(
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc { margin: 0; } }'
    );
    h.push(styleCloseTag);
    h.push('</head><body>');
    // Cabeçalho (thead) — repetido em todas as páginas
    h.push('<table class="doc"><thead><tr><td>');
    h.push('<div class="header">');
    if (logoHtml) h.push('<div class="header-logo">' + logoHtml + '</div>');
    h.push('<div class="header-center">');
    // ⭐ NOVO: Usa titulo do cadastro do profissional ao invés de 'Dr(a).' hardcoded
    const tituloDisplay = profissionalTitulo ? profissionalTitulo + ' ' : '';
    h.push(
      '<h1>' + (
      profissionalNome ?
      tituloDisplay + profissionalNome :
      clinicaNome || 'Atestado Médico') +
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
    if (profissionalCrm)
    h.push(
      '<div class="header-crm"><div class="label">' +
      prefixoConselho +
      '</div><div class="numero">' +
      profissionalCrm +
      '</div></div>'
    );
    h.push('</div>');
    h.push(
      faixaIdentificacao(pacienteNome, 'Atestado Médico', dataFormatada)
    );
    h.push('</td></tr></thead>');
    // Rodapé (tfoot) — declarado antes do corpo para repetir em cada página
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
    h.push('<tbody><tr><td>');
    h.push('<div class="body">');
    h.push(
      '<div class="data-impressao" style="font-weight:700;"><strong style="font-weight:700;">Impresso em ' +
      new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) +
      '</strong></div>'
    );
    h.push('<div class="doc-title">Declaração/Atestado Médico</div>');
    h.push(
      '<div class="lei-ref">Conforme Lei nº 14.724/2023 — Padronização Nacional de Atestados Médicos</div>'
    );
    // ⭐ FIX: Dados do paciente
    if (pacienteNome) {
      h.push('<div class="info-block">');
      h.push(
        '<div class="info-row"><span class="info-label">Paciente:</span> <span class="info-value">' +
        pacienteNome.toUpperCase() +
        '</span></div>'
      );
      h.push('</div>');
    }
    // Info block
    h.push('<div class="info-block">');
    h.push(
      '<div class="info-row"><span class="info-label">Médico(a) Responsável:</span> <span class="info-value">' + (
      profissionalNome || dados.medico || 'Não informado') +
      '</span></div>'
    );
    // ⭐ Registro no conselho (CRM 12345 ou CRO 12345, conforme o profissional)
    if (profissionalCrm)
    h.push(
      '<div class="info-row"><span class="info-label">Conselho Profissional:</span> <span class="info-value">' +
      prefixoConselho +
      ' ' +
      profissionalCrm +
      '</span></div>'
    );
    h.push(
      '<div class="info-row"><span class="info-label">Data de Referência:</span> <span class="info-value">' +
      dataFormatada +
      '</span></div>'
    );
    h.push(
      '<div class="info-row"><span class="info-label">Hora de Chegada:</span> <span class="info-value">' + (
      dados.horaChegada || '--:--') +
      '</span></div>'
    );
    h.push(
      '<div class="info-row"><span class="info-label">Hora de Saída:</span> <span class="info-value">' + (
      dados.horaSaida || '--:--') +
      '</span></div>'
    );
    h.push(
      '<div class="info-row"><span class="info-label">Finalidade da Presença:</span> <span class="info-value">' +
      finalidadeNome +
      '</span></div>'
    );
    h.push(
      '<div class="info-row"><span class="info-label">Solicitante:</span> <span class="info-value">' + (
      dados.solicitante || 'Não informado') +
      '</span></div>'
    );
    if (cidHtml) h.push(cidHtml);
    if (dados.qtdeDias > 0)
    h.push(
      '<div class="info-row"><span class="info-label">Dias de Afastamento:</span> <span class="info-value">' +
      dados.qtdeDias +
      ' dia(s)</span></div>'
    );
    h.push('</div>');
    // Comunicado
    h.push('<div class="destaque">');
    h.push('<strong>Outros sim, comunicamos que:</strong> ' + comunicadoNome);
    if (dados.qtdeDias > 0)
    h.push(
      '<br/><strong>Período de afastamento:</strong> ' +
      dados.qtdeDias +
      ' dia(s)'
    );
    h.push('</div>');
    // Assinatura
    h.push('<div class="assinatura">');
    h.push('<div class="assinatura-linha"></div>');
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
      const nomeArquivo = `Atestado_${pacienteNome?.replace(/\s+/g, '_') || 'Paciente'}_${dataFormatada.replace(/\//g, '-')}.pdf`;
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
              Atestado
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Padrão Lei 14.724/2023 — campos obrigatórios inclusos
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Status de salvamento */}
            <div className="flex items-center mr-2">
              {isSaving ?
              <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                  <RefreshCwIcon className="w-3 h-3 animate-spin" />
                  Salvando...
                </span> :
              lastSaved ?
              <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                  <CheckCircleIcon className="w-3 h-3" />
                  Salvo às {formatLastSaved()}
                </span> :
              hasChanges ?
              <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                  <ClockIcon className="w-3 h-3" />
                  Não salvo
                </span> :
              null}
            </div>

            {!readOnly &&
            <Button
              variant="outline"
              size="sm"
              onClick={handleNovo}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              
                <PlusIcon className="w-4 h-4 mr-2" />
                Novo Atestado
              </Button>
            }

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrint()}
              disabled={!formData.horaChegada && !formData.cid10}
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              
              <PrinterIcon className="w-4 h-4 mr-2" />
              Imprimir
            </Button>

            {!readOnly &&
            <Button
              size="sm"
              onClick={handleSave}
              data-salvar-etapa
              title="Salvar (Ctrl+S)"
              disabled={isSaving || !hasChanges}
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow transition-all">
              
                <SaveIcon className="w-4 h-4 mr-2" />
                Salvar
              </Button>
            }
          </div>
        </div>
      </div>

      {/* ===== CONTEÚDO SCROLLÁVEL ===== */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        {/* Aviso sobre a nova lei */}
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-900">
                Novo Padrão de Atestado Médico (Lei 14.724/2023)
              </p>
              <p className="text-[10px] text-blue-700 mt-0.5 leading-tight">
                Este formulário segue o padrão estabelecido pela nova legislação
                que padroniza os atestados médicos em todo o território
                nacional, incluindo campos obrigatórios como horário de
                chegada/saída e finalidade da presença.
              </p>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div className="space-y-3">
          {/* Médico */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Médico
            </label>
            {profissionalDoProntuario ?
            <div className="w-full px-3 py-2 bg-teal-50 border border-teal-200 rounded-md text-sm text-teal-800 font-medium flex items-center gap-2">
                <StethoscopeIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                {profissionalDoProntuario.nome}
                {profissionalDoProntuario.crm &&
              <span className="text-xs text-teal-600 ml-auto">
                    {resolverConselho(
                  profissionalDoProntuario.tipo,
                  profissionalDoProntuario.especialidade,
                  profissionalDoProntuario.especialidades,
                  profissionalDoProntuario.crm
                )}{' '}
                    {profissionalDoProntuario.crm}
                    {profissionalDoProntuario.uf ?
                '/' + profissionalDoProntuario.uf :
                ''}
                  </span>
              }
              </div> :

            <div className="relative">
                <select
                value={formData.medico}
                onChange={(e) => handleChange('medico', e.target.value)}
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md p-2 pr-8 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed">
                
                  <option value="">Selecione o médico...</option>
                  {medicosList.map((m) =>
                <option key={m.id} value={m.nome}>
                      {m.nome}
                    </option>
                )}
                </select>
                {formData.medico &&
              <button
                onClick={() => handleChange('medico', '')}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
              }
              </div>
            }
          </div>

          {/* Linha: Data de Referência, Solicitante, Hora Chegada, Hora Saída, Finalidade */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Data de Referência */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Data de Referência:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.dataReferencia}
                  onChange={(e) =>
                  handleChange('dataReferencia', e.target.value)
                  }
                  disabled={readOnly}
                  className="w-full border border-gray-200 rounded-md p-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" />
                
              </div>
            </div>

            {/* Solicitante */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Solicitante:
              </label>
              <input
                type="text"
                value={formData.solicitante}
                onChange={(e) => handleChange('solicitante', e.target.value)}
                placeholder="Solicitante caso não seja o paciente..."
                disabled={readOnly}
                className="w-full border border-amber-300 bg-amber-50/30 rounded-md p-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" />
              
            </div>

            {/* Hora da chegada */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Hora da chegada:
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={formData.horaChegada}
                  onChange={(e) => handleChange('horaChegada', e.target.value)}
                  disabled={readOnly}
                  className="w-full border border-gray-200 rounded-md p-2 pr-8 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" />
                

                <TimeIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Hora da saída */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Hora da saída:
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={formData.horaSaida}
                  onChange={(e) => handleChange('horaSaida', e.target.value)}
                  disabled={readOnly}
                  className="w-full border border-gray-200 rounded-md p-2 pr-8 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" />
                

                <TimeIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Finalidade da presença */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Finalidade da presença:
              </label>
              <select
                value={formData.finalidadePresenca}
                onChange={(e) =>
                handleChange('finalidadePresenca', e.target.value)
                }
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md p-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed">
                
                {FINALIDADES_PRESENCA.map((f) =>
                <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Outros sim, comunicamos que: */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Outros sim, comunicamos que:
              </label>
              <select
                value={formData.outrosComunicamos}
                onChange={(e) =>
                handleChange('outrosComunicamos', e.target.value)
                }
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md p-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed">
                
                {OPCOES_COMUNICADO.map((o) =>
                <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                )}
              </select>
            </div>

            {/* CID 10 — tags removíveis */}
            <div className="p-3 bg-gray-50 rounded-md border border-gray-100">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                CID 10 (pode adicionar múltiplos)
              </label>

              {/* Tags selecionadas */}
              {formData.cid10 &&
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {formData.cid10.
                split(',').
                map((c) => c.trim()).
                filter(Boolean).
                map((codigo, idx) => {
                  const desc = cidDescricoes[codigo.toUpperCase()] || '';
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-800 text-[10px] font-medium rounded-full border border-teal-200"
                      title={desc || codigo}>
                      
                          <span className="font-bold">{codigo}</span>
                          {desc &&
                      <span className="text-teal-600 max-w-[150px] truncate">
                              {desc}
                            </span>
                      }
                          {!readOnly &&
                      <button
                        type="button"
                        onClick={() => {
                          const codes = formData.cid10.
                          split(',').
                          map((c) => c.trim()).
                          filter(Boolean);
                          codes.splice(idx, 1);
                          handleChange('cid10', codes.join(','));
                        }}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-teal-200 transition-colors">
                        
                              <svg
                          className="w-3 h-3"
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
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <SearchIcon className="w-4 h-4 text-gray-400 ml-3" />
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
                        const codes = formData.cid10 ?
                        formData.cid10.
                        split(',').
                        map((c) => c.trim()).
                        filter(Boolean) :
                        [];
                        codes.push(cidSearch.trim().toUpperCase());
                        handleChange('cid10', codes.join(','));
                        setCidSearch('');
                        setShowCidDropdown(false);
                      }
                    }}
                    placeholder="Buscar CID por código ou descrição..."
                    disabled={readOnly}
                    className="w-full p-3 focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed" />
                  
                </div>

                {showCidDropdown &&
                !readOnly &&
                cidSearch.trim().length >= 2 &&
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {cidLoading ?
                  <div className="px-4 py-3 text-gray-500 text-sm flex items-center gap-2">
                          <Loader2Icon className="w-4 h-4 animate-spin" />
                          Buscando...
                        </div> :
                  filteredCids.length > 0 ?
                  filteredCids.map((cid) =>
                  <button
                    key={cid.codigo}
                    onClick={() => {
                      const codes = formData.cid10 ?
                      formData.cid10.
                      split(',').
                      map((c) => c.trim()).
                      filter(Boolean) :
                      [];
                      codes.push(cid.codigo);
                      handleChange('cid10', codes.join(','));
                      setCidSearch('');
                      setCidResultados([]);
                      setShowCidDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-teal-50 transition-colors flex items-center gap-2">
                    
                            <span className="text-teal-600 font-medium text-sm font-mono">
                              {cid.codigo}
                            </span>
                            <span className="text-gray-600 text-sm truncate">
                              {cid.descricao}
                            </span>
                          </button>
                  ) :

                  <div className="px-4 py-3 text-gray-500 text-sm">
                          Nenhum CID encontrado. Verifique se a tabela CID-10
                          foi importada.
                        </div>
                  }
                    </div>
                }
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Busque e selecione, ou digite e pressione Enter.
              </p>
            </div>
          </div>

          {/* Tabela de Histórico */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileTextIcon className="w-4 h-4 text-teal-600" />
                Histórico de Atestados
              </h3>
              {selectedHistoricoId &&
              <button
                onClick={() => {
                  setSelectedHistoricoId(null);
                  handleNovo();
                }}
                className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1">
                
                  <PlusIcon className="w-3.5 h-3.5" />
                  Novo atestado
                </button>
              }
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Dê duplo clique em uma linha para editar, ou use os botões de
              ação.
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Data de emissão
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Usuário
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Data de referência
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      CID 10
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Chegada
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Saída
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Dias
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Solicitante
                    </th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historicoExibir.length === 0 ?
                  <tr>
                      <td
                      colSpan={9}
                      className="py-8 text-center text-gray-400 text-sm">
                      
                        Nenhum registro encontrado
                      </td>
                    </tr> :

                  historicoExibir.map((item, index) =>
                  <tr
                    key={item.id || index}
                    className={`border-b border-gray-100 cursor-pointer transition-all ${selectedHistoricoId === item.id ? 'bg-teal-50 border-l-4 border-l-teal-500' : 'hover:bg-gray-50'}`}
                    onDoubleClick={() => handleSelectHistorico(item)}
                    title="Duplo clique para editar este atestado">
                    
                        <td className="py-3 px-3 text-sm text-gray-600">
                          {item.dataEmissao ?
                      new Date(
                        item.dataEmissao + 'T12:00:00'
                      ).toLocaleDateString('pt-BR') :
                      '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-700 font-medium">
                          {item.usuario || '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-600">
                          {item.dataReferencia ?
                      new Date(
                        item.dataReferencia + 'T12:00:00'
                      ).toLocaleDateString('pt-BR') :
                      '-'}
                        </td>
                        <td className="py-3 px-3 text-sm">
                          {item.cid10 ?
                      <span className="inline-flex items-center px-2 py-0.5 bg-teal-50 text-teal-700 text-xs font-medium rounded-full border border-teal-200">
                              {item.cid10}
                            </span> :

                      <span className="text-gray-400">-</span>
                      }
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-600">
                          {item.horaChegada || '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-600">
                          {item.horaSaida || '-'}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-600">
                          {item.qtdeDias || 0}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-600">
                          {item.solicitante || '-'}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectHistorico(item);
                          }}
                          className="p-1.5 text-teal-600 hover:bg-teal-100 rounded-md transition-colors"
                          title="Editar este atestado">
                          
                              <Edit3Icon className="w-4 h-4" />
                            </button>
                            <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintItem(item);
                          }}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
                          title="Imprimir este atestado">
                          
                              <PrinterIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                  )
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>);

}