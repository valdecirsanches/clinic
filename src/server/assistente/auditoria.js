// ==================== ASSISTENTE — AUDITORIA ====================
// Tudo o que o assistente consulta ou grava fica no audit_log da clínica,
// com a marca de que veio do assistente (LGPD: quem acessou o quê, quando).
// Falha de auditoria nunca derruba o pedido.

const { getClinicaDB } = require('../databaseClinica');

const ACAO_POR_TIPO = { leitura: 'ASSISTENTE_CONSULTA', proposta: 'ASSISTENTE_PROPOSTA' };

async function registrar(clinicaId, usuario, { acao, entidade = 'assistente', entidadeId = null, pacienteId = null, pacienteNome = null, detalhes = null, ip = '' }) {
  try {
    const db = getClinicaDB(clinicaId);
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await db.execute(
      `INSERT INTO audit_log (id, usuarioId, usuarioNome, usuarioTipo, acao, entidade, entidadeId, pacienteId, pacienteNome, detalhes, ip, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
      id,
      usuario.id,
      usuario.nome || '',
      usuario.tipo || '',
      acao,
      entidade,
      entidadeId,
      pacienteId,
      pacienteNome ? String(pacienteNome).slice(0, 255) : null,
      detalhes ? String(detalhes).slice(0, 4000) : null,
      String(ip || '').slice(0, 50),
      new Date().toISOString()]

    );
  } catch (e) {
    console.warn('🤖 [assistente] Auditoria não gravada:', e.message);
  }
}

/** Auditor usado pelo laço do agente para cada ferramenta executada. */
function auditorDoPedido(clinicaId, usuario, ip) {
  return ({ ferramenta, args }) =>
  registrar(clinicaId, usuario, {
    acao: ACAO_POR_TIPO[ferramenta.tipo] || 'ASSISTENTE_CONSULTA',
    entidade: 'assistente',
    pacienteNome: args && args.paciente || null,
    detalhes: JSON.stringify({ ferramenta: ferramenta.nome, args }),
    ip
  });
}

function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket && req.socket.remoteAddress || '').split(',')[0].trim();
}

module.exports = { registrar, auditorDoPedido, ipDe };
