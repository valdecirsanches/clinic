// ==================== ASSISTENTE — AÇÕES DA AGENDA ====================
// Lógica que já existia em routes/assistente.js, movida para cá sem mudança
// de comportamento. Cada ação recebe um `pedido` (paciente, profissional,
// data, hora, periodo, motivo, tela) e o contexto, e devolve o cartão
// { tipo, fala, dados } que a tela já sabe mostrar.
//
// Usada de dois jeitos:
//   • pelas ferramentas (ferramentas/agenda.js e ferramentas/navegacao.js);
//   • pelo modo clássico (ASSISTENTE_MODO=classico), que ainda classifica a
//     frase numa ação fixa.

const A = require('../services/assistenteAgenda');
const IA = require('../services/assistenteOpenAI');
const { conversa } = require('./agente');

function porPeriodo(slots, periodo) {
  if (periodo === 'manha') return slots.filter((s) => s < '12:00');
  if (periodo === 'tarde') return slots.filter((s) => s >= '12:00');
  return slots;
}

function listaNomes(nomes) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}

function horariosProximos(slots, alvo, n = 6) {
  const min = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return [...slots].sort((a, b) => Math.abs(min(a) - min(alvo)) - Math.abs(min(b) - min(alvo))).slice(0, n).sort();
}

function resolverProf(profissionais, nome) {
  if (!nome) return { vazio: true };
  const r = A.resolverProfissional(profissionais, nome);
  if (r.profissional) return { profissional: r.profissional };
  if (r.candidatos.length > 1) {
    return { fala: `Encontrei mais de um profissional para "${nome}": ${listaNomes(r.candidatos.map((p) => p.nome))}. Qual deles?` };
  }
  return { fala: `Não encontrei o profissional "${nome}" nesta clínica.` };
}



async function marcar(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('Para qual paciente é a consulta?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}". Confira o nome ou cadastre o paciente antes.`);

  const p = resolverProf(profissionais, pedido.profissional);
  if (p.vazio) {
    const ativos = profissionais.filter((x) => x.ativo).map((x) => x.nome);
    return conversa(`Com qual profissional?${ativos.length ? ` Os disponíveis são: ${listaNomes(ativos.slice(0, 8))}.` : ''}`);
  }
  if (!p.profissional) return conversa(p.fala);
  const prof = p.profissional;

  const data = A.normalizarData(String(pedido.data || ''));
  if (data && data < agora.hoje) return conversa('Essa data já passou. Diga outra data.');

  let opcoes = [];
  let aviso = '';
  let selecionado = null;

  if (data) {
    const livre = await A.horariosLivres(clinicaId, prof, data, agora);
    const slots = porPeriodo(livre.slots, pedido.periodo);
    if (livre.aberto && slots.length) {
      const hora = A.normalizarHora(pedido.hora);
      if (hora && slots.includes(hora)) {
        selecionado = { data, horario: hora };
        opcoes = [{ data, rotulo: A.dataPorExtenso(data), slots }];
      } else {
        if (hora) aviso = `${hora} não está livre em ${A.dataPorExtenso(data)}.`;
        opcoes = [{ data, rotulo: A.dataPorExtenso(data), slots: hora ? horariosProximos(slots, hora, 8) : slots }];
      }
    } else {
      aviso = livre.aberto ?
      `Não há horário livre${pedido.periodo ? ` de ${pedido.periodo === 'manha' ? 'manhã' : 'tarde'}` : ''} em ${A.dataPorExtenso(data)}.` :
      `Não dá para marcar em ${A.dataPorExtenso(data)}: ${livre.motivo}.`;
      opcoes = await A.proximasDatasLivres(clinicaId, prof, A.normalizarData(new Date(new Date(`${data}T12:00:00`).getTime() + 86400000)), agora);
    }
  } else {
    opcoes = await A.proximasDatasLivres(clinicaId, prof, agora.hoje, agora);
    opcoes = opcoes.map((o) => ({ ...o, slots: porPeriodo(o.slots, pedido.periodo) })).filter((o) => o.slots.length);
  }

  if (!opcoes.length) {
    return conversa(`${aviso ? `${aviso} ` : ''}${prof.nome} não tem horário livre nos próximos 30 dias. Os dias precisam estar abertos na agenda.`);
  }

  // Aviso de consulta já marcada no mesmo dia (paciente único).
  if (pacientes.length === 1 && selecionado) {
    const futuras = await A.proximasConsultasPaciente(clinicaId, pacientes[0].id, agora.hoje, profissionais);
    const mesmoDia = futuras.find((c) => c.data === selecionado.data);
    if (mesmoDia) aviso = `${aviso ? `${aviso} ` : ''}Atenção: ${pacientes[0].nome} já tem consulta nesse dia às ${mesmoDia.horario}${mesmoDia.profissional ? ` com ${mesmoDia.profissional}` : ''}.`;
  }

  let fala;
  if (pacientes.length > 1) fala = `Encontrei ${pacientes.length} pacientes com esse nome. Escolha o paciente e o horário.`;else
  if (selecionado) fala = `Confirma ${pacientes[0].nome} com ${prof.nome}, ${A.dataPorExtenso(selecionado.data)} às ${selecionado.horario}?`;else
  fala = `${aviso ? `${aviso} ` : ''}Escolha um horário para ${pacientes[0].nome} com ${prof.nome}.`;
  if (selecionado && aviso) fala = `${fala} ${aviso}`;

  return {
    tipo: 'proposta_marcacao',
    fala,
    dados: { pacientes, profissional: { id: prof.id, nome: prof.nome }, opcoes, selecionado, aviso }
  };
}

async function horarios(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  const p = resolverProf(profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const data = A.normalizarData(String(pedido.data || ''));

  if (p.profissional) {
    const prof = p.profissional;
    let grupos;
    let aviso = '';
    if (data) {
      const livre = await A.horariosLivres(clinicaId, prof, data, agora);
      const slots = porPeriodo(livre.slots, pedido.periodo);
      if (livre.aberto && slots.length) grupos = [{ data, rotulo: A.dataPorExtenso(data), slots }];else
      {
        aviso = livre.aberto ? `Sem horário livre em ${A.dataPorExtenso(data)}.` : `${A.dataPorExtenso(data)}: ${livre.motivo}.`;
        grupos = await A.proximasDatasLivres(clinicaId, prof, data, agora);
      }
    } else {
      grupos = await A.proximasDatasLivres(clinicaId, prof, agora.hoje, agora);
    }
    grupos = grupos.map((g) => ({ ...g, slots: porPeriodo(g.slots, pedido.periodo) })).filter((g) => g.slots.length);
    if (!grupos.length) return conversa(`${aviso ? `${aviso} ` : ''}${prof.nome} não tem horário livre nos próximos 30 dias.`);
    const g = grupos[0];
    return {
      tipo: 'horarios',
      fala: `${aviso ? `${aviso} ` : ''}${prof.nome} tem ${g.slots.length} horário${g.slots.length > 1 ? 's' : ''} livre${g.slots.length > 1 ? 's' : ''} em ${g.rotulo}, a partir das ${g.slots[0]}.`,
      dados: { grupos: grupos.map((x) => ({ ...x, profissionalId: prof.id, profissional: prof.nome })) }
    };
  }

  const dia = data || agora.hoje;
  const grupos = [];
  for (const prof of profissionais.filter((x) => x.ativo)) {
    const livre = await A.horariosLivres(clinicaId, prof, dia, agora);
    const slots = porPeriodo(livre.slots, pedido.periodo);
    if (livre.aberto && slots.length) {
      grupos.push({ data: dia, rotulo: A.dataPorExtenso(dia), slots, profissionalId: prof.id, profissional: prof.nome });
    }
  }
  if (!grupos.length) return conversa(`Nenhum profissional tem horário livre em ${A.dataPorExtenso(dia)} (dias precisam estar abertos na agenda).`);
  return {
    tipo: 'horarios',
    fala: `${grupos.length} profissiona${grupos.length > 1 ? 'is têm' : 'l tem'} horário livre em ${A.dataPorExtenso(dia)}.`,
    dados: { grupos }
  };
}

async function agenda(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  const p = resolverProf(profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const data = A.normalizarData(String(pedido.data || '')) || agora.hoje;
  const itens = await A.agendaDoDia(clinicaId, data, p.profissional && p.profissional.id, profissionais);
  const quem = p.profissional ? ` de ${p.profissional.nome}` : '';
  return {
    tipo: 'agenda',
    fala: itens.length ?
    `${itens.length} consulta${itens.length > 1 ? 's' : ''}${quem} em ${A.dataPorExtenso(data)}. A primeira é às ${itens[0].horario}, ${itens[0].paciente}.` :
    `Nenhuma consulta marcada${quem} em ${A.dataPorExtenso(data)}.`,
    dados: { data, rotulo: A.dataPorExtenso(data), profissional: p.profissional ? p.profissional.nome : null, itens }
  };
}

async function consultasPaciente(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('De qual paciente?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}".`);
  const lista = [];
  for (const pac of pacientes.slice(0, 4)) {
    lista.push({ ...pac, consultas: await A.proximasConsultasPaciente(clinicaId, pac.id, agora.hoje, profissionais) });
  }
  const unico = lista.length === 1 ? lista[0] : null;
  let fala;
  if (unico) {
    const c = unico.consultas[0];
    fala = c ?
    `A próxima consulta de ${unico.nome} é ${c.rotulo} às ${c.horario}${c.profissional ? ` com ${c.profissional}` : ''}.` :
    `${unico.nome} não tem consulta futura marcada.`;
  } else {
    fala = `Encontrei ${pacientes.length} pacientes com esse nome.`;
  }
  return { tipo: 'consultas_paciente', fala, dados: { pacientes: lista } };
}

async function cancelar(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('De qual paciente é a consulta a cancelar?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}".`);
  const p = resolverProf(profissionais, pedido.profissional);
  const data = A.normalizarData(String(pedido.data || ''));
  const consultas = [];
  for (const pac of pacientes.slice(0, 4)) {
    const futuras = await A.proximasConsultasPaciente(clinicaId, pac.id, agora.hoje, profissionais);
    futuras.
    filter((c) => (!data || c.data === data) && (!p.profissional || c.profissionalId === p.profissional.id)).
    forEach((c) => consultas.push({ ...c, paciente: pac.nome }));
  }
  if (!consultas.length) return conversa(`Não encontrei consulta futura de ${pedido.paciente}${data ? ` em ${A.dataPorExtenso(data)}` : ''}.`);
  const c = consultas[0];
  return {
    tipo: 'proposta_cancelamento',
    fala:
    consultas.length === 1 ?
    `Confirma o cancelamento da consulta de ${c.paciente}, ${c.rotulo} às ${c.horario}${c.profissional ? ` com ${c.profissional}` : ''}?` :
    `Encontrei ${consultas.length} consultas. Escolha qual cancelar.`,
    dados: { consultas, motivo: pedido.motivo || '' }
  };
}

async function abrirAgenda(pedido, ctx) {
  const p = resolverProf(ctx.profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const data = A.normalizarData(String(pedido.data || '')) || ctx.agora.hoje;
  return {
    tipo: 'navegar',
    fala: `Abrindo a agenda de ${A.dataPorExtenso(data)}${p.profissional ? ` de ${p.profissional.nome}` : ''}.`,
    dados: { data, profissionalId: p.profissional ? p.profissional.id : null }
  };
}

async function remarcar(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('De qual paciente é a consulta a remarcar?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}".`);
  if (pacientes.length > 1) {
    return conversa(`Encontrei ${pacientes.length} pacientes: ${listaNomes(pacientes.map((p) => p.nome))}. Diga o nome completo.`);
  }
  const pac = pacientes[0];
  const futuras = await A.proximasConsultasPaciente(clinicaId, pac.id, agora.hoje, profissionais);
  if (!futuras.length) return conversa(`${pac.nome} não tem consulta futura para remarcar.`);
  // Várias consultas: remarca a mais próxima (o card mostra qual é antes de confirmar).
  const p = resolverProf(profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const atual = futuras[0];
  const prof = p.profissional || profissionais.find((x) => x.id === atual.profissionalId);
  if (!prof) return conversa('Não encontrei o profissional da consulta atual. Diga com quem remarcar.');

  // Reaproveita a busca de horários da marcação.
  const proposta = await marcar({ ...pedido, paciente: pac.nome, profissional: prof.nome }, ctx);
  if (proposta.tipo !== 'proposta_marcacao') return proposta;
  const de = `${atual.rotulo} às ${atual.horario}${atual.profissional ? ` com ${atual.profissional}` : ''}`;
  const sel = proposta.dados.selecionado;
  return {
    tipo: 'proposta_remarcacao',
    fala: sel ?
    `Remarco a consulta de ${pac.nome} de ${de} para ${A.dataPorExtenso(sel.data)} às ${sel.horario}?` :
    `A consulta de ${pac.nome} é ${de}. Escolha o novo horário.`,
    dados: { ...proposta.dados, pacientes: [pac], consulta: { ...atual, paciente: pac.nome } }
  };
}

async function pacientesComConsultas(clinicaId, nome, ctx) {
  const pacientes = await A.buscarPacientes(clinicaId, nome);
  const lista = [];
  for (const pac of pacientes.slice(0, 4)) {
    lista.push({ ...pac, consultas: await A.proximasConsultasPaciente(clinicaId, pac.id, ctx.agora.hoje, ctx.profissionais) });
  }
  return lista;
}

async function abrirPaciente(pedido, ctx, destino) {
  if (!pedido.paciente) return conversa(destino === 'prontuario' ? 'De qual paciente é o prontuário?' : 'Qual paciente?');
  const lista = await pacientesComConsultas(ctx.clinicaId, pedido.paciente, ctx);
  if (!lista.length) {
    return conversa(`Não encontrei paciente com o nome "${pedido.paciente}". Se for paciente novo, diga "cadastrar paciente novo".`);
  }
  if (lista.length === 1) {
    const p = lista[0];
    return destino === 'prontuario' ?
    { tipo: 'abrir_prontuario', fala: `Abrindo o prontuário de ${p.nome}.`, dados: { pacienteId: p.id, nome: p.nome } } :
    { tipo: 'pacientes', fala: `Abrindo o cadastro de ${p.nome}.`, dados: { pacientes: lista, abrir: 'cadastro' } };
  }
  return {
    tipo: 'pacientes',
    fala: `Encontrei ${lista.length} pacientes com esse nome. Escolha qual abrir.`,
    dados: { pacientes: lista, abrir: null }
  };
}

function novoPaciente(pedido) {
  return {
    tipo: 'abrir_cadastro',
    fala: 'Abrindo o cadastro de paciente novo.',
    dados: { pacienteId: null, nome: String(pedido.paciente || '').trim() }
  };
}

function abrirTela(pedido) {
  const rotulo = IA.ROTULO_TELA[pedido.tela] || pedido.tela;
  return { tipo: 'navegar_tela', fala: `Abrindo ${rotulo}.`, dados: { tela: pedido.tela, rotulo } };
}

const NOME_STATUS = {
  agendada: 'agendadas', confirmada: 'confirmadas', aguardando_confirmacao: 'aguardando confirmação',
  realizada: 'realizadas', em_atendimento: 'em atendimento', faltou: 'faltas', chegou: 'na recepção'
};

async function resumoDia(pedido, ctx) {
  const data = A.normalizarData(String(pedido.data || '')) || ctx.agora.hoje;
  const r = await A.resumoDoDia(ctx.clinicaId, data, ctx.profissionais, ctx.agora);
  const rotulo = A.dataPorExtenso(data);
  if (!r.total) return conversa(`Nenhuma consulta marcada em ${rotulo}.`);
  const partes = r.porStatus.slice(0, 3).map((s) => `${s.quantidade} ${NOME_STATUS[s.status] || s.status}`);
  return {
    tipo: 'resumo_dia',
    fala: `${rotulo}: ${r.total} consulta${r.total > 1 ? 's' : ''} com ${r.porProfissional.length} profissiona${r.porProfissional.length > 1 ? 'is' : 'l'}. ${partes.join(', ')}.`,
    dados: { data, rotulo, ...r }
  };
}

const AJUDA =
'Posso abrir o cadastro ou o prontuário de um paciente, cadastrar paciente novo, marcar, remarcar e cancelar consultas, mostrar horários livres, o resumo do dia e abrir qualquer tela ou a agenda de um profissional. Toque em "Comandos" para ver tudo.';


module.exports = {
  marcar,
  horarios,
  agenda,
  consultasPaciente,
  cancelar,
  abrirAgenda,
  remarcar,
  abrirPaciente,
  novoPaciente,
  abrirTela,
  resumoDia,
  AJUDA
};
