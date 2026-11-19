import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleIcon,
  KeyRoundIcon,
  Loader2Icon,
  MailIcon,
  PartyPopperIcon,
  SmartphoneIcon,
  UserIcon,
  XIcon } from
'lucide-react';
import { PasswordInput } from './ui/PasswordInput';
import { API_BASE_URL } from '../config/api';
import type { ResultadoLogin } from '../types/login';

// ==================== CRIAR CONTA — PASSO A PASSO ====================
// Uma pergunta por vez, com o progresso no topo:
//   1. Sua empresa (CNPJ — os dados da Receita vêm sozinhos)
//   2. Sobre você (nome, e-mail e celular)
//   3. Confirmar e-mail (código de 6 dígitos)
//   4. Confirmar celular (código pelo WhatsApp ou SMS)
//   5. Senha
//   6. Pronto — entra direto no sistema
// As etapas 3 e 4 seguem o que o servidor pede (GET /api/auth/cadastro/config,
// definido no .env.local). A conta só é criada no fim, com os comprovantes.

interface CadastroUsuarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Entra no sistema com a conta recém-criada (mesmo login da tela). */
  onEntrar?: (email: string, senha: string) => Promise<ResultadoLogin | void>;
  /** @deprecated a conta agora é criada pelo próprio assistente */
  onCadastrar?: (...args: any[]) => void;
  /** @deprecated o CNPJ agora é conferido no servidor */
  onBuscarOperadora?: (...args: any[]) => any;
}

type Etapa = 'empresa' | 'voce' | 'email' | 'celular' | 'senha' | 'pronto';

interface Config {
  confirmarEmail: boolean;
  confirmarCelular: boolean;
  canalCelular: 'whatsapp' | 'sms' | 'auto';
}

interface Envio {
  id: string;
  via: string;
  destino: string;
  reenvioEmSeg: number;
}

const ROTULOS: Record<Etapa, string> = {
  empresa: 'Empresa',
  voce: 'Seus dados',
  email: 'E-mail',
  celular: 'Celular',
  senha: 'Senha',
  pronto: 'Pronto'
};

// ---------- Máscaras ----------
const digitos = (v: string) => v.replace(/\D/g, '');
function mascaraCnpj(v: string) {
  const d = digitos(v).slice(0, 14);
  return d.
  replace(/^(\d{2})(\d)/, '$1.$2').
  replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').
  replace(/\.(\d{3})(\d)/, '.$1/$2').
  replace(/(\d{4})(\d)/, '$1-$2');
}
function mascaraCelular(v: string) {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const celularValido = (c: string) => /^\d{2}9\d{8}$/.test(digitos(c));
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] || '';

async function chamar(caminho: string, corpo?: unknown) {
  const r = await fetch(`${API_BASE_URL}/api/auth/${caminho}`, corpo === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e: any = new Error(dados.error || 'Algo não deu certo. Tente de novo.');
    e.codigo = dados.codigo || dados.code;
    throw e;
  }
  return dados;
}

// ---------- Peças de tela ----------
function Campo({
  rotulo,
  dica,
  erro,
  children



}: {rotulo: string;dica?: string;erro?: string;children: React.ReactNode;}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-800">{rotulo}</span>
      {children}
      {erro ?
      <span className="mt-1 block text-sm text-red-600">{erro}</span> :
      dica ?
      <span className="mt-1 block text-xs text-gray-500">{dica}</span> :
      null}
    </label>);

}

const classeInput =
'w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200';

function CodigoInput({
  valor,
  onChange,
  onCompleto,
  desativado




}: {valor: string;onChange: (v: string) => void;onCompleto: (v: string) => void;desativado?: boolean;}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="relative">
      <input
        ref={ref}
        value={valor}
        disabled={desativado}
        onChange={(e) => {
          const v = digitos(e.target.value).slice(0, 6);
          onChange(v);
          if (v.length === 6) onCompleto(v);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Código de 6 dígitos"
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        data-testid="codigo-input" />

      <div className="pointer-events-none flex justify-center gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) =>
        <div
          key={i}
          className={`flex h-14 w-11 items-center justify-center rounded-xl border-2 text-2xl font-semibold text-gray-900 transition-colors sm:w-12 ${
          i === valor.length && !desativado ? 'border-teal-500 bg-teal-50' : valor[i] ? 'border-teal-300 bg-white' : 'border-gray-200 bg-gray-50'}`
          }>

            {valor[i] || ''}
          </div>
        )}
      </div>
    </div>);

}

function useContagem(segundos: number, chave: unknown) {
  const [resta, setResta] = useState(segundos);
  useEffect(() => {
    setResta(segundos);
    if (!segundos) return;
    const t = window.setInterval(() => setResta((r) => r > 0 ? r - 1 : 0), 1000);
    return () => window.clearInterval(t);
  }, [segundos, chave]);
  return resta;
}

// ==================== COMPONENTE ====================
export function CadastroUsuarioModal({ isOpen, onClose, onEntrar }: CadastroUsuarioModalProps) {
  const [config, setConfig] = useState<Config>({ confirmarEmail: true, confirmarCelular: true, canalCelular: 'auto' });
  const [etapa, setEtapa] = useState<Etapa>('empresa');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [querSair, setQuerSair] = useState(false);

  // Empresa
  const [cnpj, setCnpj] = useState('');
  const [busca, setBusca] = useState<'nada' | 'buscando' | 'nova' | 'existente' | 'bloqueada'>('nada');
  const [operadoraExistente, setOperadoraExistente] = useState<{id: string;nome: string;razaoSocial?: string;} | null>(null);
  const [empresa, setEmpresa] = useState({ nome: '', razaoSocial: '', telefone: '', email: '', endereco: '' });
  const [veioDaReceita, setVeioDaReceita] = useState(false);

  // Você
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [celular, setCelular] = useState('');
  const [tocou, setTocou] = useState<Record<string, boolean>>({});

  // Códigos
  const [envioEmail, setEnvioEmail] = useState<Envio | null>(null);
  const [envioCelular, setEnvioCelular] = useState<Envio | null>(null);
  const [codigo, setCodigo] = useState('');
  const [comprovanteEmail, setComprovanteEmail] = useState('');
  const [comprovanteCelular, setComprovanteCelular] = useState('');
  const [emailConfirmado, setEmailConfirmado] = useState('');
  const [celularConfirmado, setCelularConfirmado] = useState('');

  // Senha
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [entrando, setEntrando] = useState(false);

  const envioAtual = etapa === 'email' ? envioEmail : etapa === 'celular' ? envioCelular : null;
  const resta = useContagem(envioAtual?.reenvioEmSeg || 0, envioAtual);

  const etapas = useMemo<Etapa[]>(
    () => ['empresa', 'voce', ...(config.confirmarEmail ? ['email' as Etapa] : []), ...(config.confirmarCelular ? ['celular' as Etapa] : []), 'senha', 'pronto'],
    [config]
  );
  const indice = etapas.indexOf(etapa);

  useEffect(() => {
    if (!isOpen) return;
    chamar('cadastro/config').then((c) => setConfig(c)).catch(() => {/* usa o padrão */});
  }, [isOpen]);

  // Cada etapa começa sem mensagens antigas
  useEffect(() => {
    setErro('');
    setAviso('');
    setCodigo('');
  }, [etapa]);

  const limparTudo = () => {
    setEtapa('empresa');
    setCnpj('');
    setBusca('nada');
    setOperadoraExistente(null);
    setEmpresa({ nome: '', razaoSocial: '', telefone: '', email: '', endereco: '' });
    setVeioDaReceita(false);
    setNome('');
    setEmail('');
    setCelular('');
    setTocou({});
    setEnvioEmail(null);
    setEnvioCelular(null);
    setComprovanteEmail('');
    setComprovanteCelular('');
    setEmailConfirmado('');
    setCelularConfirmado('');
    setSenha('');
    setSenha2('');
    setErro('');
    setAviso('');
    setQuerSair(false);
  };

  const fechar = () => {
    limparTudo();
    onClose();
  };
  const pedirParaFechar = () => {
    if (etapa === 'pronto' || etapa === 'empresa' && !cnpj) return fechar();
    setQuerSair(true);
  };

  const irPara = (e: Etapa) => setEtapa(e);
  const proxima = () => irPara(etapas[Math.min(indice + 1, etapas.length - 1)]);
  // Voltar pula as confirmações já feitas (o código delas não vale mais)
  const voltar = () => {
    let i = indice - 1;
    while (i > 0 && (etapas[i] === 'email' && comprovanteEmail || etapas[i] === 'celular' && comprovanteCelular)) i--;
    irPara(etapas[Math.max(i, 0)]);
  };

  // ---------- Empresa ----------
  const buscarCnpj = async (valor: string) => {
    setErro('');
    if (digitos(valor).length !== 14) return;
    setBusca('buscando');
    try {
      const d = await chamar(`cadastro/cnpj/${digitos(valor)}`);
      if (d.existe && d.temUsuarios) {
        setBusca('bloqueada');
        return;
      }
      if (d.existe && d.operadora) {
        setOperadoraExistente(d.operadora);
        setBusca('existente');
        return;
      }
      setOperadoraExistente(null);
      const r = d.receita;
      if (r) {
        setEmpresa({
          nome: r.nomeFantasia || r.razaoSocial || '',
          razaoSocial: r.razaoSocial || '',
          telefone: r.telefone || '',
          email: r.email || '',
          endereco: r.endereco || ''
        });
        setVeioDaReceita(Boolean(r.razaoSocial));
        if (r.email && !email) setEmail(r.email);
      } else {
        setVeioDaReceita(false);
      }
      setBusca('nova');
    } catch (e: any) {
      setBusca('nada');
      setErro(e.message);
    }
  };

  const podeSeguirEmpresa =
  busca === 'existente' || busca === 'nova' && empresa.nome.trim().length > 1 && empresa.razaoSocial.trim().length > 1;

  // ---------- Você ----------
  const errosVoce = {
    nome: nome.trim().split(/\s+/).length < 2 ? 'Escreva o nome e o sobrenome.' : '',
    email: !emailValido(email) ? 'Confira o e-mail (ex.: nome@clinica.com.br).' : '',
    celular: config.confirmarCelular && !celularValido(celular) ? 'Informe o celular com DDD, ex.: (11) 98765-4321.' : ''
  };
  const podeSeguirVoce = !errosVoce.nome && !errosVoce.email && !errosVoce.celular;

  const enviarCodigo = async (canal: 'email' | 'celular', reenviar = false, preferido?: 'sms' | 'whatsapp') => {
    setErro('');
    setAviso('');
    setOcupado(true);
    try {
      const anterior = canal === 'email' ? envioEmail : envioCelular;
      const r: Envio = await chamar('cadastro/codigo', {
        canal,
        destino: canal === 'email' ? email : celular,
        id: reenviar ? anterior?.id : undefined,
        preferido
      });
      if (canal === 'email') setEnvioEmail(r);else
      setEnvioCelular(r);
      setCodigo('');
      if (reenviar) setAviso('Pronto! Enviamos um código novo.');
      return true;
    } catch (e: any) {
      setErro(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const seguirDeVoce = async () => {
    setTocou({ nome: true, email: true, celular: true });
    if (!podeSeguirVoce) return;
    // Mudou o e-mail/celular depois de confirmar: precisa confirmar de novo
    if (emailConfirmado && emailConfirmado !== email.trim().toLowerCase()) {
      setComprovanteEmail('');
      setEmailConfirmado('');
      setEnvioEmail(null);
    }
    if (celularConfirmado && celularConfirmado !== digitos(celular)) {
      setComprovanteCelular('');
      setCelularConfirmado('');
      setEnvioCelular(null);
    }
    if (config.confirmarEmail && !comprovanteEmail) {
      if (await enviarCodigo('email')) irPara('email');
      return;
    }
    if (config.confirmarCelular && !comprovanteCelular) {
      if (await enviarCodigo('celular')) irPara('celular');
      return;
    }
    irPara('senha');
  };

  // ---------- Códigos ----------
  const confirmar = async (canal: 'email' | 'celular', valor: string) => {
    const envio = canal === 'email' ? envioEmail : envioCelular;
    if (!envio || valor.length !== 6) return;
    setErro('');
    setOcupado(true);
    try {
      const r = await chamar('cadastro/confirmar', { id: envio.id, codigo: valor });
      if (canal === 'email') {
        setComprovanteEmail(r.comprovante);
        setEmailConfirmado(email.trim().toLowerCase());
        if (config.confirmarCelular && !comprovanteCelular) {
          if (await enviarCodigo('celular')) irPara('celular');
        } else {
          irPara('senha');
        }
      } else {
        setComprovanteCelular(r.comprovante);
        setCelularConfirmado(digitos(celular));
        irPara('senha');
      }
    } catch (e: any) {
      setErro(e.message);
      setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  // ---------- Senha ----------
  const regrasSenha = [
  { ok: senha.length >= 8, texto: 'Pelo menos 8 caracteres' },
  { ok: /[A-Za-z]/.test(senha) && /\d/.test(senha), texto: 'Letras e números' },
  { ok: senha.length > 0 && senha === senha2, texto: 'As duas senhas iguais' }];

  const senhaOk = regrasSenha.every((r) => r.ok);

  const criarConta = async () => {
    if (!senhaOk) return;
    setErro('');
    setOcupado(true);
    try {
      const novaOperadora = busca === 'nova' ? { ...empresa, cnpj: digitos(cnpj), ativa: true } : null;
      await chamar('cadastro', {
        operadora: novaOperadora,
        cnpj: digitos(cnpj),
        operadoraExistenteId: operadoraExistente?.id || null,
        usuario: { nome: nome.trim(), email: email.trim(), senha, celular: digitos(celular) },
        comprovanteEmail,
        comprovanteCelular
      });
      irPara('pronto');
    } catch (e: any) {
      if (e.codigo === 'CONFIRMACAO_PENDENTE') {
        // O comprovante venceu (passou de 1 hora): confirma de novo
        setErro(e.message);
        if (/e-mail/i.test(e.message)) {
          setComprovanteEmail('');
          setEmailConfirmado('');
        } else {
          setComprovanteCelular('');
          setCelularConfirmado('');
        }
      } else if (e.codigo === 'EMAIL_DUPLICADO') {
        setErro('Já existe uma conta com este e-mail. Volte e use outro, ou entre com ele na tela anterior.');
      } else {
        setErro(e.message);
      }
    } finally {
      setOcupado(false);
    }
  };

  const entrar = async () => {
    if (!onEntrar) return fechar();
    setEntrando(true);
    try {
      try {
        sessionStorage.setItem('easyclin-conta-nova', '1');
      } catch {/* sem storage */}
      const r = await onEntrar(email.trim(), senha);
      if (r && (r as ResultadoLogin).success === false && !(r as any).desafio) {
        setErro((r as ResultadoLogin).error || 'Não foi possível entrar. Use seu e-mail e senha na tela de login.');
        setEntrando(false);
        return;
      }
      limparTudo();
      onClose();
    } catch {
      setEntrando(false);
      setErro('Não foi possível entrar agora. Use seu e-mail e senha na tela de login.');
    }
  };

  if (!isOpen) return null;

  // ---------- Botão principal de cada etapa ----------
  const principal: {texto: string;acao: () => void;pode: boolean;} | null =
  etapa === 'empresa' ? { texto: 'Continuar', acao: proxima, pode: podeSeguirEmpresa } :
  etapa === 'voce' ?
  {
    texto: config.confirmarEmail && !comprovanteEmail ? 'Enviar código para meu e-mail' : config.confirmarCelular && !comprovanteCelular ? 'Enviar código para meu celular' : 'Continuar',
    acao: seguirDeVoce,
    pode: true
  } :
  etapa === 'email' ? { texto: 'Confirmar e-mail', acao: () => confirmar('email', codigo), pode: codigo.length === 6 } :
  etapa === 'celular' ? { texto: 'Confirmar celular', acao: () => confirmar('celular', codigo), pode: codigo.length === 6 } :
  etapa === 'senha' ? { texto: 'Criar minha conta', acao: criarConta, pode: senhaOk } :
  null;

  const aoEnviarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    if (principal && principal.pode && !ocupado) principal.acao();
  };

  const viaCelular = envioCelular?.via === 'sms' ? 'SMS' : 'WhatsApp';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cadastro-titulo">
      <form
        onSubmit={aoEnviarFormulario}
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        data-testid="cadastro-assistente">

        {/* Topo: progresso */}
        <div className="border-b border-gray-100 px-6 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
              {etapa === 'pronto' ? 'Conta criada' : `Passo ${indice + 1} de ${etapas.length - 1}`}
            </p>
            <button type="button" onClick={pedirParaFechar} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {etapas.slice(0, -1).map((e, i) =>
            <div key={e} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${i < indice || etapa === 'pronto' ? 'bg-teal-500' : i === indice ? 'bg-teal-300' : 'bg-gray-200'}`} />
                <p className={`mt-1 hidden text-[11px] sm:block ${i === indice ? 'font-medium text-gray-800' : 'text-gray-400'}`}>{ROTULOS[e]}</p>
              </div>
            )}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {etapa === 'empresa' &&
          <div className="space-y-5">
              <Cabecalho icone={<BuildingIcon className="h-6 w-6" />} titulo="Vamos começar pela sua empresa" texto="Digite o CNPJ da clínica ou da empresa responsável. A gente busca os dados para você." />
              <Campo rotulo="CNPJ" dica="Só os números já bastam.">
                <div className="relative">
                  <input
                  autoFocus
                  value={cnpj}
                  onChange={(e) => {
                    const v = mascaraCnpj(e.target.value);
                    setCnpj(v);
                    setBusca('nada');
                    if (digitos(v).length === 14) buscarCnpj(v);
                  }}
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  className={classeInput}
                  data-testid="cnpj" />

                  {busca === 'buscando' && <Loader2Icon className="absolute right-3 top-3.5 h-5 w-5 animate-spin text-teal-600" />}
                </div>
              </Campo>

              {busca === 'existente' && operadoraExistente &&
            <Destaque cor="green" icone={<CheckCircle2Icon className="h-5 w-5" />}>
                  Encontramos <strong>{operadoraExistente.nome}</strong>. Você será o primeiro administrador dela.
                </Destaque>
            }
              {busca === 'bloqueada' &&
            <Destaque cor="amber">
                  Esta empresa já usa o EasyClin. Peça ao administrador da sua equipe para criar o seu acesso em <strong>Administração › Usuários</strong>.
                </Destaque>
            }
              {busca === 'nova' &&
            <div className="space-y-4">
                  {veioDaReceita ?
              <Destaque cor="teal" icone={<CheckCircle2Icon className="h-5 w-5" />}>
                      Preenchemos com os dados da Receita Federal. É só conferir.
                    </Destaque> :

              <p className="text-sm text-gray-600">Primeira vez por aqui! Conte um pouco sobre a empresa:</p>
              }
                  <Campo rotulo="Nome da clínica (como os pacientes conhecem)">
                    <input value={empresa.nome} onChange={(e) => setEmpresa({ ...empresa, nome: e.target.value })} placeholder="Ex.: Clínica Bem-Estar" className={classeInput} data-testid="empresa-nome" />
                  </Campo>
                  <Campo rotulo="Razão social">
                    <input value={empresa.razaoSocial} onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })} placeholder="Como está no CNPJ" className={classeInput} data-testid="empresa-razao" />
                  </Campo>
                </div>
            }
            </div>
          }

          {etapa === 'voce' &&
          <div className="space-y-5">
              <Cabecalho icone={<UserIcon className="h-6 w-6" />} titulo="Agora, sobre você" texto="Você será o administrador da conta. Vamos confirmar seu e-mail e celular para proteger o acesso." />
              <Campo rotulo="Seu nome completo" erro={tocou.nome ? errosVoce.nome : ''}>
                <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onBlur={() => setTocou((t) => ({ ...t, nome: true }))} placeholder="Ex.: Maria da Silva" autoComplete="name" className={classeInput} data-testid="nome" />
              </Campo>
              <Campo rotulo="Seu e-mail" dica="É com ele que você vai entrar no sistema." erro={tocou.email ? errosVoce.email : ''}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTocou((t) => ({ ...t, email: true }))} type="email" placeholder="nome@clinica.com.br" autoComplete="email" className={classeInput} data-testid="email" />
              </Campo>
              <Campo
              rotulo={config.confirmarCelular ? 'Seu celular (com WhatsApp)' : 'Seu celular (opcional)'}
              dica={config.confirmarCelular ? config.canalCelular === 'sms' ? 'Vamos mandar um código por SMS.' : 'Vamos mandar um código pelo WhatsApp.' : undefined}
              erro={tocou.celular ? errosVoce.celular : ''}>

                <input value={celular} onChange={(e) => setCelular(mascaraCelular(e.target.value))} onBlur={() => setTocou((t) => ({ ...t, celular: true }))} inputMode="tel" placeholder="(11) 98765-4321" autoComplete="tel" className={classeInput} data-testid="celular" />
              </Campo>
            </div>
          }

          {etapa === 'email' &&
          <div className="space-y-5">
              <Cabecalho icone={<MailIcon className="h-6 w-6" />} titulo="Confira seu e-mail" texto={<>Enviamos um código de 6 dígitos para <strong className="text-gray-900">{envioEmail?.destino || email}</strong>.</>} />
              <CodigoInput valor={codigo} onChange={setCodigo} onCompleto={(v) => confirmar('email', v)} desativado={ocupado} />
              <AjudaCodigo
              resta={resta}
              ocupado={ocupado}
              reenviar={() => enviarCodigo('email', true)}
              corrigir={() => irPara('voce')}
              textoCorrigir="Errei o e-mail"
              dica="Não chegou? Olhe também a caixa de spam ou promoções." />

            </div>
          }

          {etapa === 'celular' &&
          <div className="space-y-5">
              <Cabecalho
              icone={<SmartphoneIcon className="h-6 w-6" />}
              titulo={`Confira seu ${viaCelular}`}
              texto={<>Enviamos um código de 6 dígitos por {viaCelular} para <strong className="text-gray-900">{envioCelular?.destino || celular}</strong>.</>} />

              <CodigoInput valor={codigo} onChange={setCodigo} onCompleto={(v) => confirmar('celular', v)} desativado={ocupado} />
              <AjudaCodigo
              resta={resta}
              ocupado={ocupado}
              reenviar={() => enviarCodigo('celular', true)}
              corrigir={() => irPara('voce')}
              textoCorrigir="Errei o número"
              dica={envioCelular?.via === 'sms' ? 'O SMS pode levar até 1 minuto.' : 'Abra o WhatsApp deste número para ver a mensagem.'}
              extra={
              config.canalCelular === 'auto' && envioCelular?.via === 'whatsapp' && resta === 0 ?
              <button type="button" disabled={ocupado} onClick={() => enviarCodigo('celular', true, 'sms')} className="font-medium text-teal-700 hover:underline disabled:opacity-50">
                      Receber por SMS
                    </button> :
              null
              } />

            </div>
          }

          {etapa === 'senha' &&
          <div className="space-y-5">
              <Cabecalho icone={<KeyRoundIcon className="h-6 w-6" />} titulo="Crie sua senha" texto="Quase lá! Escolha uma senha que só você saiba." />
              <PasswordInput label="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" autoFocus data-testid="senha" />
              <PasswordInput label="Repita a senha" value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" data-testid="senha2" />
              <ul className="space-y-1.5 text-sm">
                {regrasSenha.map((r) =>
              <li key={r.texto} className={`flex items-center gap-2 ${r.ok ? 'text-green-700' : 'text-gray-500'}`}>
                    {r.ok ? <CheckIcon className="h-4 w-4" /> : <CircleIcon className="h-4 w-4" />}
                    {r.texto}
                  </li>
              )}
              </ul>
              <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                <p className="font-medium text-gray-700">Resumo</p>
                <p className="mt-1">{busca === 'existente' ? operadoraExistente?.nome : empresa.nome} · CNPJ {cnpj}</p>
                <p>{nome} · {email}{celular ? ` · ${celular}` : ''}</p>
              </div>
            </div>
          }

          {etapa === 'pronto' &&
          <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-teal-600">
                <PartyPopperIcon className="h-8 w-8" />
              </div>
              <h2 id="cadastro-titulo" className="text-2xl font-bold text-gray-900">Tudo pronto, {primeiroNome(nome)}!</h2>
              <p className="mt-2 text-gray-600">Sua conta foi criada{config.confirmarEmail || config.confirmarCelular ? ' e seus contatos foram confirmados' : ''}.</p>
              <p className="mt-1 text-sm text-gray-500">Ao entrar, o próximo passo é cadastrar a sua primeira clínica.</p>
            </div>
          }

          {aviso && !erro && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{aviso}</p>}
          {erro &&
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="cadastro-erro">
              {erro}
            </p>
          }
        </div>

        {/* Rodapé */}
        <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          {etapa !== 'empresa' && etapa !== 'pronto' &&
          <button type="button" onClick={voltar} disabled={ocupado} className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
              <ArrowLeftIcon className="h-4 w-4" /> Voltar
            </button>
          }
          <div className="flex-1" />
          {principal &&
          <button
            type="submit"
            disabled={!principal.pode || ocupado}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="cadastro-continuar">

              {ocupado ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
              {principal.texto}
              {!ocupado && <ArrowRightIcon className="h-4 w-4" />}
            </button>
          }
          {etapa === 'pronto' &&
          <button
            type="button"
            onClick={entrar}
            disabled={entrando}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
            data-testid="cadastro-entrar">

              {entrando ? <Loader2Icon className="h-5 w-5 animate-spin" /> : null}
              Entrar no EasyClin
            </button>
          }
        </div>

        {querSair &&
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6">
            <div className="max-w-sm text-center">
              <p className="text-lg font-semibold text-gray-900">Sair do cadastro?</p>
              <p className="mt-1 text-sm text-gray-600">O que você preencheu até aqui será perdido.</p>
              <div className="mt-5 flex justify-center gap-3">
                <button type="button" onClick={() => setQuerSair(false)} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                  Continuar cadastro
                </button>
                <button type="button" onClick={fechar} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Sair
                </button>
              </div>
            </div>
          </div>
        }
      </form>
    </div>);

}

function Cabecalho({ icone, titulo, texto }: {icone: React.ReactNode;titulo: string;texto: React.ReactNode;}) {
  return (
    <div>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600">{icone}</div>
      <h2 id="cadastro-titulo" className="text-xl font-bold text-gray-900">{titulo}</h2>
      <p className="mt-1 text-sm text-gray-600">{texto}</p>
    </div>);

}

function Destaque({ cor, icone, children }: {cor: 'green' | 'amber' | 'teal';icone?: React.ReactNode;children: React.ReactNode;}) {
  const cores = {
    green: 'border-green-200 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    teal: 'border-teal-200 bg-teal-50 text-teal-800'
  }[cor];
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${cores}`}>
      {icone && <span className="mt-0.5 flex-shrink-0">{icone}</span>}
      <span>{children}</span>
    </div>);

}

function AjudaCodigo({
  resta,
  ocupado,
  reenviar,
  corrigir,
  textoCorrigir,
  dica,
  extra









}: {resta: number;ocupado: boolean;reenviar: () => void;corrigir: () => void;textoCorrigir: string;dica: string;extra?: React.ReactNode;}) {
  return (
    <div className="space-y-2 text-center text-sm">
      <p className="text-gray-500">{dica}</p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {resta > 0 ?
        <span className="text-gray-400">Enviar outro código em {resta}s</span> :

        <button type="button" disabled={ocupado} onClick={reenviar} className="font-medium text-teal-700 hover:underline disabled:opacity-50">
            Enviar outro código
          </button>
        }
        {extra}
        <button type="button" onClick={corrigir} className="text-gray-500 hover:underline">
          {textoCorrigir}
        </button>
      </div>
    </div>);

}
