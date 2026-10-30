import React, { useCallback, useEffect, useState, useRef, Component } from 'react';
import { Button } from './ui/Button';
import { CameraCapture } from './CameraCapture';
import { Modal } from './ui/Modal';
import { CameraIcon, UserIcon, TrashIcon, UploadIcon, MessageCircleIcon, SmartphoneIcon, ClockIcon, DownloadIcon, Loader2Icon, RefreshCwIcon, WifiIcon, ZoomInIcon, XIcon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { API_BASE_URL } from '../config/api';
interface PatientPhotoProps {
  fotoUrl?: string;
  onPhotoChange: (file: File | null) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  editable?: boolean;
  pacienteNome?: string;
  pacienteTelefone?: string;
  clinicaNome?: string;
  pacienteId?: string;
  clinicaId?: string;
  onFotoAtualizada?: (novaFotoUrl: string) => void;
}
export function PatientPhoto({
  fotoUrl,
  onPhotoChange,
  size = 'md',
  editable = true,
  pacienteNome,
  pacienteTelefone,
  clinicaNome,
  pacienteId,
  clinicaId,
  onFotoAtualizada
}: PatientPhotoProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [solicitacaoEnviada, setSolicitacaoEnviada] = useState(false);
  const [buscandoFotoWhatsApp, setBuscandoFotoWhatsApp] = useState(false);
  const [atualizandoFoto, setAtualizandoFoto] = useState(false);
  const [sseConectado, setSseConectado] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // ⭐⭐⭐ CORREÇÃO: Refs estáveis para callbacks e dados que mudam frequentemente ⭐⭐⭐
  const onFotoAtualizadaRef = useRef(onFotoAtualizada);
  const pacienteNomeRef = useRef(pacienteNome);
  const {
    success,
    error: showError
  } = useToast();
  // ⭐ Refs estáveis para pacienteId e clinicaId (usados no upload)
  const pacienteIdRef = useRef(pacienteId);
  const clinicaIdRef = useRef(clinicaId);
  // ⭐⭐⭐ FIX v14: Ref para tracking da fotoUrl do servidor (evita stale closure no polling) ⭐⭐⭐
  const lastKnownFotoUrlRef = useRef<string | null>(fotoUrl || null);
  useEffect(() => {
    pacienteIdRef.current = pacienteId;
  }, [pacienteId]);
  useEffect(() => {
    clinicaIdRef.current = clinicaId;
  }, [clinicaId]);
  useEffect(() => {
    lastKnownFotoUrlRef.current = fotoUrl || null;
  }, [fotoUrl]);
  // ⭐⭐⭐ FIX v11.1: useCallback estável para upload direto ao servidor ⭐⭐⭐
  // Resolve instabilidade onde a função era recriada a cada render
  const uploadFotoDiretaAoServidor = useCallback(async (file: File, fonte: string = 'whatsapp'): Promise<string | null> => {
    const pId = pacienteIdRef.current;
    const cId = clinicaIdRef.current;
    if (!pId || !cId) {
      console.log(`⚠️ [PatientPhoto] Upload direto impossível: pacienteId=${pId}, clinicaId=${cId}`);
      return null;
    }
    try {
      // Busca operadoraId da sessão
      let operadoraId = '';
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        operadoraId = parsed.clinicaAtual?.operadoraId || parsed.operadoraAtual?.id || '';
      }
      const formDataUpload = new FormData();
      formDataUpload.append('foto', file);
      formDataUpload.append('operadoraId', operadoraId);
      formDataUpload.append('clinicaId', cId);
      formDataUpload.append('pacienteId', pId);
      console.log(`📤 [PatientPhoto] Upload direto ao servidor (${fonte})...`);
      console.log(`   - pacienteId: ${pId}`);
      console.log(`   - clinicaId: ${cId}`);
      console.log(`   - arquivo: ${file.name}, ${file.size} bytes`);
      const response = await fetch(`${API_BASE_URL}/api/pacientes/foto`, {
        method: 'POST',
        body: formDataUpload
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [PatientPhoto] Erro no upload direto: ${response.status} - ${errorText}`);
        return null;
      }
      const data = await response.json();
      console.log(`✅ [PatientPhoto] Foto salva no servidor via upload direto: ${data.url}`);
      // ⭐ Atualiza o campo fotoUrl do paciente no banco
      try {
        await fetch(`${API_BASE_URL}/api/pacientes/${pId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId: cId,
            fotoUrl: data.url
          })
        });
        console.log(`✅ [PatientPhoto] fotoUrl atualizada no cadastro do paciente`);
      } catch (updateErr) {
        console.warn(`⚠️ [PatientPhoto] Erro ao atualizar fotoUrl no cadastro:`, updateErr);
      }
      return data.url;
    } catch (err: any) {
      console.error(`❌ [PatientPhoto] Erro no upload direto:`, err.message);
      return null;
    }
  }, []); // ⭐ Estável - usa refs para valores que mudam
  // Mantém refs atualizadas sem causar re-render do SSE
  useEffect(() => {
    onFotoAtualizadaRef.current = onFotoAtualizada;
  }, [onFotoAtualizada]);
  useEffect(() => {
    pacienteNomeRef.current = pacienteNome;
  }, [pacienteNome]);
  // Conecta ao SSE para receber notificações em tempo real
  // ⭐⭐⭐ FIX v12: SSE só conecta quando o usuário EXPLICITAMENTE solicitou foto via WhatsApp ⭐⭐⭐
  useEffect(() => {
    if (!pacienteId) return;
    // ⭐ Só conecta SSE se o usuário solicitou foto via WhatsApp (não automaticamente)
    if (!solicitacaoEnviada) {
      // Desconecta SSE se existir (caso solicitação tenha sido resetada)
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setSseConectado(false);
      }
      return;
    }
    console.log(`📡 [PatientPhoto] Conectando SSE para paciente ${pacienteId} (solicitação ativa)...`);
    // Fecha conexão anterior se existir
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 2; // ⭐ Máximo 2 tentativas de reconexão
    const eventSource = new EventSource(`${API_BASE_URL}/api/sse/paciente/${pacienteId}`);
    eventSourceRef.current = eventSource;
    eventSource.onopen = () => {
      console.log(`📡 [PatientPhoto] SSE conectado para paciente ${pacienteId}`);
      setSseConectado(true);
    };
    eventSource.addEventListener('connected', (event) => {
      console.log(`📡 [PatientPhoto] SSE: Evento connected recebido`);
      setSseConectado(true);
    });
    eventSource.addEventListener('foto_atualizada', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`📷 [PatientPhoto] SSE: Foto atualizada recebida!`, data);
        console.log(`📷 [PatientPhoto] Comparando pacienteId: SSE="${data.pacienteId}" (${typeof data.pacienteId}) vs prop="${pacienteId}" (${typeof pacienteId})`);
        // ⭐⭐⭐ CORREÇÃO: Usa String() para comparação segura (SQLite pode retornar número) ⭐⭐⭐
        if (String(data.pacienteId) === String(pacienteId) && data.fotoUrl) {
          // Atualiza a foto com cache busting
          const fullUrl = data.fotoUrl.startsWith('/uploads') ? `${API_BASE_URL}${data.fotoUrl}?t=${Date.now()}` : data.fotoUrl;
          console.log(`📷 [PatientPhoto] ✅ Match! Atualizando previewUrl para: ${fullUrl}`);
          // ⭐ FIX v14: Atualiza ref para evitar detecção duplicada no polling
          lastKnownFotoUrlRef.current = data.fotoUrl;
          setPreviewUrl(fullUrl);
          setSolicitacaoEnviada(false);
          // Notifica o componente pai usando ref estável
          if (onFotoAtualizadaRef.current) {
            onFotoAtualizadaRef.current(data.fotoUrl);
          }
          success('📸 Foto Recebida!', `Nova foto recebida via WhatsApp para ${data.pacienteNome || pacienteNomeRef.current}`);
        } else {
          console.log(`📷 [PatientPhoto] ❌ pacienteId não corresponde ou fotoUrl vazia. Ignorando.`);
        }
      } catch (err) {
        console.error(`📡 [PatientPhoto] Erro ao processar evento SSE:`, err);
      }
    });
    eventSource.addEventListener('heartbeat', () => {


      // Heartbeat recebido - conexão está viva
    });eventSource.onerror = (err) => {
      console.error(`📡 [PatientPhoto] Erro SSE:`, err);
      setSseConectado(false);
      reconnectAttempts++;
      // ⭐ Se falhou muitas vezes, fecha e não reconecta
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.warn(`📡 [PatientPhoto] SSE: máximo de reconexões atingido, desconectando`);
        eventSource.close();
        eventSourceRef.current = null;
      }
    };
    // Cleanup ao desmontar
    return () => {
      console.log(`📡 [PatientPhoto] Desconectando SSE para paciente ${pacienteId}`);
      eventSource.close();
      eventSourceRef.current = null;
      setSseConectado(false);
    };
  }, [pacienteId, solicitacaoEnviada]); // ⭐⭐⭐ FIX v12: Conecta SSE apenas quando solicitação ativa ⭐⭐⭐
  // Atualiza previewUrl quando fotoUrl muda (ex: ao carregar paciente)
  useEffect(() => {
    console.log('🖼️ [PatientPhoto] fotoUrl recebida:', fotoUrl);
    if (fotoUrl) {
      // Se a URL começa com /uploads, adiciona a base URL do servidor
      if (fotoUrl.startsWith('/uploads')) {
        // Adiciona timestamp para forçar recarregamento (cache busting)
        const fullUrl = `${API_BASE_URL}${fotoUrl}?t=${Date.now()}`;
        console.log('🖼️ [PatientPhoto] URL completa:', fullUrl);
        setPreviewUrl(fullUrl);
      } else if (fotoUrl.startsWith('http') || fotoUrl.startsWith('blob:')) {
        setPreviewUrl(fotoUrl);
      } else {
        setPreviewUrl(fotoUrl);
      }
    } else {
      setPreviewUrl(null);
    }
  }, [fotoUrl]);
  // ⭐⭐⭐ FIX v12: AUTO-FETCH REMOVIDO ⭐⭐⭐
  // A foto do paciente agora é carregada APENAS do banco de dados (via prop fotoUrl).
  // Se não tem foto, fica sem foto. O usuário pode buscar manualmente via botões:
  // - Câmera, Arquivo, WhatsApp (solicitar ou buscar perfil), Atualizar
  // ⭐⭐⭐ FIX v13: POLLING FALLBACK quando solicitação ativa ⭐⭐⭐
  // Usa ref para comparação (evita stale closure do previewUrl)
  useEffect(() => {
    if (!pacienteId || !clinicaId || !solicitacaoEnviada) return;
    console.log(`🔄 [PatientPhoto] Polling ativado para paciente ${pacienteId} (solicitação ativa)`);
    const interval = setInterval(async () => {
      try {
        const cId = clinicaIdRef.current || clinicaId;
        const response = await fetch(`${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${cId}`);
        if (!response.ok) return;
        const paciente = await response.json();
        if (paciente.fotoUrl) {
          // ⭐⭐⭐ FIX v14: Compara com ref (sempre atualizada) em vez de closure stale ⭐⭐⭐
          const serverFotoUrl = paciente.fotoUrl;
          const lastKnown = lastKnownFotoUrlRef.current || '';
          if (serverFotoUrl !== lastKnown) {
            console.log(`🔄 [PatientPhoto] Polling: Nova foto detectada!`);
            console.log(`   Anterior: ${lastKnown}`);
            console.log(`   Nova: ${serverFotoUrl}`);
            const fullUrl = serverFotoUrl.startsWith('/uploads') ? `${API_BASE_URL}${serverFotoUrl}?t=${Date.now()}` : serverFotoUrl;
            // Atualiza ref ANTES de setar state (evita detecção duplicada)
            lastKnownFotoUrlRef.current = serverFotoUrl;
            setPreviewUrl(fullUrl);
            setSolicitacaoEnviada(false);
            if (onFotoAtualizadaRef.current) {
              onFotoAtualizadaRef.current(serverFotoUrl);
            }
            success('📸 Foto Recebida!', `Nova foto recebida via WhatsApp para ${pacienteNomeRef.current || 'paciente'}`);
          }
        }
      } catch (err) {


        // Silencioso - polling é apenas fallback
      }}, 5000); // ⭐ FIX v14: Reduzido para 5s para resposta mais rápida
    return () => {
      console.log(`🔄 [PatientPhoto] Polling desativado para paciente ${pacienteId}`);
      clearInterval(interval);
    };
  }, [pacienteId, clinicaId, solicitacaoEnviada]);
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
    xl: 'w-40 h-40',
    xxl: 'w-48 h-48'
  };
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16',
    xxl: 'w-20 h-20'
  };
  // Tamanhos maiores para melhor qualidade de renderização
  const imageSizes = {
    sm: 64,
    md: 96,
    lg: 128,
    xl: 160,
    xxl: 192
  };
  const handleCameraCapture = (file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onPhotoChange(file);
    setShowCamera(false);
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onPhotoChange(file);
    }
  };
  const handleRemovePhoto = () => {
    setPreviewUrl(null);
    onPhotoChange(null);
    setSolicitacaoEnviada(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  // Atualizar foto do servidor (busca a foto mais recente)
  const handleAtualizarFoto = async () => {
    if (!pacienteId || !clinicaId) {
      // Tenta pegar da sessão
      const sessao = localStorage.getItem('sessao');
      if (!sessao) {
        showError('Erro', 'Não foi possível identificar o paciente');
        return;
      }
    }
    const sessao = localStorage.getItem('sessao');
    const parsed = sessao ? JSON.parse(sessao) : {};
    const cId = clinicaId || parsed.clinicaAtual?.id;
    if (!pacienteId || !cId) {
      showError('Erro', 'Paciente ou clínica não identificados');
      return;
    }
    setAtualizandoFoto(true);
    try {
      console.log('🔄 [PatientPhoto] Buscando foto atualizada do servidor...');
      console.log('   - pacienteId:', pacienteId);
      console.log('   - clinicaId:', cId);
      const response = await fetch(`${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${cId}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar dados do paciente');
      }
      const paciente = await response.json();
      console.log('📋 [PatientPhoto] Paciente retornado:', paciente.nome);
      console.log('📷 [PatientPhoto] fotoUrl do servidor:', paciente.fotoUrl);
      if (paciente.fotoUrl) {
        // Adiciona timestamp para forçar recarregamento
        const fullUrl = paciente.fotoUrl.startsWith('/uploads') ? `${API_BASE_URL}${paciente.fotoUrl}?t=${Date.now()}` : paciente.fotoUrl;
        setPreviewUrl(fullUrl);
        setSolicitacaoEnviada(false);
        // Notifica o componente pai sobre a nova foto
        if (onFotoAtualizada) {
          onFotoAtualizada(paciente.fotoUrl);
        }
        success('Foto Atualizada!', 'A foto foi carregada do servidor');
      } else {
        showError('Sem Foto', 'O paciente ainda não possui foto cadastrada');
      }
    } catch (err: any) {
      console.error('❌ [PatientPhoto] Erro ao atualizar foto:', err);
      showError('Erro', err.message || 'Não foi possível atualizar a foto');
    } finally {
      setAtualizandoFoto(false);
    }
  };
  // Buscar foto do perfil do WhatsApp
  const handleBuscarFotoWhatsApp = async () => {
    if (!pacienteTelefone) {
      showError('Erro', 'Paciente não possui telefone cadastrado');
      return;
    }
    // Busca configuração do WhatsApp da sessão
    const sessao = localStorage.getItem('sessao');
    if (!sessao) {
      showError('Erro', 'Sessão não encontrada');
      return;
    }
    const parsed = JSON.parse(sessao);
    const cId = clinicaId || parsed.clinicaAtual?.id;
    const operadoraId = parsed.clinicaAtual?.operadoraId || parsed.operadoraAtual?.id;
    if (!cId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    setBuscandoFotoWhatsApp(true);
    try {
      // Busca config do WhatsApp
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${cId}`);
      if (!configResponse.ok) {
        throw new Error('Configuração do WhatsApp não encontrada');
      }
      const config = await configResponse.json();
      if (!config.serverUrl || !config.sessionName) {
        throw new Error('WhatsApp não configurado corretamente');
      }
      // Formata o número - IGUAL À AGENDA
      let telefone = (pacienteTelefone || '').replace(/\D/g, '');
      if (telefone.length <= 11) {
        telefone = '55' + telefone;
      }
      console.log('📞 [PatientPhoto] Telefone formatado:', telefone);
      console.log('🔗 [PatientPhoto] Server URL:', config.serverUrl);
      console.log('🔗 [PatientPhoto] Session:', config.sessionName);
      // USA O MESMO ENDPOINT QUE A AGENDA: contact-info via proxy
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/contact-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl: config.serverUrl,
          sessionName: config.sessionName,
          number: telefone
        })
      });
      console.log('📡 [PatientPhoto] Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [PatientPhoto] Erro:', errorText);
        throw new Error(`Erro ${response.status}: ${errorText}`);
      }
      const result = await response.json();
      console.log('✅ [PatientPhoto] Resultado:', JSON.stringify(result, null, 2));
      // Extrai dados do contato (igual à agenda)
      const contactData = result.contact || result;
      const profilePicUrl = contactData.profilePicUrl || contactData.imgUrl || contactData.picture || contactData.profilePic || null;
      console.log('🖼️ [PatientPhoto] profilePicUrl:', profilePicUrl ? profilePicUrl.substring(0, 80) + '...' : '(null)');
      // ⭐⭐⭐ FIX v10.0: Log detalhado para diagnóstico ⭐⭐⭐
      console.log('🔍 [PatientPhoto] contactData completo:', JSON.stringify({
        name: contactData.name,
        number: contactData.number,
        isRegistered: contactData.isRegistered,
        hasProfilePic: !!profilePicUrl,
        profilePicType: profilePicUrl ? profilePicUrl.startsWith('data:') ? 'base64' : profilePicUrl.startsWith('http') ? 'url' : 'outro' : 'null',
        profilePicLength: profilePicUrl?.length || 0
      }));
      if (profilePicUrl) {
        console.log('🖼️ [PatientPhoto] Foto encontrada:', profilePicUrl.substring(0, 80));
        try {
          let fileParaUpload: File | null = null;
          let urlParaPreview: string = profilePicUrl;
          if (profilePicUrl.startsWith('data:image')) {
            console.log('🖼️ [PatientPhoto] Foto é base64 - convertendo para File');
            try {
              const base64Part = profilePicUrl.split(',')[1];
              if (!base64Part) throw new Error('Base64 inválido');
              const mimeMatch = profilePicUrl.match(/data:([^;]+)/);
              const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
              const byteChars = atob(base64Part);
              const byteArray = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) {
                byteArray[i] = byteChars.charCodeAt(i);
              }
              const blob = new Blob([byteArray], {
                type: mime
              });
              fileParaUpload = new File([blob], 'whatsapp_photo.jpg', {
                type: mime
              });
              urlParaPreview = URL.createObjectURL(blob);
              console.log(`🖼️ [PatientPhoto] ✅ Convertido: ${blob.size} bytes, tipo: ${mime}`);
            } catch (convErr) {
              console.warn('⚠️ [PatientPhoto] Erro na conversão manual, usando data URL direto:', convErr);
              urlParaPreview = profilePicUrl;
            }
          } else if (profilePicUrl.startsWith('http')) {
            console.log('🖼️ [PatientPhoto] Foto é URL HTTP - tentando baixar');
            try {
              const imageResponse = await fetch(profilePicUrl);
              if (imageResponse.ok) {
                const blob = await imageResponse.blob();
                fileParaUpload = new File([blob], 'whatsapp_photo.jpg', {
                  type: blob.type || 'image/jpeg'
                });
                urlParaPreview = URL.createObjectURL(blob);
                console.log(`🖼️ [PatientPhoto] ✅ Baixado: ${blob.size} bytes`);
              } else {
                throw new Error(`HTTP ${imageResponse.status}`);
              }
            } catch (dlErr) {
              console.warn('⚠️ [PatientPhoto] Não conseguiu baixar, usando URL direta:', dlErr);
              urlParaPreview = profilePicUrl;
            }
          }
          // Atualiza preview
          setPreviewUrl(urlParaPreview);
          // ⭐⭐⭐ FIX v11.0: Upload DIRETO ao servidor + notifica componente pai ⭐⭐⭐
          if (fileParaUpload) {
            onPhotoChange(fileParaUpload);
            // Upload direto ao servidor (não depende mais do botão "Salvar")
            const urlSalva = await uploadFotoDiretaAoServidor(fileParaUpload, 'manual-busca');
            if (urlSalva) {
              if (onFotoAtualizadaRef.current) {
                onFotoAtualizadaRef.current(urlSalva);
              }
              success('Foto Salva!', 'Foto do perfil do WhatsApp salva automaticamente no cadastro do paciente.');
            } else {
              success('Foto Obtida!', 'Foto carregada. Clique "Salvar Alterações" para persistir.');
            }
          } else {
            console.log('⚠️ [PatientPhoto] Sem File para upload, apenas preview');
            success('Foto Encontrada', 'Foto do WhatsApp encontrada. ⚠️ Qualidade pode ser limitada.');
          }
        } catch (err: any) {
          console.error('❌ [PatientPhoto] Erro geral ao processar foto:', err);
          // Último recurso: mostra a URL diretamente
          setPreviewUrl(profilePicUrl);
          success('Foto Encontrada', 'Foto do WhatsApp encontrada. ⚠️ Qualidade pode ser limitada.');
        }
      } else {
        // ⭐ CORREÇÃO: Verifica se o contato está registrado de forma mais robusta
        const isRegistered = contactData.isRegistered;
        if (isRegistered === false) {
          showError('Não Registrado', 'Este número não está registrado no WhatsApp');
        } else if (contactData.message) {
          showError('Indisponível', contactData.message);
        } else {
          console.error('❌ [PatientPhoto] Foto não encontrada. Detalhes:', JSON.stringify({
            isRegistered: contactData.isRegistered,
            name: contactData.name,
            number: contactData.number,
            allKeys: Object.keys(contactData)
          }));
          showError('Sem Foto de Perfil', `${contactData.name ? `Contato "${contactData.name}" encontrado, mas` : 'O contato'} não possui foto de perfil visível no WhatsApp. A foto pode estar oculta por privacidade. Use "Solicitar Foto em Alta Qualidade" para pedir diretamente ao paciente.`);
        }
      }
    } catch (err: any) {
      console.error('❌ [PatientPhoto] Erro ao buscar foto do WhatsApp:', err);
      showError('Erro', err.message || 'Não foi possível buscar a foto do WhatsApp');
    } finally {
      setBuscandoFotoWhatsApp(false);
      setShowWhatsAppModal(false);
    }
  };
  // Solicitar foto via WhatsApp - AGORA ENVIA DIRETO PELO SERVIDOR
  const handleSolicitarWhatsApp = async () => {
    if (!pacienteTelefone) {
      showError('Erro', 'Paciente não possui telefone cadastrado');
      return;
    }
    // Busca configuração do WhatsApp da sessão
    const sessao = localStorage.getItem('sessao');
    if (!sessao) {
      showError('Erro', 'Sessão não encontrada');
      return;
    }
    const parsed = JSON.parse(sessao);
    const cId = clinicaId || parsed.clinicaAtual?.id;
    if (!cId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    // ⭐ VALIDAÇÃO: Precisa do pacienteId para salvar no histórico
    if (!pacienteId) {
      showError('Erro', 'ID do paciente não identificado');
      return;
    }
    try {
      // Busca config do WhatsApp
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${cId}`);
      if (!configResponse.ok) {
        showError('WhatsApp Não Configurado', 'Configure o WhatsApp nas configurações da clínica antes de usar esta função.');
        setShowWhatsAppModal(false);
        return;
      }
      const config = await configResponse.json();
      if (!config.serverUrl || !config.sessionName) {
        showError('WhatsApp Não Configurado', 'O servidor de WhatsApp não está configurado corretamente. Verifique as configurações.');
        setShowWhatsAppModal(false);
        return;
      }
      // Formata o número
      let telefone = pacienteTelefone.replace(/\D/g, '');
      if (telefone.length <= 11) {
        telefone = '55' + telefone;
      }
      const primeiroNome = pacienteNome?.split(' ')[0] || 'paciente';
      const nomeClinica = clinicaNome || 'nossa clínica';
      // ⭐ MENSAGEM COM PALAVRAS-CHAVE PARA IDENTIFICAÇÃO
      const mensagem = `Olá ${primeiroNome}! 👋\n\n` + `Aqui é da *${nomeClinica}*.\n\n` + `Para completar seu cadastro, precisamos de uma *foto sua* (tipo 3x4 ou selfie de rosto).\n\n` + `📸 *Como enviar:*\n` + `1. Tire uma foto do seu rosto (fundo claro)\n` + `2. Envie aqui nesta conversa\n\n` + `A foto será usada para sua identificação na clínica.\n\n` + `Digite *0* para cancelar.\n\n` + `Obrigado! 🙏`;
      console.log('📤 [PatientPhoto] Enviando solicitação de foto via servidor...');
      console.log('📞 [PatientPhoto] Número:', telefone);
      console.log('👤 [PatientPhoto] PacienteId:', pacienteId);
      console.log('👤 [PatientPhoto] PacienteNome:', pacienteNome);
      console.log('🏥 [PatientPhoto] ClinicaId:', cId);
      // ⭐⭐⭐ PRIMEIRO: Inicia o diálogo de foto em memória ⭐⭐⭐
      try {
        const dialogoResponse = await fetch(`${API_BASE_URL}/api/whatsapp/iniciar-dialogo-foto`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId: cId,
            pacienteId: pacienteId,
            pacienteNome: pacienteNome || primeiroNome,
            telefone: telefone
          })
        });
        if (dialogoResponse.ok) {
          const dialogoResult = await dialogoResponse.json();
          console.log('✅ [PatientPhoto] Diálogo de foto iniciado:', dialogoResult);
        } else {
          console.warn('⚠️ [PatientPhoto] Não foi possível iniciar diálogo de foto');
        }
      } catch (dialogoErr) {
        console.warn('⚠️ [PatientPhoto] Erro ao iniciar diálogo:', dialogoErr);
      }
      // ⭐ SEGUNDO: Envia a mensagem
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl: config.serverUrl,
          sessionName: config.sessionName,
          number: telefone,
          message: mensagem,
          clinicaId: cId,
          pacienteId: pacienteId,
          pacienteNome: pacienteNome || primeiroNome
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao enviar: ${errorText}`);
      }
      const result = await response.json();
      console.log('✅ [PatientPhoto] Mensagem enviada e salva no histórico:', result);
      setSolicitacaoEnviada(true);
      setShowWhatsAppModal(false);
      success('Solicitação Enviada!', `Mensagem enviada para ${pacienteNome}. A foto será atualizada automaticamente quando recebida. O paciente tem 5 minutos para enviar.`);
    } catch (err: any) {
      console.error('❌ [PatientPhoto] Erro ao enviar solicitação:', err);
      // NÃO abre wa.me - mostra erro ao usuário
      showError('Serviço Indisponível', 'Não foi possível enviar a solicitação via WhatsApp. Verifique se o servidor de WhatsApp está conectado e tente novamente.');
      setShowWhatsAppModal(false);
    }
  };
  return <div className="flex flex-col items-center gap-3">
      {/* Foto ou Placeholder */}
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center relative group cursor-pointer`} onClick={() => previewUrl && setShowZoomModal(true)} title={previewUrl ? 'Clique para ampliar' : undefined}>
        
        {previewUrl ? <>
            <img src={previewUrl} alt="Foto do paciente" className="w-full h-full object-cover" loading="eager" onError={(e) => {
          const target = e.target as HTMLImageElement;
          console.error('❌ [PatientPhoto] Erro ao carregar imagem:', previewUrl?.substring(0, 120));
          console.error('   URL completa:', previewUrl);
          // Tenta sem cache busting (remove ?t=...)
          if (previewUrl && previewUrl.includes('?t=')) {
            const urlSemCache = previewUrl.split('?t=')[0];
            console.log('🔄 [PatientPhoto] Tentando sem cache busting:', urlSemCache);
            target.src = urlSemCache;
            target.onerror = () => {
              console.error('❌ [PatientPhoto] Falhou também sem cache busting');
              // Tenta com protocolo diferente (http vs https)
              if (urlSemCache.startsWith('https://')) {
                const httpUrl = urlSemCache.replace('https://', 'http://');
                console.log('🔄 [PatientPhoto] Tentando com HTTP:', httpUrl);
                target.src = httpUrl;
                target.onerror = () => {
                  console.error('❌ [PatientPhoto] Todas as tentativas falharam. Removendo preview.');
                  setPreviewUrl(null);
                };
              } else {
                setPreviewUrl(null);
              }
            };
          } else {
            setPreviewUrl(null);
          }
        }} />
          

            {/* Overlay de zoom */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <ZoomInIcon className="w-6 h-6 text-white" />
            </div>
            {editable && <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button onClick={(e) => {
            e.stopPropagation();
            handleRemovePhoto();
          }} className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors" title="Remover foto">
              
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>}
          </> : <div className="relative">
            <UserIcon className={`${iconSizes[size]} text-gray-400`} />
            {solicitacaoEnviada && <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-1" title="Aguardando foto do paciente">
            
                <ClockIcon className="w-3 h-3 text-white" />
              </div>}
          </div>}

        {/* Indicador de conexão SSE */}
        {pacienteId && sseConectado && <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1" title="Conectado - foto será atualizada automaticamente">
          
            <WifiIcon className="w-3 h-3 text-white" />
          </div>}
      </div>

      {/* Status de solicitação */}
      {solicitacaoEnviada && !previewUrl && <div className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
          <ClockIcon className="w-3 h-3" />
          <span>Aguardando foto</span>
          {sseConectado && <span className="text-green-600 ml-1">(auto)</span>}
        </div>}

      {/* Botões de ação */}
      {editable && <div className="flex flex-wrap items-center justify-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        

          <Button variant="ghost" size="sm" onClick={() => setShowCamera(true)} title="Tirar foto com a câmera">
          
            <CameraIcon className="w-4 h-4 mr-1" />
            Câmera
          </Button>

          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Enviar arquivo de imagem">
          
            <UploadIcon className="w-4 h-4 mr-1" />
            Arquivo
          </Button>

          {pacienteTelefone && <Button variant="ghost" size="sm" onClick={() => setShowWhatsAppModal(true)} title="Opções de foto via WhatsApp" className="text-green-600 hover:text-green-700 hover:bg-green-50">
          
              <MessageCircleIcon className="w-4 h-4 mr-1" />
              WhatsApp
            </Button>}

          {/* Botão Atualizar - sempre visível quando tem pacienteId */}
          {pacienteId && <Button variant="ghost" size="sm" onClick={handleAtualizarFoto} disabled={atualizandoFoto} title="Buscar foto atualizada do servidor" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
          
              {atualizandoFoto ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCwIcon className="w-4 h-4 mr-1" />}
              Atualizar
            </Button>}
        </div>}

      {/* Modal da câmera */}
      <CameraCapture isOpen={showCamera} onClose={() => setShowCamera(false)} onCapture={handleCameraCapture} title="📷 Foto do Paciente" />
      

      {/* Modal de opções WhatsApp */}
      <Modal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} title="📱 Foto via WhatsApp" size="small">
        
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <SmartphoneIcon className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-green-900">
                Opções de foto via WhatsApp
              </h4>
              <p className="text-sm text-green-700">
                Escolha como obter a foto do paciente
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-600">Paciente:</p>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">
                {pacienteNome || 'Paciente'}
              </p>
              <p className="text-sm text-gray-500">{pacienteTelefone}</p>
            </div>
          </div>

          {/* Opção 1: Solicitar foto - RECOMENDADA */}
          <div className="space-y-3">
            <button onClick={handleSolicitarWhatsApp} className="w-full flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 border-2 border-green-300 rounded-lg transition-colors relative">
              
              <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                Recomendado
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <MessageCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-green-900">
                  Solicitar Foto em Alta Qualidade
                </p>
                <p className="text-xs text-green-700">
                  Envia mensagem pedindo uma foto nítida ao paciente
                </p>
              </div>
            </button>

            {/* ⭐ Opção 2 removida: Não busca mais foto do perfil WhatsApp */}
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>💡 Dica:</strong> Fotos de perfil do WhatsApp têm
              resolução muito baixa (cerca de 96x96 pixels). Para uma foto
              nítida que permita identificar o paciente,{' '}
              <strong>solicite uma foto diretamente</strong>.
            </p>
          </div>

          {sseConectado ? <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-green-700 flex items-center gap-2">
                <WifiIcon className="w-4 h-4" />
                <strong>Atualização automática ativa!</strong> A foto será
                exibida automaticamente quando o paciente enviar.
              </p>
            </div> : <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>📌 Após solicitar:</strong> Clique no botão{' '}
                <strong>"Atualizar"</strong> para carregar a foto enviada pelo
                paciente.
              </p>
            </div>}
        </div>
      </Modal>

      {/* Modal de Zoom da Foto */}
      {showZoomModal && previewUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowZoomModal(false)}>
        
          <div className="relative max-w-2xl max-h-[90vh] p-4">
            <button onClick={() => setShowZoomModal(false)} className="absolute -top-2 -right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors z-10">
            
              <XIcon className="w-5 h-5 text-gray-600" />
            </button>
            <img src={previewUrl} alt="Foto do paciente ampliada" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          

            {pacienteNome && <p className="text-center text-white mt-3 text-lg font-medium">
                {pacienteNome}
              </p>}
          </div>
        </div>}
    </div>;
}