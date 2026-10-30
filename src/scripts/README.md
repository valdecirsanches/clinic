
# Scripts de População de Dados

## 1. Popular Banco de Dados (Backend)

Este script popula os bancos de dados SQLite com dados de teste.

### Instalação
Primeiro, instale as dependências:
```bash
npm install
```

### Execução
```bash
npm run db:populate
```

Ou diretamente:
```bash
node scripts/populateDatabase.js
```

### O que é criado:
- 2 Operadoras
- 3 Clínicas  
- 7 Usuários (super_admin, admin, médicos, dentistas, atendente)
- 5 Pacientes
- 4 Agendas Profissionais
- 15 Horários de Trabalho
- 5 Consultas

### Credenciais de teste:
- Super Admin: `admin@easyclin.com` / `admin123`
- Admin: `joao@saudetotal.com` / `123456`
- Médica: `ana@saudetotal.com` / `123456`
- Dentista: `carlos@saudetotal.com` / `123456`

---

## 2. Popular Agendas no Navegador (Frontend)

O arquivo `populateAgendas.js` contém dados de teste para localStorage (armazenamento do navegador).

### ⚠️ IMPORTANTE
Este script **NÃO** deve ser executado com Node.js. Ele usa `localStorage` que só existe no navegador.

### Como usar:

1. Abra a aplicação no navegador
2. Abra o Console do Desenvolvedor (F12)
3. Cole e execute o conteúdo do arquivo `populateAgendas.js`

Ou simplesmente copie e cole este código no console:

```javascript
const agendasTeste = [
  {
    id: 'agenda-001',
    clinicaId: 'clinica-123',
    profissionalNome: 'Dr. João Silva',
    especialidade: 'medico',
    ativo: true,
    horarios: [
      { diaSemana: 1, horaInicio: '08:00', horaFim: '12:00', intervaloInicio: '', intervaloFim: '', duracaoConsultaPadrao: 30 },
      { diaSemana: 1, horaInicio: '14:00', horaFim: '18:00', intervaloInicio: '', intervaloFim: '', duracaoConsultaPadrao: 30 },
      { diaSemana: 2, horaInicio: '08:00', horaFim: '17:00', intervaloInicio: '12:00', intervaloFim: '13:00', duracaoConsultaPadrao: 30 },
      { diaSemana: 3, horaInicio: '08:00', horaFim: '17:00', intervaloInicio: '12:00', intervaloFim: '13:00', duracaoConsultaPadrao: 30 },
      { diaSemana: 4, horaInicio: '08:00', horaFim: '17:00', intervaloInicio: '12:00', intervaloFim: '13:00', duracaoConsultaPadrao: 30 },
      { diaSemana: 5, horaInicio: '08:00', horaFim: '16:00', intervaloInicio: '12:00', intervaloFim: '13:00', duracaoConsultaPadrao: 30 }
    ]
  },
  {
    id: 'agenda-002',
    clinicaId: 'clinica-123',
    profissionalNome: 'Dra. Maria Santos',
    especialidade: 'dentista',
    ativo: true,
    horarios: [
      { diaSemana: 1, horaInicio: '09:00', horaFim: '18:00', intervaloInicio: '12:30', intervaloFim: '14:00', duracaoConsultaPadrao: 45 },
      { diaSemana: 3, horaInicio: '09:00', horaFim: '18:00', intervaloInicio: '12:30', intervaloFim: '14:00', duracaoConsultaPadrao: 45 },
      { diaSemana: 5, horaInicio: '09:00', horaFim: '17:00', intervaloInicio: '12:30', intervaloFim: '14:00', duracaoConsultaPadrao: 45 }
    ]
  },
  {
    id: 'agenda-003',
    clinicaId: 'clinica-123',
    profissionalNome: 'Dr. Carlos Oliveira',
    especialidade: 'medico',
    ativo: true,
    horarios: [
      { diaSemana: 2, horaInicio: '07:00', horaFim: '13:00', intervaloInicio: '', intervaloFim: '', duracaoConsultaPadrao: 20 },
      { diaSemana: 4, horaInicio: '07:00', horaFim: '13:00', intervaloInicio: '', intervaloFim: '', duracaoConsultaPadrao: 20 },
      { diaSemana: 6, horaInicio: '08:00', horaFim: '12:00', intervaloInicio: '', intervaloFim: '', duracaoConsultaPadrao: 20 }
    ]
  },
  {
    id: 'agenda-004',
    clinicaId: 'clinica-123',
    profissionalNome: 'Dra. Ana Paula Costa',
    especialidade: 'dentista',
    ativo: true,
    horarios: [
      { diaSemana: 0, horaInicio: '08:00', horaFim: '12:00', intervaloInicio: '', intervaloFim: '', duracaoConsultaPadrao: 60 },
      { diaSemana: 2, horaInicio: '14:00', horaFim: '20:00', intervaloInicio: '17:00', intervaloFim: '18:00', duracaoConsultaPadrao: 60 },
      { diaSemana: 4, horaInicio: '14:00', horaFim: '20:00', intervaloInicio: '17:00', intervaloFim: '18:00', duracaoConsultaPadrao: 60 },
      { diaSemana: 6, horaInicio: '08:00', horaFim: '14:00', intervaloInicio: '11:00', intervaloFim: '12:00', duracaoConsultaPadrao: 60 }
    ]
  }
];

localStorage.setItem('agendas_profissionais', JSON.stringify(agendasTeste));
console.log('✅ Agendas de teste criadas com sucesso!');
```

### Verificar os dados:
```javascript
JSON.parse(localStorage.getItem('agendas_profissionais'))
```
