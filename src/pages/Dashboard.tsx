import React, { useMemo, useState, Children } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarIcon,
  UsersIcon,
  FileTextIcon,
  CheckCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ClockIcon,
  BuildingIcon } from
'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { WhatsAppStatusButton } from '../components/WhatsAppStatusButton';
import { Consulta } from '../types';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend } from
'recharts';
export interface DashboardProps {
  consultas: Consulta[];
  totalPacientes: number;
  clinicaId?: string;
  onNavigate?: (page: string) => void;
}
type PeriodoFiltro = 'hoje' | 'semana' | 'mes';
export function Dashboard({
  consultas,
  totalPacientes,
  clinicaId,
  onNavigate
}: DashboardProps) {
  console.log(
    '🔍 [Dashboard] Total de pacientes recebido:',
    totalPacientes,
    '| clinicaId:',
    clinicaId
  );
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('semana');
  // ⭐ FIX: Usa data LOCAL em vez de UTC para evitar bug de timezone
  const hoje = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  // Filtrar consultas por período (ignorando placeholders)
  const consultasReais = useMemo(() => {
    return consultas.filter(
      (c) =>
      c.pacienteId !== 'disponivel' &&
      c.pacienteId !== 'removido' &&
      c.pacienteId !== 'bloqueado'
    );
  }, [consultas]);
  const consultasFiltradas = useMemo(() => {
    const now = new Date();
    const dataInicio = new Date();
    switch (periodoFiltro) {
      case 'hoje':
        return consultasReais.filter((c) => c.data === hoje);
      case 'semana':
        dataInicio.setDate(now.getDate() - 7);
        return consultasReais.filter((c) => new Date(c.data) >= dataInicio);
      case 'mes':
        dataInicio.setDate(now.getDate() - 30);
        return consultasReais.filter((c) => new Date(c.data) >= dataInicio);
      default:
        return consultasReais;
    }
  }, [consultasReais, periodoFiltro, hoje]);
  const consultasHoje = consultasReais.filter((c) => c.data === hoje);
  const consultasRealizadas = consultasFiltradas.filter(
    (c) => c.status === 'realizada'
  ).length;
  const consultasCanceladas = consultasFiltradas.filter(
    (c) => c.status === 'cancelada'
  ).length;
  // Dados para gráfico de linha (últimos 7 dias)
  const dadosGraficoLinha = useMemo(() => {
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
      const consultasDia = consultasReais.filter((c) => c.data === dataStr);
      ultimos7Dias.push({
        data: data.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit'
        }),
        consultas: consultasDia.length,
        realizadas: consultasDia.filter((c) => c.status === 'realizada').length
      });
    }
    return ultimos7Dias;
  }, [consultasReais]);
  // Dados para gráfico de pizza (status)
  const dadosGraficoPizza = useMemo(() => {
    const agendadas = consultasFiltradas.filter(
      (c) => c.status === 'agendada'
    ).length;
    const realizadas = consultasFiltradas.filter(
      (c) => c.status === 'realizada'
    ).length;
    const canceladas = consultasFiltradas.filter(
      (c) => c.status === 'cancelada'
    ).length;
    const compareceu = consultasFiltradas.filter(
      (c) => c.status === 'compareceu'
    ).length;
    const faltou = consultasFiltradas.filter(
      (c) => c.status === 'faltou'
    ).length;
    return [
    {
      name: 'Agendadas',
      value: agendadas,
      color: '#3b82f6'
    },
    {
      name: 'Realizadas',
      value: realizadas,
      color: '#10b981'
    },
    {
      name: 'Canceladas',
      value: canceladas,
      color: '#ef4444'
    },
    {
      name: 'Compareceu',
      value: compareceu,
      color: '#9333ea'
    },
    {
      name: 'Faltou',
      value: faltou,
      color: '#92400e'
    }];

  }, [consultasFiltradas]);
  const proximasConsultas = consultasReais.
  filter((c) => c.data >= hoje && c.status !== 'cancelada').
  sort((a, b) => {
    if (a.data === b.data)
    return String(a.horario ?? '').localeCompare(String(b.horario ?? ''));
    return a.data.localeCompare(b.data);
  }).
  slice(0, 5);
  // ⭐ FIX: Calcula trend REAL comparando período atual vs anterior (sem Math.random!)
  const calcularTrend = (
  valorAtual: number,
  tipo: 'consultas' | 'pacientes') =>
  {
    // Para pacientes não temos histórico, retorna 0
    if (tipo === 'pacientes' || valorAtual === 0) return 0;
    // Para consultas: compara semana atual vs semana anterior
    const now = new Date();
    const inicioSemanaAtual = new Date(now);
    inicioSemanaAtual.setDate(now.getDate() - 7);
    const inicioSemanaAnterior = new Date(inicioSemanaAtual);
    inicioSemanaAnterior.setDate(inicioSemanaAtual.getDate() - 7);
    const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const semanaAtualStr = formatDate(inicioSemanaAtual);
    const semanaAnteriorStr = formatDate(inicioSemanaAnterior);
    const consultasSemanaAtual = consultasReais.filter(
      (c) => c.data >= semanaAtualStr && c.data <= hoje
    ).length;
    const consultasSemanaAnterior = consultasReais.filter(
      (c) => c.data >= semanaAnteriorStr && c.data < semanaAtualStr
    ).length;
    if (consultasSemanaAnterior === 0) return 0;
    const variacao = Math.round(
      (consultasSemanaAtual - consultasSemanaAnterior) /
      consultasSemanaAnterior *
      100
    );
    return Math.max(-99, Math.min(99, variacao)); // Limita entre -99% e 99%
  };
  const stats = [
  {
    label: 'Consultas Hoje',
    value: consultasHoje.length,
    icon: CalendarIcon,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    trend: calcularTrend(consultasHoje.length, 'consultas'),
    destino: 'agenda'
  },
  {
    label: 'Total de Pacientes',
    value: totalPacientes || 0,
    icon: UsersIcon,
    color: 'text-green-600',
    bg: 'bg-green-50',
    trend: calcularTrend(totalPacientes, 'pacientes'),
    destino: 'pacientes'
  },
  {
    label: 'Consultas Realizadas',
    value: consultasRealizadas,
    icon: CheckCircleIcon,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    trend: calcularTrend(consultasRealizadas, 'consultas'),
    destino: 'agenda'
  },
  {
    label: 'Prontuários',
    value: consultasRealizadas,
    icon: FileTextIcon,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    trend: calcularTrend(consultasRealizadas, 'consultas'),
    destino: 'pacientes'
  }];

  const containerVariants = {
    hidden: {
      opacity: 0
    },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  const itemVariants = {
    hidden: {
      opacity: 0,
      y: 20
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: 'easeOut'
      }
    }
  };
  // ⭐ Se não tem clínica selecionada, mostra estado vazio (APÓS todos os hooks!)
  if (!clinicaId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Visão geral da clínica</p>
        </div>
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <BuildingIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Selecione uma clínica
          </h2>
          <p className="text-gray-500">
            Escolha uma clínica no menu superior para visualizar o dashboard.
          </p>
        </div>
      </div>);

  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Visão geral da clínica</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filtro de Período */}
          <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
            {(['hoje', 'semana', 'mes'] as PeriodoFiltro[]).map((periodo) =>
            <button
              key={periodo}
              onClick={() => setPeriodoFiltro(periodo)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${periodoFiltro === periodo ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              
                {periodo === 'hoje' ?
              'Hoje' :
              periodo === 'semana' ?
              'Semana' :
              'Mês'}
              </button>
            )}
          </div>
          <WhatsAppStatusButton />
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend > 0;
          const TrendIcon = isPositive ? TrendingUpIcon : TrendingDownIcon;
          return (
            <motion.div key={stat.label} variants={itemVariants}>
              <Card
                onClick={
                onNavigate ? () => onNavigate(stat.destino) : undefined
                }
                role={onNavigate ? 'button' : undefined}
                tabIndex={onNavigate ? 0 : undefined}
                onKeyDown={
                onNavigate ?
                (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(stat.destino);
                  }
                } :
                undefined
                }
                className={`p-6 transition-shadow hover:shadow-lg ${onNavigate ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500' : ''}`}>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stat.value}
                    </p>
                    {stat.trend !== 0 &&
                    <div className="flex items-center gap-1 mt-2">
                        <TrendIcon
                        className={`w-4 h-4 ${isPositive ? 'text-green-600' : 'text-red-600'}`} />
                      

                        <span
                        className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        
                          {Math.abs(stat.trend)}%
                        </span>
                      </div>
                    }
                  </div>
                  <div className={`${stat.bg} p-3 rounded-lg`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </Card>
            </motion.div>);

        })}
      </motion.div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} initial="hidden" animate="visible">
          <Card title="Consultas - Últimos 7 Dias">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dadosGraficoLinha}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="data" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }} />
                

                <Legend />
                <Line
                  type="monotone"
                  dataKey="consultas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Total"
                  dot={{
                    fill: '#3b82f6',
                    r: 4
                  }} />
                

                <Line
                  type="monotone"
                  dataKey="realizadas"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Realizadas"
                  dot={{
                    fill: '#10b981',
                    r: 4
                  }} />
                
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} initial="hidden" animate="visible">
          <Card title="Status das Consultas">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dadosGraficoPizza}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value">
                  
                  {dadosGraficoPizza.map((entry, index) =>
                  <Cell key={`cell-${index}`} fill={entry.color} />
                  )}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Listas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} initial="hidden" animate="visible">
          <Card title="Consultas de Hoje">
            {consultasHoje.length === 0 ?
            <div className="text-center py-12">
                <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  Nenhuma consulta agendada para hoje
                </p>
              </div> :

            <div className="space-y-3">
                {consultasHoje.map((consulta, index) =>
              <motion.div
                key={consulta.id}
                initial={{
                  opacity: 0,
                  x: -20
                }}
                animate={{
                  opacity: 1,
                  x: 0
                }}
                transition={{
                  delay: index * 0.1
                }}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-100 hover:border-teal-200 transition-colors">
                
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {consulta.pacienteNome}
                      </p>
                      <p className="text-sm text-gray-500">
                        {consulta.horario} •{' '}
                        {consulta.tipo === 'medica' ? 'Médica' : 'Odontológica'}
                      </p>
                    </div>
                    <Badge status={consulta.status} />
                  </motion.div>
              )}
              </div>
            }
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} initial="hidden" animate="visible">
          <Card title="Próximas Consultas">
            {proximasConsultas.length === 0 ?
            <div className="text-center py-12">
                <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Nenhuma consulta agendada</p>
              </div> :

            <div className="space-y-3">
                {proximasConsultas.map((consulta, index) =>
              <motion.div
                key={consulta.id}
                initial={{
                  opacity: 0,
                  x: -20
                }}
                animate={{
                  opacity: 1,
                  x: 0
                }}
                transition={{
                  delay: index * 0.1
                }}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-100 hover:border-teal-200 transition-colors">
                
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {consulta.pacienteNome}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(consulta.data).toLocaleDateString('pt-BR')} às{' '}
                        {consulta.horario}
                      </p>
                    </div>
                    <Badge status={consulta.status} />
                  </motion.div>
              )}
              </div>
            }
          </Card>
        </motion.div>
      </div>
    </div>);

}