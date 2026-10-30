// Avisa a tela quando o servidor recusa algo por LIMITE DO PLANO.
// O servidor responde 403 { code: 'LIMITE_PLANO', error, plano } ao cadastrar
// paciente/usuário ou enviar documento além do plano. Em vez de cada tela
// tratar isso, observamos todas as respostas num único ponto e emitimos um
// evento que o aviso global (LimitePlanoAviso) escuta.

export const EVENTO_LIMITE_PLANO = 'easyclin:limite-plano';

export interface DetalheLimitePlano {
  mensagem: string;
  plano: {id: string;nome: string;} | null;
}

type JanelaComMarca = Window & {__limitePlanoInstalado?: boolean;};

export function instalarInterceptadorLimitePlano(): void {
  const janela = window as JanelaComMarca;
  if (janela.__limitePlanoInstalado) return;
  janela.__limitePlanoInstalado = true;

  const original = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const resposta = await original(input, init);
    if (resposta.status === 403) {
      // Lê uma CÓPIA: a tela que fez a chamada continua lendo o corpo normalmente
      resposta.
      clone().
      json().
      then((dados: {code?: string;error?: string;plano?: DetalheLimitePlano['plano'];}) => {
        if (dados?.code !== 'LIMITE_PLANO') return;
        window.dispatchEvent(
          new CustomEvent<DetalheLimitePlano>(EVENTO_LIMITE_PLANO, {
            detail: {
              mensagem: dados.error || 'O limite do seu plano foi atingido.',
              plano: dados.plano || null
            }
          })
        );
      }).
      catch(() => undefined);
    }
    return resposta;
  }) as typeof window.fetch;
}