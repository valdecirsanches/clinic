import { useState, useEffect, useRef } from 'react';
import { Usuario, Sessao, Clinica, Operadora } from '../types';
import { API_BASE_URL, isMagicPatterns } from '../config/api';
import type { DesafioLogin, ResultadoLogin } from '../types/login';
import { obterToken, salvarToken } from '../utils/autenticacaoApi';

// Chaves do localStorage para persistência
const STORAGE_KEYS = {
  SESSAO: 'sessao',
  // Função para gerar chave de preferências por usuário
  getUserPreferencesKey: (userId: string) => `user_preferences_${userId}`
};

// ⭐ Chave do BroadcastChannel para sincronização entre abas
const SYNC_CHANNEL_NAME = 'easyclin_sync';
export function useAuth() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  // ⭐ Ref para controlar debounce de refresh por visibilidade
  const lastRefreshRef = useRef<number>(0);
  const MIN_REFRESH_INTERVAL = 5000; // 5 segundos mínimo entre refreshes

  // ⭐ Ref para o BroadcastChannel
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    // Verificar sessão ativa
    let storedSessao = localStorage.getItem(STORAGE_KEYS.SESSAO);
    // ⭐ Sessão gravada antes do login com token (ou token apagado): o servidor
    // não a aceita mais — pede login de novo em vez de abrir telas vazias.
    if (storedSessao && !obterToken() && !isMagicPatterns) {
      console.log('🔐 [useAuth] Sessão sem token de acesso — novo login necessário');
      localStorage.removeItem(STORAGE_KEYS.SESSAO);
      storedSessao = null;
    }
    if (storedSessao || isMagicPatterns) loadUsuarios();else
    setLoading(false);
    console.log('🔍 [useAuth] Verificando sessão armazenada...');
    if (storedSessao) {
      try {
        const parsedSessao = JSON.parse(storedSessao);
        const userId = parsedSessao.usuario?.id;
        console.log(
          '📦 [useAuth] Sessão encontrada para usuário:',
          parsedSessao.usuario?.nome
        );

        // ⭐ CORRIGIDO: NÃO usa localStorage global para operadora/clínica
        // A sessão já contém operadoraSelecionada e clinicaAtual do último login/seleção
        // Isso é seguro porque o SESSAO é sobrescrito a cada login
        console.log(
          '✅ [useAuth] Operadora da sessão:',
          parsedSessao.operadoraSelecionada?.nome || 'nenhuma'
        );
        console.log(
          '✅ [useAuth] Clínica da sessão:',
          parsedSessao.clinicaAtual?.nome || 'nenhuma'
        );
        setSessao(parsedSessao);
        console.log('✅ [useAuth] Sessão restaurada com sucesso!');

        // ⭐ FIX: Atualiza dados do usuário do servidor (foto, nome, etc. podem ter mudado)
        if (parsedSessao.usuario?.id && !isMagicPatterns) {
          fetch(`${API_BASE_URL}/api/usuarios/${parsedSessao.usuario.id}`).
          then((resp) => {
            if (resp.ok) return resp.json();
            return null;
          }).
          then((usuarioAtualizado) => {
            if (usuarioAtualizado) {
              const sessaoAtualizada = {
                ...parsedSessao,
                usuario: {
                  ...parsedSessao.usuario,
                  ...usuarioAtualizado
                }
              };
              setSessao(sessaoAtualizada);
              localStorage.setItem(
                STORAGE_KEYS.SESSAO,
                JSON.stringify(sessaoAtualizada)
              );
              console.log(
                '🔄 [useAuth] Dados do usuário atualizados do servidor (fotoUrl, nome, etc.)'
              );
            }
          }).
          catch((e) => {
            console.warn(
              '⚠️ [useAuth] Não foi possível atualizar dados do usuário:',
              e
            );
          });
        }
      } catch (err) {
        console.error('❌ [useAuth] Erro ao parsear sessão:', err);
        localStorage.removeItem(STORAGE_KEYS.SESSAO);
      }
    } else {
      console.log('⚠️ [useAuth] Nenhuma sessão armazenada encontrada');
    }
  }, []);

  // ⭐ Listener para atualizar sessão quando outro componente a modifica (ex: foto do usuário)
  useEffect(() => {
    const handleSessaoUpdated = () => {
      const storedSessao = localStorage.getItem(STORAGE_KEYS.SESSAO);
      if (storedSessao) {
        try {
          const parsed = JSON.parse(storedSessao);
          setSessao(parsed);
          console.log(
            '🔄 [useAuth] Sessão re-sincronizada (evento sessao-updated)'
          );
        } catch (err) {
          console.error('❌ [useAuth] Erro ao re-sincronizar sessão:', err);
        }
      }
    };
    window.addEventListener('sessao-updated', handleSessaoUpdated);
    return () =>
    window.removeEventListener('sessao-updated', handleSessaoUpdated);
  }, []);

  // ⭐⭐⭐ NOVO: Sincronização entre abas via BroadcastChannel ⭐⭐⭐
  useEffect(() => {
    if (isMagicPatterns) return;
    try {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      broadcastChannelRef.current = channel;
      channel.onmessage = (event) => {
        const { type, timestamp } = event.data || {};
        console.log(`🔄 [useAuth] BroadcastChannel recebeu: ${type}`);
        if (type === 'usuarios-changed' || type === 'data-changed') {
          // Evita refresh duplicado se já fez recentemente
          const agora = Date.now();
          if (agora - lastRefreshRef.current > MIN_REFRESH_INTERVAL) {
            lastRefreshRef.current = agora;
            console.log(
              '🔄 [useAuth] Recarregando dados (outra aba fez alteração)...'
            );
            loadUsuarios();
          }
        }
      };
      console.log(
        '📡 [useAuth] BroadcastChannel ativo para sincronização entre abas'
      );
    } catch (e) {
      console.warn('⚠️ [useAuth] BroadcastChannel não suportado:', e);
    }
    return () => {
      try {
        broadcastChannelRef.current?.close();
        broadcastChannelRef.current = null;
      } catch (e) {}
    };
  }, []);

  // ⭐⭐⭐ NOVO: Refresh automático ao voltar para a aba ⭐⭐⭐
  useEffect(() => {
    if (isMagicPatterns) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessao) {
        const agora = Date.now();
        if (agora - lastRefreshRef.current > MIN_REFRESH_INTERVAL) {
          lastRefreshRef.current = agora;
          console.log('👁️ [useAuth] Aba ficou visível — recarregando dados...');
          loadUsuarios();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessao]);

  // ⭐ Função para notificar outras abas sobre mudanças
  const notificarMudanca = (tipo: string = 'data-changed') => {
    try {
      broadcastChannelRef.current?.postMessage({
        type: tipo,
        timestamp: Date.now()
      });
      console.log(`📡 [useAuth] Notificação enviada para outras abas: ${tipo}`);
    } catch (e) {
      console.warn('⚠️ [useAuth] Erro ao notificar outras abas:', e);
    }
  };
  const loadUsuarios = async () => {
    // ⭐ No Magic Patterns, pula chamadas à API externa (evita erro 520)
    if (isMagicPatterns) {
      console.log(
        '⚠️ [useAuth] Magic Patterns detectado, pulando chamada à API'
      );
      setUsuarios([]);
      setLoading(false);
      return;
    }
    try {
      console.log('📋 Carregando usuários via API');
      const response = await fetch(`${API_BASE_URL}/api/usuarios`);
      if (!response.ok) {
        if (response.status >= 500) {
          console.warn(
            `⚠️ [useAuth] Servidor indisponível (${response.status}), usando lista vazia`
          );
          setUsuarios([]);
          return;
        }
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ Usuários carregados via API:', data.length, 'usuários');
      setUsuarios(data as Usuario[]);
    } catch (error: any) {
      console.error('❌ Erro ao carregar usuários via API:', error);
      if (error.name === 'TypeError' || error.message?.includes('fetch')) {
        console.warn('⚠️ [useAuth] Erro de rede, usando lista vazia');
      }
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  };
  const login = async (
  email: string,
  senha: string)
  : Promise<ResultadoLogin> => {
    try {
      console.log('🔐 Tentando login via API:', email);
      console.log('🔐 URL:', `${API_BASE_URL}/api/auth/login`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          senha
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        console.log('❌ Login falhou, status:', response.status);
        if (response.status === 401) {
          return {
            success: false,
            error: 'Email ou senha incorretos. Verifique suas credenciais.'
          };
        }
        if (response.status === 502) {
          return {
            success: false,
            error:
            'Servidor temporariamente indisponível (502). Tente novamente em alguns instantes.'
          };
        }
        if (response.status === 503) {
          return {
            success: false,
            error: 'Serviço em manutenção (503). Tente novamente mais tarde.'
          };
        }
        if (response.status === 504) {
          return {
            success: false,
            error:
            'Tempo de resposta do servidor esgotado (504). Tente novamente.'
          };
        }
        if (response.status === 520) {
          return {
            success: false,
            error:
            'Erro no servidor (520). O servidor pode estar reiniciando. Aguarde 30 segundos e tente novamente.'
          };
        }
        try {
          const errorData = await response.json();
          console.log('❌ Resposta de erro:', errorData);
          return {
            success: false,
            error:
            errorData.message ||
            errorData.error ||
            `Erro ${response.status}: Email ou senha incorretos`
          };
        } catch {
          return {
            success: false,
            error:
            response.status >= 500 ?
            `Erro no servidor (${response.status}). Tente novamente mais tarde.` :
            'Email ou senha incorretos'
          };
        }
      }
      const responseData = await response.json();
      // ⭐ Verificação em duas etapas: falta o código enviado pelo WhatsApp
      if (responseData.requer2fa && responseData.desafio) {
        return { success: false, desafio: responseData.desafio as DesafioLogin };
      }
      return concluirLogin(responseData);
    } catch (error: any) {
      return erroDeConexao(error);
    }
  };

  /** Grava a sessão a partir da resposta de login do servidor */
  const concluirLogin = (responseData: any): ResultadoLogin => {
    {
      const usuario = responseData.usuario;
      // Token de acesso: vai em todas as chamadas seguintes (autenticacaoApi)
      salvarToken(responseData.token);
      // ⭐ CORRIGIDO: Servidor envia clinicaAtual/operadoraSelecionada — aceita ambos os nomes
      const operadoraPreSelecionada =
      responseData.operadoraPreSelecionada ||
      responseData.operadoraSelecionada ||
      null;
      const clinicaPreSelecionada =
      responseData.clinicaPreSelecionada || responseData.clinicaAtual || null;
      console.log('✅ Login bem-sucedido:', usuario.nome);

      // ⭐ Pré-preenche o termo de pesquisa do usuário no localStorage
      if (usuario.termoPesquisa) {
        try {
          localStorage.setItem(
            'easyclin_busca_paciente_v2',
            usuario.termoPesquisa
          );
          console.log(
            '🔍 [useAuth] Termo de pesquisa pré-preenchido:',
            usuario.termoPesquisa
          );
        } catch (e) {
          console.warn('Erro ao salvar termo de pesquisa:', e);
        }
      }

      // ⭐ CORRIGIDO: Operadora e clínica vêm SOMENTE do servidor (MySQL)
      // NÃO usa localStorage global — múltiplos usuários compartilham a mesma máquina
      let operadoraSelecionada: Operadora | null =
      operadoraPreSelecionada || null;
      let clinicaAtual: Clinica | null = clinicaPreSelecionada || null;
      console.log(
        '🏢 [LOGIN] Operadora do servidor:',
        operadoraSelecionada?.nome || 'nenhuma'
      );
      console.log(
        '🏥 [LOGIN] Clínica do servidor:',
        clinicaAtual?.nome || 'nenhuma'
      );

      // Verifica se a clínica pertence à operadora
      if (
      clinicaAtual &&
      operadoraSelecionada &&
      clinicaAtual.operadoraId !== operadoraSelecionada.id)
      {
        console.log(
          '⚠️ [LOGIN] Clínica não pertence à operadora, limpando clínica'
        );
        clinicaAtual = null;
      }
      const novaSessao: Sessao = {
        usuario,
        operadoraSelecionada,
        clinicaAtual
      };
      setSessao(novaSessao);
      localStorage.setItem(STORAGE_KEYS.SESSAO, JSON.stringify(novaSessao));
      // A lista de usuários só pode ser lida depois do login
      loadUsuarios();
      // Recarrega operadoras, clínicas etc. (useRevalidacao escuta este evento)
      setTimeout(() => window.dispatchEvent(new Event('sessao-iniciada')), 0);

      // ⭐ Registra sessão no servidor (silencioso - não bloqueia login)
      try {
        fetch(`${API_BASE_URL}/api/sessions/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            usuarioId: usuario.id,
            usuarioNome: usuario.nome,
            usuarioEmail: usuario.email,
            usuarioTipo: usuario.tipo,
            clinicaId: clinicaAtual?.id || null,
            clinicaNome: clinicaAtual?.nome || null,
            operadoraId: operadoraSelecionada?.id || null,
            operadoraNome: operadoraSelecionada?.nome || null
          })
        }).catch(() => {});
      } catch {}
      return {
        success: true
      };
    }
  };

  /** Confere o código de 6 dígitos recebido no WhatsApp */
  const confirmarCodigo = async (desafioId: string, codigo: string): Promise<ResultadoLogin> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desafioId, codigo })
      });
      const dados = await response.json().catch(() => null);
      if (!response.ok) {
        return { success: false, error: dados?.error || `Não foi possível conferir o código (erro ${response.status}).` };
      }
      return concluirLogin(dados);
    } catch (error: any) {
      return erroDeConexao(error);
    }
  };

  /** Pede um código novo para o mesmo login */
  const reenviarCodigo = async (
  desafioId: string)
  : Promise<{success: boolean;error?: string;destino?: string;reenvioEmSeg?: number;}> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login/reenviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desafioId })
      });
      const dados = await response.json().catch(() => null);
      if (!response.ok) return { success: false, error: dados?.error || 'Não foi possível reenviar o código.' };
      return { success: true, destino: dados?.destino, reenvioEmSeg: dados?.reenvioEmSeg };
    } catch (error: any) {
      return erroDeConexao(error);
    }
  };

  const erroDeConexao = (error: any): ResultadoLogin => {
    {
      console.error('❌ Erro ao fazer login via API:', error);
      console.error(
        '❌ Tipo do erro:',
        error.name,
        '| Mensagem:',
        error.message
      );
      if (error.name === 'AbortError') {
        return {
          success: false,
          error:
          'O servidor não respondeu em 15 segundos. Verifique se o servidor está online e tente novamente.'
        };
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return {
          success: false,
          error:
          'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.'
        };
      }
      if (
      error.message?.includes('502') ||
      error.message?.includes('Bad Gateway'))
      {
        return {
          success: false,
          error:
          'Servidor temporariamente indisponível (502). Tente novamente em alguns instantes.'
        };
      }
      return {
        success: false,
        error: `Erro ao conectar: ${error.message || 'Verifique sua conexão.'}`
      };
    }
  };
  const logout = () => {
    console.log('🚪 [useAuth] Fazendo logout...');

    // ⭐ Registra logout no servidor (silencioso)
    if (sessao?.usuario?.id) {
      try {
        fetch(`${API_BASE_URL}/api/sessions/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            usuarioId: sessao.usuario.id
          })
        }).catch(() => {});
      } catch {}
    }

    // Invalida o token no servidor (e o cookie de imagens/downloads)
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST' }).
    catch(() => {}).
    finally(() => salvarToken(null));

    // Dispara evento customizado para notificar o App sobre o logout
    window.dispatchEvent(new CustomEvent('user-logout'));
    setSessao(null);
    localStorage.removeItem(STORAGE_KEYS.SESSAO);
    console.log(
      '✅ [useAuth] Logout realizado. Preferências de operadora/clínica ficam no MySQL.'
    );
  };
  const trocarSenha = async (
  senhaAtual: string,
  novaSenha: string)
  : Promise<boolean> => {
    if (!sessao) return false;
    try {
      // A senha atual é conferida no servidor: o navegador não a conhece
      const response = await fetch(
        `${API_BASE_URL}/api/usuarios/${sessao.usuario.id}/trocar-senha`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ senhaAtual, novaSenha })
        }
      );
      if (!response.ok) return false;
      return true;
    } catch (error) {
      console.error('❌ Erro ao trocar senha via API:', error);
      return false;
    }
  };
  const salvarPreferenciasUsuario = (
  operadora: Operadora | null,
  clinica: Clinica | null) =>
  {
    if (!sessao?.usuario?.id) return;

    // ⭐ CORRIGIDO: Salva APENAS no banco de dados (MySQL), NÃO no localStorage global
    const payload: Record<string, string | null> = {};
    if (operadora !== undefined) {
      payload.operadoraPadraoId = operadora?.id || null;
    }
    if (clinica !== undefined) {
      payload.clinicaPadraoId = clinica?.id || null;
    }
    fetch(`${API_BASE_URL}/api/usuarios/${sessao.usuario.id}/preferencias`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).
    then((res) => {
      if (res.ok) {
        console.log('💾 [useAuth] Preferências salvas no MySQL:', {
          operadora: operadora?.nome || '(nenhuma)',
          clinica: clinica?.nome || '(nenhuma)'
        });
      } else {
        console.warn(
          '⚠️ [useAuth] Erro ao salvar preferências no MySQL:',
          res.status
        );
      }
    }).
    catch((err) => {
      console.warn(
        '⚠️ [useAuth] Erro de rede ao salvar preferências:',
        err.message
      );
    });

    // ⭐ NOVO: Atualiza sessão no servidor (heartbeat com operadora/clínica)
    fetch(`${API_BASE_URL}/api/sessions/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usuarioId: sessao.usuario.id,
        usuarioNome: sessao.usuario.nome,
        usuarioEmail: sessao.usuario.email,
        usuarioTipo: sessao.usuario.tipo,
        clinicaId: clinica?.id || null,
        clinicaNome: clinica?.nome || null,
        operadoraId: operadora?.id || null,
        operadoraNome: operadora?.nome || null
      })
    }).catch(() => {});
  };
  const selecionarOperadora = (operadora: Operadora | null) => {
    if (!sessao) return;
    console.log(
      '🔄 [useAuth] Selecionando operadora:',
      operadora?.nome || 'nenhuma'
    );

    // Dispara evento para notificar mudança de operadora
    window.dispatchEvent(
      new CustomEvent('operadora-changed', {
        detail: {
          operadora
        }
      })
    );
    const novaSessao = {
      ...sessao,
      operadoraSelecionada: operadora,
      clinicaAtual: null // Limpa clínica ao trocar operadora
    };
    setSessao(novaSessao);
    localStorage.setItem(STORAGE_KEYS.SESSAO, JSON.stringify(novaSessao));
    salvarPreferenciasUsuario(operadora, null);
    // ⭐ REMOVIDO: Não salva mais em localStorage global
  };
  const selecionarClinica = (clinica: Clinica) => {
    if (!sessao) return;
    console.log('🔄 [useAuth] Selecionando clínica:', clinica.nome);

    // Dispara evento para notificar mudança de clínica
    window.dispatchEvent(
      new CustomEvent('clinica-changed', {
        detail: {
          clinica
        }
      })
    );
    const novaSessao = {
      ...sessao,
      clinicaAtual: clinica
    };
    setSessao(novaSessao);
    localStorage.setItem(STORAGE_KEYS.SESSAO, JSON.stringify(novaSessao));
    salvarPreferenciasUsuario(sessao.operadoraSelecionada, clinica);
    // ⭐ REMOVIDO: Não salva mais em localStorage global

    const configKey = `whatsapp_config_${clinica.id}`;
    const whatsappConfig = localStorage.getItem(configKey);
    if (whatsappConfig) {
      const config = JSON.parse(whatsappConfig);
      if (!config.ativo) {
        config.ativo = true;
        localStorage.setItem(configKey, JSON.stringify(config));
        window.dispatchEvent(new Event('whatsapp-config-updated'));
      }
    }
  };
  const temPermissao = (pagina: string): boolean => {
    if (!sessao) return false;
    const { tipo, permissoesMenu } = sessao.usuario;

    // ⭐ super_admin NUNCA é bloqueado (escape hatch absoluto). Sem isso, uma
    // whitelist customizada antiga (que não inclui itens novos como 'biometria')
    // acabava negando acesso ao próprio super admin.
    if (tipo === 'super_admin') {
      return true;
    }

    // ⭐ Páginas essenciais que SEMPRE são acessíveis pelo tipo do usuário
    // (não podem ser bloqueadas por permissoesMenu customizado)
    const paginasEssenciais: Record<string, string[]> = {
      agenda: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      agenda_profissional: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      fila_atendimento: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      configuracoes: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      prontuario_atendimento: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente']

    };

    // Se é página essencial e o tipo tem acesso, SEMPRE permite
    if (paginasEssenciais[pagina]?.includes(tipo)) {
      return true;
    }

    // ⭐ FIX: Páginas que admin SEMPRE pode acessar (mesmo com permissões customizadas antigas)
    const adminSempreAcessivel = [
    'assinatura',
    'backup',
    'especialidades',
    'auditoria',
    'usuarios',
    'clinicas',
    'sessoes',
    'ponto',
    'ponto_facial',
    // ⭐ WhatsApp Oficial: o admin configura a própria clínica. Faltava aqui
    // e na lista padrão abaixo, e o admin via "Acesso Negado".
    'whatsapp_meta'];

    if (
    (tipo === 'super_admin' || tipo === 'admin') &&
    adminSempreAcessivel.includes(pagina))
    {
      return true;
    }

    // Para outras páginas, usa permissoesMenu se existir
    if (permissoesMenu && permissoesMenu.length > 0) {
      return permissoesMenu.includes(pagina);
    }

    // Fallback: permissões padrão por tipo
    const permissoes: Record<string, string[]> = {
      dashboard: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      agenda: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      agenda_profissional: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      fila_atendimento: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      pacientes: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      empresas_conveniadas: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      convenios: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      planos_saude: ['super_admin', 'admin'],
      cobrancas: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      mensagens: ['super_admin', 'admin', 'medico', 'dentista', 'atendente'],
      whatsapp_meta: ['super_admin', 'admin'],
      prontuarios: ['super_admin', 'admin', 'medico', 'dentista'],
      prontuario_atendimento: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      procedimentos: ['super_admin', 'admin', 'medico', 'dentista'],
      configuracoes: [
      'super_admin',
      'admin',
      'medico',
      'dentista',
      'atendente'],

      configuracoes_globais: ['super_admin'],
      planos: ['super_admin', 'admin'],
      memed_profissionais: ['super_admin', 'admin'],
      medicamentos: ['super_admin', 'admin', 'medico', 'dentista'],
      cid10: ['super_admin'],
      auditoria: ['super_admin', 'admin'],
      sessoes: ['super_admin'],
      especialidades: ['super_admin', 'admin'],
      operadoras: ['super_admin'],
      clinicas: ['super_admin', 'admin'],
      usuarios: ['super_admin', 'admin']
    };
    return permissoes[pagina]?.includes(tipo) || false;
  };
  return {
    sessao,
    loading,
    login,
    confirmarCodigo,
    reenviarCodigo,
    logout,
    trocarSenha,
    selecionarOperadora,
    selecionarClinica,
    temPermissao,
    usuarios,
    setUsuarios,
    refresh: loadUsuarios,
    notificarMudanca // ⭐ NOVO: para notificar outras abas
  };
}