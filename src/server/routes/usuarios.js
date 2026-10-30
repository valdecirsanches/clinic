// ==================== ROTAS DE USUÁRIOS ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const senhas = require('../services/senhas');
const autenticacao = require('../services/autenticacao');
const { normalizarTelefone } = require('../services/doisFatores');
const { registrarAuditoriaUsuario, diferencas, atorDaRequisicao } = require('../services/auditoriaUsuarios');

/** Remove a senha antes de devolver o usuário ao navegador */
function semSenha(usuario) {
  if (!usuario) return usuario;
  const copia = { ...usuario };
  delete copia.senha;
  return copia;
}

/** Duas etapas exige um celular válido para receber o código */
function erroDoisFatores(doisFatores, telefone) {
  if (!doisFatores) return null;
  return normalizarTelefone(telefone) ?
  null :
  'Para ativar a verificação em duas etapas, informe um celular (WhatsApp) válido com DDD no cadastro do usuário.';
}

// ⭐ Migração on-the-fly: garante que colunas existam (MySQL - usa ALTER TABLE direto)
// ⭐ PERF: Cache para rodar apenas 1x por vida do processo
let _migracaoFeita = false;
const migrarColunas = async () => {
  if (_migracaoFeita) return;
  _migracaoFeita = true;
  const migrar = async (coluna, tipo) => {
    try {
      await dbGlobal.exec(`ALTER TABLE usuarios ADD COLUMN \`${coluna}\` ${tipo}`);
      console.log(`✅ Migração on-the-fly: Coluna ${coluna} adicionada`);
    } catch (err) {
















      // Ignora erro se coluna já existe (Duplicate column name)
    }}; // ⭐ Modifica tipo de coluna existente (para colunas que precisam ser maiores)
  const modificar = async (coluna, tipo) => {try {await dbGlobal.exec(`ALTER TABLE usuarios MODIFY COLUMN \`${coluna}\` ${tipo}`);console.log(`✅ Migração on-the-fly: Coluna ${coluna} modificada para ${tipo}`);} catch (err) {






      // Ignora erro silenciosamente
    }};await migrar('termoPesquisa', 'TEXT');await migrar('operadoraPadraoId', 'VARCHAR(191)');await migrar('clinicaPadraoId', 'VARCHAR(191)');await migrar('fotoUrl', 'LONGTEXT');await migrar('endereco', 'VARCHAR(255)');await migrar('numero', 'VARCHAR(20)');await migrar('complemento', 'VARCHAR(255)');await migrar('bairro', 'VARCHAR(255)');await migrar('cidade', 'VARCHAR(255)');await migrar('cepUsuario', 'VARCHAR(10)');await migrar('ufEndereco', 'VARCHAR(2)');await migrar('titulo', 'VARCHAR(100)');await migrar('cabecalhoRelatorio', 'TEXT');await migrar('rqes', 'TEXT');await migrar('especialidades', 'TEXT');
  // ⭐ Intervalo de almoço (ponto)
  await migrar('intervaloAlmocoAtivo', 'TINYINT DEFAULT 0');
  await migrar('intervaloAlmocoInicio', 'VARCHAR(5)');
  await migrar('intervaloAlmocoFim', 'VARCHAR(5)');
  // ⭐ Libera todas as operações do prontuário para usuários não clínicos
  await migrar('prontuarioTotal', 'TINYINT DEFAULT 0');
  // ⭐ Verificação em duas etapas (código pelo WhatsApp)
  await migrar('doisFatores', 'TINYINT DEFAULT 0');
  // ⭐ FIX: Garante que fotoUrl seja LONGTEXT (base64 de fotos pode exceder 65KB do TEXT)
  await modificar('fotoUrl', 'LONGTEXT');
};

// GET /api/usuarios - Lista usuários (opcionalmente filtrados)
router.get('/', async (req, res) => {
  try {
    const { operadoraId, clinicaId } = req.query;

    // ⭐ FIX: Garante que as colunas (inclusive intervalo de almoço) existam ANTES da consulta.
    // Sem isto, em bancos sem as colunas novas, o SELECT falha e a lista volta vazia.
    await migrarColunas();

    // ⭐ PERF: Exclui colunas pesadas (fotoUrl=base64 ~100KB, cabecalhoRelatorio=TEXT) da listagem
    // Essas colunas são carregadas sob demanda via GET /api/usuarios/:id
    // ⭐ A senha NUNCA sai do servidor (é guardada como hash). Na edição, o
    //    campo fica em branco e em branco significa "manter a senha atual".
    let query = 'SELECT id, nome, email, doisFatores, tipo, crm, uf, cpf, telefone, dataNascimento, titulo, especialidades, operadoraId, clinicaId, ativo, permissoesMenu, rqes, termoPesquisa, operadoraPadraoId, clinicaPadraoId, endereco, numero, complemento, bairro, cidade, cepUsuario, ufEndereco, intervaloAlmocoAtivo, intervaloAlmocoInicio, intervaloAlmocoFim, prontuarioTotal FROM usuarios';
    const params = [];
    const conditions = [];

    if (operadoraId) {
      conditions.push('operadoraId = ?');
      params.push(operadoraId);
    }
    if (clinicaId) {
      conditions.push('clinicaId = ?');
      params.push(clinicaId);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const rows = await dbGlobal.prepare(query).all(...params);
    const usuarios = rows.map((row) => ({
      ...row,
      doisFatores: Boolean(row.doisFatores),
      ativo: Boolean(row.ativo),
      intervaloAlmocoAtivo: Boolean(row.intervaloAlmocoAtivo),
      prontuarioTotal: Boolean(row.prontuarioTotal),
      permissoesMenu: row.permissoesMenu ? JSON.parse(row.permissoesMenu) : [],
      rqes: row.rqes ? JSON.parse(row.rqes) : [],
      especialidades: row.especialidades ? JSON.parse(row.especialidades) : []
    }));

    console.log(`✅ Retornando ${usuarios.length} usuários`);
    res.json(usuarios);
  } catch (err) {
    console.error('❌ Erro ao buscar usuários:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/usuarios/:id - Busca usuário por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await migrarColunas();
    const row = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);

    if (!row) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const usuario = {
      ...row,
      ativo: Boolean(row.ativo),
      doisFatores: Boolean(row.doisFatores),
      intervaloAlmocoAtivo: Boolean(row.intervaloAlmocoAtivo),
      prontuarioTotal: Boolean(row.prontuarioTotal),
      permissoesMenu: row.permissoesMenu ? JSON.parse(row.permissoesMenu) : [],
      rqes: row.rqes ? JSON.parse(row.rqes) : [],
      especialidades: row.especialidades ? JSON.parse(row.especialidades) : []
    };

    console.log(`✅ Usuário encontrado: ${id} - ${usuario.nome}`);
    res.json(semSenha(usuario));
  } catch (err) {
    console.error('❌ Erro ao buscar usuário por ID:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/usuarios - Cria novo usuário
router.post('/', async (req, res) => {
  try {
    const { nome, email, senha, tipo, operadoraId, clinicaId, ativo, crm, uf, cpf, telefone, dataNascimento, permissoesMenu, termoPesquisa, operadoraPadraoId, clinicaPadraoId, fotoUrl, titulo, cabecalhoRelatorio, rqes, especialidades, endereco, numero, complemento, bairro, cidade, cepUsuario, ufEndereco, intervaloAlmocoAtivo, intervaloAlmocoInicio, intervaloAlmocoFim, prontuarioTotal, doisFatores } = req.body;

    console.log('📝 [POST /api/usuarios] Criando usuário:', { nome, email, tipo });
    if (!senha || !String(senha).trim()) return res.status(400).json({ error: 'Informe a senha inicial do usuário.' });
    const motivo2fa = erroDoisFatores(doisFatores, telefone);
    if (motivo2fa) return res.status(400).json({ error: motivo2fa, message: motivo2fa });
    console.log('📝 [POST /api/usuarios] Preferências:', { operadoraPadraoId, clinicaPadraoId, termoPesquisa });
    console.log('📝 [POST /api/usuarios] Dados profissionais:', { titulo, cabecalhoRelatorio: cabecalhoRelatorio ? cabecalhoRelatorio.substring(0, 50) + '...' : null, rqes: rqes?.length || 0 });
    console.log('📝 [POST /api/usuarios] Endereço:', { endereco, numero, cidade, cepUsuario, ufEndereco });

    // ⭐ Limite de usuários do plano da clínica (ex.: plano gratuito)
    if (clinicaId && tipo !== 'super_admin' && ativo !== false && ativo !== 0) {
      const bloqueioPlano = await require('../services/limitesPlano').verificarLimite(clinicaId, 'usuarios');
      if (bloqueioPlano) return res.status(403).json(bloqueioPlano);
    }

    // Verifica se email já existe
    const existingUser = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Email já cadastrado',
        message: `O email "${email}" já está sendo usado por outro usuário (${existingUser.nome}).`,
        code: 'EMAIL_DUPLICADO'
      });
    }

    await migrarColunas();

    const id = `u${Date.now()}`;
    const criadoEm = new Date().toISOString().split('T')[0];
    const permissoesMenuJson = Array.isArray(permissoesMenu) ? JSON.stringify(permissoesMenu) : null;
    const rqesJson = Array.isArray(rqes) ? JSON.stringify(rqes) : null;
    const especialidadesJson = Array.isArray(especialidades) ? JSON.stringify(especialidades) : null;
    const senhaHash = await senhas.prepararParaGravar(String(senha).trim());

    await dbGlobal.prepare(`
      INSERT INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, crm, uf, cpf, telefone, dataNascimento, permissoesMenu, termoPesquisa, operadoraPadraoId, clinicaPadraoId, fotoUrl, titulo, cabecalhoRelatorio, rqes, especialidades, endereco, numero, complemento, bairro, cidade, cepUsuario, ufEndereco, intervaloAlmocoAtivo, intervaloAlmocoInicio, intervaloAlmocoFim, prontuarioTotal, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, nome, email, senhaHash, tipo, operadoraId || null, clinicaId || null, ativo ? 1 : 0, crm || null, uf || null, cpf || null, telefone || null, dataNascimento || null, permissoesMenuJson, termoPesquisa || null, operadoraPadraoId || null, clinicaPadraoId || null, fotoUrl || null, titulo || null, cabecalhoRelatorio || null, rqesJson, especialidadesJson, endereco || null, numero || null, complemento || null, bairro || null, cidade || null, cepUsuario || null, ufEndereco || null, intervaloAlmocoAtivo ? 1 : 0, intervaloAlmocoInicio || null, intervaloAlmocoFim || null, prontuarioTotal ? 1 : 0, criadoEm);

    if (doisFatores) {
      await dbGlobal.prepare('UPDATE usuarios SET doisFatores = 1 WHERE id = ?').run(id);
    }

    registrarAuditoriaUsuario(req, {
      acao: 'CRIACAO_USUARIO',
      alvo: { id, nome, tipo, clinicaId },
      detalhes: `Cadastro criado (e-mail ${email}${crm ? `, CRM/CRO ${crm}/${uf || ''}` : ''})`,
      ...atorDaRequisicao(req)
    });

    console.log(`✅ Usuário criado: ${id} - ${nome} (${email})`);
    console.log(`✅ cabecalhoRelatorio salvo: ${cabecalhoRelatorio ? 'SIM (' + cabecalhoRelatorio.length + ' chars)' : 'NÃO'}`);
    console.log(`✅ titulo salvo: ${titulo || '(vazio)'}`);
    console.log(`✅ rqes salvo: ${rqes?.length || 0} itens`);
    console.log(`✅ endereco salvo: ${endereco || '(vazio)'}, cidade: ${cidade || '(vazio)'}`);

    res.json({
      id, nome, email, tipo, operadoraId, clinicaId, ativo,
      doisFatores: !!doisFatores,
      crm, uf, cpf, telefone, dataNascimento,
      permissoesMenu: permissoesMenu || [],
      termoPesquisa: termoPesquisa || null,
      operadoraPadraoId: operadoraPadraoId || null,
      clinicaPadraoId: clinicaPadraoId || null,
      fotoUrl: fotoUrl || null,
      titulo: titulo || null,
      cabecalhoRelatorio: cabecalhoRelatorio || null,
      rqes: rqes || [],
      especialidades: especialidades || [],
      endereco: endereco || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade: cidade || null,
      cepUsuario: cepUsuario || null,
      ufEndereco: ufEndereco || null,
      intervaloAlmocoAtivo: !!intervaloAlmocoAtivo,
      prontuarioTotal: !!prontuarioTotal,
      intervaloAlmocoInicio: intervaloAlmocoInicio || null,
      intervaloAlmocoFim: intervaloAlmocoFim || null,
      criadoEm
    });
  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err);
    if (err.message?.includes('Duplicate entry') && err.message?.includes('email')) {
      return res.status(409).json({
        error: 'Email já cadastrado',
        message: `O email já está sendo usado.`,
        code: 'EMAIL_DUPLICADO'
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/usuarios/:id - Atualiza usuário
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, senha, tipo, operadoraId, clinicaId, ativo, crm, uf, cpf, telefone, dataNascimento, permissoesMenu, termoPesquisa, operadoraPadraoId, clinicaPadraoId, fotoUrl, titulo, cabecalhoRelatorio, rqes, especialidades, endereco, numero, complemento, bairro, cidade, cepUsuario, ufEndereco, intervaloAlmocoAtivo, intervaloAlmocoInicio, intervaloAlmocoFim, prontuarioTotal, doisFatores } = req.body;

    const motivo2fa = erroDoisFatores(doisFatores, telefone);
    if (motivo2fa) return res.status(400).json({ error: motivo2fa, message: motivo2fa });

    console.log('');
    console.log('🔄 ========== ATUALIZANDO USUÁRIO ==========');
    console.log('🔄 ID:', id, '| Nome:', nome);
    console.log('🔄 Preferências:', { operadoraPadraoId, clinicaPadraoId, termoPesquisa });
    console.log('🔄 Dados profissionais:', { titulo, cabecalhoRelatorio: cabecalhoRelatorio ? cabecalhoRelatorio.substring(0, 50) + '...' : null, rqes: rqes?.length || 0 });
    console.log('🔄 Endereço:', { endereco, numero, cidade, cepUsuario, ufEndereco });

    // Verifica email duplicado em outro usuário
    const existingUser = await dbGlobal.prepare('SELECT id, nome FROM usuarios WHERE email = ? AND id != ?').get(email, id);
    if (existingUser) {
      return res.status(409).json({
        error: 'Email já cadastrado',
        message: `O email "${email}" já está sendo usado por outro usuário (${existingUser.nome}).`,
        code: 'EMAIL_DUPLICADO'
      });
    }

    await migrarColunas();

    // Registro anterior, para a auditoria mostrar o que mudou
    const usuarioAntes = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);

    const permissoesMenuJson = Array.isArray(permissoesMenu) ? JSON.stringify(permissoesMenu) : null;
    const rqesJson = Array.isArray(rqes) ? JSON.stringify(rqes) : null;
    const especialidadesJson = Array.isArray(especialidades) ? JSON.stringify(especialidades) : null;

    // ⭐ FIX: NUNCA apaga a senha ao editar. Só atualiza a senha quando uma
    // nova senha (não vazia) for enviada. A listagem não retorna o campo senha,
    // então um valor vazio/undefined significa "manter a senha atual".
    const novaSenha = typeof senha === 'string' ? senha.trim() : senha;
    const atualizarSenha = !!novaSenha;
    const senhaSql = atualizarSenha ? 'senha = ?,' : '';
    // Só mexe na verificação em duas etapas quando o formulário enviou o campo
    const doisFatoresSql = doisFatores === undefined ? '' : ', doisFatores = ?';

    const valores = [nome, email];
    if (atualizarSenha) valores.push(await senhas.prepararParaGravar(novaSenha));
    valores.push(
      tipo,
      operadoraId || null, clinicaId || null, ativo ? 1 : 0,
      crm || null, uf || null, cpf || null, telefone || null, dataNascimento || null,
      permissoesMenuJson, termoPesquisa || null,
      operadoraPadraoId || null, clinicaPadraoId || null,
      fotoUrl || null,
      titulo || null, cabecalhoRelatorio || null, rqesJson,
      especialidadesJson,
      endereco || null, numero || null, complemento || null, bairro || null,
      cidade || null, cepUsuario || null, ufEndereco || null,
      intervaloAlmocoAtivo ? 1 : 0, intervaloAlmocoInicio || null, intervaloAlmocoFim || null,
      prontuarioTotal ? 1 : 0
    );
    if (doisFatores !== undefined) valores.push(doisFatores ? 1 : 0);
    valores.push(id);

    await dbGlobal.prepare(`
      UPDATE usuarios SET
        nome = ?, email = ?, ${senhaSql} tipo = ?,
        operadoraId = ?, clinicaId = ?, ativo = ?,
        crm = ?, uf = ?, cpf = ?, telefone = ?, dataNascimento = ?,
        permissoesMenu = ?, termoPesquisa = ?,
        operadoraPadraoId = ?, clinicaPadraoId = ?,
        fotoUrl = ?,
        titulo = ?, cabecalhoRelatorio = ?, rqes = ?,
        especialidades = ?,
        endereco = ?, numero = ?, complemento = ?, bairro = ?,
        cidade = ?, cepUsuario = ?, ufEndereco = ?,
        intervaloAlmocoAtivo = ?, intervaloAlmocoInicio = ?, intervaloAlmocoFim = ?,
        prontuarioTotal = ?${doisFatoresSql}
      WHERE id = ?
    `).run(...valores);

    // Perfil/acesso pode ter mudado: o cache do token não deve segurar o antigo.
    // Desativado ou senha trocada por terceiro → encerra as sessões dele.
    autenticacao.esquecerUsuario(id);
    if (!ativo || atualizarSenha && !(req.usuario && req.usuario.id === id)) {
      autenticacao.revogarTokensDoUsuario(id).catch(() => {});
    } else if (atualizarSenha) {
      autenticacao.revogarTokensDoUsuario(id, req.authToken).catch(() => {});
    }

    const usuarioAtualizado = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);

    const mudancas = diferencas(usuarioAntes, usuarioAtualizado, atualizarSenha);
    if (mudancas.length) {
      registrarAuditoriaUsuario(req, {
        acao: 'ALTERACAO_USUARIO',
        alvo: { id, nome: usuarioAtualizado.nome, tipo: usuarioAtualizado.tipo, clinicaId: usuarioAtualizado.clinicaId || usuarioAntes?.clinicaId },
        detalhes: `Cadastro alterado: ${mudancas.join('; ')}`,
        ...atorDaRequisicao(req)
      });
    }

    const resultado = {
      ...semSenha(usuarioAtualizado),
      doisFatores: Boolean(usuarioAtualizado.doisFatores),
      ativo: Boolean(usuarioAtualizado.ativo),
      intervaloAlmocoAtivo: Boolean(usuarioAtualizado.intervaloAlmocoAtivo),
      prontuarioTotal: Boolean(usuarioAtualizado.prontuarioTotal),
      permissoesMenu: usuarioAtualizado.permissoesMenu ? JSON.parse(usuarioAtualizado.permissoesMenu) : [],
      rqes: usuarioAtualizado.rqes ? JSON.parse(usuarioAtualizado.rqes) : [],
      especialidades: usuarioAtualizado.especialidades ? JSON.parse(usuarioAtualizado.especialidades) : []
    };

    console.log(`✅ Usuário atualizado: ${id} - ${nome}`);
    console.log(`✅ cabecalhoRelatorio no banco: ${resultado.cabecalhoRelatorio ? 'SIM (' + resultado.cabecalhoRelatorio.length + ' chars)' : 'NÃO'}`);
    console.log(`✅ titulo no banco: ${resultado.titulo || '(vazio)'}`);
    console.log(`✅ endereco no banco: ${resultado.endereco || '(vazio)'}, cidade: ${resultado.cidade || '(vazio)'}`);
    console.log(`✅ termoPesquisa no banco:`, resultado.termoPesquisa);
    console.log('🔄 ==========================================');

    res.json({ success: true, usuario: resultado });
  } catch (err) {
    console.error('❌ Erro ao atualizar usuário:', err);
    if (err.message?.includes('Duplicate entry') && err.message?.includes('email')) {
      return res.status(409).json({
        error: 'Email já cadastrado',
        message: `O email já está sendo usado.`,
        code: 'EMAIL_DUPLICADO'
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/usuarios/:id/trocar-senha — o próprio usuário troca a senha
// (a senha atual é conferida no servidor: o navegador não conhece a senha)
router.post('/:id/trocar-senha', async (req, res) => {
  try {
    const senhaAtual = String(req.body?.senhaAtual || '');
    const novaSenha = String(req.body?.novaSenha || '').trim();
    if (novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
    const row = await dbGlobal.prepare('SELECT id, senha FROM usuarios WHERE id = ?').get(req.params.id);
    if (!row || !(await senhas.conferir(senhaAtual, row.senha))) {
      return res.status(401).json({ error: 'A senha atual não confere.' });
    }
    await dbGlobal.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(await senhas.gerarHash(novaSenha), row.id);
    // Senha nova encerra as outras sessões abertas (mantém a atual)
    autenticacao.revogarTokensDoUsuario(row.id, req.authToken).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao trocar senha:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== VERIFICAÇÃO EM DUAS ETAPAS — PELO PRÓPRIO USUÁRIO ====================
// Ativar: senha atual + celular → código no WhatsApp → confirma o código.
// Assim o número é testado ANTES de valer no login (ninguém fica trancado
// fora por um celular digitado errado). Desativar exige a senha atual.
const doisFatores = require('../services/doisFatores');

async function usuarioComSenha(id, senhaAtual) {
  const row = await dbGlobal.prepare('SELECT id, nome, tipo, clinicaId, senha, telefone, doisFatores FROM usuarios WHERE id = ?').get(id);
  if (!row || !(await senhas.conferir(String(senhaAtual || ''), row.senha))) return null;
  return row;
}

// GET /api/usuarios/:id/dois-fatores — situação atual
router.get('/:id/dois-fatores', async (req, res) => {
  try {
    await migrarColunas();
    const row = await dbGlobal.prepare('SELECT telefone, doisFatores FROM usuarios WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ativo: Number(row.doisFatores) === 1, telefone: row.telefone || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/usuarios/:id/dois-fatores/codigo { senhaAtual, telefone }
router.post('/:id/dois-fatores/codigo', async (req, res) => {
  try {
    await migrarColunas();
    const usuario = await usuarioComSenha(req.params.id, req.body?.senhaAtual);
    if (!usuario) return res.status(401).json({ error: 'A senha atual não confere.' });
    const telefone = String(req.body?.telefone || '').trim();
    if (!doisFatores.normalizarTelefone(telefone)) {
      return res.status(400).json({ error: 'Informe um celular com DDD, ex.: (11) 99999-0000.' });
    }
    const desafio = await doisFatores.criarDesafio({ id: usuario.id, telefone });
    res.json({ desafioId: desafio.id, destino: desafio.destino, expiraEmSeg: desafio.expiraEmSeg });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/usuarios/:id/dois-fatores/confirmar { desafioId, codigo, telefone }
router.post('/:id/dois-fatores/confirmar', async (req, res) => {
  try {
    const telefone = String(req.body?.telefone || '').trim();
    const { usuarioId, telefone: numeroDesafio } = await doisFatores.conferirDesafio(req.body?.desafioId, req.body?.codigo);
    if (usuarioId !== req.params.id || doisFatores.normalizarTelefone(telefone) !== numeroDesafio) {
      return res.status(400).json({ error: 'Código não corresponde a este usuário/celular. Peça um novo código.' });
    }
    const antes = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
    await dbGlobal.prepare('UPDATE usuarios SET doisFatores = 1, telefone = ? WHERE id = ?').run(telefone, usuarioId);
    const depois = await dbGlobal.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
    registrarAuditoriaUsuario(req, {
      acao: 'ALTERACAO_USUARIO',
      alvo: { id: usuarioId, nome: depois.nome, tipo: depois.tipo, clinicaId: depois.clinicaId },
      detalhes: `Pelo próprio usuário: ${diferencas(antes, depois, false).join('; ') || 'Verificação em duas etapas ativada'}`,
      atorId: usuarioId,
      atorClinicaId: req.body?.atorClinicaId || ''
    });
    res.json({ success: true, ativo: true, telefone });
  } catch (err) {
    res.status(err.status === 410 || err.status === 429 ? 400 : err.status || 500).json({
      error: err.status === 410 ? 'O código expirou. Peça um novo código.' : err.status === 429 ? 'Muitas tentativas. Peça um novo código.' : err.message
    });
  }
});

// POST /api/usuarios/:id/dois-fatores/desativar { senhaAtual }
router.post('/:id/dois-fatores/desativar', async (req, res) => {
  try {
    const usuario = await usuarioComSenha(req.params.id, req.body?.senhaAtual);
    if (!usuario) return res.status(401).json({ error: 'A senha atual não confere.' });
    await dbGlobal.prepare('UPDATE usuarios SET doisFatores = 0 WHERE id = ?').run(usuario.id);
    registrarAuditoriaUsuario(req, {
      acao: 'ALTERACAO_USUARIO',
      alvo: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo, clinicaId: usuario.clinicaId },
      detalhes: 'Pelo próprio usuário: Verificação em duas etapas: "sim" → "não"',
      atorId: usuario.id,
      atorClinicaId: req.body?.atorClinicaId || ''
    });
    res.json({ success: true, ativo: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/usuarios/:id - Deleta usuário
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const alvo = await dbGlobal.prepare('SELECT id, nome, tipo, clinicaId, email, crm, uf FROM usuarios WHERE id = ?').get(id);
    await dbGlobal.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    autenticacao.revogarTokensDoUsuario(id).catch(() => {});
    if (alvo) {
      registrarAuditoriaUsuario(req, {
        acao: 'EXCLUSAO_USUARIO',
        alvo,
        detalhes: `Cadastro excluído (e-mail ${alvo.email || '—'}${alvo.crm ? `, CRM/CRO ${alvo.crm}/${alvo.uf || ''}` : ''})`,
        ...atorDaRequisicao(req)
      });
    }
    console.log(`✅ Usuário deletado: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao deletar usuário:', err);
    res.status(500).json({ error: err.message });
  }
});

// ⭐⭐⭐ PATCH /api/usuarios/:id/preferencias ⭐⭐⭐
router.patch('/:id/preferencias', async (req, res) => {
  try {
    const { id } = req.params;
    const { operadoraPadraoId, clinicaPadraoId, termoPesquisa } = req.body;

    console.log('');
    console.log('💾 ========== SALVANDO PREFERÊNCIAS ==========');
    console.log('💾 Usuário ID:', id);
    console.log('💾 operadoraPadraoId:', operadoraPadraoId || '(limpar)');
    console.log('💾 clinicaPadraoId:', clinicaPadraoId || '(limpar)');
    console.log('💾 termoPesquisa:', termoPesquisa || '(limpar)');

    await migrarColunas();

    // Atualiza APENAS os campos de preferência
    const campos = [];
    const valores = [];

    if (operadoraPadraoId !== undefined) {
      campos.push('operadoraPadraoId = ?');
      valores.push(operadoraPadraoId || null);
    }
    if (clinicaPadraoId !== undefined) {
      campos.push('clinicaPadraoId = ?');
      valores.push(clinicaPadraoId || null);
    }
    if (termoPesquisa !== undefined) {
      campos.push('termoPesquisa = ?');
      valores.push(termoPesquisa || null);
    }

    if (campos.length === 0) {
      return res.status(400).json({ error: 'Nenhuma preferência informada' });
    }

    valores.push(id);
    const result = await dbGlobal.prepare(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`).run(...valores);

    console.log(`✅ Preferências salvas! (${result.changes} linha(s) afetada(s))`);
    console.log('💾 ==========================================');

    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('❌ Erro ao salvar preferências:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;