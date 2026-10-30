import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/useToast';
import { useConfiguracoesGlobais } from '../hooks/useConfiguracoesGlobais';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Swal } from '../components/ui/SweetAlert';
import {
  ClockIcon,
  UserIcon,
  CalendarIcon,
  FileTextIcon,
  CheckCircleIcon,
  Loader2Icon,
  LogOutIcon,
  LogInIcon,
  AlertTriangleIcon,
  ShieldIcon,
  CreditCardIcon,
  ScanFaceIcon,
  FingerprintIcon,
  Edit2Icon,
  Trash2Icon,
  PrinterIcon } from
'lucide-react';
import { CadastroFacialTab } from '../components/ponto/CadastroFacialTab';
import { ValidacaoLocalizacaoCard } from '../components/ponto/ValidacaoLocalizacaoCard';
import { BiometriaDigitalTab } from '../components/ponto/BiometriaDigitalTab';
interface PontoFacialConfig {
  ativo: boolean;
  ativadoEm?: string;
  ativadoPor?: string;
}
function getUsuarioSessao(): {
  id: string;
  nome: string;
  tipo: string;
} {
  try {
    const raw = localStorage.getItem('sessao');
    const u = raw ? JSON.parse(raw).usuario : null;
    return {
      id: u?.id || '',
      nome: u?.nome || 'Administrador',
      tipo: u?.tipo || ''
    };
  } catch {
    return {
      id: '',
      nome: 'Administrador',
      tipo: ''
    };
  }
}
interface Funcionario {
  id: string;
  nome: string;
  tipo: string;
}
interface RegistroPonto {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  tipo: 'entrada' | 'saida';
  dataHora: string;
  dia: string;
  observacoes?: string;
}
interface RelatorioDia {
  dia: string;
  minutos: number;
  registros: {
    id: string;
    tipo: string;
    dataHora: string;
  }[];
}
interface RelatorioFuncionario {
  usuarioId: string;
  usuarioNome: string;
  totalMinutos: number;
  totalHoras: number;
  dias: RelatorioDia[];
}
interface RelatorioData {
  periodo: {
    inicio: string | null;
    fim: string | null;
  };
  funcionarios: RelatorioFuncionario[];
}
function getClinicaId(): string {
  try {
    const raw = localStorage.getItem('sessao');
    return raw ? JSON.parse(raw).clinicaAtual?.id || '' : '';
  } catch {
    return '';
  }
}
function formatarDataHora(isoString: string) {
  return new Date(isoString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
function formatarHoras(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
// ⭐ Normaliza o tipo do registro. O banco pode ter valores legados ('chegada')
//    vindos da biometria; tudo que não for 'saida' é tratado como 'entrada'.
function normalizarTipo(tipo: string): 'entrada' | 'saida' {
  return tipo === 'saida' ? 'saida' : 'entrada';
}
// ⭐ Dia LOCAL (YYYY-MM-DD) de uma data ISO. Os registros são gravados em UTC;
//    agrupar/exibir pelo dia LOCAL evita que uma batida noturna apareça no dia
//    errado (o cabeçalho do dia precisa bater com a hora exibida e editada).
function diaLocal(isoString: string): string {
  const d = new Date(isoString);
  const ano = d.getFullYear();
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const dia = d.getDate().toString().padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
// ⭐ Converte uma data ISO para o formato aceito pelo input datetime-local
//    (YYYY-MM-DDTHH:mm) já no fuso LOCAL.
function isoParaDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).
  toISOString().
  slice(0, 16);
}
export function PontoPage() {
  const { success, error } = useToast();
  const clinicaId = getClinicaId();
  const usuario = getUsuarioSessao();
  const isSuperAdmin = usuario.tipo === 'super_admin';
  const isAdmin = usuario.tipo === 'admin' || isSuperAdmin;
  // ⭐ Taxa mensal global do serviço facial
  const taxaPontoFacial = useConfiguracoesGlobais<number>(
    'taxa_ponto_facial',
    49.9
  );
  // ⭐ Status de ativação do serviço facial DESTA clínica
  const pontoFacialConfig = useConfiguracoesGlobais<PontoFacialConfig>(
    `ponto_facial_ativo_${clinicaId}`,
    {
      ativo: false
    }
  );
  const [activeTab, setActiveTab] = useState<
    'registro' | 'relatorio' | 'facial' | 'digital'>(
    'registro');
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activating, setActivating] = useState(false);
  // Dados
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [registros, setRegistros] = useState<RegistroPonto[]>([]);
  const [relatorio, setRelatorio] = useState<RelatorioData | null>(null);
  // Filtros Registro
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // Filtros Relatório
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [filtroFuncionario, setFiltroFuncionario] = useState('todos');
  // Edição de Registro
  const [editingRegistro, setEditingRegistro] = useState<{
    id: string;
    dataHora: string;
    tipo: string;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // ⭐ Reagrupa o relatório pelo dia LOCAL de cada batida (o backend agrupa pelo
  //    dia em UTC). Assim o cabeçalho do dia, a hora exibida e o valor carregado
  //    no modal de edição ficam sempre consistentes — corrige o "dia errado".
  const relatorioLocal = useMemo<RelatorioFuncionario[]>(() => {
    if (!relatorio) return [];
    return relatorio.funcionarios.map((func) => {
      const todosRegistros = func.dias.flatMap((d) => d.registros);
      const porDia = new Map<string, RelatorioDia>();
      for (const r of todosRegistros) {
        const dia = diaLocal(r.dataHora);
        if (!porDia.has(dia))
        porDia.set(dia, {
          dia,
          minutos: 0,
          registros: []
        });
        porDia.get(dia)!.registros.push(r);
      }
      // Recalcula os minutos por dia pareando entrada -> próxima saída (ordem local).
      const dias = Array.from(porDia.values()).
      map((d) => {
        const ordenados = [...d.registros].sort(
          (a, b) =>
          new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()
        );
        let minutos = 0;
        let abertura: number | null = null;
        for (const r of ordenados) {
          const t = normalizarTipo(r.tipo);
          if (t === 'entrada') {
            abertura = new Date(r.dataHora).getTime();
          } else if (t === 'saida' && abertura != null) {
            minutos += Math.max(
              0,
              Math.round((new Date(r.dataHora).getTime() - abertura) / 60000)
            );
            abertura = null;
          }
        }
        return {
          dia: d.dia,
          minutos,
          registros: ordenados
        };
      }).
      sort((a, b) => a.dia.localeCompare(b.dia));
      const totalMinutos = dias.reduce((acc, d) => acc + d.minutos, 0);
      return {
        usuarioId: func.usuarioId,
        usuarioNome: func.usuarioNome,
        totalMinutos,
        totalHoras: Number((totalMinutos / 60).toFixed(2)),
        dias
      };
    });
  }, [relatorio]);
  const handleImprimir = useCallback(() => {
    if (relatorioLocal.length === 0) {
      error('Atenção', 'Não há dados para imprimir no período selecionado.');
      return;
    }
    const periodoTexto =
    dataInicio && dataFim ?
    `${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')}` :
    'Período completo';
    const linhas = relatorioLocal.
    map((func) => {
      const diasHtml = func.dias.
      map((dia) => {
        const registros = dia.registros.
        map((r) => {
          const hora = new Date(r.dataHora).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const t =
          normalizarTipo(r.tipo) === 'entrada' ? 'Entrada' : 'Saída';
          return `${t} ${hora}`;
        }).
        join(' · ');
        return `<tr><td>${dia.dia.split('-').reverse().join('/')}</td><td>${registros}</td><td style="text-align:right">${formatarHoras(dia.minutos)}</td></tr>`;
      }).
      join('');
      return `
          <h3 style="margin:18px 0 6px;font-size:15px">${func.usuarioNome} — Total: ${formatarHoras(func.totalMinutos)}</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="border-bottom:1px solid #999;text-align:left">
              <th style="padding:4px 6px">Data</th>
              <th style="padding:4px 6px">Registros</th>
              <th style="padding:4px 6px;text-align:right">Horas</th>
            </tr></thead>
            <tbody>${diasHtml}</tbody>
          </table>`;
    }).
    join('');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      error(
        'Bloqueado',
        'O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.'
      );
      return;
    }
    const css = [
    'body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px}',
    'h1{font-size:20px;margin:0 0 4px}',
    'td{padding:4px 6px;border-bottom:1px solid #eee}',
    '@media print{button{display:none}}'].
    join('');
    const html =
    '<!doctype html><html><head><meta charset="utf-8" />' +
    '<title>Relatório de Ponto</title>' +
    '<style>{`' +
    css +
    '`}</style></head><body>' +
    '<h1>Relatório de Ponto</h1>' +
    '<p style="margin:0 0 16px;color:#555;font-size:13px">Período: ' +
    periodoTexto +
    '</p>' +
    linhas +
    '</body></html>';
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }, [relatorioLocal, dataInicio, dataFim, error]);
  const carregarFuncionarios = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ponto/funcionarios?clinicaId=${clinicaId}`
      );
      if (res.ok) {
        const data = await res.json();
        setFuncionarios(data);
      }
    } catch (err) {
      console.error('Erro ao carregar funcionários:', err);
    }
  }, [clinicaId]);
  const carregarRegistros = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ponto/registros?clinicaId=${clinicaId}`
      );
      if (res.ok) {
        const data = await res.json();
        setRegistros(data);
      }
    } catch (err) {
      console.error('Erro ao carregar registros:', err);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  const carregarRelatorio = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/api/ponto/relatorio?clinicaId=${clinicaId}`;
      if (dataInicio) url += `&inicio=${dataInicio}`;
      if (dataFim) url += `&fim=${dataFim}`;
      if (filtroFuncionario !== 'todos')
      url += `&usuarioId=${filtroFuncionario}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRelatorio(data);
      }
    } catch (err) {
      console.error('Erro ao carregar relatório:', err);
      error('Erro', 'Falha ao carregar relatório de ponto');
    } finally {
      setLoading(false);
    }
  }, [clinicaId, dataInicio, dataFim, filtroFuncionario, error]);
  useEffect(() => {
    carregarFuncionarios();
  }, [carregarFuncionarios]);
  useEffect(() => {
    if (activeTab === 'registro') {
      carregarRegistros();
    } else {
      carregarRelatorio();
    }
  }, [activeTab, carregarRegistros, carregarRelatorio]);
  const handleRegistrarPonto = async () => {
    if (!selectedFuncionario) {
      error('Atenção', 'Selecione um funcionário para registrar o ponto.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ponto/registrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          usuarioId: selectedFuncionario,
          observacoes: observacoes.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar ponto');
      success(
        'Ponto Registrado',
        `${data.usuarioNome} marcou ${data.tipo === 'entrada' ? 'Entrada' : 'Saída'} com sucesso!`
      );
      setSelectedFuncionario('');
      setObservacoes('');
      carregarRegistros();
    } catch (err: any) {
      error('Erro', err.message || 'Não foi possível registrar o ponto');
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleAtivarServico = async () => {
    setActivating(true);
    try {
      await pontoFacialConfig.salvar({
        ativo: true,
        ativadoEm: new Date().toISOString(),
        ativadoPor: usuario.nome
      });
      success(
        'Serviço Ativado',
        'O reconhecimento facial foi ativado. A taxa mensal passa a ser aplicada a esta clínica.'
      );
      setShowActivationModal(false);
    } catch (err: any) {
      error('Erro', 'Não foi possível ativar o serviço. Tente novamente.');
    } finally {
      setActivating(false);
    }
  };
  const handleDesativarServico = async () => {
    if (!isSuperAdmin) {
      error('Acesso Negado', 'Apenas o Super Admin pode desativar o serviço.');
      return;
    }
    setActivating(true);
    try {
      await pontoFacialConfig.salvar({
        ativo: false
      });
      success('Serviço Desativado', 'O reconhecimento facial foi desativado.');
    } catch (err: any) {
      error('Erro', 'Não foi possível desativar o serviço.');
    } finally {
      setActivating(false);
    }
  };
  const handleSalvarEdicao = async () => {
    if (!editingRegistro) return;
    setIsSavingEdit(true);
    try {
      // ⭐ O input datetime-local devolve um horário SEM fuso (ex.: "2026-06-22T23:00").
      //    Convertendo com new Date(...).toISOString() ele é interpretado no fuso
      //    LOCAL do navegador e enviado como ISO/UTC sem ambiguidade — assim o
      //    servidor não desloca a hora/dia ao salvar.
      const dataIso = new Date(editingRegistro.dataHora).toISOString();
      const res = await fetch(
        `${API_BASE_URL}/api/ponto/registros/${editingRegistro.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            dataHora: dataIso,
            tipo: normalizarTipo(editingRegistro.tipo)
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || (
          res.status === 404 ?
          'Endpoint de salvamento não encontrado (verifique se o servidor foi atualizado).' :
          `Falha ao atualizar registro (HTTP ${res.status}).`)
        );
      }
      success('Sucesso', 'Registro atualizado com sucesso.');
      setEditingRegistro(null);
      carregarRelatorio();
      if (activeTab === 'registro') carregarRegistros();
    } catch (err: any) {
      console.error(err);
      error('Erro', err.message || 'Não foi possível atualizar o registro.');
    } finally {
      setIsSavingEdit(false);
    }
  };
  const handleExcluirRegistro = async (id: string) => {
    const confirma = await Swal.fire({
      icon: 'warning',
      title: 'Excluir registro?',
      text: 'Esta ação não pode ser desfeita. Deseja realmente excluir este registro de ponto?',
      showCancelButton: true,
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    });
    if (!confirma.isConfirmed) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ponto/registros/${id}?clinicaId=${clinicaId}`,
        {
          method: 'DELETE'
        }
      );
      if (!res.ok) throw new Error('Falha ao excluir');
      success('Sucesso', 'Registro excluído.');
      setEditingRegistro(null);
      carregarRelatorio();
      if (activeTab === 'registro') carregarRegistros();
    } catch (err) {
      console.error(err);
      error('Erro', 'Não foi possível excluir o registro.');
    }
  };
  const servicoAtivo = pontoFacialConfig.valor.ativo;
  const taxaFormatada = taxaPontoFacial.valor.toFixed(2).replace('.', ',');
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClockIcon className="w-6 h-6 text-teal-600" />
            Ponto e Frequência
          </h1>
          <p className="text-gray-500">
            Gerencie a jornada de trabalho dos funcionários da clínica.
          </p>
        </div>

        {/* Abas agrupadas: "Ponto" (registro/relatórios) e "Biometria" (facial/digital),
             separadas por uma divisória para deixar claro que são módulos distintos. */}
        <div className="flex items-center bg-gray-100 p-1 rounded-lg overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab('registro')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'registro' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            
            Registro Manual
          </button>
          <button
            onClick={() => setActiveTab('relatorio')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'relatorio' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            
            Gerenciamento
          </button>

          {/* Divisória entre o grupo de Ponto e o grupo de Biometria */}
          <span
            aria-hidden="true"
            className="mx-1 h-6 w-px bg-gray-300 flex-shrink-0" />
          

          <button
            onClick={() => setActiveTab('facial')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'facial' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            
            <ScanFaceIcon className="w-4 h-4" />
            Biometria Facial
          </button>
          <button
            onClick={() => setActiveTab('digital')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'digital' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            
            <FingerprintIcon className="w-4 h-4" />
            Biometria Digital
          </button>
        </div>
      </div>

      {/* ⭐ Modal de confirmação de ativação (com aviso de cobrança) */}
      <Modal
        isOpen={showActivationModal}
        onClose={() => !activating && setShowActivationModal(false)}
        title="Ativar Reconhecimento Facial">
        
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 mb-1">
                  Cobrança mensal complementar
                </h4>
                <p className="text-sm text-amber-800">
                  Ao ativar este serviço, será aplicada uma{' '}
                  <strong>taxa mensal de uso de R$ {taxaFormatada}/mês</strong>{' '}
                  para esta clínica, somada à sua mensalidade atual.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 text-sm">
              O que está incluído:
            </h4>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                Cadastro facial dos funcionários (4 amostras por pessoa)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                Kiosk de reconhecimento facial em tempo real
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                Verificação de localização (GPS) e detecção automática de
                entrada/saída/almoço
              </li>
            </ul>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Atenção:</strong> após a ativação, apenas o{' '}
              <strong>Super Administrador</strong> poderá desativar o serviço.
              Para desativar, será necessário solicitar ao super admin.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setShowActivationModal(false)}
              disabled={activating}
              className="flex-1">
              
              Cancelar
            </Button>
            <Button
              onClick={handleAtivarServico}
              disabled={activating}
              className="flex-1 bg-teal-600 hover:bg-teal-700">
              
              {activating ?
              <>
                  <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                  Ativando...
                </> :

              <>
                  <CheckCircleIcon className="w-4 h-4 mr-2" />
                  Confirmar e ativar
                </>
              }
            </Button>
          </div>
        </div>
      </Modal>

      {activeTab === 'registro' &&
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Painel de Registro */}
          <Card className="p-6 lg:col-span-1 h-fit">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-gray-400" />
              Registrar Ponto
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Funcionário
                </label>
                <Select
                value={selectedFuncionario}
                onChange={(e) => setSelectedFuncionario(e.target.value)}
                options={[
                {
                  value: '',
                  label: 'Selecione um funcionário...'
                },
                ...funcionarios.map((f) => ({
                  value: f.id,
                  label: f.nome
                }))]
                } />
              
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observações (opcional)
                </label>
                <Input
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Esqueci de bater ontem, Atraso por trânsito..." />
              
              </div>

              <div className="pt-2">
                <Button
                className="w-full py-3 text-lg"
                onClick={handleRegistrarPonto}
                disabled={isSubmitting || !selectedFuncionario}>
                
                  {isSubmitting ?
                <Loader2Icon className="w-5 h-5 animate-spin mx-auto" /> :

                'Registrar Ponto'
                }
                </Button>
                <p className="text-xs text-center text-gray-500 mt-3">
                  O sistema detecta automaticamente se é entrada ou saída com
                  base no último registro do dia.
                </p>
              </div>
            </div>
          </Card>

          {/* Histórico Recente */}
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileTextIcon className="w-5 h-5 text-gray-400" />
              Últimos Registros
            </h2>

            {loading ?
          <div className="flex justify-center py-12">
                <Loader2Icon className="w-8 h-8 animate-spin text-teal-600" />
              </div> :
          registros.length === 0 ?
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                Nenhum registro de ponto encontrado.
              </div> :

          <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="pb-3 font-medium">Data / Hora</th>
                      <th className="pb-3 font-medium">Funcionário</th>
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {registros.slice(0, 15).map((reg) => {
                  const tipoNorm = normalizarTipo(reg.tipo);
                  return (
                    <tr key={reg.id} className="hover:bg-gray-50">
                          <td className="py-3 text-gray-900 font-medium">
                            {formatarDataHora(reg.dataHora)}
                          </td>
                          <td className="py-3 text-gray-700">
                            {reg.usuarioNome}
                          </td>
                          <td className="py-3">
                            <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${tipoNorm === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                          
                              {tipoNorm === 'entrada' ?
                          <LogInIcon className="w-3 h-3" /> :

                          <LogOutIcon className="w-3 h-3" />
                          }
                              {tipoNorm === 'entrada' ? 'Entrada' : 'Saída'}
                            </span>
                          </td>
                          <td
                        className="py-3 text-gray-500 text-xs max-w-[200px] truncate"
                        title={reg.observacoes}>
                        
                            {reg.observacoes || '-'}
                          </td>
                        </tr>);

                })}
                  </tbody>
                </table>
              </div>
          }
          </Card>
        </div>
      }

      {activeTab === 'relatorio' &&
      <div className="space-y-6">
          <Card className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Inicial
                </label>
                <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)} />
              
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Final
                </label>
                <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)} />
              
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Funcionário
                </label>
                <Select
                value={filtroFuncionario}
                onChange={(e) => setFiltroFuncionario(e.target.value)}
                options={[
                {
                  value: 'todos',
                  label: 'Todos os funcionários'
                },
                ...funcionarios.map((f) => ({
                  value: f.id,
                  label: f.nome
                }))]
                } />
              
              </div>
              <Button
              onClick={carregarRelatorio}
              disabled={loading}
              className="w-full md:w-auto">
              
                {loading ?
              <Loader2Icon className="w-4 h-4 animate-spin mr-2" /> :

              <CalendarIcon className="w-4 h-4 mr-2" />
              }
                Filtrar
              </Button>
              <Button
              variant="ghost"
              onClick={handleImprimir}
              disabled={loading || relatorioLocal.length === 0}
              className="w-full md:w-auto border border-gray-200"
              title="Imprimir relatório">
              
                <PrinterIcon className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </Card>

          {loading ?
        <div className="flex justify-center py-12">
              <Loader2Icon className="w-8 h-8 animate-spin text-teal-600" />
            </div> :
        relatorioLocal.length === 0 ?
        <Card className="p-12 text-center text-gray-500">
              Nenhum registro encontrado para o período selecionado.
            </Card> :

        <div className="space-y-6">
              {relatorioLocal.map((func) =>
          <Card key={func.usuarioId} className="overflow-hidden">
                  <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <UserIcon className="w-5 h-5 text-teal-600" />
                      {func.usuarioNome}
                    </h3>
                    <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                      <span className="text-sm text-gray-500 mr-2">
                        Total no período:
                      </span>
                      <span className="font-bold text-teal-700 text-lg">
                        {formatarHoras(func.totalMinutos)}
                      </span>
                    </div>
                  </div>

                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50/50">
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="px-4 py-3 font-medium w-32">Data</th>
                          <th className="px-4 py-3 font-medium">
                            Registros (Entrada / Saída)
                          </th>
                          <th className="px-4 py-3 font-medium text-right w-32">
                            Horas Trabalhadas
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {func.dias.map((dia) => {
                    const dataFormatada = dia.dia.
                    split('-').
                    reverse().
                    join('/');
                    return (
                      <tr key={dia.dia} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {dataFormatada}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {dia.registros.map((r, idx) => {
                              const dataObj = new Date(r.dataHora);
                              const hora = dataObj.toLocaleTimeString(
                                'pt-BR',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }
                              );
                              const tipoNorm = normalizarTipo(r.tipo);
                              return (
                                <button
                                  key={idx}
                                  onClick={() =>
                                  setEditingRegistro({
                                    id: r.id,
                                    dataHora: isoParaDatetimeLocal(
                                      r.dataHora
                                    ),
                                    tipo: tipoNorm
                                  })
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors hover:opacity-80 cursor-pointer ${tipoNorm === 'entrada' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`}
                                  title="Clique para editar">
                                  
                                        {tipoNorm === 'entrada' ?
                                  <LogInIcon className="w-3 h-3" /> :

                                  <LogOutIcon className="w-3 h-3" />
                                  }
                                        {hora}
                                      </button>);

                            })}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-700">
                                {formatarHoras(dia.minutos)}
                              </td>
                            </tr>);

                  })}
                      </tbody>
                    </table>
                  </div>
                </Card>
          )}
            </div>
        }
        </div>
      }

      {activeTab === 'digital' &&
      <BiometriaDigitalTab
        clinicaId={clinicaId}
        funcionarios={funcionarios} />

      }

      {/* Modal de Edição de Registro */}
      <Modal
        isOpen={!!editingRegistro}
        onClose={() => !isSavingEdit && setEditingRegistro(null)}
        title="Editar Registro de Ponto">
        
        {editingRegistro &&
        <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data e Hora
              </label>
              <Input
              type="datetime-local"
              value={editingRegistro.dataHora}
              onChange={(e) =>
              setEditingRegistro({
                ...editingRegistro,
                dataHora: e.target.value
              })
              } />
            
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <Select
              value={editingRegistro.tipo}
              onChange={(e) =>
              setEditingRegistro({
                ...editingRegistro,
                tipo: e.target.value
              })
              }
              options={[
              {
                value: 'entrada',
                label: 'Entrada'
              },
              {
                value: 'saida',
                label: 'Saída'
              }]
              } />
            
            </div>
            <div className="flex gap-3 pt-4">
              <Button
              variant="ghost"
              onClick={() => handleExcluirRegistro(editingRegistro.id)}
              disabled={isSavingEdit}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 px-3"
              title="Excluir registro">
              
                <Trash2Icon className="w-5 h-5" />
              </Button>
              <div className="flex-1 flex gap-3 justify-end">
                <Button
                variant="ghost"
                onClick={() => setEditingRegistro(null)}
                disabled={isSavingEdit}>
                
                  Cancelar
                </Button>
                <Button
                onClick={handleSalvarEdicao}
                disabled={isSavingEdit}
                className="bg-teal-600 hover:bg-teal-700">
                
                  {isSavingEdit ?
                <Loader2Icon className="w-4 h-4 animate-spin mr-2" /> :

                <CheckCircleIcon className="w-4 h-4 mr-2" />
                }
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        }
      </Modal>

      {activeTab === 'facial' &&
      <>
          {pontoFacialConfig.loading || taxaPontoFacial.loading ?
        <div className="flex justify-center py-12">
              <Loader2Icon className="w-8 h-8 animate-spin text-teal-600" />
            </div> :
        !servicoAtivo ?
        // ⭐ Serviço inativo — painel de ativação
        <Card className="p-8 text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ScanFaceIcon className="w-8 h-8 text-teal-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Reconhecimento Facial Desativado
              </h2>
              <p className="text-gray-600 mb-2">
                Ative o reconhecimento facial para que os funcionários marquem
                ponto pela câmera (kiosk biométrico) e para cadastrar os rostos
                da equipe.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm font-medium mb-6">
                <CreditCardIcon className="w-4 h-4" />
                Taxa mensal de uso: R$ {taxaFormatada}/mês
              </div>

              {isAdmin ?
          <div>
                  <Button
              onClick={() => setShowActivationModal(true)}
              className="bg-teal-600 hover:bg-teal-700">
              
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    Ativar serviço facial
                  </Button>
                </div> :

          <p className="text-sm text-gray-500 italic">
                  Apenas um administrador pode ativar este serviço.
                </p>
          }
            </Card> :

        // ⭐ Serviço ativo — banner de status + conteúdo
        <div className="space-y-4">
              <Card className="p-4 bg-green-50 border border-green-200">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900">
                        Serviço facial ativo · taxa mensal de R$ {taxaFormatada}
                      </p>
                      {pontoFacialConfig.valor.ativadoEm &&
                  <p className="text-xs text-gray-600">
                          Ativado em{' '}
                          {new Date(
                      pontoFacialConfig.valor.ativadoEm
                    ).toLocaleDateString('pt-BR')}{' '}
                          por {pontoFacialConfig.valor.ativadoPor}
                        </p>
                  }
                    </div>
                  </div>
                  {isSuperAdmin ?
              <Button
                variant="ghost"
                onClick={handleDesativarServico}
                disabled={activating}
                className="text-red-600 hover:bg-red-50">
                
                      <ShieldIcon className="w-4 h-4 mr-2" />
                      {activating ? 'Desativando...' : 'Desativar serviço'}
                    </Button> :

              <p className="text-xs text-gray-500 italic">
                      Para desativar, solicite ao Super Administrador.
                    </p>
              }
                </div>
              </Card>

              <ValidacaoLocalizacaoCard
            clinicaId={clinicaId}
            podeEditar={isAdmin} />
          

              <CadastroFacialTab
            clinicaId={clinicaId}
            funcionarios={funcionarios} />
          
            </div>
        }
        </>
      }
    </div>);

}