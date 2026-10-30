import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { PlusIcon, TrashIcon, SearchIcon, Loader2Icon, PillIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface Medicamento {
  id: string;
  nome: string;
  dosagem: string;
  frequencia: string;
  duracao: string;
  observacoes: string;
}
interface MedicamentoAPI {
  id: string;
  nome: string;
  principioAtivo: string;
  concentracao: string;
  formaFarmaceutica: string;
  fabricante: string;
  tarja: string;
}
interface PrescricaoPropriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prescricao: string) => void;
  onWarning?: (message: string) => void;
}
export function PrescricaoPropriaModal({
  isOpen,
  onClose,
  onSave,
  onWarning
}: PrescricaoPropriaModalProps) {
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [busca, setBusca] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validationError, setValidationError] = useState('');
  // ⭐ NOVO: Estados para busca na API
  const [medicamentosAPI, setMedicamentosAPI] = useState<MedicamentoAPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalMedicamentos, setTotalMedicamentos] = useState(0);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);
  // ⭐ Carrega estatísticas ao abrir
  useEffect(() => {
    if (isOpen) {
      fetch(`${API_BASE_URL}/api/medicamentos/estatisticas`).then((r) => r.ok ? r.json() : null).then((data) => {
        if (data) setTotalMedicamentos(data.total);
      }).catch(() => {});
    }
  }, [isOpen]);
  // ⭐ Busca medicamentos na API com debounce
  const buscarMedicamentosAPI = useCallback(async (termo: string) => {
    if (!termo || termo.length < 2) {
      setMedicamentosAPI([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: termo,
        limit: '20',
        page: '1'
      });
      const response = await fetch(`${API_BASE_URL}/api/medicamentos?${params}`);
      if (response.ok) {
        const result = await response.json();
        console.log('Resposta API medicamentos:', result); // Debug
        // ⭐ CORREÇÃO: Verifica diferentes estruturas de resposta
        if (Array.isArray(result)) {
          setMedicamentosAPI(result);
        } else if (result.data && Array.isArray(result.data)) {
          setMedicamentosAPI(result.data);
        } else if (result.medicamentos && Array.isArray(result.medicamentos)) {
          setMedicamentosAPI(result.medicamentos);
        } else {
          console.warn('Estrutura de resposta não reconhecida:', result);
          setMedicamentosAPI([]);
        }
      } else {
        console.error('Erro na resposta:', response.status);
        setMedicamentosAPI([]);
      }
    } catch (err) {
      console.error('Erro ao buscar medicamentos:', err);
      setMedicamentosAPI([]);
    } finally {
      setLoading(false);
    }
  }, []);
  // Debounce da busca
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (busca.length >= 2) {
      debounceTimer.current = setTimeout(() => {
        buscarMedicamentosAPI(busca);
      }, 300);
    } else {
      setMedicamentosAPI([]);
    }
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [busca, buscarMedicamentosAPI]);
  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const handleAdicionarMedicamento = (medicamentoAPI?: MedicamentoAPI) => {
    const nome = medicamentoAPI ? `${medicamentoAPI.nome}` : busca;
    if (!nome.trim()) return;
    // ⭐ CORREÇÃO: Previne event bubbling e fecha dropdown
    setShowSuggestions(false);
    setMedicamentosAPI([]);
    const novoMedicamento: Medicamento = {
      id: `med-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nome,
      dosagem: '',
      frequencia: '',
      duracao: '',
      observacoes: medicamentoAPI ? `${medicamentoAPI.formaFarmaceutica || ''} ${medicamentoAPI.fabricante ? '- ' + medicamentoAPI.fabricante : ''}`.trim() : ''
    };
    // ⭐ CORREÇÃO: Usa callback para garantir estado atualizado
    setMedicamentos((prev) => [...prev, novoMedicamento]);
    setBusca('');
    setValidationError('');
    console.log('✅ Medicamento adicionado:', novoMedicamento.nome);
  };
  const handleRemoverMedicamento = (id: string) => {
    setMedicamentos(medicamentos.filter((m) => m.id !== id));
  };
  const handleUpdateMedicamento = (id: string, field: keyof Medicamento, value: string) => {
    setMedicamentos(medicamentos.map((m) => m.id === id ? {
      ...m,
      [field]: value
    } : m));
  };
  const handleSalvar = () => {
    if (medicamentos.length === 0) {
      setValidationError('Adicione pelo menos um medicamento');
      if (onWarning) {
        onWarning('Adicione pelo menos um medicamento');
      }
      return;
    }
    // Formata a prescrição
    const prescricaoTexto = medicamentos.map((med, index) => {
      return `${index + 1}. ${med.nome}
   Dosagem: ${med.dosagem || 'Não especificada'}
   Frequência: ${med.frequencia || 'Não especificada'}
   Duração: ${med.duracao || 'Não especificada'}
   ${med.observacoes ? `Observações: ${med.observacoes}` : ''}
`;
    }).join('\n');
    onSave(prescricaoTexto);
    setMedicamentos([]);
    setValidationError('');
    onClose();
  };
  const getTarjaColor = (tarja: string) => {
    const colors: Record<string, string> = {
      vermelha: 'bg-red-100 text-red-700 border-red-200',
      preta: 'bg-gray-900 text-white border-gray-900',
      amarela: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      sem_tarja: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return colors[tarja] || colors.sem_tarja;
  };
  const getTarjaLabel = (tarja: string) => {
    const labels: Record<string, string> = {
      vermelha: 'Tarja Vermelha',
      preta: 'Tarja Preta',
      amarela: 'Tarja Amarela',
      sem_tarja: 'Sem Tarja'
    };
    return labels[tarja] || 'Sem Tarja';
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="Prescrição Própria" size="large" footer={<>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={medicamentos.length === 0}>
            Adicionar à Prescrição
          </Button>
        </>}>
      
      <div className="space-y-6">
        {/* Mensagem de validação */}
        {validationError && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">⚠️ {validationError}</p>
          </div>}

        {/* ⭐ Info sobre base de medicamentos */}
        {totalMedicamentos > 0 && <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <PillIcon className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Base com {totalMedicamentos.toLocaleString()} medicamentos
              </p>
              <p className="text-xs text-blue-700">
                Digite pelo menos 2 caracteres para buscar
              </p>
            </div>
          </div>}

        {/* Busca de Medicamentos */}
        <div ref={containerRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Buscar Medicamento
          </label>
          <div className="relative">
            <div className="relative">
              {loading ? <Loader2Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-teal-500 animate-spin" /> : <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}
              <input type="text" value={busca} onChange={(e) => {
              setBusca(e.target.value);
              setShowSuggestions(true);
              setValidationError('');
            }} onFocus={() => setShowSuggestions(true)} placeholder="Digite o nome do medicamento (mín. 2 caracteres)..." className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              
            </div>

            {/* ⭐ Dropdown de Sugestões Melhorado */}
            {showSuggestions && busca.length >= 2 && <div className="absolute z-50 w-full mt-2 bg-white border-2 border-teal-300 rounded-lg shadow-2xl max-h-80 overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-teal-50 border-b border-teal-200 px-4 py-2">
                  <p className="text-xs font-semibold text-teal-900">
                    🔍 Buscando:{' '}
                    <span className="text-teal-600">"{busca}"</span>
                  </p>
                  {!loading && medicamentosAPI.length > 0 && <p className="text-xs text-teal-700">
                      {medicamentosAPI.length} resultado(s)
                    </p>}
                </div>

                {loading ? <div className="p-8 text-center">
                    <Loader2Icon className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">
                      Buscando medicamentos...
                    </p>
                  </div> : medicamentosAPI.length === 0 ? <div className="p-6 text-center">
                    <div className="text-4xl mb-3">💊</div>
                    <p className="text-gray-700 font-medium mb-2">
                      Nenhum medicamento encontrado
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      Você pode adicionar "{busca}" manualmente
                    </p>
                    <Button type="button" size="sm" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAdicionarMedicamento();
              }}>
                  
                      <PlusIcon className="w-4 h-4 mr-1" />
                      Adicionar "{busca}"
                    </Button>
                  </div> : <div className="py-1">
                    {medicamentosAPI.map((med) => <button key={med.id} type="button" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAdicionarMedicamento(med);
              }} className="w-full px-4 py-3 text-left hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition-colors">
                  
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <PillIcon className="w-5 h-5 text-teal-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {med.nome}
                            </p>
                            <p className="text-sm text-gray-600 truncate">
                              {med.principioAtivo} • {med.formaFarmaceutica}
                            </p>
                            <p className="text-xs text-gray-500">
                              {med.fabricante}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full border ${getTarjaColor(med.tarja)}`}>
                      
                            {getTarjaLabel(med.tarja)}
                          </span>
                        </div>
                      </button>)}
                  </div>}
              </div>}
          </div>

          {busca && busca.length < 2 && <p className="text-xs text-gray-500 mt-2">
              Digite mais {2 - busca.length} caractere(s) para buscar
            </p>}
        </div>

        {/* Lista de Medicamentos Adicionados */}
        {medicamentos.length > 0 && <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <PillIcon className="w-4 h-4 text-teal-600" />
              Medicamentos Adicionados ({medicamentos.length})
            </h3>

            {medicamentos.map((med, index) => <div key={med.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
            
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {index + 1}. {med.nome}
                    </p>
                  </div>
                  <button type="button" onClick={() => handleRemoverMedicamento(med.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors">
                
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Dosagem" value={med.dosagem} onChange={(e) => handleUpdateMedicamento(med.id, 'dosagem', e.target.value)} placeholder="Ex: 1 comprimido" />
              
                  <Input label="Frequência" value={med.frequencia} onChange={(e) => handleUpdateMedicamento(med.id, 'frequencia', e.target.value)} placeholder="Ex: 3x ao dia" />
              
                </div>

                <Input label="Duração" value={med.duracao} onChange={(e) => handleUpdateMedicamento(med.id, 'duracao', e.target.value)} placeholder="Ex: 7 dias" />
            

                <Input label="Observações (opcional)" value={med.observacoes} onChange={(e) => handleUpdateMedicamento(med.id, 'observacoes', e.target.value)} placeholder="Ex: Tomar após as refeições" />
            
              </div>)}
          </div>}

        {medicamentos.length === 0 && <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <PillIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">
              Nenhum medicamento adicionado
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Use a busca acima para encontrar e adicionar medicamentos
            </p>
          </div>}
      </div>
    </Modal>;
}