import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Input';
import { DialogContainer } from '../components/DialogContainer';
import { useConvenios } from '../hooks/useConvenios';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { Convenio, PlanoSaude } from '../types';
import {
  PlusIcon,
  SearchIcon,
  HeartPulseIcon,
  CheckCircleIcon,
  XCircleIcon,
  UsersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ShieldCheckIcon,
  TrashIcon,
  PencilIcon,
  SaveIcon,
  XIcon,
  BuildingIcon,
  MapPinIcon,
  LandmarkIcon,
  CalendarIcon,
  FileTextIcon } from
'lucide-react';
const ITEMS_PER_PAGE_OPTIONS = [
{
  value: '10',
  label: '10 por página'
},
{
  value: '25',
  label: '25 por página'
},
{
  value: '50',
  label: '50 por página'
}];

const UF_OPTIONS = [
{
  value: '',
  label: 'Selecione...'
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
}];

type FormTab = 'dados' | 'endereco' | 'bancario' | 'observacoes';
export function ConveniosPage() {
  const [clinicaId, setClinicaId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [convenioEdit, setConvenioEdit] = useState<Convenio | null>(null);
  const [novoPlanoNome, setNovoPlanoNome] = useState('');
  const [planoEditandoId, setPlanoEditandoId] = useState<string | null>(null);
  const [planoEditandoNome, setPlanoEditandoNome] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activeTab, setActiveTab] = useState<FormTab>('dados');
  const [isPlanosModalOpen, setIsPlanosModalOpen] = useState(false);
  const [planosConvenio, setPlanosConvenio] = useState<Convenio | null>(null);
  const [novoPlanoNomeInline, setNovoPlanoNomeInline] = useState('');
  const [planoEditandoIdInline, setPlanoEditandoIdInline] = useState<
    string | null>(
    null);
  const [planoEditandoNomeInline, setPlanoEditandoNomeInline] = useState('');
  const [formData, setFormData] = useState({
    nome: '',
    razaoSocial: '',
    cnpj: '',
    registroAns: '',
    telefone: '',
    email: '',
    site: '',
    contato: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    cep: '',
    banco: '',
    agencia: '',
    conta: '',
    diaCobranca: '',
    diaPagamento: '',
    validadeGuia: '',
    observacoes: '',
    ativo: true
  });
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      setClinicaId(parsed.clinicaAtual?.id || '');
    }
  }, []);
  const {
    convenios,
    loading,
    criar,
    atualizar,
    deletar,
    criarPlano,
    atualizarPlano,
    deletarPlano
  } = useConvenios(clinicaId);
  const { success, error: showError } = useToast();
  const { dialogs, removeDialog, confirm } = useDialog();
  const conveniosFiltrados = useMemo(() => {
    return convenios.filter(
      (c) =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.registroAns?.toLowerCase().includes(search.toLowerCase()) ||
      c.cnpj?.toLowerCase().includes(search.toLowerCase()) ||
      c.razaoSocial?.toLowerCase().includes(search.toLowerCase())
    );
  }, [convenios, search]);
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);
  const totalPages = Math.ceil(conveniosFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const conveniosPaginados = conveniosFiltrados.slice(startIndex, endIndex);
  const goToFirstPage = () => setCurrentPage(1);
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () =>
  setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToLastPage = () => setCurrentPage(totalPages);
  const handleItemsPerPageChange = (
  e: React.ChangeEvent<HTMLSelectElement>) =>
  {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };
  const totalAtivos = convenios.filter((c) => c.ativo).length;
  const totalInativos = convenios.filter((c) => !c.ativo).length;
  const totalPlanos = convenios.reduce(
    (acc, c) => acc + (c.planos?.length || 0),
    0
  );
  const resetForm = () => {
    setFormData({
      nome: '',
      razaoSocial: '',
      cnpj: '',
      registroAns: '',
      telefone: '',
      email: '',
      site: '',
      contato: '',
      endereco: '',
      numero: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      banco: '',
      agencia: '',
      conta: '',
      diaCobranca: '',
      diaPagamento: '',
      validadeGuia: '',
      observacoes: '',
      ativo: true
    });
    setActiveTab('dados');
    setNovoPlanoNome('');
    setPlanoEditandoId(null);
    setPlanoEditandoNome('');
  };
  const handleNovoConvenio = () => {
    setConvenioEdit(null);
    resetForm();
    setIsModalOpen(true);
  };
  const handleEditarConvenio = (convenio: Convenio) => {
    setConvenioEdit(convenio);
    setFormData({
      nome: convenio.nome || '',
      razaoSocial: convenio.razaoSocial || '',
      cnpj: convenio.cnpj || '',
      registroAns: convenio.registroAns || '',
      telefone: convenio.telefone || '',
      email: convenio.email || '',
      site: convenio.site || '',
      contato: convenio.contato || '',
      endereco: convenio.endereco || '',
      numero: convenio.numero || '',
      bairro: convenio.bairro || '',
      cidade: convenio.cidade || '',
      uf: convenio.uf || '',
      cep: convenio.cep || '',
      banco: convenio.banco || '',
      agencia: convenio.agencia || '',
      conta: convenio.conta || '',
      diaCobranca: convenio.diaCobranca?.toString() || '',
      diaPagamento: convenio.diaPagamento?.toString() || '',
      validadeGuia: convenio.validadeGuia?.toString() || '',
      observacoes: convenio.observacoes || '',
      ativo: convenio.ativo
    });
    setActiveTab('dados');
    setNovoPlanoNome('');
    setPlanoEditandoId(null);
    setPlanoEditandoNome('');
    setIsModalOpen(true);
  };
  const handleSaveConvenio = async () => {
    if (!formData.nome.trim()) {
      showError('Erro', 'O nome do convênio é obrigatório');
      return;
    }
    try {
      const payload = {
        ...formData,
        diaCobranca: formData.diaCobranca ?
        parseInt(formData.diaCobranca) :
        null,
        diaPagamento: formData.diaPagamento ?
        parseInt(formData.diaPagamento) :
        null,
        validadeGuia: formData.validadeGuia ?
        parseInt(formData.validadeGuia) :
        null
      };
      if (convenioEdit) {
        await atualizar(convenioEdit.id, payload);
        success('Convênio Atualizado', 'Dados atualizados com sucesso!');
      } else {
        await criar(payload);
        success('Convênio Criado', 'Convênio cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      setConvenioEdit(null);
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleDeletarConvenio = async (convenio: Convenio) => {
    const planosCount = convenio.planos?.length || 0;
    const mensagem =
    planosCount > 0 ?
    `Este convênio possui ${planosCount} plano(s) vinculado(s). Eles também serão excluídos. Deseja continuar?` :
    `Tem certeza que deseja excluir o convênio "${convenio.nome}"?`;
    const shouldDelete = await confirm(
      'Confirmar Exclusão',
      mensagem,
      'Excluir',
      'Cancelar'
    );
    if (shouldDelete) {
      try {
        await deletar(convenio.id);
        success('Convênio Excluído', 'Convênio removido com sucesso!');
      } catch (err: any) {
        showError('Erro', err.message);
      }
    }
  };
  const handleAddPlano = async () => {
    if (!convenioEdit || !novoPlanoNome.trim()) return;
    try {
      const novoPlano = await criarPlano(convenioEdit.id, {
        nome: novoPlanoNome.trim(),
        ativo: true,
        tipo: 'individual'
      });
      setConvenioEdit((prev) =>
      prev ?
      {
        ...prev,
        planos: [...(prev.planos || []), novoPlano]
      } :
      null
      );
      success('Plano Adicionado', 'Novo plano vinculado ao convênio.');
      setNovoPlanoNome('');
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleEditPlano = (plano: PlanoSaude) => {
    setPlanoEditandoId(plano.id);
    setPlanoEditandoNome(plano.nome);
  };
  const handleSavePlanoEdit = async () => {
    if (!convenioEdit || !planoEditandoId || !planoEditandoNome.trim()) return;
    try {
      await atualizarPlano(convenioEdit.id, planoEditandoId, {
        nome: planoEditandoNome.trim()
      });
      setConvenioEdit((prev) =>
      prev ?
      {
        ...prev,
        planos: (prev.planos || []).map((p) =>
        p.id === planoEditandoId ?
        {
          ...p,
          nome: planoEditandoNome.trim()
        } :
        p
        )
      } :
      null
      );
      success('Plano Atualizado', 'Nome do plano alterado com sucesso.');
      setPlanoEditandoId(null);
      setPlanoEditandoNome('');
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleCancelPlanoEdit = () => {
    setPlanoEditandoId(null);
    setPlanoEditandoNome('');
  };
  const handleRemovePlano = async (planoId: string) => {
    if (!convenioEdit) return;
    const shouldDelete = await confirm(
      'Remover Plano',
      'Tem certeza que deseja remover este plano do convênio?',
      'Remover',
      'Cancelar'
    );
    if (shouldDelete) {
      try {
        await deletarPlano(convenioEdit.id, planoId);
        setConvenioEdit((prev) =>
        prev ?
        {
          ...prev,
          planos: (prev.planos || []).filter((p) => p.id !== planoId)
        } :
        null
        );
        success('Plano Removido', 'Plano removido com sucesso.');
      } catch (err: any) {
        showError('Erro', err.message);
      }
    }
  };
  // === Handlers para modal de planos inline (sem sair da tela) ===
  const handleOpenPlanosModal = (convenio: Convenio) => {
    setPlanosConvenio(convenio);
    setNovoPlanoNomeInline('');
    setPlanoEditandoIdInline(null);
    setPlanoEditandoNomeInline('');
    setIsPlanosModalOpen(true);
  };
  const handleAddPlanoInline = async () => {
    if (!planosConvenio || !novoPlanoNomeInline.trim()) return;
    try {
      const novoPlano = await criarPlano(planosConvenio.id, {
        nome: novoPlanoNomeInline.trim(),
        ativo: true,
        tipo: 'individual'
      });
      setPlanosConvenio((prev) =>
      prev ?
      {
        ...prev,
        planos: [...(prev.planos || []), novoPlano]
      } :
      null
      );
      success('Plano Adicionado', 'Novo plano vinculado ao convênio.');
      setNovoPlanoNomeInline('');
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleEditPlanoInline = (plano: PlanoSaude) => {
    setPlanoEditandoIdInline(plano.id);
    setPlanoEditandoNomeInline(plano.nome);
  };
  const handleSavePlanoEditInline = async () => {
    if (
    !planosConvenio ||
    !planoEditandoIdInline ||
    !planoEditandoNomeInline.trim())

    return;
    try {
      await atualizarPlano(planosConvenio.id, planoEditandoIdInline, {
        nome: planoEditandoNomeInline.trim()
      });
      setPlanosConvenio((prev) =>
      prev ?
      {
        ...prev,
        planos: (prev.planos || []).map((p) =>
        p.id === planoEditandoIdInline ?
        {
          ...p,
          nome: planoEditandoNomeInline.trim()
        } :
        p
        )
      } :
      null
      );
      success('Plano Atualizado', 'Nome do plano alterado com sucesso.');
      setPlanoEditandoIdInline(null);
      setPlanoEditandoNomeInline('');
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleRemovePlanoInline = async (planoId: string) => {
    if (!planosConvenio) return;
    const plano = planosConvenio.planos?.find((p) => p.id === planoId);
    const confirmed = await confirm(
      'Remover Plano',
      'Tem certeza que deseja remover o plano "' + (plano?.nome || '') + '"?',
      'Remover',
      'Cancelar'
    );
    if (!confirmed) return;
    try {
      await deletarPlano(planosConvenio.id, planoId);
      setPlanosConvenio((prev) =>
      prev ?
      {
        ...prev,
        planos: (prev.planos || []).filter((p) => p.id !== planoId)
      } :
      null
      );
      success('Plano Removido', 'Plano removido com sucesso.');
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };
  const columns = [
  {
    key: 'nome',
    label: 'Convênio',
    render: (c: Convenio) =>
    <div>
          <p className="font-medium text-gray-900">{c.nome}</p>
          {c.razaoSocial &&
      <p className="text-xs text-gray-500">{c.razaoSocial}</p>
      }
          {c.registroAns &&
      <p className="text-xs text-gray-400">ANS: {c.registroAns}</p>
      }
        </div>

  },
  {
    key: 'cnpj',
    label: 'CNPJ',
    render: (c: Convenio) =>
    <span className="text-gray-600 text-sm">{c.cnpj || '-'}</span>

  },
  {
    key: 'telefone',
    label: 'Telefone',
    render: (c: Convenio) =>
    <span className="text-gray-600">{c.telefone || '-'}</span>

  },
  {
    key: 'planos',
    label: 'Planos',
    render: (c: Convenio) =>
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleOpenPlanosModal(c);
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
      title="Gerenciar planos deste convênio">
      
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          {c.planos?.length || 0} planos
          <PlusIcon className="w-3.5 h-3.5 text-purple-400" />
        </button>

  },
  {
    key: 'ativo',
    label: 'Status',
    render: (c: Convenio) =>
    <Badge variant={c.ativo ? 'success' : 'secondary'}>
          {c.ativo ? 'Ativo' : 'Inativo'}
        </Badge>

  }];

  const tabs: {
    id: FormTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
  {
    id: 'dados',
    label: 'Dados',
    icon: <BuildingIcon className="w-4 h-4" />
  },
  {
    id: 'endereco',
    label: 'Endereço',
    icon: <MapPinIcon className="w-4 h-4" />
  },
  {
    id: 'bancario',
    label: 'Bancário',
    icon: <LandmarkIcon className="w-4 h-4" />
  },
  {
    id: 'observacoes',
    label: 'Obs.',
    icon: <FileTextIcon className="w-4 h-4" />
  }];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Convênios</h1>
          <p className="text-gray-500 mt-1">
            Gerencie os convênios e seus respectivos planos de saúde
          </p>
        </div>
        <Button onClick={handleNovoConvenio}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Novo Convênio
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <HeartPulseIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {convenios.length}
              </p>
              <p className="text-xs text-gray-500">Total de Convênios</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalAtivos}</p>
              <p className="text-xs text-gray-500">Convênios Ativos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <XCircleIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalInativos}
              </p>
              <p className="text-xs text-gray-500">Convênios Inativos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <ShieldCheckIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalPlanos}</p>
              <p className="text-xs text-gray-500">Total de Planos</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <div className="p-4 border-b border-gray-200">
          <Input
            placeholder="Buscar por nome, razão social, CNPJ ou registro ANS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)} />
          
        </div>

        {loading ?
        <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <p className="text-gray-600 mt-2">Carregando convênios...</p>
          </div> :
        conveniosFiltrados.length === 0 ?
        <div className="text-center py-12">
            <HeartPulseIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {search ?
            'Nenhum convênio encontrado com esse termo de busca.' :
            'Nenhum convênio cadastrado ainda.'}
            </p>
            {!search &&
          <Button onClick={handleNovoConvenio}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Convênio
              </Button>
          }
          </div> :

        <>
            <Table
            columns={columns}
            data={conveniosPaginados}
            onEdit={handleEditarConvenio}
            onDelete={handleDeletarConvenio}
            onRowDoubleClick={handleEditarConvenio} />
          

            {conveniosFiltrados.length > 0 &&
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      Mostrando {startIndex + 1} a{' '}
                      {Math.min(endIndex, conveniosFiltrados.length)} de{' '}
                      <strong>{conveniosFiltrados.length}</strong> convênios
                    </span>
                    <Select
                  options={ITEMS_PER_PAGE_OPTIONS}
                  value={String(itemsPerPage)}
                  onChange={handleItemsPerPageChange}
                  className="w-36" />
                
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                  onClick={goToFirstPage}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronsLeftIcon className="w-4 h-4" />
                    </button>
                    <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1 mx-2">
                      {Array.from(
                    {
                      length: Math.min(5, totalPages)
                    },
                    (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) pageNum = i + 1;else
                      if (currentPage <= 3) pageNum = i + 1;else
                      if (currentPage >= totalPages - 2)
                      pageNum = totalPages - 4 + i;else
                      pageNum = currentPage - 2 + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum ? 'bg-teal-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`}>
                          
                              {pageNum}
                            </button>);

                    }
                  )}
                    </div>
                    <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                    <button
                  onClick={goToLastPage}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronsRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
          }
          </>
        }
      </Card>

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setConvenioEdit(null);
        }}
        title={convenioEdit ? 'Editar Convênio' : 'Novo Convênio'}
        footer={
        <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConvenio}>
              {convenioEdit ? 'Salvar Alterações' : 'Cadastrar'}
            </Button>
          </>
        }
        size="large">
        
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Coluna Esquerda: Dados do Convênio (3/5) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Tabs de navegação */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {tabs.map((tab) =>
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${activeTab === tab.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                
                  {tab.icon}
                  {tab.label}
                </button>
              )}
            </div>

            {/* Tab: Dados Principais */}
            {activeTab === 'dados' &&
            <div className="space-y-4">
                <Input
                label="Nome Fantasia *"
                value={formData.nome}
                onChange={(e) => updateField('nome', e.target.value)}
                placeholder="Ex: Amil, Bradesco Saúde..." />
              

                <Input
                label="Razão Social"
                value={formData.razaoSocial}
                onChange={(e) => updateField('razaoSocial', e.target.value)}
                placeholder="Razão social completa" />
              

                <div className="grid grid-cols-2 gap-4">
                  <Input
                  label="CNPJ"
                  value={formData.cnpj}
                  onChange={(e) => updateField('cnpj', e.target.value)}
                  placeholder="00.000.000/0000-00" />
                

                  <Input
                  label="Registro ANS"
                  value={formData.registroAns}
                  onChange={(e) => updateField('registroAns', e.target.value)}
                  placeholder="Nº registro ANS" />
                
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                  label="Telefone"
                  value={formData.telefone}
                  onChange={(e) => updateField('telefone', e.target.value)}
                  placeholder="(00) 0000-0000" />
                

                  <Input
                  label="Contato"
                  value={formData.contato}
                  onChange={(e) => updateField('contato', e.target.value)}
                  placeholder="Nome do contato" />
                
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="contato@convenio.com.br" />
                

                  <Input
                  label="Site"
                  value={formData.site}
                  onChange={(e) => updateField('site', e.target.value)}
                  placeholder="https://www.convenio.com.br" />
                
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input
                  type="checkbox"
                  id="convenio-ativo"
                  checked={formData.ativo}
                  onChange={(e) => updateField('ativo', e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
                

                  <label
                  htmlFor="convenio-ativo"
                  className="text-sm text-gray-700">
                  
                    Convênio ativo (aceita novos pacientes)
                  </label>
                </div>
              </div>
            }

            {/* Tab: Endereço */}
            {activeTab === 'endereco' &&
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <MapPinIcon className="w-5 h-5 text-blue-600" />
                  <p className="text-sm font-medium text-blue-900">
                    Endereço do Convênio
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                  label="CEP"
                  value={formData.cep}
                  onChange={(e) => updateField('cep', e.target.value)}
                  placeholder="00000-000" />
                

                  <div className="col-span-2">
                    <Input
                    label="Endereço"
                    value={formData.endereco}
                    onChange={(e) => updateField('endereco', e.target.value)}
                    placeholder="Rua, Avenida..." />
                  
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                  label="Número"
                  value={formData.numero}
                  onChange={(e) => updateField('numero', e.target.value)}
                  placeholder="Nº" />
                

                  <div className="col-span-2">
                    <Input
                    label="Bairro"
                    value={formData.bairro}
                    onChange={(e) => updateField('bairro', e.target.value)}
                    placeholder="Bairro" />
                  
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Input
                    label="Cidade"
                    value={formData.cidade}
                    onChange={(e) => updateField('cidade', e.target.value)}
                    placeholder="Cidade" />
                  
                  </div>
                  <Select
                  label="UF"
                  options={UF_OPTIONS}
                  value={formData.uf}
                  onChange={(e) => updateField('uf', e.target.value)} />
                
                </div>
              </div>
            }

            {/* Tab: Dados Bancários e Cobrança */}
            {activeTab === 'bancario' &&
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                  <LandmarkIcon className="w-5 h-5 text-amber-600" />
                  <p className="text-sm font-medium text-amber-900">
                    Dados Bancários
                  </p>
                </div>
                <Input
                label="Banco"
                value={formData.banco}
                onChange={(e) => updateField('banco', e.target.value)}
                placeholder="Nome ou código do banco" />
              

                <div className="grid grid-cols-2 gap-4">
                  <Input
                  label="Agência"
                  value={formData.agencia}
                  onChange={(e) => updateField('agencia', e.target.value)}
                  placeholder="Nº da agência" />
                

                  <Input
                  label="Conta"
                  value={formData.conta}
                  onChange={(e) => updateField('conta', e.target.value)}
                  placeholder="Nº da conta" />
                
                </div>

                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg mt-6">
                  <CalendarIcon className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-medium text-green-900">
                    Datas e Prazos
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                  label="Dia Cobrança"
                  type="number"
                  value={formData.diaCobranca}
                  onChange={(e) => updateField('diaCobranca', e.target.value)}
                  placeholder="1-31" />
                

                  <Input
                  label="Dia Pagamento"
                  type="number"
                  value={formData.diaPagamento}
                  onChange={(e) =>
                  updateField('diaPagamento', e.target.value)
                  }
                  placeholder="1-31" />
                

                  <Input
                  label="Validade Guia (dias)"
                  type="number"
                  value={formData.validadeGuia}
                  onChange={(e) =>
                  updateField('validadeGuia', e.target.value)
                  }
                  placeholder="Ex: 30" />
                
                </div>
              </div>
            }

            {/* Tab: Observações */}
            {activeTab === 'observacoes' &&
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <FileTextIcon className="w-5 h-5 text-gray-600" />
                  <p className="text-sm font-medium text-gray-900">
                    Observações
                  </p>
                </div>
                <Textarea
                label="Observações"
                value={formData.observacoes}
                onChange={(e) => updateField('observacoes', e.target.value)}
                placeholder="Observações adicionais sobre o convênio..."
                rows={8} />
              
              </div>
            }
          </div>

          {/* Coluna Direita: Planos do Convênio (2/5) */}
          <div className="lg:col-span-2 space-y-4 lg:border-l lg:border-gray-200 lg:pl-6">
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <HeartPulseIcon className="w-6 h-6 text-purple-600" />
              <div>
                <p className="font-medium text-purple-900">Planos Vinculados</p>
                <p className="text-sm text-purple-700">
                  Gerencie os planos deste convênio
                </p>
              </div>
            </div>

            {!convenioEdit ?
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-gray-500 text-sm">
                  Salve o convênio primeiro para adicionar planos.
                </p>
              </div> :

            <>
                <div className="flex gap-2">
                  <Input
                  value={novoPlanoNome}
                  onChange={(e) => setNovoPlanoNome(e.target.value)}
                  placeholder="Nome do novo plano"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novoPlanoNome.trim()) {
                      e.preventDefault();
                      handleAddPlano();
                    }
                  }} />
                

                  <Button
                  onClick={handleAddPlano}
                  disabled={!novoPlanoNome.trim()}
                  className="mt-6">
                  
                    <PlusIcon className="w-4 h-4" />
                  </Button>
                </div>

                <div className="mt-2 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {!convenioEdit.planos || convenioEdit.planos.length === 0 ?
                <p className="text-sm text-gray-500 text-center py-4">
                      Nenhum plano cadastrado.
                    </p> :

                convenioEdit.planos.map((plano) =>
                <div
                  key={plano.id}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  
                        {planoEditandoId === plano.id ?
                  <div className="flex items-center gap-2 flex-1 mr-2">
                            <input
                      type="text"
                      value={planoEditandoNome}
                      onChange={(e) =>
                      setPlanoEditandoNome(e.target.value)
                      }
                      className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSavePlanoEdit();
                        }
                        if (e.key === 'Escape') handleCancelPlanoEdit();
                      }}
                      autoFocus />
                    

                            <button
                      onClick={handleSavePlanoEdit}
                      disabled={!planoEditandoNome.trim()}
                      className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors disabled:opacity-50"
                      title="Salvar">
                      
                              <SaveIcon className="w-4 h-4" />
                            </button>
                            <button
                      onClick={handleCancelPlanoEdit}
                      className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-50 transition-colors"
                      title="Cancelar">
                      
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div> :

                  <>
                            <span className="font-medium text-gray-700">
                              {plano.nome}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                        onClick={() => handleEditPlano(plano)}
                        className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                        title="Editar plano">
                        
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                        onClick={() => handleRemovePlano(plano.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                        title="Remover plano">
                        
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                  }
                      </div>
                )
                }
                </div>
              </>
            }
          </div>
        </div>
      </Modal>

      {/* Modal de Planos Inline */}
      <Modal
        isOpen={isPlanosModalOpen}
        onClose={() => setIsPlanosModalOpen(false)}
        title={planosConvenio ? 'Planos — ' + planosConvenio.nome : 'Planos'}
        size="md"
        footer={
        <Button variant="ghost" onClick={() => setIsPlanosModalOpen(false)}>
            Fechar
          </Button>
        }>
        
        {planosConvenio &&
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <HeartPulseIcon className="w-5 h-5 text-purple-600" />
              <div>
                <p className="font-medium text-purple-900">Planos Vinculados</p>
                <p className="text-xs text-purple-600">
                  {planosConvenio.planos?.length || 0} plano(s) cadastrado(s)
                </p>
              </div>
            </div>

            {/* Adicionar novo plano */}
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                type="text"
                value={novoPlanoNomeInline}
                onChange={(e) => setNovoPlanoNomeInline(e.target.value)}
                placeholder="Nome do novo plano..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && novoPlanoNomeInline.trim()) {
                    e.preventDefault();
                    handleAddPlanoInline();
                  }
                }} />
              
              </div>
              <Button
              onClick={handleAddPlanoInline}
              disabled={!novoPlanoNomeInline.trim()}>
              
                <PlusIcon className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>

            {/* Lista de planos */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {!planosConvenio.planos || planosConvenio.planos.length === 0 ?
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <ShieldCheckIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Nenhum plano cadastrado.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Digite o nome acima e clique em Adicionar.
                  </p>
                </div> :

            planosConvenio.planos.map((plano) =>
            <div
              key={plano.id}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-purple-200 transition-colors">
              
                    {planoEditandoIdInline === plano.id ?
              <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                  type="text"
                  value={planoEditandoNomeInline}
                  onChange={(e) =>
                  setPlanoEditandoNomeInline(e.target.value)
                  }
                  className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSavePlanoEditInline();
                    }
                    if (e.key === 'Escape') {
                      setPlanoEditandoIdInline(null);
                      setPlanoEditandoNomeInline('');
                    }
                  }}
                  autoFocus />
                

                        <button
                  onClick={handleSavePlanoEditInline}
                  disabled={!planoEditandoNomeInline.trim()}
                  className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors disabled:opacity-50"
                  title="Salvar">
                  
                          <SaveIcon className="w-4 h-4" />
                        </button>
                        <button
                  onClick={() => {
                    setPlanoEditandoIdInline(null);
                    setPlanoEditandoNomeInline('');
                  }}
                  className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-50 transition-colors"
                  title="Cancelar">
                  
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div> :

              <>
                        <div className="flex items-center gap-2">
                          <ShieldCheckIcon className="w-4 h-4 text-purple-400" />
                          <span className="font-medium text-gray-700">
                            {plano.nome}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                    onClick={() => handleEditPlanoInline(plano)}
                    className="text-blue-500 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50 transition-colors"
                    title="Editar plano">
                    
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                    onClick={() => handleRemovePlanoInline(plano.id)}
                    className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                    title="Remover plano">
                    
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </>
              }
                  </div>
            )
            }
            </div>
          </div>
        }
      </Modal>

      <DialogContainer dialogs={dialogs} onClose={removeDialog} />
    </div>);

}