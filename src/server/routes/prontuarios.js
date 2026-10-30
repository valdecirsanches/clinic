
// ==================== ROTAS DE PRONTUÁRIOS ====================
// Prontuário = dados gerais do paciente (alergias, doenças crônicas, etc.)
// A consulta É o atendimento — não existe mais tabela atendimentos separada.
// Dados clínicos ficam nas tabelas: anamneses, exames_fisicos, diagnosticos,
// atendimento_exames_solicitados, evolucoes, atendimento_prescricoes (todas com FK consultaId)

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Helper: Verifica se um valor é "vazio" (null, undefined, "", "null", "undefined", "0", whitespace)
function isEmptyValue(val) {
  if (val === null || val === undefined) return true;
  const str = String(val).trim().toLowerCase();
  return str === '' || str === 'null' || str === 'undefined' || str === '0';
}

// ⭐ Helpers promisificados sobre o wrapper db (estilo callback)
function dbAll(db, sql, params = []) {
  return new Promise((resolve) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('⚠️ [prontuarios] dbAll falhou:', err.message, '| SQL:', sql);
        return resolve([]);
      }
      resolve(rows || []);
    });
  });
}

// ⭐ Helper: Extrai profissionalId de uma consulta (verifica múltiplos campos)
function extrairProfissionalId(consulta) {
  // Verifica profissionalId primeiro
  if (!isEmptyValue(consulta.profissionalId)) return consulta.profissionalId;
  // Fallback: responsavelId (campo alternativo que pode existir em alguns bancos)
  if (!isEmptyValue(consulta.responsavelId)) return consulta.responsavelId;
  // Fallback: medicoId
  if (!isEmptyValue(consulta.medicoId)) return consulta.medicoId;
  return null;
}

// ⭐ Helper: Resolve profissionalId e nome a partir das consultas do paciente
function resolverProfissionalDasConsultas(consultas, prontuarioId) {
  let profissionalId = null;
  let profissional = null;

  if (!consultas || consultas.length === 0) return { profissionalId, profissional };

  // 1) Busca a primeira consulta que tenha profissionalId (ou campo alternativo)
  for (const c of consultas) {
    const pid = extrairProfissionalId(c);
    if (pid) {
      profissionalId = pid;
      profissional = c.profissional || '';
      console.log(`🔍 [Fallback] Prontuário ${prontuarioId} → profissionalId="${pid}" encontrado na consulta ${c.id} (campo: ${c.profissionalId ? 'profissionalId' : c.responsavelId ? 'responsavelId' : 'medicoId'})`);
      break;
    }
  }

  // 2) Se não encontrou ID, pega pelo menos o NOME do profissional
  if (!profissionalId) {
    const consultaComNome = consultas.find((c) => !isEmptyValue(c.profissional));
    if (consultaComNome) {
      profissional = consultaComNome.profissional.trim();
      console.log(`🔍 [Fallback] Prontuário ${prontuarioId} → só nome encontrado: "${profissional}" (consulta ${consultaComNome.id})`);
    }
  }

  return { profissionalId, profissional };
}

// ⭐ Constrói um mapa { consultaId -> registro mais recente } a partir de uma lista de linhas
// Linhas vêm ordenadas por data/criadoEm DESC, então a PRIMEIRA por consultaId já é a mais recente.
function indexarPorConsulta(rows) {
  const mapa = {};
  for (const row of rows || []) {
    const cid = row.consultaId;
    if (cid && !mapa[cid]) mapa[cid] = row;
  }
  return mapa;
}

// ⭐ Ordena por criadoEm/data DESC (mais recente primeiro). Tolerante a valores ausentes.
function ordenarRecenteDesc(rows) {
  return (rows || []).slice().sort((a, b) => {
    const da = String(a.criadoEm || a.data || a.atualizadoEm || '');
    const dbb = String(b.criadoEm || b.data || b.atualizadoEm || '');
    return dbb.localeCompare(da);
  });
}

// ⭐ Indexa por consultaId escolhendo, para cada consulta, o registro COM conteúdo.
// Funde linhas de múltiplas tabelas (ex.: anamneses + atendimento_anamneses) sem perder dados.
// Se nenhum registro da consulta tiver conteúdo, mantém o mais recente para não sumir o registro.
function indexarComConteudo(rows, temConteudoFn) {
  const ordenadas = ordenarRecenteDesc(rows);
  const mapa = {};
  for (const row of ordenadas) {
    const cid = row.consultaId;
    if (!cid) continue;
    const atual = mapa[cid];
    if (!atual) {
      mapa[cid] = row;
      continue;
    }
    // Se o já escolhido não tem conteúdo mas este tem, troca.
    if (!temConteudoFn(atual) && temConteudoFn(row)) {
      mapa[cid] = row;
    }
  }
  return mapa;
}

// ⭐ Monta a string do diagnóstico a partir do registro da tabela diagnosticos
function montarDiagnostico(diag) {
  if (!diag) return null;
  const partes = [];
  if (diag.diagnosticoPrincipalCodigo || diag.diagnosticoPrincipalDescricao) {
    const cod = diag.diagnosticoPrincipalCodigo || '';
    const desc = diag.diagnosticoPrincipalDescricao || '';
    partes.push([cod, desc].filter(Boolean).join(' - '));
  }
  // Outros diagnósticos (JSON ou texto)
  if (diag.outrosDiagnosticos) {
    try {
      const parsed = JSON.parse(diag.outrosDiagnosticos);
      if (Array.isArray(parsed)) {
        parsed.forEach((d) => {
          if (d && (d.codigo || d.descricao)) {
            partes.push([d.codigo || '', d.descricao || ''].filter(Boolean).join(' - '));
          }
        });
      }
    } catch (e) {
      // texto simples
      if (String(diag.outrosDiagnosticos).trim()) partes.push(String(diag.outrosDiagnosticos).trim());
    }
  }
  if (diag.observacoes && String(diag.observacoes).trim()) partes.push(diag.observacoes);
  return partes.length > 0 ? partes.join('\n') : null;
}

// ⭐ Monta o JSON da prescrição no formato esperado pelo frontend
function montarPrescricao(presc) {
  if (!presc) return null;
  let medicamentos = [];
  if (presc.medicamentos) {
    try {
      const parsed = typeof presc.medicamentos === 'string' ? JSON.parse(presc.medicamentos) : presc.medicamentos;
      if (Array.isArray(parsed)) medicamentos = parsed;
    } catch (e) {/* ignora */}
  }
  const temConteudo =
  presc.descricao && String(presc.descricao).trim() ||
  presc.generico && String(presc.generico).trim() ||
  medicamentos.length > 0;
  if (!temConteudo) return null;
  return JSON.stringify({
    descricao: presc.descricao || '',
    generico: presc.generico || '',
    controleEspecial: presc.controleEspecial === 1 || presc.controleEspecial === true,
    medicamentos
  });
}

// ⭐ Monta o JSON de exames solicitados no formato esperado pelo frontend
function montarExames(ex) {
  if (!ex) return null;
  const temConteudo = ex.descricao || ex.pedido || ex.justificativa || ex.cid10;
  if (!temConteudo) return null;
  return JSON.stringify({
    descricao: ex.descricao || '',
    pedido: ex.pedido || '',
    justificativa: ex.justificativa || '',
    cid10: ex.cid10 || ''
  });
}

// ⭐ Monta a string do exame físico
function montarExameFisico(ef) {
  if (!ef) return null;
  const partes = [];
  if (ef.altura) partes.push(`Altura: ${ef.altura}m`);
  if (ef.peso) partes.push(`Peso: ${ef.peso}kg`);
  if (ef.imc) partes.push(`IMC: ${ef.imc}`);
  if (ef.pressaoArterial) partes.push(`PA: ${ef.pressaoArterial}`);
  if (ef.pulso) partes.push(`Pulso: ${ef.pulso}bpm`);
  if (ef.temperatura) partes.push(`Temp: ${ef.temperatura}°C`);
  if (ef.saturacaoO2) partes.push(`SpO₂: ${ef.saturacaoO2}%`);
  if (ef.frequenciaRespiratoria) partes.push(`FR: ${ef.frequenciaRespiratoria}irpm`);
  if (ef.glicemia) partes.push(`Glicemia: ${ef.glicemia}mg/dL`);
  if (ef.observacoesGerais) partes.push(ef.observacoesGerais);
  return partes.length > 0 ? partes.join(' | ') : null;
}

// ⭐⭐⭐ NÚCLEO DO FIX: Enriquece cada consulta (atendimento) com os dados clínicos
// guardados nas tabelas separadas (anamnese, exame físico, diagnóstico, evolução,
// prescrição, exames solicitados) — ligados por consultaId. Sem isso, o histórico
// e o "Resumo" de cada atendimento aparecem vazios.
async function enriquecerAtendimentos(db, consultas, pacienteId) {
  const lista = (consultas || []).map((c) => ({
    ...c,
    odontograma: c.odontograma ? safeJSONParse(c.odontograma) : null
  }));

  const ids = lista.map((c) => c.id).filter(Boolean);

  // ⭐⭐⭐ INDEPENDÊNCIA TOTAL: o prontuário deve contemplar TODOS os registros
  // clínicos do paciente — inclusive os que NÃO estão ligados a nenhuma consulta
  // retornada (consulta apagada/ausente). Por isso, além de buscar por consultaId,
  // também varremos cada tabela clínica por pacienteId e sintetizamos entradas
  // "avulsas" na linha do tempo para qualquer registro órfão. Nada fica escondido,
  // independente de assinatura ou da existência da consulta.
  if (ids.length === 0 && !pacienteId) return lista;

  // placeholders só é usado quando há consultas; com lista vazia evitamos o IN ().
  const placeholders = ids.length > 0 ? ids.map(() => '?').join(',') : "''";

  // ⭐⭐⭐ IMPORTANTE: A importação do app antigo gravou os dados de forma INCONSISTENTE.
  // Algumas categorias foram para as tabelas curtas (anamneses, diagnosticos, exames_fisicos,
  // evolucoes) e outras para a família "atendimento_*" (atendimento_anamneses,
  // atendimento_evolucoes, etc.). Para NÃO perder nada do que já está salvo — independente
  // de onde a importação depositou — lemos de AMBAS as famílias e fundimos por consultaId.
  // Cada query é tolerante a falha (retorna [] se a tabela não existir).
  // ⭐ Cada tabela é buscada por consultaId (registros do histórico de consultas)
  // OU por pacienteId (garante que registros avulsos/órfãos do paciente também
  // entrem na linha do tempo, independente de existir a consulta).
  const filtroSql = `WHERE consultaId IN (${placeholders})${pacienteId ? ' OR pacienteId = ?' : ''}`;
  const filtroParams = pacienteId ? [...ids, pacienteId] : ids;

  const [
  anamnesesA, anamnesesB,
  examesFisicosA, examesFisicosB,
  diagnosticosA, diagnosticosB,
  evolucoesA, evolucoesB,
  prescricoes,
  examesSolic,
  relatorios,
  atestados] =
  await Promise.all([
  dbAll(db, `SELECT * FROM anamneses ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_anamneses ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM exames_fisicos ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_exames_fisicos ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM diagnosticos ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_diagnosticos ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM evolucoes ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_evolucoes ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_prescricoes ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_exames_solicitados ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_relatorios ${filtroSql}`, filtroParams),
  dbAll(db, `SELECT * FROM atendimento_atestados ${filtroSql}`, filtroParams)]
  );

  // Funções "tem conteúdo?" por categoria — usadas para escolher o melhor registro entre as tabelas.
  const anamneseTemConteudo = (a) => !!(a && (a.queixaPrincipal || a.historiaQueixa || a.historicoDoencas));
  const exameFisicoTemConteudo = (e) => !!(e && (e.altura || e.peso || e.imc || e.pressaoArterial || e.pulso || e.observacoesGerais));
  const diagnosticoTemConteudo = (d) => !!(d && (d.diagnosticoPrincipalCodigo || d.diagnosticoPrincipalDescricao || d.outrosDiagnosticos || d.observacoes));
  const evolucaoTemConteudo = (ev) => !!(ev && (ev.evolucao || ev.descricao));

  const mapAnamnese = indexarComConteudo([...anamnesesA, ...anamnesesB], anamneseTemConteudo);
  const mapExameFisico = indexarComConteudo([...examesFisicosA, ...examesFisicosB], exameFisicoTemConteudo);
  const mapDiagnostico = indexarComConteudo([...diagnosticosA, ...diagnosticosB], diagnosticoTemConteudo);
  const mapEvolucao = indexarComConteudo([...evolucoesA, ...evolucoesB], evolucaoTemConteudo);
  const mapPrescricao = indexarPorConsulta(ordenarRecenteDesc(prescricoes));
  const mapExames = indexarPorConsulta(ordenarRecenteDesc(examesSolic));
  const mapRelatorios = indexarPorConsulta(ordenarRecenteDesc(relatorios));
  const mapAtestados = indexarPorConsulta(ordenarRecenteDesc(atestados));

  // ⭐ FIX: Deriva o TIPO de cada atendimento pelo TIPO DO PROFISSIONAL (autoridade).
  // O campo consultas.tipo é vazio/errado em registros importados, o que fazia todo o
  // histórico aparecer como "Consulta Odontológica" mesmo para médicos/ginecologistas.
  // Dentista → odontologica; qualquer outro (medico, etc.) → medica. Sem profissional
  // conhecido, mantém o valor salvo e, em último caso, assume medica (default seguro).
  const profIds = Array.from(new Set(lista.map((c) => extrairProfissionalId(c)).filter(Boolean)));
  const profTipoMap = {};
  if (profIds.length > 0) {
    const ph = profIds.map(() => '?').join(',');
    const profs = await dbAll(db, `SELECT id, tipo FROM usuarios WHERE id IN (${ph})`, profIds);
    for (const p of profs) profTipoMap[String(p.id)] = (p.tipo || '').toString().trim().toLowerCase();
  }
  const derivarTipo = (c) => {
    const pid = extrairProfissionalId(c);
    const pt = pid ? profTipoMap[String(pid)] : '';
    if (pt === 'dentista') return 'odontologica';
    if (pt === 'medico') return 'medica';
    const salvo = (c.tipo || '').toString().trim().toLowerCase();
    return salvo === 'odontologica' ? 'odontologica' : 'medica';
  };

  // ⭐⭐⭐ UMA ENTRADA POR ATENDIMENTO (consulta). Cada consulta é UM atendimento e
  // aparece como UMA ÚNICA linha na linha do tempo, reunindo TODOS os seus dados
  // clínicos (anamnese + exame físico + diagnóstico + evolução + prescrição +
  // exames + relatório + atestado). NÃO fragmentamos um atendimento em várias
  // linhas (uma por campo) — isso inflava o contador e confundia o histórico.
  // Nada é escondido: para cada categoria, escolhemos o registro COM conteúdo
  // (via mapas indexarComConteudo), e caímos para os dados legados da própria
  // consulta quando não há registro nas tabelas clínicas.
  const timelinePorConsulta = lista.map((c) => {
    const tipo = derivarTipo(c);

    const anamnese = mapAnamnese[c.id];
    const exameFisicoRec = mapExameFisico[c.id];
    const diagnosticoRec = mapDiagnostico[c.id];
    const evolucaoRec = mapEvolucao[c.id];
    const prescricaoRec = mapPrescricao[c.id];
    const examesRec = mapExames[c.id];
    const relatorioRec = mapRelatorios[c.id];
    const atestadoRec = mapAtestados[c.id];

    // Anamnese: queixa + HDA (com fallback legado)
    const queixaPrincipal =
    anamnese && anamnese.queixaPrincipal || c.queixaPrincipal || null;
    // Evolução tem prioridade sobre a HDA da anamnese para o campo "historico".
    const evolucaoTexto = evolucaoRec ? evolucaoRec.evolucao || evolucaoRec.descricao || null : null;
    const hdaTexto = anamnese && anamnese.historiaQueixa || null;
    const historico = evolucaoTexto || hdaTexto || c.historico || null;

    const exameFisico = exameFisicoRec ? montarExameFisico(exameFisicoRec) || null : c.exameFisico || null;
    const diagnostico = diagnosticoRec ? montarDiagnostico(diagnosticoRec) || null : c.diagnostico || null;
    const prescricoes = prescricaoRec ? montarPrescricao(prescricaoRec) || null : c.prescricoes || null;
    const exames = examesRec ? montarExames(examesRec) || null : c.exames || null;
    const relatorio = relatorioRec ?
    JSON.stringify({ titulo: relatorioRec.titulo || '', tipo: relatorioRec.tipo || '', destinatario: relatorioRec.destinatario || '', conteudo: relatorioRec.conteudo || '' }) :
    null;
    const atestado = atestadoRec ?
    JSON.stringify({ medico: atestadoRec.medico || '', cid10: atestadoRec.cid10 || '', qtdeDias: atestadoRec.qtdeDias || 0, dataReferencia: atestadoRec.dataReferencia || '' }) :
    null;

    return {
      ...c,
      tipo,
      consultaId: c.id,
      queixaPrincipal,
      historico,
      exameFisico,
      diagnostico,
      prescricoes,
      exames,
      relatorio,
      atestado
    };
  });

  // ⭐⭐⭐ REGISTROS AVULSOS / ÓRFÃOS: qualquer registro clínico do paciente cujo
  // consultaId NÃO esteja entre as consultas retornadas. Sem isto, esses registros
  // ficariam invisíveis — exatamente a falha de "não contemplar todos os atendimentos".
  // Cada um vira sua própria entrada na linha do tempo, com o profissional e o dado.
  const idsSet = new Set(ids);
  // Órfão = registro do paciente que NÃO pertence a nenhuma consulta retornada
  // (consultaId ausente OU apontando para uma consulta que não veio na lista).
  const ehOrfao = (r) => r && !(r.consultaId && idsSet.has(r.consultaId));
  // Resolve nome do profissional pelo id quando o registro não trouxer o nome.
  const profNomeMap = {};
  const orfaoProfIds = new Set();
  const coletarProfIds = (arr) => (arr || []).forEach((r) => {
    if (ehOrfao(r) && isEmptyValue(r.profissional) && !isEmptyValue(r.profissionalId)) {
      orfaoProfIds.add(String(r.profissionalId));
    }
  });
  [anamnesesA, anamnesesB, examesFisicosA, examesFisicosB, diagnosticosA, diagnosticosB,
  evolucoesA, evolucoesB, prescricoes, examesSolic, relatorios, atestados].forEach(coletarProfIds);
  if (orfaoProfIds.size > 0) {
    const ph = Array.from(orfaoProfIds).map(() => '?').join(',');
    const profs = await dbAll(db, `SELECT id, nome FROM usuarios WHERE id IN (${ph})`, Array.from(orfaoProfIds));
    for (const p of profs) profNomeMap[String(p.id)] = p.nome || '';
  }
  // ⭐ Agrupa órfãos por consultaId (quando existe) ou pelo próprio id do registro,
  // para que cada atendimento avulso também vire UMA linha reunindo seus dados —
  // exatamente como as consultas. Nunca uma linha por campo.
  const orfaosMap = {};
  const obterOrfao = (r) => {
    const chave = r.consultaId ? `c:${r.consultaId}` : `r:${r.id}`;
    if (!orfaosMap[chave]) {
      orfaosMap[chave] = {
        id: r.consultaId || r.id,
        consultaId: r.consultaId || null,
        pacienteId: r.pacienteId,
        // Sem consulta conhecida, assume médica (default seguro).
        tipo: 'medica',
        data: r.data || r.criadoEm || null,
        criadoEm: r.criadoEm || r.data || null,
        profissional: r.profissional || profNomeMap[String(r.profissionalId)] || null,
        profissionalId: r.profissionalId || null,
        assinaturaPaciente: null,
        dataAssinatura: null,
        queixaPrincipal: null, historico: null, exameFisico: null, diagnostico: null,
        prescricoes: null, exames: null, relatorio: null, atestado: null
      };
    }
    return orfaosMap[chave];
  };
  const mesclarOrfao = (r, campos) => {
    const entry = obterOrfao(r);
    for (const [k, v] of Object.entries(campos)) {
      if (v != null && entry[k] == null) entry[k] = v;
    }
    if (!entry.profissional) entry.profissional = r.profissional || profNomeMap[String(r.profissionalId)] || null;
  };
  [...anamnesesA, ...anamnesesB].filter((r) => ehOrfao(r) && anamneseTemConteudo(r)).
  forEach((r) => mesclarOrfao(r, { queixaPrincipal: r.queixaPrincipal || null, historico: r.historiaQueixa || null }));
  [...examesFisicosA, ...examesFisicosB].filter((r) => ehOrfao(r) && exameFisicoTemConteudo(r)).
  forEach((r) => mesclarOrfao(r, { exameFisico: montarExameFisico(r) || null }));
  [...diagnosticosA, ...diagnosticosB].filter((r) => ehOrfao(r) && diagnosticoTemConteudo(r)).
  forEach((r) => mesclarOrfao(r, { diagnostico: montarDiagnostico(r) || null }));
  [...evolucoesA, ...evolucoesB].filter((r) => ehOrfao(r) && evolucaoTemConteudo(r)).
  forEach((r) => mesclarOrfao(r, { historico: r.evolucao || r.descricao || null }));
  prescricoes.filter(ehOrfao).forEach((r) => {const p = montarPrescricao(r);if (p) mesclarOrfao(r, { prescricoes: p });});
  examesSolic.filter(ehOrfao).forEach((r) => {const e = montarExames(r);if (e) mesclarOrfao(r, { exames: e });});
  relatorios.filter(ehOrfao).forEach((r) => mesclarOrfao(r, {
    relatorio: JSON.stringify({ titulo: r.titulo || '', tipo: r.tipo || '', destinatario: r.destinatario || '', conteudo: r.conteudo || '' })
  }));
  atestados.filter(ehOrfao).forEach((r) => mesclarOrfao(r, {
    atestado: JSON.stringify({ medico: r.medico || '', cid10: r.cid10 || '', qtdeDias: r.qtdeDias || 0, dataReferencia: r.dataReferencia || '' })
  }));
  const orfaos = Object.values(orfaosMap);

  return [...timelinePorConsulta, ...orfaos].sort((a, b) => {
    const da = String(a.criadoEm || a.data || '');
    const dbb = String(b.criadoEm || b.data || '');
    return dbb.localeCompare(da);
  });
}

function safeJSONParse(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (e) {
    return null;
  }
}

// GET /api/prontuarios?clinicaId=X&pacienteId=Y
router.get('/', (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  let query = 'SELECT * FROM prontuarios';
  let params = [];

  if (pacienteId) {
    query += ' WHERE pacienteId = ?';
    params.push(pacienteId);
  }

  query += ' ORDER BY atualizadoEm DESC';

  db.all(query, params, (err, prontuarios) => {
    if (err) {
      console.error('❌ Erro ao buscar prontuários:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!prontuarios || prontuarios.length === 0) {
      return res.json([]);
    }

    // ⭐ Para cada prontuário, busca o HISTÓRICO COMPLETO de consultas agendadas do paciente
    // (a consulta É o atendimento). Traz TODAS as consultas — inclusive canceladas/futuras —
    // para que o card mostre o histórico real. O status de cada consulta é exibido no card.
    const resultado = [];
    let processados = 0;

    prontuarios.forEach((prontuario) => {
      db.all(
        'SELECT * FROM consultas WHERE pacienteId = ? ORDER BY data DESC, horario DESC LIMIT 200',
        [prontuario.pacienteId],
        (err, consultas) => {
          if (err) {
            console.error(`❌ Erro ao buscar consultas do prontuário ${prontuario.id}:`, err);
            consultas = [];
          }

          // ⭐ FALLBACK ROBUSTO: Se prontuário não tem profissionalId, herda da consulta
          let profissionalId = isEmptyValue(prontuario.profissionalId) ? null : prontuario.profissionalId;
          let profissional = isEmptyValue(prontuario.profissional) ? null : prontuario.profissional;

          if (!profissionalId) {
            const resolved = resolverProfissionalDasConsultas(consultas, prontuario.id);
            if (resolved.profissionalId) {
              profissionalId = resolved.profissionalId;
              profissional = profissional || resolved.profissional || '';
            } else if (resolved.profissional && !profissional) {
              profissional = resolved.profissional;
            }
          }

          // ⭐ FALLBACK FINAL: Busca profissionalResponsavelId do PACIENTE
          const finalizarResposta = (finalProfId, finalProfNome) => {
            // Auto-fix: persiste no prontuário para não precisar do fallback novamente
            if (finalProfId && isEmptyValue(prontuario.profissionalId)) {
              db.run(
                'UPDATE prontuarios SET profissionalId = ?, profissional = COALESCE(NULLIF(profissional, \'\'), ?) WHERE id = ?',
                [finalProfId, finalProfNome || '', prontuario.id],
                (updateErr) => {
                  if (!updateErr) {
                    console.log(`✅ [Auto-fix] Prontuário ${prontuario.id} → profissionalId=${finalProfId}`);
                  }
                }
              );
            }

            // ⭐⭐⭐ Enriquece os atendimentos com os dados clínicos antes de responder
            enriquecerAtendimentos(db, consultas, prontuario.pacienteId).
            then((atendimentos) => {
              resultado.push({
                ...prontuario,
                profissionalId: finalProfId || null,
                profissional: finalProfNome || null,
                atendimentos
              });
            }).
            catch((enrichErr) => {
              console.error(`⚠️ [prontuarios] Falha ao enriquecer atendimentos do prontuário ${prontuario.id}:`, enrichErr.message);
              resultado.push({
                ...prontuario,
                profissionalId: finalProfId || null,
                profissional: finalProfNome || null,
                atendimentos: (consultas || []).map((c) => ({
                  ...c,
                  odontograma: c.odontograma ? safeJSONParse(c.odontograma) : null
                }))
              });
            }).
            finally(() => {
              processados++;
              if (processados === prontuarios.length) {
                res.json(resultado);
              }
            });
          };

          if (!profissionalId) {
            // ⭐ Busca o campo profissionalResponsavelId da ficha do paciente
            db.get(
              'SELECT profissionalResponsavelId, profissionalResponsavel FROM pacientes WHERE id = ?',
              [prontuario.pacienteId],
              (errPac, paciente) => {
                if (!errPac && paciente && !isEmptyValue(paciente.profissionalResponsavelId)) {
                  profissionalId = paciente.profissionalResponsavelId;
                  profissional = profissional || paciente.profissionalResponsavel || '';
                  console.log(`🔍 [Fallback Paciente] Prontuário ${prontuario.id} → profissionalResponsavelId="${profissionalId}" do paciente ${prontuario.pacienteId}`);
                } else {
                  console.log(`⚠️ [GET /prontuarios] Prontuário ${prontuario.id} sem profissionalId em NENHUMA fonte (prontuário, consultas, paciente)`);
                }
                finalizarResposta(profissionalId, profissional);
              }
            );
          } else {
            finalizarResposta(profissionalId, profissional);
          }
        }
      );
    });
  });
});

// GET /api/prontuarios/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM prontuarios WHERE id = ?', [req.params.id], (err, prontuario) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!prontuario) return res.status(404).json({ error: 'Prontuário não encontrado' });

    // Busca o HISTÓRICO COMPLETO de consultas agendadas do paciente (todas, com status no card)
    db.all(
      'SELECT * FROM consultas WHERE pacienteId = ? ORDER BY data DESC, horario DESC LIMIT 200',
      [prontuario.pacienteId],
      (err, consultas) => {
        // ⭐ FALLBACK ROBUSTO
        let profissionalId = isEmptyValue(prontuario.profissionalId) ? null : prontuario.profissionalId;
        let profissional = isEmptyValue(prontuario.profissional) ? null : prontuario.profissional;

        if (!profissionalId) {
          const resolved = resolverProfissionalDasConsultas(consultas, prontuario.id);
          if (resolved.profissionalId) {
            profissionalId = resolved.profissionalId;
            profissional = profissional || resolved.profissional || '';
          } else if (resolved.profissional && !profissional) {
            profissional = resolved.profissional;
          }
        }

        // ⭐ Função para enviar resposta final
        const enviarResposta = (finalProfId, finalProfNome) => {
          // Auto-fix: persiste no prontuário
          if (finalProfId && isEmptyValue(prontuario.profissionalId)) {
            db.run(
              'UPDATE prontuarios SET profissionalId = ?, profissional = COALESCE(NULLIF(profissional, \'\'), ?) WHERE id = ?',
              [finalProfId, finalProfNome || '', prontuario.id],
              () => {}
            );
          }

          // ⭐⭐⭐ Enriquece os atendimentos com os dados clínicos antes de responder
          enriquecerAtendimentos(db, consultas, prontuario.pacienteId).
          then((atendimentos) => {
            res.json({
              ...prontuario,
              profissionalId: finalProfId || null,
              profissional: finalProfNome || null,
              atendimentos
            });
          }).
          catch((enrichErr) => {
            console.error(`⚠️ [prontuarios/:id] Falha ao enriquecer atendimentos:`, enrichErr.message);
            res.json({
              ...prontuario,
              profissionalId: finalProfId || null,
              profissional: finalProfNome || null,
              atendimentos: (consultas || []).map((c) => ({
                ...c,
                odontograma: c.odontograma ? safeJSONParse(c.odontograma) : null
              }))
            });
          });
        };

        if (!profissionalId) {
          // ⭐ FALLBACK FINAL: Busca profissionalResponsavelId do PACIENTE
          db.get(
            'SELECT profissionalResponsavelId, profissionalResponsavel FROM pacientes WHERE id = ?',
            [prontuario.pacienteId],
            (errPac, paciente) => {
              if (!errPac && paciente && !isEmptyValue(paciente.profissionalResponsavelId)) {
                profissionalId = paciente.profissionalResponsavelId;
                profissional = profissional || paciente.profissionalResponsavel || '';
                console.log(`🔍 [Fallback Paciente] Prontuário ${prontuario.id} → profissionalResponsavelId="${profissionalId}" do paciente`);
              }
              enviarResposta(profissionalId, profissional);
            }
          );
        } else {
          enviarResposta(profissionalId, profissional);
        }
      }
    );
  });
});

// POST /api/prontuarios - Cria ou atualiza prontuário (dados gerais do paciente)
// ⭐ NÃO cria mais atendimento — a consulta já existe na tabela consultas
router.post('/', async (req, res) => {
  const { clinicaId, pacienteId, pacienteNome, ...dados } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!pacienteId) return res.status(400).json({ error: 'pacienteId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();

  try {
    // Verifica se já existe prontuário para este paciente
    const prontuarioExistente = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM prontuarios WHERE pacienteId = ?', [pacienteId], (err, row) => {
        if (err) reject(err);else
        resolve(row);
      });
    });

    let prontuarioId;
    let prontuarioCriado = false;

    if (prontuarioExistente) {
      prontuarioId = prontuarioExistente.id;

      // Atualiza dados gerais se fornecidos
      const updates = {};
      if (dados.alergias !== undefined) updates.alergias = dados.alergias;
      if (dados.doencasCronicas !== undefined) updates.doencasCronicas = dados.doencasCronicas;
      if (dados.medicamentosEmUso !== undefined) updates.medicamentosEmUso = dados.medicamentosEmUso;
      if (dados.historicoFamiliar !== undefined) updates.historicoFamiliar = dados.historicoFamiliar;

      // ⭐ CRÍTICO: Se o prontuário não tem profissionalId mas recebemos um, atualiza!
      if (!isEmptyValue(dados.profissionalId) && isEmptyValue(prontuarioExistente.profissionalId)) {
        updates.profissionalId = dados.profissionalId;
        if (dados.profissional) updates.profissional = dados.profissional;
        console.log(`🔄 [POST /prontuarios] Atualizando profissionalId do prontuário existente: ${prontuarioId} → ${dados.profissionalId}`);
      }

      if (Object.keys(updates).length > 0) {
        const setCols = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
        const vals = [...Object.values(updates), agora, prontuarioId];
        await new Promise((resolve, reject) => {
          db.run(`UPDATE prontuarios SET ${setCols}, atualizadoEm = ? WHERE id = ?`, vals, (err) => {
            if (err) reject(err);else resolve();
          });
        });
      }
    } else {
      // Cria novo prontuário
      prontuarioId = `pront_${Date.now()}`;
      prontuarioCriado = true;

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO prontuarios (id, pacienteId, pacienteNome, alergias, doencasCronicas, medicamentosEmUso, historicoFamiliar, profissionalId, profissional, criadoEm, atualizadoEm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [prontuarioId, pacienteId, pacienteNome || '', dados.alergias || null, dados.doencasCronicas || null, dados.medicamentosEmUso || null, dados.historicoFamiliar || null, dados.profissionalId || null, dados.profissional || null, agora, agora],
          (err) => {if (err) reject(err);else resolve();}
        );
      });

      console.log(`✅ Prontuário criado: ${prontuarioId}`);
    }

    res.json({
      success: true,
      prontuarioId,
      prontuarioCriado
    });

  } catch (err) {
    console.error('❌ Erro ao criar/atualizar prontuário:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/prontuarios/:id - Atualiza prontuário
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, ...updates } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();

  console.log(`📝 [PUT /prontuarios/${id}] Recebido:`, JSON.stringify({ clinicaId, ...updates }));

  // Filtra campos válidos
  const camposValidos = ['pacienteNome', 'alergias', 'doencasCronicas', 'medicamentosEmUso', 'historicoFamiliar', 'tipoSanguineo', 'observacoesGerais', 'profissionalId', 'profissional'];
  const campos = Object.keys(updates).filter((k) => camposValidos.includes(k));
  const valores = campos.map((k) => updates[k]);

  if (campos.length === 0) {
    console.log(`⚠️ [PUT /prontuarios/${id}] Nenhum campo válido para atualizar. Campos recebidos:`, Object.keys(updates));
    return res.json({ success: true, message: 'Nenhum campo para atualizar' });
  }

  console.log(`📝 [PUT /prontuarios/${id}] Campos a atualizar:`, campos, '→ Valores:', valores);

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const sql = `UPDATE prontuarios SET ${setClause}, atualizadoEm = ? WHERE id = ?`;
  const params = [...valores, agora, id];

  // ⭐ Função para executar o UPDATE
  const executarUpdate = () => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);else
        resolve(this);
      });
    });
  };

  // ⭐ Função para garantir que as colunas existem (auto-migração)
  const garantirColunas = async () => {
    const migrações = [
    'ALTER TABLE prontuarios ADD COLUMN profissionalId VARCHAR(191)',
    'ALTER TABLE prontuarios ADD COLUMN profissional VARCHAR(255)'];

    for (const migSql of migrações) {
      try {
        await new Promise((resolve, reject) => {
          db.run(migSql, [], function (err) {
            if (err) {
              // Ignora "Duplicate column name" — coluna já existe
              if (err.message && err.message.includes('Duplicate column')) {
                resolve();
              } else {
                reject(err);
              }
            } else {
              console.log(`✅ [Migração auto] Coluna adicionada: ${migSql}`);
              resolve();
            }
          });
        });
      } catch (err) {
        console.warn(`⚠️ [Migração auto] Ignorando erro:`, err.message);
      }
    }
  };

  try {
    let result;
    try {
      result = await executarUpdate();
    } catch (err) {
      // Se falhou por coluna inexistente, tenta criar as colunas e refaz
      if (err.message && (err.message.includes('Unknown column') || err.message.includes('no such column'))) {
        console.log(`🔄 [PUT /prontuarios/${id}] Coluna não existe, executando auto-migração...`);
        await garantirColunas();
        result = await executarUpdate();
      } else {
        throw err;
      }
    }

    const changes = result?.changes || 0;
    console.log(`✅ [PUT /prontuarios/${id}] Atualizado com sucesso. Linhas afetadas: ${changes}`);

    if (changes === 0) {
      console.warn(`⚠️ [PUT /prontuarios/${id}] NENHUMA linha afetada! Prontuário com id="${id}" pode não existir.`);
      // Verifica se o prontuário existe
      db.get('SELECT id, pacienteId FROM prontuarios WHERE id = ?', [id], (err, row) => {
        if (err) {
          console.error(`❌ [PUT /prontuarios/${id}] Erro ao verificar existência:`, err);
        } else if (!row) {
          console.error(`❌ [PUT /prontuarios/${id}] Prontuário NÃO ENCONTRADO no banco!`);
        } else {
          console.log(`✅ [PUT /prontuarios/${id}] Prontuário existe (pacienteId: ${row.pacienteId}), mas UPDATE não afetou linhas (dados iguais?)`);
        }
      });
    }

    res.json({ success: true, changes });
  } catch (err) {
    console.error(`❌ [PUT /prontuarios/${id}] Erro:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/prontuarios/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM prontuarios WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar prontuário:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Prontuário deletado: ${req.params.id}`);
    res.json({ success: true });
  });
});

module.exports = router;