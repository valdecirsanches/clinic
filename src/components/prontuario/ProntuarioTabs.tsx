import React, { useEffect, useRef, useState } from 'react';
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
  SmileIcon,
  ChevronLeftIcon,
  ChevronRightIcon } from
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

export type EstadoAba = 'alterado' | 'salvando' | 'salvo' | 'erro';
interface ProntuarioTabsProps {
  activeStep: ProntuarioStep;
  onStepChange: (step: ProntuarioStep) => void;
  hiddenTabs?: ProntuarioStep[];
  onAvaliacaoClick?: () => void;
  onProcedimentosClick?: () => void;
  showAvaliacaoActive?: boolean;
  showProcedimentosActive?: boolean;
  /** Situação de salvamento por aba: ponto âmbar = não salvo, vermelho = erro. */
  estados?: Partial<Record<string, EstadoAba>>;
  /** Abas com registro neste atendimento (ponto verde discreto). */
  preenchidas?: Partial<Record<string, boolean>>;
  /** Conteúdo à direita da barra (status de salvamento, assinatura). */
  extra?: React.ReactNode;
}

/** Ordem usada pelos atalhos Alt+1…9 (abas visíveis, na ordem da barra). */
export function abasVisiveis(hiddenTabs: ProntuarioStep[] = []): ProntuarioStep[] {
  return TABS.filter((t) => !hiddenTabs.includes(t.id)).map((t) => t.id);
}

export function ProntuarioTabs({
  activeStep,
  onStepChange,
  hiddenTabs = [],
  onAvaliacaoClick,
  onProcedimentosClick,
  showAvaliacaoActive,
  showProcedimentosActive,
  estados = {},
  preenchidas = {},
  extra
}: ProntuarioTabsProps) {
  const visibleTabs = TABS.filter((tab) => !hiddenTabs.includes(tab.id));
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [setas, setSetas] = useState({ esq: false, dir: false });

  // Setas só aparecem quando as abas não cabem na largura disponível
  const medir = () => {
    const el = trilhoRef.current;
    if (!el) return;
    setSetas({ esq: el.scrollLeft > 4, dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    medir();
    const el = trilhoRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    el.addEventListener('scroll', medir, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', medir);
    };
  }, []);
  // A aba ativa sempre visível (inclusive ao trocar por atalho)
  useEffect(() => {
    const ativo = trilhoRef.current?.querySelector('[aria-selected="true"]') as HTMLElement | null;
    ativo?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeStep]);
  const rolar = (dir: 1 | -1) => trilhoRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

  const indice = new Map(visibleTabs.map((t, i) => [t.id, i + 1]));

  return (
    <div className="bg-white border-b border-gray-200 px-2 flex-shrink-0 flex items-center gap-2 min-h-[44px]">
      {setas.esq &&
      <button type="button" onClick={() => rolar(-1)} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0" aria-label="Abas anteriores">
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      }
      <div ref={trilhoRef} role="tablist" aria-label="Etapas do atendimento" className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-1 min-w-0 py-1">
        {onAvaliacaoClick &&
        <button
          type="button"
          onClick={onAvaliacaoClick}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${showAvaliacaoActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50'}`}>
            <ClipboardListIcon className={`w-4 h-4 ${showAvaliacaoActive ? 'text-white' : 'text-indigo-400'}`} />
            <span>Avaliação</span>
          </button>
        }
        {onProcedimentosClick &&
        <button
          type="button"
          onClick={onProcedimentosClick}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${showProcedimentosActive ? 'bg-teal-600 text-white shadow-sm' : 'text-teal-600 hover:bg-teal-50'}`}>
            <ClipboardIcon className={`w-4 h-4 ${showProcedimentosActive ? 'text-white' : 'text-teal-400'}`} />
            <span>Procedimentos</span>
          </button>
        }
        {(onAvaliacaoClick || onProcedimentosClick) &&
        <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
        }
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeStep === tab.id;
          const estado = estados[tab.id];
          const pendente = estado === 'alterado' || estado === 'salvando';
          const n = indice.get(tab.id) || 0;
          const atalho = n <= 9 ? ` (Alt+${n})` : '';
          const situacao = estado === 'erro' ? ' — erro ao salvar' : pendente ? ' — não salvo' : preenchidas[tab.id] ? ' — preenchido' : '';
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onStepChange(tab.id)}
              title={`${tab.label}${situacao}${atalho}`}
              className={`
                relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium
                whitespace-nowrap transition-colors
                ${isActive ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
              `}>
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              <span>{tab.label}</span>
              {(estado === 'erro' || pendente || preenchidas[tab.id]) &&
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full ${
                estado === 'erro' ? 'bg-red-500' :
                pendente ? 'bg-amber-400' :
                isActive ? 'bg-white/80' : 'bg-teal-500'}`
                } />
              }
              {tab.badge &&
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-1 ${isActive ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'}`}>
                  {tab.badge}
                </span>
              }
            </button>);
        })}
      </div>
      {setas.dir &&
      <button type="button" onClick={() => rolar(1)} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0" aria-label="Mais abas">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      }
      {extra && <div className="flex items-center gap-2 flex-shrink-0 pl-2 border-l border-gray-100">{extra}</div>}
    </div>);
}
