import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBoletos } from '../hooks/useBoletos';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { BoletoModal } from '../components/BoletoModal';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { API_BASE_URL } from '../config/api';
import { formatarTelefoneWhatsApp } from '../services/whatsappMessages';
import { Swal } from '../components/ui/SweetAlert';
import { BanknoteIcon, PlusIcon, SearchIcon, FilterIcon, ArrowUpRightIcon, ArrowDownLeftIcon, ClockIcon, AlertCircleIcon, TrashIcon, CheckCircleIcon, SendIcon, EyeIcon, CheckSquareIcon, SquareIcon, Loader2Icon, XCircleIcon, CalendarIcon, XIcon, MessageCircleIcon } from 'lucide-react';
import { Parcela } from '../types';
interface EnvioStatus {
  pacienteId: string;
  pacienteNome: string;
  status: 'pendente' | 'enviando' | 'sucesso' | 'erro';
  mensagem?: string;
}
export function CobrancasPage() {
  const {
    sessao
  } = useAuth();
  const clinicaId = sessao?.clinicaAtual?.id || '';
  const {
    boletos,
    loading,
    stats,
    criarBoleto,
    atualizarBoleto,
    deletarBoleto,
    marcarComoPago
  } = useBoletos(clinicaId);
  const {
    success,
    error: showError,
    warning,
    info
  } = useToast();
  const {
    confirm
  } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [boletoSelecionado, setBoletoSelecionado] = useState<Parcela | null>(null);
  // Filtro por período
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  // ⭐ Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 20;
  // Seleção múltipla para envio em massa
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [isEnvioMassaOpen, setIsEnvioMassaOpen] = useState(false);
  const [enviandoMassa, setEnviandoMassa] = useState(false);
  const [statusEnvios, setStatusEnvios] = useState<EnvioStatus[]>([]);
  // Mapeia IDs de pacientes para nomes e telefones - busca da API
  const [pacientesMap, setPacientesMap] = useState<Map<string, {
    nome: string;
    telefone: string;
  }>>(new Map());
  const [loadingPacientes, setLoadingPacientes] = useState(false);
  // ⭐ FIX: Usa string de IDs como dependência estável (evita loop infinito)
  const pacienteIdsKey = useMemo(() => {
    return [...new Set(boletos.map((b) => b.pacienteId).filter(Boolean))].sort().join(',');
  }, [boletos]);
  // ⭐ FIX PERFORMANCE: Busca pacientes em lotes de 5 (não todos de uma vez)
  useEffect(() => {
    const buscarDadosPacientes = async () => {
      if (!clinicaId || !pacienteIdsKey) return;
      const pacienteIds = pacienteIdsKey.split(',');
      if (pacienteIds.length === 0) return;
      setLoadingPacientes(true);
      const novoMap = new Map<string, {
        nome: string;
        telefone: string;
      }>();
      try {
        // ⭐ Processa em lotes de 5 para não sobrecarregar o servidor
        const BATCH_SIZE = 5;
        for (let i = 0; i < pacienteIds.length; i += BATCH_SIZE) {
          const batch = pacienteIds.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (id) => {
            try {
              const response = await fetch(`${API_BASE_URL}/api/pacientes/${id}?clinicaId=${clinicaId}`);
              if (response.ok) {
                const paciente = await response.json();
                novoMap.set(id, {
                  nome: paciente.nome,
                  telefone: paciente.telefone || ''
                });
              }
            } catch (err) {


              // Silencia erro individual — não trava o resto
            }}));
        }
        setPacientesMap(novoMap);
      } catch (err) {
        console.error('Erro ao buscar dados dos pacientes:', err);
      } finally {
        setLoadingPacientes(false);
      }
    };
    buscarDadosPacientes();
  }, [clinicaId, pacienteIdsKey]);
  const boletosFiltrados = useMemo(() => {
    return boletos.filter((boleto) => {
      const pacienteData = pacientesMap.get(boleto.pacienteId);
      const pacienteNome = pacienteData?.nome || 'Carregando...';
      const matchesSearch = pacienteNome.toLowerCase().includes(searchTerm.toLowerCase()) || boleto.valorParcela.toString().includes(searchTerm);
      const matchesStatus = statusFilter === 'todos' || boleto.status === statusFilter;
      let matchesPeriodo = true;
      if (dataInicio) {
        matchesPeriodo = matchesPeriodo && boleto.dataVencimento >= dataInicio;
      }
      if (dataFim) {
        matchesPeriodo = matchesPeriodo && boleto.dataVencimento <= dataFim;
      }
      return matchesSearch && matchesStatus && matchesPeriodo;
    }).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  }, [boletos, searchTerm, statusFilter, pacientesMap, dataInicio, dataFim]);
  // ⭐ Paginação dos resultados filtrados
  const totalPaginas = Math.ceil(boletosFiltrados.length / ITENS_POR_PAGINA);
  const boletosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return boletosFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [boletosFiltrados, paginaAtual]);
  // Reset página ao mudar filtros
  useEffect(() => {
    setPaginaAtual(1);
  }, [searchTerm, statusFilter, dataInicio, dataFim]);
  // Boletos pendentes selecionáveis (apenas pendentes e vencidos)
  const boletosEnviaveis = useMemo(() => {
    return boletosFiltrados.filter((b) => b.status === 'pendente' || b.status === 'vencido');
  }, [boletosFiltrados]);
  const handleNovoBoleto = () => {
    setBoletoSelecionado(null);
    setIsModalOpen(true);
  };
  const handleVerDetalhes = (boleto: Parcela) => {
    setBoletoSelecionado(boleto);
    setIsModalOpen(true);
  };
  const handleMarcarPago = async (id: string) => {
    try {
      await marcarComoPago(id);
      Swal.fire({
        icon: 'success',
        title: 'Sucesso!',
        text: 'Boleto marcado como pago!',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: err.message
      });
    }
  };
  const handleExcluir = async (id: string) => {
    const pacienteData = pacientesMap.get(boletos.find((b) => b.id === id)?.pacienteId || '');
    const pacienteNome = pacienteData?.nome || 'este paciente';
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Confirmar Exclusão',
      text: `Tem certeza que deseja excluir a cobrança de ${pacienteNome}? Esta ação não pode ser desfeita.`,
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sim, excluir!',
      cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
      try {
        await deletarBoleto(id);
        Swal.fire({
          icon: 'success',
          title: 'Excluído!',
          text: 'Cobrança excluída com sucesso.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: err.message
        });
      }
    }
  };
  // Limpar filtro de período
  const handleLimparPeriodo = () => {
    setDataInicio('');
    setDataFim('');
  };
  // Atalhos de período
  const handlePeriodoHoje = () => {
    const hoje = new Date().toISOString().split('T')[0];
    setDataInicio(hoje);
    setDataFim(hoje);
  };
  const handlePeriodoSemana = () => {
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    setDataInicio(inicioSemana.toISOString().split('T')[0]);
    setDataFim(fimSemana.toISOString().split('T')[0]);
  };
  const handlePeriodoMes = () => {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    setDataInicio(inicioMes.toISOString().split('T')[0]);
    setDataFim(fimMes.toISOString().split('T')[0]);
  };
  const handlePeriodoMesSeguinte = () => {
    const hoje = new Date();
    const inicioMesSeguinte = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const fimMesSeguinte = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
    setDataInicio(inicioMesSeguinte.toISOString().split('T')[0]);
    setDataFim(fimMesSeguinte.toISOString().split('T')[0]);
  };
  const handlePeriodoVencidos = () => {
    const hoje = new Date().toISOString().split('T')[0];
    setDataInicio('');
    setDataFim(hoje);
    setStatusFilter('vencido');
  };
  // Seleção múltipla
  const handleToggleSelecao = (id: string) => {
    const novoSet = new Set(selecionados);
    if (novoSet.has(id)) {
      novoSet.delete(id);
    } else {
      novoSet.add(id);
    }
    setSelecionados(novoSet);
  };
  const handleSelecionarTodos = () => {
    if (selecionados.size === boletosEnviaveis.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(boletosEnviaveis.map((b) => b.id)));
    }
  };
  const handleIniciarEnvioMassa = async () => {
    if (selecionados.size === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Nenhuma cobrança selecionada',
        html: `
          <p>Selecione as cobranças que deseja enviar usando os <strong>checkboxes</strong> na tabela.</p>
          <p class="mt-2 text-sm text-gray-500">Apenas cobranças <strong>pendentes</strong> ou <strong>vencidas</strong> podem ser enviadas.</p>
        `,
        confirmButtonColor: '#0d9488'
      });
      return;
    }
    // Verifica se tem WhatsApp configurado
    let config: any = null;
    try {
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`);
      if (!configResponse.ok) {
        Swal.fire({
          icon: 'error',
          title: 'WhatsApp não configurado',
          text: 'Configure o WhatsApp em Configurações antes de enviar cobranças.',
          confirmButtonColor: '#0d9488'
        });
        return;
      }
      config = await configResponse.json();
      if (!config.serverUrl || !config.sessionName) {
        Swal.fire({
          icon: 'error',
          title: 'WhatsApp incompleto',
          text: 'Configure o servidor e sessão do WhatsApp em Configurações.',
          confirmButtonColor: '#0d9488'
        });
        return;
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: 'Erro ao verificar configuração do WhatsApp'
      });
      return;
    }
    // Calcula valor total
    const boletosParaEnviar = boletos.filter((b) => selecionados.has(b.id));
    const valorTotal = boletosParaEnviar.reduce((acc, b) => acc + b.valorParcela, 0);
    const valorFormatado = valorTotal.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
    // Confirma o envio com SweetAlert
    const result = await Swal.fire({
      icon: 'question',
      title: 'Enviar Cobranças via WhatsApp?',
      html: `
        <div class="text-left">
          <p class="mb-3">Você está prestes a enviar:</p>
          <div class="bg-gray-100 rounded-lg p-3 mb-3">
            <p class="font-bold text-lg text-teal-600">${selecionados.size} cobrança(s)</p>
            <p class="text-gray-600">Valor total: <strong>${valorFormatado}</strong></p>
          </div>
          <p class="text-sm text-gray-500">Cada paciente receberá uma mensagem com o valor e código PIX para pagamento.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#0d9488',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '📤 Enviar Agora',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    // Inicia o envio em massa diretamente (sem abrir modal intermediário)
    await executarEnvioMassaDireto(config, boletosParaEnviar);
  };
  // Função que executa o envio em massa diretamente
  const executarEnvioMassaDireto = async (config: any, boletosParaEnviar: Parcela[]) => {
    // Mostra loading
    setEnviandoMassa(true);
    // Prepara lista de envios para mostrar progresso
    const statusInicial: EnvioStatus[] = boletosParaEnviar.map((b) => ({
      pacienteId: b.pacienteId,
      pacienteNome: pacientesMap.get(b.pacienteId)?.nome || 'Paciente',
      status: 'pendente'
    }));
    setStatusEnvios(statusInicial);
    setIsEnvioMassaOpen(true);
    let sucessos = 0;
    let erros = 0;
    try {
      for (let i = 0; i < boletosParaEnviar.length; i++) {
        const boleto = boletosParaEnviar[i];
        const pacienteData = pacientesMap.get(boleto.pacienteId);
        // Atualiza status para "enviando"
        setStatusEnvios((prev) => prev.map((s, idx) => idx === i ? {
          ...s,
          status: 'enviando'
        } : s));
        try {
          if (!pacienteData?.telefone) {
            throw new Error('Paciente sem telefone cadastrado');
          }
          // ⭐ FIX: formatarTelefoneWhatsApp retorna objeto {numero}, extrair .numero
          const telefone = formatarTelefoneWhatsApp(pacienteData.telefone).numero;
          const valorFormatado = boleto.valorParcela.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          });
          const dataFormatada = new Date(boleto.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
          // Gera código PIX
          const pixCode = `00020126580014BR.GOV.BCB.PIX0136${Date.now().toString(36)}520400005303986540${boleto.valorParcela.toFixed(2).replace('.', '')}5802BR5913CLINICA MEDICA6008SAO PAULO62070503***6304`;
          const mensagem = `Olá ${pacienteData.nome}! 👋

📋 *Cobrança Pendente*

💰 Valor: *${valorFormatado}*
📅 Vencimento: *${dataFormatada}*
${boleto.observacoes ? `📝 Ref: ${boleto.observacoes}` : ''}

*Código PIX para pagamento:*
\`\`\`
${pixCode}
\`\`\`

Por favor, envie o comprovante após o pagamento.
Obrigado!`;
          const sendResponse = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              serverUrl: config.serverUrl,
              sessionName: config.sessionName,
              number: telefone,
              message: mensagem,
              clinicaId,
              pacienteId: boleto.pacienteId,
              pacienteNome: pacienteData.nome
            })
          });
          if (!sendResponse.ok) {
            const errorData = await sendResponse.json().catch(() => ({}));
            throw new Error(errorData.error || 'Erro ao enviar mensagem');
          }
          // Atualiza status para "sucesso"
          setStatusEnvios((prev) => prev.map((s, idx) => idx === i ? {
            ...s,
            status: 'sucesso',
            mensagem: 'Enviado com sucesso!'
          } : s));
          sucessos++;
        } catch (err: any) {
          // Atualiza status para "erro"
          setStatusEnvios((prev) => prev.map((s, idx) => idx === i ? {
            ...s,
            status: 'erro',
            mensagem: err.message
          } : s));
          erros++;
        }
        // Aguarda 1 segundo entre envios para não sobrecarregar
        if (i < boletosParaEnviar.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      // Fecha o modal de progresso
      setIsEnvioMassaOpen(false);
      setStatusEnvios([]);
      setSelecionados(new Set());
      setEnviandoMassa(false);
      // Aguarda um momento para o modal fechar antes de mostrar o SweetAlert
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Exibe SweetAlert com resultado final
      if (erros === 0) {
        await Swal.fire({
          icon: 'success',
          title: '✅ Envio Concluído!',
          html: `
            <div class="text-center">
              <p class="text-lg font-bold text-green-600 mb-2">${sucessos} cobrança(s) enviada(s)</p>
              <p class="text-gray-600">Todas as mensagens foram enviadas com sucesso via WhatsApp!</p>
            </div>
          `,
          confirmButtonColor: '#0d9488',
          confirmButtonText: 'Ótimo!'
        });
      } else if (sucessos === 0) {
        await Swal.fire({
          icon: 'error',
          title: '❌ Falha no Envio',
          html: `
            <div class="text-center">
              <p class="text-lg font-bold text-red-600 mb-2">${erros} erro(s) encontrado(s)</p>
              <p class="text-gray-600">Nenhuma cobrança foi enviada. Verifique se os pacientes possuem telefone cadastrado.</p>
            </div>
          `,
          confirmButtonColor: '#0d9488'
        });
      } else {
        await Swal.fire({
          icon: 'warning',
          title: '⚠️ Envio Parcial',
          html: `
            <div class="text-center">
              <p class="mb-2"><span class="text-green-600 font-bold">${sucessos}</span> enviada(s) com sucesso</p>
              <p><span class="text-red-600 font-bold">${erros}</span> com erro(s)</p>
              <p class="text-gray-600 mt-2">Verifique se todos os pacientes possuem telefone cadastrado.</p>
            </div>
          `,
          confirmButtonColor: '#0d9488'
        });
      }
    } catch (err: any) {
      setEnviandoMassa(false);
      setIsEnvioMassaOpen(false);
      await Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: err.message
      });
    }
  };
  const handleExecutarEnvioMassa = async () => {
    // Esta função agora é usada apenas se o usuário abrir o modal manualmente
    const boletosParaEnviar = boletos.filter((b) => selecionados.has(b.id));
    try {
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`);
      const config = await configResponse.json();
      await executarEnvioMassaDireto(config, boletosParaEnviar);
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: err.message
      });
    }
  };
  const handleFecharEnvioMassa = () => {
    if (enviandoMassa) return; // Não permite fechar durante o envio
    setIsEnvioMassaOpen(false);
    setStatusEnvios([]);
    setSelecionados(new Set());
  };
  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };
  const formatarData = (data: string) => {
    if (!data) return '-';
    return new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pago':
        return <Badge variant="success">Pago</Badge>;
      case 'pendente':
        return <Badge variant="warning">Pendente</Badge>;
      case 'vencido':
        return <Badge variant="danger">Vencido</Badge>;
      case 'cancelado':
        return <Badge variant="default">Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  const getPacienteData = (pacienteId: string) => {
    if (loadingPacientes) return {
      nome: 'Carregando...',
      telefone: ''
    };
    return pacientesMap.get(pacienteId) || {
      nome: 'Paciente não encontrado',
      telefone: ''
    };
  };
  // Contadores de envio
  const enviosSucesso = statusEnvios.filter((s) => s.status === 'sucesso').length;
  const enviosErro = statusEnvios.filter((s) => s.status === 'erro').length;
  const enviosPendentes = statusEnvios.filter((s) => s.status === 'pendente' || s.status === 'enviando').length;
  // Verifica se há filtro de período ativo
  const temFiltroPeriodo = dataInicio || dataFim;
  return <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <BanknoteIcon className="w-8 h-8 text-teal-600" />
            </div>
            Gestão de Cobranças
          </h1>
          <p className="text-gray-500 mt-1 ml-14">
            Gerencie boletos, pagamentos e inadimplência
          </p>
        </div>
        <div className="flex gap-2">
          {/* Botão de Envio em Massa - SEMPRE VISÍVEL */}
          <Button variant={selecionados.size > 0 ? 'secondary' : 'outline'} onClick={handleIniciarEnvioMassa} className={selecionados.size > 0 ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : ''}>
            
            <MessageCircleIcon className="w-5 h-5 mr-2" />
            {selecionados.size > 0 ? `Enviar ${selecionados.size} via WhatsApp` : 'Enviar em Massa'}
          </Button>
          <Button onClick={handleNovoBoleto} className="shadow-lg hover:shadow-xl transition-all">
            
            <PlusIcon className="w-5 h-5 mr-2" />
            Novo Boleto
          </Button>
        </div>
      </div>

      {/* Dica de seleção quando não há itens selecionados */}
      {boletosEnviaveis.length > 0 && selecionados.size === 0 && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-full">
            <MessageCircleIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-blue-800">
              <strong>Dica:</strong> Selecione as cobranças na tabela usando os
              checkboxes para enviar via WhatsApp em massa.
            </p>
          </div>
          <button onClick={handleSelecionarTodos} className="text-sm font-medium text-blue-600 hover:text-blue-800 underline">
          
            Selecionar todas ({boletosEnviaveis.length})
          </button>
        </div>}

      {/* ⭐ Seção fixa: Stats + Filtros */}
      <div className="flex-shrink-0 space-y-4 px-0">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-blue-500 bg-gradient-to-br from-white to-blue-50">
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    Total Emitido
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">
                    {formatarMoeda(stats.totalEmitido)}
                  </h3>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ArrowUpRightIcon className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-green-500 bg-gradient-to-br from-white to-green-50">
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Recebido</p>
                  <h3 className="text-2xl font-bold text-green-600 mt-1">
                    {formatarMoeda(stats.totalPago)}
                  </h3>
                </div>
                <div className="p-2 bg-green-100 rounded-lg">
                  <ArrowDownLeftIcon className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-yellow-500 bg-gradient-to-br from-white to-yellow-50">
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Pendente</p>
                  <h3 className="text-2xl font-bold text-yellow-600 mt-1">
                    {formatarMoeda(stats.totalPendente)}
                  </h3>
                </div>
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <ClockIcon className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-red-500 bg-gradient-to-br from-white to-red-50">
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Vencido</p>
                  <h3 className="text-2xl font-bold text-red-600 mt-1">
                    {formatarMoeda(stats.totalVencido)}
                  </h3>
                </div>
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircleIcon className="w-5 h-5 text-red-600" />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card>
          <div className="p-4 space-y-4">
            {/* Linha 1: Busca e Status */}
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input placeholder="Buscar por paciente ou valor..." className="pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <FilterIcon className="text-gray-400 w-5 h-5" />
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={[{
                value: 'todos',
                label: 'Todos os Status'
              }, {
                value: 'pendente',
                label: 'Pendente'
              }, {
                value: 'pago',
                label: 'Pago'
              }, {
                value: 'vencido',
                label: 'Vencido'
              }, {
                value: 'cancelado',
                label: 'Cancelado'
              }]} className="w-full md:w-48" />
                
              </div>
            </div>

            {/* Linha 2: Filtro por Período */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex items-center gap-2">
                <CalendarIcon className="text-gray-400 w-5 h-5" />
                <span className="text-sm font-medium text-gray-700">
                  Período de Vencimento:
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-40" placeholder="Data inicial" />
                  
                  <span className="text-gray-400">até</span>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-40" placeholder="Data final" />
                  
                </div>

                {temFiltroPeriodo && <button onClick={handleLimparPeriodo} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Limpar filtro de período">
                  
                    <XIcon className="w-4 h-4" />
                  </button>}
              </div>

              {/* Atalhos de período */}
              <div className="flex flex-wrap gap-1">
                <button onClick={handlePeriodoHoje} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  
                  Hoje
                </button>
                <button onClick={handlePeriodoSemana} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  
                  Esta Semana
                </button>
                <button onClick={handlePeriodoMes} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  
                  Este Mês
                </button>
                <button onClick={handlePeriodoMesSeguinte} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  
                  Mês Seguinte
                </button>
                <button onClick={handlePeriodoVencidos} className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                  
                  Vencidos
                </button>
              </div>
            </div>

            {/* Indicador de filtro ativo */}
            {temFiltroPeriodo && <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 px-3 py-2 rounded-lg">
                <CalendarIcon className="w-4 h-4" />
                <span>
                  Filtrando por vencimento:{' '}
                  {dataInicio ? formatarData(dataInicio) : 'início'} até{' '}
                  {dataFim ? formatarData(dataFim) : 'fim'}
                </span>
                <span className="text-teal-600 font-medium">
                  ({boletosFiltrados.length} resultado
                  {boletosFiltrados.length !== 1 ? 's' : ''})
                </span>
              </div>}
          </div>
        </Card>
      </div>
      {/* Fim da seção fixa */}

      {/* Barra de seleção quando há itens selecionados */}
      {selecionados.size > 0 && <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquareIcon className="w-6 h-6 text-teal-600" />
            <span className="font-medium text-teal-800">
              {selecionados.size} cobrança(s) selecionada(s)
            </span>
            <span className="text-teal-600">
              (Total:{' '}
              {formatarMoeda(boletos.filter((b) => selecionados.has(b.id)).reduce((acc, b) => acc + b.valorParcela, 0))}
              )
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelecionados(new Set())} size="sm">
            
              Limpar seleção
            </Button>
            <Button onClick={handleIniciarEnvioMassa} size="sm" className="bg-green-600 hover:bg-green-700">
            
              <SendIcon className="w-4 h-4 mr-2" />
              Enviar via WhatsApp
            </Button>
          </div>
        </div>}

      {/* ⭐ Seção rolável: Tabela */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-4">
        <Card className="overflow-hidden">
          {loading ? <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <p className="text-gray-500 mt-2">Carregando cobranças...</p>
            </div> : boletosFiltrados.length === 0 ? <div className="p-12 text-center bg-gray-50">
              <BanknoteIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                {temFiltroPeriodo ? 'Nenhuma cobrança no período selecionado' : 'Nenhuma cobrança encontrada'}
              </h3>
              <p className="text-gray-500 mt-1">
                {temFiltroPeriodo ? 'Tente ajustar o filtro de período.' : 'Crie um novo boleto para começar a gerenciar.'}
              </p>
              {!temFiltroPeriodo && <Button onClick={handleNovoBoleto} variant="outline" className="mt-4">
              
                  Criar Primeira Cobrança
                </Button>}
            </div> : <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button onClick={handleSelecionarTodos} className="p-1 hover:bg-gray-200 rounded transition-colors" title={selecionados.size === boletosEnviaveis.length ? 'Desmarcar todos' : 'Selecionar todos pendentes'}>
                      
                        {selecionados.size === boletosEnviaveis.length && boletosEnviaveis.length > 0 ? <CheckSquareIcon className="w-5 h-5 text-teal-600" /> : <SquareIcon className="w-5 h-5 text-gray-400" />}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paciente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {boletosPaginados.map((boleto) => {
                const pacienteData = getPacienteData(boleto.pacienteId);
                const podeSelecionar = boleto.status === 'pendente' || boleto.status === 'vencido';
                const estaSelecionado = selecionados.has(boleto.id);
                return <tr key={boleto.id} className={`hover:bg-gray-50 transition-colors ${estaSelecionado ? 'bg-teal-50' : ''}`}>
                      
                        <td className="px-4 py-4">
                          {podeSelecionar ? <button onClick={() => handleToggleSelecao(boleto.id)} className="p-1 hover:bg-gray-200 rounded transition-colors">
                          
                              {estaSelecionado ? <CheckSquareIcon className="w-5 h-5 text-teal-600" /> : <SquareIcon className="w-5 h-5 text-gray-400" />}
                            </button> : <div className="w-7 h-7" />}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
                              {pacienteData.nome.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {pacienteData.nome}
                              </div>
                              <div className="text-xs text-gray-500">
                                {pacienteData.telefone || 'Sem telefone'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-900">
                            {formatarMoeda(boleto.valorParcela)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {boleto.formaPagamento || 'PIX'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatarData(boleto.dataVencimento)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(boleto.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            {boleto.status === 'pendente' && <button onClick={() => handleMarcarPago(boleto.id)} className="text-green-600 hover:text-green-900 p-1 rounded-full hover:bg-green-50" title="Marcar como Pago">
                            
                                <CheckCircleIcon className="w-5 h-5" />
                              </button>}
                            <button onClick={() => handleVerDetalhes(boleto)} className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-50" title="Ver Detalhes / Enviar">
                            
                              <EyeIcon className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleExcluir(boleto.id)} className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-50" title="Excluir">
                            
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>;
              })}
                </tbody>
              </table>
            </div>}
          {/* ⭐ Paginação */}
          {totalPaginas > 1 && <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Mostrando {(paginaAtual - 1) * ITENS_POR_PAGINA + 1}-
                {Math.min(paginaAtual * ITENS_POR_PAGINA, boletosFiltrados.length)}{' '}
                de {boletosFiltrados.length}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))} disabled={paginaAtual === 1} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                
                  Anterior
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {paginaAtual} / {totalPaginas}
                </span>
                <button onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                
                  Próxima
                </button>
              </div>
            </div>}
        </Card>
      </div>
      {/* Fim da seção rolável */}

      <BoletoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} clinicaId={clinicaId} onSave={criarBoleto} boletoExistente={boletoSelecionado} />
      

      {/* Modal de Progresso de Envio */}
      <Modal isOpen={isEnvioMassaOpen} onClose={handleFecharEnvioMassa} title="📤 Enviando Cobranças via WhatsApp" size="medium" footer={enviandoMassa ? null : <>
              <Button variant="ghost" onClick={handleFecharEnvioMassa}>
                Cancelar
              </Button>
              {enviosPendentes > 0 && <Button onClick={handleExecutarEnvioMassa} className="bg-green-600 hover:bg-green-700">
            
                  <SendIcon className="w-4 h-4 mr-2" />
                  Iniciar Envio
                </Button>}
            </>}>
        
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">
                {statusEnvios.length}
              </p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {enviosSucesso}
              </p>
              <p className="text-xs text-green-600">Enviados</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{enviosErro}</p>
              <p className="text-xs text-red-600">Erros</p>
            </div>
          </div>

          {/* Lista de envios */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {statusEnvios.map((envio, index) => <div key={index} className={`flex items-center justify-between p-3 rounded-lg border ${envio.status === 'sucesso' ? 'bg-green-50 border-green-200' : envio.status === 'erro' ? 'bg-red-50 border-red-200' : envio.status === 'enviando' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              
                <div className="flex items-center gap-3">
                  {envio.status === 'enviando' && <Loader2Icon className="w-5 h-5 text-blue-600 animate-spin" />}
                  {envio.status === 'sucesso' && <CheckCircleIcon className="w-5 h-5 text-green-600" />}
                  {envio.status === 'erro' && <XCircleIcon className="w-5 h-5 text-red-600" />}
                  {envio.status === 'pendente' && <ClockIcon className="w-5 h-5 text-gray-400" />}
                  <div>
                    <p className="font-medium text-gray-900">
                      {envio.pacienteNome}
                    </p>
                    {envio.mensagem && <p className={`text-xs ${envio.status === 'erro' ? 'text-red-600' : 'text-green-600'}`}>
                    
                        {envio.mensagem}
                      </p>}
                  </div>
                </div>
                <Badge variant={envio.status === 'sucesso' ? 'success' : envio.status === 'erro' ? 'danger' : envio.status === 'enviando' ? 'info' : 'default'}>
                
                  {envio.status === 'enviando' ? 'Enviando...' : envio.status === 'sucesso' ? 'Enviado' : envio.status === 'erro' ? 'Erro' : 'Aguardando'}
                </Badge>
              </div>)}
          </div>

          {enviandoMassa && <div className="text-center py-4">
              <Loader2Icon className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                Enviando mensagens... Por favor, aguarde.
              </p>
            </div>}
        </div>
      </Modal>
    </div>;
}