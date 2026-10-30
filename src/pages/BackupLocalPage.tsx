import React from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  DownloadIcon,
  FolderOpenIcon,
  LoaderIcon } from
'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useBackupLocal } from '../hooks/useBackupLocal';
import { formatarTamanho, hojeLocal, type EtapaBackup } from '../utils/backupLocal';

const ETAPAS: {id: EtapaBackup;nome: string;detalhe: string;}[] = [
{ id: 'preparando', nome: 'Gerando no servidor', detalhe: 'Copiando todos os dados da clínica. Pode levar alguns minutos.' },
{ id: 'baixando', nome: 'Baixando', detalhe: 'Transferindo o arquivo para este computador.' },
{ id: 'finalizando', nome: 'Gravando na pasta', detalhe: 'Concluindo a gravação.' }];


function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Backup de todos os dados da clínica gravado NO COMPUTADOR do cliente,
 * numa pasta escolhida por ele, uma vez por dia.
 */
export function BackupLocalPage({ embutido = false }: {embutido?: boolean;}) {
  const { sessao } = useAuth();
  const clinicaId = sessao?.clinicaAtual?.id;
  const clinicaNome = sessao?.clinicaAtual?.nome;
  const {
    suportado,
    config,
    pasta,
    permissao,
    servidor,
    servidorErro,
    etapa,
    executando,
    progresso,
    andamento,
    falha,
    concluido,
    atualizarConfig,
    escolherPasta,
    executarAgora,
    cancelar
  } = useBackupLocal(clinicaId, sessao?.usuario?.id);

  const feitoHoje = config?.ultimo?.data === hojeLocal() || servidor?.podeHoje === false;
  const ultimo = servidor?.ultimo || config?.ultimo || null;
  const percentual =
  progresso?.total && progresso.total > 0 ?
  Math.min(100, Math.round(progresso.recebido / progresso.total * 100)) :
  null;
  const indiceEtapa = etapa ? ETAPAS.findIndex((e) => e.id === etapa) : -1;
  // Falha guardada de uma execução anterior (ex.: a automática)
  const falhaGuardada =
  !falha && !concluido && config?.ultimoErro && !feitoHoje ?
  { titulo: config.ultimoErro.mensagem, oQueFazer: config.ultimoErro.oQueFazer || 'Tente de novo.', em: config.ultimoErro.em } :
  null;
  const falhaVisivel = falha || falhaGuardada;

  // Um único motivo para o botão estar desativado, dito em texto
  const motivoBloqueio = !pasta ?
  'Escolha a pasta de destino para começar.' :
  feitoHoje ?
  `O backup de hoje já foi feito${servidor?.ultimo?.usuarioNome ? ` por ${servidor.ultimo.usuarioNome}` : ''}. O próximo pode ser feito amanhã.` :
  null;

  const conteudo =
  <section aria-labelledby="titulo-backup-local" className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="titulo-backup-local" className="text-lg font-semibold text-gray-900">
            Backup no meu computador
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Cópia completa de {clinicaNome || 'a clínica'} — pacientes, prontuários, agenda, financeiro e
            documentos — gravada numa pasta deste computador.
          </p>
        </div>
        <Button onClick={executarAgora} disabled={!suportado || !!motivoBloqueio || executando} className="whitespace-nowrap">
          {executando ?
        <LoaderIcon className="w-4 h-4 mr-1.5 inline animate-spin" aria-hidden="true" /> :

        <DownloadIcon className="w-4 h-4 mr-1.5 inline" aria-hidden="true" />
        }
          {executando ? 'Fazendo backup...' : 'Fazer backup agora'}
        </Button>
      </div>

      {!suportado ?
    <p className="m-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Este navegador não permite gravar numa pasta do computador. Abra o sistema no <strong>Google Chrome</strong> ou
          no <strong>Microsoft Edge</strong>, num computador (não funciona no celular).
        </p> :

    <div className="grid lg:grid-cols-[1.2fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          {/* Configuração */}
          <div className="p-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-900">1. Pasta de destino</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-w-0">
                  <FolderOpenIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{pasta ? pasta.name : 'Nenhuma pasta escolhida'}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={escolherPasta} disabled={executando}>
                  {pasta ? 'Trocar pasta' : 'Escolher pasta'}
                </Button>
              </div>
              {pasta && permissao !== 'granted' &&
          <p className="mt-2 text-xs text-gray-500">
                  Por segurança, o navegador pede autorização para a pasta uma vez a cada vez que o sistema é aberto.
                </p>
          }
              <p className="mt-2 text-xs text-gray-500">
                Dica: uma pasta sincronizada (OneDrive, Google Drive) ou um disco externo mantém a cópia fora deste
                computador.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-900">2. Backup automático</p>
              <label className="mt-2 flex items-center gap-3 cursor-pointer">
                <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              checked={Boolean(config?.ativo)}
              onChange={(e) => atualizarConfig({ ativo: e.target.checked })}
              disabled={!pasta} />
            
                <span className="text-sm text-gray-900">Fazer sozinho todos os dias</span>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-4 max-w-sm">
                <label className="block">
                  <span className="text-xs text-gray-500">A partir de</span>
                  <input
                type="time"
                value={config?.horario || '12:30'}
                onChange={(e) => e.target.value && atualizarConfig({ horario: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Guardar na pasta</span>
                  <select
                value={config?.manter ?? 7}
                onChange={(e) => atualizarConfig({ manter: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                
                    {[3, 7, 15, 30].map((n) =>
                <option key={n} value={n}>
                        últimos {n}
                      </option>
                )}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                Um backup por dia. O automático só roda com o sistema aberto neste computador; se estiver fechado no
                horário, roda assim que for aberto no mesmo dia.
              </p>
            </div>
          </div>

          {/* Situação */}
          <div className="p-6 space-y-4" aria-live="polite">
            <p className="text-sm font-medium text-gray-900">Situação</p>

            {executando ?
        <ol className="space-y-3">
                {ETAPAS.map((e, i) => {
            const feito = i < indiceEtapa;
            const atual = i === indiceEtapa;
            return (
              <li key={e.id} className="flex items-start gap-3">
                      <span
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  feito ? 'bg-teal-600 text-white' : atual ? 'border-2 border-teal-600' : 'border border-gray-300'}`
                  }>
                  
                        {feito && <CheckIcon className="w-3 h-3" aria-hidden="true" />}
                        {atual && <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${atual ? 'text-gray-900 font-medium' : feito ? 'text-gray-700' : 'text-gray-400'}`}>
                          {e.nome}
                          {atual && e.id === 'baixando' && progresso?.recebido ?
                    ` · ${formatarTamanho(progresso.recebido)}${progresso.total ? ` de ${formatarTamanho(progresso.total)}` : ''}` :
                    ''}
                        </p>
                        {atual && e.id !== 'preparando' && <p className="text-xs text-gray-500 mt-0.5">{e.detalhe}</p>}
                        {atual && e.id === 'preparando' &&
                  <>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {andamento?.tabelasTotal ?
                      `Tabela ${andamento.tabelaAtual} de ${andamento.tabelasTotal}${andamento.tabela ? ` (${andamento.tabela})` : ''} · ${andamento.linhas.toLocaleString('pt-BR')} registros copiados` :
                      'Conectando ao banco de dados da clínica...'}
                            </p>
                            <div
                      className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={andamento?.percentual ?? undefined}
                      aria-valuemin={0}
                      aria-valuemax={100}>
                      
                              <div
                        className="h-full bg-teal-600 transition-[width] duration-300 ease-out"
                        style={{ width: `${andamento?.percentual ?? 3}%` }} />
                      
                            </div>
                            {andamento?.percentual != null &&
                    <p className="text-xs text-gray-500 mt-1 tabular-nums">cerca de {andamento.percentual}%</p>
                    }
                          </>
                  }
                        {atual && e.id === 'baixando' &&
                  <div
                    className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={percentual ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}>
                    
                            <div className="h-full bg-teal-600" style={{ width: `${percentual ?? 10}%` }} />
                          </div>
                  }
                      </div>
                    </li>);

          })}
                <li className="flex flex-wrap items-center justify-between gap-2 pl-8">
                  <span className="text-xs text-gray-500">Pode continuar usando o sistema; só não feche esta aba.</span>
                  {etapa === 'preparando' &&
            <button type="button" onClick={cancelar} className="text-xs text-gray-600 underline hover:text-gray-900">
                      Parar de esperar
                    </button>
            }
                </li>
              </ol> :
        concluido ?
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2Icon className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-800">Backup gravado na pasta "{pasta?.name}".</p>
                  <p className="text-xs text-green-700 break-all mt-0.5">
                    {concluido.arquivo} · {formatarTamanho(concluido.tamanho)}
                  </p>
                </div>
              </div> :
        falhaVisivel ?
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-red-800">
                      {falhaGuardada ? 'O último backup não foi concluído.' : 'O backup não foi concluído.'}
                    </p>
                    <p className="text-sm text-red-700 mt-1">{falhaVisivel.titulo}</p>
                    <p className="text-sm text-gray-800 mt-2">
                      <span className="font-medium">O que fazer: </span>
                      {falhaVisivel.oQueFazer}
                    </p>
                    {falhaGuardada && <p className="text-xs text-red-500 mt-2">{dataHora(falhaGuardada.em)}</p>}
                  </div>
                </div>
                {(falha?.podeTentar ?? true) && !motivoBloqueio &&
          <Button size="sm" variant="secondary" onClick={executarAgora} className="mt-3 ml-7">
                    Tentar de novo
                  </Button>
          }
              </div> :
        motivoBloqueio ?
        <p className="text-sm text-gray-700">{motivoBloqueio}</p> :

        <p className="text-sm text-gray-700">
                {config?.ativo ? `Próximo backup automático: hoje a partir das ${config.horario}.` : 'Pronto para fazer o backup.'}
              </p>
        }

            {!executando && ultimo &&
        <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">Último backup concluído</p>
                <p className="text-sm text-gray-900 mt-0.5">
                  {dataHora(ultimo.em)}
                  {servidor?.ultimo?.usuarioNome ? ` · por ${servidor.ultimo.usuarioNome}` : ''}
                </p>
                <p className="text-xs text-gray-500 break-all">
                  {ultimo.arquivo} · {formatarTamanho(ultimo.tamanho)}
                </p>
              </div>
        }
            {!executando && servidorErro &&
        <p className="text-xs text-amber-700">Não foi possível consultar o servidor agora; a situação pode estar desatualizada.</p>
        }

            <p className="text-xs text-gray-500 leading-relaxed pt-3 border-t border-gray-100">
              O arquivo <code>.sql.gz</code> é restaurado pelo suporte técnico. Arquivos guardados em armazenamento na
              nuvem entram como referência, não como cópia.
            </p>
          </div>
        </div>
    }
    </section>;


  if (embutido) return conteudo;
  return (
    <main className="w-full min-h-full bg-gray-50 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Backup</h1>
        <p className="text-sm text-gray-600 mt-1">Uma cópia diária dos dados da clínica, guardada com você.</p>
      </header>
      {clinicaId ? conteudo : <p className="text-sm text-gray-600">Selecione uma clínica para configurar o backup.</p>}
    </main>);

}