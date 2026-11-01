// ==================== FERRAMENTAS — AGENDA ====================
// Consultas de horário e agenda (leitura) e propostas de marcar, remarcar e
// cancelar. As propostas só preparam o cartão: quem grava é /api/assistente/
// marcar|remarcar|cancelar, depois que o usuário confirma na tela.

const acoes = require('../acoes');

const DATA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data no formato AAAA-MM-DD.' };
const HORA = { type: 'string', pattern: '^\\d{1,2}:\\d{2}$', description: 'Hora no formato HH:MM (24h).' };
const PERIODO = { type: 'string', enum: ['manha', 'tarde'], description: 'Restringe a manhã ou tarde.' };
const PROFISSIONAL = { type: 'string', maxLength: 120, description: 'Nome do profissional como foi dito (de preferência o nome exato da lista).' };
const PACIENTE = { type: 'string', maxLength: 120, description: 'Nome do paciente como foi dito. Nunca invente.' };

function objeto(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

// O que volta para a IA: só o necessário para ela responder. Telefone e
// data de nascimento ficam na tela, não vão para a OpenAI.
function semContato(pacientes) {
  return (pacientes || []).map((p) => ({ nome: p.nome, consultas: p.consultas }));
}

module.exports = [
{
  nome: 'horarios_livres',
  tipo: 'leitura',
  pagina: 'agenda',
  descricao:
  'Mostra horários livres de um profissional (ou de todos num dia). Use para perguntas de vaga, encaixe ou disponibilidade. ' +
  'Sem data, procura os próximos dias livres.',
  parametros: objeto({ profissional: PROFISSIONAL, data: DATA, periodo: PERIODO }),
  executar: (args, ctx) => acoes.horarios(args, ctx),
  resumoParaIA: (r) => ({ fala: r.fala, grupos: r.dados && r.dados.grupos })
},
{
  nome: 'agenda_dia',
  tipo: 'leitura',
  pagina: 'agenda',
  descricao: 'Lista as consultas marcadas num dia (hoje se não disser), de um profissional ou de todos. Use para "quem está marcado", "agenda de amanhã".',
  parametros: objeto({ profissional: PROFISSIONAL, data: DATA }),
  executar: (args, ctx) => acoes.agenda(args, ctx),
  resumoParaIA: (r) => ({
    fala: r.fala,
    itens: r.dados && r.dados.itens.map((c) => ({ horario: c.horario, status: c.status, paciente: c.paciente, profissional: c.profissional }))
  })
},
{
  nome: 'resumo_dia',
  tipo: 'leitura',
  pagina: 'agenda',
  descricao: 'Resumo de um dia: total de consultas, por status (confirmadas, aguardando, faltas) e por profissional. Use para "como está o dia".',
  parametros: objeto({ data: DATA }),
  executar: (args, ctx) => acoes.resumoDia(args, ctx),
  resumoParaIA: (r) => ({ fala: r.fala, porStatus: r.dados && r.dados.porStatus, porProfissional: r.dados && r.dados.porProfissional })
},
{
  nome: 'consultas_paciente',
  tipo: 'leitura',
  pagina: 'agenda',
  descricao: 'Próximas consultas de um paciente. Use para "quando é a consulta de X".',
  parametros: objeto({ paciente: PACIENTE }, ['paciente']),
  executar: (args, ctx) => acoes.consultasPaciente(args, ctx),
  resumoParaIA: (r) => ({ fala: r.fala, pacientes: semContato(r.dados && r.dados.pacientes) })
},
{
  nome: 'propor_marcacao',
  tipo: 'proposta',
  pagina: 'agenda',
  descricao:
  'Prepara a marcação (agendar, encaixar) de uma consulta. Não grava: mostra o cartão para o usuário confirmar o horário. ' +
  'Chame mesmo faltando dados; a ferramenta pergunta o que faltar.',
  parametros: objeto({ paciente: PACIENTE, profissional: PROFISSIONAL, data: DATA, hora: HORA, periodo: PERIODO }),
  executar: (args, ctx) => acoes.marcar(args, ctx)
},
{
  nome: 'propor_remarcacao',
  tipo: 'proposta',
  pagina: 'agenda',
  descricao:
  'Prepara a remarcação (mudar, adiar, adiantar) da próxima consulta de um paciente. data/hora são o NOVO horário; ' +
  'profissional só se pedirem outro. Não grava: o usuário confirma na tela.',
  parametros: objeto({ paciente: PACIENTE, profissional: PROFISSIONAL, data: DATA, hora: HORA, periodo: PERIODO }, ['paciente']),
  executar: (args, ctx) => acoes.remarcar(args, ctx)
},
{
  nome: 'propor_cancelamento',
  tipo: 'proposta',
  pagina: 'agenda',
  descricao: 'Prepara o cancelamento (desmarcar) de consulta de um paciente. Não grava: o usuário confirma na tela.',
  parametros: objeto({ paciente: PACIENTE, profissional: PROFISSIONAL, data: DATA, motivo: { type: 'string', maxLength: 200 } }, ['paciente']),
  executar: (args, ctx) => acoes.cancelar(args, ctx)
}];
