import React, { useEffect, useState, useRef } from 'react';
import { Button } from './ui/Button';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { DialogContainer } from './DialogContainer';
interface ImportacaoLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}
// Utilitário para buscar clinicaId do contexto ou localStorage
function getClinicaIdFallback(sessao: any) {
  if (sessao?.clinicaAtual?.id) return sessao.clinicaAtual.id;
  try {
    const raw = localStorage.getItem('sessao');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.clinicaAtual?.id) return parsed.clinicaAtual.id;
    }
  } catch {}
  return null;
}
export function ImportacaoPage() {
  const { sessao } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<ImportacaoLog[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const { dialogs, removeDialog, confirm } = useDialog();
  // Auto-scroll para o final dos logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [logs]);
  const startPolling = () => {
    setIsPolling(true);
    pollingIntervalRef.current = setInterval(fetchImportacaoStatus, 2000); // A cada 2 segundos
  };
  const stopPolling = () => {
    setIsPolling(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };
  const fetchImportacaoStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/importacao/status`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        // Para o polling se a importação terminou
        if (!data.isRunning && isPolling) {
          stopPolling();
          setMessage('✅ Importação concluída!');
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status:', error);
    }
  };
  const handleExecTudo = async () => {
    const clinicaId = getClinicaIdFallback(sessao);
    if (!clinicaId) {
      setMessage('❌ Erro: Nenhuma clínica selecionada. Faça login novamente.');
      return;
    }
    const shouldImport = await confirm(
      'Confirmar Importação',
      'Tem certeza que deseja executar a importação para a clínica atual? Esta operação pode demorar alguns minutos.',
      'Executar',
      'Cancelar'
    );
    if (!shouldImport) {
      return;
    }
    setIsLoading(true);
    setMessage(null);
    setLogs([]);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/importacao/exec-tudo?clinicaId=${clinicaId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      const data = await response.json();
      if (response.ok) {
        setMessage(
          `🚀 Importação iniciada para a clínica: ${clinicaId}! Acompanhe o progresso abaixo.`
        );
        startPolling();
      } else {
        setMessage(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      setMessage(
        `❌ Erro de conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
    } finally {
      setIsLoading(false);
    }
  };
  // Cleanup do polling quando o componente desmontar
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);
  const getLogIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };
  const getLogColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      default:
        return 'text-blue-600';
    }
  };
  return (
    <div className="p-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Importação de Dados
        </h1>
        <p className="text-gray-600 mb-6">
          Ferramentas para importação de dados e manutenção do sistema.
        </p>

        <div className="space-y-6">
          {/* Seção de Importações */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Importações de Banco de Dados
            </h2>
            <p className="text-gray-600 mb-4">
              Execute importação para atualizar os dados do sistema
              easyclin/appclinic.
            </p>

            <div className="flex gap-3 mb-4">
              <Button
                onClick={handleExecTudo}
                disabled={isLoading || isPolling}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
                
                {isLoading ?
                'Iniciando...' :
                isPolling ?
                'Executando...' :
                'Executar Todas as Importações'}
              </Button>

              {isPolling &&
              <Button
                onClick={stopPolling}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">
                
                  Parar Monitoramento
                </Button>
              }
            </div>

            {message &&
            <div className="mb-4 p-3 rounded-lg bg-gray-50 border">
                <p className="text-sm">{message}</p>
              </div>
            }

            {/* Logs em tempo real */}
            {logs.length > 0 &&
            <div className="border rounded-lg bg-gray-50">
                <div className="p-3 border-b bg-gray-100">
                  <h3 className="font-semibold text-gray-800">
                    Logs de Execução
                  </h3>
                  <p className="text-sm text-gray-600">
                    {isPolling ?
                  'Monitorando em tempo real...' :
                  'Execução concluída'}
                  </p>
                </div>
                <div className="p-3 max-h-96 overflow-y-auto">
                  <div className="space-y-1 font-mono text-sm">
                    {logs.map((log, index) =>
                  <div
                    key={index}
                    className={`flex items-start gap-2 ${getLogColor(log.type)}`}>
                    
                        <span className="text-xs mt-0.5">
                          {getLogIcon(log.type)}
                        </span>
                        <div className="flex-1">
                          <span className="text-xs text-gray-500 mr-2">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span>{log.message}</span>
                        </div>
                      </div>
                  )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>
            }
          </div>

          {/* Seção de Importações (placeholder) */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Importações
            </h2>
            <div className="rounded-lg bg-gray-50 p-4 border border-dashed border-gray-200 text-gray-500">
              Em breve será possível acessar os fluxos de importação de dados
              (CID-10, medicamentos, procedimentos, etc.).
            </div>
          </div>
        </div>
      </div>
      <DialogContainer dialogs={dialogs} onClose={removeDialog} />
    </div>);

}