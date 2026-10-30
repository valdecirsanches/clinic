import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  createElement,
  Component } from
'react';
import {
  PacienteHeader,
  PacienteHeaderData } from
'../components/prontuario/PacienteHeader';
import { ConsultaOnlineModal } from '../components/prontuario/ConsultaOnlineModal';
import {
  ProntuarioTabs,
  ProntuarioStep } from
'../components/prontuario/ProntuarioTabs';
import { ProntuarioSidebar } from '../components/prontuario/ProntuarioSidebar';
import { resolverEspecialidade } from '../utils/especialidadeHelper';
import { definirContextoProntuario } from '../utils/ditadoProntuario';
import { AnamneseEtapa } from '../components/prontuario/etapas/AnamneseEtapa';
import { ResumoEtapa } from '../components/prontuario/etapas/ResumoEtapa';
import { ResumoAtendimentoEtapa } from '../components/prontuario/etapas/ResumoAtendimentoEtapa';
import { ExameFisicoEtapa } from '../components/prontuario/etapas/ExameFisicoEtapa';
import { DiagnosticoEtapa } from '../components/prontuario/etapas/DiagnosticoEtapa';
import { EvolucaoEtapa } from '../components/prontuario/etapas/EvolucaoEtapa';
import { ExamesEtapa } from '../components/prontuario/etapas/ExamesEtapa';
import { PrescricoesEtapa } from '../components/prontuario/etapas/PrescricoesEtapa';
import { MemedEtapa } from '../components/prontuario/etapas/MemedEtapa';
import { RelatoriosEtapa } from '../components/prontuario/etapas/RelatoriosEtapa';
import { AtestadoEtapa } from '../components/prontuario/etapas/AtestadoEtapa';
import { ProcedimentoEtapa } from '../components/prontuario/etapas/ProcedimentoEtapa';
import { AvaliacaoEtapa } from '../components/prontuario/etapas/AvaliacaoEtapa';
import { OdontogramaEtapa } from '../components/prontuario/etapas/OdontogramaEtapa';
import { DocumentosManager } from '../components/DocumentosManager';
import { PacienteForm } from '../components/PacienteForm';
import { UsuarioForm } from '../components/UsuarioForm';
import { SolicitarAssinaturaButton } from '../components/SolicitarAssinaturaButton';
import {
  ImageIcon,
  Loader2Icon,
  ShieldCheckIcon,
  LockIcon,
  PenToolIcon,
  AlertTriangleIcon,
  VideoIcon,
  SendIcon,
  XIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';
import { Consulta, Clinica } from '../types';
import { gerarLinkSalaVideo } from '../utils/videoConsulta';
import { MemedPrescricaoModal, type PrescricaoMemedInfo } from '../components/MemedPrescricaoModal';
import { imprimirProntuario } from '../components/prontuario/impressaoProntuario';
import { reenviarConviteConsultaOnline } from '../components/prontuario/conviteConsultaOnline';
import { useRascunhoProntuario, conteudoVazio } from '../hooks/useRascunhoProntuario';
import { registrarGuardaSaida } from '../utils/guardaSaida';
import { abasVisiveis } from '../components/prontuario/ProntuarioTabs';
import {
  EstadoSalvamento,
  AssinaturaChip,
  AvisoRascunho,
  nomeEtapa } from
'../components/prontuario/BarraStatusProntuario';
import { MemedConfig, MemedProfissional } from '../types/memed';
import { registrarAuditoria, autorDaSessao } from '../utils/auditLog';
import { useConfiguracoesGlobais } from '../hooks/useConfiguracoesGlobais';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { ToastContainer } from '../components/ToastContainer';
interface AnamneseData {
  queixaPrincipal: string;
  historiaQueixa: string;
  historicoDoencas: string;
  alergias: string;
  medicamentosEmUso: string;
  historicoFamiliar: string;
  habitosVida: string;
}
interface ExameFisicoData {
  altura: string;
  peso: string;
  imc: string;
  pressaoArterial: string;
  pulso: string;
  temperatura: string;
  saturacaoO2: string;
  frequenciaRespiratoria: string;
  glicemia: string;
  observacoesGerais: string;
}
interface DiagnosticoItem {
  codigo: string;
  descricao: string;
}
interface DiagnosticoData {
  diagnosticoPrincipal: DiagnosticoItem | null;
  outrosDiagnosticos: DiagnosticoItem[];
  observacoes: string;
}
interface EvolucaoData {
  evolucaoAtual: string;
}
interface PrescricoesData {
  prescricoes: string;
}
interface ExamesData {
  profissionalId: string;
  descricao: string;
  pedido: string;
  justificativa: string;
  cid10: string;
  /** Quando informado, ATUALIZA este registro em vez de criar um novo. */
  registroId?: string;
}
interface RelatorioData {
  titulo: string;
  tipo: string;
  destinatario: string;
  data: string;
  conteudo: string;
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
export interface ProntuarioAtendimentoPageProps {
  onNavigate?: (page: string) => void;
  activeStep?: ProntuarioStep;
  onStepChange?: (step: ProntuarioStep) => void;
  pacienteId?: string;
  consultaId?: string;
  clinicaId?: string;
  consulta?: Consulta;
  // ⭐ FASE 3: permite encerrar o atendimento na fila ao assinar
  onUpdateConsulta?: (id: string, updates: Partial<Consulta>) => void;
}
export function ProntuarioAtendimentoPage({
  onNavigate,
  activeStep = 'resumo_atendimento',
  onStepChange,
  pacienteId,
  consultaId: consultaIdProp,
  clinicaId,
  consulta,
  onUpdateConsulta
}: ProntuarioAtendimentoPageProps) {
  const [localStep, setLocalStep] = useState<ProntuarioStep>(activeStep);
  const currentStep = onStepChange ? activeStep : localStep;
  const handleStepChange = onStepChange || setLocalStep;
  const [paciente, setPaciente] = useState<PacienteHeaderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [tempoAtendimento, setTempoAtendimento] = useState('00:00');
  const [inicioAtendimento, setInicioAtendimento] = useState<Date | null>(null);
  const [tempoPausado, setTempoPausado] = useState<number>(0);
  const [timerStatus, setTimerStatus] = useState<
    'idle' | 'running' | 'paused' | 'stopped'>(
    'idle');
  const { confirm } = useDialog();
  const [prontuarioId, setProntuarioId] = useState<string | null>(null);
  // ⭐ Consulta online — sala de vídeo embutida (stay-on-top) dentro do app.
  const [videoModalAberto, setVideoModalAberto] = useState(false);
  const [videoModalLink, setVideoModalLink] = useState('');
  // ⭐ NOVO: antes de reiniciar/reconectar a consulta online, perguntamos se o
  // profissional quer REENVIAR o convite (link) ao paciente — às vezes o paciente
  // já não tem mais o link. `reconexaoPendenteRef` guarda a ação de reconexão a
  // ser executada após a escolha do usuário no modal de confirmação.
  const [confirmarReenvioAberto, setConfirmarReenvioAberto] = useState(false);
  const [reenviandoConvite, setReenviandoConvite] = useState(false);
  const reconexaoPendenteRef = useRef<(() => void) | null>(null);
  // Guarda o id da consulta cuja sala já foi aberta automaticamente, para não
  // reabrir a cada re-render (a página re-renderiza a cada segundo pelo timer).
  const videoAutoAbertoRef = useRef<string | null>(null);
  // ⭐ Ref que espelha o NOME do profissional ativo, para uso dentro dos
  // callbacks/efeitos de vídeo SEM criar dependência (e sem ler `profissionalAtivo`
  // antes da sua inicialização — evita "Cannot access 'profissionalAtivo' before
  // initialization", já que o useMemo dele é declarado mais abaixo neste componente).
  const profissionalAtivoNomeRef = useRef<string>('');
  // Inicializa o estado do timer baseado na consulta
  useEffect(() => {
    if (!consulta) return;
    const status =
    (consulta as any).statusAtendimento || (consulta as any).status;
    const inicioRaw = (consulta as any).horaInicioAtendimento;
    if (status === 'finalizado') {
      setTimerStatus('stopped');
      if (inicioRaw) {
        const inicio = new Date(inicioRaw);
        const fimRaw = (consulta as any).horaFimAtendimento;
        const fim = fimRaw ? new Date(fimRaw) : new Date();
        if (!isNaN(inicio.getTime()) && !isNaN(fim.getTime())) {
          const diff = Math.floor((fim.getTime() - inicio.getTime()) / 1000);
          const horas = Math.floor(diff / 3600);
          const minutos = Math.floor(diff % 3600 / 60);
          const segundos = diff % 60;
          if (horas > 0) {
            setTempoAtendimento(
              `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`
            );
          } else {
            setTempoAtendimento(
              `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`
            );
          }
        }
      }
    } else if (status === 'em_atendimento') {
      setTimerStatus('running');
      if (inicioRaw) {
        const inicio = new Date(inicioRaw);
        if (!isNaN(inicio.getTime())) {
          setInicioAtendimento(inicio);
        } else {
          setInicioAtendimento(new Date());
        }
      } else {
        setInicioAtendimento(new Date());
      }
    } else if (status === 'pausado') {
      // ⭐ FIX: ao voltar a um atendimento PAUSADO (comando dado na fila/prontuário),
      // restaura o estado pausado com o tempo já decorrido — não reinicia como idle.
      setTimerStatus('paused');
      const pausaRaw = (consulta as any).horaPausaAtendimento;
      if (inicioRaw) {
        const inicio = new Date(inicioRaw);
        const pausa = pausaRaw ? new Date(pausaRaw) : new Date();
        if (!isNaN(inicio.getTime()) && !isNaN(pausa.getTime())) {
          const diff = Math.max(
            0,
            Math.floor((pausa.getTime() - inicio.getTime()) / 1000)
          );
          setTempoPausado(diff);
          const minutos = Math.floor(diff % 3600 / 60);
          const segundos = diff % 60;
          const horas = Math.floor(diff / 3600);
          setTempoAtendimento(
            horas > 0 ?
            `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}` :
            `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`
          );
        }
      }
      // Enquanto pausado não há relógio correndo — inicioAtendimento fica nulo
      // e a retomada (handleStartTimer) reancora o cronômetro.
      setInicioAtendimento(null);
    } else {
      setTimerStatus('idle');
      setInicioAtendimento(null);
      setTempoAtendimento('00:00');
    }
  }, [consulta]);
  // ⭐ Flag para saber se o prontuário já foi carregado (evita flash do select de profissional)
  const [prontuarioJaCarregado, setProntuarioJaCarregado] = useState(false);
  // ⭐ A consulta É o atendimento — consultaId é a referência central
  // ⭐ Permite "Retomar" um atendimento do histórico: o id selecionado tem
  // prioridade sobre a consulta recebida via prop, carregando os dados clínicos
  // daquele atendimento.
  const [consultaIdSelecionada, setConsultaIdSelecionada] = useState<string>('');
  // ⭐ Data do atendimento REALMENTE aberto — fonte de verdade para o cabeçalho.
  // Acompanha a consulta recebida por prop (fila/agenda) E o atendimento que o
  // usuário escolhe no histórico, para que o header nunca mostre data de outro.
  const [dataAtendimentoAtivo, setDataAtendimentoAtivo] = useState<
    string | undefined>(
    consulta?.data);
  // ⭐ Nome do profissional gravado no atendimento ativo (fonte explícita e
  // confiável para o cabeçalho, vinda direto do registro do atendimento).
  // Acompanha a consulta da agenda/fila E o atendimento escolhido no histórico.
  const [nomeProfissionalAtivo, setNomeProfissionalAtivo] = useState<
    string | undefined>(
    consulta?.profissional);
  const consultaIdAtual =
  consultaIdSelecionada || consulta?.id || consultaIdProp || '';
  // ⭐⭐⭐ FONTE ÚNICA DE VERDADE para gravação: retorna null quando NÃO há uma
  // consulta REAL. Os handlers de save usam SEMPRE consultaIdReal e abortam se
  // for null — isso elimina os consultaIds fantasmas (`consulta_<timestamp>`)
  // que faziam os registros ficarem órfãos e o prontuário "perder" os dados.
  const consultaIdReal = useMemo(
    () =>
    consultaIdAtual && consultaIdAtual !== 'NOVO' ? consultaIdAtual : null,
    [consultaIdAtual]
  );
  // ⭐ Quando a consulta chega por prop (fila/agenda) e nenhum atendimento foi
  // escolhido manualmente no histórico, a data ativa segue a data da consulta.
  useEffect(() => {
    if (!consultaIdSelecionada && consulta?.data) {
      setDataAtendimentoAtivo(consulta.data);
    }
    if (!consultaIdSelecionada && consulta?.profissional) {
      setNomeProfissionalAtivo(consulta.profissional);
    }
  }, [consulta?.data, consulta?.profissional, consultaIdSelecionada]);
  // ⭐⭐⭐ FIX: Usuário logado vem da SESSÃO REAL (localStorage.sessao), que é a
  // fonte de verdade usada em TODO o app (hooks/useAuth). O contexts/AuthContext
  // depende de auth_token + /api/auth/me, que NÃO é o fluxo de login usado —
  // por isso o médico logado não era reconhecido dentro do prontuário (save
  // bloqueado e o select de profissional aparecia sem lógica). Lemos direto da
  // sessão e re-sincronizamos quando ela muda (troca de clínica, edição de
  // perfil ou login em outra aba).
  const lerUsuarioDaSessao = (): {
    id: string;
    nome: string;
    email?: string;
    tipo?: string;
    operadoraId?: string;
    clinicaId?: string;
  } | null => {
    try {
      const s = localStorage.getItem('sessao');
      if (!s) return null;
      const parsed = JSON.parse(s);
      return parsed?.usuario || null;
    } catch {
      return null;
    }
  };
  const [usuarioLogado, setUsuarioLogado] = useState(lerUsuarioDaSessao);
  useEffect(() => {
    const sync = () => setUsuarioLogado(lerUsuarioDaSessao());
    window.addEventListener('sessao-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('sessao-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  // ⭐ Toasts para feedback visível de falha/sucesso de salvamento (Fase 1)
  const {
    toasts,
    removeToast,
    success: toastSuccess,
    error: toastError,
    warning: toastWarning
  } = useToast();
  // ⭐ Assinatura vem da consulta
  const [consultaAssinada, setConsultaAssinada] = useState(false);
  // ⭐ RASCUNHO AUTOMÁTICO: o que foi digitado e ainda não salvo fica guardado
  // neste computador (por clínica + paciente + atendimento) até o servidor
  // confirmar o salvamento. Ver hooks/useRascunhoProntuario.
  const pacienteIdRascunho = consulta?.pacienteId || pacienteId || '';
  const chaveRascunho =
  clinicaId && pacienteIdRascunho && !consultaAssinada ?
  `${clinicaId}:${pacienteIdRascunho}:${consultaIdAtual || 'novo'}` :
  null;
  const rascunho = useRascunhoProntuario(chaveRascunho);
  // Prescrição e Evolução guardam o texto dentro da própria etapa; a página
  // passa a segurá-lo para não sumir ao trocar de aba.
  const [rascunhoPrescricao, setRascunhoPrescricao] = useState<any>(null);
  const [rascunhoEvolucao, setRascunhoEvolucao] = useState('');
  const [versaoRestauro, setVersaoRestauro] = useState(0);
  useEffect(() => {
    setRascunhoPrescricao(null);
    setRascunhoEvolucao('');
  }, [chaveRascunho]);
  const naoSalvo = (etapa: string) => {
    const e = rascunho.estados[etapa]?.estado;
    return e === 'alterado' || e === 'erro';
  };
  const alterarEtapa = rascunho.alterar;
  // Sair do prontuário pelo menu com algo não salvo: o App pergunta antes.
  useEffect(
    () =>
    registrarGuardaSaida(() =>
    rascunho.naoSalvas.length ?
    `Há alterações não salvas em: ${rascunho.naoSalvas.map(nomeEtapa).join(', ')}.\n\n` +
    'O texto fica guardado como rascunho neste computador e será oferecido quando você reabrir este atendimento.\n\n' +
    'Sair mesmo assim?' :
    null
    ),
    [rascunho.naoSalvas]
  );
  const [dataAssinatura, setDataAssinatura] = useState<string | null>(null);
  // IDs das tabelas clínicas separadas
  const [anamneseId, setAnamneseId] = useState<string | null>(null);
  const [evolucaoId, setEvolucaoId] = useState<string | null>(null);
  const [exameFisicoId, setExameFisicoId] = useState<string | null>(null);
  const [diagnosticoId, setDiagnosticoId] = useState<string | null>(null);
  const [examesSolicitadosId, setExamesSolicitadosId] = useState<string | null>(
    null
  );
  // ⭐ FIX: Ref que espelha examesSolicitadosId para evitar stale closure no handleSaveExames
  const examesSolicitadosIdRef = useRef<string | null>(null);
  // Mantém ref sincronizado com state
  useEffect(() => {
    examesSolicitadosIdRef.current = examesSolicitadosId;
  }, [examesSolicitadosId]);
  const [prescricaoId, setPrescricaoId] = useState<string | null>(null);
  const [relatorioId, setRelatorioId] = useState<string | null>(null);
  const [profissionalIdDoExame, setProfissionalIdDoExame] = useState<string>('');
  const [examesHistorico, setExamesHistorico] = useState<any[]>([]);
  const [prescricoesHistorico, setPrescricoesHistorico] = useState<any[]>([]);
  const [relatoriosHistorico, setRelatoriosHistorico] = useState<any[]>([]);
  const [atestadosHistorico, setAtestadosHistorico] = useState<any[]>([]);
  // States for etapas data
  const [anamneseData, setAnamneseData] = useState<AnamneseData | null>(null);
  const [exameFisicoData, setExameFisicoData] =
  useState<ExameFisicoData | null>(null);
  const [diagnosticoData, setDiagnosticoData] =
  useState<DiagnosticoData | null>(null);
  const [evolucaoData, setEvolucaoData] = useState<EvolucaoData | null>(null);
  const [prescricoesData, setPrescricoesData] =
  useState<PrescricoesData | null>(null);
  const [examesData, setExamesData] = useState<ExamesData | null>(null);
  const [relatoriosData, setRelatoriosData] = useState<RelatorioData | null>(
    null
  );
  const [atestadoData, setAtestadoData] = useState<AtestadoData | null>(null);
  const [atestadoId, setAtestadoId] = useState<string | null>(null);
  const [odontogramaData, setOdontogramaData] = useState<Record<
    string,
    any> |
  null>(null);
  // ⭐ Carrega odontograma da consulta (campo odontograma é JSON string)
  useEffect(() => {
    if (!consulta) return;
    const raw = (consulta as any).odontograma;
    if (!raw) return;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (
      parsed &&
      typeof parsed === 'object' &&
      Object.keys(parsed).length > 0)
      {
        setOdontogramaData(parsed);
      }
    } catch {

      // ignore parse errors
    }}, [consulta]);
  const [resumoRefreshKey, setResumoRefreshKey] = useState(0);
  // ⭐ NOVO: Dados do profissional da consulta (para impressão correta do header)
  const [profissionalDaConsulta, setProfissionalDaConsulta] = useState<{
    id: string;
    nome: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
    titulo?: string;
    cabecalhoRelatorio?: string;
    rqes?: any;
  } | null>(null);
  // ⭐ NOVO: Último profissional do histórico de atendimentos (fallback para impressão)
  const [ultimoProfissional, setUltimoProfissional] = useState<{
    id: string;
    nome: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
    titulo?: string;
    cabecalhoRelatorio?: string;
    rqes?: any;
  } | null>(null);
  // ⭐ NOVO: Lista de profissionais disponíveis na clínica (para select quando sem profissional)
  const [profissionaisDisponiveis, setProfissionaisDisponiveis] = useState<
    Array<{
      id: string;
      nome: string;
      tipo: string;
      crm?: string;
      uf?: string;
      titulo?: string;
      cabecalhoRelatorio?: string;
    }>>(
    []);
  const [salvandoProfissional, setSalvandoProfissional] = useState(false);
  // ⭐ Ref que espelha resolverProfissionalParaSave para uso dentro de garantirConsulta
  // (definido mais abaixo) sem criar dependência circular de hooks.
  const resolverProfissionalParaSaveRef = useRef<
    (() => {
      profissionalId: string;
      profissional: string;
    } | null) |
    null>(
    null);
  // ⭐ Guard contra criação duplicada de consulta quando dois saves disparam
  // quase ao mesmo tempo antes do re-render propagar o novo consultaId.
  const criandoConsultaRef = useRef<Promise<string | null> | null>(null);
  // ⭐ NOVO: Profissional Responsável do cadastro do paciente (fixo, não muda por atendimento)
  const [profissionalResponsavel, setProfissionalResponsavel] = useState<{
    nome: string;
    crm?: string;
    uf?: string;
    tipo?: string;
  } | null>(null);
  // ⭐ Modais de cadastro (paciente e profissional)
  const [showPacienteModal, setShowPacienteModal] = useState(false);
  const [pacienteParaEditar, setPacienteParaEditar] = useState<any>(null);
  // ⭐ Pilha de navegação entre titular e dependente dentro da ficha
  const [pacienteEditStack, setPacienteEditStack] = useState<any[]>([]);
  const [showProfissionalModal, setShowProfissionalModal] = useState(false);
  const [profissionalParaEditar, setProfissionalParaEditar] =
  useState<any>(null);
  const [clinicasParaForm, setClinicasParaForm] = useState<Clinica[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => {
    try {
      const s = localStorage.getItem('sessao');
      return s ? JSON.parse(s).usuario?.tipo === 'super_admin' : false;
    } catch {
      return false;
    }
  });
  // ⭐ Inicializa clinicaAtualId SINCRONAMENTE (necessário para hooks com chave per-clinic)
  const [clinicaAtualId, setClinicaAtualId] = useState<string>(() => {
    try {
      const s = localStorage.getItem('sessao');
      return s ? JSON.parse(s).clinicaAtual?.id || '' : '';
    } catch {
      return '';
    }
  });
  // ⭐ Memed
  const [showMemedModal, setShowMemedModal] = useState(false);
  const [memedConfig, setMemedConfig] = useState<MemedConfig | null>(null);
  const [memedProfissional, setMemedProfissional] =
  useState<MemedProfissional | null>(null);
  // ⭐ Configuração da aba Procedimento (per-clinic)
  const procedimentoConfig = useConfiguracoesGlobais(
    clinicaAtualId ?
    `procedimento_config_${clinicaAtualId}` :
    'procedimento_config_NONE',
    {
      habilitado: false
    }
  );
  // ⭐ Configuração da aba Avaliação (per-clinic)
  const avaliacaoConfig = useConfiguracoesGlobais(
    clinicaAtualId ?
    `avaliacao_config_${clinicaAtualId}` :
    'avaliacao_config_NONE',
    {
      habilitado: false
    }
  );
  // ⭐ Carrega config e profissional Memed
  // Tenta: 1) profissional da consulta, 2) usuário logado
  // Depende só do id RESOLVIDO: antes rodava duas vezes (consulta.profissionalId
  // e depois profissionalDaConsulta.id, o mesmo profissional).
  const profIdMemed = consulta?.profissionalId || profissionalDaConsulta?.id || '';
  // Config da Memed: uma vez ao abrir (sempre do servidor — sem cópia local:
  // antes a cópia guardava as chaves da Memed no navegador e nunca atualizava).
  useEffect(() => {
    try {
      localStorage.removeItem('memed_config');
    } catch {}
    fetch(`${API_BASE_URL}/api/configuracoes-globais/memed_config`).
    then((res) => res.ok ? res.json() : null).
    then((data) => {
      if (data?.valor) setMemedConfig(data.valor);
    }).
    catch(() => {});
  }, []);
  useEffect(() => {
    const carregarMemedProfissional = async (userId: string) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/memed-profissionais/usuario/${userId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.token) {
            setMemedProfissional({
              nome: `${data.nome || ''} ${data.sobrenome || ''}`.trim(),
              crm: data.board_number || '',
              uf: data.board_state || '',
              titulo: (profissionalDaConsulta as any)?.titulo || '',
              token: data.token
            });
            return true;
          }
        }
      } catch {}
      return false;
    };
    const init = async () => {
      try {
        const sessao = localStorage.getItem('sessao');
        if (!sessao) return;
        const parsed = JSON.parse(sessao);
        const usuarioId = parsed.usuario?.id;
        // ⭐ 1) Tenta pelo profissional da consulta (ex: Dr. Antonio)
        const profId = consulta?.profissionalId || profissionalDaConsulta?.id;
        let found = false;
        if (profId) {
          found = await carregarMemedProfissional(profId);
        }
        // ⭐ FIX: REMOVIDO fallback para usuário logado
        // O Memed deve usar APENAS o profissional da consulta, nunca o logado (que pode ser atendente)
        if (!found) {
          console.log(
            '⚠️ [Memed] Profissional da consulta não tem Memed configurado. Não usa fallback do logado.'
          );
        }
      } catch {}
    };
    init();
  }, [profIdMemed]);
  const handleAbrirMemed = useCallback(() => {
    console.log('🔵 [Memed] handleAbrirMemed chamado');
    console.log('🔵 [Memed] memedConfig:', JSON.stringify(memedConfig));
    console.log(
      '🔵 [Memed] memedProfissional:',
      memedProfissional ?
      `${memedProfissional.nome} (token: ${memedProfissional.token ? 'SIM' : 'NÃO'})` :
      'null'
    );
    console.log('🔵 [Memed] paciente:', paciente ? paciente.nome : 'null');
    if (!memedConfig) {
      toastWarning(
        'Memed não configurado',
        'Vá em Configurações Globais e configure o Memed (API Key e Secret Key).'
      );
      return;
    }
    if (!memedConfig.ativo) {
      toastWarning(
        'Memed desativado',
        'Vá em Configurações Globais e ative o Memed.'
      );
      return;
    }
    if (!memedProfissional?.token) {
      toastWarning(
        'Profissional sem token',
        'Vá em Menu → Profissionais Memed e cadastre o profissional.'
      );
      return;
    }
    if (!paciente) {
      toastWarning(
        'Nenhum paciente selecionado',
        'Selecione um paciente para prescrever.'
      );
      return;
    }
    console.log('✅ [Memed] Abrindo modal...');
    setShowMemedModal(true);
  }, [memedConfig, memedProfissional, paciente]);
  // ⭐ Receita feita na Memed vai DIRETO para o histórico de prescrições, com
  // a lista de medicamentos. Antes só um texto era colado no campo e a
  // receita se perdia se o profissional não clicasse em Salvar.
  const salvarPrescricaoRef = useRef<((d: any) => Promise<unknown>) | undefined>(undefined);
  const alterarEtapaRef = useRef<(etapa: string, dados: unknown) => void>(() => {});
  const handleMemedPrescricaoCriada = useCallback(
    async (prescricaoId: string, pdfUrl: string, info?: PrescricaoMemedInfo) => {
      setShowMemedModal(false);
      const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
      const medicamentos = (info?.medicamentos || []).map((m, i) => ({
        id: `memed-${prescricaoId || Date.now()}-${i}`,
        nome: m.nome,
        dosagem: '',
        quantidade: m.quantidade,
        unidade: '',
        posologia: m.posologia,
        tipo: 'medicamento' as const
      }));
      const dados = {
        controleEspecial: false,
        data: new Date().toISOString().split('T')[0],
        descricao:
        `<p><strong>Receita digital Memed</strong>${prescricaoId ? ` nº ${escapar(prescricaoId)}` : ''}</p>` + (
        pdfUrl ? `<p><a href="${escapar(pdfUrl)}" target="_blank" rel="noopener noreferrer">Abrir PDF da receita</a></p>` : ''),
        generico: '',
        medicamentos
      };
      try {
        if (!salvarPrescricaoRef.current) throw new Error('Prescrição indisponível neste atendimento.');
        await salvarPrescricaoRef.current(dados);
        toastSuccess(
          'Receita da Memed salva',
          medicamentos.length ?
          `${medicamentos.length} medicamento(s) registrados no histórico de prescrições.` :
          'Registrada no histórico de prescrições.'
        );
      } catch (err: any) {
        // Não perde a receita: fica na aba Prescrições como rascunho
        setRascunhoPrescricao(dados);
        alterarEtapaRef.current('prescricoes', dados);
        toastError(
          'Receita da Memed não foi salva',
          'Ela está na aba Prescrições. Clique em Salvar para tentar de novo.'
        );
      }
    },
    [toastSuccess, toastError]
  );
  // ⭐ Busca consulta direto da API quando profissionalId não veio no objeto
  useEffect(() => {
    const buscarConsultaCompleta = async () => {
      if (profissionalDaConsulta) return;
      if (consulta?.profissionalId) {
        console.log(
          '✅ [Prontuário] consulta.profissionalId já presente:',
          consulta.profissionalId
        );
        return;
      }
      const idConsulta = consulta?.id || consultaIdProp;
      if (!idConsulta || !clinicaId) return;
      console.log(
        '⚠️ [Prontuário] consulta sem profissionalId, buscando da API...',
        {
          consultaId: idConsulta,
          profissional: consulta?.profissional || 'N/A'
        }
      );
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&pacienteId=${consulta?.pacienteId || ''}&limit=150`
        );
        if (resp.ok) {
          const todasConsultas = await resp.json();
          const consultaCompleta = todasConsultas.find(
            (c: any) => c.id === idConsulta
          );
          if (consultaCompleta?.profissionalId) {
            console.log(
              '📋 [Prontuário] profissionalId encontrado na API:',
              consultaCompleta.profissionalId
            );
            // Busca direto no banco global via GET /api/usuarios/:id
            try {
              const respProf = await fetch(
                `${API_BASE_URL}/api/usuarios/${consultaCompleta.profissionalId}`
              );
              if (respProf.ok) {
                const prof = await respProf.json();
                if (prof.tipo === 'medico' || prof.tipo === 'dentista') {
                  setProfissionalDaConsulta({
                    id: prof.id,
                    nome: prof.nome || '',
                    crm: prof.crm || '',
                    uf: prof.uf || '',
                    tipo: prof.tipo || '',
                    especialidade: '',
                    especialidades: prof.especialidades || '',
                    titulo: prof.titulo || '',
                    cabecalhoRelatorio: prof.cabecalhoRelatorio || '',
                    rqes: prof.rqes || []
                  });
                  console.log(
                    '✅ [Prontuário] Profissional carregado do banco global:',
                    prof.nome
                  );
                }
              }
            } catch (errProf) {
              console.error('❌ Erro ao buscar profissional:', errProf);
            }
          }
        }
      } catch (err) {
        console.error('❌ [Prontuário] Erro ao buscar consulta da API:', err);
      }
    };
    buscarConsultaCompleta();
  }, [
  consulta?.id,
  consulta?.profissionalId,
  consultaIdProp,
  clinicaId,
  consulta?.pacienteId,
  profissionaisDisponiveis,
  profissionalDaConsulta]
  );
  // ⭐ Flag que indica se o prontuário está sem profissional
  // Só mostra o select DEPOIS que o prontuário foi carregado (evita flash)
  const semProfissional =
  prontuarioJaCarregado &&
  !profissionalDaConsulta &&
  !ultimoProfissional &&
  !consulta?.profissional &&
  !consulta?.profissionalId &&
  !(
  usuarioLogado &&
  ['medico', 'dentista', 'profissional'].includes(
    (usuarioLogado.tipo || '').toString().toLowerCase().trim()
  ));

  // ⭐ Helper: garante que prontuário existe (movido para antes de handleSelecionarProfissional)
  const garantirProntuario = useCallback(async (): Promise<string | null> => {
    if (prontuarioId) return prontuarioId;
    const idPaciente = consulta?.pacienteId || pacienteId;
    if (!idPaciente || !clinicaId) return null;
    try {
      const response = await fetch(`${API_BASE_URL}/api/prontuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          pacienteId: idPaciente,
          pacienteNome: paciente?.nome || '',
          profissionalId: consulta?.profissionalId || '',
          profissional: consulta?.profissional || ''
        })
      });
      if (response.ok) {
        const result = await response.json();
        setProntuarioId(result.prontuarioId);
        return result.prontuarioId;
      }
    } catch (err) {
      console.error('Erro ao criar prontuário:', err);
    }
    return null;
  }, [prontuarioId, clinicaId, pacienteId, consulta, paciente]);
  // ⭐⭐⭐ FASE 1: Garante que existe uma consulta REAL antes de gravar dados clínicos.
  // Quando o prontuário foi aberto sem consultaId (ex.: a partir de PacientesPage ou
  // de um paciente sem consulta agendada), criamos a consulta sob demanda na PRIMEIRA
  // gravação — espelhando garantirProntuario(). Isso elimina o "preenche e não salva":
  // antes os handlers abortavam silenciosamente quando consultaIdReal era null.
  // Retorna o consultaId real (existente ou recém-criado) ou null se não for possível.
  const garantirConsulta = useCallback(async (
  profissionalAlternativo?: {profissionalId: string;profissional: string;})
  : Promise<string | null> => {
    // Já existe uma consulta real — nada a fazer.
    if (consultaIdReal) return consultaIdReal;
    // Se já há uma criação em andamento, aguarda a mesma promise (evita duplicar).
    if (criandoConsultaRef.current) return criandoConsultaRef.current;
    const idPaciente = consulta?.pacienteId || pacienteId;
    if (!idPaciente || !clinicaId) return null;
    // Atestados podem ser emitidos por um usuário autorizado que não é o médico
    // logado; nesse caso, a página passa o profissional responsável do documento.
    const prof = profissionalAlternativo || resolverProfissionalParaSaveRef.current?.();
    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date().toTimeString().slice(0, 5);
    const criar = (async (): Promise<string | null> => {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/consultas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || consulta?.paciente || '',
            tipo: consulta?.tipo || 'medica',
            data: hoje,
            horario: agora,
            duracao: 30,
            status: 'em_atendimento',
            horaInicioAtendimento: new Date().toISOString(),
            profissional: prof?.profissional || consulta?.profissional || '',
            profissionalId:
            prof?.profissionalId || consulta?.profissionalId || '',
            // ⭐ FIX: herda a modalidade da consulta de origem (online/presencial)
            // para que um atendimento online não seja gravado como presencial.
            modalidade:
            consulta?.modalidade === 'online' ? 'online' : 'presencial',
            ...(consulta?.linkVideo ?
            {
              linkVideo: consulta.linkVideo
            } :
            {}),
            observacoes: 'Atendimento iniciado a partir do prontuário'
          })
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(txt || `HTTP ${resp.status}`);
        }
        const result = await resp.json();
        const novoId = result.id as string;
        // Passa a usar a consulta recém-criada como referência central.
        setConsultaIdSelecionada(novoId);
        // LGPD: registra a criação do atendimento.
        registrarAuditoria({
          clinicaId,
          acao: 'CRIACAO_ATENDIMENTO',
          entidade: 'consulta',
          entidadeId: novoId,
          pacienteId: idPaciente,
          pacienteNome: paciente?.nome || '',
          detalhes:
          'Consulta criada automaticamente ao iniciar atendimento pelo prontuário'
        });
        return novoId;
      } catch (err: any) {
        console.error('❌ [garantirConsulta] Falha ao criar consulta:', err);
        throw err;
      }
    })();
    criandoConsultaRef.current = criar;
    try {
      return await criar;
    } finally {
      // Libera o guard — se deu certo, consultaIdReal já estará setado no próximo render.
      criandoConsultaRef.current = null;
    }
  }, [consultaIdReal, clinicaId, pacienteId, consulta, paciente]);
  // ⭐ NOVO: Handler para quando o atendente seleciona um profissional no select
  const handleSelecionarProfissional = useCallback(
    async (profissionalId: string) => {
      if (!clinicaId) return;
      setSalvandoProfissional(true);
      console.log('🔄 [Prontuário] Vinculando profissional:', profissionalId);
      try {
        // ⭐ Usa dados já carregados em profissionaisDisponiveis
        const profDaLista = profissionaisDisponiveis.find(
          (p) => p.id === profissionalId
        );
        let usuario: any = null;
        if (profDaLista) {
          usuario = profDaLista;
        } else {
          // Fallback: busca da API
          try {
            const respProf = await fetch(
              `${API_BASE_URL}/api/usuarios/${profissionalId}?clinicaId=${clinicaId}`
            );
            if (respProf.ok) {
              usuario = await respProf.json();
            }
          } catch (errApi) {
            console.warn('⚠️ [Prontuário] Falha ao buscar via API');
          }
          if (!usuario) {
            try {
              const respProf2 = await fetch(
                `${API_BASE_URL}/api/usuarios/${profissionalId}`
              );
              if (respProf2.ok) {
                usuario = await respProf2.json();
              }
            } catch (errApi2) {
              console.warn(
                '⚠️ [Prontuário] Falha ao buscar via API sem clinicaId'
              );
            }
          }
        }
        if (!usuario) {
          throw new Error('Profissional não encontrado');
        }
        const nomeProf = usuario.nome || '';
        // ⭐ Garante que o prontuário existe e salva o profissional NELE
        const pId = await garantirProntuario();
        if (pId) {
          try {
            const respPront = await fetch(
              `${API_BASE_URL}/api/prontuarios/${pId}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  clinicaId,
                  profissionalId: profissionalId,
                  profissional: nomeProf
                })
              }
            );
            if (respPront.ok) {
              const resultPront = await respPront.json().catch(() => ({}));
              console.log(
                '✅ [Prontuário] Profissional salvo no prontuário:',
                pId,
                '| Resposta:',
                JSON.stringify(resultPront)
              );
            } else {
              const errText = await respPront.text().catch(() => '');
              console.error(
                '❌ [Prontuário] Erro ao salvar no prontuário:',
                respPront.status,
                errText
              );
            }
          } catch (errPront) {
            console.error(
              '❌ [Prontuário] Erro na requisição do prontuário:',
              errPront
            );
          }
        } else {
          console.error(
            '❌ [Prontuário] Não foi possível criar/obter prontuário para salvar profissional'
          );
        }
        // ⭐ SEMPRE atualiza o estado local
        setProfissionalDaConsulta({
          id: usuario.id || profissionalId,
          nome: nomeProf,
          crm: usuario.crm || '',
          uf: usuario.uf || '',
          tipo: usuario.tipo || '',
          especialidade: usuario.especialidade || '',
          especialidades: usuario.especialidades || '',
          titulo: usuario.titulo || '',
          cabecalhoRelatorio: usuario.cabecalhoRelatorio || '',
          rqes: usuario.rqes || []
        });
        console.log(
          '✅ [Prontuário] Estado local atualizado — profissional:',
          nomeProf
        );
        // ⭐ LGPD: Registra vinculação de profissional
        if (clinicaId) {
          const idPac = consulta?.pacienteId || pacienteId || '';
          registrarAuditoria({
            clinicaId,
            acao: 'VINCULACAO_PROFISSIONAL',
            entidade: 'prontuario',
            entidadeId: prontuarioId || '',
            pacienteId: idPac,
            pacienteNome: paciente?.nome || '',
            detalhes: `Vinculou profissional: ${nomeProf} (${profissionalId})`
          });
        }
      } catch (err) {
        console.error('❌ Erro ao vincular profissional:', err);
        const profFallback = profissionaisDisponiveis.find(
          (p) => p.id === profissionalId
        );
        if (profFallback) {
          setProfissionalDaConsulta({
            id: profFallback.id,
            nome: profFallback.nome,
            crm: profFallback.crm || '',
            uf: profFallback.uf || '',
            tipo: profFallback.tipo || '',
            especialidade: '',
            especialidades: '',
            titulo: profFallback.titulo || '',
            cabecalhoRelatorio: profFallback.cabecalhoRelatorio || ''
          });
        } else {
          toastError(
            'Erro ao vincular',
            'Não foi possível vincular o profissional. Tente novamente.'
          );
        }
      } finally {
        setSalvandoProfissional(false);
      }
    },
    [clinicaId, profissionaisDisponiveis, garantirProntuario]
  );
  // ⭐ FIX: Busca profissional DIRETAMENTE no banco global via GET /api/usuarios/:id
  // Simples e confiável — não depende de JOIN cross-database
  useEffect(() => {
    const carregarProfissional = async () => {
      const profId = consulta?.profissionalId;
      if (!profId) return;
      // Se já temos o profissional carregado com este ID, não busca de novo
      if (profissionalDaConsulta?.id === profId) return;
      console.log(
        '🚨 [Prontuário] Buscando profissional no banco global, ID:',
        profId
      );
      try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/${profId}`);
        if (response.ok) {
          const usuario = await response.json();
          if (usuario.tipo === 'medico' || usuario.tipo === 'dentista') {
            setProfissionalDaConsulta({
              id: usuario.id,
              nome: usuario.nome || '',
              crm: usuario.crm || '',
              uf: usuario.uf || '',
              especialidade: '',
              especialidades: usuario.especialidades || '',
              titulo: usuario.titulo || '',
              cabecalhoRelatorio: usuario.cabecalhoRelatorio || '',
              rqes: usuario.rqes || []
            });
            console.log(
              '✅ [Prontuário] Profissional carregado do banco global:',
              usuario.nome,
              '| CRM:',
              usuario.crm || 'N/A',
              '| titulo:',
              usuario.titulo || '(vazio)',
              '| cabecalho:',
              usuario.cabecalhoRelatorio ? 'SIM' : 'NÃO'
            );
          } else {
            console.warn(
              '🚫 [Prontuário] profissionalId',
              profId,
              'aponta para',
              usuario.tipo,
              '(' + usuario.nome + ') — não é médico/dentista.',
              'Tentando fallback pelo campo profissional da consulta...'
            );
            // ⭐ FIX CRÍTICO: profissionalId aponta para admin/atendente
            // Tenta resolver pelo campo texto "profissional" da consulta
            // ou pelo "profissionalNomeJoin" que vem do JOIN
            const nomeTexto = (
            consulta?.profissionalNomeJoin ||
            consulta?.profissional ||
            '').

            toLowerCase().
            trim();
            if (nomeTexto && profissionaisDisponiveis.length > 0) {
              const profPorNome = profissionaisDisponiveis.find(
                (p) =>
                p.nome.toLowerCase().trim() === nomeTexto ||
                nomeTexto.includes(p.nome.toLowerCase().trim()) ||
                p.nome.toLowerCase().trim().includes(nomeTexto)
              );
              if (profPorNome) {
                console.log(
                  '✅ [Prontuário] Profissional encontrado por nome (fallback):',
                  profPorNome.nome
                );
                setProfissionalDaConsulta({
                  id: profPorNome.id,
                  nome: profPorNome.nome,
                  crm: profPorNome.crm || '',
                  uf: profPorNome.uf || '',
                  tipo: profPorNome.tipo || '',
                  especialidade: '',
                  especialidades: '',
                  titulo: profPorNome.titulo || '',
                  cabecalhoRelatorio: profPorNome.cabecalhoRelatorio || ''
                });
              }
            }
          }
        } else {
          console.warn(
            '⚠️ [Prontuário] Profissional não encontrado, ID:',
            profId
          );
        }
      } catch (err) {
        console.error('❌ Erro ao buscar profissional:', err);
      }
    };
    carregarProfissional();
  }, [consulta?.profissionalId]);
  // ⭐ Carrega lista de profissionais (médicos/dentistas) da clínica
  useEffect(() => {
    const carregarProfissionais = async () => {
      if (!clinicaId) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const usuarios = await response.json();
          const profissionais = usuarios.
          filter(
            (u: any) =>
            (u.tipo === 'medico' || u.tipo === 'dentista') &&
            u.ativo !== false &&
            u.ativo !== 0
          ).
          map((u: any) => ({
            id: u.id,
            nome: u.nome,
            tipo: u.tipo,
            crm: u.crm || '',
            uf: u.uf || '',
            titulo: u.titulo || '',
            cabecalhoRelatorio: u.cabecalhoRelatorio || ''
          })).
          sort((a: any, b: any) => a.nome.localeCompare(b.nome));
          setProfissionaisDisponiveis(profissionais);
          console.log(
            `✅ [Prontuário] ${profissionais.length} profissionais carregados para select`
          );
        }
      } catch (err) {
        console.error('Erro ao carregar profissionais:', err);
      }
    };
    carregarProfissionais();
  }, [clinicaId]);
  // ⭐ Auto-vincula profissional quando a consulta tem nome mas não tem profissionalId
  useEffect(() => {
    // ⭐ CRÍTICO: Só executa DEPOIS que o prontuário foi carregado
    // Evita auto-link antes de ler o profissional salvo no prontuário
    if (!prontuarioJaCarregado) return;
    // Só executa se ainda não temos profissionalDaConsulta definido
    if (profissionalDaConsulta) return;
    // Só executa se a lista de profissionais já carregou
    if (profissionaisDisponiveis.length === 0) return;
    // Só executa se não está salvando
    if (salvandoProfissional) return;
    // Caso 1: Consulta tem profissional (nome) — tenta resolver pelo nome
    // ⭐ FIX: Funciona MESMO quando profissionalId existe (caso tenha sido rejeitado por ser admin/atendente)
    const nomeParaBuscar = (
    consulta?.profissionalNomeJoin ||
    consulta?.profissional ||
    '').
    trim();
    if (nomeParaBuscar) {
      const nomeConsulta = nomeParaBuscar.toLowerCase();
      const profEncontrado = profissionaisDisponiveis.find(
        (p) =>
        p.nome.toLowerCase().trim() === nomeConsulta ||
        nomeConsulta.includes(p.nome.toLowerCase().trim()) ||
        p.nome.toLowerCase().trim().includes(nomeConsulta)
      );
      if (profEncontrado) {
        console.log(
          '🔄 [Auto-link] Profissional encontrado por nome:',
          profEncontrado.nome,
          '→ vinculando automaticamente'
        );
        handleSelecionarProfissional(profEncontrado.id);
        return;
      }
    }
    // Caso 2: Último profissional do histórico — usa como fallback visual (NÃO persiste)
    if (ultimoProfissional) {
      // 2a: Tem ID — busca direto na lista
      if (ultimoProfissional.id) {
        const profNaLista = profissionaisDisponiveis.find(
          (p) => p.id === ultimoProfissional.id
        );
        if (profNaLista) {
          console.log(
            '🔄 [Auto-link] Usando último profissional do histórico (por ID):',
            profNaLista.nome
          );
          setProfissionalDaConsulta({
            id: ultimoProfissional.id,
            nome: ultimoProfissional.nome || profNaLista.nome,
            crm: ultimoProfissional.crm || profNaLista.crm || '',
            uf: ultimoProfissional.uf || profNaLista.uf || '',
            tipo: ultimoProfissional.tipo || profNaLista.tipo || '',
            especialidade: ultimoProfissional.especialidade || '',
            especialidades: ultimoProfissional.especialidades || '',
            titulo: ultimoProfissional.titulo || profNaLista.titulo || '',
            cabecalhoRelatorio:
            ultimoProfissional.cabecalhoRelatorio ||
            profNaLista.cabecalhoRelatorio ||
            '',
            rqes: ultimoProfissional.rqes || []
          });
          return;
        }
      }
      // 2b: Sem ID mas tem nome — busca por nome EXATO na lista (sem includes fuzzy)
      if (ultimoProfissional.nome) {
        const nomeUltimo = ultimoProfissional.nome.toLowerCase().trim();
        const profPorNome = profissionaisDisponiveis.find(
          (p) => p.nome.toLowerCase().trim() === nomeUltimo
        );
        if (profPorNome) {
          console.log(
            '🔄 [Auto-link] Último profissional encontrado por nome EXATO:',
            profPorNome.nome,
            '→ usando como referência (sem persistir)'
          );
          // ⭐ FIX: Apenas seta visualmente, NÃO chama handleSelecionarProfissional
          // para evitar persistir profissional errado no banco
          setProfissionalDaConsulta({
            id: profPorNome.id,
            nome: profPorNome.nome,
            crm: profPorNome.crm || '',
            uf: profPorNome.uf || '',
            tipo: profPorNome.tipo || '',
            especialidade: ultimoProfissional.especialidade || '',
            especialidades: ultimoProfissional.especialidades || '',
            titulo: ultimoProfissional.titulo || profPorNome.titulo || '',
            cabecalhoRelatorio:
            ultimoProfissional.cabecalhoRelatorio ||
            profPorNome.cabecalhoRelatorio ||
            '',
            rqes: ultimoProfissional.rqes || []
          });
          return;
        }
        // 2c: Não encontrou na lista — NÃO usa como fallback
        // ⭐ FIX CRÍTICO: Se o nome não corresponde a nenhum médico/dentista ativo,
        // pode ser um atendente/admin. Deixa vazio para mostrar o select.
        console.log(
          '⚠️ [Auto-link] Último profissional NÃO encontrado na lista de médicos/dentistas, ignorando:',
          ultimoProfissional.nome
        );
        // NÃO chama setProfissionalDaConsulta — deixa null para mostrar select
        return;
      }
    }
    // ⭐ FIX: Removido Case 3 (auto-assign único profissional da clínica)
    // Se não há informação confiável do profissional da consulta, mostra o select
    // para que o usuário escolha manualmente. Isso evita vincular profissional errado.
  }, [
  prontuarioJaCarregado,
  profissionalDaConsulta,
  profissionaisDisponiveis,
  consulta?.profissional,
  consulta?.profissionalId,
  ultimoProfissional,
  salvandoProfissional,
  handleSelecionarProfissional]
  );
  // ⭐ Carrega o último profissional do histórico de atendimentos do paciente
  useEffect(() => {
    const carregarUltimoProfissional = async () => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      // Se já temos profissionalDaConsulta, não precisa buscar fallback
      if (profissionalDaConsulta) return;
      try {
        // Busca prontuário com atendimentos
        const response = await fetch(
          `${API_BASE_URL}/api/prontuarios?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
        );
        if (!response.ok) return;
        const prontuarios = await response.json();
        if (prontuarios.length === 0) return;
        const atendimentos = prontuarios[0].atendimentos || [];
        if (atendimentos.length === 0) return;
        // Pega o profissionalId do último atendimento
        const ultimoAtendimento = atendimentos[0];
        const profId = ultimoAtendimento.professionalId;
        if (profId) {
          // Busca dados completos do profissional
          const respProf = await fetch(`${API_BASE_URL}/api/usuarios/${profId}`);
          if (respProf.ok) {
            const usuario = await respProf.json();
            // ⭐ FIX CRÍTICO: Só aceita médico/dentista como profissional do histórico
            if (usuario.tipo === 'medico' || usuario.tipo === 'dentista') {
              setUltimoProfissional({
                id: usuario.id,
                nome: usuario.nome || '',
                crm: usuario.crm || '',
                uf: usuario.uf || '',
                tipo: usuario.tipo || '',
                especialidade: usuario.especialidade || '',
                especialidades: usuario.especialidades || '',
                titulo: usuario.titulo || '',
                cabecalhoRelatorio: usuario.cabecalhoRelatorio || '',
                rqes: usuario.rqes || []
              });
              console.log(
                '✅ [Prontuário] Último profissional do histórico (médico/dentista):',
                usuario.nome
              );
            } else {
              console.log(
                '⚠️ [Prontuário] Último profissional do histórico é',
                usuario.tipo,
                '(' + usuario.nome + ') — IGNORADO, não é médico/dentista'
              );
            }
          }
        } else if (ultimoAtendimento.professional) {
          // ⭐ FIX: Só usa nome se corresponde a um médico/dentista na lista
          // Não seta nomes de atendentes/admins como profissional
          console.log(
            '⚠️ [Prontuário] Último atendimento sem profissionalId, nome:',
            ultimoAtendimento.professional,
            '— será validado pelo auto-link'
          );
          // NÃO seta ultimoProfissional com nome não-validado
          // O auto-link (useEffect acima) cuidará de validar contra a lista
        }
      } catch (err) {
        console.error('Erro ao carregar último profissional:', err);
      }
    };
    carregarUltimoProfissional();
  }, [consulta?.pacienteId, pacienteId, clinicaId, profissionalDaConsulta]);
  // Carrega dados do paciente
  useEffect(() => {
    const carregarDados = async () => {
      if (consulta) {
        setPaciente({
          id: consulta.pacienteId,
          nome: consulta.pacienteNome,
          statusConsulta:
          consulta.tipo === 'medica' ?
          'CONSULTA MÉDICA' :
          'CONSULTA ODONTOLÓGICA'
        });
        // Verifica assinatura da consulta
        if ((consulta as any).assinaturaPaciente) {
          setConsultaAssinada(true);
          setDataAssinatura((consulta as any).dataAssinatura || null);
        }
        if (clinicaId && consulta.pacienteId) {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/pacientes/${consulta.pacienteId}?clinicaId=${clinicaId}`
            );
            if (response.ok) {
              const data = await response.json();
              setPaciente({
                id: data.id,
                nome: data.nome,
                dataNascimento: data.dataNascimento,
                convenio: data.convenio,
                planoSaudeNome: data.planoSaudeNome,
                cidade: data.cidade,
                profissao: data.profissao,
                fotoUrl: data.fotoUrl,
                telefone: data.telefone || data.celular || '',
                cpf: data.cpf || '',
                endereco: [
                data.endereco,
                data.numero,
                data.bairro,
                data.cidade,
                data.uf].

                filter(Boolean).
                join(', '),
                profissionalResponsavelId: data.profissionalResponsavelId || '',
                statusConsulta:
                consulta.tipo === 'medica' ?
                'CONSULTA MÉDICA' :
                'CONSULTA ODONTOLÓGICA',
                titularId: data.titularId,
                titularNome: data.titularNome,
                parentesco: data.parentesco
              });
              // ⭐ Resolve profissional responsável do cadastro do paciente
              if (data.profissionalResponsavelId) {
                try {
                  const respResp = await fetch(
                    `${API_BASE_URL}/api/usuarios/${data.profissionalResponsavelId}`
                  );
                  if (respResp.ok) {
                    const profResp = await respResp.json();
                    if (
                    profResp.tipo === 'medico' ||
                    profResp.tipo === 'dentista')
                    {
                      setProfissionalResponsavel({
                        nome: profResp.nome || '',
                        crm: profResp.crm || '',
                        uf: profResp.uf || '',
                        tipo: profResp.tipo || ''
                      });
                      console.log(
                        '✅ [Prontuário] Profissional Responsável do paciente:',
                        profResp.nome,
                        '| CRM:',
                        profResp.crm || 'N/A'
                      );
                    }
                  }
                } catch {

                  /* ignore */}
              } else if (data.profissionalResponsavel) {
                // Fallback: só tem nome texto livre
                setProfissionalResponsavel({
                  nome: data.profissionalResponsavel
                });
              }
            }
          } catch (err) {
            console.error('Erro ao carregar dados do paciente:', err);
          }
        }
        return;
      }
      if (!pacienteId || !clinicaId) {
        setPaciente({
          id: 'mock',
          nome: 'SELECIONE UM PACIENTE',
          statusConsulta: 'AGUARDANDO SELEÇÃO'
        });
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const data = await response.json();
          setPaciente({
            id: data.id,
            nome: data.nome,
            dataNascimento: data.dataNascimento,
            convenio: data.convenio,
            planoSaudeNome: data.planoSaudeNome,
            cidade: data.cidade,
            profissao: data.profissao,
            fotoUrl: data.fotoUrl,
            telefone: data.telefone || data.celular || '',
            // ⭐ CPF e endereço são obrigatórios nos documentos legais
            //    (receituário de controle especial). Sem eles aqui, a impressão
            //    acusava campo ausente mesmo com o cadastro preenchido.
            cpf: data.cpf || '',
            endereco: [
            data.endereco,
            data.numero,
            data.bairro,
            data.cidade,
            data.uf].

            filter(Boolean).
            join(', '),
            profissionalResponsavelId: data.profissionalResponsavelId || '',
            statusConsulta: 'CONSULTA',
            titularId: data.titularId,
            titularNome: data.titularNome,
            parentesco: data.parentesco
          });
          // ⭐ Resolve profissional responsável do cadastro do paciente
          if (data.profissionalResponsavelId) {
            try {
              const respResp = await fetch(
                `${API_BASE_URL}/api/usuarios/${data.profissionalResponsavelId}`
              );
              if (respResp.ok) {
                const profResp = await respResp.json();
                if (
                profResp.tipo === 'medico' ||
                profResp.tipo === 'dentista')
                {
                  setProfissionalResponsavel({
                    nome: profResp.nome || '',
                    crm: profResp.crm || '',
                    uf: profResp.uf || '',
                    tipo: profResp.tipo || ''
                  });
                }
              }
            } catch {

              /* ignore */}
          } else if (data.profissionalResponsavel) {
            setProfissionalResponsavel({
              nome: data.profissionalResponsavel
            });
          }
        }
      } catch (err) {
        console.error('Erro ao carregar paciente:', err);
      } finally {
        setLoading(false);
      }
    };
    carregarDados();
  }, [pacienteId, clinicaId, consulta]);
  // ⭐ Assinatura pedida num "Novo atendimento" ainda não gravado fica com
  // atendimentoId 'NOVO'. Ela é reconhecida se foi pedida a partir desta tela
  // (criada depois que a tela abriu) e é ligada ao atendimento real assim que
  // ele existir.
  const telaAbertaEmRef = useRef(Date.now());
  const assinaturaSemVinculoRef = useRef<string | null>(null);
  const vincularAssinatura = useCallback(
    async (assinaturaId: string, atendimentoId: string) => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/assinaturas/${assinaturaId}/vincular`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clinicaId, atendimentoId })
        });
        if (r.ok) assinaturaSemVinculoRef.current = null;
      } catch {

        // tenta de novo quando o atendimento mudar
      }},
    [clinicaId]
  );
  useEffect(() => {
    if (consultaIdReal && assinaturaSemVinculoRef.current) {
      vincularAssinatura(assinaturaSemVinculoRef.current, consultaIdReal);
    }
  }, [consultaIdReal, consultaAssinada, vincularAssinatura]);
  // ⭐ Polling para detectar assinatura do paciente em tempo real
  useEffect(() => {
    if (consultaAssinada || !consultaIdAtual || !clinicaId) return;
    const idPaciente = consulta?.pacienteId || pacienteId;
    const verificarAssinatura = async () => {
      try {
        // 1. Verifica no atendimento (campo assinaturaPaciente)
        if (consultaIdAtual !== 'NOVO') {
          const resp = await fetch(
            `${API_BASE_URL}/api/atendimentos/${consultaIdAtual}?clinicaId=${clinicaId}`
          );
          if (resp.ok) {
            const data = await resp.json();
            if (data.assinaturaPaciente) {
              console.log('✅ [Assinatura] Detectada via atendimento!');
              setConsultaAssinada(true);
              setDataAssinatura(data.dataAssinatura || new Date().toISOString());
              return;
            }
          }
        }
        // 2. Verifica na tabela assinaturas (por pacienteId)
        if (idPaciente) {
          const respAss = await fetch(
            `${API_BASE_URL}/api/assinaturas/paciente/${idPaciente}?clinicaId=${clinicaId}`
          );
          if (respAss.ok) {
            const assinaturas = await respAss.json();
            // Margem para diferença de relógio entre navegador e servidor
            const desde = telaAbertaEmRef.current - 2 * 60 * 1000;
            const assinada = (Array.isArray(assinaturas) ? assinaturas : []).find(
              (a: any) =>
              a.status === 'assinado' && (
              a.atendimentoId === consultaIdAtual ||
              (!a.atendimentoId || a.atendimentoId === 'NOVO') &&
              new Date(a.criadoEm).getTime() >= desde)
            );
            if (assinada) {
              console.log('✅ [Assinatura] Detectada via tabela assinaturas!');
              setConsultaAssinada(true);
              setDataAssinatura(assinada.assinadoEm || new Date().toISOString());
              if (!assinada.atendimentoId || assinada.atendimentoId === 'NOVO') {
                assinaturaSemVinculoRef.current = assinada.id;
                if (consultaIdReal) vincularAssinatura(assinada.id, consultaIdReal);
              }
            }
          }
        }
      } catch (_err) {

        // Silencioso — polling não deve interromper o fluxo
      }};
    verificarAssinatura();
    const interval = setInterval(verificarAssinatura, 10000);
    return () => clearInterval(interval);
  }, [
  consultaAssinada,
  consultaIdAtual,
  clinicaId,
  consulta?.pacienteId,
  pacienteId]
  );
  // ⭐⭐⭐ FASE 3: Encerramento automático ao assinar.
  // Quando o paciente assina, registramos a saída e finalizamos o atendimento
  // na fila — uma única vez por consulta (guard via ref).
  const atendimentoFinalizadoRef = useRef(false);
  useEffect(() => {
    if (!consultaAssinada) return;
    if (!consultaIdReal) return;
    if (!onUpdateConsulta) return;
    if (atendimentoFinalizadoRef.current) return;
    // Evita re-finalizar uma consulta já marcada como finalizada
    if ((consulta as any)?.statusAtendimento === 'finalizado') {
      atendimentoFinalizadoRef.current = true;
      return;
    }
    atendimentoFinalizadoRef.current = true;
    const fim = new Date();
    const inicioRaw = (consulta as any)?.horaInicioAtendimento;
    const updates: Partial<Consulta> = {
      statusAtendimento: 'finalizado',
      horaFimAtendimento: fim.toISOString(),
      status: 'realizada'
    };
    if (inicioRaw) {
      const inicio = new Date(inicioRaw);
      if (!isNaN(inicio.getTime())) {
        updates.tempoTotalAtendimento = Math.max(
          0,
          Math.floor((fim.getTime() - inicio.getTime()) / 1000)
        );
      }
    }
    onUpdateConsulta(consultaIdReal, updates);
    toastSuccess(
      'Atendimento encerrado',
      'Assinatura registrada — o paciente foi finalizado na fila.'
    );
  }, [
  consultaAssinada,
  consultaIdReal,
  onUpdateConsulta,
  consulta,
  toastSuccess]
  );
  // ⭐ Carrega prontuário e dados clínicos das tabelas separadas
  // Guarda contra carga DUPLICADA: o objeto `consulta` muda de identidade
  // enquanto a carga ainda está em andamento (a fila/App atualiza a lista),
  // o efeito rodava de novo e buscava tudo duas vezes.
  const carregandoDadosRef = useRef<string | null>(null);
  useEffect(() => {
    if (dadosCarregados) return;
    const carregarDados = async () => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      const chaveCarga = `${clinicaId}:${idPaciente}:${consulta?.id || consultaIdProp || ''}:${consultaIdSelecionada}`;
      if (carregandoDadosRef.current === chaveCarga) return;
      carregandoDadosRef.current = chaveCarga;
      try {
        // ⭐ As 9 buscas abaixo são independentes: rodam EM PARALELO.
        // Antes eram feitas uma depois da outra (~18 idas ao servidor em
        // fila); com a latência de produção a tela demorava segundos para
        // mostrar os dados. Cada seção mantém o próprio try/catch.
        const secao1 = (async () => {
        // 1. Busca prontuário
        try {
          // (declarada fora do if: o registro LGPD de acesso, mais abaixo, usa
          // esta lista — antes dava ReferenceError e o acesso nunca era auditado)
          let prontuarios: any[] = [];
          const respPront = await fetch(
            `${API_BASE_URL}/api/prontuarios?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
          );
          if (respPront.ok) {
            prontuarios = await respPront.json();
            if (prontuarios.length === 0) {
              // ⭐ FIX: Cria prontuário automaticamente se não existe
              console.log(
                '⚠️ [Prontuário] Nenhum prontuário encontrado para paciente',
                idPaciente,
                '→ criando automaticamente...'
              );
              try {
                const respCriar = await fetch(
                  `${API_BASE_URL}/api/prontuarios`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      clinicaId,
                      pacienteId: idPaciente,
                      pacienteNome:
                      consulta?.pacienteNome || paciente?.nome || '',
                      profissionalId: consulta?.profissionalId || '',
                      profissional: consulta?.profissional || ''
                    })
                  }
                );
                if (respCriar.ok) {
                  const result = await respCriar.json();
                  setProntuarioId(result.prontuarioId);
                  console.log(
                    '✅ [Prontuário] Criado automaticamente:',
                    result.prontuarioId
                  );
                }
              } catch (errCriar) {
                console.error(
                  '❌ [Prontuário] Erro ao criar automaticamente:',
                  errCriar
                );
              }
            }
            if (prontuarios.length > 0) {
              const pront = prontuarios[0];
              setProntuarioId(pront.id);
              // ⭐ FALLBACK DIRETO NO FRONTEND: Se prontuário não tem profissionalId,
              // verifica os atendimentos (consultas) que vieram junto na resposta
              if (!pront.profissionalId && pront.atendimentos?.length > 0) {
                const atendimentoComProf = pront.atendimentos.find(
                  (a: any) =>
                  a.profissionalId &&
                  a.profissionalId !== 'null' &&
                  a.profissionalId !== 'undefined'
                );
                if (atendimentoComProf) {
                  // ⭐ FIX CRÍTICO: Verifica se o profissional do atendimento é médico/dentista
                  // antes de usar como fallback (pode ser atendente que foi salvo incorretamente)
                  let profValido = false;
                  try {
                    const respVerif = await fetch(
                      `${API_BASE_URL}/api/usuarios/${atendimentoComProf.professionalId}`
                    );
                    if (respVerif.ok) {
                      const usuarioVerif = await respVerif.json();
                      profValido =
                      usuarioVerif.tipo === 'medico' ||
                      usuarioVerif.tipo === 'dentista';
                      if (!profValido) {
                        console.warn(
                          '🚫 [Prontuário Fallback 1] profissionalId do atendimento aponta para',
                          usuarioVerif.tipo,
                          '(' +
                          usuarioVerif.nome +
                          ') — IGNORADO, não é médico/dentista'
                        );
                      }
                    }
                  } catch {
                    // Em caso de erro de rede, aceita o fallback (melhor ter algo do que nada)
                    profValido = true;
                  }
                  if (profValido) {
                    pront.professionalId = atendimentoComProf.professionalId;
                    pront.profissional =
                    pront.profissional ||
                    atendimentoComProf.professional ||
                    '';
                    console.log(
                      '🔍 [Frontend Fallback] profissionalId encontrado nos atendimentos:',
                      atendimentoComProf.professionalId,
                      '| nome:',
                      atendimentoComProf.professional || '(vazio)'
                    );
                    // Salva no prontuário para não precisar do fallback novamente
                    fetch(`${API_BASE_URL}/api/prontuarios/${pront.id}`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        clinicaId,
                        profissionalId: atendimentoComProf.professionalId,
                        profissional: atendimentoComProf.professional || ''
                      })
                    }).catch(() => {});
                  }
                }
              }
              // ⭐ FALLBACK 2: Se AINDA não tem, busca profissionalResponsavelId do paciente
              if (!pront.professionalId) {
                try {
                  const respPac = await fetch(
                    `${API_BASE_URL}/api/pacientes/${idPaciente}?clinicaId=${clinicaId}`
                  );
                  if (respPac.ok) {
                    const pacData = await respPac.json();
                    if (pacData.professionalResponsavelId) {
                      // ⭐ FIX CRÍTICO: Verifica se o profissional responsável é médico/dentista
                      let profRespValido = false;
                      try {
                        const respVerifResp = await fetch(
                          `${API_BASE_URL}/api/usuarios/${pacData.professionalResponsavelId}?clinicaId=${clinicaId}`
                        );
                        if (respVerifResp.ok) {
                          const usuarioVerifResp = await respVerifResp.json();
                          profRespValido =
                          usuarioVerifResp.tipo === 'medico' ||
                          usuarioVerifResp.tipo === 'dentista';
                          if (!profRespValido) {
                            console.warn(
                              '🚫 [Prontuário Fallback 2] profissionalResponsavelId aponta para',
                              usuarioVerifResp.tipo,
                              '(' +
                              usuarioVerifResp.nome +
                              ') — IGNORADO, não é médico/dentista'
                            );
                          }
                        }
                      } catch {
                        profRespValido = true;
                      }
                      if (profRespValido) {
                        pront.professionalId = pacData.professionalResponsavelId;
                        pront.profissional =
                        pront.professional ||
                        pacData.professionalResponsavel ||
                        '';
                        console.log(
                          '🔍 [Frontend Fallback Paciente] professionalResponsavelId:',
                          pacData.professionalResponsavelId,
                          '| nome:',
                          pacData.professionalResponsavel || '(vazio)'
                        );
                        // Salva no prontuário
                        fetch(`${API_BASE_URL}/api/prontuarios/${pront.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            clinicaId,
                            professionalId: pacData.professionalResponsavelId,
                            profissional: pacData.professionalResponsavel || ''
                          })
                        }).catch(() => {});
                      }
                    }
                  }
                } catch (errPac) {
                  console.warn(
                    '⚠️ [Frontend] Erro ao buscar paciente para fallback:',
                    errPac
                  );
                }
              }
              console.log(
                '📋 [Prontuário] Carregado:',
                pront.id,
                '| profissionalId:',
                pront.professionalId || '(vazio)',
                '| profissional:',
                pront.professional || '(vazio)'
              );
              // ⭐ FIX: Prontuário usa profissionalId direto quando a consulta NÃO forneceu um
              // Se a consulta já tem profissionalId, a consulta tem prioridade
              if (
              (pront.professionalId || pront.professional) &&
              !profissionalDaConsulta)
              {
                // ⭐ Se a consulta JÁ tem profissionalId, deixa a consulta resolver (não sobrescreve)
                const consultaTemProfissionalId = !!consulta?.profissionalId;
                console.log(
                  '🔍 [Prontuário] profissionalId encontrado no prontuário:',
                  pront.professionalId,
                  '| nome:',
                  pront.professional || '(vazio)',
                  '| consulta tem profissionalId?',
                  consultaTemProfissionalId
                );
                if (pront.professionalId) {
                  try {
                    const respProfPront = await fetch(
                      `${API_BASE_URL}/api/usuarios/${pront.professionalId}`
                    );
                    if (respProfPront.ok) {
                      const usuarioProf = await respProfPront.json();
                      if (
                      usuarioProf.tipo === 'medico' ||
                      usuarioProf.tipo === 'dentista')
                      {
                        const profData = {
                          id: usuarioProf.id,
                          nome: usuarioProf.nome || pront.professional || '',
                          crm: usuarioProf.crm || '',
                          uf: usuarioProf.uf || '',
                          especialidade: usuarioProf.especialidade || '',
                          especialidades: usuarioProf.especialidades || '',
                          titulo: usuarioProf.titulo || '',
                          cabecalhoRelatorio:
                          usuarioProf.cabecalhoRelatorio || '',
                          rqes: usuarioProf.rqes || []
                        };
                        if (consultaTemProfissionalId) {
                          // Consulta tem profissionalId → prontuário é apenas fallback
                          setUltimoProfissional(profData);
                          console.log(
                            '✅ [Prontuário] Profissional do prontuário salvo como FALLBACK (consulta tem prioridade):',
                            usuarioProf.nome
                          );
                        } else {
                          // ⭐ Consulta NÃO tem profissionalId → usa o do prontuário DIRETAMENTE
                          setProfissionalDaConsulta(profData);
                          console.log(
                            '✅ [Prontuário] Profissional do prontuário usado DIRETAMENTE (consulta sem profissionalId):',
                            usuarioProf.nome
                          );
                        }
                      } else {
                        console.warn(
                          '🚫 [Prontuário] profissionalId do prontuário aponta para',
                          usuarioProf.tipo,
                          '(' +
                          usuarioProf.nome +
                          ') — IGNORADO, não é médico/dentista!'
                        );
                        // Limpa o profissionalId corrompido do prontuário
                        fetch(`${API_BASE_URL}/api/prontuarios/${pront.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            clinicaId,
                            profissionalId: '',
                            profissional: ''
                          })
                        }).catch(() => {});
                      }
                    } else {
                      console.log(
                        '⚠️ [Prontuário] API não respondeu para profissional do prontuário:',
                        pront.professional || pront.professionalId
                      );
                    }
                  } catch (errProf) {
                    console.warn(
                      '⚠️ [Prontuário] Erro ao verificar profissional do prontuário:',
                      pront.professional || pront.professionalId
                    );
                    // ⭐ FIX: Em caso de erro, NÃO seta profissionalDaConsulta — deixa para a consulta decidir
                  }
                } else if (pront.professional) {
                  // Só tem nome, sem ID — seta como ultimoProfissional se encontrar médico/dentista
                  console.log(
                    '🚨 [Prontuário] Só tem nome do profissional, tentando resolver como fallback:',
                    pront.professional
                  );
                  try {
                    const respUsuarios = await fetch(
                      `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
                    );
                    if (respUsuarios.ok) {
                      const usuarios = await respUsuarios.json();
                      const nomePront = pront.professional.toLowerCase().trim();
                      const profEncontrado = usuarios.find(
                        (u: any) =>
                        (u.tipo === 'medico' || u.tipo === 'dentista') &&
                        u.nome.toLowerCase().trim() === nomePront
                      );
                      if (profEncontrado) {
                        // ⭐ FIX: Seta como ultimoProfissional (fallback), NÃO como profissionalDaConsulta
                        setUltimoProfissional({
                          id: profEncontrado.id,
                          nome: profEncontrado.nome || '',
                          crm: profEncontrado.crm || '',
                          uf: profEncontrado.uf || '',
                          especialidade: profEncontrado.especialidade || '',
                          especialidades: profEncontrado.especialidades || '',
                          titulo: profEncontrado.titulo || '',
                          cabecalhoRelatorio:
                          profEncontrado.cabecalhoRelatorio || '',
                          rqes: profEncontrado.rqes || []
                        });
                        console.log(
                          '✅ [Prontuário] Profissional resolvido por nome como FALLBACK:',
                          profEncontrado.nome
                        );
                        // Salva o profissionalId no prontuário
                        fetch(`${API_BASE_URL}/api/prontuarios/${pront.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            clinicaId,
                            profissionalId: profEncontrado.id,
                            profissional: profEncontrado.nome
                          })
                        }).catch(() => {});
                      } else {
                        console.log(
                          '⚠️ [Prontuário] Nome no prontuário NÃO é médico/dentista, ignorando:',
                          pront.professional
                        );
                      }
                    }
                  } catch (errResolve) {
                    console.error(
                      '❌ [Prontuário] Erro ao resolver profissional:',
                      errResolve
                    );
                  }
                }
              }
              // Preenche dados gerais como fallback para anamnese.
              // Atualização FUNCIONAL: as buscas agora rodam em paralelo e a
              // anamnese real (seção 2) pode chegar antes — não sobrescreve.
              setAnamneseData((atual) =>
              atual ?? {
                queixaPrincipal: '',
                historiaQueixa: '',
                historicoDoencas: pront.doencasCronicas || '',
                alergias: pront.alergias || '',
                medicamentosEmUso: pront.medicamentosEmUso || '',
                historicoFamiliar: pront.historicoFamiliar || '',
                habitosVida: ''
              }
              );
            }
          }
          // ⭐ LGPD: Registra acesso ao prontuário
          if (clinicaId && prontuarios.length > 0) {
            const pront = prontuarios[0];
            registrarAuditoria({
              clinicaId,
              acao: 'ACESSO_PRONTUARIO',
              entidade: 'prontuario',
              entidadeId: pront.id,
              pacienteId: idPaciente,
              pacienteNome: pront.pacienteNome || paciente?.nome || '',
              detalhes: `Acessou prontuário do paciente ${pront.pacienteNome || idPaciente}`
            });
          }
          setProntuarioJaCarregado(true);
        } catch (err) {
          console.error('Erro prontuário:', err);
          setProntuarioJaCarregado(true);
        }
        })();
        const secao2 = (async () => {
        // 2. Busca anamneses
        // ⭐ Estratégia segura: tenta pela consultaId do atendimento; se NÃO houver
        // registro próprio E o usuário NÃO retomou explicitamente um atendimento
        // antigo, faz fallback para o último registro do paciente — NUNCA esconde
        // dados já gravados.
        const aplicaResultadoAnamnese = (
        a: any,
        isFallback: boolean = false) =>
        {
          if (!isFallback) {
            setAnamneseId(a.id);
          } else {
            setAnamneseId(null);
          }
          setAnamneseData({
            queixaPrincipal: a.queixaPrincipal || '',
            historiaQueixa: a.historiaQueixa || '',
            historicoDoencas: a.historicoDoencas || '',
            alergias: a.alergias || '',
            medicamentosEmUso: a.medicamentosEmUso || '',
            historicoFamiliar: a.historicoFamiliar || '',
            habitosVida: a.habitosVida || ''
          });
        };
        try {
          let carregou = false;
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const resp = await fetch(
              `${API_BASE_URL}/api/anamneses?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (resp.ok) {
              const anamneses = await resp.json();
              if (anamneses.length > 0) {
                aplicaResultadoAnamnese(anamneses[0], false);
                carregou = true;
              }
            }
          }
          if (!carregou && !consultaIdSelecionada) {
            const resp = await fetch(
              `${API_BASE_URL}/api/anamneses?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
            );
            if (resp.ok) {
              const anamneses = await resp.json();
              if (anamneses.length > 0)
              aplicaResultadoAnamnese(anamneses[0], true);
            }
          } else if (!carregou && consultaIdSelecionada) {
            setAnamneseId(null);
          }
        } catch (err) {
          console.error('Erro anamneses:', err);
        }
        })();
        const secao3 = (async () => {
        // 3. Busca evoluções
        try {
          let carregou = false;
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const resp = await fetch(
              `${API_BASE_URL}/api/evolucoes?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (resp.ok) {
              const evolucoes = await resp.json();
              if (evolucoes.length > 0) {
                setEvolucaoId(evolucoes[0].id);
                setEvolucaoData({
                  evolucaoAtual: evolucoes[0].evolucao || ''
                });
                carregou = true;
              }
            }
          }
          if (!carregou && !consultaIdSelecionada) {
            const resp = await fetch(
              `${API_BASE_URL}/api/evolucoes?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
            );
            if (resp.ok) {
              const evolucoes = await resp.json();
              if (evolucoes.length > 0) {
                setEvolucaoId(evolucoes[0].id);
                setEvolucaoData({
                  evolucaoAtual: evolucoes[0].evolucao || ''
                });
              }
            }
          } else if (!carregou && consultaIdSelecionada) {
            setEvolucaoId(null);
            setEvolucaoData({
              evolucaoAtual: ''
            });
          }
        } catch (err) {
          console.error('Erro evoluções:', err);
        }
        })();
        const secao4 = (async () => {
        // 4. Busca exames físicos
        const aplicaExameFisico = (e: any, isFallback: boolean = false) => {
          if (!isFallback) {
            setExameFisicoId(e.id);
          } else {
            setExameFisicoId(null);
          }
          setExameFisicoData({
            altura: e.altura || '',
            peso: e.peso || '',
            imc: e.imc || '',
            pressaoArterial: e.pressaoArterial || '',
            pulso: e.pulso || '',
            temperatura: e.temperatura || '',
            saturacaoO2: e.saturacaoO2 || '',
            frequenciaRespiratoria: e.frequenciaRespiratoria || '',
            glicemia: e.glicemia || '',
            observacoesGerais: e.observacoesGerais || ''
          });
        };
        try {
          let carregou = false;
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const resp = await fetch(
              `${API_BASE_URL}/api/exames-fisicos?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (resp.ok) {
              const exames = await resp.json();
              if (exames.length > 0) {
                aplicaExameFisico(exames[0], false);
                carregou = true;
              }
            }
          }
          if (!carregou && !consultaIdSelecionada) {
            const resp = await fetch(
              `${API_BASE_URL}/api/exames-fisicos?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
            );
            if (resp.ok) {
              const exames = await resp.json();
              if (exames.length > 0) aplicaExameFisico(exames[0], true);
            }
          } else if (!carregou && consultaIdSelecionada) {
            setExameFisicoId(null);
          }
        } catch (err) {
          console.error('Erro exames físicos:', err);
        }
        })();
        const secao5 = (async () => {
        // 5. Busca diagnósticos
        const aplicaDiagnostico = (d: any, isFallback: boolean = false) => {
          if (!isFallback) {
            setDiagnosticoId(d.id);
          } else {
            setDiagnosticoId(null);
          }
          setDiagnosticoData({
            diagnosticoPrincipal: d.diagnosticoPrincipal || null,
            outrosDiagnosticos: d.outrosDiagnosticos || [],
            observacoes: d.observacoes || ''
          });
        };
        try {
          let carregou = false;
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const resp = await fetch(
              `${API_BASE_URL}/api/diagnosticos?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (resp.ok) {
              const diagnosticos = await resp.json();
              if (diagnosticos.length > 0) {
                aplicaDiagnostico(diagnosticos[0], false);
                carregou = true;
              }
            }
          }
          if (!carregou && !consultaIdSelecionada) {
            const resp = await fetch(
              `${API_BASE_URL}/api/diagnosticos?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
            );
            if (resp.ok) {
              const diagnosticos = await resp.json();
              if (diagnosticos.length > 0)
              aplicaDiagnostico(diagnosticos[0], true);
            }
          } else if (!carregou && consultaIdSelecionada) {
            setDiagnosticoId(null);
            setDiagnosticoData({
              diagnosticoPrincipal: null,
              outrosDiagnosticos: [],
              observacoes: ''
            });
          }
        } catch (err) {
          console.error('Erro diagnósticos:', err);
        }
        })();
        const secao6 = (async () => {
        // 6. Busca exames solicitados
        let exameSolicitadoCarregado = false;
        let examesSolicitadosIdLocal: string | null = null;
        try {
          // Primeiro tenta pela consultaId da consulta atual
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const resp = await fetch(
              `${API_BASE_URL}/api/exames-solicitados?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (resp.ok) {
              const exames = await resp.json();
              if (exames.length > 0) {
                const e = exames[0];
                // Sempre guarda o ID para que saves futuros atualizem este registro
                examesSolicitadosIdLocal = e.id;
                setExamesSolicitadosId(e.id);
                if (e.professionalId) setProfissionalIdDoExame(e.professionalId);
                // ⭐ Só marca como "carregado" se o exame TEM dados significativos
                const temDadosSignificativos = !!(
                e.descricao ||
                e.pedido ||
                e.justificativa ||
                e.cid10);

                if (temDadosSignificativos) {
                  setExamesData({
                    profissionalId: e.professionalId || '',
                    descricao: e.descricao || '',
                    pedido: e.pedido || '',
                    justificativa: e.justificativa || '',
                    cid10: e.cid10 || ''
                  });
                  exameSolicitadoCarregado = true;
                  console.log(
                    '✅ [Exames] Carregado pela consultaId (com dados):',
                    e.id
                  );
                } else {
                  console.log(
                    '⚠️ [Exames] Exame da consulta atual está vazio, buscando histórico...',
                    e.id
                  );
                }
              }
            }
          }
          // Busca todos por pacienteId
          let todosExames: any[] = [];
          const respTodos = await fetch(
            `${API_BASE_URL}/api/exames-solicitados?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
          );
          if (respTodos.ok) {
            todosExames = await respTodos.json();
          }
          console.log(
            `📋 [Exames] Busca por pacienteId: ${todosExames.length} resultados`
          );
          // ⭐ FALLBACK: Se não encontrou por pacienteId, busca via consultas do paciente
          if (todosExames.length === 0) {
            console.log(
              '⚠️ [Exames] Nenhum por pacienteId, buscando via consultas...'
            );
            try {
              const respConsultas = await fetch(
                `${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&pacienteId=${idPaciente}&limit=150`
              );
              if (respConsultas.ok) {
                const consultasDoPaciente = await respConsultas.json();
                console.log(
                  `📋 [Exames] Paciente tem ${consultasDoPaciente.length} consultas`
                );
                for (const c of consultasDoPaciente) {
                  try {
                    const respEx = await fetch(
                      `${API_BASE_URL}/api/exames-solicitados?clinicaId=${clinicaId}&consultaId=${c.id}`
                    );
                    if (respEx.ok) {
                      const exames = await respEx.json();
                      if (exames.length > 0) {
                        const idsExistentes = new Set(
                          todosExames.map((e: any) => e.id)
                        );
                        exames.forEach((ex: any) => {
                          if (!idsExistentes.has(ex.id)) {
                            todosExames.push(ex);
                            idsExistentes.add(ex.id);
                          }
                        });
                      }
                    }
                  } catch (errEx) {

                    // Ignora erro individual
                  }}
                console.log(
                  `✅ [Exames] Total via consultas: ${todosExames.length}`
                );
              }
            } catch (errConsultas) {
              console.error(
                'Erro ao buscar consultas para exames:',
                errConsultas
              );
            }
          }
          // Processa todos os exames encontrados
          if (todosExames.length > 0) {
            todosExames.sort((a: any, b: any) => {
              const dataA = a.data || a.criadoEm || '';
              const dataB = b.data || b.criadoEm || '';
              return dataB.localeCompare(dataA);
            });
            setExamesHistorico(
              todosExames.map((ex: any) => ({
                id: ex.id,
                data: ex.data || '',
                medico: ex.medico || '',
                descricao: ex.descricao || '',
                pedido: ex.pedido || '',
                justificativa: ex.justificativa || '',
                cid10: ex.cid10 || '',
                profissionalId: ex.professionalId || '',
                consultaId: ex.consultaId || ''
              }))
            );
            // ⭐ Carrega dados do mais recente COM DADOS se não carregou da consulta atual
            if (!exameSolicitadoCarregado) {
              // Encontra o primeiro exame que tem dados significativos
              const exameComDados = todosExames.find(
                (e: any) =>
                e.descricao || e.pedido || e.justificativa || e.cid10
              );
              const e = exameComDados || todosExames[0];
              // ⭐ NÃO sobrescreve examesSolicitadosId se já foi setado pela consulta atual
              if (!examesSolicitadosIdLocal) {
                setExamesSolicitadosId(null);
              }
              if (e.professionalId) setProfissionalIdDoExame(e.professionalId);
              setExamesData({
                profissionalId: e.professionalId || '',
                descricao: e.descricao || '',
                pedido: e.pedido || '',
                justificativa: e.justificativa || '',
                cid10: e.cid10 || ''
              });
              console.log(
                '✅ [Exames] Carregado por fallback (mais recente com dados):',
                e.id
              );
            }
          }
        } catch (err) {
          console.error('Erro exames solicitados:', err);
        }
        })();
        const secao7 = (async () => {
        // 7. Busca prescrições
        try {
          let prescricaoCarregada = false;
          let prescricaoIdLocal: string | null = null;
          // Primeiro tenta pela consultaId da consulta atual
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const respConsulta = await fetch(
              `${API_BASE_URL}/api/prescricoes?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (respConsulta.ok) {
              const prescConsulta = await respConsulta.json();
              if (prescConsulta.length > 0) {
                const p = prescConsulta[0];
                prescricaoIdLocal = p.id;
                setPrescricaoId(p.id);
                const prescData = {
                  controleEspecial: !!p.controleEspecial,
                  data: p.data || new Date().toISOString().split('T')[0],
                  descricao: p.descricao || '',
                  generico: p.generico || '',
                  medicamentos: Array.isArray(p.medicamentos) ?
                  p.medicamentos :
                  []
                };
                setPrescricoesData({
                  prescricoes: JSON.stringify(prescData)
                });
                prescricaoCarregada = true;
                console.log('✅ [Prescrições] Carregada pela consultaId:', p.id);
              }
            }
          }
          // Busca todas por pacienteId para montar histórico
          const resp = await fetch(
            `${API_BASE_URL}/api/prescricoes?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
          );
          if (resp.ok) {
            const todasPrescricoes = await resp.json();
            console.log(
              `📋 [Prescrições] Total do paciente: ${todasPrescricoes.length}`
            );
            if (todasPrescricoes.length > 0) {
              // Se não carregou pela consultaId, usa a mais recente
              if (!prescricaoCarregada) {
                const p = todasPrescricoes[0];
                prescricaoIdLocal = null;
                setPrescricaoId(null);
                const prescData = {
                  controleEspecial: !!p.controleEspecial,
                  data: p.data || new Date().toISOString().split('T')[0],
                  descricao: p.descricao || '',
                  generico: p.generico || '',
                  medicamentos: Array.isArray(p.medicamentos) ?
                  p.medicamentos :
                  []
                };
                setPrescricoesData({
                  prescricoes: JSON.stringify(prescData)
                });
              }
              // Monta histórico (exclui a prescrição atual)
              const historicoPresc = todasPrescricoes.
              filter((p: any) => p.id !== prescricaoIdLocal).
              map((p: any) => ({
                id: p.id,
                data: p.data || '',
                descricao: p.descricao || '',
                prescricao:
                p.descricao ||
                p.generico || (
                Array.isArray(p.medicamentos) && p.medicamentos.length > 0 ?
                p.medicamentos.
                map((m: any) => m.nome || 'Medicamento').
                join(', ') :
                'Sem detalhes'),
                medico: p.professional || '',
                profissionalId: p.professionalId || '',
                medicamentos: Array.isArray(p.medicamentos) ?
                p.medicamentos :
                [],
                controleEspecial: !!p.controleEspecial,
                generico: p.generico || '',
                consultaId: p.consultaId || ''
              }));
              setPrescricoesHistorico(historicoPresc);
              console.log(
                `📋 [Prescrições] Histórico: ${historicoPresc.length} itens`
              );
            }
          }
        } catch (err) {
          console.error('Erro prescrições:', err);
        }
        })();
        const secao8 = (async () => {
        // 8. Busca relatórios
        try {
          let relatorioCarregado = false;
          let relatorioIdLocal: string | null = null;
          // Primeiro tenta pela consultaId da consulta atual
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const respConsulta = await fetch(
              `${API_BASE_URL}/api/relatorios?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (respConsulta.ok) {
              const relConsulta = await respConsulta.json();
              if (relConsulta.length > 0) {
                const r = relConsulta[0];
                relatorioIdLocal = r.id;
                setRelatorioId(r.id);
                const temDados = !!(r.tipo || r.destinatario || r.conteudo);
                if (temDados) {
                  setRelatoriosData({
                    titulo: r.titulo || '',
                    tipo: r.tipo || '',
                    destinatario: r.destinatario || '',
                    data: r.data || new Date().toISOString().split('T')[0],
                    conteudo: r.conteudo || ''
                  });
                  relatorioCarregado = true;
                  console.log(
                    '✅ [Relatórios] Carregado pela consultaId:',
                    r.id
                  );
                }
              }
            }
          }
          // Busca todos por pacienteId para montar histórico
          const respRel = await fetch(
            `${API_BASE_URL}/api/relatorios?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
          );
          if (respRel.ok) {
            const todosRelatorios = await respRel.json();
            console.log(
              `📋 [Relatórios] Total do paciente: ${todosRelatorios.length}`
            );
            if (todosRelatorios.length > 0) {
              // Se não carregou pela consultaId, usa o mais recente
              if (!relatorioCarregado) {
                const r = todosRelatorios[0];
                if (!relatorioIdLocal) {
                  relatorioIdLocal = null;
                  setRelatorioId(null);
                }
                setRelatoriosData({
                  titulo: r.titulo || '',
                  tipo: r.tipo || '',
                  destinatario: r.destinatario || '',
                  data: r.data || new Date().toISOString().split('T')[0],
                  conteudo: r.conteudo || ''
                });
              }
              // Monta histórico (exclui o relatório atual)
              const historicoRel = todosRelatorios.
              filter((r: any) => r.id !== relatorioIdLocal).
              map((r: any) => ({
                id: r.id,
                data: r.data || '',
                titulo: r.titulo || '',
                tipo: r.tipo || '',
                destinatario: r.destinatario || '',
                conteudo: r.conteudo || '',
                medico: r.professional || '',
                consultaId: r.consultaId || ''
              }));
              setRelatoriosHistorico(historicoRel);
              console.log(
                `📋 [Relatórios] Histórico: ${historicoRel.length} itens`
              );
            }
          }
        } catch (err) {
          console.error('Erro relatórios:', err);
        }
        })();
        const secao9 = (async () => {
        // 9. Busca atestados
        try {
          let atestadoCarregado = false;
          let atestadoIdLocal: string | null = null;
          // Primeiro tenta pela consultaId da consulta atual
          if (consultaIdAtual && consultaIdAtual !== 'NOVO') {
            const respConsulta = await fetch(
              `${API_BASE_URL}/api/atestados?clinicaId=${clinicaId}&consultaId=${consultaIdAtual}`
            );
            if (respConsulta.ok) {
              const atestConsulta = await respConsulta.json();
              if (atestConsulta.length > 0) {
                const a = atestConsulta[0];
                atestadoIdLocal = a.id;
                setAtestadoId(a.id);
                const temDados = !!(
                a.medico ||
                a.cid10 ||
                a.horaChegada ||
                a.solicitante);

                if (temDados) {
                  setAtestadoData({
                    medico: a.medico || '',
                    dataReferencia:
                    a.dataReferencia ||
                    new Date().toISOString().split('T')[0],
                    solicitante: a.solicitante || '',
                    horaChegada: a.horaChegada || '08:00',
                    horaSaida: a.horaSaida || '',
                    finalidadePresenca: a.finalidadePresenca || 'consulta',
                    outrosComunicamos: a.outrosComunicamos || 'pode_voltar',
                    cid10: a.cid10 || '',
                    qtdeDias: a.qtdeDias || 0
                  });
                  atestadoCarregado = true;
                  console.log('✅ [Atestados] Carregado pela consultaId:', a.id);
                }
              }
            }
          }
          // Busca todos por pacienteId para montar histórico
          const respAtest = await fetch(
            `${API_BASE_URL}/api/atestados?clinicaId=${clinicaId}&pacienteId=${idPaciente}`
          );
          if (respAtest.ok) {
            const todosAtestados = await respAtest.json();
            console.log(
              `📋 [Atestados] Total do paciente: ${todosAtestados.length}`
            );
            if (todosAtestados.length > 0) {
              // Sem atestado nesta consulta, abre o mais recente do paciente
              // como o documento atual. Preserve o ID: alterações como adicionar
              // um CID-10 devem atualizar este registro, não criar outro.
              if (!atestadoCarregado) {
                const a = todosAtestados[0];
                atestadoIdLocal = a.id;
                setAtestadoId(a.id);
                setAtestadoData({
                  medico: a.medico || '',
                  dataReferencia:
                  a.dataReferencia || new Date().toISOString().split('T')[0],
                  solicitante: a.solicitante || '',
                  horaChegada: a.horaChegada || '08:00',
                  horaSaida: a.horaSaida || '',
                  finalidadePresenca: a.finalidadePresenca || 'consulta',
                  outrosComunicamos: a.outrosComunicamos || 'pode_voltar',
                  cid10: a.cid10 || '',
                  qtdeDias: a.qtdeDias || 0
                });
              }
              // Monta histórico (exclui o atestado atual)
              const historicoAtest = todosAtestados.
              filter((a: any) => a.id !== atestadoIdLocal).
              map((a: any) => ({
                id: a.id,
                dataEmissao: a.dataEmissao || a.criadoEm?.split('T')[0] || '',
                usuario: a.profissional || a.medico || '',
                dataReferencia: a.dataReferencia || '',
                cid10: a.cid10 || '',
                horaChegada: a.horaChegada || '',
                horaSaida: a.horaSaida || '',
                qtdeDias: a.qtdeDias || 0,
                solicitante: a.solicitante || '',
                medico: a.medico || '',
                finalidadePresenca: a.finalidadePresenca || 'consulta',
                outrosComunicamos: a.outrosComunicamos || 'pode_voltar'
              }));
              setAtestadosHistorico(historicoAtest);
              console.log(
                `📋 [Atestados] Histórico: ${historicoAtest.length} itens`
              );
            }
          }
        } catch (err) {
          console.error('Erro atestados:', err);
        }
        })();
        await Promise.all([secao1, secao2, secao3, secao4, secao5, secao6, secao7, secao8, secao9]);
        setDadosCarregados(true);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setDadosCarregados(true);
      } finally {
        if (carregandoDadosRef.current === chaveCarga) carregandoDadosRef.current = null;
      }
    };
    carregarDados();
  }, [pacienteId, clinicaId, consulta, dadosCarregados]);
  // ⭐ Só médico/dentista "atende" — para super admin/admin/atendente o tempo
  // não faz sentido e confunde (eles apenas visualizam o prontuário).
  // ⭐ Tipo do usuário normalizado (evita falha por caixa/espaços).
  const tipoUsuarioNorm = (usuarioLogado?.tipo || '').
  toString().
  toLowerCase().
  trim();
  // ⭐ Profissional clínico: médico, dentista ou o tipo genérico "profissional".
  //    Usado para o cronômetro/banner de atendimento (faz sentido só para quem atende).
  //    Usuário com a permissão "todas as operações no prontuário" também
  //    registra atendimento (inicia/finaliza), pois faz parte das operações.
  const usuarioEhProfissional =
  tipoUsuarioNorm === 'medico' ||
  tipoUsuarioNorm === 'dentista' ||
  tipoUsuarioNorm === 'profissional' ||
  Boolean((usuarioLogado as any)?.prontuarioTotal);
  // ⭐ Profissional clínico DE FATO (tem cadastro de médico/dentista). Um
  // usuário administrativo com a permissão "todas as operações" pode operar o
  // prontuário, mas NÃO pode assinar em nome próprio — ele precisa escolher o
  // profissional responsável.
  const usuarioEhClinico =
  tipoUsuarioNorm === 'medico' ||
  tipoUsuarioNorm === 'dentista' ||
  tipoUsuarioNorm === 'profissional';
  // ⭐ Quem APENAS visualiza (não edita) o prontuário: papéis administrativos.
  //    Denylist explícita — assim qualquer profissional clínico (médico,
  //    dentista, profissional) edita normalmente, sem travar por um `tipo`
  //    que não bata exatamente com a allowlist anterior.
  // ⭐ Permissão explícita do cadastro do usuário: "Liberar todas as operações
  //    no prontuário". Quando marcada, o usuário registra/edita/imprime todas
  //    as etapas mesmo sem ser médico ou dentista. Atendimento assinado
  //    permanece bloqueado para todos.
  const usuarioComProntuarioTotal = Boolean(
    (usuarioLogado as any)?.prontuarioTotal
  );
  const usuarioSomenteVisualiza =
  !usuarioComProntuarioTotal &&
  [
  'super_admin',
  'admin',
  'atendente',
  'recepcao',
  'recepcionista',
  'financeiro'].
  includes(tipoUsuarioNorm);
  // Anuncia o prontuário aberto ao assistente de voz (ditado e tutorial).
  useEffect(() => {
    definirContextoProntuario({
      etapaAtual: currentStep,
      paciente: paciente?.nome || '',
      somenteLeitura: usuarioSomenteVisualiza || consultaAssinada,
      abrirEtapa: (etapa) => handleStepChange(etapa as ProntuarioStep)
    });
  }, [currentStep, paciente?.nome, usuarioSomenteVisualiza, consultaAssinada, handleStepChange]);
  useEffect(() => () => definirContextoProntuario(null), []);
  const handleStartTimer = useCallback(async () => {
    if (timerStatus === 'idle') {
      setInicioAtendimento(new Date());
      setTempoPausado(0);
    } else if (timerStatus === 'paused') {
      setInicioAtendimento(new Date());
    }
    setTimerStatus('running');
    // Se não há consulta real, cria uma ao iniciar o timer
    if (!consultaIdReal) {
      try {
        await garantirConsulta();
      } catch (err) {
        console.error('Erro ao criar consulta ao iniciar timer:', err);
      }
    } else if (onUpdateConsulta) {
      onUpdateConsulta(consultaIdReal, {
        statusAtendimento: 'em_atendimento',
        horaInicioAtendimento: new Date().toISOString(),
        // ⭐ FIX: preserva a modalidade ONLINE ao (re)iniciar o cronômetro pelo
        // prontuário. Sem isto, um atendimento iniciado online era regravado
        // como "presencial" ao passar pelo cronômetro do prontuário.
        ...(consulta?.modalidade === 'online' ?
        {
          modalidade: 'online' as const
        } :
        {}),
        // Limpa qualquer marca de pausa remanescente ao voltar a "em atendimento".
        horaPausaAtendimento: undefined
      });
    }
  }, [
  timerStatus,
  consultaIdReal,
  garantirConsulta,
  onUpdateConsulta,
  consulta]
  );
  const handlePauseTimer = useCallback(() => {
    if (timerStatus === 'running' && inicioAtendimento) {
      const agora = new Date();
      const diff = Math.floor(
        (agora.getTime() - inicioAtendimento.getTime()) / 1000
      );
      setTempoPausado((prev) => prev + diff);
      setTimerStatus('paused');
      // ⭐ FIX: persiste a pausa na consulta para que a Fila de Chegada respeite
      // o comando. Antes, a pausa só alterava o estado local e a fila continuava
      // mostrando "Em atendimento".
      if (consultaIdReal && onUpdateConsulta) {
        onUpdateConsulta(consultaIdReal, {
          statusAtendimento: 'pausado',
          horaPausaAtendimento: agora.toISOString()
        });
      }
    }
  }, [timerStatus, inicioAtendimento, consultaIdReal, onUpdateConsulta]);
  const handleStopTimer = useCallback(async () => {
    const confirmed = await confirm(
      'Encerrar Atendimento',
      'Deseja realmente encerrar este atendimento?',
      'Encerrar',
      'Cancelar'
    );
    if (confirmed) {
      if (timerStatus === 'running' && inicioAtendimento) {
        const agora = new Date();
        const diff = Math.floor(
          (agora.getTime() - inicioAtendimento.getTime()) / 1000
        );
        setTempoPausado((prev) => prev + diff);
      }
      setTimerStatus('stopped');
      if (consultaIdReal && onUpdateConsulta) {
        const fim = new Date();
        const inicioRaw = (consulta as any)?.horaInicioAtendimento;
        const updates: Partial<Consulta> = {
          statusAtendimento: 'finalizado',
          horaFimAtendimento: fim.toISOString(),
          status: 'realizada'
        };
        let tempoTotal = 0;
        if (inicioRaw) {
          const inicio = new Date(inicioRaw);
          if (!isNaN(inicio.getTime())) {
            tempoTotal = Math.max(
              0,
              Math.floor((fim.getTime() - inicio.getTime()) / 1000)
            );
          }
        } else if (inicioAtendimento) {
          tempoTotal = Math.max(
            0,
            Math.floor((fim.getTime() - inicioAtendimento.getTime()) / 1000) +
            tempoPausado
          );
        }
        if (tempoTotal > 0) {
          updates.tempoTotalAtendimento = tempoTotal;
        }
        onUpdateConsulta(consultaIdReal, updates);
        toastSuccess(
          'Atendimento encerrado',
          'O atendimento foi finalizado com sucesso.'
        );
      }
    }
  }, [
  timerStatus,
  inicioAtendimento,
  consultaIdReal,
  onUpdateConsulta,
  consulta,
  toastSuccess]
  );
  // ⭐ Reenvia o convite (link da sala) ao paciente por WhatsApp da clínica.
  // Usado quando o paciente já não tem mais o link e o profissional opta por
  // reenviá-lo antes de reiniciar a consulta. Reutiliza o mesmo caminho de
  // mensagem/WhatsApp usado ao iniciar o atendimento.
  const reenviarConviteWhatsApp = useCallback(
    (): Promise<boolean> =>
    reenviarConviteConsultaOnline({
      clinicaId,
      consultaIdReal,
      consulta,
      paciente,
      toastSuccess,
      toastError,
      toastWarning,
      nomeProfissional: profissionalAtivoNomeRef.current
    }),
  [
  clinicaId,
  consultaIdReal,
  consulta,
  paciente,
  toastSuccess,
  toastError,
  toastWarning]
  );
  // ⭐ Executa de fato a reconexão: reabre a MESMA sala de vídeo desta consulta
  // (link determinístico por consulta), sem finalizar nem alterar o atendimento.
  // O paciente reentra pelo mesmo link já recebido.
  const executarReconexaoVideo = useCallback(() => {
    const idConsulta = consultaIdReal || consulta?.id || '';
    // Link do PACIENTE (attendee) — é o que fica salvo e vai por WhatsApp.
    const linkPaciente = gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: idConsulta,
      linkExistente: consulta?.linkVideo,
      role: 'attendee',
      nome: paciente?.nome || consulta?.pacienteNome || ''
    });
    // Link do MÉDICO (moderator) — é o que abre na janela embutida. No Jitsi é
    // idêntico ao do paciente (papel ignorado); no BBB entra como moderador.
    const linkMedico = gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: idConsulta,
      linkExistente: consulta?.linkVideo,
      role: 'moderator',
      nome: profissionalAtivoNomeRef.current
    });
    // Persiste o link do PACIENTE se ainda não estava salvo OU se foi MIGRADO.
    if (
    consultaIdReal &&
    onUpdateConsulta &&
    linkPaciente !== consulta?.linkVideo)
    {
      onUpdateConsulta(consultaIdReal, {
        modalidade: 'online',
        linkVideo: linkPaciente
      });
    }
    // ⭐ Abre a sala DENTRO do app (janela stay-on-top), sem tirar o profissional
    // do prontuário nem depender de uma nova aba do navegador.
    setVideoModalLink(linkMedico);
    setVideoModalAberto(true);
    toastSuccess(
      'Reconectando à consulta online',
      'A sala de vídeo foi aberta dentro do app.'
    );
  }, [clinicaId, consultaIdReal, consulta, onUpdateConsulta, toastSuccess]);
  // ⭐ Encerra a SALA de vídeo (o atendimento continua aberto no prontuário).
  // O botão X apenas esconde a janela; aqui a consulta online termina de fato —
  // a modalidade volta a ficar sem sala e o link deixa de ser reaberto sozinho.
  const encerrarConsultaOnline = useCallback(() => {
    setVideoModalAberto(false);
    videoAutoAbertoRef.current = consultaIdReal || consulta?.id || 'encerrada';
    toastSuccess(
      'Consulta online encerrada',
      'A sala de vídeo foi fechada. O atendimento continua aberto — use "Reconectar" se precisar retomar o vídeo.'
    );
  }, [consultaIdReal, consulta, toastSuccess]);

  // ⭐ Desfaz a escolha por vídeo (clique acidental na fila): fecha a sala e
  // devolve o atendimento à modalidade presencial, limpando o link salvo para
  // que ele não seja reaberto nem reenviado ao paciente.
  const trocarParaPresencial = useCallback(() => {
    const id = consultaIdReal || consulta?.id || '';
    setVideoModalAberto(false);
    videoAutoAbertoRef.current = id || 'presencial';
    if (id && onUpdateConsulta) {
      onUpdateConsulta(id, {
        modalidade: 'presencial',
        linkVideo: '' as any
      });
    }
    toastSuccess(
      'Atendimento agora é presencial',
      'A sala de vídeo foi encerrada e o atendimento segue normalmente no consultório.'
    );
  }, [consultaIdReal, consulta, onUpdateConsulta, toastSuccess]);

  // ⭐ NOVO: Reconectar à consulta online. Antes de reiniciar, PERGUNTA se o
  // profissional deseja reenviar o convite (link) ao paciente — pois às vezes o
  // paciente já não tem mais o link. A reconexão em si só acontece depois da
  // escolha (reenviar, continuar sem reenviar ou cancelar) no modal.
  const handleReconectarVideo = useCallback(() => {
    reconexaoPendenteRef.current = executarReconexaoVideo;
    setConfirmarReenvioAberto(true);
  }, [executarReconexaoVideo]);
  // Reenvia o convite e SÓ então reconecta.
  const handleReenviarEReconectar = useCallback(async () => {
    setReenviandoConvite(true);
    try {
      await reenviarConviteWhatsApp();
    } finally {
      setReenviandoConvite(false);
    }
    setConfirmarReenvioAberto(false);
    const acao = reconexaoPendenteRef.current;
    reconexaoPendenteRef.current = null;
    acao?.();
  }, [reenviarConviteWhatsApp]);
  // Reconecta SEM reenviar o convite (o paciente ainda tem o link).
  const handleReconectarSemReenviar = useCallback(() => {
    setConfirmarReenvioAberto(false);
    const acao = reconexaoPendenteRef.current;
    reconexaoPendenteRef.current = null;
    acao?.();
  }, []);
  // Cancela: não reconecta nem reenvia.
  const handleCancelarReconexao = useCallback(() => {
    setConfirmarReenvioAberto(false);
    reconexaoPendenteRef.current = null;
  }, []);
  // ⭐ NOVO: Abre a sala de vídeo AUTOMATICAMENTE dentro do app quando o
  // profissional entra em uma consulta ONLINE que está em atendimento. Assim,
  // ao "Iniciar atendimento" (ou "Reabrir Sala") na Fila, a videochamada abre
  // embutida no app — sem escancarar o navegador em uma nova aba. Usamos um ref
  // por consulta para abrir só uma vez (a página re-renderiza a cada segundo).
  useEffect(() => {
    if (consulta?.modalidade !== 'online') return;
    const id = consultaIdReal || consulta?.id || '';
    if (!id || id === 'NOVO') return;
    const status =
    (consulta as any).statusAtendimento || (consulta as any).status;
    if (status === 'finalizado') return;
    if (videoAutoAbertoRef.current === id) return;
    videoAutoAbertoRef.current = id;
    // Paciente (salvo/WhatsApp) x Médico (janela embutida) — ver comentário no
    // handleReconectarVideo. No Jitsi ambos são idênticos.
    const linkPaciente = gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: id,
      linkExistente: consulta?.linkVideo,
      role: 'attendee',
      nome: paciente?.nome || consulta?.pacienteNome || ''
    });
    const linkMedico = gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: id,
      linkExistente: consulta?.linkVideo,
      role: 'moderator',
      nome: profissionalAtivoNomeRef.current
    });
    // Persiste o link do PACIENTE se estava vazio ou foi migrado.
    if (
    consultaIdReal &&
    onUpdateConsulta &&
    linkPaciente !== consulta?.linkVideo)
    {
      onUpdateConsulta(consultaIdReal, {
        modalidade: 'online',
        linkVideo: linkPaciente
      });
    }
    setVideoModalLink(linkMedico);
    setVideoModalAberto(true);
  }, [
  consulta?.modalidade,
  consulta?.linkVideo,
  consultaIdReal,
  clinicaId,
  onUpdateConsulta]
  );
  // ⭐ NOVO (caminho DETERMINÍSTICO): abre a sala embutida a partir da intenção
  // gravada pela Fila (localStorage `abrirConsultaOnline`). Isto funciona mesmo
  // quando a consulta acabou de virar "online" (a atualização de modalidade é
  // assíncrona e o efeito acima ainda não teria o dado). Assim, ao "Iniciar
  // atendimento"/"Reabrir Sala", a janela de vídeo SEMPRE abre dentro do app.
  useEffect(() => {
    const id = consultaIdReal || '';
    if (!id || id === 'NOVO') return;
    let intent: {
      consultaId?: string;
      link?: string;
    } | null = null;
    try {
      const raw = localStorage.getItem('abrirConsultaOnline');
      if (raw) intent = JSON.parse(raw);
    } catch {
      intent = null;
    }
    if (!intent || intent.consultaId !== id || !intent.link) return;
    // Consome a intenção (não reabrir em recarregamentos futuros).
    try {
      localStorage.removeItem('abrirConsultaOnline');
    } catch {

      /* ignore */}
    videoAutoAbertoRef.current = id;
    // Persiste o link do PACIENTE (attendee) na consulta — é o que o WhatsApp e o
    // botão Reconectar usam. A intenção (intent.link) carrega o link do MÉDICO
    // (moderator), que serve só para abrir a janela embutida agora. No Jitsi os
    // dois são idênticos.
    const linkPaciente = gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: id,
      linkExistente: consulta?.linkVideo,
      role: 'attendee',
      nome: paciente?.nome || consulta?.pacienteNome || ''
    });
    if (onUpdateConsulta && linkPaciente !== consulta?.linkVideo) {
      onUpdateConsulta(id, {
        modalidade: 'online',
        linkVideo: linkPaciente
      });
    }
    setVideoModalLink(intent.link);
    setVideoModalAberto(true);
  }, [consultaIdReal, consulta?.linkVideo, onUpdateConsulta, clinicaId]);
  // Timer do atendimento — só roda para profissionais que atendem.
  useEffect(() => {
    if (
    !usuarioEhProfissional ||
    timerStatus !== 'running' ||
    !inicioAtendimento)

    return;
    const timer = setInterval(() => {
      const agora = new Date();
      const diff =
      Math.floor((agora.getTime() - inicioAtendimento.getTime()) / 1000) +
      tempoPausado;
      const horas = Math.floor(diff / 3600);
      const minutos = Math.floor(diff % 3600 / 60);
      const segundos = diff % 60;
      if (horas > 0) {
        setTempoAtendimento(
          `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`
        );
      } else {
        setTempoAtendimento(
          `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`
        );
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [inicioAtendimento, usuarioEhProfissional, timerStatus, tempoPausado]);
  // ⭐⭐⭐ PROFISSIONAL DO ATENDIMENTO (fonte ÚNICA de verdade).
  // Quem entrou no sistema com credenciais de profissional clínico É o
  // profissional que está de fato atendendo e assinando — então ele tem
  // PRIORIDADE absoluta. Só quando o usuário logado NÃO é clínico (atendente/
  // admin apenas visualizando) caímos para o profissional gravado na consulta.
  // Enriquecemos o usuário logado com os dados completos (CRM/UF/título) já
  // carregados em `profissionaisDisponiveis`, para que o cabeçalho e a
  // impressão saiam corretos sem depender de um fetch extra.
  const usuarioLogadoEnriquecido = useMemo(() => {
    if (!usuarioLogado || !usuarioEhClinico) return null;
    const match = profissionaisDisponiveis.find(
      (p) => p.id === usuarioLogado.id
    );
    return {
      id: usuarioLogado.id,
      nome: match?.nome || usuarioLogado.nome || '',
      crm: match?.crm || '',
      uf: match?.uf || '',
      tipo: match?.tipo || tipoUsuarioNorm,
      especialidade: '',
      especialidades: '',
      titulo: match?.titulo || '',
      cabecalhoRelatorio: match?.cabecalhoRelatorio || '',
      rqes: [] as any
    };
  }, [usuarioLogado, usuarioEhClinico, profissionaisDisponiveis, tipoUsuarioNorm]);
  // ⭐ Profissional escolhido manualmente para TODO o prontuário. Só existe
  // quando o usuário logado não é clínico: nesse caso ele indica em nome de
  // quem cada etapa será gravada, no lugar de travar em "selecione um
  // profissional". A escolha é lembrada por paciente.
  const chaveProfissionalManual = `prontuario.profissionalManual.${clinicaId || 'sem-clinica'}.${consulta?.pacienteId || pacienteId || 'sem-paciente'}`;
  const [profissionalManualId, setProfissionalManualId] = useState<string>('');
  useEffect(() => {
    try {
      setProfissionalManualId(
        localStorage.getItem(chaveProfissionalManual) || ''
      );
    } catch {
      setProfissionalManualId('');
    }
  }, [chaveProfissionalManual]);
  const selecionarProfissionalManual = useCallback(
    (id: string) => {
      setProfissionalManualId(id);
      try {
        if (id) localStorage.setItem(chaveProfissionalManual, id);else
        localStorage.removeItem(chaveProfissionalManual);
      } catch {}
    },
    [chaveProfissionalManual]
  );
  const profissionalManual = useMemo(() => {
    if (usuarioEhClinico || !profissionalManualId) return null;
    const p = profissionaisDisponiveis.find(
      (item) => item.id === profissionalManualId
    );
    if (!p) return null;
    return {
      id: p.id,
      nome: p.nome,
      crm: p.crm || '',
      uf: p.uf || '',
      tipo: p.tipo || '',
      especialidade: '',
      especialidades: '',
      titulo: p.titulo || '',
      cabecalhoRelatorio: p.cabecalhoRelatorio || '',
      rqes: [] as any
    };
  }, [usuarioEhClinico, profissionalManualId, profissionaisDisponiveis]);
  // Profissional efetivo do atendimento aberto. Prioridade:
  // 1) usuário logado clínico (quem está atendendo agora);
  // 2) profissional resolvido da consulta;
  // 3) último profissional do histórico;
  // 4) apenas o nome gravado na consulta (sem cadastro completo).
  const profissionalAtivo = useMemo(() => {
    // Escolha explícita do usuário tem prioridade — foi uma decisão dele.
    if (profissionalManual) return profissionalManual;
    if (usuarioLogadoEnriquecido) return usuarioLogadoEnriquecido;
    if (profissionalDaConsulta) return profissionalDaConsulta;
    if (ultimoProfissional) return ultimoProfissional;
    const nome = (consulta?.profissional || nomeProfissionalAtivo || '').trim();
    if (nome) {
      return {
        id: consulta?.profissionalId || '',
        nome,
        crm: '',
        uf: '',
        tipo: consulta?.profissionalTipo as string || '',
        especialidade: '',
        especialidades: '',
        titulo: consulta?.profissionalTitulo as string || '',
        cabecalhoRelatorio: '',
        rqes: [] as any
      };
    }
    return null;
  }, [
  profissionalManual,
  usuarioLogadoEnriquecido,
  profissionalDaConsulta,
  ultimoProfissional,
  consulta?.profissional,
  consulta?.profissionalId,
  consulta?.profissionalTipo,
  consulta?.profissionalTitulo,
  nomeProfissionalAtivo]
  );
  // ⭐⭐⭐ RESOLVEDOR ÚNICO de profissional para GRAVAÇÃO.
  // Usa `profissionalAtivo`. Basta um NOME para gravar (o backend persiste por
  // nome); o id é repassado quando existir. Assim o save NUNCA mais acusa
  // "selecione um profissional" enquanto há um profissional logado/atendendo.
  const resolverProfissionalParaSave = useCallback((): {
    profissionalId: string;
    profissional: string;
  } | null => {
    const nome = (profissionalAtivo?.nome || '').trim();
    if (nome) {
      return {
        profissionalId: String(profissionalAtivo?.id || ''),
        profissional: nome
      };
    }
    // ⭐ FALLBACK: em um atendimento NOVO aberto por usuário não clínico
    // (atendente/recepção) não há profissional na consulta nem no histórico.
    // O responsável do cadastro do paciente — o mesmo exibido no cabeçalho —
    // é o responsável clínico correto, e sem ele o save morria em
    // "Selecione um profissional responsável para salvar".
    const nomeResponsavel = (
    profissionalResponsavel?.nome ||
    (paciente as any)?.profissionalResponsavel ||
    '').
    trim();
    if (nomeResponsavel) {
      return {
        profissionalId: String(
          (paciente as any)?.profissionalResponsavelId || ''
        ),
        profissional: nomeResponsavel
      };
    }
    return null;
  }, [profissionalAtivo, profissionalResponsavel, paciente]);
  // Mantém o ref sincronizado para que garantirConsulta() consiga resolver o
  // profissional sem depender da ordem de declaração dos callbacks.
  useEffect(() => {
    resolverProfissionalParaSaveRef.current = resolverProfissionalParaSave;
  }, [resolverProfissionalParaSave]);
  // Mantém o ref do NOME do profissional ativo sincronizado, para os callbacks
  // de vídeo (handleReconectarVideo / auto-open) rotularem o moderador no BBB
  // sem depender de `profissionalAtivo` (evita a dependência circular/TDZ).
  useEffect(() => {
    profissionalAtivoNomeRef.current = profissionalAtivo?.nome || '';
  }, [profissionalAtivo]);
  // ⭐⭐⭐ FASE 1: Helper unificado que TODO save usa antes de gravar.
  // O fallback é usado somente quando uma etapa já informa explicitamente o
  // profissional responsável — como no Atestado emitido por um atendente.
  const prepararSave = useCallback(
    async (
    contexto: string,
    profissionalAlternativo?: {profissionalId: string;profissional: string;})
    : Promise<{
      consultaId: string;
      prof: {
        profissionalId: string;
        profissional: string;
      };
    }> => {
      if (consultaAssinada) {
        throw new Error('Atendimento assinado — somente leitura.');
      }
      const prof = profissionalAlternativo || resolverProfissionalParaSave();
      if (!prof?.profissional.trim()) {
        throw new Error('Selecione um profissional responsável para salvar.');
      }
      let cId = consultaIdReal;
      if (!cId) {
        cId = await garantirConsulta(prof);
      }
      if (!cId) {
        throw new Error(
          'Não foi possível criar a consulta deste atendimento. Tente novamente.'
        );
      }
      return {
        consultaId: cId,
        prof
      };
    },
    [
    consultaAssinada,
    consultaIdReal,
    resolverProfissionalParaSave,
    garantirConsulta]

  );
  // ⭐ Salvar anamnese — direto na tabela anamneses
  const handleSaveAnamnese = useCallback(
    async (data: AnamneseData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      setAnamneseData(data);
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Anamnese');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar a anamnese', err.message);
        throw err;
      }
      try {
        // ⭐ DIÁRIO: cada salvamento cria um NOVO registro independente (POST),
        // nunca sobrescreve o anterior — mesmo dentro do mesmo atendimento.
        const resp = await fetch(`${API_BASE_URL}/api/anamneses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId: consultaIdReal,
            pacienteId: idPaciente,
            queixaPrincipal: data.queixaPrincipal,
            historiaQueixa: data.historiaQueixa,
            historicoDoencas: data.historicoDoencas,
            alergias: data.alergias,
            medicamentosEmUso: data.medicamentosEmUso,
            historicoFamiliar: data.historicoFamiliar,
            habitosVida: data.habitosVida,
            profissional: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId,
            data: consulta?.data || new Date().toISOString().split('T')[0]
          })
        });
        // Resposta de erro do servidor também é falha (antes passava em silêncio
        // e o rascunho seria apagado como se tivesse salvo).
        if (!resp.ok) {
          const erro = await resp.json().catch(() => ({}));
          throw new Error(erro.error || 'O servidor não aceitou a anamnese.');
        }
        if (resp.ok) {
          const result = await resp.json();
          setAnamneseId(result.id);
        }
        // Salva dados persistentes no prontuário
        const pId = await garantirProntuario();
        if (pId) {
          await fetch(`${API_BASE_URL}/api/prontuarios/${pId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId,
              alergias: data.alergias,
              doencasCronicas: data.historicoDoencas,
              medicamentosEmUso: data.medicamentosEmUso,
              historicoFamiliar: data.historicoFamiliar
            })
          });
        }
        // ⭐ LGPD: Registra edição de anamnese
        if (clinicaId) {
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_ANAMNESE',
            entidade: 'anamnese',
            entidadeId: anamneseId || '',
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Salvou dados de anamnese'
          });
        }
        setResumoRefreshKey((prev) => prev + 1);
      } catch (err: any) {
        console.error('❌ Erro ao salvar anamnese:', err);
        toastError(
          'Erro ao salvar a anamnese',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    anamneseId,
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    garantirProntuario,
    paciente,
    toastError]

  );
  // ⭐ Salvar exame físico
  const handleSaveExameFisico = useCallback(
    async (data: ExameFisicoData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      setExameFisicoData(data);
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Exame Físico');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar o exame físico', err.message);
        throw err;
      }
      try {
        // ⭐ DIÁRIO: cada salvamento cria um NOVO registro independente (POST).
        const resp = await fetch(`${API_BASE_URL}/api/exames-fisicos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId: consultaIdReal,
            pacienteId: idPaciente,
            ...data,
            profissional: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId,
            data: consulta?.data || new Date().toISOString().split('T')[0]
          })
        });
        // Resposta de erro do servidor também é falha (antes passava em silêncio
        // e o rascunho seria apagado como se tivesse salvo).
        if (!resp.ok) {
          const erro = await resp.json().catch(() => ({}));
          throw new Error(erro.error || 'O servidor não aceitou o exame físico.');
        }
        if (resp.ok) {
          const r = await resp.json();
          setExameFisicoId(r.id);
        }
        if (clinicaId) {
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_EXAME_FISICO',
            entidade: 'exame_fisico',
            entidadeId: exameFisicoId || '',
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Salvou exame físico'
          });
        }
      } catch (err: any) {
        console.error('❌ Erro ao salvar exame físico:', err);
        toastError(
          'Erro ao salvar o exame físico',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    exameFisicoId,
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    paciente,
    toastError]

  );
  // ⭐ Salvar diagnóstico
  const handleSaveDiagnostico = useCallback(
    async (data: DiagnosticoData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      setDiagnosticoData(data);
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Diagnóstico');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar o diagnóstico', err.message);
        throw err;
      }
      try {
        // ⭐ DIÁRIO: cada salvamento cria um NOVO registro independente (POST).
        const resp = await fetch(`${API_BASE_URL}/api/diagnosticos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId: consultaIdReal,
            pacienteId: idPaciente,
            diagnosticoPrincipal: data.diagnosticoPrincipal,
            outrosDiagnosticos: data.outrosDiagnosticos,
            observacoes: data.observacoes,
            profissional: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId,
            data: consulta?.data || new Date().toISOString().split('T')[0]
          })
        });
        // Resposta de erro do servidor também é falha (antes passava em silêncio
        // e o rascunho seria apagado como se tivesse salvo).
        if (!resp.ok) {
          const erro = await resp.json().catch(() => ({}));
          throw new Error(erro.error || 'O servidor não aceitou o diagnóstico.');
        }
        if (resp.ok) {
          const r = await resp.json();
          setDiagnosticoId(r.id);
        }
        if (clinicaId) {
          const idPac = consulta?.pacienteId || pacienteId || '';
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_DIAGNOSTICO',
            entidade: 'diagnostico',
            entidadeId: diagnosticoId || '',
            pacienteId: idPac,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Salvou diagnóstico'
          });
        }
      } catch (err: any) {
        console.error('❌ Erro ao salvar diagnóstico:', err);
        toastError(
          'Erro ao salvar o diagnóstico',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    diagnosticoId,
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    paciente,
    toastError]

  );
  // ⭐ Salvar evolução
  // ⭐ FASE 3: Evolução como diário. Cada save cria um NOVO registro.
  const handleSaveEvolucao = useCallback(
    async (data: EvolucaoData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      // Antes esta função retornava em SILÊNCIO quando faltava paciente/clínica:
      // a evolução não era salva e o usuário não recebia nenhuma explicação.
      if (!idPaciente || !clinicaId) {
        const msg = !idPaciente ?
        'Paciente não identificado no atendimento. Reabra o prontuário pelo paciente ou pela agenda.' :
        'Clínica não identificada na sessão. Selecione a clínica novamente.';
        toastError('Não foi possível salvar a evolução', msg);
        throw new Error(msg);
      }
      // Atualiza o resumo com a evolução mais recente
      setEvolucaoData(data);
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Evolução');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar a evolução', err.message);
        throw err;
      }
      const dataRegistro =
      (consulta?.data || '').slice(0, 10) ||
      new Date().toISOString().split('T')[0];
      try {
        const resp = await fetch(`${API_BASE_URL}/api/evolucoes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId: consultaIdReal,
            pacienteId: idPaciente,
            evolucao: data.evolucaoAtual,
            profissional: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId,
            data: dataRegistro
          })
        });
        let novoId = '';
        // A resposta de ERRO era ignorada: o sistema seguia para
        // "Evolução adicionada" mesmo quando o servidor recusava o registro.
        if (!resp.ok) {
          let detalhe = `O servidor recusou o registro (HTTP ${resp.status}).`;
          try {
            const corpo = await resp.json();
            if (corpo?.error) detalhe = String(corpo.error);
          } catch {

            /* resposta sem JSON */}
          throw new Error(detalhe);
        }
        const r = await resp.json();
        novoId = r.id;
        // Não setamos mais evolucaoId único, pois agora é uma lista
        if (clinicaId) {
          const idPac = consulta?.pacienteId || pacienteId || '';
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_EVOLUCAO',
            entidade: 'evolucao',
            entidadeId: novoId,
            pacienteId: idPac,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Adicionou nova evolução clínica'
          });
        }
        toastSuccess('Evolução adicionada', undefined, 2000);
        // Devolve o registro criado para o histórico exibi-lo IMEDIATAMENTE,
        // sem depender de uma recarga da lista.
        return {
          id: novoId,
          data: dataRegistro,
          texto: data.evolucaoAtual,
          profissionalId: profResolvido.profissionalId,
          profissionalNome: profResolvido.profissional
        };
      } catch (err: any) {
        console.error('❌ Erro ao salvar evolução:', err);
        toastError(
          'Erro ao salvar a evolução',
          err?.message || 'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    paciente,
    toastError,
    toastSuccess]

  );
  const handleEditarEvolucao = useCallback(
    async (id: string, texto: string) => {
      if (!clinicaId) return;
      try {
        const resp = await fetch(`${API_BASE_URL}/api/evolucoes/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            evolucao: texto
          })
        });
        if (!resp.ok) {
          let detalhe = `O servidor recusou a alteração (HTTP ${resp.status}).`;
          try {
            const corpo = await resp.json();
            if (corpo?.error) detalhe = String(corpo.error);
          } catch {

            /* resposta sem JSON */}
          throw new Error(detalhe);
        }
        toastSuccess('Evolução atualizada');
        if (clinicaId) {
          const idPac = consulta?.pacienteId || pacienteId || '';
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_EVOLUCAO',
            entidade: 'evolucao',
            entidadeId: id,
            pacienteId: idPac,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Editou evolução clínica existente'
          });
        }
      } catch (err: any) {
        console.error('Erro ao editar evolução:', err);
        toastError(
          'Erro ao editar',
          err?.message || 'Não foi possível atualizar a evolução.'
        );
        throw err;
      }
    },
    [clinicaId, consulta, pacienteId, paciente, toastSuccess, toastError]
  );
  const handleExcluirEvolucao = useCallback(
    async (id: string) => {
      if (!clinicaId) return;
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/evolucoes/${id}?clinicaId=${clinicaId}`,
          {
            method: 'DELETE'
          }
        );
        if (!resp.ok) throw new Error('Falha ao excluir');
        toastSuccess('Evolução excluída');
        if (clinicaId) {
          const idPac = consulta?.pacienteId || pacienteId || '';
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_EVOLUCAO',
            entidade: 'evolucao',
            entidadeId: id,
            pacienteId: idPac,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Excluiu evolução clínica'
          });
        }
      } catch (err) {
        console.error('Erro ao excluir evolução:', err);
        toastError('Erro ao excluir', 'Não foi possível excluir a evolução.');
        throw err;
      }
    },
    [clinicaId, consulta, pacienteId, paciente, toastSuccess, toastError]
  );
  // ⭐ Salvar odontograma — direto na consulta (campo odontograma LONGTEXT)
  const handleSaveOdontograma = useCallback(
    async (data: Record<string, any>) => {
      if (consultaAssinada) return;
      const cId = consultaIdAtual;
      if (!cId || !clinicaId) {
        console.error(
          '❌ [Odontograma] Não pode salvar: consultaId=',
          cId,
          'clinicaId=',
          clinicaId
        );
        return;
      }
      setOdontogramaData(data);
      try {
        const respOdonto = await fetch(`${API_BASE_URL}/api/consultas/${cId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            odontograma: data
          })
        });
        if (!respOdonto.ok) {
          const erro = await respOdonto.json().catch(() => ({}));
          throw new Error(erro.error || 'O servidor não aceitou o odontograma.');
        }
        console.log('✅ [Odontograma] Salvo na consulta:', cId);
        if (clinicaId) {
          const idPac = consulta?.pacienteId || pacienteId || '';
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_ODONTOGRAMA',
            entidade: 'consulta',
            entidadeId: cId,
            pacienteId: idPac,
            pacienteNome: paciente?.nome || '',
            detalhes: `Salvou odontograma com ${Object.keys(data).length} dente(s)`
          });
        }
      } catch (err: any) {
        console.error('❌ Erro ao salvar odontograma:', err);
        toastError('Não foi possível salvar o odontograma', err?.message || 'Verifique a conexão e tente novamente.');
        throw err;
      }
    },
    [
    consultaAssinada,
    consultaIdAtual,
    clinicaId,
    consulta,
    pacienteId,
    paciente,
    toastError]

  );
  // ⭐ Salvar exames solicitados
  const handleSaveExames = useCallback(
    async (data: ExamesData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) {
        console.error(
          '❌ [Exames] Não pode salvar: pacienteId=',
          idPaciente,
          'clinicaId=',
          clinicaId
        );
        return;
      }
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Exames');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar o exame solicitado', err.message);
        throw err;
      }
      const profIdExame =
      data.profissionalId || profResolvido.profissionalId || '';
      const profNomeExame = profResolvido.profissional || '';
      console.log('💾 [Exames] Salvando novo registro...');
      setExamesData(data);
      try {
        // Cada salvamento cria um NOVO registro (POST), EXCETO quando a etapa
        // informa `registroId`: aí o pedido em edição é atualizado (PUT), para
        // que alterar a seleção não gere vários pedidos iguais no histórico.
        const atualizandoExame = !!data.registroId;
        let novoIdExame = data.registroId || '';
        const resp = await fetch(
          atualizandoExame ?
          `${API_BASE_URL}/api/exames-solicitados/${data.registroId}` :
          `${API_BASE_URL}/api/exames-solicitados`,
          {
            method: atualizandoExame ? 'PUT' : 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId,
              ...(atualizandoExame ?
              {} :
              {
                consultaId: consultaIdReal,
                pacienteId: idPaciente
              }),
              descricao: data.descricao,
              pedido: data.pedido,
              justificativa: data.justificativa,
              cid10: data.cid10,
              profissionalId: profIdExame,
              ...(atualizandoExame ? {} : { profissional: profNomeExame }),
              data: consulta?.data || new Date().toISOString().split('T')[0]
            })
          }
        );
        if (!resp.ok) {
          // Não trate recusa do servidor como sucesso: sem isso a tela avisa
          // "salvo" e o registro nunca chega ao histórico.
          const erro = await resp.json().catch(() => ({}));
          throw new Error(
            erro.error || 'O servidor não aceitou a solicitação de exames.'
          );
        }
        const r = await resp.json().catch(() => ({}) as any);
        if (!atualizandoExame) novoIdExame = r.id || '';
        if (novoIdExame) {
          setExamesSolicitadosId(novoIdExame);
          examesSolicitadosIdRef.current = novoIdExame;
        }
        // ⭐ Aparece no histórico imediatamente, sem reabrir o prontuário.
        const dataExame =
        consulta?.data || new Date().toISOString().split('T')[0];
        setExamesHistorico((previous) => {
          const item = {
            id: novoIdExame,
            data: dataExame,
            medico: profNomeExame,
            descricao: data.descricao || '',
            pedido: data.pedido || '',
            justificativa: data.justificativa || '',
            cid10: data.cid10 || '',
            profissionalId: profIdExame,
            consultaId: consultaIdReal
          };
          const existe = previous.some(
            (p) => p.id && novoIdExame && p.id === novoIdExame
          );
          if (!existe) return [item, ...previous];
          return previous.map((p) =>
          p.id === novoIdExame ? { ...p, ...item } : p
          );
        });
        if (clinicaId) {
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_EXAME',
            entidade: 'exame_solicitado',
            entidadeId: novoIdExame || '',
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || '',
            detalhes: atualizandoExame ?
            'Atualizou exame solicitado' :
            'Salvou exame solicitado'
          });
        }
        return { id: novoIdExame };
      } catch (err: any) {
        console.error('❌ Erro ao salvar exames:', err);
        toastError(
          'Erro ao salvar o exame solicitado',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [clinicaId, pacienteId, consulta, prepararSave, paciente, toastError]
  );
  // ⭐ Salvar prescrições
  const handleSavePrescricoes = useCallback(
    async (data: any) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Prescrições');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar a prescrição', err.message);
        throw err;
      }
      const prescricoesStr =
      typeof data === 'string' ? data : JSON.stringify(data);
      setPrescricoesData({
        prescricoes: prescricoesStr
      });
      try {
        // ⭐ DIÁRIO: cada salvamento cria um NOVO registro independente (POST).
        let novoIdPresc = '';
        const resp = await fetch(`${API_BASE_URL}/api/prescricoes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId: consultaIdReal,
            pacienteId: idPaciente,
            prescricoes: prescricoesStr,
            controleEspecial: data?.controleEspecial || false,
            data:
            data?.data ||
            consulta?.data ||
            new Date().toISOString().split('T')[0],
            descricao: data?.descricao || '',
            generico: data?.generico || '',
            medicamentos: data?.medicamentos || [],
            profissional: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId
          })
        });
        if (!resp.ok) {
          const erro = await resp.json().catch(() => ({}));
          throw new Error(
            erro.error || 'O servidor não aceitou a prescrição.'
          );
        }
        const r = await resp.json().catch(() => ({}) as any);
        novoIdPresc = r.id || '';
        if (r.id) setPrescricaoId(r.id);
        // ⭐ Aparece no histórico imediatamente, sem reabrir o prontuário.
        const medicamentosPresc = Array.isArray(data?.medicamentos) ?
        data.medicamentos :
        [];
        setPrescricoesHistorico((previous) => {
          const item = {
            id: novoIdPresc,
            data:
            data?.data ||
            consulta?.data ||
            new Date().toISOString().split('T')[0],
            descricao: data?.descricao || '',
            prescricao:
            data?.descricao ||
            data?.generico || (
            medicamentosPresc.length > 0 ?
            medicamentosPresc.
            map((m: any) => m.nome || 'Medicamento').
            join(', ') :
            'Sem detalhes'),
            medico: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId,
            medicamentos: medicamentosPresc,
            controleEspecial: !!data?.controleEspecial,
            generico: data?.generico || '',
            consultaId: consultaIdReal
          };
          const existe = previous.some(
            (p) => p.id && novoIdPresc && p.id === novoIdPresc
          );
          if (!existe) return [item, ...previous];
          return previous.map((p) =>
          p.id === novoIdPresc ? { ...p, ...item } : p
          );
        });
        if (clinicaId) {
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_PRESCRICAO',
            entidade: 'prescricao',
            entidadeId: novoIdPresc || '',
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Salvou prescrição'
          });
        }
      } catch (err: any) {
        console.error('❌ Erro ao salvar prescrições:', err);
        toastError(
          'Erro ao salvar a prescrição',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    prescricaoId,
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    paciente,
    toastError]

  );
  // ⭐ Salvar relatórios
  const handleSaveRelatorios = useCallback(
    async (data: RelatorioData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      setRelatoriosData(data);
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      try {
        const prep = await prepararSave('Relatório');
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar o relatório', err.message);
        throw err;
      }
      try {
        // ⭐ DIÁRIO: cada salvamento cria um NOVO registro independente (POST).
        let novoIdRel = '';
        const resp = await fetch(`${API_BASE_URL}/api/relatorios`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            consultaId: consultaIdReal,
            pacienteId: idPaciente,
            ...data,
            profissional: profResolvido.profissional,
            profissionalId: profResolvido.profissionalId
          })
        });
        if (!resp.ok) {
          const erro = await resp.json().catch(() => ({}));
          throw new Error(erro.error || 'O servidor não aceitou o relatório.');
        }
        const r = await resp.json().catch(() => ({}) as any);
        novoIdRel = r.id || '';
        if (r.id) setRelatorioId(r.id);
        // ⭐ Aparece no histórico imediatamente, sem reabrir o prontuário.
        setRelatoriosHistorico((previous) => {
          const item = {
            id: novoIdRel,
            data:
            data.data || new Date().toISOString().split('T')[0],
            titulo: data.titulo || '',
            tipo: data.tipo || '',
            destinatario: data.destinatario || '',
            conteudo: data.conteudo || '',
            medico: profResolvido.profissional,
            consultaId: consultaIdReal
          };
          const existe = previous.some(
            (p) => p.id && novoIdRel && p.id === novoIdRel
          );
          if (!existe) return [item, ...previous];
          return previous.map((p) =>
          p.id === novoIdRel ? { ...p, ...item } : p
          );
        });
        if (clinicaId) {
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_RELATORIO',
            entidade: 'relatorio',
            entidadeId: novoIdRel || '',
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Salvou relatório'
          });
        }
      } catch (err: any) {
        console.error('❌ Erro ao salvar relatório:', err);
        toastError(
          'Erro ao salvar o relatório',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    relatorioId,
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    paciente,
    toastError]

  );
  // ⭐ Salvar atestado
  const handleSaveAtestado = useCallback(
    async (data: AtestadoData) => {
      const idPaciente = consulta?.pacienteId || pacienteId;
      if (!idPaciente || !clinicaId) return;
      setAtestadoData(data);
      let consultaIdReal: string;
      let profResolvido: {
        profissionalId: string;
        profissional: string;
      };
      // O responsável pelo atestado é o médico indicado no documento, não
      // necessariamente a pessoa que está logada no sistema.
      const nomeMedicoAtestado = (
      data.medico ||
      profissionalDaConsulta?.nome ||
      ultimoProfissional?.nome ||
      '').
      trim();
      const medicoCadastrado = profissionaisDisponiveis.find(
        (profissional) =>
        profissional.nome.trim().toLowerCase() ===
        nomeMedicoAtestado.toLowerCase()
      );
      const profissionalDoAtestado = nomeMedicoAtestado ?
      {
        profissionalId: medicoCadastrado?.id || profissionalDaConsulta?.id || '',
        profissional: nomeMedicoAtestado
      } :
      undefined;
      try {
        const prep = await prepararSave('Atestado', profissionalDoAtestado);
        consultaIdReal = prep.consultaId;
        profResolvido = prep.prof;
      } catch (err: any) {
        toastError('Não foi possível salvar o atestado', err.message);
        throw err;
      }
      try {
        const payload = {
          clinicaId,
          consultaId: consultaIdReal,
          pacienteId: idPaciente,
          ...data,
          profissional: profResolvido.profissional,
          profissionalId: profResolvido.profissionalId
        };
        const isEditingAtestado = Boolean(atestadoId);
        const endpoint = isEditingAtestado ?
        `${API_BASE_URL}/api/atestados/${atestadoId}` :
        `${API_BASE_URL}/api/atestados`;
        const resp = await fetch(endpoint, {
          method: isEditingAtestado ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const result = await resp.json().catch(() => ({}));
          throw new Error(result.error || 'Não foi possível salvar o atestado.');
        }
        const result = await resp.json().catch(() => ({}));
        const novoIdAtestado = isEditingAtestado ? atestadoId || '' : result.id || '';
        if (!isEditingAtestado && result.id) {
          setAtestadoId(result.id);
        }
        setAtestadoData(data);
        setAtestadosHistorico((previous) => {
          const historicoItem = {
            id: novoIdAtestado,
            dataEmissao: new Date().toISOString().split('T')[0],
            usuario: profResolvido.profissional,
            medico: data.medico || profResolvido.profissional,
            dataReferencia: data.dataReferencia,
            cid10: data.cid10,
            horaChegada: data.horaChegada,
            horaSaida: data.horaSaida,
            qtdeDias: data.qtdeDias,
            solicitante: data.solicitante,
            finalidadePresenca: data.finalidadePresenca,
            outrosComunicamos: data.outrosComunicamos
          };
          const alreadyExists = previous.some(
            (item) => item.id === novoIdAtestado
          );

          if (!alreadyExists) {
            // O POST retorna o novo id: inclua-o já na tela, sem esperar que a
            // página seja reaberta e refaça a leitura da API.
            return [historicoItem, ...previous];
          }

          return previous.map((item) =>
          item.id === novoIdAtestado ?
          { ...item, ...historicoItem } :
          item
          );
        });
        if (clinicaId) {
          registrarAuditoria({
            clinicaId,
            acao: 'EDICAO_ATESTADO',
            entidade: 'atestado',
            entidadeId: novoIdAtestado || '',
            pacienteId: idPaciente,
            pacienteNome: paciente?.nome || '',
            detalhes: 'Salvou atestado'
          });
        }
      } catch (err: any) {
        console.error('❌ Erro ao salvar atestado:', err);
        toastError(
          'Erro ao salvar o atestado',
          'Verifique a conexão e tente novamente.'
        );
        throw err;
      }
    },
    [
    atestadoId,
    clinicaId,
    pacienteId,
    consulta,
    prepararSave,
    paciente,
    toastError]

  );
  // ⭐ Imprimir prontuário (montagem do documento em components/prontuario/impressaoProntuario.ts)
  const handleImprimirProntuario = useCallback(() => {
    imprimirProntuario({
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
    });
  }, [
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
  prontuarioId]
  );
  // ⭐ Handler: Abrir modal do paciente
  const handlePacienteClick = useCallback(async () => {
    const idPaciente = consulta?.pacienteId || pacienteId;
    if (!idPaciente || !clinicaId) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/pacientes/${idPaciente}?clinicaId=${clinicaId}`
      );
      if (response.ok) {
        const data = await response.json();
        setPacienteParaEditar(data);
        setShowPacienteModal(true);
      }
    } catch (err) {
      console.error('Erro ao carregar paciente para edição:', err);
    }
  }, [consulta?.pacienteId, pacienteId, clinicaId]);
  // ⭐ Navegação entre titular e dependente dentro da ficha do paciente
  const handleAbrirRelacionadoFicha = useCallback(
    async (pacienteRelacionadoId: string) => {
      if (!clinicaId || !pacienteRelacionadoId) return;
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/pacientes/${pacienteRelacionadoId}?clinicaId=${clinicaId}`
        );
        if (!resp.ok) {
          toastError('Erro', 'Não foi possível carregar o cadastro.');
          return;
        }
        const relacionado = await resp.json();
        setPacienteEditStack((prev) => [...prev, pacienteParaEditar]);
        setPacienteParaEditar(relacionado);
      } catch (err) {
        console.error('❌ Erro ao abrir cadastro relacionado:', err);
        toastError('Erro', 'Erro ao carregar o cadastro.');
      }
    },
    [clinicaId, pacienteParaEditar, toastError]
  );
  const handleVoltarFichaAnterior = useCallback(() => {
    setPacienteEditStack((prev) => {
      if (prev.length === 0) return prev;
      setPacienteParaEditar(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }, []);
  // ⭐ Handler: Salvar paciente do modal
  const handleSavePacienteModal = useCallback(
    async (pacienteData: any) => {
      if (pacienteData) {
        const pacienteId = pacienteData.id || paciente?.id || '';
        // ⭐ FIX: Salva no servidor via API (antes só atualizava estado local!)
        if (pacienteId && clinicaId) {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaId}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  clinicaId,
                  ...pacienteData
                })
              }
            );
            if (!response.ok) {
              const err = await response.json();
              console.error('❌ Erro ao salvar paciente:', err);
              toastError(
                'Erro ao salvar paciente',
                err.error || 'Erro desconhecido. Tente novamente.'
              );
              return;
            }
            console.log('✅ Paciente salvo com sucesso via API');
          } catch (err: any) {
            console.error('❌ Erro ao salvar paciente:', err);
            toastError(
              'Erro ao salvar paciente',
              err.message || 'Erro desconhecido. Tente novamente.'
            );
            return;
          }
        }
        setPaciente({
          id: pacienteId,
          nome: pacienteData.nome || paciente?.nome || '',
          dataNascimento:
          pacienteData.dataNascimento || paciente?.dataNascimento,
          convenio: pacienteData.convenio || paciente?.convenio,
          planoSaudeNome:
          pacienteData.planoSaudeNome || paciente?.planoSaudeNome,
          cidade: pacienteData.cidade || paciente?.cidade,
          profissao: pacienteData.profissao || paciente?.profissao,
          fotoUrl: pacienteData.fotoUrl || paciente?.fotoUrl,
          statusConsulta: paciente?.statusConsulta || 'CONSULTA',
          telefone: pacienteData.telefone || paciente?.telefone,
          celular:
          pacienteData.celular || pacienteData.telefone || paciente?.celular,
          titularId: pacienteData.titularId || paciente?.titularId,
          titularNome: pacienteData.titularNome || paciente?.titularNome,
          parentesco: pacienteData.parentesco || paciente?.parentesco,
          // ⭐ Preserva os dados exigidos pelos documentos legais
          cpf: pacienteData.cpf || (paciente as any)?.cpf || '',
          endereco:
          [
          pacienteData.endereco,
          pacienteData.numero,
          pacienteData.bairro,
          pacienteData.cidade,
          pacienteData.uf].

          filter(Boolean).
          join(', ') ||
          (paciente as any)?.endereco ||
          '',
          profissionalResponsavelId:
          pacienteData.profissionalResponsavelId ||
          (paciente as any)?.profissionalResponsavelId ||
          ''
        });
      }
      setShowPacienteModal(false);
      setPacienteParaEditar(null);
    },
    [paciente, clinicaId, toastError]
  );
  // ⭐ Handler: Abrir modal do profissional
  const handleProfissionalClick = useCallback(async () => {
    let profId: string | undefined;
    if (profissionalDaConsulta?.id) profId = profissionalDaConsulta.id;
    if (!profId && ultimoProfissional?.id) profId = ultimoProfissional.id;
    if (!profId) {
      const nomes = [
      profissionalDaConsulta?.nome,
      ultimoProfissional?.nome,
      consulta?.profissional,
      nomeProfissionalAtivo].
      filter(Boolean) as string[];
      for (const nome of nomes) {
        const nomeBusca = nome.toLowerCase().trim();
        const encontrado = profissionaisDisponiveis.find(
          (p) =>
          p.nome.toLowerCase().trim() === nomeBusca ||
          p.nome.toLowerCase().trim().includes(nomeBusca) ||
          nomeBusca.includes(p.nome.toLowerCase().trim())
        );
        if (encontrado) {
          profId = encontrado.id;
          break;
        }
      }
    }
    if (!profId && consulta?.profissionalId) {
      const profNaLista = profissionaisDisponiveis.find(
        (p) => p.id === consulta.professionalId
      );
      if (
      profNaLista && (
      profNaLista.tipo === 'medico' || profNaLista.tipo === 'dentista'))
      {
        profId = profNaLista.id;
      }
    }
    // ⭐ Fallback final: usuário logado, se for clínico — evita o cadastro vir em branco
    if (
    !profId &&
    usuarioLogado && (
    usuarioLogado.tipo === 'medico' || usuarioLogado.tipo === 'dentista'))
    {
      profId = usuarioLogado.id;
    }
    if (!profId || !clinicaId) {
      toastWarning(
        'Profissional não identificado',
        'Não foi possível localizar o cadastro do profissional deste atendimento.'
      );
      return;
    }
    try {
      let usuario: any = null;
      try {
        const respProf = await fetch(`${API_BASE_URL}/api/usuarios/${profId}`);
        if (respProf.ok) usuario = await respProf.json();
      } catch {

        /* ignore */}
      if (!usuario) {
        const respLista = await fetch(
          `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
        );
        if (respLista.ok) {
          const usuarios = await respLista.json();
          usuario = usuarios.find((u: any) => u.id === profId);
        }
      }
      if (!usuario) {
        // Busca por nome como último recurso
        const nomes = [
        profissionalDaConsulta?.nome,
        ultimoProfissional?.nome,
        consulta?.profissional,
        nomeProfissionalAtivo].
        filter(Boolean) as string[];
        for (const nome of nomes) {
          const nomeBusca = nome.toLowerCase().trim();
          const profPorNome = profissionaisDisponiveis.find(
            (p) => p.nome.toLowerCase().trim() === nomeBusca
          );
          if (profPorNome) {
            try {
              const respNome = await fetch(
                `${API_BASE_URL}/api/usuarios/${profPorNome.id}`
              );
              if (respNome.ok) {
                usuario = await respNome.json();
                break;
              }
            } catch {

              /* ignore */}
          }
        }
      }
      if (usuario) {
        // ⭐ Carrega clínicas para o select do formulário (estava vazio -> form em branco)
        if (clinicasParaForm.length === 0) {
          try {
            const respClinicas = await fetch(`${API_BASE_URL}/api/clinicas`);
            if (respClinicas.ok) {
              const lista = await respClinicas.json();
              setClinicasParaForm(
                Array.isArray(lista) ?
                lista.filter((c: any) => c.ativa !== false) :
                []
              );
            }
          } catch {

            /* ignore */}
        }
        setProfissionalParaEditar(usuario);
        setShowProfissionalModal(true);
      } else {
        toastWarning(
          'Profissional não encontrado',
          'Não foi possível localizar o cadastro deste profissional no sistema.'
        );
      }
    } catch (err) {
      console.error('Erro ao buscar profissional:', err);
      toastError(
        'Erro ao abrir cadastro',
        'Não foi possível carregar os dados do profissional. Tente novamente.'
      );
    }
  }, [
  profissionalDaConsulta,
  ultimoProfissional,
  consulta,
  nomeProfissionalAtivo,
  profissionaisDisponiveis,
  clinicaId,
  usuarioLogado,
  clinicasParaForm.length,
  toastWarning,
  toastError]
  );
  // ⭐ Handler: Salvar profissional do modal
  const handleSaveProfissionalModal = useCallback(
    async (usuarioData: any) => {
      if (usuarioData && profissionalParaEditar) {
        try {
          // ⭐ Persiste as alterações do cadastro do profissional no backend
          const resp = await fetch(
            `${API_BASE_URL}/api/usuarios/${profissionalParaEditar.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              // ⭐ Autor vai junto para a auditoria
              body: JSON.stringify({ ...usuarioData, ...autorDaSessao() })
            }
          );
          if (!resp.ok) {
            throw new Error(`Falha ao salvar (HTTP ${resp.status})`);
          }
          toastSuccess(
            'Cadastro atualizado',
            `${usuarioData.nome || 'Profissional'} foi salvo com sucesso`
          );
          setProfissionalDaConsulta({
            id: profissionalParaEditar.id,
            nome: usuarioData.nome || profissionalDaConsulta?.nome || '',
            crm: usuarioData.crm || profissionalDaConsulta?.crm || '',
            uf: usuarioData.uf || profissionalDaConsulta?.uf || '',
            tipo: usuarioData.tipo || profissionalDaConsulta?.tipo || '',
            especialidade:
            usuarioData.especialidade ||
            profissionalDaConsulta?.especialidade ||
            '',
            especialidades:
            usuarioData.especialidades ||
            profissionalDaConsulta?.especialidades ||
            '',
            titulo: usuarioData.titulo || profissionalDaConsulta?.titulo || '',
            cabecalhoRelatorio:
            usuarioData.cabecalhoRelatorio ||
            profissionalDaConsulta?.cabecalhoRelatorio ||
            '',
            rqes: usuarioData.rqes || profissionalDaConsulta?.rqes || []
          });
          setUltimoProfissional({
            id: profissionalParaEditar.id,
            nome: usuarioData.nome || '',
            crm: usuarioData.crm || '',
            uf: usuarioData.uf || '',
            tipo: usuarioData.tipo || '',
            especialidade: usuarioData.especialidade || '',
            especialidades: usuarioData.especialidades || '',
            titulo: usuarioData.titulo || '',
            cabecalhoRelatorio: usuarioData.cabecalhoRelatorio || '',
            rqes: usuarioData.rqes || []
          });
        } catch (err) {
          console.error('Erro ao salvar profissional:', err);
          toastError(
            'Erro ao salvar',
            'Não foi possível atualizar o cadastro do profissional. Tente novamente.'
          );
          return;
        }
      }
      setShowProfissionalModal(false);
      setProfissionalParaEditar(null);
    },
    [profissionalParaEditar, profissionalDaConsulta, toastSuccess, toastError]
  );
  // ⭐ Handler: Selecionar consulta do histórico (retomar atendimento anterior)
  const handleSelecionarConsulta = useCallback(
    async (
    atendimentoId: string,
    dataAtendimento?: string,
    profissionalNome?: string) =>
    {
      if (!clinicaId || !atendimentoId) return;
      console.log('🔄 [Prontuário] Retomando atendimento:', atendimentoId);
      // ⭐ A consulta É o atendimento — definir o id selecionado faz o
      // consultaIdAtual apontar para ele, e os efeitos de carregamento (anamnese,
      // exame físico, exames, prescrições, etc.) recarregam automaticamente.
      setConsultaIdSelecionada(atendimentoId);
      // ⭐ Sincroniza a data do cabeçalho com o atendimento escolhido.
      setDataAtendimentoAtivo(dataAtendimento);
      // ⭐ Mostra explicitamente, no cabeçalho, o profissional que fez o
      // atendimento selecionado (nome gravado no próprio atendimento).
      if (profissionalNome) setNomeProfissionalAtivo(profissionalNome);
      // ⭐ FIX: limpa os dados clínicos do atendimento anterior ANTES de recarregar,
      // para que o atendimento selecionado nunca herde/mostre dados de outro.
      setAnamneseId(null);
      setAnamneseData(null);
      setEvolucaoId(null);
      setEvolucaoData(null);
      setExameFisicoId(null);
      setExameFisicoData(null);
      setDiagnosticoId(null);
      setDiagnosticoData(null);
      setExamesSolicitadosId(null);
      setExamesData(null);
      setPrescricaoId(null);
      setPrescricoesData(null);
      setRelatorioId(null);
      setRelatoriosData(null);
      setAtestadoId(null);
      setAtestadoData(null);
      setDadosCarregados(false);
      // Leva o usuário para o início do atendimento retomado
      handleStepChange('anamnese' as ProntuarioStep);
    },
    [clinicaId, handleStepChange]
  );
  // ⭐ Handler: Criar nova evolução (novo atendimento)
  const handleNovaEvolucao = useCallback(() => {
    console.log('🔄 [Prontuário] Iniciando nova evolução/atendimento');
    setConsultaIdSelecionada('NOVO');
    // ⭐ Novo atendimento é sempre de hoje.
    setDataAtendimentoAtivo(new Date().toISOString().split('T')[0]);
    setConsultaAssinada(false);
    setDataAssinatura(null);
    // Limpa os dados clínicos para a nova evolução
    setAnamneseId(null);
    setAnamneseData(null);
    setEvolucaoId(null);
    setEvolucaoData(null);
    setExameFisicoId(null);
    setExameFisicoData(null);
    setDiagnosticoId(null);
    setDiagnosticoData(null);
    setExamesSolicitadosId(null);
    setExamesData(null);
    setPrescricaoId(null);
    setPrescricoesData(null);
    setRelatorioId(null);
    setRelatoriosData(null);
    setAtestadoId(null);
    setAtestadoData(null);
    setDadosCarregados(true); // Já está limpo, não precisa carregar
    toastSuccess(
      'Nova Evolução',
      'Pronto para registrar uma nova evolução. Os dados serão salvos em um novo atendimento.'
    );
    // Vai para a aba de evolução
    handleStepChange('evolucao' as ProntuarioStep);
  }, [handleStepChange, toastSuccess]);
  // ⭐ Odontograma só faz sentido em contexto odontológico:
  // profissional dentista OU consulta do tipo odontológica.
  // ⭐ FIX: considera primeiro o profissional ATIVO (dentista logado ou
  // escolhido no cabeçalho). Antes só olhava o profissional gravado na
  // consulta: ao selecionar um dentista, a aba Odontograma não aparecia.
  const tipoDe = (id?: string) =>
  id ? profissionaisDisponiveis.find((p) => p.id === id)?.tipo : undefined;
  const profTipoResolvido = String(
    profissionalAtivo?.tipo ||
    tipoDe(profissionalAtivo?.id) ||
    profissionalDaConsulta?.tipo ||
    tipoDe(profissionalDaConsulta?.id) ||
    ultimoProfissional?.tipo ||
    (consulta as any)?.profissionalTipo ||
    ''
  ).toLowerCase();
  const isContextoOdontologico =
  profTipoResolvido === 'dentista' ||
  profissionalDaConsulta?.especialidade === 'odontologica' ||
  consulta?.tipo === 'odontologica';
  // ⭐ Handlers para múltiplos registros de Evolução
  const handleNovoRegistroEvolucao = useCallback(() => {
    setEvolucaoId(null);
    setEvolucaoData({
      evolucaoAtual: ''
    });
  }, []);
  const handleEditarRegistroEvolucao = useCallback(
    (id: string, texto: string) => {
      setEvolucaoId(id);
      setEvolucaoData({
        evolucaoAtual: texto
      });
    },
    []
  );
  // ⭐ Salvamentos com status ("Salvando…/Salvo/Erro") e limpeza do rascunho
  const { comSalvamento } = rascunho;
  const salvar = useMemo(
    () => ({
      anamnese: comSalvamento('anamnese', handleSaveAnamnese),
      exame_fisico: comSalvamento('exame_fisico', handleSaveExameFisico),
      diagnostico: comSalvamento('diagnostico', handleSaveDiagnostico),
      evolucao: comSalvamento('evolucao', handleSaveEvolucao),
      exames: comSalvamento('exames', handleSaveExames),
      prescricoes: comSalvamento('prescricoes', async (d: any) => {
        const r = await handleSavePrescricoes(d);
        setRascunhoPrescricao(null);
        return r;
      }),
      relatorios: comSalvamento('relatorios', handleSaveRelatorios),
      atestado: comSalvamento('atestado', handleSaveAtestado),
      odontograma: comSalvamento('odontograma', handleSaveOdontograma)
    }),
    [
    comSalvamento,
    handleSaveAnamnese,
    handleSaveExameFisico,
    handleSaveDiagnostico,
    handleSaveEvolucao,
    handleSaveExames,
    handleSavePrescricoes,
    handleSaveRelatorios,
    handleSaveAtestado,
    handleSaveOdontograma]

  );
  salvarPrescricaoRef.current = consultaAssinada ? undefined : salvar.prescricoes;
  alterarEtapaRef.current = alterarEtapa;
  // ⭐ Recupera o texto não salvo encontrado ao abrir o atendimento
  const restaurarRascunhos = useCallback(() => {
    const mapa = rascunho.pendentesAoAbrir;
    Object.entries(mapa).forEach(([etapa, r]) => {
      const d: any = r.dados;
      switch (etapa) {
        case 'anamnese':setAnamneseData(d);break;
        case 'exame_fisico':setExameFisicoData(d);break;
        case 'diagnostico':setDiagnosticoData(d);break;
        case 'exames':setExamesData(d);break;
        case 'relatorios':setRelatoriosData(d);break;
        case 'atestado':setAtestadoData(d);break;
        case 'odontograma':setOdontogramaData(d);break;
        case 'prescricoes':setRascunhoPrescricao(d);break;
        case 'evolucao':setRascunhoEvolucao(typeof d === 'string' ? d : '');break;
      }
    });
    rascunho.restaurados(mapa);
    setVersaoRestauro((v) => v + 1);
    const primeira = Object.keys(mapa)[0];
    if (primeira) handleStepChange(primeira as ProntuarioStep);
  }, [rascunho, handleStepChange]);
  const renderStepContent = () => {
    const idPaciente = consulta?.pacienteId || pacienteId;
    const etapaProps = {
      pacienteId: idPaciente,
      atendimentoId: consultaIdAtual,
      clinicaId,
      // ⭐ REGRA 1: somente profissional clínico edita o prontuário. Apenas os
      // papéis administrativos (super_admin/admin/atendente/...) ficam em
      // somente-leitura. Atendimento assinado bloqueia todos. Usar a denylist
      // evita travar um profissional cujo `tipo` não bata com uma allowlist.
      readOnly: usuarioSomenteVisualiza || consultaAssinada
    };
    switch (currentStep) {
      case 'resumo':
        return (
          <ResumoEtapa
            {...etapaProps}
            refreshKey={resumoRefreshKey}
            onImprimir={handleImprimirProntuario}
            anamneseData={anamneseData}
            exameFisicoData={exameFisicoData}
            examesData={examesData}
            diagnosticoData={
            diagnosticoData ?
            {
              diagnostico: diagnosticoData.diagnosticoPrincipal ?
              diagnosticoData.diagnosticoPrincipal.codigo +
              ' - ' +
              diagnosticoData.diagnosticoPrincipal.descricao + (
              diagnosticoData.outrosDiagnosticos?.length ?
              ' (+' +
              diagnosticoData.outrosDiagnosticos.length +
              ' outros)' :
              '') + (
              diagnosticoData.observacoes ?
              ' | ' + diagnosticoData.observacoes :
              '') :
              diagnosticoData.observacoes || (
              diagnosticoData.outrosDiagnosticos?.length ?
              diagnosticoData.outrosDiagnosticos.
              map((d) => d.codigo + ' - ' + d.descricao).
              join('; ') :
              '')
            } :
            null
            }
            evolucaoData={
            evolucaoData ?
            {
              evolucao: evolucaoData.evolucaoAtual
            } :
            null
            }
            prescricoesData={prescricoesData}
            onNavigateToStep={(step) =>
            handleStepChange(step as ProntuarioStep)
            }
            onSelecionarAtendimento={handleSelecionarConsulta}
            semProfissional={semProfissional}
            profissionalTituloAtual={
            (profissionalDaConsulta as any)?.titulo ||
            (ultimoProfissional as any)?.titulo ||
            ''
            }
            profissionalNomeAtual={
            profissionalDaConsulta?.nome ||
            ultimoProfissional?.nome ||
            consulta?.profissional ||
            ''
            }
            profissionaisDisponiveis={profissionaisDisponiveis}
            onSelecionarProfissional={handleSelecionarProfissional}
            salvandoProfissional={salvandoProfissional} />);


      case 'resumo_atendimento':
        return (
          <ResumoAtendimentoEtapa
            loading={!dadosCarregados}
            anamneseData={anamneseData}
            exameFisicoData={exameFisicoData}
            examesData={examesData}
            diagnosticoData={diagnosticoData}
            evolucaoData={evolucaoData}
            prescricoesData={prescricoesData}
            onNavigateToStep={(step) =>
            handleStepChange(step as ProntuarioStep)
            } />);


      case 'anamnese':
        return (
          <AnamneseEtapa
            {...etapaProps}
            data={anamneseData || undefined}
            onSave={consultaAssinada ? undefined : salvar.anamnese}
            naoSalvo={naoSalvo('anamnese')}
            onChange={
            consultaAssinada ? undefined : (data) => {
              setAnamneseData(data);
              alterarEtapa('anamnese', data);
            }
            } />);


      case 'exame_fisico':
        return (
          <ExameFisicoEtapa
            {...etapaProps}
            data={exameFisicoData || undefined}
            onSave={consultaAssinada ? undefined : salvar.exame_fisico}
            naoSalvo={naoSalvo('exame_fisico')}
            onChange={
            consultaAssinada ? undefined : (data) => {
              setExameFisicoData(data);
              alterarEtapa('exame_fisico', data);
            }
            } />);


      case 'diagnostico':
        return (
          <DiagnosticoEtapa
            {...etapaProps}
            data={diagnosticoData || undefined}
            onSave={consultaAssinada ? undefined : salvar.diagnostico}
            naoSalvo={naoSalvo('diagnostico')}
            onChange={
            consultaAssinada ? undefined : (data) => {
              setDiagnosticoData(data);
              alterarEtapa('diagnostico', data);
            }
            } />);


      case 'evolucao':
        return (
          <EvolucaoEtapa
            {...etapaProps}
            onSave={consultaAssinada ? undefined : salvar.evolucao}
            textoInicial={rascunhoEvolucao}
            onTextoChange={
            consultaAssinada ?
            undefined :
            (t) => {
              setRascunhoEvolucao(t);
              alterarEtapa('evolucao', t);
            }
            }
            onEditarEvolucao={
            consultaAssinada ? undefined : handleEditarEvolucao
            }
            onExcluirEvolucao={
            consultaAssinada ? undefined : handleExcluirEvolucao
            }
            consultaAssinada={consultaAssinada}
            dataAssinatura={dataAssinatura}
            pacienteNome={paciente?.nome || consulta?.paciente || ''}
            pacienteTelefone={paciente?.celular || paciente?.telefone || ''} />);


      case 'exames':{
          const profIdExames =
          consulta?.profissionalId || profissionalIdDoExame || '';
          return (
            <ExamesEtapa
              {...etapaProps}
              data={examesData || undefined}
              onSave={consultaAssinada ? undefined : salvar.exames}
            naoSalvo={naoSalvo('exames')}
              onChange={
              consultaAssinada ? undefined : (data) => {
              setExamesData(data);
              alterarEtapa('exames', data);
            }
              }
              profissionalId={profIdExames}
              historico={examesHistorico}
              registroAbertoId={examesSolicitadosId || ''}
              onDuplicate={(item) => {
                setExamesSolicitadosId(item.id);
                examesSolicitadosIdRef.current = item.id;
                if ((item as any).profissionalId)
                setProfissionalIdDoExame((item as any).profissionalId);
                setExamesData({
                  profissionalId: (item as any).profissionalId || '',
                  descricao: item.descricao || '',
                  pedido: item.pedido || '',
                  justificativa: item.justificativa || '',
                  cid10: item.cid10 || ''
                });
              }}
              onNovoExame={() => {
                setExamesSolicitadosId(null);
                examesSolicitadosIdRef.current = null;
                setProfissionalIdDoExame('');
                setExamesData(null);
              }}
              profissionalDoProntuario={
              profissionalDaConsulta ?
              {
                id: profissionalDaConsulta.id,
                nome: profissionalDaConsulta.nome,
                crm: profissionalDaConsulta.crm,
                uf: profissionalDaConsulta.uf,
                tipo:
                profissionaisDisponiveis.find(
                  (p) => p.id === profissionalDaConsulta?.id
                )?.tipo || '',
                especialidade: profissionalDaConsulta.especialidade,
                especialidades: profissionalDaConsulta.especialidades,
                titulo:
                profissionalDaConsulta.titulo ||
                consulta?.profissionalTitulo ||
                '',
                cabecalhoRelatorio:
                profissionalDaConsulta.cabecalhoRelatorio ||
                (consulta as any)?.profissionalCabecalhoRelatorio ||
                '',
                rqes: profissionalDaConsulta.rqes
              } :
              ultimoProfissional ?
              {
                id: ultimoProfissional.id || '',
                nome: ultimoProfissional.nome || '',
                crm: ultimoProfissional.crm,
                uf: ultimoProfissional.uf,
                tipo:
                profissionaisDisponiveis.find(
                  (p) => p.id === ultimoProfissional?.id
                )?.tipo || '',
                especialidade: ultimoProfissional.especialidade,
                especialidades: ultimoProfissional.especialidades,
                titulo:
                ultimoProfissional.titulo ||
                consulta?.profissionalTitulo ||
                '',
                cabecalhoRelatorio:
                ultimoProfissional.cabecalhoRelatorio ||
                (consulta as any)?.profissionalCabecalhoRelatorio ||
                '',
                rqes: ultimoProfissional.rqes
              } :
              consulta?.profissional ?
              {
                id: consulta.professionalId || '',
                nome: consulta.profissional
              } :
              undefined
              }
              pacienteNome={paciente?.nome} />);


        }
      case 'prescricoes':{
          let dadosPrescricao = undefined;
          if (prescricoesData?.prescricoes) {
            try {
              dadosPrescricao = JSON.parse(prescricoesData.prescricoes);
            } catch {
              dadosPrescricao = {
                controleEspecial: false,
                data: new Date().toISOString().split('T')[0],
                generico: prescricoesData.prescricoes,
                medicamentos: []
              };
            }
          }
          return (
            <PrescricoesEtapa
              {...etapaProps}
              data={rascunhoPrescricao || dadosPrescricao}
              naoSalvo={naoSalvo('prescricoes')}
              onSave={consultaAssinada ? undefined : salvar.prescricoes}
              onChange={
              consultaAssinada ?
              undefined :
              (d) => {
                setRascunhoPrescricao(d);
                alterarEtapa('prescricoes', d);
              }
              }
              historico={prescricoesHistorico}
              pacienteNome={paciente?.nome}
              pacienteCpf={(paciente as any)?.cpf}
              pacienteEndereco={(paciente as any)?.endereco}
              pacienteProfissionalResponsavelId={
              (paciente as any)?.profissionalResponsavelId
              }
              pacienteDataNascimento={(paciente as any)?.dataNascimento}
              pacienteTelefone={(paciente as any)?.telefone}
              profissional={
              memedProfissional ?
              {
                id:
                consulta?.profissionalId ||
                profissionalDaConsulta?.id ||
                '1',
                nome: memedProfissional.nome,
                crm: memedProfissional.crm,
                token: memedProfissional.token,
                ativo: true
              } :
              undefined
              }
              profissionalCompleto={
              profissionalDaConsulta ?
              {
                ...profissionalDaConsulta,
                tipo:
                profissionalDaConsulta.tipo ||
                profissionaisDisponiveis.find(
                  (p) => p.id === profissionalDaConsulta?.id
                )?.tipo ||
                consulta?.profissionalTipo ||
                '',
                titulo:
                profissionalDaConsulta.titulo ||
                consulta?.profissionalTitulo ||
                '',
                cabecalhoRelatorio:
                profissionalDaConsulta.cabecalhoRelatorio ||
                (consulta as any)?.profissionalCabecalhoRelatorio ||
                ''
              } :
              undefined
              }
              memedConfig={memedConfig}
              onAbrirMemed={handleAbrirMemed}
              onConfigurarMemed={() => onNavigate?.('memed_profissionais')}
              onNavigateUsuarios={
              profissionalDaConsulta?.id ?
              handleProfissionalClick :
              () => onNavigate?.('usuarios')
              }
              onMemedStatusChange={() => {
                const profId =
                consulta?.profissionalId || profissionalDaConsulta?.id;
                if (profId) {
                  fetch(
                    `${API_BASE_URL}/api/memed-profissionais/usuario/${profId}`
                  ).
                  then((res) => res.json()).
                  then((data) => {
                    if (data?.token) {
                      setMemedProfissional({
                        nome: `${data.nome || ''} ${data.sobrenome || ''}`.trim(),
                        crm: data.board_number || '',
                        uf: data.board_state || '',
                        titulo: (profissionalDaConsulta as any)?.titulo || '',
                        token: data.token
                      });
                    }
                  }).
                  catch(console.error);
                }
              }} />);


        }
      case 'relatorios':
        return (
          <RelatoriosEtapa
            {...etapaProps}
            data={relatoriosData || undefined}
            onSave={consultaAssinada ? undefined : salvar.relatorios}
            naoSalvo={naoSalvo('relatorios')}
            onChange={
            consultaAssinada ? undefined : (data) => {
              setRelatoriosData(data);
              alterarEtapa('relatorios', data);
            }
            }
            historico={relatoriosHistorico.filter((r) => r.id !== relatorioId)}
            pacienteNome={paciente?.nome}
            profissionalId={
            consulta?.profissionalId || profissionalDaConsulta?.id || ''
            }
            profissionalDoProntuario={
            profissionalDaConsulta ?
            {
              id: profissionalDaConsulta.id,
              nome: profissionalDaConsulta.nome,
              crm: profissionalDaConsulta.crm,
              uf: profissionalDaConsulta.uf,
              tipo:
              profissionaisDisponiveis.find(
                (p) => p.id === profissionalDaConsulta?.id
              )?.tipo || '',
              especialidade: profissionalDaConsulta.especialidade,
              especialidades: profissionalDaConsulta.especialidades,
              titulo:
              profissionalDaConsulta.titulo ||
              consulta?.profissionalTitulo ||
              '',
              cabecalhoRelatorio:
              profissionalDaConsulta.cabecalhoRelatorio ||
              (consulta as any)?.profissionalCabecalhoRelatorio ||
              '',
              rqes: profissionalDaConsulta.rqes
            } :
            undefined
            } />);


      case 'atestado':{
          // ⭐ Fallback robusto: se profissionalDaConsulta/ultimoProfissional vierem
          // sem CRM/UF/tipo, busca esses dados na lista de profissionais carregada
          // (profissionaisDisponiveis carrega crm/uf/tipo do cadastro). Assim o
          // "CRM 12345" ou "CRO 12345" aparece sempre que o profissional tiver
          // registro cadastrado, mesmo que o objeto da consulta tenha vindo incompleto.
          const idProfAtestado =
          profissionalDaConsulta?.id || ultimoProfissional?.id || '';
          const profNaListaAtestado = profissionaisDisponiveis.find(
            (p) => p.id === idProfAtestado
          );
          return (
            <AtestadoEtapa
              {...etapaProps}
              // Atestados podem ser emitidos enquanto o atendimento estiver aberto,
              // mesmo quando o restante do prontuário é apenas consultado.
              readOnly={consultaAssinada}
              data={atestadoData || undefined}
              historico={atestadosHistorico}
              onChange={(data) => {
                setAtestadoData(data);
                alterarEtapa('atestado', data);
              }}
              naoSalvo={naoSalvo('atestado')}
              onNew={() => {
                // O documento que estava aberto passa a compor o histórico
                // imediatamente, sem exigir que o usuário recarregue a página.
                if (atestadoId && atestadoData) {
                  setAtestadosHistorico((previous) =>
                  previous.some((item) => item.id === atestadoId) ?
                  previous :
                  [
                  {
                    id: atestadoId,
                    dataEmissao: new Date().toISOString().split('T')[0],
                    usuario:
                    atestadoData.medico ||
                    profissionalDaConsulta?.nome ||
                    ultimoProfissional?.nome ||
                    '',
                    ...atestadoData
                  },
                  ...previous]

                  );
                }
                setAtestadoId(null);
              }}
              onSelectHistorico={(item) => {
                setAtestadoId(item.id);
              }}
              onSave={consultaAssinada ? undefined : salvar.atestado}
              medicos={profissionaisDisponiveis.map((p) => ({
                id: p.id,
                nome: p.nome,
                crm: p.crm,
                uf: p.uf,
                tipo: p.tipo,
                especialidade: (p as any).especialidade,
                especialidades: (p as any).especialidades
              }))}
              pacienteNome={paciente?.nome}
              profissionalDoProntuario={
              profissionalDaConsulta || ultimoProfissional ?
              {
                id: idProfAtestado,
                nome:
                profissionalDaConsulta?.nome ||
                ultimoProfissional?.nome ||
                profNaListaAtestado?.nome ||
                '',
                crm:
                profissionalDaConsulta?.crm ||
                ultimoProfissional?.crm ||
                profNaListaAtestado?.crm ||
                (consulta as any)?.profissionalCrm ||
                '',
                uf:
                profissionalDaConsulta?.uf ||
                ultimoProfissional?.uf ||
                profNaListaAtestado?.uf ||
                (consulta as any)?.profissionalUf ||
                '',
                tipo:
                profissionalDaConsulta?.tipo ||
                ultimoProfissional?.tipo ||
                profNaListaAtestado?.tipo ||
                '',
                especialidade:
                profissionalDaConsulta?.especialidade ||
                ultimoProfissional?.especialidade ||
                (consulta as any)?.profissionalEspecialidades ||
                '',
                especialidades:
                profissionalDaConsulta?.especialidades ||
                ultimoProfissional?.especialidades ||
                '',
                titulo:
                (profissionalDaConsulta as any)?.titulo ||
                (ultimoProfissional as any)?.titulo ||
                (profNaListaAtestado as any)?.titulo ||
                '',
                cabecalhoRelatorio:
                (profissionalDaConsulta as any)?.cabecalhoRelatorio ||
                (ultimoProfissional as any)?.cabecalhoRelatorio ||
                (profNaListaAtestado as any)?.cabecalhoRelatorio ||
                '',
                rqes:
                (profissionalDaConsulta as any)?.rqes ||
                (ultimoProfissional as any)?.rqes ||
                []
              } :
              undefined
              } />);


        }
      case 'procedimento':
        return (
          <ProcedimentoEtapa
            {...etapaProps}
            profissionalDaConsulta={
            profissionalDaConsulta || ultimoProfissional ?
            {
              id:
              profissionalDaConsulta?.id ||
              ultimoProfissional?.id ||
              '',
              nome:
              profissionalDaConsulta?.nome ||
              ultimoProfissional?.nome ||
              '',
              crm:
              profissionalDaConsulta?.crm ||
              ultimoProfissional?.crm ||
              (consulta as any)?.profissionalCrm ||
              '',
              uf:
              profissionalDaConsulta?.uf ||
              ultimoProfissional?.uf ||
              (consulta as any)?.profissionalUf ||
              '',
              especialidade:
              profissionalDaConsulta?.especialidade ||
              ultimoProfissional?.especialidade ||
              (consulta as any)?.profissionalEspecialidades ||
              '',
              especialidades:
              profissionalDaConsulta?.especialidades ||
              ultimoProfissional?.especialidades ||
              (consulta as any)?.profissionalEspecialidades ||
              '',
              titulo:
              profissionalDaConsulta?.titulo ||
              ultimoProfissional?.titulo ||
              (consulta as any)?.profissionalTitulo ||
              '',
              cabecalhoRelatorio:
              profissionalDaConsulta?.cabecalhoRelatorio ||
              ultimoProfissional?.cabecalhoRelatorio ||
              (consulta as any)?.profissionalCabecalhoRelatorio ||
              ''
            } :
            undefined
            }
            pacienteNome={paciente?.nome}
            pacienteTelefone={(paciente as any)?.telefone} />);


      case 'avaliacao':
        return (
          <AvaliacaoEtapa
            {...etapaProps}
            profissionalDaConsulta={
            profissionalDaConsulta || ultimoProfissional ?
            {
              id:
              profissionalDaConsulta?.id ||
              ultimoProfissional?.id ||
              '',
              nome:
              profissionalDaConsulta?.nome ||
              ultimoProfissional?.nome ||
              ''
            } :
            undefined
            }
            pacienteNome={paciente?.nome} />);


      case 'imagens':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {idPaciente && clinicaId ?
            <DocumentosManager
              clinicaId={clinicaId}
              pacienteId={idPaciente}
              pacienteNome={paciente?.nome}
              pacienteTelefone={(paciente as any)?.telefone || ''}
              especialidade={
              profissionalDaConsulta?.especialidade || (
              consulta?.tipo === 'odontologica' ?
              'Odontologia' :
              'Clínico Geral')
              } /> :


            <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
                <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  Selecione um paciente para ver os documentos
                </p>
              </div>
            }
          </div>);

      case 'odontograma':
        // ⭐ Só renderiza em contexto odontológico (dentista / consulta odontológica)
        if (!isContextoOdontologico) {
          return (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-gray-500">
                O odontograma está disponível apenas para atendimentos
                odontológicos.
              </p>
            </div>);

        }
        return (
          <OdontogramaEtapa
            {...etapaProps}
            data={odontogramaData || undefined}
            onSave={consultaAssinada ? undefined : salvar.odontograma}
            onChange={
            consultaAssinada ? undefined : (data) => {
              setOdontogramaData(data);
              alterarEtapa('odontograma', data);
            }
            }
            pacienteNome={paciente?.nome}
            pacienteDataNascimento={paciente?.dataNascimento}
            profissionalNome={
            profissionalDaConsulta?.nome ||
            ultimoProfissional?.nome ||
            consulta?.profissional ||
            ''
            }
            profissionalCrm={
            profissionalDaConsulta?.crm || ultimoProfissional?.crm || ''
            }
            profissionalUf={
            profissionalDaConsulta?.uf || ultimoProfissional?.uf || ''
            }
            profissionalTipo={
            profissionalDaConsulta?.tipo ||
            profissionaisDisponiveis.find(
              (p) => p.id === profissionalDaConsulta?.id
            )?.tipo ||
            consulta?.profissionalTipo ||
            ''
            }
            profissionalTitulo={
            (profissionalDaConsulta as any)?.titulo ||
            (ultimoProfissional as any)?.titulo ||
            consulta?.profissionalTitulo ||
            ''
            }
            profissionalCabecalho={
            (profissionalDaConsulta as any)?.cabecalhoRelatorio ||
            (ultimoProfissional as any)?.cabecalhoRelatorio ||
            ''
            }
            profissionalEspecialidade={resolverEspecialidade(
              profissionalDaConsulta?.especialidade,
              profissionalDaConsulta?.especialidades
            )}
            profissionalRqes={
            (profissionalDaConsulta as any)?.rqes ||
            (ultimoProfissional as any)?.rqes ||
            []
            } />);


      default:
        return (
          <AnamneseEtapa
            {...etapaProps}
            data={anamneseData || undefined}
            onSave={consultaAssinada ? undefined : salvar.anamnese}
            naoSalvo={naoSalvo('anamnese')} />);


    }
  };
  // ⭐ Tipo de consulta exibido no header — derivado do PROFISSIONAL do atendimento
  // (médico → MÉDICA, dentista → ODONTOLÓGICA). Só usa consulta.tipo como
  // fallback e, na dúvida, assume MÉDICA. Isso evita rotular como
  // "CONSULTA ODONTOLÓGICA" um atendimento de uma médica (Clínica Geral).
  const tipoProfissionalAtual = (
  profissionalDaConsulta?.tipo ||
  ultimoProfissional?.tipo ||
  '').

  toString().
  toLowerCase();
  const tipoConsultaLabel =
  tipoProfissionalAtual === 'dentista' ?
  'CONSULTA ODONTOLÓGICA' :
  tipoProfissionalAtual === 'medico' ?
  'CONSULTA MÉDICA' :
  consulta?.tipo === 'odontologica' ?
  'CONSULTA ODONTOLÓGICA' :
  'CONSULTA MÉDICA';
  const pacienteExibir: PacienteHeaderData = paciente ?
  {
    ...paciente,
    statusConsulta: tipoConsultaLabel
  } :
  {
    id: '',
    nome: loading ? 'Carregando...' : 'SELECIONE UM PACIENTE'
  };
  const hiddenTabs: ProntuarioStep[] = [
  ...((procedimentoConfig.valor as any)?.habilitado ?
  [] :
  ['procedimento'] as ProntuarioStep[]),
  ...((avaliacaoConfig.valor as any)?.habilitado ?
  [] :
  ['avaliacao'] as ProntuarioStep[]),
  ...(isContextoOdontologico ? [] : ['odontograma'] as ProntuarioStep[])];

  // ⭐ Atalhos: Ctrl+S salva a etapa aberta; Alt+1…9 troca de aba.
  const hiddenTabsChave = hiddenTabs.join(',');
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const botao = document.querySelector<HTMLButtonElement>(
          '[data-prontuario-conteudo] [data-salvar-etapa]:not([disabled])'
        );
        botao?.click();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const abas = abasVisiveis(hiddenTabsChave ? hiddenTabsChave.split(',') as ProntuarioStep[] : []);
        const alvo = abas[Number(e.key) - 1];
        if (alvo) {
          e.preventDefault();
          handleStepChange(alvo);
        }
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [hiddenTabsChave, handleStepChange]);

  return (
    <div
      className="h-full flex flex-col bg-white"
      style={{
        height: 'calc(100vh - 64px)'
      }}>
      
      {/* ⭐ FASE 1: Toasts de feedback de salvamento (sucesso/erro visíveis ao médico) */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {consultaAssinada &&
      <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between shadow-md z-50 relative">
          <div className="flex items-center gap-3">
            <LockIcon className="w-5 h-5" />
            <div>
              <span className="font-semibold text-sm">
                Atendimento assinado e bloqueado (somente leitura)
              </span>
              {dataAssinatura &&
            <span className="text-xs ml-2 opacity-80">
                  em{' '}
                  {new Date(dataAssinatura).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
                </span>
            }
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
            onClick={handleNovaEvolucao}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded transition-colors flex items-center gap-2 border border-white/30">
            
              <PenToolIcon className="w-4 h-4" />
              Nova Evolução
            </button>
            <ShieldCheckIcon className="w-5 h-5 opacity-70" />
          </div>
        </div>
      }
      <PacienteHeader
        paciente={pacienteExibir}
        atendimentoId={consultaIdAtual}
        dataConsulta={
        consultaIdAtual !== 'NOVO' ? dataAtendimentoAtivo : undefined
        }
        atendimentoNovo={consultaIdAtual === 'NOVO'}
        tempoAtendimento={tempoAtendimento}
        mostrarTempo={
        usuarioEhProfissional &&
        !!consultaIdAtual &&
        consultaIdAtual !== 'NOVO'
        }
        timerStatus={timerStatus}
        onStartTimer={handleStartTimer}
        onPauseTimer={handlePauseTimer}
        onStopTimer={handleStopTimer}
        mostrarVideo={
        consulta?.modalidade === 'online' &&
        // Atendimento finalizado não reabre sala: a consulta acabou.
        consulta?.statusAtendimento !== 'finalizado' &&
        !!consultaIdAtual &&
        consultaIdAtual !== 'NOVO'
        }
        onReconectarVideo={handleReconectarVideo}
        semProfissional={false}
        profissionalNome={
        consultaIdAtual !== 'NOVO' ? profissionalAtivo?.nome || '' : undefined
        }
        profissionalTitulo={
        consultaIdAtual !== 'NOVO' ?
        (profissionalAtivo as any)?.titulo || '' :
        undefined
        }
        profissionalCrm={
        consultaIdAtual !== 'NOVO' ? profissionalAtivo?.crm || '' : undefined
        }
        profissionalUf={
        consultaIdAtual !== 'NOVO' ? profissionalAtivo?.uf || '' : undefined
        }
        profissionalTipo={
        consultaIdAtual !== 'NOVO' ? profissionalAtivo?.tipo || '' : undefined
        }
        profissionalEspecialidade={
        consultaIdAtual !== 'NOVO' ?
        resolverEspecialidade(
          profissionalAtivo?.especialidade,
          (profissionalAtivo as any)?.especialidades
        ) :
        undefined
        }
        profissionalResponsavelNome={profissionalResponsavel?.nome || ''}
        profissionalResponsavelCrm={profissionalResponsavel?.crm || ''}
        profissionalResponsavelUf={profissionalResponsavel?.uf || ''}
        profissionalResponsavelTipo={profissionalResponsavel?.tipo || ''}
        onPacienteClick={handlePacienteClick}
        onProfissionalClick={handleProfissionalClick}
        profissionaisSelecionaveis={
        usuarioEhClinico ? undefined : profissionaisDisponiveis
        }
        profissionalSelecionadoId={
        profissionalManualId || (
        profissionalAtivo?.id &&
        profissionaisDisponiveis.some((p) => p.id === profissionalAtivo.id) ?
        String(profissionalAtivo.id) :
        '')
        }
        onSelecionarProfissional={
        usuarioEhClinico ? undefined : selecionarProfissionalManual
        } />
      

      {/* ⭐ NOVO: pergunta se deseja reenviar o convite (link) ao paciente antes
               de reiniciar/reconectar a consulta online — às vezes o paciente já não
               tem mais o link. */}
      {confirmarReenvioAberto &&
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reenvio-convite-titulo">
        
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 bg-indigo-600 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <VideoIcon className="w-5 h-5 flex-shrink-0" />
                <h2
                id="reenvio-convite-titulo"
                className="text-sm font-semibold truncate">
                
                  Reiniciar consulta online
                </h2>
              </div>
              <button
              onClick={handleCancelarReconexao}
              disabled={reenviandoConvite}
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors disabled:opacity-50"
              title="Cancelar">
              
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                Às vezes o paciente já não tem mais o link da sala. Deseja
                <strong> reenviar o convite </strong>
                {paciente?.nome ?
              <>
                    para <strong>{paciente.nome}</strong>{' '}
                  </> :

              'ao paciente '
              }
                pelo WhatsApp antes de reconectar?
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-5 py-3.5 bg-gray-50 border-t border-gray-100">
              <button
              onClick={handleCancelarReconexao}
              disabled={reenviandoConvite}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-md transition-colors disabled:opacity-50">
              
                Cancelar
              </button>
              <button
              onClick={handleReconectarSemReenviar}
              disabled={reenviandoConvite}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50">
              
                Continuar sem reenviar
              </button>
              <button
              onClick={handleReenviarEReconectar}
              disabled={reenviandoConvite}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-70">
              
                {reenviandoConvite ?
              <Loader2Icon className="w-4 h-4 animate-spin" /> :

              <SendIcon className="w-4 h-4" />
              }
                {reenviandoConvite ? 'Reenviando…' : 'Reenviar e reconectar'}
              </button>
            </div>
          </div>
        </div>
      }

      {/* ⭐ Consulta online — sala de vídeo embutida (stay-on-top) dentro do app */}
      <ConsultaOnlineModal
        isOpen={videoModalAberto}
        onClose={() => setVideoModalAberto(false)}
        link={videoModalLink}
        pacienteNome={paciente?.nome}
        profissionalNome={profissionalAtivo?.nome}
        onConvidarPaciente={reenviarConviteWhatsApp}
        onEncerrarConsultaOnline={encerrarConsultaOnline}
        onTrocarParaPresencial={trocarParaPresencial} />
      

      {/* ⭐ A assinatura do atendimento agora aparece compacta na barra de abas
                                                       (AssinaturaChip), em vez de uma faixa larga em todas as telas. */}
      {/* ⭐ FASE 1: aviso informativo quando ainda não há consulta REAL.
                                                                                                 Não é mais um bloqueio: ao salvar a primeira etapa, garantirConsulta()
                                                                                                 cria a consulta automaticamente. Só alertamos que ainda falta um
                                                                                                 profissional quando esse for o caso (sem profissional o save falha).
                                                                                                 ⭐ FASE 3: Oculta os banners se estiver na aba de Histórico (resumo),
                                                                                                 pois o usuário está apenas visualizando, não criando um novo atendimento. */}
      {!consultaIdReal &&
      prontuarioJaCarregado &&
      usuarioEhProfissional &&
      currentStep !== 'resumo' &&
      <div className="bg-blue-600 text-white px-6 py-3 flex items-start gap-3 shadow-md">
            <AlertTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Novo atendimento</p>
              <p className="text-xs opacity-90 mt-0.5">
                A consulta deste atendimento será criada automaticamente ao
                salvar a primeira informação clínica.
              </p>
            </div>
          </div>
      }

      {dadosCarregados && !consultaAssinada &&
      <AvisoRascunho
        rascunhos={rascunho.pendentesAoAbrir}
        onRestaurar={restaurarRascunhos}
        onDescartar={() => rascunho.descartar()} />
      }

      <ProntuarioTabs
        activeStep={currentStep}
        onStepChange={handleStepChange}
        hiddenTabs={hiddenTabs}
        estados={Object.fromEntries(
          Object.entries(rascunho.estados).map(([k, v]) => [k, v.estado])
        )}
        extra={
        <>
            <EstadoSalvamento
            estados={rascunho.estados}
            onIrPara={(etapa) => handleStepChange(etapa as ProntuarioStep)} />
          
            {consultaIdReal && clinicaId &&
          <AssinaturaChip
            assinada={consultaAssinada}
            dataAssinatura={dataAssinatura}
            pacienteId={consulta?.pacienteId || pacienteId || ''}
            pacienteNome={paciente?.nome || consulta?.paciente || ''}
            pacienteTelefone={paciente?.celular || paciente?.telefone || ''}
            onTelefoneAtualizado={(numero) => setPaciente((p) => p ? { ...p, telefone: numero, celular: numero } : p)}
            clinicaId={clinicaId}
            atendimentoId={consultaIdReal} />
          }
          </>
        }
        onProcedimentosClick={
        (procedimentoConfig.valor as any)?.habilitado ?
        () => handleStepChange('procedimento') :
        undefined
        }
        showProcedimentosActive={currentStep === 'procedimento'}
        onAvaliacaoClick={
        (avaliacaoConfig.valor as any)?.habilitado ?
        () => handleStepChange('avaliacao') :
        undefined
        }
        showAvaliacaoActive={currentStep === 'avaliacao'} />
      

      <div className="flex-1 flex overflow-hidden">
        <div
          key={versaoRestauro}
          data-prontuario-conteudo
          className="flex-1 overflow-y-auto p-2 md:p-4">
          {renderStepContent()}
        </div>
      </div>
      {/* Modal Paciente */}
      {showPacienteModal &&
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <PacienteForm
            isOpen={showPacienteModal}
            onClose={() => {
              setShowPacienteModal(false);
              setPacienteParaEditar(null);
              setPacienteEditStack([]);
            }}
            onSave={handleSavePacienteModal}
            paciente={pacienteParaEditar}
            clinicaId={clinicaId || ''}
            onAbrirRelacionado={handleAbrirRelacionadoFicha}
            onVoltar={handleVoltarFichaAnterior}
            temVoltar={pacienteEditStack.length > 0} />
          
          </div>
        </div>
      }
      {/* Modal Profissional */}
      {showProfissionalModal && profissionalParaEditar &&
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <UsuarioForm
            isOpen={showProfissionalModal}
            onClose={() => {
              setShowProfissionalModal(false);
              setProfissionalParaEditar(null);
            }}
            onSave={handleSaveProfissionalModal}
            usuarioEdit={profissionalParaEditar}
            clinicas={clinicasParaForm}
            clinicaAtualId={clinicaAtualId || clinicaId || ''}
            isSuperAdmin={isSuperAdmin} />
          
          </div>
        </div>
      }
      {/* Modal Memed */}
      {showMemedModal && memedConfig && memedProfissional &&
      <MemedPrescricaoModal
        isOpen={showMemedModal}
        onClose={() => setShowMemedModal(false)}
        config={memedConfig}
        profissional={memedProfissional}
        paciente={{
          ...((paciente || {}) as any),
          id: paciente?.id || consulta?.pacienteId || pacienteId || '',
          nome: paciente?.nome || '',
          cpf: (paciente as any)?.cpf || '',
          telefone: paciente?.celular || paciente?.telefone || '',
          email: (paciente as any)?.email || '',
          dataNascimento: (paciente as any)?.dataNascimento || ''
        } as any}
        onPrescricaoCriada={handleMemedPrescricaoCriada} />

      }
    </div>);

}