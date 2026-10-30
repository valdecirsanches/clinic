import React, { useCallback, useEffect, useState } from 'react';
import {
  FileTextIcon,
  StethoscopeIcon,
  ActivityIcon,
  HistoryIcon,
  PillIcon,
  AlertCircleIcon,
  HeartPulseIcon,
  UserIcon,
  ClipboardListIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderOpenIcon,
  PlayCircleIcon,
  EditIcon,
  ClipboardIcon,
  FlaskConicalIcon,
  PrinterIcon,
  CheckCircleIcon } from
'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import { paraTextoSimples } from '../../../utils/htmlTexto';
import { Prontuario, Atendimento } from '../../../types';
import { Button } from '../../ui/Button';
interface AnamneseData {
  queixaPrincipal?: string;
  historiaQueixa?: string;
  historicoDoencas?: string;
  alergias?: string;
  medicamentosEmUso?: string;
  historicoFamiliar?: string;
  habitosVida?: string;
}
interface ExameFisicoData {
  altura?: string;
  peso?: string;
  imc?: string;
  pressaoArterial?: string;
  pulso?: string;
  observacoesGerais?: string;
}
interface DiagnosticoData {
  diagnostico?: string;
  cid?: string;
}
interface EvolucaoData {
  evolucao?: string;
}
interface PrescricoesData {
  prescricoes?: string;
}
interface ExamesData {
  profissionalId?: string;
  descricao?: string;
  pedido?: string;
  justificativa?: string;
  cid10?: string;
}
interface ResumoEtapaProps {
  pacienteId?: string;
  atendimentoId?: string | null;
  clinicaId?: string;
  onNavigateToStep?: (step: string) => void;
  onSelecionarAtendimento?: (
  atendimentoId: string,
  dataAtendimento?: string,
  profissionalNome?: string)
  => void;
  onImprimir?: () => void;
  refreshKey?: number;
  anamneseData?: AnamneseData | null;
  exameFisicoData?: ExameFisicoData | null;
  examesData?: ExamesData | null;
  diagnosticoData?: DiagnosticoData | null;
  evolucaoData?: EvolucaoData | null;
  prescricoesData?: PrescricoesData | null;
  // ⭐ NOVO: Props para seleção de profissional quando não há nenhum vinculado
  semProfissional?: boolean;
  profissionalNomeAtual?: string;
  profissionalTituloAtual?: string;
  profissionaisDisponiveis?: Array<{
    id: string;
    nome: string;
    tipo: string;
    crm?: string;
    uf?: string;
  }>;
  onSelecionarProfissional?: (profissionalId: string) => void;
  salvandoProfissional?: boolean;
}
interface ResumoSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: string | null;
  color: string;
  bgColor: string;
}
export function ResumoEtapa({
  pacienteId,
  atendimentoId,
  clinicaId,
  onNavigateToStep,
  onSelecionarAtendimento,
  onImprimir,
  refreshKey = 0,
  anamneseData,
  exameFisicoData,
  examesData,
  diagnosticoData,
  evolucaoData,
  prescricoesData,
  // ⭐ NOVO
  semProfissional = false,
  profissionalNomeAtual,
  profissionalTituloAtual,
  profissionaisDisponiveis = [],
  onSelecionarProfissional,
  salvandoProfissional = false
}: ResumoEtapaProps) {
  const [prontuario, setProntuario] = useState<Prontuario | null>(null);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAtendimentos, setExpandedAtendimentos] = useState<Set<string>>(
    new Set()
  );
  const carregarDados = useCallback(async () => {
    if (!pacienteId || !clinicaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/prontuarios?clinicaId=${clinicaId}&pacienteId=${pacienteId}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setProntuario(data[0]);
          setAtendimentos(data[0].atendimentos || []);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar prontuário:', err);
    } finally {
      setLoading(false);
    }
  }, [pacienteId, clinicaId]);
  useEffect(() => {
    carregarDados();
  }, [carregarDados, refreshKey]);
  // ⭐ Ordena o histórico por data DESC (mais recente primeiro) — fonte única de
  // verdade para a lista E para identificar qual é o "Mais recente". A API pode
  // devolver em ordem inconsistente, então ordenamos aqui no cliente.
  const parseDataAtendimento = (a: Atendimento): number => {
    const raw = String(
      (a as any).criadoEm || (a as any).data || (a as any).dataConsulta || ''
    ).trim();
    if (!raw) return 0;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.getTime();
    let somenteData = raw;
    if (somenteData.includes('T')) somenteData = somenteData.split('T')[0];
    if (somenteData.includes(' ')) somenteData = somenteData.split(' ')[0];
    const d2 = /^\d{4}-\d{2}-\d{2}$/.test(somenteData) ?
    new Date(somenteData + 'T12:00:00') :
    new Date(raw);
    return isNaN(d2.getTime()) ? 0 : d2.getTime();
  };
  const atendimentosOrdenados = [...atendimentos].sort(
    (a, b) => parseDataAtendimento(b) - parseDataAtendimento(a)
  );
  // ⭐ Id do atendimento mais recente do histórico (topo da lista ordenada).
  const idMaisRecente = atendimentosOrdenados[0]?.id;
  const ultimoAtendimento = atendimentosOrdenados[0];
  // ⭐ Mescla dados do servidor com dados locais (tempo real)
  const dadosMesclados = {
    alergias: anamneseData?.alergias || prontuario?.alergias || null,
    doencasCronicas:
    anamneseData?.historicoDoencas || prontuario?.doencasCronicas || null,
    medicamentosEmUso:
    anamneseData?.medicamentosEmUso || prontuario?.medicamentosEmUso || null,
    queixaPrincipal:
    anamneseData?.queixaPrincipal ||
    ultimoAtendimento?.queixaPrincipal ||
    prontuario?.queixaPrincipal ||
    null,
    historiaQueixa:
    anamneseData?.historiaQueixa || ultimoAtendimento?.historico || null
  };
  // ⭐ Formata exame físico para exibição
  const formatarExameFisico = (
  dados?: ExameFisicoData | string | null)
  : string | null => {
    if (!dados) return null;
    // Se for string (JSON do servidor), parse
    if (typeof dados === 'string') {
      try {
        dados = JSON.parse(dados);
      } catch {
        return dados;
      }
    }
    const exameFisico = dados as ExameFisicoData;
    const partes: string[] = [];
    if (exameFisico.altura) partes.push(`Altura: ${exameFisico.altura}m`);
    if (exameFisico.peso) partes.push(`Peso: ${exameFisico.peso}kg`);
    if (exameFisico.imc) partes.push(`IMC: ${exameFisico.imc}`);
    if (exameFisico.pressaoArterial)
    partes.push(`PA: ${exameFisico.pressaoArterial}`);
    if (exameFisico.pulso) partes.push(`Pulso: ${exameFisico.pulso}bpm`);
    if (exameFisico.observacoesGerais)
    partes.push(paraTextoSimples(exameFisico.observacoesGerais));
    return partes.length > 0 ? partes.join(' | ') : null;
  };
  // ⭐ Formata exame físico do atendimento atual
  const formatarExameFisicoAtual = (): string | null => {
    if (exameFisicoData) {
      return formatarExameFisico(exameFisicoData);
    }
    if (ultimoAtendimento?.exameFisico) {
      return formatarExameFisico(ultimoAtendimento.exameFisico);
    }
    return null;
  };
  // ⭐ Obtém diagnóstico (local ou servidor)
  const getDiagnostico = (): string | null => {
    return (
      diagnosticoData?.diagnostico || ultimoAtendimento?.diagnostico || null);

  };
  // ⭐ Obtém evolução (local ou servidor)
  const getEvolucao = (): string | null => {
    return evolucaoData?.evolucao || ultimoAtendimento?.historico || null;
  };
  // ⭐ Obtém prescrições (local ou servidor) - FORMATADO
  const getPrescricoes = (): string | null => {
    const raw =
    prescricoesData?.prescricoes ||
    ultimoAtendimento?.prescricoes ||
    ultimoAtendimento?.tratamento ||
    null;
    if (!raw) return null;
    // Tenta parsear como JSON (PrescricaoData)
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        const partes: string[] = [];
        if (
        Array.isArray(parsed.medicamentos) &&
        parsed.medicamentos.length > 0)
        {
          parsed.medicamentos.forEach((med: any, i: number) => {
            let linha = `${i + 1}. ${med.nome || 'Medicamento'}`;
            if (med.dosagem) linha += ` - ${med.dosagem}`;
            if (med.quantidade && med.unidade)
            linha += ` (${med.quantidade} ${med.unidade})`;else
            if (med.quantidade) linha += ` (${med.quantidade})`;
            if (med.posologia) linha += `\n   Posologia: ${med.posologia}`;
            partes.push(linha);
          });
        }
        if (parsed.descricao && parsed.descricao.trim()) {
          const descLimpa = parsed.descricao.
          replace(/\\r\\n/g, '\n').
          replace(/\\n/g, '\n').
          replace(/\\r/g, '\n').
          replace(/\r\n/g, '\n').
          replace(/\r/g, '\n').
          replace(/\n{3,}/g, '\n\n').
          trim();
          if (partes.length > 0) partes.push('');
          partes.push(descLimpa);
        }
        if (parsed.generico && parsed.generico.trim()) {
          if (partes.length > 0) partes.push('');
          partes.push(parsed.generico.trim());
        }
        if (parsed.controleEspecial) {
          partes.unshift('⚠️ Controle Especial');
        }
        if (partes.length > 0) return partes.join('\n');
      }
    } catch (e) {

      // Não é JSON, usa como texto
    } // Fallback: limpa escape sequences do texto bruto
    return raw.replace(/\\r\\n/g, '\n').
    replace(/\\n/g, '\n').
    replace(/\\r/g, '\n').
    replace(/\r\n/g, '\n').
    replace(/\r/g, '\n').
    replace(/\n{3,}/g, '\n\n').
    trim();
  };
  // ⭐ Obtém exames (local ou servidor)
  const getExames = (): string | null => {
    // Tenta dados locais primeiro
    if (examesData) {
      const partes: string[] = [];
      if (examesData.descricao) partes.push(examesData.descricao);
      if (examesData.pedido)
      partes.push(`Pedido: ${paraTextoSimples(examesData.pedido)}`);
      if (examesData.justificativa)
      partes.push(
        `Justificativa: ${paraTextoSimples(examesData.justificativa)}`
      );
      if (examesData.cid10) partes.push(`CID-10: ${examesData.cid10}`);
      if (partes.length > 0) return partes.join(' | ');
    }
    // Tenta dados do servidor
    const raw = (ultimoAtendimento as any)?.exames || null;
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        const partes: string[] = [];
        if (parsed.descricao) partes.push(parsed.descricao);
        if (parsed.pedido)
        partes.push(`Pedido: ${paraTextoSimples(parsed.pedido)}`);
        if (parsed.justificativa)
        partes.push(
          `Justificativa: ${paraTextoSimples(parsed.justificativa)}`
        );
        if (parsed.cid10) partes.push(`CID-10: ${parsed.cid10}`);
        if (partes.length > 0) return partes.join(' | ');
      }
    } catch (e) {}
    return raw;
  };
  // ⭐ Monta conteúdo completo da anamnese
  const getAnamneseCompleta = (): string | null => {
    const partes: string[] = [];
    if (dadosMesclados.queixaPrincipal) {
      partes.push(`Queixa: ${paraTextoSimples(dadosMesclados.queixaPrincipal)}`);
    }
    if (dadosMesclados.historiaQueixa) {
      const hda = paraTextoSimples(dadosMesclados.historiaQueixa);
      partes.push(
        `HDA: ${hda.substring(0, 100)}${hda.length > 100 ? '...' : ''}`
      );
    }
    return partes.length > 0 ? partes.join(' | ') : null;
  };
  const sections: ResumoSection[] = [
  {
    id: 'anamnese',
    title: 'Anamnese',
    icon: FileTextIcon,
    content: getAnamneseCompleta(),
    color: 'text-teal-600',
    bgColor: 'bg-teal-50'
  },
  {
    id: 'exame_fisico',
    title: 'Exame Físico',
    icon: StethoscopeIcon,
    content: formatarExameFisicoAtual(),
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  {
    id: 'exames',
    title: 'Exames',
    icon: FlaskConicalIcon,
    content: getExames(),
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  {
    id: 'diagnostico',
    title: 'Diagnóstico',
    icon: ActivityIcon,
    content: getDiagnostico(),
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  {
    id: 'evolucao',
    title: 'Evolução',
    icon: HistoryIcon,
    content: getEvolucao(),
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
  {
    id: 'prescricoes',
    title: 'Prescrições',
    icon: PillIcon,
    content: getPrescricoes(),
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  }];

  const temDadosImportantes =
  dadosMesclados.alergias ||
  dadosMesclados.doencasCronicas ||
  dadosMesclados.medicamentosEmUso;
  // ⭐ Verifica se há um atendimento atual em andamento (dados locais não salvos no servidor)
  const temAtendimentoAtualLocal = !!(
  anamneseData ||
  exameFisicoData ||
  examesData ||
  diagnosticoData ||
  evolucaoData ||
  prescricoesData);

  // ⭐ Se há atendimentoId mas ele não está na lista do servidor, conta como +1
  const atendimentoAtualJaNaLista = atendimentoId ?
  atendimentos.some((a) => a.id === atendimentoId) :
  false;
  const temAtendimentoExtra =
  (temAtendimentoAtualLocal || !!atendimentoId) && !atendimentoAtualJaNaLista;
  // ⭐ Conta atendimentos assinados e não assinados
  const totalAtendimentos = atendimentos.length + (temAtendimentoExtra ? 1 : 0);
  const atendimentosAssinados = atendimentos.filter(
    (a) => a.assinaturaPaciente
  ).length;
  const atendimentosNaoAssinados = totalAtendimentos - atendimentosAssinados;
  // ⭐ Toggle para expandir/colapsar detalhes do atendimento
  const toggleAtendimento = (id: string) => {
    setExpandedAtendimentos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  // ⭐ Função para retomar atendimento pendente
  const handleRetomarAtendimento = (atendimento: Atendimento) => {
    if (onSelecionarAtendimento) {
      // ⭐ Passa a data E o nome do profissional gravado no atendimento, para
      // que o cabeçalho mostre explicitamente quem fez o atendimento aberto.
      onSelecionarAtendimento(
        atendimento.consultaId || atendimento.id,
        (atendimento as any).data,
        atendimento.profissional || undefined
      );
    }
  };
  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <h2 className="text-2xl font-light text-gray-600 border-b border-gray-100 pb-4 flex items-center gap-2">
          <FolderOpenIcon className="w-6 h-6 text-teal-600" />
          Prontuário do Paciente
        </h2>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
        </div>
      </div>);

  }
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-light text-gray-600 flex items-center gap-2">
          <FolderOpenIcon className="w-6 h-6 text-teal-600" />
          Prontuário do Paciente
        </h2>
        <div className="flex items-center gap-3">
          {onImprimir &&
          <button
            onClick={onImprimir}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors"
            title="Imprimir prontuário">
            
              <PrinterIcon className="w-4 h-4" />
              Imprimir
            </button>
          }
          <button
            onClick={carregarDados}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors"
            title="Atualizar dados">
            
            <RefreshCwIcon className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* ⭐ Indicador de profissional do atendimento (vem da consulta, não é selecionável) */}
      {profissionalNomeAtual &&
      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircleIcon className="w-4 h-4 text-green-600" />
          <span>
            Profissional:{' '}
            <strong>
              {profissionalTituloAtual ?
            `${profissionalTituloAtual} ${profissionalNomeAtual}` :
            profissionalNomeAtual}
            </strong>
          </span>
        </div>
      }

      {/* Informações Importantes */}
      {temDadosImportantes &&
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4" />
            Informações Importantes do Paciente
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {dadosMesclados.alergias &&
          <div className="bg-white/60 rounded-lg p-3 border border-red-100">
                <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
                  <AlertCircleIcon className="w-3 h-3" />
                  Alergias
                </p>
                <p className="text-sm text-red-900">
                  {dadosMesclados.alergias}
                </p>
              </div>
          }
            {dadosMesclados.doencasCronicas &&
          <div className="bg-white/60 rounded-lg p-3 border border-purple-100">
                <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1">
                  <HeartPulseIcon className="w-3 h-3" />
                  Doenças Crônicas
                </p>
                <p className="text-sm text-purple-900">
                  {dadosMesclados.doencasCronicas}
                </p>
              </div>
          }
            {dadosMesclados.medicamentosEmUso &&
          <div className="bg-white/60 rounded-lg p-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                  <PillIcon className="w-3 h-3" />
                  Medicamentos em Uso
                </p>
                <p className="text-sm text-blue-900">
                  {dadosMesclados.medicamentosEmUso}
                </p>
              </div>
          }
          </div>
        </div>
      }

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <ClipboardListIcon className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {totalAtendimentos}
          </p>
          <p className="text-xs text-gray-500">Atendimentos</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <ShieldCheckIcon className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {atendimentosAssinados}
          </p>
          <p className="text-xs text-gray-500">Assinados</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <ClockIcon className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {atendimentosNaoAssinados}
          </p>
          <p className="text-xs text-gray-500">Pendentes</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <UserIcon className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">
            {ultimoAtendimento?.profissional || '-'}
          </p>
          <p className="text-xs text-gray-500">Último Profissional</p>
        </div>
      </div>

      {/* Seções do Atendimento Atual */}
      {(ultimoAtendimento ||
      anamneseData ||
      exameFisicoData ||
      diagnosticoData ||
      evolucaoData ||
      prescricoesData ||
      examesData) &&
      <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Atendimento Atual
          </h3>

          {sections.map((section) => {
          const Icon = section.icon;
          const hasContent = !!section.content;
          return (
            <div
              key={section.id}
              onClick={() => onNavigateToStep?.(section.id)}
              className={`
                  border rounded-xl p-4 transition-all cursor-pointer
                  ${hasContent ? `${section.bgColor} border-transparent hover:shadow-md` : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}
                `}>
              
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasContent ? section.bgColor : 'bg-gray-100'}`}>
                    
                      <Icon
                      className={`w-4 h-4 ${hasContent ? section.color : 'text-gray-400'}`} />
                    
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                      className={`text-sm font-semibold ${hasContent ? section.color : 'text-gray-500'}`}>
                      
                        {section.title}
                      </h4>
                      {hasContent ?
                    <p className="text-sm text-gray-700 mt-1 line-clamp-3 whitespace-pre-line">
                          {section.content}
                        </p> :

                    <p className="text-sm text-gray-400 mt-1 italic">
                          Não preenchido
                        </p>
                    }
                    </div>
                  </div>
                  <ChevronRightIcon
                  className={`w-5 h-5 ${hasContent ? section.color : 'text-gray-300'}`} />
                
                </div>
              </div>);

        })}
        </div>
      }

      {/* ⭐ LISTA COMPLETA DE ATENDIMENTOS */}
      {atendimentos.length > 0 &&
      <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <ClipboardListIcon className="w-4 h-4" />
            Histórico de Atendimentos ({atendimentos.length})
          </h3>

          <div className="space-y-2">
            {atendimentosOrdenados.map((atendimento, index) => {
            const isExpanded = expandedAtendimentos.has(atendimento.id);
            const isAssinado = !!atendimento.assinaturaPaciente;
            // ⭐ "Aberto" = o atendimento que está sendo exibido/editado agora
            // (foi aberto pela fila/agenda ou escolhido no histórico). NÃO
            // significa "o mais recente".
            const isAberto =
            !!atendimentoId &&
            (atendimento.consultaId || atendimento.id) === atendimentoId;
            // ⭐ "Mais recente" = o atendimento de data mais nova (topo da lista
            // ordenada). É um conceito separado de "Aberto".
            const isMaisRecente =
            !!idMaisRecente && atendimento.id === idMaisRecente;
            const isAtual = isAberto;
            return (
              <div
                key={atendimento.id}
                className={`border rounded-xl overflow-hidden transition-all ${isAberto ? 'border-teal-400 bg-teal-50/60 ring-2 ring-teal-400/40' : isAssinado ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
                
                  {/* Header do atendimento */}
                  <div className="flex items-center gap-3 p-4">
                    <div
                    onClick={() => toggleAtendimento(atendimento.id)}
                    className="flex items-center gap-3 flex-1 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-lg -m-2 p-2">
                    
                      <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAssinado ? 'bg-green-100' : 'bg-amber-100'}`}>
                      
                        {isAssinado ?
                      <ShieldCheckIcon className="w-5 h-5 text-green-600" /> :

                      <ClockIcon className="w-5 h-5 text-amber-600" />
                      }
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">
                            {(() => {
                            // ⭐ Data da consulta — parse seguro contra fuso horário.
                            // Aceita "2026-06-15", "2026-06-15 00:00:00" e ISO.
                            const raw = String(
                              (atendimento as any).criadoEm ||
                              (atendimento as any).data ||
                              (atendimento as any).dataConsulta ||
                              ''
                            ).trim();
                            if (!raw) return 'Data não informada';
                            const d = new Date(raw);
                            if (isNaN(d.getTime())) {
                              // Fallback para data sem hora
                              let somenteData = raw;
                              if (somenteData.includes('T'))
                              somenteData = somenteData.split('T')[0];
                              if (somenteData.includes(' '))
                              somenteData = somenteData.split(' ')[0];
                              const d2 = /^\d{4}-\d{2}-\d{2}$/.test(
                                somenteData
                              ) ?
                              new Date(somenteData + 'T12:00:00') :
                              new Date(raw);
                              if (isNaN(d2.getTime())) return raw;
                              return d2.toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric'
                              });
                            }
                            return d.toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          })()}
                          </p>
                          {isAberto &&
                        <span
                          className="px-2 py-0.5 bg-teal-600 text-white text-xs rounded-full flex items-center gap-1"
                          title="Este é o atendimento que está aberto no prontuário agora">
                          
                              <FolderOpenIcon className="w-3 h-3" />
                              Aberto agora
                            </span>
                        }
                          {isMaisRecente &&
                        <span
                          className="px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 text-xs rounded-full"
                          title="Atendimento de data mais recente deste paciente">
                          
                              Mais recente
                            </span>
                        }
                          {isAssinado ?
                        <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full flex items-center gap-1">
                              <ShieldCheckIcon className="w-3 h-3" />
                              Assinado
                            </span> :

                        <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">
                              Pendente
                            </span>
                        }
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {atendimento.profissional ||
                        'Profissional não informado'}{' '}
                          •
                          {atendimento.tipo === 'medica' ?
                        ' Consulta Médica' :
                        ' Consulta Odontológica'}
                        </p>
                        {(() => {
                        // ⭐ Mostra TODAS as seções preenchidas deste atendimento
                        // de uma vez (não apenas a primeira), para o usuário ver
                        // tudo no card sem precisar expandir.
                        const resumoPrescricao = (raw: any): string => {
                          if (!raw) return 'Registrada';
                          try {
                            const p =
                            typeof raw === 'string' ? JSON.parse(raw) : raw;
                            if (p && typeof p === 'object') {
                              if (
                              Array.isArray(p.medicamentos) &&
                              p.medicamentos.length > 0)
                              {
                                return p.medicamentos.
                                map((m: any) => m.nome || 'Medicamento').
                                join(', ');
                              }
                              if (p.descricao && String(p.descricao).trim())
                              return paraTextoSimples(
                                String(p.descricao)
                              ).trim();
                            }
                          } catch {
                            return String(raw);
                          }
                          return 'Registrada';
                        };
                        const resumoExames = (raw: any): string => {
                          if (!raw) return 'Solicitados';
                          try {
                            const e =
                            typeof raw === 'string' ? JSON.parse(raw) : raw;
                            if (e && typeof e === 'object') {
                              const partes = [
                              e.descricao,
                              paraTextoSimples(e.pedido || '')].
                              filter(Boolean);
                              if (partes.length > 0) return partes.join(' | ');
                            }
                          } catch {
                            return String(raw);
                          }
                          return 'Solicitados';
                        };
                        const linhas: Array<{
                          label: string;
                          valor: string;
                        }> = [];
                        if (atendimento.queixaPrincipal)
                        linhas.push({
                          label: 'Anamnese',
                          valor: paraTextoSimples(
                            atendimento.queixaPrincipal
                          )
                        });
                        if (atendimento.historico)
                        linhas.push({
                          label: 'Evolução',
                          valor: atendimento.historico
                        });
                        if (atendimento.exameFisico)
                        linhas.push({
                          label: 'Exame Físico',
                          valor:
                          formatarExameFisico(atendimento.exameFisico) ||
                          'Registrado'
                        });
                        if (atendimento.diagnostico)
                        linhas.push({
                          label: 'Diagnóstico',
                          valor: atendimento.diagnostico
                        });
                        if (atendimento.prescricoes || atendimento.tratamento)
                        linhas.push({
                          label: 'Prescrições',
                          valor: resumoPrescricao(
                            atendimento.prescricoes ||
                            atendimento.tratamento
                          )
                        });
                        if ((atendimento as any).exames)
                        linhas.push({
                          label: 'Exames',
                          valor: resumoExames((atendimento as any).exames)
                        });
                        if ((atendimento as any).relatorio)
                        linhas.push({
                          label: 'Relatório',
                          valor: 'Emitido'
                        });
                        if ((atendimento as any).atestado)
                        linhas.push({
                          label: 'Atestado',
                          valor: 'Emitido'
                        });
                        if (linhas.length === 0) {
                          return (
                            <p className="text-sm text-gray-400 mt-1 italic">
                                Sem dados clínicos registrados
                              </p>);

                        }
                        return (
                          <div className="mt-1.5 space-y-1">
                              {linhas.map((l) =>
                            <p
                              key={l.label}
                              className="text-sm text-gray-600 line-clamp-2">
                              
                                  <span className="font-medium text-gray-700">
                                    {l.label}:
                                  </span>{' '}
                                  {l.valor}
                                </p>
                            )}
                            </div>);

                      })()}
                      </div>

                      {isExpanded ?
                    <ChevronUpIcon className="w-5 h-5 text-gray-400" /> :

                    <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                    }
                    </div>

                    {/* ⭐ Botão de retomar atendimento pendente */}
                    {!isAssinado && !isAtual && onSelecionarAtendimento &&
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetomarAtendimento(atendimento);
                    }}
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0">
                    
                        <PlayCircleIcon className="w-4 h-4 mr-1" />
                        Retomar
                      </Button>
                  }

                    {/* ⭐ NOVO: Botão de resumo do atendimento */}
                    <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAtendimento(atendimento.id);
                    }}
                    size="sm"
                    variant="secondary"
                    className="flex-shrink-0 text-teal-700 border-teal-200 hover:bg-teal-50"
                    title="Ver resumo do atendimento">
                    
                      <ClipboardIcon className="w-4 h-4 mr-1" />
                      Resumo
                    </Button>

                    {/* Botão de editar para atendimento atual */}
                    {isAtual && !isAssinado &&
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToStep?.('anamnese');
                    }}
                    size="sm"
                    variant="secondary"
                    className="flex-shrink-0">
                    
                        <EditIcon className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                  }
                  </div>

                  {/* Detalhes expandidos */}
                  {isExpanded &&
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      {atendimento.queixaPrincipal &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Queixa Principal
                          </p>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {paraTextoSimples(atendimento.queixaPrincipal)}
                          </p>
                        </div>
                  }

                      {atendimento.historico &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            História da Doença Atual (HDA)
                          </p>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {atendimento.historico}
                          </p>
                        </div>
                  }

                      {atendimento.exameFisico &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Exame Físico
                          </p>
                          <p className="text-sm text-gray-700 mt-1">
                            {formatarExameFisico(atendimento.exameFisico)}
                          </p>
                        </div>
                  }

                      {atendimento.diagnostico &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Diagnóstico
                          </p>
                          <p className="text-sm text-gray-700 mt-1">
                            {atendimento.diagnostico}
                          </p>
                        </div>
                  }

                      {(atendimento.prescricoes || atendimento.tratamento) &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Prescrições/Tratamento
                          </p>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {(() => {
                        const raw =
                        atendimento.prescricoes ||
                        atendimento.tratamento ||
                        '';
                        try {
                          const parsed =
                          typeof raw === 'string' ?
                          JSON.parse(raw) :
                          raw;
                          if (parsed && typeof parsed === 'object') {
                            const partes: string[] = [];
                            if (
                            Array.isArray(parsed.medicamentos) &&
                            parsed.medicamentos.length > 0)
                            {
                              parsed.medicamentos.forEach(
                                (med: any, i: number) => {
                                  let linha = `${i + 1}. ${med.nome || 'Medicamento'}`;
                                  if (med.dosagem)
                                  linha += ` - ${med.dosagem}`;
                                  if (med.quantidade && med.unidade)
                                  linha += ` (${med.quantidade} ${med.unidade})`;
                                  if (med.posologia)
                                  linha += `\n   Posologia: ${med.posologia}`;
                                  partes.push(linha);
                                }
                              );
                            }
                            if (
                            parsed.descricao &&
                            parsed.descricao.trim())
                            {
                              const descLimpa = parsed.descricao.
                              replace(/\\r\\n/g, '\n').
                              replace(/\\n/g, '\n').
                              replace(/\\r/g, '\n').
                              replace(/\r\n/g, '\n').
                              replace(/\r/g, '\n').
                              replace(/\n{3,}/g, '\n\n').
                              trim();
                              if (partes.length > 0) partes.push('');
                              partes.push(descLimpa);
                            }
                            if (
                            parsed.generico &&
                            parsed.generico.trim())
                            {
                              if (partes.length > 0) partes.push('');
                              partes.push(parsed.generico.trim());
                            }
                            if (parsed.controleEspecial)
                            partes.unshift('⚠️ Controle Especial');
                            if (partes.length > 0)
                            return partes.join('\n');
                          }
                        } catch (e) {}
                        return typeof raw === 'string' ?
                        raw.
                        replace(/\\r\\n/g, '\n').
                        replace(/\\n/g, '\n').
                        replace(/\\r/g, '\n').
                        replace(/\r\n/g, '\n').
                        replace(/\r/g, '\n').
                        replace(/\n{3,}/g, '\n\n').
                        trim() :
                        raw;
                      })()}
                          </p>
                        </div>
                  }

                      {(atendimento as any).exames &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Exames
                          </p>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {(() => {
                        const raw = (atendimento as any).exames || '';
                        try {
                          const parsed =
                          typeof raw === 'string' ?
                          JSON.parse(raw) :
                          raw;
                          if (parsed && typeof parsed === 'object') {
                            const partes: string[] = [];
                            if (parsed.descricao)
                            partes.push(parsed.descricao);
                            if (parsed.pedido)
                            partes.push(
                              `Pedido: ${paraTextoSimples(parsed.pedido)}`
                            );
                            if (parsed.justificativa)
                            partes.push(
                              `Justificativa: ${paraTextoSimples(parsed.justificativa)}`
                            );
                            if (parsed.cid10)
                            partes.push(`CID-10: ${parsed.cid10}`);
                            if (parsed.medico)
                            partes.push(`Médico: ${parsed.medico}`);
                            if (partes.length > 0)
                            return partes.join('\n');
                          }
                        } catch (e) {}
                        return raw;
                      })()}
                          </p>
                        </div>
                  }

                      {(atendimento as any).relatorio &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Relatório
                          </p>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {(() => {
                        const raw = (atendimento as any).relatorio || '';
                        try {
                          const parsed =
                          typeof raw === 'string' ?
                          JSON.parse(raw) :
                          raw;
                          if (parsed && typeof parsed === 'object') {
                            const partes: string[] = [];
                            if (parsed.titulo)
                            partes.push(`Título: ${parsed.titulo}`);
                            if (parsed.tipo)
                            partes.push(`Tipo: ${parsed.tipo}`);
                            if (parsed.destinatario)
                            partes.push(
                              `Destinatário: ${parsed.destinatario}`
                            );
                            if (parsed.conteudo)
                              // ⭐ O conteúdo pode ser HTML do editor de
                              //    documento: mostra só o texto legível.
                              partes.push(
                                `\n${paraTextoSimples(parsed.conteudo)}`
                              );
                            if (partes.length > 0)
                            return partes.join('\n');
                          }
                        } catch (e) {}
                        return raw;
                      })()}
                          </p>
                        </div>
                  }

                      {(atendimento as any).atestado &&
                  <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase">
                            Atestado
                          </p>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {(() => {
                        const raw = (atendimento as any).atestado || '';
                        try {
                          const parsed =
                          typeof raw === 'string' ?
                          JSON.parse(raw) :
                          raw;
                          if (parsed && typeof parsed === 'object') {
                            const partes: string[] = [];
                            if (parsed.qtdeDias)
                            partes.push(
                              `Afastamento: ${parsed.qtdeDias} dias`
                            );
                            if (parsed.cid10)
                            partes.push(`CID-10: ${parsed.cid10}`);
                            if (parsed.dataReferencia)
                            partes.push(
                              `Data Referência: ${new Date(parsed.dataReferencia).toLocaleDateString('pt-BR')}`
                            );
                            if (partes.length > 0)
                            return partes.join(' | ');
                          }
                        } catch (e) {}
                        return raw;
                      })()}
                          </p>
                        </div>
                  }

                      {isAssinado && atendimento.dataAssinatura &&
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                          <ShieldCheckIcon className="w-4 h-4 text-green-600" />
                          <p className="text-xs text-green-700">
                            Assinado pelo paciente em{' '}
                            {new Date(
                        atendimento.dataAssinatura
                      ).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                          </p>
                        </div>
                  }

                      {/* ⭐ Botão de retomar no rodapé expandido */}
                      {!isAssinado && !isAtual && onSelecionarAtendimento &&
                  <div className="pt-2 border-t border-gray-100">
                          <Button
                      onClick={() =>
                      handleRetomarAtendimento(atendimento)
                      }
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                      
                            <PlayCircleIcon className="w-4 h-4 mr-2" />
                            Retomar Este Atendimento
                          </Button>
                        </div>
                  }
                    </div>
                }
                </div>);

          })}
          </div>
        </div>
      }

      {/* Mensagem vazia - só mostra se realmente não há nenhum dado */}
      {!prontuario &&
      !temDadosImportantes &&
      atendimentos.length === 0 &&
      !temAtendimentoAtualLocal &&
      !atendimentoId &&
      !loading &&
      <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
            <FolderOpenIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">Nenhum prontuário encontrado</p>
            <p className="text-sm text-gray-400">
              Preencha a anamnese para iniciar o prontuário deste paciente
            </p>
          </div>
      }
    </div>);

}