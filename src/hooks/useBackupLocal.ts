import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKUP_API_URL as API_BASE_URL } from '../config/api';
import {
  ErroBackup,
  EVENTO_BACKUP_LOCAL,
  escolherPastaBackup,
  executarBackupLocal,
  guardarPastaBackup,
  lerConfigBackupLocal,
  lerPastaBackup,
  salvarConfigBackupLocal,
  suportaBackupLocal,
  type AndamentoBackup,
  type ConfigBackupLocal,
  type EtapaBackup,
  type PastaHandle } from
'../utils/backupLocal';

interface StatusServidor {
  podeHoje: boolean;
  ultimo: {data: string;em: string;arquivo: string;tamanho: number;usuarioNome?: string;} | null;
  trabalho: {estado: 'gerando' | 'pronto' | 'erro';iniciadoEm: string;} | null;
}

export interface FalhaBackup {
  titulo: string;
  oQueFazer: string;
  podeTentar: boolean;
}

/** Estado e ações do backup gravado no computador do cliente */
export function useBackupLocal(clinicaId?: string, usuarioId?: string) {
  const suportado = suportaBackupLocal();
  const [config, setConfig] = useState<ConfigBackupLocal | null>(null);
  const [pasta, setPasta] = useState<PastaHandle | null>(null);
  const [permissao, setPermissao] = useState<'granted' | 'denied' | 'prompt' | null>(null);
  const [servidor, setServidor] = useState<StatusServidor | null>(null);
  const [servidorErro, setServidorErro] = useState(false);
  const [etapa, setEtapa] = useState<EtapaBackup | null>(null);
  const [progresso, setProgresso] = useState<{recebido: number;total: number | null;} | null>(null);
  const [falha, setFalha] = useState<FalhaBackup | null>(null);
  const [concluido, setConcluido] = useState<{arquivo: string;tamanho: number;} | null>(null);
  const [andamento, setAndamento] = useState<AndamentoBackup | null>(null);
  const canceladoRef = useRef(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setConfig(lerConfigBackupLocal(clinicaId));
    const salva = await lerPastaBackup(clinicaId);
    setPasta(salva);
    setPermissao(salva ? await salva.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as const) : null);
    if (usuarioId) {
      const r = await fetch(
        `${API_BASE_URL}/api/backup-cliente/status?clinicaId=${encodeURIComponent(clinicaId)}&usuarioId=${encodeURIComponent(usuarioId)}`,
        { cache: 'no-store' }
      ).catch(() => null);
      setServidorErro(!r?.ok);
      if (r?.ok) setServidor(await r.json());
    }
  }, [clinicaId, usuarioId]);

  useEffect(() => {
    carregar();
    const sincronizar = () => carregar();
    window.addEventListener(EVENTO_BACKUP_LOCAL, sincronizar);
    return () => window.removeEventListener(EVENTO_BACKUP_LOCAL, sincronizar);
  }, [carregar]);

  const atualizarConfig = useCallback(
    (parcial: Partial<ConfigBackupLocal>) => {
      if (!clinicaId) return;
      salvarConfigBackupLocal(clinicaId, { ...lerConfigBackupLocal(clinicaId), ...parcial });
    },
    [clinicaId]
  );

  const escolherPasta = useCallback(async () => {
    if (!clinicaId) return;
    setFalha(null);
    try {
      const nova = await escolherPastaBackup();
      await guardarPastaBackup(clinicaId, nova);
      // Pasta nova resolve falhas de pasta: limpa o erro antigo
      salvarConfigBackupLocal(clinicaId, { ...lerConfigBackupLocal(clinicaId), ultimoErro: null });
      setPasta(nova);
      setPermissao(await nova.queryPermission({ mode: 'readwrite' }));
    } catch (err) {
      // Fechar o seletor sem escolher não é erro
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setFalha({
        titulo: 'Não foi possível usar esta pasta.',
        oQueFazer: 'Escolha uma pasta comum do seu usuário (Documentos, por exemplo). O navegador bloqueia pastas do sistema, como C:\\ ou Windows.',
        podeTentar: false
      });
    }
  }, [clinicaId]);

  /** Chamado num clique: pede a permissão (se preciso) e executa */
  const executarAgora = useCallback(async () => {
    if (!clinicaId || !usuarioId || !pasta) return;
    setFalha(null);
    setConcluido(null);
    setEtapa('preparando');
    setProgresso(null);
    setAndamento(null);
    canceladoRef.current = false;
    try {
      const atual = await pasta.queryPermission({ mode: 'readwrite' });
      const concedida = atual === 'granted' ? atual : await pasta.requestPermission({ mode: 'readwrite' });
      setPermissao(concedida);
      if (concedida !== 'granted') {
        throw new ErroBackup('Você não autorizou gravar na pasta.', 'Clique de novo em "Fazer backup agora" e escolha "Permitir" na pergunta do navegador.');
      }
      const resultado = await executarBackupLocal({
        clinicaId,
        usuarioId,
        pasta,
        onEtapa: setEtapa,
        onProgresso: (recebido, total) => setProgresso({ recebido, total }),
        onAndamento: setAndamento,
        cancelado: () => canceladoRef.current
      });
      setConcluido(resultado);
    } catch (err) {
      if (canceladoRef.current) return;
      const e =
      err instanceof ErroBackup ?
      err :
      new ErroBackup(err instanceof Error ? err.message : 'Falha no backup.', 'Tente de novo.');
      setFalha({ titulo: e.titulo, oQueFazer: e.oQueFazer, podeTentar: e.podeTentar });
    } finally {
      setEtapa(null);
      setProgresso(null);
      setAndamento(null);
      carregar();
    }
  }, [clinicaId, usuarioId, pasta, carregar]);

  /** Para de esperar. O servidor termina sozinho e o arquivo fica pronto para a próxima tentativa. */
  const cancelar = useCallback(() => {
    canceladoRef.current = true;
  }, []);

  return {
    suportado,
    config,
    pasta,
    permissao,
    servidor,
    servidorErro,
    etapa,
    executando: etapa !== null,
    progresso,
    andamento,
    falha,
    concluido,
    atualizarConfig,
    escolherPasta,
    executarAgora,
    cancelar
  };
}