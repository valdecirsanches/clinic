/**
 * Cadastro de conta nova: formato de e-mail/celular aceitos, máscaras e a
 * configuração lida do .env.local (CADASTRO_*).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const v = require('../../server/services/verificacaoCadastro');

afterEach(() => {
  delete process.env.CADASTRO_CONFIRMAR_EMAIL;
  delete process.env.CADASTRO_CONFIRMAR_CELULAR;
  delete process.env.CADASTRO_CELULAR_CANAL;
});

describe('normalização', () => {
  it('e-mail fica em minúsculas e precisa de domínio', () => {
    expect(v.normalizarEmail('  Maria@Clinica.COM.br ')).toBe('maria@clinica.com.br');
    expect(v.normalizarEmail('maria@clinica')).toBeNull();
    expect(v.normalizarEmail('maria clinica.com')).toBeNull();
  });

  it('celular aceita com ou sem DDI e máscara; recusa fixo', () => {
    expect(v.normalizarCelular('(11) 98765-4321')).toBe('5511987654321');
    expect(v.normalizarCelular('+55 11 98765-4321')).toBe('5511987654321');
    expect(v.normalizarCelular('011987654321')).toBe('5511987654321');
    expect(v.normalizarCelular('(11) 3456-7890')).toBeNull(); // fixo
    expect(v.normalizarCelular('(11) 88765-4321')).toBeNull(); // celular começa com 9
    expect(v.normalizarCelular('9876')).toBeNull();
  });

  it('máscaras não revelam o destino inteiro', () => {
    expect(v.mascararEmail('maria@clinica.com.br')).toBe('ma•••@clinica.com.br');
    expect(v.mascararCelular('5511987654321')).toBe('(11) •••••-4321');
  });
});

describe('configuracao (.env.local)', () => {
  it('padrão: confirma e-mail e celular, canal automático', () => {
    expect(v.configuracao()).toEqual({ confirmarEmail: true, confirmarCelular: true, canalCelular: 'auto' });
  });

  it('desliga cada confirmação e escolhe o canal', () => {
    process.env.CADASTRO_CONFIRMAR_EMAIL = '0';
    process.env.CADASTRO_CONFIRMAR_CELULAR = 'nao';
    process.env.CADASTRO_CELULAR_CANAL = 'SMS';
    expect(v.configuracao()).toEqual({ confirmarEmail: false, confirmarCelular: false, canalCelular: 'sms' });
  });

  it('canal desconhecido vira automático', () => {
    process.env.CADASTRO_CELULAR_CANAL = 'telegram';
    expect(v.configuracao().canalCelular).toBe('auto');
  });
});
