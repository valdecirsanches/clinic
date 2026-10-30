import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircleIcon as AlertTriangleIcon,
  BookOpenIcon,
  CheckIcon,
  ListIcon,
  LoaderIcon,
  MicIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon } from
'lucide-react';
import { nomeCampo, nomeEtapa, useAssistente } from '../../hooks/useAssistente';
import { useAssistenteAtivacao } from '../../hooks/useAssistenteAtivacao';
import { ResultadoAssistente } from './ResultadoAssistente';
import { TutorialProntuario } from './TutorialProntuario';
import { ComandosAtendente } from './ComandosAtendente';
import { AssistenteApresentacao } from './AssistenteApresentacao';
import type { ResumoDitado } from '../../types/assistente';

interface AssistenteFlutuanteProps {
  clinicaId: string;
  usuarioId: string;
  onNavigate: (page: string, date?: string, profissionalId?: string) => void;
  onAbrirProntuario?: (pacienteId: string) => void;
}

const EXEMPLOS_AGENDA = [
'Como está o dia hoje?',
'Quem tem vaga amanhã à tarde?',
'Cadastrar paciente novo'];


const EXEMPLOS_PRONTUARIO = [
'Queixa principal: dor de garganta há dois dias, sem febre',
'Pressão 12 por 8, pulso 80, saturação 97',
'Evolução: paciente refere melhora, retorno em 15 dias'];


const ROTULO_ETAPA: Record<string, string> = {
  ouvindo: 'Ouvindo…',
  transcrevendo: 'Entendendo o áudio…',
  gravando_consulta: 'Gravando na agenda…',
  preenchendo: 'Preenchendo o prontuário…'
};

const CHAVE_TUTORIAL_VISTO = 'assistente_tutorial_aberto';
const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Ativado: painel completo. Ainda não ativado: o botão aparece em branco e,
 * ao clicar, explica o que o assistente faz e como ativar.
 */
export function AssistenteFlutuante(props: AssistenteFlutuanteProps) {
  const { ativacao, erro } = useAssistenteAtivacao(props.clinicaId);
  if (ativacao?.ativo) return <PainelAssistente {...props} />;
  if (!ativacao && !erro) return null;
  return <AssistenteApresentacao ativacao={ativacao} erro={erro} onNavigate={(p) => props.onNavigate(p)} />;
}

function ResumoDoDitado({ ditado }: {ditado: ResumoDitado;}) {
  if (!ditado.preenchidos.length && !ditado.falhas.length) return null;
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-gray-200 bg-white p-3">
      {ditado.preenchidos.map((p) =>
      <div key={p.etapa} className="flex gap-2 text-sm">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
          <p className="text-gray-700">
            <span className="font-medium text-gray-900">{nomeEtapa(p.etapa)}</span>
            {' · '}
            {p.campos.map(nomeCampo).join(', ')}
          </p>
        </div>
      )}
      {ditado.preenchidos.length > 0 && ditado.falhas.length > 0 && <hr className="border-gray-100" />}
      {ditado.falhas.map((f) =>
      <div key={f} className="flex gap-2 text-sm text-amber-800">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{f}</p>
        </div>
      )}
      {ditado.preenchidos.length > 0 && <p className="pt-1 text-xs text-gray-500">Revise na tela. O salvamento é o mesmo da digitação.</p>}
    </div>);

}

function PainelAssistente({ clinicaId, usuarioId, onNavigate, onAbrirProntuario }: AssistenteFlutuanteProps) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [tutorial, setTutorial] = useState(false);
  const [comandos, setComandos] = useState(false);
  const reduzir = useReducedMotion();
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const a = useAssistente({ clinicaId, usuarioId, onNavigate, onAbrirProntuario });

  const editarNaCaixa = (frase: string) => {
    setComandos(false);
    setTexto(frase);
    window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(frase.length, frase.length);
    }, 0);
  };
  const ouvindo = a.etapa === 'ouvindo';
  const noProntuario = a.modo === 'prontuario';

  useEffect(() => {
    if (!tutorial) fimRef.current?.scrollIntoView({ block: 'end' });
  }, [a.mensagens.length, a.etapa, tutorial]);

  // Primeira vez que o médico abre o assistente num prontuário: tutorial.
  useEffect(() => {
    if (aberto && noProntuario && !localStorage.getItem(CHAVE_TUTORIAL_VISTO)) {
      localStorage.setItem(CHAVE_TUTORIAL_VISTO, '1');
      setTutorial(true);
    }
  }, [aberto, noProntuario]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && !ouvindo && setAberto(false);
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aberto, ouvindo]);

  const enviarTexto = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!texto.trim()) return;
    a.enviar(texto);
    setTexto('');
  };

  const experimentar = (comando: string) => {
    a.pararVoz();
    setTutorial(false);
    a.enviar(comando, false, 'prontuario');
  };

  const abrirAgenda = (data: string, profissionalId?: string) => onNavigate('agenda', data, profissionalId);
  const exemplos = noProntuario ? EXEMPLOS_PRONTUARIO : EXEMPLOS_AGENDA;
  const titulo = noProntuario ? 'Assistente do prontuário' : 'Assistente da recepção';
  const subtitulo = noProntuario ?
  [a.prontuario?.paciente, a.prontuario ? `Aba: ${nomeEtapa(a.prontuario.etapaAtual)}` : ''].filter(Boolean).join(' · ') :
  'Fale ou digite. Nada é gravado sem sua confirmação.';
  const rotuloPensando = noProntuario ? 'Organizando o ditado…' : 'Procurando na agenda…';

  const botaoIcone =
  'rounded-lg p-2 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900';

  return (
    <>
      <AnimatePresence>
        {aberto &&
        <motion.section
          role="dialog"
          aria-label={titulo}
          initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{ transformOrigin: 'bottom right' }}
          className="fixed bottom-24 right-4 sm:right-6 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] h-[min(660px,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          
            <header className="border-b border-gray-100 px-4 pt-3 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
                  <p className="truncate text-xs text-gray-500">{subtitulo || 'Abra um atendimento para ditar.'}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  {!noProntuario &&
                <button
                  type="button"
                  onClick={() => setComandos((v) => !v)}
                  aria-label={comandos ? 'Voltar à conversa' : 'Ver todos os comandos'}
                  aria-pressed={comandos}
                  title="Comandos"
                  className={`${botaoIcone} ${comandos ? 'bg-teal-50 text-teal-700' : ''}`}>
                  
                      <ListIcon className="h-4 w-4" />
                    </button>
                }
                  {noProntuario &&
                <button
                  type="button"
                  onClick={() => setTutorial((v) => !v)}
                  aria-label={tutorial ? 'Voltar à conversa' : 'Abrir tutorial do prontuário'}
                  aria-pressed={tutorial}
                  title="Tutorial do prontuário"
                  className={`${botaoIcone} ${tutorial ? 'bg-teal-50 text-teal-700' : ''}`}>
                  
                      <BookOpenIcon className="h-4 w-4" />
                    </button>
                }
                  <button
                  type="button"
                  onClick={() => a.setVozAtiva(!a.vozAtiva)}
                  aria-label={a.vozAtiva ? 'Desligar resposta falada' : 'Ligar resposta falada'}
                  title={a.vozAtiva ? 'Resposta falada ligada' : 'Resposta falada desligada'}
                  className={botaoIcone}>
                  
                    {a.vozAtiva ? <Volume2Icon className="h-4 w-4" /> : <VolumeXIcon className="h-4 w-4" />}
                  </button>
                  {a.mensagens.length > 0 && !tutorial &&
                <button type="button" onClick={a.limpar} aria-label="Nova conversa" title="Nova conversa" className={botaoIcone}>
                      <RotateCcwIcon className="h-4 w-4" />
                    </button>
                }
                  <button type="button" onClick={() => setAberto(false)} aria-label="Fechar assistente" className={botaoIcone}>
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {a.prontuario &&
            <div role="tablist" aria-label="Modo do assistente" className="mt-2 grid grid-cols-2 rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
                  {(['prontuario', 'agenda'] as const).map((m) =>
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={a.modo === m}
                onClick={() => {
                  a.setModo(m);
                  if (m === 'agenda') setTutorial(false);
                }}
                disabled={Boolean(a.etapa)}
                className={`rounded-md py-1.5 transition-colors duration-150 ${
                a.modo === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`
                }>
                
                      {m === 'prontuario' ? 'Prontuário' : 'Agenda'}
                    </button>
              )}
                </div>
            }
            </header>

            {comandos && !noProntuario ?
          <div className="flex-1 overflow-y-auto px-4 py-4">
                <ComandosAtendente
              desabilitado={Boolean(a.etapa)}
              onEnviar={(frase) => {
                setComandos(false);
                a.enviar(frase);
              }}
              onEditar={editarNaCaixa} />
            
              </div> :
          tutorial && noProntuario ?
          <div className="flex-1 overflow-y-auto px-4 py-4">
                <TutorialProntuario
              noProntuario={Boolean(a.prontuario)}
              falando={a.falando}
              onOuvir={(t) => a.falar(t, true)}
              onPararVoz={a.pararVoz}
              onExperimentar={experimentar}
              onAbrirEtapa={(etapa) => a.prontuario?.abrirEtapa(etapa)}
              onFechar={() => {
                a.pararVoz();
                setTutorial(false);
              }} />
            
              </div> :

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
                {!a.mensagens.length &&
            <div className="pt-4">
                    {noProntuario ?
              <>
                        <p className="text-sm text-gray-700">
                          Toque no microfone e dite como faria para uma secretária. Eu coloco cada informação na aba certa e você revisa na tela.
                        </p>
                        {a.prontuario?.somenteLeitura &&
                <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                            Este atendimento está assinado ou o seu perfil só visualiza. Posso tirar dúvidas, mas não altero nada.
                          </p>
                }
                        <button
                  type="button"
                  onClick={() => setTutorial(true)}
                  className="mt-4 flex w-full items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-left transition-colors duration-150 hover:bg-teal-100">
                  
                          <BookOpenIcon className="h-5 w-5 shrink-0 text-teal-700" />
                          <span>
                            <span className="block text-sm font-medium text-teal-900">Tutorial completo do prontuário</span>
                            <span className="block text-xs text-teal-800">Cada aba explicada, com exemplos para testar</span>
                          </span>
                        </button>
                      </> :

              <>
                        <p className="text-sm text-gray-700">
                          Toque no microfone e peça o que precisar: abrir um cadastro, marcar ou remarcar, ver quem tem vaga, abrir a agenda de um profissional ou qualquer tela.
                        </p>
                        <button
                  type="button"
                  onClick={() => setComandos(true)}
                  className="mt-4 flex w-full items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-left transition-colors duration-150 hover:bg-teal-100">
                  
                          <ListIcon className="h-5 w-5 shrink-0 text-teal-700" />
                          <span>
                            <span className="block text-sm font-medium text-teal-900">Ver todos os comandos</span>
                            <span className="block text-xs text-teal-800">Pacientes, marcação, agenda e telas</span>
                          </span>
                        </button>
                      </>
              }
                    <p className="mt-5 mb-2 text-xs font-medium text-gray-500">Experimente</p>
                    <ul className="space-y-1.5">
                      {exemplos.map((ex) =>
                <li key={ex}>
                          <button
                    type="button"
                    onClick={() => a.enviar(ex)}
                    disabled={Boolean(a.etapa)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:border-teal-300 hover:bg-teal-50">
                    
                            “{ex}”
                          </button>
                        </li>
                )}
                    </ul>
                  </div>
            }

                {a.mensagens.map((m) =>
            m.autor === 'usuario' ?
            <div key={m.id} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-teal-600 px-3 py-2 text-sm text-white">{m.texto}</p>
                    </div> :

            <div key={m.id} className="max-w-[95%]">
                      <div className={`rounded-2xl rounded-bl-md px-3 py-2 ${m.erro ? 'bg-red-50 text-red-800' : 'bg-gray-100 text-gray-900'}`}>
                        <p className="text-sm">{m.texto}</p>
                      </div>
                      {m.ditado && <ResumoDoDitado ditado={m.ditado} />}
                      {m.resultado &&
              !['conversa', 'navegar', 'prontuario', 'navegar_tela', 'abrir_cadastro', 'abrir_prontuario'].includes(m.resultado.tipo) &&
              <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
                          <ResultadoAssistente
                  resultado={m.resultado}
                  concluida={Boolean(m.concluida)}
                  ocupado={a.etapa === 'gravando_consulta'}
                  onConfirmarMarcacao={(dados) => a.confirmarMarcacao(m.id, dados)}
                  onConfirmarRemarcacao={(id, dados) => a.confirmarRemarcacao(m.id, id, dados)}
                  onConfirmarCancelamento={(id, motivo) => a.confirmarCancelamento(m.id, id, motivo)}
                  onAbrirAgenda={abrirAgenda}
                  onAbrirCadastro={(id) => a.abrirCadastro(id)}
                  onAbrirProntuario={(id) => a.abrirProntuario(id)}
                  onMarcarPara={(nome) => editarNaCaixa(`Marcar ${nome} com `)} />
                
                        </div>
              }
                    </div>

            )}

                {a.etapa && a.etapa !== 'ouvindo' &&
            <p className="flex items-center gap-2 text-xs text-gray-500">
                    <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> {a.etapa === 'pensando' ? rotuloPensando : ROTULO_ETAPA[a.etapa]}
                  </p>
            }
                <div ref={fimRef} />
              </div>
          }

            <footer className="border-t border-gray-100 p-3">
              {ouvindo ?
            <button
              type="button"
              onClick={a.pararGravacao}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-left transition-colors duration-150 hover:bg-red-100">
              
                  <span className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      {!reduzir && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />}
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
                    </span>
                    <span className="text-sm font-medium text-red-800">{noProntuario ? 'Ditando' : 'Ouvindo'} — toque para enviar</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs tabular-nums text-red-700">
                    {a.segundos}s / {a.limiteSegundos}s
                    <SquareIcon className="h-4 w-4 fill-current" />
                  </span>
                </button> :

            <form
              onSubmit={(e) => {
                setTutorial(false);
                setComandos(false);
                enviarTexto(e);
              }}
              className="flex items-center gap-2">
              
                  <input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={noProntuario ? 'Dite, digite ou pergunte…' : 'Digite um pedido…'}
                disabled={Boolean(a.etapa)}
                aria-label="Pedido para o assistente"
                className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50" />
              
                  {texto.trim() ?
              <button
                type="submit"
                disabled={Boolean(a.etapa)}
                aria-label="Enviar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition-colors duration-150 hover:bg-teal-700 disabled:bg-gray-300">
                
                      <SendIcon className="h-4 w-4" />
                    </button> :

              <button
                type="button"
                onClick={() => {
                  setTutorial(false);
                  setComandos(false);
                  a.iniciarGravacao();
                }}
                disabled={Boolean(a.etapa)}
                aria-label={noProntuario ? 'Ditar para o prontuário' : 'Falar com o assistente'}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition-colors duration-150 hover:bg-teal-700 disabled:bg-gray-300">
                
                      <MicIcon className="h-5 w-5" />
                    </button>
              }
                </form>
            }
            </footer>
          </motion.section>
        }
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setAberto((v) => !v)}
        whileTap={reduzir ? undefined : { scale: 0.95 }}
        transition={{ duration: 0.12, ease: EASE }}
        aria-label={aberto ? 'Fechar assistente' : `Abrir ${titulo.toLowerCase()}`}
        aria-expanded={aberto}
        title={titulo}
        className="fixed bottom-5 right-4 sm:right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-colors duration-150 hover:bg-teal-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-300">
        
        {aberto ? <XIcon className="h-6 w-6" /> : ouvindo ? <SquareIcon className="h-5 w-5 fill-current" /> : <MicIcon className="h-6 w-6" />}
      </motion.button>
    </>);

}