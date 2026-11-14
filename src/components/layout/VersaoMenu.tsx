import { useState } from 'react';
import { ChevronRightIcon, DatabaseIcon, SparklesIcon } from 'lucide-react';
import { HISTORICO_VERSOES, VERSAO_ATUAL, getBuildDate } from '../../config/version';
import { formatarDataVersao } from '../../utils/historicoVersoes';
import { marcarVersaoVista, useNovidadeNaoVista } from '../../utils/versaoVista';
import { HistoricoVersoesModal } from '../versao/HistoricoVersoesModal';

/**
 * Cartão da versão no menu lateral, abaixo do nome do sistema: abre
 * "O que mudou", com selo "Novo" até a pessoa ver as novidades.
 */
export function VersaoCartao() {
  const [aberto, setAberto] = useState(false);
  const novidade = useNovidadeNaoVista();
  const dataVersao = formatarDataVersao(HISTORICO_VERSOES[0]?.data || '').slice(0, 5); // dd/mm
  const compilada = getBuildDate().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          marcarVersaoVista();
          setAberto(true);
        }}
        title={`Ver o que mudou em cada versão · compilada em ${compilada}`}
        className="group mt-3 flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-teal-300 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-300">
        
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white text-teal-600 shadow-sm">
          <SparklesIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
            Versão {VERSAO_ATUAL}
            {novidade &&
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Novo
              </span>
            }
          </span>
          <span className="block truncate text-[11px] text-gray-500">O que mudou · {dataVersao}</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
      </button>
      {aberto && <HistoricoVersoesModal onFechar={() => setAberto(false)} />}
    </>);
}

/** Banco em uso (clínica atual), lido da sessão gravada no navegador. */
function bancoEmUso(): string | null {
  try {
    const sessao = JSON.parse(localStorage.getItem('sessao') || 'null');
    if (!sessao) return null;
    if (sessao.clinicaAtual?.id) return String(sessao.clinicaAtual.id);
    if (sessao.operadoraSelecionada) return 'selecione uma clínica';
    if (sessao.usuario?.tipo === 'super_admin') return 'selecione uma operadora';
  } catch {/* sessão ilegível */}
  return null;
}

/** Linha discreta do menu lateral com o banco em uso. */
export function BancoEmUso() {
  const banco = bancoEmUso();
  if (!banco) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400" title="Banco de dados em uso">
      <DatabaseIcon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">
        Banco: <span className="font-mono">{banco}</span>
      </span>
    </p>);
}
