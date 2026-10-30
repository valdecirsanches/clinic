// ==================== ASSISTENTE — OPENAI ====================
// A chave fica SOMENTE no servidor (OPENAI_API_KEY no server/.env.local).
// O navegador nunca a recebe.
//
// A IA tem dois papéis e nenhum outro:
//   1. transcrever o áudio da recepção (Whisper);
//   2. transformar a frase num pedido estruturado (JSON).
// Quem consulta o banco e decide disponibilidade é o servidor.

const FormData = require('form-data');

const fetchFn = (() => {
  try {
    return require('node-fetch');
  } catch (e) {
    return globalThis.fetch;
  }
})();

const OPENAI_URL = 'https://api.openai.com/v1';
const ACOES = [
'marcar', 'horarios_livres', 'agenda_dia', 'consultas_paciente', 'cancelar', 'abrir_agenda',
'remarcar', 'abrir_paciente', 'novo_paciente', 'abrir_prontuario', 'abrir_tela', 'resumo_dia', 'conversa'];


// Telas que a recepção pode abrir por voz (id → como as pessoas chamam).
const TELAS = {
  dashboard: 'painel, início, tela inicial',
  agenda: 'agenda',
  fila_atendimento: 'fila, fila de chegada, sala de espera, recepção',
  pacientes: 'pacientes, lista de pacientes',
  prontuarios: 'prontuários (lista)',
  mensagens: 'mensagens, WhatsApp, conversas',
  whatsapp_meta: 'WhatsApp oficial',
  cobrancas: 'cobranças, financeiro, parcelas, pagamentos',
  convenios: 'convênios',
  planos_saude: 'planos de saúde',
  empresas_conveniadas: 'empresas conveniadas',
  procedimentos: 'procedimentos, tabela de preços',
  especialidades: 'especialidades',
  medicamentos: 'medicamentos',
  usuarios: 'usuários, equipe, profissionais (cadastro)',
  ponto: 'ponto, frequência, bater ponto',
  auditoria: 'auditoria',
  configuracoes: 'configurações da clínica',
  assinatura: 'minha assinatura, fatura do sistema'
};

function chave() {
  return String(process.env.OPENAI_API_KEY || '').trim();
}

function configurado() {
  return Boolean(chave());
}

function erroOpenAI(status, corpo) {
  const msg = corpo && corpo.error && corpo.error.message || `HTTP ${status}`;
  if (status === 401) return new Error('A chave da OpenAI foi recusada. Confira OPENAI_API_KEY no server/.env.local.');
  if (status === 429) return new Error('Limite ou crédito da OpenAI esgotado. Confira o saldo da conta OpenAI.');
  return new Error(`OpenAI: ${msg}`);
}

async function comTempoLimite(ms, fn) {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), ms);
  try {
    return await fn(controle.signal);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A OpenAI demorou demais para responder. Tente de novo.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const EXTENSOES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a' };

const PROMPT_TRANSCRICAO = {
  agenda: 'Recepção de clínica marcando consultas: paciente, doutora, doutor, horário, segunda, terça, quarta, quinta, sexta.',
  prontuario:
  'Médico ditando prontuário: queixa principal, história da doença atual, anamnese, exame físico, pressão arterial 12 por 8, ' +
  'frequência cardíaca, saturação, temperatura 36,5, glicemia, dispneia, cefaleia, febre, hipertensão, diabetes mellitus, ' +
  'dipirona, losartana, metformina, amoxicilina, CID, evolução, diagnóstico.'
};

async function transcrever(audioBase64, mime, contexto = 'agenda') {
  if (!configurado()) throw new Error('OPENAI_API_KEY não está definida no server/.env.local.');
  const buffer = Buffer.from(String(audioBase64 || ''), 'base64');
  if (buffer.length < 1000) throw new Error('Áudio muito curto. Segure o microfone e fale o pedido.');
  const tipo = String(mime || 'audio/webm').split(';')[0];
  const form = new FormData();
  form.append('file', buffer, { filename: `pedido.${EXTENSOES[tipo] || 'webm'}`, contentType: tipo });
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  form.append('language', 'pt');
  form.append('prompt', PROMPT_TRANSCRICAO[contexto] || PROMPT_TRANSCRICAO.agenda);

  return comTempoLimite(45000, async (signal) => {
    const r = await fetchFn(`${OPENAI_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave()}`, ...form.getHeaders() },
      body: form,
      signal
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) throw erroOpenAI(r.status, corpo);
    return String(corpo && corpo.text || '').trim();
  });
}

function promptSistema({ hoje, hora, diaSemana, profissionais }) {
  return `Você interpreta pedidos da recepção de uma clínica brasileira. Responda SOMENTE com um objeto JSON.

Hoje é ${diaSemana}, ${hoje} (formato AAAA-MM-DD). Agora são ${hora}.
Profissionais desta clínica: ${profissionais.length ? profissionais.join('; ') : '(nenhum cadastrado)'}.

Formato:
{
  "acao": um de ${JSON.stringify(ACOES)},
  "paciente": nome do paciente como foi dito, ou null,
  "profissional": o nome EXATO da lista acima que corresponde ao que foi dito, ou o texto dito se não houver correspondência, ou null,
  "data": "AAAA-MM-DD" ou null,
  "hora": "HH:MM" (24h) ou null,
  "periodo": "manha", "tarde" ou null,
  "motivo": motivo do cancelamento, ou null,
  "tela": para "abrir_tela", um destes ids: ${JSON.stringify(Object.keys(TELAS))}, ou null,
  "resposta": frase curta em português para a recepção (só obrigatória quando acao = "conversa")
}

Telas (id: como chamam): ${Object.entries(TELAS).map(([id, n]) => `${id}: ${n}`).join('; ')}.

Regras:
- "marcar"/"agendar"/"encaixar" consulta → "marcar".
- "remarcar"/"mudar a consulta"/"passar para outro dia/horário"/"adiantar"/"adiar" → "remarcar"; "data"/"hora" são o NOVO horário; "profissional" só se pedirem outro profissional.
- "abrir o cadastro de X", "ficha de X", "dados/telefone/endereço de X", "editar X" → "abrir_paciente".
- "cadastrar paciente novo", "novo paciente", "incluir paciente" → "novo_paciente" (nome em "paciente", se dito).
- "abrir o prontuário/histórico de X", "atender X" → "abrir_prontuario".
- "abrir/ir para/mostrar" uma tela da lista acima → "abrir_tela". Agenda com data ou profissional → "abrir_agenda".
- "como está o dia", "resumo do dia", "quantos confirmados", "como está a agenda de amanhã" → "resumo_dia".
- Perguntas de horário livre / vaga / disponibilidade → "horarios_livres".
- "quem está marcado", "agenda de hoje/amanhã", "quantos pacientes" → "agenda_dia".
- "quando é a consulta do(a) X", "próxima consulta de X" → "consultas_paciente".
- "desmarcar"/"cancelar consulta" → "cancelar".
- "abrir/mostrar a agenda de..." → "abrir_agenda".
- Qualquer outra coisa (saudação, dúvida, pedido fora de agenda) → "conversa", explicando em "resposta" o que você consegue fazer.
- Converta datas relativas (hoje, amanhã, depois de amanhã, quinta, semana que vem, dia 25) para AAAA-MM-DD, sempre no futuro mais próximo.
- "9 da manhã" = "09:00"; "duas da tarde" = "14:00"; "meio-dia" = "12:00".
- Use o histórico para completar pedidos curtos ("e na sexta?", "com a outra doutora").
- Nunca invente paciente, profissional ou horário que não foi dito.`;
}

async function interpretar({ texto, historico, hoje, hora, diaSemana, profissionais }) {
  if (!configurado()) throw new Error('OPENAI_API_KEY não está definida no server/.env.local.');
  const mensagens = [{ role: 'system', content: promptSistema({ hoje, hora, diaSemana, profissionais }) }];
  for (const h of (Array.isArray(historico) ? historico : []).slice(-8)) {
    if (!h || !h.texto) continue;
    mensagens.push({ role: h.autor === 'usuario' ? 'user' : 'assistant', content: String(h.texto).slice(0, 600) });
  }
  mensagens.push({ role: 'user', content: String(texto).slice(0, 1000) });

  const corpo = await comTempoLimite(30000, async (signal) => {
    const r = await fetchFn(`${OPENAI_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: mensagens
      }),
      signal
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw erroOpenAI(r.status, json);
    return json;
  });

  let pedido = {};
  try {
    pedido = JSON.parse(corpo.choices[0].message.content || '{}');
  } catch (e) {
    pedido = {};
  }
  if (!ACOES.includes(pedido.acao)) pedido.acao = 'conversa';
  if (pedido.acao === 'abrir_tela' && !TELAS[pedido.tela]) pedido.acao = 'conversa';
  return pedido;
}

// ==================== PRONTUÁRIO: DITADO E TUTORIAL ====================

const ETAPAS_DITADO = ['anamnese', 'exame_fisico', 'diagnostico', 'evolucao'];
const ETAPAS_NAVEGAVEIS = [
'resumo_atendimento', 'anamnese', 'exame_fisico', 'diagnostico', 'evolucao', 'exames',
'prescricoes', 'relatorios', 'atestado', 'imagens', 'odontograma', 'resumo'];

const CAMPOS_POR_ETAPA = {
  anamnese: ['queixaPrincipal', 'historiaQueixa', 'historicoDoencas', 'alergias', 'medicamentosEmUso', 'historicoFamiliar', 'habitosVida'],
  exame_fisico: ['altura', 'peso', 'pressaoArterial', 'pulso', 'temperatura', 'saturacaoO2', 'frequenciaRespiratoria', 'glicemia', 'observacoesGerais'],
  diagnostico: ['cid', 'observacoes'],
  evolucao: ['evolucaoAtual']
};

// Base do tutorial: a IA responde dúvidas SOMENTE com o que está aqui.
const MANUAL_PRONTUARIO = `
COMO O PRONTUÁRIO FUNCIONA (EasyClin):
- Abas no topo, da esquerda para a direita: Resumo, Anamnese, Exame Físico, Diagnóstico, Evolução, Exames, Prescrições, Relatórios, Atestado, Imagens, Odontograma (dentistas) e Prontuário (histórico completo do paciente).
- Botões antes das abas, quando a clínica habilita: Avaliação e Procedimentos.
- Cronômetro do atendimento no cabeçalho do paciente: iniciar, pausar e encerrar.
- Anamnese, Exame Físico e Diagnóstico salvam sozinhos alguns segundos depois de cada alteração; há também o botão Salvar. O horário do último salvamento aparece no topo da etapa.
- Exame Físico: o IMC é calculado sozinho a partir de altura e peso; pressão, pulso e outros sinais mostram classificação colorida.
- Diagnóstico: busque o CID-10 por código ou nome; o primeiro escolhido é o principal e os demais são secundários.
- Evolução: escreva o texto e clique em Adicionar; cada evolução fica com data e profissional. Evoluções antigas aparecem no painel lateral.
- Prescrições: medicamentos com posologia; dá para usar padrões salvos e a Memed, quando configurada. Imprime e envia ao paciente.
- Exames: solicitação de exames, com padrões salvos; imprime o pedido.
- Relatórios e Atestado: modelos prontos, com CID e quantidade de dias; imprimem com o cabeçalho do profissional.
- Imagens: anexar fotos e arquivos do paciente.
- Procedimentos: cada profissional lança os próprios; bloco de outro profissional é somente leitura.
- Assinatura: ao final, assine o atendimento. Depois de assinado, o prontuário não pode mais ser alterado, nem por ditado. A assinatura pode ser pedida ao paciente por link (WhatsApp) quando o documento exige.
- Perfis administrativos (recepção, administrador) só visualizam o prontuário.

O QUE O ASSISTENTE FAZ NO PRONTUÁRIO:
- Preenche por voz: Anamnese (queixa principal, história da queixa, doenças pregressas, alergias, medicamentos em uso, histórico familiar, hábitos de vida), Exame Físico (altura, peso, pressão, pulso, temperatura, saturação, frequência respiratória, glicemia, observações), Diagnóstico (busca de CID e observações) e Evolução.
- Abre qualquer aba ("abrir prescrições").
- Por padrão ACRESCENTA ao que já está escrito; para trocar o conteúdo, diga "substituir" ou "apagar e escrever".
- No CID, só coloca o termo na busca: quem escolhe o código é o médico.
- Na Evolução, o texto vai para a caixa da nova evolução e o médico clica em Adicionar.
- Nunca assina, imprime, prescreve medicamento ou envia nada ao paciente: essas ações são sempre do médico.
`;

function promptProntuario({ etapaAtual, paciente }) {
  return `Você é a assistente de voz do prontuário eletrônico de uma clínica brasileira, ajudando o médico durante o atendimento. Responda SOMENTE com JSON.

Etapa aberta agora: ${etapaAtual || 'desconhecida'}. Paciente: ${paciente || 'não informado'}.

${MANUAL_PRONTUARIO}

Formato:
{
  "acao": "preencher" | "abrir_etapa" | "ajuda",
  "preenchimentos": [ { "etapa": uma de ${JSON.stringify(ETAPAS_DITADO)}, "valores": { campo: texto } } ],
  "modo": "acrescentar" | "substituir",
  "etapa": para "abrir_etapa", uma de ${JSON.stringify(ETAPAS_NAVEGAVEIS)},
  "resposta": frase curta, gentil e direta em português, para ser FALADA ao médico
}

Campos por etapa: ${JSON.stringify(CAMPOS_POR_ETAPA)}.

Regras de preenchimento:
- Ditado clínico (sintomas, história, sinais vitais, conduta, evolução) → "preencher". Um mesmo ditado pode gerar várias etapas.
- Distribua cada trecho no campo certo. Se o médico não disser o campo e for texto livre, use o campo principal da etapa aberta (anamnese→queixaPrincipal; exame_fisico→observacoesGerais; diagnostico→observacoes; evolucao→evolucaoAtual). Se a etapa aberta não aceitar ditado, use evolucaoAtual.
- Preserve as palavras do médico. Só corrija pontuação, maiúsculas e termos médicos mal transcritos. NUNCA acrescente sintoma, achado, diagnóstico, dose ou conduta que não foi dito.
- Sinais vitais em formato curto: pressaoArterial "120/80" ("12 por 8" = "120/80"); pulso "80"; temperatura "36,5"; saturacaoO2 "97"; frequenciaRespiratoria "16"; glicemia "98"; altura em cm "170"; peso em kg "72,5".
- cid: apenas o termo ou código dito (ex.: "hipertensão" ou "I10"). Nunca escolha código sozinho.
- modo "substituir" só quando o médico pedir para trocar/apagar; senão "acrescentar".
- Pedido para assinar, imprimir, prescrever ou enviar → "ajuda", explicando que essa ação é do médico e onde fica o botão.
- Dúvida de uso ("como faço...", "onde fica...", "o que você faz?", "me ensina") → "ajuda", respondendo com base no manual acima, em até 3 frases. Não invente recursos.
- Em "preencher", "resposta" confirma em poucas palavras o que foi anotado (ex.: "Anotei a queixa e a pressão.").`;
}

async function interpretarProntuario({ texto, historico, etapaAtual, paciente }) {
  if (!configurado()) throw new Error('OPENAI_API_KEY não está definida no server/.env.local.');
  const mensagens = [{ role: 'system', content: promptProntuario({ etapaAtual, paciente }) }];
  for (const h of (Array.isArray(historico) ? historico : []).slice(-6)) {
    if (!h || !h.texto) continue;
    mensagens.push({ role: h.autor === 'usuario' ? 'user' : 'assistant', content: String(h.texto).slice(0, 800) });
  }
  mensagens.push({ role: 'user', content: String(texto).slice(0, 4000) });

  const corpo = await comTempoLimite(40000, async (signal) => {
    const r = await fetchFn(`${OPENAI_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: mensagens
      }),
      signal
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw erroOpenAI(r.status, json);
    return json;
  });

  let p = {};
  try {
    p = JSON.parse(corpo.choices[0].message.content || '{}');
  } catch (e) {
    p = {};
  }
  // Higiene: só etapas e campos conhecidos chegam ao navegador.
  const preenchimentos = (Array.isArray(p.preenchimentos) ? p.preenchimentos : []).
  filter((x) => x && ETAPAS_DITADO.includes(x.etapa) && x.valores && typeof x.valores === 'object').
  map((x) => {
    const valores = {};
    for (const campo of CAMPOS_POR_ETAPA[x.etapa]) {
      const v = x.valores[campo];
      if (v !== undefined && v !== null && String(v).trim()) valores[campo] = String(v).trim().slice(0, 4000);
    }
    return { etapa: x.etapa, valores };
  }).
  filter((x) => Object.keys(x.valores).length);
  let acao = ['preencher', 'abrir_etapa', 'ajuda'].includes(p.acao) ? p.acao : 'ajuda';
  if (acao === 'preencher' && !preenchimentos.length) acao = 'ajuda';
  const etapa = ETAPAS_NAVEGAVEIS.includes(p.etapa) ? p.etapa : null;
  if (acao === 'abrir_etapa' && !etapa) acao = 'ajuda';
  return {
    acao,
    preenchimentos,
    modo: p.modo === 'substituir' ? 'substituir' : 'acrescentar',
    etapa,
    resposta: String(p.resposta || '').trim().slice(0, 600) ||
    'Posso anotar o que você ditar na anamnese, no exame físico, no diagnóstico e na evolução, e abrir qualquer aba.'
  };
}

// ==================== VOZ (feminina, natural) ====================
// gpt-4o-mini-tts aceita instruções de entonação. Se a conta não tiver esse
// modelo, cai para tts-1-hd com a mesma voz feminina.
const VOZ_PADRAO = 'nova';
const INSTRUCOES_VOZ =
'Fale em português do Brasil, com sotaque brasileiro natural. Voz feminina, calorosa, calma e profissional, ' +
'como uma assistente experiente de consultório. Ritmo tranquilo, pronúncia clara de termos médicos e números.';

async function sintetizar(texto, modelo, voz) {
  return comTempoLimite(30000, async (signal) => {
    const corpo = { model: modelo, voice: voz, input: texto, response_format: 'mp3' };
    if (modelo.includes('gpt-4o')) corpo.instructions = INSTRUCOES_VOZ;
    const r = await fetchFn(`${OPENAI_URL}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal
    });
    if (!r.ok) {
      const json = await r.json().catch(() => null);
      const erro = erroOpenAI(r.status, json);
      erro.status = r.status;
      throw erro;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.toString('base64');
  });
}

async function falar(texto) {
  if (!configurado()) throw new Error('OPENAI_API_KEY não está definida no server/.env.local.');
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!limpo) throw new Error('Nada para falar.');
  const voz = String(process.env.OPENAI_TTS_VOICE || VOZ_PADRAO).trim();
  const modelo = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
  try {
    return { audioBase64: await sintetizar(limpo, modelo, voz), mime: 'audio/mpeg' };
  } catch (e) {
    if (e.status === 401 || e.status === 429 || modelo === 'tts-1-hd') throw e;
    return { audioBase64: await sintetizar(limpo, 'tts-1-hd', ['nova', 'shimmer'].includes(voz) ? voz : VOZ_PADRAO), mime: 'audio/mpeg' };
  }
}

const ROTULO_TELA = {
  dashboard: 'Painel', agenda: 'Agenda', fila_atendimento: 'Fila de atendimento', pacientes: 'Pacientes',
  prontuarios: 'Prontuários', mensagens: 'Mensagens', whatsapp_meta: 'WhatsApp Oficial', cobrancas: 'Cobranças',
  convenios: 'Convênios', planos_saude: 'Planos de Saúde', empresas_conveniadas: 'Empresas conveniadas',
  procedimentos: 'Procedimentos', especialidades: 'Especialidades', medicamentos: 'Medicamentos',
  usuarios: 'Usuários', ponto: 'Ponto', auditoria: 'Auditoria', configuracoes: 'Configurações da Clínica',
  assinatura: 'Minha Assinatura'
};

module.exports = { configurado, transcrever, interpretar, interpretarProntuario, falar, ROTULO_TELA };