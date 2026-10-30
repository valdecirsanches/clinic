import React from 'react';
import { MicIcon, PencilIcon } from 'lucide-react';
import { comandosAtendente, type ComandoAtendente } from '../../data/comandosAtendente';

interface ComandosAtendenteProps {
  desabilitado: boolean;
  onEnviar: (frase: string) => void;
  onEditar: (frase: string) => void;
}

/** Catálogo do que a recepção pode pedir. Frases com nomes de exemplo vão para a caixa, para trocar o nome. */
export function ComandosAtendente({ desabilitado, onEnviar, onEditar }: ComandosAtendenteProps) {
  const usar = (c: ComandoAtendente) => c.direto ? onEnviar(c.frase) : onEditar(c.frase);
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900">O que posso fazer por você</h3>
      <p className="mt-1 text-sm text-gray-600">
        Fale do seu jeito, não precisa decorar. Frases com <PencilIcon className="inline h-3 w-3 align-[-1px]" /> vão para a caixa de texto para você trocar o nome.
      </p>

      <div className="mt-4 space-y-5">
        {comandosAtendente.map((g) =>
        <section key={g.titulo}>
            <h4 className="mb-1.5 text-xs font-medium text-gray-500">{g.titulo}</h4>
            <ul className="divide-y divide-gray-100 border-y border-gray-100">
              {g.comandos.map((c) =>
            <li key={c.frase}>
                  <button
                type="button"
                onClick={() => usar(c)}
                disabled={desabilitado}
                className="flex w-full items-start gap-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60">
                
                    {c.direto ?
                <MicIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" /> :

                <PencilIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                }
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-900">“{c.frase}”</span>
                      <span className="block text-xs text-gray-500">{c.resultado}</span>
                    </span>
                  </button>
                </li>
            )}
            </ul>
          </section>
        )}
      </div>

      <p className="mt-5 text-xs text-gray-500">
        Marcar, remarcar e cancelar sempre pedem a sua confirmação. Abrir telas e cadastros acontece na hora.
      </p>
    </div>);

}