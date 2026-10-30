import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import {
  PlusIcon,
  ClockIcon,
  TrashIcon,
  EditIcon,
  XIcon,
  CalendarIcon,
  SaveIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  LockIcon,
  CopyIcon,
  AlertTriangleIcon,
  CalendarDaysIcon } from
'lucide-react';
import { useAgendaProfissional } from '../hooks/useAgendaProfissional';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { DialogContainer } from '../components/DialogContainer';
import { ToastContainer } from '../components/ToastContainer';
import { HorarioTrabalho } from '../types';
import {
  getLabelRecorrencia,
  getRecorrenciaOposta } from
'../utils/recorrenciaAgenda';
export interface AgendaProfissionalPageProps {
  clinicaId?: string;
  usuarioLogado?: {
    id?: string; // ⭐ ID do usuário logado (preferencial)
    nome: string;
    tipo: 'super_admin' | 'admin' | 'medico' | 'dentista' | 'atendente';
  };
  usuarios?: Array<{
    id: string;
    nome: string;
    tipo: string;
    clinicaId?: string;
  }>;
  profissionalIdSelecionado?: string; // ⭐ NOVO: Profissional pré-selecionado vindo da Agenda
}
const DIAS_SEMANA = [
{
  valor: 0,
  nome: 'Domingo'
},
{
  valor: 1,
  nome: 'Segunda-feira'
},
{
  valor: 2,
  nome: 'Terça-feira'
},
{
  valor: 3,
  nome: 'Quarta-feira'
},
{
  valor: 4,
  nome: 'Quinta-feira'
},
{
  valor: 5,
  nome: 'Sexta-feira'
},
{
  valor: 6,
  nome: 'Sábado'
}];

const DEFAULT_HORARIO: HorarioTrabalho = {
  diaSemana: 1,
  horaInicio: '08:00',
  horaFim: '18:00',
  intervaloInicio: '12:00',
  intervaloFim: '13:00',
  duracaoConsultaPadrao: 30,
  recorrencia: 'toda_semana'
};
export function AgendaProfissionalPage({
  clinicaId,
  usuarioLogado,
  usuarios = [],
  profissionalIdSelecionado
}: AgendaProfissionalPageProps) {
  const {
    agendas,
    loading,
    addAgenda,
    updateAgenda,
    deleteAgenda,
    toggleAgenda,
    refresh
  } = useAgendaProfissional(clinicaId);
  const { toasts, removeToast, success, error: toastError } = useToast();
  const { dialogs, removeDialog, confirm } = useDialog();
  // ⭐ HELPER: Busca agenda por ID com fallback por nome (resolve IDs divergentes pós-migração)
  const findAgendaByIdOrName = (profId: string, profNome?: string) => {
    if (!profId) return undefined;
    const byId = agendas.find(
      (a) => String(a.profissionalId) === String(profId)
    );
    if (byId) return byId;
    // Fallback por nome
    const nome =
    profNome ||
    usuarios?.find((u: any) => String(u.id) === String(profId))?.nome;
    if (nome) {
      const nomeNorm = nome.trim().toUpperCase();
      const byNome = agendas.find(
        (a) => a.profissionalNome?.trim().toUpperCase() === nomeNorm
      );
      if (byNome) {
        console.warn(
          `⚠️ [AgendaProfissionalPage] Agenda encontrada por NOME ("${nome}") — IDs divergentes`
        );
        return byNome;
      }
    }
    return undefined;
  };
  // --- State Management ---
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [filterProfissional, setFilterProfissional] = useState<string>('todos');
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    profissionalNome: '',
    especialidade: 'medico' as 'medico' | 'dentista',
    horarios: [] as HorarioTrabalho[],
    profissionalId: '' as string // NOVO: Armazena o ID do profissional
  });
  // Schedule Item State (for adding/editing a specific day slot)
  const [currentSlot, setCurrentSlot] =
  useState<HorarioTrabalho>(DEFAULT_HORARIO);
  const [isEditingSlot, setIsEditingSlot] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [usarDatasEspecificas, setUsarDatasEspecificas] = useState(false);
  const [datasEspecificasInput, setDatasEspecificasInput] = useState('');
  const [datasEspecificasList, setDatasEspecificasList] = useState<string[]>([]);
  const [usarHorariosManuais, setUsarHorariosManuais] = useState(false);
  const [horarioManualInput, setHorarioManualInput] = useState('');
  const [horariosManuaisList, setHorariosManuaisList] = useState<string[]>([]);
  const resetConfiguracaoDatasEspecificas = () => {
    setUsarDatasEspecificas(false);
    setDatasEspecificasInput('');
    setDatasEspecificasList([]);
    setUsarHorariosManuais(false);
    setHorarioManualInput('');
    setHorariosManuaisList([]);
  };
  const handleAddDataEspecifica = () => {
    if (!datasEspecificasInput) return;
    // Datas específicas são exceções absolutas e podem cair em qualquer dia.
    // A regra canônica usa a própria data antes de avaliar dia da semana/A-B.
    const date = new Date(datasEspecificasInput + 'T12:00:00');
    if (datasEspecificasList.includes(datasEspecificasInput)) {
      toastError('Data duplicada', 'Esta data já foi adicionada ao turno.');
      return;
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (date < hoje) {
      toastError('Data passada', 'Selecione uma data de atendimento futura.');
      return;
    }
    setDatasEspecificasList((prev) => [...prev, datasEspecificasInput].sort());
    setDatasEspecificasInput('');
  };
  const handleRemoveDataEspecifica = (data: string) => {
    setDatasEspecificasList((prev) => prev.filter((item) => item !== data));
  };
  const handleAddHorarioManual = () => {
    if (!horarioManualInput) return;
    if (horariosManuaisList.includes(horarioManualInput)) {
      toastError(
        'Horário duplicado',
        'Este horário já foi adicionado ao turno.'
      );
      return;
    }
    setHorariosManuaisList((prev) => [...prev, horarioManualInput].sort());
    setHorarioManualInput('');
  };
  const handleRemoveHorarioManual = (horario: string) => {
    setHorariosManuaisList((prev) => prev.filter((item) => item !== horario));
  };
  // ⭐ NOVO: Auto-abre formulário com profissional pré-selecionado vindo da Agenda
  const [autoOpenDone, setAutoOpenDone] = useState(false);
  useEffect(() => {
    if (
    profissionalIdSelecionado &&
    profissionalIdSelecionado !== 'todos' &&
    !autoOpenDone &&
    !loading &&
    agendas !== undefined)
    {
      setAutoOpenDone(true);
      const usuario = usuarios.find((u) => u.id === profissionalIdSelecionado);
      if (!usuario) return;
      const especialidade =
      usuario.tipo === 'medico' || usuario.tipo === 'dentista' ?
      usuario.tipo as 'medico' | 'dentista' :
      'medico';
      // Verifica se já existe agenda para este profissional (com fallback por nome)
      const existingAgenda = findAgendaByIdOrName(
        profissionalIdSelecionado,
        usuario?.nome
      );
      if (existingAgenda) {
        // Abre para edição da agenda existente
        setEditingId(existingAgenda.id);
        setFormData({
          profissionalNome: usuario.nome,
          especialidade: getEspecialidadeAtual(existingAgenda),
          horarios: [...existingAgenda.horarios],
          profissionalId: profissionalIdSelecionado
        });
      } else {
        // Abre para criação com profissional pré-selecionado
        setEditingId(null);
        setFormData({
          profissionalNome: usuario.nome,
          especialidade,
          horarios: [],
          profissionalId: profissionalIdSelecionado
        });
      }
      setCurrentSlot(DEFAULT_HORARIO);
      setIsEditingSlot(false);
      resetConfiguracaoDatasEspecificas();
      setShowValidationErrors(false);
      setViewMode('form');
    }
  }, [profissionalIdSelecionado, agendas, usuarios, autoOpenDone, loading]);
  // --- Permissions & Data ---
  // ⭐ Admins e atendentes podem editar qualquer agenda
  const podeEditarTodas =
  !usuarioLogado ||
  ['super_admin', 'admin', 'atendente'].includes(usuarioLogado.tipo);
  // ⭐ Médicos e dentistas podem editar sua própria agenda
  const podeEditarPropria =
  usuarioLogado && ['medico', 'dentista'].includes(usuarioLogado.tipo);
  // ⭐ Qualquer usuário pode editar (admins = todas, profissionais = própria)
  const podeEditar = podeEditarTodas || podeEditarPropria;
  // ⭐ ID do usuário logado — usa o id direto se disponível, senão faz lookup único por nome
  const usuarioLogadoId = useMemo(() => {
    if (!usuarioLogado) return null;
    if (usuarioLogado.id) return usuarioLogado.id;
    // ⭐ Sem fallback por nome — ID deve sempre ser fornecido
    console.warn(
      '⚠️ [AgendaProfissionalPage] usuarioLogado sem ID! Nome:',
      usuarioLogado.nome
    );
    return null;
  }, [usuarioLogado]);
  // ⭐ Profissionais da clínica — inclui id para usar como valor no select
  const profissionaisCadastrados = useMemo(() => {
    return usuarios.
    filter((u) => {
      const isMedicoOuDentista = u.tipo === 'medico' || u.tipo === 'dentista';
      const pertenceClinica =
      String(u.clinicaId || '') === String(clinicaId || '') || !u.clinicaId;
      const isAtivo = u.ativo !== false && (u as any).ativo !== 0;
      return isMedicoOuDentista && pertenceClinica && isAtivo;
    }).
    map((u) => ({
      id: u.id,
      nome: u.nome,
      tipo: u.tipo,
      especialidade: u.tipo as 'medico' | 'dentista'
    }));
  }, [usuarios, clinicaId]);
  // ⭐ Filtra agendas — para médicos/dentistas mostra só a própria, para admins mostra todas
  const agendasFiltradas = useMemo(() => {
    if (
    usuarioLogado && (
    usuarioLogado.tipo === 'medico' || usuarioLogado.tipo === 'dentista'))
    {
      if (!usuarioLogadoId) return [];
      const meuNome = usuarioLogado?.nome?.trim().toUpperCase() || '';
      return agendas.filter(
        (a) =>
        String(a.profissionalId) === String(usuarioLogadoId) ||
        meuNome && a.profissionalNome?.trim().toUpperCase() === meuNome
      );
    }
    if (filterProfissional !== 'todos') {
      const profNome =
      usuarios?.
      find((u: any) => String(u.id) === String(filterProfissional))?.
      nome?.trim().
      toUpperCase() || '';
      return agendas.filter(
        (a) =>
        String(a.profissionalId) === String(filterProfissional) ||
        profNome && a.profissionalNome?.trim().toUpperCase() === profNome
      );
    }
    // ⭐ CORRIGIDO: Mostra TODAS as agendas, não filtra por idsValidos
    // Agendas de profissionais que não estão na lista mostram o nome salvo
    return agendas;
  }, [agendas, usuarioLogado, usuarioLogadoId, filterProfissional]);
  // Retorna nome atual do profissional pelo ID
  const getNomeProfissionalAtual = (agenda: any): string => {
    return (
      usuarios.find((u) => u.id === agenda.profissionalId)?.nome ??
      agenda.profissionalNome);

  };
  // Retorna especialidade atual do profissional pelo ID
  const getEspecialidadeAtual = (agenda: any): 'medico' | 'dentista' => {
    const u = usuarios.find((u) => u.id === agenda.profissionalId);
    if (u && (u.tipo === 'medico' || u.tipo === 'dentista'))
    return u.tipo as 'medico' | 'dentista';
    return agenda.especialidade;
  };
  // ⭐ Lista para o filtro — inclui todos os profissionais com agenda
  const profissionaisDisponiveisFilter = useMemo(() => {
    const vistos = new Set<string>();
    const lista: {
      id: string;
      nome: string;
    }[] = [];
    agendas.forEach((a) => {
      if (!a.profissionalId || vistos.has(a.profissionalId)) return;
      vistos.add(a.profissionalId);
      // ⭐ CORRIGIDO: Usa nome do usuário se disponível, senão usa nome salvo na agenda
      const u = usuarios.find((u) => u.id === a.profissionalId);
      lista.push({
        id: a.profissionalId,
        nome: u?.nome || a.profissionalNome
      });
    });
    return lista.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [agendas, usuarios]);
  const diasDisponiveis = useMemo(() => {
    const diasUsados = formData.horarios.map((h) => h.diaSemana);
    // If editing a slot, include its current day so we can keep it
    if (isEditingSlot) {
      return DIAS_SEMANA;
    }
    return DIAS_SEMANA.filter((d) => !diasUsados.includes(d.valor));
  }, [formData.horarios, isEditingSlot]);
  // --- Handlers ---
  const handleStartCreate = () => {
    setEditingId(null);
    setShowValidationErrors(false);
    // ⭐ FIX: Para médicos/dentistas, preenche automaticamente com seus dados
    if (usuarioLogado && ['medico', 'dentista'].includes(usuarioLogado.tipo)) {
      const meuId = usuarioLogadoId || '';
      const meuNome = usuarioLogado.nome;
      const minhaEspecialidade = usuarioLogado.tipo as 'medico' | 'dentista';
      // Verifica se já existe agenda para este profissional
      const existingAgenda = findAgendaByIdOrName(meuId, meuNome);
      if (existingAgenda) {
        // Carrega a agenda existente para edição
        setEditingId(existingAgenda.id);
        setFormData({
          profissionalNome: meuNome,
          especialidade: getEspecialidadeAtual(existingAgenda),
          horarios: [...existingAgenda.horarios],
          profissionalId: meuId
        });
        success(
          'Agenda encontrada',
          'Carregando sua configuração existente para edição'
        );
      } else {
        setFormData({
          profissionalNome: meuNome,
          especialidade: minhaEspecialidade,
          horarios: [],
          profissionalId: meuId
        });
      }
    } else {
      setFormData({
        profissionalNome: '',
        especialidade: 'medico',
        horarios: [],
        profissionalId: ''
      });
    }
    setCurrentSlot(DEFAULT_HORARIO);
    setIsEditingSlot(false);
    resetConfiguracaoDatasEspecificas();
    setViewMode('form');
  };
  const handleStartEdit = (agenda: any) => {
    setEditingId(agenda.id);
    setShowValidationErrors(false);
    // ⭐ Busca nome e especialidade pelo profissionalId — nunca pelo nome salvo
    const nomeProfissionalAtual = getNomeProfissionalAtual(agenda);
    const especialidadeAtual = getEspecialidadeAtual(agenda);
    setFormData({
      profissionalNome: nomeProfissionalAtual,
      especialidade: especialidadeAtual,
      horarios: [...agenda.horarios],
      profissionalId: agenda.profissionalId || ''
    });
    setCurrentSlot(DEFAULT_HORARIO);
    setIsEditingSlot(false);
    resetConfiguracaoDatasEspecificas();
    setViewMode('form');
  };
  const handleDeleteAgenda = async (agenda: any) => {
    const shouldDelete = await confirm(
      'Excluir Agenda',
      `Tem certeza que deseja excluir toda a configuração de agenda de ${agenda.profissionalNome}?`
    );
    if (shouldDelete) {
      try {
        await deleteAgenda(agenda.id);
        success('Agenda excluída com sucesso');
      } catch (err: any) {
        toastError('Erro ao excluir', err.message);
      }
    }
  };
  // ⭐ NOVO: Toggle abrir/fechar agenda
  const handleToggleAgenda = async (agenda: any) => {
    const novoEstado = !agenda.ativo;
    const acao = novoEstado ? 'abrir' : 'fechar';
    if (!novoEstado) {
      // Fechando — pede confirmação
      const shouldClose = await confirm(
        'Fechar Agenda',
        `Deseja fechar a agenda de ${getNomeProfissionalAtual(agenda)}? A agenda ficará indisponível para novos agendamentos. Só é possível fechar se não houver consultas futuras marcadas.`
      );
      if (!shouldClose) return;
    }
    try {
      const result = await toggleAgenda(agenda.id, novoEstado);
      if (result.success) {
        success(
          novoEstado ? 'Agenda Aberta' : 'Agenda Fechada',
          novoEstado ?
          `A agenda de ${getNomeProfissionalAtual(agenda)} está disponível para agendamentos.` :
          `A agenda de ${getNomeProfissionalAtual(agenda)} foi fechada.`
        );
      } else {
        toastError(
          'Não foi possível ' + acao,
          result.error || 'Erro desconhecido'
        );
      }
    } catch (err: any) {
      toastError('Erro', err.message);
    }
  };
  // ⭐ NOVO: Adicionar dia extra (copia horários de um dia existente)
  const handleAddDiaExtra = async (agenda: any) => {
    if (!agenda.horarios || agenda.horarios.length === 0) {
      toastError(
        'Sem horários',
        'Esta agenda não tem nenhum dia configurado para copiar.'
      );
      return;
    }
    // Dias já configurados
    const diasConfigurados = agenda.horarios.map((h: any) => h.diaSemana);
    const diasDisponiveis = DIAS_SEMANA.filter(
      (d) => !diasConfigurados.includes(d.valor)
    );
    if (diasDisponiveis.length === 0) {
      toastError(
        'Todos os dias já configurados',
        'Todos os 7 dias da semana já possuem horários.'
      );
      return;
    }
    // Abre para edição com os horários atuais + prepara para adicionar dia extra
    setEditingId(agenda.id);
    setShowValidationErrors(false);
    const nomeProfissionalAtual = getNomeProfissionalAtual(agenda);
    const especialidadeAtual = getEspecialidadeAtual(agenda);
    // Copia horários do primeiro dia configurado como template
    const template = agenda.horarios[0];
    const primeiroDiaDisponivel = diasDisponiveis[0];
    const novoHorario: HorarioTrabalho = {
      diaSemana: primeiroDiaDisponivel.valor,
      horaInicio: template.horaInicio,
      horaFim: template.horaFim,
      intervaloInicio: template.intervaloInicio,
      intervaloFim: template.intervaloFim,
      duracaoConsultaPadrao: template.duracaoConsultaPadrao,
      horariosManuais: template.horariosManuais ?
      [...template.horariosManuais] :
      undefined
    };
    setFormData({
      profissionalNome: nomeProfissionalAtual,
      especialidade: especialidadeAtual,
      horarios: [...agenda.horarios, novoHorario],
      profissionalId: agenda.profissionalId || ''
    });
    // Pré-seleciona o novo slot para edição
    setCurrentSlot(novoHorario);
    setIsEditingSlot(true);
    resetConfiguracaoDatasEspecificas();
    setUsarHorariosManuais(Boolean(novoHorario.horariosManuais?.length));
    setHorariosManuaisList(novoHorario.horariosManuais || []);
    setViewMode('form');
    success(
      'Dia Extra Adicionado',
      `${primeiroDiaDisponivel.nome} foi adicionado copiando os horários de ${DIAS_SEMANA.find((d) => d.valor === template.diaSemana)?.nome || 'dia existente'}. Ajuste os horários se necessário e salve.`
    );
  };
  const handleSaveForm = async () => {
    console.log('🔄 [AgendaProfissionalPage] handleSaveForm chamado');
    console.log('   - formData:', formData);
    console.log('   - editingId:', editingId);
    console.log('   - clinicaId:', clinicaId);
    // ⭐ FIX: Ativa indicadores visuais de erro no formulário
    setShowValidationErrors(true);
    if (!formData.profissionalNome || !formData.profissionalId) {
      toastError(
        '⚠️ Profissional não selecionado',
        'Selecione um profissional na lista acima antes de salvar.'
      );
      return;
    }
    // ⭐ FIX: Se há um horário em edição cujas mudanças (ex.: Duração da Consulta)
    // ainda não foram aplicadas via "Atualizar Horário", aplica automaticamente
    // antes de salvar — assim a duração nunca é perdida por esquecimento do clique.
    const horariosFinais = isEditingSlot ?
    (() => {
      const slotEmEdicao: HorarioTrabalho = {
        ...currentSlot
      };
      if (usarDatasEspecificas && datasEspecificasList.length > 0) {
        slotEmEdicao.datasEspecificas = [...datasEspecificasList];
      } else {
        delete slotEmEdicao.datasEspecificas;
      }
      if (usarHorariosManuais && horariosManuaisList.length > 0) {
        slotEmEdicao.horariosManuais = [...horariosManuaisList];
      } else {
        delete slotEmEdicao.horariosManuais;
      }
      const novos = [...formData.horarios];
      if (editingIndex !== null) {
        novos[editingIndex] = slotEmEdicao;
      } else {
        novos.push(slotEmEdicao);
      }
      return novos.sort((a, b) => a.diaSemana - b.diaSemana);
    })() :
    formData.horarios;
    if (horariosFinais.length === 0) {
      toastError(
        '⚠️ Agenda vazia',
        'Adicione pelo menos um horário de atendimento. Clique em "Adicionar à Lista" primeiro.'
      );
      return;
    }
    if (!clinicaId) {
      toastError(
        '❌ Erro interno',
        'ID da clínica não identificado. Tente recarregar a página.'
      );
      return;
    }
    // ⭐ FIX: Usa APENAS profissionalId do formData — NUNCA busca por nome
    let profissionalId = formData.profissionalId;
    // Fallback para médicos/dentistas: usa o ID do usuário logado
    if (
    !profissionalId &&
    usuarioLogado &&
    ['medico', 'dentista'].includes(usuarioLogado.tipo))
    {
      profissionalId = usuarioLogadoId || '';
      console.log(
        '💾 [AgendaProfissionalPage] Usando ID do usuário logado:',
        profissionalId
      );
    }
    console.log('💾 [AgendaProfissionalPage] Salvando agenda...');
    console.log('   - profissionalNome:', formData.profissionalNome);
    console.log('   - profissionalId:', profissionalId);
    console.log('   - horarios a salvar:', formData.horarios);
    if (!profissionalId) {
      toastError(
        '❌ Profissional sem ID',
        'Não foi possível identificar o ID do profissional. Verifique se o profissional está cadastrado corretamente.'
      );
      return;
    }
    // ⭐ Limpa erros visuais antes de salvar
    setShowValidationErrors(false);
    try {
      if (editingId) {
        console.log('📝 Atualizando agenda existente:', editingId);
        await updateAgenda(editingId, {
          profissionalId,
          profissionalNome: formData.profissionalNome,
          especialidade: formData.especialidade,
          horarios: horariosFinais,
          clinicaId
          // O estado aberto/fechado é preservado; só o controle de toggle o altera.
        });
        success(
          'Agenda atualizada',
          `Configuração de ${formData.profissionalNome} salva com sucesso`
        );
      } else {
        console.log('➕ Criando nova agenda');
        await addAgenda({
          profissionalId,
          profissionalNome: formData.profissionalNome,
          especialidade: formData.especialidade,
          horarios: horariosFinais,
          clinicaId,
          // Uma grade recém-configurada deve ficar disponível imediatamente.
          // O fechamento continua sendo uma ação explícita pelo controle da agenda.
          ativo: true
        });
        success(
          'Agenda criada e aberta',
          `Configuração de ${formData.profissionalNome} salva e disponível para agendamentos.`
        );
      }
      setViewMode('list');
    } catch (err: any) {
      console.error('❌ [AgendaProfissionalPage] Erro ao salvar:', err);
      toastError(
        'Erro ao salvar',
        err.message || 'Erro desconhecido ao salvar a agenda'
      );
    }
  };
  const handleAddSlot = () => {
    console.log('🕐 [AgendaProfissionalPage] handleAddSlot chamado');
    console.log('   - currentSlot:', currentSlot);
    // Basic validation - Comparação de horários mais robusta
    const [horaIni, minIni] = currentSlot.horaInicio.split(':').map(Number);
    const [horaFim, minFim] = currentSlot.horaFim.split(':').map(Number);
    const inicioMinutos = horaIni * 60 + minIni;
    const fimMinutos = horaFim * 60 + minFim;
    console.log(
      '   - inicioMinutos:',
      inicioMinutos,
      `(${currentSlot.horaInicio})`
    );
    console.log('   - fimMinutos:', fimMinutos, `(${currentSlot.horaFim})`);
    if (inicioMinutos >= fimMinutos) {
      console.log('   ❌ Validação falhou: início >= fim');
      toastError(
        'Horário inválido',
        `A hora de início (${currentSlot.horaInicio}) deve ser anterior à hora de fim (${currentSlot.horaFim})`
      );
      return;
    }
    // ⭐ FIX: Prepara o slot para salvar — intervalo é OPCIONAL
    const slotParaSalvar: HorarioTrabalho = {
      ...currentSlot
    };
    if (usarDatasEspecificas && datasEspecificasList.length > 0) {
      slotParaSalvar.datasEspecificas = [...datasEspecificasList];
    } else {
      delete slotParaSalvar.datasEspecificas;
    }
    if (usarHorariosManuais && horariosManuaisList.length > 0) {
      slotParaSalvar.horariosManuais = [...horariosManuaisList];
    } else {
      delete slotParaSalvar.horariosManuais;
    }
    const temIntervaloInicio =
    currentSlot.intervaloInicio && currentSlot.intervaloInicio.trim() !== '';
    const temIntervaloFim =
    currentSlot.intervaloFim && currentSlot.intervaloFim.trim() !== '';
    // Se ambos os campos de intervalo estão preenchidos, valida
    if (temIntervaloInicio && temIntervaloFim) {
      const [horaIntIni, minIntIni] = currentSlot.intervaloInicio.
      split(':').
      map(Number);
      const [horaIntFim, minIntFim] = currentSlot.intervaloFim.
      split(':').
      map(Number);
      const intervaloIniMinutos = horaIntIni * 60 + minIntIni;
      const intervaloFimMinutos = horaIntFim * 60 + minIntFim;
      console.log('   - intervaloIniMinutos:', intervaloIniMinutos);
      console.log('   - intervaloFimMinutos:', intervaloFimMinutos);
      if (intervaloIniMinutos >= intervaloFimMinutos) {
        console.log('   ❌ Validação falhou: intervalo início >= fim');
        toastError(
          'Intervalo inválido',
          `O início do intervalo (${currentSlot.intervaloInicio}) deve ser anterior ao fim (${currentSlot.intervaloFim})`
        );
        return;
      }
      // Verifica se o intervalo está dentro do horário de trabalho
      if (
      intervaloIniMinutos < inicioMinutos ||
      intervaloFimMinutos > fimMinutos)
      {
        console.log(
          '   ⚠️ Intervalo fora do expediente — removendo intervalo automaticamente'
        );
        // ⭐ FIX: Em vez de bloquear, limpa o intervalo (profissional não tem pausa)
        slotParaSalvar.intervaloInicio = '';
        slotParaSalvar.intervaloFim = '';
      }
    } else {
      // ⭐ FIX: Se apenas um campo está preenchido ou nenhum, limpa ambos
      slotParaSalvar.intervaloInicio = '';
      slotParaSalvar.intervaloFim = '';
    }
    console.log('   ✅ Validações passaram, adicionando horário');
    let novosHorarios = [...formData.horarios];
    if (isEditingSlot && editingIndex !== null) {
      novosHorarios[editingIndex] = slotParaSalvar;
    } else {
      novosHorarios.push(slotParaSalvar);
    }
    novosHorarios.sort((a, b) => a.diaSemana - b.diaSemana);
    console.log('   - Horários após adicionar:', novosHorarios);
    setFormData((prev) => ({
      ...prev,
      horarios: novosHorarios
    }));
    // Feedback de sucesso
    success(
      'Horário adicionado',
      `${DIAS_SEMANA.find((d) => d.valor === slotParaSalvar.diaSemana)?.nome}: ${slotParaSalvar.horaInicio} - ${slotParaSalvar.horaFim}`
    );
    // Reset slot form
    setIsEditingSlot(false);
    setEditingIndex(null);
    resetConfiguracaoDatasEspecificas();
    // Suggest next day
    const nextDay = (slotParaSalvar.diaSemana + 1) % 7;
    setCurrentSlot({
      ...slotParaSalvar,
      diaSemana: nextDay
    });
  };
  const handleEditSlot = (slot: HorarioTrabalho, index: number) => {
    setCurrentSlot(slot);
    setIsEditingSlot(true);
    setEditingIndex(index);
    setUsarDatasEspecificas(
      Boolean(slot.datasEspecificas && slot.datasEspecificas.length > 0)
    );
    setDatasEspecificasList(slot.datasEspecificas || []);
    setDatasEspecificasInput('');
    setUsarHorariosManuais(
      Boolean(slot.horariosManuais && slot.horariosManuais.length > 0)
    );
    setHorariosManuaisList(slot.horariosManuais || []);
    setHorarioManualInput('');
  };
  const handleRemoveSlot = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      horarios: prev.horarios.filter((_, i) => i !== index)
    }));
    if (isEditingSlot && editingIndex === index) {
      setIsEditingSlot(false);
      setEditingIndex(null);
      setCurrentSlot(DEFAULT_HORARIO);
      resetConfiguracaoDatasEspecificas();
    }
  };
  // ⭐ Recebe o ID diretamente do select — sem lookup por nome
  const handleProfissionalChange = (profissionalId: string) => {
    const usuario = usuarios.find((u) => u.id === profissionalId);
    if (!usuario) {
      setFormData((prev) => ({
        ...prev,
        profissionalNome: '',
        profissionalId: '',
        especialidade: 'medico'
      }));
      return;
    }
    const especialidade =
    usuario.tipo === 'medico' || usuario.tipo === 'dentista' ?
    usuario.tipo as 'medico' | 'dentista' :
    'medico';
    // Verifica se já existe agenda para este ID
    const existingAgenda = findAgendaByIdOrName(profissionalId, usuario?.nome);
    if (existingAgenda && !editingId) {
      setEditingId(existingAgenda.id);
      setFormData({
        profissionalNome: usuario.nome,
        especialidade: getEspecialidadeAtual(existingAgenda),
        horarios: [...existingAgenda.horarios],
        profissionalId: profissionalId
      });
      success(
        'Agenda encontrada',
        'Carregando configuração existente para este profissional'
      );
    } else {
      setFormData((prev) => ({
        ...prev,
        profissionalNome: usuario.nome,
        especialidade,
        profissionalId
      }));
    }
  };
  // --- Render Helpers ---
  if (viewMode === 'form') {
    const profissionalNaoSelecionado =
    showValidationErrors && (
    !formData.profissionalId || !formData.profissionalNome);
    const horariosVazios =
    showValidationErrors && formData.horarios.length === 0;
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <DialogContainer dialogs={dialogs} onClose={removeDialog} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editingId ? 'Editar Agenda' : 'Nova Configuração de Agenda'}
            </h1>
            <p className="text-gray-500">
              Defina os dias e horários de atendimento.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setViewMode('list')}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="p-4 space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">
                    1
                  </span>
                  Profissional
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {editingId ?
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Profissional
                      </label>
                      <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-gray-900 font-medium text-lg">
                          {formData.profissionalNome}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          ⚠️ O profissional não pode ser alterado após criação
                          da agenda
                        </p>
                      </div>
                    </div> :

                  <div>
                      <Select
                      label="Selecione o Profissional"
                      value={formData.profissionalId}
                      onChange={(e) => {
                        handleProfissionalChange(e.target.value);
                        if (e.target.value) setShowValidationErrors(false);
                      }}
                      options={[
                      {
                        value: '',
                        label: 'Selecione...'
                      },
                      ...profissionaisCadastrados.map((p) => ({
                        value: p.id,
                        label: p.nome
                      }))]
                      } />
                    

                      {profissionalNaoSelecionado &&
                    <p className="mt-1 text-sm text-red-600 font-medium">
                          ⚠️ Selecione um profissional para salvar a agenda
                        </p>
                    }
                      {profissionaisCadastrados.length === 0 &&
                    <p className="mt-1 text-sm text-amber-600">
                          Nenhum médico ou dentista cadastrado nesta clínica.
                          Cadastre um profissional primeiro em Usuários.
                        </p>
                    }
                    </div>
                  }
                  <div className="bg-gray-50 p-3 rounded-md border border-gray-200 flex items-center">
                    <span className="text-sm text-gray-600">
                      Especialidade:{' '}
                      <strong>
                        {formData.especialidade === 'medico' ?
                        'Médico' :
                        'Dentista'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">
                      2
                    </span>
                    {isEditingSlot ? 'Editar Horário' : 'Adicionar Horário'}
                  </h3>
                  {isEditingSlot &&
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingSlot(false);
                      setEditingIndex(null);
                      setCurrentSlot(DEFAULT_HORARIO);
                      resetConfiguracaoDatasEspecificas();
                    }}>
                    
                      Cancelar Edição
                    </Button>
                  }
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select
                    label="Dia da Semana"
                    value={currentSlot.diaSemana.toString()}
                    onChange={(e) => {
                      setCurrentSlot({
                        ...currentSlot,
                        diaSemana: Number(e.target.value)
                      });
                      resetConfiguracaoDatasEspecificas();
                    }}
                    options={DIAS_SEMANA.map((d) => ({
                      value: d.valor.toString(),
                      label: d.nome
                    }))}
                    disabled={isEditingSlot} />
                  

                  <Select
                    label="Repetição"
                    value={currentSlot.recorrencia || 'toda_semana'}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      recorrencia: e.target.value as any
                    })
                    }
                    options={[
                    {
                      value: 'toda_semana',
                      label: 'Toda semana'
                    },
                    {
                      value: 'semana_A',
                      label: 'Semana A (Alternada)'
                    },
                    {
                      value: 'semana_B',
                      label: 'Semana B (Alternada)'
                    }]
                    } />
                  

                  <Select
                    label="Duração Consulta (min)"
                    value={currentSlot.duracaoConsultaPadrao.toString()}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      duracaoConsultaPadrao: Number(e.target.value)
                    })
                    }
                    options={[
                    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90,
                    120].
                    map((m) => ({
                      value: m.toString(),
                      label: `${m} minutos`
                    }))} />
                  
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input
                    label="Início"
                    type="time"
                    value={currentSlot.horaInicio}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      horaInicio: e.target.value
                    })
                    } />
                  

                  <Input
                    label="Fim"
                    type="time"
                    value={currentSlot.horaFim}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      horaFim: e.target.value
                    })
                    } />
                  

                  <Input
                    label="Início Intervalo"
                    type="time"
                    value={currentSlot.intervaloInicio || ''}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      intervaloInicio: e.target.value
                    })
                    } />
                  

                  <Input
                    label="Fim Intervalo"
                    type="time"
                    value={currentSlot.intervaloFim || ''}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      intervaloFim: e.target.value
                    })
                    } />
                  
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usarDatasEspecificas}
                      onChange={(e) => {
                        setUsarDatasEspecificas(e.target.checked);
                        if (!e.target.checked) {
                          setDatasEspecificasInput('');
                          setDatasEspecificasList([]);
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    
                    <div>
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                        <CalendarDaysIcon className="w-4 h-4 text-teal-600" />
                        Apenas datas específicas
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Use para atender somente nas datas escolhidas. A data
                        específica prevalece sobre o dia semanal e sobre o
                        rodízio A/B.
                      </p>
                    </div>
                  </label>

                  {usarDatasEspecificas &&
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <p className="text-xs text-amber-800 font-medium">
                        Adicione as datas em que este turno atenderá. Elas podem
                        ser de qualquer dia da semana e substituem a grade
                        regular.
                      </p>
                      <div className="flex items-end gap-2">
                        <Input
                        label="Data de atendimento"
                        type="date"
                        value={datasEspecificasInput}
                        onChange={(e) =>
                        setDatasEspecificasInput(e.target.value)
                        }
                        className="flex-1" />
                      
                        <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleAddDataEspecifica}
                        disabled={!datasEspecificasInput}
                        className="mb-0.5"
                        aria-label="Adicionar data específica">
                        
                          <PlusIcon className="w-4 h-4" />
                        </Button>
                      </div>
                      {datasEspecificasList.length > 0 ?
                    <div className="flex flex-wrap gap-1.5">
                          {datasEspecificasList.map((data) =>
                      <span
                        key={data}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-medium text-amber-900">
                        
                              {data.split('-').reverse().join('/')}
                              <button
                          type="button"
                          onClick={() => handleRemoveDataEspecifica(data)}
                          className="rounded text-amber-600 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          aria-label={`Remover ${data.split('-').reverse().join('/')}`}>
                          
                                <XIcon className="w-3 h-3" />
                              </button>
                            </span>
                      )}
                        </div> :

                    <p className="text-xs text-amber-700">
                          Adicione ao menos uma data para limitar este turno.
                        </p>
                    }
                    </div>
                  }
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usarHorariosManuais}
                      onChange={(e) => {
                        setUsarHorariosManuais(e.target.checked);
                        if (!e.target.checked) {
                          setHorarioManualInput('');
                          setHorariosManuaisList([]);
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    
                    <div>
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                        <ClockIcon className="w-4 h-4 text-teal-600" />
                        Horários manuais (avulsos)
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Defina horários exatos, como 07:30 e 08:15, em vez de
                        gerar automaticamente pela duração da consulta.
                      </p>
                    </div>
                  </label>

                  {usarHorariosManuais &&
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <p className="text-xs text-amber-800 font-medium flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5" />
                        Adicione os horários exatos de atendimento deste turno.
                      </p>
                      <div className="flex items-end gap-2">
                        <Input
                        label="Horário"
                        type="time"
                        value={horarioManualInput}
                        onChange={(e) =>
                        setHorarioManualInput(e.target.value)
                        }
                        className="flex-1" />
                      
                        <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleAddHorarioManual}
                        disabled={!horarioManualInput}
                        className="mb-0.5"
                        aria-label="Adicionar horário manual">
                        
                          <PlusIcon className="w-4 h-4" />
                        </Button>
                      </div>
                      {horariosManuaisList.length > 0 ?
                    <div className="flex flex-wrap gap-1.5">
                          {horariosManuaisList.map((hora) =>
                      <span
                        key={hora}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-medium text-amber-900">
                        
                              {hora}
                              <button
                          type="button"
                          onClick={() => handleRemoveHorarioManual(hora)}
                          className="rounded text-amber-600 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          aria-label={`Remover horário ${hora}`}>
                          
                                <XIcon className="w-3 h-3" />
                              </button>
                            </span>
                      )}
                        </div> :

                    <p className="text-xs text-amber-700">
                          Adicione ao menos um horário manual para este turno.
                        </p>
                    }
                    </div>
                  }
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  {isEditingSlot &&
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const slotDuplicado = {
                        ...currentSlot,
                        recorrencia: getRecorrenciaOposta(
                          currentSlot.recorrencia
                        )
                      };
                      setCurrentSlot(slotDuplicado);
                      setIsEditingSlot(false);
                      setEditingIndex(null);
                      setUsarDatasEspecificas(
                        Boolean(
                          slotDuplicado.datasEspecificas &&
                          slotDuplicado.datasEspecificas.length > 0
                        )
                      );
                      setDatasEspecificasList(
                        slotDuplicado.datasEspecificas || []
                      );
                      setDatasEspecificasInput('');
                      setUsarHorariosManuais(
                        Boolean(
                          slotDuplicado.horariosManuais &&
                          slotDuplicado.horariosManuais.length > 0
                        )
                      );
                      setHorariosManuaisList(
                        slotDuplicado.horariosManuais || []
                      );
                      setHorarioManualInput('');
                      success(
                        'Turno duplicado',
                        'Ajuste os horários e clique em Adicionar à Lista'
                      );
                    }}
                    className="text-blue-600 hover:bg-blue-50">
                    
                      Duplicar p/ Semana Oposta
                    </Button>
                  }
                  <Button onClick={handleAddSlot} variant="secondary">
                    {isEditingSlot ? 'Atualizar Horário' : 'Adicionar à Lista'}
                    <PlusIcon className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                <h3 className="font-semibold text-gray-900">
                  Resumo da Agenda
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.horarios.length} dias configurados
                </p>
              </div>
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[500px]">
                {formData.horarios.length === 0 ?
                <div
                  className={`text-center py-8 ${horariosVazios ? 'text-red-400' : 'text-gray-400'}`}>
                  
                    <CalendarIcon
                    className={`w-12 h-12 mx-auto mb-2 ${horariosVazios ? 'opacity-50' : 'opacity-20'}`} />
                  

                    <p className="text-sm">Nenhum horário adicionado</p>
                    {horariosVazios &&
                  <p className="text-xs text-red-500 mt-2 font-medium">
                        Adicione horários antes de salvar
                      </p>
                  }
                  </div> :

                formData.horarios.map((horario, idx) =>
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${isEditingSlot && editingIndex === idx ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'} transition-colors group relative`}>
                  
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-gray-900 flex items-center flex-wrap gap-1.5">
                          {
                      DIAS_SEMANA.find(
                        (d) => d.valor === horario.diaSemana
                      )?.nome
                      }
                          {horario.recorrencia &&
                      horario.recorrencia !== 'toda_semana' &&
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-full ${horario.recorrencia === 'semana_A' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-purple-100 text-purple-700 border border-purple-200'}`}>
                        
                                {getLabelRecorrencia(horario.recorrencia)}
                              </span>
                      }
                          {horario.datasEspecificas &&
                      horario.datasEspecificas.length > 0 &&
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                <CalendarDaysIcon className="w-3 h-3" />
                                {horario.datasEspecificas.length} data
                                {horario.datasEspecificas.length > 1 ? 's' : ''}
                              </span>
                      }
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                        onClick={() => handleEditSlot(horario, idx)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                        title="Editar">
                        
                            <EditIcon className="w-3 h-3" />
                          </button>
                          <button
                        onClick={() => handleRemoveSlot(idx)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                        title="Remover">
                        
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <ClockIcon className="w-3 h-3" />
                          <span>
                            {horario.horaInicio} - {horario.horaFim}
                          </span>
                        </div>
                        {horario.intervaloInicio &&
                    <div className="text-xs text-gray-500 pl-5">
                            Intervalo: {horario.intervaloInicio} -{' '}
                            {horario.intervaloFim}
                          </div>
                    }
                        <div className="text-xs text-blue-600 pl-5 font-medium">
                          {horario.duracaoConsultaPadrao} min / consulta
                        </div>
                        {horario.datasEspecificas &&
                    horario.datasEspecificas.length > 0 &&
                    <div className="pl-5 mt-2">
                              <p className="text-[10px] text-amber-700 font-medium mb-1">
                                Apenas nestas datas:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {horario.datasEspecificas.map((data) =>
                        <span
                          key={data}
                          className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 font-medium">
                          
                                    {data.split('-').reverse().join('/')}
                                  </span>
                        )}
                              </div>
                            </div>
                    }
                        {horario.horariosManuais &&
                    horario.horariosManuais.length > 0 &&
                    <div className="pl-5 mt-2">
                              <p className="text-[10px] text-amber-700 font-medium mb-1">
                                Horários avulsos:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {horario.horariosManuais.map((hora) =>
                        <span
                          key={hora}
                          className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 font-medium">
                          
                                    {hora}
                                  </span>
                        )}
                              </div>
                            </div>
                    }
                      </div>
                    </div>
                )
                }
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg space-y-3">
                <Button className="w-full" onClick={handleSaveForm}>
                  <SaveIcon className="w-4 h-4 mr-2" />
                  Salvar Configuração
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setViewMode('list')}>
                  
                  Cancelar
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>);

  }
  // --- List View ---
  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Agendas Profissionais
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie os horários de atendimento da equipe.
          </p>
        </div>
        {podeEditar &&
        <Button onClick={handleStartCreate}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Nova Agenda
          </Button>
        }
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Como funciona a configuração de horários
          </h3>
          <ul className="text-sm text-blue-800 space-y-1.5">
            <li>
              • <strong>Agenda pronta para uso</strong>: Ao salvar uma grade, os
              horários configurados ficam disponíveis imediatamente para
              agendamento.
            </li>
            <li>
              • <strong>Abrir/Fechar</strong>: Use o botão de toggle (
              <CheckCircleIcon className="w-4 h-4 inline text-green-600" />)
              para fechar ou reabrir a agenda quando necessário.{' '}
              <strong>
                Fechar só é possível se não houver consultas futuras marcadas.
              </strong>
            </li>
            <li>
              • <strong>Dia Extra</strong>: Se o profissional precisa atender em
              um dia que não está na grade regular (ex: Sábado), clique em{' '}
              <strong>"Dia Extra"</strong>. O sistema copia os horários de um
              dia já configurado — basta ajustar e salvar.
            </li>
            <li>
              • <strong>Horários livres</strong>: Aparecem automaticamente na
              Agenda apenas para agendas{' '}
              <strong className="text-green-700">abertas</strong>.
            </li>
            <li>
              • <strong>Profissionais</strong>: Veem apenas sua própria grade.{' '}
              <strong>Atendentes e admins</strong> podem gerenciar todas as
              agendas.
            </li>
          </ul>
        </div>
      </Card>

      {usuarioLogado && (
      usuarioLogado.tipo === 'medico' ||
      usuarioLogado.tipo === 'dentista') &&
      <>
            <Card className="bg-teal-50 border-teal-200">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-teal-900 mb-2 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4" />
                  Seus Horários de Atendimento
                </h3>
                <p className="text-sm text-teal-800">
                  🔒 Você está visualizando apenas{' '}
                  <strong>suas próprias configurações de horário</strong>.
                </p>
              </div>
            </Card>
            {agendas.length > 0 && agendasFiltradas.length === 0 &&
        <Card className="bg-yellow-50 border-yellow-200">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-yellow-900 mb-2">
                    ⚠️ Nenhuma agenda encontrada para você
                  </h3>
                  <div className="text-sm text-yellow-800 space-y-2">
                    <p>
                      <strong>Seu ID:</strong>{' '}
                      {usuarioLogadoId || 'Não encontrado'}
                    </p>
                    <p>
                      <strong>Agendas disponíveis:</strong>
                    </p>
                    <ul className="list-disc list-inside pl-4">
                      {agendas.map((a, i) =>
                <li key={i}>
                          <span className="text-xs">
                            profissionalId: {a.profissionalId || '❌ NULL'}
                          </span>
                        </li>
                )}
                    </ul>
                  </div>
                </div>
              </Card>
        }
          </>
      }

      {/* ⭐ Filtro usa id como value — sem lookup por nome */}
      {profissionaisDisponiveisFilter.length > 0 && (
      !usuarioLogado ||
      !['medico', 'dentista'].includes(usuarioLogado.tipo)) &&
      <Card className="bg-gray-50/50">
            <div className="flex items-center gap-4 p-2">
              <div className="w-full max-w-xs">
                <Select
              label="Filtrar por Profissional"
              value={filterProfissional}
              onChange={(e) => setFilterProfissional(e.target.value)}
              options={[
              {
                value: 'todos',
                label: 'Todos os Profissionais'
              },
              ...profissionaisDisponiveisFilter.map((p) => ({
                value: p.id,
                label: p.nome
              }))]
              } />
            
              </div>
              {filterProfissional !== 'todos' &&
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilterProfissional('todos')}
            className="mt-6">
            
                  Limpar Filtro
                </Button>
          }
            </div>
          </Card>
      }

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {agendasFiltradas.length === 0 ?
        <div className="col-span-full text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
            <CalendarIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              Nenhuma agenda encontrada
            </h3>
            <p className="text-gray-500 mt-2 mb-6">
              {filterProfissional !== 'todos' ?
            'Nenhum resultado para o filtro selecionado.' :
            'Comece criando a primeira agenda profissional.'}
            </p>
            {podeEditar && filterProfissional === 'todos' &&
          <Button onClick={handleStartCreate}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Criar Agenda
              </Button>
          }
          </div> :

        agendasFiltradas.map((agenda) => {
          const nomeProfissionalAtual = getNomeProfissionalAtual(agenda);
          const especialidadeAtual = getEspecialidadeAtual(agenda);
          const isAberta = Boolean(agenda.ativo);
          return (
            <Card
              key={agenda.id}
              className={`flex flex-col h-full transition-shadow ${isAberta ? 'hover:shadow-md border-green-200' : 'opacity-80 border-red-200 bg-red-50/30'}`}>
              
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {nomeProfissionalAtual}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${especialidadeAtual === 'medico' ? 'bg-blue-100 text-blue-800' : 'bg-teal-100 text-teal-800'}`}>
                        
                          {especialidadeAtual === 'medico' ?
                        'Médico' :
                        'Dentista'}
                        </span>
                        {/* ⭐ Badge de status aberta/fechada */}
                        <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isAberta ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        
                          {isAberta ?
                        <>
                              <CheckCircleIcon className="w-3 h-3" /> Aberta
                            </> :

                        <>
                              <LockIcon className="w-3 h-3" /> Fechada
                            </>
                        }
                        </span>
                      </div>
                    </div>
                    {/* ⭐ Botão toggle abrir/fechar */}
                    {podeEditar &&
                  <button
                    onClick={() => handleToggleAgenda(agenda)}
                    className={`p-2 rounded-full transition-colors ${isAberta ? 'bg-green-100 hover:bg-green-200 text-green-700' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}
                    title={isAberta ? 'Fechar agenda' : 'Abrir agenda'}>
                    
                        {isAberta ?
                    <CheckCircleIcon className="w-5 h-5" /> :

                    <LockIcon className="w-5 h-5" />
                    }
                      </button>
                  }
                  </div>

                  {!isAberta &&
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                      <p className="text-xs text-red-700 flex items-center gap-1">
                        <AlertTriangleIcon className="w-3 h-3" />
                        Agenda fechada — não aparece para agendamentos. Clique
                        no botão acima para abrir.
                      </p>
                    </div>
                }

                  <div className="space-y-3 mt-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Horários Semanais
                    </h4>
                    <div className="space-y-2">
                      {agenda.horarios.
                    sort((a, b) => a.diaSemana - b.diaSemana).
                    map((h, idx) =>
                    <div
                      key={idx}
                      className="flex justify-between text-sm border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                      
                            <span className="text-gray-600 w-24">
                              {
                        DIAS_SEMANA.find(
                          (d) => d.valor === h.diaSemana
                        )?.nome.split('-')[0]
                        }
                            </span>
                            <span className="font-medium text-gray-900">
                              {h.horaInicio} - {h.horaFim}
                            </span>
                          </div>
                    )}
                    </div>
                  </div>
                </div>
                {podeEditar &&
              <div className="bg-gray-50 p-4 border-t border-gray-100 rounded-b-lg space-y-2">
                    <div className="flex gap-3">
                      <Button
                    variant="secondary"
                    className="flex-1"
                    size="sm"
                    onClick={() => handleStartEdit(agenda)}>
                    
                        <EditIcon className="w-3 h-3 mr-2" />
                        Editar
                      </Button>
                      <Button
                    variant="secondary"
                    className="flex-1"
                    size="sm"
                    onClick={() => handleAddDiaExtra(agenda)}
                    title="Adicionar um dia que não está na grade regular (ex: Sábado)">
                    
                        <CopyIcon className="w-3 h-3 mr-2" />
                        Dia Extra
                      </Button>
                      <Button
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    size="sm"
                    onClick={() => handleDeleteAgenda(agenda)}>
                    
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
              }
              </Card>);

        })
        }
      </div>
    </div>);

}