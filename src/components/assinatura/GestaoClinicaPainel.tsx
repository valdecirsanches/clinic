import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangleIcon, ExternalLinkIcon, LoaderIcon, XIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  ESTILO_STATUS_FATURA,
  ROTULO_STATUS_FATURA,
  ROTULO_STATUS_NFSE,
  formatarCompetencia,
  formatarMoeda,
  formatarQuantidadeUso } from
'../../types/assinatura';
import type {
  DetalheClinicaGestao,
  PlanoGestao,
  useAssinaturaGestao } from
'../../hooks/useAssinaturaGestao';

interface GestaoClinicaPainelProps {
  clinicaId: string;
  clinicaNome: string;
  competencia: string;
  planos: PlanoGestao[];
  api: ReturnType<typeof useAssinaturaGestao>;
  onClose: () => void;
  onAlterado: () => void;
}

const FORMAS_BAIXA = [
{ id: 'pix', nome: 'PIX' },
{ id: 'transferencia', nome: 'Transferência' },
{ id: 'boleto', nome: 'Boleto' },
{ id: 'cartao_credito', nome: 'Cartão' }];


/** "12,50" / "1.234,50" / "12.5" → número; vazio → null */
function lerValor(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
}

export function GestaoClinicaPainel({
  clinicaId,
  clinicaNome,
  competencia,
  planos,
  api,
  onClose,
  onAlterado
}: GestaoClinicaPainelProps) {
  const [detalhe, setDetalhe] = useState<DetalheClinicaGestao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [plano, setPlano] = useState('');
  const [valorFixo, setValorFixo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [formaBaixa, setFormaBaixa] = useState('pix');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const d = await api.carregarDetalhe(clinicaId, competencia);
      setDetalhe(d);
      setPlano(d.plano?.encontrado ? d.plano.id : '');
      setValorFixo(
        d.contrato?.valorMensalFixo != null ?
        d.contrato.valorMensalFixo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) :
        ''
      );
      setObservacoes(d.contrato?.observacoes || '');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [api, clinicaId, competencia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (chave: string, acao: () => Promise<unknown>, sucesso: string) => {
    setOcupado(chave);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      setAviso(sucesso);
      await carregar();
      onAlterado();
    } catch (err: any) {
      setErro(err.message);
      await carregar();
    } finally {
      setOcupado(null);
    }
  };

  const salvarContrato = () => {
    const fixo = lerValor(valorFixo);
    if (fixo !== null && (Number.isNaN(fixo) || fixo < 0)) {
      setErro('Valor mensal inválido. Use, por exemplo, 199,90.');
      return;
    }
    if (!plano) {
      setErro('Selecione um plano.');
      return;
    }
    executar(
      'contrato',
      () => api.salvarContrato(clinicaId, { plano, valorMensalFixo: fixo, observacoes }),
      'Cobrança da clínica atualizada. A prévia já reflete o novo valor.'
    );
  };

  const planoSelecionado = planos.find((p) => p.id === plano);
  const faturaDoMes = detalhe?.faturas.find((f) => f.competencia === competencia);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Assinatura de ${clinicaNome}`}>
      <button type="button" className="absolute inset-0 bg-gray-900/30" aria-label="Fechar painel" onClick={onClose} />
      <aside className="relative w-full max-w-2xl h-full bg-white shadow-xl flex flex-col">
        <header className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{clinicaNome}</h2>
            <p className="text-sm text-gray-500">Competência {formatarCompetencia(competencia)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Fechar">
            
            <XIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {erro &&
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {erro}
            </p>
          }
          {aviso &&
          <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
              {aviso}
            </p>
          }

          {carregando && !detalhe ?
          <p className="flex items-center gap-2 text-sm text-gray-500">
              <LoaderIcon className="w-4 h-4 animate-spin" /> Carregando...
            </p> :
          detalhe ?
          <>
              {/* Valor cobrado — o motivo desta tela */}
              <section>
                <h3 className="text-base font-semibold text-gray-900">Valor cobrado</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  O valor contratado substitui o preço do plano. Deixe em branco para cobrar o preço do plano.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Plano</span>
                    <select
                    value={plano}
                    onChange={(e) => setPlano(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    
                      <option value="">Selecione...</option>
                      {planos.map((p) =>
                    <option key={p.id} value={p.id}>
                          {p.nome} — {formatarMoeda(p.preco)}/mês
                        </option>
                    )}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">
                      Valor mensal contratado (R$)
                    </span>
                    <input
                    value={valorFixo}
                    onChange={(e) => setValorFixo(e.target.value)}
                    inputMode="decimal"
                    placeholder={planoSelecionado ? `Plano: ${planoSelecionado.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '0,00'}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Observações internas</span>
                    <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={2}
                    placeholder="Ex.: desconto negociado até dez/2026"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  
                  </label>
                </div>
                <div className="flex justify-end mt-3">
                  <Button onClick={salvarContrato} disabled={ocupado !== null}>
                    {ocupado === 'contrato' ? 'Salvando...' : 'Salvar cobrança'}
                  </Button>
                </div>
              </section>

              {/* Prévia do mês */}
              <section>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-900">Prévia do mês</h3>
                  <span className="text-xl font-semibold text-gray-900 tabular-nums">
                    {formatarMoeda(detalhe.previa.valorTotal)}
                  </span>
                </div>
                {detalhe.previa.itens.length ?
              <table className="w-full text-sm mt-3">
                    <tbody className="divide-y divide-gray-100">
                      {detalhe.previa.itens.map((item) =>
                  <tr key={item.servico}>
                          <td className="py-2 text-gray-800">{item.nome}</td>
                          <td className="py-2 text-right text-gray-500 whitespace-nowrap">
                            {item.modelo === 'mensal' ? 'Mensal' : formatarQuantidadeUso(item)}
                          </td>
                          <td className="py-2 text-right font-medium text-gray-900 tabular-nums w-28">
                            {formatarMoeda(item.valor)}
                          </td>
                        </tr>
                  )}
                    </tbody>
                  </table> :

              <p className="text-sm text-gray-500 mt-2">Nada a cobrar nesta competência.</p>
              }
                {!faturaDoMes &&
              <div className="flex justify-end mt-3">
                    <Button
                  variant="secondary"
                  disabled={ocupado !== null || detalhe.previa.valorTotal <= 0}
                  onClick={() =>
                  executar('fechar', () => api.fecharFatura(clinicaId, competencia), 'Fatura fechada.')
                  }>
                  
                      {ocupado === 'fechar' ? 'Fechando...' : 'Fechar fatura do mês'}
                    </Button>
                  </div>
              }
              </section>

              {detalhe.pendenciasNfse.length > 0 &&
            <div className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    A NFS-e não será emitida até completar no cadastro da clínica:{' '}
                    <strong>{detalhe.pendenciasNfse.join(', ')}</strong>.
                  </span>
                </div>
            }

              {/* Faturas */}
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-900">Faturas</h3>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Baixa manual via
                    <select
                    value={formaBaixa}
                    onChange={(e) => setFormaBaixa(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
                    
                      {FORMAS_BAIXA.map((f) =>
                    <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                    )}
                    </select>
                  </label>
                </div>
                {!detalhe.faturas.length ?
              <p className="text-sm text-gray-500 mt-2">Nenhuma fatura fechada.</p> :

              <ul className="divide-y divide-gray-100 mt-2">
                    {detalhe.faturas.map((f) => {
                  const podeBaixar = ['aberta', 'vencida', 'em_analise'].includes(f.status);
                  const podeNfse = f.status === 'paga' && f.nfse?.status !== 'autorizada';
                  return (
                    <li key={f.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {formatarCompetencia(f.competencia)}
                              <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${ESTILO_STATUS_FATURA[f.status]}`}>
                                {ROTULO_STATUS_FATURA[f.status]}
                              </span>
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {f.status === 'em_analise' && f.formaPagamento ?
                          `Clínica informou pagamento via ${f.formaPagamento}` :
                          f.pagoEm ?
                          `Paga em ${new Date(f.pagoEm).toLocaleDateString('pt-BR')}${f.origemPagamento ? ` · ${f.origemPagamento === 'mercadopago' ? 'Mercado Pago' : 'baixa manual'}` : ''}` :
                          `Vence em ${f.vencimento.slice(0, 10).split('-').reverse().join('/')}`}
                            </p>
                            {f.nfse && (
                        f.nfse.status === 'autorizada' && f.nfse.link ?
                        <a href={f.nfse.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
                                  NFS-e nº {f.nfse.numero} <ExternalLinkIcon className="w-3 h-3" />
                                </a> :

                        <p className="text-xs text-gray-500" title={f.nfse.erro || undefined}>
                                  {ROTULO_STATUS_NFSE[f.nfse.status]}
                                  {f.nfse.erro ? ` — ${f.nfse.erro}` : ''}
                                </p>)

                        }
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 tabular-nums">
                              {formatarMoeda(f.valorTotal)}
                            </span>
                            {podeBaixar &&
                        <Button
                          size="sm"
                          disabled={ocupado !== null}
                          onClick={() =>
                          executar(`baixa-${f.id}`, () => api.darBaixa(f.id, formaBaixa), 'Fatura baixada como paga.')
                          }>
                          
                                {ocupado === `baixa-${f.id}` ? 'Baixando...' : 'Dar baixa'}
                              </Button>
                        }
                            {podeNfse &&
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={ocupado !== null}
                          onClick={() =>
                          executar(`nfse-${f.id}`, () => api.emitirNfse(f.id), 'NFS-e autorizada.')
                          }>
                          
                                {ocupado === `nfse-${f.id}` ? 'Emitindo...' : f.nfse ? 'Reemitir NFS-e' : 'Emitir NFS-e'}
                              </Button>
                        }
                          </div>
                        </li>);

                })}
                  </ul>
              }
              </section>
            </> :
          null}
        </div>
      </aside>
    </div>);

}