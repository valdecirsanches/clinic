// ==================== CATÁLOGO DA AJUDA POR TELA ====================
// Fonte ÚNICA dos textos de ajuda: ajudaTelas.json (o front importa o mesmo
// arquivo). O servidor só narra textos deste catálogo — ninguém consegue
// gastar a cota da ElevenLabs mandando texto livre.

const catalogo = require('./ajudaTelas.json');

const porId = new Map(catalogo.topicos.map((t) => [t.id, t]));

function buscarTopico(id) {
  return porId.get(String(id || '')) || null;
}

function terminarFrase(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** Texto falado: título, resumo, passos e dicas, em frases corridas. */
function textoNarracao(topico) {
  if (!topico) return '';
  const partes = [terminarFrase(topico.titulo), terminarFrase(topico.resumo)];
  for (const passo of topico.passos || []) partes.push(terminarFrase(passo));
  const dicas = topico.dicas || [];
  if (dicas.length) partes.push(`Dica: ${dicas.map(terminarFrase).join(' ')}`);
  return partes.filter(Boolean).join(' ');
}

module.exports = { catalogo, buscarTopico, textoNarracao };
