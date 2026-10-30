import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  Loader2Icon,
  UserIcon,
  XCircleIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';

interface ConsultaPublica {
  id: string;
  pacienteNome: string;
  data: string;
  horario: string;
  profissional: string;
  status: string;
  tipo: string;
  modalidade?: string;
  motivoCancelamento?: string | null;
  clinicaNome?: string | null;
}

const MOTIVOS = [
'Imprevisto pessoal',
'Problema de trabalho',
'Problema de saúde',
'Quero reagendar',
'Outro motivo'];


function formatarData(data: string): string {
  if (!data) return '';
  // Aceita "AAAA-MM-DD" e também valores que já tragam hora anexada
  const partes = String(data).slice(0, 10).split('-');
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export function ConsultaConfirmacaoPublicaPage() {
  const { token } = useParams<{token: string;}>();
  const [consulta, setConsulta] = useState<ConsultaPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<'confirmada' | 'cancelada' | null>(
    null
  );
  const [jaRespondido, setJaRespondido] = useState(false);
  const [respondidoEm, setRespondidoEm] = useState<string | null>(null);
  const [mostrarCancelamento, setMostrarCancelamento] = useState(false);
  const [motivoSelecionado, setMotivoSelecionado] = useState('');
  const [motivoLivre, setMotivoLivre] = useState('');

  useEffect(() => {
    const carregar = async () => {
      if (!token) {
        setErro('Link inválido.');
        setCarregando(false);
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/confirmacao/${encodeURIComponent(token)}`
        );
        const dados = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(dados?.error || 'Não foi possível abrir este link.');
        }
        setConsulta(dados);
        // Se já havia resposta ANTES desta visita, a tela explica que o link já
        // foi usado — em vez de agradecer como se fosse a primeira vez.
        if (dados.status === 'confirmada') {
          setResultado('confirmada');
          setJaRespondido(true);
        }
        if (dados.status === 'cancelada') {
          setResultado('cancelada');
          setJaRespondido(true);
        }
      } catch (err: any) {
        setErro(err.message);
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [token]);

  const responder = async (acao: 'confirmar' | 'cancelar') => {
    if (!token) return;
    const motivo =
    motivoSelecionado === 'Outro motivo' ? motivoLivre.trim() : motivoSelecionado;

    if (acao === 'cancelar' && !motivo) {
      setErro('Selecione ou descreva o motivo do cancelamento.');
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/confirmacao/${encodeURIComponent(token)}/responder`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            acao,
            motivo: acao === 'cancelar' ? motivo : undefined
          })
        }
      );
      const dados = await response.json().catch(() => null);
      // 409 = já respondido (o link é de uso único). Mostra o estado real em vez
      // de um erro seco, inclusive se a clínica já tratou o caso.
      if (response.status === 409 && dados?.jaRespondido) {
        setJaRespondido(true);
        setRespondidoEm(dados.respondidoEm || null);
        setResultado(dados.status);
        return;
      }
      if (!response.ok) {
        throw new Error(dados?.error || 'Não foi possível registrar a resposta.');
      }
      setResultado(dados.status);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <main className="min-h-screen w-full bg-gray-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2Icon className="w-5 h-5 animate-spin" />
          <span>Carregando sua consulta...</span>
        </div>
      </main>);

  }

  if (!consulta) {
    return (
      <main className="min-h-screen w-full bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <XCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Link indisponível
          </h1>
          <p className="text-sm text-gray-600">
            {erro || 'Este link não é mais válido. Entre em contato com a clínica.'}
          </p>
        </div>
      </main>);

  }

  return (
    <main className="min-h-screen w-full bg-gray-50 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <header className="bg-teal-600 px-6 py-5 text-white">
          <p className="text-xs uppercase tracking-wide text-teal-100">
            {consulta.clinicaNome || 'Confirmação de consulta'}
          </p>
          <h1 className="text-xl font-semibold mt-1">
            Olá, {consulta.pacienteNome}
          </h1>
        </header>

        <section className="px-6 py-5 space-y-3 border-b border-gray-100">
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <CalendarIcon className="w-4 h-4 text-gray-400" />
            <span>{formatarData(consulta.data)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <ClockIcon className="w-4 h-4 text-gray-400" />
            <span>{consulta.horario}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <UserIcon className="w-4 h-4 text-gray-400" />
            <span>{consulta.profissional}</span>
          </div>
          {consulta.modalidade === 'online' &&
          <p className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
              Atendimento online — o link da sala será enviado no horário.
            </p>
          }
        </section>

        {resultado === 'confirmada' ?
        <section className="px-6 py-8 text-center">
            <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">
              {jaRespondido ?
            'Esta consulta já está confirmada' :
            'Presença confirmada'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {jaRespondido ?
            'Sua presença já havia sido confirmada. Para alterar ou remarcar, entre em contato com a clínica.' :
            'Obrigado! Sua consulta está confirmada. Até logo.'}
            </p>
            {jaRespondido && respondidoEm &&
          <p className="text-xs text-gray-400 mt-3">
                Resposta registrada em{' '}
                {new Date(respondidoEm).toLocaleString('pt-BR')}
              </p>
          }
          </section> :
        resultado === 'cancelada' ?
        <section className="px-6 py-8 text-center">
            <XCircleIcon className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">
              {jaRespondido ?
            'Esta consulta já está cancelada' :
            'Consulta cancelada'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {jaRespondido ?
            'O cancelamento já havia sido registrado. Para remarcar, entre em contato com a clínica.' :
            'A clínica foi avisada. Se quiser remarcar, entre em contato.'}
            </p>
            {jaRespondido && respondidoEm &&
          <p className="text-xs text-gray-400 mt-3">
                Resposta registrada em{' '}
                {new Date(respondidoEm).toLocaleString('pt-BR')}
              </p>
          }
          </section> :

        <section className="px-6 py-5 space-y-4">
            {!mostrarCancelamento ?
          <>
                <p className="text-sm text-gray-600">
                  Você confirma sua presença nesta consulta?
                </p>
                <button
              type="button"
              onClick={() => responder('confirmar')}
              disabled={enviando}
              className="w-full py-3 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors">
              
                  {enviando ? 'Enviando...' : 'Sim, confirmo minha presença'}
                </button>
                <button
              type="button"
              onClick={() => setMostrarCancelamento(true)}
              disabled={enviando}
              className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors">
              
                  Não vou poder comparecer
                </button>
              </> :

          <>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Qual o motivo do cancelamento?
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Isso ajuda a clínica a liberar o horário para outro paciente.
                  </p>
                </div>

                <div className="space-y-2">
                  {MOTIVOS.map((motivo) =>
              <label
                key={motivo}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                motivoSelecionado === motivo ?
                'border-teal-500 bg-teal-50 text-teal-900' :
                'border-gray-200 text-gray-700 hover:bg-gray-50'}`
                }>
                
                      <input
                  type="radio"
                  name="motivo"
                  value={motivo}
                  checked={motivoSelecionado === motivo}
                  onChange={() => setMotivoSelecionado(motivo)}
                  className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500" />
                
                      {motivo}
                    </label>
              )}
                </div>

                {motivoSelecionado === 'Outro motivo' &&
            <textarea
              value={motivoLivre}
              onChange={(e) => setMotivoLivre(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />

            }

                <button
              type="button"
              onClick={() => responder('cancelar')}
              disabled={enviando}
              className="w-full py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60 transition-colors">
              
                  {enviando ? 'Enviando...' : 'Confirmar cancelamento'}
                </button>
                <button
              type="button"
              onClick={() => {
                setMostrarCancelamento(false);
                setErro(null);
              }}
              disabled={enviando}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
              
                  Voltar
                </button>
              </>
          }

            {erro &&
          <p role="alert" className="text-sm text-red-600">
                {erro}
              </p>
          }
          </section>
        }

        <footer className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            Em caso de dúvida, fale diretamente com a clínica.
          </p>
        </footer>
      </div>
    </main>);

}