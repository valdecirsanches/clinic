import { useState, useEffect, useCallback, useRef } from 'react';
import { Consulta } from '../types';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
import { useSmartPolling } from './useSmartPolling';

// ⭐ FIX CRÍTICO: Formata data LOCAL (sem conversão UTC que causa bug de timezone)
// toISOString() converte para UTC — no Brasil (UTC-3), após 21h mostra data errada!
function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ⭐ Helper: Calcula range de datas para carregar (mês atual ± 1 mês)
function calcularRangeData(): {
  dataInicio: string;
  dataFim: string;
} {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0); // último dia do mês seguinte

  return {
    dataInicio: formatLocalDate(inicio),
    dataFim: formatLocalDate(fim)
  };
}

// ⭐ Helper: Calcula range centrado em uma data específica (±1 mês)
function calcularRangeParaData(date: Date): {
  dataInicio: string;
  dataFim: string;
} {
  const inicio = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const fim = new Date(date.getFullYear(), date.getMonth() + 2, 0);
  return {
    dataInicio: formatLocalDate(inicio),
    dataFim: formatLocalDate(fim)
  };
}
export function useAgenda(clinicaId?: string) {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [datasComConsultas, setDatasComConsultas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const lastLoadRef = useRef<string>('');
  const currentRangeRef = useRef<{
    dataInicio: string;
    dataFim: string;
  } | null>(null);

  // ⭐ Carrega consultas filtradas por período (não carrega 470K!)
  const loadConsultas = useCallback(
    async (dataInicio?: string, dataFim?: string) => {
      if (!clinicaId || isMagicPatterns) return;
      try {
        // ⭐ FIX: Usa params explícitos > range atual armazenado > range padrão
        let range: {
          dataInicio: string;
          dataFim: string;
        };
        if (dataInicio && dataFim) {
          range = {
            dataInicio,
            dataFim
          };
        } else if (currentRangeRef.current) {
          range = currentRangeRef.current;
        } else {
          range = calcularRangeData();
        }

        // ⭐ Atualiza o range armazenado
        currentRangeRef.current = range;
        const loadKey = `${clinicaId}_${range.dataInicio}_${range.dataFim}`;

        // ⭐ PERF: Exclui placeholders (regenerados no frontend) para reduzir payload drasticamente
        // Sem placeholders, 15K cobre facilmente 3 meses de qualquer clínica
        const url = `${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&dataInicio=${range.dataInicio}&dataFim=${range.dataFim}&excludePlaceholders=true&limit=15000`;
        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ [useAgenda] Erro HTTP:', response.status, errorText);
          throw new Error(`Erro HTTP: ${response.status}`);
        }
        const data = await response.json();
        console.log(
          `✅ [useAgenda] ${data.length} consultas carregadas (${range.dataInicio} a ${range.dataFim})`
        );
        // ⭐ Detecta truncamento: se o servidor retornou exatamente o limite, dados podem estar faltando
        const truncationWarning = response.headers.get('X-Truncation-Warning');
        if (truncationWarning) {
          console.warn(
            `⚠️ [useAgenda] ATENÇÃO: Resultado TRUNCADO! ${data.length} consultas retornadas = limite máximo. Datas futuras podem estar faltando!`
          );
        }
        if (data.length > 0) {
          const datas = [...new Set(data.map((c: any) => c.data))] as string[];
          console.log(`📋 [useAgenda] Datas com consultas: ${datas.length}`);
        }
        lastLoadRef.current = loadKey;
        // ⭐ FIX DUPLICAÇÃO: garante 1 registro por id (defesa extra além do GROUP BY do servidor)
        // E também deduplica por (data + horario + profissionalId + pacienteId) para lidar com
        // registros duplicados no banco com IDs diferentes (ex: importação corrompida).
        const dedupMap = new Map<string, Consulta>();
        const logicalDedupMap = new Map<string, Consulta>();

        for (const c of data as Consulta[]) {
          if (!c) continue;

          // Se for placeholder, usa o ID normal para não deduplicar placeholders do mesmo horário
          const isPlaceholder =
          c.pacienteId === 'disponivel' ||
          c.pacienteId === 'removido' ||
          c.pacienteId === 'livre' ||
          c.pacienteId === 'bloqueado';

          if (
          !isPlaceholder &&
          c.data &&
          c.horario &&
          c.profissionalId &&
          c.pacienteId)
          {
            const logicalKey = `${c.data}_${c.horario}_${c.profissionalId}_${c.pacienteId}`;

            // Se já existe, prefere o que tem observações (ou o que NÃO tem a string de hash)
            if (logicalDedupMap.has(logicalKey)) {
              const existing = logicalDedupMap.get(logicalKey)!;
              const existingHasHash =
              existing.observacoes?.includes('pbkdf2_sha256');
              const currentHasHash = c.observacoes?.includes('pbkdf2_sha256');

              // Se o existente tem hash e o atual não, substitui
              if (existingHasHash && !currentHasHash) {
                logicalDedupMap.set(logicalKey, c);
                dedupMap.delete(String(existing.id));
                dedupMap.set(String(c.id), c);
              }
              // Caso contrário, ignora o atual (já temos um bom)
              continue;
            } else {
              logicalDedupMap.set(logicalKey, c);
            }
          }

          if (c.id != null) dedupMap.set(String(c.id), c);
        }
        setConsultas(Array.from(dedupMap.values()));
      } catch (error) {
        console.error('❌ [useAgenda] Erro ao carregar consultas:', error);
      } finally {
        setLoading(false);
      }
    },
    [clinicaId]
  );

  // ⭐ Carrega datas com consultas (endpoint leve para o calendário)
  const loadDatasComConsultas = useCallback(
    async (mesInicio?: string, mesFim?: string) => {
      if (!clinicaId || isMagicPatterns) return;
      try {
        // ⭐ FIX: Usa range atual armazenado como fallback
        const range = currentRangeRef.current || calcularRangeData();
        const inicio = mesInicio || range.dataInicio;
        const fim = mesFim || range.dataFim;
        const url = `${API_BASE_URL}/api/consultas/datas-com-consultas?clinicaId=${clinicaId}&mesInicio=${inicio}&mesFim=${fim}`;
        const response = await fetch(url);
        if (response.ok) {
          const datas = await response.json();
          console.log(`📅 [useAgenda] ${datas.length} datas com consultas`);
          setDatasComConsultas(datas);
        }
      } catch (error) {
        console.error('❌ [useAgenda] Erro ao carregar datas:', error);
      }
    },
    [clinicaId]
  );

  // ⭐ NOVO: Expande o range se a data selecionada estiver fora do range carregado
  const expandRangeForDate = useCallback(
    async (date: Date) => {
      if (!clinicaId || isMagicPatterns) return;
      const dateStr = formatLocalDate(date);
      const current = currentRangeRef.current;

      // Se não tem range ou a data está fora do range atual, recarrega
      if (
      !current ||
      dateStr < current.dataInicio ||
      dateStr > current.dataFim)
      {
        const newRange = calcularRangeParaData(date);
        console.log(
          `📅 [useAgenda] Data ${dateStr} fora do range atual (${current?.dataInicio || 'N/A'} a ${current?.dataFim || 'N/A'}), expandindo para ${newRange.dataInicio} a ${newRange.dataFim}`
        );
        await loadConsultas(newRange.dataInicio, newRange.dataFim);
        await loadDatasComConsultas(newRange.dataInicio, newRange.dataFim);
      }
    },
    [clinicaId, loadConsultas, loadDatasComConsultas]
  );

  // ⭐ FIX CRÍTICO: Limpa consultas IMEDIATAMENTE quando clinicaId muda
  // Sem isso, ao trocar de clínica, as consultas da clínica anterior ficam visíveis
  // até o fetch da nova clínica completar (bug de multi-tenancy)
  useEffect(() => {
    setConsultas([]);
    setDatasComConsultas([]);
    currentRangeRef.current = null;
    lastLoadRef.current = '';
    setLoading(true);
  }, [clinicaId]);
  useEffect(() => {
    if (!clinicaId) {
      setLoading(false);
      return;
    }
    loadConsultas();
    loadDatasComConsultas();
    const handleConsultasUpdated = () => {
      loadConsultas();
      loadDatasComConsultas();
    };
    window.addEventListener('consultas-updated', handleConsultasUpdated);
    return () => {
      window.removeEventListener('consultas-updated', handleConsultasUpdated);
    };
  }, [clinicaId, loadConsultas, loadDatasComConsultas]);

  // ⭐ FASE 3: Polling inteligente — pausa quando a aba está em background.
  // Quando o usuário volta para a aba, busca dados frescos imediatamente.
  useSmartPolling(
    () => {
      loadConsultas();
    },
    120000,
    {
      enabled: !!clinicaId
    }
  );
  const addConsulta = async (
  consulta: Omit<Consulta, 'id' | 'lembreteEnviado'>) =>
  {
    if (!clinicaId) throw new Error('clinicaId não definido');

    // ⭐ FIX: Garante que o range inclui a data da nova consulta
    if (consulta.data) {
      const consultaDate = new Date(consulta.data + 'T12:00:00');
      const current = currentRangeRef.current;
      if (
      !current ||
      consulta.data < current.dataInicio ||
      consulta.data > current.dataFim)
      {
        const newRange = calcularRangeParaData(consultaDate);
        currentRangeRef.current = newRange;
      }
    }

    // ⭐ PASSO 1: Envia para o servidor
    const response = await fetch(`${API_BASE_URL}/api/consultas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...consulta,
        clinicaId
      })
    });
    if (!response.ok) {
      let errorMsg = `Erro HTTP: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    const newConsulta = await response.json();

    // ⭐ PASSO 2: Atualização OTIMISTA — adiciona imediatamente ao estado local
    const consultaCompleta: Consulta = {
      ...consulta,
      id: newConsulta.id,
      lembreteEnviado: false,
      clinicaId,
      // ⭐ Mapeia procedimentoNome para procedimentoNomeJoin (o campo que o frontend usa)
      procedimentoNomeJoin:
      (consulta as any).procedimentoNome ||
      newConsulta.procedimentoNomeJoin ||
      null,
      procedimentoAnotacoes:
      (consulta as any).procedimentoAnotacoes ||
      newConsulta.procedimentoAnotacoes ||
      null
    } as Consulta;
    setConsultas((prev) => [...prev, consultaCompleta]);

    // ⭐ PASSO 3: Recarrega em BACKGROUND (NÃO bloqueia — fire and forget)
    loadConsultas().catch(() => {});
    loadDatasComConsultas().catch(() => {});
    return newConsulta;
  };
  const updateConsulta = async (id: string, updates: Partial<Consulta>) => {
    if (!clinicaId) throw new Error('clinicaId não definido');

    // ⭐ NOVO: Atualização OTIMISTA — aplica imediatamente no estado local
    setConsultas((prev) =>
    prev.map((c) =>
    c.id === id ?
    {
      ...c,
      ...updates,
      // ⭐ Mapeia procedimentoNome para procedimentoNomeJoin
      procedimentoNomeJoin:
      (updates as any).procedimentoNome ||
      updates.procedimentoNomeJoin ||
      c.procedimentoNomeJoin ||
      null,
      procedimentoAnotacoes:
      updates.procedimentoAnotacoes ??
      c.procedimentoAnotacoes ??
      null
    } :
    c
    )
    );
    try {
      const response = await fetch(`${API_BASE_URL}/api/consultas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updates,
          clinicaId
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }

      // ⭐ Recarrega em BACKGROUND (NÃO bloqueia)
      loadConsultas().catch(() => {});
    } catch (error: any) {
      // ⭐ Reverte update otimista em caso de erro
      loadConsultas().catch(() => {});
      throw error;
    }
  };
  const deleteConsulta = async (id: string) => {
    if (!clinicaId) throw new Error('clinicaId não definido');

    // ⭐ NOVO: Remoção OTIMISTA
    setConsultas((prev) => prev.filter((c) => c.id !== id));
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/consultas/${id}?clinicaId=${clinicaId}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }

      // ⭐ Recarrega em BACKGROUND
      loadConsultas().catch(() => {});
      loadDatasComConsultas().catch(() => {});
    } catch (error: any) {
      // Reverte em caso de erro
      loadConsultas().catch(() => {});
      throw error;
    }
  };
  return {
    consultas,
    datasComConsultas,
    loading,
    addConsulta,
    updateConsulta,
    deleteConsulta,
    refresh: loadConsultas,
    refreshDatas: loadDatasComConsultas,
    expandRangeForDate
  };
}