import { db, initDatabase } from './db';
import { Paciente, Consulta, Usuario, Clinica, Prontuario } from '../types';

// Migrate data from localStorage to IndexedDB
export async function migrateFromLocalStorage() {
  await initDatabase();

  // Check if migration already done
  const migrationStatus = await db.get('config', 'migration_completed');
  if (migrationStatus) {
    console.log('Migration already completed');
    return;
  }
  console.log('Starting migration from localStorage to IndexedDB...');
  try {
    // Migrate patients
    const pacientes = localStorage.getItem('pacientes');
    if (pacientes) {
      const data: Paciente[] = JSON.parse(pacientes);
      for (const paciente of data) {
        await db.insert('patients', paciente);
      }
      console.log(`Migrated ${data.length} patients`);
    }

    // Migrate appointments
    const consultas = localStorage.getItem('consultas');
    if (consultas) {
      const data: Consulta[] = JSON.parse(consultas);
      for (const consulta of data) {
        await db.insert('appointments', consulta);
      }
      console.log(`Migrated ${data.length} appointments`);
    }

    // Migrate users
    const usuarios = localStorage.getItem('usuarios');
    if (usuarios) {
      const data: Usuario[] = JSON.parse(usuarios);
      for (const usuario of data) {
        await db.insert('users', usuario);
      }
      console.log(`Migrated ${data.length} users`);
    }

    // Migrate clinics
    const clinicas = localStorage.getItem('clinicas');
    if (clinicas) {
      const data: Clinica[] = JSON.parse(clinicas);
      for (const clinica of data) {
        await db.insert('clinics', clinica);
      }
      console.log(`Migrated ${data.length} clinics`);
    }

    // Migrate medical records
    const prontuarios = localStorage.getItem('prontuarios');
    if (prontuarios) {
      const data: Prontuario[] = JSON.parse(prontuarios);
      for (const prontuario of data) {
        await db.insert('medical_records', prontuario);
      }
      console.log(`Migrated ${data.length} medical records`);
    }

    // Mark migration as complete
    await db.insert('config', {
      key: 'migration_completed',
      value: true,
      timestamp: new Date().toISOString()
    });
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}