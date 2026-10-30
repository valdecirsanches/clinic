// ==================== ROTAS DE AUTENTICAÇÃO ====================
// Senhas: conferidas por hash (services/senhas.js). Nunca voltam ao navegador.
// Duas etapas: usuário com `doisFatores = 1` recebe um código no WhatsApp
// antes de entrar (services/doisFatores.js).

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const senhas = require('../services/senhas');
const doisFatores = require('../services/doisFatores');
const autenticacao = require('../services/autenticacao');

// ==================== LIMITE DE TENTATIVAS ====================
// 10 senhas erradas por e-mail (ou 30 por IP) em 15 minutos bloqueiam novas
// tentativas por 15 minutos. Fica em memória: reiniciar o servidor zera.
const JANELA_MS = 15 * 60 * 1000;
const falhas = new Map(); // chave -> { n, desde }
function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}
function bloqueado(chave, limite) {
  const f = falhas.get(chave);
  if (!f) return false;
  if (Date.now() - f.desde > JANELA_MS) {falhas.delete(chave);return false;}
  return f.n >= limite;
}
function registrarFalha(chave) {
  const f = falhas.get(chave);
  if (!f || Date.now() - f.desde > JANELA_MS) falhas.set(chave, { n: 1, desde: Date.now() });else
  f.n++;
  if (falhas.size > 20000) falhas.delete(falhas.keys().next().value);
}

// Converte as senhas antigas em texto puro logo depois de o servidor subir
setTimeout(() => {
  senhas.criptografarExistentes(dbGlobal).catch((err) =>
  console.error('🔐 ⚠️ Conversão das senhas para hash não concluída:', err.message)
  );
}, 8000).unref();

/** Monta a resposta de login (sem a senha) com operadora e clínica preferidas */
async function respostaLogin(row, req, res) {
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
  const token = await autenticacao.emitirToken(row.id, req);
  autenticacao.definirCookie(req, res, token);
  return {
    usuario,
    clinicaAtual: clinica,
    operadoraSelecionada: operadora,
    token
  };
}

// POST /api/auth/login — e-mail + senha (e, se ativado, inicia as duas etapas)
router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const senha = String(req.body?.senha || '');
  console.log('🔐 POST /api/auth/login - Tentativa de login:', email);

  if (!email || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });

  const chaveEmail = `email:${email.toLowerCase()}`;
  const chaveIp = `ip:${ipDe(req)}`;
  if (bloqueado(chaveEmail, 10) || bloqueado(chaveIp, 30)) {
    return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' });
  }

  try {
    const row = await dbGlobal.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);
    if (!row || !(await senhas.conferir(senha, row.senha))) {
      console.log('❌ Login falhou: credenciais inválidas para', email);
      registrarFalha(chaveEmail);
      registrarFalha(chaveIp);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    falhas.delete(chaveEmail);

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

    res.json(await respostaLogin(row, req, res));
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
    res.json(await respostaLogin(row, req, res));
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

// GET /api/auth/me — confere o token e devolve o usuário dele
router.get('/me', async (req, res) => {
  if (!req.usuario) return res.status(401).json({ error: 'Sessão não encontrada', codigo: 'NAO_AUTENTICADO' });
  try {
    const row = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(req.usuario.id);
    if (!row) return res.status(401).json({ error: 'Usuário inativo ou removido.', codigo: 'NAO_AUTENTICADO' });
    let permissoesMenu = [];
    try {permissoesMenu = row.permissoesMenu ? JSON.parse(row.permissoesMenu) : [];} catch (e) {}
    const usuario = { ...row, ativo: true, prontuarioTotal: Boolean(row.prontuarioTotal), doisFatores: Boolean(row.doisFatores), permissoesMenu };
    delete usuario.senha;
    res.json({ usuario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/cookie — renova o cookie usado por <img>, links e downloads
// (sessões abertas antes desta versão só tinham o token no navegador).
router.post('/cookie', (req, res) => {
  if (!req.usuario || !req.authToken) return res.status(401).json({ error: 'Sessão não encontrada', codigo: 'NAO_AUTENTICADO' });
  autenticacao.definirCookie(req, res, req.authToken);
  res.json({ ok: true });
});

// POST /api/auth/logout — invalida o token desta sessão
router.post('/logout', async (req, res) => {
  try {
    const token = autenticacao.tokenDaRequisicao(req);
    if (token) await autenticacao.revogarToken(token);
  } catch (err) {
    console.error('🔐 ⚠️ Logout:', err.message);
  }
  autenticacao.definirCookie(req, res, null);
  res.json({ ok: true });
});

// ==================== CRIAÇÃO DE CONTA (tela de login) ====================
// Antes a tela de login baixava a lista de TODAS as operadoras e usuários para
// decidir o cadastro, e criava o admin chamando /api/usuarios sem login. Agora
// o servidor decide: CNPJ novo → cria a operadora e o administrador; CNPJ que
// já existe e ainda não tem usuários → cria só o administrador; CNPJ com
// usuários → recusa (o acesso deve ser pedido ao administrador).
const somenteDigitos = (v) => String(v || '').replace(/\D/g, '');

async function operadoraPorCnpj(cnpj) {
  const digitos = somenteDigitos(cnpj);
  if (digitos.length !== 14) return null;
  const rows = await dbGlobal.prepare('SELECT id, nome, razaoSocial, cnpj FROM operadoras').all();
  return rows.find((o) => somenteDigitos(o.cnpj) === digitos) || null;
}

async function totalUsuarios(operadoraId) {
  const r = await dbGlobal.prepare('SELECT COUNT(*) AS total FROM usuarios WHERE operadoraId = ?').get(operadoraId);
  return Number(r && r.total || 0);
}

// GET /api/auth/cadastro/cnpj/:cnpj
router.get('/cadastro/cnpj/:cnpj', async (req, res) => {
  try {
    if (somenteDigitos(req.params.cnpj).length !== 14) return res.status(400).json({ error: 'CNPJ inválido' });
    const op = await operadoraPorCnpj(req.params.cnpj);
    if (!op) return res.json({ existe: false });
    const temUsuarios = (await totalUsuarios(op.id)) > 0;
    res.json({ existe: true, temUsuarios, operadora: temUsuarios ? null : { id: op.id, nome: op.nome, razaoSocial: op.razaoSocial, cnpj: op.cnpj } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/cadastro { operadora: {nome, cnpj, razaoSocial, ...} | null, cnpj, usuario: {nome, email, senha} }
router.post('/cadastro', async (req, res) => {
  const chaveIp = `cadastro:${ipDe(req)}`;
  if (bloqueado(chaveIp, 10)) return res.status(429).json({ error: 'Muitos cadastros a partir deste endereço. Tente mais tarde.' });
  try {
    const { operadora, usuario } = req.body || {};
    let cnpj = (operadora && operadora.cnpj) || req.body?.cnpj;
    if (!cnpj && req.body?.operadoraExistenteId) {
      const existente = await dbGlobal.prepare('SELECT cnpj FROM operadoras WHERE id = ?').get(String(req.body.operadoraExistenteId));
      cnpj = existente && existente.cnpj;
    }
    const nome = String(usuario?.nome || '').trim();
    const email = String(usuario?.email || '').trim();
    const senha = String(usuario?.senha || '');
    if (!nome || !email || !senha) return res.status(400).json({ error: 'Informe nome, e-mail e senha.' });
    if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    if (somenteDigitos(cnpj).length !== 14) return res.status(400).json({ error: 'CNPJ inválido' });
    if (await dbGlobal.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) {
      return res.status(409).json({ error: `O e-mail "${email}" já está cadastrado.`, code: 'EMAIL_DUPLICADO' });
    }

    let op = await operadoraPorCnpj(cnpj);
    if (op) {
      if ((await totalUsuarios(op.id)) > 0) {
        return res.status(409).json({ error: 'Esta operadora já possui usuários cadastrados. Entre em contato com o administrador para solicitar acesso.' });
      }
    } else {
      if (!operadora || !String(operadora.nome || '').trim() || !String(operadora.razaoSocial || '').trim()) {
        return res.status(400).json({ error: 'Preencha os dados da operadora.' });
      }
      const id = `op${Date.now()}`;
      await dbGlobal.prepare(
        `INSERT INTO operadoras (id, nome, cnpj, razaoSocial, telefone, email, endereco, ativa, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(id, String(operadora.nome).trim(), String(cnpj).trim(), String(operadora.razaoSocial).trim(),
      operadora.telefone || null, operadora.email || null, operadora.endereco || null, new Date().toISOString().split('T')[0]);
      op = { id };
    }

    const usuarioId = `u${Date.now()}`;
    await dbGlobal.prepare(
      `INSERT INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, criadoEm)
       VALUES (?, ?, ?, ?, 'admin', ?, NULL, 1, ?)`
    ).run(usuarioId, nome, email, await senhas.prepararParaGravar(senha.trim()), op.id, new Date().toISOString().split('T')[0]);
    registrarFalha(chaveIp);
    autenticacao.esquecerClinicas();
    console.log(`✅ [cadastro] Conta criada: ${email} (admin) na operadora ${op.id}`);
    res.json({ ok: true, operadoraId: op.id, usuarioId });
  } catch (err) {
    console.error('❌ [cadastro]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
