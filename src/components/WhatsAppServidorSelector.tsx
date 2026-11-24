/**
 * Servidor do WhatsApp da clínica: WAHA (padrão) ou Evolution API.
 *
 * Só o administrador da clínica ou o super administrador troca. O servidor da
 * Evolution vem do .env do servidor (EVOLUTION_URL / EVOLUTION_API_KEY) e a
 * instância usa o nome da sessão da clínica. Ao trocar, a sessão precisa ser
 * conectada de novo (QR Code) no servidor escolhido.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangleIcon, Loader2Icon, ServerIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { Swal } from './ui/SweetAlert';

export type ServidorWhatsapp = 'waha' | 'evolution';

export const nomeDoServidorWhatsapp = (s: ServidorWhatsapp) =>
s === 'evolution' ? 'Evolution API' : 'WAHA';

interface InfoServidor {
  servidor: ServidorWhatsapp;
  evolutionDisponivel: boolean;
  evolutionHost: string;
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

const OPCOES: Array<{valor: ServidorWhatsapp;titulo: string;descricao: string;}> = [
{ valor: 'waha', titulo: 'WAHA', descricao: 'Servidor padrão da plataforma.' },
{ valor: 'evolution', titulo: 'Evolution API', descricao: 'Alternativa ao WAHA, com o mesmo funcionamento para a clínica.' }];


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
      const servidor: ServidorWhatsapp = d.servidor === 'evolution' ? 'evolution' : 'waha';
      setInfo({
        servidor,
        evolutionDisponivel: Boolean(d.evolutionDisponivel),
        evolutionHost: String(d.evolutionHost || ''),
        podeTrocar: Boolean(d.podeTrocar),
        webhookNoEnv: Boolean(d.webhookNoEnv),
        webhookVariavel: String(d.webhookVariavel || 'WAHA_WEBHOOK_URL')
      });
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
    const nome = nomeDoServidorWhatsapp(servidor);
    // confirmação no visual do app (sem o alert do navegador)
    const resposta = await Swal.fire({
      icon: 'question',
      title: `Passar para o ${nome}?`,
      text: `Depois será preciso conectar a sessão de novo (QR Code) no ${nome}. As mensagens deixam de sair pelo servidor atual; a configuração anterior fica guardada.`,
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
        signal: AbortSignal.timeout(20000)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível trocar o servidor do WhatsApp.');
      setInfo((atual) => atual ? { ...atual, servidor } : atual);
      carregar();
      setAviso(`Pronto: o WhatsApp desta clínica agora usa o ${nome}. Confira a sessão abaixo e, se preciso, conecte pelo QR Code.`);
      onServidorChange?.(servidor);
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

  // Como no Fácil: só o super administrador e o administrador da clínica veem a escolha
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
            Escolha por qual servidor esta clínica envia e recebe as mensagens.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Servidor do WhatsApp">
              {OPCOES.map((op) => {
              const ativo = info.servidor === op.valor;
              const indisponivel = op.valor === 'evolution' && !info.evolutionDisponivel;
              const desabilitado = indisponivel || Boolean(trocando);
              return (
                <button
                  key={op.valor}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={desabilitado && !ativo}
                  onClick={() => trocar(op.valor)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  ativo ?
                  'border-green-500 bg-green-50 ring-1 ring-green-500' :
                  desabilitado ?
                  'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60' :
                  'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/40'}`
                  }>

                    <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <span
                      className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${
                      ativo ? 'border-green-600 bg-green-600' : 'border-gray-300 bg-white'}`
                      } />

                      {op.titulo}
                      {trocando === op.valor && <Loader2Icon className="h-3.5 w-3.5 animate-spin text-gray-500" />}
                    </span>
                    <span className="mt-1 block text-xs text-gray-600">
                      {indisponivel ?
                    'Indisponível: falta EVOLUTION_URL e EVOLUTION_API_KEY no .env.local do servidor (reinicie a API depois).' :
                    op.valor === 'evolution' && info.evolutionHost ?
                    `${op.descricao} (${info.evolutionHost})` :
                    op.descricao}
                    </span>
                  </button>);

            })}
          </div>

          {info.webhookNoEnv ?
          <p className="mt-3 text-xs text-gray-500">
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
