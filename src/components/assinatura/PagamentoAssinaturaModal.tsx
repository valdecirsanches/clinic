import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BanknoteIcon,
  BuildingIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  LoaderIcon,
  QrCodeIcon } from
'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { gerarPixCopiaECola } from '../../utils/pixPayload';
import { gerarQrCodeDataUrl } from '../../utils/qrCode';
import {
  FORMAS_PAGAMENTO_ASSINATURA,
  formatarMoeda,
  type FaturaAssinatura,
  type FormaPagamentoAssinatura } from
'../../types/assinatura';
import type { PixMercadoPago } from '../../hooks/useAssinatura';

interface Recebedor {
  chavePix: string;
  nome: string;
  cidade: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  titular?: string;
  cnpj?: string;
}

interface PagamentoAssinaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  fatura: FaturaAssinatura | null;
  recebedor: Recebedor;
  mercadoPagoAtivo: boolean;
  gerarPix: (faturaId: string) => Promise<PixMercadoPago>;
  abrirCheckout: (faturaId: string) => Promise<string>;
  verificarPagamento: (faturaId: string) => Promise<boolean>;
  informarPagamento: (
  faturaId: string,
  forma: FormaPagamentoAssinatura)
  => Promise<unknown>;
}

const ICONES: Record<FormaPagamentoAssinatura, React.ElementType> = {
  pix: QrCodeIcon,
  boleto: BanknoteIcon,
  cartao_credito: CreditCardIcon,
  transferencia: BuildingIcon
};

const INTERVALO_VERIFICACAO = 5000;

export function PagamentoAssinaturaModal({
  isOpen,
  onClose,
  fatura,
  recebedor,
  mercadoPagoAtivo,
  gerarPix,
  abrirCheckout,
  verificarPagamento,
  informarPagamento
}: PagamentoAssinaturaModalProps) {
  const [forma, setForma] = useState<FormaPagamentoAssinatura>('pix');
  const [pix, setPix] = useState<PixMercadoPago | null>(null);
  const [qrEstatico, setQrEstatico] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pago, setPago] = useState(false);
  const [informado, setInformado] = useState(false);
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const verificandoRef = useRef(false);

  const faturaId = fatura?.id;

  // PIX estático: só quando o Mercado Pago não está configurado
  const codigoPixEstatico = useMemo(() => {
    if (mercadoPagoAtivo || !fatura || !recebedor.chavePix) return '';
    return gerarPixCopiaECola({
      chave: recebedor.chavePix,
      nomeRecebedor: recebedor.nome,
      cidade: recebedor.cidade,
      valor: fatura.valorTotal,
      identificador: `FAT${fatura.competencia.replace('-', '')}`
    });
  }, [fatura, recebedor, mercadoPagoAtivo]);

  useEffect(() => {
    if (!isOpen) return;
    setForma('pix');
    setPix(null);
    setPago(false);
    setInformado(false);
    setCheckoutAberto(false);
    setCopiado(false);
    setErro(null);
  }, [isOpen, faturaId]);

  // PIX dinâmico do Mercado Pago: gerado ao abrir na forma PIX
  useEffect(() => {
    if (!isOpen || !faturaId || !mercadoPagoAtivo || forma !== 'pix' || pix) return;
    let cancelado = false;
    setGerando(true);
    setErro(null);
    gerarPix(faturaId).
    then((dados) => {
      if (!cancelado) setPix(dados);
    }).
    catch((err: Error) => {
      if (!cancelado) setErro(err.message);
    }).
    finally(() => {
      if (!cancelado) setGerando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [isOpen, faturaId, mercadoPagoAtivo, forma, pix, gerarPix]);

  useEffect(() => {
    if (forma !== 'pix' || !codigoPixEstatico) {
      setQrEstatico(null);
      return;
    }
    let cancelado = false;
    gerarQrCodeDataUrl(codigoPixEstatico, { tamanho: 220, margem: 1 }).
    then((url) => !cancelado && setQrEstatico(url)).
    catch(() => !cancelado && setQrEstatico(null));
    return () => {
      cancelado = true;
    };
  }, [forma, codigoPixEstatico]);

  // Enquanto o QR (ou o checkout) está aberto, a confirmação chega sozinha
  useEffect(() => {
    if (!isOpen || !faturaId || pago || !mercadoPagoAtivo) return;
    if (!pix && !checkoutAberto) return;
    const timer = window.setInterval(async () => {
      if (verificandoRef.current) return;
      verificandoRef.current = true;
      try {
        if (await verificarPagamento(faturaId)) setPago(true);
      } catch {

        // Falha pontual de rede: a próxima verificação tenta de novo
      } finally {verificandoRef.current = false;
      }
    }, INTERVALO_VERIFICACAO);
    return () => window.clearInterval(timer);
  }, [isOpen, faturaId, pago, pix, checkoutAberto, mercadoPagoAtivo, verificarPagamento]);

  if (!fatura) return null;

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('Não foi possível copiar. Selecione o código manualmente.');
    }
  };

  const irParaCheckout = async () => {
    setEnviando(true);
    setErro(null);
    const janela = window.open('', '_blank');
    try {
      const url = await abrirCheckout(fatura.id);
      if (janela) janela.location.href = url;else
      window.location.href = url;
      setCheckoutAberto(true);
    } catch (err: any) {
      janela?.close();
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const verificarAgora = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const confirmado = await verificarPagamento(fatura.id);
      if (confirmado) setPago(true);else
      setErro('O pagamento ainda não foi confirmado pelo Mercado Pago.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const informar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      await informarPagamento(fatura.id, forma);
      setInformado(true);
    } catch (err: any) {
      setErro(err.message || 'Não foi possível informar o pagamento.');
    } finally {
      setEnviando(false);
    }
  };

  const [ano, mes] = fatura.competencia.split('-');
  const transferenciaDisponivel = forma === 'transferencia' && !!recebedor.conta;
  const podeInformar =
  transferenciaDisponivel || !mercadoPagoAtivo && forma === 'pix' && !!codigoPixEstatico;

  if (pago || informado) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Fatura ${mes}/${ano}`}>
        <div className="flex flex-col items-center text-center py-6 gap-3">
          <CheckCircle2Icon
            className={`w-12 h-12 ${pago ? 'text-green-500' : 'text-sky-500'}`} />
          
          <p className="text-lg font-semibold text-gray-900">
            {pago ? 'Pagamento confirmado' : 'Pagamento informado'}
          </p>
          <p className="text-sm text-gray-600 max-w-sm">
            {pago ?
            'A fatura foi quitada. A nota fiscal é emitida automaticamente e aparece no histórico de faturas.' :
            'A fatura fica em análise até a equipe conferir o recebimento. Você não precisa fazer mais nada.'}
          </p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </Modal>);

  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Pagar fatura ${mes}/${ano}`}
      footer={
      <div className="flex flex-wrap items-center justify-between w-full gap-3">
          <span className="text-sm text-gray-600">
            Total <strong className="text-gray-900">{formatarMoeda(fatura.valorTotal)}</strong>
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={enviando}>
              Fechar
            </Button>
            {podeInformar &&
          <Button onClick={informar} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Informar pagamento'}
              </Button>
          }
            {mercadoPagoAtivo && forma !== 'transferencia' && (pix || checkoutAberto) &&
          <Button variant="secondary" onClick={verificarAgora} disabled={enviando}>
                Verificar pagamento
              </Button>
          }
          </div>
        </div>
      }>
      
      <div className="space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-2">
            Forma de pagamento
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO_ASSINATURA.map((opcao) => {
              const Icone = ICONES[opcao.id];
              const selecionada = forma === opcao.id;
              return (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => {
                    setForma(opcao.id);
                    setErro(null);
                  }}
                  aria-pressed={selecionada}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                  selecionada ?
                  'border-teal-500 bg-teal-50' :
                  'border-gray-200 hover:bg-gray-50'}`
                  }>
                  
                  <Icone
                    className={`w-5 h-5 mt-0.5 shrink-0 ${
                    selecionada ? 'text-teal-600' : 'text-gray-400'}`
                    } />
                  
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {opcao.nome}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {opcao.descricao}
                    </span>
                  </span>
                </button>);

            })}
          </div>
        </fieldset>

        {forma === 'pix' && mercadoPagoAtivo &&
        <section className="border border-gray-200 rounded-lg p-4">
            {gerando || !pix ?
          <p className="flex items-center gap-2 text-sm text-gray-500">
                {gerando && <LoaderIcon className="w-4 h-4 animate-spin" />}
                {gerando ? 'Gerando cobrança PIX no Mercado Pago...' : 'Não foi possível gerar o PIX.'}
              </p> :

          <div className="flex flex-col sm:flex-row gap-4 items-center">
                <img
              src={`data:image/png;base64,${pix.qrCodeBase64}`}
              alt={`QR Code PIX de ${formatarMoeda(fatura.valorTotal)}`}
              className="w-44 h-44 border border-gray-200 rounded-lg bg-white" />
            
                <div className="flex-1 w-full min-w-0">
                  <p className="text-sm text-gray-600 mb-2">
                    Escaneie o QR Code ou use o copia e cola. A confirmação
                    aparece aqui automaticamente.
                  </p>
                  <p className="text-xs font-mono break-all bg-gray-50 border border-gray-200 rounded p-2 max-h-24 overflow-y-auto">
                    {pix.qrCode}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <Button variant="secondary" onClick={() => copiar(pix.qrCode)}>
                      {copiado ?
                  <><CheckIcon className="w-4 h-4 mr-1 inline" /> Copiado</> :

                  <><CopyIcon className="w-4 h-4 mr-1 inline" /> Copiar código</>
                  }
                    </Button>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                      Aguardando pagamento · válido até{' '}
                      {new Date(pix.expiraEm).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                    </span>
                  </div>
                </div>
              </div>
          }
          </section>
        }

        {forma === 'pix' && !mercadoPagoAtivo &&
        <section className="border border-gray-200 rounded-lg p-4">
            {!codigoPixEstatico ?
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                O recebimento por PIX ainda não foi configurado. Escolha outra
                forma de pagamento.
              </p> :

          <div className="flex flex-col sm:flex-row gap-4 items-center">
                {qrEstatico ?
            <img
              src={qrEstatico}
              alt={`QR Code PIX de ${formatarMoeda(fatura.valorTotal)}`}
              className="w-40 h-40 border border-gray-200 rounded-lg bg-white" /> :


            <div className="w-40 h-40 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400">
                    Gerando QR Code...
                  </div>
            }
                <div className="flex-1 w-full min-w-0">
                  <p className="text-sm text-gray-600 mb-2">
                    Após pagar, clique em <strong>Informar pagamento</strong>. A
                    baixa é feita após a conferência.
                  </p>
                  <p className="text-xs font-mono break-all bg-gray-50 border border-gray-200 rounded p-2 max-h-24 overflow-y-auto">
                    {codigoPixEstatico}
                  </p>
                  <Button variant="secondary" onClick={() => copiar(codigoPixEstatico)} className="mt-2">
                    {copiado ? 'Copiado' : 'Copiar código PIX'}
                  </Button>
                </div>
              </div>
          }
          </section>
        }

        {(forma === 'boleto' || forma === 'cartao_credito') &&
        <section className="border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
            {mercadoPagoAtivo ?
          <div className="space-y-3">
                <p>
                  {forma === 'boleto' ?
              'O boleto é gerado no ambiente seguro do Mercado Pago. A compensação leva até 2 dias úteis.' :
              'Você paga com cartão no ambiente seguro do Mercado Pago. Os dados do cartão não passam pelo sistema.'}
                </p>
                <Button onClick={irParaCheckout} disabled={enviando}>
                  <ExternalLinkIcon className="w-4 h-4 mr-1 inline" />
                  {checkoutAberto ? 'Abrir novamente' : 'Pagar no Mercado Pago'}
                </Button>
                {checkoutAberto &&
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                    Aguardando a confirmação do Mercado Pago...
                  </p>
            }
              </div> :

          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Esta forma de pagamento ainda não está disponível. Use PIX ou
                transferência.
              </p>
          }
          </section>
        }

        {forma === 'transferencia' &&
        <section className="border border-gray-200 rounded-lg p-4 text-sm">
            {recebedor.conta ?
          <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-gray-700">
                  <dt className="text-gray-500">Banco</dt>
                  <dd className="font-medium">{recebedor.banco || '—'}</dd>
                  <dt className="text-gray-500">Agência</dt>
                  <dd className="font-medium">{recebedor.agencia || '—'}</dd>
                  <dt className="text-gray-500">Conta</dt>
                  <dd className="font-medium">{recebedor.conta}</dd>
                  <dt className="text-gray-500">Titular</dt>
                  <dd className="font-medium">{recebedor.titular || recebedor.nome}</dd>
                  {recebedor.cnpj &&
              <>
                      <dt className="text-gray-500">CNPJ</dt>
                      <dd className="font-medium">{recebedor.cnpj}</dd>
                    </>
              }
                </dl>
                <p className="text-gray-600 mt-3">
                  Após transferir, clique em <strong>Informar pagamento</strong>.
                  A fatura fica em análise até a conferência.
                </p>
              </> :

          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Os dados bancários para transferência ainda não foram
                cadastrados. Escolha outra forma de pagamento.
              </p>
          }
          </section>
        }

        {erro &&
        <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        }
      </div>
    </Modal>);

}