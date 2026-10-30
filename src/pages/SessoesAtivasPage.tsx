import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCwIcon, WifiIcon, CalendarIcon, ClockIcon, CalendarDaysIcon, MonitorIcon, UserIcon, BuildingIcon, ActivityIcon, SearchIcon, FilterIcon, XIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface Session {
  id: number;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioTipo: string;
  clinicaId: string;
  clinicaNome: string;
  operadoraNome: string;
  loginEm: string;
  ultimaAtividade: string;
  logoutEm: string | null;
  ip: string;
  ativo: number;
  online: number;
}
interface Stats {
  onlineAgora: number;
  loginHoje: number;
  loginSemana: number;
  loginMes: number;
  totalSessoesHoje: number;
}
type FiltroType = 'agora' | 'hoje' | 'semana' | 'mes';
export function SessoesAtivasPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats>({
    onlineAgora: 0,
    loginHoje: 0,
    loginSemana: 0,
    loginMes: 0,
    totalSessoesHoje: 0
  });
  const [filtro, setFiltro] = useState<FiltroType>('hoje');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [searchText, setSearchText] = useState('');
  const [filtroClinica, setFiltroClinica] = useState('');
  const [filtroOperadora, setFiltroOperadora] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);else setIsRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions?filtro=${filtro}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
        setStats(data.stats || {
          onlineAgora: 0,
          loginHoje: 0,
          loginSemana: 0,
          loginMes: 0,
          totalSessoesHoje: 0
        });
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Erro ao buscar sessões:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filtro]);
  // Initial fetch and when filter changes
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);
  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);
  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo?.toLowerCase()) {
      case 'super_admin':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'admin':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'medico':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'dentista':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'atendente':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  const formatTipo = (tipo: string) => {
    if (!tipo) return '-';
    return tipo.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  // ⭐ NOVO: Extrair opções únicas dos dados carregados
  const clinicasUnicas = useMemo(() => {
    const set = new Set(sessions.map((s) => s.clinicaNome).filter(Boolean));
    return Array.from(set).sort();
  }, [sessions]);
  const operadorasUnicas = useMemo(() => {
    const set = new Set(sessions.map((s) => s.operadoraNome).filter(Boolean));
    return Array.from(set).sort();
  }, [sessions]);
  const tiposUnicos = useMemo(() => {
    const set = new Set(sessions.map((s) => s.usuarioTipo).filter(Boolean));
    return Array.from(set).sort();
  }, [sessions]);
  // ⭐ NOVO: Sessões filtradas
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (searchText) {
        const search = searchText.toLowerCase();
        const matchName = (s.usuarioNome || '').toLowerCase().includes(search);
        const matchEmail = (s.usuarioEmail || '').toLowerCase().includes(search);
        const matchIp = (s.ip || '').includes(search);
        if (!matchName && !matchEmail && !matchIp) return false;
      }
      if (filtroClinica && s.clinicaNome !== filtroClinica) return false;
      if (filtroOperadora && s.operadoraNome !== filtroOperadora) return false;
      if (filtroTipo && s.usuarioTipo !== filtroTipo) return false;
      return true;
    });
  }, [sessions, searchText, filtroClinica, filtroOperadora, filtroTipo]);
  const hasActiveFilters = searchText || filtroClinica || filtroOperadora || filtroTipo;
  const clearFilters = () => {
    setSearchText('');
    setFiltroClinica('');
    setFiltroOperadora('');
    setFiltroTipo('');
  };
  return <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ActivityIcon className="w-6 h-6 text-blue-600" />
            Sessões de Usuários
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitore quem está acessando o sistema em tempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Atualizado: {lastRefresh.toLocaleTimeString('pt-BR')}
          </span>
          <button onClick={() => fetchData(true)} disabled={isLoading || isRefreshing} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors">
            
            <RefreshCwIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => setFiltro('agora')} className={`bg-white p-5 rounded-xl border shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${filtro === 'agora' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-200 hover:border-green-300'}`}>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Online Agora</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.onlineAgora || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
              <WifiIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div onClick={() => setFiltro('hoje')} className={`bg-white p-5 rounded-xl border shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${filtro === 'hoje' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-300'}`}>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Logins Hoje</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.loginHoje || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div onClick={() => setFiltro('semana')} className={`bg-white p-5 rounded-xl border shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${filtro === 'semana' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-200 hover:border-purple-300'}`}>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Esta Semana</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.loginSemana || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
              <ClockIcon className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div onClick={() => setFiltro('mes')} className={`bg-white p-5 rounded-xl border shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${filtro === 'mes' ? 'border-orange-500 ring-1 ring-orange-500' : 'border-gray-200 hover:border-orange-300'}`}>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Este Mês</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.loginMes || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center">
              <CalendarDaysIcon className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ⭐ NOVO: Barra de Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar por nome, email ou IP..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            
          </div>
          <select value={filtroClinica} onChange={(e) => setFiltroClinica(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[160px]">
            
            <option value="">Todas Clínicas</option>
            {clinicasUnicas.map((c) => <option key={c} value={c}>
                {c}
              </option>)}
          </select>
          <select value={filtroOperadora} onChange={(e) => setFiltroOperadora(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[160px]">
            
            <option value="">Todas Operadoras</option>
            {operadorasUnicas.map((o) => <option key={o} value={o}>
                {o}
              </option>)}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[140px]">
            
            <option value="">Todos Tipos</option>
            {tiposUnicos.map((t) => <option key={t} value={t}>
                {formatTipo(t)}
              </option>)}
          </select>
          {hasActiveFilters && <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            
              <XIcon className="w-4 h-4" />
              Limpar
            </button>}
        </div>
        {hasActiveFilters && <p className="text-xs text-gray-500 mt-2">
            Mostrando {filteredSessions.length} de {sessions.length} sessões
          </p>}
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50/50 px-4 sm:px-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {[{
            id: 'agora',
            label: 'Online Agora'
          }, {
            id: 'hoje',
            label: 'Hoje'
          }, {
            id: 'semana',
            label: 'Últimos 7 dias'
          }, {
            id: 'mes',
            label: 'Últimos 30 dias'
          }].map((tab) => <button key={tab.id} onClick={() => setFiltro(tab.id as FiltroType)} className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${filtro === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}>
              
                {tab.label}
              </button>)}
          </nav>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[400px]">
          {isLoading ? <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <RefreshCwIcon className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-gray-500 font-medium">Carregando sessões...</p>
            </div> : filteredSessions.length === 0 ? <div className="flex flex-col items-center justify-center h-64 space-y-3 text-gray-500">
              <MonitorIcon className="w-12 h-12 text-gray-300" />
              <p className="text-lg font-medium text-gray-900">
                Nenhuma sessão encontrada
              </p>
              <p className="text-sm">
                Não há registros para o período selecionado.
              </p>
            </div> : <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                    Usuário
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                    Tipo
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                    Clínica / Operadora
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                    Login
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                    Última Atividade
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                    IP
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSessions.map((session) => <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <div className={`w-3 h-3 rounded-full ${session.online === 1 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}`} title={session.online === 1 ? 'Online' : 'Offline'} />
                    
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200">
                          <UserIcon className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {session.usuarioNome || 'Usuário Desconhecido'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {session.usuarioEmail || '-'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTipoBadgeColor(session.usuarioTipo)}`}>
                    
                        {formatTipo(session.usuarioTipo)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <BuildingIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                        <span className="truncate max-w-[200px]" title={session.clinicaNome || session.operadoraNome || 'Global'}>
                      
                          {session.clinicaNome || session.operadoraNome || <span className="text-gray-400 italic">Global</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(session.loginEm)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {session.online === 1 ? <span className="inline-flex items-center text-sm font-medium text-green-600">
                          <ActivityIcon className="w-4 h-4 mr-1.5 animate-pulse" />
                          Agora
                        </span> : <span className="text-sm text-gray-500">
                          {formatDateTime(session.ultimaAtividade)}
                        </span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                      {session.ip || '-'}
                    </td>
                  </tr>)}
              </tbody>
            </table>}
        </div>
      </div>
    </div>;
}