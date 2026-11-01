/**
 * Testes do assistente com ferramentas (server/assistente).
 *
 * Cobre: permissões por perfil, validação de argumentos, o laço de
 * ferramentas (leitura encadeada, proposta encerra, erros, limite de passos,
 * auditoria) e o registro real da agenda e da navegação.
 *
 * O modelo é simulado: nenhum teste chama a OpenAI nem o banco.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { podeAcessarPagina } = require('../../server/assistente/permissoes');
const { criarRegistro, paraOpenAI, validarArgumentos } = require('../../server/assistente/registro');
const { executarAgente, montarMensagens } = require('../../server/assistente/agente');

const atendente = { id: 'u1', nome: 'Ana', tipo: 'atendente', clinicaId: 'c1' };
const admin = { id: 'u2', nome: 'Bia', tipo: 'admin', clinicaId: 'c1' };
const medico = { id: 'u3', nome: 'Dr. Caio', tipo: 'medico', clinicaId: 'c1' };

// ---- Modelo simulado ---------------------------------------------------------

function chamada(nome: string, args: object | string, id = `call_${nome}`) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: [{ id, type: 'function', function: { name: nome, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }]
      }
    }],
    usage: { prompt_tokens: 100, completion_tokens: 10 }
  };
}

function texto(conteudo: string) {
  return { choices: [{ message: { content: conteudo } }], usage: { prompt_tokens: 50, completion_tokens: 5 } };
}

/** Devolve as respostas na ordem e guarda o que recebeu. */
function modeloRoteirizado(respostas: object[]) {
  const recebidos: any[] = [];
  const fn = vi.fn(async (pedido: any) => {
    recebidos.push(JSON.parse(JSON.stringify(pedido)));
    const r = respostas.shift();
    if (!r) throw new Error('modelo chamado mais vezes que o roteiro');
    return r;
  });
  return { fn, recebidos };
}

const objeto = (properties: object, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

function registroDeTeste() {
  const reg = criarRegistro();
  reg.registrar({
    nome: 'agenda_dia',
    tipo: 'leitura',
    pagina: 'agenda',
    descricao: 'Agenda do dia',
    parametros: objeto({ data: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }),
    executar: vi.fn(async (args: any) => ({ tipo: 'agenda', fala: `2 consultas em ${args.data || 'hoje'}.`, dados: { itens: [{ horario: '09:00' }, { horario: '10:00' }] } })),
    resumoParaIA: (r: any) => ({ fala: r.fala, total: r.dados.itens.length })
  });
  reg.registrar({
    nome: 'propor_marcacao',
    tipo: 'proposta',
    pagina: 'agenda',
    descricao: 'Prepara marcação',
    parametros: objeto({ paciente: { type: 'string' }, hora: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$' } }, ['paciente']),
    executar: vi.fn(async (args: any) => ({ tipo: 'proposta_marcacao', fala: `Confirma ${args.paciente}?`, dados: { args } }))
  });
  reg.registrar({
    nome: 'abrir_usuarios',
    tipo: 'navegacao',
    pagina: 'usuarios',
    descricao: 'Abre usuários',
    parametros: objeto({}),
    executar: vi.fn(async () => ({ tipo: 'navegar_tela', fala: 'Abrindo Usuários.', dados: { tela: 'usuarios' } }))
  });
  return reg;
}

async function rodar(reg: any, usuario: any, roteiro: object[], extra: any = {}) {
  const modelo = modeloRoteirizado(roteiro);
  const r = await executarAgente({
    mensagens: montarMensagens('sistema', [], 'pedido'),
    ferramentas: reg.disponiveis(usuario),
    ctx: { usuario },
    chamarModelo: modelo.fn,
    falaPadrao: 'AJUDA',
    ...extra
  });
  return { ...r, modelo };
}

// ---- Permissões ----------------------------------------------------------------

describe('podeAcessarPagina (espelho de useAuth.temPermissao)', () => {
  it('super_admin acessa tudo', () => {
    expect(podeAcessarPagina({ tipo: 'super_admin' }, 'operadoras')).toBe(true);
  });

  it('páginas essenciais não são bloqueadas por permissoesMenu', () => {
    expect(podeAcessarPagina({ tipo: 'atendente', permissoesMenu: '["pacientes"]' }, 'agenda')).toBe(true);
  });

  it('padrão por tipo quando não há permissoesMenu', () => {
    expect(podeAcessarPagina(atendente, 'usuarios')).toBe(false);
    expect(podeAcessarPagina(admin, 'usuarios')).toBe(true);
    expect(podeAcessarPagina(atendente, 'prontuarios')).toBe(false);
    expect(podeAcessarPagina(medico, 'prontuarios')).toBe(true);
  });

  it('permissoesMenu customizado manda (em texto JSON ou lista)', () => {
    expect(podeAcessarPagina({ tipo: 'atendente', permissoesMenu: '["cobrancas"]' }, 'pacientes')).toBe(false);
    expect(podeAcessarPagina({ tipo: 'atendente', permissoesMenu: ['cobrancas'] }, 'cobrancas')).toBe(true);
  });

  it('admin sempre acessa usuarios/auditoria mesmo com menu antigo', () => {
    expect(podeAcessarPagina({ tipo: 'admin', permissoesMenu: ['agenda'] }, 'auditoria')).toBe(true);
  });

  it('tipo desconhecido não acessa nada além do essencial', () => {
    expect(podeAcessarPagina({ tipo: 'visitante' }, 'pacientes')).toBe(false);
    expect(podeAcessarPagina(null, 'agenda')).toBe(false);
  });
});

// ---- Registro ------------------------------------------------------------------

describe('registro de ferramentas', () => {
  it('filtra pelo perfil do usuário', () => {
    const reg = registroDeTeste();
    expect(reg.disponiveis(atendente).map((f: any) => f.nome)).toEqual(['agenda_dia', 'propor_marcacao']);
    expect(reg.disponiveis(admin).map((f: any) => f.nome)).toContain('abrir_usuarios');
  });

  it('recusa ferramenta mal declarada ou duplicada', () => {
    const reg = criarRegistro();
    const base = { nome: 'x_y', tipo: 'leitura', pagina: 'agenda', descricao: 'd', executar: () => null };
    reg.registrar(base);
    expect(() => reg.registrar(base)).toThrow(/duplicada/);
    expect(() => reg.registrar({ ...base, nome: 'Ruim-Nome' })).toThrow(/inválido/);
    expect(() => reg.registrar({ ...base, nome: 'sem_tipo', tipo: 'escrita' })).toThrow(/tipo/);
    expect(() => reg.registrar({ ...base, nome: 'sem_pagina', pagina: '' })).toThrow(/página/);
  });

  it('gera o formato tools da OpenAI', () => {
    const tools = paraOpenAI(registroDeTeste().disponiveis(atendente));
    expect(tools[0]).toMatchObject({ type: 'function', function: { name: 'agenda_dia', description: 'Agenda do dia' } });
    expect(tools[0].function.parameters.properties.data).toBeTruthy();
  });
});

describe('validarArgumentos', () => {
  const esquema = objeto(
    {
      paciente: { type: 'string', maxLength: 10 },
      periodo: { type: 'string', enum: ['manha', 'tarde'] },
      dias: { type: 'integer', minimum: 1, maximum: 30 },
      data: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    },
    ['paciente']
  );

  it('normaliza tipos, corta texto e descarta campos desconhecidos', () => {
    const r = validarArgumentos(esquema, { paciente: '  Maria da Silva Souza ', dias: '7', extra: 'x', periodo: null });
    expect(r).toEqual({ ok: true, args: { paciente: 'Maria da S', dias: 7 } });
  });

  it('acusa obrigatório ausente, enum, padrão e faixa', () => {
    const r = validarArgumentos(esquema, { periodo: 'noite', data: '25/12', dias: 99 });
    expect(r.ok).toBe(false);
    expect(r.erros.join(' | ')).toMatch(/periodo.*manha/);
    expect(r.erros.join(' | ')).toMatch(/data fora do formato/);
    expect(r.erros.join(' | ')).toMatch(/dias acima/);
    expect(r.erros.join(' | ')).toMatch(/paciente é obrigatório/);
  });
});

// ---- Laço do agente ------------------------------------------------------------

describe('executarAgente', () => {
  it('responde em texto quando o modelo não chama ferramenta', async () => {
    const r = await rodar(registroDeTeste(), atendente, [texto('Olá! Posso ver a agenda.')]);
    expect(r.resultado).toEqual({ tipo: 'conversa', fala: 'Olá! Posso ver a agenda.', dados: null });
    expect(r.passos).toBe(1);
  });

  it('leitura volta para a IA e o cartão acompanha a fala final', async () => {
    const reg = registroDeTeste();
    const r = await rodar(reg, atendente, [chamada('agenda_dia', { data: '2026-11-02' }), texto('Amanhã são 2 consultas.')]);
    expect(r.resultado.tipo).toBe('agenda');
    expect(r.resultado.fala).toBe('Amanhã são 2 consultas.');
    expect(r.resultado.dados.itens).toHaveLength(2);
    // A IA recebeu o resumo enxuto, não os dados completos.
    const msgTool = r.modelo.recebidos[1].messages.find((m: any) => m.role === 'tool');
    expect(JSON.parse(msgTool.content)).toEqual({ fala: '2 consultas em 2026-11-02.', total: 2 });
    expect(r.uso).toEqual({ prompt_tokens: 150, completion_tokens: 15 });
  });

  it('proposta encerra o laço sem nova chamada ao modelo', async () => {
    const reg = registroDeTeste();
    const r = await rodar(reg, atendente, [chamada('propor_marcacao', { paciente: 'Maria', hora: '9:00' })]);
    expect(r.resultado).toMatchObject({ tipo: 'proposta_marcacao', fala: 'Confirma Maria?' });
    expect(r.modelo.fn).toHaveBeenCalledTimes(1);
    expect(reg.obter('propor_marcacao').executar).toHaveBeenCalledWith({ paciente: 'Maria', hora: '9:00' }, { usuario: atendente });
  });

  it('ferramenta fora do perfil não executa, mesmo se a IA chamar', async () => {
    const reg = registroDeTeste();
    const r = await rodar(reg, atendente, [chamada('abrir_usuarios', {}), texto('Seu perfil não abre Usuários.')]);
    expect(reg.obter('abrir_usuarios').executar).not.toHaveBeenCalled();
    expect(r.chamadas[0]).toMatchObject({ nome: 'abrir_usuarios', ok: false, erro: 'indisponivel' });
    expect(r.resultado.fala).toBe('Seu perfil não abre Usuários.');
  });

  it('argumentos inválidos voltam como erro para a IA corrigir', async () => {
    const reg = registroDeTeste();
    const r = await rodar(reg, atendente, [
    chamada('propor_marcacao', { hora: '9h' }),
    chamada('propor_marcacao', { paciente: 'João', hora: '09:00' })]
    );
    const erro = r.modelo.recebidos[1].messages.find((m: any) => m.role === 'tool');
    expect(erro.content).toMatch(/paciente é obrigatório/);
    expect(r.resultado.tipo).toBe('proposta_marcacao');
    expect(r.chamadas.map((c: any) => c.ok)).toEqual([false, true]);
  });

  it('JSON quebrado nos argumentos não derruba o pedido', async () => {
    const r = await rodar(registroDeTeste(), atendente, [chamada('agenda_dia', '{data:'), texto('Pode repetir?')]);
    expect(r.chamadas[0].erro).toMatch(/JSON/);
    expect(r.resultado.fala).toBe('Pode repetir?');
  });

  it('erro numa leitura volta para a IA; erro numa proposta encerra', async () => {
    const reg = registroDeTeste();
    reg.obter('agenda_dia').executar.mockRejectedValueOnce(new Error('banco fora'));
    const r1 = await rodar(reg, atendente, [chamada('agenda_dia', {}), texto('Não consegui ver a agenda.')]);
    expect(r1.resultado.fala).toBe('Não consegui ver a agenda.');

    reg.obter('propor_marcacao').executar.mockRejectedValueOnce(new Error('dia fechado'));
    const r2 = await rodar(reg, atendente, [chamada('propor_marcacao', { paciente: 'Maria' })]);
    expect(r2.resultado).toEqual({ tipo: 'conversa', fala: 'Não consegui concluir: dia fechado', dados: null });
  });

  it('no último passo obriga a IA a responder (tool_choice none)', async () => {
    const reg = registroDeTeste();
    const r = await rodar(
      reg,
      atendente,
      [chamada('agenda_dia', {}, 'a'), chamada('agenda_dia', {}, 'b'), texto('Pronto.')],
      { maxPassos: 3 }
    );
    expect(r.modelo.recebidos.map((p: any) => p.tool_choice)).toEqual(['auto', 'auto', 'none']);
    expect(r.resultado).toMatchObject({ tipo: 'agenda', fala: 'Pronto.' });
  });

  it('audita leitura e proposta, não navegação; falha de auditoria não derruba', async () => {
    const auditar = vi.fn(async () => {throw new Error('sem tabela');});
    const reg = registroDeTeste();
    await rodar(reg, atendente, [chamada('agenda_dia', { data: '2026-11-02' }), chamada('propor_marcacao', { paciente: 'Maria' })], { auditar });
    expect(auditar.mock.calls.map((c: any) => c[0].ferramenta.nome)).toEqual(['agenda_dia', 'propor_marcacao']);
    expect(auditar.mock.calls[0][0].args).toEqual({ data: '2026-11-02' });

    auditar.mockClear();
    await rodar(reg, admin, [chamada('abrir_usuarios', {})], { auditar });
    expect(auditar).not.toHaveBeenCalled();
  });

  it('sem nenhuma ferramenta disponível, conversa sem mandar tools', async () => {
    const r = await rodar(registroDeTeste(), { tipo: 'visitante' }, [texto('')]);
    expect(r.modelo.recebidos[0].tools).toBeUndefined();
    expect(r.resultado.fala).toBe('AJUDA');
  });
});

describe('montarMensagens', () => {
  it('limita o histórico e mapeia autores', () => {
    const historico = Array.from({ length: 12 }, (_, i) => ({ autor: i % 2 ? 'assistente' : 'usuario', texto: `m${i}` }));
    const msgs = montarMensagens('S', historico, 'agora');
    expect(msgs[0]).toEqual({ role: 'system', content: 'S' });
    expect(msgs).toHaveLength(1 + 8 + 1);
    expect(msgs[1]).toEqual({ role: 'user', content: 'm4' });
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'agora' });
  });
});

// ---- Ferramentas reais ------------------------------------------------------------

describe('ferramentas da agenda e da navegação', () => {
  const agenda = require('../../server/assistente/ferramentas/agenda');
  const navegacao = require('../../server/assistente/ferramentas/navegacao');
  const reg = criarRegistro();
  [...agenda, ...navegacao].forEach((f: any) => reg.registrar(f));

  it('cobrem as ações do modo clássico', () => {
    expect(reg.nomes().sort()).toEqual([
    'abrir_agenda', 'abrir_paciente', 'abrir_prontuario', 'abrir_tela', 'agenda_dia', 'consultas_paciente',
    'horarios_livres', 'novo_paciente', 'propor_cancelamento', 'propor_marcacao', 'propor_remarcacao', 'resumo_dia']
    );
  });

  it('a lista de telas segue o perfil', () => {
    const telas = (u: any) => reg.disponiveis(u).find((f: any) => f.nome === 'abrir_tela').parametros.properties.tela.enum;
    expect(telas(atendente)).not.toContain('usuarios');
    expect(telas(atendente)).not.toContain('auditoria');
    expect(telas(atendente)).toContain('agenda');
    expect(telas(admin)).toEqual(expect.arrayContaining(['usuarios', 'auditoria', 'assinatura']));
  });

  it('usuário sem a página Pacientes não abre cadastro nem cria paciente', () => {
    const nomes = reg.disponiveis({ tipo: 'atendente', permissoesMenu: ['cobrancas'] }).map((f: any) => f.nome);
    expect(nomes).not.toContain('abrir_paciente');
    expect(nomes).not.toContain('novo_paciente');
    expect(nomes).toContain('propor_marcacao'); // agenda é essencial
  });

  it('consultas_paciente não manda telefone para a IA', () => {
    const f = reg.obter('consultas_paciente');
    const resumo = f.resumoParaIA({
      fala: 'x',
      dados: { pacientes: [{ id: '1', nome: 'Maria', telefone: '11999990000', dataNascimento: '1990-01-01', consultas: [] }] }
    });
    expect(JSON.stringify(resumo)).not.toMatch(/11999990000|1990-01-01/);
  });
});
