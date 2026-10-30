// ==================== AUTORIZAÇÃO DO SUPER ADMIN ====================
// O sistema não tem middleware de autenticação: o "tipo" enviado pelo
// navegador não pode ser confiado. Toda rota restrita confere AQUI, contra a
// tabela `usuarios`, se quem pede é um super admin ativo.

const dbGlobal = require('../databaseGlobal');

/** Retorna o usuário ou null (já respondendo 400/403/500). */
async function exigirSuperAdmin(req, res) {
  const usuarioId = String(
    req.query.usuarioId || req.body && req.body.usuarioId || req.get('x-usuario-id') || ''
  ).trim();
  if (!usuarioId) {
    res.status(400).json({ error: 'usuarioId é obrigatório.' });
    return null;
  }
  try {
    const usuario = await dbGlobal.
    prepare('SELECT id, nome, email, tipo, ativo FROM usuarios WHERE id = ?').
    get(usuarioId);
    if (!usuario || !Number(usuario.ativo) || usuario.tipo !== 'super_admin') {
      res.status(403).json({ error: 'Acesso restrito ao super administrador.' });
      return null;
    }
    return usuario;
  } catch (err) {
    res.status(500).json({ error: err.message });
    return null;
  }
}

/**
 * Leitor de corpo text/plain: as telas enviam POST como text/plain para
 * evitar o preflight OPTIONS que o proxy não repassa.
 */
function lerCorpoTexto(req, res, next) {
  const tipo = String(req.headers['content-type'] || '');
  if (!tipo.includes('text/plain') || req.body && Object.keys(req.body).length) {
    return next();
  }
  let bruto = '';
  req.setEncoding('utf8');
  req.on('data', (parte) => {
    bruto += parte;
    if (bruto.length > 2 * 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      req.body = bruto ? JSON.parse(bruto) : {};
    } catch (e) {
      req.body = {};
    }
    next();
  });
  req.on('error', () => next());
}

module.exports = { exigirSuperAdmin, lerCorpoTexto };