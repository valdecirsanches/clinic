import React, { useEffect, useState, Component } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { PacienteBuscaSelectAPI } from './PacienteBuscaSelectAPI';
import { BancoConfigForm } from './BancoConfigForm';
import { Parcela } from '../types';
import { QrCodeIcon, CopyIcon, CheckIcon, SendIcon, PrinterIcon, FileTextIcon, BanknoteIcon, Loader2Icon, AlertTriangleIcon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { formatarTelefoneWhatsApp } from '../services/whatsappMessages';
// ⭐ FIX Render compiler: o pacote 'qrcode' arrasta 'pngjs' como dependência
// transitiva, e o compilador do Render falha consistentemente ao extrair o
// tarball do pngjs (qualquer versão) com "Command failed: tar -xzf .../pngjs.tgz".
// Como solução, eliminamos a dependência 'qrcode' e geramos o QR Code via API
// pública qrserver.com — zero dependências npm, funciona em todos os ambientes.
// API: https://goqr.me/api/doc/create-qr-code/
const QRCode = {
  toDataURL: async (text: string, opts?: {
    width?: number;
    margin?: number;
  }): Promise<string> => {
    const size = opts?.width || 300;
    const margin = opts?.margin ?? 1;
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=' + margin + '&format=png&data=' + encodeURIComponent(text);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('QR API HTTP ' + resp.status);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('[QRCode.toDataURL] Falhou:', err);
      // Fallback: retorna URL direta da API como string (usável em <img src> mas não como dataURL real)
      return url;
    }
  }
};
import { API_BASE_URL } from '../config/api';
import { DadosBoleto, gerarNumeroDocumento, gerarNossoNumero, gerarLinhaDigitavel, imprimirBoleto, formatarMoeda, formatarCNPJ, formatarCPF } from '../utils/boletoGenerator';
import jsPDF from 'jspdf';
// ⭐ Interface para config bancária carregada
interface BancoConfigAtiva {
  id: string;
  banco: string;
  bancoNome: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  carteira: string;
  convenio: string;
  codigoCedente: string;
  nomeCedente: string;
  cnpjCedente: string;
  enderecoCedente: string;
  cidadeCedente: string;
  ufCedente: string;
  cepCedente: string;
  multa: number;
  juros: number;
  diasProtesto: number;
  instrucao1: string;
  instrucao2: string;
  instrucao3: string;
  ativo: number | boolean;
}
// ⭐ Gera código PIX EMV real usando CNPJ do cedente
function gerarPixEMV(valor: number, cnpjCedente: string, nomeCedente: string, cidadeCedente: string, descricao?: string): string {
  // Valida se tem CNPJ
  console.log('🔍 DEBUG gerarPixEMV:', {
    cnpjCedente,
    nomeCedente,
    cidadeCedente,
    descricao
  });
  if (!cnpjCedente) {
    console.error('CNPJ do cedente é obrigatório para gerar código PIX');
    return '';
  }
  const cnpjLimpo = (cnpjCedente || '').replace(/\D/g, '');
  // Valida se CNPJ tem dígitos após limpeza
  if (!cnpjLimpo) {
    console.error('CNPJ inválido');
    return '';
  }
  function tlv(tag: string, value: string): string {
    const len = value.length.toString().padStart(2, '0');
    return `${tag}${len}${value}`;
  }
  let payload = tlv('00', '01');
  const gui = tlv('00', 'BR.GOV.BCB.PIX');
  const chave = tlv('01', cnpjLimpo);
  if (descricao) {
    const desc = descricao.substring(0, 25);
    payload += tlv('26', gui + chave + tlv('02', desc));
  } else {
    payload += tlv('26', gui + chave);
  }
  payload += tlv('52', '0000');
  payload += tlv('53', '986');
  payload += tlv('54', valor.toFixed(2));
  payload += tlv('58', 'BR');
  const nome = (nomeCedente || '').substring(0, 25).toUpperCase();
  payload += tlv('59', nome);
  const cidade = (cidadeCedente || 'SAO PAULO').substring(0, 15).toUpperCase();
  payload += tlv('60', cidade);
  const txid = `BOL${Date.now().toString(36).toUpperCase()}`;
  payload += tlv('62', tlv('05', txid));
  payload += '6304';
  const crc = calcularCRC16(payload);
  payload = payload.slice(0, -4) + '63' + '04' + crc;
  return payload;
}
// ⭐ Calcula CRC16 CCITT-FALSE para PIX EMV
function calcularCRC16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = crc << 1 ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
// ⭐ Gera PDF do boleto usando dados bancários reais (ou dados da clínica como fallback)
function gerarPDFBoleto(valor: number, dataVencimento: string, numeroDocumento: string, sacadoNome: string, sacadoCpf: string, sacadoEndereco: string, sacadoCidade: string, sacadoUf: string, cedenteNome: string, cedenteCnpj: string, pixCode: string, linhaDigitavel: string, formaPagamento: string, observacoes: string, bancoConfig?: BancoConfigAtiva | null): string {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const marginLeft = 15;
  const contentWidth = pageWidth - marginLeft * 2;
  const valorFormatado = formatarMoeda(valor);
  const dataFormatada = new Date(dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  // ⭐ Usa dados reais do banco configurado (ou dados da clínica como fallback)
  const bancoNome = bancoConfig?.bancoNome || cedenteNome;
  const bancoCodigo = bancoConfig?.banco || '';
  const agencia = bancoConfig ? `${bancoConfig.agencia}${bancoConfig.agenciaDigito ? '-' + bancoConfig.agenciaDigito : ''}` : '';
  const conta = bancoConfig ? `${bancoConfig.conta}-${bancoConfig.contaDigito}` : '';
  const carteira = bancoConfig?.carteira || '';
  const nossoNumero = gerarNossoNumero(numeroDocumento);
  const instrucoes = bancoConfig ? [bancoConfig.instrucao1, bancoConfig.instrucao2, bancoConfig.instrucao3].filter(Boolean) : ['Não receber após o vencimento.', 'Juros de 1% ao mês após o vencimento.', 'Multa de 2% após o vencimento.'];
  let y = 15;
  // Desenha uma via do boleto
  function desenharVia(startY: number, viaLabel: string) {
    let y = startY;
    const boxX = marginLeft;
    const boxW = contentWidth;
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.5);
    doc.rect(boxX, y, boxW, 115);
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'bold');
    doc.text(viaLabel, boxX + boxW - 3, y + 4, {
      align: 'right'
    });
    // Header do banco
    doc.setFillColor(240, 240, 240);
    doc.rect(boxX, y, boxW, 10, 'F');
    doc.setDrawColor(0);
    doc.setLineWidth(0.8);
    doc.line(boxX, y + 10, boxX + boxW, y + 10);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text((bancoNome || 'BANCO').toUpperCase().substring(0, 20), boxX + 5, y + 7);
    if (bancoCodigo) {
      doc.setFontSize(16);
      doc.text(`${bancoCodigo}-9`, boxX + 42, y + 7.5);
    }
    doc.setFontSize(9);
    doc.setFont('courier', 'bold');
    doc.text(linhaDigitavel, boxX + boxW - 3, y + 7, {
      align: 'right'
    });
    y += 12;
    // Local de pagamento / Vencimento
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Local de Pagamento', boxX + 2, y);
    doc.text('Vencimento', boxX + boxW - 40, y);
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text('PAGÁVEL EM QUALQUER BANCO ATÉ O VENCIMENTO', boxX + 2, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(dataFormatada, boxX + boxW - 3, y + 4, {
      align: 'right'
    });
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.line(boxX, y + 6, boxX + boxW, y + 6);
    y += 8;
    // Cedente / Agência
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Cedente', boxX + 2, y);
    doc.text('Agência / Código Cedente', boxX + boxW - 40, y);
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(`${cedenteNome} - CNPJ: ${cedenteCnpj}`, boxX + 2, y + 4);
    doc.text(agencia && conta ? `${agencia} / ${conta}` : '', boxX + boxW - 3, y + 4, {
      align: 'right'
    });
    doc.line(boxX, y + 6, boxX + boxW, y + 6);
    y += 8;
    // Data / Nº Doc / Espécie
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.text('Data Doc.', boxX + 2, y);
    doc.text('Nº Documento', boxX + 30, y);
    doc.text('Espécie', boxX + 70, y);
    doc.text('Nosso Número', boxX + boxW - 40, y);
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(dataEmissao, boxX + 2, y + 4);
    doc.text(numeroDocumento, boxX + 30, y + 4);
    doc.text('DM', boxX + 70, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.text(nossoNumero, boxX + boxW - 3, y + 4, {
      align: 'right'
    });
    doc.line(boxX, y + 6, boxX + boxW, y + 6);
    y += 8;
    // Valor
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Carteira', boxX + 2, y);
    doc.text('Espécie', boxX + 25, y);
    doc.text('(=) Valor do Documento', boxX + boxW - 40, y);
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(carteira || '-', boxX + 2, y + 4);
    doc.text('R$', boxX + 25, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(valorFormatado, boxX + boxW - 3, y + 4, {
      align: 'right'
    });
    doc.line(boxX, y + 6, boxX + boxW, y + 6);
    y += 8;
    // Instruções
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Instruções', boxX + 2, y);
    doc.setFontSize(7);
    doc.setTextColor(0);
    instrucoes.forEach((inst, i) => {
      doc.text(`• ${inst}`, boxX + 2, y + 4 + i * 3.5);
    });
    if (observacoes) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Ref.: ${observacoes}`, boxX + 2, y + 4 + instrucoes.length * 3.5 + 2);
    }
    // Código PIX (se aplicável)
    if (formaPagamento === 'pix' && pixCode) {
      doc.setFontSize(6);
      doc.setTextColor(100);
      doc.text('Código PIX Copia e Cola', boxX + boxW - 40, y);
      doc.setFontSize(5);
      doc.setTextColor(0);
      doc.setFont('courier', 'normal');
      const maxChars = 35;
      for (let i = 0; i < Math.min(pixCode.length, maxChars * 4); i += maxChars) {
        doc.text(pixCode.substring(i, i + maxChars), boxX + boxW - 40, y + 3 + i / maxChars * 2.5);
      }
    }
    y += 22;
    doc.setDrawColor(150);
    doc.line(boxX, y, boxX + boxW, y);
    // Sacado
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Sacado', boxX + 2, y + 2);
    doc.setFontSize(8);
    doc.setTextColor(0);
    let sacadoText = sacadoNome;
    if (sacadoCpf) sacadoText += ` - CPF: ${sacadoCpf}`;
    doc.text(sacadoText, boxX + 2, y + 6);
    if (sacadoEndereco) {
      doc.setFontSize(7);
      doc.text(`${sacadoEndereco}${sacadoCidade ? ` - ${sacadoCidade}/${sacadoUf}` : ''}`, boxX + 2, y + 10);
    }
    y += 14;
    // Código de barras (simulado com linhas)
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    const barcodeX = boxX + 3;
    const barcodeW = boxW * 0.65;
    const barcodeH = 12;
    for (let i = 0; i < barcodeW; i += 2) {
      const thick = Math.random() > 0.5;
      doc.setLineWidth(thick ? 0.8 : 0.3);
      doc.line(barcodeX + i, y, barcodeX + i, y + barcodeH);
    }
    return startY + 115;
  }
  // 1ª Via
  const endVia1 = desenharVia(y, '1ª Via - Banco');
  // Linha de corte
  const corteY = endVia1 + 5;
  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(marginLeft, corteY, pageWidth - marginLeft, corteY);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('✂ Corte aqui', marginLeft + 2, corteY - 1);
  // 2ª Via
  desenharVia(corteY + 5, '2ª Via - Sacado');
  return doc.output('datauristring');
}
interface BoletoModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicaId: string;
  onSave: (dados: any) => Promise<void>;
  boletoExistente?: Parcela | null;
}
export function BoletoModal({
  isOpen,
  onClose,
  clinicaId,
  onSave,
  boletoExistente
}: BoletoModalProps) {
  const {
    success,
    error: showError
  } = useToast();
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [loading, setLoading] = useState(false);
  const [pacienteId, setPacienteId] = useState('');
  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteTelefone, setPacienteTelefone] = useState('');
  const [pacienteCpf, setPacienteCpf] = useState('');
  const [pacienteEndereco, setPacienteEndereco] = useState('');
  const [pacienteCidade, setPacienteCidade] = useState('');
  const [pacienteUf, setPacienteUf] = useState('');
  const [clinicaNome, setClinicaNome] = useState('');
  const [clinicaCnpj, setClinicaCnpj] = useState('');
  const [bancoConfig, setBancoConfig] = useState<BancoConfigAtiva | null>(null);
  const [carregandoBanco, setCarregandoBanco] = useState(false);
  const [semBancoConfigurado, setSemBancoConfigurado] = useState(false);
  const [formData, setFormData] = useState({
    valor: '',
    dataVencimento: '',
    formaPagamento: 'pix',
    observacoes: ''
  });
  const [pixCode, setPixCode] = useState('');
  const [linhaDigitavel, setLinhaDigitavel] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [copied, setCopied] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  // ⭐ Modal para digitar telefone manualmente
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [showBancoConfigModal, setShowBancoConfigModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  // ⭐ Carrega configuração bancária ativa
  useEffect(() => {
    const carregarBancoConfig = async () => {
      if (!clinicaId || !isOpen) return;
      setCarregandoBanco(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/configuracoes-banco?clinicaId=${clinicaId}`);
        if (response.ok) {
          const configs = await response.json();
          const ativa = configs.find((c: any) => c.ativo === 1 || c.ativo === true);
          if (ativa) {
            setBancoConfig(ativa);
            setSemBancoConfigurado(false);
            setClinicaNome(ativa.nomeCedente || clinicaNome);
            setClinicaCnpj(ativa.cnpjCedente || clinicaCnpj);
          } else {
            setBancoConfig(null);
            setSemBancoConfigurado(true);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar config bancária:', err);
        setSemBancoConfigurado(true);
      } finally {
        setCarregandoBanco(false);
      }
    };
    carregarBancoConfig();
  }, [clinicaId, isOpen]);
  // Busca dados do paciente quando visualizando boleto existente
  useEffect(() => {
    const buscarPaciente = async (id: string) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/pacientes/${id}?clinicaId=${clinicaId}`);
        if (response.ok) {
          const paciente = await response.json();
          setPacienteId(paciente.id);
          setPacienteNome(paciente.nome);
          setPacienteTelefone(paciente.telefone || '');
          setPacienteCpf(paciente.cpf || '');
          setPacienteEndereco(paciente.logradouro ? `${paciente.logradouro}, ${paciente.numero || 'S/N'}` : '');
          setPacienteCidade(paciente.cidade || '');
          setPacienteUf(paciente.uf || '');
        }
      } catch (err) {
        console.error('Erro ao buscar paciente:', err);
      }
    };
    const buscarClinica = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/clinicas/${clinicaId}`);
        if (response.ok) {
          const clinica = await response.json();
          // Só usa dados da clínica como fallback se NÃO houver banco configurado
          if (!bancoConfig) {
            setClinicaNome(clinica.nome || '');
            setClinicaCnpj(clinica.cnpj || '');
          }
        }
      } catch (err) {
        console.error('Erro ao buscar clínica:', err);
      }
    };
    if (isOpen) {
      buscarClinica();
      if (boletoExistente) {
        setFormData({
          valor: boletoExistente.valorParcela.toString(),
          dataVencimento: boletoExistente.dataVencimento,
          formaPagamento: boletoExistente.formaPagamento || 'pix',
          observacoes: boletoExistente.observacoes || ''
        });
        if (boletoExistente.pacienteId) buscarPaciente(boletoExistente.pacienteId);
        setStep('preview');
        gerarCodigos(boletoExistente.valorParcela, boletoExistente.dataVencimento);
      } else {
        setStep('form');
        const hoje = new Date().toISOString().split('T')[0];
        setFormData({
          valor: '',
          dataVencimento: hoje,
          formaPagamento: 'pix',
          observacoes: ''
        });
        setPacienteId('');
        setPacienteNome('');
        setPacienteTelefone('');
        setPacienteCpf('');
        setPacienteEndereco('');
        setPacienteCidade('');
        setPacienteUf('');
        setPixCode('');
        setLinhaDigitavel('');
        setNumeroDocumento(gerarNumeroDocumento('BOL'));
      }
    }
  }, [isOpen, boletoExistente, clinicaId]);
  const gerarCodigos = (valor: number, vencimento: string) => {
    const cnpjParaPix = bancoConfig?.cnpjCedente || clinicaCnpj || '';
    const nomeParaPix = bancoConfig?.nomeCedente || clinicaNome || '';
    const cidadeParaPix = bancoConfig?.cidadeCedente || 'SAO PAULO';
    // Valida se tem CNPJ antes de gerar PIX
    if (!cnpjParaPix) {
      console.error('CNPJ do cedente não configurado');
      setPixCode('');
    } else {
      console.log('🔍 DEBUG antes gerarPixEMV:', {
        cnpjParaPix,
        nomeParaPix,
        cidadeParaPix,
        valor
      });
      const pix = gerarPixEMV(valor, cnpjParaPix, nomeParaPix, cidadeParaPix, formData.observacoes || undefined);
      setPixCode(pix);
      // Gera QR Code visual do PIX
      if (pix) {
        QRCode.toDataURL(pix, {
          width: 300,
          margin: 1
        }).then(setQrCodeDataUrl).catch(console.error);
      }
    }
    const codigoBanco = bancoConfig?.banco || undefined;
    const agencia = bancoConfig?.agencia || undefined;
    const conta = bancoConfig?.conta || undefined;
    const carteira = bancoConfig?.carteira || undefined;
    const convenio = bancoConfig?.convenio || undefined;
    const codigoCedente = bancoConfig?.codigoCedente || undefined;
    const nn = gerarNossoNumero(numeroDocumento || gerarNumeroDocumento('BOL'));
    const linha = gerarLinhaDigitavel(valor, vencimento, codigoBanco, agencia, conta, carteira, nn, convenio, codigoCedente);
    setLinhaDigitavel(linha);
    if (!numeroDocumento) setNumeroDocumento(gerarNumeroDocumento('BOL'));
  };
  const handlePacienteChange = async (id: string, nome: string) => {
    setPacienteId(id);
    setPacienteNome(nome);
    if (id) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/pacientes/${id}?clinicaId=${clinicaId}`);
        if (response.ok) {
          const paciente = await response.json();
          setPacienteTelefone(paciente.telefone || '');
          setPacienteCpf(paciente.cpf || '');
          setPacienteEndereco(paciente.logradouro ? `${paciente.logradouro}, ${paciente.numero || 'S/N'}` : '');
          setPacienteCidade(paciente.cidade || '');
          setPacienteUf(paciente.uf || '');
        }
      } catch (err) {
        console.error('Erro ao buscar dados do paciente:', err);
      }
    } else {
      setPacienteTelefone('');
      setPacienteCpf('');
      setPacienteEndereco('');
      setPacienteCidade('');
      setPacienteUf('');
    }
  };
  const handleNext = () => {
    if (!pacienteId) {
      showError('Erro', 'Selecione um paciente');
      return;
    }
    if (!formData.valor || parseFloat(formData.valor) <= 0) {
      showError('Erro', 'Informe um valor válido');
      return;
    }
    if (!formData.dataVencimento) {
      showError('Erro', 'Informe a data de vencimento');
      return;
    }
    // Valida se tem configuração bancária
    if (semBancoConfigurado || !bancoConfig) {
      showError('Erro', 'Configure uma conta bancária em Configurações → Configurações Bancárias antes de emitir boletos');
      return;
    }
    // Valida se tem CNPJ configurado
    const cnpj = bancoConfig?.cnpjCedente || clinicaCnpj;
    if (!cnpj) {
      showError('Erro', 'CNPJ do cedente não configurado. Verifique as Configurações Bancárias');
      return;
    }
    gerarCodigos(parseFloat(formData.valor), formData.dataVencimento);
    setStep('preview');
  };
  const handleSave = async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      const nn = gerarNossoNumero(numeroDocumento || gerarNumeroDocumento('BOL'));
      await onSave({
        pacienteId,
        numeroParcela: 1,
        valorParcela: parseFloat(formData.valor),
        dataVencimento: formData.dataVencimento,
        status: 'pendente',
        formaPagamento: formData.formaPagamento,
        observacoes: formData.observacoes,
        linkPagamento: formData.formaPagamento === 'pix' ? pixCode : linhaDigitavel,
        numeroDocumento,
        nossoNumero: nn,
        bancoConfigId: bancoConfig?.id || null
      });
      success('Sucesso', 'Cobrança gerada com sucesso!');
      onClose();
    } catch (err: any) {
      showError('Erro', err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleCopyCode = (code: string, tipo: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    success('Copiado', `Código ${tipo} copiado para a área de transferência`);
  };
  const handlePrintBoleto = () => {
    const nn = gerarNossoNumero(numeroDocumento);
    // ⭐ Salva nossoNumero na parcela existente para o webhook poder encontrar
    if (boletoExistente?.id && clinicaId) {
      fetch(`${API_BASE_URL}/api/parcelas/${boletoExistente.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          nossoNumero: nn,
          bancoConfigId: bancoConfig?.id || null,
          boletoRegistrado: true
        })
      }).then((r) => {
        if (r.ok) console.log('✅ [BoletoModal] nossoNumero salvo na parcela:', nn);else console.warn('⚠️ [BoletoModal] Erro ao salvar nossoNumero na parcela');
      }).catch((err) => console.warn('⚠️ [BoletoModal] Erro ao salvar nossoNumero:', err));
    }
    const dadosBoleto: DadosBoleto = {
      cedente: {
        nome: bancoConfig?.nomeCedente || clinicaNome || 'Não configurado',
        cnpj: bancoConfig?.cnpjCedente || clinicaCnpj || '',
        endereco: bancoConfig?.enderecoCedente || '',
        cidade: bancoConfig?.cidadeCedente || '',
        uf: bancoConfig?.ufCedente || ''
      },
      sacado: {
        nome: pacienteNome,
        cpf: pacienteCpf || '',
        endereco: pacienteEndereco,
        cidade: pacienteCidade,
        uf: pacienteUf
      },
      valor: parseFloat(formData.valor),
      dataVencimento: formData.dataVencimento,
      dataEmissao: new Date().toISOString().split('T')[0],
      numeroDocumento,
      nossoNumero: nn,
      descricao: formData.observacoes || 'Serviços médicos',
      instrucoes: bancoConfig ? [bancoConfig.instrucao1, bancoConfig.instrucao2, bancoConfig.instrucao3].filter(Boolean) : ['Não receber após o vencimento.', 'Juros de 1% ao mês após o vencimento.', 'Multa de 2% após o vencimento.'],
      banco: bancoConfig?.bancoNome || clinicaNome || '',
      codigoBanco: bancoConfig?.banco || '',
      agencia: bancoConfig ? `${bancoConfig.agencia}${bancoConfig.agenciaDigito ? '-' + bancoConfig.agenciaDigito : ''}` : '',
      conta: bancoConfig ? `${bancoConfig.conta}-${bancoConfig.contaDigito}` : '',
      carteira: bancoConfig?.carteira || '',
      convenio: bancoConfig?.convenio || '',
      codigoCedente: bancoConfig?.codigoCedente || ''
    };
    imprimirBoleto(dadosBoleto);
  };
  const handlePrintSimples = () => {
    const valorFormatado = formatarMoeda(parseFloat(formData.valor));
    const dataFormatada = new Date(formData.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
    const printContent = '<!DOCTYPE html><html><head><title>Cobrança</title>' + '<sty' + 'le>' + 'body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }' + '.header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }' + '.header h1 { margin: 0; color: #333; }' + '.info-box { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }' + '.info-row { display: flex; justify-content: space-between; margin-bottom: 10px; }' + '.info-label { color: #666; } .info-value { font-weight: bold; }' + '.valor { font-size: 32px; text-align: center; color: #0d9488; margin: 30px 0; }' + '.pix-box { border: 2px dashed #ccc; padding: 20px; text-align: center; margin: 20px 0; }' + '.pix-code { font-family: monospace; font-size: 10px; word-break: break-all; background: #fff; padding: 10px; border: 1px solid #ddd; margin-top: 10px; }' + '.footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }' + '</sty' + 'le></head><body>' + '<div class="header"><h1>🏥 Cobrança</h1><p>' + clinicaNome + '</p></div>' + '<div class="info-box">' + '<div class="info-row"><span class="info-label">Paciente:</span><span class="info-value">' + pacienteNome + '</span></div>' + '<div class="info-row"><span class="info-label">CPF:</span><span class="info-value">' + (pacienteCpf || 'N/A') + '</span></div>' + '<div class="info-row"><span class="info-label">Vencimento:</span><span class="info-value">' + dataFormatada + '</span></div>' + '<div class="info-row"><span class="info-label">Documento:</span><span class="info-value">' + numeroDocumento + '</span></div>' + (formData.observacoes ? '<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">' + formData.observacoes + '</span></div>' : '') + '</div>' + '<div class="valor">' + valorFormatado + '</div>' + '<div class="pix-box"><strong>📱 Código PIX Copia e Cola</strong><div class="pix-code">' + pixCode + '</div></div>' + '<div class="footer"><p>Gerado em ' + new Date().toLocaleString('pt-BR') + '</p></div>' + '</body></html>';
    // ⭐ Abre preview antes de salvar
    import('../utils/pdfGenerator').then(({
      previewDocumentoPDF
    }) => {
      const nomeArquivo = `Comprovante_${numeroDocumento}_${(pacienteNome || 'Paciente').replace(/\s+/g, '_')}.pdf`;
      previewDocumentoPDF(printContent, {
        fileName: nomeArquivo
      });
    });
  };
  // ⭐ Abre modal de telefone ou envia direto
  const handleClickWhatsApp = () => {
    if (!pacienteTelefone) {
      setManualPhone('');
      setShowPhoneModal(true);
      return;
    }
    enviarWhatsApp(pacienteTelefone);
  };
  // ⭐ Confirma envio com telefone manual
  const handleConfirmPhoneSend = () => {
    const phoneClean = manualPhone.replace(/\D/g, '');
    if (phoneClean.length < 10) {
      showError('Erro', 'Informe um telefone válido com DDD (mínimo 10 dígitos)');
      return;
    }
    setShowPhoneModal(false);
    // ⭐ Salva o telefone digitado no cadastro do paciente
    if (pacienteId && manualPhone) {
      const phoneToSave = manualPhone.replace(/\D/g, '');
      fetch(`${API_BASE_URL}/api/pacientes/${pacienteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          telefone: phoneToSave
        })
      }).then((res) => {
        if (res.ok) {
          setPacienteTelefone(phoneToSave);
          console.log('✅ Telefone salvo no cadastro do paciente:', phoneToSave);
        }
      }).catch((err) => console.error('Erro ao salvar telefone:', err));
    }
    enviarWhatsApp(manualPhone);
  };
  const enviarWhatsApp = async (telefoneParaEnviar: string) => {
    setEnviandoWhatsApp(true);
    try {
      const configUrl = `${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`;
      const response = await fetch(configUrl);
      if (!response.ok) throw new Error('WhatsApp não configurado');
      const config = await response.json();
      if (!config.serverUrl || !config.sessionName) throw new Error('WhatsApp não configurado corretamente.');
      // ⭐ FIX: formatarTelefoneWhatsApp retorna objeto {numero, dddAdicionado}, extrair .numero
      const telefoneResult = formatarTelefoneWhatsApp(telefoneParaEnviar);
      const telefone = telefoneResult.numero;
      const valorFormatado = formatarMoeda(parseFloat(formData.valor));
      const dataFormatada = new Date(formData.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
      let mensagem = `Olá ${pacienteNome}! 👋\n\n📋 *Cobrança - ${numeroDocumento}*\n\n💰 Valor: *${valorFormatado}*\n📅 Vencimento: *${dataFormatada}*\n`;
      if (formData.formaPagamento === 'pix') {
        mensagem += `\n*Código PIX Copia e Cola:*\n\`\`\`\n${pixCode}\n\`\`\`\n`;
      } else {
        mensagem += `\n*Linha Digitável do Boleto:*\n\`\`\`\n${linhaDigitavel}\n\`\`\`\n`;
      }
      mensagem += `\nPor favor, envie o comprovante após o pagamento.\nObrigado!`;
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
          pacienteNome
        })
      });
      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao enviar mensagem');
      }
      try {
        const pdfBase64 = gerarPDFBoleto(parseFloat(formData.valor), formData.dataVencimento, numeroDocumento, pacienteNome, pacienteCpf, pacienteEndereco, pacienteCidade, pacienteUf, clinicaNome, clinicaCnpj, pixCode, linhaDigitavel, formData.formaPagamento, formData.observacoes, bancoConfig);
        const nomeArquivo = `Cobranca_${numeroDocumento}_${(pacienteNome || 'Paciente').replace(/\s+/g, '_')}.pdf`;
        const pdfResult = await fetch(`${API_BASE_URL}/api/whatsapp/send-file`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverUrl: config.serverUrl,
            sessionName: config.sessionName,
            number: telefone,
            clinicaId,
            file: pdfBase64,
            filename: nomeArquivo,
            mimetype: 'application/pdf',
            caption: `📋 Cobrança ${numeroDocumento} - ${valorFormatado}`
          })
        });
        if (pdfResult.ok) {
          success('Enviado!', 'Cobrança + PDF enviados via WhatsApp!');
        } else {
          success('Enviado', 'Cobrança enviada via WhatsApp (sem PDF anexo)');
        }
      } catch (pdfErr: any) {
        success('Enviado', 'Cobrança enviada via WhatsApp!');
      }
    } catch (err: any) {
      console.error('Erro ao enviar WhatsApp:', err);
      showError('Erro ao enviar', err.message || 'Erro desconhecido');
    } finally {
      setEnviandoWhatsApp(false);
    }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title={boletoExistente ? 'Detalhes da Cobrança' : 'Nova Cobrança'} size="large" footer={step === 'form' ? <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleNext}>Continuar</Button>
          </> : <>
            {!boletoExistente && <Button variant="ghost" onClick={() => setStep('form')}>
                Voltar
              </Button>}
            <Button variant="outline" onClick={handleClickWhatsApp} disabled={enviandoWhatsApp}>
          
              {enviandoWhatsApp ? <>
                  <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </> : <>
                  <SendIcon className="w-4 h-4 mr-2" />
                  WhatsApp
                </>}
            </Button>
            {!boletoExistente && <Button onClick={handleSave} disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar Cobrança'}
              </Button>}
            {boletoExistente && <Button onClick={onClose}>Fechar</Button>}
          </>}>
      
      <div className="space-y-6">
        {step === 'form' ? <div className="space-y-4">
            {semBancoConfigurado && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      Nenhuma conta bancária configurada
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Configure uma conta bancária para gerar boletos com seus
                      dados reais.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowBancoConfigModal(true)} className="ml-2 whitespace-nowrap">
                
                    Configurar Agora
                  </Button>
                </div>
              </div>}
            {bancoConfig && <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex items-center gap-2">
                <BanknoteIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-teal-800">
                    {bancoConfig.bancoNome} • Ag. {bancoConfig.agencia}
                    {bancoConfig.agenciaDigito ? `-${bancoConfig.agenciaDigito}` : ''}{' '}
                    / CC {bancoConfig.conta}-{bancoConfig.contaDigito}
                  </p>
                  <p className="text-xs text-teal-700">
                    Cedente: {bancoConfig.nomeCedente} • CNPJ:{' '}
                    {bancoConfig.cnpjCedente}
                  </p>
                </div>
              </div>}
            <PacienteBuscaSelectAPI clinicaId={clinicaId} value={pacienteId} onChange={handlePacienteChange} label="Paciente" required allowQuickCreate={false} />
          

            <div className="grid grid-cols-2 gap-4">
              <Input label="Valor (R$)" type="number" value={formData.valor} onChange={(e) => setFormData({
            ...formData,
            valor: e.target.value
          })} placeholder="0.00" />
            

              <Input label="Data de Vencimento" type="date" value={formData.dataVencimento} onChange={(e) => setFormData({
            ...formData,
            dataVencimento: e.target.value
          })} />
            
            </div>
            <Select label="Forma de Pagamento" value={formData.formaPagamento} onChange={(e) => setFormData({
          ...formData,
          formaPagamento: e.target.value
        })} options={[{
          value: 'pix',
          label: '📱 PIX (Instantâneo)'
        }, {
          value: 'boleto',
          label: '📄 Boleto Bancário'
        }, {
          value: 'cartao',
          label: '💳 Cartão de Crédito'
        }]} />
          

            <Input label="Observações / Descrição" value={formData.observacoes} onChange={(e) => setFormData({
          ...formData,
          observacoes: e.target.value
        })} placeholder="Ex: Consulta dermatológica + Procedimento" />
          

            {pacienteId && <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium text-gray-700 mb-1">
                  Dados do Paciente:
                </p>
                <p className="text-gray-600">
                  CPF: {pacienteCpf || 'Não informado'}
                </p>
                <p className="text-gray-600">
                  Telefone: {pacienteTelefone || 'Não informado'}
                </p>
              </div>}
          </div> : <div className="space-y-6">
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 p-6 rounded-xl border border-teal-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-teal-600 font-semibold uppercase tracking-wide">
                    Documento
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {numeroDocumento}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-teal-600 font-semibold uppercase tracking-wide">
                    Vencimento
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {new Date(formData.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-1">Valor Total</p>
                <p className="text-4xl font-bold text-teal-700">
                  {formatarMoeda(parseFloat(formData.valor))}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600 flex-wrap">
                <span className="bg-white px-3 py-1 rounded-full border shadow-sm">
                  {pacienteNome}
                </span>
                {pacienteCpf && <span className="bg-white px-3 py-1 rounded-full border shadow-sm">
                    CPF: {pacienteCpf}
                  </span>}
              </div>
              {bancoConfig && <div className="mt-3 text-center">
                  <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                    {bancoConfig.bancoNome} • Ag. {bancoConfig.agencia} / CC{' '}
                    {bancoConfig.conta}-{bancoConfig.contaDigito}
                  </span>
                </div>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-xl p-4 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                    <QrCodeIcon className="w-5 h-5 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">PIX</h3>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg mb-3">
                  <p className="text-xs text-gray-500 mb-1">
                    Código Copia e Cola
                  </p>
                  <div className="flex items-center gap-2">
                    <input type="text" value={pixCode} readOnly className="flex-1 text-xs bg-white border rounded px-2 py-1.5 font-mono truncate" />
                  

                    <Button size="sm" variant="outline" onClick={() => handleCopyCode(pixCode, 'PIX')}>
                    
                      {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                {qrCodeDataUrl && <div className="flex justify-center my-3">
                    <img src={qrCodeDataUrl} alt="QR Code PIX" className="w-48 h-48 border-2 border-gray-200 rounded-lg" />
                
                  </div>}
                <Button variant="secondary" className="w-full" onClick={handlePrintSimples}>
                
                  <PrinterIcon className="w-4 h-4 mr-2" />
                  Imprimir Comprovante
                </Button>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BanknoteIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Boleto</h3>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg mb-3">
                  <p className="text-xs text-gray-500 mb-1">Linha Digitável</p>
                  <div className="flex items-center gap-2">
                    <input type="text" value={linhaDigitavel} readOnly className="flex-1 text-xs bg-white border rounded px-2 py-1.5 font-mono truncate" />
                  

                    <Button size="sm" variant="outline" onClick={() => handleCopyCode(linhaDigitavel, 'Boleto')}>
                    
                      {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <Button variant="secondary" className="w-full" onClick={handlePrintBoleto}>
                
                  <FileTextIcon className="w-4 h-4 mr-2" />
                  Imprimir Boleto
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button type="button" onClick={handlePrintBoleto} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex flex-col items-center min-w-[200px]">
              
                <FileTextIcon className="w-6 h-6 text-blue-600 mb-2" />
                <p className="text-sm font-medium">Boleto Completo</p>
                <p className="text-xs text-gray-500">Com código de barras</p>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button type="button" onClick={handleClickWhatsApp} className="p-4 border border-gray-200 rounded-lg hover:bg-green-50 transition-colors flex flex-col items-center">
              
                <SendIcon className="w-6 h-6 text-green-600 mb-2" />
                <p className="text-sm font-medium">Enviar WhatsApp</p>
                <p className="text-xs text-gray-500">
                  {pacienteTelefone || 'Digitar telefone'}
                </p>
              </button>
            </div>
          </div>}
      </div>

      {/* ⭐ Modal para digitar telefone manualmente */}
      {showPhoneModal && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <SendIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Enviar via WhatsApp
                </h3>
                <p className="text-xs text-gray-500">
                  {pacienteNome ? `Paciente: ${pacienteNome}` : 'Informe o telefone'}
                </p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone com DDD
              </label>
              <input type="tel" value={manualPhone} onChange={(e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 7) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;else if (v.length > 0) v = `(${v}`;
            setManualPhone(v);
          }} placeholder="(11) 99999-9999" className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" autoFocus onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirmPhoneSend();
          }} />
            

              <p className="text-xs text-gray-400 mt-1">
                O paciente não possui telefone cadastrado. Digite o número para
                enviar.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setShowPhoneModal(false)}>
              
                Cancelar
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleConfirmPhoneSend}>
              
                <SendIcon className="w-4 h-4 mr-2" />
                Enviar
              </Button>
            </div>
          </div>
        </div>}

      {/* Modal de Configuração Bancária */}
      {showBancoConfigModal && <Modal isOpen={showBancoConfigModal} onClose={() => setShowBancoConfigModal(false)} title="Configurar Conta Bancária" size="large">
        
          <BancoConfigForm clinicaId={clinicaId} onSave={async () => {
        setShowBancoConfigModal(false);
        // Recarrega configuração bancária
        setCarregandoBanco(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/configuracoes-banco?clinicaId=${clinicaId}`);
          if (response.ok) {
            const configs = await response.json();
            const ativa = configs.find((c: any) => c.ativo === 1 || c.ativo === true);
            if (ativa) {
              setBancoConfig(ativa);
              setSemBancoConfigurado(false);
              setClinicaNome(ativa.nomeCedente || clinicaNome);
              setClinicaCnpj(ativa.cnpjCedente || clinicaCnpj);
              success('Sucesso', 'Configuração bancária carregada!');
            }
          }
        } catch (err) {
          console.error('Erro ao recarregar config bancária:', err);
        } finally {
          setCarregandoBanco(false);
        }
      }} />
        
        </Modal>}
    </Modal>;
}