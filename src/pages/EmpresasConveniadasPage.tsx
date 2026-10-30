import React, { useEffect, useMemo, useState, useRef, Component } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { EmpresaConveniadaForm } from '../components/EmpresaConveniadaForm';
import { DialogContainer } from '../components/DialogContainer';
import { useEmpresasConveniadas } from '../hooks/useEmpresasConveniadas';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { EmpresaConveniada } from '../types';
import { API_BASE_URL } from '../config/api';
import { Modal } from '../components/ui/Modal';
import { PlusIcon, SearchIcon, Building2Icon, CheckCircleIcon, UsersIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, UserIcon, MapPinIcon, MoreHorizontalIcon, FileTextIcon, PrinterIcon, Loader2Icon, CalendarIcon } from 'lucide-react';
// ⭐ Helper: traduz status da consulta para texto legível
// ⭐ Inclui TODOS os status da agenda (mesma ordem/labels do seletor de status
// das consultas), para que apareçam e possam ser selecionados no filtro.
const STATUS_LABELS: Record<string, string> = {
  agendada: 'Agendada',
  aguardando_confirmacao: '⏳ Aguardando',
  confirmada: 'Confirmada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  compareceu: 'Compareceu',
  faltou: 'Faltou',
  aguardando_remarcacao: 'Remarcar'
};
const getStatusLabel = (status: string) => STATUS_LABELS[status] || status || '-';
// ⭐ Helper: cor do status para impressão
const STATUS_COLORS: Record<string, string> = {
  agendada: '#EAB308',
  aguardando_confirmacao: '#8B5CF6',
  confirmada: '#3B82F6',
  realizada: '#6366F1',
  cancelada: '#DC2626',
  aguardando_remarcacao: '#F97316',
  compareceu: '#22C55E',
  faltou: '#EF4444' // vermelho vivo
};
const getStatusColor = (status: string) => STATUS_COLORS[status] || '#6b7280';
// ⭐ Helper: Status de Paciente
const STATUS_PACIENTE_LABELS: Record<string, string> = {
  pre_cadastro: 'Pré-Cadastro',
  ativo: 'Ativo',
  inativo: 'Inativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  excluido: 'Excluído',
  term_tratamento: 'Term. Tratamento',
  outros: 'Outros'
};
const STATUS_PACIENTE_COLORS: Record<string, string> = {
  pre_cadastro: '#EAB308',
  ativo: 'bg-green-100 text-green-800',
  inativo: 'bg-gray-100 text-gray-800',
  suspenso: 'bg-orange-100 text-orange-800',
  cancelado: 'bg-red-100 text-red-800',
  excluido: 'bg-red-100 text-red-800',
  term_tratamento: 'bg-blue-100 text-blue-800',
  outros: 'bg-gray-100 text-gray-800'
};
// ⭐ Normaliza o status do paciente vindo do banco (pode vir em MAIÚSCULAS,
// ex: "ATIVO") para o slug canônico em minúsculas usado nos mapas/labels.
const normalizarStatusPaciente = (raw: any): string => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'pre_cadastro';
  return s in STATUS_PACIENTE_LABELS ? s : 'outros';
};
const ITEMS_PER_PAGE_OPTIONS = [{
  value: '10',
  label: '10 por página'
}, {
  value: '25',
  label: '25 por página'
}, {
  value: '50',
  label: '50 por página'
}, {
  value: '100',
  label: '100 por página'
}];

// Interface para contagens
interface Contagens {
  [empresaId: string]: {
    qtdUnidades: number;
    qtdPacientes: number;
  };
}
export function EmpresasConveniadasPage() {
  const [clinicaId, setClinicaId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [empresaEdit, setEmpresaEdit] = useState<EmpresaConveniada | null>(null);
  // ⭐ Estado para contagens (carregadas separadamente)
  const [contagens, setContagens] = useState<Contagens>({});
  const [loadingContagens, setLoadingContagens] = useState(false);
  const contagensCarregadasRef = useRef(false);
  // Estados de paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Estados de ordenação
  const [sortColumn, setSortColumn] = useState<string>('nome');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // ⭐ Estado para dados da clínica (logo, nome, endereço) para o relatório
  const [clinicaInfo, setClinicaInfo] = useState<{
    nome: string;
    logoUrl?: string;
    endereco?: string;
    telefone?: string;
    cnpj?: string;
    cidade?: string;
    uf?: string;
  } | null>(null);
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      setClinicaId(parsed.clinicaAtual?.id || '');
      // ⭐ Carrega info da clínica para o relatório
      if (parsed.clinicaAtual) {
        setClinicaInfo({
          nome: parsed.clinicaAtual.nome || '',
          logoUrl: parsed.clinicaAtual.logoUrl || '',
          endereco: parsed.clinicaAtual.endereco || '',
          telefone: parsed.clinicaAtual.telefone || '',
          cnpj: parsed.clinicaAtual.cnpj || '',
          cidade: parsed.clinicaAtual.cidade || '',
          uf: parsed.clinicaAtual.uf || ''
        });
      }
    }
  }, []);
  const {
    empresas,
    loading,
    criar,
    atualizar,
    deletar
  } = useEmpresasConveniadas(clinicaId);
  const {
    success,
    error: showError
  } = useToast();
  const {
    dialogs,
    removeDialog,
    confirm
  } = useDialog();
  // ⭐ Carrega contagens de forma assíncrona APÓS as empresas carregarem
  useEffect(() => {
    const carregarContagens = async () => {
      if (!clinicaId || empresas.length === 0 || contagensCarregadasRef.current) return;
      contagensCarregadasRef.current = true;
      setLoadingContagens(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/contagens/todas?clinicaId=${clinicaId}`);
        if (response.ok) {
          const data = await response.json();
          setContagens(data);
          console.log('✅ Contagens carregadas:', Object.keys(data).length);
        }
      } catch (err) {
        console.error('Erro ao carregar contagens:', err);
      } finally {
        setLoadingContagens(false);
      }
    };
    carregarContagens();
  }, [clinicaId, empresas.length]);
  // Reset ref quando clinicaId muda
  useEffect(() => {
    contagensCarregadasRef.current = false;
    setContagens({});
  }, [clinicaId]);
  // ⭐ Relatório de atendimentos por período
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [relatorioEmpresa, setRelatorioEmpresa] = useState<EmpresaConveniada | null>(null);
  const [relatorioInicio, setRelatorioInicio] = useState('');
  const [relatorioFim, setRelatorioFim] = useState('');
  const [relatorioData, setRelatorioData] = useState<any[]>([]);
  const [relatorioLoading, setRelatorioLoading] = useState(false);
  // ⭐ Começa em branco: o usuário marca explicitamente os status desejados
  const [relatorioStatusFilter, setRelatorioStatusFilter] = useState<string[]>([]);
  // ⭐ Relatório de Pacientes
  const [relatorioPacientesOpen, setRelatorioPacientesOpen] = useState(false);
  const [relatorioPacientesEmpresa, setRelatorioPacientesEmpresa] = useState<EmpresaConveniada | null>(null);
  const [relatorioPacientesData, setRelatorioPacientesData] = useState<any[]>([]);
  const [relatorioPacientesLoading, setRelatorioPacientesLoading] = useState(false);
  // ⭐ Começa em branco: o usuário escolhe explicitamente os status desejados
  const [relatorioPacientesStatusFilter, setRelatorioPacientesStatusFilter] = useState<string[]>([]);
  const handleAbrirRelatorio = (empresa: EmpresaConveniada) => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    setRelatorioEmpresa(empresa);
    setRelatorioInicio(inicio.toISOString().split('T')[0]);
    setRelatorioFim(hoje.toISOString().split('T')[0]);
    setRelatorioData([]);
    // ⭐ Abre com todos os status desmarcados — o usuário escolhe os desejados
    setRelatorioStatusFilter([]);
    setRelatorioOpen(true);
  };
  const handleGerarRelatorio = async () => {
    if (!clinicaId || !relatorioEmpresa || !relatorioInicio || !relatorioFim) return;
    setRelatorioLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&dataInicio=${relatorioInicio}&dataFim=${relatorioFim}&limit=50000`);
      if (!res.ok) throw new Error('Erro ao buscar consultas');
      const consultas = await res.json();
      // ⭐ FIX: Filtra diretamente pelo campo pacienteEmpresaConveniadaId (JOIN no servidor)
      // Compara como string para evitar problemas de tipo (int vs string)
      const empresaId = String(relatorioEmpresa.id);
      const consultasFiltradas = consultas.filter((c: any) => String(c.pacienteEmpresaConveniadaId || '') === empresaId && c.pacienteId !== 'disponivel' && relatorioStatusFilter.includes(c.status));
      setRelatorioData(consultasFiltradas);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
    } finally {
      setRelatorioLoading(false);
    }
  };
  const handleAbrirRelatorioPacientes = (empresa: EmpresaConveniada) => {
    setRelatorioPacientesEmpresa(empresa);
    setRelatorioPacientesData([]);
    // ⭐ Inicia sem nenhum status marcado — o usuário seleciona os desejados
    setRelatorioPacientesStatusFilter([]);
    setRelatorioPacientesOpen(true);
  };
  const handleGerarRelatorioPacientes = async () => {
    if (!clinicaId || !relatorioPacientesEmpresa) return;
    setRelatorioPacientesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/empresas-conveniadas/${relatorioPacientesEmpresa.id}/pacientes?clinicaId=${clinicaId}`);
      if (!res.ok) throw new Error('Erro ao buscar pacientes');
      const pacientes = await res.json();
      const pacientesFiltrados = pacientes.filter((p: any) => relatorioPacientesStatusFilter.includes(normalizarStatusPaciente(p.status)));
      setRelatorioPacientesData(pacientesFiltrados);
    } catch (err) {
      console.error('Erro ao gerar relatório de pacientes:', err);
    } finally {
      setRelatorioPacientesLoading(false);
    }
  };
  const handleImprimirRelatorio = () => {
    if (!relatorioEmpresa || relatorioData.length === 0) return;
    const dataInicioFmt = new Date(relatorioInicio + 'T12:00:00').toLocaleDateString('pt-BR');
    const dataFimFmt = new Date(relatorioFim + 'T12:00:00').toLocaleDateString('pt-BR');
    // ⭐ Monta header com logo da clínica
    const logoHtml = clinicaInfo?.logoUrl ? '<img src="' + clinicaInfo.logoUrl + '" alt="Logo" style="max-height:60px;max-width:200px;object-fit:contain" />' : '';
    const clinicaNome = clinicaInfo?.nome || 'Clínica';
    const clinicaEndParts = [clinicaInfo?.endereco, clinicaInfo?.cidade && clinicaInfo?.uf ? clinicaInfo.cidade + '/' + clinicaInfo.uf : clinicaInfo?.cidade || clinicaInfo?.uf].filter(Boolean);
    const clinicaEndereco = clinicaEndParts.join(' — ');
    const clinicaTelefone = clinicaInfo?.telefone || '';
    const clinicaCnpj = clinicaInfo?.cnpj || '';
    // ⭐ Helper de escape HTML para não quebrar o layout com aspas/<>/etc nas anotações
    const escapeHtml = (raw: any) => String(raw == null ? '' : raw).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch] as string);
    const linhas = relatorioData.sort((a: any, b: any) => (a.data + a.horario).localeCompare(b.data + b.horario)).map((c: any, i: number) => {
      const bgColor = i % 2 === 0 ? '#fff' : '#f9fafb';
      const dataFmt = new Date(c.data?.split(' ')[0] + 'T12:00:00').toLocaleDateString('pt-BR');
      const profNome = c.profissional || c.profissionalNomeJoin || c.profissionalNome || '-';
      const procNome = c.procedimento || c.procedimentoNomeJoin || c.procedimentoNome || '-';
      // ⭐ NOVO: Anotações do procedimento — exibidas abaixo do procedimento,
      // em fonte menor, itálico e cor mais clara para ficar visualmente
      // secundário sem poluir o relatório.
      const procAnot = c.procedimentoAnotacoes || (c as any).procedimento_anotacoes || '';
      const procCell = '<div style="font-size:11px;line-height:1.3">' + escapeHtml(procNome) + '</div>' + (procAnot ? '<div style="font-size:9.5px;color:#6b7280;font-style:italic;line-height:1.3;margin-top:2px;white-space:pre-wrap;word-break:break-word">' + escapeHtml(procAnot) + '</div>' : '');
      const statusColor = getStatusColor(c.status);
      const statusLabel = getStatusLabel(c.status);
      // ⭐ Fonte da tabela reduzida de 13px → 11px (mais compacto, libera espaço para anotações)
      return '<tr style="background:' + bgColor + '">' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + dataFmt + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + (c.horario || '-') + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:500;vertical-align:top">' + escapeHtml(c.pacienteNome || '-') + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + escapeHtml(profNome) + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top">' + procCell + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:600;color:#fff;background:' + statusColor + '">' + statusLabel + '</span></td>' + '</tr>';
    }).join('');
    const totalPacientes = new Set(relatorioData.map((c: any) => c.pacienteId)).size;
    const totalRealizadas = relatorioData.filter((c: any) => c.status === 'realizada').length;
    const totalCanceladas = relatorioData.filter((c: any) => c.status === 'cancelada').length;
    const geradoEm = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    // ⭐ CSS extraído como string regular (sem backticks) para evitar conflito com template literal
    const cssStyles = '* { margin: 0; padding: 0; box-sizing: border-box; } ' + 'body { font-family: Segoe UI, Arial, sans-serif; color: #1f2937; background: #fff; } ' + '.header { display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 3px solid #0d9488; } ' + '.header-left { display: flex; align-items: center; gap: 16px; } ' + '.header-logo img { max-height: 60px; max-width: 200px; object-fit: contain; } ' + '.header-info h1 { font-size: 18px; font-weight: 700; color: #0f172a; } ' + '.header-info p { font-size: 11px; color: #64748b; margin-top: 2px; } ' + '.header-right { text-align: right; } ' + '.header-right p { font-size: 11px; color: #64748b; } ' + '.report-title { padding: 20px 32px; background: linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%); border-bottom: 1px solid #d1fae5; } ' + '.report-title h2 { font-size: 16px; font-weight: 700; color: #0f766e; } ' + '.report-title .subtitle { font-size: 13px; color: #475569; margin-top: 4px; } ' + '.report-title .empresa { font-size: 20px; font-weight: 800; color: #0d9488; margin-top: 2px; } ' + '.stats { display: flex; gap: 16px; padding: 16px 32px; } ' + '.stat { flex: 1; text-align: center; padding: 12px 16px; border-radius: 10px; border: 1px solid #e5e7eb; background: #f9fafb; } ' + '.stat strong { font-size: 24px; font-weight: 800; display: block; } ' + '.stat span { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; } ' + '.stat.teal strong { color: #0d9488; } ' + '.stat.blue strong { color: #2563eb; } ' + '.stat.green strong { color: #16a34a; } ' + '.stat.red strong { color: #dc2626; } ' + '.table-container { padding: 0 32px 24px; } ' + 'table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; } ' + 'thead { background: #0d9488; } ' + 'th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; } ' + 'tbody tr:hover { background: #f0fdfa !important; } ' + '.footer { padding: 16px 32px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #9ca3af; } ' + '@media print { body { margin: 0; } .header { padding: 16px 20px; } .report-title { padding: 12px 20px; } .stats { padding: 12px 20px; } .table-container { padding: 0 20px 16px; } .footer { padding: 12px 20px; } @page { margin: 10mm; } }';
    // ⭐ HTML montado com concatenação para evitar backticks aninhados
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' + '<title>Relatório de Atendimentos — ' + relatorioEmpresa.nome + '</title>' + '<style>{`' + cssStyles + '`}</style></head><body>' + '<div class="header"><div class="header-left">' + (logoHtml ? '<div class="header-logo">' + logoHtml + '</div>' : '') + '<div class="header-info"><h1>' + clinicaNome + '</h1>' + (clinicaEndereco ? '<p>' + clinicaEndereco + '</p>' : '') + (clinicaTelefone ? '<p>Tel: ' + clinicaTelefone + '</p>' : '') + (clinicaCnpj ? '<p>CNPJ: ' + clinicaCnpj + '</p>' : '') + '</div></div>' + '<div class="header-right"><p>Relatório gerado em</p>' + '<p style="font-weight:600;color:#374151">' + geradoEm + '</p></div></div>' + '<div class="report-title"><h2>Relatório de Atendimentos</h2>' + '<div class="empresa">' + relatorioEmpresa.nome + '</div>' + '<div class="subtitle">Período: ' + dataInicioFmt + ' a ' + dataFimFmt + '</div></div>' + '<div class="stats">' + '<div class="stat teal"><strong>' + relatorioData.length + '</strong><span>Total de Atendimentos</span></div>' + '<div class="stat blue"><strong>' + totalPacientes + '</strong><span>Pacientes Atendidos</span></div>' + '<div class="stat green"><strong>' + totalRealizadas + '</strong><span>Realizadas</span></div>' + '<div class="stat red"><strong>' + totalCanceladas + '</strong><span>Canceladas</span></div></div>' + '<div class="table-container"><table><thead><tr>' + '<th>Data</th><th>Horário</th><th>Paciente</th><th>Profissional</th><th>Procedimento</th><th>Status</th>' + '</tr></thead><tbody>' + linhas + '</tbody></table></div>' + '<div class="footer"><span>EasyClin — Sistema de Gestão Clínica</span>' + '<span>' + clinicaNome + ' — ' + relatorioEmpresa.nome + '</span></div>' + '</body></html>';
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  };
  const handleImprimirRelatorioPacientes = () => {
    if (!relatorioPacientesEmpresa || relatorioPacientesData.length === 0) return;
    const logoHtml = clinicaInfo?.logoUrl ? '<img src="' + clinicaInfo.logoUrl + '" alt="Logo" style="max-height:60px;max-width:200px;object-fit:contain" />' : '';
    const clinicaNome = clinicaInfo?.nome || 'Clínica';
    const clinicaEndParts = [clinicaInfo?.endereco, clinicaInfo?.cidade && clinicaInfo?.uf ? clinicaInfo.cidade + '/' + clinicaInfo.uf : clinicaInfo?.cidade || clinicaInfo?.uf].filter(Boolean);
    const clinicaEndereco = clinicaEndParts.join(' — ');
    const clinicaTelefone = clinicaInfo?.telefone || '';
    const clinicaCnpj = clinicaInfo?.cnpj || '';
    const escapeHtml = (raw: any) => String(raw == null ? '' : raw).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch] as string);
    const linhas = relatorioPacientesData.sort((a: any, b: any) => a.nome.localeCompare(b.nome)).map((p: any, i: number) => {
      const bgColor = i % 2 === 0 ? '#fff' : '#f9fafb';
      const statusNorm = normalizarStatusPaciente(p.status);
      const statusLabel = STATUS_PACIENTE_LABELS[statusNorm] || 'Pré-Cadastro';
      const statusColor = STATUS_PACIENTE_COLORS[statusNorm] || 'bg-gray-100 text-gray-800';
      // Extrai as cores do tailwind class para inline style
      let bgHex = '#f3f4f6';
      let textHex = '#1f2937';
      if (statusColor.includes('green')) {
        bgHex = '#dcfce7';
        textHex = '#166534';
      } else if (statusColor.includes('red')) {
        bgHex = '#fee2e2';
        textHex = '#991b1b';
      } else if (statusColor.includes('blue')) {
        bgHex = '#dbeafe';
        textHex = '#1e40af';
      } else if (statusColor.includes('orange')) {
        bgHex = '#ffedd5';
        textHex = '#9a3412';
      } else if (statusColor.includes('yellow')) {
        bgHex = '#fef08a';
        textHex = '#854d0e';
      }
      return '<tr style="background:' + bgColor + '">' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:500;vertical-align:top">' + escapeHtml(p.nome) + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + escapeHtml(p.cpf || '-') + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + escapeHtml(p.telefone || '-') + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + escapeHtml(p.email || '-') + '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top">' + escapeHtml(p.unidadeEmpresaId || '-') +
      // Idealmente seria o nome da unidade
      '</td>' + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;vertical-align:top"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:600;color:' + textHex + ';background:' + bgHex + '">' + statusLabel + '</span></td>' + '</tr>';
    }).join('');
    const geradoEm = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const cssStyles = '* { margin: 0; padding: 0; box-sizing: border-box; } ' + 'body { font-family: Segoe UI, Arial, sans-serif; color: #1f2937; background: #fff; } ' + '.header { display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 3px solid #0d9488; } ' + '.header-left { display: flex; align-items: center; gap: 16px; } ' + '.header-logo img { max-height: 60px; max-width: 200px; object-fit: contain; } ' + '.header-info h1 { font-size: 18px; font-weight: 700; color: #0f172a; } ' + '.header-info p { font-size: 11px; color: #64748b; margin-top: 2px; } ' + '.header-right { text-align: right; } ' + '.header-right p { font-size: 11px; color: #64748b; } ' + '.report-title { padding: 20px 32px; background: linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%); border-bottom: 1px solid #d1fae5; } ' + '.report-title h2 { font-size: 16px; font-weight: 700; color: #0f766e; } ' + '.report-title .subtitle { font-size: 13px; color: #475569; margin-top: 4px; } ' + '.report-title .empresa { font-size: 20px; font-weight: 800; color: #0d9488; margin-top: 2px; } ' + '.stats { display: flex; gap: 16px; padding: 16px 32px; } ' + '.stat { flex: 1; text-align: center; padding: 12px 16px; border-radius: 10px; border: 1px solid #e5e7eb; background: #f9fafb; } ' + '.stat strong { font-size: 24px; font-weight: 800; display: block; } ' + '.stat span { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; } ' + '.stat.teal strong { color: #0d9488; } ' + '.table-container { padding: 0 32px 24px; } ' + 'table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; } ' + 'thead { background: #0d9488; } ' + 'th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; } ' + 'tbody tr:hover { background: #f0fdfa !important; } ' + '.footer { padding: 16px 32px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #9ca3af; } ' + '@media print { body { margin: 0; } .header { padding: 16px 20px; } .report-title { padding: 12px 20px; } .stats { padding: 12px 20px; } .table-container { padding: 0 20px 16px; } .footer { padding: 12px 20px; } @page { margin: 10mm; } }';
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' + '<title>Relatório de Pacientes — ' + relatorioPacientesEmpresa.nome + '</title>' + '<style>{`' + cssStyles + '`}</style></head><body>' + '<div class="header"><div class="header-left">' + (logoHtml ? '<div class="header-logo">' + logoHtml + '</div>' : '') + '<div class="header-info"><h1>' + clinicaNome + '</h1>' + (clinicaEndereco ? '<p>' + clinicaEndereco + '</p>' : '') + (clinicaTelefone ? '<p>Tel: ' + clinicaTelefone + '</p>' : '') + (clinicaCnpj ? '<p>CNPJ: ' + clinicaCnpj + '</p>' : '') + '</div></div>' + '<div class="header-right"><p>Relatório gerado em</p>' + '<p style="font-weight:600;color:#374151">' + geradoEm + '</p></div></div>' + '<div class="report-title"><h2>Relatório de Pacientes</h2>' + '<div class="empresa">' + relatorioPacientesEmpresa.nome + '</div></div>' + '<div class="stats">' + '<div class="stat teal"><strong>' + relatorioPacientesData.length + '</strong><span>Total de Pacientes</span></div></div>' + '<div class="table-container"><table><thead><tr>' + '<th>Nome</th><th>CPF</th><th>Telefone</th><th>Email</th><th>Unidade ID</th><th>Status</th>' + '</tr></thead><tbody>' + linhas + '</tbody></table></div>' + '<div class="footer"><span>EasyClin — Sistema de Gestão Clínica</span>' + '<span>' + clinicaNome + ' — ' + relatorioPacientesEmpresa.nome + '</span></div>' + '</body></html>';
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  };
  // Totais calculados
  const totalUnidades = useMemo(() => {
    return Object.values(contagens).reduce((acc, c) => acc + (c.qtdUnidades || 0), 0);
  }, [contagens]);
  const totalPacientes = useMemo(() => {
    return Object.values(contagens).reduce((acc, c) => acc + (c.qtdPacientes || 0), 0);
  }, [contagens]);
  // Filtra empresas
  const empresasFiltradas = useMemo(() => {
    return empresas.filter((e) => e.nome.toLowerCase().includes(search.toLowerCase()) || e.cnpj?.toLowerCase().includes(search.toLowerCase()) || e.contato?.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase()));
  }, [empresas, search]);
  // Ordena empresas
  const empresasOrdenadas = useMemo(() => {
    const sorted = [...empresasFiltradas].sort((a, b) => {
      let valorA: any;
      let valorB: any;
      switch (sortColumn) {
        case 'nome':
          valorA = a.nome?.toLowerCase() || '';
          valorB = b.nome?.toLowerCase() || '';
          break;
        case 'cnpj':
          valorA = a.cnpj || '';
          valorB = b.cnpj || '';
          break;
        case 'telefone':
          valorA = a.telefone || '';
          valorB = b.telefone || '';
          break;
        case 'email':
          valorA = a.email?.toLowerCase() || '';
          valorB = b.email?.toLowerCase() || '';
          break;
        case 'contato':
          valorA = a.contato?.toLowerCase() || '';
          valorB = b.contato?.toLowerCase() || '';
          break;
        case 'ativa':
          valorA = a.ativa ? 1 : 0;
          valorB = b.ativa ? 1 : 0;
          break;
        case 'unidades':
          valorA = contagens[a.id]?.qtdUnidades ?? 0;
          valorB = contagens[b.id]?.qtdUnidades ?? 0;
          break;
        case 'pacientes':
          valorA = contagens[a.id]?.qtdPacientes ?? 0;
          valorB = contagens[b.id]?.qtdPacientes ?? 0;
          break;
        default:
          valorA = a.nome?.toLowerCase() || '';
          valorB = b.nome?.toLowerCase() || '';
      }
      if (valorA < valorB) return sortDirection === 'asc' ? -1 : 1;
      if (valorA > valorB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [empresasFiltradas, sortColumn, sortDirection, contagens]);
  // Reset página quando busca muda
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);
  // Calcula paginação
  const totalPages = Math.ceil(empresasOrdenadas.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const empresasPaginadas = empresasOrdenadas.slice(startIndex, endIndex);
  // Funções de navegação
  const goToFirstPage = () => setCurrentPage(1);
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToLastPage = () => setCurrentPage(totalPages);
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };
  // Função para alternar ordenação
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };
  // Componente de ícone de ordenação
  const SortIcon = ({
    column


  }: {column: string;}) => {
    if (sortColumn !== column) {
      return <ArrowUpDownIcon className="w-3 h-3 text-gray-400" />;
    }
    return sortDirection === 'asc' ? <ArrowUpIcon className="w-3 h-3 text-teal-600" /> : <ArrowDownIcon className="w-3 h-3 text-teal-600" />;
  };
  const totalAtivas = empresas.filter((e) => e.ativa).length;
  const handleNovaEmpresa = () => {
    setEmpresaEdit(null);
    setIsModalOpen(true);
  };
  const handleEditarEmpresa = (empresa: EmpresaConveniada) => {
    setEmpresaEdit(empresa);
    setIsModalOpen(true);
  };
  const handleSaveEmpresa = async (empresaData: Partial<EmpresaConveniada>) => {
    try {
      if (empresaEdit) {
        await atualizar(empresaEdit.id, empresaData);
        success('Empresa Atualizada', 'Dados atualizados com sucesso!');
      } else {
        await criar(empresaData);
        success('Empresa Criada', 'Empresa cadastrada com sucesso!');
      }
      setIsModalOpen(false);
      setEmpresaEdit(null);
      // Permite recarregar contagens
      contagensCarregadasRef.current = false;
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleDeletarEmpresa = async (empresa: EmpresaConveniada) => {
    const qtdUnidades = contagens[empresa.id]?.qtdUnidades || 0;
    const mensagem = qtdUnidades > 0 ? `Esta empresa possui ${qtdUnidades} unidade(s)/filial(is). Elas serão excluídas. Deseja continuar?` : `Tem certeza que deseja excluir a empresa "${empresa.nome}"?`;
    const shouldDelete = await confirm('Confirmar Exclusão', mensagem, 'Excluir', 'Cancelar');
    if (shouldDelete) {
      try {
        await deletar(empresa.id);
        success('Empresa Excluída', 'Empresa removida com sucesso!');
      } catch (err: any) {
        showError('Erro', err.message);
      }
    }
  };
  // ⭐ Componente para exibir contagem ou loading
  const ContagemCell = ({
    empresaId,
    tipo



  }: {empresaId: string;tipo: 'unidades' | 'pacientes';}) => {
    const contagem = contagens[empresaId];
    const valor = tipo === 'unidades' ? contagem?.qtdUnidades : contagem?.qtdPacientes;
    if (loadingContagens || valor === undefined) {
      return <div className="flex items-center gap-1">
          {tipo === 'unidades' ? <MapPinIcon className="w-4 h-4 text-gray-300" /> : <UserIcon className="w-4 h-4 text-gray-300" />}
          <MoreHorizontalIcon className="w-4 h-4 text-gray-400 animate-pulse" />
        </div>;
    }
    return <div className="flex items-center gap-1">
        {tipo === 'unidades' ? <MapPinIcon className="w-4 h-4 text-orange-400" /> : <UserIcon className="w-4 h-4 text-blue-400" />}
        <span className="text-gray-600 font-medium">{valor}</span>
      </div>;
  };
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Empresas Conveniadas
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie as empresas parceiras e suas unidades
          </p>
        </div>
        <Button onClick={handleNovaEmpresa}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {empresas.length}
              </p>
              <p className="text-xs text-gray-500">Total de Empresas</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalAtivas}</p>
              <p className="text-xs text-gray-500">Empresas Ativas</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <MapPinIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {loadingContagens ? <MoreHorizontalIcon className="w-6 h-6 animate-pulse" /> : totalUnidades}
              </p>
              <p className="text-xs text-gray-500">Total de Unidades</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <UsersIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {loadingContagens ? <MoreHorizontalIcon className="w-6 h-6 animate-pulse" /> : totalPacientes}
              </p>
              <p className="text-xs text-gray-500">Pacientes Vinculados</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <div className="p-4 border-b border-gray-200">
          <Input placeholder="Buscar por nome, CNPJ, contato ou email..." value={search} onChange={(e) => setSearch(e.target.value)} icon={<SearchIcon className="w-4 h-4" />} />
          
        </div>

        {loading ? <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <p className="text-gray-600 mt-2">Carregando empresas...</p>
          </div> : empresasFiltradas.length === 0 ? <div className="text-center py-12">
            <Building2Icon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {search ? 'Nenhuma empresa encontrada com esse termo de busca.' : 'Nenhuma empresa conveniada cadastrada ainda.'}
            </p>
            {!search && <Button onClick={handleNovaEmpresa}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Cadastrar Primeira Empresa
              </Button>}
          </div> : <>
            <div className="px-4 py-2 text-sm text-gray-600 bg-blue-50 border-b border-blue-100">
              💡 <strong>Dica:</strong> Clique duas vezes em uma empresa para
              editar. Clique nos cabeçalhos para ordenar.
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('nome')}>
                    
                      <div className="flex items-center gap-1">
                        Empresa
                        <SortIcon column="nome" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('telefone')}>
                    
                      <div className="flex items-center gap-1">
                        Telefone
                        <SortIcon column="telefone" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('contato')}>
                    
                      <div className="flex items-center gap-1">
                        Contato
                        <SortIcon column="contato" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('ativa')}>
                    
                      <div className="flex items-center gap-1">
                        Status
                        <SortIcon column="ativa" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('unidades')}>
                    
                      <div className="flex items-center gap-1">
                        Unidades
                        <SortIcon column="unidades" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('pacientes')}>
                    
                      <div className="flex items-center gap-1">
                        Pacientes
                        <SortIcon column="pacientes" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {empresasPaginadas.map((empresa) => <tr key={empresa.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onDoubleClick={() => handleEditarEmpresa(empresa)}>
                  
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {empresa.nome}
                          </p>
                          {empresa.razaoSocial && <p className="text-xs text-gray-500">
                              {empresa.razaoSocial}
                            </p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {empresa.telefone || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {empresa.contato || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={empresa.ativa ? 'success' : 'secondary'}>
                      
                          {empresa.ativa ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ContagemCell empresaId={empresa.id} tipo="unidades" />
                      </td>
                      <td className="px-4 py-3">
                        <ContagemCell empresaId={empresa.id} tipo="pacientes" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleAbrirRelatorio(empresa)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Relatório de Atendimentos">
                        
                            <FileTextIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleAbrirRelatorioPacientes(empresa)} className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Relatório de Pacientes">
                        
                            <UsersIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleEditarEmpresa(empresa)} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors" title="Editar">
                        
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeletarEmpresa(empresa)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Excluir">
                        
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {empresasOrdenadas.length > 0 && <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      Mostrando {startIndex + 1} a{' '}
                      {Math.min(endIndex, empresasOrdenadas.length)} de{' '}
                      <strong>{empresasOrdenadas.length}</strong> empresas
                    </span>
                    <Select options={ITEMS_PER_PAGE_OPTIONS} value={String(itemsPerPage)} onChange={handleItemsPerPageChange} className="w-36" />
                
                  </div>

                  <div className="flex items-center gap-1">
                    <button onClick={goToFirstPage} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Primeira página">
                  
                      <ChevronsLeftIcon className="w-4 h-4" />
                    </button>
                    <button onClick={goToPreviousPage} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Página anterior">
                  
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 mx-2">
                      {Array.from({
                  length: Math.min(5, totalPages)
                }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum ? 'bg-teal-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`}>
                          
                              {pageNum}
                            </button>;
                })}
                    </div>

                    <button onClick={goToNextPage} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Próxima página">
                  
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={goToLastPage} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Última página">
                  
                      <ChevronsRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>}
          </>}
      </Card>

      {/* Modal Form */}
      <EmpresaConveniadaForm isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setEmpresaEdit(null);
    }} onSave={handleSaveEmpresa} empresa={empresaEdit || undefined} />
      

      {/* Dialog Container */}
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />

      {/* ⭐ Modal de Relatório de Atendimentos */}
      <Modal isOpen={relatorioOpen} onClose={() => setRelatorioOpen(false)} title={`📊 Relatório de Atendimentos — ${relatorioEmpresa?.nome || ''}`} size="large">
        
        <div className="space-y-4">
          {/* Filtros de período */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Data Início
                </label>
                <Input type="date" value={relatorioInicio} onChange={(e) => setRelatorioInicio(e.target.value)} />
                
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Data Fim
                </label>
                <Input type="date" value={relatorioFim} onChange={(e) => setRelatorioFim(e.target.value)} />
                
              </div>
              <Button onClick={handleGerarRelatorio} disabled={relatorioLoading} className="w-full sm:w-auto">
                
                {relatorioLoading ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <CalendarIcon className="w-4 h-4 mr-2" />}
                Gerar Relatório
              </Button>
            </div>
            {/* ⭐ Atalhos de período */}
            <div className="flex flex-wrap gap-1">
              <button onClick={() => {
              const hoje = new Date();
              setRelatorioInicio(hoje.toISOString().split('T')[0]);
              setRelatorioFim(hoje.toISOString().split('T')[0]);
            }} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
                
                Hoje
              </button>
              <button onClick={() => {
              const hoje = new Date();
              const inicioSemana = new Date(hoje);
              inicioSemana.setDate(hoje.getDate() - hoje.getDay() - 7);
              const fimSemana = new Date(inicioSemana);
              fimSemana.setDate(inicioSemana.getDate() + 6);
              setRelatorioInicio(inicioSemana.toISOString().split('T')[0]);
              setRelatorioFim(fimSemana.toISOString().split('T')[0]);
            }} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
                
                Semana Anterior
              </button>
              <button onClick={() => {
              const hoje = new Date();
              const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
              const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
              setRelatorioInicio(inicioMes.toISOString().split('T')[0]);
              setRelatorioFim(fimMes.toISOString().split('T')[0]);
            }} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
                
                Mês Atual
              </button>
              <button onClick={() => {
              const hoje = new Date();
              const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
              const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
              setRelatorioInicio(inicioMesAnterior.toISOString().split('T')[0]);
              setRelatorioFim(fimMesAnterior.toISOString().split('T')[0]);
            }} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
                
                Mês Anterior
              </button>
            </div>
          </div>

          {/* Filtro de Status */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Status da Agenda
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATUS_LABELS).map(([status, label]) => <label key={status} className="flex items-center gap-1.5 text-sm cursor-pointer">
                
                  <input type="checkbox" checked={relatorioStatusFilter.includes(status)} onChange={(e) => {
                if (e.target.checked) {
                  setRelatorioStatusFilter([...relatorioStatusFilter, status]);
                } else {
                  setRelatorioStatusFilter(relatorioStatusFilter.filter((s) => s !== status));
                }
              }} className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500" />
                
                  {label}
                </label>)}
            </div>
          </div>

          {/* Resultado */}
          {relatorioLoading ? <div className="text-center py-8">
              <Loader2Icon className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
              <p className="text-gray-500 mt-2">Buscando atendimentos...</p>
            </div> : relatorioData.length > 0 ? <>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-teal-700">
                    {relatorioData.length}
                  </p>
                  <p className="text-xs text-teal-600">Total de Atendimentos</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {new Set(relatorioData.map((c: any) => c.pacienteId)).size}
                  </p>
                  <p className="text-xs text-blue-600">Pacientes Atendidos</p>
                </div>
              </div>

              {/* Tabela */}
              <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-[90px]">
                        Data
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-[60px]">
                        Hora
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Paciente
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Profissional
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase w-[110px]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {relatorioData.sort((a: any, b: any) => (a.data + a.horario).localeCompare(b.data + b.horario)).map((c: any, i: number) => <tr key={i} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                            {new Date((c.data?.split(' ')[0] || c.data) + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                            {c.horario || '-'}
                          </td>
                          <td className="px-2 py-2 font-medium truncate" title={c.pacienteNome || '-'}>
                      
                            {c.pacienteNome || '-'}
                          </td>
                          <td className="px-2 py-2 text-gray-600 truncate" title={c.profissional || c.profissionalNomeJoin || c.profissionalNome || '-'}>
                      
                            {c.profissional || c.profissionalNomeJoin || c.profissionalNome || '-'}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Badge status={c.status} />
                          </td>
                        </tr>)}
                  </tbody>
                </table>
              </div>

              {/* Botão imprimir */}
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleImprimirRelatorio}>
                  <PrinterIcon className="w-4 h-4 mr-2" />
                  Imprimir Relatório
                </Button>
              </div>
            </> : relatorioInicio && relatorioFim ? <div className="text-center py-8 text-gray-500">
              <FileTextIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>
                Clique em "Gerar Relatório" para buscar os atendimentos do
                período selecionado.
              </p>
            </div> : null}
        </div>
      </Modal>

      {/* ⭐ Modal de Relatório de Pacientes */}
      <Modal isOpen={relatorioPacientesOpen} onClose={() => setRelatorioPacientesOpen(false)} title={`👥 Relatório de Pacientes — ${relatorioPacientesEmpresa?.nome || ''}`} size="large">
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Status do Paciente
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(STATUS_PACIENTE_LABELS).map(([status, label]) => <label key={status} className="flex items-center gap-1.5 text-sm cursor-pointer">
                
                  <input type="checkbox" checked={relatorioPacientesStatusFilter.includes(status)} onChange={(e) => {
                if (e.target.checked) {
                  setRelatorioPacientesStatusFilter([...relatorioPacientesStatusFilter, status]);
                } else {
                  setRelatorioPacientesStatusFilter(relatorioPacientesStatusFilter.filter((s) => s !== status));
                }
              }} className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500" />
                
                  {label}
                </label>)}
            </div>
            <Button onClick={handleGerarRelatorioPacientes} disabled={relatorioPacientesLoading || relatorioPacientesStatusFilter.length === 0} className="w-full sm:w-auto">
              
              {relatorioPacientesLoading ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <UsersIcon className="w-4 h-4 mr-2" />}
              Gerar Relatório
            </Button>
          </div>

          {relatorioPacientesLoading ? <div className="py-12 flex flex-col items-center justify-center">
              <Loader2Icon className="w-8 h-8 text-teal-600 animate-spin" />
              <p className="text-gray-500 mt-2">Buscando pacientes...</p>
            </div> : relatorioPacientesData.length > 0 ? <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-teal-50 border border-teal-100 p-4 rounded-xl">
                  <p className="text-sm text-teal-600 font-medium mb-1">
                    Total de Pacientes
                  </p>
                  <p className="text-2xl font-bold text-teal-900">
                    {relatorioPacientesData.length}
                  </p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 font-medium text-gray-600">
                          Nome
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-600">
                          CPF
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-600">
                          Telefone
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-600">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {relatorioPacientesData.map((p: any) => <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {p.nome}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {p.cpf || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {p.telefone || '-'}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                        const st = normalizarStatusPaciente(p.status);
                        return <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_PACIENTE_COLORS[st] || 'bg-gray-100 text-gray-800'}`}>
                              
                                  {STATUS_PACIENTE_LABELS[st] || 'Pré-Cadastro'}
                                </span>;
                      })()}
                          </td>
                        </tr>)}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleImprimirRelatorioPacientes}>
                  <PrinterIcon className="w-4 h-4 mr-2" />
                  Imprimir Relatório
                </Button>
              </div>
            </div> : <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {relatorioPacientesStatusFilter.length === 0 ? 'Selecione um ou mais status acima e clique em "Gerar Relatório".' : 'Clique em "Gerar Relatório" para buscar os pacientes com os status selecionados.'}
              </p>
            </div>}
        </div>
      </Modal>
    </div>;
}