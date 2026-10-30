import React, { useEffect, useState } from 'react';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { useWhatsAppConfig } from '../hooks/useWhatsAppConfig';
/**
 * Monitora o status da sessão configurada para atualizar indicadores da aplicação.
 * Não inicia, reinicia ou cria sessões automaticamente: a recuperação é sempre
 * uma ação explícita do usuário na tela de configurações.
 */
export function WhatsAppAutoActivator() {
  const [clinicaId, setClinicaId] = useState<string>('');
  useEffect(() => {
    const loadClinica = () => {
      try {
        const sessao = localStorage.getItem('sessao');
        const currentClinicaId = sessao ?
        JSON.parse(sessao).clinicaAtual?.id || '' :
        '';
        setClinicaId(currentClinicaId);
      } catch {
        setClinicaId('');
      }
    };
    loadClinica();
    window.addEventListener('storage', loadClinica);
    window.addEventListener('whatsapp-config-updated', loadClinica);
    return () => {
      window.removeEventListener('storage', loadClinica);
      window.removeEventListener('whatsapp-config-updated', loadClinica);
    };
  }, []);
  const { config } = useWhatsAppConfig(clinicaId);
  const serverUrl = (config?.serverUrl || '').replace(/\/+$/, '');
  const sessionName = config?.sessionName || '';
  const { status, isReady } = useWhatsApp(serverUrl, sessionName);
  useEffect(() => {
    if (!clinicaId || !sessionName) return;
    const sessionStatus = {
      status,
      isReady,
      sessionName,
      timestamp: Date.now(),
      clinicaId
    };
    localStorage.setItem(
      `whatsapp_session_status_${clinicaId}`,
      JSON.stringify(sessionStatus)
    );
    localStorage.setItem(
      'whatsapp_session_status',
      JSON.stringify(sessionStatus)
    );
    window.dispatchEvent(
      new CustomEvent('whatsapp-status-changed', {
        detail: sessionStatus
      })
    );
  }, [status, isReady, sessionName, clinicaId]);
  return null;
}