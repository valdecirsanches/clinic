// ==================== DADOS FICTÍCIOS DO VÍDEO DE DEMONSTRAÇÃO ====================
// Tudo aqui é inventado. Nenhum nome, CPF, telefone ou registro corresponde a
// pessoas reais. O modo demonstração (utils/modoDemo.ts) responde as telas
// SOMENTE com estes dados — o servidor nunca é consultado.

export const DEMO_OPERADORA = {
  id: 'demo-operadora',
  nome: 'Grupo Demonstração',
  cnpj: '00.000.000/0001-00',
  razaoSocial: 'Grupo Demonstração Ltda.',
  telefone: '(11) 3000-0000',
  email: 'contato@demonstracao.exemplo',
  ativa: true,
  planoId: 'profissional',
  criadoEm: '2025-01-02T09:00:00.000Z'
};

export const DEMO_CLINICA = {
  id: 'demo-clinica',
  operadoraId: 'demo-operadora',
  nome: 'Clínica Vida Plena',
  cnpj: '00.000.000/0001-00',
  endereco: 'Av. Exemplo, 1000 — Centro',
  logradouro: 'Av. Exemplo',
  numero: '1000',
  bairro: 'Centro',
  cidade: 'São Paulo',
  uf: 'SP',
  cep: '01000-000',
  telefone: '(11) 3000-0000',
  whatsapp: '(11) 90000-0000',
  email: 'contato@vidaplena.exemplo',
  ativa: true,
  plano: 'profissional',
  logoUrl: '',
  criadoEm: '2025-01-02T09:00:00.000Z'
};

export const DEMO_USUARIOS = [
{
  id: 'demo-recepcao',
  nome: 'Recepção Vida Plena',
  email: 'recepcao@vidaplena.exemplo',
  senha: '',
  tipo: 'admin',
  operadoraId: 'demo-operadora',
  clinicaId: 'demo-clinica',
  ativo: true,
  criadoEm: '2025-01-02T09:00:00.000Z'
},
{
  id: 'demo-prof-1',
  nome: 'Helena Duarte',
  titulo: 'Dra.',
  email: 'helena@vidaplena.exemplo',
  senha: '',
  tipo: 'medico',
  crm: '000001',
  uf: 'SP',
  especialidade: 'Clínica Geral',
  operadoraId: 'demo-operadora',
  clinicaId: 'demo-clinica',
  ativo: true,
  criadoEm: '2025-01-02T09:00:00.000Z'
},
{
  id: 'demo-prof-2',
  nome: 'Rafael Moreira',
  titulo: 'Dr.',
  email: 'rafael@vidaplena.exemplo',
  senha: '',
  tipo: 'dentista',
  crm: '000002',
  uf: 'SP',
  especialidade: 'Odontologia',
  operadoraId: 'demo-operadora',
  clinicaId: 'demo-clinica',
  ativo: true,
  criadoEm: '2025-01-02T09:00:00.000Z'
},
{
  id: 'demo-prof-3',
  nome: 'Camila Torres',
  titulo: 'Dra.',
  email: 'camila@vidaplena.exemplo',
  senha: '',
  tipo: 'medico',
  crm: '000003',
  uf: 'SP',
  especialidade: 'Pediatria',
  operadoraId: 'demo-operadora',
  clinicaId: 'demo-clinica',
  ativo: true,
  criadoEm: '2025-01-02T09:00:00.000Z'
}];


export const DEMO_PACIENTES = [
{ id: 'demo-pac-01', nome: 'Ana Beatriz Lima', dataNascimento: '1988-03-14', genero: 'feminino' },
{ id: 'demo-pac-02', nome: 'Bruno Carvalho', dataNascimento: '1975-07-22', genero: 'masculino' },
{ id: 'demo-pac-03', nome: 'Carla Mendes', dataNascimento: '1992-11-05', genero: 'feminino' },
{ id: 'demo-pac-04', nome: 'Diego Ferreira', dataNascimento: '1969-01-30', genero: 'masculino' },
{ id: 'demo-pac-05', nome: 'Eduarda Rocha', dataNascimento: '2016-05-18', genero: 'feminino' },
{ id: 'demo-pac-06', nome: 'Fábio Nogueira', dataNascimento: '1981-09-09', genero: 'masculino' },
{ id: 'demo-pac-07', nome: 'Gabriela Souza', dataNascimento: '1995-12-01', genero: 'feminino' },
{ id: 'demo-pac-08', nome: 'Henrique Alves', dataNascimento: '1958-04-27', genero: 'masculino' },
{ id: 'demo-pac-09', nome: 'Isabela Martins', dataNascimento: '2019-08-12', genero: 'feminino' },
{ id: 'demo-pac-10', nome: 'João Pedro Ribeiro', dataNascimento: '2000-02-16', genero: 'masculino' },
{ id: 'demo-pac-11', nome: 'Larissa Gomes', dataNascimento: '1986-06-23', genero: 'feminino' },
{ id: 'demo-pac-12', nome: 'Marcos Vieira', dataNascimento: '1972-10-03', genero: 'masculino' },
{ id: 'demo-pac-13', nome: 'Natália Pires', dataNascimento: '1999-03-29', genero: 'feminino' },
{ id: 'demo-pac-14', nome: 'Otávio Barros', dataNascimento: '1964-12-19', genero: 'masculino' }];


export const DEMO_PROCEDIMENTOS = [
{ id: 'demo-proc-1', nome: 'Consulta clínica', valor: 250, tipo: 'medica', ativo: true },
{ id: 'demo-proc-2', nome: 'Retorno', valor: 0, tipo: 'medica', ativo: true },
{ id: 'demo-proc-3', nome: 'Limpeza dental', valor: 180, tipo: 'odontologica', ativo: true },
{ id: 'demo-proc-4', nome: 'Restauração', valor: 320, tipo: 'odontologica', ativo: true },
{ id: 'demo-proc-5', nome: 'Consulta pediátrica', valor: 280, tipo: 'medica', ativo: true }];


/** Agenda de cada dia útil. `dia` = dias a partir de hoje (0 = hoje) */
export const DEMO_CONSULTAS = [
{ dia: 0, horario: '08:00', paciente: 'demo-pac-01', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'realizada' },
{ dia: 0, horario: '08:30', paciente: 'demo-pac-02', prof: 'demo-prof-1', proc: 'demo-proc-2', status: 'realizada' },
{ dia: 0, horario: '09:00', paciente: 'demo-pac-03', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'aguardando' },
{ dia: 0, horario: '09:30', paciente: 'demo-pac-04', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'confirmada' },
{ dia: 0, horario: '10:30', paciente: 'demo-pac-06', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'confirmada' },
{ dia: 0, horario: '14:00', paciente: 'demo-pac-08', prof: 'demo-prof-1', proc: 'demo-proc-2', status: 'agendada' },
{ dia: 0, horario: '08:00', paciente: 'demo-pac-07', prof: 'demo-prof-2', proc: 'demo-proc-3', status: 'realizada' },
{ dia: 0, horario: '09:00', paciente: 'demo-pac-10', prof: 'demo-prof-2', proc: 'demo-proc-4', status: 'confirmada' },
{ dia: 0, horario: '11:00', paciente: 'demo-pac-11', prof: 'demo-prof-2', proc: 'demo-proc-3', status: 'cancelada' },
{ dia: 0, horario: '15:00', paciente: 'demo-pac-12', prof: 'demo-prof-2', proc: 'demo-proc-4', status: 'agendada' },
{ dia: 0, horario: '09:00', paciente: 'demo-pac-05', prof: 'demo-prof-3', proc: 'demo-proc-5', status: 'confirmada' },
{ dia: 0, horario: '10:00', paciente: 'demo-pac-09', prof: 'demo-prof-3', proc: 'demo-proc-5', status: 'agendada' },
{ dia: 1, horario: '08:30', paciente: 'demo-pac-13', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'confirmada' },
{ dia: 1, horario: '10:00', paciente: 'demo-pac-14', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'agendada' },
{ dia: 1, horario: '13:30', paciente: 'demo-pac-02', prof: 'demo-prof-2', proc: 'demo-proc-3', status: 'agendada' },
{ dia: 1, horario: '09:30', paciente: 'demo-pac-09', prof: 'demo-prof-3', proc: 'demo-proc-5', status: 'confirmada' },
{ dia: 2, horario: '08:00', paciente: 'demo-pac-06', prof: 'demo-prof-1', proc: 'demo-proc-2', status: 'agendada' },
{ dia: 2, horario: '11:00', paciente: 'demo-pac-01', prof: 'demo-prof-2', proc: 'demo-proc-4', status: 'agendada' },
{ dia: 3, horario: '14:30', paciente: 'demo-pac-11', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'agendada' },
{ dia: 4, horario: '09:00', paciente: 'demo-pac-07', prof: 'demo-prof-3', proc: 'demo-proc-5', status: 'agendada' },
{ dia: -1, horario: '08:30', paciente: 'demo-pac-12', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'realizada' },
{ dia: -1, horario: '10:00', paciente: 'demo-pac-03', prof: 'demo-prof-2', proc: 'demo-proc-3', status: 'realizada' },
{ dia: -2, horario: '09:00', paciente: 'demo-pac-14', prof: 'demo-prof-1', proc: 'demo-proc-1', status: 'faltou' }];


/** Conversas do WhatsApp. `minutos` = há quantos minutos a mensagem foi trocada */
export const DEMO_MENSAGENS = [
{ paciente: 'demo-pac-04', tipo: 'enviada', minutos: 190, conteudo: 'Olá, Diego! Sua consulta com a Dra. Helena Duarte está agendada para hoje às 09:30. Podemos confirmar sua presença?' },
{ paciente: 'demo-pac-04', tipo: 'recebida', minutos: 182, conteudo: '✅ Confirmar consulta' },
{ paciente: 'demo-pac-04', tipo: 'enviada', minutos: 182, conteudo: 'Presença confirmada! Até logo, Diego.' },
{ paciente: 'demo-pac-11', tipo: 'enviada', minutos: 150, conteudo: 'Olá, Larissa! Sua limpeza dental com o Dr. Rafael Moreira está agendada para hoje às 11:00. Podemos confirmar?' },
{ paciente: 'demo-pac-11', tipo: 'recebida', minutos: 140, conteudo: '❌ Não poderei comparecer' },
{ paciente: 'demo-pac-11', tipo: 'enviada', minutos: 140, conteudo: 'Consulta cancelada. Se quiser reagendar, toque em "Falar conosco".' },
{ paciente: 'demo-pac-05', tipo: 'enviada', minutos: 95, conteudo: 'Olá! A consulta da Eduarda com a Dra. Camila Torres está agendada para hoje às 09:00. Podemos confirmar?' },
{ paciente: 'demo-pac-05', tipo: 'recebida', minutos: 80, conteudo: 'Confirmado, obrigada! Chegamos 15 minutos antes.' },
{ paciente: 'demo-pac-13', tipo: 'enviada', minutos: 30, conteudo: 'Olá, Natália! Lembrete: sua consulta é amanhã às 08:30 com a Dra. Helena Duarte.' },
{ paciente: 'demo-pac-13', tipo: 'recebida', minutos: 12, conteudo: 'Obrigada pelo lembrete! Estarei lá.' }];


export const DEMO_PRONTUARIOS = [
{ paciente: 'demo-pac-01', alergias: 'Dipirona', doencasCronicas: 'Nenhuma', medicamentosEmUso: 'Nenhum', tipoSanguineo: 'O+' },
{ paciente: 'demo-pac-02', alergias: 'Nenhuma conhecida', doencasCronicas: 'Hipertensão controlada', medicamentosEmUso: 'Losartana 50 mg', tipoSanguineo: 'A+' },
{ paciente: 'demo-pac-03', alergias: 'Penicilina', doencasCronicas: 'Nenhuma', medicamentosEmUso: 'Nenhum', tipoSanguineo: 'B+' },
{ paciente: 'demo-pac-08', alergias: 'Nenhuma conhecida', doencasCronicas: 'Diabetes tipo 2', medicamentosEmUso: 'Metformina 850 mg', tipoSanguineo: 'AB+' },
{ paciente: 'demo-pac-12', alergias: 'Látex', doencasCronicas: 'Nenhuma', medicamentosEmUso: 'Nenhum', tipoSanguineo: 'O-' }];


export const DEMO_TEMPLATES_META = [
{ name: 'confirma_consulta', status: 'APPROVED', language: 'pt_BR', category: 'UTILITY', variaveis: 8, temBotaoUrl: true },
{ name: 'lembrete_consulta', status: 'APPROVED', language: 'pt_BR', category: 'UTILITY', variaveis: 4, temBotaoUrl: false },
{ name: 'aviso_de_confirmacao', status: 'APPROVED', language: 'pt_BR', category: 'UTILITY', variaveis: 4, temBotaoUrl: false },
{ name: 'aviso_cancelamento', status: 'APPROVED', language: 'pt_BR', category: 'UTILITY', variaveis: 3, temBotaoUrl: false },
{ name: 'feliz_aniversario', status: 'APPROVED', language: 'pt_BR', category: 'MARKETING', variaveis: 2, temBotaoUrl: false }];


export const DEMO_CONVENIOS = [
{ id: 'demo-conv-1', nome: 'Plano Exemplo', razaoSocial: 'Plano Exemplo Saúde S.A.', registroAns: '000001', telefone: '(11) 3000-1001', email: 'credenciamento@planoexemplo.exemplo', cidade: 'São Paulo', uf: 'SP', diaCobranca: 5, diaPagamento: 25, validadeGuia: 30 },
{ id: 'demo-conv-2', nome: 'Saúde Modelo', razaoSocial: 'Saúde Modelo Operadora Ltda.', registroAns: '000002', telefone: '(11) 3000-1002', email: 'rede@saudemodelo.exemplo', cidade: 'São Paulo', uf: 'SP', diaCobranca: 10, diaPagamento: 30, validadeGuia: 60 },
{ id: 'demo-conv-3', nome: 'OdontoBem', razaoSocial: 'OdontoBem Planos Odontológicos Ltda.', registroAns: '000003', telefone: '(11) 3000-1003', email: 'contato@odontobem.exemplo', cidade: 'Campinas', uf: 'SP', diaCobranca: 1, diaPagamento: 20, validadeGuia: 30 }];


export const DEMO_PLANOS = [
{ id: 'demo-plano-1', convenioId: 'demo-conv-1', convenioNome: 'Plano Exemplo', nome: 'Exemplo Essencial', registroAns: '100001', tipo: 'individual', cobertura: 'Consultas e exames' },
{ id: 'demo-plano-2', convenioId: 'demo-conv-1', convenioNome: 'Plano Exemplo', nome: 'Exemplo Empresarial', registroAns: '100002', tipo: 'empresarial', cobertura: 'Consultas, exames e internação' },
{ id: 'demo-plano-3', convenioId: 'demo-conv-2', convenioNome: 'Saúde Modelo', nome: 'Modelo Família', registroAns: '200001', tipo: 'familiar', cobertura: 'Ambulatorial' },
{ id: 'demo-plano-4', convenioId: 'demo-conv-3', convenioNome: 'OdontoBem', nome: 'OdontoBem Clássico', registroAns: '300001', tipo: 'coletivo', cobertura: 'Odontologia preventiva' }];


export const DEMO_ESPECIALIDADES = [
{ id: 'demo-esp-1', nome: 'Clínica Geral', descricao: 'Atendimento clínico adulto', tipo: 'medica' },
{ id: 'demo-esp-2', nome: 'Pediatria', descricao: 'Crianças e adolescentes', tipo: 'medica' },
{ id: 'demo-esp-3', nome: 'Cardiologia', descricao: 'Coração e pressão arterial', tipo: 'medica' },
{ id: 'demo-esp-4', nome: 'Ortodontia', descricao: 'Aparelhos e alinhamento', tipo: 'odontologica' },
{ id: 'demo-esp-5', nome: 'Clínico Geral Odontológico', descricao: 'Prevenção e restaurações', tipo: 'odontologica' },
{ id: 'demo-esp-6', nome: 'Nutrição', descricao: 'Acompanhamento nutricional', tipo: 'ambas' }];


export const DEMO_MEDICAMENTOS = [
{ id: 'demo-med-1', nome: 'Amoxicilina', principioAtivo: 'Amoxicilina', concentracao: '500 mg', formaFarmaceutica: 'Cápsula', fabricante: 'Laboratório Exemplo', registroAnvisa: '1.0000.0001', tarja: 'vermelha' },
{ id: 'demo-med-2', nome: 'Losartana Potássica', principioAtivo: 'Losartana', concentracao: '50 mg', formaFarmaceutica: 'Comprimido', fabricante: 'Laboratório Exemplo', registroAnvisa: '1.0000.0002', tarja: 'vermelha' },
{ id: 'demo-med-3', nome: 'Metformina', principioAtivo: 'Cloridrato de metformina', concentracao: '850 mg', formaFarmaceutica: 'Comprimido', fabricante: 'Farmacêutica Modelo', registroAnvisa: '1.0000.0003', tarja: 'vermelha' },
{ id: 'demo-med-4', nome: 'Clonazepam', principioAtivo: 'Clonazepam', concentracao: '2 mg', formaFarmaceutica: 'Comprimido', fabricante: 'Farmacêutica Modelo', registroAnvisa: '1.0000.0004', tarja: 'preta' },
{ id: 'demo-med-5', nome: 'Paracetamol', principioAtivo: 'Paracetamol', concentracao: '750 mg', formaFarmaceutica: 'Comprimido', fabricante: 'Laboratório Exemplo', registroAnvisa: '1.0000.0005', tarja: 'sem_tarja' },
{ id: 'demo-med-6', nome: 'Ibuprofeno', principioAtivo: 'Ibuprofeno', concentracao: '400 mg', formaFarmaceutica: 'Comprimido', fabricante: 'Farmacêutica Modelo', registroAnvisa: '1.0000.0006', tarja: 'sem_tarja' },
{ id: 'demo-med-7', nome: 'Sertralina', principioAtivo: 'Cloridrato de sertralina', concentracao: '50 mg', formaFarmaceutica: 'Comprimido', fabricante: 'Laboratório Exemplo', registroAnvisa: '1.0000.0007', tarja: 'vermelha' },
{ id: 'demo-med-8', nome: 'Omeprazol', principioAtivo: 'Omeprazol', concentracao: '20 mg', formaFarmaceutica: 'Cápsula', fabricante: 'Farmacêutica Modelo', registroAnvisa: '1.0000.0008', tarja: 'sem_tarja' }];