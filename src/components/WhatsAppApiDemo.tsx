import React, { useState, Component } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useWhatsAppApi } from '../hooks/useWhatsAppApi';
import { SendIcon, PhoneIcon, ImageIcon, MapPinIcon, UserIcon } from 'lucide-react';
interface WhatsAppApiDemoProps {
  serverUrl: string;
  sessionId: string;
  apiKey?: string;
}
/**
 * Componente de demonstração da API do WhatsApp
 * Mostra exemplos de uso de todas as funcionalidades
 */
export function WhatsAppApiDemo({
  serverUrl,
  sessionId,
  apiKey
}: WhatsAppApiDemoProps) {
  const api = useWhatsAppApi(serverUrl, apiKey);
  const [phoneNumber, setPhoneNumber] = useState('5511999999999');
  const [message, setMessage] = useState('Olá! Esta é uma mensagem de teste.');
  const [result, setResult] = useState<any>(null);
  // Enviar mensagem de texto
  const handleSendMessage = async () => {
    const response = await api.sendMessage(sessionId, {
      number: phoneNumber,
      message: message
    });
    setResult(response);
  };
  // Enviar imagem
  const handleSendImage = async () => {
    const response = await api.sendMedia(sessionId, {
      number: phoneNumber,
      mediaUrl: 'https://via.placeholder.com/500',
      caption: 'Imagem de teste',
      mediaType: 'image'
    });
    setResult(response);
  };
  // Enviar localização
  const handleSendLocation = async () => {
    const response = await api.sendLocation(sessionId, {
      number: phoneNumber,
      latitude: -23.5505,
      longitude: -46.6333,
      description: 'São Paulo, Brasil'
    });
    setResult(response);
  };
  // Enviar contato
  const handleSendContact = async () => {
    const response = await api.sendContact(sessionId, {
      number: phoneNumber,
      contactName: 'João Silva',
      contactPhone: '5511988887777'
    });
    setResult(response);
  };
  // Obter informações do contato
  const handleGetContactInfo = async () => {
    const response = await api.getContactInfo(sessionId, {
      number: phoneNumber
    });
    setResult(response);
  };
  return <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          🧪 Teste de API do WhatsApp
        </h3>

        <div className="space-y-4">
          <Input label="Número do WhatsApp" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="5511999999999" />
          

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mensagem
            </label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Digite sua mensagem..." />
            
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Button onClick={handleSendMessage} disabled={api.isLoading} size="sm">
              
              <SendIcon className="w-4 h-4 mr-2" />
              Enviar Texto
            </Button>

            <Button onClick={handleSendImage} disabled={api.isLoading} variant="secondary" size="sm">
              
              <ImageIcon className="w-4 h-4 mr-2" />
              Enviar Imagem
            </Button>

            <Button onClick={handleSendLocation} disabled={api.isLoading} variant="secondary" size="sm">
              
              <MapPinIcon className="w-4 h-4 mr-2" />
              Enviar Local
            </Button>

            <Button onClick={handleSendContact} disabled={api.isLoading} variant="secondary" size="sm">
              
              <UserIcon className="w-4 h-4 mr-2" />
              Enviar Contato
            </Button>

            <Button onClick={handleGetContactInfo} disabled={api.isLoading} variant="ghost" size="sm">
              
              <PhoneIcon className="w-4 h-4 mr-2" />
              Info Contato
            </Button>
          </div>

          {api.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{api.error}</p>
            </div>}

          {result && <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-semibold text-gray-700 mb-2">
                Resposta da API:
              </p>
              <pre className="text-xs text-gray-600 overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>}
        </div>
      </Card>
    </div>;
}