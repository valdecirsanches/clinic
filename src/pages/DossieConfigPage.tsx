import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ServerIcon,
  DatabaseIcon,
  RefreshCwIcon,
  LoaderIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  CopyIcon,
  DownloadIcon,
  ShieldIcon,
  KeyIcon,
  HardDriveIcon,
  MessageCircleIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';

// ==================== TIPOS ====================

interface Segredo {
  definido: boolean;
  tamanho: number;
  final: string;
}

interface BancoInfo {
  banco: string;
  tabelas: number;
  mb: number;
}

interface MysqlInfo {
  host: string;
  porta: number;
  usuario: string;
  senha: Segredo;
  bancoGlobal: string;
  charset: string;
  limiteConexoes: number;
  timeoutConexao: number;
  conectado: boolean;
  erro?: string;
  versao?: string;
  hostnameServidor?: string;
  portaEfetiva?: number;
  charsetServidor?: string;
  maxConexoes?: number;
  uptime?: string;
  conexoesAtivas?: string;
  consultasDesdeStart?: string;
  bancos?: BancoInfo[];
  totalMb?: number;
}

interface VarAmbiente {
  nome: string;
  valor?: string | null;
  definido: boolean;
  tamanho?: number;
  final?: string;
}

interface Dossie {
  geradoEm: string;
  geradoPor: {id: string;nome: string;email: string;};
  mysql: MysqlInfo;
  ambiente: {
    servidor: Record<string, string | number>;
    grupos: {titulo: string;vars: VarAmbiente[];}[];
  };
  arquivosEnv: {arquivo: string;existe: boolean;atualizadoEm: string | null;}[];
  integracoes: {
    clinicas: {
      id: string;
      nome: string;
      ativa: boolean;
      banco: string;
      waha: {configurado: boolean;ativo?: boolean;sessao?: string | null;};
      meta: {
        configurado: boolean;
        ativo?: boolean;
        preferencial?: boolean;
        numero?: string | null;
        phoneNumberId?: string | null;
        wabaId?: string | null;
        templatesVinculados?: number;
      };
      sms: {
        configurado: boolean;
        ativo?: boolean;
        remetente?: string | null;
        usarComoFallback?: boolean;
      };
    }[];
    chavesConfig: {chave: string;tamanho: number;atualizadoEm: string | null;}[];
    erros: string[];
  };
  inventario: Record<string, number | null>;
}

// ==================== APOIO VISUAL ====================

function Selo({
  ok,
  sim,
  nao




}: {ok: boolean;sim: string;nao: string;}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
      ok ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`
      }>
      
      {ok ?
      <CheckCircle2Icon className="h-3 w-3" /> :

      <XCircleIcon className="h-3 w-3" />
      }
      {ok ? sim : nao}
    </span>);

}

function Linha({
  rotulo,
  valor,
  mono = false




}: {rotulo: string;valor: React.ReactNode;mono?: boolean;}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-56 flex-shrink-0 text-xs uppercase tracking-wide text-gray-500">
        {rotulo}
      </dt>
      <dd
        className={`min-w-0 break-all text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>
        
        {valor}
      </dd>
    </div>);

}

function Secao({
  titulo,
  descricao,
  icone: Icone,
  children





}: {titulo: string;descricao?: string;icone: React.ElementType;children: React.ReactNode;}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start gap-3 border-b border-gray-100 p-5">
        <span className="rounded-lg bg-gray-100 p-2">
          <Icone className="h-5 w-5 text-gray-600" />
        </span>
        <div>
          <h2 className="font-semibold text-gray-900">{titulo}</h2>
          {descricao && <p className="text-sm text-gray-500">{descricao}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>);

}

// ==================== PÁGINA ====================

export function DossieConfigPage() {
  const [dossie, setDossie] = useState<Dossie | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // O servidor confere o tipo do usuário; a tela apenas informa quem pede.
  const usuarioId = useMemo(() => {
    try {
      const bruto = localStorage.getItem('sessao');
      if (!bruto) return '';
      return String(JSON.parse(bruto)?.usuario?.id || '');
    } catch {
      return '';
    }
  }, []);

  const carregar = useCallback(async () => {
    if (!usuarioId) {
      setErro('Sessão não identificada. Entre novamente no sistema.');
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `${API_BASE_URL}/api/dossie?usuarioId=${encodeURIComponent(usuarioId)}`
      );
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        throw new Error(dados?.error || `HTTP ${resposta.status}`);
      }
      setDossie(dados);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gerar o dossiê.');
      setDossie(null);
    } finally {
      setCarregando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const urlTexto = `${API_BASE_URL}/api/dossie/texto?usuarioId=${encodeURIComponent(usuarioId)}`;

  const copiarTexto = async () => {
    try {
      const resposta = await fetch(urlTexto);
      const texto = await resposta.text();
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('Não foi possível copiar. Use o botão "Abrir em texto".');
    }
  };

  const m = dossie?.mysql;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-gray-900 p-2.5">
            <ServerIcon className="h-6 w-6 text-white" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Dossiê de Configuração
            </h1>
            <p className="text-sm text-gray-500">
              Retrato completo desta instalação: banco de dados, ambiente do
              servidor e integrações de cada clínica.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
            
            {carregando ?
            <LoaderIcon className="h-4 w-4 animate-spin" /> :

            <RefreshCwIcon className="h-4 w-4" />
            }
            Atualizar
          </button>
          <button
            type="button"
            onClick={copiarTexto}
            disabled={!dossie}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
            
            <CopyIcon className="h-4 w-4" />
            {copiado ? 'Copiado!' : 'Copiar tudo'}
          </button>
          <a
            href={urlTexto}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">
            
            <DownloadIcon className="h-4 w-4" />
            Abrir em texto
          </a>
        </div>
      </header>

      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <ShieldIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
        Senhas, tokens e chaves de API <strong>nunca</strong> são exibidos —
        apenas se estão definidos, o tamanho e os 4 últimos caracteres. Acesso
        restrito ao super administrador e verificado no servidor.
      </p>

      {erro &&
      <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {erro}
        </p>
      }

      {carregando && !dossie &&
      <p className="flex items-center gap-2 text-sm text-gray-500">
          <LoaderIcon className="h-4 w-4 animate-spin" />
          Levantando a configuração do servidor...
        </p>
      }

      {dossie &&
      <>
          {/* ===== MySQL ===== */}
          <Secao
          titulo="Banco de dados MySQL"
          descricao="Endereço, credencial de acesso e estado real da conexão"
          icone={DatabaseIcon}>
          
            <dl>
              <Linha
              rotulo="Host : porta"
              valor={`${m?.host}:${m?.porta}`}
              mono />
            
              <Linha rotulo="Usuário" valor={m?.usuario} mono />
              <Linha
              rotulo="Senha"
              valor={
              m?.senha.definido ?
              <span className="inline-flex items-center gap-2">
                      <KeyIcon className="h-3.5 w-3.5 text-gray-400" />
                      definida ({m.senha.tamanho} caracteres, {m.senha.final})
                    </span> :

              <span className="text-red-700">não definida</span>

              } />
            
              <Linha rotulo="Banco global" valor={m?.bancoGlobal} mono />
              <Linha
              rotulo="Conexão"
              valor={
              m?.conectado ?
              <Selo ok sim="Conectado" nao="" /> :

              <span className="text-red-700">
                      falhou — {m?.erro || 'sem detalhe'}
                    </span>

              } />
            
              {m?.conectado &&
            <>
                  <Linha rotulo="Versão do MySQL" valor={m.versao} />
                  <Linha
                rotulo="Hostname do servidor"
                valor={m.hostnameServidor}
                mono />
              
                  <Linha rotulo="Uptime do MySQL" valor={m.uptime} />
                  <Linha
                rotulo="Conexões"
                valor={`${m.conexoesAtivas} ativas · máximo ${m.maxConexoes} · pool do app ${m.limiteConexoes}`} />
              
                  <Linha
                rotulo="Charset"
                valor={`app ${m.charset} · servidor ${m.charsetServidor}`} />
              
                  <Linha
                rotulo="Consultas desde o start"
                valor={m.consultasDesdeStart} />
              
                </>
            }
            </dl>

            {!!m?.bancos?.length &&
          <div className="mt-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <HardDriveIcon className="h-4 w-4 text-gray-400" />
                  Bancos ({m.bancos.length}) · {m.totalMb?.toFixed(2)} MB no
                  total
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th scope="col" className="pb-2 pr-3 font-medium">
                          Banco
                        </th>
                        <th scope="col" className="pb-2 pr-3 font-medium">
                          Tabelas
                        </th>
                        <th scope="col" className="pb-2 font-medium">
                          Tamanho
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {m.bancos.map((b) =>
                  <tr key={b.banco}>
                          <td className="py-2 pr-3 font-mono text-gray-900">
                            {b.banco}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {b.tabelas}
                          </td>
                          <td className="py-2 text-gray-600">{b.mb} MB</td>
                        </tr>
                  )}
                    </tbody>
                  </table>
                </div>
              </div>
          }
          </Secao>

          {/* ===== Servidor ===== */}
          <Secao
          titulo="Servidor da aplicação"
          descricao="Processo Node, máquina e horário"
          icone={ServerIcon}>
          
            <dl className="sm:columns-2 sm:gap-8">
              {Object.entries(dossie.ambiente.servidor).map(([k, v]) =>
            <div key={k} className="break-inside-avoid">
                  <Linha rotulo={k} valor={String(v)} />
                </div>
            )}
            </dl>
            <h3 className="mb-2 mt-4 text-sm font-semibold text-gray-900">
              Arquivos .env encontrados
            </h3>
            <ul className="space-y-1 text-sm">
              {dossie.arquivosEnv.map((a) =>
            <li key={a.arquivo} className="flex items-start gap-2">
                  {a.existe ?
              <CheckCircle2Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" /> :

              <XCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300" />
              }
                  <span
                className={`break-all font-mono text-xs ${a.existe ? 'text-gray-800' : 'text-gray-400'}`}>
                
                    {a.arquivo}
                    {a.atualizadoEm && ` · ${a.atualizadoEm}`}
                  </span>
                </li>
            )}
            </ul>
          </Secao>

          {/* ===== Variáveis ===== */}
          <Secao
          titulo="Variáveis de ambiente"
          descricao="O que o servidor realmente leu — em branco significa que o padrão do código está em uso"
          icone={KeyIcon}>
          
            <div className="space-y-5">
              {dossie.ambiente.grupos.map((g) =>
            <div key={g.titulo}>
                  <h3 className="mb-1.5 text-sm font-semibold text-gray-900">
                    {g.titulo}
                  </h3>
                  <ul className="divide-y divide-gray-100">
                    {g.vars.map((v) => {
                  const eSegredo = !('valor' in v);
                  return (
                    <li
                      key={v.nome}
                      className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
                      
                          <span className="w-80 flex-shrink-0 font-mono text-xs text-gray-600">
                            {v.nome}
                          </span>
                          <span className="min-w-0 break-all font-mono text-xs">
                            {v.definido ?
                        eSegredo ?
                        <span className="text-gray-800">
                                  definido ({v.tamanho} chars, {v.final})
                                </span> :

                        <span className="text-gray-900">{v.valor}</span> :


                        <span className="text-gray-400">
                                (não definida)
                              </span>
                        }
                          </span>
                        </li>);

                })}
                  </ul>
                </div>
            )}
            </div>
          </Secao>

          {/* ===== Integrações por clínica ===== */}
          <Secao
          titulo={`Integrações por clínica (${dossie.integracoes.clinicas.length})`}
          descricao="Estado de WhatsApp (WAHA), WhatsApp oficial (Meta) e SMS"
          icone={MessageCircleIcon}>
          
            <div className="space-y-3">
              {dossie.integracoes.clinicas.map((c) =>
            <div
              key={c.id}
              className="rounded-lg border border-gray-200 p-4">
              
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{c.nome}</p>
                    {!c.ativa &&
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Inativa
                      </span>
                }
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-gray-500">
                    {c.id} · {c.banco}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
                        WhatsApp (WAHA)
                      </p>
                      {c.waha.configurado ?
                  <>
                          <Selo
                      ok={Boolean(c.waha.ativo)}
                      sim="Ativo"
                      nao="Inativo" />
                    
                          <p className="mt-1 font-mono text-xs text-gray-600">
                            sessão {c.waha.sessao || '—'}
                          </p>
                        </> :

                  <p className="text-xs text-gray-400">
                          não configurado
                        </p>
                  }
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
                        WhatsApp oficial
                      </p>
                      {c.meta.configurado ?
                  <>
                          <Selo
                      ok={Boolean(c.meta.ativo)}
                      sim="Ativo"
                      nao="Inativo" />
                    
                          <p className="mt-1 text-xs text-gray-600">
                            {c.meta.numero || 'sem número'} ·{' '}
                            {c.meta.templatesVinculados} template(s)
                            {c.meta.preferencial && ' · prioritário'}
                          </p>
                          <p className="font-mono text-[11px] text-gray-400">
                            WABA {c.meta.wabaId || '—'}
                          </p>
                        </> :

                  <p className="text-xs text-gray-400">
                          não configurado
                        </p>
                  }
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
                        SMS
                      </p>
                      {c.sms.configurado ?
                  <>
                          <Selo
                      ok={Boolean(c.sms.ativo)}
                      sim="Ativo"
                      nao="Inativo" />
                    
                          <p className="mt-1 text-xs text-gray-600">
                            remetente {c.sms.remetente || '—'}
                            {c.sms.usarComoFallback && ' · alternativa'}
                          </p>
                        </> :

                  <p className="text-xs text-gray-400">
                          não configurado
                        </p>
                  }
                    </div>
                  </div>
                </div>
            )}
            </div>

            {!!dossie.integracoes.erros.length &&
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-1 text-sm font-semibold text-amber-800">
                  Leituras que falharam
                </p>
                <ul className="space-y-0.5 font-mono text-xs text-amber-800">
                  {dossie.integracoes.erros.map((e) =>
              <li key={e}>{e}</li>
              )}
                </ul>
              </div>
          }
          </Secao>

          {/* ===== Inventário ===== */}
          <Secao
          titulo="Inventário do banco global"
          descricao="Volume de registros em cada tabela principal"
          icone={HardDriveIcon}>
          
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(dossie.inventario).map(([k, v]) =>
            <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    {k}
                  </dt>
                  <dd className="text-xl font-semibold text-gray-900">
                    {v === null ?
                <span className="text-sm font-normal text-gray-400">
                        tabela ausente
                      </span> :

                v.toLocaleString('pt-BR')
                }
                  </dd>
                </div>
            )}
            </dl>

            {!!dossie.integracoes.chavesConfig.length &&
          <details className="mt-5">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  Chaves gravadas em configuracoes_globais (
                  {dossie.integracoes.chavesConfig.length})
                </summary>
                <ul className="mt-2 divide-y divide-gray-100">
                  {dossie.integracoes.chavesConfig.map((c) =>
              <li
                key={c.chave}
                className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 font-mono text-xs">
                
                      <span className="break-all text-gray-800">{c.chave}</span>
                      <span className="text-gray-500">
                        {c.tamanho} chars · {c.atualizadoEm || 's/ data'}
                      </span>
                    </li>
              )}
                </ul>
              </details>
          }
          </Secao>

          <p className="text-xs text-gray-400">
            Gerado em {new Date(dossie.geradoEm).toLocaleString('pt-BR')} por{' '}
            {dossie.geradoPor.nome}.
          </p>
        </>
      }
    </div>);

}