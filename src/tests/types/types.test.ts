/**
 * Testes para types/index.ts
 *
 * Valida que as constantes e configurações de tipos estão corretas
 * Previne regressões em permissões e configurações
 */

import { describe, it, expect } from 'vitest';
import { PLANOS, PERMISSOES_PADRAO, MENU_ITEMS_CONFIG } from '../../types';

// ==================== PLANOS ====================

describe('PLANOS', () => {
  it('deve ter pelo menos 3 planos', () => {
    expect(PLANOS.length).toBeGreaterThanOrEqual(3);
  });
  it('deve ter plano gratuito', () => {
    const gratuito = PLANOS.find((p) => p.id === 'gratuito');
    expect(gratuito).toBeDefined();
    expect(gratuito!.preco).toBe(0);
  });
  it('deve ter plano básico com destaque', () => {
    const basico = PLANOS.find((p) => p.id === 'basico');
    expect(basico).toBeDefined();
    expect(basico!.destaque).toBe(true);
    expect(basico!.preco).toBeGreaterThan(0);
  });
  it('deve ter plano profissional com pacientes ilimitados', () => {
    const pro = PLANOS.find((p) => p.id === 'profissional');
    expect(pro).toBeDefined();
    expect(pro!.limitePacientes).toBeNull(); // null = ilimitado
  });
  it('todos os planos devem ter recursos', () => {
    PLANOS.forEach((plano) => {
      expect(plano.recursos.length).toBeGreaterThan(0);
    });
  });
  it('preços devem estar em ordem crescente', () => {
    for (let i = 1; i < PLANOS.length; i++) {
      expect(PLANOS[i].preco).toBeGreaterThanOrEqual(PLANOS[i - 1].preco);
    }
  });
});

// ==================== PERMISSÕES ====================

describe('PERMISSOES_PADRAO', () => {
  it('super_admin deve ter acesso a TODOS os menus', () => {
    const todosMenus = MENU_ITEMS_CONFIG.map((m) => m.id);
    const permissoesSuperAdmin = PERMISSOES_PADRAO.super_admin;
    todosMenus.forEach((menuId) => {
      expect(permissoesSuperAdmin).toContain(menuId);
    });
  });
  it('admin deve ter acesso ao dashboard', () => {
    expect(PERMISSOES_PADRAO.admin).toContain('dashboard');
  });
  it('admin deve ter acesso a usuários', () => {
    expect(PERMISSOES_PADRAO.admin).toContain('usuarios');
  });
  it('atendente NÃO deve ter acesso a prontuários', () => {
    expect(PERMISSOES_PADRAO.atendente).not.toContain('prontuarios');
  });
  it('atendente deve ter acesso à agenda', () => {
    expect(PERMISSOES_PADRAO.atendente).toContain('agenda');
  });
  it('médico deve ter acesso a prontuários', () => {
    expect(PERMISSOES_PADRAO.medico).toContain('prontuarios');
  });
  it('dentista deve ter acesso a prontuários', () => {
    expect(PERMISSOES_PADRAO.dentista).toContain('prontuarios');
  });
  it('atendente NÃO deve ter acesso a configurações globais', () => {
    expect(PERMISSOES_PADRAO.atendente).not.toContain('configuracoes_globais');
  });
  it('médico NÃO deve ter acesso a operadoras', () => {
    expect(PERMISSOES_PADRAO.medico).not.toContain('operadoras');
  });
  it('todos os tipos de usuário devem ter dashboard e agenda', () => {
    const tipos = Object.keys(PERMISSOES_PADRAO) as Array<keyof typeof PERMISSOES_PADRAO>;
    tipos.forEach((tipo) => {
      expect(PERMISSOES_PADRAO[tipo]).toContain('dashboard');
      expect(PERMISSOES_PADRAO[tipo]).toContain('agenda');
    });
  });
});

// ==================== MENU ITEMS CONFIG ====================

describe('MENU_ITEMS_CONFIG', () => {
  it('deve ter IDs únicos', () => {
    const ids = MENU_ITEMS_CONFIG.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
  it('todos os itens devem ter label', () => {
    MENU_ITEMS_CONFIG.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.label.length).toBeGreaterThan(0);
    });
  });
  it('todos os itens devem ter categoria', () => {
    MENU_ITEMS_CONFIG.forEach((item) => {
      expect(item.categoria).toBeTruthy();
    });
  });
  it('deve conter itens essenciais', () => {
    const ids = MENU_ITEMS_CONFIG.map((m) => m.id);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('agenda');
    expect(ids).toContain('pacientes');
    expect(ids).toContain('prontuarios');
    expect(ids).toContain('configuracoes');
  });
});