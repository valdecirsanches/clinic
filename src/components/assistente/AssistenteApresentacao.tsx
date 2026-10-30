import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRightIcon, CalendarCheckIcon, FileTextIcon, MicIcon, SearchIcon, XIcon } from 'lucide-react';
import type { AtivacaoAssistente } from '../../hooks/useAssistenteAtivacao';

interface AssistenteApresentacaoProps {
  ativacao: AtivacaoAssistente | null;
  erro: string | null;
  onNavigate: (page: string) => void;
}

const RECURSOS = [
{
  icone: CalendarCheckIcon,
  titulo: 'Agenda por voz',
  texto: 'Marca, remarca e cancela consultas, acha horários livres e resume o dia. Sempre pede confirmação antes de gravar.'
},
{
  icone: SearchIcon,
  titulo: 'Pacientes e telas num pedido',
  texto: 'Abre o cadastro ou o prontuário de um paciente, a agenda de um profissional e qualquer tela do sistema.'
},
{
  icone: FileTextIcon,
  titulo: 'Ditado no prontuário',
  texto: 'O médico dita anamnese, exame físico, diagnóstico e evolução, e cada informação vai para a aba certa.'
}];


const EASE = [0.23, 1, 0.32, 1] as const;

function tipoDoUsuario(): string {
  try {
    return String(JSON.parse(localStorage.getItem('sessao') || '{}')?.usuario?.tipo || '');
  } catch {
    return '';
  }
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Assistente ainda não ativado: o botão aparece e explica o que faz e como ativar. */
export function AssistenteApresentacao({ ativacao, erro, onNavigate }: AssistenteApresentacaoProps) {
  const [aberto, setAberto] = useState(false);
  const reduzir = useReducedMotion();
  const ehAdmin = ['admin', 'super_admin'].includes(tipoDoUsuario());
  const semChave = ativacao ? !ativacao.configurado : false;
  const servidorAntigo = !ativacao && Boolean(erro);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aberto]);

  const preco =
  ativacao && ativacao.valorUnitario > 0 ?
  `${moeda(ativacao.valorUnitario)} por pedido${ativacao.franquia > 0 ? `, com ${ativacao.franquia} pedidos grátis por mês` : ''}.` :
  'O uso é cobrado por pedido na fatura mensal da assinatura.';

  return (
    <>
      <AnimatePresence>
        {aberto &&
        <motion.section
          role="dialog"
          aria-label="Assistente de voz"
          initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{ transformOrigin: 'bottom right' }}
          className="fixed bottom-24 right-4 sm:right-6 z-50 flex w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          
            <header className="flex items-start justify-between gap-3 px-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Assistente de voz</h2>
                <p className="mt-0.5 text-sm text-gray-600">Fale o que precisa e ele faz por você.</p>
              </div>
              <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="-mr-2 rounded-lg p-2 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900">
              
                <XIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto px-5 pb-5">
              <ul className="mt-4 space-y-4">
                {RECURSOS.map(({ icone: Icone, titulo, texto }) =>
              <li key={titulo} className="flex gap-3">
                    <Icone className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{titulo}</p>
                      <p className="text-sm text-gray-600">{texto}</p>
                    </div>
                  </li>
              )}
              </ul>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-900">Ainda não está ativado nesta clínica</p>

                {servidorAntigo ?
              <p className="mt-1 text-sm text-gray-600">
                    O servidor desta instalação ainda não tem o assistente. O responsável técnico precisa publicar a versão nova do sistema.
                  </p> :
              semChave ?
              <p className="mt-1 text-sm text-gray-600">
                    Falta configurar a chave da OpenAI no servidor (<code className="text-xs">OPENAI_API_KEY</code>). Fale com o suporte técnico; depois disso, o administrador ativa em poucos cliques.
                  </p> :
              ehAdmin ?
              <>
                    <ol className="mt-2 space-y-1.5 text-sm text-gray-700">
                      <li className="flex gap-2">
                        <span className="tabular-nums text-gray-400">1.</span> Abra <span className="font-medium">Configurações da Clínica</span>.
                      </li>
                      <li className="flex gap-2">
                        <span className="tabular-nums text-gray-400">2.</span> No cartão <span className="font-medium">Assistente de voz</span>, ligue o interruptor.
                      </li>
                      <li className="flex gap-2">
                        <span className="tabular-nums text-gray-400">3.</span> Confirme. O assistente aparece na hora para toda a equipe.
                      </li>
                    </ol>
                    <p className="mt-3 text-xs text-gray-500">{preco}</p>
                    <button
                  type="button"
                  onClick={() => {
                    setAberto(false);
                    onNavigate('configuracoes');
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-teal-700">
                  
                      Ir para Configurações da Clínica <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  </> :

              <>
                    <p className="mt-1 text-sm text-gray-600">
                      Só o administrador da clínica pode ativar, em <span className="font-medium">Configurações da Clínica → Assistente de voz</span>. Peça a ele para ligar.
                    </p>
                    <p className="mt-2 text-xs text-gray-500">{preco}</p>
                  </>
              }
              </div>
            </div>
          </motion.section>
        }
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setAberto((v) => !v)}
        whileTap={reduzir ? undefined : { scale: 0.95 }}
        transition={{ duration: 0.12, ease: EASE }}
        aria-label={aberto ? 'Fechar' : 'Conhecer o assistente de voz'}
        aria-expanded={aberto}
        title="Assistente de voz (não ativado)"
        className="fixed bottom-5 right-4 sm:right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-teal-200 bg-white text-teal-700 shadow-lg transition-colors duration-150 hover:bg-teal-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-300">
        
        {aberto ? <XIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
      </motion.button>
    </>);

}