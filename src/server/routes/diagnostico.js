
// ==================== ROTAS DE DIAGNÓSTICO ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const { SERVER_VERSION, BUILD_DATE, DEPLOYMENT_MARKER } = require('../config');
const { salvarMensagemHistorico } = require('../utils/helpers');

// GET /api/health - Evidência da versão efetivamente em execução no servidor.
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: SERVER_VERSION,
    build: BUILD_DATE,
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// GET /api/diagnostico/mensagens/:clinicaId - Verifica mensagens de uma clínica
router.get('/mensagens/:clinicaId', async (req, res) => {
  const { clinicaId } = req.params;

  console.log(`🔍 Diagnóstico de mensagens - clinicaId: ${clinicaId}`);

  try {
    const db = getClinicaDB(clinicaId);

    // Verifica se a tabela existe
    const tabelas = await new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    const tabelaMensagensExiste = tabelas.some((t) => t.name === 'mensagens');

    let totalMensagens = 0;
    let ultimasMensagens = [];
    let estruturaTabela = [];

    if (tabelaMensagensExiste) {
      // Conta total
      const contagem = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total FROM mensagens', [], (err, row) => {
          if (err) reject(err);else
          resolve(row);
        });
      });
      totalMensagens = contagem?.total || 0;

      // Busca últimas 10 mensagens
      ultimasMensagens = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM mensagens ORDER BY dataHora DESC LIMIT 10', [], (err, rows) => {
          if (err) reject(err);else
          resolve(rows || []);
        });
      });

      // Estrutura da tabela
      estruturaTabela = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(mensagens)", [], (err, rows) => {
          if (err) reject(err);else
          resolve(rows || []);
        });
      });
    }

    res.json({
      clinicaId,
      tabelaMensagensExiste,
      totalMensagens,
      estruturaTabela: estruturaTabela.map((c) => c.name),
      ultimasMensagens: ultimasMensagens.map((m) => ({
        id: m.id,
        pacienteId: m.pacienteId,
        pacienteNome: m.pacienteNome,
        tipo: m.tipo,
        conteudo: m.conteudo ? m.conteudo.substring(0, 50) + '...' : null,
        dataHora: m.dataHora,
        status: m.status
      })),
      todasTabelas: tabelas.map((t) => t.name)
    });

  } catch (err) {
    console.error('❌ Erro no diagnóstico:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/diagnostico/mensagens/teste - Testa gravação de mensagem
router.post('/mensagens/teste', async (req, res) => {
  const { clinicaId, pacienteId } = req.body;

  console.log(`🧪 Teste de gravação de mensagem - clinicaId: ${clinicaId}, pacienteId: ${pacienteId}`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const pacienteIdFinal = pacienteId || 'teste_' + Date.now();
    const conteudoTeste = `Mensagem de teste gerada em ${new Date().toLocaleString('pt-BR')}`;

    console.log(`🧪 Chamando salvarMensagemHistorico com:`);
    console.log(`   - clinicaId: ${clinicaId}`);
    console.log(`   - pacienteId: ${pacienteIdFinal}`);
    console.log(`   - conteudo: ${conteudoTeste}`);

    const idMensagem = await salvarMensagemHistorico(
      clinicaId,
      pacienteIdFinal,
      'Paciente Teste',
      'enviada',
      conteudoTeste,
      'enviada',
      null
    );

    if (idMensagem) {
      // Verifica se realmente salvou
      const db = getClinicaDB(clinicaId);
      const mensagemSalva = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM mensagens WHERE id = ?', [idMensagem], (err, row) => {
          if (err) reject(err);else
          resolve(row);
        });
      });

      res.json({
        success: true,
        idMensagem,
        mensagemSalva: mensagemSalva ? {
          id: mensagemSalva.id,
          clinicaId: mensagemSalva.clinicaId,
          pacienteId: mensagemSalva.pacienteId,
          tipo: mensagemSalva.tipo,
          conteudo: mensagemSalva.conteudo,
          dataHora: mensagemSalva.dataHora
        } : null,
        verificacao: mensagemSalva ? '✅ MENSAGEM SALVA E VERIFICADA' : '⚠️ ID RETORNADO MAS MENSAGEM NÃO ENCONTRADA'
      });
    } else {
      res.json({
        success: false,
        error: 'Função retornou null - verifique os logs do servidor',
        verificacao: '❌ FALHA AO SALVAR'
      });
    }

  } catch (err) {
    console.error('❌ Erro no teste:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /api/diagnostico/paciente-foto/:clinicaId/:pacienteId - Verifica foto do paciente
router.get('/paciente-foto/:clinicaId/:pacienteId', async (req, res) => {
  const { clinicaId, pacienteId } = req.params;

  console.log(`🔍 Diagnóstico de foto - clinicaId: ${clinicaId}, pacienteId: ${pacienteId}`);

  try {
    const db = getClinicaDB(clinicaId);

    const paciente = await new Promise((resolve, reject) => {
      db.get('SELECT id, nome, fotoUrl FROM pacientes WHERE id = ?', [pacienteId], (err, row) => {
        if (err) reject(err);else
        resolve(row);
      });
    });

    if (!paciente) {
      return res.status(404).json({ error: 'Paciente não encontrado' });
    }

    res.json({
      pacienteId: paciente.id,
      nome: paciente.nome,
      fotoUrl: paciente.fotoUrl,
      temFoto: !!paciente.fotoUrl
    });

  } catch (err) {
    console.error('❌ Erro no diagnóstico de foto:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagnostico/tabelas/:clinicaId - Lista todas as tabelas de uma clínica
router.get('/tabelas/:clinicaId', async (req, res) => {
  const { clinicaId } = req.params;

  console.log(`🔍 Diagnóstico de tabelas - clinicaId: ${clinicaId}`);

  try {
    const db = getClinicaDB(clinicaId);

    const tabelas = await new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    const resultado = {};

    for (const tabela of tabelas) {
      const contagem = await new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as total FROM ${tabela.name}`, [], (err, row) => {
          if (err) resolve({ total: 'erro' });else
          resolve(row);
        });
      });

      const colunas = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tabela.name})`, [], (err, rows) => {
          if (err) resolve([]);else
          resolve(rows || []);
        });
      });

      resultado[tabela.name] = {
        registros: contagem?.total || 0,
        colunas: colunas.map((c) => c.name)
      };
    }

    res.json({
      clinicaId,
      totalTabelas: tabelas.length,
      tabelas: resultado
    });

  } catch (err) {
    console.error('❌ Erro no diagnóstico de tabelas:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;