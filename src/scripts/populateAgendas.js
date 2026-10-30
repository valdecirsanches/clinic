
// Script para popular localStorage com agendas de teste
// Execute este código no console do navegador (F12)

const agendasTeste = [
{
  id: 'agenda-001',
  clinicaId: 'clinica-123',
  profissionalNome: 'Dr. João Silva',
  especialidade: 'medico',
  ativo: true,
  horarios: [
  {
    diaSemana: 1, // Segunda
    horaInicio: '08:00',
    horaFim: '12:00',
    intervaloInicio: '',
    intervaloFim: '',
    duracaoConsultaPadrao: 30
  },
  {
    diaSemana: 1, // Segunda (tarde)
    horaInicio: '14:00',
    horaFim: '18:00',
    intervaloInicio: '',
    intervaloFim: '',
    duracaoConsultaPadrao: 30
  },
  {
    diaSemana: 2, // Terça
    horaInicio: '08:00',
    horaFim: '17:00',
    intervaloInicio: '12:00',
    intervaloFim: '13:00',
    duracaoConsultaPadrao: 30
  },
  {
    diaSemana: 3, // Quarta
    horaInicio: '08:00',
    horaFim: '17:00',
    intervaloInicio: '12:00',
    intervaloFim: '13:00',
    duracaoConsultaPadrao: 30
  },
  {
    diaSemana: 4, // Quinta
    horaInicio: '08:00',
    horaFim: '17:00',
    intervaloInicio: '12:00',
    intervaloFim: '13:00',
    duracaoConsultaPadrao: 30
  },
  {
    diaSemana: 5, // Sexta
    horaInicio: '08:00',
    horaFim: '16:00',
    intervaloInicio: '12:00',
    intervaloFim: '13:00',
    duracaoConsultaPadrao: 30
  }]

},
{
  id: 'agenda-002',
  clinicaId: 'clinica-123',
  profissionalNome: 'Dra. Maria Santos',
  especialidade: 'dentista',
  ativo: true,
  horarios: [
  {
    diaSemana: 1, // Segunda
    horaInicio: '09:00',
    horaFim: '18:00',
    intervaloInicio: '12:30',
    intervaloFim: '14:00',
    duracaoConsultaPadrao: 45
  },
  {
    diaSemana: 3, // Quarta
    horaInicio: '09:00',
    horaFim: '18:00',
    intervaloInicio: '12:30',
    intervaloFim: '14:00',
    duracaoConsultaPadrao: 45
  },
  {
    diaSemana: 5, // Sexta
    horaInicio: '09:00',
    horaFim: '17:00',
    intervaloInicio: '12:30',
    intervaloFim: '14:00',
    duracaoConsultaPadrao: 45
  }]

},
{
  id: 'agenda-003',
  clinicaId: 'clinica-123',
  profissionalNome: 'Dr. Carlos Oliveira',
  especialidade: 'medico',
  ativo: true,
  horarios: [
  {
    diaSemana: 2, // Terça
    horaInicio: '07:00',
    horaFim: '13:00',
    intervaloInicio: '',
    intervaloFim: '',
    duracaoConsultaPadrao: 20
  },
  {
    diaSemana: 4, // Quinta
    horaInicio: '07:00',
    horaFim: '13:00',
    intervaloInicio: '',
    intervaloFim: '',
    duracaoConsultaPadrao: 20
  },
  {
    diaSemana: 6, // Sábado
    horaInicio: '08:00',
    horaFim: '12:00',
    intervaloInicio: '',
    intervaloFim: '',
    duracaoConsultaPadrao: 20
  }]

},
{
  id: 'agenda-004',
  clinicaId: 'clinica-123',
  profissionalNome: 'Dra. Ana Paula Costa',
  especialidade: 'dentista',
  ativo: true,
  horarios: [
  {
    diaSemana: 0, // Domingo
    horaInicio: '08:00',
    horaFim: '12:00',
    intervaloInicio: '',
    intervaloFim: '',
    duracaoConsultaPadrao: 60
  },
  {
    diaSemana: 2, // Terça
    horaInicio: '14:00',
    horaFim: '20:00',
    intervaloInicio: '17:00',
    intervaloFim: '18:00',
    duracaoConsultaPadrao: 60
  },
  {
    diaSemana: 4, // Quinta
    horaInicio: '14:00',
    horaFim: '20:00',
    intervaloInicio: '17:00',
    intervaloFim: '18:00',
    duracaoConsultaPadrao: 60
  },
  {
    diaSemana: 6, // Sábado
    horaInicio: '08:00',
    horaFim: '14:00',
    intervaloInicio: '11:00',
    intervaloFim: '12:00',
    duracaoConsultaPadrao: 60
  }]

}];


// Salvar no localStorage
localStorage.setItem('agendas_profissionais', JSON.stringify(agendasTeste));

console.log('✅ Agendas de teste criadas com sucesso!');
console.log('📋 Total de agendas:', agendasTeste.length);
console.log('👥 Profissionais:');
agendasTeste.forEach((agenda) => {
  console.log(`  - ${agenda.profissionalNome} (${agenda.especialidade}) - ${agenda.horarios.length} horários`);
});
console.log('\n🔍 Para verificar, use o botão DEBUG na interface ou execute:');
console.log('JSON.parse(localStorage.getItem("agendas_profissionais"))');