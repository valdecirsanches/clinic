// ============ FINANCEIRO DA ASSINATURA (plataforma → clínica) ============
// Mensalidades e faturas do uso do PRÓPRIO sistema pela clínica cliente.
// O cálculo vive em services/assinaturaCalculo.js; pagamentos pelo Mercado
// Pago em routes/assinatura-pagamento.js; gestão em routes/assinatura-gestao.js.
//
// ⚠️ A clínica NÃO dá baixa na própria fatura: ela apenas informa o
// pagamento (status "em_analise"). "Paga" só pelo Mercado Pago ou pelo super
// admin — a NFS-e é emitida nesse momento e não pode sair de algo não pago.

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const calculo = require('../services/assinaturaCalculo');
const { lerCorpoTexto } = require('../services/superAdmin');
const { exigirAdminDaClinica } = require('../services/adminClinica');

router.use(lerCorpoTexto);

// GET /api/assinatura/servicos?clinicaId=
router.get('/servicos', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    res.json(await calculo.buscarServicos(clinicaId));
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro ao listar serviços:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/assinatura/servicos — grava ativação/preços por clínica
router.put('/servicos', async (req, res) => {
  const { clinicaId, servicos } = req.body || {};
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!Array.isArray(servicos)) {
    return res.status(400).json({ error: 'servicos deve ser uma lista' });
  }
  try {
    await calculo.garantirTabelas();
    const agora = new Date().toISOString();
    for (const s of servicos) {
      if (!calculo.SERVICOS.some((c) => c.id === s.servico)) continue;
      await dbGlobal.
      prepare(
        `INSERT INTO assinatura_servicos
             (id, clinicaId, servico, ativo, valorMensal, valorUnitario, franquia, atualizadoEm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             ativo = VALUES(ativo), valorMensal = VALUES(valorMensal),
             valorUnitario = VALUES(valorUnitario), franquia = VALUES(franquia),
             atualizadoEm = VALUES(atualizadoEm)`
      ).
      run(
        calculo.gerarId('asv'),
        clinicaId,
        s.servico,
        s.ativo ? 1 : 0,
        Number(s.valorMensal) || 0,
        Number(s.valorUnitario) || 0,
        Number(s.franquia) || 0,
        agora
      );
    }
    res.json(await calculo.buscarServicos(clinicaId));
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro ao salvar serviços:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assinatura/previa?clinicaId=&competencia= — fatura em formação
router.get('/previa', async (req, res) => {
  const { clinicaId } = req.query;
  const competencia = req.query.competencia || calculo.competenciaAtual();
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!calculo.validarCompetencia(competencia)) {
    return res.status(400).json({ error: 'competencia deve estar no formato AAAA-MM' });
  }
  try {
    const [{ itens, valorTotal }, plano, contrato, bytes] = await Promise.all([
    calculo.calcularItens(clinicaId, competencia),
    calculo.buscarPlanoDaClinica(clinicaId),
    calculo.buscarContrato(clinicaId),
    calculo.medirArmazenamentoBytes(clinicaId)]
    );
    res.json({
      clinicaId,
      competencia,
      itens,
      valorTotal,
      plano: plano ?
      {
        id: plano.id,
        nome: plano.nome,
        preco: plano.preco,
        encontrado: plano.encontrado,
        limitePacientes: plano.limitePacientes,
        limites: plano.limites
      } :
      null,
      valorMensalContratado: contrato.valorMensalFixo,
      armazenamentoGb: Number((bytes / calculo.BYTES_GB).toFixed(2)),
      parcial: competencia === calculo.competenciaAtual(),
      diasNoMes: calculo.ultimoDiaCompetencia(competencia)
    });
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro na prévia:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assinatura/faturas?clinicaId=
router.get('/faturas', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    await calculo.garantirTabelas();
    const linhas = await dbGlobal.
    prepare('SELECT * FROM assinatura_faturas WHERE clinicaId = ? ORDER BY competencia DESC').
    all(clinicaId);
    res.json((linhas || []).map(calculo.normalizarFatura));
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro ao listar faturas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assinatura/faturas/fechar — consolida a competência numa fatura
router.post('/faturas/fechar', async (req, res) => {
  const { clinicaId } = req.body || {};
  const competencia = req.body && req.body.competencia || calculo.competenciaAtual();
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!calculo.validarCompetencia(competencia)) {
    return res.status(400).json({ error: 'competencia deve estar no formato AAAA-MM' });
  }
  try {
    res.json(await calculo.fecharFatura(clinicaId, competencia));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, fatura: err.fatura });
  }
});

/**
 * POST /api/assinatura/faturas/:id/informar-pagamento
 * A clínica informa que pagou (PIX estático / transferência). A fatura fica
 * "em análise" até a confirmação do super admin.
 * (/pagar é mantido como sinônimo para telas antigas — também NÃO dá baixa.)
 */
async function informarPagamento(req, res) {
  const { formaPagamento } = req.body || {};
  const formasValidas = ['pix', 'boleto', 'cartao_credito', 'transferencia'];
  if (!formasValidas.includes(formaPagamento)) {
    return res.status(400).json({ error: 'Forma de pagamento inválida' });
  }
  try {
    const fatura = await calculo.buscarFaturaBruta(req.params.id);
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });
    if (fatura.status === 'paga') {
      return res.status(409).json({
        error: 'Esta fatura já está paga.',
        fatura: calculo.normalizarFatura(fatura)
      });
    }
    await dbGlobal.
    prepare(
      `UPDATE assinatura_faturas
            SET status = 'em_analise', formaPagamento = ?, informadoEm = ?
          WHERE id = ? AND status <> 'paga'`
    ).
    run(formaPagamento, new Date().toISOString(), req.params.id);
    const atualizada = await calculo.buscarFaturaBruta(req.params.id);
    console.log(`💳 [assinatura] Pagamento informado: fatura ${fatura.competencia} via ${formaPagamento}`);
    res.json(calculo.normalizarFatura(atualizada));
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro ao informar pagamento:', err.message);
    res.status(500).json({ error: err.message });
  }
}
router.post('/faturas/:id/informar-pagamento', informarPagamento);
router.post('/faturas/:id/pagar', informarPagamento);

// GET /api/assinatura/planos?clinicaId= — planos disponíveis + uso atual
// A clínica vê o próprio consumo contra os limites de cada plano, para
// escolher sabendo o que cabe.
router.get('/planos', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    await calculo.garantirTabelas();
    const [planos, atual, pacientes, usuarios, bytes] = await Promise.all([
    dbGlobal.
    prepare('SELECT id, nome, preco, limitePacientes, limites FROM planos WHERE ativo = 1 ORDER BY ordem ASC').
    all(),
    calculo.buscarPlanoDaClinica(clinicaId),
    calculo.contarNaClinica(clinicaId, 'SELECT COUNT(*) AS total FROM pacientes', []).catch(() => 0),
    dbGlobal.
    prepare('SELECT COUNT(*) AS total FROM usuarios WHERE clinicaId = ? AND ativo = 1').
    get(clinicaId).
    then((r) => Number(r && r.total || 0)).
    catch(() => 0),
    calculo.medirArmazenamentoBytes(clinicaId).catch(() => 0)]
    );
    res.json({
      planoAtualId: atual && atual.encontrado ? atual.id : null,
      uso: {
        pacientes: Number(pacientes) || 0,
        usuarios,
        armazenamentoGb: Number((bytes / calculo.BYTES_GB).toFixed(2))
      },
      planos: (planos || []).map((p) => ({
        id: p.id,
        nome: p.nome,
        preco: Number(p.preco) || 0,
        limitePacientes: p.limitePacientes ? Number(p.limitePacientes) : null,
        limites: calculo.lerJson(p.limites, {})
      }))
    });
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro ao listar planos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assinatura/plano { clinicaId, planoId, usuarioId }
// O administrador da clínica troca o plano. Os limites mudam na hora e a
// mensalidade do novo plano entra na fatura do mês.
router.post('/plano', async (req, res) => {
  const { clinicaId, planoId } = req.body || {};
  const usuario = await exigirAdminDaClinica(req, res, clinicaId);
  if (!usuario) return;
  try {
    await calculo.garantirTabelas();
    const plano = await dbGlobal.
    prepare('SELECT id, nome, preco FROM planos WHERE id = ? AND ativo = 1').
    get(planoId);
    if (!plano) return res.status(400).json({ error: 'Plano inexistente ou inativo.' });
    await dbGlobal.prepare('UPDATE clinicas SET plano = ? WHERE id = ?').run(plano.id, clinicaId);
    console.log(`💳 [assinatura] ${usuario.nome} trocou o plano da clínica ${clinicaId} para ${plano.nome}`);
    res.json({ ok: true, plano: { id: plano.id, nome: plano.nome, preco: Number(plano.preco) || 0 } });
  } catch (err) {
    console.error('💳 ❌ [assinatura] Erro ao trocar plano:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assinatura/uso — registra consumo de serviço cobrado por unidade
router.post('/uso', async (req, res) => {
  const { clinicaId, servico, quantidade, referencia } = req.body || {};
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!calculo.SERVICOS.some((s) => s.id === servico)) {
    return res.status(400).json({ error: 'servico inválido' });
  }
  const ok = await calculo.registrarUso(clinicaId, servico, quantidade, referencia);
  if (!ok) return res.status(500).json({ error: 'Uso não registrado' });
  res.json({ registrado: true });
});

module.exports = router;