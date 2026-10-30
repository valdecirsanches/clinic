import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FolderIcon,
  LoaderIcon,
  PlayIcon,
  RefreshCwIcon,
  XCircleIcon } from
'lucide-react';
import { Button } from '../components/ui/Button';
import { ClinicaBackupLinha } from '../components/backup/ClinicaBackupLinha';
import { BACKUP_API_URL as API_BASE_URL } from '../config/api';

interface ConfigBackup {
  ativo: boolean;
  pasta: string;
  horario: string;
  dias: number[];
  clinicas: 'todas' | string[];
  manter: number;
}

interface ExecucaoBackup {
  clinicaId: string;
  clinicaNome?: string;
  origem?: string;
  ok: boolean;
  arquivo?: string;
  tamanho?: number;
  tabelas?: number;
  linhas?: number;
  duracaoSeg?: number;
  erro?: string;
  em: string;
}

interface EstadoBackup {
  config: ConfigBackup;
  pasta: {ok: boolean;livreBytes: number | null;erro: string | null;};
  proximaExecucao: string | null;
  emExecucao: string[];
  clinicas: {id: string;nome: string;}[];
  historico: ExecucaoBackup[];
  horaServidor: string;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function tamanho(bytes?: number | null) {
  if (bytes == null) return '—';
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function usuarioDaSessao(): string {
  try {
    return String(JSON.parse(localStorage.getItem('sessao') || '{}')?.usuario?.id || '');
  } catch {
    return '';
  }
}

const normalizarNome = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function BackupPage() {
  const usuarioId = useMemo(usuarioDaSessao, []);
  const qs = `usuarioId=${encodeURIComponent(usuarioId)}`;
  const [estado, setEstado] = useState<EstadoBackup | null>(null);
  const [form, setForm] = useState<ConfigBackup | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async (manterForm = false) => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/backup?${qs}`);
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setEstado(d);
      if (!manterForm) setForm(d.config);
    } catch (e: any) {
      setErro(e.message);
    }
  }, [qs]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!estado?.emExecucao.length) return;
    const t = window.setInterval(() => carregar(true), 4000);
    return () => window.clearInterval(t);
  }, [estado?.emExecucao.length, carregar]);

  const postar = async (caminho: string, corpo: object) => {
    const r = await fetch(`${API_BASE_URL}/api/backup${caminho}?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...corpo, usuarioId })
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
    return d;
  };

  const salvar = async () => {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      await postar('/config', form);
      setAviso('Configuração salva.');
      await carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const executar = async (clinicaId?: string) => {
    setErro(null);
    setAviso(null);
    try {
      await postar('/executar', clinicaId ? { clinicaId } : {});
      setAviso('Backup iniciado no servidor. O andamento aparece em cada clínica e no histórico.');
      window.setTimeout(() => carregar(true), 1500);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  if (!form || !estado) {
    return (
      <main className="w-full p-6">
        {erro ? <p role="alert" className="text-sm text-red-700">{erro}</p> :
        <p className="flex items-center gap-2 text-sm text-gray-500"><LoaderIcon className="w-4 h-4 animate-spin" /> Carregando...</p>
        }
      </main>);

  }

  const ativas = new Set(estado.clinicas.map((c) => c.id));
  const marcadas = form.clinicas === 'todas' ?
  estado.clinicas.map((c) => c.id) :
  [...new Set(form.clinicas as string[])].filter((id) => ativas.has(id));
  const marcadasSalvas = estado.config.clinicas === 'todas' ?
  estado.clinicas.map((c) => c.id) :
  (estado.config.clinicas as string[]).filter((id) => ativas.has(id));
  const alterado = JSON.stringify({ ...form, clinicas: [...marcadas].sort() }) !==
  JSON.stringify({ ...estado.config, clinicas: [...marcadasSalvas].sort() });

  // Nomes repetidos (ex.: "Fortaleza" e "FORTALEZA") são clínicas diferentes:
  // ganham o código ao lado para não serem confundidas.
  const contagemNomes = new Map<string, number>();
  estado.clinicas.forEach((c) => contagemNomes.set(normalizarNome(c.nome), (contagemNomes.get(normalizarNome(c.nome)) || 0) + 1));

  // Marcadas primeiro; dentro de cada grupo, ordem alfabética.
  const listaClinicas = [...estado.clinicas].sort((a, b) => {
    const ma = marcadas.includes(a.id) ? 0 : 1;
    const mb = marcadas.includes(b.id) ? 0 : 1;
    return ma - mb || a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const ultimoPorClinica = new Map<string, ExecucaoBackup>();
  estado.historico.forEach((h) => {
    if (!ultimoPorClinica.has(h.clinicaId)) ultimoPorClinica.set(h.clinicaId, h);
  });
  const ultimo = estado.historico[0];
  const marcar = (id: string, sim: boolean) =>
  setForm({ ...form, clinicas: sim ? [...marcadas, id] : marcadas.filter((x) => x !== id) });

  return (
    <main className="w-full min-h-full bg-gray-50 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Backup</h1>
          <p className="text-sm text-gray-600 mt-1">
            Cópia completa dos dados das clínicas marcadas, gravada numa pasta do servidor.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => carregar(true)}>
            <RefreshCwIcon className="w-4 h-4 mr-1 inline" /> Atualizar
          </Button>
          <Button
            onClick={() => executar()}
            disabled={!estado.config.pasta || estado.emExecucao.length > 0 || alterado || !marcadas.length}
            title={alterado ? 'Salve as alterações antes' : undefined}>
            
            {estado.emExecucao.length ? <LoaderIcon className="w-4 h-4 mr-1 inline animate-spin" /> : <PlayIcon className="w-4 h-4 mr-1 inline" />}
            {estado.emExecucao.length ? `Executando (${estado.emExecucao.length})` : `Fazer backup das ${marcadas.length} marcadas`}
          </Button>
        </div>
      </header>

      <section className="flex flex-wrap gap-x-10 gap-y-3 bg-white border border-gray-200 rounded-lg px-5 py-4">
        <div>
          <p className="text-xs text-gray-500">Agendamento</p>
          <p className="text-base font-semibold text-gray-900">
            {estado.config.ativo && estado.proximaExecucao ? `Próximo: ${dataHora(estado.proximaExecucao)}` : 'Desativado'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Último backup</p>
          <p className={`text-base font-semibold ${!ultimo ? 'text-gray-900' : ultimo.ok ? 'text-green-700' : 'text-red-700'}`}>
            {ultimo ? `${dataHora(ultimo.em)} · ${ultimo.ok ? 'sucesso' : 'falhou'}` : 'Nenhum'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Espaço livre na pasta</p>
          <p className="text-base font-semibold text-gray-900">
            {estado.pasta.ok ? tamanho(estado.pasta.livreBytes) : estado.config.pasta ? 'Pasta inacessível' : '—'}
          </p>
        </div>
      </section>

      {estado.pasta.erro &&
      <p className="flex gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" /> {estado.pasta.erro}
        </p>
      }
      {erro && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{erro}</p>}
      {aviso && <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">{aviso}</p>}

      {alterado &&
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-900">Há alterações não salvas.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setForm(estado.config)}>Descartar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando || !marcadas.length}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      }

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 items-start">
        {/* Onde e quando */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
          <h2 className="font-semibold text-gray-900">Onde e quando</h2>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Pasta de destino (no servidor)</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 focus-within:ring-2 focus-within:ring-teal-500">
              <FolderIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                value={form.pasta}
                onChange={(e) => setForm({ ...form, pasta: e.target.value })}
                placeholder="/var/backups/easyclin"
                className="flex-1 py-2 text-sm font-mono outline-none bg-transparent min-w-0" />
              
            </div>
            <span className="block text-xs text-gray-500 mt-1">Caminho absoluto no backend. Cada clínica ganha sua subpasta.</span>
          </label>

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="w-4 h-4 accent-teal-600" />
            <span className="text-sm font-medium text-gray-700">Executar automaticamente</span>
          </label>

          {form.ativo &&
          <div className="space-y-4">
              <label className="block max-w-[140px]">
                <span className="block text-sm text-gray-700 mb-1">Horário</span>
                <input type="time" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" />
              </label>
              <fieldset>
                <legend className="text-sm text-gray-700 mb-1">Dias</legend>
                <div className="flex flex-wrap gap-1">
                  {DIAS.map((d, i) => {
                  const marcado = form.dias.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() => setForm({ ...form, dias: marcado ? form.dias.filter((x) => x !== i) : [...form.dias, i].sort() })}
                      className={`w-11 py-2 rounded-lg text-sm font-medium transition-colors ${marcado ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      
                        {d}
                      </button>);

                })}
                </div>
              </fieldset>
            </div>
          }

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">Manter os últimos</span>
            <input type="number" min={1} max={365} value={form.manter} onChange={(e) => setForm({ ...form, manter: Number(e.target.value) || 1 })} className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" />
            <span className="whitespace-nowrap text-gray-500">backups por clínica</span>
          </label>

          <p className="text-xs text-gray-500 pt-3 border-t border-gray-100">
            Hora do servidor: {estado.horaServidor.slice(0, 24)} · Restaurar:{' '}
            <code className="font-mono">gunzip -c ARQUIVO.sql.gz | mysql -u USUARIO -p</code>
          </p>
        </section>

        {/* Clínicas: seleção + arquivos numa lista só */}
        <section className="bg-white border border-gray-200 rounded-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
            <div>
              <h2 className="font-semibold text-gray-900">Clínicas</h2>
              <p className={`text-xs mt-0.5 ${marcadas.length ? 'text-gray-500' : 'text-red-700'}`}>
                {marcadas.length ?
                `${marcadas.length} de ${estado.clinicas.length} entram no backup. As desmarcadas ficam de fora.` :
                'Marque ao menos uma clínica.'}
              </p>
            </div>
            <div className="flex gap-3 text-sm">
              <button type="button" onClick={() => setForm({ ...form, clinicas: estado.clinicas.map((c) => c.id) })} className="text-teal-700 hover:underline">
                Marcar todas
              </button>
              <button type="button" onClick={() => setForm({ ...form, clinicas: [] })} className="text-gray-600 hover:underline">
                Desmarcar todas
              </button>
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {listaClinicas.map((c) =>
            <ClinicaBackupLinha
              key={c.id}
              id={c.id}
              nome={c.nome}
              detalhe={(contagemNomes.get(normalizarNome(c.nome)) || 0) > 1 ? c.id : undefined}
              marcada={marcadas.includes(c.id)}
              onMarcar={(sim) => marcar(c.id, sim)}
              ultimo={ultimoPorClinica.get(c.id)}
              executando={estado.emExecucao.includes(c.id)}
              podeExecutar={!!estado.config.pasta && !alterado}
              onExecutar={() => executar(c.id)}
              qs={qs}
              atualizarEm={estado.historico.length} />

            )}
          </ul>
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg">
        <h2 className="font-semibold text-gray-900 px-5 py-4 border-b border-gray-200">Histórico</h2>
        {!estado.historico.length ?
        <p className="px-5 py-6 text-sm text-gray-500">Nenhuma execução ainda.</p> :

        <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Quando</th>
                  <th className="text-left font-medium px-5 py-2">Clínica</th>
                  <th className="text-left font-medium px-5 py-2">Origem</th>
                  <th className="text-left font-medium px-5 py-2">Resultado</th>
                  <th className="text-right font-medium px-5 py-2">Tamanho</th>
                  <th className="text-right font-medium px-5 py-2">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {estado.historico.map((h, i) =>
              <tr key={`${h.em}-${i}`}>
                    <td className="px-5 py-2 whitespace-nowrap text-gray-700">{dataHora(h.em)}</td>
                    <td className="px-5 py-2 text-gray-900">{h.clinicaNome || h.clinicaId}</td>
                    <td className="px-5 py-2 text-gray-500">{h.origem === 'agendado' ? 'Agendado' : 'Manual'}</td>
                    <td className="px-5 py-2">
                      {h.ok ?
                  <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2Icon className="w-4 h-4" /> {h.tabelas} tabelas · {h.linhas?.toLocaleString('pt-BR')} registros</span> :

                  <span className="inline-flex items-start gap-1 text-red-700"><XCircleIcon className="w-4 h-4 mt-0.5 shrink-0" /> {h.erro}</span>
                  }
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-gray-700">{h.ok ? tamanho(h.tamanho) : '—'}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-gray-500">{h.duracaoSeg ?? 0}s</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </section>
    </main>);

}