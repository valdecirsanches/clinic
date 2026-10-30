import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  PowerIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  SmartphoneIcon,
  WifiIcon,
  WifiOffIcon,
  XCircleIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';
import { clearWhatsAppAuthError } from '../hooks/useWhatsApp';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

type SessionStatus =
'checking' |
'not_configured' |
'not_found' |
'connected' |
'waiting_scan' |
'starting' |
'stopped' |
'error';

interface SessionSnapshot {
  status: SessionStatus;
  sessionExists: boolean;
  message?: string;
}

interface WhatsAppSessionManagerProps {
  serverUrl: string;
  sessionName: string;
  savedServerUrl?: string;
  savedSessionName?: string;
  onServerUrlChange: (url: string) => void;
  onSessionNameChange: (name: string) => void;
  onSessionExistenceChange?: (exists: boolean) => void;
  isSuperAdmin?: boolean;
}

export function WhatsAppSessionManager({
  serverUrl: rawServerUrl,
  sessionName,
  savedServerUrl = '',
  savedSessionName = '',
  onServerUrlChange,
  onSessionNameChange,
  onSessionExistenceChange,
  isSuperAdmin = false
}: WhatsAppSessionManagerProps) {
  const serverUrl = rawServerUrl.trim().replace(/\/+$/, '');
  const configuredServerUrl = savedServerUrl.trim().replace(/\/+$/, '');
  const configuredSessionName = savedSessionName.trim();
  const hasUnsavedSessionChange =
  isSuperAdmin &&
  Boolean(configuredSessionName) && (
  sessionName.trim() !== configuredSessionName ||
  serverUrl !== configuredServerUrl);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({
    status: 'checking',
    sessionExists: false
  });
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartIntent, setRestartIntent] = useState<
    'recover' | 'change_phone' | null>(
    null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const publishSessionStatus = useCallback(
    (status: string, activeSessionName: string, isReady: boolean) => {
      try {
        const sessao = localStorage.getItem('sessao');
        const clinicaId = sessao ?
        JSON.parse(sessao).clinicaAtual?.id || '' :
        '';
        const value = {
          status,
          sessionName: activeSessionName,
          isReady,
          timestamp: Date.now(),
          clinicaId
        };
        localStorage.setItem('whatsapp_session_status', JSON.stringify(value));
        if (clinicaId) {
          localStorage.setItem(
            `whatsapp_session_status_${clinicaId}`,
            JSON.stringify(value)
          );
        }
        window.dispatchEvent(
          new CustomEvent('whatsapp-status-changed', { detail: value })
        );
      } catch {

        // A tela continua funcional mesmo quando o armazenamento local não está disponível.
      }},
    []
  );

  const applySnapshot = useCallback(
    (nextSnapshot: SessionSnapshot, activeSessionName: string) => {
      setSnapshot(nextSnapshot);
      onSessionExistenceChange?.(nextSnapshot.sessionExists);

      if (nextSnapshot.status === 'waiting_scan') {
        // Não troque a URL a cada consulta de status: isso força o navegador a
        // recarregar a mesma imagem e causa o efeito de QR Code piscando.
        setQrCodeImage((currentImage) =>
        currentImage || createQrImageUrl(serverUrl, activeSessionName)
        );
      } else if (nextSnapshot.status !== 'starting') {
        setQrCodeImage(null);
      }

      if (!nextSnapshot.sessionExists || nextSnapshot.status === 'not_found') {
        publishSessionStatus('disconnected', activeSessionName, false);
      } else if (nextSnapshot.status === 'connected') {
        publishSessionStatus('connected', activeSessionName, true);
      } else {
        publishSessionStatus('disconnected', activeSessionName, false);
      }
    },
    [onSessionExistenceChange, publishSessionStatus, serverUrl]
  );

  const checkStatus = useCallback(async () => {
    if (!serverUrl || !configuredSessionName || hasUnsavedSessionChange) {
      const nextSnapshot: SessionSnapshot = {
        status: 'not_configured',
        sessionExists: false,
        message: hasUnsavedSessionChange ?
        'A conexão foi alterada. Salve a configuração antes de verificar a nova sessão.' :
        'Informe e salve o servidor WAHA e o nome da sessão para continuar.'
      };
      applySnapshot(nextSnapshot, configuredSessionName || sessionName.trim());
      return nextSnapshot;
    }

    setSnapshot((current) =>
    current.status === 'waiting_scan' || current.status === 'starting' ?
    current :
    { ...current, status: 'checking' }
    );
    setActionError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/status?serverUrl=${encodeURIComponent(serverUrl)}&sessionName=${encodeURIComponent(configuredSessionName)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Não foi possível consultar o WAHA (${response.status}).`);
      }

      const rawStatus = String(data.status || '').toUpperCase();
      if (rawStatus === 'NOT_FOUND') {
        const nextSnapshot: SessionSnapshot = {
          status: 'not_found',
          sessionExists: false,
          message: `A sessão “${configuredSessionName}” não existe no WAHA. Nenhuma sessão será criada automaticamente.`
        };
        applySnapshot(nextSnapshot, configuredSessionName);
        return nextSnapshot;
      }
      if (data.sessionExists === false) {
        const nextSnapshot: SessionSnapshot = {
          status: 'error',
          sessionExists: false,
          message: data.error || 'Não foi possível confirmar a sessão no WAHA.'
        };
        applySnapshot(nextSnapshot, configuredSessionName);
        return nextSnapshot;
      }


      const nextStatus: SessionStatus =
      rawStatus === 'WORKING' ||
      rawStatus === 'CONNECTED' ||
      rawStatus === 'ONLINE' ||
      data.isReady === true ?
      'connected' :
      rawStatus === 'SCAN_QR_CODE' ||
      rawStatus === 'WAITING_SCAN' ||
      rawStatus === 'WAITING_QR' ||
      rawStatus === 'QR' ?
      'waiting_scan' :
      rawStatus === 'STARTING' || rawStatus === 'INITIALIZING' ?
      'starting' :
      'stopped';
      const nextSnapshot: SessionSnapshot = {
        status: nextStatus,
        sessionExists: true
      };
      applySnapshot(nextSnapshot, configuredSessionName);
      return nextSnapshot;
    } catch (error) {
      const message =
      error instanceof Error ? error.message : 'Não foi possível consultar o WAHA.';
      const nextSnapshot: SessionSnapshot = {
        status: 'error',
        sessionExists: false,
        message
      };
      applySnapshot(nextSnapshot, configuredSessionName);
      return nextSnapshot;
    }
  }, [
  applySnapshot,
  configuredSessionName,
  hasUnsavedSessionChange,
  serverUrl,
  sessionName]
  );

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (snapshot.status === 'waiting_scan' || snapshot.status === 'starting') {
      // O WAHA não precisa ser consultado várias vezes por segundo. Um intervalo
      // mais calmo mantém o estado atualizado sem interromper a leitura do QR.
      pollRef.current = window.setInterval(() => void checkStatus(), 6000);
    }
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [checkStatus, snapshot.status]);

  const startExistingSession = async () => {
    if (!snapshot.sessionExists || !serverUrl || !configuredSessionName) return;
    setIsStarting(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl,
          sessionName: configuredSessionName
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível iniciar a sessão existente.');
      }
      setActionMessage(
        data.alreadyRunning ?
        'A sessão já estava em execução. Atualizamos o status.' :
        'Sessão iniciada. Aguarde o QR Code ou a conexão.'
      );
      await checkStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Não foi possível iniciar a sessão.'
      );
    } finally {
      setIsStarting(false);
    }
  };

  const restartExistingSession = async (intent: 'recover' | 'change_phone') => {
    if (!snapshot.sessionExists || !serverUrl || !configuredSessionName) return;
    setIsRestarting(true);
    setActionMessage(null);
    setActionError(null);
    setQrCodeImage(null);
    clearWhatsAppAuthError(serverUrl);

    const isPhoneChange = intent === 'change_phone';
    const endpoint = isPhoneChange ?
    '/api/whatsapp/session/change-phone' :
    '/api/whatsapp/session/restart';

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl,
          sessionName: configuredSessionName
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error || (
          isPhoneChange ?
          'Não foi possível preparar a sessão para trocar o telefone.' :
          'Não foi possível recuperar a sessão existente.')
        );
      }
      setActionMessage(
        isPhoneChange ?
        'Sessão preparada para troca de telefone. Aguarde o novo QR Code e leia-o no aparelho desejado.' :
        'Sessão reiniciada. Aguarde o QR Code ou a reconexão.'
      );
      await checkStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ?
        error.message :
        'Não foi possível atualizar a sessão.'
      );
    } finally {
      setIsRestarting(false);
    }
  };

  const refreshQrCode = () => {
    if (!serverUrl || !configuredSessionName) return;
    setQrCodeImage(
      createQrImageUrl(serverUrl, configuredSessionName, Date.now())
    );
  };

  const sendTestMessage = async () => {
    const number = testNumber.trim();
    if (!number || !serverUrl || !configuredSessionName) return;
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl,
          sessionName: configuredSessionName,
          number,
          message: 'Teste de conexão WhatsApp — EasyClin'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao enviar a mensagem de teste.');
      }
      setTestResult({ success: true, message: 'Mensagem de teste enviada com sucesso.' });
    } catch (error) {
      setTestResult({
        success: false,
        message:
        error instanceof Error ? error.message : 'Falha ao enviar a mensagem de teste.'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const [testNumber, setTestNumber] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const statusPresentation = getStatusPresentation(snapshot.status);
  const actionsBlocked =
  !snapshot.sessionExists ||
  hasUnsavedSessionChange ||
  snapshot.status === 'checking' ||
  snapshot.status === 'starting';

  return (
    <section className="space-y-5" aria-labelledby="whatsapp-session-title">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                <SmartphoneIcon className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h3 id="whatsapp-session-title" className="text-base font-semibold text-gray-900">
                  Sessão WhatsApp
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  Consulte e conecte somente a sessão já existente no WAHA.
                </p>
              </div>
            </div>
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusPresentation.className}`}
              role="status"
              aria-live="polite">
              
              {statusPresentation.icon === 'loading' ?
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> :
              statusPresentation.icon === 'connected' ?
              <WifiIcon className="h-3.5 w-3.5" /> :
              statusPresentation.icon === 'warning' ?
              <AlertTriangleIcon className="h-3.5 w-3.5" /> :

              <WifiOffIcon className="h-3.5 w-3.5" />
              }
              {statusPresentation.label}
            </span>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {isSuperAdmin &&
          <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="waha-server-url" className="mb-1.5 block text-xs font-medium text-gray-700">
                  URL da API WAHA
                </label>
                <Input
                id="waha-server-url"
                value={rawServerUrl}
                onChange={(event) => onServerUrlChange(event.target.value)}
                onBlur={(event) => onServerUrlChange(event.target.value.replace(/\/+$/, ''))}
                placeholder="https://whatsapp.x-star.com.br"
                className="text-sm" />
              
              </div>
              <div>
                <label htmlFor="waha-session-name" className="mb-1.5 block text-xs font-medium text-gray-700">
                  Nome da sessão
                </label>
                <Input
                id="waha-session-name"
                value={sessionName}
                onChange={(event) =>
                onSessionNameChange(
                  event.target.value.replace(/\s/g, '_').toLowerCase()
                )
                }
                placeholder="nome_da_sessao"
                className="text-sm" />
              
              </div>
            </div>
          }

          {!isSuperAdmin &&
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sessão configurada</p>
              <code className="mt-1 block break-all text-sm font-semibold text-gray-900">
                {configuredSessionName || 'Nenhuma sessão configurada'}
              </code>
            </div>
          }

          {hasUnsavedSessionChange &&
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangleIcon className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-950">Alteração ainda não salva</p>
                <p className="mt-1 text-sm text-amber-800">
                  Salve as configurações para usar a nova conexão e então verifique se a sessão “{sessionName.trim() || 'sem nome'}” já existe no WAHA. Nenhuma sessão será interrompida ou criada nesta tela.
                </p>
              </div>
            </div>
          }

          {snapshot.status === 'not_found' &&
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <XCircleIcon className="mt-0.5 h-5 w-5 flex-none text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-900">Nenhuma sessão associada</p>
                <p className="mt-1 text-sm leading-relaxed text-red-700">{snapshot.message}</p>
                <p className="mt-2 text-xs text-red-700">
                  Crie ou associe a sessão no ambiente WAHA e depois use “Verificar sessão”. Por segurança, conectar, recuperar e configurar webhook permanecem bloqueados.
                </p>
              </div>
            </div>
          }

          {snapshot.status === 'not_configured' &&
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <ClipboardCheckIcon className="mt-0.5 h-5 w-5 flex-none text-gray-500" />
              <p className="text-sm text-gray-700">{snapshot.message}</p>
            </div>
          }

          {snapshot.status === 'error' &&
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertTriangleIcon className="mt-0.5 h-5 w-5 flex-none text-red-600" />
              <p className="text-sm text-red-700">{snapshot.message}</p>
            </div>
          }

          {snapshot.sessionExists && !hasUnsavedSessionChange &&
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sessão verificada no WAHA</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="break-all text-sm font-semibold text-gray-900">{configuredSessionName}</code>
                <span className="text-sm text-gray-500">• {statusPresentation.description}</span>
              </div>
            </div>
          }

          {snapshot.status === 'waiting_scan' && snapshot.sessionExists &&
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
              {qrCodeImage ?
            <img
              src={qrCodeImage}
              alt="QR Code para conectar a sessão WhatsApp"
              className="mx-auto h-56 w-56 rounded-lg border border-amber-200 bg-white p-2" /> :


            <Loader2Icon className="mx-auto h-10 w-10 animate-spin text-amber-600" />
            }
              <p className="mt-3 text-sm font-semibold text-amber-950">Escaneie o QR Code com o WhatsApp</p>
              <p className="mt-1 text-xs text-amber-800">WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho.</p>
              <button
              type="button"
              onClick={refreshQrCode}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 underline decoration-amber-300 underline-offset-4 hover:text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2">
              
                <RefreshCwIcon className="h-3.5 w-3.5" />
                Atualizar QR Code
              </button>
            </div>
          }

          {actionMessage &&
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              <CheckCircleIcon className="h-4 w-4 flex-none" />
              {actionMessage}
            </p>
          }
          {actionError &&
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              <XCircleIcon className="h-4 w-4 flex-none" />
              {actionError}
            </p>
          }

          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="secondary" onClick={() => void checkStatus()} disabled={snapshot.status === 'checking'}>
              <RefreshCwIcon className={`mr-2 h-4 w-4 ${snapshot.status === 'checking' ? 'animate-spin' : ''}`} />
              Verificar sessão
            </Button>
            {snapshot.status !== 'connected' && snapshot.status !== 'waiting_scan' &&
            <Button type="button" onClick={() => void startExistingSession()} disabled={actionsBlocked || isStarting} className="bg-emerald-700 text-white hover:bg-emerald-800">
                {isStarting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : <PowerIcon className="mr-2 h-4 w-4" />}
                {isStarting ? 'Conectando...' : 'Conectar sessão existente'}
              </Button>
            }
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRestartIntent('recover')}
              disabled={actionsBlocked || isRestarting}
              className="text-amber-800 hover:bg-amber-50">
              
              <RotateCcwIcon className="mr-2 h-4 w-4" />
              Reiniciar conexão
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRestartIntent('change_phone')}
              disabled={actionsBlocked || isRestarting}
              className="text-amber-800 hover:bg-amber-50">
              
              <SmartphoneIcon className="mr-2 h-4 w-4" />
              Trocar telefone
            </Button>
          </div>
          {snapshot.sessionExists && !hasUnsavedSessionChange &&
          <p className="text-xs leading-relaxed text-gray-500">
              <strong className="text-gray-700">Trocar telefone</strong> encerra o vínculo atual desta sessão e apresenta um novo QR Code. Use apenas quando for conectar outro aparelho.
            </p>
          }
        </div>
      </div>

      {snapshot.status === 'connected' && snapshot.sessionExists &&
      <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <MessageSquareIcon className="h-4 w-4 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-gray-900">Teste de envio</h4>
              <p className="mt-0.5 text-xs text-gray-500">Disponível apenas enquanto a sessão estiver conectada.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="whatsapp-test-number">Número para teste</label>
                <Input id="whatsapp-test-number" value={testNumber} onChange={(event) => setTestNumber(event.target.value)} placeholder="Número com DDD, ex.: 85999999999" className="flex-1 text-sm" />
                <Button type="button" onClick={() => void sendTestMessage()} disabled={isSendingTest || !testNumber.trim()} className="bg-emerald-700 text-white hover:bg-emerald-800">
                  {isSendingTest ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : <SendIcon className="mr-2 h-4 w-4" />}
                  Enviar teste
                </Button>
              </div>
              {testResult &&
            <p className={`mt-2 text-sm ${testResult.success ? 'text-emerald-700' : 'text-red-700'}`} role="status">
                  {testResult.message}
                </p>
            }
            </div>
          </div>
        </div>
      }

      <Modal
        isOpen={restartIntent !== null}
        onClose={() => {
          if (!isRestarting) setRestartIntent(null);
        }}
        title={
        restartIntent === 'change_phone' ?
        'Trocar telefone da sessão' :
        'Reiniciar conexão da sessão'
        }
        footer={
        <>
            <Button type="button" variant="ghost" onClick={() => setRestartIntent(null)} disabled={isRestarting}>Cancelar</Button>
            <Button
            type="button"
            onClick={async () => {
              if (!restartIntent) return;
              const intent = restartIntent;
              setRestartIntent(null);
              await restartExistingSession(intent);
            }}
            disabled={isRestarting || !snapshot.sessionExists || !restartIntent}
            className="bg-amber-600 text-white hover:bg-amber-700">
            
              {isRestarting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : restartIntent === 'change_phone' ? <SmartphoneIcon className="mr-2 h-4 w-4" /> : <RotateCcwIcon className="mr-2 h-4 w-4" />}
              {restartIntent === 'change_phone' ? 'Confirmar troca de telefone' : 'Confirmar reinício'}
            </Button>
          </>
        }>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <AlertTriangleIcon className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
            <p className="text-sm text-amber-900">
              {restartIntent === 'change_phone' ?
              'O aparelho atualmente conectado será desvinculado desta sessão. Em seguida, será exibido um QR Code para o novo telefone.' :
              'O envio de mensagens pode ficar indisponível por alguns instantes durante o reinício da conexão.'}
            </p>
          </div>
          <p className="text-sm text-gray-700">A ação será aplicada somente à sessão já confirmada:</p>
          <code className="block break-all rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900">{configuredSessionName}</code>
          <p className="text-xs text-gray-500">
            Nenhuma sessão será criada ou trocada. {restartIntent === 'change_phone' ? 'Somente o vínculo do aparelho desta sessão será renovado.' : 'A sessão existente será apenas reiniciada.'}
          </p>
        </div>
      </Modal>
    </section>);

}

function createQrImageUrl(
serverUrl: string,
sessionName: string,
cacheBuster?: number)
: string {
  const params = new URLSearchParams({ serverUrl, sessionName });
  if (cacheBuster) params.set('t', String(cacheBuster));
  return `${API_BASE_URL}/api/whatsapp/qr-image?${params.toString()}`;
}

function getStatusPresentation(status: SessionStatus): {
  label: string;
  description: string;
  icon: 'loading' | 'connected' | 'warning' | 'offline';
  className: string;
} {
  switch (status) {
    case 'connected':
      return { label: 'Conectada', description: 'Pronta para enviar mensagens', icon: 'connected', className: 'bg-emerald-100 text-emerald-800' };
    case 'waiting_scan':
      return { label: 'Aguardando QR', description: 'Escaneie o QR Code para concluir', icon: 'warning', className: 'bg-amber-100 text-amber-800' };
    case 'starting':
      return { label: 'Iniciando', description: 'O WAHA está preparando a sessão', icon: 'loading', className: 'bg-blue-100 text-blue-800' };
    case 'not_found':
      return { label: 'Sessão não encontrada', description: 'Não há sessão associada no WAHA', icon: 'offline', className: 'bg-red-100 text-red-800' };
    case 'not_configured':
      return { label: 'Não configurada', description: 'Salve uma configuração para consultar', icon: 'offline', className: 'bg-gray-100 text-gray-700' };
    case 'error':
      return { label: 'Não foi possível verificar', description: 'Revise o acesso ao WAHA', icon: 'offline', className: 'bg-red-100 text-red-800' };
    case 'stopped':
      return { label: 'Desconectada', description: 'A sessão existe e pode ser conectada', icon: 'offline', className: 'bg-gray-100 text-gray-700' };
    default:
      return { label: 'Verificando', description: 'Consultando o WAHA', icon: 'loading', className: 'bg-gray-100 text-gray-700' };
  }
}