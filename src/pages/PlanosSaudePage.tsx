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
import { usePlanosSaude } from '../hooks/usePlanosSaude';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { PlanoSaude } from '../types';
import { PlusIcon, SearchIcon, HeartPulseIcon, CheckCircleIcon, XCircleIcon, UsersIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, ShieldCheckIcon } from 'lucide-react';
const ITEMS_PER_PAGE_OPTIONS = [{
  value: '10',
  label: '10 por página'
}, {
  value: '25',
  label: '25 por página'
}, {
  value: '50',
  label: '50 por página'
}];
const TIPOS_PLANO = [{
  value: 'individual',
  label: 'Individual'
}, {
  value: 'familiar',
  label: 'Familiar'
}, {
  value: 'empresarial',
  label: 'Empresarial'
}, {
  value: 'coletivo',
  label: 'Coletivo por Adesão'
}];
export function PlanosSaudePage() {
  const [clinicaId, setClinicaId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [planoEdit, setPlanoEdit] = useState<PlanoSaude | null>(null);
  const [pacientesPorPlano, setPacientesPorPlano] = useState<Record<string, number>>({});
  // Estados de paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Estado do formulário
  const [formData, setFormData] = useState({
    nome: '',
    registroAns: '',
    tipo: 'individual' as PlanoSaude['tipo'],
    cobertura: '',
    telefone: '',
    email: '',
    site: '',
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
    planos,
    loading,
    criar,
    atualizar,
    deletar,
    buscarPacientes
  } = usePlanosSaude(clinicaId);
  const {
    success,
    error: showError
  } = useToast();
  const {
    dialogs,
    removeDialog,
    confirm
  } = useDialog();
  // Carrega contagem de pacientes por plano
  useEffect(() => {
    const carregarPacientes = async () => {
      if (!clinicaId || planos.length === 0) return;
      const contagens: Record<string, number> = {};
      for (const plano of planos) {
        try {
          const pacientes = await buscarPacientes(plano.id);
          contagens[plano.id] = pacientes.length;
        } catch {
          contagens[plano.id] = 0;
        }
      }
      setPacientesPorPlano(contagens);
    };
    carregarPacientes();
  }, [planos, clinicaId]);
  // Filtra planos
  const planosFiltrados = useMemo(() => {
    return planos.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()) || p.registroAns?.toLowerCase().includes(search.toLowerCase()) || p.tipo?.toLowerCase().includes(search.toLowerCase()));
  }, [planos, search]);
  // Reset página quando busca muda
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);
  // Calcula paginação
  const totalPages = Math.ceil(planosFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const planosPaginados = planosFiltrados.slice(startIndex, endIndex);
  // Funções de navegação
  const goToFirstPage = () => setCurrentPage(1);
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToLastPage = () => setCurrentPage(totalPages);
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };
  const totalAtivos = planos.filter((p) => p.ativo).length;
  const totalInativos = planos.filter((p) => !p.ativo).length;
  const totalPacientes = Object.values(pacientesPorPlano).reduce((acc, val) => acc + val, 0);
  const handleNovoPlano = () => {
    setPlanoEdit(null);
    setFormData({
      nome: '',
      registroAns: '',
      tipo: 'individual',
      cobertura: '',
      telefone: '',
      email: '',
      site: '',
      observacoes: '',
      ativo: true
    });
    setIsModalOpen(true);
  };
  const handleEditarPlano = (plano: PlanoSaude) => {
    setPlanoEdit(plano);
    setFormData({
      nome: plano.nome || '',
      registroAns: plano.registroAns || '',
      tipo: plano.tipo || 'individual',
      cobertura: plano.cobertura || '',
      telefone: plano.telefone || '',
      email: plano.email || '',
      site: plano.site || '',
      observacoes: plano.observacoes || '',
      ativo: plano.ativo
    });
    setIsModalOpen(true);
  };
  const handleSavePlano = async () => {
    if (!formData.nome.trim()) {
      showError('Erro', 'O nome do plano é obrigatório');
      return;
    }
    try {
      if (planoEdit) {
        await atualizar(planoEdit.id, formData);
        success('Plano Atualizado', 'Dados atualizados com sucesso!');
      } else {
        await criar(formData);
        success('Plano Criado', 'Plano de saúde cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      setPlanoEdit(null);
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleDeletarPlano = async (plano: PlanoSaude) => {
    const pacientes = pacientesPorPlano[plano.id] || 0;
    const mensagem = pacientes > 0 ? `Este plano possui ${pacientes} paciente(s) vinculado(s). Eles serão desvinculados. Deseja continuar?` : `Tem certeza que deseja excluir o plano "${plano.nome}"?`;
    const shouldDelete = await confirm('Confirmar Exclusão', mensagem, 'Excluir', 'Cancelar');
    if (shouldDelete) {
      try {
        await deletar(plano.id);
        success('Plano Excluído', 'Plano de saúde removido com sucesso!');
      } catch (err: any) {
        showError('Erro', err.message);
      }
    }
  };
  const getTipoLabel = (tipo: string) => {
    const found = TIPOS_PLANO.find((t) => t.value === tipo);
    return found?.label || tipo;
  };
  const columns = [{
    key: 'nome',
    label: 'Plano',
    render: (p: PlanoSaude) => <div>
          <p className="font-medium text-gray-900">{p.nome}</p>
          {p.registroAns && <p className="text-xs text-gray-500">ANS: {p.registroAns}</p>}
        </div>
  }, {
    key: 'tipo',
    label: 'Tipo',
    render: (p: PlanoSaude) => <span className="text-gray-600">{getTipoLabel(p.tipo)}</span>
  }, {
    key: 'telefone',
    label: 'Telefone',
    render: (p: PlanoSaude) => <span className="text-gray-600">{p.telefone || '-'}</span>
  }, {
    key: 'email',
    label: 'Email',
    render: (p: PlanoSaude) => <span className="text-gray-600 text-sm">{p.email || '-'}</span>
  }, {
    key: 'ativo',
    label: 'Status',
    render: (p: PlanoSaude) => <Badge variant={p.ativo ? 'success' : 'secondary'}>
          {p.ativo ? 'Ativo' : 'Inativo'}
        </Badge>
  }, {
    key: 'pacientes',
    label: 'Pacientes',
    render: (p: PlanoSaude) => <div className="flex items-center gap-1">
          <UsersIcon className="w-4 h-4 text-gray-400" />
          <span className="text-gray-600">{pacientesPorPlano[p.id] ?? 0}</span>
        </div>
  }];
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Planos de Saúde</h1>
          <p className="text-gray-500 mt-1">
            Gerencie os convênios e planos de saúde aceitos
          </p>
        </div>
        <Button onClick={handleNovoPlano}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Novo Plano
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
                {planos.length}
              </p>
              <p className="text-xs text-gray-500">Total de Planos</p>
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
              <p className="text-xs text-gray-500">Planos Ativos</p>
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
              <p className="text-xs text-gray-500">Planos Inativos</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <UsersIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalPacientes}
              </p>
              <p className="text-xs text-gray-500">Pacientes Vinculados</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <div className="p-4 border-b border-gray-200">
          <Input placeholder="Buscar por nome, registro ANS ou tipo..." value={search} onChange={(e) => setSearch(e.target.value)} />
          
        </div>

        {loading ? <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <p className="text-gray-600 mt-2">Carregando planos...</p>
          </div> : planosFiltrados.length === 0 ? <div className="text-center py-12">
            <HeartPulseIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {search ? 'Nenhum plano encontrado com esse termo de busca.' : 'Nenhum plano de saúde cadastrado ainda.'}
            </p>
            {!search && <Button onClick={handleNovoPlano}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Plano
              </Button>}
          </div> : <>
            <Table columns={columns} data={planosPaginados} onEdit={handleEditarPlano} onDelete={handleDeletarPlano} onRowDoubleClick={handleEditarPlano} />
          

            {/* Paginação */}
            {planosFiltrados.length > 0 && <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      Mostrando {startIndex + 1} a{' '}
                      {Math.min(endIndex, planosFiltrados.length)} de{' '}
                      <strong>{planosFiltrados.length}</strong> planos
                    </span>
                    <Select options={ITEMS_PER_PAGE_OPTIONS} value={String(itemsPerPage)} onChange={handleItemsPerPageChange} className="w-36" />
                
                  </div>

                  <div className="flex items-center gap-1">
                    <button onClick={goToFirstPage} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronsLeftIcon className="w-4 h-4" />
                    </button>
                    <button onClick={goToPreviousPage} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 mx-2">
                      {Array.from({
                  length: Math.min(5, totalPages)
                }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum ? 'bg-teal-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`}>
                          
                              {pageNum}
                            </button>;
                })}
                    </div>

                    <button onClick={goToNextPage} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={goToLastPage} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  
                      <ChevronsRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>}
          </>}
      </Card>

      {/* Modal Form */}
      <Modal isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setPlanoEdit(null);
    }} title={planoEdit ? 'Editar Plano de Saúde' : 'Novo Plano de Saúde'} footer={<>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePlano}>
              {planoEdit ? 'Salvar Alterações' : 'Cadastrar'}
            </Button>
          </>}>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg mb-4">
            <ShieldCheckIcon className="w-6 h-6 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900">
                Plano de Saúde / Convênio
              </p>
              <p className="text-sm text-blue-700">
                Cadastre os planos de saúde aceitos pela clínica
              </p>
            </div>
          </div>

          <Input label="Nome do Plano *" value={formData.nome} onChange={(e) => setFormData({
          ...formData,
          nome: e.target.value
        })} placeholder="Ex: Unimed, Bradesco Saúde, SulAmérica..." />
          

          <div className="grid grid-cols-2 gap-4">
            <Input label="Registro ANS" value={formData.registroAns} onChange={(e) => setFormData({
            ...formData,
            registroAns: e.target.value
          })} placeholder="Número do registro na ANS" />
            
            <Select label="Tipo de Plano" value={formData.tipo} onChange={(e) => setFormData({
            ...formData,
            tipo: e.target.value as PlanoSaude['tipo']
          })} options={TIPOS_PLANO} />
            
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Telefone" value={formData.telefone} onChange={(e) => setFormData({
            ...formData,
            telefone: e.target.value
          })} placeholder="(00) 0000-0000" />
            
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({
            ...formData,
            email: e.target.value
          })} placeholder="contato@plano.com.br" />
            
          </div>

          <Input label="Site" value={formData.site} onChange={(e) => setFormData({
          ...formData,
          site: e.target.value
        })} placeholder="https://www.plano.com.br" />
          

          <Textarea label="Cobertura" value={formData.cobertura} onChange={(e) => setFormData({
          ...formData,
          cobertura: e.target.value
        })} placeholder="Descreva a cobertura do plano..." />
          

          <Textarea label="Observações" value={formData.observacoes} onChange={(e) => setFormData({
          ...formData,
          observacoes: e.target.value
        })} placeholder="Observações adicionais..." />
          

          <div className="flex items-center gap-2">
            <input type="checkbox" id="plano-ativo" checked={formData.ativo} onChange={(e) => setFormData({
            ...formData,
            ativo: e.target.checked
          })} className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
            
            <label htmlFor="plano-ativo" className="text-sm text-gray-700">
              Plano ativo (aceita novos pacientes)
            </label>
          </div>
        </div>
      </Modal>

      {/* Dialog Container */}
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />
    </div>;
}