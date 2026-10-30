import React, { useMemo, useState, useRef, createElement, Component } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Paciente } from '../types';
import { DownloadIcon, ShareIcon, UserIcon, CalendarIcon, CreditCardIcon, BuildingIcon, PhoneIcon, CheckCircleIcon, Loader2Icon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { API_BASE_URL } from '../config/api';
interface CarteirinhaDigitalProps {
  isOpen: boolean;
  onClose: () => void;
  paciente: Paciente;
  clinica: {
    nome: string;
    telefone?: string;
    endereco?: string;
    logoUrl?: string;
  };
  fotoUrl?: string;
  onEnviarWhatsApp?: () => void;
}
export function CarteirinhaDigital({
  isOpen,
  onClose,
  paciente,
  clinica,
  fotoUrl,
  onEnviarWhatsApp
}: CarteirinhaDigitalProps) {
  const carteirinhaRef = useRef<HTMLDivElement>(null);
  const {
    success,
    error: showError
  } = useToast();
  const [enviando, setEnviando] = useState(false);
  // Formata a URL da foto para exibição
  const fotoUrlFormatada = useMemo(() => {
    if (!fotoUrl) return null;
    if (fotoUrl.startsWith('/uploads')) {
      return `${API_BASE_URL}${fotoUrl}`;
    }
    return fotoUrl;
  }, [fotoUrl]);
  const formatarData = (data: string) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR');
  };
  const calcularIdade = (dataNascimento: string): string => {
    if (!dataNascimento) return '-';
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || mes === 0 && hoje.getDate() < nascimento.getDate()) {
      idade--;
    }
    return `${idade} anos`;
  };
  // Gera um código único para a carteirinha
  const gerarCodigoCarteirinha = () => {
    const prefixo = paciente.matricula || (paciente.id || '').substring(0, 8);
    const ano = new Date().getFullYear();
    return `${prefixo}-${ano}`.toUpperCase();
  };
  // Converte a carteirinha para imagem base64 - OTIMIZADO para tamanho menor
  const gerarImagemCarteirinhaBase64 = async (): Promise<string | null> => {
    if (!carteirinhaRef.current) return null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(carteirinhaRef.current, {
        scale: 1.5,
        backgroundColor: '#1e40af',
        useCORS: true
      });
      // Usa JPEG com qualidade 0.7 (muito menor que PNG)
      // PNG não suporta compressão de qualidade, JPEG sim
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      return null;
    }
  };
  // Converte a carteirinha para Blob - OTIMIZADO
  const gerarImagemCarteirinha = async (): Promise<Blob | null> => {
    if (!carteirinhaRef.current) return null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(carteirinhaRef.current, {
        scale: 1.5,
        backgroundColor: '#1e40af',
        useCORS: true
      });
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg',
        // Mudado de PNG para JPEG
        0.8);
      });
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      return null;
    }
  };
  // Download da carteirinha
  const handleDownload = async () => {
    const blob = await gerarImagemCarteirinha();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carteirinha_${paciente.nome.replace(/\s+/g, '_')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success('Download Concluído', 'Carteirinha salva com sucesso!');
    } else {
      showError('Erro', 'Não foi possível gerar a imagem da carteirinha');
    }
  };
  // Enviar via WhatsApp - Salva imagem no servidor e envia URL
  const handleEnviarWhatsApp = async () => {
    console.log('🪪🪪🪪 [CarteirinhaDigital] ========================================');
    console.log('🪪 [CarteirinhaDigital] Iniciando envio...');
    console.log('🪪 [CarteirinhaDigital] API_BASE_URL:', API_BASE_URL);
    console.log('🪪 [CarteirinhaDigital] Paciente:', paciente.nome, '- Tel:', paciente.telefone);
    if (!paciente.telefone) {
      showError('Erro', 'Paciente não possui telefone cadastrado');
      return;
    }
    setEnviando(true);
    try {
      // Busca configuração do WhatsApp
      const sessao = localStorage.getItem('sessao');
      console.log('🪪 [CarteirinhaDigital] Sessão localStorage:', sessao ? 'encontrada' : 'NÃO ENCONTRADA');
      if (!sessao) {
        throw new Error('Sessão não encontrada. Faça login novamente.');
      }
      const parsed = JSON.parse(sessao);
      const clinicaId = parsed.clinicaAtual?.id;
      const operadoraId = parsed.clinicaAtual?.operadoraId;
      console.log('🪪 [CarteirinhaDigital] clinicaId:', clinicaId);
      if (!clinicaId) {
        throw new Error('Clínica não selecionada. Selecione uma clínica.');
      }
      // Busca config do WhatsApp
      console.log('🪪 [CarteirinhaDigital] Buscando config WhatsApp...');
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`);
      let config = null;
      if (configResponse.ok) {
        config = await configResponse.json();
        console.log('🪪 [CarteirinhaDigital] Config:', config?.serverUrl, config?.sessionName);
      }
      if (!config || !config.serverUrl || !config.sessionName) {
        throw new Error('WhatsApp não configurado. Configure o WhatsApp nas configurações da clínica.');
      }
      // Gera a imagem da carteirinha em base64
      console.log('🪪 [CarteirinhaDigital] Gerando imagem...');
      const base64Image = await gerarImagemCarteirinhaBase64();
      if (!base64Image) {
        throw new Error('Não foi possível gerar a imagem da carteirinha');
      }
      console.log('🪪 [CarteirinhaDigital] Imagem gerada, tamanho:', base64Image.length);
      // Formata o número
      let telefone = paciente.telefone.replace(/\D/g, '');
      if (telefone.length <= 11) {
        telefone = '55' + telefone;
      }
      // Primeiro salva a imagem no servidor
      console.log('🪪 [CarteirinhaDigital] Salvando imagem no servidor...');
      const uploadResponse = await fetch(`${API_BASE_URL}/api/carteirinha/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64: base64Image,
          pacienteId: paciente.id,
          clinicaId: clinicaId,
          operadoraId: operadoraId
        })
      });
      console.log('🪪 [CarteirinhaDigital] Upload status:', uploadResponse.status);
      if (!uploadResponse.ok) {
        const uploadError = await uploadResponse.json().catch(() => ({
          error: 'Erro desconhecido'
        }));
        throw new Error(uploadError.error || 'Erro ao salvar imagem no servidor');
      }
      const uploadResult = await uploadResponse.json();
      console.log('🪪 [CarteirinhaDigital] Upload resultado:', uploadResult);
      // ⭐⭐⭐ ENVIA A CARTEIRINHA COMO MENSAGEM DE TEXTO COM LINK ⭐⭐⭐
      // (mais confiável que send-media que pode não funcionar em todos os WAHA)
      const mensagemCarteirinha = `🏥 *${clinica.nome}*\n\n` + `Olá ${paciente.nome.split(' ')[0]}! 👋\n\n` + `Segue sua *Carteirinha Digital*:\n\n` + `👤 *Nome:* ${paciente.nome}\n` + `🆔 *Matrícula:* ${paciente.matricula || '-'}\n` + `📅 *Nascimento:* ${formatarData(paciente.dataNascimento)}\n` + `🏷️ *Código:* ${gerarCodigoCarteirinha()}\n\n` + `✅ Carteirinha válida para ${new Date().getFullYear()}\n` + `📞 ${clinica.telefone || ''}\n\n` + `🖼️ *Visualizar carteirinha:*\n${uploadResult.url}`;
      console.log('🪪 [CarteirinhaDigital] Enviando mensagem via WhatsApp...');
      const sendResponse = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl: config.serverUrl,
          sessionName: config.sessionName,
          number: telefone,
          message: mensagemCarteirinha,
          clinicaId: clinicaId,
          pacienteId: paciente.id,
          pacienteNome: paciente.nome
        })
      });
      console.log('🪪 [CarteirinhaDigital] Send message status:', sendResponse.status);
      const sendResult = await sendResponse.json().catch(() => ({
        error: 'Erro ao parsear resposta'
      }));
      console.log('🪪 [CarteirinhaDigital] Send message resultado:', sendResult);
      if (sendResponse.ok) {
        success('Carteirinha Enviada!', `Enviada para ${paciente.nome} via WhatsApp`);
        // ⭐⭐⭐ ENVIA MENU DE AJUDA E ATIVA DIÁLOGO ⭐⭐⭐
        console.log('🪪 [CarteirinhaDigital] Enviando menu de ajuda...');
        try {
          const menuResponse = await fetch(`${API_BASE_URL}/api/carteirinha/enviar-menu`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId: clinicaId,
              pacienteId: paciente.id,
              pacienteNome: paciente.nome,
              telefone: paciente.telefone
            })
          });
          console.log('🪪 [CarteirinhaDigital] Menu response status:', menuResponse.status);
          if (menuResponse.ok) {
            console.log('🪪 [CarteirinhaDigital] ✅ Menu de ajuda enviado!');
          }
        } catch (menuErr) {
          console.log('🪪 [CarteirinhaDigital] ⚠️ Erro ao enviar menu:', menuErr);
        }
      } else {
        throw new Error(sendResult.error || 'Falha ao enviar mensagem via WhatsApp');
      }
      console.log('🪪🪪🪪 ======================================== FIM ✅\n');
    } catch (err: any) {
      console.error('🪪 [CarteirinhaDigital] ❌ ERRO:', err);
      console.log('🪪🪪🪪 ======================================== FIM ❌\n');
      showError('Erro ao Enviar', err.message || 'Não foi possível enviar a carteirinha');
    } finally {
      setEnviando(false);
    }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="🪪 Carteirinha Digital" size="medium" footer={<div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="secondary" onClick={handleDownload}>
            <DownloadIcon className="w-4 h-4 mr-2" />
            Baixar
          </Button>
          <Button onClick={handleEnviarWhatsApp} disabled={enviando || !paciente.telefone} className="bg-green-600 hover:bg-green-700">
          
            {enviando ? <>
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </> : <>
                <ShareIcon className="w-4 h-4 mr-2" />
                Enviar WhatsApp
              </>}
          </Button>
        </div>}>
      
      <div className="flex flex-col items-center gap-6">
        {/* Carteirinha - SEM ÍCONES SVG para melhor compatibilidade com html2canvas */}
        <div ref={carteirinhaRef} className="w-full max-w-md bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-2xl shadow-2xl overflow-hidden">
          
          {/* Header */}
          <div className="bg-white/10 backdrop-blur-sm px-6 py-4 border-b border-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {clinica.logoUrl ? <img src={clinica.logoUrl} alt={clinica.nome} className="w-10 h-10 rounded-lg object-cover bg-white" /> : <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                    <span className="text-white text-xl">🏥</span>
                  </div>}
                <div>
                  <h3 className="text-white font-bold text-lg leading-tight">
                    {clinica.nome}
                  </h3>
                  <p className="text-blue-200 text-xs">
                    Carteirinha de Identificação
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full">
                <span>✓</span>
                <span>Válida</span>
              </div>
            </div>
          </div>

          {/* Corpo */}
          <div className="p-6">
            <div className="flex gap-5">
              {/* Foto */}
              <div className="flex-shrink-0">
                <div className="w-24 h-28 rounded-xl overflow-hidden bg-white/20 border-2 border-white/30 shadow-lg">
                  {fotoUrlFormatada ? <img src={fotoUrlFormatada} alt={paciente.nome} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">👤</span>
                    </div>}
                </div>
              </div>

              {/* Dados */}
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-blue-200 text-xs uppercase tracking-wide">
                    Nome
                  </p>
                  <p className="text-white font-semibold text-lg leading-tight">
                    {paciente.nome}
                  </p>
                </div>

                <div>
                  <p className="text-blue-200 text-xs uppercase tracking-wide">
                    Matrícula
                  </p>
                  <p className="text-white font-medium">
                    {paciente.matricula || '-'}
                  </p>
                </div>

                <div>
                  <p className="text-blue-200 text-xs uppercase tracking-wide">
                    Nascimento
                  </p>
                  <p className="text-white font-medium">
                    {formatarData(paciente.dataNascimento)}
                  </p>
                </div>

                {paciente.convenio && <div>
                    <p className="text-blue-200 text-xs uppercase tracking-wide">
                      Convênio
                    </p>
                    <p className="text-white font-medium">
                      {paciente.convenio}
                    </p>
                  </div>}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-black/20 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-blue-200 text-xs">
                <div className="flex items-center gap-1">
                  <span>🪪</span>
                  <span>{gerarCodigoCarteirinha()}</span>
                </div>
                {clinica.telefone && <div className="flex items-center gap-1">
                    <span>📞</span>
                    <span>{clinica.telefone}</span>
                  </div>}
              </div>
              <div className="text-blue-200 text-xs">
                {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>

        {/* Instruções */}
        <div className="text-center text-sm text-gray-500">
          <p>Esta carteirinha pode ser apresentada em formato digital.</p>
          <p>Clique em "Enviar WhatsApp" para enviar a imagem diretamente.</p>
        </div>
      </div>
    </Modal>;
}