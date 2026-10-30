import React, { useEffect, useState, Component } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Prontuario } from '../types';
import { OdontogramaVisualizacao } from './OdontogramaVisualizacao';
import { SolicitarAssinaturaButton } from './SolicitarAssinaturaButton';
import { FileTextIcon, UserIcon, CalendarIcon, ClipboardIcon, ActivityIcon, PillIcon, StickyNoteIcon, EditIcon, ExternalLinkIcon, PrinterIcon, PenToolIcon, CheckCircleIcon, MessageCircleIcon, SendIcon, BellIcon, Loader2Icon, AlertCircleIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { paraHtmlImpressao, paraTextoSimples } from '../utils/htmlTexto';
interface Clinica {
  id: string;
  nome: string;
  logoUrl?: string;
  endereco?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  cnpj?: string;
}
interface Profissional {
  id: string;
  nome: string;
  tipo: string;
  crm?: string;
  uf?: string;
}
interface ProntuarioDetalhesModalProps {
  isOpen: boolean;
  onClose: () => void;
  prontuario: Prontuario | null;
  pacienteNome: string;
  pacienteTelefone?: string;
  clinicaId?: string;
  onEdit?: () => void;
  onWarning?: (message: string) => void;
  onSuccess?: (message: string) => void;
  onRefresh?: () => void;
}
export function ProntuarioDetalhesModal({
  isOpen,
  onClose,
  prontuario,
  pacienteNome,
  pacienteTelefone,
  clinicaId,
  onEdit,
  onWarning,
  onSuccess,
  onRefresh
}: ProntuarioDetalhesModalProps) {
  const [clinicaInfo, setClinicaInfo] = useState<Clinica | null>(null);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [profissionalInfo, setProfissionalInfo] = useState<Profissional | null>(null);
  const [assinaturaRecebida, setAssinaturaRecebida] = useState(false);
  const [aguardandoAssinatura, setAguardandoAssinatura] = useState(false);
  // Carrega informações da clínica e profissional
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      if (parsed.clinicaAtual) {
        setClinicaInfo(parsed.clinicaAtual);
      }
    }
  }, []);
  // ⭐ NOVO: Conecta ao SSE para receber notificação de assinatura em tempo real
  useEffect(() => {
    if (!isOpen || !prontuario?.pacienteId) return;
    console.log('📡 [ProntuarioDetalhesModal] Conectando SSE para paciente:', prontuario.pacienteId);
    const eventSource = new EventSource(`${API_BASE_URL}/api/sse/paciente/${prontuario.pacienteId}`);
    eventSource.addEventListener('connected', (event) => {
      console.log('📡 [ProntuarioDetalhesModal] SSE conectado:', JSON.parse(event.data));
    });
    eventSource.addEventListener('assinatura', (event) => {
      const dados = JSON.parse(event.data);
      console.log('✅ [ProntuarioDetalhesModal] Assinatura recebida via SSE:', dados);
      // Mostra notificação de sucesso
      setAssinaturaRecebida(true);
      setAguardandoAssinatura(false);
      if (onSuccess) {
        onSuccess(`🎉 ${pacienteNome} assinou o documento "${dados.titulo}"!`);
      }
      // Atualiza os dados após 2 segundos
      setTimeout(() => {
        if (onRefresh) {
          onRefresh();
        }
      }, 2000);
    });
    eventSource.addEventListener('heartbeat', () => {


      // Heartbeat recebido - conexão ativa
    });eventSource.onerror = (error) => {
      console.error('📡 [ProntuarioDetalhesModal] Erro SSE:', error);
    };
    return () => {
      console.log('📡 [ProntuarioDetalhesModal] Desconectando SSE');
      eventSource.close();
    };
  }, [isOpen, prontuario?.pacienteId, pacienteNome, onSuccess, onRefresh]);
  // Reset estado quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      setAssinaturaRecebida(false);
      setAguardandoAssinatura(false);
    }
  }, [isOpen]);
  // ⭐⭐⭐ REGRA DE OURO: SEMPRE BUSCAR APENAS PELO ID ⭐⭐⭐
  // O nome do profissional pode mudar (ex: "Roberto" foi renomeado para "Antonio")
  // Por isso, NUNCA devemos usar o nome como fallback - apenas o ID é confiável
  useEffect(() => {
    if (!prontuario || !clinicaId) return;
    const profissionalId = (prontuario as any).profissionalId;
    console.log('🔍 [ProntuarioDetalhesModal] Buscando profissional APENAS pelo ID:', profissionalId || '(vazio)');
    if (!profissionalId) {
      console.warn('⚠️ [ProntuarioDetalhesModal] Atendimento sem profissionalId - não é possível identificar o profissional');
      setProfissionalInfo(null);
      return;
    }
    fetch(`${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`).then((res) => res.ok ? res.json() : []).then((usuarios: Profissional[]) => {
      console.log('👨‍⚕️ [ProntuarioDetalhesModal] Usuários carregados:', usuarios.length);
      const prof = usuarios.find((u) => u.id === profissionalId);
      if (prof) {
        console.log('✅ [ProntuarioDetalhesModal] Profissional encontrado pelo ID:', {
          id: prof.id,
          nome: prof.nome,
          crm: prof.crm
        });
        setProfissionalInfo(prof);
      } else {
        console.warn('❌ [ProntuarioDetalhesModal] Profissional com ID', profissionalId, 'não encontrado na lista de usuários');
        setProfissionalInfo(null);
      }
    }).catch((err) => {
      console.error('❌ [ProntuarioDetalhesModal] Erro ao buscar profissional:', err);
      setProfissionalInfo(null);
    });
  }, [prontuario, clinicaId]);
  if (!prontuario) return null;
  // Acessa campos de assinatura com type assertion
  const assinaturaPaciente = (prontuario as any).assinaturaPaciente;
  const dataAssinatura = (prontuario as any).dataAssinatura;
  const profissionalTitulo = (profissionalInfo as any)?.titulo || '';
  const profissionalNome = profissionalTitulo ? `${profissionalTitulo} ${profissionalInfo?.nome || 'Profissional não identificado'}` : profissionalInfo?.nome || 'Profissional não identificado';
  const getProfissionalCRM = () => {
    if (profissionalInfo?.crm && profissionalInfo?.uf) {
      const prefixo = profissionalInfo.tipo === 'dentista' ? 'CRO' : 'CRM';
      return `${prefixo} ${profissionalInfo.crm}/${profissionalInfo.uf}`;
    }
    return '';
  };
  // ⭐ FUNÇÃO PARA GERAR TEXTO DO ODONTOGRAMA PARA WHATSAPP
  const gerarOdontogramaTexto = () => {
    if (prontuario.tipo !== 'odontologica' || !prontuario.odontograma) {
      return '';
    }
    let odontogramaData: Record<string, {
      status: string;
    }> = {};
    try {
      if (typeof prontuario.odontograma === 'string') {
        odontogramaData = JSON.parse(prontuario.odontograma);
      } else {
        odontogramaData = prontuario.odontograma as any;
      }
    } catch {
      return '';
    }
    if (Object.keys(odontogramaData).length === 0) {
      return '';
    }
    const statusLabels: Record<string, string> = {
      saudavel: '✅ Saudável',
      cariado: '🔴 Cariado',
      restaurado: '🔵 Restaurado',
      extraido: '⚫ Extraído',
      tratamento_canal: '🟣 Trat. Canal',
      protese: '🟡 Prótese',
      implante: '🟢 Implante'
    };
    const dentesPorStatus: Record<string, string[]> = {};
    Object.entries(odontogramaData).forEach(([dente, dados]) => {
      const status = dados.status || 'saudavel';
      if (status !== 'saudavel') {
        if (!dentesPorStatus[status]) {
          dentesPorStatus[status] = [];
        }
        dentesPorStatus[status].push(dente);
      }
    });
    if (Object.keys(dentesPorStatus).length === 0) {
      return '';
    }
    let texto = '🦷 *Odontograma:*\n';
    Object.entries(dentesPorStatus).forEach(([status, dentes]) => {
      const label = statusLabels[status] || status;
      texto += `${label}: ${dentes.sort().join(', ')}\n`;
    });
    return texto + '\n';
  };
  // ⭐ NOVO: Handler para quando solicitar assinatura
  const handleAssinaturaSolicitada = () => {
    setAguardandoAssinatura(true);
    if (onSuccess) {
      onSuccess('Solicitação enviada! Aguardando assinatura do paciente...');
    }
  };
  // Função para enviar prontuário por WhatsApp
  const handleEnviarWhatsApp = async () => {
    if (!pacienteTelefone) {
      if (onWarning) onWarning('Paciente não possui telefone cadastrado');
      return;
    }
    if (!clinicaId) {
      if (onWarning) onWarning('Clínica não identificada');
      return;
    }
    setEnviandoWhatsApp(true);
    try {
      const dataFormatada = new Date(prontuario.data).toLocaleDateString('pt-BR');
      const tipoAtendimento = prontuario.tipo === 'medica' ? 'Médico' : 'Odontológico';
      const profissionalCRM = getProfissionalCRM();
      let mensagem = `📋 *PRONTUÁRIO - ${clinicaInfo?.nome || 'Clínica'}*\n\n`;
      mensagem += `👤 *Paciente:* ${pacienteNome}\n`;
      mensagem += `📅 *Data:* ${dataFormatada}\n`;
      mensagem += `👨‍⚕️ *Profissional:* ${profissionalNome}\n`;
      if (profissionalCRM) {
        mensagem += `${profissionalCRM}\n`;
      }
      mensagem += `🏥 *Tipo:* ${tipoAtendimento}\n\n`;
      if (prontuario.queixaPrincipal) {
        mensagem += `🩺 *Queixa Principal:*\n${paraTextoSimples(prontuario.queixaPrincipal)}\n\n`;
      }
      if (prontuario.diagnostico) {
        mensagem += `🎯 *Diagnóstico:*\n${prontuario.diagnostico}\n\n`;
      }
      if (prontuario.tratamento) {
        mensagem += `💊 *Tratamento:*\n${prontuario.tratamento}\n\n`;
      }
      const odontogramaTexto = gerarOdontogramaTexto();
      if (odontogramaTexto) {
        mensagem += odontogramaTexto;
      }
      if (prontuario.prescricoes) {
        mensagem += `📝 *Prescrições:*\n${prontuario.prescricoes}\n\n`;
      }
      if (prontuario.observacoes) {
        mensagem += `📌 *Observações:*\n${prontuario.observacoes}\n\n`;
      }
      mensagem += `_Documento gerado pelo Sistema EasyClin_`;
      const telefoneFormatado = (pacienteTelefone || '').replace(/\D/g, '');
      const numeroCompleto = telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp/config?clinicaId=${clinicaId}`);
      if (configResponse.ok) {
        const whatsappConfig = await configResponse.json();
        if (whatsappConfig?.serverUrl && whatsappConfig?.sessionName) {
          const response = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              serverUrl: whatsappConfig.serverUrl,
              sessionName: whatsappConfig.sessionName,
              number: numeroCompleto,
              message: mensagem,
              clinicaId,
              pacienteId: prontuario.pacienteId,
              pacienteNome
            })
          });
          if (response.ok) {
            if (onSuccess) onSuccess('Prontuário enviado por WhatsApp com sucesso!');
            return;
          }
        }
      }
      console.log('Usando fallback WhatsApp Web');
      const url = `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
      if (onSuccess) onSuccess('WhatsApp Web aberto em nova aba');
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      const telefoneFormatado = (pacienteTelefone || '').replace(/\D/g, '');
      const numeroCompleto = telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;
      const dataFormatada = new Date(prontuario.data).toLocaleDateString('pt-BR');
      const mensagem = `📋 Prontuário - ${pacienteNome} - ${dataFormatada}`;
      const url = `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
      if (onSuccess) onSuccess('WhatsApp Web aberto em nova aba');
    } finally {
      setEnviandoWhatsApp(false);
    }
  };
  const handleImprimir = () => {
    const clinicaNome = clinicaInfo?.nome || 'Clínica Médica';
    const clinicaEndereco = clinicaInfo?.endereco || (clinicaInfo?.logradouro ? clinicaInfo.logradouro + (clinicaInfo.numero ? ', ' + clinicaInfo.numero : '') + (clinicaInfo.bairro ? ' - ' + clinicaInfo.bairro : '') + (clinicaInfo.cidade ? ', ' + clinicaInfo.cidade : '') + (clinicaInfo.uf ? '/' + clinicaInfo.uf : '') : '');
    const clinicaTelefone = clinicaInfo?.telefone || '';
    const clinicaEmail = clinicaInfo?.email || '';
    const profissionalCRM = getProfissionalCRM();
    const dataFormatada = new Date(prontuario.data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const tipoAtendimento = prontuario.tipo === 'medica' ? 'Médico' : 'Odontológico';
    const h: string[] = [];
    h.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">');
    h.push('<title>Prontuário - ' + pacienteNome + '</title>');
    h.push('<sty' + 'le>');
    h.push('@page { size: A4; margin: 0; }');
    h.push('* { margin: 0; padding: 0; box-sizing: border-box; }');
    h.push('body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; }');
    h.push('.page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 24px 28px; }');
    h.push('.header { border-bottom: 3px solid #3b82f6; padding-bottom: 12px; margin-bottom: 16px; }');
    h.push('.header h1 { font-size: 18px; color: #1e3a5f; }');
    h.push('.header .info { font-size: 9px; color: #475569; }');
    h.push('.doc-title { font-size: 16px; font-weight: bold; color: #1e3a5f; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 16px; }');
    h.push('.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 16px; }');
    h.push('.info-item { font-size: 10px; }');
    h.push('.info-label { font-weight: bold; color: #0f172a; }');
    h.push('.section { margin-bottom: 14px; padding: 10px 12px; border-left: 3px solid #3b82f6; background: #f8fafc; border-radius: 0 6px 6px 0; }');
    h.push('.section h3 { font-size: 12px; font-weight: bold; color: #1e3a5f; margin-bottom: 6px; }');
    h.push('.section p { font-size: 11px; color: #334155; line-height: 1.6; white-space: pre-wrap; }');
    h.push('.footer { margin-top: 24px; border-top: 2px solid #3b82f6; padding-top: 8px; text-align: center; font-size: 9px; color: #64748b; }');
    h.push('@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }');
    h.push('</sty' + 'le>');
    h.push('</head><body>');
    h.push('<div class="page">');
    h.push('<div class="header">');
    h.push('<h1>' + clinicaNome + '</h1>');
    const infoLines = [clinicaEndereco, clinicaTelefone, clinicaEmail].filter(Boolean).join(' | ');
    if (infoLines) h.push('<div class="info">' + infoLines + '</div>');
    h.push('</div>');
    h.push('<div class="doc-title">Prontuário ' + tipoAtendimento + '</div>');
    h.push('<div class="info-grid">');
    h.push('<div class="info-item"><span class="info-label">Paciente:</span> ' + pacienteNome + '</div>');
    h.push('<div class="info-item"><span class="info-label">Data:</span> ' + dataFormatada + '</div>');
    h.push('<div class="info-item"><span class="info-label">Profissional:</span> ' + profissionalNome + (profissionalCRM ? ' — ' + profissionalCRM : '') + '</div>');
    h.push('<div class="info-item"><span class="info-label">Tipo:</span> ' + tipoAtendimento + '</div>');
    h.push('</div>');
    if (prontuario.queixaPrincipal) {
      // Impressão preserva a formatação escrita no editor.
      h.push('<div class="section"><h3>Queixa Principal</h3><div>' + paraHtmlImpressao(prontuario.queixaPrincipal) + '</div></div>');
    }
    if (prontuario.historico) {
      h.push('<div class="section"><h3>Histórico</h3><p>' + prontuario.historico + '</p></div>');
    }
    if (prontuario.exameFisico) {
      h.push('<div class="section"><h3>Exame Físico</h3><p>' + prontuario.exameFisico + '</p></div>');
    }
    if (prontuario.diagnostico) {
      h.push('<div class="section"><h3>Diagnóstico</h3><p>' + prontuario.diagnostico + '</p></div>');
    }
    if (prontuario.tratamento) {
      h.push('<div class="section"><h3>Tratamento</h3><p>' + prontuario.tratamento + '</p></div>');
    }
    if (prontuario.prescricoes) {
      h.push('<div class="section"><h3>Prescrições</h3><p>' + prontuario.prescricoes + '</p></div>');
    }
    if (prontuario.observacoes) {
      h.push('<div class="section"><h3>Observações</h3><p>' + prontuario.observacoes + '</p></div>');
    }
    h.push('<div class="footer">');
    h.push('<div>' + clinicaNome + '</div>');
    h.push('<div>Documento gerado eletronicamente pelo Sistema EasyClin</div>');
    h.push('</div>');
    h.push('</div>');
    h.push('</body></html>');
    // ⭐ Abre preview antes de salvar
    import('../utils/pdfGenerator').then(({
      previewDocumentoPDF
    }) => {
      const nomeArquivo = `Prontuario_${(pacienteNome || 'Paciente').replace(/\s+/g, '_')}_${new Date(prontuario.data).toISOString().split('T')[0]}.pdf`;
      previewDocumentoPDF(h.join('\n'), {
        fileName: nomeArquivo
      });
    });
  };
  // Extrai links de PDF do Memed das prescrições
  const extractMemedLinks = (prescricoes?: string) => {
    if (!prescricoes) return [];
    const lines = prescricoes.split('\n');
    const links: {
      id: string;
      url: string;
    }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('Prescrição Memed #')) {
        const id = line.match(/#(\d+)/)?.[1] || '';
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.startsWith('PDF:')) {
          const url = nextLine.replace('PDF:', '').trim();
          links.push({
            id,
            url
          });
        }
      }
    }
    return links;
  };
  const memedLinks = extractMemedLinks(prontuario.prescricoes);
  return <Modal isOpen={isOpen} onClose={onClose} title={<div className="flex items-center justify-between w-full pr-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Prontuário Completo
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {pacienteNome} •{' '}
              {new Date(prontuario.data).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div className="flex gap-2">
            {pacienteTelefone && <Button variant="secondary" size="sm" onClick={handleEnviarWhatsApp} disabled={enviandoWhatsApp} className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
            
                <MessageCircleIcon className="w-4 h-4 mr-2" />
                {enviandoWhatsApp ? 'Enviando...' : 'WhatsApp'}
              </Button>}
            <Button variant="secondary" size="sm" onClick={handleImprimir}>
              <PrinterIcon className="w-4 h-4 mr-2" />
              Imprimir PDF
            </Button>
            {onEdit && <Button variant="secondary" size="sm" onClick={onEdit}>
                <EditIcon className="w-4 h-4 mr-2" />
                Editar
              </Button>}
          </div>
        </div>} size="large">
      
      <div className="space-y-6">
        {/* ⭐ NOVO: Banner de assinatura recebida em tempo real */}
        {assinaturaRecebida && <div className="bg-green-100 border-2 border-green-400 rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-800">
                  🎉 Assinatura Recebida!
                </h3>
                <p className="text-sm text-green-700">
                  O paciente acabou de assinar o documento. Atualizando...
                </p>
              </div>
            </div>
          </div>}

        {/* ⭐ NOVO: Banner aguardando assinatura */}
        {aguardandoAssinatura && !assinaturaRecebida && !assinaturaPaciente && <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Loader2Icon className="w-5 h-5 text-blue-600 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <BellIcon className="w-4 h-4" />
                  Aguardando Assinatura
                </h3>
                <p className="text-xs text-blue-600">
                  Você será notificado automaticamente quando o paciente
                  assinar.
                </p>
              </div>
            </div>
          </div>}

        {/* Informações Gerais */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Paciente</p>
                <p className="text-sm font-semibold text-gray-900">
                  {pacienteNome}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Data do Atendimento</p>
                <p className="text-sm font-semibold text-gray-900">
                  {new Date(prontuario.data).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <ActivityIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Profissional</p>
                <p className="text-sm font-semibold text-gray-900">
                  {profissionalNome}
                  {getProfissionalCRM() && <span className="text-xs font-normal text-gray-500 ml-2">
                      {getProfissionalCRM()}
                    </span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <FileTextIcon className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Tipo</p>
                <p className="text-sm font-semibold text-gray-900">
                  {prontuario.tipo === 'medica' ? 'Médico' : 'Odontológico'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Queixa Principal */}
        <div className="border-l-4 border-red-400 bg-red-50 p-4 rounded-r-lg">
          <div className="flex items-start gap-3">
            <ClipboardIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900 mb-2">
                Queixa Principal
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {paraTextoSimples(prontuario.queixaPrincipal)}
              </p>
            </div>
          </div>
        </div>

        {/* Histórico */}
        {prontuario.historico && <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileTextIcon className="w-4 h-4 text-gray-600" />
              Histórico
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {prontuario.historico}
            </p>
          </div>}

        {/* Exame Físico */}
        {prontuario.exameFisico && <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-gray-600" />
              Exame Físico
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {prontuario.exameFisico}
            </p>
          </div>}

        {/* Odontograma */}
        {prontuario.tipo === 'odontologica' && prontuario.odontograma && <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-gray-600" />
              Odontograma
            </h3>
            <OdontogramaVisualizacao data={JSON.parse(prontuario.odontograma)} />
          
          </div>}

        {/* Diagnóstico */}
        <div className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded-r-lg">
          <div className="flex items-start gap-3">
            <ClipboardIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                Diagnóstico
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {prontuario.diagnostico}
              </p>
            </div>
          </div>
        </div>

        {/* Tratamento */}
        <div className="border-l-4 border-green-400 bg-green-50 p-4 rounded-r-lg">
          <div className="flex items-start gap-3">
            <ActivityIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-900 mb-2">
                Tratamento
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {prontuario.tratamento}
              </p>
            </div>
          </div>
        </div>

        {/* Prescrições */}
        {prontuario.prescricoes && <div className="border-l-4 border-purple-400 bg-purple-50 p-4 rounded-r-lg">
            <div className="flex items-start gap-3">
              <PillIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-purple-900 mb-3">
                  Prescrições
                </h3>
                {memedLinks.length > 0 && <div className="mb-4 space-y-2">
                    {memedLinks.map((link, index) => <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-white border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all group">
                  
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          <PillIcon className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Prescrição Memed #{link.id}
                          </p>
                          <p className="text-xs text-gray-500">
                            Clique para visualizar o PDF
                          </p>
                        </div>
                        <ExternalLinkIcon className="w-4 h-4 text-purple-600 group-hover:translate-x-1 transition-transform" />
                      </a>)}
                  </div>}
                {(() => {
              // Tenta parsear prescrições como JSON (PrescricaoData)
              try {
                const parsed = typeof prontuario.prescricoes === 'string' ? JSON.parse(prontuario.prescricoes) : prontuario.prescricoes;
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.medicamentos) && parsed.medicamentos.length > 0) {
                  return <div className="space-y-3">
                          {parsed.controleEspecial && <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 border border-red-200 rounded-lg text-xs font-medium text-red-800">
                              <AlertCircleIcon className="w-3.5 h-3.5" />
                              Controle Especial
                            </div>}
                          {parsed.medicamentos.map((med: any, index: number) => <div key={med.id || index} className="bg-white border border-purple-200 rounded-lg p-3">
                            
                                <div className="flex items-start gap-2">
                                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold flex-shrink-0 mt-0.5">
                                    {index + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900">
                                      {med.nome}
                                      {med.dosagem && <span className="font-normal text-gray-600 ml-1">
                                          - {med.dosagem}
                                        </span>}
                                    </p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                      {med.quantidade && <span className="text-xs text-gray-600">
                                          Qtde:{' '}
                                          <strong>{med.quantidade}</strong>{' '}
                                          {med.unidade || ''}
                                        </span>}
                                      {med.posologia && <span className="text-xs text-gray-600">
                                          Posologia:{' '}
                                          <strong>{med.posologia}</strong>
                                        </span>}
                                    </div>
                                  </div>
                                </div>
                              </div>)}
                          {parsed.generico && parsed.generico.trim() && <div className="mt-2 pt-2 border-t border-purple-200">
                              <p className="text-xs font-medium text-gray-500 mb-1">
                                Observações adicionais:
                              </p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {parsed.generico}
                              </p>
                            </div>}
                        </div>;
                }
              } catch (e) {


                // Não é JSON, exibe como texto
              }return <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {prontuario.prescricoes}
                    </p>;
            })()}
              </div>
            </div>
          </div>}

        {/* Observações */}
        {prontuario.observacoes && <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <StickyNoteIcon className="w-4 h-4 text-gray-600" />
              Observações
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {prontuario.observacoes}
            </p>
          </div>}

        {/* Assinatura do Paciente */}
        <div className="border-t border-gray-200 pt-6 mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PenToolIcon className="w-4 h-4 text-gray-600" />
            Assinatura do Paciente
          </h3>

          {assinaturaPaciente ? <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="bg-white border border-green-300 rounded-lg p-3 inline-block">
                    <img src={assinaturaPaciente} alt="Assinatura do paciente" className="max-w-[300px] h-auto" />
                  
                  </div>
                  {dataAssinatura && <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" />
                      Assinado em:{' '}
                      {new Date(dataAssinatura).toLocaleString('pt-BR')}
                    </p>}
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  <CheckCircleIcon className="w-3 h-3" />
                  Documento Assinado
                </div>
              </div>
            </div> : <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    {aguardandoAssinatura ? <Loader2Icon className="w-5 h-5 text-amber-600 animate-spin" /> : <PenToolIcon className="w-5 h-5 text-amber-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      {aguardandoAssinatura ? 'Aguardando Assinatura...' : 'Assinatura Pendente'}
                    </p>
                    <p className="text-xs text-amber-700">
                      {aguardandoAssinatura ? 'Você será notificado quando o paciente assinar.' : 'Este prontuário ainda não foi assinado pelo paciente.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pacienteTelefone && clinicaId && prontuario && !aguardandoAssinatura ? <SolicitarAssinaturaButton pacienteId={prontuario.pacienteId} pacienteNome={pacienteNome} pacienteTelefone={pacienteTelefone} clinicaId={clinicaId} variant="primary" size="sm" label="Solicitar via WhatsApp" /> : !pacienteTelefone ? <span className="text-xs text-amber-600 bg-amber-100 px-3 py-1.5 rounded-full">
                      📱 Sem telefone cadastrado
                    </span> : null}
                  {onEdit && !aguardandoAssinatura && <Button variant="outline" size="sm" onClick={onEdit}>
                      <EditIcon className="w-4 h-4 mr-1" />
                      Coletar Presencial
                    </Button>}
                </div>
              </div>

              {!pacienteTelefone && <p className="text-xs text-amber-600 mt-3 pl-13">
                  💡 Para solicitar assinatura via WhatsApp, cadastre o telefone
                  do paciente.
                </p>}
            </div>}
        </div>
      </div>
    </Modal>;
}