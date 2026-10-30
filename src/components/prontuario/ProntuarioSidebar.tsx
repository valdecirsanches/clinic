import React, { useState } from 'react';
import { HistoryIcon, StethoscopeIcon, FileTextIcon, ChevronDownIcon, ChevronRightIcon, ClipboardListIcon, ActivityIcon, FlaskConicalIcon, PillIcon, FileIcon, FileCheckIcon, ImageIcon, FolderOpenIcon, ClipboardIcon } from 'lucide-react';
export type ProntuarioStep = 'resumo' | 'resumo_atendimento' | 'anamnese' | 'exame_fisico' | 'diagnostico' | 'evolucao' | 'exames' | 'prescricoes' | 'memed' | 'relatorios' | 'atestado' | 'procedimento' | 'imagens';
interface ProntuarioSidebarProps {
  activeStep: ProntuarioStep;
  onStepChange: (step: ProntuarioStep) => void;
  hiddenTabs?: ProntuarioStep[];
}
export function ProntuarioSidebar({
  activeStep,
  onStepChange,
  hiddenTabs = []
}: ProntuarioSidebarProps) {
  const [isAtendimentoExpanded, setIsAtendimentoExpanded] = useState(true);
  const [isProntuariosExpanded, setIsProntuariosExpanded] = useState(true);
  const menuItems = [{
    id: 'resumo',
    label: 'Prontuário',
    icon: FolderOpenIcon
  }, {
    id: 'resumo_atendimento',
    label: 'Resumo',
    icon: ClipboardListIcon
  }, {
    id: 'anamnese',
    label: 'Anamnese',
    icon: FileTextIcon
  }, {
    id: 'exame_fisico',
    label: 'Exame físico',
    icon: StethoscopeIcon
  }, {
    id: 'diagnostico',
    label: 'Hipótese diagnóstica',
    icon: ActivityIcon
  }, {
    id: 'evolucao',
    label: 'Evolução',
    icon: HistoryIcon
  }, {
    id: 'exames',
    label: 'Exames',
    icon: FlaskConicalIcon
  }, {
    id: 'prescricoes',
    label: 'Prescrições',
    icon: FileIcon
  }, {
    id: 'relatorios',
    label: 'Relatórios',
    icon: FileTextIcon
  }, {
    id: 'atestado',
    label: 'Atestado',
    icon: FileCheckIcon
  }, {
    id: 'procedimento',
    label: 'Procedimentos',
    icon: ClipboardIcon
  }, {
    id: 'imagens',
    label: 'Imagens e anexos',
    icon: ImageIcon
  }];
  return <div className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Header - Prontuários */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setIsProntuariosExpanded(!isProntuariosExpanded)}>
        
        <div className="flex items-center gap-2">
          <FileTextIcon className="w-5 h-5 text-teal-600" />
          <span className="font-semibold text-gray-800">Prontuários</span>
        </div>
        {isProntuariosExpanded ? <ChevronDownIcon className="w-4 h-4 text-gray-400" /> : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
      </div>

      {isProntuariosExpanded && <div className="flex-1 overflow-y-auto">
          {/* Item Histórico */}
          <div className="px-4 py-3 flex items-center gap-3 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50">
            <HistoryIcon className="w-4 h-4" />
            <span className="text-sm">Histórico</span>
          </div>

          {/* Grupo Atendimento Médico */}
          <div>
            <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setIsAtendimentoExpanded(!isAtendimentoExpanded)}>
            
              <div className="flex items-center gap-3">
                <StethoscopeIcon className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-medium text-gray-800">
                  Atendimento médico
                </span>
              </div>
              {isAtendimentoExpanded ? <ChevronDownIcon className="w-4 h-4 text-gray-400" /> : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
            </div>

            {/* Sub-itens */}
            {isAtendimentoExpanded && <div className="pb-2">
                {menuItems.filter((item) => !hiddenTabs.includes(item.id as ProntuarioStep)).map((item) => {
            const Icon = item.icon;
            const isActive = activeStep === item.id;
            return <div key={item.id} onClick={() => onStepChange(item.id as ProntuarioStep)} className={`
                        pl-10 pr-4 py-2.5 cursor-pointer flex items-center justify-between transition-all
                        ${isActive ? 'bg-teal-50 text-teal-700 border-l-3 border-teal-500 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 border-l-3 border-transparent'}
                      `} style={{
              borderLeftWidth: '3px'
            }}>
                  
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-gray-400'}`} />
                    
                          <span className="text-sm">{item.label}</span>
                        </div>
                        {item.badge && <span className="bg-teal-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {item.badge}
                          </span>}
                      </div>;
          })}
              </div>}
          </div>
        </div>}
    </div>;
}