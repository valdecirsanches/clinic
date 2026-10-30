// ==================== ROTAS DE MENSAGENS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Função para garantir que a tabela mensagens existe
async function garantirTabelaMensagens(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS mensagens (
        id VARCHAR(191) PRIMARY KEY,
        clinicaId VARCHAR(191) NOT NULL,
        chatId VARCHAR(191),
        consultaId VARCHAR(191),
        pacienteId VARCHAR(191) NOT NULL,
        pacienteNome VARCHAR(255),
        tipo VARCHAR(50) NOT NULL,
        conteudo LONGTEXT NOT NULL,
        dataHora VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'enviada',
        erro TEXT,
        criadoEm VARCHAR(50) NOT NULL,
        INDEX idx_mensagens_clinica (clinicaId),
        INDEX idx_mensagens_paciente (pacienteId)
      )
    `, (err) => {
      if (err) {
        console.error('❌ [garantirTabelaMensagens] Erro:', err.message);
      } else {
        console.log('✅ [garantirTabelaMensagens] Tabela mensagens OK');
      }
      // ⭐⭐⭐ FIX v10.0: Migração - adiciona colunas se não existirem ⭐⭐⭐
      db.run(`ALTER TABLE mensagens ADD COLUMN chatId TEXT`, () => {
        // ⭐⭐⭐ FIX v18.0: Migração - adiciona coluna consultaId ⭐⭐⭐
        db.run(`ALTER TABLE mensagens ADD COLUMN consultaId TEXT`, () => {
          resolve(null);
        });
      });
    });
  });
}

// Teto de mensagens devolvidas por requisição. Quem não informa `limit` recebe
// as mais recentes — nunca o histórico inteiro da clínica.
const LIMITE_PADRAO = 300;
const LIMITE_MAXIMO = 500;

// GET /api/mensagens - Lista mensagens de uma clínica/paciente
router.get('/', async (req, res) => {
  const { clinicaId, pacienteId, limit } = req.query;

  console.log(`💬 GET /api/mensagens - clinicaId: ${clinicaId}, pacienteId: ${pacienteId}`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    // Garante que a tabela existe
    await garantirTabelaMensagens(db);

    let query = 'SELECT * FROM mensagens WHERE clinicaId = ?';
    let params = [clinicaId];

    if (pacienteId) {
      query += ' AND pacienteId = ?';
      params.push(pacienteId);
    }

    // SEMPRE devolve as MAIS RECENTES com teto. Sem limite, uma clínica com
    // histórico grande baixava a tabela inteira (LONGTEXT de cada mensagem) e
    // travava o navegador. A ordem de saída continua crescente, como antes.
    const limiteNum = Number.parseInt(limit, 10);
    const limiteFinal = Number.isFinite(limiteNum) && limiteNum > 0 ?
    Math.min(limiteNum, LIMITE_MAXIMO) :
    LIMITE_PADRAO;
    query += ` ORDER BY dataHora DESC LIMIT ${limiteFinal}`;

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar mensagens:', err);
        return res.status(500).json({ error: err.message });
      }

      const lista = rows || [];
      lista.reverse();
      console.log(`✅ Retornando ${lista.length} mensagens`);
      res.json(lista);
    });

  } catch (err) {
    console.error('❌ Erro ao listar mensagens:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mensagens - Salva uma mensagem no histórico
router.post('/', async (req, res) => {
  const { clinicaId, chatId, consultaId, pacienteId, pacienteNome, tipo, conteudo, status, erro } = req.body;

  console.log(`💬 POST /api/mensagens ==================== INÍCIO ====================`);
  console.log(`💬 POST /api/mensagens - Dados recebidos:`);
  console.log(`   - clinicaId: "${clinicaId}" (tipo: ${typeof clinicaId})`);
  console.log(`   - chatId: "${chatId}" (tipo: ${typeof chatId})`);
  console.log(`   - consultaId: "${consultaId || '(não informado)'}"`);
  console.log(`   - pacienteId: "${pacienteId}" (tipo: ${typeof pacienteId})`);
  console.log(`   - pacienteNome: "${pacienteNome}"`);
  console.log(`   - tipo: "${tipo}"`);
  console.log(`   - conteudo: "${conteudo ? conteudo.substring(0, 50) + '...' : 'VAZIO'}"`);
  console.log(`   - status: "${status}"`);

  if (!clinicaId || !pacienteId || !tipo || !conteudo) {
    console.error('❌ POST /api/mensagens - Dados obrigatórios faltando!');
    console.error('   - clinicaId presente:', !!clinicaId);
    console.error('   - pacienteId presente:', !!pacienteId);
    console.error('   - tipo presente:', !!tipo);
    console.error('   - conteudo presente:', !!conteudo);
    return res.status(400).json({ error: 'Dados obrigatórios faltando (clinicaId, pacienteId, tipo, conteudo)' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    // Garante que a tabela existe
    await garantirTabelaMensagens(db);

    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const dataHora = new Date().toISOString();

    console.log(`💬 POST /api/mensagens - Inserindo mensagem com ID: ${id}`);

    db.run(
      `INSERT INTO mensagens (id, clinicaId, chatId, consultaId, pacienteId, pacienteNome, tipo, conteudo, dataHora, status, erro, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, clinicaId, chatId || null, consultaId || null, pacienteId, pacienteNome || null, tipo, conteudo, dataHora, status || 'enviada', erro || null, dataHora],
      function (err) {
        if (err) {
          console.error('❌ Erro ao salvar mensagem:', err);
          console.log(`💬 POST /api/mensagens ==================== FIM (ERRO) ====================`);
          return res.status(500).json({ error: err.message });
        }

        console.log(`✅ Mensagem salva com sucesso!`);
        console.log(`   - ID: ${id}`);
        console.log(`   - chatId: ${chatId || '(sem chatId)'}`);
        console.log(`   - consultaId: ${consultaId || '(sem consultaId)'}`);
        console.log(`   - Linhas afetadas: ${this.changes}`);
        console.log(`💬 POST /api/mensagens ==================== FIM (SUCESSO) ====================`);

        res.json({ id, clinicaId, chatId, consultaId, pacienteId, pacienteNome, tipo, conteudo, dataHora, status: status || 'enviada', erro, criadoEm: dataHora });
      }
    );

  } catch (err) {
    console.error('❌ Erro ao salvar mensagem:', err);
    console.log(`💬 POST /api/mensagens ==================== FIM (ERRO) ====================`);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mensagens/:id - Atualiza status de uma mensagem
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, status, erro } = req.body;

  console.log(`💬 PUT /api/mensagens/${id} - clinicaId: ${clinicaId}, status: ${status}`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.run(
      `UPDATE mensagens SET status = ?, erro = ? WHERE id = ?`,
      [status, erro || null, id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar mensagem:', err);
          return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Mensagem não encontrada' });
        }

        console.log(`✅ Mensagem atualizada: ${id}`);
        res.json({ success: true });
      }
    );

  } catch (err) {
    console.error('❌ Erro ao atualizar mensagem:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mensagens/migrar-paciente - Migra mensagens de um pacienteId para outro
router.put('/migrar-paciente', async (req, res) => {
  const { clinicaId, pacienteIdAntigo, pacienteIdNovo, pacienteNomeNovo } = req.body;

  console.log(`💬 PUT /api/mensagens/migrar-paciente`);
  console.log(`   - clinicaId: ${clinicaId}`);
  console.log(`   - pacienteIdAntigo: ${pacienteIdAntigo}`);
  console.log(`   - pacienteIdNovo: ${pacienteIdNovo}`);
  console.log(`   - pacienteNomeNovo: ${pacienteNomeNovo}`);

  if (!clinicaId || !pacienteIdAntigo || !pacienteIdNovo) {
    return res.status(400).json({ error: 'clinicaId, pacienteIdAntigo e pacienteIdNovo são obrigatórios' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    // Garante que a tabela existe
    await garantirTabelaMensagens(db);

    // Primeiro, conta quantas mensagens serão migradas
    db.get(
      'SELECT COUNT(*) as total FROM mensagens WHERE clinicaId = ? AND pacienteId = ?',
      [clinicaId, pacienteIdAntigo],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao contar mensagens:', err);
          return res.status(500).json({ error: err.message });
        }

        const totalMensagens = row?.total || 0;
        console.log(`   - Mensagens a migrar: ${totalMensagens}`);

        if (totalMensagens === 0) {
          return res.json({ success: true, migradas: 0, mensagem: 'Nenhuma mensagem encontrada para migrar' });
        }

        // Atualiza o pacienteId e opcionalmente o pacienteNome
        let query = 'UPDATE mensagens SET pacienteId = ?';
        let params = [pacienteIdNovo];

        if (pacienteNomeNovo) {
          query += ', pacienteNome = ?';
          params.push(pacienteNomeNovo);
        }

        query += ' WHERE clinicaId = ? AND pacienteId = ?';
        params.push(clinicaId, pacienteIdAntigo);

        db.run(query, params, function (err) {
          if (err) {
            console.error('❌ Erro ao migrar mensagens:', err);
            return res.status(500).json({ error: err.message });
          }

          console.log(`✅ ${this.changes} mensagens migradas de ${pacienteIdAntigo} para ${pacienteIdNovo}`);
          res.json({
            success: true,
            migradas: this.changes,
            mensagem: `${this.changes} mensagens migradas com sucesso`
          });
        });
      }
    );

  } catch (err) {
    console.error('❌ Erro ao migrar mensagens:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mensagens - Deleta mensagens de um paciente
router.delete('/', async (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  console.log(`💬 DELETE /api/mensagens - clinicaId: ${clinicaId}, pacienteId: ${pacienteId}`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    let query = 'DELETE FROM mensagens WHERE clinicaId = ?';
    let params = [clinicaId];

    if (pacienteId) {
      query += ' AND pacienteId = ?';
      params.push(pacienteId);
    }

    db.run(query, params, function (err) {
      if (err) {
        console.error('❌ Erro ao deletar mensagens:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log(`✅ ${this.changes} mensagens deletadas`);
      res.json({ success: true, deletadas: this.changes });
    });

  } catch (err) {
    console.error('❌ Erro ao deletar mensagens:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;