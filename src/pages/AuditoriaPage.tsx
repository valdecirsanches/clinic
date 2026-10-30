import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheckIcon, SearchIcon, FilterIcon, ClockIcon, UserIcon, RefreshCwIcon, Loader2Icon, DownloadIcon, ActivityIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Table } from '../components/ui/Table';
import { buscarAuditoria, ACAO_LABELS, ACAO_ICONES, AcaoAuditoria } from '../utils/auditLog';
export function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({
    pacienteNome: '',
    acao: '',
    dataInicio: '',
    dataFim: ''
  });
  // Lê o clinicaId da sessão
  const sessao = useMemo(() => {
    try {
      const s = localStorage.getItem('sessao');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }, []);
  const clinicaId = sessao?.clinicaAtual?.id;
  const carregarLogs = async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      // Busca os logs da API
      const data = await buscarAuditoria(clinicaId, {
        acao: filtros.acao || undefined,
        dataInicio: filtros.dataInicio || undefined,
        dataFim: filtros.dataFim || undefined,
        limit: 1000 // Busca um número razoável para filtrar no cliente
      });
      setLogs(data || []);
    } catch (error) {
      console.error('Erro ao carregar logs de auditoria:', error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    carregarLogs();
  }, [clinicaId]);
  // Filtra os logs no cliente (pelo nome do paciente)
  const logsFiltrados = useMemo(() => {
    return logs.filter((log) => {
      if (filtros.pacienteNome && log.pacienteNome && !log.pacienteNome.toLowerCase().includes(filtros.pacienteNome.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [logs, filtros.pacienteNome]);
  // Calcula estatísticas
  const stats = useMemo(() => {
    const usuariosUnicos = new Set(logsFiltrados.map((l) => l.usuarioId));
    const pacientesUnicos = new Set(logsFiltrados.map((l) => l.pacienteId).filter(Boolean));
    return {
      total: logsFiltrados.length,
      usuarios: usuariosUnicos.size,
      pacientes: pacientesUnicos.size
    };
  }, [logsFiltrados]);
  const handleLimparFiltros = () => {
    setFiltros({
      pacienteNome: '',
      acao: '',
      dataInicio: '',
      dataFim: ''
    });
    // Recarrega sem filtros de API
    setTimeout(carregarLogs, 0);
  };
  const getBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      case 'medico':
      case 'dentista':
        return 'bg-teal-100 text-teal-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  const columns = [{
    key: 'criadoEm',
    label: 'Data/Hora',
    render: (log: any) => {
      const data = new Date(log.criadoEm);
      return <div className="flex items-center gap-2 text-gray-600">
            <ClockIcon className="w-4 h-4" />
            <span>
              {data.toLocaleDateString('pt-BR')} às{' '}
              {data.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          })}
            </span>
          </div>;
    }
  }, {
    key: 'usuarioNome',
    label: 'Usuário',
    render: (log: any) => <div>
          <p className="font-medium text-gray-900">{log.usuarioNome}</p>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${getBadgeColor(log.usuarioTipo)}`}>
        
            {log.usuarioTipo}
          </span>
        </div>
  }, {
    key: 'acao',
    label: 'Ação',
    render: (log: any) => <div className="flex items-center gap-2">
          <span className="text-lg">
            {ACAO_ICONES[log.acao as AcaoAuditoria] || '📝'}
          </span>
          <span className="font-medium text-gray-700">
            {ACAO_LABELS[log.acao as AcaoAuditoria] || log.acao}
          </span>
        </div>
  }, {
    key: 'pacienteNome',
    label: 'Paciente',
    render: (log: any) => <span className="text-gray-700">{log.pacienteNome || '-'}</span>
  }, {
    key: 'detalhes',
    label: 'Detalhes',
    render: (log: any) => <span className="text-gray-500 text-sm">{log.detalhes || '-'}</span>
  }, {
    key: 'ip',
    label: 'IP',
    render: (log: any) => <span className="text-gray-400 text-xs font-mono">{log.ip || '-'}</span>
  }];
  const acaoOptions = [{
    value: '',
    label: 'Todas as ações'
  }, ...Object.entries(ACAO_LABELS).map(([key, label]) => ({
    value: key,
    label
  }))];
  return <div className="flex flex-col h-full overflow-hidden">
      {/* Header - fixo */}
      <div className="flex-shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheckIcon className="w-7 h-7 text-teal-600" />
            Auditoria &amp; Logs de Acesso
          </h1>
          <p className="text-gray-500 mt-1">
            Registro de todas as ações realizadas no sistema (LGPD / CFM 2.299)
          </p>
        </div>
        <Button variant="outline" onClick={carregarLogs} disabled={loading} className="flex items-center gap-2">
          
          <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          
          Atualizar
        </Button>
      </div>

      {/* Stats - fixo */}
      <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-teal-500">
          <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-teal-600">
            <ActivityIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">
              Total de Registros
            </p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Usuários Ativos</p>
            <p className="text-2xl font-bold text-gray-900">{stats.usuarios}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-purple-500">
          <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-600">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">
              Pacientes Acessados
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.pacientes}
            </p>
          </div>
        </Card>
      </div>

      {/* Filters - fixo */}
      <div className="flex-shrink-0 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <FilterIcon className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-gray-700">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input label="Paciente" placeholder="Buscar por nome..." value={filtros.pacienteNome} onChange={(e) => setFiltros({
            ...filtros,
            pacienteNome: e.target.value
          })} icon={<SearchIcon className="w-4 h-4" />} />
            
            <Select label="Ação" options={acaoOptions} value={filtros.acao} onChange={(e) => setFiltros({
            ...filtros,
            acao: e.target.value
          })} />
            
            <Input type="date" label="Data Início" value={filtros.dataInicio} onChange={(e) => setFiltros({
            ...filtros,
            dataInicio: e.target.value
          })} />
            
            <Input type="date" label="Data Fim" value={filtros.dataFim} onChange={(e) => setFiltros({
            ...filtros,
            dataFim: e.target.value
          })} />
            
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={handleLimparFiltros}>
              Limpar Filtros
            </Button>
            <Button onClick={carregarLogs} disabled={loading}>
              {loading ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <SearchIcon className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
          </div>
        </Card>
      </div>

      {/* Results - flex-1, apenas a tabela rola */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200" style={{
      minHeight: 0,
      overflow: 'hidden'
    }}>
        
        {/* Header dos resultados - fixo */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h3 className="font-medium text-gray-700">
            Resultados ({logsFiltrados.length})
          </h3>
        </div>

        {/* Conteúdo - apenas esta parte rola */}
        {loading && logsFiltrados.length === 0 ? <div className="p-12 text-center">
            <Loader2Icon className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
            <p className="text-gray-500">Carregando logs...</p>
          </div> : logsFiltrados.length === 0 ? <div className="p-12 text-center">
            <ShieldCheckIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Nenhum log encontrado</p>
            <p className="text-sm text-gray-400 mt-1">
              Tente ajustar os filtros acima.
            </p>
          </div> : <div className="flex-1 overflow-y-auto" style={{
        minHeight: 0
      }}>
          
            <Table data={logsFiltrados} columns={columns} />
          </div>}
      </div>
    </div>;
}