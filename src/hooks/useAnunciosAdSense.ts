// ==================== ANÚNCIOS (Google AdSense) ====================
// Anúncios automáticos do AdSense para quem NÃO tem plano pago:
//   • visitante na demonstração → mostra (a tela de login fica sem anúncio:
//     quem vai entrar costuma ser cliente);
//   • usuário logado → pergunta ao servidor (/api/anuncios) se a clínica paga;
//   • super admin, clínica pagante e palco do Vídeo de Demonstração → nunca.
// O script só é inserido quando pode exibir. Se a clínica passar a pagar com o
// script já carregado, a página recarrega para tirar os anúncios.
import { useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { DEMO_VIDEO, DEMO_VISITANTE } from '../utils/modoDemo';

export const ADSENSE_CLIENTE = 'ca-pub-8474105490186035';
const ID_SCRIPT = 'easyclin-adsense';

function carregarAdSense() {
  if (typeof document === 'undefined' || document.getElementById(ID_SCRIPT)) return;
  const script = document.createElement('script');
  script.id = ID_SCRIPT;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENTE}`;
  document.head.appendChild(script);
}

function adSenseCarregado() {
  return typeof document !== 'undefined' && !!document.getElementById(ID_SCRIPT);
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
      carregarAdSense();
      return;
    }
    if (!logado || tipo === 'super_admin' || !clinicaId) return;

    let cancelado = false;
    fetch(`${API_BASE_URL}/api/anuncios?clinicaId=${encodeURIComponent(clinicaId)}`).
    then((r) => r.ok ? r.json() : { exibir: false }).
    then((dados: {exibir?: boolean;}) => {
      if (cancelado) return;
      if (dados?.exibir) carregarAdSense();else
      if (adSenseCarregado()) window.location.reload();
    }).
    catch(() => {

      /* sem resposta: não mostra anúncio */});
    return () => {
      cancelado = true;
    };
  }, [logado, tipo, clinicaId]);
}
