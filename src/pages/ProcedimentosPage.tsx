import React, { useState, Component } from 'react';
import { PlusIcon, SearchIcon, EditIcon, Trash2Icon, StethoscopeIcon, ClockIcon, DollarSignIcon, FilterIcon, DownloadIcon, CheckIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ProcedimentoForm } from '../components/ProcedimentoForm';
import { DialogContainer } from '../components/DialogContainer';
import { useProcedimentos } from '../hooks/useProcedimentos';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { Procedimento, TipoConsulta } from '../types';
// Lista de procedimentos TUSS (Terminologia Unificada da Saúde Suplementar) comuns
const PROCEDIMENTOS_TUSS = {
  medica: [{
    codigo: '10101012',
    nome: 'Consulta em consultório (no horário normal ou preestabelecido)',
    duracao: 30,
    valor: 150
  }, {
    codigo: '10101020',
    nome: 'Consulta em domicílio',
    duracao: 60,
    valor: 250
  }, {
    codigo: '10101039',
    nome: 'Consulta em pronto socorro',
    duracao: 30,
    valor: 180
  }, {
    codigo: '10102019',
    nome: 'Consulta de retorno/revisão',
    duracao: 20,
    valor: 100
  }, {
    codigo: '20101015',
    nome: 'Eletrocardiograma (ECG)',
    duracao: 15,
    valor: 80
  }, {
    codigo: '20101023',
    nome: 'Teste ergométrico',
    duracao: 45,
    valor: 200
  }, {
    codigo: '40301010',
    nome: 'Hemograma completo',
    duracao: 10,
    valor: 35
  }, {
    codigo: '40302016',
    nome: 'Glicemia de jejum',
    duracao: 10,
    valor: 20
  }, {
    codigo: '40302059',
    nome: 'Colesterol total',
    duracao: 10,
    valor: 25
  }, {
    codigo: '40302067',
    nome: 'Triglicerídeos',
    duracao: 10,
    valor: 25
  }, {
    codigo: '40302075',
    nome: 'HDL Colesterol',
    duracao: 10,
    valor: 30
  }, {
    codigo: '40302083',
    nome: 'LDL Colesterol',
    duracao: 10,
    valor: 30
  }, {
    codigo: '40311023',
    nome: 'TSH',
    duracao: 10,
    valor: 45
  }, {
    codigo: '40311031',
    nome: 'T4 Livre',
    duracao: 10,
    valor: 45
  }, {
    codigo: '40316130',
    nome: 'Creatinina',
    duracao: 10,
    valor: 20
  }, {
    codigo: '40316149',
    nome: 'Ureia',
    duracao: 10,
    valor: 20
  }, {
    codigo: '40501020',
    nome: 'Ultrassonografia de abdome total',
    duracao: 30,
    valor: 180
  }, {
    codigo: '40501039',
    nome: 'Ultrassonografia de tireoide',
    duracao: 20,
    valor: 120
  }, {
    codigo: '40808025',
    nome: 'Raio-X de tórax',
    duracao: 15,
    valor: 80
  }, {
    codigo: '31303030',
    nome: 'Pequena cirurgia (sutura)',
    duracao: 30,
    valor: 150
  }],
  odontologica: [{
    codigo: '81000030',
    nome: 'Consulta odontológica inicial',
    duracao: 30,
    valor: 120
  }, {
    codigo: '81000049',
    nome: 'Consulta odontológica de retorno',
    duracao: 20,
    valor: 80
  }, {
    codigo: '81000065',
    nome: 'Exame clínico odontológico',
    duracao: 30,
    valor: 100
  }, {
    codigo: '82000034',
    nome: 'Profilaxia/Limpeza dental',
    duracao: 45,
    valor: 150
  }, {
    codigo: '82000042',
    nome: 'Aplicação de flúor',
    duracao: 15,
    valor: 50
  }, {
    codigo: '82000050',
    nome: 'Raspagem e alisamento radicular (por arcada)',
    duracao: 60,
    valor: 200
  }, {
    codigo: '83000039',
    nome: 'Restauração em resina (1 face)',
    duracao: 30,
    valor: 120
  }, {
    codigo: '83000047',
    nome: 'Restauração em resina (2 faces)',
    duracao: 45,
    valor: 150
  }, {
    codigo: '83000055',
    nome: 'Restauração em resina (3 faces)',
    duracao: 60,
    valor: 180
  }, {
    codigo: '83000063',
    nome: 'Restauração em amálgama (1 face)',
    duracao: 30,
    valor: 80
  }, {
    codigo: '84000044',
    nome: 'Tratamento endodôntico (canal) - Unirradicular',
    duracao: 90,
    valor: 400
  }, {
    codigo: '84000052',
    nome: 'Tratamento endodôntico (canal) - Birradicular',
    duracao: 120,
    valor: 550
  }, {
    codigo: '84000060',
    nome: 'Tratamento endodôntico (canal) - Multirradicular',
    duracao: 150,
    valor: 700
  }, {
    codigo: '85000049',
    nome: 'Exodontia simples (extração)',
    duracao: 30,
    valor: 150
  }, {
    codigo: '85000057',
    nome: 'Exodontia de dente incluso',
    duracao: 60,
    valor: 350
  }, {
    codigo: '85000065',
    nome: 'Exodontia de siso',
    duracao: 60,
    valor: 400
  }, {
    codigo: '86000054',
    nome: 'Coroa em porcelana',
    duracao: 60,
    valor: 800
  }, {
    codigo: '86000062',
    nome: 'Prótese parcial removível',
    duracao: 60,
    valor: 600
  }, {
    codigo: '86000070',
    nome: 'Prótese total (dentadura)',
    duracao: 60,
    valor: 1200
  }, {
    codigo: '87000059',
    nome: 'Clareamento dental (consultório)',
    duracao: 90,
    valor: 500
  }]
};
export interface ProcedimentosPageProps {
  clinicaId?: string;
}
export function ProcedimentosPage({
  clinicaId
}: ProcedimentosPageProps) {
  const {
    success,
    error: toastError
  } = useToast();
  const {
    confirm,
    dialogs,
    removeDialog
  } = useDialog();
  const {
    procedimentos,
    loading,
    addProcedimento,
    updateProcedimento,
    deleteProcedimento
  } = useProcedimentos(clinicaId);
  // State declarations - only once
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [procedimentoEditando, setProcedimentoEditando] = useState<Procedimento | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoConsulta>('todos');
  const [busca, setBusca] = useState('');
  // Estado para importação
  const [importTipo, setImportTipo] = useState<TipoConsulta>('medica');
  const [procedimentosSelecionados, setProcedimentosSelecionados] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  // Verifica se clinicaId está disponível
  if (!clinicaId) {
    return <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Procedimentos</h1>
          <p className="text-gray-500 mt-1">
            Gerencie os procedimentos médicos e odontológicos disponíveis
          </p>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-amber-600 mb-2">⚠️ Selecione uma clínica</p>
            <p className="text-gray-500">
              Para gerenciar procedimentos, selecione uma clínica no menu
              superior.
            </p>
          </div>
        </Card>
      </div>;
  }
  // Filtra procedimentos
  const procedimentosFiltrados = procedimentos.filter((p) => {
    const matchTipo = filtroTipo === 'todos' || p.tipo === filtroTipo;
    const matchBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.descricao?.toLowerCase().includes(busca.toLowerCase());
    return matchTipo && matchBusca;
  });
  // Agrupa por tipo
  const procedimentosMedicos = procedimentosFiltrados.filter((p) => p.tipo === 'medica');
  const procedimentosOdonto = procedimentosFiltrados.filter((p) => p.tipo === 'odontologica');
  const handleSave = async (data: Omit<Procedimento, 'id' | 'criadoEm' | 'clinicaId'>) => {
    try {
      if (procedimentoEditando) {
        await updateProcedimento(procedimentoEditando.id, data);
        success('Procedimento Atualizado', 'As alterações foram salvas.');
      } else {
        await addProcedimento(data);
        success('Procedimento Cadastrado', 'Novo procedimento adicionado.');
      }
      setProcedimentoEditando(null);
    } catch (err: any) {
      toastError('Erro', err.message || 'Não foi possível salvar.');
    }
  };
  const handleEdit = (procedimento: Procedimento) => {
    setProcedimentoEditando(procedimento);
    setIsModalOpen(true);
  };
  const handleDelete = async (procedimento: Procedimento) => {
    const shouldDelete = await confirm('Excluir Procedimento', `Tem certeza que deseja excluir "${procedimento.nome}"? Esta ação não pode ser desfeita.`, 'Excluir', 'Cancelar');
    if (shouldDelete) {
      try {
        await deleteProcedimento(procedimento.id);
        success('Procedimento Excluído', 'O procedimento foi removido.');
      } catch (err: any) {
        toastError('Erro', err.message || 'Não foi possível excluir.');
      }
    }
  };
  const formatarValor = (valor?: number) => {
    if (!valor) return '-';
    return `R$ ${valor.toFixed(2).replace('.', ',')}`;
  };
  const formatarDuracao = (minutos: number) => {
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
  };
  // Funções de importação
  const toggleProcedimentoSelecionado = (codigo: string) => {
    const novoSet = new Set(procedimentosSelecionados);
    if (novoSet.has(codigo)) {
      novoSet.delete(codigo);
    } else {
      novoSet.add(codigo);
    }
    setProcedimentosSelecionados(novoSet);
  };
  const selecionarTodos = () => {
    const procedimentosDoTipo = PROCEDIMENTOS_TUSS[importTipo];
    const todosCodigos = new Set(procedimentosDoTipo.map((p) => p.codigo));
    setProcedimentosSelecionados(todosCodigos);
  };
  const deselecionarTodos = () => {
    setProcedimentosSelecionados(new Set());
  };
  const handleImportar = async () => {
    if (procedimentosSelecionados.size === 0) {
      toastError('Atenção', 'Selecione pelo menos um procedimento para importar.');
      return;
    }
    setImportando(true);
    let importados = 0;
    let erros = 0;
    let jaExistentes = 0;
    const procedimentosParaImportar = PROCEDIMENTOS_TUSS[importTipo].filter((p) => procedimentosSelecionados.has(p.codigo));
    // Cria uma cópia local dos nomes existentes para verificação
    const nomesExistentes = new Set(procedimentos.filter((p) => p.tipo === importTipo).map((p) => p.nome.toLowerCase()));
    for (const proc of procedimentosParaImportar) {
      // Verifica se já existe um procedimento com o mesmo nome
      if (nomesExistentes.has(proc.nome.toLowerCase())) {
        console.log(`⏭️ Procedimento já existe: ${proc.nome}`);
        jaExistentes++;
        continue;
      }
      try {
        await addProcedimento({
          nome: proc.nome,
          tipo: importTipo,
          duracao: proc.duracao,
          valor: proc.valor,
          descricao: `Código TUSS: ${proc.codigo}`,
          ativo: true
        });
        // Adiciona ao set local para evitar duplicatas no mesmo lote
        nomesExistentes.add(proc.nome.toLowerCase());
        importados++;
        console.log(`✅ Procedimento importado: ${proc.nome}`);
      } catch (err) {
        console.error(`❌ Erro ao importar ${proc.nome}:`, err);
        erros++;
      }
    }
    setImportando(false);
    setIsImportModalOpen(false);
    setProcedimentosSelecionados(new Set());
    if (importados > 0) {
      success('Importação Concluída', `${importados} procedimento(s) importado(s) com sucesso!${jaExistentes > 0 ? ` (${jaExistentes} já existiam)` : ''}${erros > 0 ? ` (${erros} erro(s))` : ''}`);
    } else if (jaExistentes > 0 && erros === 0) {
      success('Nada a Importar', `Todos os ${jaExistentes} procedimentos selecionados já existem no sistema.`);
    } else if (erros > 0) {
      toastError('Erro na Importação', `Não foi possível importar os procedimentos. ${erros} erro(s).`);
    }
  };
  if (loading) {
    return <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <span className="ml-3 text-gray-600">Carregando procedimentos...</span>
      </div>;
  }
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Procedimentos</h1>
          <p className="text-gray-500 mt-1">
            Gerencie os procedimentos médicos e odontológicos disponíveis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => {
          setImportTipo('medica');
          setProcedimentosSelecionados(new Set());
          setIsImportModalOpen(true);
        }}>
            
            <DownloadIcon className="w-5 h-5 mr-2" />
            Importar TUSS
          </Button>
          <Button onClick={() => {
          setProcedimentoEditando(null);
          setIsModalOpen(true);
        }}>
            
            <PlusIcon className="w-5 h-5 mr-2" />
            Novo Procedimento
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Busca */}
          <div className="flex-1">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar procedimento..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              
            </div>
          </div>

          {/* Filtro por tipo */}
          <div className="flex items-center gap-2">
            <FilterIcon className="w-5 h-5 text-gray-400" />
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as 'todos' | TipoConsulta)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
              
              <option value="todos">Todos os tipos</option>
              <option value="medica">🩺 Médicos</option>
              <option value="odontologica">🦷 Odontológicos</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
              <StethoscopeIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">Total</p>
              <p className="text-2xl font-bold text-blue-900">
                {procedimentos.length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-500 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🩺</span>
            </div>
            <div>
              <p className="text-sm text-teal-600 font-medium">Médicos</p>
              <p className="text-2xl font-bold text-teal-900">
                {procedimentos.filter((p) => p.tipo === 'medica').length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🦷</span>
            </div>
            <div>
              <p className="text-sm text-purple-600 font-medium">
                Odontológicos
              </p>
              <p className="text-2xl font-bold text-purple-900">
                {procedimentos.filter((p) => p.tipo === 'odontologica').length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Lista de Procedimentos */}
      {procedimentosFiltrados.length === 0 ? <Card>
          <div className="text-center py-12">
            <StethoscopeIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {busca || filtroTipo !== 'todos' ? 'Nenhum procedimento encontrado com os filtros aplicados' : 'Nenhum procedimento cadastrado'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => {
            setImportTipo('medica');
            setProcedimentosSelecionados(new Set());
            setIsImportModalOpen(true);
          }}>
              
                <DownloadIcon className="w-4 h-4 mr-2" />
                Importar da Tabela TUSS
              </Button>
              <Button onClick={() => {
            setProcedimentoEditando(null);
            setIsModalOpen(true);
          }}>
              
                <PlusIcon className="w-4 h-4 mr-2" />
                Cadastrar Manualmente
              </Button>
            </div>
          </div>
        </Card> : <div className="space-y-6">
          {/* Procedimentos Médicos */}
          {(filtroTipo === 'todos' || filtroTipo === 'medica') && procedimentosMedicos.length > 0 && <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🩺</span>
                  Procedimentos Médicos ({procedimentosMedicos.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {procedimentosMedicos.map((proc) => <ProcedimentoCard key={proc.id} procedimento={proc} onEdit={handleEdit} onDelete={handleDelete} formatarValor={formatarValor} formatarDuracao={formatarDuracao} />)}
                </div>
              </div>}

          {/* Procedimentos Odontológicos */}
          {(filtroTipo === 'todos' || filtroTipo === 'odontologica') && procedimentosOdonto.length > 0 && <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🦷</span>
                  Procedimentos Odontológicos ({procedimentosOdonto.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {procedimentosOdonto.map((proc) => <ProcedimentoCard key={proc.id} procedimento={proc} onEdit={handleEdit} onDelete={handleDelete} formatarValor={formatarValor} formatarDuracao={formatarDuracao} />)}
                </div>
              </div>}
        </div>}

      {/* Modal de Formulário */}
      <ProcedimentoForm isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setProcedimentoEditando(null);
    }} onSave={handleSave} procedimento={procedimentoEditando} />
      

      {/* Modal de Importação TUSS */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Importar Procedimentos TUSS" size="lg" footer={<>
            <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImportar} disabled={importando || procedimentosSelecionados.size === 0}>
            
              {importando ? <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importando...
                </> : <>
                  <DownloadIcon className="w-4 h-4 mr-2" />
                  Importar {procedimentosSelecionados.size} Selecionado(s)
                </>}
            </Button>
          </>}>
        
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>TUSS</strong> (Terminologia Unificada da Saúde
              Suplementar) é o padrão brasileiro para nomenclatura de
              procedimentos médicos e odontológicos. Selecione os procedimentos
              que deseja importar para sua clínica.
            </p>
          </div>

          {/* Seletor de Tipo */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Tipo:</label>
            <div className="flex gap-2">
              <button onClick={() => {
              setImportTipo('medica');
              setProcedimentosSelecionados(new Set());
            }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importTipo === 'medica' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                
                🩺 Médicos
              </button>
              <button onClick={() => {
              setImportTipo('odontologica');
              setProcedimentosSelecionados(new Set());
            }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importTipo === 'odontologica' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                
                🦷 Odontológicos
              </button>
            </div>
          </div>

          {/* Ações em massa */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {procedimentosSelecionados.size} de{' '}
              {PROCEDIMENTOS_TUSS[importTipo].length} selecionados
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selecionarTodos}>
                Selecionar Todos
              </Button>
              <Button variant="ghost" size="sm" onClick={deselecionarTodos}>
                Limpar Seleção
              </Button>
            </div>
          </div>

          {/* Lista de Procedimentos */}
          <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {PROCEDIMENTOS_TUSS[importTipo].map((proc) => {
            const selecionado = procedimentosSelecionados.has(proc.codigo);
            const jaExiste = procedimentos.some((p) => p.nome.toLowerCase() === proc.nome.toLowerCase() && p.tipo === importTipo);
            return <div key={proc.codigo} onClick={() => !jaExiste && toggleProcedimentoSelecionado(proc.codigo)} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${jaExiste ? 'bg-gray-50 opacity-60 cursor-not-allowed' : selecionado ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                  
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${jaExiste ? 'border-gray-300 bg-gray-200' : selecionado ? 'border-teal-600 bg-teal-600' : 'border-gray-300'}`}>
                    
                    {(selecionado || jaExiste) && <CheckIcon className={`w-3 h-3 ${jaExiste ? 'text-gray-500' : 'text-white'}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {proc.nome}
                    </p>
                    <p className="text-xs text-gray-500">
                      Código: {proc.codigo} • {proc.duracao} min • R${' '}
                      {proc.valor.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  {jaExiste && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                      Já existe
                    </span>}
                </div>;
          })}
          </div>
        </div>
      </Modal>

      {/* DialogContainer para confirmações */}
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />
    </div>;
}
// Componente de Card do Procedimento
function ProcedimentoCard({
  procedimento,
  onEdit,
  onDelete,
  formatarValor,
  formatarDuracao






}: {procedimento: Procedimento;onEdit: (p: Procedimento) => void;onDelete: (p: Procedimento) => void;formatarValor: (v?: number) => string;formatarDuracao: (m: number) => string;}) {
  return <Card className={`hover:shadow-md transition-shadow ${!procedimento.ativo ? 'opacity-60 bg-gray-50' : ''}`}>
      
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{procedimento.nome}</h3>
            {!procedimento.ativo && <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                Inativo
              </span>}
          </div>
          {procedimento.descricao && <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {procedimento.descricao}
            </p>}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
        <div className="flex items-center gap-1">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          <span>{formatarDuracao(procedimento.duracao)}</span>
        </div>
        {procedimento.valor && <div className="flex items-center gap-1">
            <DollarSignIcon className="w-4 h-4 text-gray-400" />
            <span>{formatarValor(procedimento.valor)}</span>
          </div>}
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
        <Button size="sm" variant="ghost" onClick={() => onEdit(procedimento)} className="text-blue-600 hover:bg-blue-50">
          
          <EditIcon className="w-4 h-4 mr-1" />
          Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(procedimento)} className="text-red-600 hover:bg-red-50">
          
          <Trash2Icon className="w-4 h-4 mr-1" />
          Excluir
        </Button>
      </div>
    </Card>;
}