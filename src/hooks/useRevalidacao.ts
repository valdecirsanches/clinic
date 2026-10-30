import { useEffect, useRef } from 'react';

/**
 * REVALIDAÇÃO DE DADOS ENTRE TERMINAIS.
 *
 * As telas carregavam os dados uma única vez, na montagem. Com dois terminais
 * abertos, o que já estava na tela nunca era atualizado: quem alterou via o
 * novo valor, os demais continuavam com o antigo até fechar e reabrir a tela.
 *
 * Este hook recarrega os dados quando:
 *   - a janela/aba volta a receber foco (o caso mais comum: alternar de máquina)
 *   - a aba volta a ficar visível
 *   - a conexão é restabelecida
 *   - passa o intervalo definido, enquanto a aba estiver visível
 *
 * Nunca dispara com a aba oculta, para não gerar tráfego inútil.
 */
export function useRevalidacao(
recarregar: () => void | Promise<void>,
opcoes?: {
  /** Intervalo em ms. 0 desliga a revalidação periódica. Padrão: 60s */
  intervalo?: number;
  /** Desliga completamente (ex.: enquanto um formulário está aberto) */
  pausado?: boolean;
})
{
  const intervalo = opcoes?.intervalo ?? 60000;
  const pausado = opcoes?.pausado ?? false;

  // Mantém a última função sem reassinar os listeners a cada render
  const recarregarRef = useRef(recarregar);
  useEffect(() => {
    recarregarRef.current = recarregar;
  }, [recarregar]);

  useEffect(() => {
    if (pausado) return;

    const executar = () => {
      if (document.visibilityState === 'hidden') return;
      Promise.resolve(recarregarRef.current()).catch(() => {

        /* falha de rede é tratada por quem carrega */});
    };

    const aoFicarVisivel = () => {
      if (document.visibilityState === 'visible') executar();
    };

    window.addEventListener('focus', executar);
    window.addEventListener('online', executar);
    document.addEventListener('visibilitychange', aoFicarVisivel);

    const timer =
    intervalo > 0 ? window.setInterval(executar, intervalo) : undefined;

    return () => {
      window.removeEventListener('focus', executar);
      window.removeEventListener('online', executar);
      document.removeEventListener('visibilitychange', aoFicarVisivel);
      if (timer) window.clearInterval(timer);
    };
  }, [intervalo, pausado]);
}