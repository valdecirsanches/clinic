import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { SignaturePad } from '../../SignaturePad';
import { useToast } from '../../../hooks/useToast';
import { API_BASE_URL } from '../../../config/api';
import { previewDocumentoPDF } from '../../../utils/pdfGenerator';
import {
  PrinterIcon,
  PlusIcon,
  Trash2Icon,
  PenToolIcon,
  CheckCircleIcon,
  Loader2Icon,
  ClipboardIcon,
  XIcon,
  LockIcon,
  ShieldAlertIcon,
  CalendarIcon,
  UserIcon } from
'lucide-react';
import { registrarAuditoria } from '../../../utils/auditLog';
import { useConfiguracoesGlobais } from '../../../hooks/useConfiguracoesGlobais';
import { useDialog } from '../../../hooks/useDialog';
interface ProcedimentoEtapaProps {
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
  pacienteTelefone?: string;
}
interface ProcedimentoRecord {
  id: string;
  consultaId: string;
  pacienteId: string;
  data: string;
  procedimentoId: string;
  procedimentoNome: string;
  complemento: string;
  profissionalId: string;
  profissionalNome: string;
  assinaturaBase64: string;
  assinadoEm: string;
  bloqueado?: boolean;
}
interface CatalogItem {
  id: string;
  nome: string;
}
interface ProfissionalItem {
  id: string;
  nome: string;
  crm?: string;
  uf?: string;
  tipo?: string;
}
function SignatureModalContent({
  onSave,
  onCancel,
  isSaving,
  pacienteNome





}: {onSave: (sig: string) => void;onCancel: () => void;isSaving: boolean;pacienteNome?: string;}) {
  const [tempSig, setTempSig] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <PenToolIcon className="w-5 h-5 text-teal-600" />
            Assinatura do Paciente
          </h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded-full">
            
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {pacienteNome &&
        <p className="text-sm text-gray-500 mb-4">
            Paciente: <strong>{pacienteNome}</strong>
          </p>
        }
        <SignaturePad onChange={setTempSig} label="Assinatura do Paciente" />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
            onClick={() => {
              if (tempSig) onSave(tempSig);
            }}
            disabled={!tempSig || isSaving}>
            
            {isSaving ?
            <Loader2Icon className="w-4 h-4 animate-spin" /> :

            <CheckCircleIcon className="w-4 h-4" />
            }
            Confirmar Assinatura
          </Button>
        </div>
      </div>
    </div>);

}
export function ProcedimentoEtapa({
  pacienteId,
  atendimentoId,
  clinicaId,
  readOnly = false,
  profissionalDaConsulta,
  pacienteNome
}: ProcedimentoEtapaProps) {
  const { success, error } = useToast();
  const { confirm } = useDialog();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [records, setRecords] = useState<ProcedimentoRecord[]>([]);
  const recordsRef = useRef<ProcedimentoRecord[]>([]);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalItem[]>([]);
  const [usuarioLogadoTipo, setUsuarioLogadoTipo] = useState<string>('');
  const [usuarioLogado, setUsuarioLogado] = useState<{
    id?: string;
    nome?: string;
  }>({});
  const [signGroupDate, setSignGroupDate] = useState<string | null>(null);
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
  const procedimentoConfig = useConfiguracoesGlobais<{
    habilitado: boolean;
    restrito: boolean;
  }>('procedimento_config', {
    habilitado: true,
    restrito: false
  });
  // ⭐ Médico/dentista logado assina o próprio procedimento: o profissional é
  // ELE, sem escolha. A seleção existe apenas para administradores, que operam
  // o prontuário em nome de um profissional.
  const usuarioEhClinico =
  usuarioLogadoTipo === 'medico' || usuarioLogadoTipo === 'dentista';
  const profissionalLogado = useMemo<ProfissionalItem | null>(() => {
    if (!usuarioEhClinico) return null;
    const porId = usuarioLogado.id ?
    profissionais.find((p) => String(p.id) === usuarioLogado.id) :
    undefined;
    if (porId) return porId;
    const nome = (usuarioLogado.nome || '').trim().toLowerCase();
    const porNome = nome ?
    profissionais.find((p) => (p.nome || '').trim().toLowerCase() === nome) :
    undefined;
    if (porNome) return porNome;
    // Ainda não está na lista da clínica (ou ela não carregou): usa a sessão.
    return usuarioLogado.id ?
    { id: usuarioLogado.id, nome: usuarioLogado.nome || 'Profissional' } :
    null;
  }, [usuarioEhClinico, usuarioLogado.id, usuarioLogado.nome, profissionais]);

  const isRestrito =
  procedimentoConfig.valor.restrito &&
  !['medico', 'dentista', 'super_admin', 'admin'].includes(usuarioLogadoTipo);
  const isReadOnly = readOnly || isRestrito;
  const canLockAll = ['medico', 'dentista', 'super_admin', 'admin'].includes(
    usuarioLogadoTipo
  );
  // ⭐ AUTORIA É IMUTÁVEL: o grupo é (data + profissional), nunca só a data.
  // Dois profissionais que atendem o mesmo paciente no mesmo dia geram DOIS
  // blocos independentes — o registro de cada um permanece no nome de quem o
  // fez, e ninguém herda ou sobrescreve procedimento alheio.
  const dateGroups = useMemo(() => {
    const groups = new Map<string, ProcedimentoRecord[]>();
    records.forEach((r) => {
      const key = `${r.data || 'sem-data'}|${r.profissionalId || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records]);
  // ⭐ Auto-scroll to new group
  useEffect(() => {
    if (scrollToDate && newGroupRef.current) {
      newGroupRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      const firstSelect = newGroupRef.current.querySelector('select');
      if (firstSelect) setTimeout(() => firstSelect.focus(), 400);
      setScrollToDate(null);
    }
  }, [scrollToDate, dateGroups]);
  // Load data
  useEffect(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      setUsuarioLogadoTipo(parsed.usuario?.tipo || '');
      setUsuarioLogado({
        id: parsed.usuario?.id ? String(parsed.usuario.id) : undefined,
        nome: parsed.usuario?.nome || ''
      });
    }
    async function loadData() {
      if (!clinicaId) return;
      try {
        setIsLoaded(false);
        const [clinicaRes, catalogRes, profRes, recordsRes] = await Promise.all(
          [
          fetch(`${API_BASE_URL}/api/clinicas/${clinicaId}`).
          then((r) => r.json()).
          catch(() => null),
          fetch(`${API_BASE_URL}/api/procedimentos?clinicaId=${clinicaId}`).
          then((r) => r.json()).
          catch(() => []),
          fetch(`${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`).
          then((r) => r.json()).
          catch(() => []),
          fetch(
            `${API_BASE_URL}/api/procedimentos-prontuario?clinicaId=${clinicaId}` + (
            pacienteId ? `&pacienteId=${pacienteId}` : '') + (
            atendimentoId ? `&consultaId=${atendimentoId}` : '')
          ).
          then((r) => r.ok ? r.json() : []).
          catch(() => [])]

        );
        if (clinicaRes) setClinicaData(clinicaRes);
        setCatalog(catalogRes || []);
        setProfissionais(
          (profRes || []).filter(
            (u: ProfissionalItem) =>
            u.tipo === 'medico' || u.tipo === 'dentista'
          )
        );
        setRecords(recordsRes || []);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        error('Erro', 'Não foi possível carregar os dados.');
      } finally {
        setIsLoaded(true);
      }
    }
    loadData();
  }, [clinicaId, atendimentoId, pacienteId]);
  // CRUD
  const handleUpdateRecord = async (
  id: string,
  field: keyof ProcedimentoRecord,
  value: any) =>
  {
    if (isRestrito) {
      error(
        'Acesso Restrito',
        'Apenas médicos e dentistas podem alterar procedimentos.'
      );
      return;
    }
    const existingRecord = recordsRef.current.find((r) => r.id === id);
    if (!existingRecord) return;
    const updated: ProcedimentoRecord = {
      ...existingRecord,
      [field]: value
    };
    if (field === 'procedimentoId') {
      const proc = catalog.find((p) => String(p.id) === String(value));
      updated.procedimentoNome = proc ? proc.nome : '';
    }
    if (field === 'profissionalId') {
      const prof = profissionais.find((p) => String(p.id) === String(value));
      updated.profissionalNome = prof ? prof.nome : '';
    }
    setRecords((prev) => prev.map((r) => r.id === id ? updated : r));
    recordsRef.current = recordsRef.current.map((r) =>
    r.id === id ? updated : r
    );
    if (!clinicaId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/procedimentos-prontuario/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...updated,
            clinicaId
          })
        }
      );
      if (!res.ok) {
        error('Erro ao salvar', `Não foi possível salvar (${res.status}).`);
        try {
          let reloadUrl = `${API_BASE_URL}/api/procedimentos-prontuario?clinicaId=${clinicaId}`;
          if (pacienteId) reloadUrl += `&pacienteId=${pacienteId}`;
          if (atendimentoId) reloadUrl += `&consultaId=${atendimentoId}`;
          const reloadRes = await fetch(reloadUrl);
          if (reloadRes.ok) setRecords((await reloadRes.json()) || []);
        } catch (_) {}
        return;
      }
      const savedData = await res.json();
      if (savedData?.id) {
        const merged = {
          ...savedData,
          bloqueado: !!savedData.bloqueado
        };
        setRecords((prev) =>
        prev.map((r) =>
        r.id === savedData.id ?
        {
          ...r,
          ...merged
        } :
        r
        )
        );
        recordsRef.current = recordsRef.current.map((r) =>
        r.id === savedData.id ?
        {
          ...r,
          ...merged
        } :
        r
        );
      }
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'EDICAO_PROCEDIMENTO',
        entidade: 'procedimento',
        entidadeId: id,
        pacienteId,
        pacienteNome,
        detalhes: 'Campo alterado: ' + field
      });
    } catch (err) {
      error('Erro de conexão', 'Não foi possível salvar.');
    }
  };
  const handleAddRecord = async (date?: string) => {
    if (isRestrito) {
      error(
        'Acesso Restrito',
        'Apenas médicos e dentistas podem adicionar procedimentos.'
      );
      return;
    }
    if (!clinicaId || !pacienteId) {
      error('Erro', 'Dados não disponíveis. Recarregue a página.');
      return;
    }
    const consultaId = atendimentoId || 'consulta_' + Date.now();
    const targetDate = date || new Date().toISOString().split('T')[0];
    // O autor do novo registro é sempre quem está logado (quando é clínico).
    // Ele NUNCA altera o que outro profissional lançou: se a data já tem um
    // bloco de outro profissional, este registro abre um bloco próprio.
    const profId = String(
      profissionalLogado?.id || profissionalDaConsulta?.id || ''
    );
    const profNome =
    profissionalLogado?.nome ||
    profissionais.find((p) => String(p.id) === profId)?.nome ||
    profissionalDaConsulta?.nome ||
    '';
    const isNewGroup = !recordsRef.current.some(
      (r) =>
      r.data === targetDate && String(r.profissionalId || '') === profId
    );
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/procedimentos-prontuario`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          consultaId,
          pacienteId,
          data: targetDate,
          procedimentoId: '',
          procedimentoNome: '',
          complemento: '',
          profissionalId: profId,
          profissionalNome: profNome,
          bloqueado: false
        })
      });
      if (!res.ok) throw new Error('Falha ao criar registro');
      const newRecord = await res.json();
      setRecords((prev) => [...prev, newRecord]);
      if (isNewGroup) setScrollToDate(targetDate);
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'CRIACAO_PROCEDIMENTO',
        entidade: 'procedimento',
        entidadeId: newRecord.id,
        pacienteId,
        pacienteNome,
        detalhes: 'Novo procedimento adicionado'
      });
    } catch (err) {
      error('Erro', 'Não foi possível adicionar o procedimento.');
    } finally {
      setIsSaving(false);
    }
  };
  const handleDeleteRecord = async (id: string) => {
    if (isRestrito) {
      error(
        'Acesso Restrito',
        'Apenas médicos e dentistas podem remover procedimentos.'
      );
      return;
    }
    if (!clinicaId) return;
    const record = records.find((r) => r.id === id);
    if (record?.bloqueado) {
      error('Acesso Negado', 'Procedimento bloqueado.');
      return;
    }
    const confirmed = await confirm(
      'Remover Procedimento',
      'Tem certeza que deseja remover este procedimento?',
      'Remover',
      'Cancelar'
    );
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/procedimentos-prontuario/${id}?clinicaId=${clinicaId}`,
        {
          method: 'DELETE'
        }
      );
      if (!res.ok) throw new Error('Falha ao deletar');
      setRecords((prev) => prev.filter((r) => r.id !== id));
      recordsRef.current = recordsRef.current.filter((r) => r.id !== id);
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'EXCLUSAO_PROCEDIMENTO',
        entidade: 'procedimento',
        entidadeId: id,
        pacienteId,
        pacienteNome,
        detalhes:
        'Procedimento removido: ' + (record?.procedimentoNome || 'N/A')
      });
      success('Removido', 'Procedimento removido com sucesso.');
    } catch (err) {
      error('Erro', 'Não foi possível remover o procedimento.');
    } finally {
      setIsSaving(false);
    }
  };
  // Group-level handlers
  // Um grupo é sempre (data + profissional). Os handlers recebem os dois para
  // nunca tocarem no bloco de outro profissional no mesmo dia.
  const doGrupo = (date: string, profId: string) => (r: ProcedimentoRecord) =>
  (r.data || 'sem-data') === date &&
  String(r.profissionalId || '') === String(profId || '');

  const handleGroupDateChange = async (
  oldDate: string,
  profId: string,
  newDate: string) =>
  {
    for (const record of recordsRef.current.filter(
      (r) => doGrupo(oldDate, profId)(r) && !r.bloqueado
    )) {
      await handleUpdateRecord(record.id, 'data', newDate);
    }
  };
  const handleGroupProfessionalChange = async (
  date: string,
  profIdAtual: string,
  novoProfId: string) =>
  {
    const novoNome =
    profissionais.find((p) => String(p.id) === String(novoProfId))?.nome || '';
    for (const record of recordsRef.current.filter(
      (r) => doGrupo(date, profIdAtual)(r) && !r.bloqueado
    )) {
      await handleUpdateRecord(record.id, 'profissionalId', novoProfId);
      if (novoNome)
      await handleUpdateRecord(record.id, 'profissionalNome', novoNome);
    }
  };

  const handleSignGroup = async (
  groupKey: string,
  signatureBase64: string) =>
  {
    if (!clinicaId) return;
    const sep = groupKey.lastIndexOf('|');
    const date = groupKey.slice(0, sep);
    const profId = groupKey.slice(sep + 1);
    setIsSaving(true);
    try {
      const toSign = recordsRef.current.filter(
        (r) => doGrupo(date, profId)(r) && !r.assinaturaBase64 && !r.bloqueado
      );
      for (const record of toSign) {
        const res = await fetch(
          `${API_BASE_URL}/api/procedimentos-prontuario/${record.id}/assinatura`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId,
              assinaturaBase64: signatureBase64
            })
          }
        );
        if (!res.ok) throw new Error('Falha ao salvar assinatura');
        const { assinadoEm } = await res.json();
        setRecords((prev) =>
        prev.map((r) =>
        r.id === record.id ?
        {
          ...r,
          assinaturaBase64: signatureBase64,
          assinadoEm
        } :
        r
        )
        );
        recordsRef.current = recordsRef.current.map((r) =>
        r.id === record.id ?
        {
          ...r,
          assinaturaBase64: signatureBase64,
          assinadoEm
        } :
        r
        );
      }
      success(
        'Assinatura salva',
        `${toSign.length} procedimento(s) assinado(s).`
      );
      registrarAuditoria({
        clinicaId: clinicaId!,
        acao: 'ASSINATURA_PROCEDIMENTO',
        entidade: 'procedimento',
        entidadeId: toSign.map((r) => r.id).join(','),
        pacienteId,
        pacienteNome,
        detalhes: `Paciente assinou ${toSign.length} procedimento(s)`
      });
    } catch (err) {
      error('Erro', 'Não foi possível salvar a assinatura.');
    } finally {
      setIsSaving(false);
      setSignGroupDate(null);
    }
  };
  const handleLockGroup = async (date: string, profId: string) => {
    const groupRecords = recordsRef.current.filter(doGrupo(date, profId));
    const unsigned = groupRecords.filter(
      (r) => !r.assinaturaBase64 && !r.bloqueado
    );
    if (unsigned.length > 0) {
      error(
        'Sem assinatura',
        `${unsigned.length} item(ns) sem assinatura neste grupo.`
      );
      return;
    }
    setIsSaving(true);
    try {
      for (const record of groupRecords) {
        if (!record.bloqueado)
        await handleUpdateRecord(record.id, 'bloqueado', true);
      }
      success('Grupo Travado', 'Procedimentos deste grupo foram bloqueados.');
    } catch (err) {
      error('Erro', 'Não foi possível travar o grupo.');
    } finally {
      setIsSaving(false);
    }
  };
  // Print single group
  const handlePrintGroup = (date: string, items: ProcedimentoRecord[]) => {
    const clinicaInfoParts: string[] = [];
    if (clinicaData.endereco) clinicaInfoParts.push(clinicaData.endereco);
    if (clinicaData.telefone)
    clinicaInfoParts.push('Tel: ' + clinicaData.telefone);
    if (clinicaData.email) clinicaInfoParts.push(clinicaData.email);
    if (clinicaData.cnpj) clinicaInfoParts.push('CNPJ: ' + clinicaData.cnpj);
    const logoHtml = clinicaData.logoUrl ?
    `<img src="${clinicaData.logoUrl}" style="max-height:60px;max-width:180px;margin:0 auto 8px;display:block;" alt="Logo" />` :
    '';
    const clinicaInfoHtml = clinicaInfoParts.
    map(
      (info) => `<span style="font-size:11px;color:#64748b;">${info}</span>`
    ).
    join(' &nbsp;|&nbsp; ');
    const dataFormatada =
    date !== 'sem-data' ?
    new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') :
    'Sem data';
    const profNome = items[0]?.profissionalNome || '-';
    let rowsHtml = '';
    items.forEach((r) => {
      const comp = r.complemento ?
      `<div style="font-size:12px;color:#64748b;margin-top:3px;">${r.complemento}</div>` :
      '';
      rowsHtml += `<tr><td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;"><div style="font-weight:600;color:#0f766e;">${r.procedimentoNome || 'Não especificado'}</div>${comp}</td></tr>`;
    });
    const cssText =
    'body{font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;max-width:900px;margin:0 auto;padding:30px 20px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#0d9488;color:#fff;padding:10px 15px;text-align:left;font-size:12px;text-transform:uppercase;font-weight:700}tr:nth-child(even){background:#f8fafc}@media print{body{padding:10px}}';
    const htmlContent =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Procedimentos - ' +
    dataFormatada +
    '</title><sty' +
    'le>' +
    cssText +
    '</sty' +
    'le></head><body>' +
    '<div style="text-align:center;margin-bottom:25px;padding-bottom:15px;border-bottom:3px solid #0d9488;">' +
    logoHtml +
    '<div style="font-size:20px;font-weight:bold;color:#0f766e;margin-bottom:4px;">' + (
    clinicaData.nome || '') +
    '</div><div>' +
    clinicaInfoHtml +
    '</div></div>' +
    '<div style="font-size:20px;font-weight:bold;color:#0f766e;margin:20px 0 8px;text-transform:uppercase;text-align:center;">Registro de Procedimentos</div>' +
    '<div style="text-align:center;color:#475569;margin-bottom:5px;font-size:15px;"><strong>Paciente:</strong> ' + (
    pacienteNome || 'Não informado') +
    '</div>' +
    '<div style="text-align:center;color:#475569;margin-bottom:20px;font-size:14px;"><strong>Data:</strong> ' +
    dataFormatada +
    ' &nbsp;|&nbsp; <strong>Profissional:</strong> ' +
    profNome +
    '</div>' +
    '<table><thead><tr><th>Procedimento</th></tr></thead><tbody>' +
    rowsHtml +
    '</tbody></table></body></html>';
    previewDocumentoPDF(htmlContent, {
      fileName: 'procedimentos-' + dataFormatada + '.pdf'
    });
  };
  // Print
  const handlePrint = () => {
    if (records.length === 0) {
      error('Aviso', 'Não há procedimentos para imprimir.');
      return;
    }
    const clinicaInfoParts: string[] = [];
    if (clinicaData.endereco) clinicaInfoParts.push(clinicaData.endereco);
    if (clinicaData.telefone)
    clinicaInfoParts.push('Tel: ' + clinicaData.telefone);
    if (clinicaData.email) clinicaInfoParts.push(clinicaData.email);
    if (clinicaData.cnpj) clinicaInfoParts.push('CNPJ: ' + clinicaData.cnpj);
    const logoHtml = clinicaData.logoUrl ?
    `<img src="${clinicaData.logoUrl}" style="max-height:60px;max-width:180px;margin:0 auto 8px;display:block;" alt="Logo" />` :
    '';
    const clinicaInfoHtml = clinicaInfoParts.
    map(
      (info) => `<span style="font-size:11px;color:#64748b;">${info}</span>`
    ).
    join(' &nbsp;|&nbsp; ');
    let groupsHtml = '';
    dateGroups.forEach(([, items]) => {
      const date = items[0]?.data || 'sem-data';
      const dataFormatada =
      date !== 'sem-data' ?
      new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') :
      'Sem data';
      const profNome = items[0]?.profissionalNome || '-';
      groupsHtml += `<div style="margin-bottom:25px;"><h3 style="color:#0f766e;font-size:16px;margin-bottom:5px;">${dataFormatada} — ${profNome}</h3>`;
      groupsHtml +=
      '<table><thead><tr><th>Procedimento</th></tr></thead><tbody>';
      items.forEach((r) => {
        const comp = r.complemento ?
        `<div style="font-size:12px;color:#64748b;margin-top:3px;">${r.complemento}</div>` :
        '';
        groupsHtml += `<tr><td style="padding:10px 15px;border-bottom:1px solid #e2e8f0;"><div style="font-weight:600;color:#0f766e;">${r.procedimentoNome || 'Não especificado'}</div>${comp}</td></tr>`;
      });
      groupsHtml += '</tbody></table></div>';
    });
    const cssText =
    'body{font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;max-width:900px;margin:0 auto;padding:30px 20px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#0d9488;color:#fff;padding:10px 15px;text-align:left;font-size:12px;text-transform:uppercase;font-weight:700}tr:nth-child(even){background:#f8fafc}@media print{body{padding:10px}}';
    const htmlContent =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Procedimentos - ' + (
    pacienteNome || 'Paciente') +
    '</title><sty' +
    'le>' +
    cssText +
    '</sty' +
    'le></head><body>' +
    '<div style="text-align:center;margin-bottom:25px;padding-bottom:15px;border-bottom:3px solid #0d9488;">' +
    logoHtml +
    '<div style="font-size:20px;font-weight:bold;color:#0f766e;margin-bottom:4px;">' + (
    clinicaData.nome || '') +
    '</div><div>' +
    clinicaInfoHtml +
    '</div></div>' +
    '<div style="font-size:20px;font-weight:bold;color:#0f766e;margin:20px 0 8px;text-transform:uppercase;text-align:center;">Registro de Procedimentos</div>' +
    '<div style="text-align:center;color:#475569;margin-bottom:25px;font-size:15px;"><strong>Paciente:</strong> ' + (
    pacienteNome || 'Não informado') +
    '</div>' +
    groupsHtml +
    '</body></html>';
    registrarAuditoria({
      clinicaId: clinicaId!,
      acao: 'IMPRESSAO_PROCEDIMENTOS',
      entidade: 'procedimento',
      pacienteId,
      pacienteNome,
      detalhes: 'Imprimiu ' + records.length + ' procedimento(s)'
    });
    previewDocumentoPDF(htmlContent, {
      fileName:
      'procedimentos-' +
      (pacienteNome || 'paciente').replace(/\s+/g, '-').toLowerCase() +
      '.pdf'
    });
  };
  if (!isLoaded)
  return (
    <div className="flex items-center justify-center h-full">
        <Loader2Icon className="w-8 h-8 text-teal-600 animate-spin" />
      </div>);

  // Options with fallback
  const catalogOptions = catalog.map((p) => ({
    value: String(p.id),
    label: p.nome
  }));
  const catalogIdSet = new Set(catalogOptions.map((o) => o.value));
  const fallbackProcOptions: {
    value: string;
    label: string;
  }[] = [];
  records.forEach((r) => {
    const pid = String(r.procedimentoId || '');
    if (
    pid &&
    !catalogIdSet.has(pid) &&
    !fallbackProcOptions.find((f) => f.value === pid))
    {
      fallbackProcOptions.push({
        value: pid,
        label: r.procedimentoNome ?
        `${r.procedimentoNome} (salvo)` :
        `ID: ${pid}`
      });
    }
  });
  const procedimentoOptions = [
  {
    value: '',
    label: 'Selecione um procedimento...'
  },
  ...catalogOptions,
  ...fallbackProcOptions];

  const profOptions = profissionais.map((p) => ({
    value: String(p.id),
    label: p.nome
  }));
  const profIdSet = new Set(profOptions.map((o) => o.value));
  const fallbackProfOptions: {
    value: string;
    label: string;
  }[] = [];
  records.forEach((r) => {
    const pid = String(r.profissionalId || '');
    if (
    pid &&
    !profIdSet.has(pid) &&
    !fallbackProfOptions.find((f) => f.value === pid))
    {
      fallbackProfOptions.push({
        value: pid,
        label: r.profissionalNome ?
        `${r.profissionalNome} (salvo)` :
        `ID: ${pid}`
      });
    }
  });
  const profissionalOptions = [
  {
    value: '',
    label: 'Selecione um profissional...'
  },
  ...profOptions,
  ...fallbackProfOptions];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-2 rounded-lg">
            <ClipboardIcon className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Procedimentos Realizados
            </h2>
            <p className="text-sm text-gray-500">
              Registre os procedimentos e colete assinaturas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isSaving &&
          <span className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2Icon className="w-4 h-4 animate-spin" /> Salvando...
            </span>
          }
          {!isReadOnly &&
          <Button
            onClick={() => handleAddRecord()}
            disabled={isSaving}
            className="gap-2 bg-teal-600 hover:bg-teal-700">
            
              {isSaving ?
            <Loader2Icon className="w-4 h-4 animate-spin" /> :

            <PlusIcon className="w-4 h-4" />
            }
              Nova Data
            </Button>
          }
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <PrinterIcon className="w-4 h-4" />
            Imprimir Tudo
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {records.length === 0 ?
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
              <ClipboardIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">
                Nenhum procedimento registrado
              </h3>
              {isReadOnly ?
            <p className="text-gray-500 mt-1 mb-2">
                  {readOnly ? '🔒 Prontuário assinado.' : '🔒 Sem permissão.'}
                </p> :

            <>
                  <p className="text-gray-500 mt-1 mb-6">
                    Adicione o primeiro procedimento para este atendimento.
                  </p>
                  <Button
                onClick={() => handleAddRecord()}
                disabled={isSaving}
                className="gap-2">
                
                    <PlusIcon className="w-4 h-4" />
                    Novo Procedimento
                  </Button>
                </>
            }
            </div> :

          <>
              {/* DATE GROUP CARDS */}
              {dateGroups.map(([groupKey, groupItems]) => {
              const groupLocked = groupItems.every((r) => r.bloqueado);
              const groupAllSigned = groupItems.every(
                (r) => r.assinaturaBase64
              );
              const firstSig = groupItems.find((r) => r.assinaturaBase64);
              const date = groupItems[0]?.data || 'sem-data';
              const groupProfId = String(groupItems[0]?.profissionalId || '');
              const groupProfNome =
              groupItems[0]?.profissionalNome ||
              profissionais.find((p) => String(p.id) === groupProfId)?.
              nome ||
              '';
              // Bloco de OUTRO profissional: é só leitura para o clínico
              // logado. A autoria de quem executou não se altera.
              const deOutroProfissional = Boolean(
                profissionalLogado &&
                groupProfId &&
                groupProfId !== String(profissionalLogado.id)
              );
              const grupoSomenteLeitura = isReadOnly || deOutroProfissional;
              return (
                <div
                  key={groupKey}
                  ref={scrollToDate === date ? newGroupRef : undefined}
                  className={`rounded-xl border overflow-hidden ${groupLocked ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white shadow-sm'}`}>
                  
                    {/* GROUP HEADER */}
                    <div
                    className={`p-4 border-b ${groupLocked ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50/50'}`}>
                    
                      {groupLocked &&
                    <div className="flex items-center gap-2 text-amber-800 bg-amber-100 border border-amber-300 rounded-lg px-3 py-1.5 text-sm font-medium mb-3">
                          <LockIcon className="w-4 h-4" />
                          Grupo travado — somente visualização
                        </div>
                    }
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-shrink-0">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            Data
                          </label>
                          <Input
                          type="date"
                          value={date === 'sem-data' ? '' : date}
                          onChange={(e) =>
                          handleGroupDateChange(
                            date,
                            groupProfId,
                            e.target.value
                          )
                          }
                          disabled={grupoSomenteLeitura || groupLocked}
                          className="w-44 h-9" />
                        
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">
                            <UserIcon className="w-3.5 h-3.5" />
                            Profissional
                          </label>
                          {profissionalLogado ?
                        // Autoria fixa: mostra QUEM EXECUTOU, sempre.
                        // Um clínico logado nunca troca o responsável de
                        // um registro — nem o próprio, nem o de outro.
                        <p className="h-9 flex items-center text-sm font-medium text-gray-900">
                              {groupProfNome || '—'}
                              {deOutroProfissional &&
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                  <LockIcon className="w-3 h-3" />
                                  Outro profissional
                                </span>
                          }
                            </p> :

                        <Select
                          value={groupProfId}
                          onChange={(e) =>
                          handleGroupProfessionalChange(
                            date,
                            groupProfId,
                            e.target.value
                          )
                          }
                          options={profissionalOptions}
                          disabled={isReadOnly || groupLocked}
                          className="w-full h-9" />

                        }
                        </div>
                        <div className="flex items-center gap-2 pb-0.5">
                          {!grupoSomenteLeitura &&
                        !groupLocked &&
                        !groupAllSigned &&
                        <Button
                          variant="outline"
                          className="h-9 gap-1.5 text-sm border-teal-200 text-teal-700 hover:bg-teal-50"
                          onClick={() => setSignGroupDate(groupKey)}>
                          
                                <PenToolIcon className="w-3.5 h-3.5" />
                                Assinar
                              </Button>
                        }
                          {!grupoSomenteLeitura && !groupLocked && canLockAll &&
                        <Button
                          variant="outline"
                          className="h-9 gap-1.5 text-sm border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => handleLockGroup(date, groupProfId)}>
                          
                              <LockIcon className="w-3.5 h-3.5" />
                              Travar
                            </Button>
                        }
                          <Button
                          variant="outline"
                          className="h-9 gap-1.5 text-sm"
                          onClick={() => handlePrintGroup(date, groupItems)}
                          title="Imprimir este grupo">
                          
                            <PrinterIcon className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {firstSig &&
                    <div className="flex items-center gap-3 mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 w-fit">
                          <CheckCircleIcon className="w-4 h-4 text-green-600" />
                          <img
                        src={firstSig.assinaturaBase64}
                        alt="Assinatura"
                        className="max-w-[150px] max-h-[40px] object-contain" />
                      

                          <span className="text-xs text-green-700">
                            {firstSig.assinadoEm ?
                        new Date(firstSig.assinadoEm).toLocaleString(
                          'pt-BR'
                        ) :
                        'Assinado'}
                          </span>
                          {groupAllSigned &&
                      <span className="text-xs text-green-600 font-medium">
                              ({groupItems.length} item(ns))
                            </span>
                      }
                        </div>
                    }
                    </div>

                    {/* GROUP ITEMS */}
                    <div className="p-4 space-y-3">
                      {groupItems.map((record, idx) =>
                    <div
                      key={record.id}
                      className={`flex flex-col lg:flex-row gap-3 items-start p-3 rounded-lg border ${record.bloqueado ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100 bg-white'}`}>
                      
                          <div className="flex-shrink-0 w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center text-xs font-bold text-teal-700 mt-1">
                            {idx + 1}
                          </div>
                          <div className="w-full lg:flex-1 min-w-[200px]">
                            <Select
                          value={String(record.procedimentoId || '')}
                          onChange={(e) =>
                          handleUpdateRecord(
                            record.id,
                            'procedimentoId',
                            e.target.value
                          )
                          }
                          options={procedimentoOptions}
                          disabled={grupoSomenteLeitura || !!record.bloqueado}
                          className="w-full h-9 text-sm" />
                        

                            <Input
                          placeholder="Complemento..."
                          value={record.complemento || ''}
                          onChange={(e) =>
                          setRecords((prev) =>
                          prev.map((r) =>
                          r.id === record.id ?
                          {
                            ...r,
                            complemento: e.target.value
                          } :
                          r
                          )
                          )
                          }
                          onBlur={(e) =>
                          handleUpdateRecord(
                            record.id,
                            'complemento',
                            e.target.value
                          )
                          }
                          disabled={grupoSomenteLeitura || !!record.bloqueado}
                          className="mt-1.5 text-sm h-8" />
                        
                          </div>
                          <div className="flex-shrink-0 flex items-center pt-0.5">
                            {!grupoSomenteLeitura &&
                        !record.bloqueado &&
                        !record.assinaturaBase64 &&
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remover">
                          
                                  <Trash2Icon className="w-4 h-4" />
                                </button>
                        }
                          </div>
                        </div>
                    )}
                      {!isReadOnly && !groupLocked &&
                    <button
                      onClick={() => handleAddRecord(date)}
                      disabled={isSaving}
                      className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                      
                          <PlusIcon className="w-4 h-4" />
                          {deOutroProfissional ?
                      'Adicionar procedimento em meu nome nesta data' :
                      'Adicionar Procedimento'}
                        </button>
                    }
                    </div>
                  </div>);

            })}

              {/* New group button */}
            </>
          }
        </div>
      </div>

      {/* Signature Modal */}
      {signGroupDate &&
      <SignatureModalContent
        onSave={(sig) => handleSignGroup(signGroupDate, sig)}
        onCancel={() => setSignGroupDate(null)}
        isSaving={isSaving}
        pacienteNome={pacienteNome} />

      }
    </div>);

}