import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useAssinaturas, TipoAssinatura } from '../hooks/useAssinaturas';
import { PenToolIcon, SendIcon, Loader2Icon, FileTextIcon, AlertCircleIcon, CheckCircleIcon, CopyIcon, AlertTriangleIcon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
interface SolicitarAssinaturaButtonProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  clinicaId: string;
  atendimentoId?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  title?: string;
}
export function SolicitarAssinaturaButton({
  pacienteId,
  pacienteNome,
  pacienteTelefone,
  clinicaId,
  atendimentoId,
  variant = 'outline',
  size = 'sm',
  className = '',
  label = 'Solicitar Assinatura',
  title
}: SolicitarAssinaturaButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoAssinatura>('termo_consentimento');
  const [titulo, setTitulo] = useState('Termo de Consentimento');
  const [descricao, setDescricao] = useState('');
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const {
    solicitarAssinatura,
    loading
  } = useAssinaturas();
  const {
    success,
    error,
    warning
  } = useToast();
  // Log para debug
  console.log('🔍 [SolicitarAssinaturaButton] Props:', {
    pacienteId,
    pacienteNome,
    pacienteTelefone: pacienteTelefone || '(VAZIO)',
    clinicaId
  });
  const handleTipoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const novoTipo = e.target.value as TipoAssinatura;
    setTipo(novoTipo);
    // Sugere títulos baseados no tipo
    switch (novoTipo) {
      case 'termo_consentimento':
        setTitulo('Termo de Consentimento Livre e Esclarecido');
        setDescricao('Declaro que fui informado(a) sobre os procedimentos, riscos e benefícios do tratamento proposto.');
        break;
      case 'autorizacao_procedimento':
        setTitulo('Autorização para Procedimento');
        setDescricao('Autorizo a realização do procedimento descrito no plano de tratamento.');
        break;
      case 'contrato':
        setTitulo('Contrato de Prestação de Serviços');
        setDescricao('Contrato referente aos serviços odontológicos/médicos a serem prestados.');
        break;
      case 'outro':
        setTitulo('');
        setDescricao('');
        break;
    }
  };
  const handleCopiarLink = async () => {
    if (linkGerado) {
      try {
        await navigator.clipboard.writeText(linkGerado);
        setCopiado(true);
        setStatusMessage({
          type: 'success',
          title: 'Link Copiado!',
          message: 'O link foi copiado para a área de transferência.'
        });
        setTimeout(() => setCopiado(false), 3000);
      } catch (err) {
        setStatusMessage({
          type: 'error',
          title: 'Erro',
          message: 'Não foi possível copiar o link.'
        });
      }
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    console.log('📝 [SolicitarAssinaturaButton] handleSubmit chamado');
    console.log('📝 [SolicitarAssinaturaButton] Dados:', {
      pacienteId,
      pacienteNome,
      pacienteTelefone,
      clinicaId,
      tipo,
      titulo,
      descricao
    });
    if (!clinicaId) {
      console.log('❌ [SolicitarAssinaturaButton] clinicaId vazio!');
      setStatusMessage({
        type: 'error',
        title: 'Erro',
        message: 'Clínica não identificada. Recarregue a página.'
      });
      return;
    }
    try {
      console.log('📝 [SolicitarAssinaturaButton] Chamando solicitarAssinatura...');
      const result = await solicitarAssinatura({
        clinicaId,
        pacienteId,
        pacienteNome,
        pacienteTelefone: pacienteTelefone || '',
        tipo,
        titulo,
        descricao,
        atendimentoId
      });
      console.log('✅ [SolicitarAssinaturaButton] Resultado:', result);
      // Salva o link gerado para exibir
      if (result.linkAssinatura) {
        setLinkGerado(result.linkAssinatura);
      }
      if (result.whatsappEnviado) {
        setStatusMessage({
          type: 'success',
          title: 'Solicitação Enviada! ✅',
          message: `Link de assinatura enviado para ${pacienteNome} via WhatsApp.`
        });
        // Fecha o modal após sucesso
        setTimeout(() => {
          setIsOpen(false);
          setLinkGerado(null);
          setStatusMessage(null);
        }, 3000);
      } else {
        // WhatsApp não configurado ou sem telefone - mostra o link para copiar
        const motivo = result.whatsappErro || (pacienteTelefone ? 'WhatsApp não está configurado para esta clínica.' : 'Paciente sem telefone cadastrado.');
        setStatusMessage({
          type: 'warning',
          title: 'WhatsApp não enviado',
          message: `${motivo} O link foi gerado — copie e envie manualmente.`
        });
      }
      // Reset form (mas mantém o link se não foi enviado por WhatsApp)
      if (result.whatsappEnviado) {
        setTipo('termo_consentimento');
        setTitulo('Termo de Consentimento');
        setDescricao('');
      }
    } catch (err: any) {
      console.error('❌ [SolicitarAssinaturaButton] Erro:', err);
      setStatusMessage({
        type: 'error',
        title: 'Erro ao Solicitar',
        message: err.message || 'Não foi possível criar a solicitação.'
      });
    }
  };
  // Se não tem telefone, ainda permite criar o link (para copiar manualmente)
  const semTelefone = !pacienteTelefone;
  return <>
      <Button variant={variant} size={size} className={className} onClick={() => {
      setIsOpen(true);
      setStatusMessage(null);
    }} title={title || 'Solicitar assinatura digital'}>
        
        <PenToolIcon className={`w-4 h-4 ${label ? 'mr-2' : ''}`} />
        {label}
      </Button>

      <Modal isOpen={isOpen} onClose={() => {
      setIsOpen(false);
      setLinkGerado(null);
      setCopiado(false);
      setStatusMessage(null);
    }} title="Solicitar Assinatura Digital">
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ⭐ FIX: Mensagem de status inline (visível dentro do modal) */}
          {statusMessage && <div className={`p-4 rounded-lg border flex items-start gap-3 ${statusMessage.type === 'success' ? 'bg-green-50 border-green-200' : statusMessage.type === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            
              <div className={`p-2 rounded-full flex-shrink-0 ${statusMessage.type === 'success' ? 'bg-green-100' : statusMessage.type === 'warning' ? 'bg-amber-100' : 'bg-red-100'}`}>
              
                {statusMessage.type === 'success' ? <CheckCircleIcon className="w-5 h-5 text-green-600" /> : statusMessage.type === 'warning' ? <AlertTriangleIcon className="w-5 h-5 text-amber-600" /> : <AlertCircleIcon className="w-5 h-5 text-red-600" />}
              </div>
              <div>
                <h4 className={`text-sm font-semibold ${statusMessage.type === 'success' ? 'text-green-900' : statusMessage.type === 'warning' ? 'text-amber-900' : 'text-red-900'}`}>
                
                  {statusMessage.title}
                </h4>
                <p className={`text-xs mt-1 ${statusMessage.type === 'success' ? 'text-green-700' : statusMessage.type === 'warning' ? 'text-amber-700' : 'text-red-700'}`}>
                
                  {statusMessage.message}
                </p>
              </div>
            </div>}

          {/* Link gerado - mostrar se disponível */}
          {linkGerado && <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-start gap-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-green-900">
                    Link de Assinatura Gerado!
                  </h4>
                  <p className="text-xs text-green-700 mt-1 mb-2">
                    Copie o link abaixo e envie para o paciente:
                  </p>
                  <div className="flex items-center gap-2">
                    <input type="text" value={linkGerado} readOnly className="flex-1 px-3 py-2 text-xs bg-white border border-green-300 rounded-lg" />
                  

                    <Button type="button" variant="secondary" size="sm" onClick={handleCopiarLink} className={copiado ? 'bg-green-100 text-green-700' : ''}>
                    
                      <CopyIcon className="w-4 h-4 mr-1" />
                      {copiado ? 'Copiado!' : 'Copiar'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>}

          {/* Aviso se não tem telefone */}
          {semTelefone && !linkGerado ? <div className="bg-amber-50 p-4 rounded-lg flex items-start gap-3 border border-amber-200">
              <div className="bg-amber-100 p-2 rounded-full">
                <AlertCircleIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-amber-900">
                  Telefone não cadastrado
                </h4>
                <p className="text-xs text-amber-700 mt-1">
                  O paciente <strong>{pacienteNome}</strong> não possui telefone
                  cadastrado. O link será gerado para você copiar e enviar
                  manualmente.
                </p>
              </div>
            </div> : !linkGerado && <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 border border-blue-100">
                <div className="bg-blue-100 p-2 rounded-full">
                  <SendIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900">
                    Envio via WhatsApp
                  </h4>
                  <p className="text-xs text-blue-700 mt-1">
                    O paciente receberá um link único no número{' '}
                    <strong>{pacienteTelefone}</strong> para assinar
                    digitalmente no próprio celular.
                  </p>
                </div>
              </div>}

          {!linkGerado && <>
              <Select label="Tipo de Documento" value={tipo} onChange={handleTipoChange} options={[{
            value: 'termo_consentimento',
            label: 'Termo de Consentimento'
          }, {
            value: 'autorizacao_procedimento',
            label: 'Autorização de Procedimento'
          }, {
            value: 'contrato',
            label: 'Contrato de Serviço'
          }, {
            value: 'outro',
            label: 'Outro Documento'
          }]} />
            

              <Input label="Título do Documento" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Termo de Consentimento" required icon={<FileTextIcon className="w-4 h-4 text-gray-400" />} />
            

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição / Conteúdo Resumido
                </label>
                <textarea className="w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-3 border min-h-[100px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva o que o paciente está assinando..." required />
              

                <p className="text-xs text-gray-500 mt-1">
                  Este texto aparecerá para o paciente ler antes de assinar.
                </p>
              </div>
            </>}

          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button type="button" variant="ghost" onClick={() => {
            setIsOpen(false);
            setLinkGerado(null);
            setCopiado(false);
          }} disabled={loading}>
              
              {linkGerado ? 'Fechar' : 'Cancelar'}
            </Button>
            {!linkGerado && <Button type="submit" disabled={loading || !titulo || !descricao} className="bg-teal-600 hover:bg-teal-700 text-white">
              
                {loading ? <>
                    <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                    Gerando...
                  </> : <>
                    <SendIcon className="w-4 h-4 mr-2" />
                    {semTelefone ? 'Gerar Link' : 'Enviar Solicitação'}
                  </>}
              </Button>}
          </div>
        </form>
      </Modal>
    </>;
}