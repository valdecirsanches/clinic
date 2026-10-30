import React, { useState } from 'react';
import { DatabaseIcon, RefreshCwIcon, AlertTriangleIcon, ServerIcon, WifiOffIcon } from 'lucide-react';
import { API_BASE_URL, envServerDbLoaded, serverDbSourceInfo } from '../config/api';
interface DatabaseUnavailableProps {
  error: string;
  apiUrl: string;
  onRetry: () => void;
  isRetrying: boolean;
}
export function DatabaseUnavailable({
  error,
  apiUrl,
  onRetry,
  isRetrying
}: DatabaseUnavailableProps) {
  const isTimeout = error.includes('Timeout') || error.includes('timeout');
  const isNetworkError = error.includes('Failed to fetch') || error.includes('NetworkError') || error.includes('ERR_');
  const isHttpError = error.startsWith('HTTP ');
  let icon = <DatabaseIcon className="w-16 h-16 text-red-400" />;
  let title = 'Banco de Dados Indisponível';
  let description = 'Não foi possível conectar ao servidor de banco de dados. O sistema não pode funcionar sem esta conexão.';
  if (isTimeout) {
    icon = <ServerIcon className="w-16 h-16 text-amber-400" />;
    title = 'Servidor Não Respondeu';
    description = 'O servidor de banco de dados não respondeu dentro do tempo limite. Ele pode estar sobrecarregado ou em manutenção.';
  } else if (isNetworkError) {
    icon = <WifiOffIcon className="w-16 h-16 text-red-400" />;
    title = 'Erro de Conexão';
    description = 'Não foi possível estabelecer conexão com o servidor. Verifique sua internet ou se o servidor está online.';
  } else if (isHttpError) {
    icon = <AlertTriangleIcon className="w-16 h-16 text-amber-400" />;
    title = `Erro do Servidor (${error})`;
    description = 'O servidor respondeu com um erro. Ele pode estar em manutenção ou com problemas temporários.';
  }
  return <div className="fixed inset-0 z-[9999] bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center">
        {/* Animated icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-ping opacity-20 rounded-full bg-red-500" style={{
            animationDuration: '2s'
          }} />
            
            <div className="relative bg-gray-800 rounded-full p-6 border-2 border-red-500/30">
              {icon}
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-3">{title}</h1>

        {/* Description */}
        <p className="text-gray-400 mb-6 leading-relaxed">{description}</p>

        {/* Error details box */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 text-left">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Servidor API
              </span>
              <code className="text-xs text-amber-400 bg-gray-900 px-2 py-0.5 rounded">
                {apiUrl}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Erro
              </span>
              <span className="text-xs text-red-400">{error}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Fonte Config
              </span>
              <span className={`text-xs ${envServerDbLoaded ? 'text-green-400' : 'text-amber-400'}`}>
                
                {serverDbSourceInfo}
              </span>
            </div>
          </div>
        </div>

        {/* Retry button */}
        <button onClick={onRetry} disabled={isRetrying} className={`
            inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white
            transition-all duration-200
            ${isRetrying ? 'bg-gray-700 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 active:bg-red-700'}
          `}>
          
          <RefreshCwIcon className={`w-5 h-5 ${isRetrying ? 'animate-spin' : ''}`} />
          
          {isRetrying ? 'Verificando conexão...' : 'Tentar Novamente'}
        </button>

        {/* Help text */}
        <div className="mt-8 text-xs text-gray-600 space-y-1">
          <p>
            Se o problema persistir, verifique se o servidor{' '}
            <code className="text-gray-500">{apiUrl}</code> está online.
          </p>
          <p>
            Para corrigir a URL, edite o arquivo{' '}
            <code className="text-gray-500">config/env.ts</code> →{' '}
            <code className="text-gray-500">ENV_SERVER_DB = 'https://...'</code>
          </p>
        </div>
      </div>
    </div>;
}