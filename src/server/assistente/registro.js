// ==================== ASSISTENTE — REGISTRO DE FERRAMENTAS ====================
// Cada módulo do sistema (agenda, pacientes, financeiro...) declara as
// ferramentas que o assistente pode usar. A IA escolhe a ferramenta e os
// argumentos; quem executa e decide é sempre o servidor.
//
// Formato de uma ferramenta:
//   {
//     nome: 'horarios_livres',          // snake_case, único
//     descricao: 'Quando usar...',      // vai para a IA
//     pagina: 'agenda',                 // página do menu exigida (permissoes.js); '*' = qualquer usuário
//     tipo: 'leitura' | 'proposta' | 'navegacao',
//     parametros: { JSON Schema } ou (usuario) => JSON Schema,
//     disponivel?: (usuario) => boolean, // regra extra, além da página
//     executar: async (args, ctx) => ({ tipo, fala, dados }),
//     resumoParaIA?: (resultado) => objeto enviado de volta à IA (só leitura)
//   }
//
// Tipos:
//   • leitura   — só consulta; o resultado volta para a IA, que pode encadear
//                 outra ferramenta ou responder.
//   • proposta  — prepara uma gravação (marcar, cancelar...). NÃO grava: o
//                 cartão vai para a tela e o usuário confirma. Encerra o pedido.
//   • navegacao — abre uma tela. Encerra o pedido.

const { podeAcessarPagina } = require('./permissoes');

const TIPOS = ['leitura', 'proposta', 'navegacao'];
const NOME_VALIDO = /^[a-z][a-z0-9_]{1,63}$/;

function criarRegistro() {
  const ferramentas = new Map();

  function registrar(f) {
    if (!f || !NOME_VALIDO.test(String(f.nome || ''))) throw new Error(`Ferramenta com nome inválido: ${f && f.nome}`);
    if (ferramentas.has(f.nome)) throw new Error(`Ferramenta duplicada: ${f.nome}`);
    if (!TIPOS.includes(f.tipo)) throw new Error(`Ferramenta ${f.nome}: tipo deve ser ${TIPOS.join(', ')}`);
    if (!f.pagina) throw new Error(`Ferramenta ${f.nome}: declare a página exigida`);
    if (typeof f.executar !== 'function') throw new Error(`Ferramenta ${f.nome}: falta executar()`);
    if (!f.descricao) throw new Error(`Ferramenta ${f.nome}: falta descricao`);
    ferramentas.set(f.nome, f);
    return f;
  }

  function podeUsar(usuario, f) {
    if (!f || !usuario) return false;
    if (f.pagina !== '*' && !podeAcessarPagina(usuario, f.pagina)) return false;
    if (typeof f.disponivel === 'function' && !f.disponivel(usuario)) return false;
    return true;
  }

  /** Ferramentas que este usuário pode usar, já com os parâmetros resolvidos. */
  function disponiveis(usuario) {
    const lista = [];
    for (const f of ferramentas.values()) {
      if (!podeUsar(usuario, f)) continue;
      const parametros = typeof f.parametros === 'function' ? f.parametros(usuario) : f.parametros;
      lista.push({ ...f, parametros: parametros || { type: 'object', properties: {} } });
    }
    return lista;
  }

  return {
    registrar,
    disponiveis,
    obter: (nome) => ferramentas.get(nome) || null,
    nomes: () => [...ferramentas.keys()]
  };
}

/** Formato `tools` da API de chat da OpenAI. */
function paraOpenAI(lista) {
  return lista.map((f) => ({
    type: 'function',
    function: { name: f.nome, description: f.descricao, parameters: f.parametros }
  }));
}

// ---- Validação dos argumentos ----------------------------------------------
// A IA erra: manda número como texto, campo a mais, enum fora da lista. Aqui
// só passa o que o esquema declara; o resto é descartado ou vira erro claro.

function validarValor(esquema, valor, caminho) {
  if (valor === null || valor === undefined || valor === '') return { ok: true, valor: null };
  const tipo = esquema.type;
  let v = valor;
  if (tipo === 'string') {
    if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
    if (typeof v !== 'string') return { ok: false, erro: `${caminho} deve ser texto` };
    v = v.trim().slice(0, esquema.maxLength || 500);
    if (!v) return { ok: true, valor: null };
    if (esquema.pattern && !new RegExp(esquema.pattern).test(v)) return { ok: false, erro: `${caminho} fora do formato esperado` };
  } else if (tipo === 'integer' || tipo === 'number') {
    v = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, erro: `${caminho} deve ser número` };
    if (tipo === 'integer') v = Math.trunc(v);
    if (esquema.minimum !== undefined && v < esquema.minimum) return { ok: false, erro: `${caminho} abaixo do mínimo` };
    if (esquema.maximum !== undefined && v > esquema.maximum) return { ok: false, erro: `${caminho} acima do máximo` };
  } else if (tipo === 'boolean') {
    if (v === 'true') v = true;
    if (v === 'false') v = false;
    if (typeof v !== 'boolean') return { ok: false, erro: `${caminho} deve ser verdadeiro ou falso` };
  }
  if (esquema.enum && !esquema.enum.includes(v)) return { ok: false, erro: `${caminho} deve ser um de: ${esquema.enum.join(', ')}` };
  return { ok: true, valor: v };
}

/** Confere os argumentos da IA contra o esquema da ferramenta. */
function validarArgumentos(esquema, args) {
  const props = esquema && esquema.properties || {};
  const obrig = esquema && esquema.required || [];
  const entrada = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const saida = {};
  const erros = [];
  for (const [campo, def] of Object.entries(props)) {
    const r = validarValor(def, entrada[campo], campo);
    if (!r.ok) erros.push(r.erro);else
    if (r.valor !== null) saida[campo] = r.valor;
  }
  for (const campo of obrig) {
    if (saida[campo] === undefined && !erros.some((e) => e.startsWith(campo))) erros.push(`${campo} é obrigatório`);
  }
  return erros.length ? { ok: false, erros } : { ok: true, args: saida };
}

module.exports = { criarRegistro, paraOpenAI, validarArgumentos, TIPOS };
