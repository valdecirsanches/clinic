import { useState } from 'react';
import { DatabaseIcon, SparklesIcon } from 'lucide-react';
import { HISTORICO_VERSOES, VERSAO_ATUAL, getBuildDate } from '../../config/version';
import { formatarDataVersao } from '../../utils/historicoVersoes';
import { marcarVersaoVista, useNovidadeNaoVista } from '../../utils/versaoVista';
import { HistoricoVersoesModal } from '../versao/HistoricoVersoesModal';

/**
 * Versão no topo da tela (onde ficava o nome do usuário): abre "O que mudou",
 * com selo "Novo" até a pessoa ver as novidades desta versão.
 */
export function VersaoBotao() {
  const [aberto, setAberto] = useState(false);
  const novidade = useNovidadeNaoVista();
  const dataVersao = formatarDataVersao(HISTORICO_VERSOES[0]?.data || '');
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
        title={`O que mudou · versão de ${dataVersao} · compilada em ${compilada}`}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-300">
        
        <SparklesIcon className="h-3.5 w-3.5 text-teal-600" />
        <span className="font-semibold">Versão {VERSAO_ATUAL}</span>
        {novidade ?
        <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-800">Novo</span> :
        <span className="hidden md:inline text-gray-500">· O que mudou</span>}
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
