import React, { useEffect, useState } from 'react';
import { XIcon, SearchIcon, PlusIcon, SaveIcon, TrashIcon, EditIcon, CheckIcon, TagIcon, BookmarkIcon, AlertCircleIcon, Loader2Icon, FileTextIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Swal } from '../../ui/SweetAlert';
import { API_BASE_URL } from '../../../config/api';
import { paraTextoSimples } from '../../../utils/htmlTexto';
interface PadraoRelatorio {
  id: string;
  profissionalId?: string;
  nome: string;
  titulo?: string;
  tipo?: string;
  destinatario?: string;
  conteudo?: string;
  cid10?: string;
  criadoEm: string;
}
interface RelatorioData {
  titulo: string;
  tipo: string;
  destinatario: string;
  data: string;
  conteudo: string;
  cid10: string;
}
interface PadroesRelatorioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (data: Partial<RelatorioData>) => void;
  currentData?: RelatorioData;
  clinicaId?: string;
  profissionalId?: string;
}
export function PadroesRelatorioModal({
  isOpen,
  onClose,
  onSelect,
  currentData,
  clinicaId = 'default',
  profissionalId
}: PadroesRelatorioModalProps) {
  const [padroes, setPadroes] = useState<PadraoRelatorio[]>([]);
  const [search, setSearch] = useState('');
  const [novoPadraoNome, setNovoPadraoNome] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  useEffect(() => {
    if (!isOpen) return;
    // ⭐ DEBUG: Log detalhado para diagnosticar problema
    console.log('🔍 [PadroesRelatorio] === ABRINDO MODAL ===');
    console.log('🔍 [PadroesRelatorio] clinicaId recebido:', clinicaId);
    console.log('🔍 [PadroesRelatorio] profissionalId recebido:', profissionalId);
    if (!profissionalId) {
      console.warn('⚠️ [PadroesRelatorio] profissionalId não informado - buscando TODOS os padrões');
    }
    const carregarPadroes = async () => {
      setLoading(true);
      setErro(null);
      try {
        const url = profissionalId ? `${API_BASE_URL}/api/padroes-relatorios?clinicaId=${clinicaId}&profissionalId=${profissionalId}` : `${API_BASE_URL}/api/padroes-relatorios?clinicaId=${clinicaId}`;
        console.log('🔍 [PadroesRelatorio] URL da requisição:', url);
        const response = await fetch(url);
        console.log('🔍 [PadroesRelatorio] Status HTTP:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ [PadroesRelatorio] ${data.length} padrões recebidos`);
          if (data.length > 0) {
            console.log('✅ [PadroesRelatorio] Primeiro padrão:', data[0]?.nome, '| profissionalId:', data[0]?.profissionalId);
          }
          setPadroes(data);
        } else {
          const errorText = await response.text();
          console.error(`❌ [PadroesRelatorio] Erro HTTP ${response.status}: ${errorText}`);
          setErro(`Erro ao buscar padrões: HTTP ${response.status}`);
        }
      } catch (err: any) {
        console.error('❌ [PadroesRelatorio] Erro de conexão:', err);
        setErro(`Erro de conexão: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    carregarPadroes();
  }, [isOpen, clinicaId, profissionalId]);
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
      const response = await fetch(`${API_BASE_URL}/api/padroes-relatorios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          profissionalId: profissionalId || null,
          nome: novoPadraoNome,
          titulo: currentData.titulo,
          tipo: currentData.tipo,
          destinatario: currentData.destinatario,
          conteudo: currentData.conteudo,
          cid10: currentData.cid10
        })
      });
      if (response.ok) {
        const result = await response.json();
        const newPattern: PadraoRelatorio = {
          id: result.id,
          profissionalId: profissionalId || undefined,
          nome: novoPadraoNome,
          titulo: currentData.titulo,
          tipo: currentData.tipo,
          destinatario: currentData.destinatario,
          conteudo: currentData.conteudo,
          cid10: currentData.cid10,
          criadoEm: new Date().toISOString()
        };
        setPadroes([newPattern, ...padroes]);
        setNovoPadraoNome('');
        Swal.fire({
          icon: 'success',
          title: 'Padrão salvo!',
          timer: 1500,
          showConfirmButton: false
        });
      }
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
        const response = await fetch(`${API_BASE_URL}/api/padroes-relatorios/${id}?clinicaId=${clinicaId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          setPadroes(padroes.filter((p) => p.id !== id));
          Swal.fire({
            icon: 'success',
            title: 'Excluído!',
            timer: 1500,
            showConfirmButton: false
          });
        }
      } catch (err) {
        console.error('Erro ao excluir padrão:', err);
      }
    }
  };
  const handleUpdateName = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/padroes-relatorios/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nome: editName
        })
      });
      if (response.ok) {
        setPadroes(padroes.map((p) => p.id === id ? {
          ...p,
          nome: editName
        } : p));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Erro ao atualizar nome:', err);
    }
  };
  const filteredPadroes = padroes.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()) || p.conteudo && p.conteudo.toLowerCase().includes(search.toLowerCase()) || p.titulo && p.titulo.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filteredPadroes.length / ITEMS_PER_PAGE);
  const paginatedPadroes = filteredPadroes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <BookmarkIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">
                Padrões de Relatório
              </h2>
              <p className="text-sm text-gray-500">
                {padroes.length > 0 ? `${padroes.length} padrões carregados` : 'Salve e reutilize textos frequentes'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-5 gap-6">
          {/* Salvar atual */}
          {currentData && (currentData.conteudo || currentData.titulo) && <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
                <SaveIcon className="w-4 h-4" />
                Salvar texto atual como novo padrão
              </h3>
              <div className="flex gap-3">
                <input type="text" value={novoPadraoNome} onChange={(e) => setNovoPadraoNome(e.target.value)} placeholder="Ex: Laudo INSS Padrão, Relatório de Alta..." className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveCurrent();
            }} />
              
                <button onClick={handleSaveCurrent} disabled={saving || !novoPadraoNome.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                
                  {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
                  Salvar Padrão
                </button>
              </div>
            </div>}

          {/* Lista de Padrões */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="relative mb-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar padrões salvos..." className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              
            </div>

            {erro && <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg flex items-center gap-2">
                <AlertCircleIcon className="w-4 h-4" />
                {erro}
              </div>}

            <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
              {loading ? <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <Loader2Icon className="w-8 h-8 animate-spin mb-2" />
                  <p className="text-sm">Carregando padrões...</p>
                </div> : filteredPadroes.length === 0 ? <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl">
                  <TagIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">
                    Nenhum padrão encontrado
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {search ? 'Tente buscar com outros termos' : 'Salve seu primeiro padrão usando o formulário acima'}
                  </p>
                </div> : paginatedPadroes.map((padrao) => <div key={padrao.id} className="group flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 hover:border-teal-300 hover:bg-teal-50/30 transition-all bg-white cursor-pointer" onClick={() => {
              onSelect({
                titulo: padrao.titulo || '',
                tipo: padrao.tipo || '',
                destinatario: padrao.destinatario || '',
                conteudo: padrao.conteudo || '',
                cid10: padrao.cid10 || ''
              });
              onClose();
            }}>
                
                    <div className="flex-1 min-w-0">
                      {editingId === padrao.id ? <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    
                          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="border border-teal-300 rounded px-2 py-1 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-full" autoFocus onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateName(padrao.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }} />
                    
                          <button onClick={() => handleUpdateName(padrao.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                      
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                      
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div> : <>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-800 text-sm truncate">
                              {padrao.nome}
                            </h4>
                            {padrao.cid10 && <span className="px-1.5 py-0.5 bg-teal-100 text-teal-800 text-[10px] font-bold rounded flex-shrink-0">
                                {padrao.cid10.split(',')[0].trim()}
                                {padrao.cid10.includes(',') ? '...' : ''}
                              </span>}
                          </div>
                          {padrao.conteudo && <p className="text-xs text-gray-400 truncate mt-0.5">
                              {/* ⭐ Sem tags na prévia: o conteúdo pode ser HTML do editor */}
                              {paraTextoSimples(padrao.conteudo).substring(0, 80)}
                            </p>}
                        </>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  
                      <button onClick={() => {
                  setEditingId(padrao.id);
                  setEditName(padrao.nome);
                }} className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Renomear">
                    
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(padrao.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Excluir">
                    
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>)}
            </div>

            {/* Paginação */}
            {!loading && filteredPadroes.length > ITEMS_PER_PAGE && <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredPadroes.length)}{' '}
                  de {filteredPadroes.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium text-gray-700 px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>}
          </div>
        </div>
      </div>
    </div>;
}