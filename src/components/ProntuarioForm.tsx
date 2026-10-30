import React, { useEffect, useState, Component } from 'react';
import { Modal } from './ui/Modal';
import { Input, Textarea } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { PacienteBuscaSelectAPI } from './PacienteBuscaSelectAPI';
import { MemedPrescricaoModal } from './MemedPrescricaoModal';
import { PrescricaoPropriaModal } from './PrescricaoPropriaModal';
import { Odontograma } from './Odontograma';
import { SignaturePad } from './SignaturePad';
import { SolicitarAssinaturaButton } from './SolicitarAssinaturaButton';
import { Paciente, TipoConsulta, Prontuario, Atendimento } from '../types';
import { MemedConfig, MemedProfissional } from '../types/memed';
import {
  PillIcon,
  FileTextIcon,
  PenToolIcon,
  LockIcon,
  AlertCircleIcon,
  HeartPulseIcon,
  UserIcon,
  PrinterIcon,
  AlertTriangleIcon,
  StethoscopeIcon,
  MessageCircleIcon,
  SendIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';
interface Usuario {
  id: string;
  nome: string;
  tipo: string;
  crm?: string;
  uf?: string;
}
interface Clinica {
  id: string;
  nome: string;
  logoUrl?: string;
  endereco?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  cnpj?: string;
}
interface ProntuarioFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prontuario: any) => void;
  pacientes?: Paciente[];
  initialPacienteId?: string;
  initialPacienteNome?: string;
  prontuarioParaEditar?: Prontuario | null;
  atendimentoParaEditar?: Atendimento | null;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
  onNavigateToProntuarios?: () => void;
}
export function ProntuarioForm({
  isOpen,
  onClose,
  onSave,
  pacientes = [],
  initialPacienteId = '',
  initialPacienteNome = '',
  prontuarioParaEditar = null,
  atendimentoParaEditar = null,
  onWarning,
  onError,
  onNavigateToProntuarios
}: ProntuarioFormProps) {
  // Dados do prontuário (informações gerais do paciente)
  const [dadosProntuario, setDadosProntuario] = useState({
    alergias: '',
    doencasCronicas: '',
    medicamentosEmUso: '',
    historicoFamiliar: '',
    tipoSanguineo: '',
    observacoesGerais: ''
  });
  // Dados do atendimento (evolução)
  const [formData, setFormData] = useState({
    pacienteId: '',
    pacienteNome: '',
    tipo: 'medica' as TipoConsulta,
    queixaPrincipal: '',
    historico: '',
    exameFisico: '',
    diagnostico: '',
    tratamento: '',
    prescricoes: '',
    observacoes: '',
    profissional: '',
    profissionalId: '',
    odontograma: '{}',
    assinaturaPaciente: '',
    dataAssinatura: ''
  });
  const [clinicaId, setClinicaId] = useState<string>('');
  const [clinicaInfo, setClinicaInfo] = useState<Clinica | null>(null);
  const [profissionais, setProfissionais] = useState<Usuario[]>([]);
  const [showMemedModal, setShowMemedModal] = useState(false);
  const [showPrescricaoPropriaModal, setShowPrescricaoPropriaModal] =
  useState(false);
  const [memedConfig, setMemedConfig] = useState<MemedConfig | null>(null);
  const [memedProfissional, setMemedProfissional] =
  useState<MemedProfissional | null>(null);
  const [pacienteSelecionado, setPacienteSelecionado] =
  useState<Paciente | null>(null);
  const [validationError, setValidationError] = useState('');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [mostrarDadosGerais, setMostrarDadosGerais] = useState(false);
  const [prescricaoAdicionada, setPrescricaoAdicionada] = useState(false);
  // Verifica se o atendimento está bloqueado (já foi assinado)
  const atendimentoBloqueado =
  atendimentoParaEditar && atendimentoParaEditar.assinaturaPaciente;
  // Carrega clinicaId, profissionais e configurações do Memed
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      const clinica = parsed.clinicaAtual?.id || '';
      setClinicaId(clinica);
      // Salva informações da clínica para impressão
      if (parsed.clinicaAtual) {
        setClinicaInfo(parsed.clinicaAtual);
      }
      // Busca profissionais (médicos e dentistas) da clínica
      if (clinica) {
        fetch(`${API_BASE_URL}/api/usuarios?clinicaId=${clinica}`).
        then((res) => res.ok ? res.json() : []).
        then((usuarios: Usuario[]) => {
          const medicosEDentistas = usuarios.filter(
            (u) => u.tipo === 'medico' || u.tipo === 'dentista'
          );
          console.log(
            '👨‍⚕️ [ProntuarioForm] Profissionais carregados:',
            medicosEDentistas.map((p) => ({
              id: p.id,
              nome: p.nome,
              crm: p.crm,
              uf: p.uf
            }))
          );
          setProfissionais(medicosEDentistas);
          // Se não tem profissional selecionado, seleciona o usuário logado se for médico/dentista
          if (!formData.profissional && parsed.usuario) {
            const usuarioLogado = medicosEDentistas.find(
              (u) => u.id === parsed.usuario.id
            );
            if (usuarioLogado) {
              setFormData((prev) => ({
                ...prev,
                profissional: usuarioLogado.nome,
                profissionalId: usuarioLogado.id
              }));
            } else if (medicosEDentistas.length > 0) {
              // Seleciona o primeiro da lista
              setFormData((prev) => ({
                ...prev,
                profissional: medicosEDentistas[0].nome,
                profissionalId: medicosEDentistas[0].id
              }));
            }
          }
        }).
        catch((err) => {
          console.error('Erro ao buscar profissionais:', err);
        });
      }
      // Busca profissional Memed do usuário logado
      const usuarioId = parsed.usuario?.id;
      console.log(
        '🔍 [Memed] Buscando profissional Memed para usuário:',
        usuarioId
      );
      if (usuarioId) {
        fetch(`${API_BASE_URL}/api/memed-profissionais/usuario/${usuarioId}`).
        then((res) => {
          console.log('📦 [Memed] Resposta da API:', res.status);
          if (res.ok) return res.json();
          console.warn(
            '⚠️ [Memed] Profissional não encontrado (status:',
            res.status,
            ')'
          );
          return null;
        }).
        then((data) => {
          console.log('📦 [Memed] Dados recebidos:', data);
          if (data && data.token) {
            console.log(
              '✅ [Memed] Profissional configurado:',
              data.nome,
              data.sobrenome
            );
            setMemedProfissional({
              nome: `${data.nome} ${data.sobrenome}`,
              crm: data.board_number,
              uf: data.board_state,
              titulo: data.titulo || '',
              token: data.token
            });
          } else {
            console.warn(
              '⚠️ [Memed] Profissional sem token ou dados incompletos'
            );
            setMemedProfissional(null);
          }
        }).
        catch((err) => {
          console.error('❌ [Memed] Erro ao buscar profissional Memed:', err);
          setMemedProfissional(null);
        });
      }
    }
    // Carrega config do Memed
    const cachedConfig = localStorage.getItem('memed_config');
    if (cachedConfig) {
      try {
        const config = JSON.parse(cachedConfig);
        console.log('📦 [Memed] Config do cache:', config);
        setMemedConfig(config);
      } catch (err) {
        console.error('Erro ao parsear config do cache:', err);
      }
    } else {
      console.log('🔍 [Memed] Buscando config da API...');
      fetch(`${API_BASE_URL}/api/configuracoes-globais/memed_config`).
      then((res) => res.json()).
      then((data) => {
        console.log('📦 [Memed] Config da API:', data);
        if (data && data.valor) {
          setMemedConfig(data.valor);
          localStorage.setItem('memed_config', JSON.stringify(data.valor));
        }
      }).
      catch((err) => {
        console.error('Erro ao carregar config da API:', err);
      });
    }
  }, []);
  // ⭐ Sincroniza nome do profissional quando a lista carrega (SOMENTE por ID, nunca por nome)
  useEffect(() => {
    if (profissionais.length === 0) return;
    // Se tem ID, busca o nome pelo ID (única direção permitida)
    if (formData.profissionalId) {
      const profEncontrado = profissionais.find(
        (p) => p.id === formData.profissionalId
      );
      if (profEncontrado && formData.profissional !== profEncontrado.nome) {
        console.log(
          '🔄 [ProntuarioForm] Sincronizando nome pelo profissionalId:',
          {
            id: formData.profissionalId,
            nomeEncontrado: profEncontrado.nome
          }
        );
        setFormData((prev) => ({
          ...prev,
          profissional: profEncontrado.nome
        }));
      }
    }
  }, [profissionais, formData.profissionalId]);
  // ⭐⭐⭐ REGRA DE OURO: SEMPRE BUSCAR APENAS PELO ID ⭐⭐⭐
  // O nome do profissional pode mudar (ex: "Roberto" foi renomeado para "Antonio")
  // Por isso, quando temos um ID, devemos SEMPRE buscar pelo ID e atualizar o nome
  useEffect(() => {
    if (profissionais.length === 0) return;
    // Se tem ID, busca o profissional pelo ID e atualiza o nome (que pode ter mudado)
    if (formData.profissionalId) {
      const profEncontrado = profissionais.find(
        (p) => p.id === formData.profissionalId
      );
      if (profEncontrado) {
        // Atualiza o nome para o nome ATUAL do profissional (pode ter sido renomeado)
        if (formData.profissional !== profEncontrado.nome) {
          console.log(
            '🔄 [ProntuarioForm] Atualizando nome do profissional pelo ID:',
            {
              id: formData.profissionalId,
              nomeAntigo: formData.profissional,
              nomeAtual: profEncontrado.nome
            }
          );
          setFormData((prev) => ({
            ...prev,
            profissional: profEncontrado.nome
          }));
        }
      } else {
        console.warn(
          '⚠️ [ProntuarioForm] Profissional com ID',
          formData.profissionalId,
          'não encontrado na lista'
        );
      }
    }
    // Se NÃO tem ID mas tem nome, NÃO tenta buscar pelo nome!
    // O nome pode estar desatualizado (ex: "Roberto" que agora é "Antonio")
    // Nesse caso, o usuário deve selecionar manualmente o profissional correto
  }, [profissionais, formData.profissionalId]);
  // ⭐ CORREÇÃO PROBLEMA 1: Função para buscar dados COMPLETOS do paciente
  const buscarDadosCompletosPaciente = async (
  pacienteId: string)
  : Promise<Paciente | null> => {
    if (!pacienteId || !clinicaId) return null;
    try {
      console.log(
        '🔍 [ProntuarioForm] Buscando dados completos do paciente:',
        pacienteId
      );
      const response = await fetch(
        `${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaId}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [ProntuarioForm] Dados completos do paciente:', {
          id: data.id,
          nome: data.nome,
          telefone: data.telefone || '(SEM TELEFONE)',
          cpf: data.cpf || '(SEM CPF)',
          email: data.email || '(SEM EMAIL)'
        });
        return data as Paciente;
      }
    } catch (err) {
      console.error(
        '❌ [ProntuarioForm] Erro ao buscar dados do paciente:',
        err
      );
    }
    return null;
  };
  // Carrega dados quando o modal abre
  useEffect(() => {
    if (!isOpen) return;
    // CORREÇÃO: Não reseta se já tem dados e não está editando
    // Isso evita perder prescrições adicionadas
    if (
    formData.prescricoes &&
    !atendimentoParaEditar &&
    !prontuarioParaEditar)
    {
      return;
    }
    setPrescricaoAdicionada(false);
    if (atendimentoParaEditar) {
      // CORREÇÃO: Trata odontograma que pode vir como objeto ou string do backend
      let odontogramaString = '{}';
      if (atendimentoParaEditar.odontograma) {
        if (typeof atendimentoParaEditar.odontograma === 'string') {
          odontogramaString = atendimentoParaEditar.odontograma;
        } else {
          // Se vier como objeto, converte para string
          odontogramaString = JSON.stringify(atendimentoParaEditar.odontograma);
        }
      }
      // Carrega TODOS os dados do atendimento, incluindo prescrições
      setFormData({
        pacienteId: prontuarioParaEditar?.pacienteId || '',
        pacienteNome: prontuarioParaEditar?.pacienteNome || '',
        tipo: atendimentoParaEditar.tipo,
        queixaPrincipal: atendimentoParaEditar.queixaPrincipal || '',
        historico: atendimentoParaEditar.historico || '',
        exameFisico: atendimentoParaEditar.exameFisico || '',
        diagnostico: atendimentoParaEditar.diagnostico || '',
        tratamento: atendimentoParaEditar.tratamento || '',
        prescricoes: atendimentoParaEditar.prescricoes || '',
        observacoes: atendimentoParaEditar.observacoes || '',
        profissional: atendimentoParaEditar.profissional || '',
        profissionalId: (atendimentoParaEditar as any).profissionalId || '',
        odontograma: odontogramaString,
        assinaturaPaciente: atendimentoParaEditar.assinaturaPaciente || '',
        dataAssinatura: atendimentoParaEditar.dataAssinatura || ''
      });
      if (atendimentoParaEditar.assinaturaPaciente) {
        setShowSignaturePad(true);
      }
      if (prontuarioParaEditar) {
        setDadosProntuario({
          alergias: prontuarioParaEditar.alergias || '',
          doencasCronicas: prontuarioParaEditar.doencasCronicas || '',
          medicamentosEmUso: prontuarioParaEditar.medicamentosEmUso || '',
          historicoFamiliar: prontuarioParaEditar.historicoFamiliar || '',
          tipoSanguineo: prontuarioParaEditar.tipoSanguineo || '',
          observacoesGerais: prontuarioParaEditar.observacoesGerais || ''
        });
      }
      // ⭐ CORREÇÃO: Busca dados COMPLETOS do paciente
      const pacienteId = prontuarioParaEditar?.pacienteId || '';
      if (pacienteId && clinicaId) {
        buscarDadosCompletosPaciente(pacienteId).then((pacienteCompleto) => {
          if (pacienteCompleto) {
            setPacienteSelecionado(pacienteCompleto);
          } else {
            // Fallback com dados mínimos
            const pacienteNome = prontuarioParaEditar?.pacienteNome || '';
            setPacienteSelecionado({
              id: pacienteId,
              nome: pacienteNome,
              cpf: '',
              telefone: '',
              email: '',
              dataNascimento: '',
              genero: 'nao_informar' as any,
              estadoCivil: 'solteiro' as any,
              status: 'ativo' as any,
              matricula: '',
              dataCadastro: new Date().toISOString().split('T')[0],
              idade: 0
            });
          }
        });
      }
    } else if (prontuarioParaEditar) {
      // Novo atendimento para prontuário existente
      const pacienteId = prontuarioParaEditar.pacienteId;
      const pacienteNome = prontuarioParaEditar.pacienteNome || '';
      // Mantém prescrições se já existirem no formData (não reseta)
      setFormData((prev) => ({
        ...prev,
        pacienteId: pacienteId,
        pacienteNome: pacienteNome,
        // Não reseta prescrições se já tem algo
        prescricoes: prev.prescricoes || '',
        // Reseta odontograma para novo atendimento
        odontograma: '{}'
      }));
      setDadosProntuario({
        alergias: prontuarioParaEditar.alergias || '',
        doencasCronicas: prontuarioParaEditar.doencasCronicas || '',
        medicamentosEmUso: prontuarioParaEditar.medicamentosEmUso || '',
        historicoFamiliar: prontuarioParaEditar.historicoFamiliar || '',
        tipoSanguineo: prontuarioParaEditar.tipoSanguineo || '',
        observacoesGerais: prontuarioParaEditar.observacoesGerais || ''
      });
      // ⭐ CORREÇÃO: Busca dados COMPLETOS do paciente
      if (pacienteId && clinicaId) {
        buscarDadosCompletosPaciente(pacienteId).then((pacienteCompleto) => {
          if (pacienteCompleto) {
            setPacienteSelecionado(pacienteCompleto);
          } else {
            setPacienteSelecionado({
              id: pacienteId,
              nome: pacienteNome,
              cpf: '',
              telefone: '',
              email: '',
              dataNascimento: '',
              genero: 'nao_informar' as any,
              estadoCivil: 'solteiro' as any,
              status: 'ativo' as any,
              matricula: '',
              dataCadastro: new Date().toISOString().split('T')[0],
              idade: 0
            });
          }
        });
      }
    } else if (initialPacienteId && initialPacienteNome) {
      // ⭐ CORREÇÃO: Busca dados COMPLETOS do paciente quando vem da agenda
      if (clinicaId) {
        buscarDadosCompletosPaciente(initialPacienteId).then(
          (pacienteCompleto) => {
            if (pacienteCompleto) {
              setPacienteSelecionado(pacienteCompleto);
              setFormData((prev) => ({
                ...prev,
                pacienteId: pacienteCompleto.id,
                pacienteNome: pacienteCompleto.nome
              }));
            } else {
              const paciente = {
                id: initialPacienteId,
                nome: initialPacienteNome,
                cpf: '',
                telefone: '',
                email: '',
                dataNascimento: '',
                genero: 'nao_informar' as any,
                estadoCivil: 'solteiro' as any,
                status: 'ativo' as any,
                matricula: '',
                dataCadastro: new Date().toISOString().split('T')[0],
                idade: 0
              };
              setPacienteSelecionado(paciente);
              setFormData((prev) => ({
                ...prev,
                pacienteId: initialPacienteId,
                pacienteNome: initialPacienteNome
              }));
            }
          }
        );
      } else {
        const paciente = {
          id: initialPacienteId,
          nome: initialPacienteNome,
          cpf: '',
          telefone: '',
          email: '',
          dataNascimento: '',
          genero: 'nao_informar' as any,
          estadoCivil: 'solteiro' as any,
          status: 'ativo' as any,
          matricula: '',
          dataCadastro: new Date().toISOString().split('T')[0],
          idade: 0
        };
        setPacienteSelecionado(paciente);
        setFormData((prev) => ({
          ...prev,
          pacienteId: initialPacienteId,
          pacienteNome: initialPacienteNome
        }));
      }
    } else {
      setPacienteSelecionado(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prontuarioParaEditar?.id, atendimentoParaEditar?.id, clinicaId]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.pacienteId) {
      setValidationError('Selecione um paciente');
      if (onWarning) onWarning('Selecione um paciente');
      return;
    }
    if (!formData.profissional) {
      setValidationError('Selecione um profissional');
      if (onWarning) onWarning('Selecione um profissional');
      return;
    }
    setValidationError('');
    // CORREÇÃO: Envia odontograma como OBJETO, não como string
    // O backend faz JSON.stringify, então precisamos enviar o objeto
    let odontogramaParaSalvar = null;
    try {
      if (formData.odontograma && formData.odontograma !== '{}') {
        odontogramaParaSalvar = JSON.parse(formData.odontograma);
      }
    } catch (e) {
      console.error('Erro ao parsear odontograma:', e);
      odontogramaParaSalvar = {};
    }
    const dadosParaSalvar = {
      pacienteId: formData.pacienteId,
      pacienteNome: formData.pacienteNome,
      ...dadosProntuario,
      data: new Date().toISOString().split('T')[0],
      tipo: formData.tipo,
      queixaPrincipal: formData.queixaPrincipal,
      historico: formData.historico,
      exameFisico: formData.exameFisico,
      diagnostico: formData.diagnostico,
      tratamento: formData.tratamento,
      prescricoes: formData.prescricoes,
      observacoes: formData.observacoes,
      profissional: formData.profissional,
      profissionalId: formData.profissionalId,
      odontograma: odontogramaParaSalvar,
      assinaturaPaciente: formData.assinaturaPaciente,
      dataAssinatura: formData.dataAssinatura
    };
    onSave(dadosParaSalvar);
    setFormData({
      pacienteId: '',
      pacienteNome: '',
      tipo: 'medica',
      queixaPrincipal: '',
      historico: '',
      exameFisico: '',
      diagnostico: '',
      tratamento: '',
      prescricoes: '',
      observacoes: '',
      profissional: profissionais.length > 0 ? profissionais[0].nome : '',
      profissionalId: profissionais.length > 0 ? profissionais[0].id : '',
      odontograma: '{}',
      assinaturaPaciente: '',
      dataAssinatura: ''
    });
    setDadosProntuario({
      alergias: '',
      doencasCronicas: '',
      medicamentosEmUso: '',
      historicoFamiliar: '',
      tipoSanguineo: '',
      observacoesGerais: ''
    });
    setPacienteSelecionado(null);
    setShowSignaturePad(false);
    setMostrarDadosGerais(false);
    setPrescricaoAdicionada(false);
    onClose();
  };
  const handlePacienteSelect = async (
  pacienteId: string,
  pacienteNome: string) =>
  {
    console.log('🔍 [ProntuarioForm] Paciente selecionado:', {
      pacienteId,
      pacienteNome
    });
    // Busca dados completos do paciente
    const pacienteCompleto = await buscarDadosCompletosPaciente(pacienteId);
    if (pacienteCompleto) {
      console.log('✅ [ProntuarioForm] Paciente com dados completos:', {
        id: pacienteCompleto.id,
        nome: pacienteCompleto.nome,
        telefone: pacienteCompleto.telefone || '(SEM TELEFONE)'
      });
      setPacienteSelecionado(pacienteCompleto);
      setFormData({
        ...formData,
        pacienteId: pacienteCompleto.id,
        pacienteNome: pacienteCompleto.nome
      });
    } else {
      // Fallback: usa dados da lista
      const paciente = pacientes.find((p) => p.id === pacienteId) || {
        id: pacienteId,
        nome: pacienteNome,
        cpf: '',
        telefone: '',
        email: '',
        dataNascimento: '',
        genero: 'nao_informar' as any,
        estadoCivil: 'solteiro' as any,
        status: 'ativo' as any,
        matricula: '',
        dataCadastro: new Date().toISOString().split('T')[0],
        idade: 0
      };
      setPacienteSelecionado(paciente);
      setFormData({
        ...formData,
        pacienteId,
        pacienteNome
      });
    }
    setValidationError('');
  };
  const handleProfissionalChange = (profissionalId: string) => {
    const prof = profissionais.find((p) => p.id === profissionalId);
    if (prof) {
      console.log('👨‍⚕️ [ProntuarioForm] Profissional selecionado:', {
        id: prof.id,
        nome: prof.nome,
        crm: prof.crm,
        uf: prof.uf
      });
      setFormData({
        ...formData,
        profissional: prof.nome,
        profissionalId: prof.id
      });
    }
  };
  const handleAbrirMemed = () => {
    console.log('🔍 [Memed] Verificando condições para abrir...');
    console.log(
      '   - Paciente selecionado:',
      pacienteSelecionado?.nome || 'NÃO'
    );
    console.log('   - Memed Config:', memedConfig ? 'SIM' : 'NÃO', memedConfig);
    console.log(
      '   - Memed Profissional:',
      memedProfissional ? 'SIM' : 'NÃO',
      memedProfissional
    );
    if (!pacienteSelecionado) {
      setValidationError('Selecione um paciente primeiro');
      if (onWarning) onWarning('Selecione um paciente primeiro');
      return;
    }
    if (!memedConfig || !(memedConfig.configurada || memedConfig.apiKey)) {
      setValidationError('Configure o Memed em Configurações Globais primeiro');
      if (onWarning)
      onWarning('Configure o Memed em Configurações Globais primeiro');
      return;
    }
    if (!memedProfissional || !memedProfissional.token) {
      setValidationError(
        'Você precisa estar cadastrado como profissional no Memed. Vá em Menu → Profissionais Memed e cadastre-se.'
      );
      if (onWarning)
      onWarning(
        'Você precisa estar cadastrado como profissional no Memed. Vá em Menu → Profissionais Memed.'
      );
      return;
    }
    console.log('✅ [Memed] Todas as condições OK, abrindo modal...');
    setValidationError('');
    setShowMemedModal(true);
  };
  const handlePrescricaoCriada = (prescricaoId: string, pdfUrl: string) => {
    const novaPrescricao = `Prescrição Memed #${prescricaoId}\nPDF: ${pdfUrl}\n\n`;
    setFormData({
      ...formData,
      prescricoes: formData.prescricoes + novaPrescricao
    });
    setPrescricaoAdicionada(true);
    setShowMemedModal(false);
  };
  const handlePrescricaoPropriaCriada = (prescricao: string) => {
    const novaPrescricao = `\n=== PRESCRIÇÃO ===\n${prescricao}\n`;
    setFormData({
      ...formData,
      prescricoes: formData.prescricoes + novaPrescricao
    });
    setPrescricaoAdicionada(true);
  };
  const handleMemedError = (message: string) => {
    if (onError) onError(message);
  };
  const handleSignatureChange = (signature: string) => {
    setFormData({
      ...formData,
      assinaturaPaciente: signature,
      dataAssinatura: signature ? new Date().toISOString() : ''
    });
  };
  // ⭐ Busca dados do profissional SOMENTE por ID (nunca por nome)
  const getProfissionalInfo = (): Usuario | null => {
    console.log('🔍 [getProfissionalInfo] Estado atual:');
    console.log(
      '   - formData.profissionalId:',
      formData.profissionalId || '(vazio)'
    );
    console.log('   - profissionais.length:', profissionais.length);
    // 1. Busca pelo ID na lista (ÚNICA forma permitida)
    if (formData.profissionalId && profissionais.length > 0) {
      const prof = profissionais.find((p) => p.id === formData.profissionalId);
      if (prof) {
        console.log('✅ [getProfissionalInfo] Encontrado por ID:', prof.nome);
        return prof;
      }
    }
    // 2. Se tem ID mas a lista não carregou, retorna objeto parcial com dados do formData
    if (formData.profissionalId) {
      console.log(
        '⚠️ [getProfissionalInfo] Lista não carregou, usando formData:',
        formData.profissionalId
      );
      return {
        id: formData.profissionalId,
        nome: formData.profissional || '',
        tipo: 'medico',
        crm: undefined,
        uf: undefined
      };
    }
    // 3. Fallback: usa dados do atendimento sendo editado (por ID)
    if ((atendimentoParaEditar as any)?.profissionalId) {
      const atendProfId = (atendimentoParaEditar as any).profissionalId;
      const prof = profissionais.find((p) => p.id === atendProfId);
      if (prof) {
        console.log(
          '✅ [getProfissionalInfo] Encontrado via atendimento ID:',
          prof.nome
        );
        return prof;
      }
      return {
        id: atendProfId,
        nome: atendimentoParaEditar?.profissional || '',
        tipo: 'medico',
        crm: undefined,
        uf: undefined
      };
    }
    console.warn('❌ [getProfissionalInfo] Nenhum profissional encontrado');
    return null;
  };
  // ⭐ CORREÇÃO: Busca CRM/CRO do profissional
  const getProfissionalCRM = (): string => {
    const prof = getProfissionalInfo();
    if (prof?.crm && prof?.uf) {
      const prefixo = prof.tipo === 'dentista' ? 'CRO' : 'CRM';
      return `${prefixo} ${prof.crm}/${prof.uf}`;
    }
    return '';
  };
  // ⭐ CORREÇÃO DEFINITIVA: Busca nome do profissional - NUNCA retorna undefined/vazio
  const getProfissionalNome = (): string => {
    // 1. Tenta via getProfissionalInfo (que já tem múltiplos fallbacks)
    const prof = getProfissionalInfo();
    if (prof?.nome && prof.nome.trim()) {
      return prof.nome;
    }
    // 2. Fallback direto do formData
    if (formData.profissional && formData.profissional.trim()) {
      console.log(
        '⚠️ [getProfissionalNome] Usando formData.profissional direto:',
        formData.profissional
      );
      return formData.profissional;
    }
    // 3. Fallback do atendimento sendo editado
    if (
    atendimentoParaEditar?.profissional &&
    atendimentoParaEditar.profissional.trim())
    {
      console.log(
        '⚠️ [getProfissionalNome] Usando atendimentoParaEditar.profissional:',
        atendimentoParaEditar.profissional
      );
      return atendimentoParaEditar.profissional;
    }
    // 4. Se tem profissionais na lista, usa o primeiro como último recurso
    if (profissionais.length > 0) {
      console.log(
        '⚠️ [getProfissionalNome] Usando primeiro profissional da lista:',
        profissionais[0].nome
      );
      return profissionais[0].nome;
    }
    // 5. Último fallback
    return 'Profissional';
  };
  // Função para enviar prescrição por WhatsApp
  const handleEnviarPrescricaoWhatsApp = async () => {
    if (!formData.prescricoes.trim()) {
      if (onWarning) onWarning('Não há prescrições para enviar');
      return;
    }
    let telefone = pacienteSelecionado?.telefone;
    if (!telefone) {
      // Tenta buscar telefone do paciente
      if (pacienteSelecionado?.id && clinicaId) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/pacientes/${pacienteSelecionado.id}?clinicaId=${clinicaId}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.telefone) {
              telefone = data.telefone;
            }
          }
        } catch (err) {
          console.error('Erro ao buscar telefone:', err);
        }
      }
    }
    if (!telefone) {
      if (onWarning) onWarning('Paciente não possui telefone cadastrado');
      return;
    }
    await enviarWhatsAppPrescricao(telefone);
  };
  const enviarWhatsAppPrescricao = async (telefone: string) => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    // ⭐ CORREÇÃO: Busca dados do profissional pelo ID
    const profissionalNome = getProfissionalNome();
    const profissionalCRM = getProfissionalCRM();
    // Monta mensagem da prescrição
    let mensagem = `📝 *PRESCRIÇÃO MÉDICA*\n`;
    mensagem += `${clinicaInfo?.nome || 'Clínica'}\n\n`;
    mensagem += `👤 *Paciente:* ${formData.pacienteNome}\n`;
    mensagem += `📅 *Data:* ${dataAtual}\n`;
    mensagem += `👨‍⚕️ *Profissional:* ${profissionalNome}\n`;
    if (profissionalCRM) {
      mensagem += `${profissionalCRM}\n`;
    }
    mensagem += `\n💊 *Medicamentos:*\n${formData.prescricoes}\n\n`;
    mensagem += `_Documento gerado pelo Sistema EasyClin_`;
    // Formata telefone
    const telefoneFormatado = telefone.replace(/\D/g, '');
    const numeroCompleto = telefoneFormatado.startsWith('55') ?
    telefoneFormatado :
    `55${telefoneFormatado}`;
    try {
      // Busca configuração do WhatsApp da clínica
      const configResponse = await fetch(
        `${API_BASE_URL}/api/whatsapp/config?clinicaId=${clinicaId}`
      );
      if (configResponse.ok) {
        const whatsappConfig = await configResponse.json();
        if (whatsappConfig?.serverUrl && whatsappConfig?.sessionName) {
          // Envia via API do WhatsApp usando a rota correta
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
                pacienteId: pacienteSelecionado?.id,
                pacienteNome: formData.pacienteNome
              })
            }
          );
          if (response.ok) {
            // ⭐⭐⭐ CORREÇÃO: Mensagem de sucesso clara ⭐⭐⭐
            if (onWarning)
            onWarning('✅ Prescrição enviada por WhatsApp com sucesso!');
            return;
          } else {
            // ⭐ Erro na API
            console.error('Erro na API WhatsApp:', response.status);
            if (onError) onError('Erro ao enviar prescrição. Tente novamente.');
            return;
          }
        }
      }
      // Fallback: abre WhatsApp Web
      console.log('Usando fallback WhatsApp Web');
      const url = `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
      if (onWarning)
      onWarning('✅ WhatsApp Web aberto - envie a prescrição manualmente');
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      // Fallback: abre WhatsApp Web
      const url = `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
      if (onWarning)
      onWarning('✅ WhatsApp Web aberto - envie a prescrição manualmente');
    }
  };
  // Função para imprimir prescrição - DESIGN PROFISSIONAL COM CSS INLINE
  const handleImprimirPrescricao = (tipo: 'normal' | 'especial') => {
    if (!formData.prescricoes.trim()) {
      if (onWarning) onWarning('Não há prescrições para imprimir');
      return;
    }
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const isEspecial = tipo === 'especial';
    // Informações da clínica
    const clinicaNome = clinicaInfo?.nome || 'Clínica Médica';
    const clinicaLogo = clinicaInfo?.logoUrl || '';
    const clinicaEndereco =
    clinicaInfo?.endereco || (
    clinicaInfo?.logradouro ?
    clinicaInfo.logradouro + (
    clinicaInfo.numero ? ', ' + clinicaInfo.numero : '') + (
    clinicaInfo.bairro ? ' - ' + clinicaInfo.bairro : '') + (
    clinicaInfo.cidade ? ', ' + clinicaInfo.cidade : '') + (
    clinicaInfo.uf ? '/' + clinicaInfo.uf : '') :
    '');
    const clinicaTelefone = clinicaInfo?.telefone || '';
    const clinicaEmail = clinicaInfo?.email || '';
    const corTema = isEspecial ? '#dc2626' : '#0f766e';
    const corFundo = isEspecial ? '#fef2f2' : '#f0fdfa';
    const corGradiente = isEspecial ? '#f87171' : '#14b8a6';
    const tituloReceita = isEspecial ?
    'RECEITUÁRIO DE CONTROLE ESPECIAL' :
    'RECEITUÁRIO';
    const prescricoesFormatadas = formData.prescricoes.replace(/\n/g, '<br>');
    // ⭐ CORREÇÃO PROBLEMA 2: Busca dados do profissional com fallback
    const profissionalNome = getProfissionalNome();
    const profissionalCRM = getProfissionalCRM();
    console.log('🖨️ [Impressão] Profissional:', {
      nome: profissionalNome,
      crm: profissionalCRM
    });
    const pacienteNomeFormatado = formData.pacienteNome || 'Não informado';
    // Gera iniciais para logo placeholder
    const iniciais = clinicaNome.
    split(' ').
    slice(0, 2).
    map((p: string) => p[0]).
    join('').
    toUpperCase();
    // Logo HTML com CSS inline
    const logoHtml = clinicaLogo ?
    '<img src="' +
    clinicaLogo +
    '" alt="' +
    clinicaNome +
    '" style="width:120px;height:120px;object-fit:contain;border-radius:8px;" />' :
    '<div style="width:120px;height:120px;background:linear-gradient(135deg, ' +
    corTema +
    ' 0%, ' +
    corGradiente +
    ' 100%);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:white;">' +
    iniciais +
    '</div>';
    let html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">';
    html +=
    '<title>' + tituloReceita + ' - ' + pacienteNomeFormatado + '</title>';
    html += '<sty' + 'le>';
    html += '@page { size: A5; margin: 8mm; }';
    html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
    html +=
    'body { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", Arial, sans-serif; padding: 8mm; font-size: 11pt; line-height: 1.4; color: #1e293b; background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }';
    html +=
    '@media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }';
    html += '</sty' + 'le></head><body>';
    // Header com logo
    html +=
    '<div style="display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:3px solid ' +
    corTema +
    ';margin-bottom:20px;">';
    html += logoHtml;
    html += '<div style="flex:1;">';
    html +=
    '<h1 style="font-size:18pt;color:' +
    corTema +
    ';font-weight:700;margin-bottom:4px;">' +
    clinicaNome +
    '</h1>';
    if (clinicaEndereco)
    html +=
    '<div style="font-size:9pt;color:#64748b;margin-bottom:2px;">📍 ' +
    clinicaEndereco +
    '</div>';
    let contato = [];
    if (clinicaTelefone) contato.push('📞 ' + clinicaTelefone);
    if (clinicaEmail) contato.push('✉️ ' + clinicaEmail);
    if (contato.length > 0)
    html +=
    '<div style="font-size:8pt;color:#94a3b8;">' +
    contato.join(' • ') +
    '</div>';
    html += '</div></div>';
    // Título
    html +=
    '<div style="text-align:center;margin:20px 0;padding:12px;background:' +
    corFundo +
    ';border:2px solid ' +
    corTema +
    ';border-radius:8px;">';
    html +=
    '<h2 style="font-size:14pt;color:' +
    corTema +
    ';font-weight:700;text-transform:uppercase;letter-spacing:1px;">' +
    tituloReceita +
    '</h2>';
    html += '</div>';
    // Aviso especial
    if (isEspecial) {
      html +=
      '<div style="background:#fef2f2;border:2px solid #dc2626;padding:10px;margin:16px 0;text-align:center;color:#dc2626;font-weight:600;font-size:9pt;border-radius:6px;">⚠️ ATENÇÃO: Medicamento(s) sujeito(s) a controle especial. Válido por 30 dias. Retenção da 2ª via pela farmácia.</div>';
    }
    // Info do paciente
    html +=
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px;">';
    html +=
    '<p style="margin:4px 0;font-size:10pt;"><strong style="color:#475569;display:inline-block;width:80px;">Paciente:</strong> ' +
    pacienteNomeFormatado +
    '</p>';
    html +=
    '<p style="margin:4px 0;font-size:10pt;"><strong style="color:#475569;display:inline-block;width:80px;">Data:</strong> ' +
    dataAtual +
    '</p>';
    html += '</div>';
    // Prescrições
    html +=
    '<div style="min-height:130px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;margin-bottom:16px;white-space:pre-wrap;font-size:11pt;line-height:1.7;">' +
    prescricoesFormatadas +
    '</div>';
    // Assinatura
    html += '<div style="margin-top:28px;text-align:center;">';
    html +=
    '<div style="margin:0 auto;width:280px;padding-top:12px;border-top:2px solid #1e293b;">';
    html +=
    '<div style="font-weight:700;font-size:11pt;color:#1e293b;margin-bottom:2px;">' +
    profissionalNome +
    '</div>';
    if (profissionalCRM) {
      html +=
      '<div style="font-size:9pt;color:#64748b;">' +
      profissionalCRM +
      '</div>';
    }
    // ⭐ Local (cidade da clínica) + data de impressão em NEGRITO, abaixo dos dados do profissional
    html +=
    '<div style="font-weight:700;font-size:10pt;color:#1e293b;margin-top:10px;">' + (
    clinicaInfo?.cidade || '') +
    ', ' +
    dataAtual +
    '</div>';
    html += '</div>';
    html += '</div>';
    // Rodapé
    html +=
    '<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;text-align:center;font-size:8pt;color:#94a3b8;">Documento gerado eletronicamente pelo Sistema EasyClin</div>';
    html += '</body></html>';
    // ⭐ Abre preview antes de salvar
    import('../utils/pdfGenerator').then(({ previewDocumentoPDF }) => {
      const nomeArquivo = `${isEspecial ? 'Receita_Especial' : 'Receita'}_${pacienteNomeFormatado.replace(/\s+/g, '_')}_${dataAtual.replace(/\//g, '-')}.pdf`;
      previewDocumentoPDF(html, {
        fileName: nomeArquivo
      });
    });
  };
  const tituloModal = () => {
    if (atendimentoParaEditar) {
      return (
        <div className="flex items-center justify-between w-full pr-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {atendimentoBloqueado ? 'Visualizar' : 'Editar'} Atendimento
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {formData.pacienteNome} •{' '}
              {new Date(atendimentoParaEditar.data).toLocaleDateString('pt-BR')}
              {atendimentoBloqueado &&
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                  <LockIcon className="w-3 h-3" />
                  Bloqueado
                </span>
              }
            </p>
          </div>
          {/* Botão Ver Histórico também no modo edição */}
          {onNavigateToProntuarios &&
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onNavigateToProntuarios}
            className="text-blue-600 hover:bg-blue-50">
            
              <FileTextIcon className="w-4 h-4 mr-2" />
              Ver Histórico
            </Button>
          }
        </div>);

    }
    if (prontuarioParaEditar) {
      return (
        <div className="flex items-center justify-between w-full pr-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Novo Atendimento
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Paciente:{' '}
              {formData.pacienteNome || prontuarioParaEditar.pacienteNome}
            </p>
          </div>
          {/* Botão Ver Histórico também quando tem prontuário */}
          {onNavigateToProntuarios &&
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onNavigateToProntuarios}
            className="text-blue-600 hover:bg-blue-50">
            
              <FileTextIcon className="w-4 h-4 mr-2" />
              Ver Histórico
            </Button>
          }
        </div>);

    }
    // Quando vem da Agenda com initialPacienteId/initialPacienteNome
    const pacienteNomeExibir =
    formData.pacienteNome || pacienteSelecionado?.nome || initialPacienteNome;
    if (pacienteNomeExibir) {
      return (
        <div className="flex items-center justify-between w-full pr-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Novo Atendimento
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Paciente: {pacienteNomeExibir}
            </p>
          </div>
          {/* ⭐ Botão para ver histórico de prontuários */}
          {onNavigateToProntuarios &&
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onNavigateToProntuarios}
            className="text-blue-600 hover:bg-blue-50">
            
              <FileTextIcon className="w-4 h-4 mr-2" />
              Ver Histórico
            </Button>
          }
        </div>);

    }
    return 'Novo Atendimento';
  };
  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={tituloModal()}
        footer={
        atendimentoBloqueado ?
        <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button> :

        <>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                {atendimentoParaEditar ?
            'Salvar Alterações' :
            'Registrar Atendimento'}
              </Button>
            </>

        }
        size="large">
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Aviso de atendimento bloqueado */}
          {atendimentoBloqueado &&
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <LockIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">
                    Atendimento Bloqueado para Edição
                  </h4>
                  <p className="text-xs text-amber-700 mt-1">
                    Este atendimento foi assinado pelo paciente em{' '}
                    <strong>
                      {new Date(
                      atendimentoParaEditar.dataAssinatura!
                    ).toLocaleString('pt-BR')}
                    </strong>{' '}
                    e não pode mais ser alterado.
                  </p>
                </div>
              </div>
            </div>
          }

          {/* Aviso de prescrição adicionada */}
          {prescricaoAdicionada && !atendimentoBloqueado &&
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangleIcon className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-green-900">
                    ✅ Prescrição adicionada!
                  </h4>
                  <p className="text-xs text-green-700 mt-1">
                    <strong>Importante:</strong> Clique em "Registrar
                    Atendimento" para salvar as alterações no prontuário.
                  </p>
                </div>
              </div>
            </div>
          }

          {/* Mensagem de validação */}
          {validationError &&
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">⚠️ {validationError}</p>
            </div>
          }

          {/* Seleção de Paciente */}
          {!prontuarioParaEditar && !atendimentoParaEditar &&
          <>
              {clinicaId ?
            <PacienteBuscaSelectAPI
              clinicaId={clinicaId}
              value={formData.pacienteId}
              onChange={handlePacienteSelect}
              placeholder="🔍 Digite o nome do paciente para buscar..."
              required
              disabled={atendimentoBloqueado}
              allowQuickCreate={false} /> :


            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Carregando informações da clínica...
                  </p>
                </div>
            }
            </>
          }

          {/* ⭐ NOVO: Exibe informações do paciente selecionado */}
          {pacienteSelecionado &&
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                <UserIcon className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-900">
                  {pacienteSelecionado.nome}
                </span>
                {pacienteSelecionado.telefone ?
              <span className="text-green-600 text-xs">
                    ✓ Tel: {pacienteSelecionado.telefone}
                  </span> :

              <span className="text-red-600 text-xs">
                    ⚠ Sem telefone cadastrado
                  </span>
              }
              </div>
            </div>
          }

          {/* Seleção de Profissional */}
          {pacienteSelecionado &&
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <StethoscopeIcon className="w-5 h-5 text-teal-600" />
                <span className="font-medium text-teal-900">
                  Profissional Responsável
                </span>
              </div>
              <Select
              value={formData.profissionalId}
              onChange={(e) => handleProfissionalChange(e.target.value)}
              options={profissionais.map((p) => ({
                value: p.id,
                label: `${p.nome}${p.crm ? ` - CRM ${p.crm}/${p.uf || ''}` : ''}`
              }))}
              disabled={atendimentoBloqueado || profissionais.length === 0}
              required />
            

              {profissionais.length === 0 &&
            <p className="text-xs text-amber-600 mt-2">
                  ⚠️ Nenhum médico ou dentista cadastrado na clínica
                </p>
            }
            </div>
          }

          {/* Dados Gerais do Prontuário (colapsável) */}
          {pacienteSelecionado &&
          <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
              type="button"
              onClick={() => setMostrarDadosGerais(!mostrarDadosGerais)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
              disabled={atendimentoBloqueado}>
              
                <div className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">
                    Dados Gerais do Paciente
                  </span>
                  {(dadosProntuario.alergias ||
                dadosProntuario.doencasCronicas) &&
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                      Preenchido
                    </span>
                }
                </div>
                <span className="text-gray-400">
                  {mostrarDadosGerais ? '▲' : '▼'}
                </span>
              </button>

              {mostrarDadosGerais &&
            <div className="p-4 space-y-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Informações permanentes do paciente que ficam no prontuário.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                  label="Alergias"
                  value={dadosProntuario.alergias}
                  onChange={(e) =>
                  setDadosProntuario({
                    ...dadosProntuario,
                    alergias: e.target.value
                  })
                  }
                  placeholder="Ex: Dipirona, Penicilina..."
                  disabled={atendimentoBloqueado} />
                

                    <Input
                  label="Tipo Sanguíneo"
                  value={dadosProntuario.tipoSanguineo}
                  onChange={(e) =>
                  setDadosProntuario({
                    ...dadosProntuario,
                    tipoSanguineo: e.target.value
                  })
                  }
                  placeholder="Ex: O+, A-, AB+..."
                  disabled={atendimentoBloqueado} />
                
                  </div>

                  <Textarea
                label="Doenças Crônicas"
                value={dadosProntuario.doencasCronicas}
                onChange={(e) =>
                setDadosProntuario({
                  ...dadosProntuario,
                  doencasCronicas: e.target.value
                })
                }
                placeholder="Ex: Diabetes, Hipertensão..."
                rows={2}
                disabled={atendimentoBloqueado} />
              

                  <Textarea
                label="Medicamentos em Uso Contínuo"
                value={dadosProntuario.medicamentosEmUso}
                onChange={(e) =>
                setDadosProntuario({
                  ...dadosProntuario,
                  medicamentosEmUso: e.target.value
                })
                }
                placeholder="Ex: Metformina 850mg, Losartana 50mg..."
                rows={2}
                disabled={atendimentoBloqueado} />
              

                  <Textarea
                label="Histórico Familiar"
                value={dadosProntuario.historicoFamiliar}
                onChange={(e) =>
                setDadosProntuario({
                  ...dadosProntuario,
                  historicoFamiliar: e.target.value
                })
                }
                placeholder="Ex: Pai diabético, mãe com hipertensão..."
                rows={2}
                disabled={atendimentoBloqueado} />
              

                  <Textarea
                label="Observações Gerais"
                value={dadosProntuario.observacoesGerais}
                onChange={(e) =>
                setDadosProntuario({
                  ...dadosProntuario,
                  observacoesGerais: e.target.value
                })
                }
                placeholder="Outras informações relevantes..."
                rows={2}
                disabled={atendimentoBloqueado} />
              
                </div>
            }
            </div>
          }

          {/* Alertas de informações importantes */}
          {(dadosProntuario.alergias || dadosProntuario.doencasCronicas) &&
          !mostrarDadosGerais &&
          <div className="flex flex-wrap gap-2">
                {dadosProntuario.alergias &&
            <span className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                    <AlertCircleIcon className="w-3 h-3" />
                    Alergias: {dadosProntuario.alergias}
                  </span>
            }
                {dadosProntuario.doencasCronicas &&
            <span className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    <HeartPulseIcon className="w-3 h-3" />
                    {dadosProntuario.doencasCronicas}
                  </span>
            }
              </div>
          }

          {/* Separador visual */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Dados do Atendimento
            </h3>
          </div>

          <Select
            label="Tipo de Atendimento"
            value={formData.tipo}
            onChange={(e) =>
            setFormData({
              ...formData,
              tipo: e.target.value as TipoConsulta
            })
            }
            options={[
            {
              value: 'medica',
              label: 'Médico'
            },
            {
              value: 'odontologica',
              label: 'Odontológico'
            }]
            }
            disabled={atendimentoBloqueado} />
          

          <Textarea
            label="Queixa Principal"
            value={formData.queixaPrincipal}
            onChange={(e) =>
            setFormData({
              ...formData,
              queixaPrincipal: e.target.value
            })
            }
            placeholder="Motivo da consulta..."
            required
            disabled={atendimentoBloqueado} />
          

          <Textarea
            label="Histórico da Doença Atual"
            value={formData.historico}
            onChange={(e) =>
            setFormData({
              ...formData,
              historico: e.target.value
            })
            }
            placeholder="Evolução dos sintomas, tratamentos anteriores..."
            disabled={atendimentoBloqueado} />
          

          <Textarea
            label="Exame Físico"
            value={formData.exameFisico}
            onChange={(e) =>
            setFormData({
              ...formData,
              exameFisico: e.target.value
            })
            }
            placeholder="Resultados do exame físico..."
            disabled={atendimentoBloqueado} />
          

          {/* Odontograma */}
          {formData.tipo === 'odontologica' &&
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Odontograma
              </label>
              <Odontograma
              value={JSON.parse(formData.odontograma || '{}')}
              onChange={(data) =>
              setFormData({
                ...formData,
                odontograma: JSON.stringify(data)
              })
              }
              disabled={atendimentoBloqueado} />
            
            </div>
          }

          <Textarea
            label="Diagnóstico"
            value={formData.diagnostico}
            onChange={(e) =>
            setFormData({
              ...formData,
              diagnostico: e.target.value
            })
            }
            placeholder="Diagnóstico clínico..."
            required
            disabled={atendimentoBloqueado} />
          

          <Textarea
            label="Tratamento / Conduta"
            value={formData.tratamento}
            onChange={(e) =>
            setFormData({
              ...formData,
              tratamento: e.target.value
            })
            }
            placeholder="Plano de tratamento..."
            required
            disabled={atendimentoBloqueado} />
          

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Prescrições
              </label>
              {!atendimentoBloqueado &&
              <div className="flex gap-2">
                  <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPrescricaoPropriaModal(true)}
                  disabled={!pacienteSelecionado}>
                  
                    <FileTextIcon className="w-4 h-4 mr-2" />
                    Prescrição Própria
                  </Button>
                  <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAbrirMemed}
                  disabled={!pacienteSelecionado}>
                  
                    <PillIcon className="w-4 h-4 mr-2" />
                    Prescrever com Memed
                  </Button>
                </div>
              }
            </div>
            <Textarea
              value={formData.prescricoes}
              onChange={(e) =>
              setFormData({
                ...formData,
                prescricoes: e.target.value
              })
              }
              placeholder="Medicamentos prescritos..."
              rows={6}
              disabled={atendimentoBloqueado} />
            

            {/* Botões de Impressão */}
            {formData.prescricoes.trim() &&
            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleImprimirPrescricao('normal')}
                className="text-teal-600 hover:text-teal-700 hover:bg-teal-50">
                
                  <PrinterIcon className="w-4 h-4 mr-2" />
                  Imprimir Receita Simples
                </Button>
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleImprimirPrescricao('especial')}
                className="text-red-600 hover:text-red-700 hover:bg-red-50">
                
                  <PrinterIcon className="w-4 h-4 mr-2" />
                  Imprimir Receita Especial
                </Button>
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleEnviarPrescricaoWhatsApp}
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                disabled={!pacienteSelecionado}>
                
                  <MessageCircleIcon className="w-4 h-4 mr-2" />
                  Enviar por WhatsApp
                </Button>
              </div>
            }

            {!pacienteSelecionado &&
            <p className="text-xs text-gray-500 mt-1">
                💡 Selecione um paciente para usar o Memed
              </p>
            }
          </div>

          <Textarea
            label="Observações"
            value={formData.observacoes}
            onChange={(e) =>
            setFormData({
              ...formData,
              observacoes: e.target.value
            })
            }
            placeholder="Observações adicionais..."
            disabled={atendimentoBloqueado} />
          

          {/* Assinatura do Paciente */}
          <div className="border-t border-gray-200 pt-4 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Assinatura do Paciente
                </h3>
                <p className="text-sm text-gray-500">
                  O paciente pode assinar digitalmente este atendimento
                </p>
              </div>
              <div className="flex gap-2">
                {/* ⭐ CORREÇÃO PROBLEMA 3: Botão de Solicitar Assinatura por WhatsApp */}
                {pacienteSelecionado && clinicaId && !atendimentoBloqueado &&
                <SolicitarAssinaturaButton
                  pacienteId={pacienteSelecionado.id}
                  pacienteNome={pacienteSelecionado.nome}
                  pacienteTelefone={pacienteSelecionado.telefone || ''}
                  clinicaId={clinicaId}
                  variant="outline"
                  size="sm"
                  label="Solicitar via WhatsApp"
                  className="text-green-600 border-green-300 hover:bg-green-50" />

                }
                {!showSignaturePad && !atendimentoBloqueado &&
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSignaturePad(true)}
                  disabled={!pacienteSelecionado}>
                  
                    <PenToolIcon className="w-4 h-4 mr-2" />
                    Coletar Assinatura
                  </Button>
                }
              </div>
            </div>

            {showSignaturePad &&
            <div className="bg-gray-50 rounded-lg p-4">
                <SignaturePad
                value={formData.assinaturaPaciente}
                onChange={handleSignatureChange}
                label={`Assinatura de ${formData.pacienteNome || 'Paciente'}`}
                disabled={!pacienteSelecionado || atendimentoBloqueado} />
              

                {formData.dataAssinatura &&
              <p className="text-xs text-gray-500 mt-2">
                    ✅ Assinado em:{' '}
                    {new Date(formData.dataAssinatura).toLocaleString('pt-BR')}
                  </p>
              }
              </div>
            }

            {!pacienteSelecionado && !showSignaturePad &&
            <p className="text-xs text-gray-500">
                💡 Selecione um paciente para coletar a assinatura
              </p>
            }
          </div>
        </form>
      </Modal>

      {/* Modal Memed */}
      {showMemedModal &&
      pacienteSelecionado &&
      memedConfig &&
      memedProfissional &&
      <MemedPrescricaoModal
        isOpen={showMemedModal}
        onClose={() => setShowMemedModal(false)}
        paciente={pacienteSelecionado}
        profissional={memedProfissional}
        config={memedConfig}
        onPrescricaoCriada={handlePrescricaoCriada}
        onError={handleMemedError} />

      }

      {/* Modal Prescrição Própria */}
      <PrescricaoPropriaModal
        isOpen={showPrescricaoPropriaModal}
        onClose={() => setShowPrescricaoPropriaModal(false)}
        onSave={handlePrescricaoPropriaCriada}
        onWarning={onWarning} />
      
    </>);

}