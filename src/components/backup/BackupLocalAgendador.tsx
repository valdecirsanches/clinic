import React, { useCallback, useEffect, useState } from 'react';
import { DownloadIcon, XIcon } from 'lucide-react';
import {
  backupDevido,
  ErroBackup,
  backupLocalEmExecucao,
  executarBackupLocal,
  lerConfigBackupLocal,
  lerPastaBackup,
  suportaBackupLocal } from
'../../utils/backupLocal';

interface BackupLocalAgendadorProps {
  clinicaId?: string;
  usuarioId?: string;
}

type Estado =
{tipo: 'ocioso';} |
{tipo: 'autorizar';} |
{tipo: 'gravando';} |
{tipo: 'concluido';} |
{tipo: 'falha';mensagem: string;};

const INTERVALO_MS = 60_000;

/**
 * Roda o backup diário enquanto o sistema está aberto. Se o navegador exigir
 * autorização para a pasta (ele pede a cada sessão), mostra um botão discreto
 * — a autorização só pode ser dada por um clique.
 */
export function BackupLocalAgendador({ clinicaId, usuarioId }: BackupLocalAgendadorProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' });

  const executar = useCallback(
    async (pedirPermissao: boolean) => {
      if (!clinicaId || !usuarioId || backupLocalEmExecucao()) return;
      const pasta = await lerPastaBackup(clinicaId);
      if (!pasta) return;
      let permissao = await pasta.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as const);
      if (permissao !== 'granted' && pedirPermissao) {
        permissao = await pasta.requestPermission({ mode: 'readwrite' }).catch(() => 'denied' as const);
      }
      if (permissao !== 'granted') {
        setEstado({ tipo: 'autorizar' });
        return;
      }
      setEstado({ tipo: 'gravando' });
      try {
        await executarBackupLocal({ clinicaId, usuarioId, pasta });
        setEstado({ tipo: 'concluido' });
        window.setTimeout(() => setEstado({ tipo: 'ocioso' }), 6000);
      } catch (err) {
        // Já feito hoje em outro computador: não é falha, não incomoda
        if (err instanceof ErroBackup && err.limiteDiario) {
          setEstado({ tipo: 'ocioso' });
          return;
        }
        setEstado({ tipo: 'falha', mensagem: err instanceof Error ? err.message : 'Falha no backup.' });
      }
    },
    [clinicaId, usuarioId]
  );

  useEffect(() => {
    if (!clinicaId || !usuarioId || !suportaBackupLocal()) return;
    const verificar = () => {
      const config = lerConfigBackupLocal(clinicaId);
      // Depois de uma falha, espera 30 min antes de tentar sozinho de novo
      const falhouHaPouco =
      config.ultimoErro && Date.now() - new Date(config.ultimoErro.em).getTime() < 30 * 60_000;
      if (backupDevido(config) && !falhouHaPouco) executar(false);
    };
    verificar();
    const timer = window.setInterval(verificar, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [clinicaId, usuarioId, executar]);

  if (estado.tipo === 'ocioso') return null;

  const texto = {
    autorizar: 'Backup diário pendente — autorize a pasta',
    gravando: 'Gravando o backup diário...',
    concluido: 'Backup diário gravado',
    falha: `Backup diário falhou: ${estado.tipo === 'falha' ? estado.mensagem : ''}`
  }[estado.tipo];

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-4 z-40 max-w-sm flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-md bg-white ${
      estado.tipo === 'falha' ? 'border-red-200 text-red-700' : 'border-gray-200 text-gray-800'}`
      }>
      
      <DownloadIcon
        className={`w-4 h-4 shrink-0 ${estado.tipo === 'gravando' ? 'animate-pulse text-teal-600' : 'text-teal-600'}`}
        aria-hidden="true" />
      
      {estado.tipo === 'autorizar' || estado.tipo === 'falha' ?
      <button
        type="button"
        onClick={() => executar(true)}
        className="text-left font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500 rounded">
        
          {texto}
          {estado.tipo === 'falha' && <span className="block text-xs font-normal">Clique para tentar de novo</span>}
        </button> :

      <span>{texto}</span>
      }
      {estado.tipo !== 'gravando' &&
      <button
        type="button"
        onClick={() => setEstado({ tipo: 'ocioso' })}
        className="ml-1 text-gray-400 hover:text-gray-600"
        aria-label="Fechar aviso de backup">
        
          <XIcon className="w-4 h-4" />
        </button>
      }
    </div>);

}