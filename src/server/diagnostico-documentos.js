
// ==================== DIAGNÓSTICO DE DOCUMENTOS ====================
// Verifica se os documentos de um paciente foram migrados corretamente
//
// USO: cd src/server && node diagnostico-documentos.js 3984
// ===================================================================

const fs = require('fs');
const path = require('path');
const { getClinicaDB } = require('./databaseClinica');

const OPERADORA_ID = 'op1770078943084';
const CLINICA_ID = 'c1770079554106';
const PACIENTE_ID = process.argv[2] || '3984';

const BASE_DIR = path.join(__dirname, 'uploads', OPERADORA_ID, CLINICA_ID);
const PACIENTE_DIR = path.join(BASE_DIR, PACIENTE_ID);

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          DIAGNÓSTICO DE DOCUMENTOS                         ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Paciente: ${PACIENTE_ID}`);
console.log(`║  Clínica:  ${CLINICA_ID}`);
console.log(`║  Base:     ${BASE_DIR}`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// ==================== 1. VERIFICAR ARQUIVOS NO DISCO ====================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📁 1. VERIFICANDO ARQUIVOS NO DISCO');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!fs.existsSync(PACIENTE_DIR)) {
  console.log(`❌ Pasta do paciente NÃO EXISTE: ${PACIENTE_DIR}`);

  // Tenta encontrar pastas parecidas
  console.log('\n🔍 Procurando pastas similares...');
  if (fs.existsSync(BASE_DIR)) {
    const pastas = fs.readdirSync(BASE_DIR);
    const similares = pastas.filter((p) => p.includes(PACIENTE_ID));
    if (similares.length > 0) {
      console.log(`   Encontradas: ${similares.join(', ')}`);
    } else {
      console.log(`   Nenhuma pasta contém "${PACIENTE_ID}"`);
      // Mostra as primeiras 20 pastas para referência
      console.log(`   Primeiras 20 pastas: ${pastas.slice(0, 20).join(', ')}`);
    }
  }
} else {
  console.log(`✅ Pasta existe: ${PACIENTE_DIR}`);

  // Lista TUDO recursivamente
  function listarRecursivo(dir, prefix = '') {
    const items = fs.readdirSync(dir);
    let total = 0;
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        console.log(`   ${prefix}📁 ${item}/`);
        total += listarRecursivo(fullPath, prefix + '  ');
      } else {
        const sizeKB = (stat.size / 1024).toFixed(1);
        console.log(`   ${prefix}📄 ${item} (${sizeKB} KB)`);
        total++;
      }
    }
    return total;
  }

  console.log('\n   Conteúdo da pasta:');
  const totalArquivos = listarRecursivo(PACIENTE_DIR);
  console.log(`\n   📊 Total de arquivos: ${totalArquivos}`);

  // Verifica pasta documentos especificamente
  const docDir = path.join(PACIENTE_DIR, 'documentos');
  if (fs.existsSync(docDir)) {
    const docsFiles = fs.readdirSync(docDir).filter((f) => fs.statSync(path.join(docDir, f)).isFile());
    console.log(`\n   📂 Pasta documentos/: ${docsFiles.length} arquivos`);
    if (docsFiles.length > 0) {
      docsFiles.slice(0, 5).forEach((f) => console.log(`      - ${f}`));
      if (docsFiles.length > 5) console.log(`      ... e mais ${docsFiles.length - 5}`);
    }
  } else {
    console.log(`\n   ⚠️ Pasta documentos/ NÃO EXISTE`);
  }
}

// ==================== 2. VERIFICAR REGISTROS NO BANCO ====================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🗄️  2. VERIFICANDO REGISTROS NO BANCO MySQL');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const db = getClinicaDB(CLINICA_ID);

// Busca exata
db.all('SELECT * FROM documentos WHERE pacienteId = ? ORDER BY criadoEm DESC', [PACIENTE_ID], (err, rows) => {
  if (err) {
    console.log(`❌ Erro ao consultar banco: ${err.message}`);

    // Verifica se a tabela existe
    db.all("SHOW TABLES LIKE 'documentos'", [], (err2, tables) => {
      if (err2) {
        console.log(`❌ Erro ao verificar tabela: ${err2.message}`);
      } else if (!tables || tables.length === 0) {
        console.log('❌ Tabela "documentos" NÃO EXISTE no banco!');
      }
      verificarBuscaAmpla();
    });
    return;
  }

  console.log(`\n   Busca exata (pacienteId = '${PACIENTE_ID}'): ${(rows || []).length} registros`);

  if (rows && rows.length > 0) {
    console.log('\n   Primeiros 5 registros:');
    rows.slice(0, 5).forEach((row, i) => {
      console.log(`   ${i + 1}. id: ${row.id}`);
      console.log(`      nome: ${row.nome}`);
      console.log(`      caminho: ${row.caminho}`);
      console.log(`      tipo: ${row.tipo}`);
      console.log(`      categoria: ${row.categoria}`);
      console.log(`      criadoEm: ${row.criadoEm}`);

      // Verifica se o arquivo físico existe
      if (row.caminho) {
        const filePath = path.join(__dirname, row.caminho);
        const existe = fs.existsSync(filePath);
        console.log(`      arquivo existe: ${existe ? '✅ SIM' : '❌ NÃO'} (${filePath})`);
      }
      console.log('');
    });
    if (rows.length > 5) {
      console.log(`   ... e mais ${rows.length - 5} registros`);
    }
  } else {
    console.log('   ⚠️ NENHUM registro encontrado com busca exata!');
  }

  verificarBuscaAmpla();
});

function verificarBuscaAmpla() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 3. BUSCA AMPLA NO BANCO (LIKE)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Busca com LIKE para encontrar variações do ID
  db.all('SELECT pacienteId, COUNT(*) as total FROM documentos WHERE pacienteId LIKE ? GROUP BY pacienteId', [`%${PACIENTE_ID}%`], (err, rows) => {
    if (err) {
      console.log(`❌ Erro: ${err.message}`);
    } else if (rows && rows.length > 0) {
      console.log(`   Encontrados pacienteIds contendo "${PACIENTE_ID}":`);
      rows.forEach((r) => console.log(`   - pacienteId="${r.pacienteId}" → ${r.total} documentos`));
    } else {
      console.log(`   Nenhum pacienteId contém "${PACIENTE_ID}"`);
    }

    verificarTotalBanco();
  });
}

function verificarTotalBanco() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 4. ESTATÍSTICAS GERAIS DO BANCO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  db.get('SELECT COUNT(*) as total FROM documentos', [], (err, row) => {
    if (err) {
      console.log(`❌ Erro: ${err.message}`);
    } else {
      console.log(`   Total de documentos no banco: ${row?.total || 0}`);
    }

    // Mostra os primeiros pacienteIds para comparar formato
    db.all('SELECT DISTINCT pacienteId FROM documentos LIMIT 20', [], (err, rows) => {
      if (err) {
        console.log(`❌ Erro: ${err.message}`);
      } else if (rows && rows.length > 0) {
        console.log(`\n   Primeiros pacienteIds no banco (para ver o formato):`);
        rows.forEach((r) => console.log(`   - "${r.pacienteId}"`));
      } else {
        console.log('   ⚠️ Tabela documentos está VAZIA!');
      }

      // Busca documentos com "mig" no id (os migrados)
      db.get('SELECT COUNT(*) as total FROM documentos WHERE id LIKE "doc_mig_%"', [], (err, row) => {
        if (err) {
          console.log(`\n❌ Erro ao contar migrados: ${err.message}`);
        } else {
          console.log(`\n   Documentos migrados (id começa com doc_mig_): ${row?.total || 0}`);
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Diagnóstico concluído');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        setTimeout(() => process.exit(0), 1000);
      });
    });
  });
}