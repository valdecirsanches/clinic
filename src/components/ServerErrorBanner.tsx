import React, { useCallback, useEffect, useState, useRef } from 'react';
import { AlertTriangleIcon, RefreshCwIcon, WifiOffIcon, ServerIcon, CloudOffIcon, XIcon } from 'lucide-react';
import { Button } from './ui/Button';
interface ServerErrorBannerProps {
  error: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}
export function ServerErrorBanner({
  error,
  onRetry,
  isRetrying = false
}: ServerErrorBannerProps) {
  const [visible, setVisible] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // ⭐ FIX: Use ref for onRetry to avoid resetting the timer on every render
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;
  // Reset dismissed state when error changes
  useEffect(() => {
    if (error) {
      setDismissed(false);
    }
  }, [error]);
  useEffect(() => {
    if (error && !dismissed) {
      setVisible(true);
      // Auto-retry for 5xx errors with exponential backoff (max 3 attempts)
      const is5xxError = error?.includes('502') || error?.includes('520') || error?.includes('503') || error?.includes('504') || error?.includes('indisponível');
      if (is5xxError && autoRetryCount < 3 && onRetryRef.current) {
        // Exponential backoff: 5s, 10s, 20s
        const delay = 5000 * Math.pow(2, autoRetryCount);
        const timer = setTimeout(() => {
          setAutoRetryCount((prev) => prev + 1);
          onRetryRef.current?.();
        }, delay);
        return () => clearTimeout(timer);
      }
    } else {
      setAutoRetryCount(0);
      // Delay hiding to allow for animation
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [error, autoRetryCount, dismissed]);
  if (!visible && !error) return null;
  if (dismissed) return null;
  // Detecta tipo de erro
  const is520Error = error?.includes('520');
  const is502Error = error?.includes('502');
  const is503Error = error?.includes('503');
  const is504Error = error?.includes('504');
  const isCloudflareError = is520Error || is502Error || is503Error || is504Error;
  const isNetworkError = error?.includes('conexão') || error?.includes('conectar') || error?.includes('fetch');
  const isServerError = error?.includes('indisponível') || isCloudflareError;
  // Escolhe ícone e título baseado no tipo de erro
  let Icon = AlertTriangleIcon;
  let title = 'Erro de comunicação';
  let description = error;
  let tip = '';
  if (isNetworkError) {
    Icon = WifiOffIcon;
    title = 'Sem conexão com a internet';
    tip = 'Verifique sua conexão com a internet e tente novamente.';
  } else if (is520Error) {
    Icon = CloudOffIcon;
    title = 'Servidor não respondeu (Erro 520)';
    description = 'O servidor backend não está respondendo corretamente.';
    tip = '💡 Isso pode indicar que o servidor está reiniciando ou com erro. Aguarde alguns segundos e tente novamente.';
  } else if (is502Error) {
    Icon = ServerIcon;
    title = 'Servidor temporariamente indisponível (502)';
    tip = '💡 O servidor pode estar reiniciando. Aguarde alguns segundos.';
  } else if (is503Error) {
    Icon = ServerIcon;
    title = 'Serviço em manutenção (503)';
    tip = '💡 O servidor está em manutenção. Tente novamente em alguns minutos.';
  } else if (is504Error) {
    Icon = ServerIcon;
    title = 'Tempo de resposta esgotado (504)';
    tip = '💡 O servidor demorou muito para responder. Tente novamente.';
  } else if (isServerError) {
    Icon = ServerIcon;
    title = 'Servidor temporariamente indisponível';
    tip = '💡 Isso geralmente é temporário. O servidor pode estar reiniciando.';
  }
  // ⭐ Calcula próximo retry delay para mostrar ao usuário
  const nextRetryDelay = autoRetryCount < 3 ? Math.round(5 * Math.pow(2, autoRetryCount)) : 0;
  return <div className={`
        fixed top-4 left-1/2 transform -translate-x-1/2 z-50 
        max-w-lg w-full mx-4
        transition-all duration-300 ease-out
        ${error && !dismissed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}
      `}>
      
      <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <Icon className="w-5 h-5 text-red-600" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-red-900">{title}</h3>
            <p className="text-sm text-red-700 mt-1">{description}</p>

            {tip && <p className="text-xs text-red-600 mt-2">{tip}</p>}

            {autoRetryCount > 0 && autoRetryCount < 3 && <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <RefreshCwIcon className="w-3 h-3 animate-spin" />
                Tentativa automática {autoRetryCount}/3... (próxima em{' '}
                {nextRetryDelay}s)
              </p>}

            {autoRetryCount >= 3 && <p className="text-xs text-red-600 mt-2">
                ⚠️ Tentativas automáticas esgotadas. Verifique se o servidor
                está online.
              </p>}
          </div>

          <div className="flex flex-col gap-1 flex-shrink-0">
            {onRetry && <Button size="sm" variant="secondary" onClick={() => {
            setAutoRetryCount(0);
            onRetry();
          }} disabled={isRetrying} className="bg-red-100 hover:bg-red-200 text-red-700 border-red-300">
              
                <RefreshCwIcon className={`w-4 h-4 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
              
                {isRetrying ? 'Tentando...' : 'Tentar novamente'}
              </Button>}
            <button onClick={() => setDismissed(true)} className="text-xs text-red-400 hover:text-red-600 self-end mt-1" title="Fechar">
              
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>;
}