import React, { useEffect, useState } from 'react';
import { AlertCircleIcon, CheckCircleIcon, LoaderIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react';
import { PasswordInput } from './ui/PasswordInput';
import { Button } from './ui/Button';
import { API_BASE_URL } from '../config/api';

type Etapa = 'inicio' | 'codigo';

function lerSessao(): {usuarioId: string;clinicaId: string;} {
  try {
    const s = JSON.parse(localStorage.getItem('sessao') || 'null');
    return { usuarioId: s?.usuario?.id || '', clinicaId: s?.clinicaAtual?.id || '' };
  } catch {
    return { usuarioId: '', clinicaId: '' };
  }
}

async function postar(caminho: string, corpo: Record<string, unknown>) {
  const r = await fetch(`${API_BASE_URL}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados?.error || `Erro ${r.status}`);
  return dados;
}

/**
 * O próprio usuário liga ou desliga a verificação em duas etapas.
 * Para ligar, o celular recebe um código no WhatsApp e só passa a valer
 * depois de confirmado — um número errado nunca tranca o login.
 */
export function DuasEtapasConfig() {
  const { usuarioId, clinicaId } = lerSessao();
  const [carregando, setCarregando] = useState(true);
  const [ativo, setAtivo] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [etapa, setEtapa] = useState<Etapa>('inicio');
  const [desafioId, setDesafioId] = useState('');
  const [destino, setDestino] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (!usuarioId) return;
    fetch(`${API_BASE_URL}/api/usuarios/${encodeURIComponent(usuarioId)}/dois-fatores`).
    then((r) => r.ok ? r.json() : Promise.reject(new Error(`Erro ${r.status}`))).
    then((d) => {
      setAtivo(Boolean(d.ativo));
      setTelefone(d.telefone || '');
    }).
    catch(() => setErro('Não foi possível consultar a situação. O servidor pode estar desatualizado.')).
    finally(() => setCarregando(false));
  }, [usuarioId]);

  const executar = async (acao: () => Promise<void>) => {
    setErro('');
    setAviso('');
    setEnviando(true);
    try {
      await acao();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const enviarCodigo = () =>
  executar(async () => {
    const d = await postar(`/api/usuarios/${usuarioId}/dois-fatores/codigo`, { senhaAtual, telefone });
    setDesafioId(d.desafioId);
    setDestino(d.destino);
    setCodigo('');
    setEtapa('codigo');
  });

  const confirmar = () =>
  executar(async () => {
    await postar(`/api/usuarios/${usuarioId}/dois-fatores/confirmar`, {
      desafioId,
      codigo,
      telefone,
      atorClinicaId: clinicaId
    });
    setAtivo(true);
    setEtapa('inicio');
    setSenhaAtual('');
    setAviso('Verificação em duas etapas ativada. No próximo login, o código chegará no seu WhatsApp.');
  });

  const desativar = () =>
  executar(async () => {
    await postar(`/api/usuarios/${usuarioId}/dois-fatores/desativar`, { senhaAtual, atorClinicaId: clinicaId });
    setAtivo(false);
    setSenhaAtual('');
    setAviso('Verificação em duas etapas desativada. O login volta a pedir só e-mail e senha.');
  });

  if (carregando) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
        <LoaderIcon className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando...
      </p>);

  }

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 p-3 rounded-lg border ${ativo ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <ShieldCheckIcon className={`w-5 h-5 mt-0.5 shrink-0 ${ativo ? 'text-green-600' : 'text-gray-400'}`} aria-hidden="true" />
        <div className="text-sm">
          <p className="font-medium text-gray-900">{ativo ? 'Ativada' : 'Desativada'}</p>
          <p className="text-gray-600">
            {ativo ?
            `Depois da senha, um código de 6 dígitos é enviado ao WhatsApp ${telefone || 'cadastrado'}.` :
            'Ao ativar, além da senha, o login pede um código enviado ao seu WhatsApp.'}
          </p>
        </div>
      </div>

      {erro &&
      <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      }
      {aviso &&
      <div role="status" className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />
          <p className="text-sm text-green-800">{aviso}</p>
        </div>
      }

      {etapa === 'codigo' ?
      <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Enviamos um código para o WhatsApp <strong>{destino}</strong>. Digite-o para confirmar o número.
          </p>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Código</span>
            <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-lg tracking-[0.4em] tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="000000" />
          
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmar} disabled={codigo.length !== 6 || enviando}>
              {enviando ? 'Confirmando...' : 'Confirmar e ativar'}
            </Button>
            <Button variant="ghost" onClick={() => setEtapa('inicio')} disabled={enviando}>
              Voltar
            </Button>
          </div>
        </div> :

      <div className="space-y-3">
          {!ativo &&
        <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                <SmartphoneIcon className="w-4 h-4 text-gray-400" aria-hidden="true" /> Celular com WhatsApp
              </span>
              <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            placeholder="(11) 99999-0000"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          
            </label>
        }
          <PasswordInput
          label="Senha atual (para confirmar que é você)"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          placeholder="Digite sua senha atual" />
        
          {ativo ?
        <Button variant="ghost" onClick={desativar} disabled={!senhaAtual || enviando} className="text-red-700">
              {enviando ? 'Desativando...' : 'Desativar verificação em duas etapas'}
            </Button> :

        <Button onClick={enviarCodigo} disabled={!senhaAtual || telefone.replace(/\D/g, '').length < 10 || enviando}>
              {enviando ? 'Enviando código...' : 'Enviar código pelo WhatsApp'}
            </Button>
        }
        </div>
      }
    </div>);

}