import React, { useEffect, useMemo, useState, useRef, Component } from 'react';
import { temPermissao } from '../utils/permissoes';
import {
  ClockIcon,
  PlusIcon,
  ListIcon,
  PrinterIcon,
  AlertCircleIcon,
  CalendarIcon,
  UsersIcon,
  ZapIcon,
  CheckIcon,
  CarIcon,
  UserCheckIcon,
  XIcon,
  RotateCcwIcon,
  MessageSquareIcon,
  ClipboardListIcon,
  HelpCircleIcon,
  Loader2,
  LockIcon,
  ReceiptIcon,
  DollarSignIcon,
  TrashIcon } from
'lucide-react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ToastContainer';
import { useDialog } from '../hooks/useDialog';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { useAgendaProfissional } from '../hooks/useAgendaProfissional';
import { useMensagensRecebidas } from '../hooks/useMensagensRecebidas';
import { Consulta, Paciente } from '../types';
import { API_BASE_URL } from '../config/api';
import { enviarSmsApi } from '../utils/smsApi';
import {
  enviarWhatsappMetaApi,
  metaDisponivelApi } from
'../utils/whatsappMetaApi';
import {
  TEMPLATES_ESPERADOS,
  TextosMeta,
  resolverTextosMeta } from
'../hooks/useWhatsAppMetaConfig';
import { ENV_APP_BASE_URL } from '../config/env';
import {
  salvarReciboNaConsulta,
  consultaTemRecibo } from
'../utils/reciboRapidoHelper';
import { ConsultaCard } from './agenda/ConsultaCard';
import {
  validarTelefone,
  formatarTelefoneWhatsApp,
  gerarMensagemLembrete,
  gerarMensagemConfirmacao,
  gerarMensagemCancelamento } from
'../services/whatsappMessages';
import { ConsultaModal } from '../components/ConsultaModal';
import { WhatsAppConfirmModal } from '../components/WhatsAppConfirmModal';
import { PacienteForm } from '../components/PacienteForm';
import { AtendimentoModal } from '../components/AtendimentoModal';
import { ProntuarioForm } from '../components/ProntuarioForm';
import { DialogContainer } from '../components/DialogContainer';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { EnviarMenuAjudaButton } from '../components/EnviarMenuAjudaButton';
import { Swal } from '../components/ui/SweetAlert';
import { slotValeNaData } from '../utils/recorrenciaAgenda';
// ⭐ FIX CRÍTICO: Formata data LOCAL (sem conversão UTC que causa bug de timezone)
// toISOString() converte para UTC — no Brasil (UTC-3), após 21h mostra data errada!
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
// Comparar horário/data por string exata deixava um bloqueio gravado como
// "08:00:00" ou " 8:00" invisível para a grade — e o slot era regenerado como
// livre. Toda comparação de slot passa por estes normalizadores.
function normalizarHorarioSlot(valor: unknown): string {
  const bruto = String(valor ?? '').trim();
  const partes = bruto.match(/^(\d{1,2}):(\d{2})/);
  if (!partes) return '';
  return `${partes[1].padStart(2, '0')}:${partes[2]}`;
}
function normalizarDataSlot(valor: unknown): string {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return '';
  return bruto.split(/[ T]/)[0];
}
// 'bloqueado' e 'removido' são exceções persistidas da grade: o slot não pode
// voltar a ser oferecido, qualquer que seja o status gravado no registro.
function ehSlotIndisponivel(pacienteId: unknown): boolean {
  const pid = String(pacienteId ?? '').
  trim().
  toLowerCase();
  return pid === 'bloqueado' || pid === 'removido';
}
// ⭐ Helper: formata horaChegada que pode ser ISO datetime ou time-only string
function formatarHoraChegada(horaChegada: string): string {
  if (!horaChegada) return '--:--';
  const d = new Date(horaChegada);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  const match = horaChegada.match(/^(\d{1,2}:\d{2})/);
  if (match) return match[1];
  return horaChegada;
}
// ⭐ Helper: valida se é uma cor hex válida
function isValidHexColor(color: any): boolean {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}
// ⭐ Helper: retorna cor válida ou azul padrão
function corValida(cor: any): string {
  return isValidHexColor(cor) ? cor.trim() : '#3B82F6';
}
// ⭐ Helper: gera cor com opacidade para gradiente
function corComOpacidade(hexColor: string, opacidade: number): string {
  const cor = corValida(hexColor);
  const r = parseInt(cor.slice(1, 3), 16);
  const g = parseInt(cor.slice(3, 5), 16);
  const b = parseInt(cor.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacidade})`;
}
// ⭐ Helper: cor primária do card — usa cor personalizada se definida, senão cor do status
function corPrimariaCard(consulta: {
  cor?: string;
  status: string;
  tipoAgendamento?: string;
}): string {
  if (consulta.cor && isValidHexColor(consulta.cor)) {
    return corValida(consulta.cor);
  }
  return corDoStatus(consulta.status);
}
// ⭐ Helper: retorna branco ou preto para máximo contraste com a cor de fundo
function corContraste(hexColor: string): string {
  const cor = corValida(hexColor);
  const r = parseInt(cor.slice(1, 3), 16);
  const g = parseInt(cor.slice(3, 5), 16);
  const b = parseInt(cor.slice(5, 7), 16);
  // Luminância relativa (fórmula WCAG)
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.55 ? '#000000' : '#FFFFFF';
}
// ⭐ Helper: retorna ícone/emoji da necessidade especial do paciente
function iconeNecessidadeEspecial(necessidade: string | undefined | null): {
  emoji: string;
  label: string;
  cor: string;
} | null {
  if (!necessidade) return null;
  const mapa: Record<
    string,
    {
      emoji: string;
      label: string;
      cor: string;
    }> =
  {
    CRIANÇA: {
      emoji: '👶',
      label: 'Criança',
      cor: '#EC4899'
    },
    IDOSO: {
      emoji: '👴',
      label: 'Idoso',
      cor: '#8B5CF6'
    },
    'NECESSIDADE ESPECIAL': {
      emoji: '♿',
      label: 'Necessidade Especial',
      cor: '#3B82F6'
    },
    'RETORNO CIRURGIA': {
      emoji: '🏥',
      label: 'Retorno de Cirurgia',
      cor: '#EF4444'
    },
    GESTANTE: {
      emoji: '🤰',
      label: 'Gestante',
      cor: '#EC4899'
    },
    CADEIRANTE: {
      emoji: '♿',
      label: 'Cadeirante',
      cor: '#3B82F6'
    },
    'DEFICIENTE VISUAL': {
      emoji: '🦯',
      label: 'Deficiente Visual',
      cor: '#F59E0B'
    },
    'DEFICIENTE AUDITIVO': {
      emoji: '🦻',
      label: 'Deficiente Auditivo',
      cor: '#F97316'
    }
  };
  const upper = necessidade.toUpperCase().trim();
  return (
    mapa[upper] || {
      emoji: '⚠️',
      label: necessidade,
      cor: '#6B7280'
    });

}
// ⭐ Helper: retorna cor baseada no STATUS da consulta (mesma cor dos badges)
function corDoStatus(status: string): string {
  const cores: Record<string, string> = {
    agendada: '#FFFFFF',
    aguardando_confirmacao: '#8B5CF6',
    confirmada: '#3B82F6',
    realizada: '#6366F1',
    cancelada: '#DC2626',
    aguardando_remarcacao: '#F97316',
    compareceu: '#22C55E',
    faltou: '#EF4444' // vermelho vivo
  };
  // ⭐ FIX: Normaliza para lowercase para evitar mismatch (ex: "Agendada" vs "agendada")
  const statusNormalizado = (status || '').toLowerCase().trim();
  return cores[statusNormalizado] || '#6B7280'; // cinza padrão
}
export interface AgendaPageProps {
  consultas: Consulta[];
  pacientes: Paciente[];
  onAddConsulta: (consulta: any) => Promise<any>;
  onUpdateConsulta: (id: string, updates: Partial<Consulta>) => void;
  onUpdatePaciente?: (id: string, updates: Partial<Paciente>) => void;
  usuarioLogado?: {
    id?: string;
    nome: string;
    tipo: 'super_admin' | 'admin' | 'medico' | 'dentista' | 'atendente';
  };
  clinicaId?: string;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  profissionalIdFiltro: string;
  usuarios?: Array<{
    id: string;
    nome: string;
    tipo: string;
    clinicaId?: string;
  }>;
  onNavigate?: (page: string) => void;
  lockedDates?: string[]; // ⭐ Dias fechados (com cadeado) para o profissional selecionado
  extraDates?: string[]; // ⭐ Dias abertos como agenda extra (sem grade regular)
}
export function AgendaPage({
  consultas,
  pacientes,
  onAddConsulta,
  onUpdateConsulta,
  onUpdatePaciente,
  usuarioLogado,
  clinicaId,
  selectedDate,
  onDateSelect,
  profissionalIdFiltro,
  usuarios = [],
  onNavigate,
  lockedDates = [],
  extraDates = []
}: AgendaPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConsulta, setEditingConsulta] = useState<Consulta | undefined>();
  const [preFilledHorario, setPreFilledHorario] = useState<string | undefined>();
  const [isWhatsAppConfirmOpen, setIsWhatsAppConfirmOpen] = useState(false);
  const [pendingWhatsAppSend, setPendingWhatsAppSend] = useState<{
    consultaId: string;
    tipo: 'lembrete' | 'confirmacao' | 'cancelamento';
    paciente?: Paciente;
    // ⭐ Canal efetivo do envio. Três canais opcionais e independentes:
    // 'whatsapp' (WAHA), 'meta' (Cloud API oficial, por template aprovado) e
    // 'sms' (SMSGo, com link de confirmação).
    canal?: 'whatsapp' | 'sms' | 'meta';
    linkConfirmacao?: string;
  } | null>(null);
  // ⭐ Motivo da troca automática de canal, mostrado DENTRO do modal de envio.
  // Antes isso era um diálogo extra antes do modal — um clique a mais para
  // dizer o que cabia na própria tela de envio.
  const [avisoCanalEnvio, setAvisoCanalEnvio] = useState<string | null>(null);
  // ⭐ Sessão do WAHA verificada como fora do ar nesta tentativa de envio.
  const [wahaFora, setWahaFora] = useState(false);
  // ⭐ Disponibilidade do canal Meta (WhatsApp oficial) para esta clínica
  const [metaInfo, setMetaInfo] = useState<{
    disponivel: boolean;
    preferencial?: boolean;
    motivo?: string;
    templates?: Record<
      string,
      {name: string;language: string;temBotaoUrl?: boolean;}>;

    /** Textos fixos das variáveis (local, instruções, informações) */
    textos?: Partial<TextosMeta>;
  }>({
    disponivel: false
  });
  // ⭐ Disponibilidade do canal SMS (SMSGo) para esta clínica
  const [smsInfo, setSmsInfo] = useState<{
    disponivel: boolean;
    usarComoFallback?: boolean;
    motivo?: string;
  }>({
    disponivel: false
  });
  // Canal escolhido no momento da validação, lido no envio
  const canalEnvioRef = useRef<'whatsapp' | 'sms' | 'meta'>('whatsapp');
  // Atendimento Modal
  const [isAtendimentoModalOpen, setIsAtendimentoModalOpen] = useState(false);
  const [consultaEmAtendimento, setConsultaEmAtendimento] = useState<
    Consulta | undefined>(
  );
  // ⭐ NOVO: Modal de Prontuário para atendimento completo
  const [isProntuarioModalOpen, setIsProntuarioModalOpen] = useState(false);
  const [pacienteParaAtendimento, setPacienteParaAtendimento] = useState<
    Paciente | undefined>(
  );
  // Modal de Paciente - RESTAURADO
  const [isPacienteModalOpen, setIsPacienteModalOpen] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState<
    Paciente | undefined>(
  );
  // ⭐ Pilha de navegação entre titular e dependente dentro da ficha
  const [pacienteEditStack, setPacienteEditStack] = useState<any[]>([]);
  // Estado para foto do WhatsApp
  const [whatsappPhotoModal, setWhatsappPhotoModal] = useState<{
    isOpen: boolean;
    paciente: Paciente | null;
    contactInfo: any;
    loading: boolean;
  }>({
    isOpen: false,
    paciente: null,
    contactInfo: null,
    loading: false
  });
  // New state for batch creation
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  // Estado para controlar qual dropdown de status está aberto
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(
    null
  );
  // ⭐ NOVO: Estado para controlar se está criando um encaixe
  const [isEncaixeMode, setIsEncaixeMode] = useState(false);
  // ⭐ NOVO: Info do encaixe rápido sendo criado
  const [encaixeRapidoInfo, setEncaixeRapidoInfo] = useState<{
    origemId: string;
    nivel: 1 | 2;
    duracao: number;
    cor: string;
    tag: string;
    profissional: string;
    profissionalId: string;
    data: string;
  } | null>(null);
  // ⭐ NOVO: Foto de perfil expandida no card da agenda
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
  // ⭐ NOVO: Estado para scroll automático após criar consulta
  const [scrollToHorario, setScrollToHorario] = useState<string | null>(null);
  const consultaListRef = useRef<HTMLDivElement>(null);
  // ⭐ NOVO: Multi-seleção de horários para agendar múltiplas consultas de uma vez
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  // ⭐ NOVO: Modo transferência — selecionar consultas existentes para transferir a outro profissional
  const [transferMode, setTransferMode] = useState(false);
  const [selectedConsultaIds, setSelectedConsultaIds] = useState<string[]>([]);
  // ⭐ NOVO: Card "Fila de Atendimento" oculto por padrão — economiza espaço vertical na agenda.
  // Toggle pelo botão roxo "N aguardando" no topo da página.
  const [filaAtendimentoVisible, setFilaAtendimentoVisible] = useState(false);
  // ⭐ NOVO: Modal de cancelamento com motivo, data e hora
  const [cancelamentoModal, setCancelamentoModal] = useState<{
    isOpen: boolean;
    consultaId: string;
    motivo: string;
    dataCancelamento: string;
    horaCancelamento: string;
  }>({
    isOpen: false,
    consultaId: '',
    motivo: '',
    dataCancelamento: '',
    horaCancelamento: ''
  });
  // ⭐ Política de cancelamento (prazo limite em horas + valor da taxa) persistida em localStorage
  const [politicaCancelamento, setPoliticaCancelamento] = useState<{
    prazoHoras: number;
    valorTaxa: number;
  }>(() => {
    try {
      const raw = localStorage.getItem('agenda_politica_cancelamento');
      if (raw) {
        const p = JSON.parse(raw);
        return {
          prazoHoras: Number(p.prazoHoras) || 24,
          valorTaxa: Number(p.valorTaxa) || 0
        };
      }
    } catch {}
    return {
      prazoHoras: 24,
      valorTaxa: 0
    };
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        'agenda_politica_cancelamento',
        JSON.stringify(politicaCancelamento)
      );
    } catch {}
  }, [politicaCancelamento]);
  const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  // ⭐ NOVO: Recibo Rápido inline na agenda
  const [reciboRapidoAberto, setReciboRapidoAberto] = useState<string | null>(
    null
  );
  const [reciboRapidoValor, setReciboRapidoValor] = useState('');
  const [reciboRapidoLoading, setReciboRapidoLoading] = useState(false);
  const [recibosEmitidos, setRecibosEmitidos] = useState<Set<string>>(new Set());
  const reciboRapidoInputRef = useRef<HTMLInputElement>(null);
  // ⭐⭐⭐ v8.0: ALERTA GRANDE DE CHEGADA DO PACIENTE ⭐⭐⭐
  const [chegadaAlerta, setChegadaAlerta] = useState<{
    isOpen: boolean;
    pacienteNome: string;
    horaChegada: string;
    horario: string | null;
    profissional: string | null;
    consultaId: string | null;
  }>({
    isOpen: false,
    pacienteNome: '',
    horaChegada: '',
    horario: null,
    profissional: null,
    consultaId: null
  });
  const { toasts, removeToast, success, error: toastError } = useToast();
  const {
    dialogs,
    removeDialog,
    alert,
    confirm,
    error: dialogError
  } = useDialog();
  const [whatsappConfig, setWhatsappConfig] = useState<any>(null);
  const { agendas } = useAgendaProfissional(clinicaId);
  // ⭐⭐⭐ HELPER CRÍTICO: Busca agenda por profissionalId COM FALLBACK por nome
  // Resolve o problema de IDs diferentes entre tabela agendas e tabela usuarios (pós-migração)
  const findAgendaForProfissional = (
  profId: string)
  : (typeof agendas)[number] | undefined => {
    if (!profId || profId === 'todos') return undefined;
    // 1. Tenta match por ID (ideal)
    const byId = agendas.find(
      (a) => String(a.profissionalId) === String(profId)
    );
    if (byId) return byId;
    // 2. Fallback: busca o nome do profissional e tenta match por nome
    const profissional = usuarios.find((u) => String(u.id) === String(profId));
    if (profissional?.nome) {
      const nomeNorm = profissional.nome.trim().toUpperCase();
      const byNome = agendas.find(
        (a) =>
        a.profissionalNome &&
        a.profissionalNome.trim().toUpperCase() === nomeNorm
      );
      if (byNome) {
        console.warn(
          `⚠️ [AgendaPage] Agenda encontrada por NOME ("${profissional.nome}") — IDs divergentes: agenda.profissionalId="${byNome.profissionalId}" vs usuario.id="${profId}". Considere atualizar o profissionalId da agenda.`
        );
        return byNome;
      }
    }
    return undefined;
  };
  // ⭐ NOVO: Calcula durações de encaixe baseado na agenda do profissional
  const calcularDuracoesEncaixe = (profissionalId: string) => {
    const agenda = findAgendaForProfissional(profissionalId);
    const duracaoPadrao = agenda?.horarios?.[0]?.duracaoConsultaPadrao || 30;
    const encaixe1 = Math.max(5, Math.ceil(duracaoPadrao * 0.5));
    const encaixe2 = Math.max(5, Math.ceil(encaixe1 * 0.5));
    return {
      duracaoPadrao,
      encaixe1,
      encaixe2
    };
  };
  // ⭐ NOVO: Verifica se um encaixe já foi criado a partir de uma consulta
  const encaixeJaExiste = (consultaId: string, nivel: 1 | 2): boolean => {
    const tag = `[ENCAIXE_${nivel}_DE:${consultaId}]`;
    return consultasFiltradas.some(
      (c) =>
      c.observacoes?.includes(tag) &&
      c.tipoAgendamento === 'encaixe' &&
      c.status !== 'cancelada'
    );
  };
  // ⭐ NOVO: Cria encaixe a partir de uma consulta normal
  const handleCriarEncaixeRapido = async (
  consultaOrigem: Consulta,
  nivel: 1 | 2) =>
  {
    const { encaixe1, encaixe2 } = calcularDuracoesEncaixe(
      consultaOrigem.profissionalId || ''
    );
    const duracao = nivel === 1 ? encaixe1 : encaixe2;
    const cor = nivel === 1 ? '#F97316' : '#EF4444';
    const tag = `[ENCAIXE_${nivel}_DE:${consultaOrigem.id}]`;
    // Abre o modal pré-preenchido com dados do encaixe
    setPreFilledHorario(consultaOrigem.horario);
    setIsEncaixeMode(true);
    setEditingConsulta(undefined);
    // Salva info do encaixe para usar quando o modal salvar
    setEncaixeRapidoInfo({
      origemId: consultaOrigem.id,
      nivel,
      duracao,
      cor,
      tag,
      profissional: consultaOrigem.profissional,
      profissionalId: consultaOrigem.profissionalId || '',
      data: consultaOrigem.data
    });
    setIsModalOpen(true);
  };
  // ⭐ FIX multi-tenant: clinicaIdEfetivo precisa ser declarado ANTES do useEffect
  // do SSE para que o effect possa usá-lo na dependency array (TDZ-safe).
  const sessaoInicial = JSON.parse(localStorage.getItem('sessao') || '{}');
  const clinicaIdEfetivo = clinicaId || sessaoInicial?.clinicaAtual?.id || '';
  // ⭐ Mensagem LIVRE do paciente não vem pelo SSE (que só transmite confirmação,
  // cancelamento e chegada). Sem este acompanhamento, a resposta ficava invisível
  // até alguém abrir a conversa paciente por paciente.
  // O aviso visível fica no contador do cabeçalho; aqui só o piscar do card.
  const { pacientesComMensagemNova, marcarComoLida } =
  useMensagensRecebidas(clinicaIdEfetivo);
  // ⭐⭐⭐ v8.0: SSE LISTENER PARA CHEGADA DE PACIENTES ⭐⭐⭐
  // ⭐ FIX multi-tenant: passa clinicaId na URL para que o servidor SÓ envie
  // notificações da clínica que o usuário está logado no momento. Antes, o SSE
  // era global e qualquer chegada em qualquer clínica era recebida por TODOS
  // os usuários (bug "Danilo chegou em Lodonto" aparecendo em Paulimedic).
  useEffect(() => {
    let eventSource: EventSource | null = null;
    // ⭐ FIX LOOP: rastreia o timer de reconexão e um flag de "encerrado" para que
    // o cleanup do efeito cancele qualquer reconexão pendente. Sem isso, o setTimeout
    // do onerror continuava disparando conectarSSE após o efeito ser limpo, empilhando
    // conexões e gerando o ciclo conecta/desconecta + recargas em cascata.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let encerrado = false;
    const conectarSSE = () => {
      if (encerrado) return;
      try {
        const clinicaIdSse = clinicaIdEfetivo || '';
        if (!clinicaIdSse) {
          console.warn(
            '🔔 [SSE] clinicaId vazio — não conectando ao chegada-sse para evitar receber eventos cross-tenant'
          );
          return;
        }
        // Fecha qualquer conexão anterior antes de abrir uma nova (evita empilhamento)
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        eventSource = new EventSource(
          `${API_BASE_URL}/api/whatsapp/chegada-sse?clinicaId=${encodeURIComponent(clinicaIdSse)}`
        );
        eventSource.onmessage = (event) => {
          try {
            const dados = JSON.parse(event.data);
            console.log('🔔 [SSE] Evento recebido:', dados);
            // ⭐⭐⭐ FIX v10.9.9: Distingue entre chegada real e confirmação/cancelamento ⭐⭐⭐
            if (dados.type === 'chegada_paciente') {
              // CHEGADA REAL do paciente na clínica (via opção 7 do menu ou check-in)
              console.log(
                `🔔 [SSE] PACIENTE CHEGOU: ${dados.pacienteNome} às ${dados.horaChegadaFormatada}`
              );
              // ⭐⭐⭐ FIX v20.1: Atualiza consulta local com horaChegada + statusAtendimento ⭐⭐⭐
              if (dados.consultaId) {
                onUpdateConsulta(dados.consultaId, {
                  horaChegada: new Date().toISOString(),
                  statusAtendimento: 'aguardando' as any,
                  status: 'confirmada'
                });
                console.log(
                  `🔔 [SSE] ✅ Consulta ${dados.consultaId} atualizada: horaChegada + statusAtendimento=aguardando + status=confirmada`
                );
              }
              try {
                const audio = new Audio(
                  'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjqIr9jNdj0jQIy54tV2Px5Coverage'
                );
                audio.volume = 0.5;
                audio.play().catch(() => {});
              } catch (e) {}
              setChegadaAlerta({
                isOpen: true,
                pacienteNome: dados.pacienteNome,
                horaChegada: dados.horaChegadaFormatada || '--:--',
                horario: dados.horario,
                profissional: dados.profissional,
                consultaId: dados.consultaId
              });
              setTimeout(() => {
                setChegadaAlerta((prev) =>
                prev.pacienteNome === dados.pacienteNome ?
                {
                  ...prev,
                  isOpen: false
                } :
                prev
                );
              }, 30000);
            } else if (dados.type === 'confirmacao_consulta') {
              // CONFIRMAÇÃO de consulta via WhatsApp (paciente respondeu SIM/1/etc)
              console.log(
                `🔔 [SSE] CONSULTA CONFIRMADA: ${dados.pacienteNome} - ${dados.horario}`
              );
              // ⭐⭐⭐ FIX v16.7: Atualiza o status da consulta no frontend ⭐⭐⭐
              if (dados.consultaId) {
                onUpdateConsulta(dados.consultaId, {
                  status: 'confirmada'
                });
                console.log(
                  `🔔 [SSE] ✅ Status da consulta ${dados.consultaId} atualizado para 'confirmada' no frontend`
                );
              }
              setChegadaAlerta({
                isOpen: true,
                pacienteNome: dados.pacienteNome,
                horaChegada: '__confirmacao__',
                horario: dados.horario,
                profissional: dados.profissional,
                consultaId: dados.consultaId
              });
              // ⭐ Resposta do paciente: aviso some sozinho em 3s para não
              //    encobrir a agenda de quem está atendendo.
              setTimeout(() => {
                setChegadaAlerta((prev) =>
                prev.pacienteNome === dados.pacienteNome ?
                {
                  ...prev,
                  isOpen: false
                } :
                prev
                );
              }, 3000);
            } else if (dados.type === 'cancelamento_consulta') {
              // CANCELAMENTO de consulta via WhatsApp
              console.log(
                `🔔 [SSE] CONSULTA CANCELADA: ${dados.pacienteNome} - ${dados.horario}`
              );
              // ⭐⭐⭐ FIX v16.7: Atualiza o status da consulta no frontend ⭐⭐⭐
              if (dados.consultaId) {
                // ⭐ Cancelamento via WhatsApp grava data/hora AUTOMATICAMENTE.
                // Usa os valores vindos do servidor; se ausentes, cai no horário
                // local atual (mesmos formatos do cancelamento manual).
                const nowLocal = new Date();
                const dataCancelamento =
                dados.dataCancelamento || nowLocal.toLocaleDateString('en-CA'); // YYYY-MM-DD
                const horaCancelamento =
                dados.horaCancelamento ||
                nowLocal.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                });
                onUpdateConsulta(dados.consultaId, {
                  status: 'cancelada',
                  dataCancelamento,
                  horaCancelamento,
                  canceladoPor: dados.canceladoPor || 'Paciente',
                  canalCancelamento: dados.canalCancelamento || 'WhatsApp'
                });
                console.log(
                  `🔔 [SSE] ✅ Consulta ${dados.consultaId} → 'cancelada' no frontend (cancelada em ${dataCancelamento} ${horaCancelamento})`
                );
              }
              setChegadaAlerta({
                isOpen: true,
                pacienteNome: dados.pacienteNome,
                horaChegada: '__cancelamento__',
                horario: dados.horario,
                profissional: dados.profissional,
                consultaId: dados.consultaId
              });
              // ⭐ Resposta do paciente: aviso some sozinho em 3s.
              setTimeout(() => {
                setChegadaAlerta((prev) =>
                prev.pacienteNome === dados.pacienteNome ?
                {
                  ...prev,
                  isOpen: false
                } :
                prev
                );
              }, 3000);
            } else if (dados.type === 'motivo_cancelamento') {
              // ⭐⭐⭐ FIX v22.1: Atualiza motivoCancelamento no card da agenda ⭐⭐⭐
              console.log(
                `🔔 [SSE] MOTIVO CANCELAMENTO: ${dados.pacienteNome} - "${dados.motivoCancelamento}"`
              );
              if (dados.consultaId && dados.motivoCancelamento) {
                // ⭐ Mantém status/data/hora do cancelamento junto do motivo, para
                // que o card exiba tudo mesmo se o evento anterior não foi recebido.
                const patch: Record<string, any> = {
                  status: 'cancelada',
                  motivoCancelamento: dados.motivoCancelamento,
                  canceladoPor: dados.canceladoPor || 'Paciente',
                  canalCancelamento: dados.canalCancelamento || 'WhatsApp'
                };
                if (dados.dataCancelamento)
                patch.dataCancelamento = dados.dataCancelamento;
                if (dados.horaCancelamento)
                patch.horaCancelamento = dados.horaCancelamento;
                onUpdateConsulta(dados.consultaId, patch);
                console.log(
                  `🔔 [SSE] ✅ motivoCancelamento + data/hora atualizados no card ${dados.consultaId} (${dados.dataCancelamento || '?'} ${dados.horaCancelamento || '?'})`
                );
              }
            }
          } catch (e) {
            console.log('🔔 [SSE] Erro ao parsear evento:', e);
          }
        };
        eventSource.onerror = () => {
          if (encerrado) return;
          console.log('🔔 [SSE] Conexão perdida, reconectando em 5s...');
          eventSource?.close();
          eventSource = null;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(conectarSSE, 5000);
        };
      } catch (e) {
        console.log('🔔 [SSE] Erro ao conectar:', e);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(conectarSSE, 10000);
      }
    };
    conectarSSE();
    return () => {
      // ⭐ FIX LOOP: encerra o efeito e cancela qualquer reconexão pendente
      encerrado = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      eventSource?.close();
      eventSource = null;
    };
    // ⭐ FIX multi-tenant: reconecta quando o usuário troca de clínica para
    // garantir que o SSE filtre pela clínica ATUAL e não receba mais eventos
    // da clínica anterior. clinicaIdEfetivo está disponível em escopo léxico
    // (declarado abaixo) — TypeScript permite porque é function-scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaIdEfetivo]);
  // Get session for print
  const sessao = sessaoInicial;
  // clinicaIdEfetivo já foi declarado acima (antes do useEffect do SSE) — ver FIX multi-tenant.
  // Log para debug
  useEffect(() => {
    console.log('🏥 [AgendaPage] clinicaId prop:', clinicaId);
    console.log('🏥 [AgendaPage] clinicaIdEfetivo:', clinicaIdEfetivo);
  }, [clinicaId, clinicaIdEfetivo]);
  // AUTO-SELECIONA profissional se for médico/dentista
  useEffect(() => {
    if (
    usuarioLogado && (
    usuarioLogado.tipo === 'medico' || usuarioLogado.tipo === 'dentista'))
    {
      // ⭐ FIX: Usa ID direto em vez de buscar por nome
      if (usuarioLogado.id && profissionalIdFiltro !== usuarioLogado.id) {
        console.log(
          '🔒 [AgendaPage] Auto-selecionando profissional ID:',
          usuarioLogado.id
        );
      }
    }
  }, [usuarioLogado, profissionalIdFiltro]);
  useEffect(() => {
    // Carrega configuração inicial
    const loadConfig = () => {
      // ⭐⭐⭐ PRIMEIRO: Tenta carregar da API (tem apiKey) ⭐⭐⭐
      const sessao = localStorage.getItem('sessao');
      let currentClinicaId = '';
      if (sessao) {
        const parsed = JSON.parse(sessao);
        currentClinicaId = parsed.clinicaAtual?.id || '';
      }
      if (currentClinicaId) {
        fetch(
          `${API_BASE_URL}/api/whatsapp-config?clinicaId=${currentClinicaId}`
        ).
        then((r) => r.ok ? r.json() : null).
        then((data) => {
          if (data) {
            // Garante ativo = true
            data.ativo = true;
            setWhatsappConfig(data);
            console.log(
              '✅ [AgendaPage] Config WhatsApp carregada da API (com apiKey)'
            );
            return;
          }
        }).
        catch(() => {});
      }
      // Fallback: localStorage
      let stored = localStorage.getItem('whatsapp_config');
      if (stored) {
        try {
          const config = JSON.parse(stored);
          // FORÇA ATIVO = TRUE
          config.ativo = true;
          localStorage.setItem('whatsapp_config', JSON.stringify(config));
          setWhatsappConfig(config);
        } catch (err) {
          console.error('❌ Erro ao parsear configuração:', err);
        }
      } else {
        // Sem configuração persistida não há sessão ativa. Nunca criamos uma
        // configuração local fictícia, pois ela poderia apontar para outra sessão.
        setWhatsappConfig(null);
      }
    };
    loadConfig();
    // Escuta mudanças no localStorage (quando salvar em outra aba/página)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'whatsapp_config') {
        loadConfig();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Escuta evento customizado para mudanças na mesma aba
    const handleConfigUpdate = () => {
      loadConfig();
    };
    window.addEventListener('whatsapp-config-updated', handleConfigUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('whatsapp-config-updated', handleConfigUpdate);
    };
  }, []);
  // ⭐ Descobre se a clínica pode enviar por SMS (canal alternativo ao WhatsApp)
  useEffect(() => {
    if (!clinicaIdEfetivo) {
      setSmsInfo({
        disponivel: false
      });
      return;
    }
    let cancelado = false;
    // A disponibilidade é derivada da PRÓPRIA configuração de SMS da clínica
    // (/api/sms-config), que é a mesma fonte usada na tela de Configurações.
    // Não depende de rota auxiliar: se a configuração existe, está ativa e tem
    // chave, o canal é oferecido — e qualquer falha real aparece no envio.
    fetch(`${API_BASE_URL}/api/sms-config?clinicaId=${clinicaIdEfetivo}`).
    then((r) => r.ok ? r.json() : null).
    then((data) => {
      if (cancelado) return;
      if (!data) {
        setSmsInfo({
          disponivel: false,
          motivo: 'SMS ainda não configurado nesta clínica.'
        });
        return;
      }
      const temChave = Boolean(data.apiKey || data.bearerToken);
      setSmsInfo({
        disponivel: Boolean(data.ativo) && temChave,
        usarComoFallback: data.usarComoFallback !== false,
        motivo: !temChave ?
        'A SMSGo-key ainda não foi informada em Configurações → SMS.' :
        !data.ativo ?
        'O envio por SMS está desativado em Configurações → SMS.' :
        undefined
      });
    }).
    catch(() => {
      if (!cancelado)
      setSmsInfo({
        disponivel: false,
        motivo: 'Não foi possível verificar a configuração de SMS.'
      });
    });
    return () => {
      cancelado = true;
    };
  }, [clinicaIdEfetivo]);
  // ⭐ Descobre se a clínica tem o WhatsApp OFICIAL da Meta ativo. Fica AO LADO
  // do WAHA: se marcado como preferencial, os avisos saem pela Meta; senão,
  // entra como alternativa quando o WAHA não entrega.
  useEffect(() => {
    if (!clinicaIdEfetivo) {
      setMetaInfo({
        disponivel: false
      });
      return;
    }
    let cancelado = false;
    metaDisponivelApi(clinicaIdEfetivo).then((info) => {
      if (cancelado) return;
      setMetaInfo({
        disponivel: Boolean(info.disponivel),
        preferencial: Boolean(info.preferencial),
        motivo: info.motivo,
        templates: info.templates,
        textos: info.textos
      });
    });
    return () => {
      cancelado = true;
    };
  }, [clinicaIdEfetivo]);
  const { sendMessage, isReady, status } = useWhatsApp(
    whatsappConfig?.serverUrl || '',
    whatsappConfig?.sessionName || ''
  );
  const formatDateKey = (date: Date) => {
    return formatLocalDate(date);
  };
  const mostrarFiltroProfissional =
  !usuarioLogado ||
  ['super_admin', 'admin', 'atendente'].includes(usuarioLogado.tipo);
  const profissionais = useMemo(() => {
    const profissionaisMap = new Map<
      string,
      {
        id: string;
        nome: string;
      }>(
    );
    // ⭐ ÚNICA FONTE DE VERDADE: Cadastro de usuários (NUNCA use nome de agenda ou consulta)
    usuarios.forEach((u) => {
      const isMedicoOuDentista = u.tipo === 'medico' || u.tipo === 'dentista';
      const pertenceClinica =
      String(u.clinicaId || '') === String(clinicaId || '') || !u.clinicaId;
      const isAtivo = u.ativo !== false && u.ativo !== 0;
      if (isMedicoOuDentista && pertenceClinica && isAtivo) {
        profissionaisMap.set(u.id, {
          id: u.id,
          nome: '...' + u.nome
        });
      }
    });
    // ⚠️ NÃO adiciona profissionais de agendas ou consultas - SOMENTE do cadastro de usuários
    const resultado = Array.from(profissionaisMap.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome)
    );
    return resultado;
  }, [consultas, agendas, usuarios, clinicaId]);
  // Filtra consultas por profissional (SOMENTE por ID, nunca por nome)
  const consultasFiltradas = useMemo(() => {
    // MÉDICOS E DENTISTAS: Veem apenas suas próprias consultas
    if (
    usuarioLogado && (
    usuarioLogado.tipo === 'medico' || usuarioLogado.tipo === 'dentista'))
    {
      const meuId = usuarioLogado.id;
      if (meuId) {
        return consultas.filter(
          (c) => String(c.profissionalId) === String(meuId)
        );
      }
      return [];
    }
    // ATENDENTES, ADMINS E SUPER_ADMINS: Podem filtrar por profissional
    if (profissionalIdFiltro !== 'todos') {
      return consultas.filter(
        (c) => String(c.profissionalId) === String(profissionalIdFiltro)
      );
    }
    return consultas;
  }, [consultas, profissionalIdFiltro, usuarioLogado]);
  // Placeholders removidos permanecem persistidos para impedir a regeneração do
  // slot. Esta lista respeita o profissional selecionado (ou todos, na visão geral).
  const horariosRemovidosDoDia = useMemo(() => {
    const dataStr = formatLocalDate(selectedDate);
    return consultasFiltradas.filter(
      (consulta) =>
      normalizarDataSlot(consulta.data) === dataStr &&
      String(consulta.pacienteId || '').
      trim().
      toLowerCase() === 'removido'
    );
  }, [consultasFiltradas, selectedDate]);
  const handleRestaurarHorariosExcluidos = async () => {
    if (horariosRemovidosDoDia.length === 0) return;
    const quantidade = horariosRemovidosDoDia.length;
    const result = await Swal.fire({
      icon: 'question',
      title: 'Restaurar horários excluídos?',
      text: `${quantidade} horário${quantidade > 1 ? 's' : ''} voltará${quantidade > 1 ? 'ão' : ''} a ficar disponível${quantidade > 1 ? 'is' : ''} para agendamento. Consultas de pacientes e horários bloqueados não serão alterados.`,
      showCancelButton: true,
      confirmButtonText: 'Sim, restaurar horários',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d9488'
    });
    if (!result.isConfirmed) return;
    try {
      await Promise.all(
        horariosRemovidosDoDia.map((consulta) =>
        Promise.resolve(
          onUpdateConsulta(consulta.id, {
            pacienteId: 'disponivel',
            pacienteNome: 'Disponível',
            status: 'agendada',
            observacoes: 'Horário restaurado manualmente na agenda'
          } as Partial<Consulta>)
        )
        )
      );
      success(
        quantidade === 1 ? 'Horário restaurado' : 'Horários restaurados',
        `${quantidade} horário${quantidade > 1 ? 's foram restaurados' : ' foi restaurado'} e ${quantidade > 1 ? 'estão disponíveis' : 'está disponível'} para agendamento.`
      );
    } catch (err: any) {
      toastError(
        'Não foi possível restaurar os horários',
        err?.message || 'Tente novamente em alguns instantes.'
      );
    }
  };
  const highlightedDates = useMemo(() => {
    return Array.from(new Set(consultasFiltradas.map((c) => c.data)));
  }, [consultasFiltradas]);
  // ⭐ PERF: Map de pacientes por ID — O(1) lookup em vez de O(n) .find()
  const pacientesMapById = useMemo(() => {
    const map = new Map<string, (typeof pacientes)[number]>();
    pacientes.forEach((p) => map.set(p.id, p));
    return map;
  }, [pacientes]);
  // ⭐ PERF: Map de agendas por profissionalId — O(1) lookup
  const agendasMapByProfId = useMemo(() => {
    const map = new Map<string, (typeof agendas)[number]>();
    agendas.forEach((a) => {
      if (a.profissionalId) map.set(String(a.profissionalId), a);
      // Compatibilidade pós-migração: a agenda pode guardar um ID legado,
      // mas o profissional atual é reconhecido pelo mesmo nome configurado.
      const nomeAgenda = a.profissionalNome?.trim().toUpperCase();
      if (!nomeAgenda) return;
      usuarios.
      filter((u) => u.nome?.trim().toUpperCase() === nomeAgenda).
      forEach((u) => map.set(String(u.id), a));
    });
    return map;
  }, [agendas, usuarios]);
  // ⭐ MOVED UP: consultasDoDia must be declared BEFORE any useEffect that references it
  // ⭐ PERF: Memoizado + pré-ordenado + usa Maps para lookups O(1)
  const consultasDoDia = useMemo(() => {
    const dataStr = formatLocalDate(selectedDate);
    const baseConsultas = consultasFiltradas.
    filter((c) => normalizarDataSlot(c.data) === dataStr).
    filter((c) => {
      if (
      String(c.pacienteId || '').
      trim().
      toLowerCase() === 'removido')

      return false; // ⭐ Oculta slots removidos manualmente
      // ⭐ Horários criados MANUALMENTE ('livre') sempre aparecem — o usuário os criou
      // explicitamente, então não passam pelo filtro de recorrência A/B.
      if (c.pacienteId === 'livre') return true;
      if (c.pacienteId !== 'disponivel') return true;
      // ⭐ PERF: Usa Map em vez de findAgendaForProfissional (evita .find() em arrays)
      const agenda = agendasMapByProfId.get(String(c.profissionalId || ''));
      if (!agenda || !agenda.ativo) return false;
      // ⭐ FIX RODÍZIO A/B: respeita recorrência semana_A/semana_B + datasEspecificas.
      // Mantém o placeholder "disponível" apenas se existe um turno daquele dia que
      // realmente vale nesta data específica.
      const dataDoDia = formatLocalDate(selectedDate);
      const temTurnoValido = agenda.horarios.some((h) =>
      slotValeNaData(h, selectedDate, dataDoDia)
      );
      if (!temTurnoValido) return false;
      return true;
    });
    // ⭐ INJETA placeholders sintéticos para horários liberados (Remarcar ou Cancelada)
    // Isso permite visualizar o card original E um slot disponível no mesmo horário
    const syntheticPlaceholders: typeof baseConsultas = [];
    baseConsultas.forEach((c) => {
      if (c.status === 'aguardando_remarcacao' || c.status === 'cancelada') {
        // Verifica se já existe um placeholder ou consulta ativa neste mesmo horário/profissional
        const hasActiveOrPlaceholder = baseConsultas.some(
          (other) =>
          other.id !== c.id &&
          normalizarHorarioSlot(other.horario) ===
          normalizarHorarioSlot(c.horario) &&
          other.profissionalId === c.profissionalId && (
          other.pacienteId === 'disponivel' ||
          other.pacienteId === 'livre' ||
          other.status !== 'cancelada' &&
          other.status !== 'aguardando_remarcacao')
        );
        if (!hasActiveOrPlaceholder) {
          const alreadyAdded = syntheticPlaceholders.some(
            (synth) =>
            synth.horario === c.horario &&
            synth.profissionalId === c.profissionalId
          );
          if (!alreadyAdded) {
            syntheticPlaceholders.push({
              ...c,
              id: `synth-${c.id}`,
              pacienteId: 'disponivel',
              pacienteNome: 'Horário Disponível',
              status: 'agendada',
              observacoes: '',
              tipoAgendamento: 'consulta'
            });
          }
        }
      }
    });
    return [...baseConsultas, ...syntheticPlaceholders].sort((a, b) =>
    String(a.horario ?? '').localeCompare(String(b.horario ?? ''))
    );
  }, [consultasFiltradas, selectedDate, agendasMapByProfId]);
  // ⭐ PERF: Estado de transição — mostra loading imediato ao trocar dia
  const [dateReady, setDateReady] = useState(true);
  const dateReadyTimerRef = useRef<any>(null);
  // ⭐ NOVO: Limpa seleção de multi-horários ao mudar data ou profissional
  useEffect(() => {
    setSelectedSlots([]);
    setMultiSelectMode(false);
    // ⭐ PERF: Mostra loading imediato, defer o render pesado
    setDateReady(false);
    if (dateReadyTimerRef.current)
    cancelAnimationFrame(dateReadyTimerRef.current);
    dateReadyTimerRef.current = requestAnimationFrame(() => {
      dateReadyTimerRef.current = requestAnimationFrame(() => {
        setDateReady(true);
      });
    });
  }, [selectedDate, profissionalIdFiltro]);
  // ⭐ Scroll automático para consulta recém-criada (MUST be after consultasDoDia)
  useEffect(() => {
    if (!scrollToHorario) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(
        `[data-consulta-horario="${scrollToHorario}"]`
      );
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        el.classList.add('ring-2', 'ring-teal-500', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-teal-500', 'ring-offset-2');
        }, 2000);
      }
      setScrollToHorario(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [scrollToHorario, consultasDoDia]);
  // DEBUG: Desativado para performance (ativar apenas quando necessário)
  // console.log('🔍 [AgendaPage] DEBUG:', consultas.length, 'total,', consultasDoDia.length, 'do dia');
  /**
   * ⭐ Oferece o envio por SMS quando o WhatsApp não está disponível.
   * Retorna true quando o usuário aceita seguir por SMS.
   */
  const oferecerEnvioPorSms = async (
  tituloFalha: string,
  motivoFalha: string,
  tipo?: 'lembrete' | 'confirmacao' | 'cancelamento')
  : Promise<boolean> => {
    // ⭐ 1º) WhatsApp OFICIAL da Meta: mesmo canal para o paciente (WhatsApp) e
    // entregue mesmo com o WAHA fora, desde que o template esteja aprovado.
    // Chegar aqui significa que o WAHA não está apto a entregar agora.
    setWahaFora(true);
    const templateMeta = tipo ? metaInfo.templates?.[tipo] : undefined;
    if (metaInfo.disponivel && templateMeta) {
      // Sem diálogo intermediário: já abre o envio no canal que funciona e
      // explica o motivo na própria tela, onde o canal pode ser trocado.
      canalEnvioRef.current = 'meta';
      setAvisoCanalEnvio(
        `${motivoFalha} O envio foi direcionado ao WhatsApp oficial (Meta), pelo template aprovado "${templateMeta.name}".`
      );
      return true;
    }
    if (!smsInfo.disponivel || smsInfo.usarComoFallback === false) {
      // Explica POR QUE o SMS não foi oferecido, em vez de um beco sem saída
      const porqueSemSms =
      smsInfo.usarComoFallback === false ?
      'O uso do SMS como alternativa está desligado em Configurações → SMS.' :
      smsInfo.motivo || 'O canal de SMS não está disponível nesta clínica.';
      // Diz também por que a Meta não entrou, para não parecer beco sem saída
      const porqueSemMeta = !metaInfo.disponivel ?
      `\nWhatsApp oficial (Meta): ${metaInfo.motivo || 'não configurado nesta clínica'}.` :
      !templateMeta && tipo ?
      '\nWhatsApp oficial (Meta): o template deste aviso ainda não foi vinculado em Configurações.' :
      '';
      dialogError(
        tituloFalha,
        `${motivoFalha}\n\n${porqueSemSms}${porqueSemMeta}`
      );
      return false;
    }
    // SMS assume direto, com o motivo explicado na tela de envio.
    canalEnvioRef.current = 'sms';
    setAvisoCanalEnvio(
      `${motivoFalha} O envio foi direcionado ao SMS, com link para o paciente confirmar a presença ou cancelar informando o motivo.`
    );
    return true;
  };
  /**
   * Valida WhatsApp antes de enviar
   */
  const validarWhatsApp = async (
  tipo?: 'lembrete' | 'confirmacao' | 'cancelamento')
  : Promise<boolean> => {
    // Cada tentativa começa pelo WhatsApp; o SMS só entra por decisão explícita
    canalEnvioRef.current = 'whatsapp';
    setAvisoCanalEnvio(null);
    setWahaFora(false);
    // ⭐ Meta marcada como PREFERENCIAL: sai pela API oficial sem depender do
    // WAHA estar conectado. O WAHA continua existindo como alternativa.
    if (
    metaInfo.disponivel &&
    metaInfo.preferencial &&
    tipo &&
    metaInfo.templates?.[tipo])
    {
      canalEnvioRef.current = 'meta';
      return true;
    }
    if (!whatsappConfig?.serverUrl || !whatsappConfig?.sessionName) {
      return await oferecerEnvioPorSms(
        'WhatsApp não configurado',
        'Não há sessão de WhatsApp configurada para esta clínica.',
        tipo
      );
    }
    // ⭐⭐⭐ FIX v8.3: VERIFICAÇÃO EM 3 CAMADAS ⭐⭐⭐
    // 1. Se o hook já diz que está conectado, OK
    if (status === 'connected' && isReady) {
      console.log('✅ [validarWhatsApp] Hook diz connected + isReady → OK');
      return true;
    }
    // 2. Verifica cache do localStorage
    const storedStatus = localStorage.getItem(
      `whatsapp_session_status_${clinicaIdEfetivo}`
    );
    if (storedStatus) {
      try {
        const parsed = JSON.parse(storedStatus);
        const isRecent = Date.now() - parsed.timestamp < 5 * 60 * 1000;
        const isConnectedInStorage =
        parsed.sessionName === whatsappConfig.sessionName &&
        parsed.status === 'connected' &&
        parsed.isReady &&
        isRecent;
        if (isConnectedInStorage) {
          console.log(
            '✅ [validarWhatsApp] Cache localStorage diz connected → OK'
          );
          return true;
        }
      } catch (err) {
        console.error('❌ Erro ao ler status do localStorage:', err);
      }
    }
    // 3. ⭐⭐⭐ NOVO: Faz verificação AO VIVO antes de bloquear ⭐⭐⭐
    // O cache pode estar desatualizado, então pergunta ao servidor
    console.log(
      '🔍 [validarWhatsApp] Cache desatualizado, verificando ao vivo...'
    );
    try {
      const serverUrl = whatsappConfig?.serverUrl || '';
      const sessionName = whatsappConfig?.sessionName || '';
      if (serverUrl && sessionName) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const liveResponse = await fetch(
          `${API_BASE_URL}/api/whatsapp/status?serverUrl=${encodeURIComponent(serverUrl)}&sessionName=${encodeURIComponent(sessionName)}`,
          {
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);
        if (liveResponse.ok) {
          const liveData = await liveResponse.json();
          const wahaStatus = (liveData.status || '').toUpperCase();
          if (wahaStatus === 'NOT_FOUND') {
            return await oferecerEnvioPorSms(
              'Sessão WhatsApp não encontrada',
              'A sessão configurada não existe no servidor de WhatsApp.',
              tipo
            );
          }
          if (liveData.sessionExists === false) {
            return await oferecerEnvioPorSms(
              'Não foi possível confirmar a sessão',
              liveData.error ||
              'O servidor de WhatsApp não confirmou a sessão configurada.',
              tipo
            );
          }
          const isLiveConnected =
          wahaStatus === 'WORKING' ||
          wahaStatus === 'CONNECTED' ||
          wahaStatus === 'ONLINE' ||
          liveData.isReady === true;
          console.log(
            `🔍 [validarWhatsApp] Status ao vivo: ${wahaStatus}, isReady: ${liveData.isReady}, connected: ${isLiveConnected}`
          );
          if (isLiveConnected) {
            // Atualiza o cache para evitar verificações futuras
            localStorage.setItem(
              `whatsapp_session_status_${clinicaIdEfetivo}`,
              JSON.stringify({
                sessionName,
                status: 'connected',
                isReady: true,
                timestamp: Date.now()
              })
            );
            console.log(
              '✅ [validarWhatsApp] Verificação ao vivo: CONECTADO → OK (cache atualizado)'
            );
            return true;
          }
        }
      }
    } catch (err) {
      console.log('⚠️ [validarWhatsApp] Erro na verificação ao vivo:', err);
      // Se a verificação ao vivo falhar por timeout/rede, tenta enviar mesmo assim
      // O envio em si fará a verificação final
      if (whatsappConfig?.serverUrl && whatsappConfig?.sessionName) {
        console.log(
          '⚠️ [validarWhatsApp] Verificação falhou mas config existe → tentando enviar mesmo assim'
        );
        return true;
      }
    }
    // 4. Nenhuma verificação passou → oferece Meta/SMS antes de bloquear
    return await oferecerEnvioPorSms(
      'WhatsApp Desconectado',
      'O WhatsApp não está conectado no momento.',
      tipo
    );
  };
  /**
   * Envia lembrete de consulta
   */
  const enviarLembrete = async (consultaId: string) => {
    console.log('🔔 [enviarLembrete] Iniciando...', consultaId);
    if (!(await validarWhatsApp('lembrete'))) return;
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    console.log('📋 [enviarLembrete] Consulta encontrada:', consulta);
    if (!consulta) return;
    // Busca paciente na lista local primeiro
    let paciente = pacientes.find((p) => p.id === consulta.pacienteId);
    console.log(
      '👤 [enviarLembrete] Paciente na lista local:',
      paciente ? 'ENCONTRADO' : 'NÃO ENCONTRADO'
    );
    // Se não encontrou ou não tem telefone, busca via API PELO ID
    if (!paciente || !paciente.telefone) {
      console.log(
        '🌐 [enviarLembrete] Buscando via API pelo ID...',
        consulta.pacienteId
      );
      try {
        // ⭐⭐⭐ FIX CRÍTICO: Busca pelo ID, não pelo nome (evita homônimos) ⭐⭐⭐
        const url = `${API_BASE_URL}/api/pacientes/${consulta.pacienteId}?clinicaId=${clinicaIdEfetivo}`;
        console.log('🔗 [enviarLembrete] URL (por ID):', url);
        const response = await fetch(url);
        console.log('📡 [enviarLembrete] Response status:', response.status);
        if (response.ok) {
          const result = await response.json();
          paciente = result.data || result;
          console.log(
            '👤 [enviarLembrete] Paciente encontrado por ID:',
            paciente?.id,
            paciente?.nome,
            paciente?.telefone
          );
        }
        // Fallback: busca por nome mas filtra por ID
        if (!paciente || !(paciente.telefone || paciente.celular)) {
          console.log(
            '🔄 [enviarLembrete] Fallback: buscando por nome mas filtrando por ID...'
          );
          const params = new URLSearchParams({
            clinicaId: clinicaIdEfetivo,
            search: consulta.pacienteNome,
            limit: '50',
            page: '1'
          });
          const fallbackUrl = `${API_BASE_URL}/api/pacientes?${params}`;
          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            const fallbackResult = await fallbackResponse.json();
            paciente = fallbackResult.data?.find(
              (p: any) => String(p.id) === String(consulta.pacienteId)
            );
            console.log(
              '👤 [enviarLembrete] Paciente por ID no fallback:',
              paciente?.id,
              paciente?.nome,
              paciente?.telefone
            );
          }
        }
      } catch (err) {
        console.error('❌ [enviarLembrete] Erro ao buscar paciente:', err);
      }
    }
    console.log('👤 [enviarLembrete] Paciente FINAL:', paciente);
    console.log(
      '📋 [enviarLembrete] Campos do paciente:',
      Object.keys(paciente || {})
    );
    console.log('📞 [enviarLembrete] Telefone:', paciente?.telefone);
    console.log(
      '📞 [enviarLembrete] Telefone Residencial:',
      paciente?.telefoneResidencial
    );
    // Usa telefone ou telefoneResidencial
    const telefoneParaUsar =
    paciente?.telefone || paciente?.celular || paciente?.telefoneResidencial;
    console.log('📞 [enviarLembrete] Telefone para usar:', telefoneParaUsar);
    if (!paciente || !telefoneParaUsar) {
      console.error('❌ [enviarLembrete] Paciente sem telefone');
      dialogError(
        'Telefone Não Cadastrado',
        'O paciente não possui telefone cadastrado. Por favor, cadastre um telefone primeiro.'
      );
      return;
    }
    // Atualiza o objeto paciente com o telefone correto
    paciente.telefone = telefoneParaUsar;
    if (!validarTelefone(telefoneParaUsar)) {
      console.error('❌ [enviarLembrete] Telefone inválido:', telefoneParaUsar);
      dialogError(
        'Telefone Inválido',
        'O telefone cadastrado não é válido. Verifique o cadastro do paciente.'
      );
      return;
    }
    console.log('✅ [enviarLembrete] Setando pendingWhatsAppSend:', {
      consultaId,
      tipo: 'lembrete',
      paciente: paciente.nome
    });
    const canalLembrete = canalEnvioRef.current;
    setPendingWhatsAppSend({
      consultaId,
      tipo: 'lembrete',
      paciente, // Salva o paciente buscado via API
      canal: canalLembrete,
      // SMS e Meta usam o link público (no SMS, no texto; na Meta, no botão de URL)
      linkConfirmacao:
      canalLembrete !== 'whatsapp' ?
      (await gerarLinkConfirmacao(consultaId)) || undefined :
      undefined
    });
    console.log('✅ [enviarLembrete] Abrindo modal...');
    setIsWhatsAppConfirmOpen(true);
  };
  /**
   * Solicita confirmação de consulta
   */
  const solicitarConfirmacao = async (consultaId: string) => {
    console.log('📞 [solicitarConfirmacao] Iniciando...', consultaId);
    if (!(await validarWhatsApp('confirmacao'))) return;
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    console.log('📋 [solicitarConfirmacao] Consulta encontrada:', consulta);
    if (!consulta) return;
    // Busca paciente na lista local primeiro
    let paciente = pacientes.find((p) => p.id === consulta.pacienteId);
    console.log(
      '👤 [solicitarConfirmacao] Paciente na lista local:',
      paciente ? 'ENCONTRADO' : 'NÃO ENCONTRADO'
    );
    // Se não encontrou ou não tem telefone, busca via API PELO ID (nunca por nome!)
    if (!paciente || !(paciente.telefone || paciente.celular)) {
      console.log(
        '🌐 [solicitarConfirmacao] Buscando via API pelo ID...',
        consulta.pacienteId
      );
      try {
        // ⭐⭐⭐ FIX CRÍTICO: Busca pelo ID do paciente, NÃO pelo nome! ⭐⭐⭐
        // Buscar por nome pode retornar homônimos (pacientes com mesmo nome mas IDs diferentes)
        const url = `${API_BASE_URL}/api/pacientes/${consulta.pacienteId}?clinicaId=${clinicaIdEfetivo}`;
        console.log('🔗 [solicitarConfirmacao] URL (por ID):', url);
        const response = await fetch(url);
        console.log(
          '📡 [solicitarConfirmacao] Response status:',
          response.status
        );
        if (response.ok) {
          const result = await response.json();
          console.log(
            '✅ [solicitarConfirmacao] Paciente encontrado por ID:',
            result
          );
          // A API pode retornar o paciente diretamente ou dentro de .data
          paciente = result.data || result;
          console.log(
            '👤 [solicitarConfirmacao] Paciente (ID match):',
            paciente?.id,
            paciente?.nome,
            paciente?.telefone
          );
        }
        // Fallback: se a rota por ID não funcionar, tenta busca mas filtra por ID
        if (!paciente || !(paciente.telefone || paciente.celular)) {
          console.log(
            '🔄 [solicitarConfirmacao] Fallback: buscando por nome mas filtrando por ID...'
          );
          const params = new URLSearchParams({
            clinicaId: clinicaIdEfetivo,
            search: consulta.pacienteNome,
            limit: '50',
            page: '1'
          });
          const fallbackUrl = `${API_BASE_URL}/api/pacientes?${params}`;
          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            const fallbackResult = await fallbackResponse.json();
            // ⭐ SEMPRE filtra pelo ID, nunca só pelo nome!
            paciente = fallbackResult.data?.find(
              (p: any) => String(p.id) === String(consulta.pacienteId)
            );
            console.log(
              '👤 [solicitarConfirmacao] Paciente encontrado por ID no fallback:',
              paciente?.id,
              paciente?.nome,
              paciente?.telefone
            );
          }
        }
      } catch (err) {
        console.error('❌ [solicitarConfirmacao] Erro ao buscar paciente:', err);
      }
    }
    console.log('👤 [solicitarConfirmacao] Paciente FINAL:', paciente);
    console.log(
      '📋 [solicitarConfirmacao] Campos do paciente:',
      Object.keys(paciente || {})
    );
    console.log('📞 [solicitarConfirmacao] Telefone:', paciente?.telefone);
    console.log(
      '📞 [solicitarConfirmacao] Telefone Residencial:',
      paciente?.telefoneResidencial
    );
    // Usa telefone, celular ou telefoneResidencial
    const telefoneParaUsar =
    paciente?.telefone || paciente?.celular || paciente?.telefoneResidencial;
    console.log(
      '📞 [solicitarConfirmacao] Telefone para usar:',
      telefoneParaUsar
    );
    if (!paciente || !telefoneParaUsar) {
      console.error('❌ [solicitarConfirmacao] Paciente sem telefone');
      dialogError(
        'Telefone Não Cadastrado',
        'O paciente não possui telefone cadastrado. Por favor, cadastre um telefone primeiro.'
      );
      return;
    }
    // Atualiza o objeto paciente com o telefone correto
    paciente.telefone = telefoneParaUsar;
    if (!validarTelefone(telefoneParaUsar)) {
      console.error(
        '❌ [solicitarConfirmacao] Telefone inválido:',
        telefoneParaUsar
      );
      dialogError('Telefone Inválido', 'O telefone cadastrado não é válido.');
      return;
    }
    console.log('✅ [solicitarConfirmacao] Setando pendingWhatsAppSend:', {
      consultaId,
      tipo: 'confirmacao',
      paciente: paciente.nome
    });
    const canalConfirmacao = canalEnvioRef.current;
    setPendingWhatsAppSend({
      consultaId,
      tipo: 'confirmacao',
      paciente, // Salva o paciente buscado via API
      canal: canalConfirmacao,
      // SMS e Meta usam o link público (no SMS, no texto; na Meta, no botão de URL)
      linkConfirmacao:
      canalConfirmacao !== 'whatsapp' ?
      (await gerarLinkConfirmacao(consultaId)) || undefined :
      undefined
    });
    console.log('✅ [solicitarConfirmacao] Abrindo modal...');
    setIsWhatsAppConfirmOpen(true);
  };
  /**
   * ⭐ Gera (ou reaproveita) o link público de confirmação da consulta.
   * O SMS não tem menu interativo, então o paciente responde por esta página.
   */
  const gerarLinkConfirmacao = async (
  consultaId: string)
  : Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/confirmacao/gerar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId: clinicaIdEfetivo,
          consultaId
        })
      });
      if (!response.ok) return null;
      const dados = await response.json();
      if (!dados?.token) return null;
      const base = ENV_APP_BASE_URL || window.location.origin;
      return `${base}/confirmar/${dados.token}`;
    } catch (err) {
      console.error('❌ [gerarLinkConfirmacao] Erro:', err);
      return null;
    }
  };
  /**
   * ⭐ Texto do SMS: curto, sem acentos/emoji (evita dividir a mensagem em
   * várias partes) e com o link de confirmação quando houver.
   */
  const gerarMensagemSms = (
  tipo: 'lembrete' | 'confirmacao' | 'cancelamento',
  pacienteNome: string,
  consulta: Consulta,
  link?: string | null)
  : string => {
    const primeiroNome = (pacienteNome || 'paciente').split(' ')[0];
    // A data pode vir como "AAAA-MM-DD" ou já com hora ("AAAA-MM-DDTHH:mm")
    const dataIso = String(consulta.data || '').slice(0, 10);
    const [ano, mes, dia] = dataIso.split('-');
    const dataBr = dia && mes && ano ? `${dia}/${mes}/${ano}` : dataIso;
    const hora = String(consulta.horario || '').slice(0, 5);
    // Identifica a clínica: um SMS sem remetente conhecido parece golpe e o
    // paciente não clica no link.
    let nomeClinica = '';
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        nomeClinica = JSON.parse(sessao)?.clinicaAtual?.nome || '';
      }
    } catch {
      nomeClinica = '';
    }
    const semAcento = (texto: string) =>
    texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const assinatura = nomeClinica ? ` ${semAcento(nomeClinica)}` : '';

    if (tipo === 'cancelamento') {
      return `${semAcento(nomeClinica) || 'Clinica'}: Ola ${primeiroNome}, sua consulta de ${dataBr} as ${hora} foi CANCELADA. Para reagendar, entre em contato.`;
    }
    if (tipo === 'confirmacao') {
      // Sem o link o pedido de confirmação não tem como ser respondido por SMS
      return link ?
      `${assinatura.trim() || 'Clinica'}: Ola ${primeiroNome}, sua consulta e ${dataBr} as ${hora}. Confirme ou cancele aqui: ${link}` :
      `${assinatura.trim() || 'Clinica'}: Ola ${primeiroNome}, sua consulta e ${dataBr} as ${hora}. Para confirmar ou cancelar, entre em contato com a clinica.`;
    }
    return link ?
    `${assinatura.trim() || 'Clinica'}: Ola ${primeiroNome}, lembrete da sua consulta em ${dataBr} as ${hora}. Confirme ou cancele aqui: ${link}` :
    `${assinatura.trim() || 'Clinica'}: Ola ${primeiroNome}, lembrete da sua consulta em ${dataBr} as ${hora}.`;
  };
  /**
   * ⭐ Valores REAIS de cada variável do template da Meta, resolvidos por NOME.
   * Resolver por nome (e não por posição fixa) permite alterar a lista de
   * variáveis de um template em TEMPLATES_ESPERADOS sem quebrar o envio.
   */
  const valoresVariaveisMeta = (
  paciente: Paciente | undefined,
  consulta: Consulta)
  : Record<string, string> => {
    const primeiroNome = (
    paciente?.nome ||
    (consulta as any).pacienteNome ||
    'paciente').
    split(' ')[0];
    const dataIso = String(consulta.data || '').slice(0, 10);
    const [ano, mes, dia] = dataIso.split('-');
    const dataBr = dia && mes && ano ? `${dia}/${mes}/${ano}` : dataIso;
    const hora = String(consulta.horario || '').slice(0, 5);
    const profissional =
    (consulta as any).profissionalNome || 'nossa equipe';
    // ⭐ {{local}}: quando o texto não está configurado em WhatsApp Oficial, o
    // valor vem do CADASTRO DA CLÍNICA — nome + endereço completo. Antes só
    // eram usados "endereco" e "cidade": faltando um deles a mensagem saía com
    // "nossa clinica", que não informa nada ao paciente.
    let nomeClinica = '';
    let enderecoClinica = '';
    try {
      const sessao = localStorage.getItem('sessao');
      const clinica = sessao ? JSON.parse(sessao)?.clinicaAtual : null;
      if (clinica) {
        nomeClinica = clinica.nome || clinica.nomeFantasia || clinica.razaoSocial || '';
        const logradouro = [clinica.endereco, clinica.numero].
        filter(Boolean).
        join(', ');
        const cidadeUf = [clinica.cidade, clinica.uf || clinica.estado].
        filter(Boolean).
        join('/');
        enderecoClinica = [logradouro, clinica.bairro, cidadeUf].
        filter(Boolean).
        join(' - ');
      }
    } catch {
      nomeClinica = '';
    }
    const localPadrao =
    [nomeClinica, enderecoClinica].filter(Boolean).join(' - ') ||
    nomeClinica ||
    'nossa clinica';
    // ⭐ local / instruções / informações importantes são textos da CLÍNICA,
    // configurados em WhatsApp Oficial — não ficam mais fixos no código.
    const textos = resolverTextosMeta(metaInfo.textos, localPadrao);
    // {{2}} do pedido de confirmação: "Sua consulta ___ está agendada".
    // Vem do tipo já gravado na consulta; sem ele, a frase ainda faz sentido
    // sem adjetivo (a Meta não aceita parâmetro vazio, então usa-se um traço).
    const tipoConsulta =
    String((consulta as any).tipo || '') === 'odontologica' ?
    'odontológica' :
    String((consulta as any).tipo || '') === 'medica' ?
    'médica' :
    '-';
    return {
      'nome do paciente': primeiroNome,
      'tipo de consulta': tipoConsulta,
      data: dataBr,
      horário: hora,
      profissional,
      local: textos.local,
      'instruções pré-consulta': textos.instrucoesPreConsulta,
      'informações importantes': textos.informacoesImportantes
    };
  };
  /** Parâmetros na ordem exata das variáveis declaradas para o template. */
  const montarParamsMeta = (
  tipo: 'lembrete' | 'confirmacao' | 'cancelamento',
  valores: Record<string, string>)
  : string[] => {
    const esperado = TEMPLATES_ESPERADOS.find((t) => t.chave === tipo);
    return (esperado?.variaveis || []).map((nome) => valores[nome] || '-');
  };
  /**
   * ⭐ Prévia da mensagem do canal META: vem do MODELO do template (com as
   * variáveis já substituídas), não do template do WAHA. Cada canal mostra o
   * texto que ele realmente entrega.
   */
  const gerarMensagemMeta = (
  tipo: 'lembrete' | 'confirmacao' | 'cancelamento',
  paciente: Paciente | undefined,
  consulta: Consulta)
  : string => {
    const esperado = TEMPLATES_ESPERADOS.find((t) => t.chave === tipo);
    if (!esperado) return '';
    const params = montarParamsMeta(tipo, valoresVariaveisMeta(paciente, consulta));
    return esperado.exemplo.replace(
      /\{\{(\d+)\}\}/g,
      (_todo, indice) => params[Number(indice) - 1] ?? '-'
    );
  };
  /**
   * ⭐ Troca o canal de envio já com o modal aberto. O SMS fica disponível
   * SEMPRE que estiver configurado — não apenas quando o WhatsApp falha.
   */
  const trocarCanalEnvio = async (canal: 'whatsapp' | 'sms' | 'meta') => {
    if (!pendingWhatsAppSend || pendingWhatsAppSend.canal === canal) return;
    canalEnvioRef.current = canal;
    let link = pendingWhatsAppSend.linkConfirmacao;
    if (canal !== 'whatsapp' && !link) {
      link = (await gerarLinkConfirmacao(pendingWhatsAppSend.consultaId)) || undefined;
    }
    setPendingWhatsAppSend({
      ...pendingWhatsAppSend,
      canal,
      linkConfirmacao: link
    });
  };
  /**
   * Confirma e envia a mensagem após aprovação no modal
   */
  const handleConfirmWhatsAppSend = async (
  telefoneOverride?: string)
  : Promise<{
    success: boolean;
    message?: string;
  }> => {
    if (!pendingWhatsAppSend) {
      return {
        success: false,
        message: 'Nenhuma mensagem pendente'
      };
    }
    const { consultaId, tipo, paciente } = pendingWhatsAppSend;
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    if (!consulta) {
      return {
        success: false,
        message: 'Consulta não encontrada'
      };
    }
    // ⭐ FIX: Usa telefoneOverride do modal (número editado pelo usuário) quando disponível
    const telefoneBase =
    telefoneOverride || paciente?.telefone || paciente?.celular || '';
    const telefoneFormatado = formatarTelefoneWhatsApp(telefoneBase).numero;
    // ⭐ Envio pelo WhatsApp OFICIAL da Meta (template aprovado). Canal opcional
    // que convive com o WAHA: entrega mesmo sem sessão conectada.
    if (pendingWhatsAppSend.canal === 'meta') {
      const template = metaInfo.templates?.[tipo];
      if (!template) {
        return {
          success: false,
          message: `O template do aviso "${tipo}" ainda não foi vinculado em Configurações → WhatsApp oficial (Meta).`
        };
      }
      const primeiroNome = (
      paciente?.nome ||
      consulta.pacienteNome ||
      'paciente').
      split(' ')[0];
      const dataIso = String(consulta.data || '').slice(0, 10);
      const [ano, mes, dia] = dataIso.split('-');
      const dataBr = dia && mes && ano ? `${dia}/${mes}/${ano}` : dataIso;
      const hora = String(consulta.horario || '').slice(0, 5);
      const profissional =
      (consulta as any).profissionalNome || 'nossa equipe';
      // A quantidade e a ordem vêm da declaração do template em
      // TEMPLATES_ESPERADOS — alterar a lista de variáveis lá basta.
      const params = montarParamsMeta(
        tipo,
        valoresVariaveisMeta(paciente, consulta)
      );
      const envio = await enviarWhatsappMetaApi({
        clinicaId: clinicaIdEfetivo,
        telefone: telefoneBase,
        template: {
          name: template.name,
          language: template.language,
          params,
          // Só manda o parâmetro do botão se o template aprovado tiver um
          // botão de URL dinâmica — caso contrário a Meta recusa (132012).
          urlParam:
          template.temBotaoUrl === false ?
          undefined :
          pendingWhatsAppSend.linkConfirmacao || undefined
        },
        pacienteId: paciente?.id,
        pacienteNome: paciente?.nome,
        consultaId
      });
      if (!envio.success) {
        return {
          success: false,
          message: envio.error || 'Falha ao enviar pelo WhatsApp oficial.'
        };
      }
      if (tipo === 'lembrete') {
        onUpdateConsulta(consultaId, {
          lembreteEnviado: true
        });
      } else if (tipo === 'confirmacao') {
        onUpdateConsulta(consultaId, {
          status: 'aguardando_confirmacao',
          lembreteEnviado: true
        });
      } else if (tipo === 'cancelamento') {
        onUpdateConsulta(consultaId, {
          status: 'cancelada'
        });
      }
      return {
        success: true,
        message: `Mensagem enviada pelo WhatsApp oficial para ${paciente?.nome || 'Paciente'} (${formatTelefone(telefoneBase)})`
      };
    }
    // ⭐ Envio por SMS (canal alternativo escolhido quando o WhatsApp está fora)
    if (pendingWhatsAppSend.canal === 'sms') {
      const textoSms = gerarMensagemSms(
        tipo,
        paciente?.nome || consulta.pacienteNome,
        consulta,
        pendingWhatsAppSend.linkConfirmacao
      );
      // ⭐ Envio centralizado: tenta o POST e, se a requisição for barrada pelo
      // proxy antes de chegar ao servidor, repete pela rota alternativa (GET).
      const envio = await enviarSmsApi({
        clinicaId: clinicaIdEfetivo,
        telefone: telefoneBase,
        mensagem: textoSms,
        pacienteId: paciente?.id,
        pacienteNome: paciente?.nome,
        consultaId
      });
      if (!envio.success) {
        return {
          success: false,
          message: envio.error || 'Falha ao enviar o SMS.'
        };
      }
      if (tipo === 'lembrete') {
        onUpdateConsulta(consultaId, {
          lembreteEnviado: true
        });
      } else if (tipo === 'confirmacao') {
        onUpdateConsulta(consultaId, {
          status: 'aguardando_confirmacao',
          lembreteEnviado: true
        });
      } else if (tipo === 'cancelamento') {
        onUpdateConsulta(consultaId, {
          status: 'cancelada'
        });
      }
      return {
        success: true,
        message: `SMS enviado para ${paciente?.nome || 'Paciente'} (${formatTelefone(telefoneBase)})`
      };
    }
    console.log(
      '📞 [handleConfirmWhatsAppSend] Telefone override:',
      telefoneOverride || '(nenhum, usando cadastro)'
    );
    console.log(
      '📞 [handleConfirmWhatsAppSend] Telefone final:',
      telefoneFormatado
    );
    // ⭐ CORREÇÃO: Usa o template customizado salvo nas configurações
    const templateCustomizado = whatsappConfig?.mensagemTemplate || '';
    let mensagem: string;
    if (tipo === 'lembrete') {
      mensagem = gerarMensagemLembrete(
        paciente,
        consulta,
        'Clínica Médica',
        templateCustomizado
      );
    } else if (tipo === 'confirmacao') {
      mensagem = gerarMensagemConfirmacao(
        paciente,
        consulta,
        'Clínica Médica',
        templateCustomizado
      );
    } else {
      mensagem = gerarMensagemCancelamento(paciente, consulta, 'Clínica Médica');
    }
    try {
      // ⭐⭐⭐ FIX: Busca config FRESCA da API (igual PatientPhoto) ⭐⭐⭐
      // Evita usar valores desatualizados do hook useWhatsApp
      let freshServerUrl = whatsappConfig?.serverUrl || '';
      let freshSessionName = whatsappConfig?.sessionName || '';
      try {
        const configResponse = await fetch(
          `${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaIdEfetivo}`
        );
        if (configResponse.ok) {
          const freshConfig = await configResponse.json();
          if (freshConfig?.serverUrl) freshServerUrl = freshConfig.serverUrl;
          if (freshConfig?.sessionName)
          freshSessionName = freshConfig.sessionName;
          console.log('📤 [handleConfirmWhatsAppSend] Config fresca da API:', {
            serverUrl: freshServerUrl,
            sessionName: freshSessionName
          });
        }
      } catch (configErr) {
        console.warn(
          '⚠️ [handleConfirmWhatsAppSend] Erro ao buscar config fresca, usando config do estado:',
          configErr
        );
      }
      if (!freshServerUrl || !freshSessionName) {
        return {
          success: false,
          message: 'WhatsApp não configurado. Verifique as configurações.'
        };
      }
      console.log('📤 [handleConfirmWhatsAppSend] Enviando mensagem DIRETO...');
      console.log('   - serverUrl:', freshServerUrl);
      console.log('   - sessionName:', freshSessionName);
      console.log('   - telefone:', telefoneFormatado);
      console.log('   - clinicaId:', clinicaIdEfetivo);
      console.log('   - paciente:', paciente?.nome);
      console.log('   - tipo:', tipo);
      // ⭐⭐⭐ FIX: Envia DIRETO para o servidor (igual PatientPhoto) ⭐⭐⭐
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/send-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl: freshServerUrl,
            sessionName: freshSessionName,
            number: telefoneFormatado,
            message: mensagem,
            clinicaId: clinicaIdEfetivo,
            pacienteId: paciente?.id,
            pacienteNome: paciente?.nome,
            consultaId: consultaId
          })
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          '❌ [handleConfirmWhatsAppSend] Erro HTTP:',
          response.status,
          errorText
        );
        return {
          success: false,
          message: `Erro ao enviar: ${errorText || response.statusText}`
        };
      }
      const result = await response.json();
      console.log('📤 [handleConfirmWhatsAppSend] Resultado:', result);
      if (result?.success) {
        if (tipo === 'lembrete') {
          onUpdateConsulta(consultaId, {
            lembreteEnviado: true
          });
        } else if (tipo === 'confirmacao') {
          // ⭐⭐⭐ CORREÇÃO v2.2: Também marca lembreteEnviado = true ao enviar confirmação
          // O webhook busca por lembreteEnviado = 1 para encontrar consultas aguardando resposta
          console.log(
            '📤 [handleConfirmWhatsAppSend] Alterando status para aguardando_confirmacao + lembreteEnviado'
          );
          onUpdateConsulta(consultaId, {
            status: 'aguardando_confirmacao',
            lembreteEnviado: true
          });
        } else if (tipo === 'cancelamento') {
          onUpdateConsulta(consultaId, {
            status: 'cancelada'
          });
        }
        // ATIVA AUTOMATICAMENTE após enviar mensagem com sucesso
        const currentConfig = localStorage.getItem('whatsapp_config');
        if (currentConfig) {
          const config = JSON.parse(currentConfig);
          if (!config.ativo) {
            config.ativo = true;
            localStorage.setItem('whatsapp_config', JSON.stringify(config));
            window.dispatchEvent(new Event('whatsapp-config-updated'));
            console.log(
              '✅ WhatsApp ativado automaticamente após envio bem-sucedido!'
            );
          }
        }
        return {
          success: true,
          message: `Mensagem enviada para ${paciente?.nome || 'Paciente'} (${formatTelefone(paciente?.telefone || '')})`
        };
      } else {
        return {
          success: false,
          message:
          result?.error || 'Falha ao enviar mensagem. Verifique a conexão.'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Erro: ${err.message || 'Falha na comunicação com o servidor'}`
      };
    }
  };
  const formatTelefone = (tel: string) => {
    const clean = tel.replace(/\D/g, '');
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    return tel;
  };
  /**
   * Notifica cancelamento
   */
  const notificarCancelamento = async (consultaId: string) => {
    if (!(await validarWhatsApp('cancelamento'))) return;
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    if (!consulta) return;
    const paciente = pacientes.find((p) => p.id === consulta.pacienteId);
    const telCancelamento = paciente?.telefone || paciente?.celular;
    if (!paciente || !telCancelamento) {
      onUpdateConsulta(consultaId, {
        status: 'cancelada'
      });
      success('Consulta Cancelada', 'Paciente sem telefone cadastrado');
      return;
    }
    paciente.telefone = telCancelamento;
    if (!validarTelefone(paciente.telefone)) {
      onUpdateConsulta(consultaId, {
        status: 'cancelada'
      });
      success('Consulta Cancelada', 'Telefone inválido');
      return;
    }
    const telefoneFormatado = formatarTelefoneWhatsApp(paciente.telefone).numero;
    const mensagem = gerarMensagemCancelamento(
      paciente,
      consulta,
      'Clínica Médica'
    );
    // CORREÇÃO: Usa clinicaIdEfetivo para garantir que a mensagem seja salva
    console.log('📤 [notificarCancelamento] Enviando mensagem...');
    console.log('   - clinicaIdEfetivo:', clinicaIdEfetivo);
    console.log('   - pacienteId:', paciente.id);
    console.log('   - pacienteNome:', paciente.nome);
    // Envia mensagem com parâmetros para salvar no histórico automaticamente
    const result = await sendMessage(telefoneFormatado, mensagem, {
      clinicaId: clinicaIdEfetivo,
      pacienteId: paciente.id,
      pacienteNome: paciente.nome,
      consultaId: consultaId
    });
    if (result?.success) {
      onUpdateConsulta(consultaId, {
        status: 'cancelada'
      });
      success(
        'Cancelamento Notificado',
        `Paciente ${paciente.nome} foi notificado`
      );
    } else {
      onUpdateConsulta(consultaId, {
        status: 'cancelada'
      });
      toastError(
        'Consulta Cancelada',
        'Mas não foi possível notificar o paciente'
      );
    }
  };
  const confirmarConsulta = async (consultaId: string) => {
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    const shouldConfirm = await confirm(
      'Confirmar Consulta',
      `Deseja confirmar a consulta de ${consulta?.pacienteNome || 'paciente'} (${consulta?.horario || ''})?`,
      'Sim, Confirmar',
      'Cancelar'
    );
    if (!shouldConfirm) return;
    onUpdateConsulta(consultaId, {
      status: 'confirmada'
    });
    success('Consulta Confirmada', 'Status atualizado com sucesso');
  };
  const handleSolicitarCancelamento = (consultaId: string) => {
    const agora = new Date();
    const dataLocal = new Date(
      agora.getTime() - agora.getTimezoneOffset() * 60000
    );
    setCancelamentoModal({
      isOpen: true,
      consultaId,
      motivo: '',
      dataCancelamento: dataLocal.toISOString().split('T')[0],
      horaCancelamento: dataLocal.toISOString().substring(11, 16)
    });
  };
  const cancelarConsulta = async (consultaId: string) => {
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    if (!consulta) return;
    // Se for placeholder (horário disponível), DELETA de verdade via API
    if (
    consulta.pacienteId === 'disponivel' ||
    consulta.pacienteId === 'livre')
    {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/consultas/${consultaId}?clinicaId=${clinicaIdEfetivo}`,
          {
            method: 'DELETE'
          }
        );
        if (!response.ok) {
          throw new Error('Erro ao excluir horário');
        }
        success('Horário Removido', 'O horário foi removido da agenda');
        window.dispatchEvent(new Event('consultas-updated'));
      } catch (err: any) {
        toastError('Erro', err.message || 'Não foi possível remover o horário');
      }
      return;
    }
    // ⭐ CORREÇÃO: Só pergunta confirmação se status for "agendada"
    // ⭐ SEMPRE pede confirmação antes de excluir (qualquer status)
    const shouldDelete = await confirm(
      'Excluir Consulta',
      `Tem certeza que deseja excluir a consulta de ${consulta.pacienteNome} (${consulta.horario})?`,
      'Sim, Excluir',
      'Cancelar'
    );
    if (!shouldDelete) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/consultas/${consultaId}?clinicaId=${clinicaIdEfetivo}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) {
        throw new Error('Erro ao excluir consulta');
      }
      success(
        'Consulta Excluída',
        `Consulta de ${consulta.pacienteNome} foi removida da agenda`
      );
      window.dispatchEvent(new Event('consultas-updated'));
    } catch (err: any) {
      toastError('Erro', err.message || 'Não foi possível excluir a consulta');
    }
  };
  /**
   * ⭐ NOVO: Confirma cancelamento com motivo
   */
  const confirmarCancelamentoComMotivo = async () => {
    const { consultaId, motivo, dataCancelamento, horaCancelamento } =
    cancelamentoModal;
    const motivoTrimmed = motivo.trim();
    if (!motivoTrimmed || !dataCancelamento || !horaCancelamento) {
      toastError(
        'Campos Obrigatórios',
        'Informe a data, hora e motivo do cancelamento para prosseguir.'
      );
      return;
    }
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    let taxaAviso = '';
    if (consulta) {
      const dataHoraCancelamentoObj = new Date(
        `${dataCancelamento}T${horaCancelamento}:00`
      );
      const dataHoraConsultaObj = new Date(
        `${consulta.data}T${consulta.horario}:00`
      );
      const diffHours =
      (dataHoraConsultaObj.getTime() - dataHoraCancelamentoObj.getTime()) / (
      1000 * 60 * 60);
      if (diffHours < politicaCancelamento.prazoHoras) {
        taxaAviso =
        politicaCancelamento.valorTaxa > 0 ?
        ` (FORA DO PRAZO de ${politicaCancelamento.prazoHoras}h - Taxa de cancelamento: ${formatBRL(politicaCancelamento.valorTaxa)})` :
        ` (FORA DO PRAZO de ${politicaCancelamento.prazoHoras}h - Taxa de cancelamento aplicável)`;
      } else {
        taxaAviso = ` (Dentro do prazo de ${politicaCancelamento.prazoHoras}h - sem taxa)`;
      }
    }
    // Fecha o modal
    setCancelamentoModal({
      isOpen: false,
      consultaId: '',
      motivo: '',
      dataCancelamento: '',
      horaCancelamento: ''
    });
    // Formata a data/hora informada pelo usuário
    const [ano, mes, dia] = dataCancelamento.split('-');
    const dataHora = `${dia}/${mes}/${ano} às ${horaCancelamento}`;
    // Monta observação com timestamp (mesmo padrão das confirmações)
    const obsExistente = consulta?.observacoes || '';
    const novaObs = obsExistente ?
    `${obsExistente}\n📱 WhatsApp: CANCELADO em ${dataHora} - Motivo: ${motivoTrimmed}${taxaAviso}` :
    `📱 WhatsApp: CANCELADO em ${dataHora} - Motivo: ${motivoTrimmed}${taxaAviso}`;
    // Pergunta se quer notificar via WhatsApp
    const shouldNotify = await confirm(
      'Notificar Paciente?',
      'Deseja notificar o paciente sobre o cancelamento via WhatsApp?',
      'Sim, Notificar',
      'Não, Apenas Cancelar'
    );
    // Texto da taxa/prazo sem os parênteses externos, para exibir limpo no card.
    const taxaCancelamento = taxaAviso.
    trim().
    replace(/^\(|\)$/g, '').
    trim();
    // Responsável pelo cancelamento manual (feito na agenda) = usuário logado.
    const tipo = usuarioLogado?.tipo;
    const canceladoPor =
    tipo === 'medico' || tipo === 'dentista' ?
    'Médico' :
    tipo === 'atendente' ?
    'Atendente' :
    usuarioLogado ?
    'Atendente' :
    'Sistema';
    const canalCancelamento = 'Agenda';
    if (shouldNotify) {
      // Atualiza com motivo, data/hora, taxa e observações ANTES de notificar
      onUpdateConsulta(consultaId, {
        motivoCancelamento: motivoTrimmed,
        dataCancelamento,
        horaCancelamento,
        taxaCancelamento,
        canceladoPor,
        canalCancelamento,
        observacoes: novaObs
      });
      await notificarCancelamento(consultaId);
    } else {
      onUpdateConsulta(consultaId, {
        status: 'cancelada',
        motivoCancelamento: motivoTrimmed,
        dataCancelamento,
        horaCancelamento,
        taxaCancelamento,
        canceladoPor,
        canalCancelamento,
        observacoes: novaObs
      });
      success('Consulta Cancelada', `Motivo: ${motivoTrimmed}`);
    }
  };
  /**
   * Restaura consulta cancelada para status "agendada"
   */
  const restaurarConsulta = async (consultaId: string) => {
    const shouldRestore = await confirm(
      'Restaurar Consulta',
      'Deseja restaurar esta consulta para o status "Agendada"?',
      'Sim, Restaurar',
      'Cancelar'
    );
    if (shouldRestore) {
      onUpdateConsulta(consultaId, {
        status: 'agendada',
        cor: '#3B82F6' // Azul padrão
      });
      success('Consulta Restaurada', 'Status alterado para "Agendada"');
    }
  };
  const marcarRealizada = async (consultaId: string) => {
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    const shouldConfirm = await confirm(
      'Finalizar Consulta',
      `Deseja marcar como realizada a consulta de ${consulta?.pacienteNome || 'paciente'} (${consulta?.horario || ''})?`,
      'Sim, Finalizar',
      'Cancelar'
    );
    if (!shouldConfirm) return;
    onUpdateConsulta(consultaId, {
      status: 'realizada'
    });
    success('Consulta Finalizada', 'Marcada como realizada');
  };
  // ⭐ NOVO: Marcar chegada do paciente (toggle: marca/cancela)
  // IMPORTANTE: Usa `null` (não `undefined`) para limpar campos — JSON.stringify remove undefined!
  // ⭐ FIX: Adicionada confirmação para evitar cliques acidentais que bagunçam a sequência de chegada
  const handleMarcarChegada = async (consultaId: string) => {
    const consulta = consultasDoDia.find((c) => c.id === consultaId);
    if (!consulta) return;
    if (consulta.horaChegada) {
      // Cancelar chegada — pede confirmação
      const shouldCancel = await confirm(
        'Cancelar Chegada',
        `Deseja cancelar a chegada de ${consulta.pacienteNome}? Isso vai alterar a sequência de atendimento.`,
        'Sim, Cancelar Chegada',
        'Não'
      );
      if (!shouldCancel) return;
      onUpdateConsulta(consultaId, {
        horaChegada: null as any,
        statusAtendimento: null as any,
        status: 'agendada'
      });
      success(
        'Chegada Cancelada',
        `${consulta.pacienteNome} voltou para Agendada`
      );
    } else {
      // Marcar chegada — pede confirmação com nome e horário
      const shouldMark = await confirm(
        'Marcar Chegada',
        `Confirma a chegada de ${consulta.pacienteNome} (${consulta.horario})?`,
        'Sim, Chegou',
        'Cancelar'
      );
      if (!shouldMark) return;
      const agora = new Date().toISOString();
      onUpdateConsulta(consultaId, {
        horaChegada: agora,
        statusAtendimento: 'aguardando',
        status: 'confirmada'
      });
      success(
        'Paciente Chegou',
        `${consulta.pacienteNome} — chegada às ${new Date().toLocaleTimeString(
          'pt-BR',
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        )}`
      );
    }
  };
  const handleIniciarAtendimento = async (consulta: Consulta) => {
    // ⭐ FIX vazamento de permissão: barra atendentes sem acesso a 'prontuarios'.
    if (!temPermissao('prontuarios')) {
      toastError(
        'Acesso negado',
        'Você não tem permissão para acessar o prontuário. Solicite ao administrador.'
      );
      return;
    }
    // Busca paciente na lista local primeiro
    let paciente = pacientes.find((p) => p.id === consulta.pacienteId);
    // Se não encontrou localmente, busca via API PELO ID
    // ⭐⭐⭐ FIX CRÍTICO: Busca pelo ID, não pelo nome (evita homônimos) ⭐⭐⭐
    if (!paciente && clinicaIdEfetivo) {
      console.log(
        '🌐 [AgendaPage] Buscando paciente via API pelo ID para atendimento:',
        consulta.pacienteId
      );
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes/${consulta.pacienteId}?clinicaId=${clinicaIdEfetivo}`
        );
        if (response.ok) {
          const result = await response.json();
          paciente = result.data || result;
          console.log(
            '👤 [AgendaPage] Paciente por ID:',
            paciente?.id,
            paciente?.nome
          );
        }
        // Fallback: busca por nome mas filtra por ID
        if (!paciente) {
          const params = new URLSearchParams({
            clinicaId: clinicaIdEfetivo,
            search: consulta.pacienteNome,
            limit: '50',
            page: '1'
          });
          const fallbackResponse = await fetch(
            `${API_BASE_URL}/api/pacientes?${params}`
          );
          if (fallbackResponse.ok) {
            const fallbackResult = await fallbackResponse.json();
            paciente = fallbackResult.data?.find(
              (p: any) => String(p.id) === String(consulta.pacienteId)
            );
          }
        }
      } catch (err) {
        console.error('❌ [AgendaPage] Erro ao buscar paciente:', err);
      }
    }
    if (!paciente) {
      toastError(
        'Paciente Não Encontrado',
        `${consulta.pacienteNome} não foi encontrado no cadastro.`
      );
      return;
    }
    // ⭐ NOVO: Abre o ProntuarioForm completo em vez do AtendimentoModal básico
    setConsultaEmAtendimento(consulta);
    setPacienteParaAtendimento(paciente);
    setSelectedPaciente(paciente);
    setIsProntuarioModalOpen(true);
  };
  // ⭐ NOVO: Handler para salvar prontuário do atendimento
  const handleSalvarProntuarioAtendimento = async (dados: any) => {
    console.log('💾 [AgendaPage] Salvando prontuário do atendimento:', dados);
    try {
      // Salva o prontuário/atendimento via API
      const response = await fetch(`${API_BASE_URL}/api/prontuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...dados,
          clinicaId: clinicaIdEfetivo
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const resultado = await response.json();
      console.log('✅ [AgendaPage] Prontuário salvo:', resultado);
      // Atualiza a consulta para status "realizada"
      if (consultaEmAtendimento) {
        onUpdateConsulta(consultaEmAtendimento.id, {
          status: 'realizada',
          observacoes: dados.observacoes || consultaEmAtendimento.observacoes
        });
      }
      success(
        'Atendimento Finalizado',
        resultado.prontuarioCriado ?
        'Prontuário criado e atendimento registrado com sucesso.' :
        'Atendimento adicionado ao prontuário do paciente.'
      );
      // Fecha o modal
      setIsProntuarioModalOpen(false);
      setConsultaEmAtendimento(undefined);
      setPacienteParaAtendimento(undefined);
      setSelectedPaciente(undefined);
    } catch (err: any) {
      console.error('❌ [AgendaPage] Erro ao salvar prontuário:', err);
      toastError(
        'Erro ao Salvar',
        err.message ||
        'Não foi possível salvar o prontuário. Verifique a conexão.'
      );
    }
  };
  const handleSalvarProntuario = async (prontuario: {
    consultaId: string;
    anamnese: string;
    exameFisico: string;
    diagnostico: string;
    conduta: string;
    observacoes: string;
    tempoAtendimento: number;
  }) => {
    try {
      // Atualiza consulta com dados do prontuário
      onUpdateConsulta(prontuario.consultaId, {
        status: 'realizada',
        observacoes: `${prontuario.observacoes}\n\n⏱️ Tempo de atendimento: ${Math.floor(prontuario.tempoAtendimento / 60)}min ${prontuario.tempoAtendimento % 60}s`
      });
      // TODO: Salvar prontuário completo no banco de dados
      // Por enquanto, apenas marca como realizada
      success(
        'Prontuário Salvo',
        'Atendimento finalizado e prontuário registrado com sucesso'
      );
      setIsAtendimentoModalOpen(false);
      setConsultaEmAtendimento(undefined);
    } catch (err: any) {
      toastError(
        'Erro ao Salvar',
        err.message || 'Não foi possível salvar o prontuário'
      );
    }
  };
  const getStatusBadge = (status: string, observacoes?: string) => {
    // Extrai data/hora da confirmação das observações
    let dataHoraConfirmacao = '';
    if (observacoes) {
      const match = observacoes.match(
        /📱 WhatsApp: (?:CONFIRMADO|CANCELADO|REMARCAÇÃO SOLICITADA) em (\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2})/
      );
      if (match) {
        dataHoraConfirmacao = match[1];
      }
    }
    const badges: Record<
      string,
      {
        label: string;
        color: string;
      }> =
    {
      agendada: {
        label: 'Agendada',
        color: 'bg-white text-gray-600 border border-gray-300'
      },
      aguardando_confirmacao: {
        label: '⏳ Aguardando',
        color: 'bg-purple-100 text-purple-800 animate-pulse'
      },
      confirmada: {
        label: dataHoraConfirmacao ?
        `Confirmada ${dataHoraConfirmacao}` :
        'Confirmada',
        color: 'bg-blue-100 text-blue-800'
      },
      realizada: {
        label: 'Realizada',
        color: 'bg-indigo-100 text-indigo-800'
      },
      cancelada: {
        label: dataHoraConfirmacao ?
        `Cancelada ${dataHoraConfirmacao}` :
        'Cancelada',
        color: 'bg-red-200 text-red-900'
      },
      aguardando_remarcacao: {
        label: dataHoraConfirmacao ?
        `Remarcar ${dataHoraConfirmacao}` :
        'Aguardando Remarcação',
        color: 'bg-orange-100 text-orange-800'
      },
      compareceu: {
        label: 'Compareceu',
        color: 'bg-green-100 text-green-800'
      },
      faltou: {
        label: 'Faltou',
        color: 'bg-red-100 text-red-800'
      }
    };
    const badge = badges[status] || badges.agendada;
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${badge.color}`}>
        
        {badge.label}
      </span>);

  };
  const handlePacienteClick = async (pacienteId: string) => {
    console.log(
      '🔍 [AgendaPage] handlePacienteClick chamado com ID:',
      pacienteId
    );
    // Não abre modal para horários disponíveis
    if (pacienteId === 'disponivel' || pacienteId === 'livre') {
      console.log('⚠️ [AgendaPage] Horário disponível, não abre modal');
      return;
    }
    // Busca a consulta para pegar o nome do paciente (para mensagens de erro)
    const consulta = consultasDoDia.find((c) => c.pacienteId === pacienteId);
    const nomePaciente = consulta?.pacienteNome || pacienteId;
    // Primeiro tenta encontrar na lista local
    let paciente = pacientes.find((p) => p.id === pacienteId);
    console.log(
      '📋 [AgendaPage] Busca local:',
      paciente ? 'ENCONTRADO' : 'NÃO ENCONTRADO'
    );
    // ⭐ FIX: Busca diretamente pelo ID via API (mais confiável que busca por nome)
    if (!paciente && clinicaIdEfetivo) {
      console.log(
        '🌐 [AgendaPage] Buscando paciente por ID via API:',
        pacienteId
      );
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaIdEfetivo}`
        );
        console.log('📡 [AgendaPage] Response status:', response.status);
        if (response.ok) {
          const result = await response.json();
          if (result && result.id) {
            paciente = result;
            console.log(
              '✅ [AgendaPage] Paciente encontrado por ID:',
              paciente.nome
            );
          }
        } else {
          console.warn(
            '⚠️ [AgendaPage] Paciente não encontrado por ID, tentando busca por nome...'
          );
          // Fallback: busca por nome mas SEMPRE filtra por ID (evita homônimos)
          if (consulta) {
            const params = new URLSearchParams({
              clinicaId: clinicaIdEfetivo,
              search: consulta.pacienteNome,
              limit: '50',
              page: '1'
            });
            const searchResponse = await fetch(
              `${API_BASE_URL}/api/pacientes?${params}`
            );
            if (searchResponse.ok) {
              const searchResult = await searchResponse.json();
              // ⭐⭐⭐ FIX CRÍTICO: Filtra por ID, não por nome ⭐⭐⭐
              paciente = searchResult.data?.find(
                (p: any) => String(p.id) === String(consulta.pacienteId)
              );
              if (paciente) {
                console.log(
                  '✅ [AgendaPage] Paciente encontrado via busca (filtrado por ID):',
                  paciente.id,
                  paciente.nome
                );
              }
            }
          }
        }
      } catch (err) {
        console.error('❌ [AgendaPage] Erro ao buscar paciente:', err);
      }
    }
    if (!paciente) {
      console.error('❌ [AgendaPage] Paciente não encontrado');
      toastError(
        'Paciente Não Encontrado',
        `${nomePaciente} não foi encontrado no cadastro. Pode ter sido removido.`
      );
      return;
    }
    console.log('✅ [AgendaPage] Abrindo modal com paciente:', paciente.nome);
    setPacienteEditStack([]);
    setSelectedPaciente(paciente);
    setIsPacienteModalOpen(true);
  };
  // ⭐ Navegação entre titular e dependente sem sair da ficha aberta pela agenda
  const handleAbrirRelacionado = async (pacienteId: string) => {
    if (!clinicaIdEfetivo) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaIdEfetivo}`
      );
      if (!res.ok) {
        toastError('Erro', 'Não foi possível carregar o cadastro.');
        return;
      }
      const pacienteRelacionado = await res.json();
      setPacienteEditStack((prev) => [...prev, selectedPaciente]);
      setSelectedPaciente(pacienteRelacionado);
    } catch (err) {
      console.error('❌ [AgendaPage] Erro ao abrir cadastro relacionado:', err);
      toastError('Erro', 'Erro ao carregar o cadastro.');
    }
  };
  const handleVoltarFichaAnterior = () => {
    setPacienteEditStack((prev) => {
      if (prev.length === 0) return prev;
      setSelectedPaciente(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  };
  const handleSavePaciente = async (pacienteData: any) => {
    console.log('💾 [handleSavePaciente] Iniciando salvamento...');
    console.log(
      '👤 [handleSavePaciente] Paciente selecionado:',
      selectedPaciente
    );
    console.log('📝 [handleSavePaciente] Dados para salvar:', pacienteData);
    try {
      if (!selectedPaciente) {
        console.error('❌ [handleSavePaciente] Nenhum paciente selecionado');
        toastError('Erro', 'Nenhum paciente selecionado');
        return;
      }
      // CORREÇÃO: Usa clinicaIdEfetivo
      if (!clinicaIdEfetivo) {
        console.error('❌ [handleSavePaciente] clinicaId não definido');
        toastError('Erro', 'Clínica não identificada');
        return;
      }
      // FAZ REQUISIÇÃO PUT PARA O SERVIDOR
      const url = `${API_BASE_URL}/api/pacientes/${selectedPaciente.id}?clinicaId=${clinicaIdEfetivo}`;
      console.log('🔗 [handleSavePaciente] URL:', url);
      console.log('📤 [handleSavePaciente] Enviando dados:', pacienteData);
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId: clinicaIdEfetivo,
          ...pacienteData
        })
      });
      console.log('📡 [handleSavePaciente] Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [handleSavePaciente] Erro na resposta:', errorText);
        throw new Error(`Erro ao salvar: ${errorText}`);
      }
      const result = await response.json();
      console.log('✅ [handleSavePaciente] Resposta do servidor:', result);
      // ⭐ Dispara evento para atualizar consultas na agenda (nome do paciente pode ter mudado)
      console.log(
        '🔄 [handleSavePaciente] Disparando evento consultas-updated para atualizar agenda'
      );
      window.dispatchEvent(new Event('consultas-updated'));
      // Atualiza estado local também (se a função existir)
      if (onUpdatePaciente) {
        await onUpdatePaciente(selectedPaciente.id, pacienteData);
      }
      success(
        'Paciente Atualizado',
        `Dados de ${pacienteData.nome || selectedPaciente.nome} foram salvos com sucesso!`
      );
      setIsPacienteModalOpen(false);
      setSelectedPaciente(undefined);
    } catch (err: any) {
      console.error('❌ [handleSavePaciente] Erro:', err);
      toastError(
        'Erro ao Salvar',
        err.message || 'Não foi possível salvar os dados do paciente'
      );
    }
  };
  /**
   * ⭐ Mostra foto do paciente do DB (NÃO busca do WhatsApp)
   */
  const handleVerificarFotoWhatsApp = async (paciente: Paciente) => {
    // ⭐ Usa foto do DB em vez de buscar do WhatsApp
    const fotoUrl = paciente.fotoUrl ?
    paciente.fotoUrl.startsWith('/uploads') ?
    `${API_BASE_URL}${paciente.fotoUrl}` :
    paciente.fotoUrl :
    null;
    setWhatsappPhotoModal({
      isOpen: true,
      paciente,
      contactInfo: {
        name: paciente.nome,
        number: paciente.telefone,
        profilePicUrl: fotoUrl,
        isRegistered: true
      },
      loading: false
    });
  };
  /**
   * Gera lista de horários disponíveis para um profissional em uma data
   * AGORA USA APENAS profissionalId
   */
  const gerarHorariosDisponiveis = (
  data: Date,
  profissionalId: string)
  : string[] => {
    const agenda = findAgendaForProfissional(profissionalId);
    if (!agenda) return [];
    if (!agenda.ativo) return [];
    const dataFormatada = formatLocalDate(data);
    // Mantém todos os horários que valem nesta data específica. A regra
    // compartilhada cobre semana A/B, dia semanal e datas específicas.
    const horariosDoDia = agenda.horarios.filter((h) =>
    slotValeNaData(h, data, dataFormatada)
    );
    if (horariosDoDia.length === 0) return [];
    const slotsSet = new Set<string>();
    const slotOcupado = (horarioFormatado: string) => {
      const alvo = normalizarHorarioSlot(horarioFormatado);
      return consultasFiltradas.some((c) => {
        if (normalizarDataSlot(c.data) !== dataFormatada) return false;
        if (normalizarHorarioSlot(c.horario) !== alvo) return false;
        // “bloqueado”/“removido” são exceções persistidas da grade: não voltam a
        // ser oferecidos como livres, qualquer que seja o status gravado.
        if (ehSlotIndisponivel(c.pacienteId)) return true;
        const status = String(c.status || '').
        trim().
        toLowerCase();
        const pid = String(c.pacienteId || '').
        trim().
        toLowerCase();
        return (
          status !== 'cancelada' &&
          status !== 'aguardando_remarcacao' &&
          pid !== 'disponivel');

      });
    };
    for (const horarioTrabalho of horariosDoDia) {
      if (
      horarioTrabalho.horariosManuais &&
      horarioTrabalho.horariosManuais.length > 0)
      {
        for (const horarioFormatado of horarioTrabalho.horariosManuais) {
          if (!slotOcupado(horarioFormatado)) slotsSet.add(horarioFormatado);
        }
        continue;
      }
      if (
      typeof horarioTrabalho.horaInicio !== 'string' ||
      typeof horarioTrabalho.horaFim !== 'string' ||
      !horarioTrabalho.horaInicio.includes(':') ||
      !horarioTrabalho.horaFim.includes(':'))

      continue;
      if (
      horarioTrabalho.horaInicio === '00:00' &&
      horarioTrabalho.horaFim === '00:00')

      continue;
      const [horaInicio, minInicio] = horarioTrabalho.horaInicio.
      split(':').
      map(Number);
      const [horaFim, minFim] = horarioTrabalho.horaFim.split(':').map(Number);
      const [horaIntervaloInicio, minIntervaloInicio] = (
      horarioTrabalho.intervaloInicio || '00:00').

      split(':').
      map(Number);
      const [horaIntervaloFim, minIntervaloFim] = (
      horarioTrabalho.intervaloFim || '00:00').

      split(':').
      map(Number);
      let horaAtual = horaInicio * 60 + minInicio;
      const horaFinal = horaFim * 60 + minFim;
      const intervaloInicio = horaIntervaloInicio * 60 + minIntervaloInicio;
      const intervaloFim = horaIntervaloFim * 60 + minIntervaloFim;
      const duracao = horarioTrabalho.duracaoConsultaPadrao || 30;
      if (horaFinal <= horaAtual) continue;
      while (horaAtual < horaFinal) {
        if (horaAtual >= intervaloInicio && horaAtual < intervaloFim) {
          horaAtual = intervaloFim;
          continue;
        }
        const h = Math.floor(horaAtual / 60);
        const m = horaAtual % 60;
        const horarioFormatado = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (!slotOcupado(horarioFormatado)) slotsSet.add(horarioFormatado);
        horaAtual += duracao;
      }
    }
    // ⭐ NOVO: Adiciona horários "disponivel" que foram criados manualmente (ex: alteração de horário)
    const placeholdersManuais = consultasFiltradas.filter(
      (c) =>
      normalizarDataSlot(c.data) === dataFormatada && (
      c.pacienteId === 'disponivel' || c.pacienteId === 'livre') &&
      c.status !== 'cancelada' && (
      profissionalId === 'todos' ||
      String(c.profissionalId) === String(profissionalId))
    );
    for (const p of placeholdersManuais) {
      const ph = normalizarHorarioSlot(p.horario);
      // ⭐ Só aceita horários no formato "HH:MM" (ignora registros corrompidos, ex: "true")
      if (ph && !slotOcupado(ph)) slotsSet.add(ph);
    }
    return Array.from(slotsSet).sort((a, b) =>
    String(a).localeCompare(String(b))
    );
  };
  // ⭐ Retorna horários bloqueados para a data/profissional
  const getHorariosBloqueados = (
  data: Date,
  profissionalId: string)
  : string[] => {
    const dataFormatada = formatLocalDate(data);
    return Array.from(
      new Set(
        consultasFiltradas.
        filter(
          (c) =>
          normalizarDataSlot(c.data) === dataFormatada &&
          String(c.pacienteId || '').
          trim().
          toLowerCase() === 'bloqueado' && (
          profissionalId === 'todos' ||
          String(c.profissionalId) === String(profissionalId))
        ).
        map((c) => normalizarHorarioSlot(c.horario)).
        filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  };
  // Busca nome do profissional pelo ID para exibição
  const profissionalNomeFiltro = useMemo(() => {
    if (profissionalIdFiltro === 'todos') return 'todos';
    // 1. Tenta encontrar na lista de usuários
    const profissional = usuarios.find((u) => u.id === profissionalIdFiltro);
    if (profissional?.nome) return profissional.nome;
    // 2. Fallback: busca na lista de agendas (que tem profissionalNome)
    const agenda = findAgendaForProfissional(profissionalIdFiltro);
    if (agenda?.profissionalNome) return agenda.profissionalNome;
    return 'todos';
  }, [profissionalIdFiltro, usuarios, agendas]);
  /**
   * Cria agenda vazia para o profissional selecionado
   */
  const handleCriarAgenda = async () => {
    if (profissionalIdFiltro === 'todos') return;
    // ⭐ Verifica se o dia está fechado (com cadeado)
    const dateKey = formatLocalDate(selectedDate);
    if (lockedDates.includes(dateKey)) {
      toastError(
        '🔒 Dia não aberto',
        `A agenda não foi aberta para ${selectedDate.toLocaleDateString(
          'pt-BR',
          {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          }
        )}. Clique com botão direito no calendário e selecione "Abrir dia".`
      );
      return;
    }
    const slots = gerarHorariosDisponiveis(selectedDate, profissionalIdFiltro);
    if (slots.length === 0) {
      // ⭐ Verifica se a agenda está fechada para dar mensagem mais clara
      const agendaProf = findAgendaForProfissional(profissionalIdFiltro);
      if (agendaProf && !agendaProf.ativo) {
        toastError(
          'Agenda Fechada',
          `A agenda de ${profissionalNomeFiltro} está fechada. Abra a agenda na tela "Agendas Profissionais" antes de criar horários.`
        );
      } else {
        toastError(
          'Nenhum horário disponível',
          'Não há horários livres para criar agenda nesta data ou o profissional não atende neste dia.'
        );
      }
      return;
    }
    const confirmed = await confirm(
      'Criar Agenda',
      `Deseja criar ${slots.length} horários vazios para ${profissionalNomeFiltro} em ${selectedDate.toLocaleDateString()}?`
    );
    if (!confirmed) return;
    setIsCreatingSchedule(true);
    try {
      const agendaProfissional = findAgendaForProfissional(profissionalIdFiltro);
      const especialidade =
      agendaProfissional?.especialidade === 'dentista' ?
      'odontologica' :
      'medica';
      const horarioConfig = agendaProfissional?.horarios.find((h) =>
      slotValeNaData(h, selectedDate, formatLocalDate(selectedDate))
      );
      const duracao = horarioConfig?.duracaoConsultaPadrao || 30;
      let criados = 0;
      // Create sequentially to avoid overwhelming the server
      for (const slot of slots) {
        await onAddConsulta({
          pacienteId: 'disponivel',
          pacienteNome: 'Horário Disponível',
          tipo: especialidade,
          data: formatLocalDate(selectedDate),
          horario: slot,
          duracao: duracao,
          status: 'agendada',
          profissionalId: profissionalIdFiltro,
          profissional: profissionalNomeFiltro,
          observacoes: 'Horário criado automaticamente',
          clinicaId: clinicaIdEfetivo
        });
        criados++;
      }
      success('Agenda Criada', `${criados} horários foram criados com sucesso.`);
    } catch (err: any) {
      console.error(err);
      toastError(
        'Erro ao criar agenda',
        err.message || 'Ocorreu um erro ao criar os horários.'
      );
    } finally {
      setIsCreatingSchedule(false);
    }
  };
  /**
   * Transforma um horário livre em outro (ex: 11:00 para 08:15)
   */
  const handleTransformarHorario = async (horarioAntigo: string) => {
    const { value: novoHorario } = await Swal.fire({
      title: 'Alterar Horário',
      text: `Transformar o horário livre das ${horarioAntigo} para:`,
      input: 'time',
      inputValue: horarioAntigo,
      showCancelButton: true,
      confirmButtonText: 'Salvar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d9488'
    });
    // ⭐ Valida: precisa ser um horário "HH:MM" válido (não boolean/vazio)
    if (
    !novoHorario ||
    typeof novoHorario !== 'string' ||
    !/^\d{1,2}:\d{2}$/.test(novoHorario.trim()) ||
    novoHorario.trim() === String(horarioAntigo).trim())
    {
      return;
    }
    const dataStr = formatLocalDate(selectedDate);
    const profId = profissionalIdFiltro;
    const agendaProfissional = findAgendaForProfissional(profId);
    const profNome =
    agendaProfissional?.profissionalNome || profissionalNomeFiltro;
    const especialidade =
    agendaProfissional?.especialidade === 'dentista' ?
    'odontologica' :
    'medica';
    const horarioConfig = agendaProfissional?.horarios.find(
      (h) => Number(h.diaSemana) === selectedDate.getDay()
    );
    const duracao = horarioConfig?.duracaoConsultaPadrao || 30;
    // ⭐ Coage para string limpa "HH:MM" (o input time pode retornar valores estranhos)
    const horarioNovoStr = String(novoHorario).trim();
    const horarioAntigoStr = String(horarioAntigo).trim();
    try {
      // ⭐ ORDEM IMPORTANTE: cria o NOVO horário PRIMEIRO.
      // Assim, se algo interromper o fluxo, o usuário nunca fica sem o slot novo
      // (antes o 11:00 sumia e o 8:15 não chegava a ser criado).
      // 1. Criar o novo horário livre (placeholder 'livre' para não ser filtrado pelo servidor)
      await onAddConsulta({
        data: dataStr,
        horario: horarioNovoStr,
        profissionalId: profId,
        profissional: profNome,
        pacienteId: 'livre',
        pacienteNome: 'Horário Disponível',
        status: 'agendada',
        duracao: duracao,
        tipo: especialidade,
        observacoes: 'Horário criado manualmente',
        clinicaId: clinicaIdEfetivo
      });
      // ⭐ FIX: Pequeno delay para garantir que o servidor gere IDs diferentes (baseados em Date.now())
      // caso o servidor ainda não tenha a atualização que adiciona o sufixo aleatório no ID.
      await new Promise((resolve) => setTimeout(resolve, 20));
      // 2. Remover o horário antigo (cria um placeholder 'removido' para ocultá-lo)
      await onAddConsulta({
        data: dataStr,
        horario: horarioAntigoStr,
        profissionalId: profId,
        profissional: profNome,
        pacienteId: 'removido',
        pacienteNome: 'REMOVIDO',
        status: 'bloqueado',
        duracao: duracao,
        tipo: especialidade,
        observacoes: 'Horário removido manualmente',
        clinicaId: clinicaIdEfetivo
      });
      success('Horário alterado com sucesso!');
    } catch (e: any) {
      console.error(e);
      toastError(
        'Erro ao alterar horário',
        e.message || 'Ocorreu um erro ao alterar o horário.'
      );
    }
  };
  /**
   * Imprime a agenda em PDF - Design Premium Profissional
   */
  const handleImprimirAgenda = () => {
    const clinica = sessao?.clinicaAtual;
    const clinicaNome = clinica?.nome || 'Clínica';
    const clinicaLogo = clinica?.logoUrl || '';
    const clinicaEndereco =
    clinica?.endereco || clinica?.logradouro ?
    (clinica?.logradouro || '') + (
    clinica?.numero ? ', ' + clinica.numero : '') + (
    clinica?.bairro ? ' - ' + clinica.bairro : '') + (
    clinica?.cidade ? ', ' + clinica.cidade : '') + (
    clinica?.uf ? '/' + clinica.uf : '') :
    '';
    const clinicaTelefone = clinica?.telefone || '';
    const clinicaEmail = clinica?.email || '';
    const clinicaCnpj = clinica?.cnpj || '';
    const profissionalNome =
    profissionalIdFiltro !== 'todos' ?
    profissionalNomeFiltro :
    'Todos os Profissionais';
    const dataFormatada = selectedDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    // Filtra consultas apenas do profissional selecionado (somente por ID)
    const consultasParaImprimir =
    profissionalIdFiltro !== 'todos' ?
    consultasDoDia.filter(
      (c) => String(c.profissionalId) === String(profissionalIdFiltro)
    ) :
    consultasDoDia;
    // Estatísticas (exclui horários disponíveis e removidos)
    const consultasReais = consultasParaImprimir.filter(
      (c) =>
      c.pacienteId !== 'disponivel' &&
      c.pacienteId !== 'livre' &&
      c.pacienteId !== 'removido'
    );
    const totalConsultas = consultasReais.length;
    const consultasAgendadas = consultasReais.filter(
      (c) => c.status === 'agendada'
    ).length;
    const consultasConfirmadas = consultasReais.filter(
      (c) => c.status === 'confirmada'
    ).length;
    const consultasRealizadas = consultasReais.filter(
      (c) => c.status === 'realizada'
    ).length;
    const consultasCanceladas = consultasReais.filter(
      (c) => c.status === 'cancelada'
    ).length;
    const consultasCompareceu = consultasReais.filter(
      (c) => c.status === 'compareceu'
    ).length;
    const consultasFaltou = consultasReais.filter(
      (c) => c.status === 'faltou'
    ).length;
    const encaixes = consultasReais.filter(
      (c) => c.tipoAgendamento === 'encaixe'
    ).length;
    // Gera iniciais para logo placeholder
    const iniciais = clinicaNome.
    split(' ').
    slice(0, 2).
    map((p: string) => p[0]).
    join('').
    toUpperCase();
    const statusLabels: Record<string, string> = {
      agendada: 'Agendada',
      confirmada: 'Confirmada',
      realizada: 'Realizada',
      cancelada: 'Cancelada',
      aguardando_remarcacao: 'Remarcar',
      compareceu: 'Compareceu',
      faltou: 'Faltou'
    };
    // Gera linhas da tabela
    let tableRows = '';
    if (consultasParaImprimir.length === 0) {
      tableRows =
      '<tr><td colspan="5" class="empty-row"><div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><p>Nenhuma consulta agendada para esta data</p></div></td></tr>';
    } else {
      consultasParaImprimir.
      sort((a, b) =>
      String(a.horario ?? '').localeCompare(String(b.horario ?? ''))
      ).
      forEach((consulta, index) => {
        const isPlaceholder =
        consulta.pacienteId === 'disponivel' ||
        consulta.pacienteId === 'livre';
        const isEncaixe = consulta.tipoAgendamento === 'encaixe';
        const statusLabel = statusLabels[consulta.status] || consulta.status;
        const rowClass = isPlaceholder ?
        'available-row' :
        isEncaixe ?
        'encaixe-row' :
        index % 2 === 0 ?
        'even-row' :
        '';
        if (isPlaceholder) {
          tableRows +=
          '<tr class="' +
          rowClass +
          '"><td class="time-cell">' +
          consulta.horario +
          '</td><td class="patient-cell available"><span class="available-badge">Horário Disponível</span></td><td class="type-cell">—</td><td class="status-cell">—</td><td class="obs-cell">—</td></tr>';
        } else {
          const tipoIcon = consulta.tipo === 'medica' ? '🩺' : '🦷';
          const tipoLabel =
          consulta.tipo === 'medica' ? 'Médica' : 'Odontológica';
          const encaixeTag = isEncaixe ?
          '<span class="encaixe-badge">⚡ ENCAIXE</span>' :
          '';
          const procNome =
          consulta.procedimentoNomeJoin || consulta.procedimentoNome || '';
          const procAnot = (consulta as any).procedimentoAnotacoes || '';
          const procText = procNome ?
          '<div class="procedure">' +
          procNome + (
          procAnot ? ' - <i>' + procAnot + '</i>' : '') +
          '</div>' :
          '';
          const obsText = consulta.observacoes ?
          consulta.observacoes.substring(0, 50) + (
          consulta.observacoes.length > 50 ? '...' : '') :
          '—';
          // ⭐ Ícone de necessidade especial na impressão
          const necessidadeInfo = iconeNecessidadeEspecial(
            (consulta as any).pacienteNecessidadeEspecial
          );
          const necessidadeTag = necessidadeInfo ?
          '<span title="' +
          necessidadeInfo.label +
          '" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background:' +
          necessidadeInfo.cor +
          '15;color:' +
          necessidadeInfo.cor +
          ';border:1.5px solid ' +
          necessidadeInfo.cor +
          '40;text-transform:uppercase;letter-spacing:0.5px"><span style="font-size:14px">' +
          necessidadeInfo.emoji +
          '</span>' +
          necessidadeInfo.label +
          '</span>' :
          '';
          tableRows +=
          '<tr class="' +
          rowClass +
          '"><td class="time-cell"><span class="time">' +
          consulta.horario +
          '</span><span class="duration">' +
          consulta.duracao +
          'min</span></td><td class="patient-cell"><div class="patient-name">' +
          necessidadeTag +
          consulta.pacienteNome +
          (() => {
            if (
            consulta.pacienteId &&
            consulta.pacienteId !== 'disponivel')
            {
              const pac = pacientesMapById.get(consulta.pacienteId);
              const contrato =
              (consulta as any).pacienteNumeroContrato ||
              pac?.numeroContrato;
              return contrato ?
              ' <span style="color:#64748b;font-weight:400;font-size:9px">#' +
              contrato +
              '</span>' :
              '';
            }
            return '';
          })() +
          '</div>' + (
          (consulta as any).pacienteTelefone ||
          (consulta as any).whatsappTelefone ?
          '<div style="color:#64748b;font-size:8px">📞 ' + (
          (consulta as any).pacienteTelefone ||
          (consulta as any).whatsappTelefone) +
          '</div>' :
          '') +
          encaixeTag +
          '</td><td class="type-cell"><span class="type-icon">' +
          tipoIcon +
          '</span><span class="type-label">' +
          tipoLabel +
          '</span>' +
          procText +
          '</td><td class="status-cell"><span class="status-badge status-' +
          consulta.status +
          '">' +
          statusLabel +
          '</span></td><td class="obs-cell">' + (
          procNome ? procNome + (procAnot ? ' — ' + procAnot : '') : '—') +
          '</td></tr>';
        }
      });
    }
    // Monta contato
    const contatoParts = [];
    if (clinicaTelefone) contatoParts.push('📞 ' + clinicaTelefone);
    if (clinicaEmail) contatoParts.push('✉️ ' + clinicaEmail);
    if (clinicaCnpj) contatoParts.push('CNPJ: ' + clinicaCnpj);
    const contatoHtml = contatoParts.join(' • ');
    // Logo HTML
    const logoHtml = clinicaLogo ?
    '<img src="' +
    clinicaLogo +
    '" alt="' +
    clinicaNome +
    '" class="logo" />' :
    '<div class="logo-placeholder">' + iniciais + '</div>';
    // Endereço HTML
    const enderecoHtml = clinicaEndereco ?
    '<div class="address">📍 ' + clinicaEndereco + '</div>' :
    '';
    // HTML completo com CSS corrigido
    const html =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Agenda - ' +
    clinicaNome +
    ' - ' +
    dataFormatada +
    '</title>' +
    '<sty' +
    'le>' +
    '@page{size:A4;margin:10mm}' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,"Roboto","Helvetica Neue",Arial,sans-serif;color:#1e293b;background:#fff;line-height:1.3;font-size:10px;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
    '.page{max-width:100%;padding:0}' +
    '.header{display:flex;align-items:center;gap:12px;padding:8px 12px;background:linear-gradient(135deg,#0f766e 0%,#14b8a6 100%);border-radius:8px;margin-bottom:8px;color:white}' +
    '.logo-container{flex-shrink:0}' +
    '.logo{width:36px;height:36px;object-fit:contain;border-radius:6px;background:white;padding:2px}' +
    '.logo-placeholder{width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:white;border:2px solid rgba(255,255,255,0.3)}' +
    '.header-info{flex:1}' +
    '.header-info h1{font-size:14px;font-weight:700;margin-bottom:1px;letter-spacing:-0.3px}' +
    '.header-info .address{font-size:9px;opacity:0.9;margin-bottom:1px}' +
    '.header-info .contact{font-size:8px;opacity:0.8}' +
    '.agenda-title{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}' +
    '.agenda-title .left h2{font-size:12px;color:#0f766e;font-weight:600;margin-bottom:1px}' +
    '.agenda-title .left .date{font-size:10px;color:#475569;text-transform:capitalize}' +
    '.agenda-title .left .doctor{font-size:9px;color:#64748b;margin-top:2px}' +
    '.stats{display:none}' +
    '.table-container{border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:8px}' +
    'table{width:100%;border-collapse:collapse}' +
    'thead{background:#1e293b}' +
    'thead th{padding:4px 6px;text-align:left;font-size:8px;font-weight:600;color:white;text-transform:uppercase;letter-spacing:0.3px}' +
    'tbody tr{border-bottom:1px solid #f1f5f9}' +
    'tbody tr:last-child{border-bottom:none}' +
    'tbody tr.even-row{background:#f8fafc}' +
    'tbody tr.encaixe-row{background:linear-gradient(90deg,#fff7ed 0%,#ffedd5 100%);border-left:3px solid #f97316}' +
    'tbody tr.available-row{background:#f1f5f9}' +
    'tbody td{padding:4px 6px;font-size:10px;vertical-align:middle}' +
    '.time-cell{width:64px;white-space:nowrap}' +
    '.time-cell .time{font-weight:700;color:#0f766e;font-size:11px;display:block;white-space:nowrap;font-family:"SF Mono","Fira Code","Consolas",monospace}' +
    '.time-cell .duration{font-size:8px;color:#94a3b8}' +
    '.patient-cell{min-width:120px}' +
    '.patient-cell .patient-name{font-weight:600;color:#1e293b;font-size:10px}' +
    '.encaixe-badge{display:inline-block;background:linear-gradient(135deg,#f97316 0%,#fb923c 100%);color:white;font-size:8px;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:600;vertical-align:middle}' +
    '.type-cell{width:110px}' +
    '.type-cell .type-icon{margin-right:4px}' +
    '.type-cell .type-label{color:#475569}' +
    '.type-cell .procedure{font-size:8px;color:#0f766e;margin-top:1px;font-weight:500}' +
    '.status-cell{width:100px;text-align:center}' +
    '.status-badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.2px}' +
    '.status-agendada{background:#ffffff;color:#374151;border:1px solid #d1d5db}' +
    '.status-confirmada{background:#d1fae5;color:#065f46}' +
    '.status-realizada{background:#dbeafe;color:#1e40af}' +
    '.status-cancelada{background:#fee2e2;color:#991b1b;text-decoration:line-through}' +
    '.status-aguardando_remarcacao{background:#ffedd5;color:#9a3412}' +
    '.obs-cell{color:#64748b;font-size:9px;max-width:100px}' +
    '.empty-row td{padding:40px}' +
    '.empty-state{text-align:center;color:#94a3b8}' +
    '.empty-state svg{margin-bottom:12px}' +
    '.empty-state p{font-size:12px;font-style:italic}' +
    '.footer{display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid #e2e8f0;margin-top:8px}' +
    '.footer-left,.footer-right{font-size:9px;color:#94a3b8}' +
    '.footer-brand{color:#0f766e;font-weight:600}' +
    '@media print{body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.header,.stat-card.total,thead,.status-badge,.encaixe-badge,.total-badge{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}' +
    '</sty' +
    'le></head><body>' +
    '<div class="page">' +
    '<div class="header"><div class="logo-container">' +
    logoHtml +
    '</div><div class="header-info"><h1>' +
    clinicaNome +
    '</h1>' +
    enderecoHtml +
    '<div class="contact">' +
    contatoHtml +
    '</div></div></div>' +
    '<div class="agenda-title"><div class="left"><h2>📅 Agenda de Consultas</h2><div class="date">' +
    dataFormatada +
    '</div><div class="doctor">👨‍⚕️ ' +
    profissionalNome +
    '</div></div><div class="right"><div class="total-badge"><span class="number">' +
    totalConsultas +
    '</span>Pacientes</div></div></div>' +
    '<div class="stats">' +
    '<div class="stat-card total"><div class="value">' +
    totalConsultas +
    '</div><div class="label">Total</div></div>' +
    '<div class="stat-card silver"><div class="value">' +
    consultasAgendadas +
    '</div><div class="label">Agendadas</div></div>' +
    '<div class="stat-card green"><div class="value">' +
    consultasConfirmadas +
    '</div><div class="label">Confirmadas</div></div>' +
    '<div class="stat-card blue"><div class="value">' +
    consultasRealizadas +
    '</div><div class="label">Realizadas</div></div>' +
    '<div class="stat-card red"><div class="value">' +
    consultasCanceladas +
    '</div><div class="label">Canceladas</div></div>' +
    '<div class="stat-card purple"><div class="value">' +
    consultasCompareceu +
    '</div><div class="label">Compareceu</div></div>' +
    '<div class="stat-card brown"><div class="value">' +
    consultasFaltou +
    '</div><div class="label">Faltou</div></div>' +
    '<div class="stat-card orange"><div class="value">' +
    encaixes +
    '</div><div class="label">Encaixes</div></div>' +
    '</div>' +
    '<div class="table-container"><table><thead><tr><th>Horário</th><th>Paciente</th><th>Tipo</th><th>Status</th><th>Proc./Anotações</th></tr></thead><tbody>' +
    tableRows +
    '</tbody></table></div>' +
    '<div class="footer"><div class="footer-left">Documento gerado em ' +
    new Date().toLocaleString('pt-BR') +
    '</div><div class="footer-right">Sistema <span class="footer-brand">EasyClin</span> • Gestão Inteligente de Clínicas</div></div>' +
    '</div>' +
    '</body></html>';
    // ⭐ Abre preview antes de salvar
    import('../utils/pdfGenerator').then(({ previewDocumentoPDF }) => {
      const nomeArquivo = `Agenda_${dataFormatada.replace(/\s+/g, '_').replace(/[,]/g, '')}_${profissionalNome.replace(/\s+/g, '_')}.pdf`;
      previewDocumentoPDF(html, {
        fileName: nomeArquivo
      });
    });
  };
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ⭐ DialogContainer local para que os dialogs de confirmação funcionem */}
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />

      {/* ===== ÁREA FIXA (não rola) ===== */}
      <div className="flex-shrink-0 space-y-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Agenda</h1>
            <p className="text-gray-500 mt-1">
              Gerencie os agendamentos de consultas
              {usuarioLogado && (
              usuarioLogado.tipo === 'medico' ||
              usuarioLogado.tipo === 'dentista') &&
              <span className="ml-2 text-teal-600 font-medium">
                    • Visualizando apenas sua agenda pessoal
                  </span>
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Botão Configurar Horários - inline no header */}
            {usuarioLogado &&
            ['super_admin', 'admin', 'atendente'].includes(
              usuarioLogado.tipo
            ) &&
            profissionalIdFiltro === 'todos' &&
            <button
              onClick={() => onNavigate?.('agenda_profissional')}
              title="Configurar Horários dos Profissionais"
              className="p-2 rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-50 transition-colors">
              
                  <ClockIcon className="w-5 h-5" />
                </button>
            }
            {/* ⭐ NOVO: Botão Novo */}
            <Button
              onClick={() => {
                setEditingConsulta(undefined);
                setPreFilledHorario(undefined);
                setIsEncaixeMode(false);
                setEncaixeRapidoInfo(null);
                setIsModalOpen(true);
              }}>
              
              <PlusIcon className="w-4 h-4 mr-2" />
              Nova Consulta
            </Button>
            {/* ⭐ Botão Transferir — só aparece quando um profissional específico está selecionado */}
            {profissionalIdFiltro !== 'todos' &&
            <Button
              variant={transferMode ? 'danger' : 'secondary'}
              onClick={() => {
                setTransferMode(!transferMode);
                if (transferMode) setSelectedConsultaIds([]);
                if (!transferMode) {
                  setMultiSelectMode(false);
                  setSelectedSlots([]);
                }
              }}>
              
                <RotateCcwIcon className="w-4 h-4 mr-2" />
                {transferMode ? 'Cancelar Transferência' : '🔄 Transferir'}
              </Button>
            }
            {/* ⭐ Botão fila de atendimento — TOGGLE do card inline (não navega mais).
              Clique curto: mostra/esconde o card "Fila de Atendimento" na agenda.
              Clique com Shift OU clique-direito: navega para a página completa. */}
            <button
              onClick={(e) => {
                if (e.shiftKey) {
                  onNavigate?.('fila_atendimento');
                } else {
                  setFilaAtendimentoVisible((v) => !v);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onNavigate?.('fila_atendimento');
              }}
              title={
              filaAtendimentoVisible ?
              'Esconder Fila de Atendimento (Shift+clique ou clique direito: abrir página completa)' :
              'Mostrar Fila de Atendimento (Shift+clique ou clique direito: abrir página completa)'
              }
              className={`relative p-2 rounded-lg text-white transition-colors ${filaAtendimentoVisible ? 'bg-purple-800 hover:bg-purple-900 ring-2 ring-purple-300' : 'bg-purple-600 hover:bg-purple-700'}`}>
              
              <ListIcon className="w-5 h-5" />
              {/* Badge com quantidade de pacientes aguardando */}
              {(() => {
                const hoje = formatLocalDate(selectedDate);
                const aguardando = consultasFiltradas.filter(
                  (c) =>
                  c.data === hoje &&
                  c.horaChegada &&
                  c.statusAtendimento === 'aguardando' &&
                  c.status !== 'cancelada'
                ).length;
                return aguardando > 0 ?
                <span className="absolute -top-1 -right-1 bg-white text-purple-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow">
                    {aguardando}
                  </span> :
                null;
              })()}
            </button>
            {/* Botão imprimir */}
            <button
              onClick={handleImprimirAgenda}
              title="Imprimir agenda em PDF"
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors">
              
              <PrinterIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ⭐ Barra de seleção para transferência — fixa no topo, abaixo dos botões */}
        {transferMode &&
        consultasDoDia.filter(
          (c) =>
          c.pacienteId !== 'disponivel' &&
          c.pacienteId !== 'bloqueado' &&
          c.status !== 'cancelada'
        ).length > 0 &&
        <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200 mt-2">
              <RotateCcwIcon className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-orange-700">
                Selecione as consultas para transferir:
              </span>
              <button
            onClick={() => {
              const transferiveis = consultasDoDia.filter(
                (c) =>
                c.pacienteId !== 'disponivel' &&
                c.pacienteId !== 'bloqueado' &&
                c.status !== 'cancelada'
              );
              if (selectedConsultaIds.length === transferiveis.length) {
                setSelectedConsultaIds([]);
              } else {
                setSelectedConsultaIds(transferiveis.map((c) => c.id));
              }
            }}
            className="px-3 py-1 text-xs font-medium rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-100 transition-colors">
            
                {selectedConsultaIds.length ===
            consultasDoDia.filter(
              (c) =>
              c.pacienteId !== 'disponivel' &&
              c.pacienteId !== 'bloqueado' &&
              c.status !== 'cancelada'
            ).length ?
            'Desmarcar Todos' :
            'Selecionar Todos'}
              </button>
              <span className="text-sm text-orange-600 font-medium">
                {selectedConsultaIds.length} de{' '}
                {
            consultasDoDia.filter(
              (c) =>
              c.pacienteId !== 'disponivel' &&
              c.pacienteId !== 'bloqueado' &&
              c.status !== 'cancelada'
            ).length
            }
              </span>
            </div>
        }

        {/* WhatsApp Config Missing Alert */}
        {!whatsappConfig &&
        <Card>
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">
                  ⚠️ WhatsApp Não Configurado
                </p>
                <p className="text-xs text-red-700 mt-1">
                  Vá em <strong>Configurações</strong> e clique em{' '}
                  <strong>"Salvar Configurações"</strong> para ativar o envio de
                  mensagens
                </p>
              </div>
            </div>
          </Card>
        }

        {/* ⭐ Card de fila de atendimento — só aparece quando o usuário ativa pelo botão roxo no topo.
              Economiza espaço vertical para a agenda ficar com mais slots visíveis. */}
        {filaAtendimentoVisible &&
        (() => {
          const hoje = formatLocalDate(new Date());
          const pacientesAguardando = consultasFiltradas.filter(
            (c) =>
            c.data === hoje &&
            c.horaChegada && (
            !c.statusAtendimento ||
            c.statusAtendimento === 'aguardando') &&
            c.status !== 'cancelada' &&
            c.pacienteId !== 'disponivel'
          );
          const pacientesEmAtendimento = consultasFiltradas.filter(
            (c) =>
            c.data === hoje &&
            c.horaChegada && (
            c.statusAtendimento === 'em_atendimento' ||
            c.statusAtendimento === 'pausado') &&
            c.status !== 'cancelada'
          );
          if (
          pacientesAguardando.length > 0 ||
          pacientesEmAtendimento.length > 0)
          {
            return (
              <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                          <ListIcon className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                            Fila de Atendimento
                            {pacientesAguardando.length > 0 &&
                          <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                                {pacientesAguardando.length} aguardando
                              </span>
                          }
                          </h3>
                          <p className="text-sm text-purple-700">
                            {pacientesEmAtendimento.length > 0 &&
                          <span className="text-green-700 font-medium">
                                {pacientesEmAtendimento.length} em atendimento
                              </span>
                          }
                            {pacientesEmAtendimento.length > 0 &&
                          pacientesAguardando.length > 0 &&
                          ' • '}
                            {pacientesAguardando.length > 0 &&
                          <span>
                                Próximo:{' '}
                                <strong>
                                  {pacientesAguardando[0]?.pacienteNome}
                                </strong>{' '}
                                (chegou às{' '}
                                {formatarHoraChegada(
                              pacientesAguardando[0]?.horaChegada || ''
                            )}
                                )
                              </span>
                          }
                          </p>
                        </div>
                      </div>
                      <button
                      onClick={() => onNavigate?.('fila_atendimento')}
                      title="Gerenciar Fila"
                      className="p-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors">
                      
                        <ListIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </Card>);

          }
          return null;
        })()}

        {/* Aviso de Permissões de Visualização */}
        {usuarioLogado && (
        usuarioLogado.tipo === 'medico' ||
        usuarioLogado.tipo === 'dentista') &&
        <Card className="bg-teal-50 border-teal-200">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-teal-900 mb-2 flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4" />
                      Visualização Personalizada
                    </h3>
                    <p className="text-sm text-teal-800">
                      🔒 Você está visualizando apenas{' '}
                      <strong>sua própria agenda</strong>. Configure seus
                      horários de atendimento clicando no botão ao lado.
                    </p>
                  </div>
                  <button
                onClick={() => onNavigate?.('agenda_profissional')}
                title="Configurar Horários"
                className="ml-4 p-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors">
                
                    <ClockIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </Card>
        }

        {usuarioLogado &&
        usuarioLogado.tipo === 'atendente' &&
        profissionalIdFiltro === 'todos' &&
        profissionais.length > 1 &&
        <Card className="bg-blue-50 border-blue-200">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <UsersIcon className="w-4 h-4" />
                  Dica para Atendentes
                </h3>
                <p className="text-sm text-blue-800">
                  💡 Use o <strong>seletor de profissional</strong> na barra
                  lateral esquerda para filtrar a agenda de um profissional
                  específico e ver os horários livres disponíveis.
                </p>
              </div>
            </Card>
        }

        {/* Área de impressão (oculta na tela) */}
        <div
          id="agenda-print-area"
          style={{
            display: 'none'
          }}>
          
          {/* Conteúdo será gerado dinamicamente no handleImprimirAgenda */}
        </div>

        {/* Active Filter Indicator com Horários Livres */}
        {profissionalIdFiltro !== 'todos' &&
        <div className="space-y-4">
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                  <p className="text-sm font-semibold text-teal-900">
                    Agenda de <strong>{profissionalNomeFiltro}</strong> em{' '}
                    {selectedDate.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                  onClick={() => {
                    setPreFilledHorario(undefined);
                    setEditingConsulta(undefined);
                    setIsEncaixeMode(true);
                    setIsModalOpen(true);
                  }}
                  title="Criar encaixe (não ocupa slot)"
                  className="p-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors">
                  
                    <ZapIcon className="w-4 h-4" />
                  </button>
                  {usuarioLogado &&
                ['super_admin', 'admin', 'atendente'].includes(
                  usuarioLogado.tipo
                ) &&
                <button
                  onClick={() => onNavigate?.('agenda_profissional')}
                  title="Configurar Horários"
                  className="p-1.5 rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-50 transition-colors">
                  
                        <ClockIcon className="w-4 h-4" />
                      </button>
                }
                </div>
              </div>

              {/* Horários Livres */}
              <div className="mt-3 pt-3 border-t border-teal-200">
                {/* ⭐ VERIFICAÇÃO: Dia está FECHADO (com cadeado)? */}
                {/* Se todos os slots foram excluídos, mantém o acesso ao restauro. */}
                {lockedDates.includes(formatLocalDate(selectedDate)) &&
              profissionalIdFiltro !== 'todos' &&
              consultasDoDia.filter((c) => c.pacienteId !== 'disponivel').
              length === 0 &&
              horariosRemovidosDoDia.length === 0 ?
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                        <LockIcon className="w-8 h-8 text-red-500" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-red-800 mb-2">
                      🔒 Agenda FECHADA para este dia
                    </h3>
                    <p className="text-sm text-red-700 mb-3 leading-relaxed">
                      A agenda deste profissional <strong>está fechada</strong>{' '}
                      para{' '}
                      <strong>
                        {selectedDate.toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                      </strong>
                      .
                    </p>
                    <p className="text-xs text-red-600 bg-red-100 rounded-lg px-4 py-2 inline-block">
                      Para abrir, clique com o <strong>botão direito</strong> no
                      dia desejado no calendário e selecione{' '}
                      <strong>"Abrir dia"</strong>.
                    </p>
                  </div> :

              <>
                    {/* ⭐ Banner de Agenda Extra */}
                    {extraDates.includes(formatLocalDate(selectedDate)) &&
                <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 mb-3 flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-orange-600 font-bold text-lg">
                            +
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-orange-800">
                            📋 Agenda Extra
                          </p>
                          <p className="text-xs text-orange-700">
                            Este dia não faz parte da grade regular. Os horários
                            abaixo são extras.
                          </p>
                        </div>
                      </div>
                }
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h3 className="text-xs font-semibold text-teal-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Horários Livres
                      </h3>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {horariosRemovidosDoDia.length > 0 &&
                    <button
                      type="button"
                      onClick={handleRestaurarHorariosExcluidos}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 transition-colors inline-flex items-center gap-1.5"
                      title={`Restaurar ${horariosRemovidosDoDia.length} horário${horariosRemovidosDoDia.length > 1 ? 's' : ''} excluído${horariosRemovidosDoDia.length > 1 ? 's' : ''}`}>
                      
                            <RotateCcwIcon
                        className="w-3.5 h-3.5"
                        aria-hidden="true" />
                      
                            Restaurar excluídos ({horariosRemovidosDoDia.length}
                            )
                          </button>
                    }
                        {/* ⭐ Toggle multi-seleção */}
                        {gerarHorariosDisponiveis(
                      selectedDate,
                      profissionalIdFiltro
                    ).length > 1 &&
                    <button
                      onClick={() => {
                        setMultiSelectMode(!multiSelectMode);
                        if (multiSelectMode) setSelectedSlots([]);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${multiSelectMode ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'}`}>
                      
                            <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true">
                        
                              <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        
                            </svg>
                            {multiSelectMode ?
                      'Cancelar Seleção' :
                      'Selecionar Vários'}
                          </button>
                    }
                        {multiSelectMode &&
                    <button
                      onClick={() => {
                        const todos = gerarHorariosDisponiveis(
                          selectedDate,
                          profissionalIdFiltro
                        );
                        if (selectedSlots.length === todos.length) {
                          setSelectedSlots([]);
                        } else {
                          setSelectedSlots([...todos].sort());
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all bg-white text-blue-700 border-blue-300 hover:bg-blue-50">
                      
                            {selectedSlots.length ===
                      gerarHorariosDisponiveis(
                        selectedDate,
                        profissionalIdFiltro
                      ).length ?
                      '☐ Desmarcar Todos' :
                      '☑ Selecionar Todos'}
                          </button>
                    }
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(() => {
                    const livres = gerarHorariosDisponiveis(
                      selectedDate,
                      profissionalIdFiltro
                    );
                    const bloqueados = getHorariosBloqueados(
                      selectedDate,
                      profissionalIdFiltro
                    );
                    const todos = [
                    ...livres.map((h) => ({
                      h,
                      bloqueado: false
                    })),
                    ...bloqueados.map((h) => ({
                      h,
                      bloqueado: true
                    }))].
                    sort((a, b) =>
                    String(a.h ?? '').localeCompare(String(b.h ?? ''))
                    );
                    return todos.length > 0 ?
                    todos.map(({ h: horario, bloqueado }) => {
                      if (bloqueado) {
                        return (
                          <button
                            key={`bloq-${horario}`}
                            onClick={async () => {
                              if (multiSelectMode) return;
                              const result = await Swal.fire({
                                icon: 'question',
                                title: 'Desbloquear horário?',
                                text: `Deseja liberar o horário ${horario} para agendamentos?`,
                                showCancelButton: true,
                                confirmButtonText: 'Sim, desbloquear',
                                cancelButtonText: 'Não',
                                confirmButtonColor: '#0d9488'
                              });
                              if (!result.isConfirmed) return;
                              const dataStr =
                              formatLocalDate(selectedDate);
                              const profId = profissionalIdFiltro;
                              const c = consultasFiltradas.find(
                                (c) =>
                                normalizarDataSlot(c.data) ===
                                dataStr &&
                                String(c.pacienteId || '').
                                trim().
                                toLowerCase() === 'bloqueado' &&
                                normalizarHorarioSlot(c.horario) ===
                                normalizarHorarioSlot(horario) && (
                                profId === 'todos' ||
                                String(c.profissionalId) ===
                                String(profId))
                              );
                              if (c) {
                                onUpdateConsulta(c.id, {
                                  pacienteId: 'disponivel',
                                  pacienteNome: 'Disponível',
                                  status: 'agendada'
                                } as any);
                              }
                            }}
                            className="px-3 py-1.5 rounded text-sm font-medium shadow-sm bg-red-50 text-red-400 border border-red-200 line-through opacity-60 cursor-pointer hover:opacity-80 hover:bg-red-100 transition-all"
                            title={`🔒 Bloqueado — clique para desbloquear`}>
                            
                                  🔒 {horario}
                                </button>);

                      }
                      const isSelected = selectedSlots.includes(horario);
                      return (
                        <div
                          key={horario}
                          className="relative group inline-flex">
                          
                                <button
                            onClick={() => {
                              if (multiSelectMode) {
                                setSelectedSlots((prev) =>
                                prev.includes(horario) ?
                                prev.filter((h) => h !== horario) :
                                [...prev, horario].sort()
                                );
                              } else {
                                setPreFilledHorario(horario);
                                setIsEncaixeMode(false);
                                setIsModalOpen(true);
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-sm font-medium shadow-sm transition-all ${!multiSelectMode ? 'pr-8' : ''} ${multiSelectMode && isSelected ? 'bg-blue-600 text-white border border-blue-600 ring-2 ring-blue-300 scale-105' : multiSelectMode ? 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 hover:border-blue-400' : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'}`}>
                            
                                  {multiSelectMode && isSelected &&
                            <span className="mr-1">✓</span>
                            }
                                  {horario}
                                </button>
                                {!multiSelectMode &&
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTransformarHorario(horario);
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-green-600 hover:text-green-800 hover:bg-green-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Alterar horário">
                            
                                    <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}>
                              
                                      <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              
                                    </svg>
                                  </button>
                          }
                              </div>);

                    }) :

                    <div className="flex items-center justify-between w-full">
                            <p className="text-xs text-teal-700 italic">
                              {findAgendaForProfissional(profissionalIdFiltro) ?
                        'Todos os horários ocupados ou dia sem atendimento.' :
                        'Configure a agenda deste profissional clicando no botão acima.'}
                            </p>
                          </div>;

                  })()}
                    </div>

                    {/* ⭐ Barra flutuante de multi-seleção */}
                    {multiSelectMode && selectedSlots.length > 0 &&
                <div className="mt-3 p-3 bg-blue-600 rounded-lg shadow-lg flex items-center justify-between gap-3 animate-in slide-in-from-bottom">
                        <div className="flex items-center gap-2 text-white">
                          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">
                            {selectedSlots.length}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">
                              {selectedSlots.length} horário
                              {selectedSlots.length > 1 ? 's' : ''}
                            </p>
                            <p className="text-[10px] text-blue-200">
                              {selectedSlots.join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                      onClick={() => setSelectedSlots([])}
                      className="px-3 py-1.5 text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                      
                            Limpar
                          </button>
                          <button
                      onClick={async () => {
                        const dataStr = formatLocalDate(selectedDate);
                        const profId =
                        profissionalIdFiltro === 'todos' ?
                        usuarios.find(
                          (u) =>
                          u.tipo === 'medico' ||
                          u.tipo === 'dentista'
                        )?.id || '' :
                        profissionalIdFiltro;
                        const profNome =
                        usuarios.find((u) => u.id === profId)?.nome ||
                        '';
                        const result = await Swal.fire({
                          icon: 'warning',
                          title: 'Bloquear horários?',
                          text: `Bloquear ${selectedSlots.length} horário(s): ${selectedSlots.join(', ')}. Horários bloqueados não poderão receber agendamentos.`,
                          showCancelButton: true,
                          confirmButtonText: 'Sim, bloquear',
                          cancelButtonText: 'Cancelar',
                          confirmButtonColor: '#dc2626'
                        });
                        if (!result.isConfirmed) return;
                        for (const horario of selectedSlots) {
                          const existente = consultasFiltradas.find(
                            (c) =>
                            normalizarDataSlot(c.data) === dataStr && (
                            c.pacienteId === 'disponivel' ||
                            c.pacienteId === 'livre') &&
                            normalizarHorarioSlot(c.horario) ===
                            normalizarHorarioSlot(horario) && (
                            profissionalIdFiltro === 'todos' ||
                            String(c.profissionalId) ===
                            String(profId))
                          );
                          if (existente) {
                            onUpdateConsulta(existente.id, {
                              pacienteId: 'bloqueado',
                              pacienteNome: 'BLOQUEADO',
                              status: 'bloqueado'
                            } as any);
                          } else {
                            try {
                              await onAddConsulta({
                                data: dataStr,
                                horario,
                                profissionalId: profId,
                                profissional: profNome,
                                pacienteId: 'bloqueado',
                                pacienteNome: 'BLOQUEADO',
                                status: 'bloqueado',
                                duracao: 25,
                                tipo: 'consulta',
                                observacoes:
                                'Horário bloqueado manualmente'
                              });
                            } catch (e) {
                              console.error(
                                `Erro ao bloquear ${horario}:`,
                                e
                              );
                            }
                          }
                        }
                        setSelectedSlots([]);
                        setMultiSelectMode(false);
                      }}
                      className="px-4 py-1.5 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors shadow-sm">
                      
                            🔒 Bloquear {selectedSlots.length}
                          </button>
                          <button
                      onClick={async () => {
                        const dataStr = formatLocalDate(selectedDate);
                        const profId =
                        profissionalIdFiltro === 'todos' ?
                        usuarios.find(
                          (u) =>
                          u.tipo === 'medico' ||
                          u.tipo === 'dentista'
                        )?.id || '' :
                        profissionalIdFiltro;
                        const profNome =
                        usuarios.find((u) => u.id === profId)?.nome ||
                        '';
                        const result = await Swal.fire({
                          icon: 'warning',
                          title: 'Excluir horários da agenda?',
                          text: `${selectedSlots.length} horário(s) serão removidos da agenda e não aparecerão como bloqueados. Esta ação não afeta consultas de pacientes.`,
                          showCancelButton: true,
                          confirmButtonText: 'Sim, excluir horários',
                          cancelButtonText: 'Cancelar',
                          confirmButtonColor: '#dc2626'
                        });
                        if (!result.isConfirmed) return;
                        for (const horario of selectedSlots) {
                          const existente = consultasFiltradas.find(
                            (c) =>
                            normalizarDataSlot(c.data) === dataStr && (
                            c.pacienteId === 'disponivel' ||
                            c.pacienteId === 'livre' ||
                            c.pacienteId === 'bloqueado') &&
                            normalizarHorarioSlot(c.horario) ===
                            normalizarHorarioSlot(horario) && (
                            profissionalIdFiltro === 'todos' ||
                            String(c.profissionalId) ===
                            String(profId))
                          );
                          if (existente) {
                            onUpdateConsulta(existente.id, {
                              pacienteId: 'removido',
                              pacienteNome: 'HORÁRIO REMOVIDO',
                              status: 'cancelada',
                              observacoes:
                              'Horário removido manualmente da agenda'
                            } as any);
                          } else {
                            try {
                              await onAddConsulta({
                                data: dataStr,
                                horario,
                                profissionalId: profId,
                                profissional: profNome,
                                pacienteId: 'removido',
                                pacienteNome: 'HORÁRIO REMOVIDO',
                                status: 'cancelada',
                                duracao: 25,
                                tipo: 'consulta',
                                observacoes:
                                'Horário removido manualmente da agenda'
                              });
                            } catch (error) {
                              console.error(
                                `Erro ao excluir ${horario} da agenda:`,
                                error
                              );
                            }
                          }
                        }
                        setSelectedSlots([]);
                        setMultiSelectMode(false);
                      }}
                      className="px-4 py-1.5 bg-white text-red-700 text-sm font-bold rounded-lg hover:bg-red-50 border border-red-200 transition-colors shadow-sm inline-flex items-center gap-1.5"
                      title="Remove os horários selecionados da agenda">
                      
                            <TrashIcon className="w-4 h-4" />
                            Excluir {selectedSlots.length}
                          </button>
                          <button
                      onClick={() => {
                        // Abre o modal com o primeiro horário selecionado
                        setPreFilledHorario(selectedSlots[0]);
                        setIsEncaixeMode(false);
                        setEditingConsulta(undefined);
                        setIsModalOpen(true);
                      }}
                      className="px-4 py-1.5 bg-white text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-50 transition-colors shadow-sm">
                      
                            📅 Agendar {selectedSlots.length} horário
                            {selectedSlots.length > 1 ? 's' : ''}
                          </button>
                        </div>
                      </div>
                }

                    {!multiSelectMode &&
                <p className="text-xs text-orange-600 mt-3 flex items-center gap-1">
                        <ZapIcon className="w-3 h-3" />
                        <span>
                          Para criar um encaixe, clique no botão{' '}
                          <strong>⚡</strong> acima ou ative a opção "Encaixe"
                          ao registrar uma consulta
                        </span>
                      </p>
                }
                  </>
              }
              </div>
            </div>
          </div>
        }
      </div>

      {/* ===== ÁREA ROLÁVEL (lista de agendamentos) ===== */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-2">
        <div className="space-y-6">
          <Card>
            {!dateReady ?
            <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                <span className="text-gray-500 text-sm">
                  Carregando agenda do dia selecionado...
                </span>
              </div> :
            consultasDoDia.length === 0 ?
            <div className="text-center py-12">
                <p className="text-gray-500 mb-4">
                  Nenhuma consulta agendada para esta data
                </p>
                <p className="text-sm text-gray-400">
                  {profissionalIdFiltro !== 'todos' ?
                'Clique em um horário livre acima para agendar' :
                'Selecione um profissional na sidebar para ver os horários disponíveis'}
                </p>
              </div> :

            <div className="space-y-3">
                {consultasDoDia.map((consulta) => {
                const paciente = pacientesMapById.get(consulta.pacienteId);
                const isTransferivel =
                consulta.pacienteId !== 'disponivel' &&
                consulta.pacienteId !== 'bloqueado' &&
                consulta.status !== 'cancelada';
                const isSelectedForTransfer =
                transferMode && selectedConsultaIds.includes(consulta.id);
                return (
                  <div
                    key={consulta.id}
                    className={`relative ${transferMode && isTransferivel ? 'cursor-pointer' : ''} ${isSelectedForTransfer ? 'ring-2 ring-orange-500 rounded-lg' : ''}`}
                    onClick={() => {
                      if (transferMode && isTransferivel) {
                        setSelectedConsultaIds((prev) =>
                        prev.includes(consulta.id) ?
                        prev.filter((id) => id !== consulta.id) :
                        [...prev, consulta.id]
                        );
                      }
                    }}>
                    
                      {/* Checkbox overlay no modo transferência */}
                      {transferMode && isTransferivel &&
                    <div
                      className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelectedForTransfer ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-300'}`}>
                      
                          {isSelectedForTransfer &&
                      <CheckIcon className="w-4 h-4" />
                      }
                        </div>
                    }
                      <ConsultaCard
                      consulta={consulta}
                      paciente={paciente}
                      clinicaId={clinicaId || ''}
                      clinicaIdEfetivo={clinicaIdEfetivo}
                      usuarioLogado={usuarioLogado}
                      temMensagemNova={pacientesComMensagemNova.has(
                        consulta.pacienteId
                      )}
                      onMensagensLidas={marcarComoLida}
                      recibosEmitidos={recibosEmitidos}
                      encaixeJaExiste={encaixeJaExiste}
                      calcularDuracoesEncaixe={calcularDuracoesEncaixe}
                      onEdit={(c) => {
                        if (transferMode) return;
                        setEditingConsulta(c);
                        setIsModalOpen(true);
                      }}
                      onDoubleClick={(c) => {
                        if (transferMode) return;
                        setEditingConsulta(c);
                        setIsEncaixeMode(false);
                        setEncaixeRapidoInfo(null);
                        setPreFilledHorario(undefined);
                        setIsModalOpen(true);
                      }}
                      onPacienteClick={
                      transferMode ? () => {} : handlePacienteClick
                      }
                      onCriarEncaixeRapido={
                      transferMode ? () => {} : handleCriarEncaixeRapido
                      }
                      onUpdateConsulta={onUpdateConsulta}
                      onMarcarChegada={
                      transferMode ? () => {} : handleMarcarChegada
                      }
                      onConfirmar={
                      transferMode ? () => {} : confirmarConsulta
                      }
                      onSolicitarConfirmacao={
                      transferMode ? () => {} : solicitarConfirmacao
                      }
                      onIniciarAtendimento={
                      transferMode ? () => {} : handleIniciarAtendimento
                      }
                      onMarcarRealizada={
                      transferMode ? () => {} : marcarRealizada
                      }
                      onCancelar={transferMode ? () => {} : cancelarConsulta}
                      onSolicitarCancelamento={
                      transferMode ? () => {} : handleSolicitarCancelamento
                      }
                      onRestaurar={
                      transferMode ? () => {} : restaurarConsulta
                      }
                      onReciboEmitido={
                      transferMode ?
                      () => {} :
                      (id) =>
                      setRecibosEmitidos(
                        (prev) => new Set([...prev, id])
                      )
                      }
                      success={success}
                      toastError={toastError} />
                    
                    </div>);

              })}
              </div>
            }
          </Card>

          {/* ⭐ Floating bar de transferência */}
          {transferMode && selectedConsultaIds.length > 0 &&
          <div className="sticky bottom-4 mx-2 p-3 bg-orange-600 rounded-lg shadow-xl flex items-center justify-between gap-3 z-20 animate-in slide-in-from-bottom">
              <div className="flex items-center gap-2 text-white">
                <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">
                  {selectedConsultaIds.length}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {selectedConsultaIds.length} consulta
                    {selectedConsultaIds.length > 1 ? 's' : ''} selecionada
                    {selectedConsultaIds.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-[10px] text-orange-200">
                    {selectedConsultaIds.
                  map((id) => {
                    const c = consultasDoDia.find((x) => x.id === id);
                    return c ?
                    `${c.horario} ${c.pacienteNome?.split(' ')[0] || ''}` :
                    '';
                  }).
                  filter(Boolean).
                  join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                onClick={() => setSelectedConsultaIds([])}
                className="px-3 py-1.5 text-xs font-medium text-orange-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                
                  Limpar
                </button>
                <button
                onClick={async () => {
                  // Monta lista de profissionais da MESMA CLÍNICA (excluindo o atual)
                  const profissionaisDisponiveis = (usuarios || []).
                  filter(
                    (u) =>
                    (u.tipo === 'medico' || u.tipo === 'dentista') &&
                    u.id !== profissionalIdFiltro && (
                    !u.clinicaId ||
                    String(u.clinicaId) === String(clinicaId))
                  ).
                  sort((a, b) => a.nome.localeCompare(b.nome));
                  if (profissionaisDisponiveis.length === 0) {
                    await Swal.fire({
                      icon: 'warning',
                      title: 'Sem profissionais',
                      text: 'Não há outros profissionais disponíveis para transferência.'
                    });
                    return;
                  }
                  const optionsHtml = profissionaisDisponiveis.
                  map((p) => `<option value="${p.id}">${p.nome}</option>`).
                  join('');
                  const result = await Swal.fire({
                    icon: 'question',
                    title: 'Transferir consultas',
                    html: `
                        <p class="text-sm text-gray-600 mb-3">Transferir <strong>${selectedConsultaIds.length}</strong> consulta${selectedConsultaIds.length > 1 ? 's' : ''} para:</p>
                        <select id="swal-prof-destino" class="w-full p-2 border border-gray-300 rounded-lg text-sm">
                          <option value="">Selecione o profissional...</option>
                          ${optionsHtml}
                        </select>
                      `,
                    showCancelButton: true,
                    confirmButtonText: '🔄 Transferir',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#ea580c',
                    preConfirm: () => {
                      const select = document.getElementById(
                        'swal-prof-destino'
                      ) as HTMLSelectElement;
                      if (!select?.value) {
                        Swal.showValidationMessage(
                          'Selecione um profissional'
                        );
                        return false;
                      }
                      return {
                        profId: select.value,
                        profNome: select.options[select.selectedIndex].text
                      };
                    }
                  });
                  if (!result.isConfirmed || !result.value) return;
                  const { profId, profNome } = result.value;
                  let transferidos = 0;
                  let erros = 0;
                  for (const cId of selectedConsultaIds) {
                    try {
                      const consultaOriginal = consultasDoDia.find(
                        (c) => c.id === cId
                      );
                      const profOriginal =
                      consultaOriginal?.profissional || 'outro profissional';
                      const obsExistente = consultaOriginal?.observacoes || '';
                      const obsTransferencia = `[Transferido de ${profOriginal} para ${profNome} em ${new Date().toLocaleDateString('pt-BR')}]`;
                      const novaObs = obsExistente ?
                      `${obsExistente}\n${obsTransferencia}` :
                      obsTransferencia;
                      await onUpdateConsulta(cId, {
                        profissionalId: profId,
                        profissional: profNome,
                        observacoes: novaObs
                      } as any);
                      transferidos++;
                    } catch (e: any) {
                      erros++;
                      console.error(
                        `Erro ao transferir consulta ${cId}:`,
                        e?.message || e
                      );
                    }
                  }
                  if (transferidos > 0) {
                    await Swal.fire({
                      icon: 'success',
                      title: 'Transferência concluída!',
                      text: `${transferidos} consulta${transferidos > 1 ? 's' : ''} transferida${transferidos > 1 ? 's' : ''} para ${profNome}.${erros > 0 ? ` (${erros} erro${erros > 1 ? 's' : ''})` : ''}`,
                      timer: 3000,
                      showConfirmButton: false
                    });
                  } else {
                    await Swal.fire({
                      icon: 'error',
                      title: 'Erro na transferência',
                      text: `Nenhuma consulta foi transferida. Verifique se você está logado e tente novamente.`
                    });
                  }
                  setSelectedConsultaIds([]);
                  setTransferMode(false);
                }}
                className="px-4 py-1.5 bg-white text-orange-700 text-sm font-bold rounded-lg hover:bg-orange-50 transition-colors shadow-sm">
                
                  🔄 Transferir para...
                </button>
              </div>
            </div>
          }

          {/* Summary Stats */}
          {(() => {
            // ⭐ FIX: Exclui slots "disponível" do totalizador — conta apenas consultas reais
            const consultasReais = consultasDoDia.filter(
              (c) => c.pacienteId !== 'disponivel'
            );
            if (consultasReais.length === 0) return null;
            const agendadas = consultasReais.filter(
              (c) =>
              c.status === 'agendada' ||
              c.status === 'aguardando_confirmacao'
            ).length;
            const confirmadas = consultasReais.filter(
              (c) => c.status === 'confirmada'
            ).length;
            const realizadas = consultasReais.filter(
              (c) =>
              c.status === 'realizada' ||
              c.status === 'atendido' ||
              c.status === 'em_atendimento'
            ).length;
            const canceladas = consultasReais.filter(
              (c) => c.status === 'cancelada'
            ).length;
            const compareceu = consultasReais.filter(
              (c) => c.status === 'compareceu'
            ).length;
            const faltou = consultasReais.filter(
              (c) => c.status === 'faltou'
            ).length;
            const encaixes = consultasReais.filter(
              (c) => c.tipoAgendamento === 'encaixe'
            ).length;
            return (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mt-6 pb-4">
                <Card>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {consultasReais.length}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Total</p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-400">
                      {agendadas}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Agendadas</p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">
                      {confirmadas}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Confirmadas</p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-indigo-600">
                      {realizadas}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Realizadas</p>
                  </div>
                </Card>
                <Card className="border-red-200 bg-red-50/50">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">
                      {canceladas}
                    </p>
                    <p className="text-xs text-red-700 mt-1">Canceladas</p>
                  </div>
                </Card>
                <Card className="border-green-200 bg-green-50/50">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">
                      {compareceu}
                    </p>
                    <p className="text-xs text-green-700 mt-1">Compareceu</p>
                  </div>
                </Card>
                <Card className="border-red-200 bg-red-50/50">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">{faltou}</p>
                    <p className="text-xs text-red-600 mt-1">Faltou</p>
                  </div>
                </Card>
                <Card className="border-orange-200 bg-orange-50/50">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">
                      {encaixes}
                    </p>
                    <p className="text-xs text-orange-700 mt-1 flex items-center justify-center gap-1">
                      <ZapIcon className="w-3 h-3" />
                      Encaixes
                    </p>
                  </div>
                </Card>
              </div>);

          })()}
        </div>
      </div>

      {/* ===== MODAIS (fora do fluxo de scroll) ===== */}
      {pendingWhatsAppSend &&
      (() => {
        console.log(
          '🔍 [WhatsAppConfirmModal Render] pendingWhatsAppSend:',
          pendingWhatsAppSend
        );
        const consulta = consultasDoDia.find(
          (c) => c.id === pendingWhatsAppSend.consultaId
        );
        console.log(
          '📋 [WhatsAppConfirmModal Render] Consulta encontrada:',
          consulta
        );
        const paciente = pendingWhatsAppSend.paciente;
        console.log('👤 [WhatsAppConfirmModal Render] Paciente:', paciente);
        if (!consulta || !paciente) {
          console.error(
            '❌ [WhatsAppConfirmModal Render] Dados incompletos! consulta:',
            consulta,
            'paciente:',
            paciente
          );
          return null;
        }
        const templateCustomizado = whatsappConfig?.mensagemTemplate || '';
        const canalEnvio = pendingWhatsAppSend.canal || 'whatsapp';
        const mensagem =
        canalEnvio === 'sms' ?
        gerarMensagemSms(
          pendingWhatsAppSend.tipo,
          paciente.nome,
          consulta,
          pendingWhatsAppSend.linkConfirmacao
        ) :
        // ⭐ Meta entrega pelo TEMPLATE APROVADO: a prévia vem do modelo
        // daquele aviso, não do template livre do WAHA.
        canalEnvio === 'meta' ?
        gerarMensagemMeta(
          pendingWhatsAppSend.tipo,
          paciente,
          consulta
        ) :
        pendingWhatsAppSend.tipo === 'lembrete' ?
        gerarMensagemLembrete(
          paciente,
          consulta,
          'Clínica Médica',
          templateCustomizado
        ) :
        pendingWhatsAppSend.tipo === 'confirmacao' ?
        gerarMensagemConfirmacao(
          paciente,
          consulta,
          'Clínica Médica',
          templateCustomizado
        ) :
        gerarMensagemCancelamento(
          paciente,
          consulta,
          'Clínica Médica'
        );
        console.log(
          '💬 [WhatsAppConfirmModal Render] Mensagem gerada:',
          mensagem.substring(0, 100) + '...'
        );
        console.log(
          '✅ [WhatsAppConfirmModal Render] Renderizando modal com props completos'
        );
        return (
          <WhatsAppConfirmModal
            isOpen={isWhatsAppConfirmOpen}
            onClose={() => {
              setIsWhatsAppConfirmOpen(false);
              setPendingWhatsAppSend(null);
              setAvisoCanalEnvio(null);
              setWahaFora(false);
            }}
            onConfirm={handleConfirmWhatsAppSend}
            paciente={paciente}
            consulta={consulta}
            mensagem={mensagem}
            canal={canalEnvio}
            smsDisponivel={smsInfo.disponivel}
            // ⭐ O canal aparece sempre que a Meta está ativa. Antes ele era
            // escondido quando faltava o template DESTE aviso — o usuário
            // ativava a Meta e nada surgia na agenda, sem explicação.
            metaDisponivel={metaInfo.disponivel}
            metaSemTemplate={
            !metaInfo.templates?.[pendingWhatsAppSend.tipo]
            }
            avisoCanal={avisoCanalEnvio || undefined}
            wahaDisponivel={!wahaFora}
            onTrocarCanal={trocarCanalEnvio}
            serverUrl={whatsappConfig?.serverUrl || ''}
            sessionName={whatsappConfig?.sessionName || ''}
            clinicaId={clinicaIdEfetivo}
            onUpdatePaciente={async (id, updates) => {
              try {
                const response = await fetch(
                  `${API_BASE_URL}/api/pacientes/${id}`,
                  {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      clinicaId: clinicaIdEfetivo,
                      ...updates
                    })
                  }
                );
                if (!response.ok) {
                  throw new Error('Erro ao atualizar paciente');
                }
                console.log(
                  '✅ [AgendaPage] Paciente atualizado com verificação WhatsApp'
                );
                if (onUpdatePaciente) {
                  await onUpdatePaciente(id, updates);
                }
              } catch (err) {
                console.error(
                  '❌ [AgendaPage] Erro ao atualizar paciente:',
                  err
                );
              }
            }} />);


      })()}

      <ConsultaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingConsulta(undefined);
          setPreFilledHorario(undefined);
          setIsEncaixeMode(false);
          setEncaixeRapidoInfo(null);
          // ⭐ Limpa multi-seleção ao fechar modal
          if (multiSelectMode) {
            setSelectedSlots([]);
            setMultiSelectMode(false);
          }
        }}
        onSave={async (consultaData) => {
          try {
            let dadosFinais = {
              ...consultaData
            };
            if (
            encaixeRapidoInfo &&
            consultaData.tipoAgendamento === 'encaixe')
            {
              const obsExistente = consultaData.observacoes || '';
              dadosFinais = {
                ...consultaData,
                duracao: encaixeRapidoInfo.duracao,
                cor: encaixeRapidoInfo.cor,
                observacoes: obsExistente ?
                `${obsExistente} ${encaixeRapidoInfo.tag}` :
                encaixeRapidoInfo.tag
              };
            }
            if (editingConsulta) {
              onUpdateConsulta(editingConsulta.id, dadosFinais);
              success(
                'Consulta Atualizada!',
                `Consulta de ${consultaData.pacienteNome} foi atualizada.`
              );
            } else if (multiSelectMode && selectedSlots.length > 1) {
              // ⭐ MULTI-SELEÇÃO: Cria uma consulta para cada horário selecionado
              let criados = 0;
              for (const slot of selectedSlots) {
                await onAddConsulta({
                  ...dadosFinais,
                  horario: slot
                });
                criados++;
              }
              success(
                'Consultas Agendadas!',
                `${criados} consultas criadas para ${consultaData.pacienteNome} nos horários: ${selectedSlots.join(', ')}`
              );
              setSelectedSlots([]);
              setMultiSelectMode(false);
              setScrollToHorario(selectedSlots[0]);
            } else {
              await onAddConsulta(dadosFinais);
              success(
                'Consulta Agendada!',
                `Consulta de ${consultaData.pacienteNome} às ${dadosFinais.horario || consultaData.horario} foi agendada.`
              );
              setScrollToHorario(dadosFinais.horario || consultaData.horario);
              // Limpa multi-seleção se estava ativa com 1 slot
              if (multiSelectMode) {
                setSelectedSlots([]);
                setMultiSelectMode(false);
              }
            }
          } catch (err: any) {
            console.error('❌ [AgendaPage] Erro ao salvar consulta:', err);
            toastError(
              'Erro ao Salvar',
              err.message ||
              'Não foi possível salvar a consulta. Tente novamente.'
            );
          } finally {
            // ⭐ FIX: SEMPRE fecha o modal, mesmo se der erro no reload
            setIsModalOpen(false);
            setEditingConsulta(undefined);
            setPreFilledHorario(undefined);
            setIsEncaixeMode(false);
            setEncaixeRapidoInfo(null);
          }
        }}
        pacientes={pacientes}
        consulta={editingConsulta}
        preFilledData={{
          data: formatLocalDate(selectedDate),
          horario: preFilledHorario,
          profissional:
          profissionalIdFiltro !== 'todos' ?
          profissionalNomeFiltro :
          encaixeRapidoInfo?.profissional || undefined,
          profissionalId:
          profissionalIdFiltro !== 'todos' ? profissionalIdFiltro : undefined,
          tipoAgendamento: isEncaixeMode ? 'encaixe' : 'normal'
        }} />
      

      {/* ⭐ NOVO: Modal de Prontuário Completo para Atendimento */}
      {isProntuarioModalOpen && pacienteParaAtendimento &&
      <ProntuarioForm
        isOpen={isProntuarioModalOpen}
        onClose={() => {
          setIsProntuarioModalOpen(false);
          setConsultaEmAtendimento(undefined);
          setPacienteParaAtendimento(undefined);
          setSelectedPaciente(undefined);
        }}
        onSave={handleSalvarProntuarioAtendimento}
        pacientes={pacientes}
        initialPacienteId={pacienteParaAtendimento.id}
        initialPacienteNome={pacienteParaAtendimento.nome}
        onWarning={(msg) => toastError('Atenção', msg)}
        onError={(msg) => toastError('Erro', msg)}
        onNavigateToProntuarios={() => {
          setIsProntuarioModalOpen(false);
          // Salva o contexto para poder voltar
          localStorage.setItem(
            'retornoAgenda',
            JSON.stringify({
              pacienteId: pacienteParaAtendimento.id,
              pacienteNome: pacienteParaAtendimento.nome,
              consultaId: consultaEmAtendimento?.id,
              data: selectedDate.toISOString()
            })
          );
          // Navega para prontuários
          onNavigate?.('prontuarios');
        }} />

      }

      {/* Modal de Atendimento Antigo (mantido para compatibilidade) */}
      {consultaEmAtendimento && selectedPaciente && !isProntuarioModalOpen &&
      <AtendimentoModal
        isOpen={isAtendimentoModalOpen}
        onClose={() => {
          setIsAtendimentoModalOpen(false);
          setConsultaEmAtendimento(undefined);
          setSelectedPaciente(undefined);
        }}
        consulta={consultaEmAtendimento}
        paciente={selectedPaciente}
        onSalvarProntuario={handleSalvarProntuario} />

      }

      {/* Modal de Paciente - APENAS MODAL, NÃO APARECE NA TELA */}
      {isPacienteModalOpen &&
      <PacienteForm
        isOpen={isPacienteModalOpen}
        onClose={() => {
          setIsPacienteModalOpen(false);
          setSelectedPaciente(undefined);
          setPacienteEditStack([]);
        }}
        onSave={handleSavePaciente}
        paciente={selectedPaciente}
        onNavigate={onNavigate}
        onAbrirRelacionado={handleAbrirRelacionado}
        onVoltar={handleVoltarFichaAnterior}
        temVoltar={pacienteEditStack.length > 0} />

      }

      {/* Modal de Foto do WhatsApp */}
      {whatsappPhotoModal.isOpen &&
      <Modal
        isOpen={whatsappPhotoModal.isOpen}
        onClose={() =>
        setWhatsappPhotoModal({
          isOpen: false,
          paciente: null,
          contactInfo: null,
          loading: false
        })
        }
        title="Verificar Contato WhatsApp">
        
          <div className="space-y-4">
            {whatsappPhotoModal.loading ?
          <div className="text-center py-8">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                <p className="text-gray-600">Buscando foto do contato...</p>
              </div> :
          whatsappPhotoModal.contactInfo?.error ?
          <div className="text-center py-8">
                <AlertCircleIcon className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <p className="text-red-900 font-semibold mb-2">
                  Erro ao buscar foto
                </p>
                <p className="text-red-700 text-sm">
                  {whatsappPhotoModal.contactInfo.error}
                </p>
              </div> :
          whatsappPhotoModal.contactInfo ?
          <div className="text-center py-4">
                {whatsappPhotoModal.contactInfo.profilePicUrl ?
            <div>
                    <img
                src={whatsappPhotoModal.contactInfo.profilePicUrl}
                alt={whatsappPhotoModal.paciente?.nome}
                className="w-32 h-32 rounded-full object-cover border-4 border-purple-500 shadow-xl mx-auto mb-4" />
              

                    <p className="text-green-900 font-semibold mb-2">
                      ✅ Foto encontrada!
                    </p>
                  </div> :

            <div>
                    <div className="w-32 h-32 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center shadow-xl mx-auto mb-4">
                      <span className="text-white text-4xl font-bold">
                        {whatsappPhotoModal.paciente?.nome.
                  split(' ').
                  slice(0, 2).
                  map((n) => n[0]).
                  join('').
                  toUpperCase()}
                      </span>
                    </div>
                    <p className="text-amber-900 font-semibold mb-2">
                      📷 Sem foto de perfil
                    </p>
                  </div>
            }
                <p className="text-gray-900 font-semibold text-lg">
                  {whatsappPhotoModal.paciente?.nome}
                </p>
                <p className="text-gray-600">
                  {whatsappPhotoModal.paciente?.telefone}
                </p>
                {whatsappPhotoModal.contactInfo.isRegistered !== undefined &&
            <p
              className={`text-sm mt-2 ${whatsappPhotoModal.contactInfo.isRegistered ? 'text-green-600' : 'text-red-600'}`}>
              
                    {whatsappPhotoModal.contactInfo.isRegistered ?
              '✅ Registrado no WhatsApp' :
              '❌ Não registrado no WhatsApp'}
                  </p>
            }
                {whatsappPhotoModal.contactInfo.info &&
            <p className="text-sm text-blue-600 mt-2">
                    {whatsappPhotoModal.contactInfo.info}
                  </p>
            }
              </div> :
          null}
          </div>
        </Modal>
      }

      {/* ⭐ NOVO: Modal de Motivo de Cancelamento */}
      {cancelamentoModal.isOpen &&
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <XIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Cancelar Consulta
                </h3>
                <p className="text-sm text-gray-500">
                  Informe o motivo do cancelamento
                </p>
              </div>
            </div>

            <div className="mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data do Cancelamento
                  </label>
                  <input
                  type="date"
                  value={cancelamentoModal.dataCancelamento}
                  onChange={(e) =>
                  setCancelamentoModal((prev) => ({
                    ...prev,
                    dataCancelamento: e.target.value
                  }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm" />
                
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora do Cancelamento
                  </label>
                  <input
                  type="time"
                  value={cancelamentoModal.horaCancelamento}
                  onChange={(e) =>
                  setCancelamentoModal((prev) => ({
                    ...prev,
                    horaCancelamento: e.target.value
                  }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm" />
                
                </div>
              </div>

              {(() => {
              const consulta = consultasDoDia.find(
                (c) => c.id === cancelamentoModal.consultaId
              );
              if (
              !consulta ||
              !cancelamentoModal.dataCancelamento ||
              !cancelamentoModal.horaCancelamento)

              return null;
              const dataHoraCancelamento = new Date(
                `${cancelamentoModal.dataCancelamento}T${cancelamentoModal.horaCancelamento}:00`
              );
              const dataHoraConsulta = new Date(
                `${consulta.data}T${consulta.horario}:00`
              );
              const diffHours =
              (dataHoraConsulta.getTime() -
              dataHoraCancelamento.getTime()) / (
              1000 * 60 * 60);
              if (diffHours < politicaCancelamento.prazoHoras) {
                return (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <span className="text-red-600 mt-0.5">⚠️</span>
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          Fora do prazo limite (
                          {politicaCancelamento.prazoHoras}
                          h)
                        </p>
                        <p className="text-xs text-red-600">
                          {politicaCancelamento.valorTaxa > 0 ?
                        `Será cobrada a taxa de cancelamento de ${formatBRL(politicaCancelamento.valorTaxa)}.` :
                        'Será cobrada a taxa de cancelamento.'}
                        </p>
                      </div>
                    </div>);

              }
              return (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">✅</span>
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        Dentro do prazo limite (
                        {politicaCancelamento.prazoHoras}h)
                      </p>
                      <p className="text-xs text-green-600">
                        Sem cobrança de taxa de cancelamento.
                      </p>
                    </div>
                  </div>);

            })()}

              {/* Política de cancelamento (configurável e persistida) */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Prazo limite (horas)
                  </label>
                  <input
                  type="number"
                  min={0}
                  value={politicaCancelamento.prazoHoras}
                  onChange={(e) =>
                  setPoliticaCancelamento((prev) => ({
                    ...prev,
                    prazoHoras: Math.max(0, Number(e.target.value) || 0)
                  }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm" />
                
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Taxa de cancelamento (R$)
                  </label>
                  <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={politicaCancelamento.valorTaxa}
                  onChange={(e) =>
                  setPoliticaCancelamento((prev) => ({
                    ...prev,
                    valorTaxa: Math.max(0, Number(e.target.value) || 0)
                  }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm" />
                
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo do cancelamento <span className="text-red-500">*</span>
                </label>
                <textarea
                value={cancelamentoModal.motivo}
                onChange={(e) =>
                setCancelamentoModal((prev) => ({
                  ...prev,
                  motivo: e.target.value
                }))
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
                placeholder="Ex: Paciente solicitou cancelamento, conflito de horário, etc."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    confirmarCancelamentoComMotivo();
                  }
                }} />
              

                {/* Sugestões rápidas */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                'Paciente solicitou',
                'Conflito de horário',
                'Motivo pessoal',
                'Reagendamento',
                'Não compareceu'].
                map((sugestao) =>
                <button
                  key={sugestao}
                  type="button"
                  onClick={() =>
                  setCancelamentoModal((prev) => ({
                    ...prev,
                    motivo: sugestao
                  }))
                  }
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-red-50 hover:text-red-700 transition-colors">
                  
                      {sugestao}
                    </button>
                )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
              type="button"
              onClick={() =>
              setCancelamentoModal({
                isOpen: false,
                consultaId: '',
                motivo: '',
                dataCancelamento: '',
                horaCancelamento: ''
              })
              }
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              
                Voltar
              </button>
              <button
              type="button"
              onClick={confirmarCancelamentoComMotivo}
              disabled={
              !cancelamentoModal.motivo.trim() ||
              !cancelamentoModal.dataCancelamento ||
              !cancelamentoModal.horaCancelamento
              }
              className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              
                Cancelar Consulta
              </button>
            </div>
          </div>
        </div>
      }

      {/* ⭐⭐⭐ v10.9.9: ALERTA DE EVENTOS DO PACIENTE ⭐⭐⭐ */}
      {chegadaAlerta.isOpen &&
      (() => {
        const isConfirmacao = chegadaAlerta.horaChegada === '__confirmacao__';
        const isCancelamento =
        chegadaAlerta.horaChegada === '__cancelamento__';
        const isChegada = !isConfirmacao && !isCancelamento;
        const borderColor = isConfirmacao ?
        'border-blue-500' :
        isCancelamento ?
        'border-red-500' :
        'border-green-500';
        const gradientColor = isConfirmacao ?
        'from-blue-400 via-blue-500 to-blue-400' :
        isCancelamento ?
        'from-red-400 via-red-500 to-red-400' :
        'from-green-400 via-green-500 to-green-400';
        const iconBg = isConfirmacao ?
        'bg-blue-100' :
        isCancelamento ?
        'bg-red-100' :
        'bg-green-100';
        const iconColor = isConfirmacao ?
        'text-blue-600' :
        isCancelamento ?
        'text-red-600' :
        'text-green-600';
        const titulo = isConfirmacao ?
        '✅ Consulta Confirmada!' :
        isCancelamento ?
        '❌ Consulta Cancelada!' :
        '🏥 Paciente Chegou!';
        const cardBg = isConfirmacao ?
        'bg-blue-50 border-blue-200' :
        isCancelamento ?
        'bg-red-50 border-red-200' :
        'bg-green-50 border-green-200';
        const textColor = isConfirmacao ?
        'text-blue-900' :
        isCancelamento ?
        'text-red-900' :
        'text-green-900';
        const textColor2 = isConfirmacao ?
        'text-blue-800' :
        isCancelamento ?
        'text-red-800' :
        'text-green-800';
        const textColor3 = isConfirmacao ?
        'text-blue-700' :
        isCancelamento ?
        'text-red-700' :
        'text-green-700';
        const btnBg = isConfirmacao ?
        'bg-blue-600 hover:bg-blue-700' :
        isCancelamento ?
        'bg-red-600 hover:bg-red-700' :
        'bg-green-600 hover:bg-green-700';
        const dividerColor = isConfirmacao ?
        'bg-blue-500' :
        isCancelamento ?
        'bg-red-500' :
        'bg-green-500';
        const autoCloseTime = isChegada ? 30 : 15;
        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
              <div
              className={`bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full mx-4 border-4 ${borderColor} relative overflow-hidden`}>
              
                <div
                className={`absolute top-0 left-0 right-0 h-2 bg-gradient-to-r ${gradientColor} animate-pulse`} />
              

                <button
                onClick={() =>
                setChegadaAlerta((prev) => ({
                  ...prev,
                  isOpen: false
                }))
                }
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors">
                
                  <XIcon className="w-5 h-5 text-gray-400" />
                </button>
                <div className="text-center mb-6">
                  <div
                  className={`w-24 h-24 ${iconBg} rounded-full flex items-center justify-center mx-auto mb-4 ${isChegada ? 'animate-bounce' : ''}`}>
                  
                    {isCancelamento ?
                  <XIcon className={`w-12 h-12 ${iconColor}`} /> :

                  <UserCheckIcon className={`w-12 h-12 ${iconColor}`} />
                  }
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-1">
                    {titulo}
                  </h2>
                  <div
                  className={`w-16 h-1 ${dividerColor} rounded-full mx-auto`} />
                
                </div>
                <div className={`${cardBg} rounded-2xl p-6 mb-6 border`}>
                  <p
                  className={`text-2xl font-bold ${textColor} text-center mb-3`}>
                  
                    {chegadaAlerta.pacienteNome}
                  </p>
                  <div className="flex items-center justify-center gap-6 text-sm">
                    {isChegada &&
                  <div className={`flex items-center gap-2 ${textColor2}`}>
                        <ClockIcon className="w-5 h-5" />
                        <span className="font-semibold text-lg">
                          {formatarHoraChegada(chegadaAlerta.horaChegada)}
                        </span>
                      </div>
                  }
                    {chegadaAlerta.horario &&
                  <div className={`flex items-center gap-2 ${textColor3}`}>
                        <CalendarIcon className="w-5 h-5" />
                        <span>
                          Consulta às <strong>{chegadaAlerta.horario}</strong>
                        </span>
                      </div>
                  }
                  </div>
                  {chegadaAlerta.profissional &&
                <p className={`text-center ${textColor3} mt-2`}>
                      👨‍⚕️ Dr(a). {chegadaAlerta.profissional}
                    </p>
                }
                </div>
                <div className="flex gap-3">
                  <button
                  onClick={() =>
                  setChegadaAlerta((prev) => ({
                    ...prev,
                    isOpen: false
                  }))
                  }
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium">
                  
                    Fechar
                  </button>
                  {isChegada &&
                <button
                  onClick={() => {
                    setChegadaAlerta((prev) => ({
                      ...prev,
                      isOpen: false
                    }));
                    onNavigate?.('fila_atendimento');
                  }}
                  className={`flex-1 px-6 py-3 ${btnBg} text-white rounded-xl transition-colors font-semibold flex items-center justify-center gap-2`}>
                  
                      <ListIcon className="w-5 h-5" />
                      Ver Fila
                    </button>
                }
                </div>
                <p className="text-center text-xs text-gray-400 mt-4">
                  Este alerta fecha automaticamente em {autoCloseTime} segundos
                </p>
              </div>
            </div>);

      })()}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>);

}