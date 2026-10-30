import React, { useCallback, useEffect, useState, useRef } from 'react';
import { EditorDocumento } from '../EditorDocumento';
import { useDitadoEtapa } from '../../../hooks/useDitadoEtapa';
import { juntarHtml } from '../../../utils/ditadoProntuario';
import {
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  HeartPulseIcon,
  RulerIcon,
  ScaleIcon,
  ActivityIcon,
  ThermometerIcon,
  WindIcon,
  AlertCircleIcon } from
'lucide-react';
interface ExameFisicoData {
  altura: string;
  peso: string;
  imc: string;
  pressaoArterial: string;
  pulso: string;
  temperatura: string;
  saturacaoO2: string;
  frequenciaRespiratoria: string;
  glicemia: string;
  observacoesGerais: string;
}
interface ExameFisicoEtapaProps {
  data?: ExameFisicoData;
  onChange?: (data: ExameFisicoData) => void;
  onSave?: (data: ExameFisicoData) => void;
  readOnly?: boolean;
  /** Há alterações não salvas (rascunho restaurado ou texto de outra aba): Salvar já começa habilitado. */
  naoSalvo?: boolean;
  pacienteId?: string;
  atendimentoId?: string | null;
  clinicaId?: string;
}
const INITIAL_DATA: ExameFisicoData = {
  altura: '',
  peso: '',
  imc: '',
  pressaoArterial: '',
  pulso: '',
  temperatura: '',
  saturacaoO2: '',
  frequenciaRespiratoria: '',
  glicemia: '',
  observacoesGerais: ''
};
function calcularIMC(altura: string, peso: string): string {
  const alturaNum = parseFloat(altura.replace(',', '.'));
  const pesoNum = parseFloat(peso.replace(',', '.'));
  if (!alturaNum || !pesoNum || alturaNum <= 0 || pesoNum <= 0) return '';
  const alturaMetros = alturaNum > 3 ? alturaNum / 100 : alturaNum;
  return (pesoNum / (alturaMetros * alturaMetros)).toFixed(1);
}
function getIMCClassificacao(imc: string) {
  const val = parseFloat(imc);
  if (isNaN(val)) return null;
  if (val < 18.5)
  return {
    texto: 'Abaixo do peso',
    cor: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200'
  };
  if (val < 25)
  return {
    texto: 'Peso normal',
    cor: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200'
  };
  if (val < 30)
  return {
    texto: 'Sobrepeso',
    cor: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200'
  };
  if (val < 35)
  return {
    texto: 'Obesidade I',
    cor: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200'
  };
  if (val < 40)
  return {
    texto: 'Obesidade II',
    cor: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200'
  };
  return {
    texto: 'Obesidade III',
    cor: 'text-red-800',
    bg: 'bg-red-100',
    border: 'border-red-300'
  };
}
function getPAClassificacao(pa: string) {
  if (!pa || !pa.includes('/')) return null;
  const [sistStr, diastStr] = pa.split('/');
  const sist = parseInt(sistStr);
  const diast = parseInt(diastStr);
  if (isNaN(sist) || isNaN(diast)) return null;
  if (sist < 90 || diast < 60)
  return {
    texto: 'Hipotensão',
    cor: 'text-blue-600'
  };
  if (sist <= 120 && diast <= 80)
  return {
    texto: 'Normal',
    cor: 'text-green-600'
  };
  if (sist <= 139 || diast <= 89)
  return {
    texto: 'Pré-hipertensão',
    cor: 'text-amber-600'
  };
  if (sist <= 159 || diast <= 99)
  return {
    texto: 'Hipertensão I',
    cor: 'text-orange-600'
  };
  if (sist <= 179 || diast <= 109)
  return {
    texto: 'Hipertensão II',
    cor: 'text-red-600'
  };
  return {
    texto: 'Crise hipertensiva',
    cor: 'text-red-800'
  };
}
function getPulsoClassificacao(pulso: string) {
  const val = parseInt(pulso);
  if (isNaN(val)) return null;
  if (val < 60)
  return {
    texto: 'Bradicardia',
    cor: 'text-blue-600'
  };
  if (val <= 100)
  return {
    texto: 'Normal',
    cor: 'text-green-600'
  };
  return {
    texto: 'Taquicardia',
    cor: 'text-red-600'
  };
}
export function ExameFisicoEtapa({
  data,
  onChange,
  onSave,
  readOnly = false,
  naoSalvo = false,
  pacienteId,
  atendimentoId,
  clinicaId
}: ExameFisicoEtapaProps) {
  const [formData, setFormData] = useState<ExameFisicoData>(() => ({
    ...INITIAL_DATA,
    ...data
  }));
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(naoSalvo);
  const [saveError, setSaveError] = useState<string | null>(null);
  // ⭐ Refs para auto-save robusto (evita stale closures)
  const formDataRef = useRef(formData);
  const onSaveRef = useRef(onSave);
  const hasChangesRef = useRef(hasChanges);
  const isSavingRef = useRef(isSaving);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Mantém refs sincronizados
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);
  // Atualiza quando data externa muda (ex: ao trocar de atendimento)
  useEffect(() => {
    if (data) {
      setFormData((prev) => {
        const newData = {
          ...INITIAL_DATA,
          ...data
        };
        // Só atualiza se realmente mudou (evita loop)
        if (JSON.stringify(prev) !== JSON.stringify(newData)) {
          return newData;
        }
        return prev;
      });
    }
  }, [data]);
  // ⭐ Função de save robusta usando refs
  const executeSave = useCallback(async () => {
    if (!onSaveRef.current || isSavingRef.current || !hasChangesRef.current)
    return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSaveRef.current(formDataRef.current);
      setLastSaved(new Date());
      setHasChanges(false);
      console.log('✅ [ExameFisicoEtapa] Salvo automaticamente');
    } catch (err: any) {
      console.error('❌ [ExameFisicoEtapa] Erro ao salvar:', err);
      setSaveError(err.message || 'Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  }, []);
  // ⭐ Auto-save com debounce de 2 segundos
  const scheduleAutoSave = useCallback(() => {
    if (readOnly || !onSaveRef.current) return;
    // Cancela timer anterior
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    // Agenda novo save
    autoSaveTimerRef.current = setTimeout(() => {
      executeSave();
    }, 2000);
  }, [readOnly, executeSave]);
  // Limpa timer ao desmontar
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);
  // Handler de mudança de campo
  const handleChange = useCallback(
    (field: keyof ExameFisicoData, value: string) => {
      setFormData((prev) => {
        const newData = {
          ...prev,
          [field]: value
        };
        // Recalcula IMC quando altura ou peso mudam
        if (field === 'altura' || field === 'peso') {
          const novaAltura = field === 'altura' ? value : prev.altura;
          const novoPeso = field === 'peso' ? value : prev.peso;
          newData.imc = calcularIMC(novaAltura, novoPeso);
        }
        return newData;
      });
      setHasChanges(true);
      setSaveError(null);
      // Notifica parent
      setFormData((current) => {
        onChange?.(current);
        return current;
      });
      // Agenda auto-save
      scheduleAutoSave();
    },
    [onChange, scheduleAutoSave]
  );
  // Ditado pelo assistente: sinais vitais e observações pelo mesmo handleChange.
  useDitadoEtapa('exame_fisico', readOnly, (valores, modo) => {
    const campos: string[] = [];
    Object.entries(valores).forEach(([campo, texto]) => {
      if (!texto || !String(texto).trim()) return;
      if (campo === 'observacoesGerais') {
        handleChange('observacoesGerais', juntarHtml(formDataRef.current.observacoesGerais, texto, modo));
      } else if (campo in INITIAL_DATA && campo !== 'imc') {
        handleChange(campo as keyof ExameFisicoData, String(texto).trim());
      } else return;
      campos.push(campo);
    });
    return campos;
  });
  // Save manual
  const handleManualSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    await executeSave();
  }, [executeSave]);
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    return lastSaved.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const imcClass = getIMCClassificacao(formData.imc);
  const paClass = getPAClassificacao(formData.pressaoArterial);
  const pulsoClass = getPulsoClassificacao(formData.pulso);
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-100 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-100 rounded-md flex items-center justify-center">
            <HeartPulseIcon className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-teal-700">Exame Físico</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Salva automaticamente ao digitar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status de salvamento */}
          {saveError &&
          <span className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
              <AlertCircleIcon className="w-3.5 h-3.5" />
              Erro ao salvar
            </span>
          }
          {isSaving &&
          <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              <SaveIcon className="w-3.5 h-3.5 animate-pulse" />
              Salvando...
            </span>
          }
          {!isSaving && !saveError && lastSaved && !hasChanges &&
          <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Salvo às {formatLastSaved()}
            </span>
          }
          {!isSaving && !saveError && hasChanges &&
          <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
              <ClockIcon className="w-3.5 h-3.5" />
              Alterações pendentes
            </span>
          }

          {/* Botão salvar manual */}
          {!readOnly && onSave &&
          <button
            onClick={handleManualSave}
            data-salvar-etapa
            title="Salvar (Ctrl+S)"
              disabled={isSaving || !hasChanges}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${hasChanges && !isSaving ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            
              <SaveIcon className="w-4 h-4" />
              Salvar
            </button>
          }
        </div>
      </div>

      {/* Sinais Vitais - Grid Principal */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Sinais Vitais
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Altura */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <RulerIcon className="w-3 h-3 text-gray-400" />
              Altura
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.altura}
                onChange={(e) => handleChange('altura', e.target.value)}
                placeholder="1.75"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-7" />
              

              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                m
              </span>
            </div>
          </div>

          {/* Peso */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <ScaleIcon className="w-3 h-3 text-gray-400" />
              Peso
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.peso}
                onChange={(e) => handleChange('peso', e.target.value)}
                placeholder="70"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-7" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                kg
              </span>
            </div>
          </div>

          {/* IMC (calculado) */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">IMC</label>
            <div
              className={`border rounded-md px-2 py-1.5 text-sm ${imcClass ? `${imcClass.bg} ${imcClass.border}` : 'bg-gray-50 border-gray-200'}`}>
              
              <span
                className={`font-semibold ${imcClass ? imcClass.cor : 'text-gray-400'}`}>
                
                {formData.imc || '—'}
              </span>
            </div>
            {imcClass &&
            <span className={`text-[10px] font-medium ${imcClass.cor}`}>
                {imcClass.texto}
              </span>
            }
          </div>

          {/* Pressão Arterial */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <ActivityIcon className="w-3 h-3 text-gray-400" />
              Pressão Arterial
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.pressaoArterial}
                onChange={(e) =>
                handleChange('pressaoArterial', e.target.value)
                }
                placeholder="120/80"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-10" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                mmHg
              </span>
            </div>
            {paClass &&
            <span className={`text-[10px] font-medium ${paClass.cor}`}>
                {paClass.texto}
              </span>
            }
          </div>

          {/* Pulso / FC */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <HeartPulseIcon className="w-3 h-3 text-gray-400" />
              Pulso / FC
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.pulso}
                onChange={(e) => handleChange('pulso', e.target.value)}
                placeholder="72"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-9" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                bpm
              </span>
            </div>
            {pulsoClass &&
            <span className={`text-[10px] font-medium ${pulsoClass.cor}`}>
                {pulsoClass.texto}
              </span>
            }
          </div>
        </div>

        {/* Linha 2: Campos adicionais */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Temperatura */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <ThermometerIcon className="w-3 h-3 text-gray-400" />
              Temperatura
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.temperatura}
                onChange={(e) => handleChange('temperatura', e.target.value)}
                placeholder="36.5"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-7" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                °C
              </span>
            </div>
          </div>

          {/* Saturação O2 */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <WindIcon className="w-3 h-3 text-gray-400" />
              SpO₂
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.saturacaoO2}
                onChange={(e) => handleChange('saturacaoO2', e.target.value)}
                placeholder="98"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-7" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                %
              </span>
            </div>
          </div>

          {/* Frequência Respiratória */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Freq. Respiratória
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.frequenciaRespiratoria}
                onChange={(e) =>
                handleChange('frequenciaRespiratoria', e.target.value)
                }
                placeholder="16"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-9" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                irpm
              </span>
            </div>
          </div>

          {/* Glicemia */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Glicemia
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.glicemia}
                onChange={(e) => handleChange('glicemia', e.target.value)}
                placeholder="90"
                disabled={readOnly}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed pr-10" />
              

              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                mg/dL
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Observações Gerais */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">
          Observações do Exame Físico
        </label>
        <EditorDocumento
          value={formData.observacoesGerais}
          onChange={(html) => handleChange('observacoesGerais', html)}
          placeholder="Descreva os achados do exame físico: inspeção, palpação, ausculta, percussão..."
          disabled={readOnly}
          larguraTotal
          altura="media" />
        
      </div>

      {/* Erro de salvamento */}
      {saveError &&
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              Erro ao salvar exame físico
            </p>
            <p className="text-sm text-red-600 mt-1">{saveError}</p>
          </div>
          <button
          onClick={() => setSaveError(null)}
          className="text-red-400 hover:text-red-600 text-lg leading-none">
          
            &times;
          </button>
        </div>
      }

      {/* Rodapé mobile com botão salvar */}
      {!readOnly && onSave && hasChanges &&
      <div className="sticky bottom-0 bg-white border-t border-gray-100 pt-4 -mx-6 px-6 mt-6 pb-2 md:hidden">
          <button
          onClick={handleManualSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-lg text-sm font-medium transition-colors">
          
            <SaveIcon className="w-5 h-5" />
            {isSaving ? 'Salvando...' : 'Salvar Exame Físico'}
          </button>
        </div>
      }
    </div>);

}