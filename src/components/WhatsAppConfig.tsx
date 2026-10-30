import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { PasswordInput } from './ui/PasswordInput';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { BuildingIcon, ServerIcon } from 'lucide-react';
import { WhatsAppProvider } from '../types/whatsapp';
interface WhatsAppConfigProps {
  config: {
    provider: WhatsAppProvider;
    metaApiKey?: string;
    metaPhoneNumberId?: string;
    serverUrl?: string;
    sessionName?: string;
    horasAntecedencia: number;
    mensagemTemplate: string;
    enviarConfirmacao: boolean;
    ativo?: boolean;
  };
  onSave: (config: any) => void;
}
export function WhatsAppConfig({
  config,
  onSave
}: WhatsAppConfigProps) {
  const [formData, setFormData] = useState(config);
  const handleSave = () => {
    const configToSave = {
      ...formData,
      ativo: true
    };
    console.log('💾 Salvando configuração:', configToSave);
    onSave(configToSave);
    setFormData(configToSave);
    window.dispatchEvent(new Event('whatsapp-config-updated'));
    console.log('📢 Evento whatsapp-config-updated disparado');
  };
  return <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Método de Integração
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setFormData({
          ...formData,
          provider: 'meta'
        })} className={`p-4 border-2 rounded-xl transition-all ${formData.provider === 'meta' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
            
            <BuildingIcon className={`w-8 h-8 mx-auto mb-2 ${formData.provider === 'meta' ? 'text-teal-600' : 'text-gray-400'}`} />
            
            <p className="font-semibold text-gray-900">Meta (EDSSolution)</p>
            <p className="text-xs text-gray-600 mt-1">
              API Oficial do WhatsApp
            </p>
          </button>

          <button onClick={() => setFormData({
          ...formData,
          provider: 'session'
        })} className={`p-4 border-2 rounded-xl transition-all ${formData.provider === 'session' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
            
            <ServerIcon className={`w-8 h-8 mx-auto mb-2 ${formData.provider === 'session' ? 'text-teal-600' : 'text-gray-400'}`} />
            
            <p className="font-semibold text-gray-900">Sessão Própria</p>
            <p className="text-xs text-gray-600 mt-1">
              Servidor Dedicado + QR Code
            </p>
          </button>
        </div>
      </Card>

      {formData.provider === 'meta' && <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Configuração Meta (EDSSolution)
          </h3>

          <div className="space-y-4">
            <PasswordInput label="API Key" value={formData.metaApiKey || ''} onChange={(e) => setFormData({
          ...formData,
          metaApiKey: e.target.value
        })} placeholder="Sua chave de API do Meta" />
          

            <Input label="Phone Number ID" value={formData.metaPhoneNumberId || ''} onChange={(e) => setFormData({
          ...formData,
          metaPhoneNumberId: e.target.value
        })} placeholder="ID do número de telefone" />
          

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">
                ℹ️ Como obter as credenciais?
              </p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Acesse o Meta Business Manager</li>
                <li>Crie um aplicativo WhatsApp Business</li>
                <li>Copie a API Key e Phone Number ID</li>
              </ol>
            </div>
          </div>
        </Card>}

      {formData.provider === 'session' && <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Informações sobre Sessão Própria
          </h3>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">
              ℹ️ Gerenciamento da Sessão
            </p>
            <p className="text-sm text-blue-700 mb-3">
              A URL do servidor e nome da sessão são configurados na seção{' '}
              <strong>"Configuração do Servidor"</strong> acima.
            </p>
            <p className="text-sm text-blue-700">
              Use esta seção apenas para configurar as opções de envio de
              mensagens (horário de antecedência, template, etc).
            </p>
          </div>
        </Card>}

      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Configurações de Envio
        </h3>

        <div className="space-y-4">
          <Input label="Horas de Antecedência" type="number" value={formData.horasAntecedencia} onChange={(e) => setFormData({
          ...formData,
          horasAntecedencia: parseInt(e.target.value)
        })} min={1} max={72} />
          

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mensagem Template
            </label>
            <textarea value={formData.mensagemTemplate} onChange={(e) => setFormData({
            ...formData,
            mensagemTemplate: e.target.value
          })} rows={6} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Olá {nome}, você tem uma consulta agendada para {data} às {horario}." />
            
            <p className="text-xs text-gray-500 mt-2">
              Variáveis disponíveis: {'{nome}'}, {'{data}'}, {'{horario}'},{' '}
              {'{profissional}'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="enviarConfirmacao" checked={formData.enviarConfirmacao} onChange={(e) => setFormData({
            ...formData,
            enviarConfirmacao: e.target.checked
          })} className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
            
            <label htmlFor="enviarConfirmacao" className="text-sm text-gray-700">
              
              Solicitar confirmação de presença
            </label>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          Salvar Configurações
        </Button>
      </div>
    </div>;
}