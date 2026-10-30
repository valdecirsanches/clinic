import React, { useEffect, useState, createElement, Component } from 'react';
import { PlusIcon, FileTextIcon, EyeIcon, EditIcon, PenToolIcon, CheckCircleIcon, UserIcon, CalendarIcon, ClipboardListIcon, AlertCircleIcon, HeartPulseIcon, PillIcon, ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon, ClipboardIcon, PrinterIcon, XIcon, ActivityIcon, StickyNoteIcon, StethoscopeIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PacienteBuscaSelectAPI } from '../components/PacienteBuscaSelectAPI';
import { ProntuarioForm } from '../components/ProntuarioForm';
import { ProntuarioDetalhesModal } from '../components/ProntuarioDetalhesModal';
import { SolicitarAssinaturaButton } from '../components/SolicitarAssinaturaButton';
import { Paciente, Prontuario, Atendimento } from '../types';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/useToast';
import { paraTextoSimples } from '../utils/htmlTexto';
export interface ProntuariosPageProps {
  pacientes?: Paciente[];
  onNavigate?: (page: string) => void;
}
// Cache de telefones de pacientes
const telefonesCache: Record<string, string> = {};
// ⭐ Helper: Verifica se a consulta tem dados clínicos registrados
function atendimentoFrutificou(atendimento: Atendimento): boolean {
  if (atendimento.assinaturaPaciente) return true;
  if (atendimento.status === 'realizada' || atendimento.status === 'compareceu') return true;
  const camposClinicos = [atendimento.queixaPrincipal, atendimento.historico, atendimento.exameFisico, atendimento.diagnostico, atendimento.tratamento, atendimento.prescricoes, (atendimento as any).exames, atendimento.observacoes, atendimento.odontograma];
  return camposClinicos.some((campo) => {
    if (!campo) return false;
    if (typeof campo === 'string' && campo.trim() === '') return false;
    if (typeof campo === 'object' && Object.keys(campo).length === 0) return false;
    if (typeof campo === 'string' && campo === '[]') return false;
    if (typeof campo === 'string' && campo === '{}') return false;
    return true;
  });
}
// Componente para exibir um atendimento individual
function AtendimentoCard({
  atendimento,
  pacienteNome,
  pacienteTelefone,
  clinicaId,
  onEdit,
  onVerDetalhes







}: {atendimento: Atendimento;pacienteNome: string;pacienteTelefone: string;clinicaId: string;onEdit: () => void;onVerDetalhes: () => void;}) {
  const assinado = !!atendimento.assinaturaPaciente;
  const frutificou = atendimentoFrutificou(atendimento);
  const [showResumo, setShowResumo] = useState(false);
  // ⭐ Gera texto do resumo do atendimento
  const gerarResumoTexto = () => {
    const dataFormatada = new Date(atendimento.data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const tipoAtendimento = atendimento.tipo === 'medica' ? 'Médico' : 'Odontológico';
    let texto = `📋 RESUMO DO ATENDIMENTO\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `👤 Paciente: ${pacienteNome}\n`;
    texto += `📅 Data: ${dataFormatada}\n`;
    texto += `👨‍⚕️ Profissional: ${atendimento.profissional || 'Não informado'}\n`;
    texto += `🏥 Tipo: ${tipoAtendimento}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (atendimento.queixaPrincipal) {
      texto += `🩺 QUEIXA PRINCIPAL:\n${atendimento.queixaPrincipal}\n\n`;
    }
    if (atendimento.historico) {
      texto += `📝 HISTÓRIA DA DOENÇA ATUAL:\n${atendimento.historico}\n\n`;
    }
    if (atendimento.exameFisico) {
      let exameFisicoTexto = atendimento.exameFisico;
      try {
        const parsed = JSON.parse(atendimento.exameFisico);
        const partes: string[] = [];
        if (parsed.altura) partes.push(`Altura: ${parsed.altura}m`);
        if (parsed.peso) partes.push(`Peso: ${parsed.peso}kg`);
        if (parsed.imc) partes.push(`IMC: ${parsed.imc}`);
        if (parsed.pressaoArterial) partes.push(`PA: ${parsed.pressaoArterial}`);
        if (parsed.pulso) partes.push(`Pulso: ${parsed.pulso}bpm`);
        if (parsed.observacoesGerais) partes.push(parsed.observacoesGerais);
        if (partes.length > 0) exameFisicoTexto = partes.join(' | ');
      } catch {}
      texto += `🔬 EXAME FÍSICO:\n${exameFisicoTexto}\n\n`;
    }
    if (atendimento.diagnostico) {
      texto += `🎯 DIAGNÓSTICO:\n${atendimento.diagnostico}\n\n`;
    }
    if (atendimento.tratamento) {
      texto += `💊 TRATAMENTO:\n${atendimento.tratamento}\n\n`;
    }
    if (atendimento.prescricoes) {
      texto += `📝 PRESCRIÇÕES:\n${atendimento.prescricoes}\n\n`;
    }
    if ((atendimento as any).exames) {
      let examesTexto = (atendimento as any).exames;
      try {
        const parsed = JSON.parse(examesTexto);
        if (parsed && typeof parsed === 'object') {
          const partes: string[] = [];
          if (parsed.descricao) partes.push(`Descrição: ${parsed.descricao}`);
          if (parsed.pedido) partes.push(`Pedido: ${paraTextoSimples(parsed.pedido)}`);
          if (parsed.justificativa) partes.push(`Justificativa: ${paraTextoSimples(parsed.justificativa)}`);
          if (parsed.cid10) partes.push(`CID-10: ${parsed.cid10}`);
          if (parsed.medico) partes.push(`Médico: ${parsed.medico}`);
          if (partes.length > 0) examesTexto = partes.join('\n');
        }
      } catch {}
      texto += `🔬 EXAMES:\n${examesTexto}\n\n`;
    }
    if (atendimento.observacoes) {
      texto += `📌 OBSERVAÇÕES:\n${atendimento.observacoes}\n\n`;
    }
    if (assinado && atendimento.dataAssinatura) {
      texto += `✅ Assinado pelo paciente em ${new Date(atendimento.dataAssinatura).toLocaleString('pt-BR')}\n`;
    }
    texto += `\n_Gerado pelo Sistema EasyClin_`;
    return texto;
  };
  // ⭐ Copia resumo para área de transferência
  const copiarResumo = async () => {
    try {
      await navigator.clipboard.writeText(gerarResumoTexto());
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = gerarResumoTexto();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };
  // ⭐ Imprime resumo
  const imprimirResumo = () => {
    const dataFormatada = new Date(atendimento.data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const tipoAtendimento = atendimento.tipo === 'medica' ? 'Médico' : 'Odontológico';
    let exameFisicoHtml = '';
    if (atendimento.exameFisico) {
      let texto = atendimento.exameFisico;
      try {
        const parsed = JSON.parse(atendimento.exameFisico);
        const partes: string[] = [];
        if (parsed.altura) partes.push(`Altura: ${parsed.altura}m`);
        if (parsed.peso) partes.push(`Peso: ${parsed.peso}kg`);
        if (parsed.imc) partes.push(`IMC: ${parsed.imc}`);
        if (parsed.pressaoArterial) partes.push(`PA: ${parsed.pressaoArterial}`);
        if (parsed.pulso) partes.push(`Pulso: ${parsed.pulso}bpm`);
        if (parsed.observacoesGerais) partes.push(parsed.observacoesGerais);
        if (partes.length > 0) texto = partes.join(' | ');
      } catch {}
      exameFisicoHtml = `<div class="section"><h3>🔬 Exame Físico</h3><p>${texto}</p></div>`;
    }
    const styleContent = 'body{font-family:system-ui,-apple-system,sans-serif;max-width:700px;margin:40px auto;color:#1e293b;line-height:1.6}' + 'h1{font-size:20px;color:#0f766e;border-bottom:2px solid #0f766e;padding-bottom:8px}' + 'h3{font-size:14px;color:#334155;margin:16px 0 8px}' + '.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;font-size:13px}' + '.meta strong{color:#0f766e}' + '.section{margin:12px 0;padding:12px 16px;border-left:3px solid #0f766e;background:#f0fdfa;border-radius:0 8px 8px 0}' + '.section p{font-size:13px;white-space:pre-wrap;margin:4px 0}' + '.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}' + '@media print{body{margin:20px}}';
    // Monta exames HTML
    let examesSecaoHtml = '';
    const examesRaw = (atendimento as any).exames;
    if (examesRaw) {
      let examesTexto = examesRaw;
      try {
        const parsed = JSON.parse(examesRaw);
        if (parsed && typeof parsed === 'object') {
          const partes: string[] = [];
          if (parsed.descricao) partes.push('Descrição: ' + parsed.descricao);
          if (parsed.pedido) partes.push('Pedido: ' + paraTextoSimples(parsed.pedido));
          if (parsed.justificativa) partes.push('Justificativa: ' + paraTextoSimples(parsed.justificativa));
          if (parsed.cid10) partes.push('CID-10: ' + parsed.cid10);
          if (parsed.medico) partes.push('Médico: ' + parsed.medico);
          if (partes.length > 0) examesTexto = partes.join('<br/>');
        }
      } catch {}
      examesSecaoHtml = '<div class="section"><h3>🔬 Exames</h3><p>' + examesTexto + '</p></div>';
    }
    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Resumo - ' + pacienteNome + '</title>' + '<sty' + 'le>' + styleContent + '</sty' + 'le>' + '</head><body>' + '<h1>📋 Resumo do Atendimento</h1>' + '<div class="meta">' + '<div><strong>Paciente:</strong> ' + pacienteNome + '</div>' + '<div><strong>Data:</strong> ' + dataFormatada + '</div>' + '<div><strong>Profissional:</strong> ' + (atendimento.profissional || 'Não informado') + '</div>' + '<div><strong>Tipo:</strong> ' + tipoAtendimento + '</div>' + '</div>' + (atendimento.queixaPrincipal ? '<div class="section"><h3>🩺 Queixa Principal</h3><p>' + atendimento.queixaPrincipal + '</p></div>' : '') + (atendimento.historico ? '<div class="section"><h3>📝 História da Doença Atual</h3><p>' + atendimento.historico + '</p></div>' : '') + exameFisicoHtml + (atendimento.diagnostico ? '<div class="section"><h3>🎯 Diagnóstico</h3><p>' + atendimento.diagnostico + '</p></div>' : '') + (atendimento.tratamento ? '<div class="section"><h3>💊 Tratamento</h3><p>' + atendimento.tratamento + '</p></div>' : '') + examesSecaoHtml + (atendimento.prescricoes ? '<div class="section"><h3>📝 Prescrições</h3><p>' + atendimento.prescricoes + '</p></div>' : '') + (atendimento.observacoes ? '<div class="section"><h3>📌 Observações</h3><p>' + atendimento.observacoes + '</p></div>' : '') + '<div class="footer">Gerado pelo Sistema EasyClin em ' + new Date().toLocaleString('pt-BR') + '</div>' + '</body></html>';
    // ⭐ Abre preview antes de salvar
    import('../utils/pdfGenerator').then(({
      previewDocumentoPDF
    }) => {
      const nomeArquivo = `Resumo_${(pacienteNome || 'Paciente').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      previewDocumentoPDF(htmlContent, {
        fileName: nomeArquivo
      });
    });
  };
  return <div className="border border-gray-100 rounded-lg p-4 bg-gray-50 hover:bg-white hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(atendimento.data).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            })}
            </p>
            <p className="text-xs text-gray-500">
              {atendimento.profissional} •{' '}
              {atendimento.tipo === 'medica' ? 'Médico' : 'Odontológico'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status da consulta */}
          {atendimento.status && <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-gray-100 text-gray-600 border border-gray-200">
              {atendimento.status}
            </span>}

          {/* Badge de Registro Clínico */}
          {frutificou ? <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              <StethoscopeIcon className="w-3 h-3" />
              Atendimento registrado
            </span> : <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <CalendarIcon className="w-3 h-3" />
              Consulta agendada — sem registro clínico
            </span>}

          {assinado ? <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              <CheckCircleIcon className="w-3 h-3" />
              Assinado
            </span> : <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
              <PenToolIcon className="w-3 h-3" />
              Pendente
            </span>}

          {/* ⭐ NOVO: Botão Resumo */}
          <Button variant="ghost" size="sm" onClick={() => setShowResumo(true)} title="Ver resumo do atendimento" className="text-teal-600 hover:bg-teal-50">
            
            <ClipboardListIcon className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={onVerDetalhes}>
            <EyeIcon className="w-4 h-4" />
          </Button>

          {!assinado && <Button variant="ghost" size="sm" onClick={onEdit}>
              <EditIcon className="w-4 h-4" />
            </Button>}
        </div>
      </div>

      {frutificou ? <div className="space-y-2 text-sm">
          {atendimento.queixaPrincipal && <div>
              <span className="font-medium text-gray-700">Queixa: </span>
              <span className="text-gray-600">
                {atendimento.queixaPrincipal.substring(0, 100)}
                {atendimento.queixaPrincipal.length > 100 ? '...' : ''}
              </span>
            </div>}
          {atendimento.diagnostico && <div>
              <span className="font-medium text-gray-700">Diagnóstico: </span>
              <span className="text-gray-600">
                {atendimento.diagnostico.substring(0, 100)}
                {atendimento.diagnostico.length > 100 ? '...' : ''}
              </span>
            </div>}
        </div> : <div className="text-sm text-gray-400 italic">
          Nenhum dado clínico lançado para esta consulta.
        </div>}

      {/* ⭐ NOVO: Modal de Resumo do Atendimento */}
      {showResumo && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => {
      if (e.target === e.currentTarget) setShowResumo(false);
    }}>
        
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <ClipboardListIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Resumo do Atendimento
                  </h3>
                  <p className="text-teal-100 text-xs">
                    {new Date(atendimento.data).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
                    {' • '}
                    {atendimento.profissional}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={async () => {
              await copiarResumo();
              const btn = document.getElementById('btn-copiar-resumo');
              if (btn) {
                btn.textContent = '✓ Copiado!';
                setTimeout(() => {
                  btn.textContent = 'Copiar';
                }, 2000);
              }
            }} id="btn-copiar-resumo" className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                
                  <ClipboardIcon className="w-3.5 h-3.5" />
                  Copiar
                </button>
                <button onClick={imprimirResumo} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                
                  <PrinterIcon className="w-3.5 h-3.5" />
                  Imprimir
                </button>
                <button onClick={() => setShowResumo(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                
                  <XIcon className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {/* Info do paciente */}
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Paciente:</span>
                  <span className="font-semibold text-gray-900">
                    {pacienteNome}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Data:</span>
                  <span className="font-semibold text-gray-900">
                    {new Date(atendimento.data).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StethoscopeIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Profissional:</span>
                  <span className="font-semibold text-gray-900">
                    {atendimento.profissional || 'Não informado'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ActivityIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Tipo:</span>
                  <span className="font-semibold text-gray-900">
                    {atendimento.tipo === 'medica' ? '🩺 Médico' : '🦷 Odontológico'}
                  </span>
                </div>
              </div>

              {/* Seções do atendimento */}
              {atendimento.queixaPrincipal && <div className="border-l-4 border-red-400 bg-red-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide mb-1">
                    Queixa Principal
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {atendimento.queixaPrincipal}
                  </p>
                </div>}

              {atendimento.historico && <div className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">
                    História da Doença Atual
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {atendimento.historico}
                  </p>
                </div>}

              {atendimento.exameFisico && (() => {
            let texto = atendimento.exameFisico;
            try {
              const parsed = JSON.parse(atendimento.exameFisico);
              const partes: string[] = [];
              if (parsed.altura) partes.push(`Altura: ${parsed.altura}m`);
              if (parsed.peso) partes.push(`Peso: ${parsed.peso}kg`);
              if (parsed.imc) partes.push(`IMC: ${parsed.imc}`);
              if (parsed.pressaoArterial) partes.push(`PA: ${parsed.pressaoArterial}`);
              if (parsed.pulso) partes.push(`Pulso: ${parsed.pulso}bpm`);
              if (parsed.observacoesGerais) partes.push(parsed.observacoesGerais);
              if (partes.length > 0) texto = partes.join(' | ');
            } catch {}
            return <div className="border-l-4 border-indigo-400 bg-indigo-50 p-4 rounded-r-lg">
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-1">
                        Exame Físico
                      </h4>
                      <p className="text-sm text-gray-700">{texto}</p>
                    </div>;
          })()}

              {atendimento.diagnostico && <div className="border-l-4 border-purple-400 bg-purple-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-1">
                    Diagnóstico
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {atendimento.diagnostico}
                  </p>
                </div>}

              {atendimento.tratamento && <div className="border-l-4 border-green-400 bg-green-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-green-800 uppercase tracking-wide mb-1">
                    Tratamento
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {atendimento.tratamento}
                  </p>
                </div>}

              {(atendimento as any).exames && <div className="border-l-4 border-orange-400 bg-orange-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-orange-800 uppercase tracking-wide mb-1">
                    Exames
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {(() => {
                const raw = (atendimento as any).exames || '';
                try {
                  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                  if (parsed && typeof parsed === 'object') {
                    const partes: string[] = [];
                    if (parsed.descricao) partes.push(parsed.descricao);
                    if (parsed.pedido) partes.push(`Pedido: ${paraTextoSimples(parsed.pedido)}`);
                    if (parsed.justificativa) partes.push(`Justificativa: ${paraTextoSimples(parsed.justificativa)}`);
                    if (parsed.cid10) partes.push(`CID-10: ${parsed.cid10}`);
                    if (parsed.medico) partes.push(`Médico: ${parsed.medico}`);
                    if (partes.length > 0) return partes.join('\n');
                  }
                } catch (e) {}
                return raw;
              })()}
                  </p>
                </div>}

              {atendimento.prescricoes && <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
                    Prescrições
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {atendimento.prescricoes}
                  </p>
                </div>}

              {atendimento.observacoes && <div className="border-l-4 border-gray-400 bg-gray-50 p-4 rounded-r-lg">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
                    Observações
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {atendimento.observacoes}
                  </p>
                </div>}

              {/* Status de assinatura */}
              {assinado ? <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-800 font-medium">
                    Assinado pelo paciente em{' '}
                    {new Date(atendimento.dataAssinatura!).toLocaleString('pt-BR')}
                  </span>
                </div> : <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                  <PenToolIcon className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-800 font-medium">
                    Assinatura pendente
                  </span>
                </div>}

              {/* Sem dados */}
              {!frutificou && <div className="text-center py-8 text-gray-400">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">
                    Consulta agendada — sem registro clínico
                  </p>
                  <p className="text-xs mt-1">
                    Nenhum dado clínico foi lançado para esta consulta.
                  </p>
                </div>}
            </div>
          </div>
        </div>}
    </div>;
}
// Componente para exibir o prontuário completo de um paciente
function ProntuarioCard({
  prontuario,
  pacientes,
  clinicaId,
  onNovoAtendimento,
  onEditarAtendimento,
  onVerDetalhes







}: {prontuario: Prontuario;pacientes: Paciente[];clinicaId: string;onNovoAtendimento: (prontuario: Prontuario) => void;onEditarAtendimento: (atendimento: Atendimento, prontuario: Prontuario) => void;onVerDetalhes: (atendimento: Atendimento, prontuario: Prontuario) => void;}) {
  const [expandido, setExpandido] = useState(false);
  const [telefone, setTelefone] = useState('');
  const atendimentos = prontuario.atendimentos || [];
  // Estatísticas de consultas vs atendimentos
  const totalConsultas = atendimentos.length;
  const ultimaConsulta = atendimentos[0];
  const atendimentosRegistrados = atendimentos.filter(atendimentoFrutificou);
  const totalAtendimentos = atendimentosRegistrados.length;
  const ultimoAtendimento = atendimentosRegistrados[0];
  // Busca telefone do paciente
  useEffect(() => {
    const buscarTelefone = async () => {
      if (telefonesCache[prontuario.pacienteId]) {
        setTelefone(telefonesCache[prontuario.pacienteId]);
        return;
      }
      const paciente = pacientes.find((p) => p.id === prontuario.pacienteId);
      if (paciente?.telefone) {
        telefonesCache[prontuario.pacienteId] = paciente.telefone;
        setTelefone(paciente.telefone);
        return;
      }
      if (clinicaId) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/pacientes/${prontuario.pacienteId}?clinicaId=${clinicaId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.telefone) {
              telefonesCache[prontuario.pacienteId] = data.telefone;
              setTelefone(data.telefone);
            }
          }
        } catch (err) {
          console.error('Erro ao buscar telefone:', err);
        }
      }
    };
    buscarTelefone();
  }, [prontuario.pacienteId, pacientes, clinicaId]);
  return <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Cabeçalho do Prontuário */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-bold">
              {(prontuario.pacienteNome || 'P')[0].toUpperCase()}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {prontuario.pacienteNome || 'Paciente'}
              </h3>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
                    <CalendarIcon className="w-4 h-4 text-gray-500" />
                    {totalConsultas} consulta{totalConsultas !== 1 ? 's' : ''}{' '}
                    marcada{totalConsultas !== 1 ? 's' : ''}
                  </span>
                  {ultimaConsulta && <span className="text-sm text-gray-500">
                      • Última:{' '}
                      {new Date(ultimaConsulta.data).toLocaleDateString('pt-BR')}
                    </span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm font-medium text-teal-700">
                    <StethoscopeIcon className="w-4 h-4 text-teal-600" />
                    {totalAtendimentos} com registro clínico
                  </span>
                  {ultimoAtendimento && <span className="text-sm text-teal-600/80">
                      • Último registro:{' '}
                      {new Date(ultimoAtendimento.data).toLocaleDateString('pt-BR')}
                    </span>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => onNovoAtendimento(prontuario)}>
              
              <PlusIcon className="w-4 h-4 mr-1" />
              Novo Atendimento
            </Button>
          </div>
        </div>

        {/* Informações gerais do prontuário */}
        {(prontuario.alergias || prontuario.doencasCronicas || prontuario.medicamentosEmUso) && <div className="mt-4 flex flex-wrap gap-2">
            {prontuario.alergias && <span className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                <AlertCircleIcon className="w-3 h-3" />
                Alergias: {prontuario.alergias}
              </span>}
            {prontuario.doencasCronicas && <span className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                <HeartPulseIcon className="w-3 h-3" />
                {prontuario.doencasCronicas}
              </span>}
            {prontuario.medicamentosEmUso && <span className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                <PillIcon className="w-3 h-3" />
                {prontuario.medicamentosEmUso}
              </span>}
          </div>}
      </div>

      {/* Lista de Atendimentos */}
      <div className="p-4">
        {atendimentos.length === 0 ? <div className="text-center py-8">
            <CalendarIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              Nenhuma consulta marcada para este paciente
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => onNovoAtendimento(prontuario)}>
            
              Registrar Primeiro Atendimento
            </Button>
          </div> : <div className="space-y-3">
            {/* Mostra os primeiros 2 atendimentos ou todos se expandido */}
            {(expandido ? atendimentos : atendimentos.slice(0, 2)).map((atendimento) => <AtendimentoCard key={atendimento.id} atendimento={atendimento} pacienteNome={prontuario.pacienteNome || 'Paciente'} pacienteTelefone={telefone} clinicaId={clinicaId} onEdit={() => onEditarAtendimento(atendimento, prontuario)} onVerDetalhes={() => onVerDetalhes(atendimento, prontuario)} />)}

            {/* Botão para expandir/recolher */}
            {atendimentos.length > 2 && <button onClick={() => setExpandido(!expandido)} className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 transition-colors">
            
                {expandido ? <>
                    <ChevronUpIcon className="w-4 h-4" />
                    Mostrar menos
                  </> : <>
                    <ChevronDownIcon className="w-4 h-4" />
                    Ver mais {atendimentos.length - 2} consulta
                    {atendimentos.length - 2 !== 1 ? 's' : ''}
                  </>}
              </button>}
          </div>}
      </div>
    </div>;
}
export function ProntuariosPage({
  pacientes = [],
  onNavigate
}: ProntuariosPageProps) {
  const {
    success,
    error: toastError,
    warning
  } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetalhesModalOpen, setIsDetalhesModalOpen] = useState(false);
  const [prontuarioSelecionado, setProntuarioSelecionado] = useState<Prontuario | null>(null);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<Atendimento | null>(null);
  const [prontuarioParaEditar, setProntuarioParaEditar] = useState<Prontuario | null>(null);
  const [atendimentoParaEditar, setAtendimentoParaEditar] = useState<Atendimento | null>(null);
  const [prontuarios, setProntuarios] = useState<Prontuario[]>([]);
  const [selectedPacienteId, setSelectedPacienteId] = useState('');
  const [selectedPacienteNome, setSelectedPacienteNome] = useState('');
  const [clinicaId, setClinicaId] = useState<string>('');
  const [carregando, setCarregando] = useState(true);
  // ⭐ NOVO: Detecta se veio da Agenda
  const [retornoAgenda, setRetornoAgenda] = useState<{
    pacienteId: string;
    pacienteNome: string;
    consultaId?: string;
    data?: string;
  } | null>(null);
  // ⭐ NOVO: Carrega contexto de retorno da Agenda
  useEffect(() => {
    const stored = localStorage.getItem('retornoAgenda');
    if (stored) {
      try {
        const dados = JSON.parse(stored);
        setRetornoAgenda(dados);
        // Pré-seleciona o paciente
        if (dados.pacienteId && dados.pacienteNome) {
          setSelectedPacienteId(dados.pacienteId);
          setSelectedPacienteNome(dados.pacienteNome);
        }
      } catch (err) {
        console.error('Erro ao parsear retornoAgenda:', err);
      }
    }
  }, []);
  // ⭐ NOVO: Função para voltar à Agenda
  const handleVoltarAgenda = () => {
    localStorage.removeItem('retornoAgenda');
    setRetornoAgenda(null);
    onNavigate?.('agenda');
  };
  // Carrega prontuários
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      const clinica = parsed.clinicaAtual?.id || '';
      setClinicaId(clinica);
      if (clinica) {
        setCarregando(true);
        fetch(`${API_BASE_URL}/api/prontuarios?clinicaId=${clinica}`).then((res) => res.json()).then((data) => {
          setProntuarios(data);
          localStorage.setItem('prontuarios', JSON.stringify(data));
        }).catch((err) => {
          console.error('Erro ao carregar prontuários:', err);
          const stored = localStorage.getItem('prontuarios');
          if (stored) {
            setProntuarios(JSON.parse(stored));
          }
        }).finally(() => setCarregando(false));
      }
    }
  }, []);
  // Recarrega prontuários após salvar
  const recarregarProntuarios = async () => {
    if (!clinicaId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/prontuarios?clinicaId=${clinicaId}`);
      const data = await response.json();
      setProntuarios(data);
      localStorage.setItem('prontuarios', JSON.stringify(data));
    } catch (err) {
      console.error('Erro ao recarregar prontuários:', err);
    }
  };
  const handleSaveProntuario = async (dados: any) => {
    if (!clinicaId) {
      toastError('Erro', 'Clínica não identificada. Recarregue a página.');
      return;
    }
    try {
      // Se está editando um atendimento existente
      if (atendimentoParaEditar) {
        const response = await fetch(`${API_BASE_URL}/api/atendimentos/${atendimentoParaEditar.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...dados,
            clinicaId
          })
        });
        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 403) {
            toastError('Bloqueado', errorData.message || 'Este atendimento está bloqueado.');
            return;
          }
          throw new Error(`HTTP ${response.status}`);
        }
        success('Atendimento Atualizado', 'As alterações foram salvas com sucesso.');
        setAtendimentoParaEditar(null);
      } else {
        // Cria novo atendimento (ou prontuário se não existir)
        const response = await fetch(`${API_BASE_URL}/api/prontuarios`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...dados,
            clinicaId
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const resultado = await response.json();
        if (resultado.prontuarioCriado) {
          success('Prontuário Criado', 'Prontuário e primeiro atendimento registrados com sucesso.');
        } else {
          success('Atendimento Registrado', 'Novo atendimento adicionado ao prontuário.');
        }
      }
      // Recarrega os prontuários
      await recarregarProntuarios();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toastError('Erro', 'Não foi possível salvar. Verifique a conexão.');
    }
  };
  const filteredProntuarios = selectedPacienteId ? prontuarios.filter((p) => p.pacienteId === selectedPacienteId) : prontuarios;
  const handlePacienteFilterChange = (pacienteId: string, pacienteNome: string) => {
    setSelectedPacienteId(pacienteId);
    setSelectedPacienteNome(pacienteNome);
  };
  const handleClearFilter = () => {
    setSelectedPacienteId('');
    setSelectedPacienteNome('');
  };
  const handleNovoAtendimento = (prontuario?: Prontuario) => {
    setProntuarioParaEditar(prontuario || null);
    setAtendimentoParaEditar(null);
    // Se tem prontuário, pré-seleciona o paciente
    if (prontuario) {
      setSelectedPacienteId(prontuario.pacienteId);
      setSelectedPacienteNome(prontuario.pacienteNome || '');
    }
    setIsModalOpen(true);
  };
  const handleEditarAtendimento = (atendimento: Atendimento, prontuario: Prontuario) => {
    // Verifica se está assinado
    if (atendimento.assinaturaPaciente) {
      warning('Bloqueado', 'Este atendimento já foi assinado e não pode ser editado.');
      return;
    }
    setProntuarioParaEditar(prontuario);
    setAtendimentoParaEditar(atendimento);
    setIsModalOpen(true);
  };
  const handleVerDetalhes = async (atendimento: Atendimento, prontuario: Prontuario) => {
    // ⭐ Busca telefone ANTES de abrir o modal
    let telefone = '';
    // Tenta do cache
    if (telefonesCache[prontuario.pacienteId]) {
      telefone = telefonesCache[prontuario.pacienteId];
    } else {
      // Tenta da lista de pacientes
      const paciente = pacientes.find((p) => p.id === prontuario.pacienteId);
      if (paciente?.telefone) {
        telefone = paciente.telefone;
        telefonesCache[prontuario.pacienteId] = telefone;
      } else if (clinicaId) {
        // Busca da API
        try {
          const response = await fetch(`${API_BASE_URL}/api/pacientes/${prontuario.pacienteId}?clinicaId=${clinicaId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.telefone) {
              telefone = data.telefone;
              telefonesCache[prontuario.pacienteId] = telefone;
            }
          }
        } catch (err) {
          console.error('Erro ao buscar telefone:', err);
        }
      }
    }
    console.log('📞 [handleVerDetalhes] Telefone encontrado:', telefone || '(vazio)');
    setPacienteTelefoneDetalhes(telefone);
    setAtendimentoSelecionado(atendimento);
    setProntuarioSelecionado(prontuario);
    setIsDetalhesModalOpen(true);
  };
  const handleCloseModal = () => {
    setProntuarioParaEditar(null);
    setAtendimentoParaEditar(null);
    setIsModalOpen(false);
  };
  const handleWarning = (message: string) => {
    warning('Atenção', message);
  };
  const handleError = (message: string) => {
    toastError('Erro', message);
  };
  // Busca telefone do paciente para o modal de detalhes
  const [pacienteTelefoneDetalhes, setPacienteTelefoneDetalhes] = useState('');
  useEffect(() => {
    if (prontuarioSelecionado && clinicaId) {
      const buscarTelefone = async () => {
        // Primeiro tenta do cache
        if (telefonesCache[prontuarioSelecionado.pacienteId]) {
          setPacienteTelefoneDetalhes(telefonesCache[prontuarioSelecionado.pacienteId]);
          console.log('📞 [ProntuariosPage] Telefone do cache:', telefonesCache[prontuarioSelecionado.pacienteId]);
          return;
        }
        // Tenta da lista de pacientes
        const paciente = pacientes.find((p) => p.id === prontuarioSelecionado.pacienteId);
        if (paciente?.telefone) {
          telefonesCache[prontuarioSelecionado.pacienteId] = paciente.telefone;
          setPacienteTelefoneDetalhes(paciente.telefone);
          console.log('📞 [ProntuariosPage] Telefone da lista:', paciente.telefone);
          return;
        }
        // Busca da API
        try {
          console.log('📞 [ProntuariosPage] Buscando telefone da API para paciente:', prontuarioSelecionado.pacienteId);
          const response = await fetch(`${API_BASE_URL}/api/pacientes/${prontuarioSelecionado.pacienteId}?clinicaId=${clinicaId}`);
          if (response.ok) {
            const data = await response.json();
            console.log('📞 [ProntuariosPage] Resposta da API:', data.telefone || '(vazio)');
            if (data.telefone) {
              telefonesCache[prontuarioSelecionado.pacienteId] = data.telefone;
            }
            setPacienteTelefoneDetalhes(data.telefone || '');
          } else {
            console.log('📞 [ProntuariosPage] Erro na API:', response.status);
            setPacienteTelefoneDetalhes('');
          }
        } catch (err) {
          console.error('📞 [ProntuariosPage] Erro ao buscar telefone:', err);
          setPacienteTelefoneDetalhes('');
        }
      };
      buscarTelefone();
    } else {
      setPacienteTelefoneDetalhes('');
    }
  }, [prontuarioSelecionado, pacientes, clinicaId]);
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* ⭐ NOVO: Botão Voltar para Agenda */}
          {retornoAgenda && onNavigate && <Button variant="ghost" onClick={handleVoltarAgenda} className="text-gray-600 hover:text-gray-900">
            
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Voltar à Agenda
            </Button>}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Prontuários</h1>
            <p className="text-gray-500 mt-1">
              Histórico médico completo dos pacientes
              {retornoAgenda && <span className="ml-2 text-blue-600 font-medium">
                  • Visualizando histórico de {retornoAgenda.pacienteNome}
                </span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* ⭐ NOVO: Botão Voltar à Agenda (duplicado para visibilidade) */}
          {retornoAgenda && onNavigate && <Button variant="secondary" onClick={handleVoltarAgenda} className="bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200">
            
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Continuar Atendimento
            </Button>}
          <Button onClick={() => handleNovoAtendimento()}>
            <PlusIcon className="w-5 h-5 mr-2" />
            Novo Atendimento
          </Button>
        </div>
      </div>

      {/* ⭐ NOVO: Card informativo quando veio da Agenda */}
      {retornoAgenda && <Card className="bg-blue-50 border-blue-200">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileTextIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-blue-900">
                    Visualizando Histórico do Paciente
                  </h3>
                  <p className="text-xs text-blue-700">
                    Você está vendo o histórico de{' '}
                    <strong>{retornoAgenda.pacienteNome}</strong>. Clique em
                    "Continuar Atendimento" para voltar ao formulário de
                    atendimento.
                  </p>
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={handleVoltarAgenda}>
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                Continuar Atendimento
              </Button>
            </div>
          </div>
        </Card>}

      <Card>
        <div className="mb-6">
          {clinicaId ? <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Buscar Paciente
                </label>
                {selectedPacienteId && <Button variant="ghost" size="sm" onClick={handleClearFilter}>
                    Limpar Filtro (Mostrar Todos)
                  </Button>}
              </div>
              <PacienteBuscaSelectAPI clinicaId={clinicaId} value={selectedPacienteId} onChange={handlePacienteFilterChange} placeholder="🔍 Digite o nome do paciente para buscar seu prontuário..." showClearButton={false} allowQuickCreate={false} />
            
            </div> : <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Carregando informações da clínica...
              </p>
            </div>}
        </div>

        {carregando ? <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">Carregando prontuários...</p>
          </div> : filteredProntuarios.length === 0 ? <div className="text-center py-12">
            <FileTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">
              {selectedPacienteId ? 'Nenhum prontuário encontrado para este paciente' : 'Nenhum prontuário encontrado'}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              Cada paciente possui um único prontuário com todo seu histórico de
              atendimentos.
            </p>
            <Button variant="secondary" onClick={() => handleNovoAtendimento()}>
              Registrar Primeiro Atendimento
            </Button>
          </div> : <div className="space-y-6">
            {filteredProntuarios.map((prontuario) => <ProntuarioCard key={prontuario.id} prontuario={prontuario} pacientes={pacientes} clinicaId={clinicaId} onNovoAtendimento={handleNovoAtendimento} onEditarAtendimento={handleEditarAtendimento} onVerDetalhes={handleVerDetalhes} />)}
          </div>}
      </Card>

      <ProntuarioForm isOpen={isModalOpen} onClose={handleCloseModal} onSave={handleSaveProntuario} pacientes={pacientes} initialPacienteId={selectedPacienteId} initialPacienteNome={selectedPacienteNome} prontuarioParaEditar={prontuarioParaEditar} atendimentoParaEditar={atendimentoParaEditar} onWarning={handleWarning} onError={handleError} />
      

      {/* Modal de Detalhes - Adaptado para mostrar atendimento específico */}
      {atendimentoSelecionado && prontuarioSelecionado && <ProntuarioDetalhesModal isOpen={isDetalhesModalOpen} onClose={() => {
      setIsDetalhesModalOpen(false);
      setAtendimentoSelecionado(null);
      setProntuarioSelecionado(null);
    }} prontuario={{
      ...prontuarioSelecionado,
      // Mescla dados do atendimento para compatibilidade
      data: atendimentoSelecionado.data,
      tipo: atendimentoSelecionado.tipo,
      queixaPrincipal: atendimentoSelecionado.queixaPrincipal,
      historico: atendimentoSelecionado.historico,
      exameFisico: atendimentoSelecionado.exameFisico,
      diagnostico: atendimentoSelecionado.diagnostico,
      tratamento: atendimentoSelecionado.tratamento,
      prescricoes: atendimentoSelecionado.prescricoes,
      observacoes: atendimentoSelecionado.observacoes,
      profissional: atendimentoSelecionado.profissional,
      // ⭐ CORREÇÃO: Passa o profissionalId do atendimento!
      profissionalId: (atendimentoSelecionado as any).profissionalId,
      odontograma: atendimentoSelecionado.odontograma,
      assinaturaPaciente: atendimentoSelecionado.assinaturaPaciente,
      dataAssinatura: atendimentoSelecionado.dataAssinatura
    } as any} pacienteNome={prontuarioSelecionado.pacienteNome || 'Paciente'} pacienteTelefone={pacienteTelefoneDetalhes} clinicaId={clinicaId} onEdit={() => {
      if (atendimentoSelecionado.assinaturaPaciente) {
        warning('Bloqueado', 'Este atendimento já foi assinado e não pode ser editado.');
        return;
      }
      handleEditarAtendimento(atendimentoSelecionado, prontuarioSelecionado);
      setIsDetalhesModalOpen(false);
    }} onWarning={handleWarning} onSuccess={(message) => success('Sucesso', message)} onRefresh={async () => {
      // ⭐ NOVO: Recarrega os prontuários quando assinatura for recebida
      console.log('🔄 [ProntuariosPage] Recarregando prontuários após assinatura...');
      await recarregarProntuarios();
      // Atualiza o atendimento selecionado com os novos dados
      const prontuariosAtualizados = await fetch(`${API_BASE_URL}/api/prontuarios?clinicaId=${clinicaId}`).then((res) => res.json());
      const prontuarioAtualizado = prontuariosAtualizados.find((p: Prontuario) => p.id === prontuarioSelecionado.id);
      if (prontuarioAtualizado) {
        const atendimentoAtualizado = prontuarioAtualizado.atendimentos?.find((a: Atendimento) => a.id === atendimentoSelecionado.id);
        if (atendimentoAtualizado) {
          setAtendimentoSelecionado(atendimentoAtualizado);
          setProntuarioSelecionado(prontuarioAtualizado);
          console.log('✅ [ProntuariosPage] Atendimento atualizado com assinatura!');
        }
      }
    }} />}
    </div>;
}