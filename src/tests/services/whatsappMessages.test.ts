/**
 * Testes para services/whatsappMessages.ts
 *
 * Cobre: templates de mensagem, validação de telefone, formatação
 *
 * Para rodar: npm test
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import { gerarMensagemLembrete, gerarMensagemConfirmacao, gerarMensagemCancelamento, gerarMensagemConfirmacaoRecebida, gerarMenuAjuda, validarTelefone, formatarTelefoneWhatsApp } from '../../services/whatsappMessages';
import { Paciente, Consulta } from '../../types';

// ==================== FIXTURES ====================

const pacienteMock: Paciente = {
  id: 'pac_001',
  clinicaId: 'cli_001',
  matricula: '0001',
  nome: 'João da Silva',
  status: 'ativo',
  dataCadastro: '2024-01-01',
  dataNascimento: '1990-05-15',
  genero: 'masculino',
  estadoCivil: 'casado',
  dificuldadeLocomocao: false,
  cpf: '12345678901',
  telefone: '11999887766',
  email: 'joao@email.com',
  criadoEm: '2024-01-01T00:00:00.000Z'
};
const consultaMock: Consulta = {
  id: 'con_001',
  clinicaId: 'cli_001',
  pacienteId: 'pac_001',
  pacienteNome: 'João da Silva',
  tipo: 'medica',
  data: '2025-03-15',
  horario: '14:30',
  duracao: 30,
  status: 'agendada',
  profissional: 'Dr. Maria Santos',
  lembreteEnviado: false
};
const CLINICA_NOME = 'Clínica Saúde Total';

// ==================== VALIDAÇÃO DE TELEFONE ====================

describe('validarTelefone', () => {
  it('deve aceitar telefone celular com 11 dígitos', () => {
    expect(validarTelefone('11999887766')).toBe(true);
  });
  it('deve aceitar telefone fixo com 10 dígitos', () => {
    expect(validarTelefone('1133445566')).toBe(true);
  });
  it('deve aceitar telefone com código do país (13 dígitos)', () => {
    expect(validarTelefone('5511999887766')).toBe(true);
  });
  it('deve aceitar telefone formatado com máscara', () => {
    expect(validarTelefone('(11) 99988-7766')).toBe(true);
  });
  it('deve rejeitar telefone vazio', () => {
    expect(validarTelefone('')).toBe(false);
  });
  it('deve rejeitar telefone nulo/undefined', () => {
    expect(validarTelefone(null as any)).toBe(false);
    expect(validarTelefone(undefined as any)).toBe(false);
  });
  it('deve rejeitar telefone com menos de 10 dígitos', () => {
    expect(validarTelefone('123456789')).toBe(false);
  });
  it('deve rejeitar telefone com mais de 13 dígitos', () => {
    expect(validarTelefone('55119998877661')).toBe(false);
  });
  it('deve aceitar telefone com caracteres especiais (limpa antes)', () => {
    expect(validarTelefone('+55 (11) 99988-7766')).toBe(true);
  });
});

// ==================== FORMATAÇÃO DE TELEFONE ====================

describe('formatarTelefoneWhatsApp', () => {
  it('deve adicionar código 55 em telefone sem código do país', () => {
    expect(formatarTelefoneWhatsApp('11999887766')).toBe('5511999887766');
  });
  it('deve manter código 55 se já existir', () => {
    expect(formatarTelefoneWhatsApp('5511999887766')).toBe('5511999887766');
  });
  it('deve remover caracteres especiais', () => {
    expect(formatarTelefoneWhatsApp('(11) 99988-7766')).toBe('5511999887766');
  });
  it('deve remover + do início', () => {
    expect(formatarTelefoneWhatsApp('+5511999887766')).toBe('5511999887766');
  });
  it('deve funcionar com telefone fixo', () => {
    expect(formatarTelefoneWhatsApp('1133445566')).toBe('551133445566');
  });
});

// ==================== MENSAGEM DE LEMBRETE ====================

describe('gerarMensagemLembrete', () => {
  it('deve gerar mensagem padrão com dados do paciente', () => {
    const msg = gerarMensagemLembrete(pacienteMock, consultaMock, CLINICA_NOME);
    expect(msg).toContain('João da Silva');
    expect(msg).toContain(CLINICA_NOME);
    expect(msg).toContain('14:30');
    expect(msg).toContain('Dr. Maria Santos');
    expect(msg).toContain('SIM');
    expect(msg).toContain('NÃO');
  });
  it('deve usar template customizado quando fornecido', () => {
    const template = 'Olá {nome}! Consulta em {data} às {horario} com {profissional}. Clínica: {clinica}';
    const msg = gerarMensagemLembrete(pacienteMock, consultaMock, CLINICA_NOME, template);
    expect(msg).toContain('João da Silva');
    expect(msg).toContain('14:30');
    expect(msg).toContain('Dr. Maria Santos');
    expect(msg).toContain(CLINICA_NOME);
    // Não deve conter variáveis não substituídas
    expect(msg).not.toContain('{nome}');
    expect(msg).not.toContain('{data}');
    expect(msg).not.toContain('{horario}');
  });
  it('deve ignorar template customizado muito curto', () => {
    const msg = gerarMensagemLembrete(pacienteMock, consultaMock, CLINICA_NOME, 'curto');

    // Deve usar template padrão (contém emojis do padrão)
    expect(msg).toContain('👋');
    expect(msg).toContain('João da Silva');
  });
  it('deve substituir {especialidade} corretamente para consulta médica', () => {
    const template = 'Consulta de {especialidade}';
    const msg = gerarMensagemLembrete(pacienteMock, consultaMock, CLINICA_NOME, template);
    expect(msg).toContain('Consulta Médica');
  });
  it('deve substituir {especialidade} corretamente para odontologia', () => {
    const consultaOdonto = {
      ...consultaMock,
      tipo: 'odontologica' as const
    };
    const template = 'Consulta de {especialidade}';
    const msg = gerarMensagemLembrete(pacienteMock, consultaOdonto, CLINICA_NOME, template);
    expect(msg).toContain('Odontologia');
  });
  it('deve substituir {duracao} com valor padrão 30 se não informado', () => {
    const consultaSemDuracao = {
      ...consultaMock,
      duracao: 0
    };
    const template = 'Duração: {duracao} minutos';
    const msg = gerarMensagemLembrete(pacienteMock, consultaSemDuracao, CLINICA_NOME, template);

    // duracao é 0, então deve mostrar "0" (o template usa String(consulta.duracao || 30))
    expect(msg).toContain('30');
  });
  it('deve substituir múltiplas ocorrências da mesma variável', () => {
    const template = '{nome} - {nome} - {nome}';
    const msg = gerarMensagemLembrete(pacienteMock, consultaMock, CLINICA_NOME, template);
    expect(msg).toBe('João da Silva - João da Silva - João da Silva');
  });
});

// ==================== MENSAGEM DE CONFIRMAÇÃO ====================

describe('gerarMensagemConfirmacao', () => {
  it('deve gerar mensagem padrão com instruções SIM/NÃO', () => {
    const msg = gerarMensagemConfirmacao(pacienteMock, consultaMock, CLINICA_NOME);
    expect(msg).toContain('João da Silva');
    expect(msg).toContain('SIM');
    expect(msg).toContain('NÃO');
    expect(msg).toContain('Dr. Maria Santos');
  });
  it('deve adicionar instruções SIM/NÃO se template customizado não as tiver', () => {
    const template = 'Olá {nome}, confirme sua consulta em {data}';
    const msg = gerarMensagemConfirmacao(pacienteMock, consultaMock, CLINICA_NOME, template);
    expect(msg).toContain('João da Silva');
    expect(msg).toContain('SIM');
    expect(msg).toContain('NÃO');
  });
  it('NÃO deve duplicar instruções se template já contém SIM/NÃO', () => {
    const template = 'Olá {nome}! Responda SIM para confirmar ou NÃO para cancelar';
    const msg = gerarMensagemConfirmacao(pacienteMock, consultaMock, CLINICA_NOME, template);

    // Conta ocorrências de "SIM" - deve ter apenas as do template
    const countSIM = (msg.match(/SIM/g) || []).length;
    expect(countSIM).toBe(1);
  });
  it('deve usar nome de clínica padrão se não fornecido', () => {
    const msg = gerarMensagemConfirmacao(pacienteMock, consultaMock);
    expect(msg).toContain('Clínica');
  });
});

// ==================== MENSAGEM DE CANCELAMENTO ====================

describe('gerarMensagemCancelamento', () => {
  it('deve gerar mensagem de cancelamento sem motivo', () => {
    const msg = gerarMensagemCancelamento(pacienteMock, consultaMock, CLINICA_NOME);
    expect(msg).toContain('João da Silva');
    expect(msg).toContain('cancelada');
    expect(msg).toContain('reagendar');
    expect(msg).not.toContain('Motivo');
  });
  it('deve incluir motivo quando fornecido', () => {
    const msg = gerarMensagemCancelamento(pacienteMock, consultaMock, CLINICA_NOME, 'Compromisso pessoal');
    expect(msg).toContain('Motivo');
    expect(msg).toContain('Compromisso pessoal');
  });
  it('deve conter dados da consulta', () => {
    const msg = gerarMensagemCancelamento(pacienteMock, consultaMock, CLINICA_NOME);
    expect(msg).toContain('14:30');
    expect(msg).toContain('Dr. Maria Santos');
  });
});

// ==================== CONFIRMAÇÃO RECEBIDA ====================

describe('gerarMensagemConfirmacaoRecebida', () => {
  it('deve gerar mensagem de confirmação recebida', () => {
    const msg = gerarMensagemConfirmacaoRecebida(pacienteMock, consultaMock, CLINICA_NOME);
    expect(msg).toContain('João da Silva');
    expect(msg).toContain('confirmada');
    expect(msg).toContain('✅');
    expect(msg).toContain('14:30');
  });
});

// ==================== MENU DE AJUDA ====================

describe('gerarMenuAjuda', () => {
  it('deve gerar menu padrão com nome do paciente', () => {
    const msg = gerarMenuAjuda('Maria');
    expect(msg).toContain('Maria');
    expect(msg).toContain('1️⃣');
    expect(msg).toContain('0️⃣');
    expect(msg).toContain('Minhas consultas');
    expect(msg).toContain('Sair');
  });
  it('deve usar template customizado quando fornecido', () => {
    const template = 'Olá {nome}! Escolha:\n1 - Consultas\n2 - Sair';
    const msg = gerarMenuAjuda('Carlos', template);
    expect(msg).toContain('Carlos');
    expect(msg).toContain('Consultas');
    expect(msg).not.toContain('{nome}');
  });
  it('deve substituir múltiplas ocorrências de {nome}', () => {
    const template = '{nome}, bem-vindo! {nome}, escolha uma opção:';
    const msg = gerarMenuAjuda('Ana', template);
    expect(msg).toBe('Ana, bem-vindo! Ana, escolha uma opção:');
  });
  it('deve ignorar template customizado muito curto', () => {
    const msg = gerarMenuAjuda('Pedro', 'oi');

    // Deve usar menu padrão
    expect(msg).toContain('1️⃣');
    expect(msg).toContain('Pedro');
  });
});