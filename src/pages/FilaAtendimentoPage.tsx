import React, { useEffect, useMemo, useState, Component } from 'react';
import {
  ClockIcon,
  UserIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  FilterIcon,
  TimerIcon,
  UsersIcon,
  FileTextIcon,
  StethoscopeIcon,
  CarIcon,
  XCircleIcon,
  CalendarIcon,
  VideoIcon,
  SendIcon,
  MonitorIcon,
  BuildingIcon } from
'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Consulta, Usuario } from '../types';
import { useToast } from '../hooks/useToast';
import { API_BASE_URL } from '../config/api';
import {
  gerarLinkSalaVideo,
  montarMensagemConsultaOnline,
  formatarDataConsultaSimples } from
'../utils/videoConsulta';
import { montarMensagemConsultaOnlineSms } from '../utils/videoConsultaSms';
import { enviarSmsApi } from '../utils/smsApi';
import {
  enviarWhatsappMetaApi,
  metaDisponivelApi } from
'../utils/whatsappMetaApi';
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
export interface FilaAtendimentoPageProps {
  consultas: Consulta[];
  onUpdateConsulta: (id: string, updates: Partial<Consulta>) => void;
  usuarioLogado?: {
    id?: string;
    nome: string;
    tipo: 'super_admin' | 'admin' | 'medico' | 'dentista' | 'atendente';
  };
  usuarios?: Usuario[];
  clinicaId?: string;
  onNavigate?: (page: string) => void;
  onIniciarAtendimento?: (
  pacienteId: string,
  consultaId?: string,
  stepInicial?: string)
  => void;
}
export function FilaAtendimentoPage({
  consultas,
  onUpdateConsulta,
  usuarioLogado,
  usuarios = [],
  clinicaId,
  onNavigate,
  onIniciarAtendimento
}: FilaAtendimentoPageProps) {
  const [filtroProfissional, setFiltroProfissional] = useState<string>('todos');
  const [currentTime, setCurrentTime] = useState(new Date());
  // ⭐ NOVO: Ordem de prioridade da fila — por ordem de chegada ou por horário de marcação.
  // Persistido por clínica no localStorage para "prevalecer" entre sessões.
  const ordemFilaKey = `filaOrdemPrioridade_${clinicaId || 'default'}`;
  const [ordemFila, setOrdemFila] = useState<'chegada' | 'marcacao'>(() => {
    if (typeof window === 'undefined') return 'chegada';
    const saved = window.localStorage.getItem(ordemFilaKey);
    return saved === 'marcacao' ? 'marcacao' : 'chegada';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ordemFilaKey, ordemFila);
    }
  }, [ordemFila, ordemFilaKey]);
  const { success, error } = useToast();
  // Atualiza o relógio a cada segundo para os cronômetros
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Auto-seleciona o profissional se for médico/dentista
  useEffect(() => {
    if (
    usuarioLogado && (
    usuarioLogado.tipo === 'medico' || usuarioLogado.tipo === 'dentista'))
    {
      // ⭐ FIX: Usa ID direto em vez de buscar por nome
      if (usuarioLogado.id) {
        setFiltroProfissional(usuarioLogado.id);
      }
    }
  }, [usuarioLogado]);
  // Filtra profissionais pela clínica atual
  const profissionaisDaClinica = useMemo(() => {
    return usuarios.filter((u) => {
      const isMedicoOuDentista = u.tipo === 'medico' || u.tipo === 'dentista';
      const pertenceClinica =
      !clinicaId ||
      String(u.clinicaId || '') === String(clinicaId || '') ||
      !u.clinicaId;
      const isAtivo = u.ativo !== false && (u as any).ativo !== 0;
      return isMedicoOuDentista && pertenceClinica && isAtivo;
    });
  }, [usuarios, clinicaId]);
  // Filtra consultas do dia que têm horaChegada marcada
  const filaPacientes = useMemo(() => {
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return consultas.
    filter((c) => {
      if (c.data !== hoje) return false;
      if (!c.horaChegada) return false;
      if (c.status === 'cancelada') return false;
      if (filtroProfissional !== 'todos') {
        return String(c.profissionalId) === String(filtroProfissional);
      }
      return true;
    }).
    sort((a, b) => {
      if (ordemFila === 'marcacao') {
        // Prevalece a ordem de MARCAÇÃO da consulta (horário agendado);
        // empate desempata pela hora de chegada.
        const byHorario = String(a.horario ?? '').localeCompare(
          String(b.horario ?? '')
        );
        if (byHorario !== 0) return byHorario;
        return String(a.horaChegada ?? '').localeCompare(
          String(b.horaChegada ?? '')
        );
      }
      // Prevalece a ordem de CHEGADA; empate desempata pelo horário agendado.
      const byChegada = String(a.horaChegada ?? '').localeCompare(
        String(b.horaChegada ?? '')
      );
      if (byChegada !== 0) return byChegada;
      return String(a.horario ?? '').localeCompare(String(b.horario ?? ''));
    });
  }, [consultas, filtroProfissional, ordemFila]);
  // ⭐ NOVO: Consultas agendadas do dia SEM chegada marcada (para marcar chegada)
  const consultasAgendadas = useMemo(() => {
    const d2 = new Date();
    const hoje = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    return consultas.
    filter((c) => {
      if (c.data !== hoje) return false;
      if (c.horaChegada) return false; // Já tem chegada marcada
      if (c.status === 'cancelada') return false;
      if (c.pacienteId === 'disponivel' || c.pacienteId === 'livre')
      return false; // Placeholder
      if (filtroProfissional !== 'todos') {
        return String(c.profissionalId) === String(filtroProfissional);
      }
      return true;
    }).
    sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
  }, [consultas, filtroProfissional]);
  // Agrupa por status
  const aguardando = filaPacientes.filter(
    (c) => !c.statusAtendimento || c.statusAtendimento === 'aguardando'
  );
  const emAtendimento = filaPacientes.filter(
    (c) =>
    c.statusAtendimento === 'em_atendimento' ||
    c.statusAtendimento === 'pausado'
  );
  const finalizados = filaPacientes.filter(
    (c) => c.statusAtendimento === 'finalizado'
  );
  // Formata tempo decorrido
  const formatarTempo = (inicio: string, fim?: string, pausas?: number) => {
    const start = new Date(inicio).getTime();
    const end = fim ? new Date(fim).getTime() : currentTime.getTime();
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    const horas = Math.floor(diff / 3600);
    const minutos = Math.floor(diff % 3600 / 60);
    const segundos = diff % 60;
    return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };
  // ⭐ NOVO: Toggle de chegada do paciente (marca/cancela)
  // IMPORTANTE: Usa `null` (não `undefined`) para limpar campos — JSON.stringify remove undefined!
  const handleMarcarChegada = (consulta: Consulta) => {
    if (consulta.horaChegada) {
      // Cancelar chegada → limpa horaChegada/statusAtendimento e volta status para 'agendada'
      onUpdateConsulta(consulta.id, {
        horaChegada: null as any,
        statusAtendimento: null as any,
        status: 'agendada'
      });
      success(
        'Chegada Cancelada',
        `${consulta.pacienteNome} voltou para Agendada`
      );
    } else {
      // Marcar chegada → registra hora, muda statusAtendimento e status
      const agora = new Date().toISOString();
      onUpdateConsulta(consulta.id, {
        horaChegada: agora,
        statusAtendimento: 'aguardando',
        status: 'confirmada'
      });
      success(
        'Paciente Chegou',
        `Chegada de ${consulta.pacienteNome} marcada às ${new Date().toLocaleTimeString(
          'pt-BR',
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        )}`
      );
    }
  };
  // Ações de controle
  const [consultaParaIniciar, setConsultaParaIniciar] =
  useState<Consulta | null>(null);
  const [modalidadeSelecionada, setModalidadeSelecionada] = useState<
    'presencial' | 'online'>(
    'presencial');
  const handleIniciar = (consulta: Consulta) => {
    setConsultaParaIniciar(consulta);
    setModalidadeSelecionada(consulta.modalidade || 'presencial');
  };
  // ⭐ Grava a intenção de abrir a sala de vídeo DENTRO do app. A
  // ProntuarioAtendimentoPage lê esta chave ao carregar a consulta e abre a
  // janela embutida com este link — determinístico, sem depender de estado
  // assíncrono da consulta e SEM abrir o navegador.
  const marcarAberturaSalaOnline = (consultaId: string, link?: string) => {
    if (!consultaId || !link) return;
    try {
      localStorage.setItem(
        'abrirConsultaOnline',
        JSON.stringify({
          consultaId,
          link,
          ts: Date.now()
        })
      );
    } catch {

      /* ignore */}
  };
  // ⭐ Entra na sala de vídeo online DENTRO do app: gera/reutiliza o link,
  // grava a intenção de abertura e navega para o prontuário (onde a janela
  // embutida abre automaticamente).
  const entrarNaSalaOnline = (consulta: Consulta) => {
    // O MÉDICO entra como moderador (no BBB, admite o paciente da sala de espera).
    // No Jitsi o papel é ignorado — o link é o mesmo.
    const linkMedico = gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: consulta.id,
      linkExistente: consulta.linkVideo,
      role: 'moderator',
      nome: consulta.profissional
    });
    marcarAberturaSalaOnline(consulta.id, linkMedico);
    if (onIniciarAtendimento) {
      onIniciarAtendimento(consulta.pacienteId, consulta.id);
    }
  };
  const confirmarInicioAtendimento = async () => {
    if (!consultaParaIniciar) return;
    const consulta = consultaParaIniciar;
    const isOnline = modalidadeSelecionada === 'online';
    let linkVideo = consulta.linkVideo;
    if (isOnline) {
      // Link do PACIENTE (attendee) — é o que fica salvo na consulta e é enviado
      // por WhatsApp. No Jitsi o papel é ignorado (link único).
      linkVideo = gerarLinkSalaVideo({
        clinicaId: clinicaId || 'default',
        consultaId: consulta.id,
        linkExistente: consulta.linkVideo,
        role: 'attendee',
        // Nome no link: o paciente entra direto, sem digitar nada no celular.
        nome: consulta.pacienteNome
      });
      // Link do MÉDICO (moderator) — abre a janela embutida no app. NÃO abrimos o
      // navegador: gravamos a "intenção" de abrir a sala (com o link do médico) e,
      // ao navegar para o prontuário (onIniciarAtendimento abaixo), a
      // ProntuarioAtendimentoPage lê essa intenção e abre a janela de vídeo
      // embutida — de forma determinística, sem depender de atualização assíncrona.
      const linkMedico = gerarLinkSalaVideo({
        clinicaId: clinicaId || 'default',
        consultaId: consulta.id,
        linkExistente: consulta.linkVideo,
        role: 'moderator',
        nome: consulta.profissional
      });
      marcarAberturaSalaOnline(consulta.id, linkMedico);
    }
    onUpdateConsulta(consulta.id, {
      statusAtendimento: 'em_atendimento',
      horaInicioAtendimento: new Date().toISOString(),
      status: 'realizada',
      modalidade: modalidadeSelecionada,
      ...(isOnline && {
        linkVideo
      })
    });
    success(
      'Atendimento Iniciado',
      `Iniciando atendimento de ${consulta.pacienteNome}`
    );
    // ⭐ NOVO: envia AUTOMATICAMENTE o link da sala ao paciente por WhatsApp.
    // Passa o link explicitamente (a consulta em memória ainda não tem o
    // linkVideo persistido neste instante).
    if (isOnline && linkVideo) {
      // Não bloqueia o fluxo de início — dispara e segue para a Evolução.
      enviarLinkWhatsApp(consulta, linkVideo);
    }
    setConsultaParaIniciar(null);
    // ⭐ FASE 3: navega já para a aba Evolução (evolução temporária do atendimento)
    if (onIniciarAtendimento) {
      onIniciarAtendimento(consulta.pacienteId, consulta.id, 'evolucao');
    }
  };
  // ⭐ Envia o link da sala de vídeo ao paciente por WhatsApp.
  // `linkOverride` permite enviar mesmo quando a consulta em memória ainda não
  // tem o `linkVideo` persistido (ex.: no exato momento do início do atendimento).
  const enviarLinkWhatsApp = async (
  consulta: Consulta,
  linkOverride?: string) =>
  {
    const link = linkOverride || consulta.linkVideo;
    if (!link) {
      error('Sem link', 'Nenhuma sala de vídeo foi gerada para esta consulta.');
      return;
    }
    let telefone = (consulta as any).pacienteTelefone;
    if (!telefone) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes/${consulta.pacienteId}?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const data = await response.json();
          telefone = data.telefone;
        }
      } catch (err) {
        console.error('Erro ao buscar telefone do paciente:', err);
      }
    }
    if (!telefone) {
      error(
        'Sem telefone',
        'Paciente sem telefone cadastrado. Sala criada, mas o link não pôde ser enviado.'
      );
      return;
    }
    const mensagem = montarMensagemConsultaOnline({
      pacienteNome: consulta.pacienteNome,
      profissional: consulta.profissional,
      // ⭐ Passa a data CRUA (aaaa-mm-dd/ISO). A formatação em pt-BR é feita
      // uma única vez dentro de montarMensagemConsultaOnline — formatar aqui
      // causava dupla conversão e "Data: Invalid Date" no WhatsApp.
      data: consulta.data || undefined,
      horario: consulta.horario,
      link
    });
    const telefoneFormatado = telefone.replace(/\D/g, '');
    const numeroCompleto = telefoneFormatado.startsWith('55') ?
    telefoneFormatado :
    `55${telefoneFormatado}`;
    // Abre o WhatsApp Web com a mensagem pronta. Usado APENAS como último
    // recurso, quando a clínica NÃO tem WhatsApp conectado.
    const abrirWhatsAppWeb = () => {
      window.open(
        `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`,
        '_blank'
      );
    };
    // ⭐ FALLBACK POR SMS — quando o WhatsApp da clínica não está online, o link
    // da sala é a ÚNICA forma de o paciente entrar na consulta. Em vez de
    // deixar o profissional sem saída, tentamos o SMS (mesmo canal usado pela
    // agenda). Retorna true se o SMS realmente saiu.
    const enviarLinkPorSms = async (motivo: string): Promise<boolean> => {
      const textoSms = montarMensagemConsultaOnlineSms({
        pacienteNome: consulta.pacienteNome,
        data: consulta.data || undefined,
        horario: consulta.horario,
        link
      });
      // ⭐ Envio centralizado (utils/smsApi): tenta o POST e, se o proxy barrar a
      // requisição antes de chegar ao servidor, repete pela rota alternativa.
      const envio = await enviarSmsApi({
        clinicaId,
        telefone: numeroCompleto,
        mensagem: textoSms,
        pacienteId: consulta.pacienteId,
        pacienteNome: consulta.pacienteNome,
        consultaId: consulta.id
      });
      if (envio.success) {
        success(
          'Link enviado por SMS',
          `${motivo} O link da sala foi enviado por SMS para ${consulta.pacienteNome}.`
        );
        return true;
      }
      console.error('Falha ao enviar SMS do link de vídeo:', envio.error);
      return false;
    };
    // ⭐ CANAL META (WhatsApp oficial) — quando a clínica configurou a Cloud API,
    // o link vai pelo template aprovado, que é entregue mesmo fora da janela de
    // 24h. É tentado ANTES do SMS por ser mais barato e mais legível ao paciente.
    const enviarLinkPorMeta = async (): Promise<boolean> => {
      const disponibilidade = await metaDisponivelApi(clinicaId);
      const template = disponibilidade.templates?.consultaOnline;
      if (!disponibilidade.disponivel || !template) return false;
      const envio = await enviarWhatsappMetaApi({
        clinicaId,
        telefone: numeroCompleto,
        template: {
          name: template.name,
          language: template.language,
          params: [
          consulta.pacienteNome || 'Paciente',
          formatarDataConsultaSimples(consulta.data) || '',
          consulta.horario || ''],

          urlParam: link
        },
        pacienteId: consulta.pacienteId,
        pacienteNome: consulta.pacienteNome,
        consultaId: consulta.id
      });
      if (envio.success) {
        success(
          'Link enviado pelo WhatsApp oficial',
          `O link da sala foi enviado para ${consulta.pacienteNome}.`
        );
        return true;
      }
      console.error('Falha ao enviar link pela Meta:', envio.error);
      return false;
    };
    // Alternativa completa quando o WAHA não entrega: Meta (oficial) e depois SMS.
    const enviarLinkAlternativo = async (motivo: string): Promise<boolean> => {
      if (await enviarLinkPorMeta()) return true;
      return enviarLinkPorSms(motivo);
    };
    // Se a clínica marcou a Meta como canal preferencial, ela vem ANTES do WAHA.
    const metaPreferencial = await metaDisponivelApi(clinicaId);
    if (metaPreferencial.disponivel && metaPreferencial.preferencial) {
      if (await enviarLinkPorMeta()) return;
    }

    let whatsappConfig: {
      serverUrl?: string;
      sessionName?: string;
    } | null = null;
    try {
      const configResponse = await fetch(
        `${API_BASE_URL}/api/whatsapp/config?clinicaId=${clinicaId}`
      );
      if (configResponse.ok) {
        whatsappConfig = await configResponse.json();
      }
    } catch (err) {
      console.error('Erro ao buscar config do WhatsApp:', err);
    }
    // Se a clínica NÃO tem WhatsApp configurado, aí sim cai no WhatsApp Web.
    if (!whatsappConfig?.serverUrl || !whatsappConfig?.sessionName) {
      if (await enviarLinkAlternativo('WhatsApp da clínica não configurado.'))
      return;
      error(
        'WhatsApp da clínica não conectado',
        'Envie o link pelo WhatsApp Web ou conecte o WhatsApp da clínica em Configurações. O SMS também não está disponível.'
      );
      abrirWhatsAppWeb();
      return;
    }
    // ⭐ Verifica AO VIVO se a sessão da clínica está conectada. Só enviamos
    // direto pelo número da clínica quando ela está de fato online — assim o
    // paciente recebe do WhatsApp da clínica, não do WhatsApp Web do operador.
    let clinicaConectada = false;
    try {
      const statusResponse = await fetch(
        `${API_BASE_URL}/api/whatsapp/status?serverUrl=${encodeURIComponent(whatsappConfig.serverUrl)}&sessionName=${encodeURIComponent(whatsappConfig.sessionName)}`
      );
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const wahaStatus = (statusData.status || '').toUpperCase();
        clinicaConectada =
        wahaStatus === 'WORKING' ||
        wahaStatus === 'CONNECTED' ||
        wahaStatus === 'ONLINE' ||
        statusData.isReady === true;
      }
    } catch (err) {
      console.error('Erro ao verificar status do WhatsApp:', err);
      // Rede/timeout: assume que pode tentar enviar; o envio confirma de fato.
      clinicaConectada = true;
    }
    if (!clinicaConectada) {
      if (await enviarLinkAlternativo('WhatsApp da clínica desconectado.'))
      return;
      error(
        'WhatsApp da clínica desconectado',
        'Reconecte o WhatsApp em Configurações — o envio por SMS também não está disponível.'
      );
      return;
    }
    // Envia DIRETO pelo WhatsApp da clínica (sem abrir o WhatsApp Web).
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/send-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl: whatsappConfig.serverUrl,
            sessionName: whatsappConfig.sessionName,
            number: numeroCompleto,
            message: mensagem,
            clinicaId,
            pacienteId: consulta.pacienteId,
            pacienteNome: consulta.pacienteNome
          })
        }
      );
      if (response.ok) {
        success(
          'Link Enviado',
          `Link da sala enviado pelo WhatsApp da clínica para ${consulta.pacienteNome}.`
        );
        return;
      }
      // Envio falhou no servidor — tenta o SMS antes de desistir.
      if (await enviarLinkPorSms('Falha no envio pelo WhatsApp.')) return;
      error(
        'Falha ao enviar',
        'Não foi possível enviar o link pelo WhatsApp nem por SMS. Tente reenviar pelo botão "Enviar Link".'
      );
    } catch (err) {
      console.error('Erro ao enviar WhatsApp:', err);
      if (await enviarLinkPorSms('Falha no envio pelo WhatsApp.')) return;
      error(
        'Falha ao enviar',
        'Não foi possível enviar o link pelo WhatsApp nem por SMS. Tente reenviar pelo botão "Enviar Link".'
      );
    }
  };
  // Mantém compatibilidade com o botão "Enviar link" nos cards da fila.
  const handleEnviarLinkWhatsApp = (consulta: Consulta) =>
  enviarLinkWhatsApp(consulta);
  const handlePausar = (consulta: Consulta) => {
    onUpdateConsulta(consulta.id, {
      statusAtendimento: 'pausado',
      horaPausaAtendimento: new Date().toISOString()
    });
  };
  const handleRetomar = (consulta: Consulta) => {
    onUpdateConsulta(consulta.id, {
      statusAtendimento: 'em_atendimento',
      horaPausaAtendimento: undefined
    });
  };
  const handleFinalizar = (consulta: Consulta) => {
    const fim = new Date();
    const inicio = new Date(consulta.horaInicioAtendimento!);
    const diffSeconds = Math.floor((fim.getTime() - inicio.getTime()) / 1000);
    onUpdateConsulta(consulta.id, {
      statusAtendimento: 'finalizado',
      horaFimAtendimento: fim.toISOString(),
      tempoTotalAtendimento: diffSeconds,
      status: 'realizada'
    });
    success(
      'Atendimento Finalizado',
      `Tempo total: ${Math.floor(diffSeconds / 60)} min`
    );
  };
  // ⭐ NOVO: Reabrir um atendimento finalizado por engano.
  // Volta o paciente para "Em Atendimento" (retomando o cronômetro a partir do
  // início original) para que o profissional possa continuar. Para consultas
  // online, se ainda não houver sala salva, gera/reutiliza o mesmo link.
  const handleReabrirAtendimento = (consulta: Consulta) => {
    const isOnline = consulta.modalidade === 'online';
    const linkVideo = isOnline ?
    gerarLinkSalaVideo({
      clinicaId: clinicaId || 'default',
      consultaId: consulta.id,
      linkExistente: consulta.linkVideo,
      role: 'attendee',
      nome: consulta.pacienteNome
    }) :
    consulta.linkVideo;
    onUpdateConsulta(consulta.id, {
      statusAtendimento: 'em_atendimento',
      // Limpa a finalização para o card sair de "Finalizados".
      horaFimAtendimento: null as any,
      tempoTotalAtendimento: null as any,
      status: 'realizada',
      // Garante que exista início do atendimento (caso tenha sido perdido).
      ...(consulta.horaInicioAtendimento ?
      {} :
      {
        horaInicioAtendimento: new Date().toISOString()
      }),
      ...(isOnline && linkVideo ?
      {
        linkVideo
      } :
      {})
    });
    success(
      'Atendimento Reaberto',
      `${consulta.pacienteNome} voltou para "Em Atendimento".`
    );
    // ⭐ Para consultas online, entra no prontuário: lá a sala de vídeo é aberta
    // DENTRO do app (janela embutida), sem forçar uma nova aba do navegador.
    if (isOnline) {
      entrarNaSalaOnline({
        ...consulta,
        linkVideo: linkVideo || consulta.linkVideo
      });
    }
  };
  // ⭐ Função para ir ao prontuário do paciente
  const handleIrParaProntuario = (consulta: Consulta) => {
    if (onIniciarAtendimento) {
      onIniciarAtendimento(consulta.pacienteId, consulta.id);
    } else {
      // Fallback para navegação antiga
      localStorage.setItem(
        'retornoFila',
        JSON.stringify({
          pacienteId: consulta.pacienteId,
          pacienteNome: consulta.pacienteNome,
          consultaId: consulta.id,
          data: consulta.data
        })
      );
      onNavigate?.('prontuarios');
    }
  };
  // ⭐ Continuar atendimento em andamento
  const handleContinuarAtendimento = (consulta: Consulta) => {
    if (onIniciarAtendimento) {
      onIniciarAtendimento(consulta.pacienteId, consulta.id);
    }
  };
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Modal de Seleção de Modalidade */}
      {consultaParaIniciar &&
      <Modal
        isOpen={!!consultaParaIniciar}
        onClose={() => setConsultaParaIniciar(null)}
        title="Iniciar Atendimento"
        footer={
        <>
              <Button
            variant="ghost"
            onClick={() => setConsultaParaIniciar(null)}>
            
                Cancelar
              </Button>
              <Button
            onClick={confirmarInicioAtendimento}
            className="bg-teal-600 hover:bg-teal-700">
            
                Confirmar e Iniciar
              </Button>
            </>
        }>
        
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Como será o atendimento de{' '}
              <strong>{consultaParaIniciar.pacienteNome}</strong>?
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
              type="button"
              onClick={() => setModalidadeSelecionada('presencial')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${modalidadeSelecionada === 'presencial' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 bg-white text-gray-500 hover:border-teal-200 hover:bg-teal-50/50'}`}>
              
                <BuildingIcon
                className={`w-8 h-8 mb-2 ${modalidadeSelecionada === 'presencial' ? 'text-teal-600' : 'text-gray-400'}`} />
              
                <span className="font-semibold">Presencial</span>
                <span className="text-xs mt-1 text-center opacity-80">
                  Paciente na clínica
                </span>
              </button>

              <button
              type="button"
              onClick={() => setModalidadeSelecionada('online')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${modalidadeSelecionada === 'online' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:bg-blue-50/50'}`}>
              
                <VideoIcon
                className={`w-8 h-8 mb-2 ${modalidadeSelecionada === 'online' ? 'text-blue-600' : 'text-gray-400'}`} />
              
                <span className="font-semibold">Online</span>
                <span className="text-xs mt-1 text-center opacity-80">
                  Por videochamada
                </span>
              </button>
            </div>

            {modalidadeSelecionada === 'online' &&
          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                <MonitorIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Sala de Vídeo</p>
                  <p className="text-xs leading-relaxed">
                    Ao confirmar, uma sala de vídeo gratuita (Jitsi) abre em uma
                    nova aba para você e o link é{' '}
                    <strong>enviado automaticamente</strong> ao paciente pelo
                    WhatsApp da clínica (se conectado em Configurações). Permita
                    pop-ups para que a sala abra.
                  </p>
                </div>
              </div>
          }
          </div>
        </Modal>
      }

      {/* Header - fixo */}
      <div className="flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <UsersIcon className="w-8 h-8 text-teal-600" />
              Fila de Atendimento
            </h1>
            <p className="text-gray-500 mt-1">
              Gerencie o fluxo de pacientes em tempo real •{' '}
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            {/* ⭐ Ordem de prioridade da fila */}
            <div className="w-full sm:w-auto">
              <span className="block text-xs font-medium text-gray-500 mb-1">
                Ordenar fila por
              </span>
              <div
                role="group"
                aria-label="Ordem de prioridade da fila"
                className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                
                <button
                  type="button"
                  onClick={() => setOrdemFila('chegada')}
                  aria-pressed={ordemFila === 'chegada'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${ordemFila === 'chegada' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  
                  <CarIcon className="w-4 h-4" />
                  Ordem de chegada
                </button>
                <button
                  type="button"
                  onClick={() => setOrdemFila('marcacao')}
                  aria-pressed={ordemFila === 'marcacao'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${ordemFila === 'marcacao' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  
                  <CalendarIcon className="w-4 h-4" />
                  Horário marcado
                </button>
              </div>
            </div>

            {/* Filtro de Profissional */}
            {(!usuarioLogado ||
            ['super_admin', 'admin', 'atendente'].includes(
              usuarioLogado.tipo
            )) &&
            <div className="w-full sm:w-64">
                <Select
                label=""
                value={filtroProfissional}
                onChange={(e) => setFiltroProfissional(e.target.value)}
                options={[
                {
                  value: 'todos',
                  label: 'Todos os Profissionais'
                },
                ...profissionaisDaClinica.map((p) => ({
                  value: p.id,
                  label: `Dr(a). ${p.nome}`
                }))]
                } />
              
              </div>
            }
          </div>
        </div>
      </div>

      {/* Conteúdo - rola */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 max-w-6xl">
        {/* Seção: Em Atendimento */}
        {emAtendimento.length > 0 &&
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-green-700 flex items-center gap-2">
              <PlayIcon className="w-5 h-5 animate-pulse" />
              Em Atendimento ({emAtendimento.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {emAtendimento.map((consulta) =>
            <Card
              key={consulta.id}
              className="border-l-4 border-l-green-500 bg-green-50/30">
              
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center flex-wrap gap-2">
                          {consulta.pacienteNome}
                          {consulta.modalidade === 'online' &&
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              <VideoIcon className="w-3 h-3" /> Online
                            </span>
                      }
                          {(consulta as any).pacienteNumeroContrato &&
                      <span className="text-sm text-gray-400 font-normal ml-2">
                              #{(consulta as any).pacienteNumeroContrato}
                            </span>
                      }
                          {(consulta as any).pacienteTelefone &&
                      <span className="text-sm text-gray-400 font-normal ml-2">
                              📞 {(consulta as any).pacienteTelefone}
                            </span>
                      }
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600">
                        {consulta.tipo === 'medica' ?
                    '🩺 Médica' :
                    '🦷 Odontológica'}
                        {((consulta as any).procedimento ||
                    consulta.procedimentoNomeJoin ||
                    consulta.procedimentoNome) &&
                    <>
                            {' '}
                            •{' '}
                            <span className="text-teal-700 font-semibold">
                              📋{' '}
                              {(consulta as any).procedimento ||
                        consulta.procedimentoNomeJoin ||
                        consulta.procedimentoNome}
                              {consulta.procedimentoAnotacoes &&
                        <span className="font-normal italic text-teal-600">
                                  {' '}
                                  - {consulta.procedimentoAnotacoes}
                                </span>
                        }
                            </span>
                          </>
                    }{' '}
                        • Dr(a). {consulta.profissional}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-gray-500">
                          <ClockIcon className="w-4 h-4" />
                          Chegou: {formatarHoraChegada(consulta.horaChegada!)}
                        </div>
                        <div className="flex items-center gap-1 text-green-700 font-mono font-bold text-lg bg-green-100 px-2 py-0.5 rounded">
                          <TimerIcon className="w-4 h-4" />
                          {/* Pausado: o relógio PARA no instante da pausa —
                           continuar contando seria informação falsa. */}
                          {formatarTempo(
                        consulta.horaInicioAtendimento!,
                        consulta.statusAtendimento === 'pausado' ?
                        (consulta as any).horaPausaAtendimento ||
                        undefined :
                        undefined
                      )}
                        </div>
                      </div>

                      {consulta.modalidade === 'online' &&
                  consulta.linkVideo &&
                  <div className="mt-3 flex items-center gap-2">
                            <Button
                      size="sm"
                      variant="outline"
                      onClick={() => entrarNaSalaOnline(consulta)}
                      className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                      
                              <VideoIcon className="w-4 h-4 mr-1" /> Reabrir
                              Sala
                            </Button>
                            <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEnviarLinkWhatsApp(consulta)}
                      className="text-green-600 border-green-200 hover:bg-green-50">
                      
                              <SendIcon className="w-4 h-4 mr-1" /> Enviar Link
                            </Button>
                          </div>
                  }
                    </div>
                    <div className="flex flex-col gap-2">
                      {/* Botão para continuar atendimento */}
                      <Button
                    size="sm"
                    onClick={() => handleContinuarAtendimento(consulta)}
                    className="bg-teal-600 hover:bg-teal-700 text-white w-full">
                    
                        <StethoscopeIcon className="w-4 h-4 mr-1" /> Atender
                      </Button>
                      {consulta.statusAtendimento === 'pausado' ?
                  <Button
                    size="sm"
                    onClick={() => handleRetomar(consulta)}
                    className="bg-blue-600 hover:bg-blue-700 text-white w-full">
                    
                          <PlayIcon className="w-4 h-4 mr-1" /> Retomar
                        </Button> :

                  <Button
                    size="sm"
                    onClick={() => handlePausar(consulta)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white w-full">
                    
                          <PauseIcon className="w-4 h-4 mr-1" /> Pausar
                        </Button>
                  }
                      <Button
                    size="sm"
                    onClick={() => handleFinalizar(consulta)}
                    className="bg-red-600 hover:bg-red-700 text-white w-full">
                    
                        <SquareIcon className="w-4 h-4 mr-1" /> Finalizar
                      </Button>
                    </div>
                  </div>
                  {consulta.statusAtendimento === 'pausado' &&
              <div className="mt-3 bg-yellow-100 text-yellow-800 px-3 py-1 rounded text-sm flex items-center gap-2">
                      <AlertCircleIcon className="w-4 h-4" />
                      Atendimento Pausado
                    </div>
              }
                </Card>
            )}
            </div>
          </div>
        }

        {/* Seção: Aguardando */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <ClockIcon className="w-5 h-5" />
            Aguardando Atendimento ({aguardando.length})
          </h2>

          {aguardando.length === 0 ?
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-500">
                Nenhum paciente aguardando na fila.
              </p>
            </div> :

          <div className="space-y-3">
              {aguardando.map((consulta) => {
              const chegadaDate = new Date(consulta.horaChegada!);
              const espera = !isNaN(chegadaDate.getTime()) ?
              Math.floor(
                (currentTime.getTime() - chegadaDate.getTime()) / 60000
              ) :
              (() => {
                // Fallback para time-only strings como "08:10:09"
                const match = (consulta.horaChegada || '').match(
                  /^(\d{1,2}):(\d{2})(?::(\d{2}))?/
                );
                if (match) {
                  const hoje = new Date();
                  hoje.setHours(
                    parseInt(match[1]),
                    parseInt(match[2]),
                    match[3] ? parseInt(match[3]) : 0,
                    0
                  );
                  return Math.max(
                    0,
                    Math.floor(
                      (currentTime.getTime() - hoje.getTime()) / 60000
                    )
                  );
                }
                return 0;
              })();
              const corEspera =
              espera > 30 ?
              'text-red-600' :
              espera > 15 ?
              'text-yellow-600' :
              'text-green-600';
              return (
                <Card
                  key={consulta.id}
                  className="hover:shadow-md transition-shadow">
                  
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold text-lg">
                          {formatarHoraChegada(consulta.horaChegada!)}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg flex items-center flex-wrap gap-2">
                            {consulta.pacienteNome}
                            {consulta.modalidade === 'online' &&
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                <VideoIcon className="w-3 h-3" /> Online
                              </span>
                          }
                            {(consulta as any).pacienteNumeroContrato &&
                          <span className="text-sm text-gray-400 font-normal ml-2">
                                #{(consulta as any).pacienteNumeroContrato}
                              </span>
                          }
                            {(consulta as any).pacienteTelefone &&
                          <span className="text-sm text-gray-400 font-normal ml-2">
                                📞 {(consulta as any).pacienteTelefone}
                              </span>
                          }
                          </h3>
                          <p className="text-sm text-gray-600">
                            Agendado: {consulta.horario}
                            {((consulta as any).procedimento ||
                          consulta.procedimentoNomeJoin ||
                          consulta.procedimentoNome ||
                          consulta.procedimentoAnotacoes) &&
                          <>
                                {' '}
                                •{' '}
                                <span className="text-teal-700 font-semibold">
                                  📋{' '}
                                  {(consulta as any).procedimento ||
                              consulta.procedimentoNomeJoin ||
                              consulta.procedimentoNome ||
                              ''}
                                  {consulta.procedimentoAnotacoes &&
                              <span className="font-normal italic text-teal-600">
                                      {' '}
                                      {(consulta as any).procedimento ||
                                consulta.procedimentoNomeJoin ||
                                consulta.procedimentoNome ?
                                '- ' :
                                ''}
                                      {consulta.procedimentoAnotacoes}
                                    </span>
                              }
                                </span>
                              </>
                          }{' '}
                            • Dr(a). {consulta.profissional}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-gray-500 uppercase font-bold">
                            Tempo de Espera
                          </p>
                          <p
                          className={`text-xl font-mono font-bold ${corEspera}`}>
                          
                            {espera} min
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                          onClick={() => handleIniciar(consulta)}
                          className="bg-green-600 hover:bg-green-700 text-white shadow-sm">
                          
                            <PlayIcon className="w-4 h-4 mr-2" />
                            Chamar
                          </Button>
                          <button
                          onClick={() => handleMarcarChegada(consulta)}
                          className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                          title="Cancelar chegada do paciente">
                          
                            <XCircleIcon className="w-3.5 h-3.5" />
                            Cancelar Chegada
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>);

            })}
            </div>
          }
        </div>

        {/* ⭐ NOVO: Seção: Consultas Agendadas (sem chegada marcada) */}
        {consultasAgendadas.length > 0 &&
        <div className="space-y-4 pt-6 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-blue-700 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Consultas Agendadas ({consultasAgendadas.length})
            </h2>
            <div className="space-y-3">
              {consultasAgendadas.map((consulta) =>
            <Card
              key={consulta.id}
              className="hover:shadow-md transition-shadow border-l-4 border-l-blue-300">
              
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                        {consulta.horario}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg flex items-center flex-wrap gap-2">
                          {consulta.pacienteNome}
                          {consulta.modalidade === 'online' &&
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              <VideoIcon className="w-3 h-3" /> Online
                            </span>
                      }
                          {(consulta as any).pacienteNumeroContrato &&
                      <span className="text-sm text-gray-400 font-normal ml-2">
                              #{(consulta as any).pacienteNumeroContrato}
                            </span>
                      }
                          {(consulta as any).pacienteTelefone &&
                      <span className="text-sm text-gray-400 font-normal ml-2">
                              📞 {(consulta as any).pacienteTelefone}
                            </span>
                      }
                        </h3>
                        <p className="text-sm text-gray-600">
                          {consulta.tipo === 'medica' ?
                      '🩺 Médica' :
                      '🦷 Odontológica'}
                          {((consulta as any).procedimento ||
                      consulta.procedimentoNomeJoin ||
                      consulta.procedimentoNome ||
                      consulta.procedimentoAnotacoes) &&
                      <>
                              {' '}
                              •{' '}
                              <span className="text-teal-700 font-semibold">
                                📋{' '}
                                {(consulta as any).procedimento ||
                          consulta.procedimentoNomeJoin ||
                          consulta.procedimentoNome ||
                          ''}
                                {consulta.procedimentoAnotacoes &&
                          <span className="font-normal italic text-teal-600">
                                    {' '}
                                    {(consulta as any).procedimento ||
                            consulta.procedimentoNomeJoin ||
                            consulta.procedimentoNome ?
                            '- ' :
                            ''}
                                    {consulta.procedimentoAnotacoes}
                                  </span>
                          }
                              </span>
                            </>
                      }{' '}
                          • Dr(a). {consulta.profissional}
                        </p>
                      </div>
                    </div>

                    <Button
                  onClick={() => handleMarcarChegada(consulta)}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                  
                      <CarIcon className="w-4 h-4 mr-2" />
                      Chegada do Paciente
                    </Button>
                  </div>
                </Card>
            )}
            </div>
          </div>
        }

        {/* Seção: Finalizados */}
        {finalizados.length > 0 &&
        <div className="space-y-4 pt-6 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-500 flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5" />
              Finalizados Hoje ({finalizados.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {finalizados.map((consulta) =>
            <div
              key={consulta.id}
              className="bg-gray-50 border border-gray-200 rounded-lg p-3 opacity-90 hover:opacity-100 transition-opacity">
              
                  <div
                className="flex justify-between items-center cursor-pointer"
                onClick={() => handleIrParaProntuario(consulta)}>
                
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        {consulta.pacienteNome}
                        {consulta.modalidade === 'online' &&
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800">
                            <VideoIcon className="w-3 h-3" /> Online
                          </span>
                    }
                      </p>
                      <p className="text-xs text-gray-500">
                        Dr(a). {consulta.profissional}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Duração</p>
                      <p className="font-mono font-medium text-gray-700">
                        {Math.floor((consulta.tempoTotalAtendimento || 0) / 60)}{' '}
                        min
                      </p>
                    </div>
                  </div>
                  {/* ⭐ NOVO: Reabrir atendimento finalizado por engano */}
                  <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-2">
                    <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReabrirAtendimento(consulta);
                  }}
                  className="text-teal-600 border-teal-200 hover:bg-teal-50">
                  
                      <PlayIcon className="w-4 h-4 mr-1" /> Reabrir atendimento
                    </Button>
                    {consulta.modalidade === 'online' && consulta.linkVideo &&
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    entrarNaSalaOnline(consulta);
                  }}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                  
                        <VideoIcon className="w-4 h-4 mr-1" /> Reabrir Sala
                      </Button>
                }
                  </div>
                </div>
            )}
            </div>
          </div>
        }
      </div>
    </div>);

}