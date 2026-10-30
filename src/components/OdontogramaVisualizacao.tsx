import React from 'react';
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
interface OdontogramaVisualizacaoProps {
  data: OdontogramaData;
}
export function OdontogramaVisualizacao({
  data
}: OdontogramaVisualizacaoProps) {
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
  const renderTooth = (toothNumber: string) => {
    const condition = data[toothNumber];
    const status = condition?.status || 'saudavel';
    return <div key={toothNumber} className={`
          relative w-10 h-14 border-2 rounded-lg
          ${statusColors[status]}
          flex flex-col items-center justify-center
        `}>
        
        <span className="text-xs font-bold text-gray-700">{toothNumber}</span>
        {status === 'extraido' && <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-0.5 bg-gray-600 rotate-45"></div>
            <div className="w-full h-0.5 bg-gray-600 -rotate-45 absolute"></div>
          </div>}
      </div>;
  };
  // Conta quantos dentes têm cada condição
  const summary = Object.values(data).reduce((acc, tooth) => {
    acc[tooth.status] = (acc[tooth.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        {/* Arcada Superior */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-2 text-center">
            Arcada Superior
          </p>
          <div className="flex justify-center gap-6">
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
          <div className="flex justify-center gap-6">
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

      {/* Resumo */}
      {Object.keys(summary).length > 0 && <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Resumo</h4>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(summary) as Array<keyof typeof statusLabels>).map((status) => <div key={status} className="flex items-center gap-2">
                  <div className={`w-3 h-3 border-2 rounded ${statusColors[status]}`}>
              </div>
                  <span className="text-xs text-gray-600">
                    {statusLabels[status]}: {summary[status]}
                  </span>
                </div>)}
          </div>
        </div>}
    </div>;
}