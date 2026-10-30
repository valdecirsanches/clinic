// ==================== ENVIO DE SMS PELA API DA CLÍNICA ====================
// Ponto único de envio de SMS do app.
//
// POR QUE EXISTE ESTE ARQUIVO
// Em alguns ambientes o proxy/CDN à frente da API bloqueia o POST desta rota.
// A resposta de bloqueio é gerada pelo próprio proxy e NÃO leva cabeçalhos CORS,
// então o navegador descarta tudo e reporta apenas "Failed to fetch" — sem
// status, sem mensagem e sem nada chegando ao servidor (a falha acontece em
// centenas de milissegundos, antes de qualquer processamento).
//
// Estratégia: tenta o POST (caminho correto) e, se a falha for de REDE, repete
// o envio pela rota GET equivalente, que é uma requisição simples e passa por
// proxies restritivos. Assim o paciente recebe o aviso mesmo enquanto a regra
// do proxy não é ajustada, e a tela informa por qual caminho o envio saiu.

import { API_BASE_URL } from '../config/api';

export interface EnvioSmsParams {
  clinicaId: string;
  telefone: string;
  mensagem: string;
  pacienteId?: string | number | null;
  pacienteNome?: string | null;
  consultaId?: string | number | null;
}

export interface ResultadoEnvioSms {
  success: boolean;
  /** Mensagem de erro pronta para exibição */
  error?: string;
  /** true quando o envio precisou usar a rota alternativa (GET) */
  viaAlternativa?: boolean;
  /** Tempo total até a resposta, em ms — útil no diagnóstico */
  duracaoMs?: number;
}

function ehFalhaDeRede(err: unknown): boolean {
  // "Failed to fetch" / "NetworkError" / "Load failed" (Safari)
  const msg = String((err as Error)?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed'));

}

async function enviarPorGet(
params: EnvioSmsParams)
: Promise<{ok: boolean;error?: string;}> {
  const query = new URLSearchParams({
    clinicaId: params.clinicaId,
    telefone: params.telefone,
    mensagem: params.mensagem
  });
  if (params.pacienteId) query.set('pacienteId', String(params.pacienteId));
  if (params.pacienteNome) query.set('pacienteNome', params.pacienteNome);
  if (params.consultaId) query.set('consultaId', String(params.consultaId));

  const resposta = await fetch(
    `${API_BASE_URL}/api/sms/send-message?${query.toString()}`
  );
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    return { ok: false, error: dados?.error || `O servidor respondeu ${resposta.status}.` };
  }
  return { ok: true };
}

/**
 * Envia um SMS pela API da clínica. Nunca lança: devolve sempre um resultado
 * com mensagem pronta para exibir ao usuário.
 */
export async function enviarSmsApi(
params: EnvioSmsParams)
: Promise<ResultadoEnvioSms> {
  const iniciadoEm = Date.now();

  try {
    const resposta = await fetch(`${API_BASE_URL}/api/sms/send-message`, {
      method: 'POST',
      // text/plain evita o preflight OPTIONS do CORS (o servidor aceita ambos)
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(params)
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      // O servidor RESPONDEU: aqui o erro é real (credencial, saldo, número).
      return {
        success: false,
        error: dados?.error || 'Falha ao enviar o SMS.',
        duracaoMs: Date.now() - iniciadoEm
      };
    }
    return { success: true, duracaoMs: Date.now() - iniciadoEm };
  } catch (err) {
    if (!ehFalhaDeRede(err)) {
      return {
        success: false,
        error: (err as Error)?.message || 'Falha ao enviar o SMS.',
        duracaoMs: Date.now() - iniciadoEm
      };
    }

    // Falha de REDE no POST → tenta a rota alternativa (GET)
    console.warn(
      `📲 [SMS] POST bloqueado antes de chegar ao servidor (${Date.now() - iniciadoEm}ms). Repetindo pela rota alternativa (GET)...`
    );
    try {
      const alternativa = await enviarPorGet(params);
      if (alternativa.ok) {
        return {
          success: true,
          viaAlternativa: true,
          duracaoMs: Date.now() - iniciadoEm
        };
      }
      return {
        success: false,
        error: alternativa.error,
        viaAlternativa: true,
        duracaoMs: Date.now() - iniciadoEm
      };
    } catch (err2) {
      return {
        success: false,
        viaAlternativa: true,
        duracaoMs: Date.now() - iniciadoEm,
        error:
        `Nem o POST nem a rota alternativa (GET) chegaram ao servidor.\n\n` +
        `URL: ${API_BASE_URL}/api/sms/send-message\n` +
        `Isso indica bloqueio de rede entre o navegador e a API — não é credencial da SMSGo. ` +
        `Confira em ${API_BASE_URL}/api/sms/diag?clinicaId=${params.clinicaId} se o servidor está pronto.`
      };
    }
  }
}