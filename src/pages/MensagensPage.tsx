import React, { useCallback, useEffect, useMemo, useState, useRef, Component } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { API_BASE_URL } from '../config/api';
import { formatarTelefoneWhatsApp } from '../services/whatsappMessages';
import { Swal } from '../components/ui/SweetAlert';
import { MessageCircleIcon, SearchIcon, SendIcon, UserIcon, PhoneIcon, ClockIcon, CheckIcon, CheckCheckIcon, AlertCircleIcon, Loader2Icon, MoreVerticalIcon, ArrowLeftIcon, FileTextIcon, XIcon, PhoneOffIcon, RefreshCwIcon, WrenchIcon, BugIcon, ListIcon, MessageSquareIcon, ArrowUpDownIcon, AlertTriangleIcon, InboxIcon } from 'lucide-react';
import { Paciente } from '../types';
import { useAniversarioHabilitado } from '../hooks/useAniversarioHabilitado';
import { enviarWhatsappMetaApi } from '../utils/whatsappMetaApi';
interface Mensagem {
  id: string;
  pacienteId: string;
  pacienteNome?: string;
  tipo: 'enviada' | 'recebida';
  conteudo: string;
  dataHora: string;
  status: 'enviando' | 'enviada' | 'entregue' | 'lida' | 'erro';
  erro?: string;
}
// Templates de mensagens rápidas
const TEMPLATES_MENSAGEM = [{
  id: 'saudacao',
  nome: '👋 Saudação',
  texto: 'Olá, {nome}! Tudo bem? Como posso ajudá-lo(a) hoje?'
}, {
  id: 'lembrete',
  nome: '📅 Lembrete Consulta',
  texto: 'Olá, {nome}! Lembramos que você tem uma consulta agendada conosco. Por favor, confirme sua presença respondendo SIM ou NÃO.'
}, {
  id: 'confirmacao',
  nome: '✅ Confirmação',
  texto: 'Olá, {nome}! Sua consulta foi confirmada com sucesso. Aguardamos você!'
}, {
  id: 'reagendamento',
  nome: '🔄 Reagendamento',
  texto: 'Olá, {nome}! Precisamos reagendar sua consulta. Por favor, entre em contato para escolher um novo horário.'
}, {
  id: 'cobranca',
  nome: '💰 Cobrança',
  texto: 'Olá, {nome}! Identificamos uma pendência financeira em seu cadastro. Por favor, entre em contato para regularizar.'
}, {
  id: 'resultado',
  nome: '📋 Resultado Exame',
  texto: 'Olá, {nome}! Seus resultados de exames já estão disponíveis. Entre em contato para mais informações.'
}, {
  id: 'aniversario',
  nome: '🎂 Aniversário',
  texto: 'Olá, {nome}! A equipe da clínica deseja um Feliz Aniversário! 🎉 Que seu dia seja repleto de alegrias!'
}, {
  id: 'retorno',
  nome: '🔔 Retorno',
  texto: 'Olá, {nome}! Está na hora do seu retorno. Agende sua consulta para continuarmos seu acompanhamento.'
}];

// ⭐ Tipo para as abas
type TabAtiva = 'historico' | 'chat';
export function MensagensPage() {
  const {
    sessao
  } = useAuth();
  const clinicaId = sessao?.clinicaAtual?.id || '';
  const {
    success,
    error: showError
  } = useToast();
  // Felicitação desativada nas Configurações esconde também o atalho manual
  const aniversarioHabilitado = useAniversarioHabilitado(clinicaId);
  // ⭐ NOVO: Tab ativa
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>('historico');
  // Estados
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loadingPacientes, setLoadingPacientes] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pacienteSelecionado, setPacienteSelecionado] = useState<Paciente | null>(null);
  const [mensagens, setMensagens] = useState<Map<string, Mensagem[]>>(new Map());
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [mensagemInput, setMensagemInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [migrando, setMigrando] = useState(false);
  // ⭐ NOVO: Estado para busca na tabela de histórico
  const [searchHistorico, setSearchHistorico] = useState('');
  // ⭐ NOVO: Estado para ordenação da tabela
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  // Quantas linhas do histórico são realmente renderizadas. Sem esse teto, uma
  // clínica com milhares de mensagens montava milhares de <tr> de uma vez e
  // travava a aba inteira ao abrir a tela.
  const LOTE_HISTORICO = 100;
  const [limiteHistorico, setLimiteHistorico] = useState(LOTE_HISTORICO);
  // ⭐ NOVO: Lista flat de todas as mensagens para a tabela
  const [todasMensagens, setTodasMensagens] = useState<Mensagem[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // ⭐ Scroll automático para última mensagem
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);
  // Carrega configuração do WhatsApp
  useEffect(() => {
    const carregarConfig = async () => {
      if (!clinicaId) {
        setConfigLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`);
        if (response.ok) {
          const config = await response.json();
          setWhatsappConfig(config);
        }
      } catch (err) {
        console.error('Erro ao carregar config WhatsApp:', err);
      } finally {
        setConfigLoading(false);
      }
    };
    carregarConfig();
  }, [clinicaId]);
  // Carrega pacientes
  useEffect(() => {
    const carregarPacientes = async () => {
      if (!clinicaId) return;
      setLoadingPacientes(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&limit=200`);
        if (response.ok) {
          const data = await response.json();
          const listaPacientes = data.data || [];
          setPacientes(Array.isArray(listaPacientes) ? listaPacientes : []);
          console.log(`✅ [MensagensPage] ${Array.isArray(listaPacientes) ? listaPacientes.length : 0} pacientes carregados`);
        }
      } catch (err) {
        console.error('❌ [MensagensPage] Erro ao carregar pacientes:', err);
        showError('Erro', 'Não foi possível carregar os pacientes');
      } finally {
        setLoadingPacientes(false);
      }
    };
    carregarPacientes();
  }, [clinicaId]);
  // Carrega todas as mensagens do servidor
  const carregandoMensagensRef = useRef(false);
  const carregarMensagens = useCallback(async () => {
    if (!clinicaId) return;
    if (carregandoMensagensRef.current) return;
    carregandoMensagensRef.current = true;
    setLoadingMensagens(true);
    try {
      // Traz só o trecho recente do histórico. Carregar a tabela inteira
      // (com o conteúdo de cada mensagem) era o que travava a tela.
      const response = await fetch(`${API_BASE_URL}/api/mensagens?clinicaId=${clinicaId}&limit=300`);
      if (response.ok) {
        const data = await response.json();
        console.log('📨 [MensagensPage] Mensagens carregadas:', data?.length || 0);
        // ⭐ NOVO: Salva lista flat para a tabela de histórico
        if (Array.isArray(data)) {
          setTodasMensagens(data);
        }
        // Agrupa mensagens por pacienteId
        const mensagensMap = new Map<string, Mensagem[]>();
        if (Array.isArray(data)) {
          data.forEach((msg: Mensagem) => {
            const msgs = mensagensMap.get(msg.pacienteId) || [];
            msgs.push(msg);
            mensagensMap.set(msg.pacienteId, msgs);
          });
        }
        setMensagens(mensagensMap);
      }
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoadingMensagens(false);
      carregandoMensagensRef.current = false;
    }
  }, [clinicaId]);
  // Carrega mensagens ao montar - APENAS UMA VEZ
  const mensagensCarregadasRef = useRef(false);
  useEffect(() => {
    if (clinicaId && !mensagensCarregadasRef.current) {
      mensagensCarregadasRef.current = true;
      carregarMensagens();
    }
  }, [clinicaId]);
  // ⭐ NOVO: Busca pacientes específicos que não foram encontrados na lista inicial
  const pacientesFaltantesBuscadosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const buscarPacientesFaltantes = async () => {
      if (!clinicaId || pacientes.length === 0 || mensagens.size === 0) return;
      const idsFaltantes: string[] = [];
      const nomesFaltantes: Map<string, string> = new Map();
      mensagens.forEach((msgs, pacienteId) => {
        if (pacienteId.startsWith('tel_')) return;
        if (pacienteId.startsWith('msg_')) return;
        if (pacientesFaltantesBuscadosRef.current.has(pacienteId)) return;
        const existe = pacientes.find((p) => p.id === pacienteId);
        if (!existe) {
          idsFaltantes.push(pacienteId);
          const nomeMensagem = msgs[0]?.pacienteNome;
          if (nomeMensagem) {
            nomesFaltantes.set(pacienteId, nomeMensagem);
          }
        }
      });
      if (idsFaltantes.length === 0) return;
      idsFaltantes.forEach((id) => pacientesFaltantesBuscadosRef.current.add(id));
      const pacientesEncontrados: Paciente[] = [];
      for (const id of idsFaltantes) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/pacientes/${id}?clinicaId=${clinicaId}`);
          if (response.ok) {
            const paciente = await response.json();
            pacientesEncontrados.push(paciente);
          } else {
            const nomeBusca = nomesFaltantes.get(id);
            if (nomeBusca) {
              const searchResponse = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(nomeBusca)}&limit=10`);
              if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                const resultados = searchData.data || [];
                const nomeNormalizado = normalizarNome(nomeBusca);
                const pacienteEncontrado = resultados.find((p: Paciente) => {
                  const nomeP = normalizarNome(p.nome || '');
                  return nomeP === nomeNormalizado || nomeP.includes(nomeNormalizado) || nomeNormalizado.includes(nomeP);
                });
                if (pacienteEncontrado) {
                  pacientesEncontrados.push(pacienteEncontrado);
                  try {
                    const migrateResponse = await fetch(`${API_BASE_URL}/api/mensagens/migrar-paciente`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        clinicaId,
                        pacienteIdAntigo: id,
                        pacienteIdNovo: pacienteEncontrado.id,
                        pacienteNomeNovo: pacienteEncontrado.nome
                      })
                    });
                    if (migrateResponse.ok) {
                      const migrateData = await migrateResponse.json();
                      console.log(`✅ Migradas ${migrateData.migradas} mensagens de ${id} para ${pacienteEncontrado.id}`);
                    }
                  } catch (migrateErr) {
                    console.error('❌ Erro ao migrar mensagens:', migrateErr);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error(`❌ Erro ao buscar paciente ${id}:`, err);
        }
      }
      if (pacientesEncontrados.length > 0) {
        setPacientes((prev) => {
          const novosIds = new Set(pacientesEncontrados.map((p) => p.id));
          const semDuplicatas = prev.filter((p) => !novosIds.has(p.id));
          return [...semDuplicatas, ...pacientesEncontrados];
        });
        setTimeout(() => {
          carregarMensagens();
        }, 500);
      }
    };
    buscarPacientesFaltantes();
  }, [clinicaId, mensagens.size]);
  useEffect(() => {
    pacientesFaltantesBuscadosRef.current = new Set();
  }, [clinicaId]);
  const normalizarNome = (nome: string) => {
    return nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  };
  const buscarPacientePorNome = (nomeBusca: string, listaPacientes: Paciente[]): Paciente | undefined => {
    const nomeBuscaNormalizado = normalizarNome(nomeBusca);
    let pacienteEncontrado = listaPacientes.find((p) => normalizarNome(p.nome || '') === nomeBuscaNormalizado);
    if (pacienteEncontrado) return pacienteEncontrado;
    pacienteEncontrado = listaPacientes.find((p) => {
      const nomeP = normalizarNome(p.nome || '');
      return nomeP.includes(nomeBuscaNormalizado) || nomeBuscaNormalizado.includes(nomeP);
    });
    if (pacienteEncontrado) return pacienteEncontrado;
    const palavrasBusca = nomeBuscaNormalizado.split(' ').filter((p) => p.length > 2);
    pacienteEncontrado = listaPacientes.find((p) => {
      const nomeP = normalizarNome(p.nome || '');
      return palavrasBusca.every((palavra) => nomeP.includes(palavra));
    });
    return pacienteEncontrado;
  };
  // Combina pacientes da API com "pacientes virtuais" das mensagens
  const pacientesComMensagens = useMemo(() => {
    const pacientesMap = new Map<string, Paciente>();
    pacientes.forEach((p) => {
      pacientesMap.set(p.id, p);
    });
    const pacientesPorTelefone = new Map<string, Paciente>();
    const pacientesPorNome = new Map<string, Paciente>();
    pacientes.forEach((p) => {
      if (p.nome) {
        const nomeNorm = normalizarNome(p.nome);
        pacientesPorNome.set(nomeNorm, p);
      }
      if (p.telefone) {
        const telLimpo = p.telefone.replace(/\D/g, '');
        const ultimos9 = telLimpo.slice(-9);
        pacientesPorTelefone.set(telLimpo, p);
        pacientesPorTelefone.set(ultimos9, p);
        if (telLimpo.length >= 10) {
          pacientesPorTelefone.set(telLimpo.slice(-10), p);
          pacientesPorTelefone.set(telLimpo.slice(-11), p);
        }
      }
    });
    mensagens.forEach((msgs, pacienteId) => {
      if (pacientesMap.has(pacienteId)) return;
      if (msgs.length > 0) {
        const primeiraMensagem = msgs[0];
        const nomeMensagem = primeiraMensagem.pacienteNome || '';
        const pacienteDireto = pacientes.find((p) => p.id === pacienteId);
        if (pacienteDireto) {
          pacientesMap.set(pacienteId, pacienteDireto);
          return;
        }
        if (nomeMensagem) {
          const nomeNorm = normalizarNome(nomeMensagem);
          const pacientePorNome2 = pacientesPorNome.get(nomeNorm);
          if (pacientePorNome2) {
            pacientesMap.set(pacienteId, {
              ...pacientePorNome2,
              id: pacienteId
            });
            return;
          }
        }
        if (pacienteId.startsWith('tel_')) {
          const telefone = pacienteId.replace('tel_', '');
          const ultimos9 = telefone.slice(-9);
          const pacienteReal = pacientesPorTelefone.get(telefone) || pacientesPorTelefone.get(ultimos9) || pacientesPorTelefone.get(telefone.slice(-10)) || pacientesPorTelefone.get(telefone.slice(-11));
          if (pacienteReal) return;
        }
        const pacienteReal = buscarPacientePorNome(nomeMensagem, pacientes);
        if (pacienteReal) {
          pacientesMap.set(pacienteId, {
            ...pacienteReal,
            id: pacienteId
          });
        } else {
          const pacienteVirtual: Paciente = {
            id: pacienteId,
            nome: nomeMensagem || `Paciente ${pacienteId}`,
            telefone: pacienteId.startsWith('tel_') ? pacienteId.replace('tel_', '') : '',
            cpf: '',
            email: '',
            criadoEm: primeiraMensagem.dataHora
          };
          pacientesMap.set(pacienteId, pacienteVirtual);
        }
      }
    });
    return Array.from(pacientesMap.values());
  }, [pacientes, mensagens]);
  const mapeamentoIds = useMemo(() => {
    const mapa = new Map<string, string>();
    const pacientesPorTelefone = new Map<string, Paciente>();
    const pacientesPorNome = new Map<string, Paciente>();
    pacientes.forEach((p) => {
      if (p.nome) {
        pacientesPorNome.set(normalizarNome(p.nome), p);
      }
      if (p.telefone) {
        const telLimpo = p.telefone.replace(/\D/g, '');
        const ultimos9 = telLimpo.slice(-9);
        pacientesPorTelefone.set(telLimpo, p);
        pacientesPorTelefone.set(ultimos9, p);
        if (telLimpo.length >= 10) {
          pacientesPorTelefone.set(telLimpo.slice(-10), p);
          pacientesPorTelefone.set(telLimpo.slice(-11), p);
        }
      }
    });
    mensagens.forEach((msgs, pacienteId) => {
      if (!pacientes.find((p) => p.id === pacienteId) && msgs.length > 0) {
        const primeiraMensagem = msgs[0];
        const nomeMensagem = primeiraMensagem.pacienteNome || '';
        if (nomeMensagem) {
          const nomeNorm = normalizarNome(nomeMensagem);
          const pacientePorNome2 = pacientesPorNome.get(nomeNorm);
          if (pacientePorNome2) {
            mapa.set(pacienteId, pacientePorNome2.id);
            return;
          }
        }
        if (pacienteId.startsWith('tel_')) {
          const telefone = pacienteId.replace('tel_', '');
          const ultimos9 = telefone.slice(-9);
          const pacienteReal = pacientesPorTelefone.get(telefone) || pacientesPorTelefone.get(ultimos9) || pacientesPorTelefone.get(telefone.slice(-10)) || pacientesPorTelefone.get(telefone.slice(-11));
          if (pacienteReal) {
            mapa.set(pacienteId, pacienteReal.id);
            return;
          }
        }
        const pacienteReal = buscarPacientePorNome(nomeMensagem, pacientes);
        if (pacienteReal) {
          mapa.set(pacienteId, pacienteReal.id);
        }
      }
    });
    return mapa;
  }, [pacientes, mensagens]);
  const mensagensCombinadas = useMemo(() => {
    const novoMapa = new Map<string, Mensagem[]>();
    mensagens.forEach((msgs, pacienteId) => {
      const idReal = mapeamentoIds.get(pacienteId) || pacienteId;
      const msgsExistentes = novoMapa.get(idReal) || [];
      const todasMsgs = [...msgsExistentes, ...msgs].sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
      novoMapa.set(idReal, todasMsgs);
    });
    return novoMapa;
  }, [mensagens, mapeamentoIds]);
  const mensagensOrfas = useMemo(() => {
    const orfas: Array<{
      pacienteIdAntigo: string;
      pacienteIdNovo: string;
      pacienteNome: string;
      quantidade: number;
      telefone?: string;
    }> = [];
    mapeamentoIds.forEach((pacienteIdNovo, pacienteIdAntigo) => {
      const msgs = mensagens.get(pacienteIdAntigo) || [];
      if (msgs.length > 0) {
        const pacienteReal = pacientes.find((p) => p.id === pacienteIdNovo);
        orfas.push({
          pacienteIdAntigo,
          pacienteIdNovo,
          pacienteNome: pacienteReal?.nome || msgs[0]?.pacienteNome || 'Desconhecido',
          quantidade: msgs.length,
          telefone: pacienteReal?.telefone
        });
      }
    });
    mensagens.forEach((msgs, pacienteId) => {
      if (pacienteId.startsWith('tel_') && !mapeamentoIds.has(pacienteId) && msgs.length > 0) {
        const telefone = pacienteId.replace('tel_', '');
        const nomeMensagem = msgs[0]?.pacienteNome || `Telefone ${telefone}`;
        const pacienteReal = buscarPacientePorNome(nomeMensagem, pacientes);
        if (pacienteReal) {
          orfas.push({
            pacienteIdAntigo: pacienteId,
            pacienteIdNovo: pacienteReal.id,
            pacienteNome: pacienteReal.nome,
            quantidade: msgs.length,
            telefone: pacienteReal.telefone || telefone
          });
        } else {
          orfas.push({
            pacienteIdAntigo: pacienteId,
            pacienteIdNovo: '',
            pacienteNome: nomeMensagem,
            quantidade: msgs.length,
            telefone: telefone
          });
        }
      }
    });
    return orfas;
  }, [mapeamentoIds, mensagens, pacientes]);
  const handleMigrarMensagens = async () => {
    if (mensagensOrfas.length === 0) {
      showError('Nada a migrar', 'Não há mensagens órfãs para corrigir.');
      return;
    }
    const comPaciente = mensagensOrfas.filter((o) => o.pacienteIdNovo);
    const semPaciente = mensagensOrfas.filter((o) => !o.pacienteIdNovo);
    let htmlContent = '';
    if (comPaciente.length > 0) {
      htmlContent += `<p><strong>${comPaciente.length}</strong> associação(ões) automática(s):</p>
        <ul style="text-align: left; margin: 10px 0; font-size: 13px;">
          ${comPaciente.map((o) => `<li>📱 ${o.pacienteNome}: ${o.quantidade} msg(s)</li>`).join('')}
        </ul>`;
    }
    if (semPaciente.length > 0) {
      htmlContent += `<p style="color: #f59e0b;"><strong>${semPaciente.length}</strong> mensagem(ns) sem paciente identificado:</p>
        <ul style="text-align: left; margin: 10px 0; font-size: 13px; color: #f59e0b;">
          ${semPaciente.map((o) => `<li>⚠️ ${o.pacienteNome} (tel: ${o.telefone}): ${o.quantidade} msg(s)</li>`).join('')}
        </ul>
        <p style="font-size: 12px; color: #666;">Dica: Cadastre o telefone <strong>${semPaciente[0]?.telefone}</strong> no paciente correto primeiro.</p>`;
    }
    const result = await Swal.fire({
      icon: 'question',
      title: 'Corrigir mensagens órfãs?',
      html: htmlContent,
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280',
      confirmButtonText: comPaciente.length > 0 ? 'Sim, corrigir' : 'Entendi',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed || comPaciente.length === 0) return;
    setMigrando(true);
    let totalMigradas = 0;
    let erros = 0;
    try {
      for (const orfa of comPaciente) {
        try {
          const pacienteReal = pacientes.find((p) => p.id === orfa.pacienteIdNovo);
          const response = await fetch(`${API_BASE_URL}/api/mensagens/migrar-paciente`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId,
              pacienteIdAntigo: orfa.pacienteIdAntigo,
              pacienteIdNovo: orfa.pacienteIdNovo,
              pacienteNomeNovo: pacienteReal?.nome
            })
          });
          if (response.ok) {
            const data = await response.json();
            totalMigradas += data.migradas || 0;
            if (!pacienteReal?.telefone && orfa.telefone) {
              try {
                await fetch(`${API_BASE_URL}/api/pacientes/${orfa.pacienteIdNovo}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    clinicaId,
                    telefone: orfa.telefone
                  })
                });
              } catch (e) {
                console.error('Erro ao atualizar telefone:', e);
              }
            }
          } else {
            erros++;
          }
        } catch (err) {
          erros++;
        }
      }
      if (totalMigradas > 0) {
        success('Mensagens corrigidas!', `${totalMigradas} mensagem(ns) foram associadas aos pacientes corretos.`);
        await carregarMensagens();
        const response = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&limit=200`);
        if (response.ok) {
          const data = await response.json();
          setPacientes(Array.isArray(data.data) ? data.data : []);
        }
      }
      if (erros > 0) {
        showError('Alguns erros', `${erros} migração(ões) falharam. Verifique o console.`);
      }
    } catch (err: any) {
      showError('Erro', err.message || 'Erro ao migrar mensagens');
    } finally {
      setMigrando(false);
    }
  };
  const handleDiagnostico = async () => {
    const termoBusca = searchTerm.trim() || searchHistorico.trim() || 'MARA LIGIA';
    const termoBuscaUpper = termoBusca.toUpperCase();
    const termoBuscaNorm = normalizarNome(termoBusca);
    let pacientesAPI: Paciente[] = [];
    try {
      const apiResponse = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(termoBusca)}&limit=50`);
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        pacientesAPI = apiData.data || [];
      }
    } catch (err) {
      console.error('❌ [Diagnóstico] Erro na busca direta:', err);
    }
    const pacientesLocais = pacientes.filter((p) => {
      const nomeUpper = (p.nome || '').toUpperCase();
      const nomeNorm = normalizarNome(p.nome || '');
      return nomeUpper.includes(termoBuscaUpper) || nomeNorm.includes(termoBuscaNorm);
    });
    const mensagensEncontradas: Array<{
      pacienteId: string;
      pacienteNome: string;
      quantidade: number;
    }> = [];
    mensagens.forEach((msgs, pacienteId) => {
      const temNome = msgs.some((m) => (m.pacienteNome || '').toUpperCase().includes(termoBuscaUpper));
      if (temNome) {
        mensagensEncontradas.push({
          pacienteId,
          pacienteNome: msgs[0]?.pacienteNome || 'Desconhecido',
          quantidade: msgs.length
        });
      }
    });
    let html = `<div style="text-align: left; font-size: 13px; max-height: 400px; overflow-y: auto;">
      <h4>🔍 Diagnóstico para "${termoBusca}"</h4>
      <p><strong>API:</strong> ${pacientesAPI.length} resultado(s)</p>
      <p><strong>Local:</strong> ${pacientesLocais.length} resultado(s)</p>
      <p><strong>Mensagens:</strong> ${mensagensEncontradas.length} conversa(s)</p>
      ${mensagensEncontradas.map((m) => `<p style="font-size:12px">• ${m.pacienteNome} (${m.quantidade} msgs, ID: ${m.pacienteId.substring(0, 12)}...)</p>`).join('')}
    </div>`;
    await Swal.fire({
      icon: 'info',
      title: '🔧 Diagnóstico',
      html,
      width: 550,
      confirmButtonText: 'Fechar',
      confirmButtonColor: '#16a34a'
    });
  };
  const normalizarTexto = (texto: string) => {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };
  const pacientesFiltrados = useMemo(() => {
    if (!Array.isArray(pacientesComMensagens)) return [];
    if (!searchTerm.trim()) return pacientesComMensagens;
    const termoNormalizado = normalizarTexto(searchTerm);
    const pacientesReaisFiltrados = pacientes.filter((p) => {
      const nomeNormalizado = normalizarTexto(p.nome || '');
      const telefone = p.telefone || '';
      const cpf = p.cpf || '';
      return nomeNormalizado.includes(termoNormalizado) || telefone.includes(searchTerm) || cpf.includes(searchTerm);
    });
    if (pacientesReaisFiltrados.length > 0) return pacientesReaisFiltrados;
    return pacientesComMensagens.filter((p) => {
      const nomeNormalizado = normalizarTexto(p.nome || '');
      const telefone = p.telefone || '';
      const cpf = p.cpf || '';
      return nomeNormalizado.includes(termoNormalizado) || telefone.includes(searchTerm) || cpf.includes(searchTerm);
    });
  }, [pacientesComMensagens, pacientes, searchTerm]);
  const pacientesOrdenados = useMemo(() => {
    if (!Array.isArray(pacientesFiltrados)) return [];
    const pacientesUnicos = new Map<string, Paciente>();
    pacientesFiltrados.forEach((p) => {
      const nomeNorm = normalizarNome(p.nome || '');
      const existente = pacientesUnicos.get(nomeNorm);
      if (!existente || !existente.telefone && p.telefone) {
        pacientesUnicos.set(nomeNorm, p);
      }
    });
    const listaUnica = Array.from(pacientesUnicos.values());
    return listaUnica.sort((a, b) => {
      const aTemTelefone = !!(a.telefone && a.telefone.trim() !== '');
      const bTemTelefone = !!(b.telefone && b.telefone.trim() !== '');
      if (aTemTelefone && !bTemTelefone) return -1;
      if (!aTemTelefone && bTemTelefone) return 1;
      const msgsA = mensagensCombinadas.get(a.id) || [];
      const msgsB = mensagensCombinadas.get(b.id) || [];
      const ultimaA = msgsA[msgsA.length - 1];
      const ultimaB = msgsB[msgsB.length - 1];
      if (ultimaA && !ultimaB) return -1;
      if (!ultimaA && ultimaB) return 1;
      if (ultimaA && ultimaB) {
        return new Date(ultimaB.dataHora).getTime() - new Date(ultimaA.dataHora).getTime();
      }
      return (a.nome || '').localeCompare(b.nome || '');
    });
  }, [pacientesFiltrados, mensagensCombinadas]);
  const mensagensPaciente = useMemo(() => {
    if (!pacienteSelecionado) return [];
    return mensagensCombinadas.get(pacienteSelecionado.id) || [];
  }, [pacienteSelecionado, mensagensCombinadas]);
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [mensagensPaciente, pacienteSelecionado, scrollToBottom]);
  const handleEnviarMensagem = async (texto?: string) => {
    const mensagemTexto = texto || mensagemInput.trim();
    if (!mensagemTexto || !pacienteSelecionado) return;
    // ⭐ O WAHA deixou de ser obrigatório: quando ele não está configurado, a
    // resposta sai pelo WhatsApp OFICIAL (Meta). Sem isso, um paciente que
    // escreveu pelo número oficial não tinha como ser respondido — a clínica
    // via a mensagem e a tela bloqueava o envio.
    const temWaha = Boolean(whatsappConfig?.serverUrl && whatsappConfig?.sessionName);
    if (!pacienteSelecionado.telefone) {
      showError('Sem telefone', 'Este paciente não possui telefone cadastrado.');
      return;
    }
    if (!clinicaId) {
      showError('Erro de configuração', 'Clínica não identificada. Faça logout e login novamente.');
      return;
    }
    setEnviando(true);
    setShowTemplates(false);
    const tempId = `msg_temp_${Date.now()}`;
    const novaMensagem: Mensagem = {
      id: tempId,
      pacienteId: pacienteSelecionado.id,
      pacienteNome: pacienteSelecionado.nome,
      tipo: 'enviada',
      conteudo: mensagemTexto,
      dataHora: new Date().toISOString(),
      status: 'enviando'
    };
    setMensagens((prev) => {
      const novoMap = new Map(prev);
      const msgs = novoMap.get(pacienteSelecionado.id) || [];
      novoMap.set(pacienteSelecionado.id, [...msgs, novaMensagem]);
      return novoMap;
    });
    setMensagemInput('');
    try {
      const telefone = formatarTelefoneWhatsApp(pacienteSelecionado.telefone);
      if (temWaha) {
        const response = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl: whatsappConfig!.serverUrl,
            sessionName: whatsappConfig!.sessionName,
            number: telefone.numero,
            message: mensagemTexto,
            clinicaId: clinicaId,
            pacienteId: pacienteSelecionado.id,
            pacienteNome: pacienteSelecionado.nome
          })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erro ao enviar mensagem');
        }
      } else {
        // Texto livre pela Meta só é entregue DENTRO da janela de 24h — que é
        // exatamente o caso aqui: o paciente acabou de escrever.
        const envio = await enviarWhatsappMetaApi({
          clinicaId: clinicaId!,
          telefone: pacienteSelecionado.telefone,
          mensagem: mensagemTexto,
          pacienteId: pacienteSelecionado.id,
          pacienteNome: pacienteSelecionado.nome
        });
        if (!envio.success) {
          throw new Error(
            `${envio.error || 'Falha ao enviar pelo WhatsApp oficial.'} A resposta livre só é entregue até 24h após a última mensagem do paciente.`
          );
        }
      }
      setMensagens((prev) => {
        const novoMap = new Map(prev);
        const msgs = novoMap.get(pacienteSelecionado.id) || [];
        const msgIndex = msgs.findIndex((m) => m.id === tempId);
        if (msgIndex >= 0) {
          msgs[msgIndex] = {
            ...msgs[msgIndex],
            status: 'enviada'
          };
          novoMap.set(pacienteSelecionado.id, [...msgs]);
        }
        return novoMap;
      });
      success('Mensagem enviada', 'Mensagem enviada com sucesso!');
      setTimeout(() => carregarMensagens(), 1000);
    } catch (err: any) {
      setMensagens((prev) => {
        const novoMap = new Map(prev);
        const msgs = novoMap.get(pacienteSelecionado.id) || [];
        const msgIndex = msgs.findIndex((m) => m.id === tempId);
        if (msgIndex >= 0) {
          msgs[msgIndex] = {
            ...msgs[msgIndex],
            status: 'erro',
            erro: err.message
          };
          novoMap.set(pacienteSelecionado.id, [...msgs]);
        }
        return novoMap;
      });
      showError('Erro ao enviar', err.message);
    } finally {
      setEnviando(false);
    }
  };
  const handleAplicarTemplate = (template: (typeof TEMPLATES_MENSAGEM)[0]) => {
    if (!pacienteSelecionado) return;
    const texto = template.texto.replace(/{nome}/g, pacienteSelecionado.nome.split(' ')[0]);
    setMensagemInput(texto);
    setShowTemplates(false);
    inputRef.current?.focus();
  };
  const handleSelecionarPaciente = async (paciente: Paciente) => {
    let pacienteParaSelecionar = paciente;
    if (!paciente.telefone || paciente.telefone.trim() === '') {
      try {
        const response = await fetch(`${API_BASE_URL}/api/pacientes/${paciente.id}?clinicaId=${clinicaId}`);
        if (response.ok) {
          const pacienteAPI = await response.json();
          if (pacienteAPI && pacienteAPI.telefone) {
            pacienteParaSelecionar = pacienteAPI;
            setPacientes((prev) => {
              const existe = prev.find((p) => p.id === pacienteAPI.id);
              if (existe) return prev.map((p) => p.id === pacienteAPI.id ? pacienteAPI : p);
              return [...prev, pacienteAPI];
            });
          }
        } else {
          const searchResponse = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(paciente.nome)}&limit=10`);
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const resultados = searchData.data || [];
            const nomeNormalizado = normalizarNome(paciente.nome);
            const pacienteEncontrado = resultados.find((p: Paciente) => {
              const nomeP = normalizarNome(p.nome || '');
              return nomeP === nomeNormalizado || nomeP.includes(nomeNormalizado) || nomeNormalizado.includes(nomeP);
            });
            if (pacienteEncontrado && pacienteEncontrado.telefone) {
              pacienteParaSelecionar = pacienteEncontrado;
              setPacientes((prev) => {
                const existe = prev.find((p) => p.id === pacienteEncontrado.id);
                if (existe) return prev.map((p) => p.id === pacienteEncontrado.id ? pacienteEncontrado : p);
                return [...prev, pacienteEncontrado];
              });
            }
          }
        }
      } catch (err) {
        console.error('❌ Erro ao buscar paciente na API:', err);
      }
      if (!pacienteParaSelecionar.telefone) {
        const pacienteReal = pacientes.find((p) => {
          const nomeNorm1 = normalizarNome(p.nome || '');
          const nomeNorm2 = normalizarNome(paciente.nome || '');
          return nomeNorm1 === nomeNorm2;
        });
        if (pacienteReal && pacienteReal.telefone) {
          pacienteParaSelecionar = pacienteReal;
        }
      }
    }
    setPacienteSelecionado(pacienteParaSelecionar);
    setMobileShowChat(true);
  };
  const handleVoltarLista = () => {
    setMobileShowChat(false);
  };
  const handleLimparConversa = async () => {
    if (!pacienteSelecionado) return;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Limpar conversa?',
      text: `Deseja apagar todo o histórico de mensagens com ${pacienteSelecionado.nome}?`,
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sim, limpar',
      cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
      try {
        await fetch(`${API_BASE_URL}/api/mensagens?clinicaId=${clinicaId}&pacienteId=${pacienteSelecionado.id}`, {
          method: 'DELETE'
        });
        setMensagens((prev) => {
          const novoMap = new Map(prev);
          novoMap.delete(pacienteSelecionado.id);
          return novoMap;
        });
        success('Conversa limpa', 'Histórico de mensagens removido.');
      } catch (err) {
        showError('Erro', 'Não foi possível limpar a conversa.');
      }
    }
  };
  const formatarDataHora = (dataHora: string) => {
    const data = new Date(dataHora);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    if (data.toDateString() === hoje.toDateString()) {
      return data.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (data.toDateString() === ontem.toDateString()) {
      return 'Ontem ' + data.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return data.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit'
      }) + ' ' + data.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };
  const formatarDataHoraCompleta = (dataHora: string) => {
    const data = new Date(dataHora);
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + data.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const renderizarConteudoMensagem = (conteudo: string) => {
    const mediaMatch = conteudo.match(/^\[MEDIA:(image|video|audio|ptt|document):([^\]]+)\](.*)$/s);
    if (mediaMatch) {
      const [, tipo, url, legenda] = mediaMatch;
      const urlCompleta = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
      if (tipo === 'image') {
        return <div>
            <img src={urlCompleta} alt="Imagem recebida" className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity" style={{
            maxHeight: '300px'
          }} onClick={() => window.open(urlCompleta, '_blank')} onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.parentElement?.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-500 italic">📷 Imagem não disponível</p>');
          }} />
            
            {legenda && <p className="text-sm text-gray-900 mt-1">{legenda.trim()}</p>}
          </div>;
      }
      if (tipo === 'video') {
        return <div>
            <video src={urlCompleta} controls playsInline preload="metadata" className="max-w-full rounded-lg" style={{
            maxHeight: '300px',
            minWidth: '200px',
            backgroundColor: '#000'
          }} />
            
            {legenda && <p className="text-sm text-gray-900 mt-1">{legenda.trim()}</p>}
          </div>;
      }
      if (tipo === 'audio' || tipo === 'ptt') {
        return <div>
            <audio src={urlCompleta} controls className="w-full">
              Seu navegador não suporta áudio.
            </audio>
            {legenda && <p className="text-sm text-gray-900 mt-1">{legenda.trim()}</p>}
          </div>;
      }
      return <div>
          <a href={urlCompleta} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:text-blue-800">
            
            <FileTextIcon className="w-5 h-5" />
            <span className="text-sm underline">Abrir documento</span>
          </a>
          {legenda && <p className="text-sm text-gray-900 mt-1">{legenda.trim()}</p>}
        </div>;
    }
    if (conteudo.startsWith('[📷') || conteudo.startsWith('[🎵') || conteudo.startsWith('[📹')) {
      return <p className="text-sm text-gray-500 italic">{conteudo}</p>;
    }
    return <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
        {conteudo}
      </p>;
  };
  const renderStatusIcon = (status: Mensagem['status']) => {
    switch (status) {
      case 'enviando':
        return <ClockIcon className="w-3 h-3 text-gray-400" />;
      case 'enviada':
        return <CheckIcon className="w-3 h-3 text-gray-400" />;
      case 'entregue':
        return <CheckCheckIcon className="w-3 h-3 text-gray-400" />;
      case 'lida':
        return <CheckCheckIcon className="w-3 h-3 text-blue-500" />;
      case 'erro':
        return <AlertCircleIcon className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };
  const renderStatusBadge = (status: string) => {
    const configs: Record<string, {
      bg: string;
      text: string;
      label: string;
    }> = {
      enviando: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        label: 'Enviando'
      },
      enviada: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        label: 'Enviada'
      },
      entregue: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        label: 'Entregue'
      },
      lida: {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        label: 'Lida'
      },
      erro: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        label: 'Erro'
      },
      pendente: {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        label: 'Pendente'
      },
      fechado: {
        bg: 'bg-gray-100',
        text: 'text-gray-600',
        label: 'Fechado'
      }
    };
    const config = configs[status] || {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      label: status
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        
        {config.label}
      </span>;
  };
  const renderTipoBadge = (tipo: string) => {
    if (tipo === 'enviada') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          <SendIcon className="w-3 h-3 mr-1" />
          Enviada
        </span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
        <InboxIcon className="w-3 h-3 mr-1" />
        Recebida
      </span>;
  };
  const getUltimaMensagem = (pacienteId: string) => {
    const msgs = mensagensCombinadas.get(pacienteId) || [];
    return msgs[msgs.length - 1];
  };
  // ⭐ NOVO: Mensagens filtradas e ordenadas para a tabela de histórico
  const mensagensHistorico = useMemo(() => {
    let lista = [...todasMensagens];
    // Filtra por busca
    if (searchHistorico.trim()) {
      const termoNorm = normalizarTexto(searchHistorico);
      lista = lista.filter((msg) => {
        const nomeNorm = normalizarTexto(msg.pacienteNome || '');
        const conteudoNorm = normalizarTexto(msg.conteudo || '');
        return nomeNorm.includes(termoNorm) || conteudoNorm.includes(termoNorm);
      });
    }
    // Ordena
    lista.sort((a, b) => {
      const dateA = new Date(a.dataHora).getTime();
      const dateB = new Date(b.dataHora).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    return lista;
  }, [todasMensagens, searchHistorico, sortOrder]);
  // Nova busca/ordenação recomeça do primeiro lote.
  useEffect(() => {
    setLimiteHistorico(LOTE_HISTORICO);
  }, [searchHistorico, sortOrder, todasMensagens.length]);
  const historicoVisivel = useMemo(() => mensagensHistorico.slice(0, limiteHistorico), [mensagensHistorico, limiteHistorico]);
  // ⭐ NOVO: Ao clicar numa linha da tabela, abre o chat com o paciente
  const handleRowClickHistorico = (msg: Mensagem) => {
    const paciente = pacientesComMensagens.find((p) => p.id === msg.pacienteId) || pacientes.find((p) => p.id === msg.pacienteId);
    if (paciente) {
      handleSelecionarPaciente(paciente);
      setTabAtiva('chat');
    }
  };
  const whatsappConfigurado = !!(whatsappConfig && whatsappConfig.serverUrl);
  // Loading inicial
  if (configLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2Icon className="w-8 h-8 text-green-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Carregando...</p>
        </div>
      </div>;
  }
  return <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MessageCircleIcon className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Mensagens WhatsApp
            </h1>
            <p className="text-gray-500 text-xs">
              {todasMensagens.length} mensagem(ns) •{' '}
              {pacientesComMensagens.length} pacientes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDiagnostico} className="flex items-center gap-2 border-blue-300 text-blue-600 hover:bg-blue-50" title="Diagnosticar problemas com pacientes">
            
            <BugIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Diagnóstico</span>
          </Button>

          {mensagensOrfas.length > 0 && <Button variant="outline" size="sm" onClick={handleMigrarMensagens} disabled={migrando} className="flex items-center gap-2 border-orange-300 text-orange-600 hover:bg-orange-50" title={`${mensagensOrfas.length} paciente(s) com mensagens órfãs`}>
            
              {migrando ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <WrenchIcon className="w-4 h-4" />}
              Corrigir (
              {mensagensOrfas.reduce((acc, o) => acc + o.quantidade, 0)})
            </Button>}
          <Button variant="outline" size="sm" onClick={carregarMensagens} disabled={loadingMensagens} className="flex items-center gap-2">
            
            <RefreshCwIcon className={`w-4 h-4 ${loadingMensagens ? 'animate-spin' : ''}`} />
            
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* ⭐ NOVO: Tabs */}
      <div className="flex items-center gap-1 mb-2 border-b border-gray-200">
        <button onClick={() => setTabAtiva('historico')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tabAtiva === 'historico' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
          
          <ListIcon className="w-4 h-4" />
          Histórico de Mensagens
          {todasMensagens.length > 0 && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${tabAtiva === 'historico' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            
              {todasMensagens.length}
            </span>}
        </button>
        <button onClick={() => setTabAtiva('chat')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tabAtiva === 'chat' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
          
          <MessageSquareIcon className="w-4 h-4" />
          Chat WhatsApp
          {!whatsappConfigurado && <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />}
        </button>
      </div>

      {/* ⭐ TAB: HISTÓRICO DE MENSAGENS */}
      {tabAtiva === 'historico' && <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Barra de busca e filtros */}
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" placeholder="Buscar por paciente ou conteúdo..." value={searchHistorico} onChange={(e) => setSearchHistorico(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            
              {searchHistorico && <button onClick={() => setSearchHistorico('')} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
              
                  <XIcon className="w-4 h-4" />
                </button>}
            </div>
            <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" title={sortOrder === 'desc' ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}>
            
              <ArrowUpDownIcon className="w-4 h-4" />
              {sortOrder === 'desc' ? 'Recentes' : 'Antigas'}
            </button>
            {searchHistorico && <span className="text-xs text-gray-500">
                {mensagensHistorico.length} resultado(s)
              </span>}
          </div>

          {/* Tabela */}
          <div className="flex-1 overflow-auto rounded-lg border border-gray-200 bg-white">
            {loadingMensagens ? <div className="flex items-center justify-center py-16">
                <Loader2Icon className="w-6 h-6 text-green-600 animate-spin mr-2" />
                <span className="text-gray-500">Carregando mensagens...</span>
              </div> : mensagensHistorico.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageCircleIcon className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">
                  {searchHistorico ? 'Nenhuma mensagem encontrada' : 'Nenhuma mensagem registrada'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {searchHistorico ? 'Tente buscar por outro termo' : 'As mensagens enviadas e recebidas aparecerão aqui'}
                </p>
              </div> : <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                      Paciente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conteúdo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                      Data/Hora
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historicoVisivel.map((msg) => <tr key={msg.id} onClick={() => handleRowClickHistorico(msg)} className="hover:bg-green-50/50 cursor-pointer transition-colors">
                
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(msg.pacienteNome || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900 truncate max-w-[140px]">
                            {msg.pacienteNome || 'Desconhecido'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{renderTipoBadge(msg.tipo)}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700 truncate max-w-xs lg:max-w-md xl:max-w-lg">
                          {msg.conteudo.startsWith('[MEDIA:') ? '📎 Mídia' : msg.conteudo.substring(0, 80) + (msg.conteudo.length > 80 ? '...' : '')}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 whitespace-nowrap">
                          {formatarDataHoraCompleta(msg.dataHora)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {renderStatusBadge(msg.status)}
                      </td>
                    </tr>)}
                </tbody>
              </table>}
            {!loadingMensagens && mensagensHistorico.length > historicoVisivel.length && <div className="flex items-center justify-center gap-3 py-4 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  Mostrando {historicoVisivel.length} de{' '}
                  {mensagensHistorico.length} mensagens
                </span>
                <button onClick={() => setLimiteHistorico((l) => l + LOTE_HISTORICO)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
              
                  Carregar mais
                </button>
              </div>}
            {!loadingMensagens && todasMensagens.length >= 300 && <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
                Exibindo as 300 mensagens mais recentes da clínica. Use a busca
                para localizar um paciente ou abra a conversa dele para ver o
                diálogo completo.
              </p>}
          </div>
        </div>}

      {/* ⭐ TAB: CHAT WHATSAPP */}
      {tabAtiva === 'chat' && <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Banner de aviso se WhatsApp não configurado */}
          {!whatsappConfigurado && <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-2">
              <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-amber-800 font-medium">
                  WhatsApp não configurado
                </p>
                <p className="text-xs text-amber-600">
                  Configure o WhatsApp em Configurações para enviar mensagens.
                  Você ainda pode visualizar o histórico.
                </p>
              </div>
            </div>}

          {/* Container Principal do Chat */}
          <div className="flex-1 flex overflow-hidden min-h-0 rounded-lg border border-gray-200 shadow-sm">
            {/* Lista de Pacientes (Sidebar) */}
            <div className={`w-full md:w-72 lg:w-80 border-r border-gray-200 flex flex-col bg-white ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
            
              {/* Busca */}
              <div className="p-2 border-b border-gray-200 bg-gray-50">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="text" placeholder="Buscar paciente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                
                  {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  
                      <XIcon className="w-4 h-4" />
                    </button>}
                </div>
                {searchTerm && <p className="text-xs text-gray-500 mt-1">
                    {pacientesFiltrados.length} resultado(s)
                  </p>}
              </div>

              {/* Lista de Conversas */}
              <div className="flex-1 overflow-y-auto">
                {loadingPacientes ? <div className="flex items-center justify-center py-12">
                    <Loader2Icon className="w-6 h-6 text-green-600 animate-spin" />
                  </div> : pacientesOrdenados.length === 0 ? <div className="text-center py-12 px-4">
                    <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm font-medium">
                      {searchTerm ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
                    </p>
                  </div> : pacientesOrdenados.map((paciente) => {
              const ultimaMensagem = getUltimaMensagem(paciente.id);
              const isSelected = pacienteSelecionado?.id === paciente.id;
              const temTelefone = !!(paciente.telefone && paciente.telefone.trim() !== '');
              return <button key={paciente.id} onClick={() => handleSelecionarPaciente(paciente)} className={`w-full p-2.5 flex items-start gap-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left ${isSelected ? 'bg-green-50 border-l-4 border-l-green-500' : ''} ${!temTelefone ? 'opacity-60' : ''}`}>
                    
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm ${temTelefone ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gray-400'}`}>
                      
                          {(paciente.nome || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium text-gray-900 truncate text-sm">
                              {paciente.nome}
                            </h3>
                            {ultimaMensagem && <span className="text-[10px] text-gray-500 flex-shrink-0">
                                {formatarDataHora(ultimaMensagem.dataHora)}
                              </span>}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {temTelefone ? ultimaMensagem ? <>
                                  {ultimaMensagem.tipo === 'enviada' && renderStatusIcon(ultimaMensagem.status)}
                                  <p className="text-xs text-gray-500 truncate">
                                    {ultimaMensagem.conteudo}
                                  </p>
                                </> : <p className="text-xs text-gray-400 flex items-center gap-1">
                                  <PhoneIcon className="w-3 h-3" />
                                  {paciente.telefone}
                                </p> : <p className="text-xs text-red-400 flex items-center gap-1">
                                <PhoneOffIcon className="w-3 h-3" />
                                Sem telefone
                              </p>}
                          </div>
                        </div>
                      </button>;
            })}
              </div>
            </div>

            {/* Área do Chat */}
            <div className={`flex-1 flex flex-col bg-gray-100 ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
            
              {pacienteSelecionado ? <>
                  {/* Header do Chat */}
                  <div className="p-2 border-b border-gray-200 flex items-center gap-2 bg-white">
                    <button onClick={handleVoltarLista} className="md:hidden p-1.5 hover:bg-gray-100 rounded-lg">
                  
                      <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${pacienteSelecionado.telefone ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gray-400'}`}>
                  
                      {(pacienteSelecionado.nome || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate text-sm">
                        {pacienteSelecionado.nome}
                      </h3>
                      {pacienteSelecionado.telefone ? <p className="text-xs text-gray-500 flex items-center gap-1">
                          <PhoneIcon className="w-3 h-3" />
                          {pacienteSelecionado.telefone}
                        </p> : <p className="text-xs text-red-500 flex items-center gap-1">
                          <PhoneOffIcon className="w-3 h-3" />
                          Sem telefone
                        </p>}
                    </div>
                    <button onClick={handleLimparConversa} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500" title="Limpar conversa">
                  
                      <MoreVerticalIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Mensagens */}
                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{
              backgroundColor: '#e5ddd5',
              backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAG1BMVEXMzMzl5eXo6Ojp6enq6urr6+vs7Ozt7e3u7u4jqCnfAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAOklEQVQ4y2NgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglFADgAAGvAB/U9QGQAAAABJRU5ErkJggg==")'
            }}>
                
                    {!pacienteSelecionado.telefone ? <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="bg-white rounded-lg p-6 shadow-sm max-w-sm">
                          <PhoneOffIcon className="w-12 h-12 text-red-400 mx-auto mb-3" />
                          <p className="text-gray-700 font-medium">
                            Paciente sem telefone
                          </p>
                          <p className="text-gray-500 text-sm mt-1">
                            Cadastre um telefone para{' '}
                            {(pacienteSelecionado.nome || '').split(' ')[0]}{' '}
                            para poder enviar mensagens.
                          </p>
                        </div>
                      </div> : mensagensPaciente.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="bg-white rounded-lg p-6 shadow-sm max-w-sm">
                          <MessageCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-3" />
                          <p className="text-gray-700 font-medium">
                            Nenhuma mensagem ainda
                          </p>
                          <p className="text-gray-500 text-sm mt-1">
                            Envie uma mensagem para iniciar a conversa com{' '}
                            {(pacienteSelecionado.nome || '').split(' ')[0]}
                          </p>
                        </div>
                      </div> : mensagensPaciente.map((msg) => <div key={msg.id} className={`flex ${msg.tipo === 'enviada' ? 'justify-end' : 'justify-start'}`}>
                  
                          <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${msg.tipo === 'enviada' ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                    
                            {renderizarConteudoMensagem(msg.conteudo)}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-[10px] text-gray-500">
                                {formatarDataHora(msg.dataHora)}
                              </span>
                              {msg.tipo === 'enviada' && renderStatusIcon(msg.status)}
                            </div>
                            {msg.status === 'erro' && msg.erro && <p className="text-xs text-red-500 mt-1">
                                {msg.erro}
                              </p>}
                          </div>
                        </div>)}
                  </div>

                  {/* Templates */}
                  {showTemplates && pacienteSelecionado.telefone && <div className="border-t border-gray-200 bg-white p-3 max-h-48 overflow-y-auto">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          Mensagens Rápidas
                        </span>
                        <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600">
                    
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {TEMPLATES_MENSAGEM.filter((t) =>
                // ⭐ A felicitação desativada nas Configurações também vale AQUI: este
                // atalho manual mandava "Feliz Aniversário" por texto livre, fora de
                // /api/aniversarios, e por isso escapava da trava.
                t.id !== 'aniversario' || aniversarioHabilitado && (pacienteSelecionado as any)?.felicitarAniversario !== 0).
                map((template) => <button key={template.id} onClick={() => handleAplicarTemplate(template)} className="text-left p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-green-300 transition-colors">
                    
                            <span className="text-sm font-medium text-gray-700">
                              {template.nome}
                            </span>
                          </button>)}
                      </div>
                    </div>}

                  {/* Input de Mensagem */}
                  <div className="p-2 border-t border-gray-200 bg-white">
                    {pacienteSelecionado.telefone && whatsappConfigurado ? <div className="flex items-center gap-2">
                        <button onClick={() => setShowTemplates(!showTemplates)} className={`p-2 rounded-full transition-colors ${showTemplates ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Mensagens rápidas">
                    
                          <FileTextIcon className="w-5 h-5" />
                        </button>
                        <div className="flex-1">
                          <input ref={inputRef} type="text" placeholder="Digite uma mensagem..." value={mensagemInput} onChange={(e) => setMensagemInput(e.target.value)} onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEnviarMensagem();
                    }
                  }} disabled={enviando} className="w-full px-4 py-2 bg-gray-100 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50" />
                    
                        </div>
                        <button onClick={() => handleEnviarMensagem()} disabled={!mensagemInput.trim() || enviando} className="p-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-full transition-colors">
                    
                          {enviando ? <Loader2Icon className="w-5 h-5 animate-spin" /> : <SendIcon className="w-5 h-5" />}
                        </button>
                      </div> : !pacienteSelecionado.telefone ? <div className="text-center py-1">
                        <p className="text-sm text-gray-500">
                          Cadastre um telefone para enviar mensagens
                        </p>
                      </div> : <div className="text-center py-1">
                        <p className="text-sm text-amber-600">
                          ⚠️ Configure o WhatsApp em Configurações para enviar
                          mensagens
                        </p>
                      </div>}
                  </div>
                </> : <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-center p-8">
                  <div className="w-32 h-32 mb-4 text-gray-200">
                    <MessageCircleIcon className="w-full h-full" />
                  </div>
                  <h2 className="text-lg font-medium text-gray-600 mb-1">
                    Mensagens WhatsApp
                  </h2>
                  <p className="text-gray-400 text-sm max-w-sm">
                    Selecione um paciente para iniciar uma conversa
                  </p>
                </div>}
            </div>
          </div>
        </div>}
    </div>;
}