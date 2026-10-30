/**
 * Guarda no navegador (IndexedDB) a música escolhida para a apresentação,
 * para não precisar escolher o arquivo de novo a cada visita.
 */
const BANCO = 'easyclin-video-demo';
const LOJA = 'musica';
const CHAVE = 'atual';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const req = acao(db.transaction(LOJA, modo).objectStore(LOJA));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function salvarMusica(arquivo: File): Promise<void> {
  await operar('readwrite', (l) => l.put({ nome: arquivo.name, blob: arquivo }, CHAVE));
}

export async function lerMusica(): Promise<{nome: string;blob: Blob;} | null> {
  try {
    return (await operar<{nome: string;blob: Blob;} | undefined>('readonly', (l) => l.get(CHAVE))) || null;
  } catch {
    return null;
  }
}

export async function apagarMusica(): Promise<void> {
  try {
    await operar('readwrite', (l) => l.delete(CHAVE));
  } catch {

    // nada guardado
  }}