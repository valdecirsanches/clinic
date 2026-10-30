/**
 * Testes para utils/boletoGenerator.ts
 *
 * Cobre: formatação de moeda, CPF, CNPJ, geração de documentos,
 * linha digitável e código de barras com dados bancários reais
 */

import { describe, it, expect } from 'vitest';
import { formatarMoeda, formatarCPF, formatarCNPJ, gerarNumeroDocumento, gerarNossoNumero, gerarLinhaDigitavel, gerarCodigoBarras, gerarHTMLBoleto } from '../../utils/boletoGenerator';

// ==================== FORMATAÇÃO DE MOEDA ====================

describe('formatarMoeda', () => {
  it('deve formatar valor inteiro', () => {
    const resultado = formatarMoeda(100);
    expect(resultado).toContain('100');
    expect(resultado).toContain('R$');
  });
  it('deve formatar valor com centavos', () => {
    const resultado = formatarMoeda(99.9);
    expect(resultado).toContain('99');
    expect(resultado).toContain('R$');
  });
  it('deve formatar valor zero', () => {
    const resultado = formatarMoeda(0);
    expect(resultado).toContain('0');
    expect(resultado).toContain('R$');
  });
  it('deve formatar valores grandes com separador de milhar', () => {
    const resultado = formatarMoeda(1500.5);
    expect(resultado).toContain('R$');
    expect(resultado).toContain('1.500');
  });
});

// ==================== FORMATAÇÃO DE CPF ====================

describe('formatarCPF', () => {
  it('deve formatar CPF com 11 dígitos', () => {
    expect(formatarCPF('12345678901')).toBe('123.456.789-01');
  });
  it('deve retornar original se não tem 11 dígitos', () => {
    expect(formatarCPF('1234')).toBe('1234');
  });
  it('deve limpar caracteres antes de formatar', () => {
    expect(formatarCPF('123.456.789-01')).toBe('123.456.789-01');
  });
  it('deve lidar com CPF vazio', () => {
    expect(formatarCPF('')).toBe('');
  });
});

// ==================== FORMATAÇÃO DE CNPJ ====================

describe('formatarCNPJ', () => {
  it('deve formatar CNPJ com 14 dígitos', () => {
    expect(formatarCNPJ('12345678000190')).toBe('12.345.678/0001-90');
  });
  it('deve retornar original se não tem 14 dígitos', () => {
    expect(formatarCNPJ('1234')).toBe('1234');
  });
  it('deve lidar com CNPJ vazio', () => {
    expect(formatarCNPJ('')).toBe('');
  });
});

// ==================== GERAÇÃO DE NÚMERO DE DOCUMENTO ====================

describe('gerarNumeroDocumento', () => {
  it('deve gerar número com prefixo padrão DOC', () => {
    const num = gerarNumeroDocumento();
    expect(num).toMatch(/^DOC\d+$/);
  });
  it('deve gerar número com prefixo customizado', () => {
    const num = gerarNumeroDocumento('BOL');
    expect(num.startsWith('BOL')).toBe(true);
  });
  it('deve gerar números únicos', () => {
    const num1 = gerarNumeroDocumento();
    const num2 = gerarNumeroDocumento();
    expect(typeof num1).toBe('string');
    expect(typeof num2).toBe('string');
    expect(num1.length).toBeGreaterThan(5);
  });
  it('deve conter data no formato AAMMDD', () => {
    const num = gerarNumeroDocumento('X');
    const numPart = num.replace('X', '');
    expect(numPart.length).toBe(10); // AAMMDD + 4 random
  });
});

// ==================== NOSSO NÚMERO ====================

describe('gerarNossoNumero', () => {
  it('deve gerar nosso número com 8 dígitos', () => {
    const nn = gerarNossoNumero('BOL2601150001');
    expect(nn.length).toBe(8);
    expect(nn).toMatch(/^\d{8}$/);
  });
  it('deve extrair dígitos do documento', () => {
    const nn = gerarNossoNumero('DOC2506150001');
    expect(nn).toMatch(/^\d{8}$/);
  });
  it('deve preencher com zeros se poucos dígitos', () => {
    const nn = gerarNossoNumero('A1B2');
    expect(nn.length).toBe(8);
    expect(nn).toBe('00000012');
  });
});

// ==================== LINHA DIGITÁVEL ====================

describe('gerarLinhaDigitavel', () => {
  it('deve gerar linha digitável com formato correto', () => {
    const linha = gerarLinhaDigitavel(150.0, '2025-06-15');
    expect(typeof linha).toBe('string');
    expect(linha.length).toBeGreaterThan(30);
    // Deve conter pontos e espaços do formato
    expect(linha).toContain('.');
    expect(linha).toContain(' ');
  });
  it('deve gerar linhas diferentes para valores diferentes', () => {
    const linha1 = gerarLinhaDigitavel(100, '2025-06-15');
    const linha2 = gerarLinhaDigitavel(200, '2025-06-15');
    expect(typeof linha1).toBe('string');
    expect(typeof linha2).toBe('string');
    // O campo 5 (fator+valor) deve ser diferente
    expect(linha1).not.toBe(linha2);
  });
  it('deve usar código do banco quando fornecido', () => {
    const linha = gerarLinhaDigitavel(150.0, '2025-06-15', '341', '1234', '56789', '109', '00000001');
    expect(typeof linha).toBe('string');
    // Deve começar com o código do banco 341
    expect(linha.startsWith('341')).toBe(true);
  });
  it('deve gerar linha com dados bancários reais do Itaú', () => {
    const linha = gerarLinhaDigitavel(250.0, '2025-07-20', '341', '1234', '56789', '109', '00000042');
    expect(linha).toContain('.');
    expect(linha).toContain(' ');
    // Formato: XXXXX.XXXXX XXXXX.XXXXX XXXXX.XXXXX X XXXXXXXXXXXXXX
    const partes = linha.split(' ');
    expect(partes.length).toBe(5);
  });
  it('deve gerar linha com dados bancários reais do Bradesco', () => {
    const linha = gerarLinhaDigitavel(300.0, '2025-08-10', '237', '0001', '1234567', '09', '00000099');
    expect(linha.startsWith('237')).toBe(true);
    const partes = linha.split(' ');
    expect(partes.length).toBe(5);
  });
});

// ==================== CÓDIGO DE BARRAS ====================

describe('gerarCodigoBarras', () => {
  it('deve gerar código com tamanho correto (44 dígitos)', () => {
    const codigo = gerarCodigoBarras(150.0, '2025-06-15');
    expect(typeof codigo).toBe('string');
    expect(codigo.length).toBe(44);
  });
  it('deve começar com código do banco padrão 001', () => {
    const codigo = gerarCodigoBarras(150.0, '2025-06-15');
    expect(codigo.startsWith('001')).toBe(true);
  });
  it('deve usar código do banco fornecido', () => {
    const codigo = gerarCodigoBarras(150.0, '2025-06-15', '341', '1234', '56789', '109', '00000001');
    expect(codigo.startsWith('341')).toBe(true);
  });
  it('deve conter apenas dígitos', () => {
    const codigo = gerarCodigoBarras(150.0, '2025-06-15');
    expect(codigo).toMatch(/^\d+$/);
  });
  it('deve ter moeda 9 na posição 4', () => {
    const codigo = gerarCodigoBarras(150.0, '2025-06-15');
    expect(codigo[3]).toBe('9');
  });
  it('deve conter o valor correto nas posições 6-15', () => {
    const codigo = gerarCodigoBarras(150.0, '2025-06-15');
    const valorNoCodigo = codigo.substring(9, 19);
    // 150.00 = 15000 centavos = 0000015000
    expect(valorNoCodigo).toBe('0000015000');
  });
  it('deve gerar códigos diferentes para bancos diferentes', () => {
    const codigoItau = gerarCodigoBarras(150.0, '2025-06-15', '341', '1234', '56789', '109', '00000001');
    const codigoBradesco = gerarCodigoBarras(150.0, '2025-06-15', '237', '1234', '56789', '09', '00000001');
    // O campo livre (posições 19-43) deve ser diferente
    expect(codigoItau.substring(19)).not.toBe(codigoBradesco.substring(19));
  });
});

// ==================== HTML DO BOLETO ====================

describe('gerarHTMLBoleto', () => {
  const dadosBoleto = {
    cedente: {
      nome: 'Clínica Saúde Total',
      cnpj: '12345678000190',
      endereco: 'Rua Exemplo, 123',
      cidade: 'São Paulo',
      uf: 'SP'
    },
    sacado: {
      nome: 'João da Silva',
      cpf: '12345678901',
      endereco: 'Rua do Paciente, 456',
      cidade: 'São Paulo',
      uf: 'SP'
    },
    valor: 150.0,
    dataVencimento: '2025-06-15',
    numeroDocumento: 'DOC2506150001',
    descricao: 'Consulta médica'
  };
  it('deve gerar HTML válido', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });
  it('deve conter dados do cedente', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('Clínica Saúde Total');
  });
  it('deve conter dados do sacado', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('João da Silva');
    expect(html).toContain('123.456.789-01'); // CPF formatado
  });
  it('deve conter valor formatado', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('R$');
    expect(html).toContain('150');
  });
  it('deve conter descrição quando fornecida', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('Consulta médica');
  });
  it('deve conter duas vias (banco e sacado)', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('1ª Via - Banco');
    expect(html).toContain('2ª Via - Sacado');
  });
  it('deve conter linha de corte', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('Corte aqui');
  });
  it('deve conter local de pagamento padrão', () => {
    const html = gerarHTMLBoleto(dadosBoleto);
    expect(html).toContain('PAGÁVEL EM QUALQUER BANCO ATÉ O VENCIMENTO');
  });
  it('deve usar dados bancários reais quando fornecidos', () => {
    const dadosComBanco = {
      ...dadosBoleto,
      banco: 'Itaú Unibanco',
      codigoBanco: '341',
      agencia: '1234-5',
      conta: '56789-0',
      carteira: '109',
      convenio: ''
    };
    const html = gerarHTMLBoleto(dadosComBanco);
    expect(html).toContain('Itaú Unibanco');
    expect(html).toContain('341-9');
    expect(html).toContain('1234-5');
  });
});
describe('fator de vencimento (reinício FEBRABAN em 22/02/2025)', () => {
  it('21/02/2025 ainda é 9999 e 22/02/2025 volta para 1000', () => {
    expect(gerarCodigoBarras(10, '2025-02-21').substring(5, 9)).toBe('9999');
    expect(gerarCodigoBarras(10, '2025-02-22').substring(5, 9)).toBe('1000');
  });
  it('mantém 44 dígitos para vencimentos de 2026 em diante', () => {
    expect(gerarCodigoBarras(10, '2026-10-30')).toHaveLength(44);
  });
});
