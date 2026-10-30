import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';

/**
 * Configuração do WhatsApp OFICIAL da Meta (Cloud API).
 * Canal independente e opcional: conviva com o WAHA e com o SMS.
 */

/**
 * Um template utilizável para envio, seja qual for o rótulo devolvido pela Meta.
 * ⚠️ O painel mostra "Ativo — Qualidade pendente" e a API já devolveu o MESMO
 * template como APPROVED, ACTIVE e ACTIVE_QUALITY_PENDING em versões
 * diferentes. Comparar só com 'APPROVED' fazia um template aprovado aparecer
 * como não aprovado no sistema.
 */
export const STATUS_TEMPLATE_APROVADO = [
'APPROVED',
'ACTIVE',
'ACTIVE_QUALITY_PENDING',
'APPROVED_QUALITY_PENDING'];


export function templateAprovado(status?: string) {
  return STATUS_TEMPLATE_APROVADO.includes(String(status || '').toUpperCase());
}

// Cada aviso do sistema aponta para um template aprovado na Meta.
// A ordem das variáveis aqui é a mesma que o sistema envia no {{1}}, {{2}}...
export type ChaveTemplateMeta =
'lembrete' |
'confirmacao'
// Aviso enviado DEPOIS que o paciente confirma (aviso_de_confirmacao).
| 'confirmacaoAviso' |
'cancelamento' |
'consultaOnline' |
'documento' |
'aniversario';

export interface TemplateMeta {
  name: string;
  language: string;
  /**
   * O template aprovado tem botão de URL dinâmica? Enviar o parâmetro do botão
   * para um template de botão estático (ou omiti-lo num dinâmico) faz a Meta
   * recusar com 132012. `undefined` = desconhecido (vínculo digitado à mão).
   */
  temBotaoUrl?: boolean;
}

/**
 * ⭐ Textos fixos usados como variáveis dos templates (5, 6 e 7 do pedido de
 * confirmação). Não existem no cadastro do paciente nem da consulta: são
 * decisões da clínica, então ficam configuráveis aqui em vez de embutidos no
 * código. Em branco, o sistema cai no padrão abaixo.
 */
export interface TextosMeta {
  /** Onde o paciente é atendido. Vazio = nome + endereço da clínica da sessão */
  local: string;
  instrucoesPreConsulta: string;
  informacoesImportantes: string;
  /**
   * URL pública HTTPS do logotipo da clínica. Na Meta o logo é o CABEÇALHO de
   * mídia do template — não vai no corpo do texto. Obrigatório quando o
   * template aprovado tem header de imagem.
   */
  logoUrl: string;
  /**
   * ⭐ Número do ATENDIMENTO HUMANO (canal livre). É para onde o botão "Falar
   * conosco" leva o paciente — normalmente o WhatsApp comum da recepção, e não
   * o número oficial da Meta, que só dispara template. Em branco, o sistema usa
   * o WhatsApp/celular/telefone do cadastro da clínica.
   */
  numeroAtendimento: string;
}

export const TEXTOS_META_PADRAO: TextosMeta = {
  local: '',
  numeroAtendimento: '',
  instrucoesPreConsulta:
  'Chegue com 15 minutos de antecedencia e traga um documento com foto.',
  informacoesImportantes:
  'Em caso de imprevisto, entre em contato com a clinica.',
  logoUrl: ''
};

export interface ConfigWhatsAppMeta {
  apiVersion: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  numeroExibicao: string;
  ativo: boolean;
  preferencial: boolean;
  templates: Partial<Record<ChaveTemplateMeta, TemplateMeta>>;
  /** Textos fixos das variáveis que não vêm de cadastro (local, instruções...) */
  textos: TextosMeta;
  tokenConfigurado?: boolean;
  /** Token que valida a URL do webhook de ENTRADA no painel da Meta. */
  verifyToken?: string;
}

export const CONFIG_META_PADRAO: ConfigWhatsAppMeta = {
  apiVersion: 'v21.0',
  phoneNumberId: '',
  wabaId: '',
  accessToken: '',
  numeroExibicao: '',
  ativo: false,
  preferencial: false,
  templates: {},
  textos: TEXTOS_META_PADRAO
};

/**
 * Resolve os valores das variáveis que NÃO vêm de cadastro, aplicando os
 * padrões quando a clínica não preencheu. Ponto único para telas e envio.
 */
export function resolverTextosMeta(
textos: Partial<TextosMeta> | undefined,
fallbackLocal: string)
: TextosMeta {
  return {
    local: String(textos?.local || '').trim() || fallbackLocal,
    instrucoesPreConsulta:
    String(textos?.instrucoesPreConsulta || '').trim() ||
    TEXTOS_META_PADRAO.instrucoesPreConsulta,
    informacoesImportantes:
    String(textos?.informacoesImportantes || '').trim() ||
    TEXTOS_META_PADRAO.informacoesImportantes,
    logoUrl: String(textos?.logoUrl || '').trim(),
    numeroAtendimento: String(textos?.numeroAtendimento || '').trim()
  };
}

// Descreve, para a tela, o que cada template precisa conter. É o roteiro que o
// usuário segue ao cadastrar os modelos no WhatsApp Manager.
export const TEMPLATES_ESPERADOS: {
  chave: ChaveTemplateMeta;
  titulo: string;
  categoria: string;
  variaveis: string[];
  exemplo: string;
  botaoUrl?: boolean;
}[] = [
{
  chave: 'lembrete',
  titulo: 'Lembrete de consulta',
  categoria: 'Utility',
  variaveis: ['nome do paciente', 'data', 'horário', 'profissional'],
  // As quebras de linha fazem parte do modelo: é assim que a mensagem chega
  // ao paciente e é assim que ela deve ser cadastrada no WhatsApp Manager.
  exemplo:
  'Ola, {{1}}!\n\nLembrete da sua consulta:\n\n📅 Data: {{2}}\n⏰ Horario: {{3}}\n👨‍⚕️ Profissional: {{4}}\n\nEm caso de imprevisto, entre em contato com a clinica.'
},
{
  chave: 'confirmacao',
  titulo: 'Pedido de confirmação',
  categoria: 'Utility',
  variaveis: [
  'nome do paciente',
  'tipo de consulta',
  'data',
  'horário',
  'profissional',
  'local',
  'instruções pré-consulta',
  'informações importantes'],

  exemplo:
  'Olá, {{1}}!\n\nSua consulta {{2}} está agendada.\n\n📅 Data: {{3}}\n⏰ Horário: {{4}}\n👨‍⚕️ Profissional: {{5}}\n🏥 Local: {{6}}\n\n📌 Antes da sua consulta:\n{{7}}\n\n⚠️ Informações importantes:\n{{8}}\n\nPodemos confirmar sua presença?'
},
{
  chave: 'confirmacaoAviso',
  titulo: 'Aviso de confirmação (após o paciente confirmar)',
  categoria: 'Utility',
  variaveis: ['nome do paciente', 'data', 'horário', 'profissional'],
  exemplo:
  'Ola, {{1}}!\n\nSua presenca esta CONFIRMADA:\n\n📅 Data: {{2}}\n⏰ Horario: {{3}}\n👨‍⚕️ Profissional: {{4}}\n\nAte breve!'
},
{
  chave: 'cancelamento',
  titulo: 'Aviso de cancelamento',
  categoria: 'Utility',
  variaveis: ['nome do paciente', 'data', 'horário'],
  exemplo:
  'Ola, {{1}}.\n\nSua consulta foi CANCELADA:\n\n📅 Data: {{2}}\n⏰ Horario: {{3}}\n\nEntre em contato para reagendar.'
},
{
  chave: 'consultaOnline',
  titulo: 'Link da consulta online',
  categoria: 'Utility',
  variaveis: ['nome do paciente', 'data', 'horário'],
  exemplo:
  'Ola, {{1}}!\n\nSua consulta online esta pronta:\n\n📅 Data: {{2}}\n⏰ Horario: {{3}}\n\nToque no botao abaixo para entrar na sala.',
  botaoUrl: true
},
{
  chave: 'documento',
  titulo: 'Solicitação de documento',
  categoria: 'Utility',
  variaveis: ['nome do paciente', 'documento solicitado'],
  exemplo:
  'Ola {{1}}, a clinica solicitou o envio de: {{2}}. Responda esta mensagem anexando o arquivo ou a foto.'
},
{
  chave: 'aniversario',
  titulo: 'Feliz Aniversário',
  // ⚠️ Felicitação é MARKETING para a Meta (não tem relação com uma transação
  // do paciente). Cadastrar como Utility costuma ser reprovado.
  categoria: 'Marketing',
  variaveis: ['nome do paciente', 'nome da clínica'],
  exemplo:
  'Feliz Aniversario, {{1}}! 🎉\n\nA equipe da {{2}} deseja a voce um dia maravilhoso, repleto de saude e alegria.\n\nParabens!'
}];


export function useWhatsAppMetaConfig(clinicaId: string | undefined) {
  const [config, setConfig] = useState<ConfigWhatsAppMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) {
      setLoading(false);
      setConfig(null);
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp-meta/config?clinicaId=${clinicaId}`
      );
      if (response.status === 404) {
        setConfig(null);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setConfig({
        ...CONFIG_META_PADRAO,
        ...data,
        templates: data.templates || {}
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [clinicaId]);

  const salvar = useCallback(
    async (nova: ConfigWhatsAppMeta) => {
      if (!clinicaId) throw new Error('clinicaId não definido');
      // `id` e `clinicaId` vindos da leitura anterior são descartados: enviados
      // de volta, sobrescreveriam a clínica de destino da gravação.
      const { id: _id, clinicaId: _clinica, ...limpa } = nova as any;
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-meta/config`, {
        method: 'POST',
        // text/plain evita o preflight OPTIONS do CORS (o servidor aceita ambos)
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify({
          clinicaId,
          ...limpa
        })
      });
      if (!response.ok) {
        const texto = await response.text();
        throw new Error(`HTTP ${response.status}: ${texto}`);
      }
      const data = await response.json();
      // ⭐ O estado passa a refletir o que o servidor CONFIRMOU ter gravado.
      // Antes era otimista (repetia o que a tela enviou), então uma gravação
      // que não persistia só aparecia ao reabrir o app.
      setConfig({
        ...CONFIG_META_PADRAO,
        ...data,
        accessToken: '',
        templates: data?.templates || {}
      });
      setError(null);
      return data;
    },
    [clinicaId]
  );

  const listarTemplates = useCallback(async () => {
    if (!clinicaId) throw new Error('clinicaId não definido');
    const response = await fetch(
      `${API_BASE_URL}/api/whatsapp-meta/templates?clinicaId=${clinicaId}`
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data as {
      templates: {
        name: string;
        status: string;
        language: string;
        category: string;
        variaveis: number;
        temBotaoUrl: boolean;
      }[];
      total: number;
    };
  }, [clinicaId]);

  const enviarTeste = useCallback(
    async (
    telefone: string,
    opcoes?: {
      templateName?: string;
      templateLanguage?: string;
      params?: string[];
      urlParam?: string;
    }) =>
    {
      if (!clinicaId) throw new Error('clinicaId não definido');
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-meta/testar`, {
        method: 'POST',
        // text/plain evita o preflight OPTIONS do CORS (o servidor aceita ambos)
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify({
          clinicaId,
          telefone,
          ...opcoes
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      return data;
    },
    [clinicaId]
  );

  /**
   * Dados do webhook de ENTRADA: a URL a cadastrar no painel da Meta e se o
   * verify token já existe. Sem isso a clínica envia, mas não RECEBE nada.
   */
  const carregarWebhookInfo = useCallback(async () => {
    if (!clinicaId) throw new Error('clinicaId não definido');
    const response = await fetch(
      `${API_BASE_URL}/api/whatsapp-meta/webhook-info?clinicaId=${clinicaId}`
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data as {
      callbackUrl: string;
      campoObrigatorio: string;
      verifyTokenConfigurado: boolean;
      phoneNumberId?: string | null;
      tokenConfigurado?: boolean;
      wabaId?: string | null;
      assinaturaWaba?: boolean | null;
      assinaturaDetalhe?: string;
      callbackRegistrado?: boolean | null;
      callbackDetalhe?: string;
      recebimentoPronto?: boolean;
      recebimentoNaoVerificado?: boolean;
      eventosRecebidos?: number;
      ultimoEventoEm?: string | null;
    };
  }, [clinicaId]);

  /**
   * Ativa o RECEBIMENTO: assina o app na WABA da clínica. Sem esta assinatura a
   * Meta não entrega resposta de botão nem arquivo — a clínica só envia.
   */
  const ativarRecebimento = useCallback(async () => {
    if (!clinicaId) throw new Error('clinicaId não definido');
    const response = await fetch(
      // ⭐ clinicaId também na URL: o corpo text/plain depende do parser do
      // servidor, e a query garante a identificação mesmo se ele faltar.
      `${API_BASE_URL}/api/whatsapp-meta/assinar-webhook?clinicaId=${encodeURIComponent(clinicaId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify({
          clinicaId
        })
      }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data as {
      ok: boolean;
      mensagem: string;
    };
  }, [clinicaId]);

  /** App da plataforma usado pela janela oficial de conexão da Meta. */
  const carregarSignupConfig = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/whatsapp-meta/signup/config`);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data as {
      disponivel: boolean;
      appId: string;
      configId: string;
      apiVersion: string;
      faltando: string[];
    };
  }, []);

  /**
   * Conclui a conexão do número da própria clínica. O navegador entrega apenas o
   * `code` — é o servidor que o troca pelo token permanente.
   */
  const concluirSignup = useCallback(
    async (dados: {code: string;wabaId: string;phoneNumberId: string;}) => {
      if (!clinicaId) throw new Error('clinicaId não definido');
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp-meta/signup/concluir`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8'
          },
          body: JSON.stringify({ clinicaId, ...dados })
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      await carregar();
      return data as {
        sucesso: boolean;
        numeroExibicao: string;
        phoneNumberId: string;
        wabaId: string;
        webhookAssinado: boolean;
        webhookErro?: string | null;
        numeroRegistrado: boolean;
        registroErro?: string | null;
        cobrancaPlataforma?: boolean;
        cobrancaErro?: string | null;
      };
    },
    [clinicaId, carregar]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  return {
    config,
    loading,
    error,
    salvar,
    recarregar: carregar,
    listarTemplates,
    enviarTeste,
    carregarWebhookInfo,
    ativarRecebimento,
    carregarSignupConfig,
    concluirSignup
  };
}