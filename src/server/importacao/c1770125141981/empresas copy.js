/**
 * Script de Migração: Importar Usuários do MySQL para SQLite
 * 
 * Conexão MySQL:
 * - Host: localhost
 * - User: <usuario>
 * - Pass: ***
 * - DB: easyclin
 * 
 * Filtro: WHERE id_operadora=1 AND status='ativo' AND id_clinica=112
 * Destino: Clínica Fortaleza no SQLite
 * 
 * Uso: node migrate-empresas-mysql.js
 */
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// Configuração MySQL (origem)
const MYSQL_CONFIG = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'easyclin'
};
// ID da clínica destino no SQLite (Fortaleza)
// Você pode alterar este valor ou passar como argumento
const CLINICA_DESTINO_ID = 'c1770143706860';
const OPERADORA_DESTINO_ID = 'op1770048884167';

// Conecta ao banco SQLite
const dbPath = path.join(__dirname, '../easyclin-clinica-c1770143706860.db');
const dbSqlite = new sqlite3.Database(dbPath);
// Função para executar query no SQLite com Promise
function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.run(sql, params, function (err) {
      if (err) reject(err);else
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.get(sql, params, (err, row) => {
      if (err) reject(err);else
      resolve(row);
    });
  });
}
function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.all(sql, params, (err, rows) => {
      if (err) reject(err);else
      resolve(rows);
    });
  });
}

// Formata CPF
function formatarCPF(cpf) {
  if (!cpf) return null;
  const numeros = cpf.replace(/\D/g, '');
  if (numeros.length !== 11) return cpf;
  return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
// Formata telefone
function formatarTelefone(tel) {
  if (!tel) return null;
  const numeros = tel.replace(/\D/g, '');
  if (numeros.length === 11) {
    return numeros.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (numeros.length === 10) {
    return numeros.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return tel;
}
// Formata data para ISO
function formatarData(data) {
  if (!data) return null;
  if (data instanceof Date) {
    return data.toISOString().split('T')[0];
  }
  // Se já é string no formato correto
  if (typeof data === 'string' && data.match(/^\d{4}-\d{2}-\d{2}/)) {
    return data.split('T')[0];
  }
  return null;
}

async function migrarEmpresas() {
  console.log('🚀 Iniciando migração de usuários do MySQL para SQLite...\n');

  let mysqlConn;

  try {
    // 1. Conecta ao MySQL
    console.log('📡 Conectando ao MySQL...');
    console.log(`   Host: ${MYSQL_CONFIG.host}`);
    console.log(`   Database: ${MYSQL_CONFIG.database}`);

    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL!\n');

    // 2. Busca a clínica destino
    let clinicaDestinoId = CLINICA_DESTINO_ID;

    console.log(`🏥 Clínica destino: ${clinicaDestinoId}`);
    console.log(`🏢 Operadora destino: ${OPERADORA_DESTINO_ID}\n`);

    // 3. Busca usuários no MySQL
    console.log('🔍 Buscando usuários no MySQL...');
    console.log('   Filtro: id_operadora=1 AND status="ativo" AND id_clinica=112\n');

    // AJUSTE A QUERY CONFORME A ESTRUTURA DA SUA TABELA MYSQL
    // Campos comuns: id, nome, email, senha, tipo, cpf, telefone, data_nascimento, crm, uf
    const [empresas] = await mysqlConn.execute(`
       SELECT 
    e.id,
    e.razasoci as nome,
    e.cnpj,
    e.razasoci as razaoSocial,
    e.foneadm as telefone,
    e.emailadm or "123@123.com" as email,
    e.endeadm as endereco,
    e.contato,
    e.obs as observacoes,
    if(e.situacao='ATIVO', 1,0) as ativa,
    e.datainic as data_cadastro
FROM tb_empresas e
WHERE e.id_operadora = 2
ORDER BY e.id;
    `);

    console.log(`📊 Encontrados ${empresas.length} Empresas para migrar.\n`);

    if (empresas.length === 0) {
      console.log('⚠️  Nenhum usuário encontrado com os filtros especificados.');
      console.log('   Verifique se a query está correta para sua estrutura de banco.');
      return;
    }

    // 4. Processa cada usuário
    let importados = 0;
    let ignorados = 0;
    let erros = 0;

    console.log('📥 Importando usuários...\n');
    console.log('─'.repeat(80));

    for (const e of empresas) {
      try {
        // Verifica se email já existe
        const existente = await sqliteGet(
          'SELECT id, razaoSocial FROM empresas_conveniadas WHERE razaoSocial = ?',
          [e.razaoSocial]
        );

        if (existente) {
          console.log(`⏭️  IGNORADO: ${e.razaoSocial} (${e.telefone}) - Empresa já existe (${existente.razaoSocial})`);
          ignorados++;
          continue;
        }

        // Gera ID único
        const novoId = `u${Date.now()}`;

        // Prepara dados
        const dados = {
          id: e.id,
          nome: e.nome || 'Sem Nome',
          razaoSocial: e.nome || 'Sem Nome',
          cnpj: e.cnpj,
          telefone: e.telefone,
          endereco: e.endereco,
          email: e.email || `empresa${e.id}@importado.local`,
          contato: e.contato || null,
          observacoes: e.observacoes || null,
          ativa: e.ativa,
          desconto: 0.0,
          criadoEm: formatarData(e.data_cadastro) || new Date().toISOString().split('T')[0]
        };

        await sqliteRun(`
          INSERT INTO empresas_conveniadas (id, nome, cnpj, razaoSocial, telefone, email, endereco, contato, observacoes, ativa, desconto, criadoEm)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
        dados.id,
        dados.nome,
        dados.cnpj,
        dados.razaoSocial,
        dados.telefone,
        dados.email,
        dados.endereco,
        dados.contato,
        dados.observacoes,
        dados.ativa,
        dados.desconto,
        dados.criadoEm]
        );

        console.log(`✅ IMPORTADO: ${dados.nome} (${dados.email}) - Telefone: ${dados.telefone}`);
        // if (dados.crm) console.log(`   └─ CRM: ${dados.crm}/${dados.uf}`);

        importados++;

      } catch (err) {
        console.log(`❌ ERRO: ${e.nome} (${e.email}) - ${err.message}`);
        erros++;
      }
    }

    console.log('─'.repeat(80));
    console.log('\n📊 RESUMO DA MIGRAÇÃO:');
    console.log(`   ✅ Importados: ${importados}`);
    console.log(`   ⏭️  Ignorados (já existiam): ${ignorados}`);
    console.log(`   ❌ Erros: ${erros}`);
    console.log(`   📋 Total processados: ${empresas.length}`);

    // 5. Lista usuários da clínica após migração
    console.log('\n📋 Empresas atuais na clínica destino:');
    const emps = await sqliteAll('SELECT id, razaoSocial FROM empresas_conveniadas');

    // empresasClinica.forEach(u => {
    //   const crm = u.crm ? ` | CRM: ${u.crm}/${u.uf}` : '';
    //   console.log(`   - ${u.nome} (${u.email}) - ${u.tipo}${crm}`);
    // });

    console.log(`\n   Total: ${emps.length} empresas\n`);

  } catch (err) {
    console.error('\n❌ ERRO NA MIGRAÇÃO:', err.message);
    console.error(err);

    if (err.code === 'ECONNREFUSED') {
      console.log('\n💡 Dica: Verifique se o servidor MySQL está acessível.');
      console.log('   - Host: ' + MYSQL_CONFIG.host);
      console.log('   - Porta: 3306 (padrão)');
    }

    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Dica: Verifique as credenciais do MySQL.');
    }

  } finally {
    // Fecha conexões
    if (mysqlConn) {
      await mysqlConn.end();
      console.log('📡 Conexão MySQL fechada.');
    }

    dbSqlite.close((err) => {
      if (err) console.error('Erro ao fechar SQLite:', err);else
      console.log('📁 Conexão SQLite fechada.');
    });
  }
}
// Executa a migração
migrarEmpresas();