import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  Component } from
'react';
import { CampoRecolhivel } from '../CampoRecolhivel';
import { EditorDocumento } from '../EditorDocumento';
import { paraHtmlImpressao, paraTextoSimples } from '../../../utils/htmlTexto';
import {
  resolverEspecialidade,
  resolverConselho } from
'../../../utils/especialidadeHelper';
import {
  cssDocumentoPaginado,
  cssQuebrasPagina,
  faixaIdentificacao } from
'../../../utils/documentoImpressao';
import {
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  TagIcon,
  PlusIcon,
  PrinterIcon,
  EditIcon,
  TrashIcon,
  CopyIcon,
  XIcon,
  SearchIcon,
  FileTextIcon,
  StethoscopeIcon,
  ActivityIcon,
  CheckSquareIcon,
  Loader2Icon } from
'lucide-react';
import { PadroesExameModal } from './PadroesExameModal';
import { ExamesGratuitosSelector } from './ExamesGratuitosSelector';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useDebounce } from '../../../hooks/useDebounce';
import { API_BASE_URL } from '../../../config/api';
interface ExameItem {
  id: string;
  data: string;
  medico: string;
  profissionalId?: string;
  descricao: string;
  pedido: string;
  justificativa: string;
  cid10: string;
}
interface ExameData {
  profissionalId: string;
  descricao: string;
  pedido: string;
  justificativa: string;
  cid10: string;
  /**
   * Quando presente, o salvamento ATUALIZA este registro em vez de criar um
   * novo. É o que impede que cada exame marcado gere um pedido diferente no
   * histórico.
   */
  registroId?: string;
}
/**
 * Um registro é um pedido de EXAMES DE ROTINA. A comparação é normalizada
 * (maiúsculas/espaços) porque registros antigos gravaram a descrição em
 * formatos diferentes — e uma comparação estrita fazia a tela trocar de aba
 * sozinha ao abrir esses registros.
 */
const ehPedidoRotina = (descricao?: string) =>
(descricao || '').toUpperCase().trim() === 'EXAMES DE ROTINA';
interface ExamesEtapaProps {
  data?: ExameData;
  historico?: ExameItem[];
  /** Id do registro atualmente aberto — apenas para destacá-lo no histórico. */
  registroAbertoId?: string;
  medicos?: {
    id: string;
    nome: string;
  }[];
  onChange?: (data: ExameData) => void;
  onSave?: (
  data: ExameData)
  => void | Promise<void> | Promise<{id?: string;} | void>;
  onDelete?: (id: string) => void;
  onDuplicate?: (item: ExameItem) => void;
  onNovoExame?: () => void;
  readOnly?: boolean;
  clinicaId?: string;
  profissionalId?: string;
  pacienteId?: string;
  atendimentoId?: string | null;
  // ⭐ NOVO: Dados completos do profissional (para impressão profissional)
  profissionalDoProntuario?: {
    id: string;
    nome: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
  };
  // ⭐ NOVO: Nome do paciente (para impressão)
  pacienteNome?: string;
}
function getClinicaIdFallback(): string {
  try {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      return parsed.clinicaAtual?.id || '';
    }
  } catch (e) {}
  return '';
}
export function ExamesEtapa({
  data,
  historico = [],
  medicos = [],
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onNovoExame,
  registroAbertoId = '',
  readOnly = false,
  clinicaId: clinicaIdProp,
  profissionalId,
  pacienteId,
  atendimentoId,
  profissionalDoProntuario,
  pacienteNome
}: ExamesEtapaProps) {
  const clinicaId = clinicaIdProp || getClinicaIdFallback();
  const profissionalIdEfetivo = profissionalId || '';
  // ⭐ Última vez que cada exame de rotina foi solicitado para este paciente.
  // Derivado do próprio histórico já carregado (registros "EXAMES DE ROTINA",
  // cujo campo `pedido` guarda os nomes dos exames, um por linha) — sem
  // depender de nova rota no servidor.
  const ultimasDatasExames = useMemo(() => {
    const mapa: Record<string, string> = {};
    historico.forEach((item) => {
      if (!ehPedidoRotina(item.descricao)) return;
      if (!item.pedido || !item.data) return;
      item.pedido.
      split('\n').
      map((nome) => nome.trim()).
      filter(Boolean).
      forEach((nome) => {
        const chave = nome.toLowerCase();
        const atual = mapa[chave];
        // Mantém sempre a data mais recente entre as solicitações.
        if (!atual || new Date(item.data) > new Date(atual)) {
          mapa[chave] = item.data;
        }
      });
    });
    return mapa;
  }, [historico]);

  // ⭐ formData é usado APENAS pela aba "Solicitação Livre"
  const [formData, setFormData] = useState<ExameData>({
    profissionalId: data?.profissionalId || profissionalIdEfetivo || '',
    descricao: data?.descricao || '',
    pedido: data?.pedido || '',
    justificativa: data?.justificativa || '',
    cid10: data?.cid10 || ''
  });
  // Painel lateral (histórico e dicas) recolhível — quando escondido, o
  // formulário usa toda a largura. A preferência é lembrada entre acessos.
  // Começa escondido: a tela abre com o formulário em largura máxima.
  const [painelVisivel, setPainelVisivel] = useState<boolean>(() => {
    try {
      return localStorage.getItem('exames.painelLateral') === 'visivel';
    } catch {
      return false;
    }
  });
  const alternarPainel = () => {
    setPainelVisivel((v) => {
      try {
        localStorage.setItem('exames.painelLateral', v ? 'oculto' : 'visivel');
      } catch {}
      return !v;
    });
  };
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
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
  const dataRecebidaRef = useRef(false);
  const formDataRef = useRef(formData);
  // ⭐ NOVO: Dados do paciente para impressão (carregados sob demanda)
  const [pacienteData, setPacienteData] = useState<{
    nome: string;
    cpf: string;
    dataNascimento: string;
    titularId?: string;
  } | null>(null);
  // ⭐ Tipo de solicitação (gratuito vs outro)
  const [tipoSolicitacao, setTipoSolicitacao] = useState<'gratuito' | 'outro'>(
    'outro'
  );
  // A coluna da direita existe quando há histórico visível ou quando a
  // solicitação livre está aberta (ela hospeda a Justificativa Clínica).
  const colunaLateralVisivel = painelVisivel || tipoSolicitacao === 'outro';
  // ⭐ NOVO: Estado separado para rastrear o último save de rotina
  // Quando rotina salva, marca como true para que o próximo save livre crie um NOVO registro
  const [rotinaSalvou, setRotinaSalvou] = useState(false);
  // ⭐ NOVO: Preserva formData do livre quando muda para rotina
  const livreFormDataRef = useRef<ExameData>(formData);
  // ===== Controle do pedido de ROTINA em edição =====
  // Todo o conjunto marcado pertence a UM pedido: o primeiro salvamento cria o
  // registro e os seguintes o atualizam. "Novo Pedido" é o único caminho que
  // inicia outro registro — antes, cada exame marcado gerava um pedido.
  const rotinaRegistroIdRef = useRef<string>('');
  const rotinaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rotinaResetSeq, setRotinaResetSeq] = useState(0);
  const [rotinaQtde, setRotinaQtde] = useState(0);
  // Identificação do pedido de rotina aberto (vazio = pedido novo). Serve para
  // o usuário saber SE está alterando um pedido do histórico ou criando outro.
  const [rotinaRegistroId, setRotinaRegistroId] = useState('');
  const [rotinaRegistroData, setRotinaRegistroData] = useState('');
  /**
   * Seleção que a aba de rotina deve carregar. É estado próprio (e não derivado
   * de `data`, que muda a cada clique) para que abrir um pedido do histórico
   * SUBSTITUA a seleção, em vez de misturar com a que estava na tela.
   */
  const [rotinaSemente, setRotinaSemente] = useState<string[] | undefined>(() =>
  data?.descricao === 'EXAMES DE ROTINA' && data?.pedido ?
  data.pedido.split('\n').filter(Boolean) :
  undefined
  );
  /**
   * Grava o pedido de rotina: cria no primeiro salvamento e ATUALIZA nos
   * seguintes, mantendo um único registro no histórico por pedido.
   */
  const salvarPedidoRotina = async (lista: string[]) => {
    if (!onSave || readOnly || lista.length === 0) return;
    setIsSaving(true);
    try {
      const resultado: any = await Promise.resolve(
        onSave({
          profissionalId:
          profissionalDoProntuario?.id || formData.profissionalId || '',
          descricao: 'EXAMES DE ROTINA',
          pedido: lista.join('\n'),
          justificativa: '',
          cid10: '',
          registroId: rotinaRegistroIdRef.current || undefined
        })
      );
      if (!rotinaRegistroIdRef.current && resultado?.id) {
        rotinaRegistroIdRef.current = String(resultado.id);
      }
      setLastSaved(new Date());
      setHasChanges(false);
      setRotinaSalvou(true);
    } catch (err) {
      console.error('❌ [ExamesRotina] Erro ao salvar o pedido:', err);
    } finally {
      setIsSaving(false);
    }
  };
  // Evita salvamento pendente disparando depois que a aba foi desmontada.
  useEffect(
    () => () => {
      if (rotinaTimerRef.current) clearTimeout(rotinaTimerRef.current);
    },
    []
  );
  // Registro aberto: na rotina é o pedido em edição; na livre, o id que o
  // prontuário informa. Serve só para destacar a linha no histórico — o item
  // NÃO é mais removido da lista, que era o que fazia o histórico "sumir".
  const registroAberto = rotinaRegistroId || registroAbertoId;
  /** Data do banco (com ou sem hora) exibida como dd/mm/aaaa. */
  const formatarDataBR = (valor: string) => {
    if (!valor) return '';
    const limpa = valor.toString().trim().split(' ')[0].split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(limpa)) return limpa;
    return new Date(`${limpa}T12:00:00`).toLocaleDateString('pt-BR');
  };
  /** Inicia um pedido de rotina em branco (novo registro no histórico). */
  const iniciarNovoPedidoRotina = () => {
    if (rotinaTimerRef.current) {
      clearTimeout(rotinaTimerRef.current);
      rotinaTimerRef.current = null;
    }
    rotinaRegistroIdRef.current = '';
    setRotinaRegistroId('');
    setRotinaRegistroData('');
    setRotinaSemente(undefined);
    setRotinaQtde(0);
    setRotinaResetSeq((s) => s + 1);
    setHasChanges(false);
    setLastSaved(null);
    onNovoExame?.();
  };
  /**
   * Abre um registro do histórico na aba CORRETA, substituindo por completo o
   * que estava em edição. Antes, um pedido de rotina era carregado sem trocar
   * de aba e sem recarregar a seleção — a tela seguia mostrando os exames do
   * pedido anterior, misturando os dois.
   */
  const abrirRegistroHistorico = (item: ExameItem) => {
    if (rotinaTimerRef.current) {
      clearTimeout(rotinaTimerRef.current);
      rotinaTimerRef.current = null;
    }
    const ehRotina = ehPedidoRotina(item.descricao);
    if (ehRotina) {
      const lista = (item.pedido || '').split('\n').filter(Boolean);
      rotinaRegistroIdRef.current = item.id ? String(item.id) : '';
      setRotinaRegistroId(item.id ? String(item.id) : '');
      setRotinaRegistroData(item.data || '');
      setRotinaSemente(lista);
      setRotinaQtde(lista.length);
      setRotinaResetSeq((s) => s + 1);
      setTipoSolicitacao('gratuito');
    } else {
      // Solicitação livre: sai do pedido de rotina para não continuar
      // gravando sobre ele.
      rotinaRegistroIdRef.current = '';
      setRotinaRegistroId('');
      setRotinaRegistroData('');
      setRotinaSemente(undefined);
      setRotinaQtde(0);
      setRotinaResetSeq((s) => s + 1);
      setTipoSolicitacao('outro');
    }
    setHasChanges(false);
    setLastSaved(null);
    onDuplicate?.(item);
  };
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  // ⭐ Quando muda de aba, preserva/restaura dados
  const handleTipoChange = (tipo: 'gratuito' | 'outro') => {
    if (tipo === 'gratuito' && tipoSolicitacao === 'outro') {
      // Saindo de livre → salva formData atual do livre
      livreFormDataRef.current = {
        ...formData
      };
    } else if (tipo === 'outro' && tipoSolicitacao === 'gratuito') {
      // Voltando para livre → restaura formData do livre
      // Se rotina salvou, limpa o ID para criar novo registro livre
      if (rotinaSalvou) {
        onNovoExame?.();
        setRotinaSalvou(false);
      }
      setFormData(livreFormDataRef.current);
      setHasChanges(false);
      setLastSaved(null);
    }
    setTipoSolicitacao(tipo);
  };
  // ⭐ Lista de médicos da clínica (para resolver nome pelo ID)
  const [medicosClinica, setMedicosClinica] = useState<
    {
      id: string;
      nome: string;
    }[]>(
    []);
  useEffect(() => {
    const carregarMedicos = async () => {
      if (!clinicaId) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const usuarios = await response.json();
          const medicosFiltrados = usuarios.
          filter(
            (u: any) =>
            u.ativo &&
            ['medico', 'dentista', 'profissional', 'admin'].includes(
              u.tipo
            )
          ).
          map((u: any) => ({
            id: u.id,
            nome: u.nome
          }));
          setMedicosClinica(medicosFiltrados);
        }
      } catch (err) {
        console.error('Erro ao carregar médicos:', err);
      }
    };
    carregarMedicos();
  }, [clinicaId]);
  // ⭐ NOVO: Carrega dados do paciente para impressão
  useEffect(() => {
    const carregarPaciente = async () => {
      if (!pacienteId || !clinicaId) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const data = await response.json();
          setPacienteData({
            nome: data.nome || '',
            cpf: data.cpf || '',
            dataNascimento: data.dataNascimento || '',
            titularId: data.titularId || ''
          });
        }
      } catch (err) {
        console.error('Erro ao carregar dados do paciente:', err);
      }
    };
    carregarPaciente();
  }, [pacienteId, clinicaId]);
  // ⭐ HELPER: Resolve nome do médico pelo ID (fonte de verdade = profissionalId)
  const getNomeMedico = useCallback(
    (id: string): string => {
      if (!id) return '';
      const allMedicos = medicosClinica.length > 0 ? medicosClinica : medicos;
      const encontrado = allMedicos.find((m) => m.id === id);
      return encontrado?.nome || '';
    },
    [medicosClinica, medicos]
  );
  // ⭐ Sincroniza data prop → formData (quando dados chegam do banco)
  // APENAS se NÃO é dado de rotina (evita poluir o form livre)
  useEffect(() => {
    if (data && !hasChanges) {
      const temDados = !!(
      data.profissionalId ||
      data.descricao ||
      data.pedido ||
      data.justificativa ||
      data.cid10);

      if (temDados) {
        dataRecebidaRef.current = true;
      }
      // ⭐ FIX: Auto-switch de aba conforme tipo do exame carregado do histórico
      const isRotina = ehPedidoRotina(data.descricao);
      if (isRotina && tipoSolicitacao === 'outro') {
        // Dados de rotina chegaram mas estamos na aba livre — salva dados do livre e muda para aba rotina
        livreFormDataRef.current = {
          ...formData
        };
        setTipoSolicitacao('gratuito');
      } else if (
      !isRotina &&
      tipoSolicitacao === 'gratuito' && (
      data.pedido || data.descricao))
      {
        // Dados de solicitação livre chegaram mas estamos na aba rotina — muda para aba livre
        setTipoSolicitacao('outro');
      }
      // Dado de ROTINA nunca é copiado para o formulário da Solicitação Livre:
      // era isso que fazia a lista de exames marcados aparecer dentro do
      // "Pedido Detalhado", misturando os dois tipos de solicitação.
      if (!isRotina) {
        setFormData((prev) => ({
          ...prev,
          ...data
        }));
        livreFormDataRef.current = {
          ...formData,
          ...data
        };
      }
    }
  }, [data, hasChanges]);
  // ⭐ CORRIGIDO: Auto-preenche profissionalId do profissionalDoProntuario (prioridade máxima)
  useEffect(() => {
    if (profissionalDoProntuario?.id && !formData.profissionalId) {
      setFormData((prev) => ({
        ...prev,
        profissionalId: profissionalDoProntuario.id
      }));
    }
  }, [profissionalDoProntuario?.id]);
  // ⭐ Se não veio profissionalId nos dados mas veio via prop, usa o prop
  useEffect(() => {
    if (
    profissionalIdEfetivo &&
    !formData.profissionalId &&
    !dataRecebidaRef.current &&
    !profissionalDoProntuario?.id)
    {
      setFormData((prev) => ({
        ...prev,
        profissionalId: profissionalIdEfetivo
      }));
    }
  }, [
  profissionalIdEfetivo,
  formData.profissionalId,
  profissionalDoProntuario?.id]
  );
  const medicosList =
  medicosClinica.length > 0 ?
  medicosClinica :
  medicos.length > 0 ?
  medicos :
  [];
  // Resumo mostrado na barra recolhida das informações da solicitação livre.
  const resumoInformacoes = useMemo(() => {
    const partes: string[] = [];
    if (formData.descricao.trim()) partes.push(formData.descricao.trim());
    const medico = profissionalDoProntuario?.nome ?
    profissionalDoProntuario.nome :
    medicosList.find((m) => m.id === formData.profissionalId)?.nome || '';
    if (medico) partes.push(medico);
    if (formData.cid10.trim()) partes.push(`CID ${formData.cid10.trim()}`);
    return partes.join(' · ');
  }, [
  formData.descricao,
  formData.profissionalId,
  formData.cid10,
  medicosList,
  profissionalDoProntuario?.nome]
  );
  const debouncedSave = useDebounce(async (currentData: ExameData) => {
    if (readOnly || !onSave) return;
    setIsSaving(true);
    try {
      await onSave(currentData);
      setLastSaved(new Date());
      setHasChanges(false);
    } catch (error) {
      console.error('Erro ao salvar exame:', error);
    } finally {
      setIsSaving(false);
    }
  }, 2000);
  const handleChange = (field: keyof ExameData, value: string) => {
    const newData = {
      ...formData,
      [field]: value
    };
    setFormData(newData);
    setHasChanges(true);
    onChange?.(newData);
    debouncedSave(newData);
  };
  const handleManualSave = async () => {
    if (readOnly || !onSave) return;
    setIsSaving(true);
    try {
      await onSave(formData);
      setLastSaved(new Date());
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };
  const handleSelectPadrao = (padraoData: Partial<ExameData>) => {
    const newData = {
      ...formData,
      ...padraoData
    };
    setFormData(newData);
    setHasChanges(true);
    onChange?.(newData);
    debouncedSave(newData);
  };
  // ⭐ Geração de PDF — layout profissional conforme modelo do médico
  const handlePrint = () => {
    // Preserva no papel a formatação escrita no editor (alinhamento, negrito,
    // listas). Texto puro de registros antigos continua com as quebras.
    const examesTexto = paraHtmlImpressao(
      formData.pedido || formData.descricao || ''
    );
    const justificativaTexto = paraHtmlImpressao(formData.justificativa || '');
    // ⭐ CORRIGIDO: Resolve dados do profissional (prioridade: profissionalDoProntuario > formData.profissionalId > NUNCA localStorage)
    let profissionalNome = '';
    let profissionalCrm = '';
    let profissionalUf = '';
    let profissionalEspecialidade = '';
    let prefixoConselho = 'CRM';
    let profissionalTitulo = '';
    let profissionalCabecalho = '';
    let profissionalRqes: Array<{
      especialidade: string;
      rqe: string;
    }> = [];
    if (profissionalDoProntuario) {
      profissionalNome = profissionalDoProntuario.nome || '';
      profissionalCrm = profissionalDoProntuario.crm || '';
      profissionalUf = profissionalDoProntuario.uf || '';
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
      // ⭐ NOVO: Extrai titulo, cabecalhoRelatorio e RQEs do profissional
      profissionalTitulo = (profissionalDoProntuario as any).titulo || '';
      profissionalCabecalho =
      (profissionalDoProntuario as any).cabecalhoRelatorio || '';
      try {
        const rawRqes = (profissionalDoProntuario as any).rqes;
        const parsed =
        typeof rawRqes === 'string' ? JSON.parse(rawRqes) : rawRqes;
        if (Array.isArray(parsed))
        profissionalRqes = parsed.filter((r: any) => r.especialidade && r.rqe);
      } catch {

        /* ignore */}
    } else {
      // ⭐ CORRIGIDO: Fallback resolve pelo ID selecionado no form — NÃO usa localStorage (evita "Admin Sistema")
      profissionalNome = getNomeMedico(formData.profissionalId);
      // Tenta buscar CRM/UF do profissional selecionado na lista de médicos
      // NÃO usa dados do usuário logado (que pode ser admin/atendente)
    }
    const crmComUf = profissionalCrm ?
    profissionalCrm + (profissionalUf ? '/' + profissionalUf : '') :
    '';
    // ⭐ Dados da clínica
    let clinicaNome = '';
    let clinicaEndereco = '';
    let clinicaTelefone = '';
    let clinicaEmail = '';
    let clinicaCnpj = '';
    let clinicaLogoUrl = '';
    let clinicaDescricao = '';
    let clinicaSite = '';
    try {
      const sessao = JSON.parse(localStorage.getItem('sessao') || '{}');
      clinicaNome = sessao.clinicaAtual?.nome || '';
      clinicaEndereco = sessao.clinicaAtual?.endereco || '';
      clinicaTelefone = sessao.clinicaAtual?.telefone || '';
      clinicaEmail = sessao.clinicaAtual?.email || '';
      clinicaCnpj = sessao.clinicaAtual?.cnpj || '';
      clinicaLogoUrl =
      sessao.clinicaAtual?.logoUrl ||
      sessao.operadoraSelecionada?.logoUrl ||
      '';
      clinicaDescricao = sessao.clinicaAtual?.descricao || '';
      clinicaSite = sessao.clinicaAtual?.site || '';
    } catch (e) {}
    // ⭐ Dados do paciente
    const nomePaciente = pacienteData?.nome || pacienteNome || '';
    const cpfPaciente = pacienteData?.cpf || '';
    let idadePaciente = '';
    if (pacienteData?.dataNascimento) {
      try {
        const nasc = new Date(pacienteData.dataNascimento);
        const hoje = new Date();
        let idade = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || m === 0 && hoje.getDate() < nasc.getDate()) idade--;
        if (idade >= 0) idadePaciente = String(idade);
      } catch {

        /* ignore */}
    }
    const logoHtml = clinicaLogoUrl ?
    '<img src="' +
    clinicaLogoUrl +
    '" alt="Logo" style="max-height:70px;max-width:110px;object-fit:contain;border-radius:6px;" />' :
    '';
    // ⭐ CSS profissional — layout conforme modelo médico
    const css = `
      @page { size: A4; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }
      ${cssDocumentoPaginado()}
      ${cssQuebrasPagina('.body')}

      /* HEADER */
      .header { background: #edf3fb; border-bottom: 3px solid #1565C0; padding: 20px 28px; display: flex; align-items: center; gap: 20px; }
      .header-logo { flex-shrink: 0; width: 100px; display: flex; align-items: center; justify-content: center; }
      .header-logo img { border-radius: 8px; }
      .header-center { flex: 1; text-align: center; }
      .header-center h1 { font-size: 22px; font-weight: bold; color: #0D47A1; letter-spacing: 0.5px; margin-bottom: 2px; text-transform: uppercase; }
      .header-center .especialidade { font-size: 13px; font-weight: bold; color: #1565C0; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
      .header-center .titulos { font-size: 8px; color: #475569; line-height: 1.6; text-transform: uppercase; }
      .header-crm { flex-shrink: 0; width: 100px; text-align: right; }
      .header-crm .crm-label { font-size: 10px; color: #64748b; }
      .header-crm .crm-numero { font-size: 16px; font-weight: bold; color: #0D47A1; }

      /* BODY */
      .body { padding: 20px 28px 26px; }
      .descricao-titulo { font-size: 14px; font-weight: bold; color: #1e293b; text-decoration: underline; margin-bottom: 12px; text-transform: uppercase; }
      .paciente-line { font-size: 11px; font-weight: bold; color: #1e293b; margin-bottom: 16px; }
      .secao-titulo { font-size: 10px; font-weight: bold; text-transform: uppercase; margin: 18px 0 6px 0; color: #1e293b; }
      .secao-corpo { font-size: 11px; white-space: pre-wrap; line-height: 1.7; margin-bottom: 10px; color: #334155; }
      .cid-info { font-size: 9px; color: #555; margin-top: 8px; }

      /* ASSINATURA — alinhada à direita */
      .assinatura-bloco { text-align: right; margin-top: 40px; font-size: 10px; line-height: 1.6; }
      .assinatura-bloco .nome { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #1e293b; }
      .assinatura-bloco .detalhe { font-size: 10px; color: #475569; }
      .assinatura-bloco .crm { font-size: 10px; color: #0D47A1; font-weight: bold; }

      /* FOOTER */
      .footer { background: #edf3fb; border-top: 3px solid #1565C0; padding: 10px 28px; text-align: center; font-size: 9px; color: #475569; line-height: 1.5; }
      .footer .clinica-nome { font-size: 14px; font-weight: bold; color: #0D47A1; margin-bottom: 2px; }
      .footer .clinica-desc { font-size: 8px; color: #1565C0; margin-bottom: 4px; font-style: italic; }
      .footer .clinica-info { font-size: 9px; color: #475569; }
      .footer .pag { font-size: 8px; color: #999; text-align: right; margin-top: 4px; }

      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc { margin: 0; } }
    `;
    const h: string[] = [];
    h.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">');
    h.push('<title>Solicitação de Exames</title>');
    h.push('<sty' + 'le>' + css + '</sty' + 'le>');
    h.push('</head><body>');
    // Documento paginado: cabeçalho e rodapé repetidos em todas as folhas
    h.push('<table class="doc"><thead><tr><td>');
    // ===== HEADER =====
    h.push('<div class="header">');
    if (logoHtml) h.push('<div class="header-logo">' + logoHtml + '</div>');
    h.push('<div class="header-center">');
    // ⭐ NOVO: Usa titulo do cadastro do profissional ao invés de 'Dr(a).' hardcoded
    const tituloDisplay = profissionalTitulo ? profissionalTitulo + ' ' : '';
    if (profissionalNome)
    h.push('<h1>' + tituloDisplay + profissionalNome + '</h1>');
    if (profissionalEspecialidade)
    h.push(
      '<div class="especialidade">' + profissionalEspecialidade + '</div>'
    );
    // ⭐ NOVO: Se tem cabecalhoRelatorio personalizado, usa ele; senão monta automaticamente
    if (profissionalCabecalho) {
      h.push(
        '<div class="titulos">' +
        profissionalCabecalho.replace(/\n/g, '<br/>') +
        '</div>'
      );
    } else {
      // Títulos/credenciais da clínica no header
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
      h.push('<div class="titulos">' + infoLines.join('<br/>') + '</div>');
    }
    h.push('</div>');
    // CRM no canto direito
    if (crmComUf)
    h.push(
      '<div class="header-crm"><div class="crm-label">' +
      prefixoConselho +
      '</div><div class="crm-numero">' +
      crmComUf +
      '</div></div>'
    );
    h.push('</div>');
    h.push(
      faixaIdentificacao(
        nomePaciente,
        'Solicitação de Exames',
        new Date().toLocaleDateString('pt-BR')
      )
    );
    h.push('</td></tr></thead>');
    // ===== FOOTER (declarado antes do corpo para repetir em cada página) =====
    h.push('<tfoot><tr><td>');
    h.push('<div class="footer">');
    if (clinicaNome)
    h.push('<div class="clinica-nome">' + clinicaNome + '</div>');
    if (clinicaDescricao)
    h.push('<div class="clinica-desc">' + clinicaDescricao + '</div>');
    const rodapeLinhas: string[] = [];
    if (clinicaEndereco) rodapeLinhas.push(clinicaEndereco);
    if (clinicaTelefone) rodapeLinhas.push('Telefone: ' + clinicaTelefone);
    if (rodapeLinhas.length > 0)
    h.push(
      '<div class="clinica-info">' + rodapeLinhas.join('<br/>') + '</div>'
    );
    const rodapeExtra: string[] = [];
    if (clinicaEmail) rodapeExtra.push('Email: ' + clinicaEmail);
    if (clinicaSite) rodapeExtra.push('Site: ' + clinicaSite);
    if (rodapeExtra.length > 0)
    h.push('<div class="clinica-info">' + rodapeExtra.join(' ') + '</div>');
    h.push('</div>');
    h.push('</td></tr></tfoot>');
    // ===== BODY =====
    h.push('<tbody><tr><td>');
    h.push('<div class="body">');
    // Título/Descrição do exame
    if (formData.descricao)
    h.push('<div class="descricao-titulo">' + formData.descricao + '</div>');
    // Linha do paciente
    if (nomePaciente) {
      let pacienteLine = 'PACIENTE: ' + nomePaciente.toUpperCase();
      if (cpfPaciente) pacienteLine += ' - CPF: ' + cpfPaciente;
      if (idadePaciente) pacienteLine += ', ' + idadePaciente + ' ANOS';
      h.push('<div class="paciente-line">' + pacienteLine + '</div>');
    }
    // Exames solicitados
    if (examesTexto) {
      h.push('<div class="secao-titulo">Exames Solicitados:</div>');
      h.push('<div class="secao-corpo">' + examesTexto + '</div>');
    }
    // CID-10
    if (formData.cid10) {
      h.push('<div class="cid-info">CID-10: ' + formData.cid10 + '</div>');
    }
    // Justificativa
    if (justificativaTexto) {
      h.push('<div class="secao-titulo">Justificativa:</div>');
      h.push('<div class="secao-corpo">' + justificativaTexto + '</div>');
    }
    // ===== ASSINATURA (direita) =====
    h.push('<div class="assinatura-bloco">');
    if (profissionalNome)
    h.push(
      '<div class="nome">' +
      (tituloDisplay + profissionalNome).toUpperCase() +
      '</div>'
    );
    // Especialidades com RQE (se disponível)
    if (profissionalEspecialidade) {
      const especialidades = profissionalEspecialidade.
      split(',').
      map((e: string) => e.trim());
      especialidades.forEach((esp: string) => {
        h.push('<div class="detalhe">' + esp + '</div>');
      });
    }
    if (crmComUf)
    h.push('<div class="crm">' + prefixoConselho + ' ' + crmComUf + '</div>');
    // ⭐ NOVO: Exibe RQEs na assinatura
    if (profissionalRqes.length > 0) {
      profissionalRqes.forEach((r) => {
        h.push(
          '<div class="detalhe">' +
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
      const nomeArquivo = `Solicitacao_Exames_${nomePaciente ? nomePaciente.replace(/\s+/g, '_') + '_' : ''}${new Date().toISOString().split('T')[0]}.pdf`;
      previewDocumentoPDF(h.join('\n'), {
        fileName: nomeArquivo
      });
    });
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
  const filteredCids = cidResultados.filter(
    (cid) =>
    !(formData.cid10 || '').
    split(',').
    map((c) => c.trim().toUpperCase()).
    includes(cid.codigo.toUpperCase())
  );
  // ⭐ Helper: resolve nome do médico para item do histórico (ID primeiro, fallback para nome legacy)
  const resolverNomeMedicoHistorico = (item: ExameItem): string => {
    if (item.profissionalId) {
      const nome = getNomeMedico(item.profissionalId);
      if (nome) return nome;
    }
    return item.medico || ''; // fallback para registros antigos que só têm nome
  };
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* ===== HEADER FIXO ===== */}
      <div className="flex-shrink-0 border-b border-gray-100 pb-4 mb-4 bg-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-light text-teal-700 flex items-center gap-2">
              <ActivityIcon className="w-6 h-6" />
              Solicitação de Exames
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Preencha os dados para gerar o pedido de exame
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

            {/* Rotina: inicia OUTRO pedido, em vez de continuar alterando o
                 pedido já gravado. */}
            {!readOnly && tipoSolicitacao === 'gratuito' &&
            <Button
              variant="outline"
              size="sm"
              title="Limpa a seleção e inicia um novo pedido de exames de rotina, sem alterar o que já foi gravado."
              onClick={iniciarNovoPedidoRotina}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              
                <PlusIcon className="w-4 h-4 mr-2" />
                Novo Pedido
              </Button>
            }

            {!readOnly && onNovoExame && tipoSolicitacao === 'outro' &&
            <Button
              variant="outline"
              size="sm"
              title="Limpa o formulário para criar uma nova solicitação de exame em branco."
              onClick={() => {
                onNovoExame();
                const emptyData = {
                  profissionalId: profissionalDoProntuario?.id || '',
                  descricao: '',
                  pedido: '',
                  justificativa: '',
                  cid10: ''
                };
                setFormData(emptyData);
                livreFormDataRef.current = emptyData;
                setHasChanges(false);
                setLastSaved(null);
                dataRecebidaRef.current = false;
                setCidSearch('');
              }}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              
                <PlusIcon className="w-4 h-4 mr-2" />
                Novo Exame
              </Button>
            }

            <Button
              variant="outline"
              size="sm"
              title={
              painelVisivel ?
              'Esconde o histórico e as dicas, deixando o formulário em largura total.' :
              'Mostra o histórico de exames e as dicas de preenchimento.'
              }
              onClick={alternarPainel}
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              
              <ClockIcon className="w-4 h-4 mr-2" />
              {painelVisivel ?
              'Esconder histórico' :
              `Histórico (${historico.length})`}
            </Button>

            {tipoSolicitacao === 'outro' &&
            <Button
              variant="outline"
              size="sm"
              title="Abre a lista de modelos de exames salvos pelo profissional."
              onClick={() => setShowPadroesModal(true)}
              disabled={readOnly}
              className="text-teal-600 border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-colors">
              
                <TagIcon className="w-4 h-4 mr-2" />
                Padrões
              </Button>
            }

            {tipoSolicitacao === 'outro' &&
            <Button
              variant="outline"
              size="sm"
              title="Gera PDF do pedido de exame para download."
              onClick={handlePrint}
              disabled={
              !paraTextoSimples(formData.pedido).trim() &&
              !formData.descricao.trim()
              }
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              
                <PrinterIcon className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
            }

            {!readOnly && tipoSolicitacao === 'outro' &&
            <Button
              size="sm"
              title="Salva manualmente as alterações do pedido de exame."
              onClick={handleManualSave}
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
      <div className="flex-1 overflow-y-auto min-h-0">
        <div
          className={`grid grid-cols-1 gap-4 ${colunaLateralVisivel ? 'lg:grid-cols-3' : ''}`}>
          
          {/* Coluna Principal */}
          <div
            className={`space-y-4 ${colunaLateralVisivel ? 'lg:col-span-2' : ''}`}>
            
            {/* ⭐ TABS: Tipo de Solicitação — usa handleTipoChange para preservar dados */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md">
              <button
                onClick={() => handleTipoChange('gratuito')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all ${tipoSolicitacao === 'gratuito' ? 'bg-white text-teal-700 shadow-sm border border-teal-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                
                <CheckSquareIcon className="w-4 h-4" />
                Exames de Rotina
              </button>
              <button
                onClick={() => handleTipoChange('outro')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all ${tipoSolicitacao === 'outro' ? 'bg-white text-teal-700 shadow-sm border border-teal-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                
                <FileTextIcon className="w-4 h-4" />
                Solicitação Livre
              </button>
            </div>

            {/* ⭐ CONTEÚDO: Exames de Rotina */}
            {tipoSolicitacao === 'gratuito' &&
            <>
                {/* Deixa explícito se a seleção pertence a um pedido do
                   histórico ou a um pedido novo. */}
                <div
                className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${rotinaRegistroId ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                
                  <span className="font-medium">
                    {rotinaRegistroId ?
                  `Alterando o pedido de ${formatarDataBR(rotinaRegistroData) || 'data não informada'} — ${rotinaQtde} exame(s)` :
                  `Novo pedido de rotina — ${rotinaQtde} exame(s) selecionado(s)`}
                  </span>
                  {rotinaRegistroId && !readOnly &&
                <button
                  type="button"
                  onClick={iniciarNovoPedidoRotina}
                  className="font-semibold underline underline-offset-2 hover:text-amber-700">
                  
                      Iniciar novo pedido
                    </button>
                }
                </div>
                <ExamesGratuitosSelector
                clinicaId={clinicaId}
                pacienteNome={pacienteData?.nome || pacienteNome}
                pacienteDataNascimento={pacienteData?.dataNascimento}
                pacienteTipoVinculo={
                pacienteData?.titularId ? 'DEPENDENTE' : 'TITULAR'
                }
                profissionalDoProntuario={profissionalDoProntuario}
                ultimasDatas={ultimasDatasExames}
                key={`rotina-${rotinaResetSeq}`}
                examesSalvos={rotinaSemente}
                onExamesSelecionados={(examesSelecionados) => {
                  // A seleção inteira é UM pedido: agenda um único salvamento
                  // após a última marcação, em vez de gravar por exame.
                  setRotinaQtde(examesSelecionados.length);
                  onChange?.({
                    profissionalId:
                    profissionalDoProntuario?.id ||
                    formData.profissionalId ||
                    '',
                    descricao: 'EXAMES DE ROTINA',
                    pedido: examesSelecionados.join('\n'),
                    justificativa: '',
                    cid10: ''
                  });
                  if (rotinaTimerRef.current) {
                    clearTimeout(rotinaTimerRef.current);
                    rotinaTimerRef.current = null;
                  }
                  if (readOnly || !onSave || examesSelecionados.length === 0)
                  return;
                  setHasChanges(true);
                  rotinaTimerRef.current = setTimeout(() => {
                    salvarPedidoRotina(examesSelecionados);
                  }, 1200);
                }} />
              
              </>
            }

            {/* ⭐ CONTEÚDO: Formulário Livre — usa formData independente */}
            {tipoSolicitacao === 'outro' &&
            <Card className="p-4 border-t-4 border-t-teal-500 shadow-sm">
                <div className="space-y-3">
                  {/* Médico, CID e Título — recolhidos por padrão para o pedido
                     detalhado ser o protagonista da tela. */}
                  <CampoRecolhivel
                  titulo="Informações da solicitação"
                  valor={resumoInformacoes}>
                  
                    <div className="space-y-4">
                  {/* Médico e CID */}
                  <div
                      className={`grid grid-cols-1 ${!profissionalDoProntuario ? 'md:grid-cols-2' : ''} gap-6`}>
                      
                    {/* ⭐ Médico Solicitante: oculto quando profissionalDoProntuario existe (já aparece no header) */}
                    {!profissionalDoProntuario &&
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                          <StethoscopeIcon className="w-4 h-4 text-teal-600" />
                          Médico Solicitante
                        </label>
                        <div className="relative group">
                          <select
                            value={formData.profissionalId}
                            onChange={(e) =>
                            handleChange('profissionalId', e.target.value)
                            }
                            disabled={readOnly}
                            className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all appearance-none disabled:opacity-60 disabled:cursor-not-allowed text-sm text-gray-700 group-hover:bg-white group-hover:border-gray-300">
                            
                            <option value="">Selecione...</option>
                            {medicosList.map((m) =>
                            <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            )}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-gray-600 transition-colors">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24">
                              
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M19 9l-7 7-7-7">
                              </path>
                            </svg>
                          </div>
                        </div>
                      </div>
                      }

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                        <ActivityIcon className="w-4 h-4 text-teal-600" />
                        CID 10 (Opcional — pode adicionar múltiplos)
                      </label>

                      {/* Tags selecionadas */}
                      {formData.cid10 &&
                        <div className="flex flex-wrap gap-2 mb-2">
                          {formData.cid10.
                          split(',').
                          map((c) => c.trim()).
                          filter(Boolean).
                          map((codigo, idx) => {
                            const desc =
                            cidDescricoes[codigo.toUpperCase()] || '';
                            return (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-800 text-xs font-medium rounded-full border border-teal-200"
                                title={desc || codigo}>
                                
                                  <span className="font-bold">{codigo}</span>
                                  {desc &&
                                <span className="text-teal-600 max-w-[180px] truncate">
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
                      <div className="relative group">
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
                              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm group-hover:bg-white group-hover:border-gray-300" />
                            

                          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none group-hover:text-gray-600 transition-colors" />
                        </div>

                        {showCidDropdown &&
                          !readOnly &&
                          cidSearch.trim().length >= 2 &&
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
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
                              className="w-full px-4 py-2.5 text-left hover:bg-teal-50 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0 group/item">
                              
                                    <span className="inline-block px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded group-hover/item:bg-teal-200 transition-colors font-mono">
                                      {cid.codigo}
                                    </span>
                                    <span className="text-sm text-gray-700 truncate group-hover/item:text-teal-900">
                                      {cid.descricao}
                                    </span>
                                  </button>
                            ) :

                            <div className="px-4 py-3 text-gray-500 text-sm">
                                  Nenhum CID encontrado. Verifique se a tabela
                                  CID-10 foi importada.
                                </div>
                            }
                            </div>
                          }
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Busque e selecione, ou digite e pressione Enter.
                      </p>
                    </div>
                  </div>

                  {/* Descrição Resumida */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <FileTextIcon className="w-3.5 h-3.5 text-teal-600" />
                      Título / Descrição Resumida
                    </label>
                    <Input
                        value={formData.descricao}
                        onChange={(e) =>
                        handleChange('descricao', e.target.value)
                        }
                        placeholder="Ex: Hemograma Completo"
                        disabled={readOnly}
                        className="bg-gray-50 border-gray-200 focus:bg-white transition-all hover:border-gray-300 text-sm py-1.5" />
                      
                  </div>
                    </div>
                  </CampoRecolhivel>

                  {/* Pedido Detalhado — editor de documento, protagonista da
                     aba: ocupa toda a área disponível. */}
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <FileTextIcon className="w-3.5 h-3.5 text-teal-600" />
                      Pedido Detalhado
                      <span className="ml-auto font-normal text-[10px] text-gray-400 flex items-center gap-1">
                        <PrinterIcon className="w-3 h-3" />
                        Este texto aparecerá no corpo do pedido impresso.
                      </span>
                    </label>
                    <EditorDocumento
                    value={formData.pedido}
                    onChange={(html) => handleChange('pedido', html)}
                    placeholder="Descreva os exames solicitados e detalhes técnicos..."
                    disabled={readOnly}
                    larguraTotal
                    altura="media"
                    alturaLgFlex />
                  
                  </div>

                </div>
              </Card>
            }
          </div>

          {/* Coluna Lateral - Justificativa Clínica (sempre na solicitação
               livre) + Histórico e Dicas (painel opcional) */}
          <div className={`space-y-4 ${colunaLateralVisivel ? '' : 'hidden'}`}>
            {tipoSolicitacao === 'outro' &&
            <Card className="p-4 border-t-4 border-t-amber-400 shadow-sm">
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <FileTextIcon className="w-3.5 h-3.5 text-amber-600" />
                  Justificativa Clínica
                </label>
                <p className="text-[11px] text-gray-400 mb-2">
                  Motivo da solicitação — obrigatório para alguns convênios.
                </p>
                <EditorDocumento
                value={formData.justificativa}
                onChange={(html) => handleChange('justificativa', html)}
                placeholder="Descreva o motivo clínico da solicitação..."
                disabled={readOnly}
                larguraTotal
                altura="media" />
              
              </Card>
            }

            <div
              className={`space-y-6 ${painelVisivel ? '' : 'hidden'}`}>
              
            <Card className="p-0 bg-white border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-teal-600" />
                  Histórico de Exames
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
                      // Remove parte de hora se vier do MySQL (ex: "2026-03-05 00:00:00" → "2026-03-05")
                      if (dataLimpa.includes(' '))
                      dataLimpa = dataLimpa.split(' ')[0];
                      if (dataLimpa.includes('T'))
                      dataLimpa = dataLimpa.split('T')[0];
                      // Valida formato YYYY-MM-DD antes de criar Date
                      if (/^\d{4}-\d{2}-\d{2}$/.test(dataLimpa)) {
                        dataFormatada = new Date(
                          dataLimpa + 'T12:00:00'
                        ).toLocaleDateString('pt-BR');
                      } else {
                        dataFormatada = dataLimpa; // Usa como está se não for formato esperado
                      }
                    }
                    // ⭐ Resolve nome pelo ID, fallback para nome legacy
                    const nomeMedicoHistorico =
                    resolverNomeMedicoHistorico(item);
                    return (
                      <div
                        key={item.id || index}
                        className={`p-3 rounded-lg border shadow-sm hover:shadow-md transition-all group relative cursor-pointer ${
                        item.id && String(item.id) === String(registroAberto) ?
                        'bg-teal-50 border-teal-300 ring-1 ring-teal-200' :
                        'bg-white border-gray-100 hover:border-teal-100'}`
                        }
                        onClick={() => abrirRegistroHistorico(item)}
                        title="Clique para abrir este pedido">
                        
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded uppercase tracking-wide border border-gray-100">
                            {dataFormatada || item.data}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 bg-white pl-2">
                            <span className="p-1.5 text-teal-600 text-xs font-medium">
                              Abrir
                            </span>
                          </div>
                        </div>
                        {(() => {
                          const ehRotinaItem = ehPedidoRotina(item.descricao);
                          const nomesRotina = ehRotinaItem ?
                          (item.pedido || '').split('\n').filter(Boolean) :
                          [];
                          return (
                            <>
                              <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-1.5 leading-snug group-hover:text-teal-800 transition-colors">
                                {ehRotinaItem ?
                                `Exames de rotina — ${nomesRotina.length} exame(s)` :
                                item.descricao ||
                                paraTextoSimples(
                                  item.pedido || ''
                                ).substring(0, 60) ||
                                'Sem descrição'}
                              </p>
                              {/* Distingue um pedido de rotina do outro sem
                                   precisar abrir cada um. */}
                              {ehRotinaItem && nomesRotina.length > 0 &&
                              <p className="text-[11px] text-gray-500 line-clamp-2 mb-1.5">
                                  {nomesRotina.slice(0, 4).join(', ')}
                                  {nomesRotina.length > 4 ?
                                ` +${nomesRotina.length - 4}` :
                                ''}
                                </p>
                              }
                            </>);

                        })()}
                        {nomeMedicoHistorico &&
                        <p className="text-xs text-gray-500 flex items-center gap-1.5 border-t border-gray-50 pt-1.5 mt-1.5">
                            <StethoscopeIcon className="w-3 h-3 text-gray-400" />
                            {nomeMedicoHistorico}
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
                    Os exames anteriores aparecerão aqui.
                  </p>
                </div>
                }
            </Card>

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
                    Use os <strong className="font-semibold">Padrões</strong>{' '}
                    para agilizar solicitações frequentes.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>
                    A <strong className="font-semibold">Justificativa</strong> é
                    importante para autorização de convênios.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>
                    O sistema salva automaticamente enquanto você digita (
                    <span className="italic">auto-save</span>).
                  </span>
                </li>
              </ul>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Padrões */}
      <PadroesExameModal
        isOpen={showPadroesModal}
        onClose={() => setShowPadroesModal(false)}
        onSelect={handleSelectPadrao}
        currentData={formData}
        clinicaId={clinicaId}
        profissionalId={formData.profissionalId || profissionalIdEfetivo} />
      
    </div>);

}