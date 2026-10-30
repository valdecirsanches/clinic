import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HandIcon,
  CheckCircleIcon } from
'lucide-react';
interface ProfissionalDisponivel {
  id: string;
  nome: string;
  titulo?: string;
  tipo?: string;
}
interface CalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  highlightedDates?: string[];
  availableDates?: string[];
  availableDatesProfessionals?: Record<string, ProfissionalDisponivel[]>;
  onProfessionalSelect?: (profId: string) => void;
  lockedDates?: string[]; // Dias com cadeado (fechados para agendamento)
  extraDates?: string[]; // Dias abertos como agenda extra (sem grade regular)
  openedDates?: string[]; // ⭐ Dias EXPLICITAMENTE abertos pelo usuário — usados como override visual para que dias abertos sem slots/consultas não caiam no fallback "futuro sem agenda"
  onToggleDayLock?: (dateKey: string, lock: boolean) => void; // Callback para abrir/fechar dia
  onOpenDayForProf?: (dateKey: string, profId: string) => void; // ⭐ Abre dia para profissional ESPECÍFICO (usado pelo menu de contexto em modo "Todos")
  profissionais?: Array<{
    id: string;
    nome: string;
    titulo?: string;
    tipo?: string;
  }>; // Todos os profissionais com agenda
  allAgendaProfByDate?: Record<
    string,
    Array<{
      id: string;
      nome: string;
      titulo?: string;
      tipo?: string;
    }>>;

  // Profissionais com agenda por data
  profissionalIdSelecionado?: string; // 'todos' ou ID específico
}
export function Calendar({
  selectedDate,
  onDateSelect,
  highlightedDates = [],
  availableDates = [],
  availableDatesProfessionals = {},
  onProfessionalSelect,
  lockedDates = [],
  extraDates = [],
  openedDates = [],
  onToggleDayLock,
  onOpenDayForProf,
  profissionais = [],
  allAgendaProfByDate = {},
  profissionalIdSelecionado = 'todos'
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  // ⭐ PERF: Estado local para destaque instantâneo (não espera re-render do App.tsx)
  const [localSelectedDate, setLocalSelectedDate] = useState(selectedDate);
  // Sincroniza com prop quando o pai atualiza (ex: navegação externa)
  useEffect(() => {
    setLocalSelectedDate(selectedDate);
  }, [selectedDate]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  // ⭐ Estado para mostrar mensagem "sem consultas" no right-click de dias vazios
  const [noConsultasPos, setNoConsultasPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const noConsultasTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // ⭐ Estado para mostrar aviso "dia fechado" ao clicar em dia bloqueado
  const [diaFechadoPos, setDiaFechadoPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const diaFechadoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // ⭐ NOVO: Menu de contexto para abrir/fechar dia
  const [contextMenu, setContextMenu] = useState<{
    dateKey: string;
    isLocked: boolean;
    top: number;
    left: number;
  } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'];

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    return days;
  };
  // ⭐ FIX: Usa data LOCAL em vez de UTC para evitar bug de timezone
  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear());

  };
  const isSelected = (date: Date) => {
    return (
      date.getDate() === localSelectedDate.getDate() &&
      date.getMonth() === localSelectedDate.getMonth() &&
      date.getFullYear() === localSelectedDate.getFullYear());

  };
  const hasAppointments = (date: Date) => {
    return highlightedDates.includes(formatDateKey(date));
  };
  const hasAvailableSlots = (date: Date) => {
    return availableDates.includes(formatDateKey(date));
  };
  // ⭐ Verifica se o dia está bloqueado (fechado para agendamento)
  const isLocked = (date: Date) => {
    return lockedDates.includes(formatDateKey(date));
  };
  // ⭐ Verifica se o dia é agenda extra (aberto sem grade regular)
  const isExtra = (date: Date) => {
    return extraDates.includes(formatDateKey(date));
  };
  // ⭐ Verifica se o dia foi EXPLICITAMENTE aberto pelo usuário
  const isOpened = (date: Date) => {
    return openedDates.includes(formatDateKey(date));
  };
  // ⭐ Verifica se é data futura (hoje ou depois)
  const isFutureOrToday = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(date);
    check.setHours(0, 0, 0, 0);
    return check >= today;
  };
  const previousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };
  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };
  const formatNomeCurto = (nome: string): string => {
    const partes = nome.trim().split(/\s+/);
    if (partes.length <= 2) return nome;
    // ⭐ FIX: Usa primeiro e segundo nome (não último)
    return `${partes[0]} ${partes[1]}`;
  };
  // ⭐ Cancela a troca de dia pendente (mouse atravessando o calendário)
  const cancelSwitchTimeout = useCallback(() => {
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }
  }, []);
  // ⭐ Cancela o timeout de esconder o tooltip
  const cancelHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);
  // ⭐ Agenda esconder o tooltip com delay (permite mover o mouse para o tooltip)
  const scheduleHide = useCallback(() => {
    cancelHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      setActiveDate(null);
      setTooltipPos(null);
    }, 200);
  }, [cancelHideTimeout]);
  // ⭐ Abre o tooltip de um dia (encostado na célula, sem vão no caminho)
  const abrirTooltip = (dateKey: string, btn: HTMLElement) => {
    cancelHideTimeout();
    setActiveDate(dateKey);
    if (calendarRef.current) {
      const calendarRect = calendarRef.current.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setTooltipPos({
        // Qualquer folga vertical faria o mouse passar por outro dia ao descer
        // até a lista, trocando a data ativa.
        top: btnRect.bottom - calendarRect.top,
        left: btnRect.left - calendarRect.left + btnRect.width / 2
      });
    }
  };
  // ⭐ Mostra o tooltip ao passar o mouse no dia
  const handleDayMouseEnter = (
  date: Date,
  event: React.MouseEvent<HTMLButtonElement>) =>
  {
    const dateKey = formatDateKey(date);
    const profs = availableDatesProfessionals[dateKey];
    if (!profs || profs.length === 0) return;
    cancelSwitchTimeout();
    // Já existe lista aberta em OUTRO dia: exige permanência sobre a nova
    // célula antes de trocar, para que atravessar o calendário a caminho da
    // lista não mude a data (e o profissional clicado não pertença a outro dia).
    if (activeDate && activeDate !== dateKey) {
      const btn = event.currentTarget;
      switchTimeoutRef.current = setTimeout(() => {
        switchTimeoutRef.current = null;
        abrirTooltip(dateKey, btn);
      }, 260);
      return;
    }
    abrirTooltip(dateKey, event.currentTarget);
  };
  const handleDayMouseLeave = () => {
    cancelSwitchTimeout();
    scheduleHide();
  };
  // ⭐ Quando o mouse entra no tooltip, cancela o hide
  const handleTooltipMouseEnter = () => {
    cancelSwitchTimeout();
    cancelHideTimeout();
  };
  // ⭐ Quando o mouse sai do tooltip, agenda o hide
  const handleTooltipMouseLeave = () => {
    scheduleHide();
  };
  // ⭐ NOVO: Toggle tooltip ao clicar no indicador âmbar
  const handleAvailableDotClick = (
  date: Date,
  event: React.MouseEvent<HTMLSpanElement>) =>
  {
    event.stopPropagation(); // Não seleciona o dia
    cancelSwitchTimeout();
    const dateKey = formatDateKey(date);
    const profs = availableDatesProfessionals[dateKey];
    if (!profs || profs.length === 0) return;
    // Toggle: se já está ativo nesse dia, fecha
    if (activeDate === dateKey) {
      setActiveDate(null);
      setTooltipPos(null);
      return;
    }
    const btn = event.currentTarget.closest('button');
    if (btn) abrirTooltip(dateKey, btn as HTMLElement);
  };
  // ⭐ Clique no profissional dentro do tooltip
  const handleProfClick = (profId: string) => {
    cancelSwitchTimeout();
    // ⭐ FIX: Também seleciona a data do tooltip para posicionar a agenda no dia correto
    if (activeDate) {
      // A lista só contém profissionais cujo dia JÁ está aberto, então aqui não
      // se abre nada — apenas posiciona a agenda na data e no profissional.
      const [year, month, day] = activeDate.split('-').map(Number);
      if (year && month && day) {
        onDateSelect(new Date(year, month - 1, day));
      }
    }
    if (onProfessionalSelect) {
      onProfessionalSelect(profId);
    }
    setActiveDate(null);
    setTooltipPos(null);
  };
  // ⭐ Fecha tooltip e menu de contexto ao clicar fora
  useEffect(() => {
    if (!activeDate && !contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current) {
        const target = e.target as HTMLElement;
        if (target.closest('[data-available-dot]')) return;
        // Fecha tooltip
        if (
        activeDate &&
        tooltipRef.current &&
        !tooltipRef.current.contains(target))
        {
          setActiveDate(null);
          setTooltipPos(null);
        }
        // Fecha menu de contexto (só se clicou FORA dele)
        if (contextMenu) {
          const contextMenuEl = document.querySelector('[data-context-menu]');
          if (!contextMenuEl || !contextMenuEl.contains(target)) {
            setContextMenu(null);
          }
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeDate, contextMenu]);
  // Cleanup timeout on unmount
  useEffect(
    () => () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
    },
    []
  );
  // Fecha tooltip e menu de contexto ao mudar de mês
  useEffect(() => {
    cancelSwitchTimeout();
    setActiveDate(null);
    setTooltipPos(null);
    setContextMenu(null);
  }, [currentMonth, cancelSwitchTimeout]);
  const days = getDaysInMonth(currentMonth);
  // ⭐ Só lista quem REALMENTE tem agenda naquela data. Sem esse cruzamento um
  // profissional aparecia na lista e, ao ser clicado, o dia respondia que ele
  // não tinha agenda.
  const activeProfs = (() => {
    if (!activeDate) return [];
    const disponiveis = availableDatesProfessionals[activeDate] || [];
    const comAgenda = allAgendaProfByDate[activeDate];
    if (!comAgenda || comAgenda.length === 0) return disponiveis;
    const idsComAgenda = new Set(comAgenda.map((p) => String(p.id)));
    return disponiveis.filter((p) => idsComAgenda.has(String(p.id)));
  })();
  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 relative"
      ref={calendarRef}>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={previousMonth}
          className="p-1 hover:bg-gray-100 rounded transition-colors">
          
          <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          onClick={nextMonth}
          className="p-1 hover:bg-gray-100 rounded transition-colors">
          
          <ChevronRightIcon className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Week days */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) =>
        <div
          key={day}
          className="text-center text-xs font-medium text-gray-500 py-1">
          
            {day}
          </div>
        )}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }
          const today = isToday(day);
          const selected = isSelected(day);
          const highlighted = hasAppointments(day);
          const locked = isLocked(day);
          const extra = !locked && isExtra(day);
          const opened = !locked && isOpened(day);
          const dateKey = formatDateKey(day);
          const isActiveDateCell = activeDate === dateKey;
          // Horários livres não abrem o dia: sem marcação real ou abertura manual,
          // a data permanece fechada. O ponto amarelo é apenas um indicador de vaga.
          const isFutureSemAgenda =
          isFutureOrToday(day) &&
          !isToday(day) &&
          !highlighted &&
          !extra &&
          !opened;
          const isBlocked = locked || isFutureSemAgenda;
          const available = !isBlocked && hasAvailableSlots(day);
          const hasProfsInfo =
          !isBlocked &&
          (availableDatesProfessionals[dateKey]?.length ?? 0) > 0;
          return (
            <button
              key={index}
              onClick={(e) => {
                if (isBlocked) {
                  // ⭐ Mostra aviso "Dia fechado" ao clicar em dia bloqueado
                  if (diaFechadoTimeoutRef.current)
                  clearTimeout(diaFechadoTimeoutRef.current);
                  if (calendarRef.current) {
                    const calendarRect =
                    calendarRef.current.getBoundingClientRect();
                    const btnRect = e.currentTarget.getBoundingClientRect();
                    setDiaFechadoPos({
                      top: btnRect.bottom - calendarRect.top + 6,
                      left:
                      btnRect.left - calendarRect.left + btnRect.width / 2
                    });
                  }
                  diaFechadoTimeoutRef.current = setTimeout(() => {
                    setDiaFechadoPos(null);
                  }, 2000);
                  return;
                }
                setLocalSelectedDate(day); // ⭐ PERF: Destaque instantâneo
                onDateSelect(day);
              }}
              onMouseEnter={(e) => handleDayMouseEnter(day, e)}
              onMouseLeave={handleDayMouseLeave}
              onContextMenu={(e) => {
                e.preventDefault();
                // Limpa estados anteriores
                if (noConsultasTimeoutRef.current)
                clearTimeout(noConsultasTimeoutRef.current);
                setNoConsultasPos(null);
                setContextMenu(null);
                // ⭐ FIX: Sempre mostra menu de contexto em dias futuros (mesmo bloqueados)
                // O right-click serve para ABRIR/FECHAR o dia
                if (isFutureOrToday(day)) {
                  // Modo "Todos": mostra lista de profissionais com agenda
                  // Modo profissional específico: mostra Abrir/Fechar dia
                  if (
                  profissionalIdSelecionado === 'todos' &&
                  profissionais.length > 0 &&
                  onProfessionalSelect)
                  {
                    const btnRect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      dateKey: formatDateKey(day),
                      isLocked: isBlocked,
                      top: btnRect.bottom + 6,
                      left: btnRect.left + btnRect.width / 2
                    });
                    return;
                  } else if (
                  onToggleDayLock &&
                  profissionalIdSelecionado !== 'todos')
                  {
                    const btnRect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      dateKey: formatDateKey(day),
                      isLocked: isBlocked,
                      top: btnRect.bottom + 6,
                      left: btnRect.left + btnRect.width / 2
                    });
                    return;
                  }
                }
                if (hasProfsInfo) {
                  const dateKey2 = formatDateKey(day);
                  if (activeDate === dateKey2) {
                    setActiveDate(null);
                    setTooltipPos(null);
                    return;
                  }
                  setActiveDate(dateKey2);
                  if (calendarRef.current) {
                    const calendarRect =
                    calendarRef.current.getBoundingClientRect();
                    const btnRect = e.currentTarget.getBoundingClientRect();
                    setTooltipPos({
                      top: btnRect.bottom - calendarRect.top + 6,
                      left:
                      btnRect.left - calendarRect.left + btnRect.width / 2
                    });
                  }
                } else {
                  // ⭐ Sem consultas — mostra tooltip temporário
                  setActiveDate(null);
                  setTooltipPos(null);
                  if (calendarRef.current) {
                    const calendarRect =
                    calendarRef.current.getBoundingClientRect();
                    const btnRect = e.currentTarget.getBoundingClientRect();
                    setNoConsultasPos({
                      top: btnRect.bottom - calendarRect.top + 6,
                      left:
                      btnRect.left - calendarRect.left + btnRect.width / 2
                    });
                  }
                  // Auto-esconde após 2 segundos
                  noConsultasTimeoutRef.current = setTimeout(() => {
                    setNoConsultasPos(null);
                  }, 2000);
                }
              }}
              className={`
                aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all relative
                ${isBlocked && !selected ? 'bg-orange-50 text-orange-700 cursor-pointer hover:bg-orange-100' : ''}
                ${selected && !isBlocked ? 'bg-teal-600 text-white shadow-md' : ''}
                ${selected && isBlocked ? 'bg-orange-200 text-orange-900' : ''}
                ${today && !selected && !isBlocked ? 'bg-teal-50 text-teal-700 font-bold' : ''}
                ${highlighted && !selected && !today && !isBlocked ? 'bg-teal-100/60 text-teal-800 font-semibold' : ''}
                ${extra && !selected && !today && !isBlocked ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-300' : ''}
                ${!isBlocked && !selected && !today && !highlighted && !extra ? 'hover:bg-gray-100 text-gray-700 cursor-pointer' : ''}
                ${highlighted && !selected && !isBlocked ? 'hover:bg-teal-100' : ''}
                ${extra && !selected && !isBlocked ? 'hover:bg-orange-100' : ''}
                ${isActiveDateCell ? 'ring-2 ring-amber-400 ring-offset-1' : ''}
              `}>
              
              {day.getDate()}
              {/* Fechado: ponto laranja e cadeado para tornar o estado inequívoco. */}
              {isBlocked && !extra &&
              <>
                  <HandIcon className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-orange-600" />
                  {!selected &&
                <span className="absolute bottom-0.5 w-1.5 h-1.5 bg-orange-500 rounded-full shadow-sm" />
                }
                </>
              }
              {/* ⭐ Indicador de agenda extra */}
              {extra &&
              <span
                className={`absolute top-0 right-0 text-[7px] font-bold ${selected ? 'text-white/80' : 'text-orange-600'}`}>
                
                  +
                </span>
              }
              {/* Indicators container */}
              <div className="absolute bottom-0.5 flex items-center gap-0.5">
                {highlighted && !selected &&
                <span className="w-1.5 h-1.5 bg-teal-600 rounded-full shadow-sm" />
                }
                {available &&
                <span
                  data-available-dot
                  onClick={(e) => handleAvailableDotClick(day, e)}
                  title="Ver profissionais com horários livres"
                  className="w-1.5 h-1.5 bg-amber-400 rounded-full shadow-sm cursor-pointer" />

                }
                {/* ⭐ FIX v26.3: Indicador para dia EXPLICITAMENTE ativado pelo usuário
                  quando ainda não há slots/consultas carregadas — assim o usuário vê
                  que o dia está ativo logo após clicar "Abrir dia". */}
                {opened &&
                !highlighted &&
                !available &&
                !extra &&
                !selected &&
                <span
                  className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-sm ring-1 ring-emerald-300"
                  title="Dia ativado" />

                }
              </div>
            </button>);

        })}
      </div>

      {/* ⭐ Tooltip com profissionais disponíveis — agora ativado por CLIQUE */}
      {activeDate && activeProfs.length > 0 && tooltipPos &&
      <div
        ref={tooltipRef}
        onMouseEnter={handleTooltipMouseEnter}
        onMouseLeave={handleTooltipMouseLeave}
        className="absolute z-50 bg-gray-900 text-white rounded-lg shadow-xl text-xs"
        style={{
          top: tooltipPos.top,
          left: Math.min(Math.max(tooltipPos.left - 90, 4), 140),
          width: 'max-content',
          maxWidth: '240px'
        }}>
        
          {/* Arrow */}
          <div
          className="absolute -top-1.5 w-3 h-3 bg-gray-900 rotate-45 rounded-sm"
          style={{
            left: 'calc(50% - 6px)'
          }} />
        

          <div className="relative px-3 pt-2.5 pb-1.5">
            <div className="font-semibold text-amber-300 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-amber-400 rounded-full inline-block flex-shrink-0" />
              Horários livres ({activeProfs.length})
            </div>
          </div>

          <div className="relative px-1.5 pb-1.5 max-h-[180px] overflow-y-auto">
            {activeProfs.slice(0, 10).map((prof, i) =>
          <button
            key={prof.id + '-' + i}
            onClick={() => handleProfClick(prof.id)}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/15 transition-colors flex items-center gap-2 group">
            
                <span className="text-gray-200 group-hover:text-white truncate transition-colors text-[11px]">
                  {prof.titulo ? `${prof.titulo} ` : ''}
                  {formatNomeCurto(prof.nome)}
                  {prof.tipo ?
              ` (${prof.tipo.substring(0, 3).toUpperCase()})` :
              ''}
                </span>
                <span className="ml-auto w-2 h-2 bg-amber-400 rounded-full flex-shrink-0" />
              </button>
          )}
            {activeProfs.length > 10 &&
          <div className="text-gray-500 italic text-center py-1">
                +{activeProfs.length - 10} mais...
              </div>
          }
          </div>
        </div>
      }

      {/* ⭐ Menu de contexto: Lista de profissionais (modo Todos) ou Abrir/Fechar dia (modo profissional) */}
      {contextMenu &&
      <div
        data-context-menu
        className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 text-sm overflow-hidden"
        style={{
          top: Math.min(contextMenu.top, window.innerHeight - 300),
          left: contextMenu.left,
          width: 'max-content',
          minWidth: '260px',
          maxWidth: '340px'
        }}>
        
          {/* Arrow pointing to the day cell */}
          <div
          className="fixed w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45 z-[10000]"
          style={{
            top: Math.min(contextMenu.top, window.innerHeight - 300) - 6,
            left: contextMenu.left + 20
          }} />
        

          <div className="relative">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              {contextMenu.dateKey.split('-').reverse().join('/')}
            </div>

            {/* MODO "TODOS": Lista de profissionais com agenda NAQUELE DIA */}
            {profissionalIdSelecionado === 'todos' &&
          profissionais.length > 0 ?
          <div className="max-h-[200px] overflow-y-auto">
                <div className="px-3 py-1.5 text-[11px] text-gray-400 font-medium uppercase tracking-wide">
                  Selecionar profissional
                </div>
                {/* Mostra profissionais COM AGENDA neste dia — amarelo se disponível, vermelho se fechado */}
                {(() => {
              const availableIds = new Set(
                (
                availableDatesProfessionals[contextMenu.dateKey] || []).
                map((p) => String(p.id))
              );
              const profsComAgenda =
              allAgendaProfByDate[contextMenu.dateKey] || [];
              return profsComAgenda.map((prof) => {
                const isAvailable = availableIds.has(String(prof.id));
                return (
                  <button
                    key={prof.id}
                    onClick={() => {
                      console.log(
                        `📅 [Calendar] Selecionou profissional: ${prof.nome} (${prof.id}) para ${contextMenu.dateKey}`
                      );
                      // Selecionar uma profissional apenas troca o contexto da Agenda.
                      // Não pode criar um override "aberto": se a data pertence à grade
                      // fixa, esse registro redundante a faria parecer Agenda Extra.
                      if (onProfessionalSelect)
                      onProfessionalSelect(prof.id);
                      onDateSelect(
                        new Date(
                          parseInt(contextMenu.dateKey.split('-')[0]),
                          parseInt(contextMenu.dateKey.split('-')[1]) - 1,
                          parseInt(contextMenu.dateKey.split('-')[2])
                        )
                      );
                      setContextMenu(null);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center gap-2 ${isAvailable ? 'text-gray-700 hover:text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}>
                    
                        <span className="truncate text-xs font-medium">
                          {prof.titulo ? `${prof.titulo} ` : ''}
                          {prof.nome}
                          {prof.tipo ?
                      ` (${prof.tipo.substring(0, 3).toUpperCase()})` :
                      ''}
                        </span>
                        {!isAvailable &&
                    <span className="text-[9px] text-red-400 font-medium flex-shrink-0">
                            FECHADO
                          </span>
                    }
                        <span
                      className={`ml-auto w-2.5 h-2.5 rounded-full flex-shrink-0 ${isAvailable ? 'bg-amber-400' : 'bg-red-500'}`} />
                    
                      </button>);

              });
            })()}
              </div> :
          onToggleDayLock /* MODO PROFISSIONAL: Abrir/Fechar dia */ ?
          contextMenu.isLocked ?
          <button
            onClick={() => {
              console.log(
                `📅 [Calendar] Clicou ABRIR dia: ${contextMenu.dateKey}`
              );
              onToggleDayLock(contextMenu.dateKey, false);
              // ⭐ FIX: navega para o dia recém-ativado para que o usuário
              // veja a mudança imediatamente na agenda (antes ficava na
              // data anterior e o usuário pensava que nada aconteceu).
              try {
                const [y, m, d] = contextMenu.dateKey.
                split('-').
                map(Number);
                const targetDate = new Date(y, (m || 1) - 1, d || 1);
                setLocalSelectedDate(targetDate);
                onDateSelect(targetDate);
              } catch {

                // ignore — best-effort
              }setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2.5 hover:bg-green-50 transition-colors flex items-center gap-2 text-green-700">
            
                  <CheckCircleIcon className="w-4 h-4" />
                  <span className="font-medium">Abrir dia</span>
                </button> :

          <button
            onClick={() => {
              console.log(
                `📅 [Calendar] Clicou FECHAR dia: ${contextMenu.dateKey}`
              );
              onToggleDayLock(contextMenu.dateKey, true);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2.5 hover:bg-red-50 transition-colors flex items-center gap-2 text-red-700">
            
                  <HandIcon className="w-4 h-4" />
                  <span className="font-medium">Fechar dia</span>
                </button> :

          null}
          </div>
        </div>
      }

      {/* ⭐ Tooltip "sem consultas" — aparece no right-click de dias sem agenda */}
      {noConsultasPos &&
      <div
        className="absolute z-50 bg-gray-700 text-white rounded-lg shadow-xl text-xs pointer-events-none animate-fade-in"
        style={{
          top: noConsultasPos.top,
          left: Math.min(Math.max(noConsultasPos.left - 70, 4), 140),
          width: 'max-content',
          maxWidth: '200px',
          animation: 'fadeInOut 2s ease-in-out forwards'
        }}>
        
          <div
          className="absolute -top-1.5 w-3 h-3 bg-gray-700 rotate-45 rounded-sm"
          style={{
            left: 'calc(50% - 6px)'
          }} />
        

          <div className="relative px-3 py-2 flex items-center gap-2">
            <span className="text-gray-400">📅</span>
            <span className="text-gray-200">Nenhuma consulta neste dia</span>
          </div>
        </div>
      }

      {/* ⭐ Tooltip "Dia fechado" — aparece ao clicar em dia bloqueado */}
      {diaFechadoPos &&
      <div
        className="absolute z-50 bg-orange-600 text-white rounded-lg shadow-xl text-xs pointer-events-none"
        style={{
          top: diaFechadoPos.top,
          left: Math.min(Math.max(diaFechadoPos.left - 80, 4), 140),
          width: 'max-content',
          maxWidth: '220px',
          animation: 'fadeInOut 2s ease-in-out forwards'
        }}>
        
          <div
          className="absolute -top-1.5 w-3 h-3 bg-orange-600 rotate-45 rounded-sm"
          style={{
            left: 'calc(50% - 6px)'
          }} />
        

          <div className="relative px-3 py-2 flex items-center gap-2">
            <HandIcon className="w-3.5 h-3.5 text-orange-200 flex-shrink-0" />
            <span className="text-white font-medium">
              Dia fechado — use botão direito para abrir
            </span>
          </div>
        </div>
      }

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-6 h-6 bg-teal-600 rounded flex items-center justify-center text-white font-medium">
            15
          </div>
          <span>Dia selecionado</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-6 h-6 bg-teal-50 rounded flex items-center justify-center text-teal-700 font-bold">
            {new Date().getDate()}
          </div>
          <span>Hoje</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-6 h-6 bg-teal-100/60 rounded flex items-center justify-center relative text-teal-800 font-semibold">
            10
            <span className="absolute bottom-0 w-1.5 h-1.5 bg-teal-600 rounded-full" />
          </div>
          <span>Com consultas</span>
        </div>
        {availableDates.length > 0 &&
        <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center relative">
              8
              <span className="absolute bottom-0 w-1.5 h-1.5 bg-amber-400 rounded-full" />
            </div>
            <span>
              Horário disponível{' '}
              <span className="text-gray-400">(botão direito para ver)</span>
            </span>
          </div>
        }
        {lockedDates.length > 0 &&
        <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-6 h-6 bg-orange-50 rounded flex items-center justify-center relative text-orange-700">
              <HandIcon className="w-3 h-3 text-orange-600" />
              <span className="absolute bottom-0.5 w-1.5 h-1.5 bg-orange-500 rounded-full" />
            </div>
            <span>
              Fechado — sem marcação
              <span className="text-gray-400">
                {' '}
                (botão direito → Abrir dia)
              </span>
            </span>
          </div>
        }
        {extraDates.length > 0 &&
        <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-6 h-6 bg-orange-50 rounded ring-1 ring-orange-300 flex items-center justify-center relative text-orange-800">
              <span className="absolute top-0 right-0 text-[7px] font-bold text-orange-600">
                +
              </span>
              5
            </div>
            <span>Agenda extra</span>
          </div>
        }
      </div>
    </div>);

}