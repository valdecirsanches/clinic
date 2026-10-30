import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

interface MensagemRecebida {
  id: string;
  pacienteId: string;
  pacienteNome?: string;
  tipo: 'enviada' | 'recebida';
  conteudo: string;
  dataHora: string;
}

export interface ResumoNovasMensagens {
  pacienteId: string;
  pacienteNome: string;
  quantidade: number;
  ultimaMensagem: string;
  dataHora: string;
}

interface EstadoStore {
  clinicaId: string;
  novasPorPaciente: ResumoNovasMensagens[];
}

/**
 * Acompanha mensagens RECEBIDAS dos pacientes e sinaliza quem respondeu.
 *
 * Por que é um store de módulo, e não estado por componente: o cabeçalho e a
 * agenda mostram o MESMO sinal. Com uma cópia por componente, cada um faria a
 * própria consulta e teria a própria contagem — abrir a conversa na agenda não
 * apagaria o aviso do cabeçalho, e o servidor levaria o dobro de chamadas.
 *
 * A primeira leitura apenas registra o estado atual (baseline); sem isso, todo
 * o histórico antigo apareceria como "novo" ao abrir o sistema.
 */
const IDS_CONHECIDOS = new Set<string>();
let baselineFeito = false;
let emAndamento = false;
let clinicaAtual = '';
let timer: number | null = null;

let estado: EstadoStore = { clinicaId: '', novasPorPaciente: [] };
const inscritos = new Set<(e: EstadoStore) => void>();

function publicar(proximo: EstadoStore) {
  estado = proximo;
  inscritos.forEach((fn) => fn(estado));
}

function reiniciar(clinicaId: string) {
  IDS_CONHECIDOS.clear();
  baselineFeito = false;
  clinicaAtual = clinicaId;
  publicar({ clinicaId, novasPorPaciente: [] });
}

async function verificar() {
  if (!clinicaAtual || emAndamento) return;
  if (document.visibilityState === 'hidden') return;
  emAndamento = true;
  try {
    // Só as mais recentes: baixar o histórico inteiro a cada ciclo consumia
    // memória sem limite e travava a aba em clínicas com muitas mensagens.
    const resp = await fetch(
      `${API_BASE_URL}/api/mensagens?clinicaId=${encodeURIComponent(clinicaAtual)}&limit=50`
    );
    if (!resp.ok) return;
    const data = await resp.json();
    if (!Array.isArray(data)) return;

    const recebidas: MensagemRecebida[] = data.filter(
      (m: MensagemRecebida) => m.tipo === 'recebida'
    );

    if (!baselineFeito) {
      recebidas.forEach((m) => IDS_CONHECIDOS.add(m.id));
      baselineFeito = true;
      return;
    }

    const novas = recebidas.filter((m) => !IDS_CONHECIDOS.has(m.id));
    if (novas.length === 0) return;
    novas.forEach((m) => IDS_CONHECIDOS.add(m.id));

    const porId = new Map(
      estado.novasPorPaciente.map((p) => [p.pacienteId, { ...p }])
    );
    novas.forEach((m) => {
      const atual = porId.get(m.pacienteId);
      if (atual) {
        atual.quantidade += 1;
        atual.ultimaMensagem = m.conteudo || '';
        atual.dataHora = m.dataHora;
        if (m.pacienteNome) atual.pacienteNome = m.pacienteNome;
      } else {
        porId.set(m.pacienteId, {
          pacienteId: m.pacienteId,
          pacienteNome: m.pacienteNome || 'Paciente',
          quantidade: 1,
          ultimaMensagem: m.conteudo || '',
          dataHora: m.dataHora
        });
      }
    });

    publicar({
      clinicaId: clinicaAtual,
      novasPorPaciente: Array.from(porId.values()).sort(
        (a, b) =>
        new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()
      )
    });
  } catch {

    // Silencioso: verificação de fundo não pode poluir a tela.
  } finally {emAndamento = false;
  }
}

export function useMensagensRecebidas(clinicaId: string, intervaloMs = 20000) {
  const [snapshot, setSnapshot] = useState<EstadoStore>(estado);

  useEffect(() => {
    const ouvinte = (e: EstadoStore) => setSnapshot(e);
    inscritos.add(ouvinte);
    return () => {
      inscritos.delete(ouvinte);
      if (inscritos.size === 0 && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!clinicaId) return;
    if (clinicaId !== clinicaAtual) reiniciar(clinicaId);
    verificar();
    if (timer === null) timer = window.setInterval(verificar, intervaloMs);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') verificar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', verificar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', verificar);
    };
  }, [clinicaId, intervaloMs]);

  const marcarComoLida = useCallback((pacienteId: string) => {
    publicar({
      ...estado,
      novasPorPaciente: estado.novasPorPaciente.filter(
        (p) => p.pacienteId !== pacienteId
      )
    });
  }, []);

  const marcarTodasLidas = useCallback(() => {
    publicar({ ...estado, novasPorPaciente: [] });
  }, []);

  const novasPorPaciente =
  snapshot.clinicaId === clinicaId ? snapshot.novasPorPaciente : [];

  return {
    novasPorPaciente,
    totalNovas: novasPorPaciente.reduce((s, p) => s + p.quantidade, 0),
    pacientesComMensagemNova: new Set(
      novasPorPaciente.map((p) => p.pacienteId)
    ),
    marcarComoLida,
    marcarTodasLidas
  };
}