import React, { useCallback, useEffect, useState, useRef, Component } from 'react';
import { SearchIcon, MapPinIcon, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface Unidade {
  id: string;
  nome: string;
  cidade?: string;
  uf?: string;
}
interface UnidadeBuscaSelectAPIProps {
  clinicaId: string;
  empresaId: string;
  value: string;
  onChange: (unidadeId: string, unidadeNome: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showClearButton?: boolean;
  disabled?: boolean;
}
export function UnidadeBuscaSelectAPI({
  clinicaId,
  empresaId,
  value,
  onChange,
  label = 'Unidade',
  placeholder = 'Buscar unidade...',
  required = false,
  showClearButton = true,
  disabled = false
}: UnidadeBuscaSelectAPIProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null);
  // ⭐ Memória da seleção anterior, para permitir "Cancelar" e reverter
  const [prevUnidade, setPrevUnidade] = useState<Unidade | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();
  // Limpa a seleção se a empresa mudar
  useEffect(() => {
    if (!empresaId) {
      setSelectedUnidade(null);
      setPrevUnidade(null);
      setSearchTerm('');
      setUnidades([]);
    }
  }, [empresaId]);
  // Busca no backend
  const buscarUnidades = useCallback(async (termo: string) => {
    if (!empresaId) return;
    // Se não tem termo, busca as primeiras 50 para mostrar algo ao focar
    setLoading(true);
    try {
      const params = new URLSearchParams({
        clinicaId,
        limit: '50',
        page: '1'
      });
      if (termo.trim()) {
        params.append('search', termo);
      }
      const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades?${params}`);
      if (response.ok) {
        const result = await response.json();
        setUnidades(Array.isArray(result) ? result : []);
      }
    } catch (err) {
      setUnidades([]);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, empresaId]);
  // Debounce da busca
  useEffect(() => {
    if (!empresaId) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => buscarUnidades(searchTerm), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchTerm, buscarUnidades, empresaId]);
  // Carrega unidade se tiver value
  // ⭐⭐⭐ FIX TRAVAMENTO: busca APENAS a unidade específica por id (&id=),
  // em vez de carregar a lista inteira da empresa (que pode ter dezenas de
  // milhares de unidades e congelava a tela ao abrir o cadastro).
  useEffect(() => {
    if (value && empresaId && !selectedUnidade) {
      fetch(`${API_BASE_URL}/api/empresas-conveniadas/${empresaId}/unidades?clinicaId=${clinicaId}&id=${encodeURIComponent(value)}`).then((r) => r.ok ? r.json() : null).then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSelectedUnidade(data[0]);
        }
      }).catch(() => {});
    } else if (!value && selectedUnidade) {
      setSelectedUnidade(null);
    }
  }, [value, clinicaId, empresaId, selectedUnidade]);
  // Fecha dropdown ao clicar fora
  // ⭐ Se o usuário tinha uma unidade selecionada (prevUnidade) e clicou em
  // "Trocar" mas saiu sem escolher outra, RESTAURA a seleção anterior em vez
  // de deixar o campo vazio.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (!selectedUnidade && prevUnidade) {
          setSelectedUnidade(prevUnidade);
          onChange(prevUnidade.id, prevUnidade.nome);
          setPrevUnidade(null);
          setSearchTerm('');
          setUnidades([]);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedUnidade, prevUnidade, onChange]);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    if (!isOpen) setIsOpen(true);
  };
  const handleSelect = (unidade: Unidade) => {
    setSelectedUnidade(unidade);
    onChange(unidade.id, unidade.nome);
    setSearchTerm(''); // Limpa o campo visual
    setIsOpen(false);
    setUnidades([]);
    setPrevUnidade(null); // nova seleção substitui a memória
  };
  const handleClear = () => {
    // ⭐ Guarda a seleção atual para permitir reverter via "Cancelar"
    setPrevUnidade(selectedUnidade);
    setSelectedUnidade(null);
    onChange('', '');
    setSearchTerm('');
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  // ⭐ Reverte para a seleção anterior (desiste da troca)
  const handleCancelar = () => {
    if (!prevUnidade) return;
    setSelectedUnidade(prevUnidade);
    onChange(prevUnidade.id, prevUnidade.nome);
    setPrevUnidade(null);
    setSearchTerm('');
    setIsOpen(false);
    setUnidades([]);
  };
  const isDisabled = disabled || !empresaId;
  return <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {selectedUnidade ? <div className="flex items-center gap-2">
          <div className={`flex-1 px-3 py-2 bg-teal-50 border border-teal-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500 ${isDisabled ? 'opacity-60' : ''}`}>
          
            <div className="flex items-center gap-2">
              <MapPinIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium truncate text-sm">
                  {selectedUnidade.nome}
                </p>
              </div>
            </div>
          </div>
          {showClearButton && !isDisabled && <button type="button" onClick={handleClear} className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors">
          
              Trocar
            </button>}
        </div> : <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-teal-500" /> : <SearchIcon className={`w-4 h-4 ${isDisabled ? 'text-gray-300' : 'text-gray-400'}`} />}
              </div>
              <input ref={inputRef} type="text" value={searchTerm} onChange={handleSearchChange} onFocus={(e) => {
            if (isDisabled) return;
            e.target.select();
            setIsOpen(true);
            if (!searchTerm && unidades.length === 0) {
              buscarUnidades('');
            }
          }} placeholder={!empresaId ? 'Selecione a empresa...' : placeholder} autoComplete="off" disabled={isDisabled} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all disabled:bg-gray-100 disabled:text-gray-500" />
            
            </div>
            {prevUnidade && !isDisabled && <button type="button" onClick={handleCancelar} title={`Manter "${prevUnidade.nome}"`} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-300 rounded transition-colors whitespace-nowrap">
            
                Cancelar
              </button>}
          </div>

          {isOpen && !isDisabled && <div className="absolute z-50 w-full mt-1 bg-white border border-teal-300 rounded shadow-lg max-h-60 overflow-y-auto">
              <div className="sticky top-0 bg-teal-50 border-b border-teal-200 px-3 py-1.5">
                <p className="text-xs font-semibold text-teal-900">
                  {searchTerm ? <>
                      🔍 Buscando:{' '}
                      <span className="text-teal-600">"{searchTerm}"</span>
                    </> : <>💡 Unidades da empresa</>}
                </p>
              </div>

              {loading ? <div className="p-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">Buscando...</p>
                </div> : unidades.length === 0 && searchTerm ? <div className="p-4 text-center">
                  <p className="text-gray-700 text-sm font-medium">
                    Nenhuma unidade encontrada
                  </p>
                </div> : unidades.length === 0 ? <div className="p-4 text-center">
                  <p className="text-gray-700 text-sm font-medium">
                    Nenhuma unidade cadastrada
                  </p>
                </div> : <div className="py-1">
                  {unidades.map((u) => <button key={u.id} type="button" onClick={() => handleSelect(u)} className="w-full px-3 py-2 text-left hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition-colors">
              
                      <div className="flex items-center gap-2">
                        <MapPinIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {u.nome}
                          </p>
                          {(u.cidade || u.uf) && <p className="text-xs text-gray-500 truncate">
                              {u.cidade}
                              {u.cidade && u.uf ? ' - ' : ''}
                              {u.uf}
                            </p>}
                        </div>
                      </div>
                    </button>)}
                </div>}
            </div>}
        </div>}
    </div>;
}