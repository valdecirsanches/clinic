import React, { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { paraTextoSimples } from '../../utils/htmlTexto';

interface CampoRecolhivelProps {
  /** Rótulo do campo (ex.: "Histórico Familiar") */
  titulo: string;
  /** Conteúdo atual — usado para resumir o campo quando ele está recolhido */
  valor: string;
  /** Começa aberto? Por padrão fica recolhido. */
  inicialAberto?: boolean;
  /** Destaca a barra quando o campo é obrigatório e ainda está vazio. */
  obrigatorio?: boolean;
  children: React.ReactNode;
}

/**
 * Campo de texto longo que começa recolhido, mostrando apenas uma barra com o
 * rótulo e um resumo do que já foi escrito.
 *
 * Recolher é só visual: o conteúdo permanece no formulário e continua sendo
 * salvo. A barra mostra o início do texto justamente para o profissional saber
 * que existe conteúdo ali sem precisar abrir cada seção.
 */
export function CampoRecolhivel({
  titulo,
  valor,
  inicialAberto = false,
  obrigatorio = false,
  children
}: CampoRecolhivelProps) {
  const [aberto, setAberto] = useState(inicialAberto);
  const texto = paraTextoSimples(valor || '').trim();
  const preenchido = texto.length > 0;
  const resumo = preenchido ?
  texto.length > 90 ?
  `${texto.slice(0, 90)}…` :
  texto :
  obrigatorio ?
  'Obrigatório — clique para preencher' :
  'Vazio — clique para preencher';

  const alerta = obrigatorio && !preenchido;

  return (
    <div
      className={`rounded-lg border ${
      alerta ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'}`
      }>
      
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left">
        
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
          aberto ? '' : '-rotate-90'}`
          }
          aria-hidden="true" />
        
        <span className="flex-shrink-0 text-sm font-semibold text-gray-700">
          {titulo}
        </span>
        {!aberto &&
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
          preenchido ?
          'text-gray-500' :
          alerta ?
          'font-medium text-amber-700' :
          'text-gray-400'}`
          }>
          
            {resumo}
          </span>
        }
        <span className="ml-auto flex-shrink-0 text-xs font-medium text-teal-600">
          {aberto ? 'Esconder' : 'Mostrar'}
        </span>
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
        aberto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`
        }>
        
        <div className="overflow-hidden">
          <div className="px-3 pb-3">{children}</div>
        </div>
      </div>
    </div>);

}