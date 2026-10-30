import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { useBancosConfig, BANCOS_SUPORTADOS, BancoConfig, BancoConfigForm as BancoConfigFormType } from '../hooks/useBancosConfig';
import { LandmarkIcon, PlusIcon, EditIcon, TrashIcon, BuildingIcon, FileTextIcon, AlertCircleIcon, CheckCircleIcon, XCircleIcon, Loader2Icon, HelpCircleIcon, ExternalLinkIcon, ShieldCheckIcon, SettingsIcon, FlaskConicalIcon, CheckCircle2Icon } from 'lucide-react';
const ESTADOS_BR = [{
  value: 'AC',
  label: 'AC'
}, {
  value: 'AL',
  label: 'AL'
}, {
  value: 'AP',
  label: 'AP'
}, {
  value: 'AM',
  label: 'AM'
}, {
  value: 'BA',
  label: 'BA'
}, {
  value: 'CE',
  label: 'CE'
}, {
  value: 'DF',
  label: 'DF'
}, {
  value: 'ES',
  label: 'ES'
}, {
  value: 'GO',
  label: 'GO'
}, {
  value: 'MA',
  label: 'MA'
}, {
  value: 'MT',
  label: 'MT'
}, {
  value: 'MS',
  label: 'MS'
}, {
  value: 'MG',
  label: 'MG'
}, {
  value: 'PA',
  label: 'PA'
}, {
  value: 'PB',
  label: 'PB'
}, {
  value: 'PR',
  label: 'PR'
}, {
  value: 'PE',
  label: 'PE'
}, {
  value: 'PI',
  label: 'PI'
}, {
  value: 'RJ',
  label: 'RJ'
}, {
  value: 'RN',
  label: 'RN'
}, {
  value: 'RS',
  label: 'RS'
}, {
  value: 'RO',
  label: 'RO'
}, {
  value: 'RR',
  label: 'RR'
}, {
  value: 'SC',
  label: 'SC'
}, {
  value: 'SP',
  label: 'SP'
}, {
  value: 'SE',
  label: 'SE'
}, {
  value: 'TO',
  label: 'TO'
}];
const DEFAULT_FORM: BancoConfigFormType = {
  banco: '341',
  bancoNome: 'Itaú Unibanco',
  agencia: '',
  agenciaDigito: '',
  conta: '',
  contaDigito: '',
  carteira: '109',
  convenio: '',
  codigoCedente: '',
  nomeCedente: '',
  cnpjCedente: '',
  enderecoCedente: '',
  cidadeCedente: '',
  ufCedente: 'SP',
  cepCedente: '',
  multa: 2.0,
  juros: 1.0,
  diasProtesto: 0,
  instrucao1: 'Não receber após o vencimento',
  instrucao2: 'Cobrar multa de 2% após o vencimento',
  instrucao3: 'Cobrar juros de 1% ao mês',
  // ⭐ Campos OAuth Itaú
  clientId: '',
  clientSecret: '',
  itauKey: '',
  tipoAmbiente: 2,
  tipoJuros: 5,
  tipoMulta: 3,
  boletoRegistrado: false
};
interface BancoConfigFormProps {
  clinicaId: string;
  onSave?: () => void;
}
export function BancoConfigForm({
  clinicaId,
  onSave
}: BancoConfigFormProps) {
  const {
    configs,
    loading,
    salvarConfig,
    deletarConfig,
    toggleAtivo
  } = useBancosConfig(clinicaId);
  const {
    success,
    error: showError
  } = useToast();
  const {
    confirm
  } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testando, setTestando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<BancoConfigFormType>(DEFAULT_FORM);
  const carteirasDisponiveis = BANCOS_SUPORTADOS.find((b) => b.codigo === formData.banco)?.carteiras || [];
  const handleTestarConexao = async () => {
    if (!editingId) {
      showError('Erro', 'Salve a configuração antes de testar a conexão');
      return;
    }
    setTestando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/boletos-itau/teste-conexao/${editingId}`);
      const data = await response.json();
      if (response.ok && data.sucesso) {
        success('Conexão OK!', 'Credenciais OAuth válidas. API do Itaú conectada com sucesso!');
      } else {
        showError('Erro de Conexão', data.error || 'Não foi possível conectar à API do Itaú');
      }
    } catch (err: any) {
      showError('Erro', err.message || 'Erro ao testar conexão');
    } finally {
      setTestando(false);
    }
  };
  const handleOpenModal = (config?: BancoConfig) => {
    if (config) {
      setEditingId(config.id);
      setFormData({
        banco: config.banco,
        bancoNome: config.bancoNome,
        agencia: config.agencia,
        agenciaDigito: config.agenciaDigito || '',
        conta: config.conta,
        contaDigito: config.contaDigito,
        carteira: config.carteira,
        convenio: config.convenio || '',
        codigoCedente: config.codigoCedente || '',
        nomeCedente: config.nomeCedente,
        cnpjCedente: config.cnpjCedente,
        enderecoCedente: config.enderecoCedente || '',
        cidadeCedente: config.cidadeCedente || '',
        ufCedente: config.ufCedente || 'SP',
        cepCedente: config.cepCedente || '',
        multa: config.multa,
        juros: config.juros,
        diasProtesto: config.diasProtesto,
        instrucao1: config.instrucao1 || '',
        instrucao2: config.instrucao2 || '',
        instrucao3: config.instrucao3 || '',
        // ⭐ Campos OAuth Itaú
        clientId: (config as any).clientId || '',
        clientSecret: (config as any).clientSecret || '',
        itauKey: (config as any).itauKey || '',
        tipoAmbiente: (config as any).tipoAmbiente || 2,
        tipoJuros: (config as any).tipoJuros || 5,
        tipoMulta: (config as any).tipoMulta || 3,
        boletoRegistrado: !!(Number((config as any).boletoRegistrado) || (config as any).boletoRegistrado === true)
      });
    } else {
      setEditingId(null);
      setFormData(DEFAULT_FORM);
    }
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };
  const handleChange = (field: keyof BancoConfigFormType, value: string | number | boolean) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        [field]: value
      };
      if (field === 'banco') {
        const bancoSelecionado = BANCOS_SUPORTADOS.find((b) => b.codigo === value);
        if (bancoSelecionado) {
          newData.bancoNome = bancoSelecionado.nome;
          newData.carteira = bancoSelecionado.carteiras[0] || '';
        }
      }
      return newData;
    });
  };
  const formatarCNPJ = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 14) {
      return numbers.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
    }
    return value;
  };
  const handleSalvar = async (dados: BancoConfigFormType) => {
    setIsSubmitting(true);
    try {
      await salvarConfig(dados, editingId || undefined);
      success('Sucesso', editingId ? 'Configuração atualizada!' : 'Configuração salva!');
      setIsModalOpen(false);
      setEditingId(null);
      setFormData(DEFAULT_FORM);
      // Chama callback se fornecido
      if (onSave) {
        onSave();
      }
    } catch (err: any) {
      showError('Erro', err.message || 'Erro ao salvar configuração');
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSubmit = async () => {
    if (!formData.agencia || !formData.conta || !formData.contaDigito || !formData.carteira) {
      showError('Campos Obrigatórios', 'Preencha todos os dados da conta (Agência, Conta, Dígito e Carteira)');
      return;
    }
    if (!formData.nomeCedente || !formData.cnpjCedente) {
      showError('Campos Obrigatórios', 'Preencha o Nome e CNPJ/CPF do Cedente');
      return;
    }
    setIsSubmitting(true);
    try {
      await salvarConfig(formData, editingId || undefined);
      success('Sucesso', `Configuração bancária ${editingId ? 'atualizada' : 'criada'} com sucesso!`);
      handleCloseModal();
    } catch (err: any) {
      showError('Erro', err.message || 'Não foi possível salvar a configuração');
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDelete = async (id: string, bancoNome: string) => {
    const confirmed = await confirm('Excluir Configuração', `Tem certeza que deseja excluir a configuração do banco ${bancoNome}? Esta ação não pode ser desfeita.`, 'Excluir', 'Cancelar');
    if (confirmed) {
      try {
        await deletarConfig(id);
        success('Excluído', 'Configuração bancária removida com sucesso');
      } catch (err: any) {
        showError('Erro', err.message || 'Não foi possível excluir a configuração');
      }
    }
  };
  const handleToggleAtivo = async (id: string, atual: boolean) => {
    try {
      await toggleAtivo(id, !atual);
      success('Atualizado', `Configuração bancária ${!atual ? 'ativada' : 'desativada'}`);
    } catch (err: any) {
      showError('Erro', err.message || 'Não foi possível alterar o status');
    }
  };
  if (loading && configs.length === 0) {
    return <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
        <p className="text-gray-500 mt-2">
          Carregando configurações bancárias...
        </p>
      </div>;
  }
  return <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">
          Configure as contas bancárias para emissão de boletos registrados.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsHelpOpen(true)} size="sm" variant="outline" className="text-teal-600 border-teal-300 hover:bg-teal-50">
            
            <HelpCircleIcon className="w-4 h-4 mr-1" />
            Ajuda Itaú
          </Button>
          <Button onClick={() => handleOpenModal()} size="sm" className="bg-teal-600 hover:bg-teal-700">
            
            <PlusIcon className="w-4 h-4 mr-2" />
            Adicionar Banco
          </Button>
        </div>
      </div>

      {configs.length === 0 ? <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
          <LandmarkIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">
            Nenhuma conta configurada
          </h3>
          <p className="text-gray-500 mt-1 mb-4">
            Adicione uma conta bancária para começar a emitir boletos pelo
            sistema.
          </p>
          <Button onClick={() => handleOpenModal()} variant="outline">
            Configurar Primeira Conta
          </Button>
        </div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((config) => <div key={config.id} className={`border rounded-xl p-4 transition-all ${config.ativo ? 'border-teal-200 bg-teal-50/30 shadow-sm' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
          
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.ativo ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-500'}`}>
                
                    <LandmarkIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      {config.bancoNome}
                      {config.ativo ? <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    
                          Ativo
                        </Badge> : <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    
                          Inativo
                        </Badge>}
                    </h4>
                    <p className="text-xs text-gray-500">
                      Banco {config.banco}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleToggleAtivo(config.id, !!config.ativo)} className={`p-1.5 rounded-md transition-colors ${config.ativo ? 'text-orange-600 hover:bg-orange-100' : 'text-green-600 hover:bg-green-100'}`} title={config.ativo ? 'Desativar' : 'Ativar'}>
                
                    {config.ativo ? <XCircleIcon className="w-4 h-4" /> : <CheckCircleIcon className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleOpenModal(config)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Editar">
                
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(config.id, config.bancoNome)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors" title="Excluir">
                
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-500">Agência / Conta</span>
                  <span className="font-medium text-gray-900">
                    {config.agencia}
                    {config.agenciaDigito ? `-${config.agenciaDigito}` : ''} / {config.conta}-{config.contaDigito}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-500">Carteira</span>
                  <span className="font-medium text-gray-900">
                    {config.carteira}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-500">Cedente</span>
                  <span className="font-medium text-gray-900 truncate max-w-[150px]" title={config.nomeCedente}>
                
                    {config.nomeCedente}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-gray-500">CNPJ/CPF</span>
                  <span className="font-medium text-gray-900">
                    {config.cnpjCedente}
                  </span>
                </div>
              </div>
            </div>)}
        </div>}

      {/* Modal de Ajuda - Itaú API Cobrança */}
      <Modal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} title="Como configurar o Itaú API Cobrança" size="lg">
        
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ExternalLinkIcon className="w-4 h-4 text-teal-600" />
                <h4 className="font-semibold text-gray-900">
                  Aceitar o convite do DevPortal
                </h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1 ml-0.5">
                <li>
                  • Verifique o e-mail cadastrado — deve ter um convite do
                  DevPortal Itaú
                </li>
                <li>
                  • Acesse{' '}
                  <span className="font-medium text-teal-700">
                    devportal.itau.com.br
                  </span>
                  , clique em <strong>"Já tenho cadastro"</strong> e preencha os
                  dados
                </li>
              </ul>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheckIcon className="w-4 h-4 text-teal-600" />
                <h4 className="font-semibold text-gray-900">
                  Gerar o Certificado Digital (mTLS)
                </h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1 ml-0.5">
                <li>
                  • No DevPortal, siga o fluxo de geração de certificado usando
                  o <strong>token</strong> que veio em anexo no e-mail
                </li>
                <li>
                  • Isso vai gerar um <strong>certificado .pem</strong> e um{' '}
                  <strong>client_secret</strong>
                </li>
              </ul>
              <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircleIcon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  O token tem <strong>validade de 7 dias</strong>. Guarde o
                  certificado e o secret com segurança — são as credenciais de
                  produção.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <SettingsIcon className="w-4 h-4 text-teal-600" />
                <h4 className="font-semibold text-gray-900">
                  Cadastrar no sistema
                </h4>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Nesta tela (<strong>Configurações Bancárias</strong>), clique em
                "Adicionar Banco" e preencha:
              </p>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-gray-500">Banco:</span>{' '}
                    <span className="font-medium">Itaú (341)</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Carteira:</span>{' '}
                    <span className="font-medium">109</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Agência:</span>{' '}
                    <span className="font-medium">Conforme e-mail do Itaú</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Conta:</span>{' '}
                    <span className="font-medium">Conforme e-mail do Itaú</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Client ID:</span>{' '}
                    <span className="font-medium">Credencial do e-mail</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Client Secret:</span>{' '}
                    <span className="font-medium">Gerado no passo 2</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Nome Cedente:</span>{' '}
                    <span className="font-medium">Razão social da empresa</span>
                  </div>
                  <div>
                    <span className="text-gray-500">CNPJ Cedente:</span>{' '}
                    <span className="font-medium">CNPJ da empresa</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
              4
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConicalIcon className="w-4 h-4 text-teal-600" />
                <h4 className="font-semibold text-gray-900">
                  Testar em modo validação
                </h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1 ml-0.5">
                <li>
                  • Emita boletos com{' '}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    "etapa_processo_boleto": "Validacao"
                  </code>
                </li>
                <li>
                  • Este modo é apenas teste —{' '}
                  <strong>não registra o título</strong> no banco
                </li>
                <li>
                  • Verifique se o boleto gera corretamente com QR Code PIX
                </li>
              </ul>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
              5
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2Icon className="w-4 h-4 text-teal-600" />
                <h4 className="font-semibold text-gray-900">Homologar</h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1 ml-0.5">
                <li>
                  • Emita pelo menos <strong>1 boleto</strong> em modo{' '}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    "Efetivacao"
                  </code>{' '}
                  (produção)
                </li>
                <li>
                  • Envie o PDF com QR Code para{' '}
                  <span className="font-medium text-teal-700">
                    implantacao_cash_varejo@itau-unibanco.com.br
                  </span>
                </li>
                <li>
                  • Ou valide pela Bankline:{' '}
                  <strong>
                    Mais → Transmissão de arquivos → Validação → Validar linha
                    digitável
                  </strong>
                </li>
              </ul>
              <div className="mt-2 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2Icon className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-green-800">
                  Após a homologação, seus boletos estarão registrados e prontos
                  para cobrança real!
                </p>
              </div>
            </div>
          </div>

          {/* Step 6 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              6
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircleIcon className="w-4 h-4 text-blue-600" />
                <h4 className="font-semibold text-gray-900">
                  Configurar Webhook (Confirmação Automática)
                </h4>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Para que o sistema atualize automaticamente as parcelas quando
                um boleto for pago, configure o webhook no DevPortal do Itaú:
              </p>
              <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                <div className="text-xs">
                  <span className="text-gray-500">URL do Webhook:</span>
                  <code className="block bg-white px-2 py-1 rounded border border-blue-200 mt-1 font-mono text-blue-800 break-all">
                    https://api.x-star.com.br/api/boletos-itau/webhook
                  </code>
                </div>
                <div className="text-xs text-gray-600">
                  <strong>Método:</strong> POST &nbsp;|&nbsp;{' '}
                  <strong>Formato:</strong> JSON
                </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1 ml-0.5 mt-2">
                <li>
                  • No DevPortal, acesse a seção de{' '}
                  <strong>Webhook da Cobrança</strong>
                </li>
                <li>• Cole a URL acima como endpoint de notificação</li>
                <li>
                  • Quando um boleto for pago, o Itaú notifica automaticamente e
                  o sistema marca a parcela como <strong>paga</strong>
                </li>
              </ul>
              <div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <AlertCircleIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-800">
                  Todos os eventos do webhook são registrados em log para
                  auditoria.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
          <Button onClick={() => setIsHelpOpen(false)} variant="outline">
            Entendi
          </Button>
        </div>
      </Modal>

      {/* Modal de Criação/Edição */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingId ? 'Editar Configuração Bancária' : 'Nova Configuração Bancária'} size="large" footer={<>
            <Button variant="ghost" onClick={handleCloseModal} disabled={isSubmitting}>
            
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-teal-600 hover:bg-teal-700">
            
              {isSubmitting ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </>}>
        
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Seção 1: Banco */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <LandmarkIcon className="w-4 h-4 text-teal-600" />
              Instituição Financeira
            </h3>
            <Select label="Banco" value={formData.banco} onChange={(e) => handleChange('banco', e.target.value)} options={BANCOS_SUPORTADOS.map((b) => ({
            value: b.codigo,
            label: `${b.codigo} - ${b.nome}`
          }))} />
            
          </div>

          {/* Seção 2: Dados da Conta */}
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <BuildingIcon className="w-4 h-4 text-teal-600" />
              Dados da Conta
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input label="Agência *" value={formData.agencia} onChange={(e) => handleChange('agencia', e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Ex: 1234" />
                  
                </div>
                <div className="w-20">
                  <Input label="Dígito" value={formData.agenciaDigito} onChange={(e) => handleChange('agenciaDigito', e.target.value.slice(0, 2))} placeholder="Ex: 1" />
                  
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input label="Conta Corrente *" value={formData.conta} onChange={(e) => handleChange('conta', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Ex: 12345" />
                  
                </div>
                <div className="w-20">
                  <Input label="Dígito *" value={formData.contaDigito} onChange={(e) => handleChange('contaDigito', e.target.value.slice(0, 2))} placeholder="Ex: 1" />
                  
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select label="Carteira *" value={formData.carteira} onChange={(e) => handleChange('carteira', e.target.value)} options={carteirasDisponiveis.map((c) => ({
              value: c,
              label: c
            }))} />
              

              <Input label="Convênio" value={formData.convenio} onChange={(e) => handleChange('convenio', e.target.value)} placeholder="Se aplicável" />
              

              <Input label="Código do Cedente" value={formData.codigoCedente} onChange={(e) => handleChange('codigoCedente', e.target.value)} placeholder="Se aplicável" />
              
            </div>
          </div>

          {/* Seção 3: Dados do Cedente */}
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <FileTextIcon className="w-4 h-4 text-teal-600" />
              Dados do Cedente (Quem Recebe)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input label="Razão Social / Nome *" value={formData.nomeCedente} onChange={(e) => handleChange('nomeCedente', e.target.value)} placeholder="Nome da Clínica" />
              

              <Input label="CNPJ / CPF *" value={formData.cnpjCedente} onChange={(e) => handleChange('cnpjCedente', formatarCNPJ(e.target.value))} placeholder="00.000.000/0001-00" />
              
            </div>
            <div className="mb-4">
              <Input label="Endereço Completo" value={formData.enderecoCedente} onChange={(e) => handleChange('enderecoCedente', e.target.value)} placeholder="Rua, Número, Bairro" />
              
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Cidade" value={formData.cidadeCedente} onChange={(e) => handleChange('cidadeCedente', e.target.value)} />
              

              <Select label="UF" value={formData.ufCedente} onChange={(e) => handleChange('ufCedente', e.target.value)} options={ESTADOS_BR} />
              

              <Input label="CEP" value={formData.cepCedente} onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              const formatted = val.length > 5 ? `${val.slice(0, 5)}-${val.slice(5, 8)}` : val;
              handleChange('cepCedente', formatted);
            }} placeholder="00000-000" maxLength={9} />
              
            </div>
          </div>

          {/* Seção 4: Multa e Juros */}
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <AlertCircleIcon className="w-4 h-4 text-teal-600" />
              Multa, Juros e Protesto
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Multa (%)" type="number" step="0.01" min="0" value={formData.multa} onChange={(e) => handleChange('multa', parseFloat(e.target.value) || 0)} />
              

              <Input label="Juros ao Mês (%)" type="number" step="0.01" min="0" value={formData.juros} onChange={(e) => handleChange('juros', parseFloat(e.target.value) || 0)} />
              

              <Input label="Dias para Protesto" type="number" min="0" value={formData.diasProtesto} onChange={(e) => handleChange('diasProtesto', parseInt(e.target.value) || 0)} placeholder="0 = Não protestar" />
              
            </div>
            <p className="text-xs text-gray-500 mt-2">
              * Valores padrão: Multa 2%, Juros 1% a.m. Deixe 0 para não cobrar.
            </p>
          </div>

          {/* ⭐ NOVA SEÇÃO: Integração API Itaú (Boletos Registrados) */}
          {formData.banco === '341' && <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border-2 border-blue-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <LandmarkIcon className="w-4 h-4 text-blue-600" />
                    Integração API Itaú (Boletos Registrados)
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Configure credenciais OAuth para emitir boletos registrados
                    via API oficial do Itaú
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.boletoRegistrado} onChange={(e) => handleChange('boletoRegistrado', e.target.checked)} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                

                  <span className="text-sm font-medium text-gray-700">
                    Ativar
                  </span>
                </label>
              </div>

              {formData.boletoRegistrado && <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Client ID (OAuth) *" value={formData.clientId} onChange={(e) => handleChange('clientId', e.target.value)} placeholder="Fornecido pelo Itaú" />
                

                    <Input label="Client Secret (OAuth) *" type="password" value={formData.clientSecret} onChange={(e) => handleChange('clientSecret', e.target.value)} placeholder="Fornecido pelo Itaú" />
                
                  </div>

                  <Input label="Itaú Key (Chave de Acesso) *" value={formData.itauKey} onChange={(e) => handleChange('itauKey', e.target.value)} placeholder="Chave de acesso à API" />
              

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Select label="Ambiente" value={formData.tipoAmbiente.toString()} onChange={(e) => handleChange('tipoAmbiente', parseInt(e.target.value))} options={[{
                value: '2',
                label: 'Homologação (Testes)'
              }, {
                value: '1',
                label: 'Produção'
              }]} />
                

                    <Select label="Tipo de Juros" value={formData.tipoJuros.toString()} onChange={(e) => handleChange('tipoJuros', parseInt(e.target.value))} options={[{
                value: '5',
                label: 'Isento'
              }, {
                value: '1',
                label: 'Valor diário (corridos)'
              }, {
                value: '2',
                label: '% diário (corridos)'
              }, {
                value: '3',
                label: '% mensal (corridos)'
              }, {
                value: '4',
                label: '% anual (corridos)'
              }, {
                value: '6',
                label: 'Valor diário (úteis)'
              }, {
                value: '7',
                label: '% diário (úteis)'
              }, {
                value: '8',
                label: '% mensal (úteis)'
              }, {
                value: '9',
                label: '% anual (úteis)'
              }]} />
                

                    <Select label="Tipo de Multa" value={formData.tipoMulta.toString()} onChange={(e) => handleChange('tipoMulta', parseInt(e.target.value))} options={[{
                value: '3',
                label: 'Isento'
              }, {
                value: '1',
                label: 'Valor fixo'
              }, {
                value: '2',
                label: 'Percentual'
              }]} />
                
                  </div>

                  {editingId && <Button variant="outline" onClick={handleTestarConexao} disabled={testando || !formData.clientId || !formData.clientSecret || !formData.itauKey} className="w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                
                      {testando ? <>
                          <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                          Testando conexão...
                        </> : <>
                          <CheckCircleIcon className="w-4 h-4 mr-2" />
                          Testar Conexão com API Itaú
                        </>}
                    </Button>}

                  <div className="bg-blue-100 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800">
                      <strong>ℹ️ Importante:</strong> Salve a configuração antes
                      de testar a conexão. As credenciais OAuth são necessárias
                      para registrar boletos via API oficial do Itaú.
                    </p>
                  </div>

                  {/* ⭐ Webhook URL */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      🔔 URL do Webhook (Confirmação Automática de Pagamento)
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      Configure esta URL no DevPortal do Itaú para receber
                      notificações automáticas quando um boleto for pago.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-1.5 rounded border border-gray-300 text-xs font-mono text-blue-800 break-all select-all">
                        https://clinic-api.sky9.com.br/api/boletos-itau/webhook
                      </code>
                      <button type="button" onClick={() => {
                  navigator.clipboard.writeText('https://clinic.sky9.com.br/api/boletos-itau/webhook');
                  success('Copiado', 'URL do webhook copiada!');
                }} className="px-2 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors whitespace-nowrap">
                    
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>}
            </div>}

          {/* Seção 5: Instruções */}
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <FileTextIcon className="w-4 h-4 text-teal-600" />
              Instruções Impressas no Boleto
            </h3>
            <div className="space-y-3">
              <Input label="Instrução 1" value={formData.instrucao1} onChange={(e) => handleChange('instrucao1', e.target.value)} maxLength={100} />
              

              <Input label="Instrução 2" value={formData.instrucao2} onChange={(e) => handleChange('instrucao2', e.target.value)} maxLength={100} />
              

              <Input label="Instrução 3" value={formData.instrucao3} onChange={(e) => handleChange('instrucao3', e.target.value)} maxLength={100} />
              
            </div>
          </div>
        </div>
      </Modal>
    </div>;
}