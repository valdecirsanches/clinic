import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageCircleIcon,
  CheckCircle2Icon,
  BellIcon,
  CalendarCheckIcon,
  BadgeCheckIcon,
  LinkIcon,
  FileTextIcon,
  SendIcon,
  RefreshCwIcon,
  LoaderIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  InfoIcon,
  ExternalLinkIcon,
  PowerIcon } from
'lucide-react';
import {
  useWhatsAppMetaConfig,
  ConfigWhatsAppMeta,
  ChaveTemplateMeta,
  TEMPLATES_ESPERADOS,
  STATUS_TEMPLATE_APROVADO } from
'../hooks/useWhatsAppMetaConfig';
import { WhatsAppMetaConfig } from '../components/WhatsAppMetaConfig';
import { ConectarWhatsAppWizard } from '../components/whatsappMeta/ConectarWhatsAppWizard';

interface TemplateAprovado {
  name: string;
  status: string;
  language: string;
  category: string;
  variaveis: number;
  temBotaoUrl: boolean;
}

type AbaTemplate = 'aprovados' | 'pendentes' | 'rejeitados';

const RECURSOS = [
{
  icone: BellIcon,
  titulo: 'Mensagens automatizadas',
  texto:
  'Lembretes de consulta, pedidos de confirmação e avisos de cancelamento saem pelo número oficial da clínica.'
},
{
  icone: CalendarCheckIcon,
  titulo: 'Confirmação de consultas',
  texto:
  'O paciente confirma ou cancela pelos botões da mensagem e a agenda é atualizada na hora.'
},
{
  icone: BadgeCheckIcon,
  titulo: 'Comunicação profissional',
  texto:
  'Número comercial verificado, com a identidade da clínica — sem depender de celular conectado.'
}];


const COMO_FUNCIONA = [
{
  icone: MessageCircleIcon,
  titulo: 'Conecte sua conta',
  texto:
  'Cadastre o número da clínica pela janela oficial da Meta — sem cartão: as conversas são cobradas da plataforma'
},
{
  icone: FileTextIcon,
  titulo: 'Configure templates',
  texto: 'Cadastre os modelos na Meta e vincule cada um aos avisos do sistema'
},
{
  icone: SendIcon,
  titulo: 'Comece a enviar',
  texto: 'Envie os avisos da agenda e receba as respostas dos pacientes'
}];


function statusDaAba(aba: AbaTemplate) {
  // ⚠️ O painel da Meta exibe "Ativo — Qualidade pendente"; a API já devolveu
  // esse mesmo template como APPROVED, ACTIVE e ACTIVE_QUALITY_PENDING em
  // versões diferentes. Aceitar só "APPROVED" fazia um template aprovado
  // aparecer como não aprovado no sistema.
  if (aba === 'aprovados') return STATUS_TEMPLATE_APROVADO;
  if (aba === 'pendentes')
  return ['PENDING', 'IN_APPEAL', 'PENDING_DELETION', 'SUBMITTED'];
  return ['REJECTED', 'DISABLED', 'PAUSED', 'LIMIT_EXCEEDED', 'DELETED'];
}



export function WhatsAppMetaPage() {
  const [clinicaId, setClinicaId] = useState('');
  const [clinicaNome, setClinicaNome] = useState('');
  // ⭐ A clínica cliente NÃO deve ver webhook, token nem WABA: para ela o fluxo
  // é conectar → autorizar na Meta → escolher o número. Os campos técnicos
  // ficam apenas para o suporte (super admin), que precisa deles ao diagnosticar.
  const [modoTecnico, setModoTecnico] = useState(false);

  useEffect(() => {
    const sincronizar = () => {
      const sessao = localStorage.getItem('sessao');
      if (!sessao) return;
      try {
        const parsed = JSON.parse(sessao);
        setClinicaId(parsed.clinicaAtual?.id || '');
        setClinicaNome(parsed.clinicaAtual?.nome || '');
        // ⭐ O ADMINISTRADOR da clínica também precisa de "Gerenciar": é ele
        // quem vincula templates, ativa o recebimento e faz o envio de teste.
        // Restringir ao super admin deixava o admin sem acesso à própria
        // configuração ("Acesso negado").
        const tipo = String(parsed.usuario?.tipo || '');
        setModoTecnico(tipo === 'super_admin' || tipo === 'admin');
      } catch {

        /* sessão inválida: a tela mostra o aviso de clínica não selecionada */}
    };
    sincronizar();
    const aoTrocarClinica = () => setTimeout(sincronizar, 100);
    window.addEventListener('clinica-changed', aoTrocarClinica);
    window.addEventListener('sessao-updated', aoTrocarClinica);
    return () => {
      window.removeEventListener('clinica-changed', aoTrocarClinica);
      window.removeEventListener('sessao-updated', aoTrocarClinica);
    };
  }, []);

  const {
    config,
    loading,
    salvar,
    listarTemplates,
    enviarTeste,
    carregarWebhookInfo,
    ativarRecebimento,
    carregarSignupConfig,
    concluirSignup
  } = useWhatsAppMetaConfig(clinicaId || undefined);

  const [wizardAberto, setWizardAberto] = useState(false);
  const [signupInfo, setSignupInfo] = useState<{
    disponivel: boolean;
    appId: string;
    configId: string;
    apiVersion: string;
    faltando: string[];
  } | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<{
    callbackUrl: string;
    campoObrigatorio: string;
    verifyTokenConfigurado: boolean;
    assinaturaWaba?: boolean | null;
    assinaturaDetalhe?: string;
    callbackRegistrado?: boolean | null;
    callbackDetalhe?: string;
    recebimentoPronto?: boolean;
    recebimentoNaoVerificado?: boolean;
    eventosRecebidos?: number;
    ultimoEventoEm?: string | null;
  } | null>(null);
  const [ativandoRecebimento, setAtivandoRecebimento] = useState(false);

  const [templates, setTemplates] = useState<TemplateAprovado[] | null>(null);
  const [carregandoTemplates, setCarregandoTemplates] = useState(false);
  const [erroTemplates, setErroTemplates] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaTemplate>('aprovados');

  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const [alterandoEstado, setAlterandoEstado] = useState(false);
  const [aviso, setAviso] = useState<{
    tipo: 'ok' | 'erro';
    texto: string;
  } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    carregarSignupConfig().
    then(setSignupInfo).
    catch(() => setSignupInfo(null));
  }, [carregarSignupConfig]);

  useEffect(() => {
    if (!clinicaId) return;
    carregarWebhookInfo().
    then(setWebhookInfo).
    catch(() => setWebhookInfo(null));
  }, [carregarWebhookInfo, clinicaId, config?.phoneNumberId]);

  const conectado = Boolean(
    config?.phoneNumberId && (config?.tokenConfigurado || config?.accessToken)
  );

  // ⭐ Receber depende de DUAS etapas — não do verify token: a Callback URL
  // registrada no app e a WABA assinada. Faltando qualquer uma, o paciente
  // clica no botão e a resposta nunca chega aqui.
  const recebimentoAtivo =
  webhookInfo?.recebimentoPronto ?? webhookInfo?.assinaturaWaba === true;

  const ativarRecebimentoAgora = async () => {
    setAtivandoRecebimento(true);
    setAviso(null);
    try {
      const resultado = await ativarRecebimento();
      const atualizado = await carregarWebhookInfo().catch(() => null);
      if (atualizado) setWebhookInfo(atualizado);
      setAviso({
        tipo: 'ok',
        texto: resultado?.mensagem || 'Recebimento ativado.'
      });
    } catch (err: any) {
      setAviso({
        tipo: 'erro',
        texto:
        err?.message || 'Não foi possível ativar o recebimento de respostas.'
      });
    } finally {
      setAtivandoRecebimento(false);
    }
  };

  const buscarTemplates = useCallback(async () => {
    setCarregandoTemplates(true);
    setErroTemplates(null);
    try {
      const dados = await listarTemplates();
      setTemplates(dados.templates || []);
    } catch (err: any) {
      setErroTemplates(err?.message || 'Não foi possível listar os templates.');
      setTemplates(null);
    } finally {
      setCarregandoTemplates(false);
    }
  }, [listarTemplates]);

  // Os templates só existem depois de conectar — buscar antes retornaria erro.
  useEffect(() => {
    if (conectado && templates === null && !carregandoTemplates) {
      buscarTemplates();
    }
  }, [conectado, templates, carregandoTemplates, buscarTemplates]);

  // Qual aviso do sistema usa cada template aprovado
  const vinculoPorTemplate = useMemo(() => {
    const mapa = new Map<string, string>();
    TEMPLATES_ESPERADOS.forEach((esperado) => {
      const vinculado = config?.templates?.[esperado.chave];
      if (vinculado?.name) mapa.set(vinculado.name, esperado.titulo);
    });
    return mapa;
  }, [config?.templates]);

  const templatesDaAba = useMemo(() => {
    if (!templates) return [];
    const permitidos = statusDaAba(aba);
    return templates.filter((t) =>
    permitidos.includes(String(t.status || '').toUpperCase())
    );
  }, [templates, aba]);

  const contagem = useMemo(() => {
    const contar = (a: AbaTemplate) => {
      if (!templates) return 0;
      const permitidos = statusDaAba(a);
      return templates.filter((t) =>
      permitidos.includes(String(t.status || '').toUpperCase())
      ).length;
    };
    return {
      aprovados: contar('aprovados'),
      pendentes: contar('pendentes'),
      rejeitados: contar('rejeitados')
    };
  }, [templates]);

  const avisosVinculados = TEMPLATES_ESPERADOS.filter(
    (t) => config?.templates?.[t.chave]?.name
  ).length;

  const persistir = async (parcial: Partial<ConfigWhatsAppMeta>) => {
    if (!config) return;
    // accessToken vazio preserva o token já gravado no servidor
    await salvar({ ...config, accessToken: '', ...parcial });
  };

  // ⭐ Vínculo de cada aviso do sistema ao template aprovado, direto na tela
  // principal. Antes isso só existia dentro do bloco recolhível de credenciais,
  // então avisos obrigatórios (como o de confirmação) passavam despercebidos.
  const [vinculando, setVinculando] = useState<ChaveTemplateMeta | null>(null);

  const vincularAviso = async (chave: ChaveTemplateMeta, nome: string) => {
    if (!config) return;
    setVinculando(chave);
    setAviso(null);
    try {
      const proximos = { ...(config.templates || {}) };
      if (!nome) {
        delete proximos[chave];
      } else {
        const aprovado = (templates || []).find((t) => t.name === nome);
        proximos[chave] = {
          name: nome,
          language: aprovado?.language || 'pt_BR'
        };
      }
      await persistir({ templates: proximos });
      setAviso({
        tipo: 'ok',
        texto: nome ?
        `Aviso vinculado ao template "${nome}".` :
        'Vínculo removido. Este aviso não sairá pela Meta.'
      });
    } catch (err: any) {
      setAviso({
        tipo: 'erro',
        texto: err?.message || 'Não foi possível salvar o vínculo.'
      });
    } finally {
      setVinculando(null);
    }
  };

  const alternarAtivo = async () => {
    if (!config) return;
    setAlterandoEstado(true);
    setAviso(null);
    try {
      await persistir({ ativo: !config.ativo });
      setAviso({
        tipo: 'ok',
        texto: config.ativo ?
        'Canal desativado. Nenhum aviso sai pela Meta.' :
        'Canal ativado. Os avisos da agenda já podem sair pela Meta.'
      });
    } catch (err: any) {
      setAviso({
        tipo: 'erro',
        texto: err?.message || 'Não foi possível alterar o estado do canal.'
      });
    } finally {
      setAlterandoEstado(false);
    }
  };

  const desconectar = async () => {
    if (!config) return;
    const confirmado = window.confirm(
      'Desconectar o WhatsApp oficial desta clínica?\n\nAs credenciais serão removidas do sistema e o canal ficará inativo. A conta e o número continuam existindo na Meta — nada é excluído lá.'
    );
    if (!confirmado) return;
    setAlterandoEstado(true);
    setAviso(null);
    try {
      await salvar({
        ...config,
        ativo: false,
        preferencial: false,
        phoneNumberId: '',
        wabaId: '',
        numeroExibicao: '',
        // Token explicitamente em branco NÃO apaga no servidor; o vínculo é
        // desfeito pela remoção do phoneNumberId.
        accessToken: ''
      });
      setTemplates(null);
      setAviso({
        tipo: 'ok',
        texto:
        'WhatsApp oficial desconectado. Você pode conectar outro número quando quiser.'
      });
    } catch (err: any) {
      setAviso({
        tipo: 'erro',
        texto: err?.message || 'Não foi possível desconectar.'
      });
    } finally {
      setAlterandoEstado(false);
    }
  };

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setAviso({
        tipo: 'erro',
        texto: 'O navegador não permitiu copiar. Selecione o texto manualmente.'
      });
    }
  };

  if (!clinicaId) {
    return (
      <main className="min-h-full w-full bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
            <AlertTriangleIcon className="h-5 w-5" />
            Selecione uma clínica
          </h1>
          <p className="mt-1 text-sm text-amber-900">
            O WhatsApp oficial é configurado por clínica. Escolha a clínica no
            topo da tela para continuar.
          </p>
        </div>
      </main>);

  }

  return (
    <main className="min-h-full w-full bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-green-100">
              <MessageCircleIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                WhatsApp oficial
              </h1>
              <p className="text-sm text-gray-500">
                Conta Meta (Cloud API) de {clinicaNome || 'sua clínica'}
              </p>
            </div>
          </div>
          {conectado &&
          <div className="flex items-center gap-2">
              <button
              type="button"
              onClick={alternarAtivo}
              disabled={alterandoEstado}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              config?.ativo ?
              'border border-gray-300 text-gray-700 hover:bg-gray-100' :
              'bg-green-600 text-white hover:bg-green-700'}`
              }>
              
                {alterandoEstado ?
              <LoaderIcon className="h-4 w-4 animate-spin" /> :

              <PowerIcon className="h-4 w-4" />
              }
                {config?.ativo ? 'Desativar canal' : 'Ativar canal'}
              </button>
            </div>
          }
        </header>

        {aviso &&
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
          aviso.tipo === 'ok' ?
          'border-green-200 bg-green-50 text-green-800' :
          'border-red-200 bg-red-50 text-red-800'}`
          }>
          
            {aviso.tipo === 'ok' ?
          <CheckCircle2Icon className="mt-0.5 h-4 w-4 flex-shrink-0" /> :

          <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          }
            <span>{aviso.texto}</span>
          </div>
        }

        {loading ?
        <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              Carregando a configuração desta clínica...
            </p>
          </div> :
        !conectado ?
        <>
            {/* Estado vazio: conectar */}
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                  <MessageCircleIcon className="h-8 w-8 text-green-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">
                    WhatsApp não conectado
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-gray-600">
                    Conecte o WhatsApp Business da clínica e comece a enviar
                    mensagens aos pacientes pelo{' '}
                    <strong>número da própria clínica</strong> — o paciente vê o
                    remetente da clínica, e o limite de envio e a qualidade não
                    são compartilhados com outras clínicas.
                  </p>
                  <button
                  type="button"
                  onClick={() => setWizardAberto(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
                  
                    <ExternalLinkIcon className="h-4 w-4" />
                    Conectar WhatsApp
                  </button>
                  {!signupInfo?.disponivel &&
                <p className="mt-3 flex items-start gap-2 text-sm text-amber-800">
                      <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      {modoTecnico ?
                  <span>
                          A conexão automática ainda não está habilitada no
                          servidor
                          {signupInfo?.faltando?.length ?
                    ` (falta definir ${signupInfo.faltando.join(', ')})` :
                    ''}
                          . Use a configuração manual, abaixo.
                        </span> :

                  <span>
                          A conexão pela Meta ainda não está liberada para esta
                          instalação. Fale com o suporte para habilitá-la.
                        </span>
                  }
                    </p>
                }
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              {RECURSOS.map(({ icone: Icone, titulo, texto }) =>
            <div
              key={titulo}
              className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4">
              
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                    <Icone className="h-5 w-5 text-gray-600" />
                  </div>
                  <h3 className="mt-3 font-medium text-gray-900">{titulo}</h3>
                  <p className="mt-1 text-sm text-gray-600">{texto}</p>
                </div>
            )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900">Como funciona</h2>
              <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                {COMO_FUNCIONA.map(({ icone: Icone, titulo, texto }, i) =>
              <li key={titulo} className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-green-50">
                      <Icone className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {i + 1}. {titulo}
                      </p>
                      <p className="text-sm text-gray-600">{texto}</p>
                    </div>
                  </li>
              )}
              </ol>
            </section>
          </> :

        <>
            {/* Conectado: cartão da conta, no formato de um perfil */}
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center gap-5 p-6">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600">
                    <MessageCircleIcon className="h-9 w-9 text-white" />
                  </div>
                  <span
                  className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${
                  config?.ativo ? 'bg-green-500' : 'bg-amber-500'}`
                  }
                  aria-hidden="true">
                  
                    {config?.ativo ?
                  <CheckCircle2Icon className="h-3.5 w-3.5 text-white" /> :

                  <PowerIcon className="h-3 w-3 text-white" />
                  }
                  </span>
                </div>

                <div className="min-w-[14rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-2xl font-semibold tracking-tight text-gray-900">
                      {config?.numeroExibicao || 'WhatsApp oficial conectado'}
                    </p>
                    <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    config?.ativo ?
                    'bg-green-100 text-green-800' :
                    'bg-amber-100 text-amber-800'}`
                    }>
                    
                      {config?.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {clinicaNome || 'Sua clínica'} ·{' '}
                    {config?.ativo ?
                  'enviando os avisos do sistema por este número' :
                  'canal desativado — nenhum aviso sai pela Meta'}
                  </p>
                  {!config?.numeroExibicao &&
                <p className="mt-1 text-xs text-gray-500">
                      O número não foi informado na configuração manual — ele
                      aparece aqui quando a conexão é feita pela janela oficial
                      da Meta.
                    </p>
                }
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {modoTecnico &&
                <button
                  type="button"
                  onClick={() => setAvancadoAberto(true)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  
                      Gerenciar
                    </button>
                }
                  <button
                  type="button"
                  onClick={desconectar}
                  disabled={alterandoEstado}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50">
                  
                    Desconectar
                  </button>
                </div>
              </div>

              {/* O que decide se a mensagem chega: em destaque, não escondido
                 numa lista de IDs. */}
              <div className="grid gap-px border-t border-gray-100 bg-gray-100 sm:grid-cols-3">
                <div className="bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Avisos com template
                  </p>
                  <p
                  className={`mt-1 text-xl font-semibold ${
                  avisosVinculados === TEMPLATES_ESPERADOS.length ?
                  'text-green-700' :
                  'text-amber-700'}`
                  }>
                  
                    {avisosVinculados} de {TEMPLATES_ESPERADOS.length}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {avisosVinculados === TEMPLATES_ESPERADOS.length ?
                  'Todos os avisos podem sair pela Meta' :
                  'Sem template vinculado, o aviso não sai pela Meta'}
                  </p>
                </div>
                <div className="bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Prioridade de envio
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {config?.preferencial ? 'Meta primeiro' : 'WAHA primeiro'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {config?.preferencial ?
                  'A Meta é usada antes da sessão do WAHA' :
                  'A Meta entra quando o WAHA não entrega'}
                  </p>
                </div>
                <div className="bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Recebimento
                  </p>
                  <p
                  className={`mt-1 text-xl font-semibold ${
                  recebimentoAtivo ?
                  'text-green-700' :
                  webhookInfo?.recebimentoNaoVerificado ?
                  'text-gray-700' :
                  'text-amber-700'}`
                  }>
                  
                    {recebimentoAtivo ?
                  'Ativo' :
                  webhookInfo?.recebimentoNaoVerificado ?
                  'Não verificado' :
                  'Pendente'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {recebimentoAtivo ?
                  `Respostas e arquivos chegam ao sistema (${webhookInfo?.eventosRecebidos || 0} evento(s) recebidos)` :
                  webhookInfo?.recebimentoNaoVerificado ?
                  'Conta assinada, mas nenhuma resposta chegou ainda — o app precisa estar PUBLICADO na Meta' :
                  'O paciente responde, mas a resposta não chega aqui'}
                  </p>
                  {!recebimentoAtivo &&
                <button
                  type="button"
                  onClick={ativarRecebimentoAgora}
                  disabled={ativandoRecebimento}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60">
                  
                      {ativandoRecebimento ?
                  'Ativando…' :
                  'Ativar recebimento'}
                    </button>
                }
                  {modoTecnico && webhookInfo &&
                <p className="mt-2 text-[11px] text-gray-400">
                      {webhookInfo.eventosRecebidos ?
                  `${webhookInfo.eventosRecebidos} evento(s) recebidos · último ${new Date(webhookInfo.ultimoEventoEm || '').toLocaleString('pt-BR')}` :
                  'Nenhum evento recebido da Meta até agora'}
                      {webhookInfo.assinaturaDetalhe ?
                  ` · conta: ${webhookInfo.assinaturaDetalhe}` :
                  ''}
                      {webhookInfo.callbackDetalhe ?
                  ` · URL: ${webhookInfo.callbackDetalhe}` :
                  ''}
                    </p>
                }
                </div>
              </div>

              <details
              className={`border-t border-gray-100 ${modoTecnico ? '' : 'hidden'}`}>
              
                <summary className="cursor-pointer list-none px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
                  Identificadores técnicos da conexão
                </summary>
                <dl className="grid gap-4 px-6 pb-5 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      WABA ID
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-gray-800">
                      {config?.wabaId || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      Phone Number ID
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-gray-800">
                      {config?.phoneNumberId || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">
                      Versão da API
                    </dt>
                    <dd className="mt-0.5 text-gray-800">
                      {config?.apiVersion}
                    </dd>
                  </div>
                </dl>
              </details>
            </section>

            {/* Avisos do sistema → template aprovado */}
            <section className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 p-5">
                <h2 className="font-semibold text-gray-900">
                  Avisos do sistema
                </h2>
                <p className="text-sm text-gray-500">
                  Cada aviso precisa apontar para um template aprovado. Sem
                  vínculo, o aviso não sai pelo número oficial.
                </p>
              </div>
              <ul className="divide-y divide-gray-100">
                {TEMPLATES_ESPERADOS.map((esperado) => {
                const vinculado = config?.templates?.[esperado.chave];
                const aprovado = (templates || []).find(
                  (t) => t.name === vinculado?.name
                );
                const divergem =
                aprovado && aprovado.variaveis !== esperado.variaveis.length;
                return (
                  <li
                    key={esperado.chave}
                    className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
                    
                      <div className="min-w-0 lg:pr-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {esperado.titulo}
                          </p>
                          <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          vinculado?.name ?
                          'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-600'}`
                          }>
                          
                            {vinculado?.name ? 'Vinculado' : 'Não vinculado'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Categoria <strong>{esperado.categoria}</strong> ·{' '}
                          {esperado.variaveis.length} variável(is):{' '}
                          {esperado.variaveis.
                        map((v, i) => `{{${i + 1}}} ${v}`).
                        join(', ')}
                        </p>
                        {divergem &&
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-red-700">
                            <AlertTriangleIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
                            O template tem {aprovado?.variaveis} variável(is) e
                            este aviso envia {esperado.variaveis.length} — a
                            Meta recusa o envio (132012).
                          </p>
                      }
                      </div>
                      <div className="flex items-center gap-2 lg:w-96 lg:flex-shrink-0">
                        <select
                        value={vinculado?.name || ''}
                        onChange={(e) =>
                        vincularAviso(esperado.chave, e.target.value)
                        }
                        disabled={vinculando === esperado.chave}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                        aria-label={`Template do aviso ${esperado.titulo}`}>
                        
                          <option value="">Não usar este aviso</option>
                          {(templates || []).map((t) =>
                        <option key={`${esperado.chave}-${t.name}`} value={t.name}>
                              {t.name} ({t.language}) — {t.status}
                            </option>
                        )}
                          {vinculado?.name &&
                        !(templates || []).some(
                          (t) => t.name === vinculado.name
                        ) &&
                        <option value={vinculado.name}>
                                {vinculado.name} (vinculado)
                              </option>
                        }
                        </select>
                        {vinculando === esperado.chave &&
                      <LoaderIcon className="h-4 w-4 flex-shrink-0 animate-spin text-gray-400" />
                      }
                      </div>
                    </li>);

              })}
              </ul>
            </section>

            {/* Templates */}
            <section className="rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-5">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Templates de mensagens
                  </h2>
                  <p className="text-sm text-gray-500">
                    Modelos cadastrados na conta da clínica no WhatsApp Manager
                  </p>
                </div>
                <button
                type="button"
                onClick={buscarTemplates}
                disabled={carregandoTemplates}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
                
                  {carregandoTemplates ?
                <LoaderIcon className="h-4 w-4 animate-spin" /> :

                <RefreshCwIcon className="h-4 w-4" />
                }
                  Atualizar
                </button>
              </div>

              <div className="flex gap-1 border-b border-gray-100 px-5">
                {(
              [
              ['aprovados', 'Aprovados'],
              ['pendentes', 'Pendentes'],
              ['rejeitados', 'Rejeitados']] as
              [AbaTemplate, string][]).
              map(([chave, rotulo]) =>
              <button
                key={chave}
                type="button"
                onClick={() => setAba(chave)}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                aba === chave ?
                'border-green-600 text-green-700' :
                'border-transparent text-gray-500 hover:text-gray-700'}`
                }>
                
                    {rotulo}
                    {templates &&
                <span className="ml-1.5 text-xs text-gray-400">
                        {contagem[chave]}
                      </span>
                }
                  </button>
              )}
              </div>

              <div className="p-5">
                {erroTemplates ?
              <p className="flex items-start gap-2 text-sm text-red-700">
                    <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    {erroTemplates}
                  </p> :
              carregandoTemplates && !templates ?
              <p className="flex items-center gap-2 text-sm text-gray-500">
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                    Consultando os templates na Meta...
                  </p> :
              templatesDaAba.length === 0 ?
              <p className="text-sm text-gray-500">
                    {aba === 'aprovados' ?
                'Nenhum template aprovado. Cadastre os modelos no WhatsApp Manager e aguarde a aprovação da Meta.' :
                aba === 'pendentes' ?
                'Nenhum template em análise.' :
                'Nenhum template rejeitado.'}
                  </p> :

              <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                          <th scope="col" className="pb-2 pr-3 font-medium">
                            Nome do template
                          </th>
                          <th scope="col" className="pb-2 pr-3 font-medium">
                            Categoria
                          </th>
                          <th scope="col" className="pb-2 pr-3 font-medium">
                            Idioma
                          </th>
                          <th scope="col" className="pb-2 pr-3 font-medium">
                            Variáveis
                          </th>
                          <th scope="col" className="pb-2 font-medium">
                            Usado em
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {templatesDaAba.map((t) => {
                      const vinculo = vinculoPorTemplate.get(t.name);
                      return (
                        <tr key={`${t.name}-${t.language}`}>
                              <td className="py-2.5 pr-3">
                                <span className="font-medium text-gray-900">
                                  {t.name}
                                </span>
                                {t.temBotaoUrl &&
                            <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                                    botão de link
                                  </span>
                            }
                              </td>
                              <td className="py-2.5 pr-3 text-gray-600">
                                {t.category || '—'}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-600">
                                {t.language}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-600">
                                {t.variaveis}
                              </td>
                              <td className="py-2.5">
                                {vinculo ?
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                                    <LinkIcon className="h-3 w-3" />
                                    {vinculo}
                                  </span> :

                            <span className="text-xs text-gray-400">
                                    não vinculado
                                  </span>
                            }
                              </td>
                            </tr>);

                    })}
                      </tbody>
                    </table>
                  </div>
              }

                <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
                  <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {modoTecnico ?
                <span>
                      Aprovado na Meta não é o mesmo que em uso: cada aviso do
                      sistema precisa apontar para um template. O vínculo é
                      feito em{' '}
                      <button
                    type="button"
                    onClick={() => setAvancadoAberto(true)}
                    className="font-medium text-green-700 underline">
                    
                        Gerenciar credenciais e envio de teste
                      </button>
                      .
                    </span> :

                <span>
                      Aprovado na Meta não é o mesmo que em uso: um aviso só sai
                      pela Meta quando está vinculado a um template aprovado.
                      Peça o vínculo ao suporte se algum aviso estiver pendente.
                    </span>
                }
                </p>
              </div>
            </section>

            {/* Recebimento (webhook) — só para o suporte. A clínica não precisa
               saber que existe webhook: a assinatura é feita pelo servidor no
               momento da conexão. */}
            {modoTecnico && webhookInfo &&
          <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="font-semibold text-gray-900">
                  Recebimento de respostas e arquivos
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  As credenciais fazem a clínica <strong>enviar</strong>. Para{' '}
                  <strong>receber</strong> a confirmação do paciente e os
                  documentos que ele manda, cadastre esta URL no painel da Meta
                  em <em>WhatsApp → Configuração → Webhook</em>, assinando o
                  campo <code>{webhookInfo.campoObrigatorio}</code>.
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Callback URL
                    </span>
                    <div className="mt-1 flex items-start gap-2">
                      <code className="flex-1 break-all rounded bg-gray-50 p-2 text-xs text-gray-800">
                        {webhookInfo.callbackUrl}
                      </code>
                      <button
                    type="button"
                    onClick={() =>
                    copiar(webhookInfo.callbackUrl, 'callback')
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50">
                    
                        <CopyIcon className="h-3.5 w-3.5" />
                        {copiado === 'callback' ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Verify token
                    </span>
                    {config?.verifyToken ?
                <div className="mt-1 flex items-start gap-2">
                        <code className="flex-1 break-all rounded bg-gray-50 p-2 text-xs text-gray-800">
                          {config.verifyToken}
                        </code>
                        <button
                    type="button"
                    onClick={() =>
                    copiar(config.verifyToken || '', 'verify')
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50">
                    
                          <CopyIcon className="h-3.5 w-3.5" />
                          {copiado === 'verify' ? 'Copiado' : 'Copiar'}
                        </button>
                      </div> :

                <p className="mt-1 text-sm text-amber-800">
                        Gerado automaticamente ao salvar a configuração pela
                        primeira vez.
                      </p>
                }
                  </div>
                </div>

                <p className="mt-3 flex items-start gap-2 text-xs text-gray-500">
                  <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  Respostas por botão (Confirmar/Cancelar) atualizam a agenda
                  automaticamente; o cancelamento pede o motivo. Arquivos
                  recebidos são arquivados na especialidade e categoria que a
                  clínica solicitou.
                </p>
              </section>
          }
          </>
        }

        {/* Configuração manual / avançada — reaproveita a tela já existente.
             Escondida da clínica cliente: token, WABA e vínculo de template são
             trabalho de configuração/suporte, não da recepção. */}
        <section
          className={`rounded-xl border border-gray-200 bg-white ${
          modoTecnico ? '' : 'hidden'}`
          }>
          
          <button
            type="button"
            onClick={() => setAvancadoAberto((v) => !v)}
            aria-expanded={avancadoAberto}
            className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-gray-50">
            
            <div>
              <h2 className="font-semibold text-gray-900">
                Credenciais, templates dos avisos e envio de teste
              </h2>
              <p className="text-sm text-gray-500">
                Preenchimento manual das credenciais, vínculo de cada aviso com o
                template aprovado e validação do envio
              </p>
            </div>
            {avancadoAberto ?
            <ChevronUpIcon className="h-5 w-5 flex-shrink-0 text-gray-400" /> :

            <ChevronDownIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
            }
          </button>

          {avancadoAberto &&
          <div className="border-t border-gray-100 p-5">
              {loading ?
            <p className="text-sm text-gray-500">
                  Carregando configuração...
                </p> :

            <WhatsAppMetaConfig
              config={config}
              clinicaId={clinicaId}
              clinicaNome={clinicaNome}
              onSave={async (nova) => {
                await salvar(nova);
                setTemplates(null);
              }}
              onListarTemplates={listarTemplates}
              onEnviarTeste={enviarTeste} />

            }
            </div>
          }
        </section>
      </div>

      <ConectarWhatsAppWizard
        aberto={wizardAberto}
        onFechar={() => setWizardAberto(false)}
        signupInfo={signupInfo}
        onConcluirSignup={concluirSignup} />
      
    </main>);

}