// ==================== CARGA DOS ARQUIVOS .env.local ====================
// Lê TODOS os .env.local encontrados (antes parava no primeiro: uma chave
// posta em src/.env.local era ignorada quando existia server/.env.local).
//
// Ordem de prioridade = ordem da lista: o primeiro arquivo que define uma
// variável vence. Variáveis vindas de arquivo VENCEM o ambiente herdado
// (PM2 guardava valores antigos e "pm2 restart" não trocava o banco).

const fs = require('fs');
const path = require('path');

function caminhosPadrao(serverDir, cwd = process.cwd()) {
  const lista = [
  path.join(serverDir, '.env.local'), // server/.env.local
  path.resolve(serverDir, '..', '.env.local'), // src/.env.local
  path.resolve(serverDir, '..', '..', '.env.local'), // raiz do projeto
  path.resolve(serverDir, '..', '..', '..', '.env.local'), // 3 níveis acima
  path.join(cwd, '.env.local') // diretório de execução
  ];
  return [...new Set(lista.map((p) => path.resolve(p)))];
}

/**
 * @returns {{ arquivos: string[], origem: Record<string, string> }}
 *   arquivos lidos e, para cada variável, o arquivo de onde veio.
 */
function carregarEnv(caminhos, { dotenv = require('dotenv'), env = process.env } = {}) {
  const arquivos = [];
  const origem = {};
  for (const arquivo of caminhos) {
    if (!fs.existsSync(arquivo)) continue;
    let valores;
    try {
      valores = dotenv.parse(fs.readFileSync(arquivo));
    } catch (e) {
      console.warn(`⚠️ Não foi possível ler ${arquivo}: ${e.message}`);
      continue;
    }
    arquivos.push(arquivo);
    for (const [chave, valor] of Object.entries(valores)) {
      if (origem[chave]) continue; // um arquivo de prioridade maior já definiu
      env[chave] = valor;
      origem[chave] = arquivo;
    }
  }
  return { arquivos, origem };
}

module.exports = { caminhosPadrao, carregarEnv };
