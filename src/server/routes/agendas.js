// ==================== ROTAS DE AGENDAS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');

// Chave de data única para a agenda. Dados antigos podem ter sido gravados como
// timestamps ou sem zero à esquerda; a API sempre devolve/persiste YYYY-MM-DD.
function normalizarDataAgenda(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = Number(iso && iso[1] || br && br[3]);
  const month = Number(iso && iso[2] || br && br[2]);
  const day = Number(iso && iso[3] || br && br[1]);
  const candidate = new Date(year, month - 1, day, 12);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
  candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizarDatasEspecificas(datas) {
  if (!Array.isArray(datas)) return null;
  const normalizadas = [...new Set(datas.map(normalizarDataAgenda).filter(Boolean))].sort();
  return normalizadas.length > 0 ? normalizadas : null;
}

// ⭐ Cache: clínicas já reparadas nesta sessão do servidor (evita repetir)
const clinicasReparadas = new Set();
// ⭐ Cache: clínicas já com coluna datasEspecificas migrada
const clinicasMigradas = new Set();

// ⭐ Garante que horarios_trabalho está correta (AUTO_INCREMENT + datasEspecificas)
function garantirTabelaHorarios(db, clinicaId, callback) {
  if (clinicasMigradas.has(clinicaId)) return callback();
  clinicasMigradas.add(clinicaId);

  // ⭐ FIX CRÍTICO: Corrige coluna id que perdeu AUTO_INCREMENT após CONVERT TO CHARSET
  db.run(`ALTER TABLE horarios_trabalho MODIFY COLUMN id INT AUTO_INCREMENT`, (err) => {
    if (err) {
      // Ignora se já está correto ou se há outro problema
      if (!err.message.includes('already') && !err.message.includes('Duplicate')) {
        console.log(`⚠️ [${clinicaId}] horarios_trabalho.id MODIFY:`, err.message);
      }
    } else {
      console.log(`✅ [${clinicaId}] horarios_trabalho.id corrigido para AUTO_INCREMENT`);
    }

    // Adiciona coluna datasEspecificas se não existir
    db.run(`ALTER TABLE horarios_trabalho ADD COLUMN datasEspecificas TEXT`, (err) => {
      if (err && !err.message.includes('Duplicate column')) {
        console.error(`⚠️ [${clinicaId}] Erro ao adicionar datasEspecificas:`, err.message);
      } else if (!err) {
        console.log(`✅ [${clinicaId}] Coluna datasEspecificas adicionada em horarios_trabalho`);
      }

      // Adiciona coluna recorrencia se não existir
      db.run(`ALTER TABLE horarios_trabalho ADD COLUMN recorrencia VARCHAR(20) DEFAULT 'toda_semana'`, (err2) => {
        if (err2 && !err2.message.includes('Duplicate column')) {
          console.error(`⚠️ [${clinicaId}] Erro ao adicionar recorrencia:`, err2.message);
        } else if (!err2) {
          console.log(`✅ [${clinicaId}] Coluna recorrencia adicionada em horarios_trabalho`);
        }

        // Horários avulsos também fazem parte da configuração da agenda e precisam
        // sobreviver ao salvar/recarregar, assim como datas específicas e recorrência.
        db.run(`ALTER TABLE horarios_trabalho ADD COLUMN horariosManuais TEXT`, (err3) => {
          if (err3 && !err3.message.includes('Duplicate column')) {
            console.error(`⚠️ [${clinicaId}] Erro ao adicionar horariosManuais:`, err3.message);
          } else if (!err3) {
            console.log(`✅ [${clinicaId}] Coluna horariosManuais adicionada em horarios_trabalho`);
          }
          callback();
        });
      });
    });
  });
}

// ⭐ AUTO-REPAIR: Corrige profissionalId divergente nas agendas (pós-migração)
// Compara agendas.profissionalNome com usuarios.nome e atualiza o ID se necessário
async function repararProfissionalIds(db, clinicaId, agendas) {
  if (clinicasReparadas.has(clinicaId)) return agendas;
  clinicasReparadas.add(clinicaId);

  try {
    // Busca todos os usuários médicos/dentistas do banco global
    const [usuarios] = await dbGlobal.execute(
      "SELECT id, nome, tipo, clinicaId FROM usuarios WHERE tipo IN ('medico', 'dentista')"
    );
    if (!usuarios || usuarios.length === 0) return agendas;

    let corrigidos = 0;
    for (const agenda of agendas) {
      if (!agenda.profissionalId || !agenda.profissionalNome) continue;

      // Verifica se o profissionalId atual corresponde a um usuário existente
      const usuarioById = usuarios.find((u) => String(u.id) === String(agenda.profissionalId));
      if (usuarioById) continue; // ID já está correto

      // ID não encontrado — tenta encontrar por nome (case-insensitive)
      const nomeAgenda = (agenda.profissionalNome || '').trim().toUpperCase();
      const usuarioByNome = usuarios.find((u) =>
      u.nome && u.nome.trim().toUpperCase() === nomeAgenda
      );

      if (usuarioByNome) {
        const oldId = agenda.profissionalId;
        const newId = usuarioByNome.id;
        console.log(`🔧 [AUTO-REPAIR] Corrigindo profissionalId da agenda "${agenda.profissionalNome}": "${oldId}" → "${newId}"`);

        // Atualiza a agenda
        db.run('UPDATE agendas SET profissionalId = ? WHERE id = ?', [newId, agenda.id]);

        // Atualiza consultas que usam o ID antigo
        db.run('UPDATE consultas SET profissionalId = ? WHERE profissionalId = ?', [newId, oldId]);

        // Atualiza agenda_dias_status se existir
        db.run('UPDATE agenda_dias_status SET profissionalId = ? WHERE profissionalId = ?', [newId, oldId], (err) => {
















          // Ignora erro se tabela não existir
        }); // Atualiza o objeto em memória para retornar já corrigido
        agenda.profissionalId = newId;corrigidos++;}}if (corrigidos > 0) {console.log(`✅ [AUTO-REPAIR] ${corrigidos} agenda(s) corrigida(s) na clínica ${clinicaId}`);}} catch (err) {console.error('⚠️ [AUTO-REPAIR] Erro ao reparar profissionalIds:', err.message);}return agendas;}
// GET /api/agendas?clinicaId=c1 - Lista agendas de uma clínica
router.get('/', (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  garantirTabelaHorarios(db, clinicaId, () => {
    db.all('SELECT * FROM agendas', [], (err, agendas) => {
      if (err) {
        console.error('❌ Erro ao buscar agendas:', err);
        return res.status(500).json({ error: err.message });
      }

      if (agendas.length === 0) {
        return res.json([]);
      }

      const agendasComHorarios = [];
      let processadas = 0;

      agendas.forEach((agenda) => {
        db.all(
          'SELECT * FROM horarios_trabalho WHERE agendaId = ? ORDER BY diaSemana',
          [agenda.id],
          (err, horarios) => {
            if (err) {
              console.error(`❌ Erro ao buscar horários da agenda ${agenda.id}:`, err.message);
              horarios = [];
            }

            // Reconstrói os campos JSON da configuração para o formato usado pela interface.
            const horariosComDatas = (horarios || []).map((h) => {
              let datasEspecificas = null;
              let horariosManuais = null;
              if (h.datasEspecificas) {
                try {
                  datasEspecificas = JSON.parse(h.datasEspecificas);
                } catch (e) {
                  datasEspecificas = null;
                }
              }
              if (h.horariosManuais) {
                try {
                  horariosManuais = JSON.parse(h.horariosManuais);
                } catch (e) {
                  horariosManuais = null;
                }
              }
              return {
                ...h,
                datasEspecificas: normalizarDatasEspecificas(datasEspecificas),
                horariosManuais,
                recorrencia: h.recorrencia || 'toda_semana'
              };
            });

            agendasComHorarios.push({
              ...agenda,
              ativo: Boolean(agenda.ativo),
              horarios: horariosComDatas
            });

            processadas++;

            if (processadas === agendas.length) {
              // ⭐ AUTO-REPAIR: Corrige IDs divergentes antes de retornar
              repararProfissionalIds(db, clinicaId, agendasComHorarios).
              then((agendasCorrigidas) => res.json(agendasCorrigidas)).
              catch(() => res.json(agendasComHorarios));
            }
          }
        );
      });
    });
  });
});

// POST /api/agendas - Cria nova agenda
router.post('/', (req, res) => {
  const { profissionalId, profissionalNome, especialidade, clinicaId, ativo, horarios } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!profissionalId) return res.status(400).json({ error: 'profissionalId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const id = `ag${Date.now()}`;
  const criadoEm = new Date().toISOString().split('T')[0];

  garantirTabelaHorarios(db, clinicaId, () => {
    db.run(
      `INSERT INTO agendas (id, profissionalId, profissionalNome, especialidade, ativo, criadoEm) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, profissionalId, profissionalNome, especialidade, ativo ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar agenda:', err);
          return res.status(500).json({ error: err.message });
        }

        if (horarios && horarios.length > 0) {
          let inseridos = 0;
          let erros = 0;

          horarios.forEach((h) => {
            const datasEspecificas = normalizarDatasEspecificas(h.datasEspecificas);
            const datasEspecificasJson = datasEspecificas ? JSON.stringify(datasEspecificas) : null;
            const horariosManuaisJson = h.horariosManuais && h.horariosManuais.length > 0 ?
            JSON.stringify(h.horariosManuais) : null;
            const recorrencia = h.recorrencia || 'toda_semana';

            db.run(
              `INSERT INTO horarios_trabalho (agendaId, diaSemana, horaInicio, horaFim, intervaloInicio, intervaloFim, duracaoConsultaPadrao, datasEspecificas, horariosManuais, recorrencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, h.diaSemana, h.horaInicio, h.horaFim, h.intervaloInicio || null, h.intervaloFim || null, h.duracaoConsultaPadrao || 30, datasEspecificasJson, horariosManuaisJson, recorrencia],
              (err) => {
                if (err) {
                  console.error(`❌ Erro ao inserir horário dia ${h.diaSemana}:`, err.message);
                  erros++;
                } else {
                  inseridos++;
                }

                if (inseridos + erros === horarios.length) {
                  console.log(`✅ Agenda criada: ${id} — ${inseridos} horários inseridos, ${erros} erros`);
                  res.json({ id, profissionalId, profissionalNome, especialidade, clinicaId, ativo, horarios, criadoEm, horariosInseridos: inseridos, erros });
                }
              }
            );
          });
        } else {
          res.json({ id, profissionalId, profissionalNome, especialidade, clinicaId, ativo, horarios: [], criadoEm, horariosInseridos: 0 });
        }
      }
    );
  });
});

// ==================== ROTAS DE DIAS ABERTOS/FECHADOS ====================
// ⚠️ IMPORTANTE: Estas rotas DEVEM ficar ANTES das rotas /:id

// Cache para saber se tabela já foi criada
let tabelaDiasStatusCriada = {};

function garantirTabelaDiasStatus(db, clinicaId, callback) {
  if (tabelaDiasStatusCriada[clinicaId]) return callback();

  db.run(`CREATE TABLE IF NOT EXISTS agenda_dias_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profissionalId VARCHAR(191) NOT NULL,
    data VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    origem VARCHAR(20) NOT NULL DEFAULT 'legado',
    criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_prof_data (profissionalId, data)
  )`, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('📅 [dias-status] Erro ao criar tabela:', err.message);
    }
    // Bancos já existentes recebem a coluna com origem legada. O erro de coluna
    // duplicada é esperado nas clínicas já migradas.
    db.run(
      "ALTER TABLE agenda_dias_status ADD COLUMN origem VARCHAR(20) NOT NULL DEFAULT 'legado'",
      (columnErr) => {
        if (columnErr && !columnErr.message.includes('Duplicate column')) {
          console.error('📅 [dias-status] Erro ao adicionar origem:', columnErr.message);
        }
        tabelaDiasStatusCriada[clinicaId] = true;
        callback();
      }
    );
  });
}

// GET /api/agendas/dias-abertos?clinicaId=c1&profissionalId=p1
router.get('/dias-abertos', async (req, res) => {
  const { clinicaId, profissionalId } = req.query;
  if (!clinicaId || !profissionalId) {
    return res.status(400).json({ error: 'clinicaId e profissionalId são obrigatórios' });
  }
  const db = getClinicaDB(clinicaId);

  // ⚠️ NÃO apagar aberturas aqui. Liberar o dia é o passo ANTERIOR a marcar
  // alguém: excluir aberturas "sem paciente" destruía a decisão do usuário e o
  // cadeado voltava. Além disso, uma leitura (GET) não deve alterar dados.
  garantirTabelaDiasStatus(db, clinicaId, () => {
    db.all(
      // A última decisão do usuário precisa prevalecer também durante a leitura
      // de registros legados que normalizam para a mesma data.
      'SELECT data, status FROM agenda_dias_status WHERE profissionalId = ? ORDER BY criadoEm ASC, id ASC',
      [profissionalId],
      (err, rows) => {
        if (err) {
          console.error('📅 [dias-abertos GET] Erro:', err.message);
          return res.status(500).json({ error: err.message });
        }
        // Bancos antigos podem guardar a mesma data como 2026-8-13,
        // 13/08/2026 ou timestamp. Depois de normalizar, devolvemos somente o
        // último status de cada dia para que um registro velho não volte a fechar
        // uma data fixa válida no calendário.
        const statusPorData = new Map();
        (rows || []).forEach((row) => {
          const data = normalizarDataAgenda(row.data);
          if (data) statusPorData.set(data, { ...row, data });
        });
        const rowsNormalizados = Array.from(statusPorData.values());
        console.log(`📅 [dias-abertos] GET prof=${profissionalId} → ${rowsNormalizados.length} registros normalizados`);
        res.json(rowsNormalizados);
      }
    );
  });
});

// POST /api/agendas/dias-abertos - Registra abertura ou fechamento explícito de um dia.
// A ausência de registro deixa a data seguir a grade regular do profissional.
router.post('/dias-abertos', (req, res) => {
  const { clinicaId, profissionalId, data, status } = req.body;
  const dataNormalizada = normalizarDataAgenda(data);
  if (!clinicaId || !profissionalId || !dataNormalizada || !status) {
    return res.status(400).json({ error: 'clinicaId, profissionalId, data válida e status são obrigatórios' });
  }
  const db = getClinicaDB(clinicaId);

  console.log(`📅 [dias-abertos] POST prof=${profissionalId} data=${dataNormalizada} status=${status}`);

  garantirTabelaDiasStatus(db, clinicaId, () => {
    // Remove todas as variações legadas desta mesma data antes de gravar a
    // decisão atual. A chave única não protege dados que foram inseridos antes
    // da normalização (por exemplo, 2026-8-13 e 13/08/2026), e esses duplicados
    // faziam um "fechado" antigo disputar com uma abertura mais recente.
    db.all(
      'SELECT id, data FROM agenda_dias_status WHERE profissionalId = ?',
      [profissionalId],
      (selectErr, rows) => {
        if (selectErr) {
          console.error('📅 [dias-abertos] Erro ao localizar status legados:', selectErr.message);
          return res.status(500).json({ error: selectErr.message });
        }
        const idsLegados = (rows || []).
        filter((row) => normalizarDataAgenda(row.data) === dataNormalizada).
        map((row) => row.id);
        const apagarLegados = (callback) => {
          if (idsLegados.length === 0) return callback();
          const placeholders = idsLegados.map(() => '?').join(', ');
          db.run(
            `DELETE FROM agenda_dias_status WHERE id IN (${placeholders})`,
            idsLegados,
            callback
          );
        };

        apagarLegados((deleteErr) => {
          if (deleteErr) {
            console.error('📅 [dias-abertos] Erro ao limpar status legados:', deleteErr.message);
            return res.status(500).json({ error: deleteErr.message });
          }
          if (status === 'normal') {
            console.log(`📅 [dias-abertos] ✅ Removido (normal) prof=${profissionalId} data=${dataNormalizada}`);
            return res.json({ success: true, action: 'removed' });
          }
          db.run(
            `INSERT INTO agenda_dias_status (profissionalId, data, status, origem) VALUES (?, ?, ?, 'manual')`,
            [profissionalId, dataNormalizada, status],
            function (err) {
              if (err) {
                console.error('📅 [dias-abertos] Erro INSERT:', err.message);
                return res.status(500).json({ error: err.message });
              }
              console.log(`📅 [dias-abertos] ✅ Salvo prof=${profissionalId} data=${dataNormalizada} status=${status}`);
              res.json({ success: true, action: status });
            }
          );
        });
      }
    );
  });
});

// ==================== ROTAS COM :id ====================

// PUT /api/agendas/:id - Atualiza agenda
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { profissionalId, profissionalNome, especialidade, ativo, horarios, clinicaId } = req.body;

  console.log(`\n📝 ========== ATUALIZANDO AGENDA ${id} ==========`);
  console.log('   - profissionalId:', profissionalId);
  console.log('   - profissionalNome:', profissionalNome);
  console.log('   - especialidade:', especialidade);
  console.log('   - ativo:', ativo);
  console.log('   - clinicaId:', clinicaId);
  console.log('   - horarios:', JSON.stringify(horarios, null, 2));

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  garantirTabelaHorarios(db, clinicaId, () => {
    db.run(
      // Quando a atualização não informa `ativo` (como em edições de horários),
      // preserva o estado já salvo. Fechar a agenda só pode acontecer pelo toggle explícito.
      `UPDATE agendas
       SET profissionalId = ?, profissionalNome = ?, especialidade = ?,
           ativo = COALESCE(?, ativo)
       WHERE id = ?`,
      [
      profissionalId,
      profissionalNome,
      especialidade,
      ativo === undefined || ativo === null ? null : ativo ? 1 : 0,
      id],

      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar agenda:', err.message);
          return res.status(500).json({ error: err.message });
        }

        console.log(`   ✅ Agenda atualizada, deletando horários antigos...`);

        db.run(`DELETE FROM horarios_trabalho WHERE agendaId = ?`, [id], function (err) {
          if (err) {
            console.error('❌ Erro ao deletar horários antigos:', err.message);
            return res.status(500).json({ error: err.message });
          }

          console.log(`   ✅ Horários antigos deletados, inserindo ${horarios?.length || 0} novos...`);

          if (horarios && horarios.length > 0) {
            let inseridos = 0;
            let erros = 0;

            horarios.forEach((h, index) => {
              const datasEspecificas = normalizarDatasEspecificas(h.datasEspecificas);
              const datasEspecificasJson = datasEspecificas ? JSON.stringify(datasEspecificas) : null;
              const horariosManuaisJson = h.horariosManuais && h.horariosManuais.length > 0 ?
              JSON.stringify(h.horariosManuais) : null;
              const recorrencia = h.recorrencia || 'toda_semana';

              db.run(
                `INSERT INTO horarios_trabalho (agendaId, diaSemana, horaInicio, horaFim, intervaloInicio, intervaloFim, duracaoConsultaPadrao, datasEspecificas, horariosManuais, recorrencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, h.diaSemana, h.horaInicio, h.horaFim, h.intervaloInicio || null, h.intervaloFim || null, h.duracaoConsultaPadrao || 30, datasEspecificasJson, horariosManuaisJson, recorrencia],
                (err) => {
                  if (err) {
                    console.error(`   ❌ Erro ao inserir horário [${index}] dia ${h.diaSemana}:`, err.message);
                    erros++;
                  } else {
                    console.log(`   ✅ Horário [${index}] dia ${h.diaSemana} inserido: ${h.horaInicio}-${h.horaFim}`);
                    inseridos++;
                  }

                  if (inseridos + erros === horarios.length) {
                    console.log(`📝 ========== RESULTADO: ${inseridos} inseridos, ${erros} erros ==========\n`);
                    if (erros > 0) {
                      return res.status(500).json({ error: `${erros} horário(s) falharam ao salvar`, inseridos, erros });
                    }
                    res.json({ success: true, horariosInseridos: inseridos });
                  }
                }
              );
            });
          } else {
            console.log(`📝 ========== RESULTADO: Nenhum horário para inserir ==========\n`);
            res.json({ success: true, horariosInseridos: 0 });
          }
        });
      }
    );
  });
});

// ⭐ NOVO: PATCH /api/agendas/:id/toggle - Abre/Fecha agenda
// Só permite fechar se não houver consultas futuras agendadas
router.patch('/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { clinicaId, ativo } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  if (!ativo) {
    db.get('SELECT profissionalId, profissionalNome FROM agendas WHERE id = ?', [id], (err, agenda) => {
      if (err || !agenda) return res.status(404).json({ error: 'Agenda não encontrada' });

      const hoje = new Date().toISOString().split('T')[0];
      db.get(
        `SELECT COUNT(*) as total FROM consultas 
         WHERE profissionalId = ? AND SUBSTR(data, 1, 10) >= ? 
         AND status NOT IN ('cancelada', 'realizada') AND pacienteId != 'disponivel'`,
        [agenda.profissionalId, hoje],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });

          if (result && result.total > 0) {
            return res.status(409).json({
              error: `Não é possível fechar a agenda. Existem ${result.total} consulta(s) futura(s) agendada(s) para ${agenda.profissionalNome}. Cancele ou remarque antes de fechar.`,
              consultasFuturas: result.total
            });
          }

          db.run('UPDATE agendas SET ativo = 0 WHERE id = ?', [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, ativo: false });
          });
        }
      );
    });
  } else {
    db.run('UPDATE agendas SET ativo = 1 WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, ativo: true });
    });
  }
});

// DELETE /api/agendas/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  db.run(`DELETE FROM horarios_trabalho WHERE agendaId = ?`, [id], function (err) {
    db.run(`DELETE FROM agendas WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

module.exports = router;