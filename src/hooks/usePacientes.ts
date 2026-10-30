import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { useRevalidacao } from './useRevalidacao';

// ⭐ Chave para persistir termo de busca
const STORAGE_KEY_BUSCA = 'easyclin_busca_paciente_v2';

// ⭐ Função para ler termo do localStorage
const lerTermoSalvo = (): string => {
  try {
    const termo = localStorage.getItem(STORAGE_KEY_BUSCA) || '';
    console.log('📖 [usePacientes] Lendo termo do localStorage:', termo || '(vazio)');
    return termo;
  } catch (e) {
    console.warn('Erro ao ler termo do localStorage:', e);
    return '';
  }
};
export interface Paciente {
  id: string;
  matricula?: string;
  nome: string;
  cpf?: string;
  dataNascimento?: string;
  telefone?: string;
  email?: string;
  status?: string;
  numeroContrato?: string;
  dataInicio?: string;
  idade?: number;
  genero?: string;
  estadoCivil?: string;
  dificuldadeLocomocao?: number;
  rg?: string;
  emissorRg?: string;
  cns?: string;
  pisPasep?: string;
  convenio?: string;
  empresa?: string;
  plano?: string;
  profissao?: string;
  grauInstrucao?: string;
  profissionalResponsavel?: string;
  nomeMae?: string;
  nomePai?: string;
  nomeResponsavel?: string;
  rgResponsavel?: string;
  cpfResponsavel?: string;
  registroEmpresa?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  codigoIbge?: string;
  telefoneResidencial?: string;
  observacoes?: string;
  anotacoes?: string;
  dataCadastro?: string;
  criadoEm: string;
}
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
export function usePacientes(clinicaId: string | undefined) {
  // ⭐ Inicializa searchTerm com o valor do localStorage IMEDIATAMENTE
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(() => lerTermoSalvo());

  // ⭐ Refs para controlar carregamento e evitar loops
  const carregandoRef = useRef(false);
  const clinicaIdRef = useRef<string | null>(null);
  const carregouInicialRef = useRef(false);
  const ultimaRequisicaoRef = useRef<string>('');

  // ⭐ Função de carregar com proteção contra loops
  // forcar=true ignora o anti-loop (usado após criar/editar/excluir e no recarregar manual)
  const carregar = useCallback(async (page: number = 1, limit: number = 50, search: string = '', forcar: boolean = false) => {
    if (!clinicaId) {
      console.log('⚠️ [usePacientes] Sem clinicaId, abortando');
      setLoading(false);
      return;
    }

    // ⭐ Cria uma chave única para esta requisição
    const chaveRequisicao = `${clinicaId}-${page}-${limit}-${search}`;

    // ⭐⭐⭐ FIX LOOP: bloqueia QUALQUER repetição da mesma requisição — não só
    // enquanto carrega, mas também DEPOIS que terminou. Antes, assim que uma
    // requisição idêntica terminava, outra igual podia disparar imediatamente
    // (efeitos/callbacks recriados), prendendo a página num loop de GET /api/pacientes.
    // forcar=true permite refresh intencional (após mutação) com os mesmos parâmetros.
    if (!forcar && ultimaRequisicaoRef.current === chaveRequisicao) {
      console.log('⚠️ [usePacientes] Mesma requisição já carregada/em andamento, ignorando loop...');
      return;
    }

    // ⭐ Evita chamadas simultâneas
    if (carregandoRef.current) {
      console.log('⚠️ [usePacientes] Já está carregando, aguardando...');
      return;
    }
    carregandoRef.current = true;
    ultimaRequisicaoRef.current = chaveRequisicao;
    try {
      setLoading(true);
      console.log(`📋 [usePacientes] Carregando: ${clinicaId} (página ${page}, limite ${limit}, busca: "${search}")`);
      const params = new URLSearchParams({
        clinicaId,
        page: page.toString(),
        limit: limit.toString()
      });
      if (search) {
        params.append('search', search);
      }
      const url = `${API_BASE_URL}/api/pacientes?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [usePacientes] Erro na resposta:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      const result = await response.json();
      console.log(`✅ [usePacientes] Carregados ${result.data?.length} pacientes`);
      setPacientes(result.data || []);
      setPagination(result.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      });
      setError(null);
    } catch (err: any) {
      console.error('❌ Erro ao carregar pacientes:', err);
      setError(err.message);
      setPacientes([]);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }, [clinicaId]);
  const criar = useCallback(async (paciente: Omit<Paciente, 'id' | 'criadoEm'>) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    const response = await fetch(`${API_BASE_URL}/api/pacientes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clinicaId,
        ...paciente
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const novoPaciente = await response.json();
    // Recarrega a lista após criar
    await carregar(pagination.page, pagination.limit, searchTerm, true);
    return novoPaciente;
  }, [clinicaId, carregar, pagination.page, pagination.limit, searchTerm]);
  const atualizar = useCallback(async (id: string, updates: Partial<Paciente>) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    console.log('📝 [usePacientes] Enviando PUT /api/pacientes/' + id);
    console.log('   📞 telefone:', (updates as any).telefone);
    console.log('   👤 nome:', updates.nome);
    const response = await fetch(`${API_BASE_URL}/api/pacientes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clinicaId,
        ...updates
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [usePacientes] PUT falhou:', response.status, errorText);
      throw new Error(`Erro ao salvar: HTTP ${response.status} - ${errorText}`);
    }
    const result = await response.json();
    console.log('✅ [usePacientes] PUT sucesso:', result);

    // Recarrega a lista após atualizar
    await carregar(pagination.page, pagination.limit, searchTerm, true);

    // ⭐ Dispara evento para atualizar consultas na agenda (nome do paciente pode ter mudado)
    console.log('🔄 [usePacientes] Disparando evento consultas-updated para atualizar agenda');
    window.dispatchEvent(new Event('consultas-updated'));

    // ⭐ Aguarda 500ms para garantir que o backend terminou de atualizar a tabela consultas
    await new Promise((resolve) => setTimeout(resolve, 500));

    // ⭐ Dispara novamente para garantir que a agenda recarregue com os dados atualizados
    console.log('🔄 [usePacientes] Disparando segundo evento consultas-updated (após delay)');
    window.dispatchEvent(new Event('consultas-updated'));
    return result;
  }, [clinicaId, carregar, pagination.page, pagination.limit, searchTerm]);
  const deletar = useCallback(async (id: string) => {
    if (!clinicaId) {
      throw new Error('clinicaId não definido');
    }
    const response = await fetch(`${API_BASE_URL}/api/pacientes/${id}?clinicaId=${clinicaId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Recarrega a lista após deletar
    await carregar(pagination.page, pagination.limit, searchTerm, true);
  }, [clinicaId, carregar, pagination.page, pagination.limit, searchTerm]);

  // ⭐ Função buscar - atualiza o termo e carrega
  const buscar = useCallback((termo: string) => {
    console.log('🔍 [usePacientes] buscar() chamado com:', termo);
    setSearchTerm(termo);
    // ⭐⭐⭐ FIX: Salva no localStorage TAMBÉM no hook (redundância para garantir persistência)
    try {
      localStorage.setItem(STORAGE_KEY_BUSCA, termo);
      console.log('💾 [usePacientes] Termo salvo no localStorage:', termo || '(vazio)');
    } catch (e) {
      console.warn('Erro ao salvar termo no localStorage:', e);
    }
    // Reseta para página 1 ao buscar
    carregar(1, pagination.limit, termo);
  }, [carregar, pagination.limit]);
  const irParaPagina = useCallback((page: number) => {
    carregar(page, pagination.limit, searchTerm);
  }, [carregar, pagination.limit, searchTerm]);
  const mudarLimite = useCallback((limit: number) => {
    carregar(1, limit, searchTerm);
  }, [carregar, searchTerm]);

  // ⭐ Effect único - SÓ quando clinicaId REALMENTE muda
  useEffect(() => {
    if (!clinicaId) {
      setLoading(false);
      setPacientes([]);
      return;
    }

    // ⭐ Só carrega se clinicaId mudou de verdade OU é a primeira vez
    if (clinicaIdRef.current === clinicaId && carregouInicialRef.current) {
      console.log('⚠️ [usePacientes] clinicaId não mudou, ignorando effect...');
      return;
    }
    clinicaIdRef.current = clinicaId;
    carregouInicialRef.current = true;
    console.log(`🔄 [usePacientes] Effect: clinicaId = ${clinicaId}`);

    // ⭐ SEMPRE lê o termo do localStorage na carga inicial
    const termoSalvo = lerTermoSalvo();
    console.log(`🔍 [usePacientes] Usando termo salvo: "${termoSalvo}"`);

    // Atualiza o estado do searchTerm se diferente
    if (termoSalvo !== searchTerm) {
      setSearchTerm(termoSalvo);
    }

    // Carrega dados iniciais COM o termo salvo
    carregar(1, 50, termoSalvo);
  }, [clinicaId]); // ⭐ SÓ clinicaId como dependência

  // ⭐ Traz alterações feitas em outros terminais, mantendo página e busca
  useRevalidacao(
    () => carregar(pagination.page, pagination.limit, searchTerm, true),
    { intervalo: 60000, pausado: !clinicaId }
  );

  return {
    pacientes,
    pagination,
    loading,
    error,
    searchTerm,
    criar,
    atualizar,
    deletar,
    buscar,
    irParaPagina,
    mudarLimite,
    recarregar: () => carregar(pagination.page, pagination.limit, searchTerm, true)
  };
}