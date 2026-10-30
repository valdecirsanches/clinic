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
 * Uso: node migrate-usuarios-mysql.js
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
const CLINICA_DESTINO_ID = process.argv[2] || null;
const OPERADORA_DESTINO_ID = process.argv[3] || 'op1';

// Conecta ao banco SQLite
const dbPath = path.join(__dirname, '..', '..', 'data', 'principal.db');
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

// Mapeia tipos de usuário do MySQL para o novo sistema
function mapearTipoUsuario(tipoMysql, funcao) {
  // Ajuste conforme a estrutura do seu banco MySQL
  const tipoLower = (tipoMysql || '').toLowerCase();
  const funcaoLower = (funcao || '').toLowerCase();

  if (tipoLower.includes('admin') || tipoLower === 'administrador') {
    return 'admin';
  }
  if (tipoLower.includes('medico') || tipoLower === 'médico' || funcaoLower.includes('medico')) {
    return 'medico';
  }
  if (tipoLower.includes('dentista') || funcaoLower.includes('dentista')) {
    return 'dentista';
  }
  if (tipoLower.includes('atendente') || tipoLower.includes('recepcion') || funcaoLower.includes('atendente')) {
    return 'atendente';
  }

  // Default
  return 'atendente';
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

async function buscarClinicaFortaleza() {
  // Busca a clínica Fortaleza no SQLite
  const clinicas = await sqliteAll("SELECT * FROM clinicas WHERE nome LIKE '%Fortaleza%' OR nome LIKE '%fortaleza%'");

  if (clinicas.length > 0) {
    console.log('✅ Clínica Fortaleza encontrada:', clinicas[0].id, '-', clinicas[0].nome);
    return clinicas[0];
  }

  // Lista todas as clínicas disponíveis
  const todasClinicas = await sqliteAll("SELECT id, nome FROM clinicas");
  console.log('\n📋 Clínicas disponíveis no sistema:');
  todasClinicas.forEach((c) => console.log(`   - ${c.id}: ${c.nome}`));

  return null;
}

async function migrarUsuarios() {
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

    if (!clinicaDestinoId) {
      const clinicaFortaleza = await buscarClinicaFortaleza();
      if (clinicaFortaleza) {
        clinicaDestinoId = clinicaFortaleza.id;
      } else {
        console.log('\n⚠️  Clínica Fortaleza não encontrada automaticamente.');
        console.log('   Use: node migrate-usuarios-mysql.js <clinicaId> <operadoraId>');
        console.log('   Exemplo: node migrate-usuarios-mysql.js c_fortaleza op1\n');

        // Tenta usar a primeira clínica disponível
        const primeiraClinica = await sqliteGet("SELECT id, nome FROM clinicas LIMIT 1");
        if (primeiraClinica) {
          clinicaDestinoId = primeiraClinica.id;
          console.log(`   Usando clínica padrão: ${primeiraClinica.id} - ${primeiraClinica.nome}\n`);
        } else {
          throw new Error('Nenhuma clínica encontrada no sistema. Crie uma clínica primeiro.');
        }
      }
    }

    console.log(`🏥 Clínica destino: ${clinicaDestinoId}`);
    console.log(`🏢 Operadora destino: ${OPERADORA_DESTINO_ID}\n`);

    // 3. Busca usuários no MySQL
    console.log('🔍 Buscando usuários no MySQL...');
    console.log('   Filtro: id_operadora=1 AND status="ativo" AND id_clinica=112\n');

    // AJUSTE A QUERY CONFORME A ESTRUTURA DA SUA TABELA MYSQL
    // Campos comuns: id, nome, email, senha, tipo, cpf, telefone, data_nascimento, crm, uf
    const [usuarios] = await mysqlConn.execute(`
      SELECT 
        id,
        nome,
        email,
        senha,
        tipo,
        funcao,
        cpf,
        telefone,
        celular,
        data_nascimento,
        crm,
        uf_crm,
        status,
        data_cadastro
      FROM usuarios 
      WHERE id_operadora = 1 
        AND status = 'ativo' 
        AND id_clinica = 112
      ORDER BY nome
    `);

    console.log(`📊 Encontrados ${usuarios.length} usuários para migrar.\n`);

    if (usuarios.length === 0) {
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

    for (const usuario of usuarios) {
      try {
        // Verifica se email já existe
        const existente = await sqliteGet(
          'SELECT id, nome FROM usuarios WHERE email = ?',
          [usuario.email]
        );

        if (existente) {
          console.log(`⏭️  IGNORADO: ${usuario.nome} (${usuario.email}) - Email já existe (${existente.nome})`);
          ignorados++;
          continue;
        }

        // Mapeia o tipo de usuário
        const tipoUsuario = mapearTipoUsuario(usuario.tipo, usuario.funcao);

        // Gera ID único
        const novoId = `u_mysql_${usuario.id}_${Date.now()}`;

        // Prepara dados
        const dados = {
          id: novoId,
          nome: usuario.nome || 'Sem Nome',
          email: usuario.email || `usuario_${usuario.id}@importado.local`,
          senha: usuario.senha || '123456', // Senha padrão se não tiver
          tipo: tipoUsuario,
          operadoraId: OPERADORA_DESTINO_ID,
          clinicaId: clinicaDestinoId,
          ativo: 1,
          crm: usuario.crm || null,
          uf: usuario.uf_crm || null,
          cpf: formatarCPF(usuario.cpf),
          telefone: formatarTelefone(usuario.celular || usuario.telefone),
          dataNascimento: formatarData(usuario.data_nascimento),
          criadoEm: formatarData(usuario.data_cadastro) || new Date().toISOString().split('T')[0]
        };

        // Insere no SQLite
        await sqliteRun(`
          INSERT INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, crm, uf, cpf, telefone, dataNascimento, criadoEm)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
        dados.id,
        dados.nome,
        dados.email,
        dados.senha,
        dados.tipo,
        dados.operadoraId,
        dados.clinicaId,
        dados.ativo,
        dados.crm,
        dados.uf,
        dados.cpf,
        dados.telefone,
        dados.dataNascimento,
        dados.criadoEm]
        );

        console.log(`✅ IMPORTADO: ${dados.nome} (${dados.email}) - Tipo: ${dados.tipo}`);
        if (dados.crm) console.log(`   └─ CRM: ${dados.crm}/${dados.uf}`);

        importados++;

      } catch (err) {
        console.log(`❌ ERRO: ${usuario.nome} (${usuario.email}) - ${err.message}`);
        erros++;
      }
    }

    console.log('─'.repeat(80));
    console.log('\n📊 RESUMO DA MIGRAÇÃO:');
    console.log(`   ✅ Importados: ${importados}`);
    console.log(`   ⏭️  Ignorados (já existiam): ${ignorados}`);
    console.log(`   ❌ Erros: ${erros}`);
    console.log(`   📋 Total processados: ${usuarios.length}`);

    // 5. Lista usuários da clínica após migração
    console.log('\n📋 Usuários atuais na clínica destino:');
    const usuariosClinica = await sqliteAll(
      'SELECT id, nome, email, tipo, crm, uf FROM usuarios WHERE clinicaId = ?',
      [clinicaDestinoId]
    );

    usuariosClinica.forEach((u) => {
      const crm = u.crm ? ` | CRM: ${u.crm}/${u.uf}` : '';
      console.log(`   - ${u.nome} (${u.email}) - ${u.tipo}${crm}`);
    });

    console.log(`\n   Total: ${usuariosClinica.length} usuários\n`);

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
migrarUsuarios();