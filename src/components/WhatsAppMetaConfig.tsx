import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  LoaderIcon,
  SendIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  InfoIcon,
  ImageIcon,
  UploadIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';
import {
  ConfigWhatsAppMeta,
  CONFIG_META_PADRAO,
  TEMPLATES_ESPERADOS,
  ChaveTemplateMeta,
  templateAprovado,
  TEXTOS_META_PADRAO } from
'../hooks/useWhatsAppMetaConfig';
// A janela oficial da Meta é aberta pelo SDK do Facebook, carregado sob demanda
// (não entra no bundle nem pesa para quem não usa a Meta).
import { carregarSdkFacebook } from '../utils/facebookSdk';
import { reduzirImagem } from '../utils/imagemLogo';

interface TemplateAprovado {
  name: string;
  status: string;
  language: string;
  category: string;
  variaveis: number;
  temBotaoUrl: boolean;
}

interface WhatsAppMetaConfigProps {
  config: ConfigWhatsAppMeta | null;
  onSave: (config: ConfigWhatsAppMeta) => Promise<void>;
  onListarTemplates: () => Promise<{
    templates: TemplateAprovado[];
    total: number;
  }>;
  onEnviarTeste: (
  telefone: string,
  opcoes?: {
    templateName?: string;
    templateLanguage?: string;
    params?: string[];
    /** Sufixo do botão de URL — obrigatório em templates que tenham um */
    urlParam?: string;
  })
  => Promise<any>;
  /** URL e verify token do webhook de ENTRADA (respostas e arquivos). */
  onCarregarWebhookInfo?: () => Promise<{
    callbackUrl: string;
    campoObrigatorio: string;
    verifyTokenConfigurado: boolean;
  }>;
  /** App da plataforma que abre a janela oficial de conexão da Meta. */
  onCarregarSignupConfig?: () => Promise<{
    disponivel: boolean;
    appId: string;
    configId: string;
    apiVersion: string;
    faltando: string[];
  }>;
  /** Conclui a conexão do número da própria clínica. */
  onConcluirSignup?: (dados: {
    code: string;
    wabaId: string;
    phoneNumberId: string;
  }) => Promise<{
    numeroExibicao: string;
    phoneNumberId: string;
    wabaId: string;
    webhookAssinado: boolean;
    webhookErro?: string | null;
    numeroRegistrado: boolean;
    registroErro?: string | null;
    cobrancaPlataforma?: boolean;
    cobrancaErro?: string | null;
  }>;
  /** Clínica em edição. Vem da tela, que acompanha a troca de clínica. */
  clinicaId?: string;
  clinicaNome?: string;
}

export function WhatsAppMetaConfig({
  config,
  onSave,
  onListarTemplates,
  onEnviarTeste,
  onCarregarWebhookInfo,
  onCarregarSignupConfig,
  onConcluirSignup,
  clinicaId,
  clinicaNome
}: WhatsAppMetaConfigProps) {
  const [form, setForm] = useState<ConfigWhatsAppMeta>(
    config || CONFIG_META_PADRAO
  );
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{
    tipo: 'ok' | 'erro';
    texto: string;
  } | null>(null);

  const [templates, setTemplates] = useState<TemplateAprovado[]>([]);
  const [carregandoTemplates, setCarregandoTemplates] = useState(false);

  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [templateTeste, setTemplateTeste] = useState('');
  const [testando, setTestando] = useState(false);

  // ⭐ Webhook de ENTRADA: sem ele a clínica envia, mas nunca RECEBE a resposta
  // do paciente nem os arquivos que ele manda.
  const [webhookInfo, setWebhookInfo] = useState<{
    callbackUrl: string;
    campoObrigatorio: string;
    verifyTokenConfigurado: boolean;
  } | null>(null);

  // ⭐ Logotipo REAL do cadastro da clínica — é ele que vira o cabeçalho de
  // imagem dos templates. Mostrado e editável aqui para não obrigar o usuário
  // a sair da tela do WhatsApp só para trocar a imagem.
  const [logoClinica, setLogoClinica] = useState('');
  const [carregandoLogo, setCarregandoLogo] = useState(true);
  const [salvandoLogo, setSalvandoLogo] = useState(false);

  // A clínica vem por prop (a tela acompanha a troca de clínica). O fallback
  // pela sessão é resolvido UMA vez e reagindo aos eventos — antes era um
  // JSON.parse da sessão em CADA renderização, o que travava a aba quando a
  // sessão carrega um logotipo em base64.
  const [clinicaIdFallback, setClinicaIdFallback] = useState('');
  const [clinicaNomeFallback, setClinicaNomeFallback] = useState('');

  useEffect(() => {
    const sincronizar = () => {
      try {
        const s = JSON.parse(localStorage.getItem('sessao') || '{}');
        setClinicaIdFallback(String(s?.clinicaAtual?.id || ''));
        setClinicaNomeFallback(String(s?.clinicaAtual?.nome || ''));
      } catch {
        setClinicaIdFallback('');
      }
    };
    sincronizar();
    const aoTrocar = () => setTimeout(sincronizar, 100);
    window.addEventListener('clinica-changed', aoTrocar);
    window.addEventListener('sessao-updated', aoTrocar);
    return () => {
      window.removeEventListener('clinica-changed', aoTrocar);
      window.removeEventListener('sessao-updated', aoTrocar);
    };
  }, []);

  const clinicaIdSessao = clinicaId || clinicaIdFallback;
  const nomeDaClinica = clinicaNome || clinicaNomeFallback;

  useEffect(() => {
    let ativo = true;
    if (!clinicaIdSessao) {
      setCarregandoLogo(false);
      return;
    }
    fetch(`${API_BASE_URL}/api/clinicas/${clinicaIdSessao}`).
    then((r) => r.ok ? r.json() : null).
    then((c) => {
      if (ativo) setLogoClinica(String(c?.logoUrl || ''));
    }).
    catch(() => {}).
    finally(() => {
      if (ativo) setCarregandoLogo(false);
    });
    return () => {
      ativo = false;
    };
  }, [clinicaIdSessao]);

  /** Grava o logotipo no cadastro da clínica (string vazia = remover). */
  const salvarLogoClinica = async (valor: string) => {
    if (!clinicaIdSessao) {
      setMensagem({
        tipo: 'erro',
        texto: 'Nenhuma clínica selecionada na sessão.'
      });
      return;
    }
    setSalvandoLogo(true);
    try {
      const resposta = await fetch(
        `${API_BASE_URL}/api/clinicas/${clinicaIdSessao}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logoUrl: valor })
        }
      );
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados?.error || `Falha ao salvar (HTTP ${resposta.status})`);
      }
      setLogoClinica(valor);
      // A sessão alimenta o cabeçalho e os documentos impressos: manter em dia
      // evita o logo antigo reaparecer até o próximo login.
      try {
        const s = JSON.parse(localStorage.getItem('sessao') || '{}');
        if (s?.clinicaAtual?.id === clinicaIdSessao) {
          s.clinicaAtual.logoUrl = valor;
          localStorage.setItem('sessao', JSON.stringify(s));
          // Sem este evento o cabeçalho continuava exibindo o logo ANTIGO até
          // o próximo login: ele lê a sessão da memória, não do localStorage.
          window.dispatchEvent(new Event('sessao-updated'));
        }
      } catch {

        /* sessão inválida: nada a sincronizar */}
      setMensagem({
        tipo: 'ok',
        texto: valor ? 'Logotipo atualizado.' : 'Logotipo removido.'
      });
    } catch (e: any) {
      setMensagem({
        tipo: 'erro',
        texto: e?.message || 'Não foi possível salvar o logotipo.'
      });
    } finally {
      setSalvandoLogo(false);
    }
  };

  const handleAlterarLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo depois
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMensagem({ tipo: 'erro', texto: 'Selecione uma imagem válida.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMensagem({ tipo: 'erro', texto: 'A imagem deve ter no máximo 5 MB.' });
      return;
    }
    const original = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      reader.readAsDataURL(file);
    }).catch(() => '');
    if (!original) {
      setMensagem({ tipo: 'erro', texto: 'Falha ao ler a imagem.' });
      return;
    }
    // ⭐ Reduz a imagem ANTES de gravar. O logotipo é guardado em base64 dentro
    // do cadastro e da sessão; uma foto de 2 MB virava ~2,7 MB de texto lido a
    // cada renderização de várias telas — era isso que travava a aba e deixava
    // a tela em branco. 512px é mais do que a Meta usa no cabeçalho.
    const reduzida = await reduzirImagem(original, 512).catch(() => original);
    await salvarLogoClinica(reduzida);
  };

  // ⭐ Conexão do número da PRÓPRIA clínica (Embedded Signup)
  const [signupInfo, setSignupInfo] = useState<{
    disponivel: boolean;
    appId: string;
    configId: string;
    apiVersion: string;
    faltando: string[];
  } | null>(null);
  const [conectando, setConectando] = useState(false);

  // Sincroniza com o que vem do servidor (sem isso, salvar regrava valores antigos)
  useEffect(() => {
    if (config) {
      setForm({
        ...CONFIG_META_PADRAO,
        ...config,
        accessToken: '',
        templates: config.templates || {},
        textos: { ...TEXTOS_META_PADRAO, ...(config.textos || {}) }
      });
    }
  }, [config]);

  const credenciaisOk = Boolean(
    form.phoneNumberId && (form.tokenConfigurado || form.accessToken)
  );

  // Carrega, uma vez, os dados do webhook e do app de conexão
  useEffect(() => {
    if (onCarregarWebhookInfo) {
      onCarregarWebhookInfo().
      then(setWebhookInfo).
      catch(() => setWebhookInfo(null));
    }
    if (onCarregarSignupConfig) {
      onCarregarSignupConfig().
      then(setSignupInfo).
      catch(() => setSignupInfo(null));
    }
  }, [onCarregarWebhookInfo, onCarregarSignupConfig, config?.phoneNumberId]);

  /**
   * Abre a janela oficial da Meta para a clínica conectar o SEU número. O cliente
   * faz login, escolhe a própria empresa, cria/seleciona a WABA, cadastra o
   * número e o verifica por SMS — tudo dentro da Meta. O sistema recebe de volta
   * o WABA ID, o Phone Number ID e um código de uso único.
   */
  const handleConectarNumero = async () => {
    if (!signupInfo?.disponivel || !onConcluirSignup) return;
    setConectando(true);
    setMensagem(null);

    // A conta/número chegam por evento da janela da Meta; o code, pelo callback.
    let dadosSessao: {waba_id?: string;phone_number_id?: string;} = {};
    const ouvinte = (evento: MessageEvent) => {
      if (!String(evento.origin || '').includes('facebook.com')) return;
      try {
        const dados =
        typeof evento.data === 'string' ? JSON.parse(evento.data) : evento.data;
        if (dados?.type === 'WA_EMBEDDED_SIGNUP' && dados?.data) {
          dadosSessao = dados.data;
        }
      } catch (e) {

        /* mensagens não-JSON da própria Meta são ignoradas */}
    };
    window.addEventListener('message', ouvinte);

    try {
      await carregarSdkFacebook(signupInfo.appId, signupInfo.apiVersion);

      const resposta = await new Promise<any>((resolve) => {
        window.FB.login(
          (r: any) => resolve(r),
          {
            config_id: signupInfo.configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: '',
              sessionInfoVersion: '3'
            }
          }
        );
      });

      const code = resposta?.authResponse?.code;
      if (!code) {
        throw new Error(
          'A conexão foi interrompida antes de concluir. Repita e siga até a verificação do número por SMS.'
        );
      }

      const resultado = await onConcluirSignup({
        code,
        wabaId: dadosSessao.waba_id || '',
        phoneNumberId: dadosSessao.phone_number_id || ''
      });

      // Avisos honestos: gravar as credenciais não garante as duas etapas
      // seguintes, e sem elas o canal não funciona por inteiro.
      const pendencias = [
      !resultado.webhookAssinado &&
      `recebimento de respostas não foi assinado (${resultado.webhookErro || 'motivo não informado'})`,
      !resultado.numeroRegistrado &&
      `número não registrado para envio (${resultado.registroErro || 'motivo não informado'})`].
      filter(Boolean);

      setMensagem({
        tipo: pendencias.length ? 'erro' : 'ok',
        texto: pendencias.length ?
        `Número ${resultado.numeroExibicao || resultado.phoneNumberId} conectado, mas com pendências: ${pendencias.join('; ')}.` :
        `WhatsApp conectado: ${resultado.numeroExibicao || resultado.phoneNumberId}. Agora vincule os templates aprovados e ative o canal.`
      });
    } catch (err: any) {
      setMensagem({
        tipo: 'erro',
        texto: err?.message || 'Falha ao conectar o número.'
      });
    } finally {
      window.removeEventListener('message', ouvinte);
      setConectando(false);
    }
  };

  const persistir = async (novo: ConfigWhatsAppMeta, aviso?: string) => {
    setSalvando(true);
    setMensagem(null);
    try {
      await onSave(novo);
      setMensagem({
        tipo: 'ok',
        texto: aviso || 'Configuração salva.'
      });
    } catch (err: any) {
      setMensagem({
        tipo: 'erro',
        texto: err?.message || 'Falha ao salvar.'
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleAtivo = async () => {
    if (!form.ativo && !credenciaisOk) {
      setMensagem({
        tipo: 'erro',
        texto:
        'Informe o Phone Number ID e o token de acesso, salve, e só então ative o canal.'
      });
      return;
    }
    const novo = {
      ...form,
      ativo: !form.ativo
    };
    setForm(novo);
    await persistir(
      novo,
      novo.ativo ?
      'Canal WhatsApp (Meta) ativado.' :
      'Canal WhatsApp (Meta) desativado — nenhuma mensagem sai por ele.'
    );
  };

  const handleCarregarTemplates = async () => {
    setCarregandoTemplates(true);
    setMensagem(null);
    try {
      const resultado = await onListarTemplates();
      setTemplates(resultado.templates);
      if (!resultado.total) {
        setMensagem({
          tipo: 'erro',
          texto:
          'Nenhum template encontrado nesta WABA. Crie os modelos em WhatsApp Manager → Modelos de mensagem.'
        });
      }
    } catch (err: any) {
      setMensagem({
        tipo: 'erro',
        texto: err?.message || 'Falha ao consultar os templates.'
      });
    } finally {
      setCarregandoTemplates(false);
    }
  };

  const handleTestar = async () => {
    if (!telefoneTeste.trim()) {
      setMensagem({
        tipo: 'erro',
        texto: 'Informe o número que vai receber o teste.'
      });
      return;
    }
    setTestando(true);
    setMensagem(null);
    try {
      const escolhido = templates.find((t) => t.name === templateTeste);
      await onEnviarTeste(telefoneTeste.trim(), {
        templateName: templateTeste || undefined,
        templateLanguage: escolhido?.language,
        // Preenche as variáveis com valores de amostra, na quantidade aprovada
        params: escolhido ?
        Array.from(
          {
            length: escolhido.variaveis
          },
          (_, i) => `Teste ${i + 1}`
        ) :
        undefined,
        // ⚠️ Um template com botão de URL dinâmica EXIGE o parâmetro do botão.
        // Sem ele a Meta recusa o envio por formato divergente.
        urlParam: escolhido?.temBotaoUrl ? 'teste' : undefined
      });
      setMensagem({
        tipo: 'ok',
        texto: `Mensagem enviada para ${telefoneTeste}. Verifique o aparelho.`
      });
    } catch (err: any) {
      setMensagem({
        tipo: 'erro',
        texto: err?.message || 'Falha no envio de teste.'
      });
    } finally {
      setTestando(false);
    }
  };

  const definirTemplate = (chave: ChaveTemplateMeta, nome: string) => {
    const escolhido = templates.find((t) => t.name === nome);
    setForm((atual) => {
      const novos = {
        ...atual.templates
      };
      if (!nome) {
        delete novos[chave];
      } else {
        novos[chave] = {
          name: nome,
          language: escolhido?.language || 'pt_BR',
          // ⚠️ Guardado no vínculo porque o envio precisa saber ANTES de
          // montar a mensagem: mandar o parâmetro do botão para um template
          // cujo botão é estático (ou omitir num template dinâmico) faz a
          // Meta recusar com 132012.
          temBotaoUrl: escolhido ? Boolean(escolhido.temBotaoUrl) : undefined
        };
      }
      return {
        ...atual,
        templates: novos
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* ===== Estado do canal ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-gray-900">
                Canal WhatsApp oficial (Meta)
              </h4>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${form.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                
                {form.ativo ? 'Ativo' : 'Desativado'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {form.ativo ?
              'Os avisos podem sair pela API oficial da Meta.' :
              'Nenhuma mensagem sai por este canal enquanto estiver desativado.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleAtivo}
            disabled={salvando}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${form.ativo ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'}`}>
            
            {form.ativo ? 'Desativar' : 'Ativar'}
          </button>
        </div>
        {!credenciaisOk &&
        <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            Informe o Phone Number ID e o token de acesso e salve antes de ativar
            o canal.
          </p>
        }
      </div>

      {mensagem &&
      <div
        className={`flex items-start gap-2 rounded-lg p-3 text-sm ${mensagem.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
        role="status">
        
          {mensagem.tipo === 'ok' ?
        <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" /> :

        <XCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
        }
          <span className="whitespace-pre-line">{mensagem.texto}</span>
        </div>
      }

      {/* ===== Conectar o número da PRÓPRIA clínica ===== */}
      {signupInfo && onConcluirSignup &&
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h4 className="font-semibold text-green-900">
            Conectar o WhatsApp desta clínica
          </h4>
          <p className="mt-1 text-sm text-green-900">
            O caminho recomendado: a clínica usa o <strong>seu próprio número</strong>,
            e não o da plataforma. Assim o paciente vê o remetente da clínica, e o
            limite de envio, a qualidade e um eventual bloqueio não são
            compartilhados com outras clínicas.
          </p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-green-900">
            <li>Login na conta Facebook do responsável pela clínica</li>
            <li>Seleção da empresa e da conta do WhatsApp (WABA)</li>
            <li>Cadastro do número e verificação pelo código por SMS</li>
          </ol>

          {signupInfo.disponivel ?
        <button
          type="button"
          onClick={handleConectarNumero}
          disabled={conectando}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
          
              {conectando ?
          <LoaderIcon className="h-4 w-4 animate-spin" /> :

          <ExternalLinkIcon className="h-4 w-4" />
          }
              {conectando ? 'Aguardando a Meta...' : 'Conectar WhatsApp'}
            </button> :

        <p className="mt-3 flex items-start gap-2 rounded-md bg-white p-2 text-sm text-green-900">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              A conexão automática ainda não está habilitada no servidor
              {signupInfo.faltando?.length ?
          ` (falta definir ${signupInfo.faltando.join(', ')})` :
          ''}
              . Enquanto isso, preencha as credenciais manualmente abaixo.
            </p>
        }
          <p className="mt-2 text-xs text-green-800">
            O sistema recebe apenas a conta (WABA) e o número. O token de acesso é
            obtido e guardado no servidor — nunca passa pelo navegador.
          </p>
        </div>
      }

      {/* ===== Recebimento (webhook) ===== */}
      {webhookInfo &&
      <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h4 className="font-semibold text-gray-900">
            Recebimento de respostas e arquivos
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            Com as credenciais a clínica <strong>envia</strong>. Para{' '}
            <strong>receber</strong> a confirmação do paciente e os documentos que
            ele manda, cadastre esta URL no painel da Meta em{' '}
            <em>WhatsApp → Configuração → Webhook</em>, assinando o campo{' '}
            <code>{webhookInfo.campoObrigatorio}</code>.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <span className="text-xs font-medium uppercase text-gray-500">
                Callback URL
              </span>
              <code className="mt-0.5 block break-all rounded bg-gray-50 p-2 text-xs text-gray-800">
                {webhookInfo.callbackUrl}
              </code>
            </div>
            <div>
              <span className="text-xs font-medium uppercase text-gray-500">
                Verify token
              </span>
              {form.verifyToken ?
            <code className="mt-0.5 block break-all rounded bg-gray-50 p-2 text-xs text-gray-800">
                  {form.verifyToken}
                </code> :

            <p className="mt-0.5 text-sm text-amber-800">
                  Gerado automaticamente ao salvar a configuração pela primeira
                  vez.
                </p>
            }
            </div>
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs text-gray-500">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            As respostas por botão (Confirmar/Cancelar) atualizam a agenda
            automaticamente. Cancelamento pede o motivo ao paciente, e arquivos
            recebidos são arquivados na especialidade e categoria que a clínica
            solicitou.
          </p>
        </div>
      }

      {/* ===== Passo a passo na Meta ===== */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-blue-900">
          <InfoIcon className="h-4 w-4" />
          O que fazer no painel da Meta (uma vez)
        </h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-blue-900">
          <li>
            Conta <strong>Meta Business</strong> verificada, com o CNPJ da
            clínica.
          </li>
          <li>
            Em <strong>developers.facebook.com</strong>, crie um app do tipo{' '}
            <em>Business</em> e adicione o produto <strong>WhatsApp</strong>.
          </li>
          <li>
            Cadastre o número da clínica. Ele{' '}
            <strong>não pode estar em uso</strong> no WhatsApp comum ou Business
            app.
          </li>
          <li>
            Copie o <strong>Phone Number ID</strong> e o <strong>WABA ID</strong>{' '}
            e cole abaixo.
          </li>
          <li>
            Crie um <strong>System User</strong> no Business Manager com as
            permissões <code>whatsapp_business_messaging</code> e{' '}
            <code>whatsapp_business_management</code>, e gere um{' '}
            <strong>token permanente</strong>. O token do painel dura 24h e não
            serve em produção.
          </li>
          <li>
            Em <strong>WhatsApp Manager → Modelos de mensagem</strong>, crie os
            modelos da lista abaixo e aguarde a aprovação.
          </li>
        </ol>
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline">
          
          Abrir WhatsApp Manager <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </div>

      {/* ===== Credenciais ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-gray-900">Credenciais</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="meta-phone-id"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Phone Number ID
            </label>
            <input
              id="meta-phone-id"
              type="text"
              value={form.phoneNumberId}
              onChange={(e) =>
              setForm({
                ...form,
                phoneNumberId: e.target.value
              })
              }
              placeholder="Ex.: 123456789012345"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          <div>
            <label
              htmlFor="meta-waba-id"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              WABA ID (conta do WhatsApp Business)
            </label>
            <input
              id="meta-waba-id"
              type="text"
              value={form.wabaId}
              onChange={(e) =>
              setForm({
                ...form,
                wabaId: e.target.value
              })
              }
              placeholder="Necessário para listar os templates"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="meta-token"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Token de acesso permanente
              {form.tokenConfigurado &&
              <span className="ml-2 text-xs font-normal text-green-700">
                  (já configurado — deixe em branco para manter)
                </span>
              }
            </label>
            <input
              id="meta-token"
              type="password"
              value={form.accessToken}
              onChange={(e) =>
              setForm({
                ...form,
                accessToken: e.target.value
              })
              }
              placeholder={
              form.tokenConfigurado ?
              '••••••••••••••••' :
              'Cole o token do System User'
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
            <p className="mt-1 text-xs text-gray-500">
              O token fica somente no servidor e nunca é devolvido para esta
              tela.
            </p>
          </div>
          <div>
            <label
              htmlFor="meta-numero"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Número exibido ao paciente
            </label>
            <input
              id="meta-numero"
              type="text"
              value={form.numeroExibicao}
              onChange={(e) =>
              setForm({
                ...form,
                numeroExibicao: e.target.value
              })
              }
              placeholder="Ex.: (11) 99999-0000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          <div>
            <label
              htmlFor="meta-api-version"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Versão da API
            </label>
            <input
              id="meta-api-version"
              type="text"
              value={form.apiVersion}
              onChange={(e) =>
              setForm({
                ...form,
                apiVersion: e.target.value
              })
              }
              placeholder="v21.0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.preferencial}
            onChange={(e) =>
            setForm({
              ...form,
              preferencial: e.target.checked
            })
            }
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
          
          <span>
            <strong>Usar a Meta antes do WAHA</strong> — quando marcado, os
            avisos saem pela API oficial e o WAHA fica como alternativa. Desmarcado,
            o WAHA continua sendo o canal principal.
          </span>
        </label>
      </div>

      {/* ===== Textos fixos das variáveis ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h4 className="font-semibold text-gray-900">
          Textos das mensagens (variáveis fixas)
        </h4>
        <p className="mb-4 text-sm text-gray-600">
          Estas variáveis não vêm do cadastro do paciente nem da consulta — são
          textos da clínica. O que estiver aqui é o que a Meta recebe em{' '}
          <strong>local</strong>, <strong>instruções pré-consulta</strong> e{' '}
          <strong>informações importantes</strong>. Em branco, o sistema usa o
          padrão.
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="meta-texto-local"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Local do atendimento
            </label>
            <input
              id="meta-texto-local"
              type="text"
              value={form.textos?.local || ''}
              onChange={(e) =>
              setForm({
                ...form,
                textos: { ...form.textos, local: e.target.value }
              })
              }
              placeholder="Em branco: nome e endereço da clínica selecionada"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          <div>
            <label
              htmlFor="meta-texto-instrucoes"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Instruções pré-consulta
            </label>
            <textarea
              id="meta-texto-instrucoes"
              rows={2}
              value={form.textos?.instrucoesPreConsulta || ''}
              onChange={(e) =>
              setForm({
                ...form,
                textos: {
                  ...form.textos,
                  instrucoesPreConsulta: e.target.value
                }
              })
              }
              placeholder={TEXTOS_META_PADRAO.instrucoesPreConsulta}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          <div>
            <label
              htmlFor="meta-texto-importantes"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Informações importantes
            </label>
            <textarea
              id="meta-texto-importantes"
              rows={2}
              value={form.textos?.informacoesImportantes || ''}
              onChange={(e) =>
              setForm({
                ...form,
                textos: {
                  ...form.textos,
                  informacoesImportantes: e.target.value
                }
              })
              }
              placeholder={TEXTOS_META_PADRAO.informacoesImportantes}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          {/* ⭐ Canal LIVRE: o número oficial da Meta só dispara template. O
               atendimento humano acontece no WhatsApp comum da recepção. */}
          <div>
            <label
              htmlFor="meta-numero-atendimento"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              WhatsApp do atendimento ("Falar conosco")
            </label>
            <input
              id="meta-numero-atendimento"
              type="tel"
              value={form.textos?.numeroAtendimento || ''}
              onChange={(e) =>
              setForm({
                ...form,
                textos: {
                  ...form.textos,
                  numeroAtendimento: e.target.value
                }
              })
              }
              placeholder="(11) 99999-9999"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
            <p className="mt-1 text-xs text-gray-500">
              Número para onde o botão "Falar conosco" leva o paciente — a
              conversa livre com a recepção. Em branco, o sistema usa o
              WhatsApp/celular do cadastro da clínica.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            Logotipo da clínica
            {nomeDaClinica &&
            <span className="ml-1 font-normal text-gray-500">
                — {nomeDaClinica}
              </span>
            }
          </span>

          <div className="flex flex-wrap items-start gap-4">
            {/* Prévia do logo REAL do cadastro — é ele que a Meta vai baixar */}
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {logoClinica ?
              <img
                src={
                logoClinica.startsWith('data:') ?
                logoClinica :
                `${API_BASE_URL}${logoClinica}`
                }
                alt="Logotipo da clínica"
                className="h-full w-full object-contain" /> :


              <ImageIcon
                className="h-7 w-7 text-gray-300"
                aria-hidden="true" />

              }
            </div>

            <div className="min-w-[16rem] flex-1">
              {carregandoLogo ?
              <p className="text-sm text-gray-500">Carregando logotipo…</p> :
              logoClinica ?
              <p className="text-sm text-gray-700">
                  Usando o logotipo cadastrado na clínica. Ele é publicado
                  automaticamente numa URL que a Meta consegue baixar.
                </p> :

              <p className="text-sm text-amber-700">
                  A clínica ainda não tem logotipo cadastrado. Envie uma imagem
                  para usá-la como cabeçalho das mensagens.
                </p>
              }

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  <UploadIcon className="h-4 w-4" aria-hidden="true" />
                  {logoClinica ? 'Alterar logotipo' : 'Enviar logotipo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleAlterarLogo}
                    disabled={salvandoLogo} />
                  
                </label>
                {logoClinica &&
                <button
                  type="button"
                  onClick={() => salvarLogoClinica('')}
                  disabled={salvandoLogo}
                  className="rounded-lg px-2 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50">
                  
                    Remover
                  </button>
                }
                {salvandoLogo &&
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <LoaderIcon
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true" />
                  
                    Salvando…
                  </span>
                }
              </div>
              <p className="mt-1 text-xs text-gray-500">
                PNG ou JPG de até 2 MB. Alterar aqui atualiza o cadastro da
                clínica — o mesmo logotipo usado nos documentos impressos.
              </p>
            </div>
          </div>

          <label
            htmlFor="meta-logo-url"
            className="mt-4 mb-1 block text-xs font-medium text-gray-600">
            
            Usar outra imagem só no WhatsApp (opcional)
          </label>
          <input
            id="meta-logo-url"
            type="url"
            value={form.textos?.logoUrl || ''}
            onChange={(e) =>
            setForm({
              ...form,
              textos: { ...form.textos, logoUrl: e.target.value }
            })
            }
            placeholder="https://clinic.sky9.com.br/logos/minha-clinica.png"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
          
          <p className="mt-1 text-xs text-gray-500">
            Na Meta o logotipo não vai no texto: ele é o{' '}
            <strong>cabeçalho de imagem</strong> do template (crie o modelo com{' '}
            <em>Header → Imagem</em> no WhatsApp Manager). Em branco, vale o
            logotipo do cadastro mostrado acima.
          </p>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs text-amber-700">
          <AlertTriangleIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
          A Meta recusa parâmetros com quebra de linha, tabulação ou 4 espaços
          seguidos — escreva cada texto em uma única linha corrida.
        </p>
      </div>

      {/* ===== Templates ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-gray-900">
            Modelos aprovados (templates)
          </h4>
          <button
            type="button"
            onClick={handleCarregarTemplates}
            disabled={carregandoTemplates}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            
            {carregandoTemplates ?
            <LoaderIcon className="h-4 w-4 animate-spin" /> :

            <RefreshCwIcon className="h-4 w-4" />
            }
            Buscar na Meta
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Fora de uma conversa iniciada pelo paciente, a Meta só entrega{' '}
          <strong>template aprovado</strong>. Crie cada modelo abaixo em{' '}
          <em>WhatsApp Manager → Modelos</em> na categoria indicada e vincule
          aqui.
        </p>

        <div className="space-y-4">
          {TEMPLATES_ESPERADOS.map((esperado) => {
            const vinculado = form.templates[esperado.chave];
            const aprovado = templates.find((t) => t.name === vinculado?.name);
            const variaveisDivergem =
            aprovado && aprovado.variaveis !== esperado.variaveis.length;
            return (
              <div
                key={esperado.chave}
                className={`rounded-lg border p-3 ${variaveisDivergem ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {esperado.titulo}
                    </p>
                    <p className="text-xs text-gray-500">
                      Categoria <strong>{esperado.categoria}</strong> · variáveis:{' '}
                      {esperado.variaveis.
                      map((v, i) => `{{${i + 1}}} ${v}`).
                      join(', ')}
                      {esperado.botaoUrl && ' · com botão de URL dinâmica'}
                    </p>
                  </div>
                  {aprovado &&
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${templateAprovado(aprovado.status) ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    
                      {aprovado.status}
                    </span>
                  }
                </div>

                <p className="mt-2 rounded bg-gray-50 p-2 font-mono text-xs text-gray-700">
                  {esperado.exemplo}
                </p>

                <div className="mt-2">
                  {templates.length ?
                  <select
                    value={vinculado?.name || ''}
                    onChange={(e) =>
                    definirTemplate(esperado.chave, e.target.value)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    aria-label={`Template para ${esperado.titulo}`}>
                    
                      <option value="">Não usar este aviso pela Meta</option>
                      {templates.map((t) =>
                    <option key={`${t.name}-${t.language}`} value={t.name}>
                          {t.name} ({t.language}) — {t.status}
                        </option>
                    )}
                    </select> :

                  <input
                    type="text"
                    value={vinculado?.name || ''}
                    onChange={(e) =>
                    definirTemplate(esperado.chave, e.target.value)
                    }
                    placeholder="Nome exato do template aprovado"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    aria-label={`Template para ${esperado.titulo}`} />

                  }
                </div>

                {variaveisDivergem &&
                <p className="mt-2 flex items-start gap-2 text-xs text-red-700">
                    <AlertTriangleIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    O template <strong>{aprovado?.name}</strong> tem{' '}
                    {aprovado?.variaveis} variável(is), mas este aviso envia{' '}
                    {esperado.variaveis.length}. A Meta recusa o envio com o
                    erro 132012 — vincule um template com{' '}
                    {esperado.variaveis.length} variável(is) ou ajuste o modelo
                    na Meta.
                  </p>
                }
              </div>);

          })}
        </div>
      </div>

      {/* ===== Teste ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-gray-900">Validar o envio</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="meta-tel-teste"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Celular de teste
            </label>
            <input
              id="meta-tel-teste"
              type="tel"
              value={telefoneTeste}
              onChange={(e) => setTelefoneTeste(e.target.value)}
              placeholder="(11) 99999-0000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
            
          </div>
          <div>
            <label
              htmlFor="meta-template-teste"
              className="mb-1 block text-sm font-medium text-gray-700">
              
              Template do teste
            </label>
            <select
              id="meta-template-teste"
              value={templateTeste}
              onChange={(e) => setTemplateTeste(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500">
              
              <option value="">
                Texto livre (só dentro da janela de 24h)
              </option>
              {templates.map((t) =>
              <option key={`teste-${t.name}`} value={t.name}>
                  {t.name} ({t.language})
                </option>
              )}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={handleTestar}
          disabled={testando || !credenciaisOk}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
          
          {testando ?
          <LoaderIcon className="h-4 w-4 animate-spin" /> :

          <SendIcon className="h-4 w-4" />
          }
          Enviar mensagem de teste
        </button>
        {!credenciaisOk &&
        <p className="mt-2 text-xs text-gray-500">
            Informe e salve as credenciais antes de testar.
          </p>
        }
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => persistir(form)}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          
          {salvando && <LoaderIcon className="h-4 w-4 animate-spin" />}
          Salvar WhatsApp (Meta)
        </button>
      </div>
    </div>);

}