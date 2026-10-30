import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, ArrowLeftIcon, MessageCircleIcon } from 'lucide-react';
import { Input } from './ui/Input';
import { PasswordInput } from './ui/PasswordInput';
import { Button } from './ui/Button';
import type { DesafioLogin, ResultadoLogin } from '../types/login';

export interface LoginFormProps {
  onLogin: (email: string, senha: string) => Promise<ResultadoLogin>;
  onConfirmarCodigo: (desafioId: string, codigo: string) => Promise<ResultadoLogin>;
  onReenviarCodigo: (desafioId: string) => Promise<{success: boolean;error?: string;destino?: string;reenvioEmSeg?: number;}>;
}

export function LoginForm({ onLogin, onConfirmarCodigo, onReenviarCodigo }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);
  const [desafio, setDesafio] = useState<DesafioLogin | null>(null);
  const [codigo, setCodigo] = useState('');
  const [esperaReenvio, setEsperaReenvio] = useState(0);
  const codigoRef = useRef<HTMLInputElement>(null);

  // Contagem para liberar o "Reenviar código"
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const t = window.setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [esperaReenvio]);

  useEffect(() => {
    if (desafio) codigoRef.current?.focus();
  }, [desafio]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setAviso('');
    setLoading(true);
    try {
      const resultado = await onLogin(email, senha);
      if (resultado.desafio) {
        setDesafio(resultado.desafio);
        setCodigo('');
        setEsperaReenvio(resultado.desafio.reenvioEmSeg || 60);
      } else if (!resultado.success) {
        setErro(resultado.error || 'Email ou senha incorretos');
      }
    } catch {
      setErro('Erro ao tentar fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desafio) return;
    setErro('');
    setAviso('');
    setLoading(true);
    try {
      const resultado = await onConfirmarCodigo(desafio.id, codigo);
      if (!resultado.success) {
        setErro(resultado.error || 'Código incorreto.');
        setCodigo('');
        codigoRef.current?.focus();
        // Código expirado ou tentativas esgotadas: volta para e-mail e senha
        if (/expirou|Entre de novo/i.test(resultado.error || '')) setDesafio(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const reenviar = async () => {
    if (!desafio) return;
    setErro('');
    setAviso('');
    const r = await onReenviarCodigo(desafio.id);
    if (r.success) {
      setAviso(`Enviamos um código novo para ${r.destino || desafio.destino}.`);
      setEsperaReenvio(r.reenvioEmSeg || 60);
      setCodigo('');
      codigoRef.current?.focus();
    } else {
      setErro(r.error || 'Não foi possível reenviar o código.');
      if (/expirou/i.test(r.error || '')) setDesafio(null);
    }
  };

  const mensagemErro = erro &&
  <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm text-red-700">{erro}</p>
    </div>;


  if (desafio) {
    return (
      <form onSubmit={confirmar} className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
            <MessageCircleIcon className="w-5 h-5 text-green-600" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Confirme que é você</p>
            <p className="text-sm text-gray-600">
              Enviamos um código de 6 dígitos pelo WhatsApp para <strong className="text-gray-900">{desafio.destino}</strong>.
            </p>
          </div>
        </div>

        {mensagemErro}
        {aviso && <p className="text-sm text-green-700" role="status">{aviso}</p>}

        <div>
          <label htmlFor="codigo-2fa" className="block text-sm font-medium text-gray-700 mb-1">
            Código
          </label>
          <input
            ref={codigoRef}
            id="codigo-2fa"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={loading}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
          
          <p className="text-xs text-gray-500 mt-1">O código vale por {Math.round(desafio.expiraEmSeg / 60)} minutos.</p>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading || codigo.length !== 6}>
          {loading ? 'Conferindo...' : 'Entrar'}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setDesafio(null);
              setErro('');
              setAviso('');
            }}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
            
            <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Voltar
          </button>
          <button
            type="button"
            onClick={reenviar}
            disabled={esperaReenvio > 0 || loading}
            className="text-teal-700 hover:text-teal-800 disabled:text-gray-400">
            
            {esperaReenvio > 0 ? `Reenviar em ${esperaReenvio}s` : 'Reenviar código'}
          </button>
        </div>
      </form>);

  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {mensagemErro}

      <Input label="Email" type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required disabled={loading} />

      <PasswordInput label="Senha" name="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" required disabled={loading} />

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>);

}