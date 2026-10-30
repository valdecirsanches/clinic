import React, { useState } from 'react';
import { Button } from './ui/Button';
import { RefreshCwIcon, CheckCircleIcon, AlertCircleIcon, InfoIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface MigrationButtonProfissionalIdProps {
  clinicaId: string;
  usuarios: Array<{
    id: string;
    nome: string;
    tipo: string;
  }>;
}
export function MigrationButtonProfissionalId({
  clinicaId,
  usuarios
}: MigrationButtonProfissionalIdProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);
  const handleMigration = async () => {
    if (!clinicaId) {
      setResult({
        success: false,
        message: 'Clínica não identificada'
      });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      // Filtra apenas médicos e dentistas
      const profissionais = usuarios.filter((u) => u.tipo === 'medico' || u.tipo === 'dentista');
      console.log('🔄 Iniciando migração de profissionalId (modo cliente)...');
      console.log('   - Clínica:', clinicaId);
      console.log('   - Profissionais:', profissionais.length);
      // Cria mapa de nome -> id (case insensitive)
      const nomeParaId: Record<string, string> = {};
      profissionais.forEach((u) => {
        if (u.nome && u.id) {
          nomeParaId[u.nome.toLowerCase()] = u.id;
        }
      });
      console.log('   - Mapa nome->id:', nomeParaId);
      // 1. Busca todas as consultas da clínica
      const consultasResponse = await fetch(`${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}`);
      if (!consultasResponse.ok) {
        throw new Error('Erro ao buscar consultas');
      }
      const consultas = await consultasResponse.json();
      console.log(`   - Total de consultas: ${consultas.length}`);
      // 2. Filtra consultas sem profissionalId
      const consultasSemId = consultas.filter((c: any) => !c.profissionalId || c.profissionalId === '');
      console.log(`   - Consultas sem profissionalId: ${consultasSemId.length}`);
      if (consultasSemId.length === 0) {
        setResult({
          success: true,
          message: 'Nenhuma consulta para migrar!',
          details: 'Todas as consultas já possuem profissionalId.'
        });
        return;
      }
      // 3. Atualiza cada consulta
      let migradas = 0;
      let erros = 0;
      let naoEncontrados = 0;
      for (const consulta of consultasSemId) {
        const profissionalNome = consulta.profissional?.toLowerCase();
        const profissionalId = nomeParaId[profissionalNome];
        if (profissionalId) {
          try {
            const updateResponse = await fetch(`${API_BASE_URL}/api/consultas/${consulta.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                clinicaId,
                profissionalId
              })
            });
            if (updateResponse.ok) {
              console.log(`✅ Consulta ${consulta.id} migrada: ${consulta.profissional} -> ${profissionalId}`);
              migradas++;
            } else {
              console.error(`❌ Erro ao migrar consulta ${consulta.id}`);
              erros++;
            }
          } catch (err) {
            console.error(`❌ Erro ao migrar consulta ${consulta.id}:`, err);
            erros++;
          }
        } else {
          console.log(`⚠️ Profissional não encontrado para consulta ${consulta.id}: ${consulta.profissional}`);
          naoEncontrados++;
        }
      }
      console.log(`🏁 Migração concluída: ${migradas} migradas, ${erros} erros, ${naoEncontrados} não encontrados`);
      setResult({
        success: true,
        message: `Migração concluída!`,
        details: `${migradas} consultas atualizadas de ${consultasSemId.length} total${erros > 0 ? ` (${erros} erros)` : ''}${naoEncontrados > 0 ? ` (${naoEncontrados} profissionais não encontrados)` : ''}`
      });
    } catch (err: any) {
      console.error('❌ Erro na migração:', err);
      setResult({
        success: false,
        message: err.message || 'Erro ao executar migração'
      });
    } finally {
      setLoading(false);
    }
  };
  return <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
        <RefreshCwIcon className="w-4 h-4" />
        Migrar Consultas para usar ID do Profissional
      </h4>
      <p className="text-sm text-blue-700 mb-3">
        Esta migração atualiza as consultas existentes para usar o ID do
        profissional em vez do nome. Isso evita perda de dados ao renomear
        profissionais.
      </p>

      <div className="flex items-start gap-2 p-2 bg-blue-100 rounded mb-3">
        <InfoIcon className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          <strong>Nota:</strong> Esta migração processa as consultas diretamente
          pelo navegador. Pode demorar alguns segundos dependendo da quantidade
          de consultas.
        </p>
      </div>

      <Button onClick={handleMigration} disabled={loading} variant="secondary" className="bg-blue-600 hover:bg-blue-700 text-white">
        
        {loading ? <>
            <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
            Migrando...
          </> : <>
            <RefreshCwIcon className="w-4 h-4 mr-2" />
            Executar Migração
          </>}
      </Button>

      {result && <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        
          {result.success ? <CheckCircleIcon className="w-5 h-5 flex-shrink-0" /> : <AlertCircleIcon className="w-5 h-5 flex-shrink-0" />}
          <div>
            <p className="font-medium">{result.message}</p>
            {result.details && <p className="text-sm mt-1">{result.details}</p>}
          </div>
        </div>}
    </div>;
}