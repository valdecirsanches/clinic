// ==================== FERRAMENTAS — NAVEGAÇÃO ====================
// Abrir telas, a agenda de um dia, o cadastro ou o prontuário de um paciente.
// Só abre o que o usuário já poderia abrir pelo menu.

const acoes = require('../acoes');
const { podeAcessarPagina } = require('../permissoes');

// Como as pessoas chamam cada tela (vai na descrição para a IA).
const APELIDOS = {
  dashboard: 'painel, início, tela inicial',
  agenda: 'agenda',
  fila_atendimento: 'fila, fila de chegada, sala de espera, recepção',
  pacientes: 'pacientes, lista de pacientes',
  prontuarios: 'prontuários (lista)',
  mensagens: 'mensagens, WhatsApp, conversas',
  whatsapp_meta: 'WhatsApp oficial',
  cobrancas: 'cobranças, financeiro, parcelas, pagamentos',
  convenios: 'convênios',
  planos_saude: 'planos de saúde',
  empresas_conveniadas: 'empresas conveniadas',
  procedimentos: 'procedimentos, tabela de preços',
  especialidades: 'especialidades',
  medicamentos: 'medicamentos',
  usuarios: 'usuários, equipe, profissionais (cadastro)',
  ponto: 'ponto, frequência, bater ponto',
  auditoria: 'auditoria',
  configuracoes: 'configurações da clínica',
  assinatura: 'minha assinatura, fatura do sistema'
};

/** Telas que este usuário pode abrir (o id da tela é o id da página do menu). */
function telasDoUsuario(usuario) {
  return Object.keys(APELIDOS).filter((id) => podeAcessarPagina(usuario, id));
}

const PACIENTE = { type: 'string', maxLength: 120, description: 'Nome do paciente como foi dito.' };

function objeto(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

module.exports = [
{
  nome: 'abrir_tela',
  tipo: 'navegacao',
  pagina: '*',
  disponivel: (usuario) => telasDoUsuario(usuario).length > 0,
  descricao: 'Abre uma tela do sistema. Para a agenda com data ou profissional use abrir_agenda.',
  parametros: (usuario) => {
    const telas = telasDoUsuario(usuario);
    return objeto(
      {
        tela: {
          type: 'string',
          enum: telas,
          description: `Tela (id: como chamam): ${telas.map((id) => `${id}: ${APELIDOS[id]}`).join('; ')}.`
        }
      },
      ['tela']
    );
  },
  executar: (args) => acoes.abrirTela(args)
},
{
  nome: 'abrir_agenda',
  tipo: 'navegacao',
  pagina: 'agenda',
  descricao: 'Abre a agenda num dia e/ou de um profissional.',
  parametros: objeto({
    profissional: { type: 'string', maxLength: 120 },
    data: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'AAAA-MM-DD' }
  }),
  executar: (args, ctx) => acoes.abrirAgenda(args, ctx)
},
{
  nome: 'abrir_paciente',
  tipo: 'navegacao',
  pagina: 'pacientes',
  descricao: 'Abre o cadastro (ficha, dados, telefone, endereço) de um paciente.',
  parametros: objeto({ paciente: PACIENTE }, ['paciente']),
  executar: (args, ctx) => acoes.abrirPaciente(args, ctx, 'cadastro')
},
{
  nome: 'abrir_prontuario',
  tipo: 'navegacao',
  pagina: 'prontuario_atendimento',
  descricao: 'Abre o prontuário (histórico, atendimento) de um paciente. Use também para "atender X".',
  parametros: objeto({ paciente: PACIENTE }, ['paciente']),
  executar: (args, ctx) => acoes.abrirPaciente(args, ctx, 'prontuario')
},
{
  nome: 'novo_paciente',
  tipo: 'navegacao',
  pagina: 'pacientes',
  descricao: 'Abre o formulário de cadastro de paciente novo (já com o nome, se foi dito).',
  parametros: objeto({ paciente: PACIENTE }),
  executar: (args) => acoes.novoPaciente(args)
}];


module.exports.telasDoUsuario = telasDoUsuario;
module.exports.APELIDOS = APELIDOS;
