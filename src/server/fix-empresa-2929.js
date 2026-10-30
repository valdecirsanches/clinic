// ==================== SCRIPT DE DIAGNÓSTICO E CORREÇÃO ====================
// Este script encontra e corrige pacientes com empresaConveniadaId inválido

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const clinicaId = 'c1766863485306'; // A clínica que está com problema

// Tenta encontrar o banco da clínica na pasta data/
const dataDir = path.join(__dirname, 'data');
let dbPath = path.join(dataDir, `easyclin-clinica-${clinicaId}.db`);

// Se não encontrar pelo nome antigo, tenta por CNPJ
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  try {
    const Database = require('better-sqlite3');
    const globalDb = new Database(path.join(__dirname, 'data', 'principal.db'));
    const clinica = globalDb.prepare('SELECT cnpj FROM clinicas WHERE id = ?').get(clinicaId);
    globalDb.close();
    if (clinica && clinica.cnpj) {
      const cnpjLimpo = clinica.cnpj.replace(/\D/g, '');
      dbPath = path.join(dataDir, `${cnpjLimpo}.db`);
    }
  } catch (e) {}
}

console.log('🔍 Conectando ao banco:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar:', err);
    process.exit(1);
  }
  console.log('✅ Conectado ao banco da clínica');
});

// Função principal
async function main() {
  try {
    // 1. Busca todas as empresas cadastradas
    const empresasCadastradas = await new Promise((resolve, reject) => {
      db.all('SELECT id, nome FROM empresas_conveniadas', [], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    const idsValidos = new Set(empresasCadastradas.map((e) => String(e.id)));
    console.log(`\n📊 ${empresasCadastradas.length} empresas cadastradas no sistema`);

    // 2. Busca todos os empresaConveniadaId usados por pacientes
    const empresasUsadas = await new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT empresaConveniadaId, COUNT(*) as qtd 
         FROM pacientes 
         WHERE empresaConveniadaId IS NOT NULL AND empresaConveniadaId != ''
         GROUP BY empresaConveniadaId`,
        [],
        (err, rows) => {
          if (err) reject(err);else
          resolve(rows || []);
        }
      );
    });

    // 3. Encontra IDs inválidos
    const idsInvalidos = empresasUsadas.
    filter((e) => !idsValidos.has(String(e.empresaConveniadaId))).
    map((e) => ({ id: e.empresaConveniadaId, qtdPacientes: e.qtd }));

    if (idsInvalidos.length === 0) {
      console.log('\n✅ Todos os IDs de empresa são válidos!');
      db.close();
      return;
    }

    console.log(`\n⚠️ Encontrados ${idsInvalidos.length} IDs de empresa INVÁLIDOS:`);
    idsInvalidos.forEach((e) => {
      console.log(`   - empresaConveniadaId: "${e.id}" (${e.qtdPacientes} pacientes)`);
    });

    // 4. Se --fix foi passado, corrige
    if (process.argv.includes('--fix')) {
      console.log('\n🔧 Corrigindo pacientes com empresaConveniadaId inválido...\n');

      for (const empresa of idsInvalidos) {
        // Lista pacientes afetados
        const pacientesAfetados = await new Promise((resolve, reject) => {
          db.all(
            `SELECT id, nome FROM pacientes WHERE empresaConveniadaId = ?`,
            [empresa.id],
            (err, rows) => {
              if (err) reject(err);else
              resolve(rows || []);
            }
          );
        });

        console.log(`   📋 Empresa "${empresa.id}" - ${pacientesAfetados.length} pacientes:`);
        pacientesAfetados.slice(0, 5).forEach((p) => {
          console.log(`      - ${p.nome} (${p.id})`);
        });
        if (pacientesAfetados.length > 5) {
          console.log(`      ... e mais ${pacientesAfetados.length - 5} pacientes`);
        }

        // Corrige
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE pacientes SET empresaConveniadaId = NULL, unidadeEmpresaId = NULL 
             WHERE empresaConveniadaId = ?`,
            [empresa.id],
            function (err) {
              if (err) reject(err);else
              {
                console.log(`   ✅ Corrigidos ${this.changes} pacientes (empresaConveniadaId = NULL)\n`);
                resolve();
              }
            }
          );
        });
      }

      console.log('✅ Correção concluída!');
      console.log('\n💡 IMPORTANTE: O ID "2929" que aparece nos logs pode estar no localStorage do navegador.');
      console.log('   Para limpar, abra o DevTools (F12) > Application > Local Storage > Limpar');
    } else {
      console.log('\n💡 Para corrigir automaticamente, execute:');
      console.log('   node fix-empresa-2929.js --fix\n');

      console.log('⚠️ NOTA: O ID "2929" que aparece nos logs do servidor pode estar:');
      console.log('   1. No localStorage do navegador (dados em cache)');
      console.log('   2. Em um paciente que foi editado mas não salvo');
      console.log('   3. Em outro banco de dados de outra clínica');
      console.log('\n   Tente limpar o localStorage do navegador (F12 > Application > Local Storage > Limpar)');
    }

    db.close();
  } catch (err) {
    console.error('❌ Erro:', err);
    db.close();
  }
}

main();