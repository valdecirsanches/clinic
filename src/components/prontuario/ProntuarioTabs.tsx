import React from 'react';
import {
  ClipboardListIcon,
  FileTextIcon,
  StethoscopeIcon,
  ActivityIcon,
  HistoryIcon,
  FlaskConicalIcon,
  PillIcon,
  FileCheckIcon,
  ImageIcon,
  FolderOpenIcon,
  ClipboardIcon,
  SmileIcon } from
'lucide-react';
export type ProntuarioStep =
'resumo' |
'resumo_atendimento' |
'anamnese' |
'exame_fisico' |
'diagnostico' |
'evolucao' |
'exames' |
'prescricoes' |
'memed' |
'relatorios' |
'atestado' |
'procedimento' |
'avaliacao' |
'imagens' |
'odontograma';
interface TabItem {
  id: ProntuarioStep;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  badge?: string;
}
const TABS: TabItem[] = [
{
  id: 'resumo_atendimento',
  label: 'Resumo',
  shortLabel: 'Resumo',
  icon: ClipboardListIcon
},
{
  id: 'anamnese',
  label: 'Anamnese',
  shortLabel: 'Anam.',
  icon: FileTextIcon
},
{
  id: 'exame_fisico',
  label: 'Exame Físico',
  shortLabel: 'Ex.Fís.',
  icon: StethoscopeIcon
},
{
  id: 'diagnostico',
  label: 'Diagnóstico',
  shortLabel: 'Diag.',
  icon: ActivityIcon
},
{
  id: 'evolucao',
  label: 'Evolução',
  shortLabel: 'Evol.',
  icon: HistoryIcon
},
{
  id: 'exames',
  label: 'Exames',
  shortLabel: 'Exam.',
  icon: FlaskConicalIcon
},
{
  id: 'prescricoes',
  label: 'Prescrições',
  shortLabel: 'Presc.',
  icon: FileTextIcon
},
{
  id: 'relatorios',
  label: 'Relatórios',
  shortLabel: 'Relat.',
  icon: FileTextIcon
},
{
  id: 'atestado',
  label: 'Atestado',
  shortLabel: 'Atest.',
  icon: FileCheckIcon
},
{
  id: 'imagens',
  label: 'Imagens',
  shortLabel: 'Img.',
  icon: ImageIcon
},
{
  id: 'odontograma',
  label: 'Odontograma',
  shortLabel: 'Odont.',
  icon: SmileIcon
},
{
  id: 'resumo',
  label: 'Prontuário',
  shortLabel: 'Pront.',
  icon: FolderOpenIcon
}];

interface ProntuarioTabsProps {
  activeStep: ProntuarioStep;
  onStepChange: (step: ProntuarioStep) => void;
  hiddenTabs?: ProntuarioStep[];
  onAvaliacaoClick?: () => void;
  onProcedimentosClick?: () => void;
  showAvaliacaoActive?: boolean;
  showProcedimentosActive?: boolean;
}
export function ProntuarioTabs({
  activeStep,
  onStepChange,
  hiddenTabs = [],
  onAvaliacaoClick,
  onProcedimentosClick,
  showAvaliacaoActive,
  showProcedimentosActive
}: ProntuarioTabsProps) {
  const visibleTabs = TABS.filter((tab) => !hiddenTabs.includes(tab.id));
  return (
    <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex-shrink-0">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {/* Botões de Avaliação e Procedimentos antes das abas */}
        {onAvaliacaoClick &&
        <button
          onClick={onAvaliacaoClick}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-200 ${showAvaliacaoActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50'}`}>
          
            <ClipboardListIcon
            className={`w-4 h-4 ${showAvaliacaoActive ? 'text-white' : 'text-indigo-400'}`} />
          

            <span className="hidden sm:inline">Avaliação</span>
            <span className="sm:hidden">Aval.</span>
          </button>
        }
        {onProcedimentosClick &&
        <button
          onClick={onProcedimentosClick}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-200 ${showProcedimentosActive ? 'bg-teal-600 text-white shadow-sm' : 'text-teal-600 hover:bg-teal-50'}`}>
          
            <ClipboardIcon
            className={`w-4 h-4 ${showProcedimentosActive ? 'text-white' : 'text-teal-400'}`} />
          

            <span className="hidden sm:inline">Procedimentos</span>
            <span className="sm:hidden">Proc.</span>
          </button>
        }
        {(onAvaliacaoClick || onProcedimentosClick) &&
        <div className="w-px h-5 bg-gray-300 mx-1 flex-shrink-0" />
        }
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeStep === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onStepChange(tab.id)}
              className={`
                relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium
                whitespace-nowrap transition-all duration-200
                ${isActive ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
              `}>
              
              <Icon
                className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              

              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>

              {tab.badge &&
              <span
                className={`
                  text-[9px] font-bold px-1.5 py-0.5 rounded ml-1
                  ${isActive ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'}
                `}>
                
                  {tab.badge}
                </span>
              }
            </button>);

        })}
      </div>
    </div>);

}