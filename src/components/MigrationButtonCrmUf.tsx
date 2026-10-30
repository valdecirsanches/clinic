import React, { useState } from 'react';
import { Button } from './ui/Button';
import { DatabaseIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
export function MigrationButtonCrmUf() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const runMigration = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/migrate/add-crm-uf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok) {
        setResult({
          success: true,
          message: data.alreadyExists ? 'Colunas CRM e UF já existem no banco de dados' : 'Colunas CRM e UF adicionadas com sucesso! Recarregue a página.'
        });
      } else {
        setResult({
          success: false,
          message: `Erro: ${data.error}`
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: `Erro ao executar migração: ${err.message}`
      });
    } finally {
      setIsRunning(false);
    }
  };
  return <div className="space-y-3">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          🔧 Migração: Campos CRM e UF
        </h3>
        <p className="text-xs text-blue-700 mb-3">
          Esta migração adiciona os campos <strong>CRM</strong> e{' '}
          <strong>UF</strong> na tabela de usuários para integração com o Memed.
          Execute apenas uma vez.
        </p>

        <Button onClick={runMigration} disabled={isRunning} size="sm" className="w-full">
          
          {isRunning ? <>
              <DatabaseIcon className="w-4 h-4 mr-2 animate-spin" />
              Executando Migração...
            </> : <>
              <DatabaseIcon className="w-4 h-4 mr-2" />
              Executar Migração
            </>}
        </Button>
      </div>

      {result && <div className={`p-3 rounded-lg border-2 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        
          <div className="flex items-start gap-2">
            {result.success ? <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
            <div>
              <p className={`text-sm font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
              
                {result.success ? '✅ Sucesso!' : '❌ Erro'}
              </p>
              <p className={`text-xs mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
              
                {result.message}
              </p>
            </div>
          </div>
        </div>}
    </div>;
}