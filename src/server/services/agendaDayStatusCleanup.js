const { getClinicaDBAsync } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');

function normalizarDataAgenda(value) {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = Number(iso && iso[1] || br && br[3]);
  const month = Number(iso && iso[2] || br && br[2]);
  const day = Number(iso && iso[3] || br && br[1]);
  const candidate = new Date(year, month - 1, day, 12);

  if (
  !Number.isInteger(year) ||
  !Number.isInteger(month) ||
  !Number.isInteger(day) ||
  candidate.getFullYear() !== year ||
  candidate.getMonth() !== month - 1 ||
  candidate.getDate() !== day)
  {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function consultaEhMarcacaoReal(consulta) {
  if (!consulta) return false;

  const pacienteId = String(consulta.pacienteId || '').trim().toLowerCase();
  const status = String(consulta.status || '').trim().toLowerCase();
  const placeholders = new Set(['disponivel', 'livre', 'bloqueado', 'removido']);

  return !placeholders.has(pacienteId) && status !== 'cancelada';
}

async function garantirTabelaDiasStatus(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS agenda_dias_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profissionalId VARCHAR(191) NOT NULL,
    data VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    origem VARCHAR(20) NOT NULL DEFAULT 'legado',
    criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_prof_data (profissionalId, data)
  )`);

  // Registros que já existiam antes desta correção são classificados como
  // legados. Novas ações no calendário são gravadas como "manual" e não entram
  // na limpeza automática.
  try {
    await db.execute(
      "ALTER TABLE agenda_dias_status ADD COLUMN origem VARCHAR(20) NOT NULL DEFAULT 'legado'"
    );
  } catch (error) {
    if (!String(error.message || '').includes('Duplicate column')) throw error;
  }
}

/**
 * Fecha somente aberturas LEGADAS sem marcação real. Fechamentos explícitos,
 * agendas configuradas e novas aberturas manuais são preservados.
 */
async function limparAberturasSemMarcacao(db, clinicaId) {
  await garantirTabelaDiasStatus(db);

  const [statusRows] = await db.execute(
    `SELECT id, profissionalId, data
     FROM agenda_dias_status
     WHERE status = 'aberto' AND (origem IS NULL OR origem = 'legado')`
  );

  let removidos = 0;

  for (const row of statusRows || []) {
    const data = normalizarDataAgenda(row.data);
    let possuiMarcacaoReal = false;

    if (data) {
      const [consultas] = await db.execute(
        `SELECT pacienteId, status
         FROM consultas
         WHERE profissionalId = ? AND SUBSTR(data, 1, 10) = ?`,
        [row.profissionalId, data]
      );
      possuiMarcacaoReal = (consultas || []).some(consultaEhMarcacaoReal);
    }

    if (!possuiMarcacaoReal) {
      await db.execute('DELETE FROM agenda_dias_status WHERE id = ?', [row.id]);
      removidos++;
    }
  }

  if (removidos > 0) {
    console.log(
      `📅 [agenda-status] Clínica ${clinicaId}: ${removidos} abertura(s) sem marcação removida(s)`
    );
  }

  return removidos;
}

async function limparAberturasSemMarcacaoEmTodasClinicas() {
  const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();
  let removidos = 0;

  for (const clinica of clinicas || []) {
    try {
      const db = await getClinicaDBAsync(clinica.id);
      removidos += await limparAberturasSemMarcacao(db, clinica.id);
    } catch (error) {
      console.error(
        `📅 [agenda-status] Falha ao limpar clínica ${clinica.id}:`,
        error.message
      );
    }
  }

  console.log(
    `📅 [agenda-status] Limpeza global concluída: ${removidos} abertura(s) sem marcação removida(s)`
  );
  return removidos;
}

module.exports = {
  limparAberturasSemMarcacao,
  limparAberturasSemMarcacaoEmTodasClinicas
};