import React, { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { SendIcon, UserIcon, XIcon, CheckCircleIcon, AlertCircleIcon, LoaderIcon, EditIcon } from 'lucide-react';
import { Paciente, Consulta } from '../types';
import { API_BASE_URL } from '../config/api';
interface WhatsAppConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (telefoneOverride?: string) => Promise<{
    success: boolean;
    message?: string;
  }>;
  paciente: Paciente;
  consulta: Consulta;
  mensagem: string;
  serverUrl: string;
  sessionName: string;
  clinicaId?: string;
  /** Canal efetivo do envio. */
  canal?: 'whatsapp' | 'sms' | 'meta';
  /** Quando a clínica tem SMS configurado, o canal pode ser escolhido aqui. */
  smsDisponivel?: boolean;
  /** WhatsApp OFICIAL da Meta configurado e ativo para esta clínica. */
  metaDisponivel?: boolean;
  /** Meta ativa, mas sem template vinculado para ESTE tipo de aviso. */
  metaSemTemplate?: boolean;
  /** Motivo pelo qual o canal foi trocado automaticamente (WhatsApp fora). */
  avisoCanal?: string;
  /** WAHA conectado. Falso desabilita a escolha do canal "WhatsApp". */
  wahaDisponivel?: boolean;
  onTrocarCanal?: (canal: 'whatsapp' | 'sms' | 'meta') => void | Promise<void>;
  onUpdatePaciente?: (id: string, updates: Partial<Paciente>) => Promise<void>;
  onUpdateConsulta?: (id: string, updates: Partial<Consulta>) => Promise<void>;
}
export function WhatsAppConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  paciente,
  consulta,
  mensagem,
  serverUrl,
  sessionName,
  clinicaId,
  canal = 'whatsapp',
  smsDisponivel = false,
  metaDisponivel = false,
  metaSemTemplate = false,
  avisoCanal,
  wahaDisponivel = true,
  onTrocarCanal,
  onUpdatePaciente,
  onUpdateConsulta
}: WhatsAppConfirmModalProps) {
  const isSms = canal === 'sms';
  const isMeta = canal === 'meta';
  const [contactInfo, setContactInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ⭐ Estado para telefone editável
  const [telefoneEditavel, setTelefoneEditavel] = useState('');
  const [editandoTelefone, setEditandoTelefone] = useState(false);
  // Estados para feedback de envio
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  // ⭐ Inicializa telefone editável quando modal abre
  useEffect(() => {
    if (isOpen && paciente) {
      // Prioridade: whatsappTelefone da consulta > telefone do paciente
      const telInicial = (consulta as any)?.whatsappTelefone || paciente.telefone || '';
      setTelefoneEditavel(telInicial);
      setEditandoTelefone(false);
      setSendResult(null);
    }
  }, [isOpen, paciente?.id, consulta?.id]);
  // ⭐ Formata a URL da foto do DB para exibição
  const fotoUrlFormatada = (() => {
    if (!paciente?.fotoUrl) return null;
    if (paciente.fotoUrl.startsWith('/uploads')) {
      return `${API_BASE_URL}${paciente.fotoUrl}`;
    }
    return paciente.fotoUrl;
  })();
  // Função para salvar verificação no cadastro do paciente
  const salvarVerificacaoNoPaciente = async (fotoUrl: string | null) => {
    if (!clinicaId || !onUpdatePaciente) {
      console.log('⚠️ [WhatsAppConfirmModal] Não foi possível salvar verificação - clinicaId ou onUpdatePaciente não disponível');
      return;
    }
    try {
      console.log('💾 [WhatsAppConfirmModal] Salvando verificação de WhatsApp no cadastro do paciente...');
      await onUpdatePaciente(paciente.id, {
        whatsappVerificado: true,
        whatsappFotoUrl: fotoUrl || undefined,
        whatsappVerificadoEm: new Date().toISOString()
      });
      console.log('✅ [WhatsAppConfirmModal] Verificação salva com sucesso!');
    } catch (err) {
      console.error('❌ [WhatsAppConfirmModal] Erro ao salvar verificação:', err);
    }
  };
  // ⭐ Salva whatsappTelefone na consulta
  const salvarWhatsAppTelefone = async (telefone: string) => {
    if (!clinicaId || !consulta?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/consultas/${consulta.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          whatsappTelefone: telefone
        })
      });
      if (response.ok) {
        console.log('✅ [WhatsAppConfirmModal] whatsappTelefone salvo na consulta:', telefone);
      }
    } catch (err) {
      console.error('❌ [WhatsAppConfirmModal] Erro ao salvar whatsappTelefone:', err);
    }
  };
  // ⭐⭐⭐ FIX: Usa foto do DB em vez de buscar do WhatsApp ⭐⭐⭐
  // Não faz mais chamada a /api/whatsapp/contact-info para foto de perfil
  useEffect(() => {
    if (isOpen && paciente) {
      setContactInfo({
        name: paciente.nome,
        number: telefoneEditavel || paciente.telefone,
        profilePicUrl: fotoUrlFormatada,
        isRegistered: true,
        fromCache: true
      });
      setLoading(false);
    }
  }, [isOpen, paciente?.id, fotoUrlFormatada]);
  // ✅ Safety check DEPOIS dos hooks
  if (!paciente || !consulta) {
    return null;
  }
  const handleConfirmSend = async () => {
    setIsSending(true);
    setSendResult(null);
    setError(null);
    // ⭐ Validação de DDD
    const cleanPhone = telefoneEditavel.replace(/\D/g, '');
    if (cleanPhone.length > 0 && cleanPhone.length < 10) {
      setError('O número de telefone parece estar sem o DDD. Por favor, edite o número e adicione o DDD (ex: 11 99999-9999).');
      setIsSending(false);
      return;
    }
    // ⭐ Salva o telefone usado na consulta ANTES de enviar
    await salvarWhatsAppTelefone(telefoneEditavel);
    try {
      // ⭐ Passa o telefone editado para o onConfirm
      const result = await onConfirm(telefoneEditavel !== paciente.telefone ? telefoneEditavel : undefined);
      setSendResult({
        success: result.success,
        message: result.message || (result.success ? 'Mensagem enviada com sucesso!' : 'Falha ao enviar mensagem')
      });
      if (result.success) {
        setTimeout(() => {
          onClose();
          setSendResult(null);
          setContactInfo(null);
        }, 3000);
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        message: err.message || 'Erro ao enviar mensagem'
      });
    } finally {
      setIsSending(false);
    }
  };
  const formatTelefone = (tel: string) => {
    const clean = tel.replace(/\D/g, '');
    if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    return tel;
  };
  return <Modal isOpen={isOpen} onClose={onClose} title={isSms ? 'Confirmar Envio por SMS' : 'Confirmar Envio WhatsApp'} footer={sendResult ? <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button> : <>
            <Button variant="ghost" onClick={onClose} disabled={isSending}>
              <XIcon className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleConfirmSend} disabled={isSending || loading}>
              {isSending ? <>
                  <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </> : <>
                  <SendIcon className="w-4 h-4 mr-2" />
                  Enviar Mensagem
                </>}
            </Button>
          </>}>
      
      <div className="space-y-6">
        {/* Resultado do Envio */}
        {sendResult && <div className={`p-4 rounded-lg border-2 ${sendResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          
            <div className="flex items-start gap-3">
              {sendResult.success ? <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className={`font-semibold ${sendResult.success ? 'text-green-900' : 'text-red-900'}`}>
                
                  {sendResult.success ? '✅ Mensagem Enviada!' : '❌ Falha no Envio'}
                </p>
                {/* whitespace-pre-line: o diagnóstico da Meta vem em linhas */}
                <p className={`text-sm mt-1 whitespace-pre-line ${sendResult.success ? 'text-green-700' : 'text-red-700'}`}>
                
                  {sendResult.message}
                </p>
                {sendResult.success && <p className="text-xs text-green-600 mt-2">
                    Esta janela fechará automaticamente...
                  </p>}
              </div>
            </div>

            {/* FOTO DO CONTATO APÓS ENVIO - usa foto do DB */}
            {sendResult.success && <div className="mt-4 pt-4 border-t border-green-200">
                <div className="flex items-center gap-3">
                  {fotoUrlFormatada ? <div>
                      <img src={fotoUrlFormatada} alt={paciente.nome} className="w-20 h-20 rounded-full object-cover border-4 border-green-500 shadow-lg" onError={(e) => {
                e.currentTarget.style.display = 'none';
              }} />
                
                    </div> : <div>
                      <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl font-bold">
                          {paciente.nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                    </div>}
                  <div>
                    <p className="font-semibold text-green-900">
                      {paciente.nome}
                    </p>
                    <p className="text-sm text-green-700">
                      {formatTelefone(telefoneEditavel)}
                    </p>
                  </div>
                </div>
              </div>}
          </div>}

        {/* Conteúdo original (oculta após envio bem-sucedido) */}
        {!sendResult && <>
            {/* ⭐ Motivo da troca automática de canal: fica aqui, na tela de
             envio, em vez de custar um diálogo antes de chegar até ela. */}
            {avisoCanal && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {avisoCanal}
              </p>}

            {/* ⭐ Escolha do canal — cada um aparece quando está configurado.
             A Meta fica AO LADO do WAHA, não no lugar dele. */}
            {(smsDisponivel || metaDisponivel) && onTrocarCanal && <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Enviar por:
                </span>
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden" role="group">
                  {/* Sessão do WAHA fora do ar: o canal fica desabilitado, em
                 vez de aceitar o clique e falhar no envio. */}
                  <button type="button" onClick={() => onTrocarCanal('whatsapp')} disabled={isSending || !wahaDisponivel} aria-pressed={!isSms && !isMeta} title={wahaDisponivel ? 'WhatsApp pela sessão da clínica' : 'A sessão de WhatsApp da clínica não está conectada'} className={`px-4 py-2 text-sm font-medium transition-colors ${!isSms && !isMeta ? 'bg-green-600 text-white' : !wahaDisponivel ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                    WhatsApp
                    {!wahaDisponivel && <span className="block text-[10px] font-normal leading-none">desconectado</span>}
                  </button>
                  {metaDisponivel && <button type="button" onClick={() => onTrocarCanal('meta')} disabled={isSending} aria-pressed={isMeta} className={`px-4 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${isMeta ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`} title="WhatsApp oficial da Meta, por template aprovado">
                      WhatsApp oficial
                    </button>}
                  {smsDisponivel && <button type="button" onClick={() => onTrocarCanal('sms')} disabled={isSending} aria-pressed={isSms} className={`px-4 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${isSms ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                      SMS
                    </button>}
                </div>
                {isMeta && (metaSemTemplate ? <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                    Este aviso ainda <strong>não tem template vinculado</strong> em
                    Configurações → WhatsApp oficial (Meta). Vincule o template
                    aprovado para que a Meta possa entregar a mensagem.
                  </p> : <p className="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
                    A mensagem será entregue pelo <strong>template aprovado</strong> na
                    Meta — o texto abaixo é apenas a referência do conteúdo.
                  </p>)}
              </div>}

            {/* Contact Info com telefone editável - usa foto do DB */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              {fotoUrlFormatada ? <div>
                  <img src={fotoUrlFormatada} alt={paciente.nome} className="w-16 h-16 rounded-full object-cover border-2 border-teal-500" onError={(e) => {
              e.currentTarget.style.display = 'none';
            }} />
              
                </div> : <div>
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center shadow-md">
                    <span className="text-white text-xl font-bold">
                      {paciente.nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                    </span>
                  </div>
                </div>}

              <div className="flex-1">
                <p className="font-semibold text-gray-900">{paciente.nome}</p>

                {/* ⭐ Telefone editável */}
                <div className="mt-1">
                  {editandoTelefone ? <div className="flex items-center gap-2">
                      <input type="text" value={telefoneEditavel} onChange={(e) => setTelefoneEditavel(e.target.value)} className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="(00) 00000-0000" autoFocus onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditandoTelefone(false);
                }} />
                  
                      <button type="button" onClick={() => setEditandoTelefone(false)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    
                        OK
                      </button>
                    </div> : <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600">
                        {formatTelefone(telefoneEditavel)}
                      </p>
                      <button type="button" onClick={() => setEditandoTelefone(true)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Editar telefone para esta comunicação">
                    
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>}
                  {telefoneEditavel !== paciente.telefone && <p className="text-xs text-amber-600 mt-0.5">
                      ⚠️ Diferente do cadastro ({paciente.telefone})
                    </p>}
                </div>
              </div>
            </div>

            {/* Appointment Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-2">
                📅 Detalhes da Consulta
              </p>
              <div className="space-y-1 text-sm text-blue-800">
                <p>
                  <strong>Data:</strong>{' '}
                  {new Date(consulta.data + 'T00:00:00').toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
                </p>
                <p>
                  <strong>Horário:</strong> {consulta.horario}
                </p>
                <p>
                  <strong>Profissional:</strong> {consulta.profissional}
                </p>
                <p>
                  <strong>Duração:</strong> {consulta.duracao} minutos
                </p>
              </div>
            </div>

            {/* Message Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📝 Mensagem que será enviada:
              </label>
              <div className="p-4 bg-white border border-gray-200 rounded-lg whitespace-pre-wrap text-sm text-gray-700 max-h-64 overflow-y-auto">
                {mensagem}
              </div>
              {isSms && <p className="text-xs text-gray-500 mt-2">
                  Envio por SMS ({mensagem.length} caracteres). O paciente
                  confirma a presença ou informa o motivo do cancelamento pelo
                  link da mensagem.
                </p>}
            </div>

            {error && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">{error}</p>
              </div>}
          </>}
      </div>
    </Modal>;
}