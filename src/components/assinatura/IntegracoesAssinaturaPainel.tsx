import React, { useEffect, useState } from 'react';
import { CheckCircle2Icon, AlertCircleIcon as CircleAlertIcon, CopyIcon, LoaderIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ConfigGestao, useAssinaturaGestao } from '../../hooks/useAssinaturaGestao';

interface Props {
  api: ReturnType<typeof useAssinaturaGestao>;
}

function Linha({ rotulo, valor }: {rotulo: string;valor: React.ReactNode;}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-2 text-sm">
      <dt className="text-gray-500">{rotulo}</dt>
      <dd className="text-gray-900 break-all">{valor}</dd>
    </div>);

}

function Estado({ ok, texto }: {ok: boolean;texto: string;}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ok ? 'text-green-700' : 'text-amber-700'}`}>
      {ok ? <CheckCircle2Icon className="w-4 h-4" /> : <CircleAlertIcon className="w-4 h-4" />}
      {texto}
    </span>);

}

/** Somente leitura: a configuração fixa vive no server/.env.local */
export function IntegracoesAssinaturaPainel({ api }: Props) {
  const [config, setConfig] = useState<ConfigGestao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState<'mp' | 'nfse' | null>(null);
  const [resultado, setResultado] = useState<{mp?: string;nfse?: string;}>({});

  useEffect(() => {
    api.carregarConfig().then(setConfig).catch((e: Error) => setErro(e.message));
  }, [api]);

  const testar = async (alvo: 'mp' | 'nfse') => {
    setTestando(alvo);
    try {
      if (alvo === 'mp') {
        const r = await api.testarMercadoPago();
        setResultado((s) => ({ ...s, mp: `✓ Conta ${r.conta.apelido} (${r.conta.email}) · ${r.conta.ambiente}` }));
      } else {
        const r = await api.testarNfse();
        setResultado((s) => ({ ...s, nfse: `✓ Conectado em ${r.ambiente} · ${r.totalNotas} nota(s) na API` }));
      }
    } catch (e: any) {
      setResultado((s) => ({ ...s, [alvo]: `✗ ${e.message}` }));
    } finally {
      setTestando(null);
    }
  };

  if (erro) return <p role="alert" className="text-sm text-red-700">{erro}</p>;
  if (!config) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <LoaderIcon className="w-4 h-4 animate-spin" /> Carregando...
      </p>);

  }

  const { mercadoPago: mp, nfse } = config;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Mercado Pago</h2>
          <Estado ok={mp.configurado} texto={mp.configurado ? `Ativo · ${mp.ambiente}` : 'Não configurado'} />
        </div>
        <dl className="mt-3 divide-y divide-gray-100">
          <Linha rotulo="Access Token" valor={mp.accessToken || 'MERCADOPAGO_ACCESS_TOKEN não definido'} />
          <Linha rotulo="E-mail do pagador padrão" valor={mp.payerEmail || '—'} />
          <Linha rotulo="Validade do PIX" valor={`${mp.validadePixMin} min`} />
          <Linha
            rotulo="Webhook (Pagamentos)"
            valor={
            <span className="flex items-start gap-2">
                <code className="text-xs">{mp.urlWebhook}</code>
                <button
                type="button"
                onClick={() => navigator.clipboard.writeText(mp.urlWebhook)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Copiar URL do webhook">
                
                  <CopyIcon className="w-4 h-4" />
                </button>
              </span>
            } />
          
        </dl>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="secondary" disabled={!mp.configurado || testando !== null} onClick={() => testar('mp')}>
            {testando === 'mp' ? 'Testando...' : 'Testar credencial'}
          </Button>
          {resultado.mp && <span className="text-sm text-gray-700">{resultado.mp}</span>}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">NFS-e</h2>
          <Estado
            ok={nfse.configurado}
            texto={nfse.configurado ? nfse.ambiente === 'producao' ? 'Produção' : 'Homologação' : 'Não configurada'} />
          
        </div>
        <dl className="mt-3 divide-y divide-gray-100">
          <Linha rotulo="API" valor={nfse.url} />
          <Linha rotulo="Ambiente ativo" valor={nfse.ambiente === 'producao' ? 'Produção' : 'Homologação'} />
          <Linha rotulo="Token homologação" valor={nfse.porAmbiente.homologacao?.token || 'não definido'} />
          <Linha rotulo="Token produção" valor={nfse.porAmbiente.producao?.token || 'não definido'} />
          <Linha rotulo="Emitir ao pagar" valor={nfse.emitirAoPagar ? 'Sim' : 'Não'} />
          <Linha rotulo="Código de serviço" valor={nfse.codigoServico || 'padrão da API'} />
          <Linha rotulo="Alíquota ISS" valor={nfse.aliquotaIss != null ? `${nfse.aliquotaIss}%` : 'padrão da API'} />
          <Linha rotulo="Discriminação" valor={nfse.discriminacao} />
        </dl>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="secondary" disabled={!nfse.configurado || testando !== null} onClick={() => testar('nfse')}>
            {testando === 'nfse' ? 'Testando...' : 'Testar conexão'}
          </Button>
          {resultado.nfse && <span className="text-sm text-gray-700">{resultado.nfse}</span>}
        </div>
      </section>

      <p className="xl:col-span-2 text-xs text-gray-500">
        Estes valores são fixos no <code>server/.env.local</code> (veja <code>.env.example</code>). Para alterar,
        edite o arquivo e reinicie o backend.
      </p>
    </div>);

}