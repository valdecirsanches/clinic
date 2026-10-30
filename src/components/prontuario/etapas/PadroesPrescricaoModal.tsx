import React, { useEffect, useState } from 'react';
import { XIcon, SearchIcon, PlusIcon, SaveIcon, TrashIcon, EditIcon, CheckIcon, TagIcon, BookmarkIcon, AlertCircleIcon, Loader2Icon, PillIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Swal } from '../../ui/SweetAlert';
import { API_BASE_URL } from '../../../config/api';
import { paraTextoSimples } from '../../../utils/htmlTexto';
interface MedicamentoItem {
  id: string;
  remedioId?: string;
  nome: string;
  dosagem: string;
  quantidade: string;
  unidade: string;
  posologia: string;
  tipo?: 'medicamento' | 'formula';
}
interface PadraoPrescricao {
  id: string;
  profissionalId?: string;
  nome: string;
  descricao: string;
  controleEspecial: boolean;
  medicamentos: MedicamentoItem[];
  generico: string;
  criadoEm: string;
}
interface PrescricaoData {
  controleEspecial: boolean;
  data: string;
  descricao: string;
  generico: string;
  medicamentos: MedicamentoItem[];
}
interface PadroesPrescricaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (data: Partial<PrescricaoData>) => void;
  currentData?: PrescricaoData;
  clinicaId?: string;
  profissionalId?: string;
}
const ITEMS_PER_PAGE = 6;
export function PadroesPrescricaoModal({
  isOpen,
  onClose,
  onSelect,
  currentData,
  clinicaId = 'default',
  profissionalId
}: PadroesPrescricaoModalProps) {
  const [padroes, setPadroes] = useState<PadraoPrescricao[]>([]);
  const [search, setSearch] = useState('');
  const [novoPadraoNome, setNovoPadraoNome] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Busca padrões de prescrição
  useEffect(() => {
    if (!isOpen) return;
    if (!profissionalId) {
      console.warn('⚠️ [PadroesPrescricao] profissionalId não informado - buscando TODOS os padrões');
    }
    const carregarPadroes = async () => {
      setLoading(true);
      setErro(null);
      try {
        const url = profissionalId ? `${API_BASE_URL}/api/padroes-prescricoes?clinicaId=${clinicaId}&profissionalId=${profissionalId}` : `${API_BASE_URL}/api/padroes-prescricoes?clinicaId=${clinicaId}`;
        console.log(`🔍 [PadroesPrescricao] Buscando padrões do profissional ${profissionalId}...`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setPadroes(data);
          console.log(`✅ [PadroesPrescricao] ${data.length} padrões carregados`);
        } else if (response.status === 404) {
          // Endpoint não existe ainda - usa localStorage como fallback
          console.warn('⚠️ [PadroesPrescricao] Endpoint não existe, usando localStorage');
          const key = `padroes_prescricao_${clinicaId}_${profissionalId || 'global'}`;
          const stored = localStorage.getItem(key);
          if (stored) {
            setPadroes(JSON.parse(stored));
          }
        } else {
          const errorText = await response.text();
          console.error(`❌ [PadroesPrescricao] Erro HTTP ${response.status}: ${errorText}`);
          // Fallback para localStorage
          const key = `padroes_prescricao_${clinicaId}_${profissionalId || 'global'}`;
          const stored = localStorage.getItem(key);
          if (stored) {
            setPadroes(JSON.parse(stored));
          }
        }
      } catch (err: any) {
        console.error('❌ [PadroesPrescricao] Erro de conexão:', err);
        // Fallback para localStorage
        const key = `padroes_prescricao_${clinicaId}_${profissionalId || 'global'}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          setPadroes(JSON.parse(stored));
        }
      } finally {
        setLoading(false);
      }
    };
    carregarPadroes();
  }, [isOpen, clinicaId, profissionalId]);
  // Salva no localStorage como backup
  const salvarLocalStorage = (novosPadroes: PadraoPrescricao[]) => {
    const key = `padroes_prescricao_${clinicaId}_${profissionalId || 'global'}`;
    localStorage.setItem(key, JSON.stringify(novosPadroes));
  };
  const handleSaveCurrent = async () => {
    if (!novoPadraoNome.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Nome obrigatório',
        text: 'Digite um nome para o novo padrão',
        timer: 2000,
        showConfirmButton: false
      });
      return;
    }
    if (!currentData) return;
    setSaving(true);
    try {
      const newPattern: PadraoPrescricao = {
        id: `padrao_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        profissionalId: profissionalId || undefined,
        nome: novoPadraoNome,
        descricao: currentData.descricao,
        controleEspecial: currentData.controleEspecial,
        medicamentos: currentData.medicamentos,
        generico: currentData.generico,
        criadoEm: new Date().toISOString()
      };
      // Tenta salvar na API
      try {
        const response = await fetch(`${API_BASE_URL}/api/padroes-prescricoes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            profissionalId: profissionalId || null,
            nome: novoPadraoNome,
            descricao: currentData.descricao,
            controleEspecial: currentData.controleEspecial,
            medicamentos: currentData.medicamentos,
            generico: currentData.generico
          })
        });
        if (response.ok) {
          const result = await response.json();
          newPattern.id = result.id;
        }
      } catch {


        // API não disponível, continua com localStorage
      }const novosPadroes = [newPattern, ...padroes];
      setPadroes(novosPadroes);
      salvarLocalStorage(novosPadroes);
      setNovoPadraoNome('');
      Swal.fire({
        icon: 'success',
        title: 'Padrão salvo!',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('Erro ao salvar padrão:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erro ao salvar padrão',
        timer: 2000,
        showConfirmButton: false
      });
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Excluir padrão?',
      text: 'Esta ação não pode ser desfeita',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
      try {
        // Tenta excluir na API
        try {
          await fetch(`${API_BASE_URL}/api/padroes-prescricoes/${id}?clinicaId=${clinicaId}`, {
            method: 'DELETE'
          });
        } catch {


          // API não disponível
        }const novosPadroes = padroes.filter((p) => p.id !== id);
        setPadroes(novosPadroes);
        salvarLocalStorage(novosPadroes);
      } catch (err) {
        console.error('Erro ao excluir padrão:', err);
      }
    }
  };
  const startEdit = (padrao: PadraoPrescricao) => {
    setEditingId(padrao.id);
    setEditName(padrao.nome);
  };
  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      // Tenta atualizar na API
      try {
        await fetch(`${API_BASE_URL}/api/padroes-prescricoes/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            nome: editName
          })
        });
      } catch {


        // API não disponível
      }const novosPadroes = padroes.map((p) => p.id === editingId ? {
        ...p,
        nome: editName
      } : p);
      setPadroes(novosPadroes);
      salvarLocalStorage(novosPadroes);
    } catch (err) {
      console.error('Erro ao renomear padrão:', err);
    }
    setEditingId(null);
    setEditName('');
  };
  const filteredPadroes = padroes.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()) || (p.descricao || '').toLowerCase().includes(search.toLowerCase()) || (p.medicamentos || []).some((m) => m.nome.toLowerCase().includes(search.toLowerCase())));
  // ⭐ Paginação
  const totalPages = Math.max(1, Math.ceil(filteredPadroes.length / ITEMS_PER_PAGE));
  const paginatedPadroes = filteredPadroes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  // Reset página quando busca muda
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="bg-teal-100 p-2 rounded-lg">
              <TagIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Padrões de Prescrição
              </h3>
              <p className="text-xs text-gray-500">
                Gerencie e utilize modelos de prescrições frequentes
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Aviso de erro */}
        {erro && <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Erro ao carregar padrões</p>
              <p className="text-xs mt-1">{erro}</p>
            </div>
          </div>}

        {/* Search & Save New */}
        <div className="p-4 border-b border-gray-100 space-y-4 bg-white">
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar padrões por nome ou medicamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all" />
            
          </div>

          {/* Save Current */}
          {currentData && (currentData.medicamentos?.length > 0 || currentData.generico) && <div className="flex gap-2 items-center bg-teal-50 p-3 rounded-lg border border-teal-100">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-teal-800 mb-1">
                    Salvar prescrição atual como novo padrão
                  </label>
                  <input type="text" placeholder="Nome do novo padrão (ex: Hipertensão Leve)" value={novoPadraoNome} onChange={(e) => setNovoPadraoNome(e.target.value)} className="w-full px-3 py-1.5 border border-teal-200 rounded text-sm focus:outline-none focus:border-teal-500" />
              
                </div>
                <button onClick={handleSaveCurrent} disabled={saving} className="self-end px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50">
              
                  {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
                  Salvar
                </button>
              </div>}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
          {loading ? <div className="text-center py-12">
              <Loader2Icon className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Carregando padrões...</p>
            </div> : filteredPadroes.length === 0 ? <div className="text-center py-12 text-gray-500">
              <BookmarkIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>
                {search ? 'Nenhum padrão encontrado para esta busca' : 'Nenhum padrão cadastrado'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? 'Tente outro termo de busca' : 'Preencha uma prescrição e salve como padrão'}
              </p>
            </div> : paginatedPadroes.map((padrao) => <div key={padrao.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all group relative">
            
                <div className="flex justify-between items-start mb-2">
                  {editingId === padrao.id ? <div className="flex items-center gap-2 flex-1 mr-4">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                
                      <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Salvar nome">
                  
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Cancelar">
                  
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div> : <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        {padrao.nome}
                        {padrao.controleEspecial && <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100">
                            Controle Especial
                          </span>}
                        {padrao.profissionalId && <span className="text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-100">
                            Meu padrão
                          </span>}
                        {!padrao.profissionalId && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
                            Global
                          </span>}
                      </h4>
                    </div>}

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!editingId && <>
                        <button onClick={() => startEdit(padrao)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Renomear">
                    
                          <EditIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(padrao.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Excluir">
                    
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </>}
                  </div>
                </div>

                <div className="text-sm text-gray-600 mb-3 space-y-1">
                  {padrao.descricao && <p className="line-clamp-1">
                      <span className="font-medium text-gray-700">Desc:</span>{' '}
                      {paraTextoSimples(padrao.descricao)}
                    </p>}
                  {padrao.medicamentos && padrao.medicamentos.length > 0 && <div className="flex flex-wrap gap-1 mt-2">
                      {padrao.medicamentos.slice(0, 4).map((med, i) => <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                  
                          <PillIcon className="w-3 h-3" />
                          {med.nome}
                          {med.dosagem && ` ${med.dosagem}`}
                        </span>)}
                      {padrao.medicamentos.length > 4 && <span className="text-xs text-gray-400">
                          +{padrao.medicamentos.length - 4} mais
                        </span>}
                    </div>}
                  {padrao.generico && !padrao.medicamentos?.length && <p className="line-clamp-2 text-gray-500 italic">
                      "{padrao.generico}"
                    </p>}
                </div>

                <button onClick={() => {
            onSelect({
              descricao: padrao.descricao,
              controleEspecial: padrao.controleEspecial,
              medicamentos: padrao.medicamentos || [],
              generico: padrao.generico
            });
            onClose();
          }} className="w-full py-2 bg-gray-50 hover:bg-teal-50 text-gray-700 hover:text-teal-700 border border-gray-200 hover:border-teal-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
              
                  <CheckIcon className="w-4 h-4" />
                  Usar este padrão
                </button>
              </div>)}
        </div>

        {/* Footer with Pagination */}
        <div className="p-3 bg-gray-50 border-t border-gray-100">
          {/* Pagination Controls */}
          {filteredPadroes.length > ITEMS_PER_PAGE && <div className="flex items-center justify-center gap-2 mb-2">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 hover:bg-white hover:border-teal-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              
                <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({
              length: totalPages
            }, (_, i) => i + 1).map((page) => <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${page === currentPage ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:border-teal-300 border border-transparent hover:border-gray-200'}`}>
                
                    {page}
                  </button>)}
              </div>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 hover:bg-white hover:border-teal-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              
                <ChevronRightIcon className="w-4 h-4 text-gray-600" />
              </button>
            </div>}
          <div className="text-center text-xs text-gray-500">
            {filteredPadroes.length} padrão(ões) disponível(is)
            {filteredPadroes.length > ITEMS_PER_PAGE && <span className="ml-1">
                — Página {currentPage} de {totalPages}
              </span>}
            {profissionalId && <span className="block mt-1 text-[10px] text-gray-400 font-mono">
                profissionalId: {profissionalId.substring(0, 8)}...
              </span>}
            {!profissionalId && <span className="block mt-1 text-[10px] text-amber-500 font-mono">
                ⚠️ Sem profissional — mostrando padrões globais
              </span>}
          </div>
        </div>
      </div>
    </div>;
}