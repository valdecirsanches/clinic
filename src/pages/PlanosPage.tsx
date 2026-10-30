import React, { useEffect, useState } from 'react';
import { CheckIcon, CrownIcon, SparklesIcon, UsersIcon, PencilIcon, PlusIcon, Trash2Icon, SaveIcon, XIcon, LockIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Clinica } from '../types';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
// Tipo do plano vindo do banco de dados
interface PlanoDB {
  id: string;
  nome: string;
  preco: number;
  limitePacientes: number | null;
  recursos: string[];
  destaque: boolean;
  ativo: boolean;
  ordem: number;
  criadoEm?: string;
  atualizadoEm?: string;
}
export interface PlanosPageProps {
  clinicas: Clinica[];
  onUpdateClinica: (id: string, updates: Partial<Clinica>) => void;
  clinicaAtualId?: string;
  usuarioTipo?: string;
}
export function PlanosPage({
  clinicas,
  onUpdateClinica,
  clinicaAtualId,
  usuarioTipo
}: PlanosPageProps) {
  const {
    success,
    error: toastError,
    warning
  } = useToast();
  const {
    confirm
  } = useDialog();
  const [clinicaSelecionada, setClinicaSelecionada] = useState<string>(clinicaAtualId || '');
  const [totalPacientes, setTotalPacientes] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [planoAtual, setPlanoAtual] = useState<string>('gratuito');
  // Planos do banco de dados
  const [planos, setPlanos] = useState<PlanoDB[]>([]);
  const [loadingPlanos, setLoadingPlanos] = useState(true);
  // Modal de edição de plano
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [planoEditando, setPlanoEditando] = useState<PlanoDB | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    nome: '',
    preco: 0,
    limitePacientes: '' as string | number,
    recursos: [] as string[],
    destaque: false,
    ordem: 0
  });
  const [novoRecurso, setNovoRecurso] = useState('');
  const [validationError, setValidationError] = useState('');
  // Apenas super_admin pode editar planos
  const isSuperAdmin = usuarioTipo === 'super_admin';
  const isAdmin = usuarioTipo === 'admin';
  const podeEditar = isSuperAdmin; // Apenas super_admin pode editar
  const podeSelecionar = isSuperAdmin || isAdmin; // Ambos podem selecionar plano para clínica
  // Carrega planos do banco de dados
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
  // Busca total de pacientes da clínica selecionada
  useEffect(() => {
    if (clinicaSelecionada) {
      fetchTotalPacientes();
      // Busca plano atual da clínica
      const clinica = clinicas.find((c) => c.id === clinicaSelecionada);
      if (clinica) {
        setPlanoAtual((clinica as any).plano || 'gratuito');
      }
    }
  }, [clinicaSelecionada, clinicas]);
  const fetchTotalPacientes = async () => {
    if (!clinicaSelecionada) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaSelecionada}&limit=1`);
      if (response.ok) {
        const data = await response.json();
        setTotalPacientes(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Erro ao buscar total de pacientes:', error);
    }
  };
  const handleSelecionarPlano = async (planoId: string) => {
    if (!clinicaSelecionada) {
      warning('Atenção', 'Selecione uma clínica primeiro');
      return;
    }
    if (!podeSelecionar) {
      warning('Sem Permissão', 'Você não tem permissão para alterar o plano');
      return;
    }
    const plano = planos.find((p) => p.id === planoId);
    if (!plano) return;
    // Verifica se pode fazer downgrade
    if (plano.limitePacientes && totalPacientes > plano.limitePacientes) {
      warning('Limite Excedido', `Não é possível selecionar este plano. Você tem ${totalPacientes} pacientes, mas o plano permite apenas ${plano.limitePacientes}.`);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clinicas/${clinicaSelecionada}/plano`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plano: planoId
        })
      });
      if (response.ok) {
        setPlanoAtual(planoId);
        onUpdateClinica(clinicaSelecionada, {
          plano: planoId
        } as any);
        success('Plano Alterado', `Plano alterado para ${plano.nome} com sucesso!`);
      } else {
        throw new Error('Erro ao atualizar plano');
      }
    } catch (error: any) {
      console.error('Erro ao atualizar plano:', error);
      toastError('Erro', 'Erro ao atualizar plano. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  const handleEditarPlano = (plano: PlanoDB) => {
    if (!podeEditar) return;
    setPlanoEditando(plano);
    setFormData({
      id: plano.id,
      nome: plano.nome,
      preco: plano.preco,
      limitePacientes: plano.limitePacientes ?? '',
      recursos: [...plano.recursos],
      destaque: plano.destaque,
      ordem: plano.ordem
    });
    setValidationError('');
    setIsModalOpen(true);
  };
  const handleNovoPlano = () => {
    if (!podeEditar) return;
    setPlanoEditando(null);
    setFormData({
      id: '',
      nome: '',
      preco: 0,
      limitePacientes: '',
      recursos: [],
      destaque: false,
      ordem: planos.length + 1
    });
    setValidationError('');
    setIsModalOpen(true);
  };
  const handleSalvarPlano = async () => {
    if (!podeEditar) return;
    if (!formData.id || !formData.nome) {
      setValidationError('ID e Nome são obrigatórios');
      warning('Campos Obrigatórios', 'ID e Nome são obrigatórios');
      return;
    }
    setLoading(true);
    setValidationError('');
    try {
      const payload = {
        ...formData,
        limitePacientes: formData.limitePacientes === '' ? null : Number(formData.limitePacientes)
      };
      const url = planoEditando ? `${API_BASE_URL}/api/planos/${planoEditando.id}` : `${API_BASE_URL}/api/planos`;
      const method = planoEditando ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        await fetchPlanos();
        setIsModalOpen(false);
        success(planoEditando ? 'Plano Atualizado' : 'Plano Criado', planoEditando ? 'Plano atualizado com sucesso!' : 'Plano criado com sucesso!');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao salvar plano');
      }
    } catch (error: any) {
      console.error('Erro ao salvar plano:', error);
      toastError('Erro', error.message || 'Erro ao salvar plano. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  const handleExcluirPlano = async (planoId: string) => {
    if (!podeEditar) return;
    const plano = planos.find((p) => p.id === planoId);
    const shouldDelete = await confirm('Confirmar Exclusão', `Tem certeza que deseja excluir o plano "${plano?.nome}"? Esta ação não pode ser desfeita.`, 'Excluir', 'Cancelar');
    if (!shouldDelete) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/planos/${planoId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await fetchPlanos();
        success('Plano Excluído', 'Plano excluído com sucesso!');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir plano');
      }
    } catch (error: any) {
      console.error('Erro ao excluir plano:', error);
      toastError('Erro', error.message || 'Erro ao excluir plano. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  const handleAdicionarRecurso = () => {
    if (novoRecurso.trim()) {
      setFormData({
        ...formData,
        recursos: [...formData.recursos, novoRecurso.trim()]
      });
      setNovoRecurso('');
    }
  };
  const handleRemoverRecurso = (index: number) => {
    setFormData({
      ...formData,
      recursos: formData.recursos.filter((_, i) => i !== index)
    });
  };
  const getPlanoIcon = (planoId: string) => {
    switch (planoId) {
      case 'gratuito':
        return <UsersIcon className="w-8 h-8" />;
      case 'basico':
        return <SparklesIcon className="w-8 h-8" />;
      case 'profissional':
        return <CrownIcon className="w-8 h-8" />;
      default:
        return <SparklesIcon className="w-8 h-8" />;
    }
  };
  const planoAtualInfo = planos.find((p) => p.id === planoAtual);
  const limitePlano = planoAtualInfo?.limitePacientes;
  const percentualUso = limitePlano ? Math.min(totalPacientes / limitePlano * 100, 100) : 0;
  if (loadingPlanos) {
    return <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <span className="ml-3 text-gray-600">Carregando planos...</span>
      </div>;
  }
  return <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerenciar Planos</h1>
          <p className="text-gray-500 mt-1">
            {podeEditar ? 'Gerencie os planos disponíveis para as clínicas' : 'Visualize e selecione o plano ideal para sua clínica'}
          </p>
        </div>
        {podeEditar && <Button onClick={handleNovoPlano}>
            <PlusIcon className="w-5 h-5 mr-2" />
            Novo Plano
          </Button>}
      </div>

      {/* Aviso para admin (somente leitura) */}
      {isAdmin && !isSuperAdmin && <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-3">
            <LockIcon className="w-5 h-5 text-amber-600" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                Modo Visualização
              </h3>
              <p className="text-xs text-amber-700">
                Você pode visualizar os planos e selecionar um para sua clínica,
                mas apenas o Super Admin pode criar, editar ou excluir planos.
              </p>
            </div>
          </div>
        </div>}

      {/* Seletor de Clínica */}
      {clinicas.length > 1 && <Card>
          <div className="flex items-center gap-4">
            <label className="font-medium text-gray-700">Clínica:</label>
            <select value={clinicaSelecionada} onChange={(e) => setClinicaSelecionada(e.target.value)} className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent">
            
              <option value="">Selecione uma clínica</option>
              {clinicas.map((clinica) => <option key={clinica.id} value={clinica.id}>
                  {clinica.nome}
                </option>)}
            </select>
          </div>
        </Card>}

      {/* Status do Plano Atual */}
      {clinicaSelecionada && planoAtualInfo && <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Plano Atual:{' '}
                <span className="text-teal-600">{planoAtualInfo.nome}</span>
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {totalPacientes} pacientes cadastrados
                {limitePlano && ` de ${limitePlano} permitidos`}
                {!limitePlano && ' (ilimitado)'}
              </p>
            </div>
            {limitePlano && <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(percentualUso)}%
                </div>
                <div className="text-xs text-gray-500">utilizado</div>
              </div>}
          </div>

          {limitePlano && <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className={`h-3 rounded-full transition-all duration-500 ${percentualUso >= 90 ? 'bg-red-500' : percentualUso >= 70 ? 'bg-yellow-500' : 'bg-teal-500'}`} style={{
            width: `${percentualUso}%`
          }} />
            
              </div>
              {percentualUso >= 80 && <p className="text-sm text-amber-600 mt-2">
                  ⚠️ Você está próximo do limite. Considere fazer upgrade para
                  continuar cadastrando pacientes.
                </p>}
            </div>}
        </Card>}

      {/* Cards de Planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {planos.map((plano) => {
        const isAtual = plano.id === planoAtual;
        const podeSelecionarPlano = !plano.limitePacientes || totalPacientes <= plano.limitePacientes;
        return <div key={plano.id} className={`relative rounded-2xl border-2 p-6 transition-all duration-300 ${plano.destaque ? 'border-teal-500 bg-gradient-to-b from-teal-50 to-white shadow-xl scale-105' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg'} ${isAtual ? 'ring-2 ring-teal-500 ring-offset-2' : ''}`}>
              
              {plano.destaque && <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MAIS POPULAR
                  </span>
                </div>}

              {isAtual && <div className="absolute -top-3 right-4">
                  <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    ATUAL
                  </span>
                </div>}

              {/* Botão de editar (apenas super_admin) */}
              {podeEditar && <div className="absolute top-2 right-2 flex gap-1">
                  <button onClick={() => handleEditarPlano(plano)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar plano">
                  
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleExcluirPlano(plano.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir plano">
                  
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>}

              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${plano.destaque ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-600'}`}>
                
                {getPlanoIcon(plano.id)}
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {plano.nome}
              </h3>

              <div className="mb-4">
                {plano.preco === 0 ? <div className="text-3xl font-bold text-gray-900">Grátis</div> : <div className="flex items-baseline gap-1">
                    <span className="text-sm text-gray-500">R$</span>
                    <span className="text-3xl font-bold text-gray-900">
                      {plano.preco}
                    </span>
                    <span className="text-gray-500">/mês</span>
                  </div>}
              </div>

              <div className="text-sm text-gray-600 mb-6">
                {plano.limitePacientes ? `Até ${plano.limitePacientes} pacientes` : 'Pacientes ilimitados'}
              </div>

              <ul className="space-y-3 mb-6 min-h-[120px]">
                {plano.recursos.map((recurso, index) => <li key={index} className="flex items-start gap-2">
                    <CheckIcon className={`w-5 h-5 flex-shrink-0 ${plano.destaque ? 'text-teal-500' : 'text-green-500'}`} />
                  
                    <span className="text-sm text-gray-600">{recurso}</span>
                  </li>)}
              </ul>

              <Button variant={plano.destaque ? 'primary' : 'secondary'} className={`w-full ${plano.destaque ? 'bg-teal-600 hover:bg-teal-700' : ''}`} onClick={() => handleSelecionarPlano(plano.id)} disabled={loading || isAtual || !clinicaSelecionada || !podeSelecionarPlano}>
                
                {isAtual ? 'Plano Atual' : !podeSelecionarPlano ? 'Limite excedido' : loading ? 'Processando...' : 'Selecionar Plano'}
              </Button>

              {!podeSelecionarPlano && !isAtual && <p className="text-xs text-red-500 mt-2 text-center">
                  Você tem {totalPacientes} pacientes, mas este plano permite
                  apenas {plano.limitePacientes}
                </p>}
            </div>;
      })}
      </div>

      {/* Informações adicionais */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Perguntas Frequentes
        </h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900">
              Como funciona a cobrança?
            </h4>
            <p className="text-sm text-gray-600">
              A cobrança é mensal e você pode cancelar ou mudar de plano a
              qualquer momento.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">
              Posso fazer downgrade?
            </h4>
            <p className="text-sm text-gray-600">
              Sim, desde que o número de pacientes cadastrados esteja dentro do
              limite do novo plano.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">
              O que acontece se eu atingir o limite?
            </h4>
            <p className="text-sm text-gray-600">
              Você não poderá cadastrar novos pacientes até fazer upgrade ou
              remover pacientes existentes.
            </p>
          </div>
        </div>
      </Card>

      {/* Modal de Edição/Criação de Plano (apenas super_admin) */}
      {podeEditar && <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={planoEditando ? 'Editar Plano' : 'Novo Plano'} size="large" footer={<>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvarPlano} disabled={loading}>
                <SaveIcon className="w-4 h-4 mr-2" />
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </>}>
        
          <div className="space-y-4">
            {/* Mensagem de validação */}
            {validationError && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">⚠️ {validationError}</p>
              </div>}

            <div className="grid grid-cols-2 gap-4">
              <Input label="ID do Plano *" value={formData.id} onChange={(e) => setFormData({
            ...formData,
            id: e.target.value.toLowerCase().replace(/\s/g, '_')
          })} placeholder="ex: premium" disabled={!!planoEditando} helper={planoEditando ? 'ID não pode ser alterado' : 'Identificador único (sem espaços)'} />
            
              <Input label="Nome do Plano *" value={formData.nome} onChange={(e) => setFormData({
            ...formData,
            nome: e.target.value
          })} placeholder="ex: Premium" />
            
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input label="Preço (R$/mês)" type="number" min="0" step="0.01" value={formData.preco} onChange={(e) => setFormData({
            ...formData,
            preco: parseFloat(e.target.value) || 0
          })} placeholder="0.00" />
            
              <Input label="Limite de Pacientes" type="number" min="0" value={formData.limitePacientes} onChange={(e) => setFormData({
            ...formData,
            limitePacientes: e.target.value === '' ? '' : parseInt(e.target.value)
          })} placeholder="Vazio = Ilimitado" helper="Deixe vazio para ilimitado" />
            
              <Input label="Ordem de Exibição" type="number" min="0" value={formData.ordem} onChange={(e) => setFormData({
            ...formData,
            ordem: parseInt(e.target.value) || 0
          })} placeholder="1" />
            
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="destaque" checked={formData.destaque} onChange={(e) => setFormData({
            ...formData,
            destaque: e.target.checked
          })} className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
            
              <label htmlFor="destaque" className="text-sm text-gray-700">
                Destacar este plano (exibe badge "MAIS POPULAR")
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recursos do Plano
              </label>
              <div className="flex gap-2 mb-2">
                <Input value={novoRecurso} onChange={(e) => setNovoRecurso(e.target.value)} placeholder="Digite um recurso e pressione Enter" onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdicionarRecurso();
              }
            }} />
              
                <Button type="button" onClick={handleAdicionarRecurso} variant="secondary">
                
                  <PlusIcon className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {formData.recursos.map((recurso, index) => <div key={index} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700">
                      {recurso}
                    </span>
                    <button type="button" onClick={() => handleRemoverRecurso(index)} className="p-1 text-gray-400 hover:text-red-600 rounded">
                  
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>)}
                {formData.recursos.length === 0 && <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum recurso adicionado. Adicione recursos que serão
                    exibidos no card do plano.
                  </p>}
              </div>
            </div>
          </div>
        </Modal>}
    </div>;
}