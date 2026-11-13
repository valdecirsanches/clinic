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
