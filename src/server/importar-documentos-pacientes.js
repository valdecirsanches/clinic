// ==================== IMPORTAÇÃO DE DOCUMENTOS DOS PACIENTES ====================
// Percorre a pasta server/documentos/<pacienteId>/ (cada subpasta é o id do
// paciente), copia todos os arquivos para a estrutura de uploads do app e
// registra cada arquivo na tabela `documentos`.
//
// ESPECIALIDADE (a partir das subpastas):
//   - Arquivos dentro de uma subpasta (ex.: ODONTOLOGIA/, PEDIATRIA/,
//     GINECOLOGIA/) recebem a especialidade correspondente, normalizada com a
//     capitalização usada pelo app (Odontologia, Pediatria, Ginecologia, ...).
//   - Arquivos soltos na raiz da pasta do paciente (SEM subpasta) ficam SEM
//     especialidade e na categoria "outros" (grupo "Outros" da tela).
//
// ⭐ Este import refere-se APENAS ao banco easyclin_c1770125141981
//    (clinicaId = c1770125141981). É o valor padrão; ainda é possível
//    sobrescrever passando outro clinicaId como argumento, se necessário.
//
// USO:
//   node importar-documentos-pacientes.js [clinicaId] [operadoraId] [--dir=/caminho/origem] [--reimportar]
//
// EXEMPLO (padrão, banco easyclin_c1770125141981):
//   node importar-documentos-pacientes.js
//
// --reimportar: apaga TODOS os documentos com observacoes = 'Importado
//   automaticamente' (de uma execução anterior) antes de reprocessar, para
//   corrigir registros com URL de nuvem quebrada. Documentos enviados
//   manualmente pelo app NÃO são afetados. Ex.:
//     node importar-documentos-pacientes.js --reimportar
//
// Se o operadoraId não for informado, usa "geral" (mesmo fallback da rota
// POST /api/documentos). Se --dir não for informado, usa
// /home/sanches/temp/documento (local atual dos arquivos dos pacientes).
//
// NUVEM: cada arquivo é ENVIADO para https://nuvem.sky9.com.br (via
// services/cloudStorage.uploadFileToCloud) e a URL retornada é gravada na
// coluna `url` da tabela documentos — idêntico ao upload manual pelo app. O
// arquivo local (coluna `caminho`) permanece como fallback. Se a nuvem estiver
// indisponível, o documento ainda é importado com `url` nula (só local).
//
// O script é IDEMPOTENTE: pula arquivos que já foram importados para o mesmo
// paciente (mesmo nomeOriginal + tamanho), então pode ser re-executado com
// segurança.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { MYSQL_CONFIG, getClinicaDbName } = require('./config/mysql');
// ⭐ Envio para a nuvem (https://nuvem.sky9.com.br) — mesmo serviço usado pela
// rota POST /api/documentos, para que os documentos importados fiquem
// disponíveis na nuvem exatamente como os enviados manualmente.
const { uploadFileToCloud, CLOUD_BASE_URL } = require('./services/cloudStorage');

// fetch para VERIFICAR se a URL da nuvem realmente responde (node-fetch@2, mesmo
// padrão do serviço). Sem isso, gravaríamos uma URL quebrada que aparece como
// "Não foi possível carregar a imagem" na tela do paciente.
let fetch;
try {
  fetch = require('node-fetch');
} catch (e) {
  fetch = globalThis.fetch;
}

// Confere se a URL da nuvem devolve o arquivo (status 200 e não é uma página de
// erro). Retorna true só quando a imagem/arquivo está realmente acessível.
async function cloudUrlAcessivel(url) {
  try {
    const resp = await fetch(url, { method: 'GET', timeout: 20000 });
    if (!resp.ok) {
      console.log(`   ⚠️ Nuvem respondeu ${resp.status} para ${url}`);
      return false;
    }
    // Se a nuvem devolve HTML (página de erro) em vez do binário, rejeita.
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) {
      console.log(`   ⚠️ Nuvem devolveu HTML (provável erro) para ${url}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`   ⚠️ Falha ao verificar URL da nuvem: ${err.message}`);
    return false;
  }
}

// ---------- Argumentos ----------
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const posicionais = args.filter((a) => !a.startsWith('--'));

// ⭐ Banco alvo desta importação: easyclin_c1770125141981
const CLINICA_ID_PADRAO = 'c1770125141981';

const clinicaId = posicionais[0] || CLINICA_ID_PADRAO;
const operadoraId = posicionais[1] || 'geral';
// ⭐ Pasta de origem padrão: os arquivos dos pacientes agora ficam em
// /home/sanches/temp/documento (cada subpasta é o id do paciente). Ainda é
// possível apontar outra pasta com --dir=/outro/caminho.
const ORIGEM_PADRAO = '/home/sanches/temp/documento';
const dirFlag = flags.find((f) => f.startsWith('--dir='));
const origemBase = dirFlag ? dirFlag.replace('--dir=', '') : ORIGEM_PADRAO;

// --reimportar: apaga os documentos importados automaticamente antes de
// reprocessar (util para corrigir registros com URL de nuvem quebrada de uma
// execucao anterior). So remove linhas com observacoes = 'Importado
// automaticamente' — documentos enviados manualmente NUNCA sao tocados.
const reimportar = flags.includes('--reimportar');

// Diretório final de uploads (mesma estrutura usada por POST /api/documentos)
const uploadsDir = path.join(__dirname, 'uploads');

// ---------- MIME types por extensão (espelha documentos.js) ----------
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

// ⭐ Apenas extensões de documento/mídia reais são importadas. Arquivos como
// .ini, .db, .tmp, thumbnails e arquivos ocultos do sistema (config_*.ini,
// Thumbs.db, .DS_Store, desktop.ini) são LIXO — não são documentos do paciente
// e não abrem no visualizador do app, então os ignoramos.
const EXTENSOES_PERMITIDAS = new Set(Object.keys(mimeTypes));

function ehArquivoImportavel(nomeArquivo) {
  // Ignora arquivos ocultos/sistema (começam com ponto) e sidecars conhecidos.
  const base = nomeArquivo.toLowerCase();
  if (base.startsWith('.')) return false;
  if (base === 'thumbs.db' || base === 'desktop.ini') return false;
  const ext = path.extname(nomeArquivo).toLowerCase();
  return EXTENSOES_PERMITIDAS.has(ext);
}

// ---------- Normalização de especialidade (nome da subpasta) ----------
// Espelha os nomes de especialidade usados pelo app (DocumentosManager).
const ESPECIALIDADES_CONHECIDAS = {
  ODONTOLOGIA: 'Odontologia',
  PEDIATRIA: 'Pediatria',
  GINECOLOGIA: 'Ginecologia',
  ORTOPEDIA: 'Ortopedia',
  DERMATOLOGIA: 'Dermatologia',
  CARDIOLOGIA: 'Cardiologia',
  OFTALMOLOGIA: 'Oftalmologia',
  NEUROLOGIA: 'Neurologia',
  PSIQUIATRIA: 'Psiquiatria',
  UROLOGIA: 'Urologia',
  OTORRINOLARINGOLOGIA: 'Otorrinolaringologia',
  ENDOCRINOLOGIA: 'Endocrinologia',
  GASTROENTEROLOGIA: 'Gastroenterologia',
  PNEUMOLOGIA: 'Pneumologia',
  'CLINICO GERAL': 'Clínico Geral'
};

function normalizarEspecialidade(nomePasta) {
  const chave = nomePasta.
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toUpperCase().
  trim();
  if (ESPECIALIDADES_CONHECIDAS[chave]) return ESPECIALIDADES_CONHECIDAS[chave];
  // Fallback: Title Case (primeira letra maiúscula de cada palavra)
  return nomePasta.
  trim().
  toLowerCase().
  replace(/\b\w/g, (l) => l.toUpperCase());
}

// Lista arquivos recursivamente e determina a especialidade a partir da
// PRIMEIRA subpasta (relativa à pasta do paciente). Arquivos na raiz da pasta
// do paciente ficam sem especialidade (null).
// Retorna: [{ caminho, especialidade }]
function listarArquivos(dir, raizPaciente = dir, ignorados = { total: 0 }) {
  let resultados = [];
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      resultados = resultados.concat(
        listarArquivos(filePath, raizPaciente, ignorados)
      );
    } else {
      // ⭐ Pula arquivos que não são documentos reais (.ini, .db, ocultos, ...)
      if (!ehArquivoImportavel(file)) {
        ignorados.total++;
        continue;
      }
      // Caminho relativo à pasta do paciente (ex.: "ODONTOLOGIA/foto.png")
      const rel = path.relative(raizPaciente, filePath);
      const partes = rel.split(path.sep);
      // Se há subpasta, a primeira parte é a especialidade; senão, null.
      const especialidade =
      partes.length > 1 ? normalizarEspecialidade(partes[0]) : null;
      resultados.push({ caminho: filePath, especialidade });
    }
  }
  return resultados;
}

async function garantirTabela(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS documentos (
      id VARCHAR(255) PRIMARY KEY,
      pacienteId VARCHAR(255) NOT NULL,
      nome VARCHAR(500) NOT NULL,
      nomeOriginal VARCHAR(500),
      tipo VARCHAR(100),
      categoria VARCHAR(100),
      caminho TEXT,
      url TEXT,
      tamanho INTEGER,
      observacoes TEXT,
      criadoPor VARCHAR(255),
      especialidade VARCHAR(255),
      criadoEm VARCHAR(50)
    )
  `);
}

async function importar() {
  console.log('🚀 IMPORTAÇÃO DE DOCUMENTOS DOS PACIENTES\n');
  console.log(`   • clinicaId : ${clinicaId}`);
  console.log(`   • operadora : ${operadoraId}`);
  console.log(`   • origem    : ${origemBase}`);

  if (!fs.existsSync(origemBase)) {
    console.error(`❌ Pasta de origem não encontrada: ${origemBase}`);
    process.exit(1);
  }

  const dbName = getClinicaDbName(clinicaId);
  const conn = await mysql.createConnection({
    ...MYSQL_CONFIG,
    database: dbName
  });
  console.log(`   • banco     : ${dbName}\n`);

  await garantirTabela(conn);

  // ⭐ --reimportar: remove os documentos importados automaticamente (mantém os
  // enviados manualmente) para que os registros sejam recriados com a URL de
  // nuvem correta.
  if (reimportar) {
    const [res] = await conn.execute(
      `DELETE FROM documentos WHERE observacoes = 'Importado automaticamente'`
    );
    const removidos = res.affectedRows || 0;
    console.log(
      `🧹 --reimportar: ${removidos} documento(s) importados automaticamente foram removidos antes de reprocessar.\n`
    );
  }

  const pacientes = fs.
  readdirSync(origemBase).
  filter((nome) => fs.statSync(path.join(origemBase, nome)).isDirectory());

  console.log(`📊 ${pacientes.length} pasta(s) de paciente encontrada(s)\n`);

  let totalImportados = 0;
  let totalPulados = 0;
  let totalErros = 0;
  let totalNuvem = 0;
  let totalSemNuvem = 0;
  const ignorados = { total: 0 };

  for (const pacienteId of pacientes) {
    const pastaPaciente = path.join(origemBase, pacienteId);
    const arquivos = listarArquivos(pastaPaciente, pastaPaciente, ignorados);

    if (arquivos.length === 0) continue;

    console.log(
      `📁 Paciente ${pacienteId} — ${arquivos.length} arquivo(s)`
    );

    // Documentos já existentes para este paciente (para evitar duplicação)
    const [existentes] = await conn.execute(
      'SELECT nomeOriginal, tamanho FROM documentos WHERE pacienteId = ?',
      [pacienteId]
    );
    const jaImportados = new Set(
      existentes.map((d) => `${d.nomeOriginal}::${d.tamanho}`)
    );

    const destinoDir = path.join(
      uploadsDir,
      operadoraId,
      clinicaId,
      pacienteId,
      'documentos'
    );
    fs.mkdirSync(destinoDir, { recursive: true });

    for (const { caminho: arquivo, especialidade } of arquivos) {
      const nomeOriginal = path.basename(arquivo);
      const tamanho = fs.statSync(arquivo).size;

      if (jaImportados.has(`${nomeOriginal}::${tamanho}`)) {
        totalPulados++;
        console.log(`   ⏭️  Já existe: ${nomeOriginal}`);
        continue;
      }

      try {
        // Nome único no destino (evita colisão), preservando extensão
        const ext = path.extname(nomeOriginal);
        const nomeUnico = `${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${ext}`;
        const destinoArquivo = path.join(destinoDir, nomeUnico);

        fs.copyFileSync(arquivo, destinoArquivo);

        const caminho = `/uploads/${operadoraId}/${clinicaId}/${pacienteId}/documentos/${nomeUnico}`;
        const id = `doc_${Date.now()}_${Math.random().
        toString(36).
        substr(2, 9)}`;
        const criadoEm = new Date().toISOString();
        const mimetype = getMimeType(nomeOriginal);

        // ⭐⭐⭐ ENVIA PARA A NUVEM (https://nuvem.sky9.com.br) ⭐⭐⭐
        // Mesmo comportamento da rota POST /api/documentos: guarda a cloudUrl
        // na coluna `url`; o arquivo local (`caminho`) permanece como fallback.
        let cloudUrl = null;
        try {
          const cloudResult = await uploadFileToCloud(destinoArquivo, mimetype);
          if (cloudResult && cloudResult.cloudUrl) {
            // ⭐ VERIFICA que a URL realmente devolve o arquivo. Se a nuvem
            // aceitou o upload mas a URL de download não resolve (ex.: id/campo
            // errado), NÃO gravamos a URL quebrada — deixamos url=null e o app
            // usa o arquivo local como fallback, evitando o erro
            // "Não foi possível carregar a imagem".
            const ok = await cloudUrlAcessivel(cloudResult.cloudUrl);
            if (ok) {
              cloudUrl = cloudResult.cloudUrl;
            } else {
              console.log(
                `   ⚠️ Upload aceito mas URL não resolve — mantendo só local: ${cloudResult.cloudUrl}`
              );
            }
          }
        } catch (cloudErr) {
          console.log(`   ⚠️ Nuvem indisponível: ${cloudErr.message}`);
        }

        if (cloudUrl) {
          totalNuvem++;
        } else {
          totalSemNuvem++;
        }

        await conn.execute(
          `INSERT INTO documentos
             (id, pacienteId, nome, nomeOriginal, tipo, categoria, caminho, url, tamanho, observacoes, criadoPor, especialidade, criadoEm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
          id,
          pacienteId,
          nomeOriginal,
          nomeOriginal,
          mimetype,
          'outros',
          caminho,
          cloudUrl,
          tamanho,
          'Importado automaticamente',
          null,
          especialidade,
          criadoEm]

        );

        jaImportados.add(`${nomeOriginal}::${tamanho}`);
        totalImportados++;
        console.log(
          `   ✅ ${nomeOriginal}${especialidade ? ` [${especialidade}]` : ' [Outros]'}` +
          `${cloudUrl ? ' ☁️' : ' (local)'}`
        );
      } catch (err) {
        totalErros++;
        console.error(`   ❌ Erro em ${nomeOriginal}:`, err.message);
      }
    }
  }

  await conn.end();

  console.log('\n🏁 IMPORTAÇÃO FINALIZADA');
  console.log(`   • Importados      : ${totalImportados}`);
  console.log(`   • Enviados p/nuvem: ${totalNuvem} (${CLOUD_BASE_URL})`);
  console.log(`   • Só local        : ${totalSemNuvem} (nuvem falhou/indisp.)`);
  console.log(`   • Pulados         : ${totalPulados} (já existiam)`);
  console.log(`   • Ignorados (lixo): ${ignorados.total} (.ini/.db/ocultos)`);
  console.log(`   • Erros           : ${totalErros}`);
}

importar().catch((err) => {
  console.error('❌ Falha na importação:', err);
  process.exit(1);
});