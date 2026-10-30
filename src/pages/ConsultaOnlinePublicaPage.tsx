// ⭐ Página PÚBLICA da consulta online (link enviado ao paciente)
//
// Sem login: o paciente abre o link recebido por WhatsApp/SMS e entra na sala de
// vídeo da sua consulta. Quando o link já traz o nome (?nome=...), ele entra
// direto, sem digitar nada — só confirma o acesso à câmera e ao microfone.
// O acesso é concedido por um token assinado no servidor, válido apenas para
// aquela sala.
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VideoIcon } from 'lucide-react';
import { SalaLiveKit } from '../components/prontuario/SalaLiveKit';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ConsultaOnlinePublicaPage() {
  const { clinicaId, consultaId } = useParams<{
    clinicaId: string;
    consultaId: string;
  }>();
  const [searchParams] = useSearchParams();
  const nomeDoLink = (searchParams.get('nome') || '').trim();

  const [nome, setNome] = useState(nomeDoLink);
  // Com o nome no link, o paciente entra direto: um passo a menos no celular.
  const [entrou, setEntrou] = useState(Boolean(nomeDoLink));

  if (entrou) {
    return (
      <main className="h-[100dvh] w-full overflow-hidden bg-gray-900">
        <SalaLiveKit
          clinicaId={clinicaId}
          consultaId={consultaId}
          nome={nome.trim() || 'Paciente'}
          role="attendee"
          onSair={() => setEntrou(false)} />
        
      </main>);

  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-lg bg-teal-50 p-2 text-teal-600">
            <VideoIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Consulta online
            </h1>
            <p className="text-sm text-gray-500">
              Confirme seu nome para entrar na sala.
            </p>
          </div>
        </div>

        <Input
          label="Seu nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome completo" />
        

        <Button
          className="mt-6 w-full"
          onClick={() => setEntrou(true)}
          disabled={!nome.trim()}>
          
          Entrar na consulta
        </Button>

        <p className="mt-4 text-xs text-gray-500">
          Ao entrar, o navegador vai pedir permissão para usar a câmera e o
          microfone. O profissional pode ainda não estar na sala — aguarde nela.
        </p>
      </div>
    </main>);

}