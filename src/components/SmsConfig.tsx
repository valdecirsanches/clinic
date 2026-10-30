import React, { useEffect, useState } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { PasswordInput } from './ui/PasswordInput';
import { Button } from './ui/Button';
import { SmartphoneIcon, SendIcon, WalletIcon } from 'lucide-react';
import { ConfigSms, CONFIG_SMS_PADRAO } from '../hooks/useSmsConfig';

interface SmsConfigProps {
  config: ConfigSms | null;
  onSave: (config: ConfigSms) => Promise<void> | void;
  onTestar: (telefone: string) => Promise<any>;
  onConsultarSaldo: () => Promise<{
    balance: number | null;
    currency: string;
    company: string | null;
  }>;
}

export function SmsConfig({
  config,
  onSave,
  onTestar,
  onConsultarSaldo
}: SmsConfigProps) {
  const [formData, setFormData] = useState<ConfigSms>(
    config || CONFIG_SMS_PADRAO
  );
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);
  const [saldo, setSaldo] = useState<string | null>(null);

  // Reflete a config vinda do servidor quando ela chega/troca de clínica
  useEffect(() => {
    if (config) {
      setFormData({
        ...CONFIG_SMS_PADRAO,
        ...config
      });
    }
  }, [config]);

  const credenciaisPreenchidas = Boolean(
    formData.credenciaisServidor ||
    formData.apiKey && formData.apiKey.trim() ||
    formData.bearerToken && formData.bearerToken.trim()
  );

  // Liga/desliga o canal e grava na hora, sem depender do botão de salvar
  const handleToggleAtivo = async () => {
    const novoValor = !formData.ativo;
    const atualizado = {
      ...formData,
      ativo: novoValor
    };
    setFormData(atualizado);
    setFeedback(null);
    setSalvando(true);
    try {
      await onSave(atualizado);
      setFeedback({
        tipo: 'sucesso',
        texto: novoValor ?
        'Canal SMS ativado. O serviço passa a ser cobrado por mensagem enviada.' :
        'Canal SMS desativado. Nenhuma mensagem sairá por SMS.'
      });
    } catch (err: any) {
      setFormData(formData);
      setFeedback({
        tipo: 'erro',
        texto: err?.message || 'Não foi possível alterar a ativação.'
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleSave = async () => {
    setFeedback(null);
    setSalvando(true);
    try {
      await onSave(formData);
      setFeedback({
        tipo: 'sucesso',
        texto: 'Configuração de SMS salva.'
      });
    } catch (err: any) {
      setFeedback({
        tipo: 'erro',
        texto: err?.message || 'Não foi possível salvar a configuração.'
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleTestar = async () => {
    if (!telefoneTeste.trim()) {
      setFeedback({
        tipo: 'erro',
        texto: 'Informe um número de celular para o teste.'
      });
      return;
    }
    setFeedback(null);
    setTestando(true);
    try {
      await onTestar(telefoneTeste);
      setFeedback({
        tipo: 'sucesso',
        texto: `SMS de teste enviado para ${telefoneTeste}.`
      });
    } catch (err: any) {
      setFeedback({
        tipo: 'erro',
        texto: err?.message || 'Falha ao enviar o SMS de teste.'
      });
    } finally {
      setTestando(false);
    }
  };

  const handleSaldo = async () => {
    setFeedback(null);
    setConsultando(true);
    try {
      const dados = await onConsultarSaldo();
      setSaldo(
        dados.balance === null ?
        'Saldo indisponível' :
        `${dados.currency} ${Number(dados.balance).toFixed(2)}`
      );
    } catch (err: any) {
      setSaldo(null);
      setFeedback({
        tipo: 'erro',
        texto: err?.message || 'Não foi possível consultar o saldo.'
      });
    } finally {
      setConsultando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ativação do canal — governa o envio e a cobrança na assinatura */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Canal SMS</h3>
            <p className="text-sm text-gray-500">
              {formData.ativo ?
              'Ativo: os avisos podem sair por SMS. O serviço é cobrado por mensagem enviada.' :
              'Desativado: nenhuma mensagem sai por SMS e o serviço não é cobrado.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
              formData.ativo ?
              'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-600'}`
              }>
              
              {formData.ativo ? 'Ativo' : 'Desativado'}
            </span>
            <Button
              variant={formData.ativo ? 'secondary' : 'primary'}
              onClick={handleToggleAtivo}
              disabled={salvando || !formData.ativo && !credenciaisPreenchidas}
              role="switch"
              aria-checked={formData.ativo}>
              
              {formData.ativo ? 'Desativar' : 'Ativar'}
            </Button>
          </div>
        </div>
        {!formData.ativo && !credenciaisPreenchidas &&
        <p className="mt-3 text-xs text-amber-700">
            Informe a SMSGo-key (ou o token) e salve antes de ativar o canal.
          </p>
        }
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
            <SmartphoneIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Credenciais SMSGo
            </h3>
            <p className="text-sm text-gray-500">
              Cole a chave do painel da SMSGo (Minha conta → API). O sistema usa
              essas credenciais apenas no servidor.
            </p>
          </div>
        </div>

        {formData.credenciaisServidor &&
        <p className="mt-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            As credenciais SMSGo estão fixas no servidor (
            <code className="font-mono">server/.env.local</code>) e valem para
            todas as clínicas. Os campos abaixo só são usados se o servidor
            ficar sem elas.
          </p>
        }

        <div className="mt-5 space-y-4">
          <PasswordInput
            label="SMSGo-key"
            value={formData.apiKey || ''}
            onChange={(e) =>
            setFormData({
              ...formData,
              apiKey: e.target.value
            })
            }
            placeholder="Chave da conta (prefixo test_ usa o modo de teste)" />
          

          <PasswordInput
            label="Token Bearer (opcional)"
            value={formData.bearerToken || ''}
            onChange={(e) =>
            setFormData({
              ...formData,
              bearerToken: e.target.value
            })
            }
            placeholder="Use apenas se preferir colar o token emitido no painel" />
          

          <Input
            label="URL da API"
            value={formData.baseUrl}
            onChange={(e) =>
            setFormData({
              ...formData,
              baseUrl: e.target.value
            })
            }
            placeholder="https://api.smsgo.com.br"
            helperText="Só altere se a SMSGo orientar outro endereço." />
          

          <Input
            label="Remetente (opcional)"
            value={formData.remetente || ''}
            onChange={(e) =>
            setFormData({
              ...formData,
              remetente: e.target.value
            })
            }
            placeholder="Nome curto aprovado para exibição" />
          

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">
              ℹ️ Como obter a chave
            </p>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Acesse sua conta em smsgo.com.br</li>
              <li>Vá em Minha conta → API</li>
              <li>Copie a chave e cole no campo SMSGo-key</li>
            </ol>
            <p className="text-xs text-blue-700 mt-2">
              Chaves com prefixo <strong>test_</strong> não debitam saldo nem
              entregam de verdade — ideais para validar a integração.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Comportamento do envio
        </h3>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="sms-ativo"
              checked={formData.ativo}
              onChange={(e) =>
              setFormData({
                ...formData,
                ativo: e.target.checked
              })
              }
              className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
            
            <label htmlFor="sms-ativo" className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">
                Habilitar envio por SMS
              </span>
              <span className="block text-gray-500">
                Enquanto desmarcado, nenhuma mensagem sai por SMS.
              </span>
            </label>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="sms-fallback"
              checked={formData.usarComoFallback}
              onChange={(e) =>
              setFormData({
                ...formData,
                usarComoFallback: e.target.checked
              })
              }
              className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
            
            <label htmlFor="sms-fallback" className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">
                Usar como alternativa ao WhatsApp
              </span>
              <span className="block text-gray-500">
                Quando o WhatsApp não estiver disponível, o aviso pode seguir por
                SMS.
              </span>
            </label>
          </div>

          <div>
            <label
              htmlFor="sms-template"
              className="block text-sm font-medium text-gray-700 mb-2">
              
              Mensagem padrão
            </label>
            <textarea
              id="sms-template"
              value={formData.mensagemTemplate || ''}
              onChange={(e) =>
              setFormData({
                ...formData,
                mensagemTemplate: e.target.value
              })
              }
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ola {nome}, sua consulta esta agendada para {data} as {horario}." />
            
            <p className="text-xs text-gray-500 mt-2">
              Variáveis: {'{nome}'}, {'{data}'}, {'{horario}'},{' '}
              {'{profissional}'}. Evite emojis e acentos para não dividir o SMS
              em várias partes.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Validar a integração
        </h3>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Input
                label="Celular para teste"
                value={telefoneTeste}
                onChange={(e) => setTelefoneTeste(e.target.value)}
                placeholder="(11) 99999-0000" />
              
            </div>
            <Button
              variant="secondary"
              onClick={handleTestar}
              disabled={testando || !credenciaisPreenchidas}>
              
              <SendIcon className="w-4 h-4 mr-2" />
              {testando ? 'Enviando...' : 'Enviar SMS de teste'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              onClick={handleSaldo}
              disabled={consultando || !credenciaisPreenchidas}>
              
              <WalletIcon className="w-4 h-4 mr-2" />
              {consultando ? 'Consultando...' : 'Consultar saldo'}
            </Button>
            {saldo &&
            <span className="text-sm font-medium text-gray-700">{saldo}</span>
            }
          </div>

          {!credenciaisPreenchidas &&
          <p className="text-xs text-amber-700">
              Informe e salve a SMSGo-key antes de testar.
            </p>
          }

          {feedback &&
          <p
            role="status"
            className={`text-sm ${feedback.tipo === 'sucesso' ? 'text-green-700' : 'text-red-600'}`}>
            
              {feedback.texto}
            </p>
          }
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Configurações de SMS'}
        </Button>
      </div>
    </div>);

}