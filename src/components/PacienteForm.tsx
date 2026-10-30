import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  lazy,
  Component } from
'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { DocumentosManager } from './DocumentosManager';
import { FinanceiroManager } from './FinanceiroManager';
import { PatientPhoto } from './PatientPhoto';
import { CarteirinhaDigital } from './CarteirinhaDigital';
import { EnviarMenuAjudaButton } from './EnviarMenuAjudaButton';
import { EmpresaBuscaSelectAPI } from './EmpresaBuscaSelectAPI';
import { UnidadeBuscaSelectAPI } from './UnidadeBuscaSelectAPI';
import { ReciboModal } from './ReciboModal';
import { BoletoModal } from './BoletoModal';
import {
  Paciente,
  StatusPaciente,
  Genero,
  EstadoCivil,
  GrauInstrucao,
  Convenio,
  Consulta } from
'../types';
import {
  CreditCardIcon,
  Loader2,
  MapPinIcon,
  CheckCircleIcon,
  SearchIcon,
  HeartPulseIcon,
  PlusIcon,
  XIcon,
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  FileTextIcon,
  AlertCircleIcon,
  PhoneIcon,
  ExternalLinkIcon,
  CarIcon,
  MessageCircleIcon,
  SendIcon,
  CheckCheckIcon,
  Loader2Icon,
  RefreshCwIcon,
  PrinterIcon,
  DollarSignIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';
import { imprimirFichaPaciente } from '../utils/fichaPacienteImpressao';
import { Swal } from './ui/SweetAlert';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ToastContainer';
import { useDialog } from '../hooks/useDialog';
import { DialogContainer } from './DialogContainer';
// ⭐ FIX vazamento: helper de permissões para esconder atalhos a páginas
// bloqueadas (ex.: link "ver na agenda" não aparece se o usuário não tem
// permissão de 'agenda').
import { temPermissao } from '../utils/permissoes';
// ⭐ Tipo para Unidade da Empresa (movido para cá para evitar import circular)
interface UnidadeEmpresa {
  id: string;
  empresaConveniadaId: string;
  nome: string;
  codigo?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
  responsavel?: string;
  observacoes?: string;
  ativa: boolean;
  criadoEm: string;
  empresaNome?: string;
}
interface EmpresaConveniada {
  id: string;
  nome: string;
  cnpj?: string;
  ativa: boolean;
}
interface PlanoSaude {
  id: string;
  nome: string;
  ativo: boolean;
}
interface Profissional {
  id: string;
  nome: string;
  tipo: string;
  crm?: string;
  uf?: string;
}
interface PacienteFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (paciente: any) => void;
  paciente?: Paciente;
  onNavigate?: (page: string, date?: string, profissionalId?: string) => void;
  onAbrirRelacionado?: (pacienteId: string) => void;
  onVoltar?: () => void;
  temVoltar?: boolean;
}
export function PacienteForm({
  isOpen,
  onClose,
  onSave,
  paciente,
  onNavigate,
  onAbrirRelacionado,
  onVoltar,
  temVoltar
}: PacienteFormProps) {
  // Busca o clinicaId do localStorage
  const [clinicaId, setClinicaId] = useState<string>('');
  const [operadoraId, setOperadoraId] = useState<string>('');
  const [clinicaNome, setClinicaNome] = useState<string>('');
  const [clinicaTelefone, setClinicaTelefone] = useState<string>('');
  const [pacienteAtualizado, setPacienteAtualizado] = useState<Paciente | null>(
    null
  );
  const [carregandoPaciente, setCarregandoPaciente] = useState(false);
  // ⭐ Estados para dados carregados sob demanda (SÓ quando modal abre)
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const dadosCarregadosRef = useRef(false);
  // ⭐ Estado para busca de CEP
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepEncontrado, setCepEncontrado] = useState(false);
  const [erroCep, setErroCep] = useState('');
  // ⭐ Estado para criar convênio inline
  const [mostrarNovoConvenio, setMostrarNovoConvenio] = useState(false);
  const [novoConvenioNome, setNovoConvenioNome] = useState('');
  const [salvandoConvenio, setSalvandoConvenio] = useState(false);
  // ⭐ Estado para criar plano de saúde inline
  const [mostrarNovoPlano, setMostrarNovoPlano] = useState(false);
  const [novoPlanoNome, setNovoPlanoNome] = useState('');
  const [salvandoPlano, setSalvandoPlano] = useState(false);
  // ⭐ Estado para criar empresa conveniada inline
  const [mostrarNovaEmpresa, setMostrarNovaEmpresa] = useState(false);
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');
  const [novaEmpresaCnpj, setNovaEmpresaCnpj] = useState('');
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  // ⭐ Estado para criar unidade (local de trabalho) inline
  const [mostrarNovaUnidade, setMostrarNovaUnidade] = useState(false);
  const [novaUnidadeNome, setNovaUnidadeNome] = useState('');
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);
  // ⭐ Estado para consultas do paciente
  const [consultasPaciente, setConsultasPaciente] = useState<Consulta[]>([]);
  const [carregandoConsultas, setCarregandoConsultas] = useState(false);
  const consultasCarregadasRef = useRef(false);
  // ⭐ Estados para mensagens do paciente
  const [mensagensPaciente, setMensagensPaciente] = useState<any[]>([]);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const mensagensCarregadasRef = useRef(false);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const mensagensEndRef = useRef<HTMLDivElement>(null);
  // ⭐ Refs para controle - ADICIONADO ref para evitar loop de carregamento de unidades
  const pacienteInicializadoRef = useRef<string | null>(null);
  const carregandoUnidadesRef = useRef(false); // ⭐ Evita chamadas simultâneas
  const clinicaIdInicializadoRef = useRef<string | null>(null); // ⭐ NOVO: Evita re-inicialização por clinicaId
  const empresasComErroRef = useRef<Set<string>>(new Set()); // ⭐⭐⭐ NOVO: Cache de empresas que deram erro
  // ⭐ Ref para controlar busca de paciente
  const buscandoPacienteRef = useRef(false);
  const pacienteBuscadoRef = useRef<string | null>(null);
  // ⭐ Estado para abrir modal de geração de parcelas no FinanceiroManager
  const [abrirContratoFlag, setAbrirContratoFlag] = useState(false);
  // ⭐ Estados para busca de titular (vinculo familiar)
  const [buscaTitularAberta, setBuscaTitularAberta] = useState(false);
  const [buscaTitularTermo, setBuscaTitularTermo] = useState('');
  const [buscaTitularResultados, setBuscaTitularResultados] = useState<any[]>(
    []
  );
  const [buscandoTitular, setBuscandoTitular] = useState(false);
  const buscaTitularTimerRef = useRef<any>(null);
  const buscaTitularRef = useRef<HTMLDivElement>(null);
  // ⭐ Estados para aba Dependentes
  const [dependentesLista, setDependentesLista] = useState<any[]>([]);
  const [dependenteEditandoId, setDependenteEditandoId] = useState<
    string | null>(
    null);
  const [dependenteFormData, setDependenteFormData] = useState<any>({});
  const [salvandoDependente, setSalvandoDependente] = useState(false);
  const [carregandoDependentes, setCarregandoDependentes] = useState(false);
  const [novoDependente, setNovoDependente] = useState(false);
  const [copiarDadosTitular, setCopiarDadosTitular] = useState(true);
  const [buscaDependenteTermo, setBuscaDependenteTermo] = useState('');
  const [buscaDependenteResultados, setBuscaDependenteResultados] = useState<
    any[]>(
    []);
  const [buscandoDependente, setBuscandoDependente] = useState(false);
  const buscaDependenteTimerRef = useRef<any>(null);
  // ⭐⭐⭐ FIX: Contador para forçar re-inicialização quando pacienteAtualizado chega
  const pacienteAtualizadoVersionRef = useRef(0);
  const { toasts, removeToast, error: showError } = useToast();
  const { dialogs, removeDialog, confirm } = useDialog();
  // Carrega clinicaId do localStorage
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      setClinicaId(parsed.clinicaAtual?.id || '');
      setOperadoraId(
        parsed.clinicaAtual?.operadoraId || parsed.operadoraAtual?.id || ''
      );
      setClinicaNome(parsed.clinicaAtual?.nome || '');
      setClinicaTelefone(parsed.clinicaAtual?.telefone || '');
    }
  }, []);
  // ⭐⭐⭐ CARREGA DADOS SÓ QUANDO O MODAL ABRE ⭐⭐⭐
  useEffect(() => {
    const carregarDadosFormulario = async () => {
      if (!isOpen || !clinicaId || dadosCarregadosRef.current) {
        return;
      }
      dadosCarregadosRef.current = true;
      setCarregandoDados(true);
      console.log('🔄 [PacienteForm] Carregando dados do formulário...');
      try {
        // Carrega convenios e profissionais em paralelo (empresas removido para lazy load)
        const [conveniosRes, profissionaisRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/convenios?clinicaId=${clinicaId}`),
        fetch(`${API_BASE_URL}/api/usuarios?operadoraId=${operadoraId}`)]
        );
        if (conveniosRes.ok) {
          const conveniosData = await conveniosRes.json();
          setConvenios(conveniosData);
          console.log(
            `✅ [PacienteForm] Carregados ${conveniosData.length} convenios`
          );
        }
        if (profissionaisRes.ok) {
          const usuariosData = await profissionaisRes.json();
          // Filtra apenas médicos e dentistas
          const profs = (Array.isArray(usuariosData) ? usuariosData : []).
          filter(
            (u: any) =>
            (u.tipo === 'medico' || u.tipo === 'dentista') &&
            u.ativo !== false
          ).
          map((u: any) => ({
            id: u.id,
            nome: u.nome,
            tipo: u.tipo,
            crm: u.crm,
            uf: u.uf
          }));
          setProfissionais(profs);
          console.log(
            `✅ [PacienteForm] Carregados ${profs.length} profissionais`
          );
        }
      } catch (err) {
        console.error('❌ [PacienteForm] Erro ao carregar dados:', err);
      } finally {
        setCarregandoDados(false);
      }
    };
    carregarDadosFormulario();
  }, [isOpen, clinicaId]);
  // ⭐ Reset quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      dadosCarregadosRef.current = false;
      pacienteInicializadoRef.current = null;
      pacienteBuscadoRef.current = null;
      buscandoPacienteRef.current = false;
      empresasComErroRef.current.clear(); // ⭐⭐⭐ NOVO: Limpa cache de erros quando fecha
      setSalvoComSucesso(false);
    }
  }, [isOpen]);
  // ⭐ Quando a empresa muda, limpa a unidade
  const handleEmpresaChange = (empresaId: string) => {
    setFormData((prev) => ({
      ...prev,
      empresaConveniadaId: empresaId,
      unidadeEmpresaId: ''
    }));
  };
  // Busca dados atualizados do paciente quando o modal abre
  useEffect(() => {
    const buscarPacienteAtualizado = async () => {
      // ⭐ Se modal fechado ou sem paciente, limpa
      if (!isOpen || !paciente?.id) {
        setPacienteAtualizado(null);
        pacienteBuscadoRef.current = null;
        return;
      }
      // ⭐ Evita buscar o mesmo paciente duas vezes
      if (pacienteBuscadoRef.current === paciente.id) {
        console.log('⚠️ [PacienteForm] Paciente já buscado:', paciente.id);
        return;
      }
      // ⭐ Evita chamadas simultâneas
      if (buscandoPacienteRef.current) {
        console.log('⚠️ [PacienteForm] Já está buscando paciente, ignorando...');
        return;
      }
      let cId = clinicaId;
      if (!cId) {
        const sessao = localStorage.getItem('sessao');
        if (sessao) {
          const parsed = JSON.parse(sessao);
          cId = parsed.clinicaAtual?.id || '';
        }
      }
      if (!cId) {
        setPacienteAtualizado(null);
        return;
      }
      buscandoPacienteRef.current = true;
      setCarregandoPaciente(true);
      try {
        console.log('🔄 [PacienteForm] Buscando paciente:', paciente.id);
        const response = await fetch(
          `${API_BASE_URL}/api/pacientes/${paciente.id}?clinicaId=${cId}`
        );
        if (response.ok) {
          const dadosAtualizados = await response.json();
          setPacienteAtualizado(dadosAtualizados);
          pacienteBuscadoRef.current = paciente.id;
          // ⭐ Troca de ficha (titular ↔ dependente) sem fechar o modal:
          // nenhum dado do cadastro anterior pode sobreviver. Zera a marca de
          // inicialização para que o formulário seja reconstruído do zero com o
          // registro recém-carregado, em vez de mesclar com o paciente antigo.
          const chaveFicha = `${dadosAtualizados.id || paciente.id}-${cId}`;
          if (
          pacienteInicializadoRef.current &&
          pacienteInicializadoRef.current !== chaveFicha)
          {
            pacienteInicializadoRef.current = null;
            setFotoPreviewUrl(dadosAtualizados.fotoUrl || null);
            setFotoFile(null);
            setDependentesLista([]);
            setNovoDependente(false);
            setDependenteEditandoId(null);
            setActiveTab('dados');
            return;
          }
          // ⭐⭐⭐ FIX v2: Atualiza o formData DIRETAMENTE com dados frescos do servidor
          // Isso resolve o problema onde o useEffect de inicialização não re-executa
          // porque pacienteParaUsar?.id não muda (mesmo paciente, dados diferentes)
          console.log(
            '✅ [PacienteForm] Paciente carregado do servidor, atualizando formData diretamente:',
            dadosAtualizados.nome,
            '📞 telefone:',
            dadosAtualizados.telefone
          );
          setFormData((prev) => ({
            ...prev,
            matricula: dadosAtualizados.matricula || prev.matricula,
            nome: dadosAtualizados.nome || prev.nome,
            status: dadosAtualizados.status || prev.status,
            numeroContrato:
            dadosAtualizados.numeroContrato || prev.numeroContrato,
            dataInicio: dadosAtualizados.dataInicio || prev.dataInicio,
            dataNascimento:
            dadosAtualizados.dataNascimento || prev.dataNascimento,
            genero: dadosAtualizados.genero || prev.genero,
            estadoCivil: dadosAtualizados.estadoCivil || prev.estadoCivil,
            dificuldadeLocomocao:
            dadosAtualizados.dificuldadeLocomocao || false,
            necessidadeEspecial:
            (dadosAtualizados as any).necessidadeEspecial ||
            prev.necessidadeEspecial,
            fotoUrl: dadosAtualizados.fotoUrl || prev.fotoUrl,
            cpf: dadosAtualizados.cpf || prev.cpf,
            rg: dadosAtualizados.rg || prev.rg,
            emissorRg: dadosAtualizados.emissorRg || prev.emissorRg,
            cns: dadosAtualizados.cns || prev.cns,
            pisPasep: dadosAtualizados.pisPasep || prev.pisPasep,
            convenio: dadosAtualizados.convenio || prev.convenio,
            empresa: dadosAtualizados.empresa || prev.empresa,
            plano: (dadosAtualizados as any).plano || prev.plano,
            empresaConveniadaId:
            dadosAtualizados.empresaConveniadaId || prev.empresaConveniadaId,
            unidadeEmpresaId:
            (dadosAtualizados as any).unidadeEmpresaId ||
            prev.unidadeEmpresaId,
            convenioId: dadosAtualizados.convenioId || prev.convenioId,
            planoSaudeId: dadosAtualizados.planoSaudeId || prev.planoSaudeId,
            numeroCarteirinha:
            (dadosAtualizados as any).numeroCarteirinha ||
            prev.numeroCarteirinha,
            profissao: dadosAtualizados.profissao || prev.profissao,
            grauInstrucao: dadosAtualizados.grauInstrucao || prev.grauInstrucao,
            profissionalResponsavel:
            dadosAtualizados.profissionalResponsavel ||
            prev.profissionalResponsavel,
            profissionalResponsavelId:
            (dadosAtualizados as any).profissionalResponsavelId ||
            prev.profissionalResponsavelId,
            nomeMae: dadosAtualizados.nomeMae || prev.nomeMae,
            nomePai: dadosAtualizados.nomePai || prev.nomePai,
            nomeResponsavel:
            dadosAtualizados.nomeResponsavel || prev.nomeResponsavel,
            rgResponsavel: dadosAtualizados.rgResponsavel || prev.rgResponsavel,
            cpfResponsavel:
            dadosAtualizados.cpfResponsavel || prev.cpfResponsavel,
            registroEmpresa:
            dadosAtualizados.registroEmpresa || prev.registroEmpresa,
            cep: dadosAtualizados.cep || prev.cep,
            logradouro: dadosAtualizados.logradouro || prev.logradouro,
            numero: dadosAtualizados.numero || prev.numero,
            complemento: dadosAtualizados.complemento || prev.complemento,
            bairro: dadosAtualizados.bairro || prev.bairro,
            cidade: dadosAtualizados.cidade || prev.cidade,
            uf: dadosAtualizados.uf || prev.uf,
            codigoIbge: dadosAtualizados.codigoIbge || prev.codigoIbge,
            telefoneResidencial:
            dadosAtualizados.telefoneResidencial || prev.telefoneResidencial,
            telefone: dadosAtualizados.telefone || prev.telefone,
            email: dadosAtualizados.email || prev.email,
            observacoes: dadosAtualizados.observacoes || prev.observacoes,
            anotacoes: dadosAtualizados.anotacoes || prev.anotacoes,
            // ⭐ Dados Financeiros do Contrato
            tipoCobranca:
            (dadosAtualizados as any).tipoCobranca || prev.tipoCobranca,
            valorMensalidade:
            (dadosAtualizados as any).valorMensalidade ||
            prev.valorMensalidade,
            diaVencimentoMensalidade:
            (dadosAtualizados as any).diaVencimentoMensalidade ||
            prev.diaVencimentoMensalidade,
            formaPagamentoPadrao:
            (dadosAtualizados as any).formaPagamentoPadrao ||
            prev.formaPagamentoPadrao,
            profissionalFinanceiroId:
            (dadosAtualizados as any).profissionalFinanceiroId ||
            prev.profissionalFinanceiroId,
            contratoObservacoes:
            (dadosAtualizados as any).contratoObservacoes ||
            prev.contratoObservacoes,
            // ⭐ Vínculo familiar vem sempre do servidor: se o campo voltar
            // vazio, o paciente realmente não tem titular (não herdar o antigo).
            titularId: (dadosAtualizados as any).titularId || '',
            titularNome: (dadosAtualizados as any).titularNome || '',
            parentesco: (dadosAtualizados as any).parentesco || ''
          }));
          if (dadosAtualizados.fotoUrl) {
            setFotoPreviewUrl(dadosAtualizados.fotoUrl);
          }
          // ⭐ Marca como inicializado para evitar que o outro useEffect sobrescreva
          const chaveInicializacao = `${dadosAtualizados.id || paciente.id}-${cId}`;
          pacienteInicializadoRef.current = chaveInicializacao;
        } else {
          setPacienteAtualizado(null);
        }
      } catch (err) {
        console.error('❌ [PacienteForm] Erro ao buscar paciente:', err);
        setPacienteAtualizado(null);
      } finally {
        setCarregandoPaciente(false);
        buscandoPacienteRef.current = false;
      }
    };
    buscarPacienteAtualizado();
  }, [isOpen, paciente?.id]); // ⭐ REMOVIDO clinicaId das dependências - usa localStorage como fallback
  const pacienteParaUsar = pacienteAtualizado || paciente;
  const [activeTab, setActiveTab] = useState<
    'dados' |
    'historico' |
    'docs_digitais' |
    'financeiro' |
    'mensagens' |
    'parentesco' |
    'dependentes' |
    'observacoes'>(
    'dados');
  // Estado para foto do paciente
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null);
  // Estado para modal da carteirinha
  const [showCarteirinha, setShowCarteirinha] = useState(false);
  const [showRecibo, setShowRecibo] = useState(false);
  const [showBoleto, setShowBoleto] = useState(false);
  // ⭐ Estado para controlar salvamento
  const [salvando, setSalvando] = useState(false);
  const [salvoComSucesso, setSalvoComSucesso] = useState(false);
  // ⭐ Estado para alerta de homônimo (verificação ao sair do campo nome)
  const [homonimoAlerta, setHomonimoAlerta] = useState<any[]>([]);
  const [verificandoHomonimo, setVerificandoHomonimo] = useState(false);
  const nomeVerificadoRef = useRef<string>('');
  const [formData, setFormData] = useState({
    matricula: '',
    nome: '',
    status: 'pre_cadastro' as StatusPaciente,
    numeroContrato: '',
    dataInicio: '',
    dataNascimento: '',
    genero: 'nao_informar' as Genero,
    estadoCivil: 'solteiro' as EstadoCivil,
    dificuldadeLocomocao: false,
    necessidadeEspecial: '',
    fotoUrl: '',
    cpf: '',
    rg: '',
    emissorRg: '',
    cns: '',
    pisPasep: '',
    convenio: '',
    empresa: '',
    plano: '',
    empresaConveniadaId: '',
    unidadeEmpresaId: '',
    convenioId: '',
    planoSaudeId: '',
    numeroCarteirinha: '',
    profissao: '',
    grauInstrucao: undefined as GrauInstrucao | undefined,
    profissionalResponsavel: '',
    profissionalResponsavelId: '',
    nomeMae: '',
    nomePai: '',
    nomeResponsavel: '',
    rgResponsavel: '',
    cpfResponsavel: '',
    registroEmpresa: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    codigoIbge: '',
    telefoneResidencial: '',
    telefone: '',
    email: '',
    observacoes: '',
    anotacoes: '',
    // ⭐ Campos de vínculo familiar (titular/dependente)
    titularId: '',
    titularNome: '',
    parentesco: ''
  });
  // ⭐ Ficha Cadastral para impressão: usa os dados já carregados na ficha,
  //    a clínica ativa da sessão e as consultas do próprio paciente.
  const [gerandoFicha, setGerandoFicha] = useState(false);
  const handleImprimirFicha = async () => {
    if (gerandoFicha) return;
    setGerandoFicha(true);
    try {
      const convenioNome =
      convenios.find((c) => c.id === formData.convenioId)?.nome ||
      formData.convenio ||
      '';
      const planoNome =
      planosDoConvenio.find((p: any) => p.id === formData.planoSaudeId)?.
      nome ||
      formData.plano ||
      '';
      await imprimirFichaPaciente(
        {
          matricula: formData.matricula,
          nome: formData.nome,
          dataCadastro:
          (pacienteParaUsar as any)?.dataCadastro ||
          (pacienteParaUsar as any)?.createdAt ||
          '',
          dataNascimento: formData.dataNascimento,
          genero: formData.genero,
          rg: formData.rg,
          cpf: formData.cpf,
          profissao: formData.profissao,
          logradouro: formData.logradouro,
          numero: formData.numero,
          complemento: formData.complemento,
          bairro: formData.bairro,
          cidade: formData.cidade,
          uf: formData.uf,
          cep: formData.cep,
          telefoneResidencial: formData.telefoneResidencial,
          telefone: formData.telefone,
          email: formData.email,
          nomeMae: formData.nomeMae,
          convenio: convenioNome,
          plano: planoNome,
          numeroCarteirinha: formData.numeroCarteirinha
        },
        {
          pacienteId: pacienteParaUsar?.id,
          clinicaId
        }
      );
    } catch (err: any) {
      showError(
        'Não foi possível gerar a ficha',
        err?.message || 'Tente novamente.'
      );
    } finally {
      setGerandoFicha(false);
    }
  };
  // ⭐ Planos do convênio selecionado
  const planosDoConvenio = useMemo(() => {
    if (!formData.convenioId) return [];
    const convenio = convenios.find((c) => c.id === formData.convenioId);
    return convenio?.planos || [];
  }, [formData.convenioId, convenios]);
  // ⭐ Função para criar novo convênio inline
  const handleCriarConvenio = async () => {
    if (!novoConvenioNome.trim()) return;
    let cId = clinicaId;
    if (!cId) {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        cId = parsed.clinicaAtual?.id || '';
      }
    }
    if (!cId) {
      showError('Erro', 'Erro: Clínica não identificada. Faça login novamente.');
      return;
    }
    setSalvandoConvenio(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/convenios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome: novoConvenioNome.trim(),
          ativo: true,
          clinicaId: cId
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar convênio');
      }
      const novoConvenio = await response.json();
      setFormData((prev) => ({
        ...prev,
        convenioId: novoConvenio.id,
        planoSaudeId: ''
      }));
      setConvenios((prev) =>
      [...prev, novoConvenio].sort((a, b) => a.nome.localeCompare(b.nome))
      );
      setNovoConvenioNome('');
      setMostrarNovoConvenio(false);
    } catch (err: any) {
      console.error('❌ Erro ao criar convênio:', err);
      showError('Erro', `Erro ao criar convênio: ${err.message}`);
    } finally {
      setSalvandoConvenio(false);
    }
  };
  // ⭐ Função para criar novo plano de saúde inline
  const handleCriarPlanoSaude = async () => {
    if (!novoPlanoNome.trim() || !formData.convenioId) return;
    let cId = clinicaId;
    if (!cId) {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        cId = parsed.clinicaAtual?.id || '';
      }
    }
    if (!cId) {
      showError('Erro', 'Erro: Clínica não identificada. Faça login novamente.');
      return;
    }
    setSalvandoPlano(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/convenios/${formData.convenioId}/planos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            nome: novoPlanoNome.trim(),
            ativo: true,
            clinicaId: cId
          })
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar plano de saúde');
      }
      const novoPlano = await response.json();
      setConvenios((prev) =>
      prev.map((c) => {
        if (c.id === formData.convenioId) {
          return {
            ...c,
            planos: [...(c.planos || []), novoPlano]
          };
        }
        return c;
      })
      );
      setFormData((prev) => ({
        ...prev,
        planoSaudeId: novoPlano.id
      }));
      setNovoPlanoNome('');
      setMostrarNovoPlano(false);
    } catch (err: any) {
      console.error('❌ Erro ao criar plano de saúde:', err);
      showError('Erro', `Erro ao criar plano de saúde: ${err.message}`);
    } finally {
      setSalvandoPlano(false);
    }
  };
  // ⭐ Função para criar empresa conveniada inline
  const handleCriarEmpresaConveniada = async () => {
    if (!novaEmpresaNome.trim()) return;
    setSalvandoEmpresa(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nome: novaEmpresaNome,
          cnpj: novaEmpresaCnpj,
          ativa: true
        })
      });
      if (response.ok) {
        const novaEmpresa = await response.json();
        // Define a nova empresa como selecionada
        handleEmpresaChange(novaEmpresa.id);
        setNovaEmpresaNome('');
        setNovaEmpresaCnpj('');
        setMostrarNovaEmpresa(false);
      } else {
        showError('Erro', 'Erro ao criar empresa');
      }
    } catch (err) {
      console.error('Erro ao criar empresa:', err);
      showError('Erro', 'Erro ao criar empresa');
    } finally {
      setSalvandoEmpresa(false);
    }
  };
  // ⭐ Função para criar unidade (local de trabalho) inline
  const handleCriarUnidade = async () => {
    if (!novaUnidadeNome.trim()) return;
    if (!formData.empresaConveniadaId) {
      showError('Erro', 'Selecione uma empresa antes de adicionar uma unidade.');
      return;
    }
    setSalvandoUnidade(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/empresas-conveniadas/${formData.empresaConveniadaId}/unidades`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            nome: novaUnidadeNome,
            ativa: true
          })
        }
      );
      if (response.ok) {
        const novaUnidade = await response.json();
        // Define a nova unidade como selecionada
        setFormData((prev) => ({
          ...prev,
          unidadeEmpresaId: novaUnidade.id
        }));
        setNovaUnidadeNome('');
        setMostrarNovaUnidade(false);
      } else {
        showError('Erro', 'Erro ao criar unidade');
      }
    } catch (err) {
      console.error('Erro ao criar unidade:', err);
      showError('Erro', 'Erro ao criar unidade');
    } finally {
      setSalvandoUnidade(false);
    }
  };
  // Atualiza o formulário quando o paciente muda
  useEffect(() => {
    // ⭐ Se modal está fechado, não faz nada
    if (!isOpen) return;
    // ⭐ Aguarda clinicaId estar disponível
    if (!clinicaId) return;
    const pacienteId = pacienteParaUsar?.id || 'novo';
    // ⭐ Cria uma chave única combinando pacienteId + clinicaId
    const chaveInicializacao = `${pacienteId}-${clinicaId}`;
    // ⭐ Evita reinicializar se já foi inicializado com esta combinação
    if (pacienteInicializadoRef.current === chaveInicializacao) {
      console.log('⚠️ [PacienteForm] Já inicializado para:', chaveInicializacao);
      return;
    }
    pacienteInicializadoRef.current = chaveInicializacao;
    console.log(
      '🔄 [PacienteForm] Inicializando formulário para:',
      chaveInicializacao
    );
    setSalvoComSucesso(false);
    if (pacienteParaUsar) {
      setFormData({
        matricula: pacienteParaUsar.matricula || '',
        nome: pacienteParaUsar.nome || '',
        status: pacienteParaUsar.status || 'pre_cadastro',
        numeroContrato: pacienteParaUsar.numeroContrato || '',
        dataInicio: pacienteParaUsar.dataInicio || '',
        dataNascimento: pacienteParaUsar.dataNascimento || '',
        genero: pacienteParaUsar.genero || 'nao_informar',
        estadoCivil: pacienteParaUsar.estadoCivil || 'solteiro',
        dificuldadeLocomocao: pacienteParaUsar.dificuldadeLocomocao || false,
        necessidadeEspecial:
        (pacienteParaUsar as any).necessidadeEspecial || '',
        fotoUrl: pacienteParaUsar.fotoUrl || '',
        cpf: pacienteParaUsar.cpf || '',
        rg: pacienteParaUsar.rg || '',
        emissorRg: pacienteParaUsar.emissorRg || '',
        cns: pacienteParaUsar.cns || '',
        pisPasep: pacienteParaUsar.pisPasep || '',
        convenio: pacienteParaUsar.convenio || '',
        empresa: pacienteParaUsar.empresa || '',
        plano: (pacienteParaUsar as any).plano || '',
        empresaConveniadaId: pacienteParaUsar.empresaConveniadaId || '',
        unidadeEmpresaId: (pacienteParaUsar as any).unidadeEmpresaId || '',
        convenioId: pacienteParaUsar.convenioId || '',
        planoSaudeId: pacienteParaUsar.planoSaudeId || '',
        numeroCarteirinha: (pacienteParaUsar as any).numeroCarteirinha || '',
        profissao: pacienteParaUsar.profissao || '',
        grauInstrucao: pacienteParaUsar.grauInstrucao,
        profissionalResponsavel: pacienteParaUsar.profissionalResponsavel || '',
        profissionalResponsavelId:
        (pacienteParaUsar as any).profissionalResponsavelId || '',
        nomeMae: pacienteParaUsar.nomeMae || '',
        nomePai: pacienteParaUsar.nomePai || '',
        nomeResponsavel: pacienteParaUsar.nomeResponsavel || '',
        rgResponsavel: pacienteParaUsar.rgResponsavel || '',
        cpfResponsavel: pacienteParaUsar.cpfResponsavel || '',
        registroEmpresa: pacienteParaUsar.registroEmpresa || '',
        cep: pacienteParaUsar.cep || '',
        logradouro: pacienteParaUsar.logradouro || '',
        numero: pacienteParaUsar.numero || '',
        complemento: pacienteParaUsar.complemento || '',
        bairro: pacienteParaUsar.bairro || '',
        cidade: pacienteParaUsar.cidade || '',
        uf: pacienteParaUsar.uf || '',
        codigoIbge: pacienteParaUsar.codigoIbge || '',
        telefoneResidencial: pacienteParaUsar.telefoneResidencial || '',
        telefone: pacienteParaUsar.telefone || '',
        email: pacienteParaUsar.email || '',
        observacoes: pacienteParaUsar.observacoes || '',
        anotacoes: pacienteParaUsar.anotacoes || '',
        // ⭐ Dados Financeiros do Contrato
        tipoCobranca: (pacienteParaUsar as any).tipoCobranca || '',
        valorMensalidade: (pacienteParaUsar as any).valorMensalidade || '',
        diaVencimentoMensalidade:
        (pacienteParaUsar as any).diaVencimentoMensalidade || '10',
        formaPagamentoPadrao:
        (pacienteParaUsar as any).formaPagamentoPadrao || 'pix',
        profissionalFinanceiroId:
        (pacienteParaUsar as any).profissionalFinanceiroId || '',
        contratoObservacoes:
        (pacienteParaUsar as any).contratoObservacoes || '',
        // ⭐ Campos de vínculo familiar (titular/dependente)
        titularId: (pacienteParaUsar as any).titularId || '',
        titularNome: (pacienteParaUsar as any).titularNome || '',
        parentesco: (pacienteParaUsar as any).parentesco || ''
      });
      if (pacienteParaUsar.fotoUrl) {
        setFotoPreviewUrl(pacienteParaUsar.fotoUrl);
      } else {
        setFotoPreviewUrl(null);
      }
      setFotoFile(null);
    } else {
      // Novo paciente - limpa tudo e busca próximo número de contrato
      const buscarProximoContrato = async () => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/pacientes/proximo-contrato?clinicaId=${clinicaId}`
          );
          if (response.ok) {
            const data = await response.json();
            setFormData((prev) => ({
              ...prev,
              numeroContrato: data.numeroContrato || ''
            }));
          }
        } catch (err) {
          console.error('⚠️ Erro ao buscar próximo contrato:', err);
        }
      };
      setFormData({
        matricula: '',
        nome: '',
        status: 'pre_cadastro',
        numeroContrato: '',
        dataInicio: '',
        dataNascimento: '',
        genero: 'nao_informar',
        estadoCivil: 'solteiro',
        dificuldadeLocomocao: false,
        necessidadeEspecial: '',
        fotoUrl: '',
        cpf: '',
        rg: '',
        emissorRg: '',
        cns: '',
        pisPasep: '',
        convenio: '',
        empresa: '',
        plano: '',
        empresaConveniadaId: '',
        unidadeEmpresaId: '',
        convenioId: '',
        planoSaudeId: '',
        numeroCarteirinha: '',
        profissao: '',
        grauInstrucao: undefined,
        profissionalResponsavel: '',
        profissionalResponsavelId: '',
        nomeMae: '',
        nomePai: '',
        nomeResponsavel: '',
        rgResponsavel: '',
        cpfResponsavel: '',
        registroEmpresa: '',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
        codigoIbge: '',
        telefoneResidencial: '',
        telefone: '',
        email: '',
        observacoes: '',
        anotacoes: '',
        // ⭐ Dados Financeiros do Contrato
        tipoCobranca: '',
        valorMensalidade: '',
        diaVencimentoMensalidade: '10',
        formaPagamentoPadrao: 'pix',
        profissionalFinanceiroId: '',
        contratoObservacoes: ''
      });
      setFotoPreviewUrl(null);
      setFotoFile(null);
      // ⭐ Busca próximo número de contrato automaticamente
      buscarProximoContrato();
    }
    setActiveTab('dados');
    setMostrarNovoConvenio(false);
    setNovoConvenioNome('');
    setMostrarNovoPlano(false);
    setNovoPlanoNome('');
  }, [pacienteParaUsar?.id, isOpen, clinicaId]); // ⭐ Mantém clinicaId mas usa chave composta para evitar re-execução
  // ⭐ Carrega consultas do paciente quando a aba for selecionada
  useEffect(() => {
    const carregarConsultas = async () => {
      if (
      activeTab !== 'historico' ||
      !pacienteParaUsar?.id ||
      !clinicaId ||
      consultasCarregadasRef.current)
      {
        return;
      }
      setCarregandoConsultas(true);
      try {
        // ⭐ Histórico completo do paciente — limite amplo (um paciente não tem
        // milhares de consultas; 5000 cobre qualquer caso real com folga)
        const response = await fetch(
          `${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&pacienteId=${pacienteParaUsar.id}&limit=5000`
        );
        if (response.ok) {
          const data = await response.json();
          // Ordena por data (mais recentes primeiro)
          const ordenadas = data.sort((a: Consulta, b: Consulta) => {
            const dateA = new Date(`${a.data}T${a.horario || '00:00'}`);
            const dateB = new Date(`${b.data}T${b.horario || '00:00'}`);
            return dateB.getTime() - dateA.getTime();
          });
          setConsultasPaciente(ordenadas);
          consultasCarregadasRef.current = true;
        }
      } catch (err) {
        console.error('Erro ao carregar consultas do paciente:', err);
      } finally {
        setCarregandoConsultas(false);
      }
    };
    carregarConsultas();
  }, [activeTab, pacienteParaUsar?.id, clinicaId]);
  // Reseta o ref de consultas quando o paciente muda
  useEffect(() => {
    consultasCarregadasRef.current = false;
    setConsultasPaciente([]);
    mensagensCarregadasRef.current = false;
    setMensagensPaciente([]);
  }, [pacienteParaUsar?.id]);
  // ⭐ Carrega mensagens do paciente quando a aba for selecionada
  useEffect(() => {
    const carregarMensagens = async () => {
      if (
      activeTab !== 'mensagens' ||
      !pacienteParaUsar?.id ||
      !clinicaId ||
      mensagensCarregadasRef.current)
      {
        return;
      }
      setCarregandoMensagens(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/mensagens?clinicaId=${clinicaId}&pacienteId=${pacienteParaUsar.id}`
        );
        if (response.ok) {
          const data = await response.json();
          setMensagensPaciente(data);
          mensagensCarregadasRef.current = true;
          // Scroll para o final
          setTimeout(() => {
            mensagensEndRef.current?.scrollIntoView({
              behavior: 'smooth'
            });
          }, 100);
        }
      } catch (err) {
        console.error('Erro ao carregar mensagens do paciente:', err);
      } finally {
        setCarregandoMensagens(false);
      }
    };
    carregarMensagens();
  }, [activeTab, pacienteParaUsar?.id, clinicaId]);
  const calcularIdade = (dataNascimento: string): number => {
    if (!dataNascimento) return 0;
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || mes === 0 && hoje.getDate() < nascimento.getDate()) {
      idade--;
    }
    return idade;
  };
  // ⭐ BUSCA CEP NA API VIACEP
  const buscarCep = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setCepEncontrado(false);
      setErroCep('');
      return;
    }
    setBuscandoCep(true);
    setCepEncontrado(false);
    setErroCep('');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      if (data.erro) {
        setErroCep('CEP não encontrado');
        setCepEncontrado(false);
      } else {
        setFormData((prev) => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          uf: data.uf || prev.uf,
          codigoIbge: data.ibge || prev.codigoIbge,
          complemento: data.complemento || prev.complemento
        }));
        setCepEncontrado(true);
        setErroCep('');
        setTimeout(() => {
          const campoNumero = document.getElementById('campo-numero-endereco');
          if (campoNumero) campoNumero.focus();
        }, 100);
      }
    } catch (err) {
      console.error('Erro ao buscar CEP:', err);
      setErroCep('Erro ao buscar CEP');
      setCepEncontrado(false);
    } finally {
      setBuscandoCep(false);
    }
  };
  const formatarCep = (valor: string) => {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length <= 5) return numeros;
    return `${numeros.slice(0, 5)}-${numeros.slice(5, 8)}`;
  };
  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorFormatado = formatarCep(e.target.value);
    setFormData({
      ...formData,
      cep: valorFormatado
    });
    const cepLimpo = valorFormatado.replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      buscarCep(cepLimpo);
    } else {
      setCepEncontrado(false);
      setErroCep('');
    }
  };
  const uploadFoto = async (
  file: File,
  pacienteIdParam?: string)
  : Promise<string | null> => {
    try {
      // ⭐ Garante que clinicaId e operadoraId estejam disponíveis
      let cId = clinicaId;
      let oId = operadoraId;
      if (!cId || !oId) {
        const sessao = localStorage.getItem('sessao');
        if (sessao) {
          const parsed = JSON.parse(sessao);
          cId = cId || parsed.clinicaAtual?.id || '';
          oId =
          oId ||
          parsed.clinicaAtual?.operadoraId ||
          parsed.operadoraAtual?.id ||
          '';
        }
      }
      if (!cId) {
        console.error(
          '❌ [PacienteForm] clinicaId não disponível para upload de foto'
        );
        return null;
      }
      const formDataUpload = new FormData();
      formDataUpload.append('foto', file);
      formDataUpload.append('operadoraId', oId);
      formDataUpload.append('clinicaId', cId);
      if (pacienteIdParam) formDataUpload.append('pacienteId', pacienteIdParam);
      console.log('📤 [PacienteForm] Fazendo upload da foto...');
      console.log('   - clinicaId:', cId);
      console.log('   - operadoraId:', oId);
      console.log('   - pacienteId:', pacienteIdParam);
      console.log('   - arquivo:', file.name, file.size, 'bytes');
      const response = await fetch(`${API_BASE_URL}/api/pacientes/foto`, {
        method: 'POST',
        body: formDataUpload
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          '❌ [PacienteForm] Erro no upload:',
          response.status,
          errorText
        );
        throw new Error(
          `Erro ao fazer upload da foto: ${response.status} - ${errorText}`
        );
      }
      const data = await response.json();
      console.log('✅ [PacienteForm] Foto enviada com sucesso:', data.url);
      return data.url;
    } catch (err: any) {
      console.error('❌ [PacienteForm] Erro ao fazer upload da foto:', err);
      // ⭐⭐⭐ FIX: NÃO retorna blob URL - retorna null para indicar falha
      // Antes retornava fotoPreviewUrl (blob://) que não funciona após reload
      return null;
    }
  };
  // ⭐ Verificação de homônimo ao sair do campo nome (onBlur)
  const verificarHomonimoNome = async (nome: string) => {
    const nomeTrimmed = nome.trim();
    // Não verifica se é edição, nome curto, ou já verificou esse nome
    if (pacienteParaUsar || nomeTrimmed.length < 3 || !clinicaId) {
      setHomonimoAlerta([]);
      return;
    }
    if (nomeVerificadoRef.current === nomeTrimmed) return;
    nomeVerificadoRef.current = nomeTrimmed;
    setVerificandoHomonimo(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(nomeTrimmed)}&limit=20`
      );
      if (!response.ok) {
        setHomonimoAlerta([]);
        return;
      }
      const result = await response.json();
      const pacientes = result.data || result || [];
      const normalizar = (str: string) =>
      str.
      toLowerCase().
      normalize('NFD').
      replace(/[\u0300-\u036f]/g, '').
      replace(/\s+/g, ' ').
      trim();
      const nomeNorm = normalizar(nomeTrimmed);
      const homonimos = pacientes.filter((p: any) => {
        const nomeP = normalizar(p.nome || '');
        return (
          nomeP === nomeNorm ||
          nomeP.includes(nomeNorm) ||
          nomeNorm.includes(nomeP));

      });
      setHomonimoAlerta(homonimos);
    } catch (err) {
      console.warn('⚠️ Erro ao verificar homônimos:', err);
      setHomonimoAlerta([]);
    } finally {
      setVerificandoHomonimo(false);
    }
  };
  const handleSaveClick = async () => {
    setSalvando(true);
    try {
      // ⭐ Verificação de homônimo - só para NOVO paciente
      if (!pacienteParaUsar && formData.nome.trim().length >= 3 && clinicaId) {
        try {
          const nomeParaBusca = formData.nome.trim();
          const response = await fetch(
            `${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(nomeParaBusca)}&limit=20`
          );
          if (response.ok) {
            const result = await response.json();
            const pacientes = result.data || result || [];
            // Filtra homônimos: nomes muito similares (ignora acentos e case)
            const normalizar = (str: string) =>
            str.
            toLowerCase().
            normalize('NFD').
            replace(/[\u0300-\u036f]/g, '').
            replace(/\s+/g, ' ').
            trim();
            const nomeNormalizado = normalizar(nomeParaBusca);
            const homonimos = pacientes.filter((p: any) => {
              const nomeP = normalizar(p.nome || '');
              // Verifica nome exato ou muito similar
              return (
                nomeP === nomeNormalizado ||
                nomeP.includes(nomeNormalizado) ||
                nomeNormalizado.includes(nomeP));

            });
            if (homonimos.length > 0) {
              const listaHtml = homonimos.
              slice(0, 5).
              map((h: any) => {
                const cpf = h.cpf ? ` • CPF: ${h.cpf}` : '';
                const tel = h.telefone ? ` • Tel: ${h.telefone}` : '';
                const nasc = h.dataNascimento ?
                ` • Nasc: ${new Date(h.dataNascimento + 'T12:00:00').toLocaleDateString('pt-BR')}` :
                '';
                return `<div style="padding:6px 0;border-bottom:1px solid #eee;text-align:left">
                    <strong>${h.nome}</strong>${cpf}${tel}${nasc}
                  </div>`;
              }).
              join('');
              const extras =
              homonimos.length > 5 ?
              `<p style="color:#666;font-size:12px;margin-top:8px">...e mais ${homonimos.length - 5} paciente(s)</p>` :
              '';
              const confirmResult = await Swal.fire({
                icon: 'warning',
                title: '⚠️ Possível Homônimo Encontrado!',
                html: `
                  <p style="margin-bottom:12px">Já existe(m) <strong>${homonimos.length}</strong> paciente(s) com nome similar a "<strong>${formData.nome.trim()}</strong>":</p>
                  <div style="max-height:200px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-bottom:12px;background:#f9fafb">
                    ${listaHtml}
                    ${extras}
                  </div>
                  <p style="color:#b45309;font-weight:600">Deseja cadastrar mesmo assim?</p>
                `,
                showCancelButton: true,
                confirmButtonText: 'Sim, cadastrar mesmo assim',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#6b7280',
                width: 520
              });
              if (!confirmResult.isConfirmed) {
                setSalvando(false);
                return;
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ Erro ao verificar homônimos (prosseguindo):', err);
        }
      }
      let fotoUrl = formData.fotoUrl;
      if (fotoFile) {
        const uploadedUrl = await uploadFoto(fotoFile, pacienteParaUsar?.id);
        if (uploadedUrl) {
          fotoUrl = uploadedUrl;
        } else {
          console.warn(
            '⚠️ [PacienteForm] Upload da foto falhou, mantendo foto anterior'
          );
        }
      }
      const empresaIdFinal = formData.empresaConveniadaId || '';
      console.log(
        '💾💾💾 [PacienteForm] ========== SALVANDO PACIENTE =========='
      );
      console.log(
        '💾 📞 telefone no formData:',
        JSON.stringify(formData.telefone)
      );
      console.log('💾 👤 nome no formData:', JSON.stringify(formData.nome));
      console.log('💾 📧 email no formData:', JSON.stringify(formData.email));
      console.log(
        '💾 📋 matricula no formData:',
        JSON.stringify(formData.matricula)
      );
      console.log('💾 🏥 clinicaId:', clinicaId);
      console.log('💾 🆔 pacienteId:', pacienteParaUsar?.id || '(novo)');
      console.log('💾💾💾 ================================================');
      const pacienteDataRaw = {
        ...formData,
        fotoUrl,
        empresaId: empresaIdFinal,
        empresaConveniadaId: empresaIdFinal,
        idade: calcularIdade(formData.dataNascimento),
        dataCadastro:
        pacienteParaUsar?.dataCadastro ||
        new Date().toISOString().split('T')[0],
        // ⭐ Limpa titularId pendente e campos virtuais
        titularId:
        formData.titularId === '__pendente__' ? '' : formData.titularId || '',
        titularNome: undefined,
        // ⭐ FIX: Sincroniza campo 'celular' com 'telefone' para manter ambas as colunas do banco atualizadas
        celular: formData.telefone || ''
      };
      // ⭐ FIX: Sanitiza campos numéricos — MySQL rejeita '' em DECIMAL/INT
      const camposNumericos = [
      'valorMensalidade',
      'diaVencimentoMensalidade',
      'idade'];

      // ⭐ FIX: Remove campos que NÃO existem na tabela pacientes (evita "Unknown column")
      const camposParaRemover = [
      'valor',
      'titularNome',
      'convenioNome',
      'empresaNome',
      'empresaCnpj',
      'totalDependentes',
      'planoSaudeNome'];

      const pacienteData: any = {
        ...pacienteDataRaw
      };
      for (const campo of camposNumericos) {
        if (pacienteData[campo] === '' || pacienteData[campo] === undefined) {
          pacienteData[campo] = null;
        }
      }
      for (const campo of camposParaRemover) {
        delete pacienteData[campo];
      }
      // Remove campos undefined para não enviar ao servidor
      Object.keys(pacienteData).forEach((key) => {
        if (pacienteData[key] === undefined) {
          delete pacienteData[key];
        }
      });
      const salvo = await onSave(pacienteData);
      // ⭐ FIX: Ao salvar (especialmente NOVO paciente, cujo id muda de "novo"
      // para o id real), o useEffect de inicialização re-executava e
      // sobrescrevia o formData com o objeto retornado pela API — que pode vir
      // PARCIAL —, apagando os campos da tela. Marcamos a chave de
      // inicialização como já feita para o novo id, mantendo o formData atual
      // (que já está completo e correto) intacto.
      const novoId = (salvo as any)?.id || pacienteParaUsar?.id;
      if (novoId && clinicaId) {
        pacienteInicializadoRef.current = `${novoId}-${clinicaId}`;
        pacienteBuscadoRef.current = novoId;
      }
      setSalvoComSucesso(true);
    } catch (err: any) {
      console.error('❌ [PacienteForm] Erro ao salvar:', err);
      // ⭐⭐⭐ FIX: Mostra erro ao usuário em vez de engolir silenciosamente
      showError(
        'Erro',
        `Erro ao salvar paciente: ${err.message || 'Erro desconhecido'}. Verifique o console para mais detalhes.`
      );
    } finally {
      setSalvando(false);
    }
  };
  const handlePhotoChange = (file: File | null) => {
    setFotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setFotoPreviewUrl(url);
    } else {
      setFotoPreviewUrl(null);
      setFormData({
        ...formData,
        fotoUrl: ''
      });
    }
  };
  const handleConvenioChange = (convenioId: string) => {
    setFormData((prev) => ({
      ...prev,
      convenioId,
      planoSaudeId: '' // Reset plano when convenio changes
    }));
  };
  // ⭐ Um paciente vinculado a um titular É um dependente — e um dependente
  // não pode ter dependentes próprios. Toda a UI de "titular" deve sumir.
  const isDependente = Boolean(
    formData.titularId &&
    formData.titularId !== '__pendente__' &&
    formData.titularNome
  );
  // Se o vínculo passar a existir enquanto a aba de dependentes está aberta,
  // leva o usuário para a aba que realmente descreve a situação dele.
  useEffect(() => {
    if (isDependente && activeTab === 'dependentes') {
      setActiveTab('parentesco');
    }
  }, [isDependente, activeTab]);
  const tabs = useMemo(
    () => [
    {
      id: 'dados',
      label: 'Dados Básicos'
    },
    {
      id: 'historico',
      label: '💊 Consultas'
    },
    {
      id: 'docs_digitais',
      label: '📁 Arquivos'
    },
    {
      id: 'financeiro',
      label: 'Financeiro'
    },
    {
      id: 'mensagens',
      label: '💬 Mensagens'
    },
    {
      id: 'parentesco',
      label: '🔗 Parentesco'
    },
    // A aba de dependentes só faz sentido para quem é titular.
    ...(isDependente ?
    [] :
    [
    {
      id: 'dependentes',
      label: '👥 Dependentes'
    }]),

    {
      id: 'observacoes',
      label: 'Observações'
    }],

    [isDependente]
  );
  // ⭐ Busca titular com debounce
  const buscarTitular = useCallback(
    (termo: string) => {
      if (buscaTitularTimerRef.current)
      clearTimeout(buscaTitularTimerRef.current);
      if (!termo.trim() || !clinicaId) {
        setBuscaTitularResultados([]);
        setBuscandoTitular(false);
        return;
      }
      setBuscandoTitular(true);
      buscaTitularTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(termo.trim())}&limit=15`
          );
          const result = await res.json();
          const lista = (result.data || []).filter(
            (p: any) => p.id !== paciente?.id && !p.titularId
          );
          setBuscaTitularResultados(lista);
        } catch {
          setBuscaTitularResultados([]);
        }
        setBuscandoTitular(false);
      }, 300);
    },
    [clinicaId, paciente?.id]
  );
  // Click outside fecha busca titular
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
      buscaTitularRef.current &&
      !buscaTitularRef.current.contains(e.target as Node))
      {
        setBuscaTitularAberta(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // ⭐ Carregar dependentes via filtro server-side titularId
  const carregarDependentes = useCallback(async () => {
    if (!paciente?.id || !clinicaId) return;
    setCarregandoDependentes(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&titularId=${paciente.id}&limit=200`
      );
      const result = await res.json();
      setDependentesLista(result.data || []);
    } catch {
      setDependentesLista([]);
    }
    setCarregandoDependentes(false);
  }, [paciente?.id, clinicaId]);
  // Carrega dependentes quando muda para a aba
  useEffect(() => {
    if (activeTab === 'dependentes' && paciente?.id) {
      carregarDependentes();
    }
  }, [activeTab, paciente?.id, carregarDependentes]);
  // ⭐ Busca paciente existente para vincular como dependente
  const buscarDependenteParaVincular = useCallback(
    (termo: string) => {
      if (buscaDependenteTimerRef.current)
      clearTimeout(buscaDependenteTimerRef.current);
      if (!termo.trim() || !clinicaId) {
        setBuscaDependenteResultados([]);
        setBuscandoDependente(false);
        return;
      }
      setBuscandoDependente(true);
      buscaDependenteTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&search=${encodeURIComponent(termo.trim())}&limit=15`
          );
          const result = await res.json();
          // Filtra pacientes que não são o titular e não têm titularId
          const lista = (result.data || []).filter(
            (p: any) => p.id !== paciente?.id && !p.titularId
          );
          setBuscaDependenteResultados(lista);
        } catch {
          setBuscaDependenteResultados([]);
        }
        setBuscandoDependente(false);
      }, 300);
    },
    [clinicaId, paciente?.id]
  );
  const vincularDependenteExistente = async (dependenteId: string) => {
    if (!clinicaId || !paciente?.id) return;
    setSalvandoDependente(true);
    try {
      await fetch(`${API_BASE_URL}/api/pacientes/${dependenteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          titularId: paciente.id
        })
      });
      setBuscaDependenteTermo('');
      setBuscaDependenteResultados([]);
      await carregarDependentes();
    } catch (err) {
      console.error('Erro ao vincular dependente:', err);
      showError('Erro', 'Erro ao vincular paciente existente.');
    }
    setSalvandoDependente(false);
  };
  const iniciarEdicaoDependente = (dep: any) => {
    setDependenteEditandoId(dep.id);
    setNovoDependente(false);
    setDependenteFormData({
      nome: dep.nome || '',
      dataNascimento: dep.dataNascimento || '',
      cpf: dep.cpf || '',
      telefone: dep.telefone || '',
      email: dep.email || '',
      parentesco: dep.parentesco || '',
      observacoes: dep.observacoes || '',
      status: dep.status || 'ativo'
    });
  };
  const iniciarNovoDependente = () => {
    setDependenteEditandoId(null);
    setNovoDependente(true);
    setDependenteFormData({
      nome: '',
      dataNascimento: '',
      cpf: '',
      telefone: '',
      email: '',
      parentesco: 'filho',
      observacoes: '',
      status: 'ativo'
    });
  };
  const cancelarEdicaoDependente = () => {
    setDependenteEditandoId(null);
    setNovoDependente(false);
    setDependenteFormData({});
  };
  const salvarDependente = async (adicionarOutro: boolean = false) => {
    if (!dependenteFormData.nome?.trim()) return;
    if (!clinicaId || !paciente?.id) return;
    setSalvandoDependente(true);
    try {
      let dadosHerdados = {};
      if (copiarDadosTitular && novoDependente) {
        dadosHerdados = {
          cep: formData.cep,
          logradouro: formData.logradouro,
          numero: formData.numero,
          complemento: formData.complemento,
          bairro: formData.bairro,
          cidade: formData.cidade,
          uf: formData.uf,
          codigoIbge: formData.codigoIbge,
          telefoneResidencial: formData.telefoneResidencial,
          convenioId: formData.convenioId,
          planoSaudeId: formData.planoSaudeId,
          empresaConveniadaId: formData.empresaConveniadaId,
          unidadeEmpresaId: formData.unidadeEmpresaId
        };
        // Se o dependente não preencheu telefone, herda o do titular
        if (!dependenteFormData.telefone) {
          dadosHerdados = {
            ...dadosHerdados,
            telefone: formData.telefone
          };
        }
      }
      if (novoDependente) {
        // Criar novo paciente como dependente
        const novoId = `pac_${Date.now()}`;
        const body = {
          id: novoId,
          clinicaId,
          nome: dependenteFormData.nome,
          dataNascimento: dependenteFormData.dataNascimento || '',
          genero: dependenteFormData.genero || 'nao_informar',
          cpf: dependenteFormData.cpf || '',
          telefone: dependenteFormData.telefone || '',
          email: dependenteFormData.email || '',
          parentesco: dependenteFormData.parentesco || '',
          observacoes: dependenteFormData.observacoes || '',
          status: dependenteFormData.status || 'ativo',
          titularId: paciente.id,
          matricula: `DEP-${Date.now().toString(36).toUpperCase()}`,
          criadoEm: new Date().toISOString(),
          ...dadosHerdados
        };
        await fetch(`${API_BASE_URL}/api/pacientes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      } else if (dependenteEditandoId) {
        // Atualizar dependente existente
        const body = {
          clinicaId,
          nome: dependenteFormData.nome,
          dataNascimento: dependenteFormData.dataNascimento || '',
          genero: dependenteFormData.genero || 'nao_informar',
          cpf: dependenteFormData.cpf || '',
          telefone: dependenteFormData.telefone || '',
          email: dependenteFormData.email || '',
          parentesco: dependenteFormData.parentesco || '',
          observacoes: dependenteFormData.observacoes || '',
          status: dependenteFormData.status || 'ativo',
          titularId: paciente.id
        };
        await fetch(`${API_BASE_URL}/api/pacientes/${dependenteEditandoId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      }
      await carregarDependentes();
      if (adicionarOutro) {
        // Limpa form mantendo aberto
        setDependenteFormData({
          nome: '',
          dataNascimento: '',
          genero: 'nao_informar',
          cpf: '',
          telefone: '',
          email: '',
          parentesco: 'filho',
          observacoes: '',
          status: 'ativo'
        });
        // Foca no nome
        setTimeout(() => {
          document.getElementById('dependente-nome-input')?.focus();
        }, 100);
      } else {
        cancelarEdicaoDependente();
      }
    } catch (err: any) {
      console.error('Erro ao salvar dependente:', err);
      showError(
        'Erro',
        'Erro ao salvar dependente: ' + (err.message || 'Erro desconhecido')
      );
    }
    setSalvandoDependente(false);
  };
  // ⭐ Se modal está fechado, não renderiza nada pesado
  if (!isOpen) {
    return null;
  }
  // Conteúdo do formulário
  const formContent =
  <div className="flex flex-col">
      {/* ⭐ CABEÇALHO FIXO DO PACIENTE (sticky dentro do scroll do Modal) */}
      <div className="-mx-6 -mt-4 px-6 pt-4 pb-4 bg-white border-b border-gray-200 sticky top-[-16px] z-20 shadow-sm">
        <div className="flex items-start gap-4">
          {/* Foto (só foto, sem botões extras) */}
          <div className="flex-shrink-0">
            <PatientPhoto
            fotoUrl={fotoPreviewUrl || formData.fotoUrl || undefined}
            onPhotoChange={handlePhotoChange}
            size="xl"
            pacienteNome={formData.nome}
            pacienteTelefone={formData.telefone}
            clinicaNome={clinicaNome}
            pacienteId={pacienteParaUsar?.id}
            clinicaId={clinicaId}
            onFotoAtualizada={(novaFotoUrl) => {
              setFormData({
                ...formData,
                fotoUrl: novaFotoUrl
              });
              if (novaFotoUrl.startsWith('/uploads')) {
                setFotoPreviewUrl(
                  `${API_BASE_URL}${novaFotoUrl}?t=${Date.now()}`
                );
              } else {
                setFotoPreviewUrl(novaFotoUrl);
              }
            }} />
          
          </div>

          {/* Campos do formulário + botões Carteirinha/Recibo */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Input
                label="Nome Completo *"
                value={formData.nome}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    nome: val
                  }));
                  // Limpa alerta se nome mudou
                  if (val.trim() !== nomeVerificadoRef.current) {
                    setHomonimoAlerta([]);
                  }
                }}
                onBlur={() => verificarHomonimoNome(formData.nome)}
                placeholder="Nome completo do paciente"
                required />
              

                {verificandoHomonimo &&
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Verificando homônimos...
                  </p>
              }
                {homonimoAlerta.length > 0 && !verificandoHomonimo &&
              <div className="mt-1.5 p-2.5 bg-amber-50 border border-amber-300 rounded-lg">
                    <p className="text-xs font-semibold text-amber-800 mb-1.5">
                      ⚠️ Possível homônimo! Já existe(m) {homonimoAlerta.length}{' '}
                      paciente(s) com nome similar:
                    </p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {homonimoAlerta.slice(0, 5).map((h: any, i: number) =>
                  <p key={i} className="text-xs text-amber-700">
                          <strong>{h.nome}</strong>
                          {h.cpf && ` • CPF: ${h.cpf}`}
                          {h.telefone && ` • Tel: ${h.telefone}`}
                          {h.dataNascimento &&
                    ` • Nasc: ${new Date(h.dataNascimento + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                        </p>
                  )}
                      {homonimoAlerta.length > 5 &&
                  <p className="text-xs text-amber-600">
                          ...e mais {homonimoAlerta.length - 5}
                        </p>
                  }
                    </div>
                    <button
                  type="button"
                  onClick={() => setHomonimoAlerta([])}
                  className="text-xs text-amber-600 hover:text-amber-800 mt-1 underline">
                  
                      Entendi, prosseguir
                    </button>
                  </div>
              }
              </div>
              <div>
                <Input
                label="Matrícula *"
                value={formData.matricula}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    matricula: val
                  }));
                }}
                placeholder="Nº matrícula"
                required />
              
              </div>
              <div>
                <Select
                label="Status *"
                value={formData.status}
                onChange={(e) => {
                  const val = e.target.value as StatusPaciente;
                  setFormData((prev) => ({
                    ...prev,
                    status: val
                  }));
                }}
                options={[
                {
                  value: 'pre_cadastro',
                  label: 'Pré-Cadastro'
                },
                {
                  value: 'ativo',
                  label: 'Ativo'
                },
                {
                  value: 'inativo',
                  label: 'Inativo'
                },
                {
                  value: 'suspenso',
                  label: 'Suspenso'
                },
                {
                  value: 'cancelado',
                  label: 'Cancelado'
                },
                {
                  value: 'excluido',
                  label: 'Excluído'
                },
                {
                  value: 'term_tratamento',
                  label: 'Término de Tratamento'
                },
                {
                  value: 'outros',
                  label: 'Outros'
                }]
                } />
              
              </div>

              <div>
                <Input
                label="Celular/WhatsApp *"
                value={formData.telefone}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    telefone: val
                  }));
                }}
                placeholder="(00) 00000-0000"
                required />
              
              </div>
              <div>
                <Input
                label="Data Nascimento *"
                type="date"
                value={formData.dataNascimento}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    dataNascimento: val
                  }));
                }}
                required />
              
              </div>
              <div>
                <Input
                label="Idade"
                value={
                formData.dataNascimento ?
                calcularIdade(formData.dataNascimento).toString() :
                ''
                }
                disabled
                placeholder="Auto" />
              
              </div>
              <div>
                <Input
                label="Data Início"
                type="date"
                value={formData.dataInicio}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  dataInicio: e.target.value
                })
                } />
              
              </div>
            </div>

            {/* Badges + Botões */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Badge do titular: atalho direto para a ficha do titular */}
              {formData.titularId &&
            formData.titularId !== '__pendente__' &&
            formData.titularNome && (
            onAbrirRelacionado ?
            <button
              type="button"
              onClick={() => onAbrirRelacionado(formData.titularId)}
              title={`Abrir a ficha de ${formData.titularNome}`}
              className="flex items-center gap-1 text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold border border-purple-200 uppercase tracking-wide hover:bg-purple-200 hover:border-purple-300 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400">
              
                    Dep. de {formData.titularNome}
                    <ExternalLinkIcon className="w-3 h-3" />
                  </button> :

            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold border border-purple-200 uppercase tracking-wide">
                    Dep. de {formData.titularNome}
                  </span>)
            }

              {pacienteParaUsar &&
            <>
                  <button
                type="button"
                onClick={() => setShowCarteirinha(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap">
                
                    <CreditCardIcon className="w-3.5 h-3.5" />
                    Carteirinha
                  </button>
                  <button
                type="button"
                onClick={() => setShowRecibo(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap">
                
                    <FileTextIcon className="w-3.5 h-3.5" />
                    Recibo / NFSe
                  </button>
                  {/* ⭐ Ficha Cadastral: documento A4 com os dados já
                   carregados + consultas do paciente */}
                  <button
                type="button"
                onClick={handleImprimirFicha}
                disabled={gerandoFicha}
                title="Gerar a ficha cadastral para impressão"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed">
                
                    <PrinterIcon className="w-3.5 h-3.5" />
                    {gerandoFicha ? 'Gerando...' : 'Ficha'}
                  </button>
                </>
            }
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pt-4 mt-2 border-t border-gray-100">
          {tabs.map((tab) =>
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id as any)}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
          
              {tab.label}
            </button>
        )}
        </div>
      </div>

      <div className="py-6">
        {/* Dados Básicos (Restante) */}
        {activeTab === 'dados' &&
      <div className="space-y-4">
            {/* Nº Contrato + Gênero + Estado Civil + Dif. Locomoção + Felicitação */}
            <div className="grid grid-cols-4 gap-4">
              <Input
            label="N° Contrato (auto)"
            value={formData.numeroContrato}
            onChange={(e) =>
            setFormData({
              ...formData,
              numeroContrato: e.target.value
            })
            }
            placeholder="Gerado automaticamente" />
          

              <Select
            label="Gênero *"
            value={formData.genero}
            onChange={(e) =>
            setFormData({
              ...formData,
              genero: e.target.value as Genero
            })
            }
            options={[
            {
              value: 'masculino',
              label: 'Masculino'
            },
            {
              value: 'feminino',
              label: 'Feminino'
            },
            {
              value: 'outro',
              label: 'Outro'
            },
            {
              value: 'nao_informar',
              label: 'Prefiro não informar'
            }]
            } />
          

              <Select
            label="Estado Civil"
            value={formData.estadoCivil}
            onChange={(e) =>
            setFormData({
              ...formData,
              estadoCivil: e.target.value as EstadoCivil
            })
            }
            options={[
            {
              value: 'solteiro',
              label: 'Solteiro(a)'
            },
            {
              value: 'casado',
              label: 'Casado(a)'
            },
            {
              value: 'divorciado',
              label: 'Divorciado(a)'
            },
            {
              value: 'viuvo',
              label: 'Viúvo(a)'
            },
            {
              value: 'uniao_estavel',
              label: 'União Estável'
            }]
            } />
          

              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                type="checkbox"
                checked={formData.dificuldadeLocomocao}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  dificuldadeLocomocao: e.target.checked,
                  necessidadeEspecial: e.target.checked ?
                  formData.necessidadeEspecial :
                  ''
                })
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              

                  <span className="text-sm text-gray-700">Dif. Locomoção</span>
                </label>
              </div>
            </div>

            {/* ⭐ Toggle de Felicitação de Aniversário */}
            <div className="flex items-center gap-3 p-3 bg-pink-50 border border-pink-200 rounded-lg">
              <span className="text-lg">🎂</span>
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input
              type="checkbox"
              checked={(formData as any).felicitarAniversario !== 0}
              onChange={(e) =>
              setFormData({
                ...formData,
                felicitarAniversario: e.target.checked ? 1 : 0
              } as any)
              }
              className="w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500" />
            

                <span className="text-sm text-gray-700">
                  Felicitar aniversário via WhatsApp
                </span>
              </label>
              <span className="text-xs text-gray-400">
                {(formData as any).felicitarAniversario === 0 ?
            'Desativado' :
            'Ativado'}
              </span>
            </div>

            {/* ⭐ Necessidade Especial - aparece quando dificuldade de locomoção está marcada */}
            {formData.dificuldadeLocomocao &&
        <Select
          label="Necessidade Especial"
          value={formData.necessidadeEspecial}
          onChange={(e) =>
          setFormData({
            ...formData,
            necessidadeEspecial: e.target.value
          })
          }
          options={[
          {
            value: '',
            label: 'Sem necessidade'
          },
          {
            value: 'CRIANÇA',
            label: 'Criança'
          },
          {
            value: 'IDOSO',
            label: 'Idoso'
          },
          {
            value: 'NECESSIDADE ESPECIAL',
            label: 'Portador de Necessidade Especial'
          },
          {
            value: 'RETORNO CIRURGIA',
            label: 'Retorno de Cirurgia'
          },
          {
            value: 'GESTANTE',
            label: 'Gestante'
          },
          {
            value: 'CADEIRANTE',
            label: 'Cadeirante'
          },
          {
            value: 'DEFICIENTE VISUAL',
            label: 'Deficiente Visual'
          },
          {
            value: 'DEFICIENTE AUDITIVO',
            label: 'Deficiente Auditivo'
          }]
          } />

        }

            {/* ⭐ SEÇÃO DE ENDEREÇO */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <MapPinIcon className="w-4 h-4 text-gray-600" />
                <h4 className="font-medium text-gray-900 text-sm">Endereço</h4>
              </div>

              <div className="grid grid-cols-6 gap-2">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    CEP
                  </label>
                  <div className="relative">
                    <input
                  type="text"
                  value={formData.cep}
                  onChange={handleCepChange}
                  placeholder="00000-000"
                  maxLength={9}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                

                    {buscandoCep &&
                <Loader2 className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-blue-600" />
                }
                    {cepEncontrado && !buscandoCep &&
                <CheckCircleIcon className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-green-600" />
                }
                  </div>
                  {erroCep &&
              <p className="text-xs text-red-600 mt-0.5">{erroCep}</p>
              }
                </div>

                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Logradouro
                  </label>
                  <input
                type="text"
                value={formData.logradouro}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  logradouro: e.target.value
                })
                }
                placeholder="Rua, Avenida, etc"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Número
                  </label>
                  <input
                id="campo-numero-endereco"
                type="text"
                value={formData.numero}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  numero: e.target.value
                })
                }
                placeholder="Nº"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Compl.
                  </label>
                  <input
                type="text"
                value={formData.complemento}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  complemento: e.target.value
                })
                }
                placeholder="Apto"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
              </div>

              <div className="grid grid-cols-6 gap-2 mt-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Bairro
                  </label>
                  <input
                type="text"
                value={formData.bairro}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  bairro: e.target.value
                })
                }
                placeholder="Bairro"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>

                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cidade
                  </label>
                  <input
                type="text"
                value={formData.cidade}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cidade: e.target.value
                })
                }
                placeholder="Cidade"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    UF
                  </label>
                  <input
                type="text"
                value={formData.uf}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  uf: e.target.value
                })
                }
                placeholder="UF"
                maxLength={2}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
              </div>
            </div>

            {/* ⭐ DOCUMENTOS - integrado na aba Dados Básicos */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <FileTextIcon className="w-4 h-4 text-gray-600" />
                <h4 className="font-medium text-gray-900 text-sm">
                  Documentos
                </h4>
              </div>
              <div className="grid grid-cols-6 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    CPF *
                  </label>
                  <input
                type="text"
                value={formData.cpf}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cpf: e.target.value
                })
                }
                placeholder="000.000.000-00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    RG
                  </label>
                  <input
                type="text"
                value={formData.rg}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  rg: e.target.value
                })
                }
                placeholder="Número do RG"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Emissor
                  </label>
                  <input
                type="text"
                value={formData.emissorRg}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  emissorRg: e.target.value
                })
                }
                placeholder="SSP"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    CNS
                  </label>
                  <input
                type="text"
                value={formData.cns}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cns: e.target.value
                })
                }
                placeholder="Nº CNS"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 mt-2">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    PIS/PASEP
                  </label>
                  <input
                type="text"
                value={formData.pisPasep}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  pisPasep: e.target.value
                })
                }
                placeholder="Nº PIS"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Profissão
                  </label>
                  <input
                type="text"
                value={formData.profissao}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  profissao: e.target.value
                })
                }
                placeholder="Profissão"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Grau de Instrução
                  </label>
                  <select
                value={formData.grauInstrucao || ''}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  grauInstrucao: e.target.value as GrauInstrucao
                })
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                
                    <option value="">Selecione...</option>
                    <option value="fundamental">Ensino Fundamental</option>
                    <option value="medio">Ensino Médio</option>
                    <option value="superior">Ensino Superior</option>
                    <option value="pos_graduacao">Pós-Graduação</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ⭐ FILIACAO / RESPONSAVEL */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <UsersIcon className="w-4 h-4 text-gray-600" />
                <h4 className="font-medium text-gray-900 text-sm">
                  Filiação / Responsável
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nome da Mãe
                  </label>
                  <input
                type="text"
                value={formData.nomeMae}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  nomeMae: e.target.value
                })
                }
                placeholder="Nome completo da mãe"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nome do Pai
                  </label>
                  <input
                type="text"
                value={formData.nomePai}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  nomePai: e.target.value
                })
                }
                placeholder="Nome completo do pai"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nome Responsável
                  </label>
                  <input
                type="text"
                value={formData.nomeResponsavel}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  nomeResponsavel: e.target.value
                })
                }
                placeholder="Responsável legal"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    CPF Responsável
                  </label>
                  <input
                type="text"
                value={formData.cpfResponsavel}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cpfResponsavel: e.target.value
                })
                }
                placeholder="000.000.000-00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    RG Responsável
                  </label>
                  <input
                type="text"
                value={formData.rgResponsavel}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  rgResponsavel: e.target.value
                })
                }
                placeholder="Número do RG"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
              </div>
            </div>

            {/* ⭐ CONTATOS - integrado na aba Dados Básicos */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <PhoneIcon className="w-4 h-4 text-gray-600" />
                <h4 className="font-medium text-gray-900 text-sm">Contatos</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Telefone Residencial
                  </label>
                  <input
                type="text"
                value={formData.telefoneResidencial}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  telefoneResidencial: e.target.value
                })
                }
                placeholder="(00) 0000-0000"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  email: e.target.value
                })
                }
                placeholder="email@exemplo.com"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              
                </div>
              </div>
              {/* ⭐ Botão para enviar menu de ajuda via WhatsApp */}
              {pacienteParaUsar && formData.telefone &&
          <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-gray-700">
                        WhatsApp
                      </span>
                      <p className="text-[10px] text-gray-500">
                        Envie o menu de ajuda para o paciente
                      </p>
                    </div>
                    <EnviarMenuAjudaButton
                pacienteId={pacienteParaUsar.id}
                pacienteNome={formData.nome || pacienteParaUsar.nome}
                pacienteTelefone={formData.telefone}
                clinicaId={clinicaId}
                pacienteFotoUrl={pacienteParaUsar.fotoUrl} />
              
                  </div>
                </div>
          }
            </div>

            {/* ⭐ PROFISSIONAL RESPONSÁVEL */}
            <div className="grid grid-cols-2 gap-2">
              <Select
            label="Profissional Responsável"
            value={formData.profissionalResponsavelId}
            onChange={(e) => {
              const profId = e.target.value;
              const prof = profissionais.find((p) => p.id === profId);
              setFormData({
                ...formData,
                profissionalResponsavelId: profId,
                profissionalResponsavel: prof?.nome || ''
              });
            }}
            options={[
            {
              value: '',
              label: carregandoDados ?
              'Carregando...' :
              'Selecione o profissional'
            },
            ...profissionais.map((p) => ({
              value: p.id,
              label: `${p.nome}${p.crm ? ` (CRM: ${p.crm}${p.uf ? `/${p.uf}` : ''})` : ''} - ${p.tipo === 'medico' ? 'Médico' : 'Dentista'}`
            }))]
            } />
          

              <Input
            label="Profissional (texto livre)"
            value={formData.profissionalResponsavel}
            onChange={(e) =>
            setFormData({
              ...formData,
              profissionalResponsavel: e.target.value
            })
            }
            placeholder="Ou digite o nome manualmente" />
          
            </div>

            {/* ⭐⭐⭐ FIX v10.9.6: SEÇÕES CONVÊNIO + EMPRESA MOVIDAS PARA O FINAL ⭐⭐⭐ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* ⭐ SEÇÃO DE PLANO DE SAÚDE / CONVÊNIO */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HeartPulseIcon className="w-4 h-4 text-blue-600" />
                    <h4 className="font-medium text-blue-900 text-sm">
                      Convênio / Plano de Saúde
                    </h4>
                  </div>
                  <div className="flex gap-2">
                    {!mostrarNovoConvenio &&
                <button
                  type="button"
                  onClick={() => setMostrarNovoConvenio(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                  
                        <PlusIcon className="w-3 h-3" />
                        Novo
                      </button>
                }
                    {!mostrarNovoPlano && formData.convenioId &&
                <button
                  type="button"
                  onClick={() => setMostrarNovoPlano(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                  
                        <PlusIcon className="w-3 h-3" />
                        Plano
                      </button>
                }
                  </div>
                </div>

                {mostrarNovoConvenio &&
            <div className="mb-3 p-2 bg-white rounded border border-blue-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        Novo Convênio
                      </span>
                      <button
                  type="button"
                  onClick={() => {
                    setMostrarNovoConvenio(false);
                    setNovoConvenioNome('');
                  }}
                  className="text-gray-400 hover:text-gray-600">
                  
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                  type="text"
                  value={novoConvenioNome}
                  onChange={(e) => setNovoConvenioNome(e.target.value)}
                  placeholder="Nome do convênio"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novoConvenioNome.trim()) {
                      e.preventDefault();
                      handleCriarConvenio();
                    }
                  }}
                  autoFocus />
                

                      <Button
                  type="button"
                  size="sm"
                  onClick={handleCriarConvenio}
                  disabled={!novoConvenioNome.trim() || salvandoConvenio}
                  className="px-2 py-1 text-xs">
                  
                        {salvandoConvenio ?
                  <Loader2 className="w-3 h-3 animate-spin" /> :

                  <CheckCircleIcon className="w-3 h-3" />
                  }
                      </Button>
                    </div>
                  </div>
            }

                {mostrarNovoPlano &&
            <div className="mb-3 p-2 bg-white rounded border border-blue-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        Novo Plano
                      </span>
                      <button
                  type="button"
                  onClick={() => {
                    setMostrarNovoPlano(false);
                    setNovoPlanoNome('');
                  }}
                  className="text-gray-400 hover:text-gray-600">
                  
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                  type="text"
                  value={novoPlanoNome}
                  onChange={(e) => setNovoPlanoNome(e.target.value)}
                  placeholder="Nome do plano"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novoPlanoNome.trim()) {
                      e.preventDefault();
                      handleCriarPlanoSaude();
                    }
                  }}
                  autoFocus />
                

                      <Button
                  type="button"
                  size="sm"
                  onClick={handleCriarPlanoSaude}
                  disabled={!novoPlanoNome.trim() || salvandoPlano}
                  className="px-2 py-1 text-xs">
                  
                        {salvandoPlano ?
                  <Loader2 className="w-3 h-3 animate-spin" /> :

                  <CheckCircleIcon className="w-3 h-3" />
                  }
                      </Button>
                    </div>
                  </div>
            }

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Convênio
                    </label>
                    <select
                  value={formData.convenioId}
                  onChange={(e) => handleConvenioChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                  
                      <option value="">
                        {carregandoDados ? 'Carregando...' : 'Particular'}
                      </option>
                      {convenios.
                  filter((c) => c.ativo).
                  map((c) =>
                  <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                  )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Plano
                    </label>
                    <select
                  value={formData.planoSaudeId}
                  onChange={(e) =>
                  setFormData({
                    ...formData,
                    planoSaudeId: e.target.value
                  })
                  }
                  disabled={!formData.convenioId}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100">
                  
                      <option value="">
                        {!formData.convenioId ?
                    'Selecione convênio' :
                    'Selecione'}
                      </option>
                      {planosDoConvenio.
                  filter((p) => p.ativo).
                  map((p) =>
                  <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                  )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nº Carteirinha
                  </label>
                  <input
                type="text"
                value={formData.numeroCarteirinha}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  numeroCarteirinha: e.target.value
                })
                }
                placeholder="Número da carteirinha"
                disabled={!formData.planoSaudeId}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100" />
              
                </div>
              </div>

              {/* ⭐ SEÇÃO DE EMPRESA CONVENIADA E UNIDADE */}
              <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="w-4 h-4 text-teal-600" />
                    <h4 className="font-medium text-teal-900 text-sm">
                      Empresa Conveniada / Associada
                    </h4>
                  </div>
                  {!mostrarNovaEmpresa &&
              <button
                type="button"
                onClick={() => setMostrarNovaEmpresa(true)}
                className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors">
                
                      <PlusIcon className="w-3 h-3" />
                      Nova
                    </button>
              }
                </div>

                {mostrarNovaEmpresa &&
            <div className="mb-3 p-2 bg-white rounded border border-teal-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        Nova Empresa
                      </span>
                      <button
                  type="button"
                  onClick={() => {
                    setMostrarNovaEmpresa(false);
                    setNovaEmpresaNome('');
                    setNovaEmpresaCnpj('');
                  }}
                  className="text-gray-400 hover:text-gray-600">
                  
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <input
                  type="text"
                  value={novaEmpresaNome}
                  onChange={(e) => setNovaEmpresaNome(e.target.value)}
                  placeholder="Nome da empresa"
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  autoFocus />
                

                      <div className="flex gap-2">
                        <input
                    type="text"
                    value={novaEmpresaCnpj}
                    onChange={(e) => setNovaEmpresaCnpj(e.target.value)}
                    placeholder="CNPJ (opcional)"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500" />
                  

                        <Button
                    type="button"
                    size="sm"
                    onClick={handleCriarEmpresaConveniada}
                    disabled={!novaEmpresaNome.trim() || salvandoEmpresa}
                    className="px-2 py-1 text-xs">
                    
                          {salvandoEmpresa ?
                    <Loader2 className="w-3 h-3 animate-spin" /> :

                    <CheckCircleIcon className="w-3 h-3" />
                    }
                        </Button>
                      </div>
                    </div>
                  </div>
            }

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <EmpresaBuscaSelectAPI
                  clinicaId={clinicaId}
                  value={formData.empresaConveniadaId || ''}
                  onChange={(id) => handleEmpresaChange(id)}
                  label="Empresa"
                  placeholder="Buscar empresa..." />
                
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        Unidade (Local de trabalho)
                      </span>
                      {!mostrarNovaUnidade &&
                  <button
                    type="button"
                    onClick={() => setMostrarNovaUnidade(true)}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors">
                    
                          <PlusIcon className="w-3 h-3" />
                          Nova
                        </button>
                  }
                    </div>
                    {mostrarNovaUnidade &&
                <div className="mb-2 p-2 bg-white rounded border border-teal-300">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            Nova Unidade
                          </span>
                          <button
                      type="button"
                      onClick={() => {
                        setMostrarNovaUnidade(false);
                        setNovaUnidadeNome('');
                      }}
                      className="text-gray-400 hover:text-gray-600">
                      
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                      type="text"
                      value={novaUnidadeNome}
                      onChange={(e) => setNovaUnidadeNome(e.target.value)}
                      placeholder="Nome da unidade"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      autoFocus />
                    
                          <Button
                      type="button"
                      size="sm"
                      onClick={handleCriarUnidade}
                      disabled={
                      !novaUnidadeNome.trim() ||
                      !formData.empresaConveniadaId ||
                      salvandoUnidade
                      }
                      className="px-2 py-1 text-xs">
                      
                            {salvandoUnidade ?
                      <Loader2 className="w-3 h-3 animate-spin" /> :

                      <CheckCircleIcon className="w-3 h-3" />
                      }
                          </Button>
                        </div>
                      </div>
                }
                    <UnidadeBuscaSelectAPI
                  clinicaId={clinicaId}
                  empresaId={formData.empresaConveniadaId || ''}
                  value={formData.unidadeEmpresaId || ''}
                  onChange={(id) =>
                  setFormData({
                    ...formData,
                    unidadeEmpresaId: id
                  })
                  }
                  label=""
                  placeholder="Buscar unidade..." />
                
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Local Trabalho
                    </label>
                    <input
                  type="text"
                  value={formData.empresa}
                  onChange={(e) =>
                  setFormData({
                    ...formData,
                    empresa: e.target.value
                  })
                  }
                  placeholder="Empresa onde trabalha"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500" />
                
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Registro
                    </label>
                    <input
                  type="text"
                  value={formData.registroEmpresa}
                  onChange={(e) =>
                  setFormData({
                    ...formData,
                    registroEmpresa: e.target.value
                  })
                  }
                  placeholder="Matrícula"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500" />
                
                  </div>
                </div>
              </div>
            </div>
          </div>
      }

        {/* Documentos Digitais */}
        {activeTab === 'docs_digitais' && pacienteParaUsar &&
      <DocumentosManager
        clinicaId={clinicaId}
        pacienteId={pacienteParaUsar.id}
        pacienteNome={pacienteParaUsar.nome}
        pacienteTelefone={formData.telefone || pacienteParaUsar.telefone} />

      }

        {/* Financeiro */}
        {activeTab === 'financeiro' &&
      <div className="space-y-4">
            {/* ⭐ DADOS DO CONTRATO - gravados no cadastro do paciente */}
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <CreditCardIcon className="w-4 h-4 text-emerald-600" />
                <h4 className="font-semibold text-emerald-900 text-sm">
                  Dados do Contrato
                </h4>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  Gravado no cadastro
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Tipo de Cobrança
                  </label>
                  <select
                value={formData.tipoCobranca}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  tipoCobranca: e.target.value
                })
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500">
                
                    <option value="">Não definido</option>
                    <option value="parcelamento">Parcelamento</option>
                    <option value="mensalidade">Mensalidade</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Valor Mensal (R$)
                  </label>
                  <input
                type="number"
                step="0.01"
                min="0"
                value={formData.valorMensalidade}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  valorMensalidade: e.target.value
                })
                }
                placeholder="0,00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
              
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Dia Vencimento
                  </label>
                  <input
                type="number"
                min="1"
                max="31"
                value={formData.diaVencimentoMensalidade}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  diaVencimentoMensalidade: e.target.value
                })
                }
                placeholder="10"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
              
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Forma Pagamento
                  </label>
                  <select
                value={formData.formaPagamentoPadrao}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  formaPagamentoPadrao: e.target.value
                })
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500">
                
                    <option value="pix">PIX</option>
                    <option value="boleto">Boleto</option>
                    <option value="cartao">Cartão</option>
                    <option value="dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Profissional Financeiro
                  </label>
                  <select
                value={formData.profissionalFinanceiroId}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  profissionalFinanceiroId: e.target.value
                })
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500">
                
                    <option value="">Nenhum</option>
                    {profissionais.map((p) =>
                <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.crm ? ` (CRM: ${p.crm})` : ''}
                      </option>
                )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Observações do Contrato
                  </label>
                  <input
                type="text"
                value={formData.contratoObservacoes}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  contratoObservacoes: e.target.value
                })
                }
                placeholder="Ex: Mensalidade R$ 150/mês, vencimento dia 10"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
              
                </div>
              </div>

              {formData.tipoCobranca && formData.valorMensalidade &&
          <div className="mt-3 p-2 bg-white rounded border border-emerald-200">
                  <p className="text-xs text-emerald-800 font-medium">
                    📋 Resumo:{' '}
                    {formData.tipoCobranca === 'mensalidade' ?
              'Mensalidade' :
              'Parcelamento'}{' '}
                    de{' '}
                    <strong>
                      R$ {Number(formData.valorMensalidade).toFixed(2)}
                    </strong>{' '}
                    • Vencimento dia{' '}
                    <strong>{formData.diaVencimentoMensalidade || '10'}</strong>{' '}
                    • Pagamento via{' '}
                    <strong>
                      {formData.formaPagamentoPadrao === 'pix' ?
                'PIX' :
                formData.formaPagamentoPadrao === 'boleto' ?
                'Boleto' :
                formData.formaPagamentoPadrao === 'cartao' ?
                'Cartão' :
                'Dinheiro'}
                    </strong>
                  </p>
                </div>
          }

              {/* ⭐ BOTÃO GERAR PARCELAS - conecta dados do contrato com o FinanceiroManager */}
              {pacienteParaUsar &&
          formData.tipoCobranca &&
          formData.valorMensalidade &&
          <div className="mt-3 pt-3 border-t border-emerald-200">
                    <button
              type="button"
              onClick={() => setAbrirContratoFlag(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
              
                      <PlusIcon className="w-4 h-4" />
                      Gerar Parcelas com Estes Dados
                    </button>
                    <p className="text-[10px] text-emerald-600 text-center mt-1">
                      Abre o formulário de geração já preenchido com os dados
                      acima
                    </p>
                  </div>
          }

              {!pacienteParaUsar &&
          formData.tipoCobranca &&
          formData.valorMensalidade &&
          <div className="mt-3 pt-3 border-t border-emerald-200">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-500 text-sm font-medium rounded-lg">
                      <AlertCircleIcon className="w-4 h-4" />
                      Salve o paciente primeiro para gerar parcelas
                    </div>
                  </div>
          }
            </div>

            {/* ⭐ Parcelas e geração de contrato (componente existente) */}
            {pacienteParaUsar &&
        <FinanceiroManager
          clinicaId={clinicaId}
          pacienteId={pacienteParaUsar.id}
          paciente={pacienteParaUsar}
          dadosContrato={{
            tipoCobranca: formData.tipoCobranca,
            valorMensalidade: formData.valorMensalidade,
            diaVencimentoMensalidade: formData.diaVencimentoMensalidade,
            formaPagamentoPadrao: formData.formaPagamentoPadrao,
            profissionalFinanceiroId: formData.profissionalFinanceiroId,
            contratoObservacoes: formData.contratoObservacoes
          }}
          abrirNovoContrato={abrirContratoFlag}
          onNovoContratoAberto={() => setAbrirContratoFlag(false)} />

        }

            {!pacienteParaUsar &&
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <CreditCardIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium text-sm">
                  Salve o paciente primeiro para gerar parcelas
                </p>
              </div>
        }
          </div>
      }

        {/* REMOVIDO: bloco duplicado de financeiro sem paciente - agora integrado acima */}
        {false && activeTab === 'financeiro' && !pacienteParaUsar &&
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <CreditCardIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Módulo Financeiro</p>
            <p className="text-sm text-gray-500 mt-1">
              Salve o paciente primeiro para acessar o módulo financeiro.
            </p>
          </div>
      }

        {/* ⭐ NOVA ABA: Histórico */}
        {activeTab === 'historico' && pacienteParaUsar &&
      <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Histórico de Consultas
              </h3>
              <div className="text-sm text-gray-500">
                Total: {consultasPaciente.length} consulta(s)
              </div>
            </div>

            {carregandoConsultas ?
        <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div> :
        consultasPaciente.length === 0 ?
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">
                  Nenhuma consulta encontrada
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Este paciente ainda não possui consultas agendadas.
                </p>
              </div> :

        <div className="space-y-3">
                {consultasPaciente.map((consulta) => {
            const dataObj = new Date(`${consulta.data}T12:00:00`);
            const dataFormatada = dataObj.toLocaleDateString('pt-BR');
            const jaChegou = !!(consulta as any).horaChegada;
            const isCancelada = consulta.status === 'cancelada';
            const hoje = new Date().toISOString().split('T')[0];
            const isHoje = consulta.data === hoje;
            // ⭐ Cores por status (mesmo padrão da AgendaPage)
            const statusColors: Record<string, string> = {
              agendada: '#D1D5DB',
              aguardando_confirmacao: '#8B5CF6',
              confirmada: '#3B82F6',
              realizada: '#6366F1',
              cancelada: '#DC2626',
              aguardando_remarcacao: '#F97316',
              compareceu: '#22C55E',
              nao_compareceu: '#EF4444',
              faltou: '#EF4444',
              em_atendimento: '#A855F7',
              finalizado: '#10B981',
              atendido: '#10B981',
              atendida: '#10B981',
              aguardando: '#F59E0B'
            };
            const corStatus =
            statusColors[
            (consulta.status || '').toLowerCase().trim()] ||
            '#6B7280';
            // ⭐ Badge de status (mesmo padrão da AgendaPage)
            const statusBadges: Record<
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
                label: 'Confirmada',
                color: 'bg-blue-100 text-blue-800'
              },
              realizada: {
                label: 'Realizada',
                color: 'bg-indigo-100 text-indigo-800'
              },
              cancelada: {
                label: 'Cancelada',
                color: 'bg-red-200 text-red-900'
              },
              aguardando_remarcacao: {
                label: 'Remarcar',
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
            const badge =
            statusBadges[consulta.status] || statusBadges.agendada;
            // Hora de chegada formatada
            const formatarHoraChegadaCard = (iso: string) => {
              try {
                const d = new Date(iso);
                if (!isNaN(d.getTime())) {
                  return d.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                }
                const match = iso.match(/^(\d{1,2}:\d{2})/);
                if (match) return match[1];
                return iso;
              } catch {
                return '--:--';
              }
            };
            // Handler de marcar chegada via API
            const handleMarcarChegadaCard = async () => {
              try {
                const agora = new Date().toISOString();
                const updates: any = jaChegou ?
                {
                  horaChegada: null,
                  statusAtendimento: null,
                  status: 'agendada'
                } :
                {
                  horaChegada: agora,
                  statusAtendimento: 'aguardando',
                  status: 'confirmada'
                };
                const response = await fetch(
                  `${API_BASE_URL}/api/consultas/${consulta.id}`,
                  {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      clinicaId,
                      ...updates
                    })
                  }
                );
                if (response.ok) {
                  setConsultasPaciente((prev) =>
                  prev.map((c) =>
                  c.id === consulta.id ?
                  {
                    ...c,
                    ...updates
                  } as any :
                  c
                  )
                  );
                }
              } catch (err) {
                console.error('Erro ao marcar chegada:', err);
              }
            };
            return (
              <div
                key={consulta.id}
                className={`rounded-lg border transition-all ${isCancelada ? 'opacity-60' : 'hover:shadow-md'}`}
                style={{
                  background: `linear-gradient(90deg, ${corStatus}2E 0%, ${corStatus}14 25%, ${corStatus}08 50%, white 80%)`
                }}>
                
                      <div className="flex items-center gap-3 p-3">
                        {/* Barra lateral colorida */}
                        <div
                    className="w-1.5 self-stretch rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: corStatus
                    }}
                    title={consulta.status} />
                  

                        {/* Info da consulta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                        className={`text-sm font-semibold ${isCancelada ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                        
                              📅 {dataFormatada}
                            </span>
                            {consulta.tipoAgendamento === 'encaixe' &&
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-orange-100 text-orange-600">
                                ⚡ ENCAIXE
                              </span>
                      }
                            {isHoje && !isCancelada &&
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-teal-100 text-teal-700 border border-teal-200">
                                HOJE
                              </span>
                      }
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            <span className="font-medium">
                              {consulta.horario}
                            </span>{' '}
                            • {consulta.duracao || 30}min •{' '}
                            {consulta.tipo === 'medica' ? '🩺' : '🦷'} Dr(a).{' '}
                            {consulta.profissional}
                            {consulta.procedimentoNome &&
                      <span className="text-teal-600 ml-1">
                                • 📋 {consulta.procedimentoNome}
                              </span>
                      }
                          </p>

                          {/* Linha extra: chegada, observações, motivo cancelamento */}
                          {(jaChegou ||
                    consulta.observacoes ||
                    isCancelada && consulta.motivoCancelamento) &&
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                              {jaChegou &&
                      <span className="text-purple-700 bg-purple-50 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5 border border-purple-100">
                                  <ClockIcon className="w-3 h-3" />
                                  Chegou{' '}
                                  {formatarHoraChegadaCard(
                          (consulta as any).horaChegada
                        )}
                                </span>
                      }
                              {consulta.observacoes &&
                      <span
                        className="text-gray-500 truncate max-w-[250px]"
                        title={consulta.observacoes}>
                        
                                  📋 {consulta.observacoes}
                                </span>
                      }
                              {isCancelada &&
                      consulta.motivoCancelamento &&
                      (() => {
                        // Data/hora do cancelamento: campos dedicados ou
                        // fallback extraindo de observações.
                        let dataHoraCancel = '';
                        const c: any = consulta;
                        if (
                        c.dataCancelamento ||
                        c.horaCancelamento)
                        {
                          const dataFmt = c.dataCancelamento ?
                          c.dataCancelamento.includes('-') ?
                          c.dataCancelamento.
                          split('-').
                          reverse().
                          join('/') :
                          c.dataCancelamento :
                          '';
                          dataHoraCancel = [
                          dataFmt,
                          c.horaCancelamento ?
                          `às ${c.horaCancelamento}` :
                          ''].

                          filter(Boolean).
                          join(' ');
                        } else if (consulta.observacoes) {
                          const m = consulta.observacoes.match(
                            /CANCELADO em\s+([\d/]+\s+às\s+[\d:]+)/i
                          );
                          if (m) dataHoraCancel = m[1];
                        }
                        return (
                          <span
                            className="text-red-600 bg-red-50 rounded px-1.5 py-0.5 border border-red-200 inline-flex items-center gap-1 flex-wrap max-w-[320px]"
                            title={`${consulta.motivoCancelamento}${dataHoraCancel ? ` — Cancelado em ${dataHoraCancel}` : ''}`}>
                            
                                      <span className="truncate max-w-[250px]">
                                        ❌ {consulta.motivoCancelamento}
                                      </span>
                                      {dataHoraCancel &&
                            <span className="text-red-700 font-medium whitespace-nowrap">
                                          • 🗓️ {dataHoraCancel}
                                        </span>
                            }
                                    </span>);

                      })()}
                            </div>
                    }
                        </div>

                        {/* Status Badge + Ações */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Botão de chegada */}
                          {isHoje && !isCancelada &&
                    <button
                      type="button"
                      onClick={handleMarcarChegadaCard}
                      className={`inline-flex flex-col items-center gap-0.5 transition-colors ${jaChegou ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 hover:text-green-600'}`}
                      title={
                      jaChegou ? 'Cancelar chegada' : 'Marcar chegada'
                      }>
                      
                              <CarIcon
                        className={`${jaChegou ? 'w-5 h-5' : 'w-4 h-4'}`} />
                      

                              {jaChegou &&
                      <span className="text-[10px] font-medium text-blue-500">
                                  {formatarHoraChegadaCard(
                          (consulta as any).horaChegada
                        )}
                                </span>
                      }
                            </button>
                    }

                          {/* Badge de status */}
                          <span
                      className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${badge.color}`}>
                      
                            {badge.label}
                          </span>

                          {/* Link para agenda — só aparece se o usuário tem permissão de 'agenda' */}
                          {onNavigate && temPermissao('agenda') &&
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigate(
                          'agenda',
                          consulta.data,
                          (consulta as any).profissionalId
                        );
                      }}
                      className="text-blue-500 hover:text-blue-700 transition-colors p-1"
                      title={`Ver na agenda do dia ${dataFormatada}`}>
                      
                              <ExternalLinkIcon className="w-4 h-4" />
                            </button>
                    }
                        </div>
                      </div>

                      {/* ⭐ Linha de Valor + Imprimir Recibo */}
                      {!isCancelada &&
                <div className="flex items-center gap-2 px-3 pb-3 pt-0 border-t border-gray-100 mt-0">
                          <div className="flex items-center gap-1.5 flex-1">
                            <DollarSignIcon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            <span className="text-xs text-gray-500">R$</span>
                            <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      defaultValue={(consulta as any).valor || ''}
                      onBlur={async (e) => {
                        const novoValor =
                        parseFloat(e.target.value) || 0;
                        if (
                        novoValor !== ((consulta as any).valor || 0))
                        {
                          try {
                            const resp = await fetch(
                              `${API_BASE_URL}/api/consultas/${consulta.id}`,
                              {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                  clinicaId,
                                  valor: novoValor
                                })
                              }
                            );
                            if (!resp.ok) {
                              const errData = await resp.
                              json().
                              catch(() => ({}));
                              throw new Error(
                                errData.error || 'Erro ao salvar valor'
                              );
                            }
                            // Atualiza local
                            setConsultasPaciente((prev) =>
                            prev.map((c) =>
                            c.id === consulta.id ?
                            {
                              ...c,
                              valor: novoValor
                            } as any :
                            c
                            )
                            );
                            console.log(
                              `✅ Valor da consulta ${consulta.id} salvo: R$ ${novoValor}`
                            );
                          } catch (err: any) {
                            console.error('Erro ao salvar valor:', err);
                            Swal.fire({
                              icon: 'error',
                              title: 'Erro ao salvar valor',
                              text:
                              err.message ||
                              'Não foi possível salvar o valor da consulta.',
                              confirmButtonColor: '#14b8a6'
                            });
                          }
                        }
                      }}
                      className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-md focus:border-green-400 focus:ring-1 focus:ring-green-200 outline-none" />
                    
                          </div>
                          <button
                    type="button"
                    onClick={async () => {
                      const valor = (consulta as any).valor || 0;
                      if (!valor || valor <= 0) {
                        Swal.fire({
                          icon: 'warning',
                          title: 'Valor não informado',
                          text: 'Informe o valor da consulta antes de imprimir o recibo.',
                          confirmButtonColor: '#14b8a6'
                        });
                        return;
                      }
                      // ⭐ Busca dados da sessão para montar o recibo
                      const sessao = localStorage.getItem('sessao');
                      const parsed = sessao ? JSON.parse(sessao) : {};
                      const clinicaAtual = parsed.clinicaAtual || {};
                      const usuario = parsed.usuario || {};
                      const agora = new Date();
                      const dataFormatadaRecibo =
                      agora.toLocaleDateString('pt-BR');
                      const horaFormatada =
                      agora.toLocaleTimeString('pt-BR');
                      const valorFormatado = valor.toLocaleString(
                        'pt-BR',
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }
                      );
                      // ⭐ Monta dados no formato XML-tag esperado pelo PrintServer
                      const dadosImpressao = [
                      `<acao>RECIBO</acao>`,
                      `<id_printserver>${Date.now()}</id_printserver>`,
                      `<clinica>${clinicaAtual.id || clinicaId || ''}</clinica>`,
                      `<contrato>${pacienteParaUsar?.numeroContrato || pacienteParaUsar?.id || ''}</contrato>`,
                      `<matricula>${pacienteParaUsar?.matricula || ''}</matricula>`,
                      `<data>${consulta.data ? new Date(consulta.data + 'T12:00:00').toLocaleDateString('pt-BR') : dataFormatadaRecibo}</data>`,
                      `<hora>${consulta.horario || ''}</hora>`,
                      `<dentista_nome>${consulta.profissional || ''}</dentista_nome>`,
                      `<dt>${dataFormatadaRecibo}</dt>`,
                      `<hr>${horaFormatada}</hr>`,
                      `<titulo>Recibo de consulta/${clinicaAtual.cidade || clinicaAtual.nome || ''}</titulo>`,
                      `<procedimento>${(consulta as any).procedimento || (consulta as any).procedimentoNome || consulta.tipo || ''}</procedimento>`,
                      `<empresa_nome>${clinicaAtual.razaoSocial || clinicaAtual.nome || ''}</empresa_nome>`,
                      `<login>${usuario.nome || ''}</login>`,
                      `<clinica_fone>${clinicaAtual.telefone || ''}</clinica_fone>`,
                      `<nome>${pacienteParaUsar?.nome || consulta.pacienteNome || ''}</nome>`,
                      `<nome_titular>${pacienteParaUsar?.nomeTitular || pacienteParaUsar?.nome || consulta.pacienteNome || ''}</nome_titular>`,
                      `<nome_paciente>${pacienteParaUsar?.nome || consulta.pacienteNome || ''}</nome_paciente>`,
                      `<valor>${valorFormatado}</valor>`];

                      // Tenta enviar para o PrintServer
                      try {
                        const psClientId =
                        clinicaAtual.id || clinicaId || '';
                        const resp = await fetch(
                          `${API_BASE_URL}/api/printserver/imprimir`,
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              clientId: psClientId,
                              clinicaId:
                              clinicaId || clinicaAtual.id || '',
                              dados: dadosImpressao,
                              enqueue: true
                            })
                          }
                        );
                        if (resp.ok) {
                          const result = await resp.json();
                          Swal.fire({
                            icon: 'success',
                            title: 'Recibo enviado!',
                            html: `<p>O recibo foi enviado para a impressora.</p><p class="text-sm text-gray-500 mt-1">Job: ${result.jobId || 'N/A'} | Status: ${result.status || 'enviado'}</p>`,
                            timer: 3000,
                            showConfirmButton: false
                          });
                        } else {
                          const err = await resp.json();
                          throw new Error(
                            err.message ||
                            err.error ||
                            'Erro ao imprimir'
                          );
                        }
                      } catch (err: any) {
                        console.error('Erro ao imprimir recibo:', err);
                        Swal.fire({
                          icon: 'error',
                          title: 'Erro na impressão',
                          html: `<p>Não foi possível enviar para a autenticadora.</p><p class="text-sm text-gray-500 mt-2">${err.message || 'PrintServer pode estar desconectado.'}</p>`,
                          confirmButtonColor: '#14b8a6'
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors"
                    title="Imprimir recibo na autenticadora via PrintServer">
                    
                            <PrinterIcon className="w-3.5 h-3.5" />
                            Recibo
                          </button>
                          {/* ⭐ Botão Ticket - Imprime ticket via PrintServer */}
                          <button
                    type="button"
                    onClick={async () => {
                      const sessao = localStorage.getItem('sessao');
                      const parsed = sessao ? JSON.parse(sessao) : {};
                      const clinicaAtual = parsed.clinicaAtual || {};
                      const usuario = parsed.usuario || {};
                      const agora = new Date();
                      const dataFormatadaTicket =
                      agora.toLocaleDateString('pt-BR');
                      const horaFormatada =
                      agora.toLocaleTimeString('pt-BR');
                      const valorTicket = (
                      (consulta as any).valor || 0).
                      toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      });
                      const dadosImpressao = [
                      `<acao>TICKET</acao>`,
                      `<id_printserver>${Date.now()}</id_printserver>`,
                      `<clinica>${clinicaAtual.id || clinicaId || ''}</clinica>`,
                      `<contrato>${pacienteParaUsar?.numeroContrato || pacienteParaUsar?.id || ''}</contrato>`,
                      `<matricula>${pacienteParaUsar?.matricula || ''}</matricula>`,
                      `<data>${consulta.data ? new Date(consulta.data + 'T12:00:00').toLocaleDateString('pt-BR') : dataFormatadaTicket}</data>`,
                      `<hora>${consulta.horario || ''}</hora>`,
                      `<dentista_nome>${consulta.profissionalTitulo || ''} + ${consulta.profissional || ''}</dentista_nome>`,
                      `<dt>${dataFormatadaTicket}</dt>`,
                      `<hr>${horaFormatada}</hr>`,
                      `<titulo>Ticket de consulta</titulo>`,
                      `<procedimento>${(consulta as any).procedimento || (consulta as any).procedimentoNome || consulta.tipo || ''}</procedimento>`,
                      `<empresa_nome>${clinicaAtual.razaoSocial || clinicaAtual.nome || ''}</empresa_nome>`,
                      `<login>${usuario.nome || ''}</login>`,
                      `<clinica_fone>${clinicaAtual.telefone || ''}</clinica_fone>`,
                      `<nome>${pacienteParaUsar?.nome || consulta.pacienteNome || ''}</nome>`,
                      `<nome_titular>${pacienteParaUsar?.nomeTitular || pacienteParaUsar?.nome || consulta.pacienteNome || ''}</nome_titular>`,
                      `<nome_paciente>${pacienteParaUsar?.nome || consulta.pacienteNome || ''}</nome_paciente>`,
                      `<valor>${valorTicket}</valor>`];

                      try {
                        const psClientId =
                        clinicaAtual.id || clinicaId || '';
                        const resp = await fetch(
                          `${API_BASE_URL}/api/printserver/imprimir`,
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              clientId: psClientId,
                              clinicaId:
                              clinicaId || clinicaAtual.id || '',
                              dados: dadosImpressao,
                              enqueue: true
                            })
                          }
                        );
                        if (resp.ok) {
                          const result = await resp.json();
                          Swal.fire({
                            icon: 'success',
                            title: 'Ticket enviado!',
                            html: `<p>O ticket foi enviado para a impressora.</p><p class="text-sm text-gray-500 mt-1">Job: ${result.jobId || 'N/A'} | Status: ${result.status || 'enviado'}</p>`,
                            timer: 3000,
                            showConfirmButton: false
                          });
                        } else {
                          const err = await resp.json();
                          throw new Error(
                            err.message ||
                            err.error ||
                            'Erro ao imprimir'
                          );
                        }
                      } catch (err: any) {
                        console.error('Erro ao imprimir ticket:', err);
                        Swal.fire({
                          icon: 'error',
                          title: 'Erro na impressão',
                          html: `<p>Não foi possível enviar o ticket.</p><p class="text-sm text-gray-500 mt-2">${err.message || 'PrintServer pode estar desconectado.'}</p>`,
                          confirmButtonColor: '#14b8a6'
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                    title="Imprimir ticket na autenticadora via PrintServer">
                    
                            <PrinterIcon className="w-3.5 h-3.5" />
                            Ticket
                          </button>
                        </div>
                }
                    </div>);

          })}
              </div>
        }
          </div>
      }

        {/* ⭐ NOVA ABA: Mensagens */}
        {activeTab === 'mensagens' && pacienteParaUsar &&
      <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <MessageCircleIcon className="w-5 h-5 text-green-600" />
                Mensagens
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {mensagensPaciente.length} mensagem(ns)
                </span>
                <button
              type="button"
              onClick={() => {
                mensagensCarregadasRef.current = false;
                setMensagensPaciente([]);
                setActiveTab('mensagens');
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="Atualizar mensagens">
              
                  <RefreshCwIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {carregandoMensagens ?
        <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              </div> :
        mensagensPaciente.length === 0 ?
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <MessageCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">
                  Nenhuma mensagem encontrada
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  As mensagens enviadas e recebidas deste paciente aparecerão
                  aqui.
                </p>
              </div> :

        <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                {/* Lista de mensagens estilo chat */}
                <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
                  {mensagensPaciente.map((msg: any) => {
              const isEnviada = msg.tipo === 'enviada';
              const dataHora = msg.dataHora ?
              new Date(msg.dataHora).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              }) :
              '';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isEnviada ? 'justify-end' : 'justify-start'}`}>
                  
                        <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isEnviada ? 'bg-green-500 text-white rounded-br-md' : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'}`}>
                    
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.conteudo}
                          </p>
                          <div
                      className={`flex items-center gap-1 mt-1 ${isEnviada ? 'justify-end' : 'justify-start'}`}>
                      
                            <span
                        className={`text-[10px] ${isEnviada ? 'text-green-100' : 'text-gray-400'}`}>
                        
                              {dataHora}
                            </span>
                            {isEnviada &&
                      <CheckCheckIcon
                        className={`w-3 h-3 ${msg.status === 'lida' ? 'text-blue-200' : msg.status === 'entregue' ? 'text-green-200' : 'text-green-100'}`} />

                      }
                            {msg.status === 'erro' &&
                      <AlertCircleIcon className="w-3 h-3 text-red-300" />
                      }
                          </div>
                        </div>
                      </div>);

            })}
                  <div ref={mensagensEndRef} />
                </div>

                {/* Campo de envio */}
                <div className="border-t border-gray-200 p-3 bg-white">
                  <div className="flex items-center gap-2">
                    <input
                type="text"
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                onKeyDown={async (e) => {
                  if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  novaMensagem.trim())
                  {
                    e.preventDefault();
                    if (enviandoMensagem) return;
                    setEnviandoMensagem(true);
                    try {
                      const telefone =
                      formData.telefone || pacienteParaUsar.telefone;
                      if (!telefone) {
                        showError(
                          'Erro',
                          'Paciente não possui telefone cadastrado.'
                        );
                        return;
                      }
                      const response = await fetch(
                        `${API_BASE_URL}/api/mensagens`,
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            clinicaId,
                            pacienteId: pacienteParaUsar.id,
                            pacienteNome: pacienteParaUsar.nome,
                            tipo: 'enviada',
                            conteudo: novaMensagem.trim(),
                            telefone
                          })
                        }
                      );
                      if (response.ok) {
                        setNovaMensagem('');
                        mensagensCarregadasRef.current = false;
                        // Recarrega mensagens
                        const reloadRes = await fetch(
                          `${API_BASE_URL}/api/mensagens?clinicaId=${clinicaId}&pacienteId=${pacienteParaUsar.id}`
                        );
                        if (reloadRes.ok) {
                          const data = await reloadRes.json();
                          setMensagensPaciente(data);
                          mensagensCarregadasRef.current = true;
                          setTimeout(() => {
                            mensagensEndRef.current?.scrollIntoView({
                              behavior: 'smooth'
                            });
                          }, 100);
                        }
                      }
                    } catch (err) {
                      console.error('Erro ao enviar mensagem:', err);
                    } finally {
                      setEnviandoMensagem(false);
                    }
                  }
                }}
                placeholder="Digite uma mensagem..."
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                disabled={enviandoMensagem} />
              

                    <button
                type="button"
                onClick={async () => {
                  if (!novaMensagem.trim() || enviandoMensagem) return;
                  setEnviandoMensagem(true);
                  try {
                    const telefone =
                    formData.telefone || pacienteParaUsar.telefone;
                    if (!telefone) {
                      showError(
                        'Erro',
                        'Paciente não possui telefone cadastrado.'
                      );
                      return;
                    }
                    const response = await fetch(
                      `${API_BASE_URL}/api/mensagens`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          clinicaId,
                          pacienteId: pacienteParaUsar.id,
                          pacienteNome: pacienteParaUsar.nome,
                          tipo: 'enviada',
                          conteudo: novaMensagem.trim(),
                          telefone
                        })
                      }
                    );
                    if (response.ok) {
                      setNovaMensagem('');
                      mensagensCarregadasRef.current = false;
                      const reloadRes = await fetch(
                        `${API_BASE_URL}/api/mensagens?clinicaId=${clinicaId}&pacienteId=${pacienteParaUsar.id}`
                      );
                      if (reloadRes.ok) {
                        const data = await reloadRes.json();
                        setMensagensPaciente(data);
                        mensagensCarregadasRef.current = true;
                        setTimeout(() => {
                          mensagensEndRef.current?.scrollIntoView({
                            behavior: 'smooth'
                          });
                        }, 100);
                      }
                    }
                  } catch (err) {
                    console.error('Erro ao enviar mensagem:', err);
                  } finally {
                    setEnviandoMensagem(false);
                  }
                }}
                disabled={!novaMensagem.trim() || enviandoMensagem}
                className="p-2.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                
                      {enviandoMensagem ?
                <Loader2 className="w-5 h-5 animate-spin" /> :

                <SendIcon className="w-5 h-5" />
                }
                    </button>
                  </div>
                  {!(formData.telefone || pacienteParaUsar.telefone) &&
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <AlertCircleIcon className="w-3 h-3" />
                      Paciente sem telefone cadastrado. Cadastre um telefone
                      para enviar mensagens.
                    </p>
            }
                </div>
              </div>
        }
          </div>
      }

        {/* ⭐ Aba Dependentes — exclusiva de quem é titular */}
        {activeTab === 'dependentes' && !isDependente &&
      <div className="space-y-4">
            {/* ⭐ Titular em Evidência */}
            <div className="bg-gradient-to-r from-purple-50 to-white border border-purple-100 rounded-xl p-3 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-purple-200 flex-shrink-0 border-2 border-white shadow-sm">
                {formData.fotoUrl ?
            <img
              src={
              formData.fotoUrl.startsWith('/uploads') ?
              `${API_BASE_URL}${formData.fotoUrl}` :
              formData.fotoUrl
              }
              alt="Titular"
              className="w-full h-full object-cover" /> :


            <div className="w-full h-full flex items-center justify-center text-purple-700 font-bold text-lg">
                    {formData.nome?.charAt(0).toUpperCase() || 'T'}
                  </div>
            }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-purple-600 font-bold uppercase tracking-wider mb-0.5">
                  Titular
                </p>
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  {formData.nome || 'Nome não informado'}
                </h4>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
                {formData.matricula &&
            <div className="flex items-center gap-1">
                    <FileTextIcon className="w-3.5 h-3.5" />{' '}
                    {formData.matricula}
                  </div>
            }
                {formData.convenioNome &&
            <div className="flex items-center gap-1">
                    <HeartPulseIcon className="w-3.5 h-3.5" />{' '}
                    {formData.convenioNome}
                  </div>
            }
              </div>
            </div>

            {!paciente?.id ?
        <div className="text-center py-12 bg-amber-50 rounded-xl border-2 border-dashed border-amber-200">
                <AlertCircleIcon className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                <p className="text-amber-800 font-medium">
                  Salve o cadastro do titular primeiro
                </p>
                <p className="text-sm text-amber-600 mt-1">
                  É necessário salvar o titular antes de adicionar dependentes a
                  ele.
                </p>
              </div> :

        <>
                {/* Header com Ações */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Dependentes
                    </h3>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                      {dependentesLista.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBuscaDependenteTermo('');
                  setBuscaDependenteResultados([]);
                  setNovoDependente(false);
                  setDependenteEditandoId(null);
                  // Toggle da busca
                  if (
                  document.getElementById('busca-dependente-container'))
                  {
                    document.
                    getElementById('busca-dependente-container')?.
                    classList.toggle('hidden');
                  }
                }}
                className="text-purple-700 border-purple-200 hover:bg-purple-50">
                
                      <SearchIcon className="w-4 h-4 mr-1.5" />
                      Vincular Existente
                    </Button>
                    <Button
                size="sm"
                onClick={iniciarNovoDependente}
                className="bg-purple-600 hover:bg-purple-700 text-white">
                
                      <PlusIcon className="w-4 h-4 mr-1.5" />
                      Novo Dependente
                    </Button>
                  </div>
                </div>

                {/* Container de Busca para Vincular Existente */}
                <div
            id="busca-dependente-container"
            className="hidden bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <SearchIcon className="w-4 h-4 text-gray-500" />
                    Vincular paciente existente como dependente
                  </h4>
                  <div className="relative">
                    <Input
                placeholder="Busque por nome, CPF ou matrícula..."
                value={buscaDependenteTermo}
                onChange={(e) => {
                  setBuscaDependenteTermo(e.target.value);
                  buscarDependenteParaVincular(e.target.value);
                }} />
              

                    {buscandoDependente &&
              <Loader2 className="w-4 h-4 animate-spin text-purple-500 absolute right-3 top-9" />
              }
                  </div>
                  {buscaDependenteResultados.length > 0 &&
            <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                      {buscaDependenteResultados.map((p) =>
              <div
                key={p.id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                
                          <div>
                            <p className="font-medium text-sm text-gray-900">
                              {p.nome}
                            </p>
                            <p className="text-xs text-gray-500">
                              {p.cpf && `CPF: ${p.cpf} • `}
                              {p.dataNascimento &&
                    `${calcularIdade(p.dataNascimento)} anos`}
                            </p>
                          </div>
                          <Button
                  size="sm"
                  variant="outline"
                  onClick={() => vincularDependenteExistente(p.id)}
                  disabled={salvandoDependente}
                  className="text-purple-600 border-purple-200 hover:bg-purple-50">
                  
                            Vincular
                          </Button>
                        </div>
              )}
                    </div>
            }
                  {buscaDependenteTermo.length >= 3 &&
            !buscandoDependente &&
            buscaDependenteResultados.length === 0 &&
            <p className="text-sm text-gray-500 mt-2 text-center py-2">
                        Nenhum paciente disponível encontrado.
                      </p>
            }
                </div>

                {/* Form novo/edição dependente */}
                {(novoDependente || dependenteEditandoId) &&
          <div className="border-2 border-purple-300 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 p-5 space-y-4 shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-200 rounded-full flex items-center justify-center">
                          {novoDependente ?
                  <PlusIcon className="w-4 h-4 text-purple-700" /> :

                  <UsersIcon className="w-4 h-4 text-purple-700" />
                  }
                        </div>
                        <h4 className="font-semibold text-purple-900">
                          {novoDependente ?
                  'Cadastro Rápido de Dependente' :
                  `Editando: ${dependenteFormData.nome}`}
                        </h4>
                      </div>
                      {novoDependente &&
              <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-purple-100 shadow-sm hover:bg-purple-50 transition-colors">
                          <input
                  type="checkbox"
                  checked={copiarDadosTitular}
                  onChange={(e) =>
                  setCopiarDadosTitular(e.target.checked)
                  }
                  className="rounded text-purple-600 focus:ring-purple-500" />
                

                          <span className="text-xs font-medium text-purple-800">
                            Copiar endereço/convênio do titular
                          </span>
                        </label>
              }
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-5">
                        <Input
                  id="dependente-nome-input"
                  label="Nome Completo *"
                  value={dependenteFormData.nome || ''}
                  onChange={(e) =>
                  setDependenteFormData({
                    ...dependenteFormData,
                    nome: e.target.value
                  })
                  }
                  placeholder="Nome do dependente"
                  required />
                
                      </div>
                      <div className="md:col-span-3">
                        <Input
                  label="Data Nascimento"
                  type="date"
                  value={dependenteFormData.dataNascimento || ''}
                  onChange={(e) =>
                  setDependenteFormData({
                    ...dependenteFormData,
                    dataNascimento: e.target.value
                  })
                  } />
                
                      </div>
                      <div className="md:col-span-1">
                        <Input
                  label="Idade"
                  value={
                  dependenteFormData.dataNascimento ?
                  calcularIdade(
                    dependenteFormData.dataNascimento
                  ).toString() :
                  ''
                  }
                  disabled
                  className="bg-gray-50 text-center" />
                
                      </div>
                      <div className="md:col-span-3">
                        <Select
                  label="Parentesco *"
                  value={dependenteFormData.parentesco || 'filho'}
                  onChange={(e) =>
                  setDependenteFormData({
                    ...dependenteFormData,
                    parentesco: e.target.value
                  })
                  }
                  options={[
                  {
                    value: 'filho',
                    label: 'Filho(a)'
                  },
                  {
                    value: 'conjuge',
                    label: 'Cônjuge'
                  },
                  {
                    value: 'pai',
                    label: 'Pai'
                  },
                  {
                    value: 'mae',
                    label: 'Mãe'
                  },
                  {
                    value: 'irmao',
                    label: 'Irmão(ã)'
                  },
                  {
                    value: 'neto',
                    label: 'Neto(a)'
                  },
                  {
                    value: 'avo',
                    label: 'Avô/Avó'
                  },
                  {
                    value: 'sobrinho',
                    label: 'Sobrinho(a)'
                  },
                  {
                    value: 'outro',
                    label: 'Outro'
                  }]
                  } />
                
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Select
                label="Gênero"
                value={dependenteFormData.genero || 'nao_informar'}
                onChange={(e) =>
                setDependenteFormData({
                  ...dependenteFormData,
                  genero: e.target.value
                })
                }
                options={[
                {
                  value: 'masculino',
                  label: 'Masculino'
                },
                {
                  value: 'feminino',
                  label: 'Feminino'
                },
                {
                  value: 'outro',
                  label: 'Outro'
                },
                {
                  value: 'nao_informar',
                  label: 'Prefiro não informar'
                }]
                } />
              

                      <Input
                label="CPF"
                value={dependenteFormData.cpf || ''}
                onChange={(e) =>
                setDependenteFormData({
                  ...dependenteFormData,
                  cpf: e.target.value
                })
                }
                placeholder="000.000.000-00" />
              

                      <Input
                label="Telefone"
                value={dependenteFormData.telefone || ''}
                onChange={(e) =>
                setDependenteFormData({
                  ...dependenteFormData,
                  telefone: e.target.value
                })
                }
                placeholder={
                copiarDadosTitular && novoDependente ?
                formData.telefone || '(00) 00000-0000' :
                '(00) 00000-0000'
                } />
              
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-purple-100 mt-2">
                      <Button
                variant="ghost"
                onClick={cancelarEdicaoDependente}>
                
                        Cancelar
                      </Button>
                      <Button
                onClick={() => salvarDependente(false)}
                disabled={
                salvandoDependente || !dependenteFormData.nome?.trim()
                }
                className="bg-purple-600 hover:bg-purple-700 text-white">
                
                        {salvandoDependente ?
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> :

                <CheckCircleIcon className="w-4 h-4 mr-2" />
                }
                        {novoDependente ?
                'Salvar Dependente' :
                'Salvar Alterações'}
                      </Button>
                      {novoDependente &&
              <Button
                onClick={() => salvarDependente(true)}
                disabled={
                salvandoDependente ||
                !dependenteFormData.nome?.trim()
                }
                className="bg-indigo-600 hover:bg-indigo-700 text-white">
                
                          {salvandoDependente ?
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> :

                <PlusIcon className="w-4 h-4 mr-2" />
                }
                          Salvar e Adicionar Outro
                        </Button>
              }
                    </div>
                  </div>
          }

                {/* Lista de dependentes */}
                {carregandoDependentes ?
          <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  </div> :
          dependentesLista.length === 0 && !novoDependente ?
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <UsersIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">
                      Nenhum dependente cadastrado
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Clique em "Novo Dependente" para adicionar
                    </p>
                  </div> :

          <div className="space-y-3">
                    {dependentesLista.map((dep: any) =>
            <div
              key={dep.id}
              className={`rounded-xl border-2 transition-all ${dependenteEditandoId === dep.id ? 'hidden' : 'border-gray-200 bg-white hover:border-purple-200 hover:shadow-sm'}`}>
              
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold text-lg flex-shrink-0">
                              {dep.nome?.charAt(0).toUpperCase() || 'D'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-gray-900">
                                  {dep.nome}
                                </h4>
                                {dep.parentesco &&
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                                    {dep.parentesco}
                                  </span>
                      }
                                {dep.status === 'inativo' &&
                      <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                                    Inativo
                                  </span>
                      }
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                                {dep.dataNascimento &&
                      <span>
                                    {calcularIdade(dep.dataNascimento)} anos
                                  </span>
                      }
                                {dep.telefone && <span>• {dep.telefone}</span>}
                                {dep.cpf && <span>• CPF: {dep.cpf}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                    size="sm"
                    variant="outline"
                    onClick={() => iniciarEdicaoDependente(dep)}
                    className="text-gray-600 border-gray-300 hover:bg-gray-50">
                    
                              Editar Rápido
                            </Button>
                            {onAbrirRelacionado &&
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAbrirRelacionado(dep.id);
                    }}
                    className="text-purple-600 border-purple-200 hover:bg-purple-50">
                    
                                <ExternalLinkIcon className="w-4 h-4 mr-1.5" />
                                Ficha Completa
                              </Button>
                  }
                          </div>
                        </div>
                      </div>
            )}
                  </div>
          }
              </>
        }
          </div>
      }

        {/* ⭐ Aba Parentesco — aparece quando paciente é dependente (tem titularId) */}
        {activeTab === 'parentesco' &&
      <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Vínculo Familiar
              </h3>
            </div>

            {/* Titular vinculado */}
            {formData.titularId &&
        formData.titularId !== '__pendente__' &&
        formData.titularNome ?
        <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
                <p className="text-xs font-medium text-purple-600 mb-2">
                  Titular vinculado
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-200 rounded-full flex items-center justify-center text-purple-700 font-bold text-lg flex-shrink-0">
                    {formData.titularNome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-purple-900 truncate">
                      {formData.titularNome}
                    </p>
                  </div>
                  {onAbrirRelacionado &&
            <button
              type="button"
              onClick={() => onAbrirRelacionado(formData.titularId)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-1">
              
                      <ExternalLinkIcon className="w-3 h-3" />
                      Abrir Cadastro
                    </button>
            }
                  <button
              type="button"
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  titularId: '__pendente__',
                  titularNome: '',
                  parentesco: ''
                }));
                setBuscaTitularAberta(true);
                setBuscaTitularTermo('');
              }}
              className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors">
              
                    Trocar Titular
                  </button>
                </div>
              </div> :

        <div className="p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {formData.titularId === '__pendente__' ?
            'Buscar Titular' :
            'Este paciente é Titular'}
                </p>
                {!formData.titularId &&
          <p className="text-xs text-gray-500 mb-3">
                    Para torná-lo dependente, busque e selecione o titular
                    abaixo.
                  </p>
          }
                <div className="relative" ref={buscaTitularRef}>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                type="text"
                value={buscaTitularTermo}
                onChange={(e) => {
                  setBuscaTitularTermo(e.target.value);
                  setBuscaTitularAberta(true);
                  buscarTitular(e.target.value);
                }}
                onFocus={() => {
                  setBuscaTitularAberta(true);
                  if (buscaTitularTermo) buscarTitular(buscaTitularTermo);
                }}
                placeholder="Buscar titular por nome, CPF ou telefone..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white placeholder-gray-400 transition-all" />
              

                    {buscandoTitular &&
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 animate-spin" />
              }
                  </div>

                  {/* Dropdown de resultados */}
                  {buscaTitularAberta && (
            buscaTitularResultados.length > 0 ||
            buscaTitularTermo.length > 0) &&
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        {buscaTitularResultados.length === 0 &&
              buscaTitularTermo.length > 0 &&
              !buscandoTitular ?
              <div className="px-4 py-6 text-center">
                            <SearchIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">
                              Nenhum titular encontrado
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Tente outro nome ou CPF
                            </p>
                          </div> :

              buscaTitularResultados.map((p: any) =>
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    titularId: p.id,
                    titularNome: p.nome
                  }));
                  setBuscaTitularAberta(false);
                  setBuscaTitularTermo('');
                  setBuscaTitularResultados([]);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 transition-colors text-left border-b border-gray-50 last:border-0">
                
                              <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                                {p.nome?.charAt(0).toUpperCase() || 'P'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {p.nome}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {p.cpf && <span>CPF: {p.cpf}</span>}
                                  {p.cpf && p.telefone && <span> • </span>}
                                  {p.telefone && <span>{p.telefone}</span>}
                                </p>
                              </div>
                              <CheckCircleIcon className="w-5 h-5 text-gray-300" />
                            </button>
              )
              }
                      </div>
            }
                </div>
              </div>
        }

            {/* Parentesco */}
            <div className="max-w-xs">
              <Select
            label="Parentesco"
            value={formData.parentesco || ''}
            onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              parentesco: e.target.value
            }))
            }
            options={[
            {
              value: '',
              label: 'Selecione...'
            },
            {
              value: 'filho',
              label: 'Filho(a)'
            },
            {
              value: 'conjuge',
              label: 'Cônjuge'
            },
            {
              value: 'pai',
              label: 'Pai'
            },
            {
              value: 'mae',
              label: 'Mãe'
            },
            {
              value: 'irmao',
              label: 'Irmão(ã)'
            },
            {
              value: 'neto',
              label: 'Neto(a)'
            },
            {
              value: 'avo',
              label: 'Avô/Avó'
            },
            {
              value: 'sobrinho',
              label: 'Sobrinho(a)'
            },
            {
              value: 'outro',
              label: 'Outro'
            }]
            } />
          
            </div>

            {/* Botão para desvincular */}
            {formData.titularId && formData.titularId !== '__pendente__' &&
        <div className="pt-2 border-t border-gray-200">
                <button
            type="button"
            onClick={async () => {
              const confirmed = await confirm(
                'Desvincular Titular',
                'Deseja desvincular este paciente do titular? Ele passará a ser um paciente titular.',
                'Desvincular',
                'Cancelar'
              );
              if (confirmed) {
                setFormData((prev) => ({
                  ...prev,
                  titularId: '',
                  titularNome: '',
                  parentesco: ''
                }));
              }
            }}
            className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1.5">
            
                  <XIcon className="w-4 h-4" />
                  Desvincular do titular (tornar titular)
                </button>
              </div>
        }
          </div>
      }

        {/* Observações */}
        {activeTab === 'observacoes' &&
      <div className="space-y-4">
            <Textarea
          label="Observações"
          value={formData.observacoes}
          onChange={(e) =>
          setFormData({
            ...formData,
            observacoes: e.target.value
          })
          }
          placeholder="Informações adicionais sobre o paciente..."
          rows={6} />
        

            <Textarea
          label="Anotações"
          value={formData.anotacoes}
          onChange={(e) =>
          setFormData({
            ...formData,
            anotacoes: e.target.value
          })
          }
          placeholder="Anotações internas..."
          rows={6} />
        
          </div>
      }

        {/* Modal da Carteirinha */}
        {pacienteParaUsar &&
      <CarteirinhaDigital
        isOpen={showCarteirinha}
        onClose={() => setShowCarteirinha(false)}
        paciente={pacienteParaUsar as any}
        clinica={{
          nome: clinicaNome,
          telefone: clinicaTelefone
        }}
        fotoUrl={fotoPreviewUrl || undefined} />

      }

        {/* Modal Recibo */}
        {pacienteParaUsar &&
      <ReciboModal
        isOpen={showRecibo}
        onClose={() => setShowRecibo(false)}
        paciente={pacienteParaUsar as any}
        onOpenBoleto={() => setShowBoleto(true)}
        clinicaId={clinicaId} />

      }

        {/* Modal Boleto */}
        {pacienteParaUsar &&
      <BoletoModal
        isOpen={showBoleto}
        onClose={() => setShowBoleto(false)}
        clinicaId={clinicaId}
        onSave={async (dados) => {
          console.log('Boleto gerado:', dados);
        }} />

      }
      </div>
    </div>;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
      pacienteParaUsar ?
      <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">
              Ficha do Paciente
            </h2>
            {carregandoPaciente &&
        <span className="text-sm text-blue-600 flex items-center gap-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                Atualizando...
              </span>
        }
          </div> :

      'Novo Paciente'

      }
      footer={
      <div className="flex items-center gap-2 w-full">
          {temVoltar &&
        <Button variant="secondary" onClick={onVoltar} disabled={salvando}>
              Voltar ao Cadastro Anterior
            </Button>
        }
          <div className="flex-1"></div>
          {salvoComSucesso &&
        <span className="text-green-600 flex items-center gap-1 mr-2 text-sm font-medium">
              <CheckCircleIcon className="w-4 h-4" />
              Salvo com sucesso!
            </span>
        }
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            {salvoComSucesso ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button onClick={handleSaveClick} disabled={salvando}>
            {salvando ?
          <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </> :
          pacienteParaUsar ?
          'Salvar Alterações' :

          'Cadastrar'
          }
          </Button>
        </div>
      }
      size="fullscreen">
      
      {carregandoPaciente || carregandoDados ?
      <div className="flex items-center justify-center py-12 h-full">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Carregando dados...</p>
          </div>
        </div> :

      formContent
      }
    </Modal>);

}