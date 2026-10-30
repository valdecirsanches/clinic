import React, { useCallback, useEffect, useRef, useState, Component } from 'react';
import { EditorDocumento } from '../EditorDocumento';
import { useDitadoEtapa } from '../../../hooks/useDitadoEtapa';
import { juntarHtml } from '../../../utils/ditadoProntuario';
import {
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  XIcon,
  PlusIcon,
  SearchIcon,
  Loader2Icon } from
'lucide-react';
import { Button } from '../../ui/Button';
import { API_BASE_URL } from '../../../config/api';
interface DiagnosticoItem {
  codigo: string;
  descricao: string;
}
interface DiagnosticoData {
  diagnosticoPrincipal: DiagnosticoItem | null;
  outrosDiagnosticos: DiagnosticoItem[];
  observacoes: string;
}
interface HistoricoDiagnostico {
  data: string;
  diagnosticoPrincipal: DiagnosticoItem | null;
  outrosDiagnosticos: DiagnosticoItem[];
}
interface DiagnosticoEtapaProps {
  data?: DiagnosticoData;
  historico?: HistoricoDiagnostico[];
  onChange?: (data: DiagnosticoData) => void;
  onSave?: (data: DiagnosticoData) => void;
  readOnly?: boolean;
  /** Há alterações não salvas (rascunho restaurado ou texto de outra aba): Salvar já começa habilitado. */
  naoSalvo?: boolean;
  pacienteId?: string;
  atendimentoId?: string | null;
  clinicaId?: string;
}
export function DiagnosticoEtapa({
  data,
  historico = [],
  onChange,
  onSave,
  readOnly = false,
  naoSalvo = false,
  pacienteId,
  atendimentoId,
  clinicaId
}: DiagnosticoEtapaProps) {
  const [formData, setFormData] = useState<DiagnosticoData>({
    diagnosticoPrincipal: data?.diagnosticoPrincipal || null,
    outrosDiagnosticos: data?.outrosDiagnosticos || [],
    observacoes: data?.observacoes || ''
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(naoSalvo);
  const [buscaPrincipal, setBuscaPrincipal] = useState('');
  const [buscaOutros, setBuscaOutros] = useState('');
  const [showSugestoesPrincipal, setShowSugestoesPrincipal] = useState(false);
  const [showSugestoesOutros, setShowSugestoesOutros] = useState(false);
  // Estados para busca na API
  const [sugestoesPrincipal, setSugestoesPrincipal] = useState<
    DiagnosticoItem[]>(
    []);
  const [sugestoesOutros, setSugestoesOutros] = useState<DiagnosticoItem[]>([]);
  const [loadingPrincipal, setLoadingPrincipal] = useState(false);
  const [loadingOutros, setLoadingOutros] = useState(false);
  useEffect(() => {
    if (data) {
      setFormData(data);
    }
  }, [data]);
  // Busca CIDs na API
  const buscarCids = useCallback(
    async (termo: string, tipo: 'principal' | 'outros') => {
      if (!termo || termo.length < 2) {
        if (tipo === 'principal') setSugestoesPrincipal([]);else
        setSugestoesOutros([]);
        return;
      }
      if (tipo === 'principal') setLoadingPrincipal(true);else
      setLoadingOutros(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/cid10/buscar?q=${encodeURIComponent(termo)}&limit=10`
        );
        if (response.ok) {
          const cids = await response.json();
          const items = cids.map((c: any) => ({
            codigo: c.codigo,
            descricao: c.descricao
          }));
          if (tipo === 'principal') setSugestoesPrincipal(items);else
          setSugestoesOutros(items);
        }
      } catch (err) {
        console.error('Erro ao buscar CIDs:', err);
      } finally {
        if (tipo === 'principal') setLoadingPrincipal(false);else
        setLoadingOutros(false);
      }
    },
    []
  );
  // Debounce para busca principal
  useEffect(() => {
    const timer = setTimeout(() => {
      if (buscaPrincipal.length >= 2) {
        buscarCids(buscaPrincipal, 'principal');
      } else {
        setSugestoesPrincipal([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaPrincipal, buscarCids]);
  // Debounce para busca outros
  useEffect(() => {
    const timer = setTimeout(() => {
      if (buscaOutros.length >= 2) {
        buscarCids(buscaOutros, 'outros');
      } else {
        setSugestoesOutros([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaOutros, buscarCids]);
  const handleChange = (field: keyof DiagnosticoData, value: any) => {
    const newData = {
      ...formData,
      [field]: value
    };
    setFormData(newData);
    setHasChanges(true);
    onChange?.(newData);
  };
  // Ditado: o CID nunca é escolhido sozinho — o termo vai para a busca e o
  // profissional confirma a sugestão certa. Observações entram no editor.
  const formRef = useRef(formData);
  formRef.current = formData;
  useDitadoEtapa('diagnostico', readOnly, (valores, modo) => {
    const campos: string[] = [];
    if (valores.cid && valores.cid.trim()) {
      if (formRef.current.diagnosticoPrincipal) {
        setBuscaOutros(valores.cid.trim());
        setShowSugestoesOutros(true);
      } else {
        setBuscaPrincipal(valores.cid.trim());
        setShowSugestoesPrincipal(true);
      }
      campos.push('cid');
    }
    if (valores.observacoes && valores.observacoes.trim()) {
      const novo = { ...formRef.current, observacoes: juntarHtml(formRef.current.observacoes, valores.observacoes, modo) };
      setFormData(novo);
      setHasChanges(true);
      onChange?.(novo);
      campos.push('observacoes');
    }
    return campos;
  });
  const handleSave = async () => {
    if (!onSave) {
      console.warn('⚠️ [DiagnosticoEtapa] onSave não definido');
      return;
    }
    console.log('💾 [DiagnosticoEtapa] Salvando diagnóstico...', formData);
    setIsSaving(true);
    try {
      await onSave(formData);
      setLastSaved(new Date());
      setHasChanges(false);
      console.log('✅ [DiagnosticoEtapa] Diagnóstico salvo com sucesso!');
    } catch (err) {
      console.error('❌ [DiagnosticoEtapa] Erro ao salvar:', err);
    } finally {
      setIsSaving(false);
    }
  };
  // Auto-save após 5 segundos de inatividade
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
  const selecionarDiagnosticoPrincipal = (cid: DiagnosticoItem) => {
    handleChange('diagnosticoPrincipal', cid);
    setBuscaPrincipal('');
    setShowSugestoesPrincipal(false);
    setSugestoesPrincipal([]);
  };
  const adicionarOutroDiagnostico = (cid: DiagnosticoItem) => {
    if (formData.outrosDiagnosticos.some((d) => d.codigo === cid.codigo)) return;
    handleChange('outrosDiagnosticos', [...formData.outrosDiagnosticos, cid]);
    setBuscaOutros('');
    setShowSugestoesOutros(false);
    setSugestoesOutros([]);
  };
  const removerDiagnosticoPrincipal = () => {
    handleChange('diagnosticoPrincipal', null);
  };
  const removerOutroDiagnostico = (codigo: string) => {
    handleChange(
      'outrosDiagnosticos',
      formData.outrosDiagnosticos.filter((d) => d.codigo !== codigo)
    );
  };
  return (
    <div className="animate-in fade-in duration-300">
      {/* Header FIXO no topo com botão de salvar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 pb-2 mb-3 -mx-6 px-6 pt-1">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-teal-700">
            Hipótese diagnóstica
          </h2>

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
              data-salvar-etapa
              title="Salvar (Ctrl+S)"
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

      {/* Campos de Diagnóstico */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Diagnóstico Principal */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Diagnóstico principal
            </label>

            {formData.diagnosticoPrincipal ?
            <div className="flex items-center gap-2 p-2 border border-gray-200 rounded-md bg-white">
                <span className="flex items-center gap-2 px-2 py-1 bg-teal-50 border border-teal-200 rounded text-sm">
                  <span className="text-teal-700 font-medium">
                    {formData.diagnosticoPrincipal.codigo}
                  </span>
                  <span className="text-gray-600">|</span>
                  <span className="text-gray-700">
                    {formData.diagnosticoPrincipal.descricao}
                  </span>
                  {!readOnly &&
                <button
                  onClick={removerDiagnosticoPrincipal}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                  
                      <XIcon className="w-4 h-4" />
                    </button>
                }
                </span>
              </div> :

            <div className="relative">
                <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
                  {loadingPrincipal ?
                <Loader2Icon className="w-4 h-4 text-gray-400 ml-2 animate-spin" /> :

                <SearchIcon className="w-4 h-4 text-gray-400 ml-2" />
                }
                  <input
                  type="text"
                  value={buscaPrincipal}
                  onChange={(e) => {
                    setBuscaPrincipal(e.target.value);
                    setShowSugestoesPrincipal(true);
                  }}
                  onFocus={() => setShowSugestoesPrincipal(true)}
                  onBlur={() =>
                  setTimeout(() => setShowSugestoesPrincipal(false), 200)
                  }
                  placeholder="Buscar CID-10 (código ou descrição)..."
                  disabled={readOnly}
                  className="w-full p-2 text-sm focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed" />
                
                </div>

                {showSugestoesPrincipal &&
              !readOnly && (
              sugestoesPrincipal.length > 0 || loadingPrincipal) &&
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {loadingPrincipal ?
                <div className="px-3 py-2 text-gray-500 text-sm flex items-center gap-2">
                          <Loader2Icon className="w-4 h-4 animate-spin" />
                          Buscando...
                        </div> :
                sugestoesPrincipal.length > 0 ?
                sugestoesPrincipal.map((cid) =>
                <button
                  key={cid.codigo}
                  onClick={() => selecionarDiagnosticoPrincipal(cid)}
                  className="w-full px-3 py-1.5 text-left hover:bg-teal-50 transition-colors flex items-center gap-2">
                  
                            <span className="text-teal-600 font-medium text-sm font-mono">
                              {cid.codigo}
                            </span>
                            <span className="text-gray-600 text-sm truncate">
                              {cid.descricao}
                            </span>
                          </button>
                ) :
                buscaPrincipal.length >= 2 ?
                <div className="px-3 py-2 text-gray-500 text-sm">
                          Nenhum CID encontrado. Verifique se a tabela CID-10
                          foi importada.
                        </div> :
                null}
                    </div>
              }
              </div>
            }
          </div>

          {/* Outros Diagnósticos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Outros diagnósticos
            </label>

            <div className="border border-gray-200 rounded-md p-2 bg-white min-h-[42px]">
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.outrosDiagnosticos.map((cid) =>
                <span
                  key={cid.codigo}
                  className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-sm">
                  
                    <span className="text-blue-700 font-medium font-mono">
                      {cid.codigo}
                    </span>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-700 truncate max-w-[150px]">
                      {cid.descricao}
                    </span>
                    {!readOnly &&
                  <button
                    onClick={() => removerOutroDiagnostico(cid.codigo)}
                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                    
                        <XIcon className="w-4 h-4" />
                      </button>
                  }
                  </span>
                )}
              </div>

              {!readOnly &&
              <div className="relative">
                  <div className="flex items-center border border-gray-100 rounded overflow-hidden bg-gray-50">
                    {loadingOutros ?
                  <Loader2Icon className="w-3.5 h-3.5 text-gray-400 ml-2 animate-spin" /> :

                  <PlusIcon className="w-3.5 h-3.5 text-gray-400 ml-2" />
                  }
                    <input
                    type="text"
                    value={buscaOutros}
                    onChange={(e) => {
                      setBuscaOutros(e.target.value);
                      setShowSugestoesOutros(true);
                    }}
                    onFocus={() => setShowSugestoesOutros(true)}
                    onBlur={() =>
                    setTimeout(() => setShowSugestoesOutros(false), 200)
                    }
                    placeholder="Adicionar CID..."
                    className="w-full p-1.5 text-sm bg-transparent focus:outline-none" />
                  
                  </div>

                  {showSugestoesOutros && (
                sugestoesOutros.length > 0 || loadingOutros) &&
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {loadingOutros ?
                  <div className="px-3 py-2 text-gray-500 text-sm flex items-center gap-2">
                            <Loader2Icon className="w-4 h-4 animate-spin" />
                            Buscando...
                          </div> :

                  sugestoesOutros.map((cid) =>
                  <button
                    key={cid.codigo}
                    onClick={() => adicionarOutroDiagnostico(cid)}
                    className="w-full px-3 py-1.5 text-left hover:bg-blue-50 transition-colors flex items-center gap-2">
                    
                              <span className="text-blue-600 font-medium text-sm font-mono">
                                {cid.codigo}
                              </span>
                              <span className="text-gray-600 text-sm truncate">
                                {cid.descricao}
                              </span>
                            </button>
                  )
                  }
                      </div>
                }
                </div>
              }
            </div>
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Observações
          </label>
          <EditorDocumento
            value={formData.observacoes}
            onChange={(html) => handleChange('observacoes', html)}
            placeholder="Observações sobre o diagnóstico..."
            disabled={readOnly}
            larguraTotal
            altura="media" />
          
        </div>

        {/* Indicador de salvamento */}
        <div className="pt-2">
          {lastSaved ?
          <span className="text-xs text-teal-600 cursor-pointer hover:underline">
              Salvo em {formatLastSaved()}
            </span> :

          <span className="text-xs text-gray-400">Salvo em</span>
          }
        </div>

        {/* Histórico */}
        {historico.length > 0 &&
        <div className="border-t border-dashed border-gray-200 pt-4 space-y-2">
            {historico.map((h, index) =>
          <div key={index} className="text-sm text-gray-600">
                <p className="font-medium text-gray-800">
                  Último Diagnóstico:{' '}
                  {new Date(h.data).toLocaleDateString('pt-BR')}
                </p>
                {h.diagnosticoPrincipal &&
            <p>
                    Diagnóstico: {h.diagnosticoPrincipal.descricao} (
                    {h.diagnosticoPrincipal.codigo});
                  </p>
            }
                {h.outrosDiagnosticos.length > 0 &&
            <p>
                    Outros diagnósticos:{' '}
                    {h.outrosDiagnosticos.map((d) => d.descricao).join('; ')};
                  </p>
            }
              </div>
          )}
          </div>
        }
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
                Salvar Diagnóstico
              </>
          }
          </Button>
        </div>
      }
    </div>);

}