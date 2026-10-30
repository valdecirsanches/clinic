import React, { useEffect, useState, useRef, lazy, createElement, Component } from 'react';
import { useDocumentos, Documento } from '../hooks/useDocumentos';
import { useToast } from '../hooks/useToast';
import { Swal } from './ui/SweetAlert';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Modal } from './ui/Modal';
import { CameraCapture } from './CameraCapture';
import { ImagePreview } from './ImagePreview';
import { API_BASE_URL } from '../config/api';
import { UploadIcon, FileIcon, FileTextIcon, ImageIcon, TrashIcon, DownloadIcon, EyeIcon, EditIcon, XIcon, FolderIcon, SearchIcon, CameraIcon, SendIcon, MessageCircleIcon, VideoIcon, RefreshCwIcon } from 'lucide-react';
// ⭐⭐⭐ Componente de vídeo robusto - baixa como blob primeiro para evitar CORS e detectar erros ⭐⭐⭐
function VideoPlayer({
  url,
  docId,
  downloadUrl,
  nome





}: {url: string;docId: string;downloadUrl: string;nome: string;}) {
  const [estado, setEstado] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState('');
  const [progresso, setProgresso] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Baixa o vídeo como blob
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    async function carregarVideo() {
      setEstado('loading');
      setProgresso(0);
      setErroMsg('');
      // Limpa blob anterior
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      const videoUrlComRetry = tentativa === 0 ? url : `${url}&_retry=${tentativa}`;
      try {
        console.log(`🎬 [VideoPlayer] Baixando vídeo: ${videoUrlComRetry} (tentativa ${tentativa + 1})`);
        const response = await fetch(videoUrlComRetry, {
          signal: controller.signal
        });
        if (!response.ok) {
          // Tenta ler a mensagem de erro do servidor
          let errorDetail = `HTTP ${response.status}`;
          try {
            const errorBody = await response.text();
            const parsed = JSON.parse(errorBody);
            errorDetail = parsed.error || errorDetail;
          } catch {}
          throw new Error(errorDetail);
        }
        const contentType = response.headers.get('content-type') || '';
        console.log(`🎬 [VideoPlayer] Content-Type: ${contentType}`);
        // Verifica se realmente é um vídeo
        if (contentType.includes('application/json') || contentType.includes('text/html')) {
          const text = await response.text();
          try {
            const parsed = JSON.parse(text);
            throw new Error(parsed.error || 'Servidor retornou JSON em vez de vídeo');
          } catch (e: any) {
            if (e.message.includes('JSON')) throw e;
            throw new Error('Servidor retornou resposta inesperada');
          }
        }
        // Baixa com progresso
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        if (response.body && total > 0) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          while (true) {
            const {
              done,
              value
            } = await reader.read();
            if (done) break;
            if (cancelled) return;
            chunks.push(value);
            received += value.length;
            setProgresso(Math.round(received / total * 100));
          }
          const blob = new Blob(chunks, {
            type: contentType || 'video/mp4'
          });
          if (blob.size < 1000) {
            throw new Error(`Arquivo muito pequeno (${blob.size} bytes) - pode estar corrompido`);
          }
          console.log(`🎬 [VideoPlayer] ✅ Vídeo baixado: ${blob.size} bytes (${Math.round(blob.size / 1024)} KB)`);
          if (!cancelled) {
            const newBlobUrl = URL.createObjectURL(blob);
            setBlobUrl(newBlobUrl);
            setEstado('ready');
          }
        } else {
          // Fallback sem progresso (quando content-length não está disponível)
          const blob = await response.blob();
          if (blob.size < 1000) {
            throw new Error(`Arquivo muito pequeno (${blob.size} bytes) - pode estar corrompido`);
          }
          console.log(`🎬 [VideoPlayer] ✅ Vídeo baixado (sem progresso): ${blob.size} bytes`);
          if (!cancelled) {
            const newBlobUrl = URL.createObjectURL(blob);
            setBlobUrl(newBlobUrl);
            setEstado('ready');
          }
        }
      } catch (err: any) {
        if (cancelled || err.name === 'AbortError') return;
        console.error(`🎬 [VideoPlayer] ❌ Erro:`, err.message);
        setErroMsg(err.message);
        setEstado('error');
      }
    }
    carregarVideo();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, tentativa]);
  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);
  const handleRetry = () => {
    setTentativa((prev) => prev + 1);
  };
  const handleOpenDirect = () => {
    window.open(url, '_blank');
  };
  if (estado === 'error') {
    return <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg">
        <div className="text-center space-y-4 p-6 max-w-md">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
            <VideoIcon className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-gray-300 font-medium">
            Não foi possível carregar o vídeo
          </p>
          {erroMsg && <p className="text-red-400/80 text-xs bg-red-900/20 rounded px-3 py-2 font-mono">
              {erroMsg}
            </p>}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={handleRetry} className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center gap-2">
              
              <RefreshCwIcon className="w-4 h-4" />
              Tentar novamente
            </button>
            <button onClick={handleOpenDirect} className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center gap-2">
              
              <EyeIcon className="w-4 h-4" />
              Abrir no navegador
            </button>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2">
              
              <DownloadIcon className="w-4 h-4" />
              Baixar vídeo
            </a>
          </div>
          <p className="text-gray-600 text-xs">
            Dica: "Abrir no navegador" reproduz direto na aba, ou baixe o vídeo
          </p>
        </div>
      </div>;
  }
  if (estado === 'loading') {
    return <div className="flex items-center justify-center h-full bg-black rounded-lg">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm">
            {progresso > 0 ? `Carregando vídeo... ${progresso}%` : 'Conectando...'}
          </p>
          {progresso > 0 && <div className="w-48 h-1.5 bg-gray-700 rounded-full overflow-hidden mx-auto">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{
            width: `${progresso}%`
          }} />
            
            </div>}
          {tentativa > 0 && <p className="text-gray-600 text-xs">Tentativa {tentativa + 1}</p>}
        </div>
      </div>;
  }
  return <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video ref={videoRef} key={`video_${docId}_${tentativa}`} controls autoPlay={false} playsInline className="w-full h-full object-contain" src={blobUrl || ''} onError={() => {
      console.error(`🎬 [VideoPlayer] Erro no elemento <video> após blob load`);
      setErroMsg('Formato de vídeo não suportado pelo navegador');
      setEstado('error');
    }}>
        
        Seu navegador não suporta reprodução de vídeo.
      </video>
    </div>;
}
interface DocumentosManagerProps {
  clinicaId: string;
  pacienteId: string;
  pacienteNome?: string;
  pacienteTelefone?: string;
  especialidade?: string;
}
const CATEGORIAS = [{
  value: 'exames',
  label: 'Exames',
  icon: '🔬'
}, {
  value: 'laudos',
  label: 'Laudos',
  icon: '📋'
}, {
  value: 'receitas',
  label: 'Receitas',
  icon: '💊'
}, {
  value: 'atestados',
  label: 'Atestados',
  icon: '📄'
}, {
  value: 'imagens',
  label: 'Imagens/Raio-X',
  icon: '🩻'
}, {
  value: 'outros',
  label: 'Outros',
  icon: '📁'
}];
// ⭐ Fonte única das especialidades: usada no filtro, na classificação do
// upload/digitalização e na edição — evita rótulos divergentes entre as telas.
const ESPECIALIDADES = [{
  value: 'Clínico Geral',
  label: '🩺 Clínico Geral'
}, {
  value: 'Ginecologia',
  label: '👩‍⚕️ Ginecologia'
}, {
  value: 'Odontologia',
  label: '🦷 Odontologia'
}, {
  value: 'Pediatria',
  label: '👶 Pediatria'
}, {
  value: 'Ortopedia',
  label: '🦴 Ortopedia'
}, {
  value: 'Dermatologia',
  label: '🧴 Dermatologia'
}, {
  value: 'Cardiologia',
  label: '❤️ Cardiologia'
}, {
  value: 'Oftalmologia',
  label: '👁️ Oftalmologia'
}, {
  value: 'Neurologia',
  label: '🧠 Neurologia'
}, {
  value: 'Psiquiatria',
  label: '🧩 Psiquiatria'
}, {
  value: 'Urologia',
  label: '🏥 Urologia'
}, {
  value: 'Otorrinolaringologia',
  label: '👂 Otorrino'
}, {
  value: 'Endocrinologia',
  label: '💉 Endocrinologia'
}, {
  value: 'Gastroenterologia',
  label: '🫁 Gastroenterologia'
}, {
  value: 'Pneumologia',
  label: '🫁 Pneumologia'
}];
const ESPECIALIDADES_FIXAS = ESPECIALIDADES.map((e) => e.value);
export function DocumentosManager({
  clinicaId,
  pacienteId,
  pacienteNome,
  pacienteTelefone,
  especialidade
}: DocumentosManagerProps) {
  const {
    documentos,
    loading,
    error: loadError,
    carregarDocumentos,
    uploadDocumento,
    atualizarDocumento,
    deletarDocumento,
    getUrlDownload,
    getUrlVisualizacao,
    getUrlDireta,
    formatarTamanho
  } = useDocumentos(clinicaId, pacienteId);
  const {
    success,
    error: showError,
    info
  } = useToast();
  const {
    confirm
  } = Swal;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [documentoSelecionado, setDocumentoSelecionado] = useState<Documento | null>(null);
  const [modalVisualizacao, setModalVisualizacao] = useState(false);
  const [modalEdicao, setModalEdicao] = useState(false);
  const [modalCamera, setModalCamera] = useState(false);
  const [modalSolicitarWhatsApp, setModalSolicitarWhatsApp] = useState(false);
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
  const [formEdicao, setFormEdicao] = useState({
    nome: '',
    categoria: '',
    observacoes: '',
    especialidade: ''
  });
  const [formSolicitacao, setFormSolicitacao] = useState({
    categoria: '',
    especialidade: especialidade || '',
    mensagemPersonalizada: ''
  });
  // ⭐ Classificação obrigatória antes de gravar: nenhum arquivo entra no acervo
  // sem especialidade e categoria explícitas. Os arquivos ficam pendentes até o
  // usuário confirmar — nada é gravado com o valor de um filtro de tela.
  const [modalClassificacao, setModalClassificacao] = useState(false);
  const [arquivosPendentes, setArquivosPendentes] = useState<File[]>([]);
  const [origemPendente, setOrigemPendente] = useState<'upload' | 'camera'>('upload');
  const [formClassificacao, setFormClassificacao] = useState({
    especialidade: especialidade || '',
    categoria: ''
  });
  const [erroClassificacao, setErroClassificacao] = useState('');
  // A especialidade do contexto (profissional/consulta) entra apenas como
  // sugestão inicial — nunca é aplicada em silêncio a documentos já gravados.
  useEffect(() => {
    setFormClassificacao((prev) => ({
      ...prev,
      especialidade: prev.especialidade || especialidade || ''
    }));
  }, [especialidade]);
  // Reset da fila pendente quando muda de paciente
  useEffect(() => {
    setArquivosPendentes([]);
    setModalClassificacao(false);
    setErroClassificacao('');
  }, [pacienteId]);
  // ⭐ Refs estáveis para callbacks usados no SSE (evita reconexões infinitas)
  const carregarDocumentosRef = useRef(carregarDocumentos);
  const infoRef = useRef(info);
  useEffect(() => {
    carregarDocumentosRef.current = carregarDocumentos;
  }, [carregarDocumentos]);
  useEffect(() => {
    infoRef.current = info;
  }, [info]);
  // ⭐ SSE para receber notificações de documentos em tempo real
  // ⭐⭐⭐ FIX: Dependência APENAS em pacienteId - usa refs para callbacks ⭐⭐⭐
  useEffect(() => {
    if (!pacienteId) return;
    console.log(`📡 Conectando SSE para documentos do paciente ${pacienteId}`);
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 3;
    const eventSource = new EventSource(`${API_BASE_URL}/api/sse/paciente/${pacienteId}`);
    eventSource.addEventListener('documento_recebido', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📄 Documento recebido via SSE:', data);
        // Recarrega a lista de documentos usando ref estável
        carregarDocumentosRef.current();
        // Mostra notificação usando ref estável
        infoRef.current('📄 Novo Documento Recebido', `${data.documento?.nome || 'Documento'} foi recebido via WhatsApp!`);
      } catch (err) {
        console.error('Erro ao processar evento SSE:', err);
      }
    });
    eventSource.addEventListener('connected', () => {
      console.log('📡 SSE conectado para documentos');
      reconnectAttempts = 0;
    });
    eventSource.onerror = () => {
      reconnectAttempts++;
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.warn('📡 SSE documentos: máximo de reconexões atingido, desconectando');
        eventSource.close();
      }
    };
    return () => {
      console.log('📡 Desconectando SSE de documentos');
      eventSource.close();
    };
  }, [pacienteId]);
  // ⭐ Polling fallback: recarrega documentos a cada 15s para garantir atualização em tempo real
  // Funciona como backup caso o SSE falhe ou desconecte
  // ⭐⭐⭐ FIX v5: countRef atualiza quando documentos muda (evita stale reference) ⭐⭐⭐
  useEffect(() => {
    if (!pacienteId || !clinicaId) return;
    // Guarda o count atual para detectar mudanças
    const countRef = {
      current: documentos.length
    };
    // ⭐ FIX: Atualiza countRef quando documentos muda externamente
    countRef.current = documentos.length;
    const interval = setInterval(async () => {
      try {
        const url = `${API_BASE_URL}/api/documentos?clinicaId=${clinicaId}&pacienteId=${pacienteId}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          // Só atualiza se a quantidade mudou (evita re-renders desnecessários)
          if (data.length !== countRef.current) {
            console.log(`📄 [Polling] Documentos atualizados: ${countRef.current} → ${data.length}`);
            countRef.current = data.length;
            carregarDocumentosRef.current();
          }
        }
      } catch (err) {


        // Silencioso - polling é apenas fallback
      }}, 10000); // ⭐ FIX v5: Reduzido de 15s para 10s para resposta mais rápida
    return () => clearInterval(interval);
  }, [pacienteId, clinicaId, documentos.length]); // ⭐ FIX v5: Adiciona documentos.length como dependência
  // Pré-seleção a partir dos filtros em uso (apenas sugestão; a confirmação
  // explícita continua obrigatória)
  const sugerirClassificacao = () => {
    setFormClassificacao((prev) => ({
      especialidade: prev.especialidade || (filtroEspecialidade && filtroEspecialidade !== '__sem__' ? filtroEspecialidade : especialidade || ''),
      categoria: prev.categoria || filtroCategoria || ''
    }));
  };
  // Upload de arquivo — apenas enfileira; a gravação só ocorre após classificar
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setArquivosPendentes(Array.from(files));
    setOrigemPendente('upload');
    setErroClassificacao('');
    sugerirClassificacao();
    setModalClassificacao(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  // Digitalização pela câmera — mesma exigência de classificação
  const handleCameraCapture = (file: File) => {
    setArquivosPendentes([file]);
    setOrigemPendente('camera');
    setErroClassificacao('');
    sugerirClassificacao();
    setModalCamera(false);
    setModalClassificacao(true);
  };
  const cancelarClassificacao = () => {
    setModalClassificacao(false);
    setArquivosPendentes([]);
    setErroClassificacao('');
  };
  // Grava os arquivos pendentes com a especialidade e a categoria escolhidas
  const confirmarClassificacaoEEnviar = async () => {
    if (!formClassificacao.especialidade) {
      setErroClassificacao('Selecione a especialidade do documento.');
      return;
    }
    if (!formClassificacao.categoria) {
      setErroClassificacao('Selecione a categoria do documento.');
      return;
    }
    if (arquivosPendentes.length === 0) {
      cancelarClassificacao();
      return;
    }
    const categoriaInfo = CATEGORIAS.find((c) => c.value === formClassificacao.categoria);
    const categoriaNome = categoriaInfo ? categoriaInfo.label : 'Documento';
    setUploading(true);
    setErroClassificacao('');
    try {
      for (const file of arquivosPendentes) {
        await uploadDocumento(file, {
          pacienteId,
          nome: origemPendente === 'camera' ? `${categoriaNome} digitalizado - ${new Date().toLocaleDateString('pt-BR')}` : file.name,
          categoria: formClassificacao.categoria,
          especialidade: formClassificacao.especialidade
        });
      }
      success(origemPendente === 'camera' ? 'Documento Digitalizado' : 'Upload Concluído', `${arquivosPendentes.length} arquivo(s) salvo(s) em ${formClassificacao.especialidade} • ${categoriaNome}.`);
      setModalClassificacao(false);
      setArquivosPendentes([]);
    } catch (err: any) {
      showError('Erro ao Salvar', err.message);
    } finally {
      setUploading(false);
    }
  };
  // Solicitar documento via WhatsApp
  const handleSolicitarWhatsApp = async () => {
    if (!pacienteTelefone) {
      showError('Erro', 'Paciente não possui telefone cadastrado');
      return;
    }
    // A classificação é obrigatória: é ela que define onde o arquivo recebido
    // será arquivado quando o paciente responder.
    if (!formSolicitacao.especialidade) {
      showError('Classificação incompleta', 'Selecione a especialidade do documento solicitado.');
      return;
    }
    if (!formSolicitacao.categoria) {
      showError('Classificação incompleta', 'Selecione a categoria do documento solicitado.');
      return;
    }
    setEnviandoSolicitacao(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/documentos/solicitar-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          pacienteId,
          pacienteNome: pacienteNome || 'Paciente',
          pacienteTelefone,
          categoria: formSolicitacao.categoria || null,
          mensagemPersonalizada: formSolicitacao.mensagemPersonalizada || null,
          especialidade: formSolicitacao.especialidade || null
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar solicitação');
      }
      success('Solicitação Enviada', 'Mensagem enviada via WhatsApp com sucesso!');
      setModalSolicitarWhatsApp(false);
      setFormSolicitacao({
        categoria: '',
        especialidade: especialidade || '',
        mensagemPersonalizada: ''
      });
    } catch (err: any) {
      showError('Erro', err.message);
    } finally {
      setEnviandoSolicitacao(false);
    }
  };
  // Deletar documento
  const handleDelete = async (doc: Documento) => {
    const result = await Swal.fire({
      title: 'Confirmar Exclusão',
      text: `Tem certeza que deseja excluir "${doc.nome}"? Esta ação não pode ser desfeita.`,
      icon: 'warning',
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      showCancelButton: true,
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) return;
    try {
      await deletarDocumento(doc.id);
      success('Documento Excluído', 'Arquivo removido com sucesso!');
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  // Abrir modal de edição
  const handleEdit = (doc: Documento) => {
    setDocumentoSelecionado(doc);
    setFormEdicao({
      nome: doc.nome,
      categoria: doc.categoria,
      observacoes: doc.observacoes || '',
      especialidade: doc.especialidade || ''
    });
    setModalEdicao(true);
  };
  // Salvar edição
  const handleSaveEdit = async () => {
    if (!documentoSelecionado) return;
    try {
      await atualizarDocumento(documentoSelecionado.id, formEdicao);
      success('Documento Atualizado', 'Informações salvas com sucesso!');
      setModalEdicao(false);
      setDocumentoSelecionado(null);
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  // Visualizar documento
  const handleVisualize = (doc: Documento) => {
    setDocumentoSelecionado(doc);
    setModalVisualizacao(true);
  };
  // Filtrar documentos
  const documentosFiltrados = documentos.filter((doc) => {
    const matchCategoria = !filtroCategoria || doc.categoria === filtroCategoria;
    const matchEspecialidade = !filtroEspecialidade || (filtroEspecialidade === '__sem__' ? !doc.especialidade : doc.especialidade === filtroEspecialidade);
    // ⭐ FIX: Protege contra nomeOriginal/nome nulos
    const matchBusca = !busca || (doc.nome || '').toLowerCase().includes(busca.toLowerCase()) || (doc.nomeOriginal || '').toLowerCase().includes(busca.toLowerCase());
    return matchCategoria && matchEspecialidade && matchBusca;
  });
  // Agrupar por categoria (mantido para compatibilidade)
  const documentosPorCategoria = documentosFiltrados.reduce((acc, doc) => {
    const cat = doc.categoria || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {} as Record<string, Documento[]>);
  // ⭐ Agrupar por especialidade (agrupamento principal)
  const documentosPorEspecialidade = documentosFiltrados.reduce((acc, doc) => {
    const esp = doc.especialidade || 'Sem especialidade';
    if (!acc[esp]) acc[esp] = [];
    acc[esp].push(doc);
    return acc;
  }, {} as Record<string, Documento[]>);
  // Helper: verifica se o documento é uma imagem
  const isImageDoc = (doc: Documento): boolean => {
    if (doc.tipo?.startsWith('image/')) return true;
    const caminho = doc.caminho?.toLowerCase() || '';
    const nomeOriginal = doc.nomeOriginal?.toLowerCase() || '';
    const toCheck = caminho + '|' + nomeOriginal;
    return /\.(jpg|jpeg|png|webp|gif|bmp)/.test(toCheck);
  };
  // Ícone baseado no tipo do arquivo
  const getFileIcon = (tipo: string, caminho?: string) => {
    if (tipo.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    }
    if (tipo === 'application/pdf') {
      return <FileTextIcon className="w-5 h-5 text-red-500" />;
    }
    if (tipo.startsWith('video/') || caminho?.match(/\.(mp4|mov|3gp|avi|webm|mkv)$/i)) {
      return <VideoIcon className="w-5 h-5 text-green-500" />;
    }
    if (tipo.startsWith('audio/') || caminho?.match(/\.(ogg|mp3|aac|wav|opus)$/i)) {
      return <VideoIcon className="w-5 h-5 text-blue-500" />;
    }
    return <FileIcon className="w-5 h-5 text-blue-500" />;
  };
  // Verifica se o documento pode ser visualizado
  const podeVisualizar = (doc: Documento) => {
    // Verifica pelo tipo MIME
    if (doc.tipo?.startsWith('image/')) return true;
    if (doc.tipo === 'application/pdf') return true;
    if (doc.tipo?.startsWith('video/')) return true;
    if (doc.tipo?.startsWith('audio/')) return true;
    // Fallback: verifica pela extensão do arquivo
    const caminho = doc.caminho?.toLowerCase() || '';
    const nomeOriginal = doc.nomeOriginal?.toLowerCase() || '';
    const toCheck = caminho + '|' + nomeOriginal;
    // Imagens
    if (/\.(jpg|jpeg|png|webp|gif|bmp)/.test(toCheck)) return true;
    // PDFs
    if (/\.pdf/.test(toCheck)) return true;
    // Vídeos (todas as extensões possíveis do WhatsApp)
    if (/\.(mp4|mov|3gp|avi|webm|mkv)/.test(toCheck)) return true;
    // Áudio
    if (/\.(ogg|mp3|aac|wav|opus)/.test(toCheck)) return true;
    return false;
  };
  // Verifica o tipo real do documento para renderização
  const getTipoVisualizacao = (doc: Documento): 'image' | 'pdf' | 'video' | 'audio' | 'unknown' => {
    // Primeiro verifica pelo tipo MIME
    if (doc.tipo?.startsWith('image/')) return 'image';
    if (doc.tipo === 'application/pdf') return 'pdf';
    if (doc.tipo?.startsWith('video/')) return 'video';
    if (doc.tipo?.startsWith('audio/')) return 'audio';
    // Fallback: verifica pela extensão do caminho E nomeOriginal
    const caminho = doc.caminho?.toLowerCase() || '';
    const nomeOriginal = doc.nomeOriginal?.toLowerCase() || '';
    const toCheck = caminho + '|' + nomeOriginal;
    if (/\.(jpg|jpeg|png|webp|gif|bmp)/.test(toCheck)) return 'image';
    if (/\.pdf/.test(toCheck)) return 'pdf';
    if (/\.(mp4|mov|3gp|avi|webm|mkv)/.test(toCheck)) return 'video';
    if (/\.(ogg|mp3|aac|wav|opus)/.test(toCheck)) return 'audio';
    return 'unknown';
  };
  return <div className="space-y-6">
      {/* Header com Upload */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Documentos do Paciente
          </h3>
          <p className="text-sm text-gray-500">
            {documentos.length} documento(s) armazenado(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,video/*" onChange={handleUpload} className="hidden" />
          

          <Button variant="ghost" size="sm" onClick={() => carregarDocumentos()} title="Atualizar lista">
            
            <RefreshCwIcon className="w-4 h-4" />
          </Button>
          {pacienteTelefone && <Button variant="secondary" onClick={() => {
          // Pré-seleciona pelos filtros em uso (quando houver), mas a confirmação
          // continua sendo explícita.
          setFormSolicitacao((prev) => ({
            ...prev,
            especialidade: prev.especialidade || (filtroEspecialidade && filtroEspecialidade !== '__sem__' ? filtroEspecialidade : especialidade || ''),
            categoria: prev.categoria || filtroCategoria || ''
          }));
          setModalSolicitarWhatsApp(true);
        }} title="Solicitar documento via WhatsApp" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
            
              <MessageCircleIcon className="w-4 h-4 mr-2" />
              Solicitar via WhatsApp
            </Button>}
          <Button variant="secondary" onClick={() => setModalCamera(true)} disabled={uploading} title="Digitalizar documento usando a câmera">
            
            <CameraIcon className="w-4 h-4 mr-2" />
            Digitalizar
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            
            {uploading ? <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Enviando...
              </> : <>
                <UploadIcon className="w-4 h-4 mr-2" />
                Upload
              </>}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input placeholder="Buscar documentos..." value={busca} onChange={(e) => setBusca(e.target.value)} icon={<SearchIcon className="w-4 h-4" />} />
          
        </div>

        {/* Filtro por especialidade - lista fixa + especialidades dos documentos */}
        <div className="w-52">
          <Select value={filtroEspecialidade} onChange={(e) => setFiltroEspecialidade(e.target.value)} options={[{
          value: '',
          label: '🏥 Todas especialidades'
        }, ...ESPECIALIDADES, ...Array.from(new Set(documentos.map((d) => d.especialidade).filter(Boolean))).filter((esp) => !ESPECIALIDADES_FIXAS.includes(esp as string)).map((esp) => ({
          value: esp as string,
          label: `📋 ${esp}`
        })), ...(documentos.some((d) => !d.especialidade) ? [{
          value: '__sem__',
          label: '⚠️ Sem especialidade'
        }] : [])]} />
          
        </div>

        <div className="w-48">
          <Select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} options={[{
          value: '',
          label: 'Todas as categorias'
        }, ...CATEGORIAS.map((c) => ({
          value: c.value,
          label: `${c.icon} ${c.label}`
        }))]} />
          
        </div>
      </div>

      {/* Lista de Documentos */}
      {loading ? <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-2">Carregando documentos...</p>
        </div> : loadError ? <div className="text-center py-12 bg-red-50 rounded-lg border-2 border-dashed border-red-300">
          <XIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 font-medium">
            Erro ao carregar documentos
          </p>
          <p className="text-sm text-red-500 mt-1">{loadError}</p>
          <button onClick={() => carregarDocumentos()} className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm inline-flex items-center gap-2">
          
            <RefreshCwIcon className="w-4 h-4" />
            Tentar novamente
          </button>
        </div> : documentosFiltrados.length === 0 ? <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FolderIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {busca || filtroCategoria || filtroEspecialidade ? 'Nenhum documento encontrado com os filtros aplicados.' : 'Nenhum documento cadastrado ainda.'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Clique em "Upload" para adicionar arquivos ou "Solicitar via
            WhatsApp" para pedir ao paciente.
          </p>
        </div> : <div className="space-y-8">
          {Object.entries(documentosPorEspecialidade).sort(([a], [b]) => {
        // "Sem especialidade" vai por último
        if (a === 'Sem especialidade') return 1;
        if (b === 'Sem especialidade') return -1;
        return a.localeCompare(b);
      }).map(([especialidadeGrupo, docsEsp]) => {
        // Dentro de cada especialidade, agrupa por categoria
        const docsPorCat = docsEsp.reduce((acc, doc) => {
          const cat = doc.categoria || 'outros';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(doc);
          return acc;
        }, {} as Record<string, Documento[]>);
        return <div key={especialidadeGrupo}>
                  {/* Header da especialidade */}
                  <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-blue-200">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-sm">🏥</span>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {especialidadeGrupo}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {docsEsp.length} documento(s)
                      </p>
                    </div>
                  </div>

                  {/* Subcategorias dentro da especialidade */}
                  <div className="space-y-4 ml-2">
                    {Object.entries(docsPorCat).map(([categoria, docs]) => {
              const catInfo = CATEGORIAS.find((c) => c.value === categoria) || {
                label: 'Outros',
                icon: '📁'
              };
              return <div key={categoria}>
                          <h4 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
                            <span>{catInfo.icon}</span>
                            {catInfo.label}
                            <span className="text-gray-400">
                              ({docs.length})
                            </span>
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {docs.map((doc) => <div key={doc.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                          
                                {/* ⭐ Thumbnail de imagem */}
                                {isImageDoc(doc) && <div className="w-full h-40 bg-gray-100 cursor-pointer relative group" onClick={() => handleVisualize(doc)}>
                            
                                    <img src={getUrlDireta(doc)} alt={doc.nome} className="w-full h-full object-cover" loading="lazy" onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const currentSrc = target.src;
                        const apiUrl = getUrlVisualizacao(doc.id);
                        // ⭐ FIX: Tenta fallback para URL da API se a URL direta falhou
                        if (!currentSrc.includes('/api/documentos/')) {
                          console.log(`🔄 [Thumbnail] Fallback para API: ${doc.nome}`);
                          target.src = apiUrl;
                        } else {
                          // Ambas falharam — mostra placeholder em vez de esconder
                          console.error(`❌ [Thumbnail] Ambas URLs falharam para: ${doc.nome}`);
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.classList.add('flex', 'items-center', 'justify-center');
                            const placeholder = document.createElement('div');
                            placeholder.className = 'text-center text-gray-400 p-4';
                            placeholder.innerHTML = '<svg class="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span class="text-xs">Imagem indisponível</span>';
                            parent.appendChild(placeholder);
                          }
                        }
                      }} />
                            

                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                      <EyeIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                    </div>
                                  </div>}

                                <div className="p-4">
                                  <div className="flex items-start gap-3">
                                    {/* Ícone só aparece se NÃO for imagem (imagem já tem thumbnail) */}
                                    {!isImageDoc(doc) && <div className="p-2 bg-gray-100 rounded-lg">
                                        {getFileIcon(doc.tipo, doc.caminho)}
                                      </div>}
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-gray-900 truncate">
                                        {doc.nome}
                                      </h5>
                                      <p className="text-xs text-gray-500 truncate">
                                        {doc.nomeOriginal}
                                      </p>
                                      <p className="text-xs text-gray-400 mt-1">
                                        {formatarTamanho(doc.tamanho)} •{' '}
                                        {new Date(doc.criadoEm).toLocaleDateString('pt-BR')}
                                      </p>
                                      {/* Badge de categoria */}
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {doc.categoria && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                                            {CATEGORIAS.find((c) => c.value === doc.categoria)?.icon || '📁'}{' '}
                                            {CATEGORIAS.find((c) => c.value === doc.categoria)?.label || doc.categoria}
                                          </span>}
                                      </div>
                                      {doc.observacoes && <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                                          {doc.observacoes}
                                        </p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                                    {podeVisualizar(doc) && <Button variant="ghost" size="sm" onClick={() => handleVisualize(doc)} title="Visualizar">
                                
                                        <EyeIcon className="w-4 h-4" />
                                      </Button>}
                                    <a href={getUrlDownload(doc.id)} target="_blank" rel="noopener noreferrer">
                                
                                      <Button variant="ghost" size="sm" title="Download">
                                  
                                        <DownloadIcon className="w-4 h-4" />
                                      </Button>
                                    </a>
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(doc)} title="Editar">
                                
                                      <EditIcon className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(doc)} title="Excluir" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                
                                      <TrashIcon className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>)}
                          </div>
                        </div>;
            })}
                  </div>
                </div>;
      })}
        </div>}

      {/* Modal de Visualização */}
      <Modal isOpen={modalVisualizacao} onClose={() => {
      setModalVisualizacao(false);
      setDocumentoSelecionado(null);
    }} title={documentoSelecionado?.nome || 'Visualizar Documento'} size="large">
        
        {documentoSelecionado && <div className="h-[70vh]">
            {getTipoVisualizacao(documentoSelecionado) === 'image' ? <ImagePreview src={getUrlDireta(documentoSelecionado)} alt={documentoSelecionado.nome} /> : getTipoVisualizacao(documentoSelecionado) === 'pdf' ? <iframe src={getUrlDireta(documentoSelecionado)} className="w-full h-full border-0" title={documentoSelecionado.nome} /> : getTipoVisualizacao(documentoSelecionado) === 'video' ? <VideoPlayer url={getUrlDireta(documentoSelecionado)} docId={documentoSelecionado.id} downloadUrl={getUrlDownload(documentoSelecionado.id)} nome={documentoSelecionado.nome} /> : getTipoVisualizacao(documentoSelecionado) === 'audio' ? <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <VideoIcon className="w-8 h-8 text-blue-600" />
                  </div>
                  <audio key={documentoSelecionado.id} controls src={getUrlDireta(documentoSelecionado)} className="w-full max-w-md" />
              

                  <p className="text-sm text-gray-500">
                    {documentoSelecionado.nome}
                  </p>
                </div>
              </div> : <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <p className="text-gray-500">
                    Visualização não disponível para este tipo de arquivo.
                  </p>
                  <a href={getUrlDownload(documentoSelecionado.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
                
                    <DownloadIcon className="w-4 h-4" />
                    Baixar arquivo
                  </a>
                </div>
              </div>}
          </div>}
      </Modal>

      {/* Modal de Edição */}
      <Modal isOpen={modalEdicao} onClose={() => {
      setModalEdicao(false);
      setDocumentoSelecionado(null);
    }} title="Editar Documento" footer={<>
            <Button variant="ghost" onClick={() => {
        setModalEdicao(false);
        setDocumentoSelecionado(null);
      }}>
            
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </>}>
        
        <div className="space-y-4">
          <Input label="Nome do Documento" value={formEdicao.nome} onChange={(e) => setFormEdicao({
          ...formEdicao,
          nome: e.target.value
        })} />
          

          <Select label="Categoria" value={formEdicao.categoria} onChange={(e) => setFormEdicao({
          ...formEdicao,
          categoria: e.target.value
        })} options={CATEGORIAS.map((c) => ({
          value: c.value,
          label: `${c.icon} ${c.label}`
        }))} />
          

          <Select label="Especialidade" value={formEdicao.especialidade} onChange={(e) => setFormEdicao({
          ...formEdicao,
          especialidade: e.target.value
        })} options={[{
          value: '',
          label: 'Sem especialidade'
        }, ...ESPECIALIDADES]} />
          

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea value={formEdicao.observacoes} onChange={(e) => setFormEdicao({
            ...formEdicao,
            observacoes: e.target.value
          })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Observações sobre o documento..." />
            
          </div>
        </div>
      </Modal>

      {/* Modal de Solicitação via WhatsApp */}
      <Modal isOpen={modalSolicitarWhatsApp} onClose={() => {
      setModalSolicitarWhatsApp(false);
      setFormSolicitacao({
        categoria: '',
        especialidade: especialidade || '',
        mensagemPersonalizada: ''
      });
    }} title="📱 Solicitar Documento via WhatsApp" footer={<>
            <Button variant="ghost" onClick={() => {
        setModalSolicitarWhatsApp(false);
        setFormSolicitacao({
          categoria: '',
          especialidade: especialidade || '',
          mensagemPersonalizada: ''
        });
      }}>
            
              Cancelar
            </Button>
            <Button onClick={handleSolicitarWhatsApp} disabled={enviandoSolicitacao} className="bg-green-600 hover:bg-green-700">
            
              {enviandoSolicitacao ? <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Enviando...
                </> : <>
                  <SendIcon className="w-4 h-4 mr-2" />
                  Enviar Solicitação
                </>}
            </Button>
          </>}>
        
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              <strong>📤 Enviar para:</strong> {pacienteNome || 'Paciente'}
            </p>
            <p className="text-sm text-green-700 mt-1">
              <strong>📱 Telefone:</strong> {pacienteTelefone}
            </p>
          </div>

          <Select label="Especialidade *" value={formSolicitacao.especialidade} onChange={(e) => setFormSolicitacao({
          ...formSolicitacao,
          especialidade: e.target.value
        })} options={[{
          value: '',
          label: 'Selecione a especialidade...'
        }, ...ESPECIALIDADES]} />

          <Select label="Categoria *" value={formSolicitacao.categoria} onChange={(e) => setFormSolicitacao({
          ...formSolicitacao,
          categoria: e.target.value
        })} options={[{
          value: '',
          label: 'Selecione a categoria...'
        }, ...CATEGORIAS.map((c) => ({
          value: c.value,
          label: `${c.icon} ${c.label}`
        }))]} />

          <p className="text-xs text-gray-500">
            O arquivo enviado pelo paciente será arquivado exatamente nesta
            especialidade e categoria.
          </p>
          

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem Personalizada (opcional)
            </label>
            <textarea value={formSolicitacao.mensagemPersonalizada} onChange={(e) => setFormSolicitacao({
            ...formSolicitacao,
            mensagemPersonalizada: e.target.value
          })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="Ex: Por favor, envie o resultado do exame de sangue solicitado na última consulta." />
            
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-600">
              <strong>ℹ️ Como funciona:</strong>
            </p>
            <ul className="text-xs text-gray-500 mt-2 space-y-1">
              <li>• O paciente receberá uma mensagem no WhatsApp</li>
              <li>• Ele poderá enviar foto ou arquivo do documento</li>
              <li>• O documento será salvo automaticamente nesta seção</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Modal de Classificação obrigatória (upload e digitalização) */}
      <Modal isOpen={modalClassificacao} onClose={cancelarClassificacao} title={origemPendente === 'camera' ? '📷 Classificar documento digitalizado' : '📤 Classificar documento(s)'} footer={<>
            <Button variant="ghost" onClick={cancelarClassificacao} disabled={uploading}>
              Cancelar
            </Button>
            <Button onClick={confirmarClassificacaoEEnviar} disabled={uploading}>
              {uploading ? <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Salvando...
                </> : 'Salvar documento(s)'}
            </Button>
          </>}>
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900 font-medium">
              {arquivosPendentes.length} arquivo(s) aguardando classificação
            </p>
            <ul className="mt-1 text-xs text-blue-700 space-y-0.5 max-h-24 overflow-y-auto">
              {arquivosPendentes.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">
                  • {file.name}
                </li>)}
            </ul>
          </div>

          <Select label="Especialidade *" value={formClassificacao.especialidade} onChange={(e) => setFormClassificacao({
          ...formClassificacao,
          especialidade: e.target.value
        })} options={[{
          value: '',
          label: 'Selecione a especialidade...'
        }, ...ESPECIALIDADES]} />

          <Select label="Categoria *" value={formClassificacao.categoria} onChange={(e) => setFormClassificacao({
          ...formClassificacao,
          categoria: e.target.value
        })} options={[{
          value: '',
          label: 'Selecione a categoria...'
        }, ...CATEGORIAS.map((c) => ({
          value: c.value,
          label: `${c.icon} ${c.label}`
        }))]} />

          {erroClassificacao && <p className="text-sm text-red-600" role="alert">
              {erroClassificacao}
            </p>}

          <p className="text-xs text-gray-500">
            A classificação é gravada no documento e define onde ele aparece nos
            filtros por especialidade e categoria.
          </p>
        </div>
      </Modal>

      {/* Modal de Captura via Câmera */}
      <CameraCapture isOpen={modalCamera} onClose={() => setModalCamera(false)} onCapture={handleCameraCapture} title="📷 Digitalizar Documento" />
      
    </div>;
}