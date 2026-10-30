
// ==================== MIGRAÇÃO DE EXTRAS → DOCUMENTOS (v2 RECURSIVO) ====================
// Encontra TODOS os arquivos de imagem/documento em qualquer nível de profundidade
// dentro de cada pasta de paciente e copia para /documentos/
//
// USO:
//   cd src/server
//   node migrate-extras.js --dry     ← mostra o que faria SEM copiar (recomendado primeiro!)
//   node migrate-extras.js           ← executa a migração de verdade
// ========================================================================================

const fs = require('fs');
const path = require('path');
const { getClinicaDB } = require('../../databaseClinica');

// ⭐ CONFIGURAÇÃO
const OPERADORA_ID = 'op1770078943084';
const CLINICA_ID = 'c1770079554106';
const DRY_RUN = process.argv.includes('--dry');

const BASE_DIR = path.join(__dirname, '..', '..', 'uploads', OPERADORA_ID, CLINICA_ID);

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  MIGRAÇÃO DE EXTRAS → DOCUMENTOS v2 (RECURSIVO)            ║`);
console.log(`║  ${DRY_RUN ? '🔍 MODO DRY-RUN — nada será copiado!' : '🚀 MODO EXECUÇÃO — vai copiar e registrar!'}             ║`);
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Operadora: ${OPERADORA_ID}`);
console.log(`║  Clínica:   ${CLINICA_ID}`);
console.log(`║  Base:      ${BASE_DIR}`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

if (!fs.existsSync(BASE_DIR)) {
  console.error(`❌ Diretório não encontrado: ${BASE_DIR}`);
  process.exit(1);
}

// Extensões aceitas (bem ampla)
const EXTENSOES_VALIDAS = new Set([
'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg',
'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods',
'.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp',
'.mp3', '.ogg', '.wav', '.aac',
'.txt', '.csv', '.rtf']
);

const MIME_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.tiff': 'image/tiff', '.tif': 'image/tiff', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac',
  '.txt': 'text/plain', '.csv': 'text/csv', '.rtf': 'application/rtf'
};

// Conecta ao banco
const db = getClinicaDB(CLINICA_ID);

// Garante tabela
if (!DRY_RUN) {
  db.run(`
    CREATE TABLE IF NOT EXISTS documentos (
      id VARCHAR(100) PRIMARY KEY,
      pacienteId VARCHAR(100) NOT NULL,
      nome VARCHAR(500) NOT NULL,
      nomeOriginal VARCHAR(500),
      tipo VARCHAR(100),
      categoria VARCHAR(50),
      caminho VARCHAR(1000),
      url VARCHAR(1000),
      tamanho INT,
      observacoes TEXT,
      criadoPor VARCHAR(100),
      criadoEm VARCHAR(50)
    )
  `);
}

// ⭐ BUSCA RECURSIVA — encontra TODOS os arquivos em qualquer profundidade
function encontrarArquivosRecursivo(dir, baseDir) {
  const resultados = [];

  let items;
  try {
    items = fs.readdirSync(dir);
  } catch (err) {
    console.warn(`   ⚠️ Não conseguiu ler: ${dir} — ${err.message}`);
    return resultados;
  }

  for (const item of items) {
    const fullPath = path.join(dir, item);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Ignora a pasta "documentos" (é o destino!)
      if (item === 'documentos') continue;
      // Recursa
      resultados.push(...encontrarArquivosRecursivo(fullPath, baseDir));
    } else if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      if (EXTENSOES_VALIDAS.has(ext)) {
        // Caminho relativo à pasta do paciente
        const relPath = path.relative(baseDir, fullPath);
        resultados.push({
          fullPath,
          relPath, // ex: "2024/03/foto.jpg" ou "exames/raio_x.png" ou "foto.jpg"
          fileName: item,
          ext,
          size: stat.size
        });
      }
    }
  }

  return resultados;
}

// Tenta extrair ano/mês do caminho relativo
function extrairDataDoCaminho(relPath) {
  // Tenta padrão: 2024/03/arquivo.jpg ou 2024/3/arquivo.jpg
  const match = relPath.match(/^(\d{4})[\/\\](\d{1,2})[\/\\]/);
  if (match) {
    return { ano: match[1], mes: match[2].padStart(2, '0') };
  }
  // Tenta padrão: 2024/arquivo.jpg (só ano)
  const matchAno = relPath.match(/^(\d{4})[\/\\]/);
  if (matchAno) {
    return { ano: matchAno[1], mes: '01' };
  }
  // Sem data detectável
  return { ano: new Date().getFullYear().toString(), mes: (new Date().getMonth() + 1).toString().padStart(2, '0') };
}

// Gera nome único para o destino
function gerarNomeDestino(relPath, fileName) {
  // Substitui separadores de path por hífens para manter referência
  const pathParts = relPath.split(/[\/\\]/);
  if (pathParts.length > 1) {
    // Remove o nome do arquivo do path
    const dirs = pathParts.slice(0, -1).join('-');
    return `${dirs}_${fileName}`;
  }
  return fileName;
}

async function migrar() {
  const pacientes = fs.readdirSync(BASE_DIR).filter((f) => {
    try {
      const fullPath = path.join(BASE_DIR, f);
      return fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });

  console.log(`📋 Encontradas ${pacientes.length} pastas de pacientes`);
  console.log('');

  let totalCopiados = 0;
  let totalJaExiste = 0;
  let totalErros = 0;
  let totalIgnorados = 0;
  let pacientesComArquivos = 0;

  for (const pacienteId of pacientes) {
    const pacienteDir = path.join(BASE_DIR, pacienteId);

    // Encontra TODOS os arquivos recursivamente (exceto os que já estão em /documentos/)
    const arquivos = encontrarArquivosRecursivo(pacienteDir, pacienteDir);

    if (arquivos.length === 0) continue;

    pacientesComArquivos++;
    const docDir = path.join(pacienteDir, 'documentos');

    console.log(`👤 ${pacienteId}: ${arquivos.length} arquivos encontrados`);

    if (!DRY_RUN && !fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }

    let pacienteCopiados = 0;
    let pacienteExiste = 0;

    for (const arq of arquivos) {
      const novoNome = gerarNomeDestino(arq.relPath, arq.fileName);
      const caminhoDestino = path.join(docDir, novoNome);

      // Já existe no destino?
      if (fs.existsSync(caminhoDestino)) {
        totalJaExiste++;
        pacienteExiste++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`   📄 ${arq.relPath} → documentos/${novoNome} (${(arq.size / 1024).toFixed(1)} KB)`);
        totalCopiados++;
        pacienteCopiados++;
        continue;
      }

      // EXECUÇÃO REAL
      try {
        fs.copyFileSync(arq.fullPath, caminhoDestino);

        const { ano, mes } = extrairDataDoCaminho(arq.relPath);
        const mimeType = MIME_TYPES[arq.ext] || 'application/octet-stream';
        const caminhoRelativo = `/uploads/${OPERADORA_ID}/${CLINICA_ID}/${pacienteId}/documentos/${novoNome}`;
        const criadoEm = `${ano}-${mes}-15T12:00:00.000Z`;
        const id = `doc_mig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await new Promise((resolve) => {
          db.run(
            `INSERT INTO documentos (id, pacienteId, nome, nomeOriginal, tipo, categoria, caminho, tamanho, observacoes, criadoEm)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, pacienteId, novoNome, arq.fileName, mimeType, 'imagens', caminhoRelativo, arq.size, `Migrado de: ${arq.relPath}`, criadoEm],
            (err) => {
              if (err) {
                console.error(`   ❌ DB: ${arq.fileName} — ${err.message}`);
                totalErros++;
              } else {
                totalCopiados++;
                pacienteCopiados++;
              }
              resolve();
            }
          );
        });

        // Pequeno delay para não sobrecarregar o MySQL
        if (pacienteCopiados % 50 === 0) {
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch (err) {
        console.error(`   ❌ Copiar: ${arq.fileName} — ${err.message}`);
        totalErros++;
      }
    }

    if (pacienteCopiados > 0 || pacienteExiste > 0) {
      const parts = [];
      if (pacienteCopiados > 0) parts.push(`${pacienteCopiados} ${DRY_RUN ? 'a migrar' : 'migrados'}`);
      if (pacienteExiste > 0) parts.push(`${pacienteExiste} já existiam`);
      console.log(`   → ${parts.join(', ')}`);
    }
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTADO ${DRY_RUN ? '(DRY-RUN — nada foi copiado!)' : ''}                          ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  👤 Pacientes com arquivos: ${pacientesComArquivos}`);
  console.log(`║  ✅ ${DRY_RUN ? 'A migrar' : 'Copiados e registrados'}: ${totalCopiados}`);
  console.log(`║  ⏭️  Já existiam:           ${totalJaExiste}`);
  console.log(`║  ❌ Erros:                  ${totalErros}`);
  console.log(`║  📊 Total:                  ${totalCopiados + totalJaExiste + totalErros}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (DRY_RUN) {
    console.log('');
    console.log('💡 Para executar de verdade, rode: node migrate-extras.js');
  }

  setTimeout(() => process.exit(0), 2000);
}

migrar().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});