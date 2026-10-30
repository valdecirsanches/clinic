export interface ComandoAtendente {
  /** O que a recepção fala. */
  frase: string;
  resultado: string;
  /** Sem nomes de exemplo: pode ser enviado direto. Com nomes: vai para a caixa, para trocar. */
  direto?: boolean;
}

export interface GrupoComandos {
  titulo: string;
  comandos: ComandoAtendente[];
}

export const comandosAtendente: GrupoComandos[] = [
{
  titulo: 'Pacientes',
  comandos: [
  { frase: 'Abrir o cadastro da Maria Silva', resultado: 'Abre a ficha do paciente para editar' },
  { frase: 'Qual o telefone do João Pereira?', resultado: 'Mostra telefone, nascimento e próxima consulta' },
  { frase: 'Cadastrar paciente novo', resultado: 'Abre o cadastro em branco', direto: true },
  { frase: 'Abrir o prontuário da Fernanda Lima', resultado: 'Abre o histórico clínico do paciente' }]

},
{
  titulo: 'Marcar, remarcar e cancelar',
  comandos: [
  { frase: 'Marcar Maria Silva com a Dra. Aline quinta às 9', resultado: 'Encontra o horário e pede confirmação' },
  { frase: 'Encaixar o Carlos Souza amanhã de manhã com o Dr. José', resultado: 'Mostra os horários livres da manhã' },
  { frase: 'Remarcar a consulta da Ana Costa para sexta às 14h', resultado: 'Move a consulta e libera o horário antigo' },
  { frase: 'Desmarcar a consulta do Pedro Alves de terça', resultado: 'Cancela com motivo, após confirmação' }]

},
{
  titulo: 'Agenda e horários',
  comandos: [
  { frase: 'Como está o dia hoje?', resultado: 'Total, confirmados e próximo paciente de cada profissional', direto: true },
  { frase: 'Como está a agenda de amanhã?', resultado: 'O mesmo resumo para outro dia', direto: true },
  { frase: 'Quem tem vaga amanhã à tarde?', resultado: 'Horários livres de todos os profissionais', direto: true },
  { frase: 'Abrir a agenda da Dra. Aline na próxima segunda', resultado: 'Vai direto para a data e o profissional' },
  { frase: 'Quando é a próxima consulta da Beatriz Rocha?', resultado: 'Data, horário e profissional' }]

},
{
  titulo: 'Ir para uma tela',
  comandos: [
  { frase: 'Abrir a fila de atendimento', resultado: 'Pacientes que chegaram', direto: true },
  { frase: 'Abrir as mensagens do WhatsApp', resultado: 'Conversas com pacientes', direto: true },
  { frase: 'Abrir cobranças', resultado: 'Parcelas e pagamentos', direto: true },
  { frase: 'Abrir convênios', resultado: 'Também: planos de saúde, procedimentos, ponto e outras', direto: true }]

}];