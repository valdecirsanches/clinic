import React, { useCallback, useEffect, useState, Component } from 'react';
import { SaveIcon, CheckCircleIcon, ClockIcon, PrinterIcon } from 'lucide-react';
import { Odontograma } from '../../Odontograma';
import { resolverConselho } from '../../../utils/especialidadeHelper';
interface OdontogramaData {
  [toothNumber: string]: {
    status:
    'saudavel' |
    'cariado' |
    'restaurado' |
    'extraido' |
    'tratamento_canal' |
    'protese' |
    'implante';
    faces?: {
      oclusal?: boolean;
      mesial?: boolean;
      distal?: boolean;
      vestibular?: boolean;
      lingual?: boolean;
    };
    observacao?: string;
  };
}
interface OdontogramaEtapaProps {
  data?: OdontogramaData;
  onSave?: (data: OdontogramaData) => Promise<void>;
  onChange?: (data: OdontogramaData) => void;
  readOnly?: boolean;
  pacienteId?: string;
  atendimentoId?: string | null;
  clinicaId?: string;
  // Print context
  pacienteNome?: string;
  pacienteDataNascimento?: string;
  profissionalNome?: string;
  profissionalCrm?: string;
  profissionalUf?: string;
  profissionalTipo?: string;
  profissionalTitulo?: string;
  profissionalCabecalho?: string;
  profissionalEspecialidade?: string;
  profissionalRqes?: any[];
}
const STATUS_LABELS: Record<string, string> = {
  saudavel: 'Saudável',
  cariado: 'Cariado',
  restaurado: 'Restaurado',
  extraido: 'Extraído',
  tratamento_canal: 'Trat. Canal',
  protese: 'Prótese',
  implante: 'Implante'
};
const STATUS_COLORS: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
  }> =
{
  saudavel: {
    bg: '#ffffff',
    border: '#d1d5db',
    text: '#374151'
  },
  cariado: {
    bg: '#fee2e2',
    border: '#f87171',
    text: '#991b1b'
  },
  restaurado: {
    bg: '#dbeafe',
    border: '#60a5fa',
    text: '#1e40af'
  },
  extraido: {
    bg: '#d1d5db',
    border: '#6b7280',
    text: '#1f2937'
  },
  tratamento_canal: {
    bg: '#ede9fe',
    border: '#a78bfa',
    text: '#5b21b6'
  },
  protese: {
    bg: '#fef3c7',
    border: '#fbbf24',
    text: '#92400e'
  },
  implante: {
    bg: '#d1fae5',
    border: '#34d399',
    text: '#065f46'
  }
};
const QUADRANTS = {
  superior_direito: ['18', '17', '16', '15', '14', '13', '12', '11'],
  superior_esquerdo: ['21', '22', '23', '24', '25', '26', '27', '28'],
  inferior_esquerdo: ['31', '32', '33', '34', '35', '36', '37', '38'],
  inferior_direito: ['48', '47', '46', '45', '44', '43', '42', '41']
};
export function OdontogramaEtapa({
  data,
  onSave,
  onChange,
  readOnly = false,
  pacienteId,
  atendimentoId,
  clinicaId,
  pacienteNome,
  pacienteDataNascimento,
  profissionalNome,
  profissionalCrm,
  profissionalUf,
  profissionalTipo,
  profissionalTitulo,
  profissionalCabecalho,
  profissionalEspecialidade,
  profissionalRqes
}: OdontogramaEtapaProps) {
  const [odontogramaData, setOdontogramaData] = useState<OdontogramaData>(
    data || {}
  );
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  useEffect(() => {
    if (data) {
      setOdontogramaData(data);
    }
  }, [data]);
  const handleChange = useCallback(
    (newData: OdontogramaData) => {
      setOdontogramaData(newData);
      setHasChanges(true);
      onChange?.(newData);
    },
    [onChange]
  );
  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(odontogramaData);
      setLastSaved(new Date());
      setHasChanges(false);
    } catch (err) {
      console.error('Erro ao salvar odontograma:', err);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, odontogramaData]);
  useEffect(() => {
    if (!hasChanges || readOnly || !onSave) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 3000);
    return () => clearTimeout(timer);
  }, [odontogramaData, hasChanges, readOnly, onSave, handleSave]);
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    return lastSaved.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  // ⭐ Impressão padronizada do odontograma
  const handleImprimir = useCallback(() => {
    // Clinic info from session
    const sessaoStr = localStorage.getItem('sessao');
    let clinicaNome = '';
    let clinicaEndereco = '';
    let clinicaTelefone = '';
    let clinicaEmail = '';
    let clinicaLogoUrl = '';
    let operadoraLogoUrl = '';
    if (sessaoStr) {
      try {
        const sessao = JSON.parse(sessaoStr);
        const cl = sessao.clinicaAtual || {};
        clinicaNome = cl.nome || cl.nomeFantasia || '';
        clinicaEndereco = [cl.endereco, cl.numero, cl.bairro, cl.cidade, cl.uf].
        filter(Boolean).
        join(', ');
        clinicaTelefone = cl.telefone || '';
        clinicaEmail = cl.email || '';
        clinicaLogoUrl = cl.logoUrl || '';
        operadoraLogoUrl = sessao.operadoraSelecionada?.logoUrl || '';
      } catch {

        /* ignore */}
    }
    // ⭐ FIX: CRO para dentista (por tipo OU especialidade odontológica)
    const prefixoConselho = resolverConselho(
      profissionalTipo,
      profissionalEspecialidade,
      undefined,
      profissionalCrm
    );
    const tituloDisplay = profissionalTitulo ? profissionalTitulo + ' ' : '';
    const profNomeDisplay = profissionalNome ?
    tituloDisplay + profissionalNome :
    clinicaNome;
    // Age
    let idade: number | null = null;
    if (pacienteDataNascimento) {
      const nascimento = new Date(pacienteDataNascimento);
      const hoje = new Date();
      idade = hoje.getFullYear() - nascimento.getFullYear();
      const m = hoje.getMonth() - nascimento.getMonth();
      if (m < 0 || m === 0 && hoje.getDate() < nascimento.getDate()) idade--;
    }
    const idadeStr = idade !== null ? ` — ${idade} anos` : '';
    const dataAtual = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    // Logo
    const logoUrl = clinicaLogoUrl || operadoraLogoUrl;
    const logoHtml = logoUrl ?
    '<img src="' +
    logoUrl +
    '" style="max-height:60px;max-width:180px;object-fit:contain;" />' :
    '';
    // Header clinic info
    const headerClinicaInfo = [
    clinicaEndereco || '',
    [
    clinicaTelefone ? 'Tel: ' + clinicaTelefone : '',
    clinicaEmail ? 'Email: ' + clinicaEmail : ''].

    filter(Boolean).
    join(' | ')].

    filter(Boolean).
    join('<br/>');
    // RQEs
    let rqes: any[] = [];
    try {
      if (Array.isArray(profissionalRqes)) rqes = profissionalRqes;else
      if (typeof profissionalRqes === 'string')
      rqes = JSON.parse(profissionalRqes);
    } catch {

      /* ignore */}
    // Build tooth cell HTML
    const buildToothCell = (toothNum: string) => {
      const condition = odontogramaData[toothNum];
      const status = condition?.status || 'saudavel';
      const colors = STATUS_COLORS[status] || STATUS_COLORS.saudavel;
      const label = STATUS_LABELS[status] || 'Saudável';
      const isExtraido = status === 'extraido';
      return (
        '<td style="width:42px;text-align:center;padding:4px 2px;vertical-align:top;">' +
        '<div style="width:38px;height:48px;border:2px solid ' +
        colors.border +
        ';border-radius:6px;background:' +
        colors.bg +
        ';display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto;position:relative;' + (
        isExtraido ? 'opacity:0.7;' : '') +
        '">' +
        '<span style="font-size:10px;font-weight:700;color:' +
        colors.text +
        ';">' +
        toothNum +
        '</span>' + (
        isExtraido ?
        '<div style="position:absolute;top:50%;left:50%;width:80%;height:2px;background:#6b7280;transform:translate(-50%,-50%) rotate(45deg);"></div><div style="position:absolute;top:50%;left:50%;width:80%;height:2px;background:#6b7280;transform:translate(-50%,-50%) rotate(-45deg);"></div>' :
        '') + (
        status !== 'saudavel' && !isExtraido ?
        '<span style="font-size:7px;color:' +
        colors.text +
        ';margin-top:2px;line-height:1;">' +
        label +
        '</span>' :
        '') +
        '</div>' +
        '</td>');

    };
    // Build quadrant row
    const buildQuadrantRow = (teeth: string[]) =>
    teeth.map(buildToothCell).join('');
    // Odontograma HTML table
    const odontogramaHtml =
    '<div style="margin:16px 0;">' +
    '<p style="text-align:center;font-size:10px;color:#6b7280;margin-bottom:6px;">Arcada Superior</p>' +
    '<table style="margin:0 auto;border-collapse:collapse;">' +
    '<tr>' +
    buildQuadrantRow(QUADRANTS.superior_direito) +
    '<td style="width:8px;background:#94a3b8;"></td>' +
    buildQuadrantRow(QUADRANTS.superior_esquerdo) +
    '</tr>' +
    '</table>' +
    '<div style="width:100%;height:2px;background:#cbd5e1;margin:8px 0;"></div>' +
    '<table style="margin:0 auto;border-collapse:collapse;">' +
    '<tr>' +
    buildQuadrantRow(QUADRANTS.inferior_direito) +
    '<td style="width:8px;background:#94a3b8;"></td>' +
    buildQuadrantRow(QUADRANTS.inferior_esquerdo) +
    '</tr>' +
    '</table>' +
    '<p style="text-align:center;font-size:10px;color:#6b7280;margin-top:6px;">Arcada Inferior</p>' +
    '</div>';
    // Legend
    const legendHtml =
    '<div style="margin-top:16px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;">' +
    '<p style="font-size:10px;font-weight:700;color:#374151;margin-bottom:8px;">Legenda</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
    Object.entries(STATUS_LABELS).
    map(
      ([key, label]) =>
      '<div style="display:flex;align-items:center;gap:4px;">' +
      '<div style="width:14px;height:14px;border:2px solid ' +
      STATUS_COLORS[key].border +
      ';border-radius:3px;background:' +
      STATUS_COLORS[key].bg +
      ';"></div>' +
      '<span style="font-size:9px;color:#4b5563;">' +
      label +
      '</span>' +
      '</div>'
    ).
    join('') +
    '</div>' +
    '</div>';
    // Summary table of altered teeth
    const alteredTeeth = Object.entries(odontogramaData).
    filter(([, c]) => c.status !== 'saudavel').
    sort(([a], [b]) => Number(a) - Number(b));
    const summaryHtml =
    alteredTeeth.length > 0 ?
    '<div style="margin-top:16px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;">' +
    '<p style="font-size:10px;font-weight:700;color:#374151;margin-bottom:8px;">Resumo — ' +
    alteredTeeth.length +
    ' dente(s) com alteração</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:10px;">' +
    '<tr style="background:#f8fafc;"><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">Dente</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">Condição</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">Observação</th></tr>' +
    alteredTeeth.
    map(
      ([tooth, condition]) =>
      '<tr><td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;">' +
      tooth +
      '</td>' +
      '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;">' +
      '<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:' +
      STATUS_COLORS[condition.status].bg +
      ';border:1px solid ' +
      STATUS_COLORS[condition.status].border +
      ';color:' +
      STATUS_COLORS[condition.status].text +
      ';font-size:9px;font-weight:600;">' + (
      STATUS_LABELS[condition.status] || condition.status) +
      '</span>' +
      '</td>' +
      '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;color:#6b7280;">' + (
      condition.observacao || '—') +
      '</td></tr>'
    ).
    join('') +
    '</table>' +
    '</div>' :
    '';
    // Signature
    const assinaturaHtml =
    '<div style="margin-top:40px;text-align:center;page-break-inside:avoid;">' +
    '<div style="border-top:1px solid #1e3a5f;width:300px;margin:0 auto 8px;"></div>' +
    '<div style="font-size:13px;font-weight:bold;color:#1e293b;text-transform:uppercase;">' + (
    profissionalNome ? tituloDisplay + profissionalNome : '') +
    '</div>' + (
    profissionalCrm ?
    '<div style="font-size:11px;color:#475569;margin-top:2px;">' +
    prefixoConselho +
    ' ' +
    profissionalCrm + (
    profissionalUf ? '/' + profissionalUf : '') +
    '</div>' :
    '') + (
    profissionalEspecialidade ?
    '<div style="font-size:10px;color:#64748b;">' +
    profissionalEspecialidade +
    '</div>' :
    '') + (
    rqes.length > 0 ?
    rqes.
    map(
      (r: any) =>
      '<div style="font-size:10px;color:#64748b;">' +
      r.especialidade +
      ' — RQE ' +
      r.rqe +
      '</div>'
    ).
    join('') :
    '') +
    '</div>';
    // Footer
    const footerLeftHtml =
    '<div style="text-align:left;"><div style="font-size:12px;font-weight:bold;color:#1e3a5f;margin-bottom:2px;">' + (
    clinicaNome || '') +
    '</div><div style="font-size:8px;color:#64748b;">' +
    [
    clinicaEndereco || '',
    clinicaTelefone ? 'Telefone: ' + clinicaTelefone : '',
    clinicaEmail ? 'Email: ' + clinicaEmail : ''].

    filter(Boolean).
    join('<br/>') +
    '</div></div>';
    // CSS
    const cssStyles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; display: flex; flex-direction: column; background: white; }
      .header { background: linear-gradient(135deg, #eef4fb 0%, #f0f4ff 100%); border-bottom: 3px solid #3b82f6; padding: 16px 28px; display: flex; align-items: center; gap: 16px; }
      .header-logo { flex-shrink: 0; }
      .header-center { flex: 1; text-align: center; }
      .header-center h1 { font-size: 16px; font-weight: bold; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; }
      .header-center .clinica-nome { font-size: 11px; color: #475569; margin-top: 2px; }
      .header-center .clinica-endereco { font-size: 9px; color: #64748b; margin-top: 2px; line-height: 1.4; }
      .body { flex: 1; padding: 16px 32px 20px; }
      .data-impressao { font-size: 10px; color: #64748b; text-align: right; margin-bottom: 12px; }
      .doc-title { font-size: 18px; font-weight: bold; color: #1e293b; text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
      .doc-title-line { border-bottom: 2px solid #1e3a5f; width: 180px; margin: 0 auto 16px; }
      .paciente-info { font-size: 11px; color: #334155; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; line-height: 1.6; }
      .paciente-info strong { color: #0f172a; font-size: 12px; }
      .footer { background: #eef4fb; border-top: 2px solid #3b82f6; padding: 12px 28px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9px; color: #475569; line-height: 1.5; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { margin: 0; } }
    `;
    const htmlContent =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Odontograma - ' + (
    pacienteNome || 'Paciente') +
    '</title>' +
    '<sty' +
    'le>' +
    cssStyles +
    '</sty' +
    'le>' +
    '</head><body><div class="page"><div class="header">' + (
    logoHtml ? '<div class="header-logo">' + logoHtml + '</div>' : '') +
    '<div class="header-center"><h1>' +
    profNomeDisplay +
    '</h1>' + (
    clinicaNome ?
    '<div class="clinica-nome">' + clinicaNome + '</div>' :
    '') + (
    profissionalCabecalho ?
    '<div class="clinica-endereco">' +
    profissionalCabecalho.replace(/\n/g, '<br/>') +
    '</div>' :
    headerClinicaInfo ?
    '<div class="clinica-endereco">' + headerClinicaInfo + '</div>' :
    '') +
    '</div></div><div class="body"><div class="data-impressao">Data: ' +
    dataAtual +
    '</div><div class="doc-title">Odontograma</div><div class="doc-title-line"></div><div class="paciente-info"><strong>' +
    (pacienteNome || 'PACIENTE').toUpperCase() +
    '</strong>' +
    idadeStr +
    '</div>' +
    odontogramaHtml +
    legendHtml +
    summaryHtml +
    assinaturaHtml +
    '</div><div class="footer">' +
    footerLeftHtml +
    '<div style="text-align:right;font-size:9px;color:#64748b;font-style:italic;">Pag. 1 de 1</div></div></div></body></html>';
    import('../../../utils/pdfGenerator').then(({ previewDocumentoPDF }) => {
      const nomeArquivo = `Odontograma_${(pacienteNome || 'Paciente').replace(/\s+/g, '_')}_${dataAtual.replace(/\//g, '-')}.pdf`;
      previewDocumentoPDF(htmlContent, {
        fileName: nomeArquivo
      });
    });
  }, [
  odontogramaData,
  pacienteNome,
  pacienteDataNascimento,
  profissionalNome,
  profissionalCrm,
  profissionalUf,
  profissionalTipo,
  profissionalTitulo,
  profissionalCabecalho,
  profissionalEspecialidade,
  profissionalRqes]
  );
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 pb-4 -mx-6 px-6 pt-1">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-light text-teal-700">🦷 Odontograma</h2>

          <div className="flex items-center gap-3">
            {lastSaved &&
            <span className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                Salvo às {formatLastSaved()}
              </span>
            }
            {hasChanges && !isSaving &&
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
                <ClockIcon className="w-3.5 h-3.5" />
                Alterações pendentes
              </span>
            }
            {isSaving &&
            <span className="flex items-center gap-1.5 text-xs text-blue-600">
                <SaveIcon className="w-3.5 h-3.5 animate-pulse" />
                Salvando...
              </span>
            }

            <button
              onClick={handleImprimir}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              title="Imprimir odontograma">
              
              <PrinterIcon className="w-4 h-4" />
              Imprimir
            </button>

            {!readOnly && hasChanges && !isSaving && onSave &&
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2">
              
                <SaveIcon className="w-4 h-4" />
                Salvar
              </button>
            }
          </div>
        </div>
      </div>

      {/* Odontograma Component */}
      <Odontograma
        value={odontogramaData}
        onChange={handleChange}
        disabled={readOnly} />
      

      {/* Resumo dos dentes alterados */}
      {Object.keys(odontogramaData).length > 0 &&
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-teal-800 mb-2">
            Resumo — {Object.keys(odontogramaData).length} dente(s)
            registrado(s)
          </h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(odontogramaData).
          sort(([a], [b]) => Number(a) - Number(b)).
          map(([tooth, condition]) =>
          <span
            key={tooth}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-white border border-teal-200 text-teal-700">
            
                  <span className="font-bold">{tooth}</span>
                  <span className="text-teal-500">—</span>
                  <span className="capitalize">
                    {condition.status.replace('_', ' ')}
                  </span>
                </span>
          )}
          </div>
        </div>
      }
    </div>);

}