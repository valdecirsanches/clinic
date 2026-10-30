import React, { useEffect, useRef, useState } from 'react';
import { SaveIcon, CheckCircleIcon, ClockIcon } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EditorDocumento } from '../EditorDocumento';
import { CampoRecolhivel } from '../CampoRecolhivel';
import { useDitadoEtapa } from '../../../hooks/useDitadoEtapa';
import { juntarHtml, juntarTexto } from '../../../utils/ditadoProntuario';

const CAMPOS_HTML = ['queixaPrincipal', 'historiaQueixa', 'historicoDoencas', 'historicoFamiliar'];
const CAMPOS_TEXTO = ['alergias', 'medicamentosEmUso', 'habitosVida'];
interface AnamneseData {
  queixaPrincipal: string;
  historiaQueixa: string;
  historicoDoencas: string;
  alergias: string;
  medicamentosEmUso: string;
  historicoFamiliar: string;
  habitosVida: string;
}
interface AnamneseEtapaProps {
  data?: AnamneseData;
  onChange?: (data: AnamneseData) => void;
  onSave?: (data: AnamneseData) => void;
  readOnly?: boolean;
  pacienteId?: string;
  atendimentoId?: string | null;
  clinicaId?: string;
}
export function AnamneseEtapa({
  data,
  onChange,
  onSave,
  readOnly = false,
  pacienteId,
  atendimentoId,
  clinicaId
}: AnamneseEtapaProps) {
  const [formData, setFormData] = useState<AnamneseData>({
    queixaPrincipal: data?.queixaPrincipal || '',
    historiaQueixa: data?.historiaQueixa || '',
    historicoDoencas: data?.historicoDoencas || '',
    alergias: data?.alergias || '',
    medicamentosEmUso: data?.medicamentosEmUso || '',
    historicoFamiliar: data?.historicoFamiliar || '',
    habitosVida: data?.habitosVida || ''
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  // Atualiza quando data externa muda
  useEffect(() => {
    if (data) {
      setFormData(data);
    }
  }, [data]);
  const handleChange = (field: keyof AnamneseData, value: string) => {
    const newData = {
      ...formData,
      [field]: value
    };
    setFormData(newData);
    setHasChanges(true);
    onChange?.(newData);
  };
  // Ditado pelo assistente: mesmo caminho da digitação (salva sozinho).
  const formRef = useRef(formData);
  formRef.current = formData;
  useDitadoEtapa('anamnese', readOnly, (valores, modo) => {
    const novo = { ...formRef.current };
    const campos: string[] = [];
    Object.entries(valores).forEach(([campo, texto]) => {
      if (!texto || !texto.trim()) return;
      const chave = campo as keyof AnamneseData;
      if (CAMPOS_HTML.includes(campo)) novo[chave] = juntarHtml(novo[chave], texto, modo);else
      if (CAMPOS_TEXTO.includes(campo)) novo[chave] = juntarTexto(novo[chave], texto, modo);else
      return;
      campos.push(campo);
    });
    if (campos.length) {
      setFormData(novo);
      setHasChanges(true);
      onChange?.(novo);
    }
    return campos;
  });
  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(formData);
      setLastSaved(new Date());
      setHasChanges(false);
    } catch (err) {
      console.error('Erro ao salvar anamnese:', err);
    } finally {
      setIsSaving(false);
    }
  };
  // Auto-save após 5 segundos de inatividade (aumentado para dar tempo de editar)
  useEffect(() => {
    if (!hasChanges || readOnly || !onSave) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 5000);
    return () => clearTimeout(timer);
  }, [formData, hasChanges, readOnly, onSave]);
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    return lastSaved.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  return (
    <div className="animate-in fade-in duration-300">
      {/* Header FIXO no topo com botão de salvar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 pb-2 mb-3 -mx-6 px-6 pt-1">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-teal-700">Anamnese</h2>

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

            {/* Botão de Salvar */}
            {!readOnly && onSave &&
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              size="sm"
              className={`${hasChanges ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              
                {isSaving ?
              <>
                    <SaveIcon className="w-4 h-4 mr-1.5 animate-pulse" />
                    Salvando...
                  </> :

              <>
                    <SaveIcon className="w-4 h-4 mr-1.5" />
                    Salvar
                  </>
              }
              </Button>
            }
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="space-y-3">
        {/* Queixa Principal — a única seção visível ao abrir a etapa: é o campo
             obrigatório e o ponto de partida do atendimento. */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Queixa Principal <span className="text-red-500">*</span>
          </label>
          <EditorDocumento
            value={formData.queixaPrincipal}
            onChange={(html) => handleChange('queixaPrincipal', html)}
            placeholder="Motivo principal da consulta..."
            disabled={readOnly}
            larguraTotal
            altura="media" />
          
        </div>

        <CampoRecolhivel
          titulo="História da Queixa Atual (HDA)"
          valor={formData.historiaQueixa}>
          
          <EditorDocumento
            value={formData.historiaQueixa}
            onChange={(html) => handleChange('historiaQueixa', html)}
            placeholder="Descreva a evolução dos sintomas, início, duração, fatores de melhora/piora..."
            disabled={readOnly}
            larguraTotal
            altura="media" />
          
        </CampoRecolhivel>

        <CampoRecolhivel
          titulo="Histórico de Doenças Pregressas"
          valor={formData.historicoDoencas}>
          
          <EditorDocumento
            value={formData.historicoDoencas}
            onChange={(html) => handleChange('historicoDoencas', html)}
            placeholder="Doenças anteriores, cirurgias, internações..."
            disabled={readOnly}
            larguraTotal
            altura="compacta" />
          
        </CampoRecolhivel>

        <CampoRecolhivel titulo="Alergias" valor={formData.alergias}>
          <textarea
            rows={3}
            value={formData.alergias}
            onChange={(e) => handleChange('alergias', e.target.value)}
            placeholder="Medicamentos, alimentos, substâncias..."
            disabled={readOnly}
            className="w-full border border-red-200 rounded-md p-2 text-sm bg-red-50/40 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 transition-colors resize-y disabled:bg-gray-50 disabled:cursor-not-allowed" />
          
        </CampoRecolhivel>

        <CampoRecolhivel
          titulo="Medicamentos em Uso"
          valor={formData.medicamentosEmUso}>
          
          <textarea
            rows={3}
            value={formData.medicamentosEmUso}
            onChange={(e) => handleChange('medicamentosEmUso', e.target.value)}
            placeholder="Nome, dose, frequência..."
            disabled={readOnly}
            className="w-full border border-blue-200 rounded-md p-2 text-sm bg-blue-50/40 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-colors resize-y disabled:bg-gray-50 disabled:cursor-not-allowed" />
          
        </CampoRecolhivel>

        <CampoRecolhivel
          titulo="Histórico Familiar"
          valor={formData.historicoFamiliar}>
          
          <EditorDocumento
            value={formData.historicoFamiliar}
            onChange={(html) => handleChange('historicoFamiliar', html)}
            placeholder="Doenças na família (diabetes, hipertensão, câncer, etc.)..."
            disabled={readOnly}
            larguraTotal
            altura="compacta" />
          
        </CampoRecolhivel>

        <CampoRecolhivel titulo="Hábitos de Vida" valor={formData.habitosVida}>
          <textarea
            rows={3}
            value={formData.habitosVida}
            onChange={(e) => handleChange('habitosVida', e.target.value)}
            placeholder="Tabagismo, etilismo, atividade física, alimentação..."
            disabled={readOnly}
            className="w-full border border-gray-200 rounded-md p-2 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-colors resize-y disabled:bg-gray-50 disabled:cursor-not-allowed" />
          
        </CampoRecolhivel>
      </div>

      {/* Rodapé com botão de salvar grande (para mobile) */}
      {!readOnly && onSave && hasChanges &&
      <div className="sticky bottom-0 bg-white border-t border-gray-100 pt-4 -mx-6 px-6 mt-6 pb-2 md:hidden">
          <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3">
          
            {isSaving ?
          <>
                <SaveIcon className="w-5 h-5 mr-2 animate-pulse" />
                Salvando...
              </> :

          <>
                <SaveIcon className="w-5 h-5 mr-2" />
                Salvar Anamnese
              </>
          }
          </Button>
        </div>
      }
    </div>);

}