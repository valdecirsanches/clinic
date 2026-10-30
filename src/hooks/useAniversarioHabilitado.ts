import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

/**
 * Informa se a felicitação de aniversário está LIGADA para a clínica.
 *
 * Usado para não oferecer o botão de envio quando o recurso foi desativado nas
 * Configurações — o servidor também recusa o envio, mas um botão que aparece e
 * não envia é pior que botão nenhum.
 *
 * Cache curto compartilhado: a agenda renderiza muitos cartões e cada um
 * consultaria a mesma informação.
 */
const CACHE_MS = 30000;
const cache = new Map<string, {valor: boolean;em: number;}>();

export function useAniversarioHabilitado(clinicaId?: string): boolean {
  const emCache = clinicaId ? cache.get(clinicaId) : undefined;
  const [habilitado, setHabilitado] = useState<boolean>(
    emCache ? emCache.valor : true
  );

  useEffect(() => {
    if (!clinicaId) return;
    const guardado = cache.get(clinicaId);
    if (guardado && Date.now() - guardado.em < CACHE_MS) {
      setHabilitado(guardado.valor);
      return;
    }
    let ativo = true;
    fetch(`${API_BASE_URL}/api/aniversarios/status?clinicaId=${clinicaId}`).
    then((r) => r.ok ? r.json() : null).
    then((dados) => {
      if (!ativo || !dados) return;
      const valor = dados.habilitado !== false;
      cache.set(clinicaId, { valor, em: Date.now() });
      setHabilitado(valor);
    }).
    catch(() => {

      /* falha de rede não esconde o recurso — o servidor é a trava real */});
    return () => {
      ativo = false;
    };
  }, [clinicaId]);

  return habilitado;
}