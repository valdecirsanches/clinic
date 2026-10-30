import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageCircleIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

/**
 * Destino do botão "Falar conosco" dos templates da Meta.
 *
 * O botão do template é do tipo "Acessar o site" (URL) e não uma chamada de
 * voz — chamadas exigiriam a Calling API habilitada no número, o que faz a
 * Meta recusar a mensagem inteira (#138000). Esta página apenas encaminha o
 * paciente para o WhatsApp da clínica.
 */
export function FalarConoscoPublicaPage() {
  const { clinicaId } = useParams<{clinicaId: string;}>();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicaId) {
      setErro('Link incompleto. Entre em contato com a clínica pelos canais habituais.');
      return;
    }
    // O redirecionamento acontece no servidor, que conhece o telefone da clínica.
    window.location.replace(
      `${API_BASE_URL}/api/whatsapp-meta/falar/${encodeURIComponent(clinicaId)}`
    );
  }, [clinicaId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center">
        <MessageCircleIcon
          className="mx-auto h-10 w-10 text-emerald-600"
          aria-hidden="true" />
        
        <h1 className="mt-4 text-lg font-semibold text-gray-900">
          {erro ? 'Não foi possível abrir a conversa' : 'Abrindo o WhatsApp da clínica…'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {erro ?? 'Se nada acontecer em alguns segundos, verifique se o WhatsApp está instalado neste aparelho.'}
        </p>
      </div>
    </main>);

}