// ==================== SENHAS CRIPTOGRAFADAS ====================
// As senhas são guardadas como hash scrypt (nativo do Node, sem dependência):
//   scrypt$<sal base64>$<hash base64>
// O hash não pode ser revertido: nem o banco, nem o backup, nem a tela de
// usuários conseguem mostrar a senha. Para conferir, recalcula-se o hash.
//
// Compatibilidade: senhas antigas (texto puro) ainda são aceitas no login e
// são convertidas para hash na mesma hora. Na inicialização, todas as senhas
// em texto puro que restarem são convertidas.

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const PREFIXO = 'scrypt$';
const TAMANHO = 64;

function ehHash(valor) {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(String(senha), sal, TAMANHO);
  return `${PREFIXO}${sal.toString('base64')}$${hash.toString('base64')}`;
}

function iguais(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Confere a senha digitada com a guardada (hash ou texto puro antigo) */
async function conferir(senha, armazenada) {
  if (!senha || !armazenada) return false;
  if (!ehHash(armazenada)) {
    return iguais(Buffer.from(String(senha)), Buffer.from(String(armazenada)));
  }
  const [, salB64, hashB64] = armazenada.split('$');
  if (!salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = await scrypt(String(senha), Buffer.from(salB64, 'base64'), esperado.length || TAMANHO);
  return iguais(calculado, esperado);
}

/** Valor a gravar no banco: nunca grava texto puro e nunca refaz o hash de um hash */
async function prepararParaGravar(senha) {
  if (!senha) return senha;
  return ehHash(senha) ? senha : gerarHash(senha);
}

/** Converte para hash todas as senhas que ainda estão em texto puro */
async function criptografarExistentes(dbGlobal) {
  const linhas = await dbGlobal.
  prepare("SELECT id, senha FROM usuarios WHERE senha IS NOT NULL AND senha <> '' AND senha NOT LIKE 'scrypt$%'").
  all();
  let convertidas = 0;
  for (const linha of linhas) {
    try {
      const hash = await gerarHash(linha.senha);
      // Só troca se ninguém alterou a senha enquanto o hash era calculado
      await dbGlobal.prepare('UPDATE usuarios SET senha = ? WHERE id = ? AND senha = ?').run(hash, linha.id, linha.senha);
      convertidas += 1;
    } catch (err) {
      console.error(`🔐 ⚠️ Senha do usuário ${linha.id} não convertida: ${err.message}`);
    }
  }
  if (convertidas) console.log(`🔐 ✅ ${convertidas} senha(s) em texto puro convertida(s) para hash`);
  return convertidas;
}

module.exports = { ehHash, gerarHash, conferir, prepararParaGravar, criptografarExistentes };