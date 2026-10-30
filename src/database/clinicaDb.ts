import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * BANCO DE DADOS POR CLÍNICA
 * Cada clínica tem seu próprio banco: clinica-{clinicaId}.db
 * Contém dados específicos da clínica:
 * - Pacientes
 * - Dependentes
 * - Consultas
 * - Prontuários
 * - Agendas Profissionais
 * - Configurações da Clínica
 */

interface ClinicaDB extends DBSchema {
  pacientes: {
    key: string;
    value: {
      id: string;
      nome: string;
      cpf: string;
      dataNascimento: string;
      telefone: string;
      email: string;
      endereco: string;
      criadoEm: string;
    };
    indexes: {
      'by-cpf': string;
    };
  };
  dependentes: {
    key: string;
    value: {
      id: string;
      pacienteId: string;
      nome: string;
      cpf: string;
      dataNascimento: string;
      parentesco: string;
      criadoEm: string;
    };
    indexes: {
      'by-paciente': string;
    };
  };
  consultas: {
    key: string;
    value: {
      id: string;
      pacienteId: string;
      pacienteNome: string;
      tipo: 'medica' | 'odontologica';
      data: string;
      horario: string;
      duracao: number;
      status: 'agendada' | 'confirmada' | 'realizada' | 'cancelada';
      profissional: string;
      observacoes: string;
      cor: string;
      lembreteEnviado: boolean;
    };
    indexes: {
      'by-data': string;
      'by-paciente': string;
      'by-profissional': string;
    };
  };
  prontuarios: {
    key: string;
    value: {
      id: string;
      pacienteId: string;
      data: string;
      tipo: string;
      descricao: string;
      profissional: string;
      criadoEm: string;
    };
    indexes: {
      'by-paciente': string;
    };
  };
  agendas: {
    key: string;
    value: {
      id: string;
      profissionalNome: string;
      especialidade: 'medico' | 'dentista';
      ativo: boolean;
      horarios: Array<{
        diaSemana: number;
        horaInicio: string;
        horaFim: string;
        intervaloInicio: string;
        intervaloFim: string;
        duracaoConsultaPadrao: number;
      }>;
      criadoEm: string;
    };
    indexes: {
      'by-profissional': string;
    };
  };
  configuracoes_clinica: {
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

// Cache de instâncias de banco por clínica
const clinicaDBInstances: Record<string, IDBPDatabase<ClinicaDB>> = {};
export async function getClinicaDB(clinicaId: string) {
  if (!clinicaId) {
    throw new Error('clinicaId é obrigatório');
  }
  if (clinicaDBInstances[clinicaId]) {
    return clinicaDBInstances[clinicaId];
  }
  const dbName = `clinica-${clinicaId}.db`;
  const db = await openDB<ClinicaDB>(dbName, 1, {
    upgrade(db) {
      console.log(`🔧 Criando banco da CLÍNICA ${clinicaId}...`);

      // Pacientes
      if (!db.objectStoreNames.contains('pacientes')) {
        const pacienteStore = db.createObjectStore('pacientes', {
          keyPath: 'id'
        });
        pacienteStore.createIndex('by-cpf', 'cpf');
      }

      // Dependentes
      if (!db.objectStoreNames.contains('dependentes')) {
        const dependenteStore = db.createObjectStore('dependentes', {
          keyPath: 'id'
        });
        dependenteStore.createIndex('by-paciente', 'pacienteId');
      }

      // Consultas
      if (!db.objectStoreNames.contains('consultas')) {
        const consultaStore = db.createObjectStore('consultas', {
          keyPath: 'id'
        });
        consultaStore.createIndex('by-data', 'data');
        consultaStore.createIndex('by-paciente', 'pacienteId');
        consultaStore.createIndex('by-profissional', 'profissional');
      }

      // Prontuários
      if (!db.objectStoreNames.contains('prontuarios')) {
        const prontuarioStore = db.createObjectStore('prontuarios', {
          keyPath: 'id'
        });
        prontuarioStore.createIndex('by-paciente', 'pacienteId');
      }

      // Agendas
      if (!db.objectStoreNames.contains('agendas')) {
        const agendaStore = db.createObjectStore('agendas', {
          keyPath: 'id'
        });
        agendaStore.createIndex('by-profissional', 'profissionalNome');
      }

      // Configurações da Clínica
      if (!db.objectStoreNames.contains('configuracoes_clinica')) {
        const configStore = db.createObjectStore('configuracoes_clinica', {
          keyPath: 'id'
        });
        configStore.createIndex('by-chave', 'chave', {
          unique: true
        });
      }
      console.log(`✅ Banco da CLÍNICA ${clinicaId} criado!`);
    }
  });

  // Migra dados antigos se existirem
  await migrateOldData(db, clinicaId);

  // Popula dados mock se for a clínica c1
  if (clinicaId === 'c1') {
    await populateMockData(db);
  }
  clinicaDBInstances[clinicaId] = db;
  return db;
}
async function migrateOldData(db: IDBPDatabase<ClinicaDB>, clinicaId: string) {
  console.log(`🔄 Verificando migração de dados da clínica ${clinicaId}...`);

  // Migra do localStorage
  const migrations = [{
    key: 'pacientes',
    store: 'pacientes' as const
  }, {
    key: 'consultas',
    store: 'consultas' as const
  }, {
    key: 'agendas_profissionais',
    store: 'agendas' as const
  }];
  for (const {
    key,
    store
  } of migrations) {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Filtra apenas dados desta clínica
        const clinicaData = data.filter((item: any) => item.clinicaId === clinicaId || !item.clinicaId);
        if (clinicaData.length > 0) {
          const tx = db.transaction(store, 'readwrite');
          for (const item of clinicaData) {
            // Remove clinicaId do item (não é mais necessário)
            const {
              clinicaId: _,
              ...itemSemClinicaId
            } = item;
            await tx.store.put(itemSemClinicaId);
          }
          await tx.done;
          console.log(`✅ Migrado: ${key} (${clinicaData.length} registros da clínica ${clinicaId})`);
        }
      } catch (err) {
        console.error(`❌ Erro ao migrar ${key}:`, err);
      }
    }
  }

  // Migra do banco antigo "easyclin-agendas" se existir
  try {
    const oldDB = await openDB('easyclin-agendas', 1);
    if (oldDB.objectStoreNames.contains('agendas')) {
      const agendas = await oldDB.getAll('agendas');
      const clinicaAgendas = agendas.filter((a: any) => a.clinicaId === clinicaId);
      if (clinicaAgendas.length > 0) {
        const tx = db.transaction('agendas', 'readwrite');
        for (const agenda of clinicaAgendas) {
          const {
            clinicaId: _,
            ...agendaSemClinicaId
          } = agenda;
          await tx.store.put(agendaSemClinicaId);
        }
        await tx.done;
        console.log(`✅ Migrado agendas antigas (${clinicaAgendas.length} registros)`);
      }
    }
    oldDB.close();
  } catch (err) {


    // Banco antigo não existe, tudo bem
  }}
async function populateMockData(db: IDBPDatabase<ClinicaDB>) {
  // Verifica se já tem dados
  const pacientes = await db.getAll('pacientes');
  if (pacientes.length > 0) {
    console.log('ℹ️ Banco da clínica já possui dados');
    return;
  }
  console.log('🌱 Populando banco da CLÍNICA c1 com dados mock...');

  // Pacientes
  await db.put('pacientes', {
    id: 'p1',
    nome: 'João Silva',
    cpf: '123.456.789-00',
    dataNascimento: '1985-05-15',
    telefone: '(11) 98765-4321',
    email: 'joao@email.com',
    endereco: 'Rua das Flores, 123',
    criadoEm: '2024-01-01'
  });
  await db.put('pacientes', {
    id: 'p2',
    nome: 'Maria Santos',
    cpf: '987.654.321-00',
    dataNascimento: '1990-08-20',
    telefone: '(11) 98765-4322',
    email: 'maria@email.com',
    endereco: 'Av. Brasil, 456',
    criadoEm: '2024-01-01'
  });

  // Agenda Dra. Ana
  await db.put('agendas', {
    id: 'ag1',
    profissionalNome: 'Dra. Ana Costa',
    especialidade: 'medico',
    ativo: true,
    horarios: [{
      diaSemana: 1,
      horaInicio: '08:00',
      horaFim: '18:00',
      intervaloInicio: '12:00',
      intervaloFim: '13:00',
      duracaoConsultaPadrao: 30
    }, {
      diaSemana: 2,
      horaInicio: '08:00',
      horaFim: '18:00',
      intervaloInicio: '12:00',
      intervaloFim: '13:00',
      duracaoConsultaPadrao: 30
    }, {
      diaSemana: 3,
      horaInicio: '08:00',
      horaFim: '18:00',
      intervaloInicio: '12:00',
      intervaloFim: '13:00',
      duracaoConsultaPadrao: 30
    }],
    criadoEm: '2024-01-01'
  });

  // Configuração WhatsApp
  await db.put('configuracoes_clinica', {
    id: 'config-whatsapp',
    chave: 'whatsapp',
    valor: {
      ativo: false,
      provider: 'session',
      serverUrl: '',
      sessionName: '',
      horasAntecedencia: 24,
      mensagemTemplate: '',
      enviarConfirmacao: true
    },
    atualizadoEm: new Date().toISOString()
  });
  console.log('✅ Dados mock da clínica c1 populados!');
}

// Export CRUD helpers
export const clinicaDb = {
  async get<K extends keyof ClinicaDB>(clinicaId: string, store: K, key: string) {
    const db = await getClinicaDB(clinicaId);
    return db.get(store, key);
  },
  async getAll<K extends keyof ClinicaDB>(clinicaId: string, store: K) {
    const db = await getClinicaDB(clinicaId);
    return db.getAll(store);
  },
  async getAllFromIndex<K extends keyof ClinicaDB>(clinicaId: string, store: K, indexName: string, query: any) {
    const db = await getClinicaDB(clinicaId);
    return db.getAllFromIndex(store, indexName as any, query);
  },
  async put<K extends keyof ClinicaDB>(clinicaId: string, store: K, value: ClinicaDB[K]['value']) {
    const db = await getClinicaDB(clinicaId);
    return db.put(store, value);
  },
  async delete<K extends keyof ClinicaDB>(clinicaId: string, store: K, key: string) {
    const db = await getClinicaDB(clinicaId);
    return db.delete(store, key);
  },
  async clear<K extends keyof ClinicaDB>(clinicaId: string, store: K) {
    const db = await getClinicaDB(clinicaId);
    return db.clear(store);
  }
};