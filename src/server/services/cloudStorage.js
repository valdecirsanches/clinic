
// ==================== CLOUD STORAGE - nuvem.sky9.com.br ====================
// Integração com serviço de armazenamento em nuvem
// Upload: POST /upload com campo "imagem"
// Download: GET /download/{id}

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const CLOUD_BASE_URL = process.env.CLOUD_STORAGE_URL || 'https://cloud-storage.x-star.com.br';

// ⭐ Usa node-fetch@2 (CommonJS) — mesmo padrão do whatsapp-shared
let fetch;
try {
  fetch = require('node-fetch');
} catch (e) {
  fetch = globalThis.fetch;
}

/**
 * Upload de um Buffer para a nuvem
 * @param {Buffer} buffer - Conteúdo do arquivo
 * @param {string} fileName - Nome do arquivo (ex: "doc_whatsapp_123.webp")
 * @param {string} mimetype - MIME type (ex: "image/webp")
 * @returns {Promise<{cloudId: string, cloudUrl: string} | null>}
 */
// ⭐ Faz uma tentativa de upload usando um nome de campo específico do multipart.
// A API da nuvem já foi documentada com o campo "imagem", mas versões antigas
// deste serviço enviavam "file". Tentamos ambos para garantir compatibilidade.
async function tentarUpload(buffer, fileName, mimetype, fieldName) {
  const form = new FormData();
  form.append(fieldName, buffer, {
    filename: fileName,
    contentType: mimetype || 'application/octet-stream'
  });

  const response = await fetch(`${CLOUD_BASE_URL}/upload`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders ? form.getHeaders() : {},
    timeout: 30000
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `☁️ ❌ [CloudStorage] Campo "${fieldName}" → HTTP ${response.status}: ${errorText}`
    );
    return null;
  }

  // A resposta pode ser JSON ({ id/url/... }) ou texto puro (o id/url).
  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch (e) {
    result = raw; // resposta em texto puro
  }
  console.log(
    `☁️ ✅ [CloudStorage] Campo "${fieldName}" aceito:`,
    typeof result === 'string' ? result : JSON.stringify(result)
  );

  // ⭐ Se a API já devolve uma URL completa, usamos ela diretamente.
  const urlDireta =
  result && (result.url || result.downloadUrl || result.link) || (
  typeof result === 'string' && /^https?:\/\//.test(result.trim()) ?
  result.trim() :
  null);
  if (urlDireta) {
    console.log(`☁️ ✅ [CloudStorage] URL (direta da API): ${urlDireta}`);
    return { cloudId: urlDireta, cloudUrl: urlDireta };
  }

  // Caso contrário, extrai o ID e monta /download/{id}.
  const cloudId =
  result && (
  result.id || result.fileId || result.filename || result.name) || (
  typeof result === 'string' ? result.trim() : null);

  if (!cloudId) {
    console.error(
      `☁️ ❌ [CloudStorage] Campo "${fieldName}" sem ID/URL na resposta`
    );
    return null;
  }

  const cloudUrl = `${CLOUD_BASE_URL}/download/${cloudId}`;
  console.log(`☁️ ✅ [CloudStorage] URL: ${cloudUrl}`);
  return { cloudId, cloudUrl };
}

// ⭐ Lembra qual campo do multipart a API aceitou por último. A nuvem sky9 tem
// se comportado de forma inconsistente: o campo "imagem" (contrato documentado)
// às vezes devolve HTTP 500 e só "file" funciona. Depois que descobrimos o
// campo certo, o usamos PRIMEIRO nas próximas chamadas — assim evitamos o
// round-trip que falha (e o log de erro vermelho) em cada arquivo importado.
let campoPreferido = 'imagem';
const CAMPOS = ['imagem', 'file'];

async function uploadToCloud(buffer, fileName, mimetype) {
  try {
    console.log(`☁️ [CloudStorage] Enviando para nuvem: ${fileName} (${buffer.length} bytes)`);

    // Ordena os campos com o último que funcionou primeiro (evita o 500 repetido).
    const ordem = [campoPreferido, ...CAMPOS.filter((c) => c !== campoPreferido)];

    for (let i = 0; i < ordem.length; i++) {
      const campo = ordem[i];
      if (i > 0) {
        console.log(`☁️ [CloudStorage] Reenviando com campo "${campo}"...`);
      }
      const resultado = await tentarUpload(buffer, fileName, mimetype, campo);
      if (resultado) {
        // Memoriza o campo vencedor para as próximas chamadas da mesma execução.
        campoPreferido = campo;
        return resultado;
      }
    }

    return null;
  } catch (error) {
    console.error(`☁️ ❌ [CloudStorage] Erro no upload: ${error.message}`);
    return null;
  }
}

/**
 * Upload de um arquivo local para a nuvem
 * @param {string} filePath - Caminho completo do arquivo local
 * @param {string} mimetype - MIME type
 * @returns {Promise<{cloudId: string, cloudUrl: string} | null>}
 */
async function uploadFileToCloud(filePath, mimetype) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`☁️ ❌ [CloudStorage] Arquivo não encontrado: ${filePath}`);
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    return await uploadToCloud(buffer, fileName, mimetype);
  } catch (error) {
    console.error(`☁️ ❌ [CloudStorage] Erro ao ler arquivo: ${error.message}`);
    return null;
  }
}

/**
 * Verifica se uma URL é uma URL da nuvem
 * @param {string} url
 * @returns {boolean}
 */
function isCloudUrl(url) {
  return url && url.startsWith(CLOUD_BASE_URL);
}

/**
 * Retorna a URL de download da nuvem
 * @param {string} cloudId
 * @returns {string}
 */
function getCloudDownloadUrl(cloudId) {
  return `${CLOUD_BASE_URL}/download/${cloudId}`;
}

module.exports = {
  uploadToCloud,
  uploadFileToCloud,
  isCloudUrl,
  getCloudDownloadUrl,
  CLOUD_BASE_URL
};