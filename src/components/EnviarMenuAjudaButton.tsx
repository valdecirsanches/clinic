import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { useToast } from '../hooks/useToast';
import { MessageCircleIcon, Loader2Icon, HelpCircleIcon, SendIcon, XIcon, CheckCircleIcon, AlertCircleIcon, EditIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
interface EnviarMenuAjudaButtonProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  clinicaId: string;
  pacienteFotoUrl?: string; // ⭐ Foto de perfil do DB (não busca do WhatsApp)
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  iconOnly?: boolean;
}
export function EnviarMenuAjudaButton({
  pacienteId,
  pacienteNome,
  pacienteTelefone,
  clinicaId,
  pacienteFotoUrl,
  variant = 'secondary',
  size = 'sm',
  className = '',
  label = 'Enviar Menu de Ajuda',
  iconOnly = false
}: EnviarMenuAjudaButtonProps) {
  const [loading, setLoading] = useState(false);
  const {
    success,
    error,
    warning
  } = useToast();
  // ⭐⭐⭐ Estado do modal de confirmação ⭐⭐⭐
  const [modalAberto, setModalAberto] = useState(false);
  const [telefoneEditavel, setTelefoneEditavel] = useState('');
  const [editandoTelefone, setEditandoTelefone] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [mensagemPreview, setMensagemPreview] = useState('');
  // ⭐ Menu padrão (fallback)
  const menuPadrao = `👋 Olá, *{nome}*!

Como posso ajudar?

1️⃣ Minhas consultas
2️⃣ Horário de funcionamento
3️⃣ 📍 Endereço / Como chegar
4️⃣ 💰 Emissão da 2ª via de boleto
5️⃣ 📷 Trocar foto de perfil
6️⃣ 📄 Enviar documento
7️⃣ ✅ Cheguei na clínica
0️⃣ Sair

_Digite o número da opção desejada._`;
  // ⭐ Formata a URL da foto do DB para exibição
  const fotoUrlFormatada = (() => {
    if (!pacienteFotoUrl) return null;
    if (pacienteFotoUrl.startsWith('/uploads')) {
      return `${API_BASE_URL}${pacienteFotoUrl}`;
    }
    return pacienteFotoUrl;
  })();
  // ⭐ Abre o modal de confirmação
  const handleAbrirModal = async () => {
    if (!pacienteTelefone) {
      warning('Sem Telefone', 'O paciente não possui telefone cadastrado.');
      return;
    }
    const cleanPhone = (pacienteTelefone || '').replace(/\D/g, '');
    if (cleanPhone.length > 0 && cleanPhone.length < 10) {
      error('Telefone Inválido', 'O número de telefone parece estar sem o DDD. Por favor, atualize o cadastro do paciente.');
      return;
    }
    if (!clinicaId) {
      error('Erro', 'Clínica não identificada. Recarregue a página.');
      return;
    }
    // Prepara o modal
    setTelefoneEditavel(pacienteTelefone);
    setEditandoTelefone(false);
    setResultado(null);
    setEnviando(false);
    // Monta preview da mensagem
    try {
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp/config?clinicaId=${clinicaId}`);
      let menuTemplate = menuPadrao;
      if (configResponse.ok) {
        const whatsappConfig = await configResponse.json();
        if (whatsappConfig.menuAjudaTemplate && whatsappConfig.menuAjudaTemplate.trim().length > 10) {
          menuTemplate = whatsappConfig.menuAjudaTemplate;
        }
      }
      setMensagemPreview(menuTemplate.replace(/\{nome\}/g, pacienteNome));
    } catch {
      setMensagemPreview(menuPadrao.replace(/\{nome\}/g, pacienteNome));
    }
    setModalAberto(true);
    // ⭐ NÃO busca foto do WhatsApp - usa foto do DB (pacienteFotoUrl)
  };
  // ⭐⭐⭐ Confirma e envia ⭐⭐⭐
  const handleConfirmarEnvio = async () => {
    if (!telefoneEditavel) {
      error('Erro', 'Informe um número de telefone');
      return;
    }
    const telLimpo = telefoneEditavel.replace(/\D/g, '');
    if (telLimpo.length < 10) {
      error('Telefone Inválido', 'O número precisa ter DDD + número (mínimo 10 dígitos).');
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      // Busca config do WhatsApp
      const configResponse = await fetch(`${API_BASE_URL}/api/whatsapp/config?clinicaId=${clinicaId}`);
      if (!configResponse.ok) {
        throw new Error('WhatsApp não configurado para esta clínica');
      }
      const whatsappConfig = await configResponse.json();
      if (!whatsappConfig?.serverUrl || !whatsappConfig?.sessionName) {
        throw new Error('Configuração do WhatsApp incompleta');
      }
      // Formata o número
      let numero = telefoneEditavel.replace(/\D/g, '');
      if (!numero.startsWith('55')) {
        numero = '55' + numero;
      }
      // Usa template customizado ou padrão
      let menuTemplate = menuPadrao;
      if (whatsappConfig.menuAjudaTemplate && whatsappConfig.menuAjudaTemplate.trim().length > 10) {
        menuTemplate = whatsappConfig.menuAjudaTemplate;
      }
      const mensagem = menuTemplate.replace(/\{nome\}/g, pacienteNome);
      // Envia a mensagem
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl: whatsappConfig.serverUrl,
          sessionName: whatsappConfig.sessionName,
          number: numero,
          message: mensagem,
          clinicaId,
          pacienteId,
          pacienteNome
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao enviar mensagem');
      }
      // Ativa o diálogo de ajuda no servidor
      try {
        await fetch(`${API_BASE_URL}/api/whatsapp/ativar-dialogo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clinicaId,
            telefone: numero,
            pacienteId,
            pacienteNome
          })
        });
      } catch (err) {
        console.warn('⚠️ [EnviarMenuAjuda] Erro ao ativar diálogo (não crítico):', err);
      }
      setResultado({
        success: true,
        message: `Menu de ajuda enviado para ${pacienteNome} via WhatsApp!`
      });
      // Fecha automaticamente após 3s
      setTimeout(() => {
        setModalAberto(false);
        setResultado(null);
      }, 3000);
    } catch (err: any) {
      console.error('❌ Erro ao enviar menu de ajuda:', err);
      setResultado({
        success: false,
        message: err.message || 'Não foi possível enviar o menu.'
      });
    } finally {
      setEnviando(false);
    }
  };
  const formatTelefoneDisplay = (tel: string) => {
    const clean = tel.replace(/\D/g, '');
    if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    if (clean.length === 13) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    return tel;
  };
  // Se não tem telefone, mostra botão desabilitado
  if (!pacienteTelefone) {
    if (iconOnly) {
      return <button className={`p-1.5 rounded text-gray-400 cursor-not-allowed opacity-50 ${className}`} disabled title="Paciente sem telefone cadastrado">
          
          <HelpCircleIcon className="w-4 h-4" />
        </button>;
    }
    return <Button variant="ghost" size={size} className={`opacity-50 cursor-not-allowed ${className}`} disabled title="Paciente sem telefone cadastrado">
        
        <HelpCircleIcon className="w-4 h-4 mr-2" />
        {label}
      </Button>;
  }
  return <>
      {iconOnly ? <button className={`p-1.5 rounded text-purple-600 hover:bg-purple-50 transition-colors ${className}`} onClick={handleAbrirModal} disabled={loading} title="Enviar Menu de Ajuda via WhatsApp">
        
          {loading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <HelpCircleIcon className="w-4 h-4" />}
        </button> : <Button variant={variant} size={size} className={`bg-green-50 text-green-700 hover:bg-green-100 border-green-200 ${className}`} onClick={handleAbrirModal} disabled={loading} title="Enviar menu de ajuda via WhatsApp">
        
          {loading ? <>
              <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
              Enviando...
            </> : <>
              <MessageCircleIcon className="w-4 h-4 mr-2" />
              {label}
            </>}
        </Button>}

      {/* ⭐⭐⭐ MODAL DE CONFIRMAÇÃO WHATSAPP ⭐⭐⭐ */}
      {modalAberto && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MessageCircleIcon className="w-5 h-5 text-green-600" />
                Confirmar Envio - Menu de Ajuda
              </h3>
              <button onClick={() => setModalAberto(false)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
              
                <XIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Resultado do envio */}
              {resultado && <div className={`p-4 rounded-lg border-2 ${resultado.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              
                  <div className="flex items-start gap-3">
                    {resultado.success ? <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className={`font-semibold ${resultado.success ? 'text-green-900' : 'text-red-900'}`}>
                    
                        {resultado.success ? '✅ Menu Enviado!' : '❌ Falha no Envio'}
                      </p>
                      <p className={`text-sm mt-1 ${resultado.success ? 'text-green-700' : 'text-red-700'}`}>
                    
                        {resultado.message}
                      </p>
                      {resultado.success && <p className="text-xs text-green-600 mt-2">
                          Esta janela fechará automaticamente...
                        </p>}
                    </div>
                  </div>
                </div>}

              {/* Conteúdo (oculta após sucesso) */}
              {!resultado && <>
                  {/* Info do contato com foto do DB */}
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    {fotoUrlFormatada ? <img src={fotoUrlFormatada} alt={pacienteNome} className="w-16 h-16 rounded-full object-cover border-2 border-green-500" onError={(e) => {
                ;
                (e.target as HTMLImageElement).style.display = 'none';
              }} /> : <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white text-xl font-bold">
                          {pacienteNome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>}

                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {pacienteNome}
                      </p>
                      {/* Telefone editável */}
                      <div className="mt-1">
                        {editandoTelefone ? <div className="flex items-center gap-2">
                            <input type="text" value={telefoneEditavel} onChange={(e) => setTelefoneEditavel(e.target.value)} className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="(11) 99999-0000" autoFocus onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setEditandoTelefone(false);
                      }
                    }} />
                      
                            <button type="button" onClick={() => {
                      setEditandoTelefone(false);
                    }} className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 bg-green-50 rounded">
                        
                              OK
                            </button>
                          </div> : <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-600">
                              {formatTelefoneDisplay(telefoneEditavel)}
                            </p>
                            <button type="button" onClick={() => setEditandoTelefone(true)} className="text-gray-400 hover:text-green-600 transition-colors" title="Editar telefone">
                        
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>}
                        {telefoneEditavel !== pacienteTelefone && telefoneEditavel && <p className="text-xs text-amber-600 mt-0.5">
                              ⚠️ Diferente do cadastro ({pacienteTelefone})
                            </p>}
                      </div>
                    </div>
                  </div>

                  {/* Preview da mensagem */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📝 Mensagem que será enviada:
                    </label>
                    <div className="p-4 bg-white border border-gray-200 rounded-lg whitespace-pre-wrap text-sm text-gray-700 max-h-48 overflow-y-auto">
                      {mensagemPreview}
                    </div>
                  </div>
                </>}
            </div>

            {/* Footer com botões */}
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              {resultado ? <Button variant="ghost" onClick={() => setModalAberto(false)}>
                  Fechar
                </Button> : <>
                  <Button variant="ghost" onClick={() => setModalAberto(false)} disabled={enviando}>
                
                    <XIcon className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button onClick={handleConfirmarEnvio} disabled={enviando} className="bg-green-600 hover:bg-green-700 text-white">
                
                    {enviando ? <>
                        <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </> : <>
                        <SendIcon className="w-4 h-4 mr-2" />
                        Enviar Menu
                      </>}
                  </Button>
                </>}
            </div>
          </div>
        </div>}
    </>;
}