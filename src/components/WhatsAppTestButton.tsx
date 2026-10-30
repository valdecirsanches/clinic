import React, { useState } from 'react';
import { Button } from './ui/Button';
import { SendIcon } from 'lucide-react';
interface WhatsAppTestButtonProps {
  serverUrl: string;
  sessionName: string;
  phoneNumber: string;
  message: string;
}
/**
 * Botão de teste que envia mensagem diretamente via fetch
 * Igual ao código Python: requests.post(url, json=data)
 */
export function WhatsAppTestButton({
  serverUrl,
  sessionName,
  phoneNumber,
  message
}: WhatsAppTestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const handleSend = async () => {
    setLoading(true);
    setResult(null);
    try {
      const url = `${serverUrl}/api/sessions/${sessionName}/send-message`;
      console.log('🚀 Enviando mensagem de teste...');
      console.log('🔗 URL:', url);
      console.log('📞 Número:', phoneNumber);
      console.log('📝 Mensagem:', message);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: phoneNumber,
          message: message
        })
      });
      console.log('📡 Status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro:', errorText);
        setResult({
          success: false,
          error: errorText
        });
        return;
      }
      const data = await response.json();
      console.log('✅ Sucesso:', data);
      setResult(data);
    } catch (err: any) {
      console.error('❌ Erro na requisição:', err);
      setResult({
        success: false,
        error: err.message
      });
    } finally {
      setLoading(false);
    }
  };
  return <div className="space-y-4">
      <Button onClick={handleSend} disabled={loading} size="sm">
        <SendIcon className="w-4 h-4 mr-2" />
        {loading ? 'Enviando...' : 'Testar Envio Direto'}
      </Button>

      {result && <div className={`p-4 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        
          <pre className="text-xs overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>}
    </div>;
}