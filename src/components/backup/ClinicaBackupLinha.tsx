import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDownIcon, DownloadIcon, LoaderIcon } from 'lucide-react';
import { BACKUP_API_URL as API_BASE_URL } from '../../config/api';
import { urlComToken } from '../../utils/autenticacaoApi';

interface ArquivoBackup {
  nome: string;
  tamanho: number;
  em: string;
}

interface UltimoBackup {
  ok: boolean;
  em: string;
  erro?: string;
}

interface ClinicaBackupLinhaProps {
  id: string;
  nome: string;
  detalhe?: string;
  marcada: boolean;
  onMarcar: (marcar: boolean) => void;
  ultimo?: UltimoBackup;
  executando: boolean;
  podeExecutar: boolean;
  onExecutar: () => void;
  qs: string;
  atualizarEm: number;
}

export function ClinicaBackupLinha({
  id,
  nome,
  detalhe,
  marcada,
  onMarcar,
  ultimo,
  executando,
  podeExecutar,
  onExecutar,
  qs,
  atualizarEm
}: ClinicaBackupLinhaProps) {
  const [aberta, setAberta] = useState(false);
  const [arquivos, setArquivos] = useState<ArquivoBackup[] | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`${API_BASE_URL}/api/backup/arquivos?${qs}&clinicaId=${encodeURIComponent(id)}`);
    setArquivos(r.ok ? await r.json() : []);
  }, [id, qs]);

  useEffect(() => {
    if (aberta) carregar();
  }, [aberta, carregar, atualizarEm]);

  return (
    <li className={marcada ? '' : 'bg-gray-50/60'}>
      <div className="flex items-center gap-3 px-5 py-3">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(e) => onMarcar(e.target.checked)}
          className="w-4 h-4 accent-teal-600 shrink-0"
          aria-label={`Incluir ${nome} no backup`} />
        
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate ${marcada ? 'text-gray-900' : 'text-gray-500'}`}>
            {nome}
            {detalhe && <span className="ml-2 text-xs font-normal text-gray-400">{detalhe}</span>}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {executando ?
            <span className="inline-flex items-center gap-1 text-teal-700">
                <LoaderIcon className="w-3 h-3 animate-spin" /> Gerando backup...
              </span> :
            ultimo ?
            <span className={ultimo.ok ? '' : 'text-red-700'} title={ultimo.erro}>
                Último: {dataHora(ultimo.em)} · {ultimo.ok ? 'sucesso' : 'falhou'}
              </span> :

            'Nenhum backup ainda'
            }
          </p>
        </div>
        {marcada &&
        <button
          type="button"
          onClick={onExecutar}
          disabled={!podeExecutar || executando}
          className="text-sm text-teal-700 hover:underline disabled:text-gray-300 disabled:no-underline whitespace-nowrap">
          
            Fazer agora
          </button>
        }
        <button
          type="button"
          onClick={() => setAberta((a) => !a)}
          aria-expanded={aberta}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
          
          Arquivos
          <ChevronDownIcon className={`w-4 h-4 transition-transform duration-150 ${aberta ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {aberta &&
      <div className="pl-12 pr-5 pb-3">
          {arquivos === null ?
        <p className="text-xs text-gray-500">Carregando...</p> :
        !arquivos.length ?
        <p className="text-xs text-gray-500">Nenhum arquivo desta clínica na pasta.</p> :

        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
              {arquivos.map((a) =>
          <li key={a.nome} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-gray-900 truncate">{a.nome}</p>
                    <p className="text-xs text-gray-500">{dataHora(a.em)} · {tamanho(a.tamanho)}</p>
                  </div>
                  <a
              href={urlComToken(`${API_BASE_URL}/api/backup/download?${qs}&clinicaId=${encodeURIComponent(id)}&nome=${encodeURIComponent(a.nome)}`)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label={`Baixar ${a.nome}`}>
              
                    <DownloadIcon className="w-4 h-4" />
                  </a>
                </li>
          )}
            </ul>
        }
        </div>
      }
    </li>);

}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function tamanho(bytes?: number | null) {
  if (bytes == null) return '—';
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}