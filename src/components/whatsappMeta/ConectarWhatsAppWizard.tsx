import React, { useEffect, useRef, useState } from 'react';
import {
  XIcon,
  CheckIcon,
  CheckCircle2Icon,
  LockIcon,
  LoaderIcon,
  AlertTriangleIcon,
  InfoIcon,
  ExternalLinkIcon } from
'lucide-react';
import { carregarSdkFacebook } from '../../utils/facebookSdk';

export interface ResultadoSignup {
  numeroExibicao: string;
  phoneNumberId: string;
  wabaId: string;
  webhookAssinado: boolean;
  webhookErro?: string | null;
  numeroRegistrado: boolean;
  registroErro?: string | null;
  /** As conversas são debitadas na conta da plataforma (crédito compartilhado). */
  cobrancaPlataforma?: boolean;
  cobrancaErro?: string | null;
}

interface SignupInfo {
  disponivel: boolean;
  appId: string;
  configId: string;
  apiVersion: string;
  faltando: string[];
}

interface ConectarWhatsAppWizardProps {
  aberto: boolean;
  onFechar: () => void;
  signupInfo: SignupInfo | null;
  onConcluirSignup: (dados: {
    code: string;
    wabaId: string;
    phoneNumberId: string;
  }) => Promise<ResultadoSignup>;
}

const PASSOS = [
'Login Meta',
'Selecionar empresa',
'WABA',
'Número',
'Resumo'] as
const;

const PERMISSOES = [
'Gerenciar a conta do WhatsApp Business da clínica',
'Enviar e receber mensagens em nome da clínica',
'Gerenciar os templates de mensagens',
'Receber eventos de confirmação e respostas dos pacientes'];


/**
 * Traduz o passo informado pela própria janela da Meta para o passo do
 * indicador. Os passos 2 a 4 acontecem DENTRO da Meta — o sistema apenas
 * acompanha, não controla.
 */
function passoDaMeta(currentStep?: string): number | null {
  if (!currentStep) return null;
  const passo = String(currentStep).toUpperCase();
  if (passo.includes('BUSINESS')) return 2;
  if (passo.includes('WABA') || passo.includes('WHATSAPP_BUSINESS_ACCOUNT'))
  return 3;
  if (
  passo.includes('PHONE') ||
  passo.includes('VERIFY') ||
  passo.includes('OTP'))

  return 4;
  return null;
}

export function ConectarWhatsAppWizard({
  aberto,
  onFechar,
  signupInfo,
  onConcluirSignup
}: ConectarWhatsAppWizardProps) {
  const [passo, setPasso] = useState(1);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoSignup | null>(null);
  const [capturado, setCapturado] = useState<{
    wabaId?: string;
    phoneNumberId?: string;
  }>({});

  // Guarda os dados vindos da janela da Meta sem depender do ciclo de render
  const dadosSessao = useRef<{waba_id?: string;phone_number_id?: string;}>({});

  useEffect(() => {
    if (!aberto) {
      setPasso(1);
      setConectando(false);
      setErro(null);
      setResultado(null);
      setCapturado({});
      dadosSessao.current = {};
    }
  }, [aberto]);

  if (!aberto) return null;

  const iniciar = async () => {
    if (!signupInfo?.disponivel) return;
    setConectando(true);
    setErro(null);
    setPasso(2);

    const ouvinte = (evento: MessageEvent) => {
      if (!String(evento.origin || '').includes('facebook.com')) return;
      try {
        const dados =
        typeof evento.data === 'string' ? JSON.parse(evento.data) : evento.data;
        if (dados?.type !== 'WA_EMBEDDED_SIGNUP') return;

        if (dados.data) {
          dadosSessao.current = { ...dadosSessao.current, ...dados.data };
          setCapturado({
            wabaId: dadosSessao.current.waba_id,
            phoneNumberId: dadosSessao.current.phone_number_id
          });
          const proximo = passoDaMeta(dados.data.current_step);
          if (proximo) setPasso((atual) => Math.max(atual, proximo));
        }
        if (dados.event === 'FINISH') setPasso(5);
      } catch (e) {

        /* mensagens não-JSON da própria Meta são ignoradas */}
    };
    window.addEventListener('message', ouvinte);

    try {
      await carregarSdkFacebook(signupInfo.appId, signupInfo.apiVersion);

      const resposta = await new Promise<any>((resolve) => {
        window.FB.login((r: any) => resolve(r), {
          config_id: signupInfo.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: '',
            sessionInfoVersion: '3'
          }
        });
      });

      const code = resposta?.authResponse?.code;
      if (!code) {
        throw new Error(
          'A conexão foi interrompida antes de concluir. Repita e siga até a verificação do número por SMS.'
        );
      }

      setPasso(5);
      const dados = await onConcluirSignup({
        code,
        wabaId: dadosSessao.current.waba_id || '',
        phoneNumberId: dadosSessao.current.phone_number_id || ''
      });
      setResultado(dados);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao conectar o número.');
    } finally {
      window.removeEventListener('message', ouvinte);
      setConectando(false);
    }
  };

  const pendencias = resultado ?
  [
  !resultado.webhookAssinado &&
  `Recebimento de respostas não foi assinado${resultado.webhookErro ? `: ${resultado.webhookErro}` : ''}`,
  !resultado.numeroRegistrado &&
  `Número não registrado para envio${resultado.registroErro ? `: ${resultado.registroErro}` : ''}`,
  !resultado.cobrancaPlataforma &&
  `A cobrança das conversas ficou na conta da clínica${resultado.cobrancaErro ? `: ${resultado.cobrancaErro}` : ''}`].
  filter(Boolean) :
  [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-conectar-whatsapp">
      
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <h2
              id="titulo-conectar-whatsapp"
              className="text-lg font-semibold text-gray-900">
              
              Conectar WhatsApp
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Siga os passos para conectar o WhatsApp Business da sua clínica
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar">
            
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Indicador de passos */}
        <ol className="flex items-start gap-1 px-5 pt-5">
          {PASSOS.map((rotulo, indice) => {
            const numero = indice + 1;
            const concluido = numero < passo;
            const atual = numero === passo;
            return (
              <li key={rotulo} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <span
                    className={`h-0.5 flex-1 ${indice === 0 ? 'bg-transparent' : concluido || atual ? 'bg-blue-600' : 'bg-gray-200'}`} />
                  
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    concluido ?
                    'bg-blue-600 text-white' :
                    atual ?
                    'bg-blue-600 text-white ring-4 ring-blue-100' :
                    'bg-gray-100 text-gray-500'}`
                    }>
                    
                    {concluido ? <CheckIcon className="h-4 w-4" /> : numero}
                  </span>
                  <span
                    className={`h-0.5 flex-1 ${indice === PASSOS.length - 1 ? 'bg-transparent' : concluido ? 'bg-blue-600' : 'bg-gray-200'}`} />
                  
                </div>
                <span
                  className={`mt-1.5 text-center text-[11px] leading-tight ${atual ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>
                  
                  {rotulo}
                </span>
              </li>);

          })}
        </ol>

        {/* Corpo */}
        <div className="p-5">
          {erro &&
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          }

          {/* Passo 1 — login */}
          {passo === 1 &&
          <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900">
                1. Faça login com sua conta Meta
              </h3>
              <p className="mt-0.5 text-sm text-gray-500">
                A janela oficial da Meta será aberta para você autorizar o
                acesso.
              </p>

              <div className="mt-4 rounded-lg bg-blue-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-blue-900">
                  <InfoIcon className="h-4 w-4" />
                  O que será permitido?
                </p>
                <ul className="mt-2 space-y-1.5">
                  {PERMISSOES.map((permissao) =>
                <li
                  key={permissao}
                  className="flex items-start gap-2 text-sm text-blue-900">
                  
                      <CheckCircle2Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      {permissao}
                    </li>
                )}
                </ul>
              </div>

              <p className="mt-3 flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <LockIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span>
                  <strong className="text-gray-800">Seguro e oficial.</strong>{' '}
                  Sua senha é digitada apenas na Meta. O sistema recebe somente a
                  conta e o número — o token de acesso é obtido e guardado no
                  servidor.
                </span>
              </p>

              {!signupInfo?.disponivel &&
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    A conexão automática ainda não está habilitada no servidor
                    {signupInfo?.faltando?.length ?
                ` (falta definir ${signupInfo.faltando.join(', ')})` :
                ''}
                    . Use a configuração manual das credenciais.
                  </span>
                </p>
            }
            </div>
          }

          {/* Passos 2 a 4 — dentro da janela da Meta */}
          {passo > 1 && passo < 5 &&
          <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <LoaderIcon className="h-4 w-4 animate-spin text-blue-600" />
                {passo === 2 && '2. Selecione a empresa'}
                {passo === 3 && '3. Crie ou selecione a conta do WhatsApp'}
                {passo === 4 && '4. Cadastre e verifique o número'}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Este passo acontece na janela da Meta. Se ela não estiver
                visível, procure a janela aberta pelo navegador.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
                <li>
                  • Escolha o <strong>Business Manager da clínica</strong> (não o
                  da plataforma).
                </li>
                <li>
                  • O número informado não pode estar em uso no WhatsApp comum ou
                  no app Business.
                </li>
                <li>
                  • A Meta envia um <strong>código por SMS</strong> para concluir
                  a verificação.
                </li>
              </ul>

              {(capturado.wabaId || capturado.phoneNumberId) &&
            <dl className="mt-4 space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                  {capturado.wabaId &&
              <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">WABA ID</dt>
                      <dd className="font-mono text-gray-800">
                        {capturado.wabaId}
                      </dd>
                    </div>
              }
                  {capturado.phoneNumberId &&
              <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Phone Number ID</dt>
                      <dd className="font-mono text-gray-800">
                        {capturado.phoneNumberId}
                      </dd>
                    </div>
              }
                </dl>
            }
            </div>
          }

          {/* Passo 5 — resumo */}
          {passo === 5 &&
          <div className="rounded-lg border border-gray-200 p-4">
              {!resultado && !erro &&
            <p className="flex items-center gap-2 text-sm text-gray-600">
                  <LoaderIcon className="h-4 w-4 animate-spin text-blue-600" />
                  Concluindo a conexão no servidor...
                </p>
            }

              {resultado &&
            <>
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <CheckCircle2Icon className="h-5 w-5 text-green-600" />
                    WhatsApp conectado
                  </h3>
                  <dl className="mt-3 divide-y divide-gray-100 text-sm">
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-gray-500">Número</dt>
                      <dd className="font-medium text-gray-900">
                        {resultado.numeroExibicao || resultado.phoneNumberId}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-gray-500">WABA ID</dt>
                      <dd className="font-mono text-gray-800">
                        {resultado.wabaId || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-gray-500">Recebimento de respostas</dt>
                      <dd
                    className={
                    resultado.webhookAssinado ?
                    'font-medium text-green-700' :
                    'font-medium text-amber-700'
                    }>
                    
                        {resultado.webhookAssinado ?
                    'Assinado' :
                    'Não assinado'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-gray-500">Número para envio</dt>
                      <dd
                    className={
                    resultado.numeroRegistrado ?
                    'font-medium text-green-700' :
                    'font-medium text-amber-700'
                    }>
                    
                        {resultado.numeroRegistrado ?
                    'Registrado' :
                    'Não registrado'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2">
                      <dt className="text-gray-500">Cobrança das conversas</dt>
                      <dd
                    className={
                    resultado.cobrancaPlataforma ?
                    'font-medium text-green-700' :
                    'font-medium text-amber-700'
                    }>
                    
                        {resultado.cobrancaPlataforma ?
                    'Por conta da plataforma' :
                    'Na conta da clínica'}
                      </dd>
                    </div>
                  </dl>

                  {pendencias.length > 0 ?
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">
                        Conectado, mas com pendências:
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {pendencias.map((p) =>
                  <li key={String(p)}>{p}</li>
                  )}
                      </ul>
                    </div> :

              <p className="mt-3 text-sm text-gray-600">
                      Próximo passo: vincule os templates aprovados aos avisos do
                      sistema e ative o canal.
                    </p>
              }
                </>
            }
            </div>
          }
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
            
            {passo === 5 && resultado ? 'Fechar' : 'Cancelar'}
          </button>

          {passo === 1 &&
          <button
            type="button"
            onClick={iniciar}
            disabled={conectando || !signupInfo?.disponivel}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            
              {conectando ?
            <LoaderIcon className="h-4 w-4 animate-spin" /> :

            <ExternalLinkIcon className="h-4 w-4" />
            }
              Continuar com Meta
            </button>
          }

          {passo > 1 && passo < 5 &&
          <span className="text-sm text-gray-500">
              Aguardando a janela da Meta...
            </span>
          }

          {passo === 5 && erro &&
          <button
            type="button"
            onClick={() => {
              setErro(null);
              setPasso(1);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            
              Tentar novamente
            </button>
          }
        </div>
      </div>
    </div>);

}