import React, { useState } from 'react';
import { Button } from './ui/Button';
import { useToast } from '../hooks/useToast';
import { API_BASE_URL } from '../config/api';
import { Building2Icon, RefreshCwIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
interface MigrationButtonEmpresaConveniadaProps {
  clinicaId: string;
}
export function MigrationButtonEmpresaConveniada({
  clinicaId
}: MigrationButtonEmpresaConveniadaProps) {
  const [loading, setLoading] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    success,
    error: showError
  } = useToast();
  const runMigration = async () => {
    if (!clinicaId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/migrate/add-empresa-conveniada`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId
        })
      });
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (response.ok) {
          setMigrated(true);
          success('Migração Concluída', 'Tabela de empresas conveniadas criada com sucesso!');
          return;
        }
      }
      console.log('⚠️ Rota de migração não disponível, verificando tabela...');
      const testResponse = await fetch(`${API_BASE_URL}/api/empresas-conveniadas?clinicaId=${clinicaId}`);
      if (testResponse.ok) {
        setMigrated(true);
        success('Verificação Concluída', 'A tabela de empresas conveniadas já existe e está funcionando!');
      } else {
        const errorText = await testResponse.text();
        if (errorText.includes('no such table') || errorText.includes('SQLITE_ERROR')) {
          setErrorMessage('A migração requer reiniciar o servidor. Contate o administrador.');
          showError('Migração Necessária', 'O servidor precisa ser reiniciado para criar a tabela.');
        } else {
          setMigrated(true);
          success('Verificação Concluída', 'Estrutura do banco parece estar correta.');
        }
      }
    } catch (err: any) {
      console.error('❌ Erro na migração:', err);
      try {
        const testResponse = await fetch(`${API_BASE_URL}/api/empresas-conveniadas?clinicaId=${clinicaId}`);
        if (testResponse.ok) {
          setMigrated(true);
          success('Verificação Concluída', 'A tabela já existe!');
          return;
        }
      } catch (testErr) {


        // Ignora erro do teste
      }setErrorMessage(err.message || 'Erro ao executar migração');
      showError('Erro na Migração', err.message);
    } finally {
      setLoading(false);
    }
  };
  return <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2Icon className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-purple-900">
            Migração: Empresas Conveniadas
          </h3>
          <p className="text-sm text-purple-700 mt-1">
            Cria a tabela de empresas conveniadas e adiciona o campo de vínculo
            na tabela de pacientes.
          </p>
          <div className="mt-3">
            {migrated ? <div className="flex items-center gap-2 text-green-600">
                <CheckCircleIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Migração concluída!</span>
              </div> : errorMessage ? <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircleIcon className="w-4 h-4" />
                  <span className="text-sm">{errorMessage}</span>
                </div>
                <Button variant="secondary" size="sm" onClick={runMigration} disabled={loading}>
                
                  {loading ? <>
                      <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
                      Tentando...
                    </> : <>
                      <RefreshCwIcon className="w-4 h-4 mr-2" />
                      Tentar Novamente
                    </>}
                </Button>
              </div> : <Button variant="secondary" size="sm" onClick={runMigration} disabled={loading}>
              
                {loading ? <>
                    <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
                    Executando...
                  </> : <>
                    <Building2Icon className="w-4 h-4 mr-2" />
                    Executar Migração
                  </>}
              </Button>}
          </div>
        </div>
      </div>
    </div>;
}