// ==================== CÁLCULO DA ASSINATURA (plataforma → clínica) ====================
// Núcleo compartilhado por: tela da clínica (/api/assinatura), gestão do super
// admin (/api/assinatura-gestao), pagamentos (Mercado Pago) e envio de SMS
// (medição de uso). Vive no banco GLOBAL.

const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

// Catálogo dos serviços cobráveis (espelha types/assinatura.ts)
const SERVICOS = [
{ id: 'sistema', nome: 'Taxa de uso do sistema', modelo: 'mensal' },
{ id: 'memed', nome: 'Integração Memed', modelo: 'por_uso', unidade: 'profissional habilitado' },
{ id: 'whatsapp', nome: 'Uso do WhatsApp', modelo: 'mensal' },
{ id: 'sms', nome: 'Uso do SMS', modelo: 'por_uso', unidade: 'SMS (parte cobrada)' },
{ id: 'armazenamento', nome: 'Espaço de documentação', modelo: 'por_uso', unidade: 'GB' },
{ id: 'ponto_biometrico', nome: 'Ponto facial e biométrico', modelo: 'mensal' },
{ id: 'nfse', nome: 'Emissão de NFS-e', modelo: 'por_uso', unidade: 'nota emitida' },
{ id: 'assistente_voz', nome: 'Assistente de voz (IA)', modelo: 'por_uso', unidade: 'pedido atendido' }];


// Preços padrão quando nada foi definido. Valores cobráveis novos (GB) ficam
// ZERO de propósito: nunca cobrar um valor que ninguém definiu.
const PADRAO = {
  sistema: { ativo: true, valorMensal: 0, valorUnitario: 0, franquia: 0 },
  memed: { ativo: false, valorMensal: 0, valorUnitario: 19.9, franquia: 0 },
  whatsapp: { ativo: false, valorMensal: 49.9, valorUnitario: 0, franquia: 0 },
  sms: { ativo: false, valorMensal: 0, valorUnitario: 0.18, franquia: 0 },
  armazenamento: { ativo: true, valorMensal: 0, valorUnitario: 0, franquia: 5 },
  ponto_biometrico: { ativo: false, valorMensal: 39.9, valorUnitario: 0, franquia: 0 },
  nfse: { ativo: false, valorMensal: 0, valorUnitario: 0.9, franquia: 0 },
  // Preço por pedido definido pelo super admin em Gestão de Assinaturas → Preços.
  assistente_voz: { ativo: false, valorMensal: 0, valorUnitario: 0, franquia: 0 }
};

// Plano gratuito para conhecer o sistema — limites aplicados no servidor
const LIMITES_GRATUITO = {
  usuarios: 2,
  armazenamentoGb: 1,
  sms: false,
  diasTeste: 30
};

const BYTES_GB = 1024 * 1024 * 1024;

let tabelasProntas = false;

async function colunasDe(tabela) {
  const linhas = await dbGlobal.prepare(`SHOW COLUMNS FROM ${tabela}`).all();
  return new Set((linhas || []).map((l) => l.Field || l.field));
}

async function adicionarColunas(tabela, colunas) {
  const existentes = await colunasDe(tabela);
  for (const [nome, tipo] of colunas) {
    if (existentes.has(nome)) continue;
    try {
      await dbGlobal.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${tipo}`);
      console.log(`💳 [assinatura] Coluna ${tabela}.${nome} criada`);
    } catch (err) {
      console.warn(`💳 ⚠️ Coluna ${tabela}.${nome} não criada: ${err.message}`);
    }
  }
}

async function garantirTabelas() {
  if (tabelasProntas) return;

  await dbGlobal.exec(`
    CREATE TABLE IF NOT EXISTS assinatura_servicos (
      id VARCHAR(64) NOT NULL,
      clinicaId VARCHAR(64) NOT NULL,
      servico VARCHAR(40) NOT NULL,
      ativo TINYINT(1) DEFAULT 0,
      valorMensal DECIMAL(10,2) DEFAULT 0,
      valorUnitario DECIMAL(10,4) DEFAULT 0,
      franquia INT DEFAULT 0,
      atualizadoEm VARCHAR(40),
      PRIMARY KEY (id),
      UNIQUE KEY uk_clinica_servico (clinicaId, servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbGlobal.exec(`
    CREATE TABLE IF NOT EXISTS assinatura_faturas (
      id VARCHAR(64) NOT NULL,
      clinicaId VARCHAR(64) NOT NULL,
      competencia VARCHAR(7) NOT NULL,
      itens TEXT,
      valorTotal DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'aberta',
      vencimento VARCHAR(20),
      formaPagamento VARCHAR(30),
      pagoEm VARCHAR(40),
      criadoEm VARCHAR(40),
      PRIMARY KEY (id),
      UNIQUE KEY uk_clinica_competencia (clinicaId, competencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbGlobal.exec(`
    CREATE TABLE IF NOT EXISTS assinatura_uso (
      id VARCHAR(64) NOT NULL,
      clinicaId VARCHAR(64) NOT NULL,
      servico VARCHAR(40) NOT NULL,
      quantidade INT DEFAULT 1,
      referencia VARCHAR(120),
      dataHora VARCHAR(40),
      PRIMARY KEY (id),
      KEY idx_clinica_servico_data (clinicaId, servico, dataHora)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Condições comerciais por clínica (valor contratado sobrepõe o plano)
  await dbGlobal.exec(`
    CREATE TABLE IF NOT EXISTS assinatura_clinica (
      clinicaId VARCHAR(64) NOT NULL,
      valorMensalFixo DECIMAL(10,2) NULL,
      observacoes TEXT,
      atualizadoEm VARCHAR(40),
      PRIMARY KEY (clinicaId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await adicionarColunas('assinatura_faturas', [
  ['origemPagamento', 'VARCHAR(30) NULL'],
  ['informadoEm', 'VARCHAR(40) NULL'],
  ['mpPaymentId', 'VARCHAR(64) NULL'],
  ['mpStatus', 'VARCHAR(40) NULL'],
  ['mpPixQr', 'TEXT NULL'],
  ['mpPixQrBase64', 'MEDIUMTEXT NULL'],
  ['mpPixExpira', 'VARCHAR(40) NULL'],
  ['mpCheckoutUrl', 'TEXT NULL'],
  ['nfseStatus', 'VARCHAR(30) NULL'],
  ['nfseApiId', 'VARCHAR(80) NULL'],
  ['nfseNumero', 'VARCHAR(40) NULL'],
  ['nfseLink', 'TEXT NULL'],
  ['nfseErro', 'TEXT NULL'],
  ['nfseAmbiente', 'VARCHAR(20) NULL'],
  ['nfseEmitidaEm', 'VARCHAR(40) NULL']]
  );

  await adicionarColunas('planos', [['limites', 'TEXT NULL']]);

  // ⭐ Plano gratuito garantido. Toda clínica nasce com plano = 'gratuito', e
  // a ausência desse registro zerava a mensalidade sem nenhum aviso.
  try {
    const agora = new Date().toISOString();
    await dbGlobal.
    prepare(
      `INSERT IGNORE INTO planos (id, nome, preco, limitePacientes, recursos, destaque, ativo, ordem, criadoEm, atualizadoEm, limites)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).
    run(
      'gratuito',
      'Grátis',
      0,
      30,
      JSON.stringify([
      'Até 30 pacientes',
      'Até 2 usuários',
      '1 GB de documentos',
      'Agenda e prontuário completos',
      '30 dias para conhecer o sistema']
      ),
      0,
      1,
      0,
      agora,
      agora,
      JSON.stringify(LIMITES_GRATUITO)
    );
    await dbGlobal.
    prepare("UPDATE planos SET limites = ? WHERE id = 'gratuito' AND (limites IS NULL OR limites = '')").
    run(JSON.stringify(LIMITES_GRATUITO));
  } catch (err) {
    console.warn(`💳 ⚠️ Plano gratuito não garantido: ${err.message}`);
  }

  tabelasProntas = true;
}

function gerarId(prefixo) {
  return `${prefixo}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function validarCompetencia(valor) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valor || ''));
}

function ultimoDiaCompetencia(competencia) {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function lerJson(valor, padrao) {
  if (!valor) return padrao;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch (e) {
    return padrao;
  }
}

async function buscarPrecosGlobais() {
  try {
    const row = await dbGlobal.
    prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
    get('precos_assinatura');
    const precos = lerJson(row && row.valor, {});
    return precos && typeof precos === 'object' ? precos : {};
  } catch (e) {
    return {};
  }
}

async function buscarContrato(clinicaId) {
  await garantirTabelas();
  const row = await dbGlobal.
  prepare('SELECT * FROM assinatura_clinica WHERE clinicaId = ?').
  get(clinicaId).
  catch(() => null);
  const fixo = row && row.valorMensalFixo !== null && row.valorMensalFixo !== undefined ?
  Number(row.valorMensalFixo) :
  null;
  return {
    valorMensalFixo: Number.isFinite(fixo) ? fixo : null,
    observacoes: row && row.observacoes || ''
  };
}

/** Plano da clínica — aceita o ID ou o NOME gravado em clinicas.plano */
async function buscarPlanoDaClinica(clinicaId) {
  await garantirTabelas();
  const clinica = await dbGlobal.
  prepare('SELECT plano, criadoEm FROM clinicas WHERE id = ?').
  get(clinicaId).
  catch(() => null);
  const referencia = String(clinica && clinica.plano || '').trim();
  if (!referencia) return null;

  const plano = await dbGlobal.
  prepare('SELECT * FROM planos WHERE id = ? OR LOWER(nome) = LOWER(?) LIMIT 1').
  get(referencia, referencia).
  catch(() => null);
  if (!plano) {
    return { id: referencia, nome: referencia, preco: 0, encontrado: false, limites: {}, limitePacientes: null };
  }
  return {
    id: plano.id,
    nome: plano.nome,
    preco: Number(plano.preco) || 0,
    encontrado: true,
    limitePacientes: plano.limitePacientes === null || plano.limitePacientes === undefined ?
    null :
    Number(plano.limitePacientes),
    limites: lerJson(plano.limites, {}) || {},
    clinicaCriadaEm: clinica && clinica.criadoEm
  };
}

/** Consulta simples no banco DA CLÍNICA, tolerando tabela ausente */
function consultarNaClinica(clinicaId, sql, params) {
  return new Promise((resolve) => {
    try {
      const db = getClinicaDB(clinicaId);
      db.get(sql, params, (err, row) => {
        if (err) {
          console.log(`💳 [assinatura] Consulta ignorada (${err.code || err.message})`);
          return resolve(null);
        }
        resolve(row || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function contarNaClinica(clinicaId, sql, params) {
  const row = await consultarNaClinica(clinicaId, sql, params);
  return Number(row && (row.total ?? row.TOTAL) || 0);
}

/** Ativação real: o interruptor do próprio serviço manda */
async function lerAtivacaoReal(clinicaId) {
  const ativo = {};
  ativo.whatsapp = Boolean(
    await contarNaClinica(clinicaId, 'SELECT COUNT(*) AS total FROM whatsapp_config WHERE ativo = 1', [])
  );
  ativo.sms = Boolean(
    await contarNaClinica(clinicaId, 'SELECT COUNT(*) AS total FROM sms_config WHERE ativo = 1', [])
  );
  try {
    const row = await dbGlobal.
    prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
    get('memed_config');
    const config = lerJson(row && row.valor, null);
    ativo.memed = Boolean(config && config.ativo);
  } catch (e) {
    ativo.memed = false;
  }
  // Assistente de voz: o administrador da clínica liga e desliga.
  try {
    const row = await dbGlobal.
    prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
    get(`assistente_voz_${clinicaId}`);
    const config = lerJson(row && row.valor, null);
    ativo.assistente_voz = Boolean(config && config.ativo);
  } catch (e) {
    ativo.assistente_voz = false;
  }
  ativo.sistema = true;
  ativo.armazenamento = true;
  return ativo;
}

async function buscarServicos(clinicaId) {
  await garantirTabelas();
  const linhas = await dbGlobal.
  prepare('SELECT * FROM assinatura_servicos WHERE clinicaId = ?').
  all(clinicaId);
  const porServico = new Map((linhas || []).map((l) => [l.servico, l]));

  const [plano, ativacaoReal, precosGlobais, contrato] = await Promise.all([
  buscarPlanoDaClinica(clinicaId),
  lerAtivacaoReal(clinicaId),
  buscarPrecosGlobais(),
  buscarContrato(clinicaId)]
  );

  return SERVICOS.map((s) => {
    const salvo = porServico.get(s.id);
    const padrao = { ...PADRAO[s.id], ...(precosGlobais[s.id] || {}) };
    const contratado = salvo ? Boolean(Number(salvo.ativo)) : padrao.ativo;
    const habilitado = ativacaoReal[s.id];
    const ativo = habilitado === undefined ? contratado : habilitado;

    let valorMensal = Number(salvo ? salvo.valorMensal : padrao.valorMensal) || 0;
    let origemValor = 'tabela';
    if (s.id === 'sistema') {
      // Valor contratado com a clínica tem prioridade sobre o preço do plano
      if (contrato.valorMensalFixo !== null) {
        valorMensal = contrato.valorMensalFixo;
        origemValor = 'contrato';
      } else {
        valorMensal = plano && plano.encontrado ? plano.preco : 0;
        origemValor = 'plano';
      }
    }

    return {
      servico: s.id,
      ativo,
      contratado,
      habilitado: habilitado === undefined ? null : habilitado,
      valorMensal,
      valorUnitario: Number(salvo ? salvo.valorUnitario : padrao.valorUnitario) || 0,
      franquia: Number(salvo ? salvo.franquia : padrao.franquia) || 0,
      origemValor,
      planoNome: s.id === 'sistema' && plano && plano.encontrado ? plano.nome : undefined,
      semPlano:
      s.id === 'sistema' ?
      contrato.valorMensalFixo === null && !(plano && plano.encontrado) :
      undefined
    };
  });
}

/** Registra consumo cobrado por unidade (SMS, NFS-e...) — nunca lança */
async function registrarUso(clinicaId, servico, quantidade, referencia) {
  try {
    if (!clinicaId || !SERVICOS.some((s) => s.id === servico)) return false;
    await garantirTabelas();
    await dbGlobal.
    prepare(
      `INSERT INTO assinatura_uso (id, clinicaId, servico, quantidade, referencia, dataHora)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).
    run(
      gerarId('auso'),
      clinicaId,
      servico,
      Math.max(1, Number(quantidade) || 1),
      referencia ? String(referencia).slice(0, 120) : null,
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.warn(`💳 ⚠️ Uso de ${servico} não registrado: ${err.message}`);
    return false;
  }
}

async function somarUsoRegistrado(clinicaId, servico, competencia) {
  await garantirTabelas();
  const row = await dbGlobal.
  prepare(
    `SELECT COALESCE(SUM(quantidade), 0) AS total FROM assinatura_uso
        WHERE clinicaId = ? AND servico = ? AND dataHora LIKE ?`
  ).
  get(clinicaId, servico, `${competencia}%`);
  return Number(row && row.total || 0);
}

/**
 * SMS: medidos no ENVIO (assinatura_uso, com as partes cobradas). Envios
 * anteriores à medição continuam contados pelo histórico de mensagens —
 * apenas até o primeiro registro medido, para nada ser contado duas vezes.
 */
async function medirSms(clinicaId, competencia) {
  const medido = await somarUsoRegistrado(clinicaId, 'sms', competencia);
  const primeiro = await dbGlobal.
  prepare(
    `SELECT MIN(dataHora) AS inicio FROM assinatura_uso WHERE clinicaId = ? AND servico = 'sms'`
  ).
  get(clinicaId).
  catch(() => null);
  const corte = primeiro && primeiro.inicio ? String(primeiro.inicio) : null;

  // Prefixo do mês funciona com "2026-09-01T..." e "2026-09-01 ..." igualmente
  const legado = corte && corte.slice(0, 7) < competencia ?
  0 :
  await contarNaClinica(
    clinicaId,
    `SELECT COUNT(*) AS total FROM mensagens
        WHERE conteudo LIKE '[SMS]%' AND status <> 'erro'
          AND dataHora LIKE ? ${corte ? 'AND REPLACE(dataHora, \' \', \'T\') < ?' : ''}`,
    corte ? [`${competencia}%`, corte] : [`${competencia}%`]
  );
  return medido + legado;
}

/** Espaço ocupado pelos documentos da clínica, em bytes */
async function medirArmazenamentoBytes(clinicaId) {
  const row = await consultarNaClinica(
    clinicaId,
    'SELECT COALESCE(SUM(tamanho), 0) AS total FROM documentos',
    []
  );
  return Number(row && (row.total ?? row.TOTAL) || 0);
}

async function medirUso(clinicaId, servico, competencia) {
  if (servico === 'sms') return await medirSms(clinicaId, competencia);

  if (servico === 'armazenamento') {
    const bytes = await medirArmazenamentoBytes(clinicaId);
    return Number((bytes / BYTES_GB).toFixed(2));
  }

  if (servico === 'memed') {
    const row = await dbGlobal.
    prepare(
      `SELECT COUNT(DISTINCT mp.usuarioId) AS total
           FROM memed_profissionais mp
           JOIN usuarios u ON u.id = mp.usuarioId
          WHERE u.clinicaId = ?`
    ).
    get(clinicaId).
    catch(() => null);
    return Number(row && row.total || 0);
  }

  return await somarUsoRegistrado(clinicaId, servico, competencia);
}

async function calcularItens(clinicaId, competencia) {
  const servicos = await buscarServicos(clinicaId);
  const itens = [];

  for (const config of servicos) {
    if (!config.ativo) continue;
    const meta = SERVICOS.find((s) => s.id === config.servico);

    if (meta.modelo === 'mensal') {
      itens.push({
        servico: config.servico,
        nome:
        config.servico === 'sistema' && config.planoNome ?
        `${meta.nome} — plano ${config.planoNome}` :
        meta.nome,
        modelo: 'mensal',
        quantidade: 1,
        quantidadeCobravel: 1,
        valorUnitario: config.valorMensal,
        valor: Number(Number(config.valorMensal).toFixed(2))
      });
      continue;
    }

    const quantidade = await medirUso(clinicaId, config.servico, competencia);
    const cobravel = Number(Math.max(0, quantidade - config.franquia).toFixed(2));
    itens.push({
      servico: config.servico,
      nome: meta.nome,
      modelo: 'por_uso',
      unidade: meta.unidade,
      quantidade,
      franquia: config.franquia,
      quantidadeCobravel: cobravel,
      valorUnitario: config.valorUnitario,
      valor: Number((cobravel * config.valorUnitario).toFixed(2))
    });
  }

  // Item por uso sem nenhum consumo e sem valor não polui a fatura
  const visiveis = itens.filter(
    (i) => i.modelo === 'mensal' || i.quantidade > 0 || i.valor > 0
  );
  const valorTotal = Number(visiveis.reduce((soma, i) => soma + i.valor, 0).toFixed(2));
  return { itens: visiveis, valorTotal };
}

function normalizarFatura(linha) {
  const itens = lerJson(linha.itens, []) || [];
  const hoje = new Date().toISOString().slice(0, 10);
  const vencida = linha.status === 'aberta' && linha.vencimento && linha.vencimento < hoje;
  return {
    id: linha.id,
    clinicaId: linha.clinicaId,
    clinicaNome: linha.clinicaNome || undefined,
    competencia: linha.competencia,
    itens,
    valorTotal: Number(linha.valorTotal) || 0,
    status: vencida ? 'vencida' : linha.status,
    vencimento: linha.vencimento,
    formaPagamento: linha.formaPagamento || null,
    pagoEm: linha.pagoEm || null,
    informadoEm: linha.informadoEm || null,
    origemPagamento: linha.origemPagamento || null,
    criadoEm: linha.criadoEm,
    mercadoPago: linha.mpPaymentId ?
    { paymentId: linha.mpPaymentId, status: linha.mpStatus || null } :
    null,
    nfse: linha.nfseStatus ?
    {
      status: linha.nfseStatus,
      numero: linha.nfseNumero || null,
      link: linha.nfseLink || null,
      erro: linha.nfseErro || null,
      ambiente: linha.nfseAmbiente || null,
      emitidaEm: linha.nfseEmitidaEm || null
    } :
    null
  };
}

async function buscarFaturaBruta(faturaId) {
  await garantirTabelas();
  return await dbGlobal.prepare('SELECT * FROM assinatura_faturas WHERE id = ?').get(faturaId);
}

/** Fecha (ou refecha) a competência numa fatura. Lança Error com .status */
async function fecharFatura(clinicaId, competencia) {
  await garantirTabelas();
  const existente = await dbGlobal.
  prepare('SELECT * FROM assinatura_faturas WHERE clinicaId = ? AND competencia = ?').
  get(clinicaId, competencia);

  if (existente && ['paga', 'em_analise'].includes(existente.status)) {
    const erro = new Error(
      existente.status === 'paga' ?
      'A fatura desta competência já está paga.' :
      'Há um pagamento informado em análise para esta competência.'
    );
    erro.status = 409;
    erro.fatura = normalizarFatura(existente);
    throw erro;
  }

  const { itens, valorTotal } = await calcularItens(clinicaId, competencia);
  if (valorTotal <= 0) {
    const erro = new Error(
      'Nada a cobrar nesta competência (plano gratuito ou serviços sem valor definido).'
    );
    erro.status = 400;
    throw erro;
  }

  const [ano, mes] = competencia.split('-').map(Number);
  const vencimento = new Date(Date.UTC(ano, mes, 10)).toISOString().slice(0, 10);
  const id = existente ? existente.id : gerarId('afat');

  await dbGlobal.
  prepare(
    `INSERT INTO assinatura_faturas
         (id, clinicaId, competencia, itens, valorTotal, status, vencimento, criadoEm)
       VALUES (?, ?, ?, ?, ?, 'aberta', ?, ?)
       ON DUPLICATE KEY UPDATE
         itens = VALUES(itens), valorTotal = VALUES(valorTotal),
         vencimento = VALUES(vencimento),
         mpPaymentId = NULL, mpStatus = NULL, mpPixQr = NULL, mpPixQrBase64 = NULL,
         mpPixExpira = NULL, mpCheckoutUrl = NULL`
  ).
  run(id, clinicaId, competencia, JSON.stringify(itens), valorTotal, vencimento, new Date().toISOString());

  const salva = await dbGlobal.
  prepare('SELECT * FROM assinatura_faturas WHERE clinicaId = ? AND competencia = ?').
  get(clinicaId, competencia);
  console.log(`💳 ✅ [assinatura] Fatura ${clinicaId} ${competencia} fechada: R$ ${valorTotal}`);
  return normalizarFatura(salva);
}

module.exports = {
  SERVICOS,
  BYTES_GB,
  LIMITES_GRATUITO,
  garantirTabelas,
  gerarId,
  competenciaAtual,
  validarCompetencia,
  ultimoDiaCompetencia,
  lerJson,
  buscarContrato,
  buscarPlanoDaClinica,
  buscarServicos,
  registrarUso,
  medirUso,
  medirArmazenamentoBytes,
  calcularItens,
  normalizarFatura,
  buscarFaturaBruta,
  fecharFatura,
  consultarNaClinica,
  contarNaClinica
};