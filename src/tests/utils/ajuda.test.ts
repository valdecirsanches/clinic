import { describe, it, expect } from 'vitest';
import { topicoDaTela, pesquisarAjuda, topicoVisivelPara, buscarTopicoAjuda } from '../../data/ajuda';

describe('ajuda das telas', () => {
  it('no prontuário mostra a ajuda da aba aberta', () => {
    expect(topicoDaTela('prontuario_atendimento', 'prescricoes').id).toBe('prontuario_atendimento:prescricoes');
    expect(topicoDaTela('prontuario_atendimento', 'aba_desconhecida').id).toBe('prontuario_atendimento');
  });

  it('tela sem ajuda própria cai na visão geral', () => {
    expect(topicoDaTela('tela_que_nao_existe').id).toBe('inicio');
  });

  it('procura sem diferenciar acentos e por palavra-chave', () => {
    expect(pesquisarAjuda('receita', 'medico').map((t) => t.id)).toContain('prontuario_atendimento:prescricoes');
    expect(pesquisarAjuda('cobranca', 'admin')[0].id).toBe('cobrancas');
    expect(pesquisarAjuda('xyzxyz', 'admin')).toEqual([]);
  });

  it('esconde tópicos exclusivos do super admin', () => {
    const operadoras = buscarTopicoAjuda('operadoras')!;
    expect(topicoVisivelPara(operadoras, 'atendente')).toBe(false);
    expect(topicoVisivelPara(operadoras, 'super_admin')).toBe(true);
    expect(pesquisarAjuda('', 'atendente').some((t) => t.id === 'operadoras')).toBe(false);
  });
});

import { createRequire } from 'module';
import { topicosAjuda, passosDoTour } from '../../data/ajuda';

describe('tour guiado', () => {
  const require = createRequire(import.meta.url);
  const servidor = require('../../server/ajuda/catalogo');

  it('o app e o servidor montam os mesmos passos (o servidor narra pelo índice)', () => {
    for (const t of topicosAjuda) {
      expect(passosDoTour(t), t.id).toEqual(servidor.passosDoTour(servidor.buscarTopico(t.id)));
    }
  });

  it('toda tela tem tour com texto em todos os passos', () => {
    for (const t of topicosAjuda) {
      const passos = passosDoTour(t);
      expect(passos.length, t.id).toBeGreaterThan(0);
      for (const p of passos) expect(p.texto.trim(), t.id).not.toBe('');
    }
  });

  it('sem tour escrito, usa resumo e passos da ajuda, sem alvo', () => {
    const t = { id: 'x', grupo: 'g', titulo: 'T', resumo: 'R', passos: ['a', 'b'], dicas: [] };
    expect(passosDoTour(t)).toEqual([{ alvo: null, texto: 'R' }, { alvo: null, texto: 'a' }, { alvo: null, texto: 'b' }]);
  });
});
