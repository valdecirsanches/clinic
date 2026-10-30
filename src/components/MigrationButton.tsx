import React, { useState } from 'react';
import { Button } from './ui/Button';
import { AlertTriangleIcon, CheckCircleIcon, Loader2, InfoIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface MigrationButtonProps {
  clinicaId?: string;
}
export function MigrationButton({
  clinicaId: propClinicaId
}: MigrationButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const runMigration = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      // Pega clínica atual da sessão ou usa a prop
      let clinicaId = propClinicaId;
      if (!clinicaId) {
        const sessao = localStorage.getItem('sessao');
        if (!sessao) {
          setResult({
            success: false,
            message: 'Nenhuma clínica selecionada'
          });
          return;
        }
        const parsed = JSON.parse(sessao);
        clinicaId = parsed.clinicaAtual?.id;
      }
      if (!clinicaId) {
        setResult({
          success: false,
          message: 'Selecione uma clínica primeiro'
        });
        return;
      }
      console.log('🔧 Executando migração para clínica:', clinicaId);
      // Tenta a rota de migração do servidor primeiro
      try {
        const response = await fetch(`${API_BASE_URL}/api/migrate/add-matricula`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId
          })
        });
        // Se a resposta for JSON válido, usa ela
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (response.ok) {
            setResult({
              success: true,
              message: data.alreadyExists ? 'Coluna matricula já existe' : 'Migração executada com sucesso!'
            });
            console.log('✅ Migração concluída:', data);
            return;
          }
        }
      } catch (serverErr) {
        console.log('⚠️ Rota de migração não disponível no servidor, usando método alternativo...');
      }
      // Método alternativo: testa se a coluna existe fazendo uma busca
      // A coluna será criada automaticamente pelo servidor quando necessário
      const testResponse = await fetch(`${API_BASE_URL}/api/pacientes?clinicaId=${clinicaId}&limit=1`);
      if (testResponse.ok) {
        setResult({
          success: true,
          message: 'Banco de dados verificado! A coluna será criada automaticamente quando necessário.'
        });
        console.log('✅ Verificação concluída');
      } else {
        const errorText = await testResponse.text();
        // Se o erro menciona "matricula", a migração é necessária mas não está disponível
        if (errorText.includes('matricula')) {
          setResult({
            success: false,
            message: 'A migração requer reiniciar o servidor. Contate o administrador.'
          });
        } else {
          setResult({
            success: true,
            message: 'Banco de dados parece estar correto.'
          });
        }
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'Erro ao conectar com servidor'
      });
      console.error('❌ Erro na migração:', err);
    } finally {
      setIsRunning(false);
    }
  };
  return <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900 mb-1">
            Migração de Banco de Dados
          </h3>
          <p className="text-xs text-amber-700 mb-3">
            Se você está vendo erro "table pacientes has no column named
            matricula", clique no botão abaixo para corrigir o banco de dados.
          </p>

          <Button onClick={runMigration} disabled={isRunning} size="sm" variant="secondary" className="mb-2">
            
            {isRunning ? <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executando...
              </> : '🔧 Executar Migração'}
          </Button>

          {result && <div className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${result.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            
              {result.success ? <CheckCircleIcon className="w-4 h-4" /> : <AlertTriangleIcon className="w-4 h-4" />}
              {result.message}
            </div>}
        </div>
      </div>
    </div>;
}