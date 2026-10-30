import React, { useEffect, useState, Fragment } from 'react';
import {
  CalendarIcon,
  UsersIcon,
  SettingsIcon,
  LayoutDashboardIcon,
  BuildingIcon,
  UserCogIcon,
  Building2Icon,
  ClockIcon,
  XIcon,
  PillIcon,
  CreditCardIcon,
  ClipboardListIcon,
  BanknoteIcon,
  ReceiptIcon,
  MessageCircleIcon,
  HeartPulseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShieldIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  AwardIcon,
  FileSpreadsheetIcon,
  CameraIcon,
  ServerIcon,
  DatabaseIcon,
  VideoIcon } from
'lucide-react';
import { TipoUsuario, PERMISSOES_PADRAO, MenuItemId } from '../../types';
import { Calendar } from '../Calendar';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { API_BASE_URL } from '../../config/api';
import { APP_VERSION } from '../../config/version';
// ⭐ Itens "básicos" que ficam sempre visíveis (Pacientes, Empresas, Dashboard,
// Fila) mesmo quando o admin configurou uma whitelist customizada.
import { MENU_ITENS_BASICOS_SEMPRE_VISIVEIS } from '../../utils/permissoes';
// Tipos para o submenu de prontuário (mantido para compatibilidade)
export type ProntuarioStep =
'resumo' |
'anamnese' |
'exame_fisico' |
'diagnostico' |
'evolucao' |
'exames' |
'prescricoes' |
'memed' |
'relatorios' |
'atestado' |
'imagens';
interface SidebarProps {
  currentPage: string;
  /** Desktop: menu só com ícones (usado durante o atendimento, para dar espaço ao prontuário). */
  compacto?: boolean;
  onNavigate: (page: string) => void;
  tipoUsuario: TipoUsuario;
  permissoesMenu?: string[];
  showCalendar?: boolean;
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  highlightedDates?: string[];
  availableDates?: string[];
  availableDatesProfessionals?: Record<
    string,
    Array<{
      id: string;
      nome: string;
      titulo: string;
      tipo: string;
    }>>;

  lockedDates?: string[]; // ⭐ Dias com cadeado (fechados para agendamento)
  extraDates?: string[]; // ⭐ Dias abertos como agenda extra (sem grade regular)
  openedDates?: string[]; // ⭐ Dias EXPLICITAMENTE abertos pelo usuário (override visual)
  allAgendaProfByDate?: Record<
    string,
    Array<{
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
interface SubItemMenu {
  id: string;
  label: string;
  icon: React.ComponentType<{className?: string;}>;
  onlySuper?: boolean;
}
interface GrupoMenu {
  id: string;
  label: string;
  icon: React.ComponentType<{className?: string;}>;
  secao: 'administracao' | 'configuracoes';
  itens: SubItemMenu[];
}
// Grupos e itens em ordem alfabética. Itens "onlySuper" só aparecem para o
// super admin — que vê TODOS os itens, centralizados nestes grupos.
const GRUPOS_MENU: GrupoMenu[] = [
{
  id: 'cadastros',
  label: 'Cadastros',
  icon: Building2Icon,
  secao: 'administracao',
  itens: [
  { id: 'clinicas', label: 'Clínicas', icon: BuildingIcon },
  { id: 'convenios', label: 'Convênios', icon: HeartPulseIcon },
  { id: 'empresas_conveniadas', label: 'Empresas', icon: Building2Icon },
  { id: 'especialidades', label: 'Especialidades', icon: AwardIcon },
  { id: 'medicamentos', label: 'Medicamentos', icon: PillIcon },
  { id: 'operadoras', label: 'Operadoras', icon: Building2Icon, onlySuper: true },
  { id: 'planos_saude', label: 'Planos de Saúde', icon: HeartPulseIcon },
  { id: 'procedimentos', label: 'Procedimentos', icon: ClipboardListIcon },
  { id: 'usuarios', label: 'Usuários', icon: UserCogIcon }]

},
{
  id: 'financeiro',
  label: 'Financeiro',
  icon: BanknoteIcon,
  secao: 'administracao',
  itens: [
  { id: 'cobrancas', label: 'Cobranças', icon: BanknoteIcon },
  { id: 'assinatura_gestao', label: 'Gestão de Assinaturas', icon: CreditCardIcon, onlySuper: true },
  { id: 'assinatura', label: 'Minha Assinatura', icon: ReceiptIcon },
  { id: 'planos', label: 'Planos do Sistema', icon: CreditCardIcon, onlySuper: true }]

},
{
  id: 'ponto_grupo',
  label: 'Ponto',
  icon: ClockIcon,
  secao: 'administracao',
  itens: [
  { id: 'ponto_facial', label: 'Kiosk Ponto Facial', icon: CameraIcon },
  { id: 'ponto', label: 'Ponto / Frequência', icon: ClockIcon }]

},
{
  id: 'seguranca',
  label: 'Segurança',
  icon: ShieldCheckIcon,
  secao: 'administracao',
  itens: [
  { id: 'auditoria', label: 'Auditoria (LGPD)', icon: ShieldCheckIcon },
  { id: 'sessoes', label: 'Sessões Ativas', icon: UsersIcon, onlySuper: true }]

},
{
  id: 'sistema',
  label: 'Sistema',
  icon: ServerIcon,
  secao: 'administracao',
  itens: [
  { id: 'backup', label: 'Backup', icon: DatabaseIcon },
  { id: 'cid10', label: 'CID-10', icon: FileSpreadsheetIcon, onlySuper: true },
  { id: 'dossie', label: 'Dossiê de Configuração', icon: ServerIcon, onlySuper: true },
  { id: 'video_demo', label: 'Vídeo de Demonstração', icon: VideoIcon, onlySuper: true }]

},
{
  id: 'whatsapp',
  label: 'WhatsApp',
  icon: MessageCircleIcon,
  secao: 'administracao',
  itens: [
  { id: 'mensagens', label: 'Mensagens', icon: MessageCircleIcon },
  { id: 'whatsapp_meta', label: 'WhatsApp Oficial', icon: MessageCircleIcon }]

},
{
  id: 'configuracoes_grupo',
  label: 'Configurações',
  icon: SettingsIcon,
  secao: 'configuracoes',
  itens: [
  { id: 'configuracoes', label: 'Configurações da Clínica', icon: SettingsIcon },
  { id: 'configuracoes_globais', label: 'Configurações Globais', icon: SettingsIcon, onlySuper: true },
  { id: 'memed_profissionais', label: 'Memed', icon: PillIcon }]

}];

const adminSubItems: SubItemMenu[] = GRUPOS_MENU.flatMap((g) => g.itens);
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
  onCloseMobile = () => {},
  compacto = false
}: SidebarProps) {
  // Menu recolhido: só ícones no desktop. Passar o mouse (ou o foco) expande
  // por cima do conteúdo, sem empurrar o prontuário.
  const [expandidoTemp, setExpandidoTemp] = useState(false);
  const recolhido = compacto && !expandidoTemp && !isMobileOpen;
  useEffect(() => {
    if (!compacto) setExpandidoTemp(false);
  }, [compacto]);
  const [adminPodeVerPlanos, setAdminPodeVerPlanos] = useState(false);
  const grupoDaPagina = GRUPOS_MENU.find((g) => g.itens.some((i) => i.id === currentPage));
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(
    () => new Set(grupoDaPagina ? [grupoDaPagina.secao, grupoDaPagina.id] : [])
  );
  // Ao navegar para uma tela, abre a seção e o grupo dela
  useEffect(() => {
    if (!grupoDaPagina) return;
    setGruposAbertos((atual) => {
      if (atual.has(grupoDaPagina.id) && atual.has(grupoDaPagina.secao)) return atual;
      const novo = new Set(atual);
      novo.add(grupoDaPagina.id);
      novo.add(grupoDaPagina.secao);
      return novo;
    });
  }, [grupoDaPagina]);
  const alternarGrupo = (id: string) =>
  setGruposAbertos((atual) => {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id);else
    novo.add(id);
    return novo;
  });
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
        const response = await fetch(
          `${API_BASE_URL}/api/configuracoes-globais/permissoes_config`
        );
        if (response.ok) {
          const data = await response.json();
          const valor =
          typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
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
  const menuItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboardIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    icon: UsersIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
    // }, {
    //   id: 'importacao',
    //   label: 'Importação',
    //   icon: FileSpreadsheetIcon,
    //   permissoes: ['super_admin', 'admin']
  },
  {
    id: 'fila_atendimento',
    label: 'Fila chegada',
    icon: ClockIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: CalendarIcon,
    permissoes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente']
  }];

  const menuItemsFiltrados = menuItems.filter((item) => {
    // ⭐ Itens básicos do sistema ficam sempre visíveis — independente de
    // permissoesMenu — para evitar bloqueios "em cascata" indesejados.
    if (
    (MENU_ITENS_BASICOS_SEMPRE_VISIVEIS as readonly string[]).includes(
      item.id
    ))
    {
      return true;
    }
    if (permissoesMenu && permissoesMenu.length > 0) {
      return permissoesMenu.includes(item.id);
    }
    return item.permissoes.includes(tipoUsuario);
  });
  // ⭐ Itens que admin SEMPRE vê (mesmo com permissões customizadas antigas)
  const adminSempreVisivel = [
  'assinatura',
  'backup',
  'especialidades',
  'auditoria',
  'usuarios',
  'clinicas',
  'ponto',
  'ponto_facial'];

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
    // ⭐ Itens básicos ficam sempre visíveis no admin também (ex.: Empresas).
    if (
    (MENU_ITENS_BASICOS_SEMPRE_VISIVEIS as readonly string[]).includes(
      item.id
    ))
    {
      return true;
    }
    if (permissoesMenu && permissoesMenu.length > 0) {
      return permissoesMenu.includes(item.id);
    }
    return true;
  });
  const idsVisiveis = new Set(adminSubItemsFiltrados.map((i) => i.id));
  const gruposVisiveis = GRUPOS_MENU.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => idsVisiveis.has(i.id))
  })).filter((g) => g.itens.length > 0);
  const podeVerAdmin =
  tipoUsuario === 'super_admin' ||
  tipoUsuario === 'admin' ||
  permissoesMenu && adminSubItemsFiltrados.length > 0;
  const SECOES = [
  { id: 'administracao' as const, label: 'Administração', icon: ShieldIcon },
  { id: 'configuracoes' as const, label: 'Configurações', icon: SettingsIcon }];

  // ⭐ Wrapper para navegação que fecha sidebar no mobile
  const handleNavigate = (page: string) => {
    onNavigate(page);
    onCloseMobile();
    setExpandidoTemp(false);
  };
  return (
    <>
      {/* ⭐ Backdrop overlay para mobile */}
      {isMobileOpen &&
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={onCloseMobile} />

      }

      {/* Espaço reservado do menu recolhido (o menu expandido flutua por cima) */}
      {compacto && <div className="hidden lg:block w-16 shrink-0" aria-hidden="true" />}
      <aside
        onMouseEnter={compacto ? () => setExpandidoTemp(true) : undefined}
        onMouseLeave={compacto ? () => setExpandidoTemp(false) : undefined}
        className={`
          ${showCalendar ? 'w-80' : 'w-64'} ${recolhido ? 'lg:w-16' : ''}
          ${compacto ? 'lg:!absolute lg:!h-full lg:left-0 lg:top-0 lg:!z-40 lg:shadow-lg' : ''}
          bg-white border-r border-gray-200 h-full flex flex-col transition-all duration-200 shrink-0 overflow-hidden
          
          /* ⭐ Mobile: fixed overlay, slide in/out */
          fixed top-0 left-0 z-50 h-screen
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          
          /* ⭐ Desktop: static, always visible, z-index alto para select sobrepor conteúdo */
          lg:static lg:translate-x-0 lg:z-20 lg:h-full
        `}>
        
        <div className={`p-6 border-b border-gray-200 flex items-center justify-between ${recolhido ? 'lg:hidden' : ''}`}>
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
                  const operadoraId =
                  sessao.operadoraSelecionada?.id ||
                  sessao.usuario?.operadoraId ||
                  '';
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
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <nav
          className={`flex-1 ${recolhido ? 'p-4 lg:p-2' : 'p-4'} overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400`}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#d1d5db transparent'
          }}>
          
          {menuItemsFiltrados.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <Fragment key={item.id}>
                <button
                  data-menu-id={item.id}
                  onClick={() => handleNavigate(item.id)}
                  title={recolhido ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${recolhido ? 'lg:justify-center lg:px-0' : ''} ${isActive ? 'bg-teal-50 text-teal-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className={`whitespace-nowrap ${recolhido ? 'lg:hidden' : ''}`}>{item.label}</span>
                </button>

                {item.id === 'agenda' && showCalendar && !recolhido &&
                <div className="my-4 space-y-3">
                    {profissionais.length > 0 &&
                  !['medico', 'dentista'].includes(tipoUsuario) &&
                  <div className="px-2">
                          <Select
                      label=""
                      value={profissionalIdSelecionado}
                      onChange={(e) =>
                      onProfissionalIdChange(e.target.value)
                      }
                      options={[
                      {
                        value: 'todos',
                        label: '👥 Todos'
                      },
                      ...profissionais.map((prof) => ({
                        value: prof.id,
                        //label: `👨‍⚕️ ${prof.titulo || '...'}  ${prof.nome} (${prof.tipo?.substring(0, 3).toUpperCase()})`
                        label: `${prof.titulo?.toLowerCase() === 'dra.' ? '👩‍⚕️' : '👨‍⚕️'} ${prof.titulo || '...'} ${prof.nome} (${prof.tipo?.substring(0, 3).toUpperCase()})`
                      }))]
                      } />
                    
                        </div>
                  }

                    <Calendar
                    selectedDate={selectedDate}
                    onDateSelect={onDateSelect}
                    highlightedDates={highlightedDates}
                    availableDates={availableDates}
                    availableDatesProfessionals={availableDatesProfessionals}
                    onProfessionalSelect={onProfissionalIdChange}
                    lockedDates={lockedDates}
                    extraDates={extraDates}
                    openedDates={openedDates}
                    onToggleDayLock={onToggleDayLock}
                    onOpenDayForProf={onOpenDayForProf}
                    profissionais={profissionais}
                    allAgendaProfByDate={allAgendaProfByDate}
                    profissionalIdSelecionado={profissionalIdSelecionado} />
                  
                  </div>
                }
              </Fragment>);

          })}

          {podeVerAdmin &&
          SECOES.map((secao, indiceSecao) => {
            const grupos = gruposVisiveis.filter((g) => g.secao === secao.id);
            if (!grupos.length) return null;
            const secaoAberta = gruposAbertos.has(secao.id);
            const secaoAtiva = grupoDaPagina?.secao === secao.id;
            // A seção Configurações tem um único grupo: os itens ficam
            // direto nela, sem um segundo nível redundante.
            const plano = grupos.length === 1;
            const SecaoIcon = secao.icon;
            return (
              <div
                key={secao.id}
                className={indiceSecao === 0 ? 'mt-4 pt-4 border-t border-gray-100' : 'mt-1'}>
                
                  <button
                  onClick={() => alternarGrupo(secao.id)}
                  aria-expanded={secaoAberta}
                  title={recolhido ? secao.label : undefined}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg mb-1 transition-colors ${recolhido ? 'lg:justify-center lg:px-0' : ''} ${secaoAtiva ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  
                    <span className="flex items-center gap-3">
                      <SecaoIcon className="w-5 h-5 shrink-0" />
                      <span className={`whitespace-nowrap ${recolhido ? 'lg:hidden' : ''}`}>{secao.label}</span>
                    </span>
                    <span className={recolhido ? 'lg:hidden' : ''}>
                    {secaoAberta ?
                  <ChevronDownIcon className="w-4 h-4" /> :
                  <ChevronRightIcon className="w-4 h-4" />
                  }
                    </span>
                  </button>
                  {secaoAberta && !recolhido &&
                <div className="ml-2 border-l-2 border-gray-100 pl-2 space-y-0.5">
                      {grupos.map((grupo) => {
                    const grupoAberto = plano || gruposAbertos.has(grupo.id);
                    const grupoAtivo = grupoDaPagina?.id === grupo.id;
                    const GrupoIcon = grupo.icon;
                    return (
                      <div key={grupo.id}>
                            {!plano &&
                        <button
                          onClick={() => alternarGrupo(grupo.id)}
                          aria-expanded={grupoAberto}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${grupoAtivo ? 'text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                          
                                <span className="flex items-center gap-2">
                                  <GrupoIcon className={`w-4 h-4 ${grupoAtivo ? 'text-purple-600' : 'text-gray-500'}`} />
                                  {grupo.label}
                                </span>
                                {grupoAberto ?
                          <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" /> :

                          <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />
                          }
                              </button>
                        }
                            {grupoAberto &&
                        <div className={plano ? 'space-y-0.5' : 'ml-3 pl-2 border-l border-gray-100 space-y-0.5 mb-1'}>
                                {grupo.itens.map((subItem) => {
                            const SubIcon = subItem.icon;
                            const isSubActive = currentPage === subItem.id;
                            return (
                              <button
                                key={subItem.id}
                                data-menu-id={subItem.id}
                                onClick={() => handleNavigate(subItem.id)}
                                aria-current={isSubActive ? 'page' : undefined}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors ${isSubActive ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                
                                      <SubIcon className={`w-4 h-4 shrink-0 ${isSubActive ? 'text-purple-600' : 'text-gray-400'}`} />
                                      <span className="truncate">{subItem.label}</span>
                                    </button>);

                          })}
                              </div>
                        }
                          </div>);

                  })}
                    </div>
                }
                </div>);

          })}
        </nav>
      </aside>
    </>);

}