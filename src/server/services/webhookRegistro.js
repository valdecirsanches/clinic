'use strict';
/**
 * Registro compartilhado dos webhooks do WhatsApp recebidos (tabela no banco
 * global), para o "Diagnóstico do webhook" funcionar com a API em vários
 * processos (PM2 cluster) ou servidores: a memória de um processo não vê o que
 * chegou no outro. Cada linha diz qual instância (máquina:pid) e qual versão
 * recebeu o evento.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const MAX_LINHAS = 300;

function versaoDoApp() {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'historicoVersoes.json'), 'utf8'));
    return String((h.versoes && h.versoes[0] && h.versoes[0].versao) || '');
  } catch (e) {
    return '';
  }
}

const INSTANCIA = `${os.hostname()}:${process.pid}`;
const VERSAO = versaoDoApp();

let tabelaPronta = null;
function db() {
  return require('../databaseGlobal');
}
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = db().prepare(`CREATE TABLE IF NOT EXISTS whatsapp_webhook_recebidos (
      id VARCHAR(64) PRIMARY KEY,
      sessao VARCHAR(120),
      evento VARCHAR(80),
      de VARCHAR(120),
      diagnostico VARCHAR(64),
      instancia VARCHAR(160),
      versao VARCHAR(20),
      recebidoEm VARCHAR(40)
    )`).run().catch((e) => {
      tabelaPronta = null;
      throw e;
    });
  }
  return tabelaPronta;
}

let contador = 0;
/** grava um webhook recebido (nunca lança: o webhook não pode falhar por isso) */
async function registrar({ sessao, evento, de, diagnostico }) {
  try {
    await garantirTabela();
    const agora = new Date().toISOString();
    await db().prepare('INSERT INTO whatsapp_webhook_recebidos (id, sessao, evento, de, diagnostico, instancia, versao, recebidoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`${Date.now()}-${process.pid}-${contador++}`, String(sessao || '').slice(0, 120), String(evento || '').slice(0, 80),
        String(de || '').slice(0, 120), diagnostico ? String(diagnostico).slice(0, 64) : null, INSTANCIA, VERSAO, agora);
    if (contador % 50 === 0) {
      // mantém só as últimas linhas
      const velha = await db().prepare(`SELECT recebidoEm FROM whatsapp_webhook_recebidos ORDER BY recebidoEm DESC LIMIT 1 OFFSET ${MAX_LINHAS}`).get();
      if (velha) await db().prepare('DELETE FROM whatsapp_webhook_recebidos WHERE recebidoEm <= ?').run(velha.recebidoEm);
    }
  } catch (e) {
    console.log(`📩 [webhook-registro] não gravou: ${e.message}`);
  }
}

async function buscarDiagnostico(marca) {
  try {
    await garantirTabela();
    return (await db().prepare('SELECT * FROM whatsapp_webhook_recebidos WHERE diagnostico = ? LIMIT 1').get(marca)) || null;
  } catch (e) {
    return null;
  }
}

async function ultimosDaSessao(sessao, limite = 20) {
  try {
    await garantirTabela();
    return await db().prepare(`SELECT * FROM whatsapp_webhook_recebidos WHERE sessao = ? AND diagnostico IS NULL ORDER BY recebidoEm DESC LIMIT ${Number(limite) || 20}`).all(sessao);
  } catch (e) {
    return [];
  }
}

module.exports = { INSTANCIA, VERSAO, registrar, buscarDiagnostico, ultimosDaSessao };
