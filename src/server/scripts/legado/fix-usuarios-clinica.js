/**
 * Script para corrigir usuários importados sem clinicaId/operadoraId CORRETOS
 * 
 * O problema: Os usuários foram importados com IDs fictícios que não existem no banco
 * 
 * Uso: node fix-usuarios-clinica.js [clinicaId] [operadoraId]
 * Exemplo: node fix-usuarios-clinica.js c1769797297253 op1769796808952
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conecta ao banco SQLite
const dbPath = path.join(__dirname, '..', '..', 'data', 'principal.db');
const db = new sqlite3.Database(dbPath);

// IDs passados como argumento (opcional)
const CLINICA_ID_DESTINO = process.argv[2] || null;
const OPERADORA_ID_DESTINO = process.argv[3] || null;

// Função para executar query no SQLite com Promise
function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);else
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);else
      resolve(row);
    });
  });
}

function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);else
      resolve(rows);
    });
  });
}

async function diagnosticarECorrigir() {
  console.log('🔍 DIAGNÓSTICO E CORREÇÃO DE USUÁRIOS\n');
  console.log('═'.repeat(80));

  try {
    // 1. Lista todas as operadoras REAIS
    console.log('\n📋 OPERADORAS NO SISTEMA:');
    const operadoras = await sqliteAll('SELECT id, nome, cnpj FROM operadoras');
    if (operadoras.length === 0) {
      console.log('   ⚠️  Nenhuma operadora encontrada!');
      return;
    }
    operadoras.forEach((op) => {
      console.log(`   ✅ ${op.id}: ${op.nome}`);
    });

    // 2. Lista todas as clínicas REAIS
    console.log('\n📋 CLÍNICAS NO SISTEMA:');
    const clinicas = await sqliteAll('SELECT id, nome, operadoraId FROM clinicas');
    if (clinicas.length === 0) {
      console.log('   ⚠️  Nenhuma clínica encontrada!');
      return;
    }
    clinicas.forEach((c) => {
      console.log(`   ✅ ${c.id}: ${c.nome} (Operadora: ${c.operadoraId})`);
    });

    // 3. Identifica usuários com IDs inválidos
    console.log('\n🔍 IDENTIFICANDO USUÁRIOS COM IDs INVÁLIDOS...');

    const todosUsuarios = await sqliteAll('SELECT * FROM usuarios');
    const operadoraIds = operadoras.map((o) => o.id);
    const clinicaIds = clinicas.map((c) => c.id);

    const usuariosComProblema = todosUsuarios.filter((u) => {
      // Verifica se operadoraId existe
      const operadoraValida = !u.operadoraId || operadoraIds.includes(u.operadoraId);
      // Verifica se clinicaId existe
      const clinicaValida = !u.clinicaId || clinicaIds.includes(u.clinicaId);

      return !operadoraValida || !clinicaValida;
    });

    console.log(`\n   Total de usuários: ${todosUsuarios.length}`);
    console.log(`   Usuários com IDs inválidos: ${usuariosComProblema.length}`);

    if (usuariosComProblema.length === 0) {
      console.log('\n   ✅ Todos os usuários estão com IDs válidos!');

      // Mostra resumo por clínica
      console.log('\n📊 USUÁRIOS POR CLÍNICA:');
      for (const clinica of clinicas) {
        const count = todosUsuarios.filter((u) => u.clinicaId === clinica.id).length;
        console.log(`   ${clinica.nome}: ${count} usuários`);
      }
      return;
    }

    // 4. Mostra usuários com problema
    console.log('\n⚠️  USUÁRIOS COM IDs INVÁLIDOS:');
    usuariosComProblema.forEach((u) => {
      const opStatus = operadoraIds.includes(u.operadoraId) ? '✅' : '❌';
      const clStatus = clinicaIds.includes(u.clinicaId) ? '✅' : '❌';
      console.log(`   - ${u.nome} (${u.email})`);
      console.log(`     ${opStatus} operadoraId: ${u.operadoraId || 'NULL'}`);
      console.log(`     ${clStatus} clinicaId: ${u.clinicaId || 'NULL'}`);
    });

    // 5. Determina IDs de destino
    let clinicaDestino = CLINICA_ID_DESTINO;
    let operadoraDestino = OPERADORA_ID_DESTINO;

    // Se não foi passado, tenta encontrar a clínica Fortaleza
    if (!clinicaDestino) {
      const fortaleza = clinicas.find((c) =>
      c.nome.toLowerCase().includes('fortaleza')
      );

      if (fortaleza) {
        clinicaDestino = fortaleza.id;
        operadoraDestino = fortaleza.operadoraId;
        console.log(`\n✅ Clínica Fortaleza encontrada: ${fortaleza.id}`);
      } else {
        // Usa a primeira clínica disponível
        clinicaDestino = clinicas[0].id;
        operadoraDestino = clinicas[0].operadoraId;
        console.log(`\n⚠️  Usando primeira clínica disponível: ${clinicas[0].nome}`);
      }
    }

    // Se operadora não foi definida, pega da clínica
    if (!operadoraDestino) {
      const clinica = clinicas.find((c) => c.id === clinicaDestino);
      operadoraDestino = clinica?.operadoraId || operadoras[0].id;
    }

    console.log(`\n🎯 DESTINO DA CORREÇÃO:`);
    console.log(`   Clínica: ${clinicaDestino}`);
    console.log(`   Operadora: ${operadoraDestino}`);

    // 6. Corrige os usuários
    console.log('\n🔧 CORRIGINDO USUÁRIOS...\n');
    console.log('─'.repeat(80));

    let corrigidos = 0;

    for (const usuario of usuariosComProblema) {
      try {
        await sqliteRun(
          'UPDATE usuarios SET clinicaId = ?, operadoraId = ? WHERE id = ?',
          [clinicaDestino, operadoraDestino, usuario.id]
        );
        console.log(`✅ ${usuario.nome} → Clínica: ${clinicaDestino}, Operadora: ${operadoraDestino}`);
        corrigidos++;
      } catch (err) {
        console.log(`❌ Erro ao corrigir ${usuario.nome}: ${err.message}`);
      }
    }

    console.log('─'.repeat(80));
    console.log(`\n📊 RESULTADO: ${corrigidos} de ${usuariosComProblema.length} usuários corrigidos`);

    // 7. Mostra resultado final
    console.log('\n═'.repeat(80));
    console.log('\n📋 RESULTADO FINAL - USUÁRIOS POR CLÍNICA:\n');

    const usuariosAtualizados = await sqliteAll('SELECT * FROM usuarios ORDER BY nome');

    for (const clinica of clinicas) {
      const usuariosClinica = usuariosAtualizados.filter((u) => u.clinicaId === clinica.id);

      console.log(`🏥 ${clinica.nome} (${clinica.id}):`);
      if (usuariosClinica.length === 0) {
        console.log('   (nenhum usuário)');
      } else {
        usuariosClinica.forEach((u) => {
          console.log(`   - ${u.nome} (${u.email}) - ${u.tipo}`);
        });
      }
      console.log(`   Total: ${usuariosClinica.length}\n`);
    }

  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    console.error(err);
  } finally {
    db.close((err) => {
      if (err) console.error('Erro ao fechar banco:', err);else
      console.log('\n📁 Banco fechado.');
    });
  }
}

// Executa
diagnosticarECorrigir();