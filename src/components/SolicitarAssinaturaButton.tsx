import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useAssinaturas, TipoAssinatura } from '../hooks/useAssinaturas';
import { API_BASE_URL } from '../config/api';
import { ENV_APP_BASE_URL } from '../config/env';
import {
  PenToolIcon,
  SendIcon,
  Loader2Icon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CopyIcon,
  MessageCircleIcon,
  RefreshCwIcon } from
'lucide-react';
import {
  MODELOS_ASSINATURA,
  formatarTelefoneBR,
  nomeClinicaDaSessao,
  telefoneCompleto } from
'../data/modelosAssinatura';

interface SolicitarAssinaturaButtonProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  clinicaId: string;
  atendimentoId?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  title?: string;
  /** Campo do cadastro que guarda o número usado (padrão: telefone). */
  campoTelefone?: 'telefone' | 'celular';
  /** Chamado quando o número é atualizado no cadastro do paciente. */
  onTelefoneAtualizado?: (telefone: string) => void;
}

type Resultado = {
  id: string;
  link: string;
  enviado: boolean;
  motivo?: string | null;
  telefone: string;
};

const TIPOS: {id: TipoAssinatura;nome: string;}[] = [
{ id: 'termo_consentimento', nome: 'Termo de Consentimento' },
{ id: 'autorizacao_procedimento', nome: 'Autorização de Procedimento' },
{ id: 'contrato', nome: 'Contrato de Serviço' },
{ id: 'outro', nome: 'Outro documento' }];


export function SolicitarAssinaturaButton({
  pacienteId,
  pacienteNome,
  pacienteTelefone,
  clinicaId,
  atendimentoId,
  variant = 'outline',
  size = 'sm',
  className = '',
  label = 'Solicitar Assinatura',
  title,
  campoTelefone = 'telefone',
  onTelefoneAtualizado
}: SolicitarAssinaturaButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoAssinatura>('termo_consentimento');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const textoDoModelo = useRef('');
  const [telefone, setTelefone] = useState('');
  const [salvarNoCadastro, setSalvarNoCadastro] = useState(true);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const { solicitarAssinatura, loading } = useAssinaturas();

  const aplicarModelo = (t: TipoAssinatura) => {
    const modelo = MODELOS_ASSINATURA[t];
    const novo = modelo.texto({ paciente: pacienteNome || 'o(a) paciente', clinica: nomeClinicaDaSessao() });
    setTipo(t);
    setTitulo(modelo.titulo);
    setTexto(novo);
    textoDoModelo.current = novo;
  };

  // Ao abrir: número do cadastro e o modelo do tipo já preenchidos
  useEffect(() => {
    if (!isOpen) return;
    setTelefone(formatarTelefoneBR(pacienteTelefone || ''));
    setSalvarNoCadastro(true);
    setResultado(null);
    setErro(null);
    setCopiado(false);
    aplicarModelo('termo_consentimento');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const trocarTipo = (t: TipoAssinatura) => {
    const editado = texto.trim() && texto !== textoDoModelo.current;
    if (editado && !window.confirm('Substituir o texto que você escreveu pelo modelo deste tipo de documento?')) {
      setTipo(t);
      if (MODELOS_ASSINATURA[t].titulo) setTitulo(MODELOS_ASSINATURA[t].titulo);
      return;
    }
    aplicarModelo(t);
  };

  const numeroMudou = telefone.replace(/\D/g, '') !== String(pacienteTelefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const numeroOk = telefoneCompleto(telefone);

  const atualizarCadastro = async (numero: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/pacientes/${pacienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicaId, [campoTelefone]: numero })
      });
      if (r.ok) onTelefoneAtualizado?.(numero);
    } catch {
      /* o envio segue; o cadastro pode ser corrigido depois */}
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (telefone && !numeroOk) {
      setErro('Confira o WhatsApp: informe DDD + número, ex.: (85) 99999-0000.');
      return;
    }
    try {
      const r = await solicitarAssinatura({
        clinicaId,
        pacienteId,
        pacienteNome,
        pacienteTelefone: telefone ? telefone.replace(/\D/g, '') : '',
        tipo,
        titulo,
        descricao: texto,
        atendimentoId
      });
      if (telefone && numeroMudou && salvarNoCadastro) await atualizarCadastro(telefone);
      setResultado({ id: r.id, link: r.linkAssinatura, enviado: !!r.whatsappEnviado, motivo: r.whatsappErro, telefone });
      if (r.whatsappEnviado) setTimeout(() => setIsOpen(false), 2500);
    } catch (err: any) {
      setErro(err.message || 'Não foi possível criar a solicitação.');
    }
  };

  const reenviar = async () => {
    if (!resultado) return;
    if (!numeroOk) {
      setErro('Confira o WhatsApp: informe DDD + número, ex.: (85) 99999-0000.');
      return;
    }
    setErro(null);
    setReenviando(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/assinaturas/${resultado.id}/reenviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicaId, telefone: telefone.replace(/\D/g, ''), appUrl: ENV_APP_BASE_URL || window.location.origin })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não foi possível reenviar.');
      if (numeroMudou && salvarNoCadastro) await atualizarCadastro(telefone);
      setResultado({ ...resultado, enviado: !!d.whatsappEnviado, motivo: d.whatsappErro, telefone });
      if (d.whatsappEnviado) setTimeout(() => setIsOpen(false), 2500);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setReenviando(false);
    }
  };

  const copiar = async () => {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(resultado.link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  };

  // Plano B: abre o WhatsApp (Web ou app) de quem está usando o sistema,
  // com a mensagem pronta para o número informado.
  const linkWhatsAppProprio = resultado && numeroOk ?
  `https://wa.me/55${telefone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}?text=${encodeURIComponent(
    `Olá, ${pacienteNome}! Segue o documento "${titulo}" para você ler e assinar: ${resultado.link}`
  )}` :
  null;

  const fechar = () => setIsOpen(false);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setIsOpen(true)} title={title || 'Solicitar assinatura digital'}>
        <PenToolIcon className={`w-4 h-4 ${label ? 'mr-2' : ''}`} />
        {label}
      </Button>

      <Modal isOpen={isOpen} onClose={fechar} title="Solicitar assinatura digital" size="large">
        <form onSubmit={enviar} className="space-y-4">
          {/* WhatsApp do paciente: sempre visível para conferir ou corrigir */}
          <div className="rounded-lg border border-gray-200 p-3">
            <label htmlFor="assinatura-telefone" className="block text-sm font-medium text-gray-800">
              WhatsApp de {pacienteNome}
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                id="assinatura-telefone"
                type="tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefoneBR(e.target.value))}
                placeholder="(85) 99999-0000"
                className={`h-10 w-56 rounded-md border px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500 ${telefone && !numeroOk ? 'border-amber-400' : 'border-gray-300'}`} />

              {resultado && !resultado.enviado &&
              <Button type="button" size="sm" onClick={reenviar} disabled={reenviando || !numeroOk} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {reenviando ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCwIcon className="w-4 h-4 mr-2" />}
                  Tentar enviar de novo
                </Button>
              }
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {!telefone ?
              'Sem número: o link será gerado para você copiar e enviar.' :
              !numeroOk ?
              'Informe DDD + número.' :
              numeroMudou ?
              'Número diferente do cadastro.' :
              'Número do cadastro. Confira antes de enviar.'}
            </p>
            {telefone && numeroOk && numeroMudou &&
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={salvarNoCadastro} onChange={(e) => setSalvarNoCadastro(e.target.checked)} className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                Atualizar este número no cadastro do paciente
              </label>
            }
          </div>

          {resultado ?
          <div className="space-y-3">
              {resultado.enviado ?
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-green-900">
                    Enviado pelo WhatsApp para <strong>{resultado.telefone}</strong>. Quando {pacienteNome.split(' ')[0]} assinar, o atendimento fica marcado como assinado.
                  </p>
                </div> :

            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <p className="font-medium">A mensagem não foi enviada.</p>
                    <p className="mt-0.5">{resultado.motivo || 'O WhatsApp da clínica não respondeu.'}</p>
                    <p className="mt-1 text-amber-800">Corrija o número e tente de novo, envie pelo seu WhatsApp ou copie o link abaixo.</p>
                  </div>
                </div>
            }
              <div className="flex flex-wrap items-center gap-2">
                <input value={resultado.link} readOnly onFocus={(e) => e.target.select()} className="flex-1 min-w-[16rem] h-9 rounded-md border border-gray-200 bg-gray-50 px-3 text-xs text-gray-700" />
                <Button type="button" variant="secondary" size="sm" onClick={copiar}>
                  <CopyIcon className="w-4 h-4 mr-1.5" />
                  {copiado ? 'Copiado' : 'Copiar link'}
                </Button>
                {!resultado.enviado && linkWhatsAppProprio &&
              <a
                href={linkWhatsAppProprio}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center h-8 px-3 rounded-lg text-sm font-medium border border-green-600 text-green-700 hover:bg-green-50">
                    <MessageCircleIcon className="w-4 h-4 mr-1.5" />
                    Enviar pelo meu WhatsApp
                  </a>
              }
              </div>
            </div> :

          <>
              <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</span>
                  <select
                  value={tipo}
                  onChange={(e) => trocarTipo(e.target.value as TipoAssinatura)}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">Título</span>
                  <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  required
                  placeholder="Ex.: Termo de consentimento para extração"
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
              </div>
              <label className="block">
                <span className="flex items-baseline justify-between text-sm font-medium text-gray-700 mb-1">
                  Texto que o paciente vai ler
                  {tipo !== 'outro' && texto !== textoDoModelo.current &&
                <button type="button" onClick={() => aplicarModelo(tipo)} className="text-xs font-normal text-teal-700 hover:underline">
                      Voltar ao modelo
                    </button>
                }
                </span>
                <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                required
                rows={10}
                placeholder="Escreva o que o paciente está autorizando ou declarando."
                className="w-full rounded-md border border-gray-300 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <span className="block text-xs text-gray-500 mt-1">
                  O paciente lê este texto inteiro na página de assinatura. Ajuste ao procedimento, se precisar.
                </span>
              </label>
            </>
          }

          {erro &&
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{erro}</p>
          }

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button type="button" variant="ghost" onClick={fechar} disabled={loading || reenviando}>
              {resultado ? 'Fechar' : 'Cancelar'}
            </Button>
            {!resultado &&
            <Button type="submit" disabled={loading || !titulo.trim() || !texto.trim() || !!telefone && !numeroOk} className="bg-teal-600 hover:bg-teal-700 text-white">
                {loading ?
              <><Loader2Icon className="w-4 h-4 mr-2 animate-spin" />Gerando...</> :
              <><SendIcon className="w-4 h-4 mr-2" />{telefone ? 'Enviar pelo WhatsApp' : 'Gerar link'}</>}
              </Button>
            }
          </div>
        </form>
      </Modal>
    </>);
}
