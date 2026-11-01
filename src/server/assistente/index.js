// ==================== ASSISTENTE — PONTO DE ENTRADA ====================
// Monta o registro com as ferramentas de todos os módulos e responde a um
// pedido da recepção/equipe usando o laço de ferramentas.
//
// Para um módulo novo (financeiro, convênios...): crie
// ferramentas/<modulo>.js exportando uma lista de ferramentas no formato de
// registro.js e acrescente em MODULOS abaixo. Mais nada muda.

const { criarRegistro } = require('./registro');
const { executarAgente, montarMensagens } = require('./agente');
const { auditorDoPedido } = require('./auditoria');
const acoes = require('./acoes');
const IA = require('../services/assistenteOpenAI');
const A = require('../services/assistenteAgenda');

const MODULOS = [
require('./ferramentas/agenda'),
require('./ferramentas/navegacao')];


const registro = criarRegistro();
for (const lista of MODULOS) for (const f of lista) registro.registrar(f);

const NOME_PERFIL = {
  super_admin: 'super administrador', admin: 'administrador', medico: 'médico', dentista: 'dentista', atendente: 'recepção'
};

function promptSistema({ usuario, agora, diaSemana, profissionais, contexto, ferramentas }) {
  const tela = contexto && contexto.tela ? IA.ROTULO_TELA[contexto.tela] || contexto.tela : null;
  return `Você é a assistente do EasyClin, sistema de uma clínica brasileira. Ajuda a equipe por voz ou texto.

Hoje é ${diaSemana}, ${agora.hoje} (AAAA-MM-DD). Agora são ${agora.hora}.
Quem fala com você: ${usuario.nome} (${NOME_PERFIL[usuario.tipo] || usuario.tipo}).${tela ? `\nTela aberta agora: ${tela}.` : ''}
Profissionais desta clínica: ${profissionais.length ? profissionais.join('; ') : '(nenhum cadastrado)'}.

Regras:
- Use SEMPRE as ferramentas para qualquer dado (horários, consultas, pacientes). Nunca invente paciente, profissional, horário ou disponibilidade.
- Para marcar, remarcar ou cancelar, chame a ferramenta de proposta. Ela só prepara: quem confirma é o usuário, na tela. Nunca diga que já marcou ou cancelou.
- Chame a proposta mesmo faltando dados: ela mesma pergunta o que falta.
- Converta datas relativas (hoje, amanhã, quinta, semana que vem, dia 25) para AAAA-MM-DD, sempre no futuro mais próximo. "9 da manhã" = 09:00; "duas da tarde" = 14:00; "meio-dia" = 12:00.
- Use o histórico para completar pedidos curtos ("e na sexta?", "com a outra doutora").
- No campo profissional, prefira o nome exato da lista acima.
- Responda em português do Brasil, em até 2 frases curtas: a resposta será falada em voz alta.
- Se nenhuma ferramenta serve para o pedido, diga em uma frase o que você consegue fazer: ${ferramentas.map((f) => f.nome.replace(/_/g, ' ')).join(', ')}.`;
}

/**
 * Responde a um pedido. `chamarModelo` pode ser trocado (testes).
 * Devolve { pedido, tipo, fala, dados } — o mesmo formato que a tela já usa.
 */
async function responder({ usuario, texto, historico, agora, contexto, ip, chamarModelo = IA.chatComFerramentas }) {
  const profissionais = await A.listarProfissionais(usuario.clinicaId);
  const diaSemana = A.DIAS_SEMANA[new Date(`${agora.hoje}T12:00:00`).getDay()];
  const ferramentas = registro.disponiveis(usuario);
  const sistema = promptSistema({
    usuario,
    agora,
    diaSemana,
    profissionais: profissionais.map((p) => p.nome),
    contexto,
    ferramentas
  });

  const r = await executarAgente({
    mensagens: montarMensagens(sistema, historico, texto),
    ferramentas,
    ctx: { clinicaId: usuario.clinicaId, profissionais, agora, usuario },
    chamarModelo,
    auditar: auditorDoPedido(usuario.clinicaId, usuario, ip),
    falaPadrao: acoes.AJUDA
  });

  const usadas = r.chamadas.filter((c) => c.ok).map((c) => c.nome);
  return {
    pedido: { acao: usadas[usadas.length - 1] || 'conversa', ferramentas: r.chamadas.map((c) => c.nome) },
    ...r.resultado,
    _uso: { ...r.uso, passos: r.passos, chamadas: r.chamadas }
  };
}

module.exports = { registro, responder, promptSistema };
