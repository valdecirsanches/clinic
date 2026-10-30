import React, { useCallback, useEffect, useState, useRef } from 'react';
import { PlusIcon, BuildingIcon, PencilIcon, Trash2Icon, AlertTriangleIcon, CrownIcon, SparklesIcon, UsersIcon, SearchIcon, CheckCircleIcon, XCircleIcon, Loader2Icon, AlertCircleIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Operadora } from '../types';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/useToast';
interface Plano {
  id: string;
  nome: string;
  preco: number;
  limitePacientes: number | null;
  recursos: string[];
  destaque: boolean;
  ativo: boolean;
}
export interface OperadorasPageProps {
  operadoras: Operadora[];
  onAddOperadora: (operadora: any) => void;
  onUpdateOperadora: (id: string, updates: Partial<Operadora>) => void;
  onDeleteOperadora: (id: string) => void;
  usuarioTipo?: string;
}
export function OperadorasPage({
  operadoras,
  onAddOperadora,
  onUpdateOperadora,
  onDeleteOperadora,
  usuarioTipo
}: OperadorasPageProps) {
  const {
    success,
    error: showError,
    warning,
    info
  } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [operadoraEdit, setOperadoraEdit] = useState<Operadora | null>(null);
  const [operadoraToDelete, setOperadoraToDelete] = useState<Operadora | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    razaoSocial: '',
    telefone: '',
    email: '',
    endereco: '',
    ativa: true,
    logoUrl: ''
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // ⭐⭐⭐ NOVO: Estados para consulta de CNPJ na Receita Federal ⭐⭐⭐
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error' | 'inactive'>('idle');
  const [cnpjMessage, setCnpjMessage] = useState('');
  const [cnpjData, setCnpjData] = useState<any>(null);
  // Modal de alteração de plano
  const [isPlanoModalOpen, setIsPlanoModalOpen] = useState(false);
  const [operadoraPlano, setOperadoraPlano] = useState<Operadora | null>(null);
  const [planoSelecionado, setPlanoSelecionado] = useState('');
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loadingPlanos, setLoadingPlanos] = useState(false);
  const [salvandoPlano, setSalvandoPlano] = useState(false);
  const isSuperAdmin = usuarioTipo === 'super_admin';
  // Carrega planos disponíveis
  useEffect(() => {
    fetchPlanos();
  }, []);
  const fetchPlanos = async () => {
    setLoadingPlanos(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/planos`);
      if (response.ok) {
        const data = await response.json();
        setPlanos(data);
      }
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
    } finally {
      setLoadingPlanos(false);
    }
  };
  const handleEdit = (operadora: Operadora) => {
    setOperadoraEdit(operadora);
    setFormData({
      nome: operadora.nome,
      cnpj: operadora.cnpj,
      razaoSocial: operadora.razaoSocial,
      telefone: operadora.telefone,
      email: operadora.email,
      endereco: operadora.endereco || '',
      ativa: operadora.ativa,
      logoUrl: operadora.logoUrl || ''
    });
    setLogoPreview(operadora.logoUrl || null);
    setIsModalOpen(true);
  };
  // ⭐ Handler para upload de logo
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showError('Arquivo muito grande', 'O logo deve ter no máximo 2MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showError('Formato inválido', 'Selecione uma imagem (PNG, JPG, etc.).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setLogoPreview(base64);
      setFormData((prev) => ({
        ...prev,
        logoUrl: base64
      }));
    };
    reader.readAsDataURL(file);
  };
  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setFormData((prev) => ({
      ...prev,
      logoUrl: ''
    }));
    if (logoInputRef.current) logoInputRef.current.value = '';
  };
  const handleDelete = (operadora: Operadora) => {
    setOperadoraToDelete(operadora);
  };
  const confirmDelete = () => {
    if (operadoraToDelete) {
      onDeleteOperadora(operadoraToDelete.id);
      setOperadoraToDelete(null);
    }
  };
  // ⭐⭐⭐ NOVO: Formata CNPJ enquanto digita ⭐⭐⭐
  const formatarCnpj = (valor: string): string => {
    const numeros = valor.replace(/\D/g, '').substring(0, 14);
    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 5) return `${numeros.slice(0, 2)}.${numeros.slice(2)}`;
    if (numeros.length <= 8) return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5)}`;
    if (numeros.length <= 12) return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8)}`;
    return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8, 12)}-${numeros.slice(12)}`;
  };
  // ⭐⭐⭐ NOVO: Consulta CNPJ na Receita Federal ⭐⭐⭐
  const consultarCnpj = useCallback(async (cnpj: string) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      setCnpjStatus('idle');
      setCnpjMessage('');
      setCnpjData(null);
      return;
    }
    setCnpjStatus('loading');
    setCnpjMessage('Consultando Receita Federal...');
    setCnpjData(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/operadoras/consulta-cnpj/${cnpjLimpo}`);
      const data = await response.json();
      if (!response.ok || !data.encontrado) {
        setCnpjStatus('not_found');
        setCnpjMessage(data.error || 'CNPJ não encontrado na Receita Federal. Cadastro não permitido.');
        setCnpjData(null);
        return;
      }
      // Verifica situação cadastral (2 = Ativa)
      if (data.situacaoCadastral && data.situacaoCadastral !== 2) {
        setCnpjStatus('inactive');
        setCnpjMessage(`CNPJ encontrado mas com situação "${data.descricaoSituacao}". Apenas empresas ATIVAS podem ser cadastradas.`);
        setCnpjData(data);
        return;
      }
      // ✅ CNPJ válido e ativo - preenche campos automaticamente
      setCnpjStatus('found');
      setCnpjMessage(`✅ ${data.razaoSocial}`);
      setCnpjData(data);
      setFormData((prev) => ({
        ...prev,
        razaoSocial: data.razaoSocial || prev.razaoSocial,
        nome: data.nomeFantasia || data.razaoSocial || prev.nome,
        telefone: data.telefone || prev.telefone,
        email: data.email || prev.email,
        endereco: data.endereco || prev.endereco
      }));
      info('CNPJ Encontrado', `Dados preenchidos automaticamente: ${data.nomeFantasia || data.razaoSocial}`);
    } catch (err: any) {
      setCnpjStatus('error');
      setCnpjMessage('Erro ao consultar Receita Federal. Tente novamente.');
      setCnpjData(null);
    }
  }, [info]);
  // ⭐⭐⭐ NOVO: Handler do campo CNPJ com formatação e consulta automática ⭐⭐⭐
  const handleCnpjChange = (valor: string) => {
    const formatado = formatarCnpj(valor);
    setFormData((prev) => ({
      ...prev,
      cnpj: formatado
    }));
    // Consulta automaticamente quando tiver 14 dígitos
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length === 14) {
      consultarCnpj(numeros);
    } else {
      setCnpjStatus('idle');
      setCnpjMessage('');
      setCnpjData(null);
    }
  };
  // ⭐⭐⭐ NOVO: Verifica se pode salvar (CNPJ deve estar validado para novo cadastro) ⭐⭐⭐
  const podeSalvar = () => {
    if (operadoraEdit) return true; // Edição permite salvar sem revalidar CNPJ
    if (!formData.nome || !formData.cnpj || !formData.razaoSocial) return false;
    if (cnpjStatus !== 'found') return false; // Novo cadastro exige CNPJ validado
    return true;
  };
  const handleSave = () => {
    if (!operadoraEdit && cnpjStatus !== 'found') {
      showError('CNPJ Inválido', 'O CNPJ deve ser válido e estar ativo na Receita Federal para cadastrar a operadora.');
      return;
    }
    if (operadoraEdit) {
      onUpdateOperadora(operadoraEdit.id, formData);
    } else {
      onAddOperadora({
        ...formData,
        planoId: 'gratuito'
      });
    }
    handleCloseModal();
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setOperadoraEdit(null);
    setCnpjStatus('idle');
    setCnpjMessage('');
    setCnpjData(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    setFormData({
      nome: '',
      cnpj: '',
      razaoSocial: '',
      telefone: '',
      email: '',
      endereco: '',
      ativa: true,
      logoUrl: ''
    });
  };
  // Funções para gerenciar plano da operadora
  const handleAbrirPlanoModal = (operadora: Operadora) => {
    if (!isSuperAdmin) {
      warning('Sem Permissão', 'Apenas o Super Admin pode alterar planos de operadoras.');
      return;
    }
    setOperadoraPlano(operadora);
    setPlanoSelecionado(operadora.planoId || 'gratuito');
    setIsPlanoModalOpen(true);
  };
  const handleSalvarPlano = async () => {
    if (!operadoraPlano || !isSuperAdmin) return;
    setSalvandoPlano(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/operadoras/${operadoraPlano.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...operadoraPlano,
          planoId: planoSelecionado
        })
      });
      if (response.ok) {
        onUpdateOperadora(operadoraPlano.id, {
          planoId: planoSelecionado
        } as any);
        success('Plano Atualizado', `Plano da operadora "${operadoraPlano.nome}" alterado com sucesso!`);
        setIsPlanoModalOpen(false);
        setOperadoraPlano(null);
      } else {
        throw new Error('Erro ao atualizar plano');
      }
    } catch (error: any) {
      showError('Erro', error.message || 'Erro ao atualizar plano da operadora');
    } finally {
      setSalvandoPlano(false);
    }
  };
  // ⭐ Helper: cor da borda do campo CNPJ conforme status
  const getCnpjStatusColor = () => {
    switch (cnpjStatus) {
      case 'found':
        return 'border-green-500 bg-green-50';
      case 'not_found':
      case 'error':
        return 'border-red-500 bg-red-50';
      case 'inactive':
        return 'border-amber-500 bg-amber-50';
      case 'loading':
        return 'border-blue-400 bg-blue-50';
      default:
        return 'border-gray-300';
    }
  };
  // ⭐ Helper: ícone do campo CNPJ conforme status
  const getCnpjStatusIcon = () => {
    switch (cnpjStatus) {
      case 'loading':
        return <Loader2Icon className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'found':
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'not_found':
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'inactive':
        return <AlertCircleIcon className="w-5 h-5 text-amber-500" />;
      default:
        return <SearchIcon className="w-5 h-5 text-gray-400" />;
    }
  };
  const getPlanoInfo = (planoId?: string) => {
    const plano = planos.find((p) => p.id === planoId) || planos.find((p) => p.id === 'gratuito');
    return plano;
  };
  const getPlanoIcon = (planoId?: string) => {
    switch (planoId) {
      case 'profissional':
        return <CrownIcon className="w-4 h-4" />;
      case 'basico':
        return <SparklesIcon className="w-4 h-4" />;
      default:
        return <UsersIcon className="w-4 h-4" />;
    }
  };
  const getPlanoBadgeVariant = (planoId?: string): 'success' | 'warning' | 'info' | 'default' => {
    switch (planoId) {
      case 'profissional':
        return 'success';
      case 'basico':
        return 'info';
      default:
        return 'default';
    }
  };
  const columns = [{
    key: 'nome',
    label: 'Nome'
  }, {
    key: 'cnpj',
    label: 'CNPJ'
  }, {
    key: 'razaoSocial',
    label: 'Razão Social'
  }, {
    key: 'telefone',
    label: 'Telefone'
  }, {
    key: 'email',
    label: 'Email'
  }, {
    key: 'plano',
    label: 'Plano',
    render: (o: Operadora) => {
      const plano = getPlanoInfo(o.planoId);
      return <button onClick={(e) => {
        e.stopPropagation();
        handleAbrirPlanoModal(o);
      }} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${isSuperAdmin ? 'hover:ring-2 hover:ring-offset-1 hover:ring-teal-400 cursor-pointer' : 'cursor-default'} ${o.planoId === 'profissional' ? 'bg-green-100 text-green-800' : o.planoId === 'basico' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`} title={isSuperAdmin ? 'Clique para alterar o plano' : 'Plano atual da operadora'}>
          
            {getPlanoIcon(o.planoId)}
            {plano?.nome || 'Grátis'}
          </button>;
    }
  }, {
    key: 'ativa',
    label: 'Status',
    render: (o: Operadora) => <span className={`px-2 py-1 text-xs font-medium rounded-full ${o.ativa ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
      
          {o.ativa ? 'Ativa' : 'Inativa'}
        </span>
  }, {
    key: 'acoes',
    label: 'Ações',
    render: (o: Operadora) => <div className="flex items-center gap-2">
          <button onClick={(e) => {
        e.stopPropagation();
        handleEdit(o);
      }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar operadora">
        
            <PencilIcon className="w-4 h-4" />
          </button>
          <button onClick={(e) => {
        e.stopPropagation();
        handleDelete(o);
      }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir operadora em cascata">
        
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
  }];
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Gerenciar Operadoras
          </h1>
          <p className="text-gray-500 mt-1">
            Administração de operadoras do sistema
          </p>
        </div>
        <Button onClick={() => {
        setOperadoraEdit(null);
        setIsModalOpen(true);
      }}>
          
          <PlusIcon className="w-5 h-5 mr-2" />
          Nova Operadora
        </Button>
      </div>

      {/* Aviso sobre planos */}
      {isSuperAdmin && <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <div className="flex items-center gap-3">
            <CrownIcon className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-sm font-semibold text-teal-900">
                Gerenciamento de Planos
              </h3>
              <p className="text-xs text-teal-700">
                Clique no plano de cada operadora para alterar. Novas operadoras
                começam automaticamente no plano Grátis.
              </p>
            </div>
          </div>
        </div>}

      <Card>
        {operadoras.length === 0 ? <div className="text-center py-12">
            <BuildingIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Nenhuma operadora cadastrada</p>
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              Cadastrar Primeira Operadora
            </Button>
          </div> : <>
            <div className="mb-4 text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ⚠️ <strong>Atenção:</strong> Ao excluir uma operadora, todas as
              clínicas, usuários e dados vinculados serão excluídos
              permanentemente (exclusão em cascata).
            </div>
            <Table data={operadoras} columns={columns} />
          </>}
      </Card>

      {/* Modal de Cadastro/Edição */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={operadoraEdit ? 'Editar Operadora' : 'Nova Operadora'} footer={<>
            <Button variant="ghost" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!podeSalvar()} title={!podeSalvar() ? 'Preencha todos os campos obrigatórios e valide o CNPJ' : ''}>
            
              {operadoraEdit ? 'Salvar Alterações' : 'Cadastrar'}
            </Button>
          </>}>
        
        <form className="space-y-4">
          {/* ⭐⭐⭐ CAMPO CNPJ COM CONSULTA AUTOMÁTICA ⭐⭐⭐ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CNPJ *
            </label>
            <div className="relative">
              <input type="text" value={formData.cnpj} onChange={(e) => handleCnpjChange(e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} className={`w-full px-4 py-2.5 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors ${getCnpjStatusColor()}`} disabled={!!operadoraEdit} />
              
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getCnpjStatusIcon()}
              </div>
            </div>

            {/* Mensagem de status do CNPJ */}
            {cnpjMessage && <div className={`mt-2 p-3 rounded-lg text-sm ${cnpjStatus === 'found' ? 'bg-green-50 border border-green-200 text-green-800' : cnpjStatus === 'not_found' ? 'bg-red-50 border border-red-200 text-red-800' : cnpjStatus === 'inactive' ? 'bg-amber-50 border border-amber-200 text-amber-800' : cnpjStatus === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
              
                {cnpjStatus === 'loading' && <div className="flex items-center gap-2">
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    {cnpjMessage}
                  </div>}
                {cnpjStatus === 'found' && <div>
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircleIcon className="w-4 h-4" />
                      CNPJ válido e ativo na Receita Federal
                    </div>
                    {cnpjData && <div className="mt-2 text-xs space-y-1 text-green-700">
                        <p>
                          <strong>Razão Social:</strong> {cnpjData.razaoSocial}
                        </p>
                        {cnpjData.nomeFantasia && <p>
                            <strong>Nome Fantasia:</strong>{' '}
                            {cnpjData.nomeFantasia}
                          </p>}
                        {cnpjData.atividadePrincipal && <p>
                            <strong>Atividade:</strong>{' '}
                            {cnpjData.atividadePrincipal}
                          </p>}
                        {cnpjData.municipio && <p>
                            <strong>Localização:</strong> {cnpjData.municipio}/
                            {cnpjData.uf}
                          </p>}
                        <p className="text-green-600 italic mt-1">
                          Os campos foram preenchidos automaticamente.
                        </p>
                      </div>}
                  </div>}
                {cnpjStatus === 'not_found' && <div className="flex items-center gap-2">
                    <XCircleIcon className="w-4 h-4 flex-shrink-0" />
                    <span>{cnpjMessage}</span>
                  </div>}
                {cnpjStatus === 'inactive' && <div className="flex items-start gap-2">
                    <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{cnpjMessage}</span>
                  </div>}
                {cnpjStatus === 'error' && <div className="flex items-center gap-2">
                    <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
                    <span>{cnpjMessage}</span>
                    <button type="button" onClick={() => consultarCnpj(formData.cnpj)} className="ml-auto text-red-700 underline hover:text-red-900 text-xs">
                  
                      Tentar novamente
                    </button>
                  </div>}
              </div>}

            {!operadoraEdit && cnpjStatus === 'idle' && formData.cnpj.replace(/\D/g, '').length > 0 && formData.cnpj.replace(/\D/g, '').length < 14 && <p className="text-xs text-gray-500 mt-1">
                  Digite os 14 dígitos do CNPJ para consultar automaticamente na
                  Receita Federal
                </p>}
          </div>

          <Input label="Nome da Operadora *" value={formData.nome} onChange={(e) => setFormData({
          ...formData,
          nome: e.target.value
        })} placeholder="Nome fantasia" required />
          
          <Input label="Razão Social *" value={formData.razaoSocial} onChange={(e) => setFormData({
          ...formData,
          razaoSocial: e.target.value
        })} placeholder="Razão social completa" required />
          
          <div className="grid grid-cols-2 gap-4">
            <Input label="Telefone" value={formData.telefone} onChange={(e) => setFormData({
            ...formData,
            telefone: e.target.value
          })} placeholder="(00) 0000-0000" />
            
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({
            ...formData,
            email: e.target.value
          })} placeholder="contato@operadora.com" />
            
          </div>
          <Input label="Endereço" value={formData.endereco} onChange={(e) => setFormData({
          ...formData,
          endereco: e.target.value
        })} placeholder="Endereço completo" />
          
          {/* ⭐ Upload de Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Logo da Operadora
            </label>
            <div className="flex items-start gap-4">
              {/* Preview */}
              <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" /> : <div className="text-center">
                    <BuildingIcon className="w-8 h-8 text-gray-300 mx-auto" />
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      Sem logo
                    </span>
                  </div>}
              </div>
              {/* Botões */}
              <div className="flex flex-col gap-2">
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                
                <button type="button" onClick={() => logoInputRef.current?.click()} className="px-3 py-1.5 text-sm bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors">
                  
                  {logoPreview ? 'Trocar imagem' : 'Selecionar imagem'}
                </button>
                {logoPreview && <button type="button" onClick={handleRemoveLogo} className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  
                    Remover
                  </button>}
                <p className="text-[10px] text-gray-400">
                  PNG, JPG ou SVG. Máx 2MB.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ativa" checked={formData.ativa} onChange={(e) => setFormData({
            ...formData,
            ativa: e.target.checked
          })} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            
            <label htmlFor="ativa" className="text-sm text-gray-700">
              Operadora ativa
            </label>
          </div>

          {!operadoraEdit && <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <UsersIcon className="w-4 h-4 inline mr-1" />A operadora será
                criada com o plano <strong>Grátis</strong> por padrão.
                {isSuperAdmin && ' Você poderá alterar o plano depois.'}
              </p>
            </div>}

          {/* ⭐ Aviso quando CNPJ não validado */}
          {!operadoraEdit && cnpjStatus !== 'found' && cnpjStatus !== 'idle' && <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  <XCircleIcon className="w-4 h-4 inline mr-1" />O cadastro só
                  será permitido com um CNPJ válido e ativo na Receita Federal.
                </p>
              </div>}
        </form>
      </Modal>

      {/* Modal de Alteração de Plano */}
      <Modal isOpen={isPlanoModalOpen} onClose={() => {
      setIsPlanoModalOpen(false);
      setOperadoraPlano(null);
    }} title="Alterar Plano da Operadora" size="medium" footer={<>
            <Button variant="ghost" onClick={() => {
        setIsPlanoModalOpen(false);
        setOperadoraPlano(null);
      }}>
            
              Cancelar
            </Button>
            <Button onClick={handleSalvarPlano} disabled={salvandoPlano}>
              {salvandoPlano ? 'Salvando...' : 'Salvar Plano'}
            </Button>
          </>}>
        
        <div className="space-y-4">
          {operadoraPlano && <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Operadora: <strong>{operadoraPlano.nome}</strong>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Plano atual:{' '}
                {getPlanoInfo(operadoraPlano.planoId)?.nome || 'Grátis'}
              </p>
            </div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecione o Plano
            </label>
            {loadingPlanos ? <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto"></div>
              </div> : <div className="space-y-2">
                {planos.map((plano) => <label key={plano.id} className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all ${planoSelecionado === plano.id ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500' : 'border-gray-200 hover:border-gray-300'}`}>
                
                    <input type="radio" name="plano" value={plano.id} checked={planoSelecionado === plano.id} onChange={(e) => setPlanoSelecionado(e.target.value)} className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500" />
                
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getPlanoIcon(plano.id)}
                        <span className="font-medium text-gray-900">
                          {plano.nome}
                        </span>
                        {plano.destaque && <Badge variant="info">Popular</Badge>}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {plano.preco === 0 ? 'Grátis' : `R$ ${plano.preco}/mês`}
                        {' • '}
                        {plano.limitePacientes ? `Até ${plano.limitePacientes} pacientes` : 'Pacientes ilimitados'}
                      </p>
                    </div>
                  </label>)}
              </div>}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              ⚠️ <strong>Atenção:</strong> A alteração do plano afetará todas as
              clínicas vinculadas a esta operadora.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmação de Exclusão em Cascata */}
      {operadoraToDelete && <Modal isOpen={true} onClose={() => setOperadoraToDelete(null)} title="⚠️ Excluir Operadora em Cascata" size="medium" footer={<>
              <Button variant="ghost" onClick={() => setOperadoraToDelete(null)}>
            
                Cancelar
              </Button>
              <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
            
                <Trash2Icon className="w-4 h-4 mr-2" />
                Confirmar Exclusão
              </Button>
            </>}>
        
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-800">
                  Atenção! Esta ação é irreversível.
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  Ao excluir a operadora{' '}
                  <strong>"{operadoraToDelete.nome}"</strong>, os seguintes
                  dados serão excluídos permanentemente:
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todas as <strong>clínicas</strong> vinculadas a esta operadora
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>usuários</strong> (médicos, secretárias, etc.)
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>pacientes</strong> e seus prontuários
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todas as <strong>consultas</strong> e agendamentos
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>dados financeiros</strong> (parcelas,
                contratos)
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>documentos</strong> e arquivos
              </p>
            </div>

            <p className="text-sm text-gray-600 text-center">
              Tem certeza que deseja continuar?
            </p>
          </div>
        </Modal>}
    </div>;
}