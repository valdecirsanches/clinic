// ==================== ASSISTENTE — DADOS DA AGENDA ====================
// Toda informação que o assistente mostra ou grava sai DAQUI, direto do
// banco. A IA só interpreta o pedido; ela nunca inventa paciente, horário
// ou disponibilidade.
//
// Regras idênticas às da tela da agenda:
//   • dia "fechado" (cadeado) bloqueia sempre;
//   • o dia só está aberto com abertura manual ("aberto") ou marcação real;
//   • o assistente NUNCA abre um dia — isso continua sendo decisão do usuário.

const { getClinicaDB } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');

const PLACEHOLDERS = new Set(['disponivel', 'livre', 'bloqueado', 'removido']);
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function semAcento(valor) {
  return String(valor || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toLowerCase().
  trim();
}

/** Nome sem títulos (Dr., Dra., Doutor...) para comparar profissionais. */
function nomeComparavel(valor) {
  return semAcento(valor).
  replace(/\b(dra?|doutora?|dr|prof|professora?)\b\.?/g, ' ').
  replace(/[^a-z\s]/g, ' ').
  replace(/\s+/g, ' ').
  trim();
}

function normalizarData(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const ano = Number(iso && iso[1] || br && br[3]);
  const mes = Number(iso && iso[2] || br && br[2]);
  const dia = Number(iso && iso[3] || br && br[1]);
  const d = new Date(ano, mes - 1, dia, 12);
  if (!Number.isInteger(ano) || d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function normalizarHora(valor) {
  const m = String(valor || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function paraDate(dataKey) {
  const [a, m, d] = dataKey.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

function somarDias(dataKey, dias) {
  const d = paraDate(dataKey);
  d.setDate(d.getDate() + dias);
  return normalizarData(d);
}

function dataPorExtenso(dataKey) {
  const d = paraDate(dataKey);
  return `${DIAS_SEMANA[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function semanaAB(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const epoca = new Date(1970, 0, 1, 12);
  const semanas = Math.floor(Math.floor((d - epoca) / 86400000) / 7);
  return semanas % 2 === 0 ? 'A' : 'B';
}

/** Mesma regra canônica de utils/recorrenciaAgenda.ts (slotValeNaData). */
function horarioValeNaData(h, date, dataKey) {
  if (Array.isArray(h.datasEspecificas) && h.datasEspecificas.length) {
    return h.datasEspecificas.some((d) => normalizarData(String(d)) === dataKey);
  }
  if (Number(h.diaSemana) !== date.getDay()) return false;
  const rec = h.recorrencia || 'toda_semana';
  if (rec === 'semana_A' || rec === 'semana_B') return semanaAB(date) === (rec === 'semana_A' ? 'A' : 'B');
  return true;
}

function ehMarcacaoReal(c) {
  const pid = String(c.pacienteId || '').trim().toLowerCase();
  const st = String(c.status || '').trim().toLowerCase();
  return !PLACEHOLDERS.has(pid) && st !== 'cancelada';
}

function lerJson(valor) {
  if (!valor) return null;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------

async function listarProfissionais(clinicaId) {
  const db = getClinicaDB(clinicaId);
  const [agendas] = await db.execute('SELECT * FROM agendas');
  const [horarios] = await db.execute('SELECT * FROM horarios_trabalho').catch(() => [[]]);
  const usuarios = await dbGlobal.
  prepare("SELECT id, nome, tipo FROM usuarios WHERE tipo IN ('medico','dentista')").
  all().
  catch(() => []);
  const nomePorId = new Map((usuarios || []).map((u) => [String(u.id), u]));

  const porProf = new Map();
  for (const ag of agendas || []) {
    const id = String(ag.profissionalId || '');
    if (!id) continue;
    const usuario = nomePorId.get(id);
    const atual = porProf.get(id) || {
      id,
      nome: ag.profissionalNome || usuario && usuario.nome || 'Profissional',
      especialidade: ag.especialidade || usuario && usuario.tipo || '',
      ativo: false,
      horarios: []
    };
    atual.ativo = atual.ativo || Boolean(Number(ag.ativo) || ag.ativo === true);
    for (const h of horarios || []) {
      if (String(h.agendaId) !== String(ag.id)) continue;
      atual.horarios.push({
        ...h,
        datasEspecificas: lerJson(h.datasEspecificas),
        horariosManuais: lerJson(h.horariosManuais)
      });
    }
    porProf.set(id, atual);
  }
  return Array.from(porProf.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Encontra o profissional pelo nome falado. Retorna { profissional } ou { candidatos }. */
function resolverProfissional(profissionais, nomeFalado) {
  const alvo = nomeComparavel(nomeFalado);
  if (!alvo) return { candidatos: [] };
  const exato = profissionais.filter((p) => nomeComparavel(p.nome) === alvo);
  if (exato.length === 1) return { profissional: exato[0] };
  const palavras = alvo.split(' ').filter((w) => w.length > 1);
  const parciais = profissionais.filter((p) => {
    const nome = nomeComparavel(p.nome);
    return palavras.every((w) => nome.split(' ').some((n) => n.startsWith(w)));
  });
  if (parciais.length === 1) return { profissional: parciais[0] };
  return { candidatos: parciais.slice(0, 6) };
}

async function statusDosDias(db, profissionalId) {
  const mapa = new Map();
  try {
    const [rows] = await db.execute(
      'SELECT data, status FROM agenda_dias_status WHERE profissionalId = ? ORDER BY criadoEm ASC, id ASC',
      [profissionalId]
    );
    for (const r of rows || []) {
      const d = normalizarData(String(r.data));
      if (d) mapa.set(d, String(r.status || ''));
    }
  } catch (e) {

    // Tabela ainda não criada: nenhum dia aberto manualmente.
  }return mapa;
}

async function consultasDoDia(db, profissionalId, dataKey) {
  const [rows] = await db.execute(
    'SELECT id, pacienteId, status, horario, data FROM consultas WHERE profissionalId = ? AND data BETWEEN ? AND ?',
    [profissionalId, `${dataKey} 00:00:00`, `${dataKey} 23:59:59`]
  );
  return rows || [];
}

/**
 * Horários livres de um profissional numa data, respeitando cadeado,
 * grade, bloqueios e horários já ocupados.
 */
async function horariosLivres(clinicaId, profissional, dataKey, agora) {
  const db = getClinicaDB(clinicaId);
  if (!profissional.ativo) return { aberto: false, motivo: 'a agenda deste profissional está inativa', slots: [] };

  const date = paraDate(dataKey);
  const [status, consultas] = await Promise.all([
  statusDosDias(db, profissional.id),
  consultasDoDia(db, profissional.id, dataKey)]
  );
  const st = status.get(dataKey);
  const temReal = consultas.some(ehMarcacaoReal);
  if (st === 'fechado') return { aberto: false, motivo: 'o dia está fechado (cadeado)', slots: [] };
  if (st !== 'aberto' && !temReal) {
    return { aberto: false, motivo: 'o dia ainda não foi aberto na agenda (cadeado)', slots: [] };
  }

  const ocupado = (hora) =>
  consultas.some((c) => {
    if (normalizarHora(c.horario) !== hora) return false;
    const pid = String(c.pacienteId || '').trim().toLowerCase();
    if (pid === 'bloqueado' || pid === 'removido') return true;
    const s = String(c.status || '').trim().toLowerCase();
    return s !== 'cancelada' && s !== 'aguardando_remarcacao' && pid !== 'disponivel' && pid !== 'livre';
  });

  const slots = new Set();
  let duracaoPadrao = 30;
  for (const h of profissional.horarios.filter((x) => horarioValeNaData(x, date, dataKey))) {
    duracaoPadrao = Number(h.duracaoConsultaPadrao) || duracaoPadrao;
    if (Array.isArray(h.horariosManuais) && h.horariosManuais.length) {
      h.horariosManuais.map(normalizarHora).filter(Boolean).forEach((hr) => !ocupado(hr) && slots.add(hr));
      continue;
    }
    const ini = normalizarHora(h.horaInicio);
    const fim = normalizarHora(h.horaFim);
    if (!ini || !fim || ini === '00:00' && fim === '00:00') continue;
    const min = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    let atual = min(ini);
    const final = min(fim);
    const intIni = h.intervaloInicio ? min(normalizarHora(h.intervaloInicio) || '00:00') : 0;
    const intFim = h.intervaloFim ? min(normalizarHora(h.intervaloFim) || '00:00') : 0;
    const passo = Number(h.duracaoConsultaPadrao) || 30;
    while (atual < final) {
      if (atual >= intIni && atual < intFim) {
        atual = intFim;
        continue;
      }
      const hr = `${String(Math.floor(atual / 60)).padStart(2, '0')}:${String(atual % 60).padStart(2, '0')}`;
      if (!ocupado(hr)) slots.add(hr);
      atual += passo;
    }
  }
  // Horários livres criados manualmente na tela da agenda.
  consultas.
  filter((c) => ['disponivel', 'livre'].includes(String(c.pacienteId || '').toLowerCase()) && c.status !== 'cancelada').
  forEach((c) => {
    const hr = normalizarHora(c.horario);
    if (hr && !ocupado(hr)) slots.add(hr);
  });

  let lista = Array.from(slots).sort();
  if (agora && agora.hoje === dataKey && agora.hora) lista = lista.filter((hr) => hr > agora.hora);
  if (agora && agora.hoje && dataKey < agora.hoje) lista = [];
  return { aberto: true, slots: lista, duracao: duracaoPadrao, consultas };
}

/** Próximas datas (até 30 dias) em que o profissional tem horário livre. */
async function proximasDatasLivres(clinicaId, profissional, aPartirDe, agora, limite = 3) {
  const resultado = [];
  for (let i = 0; i < 30 && resultado.length < limite; i++) {
    const dataKey = somarDias(aPartirDe, i);
    const r = await horariosLivres(clinicaId, profissional, dataKey, agora);
    if (r.aberto && r.slots.length) resultado.push({ data: dataKey, rotulo: dataPorExtenso(dataKey), slots: r.slots });
  }
  return resultado;
}

async function buscarPacientes(clinicaId, nome) {
  const palavras = String(nome || '').
  trim().
  split(/\s+/).
  filter((w) => w.length > 1).
  slice(0, 5);
  if (!palavras.length) return [];
  const db = getClinicaDB(clinicaId);
  const [rows] = await db.execute(
    `SELECT id, nome, dataNascimento, celular, telefone FROM pacientes
     WHERE ${palavras.map(() => 'nome LIKE ?').join(' AND ')}
     ORDER BY nome LIMIT 6`,
    palavras.map((w) => `%${w}%`)
  );
  return (rows || []).map((p) => ({
    id: String(p.id),
    nome: p.nome,
    dataNascimento: normalizarData(p.dataNascimento instanceof Date ? p.dataNascimento : String(p.dataNascimento || '')),
    telefone: p.celular || p.telefone || ''
  }));
}

async function agendaDoDia(clinicaId, dataKey, profissionalId, profissionais) {
  const db = getClinicaDB(clinicaId);
  const params = [`${dataKey} 00:00:00`, `${dataKey} 23:59:59`];
  let sql = `SELECT c.id, c.horario, c.status, c.pacienteId, c.profissionalId, p.nome AS pacienteNome
             FROM consultas c LEFT JOIN pacientes p ON p.id = c.pacienteId
             WHERE c.data BETWEEN ? AND ?`;
  if (profissionalId) {
    sql += ' AND c.profissionalId = ?';
    params.push(profissionalId);
  }
  const [rows] = await db.execute(`${sql} ORDER BY c.horario`, params);
  const nomes = new Map(profissionais.map((p) => [p.id, p.nome]));
  return (rows || []).filter(ehMarcacaoReal).map((c) => ({
    id: c.id,
    horario: normalizarHora(c.horario),
    status: c.status,
    paciente: c.pacienteNome || 'Paciente',
    profissional: nomes.get(String(c.profissionalId)) || '',
    profissionalId: String(c.profissionalId || '')
  }));
}

async function proximasConsultasPaciente(clinicaId, pacienteId, hoje, profissionais) {
  const db = getClinicaDB(clinicaId);
  const [rows] = await db.execute(
    `SELECT id, data, horario, status, profissionalId FROM consultas
     WHERE pacienteId = ? AND data >= ? ORDER BY data, horario LIMIT 8`,
    [pacienteId, `${hoje} 00:00:00`]
  );
  const nomes = new Map(profissionais.map((p) => [p.id, p.nome]));
  return (rows || []).
  filter((c) => String(c.status || '').toLowerCase() !== 'cancelada').
  map((c) => {
    const data = normalizarData(c.data instanceof Date ? c.data : String(c.data || ''));
    return {
      id: c.id,
      data,
      rotulo: data ? dataPorExtenso(data) : '',
      horario: normalizarHora(c.horario),
      status: c.status,
      profissional: nomes.get(String(c.profissionalId)) || '',
      profissionalId: String(c.profissionalId || '')
    };
  });
}

/** Grava a consulta somente se o horário ainda estiver livre e o dia aberto. */
async function marcarConsulta({ clinicaId, pacienteId, profissionalId, data, horario, usuarioNome, agora }) {
  const profissionais = await listarProfissionais(clinicaId);
  const prof = profissionais.find((p) => p.id === String(profissionalId));
  if (!prof) throw Object.assign(new Error('Profissional não encontrado nesta clínica.'), { status: 404 });
  const dataKey = normalizarData(data);
  const hora = normalizarHora(horario);
  if (!dataKey || !hora) throw Object.assign(new Error('Data ou horário inválido.'), { status: 400 });

  const db = getClinicaDB(clinicaId);
  const [pac] = await db.execute('SELECT id, nome FROM pacientes WHERE id = ?', [pacienteId]);
  const paciente = pac && pac[0];
  if (!paciente) throw Object.assign(new Error('Paciente não encontrado.'), { status: 404 });

  const livre = await horariosLivres(clinicaId, prof, dataKey, agora);
  if (!livre.aberto) throw Object.assign(new Error(`Não foi possível marcar: ${livre.motivo}.`), { status: 409 });
  if (!livre.slots.includes(hora)) {
    throw Object.assign(new Error(`O horário ${hora} não está mais livre. Escolha outro.`), { status: 409, slots: livre.slots });
  }

  const tipo = semAcento(prof.especialidade).includes('dent') ? 'odontologica' : 'medica';
  const observacoes = `Marcado pelo assistente de voz${usuarioNome ? ` por ${usuarioNome}` : ''}`;
  const placeholder = (livre.consultas || []).find(
    (c) =>
    normalizarHora(c.horario) === hora &&
    ['disponivel', 'livre'].includes(String(c.pacienteId || '').toLowerCase()) &&
    c.status !== 'cancelada'
  );

  let id;
  if (placeholder) {
    id = placeholder.id;
    await db.execute(
      "UPDATE consultas SET pacienteId = ?, status = 'agendada', observacoes = ?, cor = '#3B82F6' WHERE id = ?",
      [paciente.id, observacoes, id]
    );
  } else {
    id = `cons${Date.now()}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
    await db.execute(
      `INSERT INTO consultas (id, pacienteId, profissionalId, profissional, data, horario, duracao, tipo, status, observacoes, cor, lembreteEnviado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendada', ?, '#3B82F6', 0)`,
      [id, paciente.id, prof.id, prof.nome, dataKey, hora, livre.duracao || 30, tipo, observacoes]
    );
  }
  return { id, paciente: paciente.nome, profissional: prof.nome, data: dataKey, rotulo: dataPorExtenso(dataKey), horario: hora };
}

async function cancelarConsulta({ clinicaId, consultaId, motivo, canceladoPor, agora }) {
  const db = getClinicaDB(clinicaId);
  const [rows] = await db.execute('SELECT id, status, pacienteId, observacoes, horario, data FROM consultas WHERE id = ?', [consultaId]);
  const c = rows && rows[0];
  if (!c || !ehMarcacaoReal(c)) throw Object.assign(new Error('Consulta não encontrada ou já cancelada.'), { status: 404 });
  const motivoLimpo = String(motivo || '').trim() || 'Solicitado pelo paciente';
  const hoje = agora && agora.hoje || normalizarData(new Date());
  const hora = agora && agora.hora || normalizarHora(new Date().toTimeString());
  const [a, m, d] = hoje.split('-');
  const linha = `🤖 Assistente: CANCELADO em ${d}/${m}/${a} às ${hora} - Motivo: ${motivoLimpo}`;
  await db.execute(
    `UPDATE consultas SET status = 'cancelada', motivoCancelamento = ?, dataCancelamento = ?, horaCancelamento = ?,
     canceladoPor = ?, canalCancelamento = 'Assistente', observacoes = ? WHERE id = ?`,
    [motivoLimpo, hoje, hora, canceladoPor, c.observacoes ? `${c.observacoes}\n${linha}` : linha, consultaId]
  );
  return { id: consultaId, motivo: motivoLimpo };
}

/**
 * Remarcar = marcar o novo horário (com todas as checagens) e só então
 * cancelar o antigo, registrando para onde foi. Se a nova marcação falhar,
 * nada muda.
 */
async function remarcarConsulta({ clinicaId, consultaId, profissionalId, data, horario, usuarioNome, canceladoPor, agora }) {
  const db = getClinicaDB(clinicaId);
  const [rows] = await db.execute('SELECT id, status, pacienteId, horario, data FROM consultas WHERE id = ?', [consultaId]);
  const antiga = rows && rows[0];
  if (!antiga || !ehMarcacaoReal(antiga)) throw Object.assign(new Error('Consulta não encontrada ou já cancelada.'), { status: 404 });
  const nova = await marcarConsulta({ clinicaId, pacienteId: antiga.pacienteId, profissionalId, data, horario, usuarioNome, agora });
  const [a, m, d] = nova.data.split('-');
  await cancelarConsulta({ clinicaId, consultaId, motivo: `Remarcada para ${d}/${m}/${a} às ${nova.horario}`, canceladoPor, agora });
  return nova;
}

/** Números do dia para a recepção: status e próxima consulta de cada profissional. */
async function resumoDoDia(clinicaId, dataKey, profissionais, agora) {
  const itens = await agendaDoDia(clinicaId, dataKey, null, profissionais);
  const porStatus = new Map();
  itens.forEach((c) => porStatus.set(c.status || 'agendada', (porStatus.get(c.status || 'agendada') || 0) + 1));
  const ehHoje = agora && dataKey === agora.hoje;
  const grupos = new Map();
  for (const c of itens) {
    const g = grupos.get(c.profissionalId) || { profissionalId: c.profissionalId, profissional: c.profissional || 'Profissional', total: 0, proxima: null };
    g.total++;
    const futura = !ehHoje || c.horario >= agora.hora;
    if (!g.proxima && futura && !['realizada', 'faltou'].includes(String(c.status))) g.proxima = { horario: c.horario, paciente: c.paciente };
    grupos.set(c.profissionalId, g);
  }
  return {
    total: itens.length,
    porStatus: [...porStatus.entries()].map(([status, quantidade]) => ({ status, quantidade })).sort((x, y) => y.quantidade - x.quantidade),
    porProfissional: [...grupos.values()].sort((x, y) => y.total - x.total)
  };
}

module.exports = {
  remarcarConsulta,
  resumoDoDia,
  listarProfissionais,
  resolverProfissional,
  horariosLivres,
  proximasDatasLivres,
  buscarPacientes,
  agendaDoDia,
  proximasConsultasPaciente,
  marcarConsulta,
  cancelarConsulta,
  normalizarData,
  normalizarHora,
  dataPorExtenso,
  DIAS_SEMANA
};