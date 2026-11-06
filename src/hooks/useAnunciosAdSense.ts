// ==================== ANÚNCIOS (Google AdSense) ====================
// Anúncios automáticos do AdSense para quem NÃO tem plano pago:
//   • visitante na demonstração → mostra (a tela de login fica sem anúncio:
//     quem vai entrar costuma ser cliente);
//   • usuário logado → pergunta ao servidor (/api/anuncios) se a clínica paga;
//   • super admin, clínica pagante e palco do Vídeo de Demonstração → nunca.
// O código do AdSense fica no index.html (exigência do Google) com os pedidos
// de anúncio PAUSADOS; só este hook libera. Se a clínica passar a pagar com os
// anúncios já liberados, a página recarrega para tirá-los.
import { useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { DEMO_VIDEO, DEMO_VISITANTE } from '../utils/modoDemo';

export const ADSENSE_CLIENTE = 'ca-pub-8474105490186035';

type FilaAdSense = unknown[] & {pauseAdRequests?: number;};
const fila = (): FilaAdSense => {
  const w = window as unknown as {adsbygoogle?: FilaAdSense;};
  w.adsbygoogle = w.adsbygoogle || [];
  return w.adsbygoogle;
};

/** O código do AdSense (index.html) começa pausado; aqui libera os pedidos. */
function liberarAnuncios() {
  if (typeof window === 'undefined') return;
  fila().pauseAdRequests = 0;
}

function anunciosLiberados() {
  return typeof window !== 'undefined' && fila().pauseAdRequests === 0;
}

interface SessaoMinima {
  usuario?: {tipo?: string;clinicaId?: string | null;} | null;
  clinicaAtual?: {id?: string;} | null;
}

export function useAnunciosAdSense(sessao: SessaoMinima | null | undefined) {
  const tipo = sessao?.usuario?.tipo;
  const clinicaId = sessao?.clinicaAtual?.id || sessao?.usuario?.clinicaId || '';
  const logado = !!sessao?.usuario;

  useEffect(() => {
    if (DEMO_VIDEO) return;

    // Visitante na demonstração (a sessão dela é fictícia)
    if (DEMO_VISITANTE) {
      liberarAnuncios();
      return;
    }
    if (!logado || tipo === 'super_admin' || !clinicaId) return;

    let cancelado = false;
    fetch(`${API_BASE_URL}/api/anuncios?clinicaId=${encodeURIComponent(clinicaId)}`).
    then((r) => r.ok ? r.json() : { exibir: false }).
    then((dados: {exibir?: boolean;}) => {
      if (cancelado) return;
      if (dados?.exibir) liberarAnuncios();else
      if (anunciosLiberados()) window.location.reload();
    }).
    catch(() => {

      /* sem resposta: não mostra anúncio */});
    return () => {
      cancelado = true;
    };
  }, [logado, tipo, clinicaId]);
}
