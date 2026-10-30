import React, { useCallback, useEffect, useRef, useReducer, createElement, Component } from 'react';
import { createPortal } from 'react-dom';
import { Paciente } from '../types';
import { MemedConfig, MemedProfissional } from '../types/memed';
import { Loader2Icon, XIcon, AlertCircleIcon, RefreshCwIcon, PillIcon, CheckCircleIcon, WifiOffIcon } from 'lucide-react';
// ============================================================
// SDK Manager — encapsula TODA a interação com o Memed
// ============================================================
class MemedSDKManager {
  private containerId = 'memed-prescricao-container';
  private scriptEl: HTMLScriptElement | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private containerEl: HTMLDivElement | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: MutationObserver | null = null;
  private closeCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onCloseCallback: (() => void) | null = null;
  private isDestroyed = false;
  async init(token: string, paciente: {
    nome: string;
    cpf?: string;
    dataNascimento?: string;
    telefone?: string;
    email?: string;
    id: string;
  }, onPrescricao: (id: string, pdfUrl: string) => void, onProgress: (step: string, pct: number) => void, onClose: () => void): Promise<void> {
    // Validação
    if (!token) throw new Error('Token do profissional ausente. Cadastre em Profissionais Memed.');
    this.onCloseCallback = onClose;
    // 1 — Limpa resíduos anteriores
    onProgress('Preparando ambiente...', 10);
    this.cleanupResidues();
    this.isDestroyed = false;
    // 2 — Cria overlay + container no body
    onProgress('Criando interface...', 15);
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'memed-overlay';
    Object.assign(this.overlayEl.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.5)',
      zIndex: '99998',
      transition: 'opacity .2s'
    });
    document.body.appendChild(this.overlayEl);
    this.containerEl = document.createElement('div');
    this.containerEl.id = this.containerId;
    Object.assign(this.containerEl.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'white',
      zIndex: '99999'
    });
    document.body.appendChild(this.containerEl);
    if (this.isDestroyed) return;
    // 3 — Carrega script
    onProgress('Carregando módulo Memed...', 25);
    await this.loadScript(token);
    if (this.isDestroyed) return;
    // 4 — Aguarda objetos globais
    onProgress('Conectando ao Memed...', 50);
    await this.waitForGlobals();
    if (this.isDestroyed) return;
    // 5 — Registra eventos
    onProgress('Registrando eventos...', 60);
    try {
      // @ts-ignore
      MdHub.event.add('prescricaoImpressa', (data: any) => {
        if (data?.id && data?.pdfUrl) onPrescricao(data.id, data.pdfUrl);
      });
    } catch {

      /* evento opcional */}
    // ⭐ Detecta quando o Memed fecha seu módulo
    try {
      // @ts-ignore
      MdHub.event.add('moduleHide', () => {
        console.log('🔵 [Memed SDK] moduleHide detectado');
        this.triggerClose();
      });
    } catch {

      /* evento opcional */}
    try {
      // @ts-ignore
      MdHub.event.add('moduleClose', () => {
        console.log('🔵 [Memed SDK] moduleClose detectado');
        this.triggerClose();
      });
    } catch {

      /* evento opcional */}
    // 6 — Configura paciente
    onProgress('Configurando paciente...', 70);
    await this.setPaciente(paciente);
    if (this.isDestroyed) return;
    // 7 — Exibe módulo
    onProgress('Abrindo prescrição...', 85);
    await this.showModule();
    if (this.isDestroyed) return;
    // 8 — Inicia monitoramento de fechamento
    this.startCloseDetection();
    onProgress('Pronto!', 100);
  }
  private triggerClose() {
    if (this.isDestroyed) return;
    console.log('🔵 [Memed SDK] triggerClose — limpando e notificando React');
    const cb = this.onCloseCallback;
    this.cleanup();
    cb?.();
  }
  /** Monitora se o Memed removeu seu conteúdo do container */
  private startCloseDetection() {
    // MutationObserver: detecta se o container fica vazio
    if (this.containerEl) {
      this.observer = new MutationObserver(() => {
        if (!this.containerEl) return;
        // Se o container não tem mais iframes ou conteúdo significativo
        const iframes = this.containerEl.querySelectorAll('iframe');
        const hasContent = iframes.length > 0 || this.containerEl.children.length > 1;
        if (!hasContent && !this.isDestroyed) {
          // Aguarda um momento para confirmar que não é transitório
          setTimeout(() => {
            if (!this.containerEl) return;
            const iframesCheck = this.containerEl.querySelectorAll('iframe');
            if (iframesCheck.length === 0 && this.containerEl.children.length <= 1) {
              console.log('🔵 [Memed SDK] Container ficou vazio — Memed fechou');
              this.triggerClose();
            }
          }, 500);
        }
      });
      this.observer.observe(this.containerEl, {
        childList: true,
        subtree: true
      });
    }
    // Polling de segurança: verifica a cada 2s se o container ainda tem conteúdo
    this.closeCheckInterval = setInterval(() => {
      if (this.isDestroyed) {
        if (this.closeCheckInterval) clearInterval(this.closeCheckInterval);
        return;
      }
      const container = document.getElementById(this.containerId);
      if (!container) {
        console.log('🔵 [Memed SDK] Container removido do DOM');
        this.triggerClose();
        return;
      }
      // Verifica se o Memed escondeu o container via display/visibility
      const style = window.getComputedStyle(container);
      if (style.display === 'none' || style.visibility === 'hidden') {
        console.log('🔵 [Memed SDK] Container escondido pelo Memed');
        this.triggerClose();
      }
    }, 2000);
  }
  private loadScript(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Remove scripts antigos
      document.querySelectorAll('script[src*="sinapse-prescricao"]').forEach((s) => s.remove());
      document.querySelectorAll('script[src*="plataforma.hub"]').forEach((s) => s.remove());
      this.scriptEl = document.createElement('script');
      this.scriptEl.src = 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';
      this.scriptEl.setAttribute('data-token', token);
      this.scriptEl.setAttribute('data-container', this.containerId);
      // ⭐ FIX: type="text/javascript" para que o SDK reconheça como script padrão
      this.scriptEl.type = 'text/javascript';
      const timeout = setTimeout(() => reject(new Error('Timeout ao carregar script (30s).')), 30000);
      this.scriptEl.onload = () => {
        clearTimeout(timeout);
        // ⭐ FIX: Aguarda um pouco para o SDK processar internamente
        setTimeout(() => resolve(), 1000);
      };
      this.scriptEl.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Falha ao carregar script do Memed. Verifique sua conexão.'));
      };
      (document.head || document.body).appendChild(this.scriptEl);
    });
  }
  private waitForGlobals(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 300; // 30 segundos (300 * 100ms)
      const check = () => {
        if (this.isDestroyed) {
          reject(new Error('SDK destruído durante inicialização'));
          return;
        }
        // @ts-ignore
        const hasSinapse = typeof MdSinapsePrescricao !== 'undefined' && MdSinapsePrescricao !== undefined;
        // @ts-ignore
        const hasHub = typeof MdHub !== 'undefined' && MdHub !== undefined;
        // @ts-ignore
        const hasModule = hasHub && typeof MdHub.module !== 'undefined';
        // @ts-ignore
        const hasCommand = hasHub && typeof MdHub.command !== 'undefined';
        // @ts-ignore
        const hasEvent = hasHub && typeof MdHub.event !== 'undefined';
        if (hasSinapse && hasHub && hasModule && hasCommand && hasEvent) {
          console.log(`✅ [Memed SDK] Globals prontos após ${attempts * 100}ms`);
          // Aguarda o SDK estabilizar internamente (iframes, postMessage handlers)
          setTimeout(() => resolve(), 2000);
        } else if (attempts++ >= maxAttempts) {
          const missing = [];
          if (!hasSinapse) missing.push('MdSinapsePrescricao');
          if (!hasHub) missing.push('MdHub');
          if (!hasModule) missing.push('MdHub.module');
          if (!hasCommand) missing.push('MdHub.command');
          if (!hasEvent) missing.push('MdHub.event');
          reject(new Error(`Memed não respondeu após 30s. Objetos ausentes: ${missing.join(', ')}. Verifique sua conexão.`));
        } else {
          this.pollTimer = setTimeout(check, 100);
        }
      };
      // Aguarda um momento antes de começar a verificar,
      // dando tempo para o script novo criar globals frescos
      setTimeout(check, 500);
    });
  }
  private async setPaciente(p: {
    nome: string;
    cpf?: string;
    dataNascimento?: string;
    telefone?: string;
    email?: string;
    id: string;
  }) {
    const dados: Record<string, string> = {
      idExterno: p.cpf || `pac-${p.id}`,
      nome: p.nome
    };
    if (p.dataNascimento) dados.data_nascimento = p.dataNascimento;
    if (p.cpf) dados.cpf = p.cpf;
    if (p.telefone) dados.telefone = p.telefone.replace(/\D/g, '');
    if (p.email) dados.email = p.email;
    // Aguarda SDK estabilizar antes de enviar comando
    await new Promise((r) => setTimeout(r, 2000));
    // Tenta até 3 vezes com delay entre tentativas
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`🔵 [Memed SDK] setPaciente tentativa ${attempt}/3`);
        await Promise.race([
        // @ts-ignore
        MdHub.command.send('plataforma.prescricao', 'setPaciente', dados), new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout setPaciente')), 15000))]);
        console.log('✅ [Memed SDK] setPaciente OK');
        return;
      } catch (err) {
        console.warn(`⚠️ setPaciente tentativa ${attempt} falhou:`, err);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    console.warn('⚠️ setPaciente falhou após 3 tentativas, continuando...');
  }
  private async showModule() {
    // Aguarda SDK estabilizar completamente
    await new Promise((r) => setTimeout(r, 2000));
    // Tenta até 3 vezes com delay crescente
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (this.isDestroyed) return;
      try {
        console.log(`🔵 [Memed SDK] showModule tentativa ${attempt}/3`);
        await Promise.race([
        // @ts-ignore
        MdHub.module.show('plataforma.prescricao'), new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout showModule (tentativa ${attempt})`)), 15000))]);
        console.log('✅ [Memed SDK] showModule OK');
        return;
      } catch (err: any) {
        console.warn(`⚠️ showModule tentativa ${attempt} falhou:`, err?.message);
        if (attempt < 3) {
          // Delay crescente entre tentativas
          const delay = attempt * 2000;
          console.log(`🔵 [Memed SDK] Aguardando ${delay}ms antes de tentar novamente...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw new Error('Não foi possível abrir o módulo de prescrição após 3 tentativas. Verifique sua conexão e tente novamente.');
        }
      }
    }
  }
  /** Limpa resíduos do DOM sem marcar isDestroyed (para uso no início do init) */
  private cleanupResidues() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.closeCheckInterval) clearInterval(this.closeCheckInterval);
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.containerEl?.remove();
    this.overlayEl?.remove();
    document.getElementById(this.containerId)?.remove();
    document.getElementById('memed-overlay')?.remove();
    // Remove scripts antigos do Memed
    document.querySelectorAll('script[src*="sinapse-prescricao"]').forEach((s) => s.remove());
    document.querySelectorAll('script[src*="memed"]').forEach((s) => s.remove());
    // Remove iframes órfãos do Memed
    document.querySelectorAll('iframe[src*="memed"]').forEach((f) => f.remove());
    // Remove estilos e links injetados pelo Memed
    document.querySelectorAll('link[href*="memed"], style[data-memed]').forEach((el) => el.remove());
    // Remove divs criados pelo SDK do Memed (sinapse containers)
    document.querySelectorAll('[id*="sinapse"], [class*="sinapse"], [id*="memed-"]').forEach((el) => {
      if (el.id !== this.containerId) el.remove();
    });
    // ⭐ CRÍTICO: Remove objetos globais do Memed para forçar re-inicialização limpa
    // Sem isso, na segunda abertura o waitForGlobals() encontra globals STALE
    // que referenciam iframes/containers já removidos do DOM, causando:
    // - setPaciente timeout (MdHub.command.send fala com iframe morto)
    // - showModule "Cannot read properties of null" (container não existe mais)
    try {
      delete (window as any).MdHub;
    } catch {
      ;
      (window as any).MdHub = undefined;
    }
    try {
      delete (window as any).MdSinapsePrescricao;
    } catch {
      ;
      (window as any).MdSinapsePrescricao = undefined;
    }
    try {
      delete (window as any).MdSinapsePresricao;
    } catch {
      ;
      (window as any).MdSinapsePresricao = undefined;
    }
    try {
      delete (window as any).Memed;
    } catch {
      ;
      (window as any).Memed = undefined;
    }
    this.containerEl = null;
    this.overlayEl = null;
    this.scriptEl = null;
    this.onCloseCallback = null;
  }
  /** Cleanup completo — marca isDestroyed para parar init em andamento */
  cleanup() {
    this.isDestroyed = true;
    this.cleanupResidues();
  }
  setOverlayClick(handler: () => void) {
    if (this.overlayEl) this.overlayEl.onclick = handler;
  }
}
// ============================================================
// State Machine — estados claros e previsíveis
// ============================================================
type ModalState = {
  status: 'idle';
} | {
  status: 'loading';
  step: string;
  progress: number;
} | {
  status: 'ready';
} | {
  status: 'error';
  message: string;
  retries: number;
};
type ModalAction = {
  type: 'START';
} | {
  type: 'PROGRESS';
  step: string;
  progress: number;
} | {
  type: 'READY';
} | {
  type: 'ERROR';
  message: string;
} | {
  type: 'RETRY';
} | {
  type: 'RESET';
};
function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'START':
      return {
        status: 'loading',
        step: 'Iniciando Memed...',
        progress: 0
      };
    case 'PROGRESS':
      return {
        status: 'loading',
        step: action.step,
        progress: action.progress
      };
    case 'READY':
      return {
        status: 'ready'
      };
    case 'ERROR':
      return {
        status: 'error',
        message: action.message,
        retries: state.status === 'error' ? state.retries + 1 : 1
      };
    case 'RETRY':
      return {
        status: 'loading',
        step: 'Tentando novamente...',
        progress: 0
      };
    case 'RESET':
      return {
        status: 'idle'
      };
    default:
      return state;
  }
}
// ============================================================
// Componente React — apenas UI, lógica no SDK Manager
// ============================================================
interface MemedPrescricaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  paciente: Paciente;
  profissional: MemedProfissional;
  config: MemedConfig;
  onPrescricaoCriada: (prescricaoId: string, pdfUrl: string) => void;
  onError?: (message: string) => void;
}
export function MemedPrescricaoModal({
  isOpen,
  onClose,
  paciente,
  profissional,
  config,
  onPrescricaoCriada,
  onError
}: MemedPrescricaoModalProps) {
  const [state, dispatch] = useReducer(modalReducer, {
    status: 'idle'
  });
  const sdkRef = useRef<MemedSDKManager | null>(null);
  const initRef = useRef(false);
  // ⭐ Refs estáveis para evitar re-criação de callbacks
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPrescricaoCriadaRef = useRef(onPrescricaoCriada);
  onPrescricaoCriadaRef.current = onPrescricaoCriada;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const profissionalRef = useRef(profissional);
  profissionalRef.current = profissional;
  const pacienteRef = useRef(paciente);
  pacienteRef.current = paciente;
  const handleClose = useCallback(() => {
    console.log('🔵 [Memed Modal] handleClose chamado');
    sdkRef.current?.cleanup();
    sdkRef.current = null;
    initRef.current = false;
    dispatch({
      type: 'RESET'
    });
    onCloseRef.current();
  }, []);
  const startMemed = useCallback(async () => {
    console.log('🔵 [Memed Modal] startMemed chamado');
    dispatch({
      type: 'START'
    });
    // Cria nova instância do SDK
    const sdk = new MemedSDKManager();
    sdkRef.current = sdk;
    sdk.setOverlayClick(() => {
      console.log('🔵 [Memed Modal] Overlay clicado');
      sdkRef.current?.cleanup();
      sdkRef.current = null;
      initRef.current = false;
      dispatch({
        type: 'RESET'
      });
      onCloseRef.current();
    });
    try {
      const prof = profissionalRef.current;
      const pac = pacienteRef.current;
      console.log('🔵 [Memed Modal] Iniciando SDK com token:', prof.token ? 'SIM' : 'NÃO');
      await sdk.init(prof.token, {
        nome: pac.nome,
        cpf: pac.cpf,
        dataNascimento: pac.dataNascimento,
        telefone: pac.telefone,
        email: pac.email,
        id: pac.id
      }, (id, pdfUrl) => {
        console.log('✅ [Memed Modal] Prescrição criada:', id);
        onPrescricaoCriadaRef.current(id, pdfUrl);
        sdkRef.current?.cleanup();
        sdkRef.current = null;
        initRef.current = false;
        dispatch({
          type: 'RESET'
        });
        onCloseRef.current();
      }, (step, progress) => {
        console.log(`🔵 [Memed Modal] Progresso: ${step} (${progress}%)`);
        dispatch({
          type: 'PROGRESS',
          step,
          progress
        });
      },
      // ⭐ onClose callback — chamado quando o Memed fecha por conta própria
      () => {
        console.log('🔵 [Memed Modal] SDK detectou fechamento do Memed');
        sdkRef.current = null;
        initRef.current = false;
        dispatch({
          type: 'RESET'
        });
        onCloseRef.current();
      });
      console.log('✅ [Memed Modal] SDK pronto!');
      dispatch({
        type: 'READY'
      });
    } catch (err: any) {
      const msg = err?.message || 'Erro desconhecido ao carregar Memed';
      console.error('❌ [Memed Modal] Erro:', msg);
      dispatch({
        type: 'ERROR',
        message: msg
      });
      onErrorRef.current?.(msg);
    }
  }, []); // ⭐ Sem dependências — usa refs
  // ⭐ FIX: Ref para rastrear se o componente está realmente montado
  // Evita que o StrictMode (dev) destrua o SDK durante unmount/remount rápido
  const mountedRef = useRef(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Inicia quando abre
  useEffect(() => {
    mountedRef.current = true;
    // ⭐ FIX: Cancela qualquer cleanup pendente do StrictMode
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
      console.log('🔵 [Memed Modal] Remount detectado — cancelando cleanup');
    }
    if (!isOpen) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    console.log('🔵 [Memed Modal] useEffect disparado — chamando startMemed');
    startMemed();
    return () => {
      console.log('🔵 [Memed Modal] useEffect cleanup');
      mountedRef.current = false;
      // ⭐ FIX: Delay o cleanup para permitir que o StrictMode remonte
      // Se o componente remontar em <200ms (StrictMode), o cleanup é cancelado
      unmountTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) {
          console.log('🔵 [Memed Modal] Cleanup final confirmado (não remontou)');
          sdkRef.current?.cleanup();
          sdkRef.current = null;
          initRef.current = false;
        }
      }, 300);
    };
  }, [isOpen, startMemed]);
  // Cleanup ao desmontar de verdade (navegação, fechamento)
  useEffect(() => {
    return () => {
      console.log('🔵 [Memed Modal] Componente desmontando — cleanup final');
      mountedRef.current = false;
      // Cleanup imediato no unmount final
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
      }
      // ⭐ Delay curto para distinguir StrictMode de unmount real
      setTimeout(() => {
        if (!mountedRef.current) {
          sdkRef.current?.cleanup();
          sdkRef.current = null;
        }
      }, 300);
    };
  }, []);
  const handleRetry = () => {
    console.log('🔵 [Memed Modal] Retry');
    sdkRef.current?.cleanup();
    sdkRef.current = null;
    initRef.current = false;
    dispatch({
      type: 'RETRY'
    });
    setTimeout(startMemed, 300);
  };
  if (!isOpen) return null;
  // ⭐ Quando ready: mostra botão flutuante de fechar (o Memed renderiza no body)
  if (state.status === 'ready') {
    return createPortal(<button onClick={handleClose} className="fixed top-4 right-4 z-[100000] bg-white/90 hover:bg-white text-gray-700 hover:text-red-600 rounded-full p-2.5 shadow-lg border border-gray-200 hover:border-red-300 transition-all duration-200 backdrop-blur-sm group" aria-label="Fechar Memed" title="Fechar prescrição e voltar">
        
        <XIcon className="w-5 h-5" />
        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Fechar Memed
        </span>
      </button>, document.body);
  }
  // Loading ou Erro — renderiza via Portal
  return createPortal(<div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
              <PillIcon className="w-4 h-4 text-teal-600" />
            </div>
            <span className="font-semibold text-gray-900">
              Prescrição Memed
            </span>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Fechar">
            
            <XIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          {state.status === 'error' ? <div className="text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                {state.message.includes('conexão') || state.message.includes('Timeout') ? <WifiOffIcon className="w-7 h-7 text-red-500" /> : <AlertCircleIcon className="w-7 h-7 text-red-500" />}
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Não foi possível conectar
              </h3>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                {state.message}
              </p>

              <div className="flex gap-2.5 justify-center">
                <button onClick={handleClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                
                  Fechar
                </button>
                {state.retries < 3 && <button onClick={handleRetry} className="px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2">
                
                    <RefreshCwIcon className="w-3.5 h-3.5" />
                    Tentar novamente
                  </button>}
              </div>

              {state.retries < 3 && <p className="text-xs text-gray-400 mt-3">
                  Tentativa {state.retries} de 3
                </p>}

              <div className="mt-5 p-3 bg-amber-50 border border-amber-100 rounded-lg text-left">
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong>Dica:</strong> Verifique se o profissional está
                  cadastrado em <strong>Menu → Profissionais Memed</strong> com
                  token válido.
                </p>
              </div>
            </div> : <div className="text-center">
              <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                <Loader2Icon className="w-7 h-7 text-teal-600 animate-spin" />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Carregando Prescrição
              </h3>
              <p className="text-sm text-gray-500 mb-5">
                {state.status === 'loading' ? state.step : 'Iniciando...'}
              </p>

              {/* Barra de progresso */}
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mb-1.5">
                <div className="bg-teal-500 h-full rounded-full transition-all duration-500 ease-out" style={{
              width: `${state.status === 'loading' ? state.progress : 0}%`
            }} />
              
              </div>
              <p className="text-xs text-gray-400 tabular-nums">
                {state.status === 'loading' ? state.progress : 0}%
              </p>

              {/* Info paciente/profissional */}
              <div className="mt-5 flex gap-3">
                <div className="flex-1 p-2.5 bg-gray-50 rounded-lg text-left">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">
                    Paciente
                  </p>
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {paciente.nome}
                  </p>
                </div>
                <div className="flex-1 p-2.5 bg-gray-50 rounded-lg text-left">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">
                    Profissional
                  </p>
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {profissional.titulo ? `${profissional.titulo} ${profissional.nome}` : profissional.nome}
                  </p>
                </div>
              </div>
            </div>}
        </div>
      </div>
    </div>, document.body);
}