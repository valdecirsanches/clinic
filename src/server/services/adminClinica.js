// ==================== AUTORIZAÇÃO DO ADMINISTRADOR DA CLÍNICA ====================
// Mesma lógica de superAdmin.js: o "tipo" enviado pelo navegador não é
// confiável, então a rota confere na tabela `usuarios` se quem pede é o
// super admin, ou um admin ativo responsável por ESTA clínica (a própria
// clínica dele ou uma clínica da mesma operadora).

const dbGlobal = require('../databaseGlobal');

/** Retorna o usuário ou null (já respondendo 400/403/500). */
async function exigirAdminDaClinica(req, res, clinicaId) {
  // Com login, vale o usuário do TOKEN — o usuarioId enviado pelo navegador
  // não é mais confiável (bastava informar o id de um super admin).
  const usuarioId = String(
    req.usuario && req.usuario.id || req.query.usuarioId || req.body && req.body.usuarioId || req.get('x-usuario-id') || ''
  ).trim();
  if (!usuarioId || !clinicaId) {
    res.status(400).json({ error: 'usuarioId e clinicaId são obrigatórios.' });
    return null;
  }
  try {
    const usuario = await dbGlobal.
    prepare('SELECT id, nome, tipo, ativo, clinicaId, operadoraId FROM usuarios WHERE id = ?').
    get(usuarioId);
    if (!usuario || !Number(usuario.ativo)) {
      res.status(403).json({ error: 'Usuário inativo ou inexistente.' });
      return null;
    }
    if (usuario.tipo === 'super_admin') return usuario;
    if (usuario.tipo !== 'admin') {
      res.status(403).json({ error: 'Somente o administrador da clínica pode fazer isso.' });
      return null;
    }
    if (usuario.clinicaId === clinicaId) return usuario;
    const clinica = await dbGlobal.
    prepare('SELECT id, operadoraId FROM clinicas WHERE id = ?').
    get(clinicaId).
    catch(() => null);
    if (clinica && usuario.operadoraId && clinica.operadoraId === usuario.operadoraId) {
      return usuario;
    }
    res.status(403).json({ error: 'Este administrador não responde por esta clínica.' });
    return null;
  } catch (err) {
    res.status(500).json({ error: err.message });
    return null;
  }
}

module.exports = { exigirAdminDaClinica };