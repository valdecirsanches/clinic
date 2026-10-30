import React, { useMemo, useState } from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileTextIcon,
  RefreshCwIcon } from
'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PagamentoAssinaturaModal } from '../components/assinatura/PagamentoAssinaturaModal';
import { EscolhaPlanoSecao } from '../components/assinatura/EscolhaPlanoSecao';
import { useAuth } from '../hooks/useAuth';
import { useAssinatura } from '../hooks/useAssinatura';
import { useConfiguracoesGlobais } from '../hooks/useConfiguracoesGlobais';
import {
  DADOS_RECEBIMENTO_PADRAO,
  type DadosRecebimento } from
'../components/assinatura/DadosRecebimentoForm';
import {
  ESTILO_STATUS_FATURA,
  ROTULO_STATUS_FATURA,
  ROTULO_STATUS_NFSE,
  SERVICOS_ASSINATURA,
  formatarCompetencia,
  formatarMoeda,
  formatarQuantidadeUso } from
'../types/assinatura';
import type { FaturaAssinatura } from '../types/assinatura';

function formatarData(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

export function AssinaturaFinanceiroPage() {
  const { sessao } = useAuth();
  const clinicaId = sessao?.clinicaAtual?.id;
  const {
    servicos,
    previa,
    faturas,
    mercadoPagoAtivo,
    carregando,
    erro,
    recarregar,
    fecharFatura,
    informarPagamento,
    gerarPix,
    abrirCheckout,
    verificarPagamento
  } = useAssinatura(clinicaId);

  const [faturaSelecionada, setFaturaSelecionada] =
  useState<FaturaAssinatura | null>(null);
  const [acaoErro, setAcaoErro] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);
  const [planoTrocado, setPlanoTrocado] = useState<{
    nome: string;
    preco: number;
  } | null>(null);
  const podeGerenciar =
  sessao?.usuario?.tipo === 'admin' || sessao?.usuario?.tipo === 'super_admin';

  const faturaAPagar = useMemo(
    () => faturas.find((f) => f.status === 'aberta' || f.status === 'vencida'),
    [faturas]
  );

  const pendentes = useMemo(
    () =>
    faturas.filter((f) =>
    ['aberta', 'vencida', 'em_analise'].includes(f.status)
    ),
    [faturas]
  );
  const totalEmAberto = pendentes.reduce((soma, f) => soma + f.valorTotal, 0);

  const dadosRecebimento = useConfiguracoesGlobais<DadosRecebimento>(
    'dados_recebimento',
    DADOS_RECEBIMENTO_PADRAO
  );
  const recebedor = {
    chavePix: dadosRecebimento.valor.chavePix || '',
    nome:
    dadosRecebimento.valor.nomeRecebedor ||
    sessao?.operadoraSelecionada?.nome ||
    'Plataforma',
    cidade: dadosRecebimento.valor.cidade || 'Brasil',
    banco: dadosRecebimento.valor.banco || '',
    agencia: dadosRecebimento.valor.agencia || '',
    conta: dadosRecebimento.valor.conta || '',
    titular: dadosRecebimento.valor.titular || '',
    cnpj: dadosRecebimento.valor.cnpj || ''
  };

  const plano = previa?.plano;
  const limites = plano?.limites;

  const handleFechar = async () => {
    setAcaoErro(null);
    setFechando(true);
    try {
      const fatura = await fecharFatura();
      setFaturaSelecionada(fatura);
    } catch (err: any) {
      setAcaoErro(err.message);
    } finally {
      setFechando(false);
    }
  };

  if (!clinicaId) {
    return (
      <main className="w-full min-h-screen bg-gray-50 p-6">
        <Card>
          <p className="text-sm text-gray-600">
            Selecione uma clínica para ver as mensalidades da assinatura.
          </p>
        </Card>
      </main>);

  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 space-y-6">
      <header
        id="topo-assinatura"
        className="flex flex-wrap items-start justify-between gap-3">
        
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Minha Assinatura
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Mensalidade, consumo do mês e faturas desta clínica.
          </p>
        </div>
        <Button variant="secondary" onClick={recarregar} disabled={carregando}>
          <RefreshCwIcon
            className={`w-4 h-4 mr-1 inline ${carregando ? 'animate-spin' : ''}`} />
          
          Atualizar
        </Button>
      </header>

      {erro &&
      <div
        role="alert"
        className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        
          <AlertCircleIcon className="w-5 h-5 shrink-0" />
          <span>{erro}</span>
        </div>
      }

      {/* Resumo: o valor do mês é o protagonista */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">
                {previa ?
                `Fatura em formação — ${formatarCompetencia(previa.competencia)}` :
                'Fatura em formação'}
              </p>
              <p className="text-4xl font-semibold text-gray-900 mt-1 tabular-nums">
                {previa ? formatarMoeda(previa.valorTotal) : '—'}
              </p>
              {previa?.parcial &&
              <p className="text-xs text-gray-500 mt-1">
                  Parcial — SMS e espaço de documentos ainda podem variar até o
                  fechamento.
                </p>
              }
            </div>
            {faturaAPagar ?
            <Button onClick={() => setFaturaSelecionada(faturaAPagar)}>
                Pagar {formatarMoeda(faturaAPagar.valorTotal)}
              </Button> :

            <Button
              onClick={handleFechar}
              disabled={fechando || !previa || previa.valorTotal <= 0}>
              
                {fechando ? 'Fechando...' : 'Fechar e pagar'}
              </Button>
            }
          </div>
          {pendentes.length > 0 &&
          <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100">
              Pendente: <strong>{formatarMoeda(totalEmAberto)}</strong>
              {faturaAPagar && ` · vence em ${formatarData(faturaAPagar.vencimento)}`}
              {pendentes.some((f) => f.status === 'em_analise') &&
            ' · há pagamento informado em análise'}
            </p>
          }
        </Card>

        <Card>
          <p className="text-sm text-gray-500">Plano</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">
            {plano?.encontrado ? plano.nome : 'Não definido'}
          </p>
          {previa?.valorMensalContratado != null ?
          <p className="text-xs text-gray-500 mt-1">
              Valor contratado: {formatarMoeda(previa.valorMensalContratado)}/mês
            </p> :
          plano?.encontrado ?
          <p className="text-xs text-gray-500 mt-1">
              {plano.preco > 0 ? `${formatarMoeda(plano.preco)}/mês` : 'Sem mensalidade'}
            </p> :
          null}
          <ul className="text-xs text-gray-600 mt-3 space-y-1">
            {plano?.limitePacientes ? <li>Até {plano.limitePacientes} pacientes</li> : null}
            {limites?.usuarios ? <li>Até {limites.usuarios} usuários</li> : null}
            {limites?.armazenamentoGb ?
            <li>
                {(previa?.armazenamentoGb ?? 0).toLocaleString('pt-BR')} de{' '}
                {limites.armazenamentoGb} GB de documentos usados
              </li> :

            <li>
                {(previa?.armazenamentoGb ?? 0).toLocaleString('pt-BR')} GB de
                documentos armazenados
              </li>
            }
            {limites?.sms === false && <li>SMS não incluído</li>}
          </ul>
        </Card>
      </section>

      {plano?.encontrado && plano.preco <= 0 && !planoTrocado &&
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm text-teal-900">
            Você está no plano <strong>{plano.nome}</strong>
            {plano.limitePacientes ? `, com até ${plano.limitePacientes} pacientes` : ''}
            {limites?.usuarios ? ` e ${limites.usuarios} usuários` : ''}. Ao atingir o
            limite, novos cadastros ficam bloqueados até a troca de plano.
          </p>
          <Button
          size="sm"
          onClick={() =>
          document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' })
          }>
          
            Ver planos
          </Button>
        </div>
      }

      {planoTrocado &&
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
        
          <p className="text-sm text-green-900">
            Plano alterado para <strong>{planoTrocado.nome}</strong>. Os novos limites
            já valem.
            {planoTrocado.preco > 0 &&
          ` A mensalidade de ${formatarMoeda(planoTrocado.preco)} entra na fatura do mês.`}
          </p>
          {planoTrocado.preco > 0 && (
        faturaAPagar ?
        <Button size="sm" onClick={() => setFaturaSelecionada(faturaAPagar)}>
                Pagar {formatarMoeda(faturaAPagar.valorTotal)}
              </Button> :

        <Button size="sm" onClick={handleFechar} disabled={fechando}>
                {fechando ? 'Fechando...' : 'Pagar agora'}
              </Button>)
        }
        </div>
      }

      {acaoErro &&
      <div
        role="alert"
        className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        
          {acaoErro}
        </div>
      }

      <EscolhaPlanoSecao
        clinicaId={clinicaId}
        usuarioId={sessao?.usuario?.id}
        podeGerenciar={podeGerenciar}
        onPlanoAlterado={(novo) => {
          setPlanoTrocado(novo);
          recarregar();
          document.
          getElementById('topo-assinatura')?.
          scrollIntoView({ behavior: 'smooth' });
        }} />
      

      {/* Composição da fatura do mês */}
      <Card
        title={
        previa ?
        `Composição — ${formatarCompetencia(previa.competencia)}` :
        'Composição da fatura'
        }
        noPadding>
        
        {carregando && !previa ?
        <p className="p-6 text-sm text-gray-500">Carregando...</p> :
        !previa?.itens.length ?
        <p className="p-6 text-sm text-gray-500">
            Nenhum item a cobrar nesta competência.
          </p> :

        <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-6 py-3">Serviço</th>
                  <th className="text-right font-medium px-6 py-3">Consumo</th>
                  <th className="text-right font-medium px-6 py-3">
                    Valor unitário
                  </th>
                  <th className="text-right font-medium px-6 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previa.itens.map((item) => {
                const meta = SERVICOS_ASSINATURA.find(
                  (s) => s.id === item.servico
                );
                return (
                  <tr key={item.servico}>
                      <td className="px-6 py-3">
                        <span className="block font-medium text-gray-900">
                          {item.nome}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {meta?.descricao}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-gray-700 whitespace-nowrap">
                        {item.modelo === 'mensal' ?
                      'Mensal' :

                      <>
                            {formatarQuantidadeUso(item)}
                            {item.quantidadeCobravel !== item.quantidade &&
                        <span className="block text-xs text-gray-500">
                                {item.servico === 'armazenamento' ?
                          `${item.quantidadeCobravel.toLocaleString('pt-BR')} GB cobráveis` :
                          `${item.quantidadeCobravel} cobráveis`}
                              </span>
                        }
                          </>
                      }
                      </td>
                      <td className="px-6 py-3 text-right text-gray-700">
                        {formatarMoeda(item.valorUnitario)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900 tabular-nums">
                        {formatarMoeda(item.valor)}
                      </td>
                    </tr>);

              })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-6 py-3 text-right font-medium">
                    Total do mês
                  </td>
                  <td className="px-6 py-3 text-right text-lg font-semibold text-gray-900 tabular-nums">
                    {formatarMoeda(previa.valorTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        }
      </Card>

      {/* Histórico de faturas */}
      <Card title="Faturas" noPadding>
        {!faturas.length ?
        <p className="p-6 text-sm text-gray-500">
            Nenhuma fatura fechada ainda.
          </p> :

        <ul className="divide-y divide-gray-100">
            {faturas.map((fatura) =>
          <li
            key={fatura.id}
            className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            
                <div className="flex items-start gap-3 min-w-0">
                  <FileTextIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {formatarCompetencia(fatura.competencia)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Vencimento {formatarData(fatura.vencimento)}
                      {fatura.pagoEm &&
                  ` · Paga em ${new Date(fatura.pagoEm).toLocaleDateString('pt-BR')}`}
                      {fatura.status === 'em_analise' &&
                  ' · aguardando conferência do pagamento'}
                    </p>
                    {fatura.nfse?.status === 'autorizada' && fatura.nfse.link ?
                <a
                  href={fatura.nfse.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline mt-0.5">
                  
                        NFS-e nº {fatura.nfse.numero}
                        <ExternalLinkIcon className="w-3 h-3" />
                      </a> :
                fatura.nfse && fatura.nfse.status !== 'autorizada' ?
                <p className="text-xs text-gray-500 mt-0.5">
                        {ROTULO_STATUS_NFSE[fatura.nfse.status]}
                      </p> :
                null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${ESTILO_STATUS_FATURA[fatura.status]}`}>
                
                    {ROTULO_STATUS_FATURA[fatura.status]}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatarMoeda(fatura.valorTotal)}
                  </span>
                  {fatura.status === 'paga' ?
              <CheckCircle2Icon
                className="w-5 h-5 text-green-500"
                aria-label="Fatura paga" /> :

              fatura.status === 'em_analise' ? null :
              <Button size="sm" onClick={() => setFaturaSelecionada(fatura)}>
                      Pagar
                    </Button>
              }
                </div>
              </li>
          )}
          </ul>
        }
      </Card>

      {/* Serviços — o que está sendo cobrado e por quê */}
      <Card title="Serviços e ativação" noPadding>
        <ul className="divide-y divide-gray-100">
          {SERVICOS_ASSINATURA.map((meta) => {
            const config = servicos.find((s) => s.servico === meta.id);
            const contratado = config?.contratado ?? false;
            const habilitado = config?.habilitado;
            const cobrando = config?.ativo ?? false;
            return (
              <li
                key={meta.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{meta.nome}</p>
                  <p className="text-xs text-gray-500">
                    {meta.modelo === 'mensal' ?
                    `Mensal · ${formatarMoeda(config?.valorMensal || 0)}` :
                    `Por ${meta.unidade} · ${formatarMoeda(config?.valorUnitario || 0)}${
                    config?.franquia ?
                    ` · franquia ${config.franquia}${meta.id === 'armazenamento' ? ' GB' : ''}` :
                    ''}`
                    }
                    {config?.origemValor === 'contrato' && ' · valor contratado'}
                  </p>
                  {config?.semPlano ?
                  <p className="text-xs text-amber-700 mt-0.5">
                      Nenhum plano válido definido para esta clínica — fale com o
                      suporte para regularizar a mensalidade.
                    </p> :
                  habilitado === false ?
                  <p className="text-xs text-gray-500 mt-0.5">
                      Desativado na configuração do serviço — não é cobrado
                      enquanto estiver desligado.
                    </p> :
                  habilitado === null && !contratado ?
                  <p className="text-xs text-gray-500 mt-0.5">
                      Não contratado — não entra na fatura.
                    </p> :
                  null}
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                  cobrando ?
                  'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-600'}`
                  }>
                  
                  {cobrando ? 'Ativo' : 'Inativo'}
                </span>
              </li>);

          })}
        </ul>
      </Card>

      <PagamentoAssinaturaModal
        isOpen={Boolean(faturaSelecionada)}
        onClose={() => setFaturaSelecionada(null)}
        fatura={faturaSelecionada}
        recebedor={recebedor}
        mercadoPagoAtivo={mercadoPagoAtivo}
        gerarPix={gerarPix}
        abrirCheckout={abrirCheckout}
        verificarPagamento={verificarPagamento}
        informarPagamento={informarPagamento} />
      
    </main>);

}