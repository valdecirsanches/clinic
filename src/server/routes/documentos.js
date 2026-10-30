// ==================== ROTAS DE DOCUMENTOS ====================
// VERSÃO: 1.3.1 - 2026-02-27
// ✅ FIX: Usa fetch nativo do Node 18+ com fallback para node-fetch

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const path = require('path');
const fs = require('fs');
const { uploadFileToCloud, isCloudUrl } = require('../services/cloudStorage');

// ⭐⭐⭐ FIX v1.4.0: Usa enviarMensagemRobusta do whatsapp-shared (centralizado) ⭐⭐⭐
const {
  enviarMensagemRobusta,
  fetch: sharedFetch
} = require('./whatsapp-shared');

// ⭐⭐⭐ FIX v1.4.0: Usa o MESMO fetch do whatsapp-shared (node-fetch@2) ⭐⭐⭐
// O fetch nativo do Node 18+ (undici) tem comportamentos diferentes que causam problemas
const fetch = sharedFetch;

const DOCUMENTOS_MODULE_VERSION = '1.3.1';
const DOCUMENTOS_MODULE_BUILD = '2026-02-27-FIX-FETCH-ROBUST';

// Rota de versão
router.get('/version', (req, res) => {
  res.json({
    version: DOCUMENTOS_MODULE_VERSION,
    build: DOCUMENTOS_MODULE_BUILD
  });
});

// ⭐⭐⭐ FIX v1.5: OPTIONS preflight para Range requests (vídeo cross-origin) ⭐⭐⭐
router.options('/:id/visualizar', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Range, Accept-Ranges, Content-Length, Content-Type'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

// GET /api/documentos?clinicaId=c1 - Lista documentos de uma clínica
router.get('/', (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  console.log(
    '🔍 GET /api/documentos - clinicaId:',
    clinicaId,
    'pacienteId:',
    pacienteId
  );

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // Garante que a tabela existe
  db.run(
    `
    CREATE TABLE IF NOT EXISTS documentos (
      id VARCHAR(255) PRIMARY KEY,
      pacienteId VARCHAR(255) NOT NULL,
      nome VARCHAR(500) NOT NULL,
      nomeOriginal VARCHAR(500),
      tipo VARCHAR(100),
      categoria VARCHAR(100),
      caminho TEXT,
      url TEXT,
      tamanho INTEGER,
      observacoes TEXT,
      criadoPor VARCHAR(255),
      especialidade VARCHAR(255),
      criadoEm VARCHAR(50)
    )
  `,
    (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela documentos:', err);
      }

      // Migração para adicionar a coluna especialidade se não existir
      db.run('ALTER TABLE documentos ADD COLUMN especialidade VARCHAR(255)', () => {
        let query = 'SELECT * FROM documentos';
        let params = [];

        if (pacienteId) {
          query += ' WHERE pacienteId = ?';
          params.push(pacienteId);
        }

        query += ' ORDER BY criadoEm DESC';

        db.all(query, params, (err, rows) => {
          if (err) {
            console.error('❌ Erro ao buscar documentos:', err);
            return res.status(500).json({ error: err.message });
          }

          console.log(`✅ Retornando ${(rows || []).length} documentos`);
          res.json(rows || []);
        });
      });
    }
  );
});

// GET /api/documentos/:id - Busca documento por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM documentos WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar documento:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    res.json(row);
  });
});

// GET /api/documentos/:id/download - Download do documento
router.get('/:id/download', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM documentos WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const filePath = path.join(__dirname, '..', row.caminho || row.url);

    if (!fs.existsSync(filePath)) {
      // ⭐ CLOUD FALLBACK: Se arquivo local não existe mas tem URL da nuvem, redireciona
      if (row.url && isCloudUrl(row.url)) {
        console.log(`☁️ Arquivo local ausente, redirecionando para nuvem: ${row.url}`);
        return res.redirect(row.url);
      }
      return res.
      status(404).
      json({ error: 'Arquivo não encontrado no servidor' });
    }

    res.download(filePath, row.nomeOriginal || row.nome);
  });
});

// GET /api/documentos/:id/visualizar - Visualizar documento
router.get('/:id/visualizar', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM documentos WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    const filePath = path.join(__dirname, '..', row.caminho || row.url);

    if (!fs.existsSync(filePath)) {
      // ⭐ CLOUD FALLBACK: Se arquivo local não existe mas tem URL da nuvem, redireciona
      if (row.url && isCloudUrl(row.url)) {
        console.log(`☁️ Arquivo local ausente, redirecionando para nuvem: ${row.url}`);
        return res.redirect(row.url);
      }
      return res.
      status(404).
      json({ error: 'Arquivo não encontrado no servidor' });
    }

    // ⭐⭐⭐ FIX v1.4: DETECÇÃO DE MIME TYPE ROBUSTA ⭐⭐⭐
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.3gp': 'video/3gpp',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.ogg': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.aac': 'audio/aac',
      '.wav': 'audio/wav',
      '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    let contentType = mimeTypes[ext] || row.tipo || 'application/octet-stream';

    if (row.tipo === 'application/octet-stream' && mimeTypes[ext]) {
      contentType = mimeTypes[ext];
    }

    console.log(
      `👁️ Visualizar doc ${id}: ext=${ext}, dbTipo=${row.tipo}, contentType=${contentType}, file=${filePath}`
    );

    // ⭐⭐⭐ FIX v1.5: CORS HEADERS PARA RANGE REQUESTS (OBRIGATÓRIO PARA VÍDEO CROSS-ORIGIN) ⭐⭐⭐
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Accept-Ranges, Content-Length, Content-Type'
    );
    // ⭐⭐⭐ FIX v1.6: Cache-Control no-cache para imagens (evita cache de respostas de erro) ⭐⭐⭐
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // ⭐⭐⭐ FIX v1.4: STREAMING COM RANGE REQUESTS PARA VÍDEO/ÁUDIO ⭐⭐⭐
    const isStreamable =
    contentType.startsWith('video/') || contentType.startsWith('audio/');

    if (isStreamable) {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        console.log(
          `👁️ Range request: bytes=${start}-${end}/${fileSize} (chunk: ${chunkSize})`
        );

        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers':
          'Content-Range, Accept-Ranges, Content-Length, Content-Type'
        });

        stream.pipe(res);
      } else {
        console.log(`👁️ Full request: ${fileSize} bytes, type: ${contentType}`);

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers':
          'Content-Range, Accept-Ranges, Content-Length, Content-Type'
        });

        fs.createReadStream(filePath).pipe(res);
      }
    } else {
      res.setHeader('Content-Type', contentType);
      res.sendFile(filePath);
    }
  });
});

// POST /api/documentos - Cria novo documento (com upload de arquivo)
router.post('/', (req, res) => {
  // Verifica se é multipart/form-data (upload de arquivo)
  if (req.is('multipart/form-data')) {
    // ⭐ FIX: Destructura corretamente — middleware exporta { upload, uploadsDir }
    const { upload: multerUpload, uploadsDir } = require('../middleware/upload');

    multerUpload.single('arquivo')(req, res, async (err) => {
      if (err) {
        console.error('❌ Erro no upload:', err);
        return res.status(400).json({ error: err.message });
      }

      const {
        operadoraId,
        clinicaId,
        pacienteId,
        nome,
        categoria,
        observacoes,
        criadoPor,
        especialidade
      } = req.body;

      console.log(
        '📝 POST /api/documentos (upload) - clinicaId:',
        clinicaId,
        'pacienteId:',
        pacienteId
      );

      // ⭐ Espaço de documentos do plano (ex.: plano gratuito = 1 GB)
      if (clinicaId && req.file) {
        const bloqueioPlano = await require('../services/limitesPlano').verificarLimite(
          clinicaId,
          'armazenamento',
          { bytesAdicionais: req.file.size }
        );
        if (bloqueioPlano) {
          try {require('fs').unlinkSync(req.file.path);} catch (e) {/* já removido */}
          return res.status(403).json(bloqueioPlano);
        }
      }

      if (!clinicaId || !pacienteId) {
        return res.
        status(400).
        json({ error: 'clinicaId e pacienteId são obrigatórios' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Arquivo não enviado' });
      }

      const db = getClinicaDB(clinicaId);
      const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const criadoEm = new Date().toISOString();

      // ⭐ FIX: Move arquivo de temp/ para o diretório final correto
      const destDir = path.join(uploadsDir, operadoraId || 'geral', clinicaId, pacienteId, 'documentos');
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const destPath = path.join(destDir, req.file.filename);
      try {
        fs.renameSync(req.file.path, destPath);
        console.log(`📁 Arquivo movido: temp → ${destDir}`);
      } catch (moveErr) {
        // Fallback: copia e deleta (para volumes diferentes)
        fs.copyFileSync(req.file.path, destPath);
        fs.unlinkSync(req.file.path);
        console.log(`📁 Arquivo copiado: temp → ${destDir}`);
      }

      // Monta o caminho relativo do arquivo
      const caminho = `/uploads/${operadoraId || 'geral'}/${clinicaId}/${pacienteId}/documentos/${req.file.filename}`;

      // ⭐⭐⭐ CLOUD STORAGE: Envia para nuvem ⭐⭐⭐
      let cloudUrl = null;
      try {
        const cloudResult = await uploadFileToCloud(destPath, req.file.mimetype);
        if (cloudResult?.cloudUrl) {
          cloudUrl = cloudResult.cloudUrl;
          console.log(`☁️ Documento enviado para nuvem: ${cloudUrl}`);
        }
      } catch (cloudErr) {
        console.log(`⚠️ Nuvem indisponível: ${cloudErr.message}`);
      }

      // Garante que a tabela existe
      db.run(
        `
        CREATE TABLE IF NOT EXISTS documentos (
          id VARCHAR(255) PRIMARY KEY,
          pacienteId VARCHAR(255) NOT NULL,
          nome VARCHAR(500) NOT NULL,
          nomeOriginal VARCHAR(500),
          tipo VARCHAR(100),
          categoria VARCHAR(100),
          caminho TEXT,
          url TEXT,
          tamanho INTEGER,
          observacoes TEXT,
          criadoPor VARCHAR(255),
          especialidade VARCHAR(255),
          criadoEm VARCHAR(50)
        )
      `,
        (tableErr) => {
          if (tableErr) {
            console.error('❌ Erro ao criar tabela:', tableErr);
          }

          db.run('ALTER TABLE documentos ADD COLUMN especialidade VARCHAR(255)', () => {
            db.run(
              `INSERT INTO documentos (id, pacienteId, nome, nomeOriginal, tipo, categoria, caminho, url, tamanho, observacoes, criadoPor, especialidade, criadoEm)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
              id,
              pacienteId,
              nome || req.file.originalname,
              req.file.originalname,
              req.file.mimetype,
              categoria || 'outros',
              caminho,
              cloudUrl,
              req.file.size,
              observacoes || null,
              criadoPor || null,
              especialidade || null,
              criadoEm],

              function (insertErr) {
                if (insertErr) {
                  console.error('❌ Erro ao criar documento:', insertErr);
                  return res.status(500).json({ error: insertErr.message });
                }

                console.log(`✅ Documento criado: ${id}`);
                res.json({
                  id,
                  pacienteId,
                  nome: nome || req.file.originalname,
                  nomeOriginal: req.file.originalname,
                  tipo: req.file.mimetype,
                  categoria: categoria || 'outros',
                  caminho,
                  url: cloudUrl,
                  tamanho: req.file.size,
                  observacoes,
                  criadoPor,
                  especialidade,
                  criadoEm
                });
              }
            );
          });
        }
      );
    });
  } else {
    // JSON simples (sem arquivo)
    const {
      clinicaId,
      pacienteId,
      nome,
      tipo,
      categoria,
      url,
      tamanho,
      observacoes,
      especialidade
    } = req.body;

    console.log(
      '📝 POST /api/documentos (JSON) - clinicaId:',
      clinicaId,
      'pacienteId:',
      pacienteId
    );

    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório' });
    }

    if (!pacienteId) {
      return res.status(400).json({ error: 'pacienteId é obrigatório' });
    }

    const db = getClinicaDB(clinicaId);
    const id = `doc_${Date.now()}`;
    const criadoEm = new Date().toISOString();

    // Garante que a tabela existe
    db.run(
      `
      CREATE TABLE IF NOT EXISTS documentos (
        id VARCHAR(255) PRIMARY KEY,
        pacienteId VARCHAR(255) NOT NULL,
        nome VARCHAR(500) NOT NULL,
        nomeOriginal VARCHAR(500),
        tipo VARCHAR(100),
        categoria VARCHAR(100),
        caminho TEXT,
        url TEXT,
        tamanho INTEGER,
        observacoes TEXT,
        criadoPor VARCHAR(255),
        especialidade VARCHAR(255),
        criadoEm VARCHAR(50)
      )
    `,
      (err) => {
        if (err) {
          console.error('❌ Erro ao criar tabela documentos:', err);
        }

        db.run('ALTER TABLE documentos ADD COLUMN especialidade VARCHAR(255)', () => {
          db.run(
            `INSERT INTO documentos (id, pacienteId, nome, tipo, categoria, url, tamanho, observacoes, especialidade, criadoEm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
            id,
            pacienteId,
            nome,
            tipo || null,
            categoria || null,
            url || null,
            tamanho || 0,
            observacoes || null,
            especialidade || null,
            criadoEm],

            function (err) {
              if (err) {
                console.error('❌ Erro ao criar documento:', err);
                return res.status(500).json({ error: err.message });
              }
              console.log(`✅ Documento criado: ${id}`);
              res.json({
                id,
                pacienteId,
                nome,
                tipo,
                categoria,
                url,
                tamanho,
                observacoes,
                especialidade,
                criadoEm
              });
            }
          );
        });
      }
    );
  }
});

// ⭐ POST /api/documentos/solicitar-whatsapp - Solicita documento via WhatsApp
router.post('/solicitar-whatsapp', async (req, res) => {
  const {
    clinicaId,
    pacienteId,
    pacienteNome,
    pacienteTelefone,
    categoria,
    mensagemPersonalizada
  } = req.body;

  console.log('\n📱 POST /api/documentos/solicitar-whatsapp');
  console.log('   - clinicaId:', clinicaId);
  console.log('   - pacienteId:', pacienteId);
  console.log('   - pacienteNome:', pacienteNome);
  console.log('   - pacienteTelefone:', pacienteTelefone);
  console.log('   - categoria:', categoria);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!pacienteTelefone) {
    return res.status(400).json({ error: 'pacienteTelefone é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    // Busca configuração do WhatsApp (incluindo apiKey)
    // ⭐⭐⭐ GARANTE QUE A COLUNA apiKey EXISTE ⭐⭐⭐
    await new Promise((r) =>
    db.run(
      `ALTER TABLE whatsapp_config ADD COLUMN apiKey TEXT DEFAULT ''`,
      () => r()
    )
    );

    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM whatsapp_config WHERE clinicaId = ?',
        [clinicaId],
        (err, row) => {
          if (err) reject(err);else
          resolve(row);
        }
      );
    });

    if (!config || !config.serverUrl || !config.sessionName) {
      return res.
      status(400).
      json({ error: 'WhatsApp não configurado para esta clínica' });
    }

    const { getWahaApiKey } = require('./whatsapp-shared');
    const wahaApiKey = getWahaApiKey();

    // Formata o número
    let numero = pacienteTelefone.replace(/\D/g, '');
    if (!numero.startsWith('55')) {
      numero = '55' + numero;
    }

    // Monta a mensagem
    const categorias = {
      exames: '🔬 Exames',
      laudos: '📋 Laudos',
      receitas: '💊 Receitas',
      atestados: '📄 Atestados',
      imagens: '🩻 Imagens/Raio-X',
      outros: '📁 Documentos'
    };

    const categoriaTexto = categoria ?
    categorias[categoria] || categoria :
    'documento';

    let mensagem = `📄 *Solicitação de Documento*\n\n`;
    mensagem += `Olá${pacienteNome ? `, *${pacienteNome}*` : ''}! 👋\n\n`;

    if (mensagemPersonalizada) {
      mensagem += `${mensagemPersonalizada}\n\n`;
    } else {
      mensagem += `Precisamos que você envie ${categoria ? `um ${categoriaTexto}` : 'um documento'} para completar seu cadastro.\n\n`;
    }

    mensagem += `📷 *Como enviar:*\n`;
    mensagem += `1. Tire uma foto clara do documento\n`;
    mensagem += `2. Ou envie o arquivo PDF/imagem\n`;
    mensagem += `3. Responda esta mensagem com o documento\n\n`;
    mensagem += `O documento será salvo automaticamente no seu prontuário.\n\n`;
    mensagem += `Digite *0* para cancelar.\n\n`;
    mensagem += `Obrigado! 🙏`;

    console.log('📤 Enviando mensagem para:', numero);

    const telNormalizado = numero.replace(/\D/g, '');
    const solicitacaoId = `sol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const criadoEm = new Date().toISOString();
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ⭐⭐⭐ CRIA a tabela se não existir (MySQL compatível) ⭐⭐⭐
    await new Promise((r) =>
    db.run(
      `
      CREATE TABLE IF NOT EXISTS solicitacoes_pendentes (
        id VARCHAR(191) PRIMARY KEY,
        clinicaId VARCHAR(191) NOT NULL,
        pacienteId VARCHAR(191) NOT NULL,
        pacienteNome VARCHAR(255),
        telefone VARCHAR(50) NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        categoria VARCHAR(50) DEFAULT 'outros',
        especialidade VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'pendente',
        criadoEm VARCHAR(50) NOT NULL,
        expiraEm VARCHAR(50) NOT NULL,
        recebidoEm VARCHAR(50),
        arquivoUrl TEXT
      )
    `,
      () => r()
    )
    );
    // ⭐ Migração: adiciona coluna especialidade se não existir
    await new Promise((r) => db.run('ALTER TABLE solicitacoes_pendentes ADD COLUMN especialidade VARCHAR(255)', () => r()));

    // ⭐⭐⭐ FIX v11.6: REMOVIDO sqlite_master (não existe no MySQL!) ⭐⭐⭐
    // Indexes são gerenciados pelo MySQL automaticamente

    // ⭐⭐⭐ CANCELA TODAS as solicitações pendentes ⭐⭐⭐
    const deletadasPaciente = await new Promise((r) => {
      db.run(
        `DELETE FROM solicitacoes_pendentes WHERE pacienteId = ? AND status = 'pendente'`,
        [pacienteId],
        function (err) {
          if (err) {
            console.log('⚠️ Erro ao deletar por paciente:', err.message);
            r(0);
          } else {
            r(this.changes || 0);
          }
        }
      );
    });

    const ultimos9 = telNormalizado.slice(-9);
    const deletadasTelefone = await new Promise((r) => {
      db.run(
        `DELETE FROM solicitacoes_pendentes WHERE telefone LIKE ? AND status = 'pendente'`,
        [`%${ultimos9}%`],
        function (err) {
          if (err) {
            console.log('⚠️ Erro ao deletar por telefone:', err.message);
            r(0);
          } else {
            r(this.changes || 0);
          }
        }
      );
    });

    console.log(
      `🗑️ Solicitações removidas: ${deletadasPaciente} por paciente, ${deletadasTelefone} por telefone`
    );

    // ⭐⭐⭐ CRIA a nova solicitação de DOCUMENTO ⭐⭐⭐
    const especialidadeSolicitacao = req.body.especialidade || null;
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO solicitacoes_pendentes (id, clinicaId, pacienteId, pacienteNome, telefone, tipo, categoria, especialidade, status, criadoEm, expiraEm)
         VALUES (?, ?, ?, ?, ?, 'documento', ?, ?, 'pendente', ?, ?)`,
        [
        solicitacaoId,
        clinicaId,
        pacienteId,
        pacienteNome || 'Paciente',
        telNormalizado,
        categoria || 'outros',
        especialidadeSolicitacao,
        criadoEm,
        expiraEm],

        (err) => {
          if (err) {
            console.error('❌ Erro ao criar solicitação:', err.message);
            reject(err);
          } else {
            console.log(`✅ Solicitação de DOCUMENTO criada: ${solicitacaoId}`);
            resolve();
          }
        }
      );
    });

    // ⭐⭐⭐ FIX v1.4.0: Usa enviarMensagemRobusta centralizada (mesmo fetch, mesmos headers) ⭐⭐⭐
    const serverUrl = (config.serverUrl || '').replace(/\/+$/, '');
    const chatId = `${numero}@c.us`;

    console.log(`📤 [documentos] Usando enviarMensagemRobusta centralizada`);
    console.log(`📤 [documentos] serverUrl: ${serverUrl}`);
    console.log(`📤 [documentos] sessionName: ${config.sessionName}`);
    console.log(`📤 [documentos] chatId: ${chatId}`);
    console.log(
      `📤 [documentos] apiKey: ${wahaApiKey ? '***' + wahaApiKey.slice(-4) : '(sem chave)'}`
    );

    const resultado = await enviarMensagemRobusta(
      serverUrl,
      wahaApiKey,
      chatId,
      mensagem,
      config.sessionName
    );

    if (!resultado || !resultado.success) {
      console.error('❌ enviarMensagemRobusta falhou');
      return res.
      status(500).
      json({
        error:
        'Erro ao enviar mensagem via WhatsApp - nenhum endpoint funcionou'
      });
    }

    console.log(`📤 ✅ Mensagem enviada com sucesso via enviarMensagemRobusta`);

    console.log('✅ Solicitação enviada com sucesso!');

    // Salva no histórico de mensagens
    try {
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await new Promise((resolve) => {
        db.run(
          `
          CREATE TABLE IF NOT EXISTS mensagens (
            id VARCHAR(191) PRIMARY KEY,
            clinicaId VARCHAR(191),
            pacienteId VARCHAR(191),
            pacienteNome VARCHAR(255),
            tipo VARCHAR(50),
            conteudo LONGTEXT,
            dataHora VARCHAR(50),
            status VARCHAR(50),
            erro TEXT,
            criadoEm VARCHAR(50) NOT NULL,
            INDEX idx_mensagens_clinica (clinicaId),
            INDEX idx_mensagens_paciente (pacienteId)
          )
        `,
          resolve
        );
      });

      await new Promise((resolve) => {
        db.run(
          `INSERT INTO mensagens (id, clinicaId, pacienteId, pacienteNome, tipo, conteudo, dataHora, status, erro, criadoEm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
          msgId,
          clinicaId,
          pacienteId || null,
          pacienteNome || null,
          'enviada',
          mensagem,
          now,
          'enviada',
          null,
          now],

          () => resolve()
        );
      });
    } catch (histErr) {
      console.log('⚠️ Erro ao salvar histórico (não crítico):', histErr.message);
    }

    res.json({
      success: true,
      solicitacaoId,
      message: 'Solicitação enviada com sucesso!',
      numero,
      categoria: categoria || 'outros',
      expiraEm: '24 horas'
    });
  } catch (err) {
    console.error('❌ Erro ao solicitar documento:', err);
    res.status(500).json({ error: err.message });
  }
});

// ⭐ PUT /api/documentos/batch-especialidade - Atribui especialidade a todos os documentos sem especialidade de um paciente
router.put('/batch-especialidade', (req, res) => {
  try {
    const { clinicaId, pacienteId, especialidade } = req.body;

    console.log('🏥 PUT /api/documentos/batch-especialidade');
    console.log('   - clinicaId:', clinicaId);
    console.log('   - pacienteId:', pacienteId);
    console.log('   - especialidade:', especialidade);

    if (!clinicaId || !pacienteId || !especialidade) {
      return res.status(400).json({ error: 'clinicaId, pacienteId e especialidade são obrigatórios' });
    }

    const db = getClinicaDB(clinicaId);

    const executarUpdate = () => {
      try {
        db.run(
          `UPDATE documentos SET especialidade = ? WHERE pacienteId = ? AND (especialidade IS NULL OR especialidade = '')`,
          [especialidade, pacienteId],
          function (err) {
            if (err) {
              console.error('❌ Erro ao atualizar especialidade em batch:', err);
              return res.status(500).json({ error: err.message });
            }

            const atualizados = this.changes || this.affectedRows || 0;
            console.log(`✅ Batch especialidade: ${atualizados} documento(s) atualizados com "${especialidade}" para paciente ${pacienteId}`);
            res.json({
              success: true,
              atualizados,
              especialidade
            });
          }
        );
      } catch (updateErr) {
        console.error('❌ Erro no executarUpdate:', updateErr);
        res.status(500).json({ error: updateErr.message || 'Erro interno' });
      }
    };

    // Tenta adicionar coluna (ignora erro se já existe) e depois executa o update
    db.run('ALTER TABLE documentos ADD COLUMN especialidade VARCHAR(255)', (alterErr) => {
      if (alterErr) {
        console.log('   (coluna especialidade já existe ou erro ignorado)');
      }
      executarUpdate();
    });
  } catch (err) {
    console.error('❌ Erro geral no batch-especialidade:', err);
    res.status(500).json({ error: err.message || 'Erro interno do servidor' });
  }
});

// PUT /api/documentos/:id - Atualiza documento
// ⭐ FIX: Só atualiza campos que foram REALMENTE enviados (não sobrescreve com null)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.body;

  console.log('📝 PUT /api/documentos/:id - id:', id, 'clinicaId:', clinicaId);
  console.log('   - campos recebidos:', Object.keys(req.body).filter((k) => k !== 'clinicaId').join(', '));

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // ⭐ Monta UPDATE dinâmico — só atualiza campos que foram enviados no body
  const camposPermitidos = ['nome', 'categoria', 'observacoes', 'especialidade'];
  const setClauses = [];
  const params = [];

  for (const campo of camposPermitidos) {
    if (req.body[campo] !== undefined) {
      setClauses.push(`${campo} = ?`);
      params.push(req.body[campo] || null);
      console.log(`   - ${campo}:`, req.body[campo]);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

  params.push(id);

  const sql = `UPDATE documentos SET ${setClauses.join(', ')} WHERE id = ?`;
  console.log('   - SQL:', sql);

  db.run(sql, params, function (err) {
    if (err) {
      console.error('❌ Erro ao atualizar documento:', err);
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      console.log(`⚠️ Documento não encontrado: ${id}`);
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    console.log(`✅ Documento atualizado: ${id} (${this.changes} alterações)`);
    const resultado = { success: true, id };
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) resultado[campo] = req.body[campo];
    }
    res.json(resultado);
  });
});

// DELETE /api/documentos/:id - Deleta documento
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log(
    '🗑️ DELETE /api/documentos/:id - id:',
    id,
    'clinicaId:',
    clinicaId
  );

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // Busca o documento para deletar o arquivo físico
  db.get(
    'SELECT caminho, url FROM documentos WHERE id = ?',
    [id],
    (err, row) => {
      if (err) {
        console.error('❌ Erro ao buscar documento:', err);
      }

      // Deleta o arquivo físico se existir
      const filePath = row?.caminho || row?.url;
      if (filePath) {
        const fullPath = path.join(__dirname, '..', filePath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`🗑️ Arquivo físico deletado: ${fullPath}`);
          } catch (e) {
            console.error('⚠️ Erro ao deletar arquivo físico:', e.message);
          }
        }
      }

      // Deleta o registro do banco
      db.run('DELETE FROM documentos WHERE id = ?', [id], function (err) {
        if (err) {
          console.error('❌ Erro ao deletar documento:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Documento deletado: ${id}`);
        res.json({ success: true });
      });
    }
  );
});

module.exports = router;