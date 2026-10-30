// ==================== ROTAS DE AUTENTICAÇÃO ====================
// Senhas: conferidas por hash (services/senhas.js). Nunca voltam ao navegador.
// Duas etapas: usuário com `doisFatores = 1` recebe um código no WhatsApp
// antes de entrar (services/doisFatores.js).

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const senhas = require('../services/senhas');
const doisFatores = require('../services/doisFatores');

// Converte as senhas antigas em texto puro logo depois de o servidor subir
setTimeout(() => {
  senhas.criptografarExistentes(dbGlobal).catch((err) =>
  console.error('🔐 ⚠️ Conversão das senhas para hash não concluída:', err.message)
  );
}, 8000).unref();

/** Monta a resposta de login (sem a senha) com operadora e clínica preferidas */
async function respostaLogin(row) {
  let permissoesMenu = [];
  if (row.permissoesMenu) {
    try {
      permissoesMenu = JSON.parse(row.permissoesMenu);
    } catch (e) {
      console.error('   - Erro ao parsear permissoesMenu:', e);
    }
  }

  // prontuarioTotal: libera todas as operações do prontuário para usuários
  // que não são médicos/dentistas (coluna TINYINT → boolean).
  const usuario = {
    ...row,
    ativo: Boolean(row.ativo),
    prontuarioTotal: Boolean(row.prontuarioTotal),
    doisFatores: Boolean(row.doisFatores),
    permissoesMenu
  };
  delete usuario.senha;

  const operadoraIdParaBuscar = row.operadoraPadraoId || row.operadoraId;
  const clinicaIdParaBuscar = row.clinicaPadraoId || row.clinicaId;

  let operadora = null;
  if (operadoraIdParaBuscar) {
    try {
      const op = await dbGlobal.prepare('SELECT * FROM operadoras WHERE id = ?').get(operadoraIdParaBuscar);
      if (op) operadora = { ...op, ativa: Boolean(op.ativa) };
    } catch (e) {
      console.warn('⚠️ Erro ao buscar operadora:', e.message);
    }
  }

  let clinica = null;
  if (clinicaIdParaBuscar) {
    try {
      const cl = await dbGlobal.prepare('SELECT * FROM clinicas WHERE id = ?').get(clinicaIdParaBuscar);
      if (cl) clinica = { ...cl, ativa: Boolean(cl.ativa) };
    } catch (e) {
      console.warn('⚠️ Erro ao buscar clínica:', e.message);
    }
  }

  console.log(`✅ Login bem-sucedido: ${usuario.email} (${usuario.tipo}) · clínica: ${clinica?.nome || 'nenhuma'}`);
  return {
    usuario,
    clinicaAtual: clinica,
    operadoraSelecionada: operadora,
    token: 'dummy-token'
  };
}

// POST /api/auth/login — e-mail + senha (e, se ativado, inicia as duas etapas)
router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const senha = String(req.body?.senha || '');
  console.log('🔐 POST /api/auth/login - Tentativa de login:', email);

  if (!email || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });

  try {
    const row = await dbGlobal.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);
    if (!row || !(await senhas.conferir(senha, row.senha))) {
      console.log('❌ Login falhou: credenciais inválidas para', email);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Senha antiga em texto puro: converte para hash agora
    if (!senhas.ehHash(row.senha)) {
      try {
        await dbGlobal.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(await senhas.gerarHash(senha), row.id);
      } catch (err) {
        console.error('🔐 ⚠️ Senha não convertida no login:', err.message);
      }
    }

    if (Number(row.doisFatores) === 1) {
      try {
        const desafio = await doisFatores.criarDesafio(row);
        return res.json({ requer2fa: true, desafio });
      } catch (err) {
        console.error('🔐 ❌ [2FA]', err.message);
        return res.status(err.status || 422).json({ error: err.message });
      }
    }

    res.json(await respostaLogin(row));
  } catch (err) {
    console.error('❌ Erro no login:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login/verificar — confere o código recebido no WhatsApp
router.post('/login/verificar', async (req, res) => {
  try {
    const usuarioId = await doisFatores.verificar(req.body?.desafioId, req.body?.codigo);
    const row = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(usuarioId);
    if (!row) return res.status(401).json({ error: 'Usuário inativo ou removido.' });
    res.json(await respostaLogin(row));
  } catch (err) {
    if (!err.status) console.error('🔐 ❌ [2FA] Verificação:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/auth/login/reenviar — manda um código novo
router.post('/login/reenviar', async (req, res) => {
  try {
    res.json(await doisFatores.reenviar(req.body?.desafioId));
  } catch (err) {
    if (!err.status) console.error('🔐 ❌ [2FA] Reenvio:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || null;
  if (!token) return res.status(401).json({ error: 'Sessão não encontrada' });
  return res.json({ usuario: null, clinicaAtual: null, operadoraSelecionada: null });
});

module.exports = router;