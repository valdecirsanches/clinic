// ============ REGISTRO DOS ENVIOS DO WHATSAPP OFICIAL (META) ============
//
// ⭐ POR QUE ISTO EXISTE
// Identificar o paciente pelo TELEFONE da resposta é inconsistente por dois
// motivos reais do dia a dia da clínica:
//   1) o mesmo número pertence a várias pessoas (mãe e filhos, casal, empresa);
//   2) a mensagem pode ter sido enviada para o número de um terceiro (parente,
//      acompanhante), e aí o telefone que responde não é o do cadastro.
// Além disso a Meta devolve o número em formatos variados (com/sem o nono
// dígito), o que já fazia a busca falhar.
//
// A identificação correta é pelo CONTEXTO DO ENVIO: quando a clínica manda o
// pedido de confirmação, a Meta devolve o id da mensagem (wamid). A resposta do
// paciente vem com `context.id` = esse mesmo wamid. Guardando o wamid junto do
// paciente e da consulta, a resposta é atribuída ao registro EXATO que a
// originou — sem adivinhar por telefone.
//
// Persistido no banco da clínica (não em memória) para sobreviver a restart:
// o paciente pode responder horas ou dias depois do envio.

const { getClinicaDB } = require('../databaseClinica');

const TABELA = 'mensagens_meta_enviadas';

// Janela em que uma resposta sem `context.id` ainda pode ser atribuída ao
// último envio feito para aquele número. Depois disso, atribuir seria chute.
const JANELA_ULTIMO_ENVIO_MS = 15 * 24 * 60 * 60 * 1000;

async function garantirTabela(db) {
  await new Promise((r) =>
  db.run(
    `CREATE TABLE IF NOT EXISTS ${TABELA} (
        wamid VARCHAR(191) PRIMARY KEY,
        consultaId VARCHAR(191),
        pacienteId VARCHAR(191),
        pacienteNome VARCHAR(255),
        telefone VARCHAR(30),
        telefoneChave VARCHAR(20),
        tipo VARCHAR(50),
        criadoEm VARCHAR(50)
      )`,
    () => r()
  )
  );
}

// Chave estável do telefone: os 8 últimos dígitos ignoram DDI, DDD e o nono
// dígito — as três variações que a Meta mistura nas respostas.
function chaveTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(-8) : '';
}

/**
 * Registra um envio para que a RESPOSTA seja atribuída ao paciente e à consulta
 * certos. Chamado após cada envio bem-sucedido; nunca deve derrubar o envio.
 */
async function registrarEnvioMeta(
clinicaId,
{ wamid, consultaId, pacienteId, pacienteNome, telefone, tipo } = {})
{
  if (!clinicaId || !wamid) return;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabela(db);
    await new Promise((r) =>
    db.run(
      `INSERT INTO ${TABELA}
           (wamid, consultaId, pacienteId, pacienteNome, telefone, telefoneChave, tipo, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           consultaId = VALUES(consultaId),
           pacienteId = VALUES(pacienteId),
           pacienteNome = VALUES(pacienteNome),
           telefone = VALUES(telefone),
           telefoneChave = VALUES(telefoneChave),
           tipo = VALUES(tipo),
           criadoEm = VALUES(criadoEm)`,
      [
      String(wamid),
      consultaId ? String(consultaId) : null,
      pacienteId ? String(pacienteId) : null,
      pacienteNome ? String(pacienteNome) : null,
      telefone ? String(telefone) : null,
      chaveTelefone(telefone),
      tipo ? String(tipo) : null,
      new Date().toISOString()],

      () => r()
    )
    );
  } catch (e) {
    console.log(`🟢 [META] Não foi possível registrar o envio (${wamid}): ${e.message}`);
  }
}

/** Identificação EXATA: a resposta cita o wamid da mensagem que a originou. */
async function buscarEnvioPorWamid(clinicaId, wamid) {
  if (!clinicaId || !wamid) return null;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabela(db);
    return await new Promise((resolve) =>
    db.get(
      `SELECT * FROM ${TABELA} WHERE wamid = ? LIMIT 1`,
      [String(wamid)],
      (err, row) => resolve(err ? null : row || null)
    )
    );
  } catch (e) {
    return null;
  }
}

/**
 * Segunda melhor identificação: o último envio feito para aquele número dentro
 * de uma janela recente. Cobre o caso do paciente que digita "confirmo" em vez
 * de clicar no botão (a Meta não manda `context.id` em texto livre).
 */
async function buscarUltimoEnvioPorTelefone(clinicaId, telefone) {
  const chave = chaveTelefone(telefone);
  if (!clinicaId || !chave) return null;
  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabela(db);
    const limite = new Date(Date.now() - JANELA_ULTIMO_ENVIO_MS).toISOString();
    return await new Promise((resolve) =>
    db.get(
      `SELECT * FROM ${TABELA}
          WHERE telefoneChave = ? AND criadoEm >= ?
          ORDER BY criadoEm DESC LIMIT 1`,
      [chave, limite],
      (err, row) => resolve(err ? null : row || null)
    )
    );
  } catch (e) {
    return null;
  }
}

module.exports = {
  registrarEnvioMeta,
  buscarEnvioPorWamid,
  buscarUltimoEnvioPorTelefone,
  chaveTelefone
};