import React, { useCallback, useEffect, useState, Component } from 'react';
import { LogOutIcon, KeyIcon, PaletteIcon, BuildingIcon, MenuIcon, MessageSquareIcon, ArrowRightIcon } from 'lucide-react';
import { useMensagensRecebidas } from '../../hooks/useMensagensRecebidas';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { TrocaSenhaModal } from '../TrocaSenhaModal';
import { Sessao, Operadora, Clinica } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { APP_VERSION } from '../../config/version';
interface HeaderProps {
  sessao: Sessao;
  onLogout: () => void;
  onTrocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
  operadoras: Operadora[];
  onSelecionarOperadora: (operadora: Operadora) => void;
  clinicas: Clinica[];
  onSelecionarClinica: (clinica: Clinica) => void;
  onNavigate?: (page: string) => void;
  onToggleSidebar?: () => void;
  onAparencia?: () => void;
}
export function Header({
  sessao,
  onLogout,
  onTrocarSenha,
  operadoras,
  onSelecionarOperadora,
  clinicas,
  onSelecionarClinica,
  onNavigate,
  onToggleSidebar,
  onAparencia
}: HeaderProps) {
  const [showTrocaSenha, setShowTrocaSenha] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const [isMensagensOpen, setIsMensagensOpen] = useState(false);
  // ⭐ Contador de respostas de pacientes. Substitui o toast, que aparecia por
  // cima da tela e atrapalhava quem estava trabalhando na agenda.
  const {
    novasPorPaciente,
    totalNovas,
    marcarComoLida,
    marcarTodasLidas
  } = useMensagensRecebidas(sessao.clinicaAtual?.id || '');
  // ⭐ VERSÃO DO SISTEMA — importada de config/version.ts (auto-atualiza a cada build)
  // (importado no topo do arquivo)
  // Verifica status do WhatsApp silenciosamente
  const checkWhatsAppStatus = useCallback(async () => {
    const clinicaId = sessao.clinicaAtual?.id;
    if (!clinicaId) {
      setWhatsappStatus('disconnected');
      return;
    }
    try {
      // Busca config da clínica
      const configRes = await fetch(`${API_BASE_URL}/api/whatsapp-config?clinicaId=${clinicaId}`);
      if (!configRes.ok) {
        setWhatsappStatus('disconnected');
        return;
      }
      const config = await configRes.json();
      if (!config.serverUrl || !config.sessionName) {
        setWhatsappStatus('disconnected');
        return;
      }
      // Verifica status da sessão no servidor WhatsApp via proxy
      const statusRes = await fetch(`${API_BASE_URL}/api/whatsapp/status?serverUrl=${encodeURIComponent(config.serverUrl)}&sessionName=${encodeURIComponent(config.sessionName)}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        // ⭐⭐⭐ CORRIGIDO: Inclui 'WORKING' que é o status retornado pelo proxy WAHA ⭐⭐⭐
        const statusUpper = (statusData.status || '').toUpperCase();
        const isConnected = statusUpper === 'CONNECTED' || statusUpper === 'WORKING' || statusUpper === 'ONLINE' || statusData.isReady === true;
        setWhatsappStatus(isConnected ? 'connected' : 'disconnected');
        // Salva no localStorage para sincronizar com outras partes
        localStorage.setItem('whatsapp_session_status', JSON.stringify({
          status: isConnected ? 'connected' : 'disconnected',
          isReady: isConnected,
          timestamp: Date.now(),
          clinicaId
        }));
      } else {
        setWhatsappStatus('disconnected');
      }
    } catch (err) {
      setWhatsappStatus('disconnected');
    }
  }, [sessao.clinicaAtual?.id]);
  // Verifica status na montagem e periodicamente
  useEffect(() => {
    // Verifica na montagem
    checkWhatsAppStatus();
    // ⭐ FASE 3: Polling inteligente — pausa em aba background.
    // 180s quando visível; reverifica imediatamente ao voltar para a aba.
    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval !== null) return;
      interval = setInterval(checkWhatsAppStatus, 180000);
    };
    const stopInterval = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopInterval();
      } else {
        checkWhatsAppStatus();
        startInterval();
      }
    };
    if (document.visibilityState !== 'hidden') startInterval();
    document.addEventListener('visibilitychange', handleVisibility);
    // ⭐⭐⭐ Escuta evento de config atualizada ⭐⭐⭐
    const handleConfigUpdate = () => {
      setTimeout(checkWhatsAppStatus, 2000);
    };
    // ⭐⭐⭐ NOVO: Escuta evento de status do WhatsApp mudou (disparado pelo WhatsAppSessionManager) ⭐⭐⭐
    const handleWhatsAppStatusChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        console.log('📱 [Header] Status WhatsApp mudou:', detail.status);
        const statusUpper = (detail.status || '').toUpperCase();
        const isConnected = statusUpper === 'CONNECTED' || statusUpper === 'WORKING' || detail.isReady === true;
        setWhatsappStatus(isConnected ? 'connected' : 'disconnected');
      } else {
        // Sem detalhe, re-verifica
        checkWhatsAppStatus();
      }
    };
    // ⭐⭐⭐ NOVO: Escuta mudanças no localStorage (quando WhatsAppSessionManager atualiza) ⭐⭐⭐
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'whatsapp_session_status' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const isConnected = data.status === 'connected' && data.isReady;
          setWhatsappStatus(isConnected ? 'connected' : 'disconnected');
        } catch (err) {

          /* ignora */}
      }
    };
    window.addEventListener('whatsapp-config-updated', handleConfigUpdate);
    window.addEventListener('whatsapp-status-changed', handleWhatsAppStatusChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('whatsapp-config-updated', handleConfigUpdate);
      window.removeEventListener('whatsapp-status-changed', handleWhatsAppStatusChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [checkWhatsAppStatus]);
  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Administrador',
      admin: 'Administrador',
      medico: 'Médico',
      dentista: 'Dentista',
      atendente: 'Atendente'
    };
    return labels[tipo] || tipo;
  };
  // Obtém o logo da clínica atual
  const logoUrl = sessao.clinicaAtual?.logoUrl;
  return <>
      <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 lg:gap-6 min-w-0">
            {/* ⭐ Hamburger menu - mobile only */}
            <button onClick={onToggleSidebar} className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0">
              
              <MenuIcon className="w-6 h-6" />
            </button>

            {/* ⭐ LOGO DA CLÍNICA */}
            {sessao.clinicaAtual && <div className="flex-shrink-0 hidden sm:block">
                {logoUrl ? <img src={logoUrl.startsWith('data:') ? logoUrl : `${API_BASE_URL}${logoUrl}`} alt={`Logo ${sessao.clinicaAtual.nome}`} className="h-12 w-auto max-w-[120px] object-contain" /> : <div className="h-12 w-12 bg-teal-100 rounded-lg flex items-center justify-center" title={sessao.clinicaAtual.nome}>
                
                    <BuildingIcon className="w-6 h-6 text-teal-600" />
                  </div>}
              </div>}

            <div className="min-w-0">
              <h2 className="text-base lg:text-lg font-semibold text-gray-900 truncate">
                {sessao.usuario.nome}
              </h2>
              <p className="text-xs lg:text-sm text-gray-500 truncate">
                {getTipoLabel(sessao.usuario.tipo)}
              </p>
            </div>

            {/* Seletores de Operadora e Clínica para Super Admin - hide on small mobile */}
            {sessao.usuario.tipo === 'super_admin' && <div className="hidden md:flex items-center gap-4">
                <div className="min-w-[200px]">
                  <Select label="" value={sessao.operadoraSelecionada?.id || ''} onChange={(e) => {
                const operadora = operadoras.find((o) => o.id === e.target.value);
                if (operadora) onSelecionarOperadora(operadora);
              }} options={[{
                value: '',
                label: 'Selecione uma operadora'
              }, ...operadoras.map((o) => ({
                value: o.id,
                label: o.nome
              }))]} />
                
                </div>

                {sessao.operadoraSelecionada && clinicas.filter((c) => c.operadoraId === sessao.operadoraSelecionada?.id).length > 0 && <div className="min-w-[200px]">
                      <Select label="" value={sessao.clinicaAtual?.id || ''} onChange={(e) => {
                const clinica = clinicas.find((c) => c.id === e.target.value);
                if (clinica) onSelecionarClinica(clinica);
              }} options={[{
                value: '',
                label: 'Selecione uma clínica'
              }, ...clinicas.filter((c) => c.ativa && c.operadoraId === sessao.operadoraSelecionada?.id).map((c) => ({
                value: c.id,
                label: c.nome
              }))]} />
                
                    </div>}
              </div>}

            {/* Seletor de Clínica para usuários não super_admin - hide on small mobile */}
            {sessao.usuario.tipo !== 'super_admin' && sessao.usuario.operadoraId && clinicas.filter((c) => c.operadoraId === sessao.usuario.operadoraId).length > 0 && <div className="hidden md:flex items-center gap-4">
                  <div className="min-w-[200px]">
                    <Select label="" value={sessao.clinicaAtual?.id || ''} onChange={(e) => {
                const clinica = clinicas.find((c) => c.id === e.target.value);
                if (clinica) onSelecionarClinica(clinica);
              }} options={[{
                value: '',
                label: 'Selecione uma clínica'
              }, ...clinicas.filter((c) => c.ativa && c.operadoraId === sessao.usuario.operadoraId).map((c) => ({
                value: c.id,
                label: c.nome
              }))]} />
                
                  </div>
                </div>}

            {/* Info Operadora/Clínica - hide on mobile */}
            {sessao.usuario.tipo !== 'super_admin' && sessao.usuario.operadoraId && <div className="hidden lg:block ml-4 px-4 py-2 bg-teal-50 border border-teal-200 rounded-lg">
                  {operadoras.find((o) => o.id === sessao.usuario.operadoraId) && <p className="text-sm">
                      <span className="text-gray-600">Operadora:</span>{' '}
                      <span className="font-bold text-teal-700">
                        {operadoras.find((o) => o.id === sessao.usuario.operadoraId)?.nome}
                      </span>
                    </p>}
                  {sessao.clinicaAtual && <p className="text-sm">
                      <span className="text-gray-600">Clínica:</span>{' '}
                      <span className="font-bold text-teal-700">
                        {sessao.clinicaAtual.nome}
                      </span>
                    </p>}
                </div>}

            {sessao.usuario.tipo === 'super_admin' && (sessao.operadoraSelecionada || sessao.clinicaAtual) && <div className="hidden lg:block ml-4 px-4 py-2 bg-teal-50 border border-teal-200 rounded-lg">
                  {sessao.operadoraSelecionada && <p className="text-sm">
                      <span className="text-gray-600">Operadora:</span>{' '}
                      <span className="font-bold text-teal-700">
                        {sessao.operadoraSelecionada.nome}
                      </span>
                    </p>}
                  {sessao.clinicaAtual && <p className="text-sm">
                      <span className="text-gray-600">Clínica:</span>{' '}
                      <span className="font-bold text-teal-700">
                        {sessao.clinicaAtual.nome}
                      </span>
                    </p>}
                </div>}
          </div>

          <div className="flex items-center gap-1 lg:gap-4 flex-shrink-0">
            {/* ⭐ Respostas de pacientes: contador + lista de quem escreveu */}
            {sessao.clinicaAtual && <div className="relative">
                <button onClick={() => setIsMensagensOpen((o) => !o)} className={`relative p-2 rounded-full transition-colors ${totalNovas > 0 ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 hover:bg-gray-100'}`} title={totalNovas > 0 ? `${totalNovas} nova(s) mensagem(ns) de pacientes` : 'Nenhuma mensagem nova'} aria-label={totalNovas > 0 ? `${totalNovas} novas mensagens de pacientes` : 'Nenhuma mensagem nova'}>
              
                  <MessageSquareIcon className="w-5 h-5 lg:w-6 lg:h-6" />
                  {totalNovas > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                      {totalNovas > 99 ? '99+' : totalNovas}
                    </span>}
                </button>

                {isMensagensOpen && <>
                    <div className="fixed inset-0 z-[40]" onClick={() => setIsMensagensOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-[50]">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Respostas de pacientes
                        </h3>
                        {totalNovas > 0 && <button onClick={marcarTodasLidas} className="text-xs text-gray-500 hover:text-gray-700">
                            Marcar lidas
                          </button>}
                      </div>

                      {novasPorPaciente.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500 text-center">
                          Nenhuma mensagem nova.
                        </p> : <ul className="divide-y divide-gray-100">
                          {novasPorPaciente.map((item) => <li key={item.pacienteId}>
                              <button onClick={() => {
                      marcarComoLida(item.pacienteId);
                      setIsMensagensOpen(false);
                      onNavigate?.('mensagens');
                    }} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                    
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {item.pacienteNome}
                                  </span>
                                  <span className="flex-shrink-0 text-[11px] font-bold text-white bg-emerald-600 rounded-full px-1.5 py-0.5">
                                    {item.quantidade}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  {item.ultimaMensagem}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {new Date(item.dataHora).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                                </p>
                              </button>
                            </li>)}
                        </ul>}

                      <button onClick={() => {
                  setIsMensagensOpen(false);
                  onNavigate?.('mensagens');
                }} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-200 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
                
                        Ir para Mensagens
                        <ArrowRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </>}
              </div>}

            {/* Ícone WhatsApp */}
            {sessao.clinicaAtual && <button onClick={() => onNavigate?.('configuracoes')} className="p-2 rounded-full transition-all hover:scale-110" title={whatsappStatus === 'connected' ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}>
              
                <svg className={`w-5 h-5 lg:w-6 lg:h-6 ${whatsappStatus === 'connected' ? 'text-green-500' : whatsappStatus === 'checking' ? 'text-gray-400 animate-pulse' : 'text-red-500'}`} viewBox="0 0 24 24" fill="currentColor">
                
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
              </button>}

            <Button variant="ghost" onClick={() => setShowTrocaSenha(true)} className="hidden sm:flex" title="Trocar senha e verificação em duas etapas">
              
              <KeyIcon className="w-4 h-4 mr-2" />
              <span className="hidden lg:inline whitespace-nowrap">Segurança</span>
            </Button>

            {onAparencia &&
            <Button variant="ghost" onClick={onAparencia} aria-label="Aparência" title="Aparência: cor, modo escuro, tamanho da letra e cantos — só para você">
                <PaletteIcon className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline whitespace-nowrap">Aparência</span>
              </Button>
            }

            <Button variant="ghost" onClick={onLogout}>
              <LogOutIcon className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">Sair</span>
            </Button>

            {/* ⭐ Foto do Usuário */}
            <div className="relative flex items-center ml-2" style={{
            width: 32,
            height: 32
          }}>
              
              <button onClick={() => setIsPhotoExpanded(!isPhotoExpanded)} className="flex-shrink-0 rounded-full overflow-hidden border border-gray-200 hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300 z-10 bg-white" style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: isPhotoExpanded ? 160 : 32,
              height: isPhotoExpanded ? 160 : 32,
              transition: 'width 300ms ease-in-out, height 300ms ease-in-out, box-shadow 300ms ease-in-out',
              boxShadow: isPhotoExpanded ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : 'none'
            }} title={isPhotoExpanded ? 'Recolher foto' : 'Ampliar foto'}>
                
                {sessao.usuario.fotoUrl ? <img src={sessao.usuario.fotoUrl.startsWith('/uploads') ? `${API_BASE_URL}${sessao.usuario.fotoUrl}` : sessao.usuario.fotoUrl} alt={sessao.usuario.nome} className="w-full h-full object-cover" onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                const fallback = img.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = 'flex';
              }} /> : null}
                <div className="w-full h-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold" style={{
                display: sessao.usuario.fotoUrl ? 'none' : 'flex',
                fontSize: isPhotoExpanded ? '4rem' : '1rem'
              }}>
                  
                  {(sessao.usuario.nome || '?').charAt(0).toUpperCase()}
                </div>
              </button>
              {/* Overlay para fechar quando expandido */}
              {isPhotoExpanded && <div className="fixed inset-0 z-[5]" onClick={() => setIsPhotoExpanded(false)} />}
            </div>
          </div>
        </div>
      </header>

      {showTrocaSenha && <TrocaSenhaModal isOpen={showTrocaSenha} onClose={() => setShowTrocaSenha(false)} onTrocarSenha={async (senhaAtual, novaSenha) => {
      try {
        // O resultado real da troca (false = senha atual não confere)
        return (await onTrocarSenha(senhaAtual, novaSenha)) !== false;
      } catch (err) {
        return false;
      }
    }} />}
    </>;
}