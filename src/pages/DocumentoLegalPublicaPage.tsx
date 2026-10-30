import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheckIcon, FileTextIcon, Trash2Icon } from 'lucide-react';
import {
  DOCUMENTOS_LEGAIS,
  CONTATO_LEGAL,
  ATUALIZADO_EM,
  type DocumentoLegal } from
'../data/documentosLegais';

interface DocumentoLegalPublicaPageProps {
  documento: DocumentoLegal['id'];
}

const ICONES = {
  privacidade: ShieldCheckIcon,
  termos: FileTextIcon,
  exclusao: Trash2Icon
} as const;

const NAVEGACAO: {id: DocumentoLegal['id'];rotulo: string;url: string;}[] = [
{ id: 'privacidade', rotulo: 'Privacidade', url: '/politica-de-privacidade' },
{ id: 'termos', rotulo: 'Termos de Serviço', url: '/termos-de-servico' },
{ id: 'exclusao', rotulo: 'Exclusão de dados', url: '/exclusao-de-dados' }];


/**
 * Página PÚBLICA de documento legal — acessível sem login.
 *
 * Exigência da Meta para publicar o app do WhatsApp Business: as URLs de
 * Política de Privacidade, Termos de Serviço e Exclusão de Dados precisam abrir
 * para qualquer pessoa. Por isso esta rota fica fora do MainApp autenticado.
 */
export function DocumentoLegalPublicaPage({
  documento
}: DocumentoLegalPublicaPageProps) {
  const conteudo = DOCUMENTOS_LEGAIS[documento];
  const Icone = ICONES[documento];

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <Icone className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {CONTATO_LEGAL.produto}
              </p>
              <p className="text-xs text-gray-500">Gestão Clínica</p>
            </div>
          </div>
          <nav aria-label="Documentos legais" className="flex flex-wrap gap-1">
            {NAVEGACAO.map((item) =>
            <Link
              key={item.id}
              to={item.url}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              item.id === documento ?
              'bg-gray-900 font-medium text-white' :
              'text-gray-600 hover:bg-gray-100'}`
              }
              aria-current={item.id === documento ? 'page' : undefined}>
              
                {item.rotulo}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          {conteudo.titulo}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-gray-600">
          {conteudo.resumo}
        </p>
        <p className="mt-4 text-xs uppercase tracking-wide text-gray-400">
          Última atualização: {ATUALIZADO_EM}
        </p>

        <div className="mt-10 space-y-9">
          {conteudo.secoes.map((secao) =>
          <section key={secao.titulo}>
              <h2 className="text-lg font-semibold text-gray-900">
                {secao.titulo}
              </h2>
              <div className="mt-3 space-y-3">
                {secao.paragrafos.map((paragrafo, indice) =>
              <p
                key={indice}
                className="text-sm leading-relaxed text-gray-700">
                
                    {paragrafo}
                  </p>
              )}
              </div>
              {secao.itens &&
            <ul className="mt-3 space-y-2 border-l-2 border-gray-200 pl-4">
                  {secao.itens.map((item, indice) =>
              <li
                key={indice}
                className="text-sm leading-relaxed text-gray-700">
                
                      {item}
                    </li>
              )}
                </ul>
            }
            </section>
          )}
        </div>

        <footer className="mt-12 border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-600">
            Dúvidas sobre este documento ou sobre seus dados:{' '}
            <a
              href={`mailto:${CONTATO_LEGAL.email}`}
              className="font-medium text-green-700 underline underline-offset-2">
              
              {CONTATO_LEGAL.email}
            </a>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {CONTATO_LEGAL.responsavel}
          </p>
        </footer>
      </main>
    </div>);

}