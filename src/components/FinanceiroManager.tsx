import React, { useEffect, useState, useRef } from 'react';
import { useFinanceiro } from '../hooks/useFinanceiro';
import { useToast } from '../hooks/useToast';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { BoletoModal } from './BoletoModal';
import { DollarSignIcon, CalendarIcon, CheckCircleIcon, AlertCircleIcon, XCircleIcon, PlusIcon, TrashIcon, SendIcon, CreditCardIcon, FileTextIcon, Trash2Icon, CheckIcon, MessageCircleIcon, AlertTriangleIcon, QrCodeIcon, BanknoteIcon, WalletIcon, RepeatIcon, HashIcon, PencilIcon, PrinterIcon } from 'lucide-react';
import { Parcela, StatusParcela, Paciente } from '../types';
import { formatarTelefoneWhatsApp } from '../services/whatsappMessages';
import { API_BASE_URL } from '../config/api';
import { gerarCarneHTML, DadosCarne } from '../utils/carneGenerator';
interface Profissional {
  id: string;
  nome: string;
  tipo: string;
  crm?: string;
  uf?: string;
}
interface DadosContratoPaciente {
  tipoCobranca?: string;
  valorMensalidade?: string | number;
  diaVencimentoMensalidade?: string | number;
  formaPagamentoPadrao?: string;
  profissionalFinanceiroId?: string;
  contratoObservacoes?: string;
}
interface FinanceiroManagerProps {
  clinicaId: string;
  pacienteId: string;
  paciente: Paciente;
  dadosContrato?: DadosContratoPaciente;
  abrirNovoContrato?: boolean;
  onNovoContratoAberto?: () => void;
}
export function FinanceiroManager({
  clinicaId,
  pacienteId,
  paciente,
  dadosContrato,
  abrirNovoContrato,
  onNovoContratoAberto
}: FinanceiroManagerProps) {
  const {
    parcelas,
    loading,
    resumo,
    gerarContrato,
    atualizarParcela,
    deletarParcela,
    deletarTodasParcelas,
    marcarComoPago,
    quitarContrato
  } = useFinanceiro(clinicaId, pacienteId);
  const {
    success,
    error: showError
  } = useToast();
  // ⭐ Seleção de parcelas para impressão de carnê
  const [selectedParcelas, setSelectedParcelas] = useState<Set<string>>(new Set());
  // ⭐ Profissionais
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregandoProfissionais, setCarregandoProfissionais] = useState(false);
  const profissionaisCarregadosRef = useRef(false);
  // ⭐ Ref para scroll automático ao mês atual
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrolledToCurrentMonthRef = useRef(false);
  // ⭐ Parcelas ordenadas em modo descendente (mais recentes primeiro)
  const parcelasOrdenadas = [...parcelas].sort((a, b) => {
    const dateA = new Date(a.dataVencimento + 'T12:00:00').getTime();
    const dateB = new Date(b.dataVencimento + 'T12:00:00').getTime();
    return dateB - dateA; // Descendente
  });
  // Carrega profissionais da API
  useEffect(() => {
    if (profissionaisCarregadosRef.current) return;
    profissionaisCarregadosRef.current = true;
    const sessao = localStorage.getItem('sessao');
    if (!sessao) return;
    const parsed = JSON.parse(sessao);
    const operadoraId = parsed.clinicaAtual?.operadoraId || parsed.operadoraSelecionada?.id || '';
    if (!operadoraId) return;
    setCarregandoProfissionais(true);
    fetch(`${API_BASE_URL}/api/usuarios?operadoraId=${operadoraId}`).then((res) => res.ok ? res.json() : []).then((data) => {
      const profs = (Array.isArray(data) ? data : []).filter((u: any) => (u.tipo === 'medico' || u.tipo === 'dentista') && u.ativo !== false).map((u: any) => ({
        id: u.id,
        nome: u.nome,
        tipo: u.tipo,
        crm: u.crm,
        uf: u.uf
      }));
      setProfissionais(profs);
    }).catch((err) => {
      console.error('❌ [FinanceiroManager] Erro ao carregar profissionais:', err);
    }).finally(() => setCarregandoProfissionais(false));
  }, []);
  // ⭐ Auto-scroll para a parcela do mês atual ao carregar
  useEffect(() => {
    if (parcelas.length === 0 || scrolledToCurrentMonthRef.current) return;
    scrolledToCurrentMonthRef.current = true;
    // Aguarda renderização da tabela
    setTimeout(() => {
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const currentMonthRow = tableContainerRef.current?.querySelector(`[data-month="${currentYearMonth}"]`) as HTMLElement | null;
      if (currentMonthRow) {
        currentMonthRow.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        // Destaque visual temporário
        currentMonthRow.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1');
        setTimeout(() => {
          currentMonthRow.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1');
        }, 3000);
      }
    }, 300);
  }, [parcelas]);
  // Reset scroll ref quando paciente muda
  useEffect(() => {
    scrolledToCurrentMonthRef.current = false;
  }, [pacienteId]);
  // Estados dos modais
  const [isNovoContratoOpen, setIsNovoContratoOpen] = useState(false);
  const [isPagamentoOpen, setIsPagamentoOpen] = useState(false);
  const [isQuitacaoOpen, setIsQuitacaoOpen] = useState(false);
  const [isWhatsappSuccessOpen, setIsWhatsappSuccessOpen] = useState(false);
  const [whatsappSuccessData, setWhatsappSuccessData] = useState<{
    paciente: string;
    parcela: number;
    tipo: 'cobranca' | 'dialogo';
  } | null>(null);
  // Estados de confirmação
  const [isConfirmExcluirContratoOpen, setIsConfirmExcluirContratoOpen] = useState(false);
  const [isConfirmExcluirParcelaOpen, setIsConfirmExcluirParcelaOpen] = useState(false);
  const [isConfirmCancelarParcelaOpen, setIsConfirmCancelarParcelaOpen] = useState(false);
  const [parcelaParaAcao, setParcelaParaAcao] = useState<Parcela | null>(null);
  // Modal de seleção de tipo de cobrança
  const [isSelectTipoCobrancaOpen, setIsSelectTipoCobrancaOpen] = useState(false);
  const [parcelaParaCobranca, setParcelaParaCobranca] = useState<Parcela | null>(null);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<Parcela | null>(null);
  const [sendingWhatsapp, setSendingWhatsapp] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Estado para novo contrato
  const [novoContrato, setNovoContrato] = useState({
    tipoContrato: 'parcelamento' as 'parcelamento' | 'mensalidade',
    valorTotal: '',
    numeroParcelas: '1',
    diaVencimento: '10',
    formaPagamento: 'boleto',
    profissionalId: '',
    observacoes: '',
    // Campos de mensalidade
    valorMensal: '',
    geracaoMensalidade: 'manual' as 'manual' | 'automatica',
    numMeses: '12'
  });
  // ⭐ Estado para modal de boleto
  const [isBoletoOpen, setIsBoletoOpen] = useState(false);
  const [parcelaParaBoleto, setParcelaParaBoleto] = useState<Parcela | null>(null);
  // ⭐ Estado para modal de edição de parcela
  const [isEditParcelaOpen, setIsEditParcelaOpen] = useState(false);
  const [parcelaParaEditar, setParcelaParaEditar] = useState<Parcela | null>(null);
  const [editParcelaData, setEditParcelaData] = useState({
    valorParcela: '',
    dataVencimento: '',
    formaPagamento: '',
    observacoes: ''
  });
  // ⭐ Abre modal automaticamente quando prop abrirNovoContrato muda para true
  useEffect(() => {
    if (abrirNovoContrato && !isNovoContratoOpen) {
      // Pré-preenche com dados do contrato do paciente
      if (dadosContrato) {
        const tipo = dadosContrato.tipoCobranca === 'mensalidade' ? 'mensalidade' : 'parcelamento';
        setNovoContrato((prev) => ({
          ...prev,
          tipoContrato: tipo as 'parcelamento' | 'mensalidade',
          valorMensal: tipo === 'mensalidade' ? String(dadosContrato.valorMensalidade || '') : prev.valorMensal,
          valorTotal: tipo === 'parcelamento' ? String(dadosContrato.valorMensalidade || '') : prev.valorTotal,
          diaVencimento: String(dadosContrato.diaVencimentoMensalidade || '10'),
          formaPagamento: dadosContrato.formaPagamentoPadrao || 'boleto',
          profissionalId: dadosContrato.profissionalFinanceiroId || '',
          observacoes: dadosContrato.contratoObservacoes || ''
        }));
      }
      setIsNovoContratoOpen(true);
      onNovoContratoAberto?.();
    }
  }, [abrirNovoContrato]);
  // Estado para pagamento
  const [dadosPagamento, setDadosPagamento] = useState({
    dataPagamento: new Date().toISOString().split('T')[0],
    formaPagamento: 'pix'
  });
  // Estado para quitação
  const [dadosQuitacao, setDadosQuitacao] = useState({
    dataPagamento: new Date().toISOString().split('T')[0],
    formaPagamento: 'pix'
  });
  // ⭐ Abre modal de edição de parcela
  const abrirEditarParcela = (parcela: Parcela) => {
    setParcelaParaEditar(parcela);
    setEditParcelaData({
      valorParcela: parcela.valorParcela.toString(),
      dataVencimento: parcela.dataVencimento,
      formaPagamento: parcela.formaPagamento || '',
      observacoes: parcela.observacoes || ''
    });
    setIsEditParcelaOpen(true);
  };
  // ⭐ Salva edição da parcela
  const handleSalvarEdicaoParcela = async () => {
    if (!parcelaParaEditar) return;
    try {
      const valor = parseFloat(editParcelaData.valorParcela);
      if (isNaN(valor) || valor <= 0) {
        showError('Valor Inválido', 'Informe um valor válido.');
        return;
      }
      await atualizarParcela(parcelaParaEditar.id, {
        valorParcela: valor,
        dataVencimento: editParcelaData.dataVencimento,
        formaPagamento: editParcelaData.formaPagamento || undefined,
        observacoes: editParcelaData.observacoes || undefined
      });
      success('Parcela Atualizada', 'Os dados da parcela foram atualizados com sucesso.');
      setIsEditParcelaOpen(false);
      setParcelaParaEditar(null);
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleGerarContrato = async () => {
    try {
      const diaVenc = parseInt(novoContrato.diaVencimento);
      let valorFinal: number;
      let numParcelas: number;
      if (novoContrato.tipoContrato === 'mensalidade') {
        const valorMensal = parseFloat(novoContrato.valorMensal);
        if (isNaN(valorMensal) || valorMensal <= 0) {
          showError('Valor Inválido', 'Informe um valor mensal válido.');
          return;
        }
        numParcelas = novoContrato.geracaoMensalidade === 'automatica' ? 12 : parseInt(novoContrato.numMeses);
        if (isNaN(numParcelas) || numParcelas < 1) {
          showError('Meses Inválido', 'Informe um número de meses válido.');
          return;
        }
        // Cada parcela terá exatamente o valor mensal
        valorFinal = valorMensal * numParcelas;
      } else {
        valorFinal = parseFloat(novoContrato.valorTotal);
        numParcelas = parseInt(novoContrato.numeroParcelas);
        if (isNaN(valorFinal) || valorFinal <= 0) {
          showError('Valor Inválido', 'Informe um valor total válido.');
          return;
        }
      }
      if (isNaN(numParcelas) || numParcelas < 1) {
        showError('Parcelas Inválido', 'Informe um número de parcelas válido.');
        return;
      }
      const obsPrefix = novoContrato.tipoContrato === 'mensalidade' ? `Mensalidade ${formatarMoeda(valorFinal / numParcelas)}/mês` : '';
      const obsFinal = [obsPrefix, novoContrato.observacoes].filter(Boolean).join(' • ');
      await gerarContrato({
        valorTotal: valorFinal,
        numeroParcelas: numParcelas,
        diaVencimento: diaVenc,
        formaPagamento: novoContrato.formaPagamento,
        profissionalId: novoContrato.profissionalId || undefined,
        observacoes: obsFinal || undefined
      });
      const msgTipo = novoContrato.tipoContrato === 'mensalidade' ? `${numParcelas} mensalidades de ${formatarMoeda(valorFinal / numParcelas)}` : `${numParcelas} parcelas geradas com sucesso!`;
      success('Contrato Gerado', msgTipo);
      setIsNovoContratoOpen(false);
      setNovoContrato({
        tipoContrato: 'parcelamento',
        valorTotal: '',
        numeroParcelas: '1',
        diaVencimento: '10',
        formaPagamento: 'boleto',
        profissionalId: '',
        observacoes: '',
        valorMensal: '',
        geracaoMensalidade: 'manual',
        numMeses: '12'
      });
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleConfirmarPagamento = async () => {
    if (!parcelaSelecionada) return;
    try {
      await marcarComoPago(parcelaSelecionada.id, dadosPagamento.dataPagamento, dadosPagamento.formaPagamento);
      success('Pagamento Registrado', 'Parcela marcada como paga com sucesso!');
      setIsPagamentoOpen(false);
      setParcelaSelecionada(null);
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const handleQuitarContrato = async () => {
    try {
      await quitarContrato(dadosQuitacao.dataPagamento, dadosQuitacao.formaPagamento);
      success('Contrato Quitado', 'Todas as parcelas foram marcadas como pagas!');
      setIsQuitacaoOpen(false);
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const abrirConfirmExcluirContrato = () => {
    setIsConfirmExcluirContratoOpen(true);
  };
  const confirmarExcluirContrato = async () => {
    setIsDeleting(true);
    try {
      await deletarTodasParcelas();
      success('Contrato Excluído', 'Todas as parcelas foram removidas com sucesso.');
      setIsConfirmExcluirContratoOpen(false);
    } catch (err: any) {
      showError('Erro', err.message);
    } finally {
      setIsDeleting(false);
    }
  };
  const abrirConfirmCancelarParcela = (parcela: Parcela) => {
    setParcelaParaAcao(parcela);
    setIsConfirmCancelarParcelaOpen(true);
  };
  const confirmarCancelarParcela = async () => {
    if (!parcelaParaAcao) return;
    setIsDeleting(true);
    try {
      await atualizarParcela(parcelaParaAcao.id, {
        status: 'cancelado'
      });
      success('Parcela Cancelada', 'O status foi atualizado para cancelado.');
      setIsConfirmCancelarParcelaOpen(false);
      setParcelaParaAcao(null);
    } catch (err: any) {
      showError('Erro', err.message);
    } finally {
      setIsDeleting(false);
    }
  };
  const abrirConfirmExcluirParcela = (parcela: Parcela) => {
    setParcelaParaAcao(parcela);
    setIsConfirmExcluirParcelaOpen(true);
  };
  const confirmarExcluirParcela = async () => {
    if (!parcelaParaAcao) return;
    setIsDeleting(true);
    try {
      await deletarParcela(parcelaParaAcao.id);
      success('Parcela Excluída', 'Registro removido com sucesso.');
      setIsConfirmExcluirParcelaOpen(false);
      setParcelaParaAcao(null);
    } catch (err: any) {
      showError('Erro', err.message);
    } finally {
      setIsDeleting(false);
    }
  };
  // Abre modal para selecionar tipo de cobrança
  const abrirSelecionarTipoCobranca = (parcela: Parcela) => {
    setParcelaParaCobranca(parcela);
    setIsSelectTipoCobrancaOpen(true);
  };
  // Envia cobrança simples (sem diálogo)
  const handleEnviarCobrancaSimples = async (parcela: Parcela) => {
    setIsSelectTipoCobrancaOpen(false);
    if (!paciente.telefone) {
      showError('Erro', 'Paciente não possui telefone cadastrado.');
      return;
    }
    setSendingWhatsapp(parcela.id);
    try {
      const configUrl = `${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`;
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error('WhatsApp não configurado para esta clínica.');
      }
      const config = await response.json();
      if (!config.serverUrl || !config.sessionName) {
        throw new Error('WhatsApp não configurado corretamente.');
      }
      // ⭐ FIX: formatarTelefoneWhatsApp retorna objeto {numero}, extrair .numero
      const telefone = formatarTelefoneWhatsApp(paciente.telefone).numero;
      const dataVenc = new Date(parcela.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
      const valor = parcela.valorParcela.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
      const pixCode = `00020126580014BR.GOV.BCB.PIX0136${Date.now().toString(36)}520400005303986540${parcela.valorParcela.toFixed(2).replace('.', '')}5802BR5913CLINICA MEDICA6008SAO PAULO62070503***6304`;
      const mensagem = `Olá ${paciente.nome}! 👋

📋 *Lembrete de Pagamento*

Parcela *${parcela.numeroParcela}* no valor de *${valor}*

📅 Vencimento: *${dataVenc}*

💰 *Para pagar via PIX, copie o código abaixo:*

\`\`\`
${pixCode}
\`\`\`

Caso já tenha efetuado o pagamento, desconsidere esta mensagem.

Atenciosamente,
Clínica`;
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
          pacienteId,
          pacienteNome: paciente.nome
        })
      });
      if (!sendResponse.ok) {
        const responseData = await sendResponse.json().catch(() => null);
        throw new Error(responseData?.error || 'Falha ao enviar mensagem.');
      }
      setWhatsappSuccessData({
        paciente: paciente.nome,
        parcela: parcela.numeroParcela,
        tipo: 'cobranca'
      });
      setIsWhatsappSuccessOpen(true);
    } catch (err: any) {
      showError('Erro ao Enviar', err.message);
    } finally {
      setSendingWhatsapp(null);
    }
  };
  // Envia cobrança com diálogo interativo (paciente escolhe forma de pagamento)
  const handleEnviarCobrancaDialogo = async (parcela: Parcela) => {
    setIsSelectTipoCobrancaOpen(false);
    if (!paciente.telefone) {
      showError('Erro', 'Paciente não possui telefone cadastrado.');
      return;
    }
    setSendingWhatsapp(parcela.id);
    try {
      const configUrl = `${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`;
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error('WhatsApp não configurado para esta clínica.');
      }
      const config = await response.json();
      if (!config.serverUrl || !config.sessionName) {
        throw new Error('WhatsApp não configurado corretamente.');
      }
      // ⭐ FIX: formatarTelefoneWhatsApp retorna objeto {numero}, extrair .numero
      const telefone = formatarTelefoneWhatsApp(paciente.telefone).numero;
      const dataVenc = new Date(parcela.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
      const valor = parcela.valorParcela.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
      // Mensagem interativa com opções de pagamento
      const mensagem = `Olá ${paciente.nome}! 👋

📋 *Cobrança - Parcela ${parcela.numeroParcela}*

💰 Valor: *${valor}*
📅 Vencimento: *${dataVenc}*

━━━━━━━━━━━━━━━━━━━━━

*Como você prefere pagar?*

*1️⃣* - PIX (código na hora)
*2️⃣* - Boleto Bancário
*3️⃣* - Cartão de Crédito
*4️⃣* - Dinheiro (presencial)
*5️⃣* - Já paguei esta parcela

━━━━━━━━━━━━━━━━━━━━━

✏️ *Responda com o número* da opção desejada.

Aguardamos seu retorno! 😊`;
      // Primeiro, registra a cobrança pendente no servidor
      await fetch(`${API_BASE_URL}/api/cobrancas/iniciar-dialogo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          pacienteId,
          parcelaId: parcela.id,
          telefone,
          valor: parcela.valorParcela,
          numeroParcela: parcela.numeroParcela,
          dataVencimento: parcela.dataVencimento
        })
      });
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
          pacienteId,
          pacienteNome: paciente.nome
        })
      });
      if (!sendResponse.ok) {
        const responseData = await sendResponse.json().catch(() => null);
        throw new Error(responseData?.error || 'Falha ao enviar mensagem.');
      }
      setWhatsappSuccessData({
        paciente: paciente.nome,
        parcela: parcela.numeroParcela,
        tipo: 'dialogo'
      });
      setIsWhatsappSuccessOpen(true);
    } catch (err: any) {
      showError('Erro ao Enviar', err.message);
    } finally {
      setSendingWhatsapp(null);
    }
  };
  const getStatusBadge = (status: StatusParcela) => {
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
  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };
  const formatarData = (data: string) => {
    if (!data) return '-';
    const dataObj = data.includes('T') ? new Date(data) : new Date(`${data}T12:00:00`);
    return dataObj.toLocaleDateString('pt-BR');
  };
  const formatarDataHora = (data: string) => {
    if (!data) return '-';
    const dataObj = new Date(data);
    return dataObj.toLocaleDateString('pt-BR') + ' ' + dataObj.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  // ⭐ Toggle seleção de parcela
  const toggleParcelaSelecionada = (id: string) => {
    setSelectedParcelas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  // ⭐ Selecionar/deselecionar todas
  const toggleSelectAll = () => {
    if (selectedParcelas.size === parcelasOrdenadas.length) {
      setSelectedParcelas(new Set());
    } else {
      setSelectedParcelas(new Set(parcelasOrdenadas.map((p) => p.id)));
    }
  };
  // ⭐ Imprimir Carnê - 3 boletos bancários por página A4
  const handlePrintCarne = async () => {
    const selecionadas = parcelasOrdenadas.filter((p) => selectedParcelas.has(p.id)).sort((a, b) => a.numeroParcela - b.numeroParcela);
    if (selecionadas.length === 0) return;
    // Carrega config bancária
    let bancoConfig: any = null;
    try {
      const resp = await fetch(API_BASE_URL + '/api/configuracoes-banco?clinicaId=' + clinicaId);
      if (resp.ok) {
        const configs = await resp.json();
        const lista = Array.isArray(configs) ? configs : configs.data || [];
        bancoConfig = lista.find((c: any) => c.ativo) || lista[0] || null;
      }
    } catch (e) {
      console.warn('Nao foi possivel carregar config bancaria para carne:', e);
    }
    const pac = paciente as any;
    const dadosCarne: DadosCarne = {
      parcelas: selecionadas,
      totalParcelas: parcelas.length,
      sacado: {
        nome: paciente.nome || 'Paciente',
        cpf: pac.cpf || '',
        endereco: pac.endereco || '',
        cidade: pac.cidade || '',
        uf: pac.uf || ''
      },
      cedente: {
        nome: bancoConfig?.nomeCedente || 'Clinica',
        cnpj: bancoConfig?.cnpjCedente || '',
        endereco: bancoConfig?.enderecoCedente || '',
        cidade: bancoConfig?.cidadeCedente || '',
        uf: bancoConfig?.ufCedente || ''
      },
      banco: bancoConfig ? {
        nome: bancoConfig.bancoNome || bancoConfig.banco || '',
        codigo: bancoConfig.banco || '',
        agencia: (bancoConfig.agencia || '') + (bancoConfig.agenciaDigito ? '-' + bancoConfig.agenciaDigito : ''),
        conta: (bancoConfig.conta || '') + (bancoConfig.contaDigito ? '-' + bancoConfig.contaDigito : ''),
        carteira: bancoConfig.carteira || '',
        convenio: bancoConfig.convenio || '',
        codigoCedente: bancoConfig.codigoCedente || ''
      } : undefined,
      instrucoes: bancoConfig ? [bancoConfig.instrucao1, bancoConfig.instrucao2, bancoConfig.instrucao3].filter(Boolean) : undefined
    };
    const htmlDoc = gerarCarneHTML(dadosCarne);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showError('Erro', 'Nao foi possivel abrir a janela de impressao. Verifique se popups estao habilitados.');
      return;
    }
    printWindow.document.write(htmlDoc);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };
  const parcelasPendentes = parcelas.filter((p) => p.status !== 'pago' && p.status !== 'cancelado');
  const valorTotalPendente = parcelasPendentes.reduce((acc, p) => acc + p.valorParcela, 0);
  const getRowClassName = (parcela: Parcela) => {
    switch (parcela.status) {
      case 'pago':
        return 'bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-500';
      case 'pendente':
        return 'bg-green-50 hover:bg-green-100 border-l-4 border-l-green-500';
      case 'vencido':
        return 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500';
      case 'cancelado':
        return 'bg-gray-100 hover:bg-gray-200 border-l-4 border-l-gray-400 opacity-60';
      default:
        return 'hover:bg-gray-50';
    }
  };
  return <div className="space-y-6">
      {/* Resumo Financeiro */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-l-4 border-blue-500">
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Geral</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">
                  {formatarMoeda(resumo.total)}
                </h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <DollarSignIcon className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white border-l-4 border-green-500">
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 font-medium">Recebido</p>
                <h3 className="text-2xl font-bold text-green-600 mt-1">
                  {formatarMoeda(resumo.pago)}
                </h3>
              </div>
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white border-l-4 border-yellow-500">
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 font-medium">Pendente</p>
                <h3 className="text-2xl font-bold text-yellow-600 mt-1">
                  {formatarMoeda(resumo.pendente)}
                </h3>
              </div>
              <div className="p-2 bg-yellow-50 rounded-lg">
                <CalendarIcon className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white border-l-4 border-red-500">
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 font-medium">Vencido</p>
                <h3 className="text-2xl font-bold text-red-600 mt-1">
                  {formatarMoeda(resumo.vencido)}
                </h3>
              </div>
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertCircleIcon className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Ações e Lista */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-900">
          Parcelas e Cobranças
        </h3>
        <div className="flex flex-wrap gap-2">
          {parcelas.length > 0 && <>
              {selectedParcelas.size > 0 && <Button variant="outline" onClick={handlePrintCarne} className="text-blue-600 border-blue-600 hover:bg-blue-50">
              
                  <PrinterIcon className="w-4 h-4 mr-2" />
                  Imprimir Carnê ({selectedParcelas.size})
                </Button>}
              {parcelasPendentes.length > 0 && <Button variant="outline" onClick={() => setIsQuitacaoOpen(true)} className="text-green-600 border-green-600 hover:bg-green-50">
              
                  <CheckIcon className="w-4 h-4 mr-2" />
                  Quitar Contrato
                </Button>}
              <Button variant="outline" onClick={abrirConfirmExcluirContrato} className="text-red-600 border-red-600 hover:bg-red-50">
              
                <Trash2Icon className="w-4 h-4 mr-2" />
                Excluir Contrato
              </Button>
            </>}
          <Button onClick={() => setIsNovoContratoOpen(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Novo Contrato
          </Button>
        </div>
      </div>

      {loading ? <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-500 mt-2">Carregando financeiro...</p>
        </div> : parcelas.length === 0 ? <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FileTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            Nenhuma parcela encontrada
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Clique em "Novo Contrato" para gerar cobranças.
          </p>
        </div> : <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto" ref={tableContainerRef}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-center w-10">
                    <input type="checkbox" checked={parcelasOrdenadas.length > 0 && selectedParcelas.size === parcelasOrdenadas.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" title="Selecionar todas" />
                  
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parcela
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Emissão
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vencimento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pagamento
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {parcelasOrdenadas.map((parcela) => {
              const vencDate = new Date(parcela.dataVencimento + 'T12:00:00');
              const yearMonth = `${vencDate.getFullYear()}-${String(vencDate.getMonth() + 1).padStart(2, '0')}`;
              return <tr key={parcela.id} className={getRowClassName(parcela)} data-month={yearMonth}>
                    
                      <td className="px-3 py-4 text-center">
                        <input type="checkbox" checked={selectedParcelas.has(parcela.id)} onChange={() => toggleParcelaSelecionada(parcela.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                      
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          {parcela.status === 'pago' && <CheckCircleIcon className="w-4 h-4 text-blue-600" />}
                          {parcela.status === 'pendente' && <CalendarIcon className="w-4 h-4 text-green-600" />}
                          {parcela.status === 'vencido' && <AlertCircleIcon className="w-4 h-4 text-red-600" />}
                          {parcela.status === 'cancelado' && <XCircleIcon className="w-4 h-4 text-gray-500" />}
                          <span>{parcela.numeroParcela}ª Parcela</span>
                        </div>
                        {parcela.observacoes && <p className="text-xs text-gray-500 font-normal mt-0.5 ml-6">
                            {parcela.observacoes}
                          </p>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatarDataHora(parcela.dataEmissao || parcela.criadoEm)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {formatarData(parcela.dataVencimento)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatarMoeda(parcela.valorParcela)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(parcela.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {parcela.dataPagamento ? <div>
                            <p className="font-medium">
                              {formatarData(parcela.dataPagamento)}
                            </p>
                            <p className="text-xs capitalize text-gray-500">
                              {parcela.formaPagamento}
                            </p>
                          </div> : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-1">
                          {parcela.status !== 'pago' && parcela.status !== 'cancelado' && <>
                                <button onClick={() => {
                        setParcelaSelecionada(parcela);
                        setIsPagamentoOpen(true);
                      }} className="text-green-600 hover:text-green-900 p-1.5 rounded hover:bg-green-100 transition-colors" title="Registrar Pagamento">
                            
                                  <DollarSignIcon className="w-5 h-5" />
                                </button>
                                <button onClick={() => {
                        setParcelaParaBoleto(parcela);
                        setIsBoletoOpen(true);
                      }} className="text-teal-600 hover:text-teal-900 p-1.5 rounded hover:bg-teal-100 transition-colors" title="Emitir Boleto / Cobrança">
                            
                                  <BanknoteIcon className="w-5 h-5" />
                                </button>
                                <button onClick={() => abrirSelecionarTipoCobranca(parcela)} disabled={sendingWhatsapp === parcela.id} className={`text-blue-600 hover:text-blue-900 p-1.5 rounded hover:bg-blue-100 transition-colors ${sendingWhatsapp === parcela.id ? 'opacity-50 cursor-wait' : ''}`} title="Enviar Cobrança WhatsApp">
                            
                                  {sendingWhatsapp === parcela.id ? <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <SendIcon className="w-5 h-5" />}
                                </button>
                                <button onClick={() => abrirEditarParcela(parcela)} className="text-amber-600 hover:text-amber-900 p-1.5 rounded hover:bg-amber-100 transition-colors" title="Editar Parcela">
                            
                                  <PencilIcon className="w-5 h-5" />
                                </button>
                                <button onClick={() => abrirConfirmCancelarParcela(parcela)} className="text-orange-500 hover:text-orange-700 p-1.5 rounded hover:bg-orange-100 transition-colors" title="Cancelar Parcela">
                            
                                  <XCircleIcon className="w-5 h-5" />
                                </button>
                              </>}
                          {(parcela.status === 'pago' || parcela.status === 'cancelado') && <button onClick={() => abrirEditarParcela(parcela)} className="text-amber-600 hover:text-amber-900 p-1.5 rounded hover:bg-amber-100 transition-colors" title="Editar Parcela">
                          
                              <PencilIcon className="w-5 h-5" />
                            </button>}
                          <button onClick={() => abrirConfirmExcluirParcela(parcela)} className="text-red-600 hover:text-red-900 p-1.5 rounded hover:bg-red-100 transition-colors" title="Excluir Parcela">
                          
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>;
            })}
              </tbody>
            </table>
          </div>
        </div>}

      {/* Modal Selecionar Tipo de Cobrança */}
      <Modal isOpen={isSelectTipoCobrancaOpen} onClose={() => setIsSelectTipoCobrancaOpen(false)} title="Enviar Cobrança via WhatsApp">
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <p className="text-gray-500 text-sm">
              Parcela {parcelaParaCobranca?.numeroParcela}
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {parcelaParaCobranca && formatarMoeda(parcelaParaCobranca.valorParcela)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Vencimento:{' '}
              {parcelaParaCobranca && formatarData(parcelaParaCobranca.dataVencimento)}
            </p>
          </div>

          <p className="text-gray-600 text-center">
            Como deseja enviar a cobrança?
          </p>

          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => parcelaParaCobranca && handleEnviarCobrancaDialogo(parcelaParaCobranca)} className="flex items-center gap-4 p-4 border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
              
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <MessageCircleIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-gray-900">
                  Diálogo Interativo
                </p>
                <p className="text-sm text-gray-500">
                  Paciente escolhe a forma de pagamento
                </p>
              </div>
              <Badge variant="success" className="text-xs">
                Recomendado
              </Badge>
            </button>

            <button onClick={() => parcelaParaCobranca && handleEnviarCobrancaSimples(parcelaParaCobranca)} className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-all group">
              
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <QrCodeIcon className="w-6 h-6 text-gray-600" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-gray-900">Cobrança Simples</p>
                <p className="text-sm text-gray-500">
                  Envia apenas o código PIX
                </p>
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => setIsSelectTipoCobrancaOpen(false)}>
              
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Novo Contrato */}
      <Modal isOpen={isNovoContratoOpen} onClose={() => setIsNovoContratoOpen(false)} title="Gerar Novo Contrato Financeiro" footer={<>
            <Button variant="ghost" onClick={() => setIsNovoContratoOpen(false)}>
            
              Cancelar
            </Button>
            <Button onClick={handleGerarContrato}>
              {novoContrato.tipoContrato === 'mensalidade' ? 'Gerar Mensalidades' : 'Gerar Parcelas'}
            </Button>
          </>}>
        
        <div className="space-y-4">
          {/* Seletor de Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Cobrança
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setNovoContrato({
              ...novoContrato,
              tipoContrato: 'parcelamento'
            })} className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${novoContrato.tipoContrato === 'parcelamento' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}>
                
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${novoContrato.tipoContrato === 'parcelamento' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  
                  <HashIcon className={`w-4 h-4 ${novoContrato.tipoContrato === 'parcelamento' ? 'text-blue-600' : 'text-gray-500'}`} />
                  
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${novoContrato.tipoContrato === 'parcelamento' ? 'text-blue-900' : 'text-gray-700'}`}>
                    
                    Parcelamento
                  </p>
                  <p className="text-xs text-gray-500">Valor total dividido</p>
                </div>
              </button>
              <button type="button" onClick={() => setNovoContrato({
              ...novoContrato,
              tipoContrato: 'mensalidade'
            })} className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${novoContrato.tipoContrato === 'mensalidade' ? 'border-green-500 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${novoContrato.tipoContrato === 'mensalidade' ? 'bg-green-100' : 'bg-gray-100'}`}>
                  
                  <RepeatIcon className={`w-4 h-4 ${novoContrato.tipoContrato === 'mensalidade' ? 'text-green-600' : 'text-gray-500'}`} />
                  
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${novoContrato.tipoContrato === 'mensalidade' ? 'text-green-900' : 'text-gray-700'}`}>
                    
                    Mensalidade
                  </p>
                  <p className="text-xs text-gray-500">Valor fixo por mês</p>
                </div>
              </button>
            </div>
          </div>

          {/* Campos de Parcelamento */}
          {novoContrato.tipoContrato === 'parcelamento' && <div className="grid grid-cols-2 gap-4">
              <Input label="Valor Total (R$)" type="number" value={novoContrato.valorTotal} onChange={(e) => setNovoContrato({
            ...novoContrato,
            valorTotal: e.target.value
          })} placeholder="0.00" />
            

              <Input label="Nº de Parcelas" type="number" min="1" max="60" value={novoContrato.numeroParcelas} onChange={(e) => setNovoContrato({
            ...novoContrato,
            numeroParcelas: e.target.value
          })} />
            
            </div>}

          {/* Campos de Mensalidade */}
          {novoContrato.tipoContrato === 'mensalidade' && <>
              <Input label="Valor Mensal (R$)" type="number" value={novoContrato.valorMensal} onChange={(e) => setNovoContrato({
            ...novoContrato,
            valorMensal: e.target.value
          })} placeholder="0.00" />
            

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Geração das Mensalidades
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNovoContrato({
                ...novoContrato,
                geracaoMensalidade: 'manual'
              })} className={`p-3 rounded-lg border-2 text-left transition-all ${novoContrato.geracaoMensalidade === 'manual' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  
                    <p className={`text-sm font-semibold ${novoContrato.geracaoMensalidade === 'manual' ? 'text-green-800' : 'text-gray-700'}`}>
                    
                      Manual
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Definir nº de meses
                    </p>
                  </button>
                  <button type="button" onClick={() => setNovoContrato({
                ...novoContrato,
                geracaoMensalidade: 'automatica',
                numMeses: '12'
              })} className={`p-3 rounded-lg border-2 text-left transition-all ${novoContrato.geracaoMensalidade === 'automatica' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  
                    <p className={`text-sm font-semibold ${novoContrato.geracaoMensalidade === 'automatica' ? 'text-green-800' : 'text-gray-700'}`}>
                    
                      Automática
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      12 meses (1 ano)
                    </p>
                  </button>
                </div>
              </div>
              {novoContrato.geracaoMensalidade === 'manual' && <Input label="Nº de Meses" type="number" min="1" max="60" value={novoContrato.numMeses} onChange={(e) => setNovoContrato({
            ...novoContrato,
            numMeses: e.target.value
          })} placeholder="12" />}
            </>}

          {/* Campos comuns */}
          <div className="grid grid-cols-2 gap-4">
            <Select label="Dia de Vencimento" value={novoContrato.diaVencimento} onChange={(e) => setNovoContrato({
            ...novoContrato,
            diaVencimento: e.target.value
          })} options={Array.from({
            length: 31
          }, (_, i) => ({
            value: (i + 1).toString(),
            label: `Dia ${i + 1}`
          }))} />
            

            <Select label="Forma de Pagamento" value={novoContrato.formaPagamento} onChange={(e) => setNovoContrato({
            ...novoContrato,
            formaPagamento: e.target.value
          })} options={[{
            value: 'boleto',
            label: 'Boleto Bancário'
          }, {
            value: 'pix',
            label: 'PIX'
          }, {
            value: 'cartao',
            label: 'Cartão de Crédito'
          }, {
            value: 'dinheiro',
            label: 'Dinheiro'
          }]} />
            
          </div>
          <Select label="Profissional Responsável" value={novoContrato.profissionalId} onChange={(e) => setNovoContrato({
          ...novoContrato,
          profissionalId: e.target.value
        })} options={[{
          value: '',
          label: carregandoProfissionais ? 'Carregando...' : 'Selecione o profissional (opcional)'
        }, ...profissionais.map((p) => ({
          value: p.id,
          label: `${p.nome}${p.crm ? ` (CRM: ${p.crm}${p.uf ? '/' + p.uf : ''})` : ''} - ${p.tipo === 'medico' ? 'Médico' : 'Dentista'}`
        }))]} />
          

          <Input label="Observações" value={novoContrato.observacoes} onChange={(e) => setNovoContrato({
          ...novoContrato,
          observacoes: e.target.value
        })} placeholder={novoContrato.tipoContrato === 'mensalidade' ? 'Ex: Plano mensal de acompanhamento' : 'Ex: Tratamento ortodôntico completo'} />
          

          {/* Resumo */}
          <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${novoContrato.tipoContrato === 'mensalidade' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'}`}>
            
            {novoContrato.tipoContrato === 'mensalidade' ? <RepeatIcon className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <CreditCardIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <div>
              <p className="font-medium">Resumo da Simulação:</p>
              {novoContrato.tipoContrato === 'mensalidade' ? novoContrato.valorMensal ? <p>
                    {novoContrato.geracaoMensalidade === 'automatica' ? '12' : novoContrato.numMeses || '0'}{' '}
                    meses de{' '}
                    {formatarMoeda(parseFloat(novoContrato.valorMensal) || 0)}
                    /mês = Total{' '}
                    {formatarMoeda((parseFloat(novoContrato.valorMensal) || 0) * (novoContrato.geracaoMensalidade === 'automatica' ? 12 : parseInt(novoContrato.numMeses) || 0))}
                  </p> : <p>Preencha o valor mensal para simular</p> : novoContrato.valorTotal && novoContrato.numeroParcelas ? <p>
                  {novoContrato.numeroParcelas}x de{' '}
                  {formatarMoeda(parseFloat(novoContrato.valorTotal) / parseInt(novoContrato.numeroParcelas))}
                </p> : <p>Preencha os valores para simular</p>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Registrar Pagamento */}
      <Modal isOpen={isPagamentoOpen} onClose={() => setIsPagamentoOpen(false)} title={`Registrar Pagamento - Parcela ${parcelaSelecionada?.numeroParcela}`} footer={<>
            <Button variant="ghost" onClick={() => setIsPagamentoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarPagamento} className="bg-green-600 hover:bg-green-700">
            
              Confirmar Pagamento
            </Button>
          </>}>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg text-center mb-4">
            <p className="text-gray-500 text-sm">Valor a Pagar</p>
            <p className="text-3xl font-bold text-gray-900">
              {parcelaSelecionada && formatarMoeda(parcelaSelecionada.valorParcela)}
            </p>
          </div>
          <Input label="Data do Pagamento" type="date" value={dadosPagamento.dataPagamento} onChange={(e) => setDadosPagamento({
          ...dadosPagamento,
          dataPagamento: e.target.value
        })} />
          

          <Select label="Forma de Pagamento" value={dadosPagamento.formaPagamento} onChange={(e) => setDadosPagamento({
          ...dadosPagamento,
          formaPagamento: e.target.value
        })} options={[{
          value: 'pix',
          label: 'PIX'
        }, {
          value: 'dinheiro',
          label: 'Dinheiro'
        }, {
          value: 'cartao',
          label: 'Cartão de Crédito/Débito'
        }, {
          value: 'boleto',
          label: 'Boleto Bancário'
        }]} />
          
        </div>
      </Modal>

      {/* Modal Quitar Contrato */}
      <Modal isOpen={isQuitacaoOpen} onClose={() => setIsQuitacaoOpen(false)} title="Quitar Contrato" footer={<>
            <Button variant="ghost" onClick={() => setIsQuitacaoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleQuitarContrato} className="bg-green-600 hover:bg-green-700">
            
              Confirmar Quitação
            </Button>
          </>}>
        
        <div className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg text-center mb-4">
            <p className="text-green-700 text-sm font-medium">
              {parcelasPendentes.length} parcela(s) pendente(s)
            </p>
            <p className="text-3xl font-bold text-green-700 mt-1">
              {formatarMoeda(valorTotalPendente)}
            </p>
            <p className="text-green-600 text-xs mt-2">
              Todas as parcelas pendentes serão marcadas como pagas
            </p>
          </div>
          <Input label="Data do Pagamento" type="date" value={dadosQuitacao.dataPagamento} onChange={(e) => setDadosQuitacao({
          ...dadosQuitacao,
          dataPagamento: e.target.value
        })} />
          

          <Select label="Forma de Pagamento" value={dadosQuitacao.formaPagamento} onChange={(e) => setDadosQuitacao({
          ...dadosQuitacao,
          formaPagamento: e.target.value
        })} options={[{
          value: 'pix',
          label: 'PIX'
        }, {
          value: 'dinheiro',
          label: 'Dinheiro'
        }, {
          value: 'cartao',
          label: 'Cartão de Crédito/Débito'
        }, {
          value: 'boleto',
          label: 'Boleto Bancário'
        }]} />
          
        </div>
      </Modal>

      {/* Modal Sucesso WhatsApp */}
      <Modal isOpen={isWhatsappSuccessOpen} onClose={() => setIsWhatsappSuccessOpen(false)} title="Cobrança Enviada!">
        
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircleIcon className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Mensagem enviada com sucesso!
          </h3>
          <p className="text-gray-600 mb-2">
            A cobrança da{' '}
            <strong>Parcela {whatsappSuccessData?.parcela}</strong> foi enviada
            para <strong>{whatsappSuccessData?.paciente}</strong>.
          </p>
          {whatsappSuccessData?.tipo === 'dialogo' && <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700 mt-4">
              <p className="font-medium">💬 Diálogo Interativo Ativado</p>
              <p className="mt-1">
                O paciente receberá opções para escolher a forma de pagamento
                preferida.
              </p>
            </div>}
          <Button onClick={() => setIsWhatsappSuccessOpen(false)} className="bg-green-600 hover:bg-green-700 mt-4">
            
            <CheckIcon className="w-4 h-4 mr-2" />
            Entendido
          </Button>
        </div>
      </Modal>

      {/* Modal Confirmar Excluir Contrato */}
      <Modal isOpen={isConfirmExcluirContratoOpen} onClose={() => setIsConfirmExcluirContratoOpen(false)} title="Excluir Todo o Contrato" footer={<>
            <Button variant="ghost" onClick={() => setIsConfirmExcluirContratoOpen(false)} disabled={isDeleting}>
            
              Cancelar
            </Button>
            <Button onClick={confirmarExcluirContrato} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
            
              {isDeleting ? <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Excluindo...
                </> : <>
                  <Trash2Icon className="w-4 h-4 mr-2" />
                  Sim, Excluir Tudo
                </>}
            </Button>
          </>}>
        
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangleIcon className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-gray-700 mb-2">
            Deseja realmente{' '}
            <strong>EXCLUIR todas as {parcelas.length} parcelas</strong> deste
            contrato?
          </p>
          <p className="text-red-600 text-sm font-medium">
            Esta ação não pode ser desfeita!
          </p>
        </div>
      </Modal>

      {/* Modal Confirmar Excluir Parcela */}
      <Modal isOpen={isConfirmExcluirParcelaOpen} onClose={() => setIsConfirmExcluirParcelaOpen(false)} title="Excluir Parcela" footer={<>
            <Button variant="ghost" onClick={() => setIsConfirmExcluirParcelaOpen(false)} disabled={isDeleting}>
            
              Cancelar
            </Button>
            <Button onClick={confirmarExcluirParcela} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
            
              {isDeleting ? <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Excluindo...
                </> : <>
                  <TrashIcon className="w-4 h-4 mr-2" />
                  Sim, Excluir
                </>}
            </Button>
          </>}>
        
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrashIcon className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-gray-700 mb-2">
            Deseja excluir a{' '}
            <strong>Parcela {parcelaParaAcao?.numeroParcela}</strong> de{' '}
            <strong>
              {parcelaParaAcao && formatarMoeda(parcelaParaAcao.valorParcela)}
            </strong>
            ?
          </p>
          <p className="text-red-600 text-sm font-medium">
            Esta ação não pode ser desfeita!
          </p>
        </div>
      </Modal>

      {/* Modal Confirmar Cancelar Parcela */}
      <Modal isOpen={isConfirmCancelarParcelaOpen} onClose={() => setIsConfirmCancelarParcelaOpen(false)} title="Cancelar Parcela" footer={<>
            <Button variant="ghost" onClick={() => setIsConfirmCancelarParcelaOpen(false)} disabled={isDeleting}>
            
              Voltar
            </Button>
            <Button onClick={confirmarCancelarParcela} className="bg-orange-500 hover:bg-orange-600" disabled={isDeleting}>
            
              {isDeleting ? <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Cancelando...
                </> : <>
                  <XCircleIcon className="w-4 h-4 mr-2" />
                  Sim, Cancelar Parcela
                </>}
            </Button>
          </>}>
        
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircleIcon className="w-8 h-8 text-orange-600" />
          </div>
          <p className="text-gray-700 mb-2">
            Deseja cancelar a{' '}
            <strong>Parcela {parcelaParaAcao?.numeroParcela}</strong> de{' '}
            <strong>
              {parcelaParaAcao && formatarMoeda(parcelaParaAcao.valorParcela)}
            </strong>
            ?
          </p>
          <p className="text-orange-600 text-sm">
            A parcela será marcada como cancelada e não aparecerá mais nos
            valores pendentes.
          </p>
        </div>
      </Modal>

      {/* ⭐ Modal Emitir Boleto */}
      <BoletoModal isOpen={isBoletoOpen} onClose={() => {
      setIsBoletoOpen(false);
      setParcelaParaBoleto(null);
    }} clinicaId={clinicaId} onSave={async (dados) => {
      console.log('Boleto emitido:', dados);
    }} boletoExistente={parcelaParaBoleto} />
      

      {/* ⭐ Modal Editar Parcela */}
      <Modal isOpen={isEditParcelaOpen} onClose={() => {
      setIsEditParcelaOpen(false);
      setParcelaParaEditar(null);
    }} title={`Editar Parcela ${parcelaParaEditar?.numeroParcela || ''}`} footer={<>
            <Button variant="ghost" onClick={() => {
        setIsEditParcelaOpen(false);
        setParcelaParaEditar(null);
      }}>
            
              Cancelar
            </Button>
            <Button onClick={handleSalvarEdicaoParcela}>
              Salvar Alterações
            </Button>
          </>}>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg text-center mb-4">
            <p className="text-gray-500 text-sm">
              Parcela {parcelaParaEditar?.numeroParcela}
            </p>
            <p className="text-lg font-bold text-gray-900">
              {parcelaParaEditar && getStatusBadge(parcelaParaEditar.status)}
            </p>
          </div>
          <Input label="Valor da Parcela (R$)" type="number" step="0.01" min="0" value={editParcelaData.valorParcela} onChange={(e) => setEditParcelaData({
          ...editParcelaData,
          valorParcela: e.target.value
        })} placeholder="0.00" />
          

          <Input label="Data de Vencimento" type="date" value={editParcelaData.dataVencimento} onChange={(e) => setEditParcelaData({
          ...editParcelaData,
          dataVencimento: e.target.value
        })} />
          

          <Select label="Forma de Pagamento" value={editParcelaData.formaPagamento} onChange={(e) => setEditParcelaData({
          ...editParcelaData,
          formaPagamento: e.target.value
        })} options={[{
          value: '',
          label: 'Não definida'
        }, {
          value: 'pix',
          label: 'PIX'
        }, {
          value: 'boleto',
          label: 'Boleto Bancário'
        }, {
          value: 'cartao',
          label: 'Cartão de Crédito/Débito'
        }, {
          value: 'dinheiro',
          label: 'Dinheiro'
        }]} />
          

          <Input label="Observações" value={editParcelaData.observacoes} onChange={(e) => setEditParcelaData({
          ...editParcelaData,
          observacoes: e.target.value
        })} placeholder="Observações da parcela" />
          
        </div>
      </Modal>
    </div>;
}