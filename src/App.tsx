import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useTransition,
  startTransition,
  Component } from
'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { autorDaSessao, autorNaUrl } from './utils/auditLog';
import { Header } from './components/layout/Header';
import { Sidebar, ProntuarioStep } from './components/layout/Sidebar';
import { Dashboard } from './components/Dashboard';
import { AgendaPage } from './components/AgendaPage';
import { AgendaProfissionalPage } from './components/AgendaProfissionalPage';
import { FilaAtendimentoPage } from './components/FilaAtendimentoPage';
import { PacientesPage } from './components/PacientesPage';
import { EmpresasConveniadasPage } from './components/EmpresasConveniadasPage';
import { ConveniosPage } from './components/ConveniosPage';
import { PlanosSaudePage } from './components/PlanosSaudePage';
import { ProntuariosPage } from './components/ProntuariosPage';
import { ProntuarioAtendimentoPage } from './components/ProntuarioAtendimentoPage';
import { ClinicasPage } from './components/ClinicasPage';
import { OperadorasPage } from './components/OperadorasPage';
import { UsuariosPage } from './components/UsuariosPage';
import { ConfiguracoesPage } from './components/ConfiguracoesPage';
import { ConfiguracoesGlobaisPage } from './components/ConfiguracoesGlobaisPage';
import { WhatsAppMetaPage } from './pages/WhatsAppMetaPage';
import { DossieConfigPage } from './pages/DossieConfigPage';
import { AssinaturaGestaoPage } from './pages/AssinaturaGestaoPage';
import { BackupPage } from './pages/BackupPage';
import { BackupLocalPage } from './pages/BackupLocalPage';
import { BackupLocalAgendador } from './components/backup/BackupLocalAgendador';
import { LimitePlanoAviso } from './components/assinatura/LimitePlanoAviso';
import { VideoDemoPage } from './pages/VideoDemoPage';
import { MemedProfissionaisPage } from './components/MemedProfissionaisPage';
import { MedicamentosPage } from './components/MedicamentosPage';
import { normalizarChaveData, slotValeNaData } from './utils/recorrenciaAgenda';
import { PlanosPage } from './components/PlanosPage';
import { ProcedimentosPage } from './components/ProcedimentosPage';
import { ImportacaoPage } from './components/ImportacaoPage';
import { CobrancasPage } from './components/CobrancasPage';
import { MensagensPage } from './components/MensagensPage';
import { LoginPage } from './components/LoginPage';
import { AssinaturaPublicaPage } from './pages/AssinaturaPublicaPage';
import { ConsultaConfirmacaoPublicaPage } from './pages/ConsultaConfirmacaoPublicaPage';
import { ConsultaOnlinePublicaPage } from './pages/ConsultaOnlinePublicaPage';
import { FalarConoscoPublicaPage } from './pages/FalarConoscoPublicaPage';
import { DocumentoLegalPublicaPage } from './pages/DocumentoLegalPublicaPage';
import { AssinaturaFinanceiroPage } from './pages/AssinaturaFinanceiroPage';
import { EspecialidadesPage } from './components/EspecialidadesPage';
import { Cid10Page } from './components/Cid10Page';
import { AuditoriaPage } from './components/AuditoriaPage';
import { SessoesAtivasPage } from './pages/SessoesAtivasPage';
import { PontoPage } from './pages/PontoPage';
import { PontoFacialPage } from './pages/PontoFacialPage';
import { ToastContainer } from './components/ToastContainer';
import { DialogContainer } from './components/DialogContainer';
import { AssistenteFlutuante } from './components/assistente/AssistenteFlutuante';
import { ClinicaForm } from './components/ClinicaForm';
import { WhatsAppAutoActivator } from './components/WhatsAppAutoActivator';
import { ServerErrorBanner } from './components/ServerErrorBanner';
import { SweetAlertProvider } from './components/ui/SweetAlert';
import { useAuth } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { useDialog } from './hooks/useDialog';
import { useClinicas } from './hooks/useClinicas';
import { useOperadoras } from './hooks/useOperadoras';
import { useAgenda } from './hooks/useAgenda';
import { useDependentes } from './hooks/useDependentes';
import { useAgendaProfissional } from './hooks/useAgendaProfissional';
import { Sessao, Usuario, Operadora, Clinica, Consulta } from './types';
import { API_BASE_URL, SERVER_DB_URL, checkApiHealth } from './config/api';
import { DatabaseUnavailable } from './components/DatabaseUnavailable';
// ⭐ FIX vazamento de permissão: helper central para checar 'prontuarios'
import { temPermissao as temPermissaoMenu } from './utils/permissoes';
import { confirmarSaida } from './utils/guardaSaida';
const AGENDA_CALENDAR_HORIZON_DAYS = 90;
const CALENDAR_LOCK_HORIZON_DAYS = 366;
function consultaEhMarcacaoReal(consulta: Consulta): boolean {
  const pacienteId = String(consulta.pacienteId || '').
  trim().
  toLowerCase();
  const status = String(consulta.status || '').
  trim().
  toLowerCase();
  const placeholders = new Set(['disponivel', 'livre', 'bloqueado', 'removido']);
  return !placeholders.has(pacienteId) && status !== 'cancelada';
}
// Componente principal do App (com autenticação)
function MainApp() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [, startTransition] = useTransition();
  // ⭐ PERF: Wrapper que atualiza a data imediatamente mas defer o trabalho pesado
  const setSelectedDateFast = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);
  // ⭐ FASE 4: Combinado init de dashboard + redirect por permissão em um único efeito
  const sessaoRef = useRef<any>(null);
  useEffect(() => {
    // Garante que inicia no dashboard, depois redireciona se não tem permissão
    const sessaoStr = localStorage.getItem('sessao');
    if (!sessaoStr) return;
    const sessaoData = JSON.parse(sessaoStr);
    const perms = sessaoData?.usuario?.permissoesMenu;
    if (perms && perms.length > 0 && !perms.includes('dashboard')) {
      setCurrentPage(perms[0]);
    }
  }, []);
  // O calendário é um painel exclusivo da Agenda. Derivá-lo da rota evita que
  // uma navegação automática deixe controles de disponibilidade em outra tela.
  const showCalendarInSidebar = currentPage === 'agenda';
  // ⭐ Vídeo de demonstração: o palco carrega o sistema num iframe (?demo=1)
  // e conduz a navegação por postMessage, só da mesma origem.
  const navegarDemoRef = useRef<((pagina: string) => void) | null>(null);
  useEffect(() => {
    if (window.parent === window) return;
    const aoReceber = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const dados = ev.data as {tipo?: string;pagina?: string;} | null;
      if (dados?.tipo === 'easyclin-demo-navegar' && typeof dados.pagina === 'string') {
        navegarDemoRef.current?.(dados.pagina);
      }
    };
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, []);
  const [profissionalIdFiltro, setProfissionalIdFiltro] =
  useState<string>('todos');
  // ⭐ Estado para sidebar mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // ⭐ Estado para o step do prontuário
  const [prontuarioStep, setProntuarioStep] =
  useState<ProntuarioStep>('anamnese');
  // ⭐ Estados para atendimento atual (a consulta É o atendimento)
  const [atendimentoPacienteId, setAtendimentoPacienteId] = useState<
    string | undefined>(
  );
  const [atendimentoConsultaId, setAtendimentoConsultaId] = useState<
    string | undefined>(
  );
  const [atendimentoConsulta, setAtendimentoConsulta] = useState<
    Consulta | undefined>(
  );
  // ⭐ Estado para total de pacientes (carregado sob demanda)
  const [totalPacientes, setTotalPacientes] = useState(0);
  // ⭐ FASE 4: Convertido de useState para useRef — elimina 3 re-renders em cascata
  // quando sessao muda. Refs não disparam re-render ao serem atualizadas.
  const lastUserIdRef = useRef<string | null>(null);
  const lastClinicaIdRef = useRef<string | null>(null);
  const lastOperadoraIdRef = useRef<string | null>(null);
  // ⭐ FIX LOOP FRONTEND: lembra para qual clínica o total de pacientes já foi
  // buscado, para não refazer o GET /api/pacientes?limit=1 toda vez que a página
  // volta ao dashboard (ou re-renderiza). Sem isso, o painel ficava disparando a
  // mesma requisição repetidamente.
  const totalPacientesClinicaRef = useRef<string | null>(null);
  // ⭐ NOVO: Estado global de erro do servidor (520, 502, etc.)
  const [serverError, setServerError] = useState<string | null>(null);
  const [isRetryingServer, setIsRetryingServer] = useState(false);
  // ⭐ NOVO: Listener global para erros de fetch (captura 520 de qualquer chamada)
  useEffect(() => {
    const originalFetch = window.fetch;
    let errorTimeout: ReturnType<typeof setTimeout> | null = null;
    let hasError = false;
    // ⭐ FIX: Exige múltiplas falhas consecutivas antes de mostrar o banner
    let consecutiveFailures = 0;
    let lastFailureTime = 0;
    const FAILURE_WINDOW = 10000; // 10 segundos — falhas devem ser próximas
    const MIN_FAILURES = 2; // Mínimo de falhas para mostrar o banner
    const AUTO_CLEAR_DELAY = 30000; // 30 segundos para auto-limpar
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        const url =
        typeof args[0] === 'string' ?
        args[0] :
        (args[0] as Request)?.url || '';
        const isOurApi =
        url.includes(new URL(SERVER_DB_URL).hostname) ||
        url.includes('localhost:5171');
        // ⭐ FIX: Ignora erros de endpoints que são tratados pelos próprios componentes
        // ou que são chamadas de segundo plano não-críticas (sessão/heartbeat).
        const isIgnoredCall =
        url.includes('/api/whatsapp/') ||
        url.includes('/api/carteirinha/') ||
        url.includes('/api/sse/') ||
        url.includes('/api/aniversarios/') ||
        url.includes('/api/sessions/') ||
        url.includes('/api/health');
        // ⭐ FIX: Só limpa erro quando NOSSA API responde OK (não URLs externas)
        if (response.ok && isOurApi) {
          if (hasError) {
            hasError = false;
            setServerError(null);
            if (errorTimeout) clearTimeout(errorTimeout);
          }
          // Reset contador de falhas em qualquer sucesso
          consecutiveFailures = 0;
        }
        // Detecta erros 5xx do Cloudflare/servidor
        if (
        response.status === 520 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504)
        {
          // Só mostra erro para chamadas à nossa API (ignora externas e endpoints ignorados)
          if (isOurApi && !isIgnoredCall) {
            const now = Date.now();
            // Reset contador se a última falha foi há muito tempo
            if (now - lastFailureTime > FAILURE_WINDOW) {
              consecutiveFailures = 0;
            }
            consecutiveFailures++;
            lastFailureTime = now;
            console.warn(
              `⚠️ [ServerError] HTTP ${response.status} em ${url} (falha ${consecutiveFailures}/${MIN_FAILURES})`
            );
            // Só mostra banner após múltiplas falhas consecutivas
            if (consecutiveFailures >= MIN_FAILURES) {
              hasError = true;
              setServerError(
                `Erro ${response.status}: O servidor não está respondendo corretamente.`
              );
              if (errorTimeout) clearTimeout(errorTimeout);
              errorTimeout = setTimeout(() => {
                hasError = false;
                consecutiveFailures = 0;
                setServerError(null);
              }, AUTO_CLEAR_DELAY);
            }
          }
        }
        return response;
      } catch (err) {
        // ⭐⭐⭐ FIX BANNER FALSO "Sem conexão": NÃO contar requisições CANCELADAS
        // como falha de servidor. AbortError acontece o tempo todo de forma
        // legítima — timeouts próprios (checkApiHealth 8s, login 15s), troca de
        // aba, componente desmontado, polls cancelados. Isso NÃO significa que o
        // servidor está offline, mas estava acionando o banner vermelho mesmo com
        // a API funcionando normalmente.
        if ((err as any)?.name === 'AbortError') {
          throw err;
        }
        // Erro de rede (servidor completamente offline)
        const url =
        typeof args[0] === 'string' ?
        args[0] :
        (args[0] as Request)?.url || '';
        const isIgnoredUrl =
        url.includes('/api/whatsapp/') ||
        url.includes('/api/carteirinha/') ||
        url.includes('/api/sse/') ||
        url.includes('/api/aniversarios/') ||
        url.includes('/api/sessions/') ||
        url.includes('/api/health');
        if (
        (url.includes(new URL(SERVER_DB_URL).hostname) ||
        url.includes('localhost:5171')) &&
        !isIgnoredUrl)
        {
          const now = Date.now();
          if (now - lastFailureTime > FAILURE_WINDOW) {
            consecutiveFailures = 0;
          }
          consecutiveFailures++;
          lastFailureTime = now;
          console.warn(
            `⚠️ [NetworkError] Falha de conexão em ${url} (falha ${consecutiveFailures}/${MIN_FAILURES})`
          );
          // Só mostra banner após múltiplas falhas consecutivas
          if (consecutiveFailures >= MIN_FAILURES) {
            hasError = true;
            setServerError(
              'Não foi possível conectar ao servidor. Verifique sua conexão.'
            );
            if (errorTimeout) clearTimeout(errorTimeout);
            errorTimeout = setTimeout(() => {
              hasError = false;
              consecutiveFailures = 0;
              setServerError(null);
            }, AUTO_CLEAR_DELAY);
          }
        }
        throw err;
      }
    };
    return () => {
      window.fetch = originalFetch;
      if (errorTimeout) clearTimeout(errorTimeout);
    };
  }, []); // ⭐ Sem dependências - instala uma vez só
  const handleRetryServer = async () => {
    setIsRetryingServer(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/usuarios?page=1&limit=1`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          }
        }
      );
      if (response.ok) {
        setServerError(null);
        // ⭐ FIX: NÃO recarrega a página — isso causava perda de sessão e redirecionamento ao login
        // Os hooks se re-sincronizam automaticamente quando o serverError é limpo
        console.log('✅ [handleRetryServer] Servidor respondeu OK, erro limpo');
      }
    } catch {
      // Servidor ainda offline
      setServerError(
        'Servidor ainda não está respondendo. Tente novamente em alguns segundos.'
      );
    }
    setIsRetryingServer(false);
  };
  const { toasts, removeToast, success, error, warning, info } = useToast();
  const {
    dialogs,
    removeDialog,
    confirm,
    alert,
    error: dialogError
  } = useDialog();
  const {
    sessao,
    login,
    confirmarCodigo,
    reenviarCodigo,
    logout,
    trocarSenha,
    selecionarOperadora,
    selecionarClinica,
    temPermissao,
    usuarios,
    setUsuarios,
    refresh: refreshUsuarios,
    notificarMudanca
  } = useAuth();
  const {
    operadoras,
    addOperadora,
    updateOperadora,
    getOperadoraById,
    getOperadoraByCnpj
  } = useOperadoras();
  // Determina o operadoraId baseado no tipo de usuário
  const operadoraId =
  sessao?.usuario.tipo === 'super_admin' ?
  sessao?.operadoraSelecionada?.id :
  sessao?.usuario.operadoraId;
  // DEBUG: Log para identificar problemas
  if (sessao && !operadoraId && sessao.usuario.tipo !== 'super_admin') {
    console.warn('⚠️ [App] PROBLEMA: Usuário admin/médico/etc sem operadoraId!');
    console.warn('   - Usuário:', sessao.usuario.nome);
    console.warn('   - Tipo:', sessao.usuario.tipo);
    console.warn('   - operadoraId:', sessao.usuario.operadoraId);
    console.warn(
      '   - SOLUÇÃO: Edite o usuário no banco e adicione um operadoraId válido'
    );
  }
  const { clinicas, addClinica, updateClinica, deleteClinica, getClinicaById } =
  useClinicas(operadoraId || undefined);
  // Flag para mostrar aviso de configuração incompleta
  const usuarioSemOperadora =
  sessao &&
  sessao.usuario.tipo !== 'super_admin' &&
  !sessao.usuario.operadoraId;
  const precisaSelecionarOperadora =
  sessao?.usuario.tipo === 'super_admin' &&
  !sessao?.operadoraSelecionada &&
  currentPage !== 'operadoras';
  const precisaSelecionarClinica =
  sessao?.usuario.tipo === 'super_admin' ?
  sessao?.operadoraSelecionada &&
  !sessao?.clinicaAtual &&
  currentPage !== 'clinicas' &&
  currentPage !== 'usuarios' &&
  currentPage !== 'operadoras' :
  !sessao?.clinicaAtual &&
  currentPage !== 'configuracoes' &&
  currentPage !== 'clinicas';
  // ⭐ FASE 4: Detecta mudanças de contexto usando refs (sem cascata de re-renders)
  useEffect(() => {
    const currentUserId = sessao?.usuario?.id || null;
    const currentClinicaId = sessao?.clinicaAtual?.id || null;
    const currentOperadoraId =
    sessao?.operadoraSelecionada?.id || sessao?.usuario?.operadoraId || null;
    const resetToHome = () => {
      setCurrentPage('dashboard');
      setProfissionalIdFiltro('todos');
      setSelectedDate(new Date());
    };
    // Detecta mudança de usuário
    if (
    lastUserIdRef.current !== null &&
    currentUserId !== lastUserIdRef.current)
    {
      resetToHome();
    }
    // Detecta mudança de clínica
    if (
    lastClinicaIdRef.current !== null &&
    currentClinicaId !== lastClinicaIdRef.current &&
    currentClinicaId !== null)
    {
      resetToHome();
    }
    // Detecta mudança de operadora (para super_admin)
    if (
    sessao?.usuario?.tipo === 'super_admin' &&
    lastOperadoraIdRef.current !== null &&
    currentOperadoraId !== lastOperadoraIdRef.current)
    {
      resetToHome();
    }
    // Atualiza refs (sem re-render)
    lastUserIdRef.current = currentUserId;
    lastClinicaIdRef.current = currentClinicaId;
    lastOperadoraIdRef.current = currentOperadoraId;
  }, [
  sessao?.usuario?.id,
  sessao?.clinicaAtual?.id,
  sessao?.operadoraSelecionada?.id,
  sessao?.usuario?.operadoraId,
  sessao?.usuario?.tipo]
  );
  // ⭐ HEARTBEAT: Envia ping a cada 60s para rastrear sessões ativas
  useEffect(() => {
    if (!sessao?.usuario?.id) return;
    const sendHeartbeat = () => {
      fetch(`${API_BASE_URL}/api/sessions/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usuarioId: sessao.usuario.id,
          usuarioNome: sessao.usuario.nome,
          usuarioEmail: sessao.usuario.email,
          usuarioTipo: sessao.usuario.tipo,
          clinicaId: sessao.clinicaAtual?.id || null,
          clinicaNome: sessao.clinicaAtual?.nome || null
        })
      }).catch(() => {});
    };
    sendHeartbeat(); // Envia imediatamente
    const interval = setInterval(sendHeartbeat, 60000); // A cada 60s
    return () => clearInterval(interval);
  }, [sessao?.usuario?.id, sessao?.clinicaAtual?.id]);
  // ⭐ NOVO: Listener para eventos de mudança de contexto
  useEffect(() => {
    const handleLogout = () => {
      console.log('🚪 [App] Evento de logout recebido, resetando estados');
      setCurrentPage('dashboard');
      setProfissionalIdFiltro('todos');
      setSelectedDate(new Date());
      lastUserIdRef.current = null;
      lastClinicaIdRef.current = null;
      lastOperadoraIdRef.current = null;
    };
    const handleClinicaChanged = () => {
      console.log('🏥 [App] Evento de mudança de clínica recebido');
      setCurrentPage('dashboard');
      setProfissionalIdFiltro('todos');
    };
    const handleOperadoraChanged = () => {
      console.log('🏢 [App] Evento de mudança de operadora recebido');
      setCurrentPage('dashboard');
      setProfissionalIdFiltro('todos');
    };
    window.addEventListener('user-logout', handleLogout);
    window.addEventListener('clinica-changed', handleClinicaChanged);
    window.addEventListener('operadora-changed', handleOperadoraChanged);
    return () => {
      window.removeEventListener('user-logout', handleLogout);
      window.removeEventListener('clinica-changed', handleClinicaChanged);
      window.removeEventListener('operadora-changed', handleOperadoraChanged);
    };
  }, []);
  // ⭐ FASE 4: Resolução de clínica unificada — 3 efeitos combinados em 1.
  // Reduz re-renders em cascata quando sessao/clinicas mudam.
  useEffect(() => {
    if (!sessao) return;
    // 1. Auto-seleciona clínica do cadastro do usuário (não-super_admin)
    if (
    sessao.usuario.tipo !== 'super_admin' &&
    sessao.usuario.clinicaId &&
    !sessao.clinicaAtual)
    {
      const clinica = clinicas.find((c) => c.id === sessao.usuario.clinicaId);
      if (clinica) {
        selecionarClinica(clinica);
        const configKey = `whatsapp_config_${clinica.id}`;
        const whatsappConfig = localStorage.getItem(configKey);
        if (whatsappConfig) {
          const config = JSON.parse(whatsappConfig);
          if (!config.ativo) {
            config.ativo = true;
            localStorage.setItem(configKey, JSON.stringify(config));
            window.dispatchEvent(new Event('whatsapp-config-updated'));
          }
        }
        return; // Clínica selecionada, não precisa continuar
      }
    }
    // 2. Redireciona para página de clínicas se não existem clínicas
    if (
    sessao.usuario.tipo === 'super_admin' &&
    sessao.operadoraSelecionada &&
    clinicas.length === 0 &&
    currentPage !== 'clinicas' &&
    currentPage !== 'dashboard')
    {
      setCurrentPage('clinicas');
      return;
    }
    if (
    sessao.usuario.tipo !== 'super_admin' &&
    sessao.usuario.operadoraId &&
    clinicas.filter((c) => c.operadoraId === sessao.usuario.operadoraId).
    length === 0 &&
    currentPage !== 'clinicas' &&
    currentPage !== 'dashboard' &&
    ['admin'].includes(sessao.usuario.tipo))
    {
      setCurrentPage('clinicas');
      return;
    }
    // 3. Auto-seleciona clínica única da operadora
    if (precisaSelecionarClinica) {
      const clinicasDaOperadora = clinicas.filter((c) =>
      sessao.usuario.tipo === 'super_admin' ?
      c.operadoraId === operadoraId :
      c.operadoraId === sessao.usuario.operadoraId
      );
      if (clinicasDaOperadora.length === 1) {
        const clinica = clinicasDaOperadora[0];
        if (!sessao.clinicaAtual || sessao.clinicaAtual.id !== clinica.id) {
          selecionarClinica(clinica);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao, clinicas, currentPage, precisaSelecionarClinica, operadoraId]);
  const clinicaId = sessao?.clinicaAtual?.id;
  // ⭐ Usuários filtrados pela operadora atual — NUNCA expõe usuários de outras operadoras
  // ⭐ FIX: Inclui super_admins que podem ter operadoraId NULL
  const usuariosDaOperadora = useMemo(() => {
    if (!operadoraId) return [];
    return usuarios.filter(
      (u) => u.operadoraId === operadoraId || u.tipo === 'super_admin'
    );
  }, [usuarios, operadoraId]);
  // ⭐ Hooks que PRECISAM estar no App.tsx (usados em múltiplas páginas)
  const {
    consultas,
    addConsulta,
    updateConsulta,
    refresh: refreshConsultas,
    expandRangeForDate
  } = useAgenda(clinicaId);
  const { dependentes, addDependente } = useDependentes(clinicaId);
  const { agendas, refresh: refreshAgendas } = useAgendaProfissional(clinicaId);
  // ⭐⭐⭐ HELPER CRÍTICO: Busca agenda por profissionalId COM FALLBACK por nome
  // Resolve o problema de IDs diferentes entre tabela agendas e tabela usuarios (pós-migração)
  const findAgendaForProfissionalApp = (
  profId: string,
  mustBeAtivo = false) =>
  {
    if (!profId || profId === 'todos') return undefined;
    // 1. Tenta match por ID
    const byId = agendas.find(
      (a) =>
      String(a.profissionalId) === String(profId) && (
      !mustBeAtivo || a.ativo)
    );
    if (byId) return byId;
    // 2. Fallback por nome. Usa todos os usuários como contingência para não
    // perder uma agenda válida quando a lista da operadora ainda está atualizando.
    const prof =
    usuariosDaOperadora.find((u) => String(u.id) === String(profId)) ||
    usuarios.find((u) => String(u.id) === String(profId));
    if (prof?.nome) {
      const nomeNorm = prof.nome.trim().toUpperCase();
      const byNome = agendas.find(
        (a) =>
        a.profissionalNome &&
        a.profissionalNome.trim().toUpperCase() === nomeNorm && (
        !mustBeAtivo || a.ativo)
      );
      if (byNome) {
        console.warn(
          `⚠️ [App] Agenda encontrada por NOME ("${prof.nome}") — IDs divergentes: agenda.profissionalId="${byNome.profissionalId}" vs usuario.id="${profId}"`
        );
        return byNome;
      }
    }
    return undefined;
  };
  // ⭐ FASE 4: Efeitos de agenda combinados — expande range + recarrega agendas
  useEffect(() => {
    if (
    currentPage === 'agenda' ||
    currentPage === 'fila_atendimento' ||
    currentPage === 'dashboard')
    {
      refreshAgendas();
    }
    if (
    selectedDate && (
    currentPage === 'agenda' || currentPage === 'fila_atendimento'))
    {
      // ⭐ PERF: Não bloqueia a UI — expandRange roda em background
      startTransition(() => {
        expandRangeForDate(selectedDate);
      });
    }
  }, [selectedDate, currentPage, expandRangeForDate]);
  // ⭐ Carrega total de pacientes apenas quando necessário (Dashboard)
  useEffect(() => {
    if (!clinicaId) {
      setTotalPacientes(0);
      totalPacientesClinicaRef.current = null;
      return;
    }
    // Só carrega no dashboard
    if (currentPage !== 'dashboard') return;
    // ⭐ FIX LOOP: já buscamos o total desta clínica → não repete a requisição.
    if (totalPacientesClinicaRef.current === clinicaId) return;
    totalPacientesClinicaRef.current = clinicaId;
    const carregarTotalPacientes = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&page=1&limit=1`
        );
        if (response.ok) {
          const result = await response.json();
          setTotalPacientes(result.pagination?.total || 0);
        }
      } catch (err) {
        console.error('Erro ao carregar total de pacientes:', err);
        // Libera para tentar de novo numa próxima visita ao dashboard.
        totalPacientesClinicaRef.current = null;
      }
    };
    carregarTotalPacientes();
  }, [clinicaId, currentPage]);
  const profissionais = useMemo(() => {
    const profissionaisMap = new Map<
      string,
      {
        id: string;
        nome: string;
      }>(
    );
    // ⭐ Apenas profissionais da clínica atual — sem consultas antigas como fonte
    usuariosDaOperadora.forEach((u) => {
      const isMedicoOuDentista = u.tipo === 'medico' || u.tipo === 'dentista';
      const pertenceClinica =
      String(u.clinicaId || '') === String(clinicaId || '') || !u.clinicaId;
      const isAtivo = u.ativo !== false && u.ativo !== 0;
      if (isMedicoOuDentista && pertenceClinica && isAtivo) {
        // ⭐ FIX: Mostra TODOS os profissionais ativos no select (médicos/dentistas)
        // O controle rigoroso de agenda fica apenas no botão direito do calendário
        // (availableDatesProfessionals filtra por dia da semana)
        profissionaisMap.set(u.id, {
          id: u.id,
          nome: u.nome,
          titulo: u.titulo,
          tipo: u.tipo
        });
      }
    });
    // ⚠️ NÃO adiciona profissionais de agendas - SOMENTE do cadastro de usuários
    // Se um profissional tem agenda mas não está no cadastro de usuários, ele NÃO aparece no select
    return Array.from(profissionaisMap.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome)
    );
  }, [usuariosDaOperadora, clinicaId, agendas]);
  // Gera os slots configurados para uma agenda/data usando a mesma regra canônica
  // da Agenda. A disponibilidade do calendário vem exclusivamente da grade, sem
  // depender de placeholders persistidos de consultas.
  const getGradeSlotsForDate = useCallback(
    (
    agenda: (typeof agendas)[number],
    date: Date,
    dateKey: string)
    : Set<string> => {
      const slots = new Set<string>();
      const horariosValidos = agenda.horarios.filter((horario) =>
      slotValeNaData(horario, date, dateKey)
      );
      const toMinutes = (value?: string): number | null => {
        if (typeof value !== 'string') return null;
        const match = value.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (
        !Number.isInteger(hours) ||
        !Number.isInteger(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59)

        return null;
        return hours * 60 + minutes;
      };
      const addSlot = (minutes: number) => {
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        slots.add(
          `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
        );
      };
      horariosValidos.forEach((horario) => {
        if (horario.horariosManuais?.length) {
          horario.horariosManuais.forEach((slot) => {
            const minutes = toMinutes(slot);
            if (minutes !== null) addSlot(minutes);
          });
          return;
        }
        const inicio = toMinutes(horario.horaInicio);
        const fim = toMinutes(horario.horaFim);
        if (inicio === null || fim === null || fim <= inicio) return;
        const intervaloInicio = toMinutes(horario.intervaloInicio);
        const intervaloFim = toMinutes(horario.intervaloFim);
        const temIntervalo =
        intervaloInicio !== null &&
        intervaloFim !== null &&
        intervaloFim > intervaloInicio;
        const duracao =
        Number.isFinite(Number(horario.duracaoConsultaPadrao)) &&
        Number(horario.duracaoConsultaPadrao) > 0 ?
        Number(horario.duracaoConsultaPadrao) :
        30;
        let horarioAtual = inicio;
        while (horarioAtual < fim) {
          if (
          temIntervalo &&
          horarioAtual >= intervaloInicio! &&
          horarioAtual < intervaloFim!)
          {
            horarioAtual = intervaloFim!;
            continue;
          }
          addSlot(horarioAtual);
          horarioAtual += duracao;
        }
      });
      return slots;
    },
    []
  );
  const availableDatesInfo = useMemo(() => {
    const profMap: Record<
      string,
      Array<{
        id: string;
        nome: string;
        titulo: string;
        tipo: string;
      }>> =
    {};
    // ⭐ NOVO: Mapa de TODOS os profissionais com agenda para cada data (para contexto do calendário)
    const allProfMap: Record<
      string,
      Array<{
        id: string;
        nome: string;
        titulo: string;
        tipo: string;
      }>> =
    {};
    // ⭐ PERF: Pre-computa contagem de consultas reais por data+profissional
    // Evita O(60 * agendas * N) filtros — agora é O(N) build + O(1) lookup
    const consultasCountMap = new Map<string, number>();
    for (const c of consultas) {
      if (
      c.status === 'cancelada' ||
      c.pacienteId === 'disponivel' ||
      c.pacienteId === 'livre' ||
      c.pacienteId === 'bloqueado' ||
      c.pacienteId === 'removido')

      continue;
      const key = `${c.data}_${c.profissionalId}`;
      consultasCountMap.set(key, (consultasCountMap.get(key) || 0) + 1);
    }
    if (profissionalIdFiltro === 'todos') {
      const diasComHorarioValido = new Set<number>();
      const datasEspecificasConfiguradas = new Set<string>();
      agendas.forEach((agenda) => {
        if (!agenda.horarios || agenda.horarios.length === 0 || !agenda.ativo)
        return;
        agenda.horarios.forEach((h) => {
          h.datasEspecificas?.forEach((data) => {
            const dateKey = normalizarChaveData(data);
            if (dateKey) datasEspecificasConfiguradas.add(dateKey);
          });
          const diaSemanaNum = Number(h.diaSemana);
          if (isNaN(diaSemanaNum) || diaSemanaNum < 0 || diaSemanaNum > 6)
          return;
          const temManuais = Boolean(h.horariosManuais?.length);
          const inicioValido =
          typeof h.horaInicio === 'string' && h.horaInicio.includes(':');
          const fimValido =
          typeof h.horaFim === 'string' && h.horaFim.includes(':');
          const naoZerado = !(h.horaInicio === '00:00' && h.horaFim === '00:00');
          if (temManuais || inicioValido && fimValido && naoZerado) {
            diasComHorarioValido.add(diaSemanaNum);
          }
        });
      });
      if (
      diasComHorarioValido.size === 0 &&
      datasEspecificasConfiguradas.size === 0)

      return {
        dates: [] as string[],
        profMap,
        allProfMap
      };
      const dates: string[] = [];
      const today = new Date();
      // Mantém o mesmo horizonte dos dias bloqueados, evitando que dias válidos
      // após o 60º dia caiam no fallback visual de "futuro sem agenda".
      for (let i = 0; i < AGENDA_CALENDAR_HORIZON_DAYS; i++) {
        const checkDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + i
        );
        const year = checkDate.getFullYear();
        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeek = checkDate.getDay();
        if (
        diasComHorarioValido.has(dayOfWeek) ||
        datasEspecificasConfiguradas.has(dateKey))
        {
          const profissionaisDisponiveis: Array<{
            id: string;
            nome: string;
            titulo?: string;
            tipo?: string;
          }> = [];
          // ⭐ NOVO: Coleta TODOS os profissionais com horário neste dia da semana
          const profissionaisComAgenda: Array<{
            id: string;
            nome: string;
            titulo: string;
            tipo: string;
          }> = [];
          for (const agenda of agendas) {
            if (!agenda.horarios?.length || !agenda.ativo) continue;
            const dateObj = new Date(dateKey + 'T12:00:00');
            // Consolida todos os turnos que valem nesta data. Um profissional pode
            // ter mais de um turno no mesmo dia, inclusive combinações A/B e manuais.
            const slotsDaGrade = getGradeSlotsForDate(agenda, dateObj, dateKey);
            if (slotsDaGrade.size === 0) continue;
            const profInfo = profissionais.find(
              (p) => p.id === agenda.profissionalId
            );
            const profNome = profInfo?.nome || agenda.profissionalNome;
            if (
            !profissionaisComAgenda.some(
              (p) => p.id === agenda.profissionalId
            ))
            {
              profissionaisComAgenda.push({
                id: agenda.profissionalId,
                nome: profNome,
                titulo: profInfo?.titulo || '',
                tipo: profInfo?.tipo || ''
              });
            }
            const appointmentsOnDay =
            consultasCountMap.get(`${dateKey}_${agenda.profissionalId}`) || 0;
            if (
            appointmentsOnDay < slotsDaGrade.size &&
            !profissionaisDisponiveis.some(
              (p) => p.id === agenda.profissionalId
            ))
            {
              profissionaisDisponiveis.push({
                id: agenda.profissionalId,
                nome: profNome,
                titulo: profInfo?.titulo || '',
                tipo: profInfo?.tipo || ''
              });
            }
          }
          // ⭐ NOVO: Salva todos os profissionais com agenda para esta data
          if (profissionaisComAgenda.length > 0) {
            allProfMap[dateKey] = profissionaisComAgenda;
          }
          if (profissionaisDisponiveis.length > 0) {
            dates.push(dateKey);
            profMap[dateKey] = profissionaisDisponiveis;
          }
        }
      }
      return {
        dates,
        profMap,
        allProfMap
      };
    }
    // Quando um profissional específico está selecionado
    const agenda = findAgendaForProfissionalApp(profissionalIdFiltro, true);
    // Mesmo sem agenda do profissional selecionado, calcula profMap para botão direito.
    const temAgendaValida =
    agenda && agenda.horarios && agenda.horarios.length > 0;
    const dates: string[] = [];
    const today = new Date();
    // Mantém o horizonte sincronizado com lockedDates para não bloquear uma
    // grade válida apenas por ela estar além da antiga janela de 60 dias.
    // Coleta a grade semanal e as datas específicas de todas as agendas para
    // o contexto do calendário no modo “Todos”.
    const todosDiasValidos = new Set<number>();
    const todasDatasEspecificas = new Set<string>();
    agendas.forEach((ag) => {
      if (!ag.horarios || !ag.ativo) return;
      ag.horarios.forEach((h) => {
        const d = Number(h.diaSemana);
        if (!isNaN(d) && d >= 0 && d <= 6) todosDiasValidos.add(d);
        h.datasEspecificas?.forEach((data) => {
          const dateKey = normalizarChaveData(data);
          if (dateKey) todasDatasEspecificas.add(dateKey);
        });
      });
    });
    for (let i = 0; i < AGENDA_CALENDAR_HORIZON_DAYS; i++) {
      const checkDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + i
      );
      const year = checkDate.getFullYear();
      const month = String(checkDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      const dayOfWeek = checkDate.getDay();
      // Calcula profMap para todos os profissionais, incluindo datas específicas.
      if (
      todosDiasValidos.has(dayOfWeek) ||
      todasDatasEspecificas.has(dateKey))
      {
        const profissionaisDisponiveis: Array<{
          id: string;
          nome: string;
        }> = [];
        // ⭐ NOVO: Coleta TODOS os profissionais com horário neste dia
        const profissionaisComAgenda: Array<{
          id: string;
          nome: string;
          titulo: string;
          tipo: string;
        }> = [];
        for (const ag of agendas) {
          if (!ag.horarios?.length || !ag.ativo) continue;
          const dateObj = new Date(dateKey + 'T12:00:00');
          const slotsDaGrade = getGradeSlotsForDate(ag, dateObj, dateKey);
          if (slotsDaGrade.size === 0) continue;
          const profInfo = profissionais.find((p) => p.id === ag.profissionalId);
          const profNome = profInfo?.nome || ag.profissionalNome;
          if (!profissionaisComAgenda.some((p) => p.id === ag.profissionalId)) {
            profissionaisComAgenda.push({
              id: ag.profissionalId,
              nome: profNome,
              titulo: profInfo?.titulo || '',
              tipo: profInfo?.tipo || ''
            });
          }
          const appts =
          consultasCountMap.get(`${dateKey}_${ag.profissionalId}`) || 0;
          if (
          appts < slotsDaGrade.size &&
          !profissionaisDisponiveis.some((p) => p.id === ag.profissionalId))
          {
            profissionaisDisponiveis.push({
              id: ag.profissionalId,
              nome: profNome
            });
          }
        }
        // ⭐ NOVO: Salva todos os profissionais com agenda para esta data
        if (profissionaisComAgenda.length > 0) {
          allProfMap[dateKey] = profissionaisComAgenda;
        }
        if (profissionaisDisponiveis.length > 0) {
          profMap[dateKey] = profissionaisDisponiveis;
        }
      }
      // Calcula dates apenas para o profissional selecionado (para os dots âmbar).
      // A busca usa a regra canônica para incluir também datas específicas, que podem
      // ser diferentes do dia semanal originalmente usado ao cadastrar o horário.
      if (!temAgendaValida) continue;
      const dateObj = new Date(dateKey + 'T12:00:00');
      const slotsDaGrade = getGradeSlotsForDate(agenda, dateObj, dateKey);
      if (slotsDaGrade.size === 0) continue;
      const appointmentsOnDay =
      consultasCountMap.get(`${dateKey}_${agenda.profissionalId}`) || 0;
      if (appointmentsOnDay < slotsDaGrade.size) {
        dates.push(dateKey);
      }
    }
    return {
      dates,
      profMap,
      allProfMap
    };
  }, [
  profissionalIdFiltro,
  agendas,
  consultas,
  profissionais,
  getGradeSlotsForDate]
  );
  // A grade apenas informa que ainda há vaga. Ela não abre uma data por si só:
  // o Calendar aplica o estado fechado antes de exibir o ponto amarelo.
  const availableDates = availableDatesInfo.dates;
  const availableDatesProfessionals = availableDatesInfo.profMap;
  const allAgendaProfByDate = availableDatesInfo.allProfMap;
  // Persistido no banco via API /api/agendas/dias-abertos
  // Estado: mapa de status explícitos por profissional (carregado do banco)
  const [diasStatusMap, setDiasStatusMap] = useState<
    Record<string, Record<string, string>>>(
    {});
  // Status de dia pertence à clínica. Limpar o cache impede que um mesmo ID de
  // profissional reutilize uma abertura/fechamento ao trocar de operadora/clínica.
  useEffect(() => {
    setDiasStatusMap({});
  }, [clinicaId]);
  // Carrega dias status do banco ao trocar de profissional.
  // O cancelamento impede que uma resposta da clínica anterior reapareça depois
  // da troca de operadora/clínica.
  useEffect(() => {
    if (profissionalIdFiltro === 'todos' || !clinicaId) return;
    if (diasStatusMap[profissionalIdFiltro] !== undefined) return;
    let cancelado = false;
    fetch(
      `${API_BASE_URL}/api/agendas/dias-abertos?clinicaId=${clinicaId}&profissionalId=${profissionalIdFiltro}`
    ).
    then((r) => r.ok ? r.json() : []).
    then(
      (
      rows: Array<{
        data: string;
        status: string;
      }>) =>
      {
        if (cancelado) return;
        const statusMap: Record<string, string> = {};
        rows.forEach((r) => {
          const dateKey = normalizarChaveData(r.data);
          if (dateKey) statusMap[dateKey] = r.status;
        });
        setDiasStatusMap((prev) => ({
          ...prev,
          [profissionalIdFiltro]: statusMap
        }));
      }
    ).
    catch(() => {
      if (cancelado) return;
      setDiasStatusMap((prev) => ({
        ...prev,
        [profissionalIdFiltro]: {}
      }));
    });
    return () => {
      cancelado = true;
    };
  }, [profissionalIdFiltro, clinicaId, diasStatusMap]);
  // ⭐ Em "Todos" o calendário mostra a lista de profissionais por dia. Sem o
  // status de CADA profissional não há como saber se o dia dele está aberto —
  // era isso que fazia um profissional com dia FECHADO aparecer na lista.
  const idsProfissionaisParaStatus = useMemo(() => {
    const ids = new Set<string>();
    Object.values(allAgendaProfByDate).forEach((lista) => {
      lista.forEach((p) => {
        if (p?.id) ids.add(String(p.id));
      });
    });
    return Array.from(ids);
  }, [allAgendaProfByDate]);
  useEffect(() => {
    if (!clinicaId) return;
    const pendentes = idsProfissionaisParaStatus.filter(
      (id) => diasStatusMap[id] === undefined
    );
    if (pendentes.length === 0) return;
    let cancelado = false;
    Promise.all(
      pendentes.map((profId) =>
      fetch(
        `${API_BASE_URL}/api/agendas/dias-abertos?clinicaId=${clinicaId}&profissionalId=${profId}`
      ).
      then((r) => r.ok ? r.json() : []).
      then(
        (
        rows: Array<{
          data: string;
          status: string;
        }>) =>
        {
          const statusMap: Record<string, string> = {};
          (rows || []).forEach((r) => {
            const dateKey = normalizarChaveData(r.data);
            if (dateKey) statusMap[dateKey] = r.status;
          });
          return [profId, statusMap] as const;
        }
      ).
      catch(() => [profId, {} as Record<string, string>] as const)
      )
    ).then((resultados) => {
      if (cancelado) return;
      setDiasStatusMap((prev) => {
        const proximo = {
          ...prev
        };
        resultados.forEach(([profId, statusMap]) => {
          if (proximo[profId] === undefined) proximo[profId] = statusMap;
        });
        return proximo;
      });
    });
    return () => {
      cancelado = true;
    };
  }, [clinicaId, idsProfissionaisParaStatus, diasStatusMap]);

  // Toggle abrir/fechar dia (atualiza estado + salva no banco)
  // ⭐ Núcleo da abertura/fechamento — aceita profId explícito.
  // Usado tanto pelo handleToggleDayLock (botão "Abrir/Fechar dia" do menu) quanto
  // pelo handleOpenDayForProf (clique em profissional na lista do menu em "Todos").
  const aplicarStatusDia = useCallback(
    (profId: string, dateKey: string, lock: boolean) => {
      // Sem marcação, a data é fechada por padrão. “Abrir dia” é a
      // exceção manual e persistente para esta data e este profissional.
      const newStatus = lock ? 'fechado' : 'aberto';
      const statusAnterior = diasStatusMap[profId]?.[dateKey];
      setDiasStatusMap((prev) => {
        const current = {
          ...(prev[profId] || {})
        };
        current[dateKey] = newStatus;
        return {
          ...prev,
          [profId]: current
        };
      });
      console.log(
        `📅 [aplicarStatusDia] ${lock ? 'FECHANDO' : 'ABRINDO'}: prof=${profId} ${dateKey} → status=${newStatus}`
      );
      if (!clinicaId) {
        console.warn(
          `📅 [aplicarStatusDia] clinicaId não definido — mudança só em memória`
        );
        warning('Mudança salva apenas em memória — clínica não identificada.');
        return;
      }
      fetch(`${API_BASE_URL}/api/agendas/dias-abertos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          profissionalId: profId,
          data: dateKey,
          status: newStatus
        })
      }).
      then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error(`📅 [aplicarStatusDia] API ERRO ${r.status}:`, data);
          error(
            `Não foi possível ${lock ? 'fechar' : 'abrir'} o dia (${r.status}).`
          );
          // Reverte a mudança otimista
          setDiasStatusMap((prev) => {
            const current = {
              ...(prev[profId] || {})
            };
            if (statusAnterior) {
              current[dateKey] = statusAnterior;
            } else {
              delete current[dateKey];
            }
            return {
              ...prev,
              [profId]: current
            };
          });
          return;
        }
        console.log(`📅 [aplicarStatusDia] ✅ API ok:`, data);
        // ⭐ Formata data em PT-BR para ficar mais legível no toast.
        let dataBR = dateKey;
        try {
          const [y, m, d] = dateKey.split('-').map(Number);
          dataBR = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        } catch {

          // mantém o dateKey original
        }success(
          lock ?
          `✅ Dia ${dataBR} fechado.` :
          `✅ Dia ${dataBR} aberto manualmente.`
        );
      }).
      catch((err) => {
        console.error(`📅 [aplicarStatusDia] Falha de rede:`, err);
        setDiasStatusMap((prev) => {
          const current = {
            ...(prev[profId] || {})
          };
          if (statusAnterior) {
            current[dateKey] = statusAnterior;
          } else {
            delete current[dateKey];
          }
          return {
            ...prev,
            [profId]: current
          };
        });
        error('Falha de rede ao salvar o dia. Tente novamente.');
      });
    },
    [clinicaId, diasStatusMap, success, error, warning]
  );
  const handleToggleDayLock = useCallback(
    (dateKey: string, lock: boolean) => {
      console.log(
        `📅 [handleToggleDayLock] dateKey=${dateKey} lock=${lock} profissional=${profissionalIdFiltro} clinicaId=${clinicaId}`
      );
      if (profissionalIdFiltro === 'todos') {
        console.warn(
          '📅 [handleToggleDayLock] BLOQUEADO: profissionalIdFiltro é "todos"'
        );
        // ⭐ FIX: dá feedback visível ao usuário (antes falhava em silêncio)
        warning(
          'Selecione um profissional específico no menu lateral antes de ativar o dia.'
        );
        return;
      }
      aplicarStatusDia(profissionalIdFiltro, dateKey, lock);
    },
    [profissionalIdFiltro, clinicaId, aplicarStatusDia, warning]
  );
  // Abre manualmente uma data para um profissional específico no modo “Todos”.
  const handleOpenDayForProf = useCallback(
    (dateKey: string, profId: string) => {
      if (!profId || profId === 'todos') return;
      aplicarStatusDia(profId, dateKey, false);
    },
    [aplicarStatusDia]
  );
  const marcacoesReaisPorProfissionalData = useMemo(() => {
    const marcacoes = new Set<string>();
    consultas.forEach((consulta) => {
      if (!consultaEhMarcacaoReal(consulta)) return;
      const data = normalizarChaveData(consulta.data);
      if (data && consulta.profissionalId) {
        marcacoes.add(`${data}_${consulta.profissionalId}`);
      }
    });
    return marcacoes;
  }, [consultas]);
  const marcacoesReaisPorData = useMemo(
    () =>
    new Set(
      Array.from(marcacoesReaisPorProfissionalData, (marcacao) =>
      marcacao.slice(0, 10)
      )
    ),
    [marcacoesReaisPorProfissionalData]
  );
  // ⭐ Um profissional só entra na lista do calendário se o dia DELE estiver
  // aberto: status explícito "aberto" ou marcação real. "fechado" e a ausência
  // de status mantêm o dia fechado — e o profissional fora da lista.
  const availableDatesProfessionalsAbertos = useMemo(() => {
    const resultado: typeof availableDatesProfessionals = {};
    Object.entries(availableDatesProfessionals).forEach(([dateKey, lista]) => {
      const abertos = lista.filter((prof) => {
        const profId = String(prof.id);
        const status = diasStatusMap[profId]?.[dateKey];
        if (status === 'fechado') return false;
        if (status === 'aberto') return true;
        return marcacoesReaisPorProfissionalData.has(`${dateKey}_${profId}`);
      });
      if (abertos.length > 0) resultado[dateKey] = abertos;
    });
    return resultado;
  }, [
  availableDatesProfessionals,
  diasStatusMap,
  marcacoesReaisPorProfissionalData]
  );
  // Sem marcação real, o dia é fechado. A grade só descreve horários possíveis;
  // ela não é mais usada para reabrir datas que precisam ser corrigidas.
  const lockedDates = useMemo(() => {
    const statusMap = diasStatusMap[profissionalIdFiltro] || {};
    const locked: string[] = [];
    const today = new Date();
    for (let i = 0; i < CALENDAR_LOCK_HORIZON_DAYS; i++) {
      const checkDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + i
      );
      const dateKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      const temMarcacaoReal =
      profissionalIdFiltro === 'todos' ?
      marcacoesReaisPorData.has(dateKey) :
      marcacoesReaisPorProfissionalData.has(
        `${dateKey}_${profissionalIdFiltro}`
      );
      const statusExplicito = statusMap[dateKey];
      if (statusExplicito === 'fechado') {
        locked.push(dateKey);
        continue;
      }
      if (statusExplicito !== 'aberto' && !temMarcacaoReal) {
        locked.push(dateKey);
      }
    }
    return locked;
  }, [
  profissionalIdFiltro,
  diasStatusMap,
  marcacoesReaisPorProfissionalData,
  marcacoesReaisPorData]
  );
  // Aberturas manuais são a única exceção ao fechamento por ausência de
  // marcação. Registros legados já são filtrados no servidor; aqui exibimos apenas
  // a decisão manual que o usuário acabou de tomar.
  const openedDates = useMemo(() => {
    if (profissionalIdFiltro === 'todos') return [] as string[];
    const statusMap = diasStatusMap[profissionalIdFiltro] || {};
    return Object.entries(statusMap).
    filter(([, status]) => status === 'aberto').
    map(([dateKey]) => dateKey);
  }, [profissionalIdFiltro, diasStatusMap]);
  const extraDates: string[] = [];
  const datesWithAppointments = useMemo(() => {
    return Array.from(
      new Set(
        consultas.
        filter((consulta) => {
          if (!consultaEhMarcacaoReal(consulta)) return false;
          return (
            profissionalIdFiltro === 'todos' ||
            String(consulta.profissionalId) === String(profissionalIdFiltro));

        }).
        map((consulta) => normalizarChaveData(consulta.data)).
        filter((data): data is string => Boolean(data))
      )
    );
  }, [consultas, profissionalIdFiltro]);
  const handleNavigate = (
  page: string,
  date?: string,
  profissionalId?: string) =>
  {
    // Saindo do prontuário com algo não salvo: pergunta antes (o texto também
    // fica guardado como rascunho neste computador).
    if (currentPage === 'prontuario_atendimento' && page !== 'prontuario_atendimento' && !confirmarSaida()) {
      return;
    }
    setCurrentPage(page);
    setSidebarOpen(false); // ⭐ Fecha sidebar no mobile ao navegar
    // ⭐ Se uma data foi passada (ex: vindo da aba Consultas do paciente), posiciona na data
    if (date && page === 'agenda') {
      const [year, month, day] = date.split('-').map(Number);
      if (year && month && day) {
        const targetDate = new Date(year, month - 1, day);
        setSelectedDate(targetDate);
        // ⭐ FIX: Usa expandRangeForDate que verifica automaticamente se precisa expandir
        expandRangeForDate(targetDate);
      }
    }
    // ⭐ FIX: Se um profissionalId foi passado (ex: vindo da consulta do paciente), seleciona o profissional
    if (profissionalId && page === 'agenda') {
      setProfissionalIdFiltro(profissionalId);
    } else if (
    page === 'agenda' &&
    sessao && (
    sessao.usuario.tipo === 'medico' || sessao.usuario.tipo === 'dentista'))
    {
      setProfissionalIdFiltro(sessao.usuario.id);
    } else if (page !== 'agenda' && page !== 'agenda_profissional') {
      setProfissionalIdFiltro('todos');
    }
  };
  navegarDemoRef.current = (pagina: string) => handleNavigate(pagina);
  // ⭐ Função para iniciar atendimento (a consulta É o atendimento)
  const handleIniciarAtendimento = (
  pacienteId: string,
  consultaId?: string,
  stepInicial?: string) =>
  {
    // ⭐ FIX vazamento de permissão: bloqueia se o usuário não tem 'prontuarios'.
    // Esta é a última barreira — protege qualquer caller (PacientesPage, AgendaPage,
    // ConsultaCard, FilaAtendimentoPage) caso o botão tenha escapado da checagem visual.
    if (!temPermissaoMenu('prontuarios')) {
      error(
        'Acesso negado',
        'Você não tem permissão para acessar o prontuário. Solicite ao administrador.'
      );
      return;
    }
    setAtendimentoPacienteId(pacienteId);
    setAtendimentoConsultaId(consultaId);
    // Busca a consulta completa para passar os dados
    if (consultaId) {
      const consultaEncontrada = consultas.find((c) => c.id === consultaId);
      if (consultaEncontrada) {
        setAtendimentoConsulta(consultaEncontrada);
      } else {
        // ⭐ Consulta não está no array local (fora do range de datas)
        // Busca direto da API para garantir que profissionalId chegue
        setAtendimentoConsulta(undefined);
        if (clinicaId) {
          fetch(
            `${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&pacienteId=${pacienteId}&limit=50`
          ).
          then((res) => res.ok ? res.json() : []).
          then((todasConsultas: Consulta[]) => {
            const found = todasConsultas.find((c) => c.id === consultaId);
            if (found) {
              console.log(
                '✅ [App] Consulta encontrada via API:',
                found.id,
                '| profissionalId:',
                found.profissionalId || '(vazio)'
              );
              setAtendimentoConsulta(found);
            }
          }).
          catch(() => {});
        }
      }
    } else {
      // ⭐ Sem consultaId (ex: PacientesPage) — NÃO carrega uma consulta antiga aleatória.
      // Apenas abre a visão geral do prontuário do paciente na aba "Resumo" (Histórico).
      setAtendimentoConsulta(undefined);
      if (!stepInicial) {
        stepInicial = 'resumo';
      }
    }
    setProntuarioStep(stepInicial as ProntuarioStep || 'anamnese');
    setCurrentPage('prontuario_atendimento');
  };

  // ⭐ Mantém a consulta EM ATENDIMENTO sincronizada com a lista global.
  //
  // `atendimentoConsulta` era uma fotografia tirada no momento em que o
  // prontuário abria e nunca mais atualizada. Como `updateConsulta` mexe apenas
  // no array `consultas`, tudo que o prontuário decidia a partir dessa
  // fotografia continuava valendo o estado ANTIGO: trocar para presencial não
  // escondia o botão de consulta online, encerrar a sala não tinha efeito
  // visível e finalizar o atendimento não parava o cronômetro (que é derivado
  // desse mesmo objeto). Agora qualquer alteração persistida reflete na hora.
  useEffect(() => {
    if (!atendimentoConsultaId) return;
    const atual = consultas.find((c) => c.id === atendimentoConsultaId);
    if (!atual) return;
    setAtendimentoConsulta((anterior) =>
    anterior === atual ? anterior : atual
    );
  }, [consultas, atendimentoConsultaId]);
  const handleCadastrarUsuario = async (dados: {
    operadora: Omit<Operadora, 'id' | 'criadoEm'> | null;
    operadoraExistenteId: string | null;
    usuario: {
      nome: string;
      email: string;
      senha: string;
      tipo: any;
    };
  }) => {
    try {
      // Um único pedido público: o servidor cria a operadora (se for nova) e o
      // administrador, e recusa se a operadora já tiver usuários.
      const response = await fetch(`${API_BASE_URL}/api/auth/cadastro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operadora: dados.operadora,
          cnpj: dados.operadora?.cnpj || null,
          operadoraExistenteId: dados.operadoraExistenteId,
          usuario: {
            nome: dados.usuario.nome,
            email: dados.usuario.email,
            senha: dados.usuario.senha
          }
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao criar usuário');
      }
      success(
        'Cadastro Realizado!',
        'Sua conta foi criada com sucesso. Faça login para continuar.',
        6000
      );
    } catch (err: any) {
      dialogError(
        'Erro no Cadastro',
        err.message || 'Não foi possível criar o usuário. Tente novamente.'
      );
    }
  };
  if (!sessao) {
    return (
      <SweetAlertProvider>
        <LoginPage
          onLogin={login}
          onConfirmarCodigo={confirmarCodigo}
          onReenviarCodigo={reenviarCodigo}
          onCadastrarUsuario={handleCadastrarUsuario}
          onBuscarOperadora={getOperadoraByCnpj}
          existemUsuarios={usuarios.length > 0} />
        

        <ToastContainer toasts={toasts} onClose={removeToast} />
        <DialogContainer dialogs={dialogs} onClose={removeDialog} />
      </SweetAlertProvider>);

  }
  const handleAddUsuario = async (
  usuario: Omit<Usuario, 'id' | 'criadoEm'>) =>
  {
    let clinicaIdParaEnviar = null;
    if (sessao.usuario.tipo === 'super_admin') {
      clinicaIdParaEnviar = usuario.clinicaId || null;
    } else {
      clinicaIdParaEnviar = sessao.clinicaAtual?.id || null;
    }
    const payload = {
      nome: usuario.nome,
      email: usuario.email,
      senha: usuario.senha,
      tipo: usuario.tipo,
      operadoraId:
      sessao.usuario.tipo === 'super_admin' ?
      operadoraId || usuario.operadoraId :
      sessao.usuario.operadoraId,
      clinicaId: clinicaIdParaEnviar,
      ativo: usuario.ativo !== undefined ? usuario.ativo : true,
      crm: usuario.crm || null,
      uf: usuario.uf || null,
      cpf: usuario.cpf || null,
      telefone: usuario.telefone || null,
      dataNascimento: usuario.dataNascimento || null,
      permissoesMenu: usuario.permissoesMenu || [],
      termoPesquisa: (usuario as any).termoPesquisa || null,
      operadoraPadraoId: (usuario as any).operadoraPadraoId || null,
      clinicaPadraoId: (usuario as any).clinicaPadraoId || null,
      // ⭐ Campos de relatório/impressão
      fotoUrl: (usuario as any).fotoUrl || null,
      titulo: (usuario as any).titulo || null,
      cabecalhoRelatorio: (usuario as any).cabecalhoRelatorio || null,
      rqes: (usuario as any).rqes || [],
      especialidades: (usuario as any).especialidades || [],
      // ⭐ Campos de endereço do profissional
      endereco: (usuario as any).endereco || null,
      numero: (usuario as any).numero || null,
      complemento: (usuario as any).complemento || null,
      bairro: (usuario as any).bairro || null,
      cidade: (usuario as any).cidade || null,
      cepUsuario: (usuario as any).cepUsuario || null,
      ufEndereco: (usuario as any).ufEndereco || null,
      // ⭐ Permissão de operações completas no prontuário
      prontuarioTotal: !!(usuario as any).prontuarioTotal,
      // ⭐ Verificação em duas etapas (código pelo WhatsApp)
      doisFatores: !!(usuario as any).doisFatores
    };
    const response = await fetch(`${API_BASE_URL}/api/usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // ⭐ Autor vai junto para a auditoria
      body: JSON.stringify({ ...payload, ...autorDaSessao() })
    });
    if (!response.ok) {
      const errorData = await response.json();
      const err = new Error(
        errorData.message || errorData.error || 'Erro ao criar usuário'
      );
      (err as any).code = errorData.code;
      throw err;
    }
    const newUsuario = await response.json();
    await refreshUsuarios();
    notificarMudanca('usuarios-changed');
    return newUsuario;
  };
  const handleUpdateUsuario = async (id: string, usuarioData: any) => {
    // ⭐ FIX: Busca dados originais do usuário para preservar campos que o form não gerencia
    const usuarioOriginal = usuarios.find((u) => u.id === id);
    const payload = {
      nome: usuarioData.nome,
      email: usuarioData.email,
      senha: usuarioData.senha,
      tipo: usuarioData.tipo,
      // ⭐ FIX: Preserva operadoraId original — o formulário NÃO tem campo operadoraId
      operadoraId:
      sessao?.usuario.tipo === 'super_admin' ?
      operadoraId || usuarioOriginal?.operadoraId :
      usuarioOriginal?.operadoraId || sessao?.usuario.operadoraId,
      // ⭐ FIX: Se o form enviou clinicaId válido usa ele, senão preserva o original
      clinicaId: usuarioData.clinicaId || usuarioOriginal?.clinicaId || null,
      ativo: usuarioData.ativo,
      crm: usuarioData.crm || null,
      uf: usuarioData.uf || null,
      cpf: usuarioData.cpf || null,
      telefone: usuarioData.telefone || null,
      dataNascimento: usuarioData.dataNascimento || null,
      permissoesMenu: Array.isArray(usuarioData.permissoesMenu) ?
      usuarioData.permissoesMenu :
      [],
      termoPesquisa: usuarioData.termoPesquisa || null,
      operadoraPadraoId: usuarioData.operadoraPadraoId || null,
      clinicaPadraoId: usuarioData.clinicaPadraoId || null,
      // ⭐ Campos de relatório/impressão
      fotoUrl: usuarioData.fotoUrl || null,
      titulo: usuarioData.titulo || null,
      cabecalhoRelatorio: usuarioData.cabecalhoRelatorio || null,
      rqes: usuarioData.rqes || [],
      especialidades: usuarioData.especialidades || [],
      // ⭐ Campos de endereço do profissional
      endereco: usuarioData.endereco || null,
      numero: usuarioData.numero || null,
      complemento: usuarioData.complemento || null,
      bairro: usuarioData.bairro || null,
      cidade: usuarioData.cidade || null,
      cepUsuario: usuarioData.cepUsuario || null,
      ufEndereco: usuarioData.ufEndereco || null,
      // ⭐ Permissão de operações completas no prontuário
      prontuarioTotal: !!usuarioData.prontuarioTotal,
      // ⭐ Verificação em duas etapas (código pelo WhatsApp)
      doisFatores: !!usuarioData.doisFatores
    };
    console.log('🔄 [App] handleUpdateUsuario - Payload seguro:', {
      id,
      nome: payload.nome,
      tipo: payload.tipo,
      operadoraId: payload.operadoraId,
      clinicaId: payload.clinicaId,
      operadoraIdOriginal: usuarioOriginal?.operadoraId,
      clinicaIdOriginal: usuarioOriginal?.clinicaId
    });
    const response = await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      // ⭐ Autor vai junto para a auditoria
      body: JSON.stringify({ ...payload, ...autorDaSessao() })
    });
    if (!response.ok) {
      const errorData = await response.json();
      const err = new Error(
        errorData.message || errorData.error || 'Erro ao atualizar usuário'
      );
      (err as any).code = errorData.code;
      throw err;
    }
    await refreshUsuarios();
    notificarMudanca('usuarios-changed');
  };
  const handleDeleteUsuario = async (id: string) => {
    const usuario = usuarios.find((u) => u.id === id);
    const shouldDelete = await confirm(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir ${usuario?.nome}? Esta ação não pode ser desfeita.`,
      'Excluir',
      'Cancelar'
    );
    if (shouldDelete) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/usuarios/${id}?${autorNaUrl()}`,
          {
            method: 'DELETE'
          }
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erro ao excluir usuário');
        }
        await refreshUsuarios();
        notificarMudanca('usuarios-changed');
        success('Usuário Excluído', `${usuario?.nome} foi removido do sistema`);
      } catch (err: any) {
        error(
          'Erro ao Excluir',
          err.message || 'Não foi possível excluir o usuário'
        );
      }
    }
  };
  const renderPage = () => {
    if (usuarioSemOperadora) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-lg w-full bg-red-50 border border-red-200 rounded-lg shadow-lg p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-red-900">
                  Configuração Incompleta
                </h2>
                <p className="text-sm text-red-700">
                  Seu usuário não está vinculado a uma operadora
                </p>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 mb-4">
              <p className="text-gray-700 mb-3">
                O usuário <strong>{sessao?.usuario.nome}</strong> (
                {sessao?.usuario.tipo}) não possui uma{' '}
                <strong>operadoraId</strong> configurada no cadastro.
              </p>
              <p className="text-gray-600 text-sm">
                Isso impede o acesso às clínicas e demais funcionalidades do
                sistema.
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-900 mb-2">
                🔧 Como resolver:
              </h3>
              <ol className="text-sm text-amber-800 space-y-2 list-decimal list-inside">
                <li>
                  Acesse o banco de dados{' '}
                  <code className="bg-amber-100 px-1 rounded">
                    data/principal.db
                  </code>
                </li>
                <li>
                  Na tabela{' '}
                  <code className="bg-amber-100 px-1 rounded">usuarios</code>,
                  encontre o usuário "{sessao?.usuario.email}"
                </li>
                <li>
                  Atualize o campo{' '}
                  <code className="bg-amber-100 px-1 rounded">operadoraId</code>{' '}
                  com o ID de uma operadora válida
                </li>
                <li>Faça logout e login novamente</li>
              </ol>
            </div>
            <button
              onClick={logout}
              className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
              
              Fazer Logout
            </button>
          </div>
        </div>);

    }
    if (precisaSelecionarOperadora && currentPage !== 'dashboard') {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Selecione uma Operadora
            </h2>
            <p className="text-gray-600 mb-6">
              Para acessar os dados, selecione uma operadora no menu superior.
            </p>
          </div>
        </div>);

    }
    if (precisaSelecionarClinica && currentPage !== 'dashboard') {
      const clinicasDaOperadora = clinicas.filter((c) =>
      sessao.usuario.tipo === 'super_admin' ?
      c.operadoraId === operadoraId :
      c.operadoraId === sessao.usuario.operadoraId
      );
      if (clinicasDaOperadora.length === 0) {
        return (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                🎉 Bem-vindo! Cadastre sua primeira clínica
              </h2>
              <p className="text-gray-600 mb-6">
                Para começar a usar o sistema, você precisa cadastrar pelo menos
                uma clínica.
              </p>
              <ClinicaForm
                onSave={(clinicaData) => {
                  addClinica({
                    ...clinicaData,
                    operadoraId:
                    operadoraId || sessao.usuario.operadoraId || ''
                  });
                  success(
                    'Clínica Cadastrada',
                    `${clinicaData.nome} foi adicionada`
                  );
                }}
                onCancel={() => {}}
                operadoraId={operadoraId || sessao.usuario.operadoraId} />
              
            </div>
          </div>);

      }
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Selecione uma Clínica
            </h2>
            <p className="text-gray-600 mb-6">
              Para acessar os dados, selecione uma clínica no menu superior.
            </p>
          </div>
        </div>);

    }
    if (!temPermissao(currentPage)) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Acesso Negado
            </h2>
            <p className="text-gray-600">
              Você não tem permissão para acessar esta página.
            </p>
          </div>
        </div>);

    }
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            consultas={consultas}
            totalPacientes={totalPacientes}
            clinicaId={clinicaId}
            onNavigate={handleNavigate} />);


      case 'agenda':
        return (
          <AgendaPage
            consultas={consultas}
            pacientes={[]}
            onAddConsulta={(c) =>
            addConsulta({
              ...c,
              clinicaId: clinicaId!
            })
            }
            onUpdateConsulta={updateConsulta}
            onUpdatePaciente={() => {}}
            usuarioLogado={{
              id: sessao.usuario.id,
              nome: sessao.usuario.nome,
              tipo: sessao.usuario.tipo
            }}
            clinicaId={clinicaId}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            profissionalIdFiltro={profissionalIdFiltro}
            usuarios={usuarios}
            onNavigate={handleNavigate}
            lockedDates={lockedDates}
            extraDates={extraDates} />);


      case 'fila_atendimento':
        return (
          <FilaAtendimentoPage
            consultas={consultas}
            onUpdateConsulta={updateConsulta}
            usuarioLogado={{
              id: sessao.usuario.id,
              nome: sessao.usuario.nome,
              tipo: sessao.usuario.tipo
            }}
            usuarios={usuariosDaOperadora}
            clinicaId={clinicaId}
            onNavigate={handleNavigate}
            onIniciarAtendimento={handleIniciarAtendimento} />);


      case 'agenda_profissional':
        return (
          <AgendaProfissionalPage
            clinicaId={clinicaId}
            usuarioLogado={{
              id: sessao.usuario.id,
              nome: sessao.usuario.nome,
              tipo: sessao.usuario.tipo
            }}
            usuarios={usuariosDaOperadora}
            profissionalIdSelecionado={profissionalIdFiltro} />);


      case 'pacientes':
        return (
          <PacientesPage
            onNavigate={handleNavigate}
            onIniciarAtendimento={handleIniciarAtendimento} />);


      case 'empresas_conveniadas':
        return <EmpresasConveniadasPage />;
      case 'convenios':
        return <ConveniosPage />;
      case 'planos_saude':
        return <PlanosSaudePage />;
      case 'cobrancas':
        return <CobrancasPage />;
      case 'assinatura':
        return <AssinaturaFinanceiroPage />;
      case 'mensagens':
        return <MensagensPage />;
      case 'prontuarios':
        return <ProntuariosPage pacientes={[]} onNavigate={handleNavigate} />;
      case 'prontuario_atendimento':
        return (
          <ProntuarioAtendimentoPage
            onNavigate={handleNavigate}
            activeStep={prontuarioStep}
            onStepChange={setProntuarioStep}
            pacienteId={atendimentoPacienteId}
            consultaId={atendimentoConsultaId}
            clinicaId={clinicaId}
            consulta={atendimentoConsulta}
            onUpdateConsulta={updateConsulta} />);


      case 'configuracoes':
        return <ConfiguracoesPage onNavigate={handleNavigate} />;
      case 'configuracoes_globais':
        return <ConfiguracoesGlobaisPage />;
      case 'whatsapp_meta':
        return <WhatsAppMetaPage />;
      case 'dossie':
        return <DossieConfigPage />;
      case 'assinatura_gestao':
        return <AssinaturaGestaoPage />;
      case 'backup':
        // Super admin: backup local desta clínica + backups no servidor.
        // Admin da clínica: backup gravado no computador dele.
        if (sessao?.usuario.tipo === 'super_admin') {
          return (
            <div className="space-y-8">
              <BackupLocalPage />
              <BackupPage />
            </div>);

        }
        return sessao?.usuario.tipo === 'admin' ? <BackupLocalPage /> : null;
      case 'video_demo':
        return sessao?.usuario.tipo === 'super_admin' ? <VideoDemoPage /> : null;
      case 'memed_profissionais':
        return (
          <MemedProfissionaisPage
            operadoraId={operadoraId || undefined}
            clinicaId={clinicaId || undefined} />);


      case 'medicamentos':
        return <MedicamentosPage />;
      case 'planos':
        return (
          <PlanosPage
            clinicas={clinicas}
            onUpdateClinica={updateClinica}
            clinicaAtualId={clinicaId}
            usuarioTipo={sessao.usuario.tipo} />);


      case 'procedimentos':
        return <ProcedimentosPage clinicaId={clinicaId} />;
      case 'importacao':
      // return <ImportacaoPage />
      case 'especialidades':
        return <EspecialidadesPage />;
      case 'cid10':
        return <Cid10Page />;
      case 'auditoria':
        return <AuditoriaPage />;
      case 'ponto':
        return <PontoPage />;
      case 'ponto_facial':
        return <PontoFacialPage />;
      case 'sessoes':
        return <SessoesAtivasPage />;
      case 'operadoras':
        return (
          <OperadorasPage
            operadoras={operadoras}
            onAddOperadora={async (data) => {
              try {
                await addOperadora(data);
                success(
                  'Operadora Cadastrada',
                  `${data.nome} foi adicionada ao sistema`
                );
              } catch (err: any) {
                error(
                  'Erro ao Cadastrar',
                  err.message || 'Não foi possível cadastrar a operadora'
                );
              }
            }}
            onUpdateOperadora={async (id, data) => {
              try {
                await updateOperadora(id, data);
                success('Operadora Atualizada', 'As alterações foram salvas');
              } catch (err: any) {
                error(
                  'Erro ao Atualizar',
                  err.message || 'Não foi possível atualizar a operadora'
                );
              }
            }}
            onDeleteOperadora={async (id) => {
              const operadora = operadoras.find((o) => o.id === id);
              const shouldDelete = await confirm(
                'Confirmar Exclusão',
                `Tem certeza que deseja excluir ${operadora?.nome}? Esta ação excluirá TODAS as clínicas, usuários, pacientes e consultas vinculadas. Esta ação não pode ser desfeita.`,
                'Excluir Tudo',
                'Cancelar'
              );
              if (shouldDelete) {
                try {
                  const response = await fetch(
                    `${API_BASE_URL}/api/operadoras/${id}`,
                    {
                      method: 'DELETE'
                    }
                  );
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(
                      errorData.error || 'Erro ao excluir operadora'
                    );
                  }
                  success(
                    'Operadora Excluída',
                    `${operadora?.nome} e todos os dados vinculados foram removidos`
                  );
                  setTimeout(() => window.location.reload(), 1000);
                } catch (err: any) {
                  error(
                    'Erro ao Excluir',
                    err.message || 'Não foi possível excluir a operadora'
                  );
                }
              }
            }} />);


      case 'clinicas':
        return (
          <ClinicasPage
            clinicas={clinicas}
            onAddClinica={(c) => {
              addClinica({
                ...c,
                operadoraId: operadoraId || ''
              });
              success('Clínica Cadastrada', `${c.nome} foi adicionada`);
            }}
            onUpdateClinica={(id, data) => {
              updateClinica(id, data);
              success('Clínica Atualizada', 'As alterações foram salvas');
            }}
            onDeleteClinica={async (id) => {
              const clinica = clinicas.find((c) => c.id === id);
              const shouldDelete = await confirm(
                'Confirmar Exclusão',
                `Tem certeza que deseja excluir a clínica "${clinica?.nome}"? Esta ação excluirá TODOS os dados da clínica (pacientes, consultas, prontuários, etc.) e não pode ser desfeita.`,
                'Excluir Tudo',
                'Cancelar'
              );
              if (shouldDelete) {
                try {
                  await deleteClinica(id);
                  success(
                    'Clínica Excluída',
                    `${clinica?.nome} e todos os dados vinculados foram removidos`
                  );
                } catch (err: any) {
                  error(
                    'Erro ao Excluir',
                    err.message || 'Não foi possível excluir a clínica'
                  );
                }
              }
            }}
            operadoraId={operadoraId || undefined} />);


      case 'usuarios':
        return (
          <UsuariosPage
            usuarios={usuariosDaOperadora}
            clinicas={clinicas}
            onAddUsuario={handleAddUsuario}
            onUpdateUsuario={handleUpdateUsuario}
            onDeleteUsuario={handleDeleteUsuario}
            isSuperAdmin={sessao.usuario.tipo === 'super_admin'}
            tipoUsuarioLogado={sessao.usuario.tipo}
            usuarioLogadoId={sessao.usuario.id}
            clinicaAtualId={sessao.clinicaAtual?.id}
            operadoraId={operadoraId} />);


      default:{
          // ⭐ FIX FLICKER: NÃO chamar setState durante a renderização (causava re-render
          // infinito = tela "piscando"). O redirecionamento por permissão é feito no
          // useEffect de montagem. Aqui apenas renderizamos o Dashboard.
          return (
            <Dashboard
              consultas={consultas}
              totalPacientes={totalPacientes}
              clinicaId={clinicaId}
              onNavigate={handleNavigate} />);


        }
    }
  };
  if (currentPage === 'ponto_facial') {
    return (
      <SweetAlertProvider>
        <PontoFacialPage />
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <DialogContainer dialogs={dialogs} onClose={removeDialog} />
      </SweetAlertProvider>);

  }
  return (
    <>
      <SweetAlertProvider>
        {/* ⭐ Banner de erro do servidor (520, 502, etc.) */}
        <ServerErrorBanner
          error={serverError}
          onRetry={handleRetryServer}
          isRetrying={isRetryingServer} />
        

        {/* Limite do plano: aviso único com caminho para trocar de plano e pagar */}
        <LimitePlanoAviso
          podeGerenciar={
          sessao.usuario.tipo === 'admin' ||
          sessao.usuario.tipo === 'super_admin'
          }
          onVerPlanos={() => handleNavigate('assinatura')} />
        

        {/* Backup diário no computador do administrador */}
        {(sessao.usuario.tipo === 'admin' ||
        sessao.usuario.tipo === 'super_admin') &&
        <BackupLocalAgendador
          clinicaId={sessao.clinicaAtual?.id}
          usuarioId={sessao.usuario.id} />

        }

        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
          <Header
            sessao={sessao}
            onLogout={logout}
            onTrocarSenha={trocarSenha}
            operadoras={operadoras}
            onSelecionarOperadora={selecionarOperadora}
            clinicas={clinicas}
            onSelecionarClinica={selecionarClinica}
            onNavigate={handleNavigate}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          

          <div className="relative flex flex-1 overflow-hidden">
            <Sidebar
              compacto={currentPage === 'prontuario_atendimento'}
              currentPage={currentPage}
              onNavigate={handleNavigate}
              tipoUsuario={sessao.usuario.tipo}
              permissoesMenu={sessao.usuario.permissoesMenu}
              showCalendar={showCalendarInSidebar}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              highlightedDates={datesWithAppointments}
              availableDates={availableDates}
              availableDatesProfessionals={availableDatesProfessionalsAbertos}
              allAgendaProfByDate={allAgendaProfByDate}
              lockedDates={lockedDates}
              extraDates={extraDates}
              openedDates={openedDates}
              onToggleDayLock={handleToggleDayLock}
              onOpenDayForProf={handleOpenDayForProf}
              profissionais={profissionais}
              profissionalIdSelecionado={profissionalIdFiltro}
              onProfissionalIdChange={setProfissionalIdFiltro}
              prontuarioStep={prontuarioStep}
              onProntuarioStepChange={setProntuarioStep}
              isMobileOpen={sidebarOpen}
              onCloseMobile={() => setSidebarOpen(false)} />
            

            <main
              className={`flex-1 overflow-hidden w-full ${currentPage === 'prontuario_atendimento' ? '' : 'p-4 lg:p-8'}`}>
              
              {currentPage === 'prontuario_atendimento' ?
              renderPage() :
              currentPage === 'pacientes' || currentPage === 'agenda' ?
              <div className="h-full">{renderPage()}</div> :

              <div className="h-full overflow-y-auto">{renderPage()}</div>
              }
            </main>
          </div>
        </div>

        <WhatsAppAutoActivator />
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <DialogContainer dialogs={dialogs} onClose={removeDialog} />
        {sessao.clinicaAtual?.id &&
        <AssistenteFlutuante
          clinicaId={sessao.clinicaAtual.id}
          usuarioId={sessao.usuario.id}
          telaAtual={currentPage}
          onNavigate={handleNavigate}
          onAbrirProntuario={(pacienteId) => handleIniciarAtendimento(pacienteId, undefined, 'resumo')} />

        }
      </SweetAlertProvider>
    </>);

}
// ⭐ ErrorBoundary para evitar página em branco em produção
class AppErrorBoundary extends Component<
  {
    children: React.ReactNode;
  },
  {
    hasError: boolean;
    error: Error | null;
  }>
{
  constructor(props: {children: React.ReactNode;}) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      error
    };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🔴 [AppErrorBoundary] Erro capturado:', error, errorInfo);
    // ⭐ Auto-recuperação: o erro "Failed to execute 'insertBefore' on 'Node'"
    // (e parentes — 'removeChild', 'NotFoundError: ...child of this node')
    // é quase sempre causado por extensão de tradução do navegador
    // (Google Translate, Edge) que reescreve nós de texto fora do controle do
    // React. O DOM fica corrompido sob a perspectiva do React e a única saída
    // confiável é recarregar a página. Fazemos isso UMA vez automaticamente,
    // usando sessionStorage como guarda anti-loop.
    const msg = (error?.message || '').toLowerCase();
    const isReconcileError =
    msg.includes('insertbefore') ||
    msg.includes('removechild') ||
    msg.includes('child of this node') ||
    msg.includes('não é filho deste nó');
    if (isReconcileError) {
      console.warn(
        '⚠️ [AppErrorBoundary] Erro de reconciliação detectado — recarregamento automático desativado para não descartar dados não salvos.'
      );
    }
  }
  // Recupera a tela SEM recarregar a página: o React remonta a árvore e a
  // sessão continua ativa, evitando o "app reiniciando" durante o uso.
  handleTentarNovamente = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };
  render() {
    if (this.state.hasError) {
      const msg = (this.state.error?.message || '').toLowerCase();
      const isReconcileError =
      msg.includes('insertbefore') ||
      msg.includes('removechild') ||
      msg.includes('child of this node') ||
      msg.includes('não é filho deste nó');
      return (
        <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-teal-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-2xl mb-4 shadow-lg">
                <span className="text-3xl">⚠️</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Erro ao carregar o sistema
              </h1>
              <p className="text-gray-600 mb-4">
                {isReconcileError ?
                'Nada foi recarregado automaticamente. Clique em "Tentar novamente" para voltar à tela sem perder a sessão. Se o problema persistir, desative extensões de tradução (Google Translate, tradução do Edge) para este site.' :
                'Ocorreu um erro inesperado. Tente voltar à tela antes de recarregar — recarregar descarta o que ainda não foi salvo.'}
              </p>
              {isReconcileError &&
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg mb-4 text-left">
                  <p className="font-semibold mb-1">💡 Causa mais comum</p>
                  <p>
                    Este erro costuma vir da{' '}
                    <strong>tradução automática do navegador</strong>. Clique no
                    ícone do Google Translate na barra de endereços e escolha
                    "Mostrar original" — ou clique com o botão direito na página
                    e desmarque "Traduzir".
                  </p>
                </div>
              }
              {this.state.error &&
              <p className="text-xs text-red-500 bg-red-50 p-3 rounded-lg mb-4 font-mono break-all">
                  {this.state.error.message}
                </p>
              }
            </div>
            <div className="space-y-3">
              <button
                onClick={this.handleTentarNovamente}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-md">
                
                ↩️ Tentar novamente (sem recarregar)
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-xl transition-colors">
                
                🔄 Recarregar Página
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('sessao');
                  window.location.reload();
                }}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-xl transition-colors">
                
                🔑 Limpar Sessão e Recarregar
              </button>
            </div>
          </div>
        </div>);

    }
    return this.props.children;
  }
}
// Componente raiz com roteamento + health check do banco de dados
export function App() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'ok' | 'error'>(
    'checking'
  );
  const [dbError, setDbError] = useState<string>('');
  const [dbUrl, setDbUrl] = useState<string>(API_BASE_URL);
  const [isRetrying, setIsRetrying] = useState(false);
  // ⭐ Health check na inicialização
  useEffect(() => {
    let cancelled = false;
    const doCheck = async () => {
      const result = await checkApiHealth();
      if (cancelled) return;
      if (result.ok) {
        setDbStatus('ok');
        setDbError('');
      } else {
        setDbStatus('error');
        setDbError(result.error || 'Erro desconhecido');
        setDbUrl(result.url);
      }
    };
    doCheck();
    return () => {
      cancelled = true;
    };
  }, []);
  const handleRetry = async () => {
    setIsRetrying(true);
    const result = await checkApiHealth();
    if (result.ok) {
      setDbStatus('ok');
      setDbError('');
    } else {
      setDbError(result.error || 'Erro desconhecido');
      setDbUrl(result.url);
    }
    setIsRetrying(false);
  };
  // ⭐ Mostra tela de loading enquanto verifica
  if (dbStatus === 'checking') {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">
            Verificando conexão com o servidor...
          </p>
          <p className="text-gray-600 text-xs mt-2">{API_BASE_URL}</p>
        </div>
      </div>);

  }
  // ⭐ Mostra tela de erro se o banco não está disponível
  if (dbStatus === 'error') {
    return (
      <DatabaseUnavailable
        error={dbError}
        apiUrl={dbUrl}
        onRetry={handleRetry}
        isRetrying={isRetrying} />);


  }
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/assinar/:token" element={<AssinaturaPublicaPage />} />
          <Route
            path="/confirmar/:token"
            element={<ConsultaConfirmacaoPublicaPage />} />
          
          {/* Sala de vídeo do paciente (LiveKit) — link enviado por WhatsApp/SMS */}
          <Route
            path="/consulta-online/:clinicaId/:consultaId"
            element={<ConsultaOnlinePublicaPage />} />
          
          {/* Botão "Falar conosco" dos templates da Meta → WhatsApp da clínica */}
          <Route path="/falar/:clinicaId" element={<FalarConoscoPublicaPage />} />
          {/* Documentos legais PÚBLICOS — exigidos pela Meta para publicar o app */}
          <Route
            path="/politica-de-privacidade"
            element={<DocumentoLegalPublicaPage documento="privacidade" />} />
          
          <Route
            path="/termos-de-servico"
            element={<DocumentoLegalPublicaPage documento="termos" />} />
          
          <Route
            path="/exclusao-de-dados"
            element={<DocumentoLegalPublicaPage documento="exclusao" />} />
          
          <Route path="/*" element={<MainApp />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>);

}