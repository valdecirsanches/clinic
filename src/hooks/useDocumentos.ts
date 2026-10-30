import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';
export interface Documento {
  id: string;
  pacienteId: string;
  nome: string;
  nomeOriginal: string;
  tipo: string;
  tamanho: number;
  caminho: string;
  categoria: 'exames' | 'laudos' | 'receitas' | 'atestados' | 'imagens' | 'outros';
  observacoes?: string;
  criadoPor?: string;
  especialidade?: string;
  criadoEm: string;
}

// Função auxiliar para obter operadoraId da sessão
function getOperadoraIdFromSession(): string {
  try {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      return parsed.clinicaAtual?.operadoraId || parsed.operadoraAtual?.id || '';
    }
  } catch (e) {
    console.error('Erro ao obter operadoraId da sessão:', e);
  }
  return '';
}
export function useDocumentos(clinicaId: string, pacienteId?: string) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carregarDocumentos = useCallback(async () => {
    if (!clinicaId) {
      console.warn('📄 [useDocumentos] clinicaId vazio — não carregando');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE_URL}/api/documentos?clinicaId=${clinicaId}`;
      if (pacienteId) {
        url += `&pacienteId=${pacienteId}`;
      }
      console.log(`📄 [useDocumentos] Carregando: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error || errorMsg;
        } catch {}
        console.error(`📄 [useDocumentos] Erro ${response.status}:`, errorMsg);
        throw new Error(errorMsg);
      }
      const data = await response.json();
      console.log(`📄 [useDocumentos] ✅ ${data.length} documento(s) carregado(s)`);
      setDocumentos(data);
    } catch (err: any) {
      console.error('📄 [useDocumentos] ❌ Erro ao carregar documentos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, pacienteId]);
  useEffect(() => {
    carregarDocumentos();
  }, [carregarDocumentos]);
  // Documentos enviados/digitalizados em outro terminal aparecem aqui
  useRevalidacao(carregarDocumentos, {
    intervalo: 45000,
    pausado: !clinicaId
  });
  const uploadDocumento = async (arquivo: File, dados: {
    pacienteId: string;
    nome?: string;
    categoria?: string;
    observacoes?: string;
    criadoPor?: string;
    especialidade?: string;
  }): Promise<Documento> => {
    const operadoraId = getOperadoraIdFromSession();
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('operadoraId', operadoraId);
    formData.append('clinicaId', clinicaId);
    formData.append('pacienteId', dados.pacienteId);
    if (dados.nome) formData.append('nome', dados.nome);
    if (dados.categoria) formData.append('categoria', dados.categoria);
    if (dados.observacoes) formData.append('observacoes', dados.observacoes);
    if (dados.criadoPor) formData.append('criadoPor', dados.criadoPor);
    if (dados.especialidade) formData.append('especialidade', dados.especialidade);
    console.log('📤 [useDocumentos] Upload de documento:');
    console.log('   - operadoraId:', operadoraId);
    console.log('   - clinicaId:', clinicaId);
    console.log('   - pacienteId:', dados.pacienteId);
    console.log('   - categoria:', dados.categoria);
    console.log('   - especialidade:', dados.especialidade);
    const response = await fetch(`${API_BASE_URL}/api/documentos`, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro ao fazer upload do documento');
    }
    const novoDocumento = await response.json();
    console.log('📄 [useDocumentos] ✅ Upload OK, documento:', novoDocumento.id);
    // ⭐ FIX: Adiciona ao estado local E recarrega do servidor para garantir sincronização
    setDocumentos((prev) => [novoDocumento, ...prev]);
    // Recarrega lista completa do servidor após breve delay (garante que o DB já persistiu)
    setTimeout(() => {
      carregarDocumentos();
    }, 500);
    return novoDocumento;
  };
  const atualizarDocumento = async (id: string, dados: {
    nome?: string;
    categoria?: string;
    observacoes?: string;
    especialidade?: string;
  }): Promise<void> => {
    console.log('📝 [useDocumentos] Atualizando documento:', id, dados);
    const response = await fetch(`${API_BASE_URL}/api/documentos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clinicaId,
        ...dados
      })
    });
    console.log('📝 [useDocumentos] Resposta:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [useDocumentos] Erro:', errorData);
      throw new Error(errorData.error || 'Erro ao atualizar documento');
    }
    const result = await response.json();
    console.log('✅ [useDocumentos] Documento atualizado:', result);
    setDocumentos((prev) => prev.map((doc) => doc.id === id ? {
      ...doc,
      ...dados
    } : doc));
  };
  const deletarDocumento = async (id: string): Promise<void> => {
    console.log('🗑️ [useDocumentos] Deletando documento:', id);
    const response = await fetch(`${API_BASE_URL}/api/documentos/${id}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    console.log('🗑️ [useDocumentos] Resposta:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [useDocumentos] Erro:', errorData);
      throw new Error(errorData.error || 'Erro ao deletar documento');
    }
    console.log('✅ [useDocumentos] Documento deletado');
    setDocumentos((prev) => prev.filter((doc) => doc.id !== id));
  };
  const getUrlDownload = (id: string): string => {
    return `${API_BASE_URL}/api/documentos/${id}/download?clinicaId=${clinicaId}`;
  };
  const getUrlVisualizacao = (id: string): string => {
    return `${API_BASE_URL}/api/documentos/${id}/visualizar?clinicaId=${clinicaId}`;
  };

  // ⭐⭐⭐ FIX v3.0: Prioriza URL da nuvem (nuvem.sky9.com.br) → fallback local → fallback API
  const getUrlDireta = (doc: Documento): string => {
    // ⭐ PRIORIDADE 1: URL da nuvem (funciona em qualquer servidor)
    if ((doc as any).url && (doc as any).url.startsWith('http')) {
      return (doc as any).url;
    }
    // ⭐ PRIORIDADE 2: Caminho local via rota estática /uploads/
    if (doc.caminho && doc.caminho.startsWith('/uploads/')) {
      return `${API_BASE_URL}${doc.caminho}`;
    }
    // ⭐ PRIORIDADE 3: URL local que começa com /uploads/
    if ((doc as any).url && (doc as any).url.startsWith('/uploads/')) {
      return `${API_BASE_URL}${(doc as any).url}`;
    }
    // Fallback: usa rota de API (mais lenta, faz DB lookup + fs.readFile)
    return `${API_BASE_URL}/api/documentos/${doc.id}/visualizar?clinicaId=${clinicaId}`;
  };
  const formatarTamanho = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  return {
    documentos,
    loading,
    error,
    carregarDocumentos,
    uploadDocumento,
    atualizarDocumento,
    deletarDocumento,
    getUrlDownload,
    getUrlVisualizacao,
    getUrlDireta,
    formatarTamanho
  };
}