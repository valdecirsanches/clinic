/**
 * Configurações globais são do super admin; as da clínica (procedimentos,
 * avaliação, aniversários, ponto) são do administrador daquela clínica.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const caminhoDb = require.resolve('../../server/databaseGlobal');
require.cache[caminhoDb] = {
  id: caminhoDb, filename: caminhoDb, loaded: true,
  exports: {
    prepare: () => ({
      all: async () => [{ id: 'c1', operadoraId: 'op1' }, { id: 'c2', operadoraId: 'op1' }, { id: 'c9', operadoraId: 'op9' }],
      get: async () => undefined,
      run: async () => ({ changes: 0 })
    })
  }
} as any;

const { regraConfiguracaoGlobal } = require('../../server/services/autenticacao');

const admin = { id: 'a', tipo: 'admin', clinicaId: 'c1', operadoraId: 'op1' };
const medico = { id: 'm', tipo: 'medico', clinicaId: 'c1', operadoraId: 'op1' };
const atendente = { id: 't', tipo: 'atendente', clinicaId: 'c1', operadoraId: 'op1' };

const gravar = (usuario: any, chave: string, valor: unknown = {}) =>
regraConfiguracaoGlobal(usuario, 'POST', '/configuracoes-globais', { chave, valor });

describe('regraConfiguracaoGlobal', () => {
  it('chaves do sistema continuam só do super admin', async () => {
    for (const chave of ['memed_config', 'precos_assinatura', 'dados_recebimento', 'permissoes_config', 'ajuda_voz', 'taxa_ponto_facial']) {
      expect(await gravar(admin, chave), chave).toMatch(/super administrador/);
    }
  });

  it('o admin grava as configurações da própria clínica', async () => {
    expect(await gravar(admin, 'procedimento_config_c1')).toBeNull();
    expect(await gravar(admin, 'avaliacao_config_c1')).toBeNull();
    expect(await gravar(admin, 'aniversario_config_c1')).toBeNull();
    expect(await gravar(admin, 'aniversario_config_c2')).toBeNull(); // mesma operadora
  });

  it('não grava em clínica de outra operadora nem em chave sem clínica', async () => {
    expect(await gravar(admin, 'procedimento_config_c9')).toMatch(/acesso/);
    expect(await gravar(admin, 'procedimento_config_NONE')).toMatch(/acesso/);
  });

  it('médico e atendente não alteram configurações da clínica', async () => {
    expect(await gravar(medico, 'procedimento_config_c1')).toMatch(/perfil/);
    expect(await gravar(medico, 'avaliacao_config_c1')).toMatch(/perfil/);
    expect(await gravar(atendente, 'aniversario_config_c1')).toMatch(/perfil/);
  });

  it('ponto: só o admin; ativar sim, desativar só o super admin', async () => {
    expect(await gravar(admin, 'ponto_facial_local_c1', { raio: 100 })).toBeNull();
    expect(await gravar(medico, 'ponto_facial_local_c1')).toMatch(/perfil/);
    expect(await gravar(admin, 'ponto_facial_ativo_c1', { ativo: true, ativadoPor: 'Ana' })).toBeNull();
    expect(await gravar(admin, 'ponto_facial_ativo_c1', JSON.stringify({ ativo: true }))).toBeNull();
    expect(await gravar(admin, 'ponto_facial_ativo_c1', { ativo: false })).toMatch(/desativar/);
  });

  it('excluir configuração é só do super admin', async () => {
    expect(await regraConfiguracaoGlobal(admin, 'DELETE', '/configuracoes-globais/procedimento_config_c1', {})).toMatch(/super/);
  });
});
