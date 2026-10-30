import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { EmpresaConveniada } from '../types';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ToastContainer';
import { useDialog } from '../hooks/useDialog';
import { DialogContainer } from './DialogContainer';
import { UnidadeEmpresa } from '../hooks/useEmpresasConveniadas';
import { API_BASE_URL } from '../config/api';
import {
  PlusIcon,
  BuildingIcon,
  MapPinIcon,
  TrashIcon,
  EditIcon,
  CheckIcon,
  XIcon,
  Loader2,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon } from
'lucide-react';
const UNIDADES_POR_PAGINA = 10;
interface EmpresaConveniadaFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (empresa: Partial<EmpresaConveniada>) => void;
  empresa?: EmpresaConveniada;
  clinicaId?: string;
}
export function EmpresaConveniadaForm({
  isOpen,
  onClose,
  onSave,
  empresa,
  clinicaId
}: EmpresaConveniadaFormProps) {
  const [activeTab, setActiveTab] = useState<'dados' | 'unidades'>('dados');
  const [formData, setFormData] = useState<Partial<EmpresaConveniada>>({
    nome: '',
    cnpj: '',
    razaoSocial: '',
    telefone: '',
    email: '',
    endereco: '',
    contato: '',
    observacoes: '',
    ativa: true
  });
  // Estado para unidades
  const [unidades, setUnidades] = useState<UnidadeEmpresa[]>([]);
  const [loadingUnidades, setLoadingUnidades] = useState(false);
  const [editandoUnidade, setEditandoUnidade] = useState<string | null>(null);
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [unidadeForm, setUnidadeForm] = useState<Partial<UnidadeEmpresa>>({
    nome: '',
    codigo: '',
    endereco: '',
    cidade: '',
    uf: '',
    telefone: '',
    responsavel: '',
    observacoes: '',
    ativa: true
  });
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);
  // ⭐ Estados para paginação e busca de unidades
  const [buscaUnidade, setBuscaUnidade] = useState('');
  const [paginaUnidades, setPaginaUnidades] = useState(1);
  // ⭐ Ref para controlar carregamento de unidades e evitar loop
  const unidadesCarregadasRef = useRef<string | null>(null);
  const carregandoUnidadesRef = useRef(false);
  const ultimaChamadaRef = useRef<number>(0);
  const { toasts, removeToast, error: showError } = useToast();
  const { dialogs, removeDialog, confirm } = useDialog();
  // Busca clinicaId do localStorage se não foi passado
  const getClinicaId = () => {
    if (clinicaId) return clinicaId;
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      return parsed.clinicaAtual?.id || '';
    }
    return '';
  };
  // ⭐ Filtra e pagina unidades
  const unidadesFiltradas = useMemo(() => {
    if (!buscaUnidade.trim()) return unidades;
    const termo = buscaUnidade.toLowerCase();
    return unidades.filter(
      (u) =>
      u.nome?.toLowerCase().includes(termo) ||
      u.codigo?.toLowerCase().includes(termo) ||
      u.cidade?.toLowerCase().includes(termo) ||
      u.responsavel?.toLowerCase().includes(termo)
    );
  }, [unidades, buscaUnidade]);
  const totalPaginasUnidades = Math.ceil(
    unidadesFiltradas.length / UNIDADES_POR_PAGINA
  );
  const unidadesPaginadas = useMemo(() => {
    const inicio = (paginaUnidades - 1) * UNIDADES_POR_PAGINA;
    return unidadesFiltradas.slice(inicio, inicio + UNIDADES_POR_PAGINA);
  }, [unidadesFiltradas, paginaUnidades]);
  // Reset página quando busca muda
  useEffect(() => {
    setPaginaUnidades(1);
  }, [buscaUnidade]);
  // ⭐ Carrega unidades da empresa - COM CONTROLE DE LOOP
  const carregarUnidades = async (empresaId: string) => {
    const cId = getClinicaId();
    if (!cId || !empresaId) return;
    // ⭐ Evita chamadas duplicadas
    if (carregandoUnidadesRef.current) {
      console.log('⚠️ [EmpresaForm] Já está carregando unidades, ignorando...');
      return;
    }
    // ⭐ Evita recarregar se já carregou para esta empresa
    if (unidadesCarregadasRef.current === empresaId) {
      console.log(
        '⚠️ [EmpresaForm] Unidades já carregadas para empresa',
        empresaId
      );
      return;
    }
    // ⭐ Debounce - evita chamadas muito rápidas (mínimo 500ms entre chamadas)
    const agora = Date.now();
    if (agora - ultimaChamadaRef.current < 500) {
      console.log(
        '⚠️ [EmpresaForm] Debounce - chamada muito rápida, ignorando...'
      );
      return;
    }
    ultimaChamadaRef.current = agora;
    carregandoUnidadesRef.current = true;
    setLoadingUnidades(true);
    setUnidades([]);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades?clinicaId=${cId}`
      );
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setUnidades(data);
          unidadesCarregadasRef.current = empresaId; // ⭐ Marca como carregado
          console.log(
            `✅ [EmpresaForm] Carregadas ${data.length} unidades para empresa ${empresaId}`
          );
        } else {
          console.error('❌ [EmpresaForm] Resposta não é um array:', data);
          setUnidades([]);
        }
      } else {
        console.error(
          '❌ [EmpresaForm] Erro ao carregar unidades:',
          response.status
        );
        setUnidades([]);
      }
    } catch (err) {
      console.error('[EmpresaForm] Erro ao carregar unidades:', err);
      setUnidades([]);
    } finally {
      setLoadingUnidades(false);
      carregandoUnidadesRef.current = false;
    }
  };
  // ⭐ Effect para inicializar o formulário - CORRIGIDO
  useEffect(() => {
    if (!isOpen) {
      // ⭐ Reset refs quando modal fecha
      unidadesCarregadasRef.current = null;
      carregandoUnidadesRef.current = false;
      ultimaChamadaRef.current = 0;
      return;
    }
    if (empresa) {
      setFormData({
        nome: empresa.nome || '',
        cnpj: empresa.cnpj || '',
        razaoSocial: empresa.razaoSocial || '',
        telefone: empresa.telefone || '',
        email: empresa.email || '',
        endereco: empresa.endereco || '',
        contato: empresa.contato || '',
        observacoes: empresa.observacoes || '',
        ativa: empresa.ativa
      });
      // ⭐ Carrega unidades apenas se ainda não carregou para esta empresa
      if (unidadesCarregadasRef.current !== empresa.id) {
        carregarUnidades(empresa.id);
      }
    } else {
      setFormData({
        nome: '',
        cnpj: '',
        razaoSocial: '',
        telefone: '',
        email: '',
        endereco: '',
        contato: '',
        observacoes: '',
        ativa: true
      });
      setUnidades([]);
      unidadesCarregadasRef.current = null;
    }
    setActiveTab('dados');
    setNovaUnidade(false);
    setEditandoUnidade(null);
    setBuscaUnidade('');
    setPaginaUnidades(1);
  }, [empresa?.id, isOpen]); // ⭐ Usa empresa?.id ao invés de empresa para evitar re-renders
  // Salva unidade (criar ou atualizar)
  const handleSalvarUnidade = async () => {
    if (!unidadeForm.nome?.trim()) return;
    if (!empresa?.id) {
      showError('Erro', 'Salve a empresa primeiro antes de adicionar unidades.');
      return;
    }
    const cId = getClinicaId();
    if (!cId) return;
    setSalvandoUnidade(true);
    try {
      const url = editandoUnidade ?
      `${API_BASE_URL}/api/empresas-conveniadas/${empresa.id}/unidades/${editandoUnidade}` :
      `${API_BASE_URL}/api/empresas-conveniadas/${empresa.id}/unidades`;
      const response = await fetch(url, {
        method: editandoUnidade ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...unidadeForm,
          clinicaId: cId
        })
      });
      if (!response.ok) {
        throw new Error('Erro ao salvar unidade');
      }
      // ⭐ Reset ref para permitir recarregar
      unidadesCarregadasRef.current = null;
      await carregarUnidades(empresa.id);
      // Limpa formulário
      setUnidadeForm({
        nome: '',
        codigo: '',
        endereco: '',
        cidade: '',
        uf: '',
        telefone: '',
        responsavel: '',
        observacoes: '',
        ativa: true
      });
      setNovaUnidade(false);
      setEditandoUnidade(null);
    } catch (err) {
      console.error('Erro ao salvar unidade:', err);
      showError('Erro', 'Erro ao salvar unidade');
    } finally {
      setSalvandoUnidade(false);
    }
  };
  // Edita unidade
  const handleEditarUnidade = (unidade: UnidadeEmpresa) => {
    setUnidadeForm({
      nome: unidade.nome,
      codigo: unidade.codigo || '',
      endereco: unidade.endereco || '',
      cidade: unidade.cidade || '',
      uf: unidade.uf || '',
      telefone: unidade.telefone || '',
      responsavel: unidade.responsavel || '',
      observacoes: unidade.observacoes || '',
      ativa: unidade.ativa
    });
    setEditandoUnidade(unidade.id);
    setNovaUnidade(true);
  };
  // Deleta unidade
  const handleDeletarUnidade = async (unidadeId: string) => {
    const shouldDelete = await confirm(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir esta unidade?',
      'Excluir',
      'Cancelar'
    );
    if (!shouldDelete) return;
    if (!empresa?.id) return;
    const cId = getClinicaId();
    if (!cId) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/empresas-conveniadas/${empresa.id}/unidades/${unidadeId}?clinicaId=${cId}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) {
        throw new Error('Erro ao deletar unidade');
      }
      setUnidades((prev) => prev.filter((u) => u.id !== unidadeId));
    } catch (err) {
      console.error('Erro ao deletar unidade:', err);
      showError('Erro', 'Erro ao deletar unidade');
    }
  };
  // Cancela edição de unidade
  const handleCancelarUnidade = () => {
    setUnidadeForm({
      nome: '',
      codigo: '',
      endereco: '',
      cidade: '',
      uf: '',
      telefone: '',
      responsavel: '',
      observacoes: '',
      ativa: true
    });
    setNovaUnidade(false);
    setEditandoUnidade(null);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome) return;
    onSave(formData);
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={empresa ? 'Editar Empresa Conveniada' : 'Nova Empresa Conveniada'}
      size="large"
      footer={
      <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!formData.nome}>
            {empresa ? 'Salvar Alterações' : 'Cadastrar'}
          </Button>
        </>
      }>
      
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('dados')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'dados' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>
            
            <BuildingIcon className="w-4 h-4 inline mr-2" />
            Dados da Empresa
          </button>
          {empresa &&
          <button
            type="button"
            onClick={() => setActiveTab('unidades')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'unidades' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>
            
              <MapPinIcon className="w-4 h-4 inline mr-2" />
              Unidades / Filiais
              {!loadingUnidades && unidades.length > 0 &&
            <span className="ml-2 px-2 py-0.5 text-xs bg-teal-100 text-teal-700 rounded-full">
                  {unidades.length}
                </span>
            }
              {loadingUnidades &&
            <Loader2 className="w-3 h-3 ml-2 inline animate-spin text-teal-600" />
            }
            </button>
          }
        </div>
      </div>

      {/* Tab: Dados da Empresa */}
      {activeTab === 'dados' &&
      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
            label="Nome Fantasia *"
            value={formData.nome}
            onChange={(e) =>
            setFormData({
              ...formData,
              nome: e.target.value
            })
            }
            placeholder="Nome da empresa"
            required />
          

            <Input
            label="CNPJ"
            value={formData.cnpj}
            onChange={(e) =>
            setFormData({
              ...formData,
              cnpj: e.target.value
            })
            }
            placeholder="00.000.000/0000-00" />
          
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
            label="Razão Social"
            value={formData.razaoSocial}
            onChange={(e) =>
            setFormData({
              ...formData,
              razaoSocial: e.target.value
            })
            }
            placeholder="Razão Social Ltda" />
          

            <Input
            label="Contato Principal"
            value={formData.contato}
            onChange={(e) =>
            setFormData({
              ...formData,
              contato: e.target.value
            })
            }
            placeholder="Nome do responsável" />
          
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
            label="Telefone"
            value={formData.telefone}
            onChange={(e) =>
            setFormData({
              ...formData,
              telefone: e.target.value
            })
            }
            placeholder="(00) 0000-0000" />
          

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
            placeholder="contato@empresa.com" />
          
          </div>

          <Input
          label="Endereço (Matriz)"
          value={formData.endereco}
          onChange={(e) =>
          setFormData({
            ...formData,
            endereco: e.target.value
          })
          }
          placeholder="Endereço da matriz" />
        

          <Textarea
          label="Observações"
          value={formData.observacoes}
          onChange={(e) =>
          setFormData({
            ...formData,
            observacoes: e.target.value
          })
          }
          placeholder="Informações adicionais sobre o convênio..."
          rows={3} />
        

          <div className="flex items-center gap-2">
            <input
            type="checkbox"
            id="ativa"
            checked={formData.ativa}
            onChange={(e) =>
            setFormData({
              ...formData,
              ativa: e.target.checked
            })
            }
            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
          

            <label
            htmlFor="ativa"
            className="text-sm font-medium text-gray-700">
            
              Empresa Ativa
            </label>
          </div>

          {!empresa &&
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                💡 <strong>Dica:</strong> Após salvar a empresa, você poderá
                adicionar as unidades/filiais na aba "Unidades / Filiais".
              </p>
            </div>
        }
        </form>
      }

      {/* Tab: Unidades */}
      {activeTab === 'unidades' && empresa &&
      <div className="space-y-4">
          {/* Header com botão adicionar */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">
                Unidades de {empresa.nome}
              </h3>
              <p className="text-sm text-gray-500">
                {unidades.length} unidade(s) cadastrada(s)
              </p>
            </div>
            {!novaUnidade &&
          <Button size="sm" onClick={() => setNovaUnidade(true)}>
                <PlusIcon className="w-4 h-4 mr-1" />
                Nova Unidade
              </Button>
          }
          </div>

          {/* Formulário de nova unidade */}
          {novaUnidade &&
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">
                  {editandoUnidade ? 'Editar Unidade' : 'Nova Unidade'}
                </h4>
                <button
              type="button"
              onClick={handleCancelarUnidade}
              className="text-gray-400 hover:text-gray-600">
              
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
              label="Nome da Unidade *"
              value={unidadeForm.nome}
              onChange={(e) =>
              setUnidadeForm({
                ...unidadeForm,
                nome: e.target.value
              })
              }
              placeholder="Ex: Filial Centro, Unidade Norte" />
            

                <Input
              label="Código"
              value={unidadeForm.codigo}
              onChange={(e) =>
              setUnidadeForm({
                ...unidadeForm,
                codigo: e.target.value
              })
              }
              placeholder="Código interno" />
            
              </div>

              <Input
            label="Endereço"
            value={unidadeForm.endereco}
            onChange={(e) =>
            setUnidadeForm({
              ...unidadeForm,
              endereco: e.target.value
            })
            }
            placeholder="Endereço completo" />
          

              <div className="grid grid-cols-3 gap-3">
                <Input
              label="Cidade"
              value={unidadeForm.cidade}
              onChange={(e) =>
              setUnidadeForm({
                ...unidadeForm,
                cidade: e.target.value
              })
              }
              placeholder="Cidade" />
            

                <Input
              label="UF"
              value={unidadeForm.uf}
              onChange={(e) =>
              setUnidadeForm({
                ...unidadeForm,
                uf: e.target.value
              })
              }
              placeholder="UF"
              maxLength={2} />
            

                <Input
              label="Telefone"
              value={unidadeForm.telefone}
              onChange={(e) =>
              setUnidadeForm({
                ...unidadeForm,
                telefone: e.target.value
              })
              }
              placeholder="(00) 0000-0000" />
            
              </div>

              <Input
            label="Responsável"
            value={unidadeForm.responsavel}
            onChange={(e) =>
            setUnidadeForm({
              ...unidadeForm,
              responsavel: e.target.value
            })
            }
            placeholder="Nome do responsável da unidade" />
          

              <div className="flex items-center gap-2">
                <input
              type="checkbox"
              id="unidadeAtiva"
              checked={unidadeForm.ativa}
              onChange={(e) =>
              setUnidadeForm({
                ...unidadeForm,
                ativa: e.target.checked
              })
              }
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
            

                <label htmlFor="unidadeAtiva" className="text-sm text-gray-700">
                  Unidade Ativa
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelarUnidade}>
              
                  Cancelar
                </Button>
                <Button
              size="sm"
              onClick={handleSalvarUnidade}
              disabled={!unidadeForm.nome?.trim() || salvandoUnidade}>
              
                  {salvandoUnidade ?
              <Loader2 className="w-4 h-4 animate-spin" /> :

              <>
                      <CheckIcon className="w-4 h-4 mr-1" />
                      {editandoUnidade ? 'Atualizar' : 'Salvar'}
                    </>
              }
                </Button>
              </div>
            </div>
        }

          {/* Busca de unidades */}
          {unidades.length > 5 && !novaUnidade &&
        <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
            type="text"
            placeholder="Buscar unidade por nome, código, cidade..."
            value={buscaUnidade}
            onChange={(e) => setBuscaUnidade(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
          

              {buscaUnidade &&
          <button
            onClick={() => setBuscaUnidade('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
            
                  <XIcon className="w-4 h-4" />
                </button>
          }
            </div>
        }

          {/* Lista de unidades */}
          {loadingUnidades ?
        <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div> :
        unidades.length === 0 ?
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <MapPinIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 font-medium">
                Nenhuma unidade cadastrada
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Clique em "Nova Unidade" para adicionar filiais
              </p>
            </div> :
        unidadesFiltradas.length === 0 ?
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <SearchIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Nenhuma unidade encontrada</p>
              <p className="text-sm text-gray-500">
                Tente outro termo de busca
              </p>
            </div> :

        <>
              {/* Lista com altura máxima e scroll */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {unidadesPaginadas.map((unidade) =>
            <div
              key={unidade.id}
              className={`p-3 rounded-lg border ${unidade.ativa ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
              
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MapPinIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                          <span className="font-medium text-gray-900 truncate">
                            {unidade.nome}
                          </span>
                          {unidade.codigo &&
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                              {unidade.codigo}
                            </span>
                    }
                          {!unidade.ativa &&
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded">
                              Inativa
                            </span>
                    }
                        </div>
                        {unidade.endereco &&
                  <p className="text-sm text-gray-600 mt-1 truncate">
                            {unidade.endereco}
                            {unidade.cidade && ` - ${unidade.cidade}`}
                            {unidade.uf && `/${unidade.uf}`}
                          </p>
                  }
                        {unidade.responsavel &&
                  <p className="text-xs text-gray-500 mt-1">
                            Responsável: {unidade.responsavel}
                          </p>
                  }
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                    type="button"
                    onClick={() => handleEditarUnidade(unidade)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Editar">
                    
                          <EditIcon className="w-4 h-4" />
                        </button>
                        <button
                    type="button"
                    onClick={() => handleDeletarUnidade(unidade.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Excluir">
                    
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
            )}
              </div>

              {/* Paginação */}
              {totalPaginasUnidades > 1 &&
          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-600">
                    Mostrando {(paginaUnidades - 1) * UNIDADES_POR_PAGINA + 1} a{' '}
                    {Math.min(
                paginaUnidades * UNIDADES_POR_PAGINA,
                unidadesFiltradas.length
              )}{' '}
                    de {unidadesFiltradas.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                onClick={() =>
                setPaginaUnidades((p) => Math.max(1, p - 1))
                }
                disabled={paginaUnidades === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
                
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1 text-sm">
                      {paginaUnidades} / {totalPaginasUnidades}
                    </span>
                    <button
                onClick={() =>
                setPaginaUnidades((p) =>
                Math.min(totalPaginasUnidades, p + 1)
                )
                }
                disabled={paginaUnidades === totalPaginasUnidades}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
                
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
          }
            </>
        }
        </div>
      }
    </Modal>);

}