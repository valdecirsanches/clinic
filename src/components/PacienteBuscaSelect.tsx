import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Input } from './ui/Input';
import { SearchIcon, UserIcon } from 'lucide-react';
import { Paciente } from '../types';
import { setGlobalSearchTerm, getGlobalSearchTerm } from '../hooks/useBuscaPacienteGlobal';
interface PacienteBuscaSelectProps {
  pacientes: Paciente[];
  value: string;
  onChange: (pacienteId: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}
export function PacienteBuscaSelect({
  pacientes = [],
  value,
  onChange,
  label = 'Paciente',
  placeholder = 'Buscar por nome, CPF ou telefone...',
  required = false
}: PacienteBuscaSelectProps) {
  // ⭐ Carrega termo salvo na inicialização
  const [searchTerm, setSearchTerm] = useState(() => {
    const saved = getGlobalSearchTerm();
    return value ? '' : saved;
  });
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pacientesArray = Array.isArray(pacientes) ? pacientes : [];
  const selectedPaciente = pacientesArray.find((p) => p.id === value);
  const filteredPacientes = useMemo(() => {
    if (!pacientesArray.length) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      return [...pacientesArray].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).slice(0, 50);
    }
    const palavras = term.split(/\s+/).filter((p) => p.length > 0);
    return pacientesArray.filter((p) => {
      const nomeLower = p.nome?.toLowerCase() || '';
      const cpfLimpo = p.cpf?.replace(/\D/g, '') || '';
      const telLimpo = p.telefone?.replace(/\D/g, '') || '';
      const termLimpo = term.replace(/\D/g, '');
      if (/^\d+$/.test(termLimpo) && termLimpo.length > 0) {
        return cpfLimpo.includes(termLimpo) || telLimpo.includes(termLimpo);
      }
      return palavras.every((palavra) => nomeLower.includes(palavra));
    }).sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 50);
  }, [searchTerm, pacientesArray]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    setGlobalSearchTerm(newTerm); // ⭐ SALVA ENQUANTO DIGITA
    if (!isOpen) setIsOpen(true);
  };
  const handleSelect = (paciente: Paciente) => {
    onChange(paciente.id);
    setSearchTerm('');
    setIsOpen(false);
  };
  const handleClear = () => {
    onChange('');
    const saved = getGlobalSearchTerm();
    setSearchTerm(saved); // ⭐ RESTAURA
    setIsOpen(true);
  };
  return <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {selectedPaciente ? <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <UserIcon className="w-5 h-5 text-blue-600" />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-semibold truncate">
                  {selectedPaciente.nome}
                </p>
                <p className="text-sm text-gray-600 truncate">
                  {selectedPaciente.cpf && `CPF: ${selectedPaciente.cpf}`}
                  {selectedPaciente.cpf && selectedPaciente.telefone && ' • '}
                  {selectedPaciente.telefone && `Tel: ${selectedPaciente.telefone}`}
                </p>
              </div>
            </div>
          </div>
          <button type="button" onClick={handleClear} className="px-4 py-3 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg">
          
            Trocar
          </button>
        </div> : <div className="relative">
          <Input value={searchTerm} onChange={handleSearchChange} onFocus={() => setIsOpen(true)} placeholder={placeholder} icon={<SearchIcon className="w-4 h-4" />} autoComplete="off" />
        

          {isOpen && <div className="absolute z-50 w-full mt-2 bg-white border-2 border-blue-300 rounded-lg shadow-2xl max-h-96 overflow-y-auto">
              <div className="sticky top-0 bg-blue-50 border-b border-blue-200 px-4 py-2">
                <p className="text-xs font-semibold text-blue-900">
                  {searchTerm ? <>🔍 "{searchTerm}"</> : <>📋 Primeiros 50</>}
                  {filteredPacientes.length > 0 && <span className="text-blue-700 ml-2">
                      ({filteredPacientes.length})
                    </span>}
                </p>
              </div>

              {filteredPacientes.length === 0 ? <div className="p-8 text-center">
                  <div className="text-4xl mb-3">😔</div>
                  <p>Nenhum encontrado</p>
                </div> : <div className="py-1">
                  {filteredPacientes.map((p, i) => <button key={p.id} type="button" onClick={() => handleSelect(p)} className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0">
              
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <UserIcon className="w-4 h-4 text-blue-600" />
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