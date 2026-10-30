import React, { useCallback, useEffect, useState } from 'react';
import { PlusIcon, EditIcon, Trash2Icon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface ExameGratuito {
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
}
interface ExamesGratuitosManagerProps {
  clinicaId: string;
}
export function ExamesGratuitosManager({
  clinicaId
}: ExamesGratuitosManagerProps) {
  const [exames, setExames] = useState<ExameGratuito[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const carregarExames = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/exames-gratuitos?clinicaId=${clinicaId}`);
      if (response.ok) {
        const data = await response.json();
        setExames(data);
      }
    } catch (err) {
      console.error('Erro ao carregar exames gratuitos:', err);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  useEffect(() => {
    carregarExames();
  }, [carregarExames]);
  const handleAdicionar = async () => {
    if (!novoNome.trim() || !clinicaId) return;
    setAdicionando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/exames-gratuitos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nome: novoNome.trim()
        })
      });
      if (response.ok) {
        setNovoNome('');
        await carregarExames();
      }
    } catch (err) {
      console.error('Erro ao adicionar exame gratuito:', err);
    } finally {
      setAdicionando(false);
    }
  };
  const handleSalvarEdicao = async (id: string) => {
    if (!editandoNome.trim() || !clinicaId) return;
    setSalvandoEdicao(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/exames-gratuitos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nome: editandoNome.trim()
        })
      });
      if (response.ok) {
        setEditandoId(null);
        setEditandoNome('');
        await carregarExames();
      }
    } catch (err) {
      console.error('Erro ao atualizar exame gratuito:', err);
    } finally {
      setSalvandoEdicao(false);
    }
  };
  const handleExcluir = async (id: string) => {
    if (!clinicaId) return;
    setExcluindoId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/exames-gratuitos/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await carregarExames();
      }
    } catch (err) {
      console.error('Erro ao excluir exame gratuito:', err);
    } finally {
      setExcluindoId(null);
    }
  };
  const iniciarEdicao = (exame: ExameGratuito) => {
    setEditandoId(exame.id);
    setEditandoNome(exame.nome);
  };
  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditandoNome('');
  };
  if (loading) {
    return <div className="flex items-center justify-center py-12">
        <Loader2Icon className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-2 text-gray-500 text-sm">
          Carregando exames de rotina...
        </span>
      </div>;
  }
  return <div className="space-y-5">
      {/* Formulário de adição */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => {
        if (e.key === 'Enter') handleAdicionar();
      }} placeholder="Nome do exame" className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all" />
        
        <button onClick={handleAdicionar} disabled={!novoNome.trim() || adicionando} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          
          {adicionando ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
          Adicionar
        </button>
      </div>

      {/* Tabela de exames */}
      {exames.length === 0 ? <div className="text-center py-10 text-gray-400">
          <p className="text-sm">Nenhum exame de rotina cadastrado.</p>
          <p className="text-xs mt-1">Adicione exames usando o campo acima.</p>
        </div> : <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto] bg-gray-50 border-b border-gray-200">
            <div className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">
              Exame
            </div>
            <div className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider text-center w-28">
              Ações
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {exames.map((exame, index) => <div key={exame.id} className={`grid grid-cols-[1fr_auto] items-center ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} hover:bg-teal-50/40 transition-colors`}>
            
                {/* Nome */}
                <div className="px-4 py-3">
                  {editandoId === exame.id ? <div className="flex items-center gap-2">
                      <input type="text" value={editandoNome} onChange={(e) => setEditandoNome(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter') handleSalvarEdicao(exame.id);
                if (e.key === 'Escape') cancelarEdicao();
              }} autoFocus className="flex-1 px-3 py-1.5 border border-teal-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
                
                      <button onClick={() => handleSalvarEdicao(exame.id)} disabled={salvandoEdicao || !editandoNome.trim()} className="p-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white rounded-md transition-colors" title="Salvar">
                  
                        {salvandoEdicao ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={cancelarEdicao} className="p-1.5 bg-gray-400 hover:bg-gray-500 text-white rounded-md transition-colors" title="Cancelar">
                  
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div> : <span className="text-sm text-gray-800 font-medium">
                      {exame.nome}
                    </span>}
                </div>

                {/* Ações */}
                <div className="px-4 py-3 flex items-center gap-2 justify-center w-28">
                  {editandoId !== exame.id && <>
                      <button onClick={() => iniciarEdicao(exame)} className="w-8 h-8 flex items-center justify-center bg-amber-400 hover:bg-amber-500 text-white rounded-full transition-colors shadow-sm" title="Editar">
                  
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleExcluir(exame.id)} disabled={excluindoId === exame.id} className="w-8 h-8 flex items-center justify-center bg-red-400 hover:bg-red-500 disabled:bg-gray-300 text-white rounded-full transition-colors shadow-sm" title="Excluir">
                  
                        {excluindoId === exame.id ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <Trash2Icon className="w-3.5 h-3.5" />}
                      </button>
                    </>}
                </div>
              </div>)}
          </div>
        </div>}

      <p className="text-xs text-gray-400 text-right">
        {exames.length} exame{exames.length !== 1 ? 's' : ''} cadastrado
        {exames.length !== 1 ? 's' : ''}
      </p>
    </div>;
}