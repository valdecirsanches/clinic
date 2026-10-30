import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * BANCO DE DADOS PRINCIPAL (GLOBAL)
 * Contém dados compartilhados entre todas as clínicas:
 * - Operadoras
 * - Clínicas
 * - Usuários
 * - Configurações Globais
 */

interface MainDB extends DBSchema {
  operadoras: {
    key: string;
    value: {
      id: string;
      nome: string;
      cnpj: string;
      razaoSocial?: string;
      telefone: string;
      email: string;
      endereco: string;
      ativa: boolean;
      criadoEm: string;
    };
    indexes: {
      'by-cnpj': string;
    };
  };
  clinicas: {
    key: string;
    value: {
      id: string;
      operadoraId: string;
      nome: string;
      cnpj?: string;
      telefone: string;
      email: string;
      endereco: string;
      ativa: boolean;
      criadoEm: string;
    };
    indexes: {
      'by-operadora': string;
    };
  };
  usuarios: {
    key: string;
    value: {
      id: string;
      nome: string;
      email: string;
      senha: string;
      tipo: 'super_admin' | 'admin' | 'medico' | 'dentista' | 'atendente';
      operadoraId: string;
      clinicaId: string | null;
      ativo: boolean;
      criadoEm: string;
    };
    indexes: {
      'by-email': string;
      'by-operadora': string;
      'by-clinica': string;
    };
  };
  configuracoes_globais: {
    key: string;
    value: {
      id: string;
      chave: string;
      valor: any;
      atualizadoEm: string;
    };
    indexes: {
      'by-chave': string;
    };
  };
}
let dbInstance: IDBPDatabase<MainDB> | null = null;
export async function getMainDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<MainDB>('main.db', 1, {
    upgrade(db) {
      console.log('🔧 Criando banco PRINCIPAL (main.db)...');

      // Operadoras
      if (!db.objectStoreNames.contains('operadoras')) {
        const operadoraStore = db.createObjectStore('operadoras', {
          keyPath: 'id'
        });
        operadoraStore.createIndex('by-cnpj', 'cnpj', {
          unique: true
        });
      }

      // Clínicas
      if (!db.objectStoreNames.contains('clinicas')) {
        const clinicaStore = db.createObjectStore('clinicas', {
          keyPath: 'id'
        });
        clinicaStore.createIndex('by-operadora', 'operadoraId');
      }

      // Usuários
      if (!db.objectStoreNames.contains('usuarios')) {
        const usuarioStore = db.createObjectStore('usuarios', {
          keyPath: 'id'
        });
        usuarioStore.createIndex('by-email', 'email', {
          unique: true
        });
        usuarioStore.createIndex('by-operadora', 'operadoraId');
        usuarioStore.createIndex('by-clinica', 'clinicaId');
      }

      // Configurações Globais
      if (!db.objectStoreNames.contains('configuracoes_globais')) {
        const configStore = db.createObjectStore('configuracoes_globais', {
          keyPath: 'id'
        });
        configStore.createIndex('by-chave', 'chave', {
          unique: true
        });
      }
      console.log('✅ Banco PRINCIPAL criado!');
    }
  });

  // Migra dados antigos se existirem
  await migrateOldData(dbInstance);

  // Popula dados mock se vazio
  await populateMockData(dbInstance);
  return dbInstance;
}
async function migrateOldData(db: IDBPDatabase<MainDB>) {
  console.log('🔄 Verificando migração de dados antigos...');

  // Migra do localStorage
  const migrations = [{
    key: 'operadoras',
    store: 'operadoras' as const
  }, {
    key: 'clinicas',
    store: 'clinicas' as const
  }, {
    key: 'usuarios',
    store: 'usuarios' as const
  }];
  for (const {
    key,
    store
  } of migrations) {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const tx = db.transaction(store, 'readwrite');
        for (const item of data) {
          await tx.store.put(item);
        }
        await tx.done;
        console.log(`✅ Migrado: ${key} (${data.length} registros)`);
        localStorage.removeItem(key);
      } catch (err) {
        console.error(`❌ Erro ao migrar ${key}:`, err);
      }
    }
  }

  // Migra do banco antigo "easyclin-main" se existir
  try {
    const oldDB = await openDB('easyclin-main', 1);
    const stores = ['operadoras', 'clinicas', 'usuarios'] as const;
    for (const store of stores) {
      if (oldDB.objectStoreNames.contains(store)) {
        const items = await oldDB.getAll(store);
        if (items.length > 0) {
          const tx = db.transaction(store, 'readwrite');
          for (const item of items) {
            await tx.store.put(item);
          }
          await tx.done;
          console.log(`✅ Migrado do banco antigo: ${store} (${items.length} registros)`);
        }
      }
    }
    oldDB.close();
  } catch (err) {


    // Banco antigo não existe, tudo bem
  }}
async function populateMockData(db: IDBPDatabase<MainDB>) {
  // Verifica se já tem dados
  const usuarios = await db.getAll('usuarios');
  if (usuarios.length > 0) {
    console.log('ℹ️ Banco principal já possui dados');
    return;
  }
  console.log('🌱 Populando banco PRINCIPAL com dados mock...');

  // Operadora
  await db.put('operadoras', {
    id: 'op1',
    nome: 'Saúde Total',
    cnpj: '12.345.678/0001-90',
    razaoSocial: 'Saúde Total Ltda',
    telefone: '(11) 3456-7890',
    email: 'contato@saudetotal.com.br',
    endereco: 'Av. Paulista, 1000 - São Paulo, SP',
    ativa: true,
    criadoEm: '2024-01-01'
  });

  // Clínica
  await db.put('clinicas', {
    id: 'c1',
    operadoraId: 'op1',
    nome: 'Clínica Central',
    telefone: '(11) 3456-7891',
    email: 'central@saudetotal.com.br',
    endereco: 'Rua Augusta, 500 - São Paulo, SP',
    ativa: true,
    criadoEm: '2024-01-01'
  });

  // Usuários
  const usuarios_mock = [{
    id: 'u1',
    nome: 'Admin Sistema',
    email: 'admin@easyclin.com',
    senha: 'admin123',
    tipo: 'super_admin' as const,
    operadoraId: 'op1',
    clinicaId: null,
    ativo: true,
    criadoEm: '2024-01-01'
  }, {
    id: 'u2',
    nome: 'Dra. Ana Costa',
    email: 'ana@easyclin.com',
    senha: '123456',
    tipo: 'medico' as const,
    operadoraId: 'op1',
    clinicaId: 'c1',
    ativo: true,
    criadoEm: '2024-01-01'
  }, {
    id: 'u3',
    nome: 'Dr. Carlos Silva',
    email: 'carlos@easyclin.com',
    senha: '123456',
    tipo: 'dentista' as const,
    operadoraId: 'op1',
    clinicaId: 'c1',
    ativo: true,
    criadoEm: '2024-01-01'
  }];
  for (const usuario of usuarios_mock) {
    await db.put('usuarios', usuario);
  }
  console.log('✅ Dados mock do banco PRINCIPAL populados!');
}

// Export CRUD helpers
export const mainDb = {
  async get<K extends keyof MainDB>(store: K, key: string) {
    const db = await getMainDB();
    return db.get(store, key);
  },
  async getAll<K extends keyof MainDB>(store: K) {
    const db = await getMainDB();
    return db.getAll(store);
  },
  async getAllFromIndex<K extends keyof MainDB>(store: K, indexName: string, query: any) {
    const db = await getMainDB();
    return db.getAllFromIndex(store, indexName as any, query);
  },
  async put<K extends keyof MainDB>(store: K, value: MainDB[K]['value']) {
    const db = await getMainDB();
    return db.put(store, value);
  },
  async delete<K extends keyof MainDB>(store: K, key: string) {
    const db = await getMainDB();
    return db.delete(store, key);
  },
  async clear<K extends keyof MainDB>(store: K) {
    const db = await getMainDB();
    return db.clear(store);
  }
};