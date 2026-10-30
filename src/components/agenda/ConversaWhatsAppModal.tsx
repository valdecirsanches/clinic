import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XIcon, SendIcon, Loader2, AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { enviarWhatsappMetaApi } from '../../utils/whatsappMetaApi';

interface Mensagem {
  id: string;
  pacienteId: string;
  pacienteNome?: string;
  tipo: 'enviada' | 'recebida';
  conteudo: string;
  dataHora: string;
  status?: string;
  erro?: string;
}

interface ConversaWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone?: string;
}

/**
 * Conversa livre pelo número OFICIAL (Meta) direto da agenda.
 *
 * Por que existe: a Meta proíbe botão de link para wa.me nos templates, então
 * "Falar conosco" não tira o paciente do número oficial — a conversa continua
 * ali mesmo. A recepção precisava de um lugar para ler e responder sem sair da
 * agenda; antes isso só existia na tela de Mensagens.
 *
 * Regra da plataforma: texto livre só é entregue dentro de 24h após a última
 * mensagem do paciente. O modal mostra esse prazo em vez de deixar a recepção
 * escrever e descobrir depois que não chegou.
 */
export function ConversaWhatsAppModal({
  isOpen,
  onClose,
  clinicaId,
  pacienteId,
  pacienteNome,
  pacienteTelefone
}: ConversaWhatsAppModalProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  // Só rolamos para o fim quando a recepção JÁ está no fim da conversa. Quem
  // subiu para reler o diálogo não pode ser puxado de volta a cada refresh.
  const coladoNoFimRef = useRef(true);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!clinicaId || !pacienteId) return;
      if (!silencioso) setCarregando(true);
      try {
        // Pede ao servidor APENAS a conversa deste paciente (e só o trecho
        // recente). Antes baixava o histórico inteiro da clínica a cada 15s e
        // descartava quase tudo no navegador.
        const resp = await fetch(
          `${API_BASE_URL}/api/mensagens?clinicaId=${encodeURIComponent(clinicaId)}&pacienteId=${encodeURIComponent(pacienteId)}&limit=100`
        );
        if (!resp.ok) throw new Error('Não foi possível carregar a conversa.');
        const data = await resp.json();
        const daPessoa: Mensagem[] = Array.isArray(data) ?
        data.filter((m: Mensagem) => m.pacienteId === pacienteId) :
        [];
        daPessoa.sort(
          (a, b) =>
          new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()
        );
        setMensagens(daPessoa);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar a conversa.');
      } finally {
        setCarregando(false);
      }
    },
    [clinicaId, pacienteId]
  );

  // Troca de paciente: limpa a conversa anterior IMEDIATAMENTE. Sem isso, o
  // modal abria mostrando o diálogo do último paciente até a nova carga chegar.
  useEffect(() => {
    setMensagens([]);
    setTexto('');
    setErro(null);
  }, [pacienteId]);

  useEffect(() => {
    if (!isOpen) return;
    setErro(null);
    carregar();
    // Recarrega enquanto o modal está aberto para a recepção ver a resposta
    // do paciente chegar sem precisar fechar e abrir.
    const timer = window.setInterval(() => carregar(true), 15000);
    return () => window.clearInterval(timer);
  }, [isOpen, carregar]);

  useEffect(() => {
    if (!isOpen) return;
    if (!coladoNoFimRef.current) return;
    fimDaListaRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, isOpen]);

  // Ao reabrir o modal, começa no fim (mensagem mais recente).
  useEffect(() => {
    if (isOpen) coladoNoFimRef.current = true;
  }, [isOpen]);

  const handleScroll = () => {
    const el = listaRef.current;
    if (!el) return;
    const distanciaDoFim = el.scrollHeight - el.scrollTop - el.clientHeight;
    coladoNoFimRef.current = distanciaDoFim < 60;
  };

  /**
   * Janela de 24h da Meta, contada a partir da ÚLTIMA mensagem RECEBIDA.
   * Fora dela, só template é entregue — texto livre é recusado.
   */
  const janela = useMemo(() => {
    const recebidas = mensagens.filter((m) => m.tipo === 'recebida');
    const ultima = recebidas[recebidas.length - 1];
    if (!ultima) return { aberta: false, restanteHoras: 0 };
    const decorridoMs = Date.now() - new Date(ultima.dataHora).getTime();
    const restanteMs = 24 * 60 * 60 * 1000 - decorridoMs;
    return {
      aberta: restanteMs > 0,
      restanteHoras: Math.max(0, Math.floor(restanteMs / (60 * 60 * 1000)))
    };
  }, [mensagens]);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      // Canal: WAHA quando a clínica tem sessão conectada (não tem janela de
      // 24h); caso contrário, número oficial da Meta.
      let enviadoPeloWaha = false;
      try {
        const respCfg = await fetch(
          `${API_BASE_URL}/api/whatsapp-config?clinicaId=${encodeURIComponent(clinicaId)}`
        );
        const cfg = respCfg.ok ? await respCfg.json() : null;
        if (cfg?.serverUrl && cfg?.sessionName) {
          const envioWaha = await fetch(
            `${API_BASE_URL}/api/whatsapp/send-message`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serverUrl: cfg.serverUrl,
                sessionName: cfg.sessionName,
                number: (pacienteTelefone || '').replace(/\D/g, ''),
                message: conteudo,
                clinicaId,
                pacienteId,
                pacienteNome
              })
            }
          );
          enviadoPeloWaha = envioWaha.ok;
        }
      } catch {
        enviadoPeloWaha = false;
      }

      if (!enviadoPeloWaha) {
        const resultado = await enviarWhatsappMetaApi({
          clinicaId,
          telefone: pacienteTelefone || '',
          mensagem: conteudo,
          pacienteId,
          pacienteNome
        });
        if (!resultado.success) {
          throw new Error(
            resultado.error ||
            'A mensagem não foi entregue. Texto livre só é aceito até 24h após a última mensagem do paciente.'
          );
        }
      }
      setTexto('');
      await carregar(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar a mensagem.');
    } finally {
      setEnviando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${pacienteNome}`}>
      
      <div className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {pacienteNome}
            </h2>
            <p className="truncate text-xs text-gray-500">
              {pacienteTelefone || 'Sem telefone cadastrado'} · WhatsApp oficial
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => carregar()}
              title="Atualizar conversa"
              className="rounded p-2 text-gray-500 transition-colors hover:bg-gray-100">
              
              <RefreshCwIcon className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              title="Fechar"
              className="rounded p-2 text-gray-500 transition-colors hover:bg-gray-100">
              
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          ref={listaRef}
          onScroll={handleScroll}
          className="flex-1 space-y-2 overflow-y-auto bg-gray-50 px-5 py-4">
          
          {carregando && mensagens.length === 0 ?
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando conversa...
            </div> :
          mensagens.length === 0 ?
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-gray-500">
              Nenhuma mensagem trocada com este paciente ainda.
            </div> :

          mensagens.map((msg) =>
          <div
            key={msg.id}
            className={`flex ${msg.tipo === 'enviada' ? 'justify-end' : 'justify-start'}`}>
            
                <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              msg.tipo === 'enviada' ?
              'bg-green-600 text-white' :
              'border border-gray-200 bg-white text-gray-800'}`
              }>
              
                  <p className="whitespace-pre-wrap break-words">
                    {msg.conteudo}
                  </p>
                  <p
                className={`mt-1 text-[11px] ${msg.tipo === 'enviada' ? 'text-green-100' : 'text-gray-400'}`}>
                
                    {new Date(msg.dataHora).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                  </p>
                </div>
              </div>
          )
          }
          <div ref={fimDaListaRef} />
        </div>

        <footer className="border-t border-gray-200 px-5 py-3">
          {!janela.aberta &&
          <div className="mb-2 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangleIcon className="mt-px h-4 w-4 flex-shrink-0" />
              <span>
                A janela de 24 horas está fechada. O WhatsApp só entrega texto
                livre até 24h após a última mensagem do paciente — envie um
                lembrete ou pedido de confirmação para que ele responda e a
                conversa reabra.
              </span>
            </div>
          }
          {janela.aberta &&
          <p className="mb-2 text-xs text-gray-500">
              Conversa aberta — restam cerca de {janela.restanteHoras}h para
              responder livremente.
            </p>
          }
          {erro &&
          <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {erro}
            </div>
          }
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={2}
              placeholder="Escreva a resposta da clínica..."
              aria-label="Mensagem para o paciente"
              className="flex-1 resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
            
            <button
              onClick={enviar}
              disabled={!texto.trim() || enviando}
              className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300">
              
              {enviando ?
              <Loader2 className="h-4 w-4 animate-spin" /> :

              <SendIcon className="h-4 w-4" />
              }
              Enviar
            </button>
          </div>
        </footer>
      </div>
    </div>);

}