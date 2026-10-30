
// ==================== MIGRAÇÃO: Upload de arquivos locais para nuvem ====================
// Este script varre TODAS as clínicas e faz upload dos arquivos locais que ainda
// não estão na nuvem (nuvem.sky9.com.br), atualizando o banco com a URL da nuvem.
//
// Uso: cd server && node migrate-uploads-to-cloud.js
//
// O que migra:
// 1. Documentos (tabela documentos) — campo url
// 2. Fotos de pacientes (tabela pacientes) — campo fotoUrl
// 3. Mídias de mensagens (arquivos em uploads/*/mensagens/) — não tem tabela, só log

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

let fetch;
try {fetch = require('node-fetch');} catch (e) {fetch = globalThis.fetch;}

const { MYSQL_CONFIG, GLOBAL_DB_NAME, getClinicaDbName } = require('../../config/mysql');
const CLOUD_BASE_URL = process.env.CLOUD_STORAGE_URL || 'https://nuvem.sky9.com.br';
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Contadores
let totalDocs = 0,uploadedDocs = 0,failedDocs = 0,skippedDocs = 0;
let totalFotos = 0,uploadedFotos = 0,failedFotos = 0,skippedFotos = 0;

// ==================== UPLOAD PARA NUVEM ====================
async function uploadToCloud(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 100) {
      console.log(`  ⚠️ Arquivo muito pequeno (${buffer.length} bytes): ${filePath}`);
      return null;
    }

    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
      '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
      '.3gp': 'video/3gpp', '.avi': 'video/x-msvideo', '.webm': 'video/webm',
      '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.aac': 'audio/aac',
      '.wav': 'audio/wav', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    const mimetype = mimeMap[ext] || 'application/octet-stream';

    const form = new FormData();
    form.append('file', buffer, { filename: fileName, contentType: mimetype });

    const response = await fetch(`${CLOUD_BASE_URL}/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {},
      timeout: 60000
    });

    if (!response.ok) {
      console.log(`  ❌ HTTP ${response.status} para ${fileName}`);
      return null;
    }

    const result = await response.json();
    if (!result.id) {
      console.log(`  ❌ Sem ID na resposta para ${fileName}`);
      return null;
    }

    return `${CLOUD_BASE_URL}/download/${result.id}`;
  } catch (error) {
    console.log(`  ❌ Erro: ${error.message}`);
    return null;
  }
}

// ==================== MIGRAR DOCUMENTOS DE UMA CLÍNICA ====================
async function migrarDocumentos(conn, clinicaId, dbName) {
  try {
    // Verifica se tabela existe
    const [tables] = await conn.query(`SHOW TABLES FROM \`${dbName}\` LIKE 'documentos'`);
    if (tables.length === 0) return;

    // Busca documentos sem URL da nuvem
    const [docs] = await conn.query(
      `SELECT id, caminho, url FROM \`${dbName}\`.documentos WHERE (url IS NULL OR url = '' OR url NOT LIKE 'https://%')`
    );

    if (docs.length === 0) return;

    console.log(`  📄 ${docs.length} documentos para migrar`);

    for (const doc of docs) {
      totalDocs++;
      const localPath = doc.caminho ? path.join(__dirname, '..', '..', doc.caminho) : null;

      if (!localPath || !fs.existsSync(localPath)) {
        console.log(`  ⏭️ [${doc.id}] Arquivo local não existe: ${doc.caminho}`);
        skippedDocs++;
        continue;
      }

      const cloudUrl = await uploadToCloud(localPath);
      if (cloudUrl) {
        await conn.query(
          `UPDATE \`${dbName}\`.documentos SET url = ? WHERE id = ?`,
          [cloudUrl, doc.id]
        );
        console.log(`  ✅ [${doc.id}] → ${cloudUrl}`);
        uploadedDocs++;
      } else {
        failedDocs++;
      }

      // Pausa entre uploads para não sobrecarregar
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (error) {
    if (!error.message.includes("doesn't exist")) {
      console.log(`  ❌ Erro documentos: ${error.message}`);
    }
  }
}

// ==================== MIGRAR FOTOS DE PACIENTES ====================
async function migrarFotos(conn, clinicaId, dbName) {
  try {
    // Verifica se tabela existe
    const [tables] = await conn.query(`SHOW TABLES FROM \`${dbName}\` LIKE 'pacientes'`);
    if (tables.length === 0) return;

    // Busca pacientes com fotoUrl local (começa com /uploads/)
    const [pacientes] = await conn.query(
      `SELECT id, nome, fotoUrl FROM \`${dbName}\`.pacientes WHERE fotoUrl IS NOT NULL AND fotoUrl != '' AND fotoUrl LIKE '/uploads/%'`
    );

    if (pacientes.length === 0) return;

    console.log(`  📸 ${pacientes.length} fotos de pacientes para migrar`);

    for (const pac of pacientes) {
      totalFotos++;
      const localPath = path.join(__dirname, '..', '..', pac.fotoUrl);

      if (!fs.existsSync(localPath)) {
        console.log(`  ⏭️ [${pac.id}] ${pac.nome} - Arquivo não existe: ${pac.fotoUrl}`);
        skippedFotos++;
        continue;
      }

      const cloudUrl = await uploadToCloud(localPath);
      if (cloudUrl) {
        await conn.query(
          `UPDATE \`${dbName}\`.pacientes SET fotoUrl = ? WHERE id = ?`,
          [cloudUrl, pac.id]
        );
        console.log(`  ✅ [${pac.id}] ${pac.nome} → ${cloudUrl}`);
        uploadedFotos++;
      } else {
        failedFotos++;
      }

      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (error) {
    if (!error.message.includes("doesn't exist")) {
      console.log(`  ❌ Erro fotos: ${error.message}`);
    }
  }
}

// ==================== MAIN ====================
async function main() {
  console.log('='.repeat(60));
  console.log('☁️  MIGRAÇÃO DE ARQUIVOS LOCAIS → NUVEM');
  console.log(`☁️  Destino: ${CLOUD_BASE_URL}`);
  console.log(`☁️  Uploads dir: ${UPLOADS_DIR}`);
  console.log('='.repeat(60));

  // Testa conexão com a nuvem
  try {
    const testResp = await fetch(CLOUD_BASE_URL, { timeout: 5000 });
    console.log(`☁️  Nuvem acessível: HTTP ${testResp.status}\n`);
  } catch (e) {
    console.error(`❌ Nuvem inacessível: ${e.message}`);
    console.error(`   Verifique se ${CLOUD_BASE_URL} está online.`);
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: MYSQL_CONFIG.host,
    user: MYSQL_CONFIG.user,
    password: MYSQL_CONFIG.password,
    port: MYSQL_CONFIG.port,
    charset: MYSQL_CONFIG.charset
  });

  // Busca todas as clínicas
  const [clinicas] = await conn.query(`SELECT id, nome, operadoraId FROM \`${GLOBAL_DB_NAME}\`.clinicas`);
  console.log(`📋 ${clinicas.length} clínica(s) encontrada(s)\n`);

  for (const clinica of clinicas) {
    const dbName = getClinicaDbName(clinica.id);
    console.log(`\n🏥 ${clinica.nome || clinica.id} (${dbName})`);
    console.log('-'.repeat(50));

    // Verifica se o banco existe
    try {
      await conn.query(`USE \`${dbName}\``);
    } catch (e) {
      console.log(`  ⚠️ Banco ${dbName} não existe, pulando...`);
      continue;
    }

    await migrarDocumentos(conn, clinica.id, dbName);
    await migrarFotos(conn, clinica.id, dbName);
  }

  await conn.end();

  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('☁️  RESUMO DA MIGRAÇÃO');
  console.log('='.repeat(60));
  console.log(`📄 Documentos: ${uploadedDocs} enviados, ${skippedDocs} sem arquivo, ${failedDocs} falharam (${totalDocs} total)`);
  console.log(`📸 Fotos:      ${uploadedFotos} enviadas, ${skippedFotos} sem arquivo, ${failedFotos} falharam (${totalFotos} total)`);
  console.log('='.repeat(60));

  if (failedDocs > 0 || failedFotos > 0) {
    console.log('\n⚠️  Alguns uploads falharam. Execute novamente para tentar os que falharam.');
  }

  if (uploadedDocs + uploadedFotos > 0) {
    console.log('\n✅ Migração concluída! Agora você pode apagar o storage local com segurança');
    console.log('   (apenas os arquivos que foram migrados com sucesso).');
  } else if (skippedDocs + skippedFotos > 0) {
    console.log('\n⚠️  Nenhum arquivo foi migrado. Os arquivos locais não existem no disco.');
  } else {
    console.log('\n✅ Nada para migrar — todos os arquivos já estão na nuvem!');
  }
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});