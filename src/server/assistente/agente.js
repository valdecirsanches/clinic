// ==================== ASSISTENTE — LAÇO DE FERRAMENTAS ====================
// A IA recebe a lista de ferramentas que ESTE usuário pode usar e decide qual
// chamar. O laço:
//   1. pede ao modelo a próxima jogada;
//   2. se ele chamou uma ferramenta de leitura, executa e devolve o resultado
//      para ele (pode encadear até `maxPassos`);
//   3. se chamou proposta ou navegação, executa e encerra: o cartão vai para a
//      tela e o usuário decide;
//   4. se respondeu em texto, encerra com essa fala (e o último cartão de
//      leitura, se houver, para a tela mostrar os dados).
//
// Nada aqui fala com banco ou com a OpenAI diretamente: tudo chega injetado,
// o que deixa o laço testável sem rede.

const { paraOpenAI, validarArgumentos } = require('./registro');

const LIMITE_RESULTADO = 6000;

function conversa(fala) {
  return { tipo: 'conversa', fala, dados: null };
}

function paraTexto(valor) {
  const s = JSON.stringify(valor);
  return s.length > LIMITE_RESULTADO ? `${s.slice(0, LIMITE_RESULTADO)}… (resultado cortado)` : s;
}

/** Monta as mensagens: sistema + histórico curto + pedido atual. */
function montarMensagens(sistema, historico, texto) {
  const mensagens = [{ role: 'system', content: sistema }];
  for (const h of (Array.isArray(historico) ? historico : []).slice(-8)) {
    if (!h || !h.texto) continue;
    mensagens.push({ role: h.autor === 'usuario' ? 'user' : 'assistant', content: String(h.texto).slice(0, 600) });
  }
  mensagens.push({ role: 'user', content: String(texto).slice(0, 1000) });
  return mensagens;
}

function lerArgumentos(bruto) {
  if (bruto && typeof bruto === 'object') return bruto;
  try {
    return JSON.parse(String(bruto || '{}'));
  } catch (e) {
    return null;
  }
}

async function executarAgente({
  mensagens,
  ferramentas,
  ctx,
  chamarModelo,
  auditar = null,
  maxPassos = 4,
  falaPadrao = 'Não entendi o pedido. Pode repetir de outro jeito?'
}) {
  const porNome = new Map(ferramentas.map((f) => [f.nome, f]));
  const tools = paraOpenAI(ferramentas);
  const chamadas = [];
  const uso = { prompt_tokens: 0, completion_tokens: 0 };
  let ultimoCartao = null;

  const fim = (resultado, passos) => ({ resultado, chamadas, uso, passos });

  for (let passo = 1; passo <= maxPassos; passo++) {
    const ultimo = passo === maxPassos;
    const resposta = await chamarModelo({
      messages: mensagens,
      tools: tools.length ? tools : undefined,
      // No último passo a IA tem que responder com o que já sabe.
      tool_choice: tools.length ? ultimo ? 'none' : 'auto' : undefined
    });
    if (resposta && resposta.usage) {
      uso.prompt_tokens += Number(resposta.usage.prompt_tokens) || 0;
      uso.completion_tokens += Number(resposta.usage.completion_tokens) || 0;
    }
    const msg = resposta && resposta.choices && resposta.choices[0] && resposta.choices[0].message || {};
    const pedidas = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((t) => t && t.function) : [];

    if (!pedidas.length) {
      const texto = String(msg.content || '').trim().slice(0, 1200);
      if (ultimoCartao) return fim({ ...ultimoCartao, fala: texto || ultimoCartao.fala }, passo);
      return fim(conversa(texto || falaPadrao), passo);
    }

    mensagens.push({ role: 'assistant', content: msg.content || null, tool_calls: pedidas });

    for (const chamada of pedidas) {
      const nome = chamada.function.name;
      const f = porNome.get(nome);
      const registro = { nome, args: null, ok: false };
      chamadas.push(registro);
      const responder = (conteudo) => mensagens.push({ role: 'tool', tool_call_id: chamada.id, content: paraTexto(conteudo) });

      if (!f) {
        registro.erro = 'indisponivel';
        responder({ erro: 'Ferramenta indisponível para este usuário. Explique o que você consegue fazer.' });
        continue;
      }
      const brutos = lerArgumentos(chamada.function.arguments);
      const validacao = brutos ? validarArgumentos(f.parametros, brutos) : { ok: false, erros: ['argumentos não são JSON'] };
      if (!validacao.ok) {
        registro.erro = validacao.erros.join('; ');
        responder({ erro: `Argumentos inválidos: ${registro.erro}` });
        continue;
      }
      registro.args = validacao.args;

      let resultado;
      try {
        resultado = await f.executar(validacao.args, ctx);
      } catch (e) {
        registro.erro = e.message;
        // Proposta ou navegação que falhou: não adianta a IA insistir.
        if (f.tipo !== 'leitura') return fim(conversa(`Não consegui concluir: ${e.message}`), passo);
        responder({ erro: e.message });
        continue;
      }
      registro.ok = true;
      registro.tipoResultado = resultado && resultado.tipo;

      if (auditar && f.tipo !== 'navegacao') {
        try {
          await auditar({ ferramenta: f, args: validacao.args, resultado });
        } catch (e) {
          // Auditoria nunca derruba o pedido.
        }
      }

      if (f.tipo !== 'leitura') return fim(resultado, passo);

      if (resultado && resultado.tipo !== 'conversa') ultimoCartao = resultado;
      responder(typeof f.resumoParaIA === 'function' ? f.resumoParaIA(resultado) : { fala: resultado.fala, dados: resultado.dados });
    }
  }

  return fim(ultimoCartao || conversa(falaPadrao), maxPassos);
}

module.exports = { executarAgente, montarMensagens, conversa };
