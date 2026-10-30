import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  Component } from
'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { WhatsAppSessionManager } from '../components/WhatsAppSessionManager';
import { BancoConfigForm } from '../components/BancoConfigForm';
import { MigrationButton } from '../components/MigrationButton';
import { MigrationButtonCrmUf } from '../components/MigrationButtonCrmUf';
import { MigrationButtonEmpresaConveniada } from '../components/MigrationButtonEmpresaConveniada';
import { MigrationButtonProfissionalId } from '../components/MigrationButtonProfissionalId';
import { ExamesGratuitosManager } from '../components/ExamesGratuitosManager';
import { SmsConfig } from '../components/SmsConfig';
import { WhatsAppMetaConfig } from '../components/WhatsAppMetaConfig';
import { useToast } from '../hooks/useToast';
import { useWhatsAppConfig } from '../hooks/useWhatsAppConfig';
import { useSmsConfig, ConfigSms } from '../hooks/useSmsConfig';
import {
  useWhatsAppMetaConfig,
  ConfigWhatsAppMeta } from
'../hooks/useWhatsAppMetaConfig';
import { API_BASE_URL, WAHA_API_KEY, WAHA_SERVER_URL } from '../config/api';
import {
  MessageSquareIcon,
  SettingsIcon,
  DatabaseIcon,
  SaveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  HelpCircleIcon,
  LandmarkIcon,
  ClipboardIcon,
  ClipboardListIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PrinterIcon,
  DownloadIcon,
  Loader2Icon,
  FingerprintIcon,
  SmartphoneIcon,
  BadgeCheckIcon } from
'lucide-react';
import { useConfiguracoesGlobais } from '../hooks/useConfiguracoesGlobais';
import { AssistenteAtivacaoCard } from '../components/assistente/AssistenteAtivacaoCard';

function usuarioIdSessao(): string {
  try {
    return String(JSON.parse(localStorage.getItem('sessao') || '{}')?.usuario?.id || '');
  } catch {
    return '';
  }
}

interface ConfiguracoesPageProps {
  /** Permite abrir telas próprias (ex.: WhatsApp oficial) a partir daqui. */
  onNavigate?: (page: string) => void;
}

export function ConfiguracoesPage({ onNavigate }: ConfiguracoesPageProps = {}) {
  const { success, error: showError } = useToast();
  // Detecta tipo de usuário E CLÍNICA
  // ⭐ Inicializa clinicaId SINCRONAMENTE do localStorage (necessário para hooks com chave per-clinic)
  const [usuarioTipo, setUsuarioTipo] = useState<string>(() => {
    try {
      const s = localStorage.getItem('sessao');
      return s ? JSON.parse(s).usuario?.tipo || '' : '';
    } catch {
      return '';
    }
  });
  const [clinicaId, setClinicaId] = useState<string>(() => {
    try {
      const s = localStorage.getItem('sessao');
      return s ? JSON.parse(s).clinicaAtual?.id || '' : '';
    } catch {
      return '';
    }
  });
  const [clinicaNome, setClinicaNome] = useState<string>(() => {
    try {
      const s = localStorage.getItem('sessao');
      return s ? JSON.parse(s).clinicaAtual?.nome || '' : '';
    } catch {
      return '';
    }
  });
  // Lista de usuários para migração
  const [usuarios, setUsuarios] = useState<
    Array<{
      id: string;
      nome: string;
      tipo: string;
    }>>(
    []);
  // Estados locais para os campos editáveis
  const [localServerUrl, setLocalServerUrl] = useState<string>(WAHA_SERVER_URL);
  const [localSessionName, setLocalSessionName] = useState<string>('');
  // ⭐ API Key: prioridade env (.env.local) → banco de dados (preserva valor existente)
  // Se WAHA_API_KEY do env estiver vazia, NÃO sobrescreve o banco com vazio
  const localApiKey = WAHA_API_KEY;
  // Estados para configurações de mensagem
  const [horasAntecedencia, setHorasAntecedencia] = useState(24);
  const [mensagemTemplate, setMensagemTemplate] = useState(
    'Olá {nome}! 👋\n\nLembramos que você tem uma consulta agendada:\n\n📅 Data: {data}\n🕐 Horário: {horario}\n👨‍⚕️ Profissional: {profissional}\n🩺 Especialidade: {especialidade}\n\nPor favor, confirme sua presença respondendo esta mensagem.'
  );
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(true);
  // Endpoint público verificado que recebe as mensagens do WAHA.
  const [webhookAtivo, setWebhookAtivo] = useState(true);
  // ⭐ Ativação do canal WhatsApp. Antes era enviada sempre como `true`, sem
  // controle na tela — por isso não havia como desligar (nem parar a cobrança).
  const [whatsappAtivo, setWhatsappAtivo] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState(
    `${API_BASE_URL}/api/webhook/whatsapp`
  );
  // ⭐ NOVO: Estado para template do menu de ajuda
  const [menuAjudaTemplate, setMenuAjudaTemplate] = useState(`👋 Olá, *{nome}*!

Como posso ajudar?

1️⃣ Minhas consultas
2️⃣ Horário de funcionamento
3️⃣ 📍 Endereço / Como chegar
4️⃣ 💰 Emissão da 2ª via de boleto
5️⃣ 📷 Trocar foto de perfil
6️⃣ 📄 Enviar documento
7️⃣ ✅ Cheguei na clínica
0️⃣ Sair

_Digite o número da opção desejada._`);
  // ⭐⭐⭐ FIX v21.5: Toggle principal para ativar/desativar menu de ajuda ⭐⭐⭐
  const [menuAjudaAtivo, setMenuAjudaAtivo] = useState(true);
  // ⭐ NOVO: Situações em que o menu de ajuda é enviado
  const [menuAjudaSituacoes, setMenuAjudaSituacoes] = useState({
    saudacao: true,
    ajuda: true,
    aposConfirmacao: false,
    aposAssinatura: true,
    primeiroContato: false,
    manual: true // Via botão "Enviar Menu de Ajuda"
  });
  // ⭐ Flag para evitar sobrescrita no carregamento inicial
  const [configCarregada, setConfigCarregada] = useState(false);
  // ⭐ Ref para controlar se estamos no sync inicial (evita auto-save prematuro)
  const isInitialSyncRef = useRef(true);
  // ⭐ Flag para rastrear se é a carga inicial (evita sobrescrever digitação)
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  // ⭐ Ref para pular sincronização quando o save do usuário atualiza configAPI
  const skipSyncRef = useRef(false);
  // Estados para seções colapsáveis
  // ⭐ Todas as seções iniciam recolhidas: a tela abre como um índice de
  // opções e o usuário expande apenas aquela que quer mexer.
  const [sectionsExpanded, setSectionsExpanded] = useState({
    whatsapp: false,
    whatsappMeta: false,
    sms: false,
    mensagens: false,
    menuAjuda: false,
    bancos: false,
    examesGratuitos: false,
    printserver: false,
    biometria: false,
    migracoes: false,
    avaliacao: false,
    aniversario: false,
    procedimentos: false
  });
  useEffect(() => {
    const syncFromLocalStorage = () => {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        setUsuarioTipo(parsed.usuario?.tipo || '');
        setClinicaId(parsed.clinicaAtual?.id || '');
        setClinicaNome(parsed.clinicaAtual?.nome || '');
      }
    };
    syncFromLocalStorage();
    // ⭐ FIX: Escuta mudanças de clínica/operadora feitas no Header
    const handleClinicaChanged = () => {
      console.log('🔄 [ConfiguracoesPage] Clínica mudou, re-sincronizando...');
      // Pequeno delay para garantir que o localStorage já foi atualizado
      setTimeout(syncFromLocalStorage, 100);
      // ⭐ Reseta initialLoadDone para que a nova config seja carregada do banco
      setInitialLoadDone(false);
    };
    const handleOperadoraChanged = () => {
      console.log('🔄 [ConfiguracoesPage] Operadora mudou, re-sincronizando...');
      setTimeout(syncFromLocalStorage, 100);
      setInitialLoadDone(false);
    };
    const handleSessaoUpdated = () => {
      console.log(
        '🔄 [ConfiguracoesPage] Sessão atualizada, re-sincronizando...'
      );
      setTimeout(syncFromLocalStorage, 100);
    };
    window.addEventListener('clinica-changed', handleClinicaChanged);
    window.addEventListener('operadora-changed', handleOperadoraChanged);
    window.addEventListener('sessao-updated', handleSessaoUpdated);
    return () => {
      window.removeEventListener('clinica-changed', handleClinicaChanged);
      window.removeEventListener('operadora-changed', handleOperadoraChanged);
      window.removeEventListener('sessao-updated', handleSessaoUpdated);
    };
  }, []);
  // Carrega lista de usuários para migração
  useEffect(() => {
    const carregarUsuarios = async () => {
      if (!clinicaId) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const data = await response.json();
          setUsuarios(data);
        }
      } catch (err) {
        console.error('Erro ao carregar usuários:', err);
      }
    };
    carregarUsuarios();
  }, [clinicaId]);
  const podeConfigurar = !['atendente'].includes(usuarioTipo);
  const isSuperAdmin = usuarioTipo === 'super_admin';
  const isAdmin = ['super_admin', 'admin'].includes(usuarioTipo);
  // ⭐ Configuração da aba Procedimento no Prontuário
  const procedimentoConfig = useConfiguracoesGlobais<{
    habilitado: boolean;
    restrito: boolean;
  }>(
    clinicaId ? `procedimento_config_${clinicaId}` : 'procedimento_config_NONE',
    {
      habilitado: false,
      restrito: false
    }
  );
  const [salvandoProcedimento, setSalvandoProcedimento] = useState(false);
  // ⭐ Configuração da aba Avaliação no Prontuário
  const avaliacaoConfig = useConfiguracoesGlobais<{
    habilitado: boolean;
  }>(clinicaId ? `avaliacao_config_${clinicaId}` : 'avaliacao_config_NONE', {
    habilitado: false
  });
  const [salvandoAvaliacao, setSalvandoAvaliacao] = useState(false);
  // ⭐ Configuração de Felicitação de Aniversário
  const aniversarioConfig = useConfiguracoesGlobais<{
    habilitado: boolean;
    mensagemCustom?: string;
  }>(
    clinicaId ? `aniversario_config_${clinicaId}` : 'aniversario_config_NONE',
    {
      habilitado: true
    }
  );
  const [salvandoAniversario, setSalvandoAniversario] = useState(false);
  const handleToggleAniversario = async () => {
    // ⭐ Sem clínica na sessão, a chave viraria `aniversario_config_NONE`: a tela
    // mostraria "desativado" e o envio continuaria ligado. Recusa explícita.
    if (!clinicaId) {
      showError(
        'Clínica não identificada',
        'Selecione a clínica antes de alterar a felicitação de aniversário.'
      );
      return;
    }
    setSalvandoAniversario(true);
    try {
      const novoValor = !aniversarioConfig.valor.habilitado;
      await aniversarioConfig.salvar({
        ...aniversarioConfig.valor,
        habilitado: novoValor
      });
      success(
        'Configuração Atualizada',
        novoValor ?
        'Felicitações de aniversário automáticas ativadas.' :
        'Felicitações de aniversário automáticas desativadas.'
      );
    } catch (err: any) {
      console.error('❌ Erro ao salvar configuração de aniversário:', err);
      showError('Erro', 'Não foi possível salvar a configuração.');
    } finally {
      setSalvandoAniversario(false);
    }
  };
  const handleToggleAvaliacao = async () => {
    setSalvandoAvaliacao(true);
    try {
      const novoValor = !avaliacaoConfig.valor.habilitado;
      await avaliacaoConfig.salvar({
        habilitado: novoValor
      });
      success(
        'Configuração Atualizada',
        novoValor ?
        'A aba Avaliação agora está visível no prontuário.' :
        'A aba Avaliação foi ocultada do prontuário.'
      );
    } catch (err: any) {
      console.error('❌ Erro ao salvar configuração de avaliação:', err);
      showError('Erro', 'Não foi possível salvar a configuração.');
    } finally {
      setSalvandoAvaliacao(false);
    }
  };
  const handleToggleProcedimento = async (campo: 'habilitado' | 'restrito') => {
    setSalvandoProcedimento(true);
    try {
      const novoValor = !procedimentoConfig.valor[campo];
      await procedimentoConfig.salvar({
        ...procedimentoConfig.valor,
        [campo]: novoValor
      });
      success(
        'Configuração Atualizada',
        campo === 'habilitado' ?
        novoValor ?
        'A aba Procedimento agora está visível no prontuário.' :
        'A aba Procedimento foi ocultada do prontuário.' :
        novoValor ?
        'Apenas médicos e dentistas podem alterar procedimentos.' :
        'Qualquer usuário pode alterar procedimentos.'
      );
    } catch (err: any) {
      console.error('❌ Erro ao salvar configuração de procedimento:', err);
      showError('Erro', 'Não foi possível salvar a configuração.');
    } finally {
      setSalvandoProcedimento(false);
    }
  };
  // Hook para gerenciar config do WhatsApp via API
  const {
    config: configAPI,
    loading,
    salvar: salvarAPI,
    recarregar
  } = useWhatsAppConfig(clinicaId);
  // ⭐ Configuração de SMS (SMSGo) — canal alternativo ao WhatsApp
  const {
    config: smsConfig,
    loading: smsLoading,
    salvar: salvarSms,
    enviarTeste: enviarTesteSms,
    consultarSaldo: consultarSaldoSms
  } = useSmsConfig(clinicaId);
  const handleSalvarSms = async (novaConfig: ConfigSms) => {
    await salvarSms(novaConfig);
    success(
      'Configuração salva',
      novaConfig.ativo ?
      'O envio por SMS está habilitado para esta clínica.' :
      'Credenciais salvas. O envio por SMS permanece desativado.'
    );
  };
  // ⭐ WhatsApp OFICIAL da Meta (Cloud API) — terceiro canal, independente do WAHA
  const {
    config: metaConfig,
    loading: metaLoading,
    salvar: salvarMeta,
    listarTemplates: listarTemplatesMeta,
    enviarTeste: enviarTesteMeta,
    carregarWebhookInfo: carregarWebhookInfoMeta,
    carregarSignupConfig: carregarSignupConfigMeta,
    concluirSignup: concluirSignupMeta
  } = useWhatsAppMetaConfig(clinicaId);
  const handleSalvarMeta = async (novaConfig: ConfigWhatsAppMeta) => {
    await salvarMeta(novaConfig);
    success(
      'Configuração salva',
      novaConfig.ativo ?
      'O envio pelo WhatsApp oficial da Meta está habilitado.' :
      'Credenciais salvas. O canal da Meta permanece desativado.'
    );
  };
  // Gera nome de sessão sugestivo com nome da clínica
  const gerarNomeSessaoSugestivo = (
  clinicaNome: string,
  clinicaId: string)
  : string => {
    const nomeNormalizado = clinicaNome.
    normalize('NFD').
    replace(/[\u0300-\u036f]/g, '').
    toLowerCase().
    replace(/[^a-z0-9]/g, '_').
    replace(/_+/g, '_').
    substring(0, 20);
    return `${nomeNormalizado}_${clinicaId.substring(0, 8)}`;
  };
  // Sincroniza estados locais quando configAPI muda
  useEffect(() => {
    if (configAPI) {
      // ⭐⭐⭐ FIX: Se o save do usuário causou essa mudança, NÃO sobrescrever os campos locais
      // Isso evita o ciclo: digita → salva → configAPI muda → sobrescreve campo → perde digitação
      if (skipSyncRef.current) {
        skipSyncRef.current = false;
        return;
      }
      // ⭐⭐⭐ FIX: Só sincroniza na PRIMEIRA carga. Depois, os campos locais são a fonte de verdade.
      if (initialLoadDone) {
        return;
      }
      setLocalServerUrl(configAPI.serverUrl || WAHA_SERVER_URL);
      setLocalSessionName(configAPI.sessionName || '');
      setHorasAntecedencia(configAPI.horasAntecedencia || 24);
      setMensagemTemplate(
        configAPI.mensagemTemplate ||
        'Olá {nome}! 👋\n\nLembramos que você tem uma consulta agendada:\n\n📅 Data: {data}\n🕐 Horário: {horario}\n👨‍⚕️ Profissional: {profissional}\n🩺 Especialidade: {especialidade}\n\nPor favor, confirme sua presença respondendo esta mensagem.'
      );
      setEnviarConfirmacao(configAPI.enviarConfirmacao !== false);
      const ativoSalvo = (configAPI as any).ativo;
      setWhatsappAtivo(
        ativoSalvo !== 0 && ativoSalvo !== false && ativoSalvo !== '0'
      );
      const webhookAtivoSalvo = (configAPI as any).webhookAtivo;
      setWebhookAtivo(
        webhookAtivoSalvo !== 0 &&
        webhookAtivoSalvo !== false &&
        webhookAtivoSalvo !== '0'
      );
      setWebhookUrl(
        (configAPI as any).webhookUrl || `${API_BASE_URL}/api/webhook/whatsapp`
      );
      // ⭐⭐⭐ FIX v21.5: Carrega menuAjudaAtivo do banco
      const menuAtivoSalvo = (configAPI as any).menuAjudaAtivo;
      setMenuAjudaAtivo(
        menuAtivoSalvo !== 0 &&
        menuAtivoSalvo !== false &&
        menuAtivoSalvo !== '0'
      );
      setMenuAjudaTemplate(
        (configAPI as any).menuAjudaTemplate ||
        `👋 Olá, *{nome}*!\n\nComo posso ajudar?\n\n1️⃣ Minhas consultas\n2️⃣ Horário de funcionamento\n3️⃣ 📍 Endereço / Como chegar\n4️⃣ 💰 Emissão da 2ª via de boleto\n5️⃣ 📷 Trocar foto de perfil\n6️⃣ Enviar documento\n7️⃣ ✅ Cheguei na clínica\n0️⃣ Sair\n\n_Digite o número da opção desejada._`
      );
      const situacoesSalvas = (configAPI as any).menuAjudaSituacoes;
      if (situacoesSalvas) {
        try {
          const parsed =
          typeof situacoesSalvas === 'string' ?
          JSON.parse(situacoesSalvas) :
          situacoesSalvas;
          setMenuAjudaSituacoes((prev) => ({
            ...prev,
            ...parsed
          }));
        } catch (e) {
          console.error('Erro ao parsear situações do menu:', e);
        }
      }
      // ⭐ Marca config como carregada e initial load como concluído
      isInitialSyncRef.current = true;
      setTimeout(() => {
        isInitialSyncRef.current = false;
        setConfigCarregada(true);
        setInitialLoadDone(true);
      }, 1500);
    } else if (clinicaId && clinicaNome && !initialLoadDone) {
      // ⭐ Config não existe ainda - mostra defaults mas NÃO marca como carregada
      setLocalServerUrl('');
      setLocalSessionName(gerarNomeSessaoSugestivo(clinicaNome, clinicaId));
    }
  }, [configAPI, clinicaId, clinicaNome, initialLoadDone]);
  // MIGRAÇÃO AUTOMÁTICA
  useEffect(() => {
    if (!clinicaId || !clinicaNome || loading) return;
    if (!configAPI) {
      const configKey = `whatsapp_config_${clinicaId}`;
      const stored = localStorage.getItem(configKey);
      if (stored) {
        const oldConfig = JSON.parse(stored);
        salvarAPI(oldConfig).
        then(() => recarregar()).
        catch((err) => console.error('Erro ao migrar config:', err));
      }
    }
  }, [clinicaId, clinicaNome, configAPI, loading, salvarAPI, recarregar]);
  // Debounced save functions
  // Mantém refs atualizados
  const localServerUrlRef = useRef(localServerUrl);
  const localSessionNameRef = useRef(localSessionName);
  const localApiKeyRef = {
    current: localApiKey
  }; // ⭐ Não precisa mais de ref — valor fixo da env
  const horasAntecedenciaRef = useRef(horasAntecedencia);
  const mensagemTemplateRef = useRef(mensagemTemplate);
  const enviarConfirmacaoRef = useRef(enviarConfirmacao);
  const menuAjudaTemplateRef = useRef(menuAjudaTemplate);
  const menuAjudaSituacoesRef = useRef(menuAjudaSituacoes);
  // Mantém refs atualizados
  useEffect(() => {
    localServerUrlRef.current = localServerUrl;
  }, [localServerUrl]);
  useEffect(() => {
    localSessionNameRef.current = localSessionName;
  }, [localSessionName]);
  // localApiKey agora é constante (env var), não precisa de sync
  useEffect(() => {
    horasAntecedenciaRef.current = horasAntecedencia;
  }, [horasAntecedencia]);
  useEffect(() => {
    mensagemTemplateRef.current = mensagemTemplate;
  }, [mensagemTemplate]);
  useEffect(() => {
    enviarConfirmacaoRef.current = enviarConfirmacao;
  }, [enviarConfirmacao]);
  useEffect(() => {
    menuAjudaTemplateRef.current = menuAjudaTemplate;
  }, [menuAjudaTemplate]);
  useEffect(() => {
    menuAjudaSituacoesRef.current = menuAjudaSituacoes;
  }, [menuAjudaSituacoes]);
  // ⭐ Estado para controlar salvamento manual
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingWebhook, setIsApplyingWebhook] = useState(false);
  const [configuredSessionExists, setConfiguredSessionExists] = useState(false);
  // ⭐ FIX: Removido auto-save — agora usa botão manual "Salvar"
  const handleServerUrlChange = useCallback((url: string) => {
    setConfiguredSessionExists(false);
    setLocalServerUrl(url);
  }, []);
  const handleSessionNameChange = useCallback((name: string) => {
    setConfiguredSessionExists(false);
    setLocalSessionName(name);
  }, []);
  const savedServerUrl = configAPI?.serverUrl?.trim().replace(/\/+$/, '') || '';
  const savedSessionName = configAPI?.sessionName?.trim() || '';
  const hasUnsavedSessionChange =
  isSuperAdmin &&
  Boolean(savedSessionName) && (
  localSessionName.trim() !== savedSessionName ||
  localServerUrl.trim().replace(/\/+$/, '') !== savedServerUrl);
  const handleAtivarWebhookNoWaha = async () => {
    const urlNormalizada = webhookUrl.trim();
    if (!clinicaId || !localServerUrl.trim() || !localSessionName.trim()) {
      showError(
        'Conexão incompleta',
        'Configure o servidor WAHA e o nome da sessão antes de ativar o webhook.'
      );
      return;
    }
    if (hasUnsavedSessionChange) {
      showError(
        'Salve e verifique a sessão',
        'Salve o novo nome da sessão e verifique sua existência no WAHA antes de enviar o webhook.'
      );
      return;
    }
    if (!configuredSessionExists) {
      showError(
        'Sessão não encontrada',
        'O webhook só pode ser enviado para uma sessão já existente e verificada no WAHA. Nenhuma sessão será criada.'
      );
      return;
    }
    try {
      const parsedUrl = new URL(urlNormalizada);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('A URL deve usar HTTP ou HTTPS.');
      }
    } catch (err: any) {
      showError(
        'URL inválida',
        err.message || 'Informe uma URL HTTP(S) válida.'
      );
      return;
    }
    setIsApplyingWebhook(true);
    try {
      // Persiste a mesma configuração que será aplicada agora no WAHA.
      skipSyncRef.current = true;
      setWebhookAtivo(true);
      await salvarAPI({
        provider: 'session',
        serverUrl: localServerUrl,
        sessionName: localSessionName,
        apiKey: localApiKey,
        horasAntecedencia,
        mensagemTemplate,
        enviarConfirmacao,
        webhookAtivo: true,
        webhookUrl: urlNormalizada,
        menuAjudaTemplate,
        menuAjudaSituacoes: JSON.stringify(menuAjudaSituacoes),
        menuAjudaAtivo,
        ativo: true
      } as any);
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/configure-webhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl: localServerUrl,
            sessionName: localSessionName,
            webhookUrl: urlNormalizada
          })
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result.error ||
          `Não foi possível atualizar o WAHA (${response.status}).`
        );
      }
      await recarregar();
      success(
        result.updated === false ?
        'Webhook já estava ativo' :
        'Webhook ativado no WAHA',
        result.updated === false ?
        'O WAHA já estava usando esta URL e os eventos necessários.' :
        'A URL foi enviada e atualizada na sessão WAHA.'
      );
      window.dispatchEvent(new Event('whatsapp-config-updated'));
    } catch (err: any) {
      skipSyncRef.current = false;
      showError(
        'Não foi possível ativar o webhook',
        err.message || 'Tente novamente.'
      );
    } finally {
      setIsApplyingWebhook(false);
    }
  };
  // ⭐ Liga/desliga o canal WhatsApp e grava na hora. Desligado, nenhum aviso
  // sai por WhatsApp e o serviço deixa de ser cobrado na assinatura.
  const handleToggleWhatsappAtivo = async () => {
    if (!clinicaId) {
      showError('Erro', 'Selecione uma clínica primeiro');
      return;
    }
    const novoValor = !whatsappAtivo;
    setIsSaving(true);
    try {
      skipSyncRef.current = true;
      setWhatsappAtivo(novoValor);
      await salvarAPI({
        provider: 'session',
        serverUrl: localServerUrl,
        sessionName: localSessionName,
        apiKey: localApiKey,
        horasAntecedencia,
        mensagemTemplate,
        enviarConfirmacao,
        webhookAtivo,
        webhookUrl: webhookUrl.trim(),
        menuAjudaTemplate,
        menuAjudaSituacoes: JSON.stringify(menuAjudaSituacoes),
        menuAjudaAtivo,
        ativo: novoValor
      } as any);
      success(
        novoValor ? 'WhatsApp ativado' : 'WhatsApp desativado',
        novoValor ?
        'Os envios por WhatsApp estão liberados e o serviço passa a ser cobrado na assinatura.' :
        'Nenhuma mensagem sairá por WhatsApp e o serviço deixa de ser cobrado.'
      );
      window.dispatchEvent(new Event('whatsapp-config-updated'));
    } catch (err: any) {
      skipSyncRef.current = false;
      setWhatsappAtivo(!novoValor);
      showError('Erro ao salvar', err.message || 'Não foi possível salvar');
    } finally {
      setIsSaving(false);
    }
  };
  // ⭐ FIX: Salvar TODAS as configurações de uma vez (botão manual)
  const handleSalvarTudo = async () => {
    if (!clinicaId) {
      showError('Erro', 'Selecione uma clínica primeiro');
      return;
    }
    setIsSaving(true);
    try {
      skipSyncRef.current = true;
      await salvarAPI({
        provider: 'session',
        serverUrl: localServerUrl,
        sessionName: localSessionName,
        apiKey: localApiKey,
        horasAntecedencia,
        mensagemTemplate,
        enviarConfirmacao,
        webhookAtivo,
        webhookUrl: webhookUrl.trim(),
        menuAjudaTemplate,
        menuAjudaSituacoes: JSON.stringify(menuAjudaSituacoes),
        menuAjudaAtivo,
        ativo: whatsappAtivo
      } as any);
      await recarregar();
      success(
        'Configurações Salvas ✅',
        'Todas as configurações foram atualizadas com sucesso.'
      );
      window.dispatchEvent(new Event('whatsapp-config-updated'));
    } catch (err: any) {
      skipSyncRef.current = false;
      showError('Erro ao Salvar', err.message || 'Não foi possível salvar');
    } finally {
      setIsSaving(false);
    }
  };
  // Preview da mensagem
  const previewMensagem = mensagemTemplate.
  replace('{nome}', 'João Silva').
  replace('{data}', '15/01/2024').
  replace('{horario}', '14:30').
  replace('{profissional}', 'Dr. Maria Santos').
  replace('{especialidade}', 'Cardiologia').
  replace('{duracao}', '30').
  replace('{clinica}', clinicaNome || 'Clínica Exemplo').
  replace('{ref}', 'CON-A1B2C3D4');
  const toggleSection = (section: keyof typeof sectionsExpanded) => {
    setSectionsExpanded((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Configurações da Clínica
          </h1>
          <p className="text-gray-500 mt-1">Carregando...</p>
        </div>
        <Card>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        </Card>
      </div>);

  }
  return (
    <div className="space-y-6">
      {/* ⭐ Header com botão Salvar fixo no topo */}
      <div className="sticky top-0 z-20 bg-gray-50 -mx-6 px-6 py-4 border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Configurações da Clínica
            </h1>
            <p className="text-gray-500 mt-1">
              {clinicaNome ?
              `Configurações para ${clinicaNome}` :
              'Selecione uma clínica para configurar'}
            </p>
          </div>
          {clinicaId &&
          <Button
            onClick={handleSalvarTudo}
            disabled={isSaving}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 text-base font-semibold shadow-lg">
            
              <SaveIcon className="w-5 h-5" />
              {isSaving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          }
        </div>
      </div>

      {!clinicaId ?
      <Card>
          <div className="text-center py-12">
            <SettingsIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">
              ⚠️ Selecione uma clínica no menu superior para configurar
            </p>
          </div>
        </Card> :

      <>
          {/* SEÇÃO 1: CONEXÃO WHATSAPP — usuários da clínica podem recuperar a sessão */}
          {podeConfigurar &&
        <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl p-1">
              <div className="bg-white rounded-lg">
                <button
              onClick={() => toggleSection('whatsapp')}
              className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
              
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <MessageSquareIcon className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-xl font-semibold text-gray-900">
                        Conexão WhatsApp
                      </h2>
                      <p className="text-sm text-gray-500">
                        Configure o servidor e conecte sua sessão
                      </p>
                    </div>
                  </div>
                  {sectionsExpanded.whatsapp ?
              <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
              }
                </button>
                {sectionsExpanded.whatsapp &&
            <div className="p-6 space-y-5">
                    {/* Ativação do canal — governa o envio e a cobrança */}
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          Canal WhatsApp
                        </h3>
                        <p className="mt-1 text-xs text-gray-600">
                          {whatsappAtivo ?
                    'Ativo: lembretes e confirmações podem ser enviados por WhatsApp. O serviço é cobrado na assinatura.' :
                    'Desativado: nenhuma mensagem sai por WhatsApp e o serviço não é cobrado.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                    whatsappAtivo ?
                    'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-600'}`
                    }>
                    
                          {whatsappAtivo ? 'Ativo' : 'Desativado'}
                        </span>
                        <button
                    type="button"
                    onClick={handleToggleWhatsappAtivo}
                    disabled={isSaving}
                    role="switch"
                    aria-checked={whatsappAtivo}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    whatsappAtivo ?
                    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50' :
                    'bg-green-600 text-white hover:bg-green-700'}`
                    }>
                    
                          {whatsappAtivo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </section>
                    <section
                className="rounded-xl border border-teal-200 bg-teal-50 p-4"
                aria-labelledby="webhook-confirmacoes-title">
                
                      <div>
                        <h3
                    id="webhook-confirmacoes-title"
                    className="text-sm font-semibold text-teal-950">
                    
                          Webhook de confirmações
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-teal-800">
                          Recebe as respostas do paciente para confirmar ou
                          cancelar consultas. O envio é sempre explícito e só
                          fica disponível depois que a sessão configurada for
                          confirmada no WAHA.
                        </p>
                      </div>
                      <div className="mt-4">
                        <label
                    htmlFor="whatsapp-webhook-url"
                    className="mb-1.5 block text-xs font-medium text-teal-950">
                    
                          URL do webhook
                        </label>
                        <Input
                    id="whatsapp-webhook-url"
                    value={webhookUrl}
                    onChange={(event) =>
                    setWebhookUrl(event.target.value)
                    }
                    placeholder={`${API_BASE_URL}/api/webhook/whatsapp`}
                    className="bg-white text-sm font-mono" />
                  
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-teal-700">
                            {hasUnsavedSessionChange ?
                      'Salve e verifique o novo nome da sessão antes de enviar o webhook.' :
                      configuredSessionExists ?
                      'Use este botão para enviar a URL ao WAHA agora, sem precisar reconectar a sessão.' :
                      'O envio será liberado após confirmar que a sessão configurada existe no WAHA.'}
                          </p>
                          <Button
                      type="button"
                      onClick={handleAtivarWebhookNoWaha}
                      disabled={
                      isApplyingWebhook ||
                      !configuredSessionExists ||
                      hasUnsavedSessionChange ||
                      !webhookUrl.trim() ||
                      !localServerUrl.trim() ||
                      !localSessionName.trim()
                      }
                      className="shrink-0 bg-teal-700 text-white hover:bg-teal-800">
                      
                            {isApplyingWebhook ?
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> :

                      <MessageSquareIcon className="mr-2 h-4 w-4" />
                      }
                            {isApplyingWebhook ?
                      'Enviando ao WAHA...' :
                      'Ativar e enviar ao WAHA'}
                          </Button>
                        </div>
                      </div>
                    </section>
                    <WhatsAppSessionManager
                serverUrl={localServerUrl}
                sessionName={localSessionName}
                savedServerUrl={savedServerUrl}
                savedSessionName={savedSessionName}
                onServerUrlChange={handleServerUrlChange}
                onSessionNameChange={handleSessionNameChange}
                onSessionExistenceChange={setConfiguredSessionExists}
                isSuperAdmin={isSuperAdmin} />
              
                  </div>
            }
              </div>
            </div>
        }

          {/* SEÇÃO 1.4: WhatsApp OFICIAL da Meta (Cloud API) — canal opcional */}
          {podeConfigurar &&
        <Card>
              <button
            onClick={() => toggleSection('whatsappMeta')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <BadgeCheckIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      WhatsApp oficial (Meta)
                    </h2>
                    <p className="text-sm text-gray-500">
                      API oficial da Meta, com templates aprovados — alternativa
                      ao WhatsApp conectado por sessão
                    </p>
                  </div>
                </div>
                {sectionsExpanded.whatsappMeta ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.whatsappMeta &&
          <div className="p-6">
                  {/* A configuração da Meta tem tela própria: conexão pela
                 janela oficial, templates e recebimento em um só lugar.
                 Manter uma segunda cópia aqui faria as duas divergirem. */}
                  <p className="text-sm text-gray-600">
                    A conta oficial da Meta é configurada em uma tela dedicada,
                    com a conexão pela janela oficial do WhatsApp, os templates
                    aprovados e o recebimento das respostas.
                  </p>
                  {onNavigate ?
            <button
              type="button"
              onClick={() => onNavigate('whatsapp_meta')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
              
                      <BadgeCheckIcon className="h-4 w-4" />
                      Abrir WhatsApp oficial
                    </button> :

            <p className="mt-2 text-sm text-gray-500">
                      Acesse pelo menu <strong>Administração → WhatsApp
                      Oficial</strong>.
                    </p>
            }
                </div>
          }
            </Card>
        }

          {/* SEÇÃO 1.5: SMS (SMSGo) — canal alternativo ao WhatsApp */}
          {podeConfigurar &&
        <Card>
              <button
            onClick={() => toggleSection('sms')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <SmartphoneIcon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      SMS (SMSGo)
                    </h2>
                    <p className="text-sm text-gray-500">
                      Envio de avisos por SMS quando o WhatsApp não é uma opção
                    </p>
                  </div>
                </div>
                {sectionsExpanded.sms ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.sms &&
          <div className="p-6">
                  {smsLoading ?
            <p className="text-sm text-gray-500">
                      Carregando configuração de SMS...
                    </p> :

            <SmsConfig
              config={smsConfig}
              onSave={handleSalvarSms}
              onTestar={enviarTesteSms}
              onConsultarSaldo={consultarSaldoSms} />

            }
                </div>
          }
            </Card>
        }

          {/* SEÇÃO 2: CONFIGURAÇÕES DE MENSAGEM */}
          {podeConfigurar &&
        <Card>
              <button
            onClick={() => toggleSection('mensagens')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Configurações de Mensagem
                    </h2>
                    <p className="text-sm text-gray-500">
                      Personalize as mensagens de lembrete
                    </p>
                  </div>
                </div>
                {sectionsExpanded.mensagens ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.mensagens &&
          <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Horas de Antecedência
                      </label>
                      <Input
                  type="number"
                  value={horasAntecedencia}
                  onChange={(e) =>
                  setHorasAntecedencia(parseInt(e.target.value) || 24)
                  }
                  min={1}
                  max={72} />
                

                      <p className="text-xs text-gray-500 mt-1">
                        Quantas horas antes da consulta enviar o lembrete
                      </p>
                    </div>

                    <div className="flex items-center">
                      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg w-full">
                        <input
                    type="checkbox"
                    id="enviarConfirmacao"
                    checked={enviarConfirmacao}
                    onChange={(e) =>
                    setEnviarConfirmacao(e.target.checked)
                    }
                    className="w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
                  

                        <label
                    htmlFor="enviarConfirmacao"
                    className="text-sm text-gray-700">
                    
                          <span className="font-medium">
                            Solicitar confirmação
                          </span>
                          <br />
                          <span className="text-gray-500">
                            Pedir que o paciente confirme presença
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Mensagem de Lembrete / Confirmação
                      </label>
                      <textarea
                  value={mensagemTemplate}
                  onChange={(e) => setMensagemTemplate(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono text-sm"
                  placeholder="Olá {nome}, você tem uma consulta agendada..." />
                

                      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs font-medium text-gray-700 mb-1">
                          Variáveis disponíveis:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[
                    '{nome}',
                    '{data}',
                    '{horario}',
                    '{profissional}',
                    '{especialidade}',
                    '{duracao}',
                    '{clinica}',
                    '{ref}'].
                    map((v) =>
                    <code
                      key={v}
                      className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-teal-700">
                      
                              {v}
                            </code>
                    )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Preview da Mensagem
                      </label>
                      <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-lg p-4 border border-green-200 h-full">
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {previewMensagem}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                          ℹ️ Esta é uma prévia de como a mensagem será enviada
                          ao paciente
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-100">
                    <Button onClick={handleSalvarTudo} disabled={isSaving}>
                      <SaveIcon className="w-4 h-4 mr-2" />
                      {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                    </Button>
                  </div>
                </div>
          }
            </Card>
        }

          {/* ⭐ SEÇÃO 2.5: MENU DE AJUDA DO WHATSAPP */}
          {podeConfigurar &&
        <Card>
              <button
            onClick={() => toggleSection('menuAjuda')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3" />
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <HelpCircleIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Menu de Ajuda WhatsApp
                  </h2>
                  <p className="text-sm text-gray-500">
                    Personalize o menu que o paciente recebe ao enviar "Oi" ou
                    "Ajuda"
                  </p>
                </div>
                {sectionsExpanded.menuAjuda ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.menuAjuda &&
          <div className="p-6 space-y-6">
                  {/* ⭐⭐⭐ FIX v21.5: Toggle principal para ativar/desativar menu de ajuda ⭐⭐⭐ */}
                  <div
              className={`p-4 rounded-xl border-2 ${menuAjudaAtivo ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${menuAjudaAtivo ? 'bg-green-200' : 'bg-red-200'}`}>
                    
                          {menuAjudaAtivo ?
                    <span className="text-xl">✅</span> :

                    <span className="text-xl">🚫</span>
                    }
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">
                            Menu de Ajuda{' '}
                            {menuAjudaAtivo ? 'ATIVO' : 'DESATIVADO'}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {menuAjudaAtivo ?
                      'O bot responde automaticamente às mensagens dos pacientes' :
                      'O bot NÃO responde — canal livre para conversas manuais'}
                          </p>
                        </div>
                      </div>
                      <button
                  type="button"
                  onClick={() => setMenuAjudaAtivo(!menuAjudaAtivo)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${menuAjudaAtivo ? 'bg-green-500' : 'bg-red-400'}`}>
                  
                        <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${menuAjudaAtivo ? 'translate-x-8' : 'translate-x-1'}`} />
                  
                      </button>
                    </div>
                    {!menuAjudaAtivo &&
              <p className="mt-3 text-sm text-red-700 bg-red-100 p-2 rounded-lg">
                        ⚠️ Com o menu desativado, o bot não enviará nenhuma
                        resposta automática (menu, "não entendi", etc.). O canal
                        fica livre para conversas manuais. Lembretes de consulta
                        continuam funcionando normalmente.
                      </p>
              }
                  </div>

                  {/* ⭐ Situações em que o menu é enviado */}
                  <div
              className={
              !menuAjudaAtivo ? 'opacity-40 pointer-events-none' : ''
              }>
              
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      📋 Em quais situações o menu deve ser enviado ao paciente?
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                    type="checkbox"
                    checked={menuAjudaSituacoes.saudacao}
                    onChange={(e) =>
                    setMenuAjudaSituacoes((prev) => ({
                      ...prev,
                      saudacao: e.target.checked
                    }))
                    }
                    className="w-4 h-4 mt-0.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                  

                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            Saudação do paciente
                          </span>
                          <p className="text-xs text-gray-500">
                            Quando envia "Oi", "Olá", "Bom dia", "Boa tarde",
                            etc.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                    type="checkbox"
                    checked={menuAjudaSituacoes.ajuda}
                    onChange={(e) =>
                    setMenuAjudaSituacoes((prev) => ({
                      ...prev,
                      ajuda: e.target.checked
                    }))
                    }
                    className="w-4 h-4 mt-0.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                  

                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            Pedido de ajuda
                          </span>
                          <p className="text-xs text-gray-500">
                            Quando envia "Ajuda", "Menu" ou "Help"
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                    type="checkbox"
                    checked={menuAjudaSituacoes.aposConfirmacao}
                    onChange={(e) =>
                    setMenuAjudaSituacoes((prev) => ({
                      ...prev,
                      aposConfirmacao: e.target.checked
                    }))
                    }
                    className="w-4 h-4 mt-0.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                  

                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            Após confirmar consulta
                          </span>
                          <p className="text-xs text-gray-500">
                            Envia o menu após o paciente confirmar presença com
                            "SIM"
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                    type="checkbox"
                    checked={menuAjudaSituacoes.aposAssinatura}
                    onChange={(e) =>
                    setMenuAjudaSituacoes((prev) => ({
                      ...prev,
                      aposAssinatura: e.target.checked
                    }))
                    }
                    className="w-4 h-4 mt-0.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                  

                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            Após assinar documento
                          </span>
                          <p className="text-xs text-gray-500">
                            Envia o menu após o paciente assinar digitalmente
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                    type="checkbox"
                    checked={menuAjudaSituacoes.primeiroContato}
                    onChange={(e) =>
                    setMenuAjudaSituacoes((prev) => ({
                      ...prev,
                      primeiroContato: e.target.checked
                    }))
                    }
                    className="w-4 h-4 mt-0.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                  

                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            Primeiro contato
                          </span>
                          <p className="text-xs text-gray-500">
                            Quando o paciente envia mensagem pela primeira vez
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                    type="checkbox"
                    checked={menuAjudaSituacoes.manual}
                    onChange={(e) =>
                    setMenuAjudaSituacoes((prev) => ({
                      ...prev,
                      manual: e.target.checked
                    }))
                    }
                    className="w-4 h-4 mt-0.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                  

                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            Envio manual
                          </span>
                          <p className="text-xs text-gray-500">
                            Via botão "Enviar Menu de Ajuda" no cadastro do
                            paciente
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div
              className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${!menuAjudaAtivo ? 'opacity-40 pointer-events-none' : ''}`}>
              
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Template do Menu de Ajuda
                      </label>
                      <textarea
                  value={menuAjudaTemplate}
                  onChange={(e) => setMenuAjudaTemplate(e.target.value)}
                  rows={14}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                  placeholder="👋 Olá, *{nome}*! Como posso ajudar?" />
                

                      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs font-medium text-gray-700 mb-1">
                          Variáveis disponíveis:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <code className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-purple-700">
                            {'{nome}'}
                          </code>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          ⚠️ <strong>Importante:</strong> As opções numéricas
                          (1-7, 0) são processadas automaticamente pelo sistema.
                          Você pode alterar o texto, mas mantenha os números
                          para que o bot responda corretamente.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Preview do Menu
                      </label>
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200 h-full">
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {menuAjudaTemplate.replace(
                        /\{nome\}/g,
                        'João Silva'
                      )}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                          ℹ️ Prévia de como o menu aparece para o paciente
                        </p>
                        <div className="mt-3 p-3 bg-white/80 rounded-lg border border-purple-100">
                          <p className="text-xs font-medium text-purple-800 mb-1">
                            📋 Opções processadas automaticamente:
                          </p>
                          <div className="text-xs text-purple-700 space-y-0.5">
                            <p>1️⃣ Mostra próximas consultas do paciente</p>
                            <p>4️⃣ Consulta boletos pendentes</p>
                            <p>5️⃣ Solicita foto de perfil</p>
                            <p>6️⃣ Solicita documento</p>
                            <p>7️⃣ Registra chegada na clínica</p>
                            <p>0️⃣ Encerra o diálogo</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-100">
                    <Button onClick={handleSalvarTudo} disabled={isSaving}>
                      <SaveIcon className="w-4 h-4 mr-2" />
                      {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                    </Button>
                  </div>
                </div>
          }
            </Card>
        }

          {/* SEÇÃO: PRINTSERVER / IMPRESSORA */}
          {isAdmin &&
        <Card>
              <button
            onClick={() => toggleSection('printserver')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <PrinterIcon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      PrintServer / Impressora
                    </h2>
                    <p className="text-sm text-gray-500">
                      Baixe e instale o aplicativo de impressão para recibos e
                      tickets
                    </p>
                  </div>
                </div>
                {sectionsExpanded.printserver ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.printserver &&
          <div className="p-6 space-y-6">
                  {/* Instruções */}
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <h3 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                      <HelpCircleIcon className="w-4 h-4" />
                      Como funciona?
                    </h3>
                    <p className="text-sm text-indigo-800 leading-relaxed">
                      O <strong>EDSSolution Printer Setup</strong> é um
                      aplicativo Windows que conecta sua impressora
                      térmica/autenticadora ao sistema EasyClin. Após instalado,
                      ele recebe automaticamente os comandos de impressão de
                      recibos, tickets e avisos de consulta.
                    </p>
                  </div>

                  {/* Passos de instalação */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Passo a passo:
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          1
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Baixe o instalador
                          </p>
                          <p className="text-xs text-gray-500">
                            Clique no botão abaixo para baixar o arquivo .exe
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          2
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Execute o instalador
                          </p>
                          <p className="text-xs text-gray-500">
                            Abra o arquivo baixado e siga as instruções de
                            instalação no Windows
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          3
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Configure a conexão
                          </p>
                          <p className="text-xs text-gray-500">
                            No aplicativo, informe o endereço do servidor e o ID
                            da clínica para conectar
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          4
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Pronto!
                          </p>
                          <p className="text-xs text-gray-500">
                            Os botões de Recibo e Ticket no sistema enviarão
                            automaticamente para a impressora
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Download */}
                  <div className="flex flex-col items-center gap-3 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <PrinterIcon className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-gray-900">
                        EDSSolution Printer Setup
                      </h3>
                      <p className="text-sm text-gray-500">
                        Versão 1.0.0 • Windows
                      </p>
                    </div>
                    <a
                href={`${API_BASE_URL}/api/downloads/arquivo/${encodeURIComponent('PrintServer-Setup.exe')}`}
                download
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg">
                
                      <DownloadIcon className="w-5 h-5" />
                      Baixar Instalador
                    </a>
                    <p className="text-xs text-gray-400 mt-1">
                      Arquivo: PrintServer-Setup.exe
                    </p>
                  </div>

                  {/* Info da clínica para configuração */}
                  {clinicaId &&
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <h3 className="text-sm font-semibold text-amber-900 mb-2">
                        📋 Dados para configuração do PrintServer:
                      </h3>
                      <div className="space-y-1 text-sm text-amber-800">
                        <p>
                          <strong>ID da Clínica:</strong>{' '}
                          <code className="bg-amber-100 px-2 py-0.5 rounded text-xs font-mono">
                            {clinicaId}
                          </code>
                        </p>
                        {clinicaNome &&
                <p>
                            <strong>Clínica:</strong> {clinicaNome}
                          </p>
                }
                        <p>
                          <strong>Servidor:</strong>{' '}
                          <code className="bg-amber-100 px-2 py-0.5 rounded text-xs font-mono">
                            {API_BASE_URL}
                          </code>
                        </p>
                      </div>
                    </div>
            }
                </div>
          }
            </Card>
        }

          {/* SEÇÃO: LEITOR BIOMÉTRICO / PONTO */}
          {isAdmin &&
        <Card>
              <button
            onClick={() => toggleSection('biometria')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
                    <FingerprintIcon className="w-5 h-5 text-rose-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Leitor Biométrico
                    </h2>
                    <p className="text-sm text-gray-500">
                      Baixe e instale o leitor de digitais para a marcação de
                      ponto dos funcionários
                    </p>
                  </div>
                </div>
                {sectionsExpanded.biometria ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.biometria &&
          <div className="p-6 space-y-6">
                  {/* Instruções */}
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
                    <h3 className="text-sm font-semibold text-rose-900 mb-2 flex items-center gap-2">
                      <HelpCircleIcon className="w-4 h-4" />
                      Como funciona?
                    </h3>
                    <p className="text-sm text-rose-800 leading-relaxed">
                      O <strong>BiometriaDigitalPersona</strong> é o aplicativo
                      Windows que conecta o leitor de digitais (DigitalPersona)
                      ao sistema EasyClin. Após instalado, ele captura as
                      digitais durante o cadastro e identifica o funcionário na
                      marcação de ponto.
                    </p>
                  </div>

                  {/* Passos de instalação */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Passo a passo:
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          1
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Baixe o instalador
                          </p>
                          <p className="text-xs text-gray-500">
                            Clique no botão abaixo para baixar o arquivo .exe
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          2
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Conecte o leitor e execute o instalador
                          </p>
                          <p className="text-xs text-gray-500">
                            Plugue o leitor DigitalPersona na USB, abra o
                            arquivo baixado e siga as instruções de instalação
                            no Windows
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          3
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Configure a conexão
                          </p>
                          <p className="text-xs text-gray-500">
                            No aplicativo, informe o endereço do servidor e o ID
                            da clínica para conectar
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          4
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Pronto!
                          </p>
                          <p className="text-xs text-gray-500">
                            A tela de Biometria / Ponto poderá cadastrar
                            digitais e registrar a marcação de ponto
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Download */}
                  <div className="flex flex-col items-center gap-3 p-6 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-xl">
                    <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <FingerprintIcon className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-gray-900">
                        BiometriaDigitalPersona Setup
                      </h3>
                      <p className="text-sm text-gray-500">
                        Windows • Leitor DigitalPersona
                      </p>
                    </div>
                    <a
                href={`${API_BASE_URL}/api/downloads/arquivo/${encodeURIComponent('BiometriaDigitalPersona-Setup.exe')}`}
                download
                className="inline-flex items-center gap-2 px-6 py-3 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 transition-colors shadow-md hover:shadow-lg">
                
                      <DownloadIcon className="w-5 h-5" />
                      Baixar Instalador
                    </a>
                    <p className="text-xs text-gray-400 mt-1">
                      Arquivo: BiometriaDigitalPersona-Setup.exe
                    </p>
                  </div>

                  {/* Info da clínica para configuração */}
                  {clinicaId &&
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <h3 className="text-sm font-semibold text-amber-900 mb-2">
                        📋 Dados para configuração do leitor:
                      </h3>
                      <div className="space-y-1 text-sm text-amber-800">
                        <p>
                          <strong>ID da Clínica:</strong>{' '}
                          <code className="bg-amber-100 px-2 py-0.5 rounded text-xs font-mono">
                            {clinicaId}
                          </code>
                        </p>
                        {clinicaNome &&
                <p>
                            <strong>Clínica:</strong> {clinicaNome}
                          </p>
                }
                        <p>
                          <strong>Servidor:</strong>{' '}
                          <code className="bg-amber-100 px-2 py-0.5 rounded text-xs font-mono">
                            {API_BASE_URL}
                          </code>
                        </p>
                      </div>
                    </div>
            }
                </div>
          }
            </Card>
        }

          {/* SEÇÃO 3: CONFIGURAÇÕES BANCÁRIAS */}
          {podeConfigurar &&
        <Card>
              <button
            onClick={() => toggleSection('bancos')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <LandmarkIcon className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Configurações Bancárias
                    </h2>
                    <p className="text-sm text-gray-500">
                      Configure contas para emissão de boletos registrados
                    </p>
                  </div>
                </div>
                {sectionsExpanded.bancos ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.bancos &&
          <div className="p-6">
                  <BancoConfigForm clinicaId={clinicaId} />
                </div>
          }
            </Card>
        }

          {/* SEÇÃO 4: EXAMES GRATUITOS */}
          {podeConfigurar &&
        <Card>
              <button
            onClick={() => toggleSection('examesGratuitos')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <DatabaseIcon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Exames de Rotina
                    </h2>
                    <p className="text-sm text-gray-500">
                      Gerencie a lista de exames de rotina disponíveis para
                      solicitação
                    </p>
                  </div>
                </div>
                {sectionsExpanded.examesGratuitos ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.examesGratuitos &&
          <div className="p-6">
                  <ExamesGratuitosManager clinicaId={clinicaId} />
                </div>
          }
            </Card>
        }

          {/* SEÇÃO 5A: ABA AVALIAÇÃO */}
          {isAdmin &&
        <Card>
              <button
            onClick={() => toggleSection('avaliacao')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <ClipboardListIcon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Aba Avaliação no Prontuário
                    </h2>
                    <p className="text-sm text-gray-500">
                      Habilite a aba "Avaliação" para registrar avaliações de
                      procedimentos no prontuário
                    </p>
                  </div>
                </div>
                {sectionsExpanded.avaliacao ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>
              {sectionsExpanded.avaliacao &&
          <div className="px-6 pb-4 border-t border-gray-100 pt-4">
                <Button
              variant={
              avaliacaoConfig.valor.habilitado ? 'primary' : 'secondary'
              }
              onClick={handleToggleAvaliacao}
              disabled={salvandoAvaliacao || avaliacaoConfig.loading}
              className={
              avaliacaoConfig.valor.habilitado ?
              'bg-green-600 hover:bg-green-700' :
              ''
              }>
              
                  {salvandoAvaliacao ?
              'Salvando...' :
              avaliacaoConfig.valor.habilitado ?
              <>
                      <EyeIcon className="w-4 h-4 mr-2" />
                      Habilitado
                    </> :

              <>
                      <EyeOffIcon className="w-4 h-4 mr-2" />
                      Desabilitado
                    </>
              }
                </Button>
              </div>
          }
            </Card>
        }

          {/* ASSISTENTE DE VOZ — o administrador ativa; o uso é cobrado */}
          {isAdmin && clinicaId &&
        <AssistenteAtivacaoCard clinicaId={clinicaId} usuarioId={usuarioIdSessao()} />
        }

          {/* SEÇÃO 5A.5: FELICITAÇÃO DE ANIVERSÁRIO */}
          {isAdmin &&
        <Card>
              <button
            onClick={() => toggleSection('aniversario')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                    <span className="text-lg">🎂</span>
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Felicitação de Aniversário
                    </h2>
                    <p className="text-sm text-gray-500">
                      Envio automático diário de mensagens de aniversário via
                      WhatsApp
                    </p>
                  </div>
                </div>
                {sectionsExpanded.aniversario ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>
              {sectionsExpanded.aniversario &&
          <>
              <div className="px-6 py-4 flex items-center justify-end border-t border-gray-100">
                <Button
                variant={
                aniversarioConfig.valor.habilitado ? 'primary' : 'secondary'
                }
                onClick={handleToggleAniversario}
                disabled={salvandoAniversario || aniversarioConfig.loading}
                className={
                aniversarioConfig.valor.habilitado ?
                'bg-green-600 hover:bg-green-700' :
                ''
                }>
                
                  {salvandoAniversario ?
                'Salvando...' :
                aniversarioConfig.valor.habilitado ?
                <>
                      <EyeIcon className="w-4 h-4 mr-2" />
                      Ativado
                    </> :

                <>
                      <EyeOffIcon className="w-4 h-4 mr-2" />
                      Desativado
                    </>
                }
                </Button>
              </div>
              <div className="px-6 pb-4 space-y-4">
                <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                  {aniversarioConfig.valor.habilitado ?
                'Quando ativado, o sistema envia automaticamente uma mensagem de feliz aniversário via WhatsApp para todos os pacientes que fazem aniversário no dia. Pacientes podem ser excluídos individualmente no cadastro.' :
                '⚠️ A felicitação automática está desativada. Você ainda pode personalizar a mensagem abaixo — ela será usada quando a funcionalidade for ativada.'}
                </p>

                {/* ⭐ Editor de mensagem personalizada */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Mensagem de Felicitação
                  </label>
                  <p className="text-xs text-gray-500">
                    Personalize a mensagem enviada aos aniversariantes. Use os
                    marcadores abaixo:
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 bg-pink-50 text-pink-700 rounded-md border border-pink-200 font-mono">
                      {'{nome}'}
                    </span>
                    <span className="text-gray-400">
                      = Primeiro nome do paciente
                    </span>
                    <span className="px-2 py-1 bg-pink-50 text-pink-700 rounded-md border border-pink-200 font-mono">
                      {'{clinica}'}
                    </span>
                    <span className="text-gray-400">= Nome da clínica</span>
                  </div>
                  <textarea
                  value={
                  aniversarioConfig.valor.mensagemCustom ||
                  `🎂🎉 *Feliz Aniversário, {nome}!* 🎉🎂\n\nA equipe da *{clinica}* deseja a você um dia maravilhoso, repleto de saúde, alegria e realizações!\n\nQue este novo ciclo traga muitas bênçãos. Parabéns! 🥳🎈`
                  }
                  onChange={(e) => {
                    aniversarioConfig.salvar({
                      ...aniversarioConfig.valor,
                      mensagemCustom: e.target.value
                    });
                  }}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-300 focus:border-pink-400 outline-none resize-y font-mono"
                  placeholder="🎂🎉 *Feliz Aniversário, {nome}!* 🎉🎂..." />
                

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      💡 Use *texto* para negrito no WhatsApp
                    </p>
                    <Button
                    variant="secondary"
                    onClick={async () => {
                      setSalvandoAniversario(true);
                      try {
                        await aniversarioConfig.salvar({
                          ...aniversarioConfig.valor,
                          mensagemCustom: undefined
                        });
                        success(
                          'Mensagem Restaurada',
                          'A mensagem padrão foi restaurada.'
                        );
                      } catch (err: any) {
                        showError(
                          'Erro',
                          'Não foi possível restaurar a mensagem.'
                        );
                      } finally {
                        setSalvandoAniversario(false);
                      }
                    }}
                    className="text-xs">
                    
                      Restaurar Padrão
                    </Button>
                  </div>
                </div>
              </div>
              </>
          }
            </Card>
        }

          {/* SEÇÃO 5B: ABA PROCEDIMENTO */}
          {isAdmin &&
        <Card>
              <button
            onClick={() => toggleSection('procedimentos')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <ClipboardIcon className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Procedimentos no Prontuário
                    </h2>
                    <p className="text-sm text-gray-500">
                      Habilite a aba "Procedimentos" e defina quem pode alterar
                      os registros
                    </p>
                  </div>
                </div>
                {sectionsExpanded.procedimentos ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>
              {sectionsExpanded.procedimentos &&
          <>
              <div className="px-6 py-4 flex items-center justify-between border-t border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <ClipboardIcon className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      Aba Procedimentos
                    </h2>
                    <p className="text-sm text-gray-500">
                      Registrar procedimentos e coletar assinatura do paciente
                    </p>
                  </div>
                </div>
                <Button
                variant={
                procedimentoConfig.valor.habilitado ?
                'primary' :
                'secondary'
                }
                onClick={() => handleToggleProcedimento('habilitado')}
                disabled={salvandoProcedimento || procedimentoConfig.loading}
                className={
                procedimentoConfig.valor.habilitado ?
                'bg-green-600 hover:bg-green-700' :
                ''
                }>
                
                  {salvandoProcedimento ?
                'Salvando...' :
                procedimentoConfig.valor.habilitado ?
                <>
                      <EyeIcon className="w-4 h-4 mr-2" />
                      Habilitado
                    </> :

                <>
                      <EyeOffIcon className="w-4 h-4 mr-2" />
                      Desabilitado
                    </>
                }
                </Button>
              </div>

              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <LockIcon className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Procedimentos Restritos
                    </h2>
                    <p className="text-sm text-gray-500">
                      Se ativado, apenas médicos e dentistas poderão alterar ou
                      remover procedimentos
                    </p>
                  </div>
                </div>
                <Button
                variant={
                procedimentoConfig.valor.restrito ? 'primary' : 'secondary'
                }
                onClick={() => handleToggleProcedimento('restrito')}
                disabled={salvandoProcedimento || procedimentoConfig.loading}
                className={
                procedimentoConfig.valor.restrito ?
                'bg-red-600 hover:bg-red-700' :
                ''
                }>
                
                  {salvandoProcedimento ?
                'Salvando...' :
                procedimentoConfig.valor.restrito ?
                <>
                      <LockIcon className="w-4 h-4 mr-2" />
                      Restrito
                    </> :

                <>
                      <EyeIcon className="w-4 h-4 mr-2" />
                      Livre
                    </>
                }
                </Button>
              </div>
              </>
          }
            </Card>
        }

          {/* SEÇÃO 6: MIGRAÇÕES */}
          {isAdmin &&
        <Card>
              <button
            onClick={() => toggleSection('migracoes')}
            className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <DatabaseIcon className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="text-left" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Migrações de Banco de Dados
                  </h2>
                  <p className="text-sm text-gray-500">
                    Execute migrações para corrigir problemas
                  </p>
                </div>
                {sectionsExpanded.migracoes ?
            <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            }
              </button>

              {sectionsExpanded.migracoes &&
          <div className="p-6">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
                    <p className="text-sm text-amber-800">
                      ⚠️ Execute as migrações abaixo apenas se estiver
                      enfrentando problemas com campos ausentes no banco de
                      dados.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <MigrationButton clinicaId={clinicaId} />
                    <MigrationButtonCrmUf />
                    <MigrationButtonEmpresaConveniada clinicaId={clinicaId} />
                    <MigrationButtonProfissionalId
                clinicaId={clinicaId}
                usuarios={usuarios} />
              
                  </div>
                </div>
          }
            </Card>
        }
        </>
      }
    </div>);

}