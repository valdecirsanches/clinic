import { API_BASE_URL } from '../config/api';

/**
 * Ponto ÚNICO de envio pelo WhatsApp oficial da Meta (Cloud API).
 *
 * Mesma estratégia do utils/smsApi.ts: tenta o POST e, se a requisição for
 * barrada pelo proxy ANTES de chegar ao servidor (o navegador só consegue dizer
 * "Failed to fetch", sem status HTTP), repete pela rota alternativa por GET.
 *
 * Nunca lança exceção: devolve sempre um resultado.
 */

export interface TemplateEnvioMeta {
  name: string;
  language?: string;
  /** Valores de {{1}}, {{2}}, ... na ordem aprovada na Meta */
  params?: string[];
  /** Sufixo dinâmico do botão de URL, quando o template tiver um */
  urlParam?: string;
}

export interface EnvioMetaParams {
  clinicaId: string;
  telefone: string;
  /** Texto livre — só é entregue DENTRO da janela de 24h */
  mensagem?: string;
  /** Template aprovado — funciona a qualquer momento */
  template?: TemplateEnvioMeta;
  pacienteId?: string;
  pacienteNome?: string;
  consultaId?: string;
}

export interface ResultadoEnvioMeta {
  success: boolean;
  id?: string;
  error?: string;
  /** true quando o envio só passou pela rota alternativa (proxy barrando POST) */
  viaAlternativa?: boolean;
}

function ehFalhaDeRede(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed'));

}

async function enviarPorGet(
params: EnvioMetaParams)
: Promise<ResultadoEnvioMeta> {
  const query = new URLSearchParams({
    clinicaId: params.clinicaId,
    telefone: params.telefone
  });
  if (params.mensagem) query.set('mensagem', params.mensagem);
  if (params.template) query.set('template', JSON.stringify(params.template));
  if (params.pacienteId) query.set('pacienteId', params.pacienteId);
  if (params.pacienteNome) query.set('pacienteNome', params.pacienteNome);
  if (params.consultaId) query.set('consultaId', params.consultaId);

  try {
    const resposta = await fetch(
      `${API_BASE_URL}/api/whatsapp-meta/send-message?${query.toString()}`
    );
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      return {
        success: false,
        error: dados?.error || `HTTP ${resposta.status}`
      };
    }
    return {
      success: true,
      id: dados?.id,
      viaAlternativa: true
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Não foi possível falar com o servidor (${err?.message || 'falha de rede'}). A requisição está sendo barrada entre o navegador e a API — libere POST e OPTIONS em /api/ no proxy.`
    };
  }
}

export async function enviarWhatsappMetaApi(
params: EnvioMetaParams)
: Promise<ResultadoEnvioMeta> {
  try {
    const resposta = await fetch(
      `${API_BASE_URL}/api/whatsapp-meta/send-message`,
      {
        method: 'POST',
        // text/plain evita o preflight OPTIONS do CORS (o servidor aceita ambos)
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify(params)
      }
    );
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      return {
        success: false,
        error: dados?.error || `HTTP ${resposta.status}`
      };
    }
    return {
      success: true,
      id: dados?.id
    };
  } catch (err: any) {
    if (!ehFalhaDeRede(err)) {
      return {
        success: false,
        error: err?.message || 'Falha ao enviar pela Meta.'
      };
    }
    // Requisição barrada antes do servidor: tenta a rota alternativa
    console.warn(
      '🟢 [META] POST barrado antes de chegar ao servidor — repetindo por GET.'
    );
    return enviarPorGet(params);
  }
}

/** Consulta se o canal Meta está configurado e ativo para a clínica. */
export async function metaDisponivelApi(clinicaId: string): Promise<{
  disponivel: boolean;
  motivo?: string;
  preferencial?: boolean;
  templates?: Record<
    string,
    {name: string;language: string;temBotaoUrl?: boolean;}>;

  /** Textos fixos das variáveis configuradas pela clínica */
  textos?: {
    local?: string;
    instrucoesPreConsulta?: string;
    informacoesImportantes?: string;
  };
}> {
  try {
    const resposta = await fetch(
      `${API_BASE_URL}/api/whatsapp-meta/disponivel?clinicaId=${clinicaId}`
    );
    if (!resposta.ok) {
      return {
        disponivel: false,
        motivo: `HTTP ${resposta.status}`
      };
    }
    return await resposta.json();
  } catch (err: any) {
    return {
      disponivel: false,
      motivo: err?.message || 'sem resposta do servidor'
    };
  }
}