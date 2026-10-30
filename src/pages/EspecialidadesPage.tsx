import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { API_BASE_URL } from '../config/api';
import {
  PlusIcon,
  SearchIcon,
  AwardIcon,
  EditIcon,
  Trash2Icon,
  StethoscopeIcon,
  RefreshCwIcon } from
'lucide-react';
interface Especialidade {
  id: string;
  nome: string;
  descricao?: string;
  tipo: 'medica' | 'odontologica' | 'ambas';
  ativa: boolean;
  criadoEm: string;
}
export function EspecialidadesPage() {
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [especialidadeEdit, setEspecialidadeEdit] =
  useState<Especialidade | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    tipo: 'medica' as 'medica' | 'odontologica' | 'ambas',
    ativa: true
  });
  const [saving, setSaving] = useState(false);
  const { success, error: showError } = useToast();
  const { confirm } = useDialog();
  // Carrega especialidades da API
  const carregarEspecialidades = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/especialidades`);
      if (response.ok) {
        const data = await response.json();
        setEspecialidades(
          data.map((e: any) => ({
            ...e,
            ativa: Boolean(e.ativa)
          }))
        );
      } else {
        throw new Error('Erro ao carregar especialidades');
      }
    } catch (err) {
      console.error('Erro ao carregar especialidades:', err);
      showError('Erro', 'Não foi possível carregar as especialidades');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    carregarEspecialidades();
  }, []);
  const handleOpenModal = (especialidade?: Especialidade) => {
    if (especialidade) {
      setEspecialidadeEdit(especialidade);
      setFormData({
        nome: especialidade.nome,
        descricao: especialidade.descricao || '',
        tipo: especialidade.tipo,
        ativa: especialidade.ativa
      });
    } else {
      setEspecialidadeEdit(null);
      setFormData({
        nome: '',
        descricao: '',
        tipo: 'medica',
        ativa: true
      });
    }
    setIsModalOpen(true);
  };
  const handleSave = async () => {
    if (!formData.nome.trim()) {
      showError('Erro', 'Nome da especialidade é obrigatório');
      return;
    }
    setSaving(true);
    try {
      if (especialidadeEdit) {
        // Atualiza
        const response = await fetch(
          `${API_BASE_URL}/api/especialidades/${especialidadeEdit.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          }
        );
        if (!response.ok) throw new Error('Erro ao atualizar');
        success('Especialidade Atualizada', 'Alterações salvas com sucesso!');
      } else {
        // Cria nova
        const response = await fetch(`${API_BASE_URL}/api/especialidades`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
        if (!response.ok) throw new Error('Erro ao criar');
        success('Especialidade Criada', 'Nova especialidade cadastrada!');
      }
      setIsModalOpen(false);
      carregarEspecialidades();
    } catch (err: any) {
      showError('Erro', err.message || 'Erro ao salvar especialidade');
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (especialidade: Especialidade) => {
    const confirmed = await confirm(
      'Excluir Especialidade',
      `Deseja realmente excluir a especialidade "${especialidade.nome}"?`,
      'Excluir',
      'Cancelar'
    );
    if (!confirmed) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/especialidades/${especialidade.id}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) throw new Error('Erro ao excluir');
      success('Especialidade Excluída', 'Especialidade removida com sucesso!');
      carregarEspecialidades();
    } catch (err) {
      showError('Erro', 'Não foi possível excluir a especialidade');
    }
  };
  const handleToggleAtiva = async (especialidade: Especialidade) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/especialidades/${especialidade.id}/toggle`,
        {
          method: 'PATCH'
        }
      );
      if (!response.ok) throw new Error('Erro ao atualizar status');
      carregarEspecialidades();
    } catch (err) {
      showError('Erro', 'Não foi possível atualizar o status');
    }
  };
  // Filtra especialidades
  const especialidadesFiltradas = especialidades.filter(
    (e) =>
    e.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.descricao &&
    e.descricao.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const especialidadesMedicas = especialidadesFiltradas.filter(
    (e) => e.tipo === 'medica' || e.tipo === 'ambas'
  );
  const especialidadesOdonto = especialidadesFiltradas.filter(
    (e) => e.tipo === 'odontologica' || e.tipo === 'ambas'
  );
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <AwardIcon className="w-8 h-8 text-purple-600" />
            Especialidades
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie as especialidades médicas e odontológicas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={carregarEspecialidades}
            disabled={loading}>
            
            <RefreshCwIcon
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            
          </Button>
          <Button onClick={() => handleOpenModal()}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Nova Especialidade
          </Button>
        </div>
      </div>

      {/* Busca */}
      <Card>
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar especialidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<SearchIcon className="w-4 h-4" />} />
            
          </div>
        </div>
      </Card>

      {loading ?
      <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-2">Carregando especialidades...</p>
        </div> :

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Especialidades Médicas */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <StethoscopeIcon className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">
                Especialidades Médicas
              </h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {especialidadesMedicas.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {especialidadesMedicas.length === 0 ?
            <p className="text-gray-500 text-sm text-center py-4">
                  Nenhuma especialidade médica cadastrada
                </p> :

            especialidadesMedicas.map((esp) =>
            <div
              key={esp.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${esp.ativa ? 'bg-white border-gray-200 hover:border-blue-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
              
                    <div className="flex items-center gap-3">
                      <div
                  className={`w-2 h-2 rounded-full ${esp.ativa ? 'bg-green-500' : 'bg-gray-300'}`} />
                

                      <div>
                        <p className="font-medium text-gray-900">{esp.nome}</p>
                        {esp.descricao &&
                  <p className="text-xs text-gray-500">
                            {esp.descricao}
                          </p>
                  }
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleAtiva(esp)}
                  className={
                  esp.ativa ? 'text-green-600' : 'text-gray-400'
                  }>
                  
                        {esp.ativa ? 'Ativa' : 'Inativa'}
                      </Button>
                      <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenModal(esp)}>
                  
                        <EditIcon className="w-4 h-4" />
                      </Button>
                      <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(esp)}
                  className="text-red-600 hover:bg-red-50">
                  
                        <Trash2Icon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
            )
            }
            </div>
          </Card>

          {/* Especialidades Odontológicas */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <span className="text-xl">🦷</span>
              <h3 className="font-semibold text-gray-900">
                Especialidades Odontológicas
              </h3>
              <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                {especialidadesOdonto.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {especialidadesOdonto.length === 0 ?
            <p className="text-gray-500 text-sm text-center py-4">
                  Nenhuma especialidade odontológica cadastrada
                </p> :

            especialidadesOdonto.map((esp) =>
            <div
              key={esp.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${esp.ativa ? 'bg-white border-gray-200 hover:border-teal-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
              
                    <div className="flex items-center gap-3">
                      <div
                  className={`w-2 h-2 rounded-full ${esp.ativa ? 'bg-green-500' : 'bg-gray-300'}`} />
                

                      <div>
                        <p className="font-medium text-gray-900">{esp.nome}</p>
                        {esp.descricao &&
                  <p className="text-xs text-gray-500">
                            {esp.descricao}
                          </p>
                  }
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleAtiva(esp)}
                  className={
                  esp.ativa ? 'text-green-600' : 'text-gray-400'
                  }>
                  
                        {esp.ativa ? 'Ativa' : 'Inativa'}
                      </Button>
                      <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenModal(esp)}>
                  
                        <EditIcon className="w-4 h-4" />
                      </Button>
                      <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(esp)}
                  className="text-red-600 hover:bg-red-50">
                  
                        <Trash2Icon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
            )
            }
            </div>
          </Card>
        </div>
      }

      {/* Modal de Cadastro/Edição */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
        especialidadeEdit ? 'Editar Especialidade' : 'Nova Especialidade'
        }
        footer={
        <>
            <Button
            variant="ghost"
            onClick={() => setIsModalOpen(false)}
            disabled={saving}>
            
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ?
            'Salvando...' :
            especialidadeEdit ?
            'Salvar Alterações' :
            'Cadastrar'}
            </Button>
          </>
        }>
        
        <div className="space-y-4">
          <Input
            label="Nome da Especialidade *"
            value={formData.nome}
            onChange={(e) =>
            setFormData({
              ...formData,
              nome: e.target.value
            })
            }
            placeholder="Ex: Cardiologia, Ortodontia..." />
          

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição
            </label>
            <textarea
              value={formData.descricao}
              onChange={(e) =>
              setFormData({
                ...formData,
                descricao: e.target.value
              })
              }
              placeholder="Descrição opcional da especialidade..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20" />
            
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value="medica"
                  checked={formData.tipo === 'medica'}
                  onChange={() =>
                  setFormData({
                    ...formData,
                    tipo: 'medica'
                  })
                  }
                  className="w-4 h-4 text-blue-600" />
                

                <span className="text-sm">Médica</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value="odontologica"
                  checked={formData.tipo === 'odontologica'}
                  onChange={() =>
                  setFormData({
                    ...formData,
                    tipo: 'odontologica'
                  })
                  }
                  className="w-4 h-4 text-teal-600" />
                

                <span className="text-sm">Odontológica</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value="ambas"
                  checked={formData.tipo === 'ambas'}
                  onChange={() =>
                  setFormData({
                    ...formData,
                    tipo: 'ambas'
                  })
                  }
                  className="w-4 h-4 text-purple-600" />
                

                <span className="text-sm">Ambas</span>
              </label>
            </div>
          </div>

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
              className="w-4 h-4 text-purple-600 border-gray-300 rounded" />
            

            <label htmlFor="ativa" className="text-sm text-gray-700">
              Especialidade ativa
            </label>
          </div>
        </div>
      </Modal>
    </div>);

}