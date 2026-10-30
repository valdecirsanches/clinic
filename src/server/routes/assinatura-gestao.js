// ============ GESTÃO DE ASSINATURAS (SUPER ADMIN) ============
// Toda rota confere no servidor se o solicitante é super admin ativo.

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const calculo = require('../services/assinaturaCalculo');
const mp = require('../services/mercadoPago');
const nfse = require('../services/nfseAssinatura');
const { confirmarPagamento, FORMAS } = require('../services/baixaFatura');
const { exigirSuperAdmin, lerCorpoTexto } = require('../services/superAdmin');
const { urlPublicaApi } = require('../services/httpJson');

router.use(lerCorpoTexto);

async function emLotes(lista, tamanho, fn) {
  const saida = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    saida.push(...(await Promise.all(lista.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

// GET /api/assinatura-gestao/config
router.get('/config', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const base = urlPublicaApi(req);
  res.json({
    mercadoPago: mp.resumoConfig(base ? `${base}/api/assinatura/webhook/mercadopago` : ''),
    nfse: nfse.resumoConfig()
  });
});

router.post('/mercadopago/testar', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    res.json({ ok: true, conta: await mp.testarCredencial() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/nfse/testar', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    res.json({ ok: true, ...(await nfse.testarConexao()) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/assinatura-gestao/planos
router.get('/planos', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    await calculo.garantirTabelas();
    const planos = await dbGlobal.
    prepare('SELECT id, nome, preco, limitePacientes, limites FROM planos WHERE ativo = 1 ORDER BY ordem ASC').
    all();
    res.json(
      (planos || []).map((p) => ({
        ...p,
        preco: Number(p.preco) || 0,
        limites: calculo.lerJson(p.limites, {})
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assinatura-gestao/clinicas?competencia=AAAA-MM
router.get('/clinicas', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const competencia = req.query.competencia || calculo.competenciaAtual();
  if (!calculo.validarCompetencia(competencia)) {
    return res.status(400).json({ error: 'competencia deve estar no formato AAAA-MM' });
  }
  try {
    await calculo.garantirTabelas();
    const clinicas = await dbGlobal.
    prepare('SELECT id, nome, cnpj, email, plano FROM clinicas WHERE ativa = 1 ORDER BY nome ASC').
    all();
    const faturas = await dbGlobal.
    prepare('SELECT * FROM assinatura_faturas WHERE competencia = ?').
    all(competencia);
    const faturaPorClinica = new Map((faturas || []).map((f) => [f.clinicaId, f]));

    const linhas = await emLotes(clinicas || [], 4, async (c) => {
      try {
        const [{ itens, valorTotal }, plano, contrato] = await Promise.all([
        calculo.calcularItens(c.id, competencia),
        calculo.buscarPlanoDaClinica(c.id),
        calculo.buscarContrato(c.id)]
        );
        const sistema = itens.find((i) => i.servico === 'sistema');
        const sms = itens.find((i) => i.servico === 'sms');
        const gb = itens.find((i) => i.servico === 'armazenamento');
        const fatura = faturaPorClinica.get(c.id);
        return {
          clinicaId: c.id,
          clinicaNome: c.nome,
          plano: plano ? { id: plano.id, nome: plano.nome, encontrado: plano.encontrado } : null,
          valorMensalFixo: contrato.valorMensalFixo,
          mensalidade: sistema ? sistema.valor : 0,
          sms: sms ? { quantidade: sms.quantidade, valor: sms.valor } : { quantidade: 0, valor: 0 },
          armazenamentoGb: gb ? gb.quantidade : 0,
          previaTotal: valorTotal,
          fatura: fatura ? calculo.normalizarFatura(fatura) : null
        };
      } catch (err) {
        return { clinicaId: c.id, clinicaNome: c.nome, erro: err.message };
      }
    });
    res.json({ competencia, clinicas: linhas });
  } catch (err) {
    console.error('💳 ❌ [gestão] Lista:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assinatura-gestao/clinicas/:clinicaId?competencia=
router.get('/clinicas/:clinicaId', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const competencia = req.query.competencia || calculo.competenciaAtual();
  try {
    const { clinicaId } = req.params;
    const [servicos, previa, plano, contrato, faturas] = await Promise.all([
    calculo.buscarServicos(clinicaId),
    calculo.calcularItens(clinicaId, competencia),
    calculo.buscarPlanoDaClinica(clinicaId),
    calculo.buscarContrato(clinicaId),
    dbGlobal.
    prepare('SELECT * FROM assinatura_faturas WHERE clinicaId = ? ORDER BY competencia DESC').
    all(clinicaId)]
    );
    const tomador = await nfse.tomadorDaClinica(clinicaId);
    res.json({
      clinicaId,
      competencia,
      servicos,
      previa,
      plano,
      contrato,
      faturas: (faturas || []).map(calculo.normalizarFatura),
      pendenciasNfse: tomador.faltando || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT|POST /api/assinatura-gestao/clinicas/:clinicaId/contrato
// POST existe porque o proxy não repassa o preflight que um PUT exige.
async function salvarContrato(req, res) {
  if (!(await exigirSuperAdmin(req, res))) return;
  const { clinicaId } = req.params;
  const { plano, valorMensalFixo, observacoes } = req.body || {};
  try {
    await calculo.garantirTabelas();
    if (plano !== undefined) {
      const existe = await dbGlobal.prepare('SELECT id FROM planos WHERE id = ?').get(plano);
      if (!existe) return res.status(400).json({ error: 'Plano inexistente' });
      await dbGlobal.prepare('UPDATE clinicas SET plano = ? WHERE id = ?').run(plano, clinicaId);
    }
    const fixo =
    valorMensalFixo === null || valorMensalFixo === '' || valorMensalFixo === undefined ?
    null :
    Number(valorMensalFixo);
    if (fixo !== null && (!Number.isFinite(fixo) || fixo < 0)) {
      return res.status(400).json({ error: 'Valor mensal inválido' });
    }
    await dbGlobal.
    prepare(
      `INSERT INTO assinatura_clinica (clinicaId, valorMensalFixo, observacoes, atualizadoEm)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE valorMensalFixo = VALUES(valorMensalFixo),
           observacoes = VALUES(observacoes), atualizadoEm = VALUES(atualizadoEm)`
    ).
    run(clinicaId, fixo, String(observacoes || ''), new Date().toISOString());
    res.json({ ok: true, contrato: await calculo.buscarContrato(clinicaId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
router.put('/clinicas/:clinicaId/contrato', salvarContrato);
router.post('/clinicas/:clinicaId/contrato', salvarContrato);

// POST /api/assinatura-gestao/fechar { clinicaId, competencia }
router.post('/fechar', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const { clinicaId } = req.body || {};
  const competencia = req.body && req.body.competencia || calculo.competenciaAtual();
  try {
    res.json(await calculo.fecharFatura(clinicaId, competencia));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/assinatura-gestao/fechar-todas { competencia }
router.post('/fechar-todas', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const competencia = req.body && req.body.competencia || calculo.competenciaAtual();
  if (!calculo.validarCompetencia(competencia)) {
    return res.status(400).json({ error: 'competencia deve estar no formato AAAA-MM' });
  }
  try {
    const clinicas = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE ativa = 1').all();
    const resultado = { fechadas: [], ignoradas: [] };
    for (const c of clinicas || []) {
      try {
        const f = await calculo.fecharFatura(c.id, competencia);
        resultado.fechadas.push({ clinicaNome: c.nome, valorTotal: f.valorTotal });
      } catch (err) {
        resultado.ignoradas.push({ clinicaNome: c.nome, motivo: err.message });
      }
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assinatura-gestao/faturas/:id/baixa { formaPagamento }
router.post('/faturas/:id/baixa', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const forma = req.body && req.body.formaPagamento || 'transferencia';
  if (!FORMAS.includes(forma)) return res.status(400).json({ error: 'Forma de pagamento inválida' });
  try {
    res.json(await confirmarPagamento(req.params.id, { formaPagamento: forma, origem: 'manual' }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/assinatura-gestao/faturas/:id/nfse — emite/reemite
router.post('/faturas/:id/nfse', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    const resultado = await nfse.emitirNfseDaFatura(req.params.id);
    const fatura = await calculo.buscarFaturaBruta(req.params.id);
    res.status(resultado.ok ? 200 : 422).json({
      ...resultado,
      fatura: fatura ? calculo.normalizarFatura(fatura) : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;