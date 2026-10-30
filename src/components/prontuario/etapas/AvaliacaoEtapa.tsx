import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { SignaturePad } from '../../SignaturePad';
import { useToast } from '../../../hooks/useToast';
import { API_BASE_URL } from '../../../config/api';
import { previewDocumentoPDF } from '../../../utils/pdfGenerator';
import { PrinterIcon, PlusIcon, Trash2Icon, Loader2Icon, ClipboardListIcon, DollarSignIcon, ClockIcon, PenToolIcon, CheckCircleIcon, XIcon, LockIcon, ShieldAlertIcon, CalendarIcon, UserIcon } from 'lucide-react';
import { registrarAuditoria } from '../../../utils/auditLog';
interface AvaliacaoEtapaProps {
  pacienteId?: string;
  atendimentoId?: string;
  clinicaId?: string;
  readOnly?: boolean;
  profissionalDaConsulta?: {
    id: string;
    nome: string;
    crm?: string;
    uf?: string;
    especialidade?: string;
    especialidades?: string;
    titulo?: string;
    cabecalhoRelatorio?: string;
  } | null;
  pacienteNome?: string;
}
interface AvaliacaoRecord {
  id: string;
  consultaId: string;
  pacienteId: string;
  data: string;
  procedimentoId: string;
  procedimentoNome: string;
  complemento: string;
  valor: number;
  tempo: number;
  profissionalId: string;
  profissionalNome: string;
  assinaturaBase64: string;
  assinadoEm: string;
  bloqueado?: boolean;
}
interface CatalogItem {
  id: string;
  nome: string;
  valor?: number;
  duracao?: number;
}
interface ProfissionalItem {
  id: string;
  nome: string;
  tipo?: string;
}
/* ⭐ Sub-componente do modal de assinatura */
function SignatureModalContent({
  onSave,
  onCancel,
  isSaving




}: {onSave: (sig: string) => void;onCancel: () => void;isSaving: boolean;}) {
  const [tempSig, setTempSig] = useState('');
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <PenToolIcon className="w-5 h-5 text-teal-600" />
            Assinatura do Paciente
          </h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-full">
            
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Solicite ao paciente que assine abaixo para confirmar a avaliação.
        </p>
        <SignaturePad onChange={setTempSig} label="Assinatura do Paciente" />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2" onClick={() => {
          if (tempSig) onSave(tempSig);
        }} disabled={!tempSig || isSaving}>
            
            {isSaving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
            Confirmar Assinatura
          </Button>
        </div>
      </div>
    </div>;
}
export function AvaliacaoEtapa({
  pacienteId,
  atendimentoId,
  clinicaId,
  readOnly = false,
  profissionalDaConsulta,
  pacienteNome
}: AvaliacaoEtapaProps) {
  const {
    success,
    error
  } = useToast();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [records, setRecords] = useState<AvaliacaoRecord[]>([]);
  const recordsRef = useRef<AvaliacaoRecord[]>([]);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalItem[]>([]);
  const [usuarioLogadoTipo, setUsuarioLogadoTipo] = useState<string>('');
  const [signGroupDate, setSignGroupDate] = useState<string | null>(null);
  const [lockAllModal, setLockAllModal] = useState(false);
  const newGroupRef = useRef<HTMLDivElement | null>(null);
  const [scrollToDate, setScrollToDate] = useState<string | null>(null);
  const [clinicaData, setClinicaData] = useState<{
    nome?: string;
    logoUrl?: string;
    endereco?: string;
    telefone?: string;
    email?: string;
    cnpj?: string;
  }>({});
  const canLockAll = ['medico', 'dentista', 'super_admin', 'admin'].includes(usuarioLogadoTipo);
  // ⭐ Group records by date
  const dateGroups = useMemo(() => {
    const groups = new Map<string, AvaliacaoRecord[]>();
    records.forEach((r) => {
      const key = r.data || 'sem-data';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records]);
  const totalValor = records.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
  const totalTempo = records.reduce((sum, r) => sum + (Number(r.tempo) || 0), 0);
  // ⭐ Auto-scroll to new group
  useEffect(() => {
    if (scrollToDate && newGroupRef.current) {
      newGroupRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      // Focus first select in the new group
      const firstSelect = newGroupRef.current.querySelector('select');
      if (firstSelect) setTimeout(() => firstSelect.focus(), 400);
      setScrollToDate(null);
    }
  }, [scrollToDate, dateGroups]);
  // ⭐ Load data
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      setUsuarioLogadoTipo(parsed.usuario?.tipo || '');
    }
    async function loadData() {
      if (!clinicaId) return;
      try {
        setIsLoaded(false);
        const [clinicaRes, catalogRes, profRes, recordsRes] = await Promise.all([fetch(`${API_BASE_URL}/api/clinicas/${clinicaId}`).then((r) => r.json()).catch(() => null), fetch(`${API_BASE_URL}/api/procedimentos?clinicaId=${clinicaId}`).then((r) => r.json()).catch(() => []), fetch(`${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`).then((r) => r.json()).catch(() => []), fetch(`${API_BASE_URL}/api/avaliacoes-prontuario?clinicaId=${clinicaId}` + (pacienteId ? `&pacienteId=${pacienteId}` : '') + (atendimentoId ? `&consultaId=${atendimentoId}` : '')).then((r) => r.ok ? r.json() : []).catch(() => [])]);
        if (clinicaRes) setClinicaData(clinicaRes);
        setCatalog(catalogRes || []);
        setProfissionais((profRes || []).filter((u: ProfissionalItem) => u.tipo === 'medico' || u.tipo === 'dentista'));
        setRecords(recordsRes || []);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        error('Erro', 'Não foi possível carregar os dados de avaliação.');
      } finally {
        setIsLoaded(true);
      }
    }
    loadData();
  }, [clinicaId, atendimentoId, pacienteId]);
  // ⭐ CRUD handlers
  const handleUpdateRecord = async (id: string, field: keyof AvaliacaoRecord, value: any) => {
    const existingRecord = recordsRef.current.find((r) => r.id === id);
    if (!existingRecord) return;
    const updated: AvaliacaoRecord = {
      ...existingRecord,
      [field]: value
    };
    if (field === 'procedimentoId') {
      const proc = catalog.find((p) => String(p.id) === String(value));
      if (proc) {
        updated.procedimentoNome = proc.nome;
        updated.valor = proc.valor || 0;
        updated.tempo = proc.duracao || 0;
      } else {
        updated.procedimentoNome = '';
      }
    }
    if (field === 'profissionalId') {
      const prof = profissionais.find((p) => String(p.id) === String(value));
      updated.profissionalNome = prof ? prof.nome : '';
    }
    setRecords((prev) => prev.map((r) => r.id === id ? updated : r));
    recordsRef.current = recordsRef.current.map((r) => r.id === id ? updated : r);
    if (!clinicaId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/avaliacoes-prontuario/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          data: updated.data,
          procedimentoId: updated.procedimentoId,
          procedimentoNome: updated.procedimentoNome,
          complemento: updated.complemento,
          valor: updated.valor,
          tempo: updated.tempo,
          profissionalId: updated.profissionalId,
          profissionalNome: updated.profissionalNome,
          assinaturaBase64: updated.assinaturaBase64,
          assinadoEm: updated.assinadoEm,
          bloqueado: updated.bloqueado
        })
      });
      if (!res.ok) throw new Error('Falha ao atualizar');
    } catch (err) {
      console.error('Erro ao atualizar:', err);
    }
  };
  const handleAddRecord = async (date?: string) => {
    if (!clinicaId || !pacienteId) {
      error('Erro', 'Dados do paciente ou clínica não disponíveis.');
      return;
    }
    const consultaId = atendimentoId || 'consulta_' + Date.now();
    const targetDate = date || new Date().toISOString().split('T')[0];
    const isNewGroup = !recordsRef.current.some((r) => r.data === targetDate);
    // Get professional from existing records in same date group, or from consulta
    const sameGroup = recordsRef.current.filter((r) => r.data === targetDate);
    const profId = sameGroup[0]?.profissionalId || profissionalDaConsulta?.id || '';
    const profNome = sameGroup[0]?.profissionalNome || profissionalDaConsulta?.nome || '';
    setIsSaving(true);
    try {
      const payload = {
        clinicaId,
        consultaId,
        pacienteId,
        data: targetDate,
        procedimentoId: '',
        procedimentoNome: '',
        complemento: '',
        valor: 0,
        tempo: 0,
        profissionalId: profId,
        profissionalNome: profNome
      };
      const res = await fetch(`${API_BASE_URL}/api/avaliacoes-prontuario`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Falha ao criar registro');
      const newRecord = await res.json();
      setRecords((prev) => [...prev, newRecord]);
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'CRIACAO_AVALIACAO',
        entidade: 'avaliacao',
        entidadeId: newRecord.id,
        pacienteId,
        pacienteNome,
        detalhes: 'Novo procedimento adicionado à avaliação'
      });
      if (isNewGroup) setScrollToDate(targetDate);
    } catch (err) {
      console.error('Erro ao adicionar:', err);
      error('Erro', 'Não foi possível adicionar a avaliação.');
    } finally {
      setIsSaving(false);
    }
  };
  const handleDeleteRecord = async (id: string) => {
    if (!clinicaId) return;
    const deletedRecord = records.find((r) => r.id === id);
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/avaliacoes-prontuario/${id}?clinicaId=${clinicaId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Falha ao deletar');
      setRecords((prev) => prev.filter((r) => r.id !== id));
      recordsRef.current = recordsRef.current.filter((r) => r.id !== id);
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'EXCLUSAO_AVALIACAO',
        entidade: 'avaliacao',
        entidadeId: id,
        pacienteId,
        pacienteNome,
        detalhes: 'Procedimento removido: ' + (deletedRecord?.procedimentoNome || 'N/A')
      });
      success('Removido', 'Avaliação removida com sucesso.');
    } catch (err) {
      console.error('Erro ao deletar:', err);
      error('Erro', 'Não foi possível remover a avaliação.');
    } finally {
      setIsSaving(false);
    }
  };
  // ⭐ Group-level handlers
  const handleGroupDateChange = async (oldDate: string, newDate: string) => {
    const groupRecords = recordsRef.current.filter((r) => r.data === oldDate && !r.bloqueado);
    for (const record of groupRecords) {
      await handleUpdateRecord(record.id, 'data', newDate);
    }
  };
  const handleGroupProfessionalChange = async (date: string, profId: string) => {
    const groupRecords = recordsRef.current.filter((r) => r.data === date && !r.bloqueado);
    for (const record of groupRecords) {
      await handleUpdateRecord(record.id, 'profissionalId', profId);
    }
  };
  const handleSignGroup = async (date: string, signatureBase64: string) => {
    if (!clinicaId) return;
    setIsSaving(true);
    try {
      const toSign = recordsRef.current.filter((r) => r.data === date && !r.assinaturaBase64 && !r.bloqueado);
      for (const record of toSign) {
        const res = await fetch(`${API_BASE_URL}/api/avaliacoes-prontuario/${record.id}/assinatura`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            assinaturaBase64: signatureBase64
          })
        });
        if (!res.ok) throw new Error('Falha ao salvar assinatura');
        const data = await res.json();
        const assinadoEm = data.assinadoEm || new Date().toISOString();
        setRecords((prev) => prev.map((r) => r.id === record.id ? {
          ...r,
          assinaturaBase64: signatureBase64,
          assinadoEm
        } : r));
        recordsRef.current = recordsRef.current.map((r) => r.id === record.id ? {
          ...r,
          assinaturaBase64: signatureBase64,
          assinadoEm
        } : r);
      }
      success('Assinatura salva', `${toSign.length} avaliação(ões) assinada(s).`);
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'ASSINATURA_AVALIACAO',
        entidade: 'avaliacao',
        entidadeId: toSign.map((r) => r.id).join(','),
        pacienteId,
        pacienteNome,
        detalhes: `Paciente assinou ${toSign.length} avaliação(ões)`
      });
    } catch (err) {
      console.error('Erro ao salvar assinatura:', err);
      error('Erro', 'Não foi possível salvar a assinatura.');
    } finally {
      setIsSaving(false);
      setSignGroupDate(null);
    }
  };
  const handleLockGroup = async (date: string) => {
    const groupRecords = recordsRef.current.filter((r) => r.data === date);
    const unsigned = groupRecords.filter((r) => !r.assinaturaBase64 && !r.bloqueado);
    if (unsigned.length > 0) {
      error('Sem assinatura', `${unsigned.length} item(ns) sem assinatura neste grupo.`);
      return;
    }
    setIsSaving(true);
    try {
      for (const record of groupRecords) {
        if (!record.bloqueado) await handleUpdateRecord(record.id, 'bloqueado', true);
      }
      success('Grupo Travado', 'Avaliações deste grupo foram bloqueadas.');
    } catch (err) {
      error('Erro', 'Não foi possível travar o grupo.');
    } finally {
      setIsSaving(false);
    }
  };
  // ⭐ Print single group
  const handlePrintGroup = (date: string, items: AvaliacaoRecord[]) => {
    const clinicaInfoParts: string[] = [];
    if (clinicaData.endereco) clinicaInfoParts.push(clinicaData.endereco);
    if (clinicaData.telefone) clinicaInfoParts.push('Tel: ' + clinicaData.telefone);
    if (clinicaData.email) clinicaInfoParts.push(clinicaData.email);
    if (clinicaData.cnpj) clinicaInfoParts.push('CNPJ: ' + clinicaData.cnpj);
    const logoHtml = clinicaData.logoUrl ? `<img src="${clinicaData.logoUrl}" style="max-height:60px;max-width:180px;margin:0 auto 8px;display:block;" alt="Logo" />` : '';
    const clinicaInfoHtml = clinicaInfoParts.map((info) => `<span style="font-size:11px;color:#64748b;">${info}</span>`).join(' &nbsp;|&nbsp; ');
    const dataFormatada = date !== 'sem-data' ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data';
    const profNome = items[0]?.profissionalNome || '-';
    const gValor = items.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const gTempo = items.reduce((s, r) => s + (Number(r.tempo) || 0), 0);
    let rowsHtml = '';
    items.forEach((r) => {
      const comp = r.complemento ? `<div style="font-size:12px;color:#64748b;margin-top:3px;">${r.complemento}</div>` : '';
      rowsHtml += `<tr><td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;"><div style="font-weight:600;color:#4f46e5;">${r.procedimentoNome || 'Não especificado'}</div>${comp}</td>`;
      rowsHtml += `<td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.tempo ? r.tempo + ' min' : '-'}</td>`;
      rowsHtml += `<td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(r.valor || 0)}</td></tr>`;
    });
    const cssText = 'body{font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;max-width:900px;margin:0 auto;padding:30px 20px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#4f46e5;color:#fff;padding:10px 15px;text-align:left;font-size:12px;text-transform:uppercase;font-weight:700}tr:nth-child(even){background:#f8fafc}@media print{body{padding:10px}}';
    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Avaliação - ' + dataFormatada + '</title><sty' + 'le>' + cssText + '</sty' + 'le></head><body>' + '<div style="text-align:center;margin-bottom:25px;padding-bottom:15px;border-bottom:3px solid #4f46e5;">' + logoHtml + '<div style="font-size:20px;font-weight:bold;color:#4338ca;margin-bottom:4px;">' + (clinicaData.nome || '') + '</div><div>' + clinicaInfoHtml + '</div></div>' + '<div style="font-size:20px;font-weight:bold;color:#4338ca;margin:20px 0 8px;text-transform:uppercase;text-align:center;">Avaliação de Procedimentos</div>' + '<div style="text-align:center;color:#475569;margin-bottom:5px;font-size:15px;"><strong>Paciente:</strong> ' + (pacienteNome || 'Não informado') + '</div>' + '<div style="text-align:center;color:#475569;margin-bottom:20px;font-size:14px;"><strong>Data:</strong> ' + dataFormatada + ' &nbsp;|&nbsp; <strong>Profissional:</strong> ' + profNome + '</div>' + '<table><thead><tr><th>Procedimento</th><th style="width:80px;text-align:right;">Tempo</th><th style="width:120px;text-align:right;">Valor</th></tr></thead><tbody>' + rowsHtml + '<tr><td style="text-align:right;font-weight:bold;padding:12px 15px;border-top:2px solid #e2e8f0;">TOTAL:</td><td style="text-align:right;font-weight:bold;padding:12px 15px;border-top:2px solid #e2e8f0;color:#4f46e5;">' + gTempo + ' min</td><td style="text-align:right;font-weight:bold;padding:12px 15px;border-top:2px solid #e2e8f0;color:#4f46e5;">' + new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(gValor) + '</td></tr>' + '</tbody></table></body></html>';
    previewDocumentoPDF(htmlContent, {
      fileName: 'avaliacao-' + dataFormatada + '.pdf'
    });
  };
  // ⭐ Print
  const handlePrint = () => {
    if (records.length === 0) {
      error('Aviso', 'Não há avaliações para imprimir.');
      return;
    }
    const clinicaInfoParts: string[] = [];
    if (clinicaData.endereco) clinicaInfoParts.push(clinicaData.endereco);
    if (clinicaData.telefone) clinicaInfoParts.push('Tel: ' + clinicaData.telefone);
    if (clinicaData.email) clinicaInfoParts.push(clinicaData.email);
    if (clinicaData.cnpj) clinicaInfoParts.push('CNPJ: ' + clinicaData.cnpj);
    const logoHtml = clinicaData.logoUrl ? `<img src="${clinicaData.logoUrl}" style="max-height:60px;max-width:180px;margin:0 auto 8px;display:block;" alt="Logo" />` : '';
    const clinicaInfoHtml = clinicaInfoParts.map((info) => `<span style="font-size:11px;color:#64748b;">${info}</span>`).join(' &nbsp;|&nbsp; ');
    let groupsHtml = '';
    dateGroups.forEach(([date, items]) => {
      const dataFormatada = date !== 'sem-data' ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data';
      const profNome = items[0]?.profissionalNome || '-';
      const gValor = items.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      const gTempo = items.reduce((s, r) => s + (Number(r.tempo) || 0), 0);
      groupsHtml += `<div style="margin-bottom:25px;"><h3 style="color:#4338ca;font-size:16px;margin-bottom:5px;">${dataFormatada} — ${profNome}</h3>`;
      groupsHtml += '<table><thead><tr><th>Procedimento</th><th style="width:80px;text-align:right;">Tempo</th><th style="width:120px;text-align:right;">Valor</th></tr></thead><tbody>';
      items.forEach((r) => {
        const comp = r.complemento ? `<div style="font-size:12px;color:#64748b;margin-top:3px;">${r.complemento}</div>` : '';
        groupsHtml += `<tr><td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;"><div style="font-weight:600;color:#4f46e5;">${r.procedimentoNome || 'Não especificado'}</div>${comp}</td>`;
        groupsHtml += `<td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.tempo ? r.tempo + ' min' : '-'}</td>`;
        groupsHtml += `<td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(r.valor || 0)}</td></tr>`;
      });
      groupsHtml += `<tr><td style="text-align:right;font-weight:bold;padding:10px 15px;border-top:2px solid #e2e8f0;">Subtotal:</td><td style="text-align:right;font-weight:bold;padding:10px 15px;border-top:2px solid #e2e8f0;">${gTempo} min</td><td style="text-align:right;font-weight:bold;padding:10px 15px;border-top:2px solid #e2e8f0;">${new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(gValor)}</td></tr>`;
      groupsHtml += '</tbody></table></div>';
    });
    const cssText = 'body{font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;max-width:900px;margin:0 auto;padding:30px 20px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#4f46e5;color:#fff;padding:10px 15px;text-align:left;font-size:12px;text-transform:uppercase;font-weight:700}tr:nth-child(even){background:#f8fafc}@media print{body{padding:10px}}';
    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Avaliação - ' + (pacienteNome || 'Paciente') + '</title><sty' + 'le>' + cssText + '</sty' + 'le></head><body>' + '<div style="text-align:center;margin-bottom:25px;padding-bottom:15px;border-bottom:3px solid #4f46e5;">' + logoHtml + '<div style="font-size:20px;font-weight:bold;color:#4338ca;margin-bottom:4px;">' + (clinicaData.nome || '') + '</div><div>' + clinicaInfoHtml + '</div></div>' + '<div style="font-size:20px;font-weight:bold;color:#4338ca;margin:20px 0 8px;text-transform:uppercase;text-align:center;">Avaliação de Procedimentos</div>' + '<div style="text-align:center;color:#475569;margin-bottom:25px;font-size:15px;"><strong>Paciente:</strong> ' + (pacienteNome || 'Não informado') + '</div>' + groupsHtml + '<div style="text-align:right;font-size:18px;font-weight:bold;color:#4338ca;margin-top:20px;padding-top:15px;border-top:3px solid #4f46e5;">TOTAL GERAL: ' + new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(totalValor) + '</div>' + '</body></html>';
    registrarAuditoria({
      clinicaId: clinicaId!,
      acao: 'IMPRESSAO_AVALIACAO',
      entidade: 'avaliacao',
      pacienteId,
      pacienteNome,
      detalhes: 'Imprimiu avaliação com ' + records.length + ' procedimento(s)'
    });
    previewDocumentoPDF(htmlContent, {
      fileName: 'avaliacao-' + (pacienteNome || 'paciente').replace(/\s+/g, '-').toLowerCase() + '.pdf'
    });
  };
  if (!isLoaded) {
    return <div className="flex items-center justify-center h-full">
        <Loader2Icon className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>;
  }
  const procedimentoOptions = [{
    value: '',
    label: 'Selecione um procedimento...'
  }, ...catalog.map((p) => ({
    value: p.id,
    label: p.nome
  }))];
  const profissionalOptions = [{
    value: '',
    label: 'Selecione um profissional...'
  }, ...profissionais.map((p) => ({
    value: p.id,
    label: p.nome
  }))];
  return <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <ClipboardListIcon className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Avaliação de Procedimentos
            </h2>
            <p className="text-sm text-gray-500">
              Planeje procedimentos, valores e tempo estimado
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isSaving && <span className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2Icon className="w-4 h-4 animate-spin" /> Salvando...
            </span>}
          {!readOnly && <Button onClick={() => handleAddRecord()} disabled={isSaving} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            
              {isSaving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
              Nova Data
            </Button>}
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <PrinterIcon className="w-4 h-4" />
            Imprimir Tudo
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {records.length === 0 ? <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
              <ClipboardListIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">
                Nenhuma avaliação registrada
              </h3>
              <p className="text-gray-500 mt-1 mb-6">
                Adicione a primeira avaliação para planejar os procedimentos.
              </p>
              {!readOnly && <Button onClick={() => handleAddRecord()} disabled={isSaving} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              
                  <PlusIcon className="w-4 h-4" />
                  Nova Avaliação
                </Button>}
            </div> : <>
              {/* ⭐ DATE GROUP CARDS */}
              {dateGroups.map(([date, groupItems]) => {
            const groupLocked = groupItems.every((r) => r.bloqueado);
            const groupUnsigned = groupItems.filter((r) => !r.assinaturaBase64 && !r.bloqueado);
            const groupAllSigned = groupItems.every((r) => r.assinaturaBase64);
            const firstSig = groupItems.find((r) => r.assinaturaBase64);
            const groupProfId = groupItems[0]?.profissionalId || '';
            const groupValor = groupItems.reduce((s, r) => s + (Number(r.valor) || 0), 0);
            const groupTempo = groupItems.reduce((s, r) => s + (Number(r.tempo) || 0), 0);
            return <div key={date} ref={scrollToDate === date ? newGroupRef : undefined} className={`rounded-xl border overflow-hidden ${groupLocked ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white shadow-sm'}`}>
                  
                    {/* ⭐ GROUP HEADER */}
                    <div className={`p-4 border-b ${groupLocked ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50/50'}`}>
                    
                      {groupLocked && <div className="flex items-center gap-2 text-amber-800 bg-amber-100 border border-amber-300 rounded-lg px-3 py-1.5 text-sm font-medium mb-3">
                          <LockIcon className="w-4 h-4" />
                          Grupo travado — somente visualização
                        </div>}
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-shrink-0">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            Data
                          </label>
                          <Input type="date" value={date === 'sem-data' ? '' : date} onChange={(e) => handleGroupDateChange(date, e.target.value)} disabled={readOnly || groupLocked} className="w-44 h-9" />
                        
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">
                            <UserIcon className="w-3.5 h-3.5" />
                            Profissional
                          </label>
                          <Select value={groupProfId} onChange={(e) => handleGroupProfessionalChange(date, e.target.value)} options={profissionalOptions} disabled={readOnly || groupLocked} className="w-full h-9" />
                        
                        </div>
                        <div className="flex items-center gap-2 pb-0.5">
                          {!readOnly && !groupLocked && !groupAllSigned && <Button variant="outline" className="h-9 gap-1.5 text-sm border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => setSignGroupDate(date)}>
                          
                              <PenToolIcon className="w-3.5 h-3.5" />
                              Assinar
                            </Button>}
                          {!readOnly && !groupLocked && canLockAll && <Button variant="outline" className="h-9 gap-1.5 text-sm border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleLockGroup(date)}>
                          
                              <LockIcon className="w-3.5 h-3.5" />
                              Travar
                            </Button>}
                          <Button variant="outline" className="h-9 gap-1.5 text-sm" onClick={() => handlePrintGroup(date, groupItems)} title="Imprimir este grupo">
                          
                            <PrinterIcon className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Signature display */}
                      {firstSig && <div className="flex items-center gap-3 mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 w-fit">
                          <CheckCircleIcon className="w-4 h-4 text-green-600" />
                          <img src={firstSig.assinaturaBase64} alt="Assinatura" className="max-w-[150px] max-h-[40px] object-contain" />
                      
                          <span className="text-xs text-green-700">
                            {firstSig.assinadoEm ? new Date(firstSig.assinadoEm).toLocaleString('pt-BR') : 'Assinado'}
                          </span>
                          {groupAllSigned && <span className="text-xs text-green-600 font-medium">
                              ({groupItems.length} item(ns))
                            </span>}
                        </div>}
                    </div>

                    {/* ⭐ GROUP ITEMS */}
                    <div className="p-4 space-y-3">
                      {groupItems.map((record, idx) => <div key={record.id} className={`flex flex-col lg:flex-row gap-3 items-start p-3 rounded-lg border ${record.bloqueado ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100 bg-white'}`}>
                      
                          <div className="flex-shrink-0 w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700 mt-1">
                            {idx + 1}
                          </div>
                          <div className="w-full lg:flex-1 min-w-[180px]">
                            <Select value={String(record.procedimentoId || '')} onChange={(e) => handleUpdateRecord(record.id, 'procedimentoId', e.target.value)} options={procedimentoOptions} disabled={readOnly || !!record.bloqueado} className="w-full h-9 text-sm" />
                        
                            <Input placeholder="Complemento..." value={record.complemento || ''} onChange={(e) => setRecords((prev) => prev.map((r) => r.id === record.id ? {
                      ...r,
                      complemento: e.target.value
                    } : r))} onBlur={(e) => handleUpdateRecord(record.id, 'complemento', e.target.value)} disabled={readOnly || !!record.bloqueado} className="mt-1.5 text-sm h-8" />
                        
                          </div>
                          <div className="w-full lg:w-24 flex-shrink-0">
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                <ClockIcon className="h-3.5 w-3.5 text-gray-400" />
                              </div>
                              <input type="number" value={record.tempo || ''} onChange={(e) => setRecords((prev) => prev.map((r) => r.id === record.id ? {
                        ...r,
                        tempo: Number(e.target.value)
                      } : r))} onBlur={(e) => handleUpdateRecord(record.id, 'tempo', Number(e.target.value))} disabled={readOnly || !!record.bloqueado} className="w-full h-9 pl-7 pr-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:cursor-not-allowed" placeholder="min" />
                          
                            </div>
                          </div>
                          <div className="w-full lg:w-28 flex-shrink-0">
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                <DollarSignIcon className="h-3.5 w-3.5 text-gray-400" />
                              </div>
                              <input type="number" step="0.01" value={record.valor || ''} onChange={(e) => setRecords((prev) => prev.map((r) => r.id === record.id ? {
                        ...r,
                        valor: Number(e.target.value)
                      } : r))} onBlur={(e) => handleUpdateRecord(record.id, 'valor', Number(e.target.value))} disabled={readOnly || !!record.bloqueado} className="w-full h-9 pl-7 pr-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:cursor-not-allowed" placeholder="R$" />
                          
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex items-center pt-0.5">
                            {!readOnly && !record.bloqueado && !record.assinaturaBase64 && <button onClick={() => handleDeleteRecord(record.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
                          
                                  <Trash2Icon className="w-4 h-4" />
                                </button>}
                          </div>
                        </div>)}

                      {/* Add item to this group */}
                      {!readOnly && !groupLocked && <button onClick={() => handleAddRecord(date)} disabled={isSaving} className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                      
                          <PlusIcon className="w-4 h-4" />
                          Adicionar Procedimento
                        </button>}

                      {/* Group subtotals */}
                      {groupItems.length > 1 && <div className="flex justify-end gap-4 pt-2 border-t border-gray-100 text-sm">
                          <span className="text-gray-500">Subtotal:</span>
                          <span className="font-medium text-gray-700 flex items-center gap-1">
                            <ClockIcon className="w-3.5 h-3.5" />
                            {groupTempo} min
                          </span>
                          <span className="font-semibold text-indigo-700 flex items-center gap-1">
                            <DollarSignIcon className="w-3.5 h-3.5" />
                            {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format(groupValor)}
                          </span>
                        </div>}
                    </div>
                  </div>;
          })}

              {/* ⭐ Grand totals */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row justify-end items-end sm:items-center gap-6 shadow-sm">
                <div className="text-gray-600 font-medium">Total Geral:</div>
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-indigo-500" />
                  <span className="text-lg font-semibold text-indigo-900">
                    {Math.floor(totalTempo / 60)}h {totalTempo % 60}min
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSignIcon className="w-5 h-5 text-indigo-500" />
                  <span className="text-2xl font-bold text-indigo-900">
                    {new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                }).format(totalValor)}
                  </span>
                </div>
              </div>
            </>}
        </div>
      </div>

      {/* Signature Modal */}
      {signGroupDate && <SignatureModalContent onSave={(sig) => handleSignGroup(signGroupDate, sig)} onCancel={() => setSignGroupDate(null)} isSaving={isSaving} />}
    </div>;
}