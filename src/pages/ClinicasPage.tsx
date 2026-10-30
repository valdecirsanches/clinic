import React, { useState } from 'react';
import { PlusIcon, BuildingIcon, Trash2Icon, PencilIcon, AlertTriangleIcon, MapPinIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { ClinicaForm } from '../components/ClinicaForm';
import { Clinica } from '../types';
export interface ClinicasPageProps {
  clinicas: Clinica[];
  onAddClinica: (clinica: any) => void;
  onUpdateClinica: (id: string, updates: Partial<Clinica>) => void;
  onDeleteClinica?: (id: string) => Promise<void>;
  operadoraId?: string;
}
export function ClinicasPage({
  clinicas,
  onAddClinica,
  onUpdateClinica,
  onDeleteClinica,
  operadoraId
}: ClinicasPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClinica, setSelectedClinica] = useState<Clinica | undefined>();
  const [clinicaToDelete, setClinicaToDelete] = useState<Clinica | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDoubleClick = (clinica: Clinica) => {
    setSelectedClinica(clinica);
    setIsModalOpen(true);
  };
  const handleEdit = (clinica: Clinica) => {
    setSelectedClinica(clinica);
    setIsModalOpen(true);
  };
  const handleSaveClinica = (clinicaData: any) => {
    if (selectedClinica) {
      onUpdateClinica(selectedClinica.id, clinicaData);
    } else {
      onAddClinica(clinicaData);
    }
    setSelectedClinica(undefined);
  };
  const handleDeleteClick = (clinica: Clinica) => {
    setClinicaToDelete(clinica);
  };
  const confirmDelete = async () => {
    if (clinicaToDelete && onDeleteClinica) {
      setIsDeleting(true);
      try {
        await onDeleteClinica(clinicaToDelete.id);
        setClinicaToDelete(null);
      } catch (err) {
        console.error('Erro ao excluir clínica:', err);
      } finally {
        setIsDeleting(false);
      }
    }
  };
  // Função para formatar endereço completo
  const formatarEndereco = (c: Clinica) => {
    if (c.logradouro || c.cidade) {
      const partes = [c.logradouro, c.numero && `nº ${c.numero}`, c.bairro, c.cidade, c.uf].filter(Boolean);
      return partes.join(', ');
    }
    return c.endereco || '-';
  };
  const columns = [{
    key: 'nome',
    label: 'Nome',
    render: (c: Clinica) => <div>
          <div className="font-medium text-gray-900">{c.nome}</div>
          {c.cnpj && <div className="text-xs text-gray-500">CNPJ: {c.cnpj}</div>}
        </div>
  }, {
    key: 'endereco',
    label: 'Endereço',
    render: (c: Clinica) => <div className="max-w-xs">
          <div className="text-sm text-gray-700 truncate" title={formatarEndereco(c)}>
        
            {formatarEndereco(c)}
          </div>
          {c.cep && <div className="text-xs text-gray-500">CEP: {c.cep}</div>}
        </div>
  }, {
    key: 'contato',
    label: 'Contato',
    render: (c: Clinica) => <div>
          <div className="text-sm text-gray-700">{c.telefone || '-'}</div>
          {c.email && <div className="text-xs text-gray-500 truncate" title={c.email}>
              {c.email}
            </div>}
        </div>
  }, {
    key: 'ativa',
    label: 'Status',
    render: (c: Clinica) => <span className={`px-2 py-1 text-xs font-medium rounded-full ${c.ativa ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
      
          {c.ativa ? 'Ativa' : 'Inativa'}
        </span>
  }, {
    key: 'acoes',
    label: 'Ações',
    render: (c: Clinica) => <div className="flex items-center gap-2">
          <button onClick={(e) => {
        e.stopPropagation();
        handleEdit(c);
      }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar clínica">
        
            <PencilIcon className="w-4 h-4" />
          </button>
          {onDeleteClinica && <button onClick={(e) => {
        e.stopPropagation();
        handleDeleteClick(c);
      }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir clínica em cascata">
        
              <Trash2Icon className="w-4 h-4" />
            </button>}
        </div>
  }];
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Gerenciar Clínicas
          </h1>
          <p className="text-gray-500 mt-1">
            Administração de todas as clínicas do sistema
          </p>
        </div>
        <Button onClick={() => {
        setSelectedClinica(undefined);
        setIsModalOpen(true);
      }}>
          
          <PlusIcon className="w-5 h-5 mr-2" />
          Nova Clínica
        </Button>
      </div>

      <Card>
        {clinicas.length === 0 ? <div className="text-center py-12">
            <BuildingIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Nenhuma clínica cadastrada</p>
            <Button variant="secondary" onClick={() => {
          setSelectedClinica(undefined);
          setIsModalOpen(true);
        }}>
            
              Cadastrar Primeira Clínica
            </Button>
          </div> : <>
            <div className="mb-4 space-y-2">
              <div className="text-sm text-gray-600 bg-teal-50 border border-teal-200 rounded-lg p-3">
                💡 <strong>Dica:</strong> Clique duas vezes em uma clínica para
                editar o cadastro
              </div>
              {onDeleteClinica && <div className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  ⚠️ <strong>Atenção:</strong> Ao excluir uma clínica, todos os
                  pacientes, consultas, prontuários e dados vinculados serão
                  excluídos permanentemente.
                </div>}
            </div>
            <Table data={clinicas} columns={columns} onRowDoubleClick={handleDoubleClick} />
          
          </>}
      </Card>

      <ClinicaForm isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setSelectedClinica(undefined);
    }} onSave={handleSaveClinica} clinica={selectedClinica} operadoraId={operadoraId} />
      

      {/* Modal de Confirmação de Exclusão em Cascata */}
      {clinicaToDelete && <Modal isOpen={true} onClose={() => !isDeleting && setClinicaToDelete(null)} title="⚠️ Excluir Clínica em Cascata" size="medium" footer={<>
              <Button variant="ghost" onClick={() => setClinicaToDelete(null)} disabled={isDeleting}>
            
                Cancelar
              </Button>
              <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
            
                {isDeleting ? <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Excluindo...
                  </> : <>
                    <Trash2Icon className="w-4 h-4 mr-2" />
                    Confirmar Exclusão
                  </>}
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
                  Ao excluir a clínica <strong>"{clinicaToDelete.nome}"</strong>
                  , os seguintes dados serão excluídos permanentemente:
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>pacientes</strong> cadastrados nesta clínica
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>prontuários</strong> e históricos médicos
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todas as <strong>consultas</strong> e agendamentos
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todas as <strong>agendas</strong> dos profissionais
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>dados financeiros</strong> (parcelas,
                contratos)
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>documentos</strong> e arquivos anexados
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Configurações do <strong>WhatsApp</strong> desta clínica
              </p>
            </div>

            <p className="text-sm text-gray-600 text-center">
              Tem certeza que deseja continuar?
            </p>
          </div>
        </Modal>}
    </div>;
}