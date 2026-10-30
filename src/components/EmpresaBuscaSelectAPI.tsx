import React, { useCallback, useEffect, useState, useRef } from 'react';
import { SearchIcon, BuildingIcon, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface Empresa {
  id: string;
  nome: string;
  cnpj?: string;
}
interface EmpresaBuscaSelectAPIProps {
  clinicaId: string;
  value: string;
  onChange: (empresaId: string, empresaNome: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showClearButton?: boolean;
}
export function EmpresaBuscaSelectAPI({
  clinicaId,
  value,
  onChange,
  label = 'Empresa',
  placeholder = 'Buscar por nome ou CNPJ...',
  required = false,
  showClearButton = true
}: EmpresaBuscaSelectAPIProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  // ⭐ Memória da seleção anterior, para permitir "Cancelar" e reverter
  const [prevEmpresa, setPrevEmpresa] = useState<Empresa | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();
  // Busca no backend
  const buscarEmpresas = useCallback(async (termo: string) => {
    if (!termo.trim()) {
      setEmpresas([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        clinicaId,
        search: termo,
        limit: '50',
        page: '1'
      });
      const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas?${params}`);
      if (response.ok) {
        const result = await response.json();
        // O endpoint retorna um array diretamente
        setEmpresas(Array.isArray(result) ? result : []);
      }
    } catch (err) {
      setEmpresas([]);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  // Debounce da busca
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => buscarEmpresas(searchTerm), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchTerm, buscarEmpresas]);
  // Carrega empresa se tiver value
  useEffect(() => {
    if (value && !selectedEmpresa) {
      fetch(`${API_BASE_URL}/api/empresas-conveniadas/${value}?clinicaId=${clinicaId}`).then((r) => r.ok ? r.json() : null).then((data) => {
        if (data) setSelectedEmpresa(data);
      }).catch(() => {});
    } else if (!value && selectedEmpresa) {
      setSelectedEmpresa(null);
    }
  }, [value, clinicaId, selectedEmpresa]);
  // Fecha dropdown ao clicar fora
  // ⭐ Se o usuário tinha uma empresa selecionada (prevEmpresa) e clicou em
  // "Trocar" mas saiu sem escolher outra, RESTAURA a seleção anterior em vez
  // de deixar o campo vazio.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (!selectedEmpresa && prevEmpresa) {
          setSelectedEmpresa(prevEmpresa);
          onChange(prevEmpresa.id, prevEmpresa.nome);
          setPrevEmpresa(null);
          setSearchTerm('');
          setEmpresas([]);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedEmpresa, prevEmpresa, onChange]);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    if (!isOpen) setIsOpen(true);
  };
  const handleSelect = (empresa: Empresa) => {
    setSelectedEmpresa(empresa);
    onChange(empresa.id, empresa.nome);
    setSearchTerm(''); // Limpa o campo visual
    setIsOpen(false);
    setEmpresas([]);
    setPrevEmpresa(null); // nova seleção substitui a memória
  };
  const handleClear = () => {
    // ⭐ Guarda a seleção atual para permitir reverter via "Cancelar"
    setPrevEmpresa(selectedEmpresa);
    setSelectedEmpresa(null);
    onChange('', '');
    setSearchTerm('');
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  // ⭐ Reverte para a seleção anterior (desiste da troca)
  const handleCancelar = () => {
    if (!prevEmpresa) return;
    setSelectedEmpresa(prevEmpresa);
    onChange(prevEmpresa.id, prevEmpresa.nome);
    setPrevEmpresa(null);
    setSearchTerm('');
    setIsOpen(false);
    setEmpresas([]);
  };
  return <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {selectedEmpresa ? <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-teal-50 border border-teal-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500">
            <div className="flex items-center gap-2">
              <BuildingIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium truncate text-sm">
                  {selectedEmpresa.nome}
                </p>
              </div>
            </div>
          </div>
          {showClearButton && <button type="button" onClick={handleClear} className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors">
          
              Trocar
            </button>}
        </div> : <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-teal-500" /> : <SearchIcon className="w-4 h-4 text-gray-400" />}
              </div>
              <input ref={inputRef} type="text" value={searchTerm} onChange={handleSearchChange} onFocus={(e) => {
            e.target.select();
            setIsOpen(true);
          }} placeholder={placeholder} autoComplete="off" className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all" />
            
            </div>
            {prevEmpresa && <button type="button" onClick={handleCancelar} title={`Manter "${prevEmpresa.nome}"`} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-300 rounded transition-colors whitespace-nowrap">
            
                Cancelar
              </button>}
          </div>

          {isOpen && <div className="absolute z-50 w-full mt-1 bg-white border border-teal-300 rounded shadow-lg max-h-60 overflow-y-auto">
              <div className="sticky top-0 bg-teal-50 border-b border-teal-200 px-3 py-1.5">
                <p className="text-xs font-semibold text-teal-900">
                  {searchTerm ? <>
                      🔍 Buscando:{' '}
                      <span className="text-teal-600">"{searchTerm}"</span>
                    </> : <>💡 Digite para buscar empresas</>}
                </p>
              </div>

              {loading ? <div className="p-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">Buscando...</p>
                </div> : empresas.length === 0 && searchTerm ? <div className="p-4 text-center">
                  <p className="text-gray-700 text-sm font-medium">
                    Nenhuma empresa encontrada
                  </p>
                </div> : empresas.length === 0 ? <div className="p-4 text-center">
                  <p className="text-gray-700 text-sm font-medium">
                    Digite para buscar
                  </p>
                </div> : <div className="py-1">
                  {empresas.map((e) => <button key={e.id} type="button" onClick={() => handleSelect(e)} className="w-full px-3 py-2 text-left hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition-colors">
              
                      <div className="flex items-center gap-2">
                        <BuildingIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {e.nome}
                          </p>
                          {e.cnpj && <p className="text-xs text-gray-500 truncate">
                              CNPJ: {e.cnpj}
                            </p>}
                        </div>
                      </div>
                    </button>)}
                </div>}
            </div>}
        </div>}
    </div>;
}