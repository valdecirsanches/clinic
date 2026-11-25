/**
 * Servidor do WhatsApp da clínica: WAHA WEBJS (padrão), WAHA GOWS ou Evolution API.
 *
 * Só o administrador da clínica ou o super administrador vê e troca. Os
 * endereços vêm do .env.local do servidor (WAHA_URL / WAHA_GOWS_URL /
 * EVOLUTION_URL). Ao trocar, a sessão é preparada no servidor escolhido (criada
 * se não existir) e basta ler o QR Code.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangleIcon, InfoIcon, Loader2Icon, ServerIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { Swal } from './ui/SweetAlert';

export type ServidorWhatsapp = 'waha' | 'waha_gows' | 'evolution';

/** o que cada conexão é e quando usar (o texto que o usuário lê) */
const OPCOES_INFO: Record<ServidorWhatsapp, {nome: string;resumo: string;quandoUsar: string;selo?: string;}> = {
  waha: {
    nome: 'WAHA WEBJS',
    selo: 'Recomendado',
    resumo: 'Funciona como o WhatsApp Web aberto num navegador dentro do servidor. É a conexão mais testada e compatível.',
    quandoUsar: 'Use no dia a dia. Gasta mais memória e pode levar um pouco mais para conectar.'
  },
  waha_gows: {
    nome: 'WAHA GOWS',
    resumo: 'Conecta direto ao WhatsApp, sem navegador. É mais leve e rápida, e o servidor aguenta mais clínicas ao mesmo tempo.',
    quandoUsar: 'Use se o WEBJS ficar lento, cair com frequência ou demorar para conectar.'
  },
  evolution: {
    nome: 'Evolution API',
    resumo: 'Outro servidor de WhatsApp, separado do WAHA. Para a clínica tudo funciona igual: lembretes, confirmações e respostas.',
    quandoUsar: 'Use como reserva quando o WAHA estiver fora do ar ou com problemas.'
  }
};

export const nomeDoServidorWhatsapp = (s: ServidorWhatsapp) => (OPCOES_INFO[s] || OPCOES_INFO.waha).nome;

const normaliza = (v: unknown): ServidorWhatsapp =>
v === 'evolution' ? 'evolution' : v === 'waha_gows' ? 'waha_gows' : 'waha';

interface Opcao {
  valor: ServidorWhatsapp;
  disponivel: boolean;
  host: string;
}

interface InfoServidor {
  servidor: ServidorWhatsapp;
  opcoes: Opcao[];
  podeTrocar: boolean;
  /** a URL do webhook está no .env.local (senão as respostas dos pacientes não são ligadas) */
  webhookNoEnv: boolean;
  webhookVariavel: string;
}

interface Props {
  clinicaId: string;
  /** chamado ao carregar e depois de cada troca */
  onServidorChange?: (servidor: ServidorWhatsapp) => void;
}

const VARIAVEL: Record<ServidorWhatsapp, string> = {
  waha: 'WAHA_URL',
  waha_gows: 'WAHA_GOWS_URL',
  evolution: 'EVOLUTION_URL e EVOLUTION_API_KEY'
};

export function WhatsAppServidorSelector({ clinicaId, onServidorChange }: Props) {
  const [info, setInfo] = useState<InfoServidor | null>(null);
  const [trocando, setTrocando] = useState<ServidorWhatsapp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/whatsapp/servidor?clinicaId=${encodeURIComponent(clinicaId)}`, {
        signal: AbortSignal.timeout(15000)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não foi possível ler o servidor do WhatsApp.');
      const servidor = normaliza(d.servidor);
      const opcoes: Opcao[] = Array.isArray(d.opcoes) ?
      d.opcoes.map((o: any) => ({ valor: normaliza(o.valor), disponivel: Boolean(o.disponivel), host: String(o.host || '') })) :
      [
      { valor: 'waha', disponivel: true, host: '' },
      { valor: 'evolution', disponivel: Boolean(d.evolutionDisponivel), host: String(d.evolutionHost || '') }];

      setInfo({
        servidor,
        opcoes,
        podeTrocar: Boolean(d.podeTrocar),
        webhookNoEnv: Boolean(d.webhookNoEnv),
        webhookVariavel: String(d.webhookVariavel || 'WAHA_WEBHOOK_URL')
      });
      setErro(null);
      onServidorChange?.(servidor);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o servidor do WhatsApp.');
    }
  }, [clinicaId, onServidorChange]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const trocar = async (servidor: ServidorWhatsapp) => {
    if (!info || servidor === info.servidor || trocando) return;
    const { nome, quandoUsar } = OPCOES_INFO[servidor];
    // confirmação no visual do app (sem o alert do navegador)
    const resposta = await Swal.fire({
      icon: 'question',
      title: `Passar para o ${nome}?`,
      text: `${quandoUsar} A sessão desta clínica é preparada no ${nome} (criada se ainda não existir) e depois basta ler o QR Code com o celular da clínica. As mensagens deixam de sair pelo servidor atual; a configuração anterior fica guardada para voltar.`,
      showCancelButton: true,
      confirmButtonText: 'Trocar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280'
    });
    if (!resposta.isConfirmed) return;
    setTrocando(servidor);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/whatsapp/servidor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicaId, servidor }),
        // a troca já prepara a sessão no servidor novo: pode levar alguns segundos
        signal: AbortSignal.timeout(60000)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível trocar o servidor do WhatsApp.');
      setInfo((atual) => atual ? { ...atual, servidor } : atual);
      setAviso(
        d.sessao?.erro ?
        `O WhatsApp desta clínica agora usa o ${nome}, mas a sessão não foi preparada: ${d.sessao.erro}` :
        d.sessao?.criada ?
        `Pronto: sessão criada no ${nome}. Leia o QR Code abaixo com o WhatsApp da clínica.` :
        `Pronto: o WhatsApp desta clínica agora usa o ${nome}. Confira a sessão abaixo e, se preciso, leia o QR Code.`
      );
      await carregar();
      window.dispatchEvent(new Event('whatsapp-config-updated'));
    } catch (e) {
      setErro(
        e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ?
        'O servidor demorou para responder. Tente de novo em instantes.' :
        e instanceof Error ? e.message : 'Não foi possível trocar o servidor do WhatsApp.'
      );
    } finally {
      setTrocando(null);
    }
  };

  // Só o super administrador e o administrador da clínica veem a escolha
  if (!clinicaId || !info?.podeTrocar) return null;

  return (
    <section className="rounded-xl border border-gray-200 p-4" aria-labelledby="whatsapp-servidor-title">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
          <ServerIcon className="h-4 w-4 text-gray-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="whatsapp-servidor-title" className="text-sm font-semibold text-gray-900">
            Servidor do WhatsApp
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            É o "motor" que liga o WhatsApp da clínica ao sistema: por ele saem os lembretes e confirmações e
            chegam as respostas dos pacientes. Só um fica ativo por vez.
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Servidor do WhatsApp">
            {info.opcoes.map((op) => {
              const dados = OPCOES_INFO[op.valor];
              const ativo = info.servidor === op.valor;
              const indisponivel = !op.disponivel;
              const desabilitado = indisponivel || Boolean(trocando);
              return (
                <button
                  key={op.valor}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={desabilitado && !ativo}
                  onClick={() => trocar(op.valor)}
                  className={`flex flex-col rounded-lg border px-3 py-3 text-left transition-colors ${
                  ativo ?
                  'border-green-500 bg-green-50 ring-1 ring-green-500' :
                  desabilitado ?
                  'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60' :
                  'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/40'}`
                  }>

                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span
                      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      ativo ? 'border-green-600 bg-green-600' : 'border-gray-300 bg-white'}`
                      } />

                    {dados.nome}
                    {dados.selo &&
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                        {dados.selo}
                      </span>
                    }
                    {ativo &&
                    <span className="ml-auto rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        Em uso
                      </span>
                    }
                    {trocando === op.valor && <Loader2Icon className="ml-auto h-3.5 w-3.5 animate-spin text-gray-500" />}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-gray-700">{dados.resumo}</span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-gray-500">
                    <strong className="font-medium text-gray-700">Quando usar: </strong>
                    {dados.quandoUsar}
                  </span>
                  {indisponivel ?
                  <span className="mt-2 block text-[11px] text-amber-700">
                      Indisponível: falta {VARIAVEL[op.valor]} no .env.local do servidor (reinicie a API depois).
                    </span> :
                  op.host &&
                  <span className="mt-2 block font-mono text-[11px] text-gray-400">{op.host}</span>
                  }
                </button>);

            })}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Ao trocar, a sessão é criada no servidor escolhido e é preciso ler o QR Code de novo com o celular da
            clínica. O número de WhatsApp continua o mesmo.
          </p>

          {info.webhookNoEnv ?
          <p className="mt-2 text-xs text-gray-500">
              Webhook das respostas dos pacientes: automático (URL no .env.local do servidor).
            </p> :

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                <strong>Webhook não configurado.</strong> As respostas dos pacientes (confirmar ou cancelar
                consulta) podem não chegar. Coloque <code className="font-mono">{info.webhookVariavel}</code> no
                .env.local do servidor (ex.: https://sua-api/api/webhook/whatsapp) e reinicie a API; o webhook
                passa a ser gravado sozinho.
              </p>
            </div>
          }

          {aviso && <p className="mt-3 text-xs text-green-700" role="status">{aviso}</p>}
          {erro && <p className="mt-3 text-xs text-red-600" role="alert">{erro}</p>}
        </div>
      </div>
    </section>);

}
