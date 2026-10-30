import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { UserPlusIcon, RefreshCwIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, TrashIcon, EditIcon, ClockIcon, PlusIcon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { API_BASE_URL } from '../config/api';
import { UsuarioForm } from '../components/UsuarioForm';
import { HorariosModal } from '../components/HorariosModal';
import { autorDaSessao } from '../utils/auditLog';

/**
 * Médico ou dentista logado só enxerga o PRÓPRIO cadastro no Memed
 * (CPF, conselho e token de prescrição são dados pessoais de cada um).
 * Admin e super admin continuam vendo todos.
 */
function profissionalLogadoRestrito(): string | null {
  try {
    const usuario = JSON.parse(localStorage.getItem('sessao') || 'null')?.usuario;
    return usuario && ['medico', 'dentista'].includes(usuario.tipo) ? String(usuario.id) : null;
  } catch {
    return null;
  }
}
interface MemedProfissional {
  id: string;
  external_id: string;
  nome: string;
  sobrenome: string;
  cpf: string;
  email?: string;
  telefone?: string;
  dataNascimento?: string;
  board_code: string;
  board_number: string;
  board_state: string;
  status: 'Ativo' | 'Em análise' | 'Inativo';
  token?: string;
}
export interface MemedProfissionaisPageProps {
  onNavigate?: (page: string) => void;
  operadoraId?: string;
  clinicaId?: string;
}
export function MemedProfissionaisPage({
  onNavigate,
  operadoraId,
  clinicaId
}: MemedProfissionaisPageProps) {
  const {
    success,
    error: showError
  } = useToast();
  const {
    confirm
  } = useDialog();
  const [profissionais, setProfissionais] = useState<MemedProfissional[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{
    [key: string]: boolean;
  }>({});
  // Configuração Memed
  const [memedConfig, setMemedConfig] = useState<{
    apiKey: string;
    secretKey: string;
  } | null>(null);
  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    cpf: '',
    email: '',
    telefone: '',
    board_code: 'CRM',
    board_number: '',
    board_state: 'SP',
    sexo: 'M',
    data_nascimento: ''
  });
  // Modal de edição de usuário
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<any>(null);
  // Modal de horários
  const [isHorariosModalOpen, setIsHorariosModalOpen] = useState(false);
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<MemedProfissional | null>(null);
  // Clínicas (necessário para o UsuarioForm)
  const [clinicas, setClinicas] = useState<any[]>([]);
  // Clínica ID local (fallback do localStorage se não vieram via props)
  const [localClinicaId, setLocalClinicaId] = useState<string>('');
  const [localOperadoraId, setLocalOperadoraId] = useState<string>('');
  // Carrega configuração Memed
  useEffect(() => {
    const loadMemedConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/configuracoes-globais/memed_config`);
        if (response.ok) {
          const data = await response.json();
          setMemedConfig(data.valor);
        }
      } catch (err) {
        console.error('Erro ao carregar config Memed:', err);
      }
    };
    loadMemedConfig();
  }, []);
  // Carrega IDs da sessão se não vieram via props
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const sessaoData = JSON.parse(sessao);
      if (!clinicaId && sessaoData.clinicaAtual?.id) {
        setLocalClinicaId(sessaoData.clinicaAtual.id);
      }
      // Pega operadoraId da sessão
      const opId = sessaoData.operadoraSelecionada?.id || sessaoData.usuario?.operadoraId;
      if (!operadoraId && opId) {
        setLocalOperadoraId(opId);
      }
    }
  }, [clinicaId, operadoraId]);
  // Carrega profissionais do sistema
  useEffect(() => {
    loadProfissionais();
    loadClinicas();
  }, [operadoraId, clinicaId, localOperadoraId, localClinicaId]);
  const loadClinicas = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/clinicas`);
      if (response.ok) {
        const data = await response.json();
        setClinicas(data);
      }
    } catch (err) {
      console.error('❌ Erro ao carregar clínicas:', err);
    }
  };
  // IDs efetivos (props ou localStorage)
  const effectiveOperadoraId = operadoraId || localOperadoraId;
  const effectiveClinicaId = clinicaId || localClinicaId;
  const loadProfissionais = async () => {
    setLoading(true);
    try {
      // Carrega usuários do sistema
      const response = await fetch(`${API_BASE_URL}/api/usuarios`);
      if (!response.ok) throw new Error('Erro ao carregar usuários');
      const usuarios = await response.json();
      console.log('📋 [MemedProfissionais] Usuários carregados:', usuarios.length);
      console.log('🔍 [MemedProfissionais] Filtros - operadoraId:', effectiveOperadoraId, 'clinicaId:', effectiveClinicaId);
      // Carrega profissionais já cadastrados no Memed (com tokens salvos)
      let memedProfissionaisSalvos: any[] = [];
      const somenteProprio = profissionalLogadoRestrito();
      try {
        // Médico/dentista: busca só o próprio registro (não traz token dos colegas)
        const memedResponse = await fetch(
          somenteProprio ?
          `${API_BASE_URL}/api/memed-profissionais?usuarioId=${encodeURIComponent(somenteProprio)}` :
          `${API_BASE_URL}/api/memed-profissionais`
        );
        if (memedResponse.ok) {
          const dadosMemed = await memedResponse.json();
          // Com usuarioId o servidor devolve um único registro
          memedProfissionaisSalvos = Array.isArray(dadosMemed) ? dadosMemed : dadosMemed ? [dadosMemed] : [];
          console.log('📋 [MemedProfissionais] Profissionais Memed salvos:', memedProfissionaisSalvos.length);
        }
      } catch (err) {
        console.warn('⚠️ [MemedProfissionais] Erro ao carregar profissionais Memed salvos:', err);
      }
      // Cria um mapa de usuarioId -> dados do Memed (String para evitar mismatch int vs string)
      const memedMap = new Map(memedProfissionaisSalvos.map((m: any) => [String(m.usuarioId), m]));
      // ⭐ FILTRO RIGOROSO: Apenas médicos/dentistas da operadora/clínica atual
      const profs = usuarios.filter((u: any) => {
        const isMedicoOuDentista = ['medico', 'dentista'].includes(u.tipo);
        const temCrm = u.crm && u.crm.trim() !== '';
        const temUf = u.uf && u.uf.trim() !== '';
        // ⭐ FILTRO POR OPERADORA (obrigatório)
        const pertenceOperadora = effectiveOperadoraId ? u.operadoraId === effectiveOperadoraId : true;
        // ⭐ FILTRO POR CLÍNICA (se especificado)
        // Se o usuário tem clinicaId definido, deve ser igual à clínica atual
        // Se o usuário não tem clinicaId (null), pertence a todas as clínicas da operadora
        const pertenceClinica = effectiveClinicaId ? u.clinicaId === effectiveClinicaId || u.clinicaId === null : true;
        const ehOProprio = !somenteProprio || String(u.id) === somenteProprio;
        const incluir = ehOProprio && isMedicoOuDentista && temCrm && temUf && pertenceOperadora && pertenceClinica;
        console.log(`🔍 [MemedProfissionais] ${u.nome}:`, {
          tipo: u.tipo,
          isMedicoOuDentista,
          crm: u.crm,
          temCrm,
          uf: u.uf,
          temUf,
          operadoraId: u.operadoraId,
          pertenceOperadora,
          clinicaId: u.clinicaId,
          pertenceClinica,
          incluir
        });
        return incluir;
      }).map((u: any) => {
        const nomeCompleto = u.nome.split(' ');
        const nome = nomeCompleto[0] || '';
        const sobrenome = nomeCompleto.slice(1).join(' ') || '';
        // Verifica se já tem dados salvos no Memed (String para evitar mismatch)
        const memedData = memedMap.get(String(u.id));
        return {
          id: u.id,
          external_id: u.id,
          nome: nome,
          sobrenome: sobrenome,
          cpf: u.cpf || '',
          email: u.email || '',
          telefone: u.telefone || '',
          dataNascimento: u.dataNascimento || '',
          board_code: u.tipo === 'medico' ? 'CRM' : 'CRO',
          board_number: u.crm,
          board_state: u.uf,
          // Se tem token salvo, está Ativo; senão, Em análise
          status: memedData?.token ? 'Ativo' as const : 'Em análise' as const,
          token: memedData?.token || undefined
        };
      });
      console.log('✅ [MemedProfissionais] Profissionais filtrados:', profs.length);
      setProfissionais(profs);
    } catch (err) {
      console.error('❌ Erro ao carregar profissionais:', err);
      showError('Erro', 'Não foi possível carregar os profissionais');
    } finally {
      setLoading(false);
    }
  };
  const cadastrarNoMemed = async (prof: MemedProfissional) => {
    if (!memedConfig) {
      showError('Erro', 'Configure o Memed em Configurações Globais primeiro');
      return;
    }
    // Validação de dados obrigatórios
    if (!prof.board_number || !prof.board_state) {
      showError('Dados Incompletos', 'Este profissional não possui CRM/CRO e UF cadastrados. Edite o usuário em "Usuários" e preencha esses campos primeiro.');
      return;
    }
    if (!prof.cpf || prof.cpf.trim() === '') {
      showError('CPF Obrigatório', 'Este profissional não possui CPF cadastrado. Edite o usuário em "Usuários" e preencha o CPF primeiro.');
      return;
    }
    setActionLoading((prev) => ({
      ...prev,
      [`cadastrar_${prof.id}`]: true
    }));
    try {
      console.log('📤 [Memed] Cadastrando profissional:', prof);
      const cpfLimpo = prof.cpf.replace(/\D/g, '');
      const telefoneLimpo = prof.telefone?.replace(/\D/g, '') || '';
      console.log('🔍 [Memed] CPF limpo:', cpfLimpo);
      console.log('🔍 [Memed] Telefone limpo:', telefoneLimpo);
      // Converte data de YYYY-MM-DD para DD/MM/YYYY
      let dataNascimentoFormatada = '01/01/1980'; // valor padrão
      if (prof.dataNascimento) {
        const [ano, mes, dia] = prof.dataNascimento.split('-');
        dataNascimentoFormatada = `${dia}/${mes}/${ano}`;
      }
      console.log('🔍 [Memed] Data nascimento formatada:', dataNascimentoFormatada);
      const payload = {
        data: {
          type: 'usuarios',
          attributes: {
            external_id: prof.external_id,
            nome: prof.nome,
            sobrenome: prof.sobrenome,
            cpf: cpfLimpo,
            board: {
              board_code: prof.board_code,
              board_number: prof.board_number,
              board_state: prof.board_state
            },
            email: prof.email || '',
            telefone: telefoneLimpo,
            sexo: 'M',
            data_nascimento: dataNascimentoFormatada
          }
        }
      };
      console.log('📦 [Memed] Payload completo:', JSON.stringify(payload, null, 2));
      // ⭐ Usa proxy do backend para evitar CORS
      const url = `${API_BASE_URL}/api/memed-profissionais/proxy/cadastrar`;
      console.log('🌐 [Memed] Cadastrando via proxy:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log('📥 [Memed] Status da resposta:', response.status);
      console.log('📥 [Memed] Headers da resposta:', Object.fromEntries(response.headers.entries()));
      const responseText = await response.text();
      console.log('📥 [Memed] Resposta bruta:', responseText);
      if (response.ok) {
        const data = JSON.parse(responseText);
        console.log('✅ [Memed] Resposta parseada:', data);
        success('Profissional Cadastrado', `${prof.nome} foi cadastrado no Memed! Buscando token automaticamente...`);
        loadProfissionais();
        // ⭐ Busca token automaticamente após cadastro (Memed permite prescrever mesmo "Em análise")
        setTimeout(() => buscarTokenMemed(prof), 1500);
      } else {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = {
            errors: [{
              detail: responseText
            }]
          };
        }
        console.error('❌ [Memed] Erro detalhado:', errorData);
        const errorMessage = errorData.errors?.[0]?.detail || errorData.errors?.[0]?.title || errorData.message || 'Erro desconhecido ao cadastrar';
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      console.error('❌ [Memed] Exceção:', err);
      showError('Erro ao Cadastrar no Memed', err.message);
    } finally {
      setActionLoading((prev) => ({
        ...prev,
        [`cadastrar_${prof.id}`]: false
      }));
    }
  };
  const buscarTokenMemed = async (prof: MemedProfissional) => {
    if (!memedConfig) {
      showError('Erro', 'Configure o Memed em Configurações Globais primeiro');
      return;
    }
    // Validação de dados obrigatórios
    if (!prof.board_number || !prof.board_state) {
      showError('Dados Incompletos', 'Este profissional não possui CRM/CRO e UF cadastrados. Edite o usuário em "Usuários" e preencha esses campos primeiro.');
      return;
    }
    setActionLoading((prev) => ({
      ...prev,
      [`token_${prof.id}`]: true
    }));
    try {
      console.log('🔍 [Memed] Buscando token para:', prof);
      // CORREÇÃO: Usa external_id em vez de CRM+UF
      const identifier = prof.external_id;
      console.log('🔑 [Memed] Identificador (external_id):', identifier);
      // ⭐ Usa proxy do backend para evitar CORS
      const response = await fetch(`${API_BASE_URL}/api/memed-profissionais/proxy/token/${identifier}`);
      console.log('📥 [Memed] Status da resposta:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Memed] Resposta:', data);
        const token = data.data?.attributes?.token;
        if (token) {
          // Salva token no BANCO DE DADOS (não no localStorage)
          console.log('💾 [Memed] Salvando token no banco de dados...');
          const saveResponse = await fetch(`${API_BASE_URL}/api/memed-profissionais`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              usuarioId: prof.id,
              external_id: prof.external_id,
              nome: prof.nome,
              sobrenome: prof.sobrenome,
              cpf: prof.cpf,
              email: prof.email,
              telefone: prof.telefone,
              board_code: prof.board_code,
              board_number: prof.board_number,
              board_state: prof.board_state,
              token: token,
              status: 'Ativo'
            })
          });
          if (!saveResponse.ok) {
            throw new Error('Erro ao salvar token no banco de dados');
          }
          console.log('✅ [Memed] Token salvo no banco de dados!');
          success('Token Obtido e Salvo!', `Token salvo com sucesso no banco de dados. Agora todos os usuários podem fazer prescrições.`);
          // Copia token para clipboard
          navigator.clipboard.writeText(token);
          // Atualiza o profissional com o token
          setProfissionais((prev) => prev.map((p) => p.id === prof.id ? {
            ...p,
            token,
            status: 'Ativo'
          } : p));
        } else {
          throw new Error('Token não encontrado na resposta');
        }
      } else {
        // ⭐ Lê como texto primeiro para evitar crash com respostas HTML (ex: 503)
        let errorMessage = `Erro ${response.status} ao buscar token`;
        try {
          const errorText = await response.text();
          console.error('❌ [Memed] Erro:', response.status, errorText.substring(0, 200));
          // Tenta parsear como JSON
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.errors?.[0]?.detail || errorData.message || errorMessage;
        } catch {


          // Resposta não é JSON (ex: HTML do 503)
        }if (response.status === 503 || response.status === 502) {
          throw new Error('Servidor Memed temporariamente indisponível. Aguarde alguns minutos e tente novamente.');
        }
        if (response.status === 404) {
          throw new Error('Profissional não encontrado no Memed. Cadastre-o primeiro clicando no botão "+".');
        }
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      console.error('❌ [Memed] Exceção:', err);
      showError('Erro ao Buscar Token', err.message);
    } finally {
      setActionLoading((prev) => ({
        ...prev,
        [`token_${prof.id}`]: false
      }));
    }
  };
  const excluirDoMemed = async (prof: MemedProfissional) => {
    if (!memedConfig) {
      showError('Erro', 'Configure o Memed em Configurações Globais primeiro');
      return;
    }
    const shouldDelete = await confirm('Excluir do Memed', `Tem certeza que deseja excluir ${prof.nome} do Memed? Esta ação é IRREVERSÍVEL e apagará todo o histórico de prescrições.`, 'Excluir', 'Cancelar');
    if (!shouldDelete) {
      return;
    }
    try {
      // ⭐ Usa proxy do backend para evitar CORS
      const identifier = prof.external_id;
      const response = await fetch(`${API_BASE_URL}/api/memed-profissionais/proxy/excluir/${identifier}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        success('Profissional Excluído', `${prof.nome} foi removido do Memed`);
        loadProfissionais();
      } else {
        throw new Error('Erro ao excluir profissional');
      }
    } catch (err: any) {
      showError('Erro ao Excluir', err.message);
    }
  };
  const handleEditarProfissional = async (prof: MemedProfissional) => {
    try {
      // Busca dados completos do usuário
      const response = await fetch(`${API_BASE_URL}/api/usuarios`);
      if (response.ok) {
        const usuarios = await response.json();
        const usuario = usuarios.find((u: any) => u.id === prof.id);
        if (usuario) {
          setEditingUsuario(usuario);
          setIsEditModalOpen(true);
        } else {
          showError('Erro', 'Usuário não encontrado');
        }
      }
    } catch (err) {
      console.error('Erro ao buscar usuário:', err);
      showError('Erro', 'Não foi possível carregar os dados do usuário');
    }
  };
  const handleSaveUsuario = async (usuarioData: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/usuarios/${editingUsuario.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...usuarioData, ...autorDaSessao() })
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar usuário');
      }
      success('Usuário Atualizado', 'Dados salvos com sucesso!');
      setIsEditModalOpen(false);
      setEditingUsuario(null);
      loadProfissionais(); // Recarrega lista
    } catch (err: any) {
      showError('Erro ao Salvar', err.message);
    }
  };
  const handleConfigurarHorarios = async (prof: MemedProfissional) => {
    try {
      // Busca dados completos do usuário para pegar o nome exato
      const response = await fetch(`${API_BASE_URL}/api/usuarios`);
      if (response.ok) {
        const usuarios = await response.json();
        const usuario = usuarios.find((u: any) => u.id === prof.id);
        if (usuario) {
          console.log('👤 [MemedProfissionais] Usuário encontrado:', usuario.nome);
          // Usa o nome EXATO do usuário (como está salvo no banco)
          setProfissionalSelecionado({
            ...prof,
            nome: usuario.nome,
            sobrenome: '' // Limpa sobrenome para usar só o nome completo
          });
          setIsHorariosModalOpen(true);
        } else {
          showError('Erro', 'Usuário não encontrado');
        }
      }
    } catch (err) {
      console.error('Erro ao buscar usuário:', err);
      showError('Erro', 'Não foi possível carregar os dados do usuário');
    }
  };
  const columns = [{
    key: 'nome',
    label: 'Nome',
    render: (prof: MemedProfissional) => <div>
          <p className="font-medium text-gray-900">
            {prof.nome} {prof.sobrenome}
          </p>
          <p className="text-xs text-gray-500">{prof.email}</p>
        </div>
  }, {
    key: 'registro',
    label: 'Registro',
    render: (prof: MemedProfissional) => <div>
          <p className="text-sm text-gray-900">
            {prof.board_code} {prof.board_number}
          </p>
          <p className="text-xs text-gray-500">{prof.board_state}</p>
        </div>
  }, {
    key: 'cpf',
    label: 'CPF',
    render: (prof: MemedProfissional) => <span className="text-sm text-gray-600">{prof.cpf}</span>
  }, {
    key: 'status',
    label: 'Status Memed',
    render: (prof: MemedProfissional) => {
      const statusConfig = {
        Ativo: {
          color: 'bg-green-100 text-green-800',
          icon: CheckCircleIcon
        },
        'Em análise': {
          color: 'bg-blue-100 text-blue-800',
          icon: AlertCircleIcon
        },
        Inativo: {
          color: 'bg-red-100 text-red-800',
          icon: XCircleIcon
        }
      };
      const config = statusConfig[prof.status];
      const Icon = config.icon;
      return <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
          
            <Icon className="w-3 h-3" />
            {prof.status}
          </div>;
    }
  }, {
    key: 'acoes',
    label: 'Ações',
    render: (prof: MemedProfissional) => <div className="flex items-center gap-2">
          {/* Botão Editar Cadastro */}
          <Button size="sm" variant="secondary" onClick={() => handleEditarProfissional(prof)} title="Editar cadastro do profissional" className="text-blue-600 hover:bg-blue-50">
        
            <EditIcon className="w-4 h-4" />
          </Button>

          {/* Botão Configurar Horários */}
          <Button size="sm" variant="secondary" onClick={() => handleConfigurarHorarios(prof)} title="Configurar horários de atendimento" className="text-teal-600 hover:bg-teal-50">
        
            <ClockIcon className="w-4 h-4" />
          </Button>

          {/* Botão Cadastrar no Memed */}
          <Button size="sm" variant="secondary" onClick={() => cadastrarNoMemed(prof)} disabled={actionLoading[`cadastrar_${prof.id}`]} title="Cadastrar no Memed" className="relative">
        
            {actionLoading[`cadastrar_${prof.id}`] ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <div className="relative flex items-center justify-center">
                {/* Logo Memed (imagem real) */}
                <img src="/image.png" alt="Memed" className="w-4 h-4 object-contain" />
          
                {/* Ícone + sobreposto */}
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center">
                  <PlusIcon className="w-2 h-2 text-purple-600" strokeWidth={3} />
            
                </div>
              </div>}
          </Button>

          {/* Botão Buscar Token */}
          <Button size="sm" variant="secondary" onClick={() => buscarTokenMemed(prof)} disabled={actionLoading[`token_${prof.id}`]} title="Buscar Token">
        
            {actionLoading[`token_${prof.id}`] ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
          </Button>

          {/* Botão Excluir */}
          <Button size="sm" variant="ghost" onClick={() => excluirDoMemed(prof)} disabled={actionLoading[`excluir_${prof.id}`]} title="Excluir do Memed" className="text-red-600 hover:bg-red-50">
        
            {actionLoading[`excluir_${prof.id}`] ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
          </Button>
        </div>
  }];
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Profissionais Memed
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie o cadastro de profissionais na plataforma Memed
          </p>
        </div>
        <Button onClick={loadProfissionais} disabled={loading}>
          <RefreshCwIcon className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Informações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {profissionais.filter((p) => p.status === 'Ativo').length}
              </p>
              <p className="text-xs text-gray-500">Ativos no Memed</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertCircleIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {profissionais.filter((p) => p.status === 'Em análise').length}
              </p>
              <p className="text-xs text-gray-500">Em Análise</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <UserPlusIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {profissionais.length}
              </p>
              <p className="text-xs text-gray-500">Total de Profissionais</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Avisos */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          ℹ️ Como funciona
        </h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>
            • <strong>Cadastrar no Memed:</strong> Envia os dados e busca o
            token automaticamente
          </li>
          <li>
            • <strong>Em análise:</strong> Profissionais já podem prescrever
            normalmente (segundo a Memed)
          </li>
          <li>
            • <strong>Buscar Token:</strong> Obtém/atualiza o token de acesso
            manualmente
          </li>
          <li>
            • <strong>Excluir:</strong> Remove permanentemente o profissional e
            todo seu histórico
          </li>
        </ul>
      </div>

      {!memedConfig && <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium">
            ⚠️ Configure o Memed em Configurações Globais primeiro
          </p>
        </div>}

      {/* Aviso de filtro ativo */}
      {(effectiveOperadoraId || effectiveClinicaId) && <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm text-teal-800">
            🔍 <strong>Filtro ativo:</strong> Exibindo apenas profissionais da
            sua operadora/clínica
          </p>
        </div>}

      {/* Tabela */}
      <Card>
        {loading ? <div className="text-center py-8">
            <RefreshCwIcon className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-600">Carregando profissionais...</p>
          </div> : profissionais.length === 0 ? <div className="text-center py-8">
            <p className="text-gray-600">
              Nenhum profissional cadastrado. Cadastre médicos ou dentistas em
              Usuários.
            </p>
          </div> : <Table columns={columns} data={profissionais} />}
      </Card>

      {/* Modal de Edição de Usuário */}
      {isEditModalOpen && editingUsuario && <UsuarioForm isOpen={isEditModalOpen} onClose={() => {
      setIsEditModalOpen(false);
      setEditingUsuario(null);
    }} onSave={handleSaveUsuario} usuarioEdit={editingUsuario} clinicas={clinicas} isSuperAdmin={false} />}

      {/* Modal de Horários */}
      {isHorariosModalOpen && profissionalSelecionado && effectiveClinicaId && <HorariosModal isOpen={isHorariosModalOpen} onClose={() => {
      setIsHorariosModalOpen(false);
      setProfissionalSelecionado(null);
    }} profissionalId={profissionalSelecionado.id} profissionalNome={profissionalSelecionado.sobrenome ? `${profissionalSelecionado.nome} ${profissionalSelecionado.sobrenome}`.trim() : profissionalSelecionado.nome.trim()} especialidade={profissionalSelecionado.board_code === 'CRM' ? 'medico' : 'dentista'} clinicaId={effectiveClinicaId} />}
    </div>;
}