// ==================== FUNÇÕES AUXILIARES ====================

const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

// Função para formatar data no padrão brasileiro
function formatarData(dataString) {
  if (!dataString) return 'Data não informada';
  try {
    const [ano, mes, dia] = dataString.split('-');
    return `${dia}/${mes}/${ano}`;
  } catch (e) {
    return dataString;
  }
}

// Função auxiliar para salvar mensagem no histórico
// ⭐ v12.1: Usa coluna 'chatId' (alinhado com whatsapp-shared.js v10.0)
// ⭐ v18.0: Adicionado campo consultaId
async function salvarMensagemHistorico(clinicaId, pacienteId, pacienteNome, tipo, conteudo, status = 'enviada', chatId = null, consultaId = null) {
  console.log(`💾 [salvarMensagemHistorico v18.0] ==================== INÍCIO ====================`);
  console.log(`💾 Parâmetros:`);
  console.log(`   - clinicaId: "${clinicaId}"`);
  console.log(`   - pacienteId: "${pacienteId}"`);
  console.log(`   - pacienteNome: "${pacienteNome}"`);
  console.log(`   - tipo: "${tipo}"`);
  console.log(`   - conteudo: "${conteudo ? conteudo.substring(0, 80) + '...' : 'VAZIO'}"`);
  console.log(`   - status: "${status}"`);
  console.log(`   - chatId: "${chatId || '(não informado)'}"`);
  console.log(`   - consultaId: "${consultaId || '(não informado)'}"`);

  // Validação rigorosa
  if (!clinicaId) {
    console.error(`❌ [salvarMensagemHistorico] ERRO: clinicaId está vazio ou undefined!`);
    return null;
  }

  if (!pacienteId) {
    console.error(`❌ [salvarMensagemHistorico] ERRO: pacienteId está vazio ou undefined!`);
    return null;
  }

  if (!tipo) {
    console.error(`❌ [salvarMensagemHistorico] ERRO: tipo está vazio ou undefined!`);
    return null;
  }

  if (!conteudo) {
    console.error(`❌ [salvarMensagemHistorico] ERRO: conteudo está vazio ou undefined!`);
    return null;
  }

  try {
    const db = getClinicaDB(clinicaId);

    // ⭐⭐⭐ v12.1: Tabela com coluna chatId (padronizado) ⭐⭐⭐
    // ⭐⭐⭐ v18.0: Adicionado campo consultaId ⭐⭐⭐
    await new Promise((resolve) => {
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
      `, () => resolve(null));
    });

    // Garante coluna chatId (caso tabela já exista sem ela)
    await new Promise((resolve) => {
      db.run(`ALTER TABLE mensagens ADD COLUMN chatId TEXT`, () => resolve(null));
    });
    // ⭐⭐⭐ FIX v18.0: Migração - adiciona coluna consultaId ⭐⭐⭐
    await new Promise((resolve) => {
      db.run(`ALTER TABLE mensagens ADD COLUMN consultaId TEXT`, () => resolve(null));
    });

    // ⭐ Migra dados antigos: se existir coluna whatsappChatId ou whatsappFrom, copia para chatId
    await new Promise((resolve) => {
      db.run(`UPDATE mensagens SET chatId = whatsappChatId WHERE (chatId IS NULL OR chatId = '') AND whatsappChatId IS NOT NULL AND whatsappChatId != ''`, () => resolve(null));
    });
    await new Promise((resolve) => {
      db.run(`UPDATE mensagens SET chatId = whatsappFrom WHERE (chatId IS NULL OR chatId = '') AND whatsappFrom IS NOT NULL AND whatsappFrom != ''`, () => resolve(null));
    });

    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const dataHora = new Date().toISOString();

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO mensagens (id, clinicaId, chatId, consultaId, pacienteId, pacienteNome, tipo, conteudo, dataHora, status, erro, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, clinicaId, chatId || null, consultaId || null, pacienteId, pacienteNome || null, tipo, conteudo, dataHora, status, null, dataHora],
        function (err) {
          if (err) {
            console.error('❌ [salvarMensagemHistorico] Erro ao inserir:', err.message);
            reject(err);
          } else {
            console.log(`✅ [salvarMensagemHistorico] Mensagem salva! ID=${id}, chatId=${chatId || '(vazio)'}, consultaId=${consultaId || '(vazio)'}`);
            resolve(null);
          }
        }
      );
    });

    console.log(`💾 [salvarMensagemHistorico] ==================== FIM (OK) ====================`);
    return id;
  } catch (err) {
    console.error('❌ [salvarMensagemHistorico] ERRO GERAL:', err.message);
    return null;
  }
}

// Função para buscar todas as consultas de um paciente por telefone
async function buscarTodasConsultasPorTelefone(clinicaId, telefone) {
  const db = getClinicaDB(clinicaId);

  // Pega os últimos 8 e 9 dígitos para busca flexível
  const ultimos9Digitos = telefone.slice(-9);
  const ultimos8Digitos = telefone.slice(-8);

  return new Promise((resolve, reject) => {
    // Primeiro busca pacientes pelo telefone (SEM LIMIT para detectar múltiplos)
    db.all(
      `SELECT id, nome, telefone FROM pacientes 
       WHERE telefone LIKE ? 
          OR telefone LIKE ? 
          OR REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?`,
      [`%${ultimos9Digitos}%`, `%${ultimos8Digitos}%`, `%${ultimos9Digitos}%`],
      (err, pacientes) => {
        if (err) {
          console.error('❌ Erro ao buscar pacientes:', err);
          reject(err);
          return;
        }
        if (!pacientes || pacientes.length === 0) {
          console.log(`⚠️ Nenhum paciente encontrado com telefone: ${telefone}`);
          resolve([]);
          return;
        }
        console.log(`📋 Pacientes encontrados: ${pacientes.length}`);
        // Busca consultas futuras desses pacientes
        const pacienteIds = pacientes.map((p) => p.id);
        const placeholders = pacienteIds.map(() => '?').join(',');
        const hoje = new Date().toISOString().split('T')[0];
        db.all(
          `SELECT c.*, p.nome as pacienteNome, p.telefone as pacienteTelefone
           FROM consultas c
           LEFT JOIN pacientes p ON c.pacienteId = p.id
           WHERE c.pacienteId IN (${placeholders})
             AND c.data >= ?
           ORDER BY c.data ASC, c.horario ASC`,
          [...pacienteIds, hoje],
          (err, consultas) => {
            if (err) {
              console.error('❌ Erro ao buscar consultas:', err);
              reject(err);
              return;
            }
            console.log(`📋 Consultas encontradas: ${consultas ? consultas.length : 0}`);
            resolve(consultas || []);
          }
        );
      }
    );
  });
}

// Função para notificar clientes SSE sobre atualização de foto
function notificarFotoAtualizada(sseClients, pacienteId, fotoUrl, pacienteNome) {
  const clients = sseClients.get(pacienteId);

  if (!clients || clients.size === 0) {
    console.log(`📡 SSE: Nenhum cliente conectado para paciente ${pacienteId}`);
    return;
  }

  const evento = {
    type: 'foto_atualizada',
    pacienteId,
    pacienteNome,
    fotoUrl,
    timestamp: Date.now()
  };

  console.log(`📡 SSE: Notificando ${clients.size} cliente(s) sobre foto atualizada para ${pacienteNome}`);

  clients.forEach((client) => {
    try {
      client.write(`event: foto_atualizada\ndata: ${JSON.stringify(evento)}\n\n`);
    } catch (err) {
      console.error(`📡 SSE: Erro ao enviar notificação:`, err.message);
    }
  });
}

module.exports = {
  formatarData,
  salvarMensagemHistorico,
  buscarTodasConsultasPorTelefone,
  notificarFotoAtualizada
};