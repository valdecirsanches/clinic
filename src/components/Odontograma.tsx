import React, { useState } from 'react';
import { Button } from './ui/Button';
interface ToothCondition {
  status: 'saudavel' | 'cariado' | 'restaurado' | 'extraido' | 'tratamento_canal' | 'protese' | 'implante';
  faces?: {
    oclusal?: boolean;
    mesial?: boolean;
    distal?: boolean;
    vestibular?: boolean;
    lingual?: boolean;
  };
  observacao?: string;
}
interface OdontogramaData {
  [toothNumber: string]: ToothCondition;
}
interface OdontogramaProps {
  value: OdontogramaData;
  onChange: (data: OdontogramaData) => void;
  disabled?: boolean;
}
export function Odontograma({
  value,
  onChange,
  disabled = false
}: OdontogramaProps) {
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<ToothCondition['status']>('saudavel');
  // Numeração FDI (padrão internacional)
  const quadrants = {
    superior_direito: ['18', '17', '16', '15', '14', '13', '12', '11'],
    superior_esquerdo: ['21', '22', '23', '24', '25', '26', '27', '28'],
    inferior_esquerdo: ['31', '32', '33', '34', '35', '36', '37', '38'],
    inferior_direito: ['48', '47', '46', '45', '44', '43', '42', '41']
  };
  const statusColors = {
    saudavel: 'bg-white border-gray-300',
    cariado: 'bg-red-100 border-red-400',
    restaurado: 'bg-blue-100 border-blue-400',
    extraido: 'bg-gray-300 border-gray-500',
    tratamento_canal: 'bg-purple-100 border-purple-400',
    protese: 'bg-yellow-100 border-yellow-400',
    implante: 'bg-green-100 border-green-400'
  };
  const statusLabels = {
    saudavel: 'Saudável',
    cariado: 'Cariado',
    restaurado: 'Restaurado',
    extraido: 'Extraído',
    tratamento_canal: 'Tratamento Canal',
    protese: 'Prótese',
    implante: 'Implante'
  };
  const handleToothClick = (toothNumber: string) => {
    if (disabled) return;
    setSelectedTooth(toothNumber);
  };
  const handleStatusChange = (status: ToothCondition['status']) => {
    if (!selectedTooth || disabled) return;
    const newData = {
      ...value,
      [selectedTooth]: {
        ...value[selectedTooth],
        status
      }
    };
    onChange(newData);
    setSelectedStatus(status);
  };
  const handleClearTooth = () => {
    if (!selectedTooth || disabled) return;
    const newData = {
      ...value
    };
    delete newData[selectedTooth];
    onChange(newData);
    setSelectedTooth(null);
  };
  const renderTooth = (toothNumber: string) => {
    const condition = value[toothNumber];
    const status = condition?.status || 'saudavel';
    const isSelected = selectedTooth === toothNumber;
    return <button key={toothNumber} type="button" onClick={() => handleToothClick(toothNumber)} disabled={disabled} className={`
          relative w-12 h-16 border-2 rounded-lg transition-all
          ${statusColors[status]}
          ${isSelected ? 'ring-4 ring-teal-500 scale-110' : disabled ? '' : 'hover:scale-105'}
          ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
          flex flex-col items-center justify-center
        `}>
        
        <span className="text-xs font-bold text-gray-700">{toothNumber}</span>
        {status === 'extraido' && <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-0.5 bg-gray-600 rotate-45"></div>
            <div className="w-full h-0.5 bg-gray-600 -rotate-45 absolute"></div>
          </div>}
      </button>;
  };
  return <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Odontograma
          {disabled && <span className="ml-2 text-xs text-gray-500 font-normal">
              (somente leitura)
            </span>}
        </h3>

        {/* Arcada Superior */}
        <div className="mb-8">
          <p className="text-xs text-gray-500 mb-2 text-center">
            Arcada Superior
          </p>
          <div className="flex justify-center gap-8">
            {/* Quadrante Superior Direito */}
            <div className="flex gap-1">
              {quadrants.superior_direito.map(renderTooth)}
            </div>
            {/* Linha Central */}
            <div className="w-0.5 bg-gray-400"></div>
            {/* Quadrante Superior Esquerdo */}
            <div className="flex gap-1">
              {quadrants.superior_esquerdo.map(renderTooth)}
            </div>
          </div>
        </div>

        {/* Arcada Inferior */}
        <div>
          <div className="flex justify-center gap-8">
            {/* Quadrante Inferior Direito */}
            <div className="flex gap-1">
              {quadrants.inferior_direito.map(renderTooth)}
            </div>
            {/* Linha Central */}
            <div className="w-0.5 bg-gray-400"></div>
            {/* Quadrante Inferior Esquerdo */}
            <div className="flex gap-1">
              {quadrants.inferior_esquerdo.map(renderTooth)}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Arcada Inferior
          </p>
        </div>
      </div>

      {/* Painel de Controle */}
      {selectedTooth && !disabled && <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">
              Dente {selectedTooth} selecionado
            </h4>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearTooth}>
            
              Limpar
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map((status) => <button key={status} type="button" onClick={() => handleStatusChange(status)} className={`
                  px-3 py-2 text-xs font-medium rounded-lg border-2 transition-all
                  ${statusColors[status]}
                  ${value[selectedTooth]?.status === status ? 'ring-2 ring-teal-500' : ''}
                  hover:scale-105
                `}>
            
                {statusLabels[status]}
              </button>)}
          </div>
        </div>}

      {/* Legenda */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-700 mb-3">Legenda</h4>
        <div className="grid grid-cols-4 gap-3">
          {(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map((status) => <div key={status} className="flex items-center gap-2">
                <div className={`w-4 h-4 border-2 rounded ${statusColors[status]}`}>
              </div>
                <span className="text-xs text-gray-600">
                  {statusLabels[status]}
                </span>
              </div>)}
        </div>
      </div>
    </div>;
}