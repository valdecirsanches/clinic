import { API_BASE_URL } from '../config/api';
import type { ResultadoAssistente } from '../types/assistente';

interface Contexto {
  clinicaId: string;
  usuarioId: string;
}

function agoraLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    hoje: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}`
  };
}

export class ErroAssistente extends Error {
  slots?: string[];
  constructor(mensagem: string, slots?: string[]) {
    super(mensagem);
    this.slots = slots;
  }
}

async function postar<T>(caminho: string, ctx: Contexto, corpo: object): Promise<T> {
  let r: Response;
  try {
    // POST como text/plain: evita o preflight que o proxy não repassa
    r = await fetch(`${API_BASE_URL}/api/assistente${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...ctx, ...agoraLocal(), ...corpo })
    });
  } catch {
    throw new ErroAssistente('Sem resposta do servidor. Verifique a conexão.');
  }
  const d = await r.json().catch(() => null);
  if (r.status === 404 && !d) {
    throw new ErroAssistente('O servidor ainda não tem o assistente. Publique a versão nova do backend e reinicie.');
  }
  if (!r.ok) throw new ErroAssistente(d?.error || `Erro ${r.status}`, d?.slots);
  return d as T;
}

export const assistenteApi = {
  mensagem: (ctx: Contexto, texto: string, historico: {autor: string;texto: string;}[]) =>
  postar<ResultadoAssistente>('/mensagem', ctx, { texto, historico }),
  transcrever: (ctx: Contexto, audioBase64: string, mime: string, contexto: 'agenda' | 'prontuario' = 'agenda') =>
  postar<{texto: string;}>('/transcrever', ctx, { audioBase64, mime, contexto }),
  prontuario: (
  ctx: Contexto,
  texto: string,
  historico: {autor: string;texto: string;}[],
  etapaAtual: string,
  paciente: string) =>
  postar<ResultadoAssistente>('/prontuario', ctx, { texto, historico, etapaAtual, paciente }),
  falar: (ctx: Contexto, texto: string) => postar<{audioBase64: string;mime: string;}>('/falar', ctx, { texto }),
  marcar: (ctx: Contexto, dados: {pacienteId: string;profissionalId: string;data: string;horario: string;}) =>
  postar<{id: string;paciente: string;profissional: string;rotulo: string;horario: string;}>('/marcar', ctx, dados),
  remarcar: (ctx: Contexto, dados: {consultaId: string;profissionalId: string;data: string;horario: string;}) =>
  postar<{id: string;paciente: string;profissional: string;rotulo: string;horario: string;}>('/remarcar', ctx, dados),
  cancelar: (ctx: Contexto, consultaId: string, motivo: string) =>
  postar<{id: string;motivo: string;}>('/cancelar', ctx, { consultaId, motivo })
};