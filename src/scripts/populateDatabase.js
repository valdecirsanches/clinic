/**
 * Script para popular o banco de dados com dados de teste
 * Execute: node scripts/populateDatabase.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conecta aos bancos
const dbGlobalPath = path.join(__dirname, '../server/data/principal.db');
const dbClinicaPath = path.join(__dirname, '../server/data/easyclin-clinica-c1.db');

const dbGlobal = new sqlite3.Database(dbGlobalPath);
const dbClinica = new sqlite3.Database(dbClinicaPath);

console.log('🌱 Iniciando população do banco de dados...\n');

// Limpa dados existentes
console.log('🧹 Limpando dados existentes...');
dbGlobal.serialize(() => {
  dbGlobal.run('DELETE FROM usuarios');
  dbGlobal.run('DELETE FROM clinicas');
  dbGlobal.run('DELETE FROM operadoras');
});

dbClinica.serialize(() => {
  dbClinica.run('DELETE FROM consultas');
  dbClinica.run('DELETE FROM horarios_trabalho');
  dbClinica.run('DELETE FROM agendas');
  dbClinica.run('DELETE FROM pacientes');
});

// Aguarda limpeza
setTimeout(() => {
  console.log('✅ Dados limpos!\n');

  // POPULA BANCO GLOBAL
  console.log('📊 Populando banco GLOBAL...');

  dbGlobal.serialize(() => {
    // Operadoras
    console.log('  → Inserindo operadoras...');
    dbGlobal.run(`
      INSERT INTO operadoras (id, nome, cnpj, razaoSocial, telefone, email, endereco, ativa, criadoEm)
      VALUES 
        ('op1', 'Saúde Total', '12.345.678/0001-90', 'Saúde Total Ltda', '(11) 3456-7890', 'contato@saudetotal.com.br', 'Av. Paulista, 1000 - São Paulo, SP', 1, '2024-01-01'),
        ('op2', 'Vida Plena', '98.765.432/0001-10', 'Vida Plena Saúde S.A.', '(11) 3456-7891', 'contato@vidaplena.com.br', 'Rua Augusta, 500 - São Paulo, SP', 1, '2024-01-15')
    `);

    // Clínicas
    console.log('  → Inserindo clínicas...');
    dbGlobal.run(`
      INSERT INTO clinicas (id, operadoraId, nome, cnpj, telefone, email, endereco, ativa, criadoEm)
      VALUES 
        ('c1', 'op1', 'Clínica Central', '11.222.333/0001-44', '(11) 3456-7892', 'central@saudetotal.com.br', 'Rua das Flores, 123 - São Paulo, SP', 1, '2024-01-01'),
        ('c2', 'op1', 'Clínica Norte', '11.222.333/0002-55', '(11) 3456-7893', 'norte@saudetotal.com.br', 'Av. Norte, 456 - São Paulo, SP', 1, '2024-01-10'),
        ('c3', 'op2', 'Clínica Vida', '22.333.444/0001-66', '(11) 3456-7894', 'vida@vidaplena.com.br', 'Rua da Saúde, 789 - São Paulo, SP', 1, '2024-01-15')
    `);

    // Usuários
    console.log('  → Inserindo usuários...');
    dbGlobal.run(`
      INSERT INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, criadoEm)
      VALUES 
        ('u1', 'Admin Sistema', 'admin@easyclin.com', 'admin123', 'super_admin', NULL, NULL, 1, '2024-01-01'),
        ('u2', 'João Administrador', 'joao@saudetotal.com', '123456', 'admin', 'op1', NULL, 1, '2024-01-01'),
        ('u3', 'Dra. Ana Costa', 'ana@saudetotal.com', '123456', 'medico', 'op1', 'c1', 1, '2024-01-01'),
        ('u4', 'Dr. Carlos Silva', 'carlos@saudetotal.com', '123456', 'dentista', 'op1', 'c1', 1, '2024-01-01'),
        ('u5', 'Maria Atendente', 'maria@saudetotal.com', '123456', 'atendente', 'op1', 'c1', 1, '2024-01-01'),
        ('u6', 'Dr. Roberto Santos', 'roberto@saudetotal.com', '123456', 'medico', 'op1', 'c1', 1, '2024-01-05'),
        ('u7', 'Dra. Paula Lima', 'paula@saudetotal.com', '123456', 'dentista', 'op1', 'c1', 1, '2024-01-05')
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao inserir usuários:', err);
      } else {
        console.log('✅ Banco GLOBAL populado!\n');

        // POPULA BANCO DA CLÍNICA
        console.log('📊 Populando banco da CLÍNICA c1...');

        dbClinica.serialize(() => {
          // Pacientes
          console.log('  → Inserindo pacientes...');
          dbClinica.run(`
            INSERT INTO pacientes (id, nome, cpf, dataNascimento, telefone, email, endereco, criadoEm)
            VALUES 
              ('p1', 'João Silva Santos', '123.456.789-00', '1985-05-15', '(11) 98765-4321', 'joao.silva@email.com', 'Rua das Flores, 123 - São Paulo, SP', '2024-01-01'),
              ('p2', 'Maria Oliveira Costa', '987.654.321-00', '1990-08-20', '(11) 98765-4322', 'maria.oliveira@email.com', 'Av. Brasil, 456 - São Paulo, SP', '2024-01-01'),
              ('p3', 'Pedro Souza Lima', '456.789.123-00', '1978-11-30', '(11) 98765-4323', 'pedro.souza@email.com', 'Rua Augusta, 789 - São Paulo, SP', '2024-01-02'),
              ('p4', 'Ana Paula Mendes', '321.654.987-00', '1995-03-10', '(11) 98765-4324', 'ana.mendes@email.com', 'Av. Paulista, 1000 - São Paulo, SP', '2024-01-02'),
              ('p5', 'Carlos Eduardo Rocha', '789.123.456-00', '1982-07-25', '(11) 98765-4325', 'carlos.rocha@email.com', 'Rua da Consolação, 200 - São Paulo, SP', '2024-01-03')
          `);

          // Agendas Profissionais
          console.log('  → Inserindo agendas profissionais...');
          dbClinica.run(`
            INSERT INTO agendas (id, profissionalNome, especialidade, ativo, criadoEm)
            VALUES 
              ('ag1', 'Dra. Ana Costa', 'medico', 1, '2024-01-01'),
              ('ag2', 'Dr. Carlos Silva', 'dentista', 1, '2024-01-01'),
              ('ag3', 'Dr. Roberto Santos', 'medico', 1, '2024-01-05'),
              ('ag4', 'Dra. Paula Lima', 'dentista', 1, '2024-01-05')
          `);

          // Horários de Trabalho - Dra. Ana Costa (Segunda a Sexta, 8h-18h)
          console.log('  → Inserindo horários de trabalho...');
          const horariosAna = [
          { dia: 1, inicio: '08:00', fim: '18:00', intInicio: '12:00', intFim: '13:00', duracao: 30 },
          { dia: 2, inicio: '08:00', fim: '18:00', intInicio: '12:00', intFim: '13:00', duracao: 30 },
          { dia: 3, inicio: '08:00', fim: '18:00', intInicio: '12:00', intFim: '13:00', duracao: 30 },
          { dia: 4, inicio: '08:00', fim: '18:00', intInicio: '12:00', intFim: '13:00', duracao: 30 },
          { dia: 5, inicio: '08:00', fim: '17:00', intInicio: '12:00', intFim: '13:00', duracao: 30 }];


          horariosAna.forEach((h) => {
            dbClinica.run(`
              INSERT INTO horarios_trabalho (agendaId, diaSemana, horaInicio, horaFim, intervaloInicio, intervaloFim, duracaoConsultaPadrao)
              VALUES ('ag1', ?, ?, ?, ?, ?, ?)
            `, [h.dia, h.inicio, h.fim, h.intInicio, h.intFim, h.duracao]);
          });

          // Horários de Trabalho - Dr. Carlos Silva (Segunda, Quarta, Sexta - 9h-18h)
          const horariosCarlos = [
          { dia: 1, inicio: '09:00', fim: '18:00', intInicio: '12:30', intFim: '14:00', duracao: 45 },
          { dia: 3, inicio: '09:00', fim: '18:00', intInicio: '12:30', intFim: '14:00', duracao: 45 },
          { dia: 5, inicio: '09:00', fim: '17:00', intInicio: '12:30', intFim: '14:00', duracao: 45 }];


          horariosCarlos.forEach((h) => {
            dbClinica.run(`
              INSERT INTO horarios_trabalho (agendaId, diaSemana, horaInicio, horaFim, intervaloInicio, intervaloFim, duracaoConsultaPadrao)
              VALUES ('ag2', ?, ?, ?, ?, ?, ?)
            `, [h.dia, h.inicio, h.fim, h.intInicio, h.intFim, h.duracao]);
          });

          // Horários de Trabalho - Dr. Roberto Santos (Terça, Quinta, Sábado - 7h-13h)
          const horariosRoberto = [
          { dia: 2, inicio: '07:00', fim: '13:00', intInicio: '', intFim: '', duracao: 20 },
          { dia: 4, inicio: '07:00', fim: '13:00', intInicio: '', intFim: '', duracao: 20 },
          { dia: 6, inicio: '08:00', fim: '12:00', intInicio: '', intFim: '', duracao: 20 }];


          horariosRoberto.forEach((h) => {
            dbClinica.run(`
              INSERT INTO horarios_trabalho (agendaId, diaSemana, horaInicio, horaFim, intervaloInicio, intervaloFim, duracaoConsultaPadrao)
              VALUES ('ag3', ?, ?, ?, ?, ?, ?)
            `, [h.dia, h.inicio, h.fim, h.intInicio, h.intFim, h.duracao]);
          });

          // Horários de Trabalho - Dra. Paula Lima (Domingo, Terça, Quinta, Sábado)
          const horariosPaula = [
          { dia: 0, inicio: '08:00', fim: '12:00', intInicio: '', intFim: '', duracao: 60 },
          { dia: 2, inicio: '14:00', fim: '20:00', intInicio: '17:00', intFim: '18:00', duracao: 60 },
          { dia: 4, inicio: '14:00', fim: '20:00', intInicio: '17:00', intFim: '18:00', duracao: 60 },
          { dia: 6, inicio: '08:00', fim: '14:00', intInicio: '11:00', intFim: '12:00', duracao: 60 }];


          horariosPaula.forEach((h) => {
            dbClinica.run(`
              INSERT INTO horarios_trabalho (agendaId, diaSemana, horaInicio, horaFim, intervaloInicio, intervaloFim, duracaoConsultaPadrao)
              VALUES ('ag4', ?, ?, ?, ?, ?, ?)
            `, [h.dia, h.inicio, h.fim, h.intInicio, h.intFim, h.duracao]);
          });

          // Consultas
          console.log('  → Inserindo consultas...');
          const hoje = new Date().toISOString().split('T')[0];
          const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];

          dbClinica.run(`
            INSERT INTO consultas (id, pacienteId, pacienteNome, tipo, data, horario, duracao, status, profissional, observacoes, cor, lembreteEnviado)
            VALUES 
              ('cons1', 'p1', 'João Silva Santos', 'medica', '${hoje}', '09:00', 30, 'confirmada', 'Dra. Ana Costa', 'Consulta de rotina', '#3b82f6', 1),
              ('cons2', 'p2', 'Maria Oliveira Costa', 'odontologica', '${hoje}', '10:30', 45, 'agendada', 'Dr. Carlos Silva', 'Limpeza dental', '#10b981', 0),
              ('cons3', 'p3', 'Pedro Souza Lima', 'medica', '${hoje}', '14:00', 30, 'agendada', 'Dra. Ana Costa', '', '#3b82f6', 1),
              ('cons4', 'p4', 'Ana Paula Mendes', 'odontologica', '${amanha}', '09:00', 45, 'agendada', 'Dr. Carlos Silva', 'Avaliação ortodôntica', '#10b981', 0),
              ('cons5', 'p5', 'Carlos Eduardo Rocha', 'medica', '${amanha}', '15:30', 30, 'agendada', 'Dra. Ana Costa', 'Retorno', '#3b82f6', 0)
          `, (err) => {
            if (err) {
              console.error('❌ Erro ao inserir consultas:', err);
            } else {
              console.log('✅ Banco da CLÍNICA c1 populado!\n');

              // Fecha conexões
              dbGlobal.close();
              dbClinica.close();

              console.log('🎉 População concluída com sucesso!\n');
              console.log('📊 Resumo:');
              console.log('  • 2 Operadoras');
              console.log('  • 3 Clínicas');
              console.log('  • 7 Usuários (1 super_admin, 1 admin, 2 médicos, 2 dentistas, 1 atendente)');
              console.log('  • 5 Pacientes');
              console.log('  • 4 Agendas Profissionais');
              console.log('  • 15 Horários de Trabalho');
              console.log('  • 5 Consultas\n');
              console.log('🔐 Credenciais de teste:');
              console.log('  Super Admin: admin@easyclin.com / admin123');
              console.log('  Admin: joao@saudetotal.com / 123456');
              console.log('  Médica: ana@saudetotal.com / 123456');
              console.log('  Dentista: carlos@saudetotal.com / 123456');
              console.log('  Atendente: maria@saudetotal.com / 123456\n');
            }
          });
        });
      }
    });
  });
}, 500);