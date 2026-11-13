// ==================== VOZ DO SISTEMA (CONFIGURAÇÃO) ====================
// A voz da ElevenLabs escolhida pelo super admin em Configurações Globais
// (cartão "Ajuda por voz"). Usada pela ajuda das telas e pelas respostas
// faladas do assistente. Guardada em configuracoes_globais, chave `ajuda_voz`:
//   { ativo, vozId, vozNome, ajustes: { estabilidade, similaridade, estilo, velocidade } }
// `ativo` liga só a narração da AJUDA; o assistente usa a voz mesmo assim.

const dbGlobal = require('../databaseGlobal');
const elevenLabs = require('../services/elevenLabs');

const CHAVE_CONFIG = 'ajuda_voz';

const PADRAO = Object.freeze({
  ativo: false,
  vozId: '',
  vozNome: '',
  ajustes: elevenLabs.normalizarAjustes({})
});

function normalizarConfig(bruto) {
  const c = bruto && typeof bruto === 'object' ? bruto : {};
  const vozId = elevenLabs.vozValida(c.vozId) ? String(c.vozId) : '';
  return {
    ativo: Boolean(c.ativo) && Boolean(vozId),
    vozId,
    vozNome: String(c.vozNome || '').slice(0, 80),
    ajustes: elevenLabs.normalizarAjustes(c.ajustes)
  };
}

async function lerConfig() {
  try {
    const row = await dbGlobal.
    prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
    get(CHAVE_CONFIG);
    if (!row) return { ...PADRAO };
    let valor = row.valor;
    try {valor = JSON.parse(row.valor);} catch (e) {}
    return normalizarConfig(valor);
  } catch (err) {
    console.error('❌ [ajuda-voz] Erro ao ler configuração:', err.message);
    return { ...PADRAO };
  }
}

async function gravarConfig(config) {
  const valor = JSON.stringify(config);
  const agora = new Date().toISOString();
  const upd = await dbGlobal.
  prepare('UPDATE configuracoes_globais SET valor = ?, atualizadoEm = ? WHERE chave = ?').
  run(valor, agora, CHAVE_CONFIG);
  if (!upd || upd.changes === 0) {
    await dbGlobal.
    prepare('INSERT INTO configuracoes_globais (id, chave, valor, atualizadoEm) VALUES (?, ?, ?, ?)').
    run(`cfg${Date.now()}`, CHAVE_CONFIG, valor, agora);
  }
}

module.exports = { CHAVE_CONFIG, PADRAO, normalizarConfig, lerConfig, gravarConfig };
