import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Input } from './ui/Input';
import { SearchIcon, UserIcon, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { setGlobalSearchTerm as salvarTermo, getGlobalSearchTerm as lerTermoSalvo } from '../hooks/useBuscaPacienteGlobal';
interface Paciente {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
}
interface PacienteBuscaSelectAPIProps {
  clinicaId: string;
  value: string;
  onChange: (pacienteId: string, pacienteNome: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showClearButton?: boolean;
  autoFocus?: boolean; // ⭐ NOVO: Foca automaticamente ao abrir
  allowQuickCreate?: boolean; // ⭐ NOVO: Permite cadastro rápido
}
export function PacienteBuscaSelectAPI({
  clinicaId,
  value,
  onChange,
  label = 'Paciente',
  placeholder = 'Buscar por nome, CPF ou telefone...',
  required = false,
  showClearButton = true,
  autoFocus = false,
  allowQuickCreate = true
}: PacienteBuscaSelectAPIProps) {
  // ⭐ INICIALIZA COM O TERMO SALVO (se não tiver paciente selecionado)
  const [searchTerm, setSearchTerm] = useState(() => value ? '' : lerTermoSalvo());
  const [isOpen, setIsOpen] = useState(false);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();
  // ⭐ NOVO: AutoFocus quando o componente monta
  useEffect(() => {
    if (autoFocus && !value && inputRef.current) {
      // Pequeno delay para garantir que o modal está renderizado
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        setIsOpen(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, value]);
  // Busca no backend
  const buscarPacientes = useCallback(async (termo: string) => {
    if (!termo.trim()) {
      setPacientes([]);
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
      const response = await fetch(`${API_BASE_URL}/api/pacientes?${params}`);
      if (response.ok) {
        const result = await response.json();
        setPacientes(result.data || []);
      }
    } catch (err) {
      setPacientes([]);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  // Debounce da busca
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => buscarPacientes(searchTerm), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchTerm, buscarPacientes]);
  // Carrega paciente se tiver value
  useEffect(() => {
    if (value && !selectedPaciente) {
      fetch(`${API_BASE_URL}/api/pacientes/${value}?clinicaId=${clinicaId}`).then((r) => r.ok ? r.json() : null).then((data) => {
        if (data) setSelectedPaciente(data);
      }).catch(() => {});
    } else if (!value && selectedPaciente) {
      setSelectedPaciente(null);
    }
  }, [value, clinicaId, selectedPaciente]);
  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    salvarTermo(newTerm); // ⭐ SALVA ENQUANTO DIGITA
    if (!isOpen) setIsOpen(true);
  };
  const handleSelect = (paciente: Paciente) => {
    setSelectedPaciente(paciente);
    onChange(paciente.id, paciente.nome);
    setSearchTerm(''); // Limpa o campo visual
    setIsOpen(false);
    setPacientes([]);
  };
  const handleClear = () => {
    setSelectedPaciente(null);
    onChange('', '');
    setSearchTerm(lerTermoSalvo()); // ⭐ RESTAURA O TERMO SALVO
    setIsOpen(true);
    // ⭐ Foca no input após limpar
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  // ⭐ NOVO: Cadastro rápido de paciente
  const [isCreating, setIsCreating] = useState(false);
  const handleQuickCreate = async () => {
    if (!searchTerm.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/pacientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nome: searchTerm.trim()
          // Envia campos mínimos, o backend gera matrícula e contrato
        })
      });
      if (response.ok) {
        const novoPaciente = await response.json();
        handleSelect({
          id: novoPaciente.id,
          nome: novoPaciente.nome
        });
      } else {
        console.error('Erro ao criar paciente rápido');
      }
    } catch (err) {
      console.error('Erro de rede ao criar paciente', err);
    } finally {
      setIsCreating(false);
    }
  };
  return <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {selectedPaciente ? <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 bg-teal-50 border-2 border-teal-300 rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-semibold truncate text-lg">
                  {selectedPaciente.nome}
                </p>
                <p className="text-sm text-gray-600 truncate">
                  {selectedPaciente.cpf && `CPF: ${selectedPaciente.cpf}`}
                  {selectedPaciente.cpf && selectedPaciente.telefone && ' • '}
                  {selectedPaciente.telefone && `Tel: ${selectedPaciente.telefone}`}
                </p>
              </div>
              <div className="text-teal-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                
                </svg>
              </div>
            </div>
          </div>
          {showClearButton && <button type="button" onClick={handleClear} className="px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 border-2 border-red-200 rounded-lg transition-colors">
          
              Trocar
            </button>}
        </div> : <div className="relative">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-teal-500" /> : <SearchIcon className="w-5 h-5 text-gray-400" />}
            </div>
            <input ref={inputRef} type="text" value={searchTerm} onChange={handleSearchChange} onFocus={(e) => {
          // ⭐ CORREÇÃO: Seleciona todo o texto ao focar
          e.target.select();
          setIsOpen(true);
        }} placeholder={placeholder} autoComplete="off" className="w-full pl-11 pr-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all" />
          
          </div>

          {isOpen && <div className="absolute z-50 w-full mt-2 bg-white border-2 border-teal-300 rounded-lg shadow-2xl max-h-96 overflow-y-auto">
              <div className="sticky top-0 bg-teal-50 border-b border-teal-200 px-4 py-2">
                <p className="text-xs font-semibold text-teal-900">
                  {searchTerm ? <>
                      🔍 Buscando:{' '}
                      <span className="text-teal-600">"{searchTerm}"</span>
                    </> : <>💡 Digite para buscar pacientes</>}
                </p>
                {!loading && pacientes.length > 0 && <p className="text-xs text-teal-700 mt-1">
                    {pacientes.length} resultado(s)
                  </p>}
              </div>

              {loading ? <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm">Buscando...</p>
                </div> : pacientes.length === 0 && searchTerm ? <div className="p-8 text-center">
                  <div className="text-4xl mb-3">😔</div>
                  <p className="text-gray-700 font-medium mb-4">
                    Nenhum paciente encontrado
                  </p>
                  {allowQuickCreate && <button type="button" onClick={handleQuickCreate} disabled={isCreating} className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors disabled:opacity-70">
              
                      {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserIcon className="w-5 h-5" />}
                      {isCreating ? 'Cadastrando...' : `Cadastrar "${searchTerm}"`}
                    </button>}
                </div> : pacientes.length === 0 ? <div className="p-8 text-center">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-gray-700 font-medium">
                    Digite para buscar
                  </p>
                </div> : <div className="py-1">
                  {allowQuickCreate && searchTerm && !pacientes.some((p) => p.nome.toLowerCase() === searchTerm.toLowerCase()) && <button type="button" onClick={handleQuickCreate} disabled={isCreating} className="w-full px-4 py-3 text-left hover:bg-teal-50 border-b border-teal-100 transition-colors bg-teal-50/50">
              
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                            {isCreating ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <span className="text-white text-xl font-bold">
                                +
                              </span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-teal-900 truncate">
                              Cadastrar novo paciente
                            </p>
                            <p className="text-sm text-teal-700 truncate">
                              Nome:{' '}
                              <span className="font-bold">"{searchTerm}"</span>
                            </p>
                          </div>
                        </div>
                      </button>}
                  {pacientes.map((p, i) => <button key={p.id} type="button" onClick={() => handleSelect(p)} className="w-full px-4 py-3 text-left hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition-colors">
              
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                          <UserIcon className="w-5 h-5 text-teal-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {p.nome}
                          </p>
                          <p className="text-sm text-gray-600 truncate">
                            {p.cpf && `CPF: ${p.cpf}`}
                            {p.cpf && p.telefone && ' • '}
                            {p.telefone && `Tel: ${p.telefone}`}
                          </p>
                        </div>
                        <div className="text-xs text-gray-400">#{i + 1}</div>
                      </div>
                    </button>)}
                </div>}
            </div>}
        </div>}
    </div>;
}