import React, { useEffect, useState } from 'react';
import {
  SaveIcon,
  ClockIcon,
  CalendarIcon,
  Edit3Icon,
  LockIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  PlusIcon,
  ChevronRightIcon,
  ActivityIcon } from
'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import { useDialog } from '../../../hooks/useDialog';
import { DialogContainer } from '../../DialogContainer';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EditorDocumento } from '../EditorDocumento';
import { paraHtmlImpressao, paraTextoSimples } from '../../../utils/htmlTexto';
import { useDitadoEtapa } from '../../../hooks/useDitadoEtapa';
import { juntarHtml } from '../../../utils/ditadoProntuario';

// Preferência de exibição do painel lateral (mesmo mecanismo da Prescrição)
const CHAVE_PAINEL_EVOLUCAO = 'evolucao:painelVisivel';

interface EvolucaoItem {
  id?: string;
  data: string;
  texto: string;
  profissionalId?: string;
  profissionalNome?: string;
}
interface EvolucaoData {
  evolucaoAtual: string;
}
interface EvolucaoEtapaProps {
  /** Devolve o registro criado, para o histórico exibi-lo de imediato. */
  onSave?: (
  data: EvolucaoData)
  => Promise<EvolucaoItem | void> | EvolucaoItem | void;
  onEditarEvolucao?: (id: string, texto: string) => void;
  onExcluirEvolucao?: (id: string) => void;
  readOnly?: boolean;
  pacienteId?: string;
  atendimentoId?: string | null;
  clinicaId?: string;
  consultaAssinada?: boolean;
  dataAssinatura?: string;
  pacienteNome?: string;
  pacienteTelefone?: string;
  /** Texto da nova evolução ainda não adicionada (sobrevive à troca de aba). */
  textoInicial?: string;
  /** Avisa a página a cada mudança no texto da NOVA evolução (rascunho). */
  onTextoChange?: (texto: string) => void;
}
export function EvolucaoEtapa({
  onSave,
  onEditarEvolucao,
  onExcluirEvolucao,
  readOnly = false,
  pacienteId,
  atendimentoId,
  clinicaId,
  consultaAssinada = false,
  dataAssinatura,
  pacienteNome,
  pacienteTelefone,
  textoInicial = '',
  onTextoChange
}: EvolucaoEtapaProps) {
  const [formData, setFormData] = useState<EvolucaoData>({
    evolucaoAtual: textoInicial
  });
  const [refreshKey, setRefreshKey] = useState(0);
  // ⭐ Evolução do histórico aberta no editor. O rascunho da nova evolução é
  //    guardado à parte para nada do que estava sendo escrito ser perdido.
  const [selecionada, setSelecionada] = useState<EvolucaoItem | null>(null);
  // Rascunho da NOVA evolução vai para a página (troca de aba / rascunho local).
  // Quando uma evolução do histórico está aberta, o texto em edição é dela.
  const onTextoChangeRef = React.useRef(onTextoChange);
  onTextoChangeRef.current = onTextoChange;
  useEffect(() => {
    if (!selecionada) onTextoChangeRef.current?.(formData.evolucaoAtual);
  }, [formData.evolucaoAtual, selecionada]);
  const [rascunho, setRascunho] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // ⭐ FASE 1: estado de ERRO de salvamento, para o médico nunca ser enganado
  // por um "Salvando…" que falhou em silêncio. Mostra mensagem + botão tentar de novo.
  const [saveError, setSaveError] = useState<string | null>(null);
  // ⭐ Histórico carregado da API (evoluções anteriores do paciente)
  const [historicoCarregado, setHistoricoCarregado] = useState<EvolucaoItem[]>(
    []
  );
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  // ⭐ ID do profissional logado (para controle de edição)
  const [usuarioLogadoId, setUsuarioLogadoId] = useState<string>('');
  // ⭐ Painel lateral com o histórico: recolhível, para a descrição da evolução
  //    usar toda a largura. A escolha é lembrada entre atendimentos.
  const [painelVisivel, setPainelVisivel] = useState<boolean>(() => {
    try {
      // Começa escondido: a área de escrita é a protagonista da tela.
      return localStorage.getItem(CHAVE_PAINEL_EVOLUCAO) === '1';
    } catch {
      return false;
    }
  });
  const alternarPainel = () => {
    setPainelVisivel((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(CHAVE_PAINEL_EVOLUCAO, proximo ? '1' : '0');
      } catch {

        /* ignore */}
      return proximo;
    });
  };
  const { dialogs, removeDialog, confirm } = useDialog();
  useEffect(() => {
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        setUsuarioLogadoId(parsed.usuario?.id || '');
      }
    } catch {

      /* ignore */}
  }, []);
  // ⭐ Carrega histórico de evoluções do paciente via API
  useEffect(() => {
    const carregarHistorico = async () => {
      if (!pacienteId || !clinicaId) return;
      setLoadingHistorico(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/evolucoes?clinicaId=${clinicaId}&pacienteId=${pacienteId}`
        );
        if (response.ok) {
          const dados = await response.json();
          const items: EvolucaoItem[] = (Array.isArray(dados) ? dados : []).
          map((e: any) => ({
            id: e.id || e.consultaId || '',
            data: e.data || e.createdAt || e.dataConsulta || '',
            texto: e.evolucao || e.evolucaoAtual || e.texto || '',
            profissionalId: e.profissionalId || '',
            profissionalNome: e.profissional || e.profissionalNome || ''
          })).
          filter((e: EvolucaoItem) => e.texto && e.texto.trim());
          setHistoricoCarregado(items);
        }
      } catch (err) {
        console.error('Erro ao carregar histórico de evoluções:', err);
      } finally {
        setLoadingHistorico(false);
      }
    };
    carregarHistorico();
  }, [pacienteId, clinicaId, refreshKey]);
  const handleChange = (value: string) => {
    setFormData({
      evolucaoAtual: value
    });
    if (saveError) setSaveError(null);
  };
  // Ditado: entra na nova evolução (nunca numa evolução antiga aberta).
  // O profissional revisa e clica em "Adicionar" — como na digitação.
  useDitadoEtapa('evolucao', readOnly || consultaAssinada || Boolean(selecionada), (valores, modo) => {
    const texto = valores.evolucaoAtual;
    if (!texto || !texto.trim()) return [];
    setFormData((atual) => ({ evolucaoAtual: juntarHtml(atual.evolucaoAtual, texto, modo) }));
    setSaveError(null);
    return ['evolucaoAtual'];
  });
  // Só há evolução para salvar quando existe TEXTO — um parágrafo vazio do
  // editor (<p><br></p>) não conta como conteúdo.
  const temTexto = !!paraTextoSimples(formData.evolucaoAtual).trim();
  const handleAdicionarEvolucao = async () => {
    // Nada de botão que "não faz nada": o motivo fica visível.
    if (!temTexto) {
      setSaveError('Escreva a evolução antes de adicioná-la ao histórico.');
      return;
    }
    if (!onSave) {
      setSaveError(
        'Este atendimento está assinado. Clique em "Nova Evolução" no topo da página para registrar novas informações.'
      );
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const criada = await onSave(formData);
      // Aparece no histórico IMEDIATAMENTE, com o registro devolvido pelo
      // salvamento — sem esperar a recarga da lista.
      if (criada && criada.texto) {
        setHistoricoCarregado((atual) => [criada as EvolucaoItem, ...atual]);
      }
      setFormData({
        evolucaoAtual: ''
      }); // Limpa o campo
      setRascunho('');
      setSelecionada(null);
      // Mostra o histórico para o registro recém-criado ficar visível na hora
      // (sem alterar a preferência guardada do painel).
      setPainelVisivel(true);
      setRefreshKey((prev) => prev + 1); // Reconcilia com o servidor
    } catch (err: any) {
      console.error('Erro ao salvar evolução:', err);
      setSaveError(err?.message || 'Não foi possível salvar a evolução.');
    } finally {
      setIsSaving(false);
    }
  };
  // Abre uma evolução do histórico no editor, preservando o rascunho em aberto.
  const handleAbrirDoHistorico = (item: EvolucaoItem) => {
    if (selecionada && selecionada.id === item.id) return;
    if (!selecionada) setRascunho(formData.evolucaoAtual);
    setSelecionada(item);
    setFormData({
      evolucaoAtual: item.texto
    });
    setSaveError(null);
  };
  // Volta ao rascunho da nova evolução, exatamente como estava.
  const handleVoltarParaNova = () => {
    setSelecionada(null);
    setFormData({
      evolucaoAtual: rascunho
    });
    setSaveError(null);
  };
  const podeEditarSelecionada =
  !!selecionada &&
  !readOnly &&
  !!onEditarEvolucao &&
  !!selecionada.profissionalId &&
  selecionada.profissionalId === usuarioLogadoId;
  const handleSalvarEdicao = async () => {
    if (!onEditarEvolucao || !selecionada?.id || !temTexto) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onEditarEvolucao(selecionada.id, formData.evolucaoAtual);
      // Reflete a alteração no histórico de imediato.
      setHistoricoCarregado((atual) =>
      atual.map((e) =>
      e.id === selecionada.id ?
      {
        ...e,
        texto: formData.evolucaoAtual
      } :
      e
      )
      );
      setSelecionada(null);
      setFormData({
        evolucaoAtual: rascunho
      });
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      console.error('Erro ao salvar edição da evolução:', err);
      setSaveError(err?.message || 'Não foi possível salvar a alteração.');
    } finally {
      setIsSaving(false);
    }
  };
  const handleExcluir = async (id: string) => {
    if (!onExcluirEvolucao) return;
    const shouldDelete = await confirm(
      'Excluir Evolução',
      'Tem certeza que deseja excluir esta evolução?',
      'Excluir',
      'Cancelar'
    );
    if (!shouldDelete) return;
    try {
      await onExcluirEvolucao(id);
      // Sai do histórico imediatamente.
      setHistoricoCarregado((atual) => atual.filter((e) => e.id !== id));
      // Se a evolução excluída estava aberta, volta ao rascunho da nova.
      if (selecionada?.id === id) {
        setSelecionada(null);
        setFormData({
          evolucaoAtual: rascunho
        });
      }
      setRefreshKey((prev) => prev + 1);
    } catch (err) {

      // Erro já tratado no parent
    }};
  const historicoExibir = historicoCarregado;
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const somenteData = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const d = somenteData ?
      new Date(
        Number(somenteData[1]),
        Number(somenteData[2]) - 1,
        Number(somenteData[3])
      ) :
      new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* ===== HEADER FIXO ===== */}
      <div className="flex-shrink-0 border-b border-gray-100 pb-2 mb-3 bg-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h2 className="text-lg font-medium text-teal-700 flex items-center gap-2">
              <ActivityIcon className="w-5 h-5" />
              Evolução
            </h2>
            {!readOnly &&
            <p className="text-[10px] text-gray-500 mt-0.5">
                Escreva a evolução e clique em "Adicionar evolução" para
                registrá-la no histórico
              </p>
            }
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {saveError && !isSaving ?
            <button
              type="button"
              onClick={handleAdicionarEvolucao}
              className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors">
              
                <AlertCircleIcon className="w-3.5 h-3.5" />
                Falha ao adicionar — tentar novamente
                <RefreshCwIcon className="w-3 h-3" />
              </button> :

            isSaving &&
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                  <SaveIcon className="w-3.5 h-3.5 animate-pulse" />
                  Salvando...
                </span>

            }

            <Button
              variant="outline"
              size="sm"
              onClick={alternarPainel}
              aria-pressed={painelVisivel}
              className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              title={
              painelVisivel ?
              'Esconder o histórico e ampliar a área de escrita' :
              'Mostrar o histórico de evoluções'
              }>
              
              {painelVisivel ?
              <>
                  <ChevronRightIcon className="w-4 h-4 mr-2" /> Esconder
                  histórico
                </> :

              <>
                  <ClockIcon className="w-4 h-4 mr-2" /> Histórico (
                  {historicoExibir.length})
                </>
              }
            </Button>

            {selecionada ?
            <>
                <Button
                variant="outline"
                size="sm"
                onClick={handleVoltarParaNova}
                className="text-teal-700 border-teal-200 hover:bg-teal-50"
                title="Voltar ao texto que você estava escrevendo">
                
                  <PlusIcon className="w-4 h-4 mr-2" /> Nova evolução
                </Button>
                {podeEditarSelecionada &&
              <Button
                size="sm"
                onClick={handleSalvarEdicao}
                data-salvar-etapa
                title="Salvar (Ctrl+S)"
                disabled={isSaving || !temTexto}
                className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow transition-all">
                
                    <SaveIcon className="w-4 h-4 mr-2" /> Salvar alterações
                  </Button>
              }
              </> :

            !readOnly &&
            <Button
              size="sm"
              onClick={handleAdicionarEvolucao}
              data-salvar-etapa
              title="Salvar (Ctrl+S)"
              disabled={isSaving || !temTexto}
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow transition-all">
              
                  <PlusIcon className="w-4 h-4 mr-2" /> Adicionar evolução
                </Button>

            }
          </div>
        </div>
      </div>

      {/* ===== ÁREA DE TRABALHO — editor à esquerda, histórico à direita =====
           `min-h-0` em toda a cadeia é o que permite ao editor ocupar
           exatamente a altura restante, sem estourar a tela. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">
        {/* ===== COLUNA PRINCIPAL ===== */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-3">
          {/* A situação da assinatura fica na barra de abas do prontuário (uma vez só). */}

          {/* Erro persistente com retry */}
          {saveError &&
          <div className="flex-shrink-0 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">
                  Erro ao adicionar a evolução
                </p>
                <p className="text-sm text-red-600 mt-1">{saveError}</p>
              </div>
              <button
              type="button"
              onClick={handleAdicionarEvolucao}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-900 bg-white border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50">
              
                <RefreshCwIcon
                className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
              
                Tentar novamente
              </button>
            </div>
          }

          {readOnly && !selecionada &&
          <div className="flex-shrink-0 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-center gap-2">
              <LockIcon className="w-4 h-4" />
              Esta evolução está bloqueada devido à assinatura do paciente. Para
              adicionar novas informações, clique em "Nova Evolução" no topo da
              página.
            </div>
          }

          {/* Evolução do histórico aberta: identifica o registro e deixa claro
               se ela pode ou não ser alterada por quem está logado. */}
          {selecionada &&
          <div
            className={`flex-shrink-0 rounded-lg px-3 py-2 border flex flex-wrap items-center justify-between gap-2 ${
            podeEditarSelecionada ?
            'bg-teal-50 border-teal-200' :
            'bg-gray-50 border-gray-200'}`
            }>
            
              <span className="text-xs text-gray-700 flex items-center gap-2 min-w-0">
                <ClockIcon className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                <span className="font-medium">
                  Evolução de {formatDate(selecionada.data)}
                </span>
                {selecionada.profissionalNome &&
              <span className="text-gray-500 truncate">
                    — {selecionada.profissionalNome}
                  </span>
              }
              </span>
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                {podeEditarSelecionada ?
              <>
                    <Edit3Icon className="w-3 h-3" /> Você pode editar e salvar
                    as alterações
                  </> :

              <>
                    <LockIcon className="w-3 h-3" /> Somente leitura
                  </>
              }
              </span>
            </div>
          }

          {/* ===== DESCRIÇÃO DA EVOLUÇÃO — protagonista da tela =====
               Mesmos recursos da descrição da prescrição: negrito, itálico,
               alinhamentos, listas, títulos, fonte, cor e tabelas. */}
          <div className="flex flex-col min-h-[55vh] lg:min-h-0 lg:flex-1">
            <div className="flex-shrink-0 flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700 flex items-center gap-2">
                <Edit3Icon className="w-4 h-4 text-teal-600" />
                {selecionada ?
                'Evolução selecionada' :
                'Descrição da Evolução'}
              </label>
              <span className="text-[10px] text-gray-400 hidden sm:inline">
                Ctrl+B negrito · Ctrl+I itálico · Ctrl+Z desfazer
              </span>
            </div>
            <div className="flex-1 min-h-0 flex">
              <EditorDocumento
                value={formData.evolucaoAtual}
                onChange={handleChange}
                placeholder="Descreva a evolução do paciente..."
                disabled={
                selecionada ? !podeEditarSelecionada : readOnly
                }
                larguraTotal />
              
            </div>
          </div>
        </div>

        {/* ===== PAINEL LATERAL — HISTÓRICO ===== */}
        {painelVisivel &&
        <Card className="w-full lg:w-[420px] xl:w-[460px] lg:flex-shrink-0 lg:min-h-0 lg:overflow-y-auto p-4 shadow-sm animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-teal-600" />
                Histórico de Evoluções ({historicoExibir.length})
              </p>
            </div>

            {loadingHistorico &&
          <p className="text-sm text-gray-400 italic">
                Carregando histórico...
              </p>
          }

            {!loadingHistorico && historicoExibir.length === 0 &&
          <p className="text-sm text-gray-400 italic">
                Nenhuma evolução anterior registrada para este paciente.
              </p>
          }

            <div className="space-y-3">
              {historicoExibir.map((item, index) => {
              const isOwner =
              item.profissionalId && item.profissionalId === usuarioLogadoId;
              const aberta = !!selecionada && selecionada.id === item.id;
              return (
                <div
                  key={item.id || index}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleAbrirDoHistorico(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAbrirDoHistorico(item);
                    }
                  }}
                  title="Abrir esta evolução no editor"
                  className={`text-left w-full border rounded-lg p-3 cursor-pointer transition-colors ${
                  aberta ?
                  'bg-teal-50 border-teal-300 ring-1 ring-teal-300' :
                  'bg-gray-50 border-gray-200 hover:bg-white hover:border-teal-200'}`
                  }>
                  
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CalendarIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-gray-600">
                          {formatDate(item.data)}
                        </span>
                        {item.profissionalNome &&
                      <span className="text-xs text-gray-500 truncate">
                            — {item.profissionalNome}
                          </span>
                      }
                      </div>
                      {isOwner && !readOnly ?
                    <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                        type="button"
                        onClick={(e) => {
                          // Não deve abrir a evolução ao excluí-la.
                          e.stopPropagation();
                          handleExcluir(item.id || '');
                        }}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline px-2 py-1 rounded hover:bg-red-50 transition-colors">
                        
                            Excluir
                          </button>
                        </div> :

                    <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                          <LockIcon className="w-3 h-3" />
                          Somente leitura
                        </span>
                    }
                    </div>

                    {/* Prévia: registros antigos são texto puro; os novos vêm do
                       editor e mantêm a formatação na leitura. O conteúdo
                       completo é aberto no editor ao clicar. */}
                    <div
                    className="text-sm text-gray-700 evolucao-texto max-h-32 overflow-hidden"
                    dangerouslySetInnerHTML={{
                      __html: paraHtmlImpressao(item.texto)
                    }} />
                  
                  </div>);

            })}
            </div>
          </Card>
        }
      </div>
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />
    </div>);

}