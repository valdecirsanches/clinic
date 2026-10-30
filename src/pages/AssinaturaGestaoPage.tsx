import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircleIcon, ChevronRightIcon, LoaderIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { GestaoClinicaPainel } from '../components/assinatura/GestaoClinicaPainel';
import { IntegracoesAssinaturaPainel } from '../components/assinatura/IntegracoesAssinaturaPainel';
import { PrecosAssinaturaForm } from '../components/assinatura/PrecosAssinaturaForm';
import { DadosRecebimentoForm } from '../components/assinatura/DadosRecebimentoForm';
import { useAssinaturaGestao } from '../hooks/useAssinaturaGestao';
import type { LinhaClinicaGestao, PlanoGestao } from '../hooks/useAssinaturaGestao';
import {
  ESTILO_STATUS_FATURA,
  ROTULO_STATUS_FATURA,
  formatarCompetencia,
  formatarMoeda } from
'../types/assinatura';

type Aba = 'clinicas' | 'precos' | 'integracoes';

const ABAS: {id: Aba;nome: string;}[] = [
{ id: 'clinicas', nome: 'Clínicas' },
{ id: 'precos', nome: 'Preços e recebimento' },
{ id: 'integracoes', nome: 'Mercado Pago e NFS-e' }];


function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function AssinaturaGestaoPage() {
  const api = useAssinaturaGestao();
  const [aba, setAba] = useState<Aba>('clinicas');
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [linhas, setLinhas] = useState<LinhaClinicaGestao[]>([]);
  const [planos, setPlanos] = useState<PlanoGestao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fechandoTodas, setFechandoTodas] = useState(false);
  const [selecionada, setSelecionada] = useState<LinhaClinicaGestao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, listaPlanos] = await Promise.all([
      api.carregarClinicas(competencia),
      api.carregarPlanos()]
      );
      setLinhas(lista.clinicas);
      setPlanos(listaPlanos);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [api, competencia]);

  useEffect(() => {
    if (aba === 'clinicas') carregar();
  }, [aba, carregar]);

  const totais = useMemo(() => {
    let previa = 0;
    let recebido = 0;
    let pendente = 0;
    for (const l of linhas) {
      previa += l.fatura ? l.fatura.valorTotal : l.previaTotal || 0;
      if (l.fatura?.status === 'paga') recebido += l.fatura.valorTotal;else
      if (l.fatura && l.fatura.status !== 'cancelada') pendente += l.fatura.valorTotal;
    }
    return { previa, recebido, pendente };
  }, [linhas]);

  const fecharTodas = async () => {
    if (!window.confirm(`Fechar as faturas de ${formatarCompetencia(competencia)} de todas as clínicas ativas?`)) return;
    setFechandoTodas(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api.fecharTodas(competencia);
      setAviso(
        `${r.fechadas.length} fatura(s) fechada(s)` + (
        r.ignoradas.length ?
        ` · ${r.ignoradas.length} ignorada(s): ${r.ignoradas.map((i) => `${i.clinicaNome} (${i.motivo})`).join('; ')}` :
        '')
      );
      await carregar();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setFechandoTodas(false);
    }
  };

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Gestão de Assinaturas</h1>
        <p className="text-sm text-gray-600 mt-1">
          Quanto cada clínica paga, faturas, baixas e notas fiscais.
        </p>
      </header>

      <nav className="flex gap-1 border-b border-gray-200" aria-label="Seções">
        {ABAS.map((a) =>
        <button
          key={a.id}
          type="button"
          onClick={() => setAba(a.id)}
          aria-current={aba === a.id ? 'page' : undefined}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
          aba === a.id ?
          'border-teal-600 text-teal-700' :
          'border-transparent text-gray-500 hover:text-gray-800'}`
          }>
          
            {a.nome}
          </button>
        )}
      </nav>

      {aba === 'clinicas' &&
      <>
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-8">
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1">Competência</span>
                <input
                type="month"
                value={competencia}
                onChange={(e) => e.target.value && setCompetencia(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" />
              
              </label>
              <div>
                <p className="text-xs text-gray-500">Total do mês</p>
                <p className="text-3xl font-semibold text-gray-900 tabular-nums">{formatarMoeda(totais.previa)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Recebido</p>
                <p className="text-lg font-semibold text-green-700 tabular-nums">{formatarMoeda(totais.recebido)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">A receber</p>
                <p className="text-lg font-semibold text-amber-700 tabular-nums">{formatarMoeda(totais.pendente)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={carregar} disabled={carregando}>
                <RefreshCwIcon className={`w-4 h-4 mr-1 inline ${carregando ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button onClick={fecharTodas} disabled={fechandoTodas || carregando}>
                {fechandoTodas ? 'Fechando...' : 'Fechar faturas do mês'}
              </Button>
            </div>
          </section>

          {erro &&
        <div role="alert" className="flex gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircleIcon className="w-5 h-5 shrink-0" />
              {erro}
            </div>
        }
          {aviso &&
        <p role="status" className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              {aviso}
            </p>
        }

          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Clínica</th>
                  <th className="text-left font-medium px-4 py-3">Plano</th>
                  <th className="text-right font-medium px-4 py-3">Mensalidade</th>
                  <th className="text-right font-medium px-4 py-3">SMS</th>
                  <th className="text-right font-medium px-4 py-3">Documentos</th>
                  <th className="text-right font-medium px-4 py-3">Total</th>
                  <th className="text-left font-medium px-4 py-3">Fatura</th>
                  <th className="px-2 py-3" aria-hidden="true" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carregando && !linhas.length ?
              <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      <LoaderIcon className="w-4 h-4 animate-spin inline mr-2" />
                      Calculando...
                    </td>
                  </tr> :
              !linhas.length ?
              <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Nenhuma clínica ativa.</td>
                  </tr> :

              linhas.map((l) =>
              <tr
                key={l.clinicaId}
                onClick={() => setSelecionada(l)}
                className="cursor-pointer hover:bg-gray-50">
                
                      <td className="px-4 py-3">
                        <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelecionada(l);
                    }}
                    className="font-medium text-gray-900 text-left hover:text-teal-700 focus:outline-none focus-visible:underline">
                    
                          {l.clinicaNome}
                        </button>
                        {l.erro && <span className="block text-xs text-red-600">{l.erro}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {l.plano?.encontrado ? l.plano.nome : <span className="text-amber-700">Sem plano</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {formatarMoeda(l.mensalidade || 0)}
                        {l.valorMensalFixo != null &&
                  <span className="block text-xs text-gray-500">contratado</span>
                  }
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {formatarMoeda(l.sms?.valor || 0)}
                        <span className="block text-xs text-gray-500">{l.sms?.quantidade || 0} enviados</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">
                        {(l.armazenamentoGb || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatarMoeda(l.fatura ? l.fatura.valorTotal : l.previaTotal || 0)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {l.fatura ?
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ESTILO_STATUS_FATURA[l.fatura.status]}`}>
                            {ROTULO_STATUS_FATURA[l.fatura.status]}
                          </span> :

                  <span className="text-xs text-gray-500">Prévia</span>
                  }
                      </td>
                      <td className="px-2 py-3 text-gray-400">
                        <ChevronRightIcon className="w-4 h-4" />
                      </td>
                    </tr>
              )
              }
              </tbody>
            </table>
          </div>
        </>
      }

      {aba === 'precos' &&
      <div className="space-y-6 max-w-4xl">
          <p className="text-sm text-gray-600">
            Preços padrão por serviço (SMS, GB excedente de documentos etc.). A mensalidade de cada
            clínica vem do plano ou do valor contratado definido na aba Clínicas.
          </p>
          <PrecosAssinaturaForm />
          <DadosRecebimentoForm />
        </div>
      }

      {aba === 'integracoes' && <IntegracoesAssinaturaPainel api={api} />}

      {selecionada &&
      <GestaoClinicaPainel
        clinicaId={selecionada.clinicaId}
        clinicaNome={selecionada.clinicaNome}
        competencia={competencia}
        planos={planos}
        api={api}
        onClose={() => setSelecionada(null)}
        onAlterado={carregar} />

      }
    </main>);

}