import React, { useEffect, useState, useRef, Component } from 'react';
import { Modal } from './ui/Modal';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Paciente } from '../types';
import {
  FileTextIcon,
  BanknoteIcon,
  CheckCircleIcon,
  PrinterIcon,
  Loader2Icon,
  TrashIcon,
  SendIcon,
  XIcon,
  AlertCircleIcon,
  EditIcon,
  UserIcon } from
'lucide-react';
import { useToast } from '../hooks/useToast';
import { formatarTelefoneWhatsApp } from '../services/whatsappMessages';
import { API_BASE_URL } from '../config/api';
import { urlComToken } from '../utils/autenticacaoApi';
import { useWhatsApp } from '../hooks/useWhatsApp';
import jsPDF from 'jspdf';
// ⭐ Ícone SVG do WhatsApp
function WhatsAppIcon({ className }: {className?: string;}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>);

}
interface Recibo {
  id: string;
  numeroControle: number;
  dataEmissao: string;
  dataRecibo: string;
  valor: number;
  pacienteNome: string;
  medico: string;
  quantiaSupra: string;
  historico: string;
}
interface Profissional {
  id: string;
  nome: string;
  tipo: string;
  crm?: string;
  uf?: string;
}
interface ReciboModalProps {
  isOpen: boolean;
  onClose: () => void;
  paciente?: Paciente;
  onOpenBoleto?: () => void;
  clinicaId?: string;
}
function valorPorExtenso(valor: number): string {
  if (!valor || valor <= 0) return '';
  const unidades = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove'];

  const especiais = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove'];

  const dezenas = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa'];

  const centenas = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos'];

  const parteInteira = Math.floor(valor);
  const centavos = Math.round((valor - parteInteira) * 100);
  function converterGrupo(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    let resultado = '';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    if (c > 0) {
      resultado += centenas[c];
      if (resto > 0) resultado += ' e ';
    }
    if (resto >= 10 && resto <= 19) {
      resultado += especiais[resto - 10];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d > 0) {
        resultado += dezenas[d];
        if (u > 0) resultado += ' e ';
      }
      if (u > 0) resultado += unidades[u];
    }
    return resultado;
  }
  let texto = '';
  if (parteInteira === 0) {
    texto = 'zero reais';
  } else if (parteInteira >= 1000) {
    const milhares = Math.floor(parteInteira / 1000);
    const resto = parteInteira % 1000;
    texto = milhares === 1 ? 'mil' : converterGrupo(milhares) + ' mil';
    if (resto > 0) {
      texto += (resto < 100 ? ' e ' : ' ') + converterGrupo(resto);
    }
    texto += parteInteira === 1 ? ' real' : ' reais';
  } else {
    texto =
    converterGrupo(parteInteira) + (parteInteira === 1 ? ' real' : ' reais');
  }
  if (centavos > 0) {
    texto +=
    ' e ' +
    converterGrupo(centavos) + (
    centavos === 1 ? ' centavo' : ' centavos');
  }
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
// Converte o logotipo da clínica em PNG base64, único formato que o jsPDF
// aceita com segurança. Retorna null quando não há logo ou a imagem falha,
// para o documento nunca ficar sem cabeçalho.
async function carregarLogoDataUrl(
logoUrl?: string)
: Promise<{
  dataUrl: string;
  largura: number;
  altura: number;
} | null> {
  if (!logoUrl) return null;
  const src = logoUrl.startsWith('data:') ?
  logoUrl :
  urlComToken(`${API_BASE_URL}${logoUrl}`); // crossOrigin anônimo não leva cookie
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('logo não carregou'));
      el.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) return null;
    ctx.drawImage(img, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      largura: canvas.width,
      altura: canvas.height
    };
  } catch {
    return null;
  }
}
// ⭐ Data por extenso: "Osasco, 6 de MARÇO de 2026"
function dataPorExtenso(dataStr: string, cidade?: string): string {
  const meses = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO'];

  // A data pode vir com hora anexada ("2026-08-14 00:00:00" / ISO) ou vazia.
  // Sem normalizar, o documento saía com "NaN de undefined de NaN".
  const somenteData = String(dataStr || '').
  trim().
  split('T')[0].
  split(' ')[0];
  const cidadeStr = cidade || '';
  const data = somenteData ? new Date(somenteData + 'T12:00:00') : null;
  if (!data || isNaN(data.getTime())) return cidadeStr;
  const dia = data.getDate();
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();
  return cidadeStr ?
  `${cidadeStr}, ${dia} de ${mes} de ${ano}` :
  `${dia} de ${mes} de ${ano}`;
}
// ⭐⭐⭐ NOVO: HTML do recibo seguindo o modelo da imagem (2 vias)
function gerarHTMLRecibo(
recibo: Recibo,
clinicaNome: string,
clinicaInfo?: {
  cnpj?: string;
  crm?: string;
  endereco?: string;
  telefone?: string;
  cidade?: string;
  sigla?: string;
},
pacienteInfo?: {
  cpf?: string;
  endereco?: string;
  email?: string;
  codigo?: string;
},
profissionalNome?: string)
: string {
  const valorFormatado = recibo.valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const numControle = String(recibo.numeroControle).padStart(6, '0');
  const quantiaTexto = recibo.quantiaSupra || valorPorExtenso(recibo.valor);
  const sigla = clinicaInfo?.sigla || clinicaNome.substring(0, 4).toUpperCase();
  const cnpj = clinicaInfo?.cnpj || '';
  const crm = clinicaInfo?.crm || '';
  const endereco = clinicaInfo?.endereco || '';
  const telefone = clinicaInfo?.telefone || '';
  const cidade = clinicaInfo?.cidade || '';
  const cpfPaciente = pacienteInfo?.cpf || '';
  const enderecoPaciente = pacienteInfo?.endereco || '';
  const emailPaciente = pacienteInfo?.email || '';
  const codigoPaciente = pacienteInfo?.codigo || '';
  const medicoNome = profissionalNome || recibo.medico || '';
  const dataExtenso = dataPorExtenso(recibo.dataRecibo, cidade);
  const gerarVia = (via: string) => `
    <div class="via">
      <div class="via-label">${via}</div>
      <div class="header-row">
        <div class="sigla">${sigla}</div>
        <div class="clinica-nome">${clinicaNome}</div>
      </div>
      <div class="info-row">
        <span>${cnpj ? 'CNPJ: ' + cnpj : ''}</span>
        <span class="right">${crm ? 'CRM: ' + crm : ''}</span>
      </div>
      ${endereco ? '<div class="endereco-row">' + endereco + (telefone ? ' - Telefone: ' + telefone : '') + '</div>' : ''}
      <div class="divider"></div>
      <div class="recibo-row">
        <span class="recibo-num">RECIBO: ${numControle}</span>
        <span class="recibo-valor">R$ ${valorFormatado}</span>
      </div>
      <div class="divider"></div>
      <div class="campo-row">
        <span class="campo-label">Recebemos de:</span>
        <span class="campo-valor">${recibo.pacienteNome}</span>
        <span class="right">${cpfPaciente ? 'CPF: ' + cpfPaciente : ''} ${codigoPaciente ? '- Cód:' + codigoPaciente : ''}</span>
      </div>
      ${enderecoPaciente ? '<div class="campo-sub">Endereço: ' + enderecoPaciente + '</div>' : ''}
      ${emailPaciente ? '<div class="campo-sub">Email: ' + emailPaciente + '</div>' : ''}
      <div class="campo-box-row">
        <span class="campo-label-box">A quantia supra de</span>
        <div class="campo-box">${quantiaTexto}</div>
      </div>
      <div class="campo-box-row">
        <span class="campo-label-box">Proveniente de</span>
        <div class="campo-box">${recibo.historico || ''}</div>
      </div>
      <div class="data-extenso">${dataExtenso}</div>
      <div class="assinaturas">
        <div class="assinatura">
          <div class="linha-assinatura"></div>
          <div class="assinatura-label">${medicoNome ? 'Funcionário: ' + medicoNome : 'Funcionário'}</div>
        </div>
        <div class="assinatura">
          <div class="linha-assinatura"></div>
          <div class="assinatura-label">Assinatura do recebedor</div>
        </div>
      </div>
    </div>
  `;
  const cssRecibo = [
  '* { margin: 0; padding: 0; box-sizing: border-box; }',
  'body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; }',
  '.page { max-width: 780px; margin: 10px auto; padding: 0 20px; }',
  '.via { border: 1px solid #ccc; padding: 20px 30px; position: relative; page-break-inside: avoid; }',
  '.via-label { position: absolute; top: 8px; left: 12px; font-size: 11px; color: #c00; font-weight: bold; }',
  '.header-row { display: flex; align-items: baseline; gap: 20px; margin-top: 10px; margin-bottom: 2px; }',
  '.sigla { font-size: 28px; font-weight: 900; color: #222; }',
  '.clinica-nome { font-size: 13px; font-weight: 600; color: #c90; }',
  '.info-row { display: flex; justify-content: space-between; font-size: 11px; color: #333; border-bottom: 2px solid #c90; padding-bottom: 4px; margin-bottom: 4px; }',
  '.info-row .right { text-align: right; }',
  '.endereco-row { font-size: 10px; color: #555; margin-bottom: 8px; }',
  '.divider { border-top: 1px solid #ccc; margin: 8px 0; }',
  '.recibo-row { display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 900; }',
  '.campo-row { display: flex; gap: 8px; align-items: baseline; font-size: 12px; margin: 8px 0 2px; flex-wrap: wrap; }',
  '.campo-label { font-weight: 600; white-space: nowrap; }',
  '.campo-valor { font-weight: 700; font-size: 13px; }',
  '.campo-row .right { margin-left: auto; color: #c00; font-weight: 700; font-size: 11px; }',
  '.campo-sub { font-size: 10px; color: #555; margin-left: 4px; margin-bottom: 2px; }',
  '.campo-box-row { display: flex; align-items: center; gap: 10px; margin: 10px 0; }',
  '.campo-label-box { font-size: 11px; font-weight: 600; white-space: nowrap; min-width: 110px; }',
  '.campo-box { flex: 1; border: 1px solid #999; padding: 6px 10px; min-height: 28px; font-size: 12px; }',
  '.data-extenso { text-align: right; font-size: 11px; margin: 16px 0 20px; }',
  '.assinaturas { display: flex; justify-content: space-between; gap: 60px; margin-top: 30px; }',
  '.assinatura { flex: 1; text-align: center; }',
  '.linha-assinatura { border-top: 1px solid #333; margin-bottom: 4px; }',
  '.assinatura-label { font-size: 10px; color: #555; }',
  '.corte { border-top: 1.5px dashed #999; margin: 12px 0; position: relative; }',
  '.corte::before { content: "\\2702  Corte aqui"; position: absolute; top: -8px; left: 10px; background: #fff; padding: 0 6px; font-size: 9px; color: #999; }',
  '@media print { body { margin: 0; } .page { margin: 0; max-width: 100%; padding: 5px 15px; } }'].
  join('\n');
  return (
    '<!DOCTYPE html>' +
    '<html lang="pt-BR">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<title>Recibo N\u00BA ' +
    numControle +
    '</title>' +
    '<sty' +
    'le>' +
    cssRecibo +
    '</sty' +
    'le>' +
    '</head>' +
    '<body>' +
    '<div class="page">' +
    gerarVia('1\u00AA Via') +
    '<div class="corte"></div>' +
    gerarVia('2\u00AA Via') +
    '</div>' +
    '<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }<\/script>' +
    '</body>' +
    '</html>');

}
// Corta um texto de linha única na largura disponível. Sem isso, nomes,
// endereços e históricos longos passavam por cima do campo vizinho ou saíam
// da borda da via.
function textoCabido(doc: jsPDF, texto: string, larguraMax: number): string {
  const t = String(texto || '');
  if (!t) return '';
  if (doc.getTextWidth(t) <= larguraMax) return t;
  let corte = t;
  while (corte.length > 1 && doc.getTextWidth(corte + '…') > larguraMax) {
    corte = corte.slice(0, -1);
  }
  return corte + '…';
}
// Desenha o logotipo da clínica no canto do recibo. Sem logo cadastrado,
// mantém a sigla anterior para o cabeçalho nunca sair vazio.
function desenharMarca(
doc: jsPDF,
logo:
{
  dataUrl: string;
  largura: number;
  altura: number;
} |
null |
undefined,
sigla: string,
boxX: number,
y: number)
: {
  largura: number;
  altura: number;
} {
  if (logo) {
    const alturaMax = 11;
    const larguraMax = 26;
    const proporcao = logo.largura / logo.altura || 1;
    let altura = alturaMax;
    let largura = altura * proporcao;
    if (largura > larguraMax) {
      largura = larguraMax;
      altura = largura / proporcao;
    }
    // Topo do logo alinhado ao topo do bloco de identificação da clínica
    doc.addImage(logo.dataUrl, 'PNG', boxX + 5, y - 4, largura, altura);
    return {
      largura,
      altura
    };
  }
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text(sigla, boxX + 5, y + 2);
  return {
    largura: 26,
    altura: 8
  };
}
// ⭐ Abre WhatsApp via wa.me (fallback quando WAHA falha)
function abrirWhatsAppDireto(telefone: string, mensagem: string) {
  const telLimpo = telefone.replace(/\D/g, '');
  const tel = telLimpo.startsWith('55') ? telLimpo : '55' + telLimpo;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank');
}
// ⭐⭐⭐ Gera PDF do recibo como base64 (para envio via WhatsApp) ⭐⭐⭐
function gerarPDFReciboBase64(
recibo: Recibo,
clinicaNome: string,
clinicaInfo?: {
  cnpj?: string;
  crm?: string;
  endereco?: string;
  telefone?: string;
  cidade?: string;
  sigla?: string;
},
pacienteInfo?: {
  cpf?: string;
  endereco?: string;
  email?: string;
  codigo?: string;
},
profissionalNome?: string,
logo?: {
  dataUrl: string;
  largura: number;
  altura: number;
} | null)
: string {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const marginLeft = 15;
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const valorFormatado =
  'R$ ' +
  recibo.valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const numControle = String(recibo.numeroControle).padStart(6, '0');
  const quantiaTexto = recibo.quantiaSupra || valorPorExtenso(recibo.valor);
  const sigla = clinicaInfo?.sigla || clinicaNome.substring(0, 4).toUpperCase();
  const cnpj = clinicaInfo?.cnpj || '';
  const crm = clinicaInfo?.crm || '';
  const endereco = clinicaInfo?.endereco || '';
  const telefone = clinicaInfo?.telefone || '';
  const cidade = clinicaInfo?.cidade || '';
  const cpfPaciente = pacienteInfo?.cpf || '';
  const enderecoPaciente = pacienteInfo?.endereco || '';
  const emailPaciente = pacienteInfo?.email || '';
  const codigoPaciente = pacienteInfo?.codigo || '';
  const medicoNome = profissionalNome || recibo.medico || '';
  const dataExtenso = dataPorExtenso(recibo.dataRecibo, cidade);
  function desenharVia(startY: number, viaLabel: string) {
    let y = startY;
    const boxX = marginLeft;
    const boxWidth = contentWidth;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    const viaHeight = 120;
    doc.rect(boxX, y, boxWidth, viaHeight);
    doc.setFontSize(8);
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(viaLabel, boxX + 3, y + 5);
    y += 10;
    const marca = desenharMarca(doc, logo, sigla, boxX, y);
    doc.setFontSize(10);
    doc.setTextColor(180, 140, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(clinicaNome, boxX + 9 + marca.largura, y - 4 + marca.altura / 2 + 1);
    y += Math.max(7, marca.altura + 1);
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    if (cnpj) doc.text('CNPJ: ' + cnpj, boxX + 5, y);
    if (crm)
    doc.text('CRM: ' + crm, boxX + boxWidth - 5, y, {
      align: 'right'
    });
    y += 2;
    doc.setDrawColor(200, 160, 0);
    doc.setLineWidth(0.8);
    doc.line(boxX + 3, y, boxX + boxWidth - 3, y);
    y += 4;
    if (endereco) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(
        endereco + (telefone ? ' - Telefone: ' + telefone : ''),
        boxX + 5,
        y
      );
      y += 4;
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(boxX + 3, y, boxX + boxWidth - 3, y);
    y += 5;
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO: ' + numControle, boxX + 5, y);
    doc.text(valorFormatado, boxX + boxWidth - 5, y, {
      align: 'right'
    });
    y += 3;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(boxX + 3, y, boxX + boxWidth - 3, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Recebemos de:', boxX + 5, y);
    doc.setFontSize(10);
    doc.text(recibo.pacienteNome, boxX + 40, y);
    if (cpfPaciente || codigoPaciente) {
      doc.setFontSize(8);
      doc.setTextColor(200, 0, 0);
      doc.setFont('helvetica', 'bold');
      const cpfText =
      (cpfPaciente ? 'CPF: ' + cpfPaciente : '') + (
      codigoPaciente ? ' - Cód:' + codigoPaciente : '');
      doc.text(cpfText, boxX + boxWidth - 5, y, {
        align: 'right'
      });
    }
    y += 4;
    if (enderecoPaciente) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('Endereço: ' + enderecoPaciente, boxX + 10, y);
      y += 3;
    }
    if (emailPaciente) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('Email: ' + emailPaciente, boxX + 10, y);
      y += 3;
    }
    y += 3;
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('A quantia supra de', boxX + 5, y + 4);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.rect(boxX + 40, y, boxWidth - 45, 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(quantiaTexto, boxX + 42, y + 5);
    y += 12;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Proveniente de', boxX + 5, y + 4);
    doc.setDrawColor(150, 150, 150);
    doc.rect(boxX + 40, y, boxWidth - 45, 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(recibo.historico || '', boxX + 42, y + 5);
    y += 14;
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');
    doc.text(dataExtenso, boxX + boxWidth - 5, y, {
      align: 'right'
    });
    y += 12;
    const assinWidth = (boxWidth - 70) / 2;
    const assin1X = boxX + 15;
    const assin2X = boxX + boxWidth - assinWidth - 15;
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.3);
    doc.line(assin1X, y, assin1X + assinWidth, y);
    doc.line(assin2X, y, assin2X + assinWidth, y);
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(
      medicoNome ? 'Funcionário: ' + medicoNome : 'Funcionário',
      assin1X + assinWidth / 2,
      y,
      {
        align: 'center'
      }
    );
    doc.text('Assinatura do recebedor', assin2X + assinWidth / 2, y, {
      align: 'center'
    });
    return startY + viaHeight;
  }
  const endVia1 = desenharVia(10, '1\u00AA Via');
  const corteY = endVia1 + 5;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(marginLeft, corteY, pageWidth - marginRight, corteY);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('\u2702 Corte aqui', marginLeft + 2, corteY - 1);
  desenharVia(corteY + 5, '2\u00AA Via');
  // Retorna como base64 data URL
  return doc.output('datauristring');
}
// ⭐⭐⭐ Gera PDF do recibo com 2 vias usando jsPDF ⭐⭐⭐
function gerarPDFRecibo(
recibo: Recibo,
clinicaNome: string,
clinicaInfo?: {
  cnpj?: string;
  crm?: string;
  endereco?: string;
  telefone?: string;
  cidade?: string;
  sigla?: string;
},
pacienteInfo?: {
  cpf?: string;
  endereco?: string;
  email?: string;
  codigo?: string;
},
profissionalNome?: string,
logo?: {
  dataUrl: string;
  largura: number;
  altura: number;
} | null)
: void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const marginLeft = 15;
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const valorFormatado =
  'R$ ' +
  recibo.valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const numControle = String(recibo.numeroControle).padStart(6, '0');
  const quantiaTexto = recibo.quantiaSupra || valorPorExtenso(recibo.valor);
  const sigla = clinicaInfo?.sigla || clinicaNome.substring(0, 4).toUpperCase();
  const cnpj = clinicaInfo?.cnpj || '';
  const crm = clinicaInfo?.crm || '';
  const endereco = clinicaInfo?.endereco || '';
  const telefone = clinicaInfo?.telefone || '';
  const cidade = clinicaInfo?.cidade || '';
  const cpfPaciente = pacienteInfo?.cpf || '';
  const enderecoPaciente = pacienteInfo?.endereco || '';
  const emailPaciente = pacienteInfo?.email || '';
  const codigoPaciente = pacienteInfo?.codigo || '';
  const medicoNome = profissionalNome || recibo.medico || '';
  const dataExtenso = dataPorExtenso(recibo.dataRecibo, cidade);
  function desenharVia(startY: number, viaLabel: string) {
    let y = startY;
    const boxX = marginLeft;
    const boxWidth = contentWidth;
    // Borda da via
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    const viaHeight = 120;
    doc.rect(boxX, y, boxWidth, viaHeight);
    // Label da via (1ª Via / 2ª Via)
    doc.setFontSize(8);
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(viaLabel, boxX + 3, y + 5);
    y += 10;
    // Logotipo da clínica (ou sigla, quando não houver logo) + nome
    const marca = desenharMarca(doc, logo, sigla, boxX, y);
    doc.setFontSize(10);
    doc.setTextColor(180, 140, 0);
    doc.setFont('helvetica', 'bold');
    // Nome ao lado do logo, alinhado ao seu centro vertical
    const nomeX = boxX + 9 + marca.largura;
    doc.text(
      textoCabido(doc, clinicaNome, boxX + boxWidth - 5 - nomeX),
      nomeX,
      y - 4 + marca.altura / 2 + 1
    );
    // O CNPJ desce abaixo do logo, que antes era sobreposto por ele
    y += Math.max(7, marca.altura + 1);
    // CNPJ e CRM
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    if (cnpj) doc.text('CNPJ: ' + cnpj, boxX + 5, y);
    if (crm)
    doc.text('CRM: ' + crm, boxX + boxWidth - 5, y, {
      align: 'right'
    });
    // Linha dourada
    y += 2;
    doc.setDrawColor(200, 160, 0);
    doc.setLineWidth(0.8);
    doc.line(boxX + 3, y, boxX + boxWidth - 3, y);
    y += 4;
    // Endereço
    if (endereco) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(
        textoCabido(
          doc,
          endereco + (telefone ? ' - Telefone: ' + telefone : ''),
          boxWidth - 10
        ),
        boxX + 5,
        y
      );
      y += 4;
    }
    // Linha divisória
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(boxX + 3, y, boxX + boxWidth - 3, y);
    y += 5;
    // RECIBO: número e valor
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO: ' + numControle, boxX + 5, y);
    doc.text(valorFormatado, boxX + boxWidth - 5, y, {
      align: 'right'
    });
    y += 3;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(boxX + 3, y, boxX + boxWidth - 3, y);
    y += 5;
    // Recebemos de
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Recebemos de:', boxX + 5, y);
    doc.setFontSize(10);
    // Reserva o espaço do CPF/código à direita para não haver sobreposição
    const larguraNome = boxWidth - 45 - (cpfPaciente || codigoPaciente ? 50 : 0);
    doc.text(textoCabido(doc, recibo.pacienteNome, larguraNome), boxX + 40, y);
    // CPF e Código à direita
    if (cpfPaciente || codigoPaciente) {
      doc.setFontSize(8);
      doc.setTextColor(200, 0, 0);
      doc.setFont('helvetica', 'bold');
      const cpfText =
      (cpfPaciente ? 'CPF: ' + cpfPaciente : '') + (
      codigoPaciente ? ' - Cód:' + codigoPaciente : '');
      doc.text(cpfText, boxX + boxWidth - 5, y, {
        align: 'right'
      });
    }
    y += 4;
    // Endereço do paciente
    if (enderecoPaciente) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(
        textoCabido(doc, 'Endereço: ' + enderecoPaciente, boxWidth - 15),
        boxX + 10,
        y
      );
      y += 3;
    }
    // Email
    if (emailPaciente) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(
        textoCabido(doc, 'Email: ' + emailPaciente, boxWidth - 15),
        boxX + 10,
        y
      );
      y += 3;
    }
    y += 3;
    // A quantia supra de (com caixa)
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('A quantia supra de', boxX + 5, y + 4);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.rect(boxX + 40, y, boxWidth - 45, 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(textoCabido(doc, quantiaTexto, boxWidth - 49), boxX + 42, y + 5);
    y += 12;
    // Proveniente de (com caixa)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Proveniente de', boxX + 5, y + 4);
    doc.setDrawColor(150, 150, 150);
    doc.rect(boxX + 40, y, boxWidth - 45, 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      textoCabido(doc, recibo.historico || '', boxWidth - 49),
      boxX + 42,
      y + 5
    );
    y += 14;
    // Data por extenso
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');
    doc.text(dataExtenso, boxX + boxWidth - 5, y, {
      align: 'right'
    });
    y += 12;
    // Assinaturas
    const assinWidth = (boxWidth - 70) / 2;
    const assin1X = boxX + 15;
    const assin2X = boxX + boxWidth - assinWidth - 15;
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.3);
    doc.line(assin1X, y, assin1X + assinWidth, y);
    doc.line(assin2X, y, assin2X + assinWidth, y);
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(
      medicoNome ? 'Funcionário: ' + medicoNome : 'Funcionário',
      assin1X + assinWidth / 2,
      y,
      {
        align: 'center'
      }
    );
    doc.text('Assinatura do recebedor', assin2X + assinWidth / 2, y, {
      align: 'center'
    });
    return startY + viaHeight;
  }
  // Desenha 1ª Via
  const endVia1 = desenharVia(10, '1\u00AA Via');
  // Linha de corte
  const corteY = endVia1 + 5;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(marginLeft, corteY, pageWidth - marginRight, corteY);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('\u2702 Corte aqui', marginLeft + 2, corteY - 1);
  // Desenha 2ª Via
  desenharVia(corteY + 5, '2\u00AA Via');
  // ⭐ Abre o PDF em nova aba para visualização e impressão
  const pdfBlobUrl = doc.output('bloburl');
  window.open(pdfBlobUrl as unknown as string, '_blank');
}
export function ReciboModal({
  isOpen,
  onClose,
  paciente,
  onOpenBoleto,
  clinicaId
}: ReciboModalProps) {
  const hoje = new Date().toISOString().split('T')[0];
  const hojeFormatado = new Date().toLocaleDateString('pt-BR');
  const { success, error: showError } = useToast();
  const [dataRecibo, setDataRecibo] = useState(hoje);
  const [valorRecibo, setValorRecibo] = useState('');
  const [medicoId, setMedicoId] = useState('');
  const [quantiaSupra, setQuantiaSupra] = useState('');
  const [historico, setHistorico] = useState('');
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  // ⭐ Recibo do histórico SELECIONADO para imprimir ou alterar. Sem isso, o
  //    formulário só criava novos recibos e um recibo existente não podia ser
  //    corrigido.
  const [reciboSelecionado, setReciboSelecionado] = useState<Recibo | null>(null);
  const [proximoNumero, setProximoNumero] = useState(1);
  const [carregandoRecibos, setCarregandoRecibos] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviandoWhatsAppId, setEnviandoWhatsAppId] = useState<string | null>(
    null
  );
  // ⭐⭐⭐ MODAL DE CONFIRMAÇÃO WHATSAPP (igual ao da agenda) ⭐⭐⭐
  const [whatsappConfirm, setWhatsappConfirm] = useState<{
    isOpen: boolean;
    recibo: Recibo | null;
    mensagem: string;
    telefone: string;
    editandoTelefone: boolean;
    contactInfo: any;
    loadingContact: boolean;
    sending: boolean;
    result: {
      success: boolean;
      message: string;
    } | null;
    isNovoRecibo: boolean; // true = salvar + enviar, false = enviar existente
    isNfse: boolean; // true = NFSe
  }>({
    isOpen: false,
    recibo: null,
    mensagem: '',
    telefone: '',
    editandoTelefone: false,
    contactInfo: null,
    loadingContact: false,
    sending: false,
    result: null,
    isNovoRecibo: false,
    isNfse: false
  });
  const [clinicaNome, setClinicaNome] = useState('');
  const [clinicaInfo, setClinicaInfo] = useState<any>({});
  // ⭐ Estado para profissionais
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregandoProfissionais, setCarregandoProfissionais] = useState(false);
  const profissionaisCarregadosRef = useRef(false);
  // ⭐ Config do WhatsApp (WAHA)
  const [whatsappConfig, setWhatsappConfig] = useState<any>(null);
  // ⭐⭐⭐ USA O MESMO HOOK useWhatsApp DA AGENDA ⭐⭐⭐
  const { sendMessage: whatsappSendMessage } = useWhatsApp(
    whatsappConfig?.serverUrl || '',
    whatsappConfig?.sessionName || ''
  );
  // ⭐⭐⭐ NOVO: Carrega recibos do banco de dados ⭐⭐⭐
  const carregarRecibos = async (cId: string, pId: string) => {
    if (!cId || !pId) return;
    setCarregandoRecibos(true);
    try {
      // 1. Carrega recibos do paciente
      const response = await fetch(
        `${API_BASE_URL}/api/financeiro?clinicaId=${cId}&pacienteId=${pId}`
      );
      if (!response.ok) throw new Error('Erro ao carregar recibos');
      const data = await response.json();
      // Filtra apenas registros do tipo 'recibo'
      const recibosDoDb = (data || []).
      filter((r: any) => r.tipo === 'recibo').
      map((r: any) => {
        // Parse dos dados extras do campo observacoes (JSON)
        let extras: any = {};
        try {
          extras = r.observacoes ? JSON.parse(r.observacoes) : {};
        } catch {
          extras = {
            historico: r.observacoes || ''
          };
        }
        return {
          id: r.id,
          // ⭐ Lê numeroControle da coluna própria, com fallback para o JSON
          numeroControle: r.numeroControle || extras.numeroControle || 0,
          dataEmissao: r.dataPagamento || r.criadoEm?.split('T')[0] || hoje,
          dataRecibo: r.dataVencimento || hoje,
          valor: r.valor || 0,
          pacienteNome: extras.pacienteNome || paciente?.nome || '',
          medico: extras.medicoId || r.formaPagamento || '',
          quantiaSupra: extras.quantiaSupra || '',
          historico: r.descricao || extras.historico || ''
        } as Recibo;
      }).
      sort((a: Recibo, b: Recibo) => b.numeroControle - a.numeroControle);
      setRecibos(recibosDoDb);
      // 2. ⭐⭐⭐ Busca próximo número de controle GLOBAL da clínica (não por paciente)
      try {
        const numResp = await fetch(
          `${API_BASE_URL}/api/financeiro/proximo-numero?clinicaId=${cId}`
        );
        if (numResp.ok) {
          const numData = await numResp.json();
          setProximoNumero(numData.proximoNumero || 1);
          console.log(
            `🔢 [ReciboModal] Próximo número de controle GLOBAL: ${numData.proximoNumero}`,
            `| Colunas no DB: ${numData.colunas?.join(', ')}`,
            `| temNumeroControle: ${numData.temNumeroControle}`,
            `| temUsuarioId: ${numData.temUsuarioId}`
          );
        } else {
          // Fallback: calcula do que tem localmente
          const maxNum = recibosDoDb.reduce(
            (max: number, r: Recibo) => Math.max(max, r.numeroControle),
            0
          );
          setProximoNumero(maxNum + 1);
        }
      } catch (numErr) {
        console.warn(
          '⚠️ [ReciboModal] Erro ao buscar próximo número, usando fallback:',
          numErr
        );
        const maxNum = recibosDoDb.reduce(
          (max: number, r: Recibo) => Math.max(max, r.numeroControle),
          0
        );
        setProximoNumero(maxNum + 1);
      }
      console.log(
        `✅ [ReciboModal] Carregados ${recibosDoDb.length} recibos do banco`
      );
    } catch (err: any) {
      console.error('❌ [ReciboModal] Erro ao carregar recibos:', err);
    } finally {
      setCarregandoRecibos(false);
    }
  };
  // ⭐⭐⭐ NOVO: Salva recibo no banco de dados ⭐⭐⭐
  const salvarReciboNoBanco = async (
  recibo: Recibo,
  cId: string,
  pId: string)
  : Promise<string | null> => {
    try {
      // ⭐ Obtém o usuarioId da sessão para auditoria
      const sessao = localStorage.getItem('sessao');
      const parsed = sessao ? JSON.parse(sessao) : {};
      const usuarioId = parsed.usuario?.id || null;
      const usuarioNome = parsed.usuario?.nome || null;
      const response = await fetch(`${API_BASE_URL}/api/financeiro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId: cId,
          pacienteId: pId,
          usuarioId: usuarioId,
          numeroControle: recibo.numeroControle,
          tipo: 'recibo',
          descricao: recibo.historico || '',
          valor: recibo.valor,
          dataVencimento: recibo.dataRecibo,
          dataPagamento: recibo.dataEmissao,
          status: 'pago',
          formaPagamento: recibo.medico || '',
          observacoes: JSON.stringify({
            numeroControle: recibo.numeroControle,
            medicoId: recibo.medico,
            quantiaSupra: recibo.quantiaSupra,
            pacienteNome: recibo.pacienteNome,
            historico: recibo.historico,
            usuarioId: usuarioId,
            usuarioNome: usuarioNome
          })
        })
      });
      if (!response.ok) throw new Error('Erro ao salvar recibo');
      const result = await response.json();
      console.log(
        `✅ [ReciboModal] Recibo salvo no banco: ${result.id} (numeroControle: ${recibo.numeroControle}, usuarioId: ${usuarioId})`
      );
      return result.id;
    } catch (err: any) {
      console.error('❌ [ReciboModal] Erro ao salvar recibo no banco:', err);
      showError(
        'Erro ao Salvar',
        'O recibo foi criado mas não foi salvo no banco de dados. Pode ser perdido ao reiniciar.'
      );
      return null;
    }
  };
  // ⭐⭐⭐ NOVO: Exclui recibo do banco de dados ⭐⭐⭐
  const excluirReciboDoBanco = async (reciboId: string, cId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/financeiro/${reciboId}?clinicaId=${cId}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) throw new Error('Erro ao excluir recibo');
      console.log(`✅ [ReciboModal] Recibo excluído do banco: ${reciboId}`);
    } catch (err: any) {
      console.error('❌ [ReciboModal] Erro ao excluir recibo do banco:', err);
    }
  };
  // Busca dados da clínica, profissionais e config WhatsApp quando modal abre
  useEffect(() => {
    if (!isOpen) {
      profissionaisCarregadosRef.current = false;
      return;
    }
    const sessao = localStorage.getItem('sessao');
    if (!sessao) return;
    const parsed = JSON.parse(sessao);
    const cNome = parsed.clinicaAtual?.nome || '';
    const cId = clinicaId || parsed.clinicaAtual?.id || '';
    setClinicaNome(cNome);
    setClinicaInfo({
      cnpj: parsed.clinicaAtual?.cnpj || '',
      crm: parsed.clinicaAtual?.crm || '',
      endereco: parsed.clinicaAtual?.endereco || '',
      telefone: parsed.clinicaAtual?.telefone || '',
      cidade: parsed.clinicaAtual?.cidade || '',
      sigla: parsed.clinicaAtual?.sigla || '',
      logoUrl: parsed.clinicaAtual?.logoUrl || ''
    });
    // ⭐⭐⭐ NOVO: Carrega recibos do banco de dados ⭐⭐⭐
    if (cId && paciente?.id) {
      carregarRecibos(cId, paciente.id);
    }
    // ⭐ Carrega config do WhatsApp (WAHA) - igual à agenda
    if (cId) {
      fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${cId}`).
      then((r) => r.ok ? r.json() : null).
      then((data) => {
        if (data) {
          // ⭐ Garante ativo = true (igual à agenda)
          data.ativo = true;
          setWhatsappConfig(data);
          console.log('✅ [ReciboModal] Config WhatsApp carregada:', {
            serverUrl: data.serverUrl,
            sessionName: data.sessionName
          });
        } else {
          console.warn(
            '⚠️ [ReciboModal] Config WhatsApp não encontrada para clinicaId:',
            cId
          );
        }
      }).
      catch((err) => {
        console.error(
          '❌ [ReciboModal] Erro ao carregar config WhatsApp:',
          err
        );
      });
    }
    // ⭐ Carrega profissionais da API
    const operadoraId =
    parsed.clinicaAtual?.operadoraId || parsed.operadoraAtual?.id || '';
    if (operadoraId && !profissionaisCarregadosRef.current) {
      profissionaisCarregadosRef.current = true;
      setCarregandoProfissionais(true);
      fetch(`${API_BASE_URL}/api/usuarios?operadoraId=${operadoraId}`).
      then((res) => res.ok ? res.json() : []).
      then((data) => {
        const profs = (Array.isArray(data) ? data : []).
        filter(
          (u: any) =>
          (u.tipo === 'medico' || u.tipo === 'dentista') &&
          u.ativo !== false
        ).
        map((u: any) => ({
          id: u.id,
          nome: u.nome,
          tipo: u.tipo,
          crm: u.crm,
          uf: u.uf
        }));
        setProfissionais(profs);
        console.log(
          `✅ [ReciboModal] Carregados ${profs.length} profissionais`
        );
      }).
      catch((err) => {
        console.error('❌ [ReciboModal] Erro ao carregar profissionais:', err);
      }).
      finally(() => setCarregandoProfissionais(false));
    }
  }, [isOpen, clinicaId]);
  // Auto-preenche valor por extenso quando valor muda
  useEffect(() => {
    const val = parseFloat(valorRecibo);
    if (!isNaN(val) && val > 0) {
      setQuantiaSupra(valorPorExtenso(val));
    } else {
      setQuantiaSupra('');
    }
  }, [valorRecibo]);
  // ⭐ Busca o nome do profissional selecionado
  const profissionalSelecionado = profissionais.find((p) => p.id === medicoId);
  const nomeProfissional = profissionalSelecionado?.nome || medicoId;
  // ⭐ Monta mensagem do recibo para WhatsApp
  const montarMensagemRecibo = (recibo: Recibo): string => {
    const valorFormatado = recibo.valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
    const dataFormatada = new Date(
      recibo.dataRecibo + 'T12:00:00'
    ).toLocaleDateString('pt-BR');
    const numRecibo = String(recibo.numeroControle).padStart(6, '0');
    const profNome =
    profissionais.find((p) => p.id === recibo.medico)?.nome || recibo.medico;
    let mensagem = `Olá ${paciente?.nome || ''}! 👋\n\n`;
    mensagem += `📄 *RECIBO Nº ${numRecibo}*\n`;
    mensagem += `━━━━━━━━━━━━━━━━━━\n\n`;
    mensagem += `💰 Valor: *${valorFormatado}*\n`;
    mensagem += `📅 Data: *${dataFormatada}*\n`;
    if (profNome) mensagem += `👨‍⚕️ Profissional: *${profNome}*\n`;
    if (recibo.historico) mensagem += `📋 Ref.: ${recibo.historico}\n`;
    mensagem += `\n✅ *${recibo.quantiaSupra || valorPorExtenso(recibo.valor)}*\n`;
    mensagem += `\n━━━━━━━━━━━━━━━━━━\n`;
    mensagem += `🏥 ${clinicaNome}\n`;
    mensagem += `Emitido em ${new Date().toLocaleDateString('pt-BR')}`;
    return mensagem;
  };
  // ⭐⭐⭐ Formata URL da foto do DB para exibição (NÃO busca do WhatsApp) ⭐⭐⭐
  const fotoUrlFormatadaRecibo = (() => {
    if (!paciente?.fotoUrl) return null;
    if (paciente.fotoUrl.startsWith('/uploads')) {
      return `${API_BASE_URL}${paciente.fotoUrl}`;
    }
    return paciente.fotoUrl;
  })();
  // ⭐⭐⭐ ABRE MODAL DE CONFIRMAÇÃO (em vez de enviar direto) ⭐⭐⭐
  const abrirConfirmacaoWhatsApp = (
  recibo: Recibo,
  mensagem: string,
  opts?: {
    isNovoRecibo?: boolean;
    isNfse?: boolean;
  }) =>
  {
    const tel = paciente?.telefone || '';
    setWhatsappConfirm({
      isOpen: true,
      recibo,
      mensagem,
      telefone: tel,
      editandoTelefone: !tel,
      contactInfo: null,
      loadingContact: false,
      sending: false,
      result: null,
      isNovoRecibo: opts?.isNovoRecibo || false,
      isNfse: opts?.isNfse || false
    });
    // ⭐ NÃO busca foto do WhatsApp - usa foto do DB (fotoUrlFormatadaRecibo)
  };
  // ⭐⭐⭐ CONFIRMA ENVIO NO MODAL ⭐⭐⭐
  const handleConfirmarEnvioWhatsApp = async () => {
    const { recibo, telefone, mensagem } = whatsappConfirm;
    if (!recibo || !telefone) {
      showError('Erro', 'Informe um número de telefone');
      return;
    }
    // Valida telefone mínimo
    const telLimpo = telefone.replace(/\D/g, '');
    if (telLimpo.length < 8) {
      showError('Erro', 'Informe um número de telefone válido');
      return;
    }
    setWhatsappConfirm((prev) => ({
      ...prev,
      sending: true,
      result: null
    }));
    try {
      const sessao = localStorage.getItem('sessao');
      const parsed = sessao ? JSON.parse(sessao) : {};
      const cId = clinicaId || parsed.clinicaAtual?.id || '';
      const telefoneFormatado = formatarTelefoneWhatsApp(telefone).numero;
      // ⭐⭐⭐ SALVA TELEFONE NO CADASTRO DO PACIENTE SE DIFERENTE ⭐⭐⭐
      if (paciente?.id && telefone !== paciente?.telefone) {
        try {
          console.log(
            '💾 [ReciboModal] Salvando telefone no cadastro do paciente:',
            telefone
          );
          const updateResp = await fetch(
            `${API_BASE_URL}/api/pacientes/${paciente.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                clinicaId: cId,
                telefone: telefone
              })
            }
          );
          if (updateResp.ok) {
            console.log(
              '✅ [ReciboModal] Telefone salvo no cadastro do paciente'
            );
            // Atualiza o objeto paciente local (para próximos envios)
            if (paciente) {
              ;(paciente as any).telefone = telefone;
            }
          } else {
            console.warn(
              '⚠️ [ReciboModal] Não foi possível salvar telefone no cadastro'
            );
          }
        } catch (saveErr) {
          console.warn('⚠️ [ReciboModal] Erro ao salvar telefone:', saveErr);
        }
      }
      // 1️⃣ Envia a mensagem de texto
      const result = await whatsappSendMessage(telefoneFormatado, mensagem, {
        clinicaId: cId,
        pacienteId: paciente?.id || undefined,
        pacienteNome: paciente?.nome || undefined
      });
      if (result?.success) {
        // 2️⃣ Gera e envia o PDF do recibo
        try {
          const profNome =
          profissionais.find((p) => p.id === recibo.medico)?.nome ||
          recibo.medico;
          const logoWhats = await carregarLogoDataUrl(clinicaInfo?.logoUrl);
          const pdfBase64 = gerarPDFReciboBase64(
            recibo,
            clinicaNome,
            clinicaInfo,
            {
              cpf: paciente?.cpf || '',
              endereco: [
              paciente?.logradouro,
              paciente?.numero,
              paciente?.bairro,
              paciente?.cidade,
              paciente?.uf].

              filter(Boolean).
              join(', '),
              email: paciente?.email || '',
              codigo: paciente?.matricula || ''
            },
            profNome,
            logoWhats
          );
          const numControle = String(recibo.numeroControle).padStart(6, '0');
          const nomeArquivo = `Recibo_${numControle}_${paciente?.nome?.replace(/\s+/g, '_') || 'paciente'}.pdf`;
          console.log('📎 [ReciboModal] Enviando PDF do recibo via WhatsApp...');
          const pdfResult = await fetch(
            `${API_BASE_URL}/api/whatsapp/send-file`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                serverUrl: whatsappConfig?.serverUrl,
                sessionName: whatsappConfig?.sessionName,
                number: telefoneFormatado,
                clinicaId: cId,
                file: pdfBase64,
                filename: nomeArquivo,
                mimetype: 'application/pdf',
                caption: `📄 Recibo Nº ${numControle} - ${recibo.valor.toLocaleString(
                  'pt-BR',
                  {
                    style: 'currency',
                    currency: 'BRL'
                  }
                )}`
              })
            }
          );
          if (pdfResult.ok) {
            console.log('✅ [ReciboModal] PDF do recibo enviado com sucesso!');
          } else {
            console.warn(
              '⚠️ [ReciboModal] Falha ao enviar PDF, mas mensagem de texto foi enviada'
            );
          }
        } catch (pdfErr: any) {
          console.warn(
            '⚠️ [ReciboModal] Erro ao enviar PDF:',
            pdfErr.message,
            '- mensagem de texto foi enviada'
          );
        }
        setWhatsappConfirm((prev) => ({
          ...prev,
          sending: false,
          result: {
            success: true,
            message: `✅ Recibo enviado com sucesso para ${paciente?.nome}!\n📄 Mensagem + PDF do recibo`
          }
        }));
        // Fecha automaticamente após 3s
        setTimeout(() => {
          setWhatsappConfirm((prev) => ({
            ...prev,
            isOpen: false
          }));
        }, 3000);
      } else {
        setWhatsappConfirm((prev) => ({
          ...prev,
          sending: false,
          result: {
            success: false,
            message:
            result?.error || 'Falha ao enviar mensagem. Verifique a conexão.'
          }
        }));
      }
    } catch (err: any) {
      setWhatsappConfirm((prev) => ({
        ...prev,
        sending: false,
        result: {
          success: false,
          message: err.message || 'Erro ao enviar mensagem'
        }
      }));
    }
  };
  const formatTelefoneDisplay = (tel: string) => {
    const clean = tel.replace(/\D/g, '');
    if (clean.length === 11)
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    if (clean.length === 13)
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    return tel;
  };
  // ⭐⭐⭐ ENVIO VIA WAHA - CÓPIA EXATA DO PADRÃO DA AGENDA ⭐⭐⭐
  const enviarViaWaha = async (
  telefone: string,
  mensagem: string)
  : Promise<boolean> => {
    const sessao = localStorage.getItem('sessao');
    const parsed = sessao ? JSON.parse(sessao) : {};
    const cId = clinicaId || parsed.clinicaAtual?.id || '';
    // ⭐ Formata telefone EXATAMENTE como a agenda faz: .numero direto
    const telefoneFormatado = formatarTelefoneWhatsApp(telefone).numero;
    console.log('📤 [ReciboModal] Tentando enviar WhatsApp...');
    console.log('   - telefone original:', telefone);
    console.log('   - telefone formatado:', telefoneFormatado);
    console.log('   - serverUrl:', whatsappConfig?.serverUrl || '(vazio)');
    console.log('   - sessionName:', whatsappConfig?.sessionName || '(vazio)');
    // Se não tem config WAHA, fallback wa.me direto
    if (!whatsappConfig?.serverUrl || !whatsappConfig?.sessionName) {
      console.log('⚠️ [ReciboModal] Sem config WAHA, usando wa.me direto');
      abrirWhatsAppDireto(telefone, mensagem);
      return true;
    }
    try {
      // ⭐ Usa o hook useWhatsApp (mesmo da agenda)
      console.log('📤 [ReciboModal] Enviando via hook useWhatsApp...');
      const result = await whatsappSendMessage(telefoneFormatado, mensagem, {
        clinicaId: cId,
        pacienteId: paciente?.id || undefined,
        pacienteNome: paciente?.nome || undefined
      });
      console.log(
        '📤 [ReciboModal] Resultado do envio:',
        JSON.stringify(result)
      );
      if (result?.success) {
        console.log('✅ [ReciboModal] Enviado com sucesso via WAHA');
        return true;
      } else {
        console.error('❌ [ReciboModal] Falha no envio WAHA:', result?.error);
        // Fallback: abre wa.me
        console.log('🔄 [ReciboModal] Fallback para wa.me...');
        abrirWhatsAppDireto(telefone, mensagem);
        return true;
      }
    } catch (err: any) {
      console.error('❌ [ReciboModal] Exceção no envio:', err.message);
      // Fallback: abre wa.me
      console.log('🔄 [ReciboModal] Fallback para wa.me...');
      abrirWhatsAppDireto(telefone, mensagem);
      return true;
    }
  };
  const handleEnviarNovoReciboWhatsApp = async () => {
    if (!valorRecibo || parseFloat(valorRecibo) <= 0) {
      showError('Erro', 'Informe um valor válido para o recibo');
      return;
    }
    const novoRecibo: Recibo = {
      id: `recibo-${Date.now()}`,
      numeroControle: proximoNumero,
      dataEmissao: hoje,
      dataRecibo: dataRecibo,
      valor: parseFloat(valorRecibo),
      pacienteNome: paciente?.nome || '',
      medico: medicoId,
      quantiaSupra: quantiaSupra,
      historico: historico
    };
    // ⭐ Salva no banco de dados ANTES de abrir o modal
    const sessao = localStorage.getItem('sessao');
    const parsed = sessao ? JSON.parse(sessao) : {};
    const cId = clinicaId || parsed.clinicaAtual?.id || '';
    const pId = paciente?.id || '';
    if (cId && pId) {
      const dbId = await salvarReciboNoBanco(novoRecibo, cId, pId);
      if (dbId) {
        novoRecibo.id = dbId;
      }
    }
    setRecibos((prev) => [novoRecibo, ...prev]);
    setProximoNumero((prev) => prev + 1);
    setValorRecibo('');
    setDataRecibo(hoje);
    setMedicoId('');
    setQuantiaSupra('');
    setHistorico('');
    // ⭐⭐⭐ ABRE MODAL DE CONFIRMAÇÃO em vez de enviar direto ⭐⭐⭐
    const mensagem = montarMensagemRecibo(novoRecibo);
    abrirConfirmacaoWhatsApp(novoRecibo, mensagem, {
      isNovoRecibo: true
    });
  };
  // Carrega um recibo do histórico no formulário, para imprimir ou alterar.
  const handleSelecionarRecibo = (recibo: Recibo) => {
    setReciboSelecionado(recibo);
    setDataRecibo(recibo.dataRecibo || hoje);
    setValorRecibo(String(recibo.valor ?? ''));
    setMedicoId(recibo.medico || '');
    setQuantiaSupra(recibo.quantiaSupra || '');
    setHistorico(recibo.historico || '');
  };
  // Volta o formulário ao estado de criação de um novo recibo.
  const handleNovoRecibo = () => {
    setReciboSelecionado(null);
    setDataRecibo(hoje);
    setValorRecibo('');
    setMedicoId('');
    setQuantiaSupra('');
    setHistorico('');
  };
  // Grava as alterações do recibo selecionado, sem criar outro registro.
  const handleAtualizarRecibo = async () => {
    if (!reciboSelecionado) return;
    if (!valorRecibo || parseFloat(valorRecibo) <= 0) {
      showError('Erro', 'Informe um valor válido para o recibo');
      return;
    }
    const atualizado: Recibo = {
      ...reciboSelecionado,
      dataRecibo,
      valor: parseFloat(valorRecibo),
      medico: medicoId,
      quantiaSupra,
      historico
    };
    const sessao = localStorage.getItem('sessao');
    const parsed = sessao ? JSON.parse(sessao) : {};
    const cId = clinicaId || parsed.clinicaAtual?.id || '';
    // Recibos que nunca chegaram ao banco (id local) não têm o que atualizar.
    if (cId && !atualizado.id.startsWith('recibo-')) {
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/financeiro/${atualizado.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId: cId,
              numeroControle: atualizado.numeroControle,
              tipo: 'recibo',
              descricao: atualizado.historico || '',
              valor: atualizado.valor,
              dataVencimento: atualizado.dataRecibo,
              dataPagamento: atualizado.dataEmissao,
              status: 'pago',
              formaPagamento: atualizado.medico || '',
              observacoes: JSON.stringify({
                numeroControle: atualizado.numeroControle,
                medicoId: atualizado.medico,
                quantiaSupra: atualizado.quantiaSupra,
                pacienteNome: atualizado.pacienteNome,
                historico: atualizado.historico,
                usuarioId: parsed.usuario?.id || null,
                usuarioNome: parsed.usuario?.nome || null
              })
            })
          }
        );
        if (!resp.ok) {
          let detalhe = `O servidor recusou a alteração (HTTP ${resp.status}).`;
          try {
            const corpo = await resp.json();
            if (corpo?.error) detalhe = String(corpo.error);
          } catch {

            /* resposta sem JSON */}
          throw new Error(detalhe);
        }
      } catch (err: any) {
        showError('Erro ao alterar', err?.message || 'Tente novamente.');
        return;
      }
    }
    setRecibos((prev) =>
    prev.map((r) => r.id === atualizado.id ? atualizado : r)
    );
    setReciboSelecionado(atualizado);
    success(
      'Recibo alterado',
      `Recibo Nº ${String(atualizado.numeroControle).padStart(6, '0')} atualizado`
    );
  };
  const handleSalvarRecibo = async () => {
    if (!valorRecibo || parseFloat(valorRecibo) <= 0) {
      showError('Erro', 'Informe um valor válido para o recibo');
      return;
    }
    const novoRecibo: Recibo = {
      id: `recibo-${Date.now()}`,
      numeroControle: proximoNumero,
      dataEmissao: hoje,
      dataRecibo: dataRecibo,
      valor: parseFloat(valorRecibo),
      pacienteNome: paciente?.nome || '',
      medico: medicoId,
      quantiaSupra: quantiaSupra,
      historico: historico
    };
    // ⭐⭐⭐ NOVO: Salva no banco de dados ⭐⭐⭐
    const sessao = localStorage.getItem('sessao');
    const parsed = sessao ? JSON.parse(sessao) : {};
    const cId = clinicaId || parsed.clinicaAtual?.id || '';
    const pId = paciente?.id || '';
    if (cId && pId) {
      const dbId = await salvarReciboNoBanco(novoRecibo, cId, pId);
      if (dbId) {
        novoRecibo.id = dbId;
      }
    }
    setRecibos((prev) => [novoRecibo, ...prev]);
    setProximoNumero((prev) => prev + 1);
    // O recibo recém-salvo fica selecionado: imprimir logo após salvar era o
    // passo natural e exigia procurá-lo na lista abaixo.
    setReciboSelecionado(novoRecibo);
    success(
      'Recibo Salvo',
      `Recibo Nº ${String(novoRecibo.numeroControle).padStart(6, '0')} criado e salvo com sucesso`
    );
  };
  const handleImprimirRecibo = async (recibo: Recibo) => {
    const profNome =
    profissionais.find((p) => p.id === recibo.medico)?.nome || recibo.medico;
    // O logotipo precisa virar PNG base64 antes de entrar no PDF
    const logo = await carregarLogoDataUrl(clinicaInfo?.logoUrl);
    gerarPDFRecibo(
      recibo,
      clinicaNome,
      clinicaInfo,
      {
        cpf: paciente?.cpf || '',
        endereco: [
        paciente?.logradouro,
        paciente?.numero,
        paciente?.bairro,
        paciente?.cidade,
        paciente?.uf].

        filter(Boolean).
        join(', '),
        email: paciente?.email || '',
        codigo: paciente?.matricula || ''
      },
      profNome,
      logo
    );
  };
  // ⭐ Enviar recibo via WhatsApp - ABRE MODAL DE CONFIRMAÇÃO
  const handleEnviarWhatsApp = async (recibo: Recibo) => {
    const mensagem = montarMensagemRecibo(recibo);
    abrirConfirmacaoWhatsApp(recibo, mensagem);
  };
  const handleExcluirRecibo = async (id: string) => {
    // ⭐⭐⭐ NOVO: Exclui do banco de dados ⭐⭐⭐
    const sessao = localStorage.getItem('sessao');
    const parsed = sessao ? JSON.parse(sessao) : {};
    const cId = clinicaId || parsed.clinicaAtual?.id || '';
    if (cId && !id.startsWith('recibo-')) {
      // Se o ID não começa com 'recibo-', é um ID do banco
      await excluirReciboDoBanco(id, cId);
    }
    setRecibos((prev) => prev.filter((r) => r.id !== id));
    // O recibo excluído não pode continuar selecionado no formulário.
    if (reciboSelecionado?.id === id) handleNovoRecibo();
    success('Removido', 'Recibo removido com sucesso');
  };
  // ⭐ Envia NFSe via WhatsApp (WAHA com fallback wa.me)
  const handleEnviarNfseWhatsApp = async () => {
    if (!valorRecibo || parseFloat(valorRecibo) <= 0) {
      showError('Erro', 'Informe um valor válido');
      return;
    }
    // ⭐ Removido: não exige mais telefone aqui - o modal permite digitar
    const val = parseFloat(valorRecibo);
    const valorFormatado = val.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
    const dataFormatada = new Date(dataRecibo + 'T12:00:00').toLocaleDateString(
      'pt-BR'
    );
    const profNome =
    profissionais.find((p) => p.id === medicoId)?.nome || medicoId;
    let mensagem = `Olá ${paciente.nome}! 👋\n\n`;
    mensagem += `🧾 *NOTA FISCAL DE SERVIÇO (NFSe)*\n`;
    mensagem += `━━━━━━━━━━━━━━━━━━\n\n`;
    mensagem += `💰 Valor: *${valorFormatado}*\n`;
    mensagem += `📅 Data: *${dataFormatada}*\n`;
    if (profNome) mensagem += `👨‍⚕️ Profissional: *${profNome}*\n`;
    if (historico) mensagem += `📋 Ref.: ${historico}\n`;
    mensagem += `\n✅ *${quantiaSupra || valorPorExtenso(val)}*\n`;
    mensagem += `\n━━━━━━━━━━━━━━━━━━\n`;
    mensagem += `🏥 ${clinicaNome}\n`;
    mensagem += `Emitido em ${new Date().toLocaleDateString('pt-BR')}`;
    // Cria recibo fake para o modal
    const nfseRecibo: Recibo = {
      id: 'nfse-temp',
      numeroControle: 0,
      dataEmissao: hoje,
      dataRecibo: dataRecibo,
      valor: val,
      pacienteNome: paciente.nome,
      medico: medicoId,
      quantiaSupra: quantiaSupra || valorPorExtenso(val),
      historico: historico
    };
    abrirConfirmacaoWhatsApp(nfseRecibo, mensagem, {
      isNfse: true
    });
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recibos" size="large">
      <div className="space-y-6">
        {/* Formulário: novo recibo OU recibo selecionado do histórico */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {reciboSelecionado ?
              `Recibo Nº ${String(reciboSelecionado.numeroControle).padStart(6, '0')} — selecionado` :
              'Novo Recibo'}
            </h3>
            {reciboSelecionado &&
            <div className="flex items-center gap-2">
                <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2 py-1 rounded-full">
                  Alterando um recibo já emitido
                </span>
                <Button variant="secondary" size="sm" onClick={handleNovoRecibo}>
                  Novo Recibo
                </Button>
              </div>
            }
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Input
              label="Nº Controle"
              value={String(
                reciboSelecionado ?
                reciboSelecionado.numeroControle :
                proximoNumero
              ).padStart(6, '0')}
              disabled />
            

            <Input
              label="Data da Emissão"
              value={
              reciboSelecionado?.dataEmissao ?
              new Date(
                reciboSelecionado.dataEmissao + 'T12:00:00'
              ).toLocaleDateString('pt-BR') :
              hojeFormatado
              }
              disabled />
            
            <Input
              label="Data do Recibo"
              type="date"
              value={dataRecibo}
              onChange={(e) => setDataRecibo(e.target.value)} />
            

            <Input
              label="Valor do Recibo (R$)"
              type="number"
              value={valorRecibo}
              onChange={(e) => setValorRecibo(e.target.value)}
              placeholder="0.00" />
            
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input label="Recebemos de" value={paciente?.nome || ''} disabled />
            <Select
              label="Médico"
              value={medicoId}
              onChange={(e) => setMedicoId(e.target.value)}
              options={[
              {
                value: '',
                label: carregandoProfissionais ?
                'Carregando...' :
                'Selecione o médico'
              },
              ...profissionais.map((p) => ({
                value: p.id,
                label: `${p.nome}${p.crm ? ` (CRM: ${p.crm}${p.uf ? '/' + p.uf : ''})` : ''} - ${p.tipo === 'medico' ? 'Médico' : 'Dentista'}`
              }))]
              } />
            
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              A quantia supra
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-sm"
              rows={2}
              value={quantiaSupra}
              onChange={(e) => setQuantiaSupra(e.target.value)}
              placeholder="Preenchido automaticamente ao digitar o valor..." />
            
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Histórico
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-sm"
              rows={2}
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              placeholder="Referente a consulta, procedimento, etc..." />
            
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-gray-100">
            <Button
              variant="secondary"
              onClick={() =>
              showError('Aviso', 'Geração de NFSe em desenvolvimento.')
              }>
              
              <FileTextIcon className="w-4 h-4 mr-2" />
              Gerar NFSe
            </Button>
            <Button
              variant="secondary"
              onClick={handleEnviarNfseWhatsApp}
              disabled={!valorRecibo}
              className="text-green-700 border-green-300 hover:bg-green-50">
              
              <WhatsAppIcon className="w-4 h-4 mr-2" />
              NFSe WhatsApp
            </Button>
            <Button variant="secondary" onClick={onOpenBoleto}>
              <BanknoteIcon className="w-4 h-4 mr-2" />
              Emitir Boleto
            </Button>
            {reciboSelecionado ?
            <>
                <Button
                variant="secondary"
                onClick={() => handleImprimirRecibo(reciboSelecionado)}>
                
                  <FileTextIcon className="w-4 h-4 mr-2" />
                  Imprimir Recibo
                </Button>
                <Button variant="secondary" onClick={handleAtualizarRecibo}>
                  <CheckCircleIcon className="w-4 h-4 mr-2" />
                  Salvar Alterações
                </Button>
              </> :

            <Button variant="secondary" onClick={handleSalvarRecibo}>
                <CheckCircleIcon className="w-4 h-4 mr-2" />
                Salvar Recibo
              </Button>
            }
            <Button
              onClick={handleEnviarNovoReciboWhatsApp}
              disabled={!valorRecibo}
              className="bg-green-600 hover:bg-green-700 text-white">
              
              <WhatsAppIcon className="w-4 h-4 mr-2" />
              Enviar WhatsApp
            </Button>
          </div>
        </Card>

        {/* Tabela de recibos */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Histórico de Recibos
            {recibos.length > 0 &&
            <span className="text-sm font-normal text-gray-500 ml-2">
                ({recibos.length} recibo{recibos.length !== 1 ? 's' : ''})
              </span>
            }
          </h3>

          {carregandoRecibos ?
          <div className="flex items-center justify-center py-8">
              <Loader2Icon className="w-6 h-6 animate-spin text-teal-600 mr-2" />
              <span className="text-gray-500">Carregando recibos...</span>
            </div> :

          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Data
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Nº Controle
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Médico
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recibos.length === 0 ?
                <tr>
                      <td
                    colSpan={5}
                    className="text-center py-8 text-gray-500 border-b border-gray-100">
                    
                        Nenhum recibo encontrado para este paciente.
                      </td>
                    </tr> :

                recibos.map((recibo) => {
                  const profNome =
                  profissionais.find((p) => p.id === recibo.medico)?.
                  nome || recibo.medico;
                  return (
                    <tr
                      key={recibo.id}
                      onClick={() => handleSelecionarRecibo(recibo)}
                      title="Selecionar este recibo para imprimir ou alterar"
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      reciboSelecionado?.id === recibo.id ?
                      'bg-teal-50 ring-1 ring-inset ring-teal-300' :
                      'hover:bg-gray-50'}`
                      }>
                      
                          <td className="py-3 px-4 text-sm text-gray-700">
                            {new Date(
                          recibo.dataRecibo + 'T12:00:00'
                        ).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3 px-4 text-sm font-mono text-gray-700">
                            {String(recibo.numeroControle).padStart(6, '0')}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700">
                            {profNome || '—'}
                          </td>
                          <td className="py-3 px-4 text-sm font-semibold text-teal-700">
                            {recibo.valor.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {/* As ações não devem alterar a seleção da linha */}
                            <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}>
                          
                              <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImprimirRecibo(recibo)}
                            title="Baixar PDF do Recibo">
                            
                                <FileTextIcon className="w-4 h-4" />
                              </Button>
                              {paciente?.telefone &&
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEnviarWhatsApp(recibo)}
                            title="Enviar via WhatsApp"
                            disabled={
                            enviandoWhatsApp &&
                            enviandoWhatsAppId === recibo.id
                            }
                            className="text-green-600 hover:text-green-700 hover:bg-green-50">
                            
                                  {enviandoWhatsApp &&
                            enviandoWhatsAppId === recibo.id ?
                            <Loader2Icon className="w-4 h-4 animate-spin" /> :

                            <WhatsAppIcon className="w-4 h-4" />
                            }
                                </Button>
                          }
                              <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExcluirRecibo(recibo.id)}
                            title="Excluir recibo"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50">
                            
                                <TrashIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>);

                })
                }
                </tbody>
              </table>
            </div>
          }
        </Card>
      </div>

      {/* ⭐⭐⭐ MODAL DE CONFIRMAÇÃO WHATSAPP ⭐⭐⭐ */}
      {whatsappConfirm.isOpen &&
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <WhatsAppIcon className="w-5 h-5 text-green-600" />
                Confirmar Envio WhatsApp
              </h3>
              <button
              onClick={() =>
              setWhatsappConfirm((prev) => ({
                ...prev,
                isOpen: false
              }))
              }
              className="p-1 rounded-full hover:bg-gray-100 transition-colors">
              
                <XIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Resultado do envio */}
              {whatsappConfirm.result &&
            <div
              className={`p-4 rounded-lg border-2 ${whatsappConfirm.result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              
                  <div className="flex items-start gap-3">
                    {whatsappConfirm.result.success ?
                <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" /> :

                <AlertCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                }
                    <div className="flex-1">
                      <p
                    className={`font-semibold ${whatsappConfirm.result.success ? 'text-green-900' : 'text-red-900'}`}>
                    
                        {whatsappConfirm.result.success ?
                    '✅ Mensagem Enviada!' :
                    '❌ Falha no Envio'}
                      </p>
                      <p
                    className={`text-sm mt-1 ${whatsappConfirm.result.success ? 'text-green-700' : 'text-red-700'}`}>
                    
                        {whatsappConfirm.result.message}
                      </p>
                      {whatsappConfirm.result.success &&
                  <p className="text-xs text-green-600 mt-2">
                          Esta janela fechará automaticamente...
                        </p>
                  }
                    </div>
                  </div>
                </div>
            }

              {/* Conteúdo (oculta após sucesso) */}
              {!whatsappConfirm.result &&
            <>
                  {/* Info do contato com foto do DB */}
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    {fotoUrlFormatadaRecibo ?
                <img
                  src={fotoUrlFormatadaRecibo}
                  alt={paciente?.nome}
                  className="w-16 h-16 rounded-full object-cover border-2 border-green-500"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none';
                  }} /> :


                <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white text-xl font-bold">
                          {(paciente?.nome || '').
                    split(' ').
                    slice(0, 2).
                    map((n) => n[0]).
                    join('').
                    toUpperCase()}
                        </span>
                      </div>
                }

                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {paciente?.nome}
                      </p>
                      {/* Telefone editável */}
                      <div className="mt-1">
                        {whatsappConfirm.editandoTelefone ?
                    <div className="flex items-center gap-2">
                            <input
                        type="text"
                        value={whatsappConfirm.telefone}
                        onChange={(e) =>
                        setWhatsappConfirm((prev) => ({
                          ...prev,
                          telefone: e.target.value
                        }))
                        }
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="(11) 99999-0000"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setWhatsappConfirm((prev) => ({
                              ...prev,
                              editandoTelefone: false
                            }));
                          }
                        }} />
                      

                            <button
                        type="button"
                        onClick={() => {
                          setWhatsappConfirm((prev) => ({
                            ...prev,
                            editandoTelefone: false
                          }));
                        }}
                        className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 bg-green-50 rounded">
                        
                              OK
                            </button>
                          </div> :

                    <div className="flex items-center gap-2">
                            {whatsappConfirm.telefone ?
                      <p className="text-sm text-gray-600">
                                {formatTelefoneDisplay(
                          whatsappConfirm.telefone
                        )}
                              </p> :

                      <p className="text-sm text-amber-600 italic">
                                Nenhum telefone — clique no lápis para digitar
                              </p>
                      }
                            <button
                        type="button"
                        onClick={() =>
                        setWhatsappConfirm((prev) => ({
                          ...prev,
                          editandoTelefone: true
                        }))
                        }
                        className="text-gray-400 hover:text-green-600 transition-colors"
                        title="Editar telefone">
                        
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                    }
                        {whatsappConfirm.telefone &&
                    whatsappConfirm.telefone !== (
                    paciente?.telefone || '') &&
                    <p className="text-xs text-blue-600 mt-1">
                              💾 Este número será salvo no cadastro do paciente
                              ao enviar
                            </p>
                    }
                        {!paciente?.telefone && whatsappConfirm.telefone &&
                    <p className="text-xs text-blue-600 mt-1">
                            💾 Este número será salvo no cadastro do paciente
                          </p>
                    }
                      </div>
                      {whatsappConfirm.contactInfo?.isRegistered === false &&
                  <p className="text-xs text-amber-600 mt-1">
                          ⚠️ Número não está no WhatsApp
                        </p>
                  }
                      {whatsappConfirm.contactInfo?.isRegistered === true &&
                  <p className="text-xs text-green-600 mt-1">
                          ✅ Registrado no WhatsApp
                        </p>
                  }
                    </div>
                  </div>

                  {/* Dados do recibo */}
                  {whatsappConfirm.recibo &&
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                      <p className="text-sm font-medium text-teal-900 mb-2">
                        {whatsappConfirm.isNfse ? '🧾 NFSe' : '📄 Recibo'} Nº{' '}
                        {String(whatsappConfirm.recibo.numeroControle).padStart(
                    6,
                    '0'
                  )}
                      </p>
                      <div className="space-y-1 text-sm text-teal-800">
                        <p>
                          <strong>Valor:</strong>{' '}
                          {whatsappConfirm.recibo.valor.toLocaleString(
                      'pt-BR',
                      {
                        style: 'currency',
                        currency: 'BRL'
                      }
                    )}
                        </p>
                        <p>
                          <strong>Data:</strong>{' '}
                          {new Date(
                      whatsappConfirm.recibo.dataRecibo + 'T12:00:00'
                    ).toLocaleDateString('pt-BR')}
                        </p>
                        {whatsappConfirm.recibo.historico &&
                  <p>
                            <strong>Ref.:</strong>{' '}
                            {whatsappConfirm.recibo.historico}
                          </p>
                  }
                      </div>
                    </div>
              }

                  {/* Preview da mensagem */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📝 Mensagem que será enviada:
                    </label>
                    <div className="p-4 bg-white border border-gray-200 rounded-lg whitespace-pre-wrap text-sm text-gray-700 max-h-48 overflow-y-auto">
                      {whatsappConfirm.mensagem}
                    </div>
                  </div>
                </>
            }
            </div>

            {/* Footer com botões */}
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              {whatsappConfirm.result ?
            <Button
              variant="ghost"
              onClick={() =>
              setWhatsappConfirm((prev) => ({
                ...prev,
                isOpen: false
              }))
              }>
              
                  Fechar
                </Button> :

            <>
                  <Button
                variant="ghost"
                onClick={() =>
                setWhatsappConfirm((prev) => ({
                  ...prev,
                  isOpen: false
                }))
                }
                disabled={whatsappConfirm.sending}>
                
                    <XIcon className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button
                onClick={handleConfirmarEnvioWhatsApp}
                disabled={whatsappConfirm.sending}
                className="bg-green-600 hover:bg-green-700 text-white">
                
                    {whatsappConfirm.sending ?
                <>
                        <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </> :

                <>
                        <SendIcon className="w-4 h-4 mr-2" />
                        Enviar Mensagem
                      </>
                }
                  </Button>
                </>
            }
            </div>
          </div>
        </div>
      }
    </Modal>);

}