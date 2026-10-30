import React, { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  excessosNoPlano,
  usePlanosClinica,
  type PlanoDisponivel,
  type UsoClinica } from
'../../hooks/usePlanosClinica';
import { formatarMoeda } from '../../types/assinatura';

interface EscolhaPlanoSecaoProps {
  clinicaId: string;
  usuarioId?: string;
  podeGerenciar: boolean;
  onPlanoAlterado: (plano: {id: string;nome: string;preco: number;}) => void;
}

/**
 * Consumo atual contra os limites do plano + escolha de outro plano.
 * O uso vem primeiro: é ele que explica por que trocar.
 */
export function EscolhaPlanoSecao({
  clinicaId,
  usuarioId,
  podeGerenciar,
  onPlanoAlterado
}: EscolhaPlanoSecaoProps) {
  const { planos, planoAtualId, uso, carregando, erro, escolher, recarregar } =
  usePlanosClinica(clinicaId, usuarioId);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const atual = planos.find((p) => p.id === planoAtualId) || null;

  const confirmar = async (plano: PlanoDisponivel) => {
    setSalvando(true);
    setFalha(null);
    try {
      const novo = await escolher(plano.id);
      setConfirmando(null);
      await recarregar();
      onPlanoAlterado(novo);
    } catch (err) {
      setFalha(err instanceof Error ? err.message : 'Não foi possível trocar o plano.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section id="planos" aria-labelledby="titulo-planos" className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <h2 id="titulo-planos" className="text-lg font-semibold text-gray-900">
          Planos
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Seu consumo atual{atual ? ` no plano ${atual.nome}` : ''}. Ao mudar de plano, os
          limites mudam na hora.
        </p>
        {uso && <MedidoresDeUso uso={uso} plano={atual} />}
      </div>

      {erro && <p className="px-6 py-4 text-sm text-red-700">{erro}</p>}
      {carregando && !planos.length &&
      <p className="px-6 py-4 text-sm text-gray-500">Carregando planos...</p>
      }

      {planos.length > 0 &&
      <div className="p-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {planos.map((plano) => {
          const ehAtual = plano.id === planoAtualId;
          const excede = excessosNoPlano(plano, uso);
          const emConfirmacao = confirmando === plano.id;
          return (
            <article
              key={plano.id}
              className={`flex flex-col rounded-lg border p-5 ${
              ehAtual ? 'border-teal-600 bg-teal-50/40' : 'border-gray-200'}`
              }>
              
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{plano.nome}</h3>
                  {ehAtual &&
                <span className="text-xs font-medium text-teal-700 whitespace-nowrap">
                      Plano atual
                    </span>
                }
                </div>
                <p className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">
                  {plano.preco > 0 ? formatarMoeda(plano.preco) : 'Grátis'}
                  {plano.preco > 0 &&
                <span className="text-sm font-normal text-gray-500">/mês</span>
                }
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
                  <Recurso>
                    {plano.limitePacientes ? `Até ${plano.limitePacientes} pacientes` : 'Pacientes ilimitados'}
                  </Recurso>
                  <Recurso>
                    {plano.limites.usuarios ? `Até ${plano.limites.usuarios} usuários` : 'Usuários ilimitados'}
                  </Recurso>
                  <Recurso>
                    {plano.limites.armazenamentoGb ?
                  `${plano.limites.armazenamentoGb} GB de documentos` :
                  'Documentos sem limite fixo'}
                  </Recurso>
                  <Recurso incluido={plano.limites.sms !== false}>
                    {plano.limites.sms === false ? 'Sem SMS' : 'SMS (cobrado por envio)'}
                  </Recurso>
                </ul>

                <div className="mt-auto pt-5">
                  {excede.length > 0 && !ehAtual &&
                <p className="text-xs text-amber-700 mb-2">
                      Não comporta seu uso atual: {excede.join(', ')}.
                    </p>
                }
                  {ehAtual ?
                <Button variant="secondary" disabled className="w-full">
                      Plano atual
                    </Button> :
                !podeGerenciar ?
                <p className="text-xs text-gray-500">
                      Somente o administrador da clínica pode mudar o plano.
                    </p> :
                emConfirmacao ?
                <div className="space-y-2">
                      <Button className="w-full" onClick={() => confirmar(plano)} disabled={salvando}>
                        {salvando ? 'Trocando...' : `Confirmar ${plano.nome}`}
                      </Button>
                      <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setConfirmando(null)}
                    disabled={salvando}>
                    
                        Cancelar
                      </Button>
                    </div> :

                <Button
                  className="w-full"
                  variant={plano.preco > (atual?.preco ?? 0) ? 'primary' : 'secondary'}
                  onClick={() => {
                    setFalha(null);
                    setConfirmando(plano.id);
                  }}
                  disabled={excede.length > 0}>
                  
                      Escolher
                    </Button>
                }
                </div>
              </article>);

        })}
        </div>
      }

      {falha &&
      <p role="alert" className="px-6 pb-5 text-sm text-red-700">
          {falha}
        </p>
      }
    </section>);

}

function Recurso({ children, incluido = true }: {children: React.ReactNode;incluido?: boolean;}) {
  return (
    <li className={`flex items-start gap-2 ${incluido ? '' : 'text-gray-400'}`}>
      <CheckIcon
        className={`w-4 h-4 mt-0.5 shrink-0 ${incluido ? 'text-teal-600' : 'text-gray-300'}`}
        aria-hidden="true" />
      
      <span>{children}</span>
    </li>);

}

function MedidoresDeUso({ uso, plano }: {uso: UsoClinica;plano: PlanoDisponivel | null;}) {
  const medidores = [
  { rotulo: 'Pacientes', usado: uso.pacientes, limite: plano?.limitePacientes ?? null, unidade: '' },
  { rotulo: 'Usuários ativos', usado: uso.usuarios, limite: plano?.limites.usuarios ?? null, unidade: '' },
  {
    rotulo: 'Documentos',
    usado: uso.armazenamentoGb,
    limite: plano?.limites.armazenamentoGb ?? null,
    unidade: ' GB'
  }];

  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      {medidores.map((m) => {
        const proporcao = m.limite ? Math.min(1, m.usado / m.limite) : 0;
        const cheio = m.limite ? m.usado >= m.limite : false;
        return (
          <div key={m.rotulo}>
            <dt className="text-xs text-gray-500">{m.rotulo}</dt>
            <dd className="mt-1">
              <span className={`text-sm font-medium tabular-nums ${cheio ? 'text-red-700' : 'text-gray-900'}`}>
                {m.usado.toLocaleString('pt-BR')}
                {m.unidade}
                {m.limite ? ` de ${m.limite.toLocaleString('pt-BR')}${m.unidade}` : ' · sem limite'}
              </span>
              {m.limite ?
              <div
                className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden"
                role="progressbar"
                aria-label={m.rotulo}
                aria-valuenow={Math.round(proporcao * 100)}
                aria-valuemin={0}
                aria-valuemax={100}>
                
                  <div
                  className={`h-full rounded-full ${cheio ? 'bg-red-500' : proporcao > 0.8 ? 'bg-amber-500' : 'bg-teal-600'}`}
                  style={{ width: `${proporcao * 100}%` }} />
                
                </div> :
              null}
            </dd>
          </div>);

      })}
    </dl>);

}