import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { PasswordInput } from './ui/PasswordInput';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import {
  Usuario,
  TipoUsuario,
  Clinica,
  MENU_ITEMS_CONFIG,
  PERMISSOES_PADRAO,
  MenuItemId,
  RqeEntry } from
'../types';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RotateCcwIcon,
  LayoutDashboardIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  Building2Icon,
  HeartPulseIcon,
  BanknoteIcon,
  MessageCircleIcon,
  FileTextIcon,
  ClipboardListIcon,
  SettingsIcon,
  CreditCardIcon,
  PillIcon,
  BuildingIcon,
  UserCogIcon,
  CheckIcon,
  XIcon,
  ShieldIcon,
  ShieldCheckIcon,
  AwardIcon,
  PlusIcon,
  SearchIcon,
  CameraIcon,
  Trash2Icon,
  FileSignatureIcon } from
'lucide-react';
import { CameraCapture } from './CameraCapture';
import { API_BASE_URL } from '../config/api';
// Mapeamento de ícones para cada item do menu
const MENU_ICONS: Record<string, any> = {
  dashboard: LayoutDashboardIcon,
  agenda: CalendarIcon,
  fila_atendimento: ClockIcon,
  pacientes: UsersIcon,
  empresas_conveniadas: Building2Icon,
  planos_saude: HeartPulseIcon,
  cobrancas: BanknoteIcon,
  mensagens: MessageCircleIcon,
  whatsapp_meta: MessageCircleIcon,
  prontuarios: FileTextIcon,
  procedimentos: ClipboardListIcon,
  configuracoes: SettingsIcon,
  configuracoes_globais: SettingsIcon,
  planos: CreditCardIcon,
  medicamentos: PillIcon,
  memed_profissionais: PillIcon,
  operadoras: Building2Icon,
  clinicas: BuildingIcon,
  usuarios: UserCogIcon,
  especialidades: AwardIcon
};
// Categorias para organização visual
const CATEGORIAS = {
  geral: {
    label: 'Geral',
    cor: 'bg-blue-50 border-blue-200'
  },
  financeiro: {
    label: 'Financeiro',
    cor: 'bg-green-50 border-green-200'
  },
  comunicacao: {
    label: 'Comunicação',
    cor: 'bg-purple-50 border-purple-200'
  },
  clinico: {
    label: 'Clínico',
    cor: 'bg-teal-50 border-teal-200'
  },
  sistema: {
    label: 'Sistema',
    cor: 'bg-orange-50 border-orange-200'
  },
  admin: {
    label: 'Administração',
    cor: 'bg-red-50 border-red-200'
  }
};
interface Especialidade {
  id: string;
  nome: string;
  tipo: 'medica' | 'odontologica' | 'ambas';
  ativa: boolean;
}
interface OperadoraOption {
  id: string;
  nome: string;
}
interface ClinicaOption {
  id: string;
  nome: string;
  operadoraId: string;
}
interface UsuarioFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (usuario: any) => void;
  clinicas: Clinica[];
  isSuperAdmin: boolean;
  usuarioEdit?: Usuario | null;
  clinicaAtualId?: string;
  operadoraAtualId?: string;
  onWarning?: (message: string) => void;
}
export function UsuarioForm({
  isOpen,
  onClose,
  onSave,
  clinicas,
  isSuperAdmin,
  usuarioEdit,
  clinicaAtualId,
  operadoraAtualId,
  onWarning
}: UsuarioFormProps) {
  // ⭐ A operadora do cadastro é sempre a operadora em uso — não é uma escolha.
  // Quando a página não informa, resolve pela sessão ativa.
  const operadoraFixaId = useMemo(() => {
    if (operadoraAtualId) return operadoraAtualId;
    try {
      const sessaoStr = localStorage.getItem('sessao');
      if (!sessaoStr) return '';
      const parsed = JSON.parse(sessaoStr);
      return (
        parsed?.clinicaAtual?.operadoraId ||
        parsed?.operadoraSelecionada?.id ||
        parsed?.usuario?.operadoraId ||
        '');

    } catch {
      return '';
    }
  }, [operadoraAtualId, isOpen]);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    tipo: 'atendente' as TipoUsuario,
    operadoraId: '',
    clinicaId: '',
    ativo: true,
    crm: '',
    uf: '',
    cpf: '',
    telefone: '',
    dataNascimento: '',
    fotoUrl: '',
    titulo: '',
    cabecalhoRelatorio: '',
    rqes: [] as RqeEntry[],
    permissoesMenu: [] as string[],
    especialidades: [] as string[],
    termoPesquisa: '',
    operadoraPadraoId: '',
    clinicaPadraoId: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    cepUsuario: '',
    ufEndereco: '',
    intervaloAlmocoAtivo: false,
    intervaloAlmocoInicio: '12:00',
    intervaloAlmocoFim: '13:00',
    // ⭐ Libera TODAS as operações do prontuário (registrar, editar, imprimir)
    //    para usuários que não são médicos/dentistas.
    prontuarioTotal: false,
    // ⭐ Verificação em duas etapas: código pelo WhatsApp a cada login
    doisFatores: false
  });
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPermissoes, setShowPermissoes] = useState(false);
  const [showEspecialidades, setShowEspecialidades] = useState(false);
  const [especialidadesDisponiveis, setEspecialidadesDisponiveis] = useState<
    Especialidade[]>(
    []);
  // ⭐ NOVO: Estados para preferências de acesso rápido
  const [operadorasDisponiveis, setOperadorasDisponiveis] = useState<
    OperadoraOption[]>(
    []);
  const [clinicasParaPadrao, setClinicasParaPadrao] = useState<ClinicaOption[]>(
    []
  );
  const [loadingOperadoras, setLoadingOperadoras] = useState(false);
  const [loadingClinicas, setLoadingClinicas] = useState(false);
  // ⭐ Carrega operadoras disponíveis
  useEffect(() => {
    const carregarOperadoras = async () => {
      setLoadingOperadoras(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/operadoras`);
        if (response.ok) {
          const data = await response.json();
          setOperadorasDisponiveis(
            data.
            filter((o: any) => o.ativa !== false).
            map((o: any) => ({
              id: o.id,
              nome: o.nome
            }))
          );
        }
      } catch (err) {
        console.error('Erro ao carregar operadoras:', err);
      } finally {
        setLoadingOperadoras(false);
      }
    };
    if (isOpen) {
      carregarOperadoras();
    }
  }, [isOpen]);
  // ⭐ Mantém a operadora do cadastro travada na operadora em uso
  useEffect(() => {
    if (!isOpen || !operadoraFixaId) return;
    setFormData((prev) =>
    prev.operadoraPadraoId === operadoraFixaId ?
    prev :
    {
      ...prev,
      operadoraPadraoId: operadoraFixaId,
      // Troca de operadora invalida a clínica escolhida antes
      clinicaPadraoId:
      prev.operadoraPadraoId && prev.operadoraPadraoId !== operadoraFixaId ?
      '' :
      prev.clinicaPadraoId
    }
    );
  }, [isOpen, operadoraFixaId, usuarioEdit]);
  // ⭐ Carrega clínicas quando operadora padrão muda
  useEffect(() => {
    const carregarClinicas = async () => {
      const opId = formData.operadoraPadraoId;
      if (!opId) {
        setClinicasParaPadrao([]);
        return;
      }
      setLoadingClinicas(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/clinicas?operadoraId=${opId}`
        );
        if (response.ok) {
          const data = await response.json();
          setClinicasParaPadrao(
            data.
            filter((c: any) => c.ativa !== false).
            map((c: any) => ({
              id: c.id,
              nome: c.nome,
              operadoraId: c.operadoraId
            }))
          );
        }
      } catch (err) {
        console.error('Erro ao carregar clínicas:', err);
      } finally {
        setLoadingClinicas(false);
      }
    };
    carregarClinicas();
  }, [formData.operadoraPadraoId]);
  // Carrega especialidades
  useEffect(() => {
    const carregarEspecialidades = async () => {
      // Especialidades padrão
      const especialidadesPadrao: Especialidade[] = [
      {
        id: '1',
        nome: 'Clínica Geral',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '2',
        nome: 'Cardiologia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '3',
        nome: 'Dermatologia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '4',
        nome: 'Ginecologia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '5',
        nome: 'Ortopedia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '6',
        nome: 'Pediatria',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '7',
        nome: 'Psiquiatria',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '8',
        nome: 'Neurologia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '9',
        nome: 'Endocrinologia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '10',
        nome: 'Oftalmologia',
        tipo: 'medica',
        ativa: true
      },
      {
        id: '11',
        nome: 'Odontologia Geral',
        tipo: 'odontologica',
        ativa: true
      },
      {
        id: '12',
        nome: 'Ortodontia',
        tipo: 'odontologica',
        ativa: true
      },
      {
        id: '13',
        nome: 'Implantodontia',
        tipo: 'odontologica',
        ativa: true
      },
      {
        id: '14',
        nome: 'Periodontia',
        tipo: 'odontologica',
        ativa: true
      },
      {
        id: '15',
        nome: 'Endodontia',
        tipo: 'odontologica',
        ativa: true
      }];

      setEspecialidadesDisponiveis(especialidadesPadrao);
    };
    carregarEspecialidades();
  }, []);
  // Carrega dados do usuário quando abre o modal
  useEffect(() => {
    if (usuarioEdit) {
      const permissoesSalvas = usuarioEdit.permissoesMenu || [];
      const permissoesPadrao = PERMISSOES_PADRAO[usuarioEdit.tipo] || [];
      const permissoesParaUsar =
      permissoesSalvas.length > 0 ?
      [...permissoesSalvas] :
      [...permissoesPadrao];
      console.log('📝 [UsuarioForm] Carregando usuário:', {
        nome: usuarioEdit.nome,
        tipo: usuarioEdit.tipo,
        operadoraPadraoId: (usuarioEdit as any).operadoraPadraoId,
        clinicaPadraoId: (usuarioEdit as any).clinicaPadraoId,
        termoPesquisa: usuarioEdit.termoPesquisa
      });
      // ⭐ Parse RQEs (pode vir como JSON string do servidor)
      let rqesParsed: RqeEntry[] = [];
      const rawRqes = (usuarioEdit as any).rqes;
      if (Array.isArray(rawRqes)) {
        rqesParsed = rawRqes;
      } else if (typeof rawRqes === 'string' && rawRqes) {
        try {
          rqesParsed = JSON.parse(rawRqes);
        } catch {
          rqesParsed = [];
        }
      }
      setFormData({
        nome: usuarioEdit.nome,
        email: usuarioEdit.email,
        senha: usuarioEdit.senha || '',
        tipo: usuarioEdit.tipo,
        operadoraId: usuarioEdit.operadoraId || '',
        clinicaId: usuarioEdit.clinicaId || '',
        ativo: usuarioEdit.ativo,
        crm: usuarioEdit.crm || '',
        uf: usuarioEdit.uf || '',
        cpf: usuarioEdit.cpf || '',
        telefone: usuarioEdit.telefone || '',
        dataNascimento: usuarioEdit.dataNascimento || '',
        fotoUrl: usuarioEdit.fotoUrl || '',
        titulo: (usuarioEdit as any).titulo || '',
        cabecalhoRelatorio: (usuarioEdit as any).cabecalhoRelatorio || '',
        rqes: rqesParsed,
        permissoesMenu: permissoesParaUsar,
        especialidades: (usuarioEdit as any).especialidades || [],
        termoPesquisa: usuarioEdit.termoPesquisa || '',
        operadoraPadraoId: (usuarioEdit as any).operadoraPadraoId || '',
        clinicaPadraoId: (usuarioEdit as any).clinicaPadraoId || '',
        endereco: (usuarioEdit as any).endereco || '',
        numero: (usuarioEdit as any).numero || '',
        complemento: (usuarioEdit as any).complemento || '',
        bairro: (usuarioEdit as any).bairro || '',
        cidade: (usuarioEdit as any).cidade || '',
        cepUsuario: (usuarioEdit as any).cepUsuario || '',
        ufEndereco: (usuarioEdit as any).ufEndereco || '',
        intervaloAlmocoAtivo: Boolean(
          (usuarioEdit as any).intervaloAlmocoAtivo
        ),
        intervaloAlmocoInicio:
        (usuarioEdit as any).intervaloAlmocoInicio || '12:00',
        intervaloAlmocoFim: (usuarioEdit as any).intervaloAlmocoFim || '13:00',
        prontuarioTotal: Boolean((usuarioEdit as any).prontuarioTotal),
        doisFatores: Boolean((usuarioEdit as any).doisFatores)
      });
      // Preview da foto existente
      if (usuarioEdit.fotoUrl) {
        const url = usuarioEdit.fotoUrl.startsWith('/uploads') ?
        `${API_BASE_URL}${usuarioEdit.fotoUrl}` :
        usuarioEdit.fotoUrl;
        setFotoPreview(url);
      } else {
        setFotoPreview(null);
      }
    } else {
      const permissoesPadrao = PERMISSOES_PADRAO['atendente'] || [];
      setFormData({
        nome: '',
        email: '',
        senha: '',
        tipo: 'atendente',
        operadoraId: '',
        clinicaId: clinicaAtualId || '',
        ativo: true,
        crm: '',
        uf: '',
        cpf: '',
        telefone: '',
        dataNascimento: '',
        fotoUrl: '',
        titulo: '',
        cabecalhoRelatorio: '',
        rqes: [],
        permissoesMenu: [...permissoesPadrao],
        especialidades: [],
        termoPesquisa: '',
        operadoraPadraoId: '',
        clinicaPadraoId: '',
        endereco: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        cepUsuario: '',
        ufEndereco: '',
        intervaloAlmocoAtivo: false,
        intervaloAlmocoInicio: '12:00',
        intervaloAlmocoFim: '13:00',
        prontuarioTotal: false,
        doisFatores: false
      });
      setFotoPreview(null);
    }
    setValidationError('');
    setShowPermissoes(false);
    setShowEspecialidades(false);
  }, [usuarioEdit, isOpen, clinicaAtualId]);
  // Atualiza permissões quando o tipo de usuário muda (APENAS para novo usuário)
  useEffect(() => {
    if (!usuarioEdit) {
      const permissoesPadrao = PERMISSOES_PADRAO[formData.tipo] || [];
      setFormData((prev) => ({
        ...prev,
        permissoesMenu: [...permissoesPadrao]
      }));
    }
  }, [formData.tipo, usuarioEdit]);
  const handlePermissaoToggle = (menuId: string) => {
    // ⭐ Bloqueia toggle de menus exclusivos do super_admin
    const apenasSuper = ['configuracoes_globais', 'planos', 'operadoras'];
    if (
    !isSuperAdmin &&
    formData.tipo !== 'super_admin' &&
    apenasSuper.includes(menuId))
    {
      return;
    }
    setFormData((prev) => {
      const novasPermissoes = prev.permissoesMenu.includes(menuId) ?
      prev.permissoesMenu.filter((p) => p !== menuId) :
      [...prev.permissoesMenu, menuId];
      console.log('🔄 [UsuarioForm] Permissão alterada:', {
        menuId,
        acao: prev.permissoesMenu.includes(menuId) ? 'REMOVIDA' : 'ADICIONADA',
        total: novasPermissoes.length
      });
      return {
        ...prev,
        permissoesMenu: novasPermissoes
      };
    });
  };
  const handleEspecialidadeToggle = (espId: string) => {
    setFormData((prev) => {
      const novasEspecialidades = prev.especialidades.includes(espId) ?
      prev.especialidades.filter((e) => e !== espId) :
      [...prev.especialidades, espId];
      return {
        ...prev,
        especialidades: novasEspecialidades
      };
    });
  };
  const handleResetPermissoes = () => {
    const permissoesPadrao = PERMISSOES_PADRAO[formData.tipo] || [];
    setFormData((prev) => ({
      ...prev,
      permissoesMenu: [...permissoesPadrao]
    }));
    console.log(
      '🔄 [UsuarioForm] Permissões resetadas para padrão:',
      formData.tipo
    );
  };
  const handleMarcarTodos = () => {
    const apenasSuper = ['configuracoes_globais', 'planos', 'operadoras'];
    const menusParaMarcar =
    isSuperAdmin || formData.tipo === 'super_admin' ?
    MENU_ITEMS_CONFIG.map((m) => m.id) :
    MENU_ITEMS_CONFIG.filter((m) => !apenasSuper.includes(m.id)).map(
      (m) => m.id
    );
    setFormData((prev) => ({
      ...prev,
      permissoesMenu: menusParaMarcar
    }));
  };
  const handleDesmarcarTodos = () => {
    setFormData((prev) => ({
      ...prev,
      permissoesMenu: []
    }));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ⭐ Coleta TODOS os campos obrigatórios faltando de uma vez
    const erros: string[] = [];
    if (!formData.nome.trim()) erros.push('Nome Completo é obrigatório');
    if (!formData.email.trim()) erros.push('Email é obrigatório');
    // Senha só é obrigatória ao CRIAR. Na edição, em branco mantém a atual.
    if (!usuarioEdit && !formData.senha.trim())
    erros.push('Senha é obrigatória');
    const tiposQueNecessitamClinica = ['medico', 'dentista', 'atendente'];
    if (tiposQueNecessitamClinica.includes(formData.tipo)) {
      if (clinicas.length === 0) {
        erros.push(
          'Nenhuma clínica cadastrada — cadastre uma clínica antes de adicionar profissionais'
        );
      } else if (!formData.clinicaId) {
        erros.push('Clínica é obrigatória para médicos, dentistas e atendentes');
      }
    }
    if (['medico', 'dentista'].includes(formData.tipo)) {
      if (!formData.cpf.trim())
      erros.push('CPF é obrigatório para médicos e dentistas');
      if (!formData.dataNascimento)
      erros.push('Data de Nascimento é obrigatória para médicos e dentistas');
      if (!formData.crm.trim())
      erros.push(
        `${formData.tipo === 'medico' ? 'CRM' : 'CRO'} é obrigatório`
      );
      if (!formData.uf) erros.push('UF (estado do conselho) é obrigatória');
    }
    if (formData.doisFatores && formData.telefone.replace(/\D/g, '').length < 10)
    erros.push(
      'Informe o celular (WhatsApp) com DDD para ativar a verificação em duas etapas'
    );
    if (erros.length > 0) {
      setValidationErrors(erros);
      setValidationError('');
      setTimeout(() => {
        const modalContent = document.querySelector('[data-modal-content]');
        if (modalContent) modalContent.scrollTop = 0;
      }, 50);
      return;
    }
    setValidationErrors([]);
    setValidationError('');
    const permissoesParaSalvar = [...formData.permissoesMenu];
    console.log('💾 [UsuarioForm] ========== SALVANDO USUÁRIO ==========');
    console.log('💾 [UsuarioForm] Nome:', formData.nome);
    console.log('💾 [UsuarioForm] Tipo:', formData.tipo);
    console.log('💾 [UsuarioForm] clinicaId:', formData.clinicaId);
    console.log('💾 [UsuarioForm] =====================================');
    setSaving(true);
    try {
      // ⭐ AGUARDA o save — se falhar, mostra erro no formulário
      await onSave({
        ...formData,
        permissoesMenu: permissoesParaSalvar
      });
      // Sucesso: o UsuariosPage.handleSave fecha o modal e mostra o toast
    } catch (err: any) {
      // ⭐ Erro: mostra dentro do formulário (modal permanece aberto)
      const mensagemErro =
      err?.message || 'Erro ao salvar usuário. Tente novamente.';
      setValidationErrors([mensagemErro]);
      setTimeout(() => {
        const modalContent = document.querySelector('[data-modal-content]');
        if (modalContent) modalContent.scrollTop = 0;
      }, 50);
    } finally {
      setSaving(false);
    }
  };
  const tiposUsuario = isSuperAdmin ?
  [
  {
    value: 'super_admin',
    label: 'Super Administrador'
  },
  {
    value: 'admin',
    label: 'Administrador'
  },
  {
    value: 'medico',
    label: 'Médico'
  },
  {
    value: 'dentista',
    label: 'Dentista'
  },
  {
    value: 'atendente',
    label: 'Atendente'
  }] :

  [
  {
    value: 'admin',
    label: 'Administrador'
  },
  {
    value: 'medico',
    label: 'Médico'
  },
  {
    value: 'dentista',
    label: 'Dentista'
  },
  {
    value: 'atendente',
    label: 'Atendente'
  }];

  const clinicaAtualNome = clinicaAtualId ?
  clinicas.find((c) => c.id === clinicaAtualId)?.nome :
  null;
  // ⭐ Menus exclusivos do super_admin (visíveis mas desabilitados para outros tipos)
  const SUPER_ADMIN_ONLY_MENUS = [
  'configuracoes_globais',
  'planos',
  'operadoras'];

  // Mostra TODOS os menus — os exclusivos do super_admin ficam desabilitados
  const menusDisponiveis = [...MENU_ITEMS_CONFIG];
  // Verifica se um menu é exclusivo do super_admin e o usuário atual NÃO é super_admin
  const isMenuDisabled = (menuId: string) => {
    if (isSuperAdmin || formData.tipo === 'super_admin') return false;
    return SUPER_ADMIN_ONLY_MENUS.includes(menuId);
  };
  // Calcula estatísticas
  const totalMenus = menusDisponiveis.length;
  const totalSelecionados = formData.permissoesMenu.filter((p) =>
  menusDisponiveis.some((m) => m.id === p)
  ).length;
  const permissoesPadrao = PERMISSOES_PADRAO[formData.tipo] || [];
  const estaNoPadrao =
  totalSelecionados === permissoesPadrao.length &&
  formData.permissoesMenu.every((p) =>
  permissoesPadrao.includes(p as MenuItemId)
  );
  // Filtra especialidades baseado no tipo de profissional
  const especialidadesFiltradas = especialidadesDisponiveis.filter((esp) => {
    if (formData.tipo === 'medico') {
      return esp.tipo === 'medica' || esp.tipo === 'ambas';
    }
    if (formData.tipo === 'dentista') {
      return esp.tipo === 'odontologica' || esp.tipo === 'ambas';
    }
    return true;
  });
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={usuarioEdit ? 'Editar Usuário' : 'Novo Usuário'}
      size="large"
      footer={
      <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ?
          <span className="flex items-center gap-2">
                <svg
              className="animate-spin w-4 h-4"
              viewBox="0 0 24 24"
              fill="none">
              
                  <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4" />
              

                  <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z" />
              
                </svg>
                Salvando...
              </span> :
          usuarioEdit ?
          'Salvar Alterações' :

          'Cadastrar'
          }
          </Button>
        </>
      }>
      
      {/* ⭐ Modal centralizado de erros de validação — sobreposto, visível sem rolar */}
      {validationErrors.length > 0 &&
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="usuario-erro-titulo">
        
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-red-50 border-b border-red-100">
              <div className="w-9 h-9 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                <XIcon className="w-5 h-5 text-white" />
              </div>
              <p
              id="usuario-erro-titulo"
              className="text-base font-bold text-red-800">
              
                Não foi possível salvar
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600 mb-3">
                Corrija os itens abaixo e tente novamente:
              </p>
              <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                {validationErrors.map((erro, i) =>
              <li
                key={i}
                className="text-sm text-red-700 flex items-start gap-2">
                
                    <span className="text-red-500 font-bold mt-0.5">•</span>
                    <span>{erro}</span>
                  </li>
              )}
              </ul>
            </div>
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <Button type="button" onClick={() => setValidationErrors([])}>
                Entendi
              </Button>
            </div>
          </div>
        </div>
      }

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Erro simples legado */}
        {validationError &&
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">⚠️ {validationError}</p>
          </div>
        }

        {clinicaAtualNome && !usuarioEdit &&
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <p className="text-sm text-teal-800">
              📍 Cadastrando usuário para: <strong>{clinicaAtualNome}</strong>
            </p>
          </div>
        }

        {/* ⭐ Foto de perfil do usuário */}
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0 cursor-pointer hover:border-teal-400 transition-colors relative group"
            onClick={() => fotoInputRef.current?.click()}
            title="Clique para alterar a foto">
            
            {fotoPreview ?
            <img
              src={fotoPreview}
              alt="Foto do usuário"
              className="w-full h-full object-cover"
              onError={() => setFotoPreview(null)} /> :


            <div className="flex flex-col items-center justify-center text-gray-400">
                <UserCogIcon className="w-8 h-8" />
              </div>
            }
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
              <PlusIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Foto de Perfil</p>
            <p className="text-xs text-gray-500 mb-2">
              Clique na foto para alterar
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="text-xs px-3 py-1 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors border border-teal-200">
                
                📷 Escolher foto
              </button>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="text-xs px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 flex items-center gap-1">
                
                <CameraIcon className="w-3 h-3" />
                Câmera
              </button>
              {fotoPreview &&
              <button
                type="button"
                onClick={() => {
                  setFotoPreview(null);
                  setFormData({
                    ...formData,
                    fotoUrl: ''
                  });
                }}
                className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                
                  🗑️ Remover
                </button>
              }
            </div>

            {/* ⭐ Modal da câmera para capturar foto */}
            <CameraCapture
              isOpen={showCamera}
              onClose={() => setShowCamera(false)}
              title="Capturar Foto de Perfil"
              onCapture={(file: File) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = reader.result as string;
                  setFotoPreview(base64);
                  setFormData((prev) => ({
                    ...prev,
                    fotoUrl: base64
                  }));
                };
                reader.readAsDataURL(file);
                setShowCamera(false);
              }} />
            
          </div>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                // Converte para base64 para preview e envio
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = reader.result as string;
                  setFotoPreview(base64);
                  setFormData({
                    ...formData,
                    fotoUrl: base64
                  });
                };
                reader.readAsDataURL(file);
              }
              // Reset input para permitir selecionar o mesmo arquivo
              e.target.value = '';
            }} />
          
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nome Completo"
            value={formData.nome}
            onChange={(e) =>
            setFormData({
              ...formData,
              nome: e.target.value
            })
            }
            placeholder="Nome completo do usuário"
            required />
          

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) =>
            setFormData({
              ...formData,
              email: e.target.value
            })
            }
            placeholder="email@exemplo.com"
            required />
          
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PasswordInput
            label="Senha"
            value={formData.senha}
            onChange={(e) =>
            setFormData({
              ...formData,
              senha: e.target.value
            })
            }
            placeholder={
            usuarioEdit ? 'Em branco mantém a senha atual' : 'Senha inicial'
            }
            required={!usuarioEdit} />
          

          <Select
            label="Tipo de Usuário"
            value={formData.tipo}
            onChange={(e) =>
            setFormData({
              ...formData,
              tipo: e.target.value as TipoUsuario,
              clinicaId:
              e.target.value === 'super_admin' ? '' : formData.clinicaId,
              especialidades: [] // Limpa especialidades ao mudar tipo
            })
            }
            options={tiposUsuario} />
          
        </div>

        {/* Telefone — visível para TODOS os tipos de usuário */}
        {!['medico', 'dentista'].includes(formData.tipo) &&
        <Input
          label="Telefone"
          value={formData.telefone}
          onChange={(e) =>
          setFormData({
            ...formData,
            telefone: e.target.value
          })
          }
          placeholder="(00) 00000-0000" />

        }

        {/* ⭐ Verificação em duas etapas (código pelo WhatsApp) */}
        <label className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={formData.doisFatores}
            onChange={(e) =>
            setFormData({
              ...formData,
              doisFatores: e.target.checked
            })
            }
            className="mt-0.5 w-4 h-4 accent-teal-600" />
          
          <span>
            <span className="block text-sm font-medium text-gray-900">
              Verificação em duas etapas
            </span>
            <span className="block text-sm text-gray-600">
              A cada login, além da senha, o usuário recebe um código pelo
              WhatsApp no telefone cadastrado
              {formData.telefone ? ` (${formData.telefone})` : ''}.
            </span>
          </span>
        </label>

        {/* ⭐ SEÇÃO: Preferências de Acesso Rápido (Operadora, Clínica, Termo) */}
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <SearchIcon className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Preferências de Acesso Rápido
              </h4>
              <p className="text-xs text-gray-500">
                Ao fazer login, o sistema pré-seleciona automaticamente estes
                valores
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Operadora: sempre a operadora em uso — exibida apenas como
                 informação, sem opção de troca */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                🏢 Operadora
              </label>
              <p className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                {loadingOperadoras ?
                'Carregando...' :
                operadorasDisponiveis.find(
                  (o) => o.id === formData.operadoraPadraoId
                )?.nome || 'Operadora atual'}
              </p>
            </div>

            {/* Clínica Padrão */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                🏥 Clínica Padrão
              </label>
              <select
                value={formData.clinicaPadraoId}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  clinicaPadraoId: e.target.value
                })
                }
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                disabled={!formData.operadoraPadraoId || loadingClinicas}>
                
                <option value="">
                  {loadingClinicas ?
                  'Carregando...' :
                  'Nenhuma (selecionar manualmente)'}
                </option>
                {clinicasParaPadrao.map((cl) =>
                <option key={cl.id} value={cl.id}>
                    {cl.nome}
                  </option>
                )}
              </select>
            </div>

            {/* Termo de Pesquisa */}
            <Input
              label="🔍 Termo de Pesquisa Padrão"
              value={formData.termoPesquisa}
              onChange={(e) =>
              setFormData({
                ...formData,
                termoPesquisa: e.target.value
              })
              }
              placeholder="Ex: Nome da cidade, especialidade, etc."
              helperText="Pré-preenche a busca de pacientes ao acessar o sistema." />
            
          </div>

          {/* Resumo das preferências */}
          {(formData.operadoraPadraoId ||
          formData.clinicaPadraoId ||
          formData.termoPesquisa) &&
          <div className="mt-3 p-2 bg-white/70 rounded-lg border border-indigo-100">
              <p className="text-xs text-indigo-800 font-medium mb-1">
                ✅ Ao fazer login:
              </p>
              <ul className="text-xs text-indigo-700 space-y-0.5">
                {formData.operadoraPadraoId &&
              <li>
                    • Operadora:{' '}
                    <strong>
                      {
                  operadorasDisponiveis.find(
                    (o) => o.id === formData.operadoraPadraoId
                  )?.nome
                  }
                    </strong>
                  </li>
              }
                {formData.clinicaPadraoId &&
              <li>
                    • Clínica:{' '}
                    <strong>
                      {
                  clinicasParaPadrao.find(
                    (c) => c.id === formData.clinicaPadraoId
                  )?.nome
                  }
                    </strong>
                  </li>
              }
                {formData.termoPesquisa &&
              <li>
                    • Busca: <strong>"{formData.termoPesquisa}"</strong>
                  </li>
              }
              </ul>
            </div>
          }
        </div>

        {['medico', 'dentista', 'atendente'].includes(formData.tipo) &&
        clinicas.length === 0 &&
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium">
                ⚠️ Nenhuma clínica cadastrada
              </p>
              <p className="text-xs text-red-600 mt-1">
                É necessário cadastrar pelo menos uma clínica antes de adicionar
                profissionais.
              </p>
            </div>
        }

        {formData.tipo !== 'super_admin' &&
        <Select
          label={
          ['medico', 'dentista', 'atendente'].includes(formData.tipo) ?
          'Clínica *' :
          'Clínica'
          }
          value={formData.clinicaId}
          onChange={(e) =>
          setFormData({
            ...formData,
            clinicaId: e.target.value
          })
          }
          options={[
          {
            value: '',
            label: 'Selecione uma clínica'
          },
          ...clinicas.map((c) => ({
            value: c.id,
            label: c.nome
          }))]
          }
          required={['medico', 'dentista', 'atendente'].includes(
            formData.tipo
          )}
          disabled={clinicas.length === 0} />

        }

        {['medico', 'dentista'].includes(formData.tipo) &&
        <>
            <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900">
                📋 Dados Profissionais (para Memed)
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <Input
                label="CPF *"
                value={formData.cpf}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cpf: e.target.value
                })
                }
                placeholder="000.000.000-00"
                required />
              

                <Input
                label="Data de Nascimento *"
                type="date"
                value={formData.dataNascimento}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  dataNascimento: e.target.value
                })
                }
                required />
              
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                label="CRM/CRO *"
                value={formData.crm}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  crm: e.target.value
                })
                }
                placeholder="123456"
                required />
              

                <Select
                label="UF *"
                value={formData.uf}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  uf: e.target.value
                })
                }
                options={[
                {
                  value: '',
                  label: 'Selecione'
                },
                {
                  value: 'AC',
                  label: 'AC'
                },
                {
                  value: 'AL',
                  label: 'AL'
                },
                {
                  value: 'AP',
                  label: 'AP'
                },
                {
                  value: 'AM',
                  label: 'AM'
                },
                {
                  value: 'BA',
                  label: 'BA'
                },
                {
                  value: 'CE',
                  label: 'CE'
                },
                {
                  value: 'DF',
                  label: 'DF'
                },
                {
                  value: 'ES',
                  label: 'ES'
                },
                {
                  value: 'GO',
                  label: 'GO'
                },
                {
                  value: 'MA',
                  label: 'MA'
                },
                {
                  value: 'MT',
                  label: 'MT'
                },
                {
                  value: 'MS',
                  label: 'MS'
                },
                {
                  value: 'MG',
                  label: 'MG'
                },
                {
                  value: 'PA',
                  label: 'PA'
                },
                {
                  value: 'PB',
                  label: 'PB'
                },
                {
                  value: 'PR',
                  label: 'PR'
                },
                {
                  value: 'PE',
                  label: 'PE'
                },
                {
                  value: 'PI',
                  label: 'PI'
                },
                {
                  value: 'RJ',
                  label: 'RJ'
                },
                {
                  value: 'RN',
                  label: 'RN'
                },
                {
                  value: 'RS',
                  label: 'RS'
                },
                {
                  value: 'RO',
                  label: 'RO'
                },
                {
                  value: 'RR',
                  label: 'RR'
                },
                {
                  value: 'SC',
                  label: 'SC'
                },
                {
                  value: 'SP',
                  label: 'SP'
                },
                {
                  value: 'SE',
                  label: 'SE'
                },
                {
                  value: 'TO',
                  label: 'TO'
                }]
                }
                required />
              
              </div>
              <Input
              label="Telefone"
              value={formData.telefone}
              onChange={(e) =>
              setFormData({
                ...formData,
                telefone: e.target.value
              })
              }
              placeholder="(00) 00000-0000" />
            
            </div>

            {/* ⭐ SEÇÃO DE TÍTULO, CABEÇALHO E RQEs */}
            <div className="space-y-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                <FileSignatureIcon className="w-4 h-4" />
                Dados para Relatórios e Impressão
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <Select
                label="Título Profissional"
                value={formData.titulo}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  titulo: e.target.value
                })
                }
                options={[
                {
                  value: '',
                  label: 'Selecione...'
                },
                {
                  value: 'Dr.',
                  label: 'Dr.'
                },
                {
                  value: 'Dra.',
                  label: 'Dra.'
                },
                {
                  value: 'Prof.',
                  label: 'Prof.'
                },
                {
                  value: 'Prof. Dr.',
                  label: 'Prof. Dr.'
                },
                {
                  value: 'Prof. Dra.',
                  label: 'Prof. Dra.'
                },
                {
                  value: 'Excelência',
                  label: 'Excelência'
                },
                {
                  value: 'Sr.',
                  label: 'Sr.'
                },
                {
                  value: 'Sra.',
                  label: 'Sra.'
                }]
                } />
              

                <Input
                label="Título Personalizado"
                value={
                ![
                '',
                'Dr.',
                'Dra.',
                'Prof.',
                'Prof. Dr.',
                'Prof. Dra.',
                'Excelência',
                'Sr.',
                'Sra.'].
                includes(formData.titulo) ?
                formData.titulo :
                ''
                }
                onChange={(e) =>
                setFormData({
                  ...formData,
                  titulo: e.target.value
                })
                }
                placeholder="Ou digite um título personalizado" />
              
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cabeçalho para Relatórios
                </label>
                <textarea
                value={formData.cabecalhoRelatorio}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cabecalhoRelatorio: e.target.value
                })
                }
                placeholder="Ex: Dr. João Silva - CRM 123456/SP&#10;Especialista em Cardiologia - RQE 7890&#10;Clínica Saúde Total - Rua das Flores, 100"
                rows={3}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm resize-y" />
              

                <p className="text-xs text-gray-500 mt-1">
                  Este texto será impresso no cabeçalho de atestados, receitas e
                  relatórios.
                </p>
              </div>

              {/* ⭐ RQEs - Lista dinâmica */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    RQEs (Registro de Qualificação de Especialista)
                  </label>
                  <button
                  type="button"
                  onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    rqes: [
                    ...prev.rqes,
                    {
                      especialidade: '',
                      rqe: ''
                    }]

                  }))
                  }
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors">
                  
                    <PlusIcon className="w-3.5 h-3.5" />
                    Adicionar RQE
                  </button>
                </div>

                {formData.rqes.length === 0 ?
              <div className="text-center py-4 bg-white/60 rounded-lg border border-dashed border-indigo-200">
                    <p className="text-xs text-gray-500">
                      Nenhum RQE cadastrado. Clique em "Adicionar RQE" para
                      incluir.
                    </p>
                  </div> :

              <div className="space-y-2">
                    {formData.rqes.map((rqeItem, index) =>
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-white rounded-lg border border-indigo-100">
                  
                        <div className="flex-1">
                          <input
                      type="text"
                      value={rqeItem.especialidade}
                      onChange={(e) => {
                        const novasRqes = [...formData.rqes];
                        novasRqes[index] = {
                          ...novasRqes[index],
                          especialidade: e.target.value
                        };
                        setFormData({
                          ...formData,
                          rqes: novasRqes
                        });
                      }}
                      placeholder="Especialidade (ex: Cardiologia)"
                      className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
                    
                        </div>
                        <div className="w-32">
                          <input
                      type="text"
                      value={rqeItem.rqe}
                      onChange={(e) => {
                        const novasRqes = [...formData.rqes];
                        novasRqes[index] = {
                          ...novasRqes[index],
                          rqe: e.target.value
                        };
                        setFormData({
                          ...formData,
                          rqes: novasRqes
                        });
                      }}
                      placeholder="Nº RQE"
                      className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
                    
                        </div>
                        <button
                    type="button"
                    onClick={() => {
                      const novasRqes = formData.rqes.filter(
                        (_, i) => i !== index
                      );
                      setFormData({
                        ...formData,
                        rqes: novasRqes
                      });
                    }}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remover RQE">
                    
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </div>
                )}
                  </div>
              }
              </div>
            </div>

            {/* ⭐ SEÇÃO DE ENDEREÇO DO PROFISSIONAL */}
            <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="text-sm font-semibold text-green-900">
                📍 Endereço do Profissional
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Input
                  label="Endereço (Logradouro)"
                  value={formData.endereco}
                  onChange={(e) =>
                  setFormData({
                    ...formData,
                    endereco: e.target.value
                  })
                  }
                  placeholder="Rua, Avenida, etc." />
                
                </div>
                <Input
                label="Número"
                value={formData.numero}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  numero: e.target.value
                })
                }
                placeholder="123" />
              
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                label="Complemento"
                value={formData.complemento}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  complemento: e.target.value
                })
                }
                placeholder="Sala 101, Bloco A, etc." />
              

                <Input
                label="Bairro"
                value={formData.bairro}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  bairro: e.target.value
                })
                }
                placeholder="Nome do bairro" />
              
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input
                label="Cidade"
                value={formData.cidade}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cidade: e.target.value
                })
                }
                placeholder="Nome da cidade" />
              

                <Input
                label="CEP"
                value={formData.cepUsuario}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  cepUsuario: e.target.value
                })
                }
                placeholder="00000-000" />
              

                <Select
                label="UF Endereço"
                value={formData.ufEndereco}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  ufEndereco: e.target.value
                })
                }
                options={[
                {
                  value: '',
                  label: 'UF'
                },
                {
                  value: 'AC',
                  label: 'AC'
                },
                {
                  value: 'AL',
                  label: 'AL'
                },
                {
                  value: 'AP',
                  label: 'AP'
                },
                {
                  value: 'AM',
                  label: 'AM'
                },
                {
                  value: 'BA',
                  label: 'BA'
                },
                {
                  value: 'CE',
                  label: 'CE'
                },
                {
                  value: 'DF',
                  label: 'DF'
                },
                {
                  value: 'ES',
                  label: 'ES'
                },
                {
                  value: 'GO',
                  label: 'GO'
                },
                {
                  value: 'MA',
                  label: 'MA'
                },
                {
                  value: 'MT',
                  label: 'MT'
                },
                {
                  value: 'MS',
                  label: 'MS'
                },
                {
                  value: 'MG',
                  label: 'MG'
                },
                {
                  value: 'PA',
                  label: 'PA'
                },
                {
                  value: 'PB',
                  label: 'PB'
                },
                {
                  value: 'PR',
                  label: 'PR'
                },
                {
                  value: 'PE',
                  label: 'PE'
                },
                {
                  value: 'PI',
                  label: 'PI'
                },
                {
                  value: 'RJ',
                  label: 'RJ'
                },
                {
                  value: 'RN',
                  label: 'RN'
                },
                {
                  value: 'RS',
                  label: 'RS'
                },
                {
                  value: 'RO',
                  label: 'RO'
                },
                {
                  value: 'RR',
                  label: 'RR'
                },
                {
                  value: 'SC',
                  label: 'SC'
                },
                {
                  value: 'SP',
                  label: 'SP'
                },
                {
                  value: 'SE',
                  label: 'SE'
                },
                {
                  value: 'TO',
                  label: 'TO'
                }]
                } />
              
              </div>
            </div>

            {/* ⭐ SEÇÃO DE ESPECIALIDADES */}
            <div className="border-2 border-purple-200 rounded-xl overflow-hidden">
              <button
              type="button"
              onClick={() => setShowEspecialidades(!showEspecialidades)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-150 transition-all">
              
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <AwardIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-gray-900 block">
                      Especialidades *
                    </span>
                    <span className="text-xs text-gray-500">
                      {formData.especialidades.length === 0 ?
                    'Selecione pelo menos uma especialidade' :
                    `${formData.especialidades.length} especialidade(s) selecionada(s)`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {formData.especialidades.length === 0 &&
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                      Obrigatório
                    </span>
                }
                  {showEspecialidades ?
                <ChevronUpIcon className="w-5 h-5 text-gray-500" /> :

                <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                }
                </div>
              </button>

              {showEspecialidades &&
            <div className="p-4 space-y-3 bg-white">
                  <p className="text-sm text-gray-600">
                    Selecione as especialidades do profissional:
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {especialidadesFiltradas.map((esp) => {
                  const isChecked = formData.especialidades.includes(esp.id);
                  return (
                    <label
                      key={esp.id}
                      className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all border-2 ${isChecked ? 'bg-purple-50 shadow-md border-purple-400 ring-2 ring-purple-100' : 'bg-white border-gray-200 hover:bg-gray-50 hover:shadow-sm'}`}>
                      
                          <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleEspecialidadeToggle(esp.id)}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
                      

                          <span
                        className={`text-sm ${isChecked ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                        
                            {esp.nome}
                          </span>
                        </label>);

                })}
                  </div>
                </div>
            }
            </div>
          </>
        }

        {/* ⭐ SEÇÃO: INTERVALO DE ALMOÇO (PONTO) */}
        {formData.tipo !== 'super_admin' &&
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <ClockIcon className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Intervalo de Almoço (Ponto)
                </h4>
                <p className="text-xs text-gray-500">
                  Quando ativo, o tempo do almoço é descontado das horas
                  trabalhadas no relatório de ponto.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
              type="checkbox"
              checked={formData.intervaloAlmocoAtivo}
              onChange={(e) =>
              setFormData({
                ...formData,
                intervaloAlmocoAtivo: e.target.checked
              })
              }
              className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500" />
            
              <span className="text-sm text-gray-700 font-medium">
                Descontar intervalo de almoço deste funcionário
              </span>
            </label>

            {formData.intervaloAlmocoAtivo &&
          <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                label="Início do almoço"
                type="time"
                value={formData.intervaloAlmocoInicio}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  intervaloAlmocoInicio: e.target.value
                })
                } />
              
                  <Input
                label="Fim do almoço"
                type="time"
                value={formData.intervaloAlmocoFim}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  intervaloAlmocoFim: e.target.value
                })
                } />
              
                </div>
                <p className="text-xs text-amber-700 mt-2">
                  ⏱️ Marcações feitas dentro desta janela são identificadas como
                  saída/retorno do almoço no kiosk facial. Se o funcionário não
                  bater o ponto no almoço, o período é descontado
                  automaticamente.
                </p>
              </>
          }
          </div>
        }

        {/* ⭐ SEÇÃO DE PERMISSÕES DE MENU - MELHORADA */}
        <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPermissoes(!showPermissoes)}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-all">
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <ShieldCheckIcon className="w-5 h-5 text-teal-600" />
              </div>
              <div className="text-left">
                <span className="font-semibold text-gray-900 block">
                  Permissões de Menu
                </span>
                <span className="text-xs text-gray-500">
                  {totalSelecionados} de {totalMenus} menus liberados
                  {estaNoPadrao &&
                  <span className="ml-2 text-teal-600">(padrão)</span>
                  }
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalSelecionados === 0 &&
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                  Sem acesso
                </span>
              }
              {showPermissoes ?
              <ChevronUpIcon className="w-5 h-5 text-gray-500" /> :

              <ChevronDownIcon className="w-5 h-5 text-gray-500" />
              }
            </div>
          </button>

          {showPermissoes &&
          <div className="p-4 space-y-4 bg-white">
              {/* ⭐ Operações no prontuário — independe do tipo do usuário.
                 Sem isto, apenas médico/dentista registra no prontuário e os
                 demais papéis ficam em modo somente leitura. */}
              <div className="p-4 rounded-xl border-2 border-teal-200 bg-teal-50/60">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                  type="checkbox"
                  checked={formData.prontuarioTotal}
                  onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    prontuarioTotal: e.target.checked
                  }))
                  }
                  className="mt-0.5 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
                
                  <span>
                    <span className="block text-sm font-bold text-gray-800">
                      Liberar todas as operações no prontuário
                    </span>
                    <span className="block text-xs text-gray-600 mt-1">
                      Permite registrar, editar e imprimir todas as etapas do
                      prontuário (anamnese, evolução, prescrições, atestados,
                      relatórios e exames), mesmo que o usuário não seja médico
                      ou dentista. Sem esta permissão, esses papéis apenas
                      visualizam o prontuário.
                    </span>
                    <span className="block text-xs text-amber-700 mt-1">
                      Atendimentos já assinados continuam bloqueados para
                      todos.
                    </span>
                  </span>
                </label>
              </div>

              {/* Barra de ações rápidas */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600 mr-2">
                  Ações rápidas:
                </span>
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMarcarTodos}
                className="text-xs">
                
                  <CheckIcon className="w-3 h-3 mr-1" />
                  Marcar todos
                </Button>
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDesmarcarTodos}
                className="text-xs text-red-600 hover:bg-red-50">
                
                  <XIcon className="w-3 h-3 mr-1" />
                  Desmarcar todos
                </Button>
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetPermissoes}
                className="text-xs text-blue-600 hover:bg-blue-50">
                
                  <RotateCcwIcon className="w-3 h-3 mr-1" />
                  Padrão do tipo
                </Button>
              </div>

              {/* Grid de permissões por categoria */}
              {Object.entries(CATEGORIAS).map(([catId, catInfo]) => {
              const itensCategoria = menusDisponiveis.filter(
                (m) => m.categoria === catId
              );
              if (itensCategoria.length === 0) return null;
              const todosMarcados = itensCategoria.every((item) =>
              formData.permissoesMenu.includes(item.id)
              );
              const algunsMarcados = itensCategoria.some((item) =>
              formData.permissoesMenu.includes(item.id)
              );
              return (
                <div
                  key={catId}
                  className={`p-4 rounded-xl border-2 ${catInfo.cor}`}>
                  
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                        {catInfo.label}
                      </h5>
                      <button
                      type="button"
                      onClick={() => {
                        // ⭐ Filtra itens habilitados (exclui super_admin-only para não-super_admin)
                        const itensHabilitados = itensCategoria.filter(
                          (i) => !isMenuDisabled(i.id)
                        );
                        if (itensHabilitados.length === 0) return;
                        const todosMarcadosHab = itensHabilitados.every(
                          (item) => formData.permissoesMenu.includes(item.id)
                        );
                        if (todosMarcadosHab) {
                          // Desmarcar todos habilitados da categoria
                          setFormData((prev) => ({
                            ...prev,
                            permissoesMenu: prev.permissoesMenu.filter(
                              (p) =>
                              !itensHabilitados.some((i) => i.id === p)
                            )
                          }));
                        } else {
                          // Marcar todos habilitados da categoria
                          const novosIds = itensHabilitados.map((i) => i.id);
                          setFormData((prev) => ({
                            ...prev,
                            permissoesMenu: [
                            ...new Set([
                            ...prev.permissoesMenu,
                            ...novosIds]
                            )]

                          }));
                        }
                      }}
                      className={`text-xs px-2 py-1 rounded-md transition-colors ${todosMarcados ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-teal-100 text-teal-700 hover:bg-teal-200'}`}>
                      
                        {todosMarcados ? 'Desmarcar' : 'Marcar'} todos
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {itensCategoria.map((item) => {
                      const Icon = MENU_ICONS[item.id];
                      const isChecked = formData.permissoesMenu.includes(
                        item.id
                      );
                      const disabled = isMenuDisabled(item.id);
                      return (
                        <label
                          key={item.id}
                          title={
                          disabled ?
                          'Disponível apenas para Super Admin' :
                          item.label
                          }
                          className={`flex items-center gap-2 p-3 rounded-lg transition-all border-2 ${disabled ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed' : isChecked ? 'bg-white shadow-md border-teal-400 ring-2 ring-teal-100 cursor-pointer' : 'bg-white/60 border-transparent hover:bg-white hover:shadow-sm cursor-pointer'}`}>
                          
                            <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handlePermissaoToggle(item.id)}
                            disabled={disabled}
                            className={`w-4 h-4 border-gray-300 rounded ${disabled ? 'text-gray-400 cursor-not-allowed' : 'text-teal-600 focus:ring-teal-500'}`} />
                          

                            {Icon &&
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 ${disabled ? 'text-gray-400' : isChecked ? 'text-teal-600' : 'text-gray-400'}`} />

                          }
                            <span
                            className={`text-sm ${disabled ? 'text-gray-400' : isChecked ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                            
                              {item.label}
                            </span>
                            {disabled &&
                          <ShieldIcon
                            className="w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0"
                            title="Apenas Super Admin" />

                          }
                          </label>);

                    })}
                    </div>
                  </div>);

            })}

              {/* Resumo */}
              <div
              className={`p-4 rounded-lg border-2 ${totalSelecionados === 0 ? 'bg-red-50 border-red-200' : 'bg-teal-50 border-teal-200'}`}>
              
                <div className="flex items-center gap-3">
                  {totalSelecionados === 0 ?
                <>
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <XIcon className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-red-900">
                          ⚠️ Usuário sem acesso a nenhum menu
                        </p>
                        <p className="text-xs text-red-700">
                          Este usuário não poderá acessar nenhuma funcionalidade
                          do sistema.
                        </p>
                      </div>
                    </> :

                <>
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        <CheckIcon className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-teal-900">
                          ✅ {totalSelecionados}{' '}
                          {totalSelecionados === 1 ?
                      'menu liberado' :
                      'menus liberados'}
                        </p>
                        <p className="text-xs text-teal-700">
                          {formData.permissoesMenu.slice(0, 5).join(', ')}
                          {formData.permissoesMenu.length > 5 &&
                      ` e mais ${formData.permissoesMenu.length - 5}...`}
                        </p>
                      </div>
                    </>
                }
                </div>
              </div>
            </div>
          }
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ativo"
            checked={formData.ativo}
            onChange={(e) =>
            setFormData({
              ...formData,
              ativo: e.target.checked
            })
            }
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
          

          <label htmlFor="ativo" className="text-sm text-gray-700">
            Usuário ativo
          </label>
        </div>
      </form>
    </Modal>);

}