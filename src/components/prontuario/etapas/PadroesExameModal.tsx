import React, { useEffect, useState } from 'react';
import { XIcon, SearchIcon, PlusIcon, SaveIcon, TrashIcon, EditIcon, CheckIcon, TagIcon, BookmarkIcon, AlertCircleIcon, Loader2Icon } from 'lucide-react';
import { Swal } from '../../ui/SweetAlert';
import { API_BASE_URL } from '../../../config/api';
import { paraTextoSimples } from '../../../utils/htmlTexto';
interface PadraoExame {
  id: string;
  profissionalId?: string;
  nome: string;
  descricao: string;
  pedido: string;
  justificativa: string;
  cid10: string;
  criadoEm: string;
}
interface ExameData {
  medico: string;
  descricao: string;
  pedido: string;
  justificativa: string;
  cid10: string;
}
interface PadroesExameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (data: Partial<ExameData>) => void;
  currentData?: ExameData;
  clinicaId?: string;
  profissionalId?: string;
}
export function PadroesExameModal({
  isOpen,
  onClose,
  onSelect,
  currentData,
  clinicaId = 'default',
  profissionalId
}: PadroesExameModalProps) {
  const [padroes, setPadroes] = useState<PadraoExame[]>([]);
  const [search, setSearch] = useState('');
  const [novoPadraoNome, setNovoPadraoNome] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // ⭐ CORRIGIDO: Busca padrões mesmo sem profissionalId (servidor retorna todos)
  useEffect(() => {
    if (!isOpen) return;
    if (!profissionalId) {
      console.warn('⚠️ [PadroesExame] profissionalId não informado - buscando TODOS os padrões');
    }
    const carregarPadroes = async () => {
      setLoading(true);
      setErro(null);
      try {
        // ⭐ profissionalId é opcional - se vazio, servidor retorna todos
        const url = profissionalId ? `${API_BASE_URL}/api/padroes-exames?clinicaId=${clinicaId}&profissionalId=${profissionalId}` : `${API_BASE_URL}/api/padroes-exames?clinicaId=${clinicaId}`;
        console.log(`🔍 [PadroesExame] Buscando padrões do profissional ${profissionalId}...`);
        console.log(`🔍 [PadroesExame] URL: ${url}`);
        const response = await fetch(url);
        console.log(`🔍 [PadroesExame] Status: ${response.status}`);
        if (response.ok) {
          const data = await response.json();
          setPadroes(data);
          console.log(`✅ [PadroesExame] ${data.length} padrões carregados para profissional ${profissionalId}`);
          if (data.length > 0) {
            console.log(`✅ [PadroesExame] Primeiro padrão:`, data[0]);
          }
        } else {
          const errorText = await response.text();
          console.error(`❌ [PadroesExame] Erro HTTP ${response.status}: ${errorText}`);
          setErro(`Erro ao buscar padrões: HTTP ${response.status}`);
        }
      } catch (err: any) {
        console.error('❌ [PadroesExame] Erro de conexão:', err);
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
      const response = await fetch(`${API_BASE_URL}/api/padroes-exames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          profissionalId: profissionalId || null,
          nome: novoPadraoNome,
          descricao: currentData.descricao,
          pedido: currentData.pedido,
          justificativa: currentData.justificativa,
          cid10: currentData.cid10
        })
      });
      if (response.ok) {
        const result = await response.json();
        const newPattern: PadraoExame = {
          id: result.id,
          profissionalId: profissionalId || undefined,
          nome: novoPadraoNome,
          descricao: currentData.descricao,
          pedido: currentData.pedido,
          justificativa: currentData.justificativa,
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
        const response = await fetch(`${API_BASE_URL}/api/padroes-exames/${id}?clinicaId=${clinicaId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          setPadroes(padroes.filter((p) => p.id !== id));
        }
      } catch (err) {
        console.error('Erro ao excluir padrão:', err);
      }
    }
  };
  const startEdit = (padrao: PadraoExame) => {
    setEditingId(padrao.id);
    setEditName(padrao.nome);
  };
  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await fetch(`${API_BASE_URL}/api/padroes-exames/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nome: editName
        })
      });
      setPadroes(padroes.map((p) => p.id === editingId ? {
        ...p,
        nome: editName
      } : p));
    } catch (err) {
      console.error('Erro ao renomear padrão:', err);
    }
    setEditingId(null);
    setEditName('');
  };
  const filteredPadroes = padroes.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()) || (p.descricao || '').toLowerCase().includes(search.toLowerCase()) || (p.pedido || '').toLowerCase().includes(search.toLowerCase()));
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
                Padrões de Exame
              </h3>
              <p className="text-xs text-gray-500">
                Gerencie e utilize modelos de exames frequentes
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ⭐ Aviso de erro ou debug */}
        {erro && <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Erro ao carregar padrões</p>
              <p className="text-xs mt-1">{erro}</p>
              <p className="text-xs mt-1 text-red-500">
                clinicaId: {clinicaId} | profissionalId:{' '}
                {profissionalId || 'nenhum'}
              </p>
            </div>
          </div>}

        {/* Search & Save New */}
        <div className="p-4 border-b border-gray-100 space-y-4 bg-white">
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar padrões por nome, descrição ou pedido..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all" />
            
          </div>

          {/* Save Current */}
          {currentData && (currentData.pedido || currentData.descricao) && <div className="flex gap-2 items-center bg-teal-50 p-3 rounded-lg border border-teal-100">
              <div className="flex-1">
                <label className="block text-xs font-medium text-teal-800 mb-1">
                  Salvar exame atual como novo padrão
                </label>
                <input type="text" placeholder="Nome do novo padrão (ex: Hemograma Pediátrico)" value={novoPadraoNome} onChange={(e) => setNovoPadraoNome(e.target.value)} className="w-full px-3 py-1.5 border border-teal-200 rounded text-sm focus:outline-none focus:border-teal-500" />
              
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
                {search ? 'Tente outro termo de busca' : 'Preencha o formulário de exame e salve como padrão'}
              </p>
            </div> : filteredPadroes.map((padrao) => <div key={padrao.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all group relative">
            
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
                      {padrao.descricao}
                    </p>}
                  {padrao.pedido && <p className="line-clamp-2 text-gray-500 italic">
                      "{paraTextoSimples(padrao.pedido)}"
                    </p>}
                  {padrao.cid10 && <p className="text-xs text-gray-400">CID: {padrao.cid10}</p>}
                </div>

                <button onClick={() => {
            onSelect({
              descricao: padrao.descricao,
              pedido: padrao.pedido,
              justificativa: padrao.justificativa,
              cid10: padrao.cid10
            });
            onClose();
          }} className="w-full py-2 bg-gray-50 hover:bg-teal-50 text-gray-700 hover:text-teal-700 border border-gray-200 hover:border-teal-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
              
                  <CheckIcon className="w-4 h-4" />
                  Usar este padrão
                </button>
              </div>)}
        </div>

        {/* Footer com diagnóstico */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-500">
          {padroes.length} padrão(ões) disponível(is)
          {profissionalId && <span className="block mt-1 text-[10px] text-gray-400 font-mono">
              profissionalId: {profissionalId} | clinicaId: {clinicaId}
            </span>}
          {!profissionalId && <span className="block mt-1 text-[10px] text-red-400 font-mono">
              ⚠️ profissionalId VAZIO — padrões não podem ser filtrados
            </span>}
        </div>
      </div>
    </div>;
}