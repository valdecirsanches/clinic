import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { CheckCircleIcon, XCircleIcon, LoaderIcon, WifiOffIcon } from 'lucide-react';
import { useWhatsApp, isWhatsAppAuthBlocked } from '../hooks/useWhatsApp';
import { useWhatsAppConfig } from '../hooks/useWhatsAppConfig';
export function WhatsAppStatusButton() {
  const [clinicaId, setClinicaId] = useState<string>('');
  // Detecta clínica atual
  useEffect(() => {
    const loadClinica = () => {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        const currentClinicaId = parsed.clinicaAtual?.id;
        if (currentClinicaId !== clinicaId) {
          setClinicaId(currentClinicaId || '');
        }
      }
    };
    loadClinica();
    // ⭐ FASE 3: Polling inteligente — pausa em aba background.
    // 10s quando visível; recarrega clínica imediatamente ao voltar para a aba.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval !== null) return;
      interval = setInterval(loadClinica, 10000);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        loadClinica();
        start();
      }
    };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clinicaId]);
  // Carrega config via API
  const {
    config
  } = useWhatsAppConfig(clinicaId);
  // ⭐⭐⭐ FIX: Se auth está bloqueado, passa strings vazias para evitar chamadas ⭐⭐⭐
  const serverUrl = config?.serverUrl || '';
  const isBlocked = isWhatsAppAuthBlocked(serverUrl);
  const {
    status,
    isReady
  } = useWhatsApp(isBlocked ? '' : serverUrl, isBlocked ? '' : config?.sessionName || '');
  // Se não tem config, não mostra nada
  if (!config || !config.serverUrl || !config.sessionName) {
    return null;
  }
  const getStatusConfig = () => {
    if (status === 'connected' && isReady) {
      return {
        label: 'WhatsApp Conectado',
        icon: CheckCircleIcon,
        className: 'bg-green-500 hover:bg-green-600 text-white'
      };
    }
    if (status === 'initializing' || status === 'waiting_scan') {
      return {
        label: 'Conectando...',
        icon: LoaderIcon,
        className: 'bg-yellow-500 hover:bg-yellow-600 text-white animate-pulse'
      };
    }
    return {
      label: 'WhatsApp Desconectado',
      icon: WifiOffIcon,
      className: 'bg-gray-300 hover:bg-gray-400 text-gray-700'
    };
  };
  const statusConfig = getStatusConfig();
  const Icon = statusConfig.icon;
  return <Button onClick={() => {
    window.location.hash = '#/configuracoes';
  }} className={`transition-all ${statusConfig.className}`} title="Clique para ir às configurações do WhatsApp">
      
      <Icon className={`w-4 h-4 mr-2 ${status === 'initializing' || status === 'waiting_scan' ? 'animate-spin' : ''}`} />
      

      {statusConfig.label}
    </Button>;
}