export interface CenaDemo {
  id: string;
  titulo: string;
  /** Página do sistema exibida durante a cena */
  pagina: string;
  /** Texto curto na tela */
  legenda: string;
  /** Texto falado pela voz da ElevenLabs */
  narracao: string;
  /** Tempo mínimo na tela (s), mesmo se a narração for mais curta */
  duracaoMin: number;
  /** Cartão de título sobre o sistema (abertura e encerramento) */
  capa?: {titulo: string;subtitulo: string;};
}

/**
 * Apresentação pronta do EasyClin: percorre os recursos do sistema com os
 * dados fictícios da "Clínica Vida Plena". Roteiro fixo — não é editável.
 */
export const ROTEIRO_APRESENTACAO: CenaDemo[] = [
{
  id: 'abertura',
  titulo: 'Abertura',
  pagina: 'dashboard',
  legenda: '',
  capa: { titulo: 'EasyClin', subtitulo: 'Gestão completa para clínicas médicas e odontológicas' },
  narracao: 'Conheça o EasyClin: agenda, WhatsApp, prontuário eletrônico e gestão da clínica, tudo em um só lugar.',
  duracaoMin: 6
},
{
  id: 'painel',
  titulo: 'Painel da clínica',
  pagina: 'dashboard',
  legenda: 'O dia da clínica em uma única tela',
  narracao: 'Ao entrar, a equipe vê o dia da clínica: consultas marcadas, confirmações e atendimentos em andamento.',
  duracaoMin: 7
},
{
  id: 'agenda',
  titulo: 'Agenda',
  pagina: 'agenda',
  legenda: 'Agenda por profissional, com dias liberados sob controle',
  narracao:
  'Na agenda, cada profissional tem os seus horários. A recepção libera os dias de atendimento, marca, remarca e acompanha as confirmações em tempo real, sem conflitos.',
  duracaoMin: 9
},
{
  id: 'fila',
  titulo: 'Fila de chegada',
  pagina: 'fila_atendimento',
  legenda: 'Chegada do paciente e ordem de atendimento',
  narracao: 'Quando o paciente chega, a recepção registra a chegada e o profissional vê a fila na ordem certa.',
  duracaoMin: 7
},
{
  id: 'pacientes',
  titulo: 'Pacientes',
  pagina: 'pacientes',
  legenda: 'Cadastro completo, com convênio e histórico',
  narracao: 'O cadastro de pacientes reúne dados pessoais, convênio, histórico de consultas e documentos.',
  duracaoMin: 7
},
{
  id: 'prontuario',
  titulo: 'Prontuário eletrônico',
  pagina: 'prontuarios',
  legenda: 'Anamnese, evolução, prescrição, atestados e exames',
  narracao:
  'No prontuário eletrônico, o profissional registra anamnese, evolução, prescrições, atestados, exames e relatórios. Cada registro guarda a autoria, é assinado e pode ser impresso ou enviado ao paciente.',
  duracaoMin: 10
},
{
  id: 'medicamentos',
  titulo: 'Medicamentos',
  pagina: 'medicamentos',
  legenda: 'Base de medicamentos para prescrever com segurança',
  narracao: 'A base de medicamentos agiliza a prescrição, inclusive a receita de controle especial.',
  duracaoMin: 7
},
{
  id: 'whatsapp',
  titulo: 'WhatsApp',
  pagina: 'mensagens',
  legenda: 'Confirmação automática pelo WhatsApp',
  narracao:
  'O paciente recebe a confirmação da consulta pelo WhatsApp e responde com um toque. Confirmou ou cancelou, a agenda é atualizada na hora.',
  duracaoMin: 9
},
{
  id: 'whatsapp_oficial',
  titulo: 'WhatsApp Oficial',
  pagina: 'whatsapp_meta',
  legenda: 'Integração com a API oficial da Meta',
  narracao: 'Com a API oficial da Meta, a clínica conecta o próprio número e envia mensagens com a sua marca, de forma estável e segura.',
  duracaoMin: 8
},
{
  id: 'procedimentos',
  titulo: 'Procedimentos',
  pagina: 'procedimentos',
  legenda: 'Procedimentos com duração e valor',
  narracao: 'Os procedimentos definem a duração de cada atendimento e o valor cobrado.',
  duracaoMin: 6
},
{
  id: 'convenios',
  titulo: 'Convênios',
  pagina: 'convenios',
  legenda: 'Convênios e planos de saúde',
  narracao: 'Convênios e planos de saúde ficam organizados, com os dados de cobrança de cada operadora.',
  duracaoMin: 7
},
{
  id: 'planos',
  titulo: 'Planos de saúde',
  pagina: 'planos_saude',
  legenda: 'Planos vinculados a cada convênio',
  narracao: 'Cada plano fica vinculado ao seu convênio, pronto para ser escolhido no cadastro do paciente.',
  duracaoMin: 6
},
{
  id: 'especialidades',
  titulo: 'Especialidades',
  pagina: 'especialidades',
  legenda: 'Especialidades médicas e odontológicas',
  narracao: 'O EasyClin atende tanto clínicas médicas quanto odontológicas, com as especialidades de cada equipe.',
  duracaoMin: 6
},
{
  id: 'equipe',
  titulo: 'Equipe e permissões',
  pagina: 'usuarios',
  legenda: 'Cada pessoa com o acesso certo',
  narracao: 'Recepção, médicos, dentistas e administradores têm cada um o seu acesso, com tudo registrado para a LGPD.',
  duracaoMin: 7
},
{
  id: 'cobrancas',
  titulo: 'Cobranças',
  pagina: 'cobrancas',
  legenda: 'Parcelas pagas, a vencer e em atraso',
  narracao:
  'Em Cobranças, a clínica acompanha as parcelas de cada paciente: o que já foi pago, o que vence e o que está em atraso, com envio de lembrete pelo WhatsApp.',
  duracaoMin: 8
},
{
  id: 'ponto',
  titulo: 'Ponto da equipe',
  pagina: 'ponto',
  legenda: 'Entradas, saídas e horas trabalhadas',
  narracao:
  'O ponto registra entradas e saídas da equipe, inclusive por reconhecimento facial, e soma as horas trabalhadas no relatório do período.',
  duracaoMin: 8
},
{
  id: 'auditoria',
  titulo: 'Auditoria (LGPD)',
  pagina: 'auditoria',
  legenda: 'Quem acessou cada prontuário, e quando',
  narracao:
  'E para a LGPD, a auditoria registra quem acessou, alterou ou imprimiu cada prontuário, com data, hora e origem do acesso.',
  duracaoMin: 8
},
{
  id: 'encerramento',
  titulo: 'Encerramento',
  pagina: 'dashboard',
  legenda: '',
  capa: { titulo: 'EasyClin', subtitulo: 'Menos tempo com tarefas, mais tempo com os pacientes' },
  narracao: 'EasyClin. Menos tempo com tarefas, mais tempo com os pacientes. Fale com a gente e veja funcionando na sua clínica.',
  duracaoMin: 7
}];