import React, { useState } from 'react';
import { LoaderIcon, MicIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { useAssistenteAtivacao } from '../../hooks/useAssistenteAtivacao';

interface AssistenteAtivacaoCardProps {
  clinicaId: string;
  usuarioId: string;
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function AssistenteAtivacaoCard({ clinicaId, usuarioId }: AssistenteAtivacaoCardProps) {
  const { ativacao, erro, alterar } = useAssistenteAtivacao(clinicaId);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const ligado = Boolean(ativacao?.ativoNaClinica);

  const alternar = async () => {
    if (!ativacao) return;
    if (!ligado) {
      const texto = ativacao.valorUnitario > 0 ?
      `Ao ativar, cada pedido atendido pelo assistente custa ${moeda(ativacao.valorUnitario)}${ativacao.franquia ? ` (os primeiros ${ativacao.franquia} do mês não são cobrados)` : ''} e entra na fatura mensal da assinatura. Ativar?` :
      'Ao ativar, cada pedido atendido pelo assistente passa a ser contado na fatura mensal da assinatura. Ativar?';
      if (!window.confirm(texto)) return;
    }
    setSalvando(true);
    setErroSalvar(null);
    try {
      await alterar(!ligado, usuarioId);
    } catch (e: any) {
      setErroSalvar(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <div className="px-6 py-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
            <MicIcon className="w-5 h-5 text-teal-700" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">Assistente de voz</h2>
            <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
              Marcar, cancelar e consultar a agenda falando. Nada é gravado sem a confirmação de quem usa.
            </p>
            {ativacao &&
            <p className="text-sm text-gray-700 mt-2">
                Cobrança:{' '}
                <span className="font-medium">
                  {ativacao.valorUnitario > 0 ? `${moeda(ativacao.valorUnitario)} por pedido atendido` : 'por pedido atendido (preço ainda não definido)'}
                </span>
                {ativacao.franquia > 0 && <span className="text-gray-500"> · {ativacao.franquia} pedidos/mês incluídos</span>}
              </p>
            }
            {ativacao?.alteradoPor &&
            <p className="text-xs text-gray-500 mt-1">
                {ligado ? 'Ativado' : 'Desativado'} por {ativacao.alteradoPor}
                {ativacao.alteradoEm && ` em ${new Date(ativacao.alteradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
              </p>
            }
            {ativacao && !ativacao.configurado &&
            <p className="text-xs text-amber-700 mt-1">
                O servidor ainda não tem a chave da OpenAI. Peça ao suporte para configurar antes de ativar.
              </p>
            }
            {(erro || erroSalvar) && <p role="alert" className="text-xs text-red-700 mt-1">{erroSalvar || erro}</p>}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label="Ativar assistente de voz"
          onClick={alternar}
          disabled={!ativacao || salvando || !ligado && !ativacao.configurado}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50 ${ligado ? 'bg-teal-600' : 'bg-gray-300'}`}>
          
          {salvando ?
          <LoaderIcon className="absolute left-1/2 -ml-2 w-4 h-4 animate-spin text-white" /> :

          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
          }
        </button>
      </div>
    </Card>);

}