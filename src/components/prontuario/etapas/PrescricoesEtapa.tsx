import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  PrinterIcon,
  PillIcon,
  TrashIcon,
  SearchIcon,
  Loader2Icon,
  FileTextIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  StethoscopeIcon,
  CopyIcon,
  FlaskConicalIcon,
  TagIcon } from
'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import {
  resolverEspecialidade,
  resolverConselho } from
'../../../utils/especialidadeHelper';
import { MemedEtapa } from './MemedEtapa';
import { PadroesPrescricaoModal } from './PadroesPrescricaoModal';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useDebounce } from '../../../hooks/useDebounce';
import { useDialog } from '../../../hooks/useDialog';
import { EditorDocumento } from '../EditorDocumento';
import {
  paraHtml,
  paraHtmlImpressao,
  paraTextoSimples } from
'../../../utils/htmlTexto';
import {
  cssDocumentoPaginado,
  cssQuebrasPagina,
  faixaIdentificacao } from
'../../../utils/documentoImpressao';
import {
  MODELOS_RECEITUARIO,
  gerarHtmlReceituarioControlado,
  validarReceituario,
  type CampoPendente,
  type TipoReceituario } from
'../../../utils/receituarioControlado';

/** Preferência de exibição do painel lateral (Histórico / Dicas) */
const CHAVE_PAINEL_PRESCRICOES = 'prescricoes:painelVisivel';
interface MedicamentoItem {
  id: string;
  remedioId?: string;
  nome: string;
  dosagem: string;
  quantidade: string;
  unidade: string;
  posologia: string;
  tipo?: 'medicamento' | 'formula';
}
interface PrescricaoItem {
  id: string;
  data: string;
  prescricao: string;
  descricao?: string;
  medico: string;
  profissionalId?: string;
  medicamentos: MedicamentoItem[];
  controleEspecial?: boolean;
  generico?: string;
}
interface MedicamentoAPI {
  id: string;
  nome: string;
  principioAtivo: string;
  concentracao: string;
  formaFarmaceutica: string;
  fabricante: string;
  tarja: string;
}
interface PrescricaoData {
  controleEspecial: boolean;
  data: string;
  descricao: string;
  generico: string;
  medicamentos: MedicamentoItem[];
}
interface PrescricoesEtapaProps {
  data?: PrescricaoData;
  historico?: PrescricaoItem[];
  onChange?: (data: PrescricaoData) => void;
  onSave?: (data: PrescricaoData) => void;
  readOnly?: boolean;
  /** Há alterações não salvas (rascunho restaurado ou texto de outra aba): Salvar já começa habilitado. */
  naoSalvo?: boolean;
  clinicaId?: string;
  profissional?: any;
  profissionalCompleto?: any;
  memedConfig?: any;
  onAbrirMemed?: () => void;
  onConfigurarMemed?: () => void;
  onMemedStatusChange?: () => void;
  onNavigateUsuarios?: () => void;
  // ⭐ Dados do paciente para impressão (obrigatório em controle especial)
  pacienteNome?: string;
  pacienteCpf?: string;
  pacienteEndereco?: string;
  pacienteDataNascimento?: string;
  pacienteTelefone?: string;
  /**
   * Profissional responsável gravado no cadastro do paciente. Usado como
   * padrão quando o atendimento ainda não tem profissional definido.
   */
  pacienteProfissionalResponsavelId?: string;
}
export function PrescricoesEtapa({
  data,
  historico = [],
  onChange,
  onSave,
  readOnly = false,
  naoSalvo = false,
  clinicaId,
  profissional,
  profissionalCompleto,
  memedConfig,
  onAbrirMemed,
  onConfigurarMemed,
  onMemedStatusChange,
  onNavigateUsuarios,
  pacienteNome,
  pacienteCpf,
  pacienteEndereco,
  pacienteDataNascimento,
  pacienteTelefone,
  pacienteProfissionalResponsavelId
}: PrescricoesEtapaProps) {
  const [modo, setModo] = useState<'propria' | 'memed'>('propria');
  const [formData, setFormData] = useState<PrescricaoData>({
    controleEspecial: data?.controleEspecial || false,
    data: data?.data || new Date().toISOString().split('T')[0],
    descricao: data?.descricao || '',
    generico: data?.generico || '',
    medicamentos: data?.medicamentos || []
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(naoSalvo);
  const [isNew, setIsNew] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [medicamentosAPI, setMedicamentosAPI] = useState<MedicamentoAPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFreeText, setShowFreeText] = useState(false);
  const [tipoAdicao, setTipoAdicao] = useState<'medicamento' | 'formula'>(
    'medicamento'
  );
  const [formulaNome, setFormulaNome] = useState('');
  const [formulaComposicao, setFormulaComposicao] = useState('');
  const [showPadroesModal, setShowPadroesModal] = useState(false);
  // ⭐ Painel lateral (Prescrição Atual / Histórico / Dicas): opcional, para o
  //    formulário de medicamentos usar toda a largura. A escolha é lembrada.
  const [painelVisivel, setPainelVisivel] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAVE_PAINEL_PRESCRICOES) === '1';
    } catch {
      return false;
    }
  });
  const alternarPainel = () => {
    setPainelVisivel((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(CHAVE_PAINEL_PRESCRICOES, proximo ? '1' : '0');
      } catch {

        /* ignore */}
      return proximo;
    });
  };
  // ⭐ Bloco "Informações da prescrição" (Controle Especial + Data + Descrição):
  //    começa recolhido para a área de medicamentos ser a protagonista. Recolher
  //    é apenas visual — nenhum dado é perdido.
  const [infoRecolhido, setInfoRecolhido] = useState(true);
  // ⭐ Área de medicamentos: recolhível, para a descrição usar toda a tela.
  //    Recolher é apenas visual — os medicamentos continuam na prescrição.
  const [medsRecolhido, setMedsRecolhido] = useState(true);
  // ⭐ Escolha do modelo de receituário controlado antes de imprimir
  const [showReceituarioModal, setShowReceituarioModal] = useState(false);
  const [tipoReceituario, setTipoReceituario] =
  useState<TipoReceituario>('convencional');
  const [numeracaoTalonario, setNumeracaoTalonario] = useState('');
  const [pendenciasReceituario, setPendenciasReceituario] = useState<
    CampoPendente[]>(
    []);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);
  const dataRecebidaRef = useRef(false);
  const formDataRef = useRef(formData);
  const { confirm } = useDialog();
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  // ⭐ Lista de médicos da clínica. Guarda o cadastro COMPLETO, pois além de
  //    resolver o nome pelo profissionalId ela alimenta a escolha do prescritor
  //    quando o atendimento não tem profissional definido (CRM, UF, títulos…).
  const [medicosClinica, setMedicosClinica] = useState<any[]>([]);
  // ⭐ Prescritor escolhido manualmente para o receituário. Só é usado quando o
  //    atendimento não possui profissional — nunca sobrepõe o profissional real.
  const [prescritorEscolhidoId, setPrescritorEscolhidoId] = useState('');
  useEffect(() => {
    const carregarMedicos = async () => {
      if (!clinicaId) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const usuarios = await response.json();
          const medicosFiltrados = usuarios.filter(
            (u: any) => u.ativo && ['medico', 'dentista'].includes(u.tipo)
          );
          setMedicosClinica(medicosFiltrados);
        }
      } catch (err) {
        console.error('Erro ao carregar médicos:', err);
      }
    };
    carregarMedicos();
  }, [clinicaId]);
  const getNomeMedico = useCallback(
    (profissionalId?: string, nomeFallback?: string): string => {
      if (profissionalId) {
        const encontrado = medicosClinica.find((m) => m.id === profissionalId);
        if (encontrado) return encontrado.nome;
      }
      return nomeFallback || '';
    },
    [medicosClinica]
  );
  // ⭐ O atendimento pode não ter profissional definido (prontuário aberto por
  //    usuário administrativo, consulta sem profissional vinculado). Nesse caso
  //    o receituário precisa que o usuário escolha o prescritor.
  //    Também vale quando o profissional existe mas está sem inscrição no
  //    conselho, pois a receita não pode ser emitida sem esse dado.
  const atendimentoSemProfissional =
  !String(
    profissionalCompleto?.nome || (profissional as any)?.nome || ''
  ).trim() ||
  !String(
    profissionalCompleto?.crm || (profissional as any)?.crm || ''
  ).trim();
  // Padrão: profissional responsável gravado no cadastro do paciente.
  useEffect(() => {
    if (!atendimentoSemProfissional) return;
    if (prescritorEscolhidoId) return;
    if (medicosClinica.length === 0) return;
    const doCadastro = pacienteProfissionalResponsavelId ?
    medicosClinica.find(
      (m) => String(m.id) === String(pacienteProfissionalResponsavelId)
    ) :
    null;
    if (doCadastro) {
      setPrescritorEscolhidoId(String(doCadastro.id));
      return;
    }
    // Sem responsável no cadastro: com um único profissional na clínica, não há
    // ambiguidade — nos demais casos a escolha fica com o usuário.
    if (medicosClinica.length === 1) {
      setPrescritorEscolhidoId(String(medicosClinica[0].id));
    }
  }, [
  atendimentoSemProfissional,
  prescritorEscolhidoId,
  medicosClinica,
  pacienteProfissionalResponsavelId]
  );
  // Sincroniza data prop → formData
  useEffect(() => {
    if (data && !hasChanges) {
      const temDados = !!(
      data.controleEspecial ||
      data.descricao ||
      data.generico ||
      data.medicamentos && data.medicamentos.length > 0);

      if (temDados) dataRecebidaRef.current = true;
      setFormData((prev) => ({
        ...prev,
        controleEspecial: data.controleEspecial || false,
        data: data.data || new Date().toISOString().split('T')[0],
        descricao: data.descricao || '',
        generico: data.generico || '',
        medicamentos: data.medicamentos || []
      }));
      if (data.generico && data.generico.trim().length > 0)
      setShowFreeText(true);
    }
  }, [data, hasChanges]);
  // Busca medicamentos na API
  const buscarMedicamentosAPI = useCallback(async (termo: string) => {
    if (!termo || termo.length < 2) {
      setMedicamentosAPI([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: termo,
        limit: '20',
        page: '1'
      });
      const response = await fetch(`${API_BASE_URL}/api/medicamentos?${params}`);
      if (response.ok) {
        const result = await response.json();
        if (Array.isArray(result)) setMedicamentosAPI(result);else
        if (result.data && Array.isArray(result.data))
        setMedicamentosAPI(result.data);else
        if (result.medicamentos && Array.isArray(result.medicamentos))
        setMedicamentosAPI(result.medicamentos);else
        setMedicamentosAPI([]);
      } else setMedicamentosAPI([]);
    } catch (err) {
      setMedicamentosAPI([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (busca.length >= 2) {
      debounceTimer.current = setTimeout(
        () => buscarMedicamentosAPI(busca),
        300
      );
    } else setMedicamentosAPI([]);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [busca, buscarMedicamentosAPI]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
      containerRef.current &&
      !containerRef.current.contains(e.target as Node))

      setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Auto-save
  const debouncedSave = useDebounce(async (currentData: PrescricaoData) => {
    if (readOnly || !onSave) return;
    setIsSaving(true);
    setSaveError(null);
    // ⭐ FIX: Retry logic para erros 5xx (520, 502, etc.) — até 2 tentativas
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await onSave(currentData);
        setLastSaved(new Date());
        setHasChanges(false);
        setSaveError(null);
        setIsSaving(false);
        return; // Sucesso — sai do loop
      } catch (err: any) {
        const msg = err.message || '';
        const isTransientError =
        msg.includes('520') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('network');
        if (isTransientError && attempt < maxRetries) {
          // Aguarda antes de tentar novamente (backoff: 2s, 4s)
          console.warn(
            `⚠️ [Prescrição] Erro transiente (${msg}), tentativa ${attempt + 1}/${maxRetries}...`
          );
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        // Erro não-transiente ou tentativas esgotadas — mostra ao usuário
        const userMessage = isTransientError ?
        'Servidor temporariamente indisponível. Suas alterações serão salvas quando a conexão for restabelecida.' :
        msg || 'Erro ao salvar prescrição.';
        setSaveError(userMessage);
        setIsSaving(false);
        return;
      }
    }
    setIsSaving(false);
  }, 2000);
  const handleChange = (field: keyof PrescricaoData, value: any) => {
    const newData = {
      ...formData,
      [field]: value
    };
    setFormData(newData);
    setHasChanges(true);
    setIsNew(false);
    onChange?.(newData);
    debouncedSave(newData);
  };
  const handleAdicionarMedicamento = (medicamentoAPI?: MedicamentoAPI) => {
    const nome = medicamentoAPI ? medicamentoAPI.nome : busca;
    if (!nome.trim()) return;
    setShowSuggestions(false);
    setMedicamentosAPI([]);
    const novoMedicamento: MedicamentoItem = {
      id: `med-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      remedioId: medicamentoAPI?.id || '',
      nome,
      dosagem: medicamentoAPI?.concentracao || '',
      quantidade: '',
      unidade: medicamentoAPI?.formaFarmaceutica || '',
      posologia: '',
      tipo: 'medicamento'
    };
    handleChange('medicamentos', [...formData.medicamentos, novoMedicamento]);
    setBusca('');
  };
  const handleAdicionarFormula = () => {
    if (!formulaNome.trim()) return;
    const novaFormula: MedicamentoItem = {
      id: `form-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nome: formulaNome,
      dosagem: '',
      quantidade: '',
      unidade: '',
      posologia: formulaComposicao,
      tipo: 'formula'
    };
    handleChange('medicamentos', [...formData.medicamentos, novaFormula]);
    setFormulaNome('');
    setFormulaComposicao('');
  };
  const handleRemoverMedicamento = (id: string) => {
    handleChange(
      'medicamentos',
      formData.medicamentos.filter((m) => m.id !== id)
    );
  };
  const handleUpdateMedicamento = (
  id: string,
  field: keyof MedicamentoItem,
  value: string) =>
  {
    handleChange(
      'medicamentos',
      formData.medicamentos.map((m) =>
      m.id === id ?
      {
        ...m,
        [field]: value
      } :
      m
      )
    );
  };
  const handleCarregarHistorico = (item: PrescricaoItem) => {
    if (readOnly) return;
    const novosDados: PrescricaoData = {
      controleEspecial: item.controleEspecial || false,
      data: new Date().toISOString().split('T')[0],
      descricao: item.descricao || '',
      generico: item.generico || '',
      medicamentos: item.medicamentos || []
    };
    setFormData(novosDados);
    setHasChanges(true);
    setIsNew(false);
    onChange?.(novosDados);
  };
  const handleSelectPadrao = (padraoData: Partial<PrescricaoData>) => {
    const newData = {
      ...formData,
      ...padraoData,
      data: formData.data // Keep current date
    };
    setFormData(newData);
    setHasChanges(true);
    setIsNew(false);
    onChange?.(newData);
    debouncedSave(newData);
  };
  const handleManualSave = async () => {
    if (readOnly || !onSave) return;
    setIsSaving(true);
    setSaveError(null);
    // ⭐ FIX: Retry para save manual também (520, 502, etc.)
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
        await onSave(formData);
        setLastSaved(new Date());
        setHasChanges(false);
        setSaveError(null);
        setIsSaving(false);
        return;
      } catch (err: any) {
        const msg = err.message || '';
        const isTransientError =
        msg.includes('520') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError');
        if (isTransientError && attempt < maxRetries) {
          console.warn(
            `⚠️ [Prescrição Manual] Retry ${attempt + 1}/${maxRetries}...`
          );
          continue;
        }
        const userMessage = isTransientError ?
        'Servidor temporariamente indisponível. Tente novamente em alguns segundos.' :
        msg || 'Erro ao salvar prescrição. Tente novamente.';
        setSaveError(userMessage);
        setIsSaving(false);
        return;
      }
    }
    setIsSaving(false);
  };
  const handleNovo = async () => {
    const confirmed = await confirm(
      'Limpar Prescrição',
      'Tem certeza que deseja limpar a prescrição atual?',
      'Limpar',
      'Cancelar'
    );
    if (confirmed) {
      setFormData({
        controleEspecial: false,
        data: new Date().toISOString().split('T')[0],
        descricao: '',
        generico: '',
        medicamentos: []
      });
      setIsNew(true);
      setHasChanges(false);
      setShowFreeText(false);
      setLastSaved(null);
      dataRecebidaRef.current = false;
    }
  };
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    return lastSaved.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  // ⭐ Geração de PDF profissional do receituário (formato padrão médico)
  /**
   * ⭐ Dados do prescritor e do emitente (clínica) para o receituário
   *    controlado. Nada é fixo no código: o profissional vem das props do
   *    prontuário e a clínica vem da sessão (clínica atualmente selecionada).
   */
  const resolverPrescritorEEmitente = () => {
    // Prioridade: profissional do atendimento → escolha manual (quando o
    // atendimento não tem profissional) → profissional simples das props.
    const escolhido = prescritorEscolhidoId ?
    medicosClinica.find((m) => m.id === prescritorEscolhidoId) :
    null;
    const doAtendimento =
    profissionalCompleto?.nome && profissionalCompleto?.crm ?
    profissionalCompleto :
    null;
    const prof =
    doAtendimento || escolhido || profissionalCompleto || profissional || null;
    let registro = prof?.crm || '';
    if (prof?.uf && registro) registro = `${registro}/${prof.uf}`;
    const prescritor = {
      nome: prof?.nome || '',
      registro,
      conselho: prof ?
      resolverConselho(
        prof.tipo,
        prof.especialidade,
        prof.especialidades,
        prof.crm
      ) :
      'CRM',
      especialidade: prof ?
      resolverEspecialidade(prof.especialidade, prof.especialidades) :
      '',
      titulo: prof?.titulo || '',
      // Usados apenas no layout convencional (papel timbrado)
      cabecalho: (prof as any)?.cabecalhoRelatorio || '',
      rqes: Array.isArray((prof as any)?.rqes) ? (prof as any).rqes : []
    };
    let emitente = {
      nome: '',
      cnpj: '',
      cnes: '',
      endereco: '',
      telefone: '',
      logoUrl: '',
      cidade: '',
      uf: '',
      descricao: '',
      email: '',
      site: ''
    };
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        const clinica = parsed.clinicaAtual || {};
        emitente = {
          nome: clinica.nome || '',
          cnpj: clinica.cnpj || '',
          // CAMPO NECESSÁRIO — NÃO ENCONTRADO NO CADASTRO ATUAL: a clínica não
          // possui campo CNES. A norma aceita CNPJ *ou* CNES (este último para
          // estabelecimentos públicos), por isso o CNPJ atende ao requisito.
          cnes: clinica.cnes || '',
          endereco: clinica.endereco || '',
          telefone: clinica.telefone || '',
          logoUrl: clinica.logoUrl || parsed.operadoraSelecionada?.logoUrl || '',
          cidade: clinica.cidade || '',
          uf: clinica.uf || '',
          descricao: clinica.descricao || '',
          email: clinica.email || '',
          site: clinica.site || ''
        };
      }
    } catch {

      /* ignore */}
    return { prescritor, emitente };
  };
  /** Monta os dados do receituário controlado a partir do estado atual */
  const montarDadosReceituario = (modelo: TipoReceituario) => {
    const { prescritor, emitente } = resolverPrescritorEEmitente();
    return {
      modelo,
      numeracao: numeracaoTalonario,
      data: formData.data,
      // A descrição sai IGUAL à tela: a formatação do editor (alinhamento,
      // cor, negrito, listas) é preservada na impressão.
      descricao: formData.descricao,
      observacoes: formData.generico,
      medicamentos: formData.medicamentos.map((med) => ({
        nome: med.nome,
        dosagem: med.dosagem,
        quantidade: med.quantidade,
        unidade: med.unidade,
        posologia: med.posologia,
        tipo: med.tipo
      })),
      paciente: {
        nome: pacienteNome,
        cpf: pacienteCpf,
        dataNascimento: pacienteDataNascimento,
        endereco: pacienteEndereco
      },
      prescritor,
      emitente,
      controleEspecial: formData.controleEspecial
    };
  };
  /** Abre a visualização/impressão do receituário escolhido */
  const imprimirReceituarioControlado = async () => {
    const dados = montarDadosReceituario(tipoReceituario);
    const pendencias = validarReceituario(dados);
    setPendenciasReceituario(pendencias);
    // Não gera uma receita aparentemente válida com campo obrigatório vazio.
    if (pendencias.length > 0) return;
    const modelo = MODELOS_RECEITUARIO[tipoReceituario];
    let html: string;
    if (modelo.layout === 'convencional') {
      const { gerarHtmlReceituarioConvencional } = await import(
        '../../../utils/receituarioConvencional'
      );
      html = gerarHtmlReceituarioConvencional(dados);
    } else {
      html = gerarHtmlReceituarioControlado(dados);
    }
    const { previewDocumentoPDF } = await import('../../../utils/pdfGenerator');
    previewDocumentoPDF(html, {
      fileName: `Receituario_${tipoReceituario}_${formData.data || 'atual'}.pdf`
    });
    setShowReceituarioModal(false);
  };
  const handlePrint = () => {
    const dataFormatada = formData.data ?
    new Date(formData.data + 'T12:00:00').toLocaleDateString('pt-BR') :
    new Date().toLocaleDateString('pt-BR');
    // Dados da clínica e profissional do localStorage
    let clinicaNome = '',
      clinicaEndereco = '',
      clinicaTelefone = '',
      clinicaEmail = '',
      clinicaCnpj = '',
      clinicaLogoUrl = '',
      clinicaSite = '',
      clinicaDescricao = '';
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
        clinicaSite = parsed.clinicaAtual?.site || '';
        clinicaDescricao = parsed.clinicaAtual?.descricao || '';
      }
    } catch {

      /* ignore */}
    // Profissional: prioriza profissionalCompleto > profissional > localStorage
    // ⭐ Helper para extrair titulo/cabecalho/rqes de qualquer objeto profissional
    const extrairDadosExtras = (prof: any) => {
      profissionalTitulo = prof.titulo || '';
      profissionalCabecalho = prof.cabecalhoRelatorio || '';
      try {
        const rawRqes = prof.rqes;
        const parsed =
        typeof rawRqes === 'string' ? JSON.parse(rawRqes) : rawRqes;
        if (Array.isArray(parsed))
        profissionalRqes = parsed.filter((r: any) => r.especialidade && r.rqe);
      } catch {

        /* ignore */}
    };
    if (profissionalCompleto) {
      profissionalNome = profissionalCompleto.nome || '';
      profissionalCrm = profissionalCompleto.crm || '';
      if (profissionalCompleto.uf && profissionalCrm)
      profissionalCrm = profissionalCrm + '/' + profissionalCompleto.uf;
      // ⭐ FIX: Resolve IDs de especialidade (ex: ["11","15"]) para nomes legíveis
      profissionalEspecialidade = resolverEspecialidade(
        profissionalCompleto.especialidade,
        profissionalCompleto.especialidades
      );
      // ⭐ FIX: CRO para dentista (por tipo OU especialidade odontológica)
      prefixoConselho = resolverConselho(
        profissionalCompleto.tipo,
        profissionalCompleto.especialidade,
        profissionalCompleto.especialidades,
        profissionalCompleto.crm
      );
      extrairDadosExtras(profissionalCompleto);
    } else if (profissional) {
      profissionalNome = profissional.nome || '';
      profissionalCrm = profissional.crm || '';
      if (profissional.uf && profissionalCrm)
      profissionalCrm = profissionalCrm + '/' + profissional.uf;
      // ⭐ FIX: Resolve IDs de especialidade (ex: ["11","15"]) para nomes legíveis
      profissionalEspecialidade = resolverEspecialidade(
        profissional.especialidade,
        profissional.especialidades
      );
      // ⭐ FIX: CRO para dentista (por tipo OU especialidade odontológica)
      prefixoConselho = resolverConselho(
        profissional.tipo,
        profissional.especialidade,
        profissional.especialidades,
        profissional.crm
      );
      extrairDadosExtras(profissional);
    } else {



      // ⭐ CORRIGIDO: NÃO usa localStorage (evita "Admin Sistema" no PDF)
      // Se não tem profissionalCompleto nem profissional, o PDF fica sem nome de médico
      // Isso é preferível a mostrar o nome errado (do usuário logado)
    }const logoHtml = clinicaLogoUrl ? '<img src="' + clinicaLogoUrl +
    '" alt="Logo" style="max-height:70px;max-width:110px;object-fit:contain;border-radius:6px;" />' :
    ''; // Gera lista de medicamentos
    let medicamentosHtml = '';
    formData.medicamentos.forEach((med, i) => {
      if (med.tipo === 'formula') {
        medicamentosHtml +=
        '<div class="med-item"><div class="med-header"><span class="med-num">' + (
        i + 1) +
        '</span><span class="med-nome">' +
        med.nome +
        '</span><span class="med-tag formula">Fórmula</span></div>';
        if (med.posologia)
        medicamentosHtml +=
        '<div class="med-posologia">' +
        med.posologia.replace(/\n/g, '<br/>') +
        '</div>';
        medicamentosHtml += '</div>';
      } else {
        medicamentosHtml +=
        '<div class="med-item"><div class="med-header"><span class="med-num">' + (
        i + 1) +
        '</span><span class="med-nome">' +
        med.nome +
        '</span>';
        if (med.dosagem)
        medicamentosHtml +=
        '<span class="med-dosagem">' + med.dosagem + '</span>';
        medicamentosHtml += '</div>';
        const detalhes: string[] = [];
        if (med.quantidade) detalhes.push('Qtde: ' + med.quantidade);
        if (med.unidade) detalhes.push(med.unidade);
        if (detalhes.length > 0)
        medicamentosHtml +=
        '<div class="med-detalhes">' + detalhes.join(' — ') + '</div>';
        if (med.posologia)
        medicamentosHtml +=
        '<div class="med-posologia">' + med.posologia + '</div>';
        medicamentosHtml += '</div>';
      }
    });
    // Texto livre
    const textoLivreHtml =
    formData.generico && formData.generico.trim() ?
    '<div class="texto-livre"><div class="texto-livre-label">Observações / Prescrição Adicional:</div><div class="texto-livre-conteudo">' +
    formData.generico.replace(/\n/g, '<br/>') +
    '</div></div>' :
    '';
    const controleEspecialHtml = formData.controleEspecial ?
    '<div class="controle-especial">⚠️ RECEITUÁRIO DE CONTROLE ESPECIAL</div>' :
    '';
    const h: string[] = [];
    h.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">');
    h.push('<title>Receituário</title>');
    const styleTag = '<sty' + 'le>';
    const styleCloseTag = '</sty' + 'le>';
    h.push(styleTag);
    h.push('@page { size: A4; margin: 0; }');
    h.push('* { margin: 0; padding: 0; box-sizing: border-box; }');
    h.push(
      'body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }'
    );
    // Documento de várias páginas: cabeçalho/rodapé repetidos em cada folha
    h.push(cssDocumentoPaginado());
    h.push(cssQuebrasPagina('.body'));
    h.push('.medicamento, .med-item { page-break-inside: avoid; }');
    // Header
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
    // Body
    h.push('.body { padding: 20px 28px 26px; }');
    h.push(
      '.doc-title { font-size: 18px; font-weight: bold; color: #1e3a5f; border-bottom: 3px solid #3b82f6; padding-bottom: 6px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; text-align: center; }'
    );
    h.push(
      '.controle-especial { background: #fef2f2; border: 2px solid #ef4444; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 13px; font-weight: bold; color: #dc2626; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }'
    );
    h.push(
      '.data-info { font-size: 10px; color: #64748b; text-align: right; margin-bottom: 12px; }'
    );
    h.push(
      '.descricao { font-size: 12px; color: #334155; margin-bottom: 16px; }'
    );
    h.push('.descricao p { margin: 0 0 8px; }');
    h.push('.descricao ul, .descricao ol { margin: 0 0 8px; padding-left: 22px; }');
    h.push('.descricao ul { list-style: disc; }');
    h.push('.descricao ol { list-style: decimal; }');
    h.push('.descricao h1 { font-size: 14px; margin: 0 0 8px; }');
    h.push('.descricao h2 { font-size: 13px; margin: 10px 0 6px; }');
    h.push('.descricao h3 { font-size: 12px; margin: 8px 0 5px; }');
    h.push(
      '.descricao table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 11px; }'
    );
    h.push(
      '.descricao th, .descricao td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; }'
    );
    // Medicamentos
    h.push(
      '.med-item { padding: 10px 14px; margin-bottom: 10px; border-left: 3px solid #3b82f6; background: #f8fafc; border-radius: 0 6px 6px 0; }'
    );
    h.push(
      '.med-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }'
    );
    h.push(
      '.med-num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: #3b82f6; color: white; border-radius: 50%; font-size: 11px; font-weight: bold; flex-shrink: 0; }'
    );
    h.push('.med-nome { font-size: 13px; font-weight: bold; color: #1e293b; }');
    h.push(
      '.med-dosagem { font-size: 11px; color: #2563eb; font-weight: 600; }'
    );
    h.push(
      '.med-tag { font-size: 9px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }'
    );
    h.push(
      '.med-tag.formula { background: #f3e8ff; color: #7c3aed; border: 1px solid #c4b5fd; }'
    );
    h.push(
      '.med-detalhes { font-size: 10px; color: #475569; margin-left: 30px; margin-bottom: 2px; }'
    );
    h.push(
      '.med-posologia { font-size: 11px; color: #334155; margin-left: 30px; padding: 4px 8px; background: #eff6ff; border-radius: 4px; border-left: 2px solid #93c5fd; }'
    );
    // Texto livre
    h.push(
      '.texto-livre { margin-top: 20px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }'
    );
    h.push(
      '.texto-livre-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }'
    );
    h.push(
      '.texto-livre-conteudo { font-size: 11px; color: #334155; line-height: 1.7; white-space: pre-wrap; }'
    );
    // Assinatura
    h.push(
      '.assinatura { margin-top: 50px; text-align: right; page-break-inside: avoid; padding-right: 28px; }'
    );
    h.push(
      '.assinatura-linha { border-top: 1px solid #1e3a5f; width: 280px; margin-left: auto; margin-bottom: 8px; }'
    );
    h.push(
      '.assinatura-nome { font-size: 14px; font-weight: bold; color: #1e293b; }'
    );
    h.push('.assinatura-crm { font-size: 12px; color: #475569; }');
    h.push('.assinatura-esp { font-size: 11px; color: #64748b; }');
    // Footer
    h.push(
      '.footer { background: #edf3fb; border-top: 3px solid #3b82f6; padding: 12px 28px; display: flex; justify-content: space-between; align-items: center; }'
    );
    h.push('.footer-left { flex: 1; }');
    h.push(
      '.footer-left .nome { font-size: 13px; font-weight: bold; color: #1e3a5f; margin-bottom: 2px; }'
    );
    h.push(
      '.footer-left .desc { font-size: 8px; color: #475569; margin-bottom: 4px; }'
    );
    h.push(
      '.footer-left .info { font-size: 8px; color: #64748b; line-height: 1.5; }'
    );
    h.push(
      '.footer-right { font-size: 11px; color: #475569; font-style: italic; }'
    );
    h.push(
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc { margin: 0; } }'
    );
    h.push(styleCloseTag);
    h.push('</head><body>');
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
      clinicaNome || 'Receituário') +
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
      if (clinicaNome && profissionalNome) infoLines.push(clinicaNome);
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
    h.push(faixaIdentificacao(pacienteNome, 'Receituário', dataFormatada));
    h.push('</td></tr></thead>');
    // Rodapé antes do corpo — condição para repetir em todas as páginas
    h.push('<tfoot><tr><td>');
    h.push('<div class="footer">');
    h.push('<div class="footer-left">');
    if (clinicaNome) h.push('<div class="nome">' + clinicaNome + '</div>');
    if (clinicaDescricao)
    h.push('<div class="desc">' + clinicaDescricao + '</div>');
    const rodapeLinhas: string[] = [];
    if (clinicaEndereco) rodapeLinhas.push(clinicaEndereco);
    if (clinicaTelefone) rodapeLinhas.push('Telefone: ' + clinicaTelefone);
    if (clinicaEmail) rodapeLinhas.push('Email: ' + clinicaEmail);
    if (clinicaSite) rodapeLinhas.push('Site: ' + clinicaSite);
    if (rodapeLinhas.length > 0)
    h.push('<div class="info">' + rodapeLinhas.join('<br/>') + '</div>');
    h.push('</div>');
    h.push('<div class="footer-right">Via Paciente</div>');
    h.push('</div>');
    h.push('</td></tr></tfoot>');
    // Body
    h.push('<tbody><tr><td>');
    h.push('<div class="body">');
    h.push('<div class="data-info">Data: ' + dataFormatada + '</div>');
    h.push(controleEspecialHtml);
    h.push('<div class="doc-title">Receituário</div>');
    // ⭐ FIX: Dados do paciente (obrigatório em controle especial)
    if (pacienteNome || formData.controleEspecial) {
      h.push(
        '<div style="background:#f8fafc;padding:10px 14px;border-radius:6px;border-left:4px solid #3b82f6;margin-bottom:16px;font-size:11px;line-height:2;">'
      );
      if (pacienteNome)
      h.push(
        '<div><span style="font-weight:bold;color:#0f172a;">Paciente:</span> <span style="color:#334155;">' +
        pacienteNome.toUpperCase() +
        '</span></div>'
      );
      if (pacienteDataNascimento) {
        try {
          const dn = new Date(pacienteDataNascimento + 'T12:00:00');
          const dnFormatada = dn.toLocaleDateString('pt-BR');
          const hoje = new Date();
          let idade = hoje.getFullYear() - dn.getFullYear();
          const m = hoje.getMonth() - dn.getMonth();
          if (m < 0 || m === 0 && hoje.getDate() < dn.getDate()) idade--;
          h.push(
            '<div><span style="font-weight:bold;color:#0f172a;">Data Nasc.:</span> <span style="color:#334155;">' +
            dnFormatada +
            ' (' +
            idade +
            ' anos)</span></div>'
          );
        } catch {

          /* ignore */}
      }
      if (pacienteCpf)
      h.push(
        '<div><span style="font-weight:bold;color:#0f172a;">CPF:</span> <span style="color:#334155;">' +
        pacienteCpf +
        '</span></div>'
      );
      if (pacienteEndereco)
      h.push(
        '<div><span style="font-weight:bold;color:#0f172a;">Endereço:</span> <span style="color:#334155;">' +
        pacienteEndereco +
        '</span></div>'
      );
      if (pacienteTelefone)
      h.push(
        '<div><span style="font-weight:bold;color:#0f172a;">Telefone:</span> <span style="color:#334155;">' +
        pacienteTelefone +
        '</span></div>'
      );
      if (formData.controleEspecial && !pacienteCpf) {
        h.push(
          '<div style="color:#dc2626;font-weight:bold;font-size:10px;margin-top:4px;">⚠️ CPF e Endereço são obrigatórios para Controle Especial. Atualize o cadastro do paciente.</div>'
        );
      }
      h.push('</div>');
    }
    // ⭐ A descrição agora vem do editor de documento (HTML). Registros antigos
    //    em texto puro continuam funcionando via paraHtml().
    if (formData.descricao)
    h.push(
      '<div class="descricao">' +
      paraHtmlImpressao(formData.descricao) +
      '</div>'
    );
    // Medicamentos
    if (formData.medicamentos.length > 0) {
      h.push(medicamentosHtml);
    }
    // Texto livre
    h.push(textoLivreHtml);
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
    if (profissionalEspecialidade)
    h.push(
      '<div class="assinatura-esp">' + profissionalEspecialidade + '</div>'
    );
    if (profissionalCrm)
    h.push(
      '<div class="assinatura-crm">' +
      prefixoConselho +
      ' ' +
      profissionalCrm +
      '</div>'
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
      const nomeArquivo = `Receituario_${formData.data || new Date().toISOString().split('T')[0]}.pdf`;
      previewDocumentoPDF(h.join('\n'), {
        fileName: nomeArquivo
      });
    });
  };
  const getTarjaColor = (tarja: string) => {
    const colors: Record<string, string> = {
      vermelha: 'bg-red-100 text-red-700 border-red-200',
      preta: 'bg-gray-900 text-white border-gray-900',
      amarela: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      sem_tarja: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return colors[tarja] || colors.sem_tarja;
  };
  // ⭐ Resumo rápido da prescrição atual (para o painel)
  const resumoPrescricaoAtual = () => {
    const qtd = formData.medicamentos.length;
    const temTexto = !!(formData.generico && formData.generico.trim());
    if (qtd === 0 && !temTexto) return null;
    return {
      qtdMedicamentos: qtd,
      temTextoLivre: temTexto,
      controleEspecial: formData.controleEspecial
    };
  };
  // Get profissionalId for padrões
  const profissionalIdParaPadroes =
  profissionalCompleto?.id || profissional?.id || '';
  // ⭐ Resumo exibido na barra compacta — acompanha o formulário em tempo real
  const dataResumoPrescricao = (() => {
    const somenteData = String(formData.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(somenteData)) return '';
    const [ano, mes, dia] = somenteData.split('-');
    return `${dia}/${mes}/${ano}`;
  })();
  const resumoInformacoesPrescricao = [
  formData.controleEspecial ? 'Controle Especial' : '',
  paraTextoSimples(formData.descricao).trim().split('\n')[0] ||
  'Nova prescrição',
  dataResumoPrescricao].

  filter(Boolean).
  join(' | ');
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* ===== HEADER FIXO ===== */}
      <div className="flex-shrink-0 border-b border-gray-100 pb-2 mb-3 bg-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-medium text-teal-700 flex items-center gap-2">
                <PillIcon className="w-5 h-5" />
                Prescrição
              </h2>
              <div className="bg-gray-100 p-0.5 rounded-md flex items-center">
                <button
                  onClick={() => setModo('propria')}
                  title="Prescrição própria do sistema"
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${modo === 'propria' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  
                  Própria
                </button>
                <button
                  onClick={() => setModo('memed')}
                  title="Prescrição via plataforma Memed"
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-all flex items-center gap-1.5 ${modo === 'memed' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  
                  Memed <ExternalLinkIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
            {modo === 'propria' &&
            <p className="text-[10px] text-gray-500 mt-0.5">
                Adicione medicamentos e a prescrição será salva automaticamente
              </p>
            }
          </div>

          {modo === 'propria' &&
          <div className="flex items-center gap-3 flex-wrap justify-end">
              <div className="flex items-center mr-2">
                {isSaving ?
              <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                    <RefreshCwIcon className="w-3 h-3 animate-spin" />{' '}
                    Salvando...
                  </span> :
              lastSaved && !hasChanges && !saveError ?
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
              
                  <PlusIcon className="w-4 h-4 mr-2" /> Nova Prescrição
                </Button>
            }
              <Button
              variant="outline"
              size="sm"
              onClick={() => setMedsRecolhido((atual) => !atual)}
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              title={
              medsRecolhido ?
              'Mostrar a coluna de medicamentos' :
              'Esconder os medicamentos e ampliar a área de escrita'
              }>
              
                {medsRecolhido ?
              <>
                    <PillIcon className="w-4 h-4 mr-2" /> Medicamentos (
                    {formData.medicamentos.length})
                  </> :

              <>
                    <ChevronRightIcon className="w-4 h-4 mr-2" /> Esconder
                    medicamentos
                  </>
              }
              </Button>
              <Button
              variant="outline"
              size="sm"
              onClick={alternarPainel}
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              title={
              painelVisivel ?
              'Esconder o painel lateral e ampliar a prescrição' :
              'Mostrar prescrição atual, histórico e dicas'
              }>
              
                {painelVisivel ?
              <>
                    <ChevronRightIcon className="w-4 h-4 mr-2" /> Esconder
                    painel
                  </> :

              <>
                    <ClockIcon className="w-4 h-4 mr-2" /> Histórico e dicas
                  </>
              }
              </Button>
              <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // O usuário escolhe o modelo: convencional (papel timbrado)
                // ou um dos modelos oficiais da Anvisa.
                setPendenciasReceituario([]);
                setShowReceituarioModal(true);
              }}
              disabled={
              formData.medicamentos.length === 0 &&
              !formData.generico &&
              !formData.descricao
              }
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              
                <PrinterIcon className="w-4 h-4 mr-2" /> Imprimir
              </Button>
              {!readOnly &&
            <Button
              size="sm"
              onClick={handleManualSave}
              data-salvar-etapa
              title="Salvar (Ctrl+S)"
              disabled={isSaving || !hasChanges}
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow transition-all">
              
                  <SaveIcon className="w-4 h-4 mr-2" /> Salvar
                </Button>
            }
            </div>
          }
        </div>
      </div>

      {/* ===== CONTEÚDO SCROLLÁVEL ===== */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {modo === 'memed' ?
        <MemedEtapa
          profissional={profissional}
          profissionalCompleto={profissionalCompleto}
          memedConfig={memedConfig}
          clinicaId={clinicaId}
          onAbrirMemed={onAbrirMemed}
          onConfigurar={onConfigurarMemed}
          onStatusChange={onMemedStatusChange}
          onNavigateUsuarios={onNavigateUsuarios} /> :


        <div className="flex flex-col lg:flex-row gap-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
            {/* ===== COLUNA PRINCIPAL — protagonista da tela =====
               `min-h-0` em toda a cadeia é o que permite ao editor ocupar
               exatamente a altura restante, sem estourar a tela. */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-3 lg:overflow-hidden">
              {/* Erro */}
              {saveError &&
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      Erro ao salvar prescrição
                    </p>
                    <p className="text-sm text-red-600 mt-1">{saveError}</p>
                  </div>
                  <button
                onClick={() => setSaveError(null)}
                className="text-red-400 hover:text-red-600"
                title="Fechar">
                
                    <span className="text-lg leading-none">&times;</span>
                  </button>
                </div>
            }

              {/* ===== BARRA DE INFORMAÇÕES — abre e fecha o bloco superior =====
                 Recolher é apenas visual: os valores continuam no formulário
                 e o salvamento automático segue igual. */}
              <button
              type="button"
              onClick={() => setInfoRecolhido((atual) => !atual)}
              aria-expanded={!infoRecolhido}
              title={
              infoRecolhido ?
              'Mostrar as informações da prescrição' :
              'Recolher as informações e ampliar a área de escrita'
              }
              className="flex-shrink-0 w-full flex items-center gap-2 px-3 py-2 rounded-md border border-teal-200 bg-teal-50/70 text-left hover:bg-teal-50 transition-colors">
              
                {infoRecolhido ?
              <ChevronDownIcon className="w-4 h-4 text-teal-700 flex-shrink-0" /> :

              <ChevronUpIcon className="w-4 h-4 text-teal-700 flex-shrink-0" />
              }
                <span className="text-xs font-medium text-teal-800 flex-shrink-0">
                  Informações da prescrição:
                </span>
                <span className="text-xs text-gray-700 truncate">
                  {resumoInformacoesPrescricao}
                </span>
              </button>

              {/* ===== BLOCO DE INFORMAÇÕES — recolhível ===== */}
              <div
              className={`flex-shrink-0 overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
              infoRecolhido ?
              'max-h-0 opacity-0 pointer-events-none' :
              'max-h-[200px] opacity-100'}`
              }
              aria-hidden={infoRecolhido}>
              
                <Card className="p-4 border-t-4 border-t-teal-500 shadow-sm">
                  {/* Controles Superiores */}
                  <div className="flex flex-wrap items-center gap-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div
                      onClick={() =>
                      !readOnly &&
                      handleChange(
                        'controleEspecial',
                        !formData.controleEspecial
                      )
                      }
                      className={`w-5 h-5 border-2 rounded cursor-pointer flex items-center justify-center transition-colors ${formData.controleEspecial ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-300 bg-white'} ${readOnly ? 'cursor-not-allowed opacity-50' : ''}`}>
                      
                        {formData.controleEspecial &&
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor">
                        
                            <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7" />
                        
                          </svg>
                      }
                      </div>
                      <label
                      className="text-sm font-medium text-gray-700 cursor-pointer"
                      onClick={() =>
                      !readOnly &&
                      handleChange(
                        'controleEspecial',
                        !formData.controleEspecial
                      )
                      }>
                      
                        Controle Especial
                      </label>
                    </div>
                    <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-gray-700">
                        Data:
                      </label>
                      <input
                      type="date"
                      value={formData.data}
                      onChange={(e) => handleChange('data', e.target.value)}
                      disabled={readOnly}
                      className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:bg-gray-100" />
                    
                    </div>
                  </div>

                </Card>
              </div>
              {/* ===== FIM DO BLOCO DE INFORMAÇÕES ===== */}

              {/* ===== EDITOR + MEDICAMENTOS LADO A LADO =====
                 A descrição é a protagonista; os medicamentos ficam em uma
                 coluna à direita, que aparece e desaparece pelo botão
                 "Medicamentos / Esconder medicamentos" no topo da tela. */}
              <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
                {/* DESCRIÇÃO — ocupa a altura restante e a rolagem fica DENTRO
                   do documento. */}
                <div className="flex flex-col min-h-[55vh] lg:min-h-0 lg:flex-1 lg:min-w-0">
                  <div className="flex-shrink-0 flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-700 flex items-center gap-2">
                      <FileTextIcon className="w-4 h-4 text-teal-600" />
                      Descrição da Prescrição
                    </label>
                    <span className="text-[10px] text-gray-400 hidden sm:inline">
                      Ctrl+B negrito · Ctrl+I itálico · Ctrl+Z desfazer
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 flex">
                    <EditorDocumento
                    value={formData.descricao}
                    onChange={(html) => handleChange('descricao', html)}
                    onFocus={() => setInfoRecolhido(true)}
                    placeholder="Descreva a prescrição, o contexto clínico e as orientações ao paciente..."
                    disabled={readOnly}
                    larguraTotal />
                  
                  </div>
                </div>

              {!medsRecolhido &&
              <Card className="w-full lg:w-[420px] xl:w-[460px] lg:flex-shrink-0 lg:min-h-0 lg:overflow-y-auto p-4 shadow-sm animate-in fade-in duration-150">
                  <div className="space-y-4">
                  {/* Busca de Medicamentos / Fórmulas */}
                  <div ref={containerRef} className="relative z-20">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                        {tipoAdicao === 'medicamento' ?
                        <SearchIcon className="w-4 h-4 text-teal-600" /> :

                        <FlaskConicalIcon className="w-4 h-4 text-teal-600" />
                        }
                        Adicionar à Prescrição
                      </label>
                      <div className="bg-gray-100 p-1 rounded-lg flex items-center">
                        <button
                          onClick={() => setTipoAdicao('medicamento')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${tipoAdicao === 'medicamento' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                          
                          <PillIcon className="w-3.5 h-3.5" /> Medicamento
                        </button>
                        <button
                          onClick={() => setTipoAdicao('formula')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${tipoAdicao === 'formula' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                          
                          <FlaskConicalIcon className="w-3.5 h-3.5" /> Fórmula
                        </button>
                      </div>
                    </div>

                    {tipoAdicao === 'medicamento' ?
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          {loading ?
                        <Loader2Icon className="h-5 w-5 text-teal-500 animate-spin" /> :

                        <SearchIcon className="h-5 w-5 text-gray-400" />
                        }
                        </div>
                        <input
                        type="text"
                        value={busca}
                        onChange={(e) => {
                          setBusca(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Digite o nome do medicamento para buscar..."
                        disabled={readOnly}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm transition-shadow shadow-sm" />
                      
                      </div> :

                    <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Nome da Fórmula
                          </label>
                          <input
                          type="text"
                          value={formulaNome}
                          onChange={(e) => setFormulaNome(e.target.value)}
                          placeholder="Ex: Fórmula Manipulada Dermatológica"
                          disabled={readOnly}
                          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-white" />
                        
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Composição / Descrição
                          </label>
                          <textarea
                          rows={3}
                          value={formulaComposicao}
                          onChange={(e) =>
                          setFormulaComposicao(e.target.value)
                          }
                          placeholder="Ex: Ácido Salicílico 2% + Ureia 10% em creme base..."
                          disabled={readOnly}
                          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-white resize-y" />
                        
                        </div>
                        <div className="flex justify-end">
                          <Button
                          type="button"
                          size="sm"
                          onClick={handleAdicionarFormula}
                          disabled={!formulaNome.trim() || readOnly}
                          className="bg-teal-600 hover:bg-teal-700 text-white">
                          
                            <PlusIcon className="w-4 h-4 mr-1.5" /> Adicionar
                            Fórmula
                          </Button>
                        </div>
                      </div>
                    }

                    {tipoAdicao === 'medicamento' &&
                    showSuggestions &&
                    busca.length >= 2 &&
                    <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto sm:text-sm">
                          {loading ?
                      <div className="py-2 px-4 text-gray-700 text-center">
                              Buscando...
                            </div> :
                      medicamentosAPI.length === 0 ?
                      <div className="py-2 px-4 text-gray-700">
                              <p>Nenhum medicamento encontrado.</p>
                              <button
                          onClick={() => handleAdicionarMedicamento()}
                          className="text-teal-600 font-medium hover:underline mt-1 flex items-center gap-1">
                          
                                <PlusIcon className="w-3 h-3" /> Adicionar "
                                {busca}" manualmente
                              </button>
                            </div> :

                      medicamentosAPI.map((med) =>
                      <div
                        key={med.id}
                        onClick={() => handleAdicionarMedicamento(med)}
                        className="cursor-pointer py-3 px-4 hover:bg-teal-50 border-b border-gray-50 last:border-0">
                        
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="bg-teal-100 p-1.5 rounded-full">
                                      <PillIcon className="w-4 h-4 text-teal-600" />
                                    </div>
                                    <div>
                                      <span className="block font-medium text-gray-900 truncate">
                                        {med.nome}
                                      </span>
                                      <span className="block text-xs text-gray-500 truncate">
                                        {med.principioAtivo} •{' '}
                                        {med.concentracao}
                                      </span>
                                    </div>
                                  </div>
                                  <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${getTarjaColor(med.tarja)}`}>
                            
                                    {med.tarja || 'Sem tarja'}
                                  </span>
                                </div>
                              </div>
                      )
                      }
                        </div>
                    }
                  </div>

                  {/* Lista de Medicamentos */}
                  <div className="space-y-4">
                    {formData.medicamentos.length === 0 ?
                    <div className="text-center py-10 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <div className="bg-white p-3 rounded-full inline-block shadow-sm mb-3">
                          <PillIcon className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-900">
                          Nenhum medicamento prescrito
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Use a busca acima para adicionar medicamentos.
                        </p>
                      </div> :

                    <div className="grid gap-4">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="text-sm font-medium text-gray-700">
                            Medicamentos Prescritos (
                            {formData.medicamentos.length})
                          </h3>
                        </div>
                        {formData.medicamentos.map((med, index) =>
                      <div
                        key={med.id}
                        className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 relative group">
                        
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold">
                                  {index + 1}
                                </span>
                                <h4 className="text-base font-semibold text-gray-900">
                                  {med.nome}
                                </h4>
                                {med.tipo === 'formula' ?
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                    <FlaskConicalIcon className="w-3 h-3" />{' '}
                                    Fórmula
                                  </span> :

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                    <PillIcon className="w-3 h-3" /> Medicamento
                                  </span>
                            }
                              </div>
                              <button
                            onClick={() => handleRemoverMedicamento(med.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50"
                            title="Remover">
                            
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              {med.tipo !== 'formula' &&
                          <>
                                  <div className="md:col-span-4">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                      Dosagem
                                    </label>
                                    <input
                                type="text"
                                value={med.dosagem}
                                onChange={(e) =>
                                handleUpdateMedicamento(
                                  med.id,
                                  'dosagem',
                                  e.target.value
                                )
                                }
                                placeholder="Ex: 500mg"
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm px-3 py-2 border" />
                              
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                      Qtde
                                    </label>
                                    <input
                                type="text"
                                value={med.quantidade}
                                onChange={(e) =>
                                handleUpdateMedicamento(
                                  med.id,
                                  'quantidade',
                                  e.target.value
                                )
                                }
                                placeholder="Ex: 1"
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm px-3 py-2 border" />
                              
                                  </div>
                                  <div className="md:col-span-3">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                      Unidade
                                    </label>
                                    <input
                                type="text"
                                value={med.unidade}
                                onChange={(e) =>
                                handleUpdateMedicamento(
                                  med.id,
                                  'unidade',
                                  e.target.value
                                )
                                }
                                placeholder="Ex: Caixa"
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm px-3 py-2 border" />
                              
                                  </div>
                                </>
                          }
                              <div className="md:col-span-12">
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  {med.tipo === 'formula' ?
                              'Composição / Instruções' :
                              'Posologia / Instruções'}
                                </label>
                                {med.tipo === 'formula' ?
                            <textarea
                              rows={3}
                              value={med.posologia}
                              onChange={(e) =>
                              handleUpdateMedicamento(
                                med.id,
                                'posologia',
                                e.target.value
                              )
                              }
                              placeholder="Ex: Ácido Salicílico 2% + Ureia 10%..."
                              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm px-3 py-2 border bg-gray-50 resize-y" /> :


                            <input
                              type="text"
                              value={med.posologia}
                              onChange={(e) =>
                              handleUpdateMedicamento(
                                med.id,
                                'posologia',
                                e.target.value
                              )
                              }
                              placeholder="Ex: Tomar 1 comprimido a cada 8 horas por 5 dias"
                              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm px-3 py-2 border bg-gray-50" />

                            }
                              </div>
                            </div>
                          </div>
                      )}
                      </div>
                    }
                  </div>

                  {/* Texto Livre */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <button
                      onClick={() => setShowFreeText(!showFreeText)}
                      className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left hover:bg-gray-100 transition-colors">
                      
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-gray-700">
                          Observações Gerais da Prescrição
                        </span>
                      </div>
                      {showFreeText ?
                      <ChevronUpIcon className="w-4 h-4 text-gray-500" /> :

                      <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                      }
                    </button>
                    {showFreeText &&
                    <div className="p-4 border-t border-gray-200">
                        <textarea
                        rows={6}
                        value={formData.generico}
                        onChange={(e) =>
                        handleChange('generico', e.target.value)
                        }
                        placeholder="Digite observações adicionais ou prescrição em texto livre..."
                        disabled={readOnly}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all resize-y disabled:bg-gray-50 text-sm" />
                      

                        <p className="text-xs text-gray-500 mt-2">
                          Use este campo para orientações gerais ou medicamentos
                          não listados acima.
                        </p>
                      </div>
                    }
                  </div>
                  </div>
                </Card>
              }
              {/* ===== FIM DA ÁREA DE MEDICAMENTOS ===== */}
              </div>
            </div>

            {/* ===== PAINEL LATERAL OPCIONAL — Resumo + Histórico + Dicas ===== */}
            <div
            className={`space-y-4 lg:w-[340px] lg:flex-shrink-0 lg:min-h-0 lg:overflow-y-auto pb-1 ${
            painelVisivel ? '' : 'hidden'}`
            }>
            
              {/* ⭐ Resumo da Prescrição Atual */}
              {resumoPrescricaoAtual() &&
            <Card className="p-0 bg-white border-gray-200 overflow-hidden shadow-sm">
                  <div className="p-4 bg-teal-50 border-b border-teal-100">
                    <h3 className="text-sm font-semibold text-teal-900 flex items-center gap-2">
                      <PillIcon className="w-4 h-4 text-teal-600" />
                      Prescrição Atual
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {formData.controleEspecial &&
                <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded border border-red-200">
                        <AlertCircleIcon className="w-3.5 h-3.5" />
                        CONTROLE ESPECIAL
                      </div>
                }
                    <div className="text-sm text-gray-700">
                      <span className="font-bold text-2xl text-teal-700">
                        {formData.medicamentos.length}
                      </span>
                      <span className="ml-1.5 text-gray-500">
                        medicamento
                        {formData.medicamentos.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {formData.medicamentos.length > 0 &&
                <div className="space-y-1.5 pt-1 border-t border-gray-100">
                        {formData.medicamentos.map((med, i) =>
                  <p
                    key={med.id}
                    className="text-xs text-gray-600 truncate">
                    
                            <span className="font-semibold text-gray-800">
                              {i + 1}.
                            </span>{' '}
                            {med.nome}
                            {med.dosagem ? ` — ${med.dosagem}` : ''}
                          </p>
                  )}
                      </div>
                }
                    {formData.generico && formData.generico.trim() &&
                <div className="pt-1 border-t border-gray-100">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <FileTextIcon className="w-3 h-3" /> Texto livre
                          incluído
                        </p>
                      </div>
                }
                  </div>
                </Card>
            }

              {/* ⭐ Histórico de Prescrições — layout igual ao ExamesEtapa */}
              <Card className="p-0 bg-white border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-teal-600" />
                    Histórico de Prescrições
                  </h3>
                  <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                    {historico.length}
                  </span>
                </div>

                {historico.length > 0 ?
              <div className="max-h-[400px] overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {historico.map((item, index) => {
                  // ⭐ FIX: Normaliza data antes de formatar (MySQL pode retornar "2026-03-05 00:00:00")
                  let dataFormatada = '';
                  if (item.data) {
                    let dataLimpa = item.data.toString().trim();
                    if (dataLimpa.includes(' '))
                    dataLimpa = dataLimpa.split(' ')[0];
                    if (dataLimpa.includes('T'))
                    dataLimpa = dataLimpa.split('T')[0];
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dataLimpa)) {
                      dataFormatada = new Date(
                        dataLimpa + 'T12:00:00'
                      ).toLocaleDateString('pt-BR');
                    } else {
                      dataFormatada = dataLimpa;
                    }
                  }
                  const nomeMedico = getNomeMedico(
                    item.profissionalId,
                    item.medico
                  );
                  const qtdMedicamentos = item.medicamentos?.length || 0;
                  return (
                    <div
                      key={item.id || index}
                      onClick={() => handleCarregarHistorico(item)}
                      className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all group relative cursor-pointer"
                      title="Clique para carregar esta prescrição">
                      
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded uppercase tracking-wide border border-gray-100">
                              {dataFormatada || item.data}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="p-1.5 text-teal-600 text-xs font-medium flex items-center gap-1">
                                <CopyIcon className="w-3 h-3" /> Carregar
                              </span>
                            </div>
                          </div>

                          {/* Descrição */}
                          {item.descricao &&
                      <p className="text-xs font-medium text-gray-800 mb-1.5 truncate">
                              {paraTextoSimples(item.descricao)}
                            </p>
                      }

                          {/* Badges */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {item.controleEspecial &&
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                Controle Especial
                              </span>
                        }
                            {qtdMedicamentos > 0 &&
                        <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                                {qtdMedicamentos} med
                                {qtdMedicamentos > 1 ? 's' : ''}
                              </span>
                        }
                          </div>

                          {/* Lista resumida de medicamentos */}
                          {qtdMedicamentos > 0 &&
                      <div className="mb-1.5">
                              {item.medicamentos.slice(0, 3).map((med, i) =>
                        <p
                          key={i}
                          className="text-xs text-gray-700 truncate leading-snug">
                          
                                  <span className="font-semibold">
                                    {i + 1}.
                                  </span>{' '}
                                  {med.nome}
                                  {med.dosagem ? ` — ${med.dosagem}` : ''}
                                </p>
                        )}
                              {qtdMedicamentos > 3 &&
                        <p className="text-[10px] text-gray-400 mt-0.5">
                                  +{qtdMedicamentos - 3} medicamento(s)
                                </p>
                        }
                            </div>
                      }

                          {/* Texto livre (se não tem medicamentos) */}
                          {item.generico && !qtdMedicamentos &&
                      <p className="text-xs text-gray-600 line-clamp-2 mb-1.5">
                              {item.generico}
                            </p>
                      }

                          {/* Médico */}
                          {nomeMedico &&
                      <p className="text-[10px] text-gray-500 flex items-center gap-1.5 border-t border-gray-50 pt-1.5 mt-1.5">
                              <StethoscopeIcon className="w-3 h-3 text-gray-400" />
                              {nomeMedico}
                            </p>
                      }
                        </div>);

                })}
                  </div> :

              <div className="text-center py-12 px-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ClockIcon className="w-6 h-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">
                      Nenhum histórico disponível
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      As prescrições anteriores aparecerão aqui.
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
                      Cada medicamento é salvo <strong>individualmente</strong>{' '}
                      no banco de dados.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                    <span>
                      Clique em uma prescrição do <strong>histórico</strong>{' '}
                      para reutilizá-la.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                    <span>
                      Use <strong>Padrões</strong> para salvar e reutilizar
                      prescrições frequentes.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        }
      </div>

      {/* Modal de Padrões */}
      <PadroesPrescricaoModal
        isOpen={showPadroesModal}
        onClose={() => setShowPadroesModal(false)}
        onSelect={handleSelectPadrao}
        currentData={formData}
        clinicaId={clinicaId}
        profissionalId={profissionalIdParaPadroes} />
      

      {/* ===== MODELO DO RECEITUÁRIO CONTROLADO ===== */}
      {showReceituarioModal &&
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <PrinterIcon className="w-4 h-4 text-teal-600" />
                Imprimir receituário
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                O modelo <strong>Convencional</strong> usa o papel timbrado do
                profissional. Os modelos oficiais seguem a RDC Anvisa nº
                1.000/2025, obrigatórios para receituários impressos desde
                18/05/2026.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* ⭐ Atendimento sem profissional definido: o usuário escolhe o
                 prescritor, já com o responsável do cadastro do paciente. */}
              {atendimentoSemProfissional &&
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label
                htmlFor="prescritor-receituario"
                className="block text-sm font-medium text-amber-900 mb-1.5">
                
                    Profissional prescritor
                  </label>
                  <select
                id="prescritor-receituario"
                value={prescritorEscolhidoId}
                onChange={(e) => {
                  setPrescritorEscolhidoId(e.target.value);
                  setPendenciasReceituario([]);
                }}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
                
                    <option value="">Selecione o profissional…</option>
                    {medicosClinica.map((m) =>
                <option key={m.id} value={m.id}>
                        {m.nome}
                        {m.crm ? ` — ${m.crm}${m.uf ? `/${m.uf}` : ''}` : ''}
                      </option>
                )}
                  </select>
                  <p className="text-xs text-amber-800 mt-1.5">
                    Este atendimento não tem profissional definido.
                    {pacienteProfissionalResponsavelId ?
                ' Trouxemos o responsável gravado no cadastro do paciente.' :
                ' Escolha quem assina o receituário.'}
                  </p>
                </div>
            }

              <div>
                <label
                htmlFor="tipo-receituario"
                className="block text-sm font-medium text-gray-700 mb-1.5">
                
                  Tipo de receituário
                </label>
                <select
                id="tipo-receituario"
                value={tipoReceituario}
                onChange={(e) => {
                  setTipoReceituario(e.target.value as TipoReceituario);
                  setPendenciasReceituario([]);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500">
                
                  {Object.values(MODELOS_RECEITUARIO).map((m) =>
                <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                )}
                </select>
                <p className="text-xs text-gray-500 mt-1.5">
                  {MODELOS_RECEITUARIO[tipoReceituario].descricao}{' '}
                  {MODELOS_RECEITUARIO[tipoReceituario].observacao}
                </p>
              </div>

              {MODELOS_RECEITUARIO[tipoReceituario].exigeNumeracao &&
            <div>
                  <label
                htmlFor="numeracao-talonario"
                className="block text-sm font-medium text-gray-700 mb-1.5">
                
                    Numeração do talonário
                  </label>
                  <input
                id="numeracao-talonario"
                value={numeracaoTalonario}
                onChange={(e) => setNumeracaoTalonario(e.target.value)}
                placeholder="Numeração fornecida pela Vigilância Sanitária"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
              
                  <p className="text-xs text-amber-700 mt-1.5">
                    Este número não existe no cadastro do sistema: informe a
                    numeração do talonário concedida pela autoridade sanitária.
                  </p>
                </div>
            }

              {pendenciasReceituario.length > 0 &&
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                    <AlertCircleIcon className="w-4 h-4" />
                    Não é possível imprimir: campos obrigatórios ausentes
                  </p>
                  <ul className="mt-2 space-y-1">
                    {pendenciasReceituario.map((p) =>
                <li key={p.campo} className="text-xs text-red-700">
                        • {p.campo}{' '}
                        <span className="text-red-500">({p.onde})</span>
                      </li>
                )}
                  </ul>
                </div>
            }
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReceituarioModal(false)}>
              
                Cancelar
              </Button>
              <Button
              size="sm"
              onClick={imprimirReceituarioControlado}
              className="bg-teal-600 hover:bg-teal-700 text-white">
              
                <PrinterIcon className="w-4 h-4 mr-2" />
                Visualizar e imprimir
              </Button>
            </div>
          </div>
        </div>
      }
    </div>);

}