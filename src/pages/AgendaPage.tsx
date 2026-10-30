import React, { useEffect, useState, Fragment } from 'react';
import { CalendarIcon, UsersIcon, SettingsIcon, LayoutDashboardIcon, BuildingIcon, UserCogIcon, Building2Icon, ClockIcon, XIcon, PillIcon, CreditCardIcon, ClipboardListIcon, BanknoteIcon, MessageCircleIcon, HeartPulseIcon, ChevronDownIcon, ChevronRightIcon, ShieldIcon, ShieldCheckIcon, StethoscopeIcon, AwardIcon, FileSpreadsheetIcon } from 'lucide-react';
import { TipoUsuario, PERMISSOES_PADRAO, MenuItemId } from '../types';
import { Calendar } from '../components/Calendar';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { API_BASE_URL } from '../config/api';
import { APP_VERSION } from '../config/version';
// Tipos para o submenu de prontuário (mantido para compatibilidade)
export type ProntuarioStep = 'resumo' | 'anamnese' | 'exame_fisico' | 'diagnostico' | 'evolucao' | 'exames' | 'prescricoes' | 'memed' | 'relatorios' | 'atestado' | 'imagens';
interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  tipoUsuario: TipoUsuario;
  permissoesMenu?: string[];
  showCalendar?: boolean;
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  highlightedDates?: string[];
  availableDates?: string[];
  availableDatesProfessionals?: Record<string, Array<{
    id: string;
    nome: string;
    titulo: string;
    tipo: string;
  }>>;
  lockedDates?: string[]; // ⭐ Dias com cadeado (fechados para agendamento)
  extraDates?: string[]; // ⭐ Dias abertos como agenda extra (sem grade regular)
  openedDates?: string[]; // ⭐ Dias EXPLICITAMENTE abertos pelo usuário (override visual)
  allAgendaProfByDate?: Record<string, Array<{
    id: string;
    nome: string;
    titulo: string;
    tipo: string;
  }>>;
  onToggleDayLock?: (dateKey: string, lock: boolean) => void; // ⭐ Callback para abrir/fechar dia
  onOpenDayForProf?: (dateKey: string, profId: string) => void; // ⭐ Abre dia para profissional ESPECÍFICO (modo "Todos" no menu de contexto)
  profissionais?: Array<{
    id: string;
    nome: string;
    titulo: string;
    tipo: string;
  }>;
  profissionalIdSelecionado?: string;
  onProfissionalIdChange?: (profissionalId: string) => void;
  prontuarioStep?: ProntuarioStep;
  onProntuarioStepChange?: (step: ProntuarioStep) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}
// Itens do submenu de Administração (ordem alfabética)
const adminSubItems = [{
  id: 'auditoria',
  label: 'Auditoria (LGPD)',
  icon: ShieldCheckIcon
}, {
  id: 'biometria',
  label: 'Biometria / Ponto',
  icon: ShieldCheckIcon
}, {
  id: 'cid10',
  label: 'CID-10',
  icon: FileSpreadsheetIcon,
  onlySuper: true
}, {
  id: 'clinicas',
  label: 'Clínicas',
  icon: BuildingIcon
}, {
  id: 'cobrancas',
  label: 'Cobranças',
  icon: BanknoteIcon
}, {
  id: 'configuracoes',
  label: 'Configurações',
  icon: SettingsIcon
}, {
  id: 'configuracoes_globais',
  label: 'Config. Globais',
  icon: SettingsIcon,
  onlySuper: true
}, {
  id: 'convenios',
  label: 'Convênios',
  icon: HeartPulseIcon
}, {
  id: 'empresas_conveniadas',
  label: 'Empresas',
  icon: Building2Icon
}, {
  id: 'especialidades',
  label: 'Especialidades',
  icon: AwardIcon
}, {
  id: 'medicamentos',
  label: 'Medicamentos',
  icon: PillIcon
}, {
  id: 'memed_profissionais',
  label: 'Memed',
  icon: PillIcon
}, {
  id: 'mensagens',
  label: 'Mensagens',
  icon: MessageCircleIcon
}, {
  id: 'operadoras',
  label: 'Operadoras',
  icon: Building2Icon,
  onlySuper: true
}, {
  id: 'planos',
  label: 'Planos Sistema',
  icon: CreditCardIcon,
  onlySuper: true
}, {
  id: 'planos_saude',
  label: 'Planos de Saúde',
  icon: HeartPulseIcon
}, {
  id: 'procedimentos',
  label: 'Procedimentos',
  icon: ClipboardListIcon
}, {
  id: 'sessoes',
  label: 'Sessões Ativas',
  icon: UsersIcon,
  onlySuper: true
}, {
  id: 'usuarios',
  label: 'Usuários',
  icon: UserCogIcon
}];
export function Sidebar({
  currentPage,
  onNavigate,
  tipoUsuario,
  permissoesMenu,
  showCalendar = false,
  selectedDate = new Date(),
  onDateSelect = () => {},
  highlightedDates = [],
  availableDates = [],
  availableDatesProfessionals = {},
  allAgendaProfByDate = {},
  lockedDates = [],
  extraDates = [],
  openedDates = [],
  onToggleDayLock,
  onOpenDayForProf,
  profissionais = [],
  profissionalIdSelecionado = 'todos',
  onProfissionalIdChange = () => {},
  prontuarioStep = 'anamnese',
  onProntuarioStepChange = () => {},
  isMobileOpen = false,
  onCloseMobile = () => {}
}: SidebarProps) {
  const [adminPodeVerPlanos, setAdminPodeVerPlanos] = useState(false);
  const [isAdminExpanded, setIsAdminExpanded] = useState(false);
  const adminPages = adminSubItems.map((item) => item.id);
  const isInAdminPage = adminPages.includes(currentPage);
  useEffect(() => {
    console.log('🔐 [Sidebar] Permissões recebidas:', {
      tipoUsuario,
      permissoesMenu,
      temPermissoesCustomizadas: permissoesMenu && permissoesMenu.length > 0
    });
  }, [tipoUsuario, permissoesMenu]);
  useEffect(() => {
    const fetchPermissoes = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/configuracoes-globais/permissoes_config`);
        if (response.ok) {
          const data = await response.json();
          const valor = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
          setAdminPodeVerPlanos(valor?.adminPodeVerPlanos || false);
        }
      } catch (err) {
        console.error('Erro ao carregar permissões:', err);
      }
    };
    if (tipoUsuario === 'admin') {
      fetchPermissoes();
    }
  }, [tipoUsuario]);
  const menuItems = [{
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboardIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  }, {
    id: 'pacientes',
    label: 'Pacientes',
    icon: UsersIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  }, {
    id: 'fila_atendimento',
    label: 'Fila chegada',
    icon: ClockIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  }, {
    id: 'agenda',
    label: 'Agenda',
    icon: CalendarIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  }];
  const menuItemsFiltrados = menuItems.filter((item) => {
    if (permissoesMenu && permissoesMenu.length > 0) {
      return permissoesMenu.includes(item.id);
    }
    return item.permissoes.includes(tipoUsuario);
  });
  // ⭐ Itens que admin SEMPRE vê (mesmo com permissões customizadas antigas)
  const adminSempreVisivel = ['especialidades', 'auditoria', 'usuarios', 'clinicas'];
  const adminSubItemsFiltrados = adminSubItems.filter((item) => {
    // super_admin sempre vê todos os itens admin
    if (tipoUsuario === 'super_admin') return true;
    if (item.onlySuper) {
      if (item.id === 'planos' && adminPodeVerPlanos) {
        return true;
      }
      return false;
    }
    // ⭐ FIX: Admin sempre vê itens essenciais (especialidades, auditoria, etc.)
    if (tipoUsuario === 'admin' && adminSempreVisivel.includes(item.id)) {
      return true;
    }
    if (permissoesMenu && permissoesMenu.length > 0) {
      return permissoesMenu.includes(item.id);
    }
    return true;
  });
  const podeVerAdmin = tipoUsuario === 'super_admin' || tipoUsuario === 'admin' || permissoesMenu && adminSubItemsFiltrados.length > 0;
  // ⭐ Wrapper para navegação que fecha sidebar no mobile
  const handleNavigate = (page: string) => {
    onNavigate(page);
    onCloseMobile();
  };
  return <>
      {/* ⭐ Backdrop overlay para mobile */}
      {isMobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onCloseMobile} />}

      <aside className={`
          ${showCalendar ? 'w-80' : 'w-64'} 
          bg-white border-r border-gray-200 h-full flex flex-col transition-all duration-300 shrink-0
          
          /* ⭐ Mobile: fixed overlay, slide in/out */
          fixed top-0 left-0 z-50 h-screen
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          
          /* ⭐ Desktop: static, always visible */
          lg:static lg:translate-x-0 lg:z-auto lg:h-full
        `}>
        
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-teal-600">EasyClin 2.0</h1>
            <p className="text-sm text-gray-500">Gestão Clínica</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {APP_VERSION} •{' '}
              {(() => {
              if (typeof window === 'undefined') return 'DB: N/A';
              const sessaoStr = localStorage.getItem('sessao');
              if (!sessaoStr) return 'DB: N/A';
              try {
                const sessao = JSON.parse(sessaoStr);
                const clinicaId = sessao.clinicaAtual?.id;
                const operadoraId = sessao.operadoraSelecionada?.id || sessao.usuario?.operadoraId || '';
                const opLabel = operadoraId ? ` • OP: ${operadoraId}` : '';
                if (clinicaId) {
                  return `DB: ${clinicaId}${opLabel}`;
                }
                if (sessao.operadoraSelecionada) {
                  return `DB: Selecione uma clínica${opLabel}`;
                }
                if (sessao.usuario?.tipo === 'super_admin') {
                  return 'DB: Selecione uma operadora';
                }
                return 'DB: N/A';
              } catch {
                return 'DB: N/A';
              }
            })()}
            </p>
          </div>
          {/* ⭐ Botão fechar no mobile */}
          <button onClick={onCloseMobile} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400" style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#d1d5db transparent'
      }}>
          
          {menuItemsFiltrados.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return <Fragment key={item.id}>
                <button onClick={() => handleNavigate(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${isActive ? 'bg-teal-50 text-teal-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>

                {item.id === 'agenda' && showCalendar && <div className="my-4 space-y-3">
                    {profissionais.length > 0 && !['medico', 'dentista'].includes(tipoUsuario) && <div className="px-2">
                          <Select label="" value={profissionalIdSelecionado} onChange={(e) => onProfissionalIdChange(e.target.value)} options={[{
                  value: 'todos',
                  label: '👥 Todos'
                }, ...profissionais.map((prof) => ({
                  value: prof.id,
                  label: `👨‍⚕️ ${prof.titulo || '...'}  ${prof.nome} (${prof.tipo})`
                }))]} />
                    
                        </div>}

                    <Calendar selectedDate={selectedDate} onDateSelect={onDateSelect} highlightedDates={highlightedDates} availableDates={availableDates} availableDatesProfessionals={availableDatesProfessionals} onProfessionalSelect={onProfissionalIdChange} lockedDates={lockedDates} extraDates={extraDates} openedDates={openedDates} onToggleDayLock={onToggleDayLock} onOpenDayForProf={onOpenDayForProf} profissionais={profissionais} allAgendaProfByDate={allAgendaProfByDate} profissionalIdSelecionado={profissionalIdSelecionado} />
                  
                  </div>}
              </Fragment>;
        })}

          {podeVerAdmin && <div className="mt-4 pt-4 border-t border-gray-100">
              <button onClick={() => setIsAdminExpanded(!isAdminExpanded)} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg mb-1 transition-colors ${isInAdminPage ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
              
                <div className="flex items-center gap-3">
                  <ShieldIcon className="w-5 h-5" />
                  <span>Administração</span>
                </div>
                {isAdminExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
              </button>

              {isAdminExpanded && <div className="ml-2 border-l-2 border-gray-100 pl-2 space-y-0.5">
                  {adminSubItemsFiltrados.map((subItem) => {
              const SubIcon = subItem.icon;
              const isSubActive = currentPage === subItem.id;
              return <button key={subItem.id} onClick={() => handleNavigate(subItem.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isSubActive ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                    
                        <SubIcon className={`w-4 h-4 ${isSubActive ? 'text-purple-600' : 'text-gray-400'}`} />
                    

                        <span>{subItem.label}</span>
                      </button>;
            })}
                </div>}
            </div>}
        </nav>
      </aside>
    </>;
}