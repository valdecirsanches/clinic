import React from 'react';
import { paraTextoSimples } from '../../../utils/htmlTexto';
import { FileTextIcon, StethoscopeIcon, ActivityIcon, HistoryIcon, PillIcon, ChevronRightIcon, ClipboardListIcon, FlaskConicalIcon, AlertCircleIcon, HeartPulseIcon } from 'lucide-react';
interface AnamneseData {
  queixaPrincipal: string;
  historiaQueixa: string;
  historicoDoencas: string;
  alergias: string;
  medicamentosEmUso: string;
  historicoFamiliar: string;
  habitosVida: string;
}
interface ExameFisicoData {
  altura: string;
  peso: string;
  imc: string;
  pressaoArterial: string;
  pulso: string;
  temperatura?: string;
  saturacaoO2?: string;
  frequenciaRespiratoria?: string;
  glicemia?: string;
  observacoesGerais: string;
}
interface DiagnosticoItem {
  codigo: string;
  descricao: string;
}
interface DiagnosticoData {
  diagnosticoPrincipal: DiagnosticoItem | null;
  outrosDiagnosticos: DiagnosticoItem[];
  observacoes: string;
}
interface EvolucaoData {
  evolucaoAtual: string;
}
interface PrescricoesData {
  prescricoes: string;
}
interface ExamesData {
  profissionalId?: string;
  descricao?: string;
  pedido?: string;
  justificativa?: string;
  cid10?: string;
}
interface ResumoAtendimentoEtapaProps {
  loading?: boolean;
  anamneseData?: AnamneseData | null;
  exameFisicoData?: ExameFisicoData | null;
  examesData?: ExamesData | null;
  diagnosticoData?: DiagnosticoData | null;
  evolucaoData?: EvolucaoData | null;
  prescricoesData?: PrescricoesData | null;
  onNavigateToStep?: (step: string) => void;
}
interface ResumoSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: string | null;
  color: string;
  bgColor: string;
}
export function ResumoAtendimentoEtapa({
  loading = false,
  anamneseData,
  exameFisicoData,
  examesData,
  diagnosticoData,
  evolucaoData,
  prescricoesData,
  onNavigateToStep
}: ResumoAtendimentoEtapaProps) {
  // Formata exame físico para exibição
  const formatarExameFisico = (): string | null => {
    if (!exameFisicoData) return null;
    const partes: string[] = [];
    if (exameFisicoData.altura) partes.push(`Altura: ${exameFisicoData.altura}m`);
    if (exameFisicoData.peso) partes.push(`Peso: ${exameFisicoData.peso}kg`);
    if (exameFisicoData.imc) partes.push(`IMC: ${exameFisicoData.imc}`);
    if (exameFisicoData.pressaoArterial) partes.push(`PA: ${exameFisicoData.pressaoArterial}`);
    if (exameFisicoData.pulso) partes.push(`Pulso: ${exameFisicoData.pulso}bpm`);
    if (exameFisicoData.temperatura) partes.push(`Temp: ${exameFisicoData.temperatura}°C`);
    if (exameFisicoData.saturacaoO2) partes.push(`SpO₂: ${exameFisicoData.saturacaoO2}%`);
    if (exameFisicoData.frequenciaRespiratoria) partes.push(`FR: ${exameFisicoData.frequenciaRespiratoria}irpm`);
    if (exameFisicoData.glicemia) partes.push(`Glicemia: ${exameFisicoData.glicemia}mg/dL`);
    // Campos de texto rico: no resumo mostramos só o texto legível.
    if (exameFisicoData.observacoesGerais) partes.push(paraTextoSimples(exameFisicoData.observacoesGerais));
    return partes.length > 0 ? partes.join(' | ') : null;
  };
  // Obtém diagnóstico
  const getDiagnostico = (): string | null => {
    if (!diagnosticoData) return null;
    const partes: string[] = [];
    if (diagnosticoData.diagnosticoPrincipal) {
      partes.push(`${diagnosticoData.diagnosticoPrincipal.codigo} - ${diagnosticoData.diagnosticoPrincipal.descricao}`);
    }
    if (diagnosticoData.observacoes) {
      partes.push(paraTextoSimples(diagnosticoData.observacoes));
    }
    return partes.length > 0 ? partes.join('\n') : null;
  };
  // Obtém evolução — o texto vem do editor de documento, então o resumo mostra
  // apenas o conteúdo legível, sem as marcações de formatação.
  const getEvolucao = (): string | null => {
    const texto = paraTextoSimples(evolucaoData?.evolucaoAtual).trim();
    return texto || null;
  };
  // Obtém prescrições
  const getPrescricoes = (): string | null => {
    const raw = prescricoesData?.prescricoes;
    if (!raw) return null;
    // Tenta parsear como JSON (PrescricaoData)
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        const partes: string[] = [];
        // Se tem controle especial
        if (parsed.controleEspecial) {
          partes.push('⚠️ Controle Especial');
        }
        // Se tem medicamentos como array
        if (Array.isArray(parsed.medicamentos) && parsed.medicamentos.length > 0) {
          parsed.medicamentos.forEach((med: any, i: number) => {
            let linha = `${i + 1}. ${med.nome || 'Medicamento'}`;
            if (med.dosagem) linha += ` - ${med.dosagem}`;
            if (med.quantidade && med.unidade) linha += ` (${med.quantidade} ${med.unidade})`;else if (med.quantidade) linha += ` (${med.quantidade})`;
            if (med.posologia) linha += `\n   Posologia: ${med.posologia}`;
            partes.push(linha);
          });
        }
        // Se tem campo descricao (texto livre da prescrição)
        if (parsed.descricao && parsed.descricao.trim()) {
          const descLimpa = parsed.descricao.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          if (partes.length > 0) partes.push('');
          partes.push(descLimpa);
        }
        // Se tem texto livre (generico)
        if (parsed.generico && parsed.generico.trim()) {
          if (partes.length > 0) partes.push('');
          partes.push(parsed.generico.trim());
        }
        if (partes.length > 0) return partes.join('\n');
      }
    } catch (e) {


      // Não é JSON — limpa possíveis \r\n literais e usa como texto
    } // Fallback: limpa o texto bruto de escape sequences
    return raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();};
  // Obtém exames
  const getExames = (): string | null => {
    if (!examesData) return null;
    const partes: string[] = [];
    if (examesData.descricao) partes.push(examesData.descricao);
    if (examesData.pedido) partes.push(`Pedido: ${paraTextoSimples(examesData.pedido)}`);
    if (examesData.justificativa) partes.push(`Justificativa: ${paraTextoSimples(examesData.justificativa)}`);
    if (examesData.cid10) partes.push(`CID-10: ${examesData.cid10}`);
    return partes.length > 0 ? partes.join('\n') : null;
  };
  // Monta conteúdo completo da anamnese
  const getAnamneseCompleta = (): string | null => {
    if (!anamneseData) return null;
    const partes: string[] = [];
    if (anamneseData.queixaPrincipal) {
      partes.push(`Queixa: ${paraTextoSimples(anamneseData.queixaPrincipal)}`);
    }
    if (anamneseData.historiaQueixa) {
      partes.push(`HDA: ${paraTextoSimples(anamneseData.historiaQueixa)}`);
    }
    return partes.length > 0 ? partes.join('\n') : null;
  };
  const sections: ResumoSection[] = [{
    id: 'anamnese',
    title: 'Anamnese',
    icon: FileTextIcon,
    content: getAnamneseCompleta(),
    color: 'text-teal-600',
    bgColor: 'bg-teal-50'
  }, {
    id: 'exame_fisico',
    title: 'Exame Físico',
    icon: StethoscopeIcon,
    content: formatarExameFisico(),
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  }, {
    id: 'exames',
    title: 'Exames',
    icon: FlaskConicalIcon,
    content: getExames(),
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  }, {
    id: 'diagnostico',
    title: 'Diagnóstico',
    icon: ActivityIcon,
    content: getDiagnostico(),
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  }, {
    id: 'evolucao',
    title: 'Evolução',
    icon: HistoryIcon,
    content: getEvolucao(),
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  }, {
    id: 'prescricoes',
    title: 'Prescrições',
    icon: PillIcon,
    content: getPrescricoes(),
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  }];
  const temDadosImportantes = anamneseData?.alergias || anamneseData?.historicoDoencas || anamneseData?.medicamentosEmUso;
  // ⭐ Enquanto os dados do atendimento estão carregando, mostra um spinner
  // em vez de uma tela que parece "vazia" (todas as seções "Não preenchido").
  if (loading) {
    return <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h2 className="text-2xl font-light text-gray-600 flex items-center gap-2">
            <ClipboardListIcon className="w-6 h-6 text-teal-600" />
            Resumo do Atendimento Atual
          </h2>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
        </div>
      </div>;
  }
  const algumaSecaoPreenchida = sections.some((s) => !!s.content) || !!temDadosImportantes;
  return <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-light text-gray-600 flex items-center gap-2">
          <ClipboardListIcon className="w-6 h-6 text-teal-600" />
          Resumo do Atendimento Atual
        </h2>
      </div>

      {!algumaSecaoPreenchida && <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <ClipboardListIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Este atendimento ainda não possui registros. Preencha as etapas
            (Anamnese, Exame Físico, Diagnóstico, etc.) para vê-las aqui.
          </p>
        </div>}

      {/* ⭐ Informações Importantes do Paciente */}
      {temDadosImportantes && <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4" />
            Informações Importantes do Paciente
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {anamneseData?.alergias && <div className="bg-white/60 rounded-lg p-3 border border-red-100">
                <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
                  <AlertCircleIcon className="w-3 h-3" />
                  Alergias
                </p>
                <p className="text-sm text-red-900">{anamneseData.alergias}</p>
              </div>}
            {anamneseData?.historicoDoencas && <div className="bg-white/60 rounded-lg p-3 border border-purple-100">
                <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1">
                  <HeartPulseIcon className="w-3 h-3" />
                  Doenças Crônicas
                </p>
                <p className="text-sm text-purple-900">
                  {anamneseData.historicoDoencas}
                </p>
              </div>}
            {anamneseData?.medicamentosEmUso && <div className="bg-white/60 rounded-lg p-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                  <PillIcon className="w-3 h-3" />
                  Medicamentos em Uso
                </p>
                <p className="text-sm text-blue-900">
                  {anamneseData.medicamentosEmUso}
                </p>
              </div>}
          </div>
        </div>}

      <div className="space-y-3">
        {sections.map((section) => {
        const Icon = section.icon;
        const hasContent = !!section.content;
        return <div key={section.id} onClick={() => onNavigateToStep?.(section.id)} className={`
                border rounded-xl p-4 transition-all cursor-pointer
                ${hasContent ? `${section.bgColor} border-transparent hover:shadow-md` : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}
              `}>
              
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasContent ? section.bgColor : 'bg-gray-100'}`}>
                    
                    <Icon className={`w-4 h-4 ${hasContent ? section.color : 'text-gray-400'}`} />
                    
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-semibold ${hasContent ? section.color : 'text-gray-500'}`}>
                      
                      {section.title}
                    </h4>
                    {hasContent ? <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                        {section.content}
                      </p> : <p className="text-sm text-gray-400 mt-1 italic">
                        Não preenchido
                      </p>}
                  </div>
                </div>
                <ChevronRightIcon className={`w-5 h-5 ${hasContent ? section.color : 'text-gray-300'}`} />
                
              </div>
            </div>;
      })}
      </div>
    </div>;
}