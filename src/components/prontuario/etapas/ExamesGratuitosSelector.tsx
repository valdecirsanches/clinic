import React, { useCallback, useEffect, useState } from 'react';
import {
  PrinterIcon,
  CheckSquareIcon,
  Loader2Icon,
  SearchIcon } from
'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import {
  resolverEspecialidade,
  resolverConselho } from
'../../../utils/especialidadeHelper';
import { Button } from '../../ui/Button';
import { useToast } from '../../../hooks/useToast';
interface ExameGratuito {
  id: string;
  nome: string;
}
interface ExamesGratuitosSelectorProps {
  clinicaId: string;
  pacienteNome?: string;
  pacienteDataNascimento?: string;
  pacienteTipoVinculo?: 'TITULAR' | 'DEPENDENTE';
  profissionalDoProntuario?: {
    id: string;
    nome: string;
    crm?: string;
    uf?: string;
    tipo?: string;
    especialidade?: string;
    especialidades?: string;
  };
  onExamesSelecionados?: (exames: string[]) => void;
  /** ⭐ Nomes dos exames previamente salvos (para pré-marcar checkboxes ao carregar do histórico) */
  examesSalvos?: string[];
  /**
   * Última data em que cada exame foi solicitado para este paciente.
   * Chave = nome do exame em minúsculas. Usado para exibir "Último: dd/mm/aaaa"
   * ao lado do exame, evitando repetir pedidos recentes.
   */
  ultimasDatas?: Record<string, string>;
}

/** Formata a data do histórico (ISO ou com hora anexada) como dd/mm/aaaa. */
function formatarUltima(valor?: string): string | null {
  if (!valor) return null;
  const soData = String(valor).slice(0, 10);
  const partes = soData.split('-');
  if (partes.length === 3) {
    const [ano, mes, dia] = partes;
    if (ano && mes && dia) return `${dia}/${mes}/${ano}`;
  }
  const d = new Date(valor);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}
export function ExamesGratuitosSelector({
  clinicaId,
  pacienteNome,
  pacienteDataNascimento,
  pacienteTipoVinculo,
  profissionalDoProntuario,
  onExamesSelecionados,
  examesSalvos,
  ultimasDatas
}: ExamesGratuitosSelectorProps) {
  const [exames, setExames] = useState<ExameGratuito[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const { error } = useToast();
  const carregarExames = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/exames-gratuitos?clinicaId=${clinicaId}`
      );
      if (response.ok) {
        const data = await response.json();
        setExames(data);
        // ⭐ Se há exames salvos, pré-seleciona ao carregar a lista
        if (examesSalvos && examesSalvos.length > 0) {
          const idsParaSelecionar = new Set<string>();
          examesSalvos.forEach((nomeSalvo) => {
            const exameEncontrado = data.find(
              (e: ExameGratuito) =>
              e.nome.toLowerCase().trim() === nomeSalvo.toLowerCase().trim()
            );
            if (exameEncontrado) {
              idsParaSelecionar.add(exameEncontrado.id);
            }
          });
          if (idsParaSelecionar.size > 0) {
            setSelecionados(idsParaSelecionar);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar exames gratuitos:', err);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);
  useEffect(() => {
    carregarExames();
  }, [carregarExames]);
  // ⭐ Quando examesSalvos muda (ex: carregou do histórico), atualiza seleção
  useEffect(() => {
    if (!examesSalvos || examesSalvos.length === 0 || exames.length === 0)
    return;
    const idsParaSelecionar = new Set<string>();
    examesSalvos.forEach((nomeSalvo) => {
      const exameEncontrado = exames.find(
        (e) => e.nome.toLowerCase().trim() === nomeSalvo.toLowerCase().trim()
      );
      if (exameEncontrado) {
        idsParaSelecionar.add(exameEncontrado.id);
      }
    });
    if (idsParaSelecionar.size > 0) {
      setSelecionados(idsParaSelecionar);
    }
  }, [examesSalvos, exames]);
  const toggleExame = (exameId: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(exameId)) {
        next.delete(exameId);
      } else {
        next.add(exameId);
      }
      // Notifica o componente pai se necessário
      if (onExamesSelecionados) {
        const selecionadosArray = Array.from(next).
        map((id) => exames.find((e) => e.id === id)?.nome).
        filter(Boolean) as string[];
        onExamesSelecionados(selecionadosArray);
      }
      return next;
    });
  };
  const handlePrint = () => {
    if (selecionados.size === 0) {
      error('Aviso', 'Selecione pelo menos um exame para imprimir.');
      return;
    }
    // ⭐ Resolve dados do profissional
    let profissionalNome = '';
    let profissionalCrm = '';
    let profissionalUf = '';
    let profissionalEspecialidade = '';
    let prefixoConselho = 'CRM';
    let profissionalTitulo = '';
    let profissionalCabecalho = '';
    let profissionalRqes: Array<{
      especialidade: string;
      rqe: string;
    }> = [];
    if (profissionalDoProntuario) {
      profissionalNome = profissionalDoProntuario.nome || '';
      profissionalCrm = profissionalDoProntuario.crm || '';
      profissionalUf = profissionalDoProntuario.uf || '';
      // ⭐ FIX: Resolve IDs de especialidade (ex: ["11","15"]) para nomes legíveis
      profissionalEspecialidade = resolverEspecialidade(
        profissionalDoProntuario.especialidade,
        profissionalDoProntuario.especialidades
      );
      // ⭐ FIX: CRO para dentista (por tipo OU especialidade odontológica)
      prefixoConselho = resolverConselho(
        profissionalDoProntuario.tipo,
        profissionalDoProntuario.especialidade,
        profissionalDoProntuario.especialidades,
        profissionalDoProntuario.crm
      );
      profissionalTitulo = (profissionalDoProntuario as any).titulo || '';
      profissionalCabecalho =
      (profissionalDoProntuario as any).cabecalhoRelatorio || '';
      try {
        const rawRqes = (profissionalDoProntuario as any).rqes;
        const parsed =
        typeof rawRqes === 'string' ? JSON.parse(rawRqes) : rawRqes;
        if (Array.isArray(parsed))
        profissionalRqes = parsed.filter((r: any) => r.especialidade && r.rqe);
      } catch {

        /* ignore */}
    }
    const crmComUf = profissionalCrm ?
    profissionalCrm + (profissionalUf ? '/' + profissionalUf : '') :
    '';
    // ⭐ Dados da clínica
    let clinicaNome = '';
    let clinicaEndereco = '';
    let clinicaTelefone = '';
    let clinicaEmail = '';
    let clinicaLogoUrl = '';
    let clinicaDescricao = '';
    let clinicaSite = '';
    try {
      const sessao = JSON.parse(localStorage.getItem('sessao') || '{}');
      clinicaNome = sessao.clinicaAtual?.nome || '';
      clinicaEndereco = sessao.clinicaAtual?.endereco || '';
      clinicaTelefone = sessao.clinicaAtual?.telefone || '';
      clinicaEmail = sessao.clinicaAtual?.email || '';
      clinicaLogoUrl =
      sessao.clinicaAtual?.logoUrl ||
      sessao.operadoraSelecionada?.logoUrl ||
      '';
      clinicaDescricao = sessao.clinicaAtual?.descricao || '';
      clinicaSite = sessao.clinicaAtual?.site || '';
    } catch (e) {}
    const logoHtml = clinicaLogoUrl ?
    '<img src="' +
    clinicaLogoUrl +
    '" alt="Logo" style="max-height:80px;max-width:120px;object-fit:contain;" />' :
    '';
    // ⭐ CSS — EasyClin 1.0 style (white header, clean layout)
    const css = `
      @page { size: A4; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 11px; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; position: relative; display: flex; flex-direction: column; }

      /* HEADER — white background, logo left, clinic info right */
      .header { background: #fff; border-bottom: 2px solid #333; padding: 18px 28px; display: flex; align-items: center; justify-content: space-between; }
      .header-logo { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
      .header-right { text-align: right; max-width: 60%; }
      .header-right .clinica-nome { font-size: 16px; font-weight: bold; color: #222; margin-bottom: 2px; }
      .header-right .clinica-desc { font-size: 9px; color: #555; margin-bottom: 3px; font-style: italic; }
      .header-right .clinica-info { font-size: 9px; color: #444; line-height: 1.5; }

      /* PROFISSIONAL */
      .profissional-bar { background: #f5f5f5; border-bottom: 1px solid #ccc; padding: 10px 28px; text-align: center; }
      .profissional-bar .nome { font-size: 15px; font-weight: bold; color: #222; text-transform: uppercase; }
      .profissional-bar .especialidade { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
      .profissional-bar .crm { font-size: 10px; color: #333; font-weight: bold; margin-top: 2px; }
      .profissional-bar .titulos { font-size: 8px; color: #666; line-height: 1.5; margin-top: 2px; }

      /* BODY */
      .body { flex: 1; padding: 20px 28px; }
      .descricao-titulo { font-size: 13px; font-weight: bold; color: #222; text-decoration: underline; margin-bottom: 6px; text-transform: uppercase; }
      .descricao-data { font-size: 10px; color: #222; text-align: right; margin-top: -18px; margin-bottom: 14px; }

      /* PATIENT INFO */
      .paciente-info { border-top: 1px solid #333; border-bottom: 1px solid #333; padding: 8px 0; margin-bottom: 14px; }
      .paciente-row { display: flex; justify-content: space-between; font-size: 11px; color: #222; margin-bottom: 3px; }
      .paciente-row:last-child { margin-bottom: 0; }

      /* EXAMES LIST — single column, larger checkboxes */
      .exames-list { margin-bottom: 16px; padding: 6px 0; border: 1px solid #ccc; }
      .exame-item { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #222; min-height: 30px; padding: 4px 14px; border-bottom: 1px solid #eee; }
      .exame-item:last-child { border-bottom: none; }
      .exame-checkbox { font-size: 20px; line-height: 1; font-family: 'Segoe UI Symbol', 'Apple Color Emoji', monospace; color: #111; }
      .exame-nome { font-size: 12px; text-transform: uppercase; }
      .exame-nome.selected { font-weight: bold; }

      /* ANOTACOES */
      .anotacoes { margin-top: 16px; margin-bottom: 16px; }
      .anotacoes-titulo { font-size: 11px; font-weight: bold; font-style: italic; color: #222; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px; }
      .anotacoes-corpo { font-size: 11px; color: #333; min-height: 40px; text-transform: uppercase; }

      /* ASSINATURA */
      .assinatura-bloco { text-align: center; margin-top: 50px; font-size: 10px; line-height: 1.6; }
      .assinatura-linha { border-top: 1px solid #333; width: 300px; margin: 0 auto 6px auto; }
      .assinatura-bloco .nome { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #222; }
      .assinatura-bloco .detalhe { font-size: 9px; color: #555; }
      .assinatura-bloco .crm { font-size: 10px; color: #222; font-weight: bold; }

      /* FOOTER — EasyClin branding */
      .footer { background: #fff; border-top: 2px solid #333; padding: 10px 28px; text-align: center; font-size: 9px; color: #666; line-height: 1.5; margin-top: auto; }
      .footer .easyclin { font-size: 11px; font-weight: bold; color: #333; margin-bottom: 2px; }
      .footer .pag { font-size: 8px; color: #999; text-align: right; margin-top: 4px; }

      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { margin: 0; } }
    `;
    const h: string[] = [];
    h.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">');
    h.push('<title>Solicitação de Exames de Rotina</title>');
    h.push('<sty' + 'le>' + css + '</sty' + 'le>');
    h.push('</head><body><div class="page">');
    // ===== HEADER — white, logo left, clinic info right =====
    h.push('<div class="header">');
    if (logoHtml) h.push('<div class="header-logo">' + logoHtml + '</div>');
    h.push('<div class="header-right">');
    if (clinicaNome)
    h.push('<div class="clinica-nome">' + clinicaNome + '</div>');
    if (clinicaDescricao)
    h.push('<div class="clinica-desc">' + clinicaDescricao + '</div>');
    const headerInfoParts: string[] = [];
    if (clinicaEndereco) headerInfoParts.push(clinicaEndereco);
    if (clinicaTelefone) headerInfoParts.push('Tel: ' + clinicaTelefone);
    if (clinicaEmail) headerInfoParts.push(clinicaEmail);
    if (clinicaSite) headerInfoParts.push(clinicaSite);
    if (headerInfoParts.length > 0)
    h.push(
      '<div class="clinica-info">' + headerInfoParts.join('<br/>') + '</div>'
    );
    h.push('</div>');
    h.push('</div>');
    // ===== PROFISSIONAL BAR =====
    const tituloDisplay = profissionalTitulo ? profissionalTitulo + ' ' : '';
    if (profissionalNome || crmComUf) {
      h.push('<div class="profissional-bar">');
      if (profissionalNome)
      h.push(
        '<div class="nome">' + tituloDisplay + profissionalNome + '</div>'
      );
      if (profissionalEspecialidade)
      h.push(
        '<div class="especialidade">' + profissionalEspecialidade + '</div>'
      );
      if (crmComUf)
      h.push(
        '<div class="crm">' + prefixoConselho + ' ' + crmComUf + '</div>'
      );
      if (profissionalCabecalho) {
        h.push(
          '<div class="titulos">' +
          profissionalCabecalho.replace(/\n/g, '<br/>') +
          '</div>'
        );
      }
      h.push('</div>');
    }
    // ===== BODY =====
    h.push('<div class="body">');
    const agora = new Date();
    const dataHoraAtual =
    agora.toLocaleDateString('pt-BR') +
    ' às ' +
    agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    h.push('<div class="descricao-titulo">Solicitação de exame</div>');
    h.push('<div class="descricao-data">data: ' + dataHoraAtual + '</div>');
    // Patient info fields
    let dataNascFormatada = '';
    if (pacienteDataNascimento) {
      try {
        let dataLimpa = pacienteDataNascimento.toString().trim();
        if (dataLimpa.includes(' ')) dataLimpa = dataLimpa.split(' ')[0];
        if (dataLimpa.includes('T')) dataLimpa = dataLimpa.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataLimpa)) {
          dataNascFormatada = new Date(
            dataLimpa + 'T12:00:00'
          ).toLocaleDateString('pt-BR');
        } else {
          dataNascFormatada = dataLimpa;
        }
      } catch {

        /* ignore */}
    }
    h.push('<div class="paciente-info">');
    h.push(
      '<div class="paciente-row"><span>Nome do Paciente: <strong>' +
      (pacienteNome || '').toUpperCase() + (
      pacienteTipoVinculo ? ' - ' + pacienteTipoVinculo : '') +
      '</strong></span></div>'
    );
    h.push(
      '<div class="paciente-row"><span>Profissão:</span><span>Data de Nasc.: ' +
      dataNascFormatada +
      '</span></div>'
    );
    h.push(
      '<div class="paciente-row"><span>Especialista: ' +
      (profissionalNome || '').toUpperCase() +
      '</span></div>'
    );
    h.push('</div>');
    // Lista de Exames — single column, larger checkboxes
    h.push('<div class="exames-list">');
    const examesOrdenados = [...exames].sort((a, b) =>
    a.nome.localeCompare(b.nome)
    );
    examesOrdenados.forEach((exame) => {
      const isSelected = selecionados.has(exame.id);
      const checkboxChar = isSelected ? '☑' : '☐';
      const selectedClass = isSelected ? 'selected' : '';
      h.push(`
        <div class="exame-item">
          <span class="exame-checkbox">${checkboxChar}</span>
          <span class="exame-nome ${selectedClass}">${exame.nome}</span>
        </div>
      `);
    });
    h.push('</div>');
    // Anotações
    h.push('<div class="anotacoes">');
    h.push('<div class="anotacoes-titulo">Anotações</div>');
    h.push('<div class="anotacoes-corpo">ROTINA</div>');
    h.push('</div>');
    // ===== ASSINATURA =====
    h.push('<div class="assinatura-bloco">');
    h.push('<div class="assinatura-linha"></div>');
    if (profissionalNome)
    h.push(
      '<div class="nome">' +
      (tituloDisplay + profissionalNome).toUpperCase() +
      '</div>'
    );
    if (profissionalEspecialidade) {
      const especialidades = profissionalEspecialidade.
      split(',').
      map((e: string) => e.trim());
      especialidades.forEach((esp: string) => {
        h.push('<div class="detalhe">' + esp + '</div>');
      });
    }
    if (crmComUf)
    h.push('<div class="crm">' + prefixoConselho + ' ' + crmComUf + '</div>');
    if (profissionalRqes.length > 0) {
      profissionalRqes.forEach((r) => {
        h.push(
          '<div class="detalhe">' +
          r.especialidade +
          ' — RQE ' +
          r.rqe +
          '</div>'
        );
      });
    }
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    h.push(
      '<div class="detalhe" style="margin-top: 4px;">Data: ' +
      dataAtual +
      '</div>'
    );
    h.push('</div>');
    h.push('</div>'); // body
    // ===== FOOTER — EasyClin branding =====
    h.push('<div class="footer">');
    h.push(
      '<div class="easyclin">EasyClin © EDSSolution Tecnologia (1989 - 2026) - Osasco/SP - Brazil</div>'
    );
    // O rótulo "Pág. 1 de 1" era FIXO e mentia em documentos com mais de uma
    // folha: o navegador não numera páginas de HTML, então nada é afirmado.
    h.push('</div>');
    h.push('</div></body></html>');
    // ⭐ Abre preview antes de salvar
    import('../../../utils/pdfGenerator').then(({ previewDocumentoPDF }) => {
      const nomeArquivo = `Exames_Rotina_${pacienteNome ? pacienteNome.replace(/\s+/g, '_') + '_' : ''}${new Date().toISOString().split('T')[0]}.pdf`;
      previewDocumentoPDF(h.join('\n'), {
        fileName: nomeArquivo
      });
    });
  };
  const examesFiltrados = exames.filter((e) =>
  e.nome.toLowerCase().includes(busca.toLowerCase())
  );
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2Icon className="w-5 h-5 text-teal-600 animate-spin" />
        <span className="ml-2 text-gray-500 text-sm">
          Carregando exames de rotina...
        </span>
      </div>);

  }
  if (exames.length === 0) {
    return null; // Não mostra nada se a clínica não tiver exames gratuitos cadastrados
  }
  return (
    <div className="bg-white border border-teal-100 rounded-xl overflow-hidden shadow-sm mb-6">
      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-5 py-3 border-b border-teal-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <CheckSquareIcon className="w-5 h-5 text-teal-600" />
          <h3 className="font-semibold text-teal-900">
            Exames de Rotina Disponíveis
          </h3>
          <span className="bg-teal-100 text-teal-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {selecionados.size} selecionados
          </span>
        </div>

        <Button
          onClick={handlePrint}
          disabled={selecionados.size === 0}
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all w-full sm:w-auto">
          
          <PrinterIcon className="w-4 h-4 mr-2" />
          Imprimir Selecionados
        </Button>
      </div>

      <div className="p-4">
        <div className="relative mb-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar exame de rotina..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all" />
          
        </div>

        {/* Sem altura máxima nem rolagem própria: a lista mostra todos os
             exames e usa a área disponível da tela, evitando um segundo
             scrollbar competindo com o da aba. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {examesFiltrados.map((exame) => {
            const isSelected = selecionados.has(exame.id);
            const ultima = formatarUltima(
              ultimasDatas?.[exame.nome.toLowerCase().trim()]
            );
            return (
              <label
                key={exame.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-teal-50 border-teal-200 shadow-sm' : 'bg-white border-gray-100 hover:border-teal-100 hover:bg-gray-50'}`}>
                
                <div className="flex items-center h-5 mt-0.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleExame(exame.id)}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
                  
                </div>
                <span className="min-w-0">
                  <span
                    className={`text-sm ${isSelected ? 'font-semibold text-teal-900' : 'text-gray-700'}`}>
                    
                    {exame.nome}
                  </span>
                  {ultima &&
                  <span className="block text-[11px] text-amber-700 mt-0.5">
                      Último: {ultima}
                    </span>
                  }
                </span>
              </label>);

          })}

          {examesFiltrados.length === 0 &&
          <div className="col-span-full text-center py-4 text-gray-400 text-sm">
              Nenhum exame encontrado com "{busca}"
            </div>
          }
        </div>
      </div>
    </div>);

}