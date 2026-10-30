import React, { useCallback, useEffect, useState, Component } from 'react';
import { SaveIcon, CheckCircleIcon, ClockIcon, PrinterIcon } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OdontogramaClinico } from '../../odontograma/OdontogramaClinico';
import { ArcadasSvg } from '../../odontograma/ArcadasSvg';
import { COR, Denticao, OdontogramaDados, denticaoSugerida, listarAchados, normalizarDente } from '../../odontograma/modelo';
import { resolverConselho } from '../../../utils/especialidadeHelper';
// Formato por dente: ver components/odontograma/modelo.ts
type OdontogramaData = OdontogramaDados;
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
    // Odontograma: o MESMO desenho da tela (SVG), em modo somente leitura
    const numeros = Object.keys(odontogramaData);
    const temDecido = numeros.some((n) => Number(n[0]) >= 5);
    const temPermanente = numeros.some((n) => Number(n[0]) <= 4);
    const denticaoImpressao: Denticao =
    temDecido && temPermanente ? 'mista' : temDecido ? 'decidua' : temPermanente ? 'permanente' : denticaoSugerida(pacienteDataNascimento);
    const odontogramaHtml =
    '<div style="margin:12px 0 4px;">' +
    renderToStaticMarkup(<ArcadasSvg dados={odontogramaData} denticao={denticaoImpressao} />) +
    '</div>';
    const legendHtml =
    '<div style="display:flex;justify-content:center;gap:18px;margin:6px 0 14px;font-size:9px;color:#64748b;">' +
    [[COR.tratar, 'A tratar'], [COR.tratado, 'Já tratado'], [COR.selante, 'Preventivo']].
    map(([cor, nome]) => '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:' + cor + ';display:inline-block;"></span>' + nome + '</span>').
    join('') +
    '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;border:1px dashed #94a3b8;display:inline-block;"></span>Ausente</span>' +
    '</div>';
    // Achados por dente
    const achados = listarAchados(odontogramaData);
    const corGrupo: Record<string, string> = { tratar: COR.tratar, tratado: COR.tratado, preventivo: COR.selante, outro: '#64748b' };
    const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    const dentesComAchado = Array.from(new Set(achados.map((a) => a.dente)));
    const summaryHtml =
    dentesComAchado.length > 0 ?
    '<div style="margin-top:10px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;page-break-inside:avoid;">' +
    '<p style="font-size:10px;font-weight:700;color:#374151;margin-bottom:8px;">Achados em ' + dentesComAchado.length + ' dente(s)</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:10px;">' +
    '<tr style="background:#f8fafc;"><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;width:50px;">Dente</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">Condição</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">Observação</th></tr>' +
    dentesComAchado.
    map((dente) =>
    '<tr><td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;vertical-align:top;">' + dente + '</td>' +
    '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;">' +
    achados.filter((a) => a.dente === dente).
    map((a) => '<span style="display:inline-block;margin:0 6px 2px 0;color:' + corGrupo[a.grupo] + ';font-weight:600;">' + escapar(a.texto) + '</span>').join('') +
    '</td>' +
    '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;color:#6b7280;vertical-align:top;">' + escapar(normalizarDente(odontogramaData[dente]).observacao || '—') + '</td></tr>'
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
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 pb-3 pt-1">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-xl font-medium text-teal-700">Odontograma</h2>
            {!readOnly &&
            <p className="text-xs text-gray-500 mt-0.5">As marcações são salvas sozinhas poucos segundos depois de feitas.</p>
            }
          </div>

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
              data-salvar-etapa
              title="Salvar (Ctrl+S)"
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2">
              
                <SaveIcon className="w-4 h-4" />
                Salvar
              </button>
            }
          </div>
        </div>
      </div>

      <OdontogramaClinico
        value={odontogramaData}
        onChange={handleChange}
        readOnly={readOnly}
        pacienteDataNascimento={pacienteDataNascimento} />
    </div>);

}