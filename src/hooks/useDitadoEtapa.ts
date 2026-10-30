import { useEffect, useRef } from 'react';
import {
  EVENTO_PREENCHER,
  EVENTO_RESULTADO,
  type EtapaDitavel,
  type ModoDitado,
  type PedidoPreencher,
  type ResultadoPreencher } from
'../utils/ditadoProntuario';

/**
 * Faz a etapa aceitar ditado do assistente. `aplicar` recebe os valores e
 * devolve os campos efetivamente preenchidos (usa o mesmo caminho da
 * digitação, então o salvamento automático da etapa continua valendo).
 * Prontuário assinado ou usuário sem permissão: nada é alterado.
 */
export function useDitadoEtapa(
etapa: EtapaDitavel,
readOnly: boolean | undefined,
aplicar: (valores: Record<string, string>, modo: ModoDitado) => string[])
{
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  const readOnlyRef = useRef(Boolean(readOnly));
  readOnlyRef.current = Boolean(readOnly);
  const atendidos = useRef(new Set<string>());

  useEffect(() => {
    const responder = (r: ResultadoPreencher) =>
    window.dispatchEvent(new CustomEvent<ResultadoPreencher>(EVENTO_RESULTADO, { detail: r }));

    const ouvir = (ev: Event) => {
      const p = (ev as CustomEvent<PedidoPreencher>).detail;
      if (!p || p.etapa !== etapa) return;
      // O assistente repete o envio até ter resposta: aplica uma vez só.
      if (atendidos.current.has(p.id)) return;
      atendidos.current.add(p.id);
      if (readOnlyRef.current) return responder({ id: p.id, ok: false, campos: [], motivo: 'somente_leitura' });
      const campos = aplicarRef.current(p.valores || {}, p.modo || 'acrescentar');
      responder({ id: p.id, ok: campos.length > 0, campos, motivo: campos.length ? undefined : 'sem_campos' });
    };
    window.addEventListener(EVENTO_PREENCHER, ouvir);
    return () => window.removeEventListener(EVENTO_PREENCHER, ouvir);
  }, [etapa]);
}