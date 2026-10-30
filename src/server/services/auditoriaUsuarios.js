// ==================== AUDITORIA DO CADASTRO DE USUÁRIOS ====================
// Toda criação, alteração e exclusão de usuário (médico, dentista, recepção…)
// fica registrada na auditoria (LGPD) com QUEM fez, QUANDO, de onde (IP) e
// O QUE mudou — campo a campo, valor anterior → valor novo.
// Usuários são globais; o registro vai para a auditoria da clínica do usuário
// alterado e também para a clínica em que o autor estava trabalhando.

const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

const ROTULOS = {
  nome: 'Nome',
  email: 'E-mail',
  tipo: 'Perfil',
  operadoraId: 'Operadora',
  clinicaId: 'Clínica',
  ativo: 'Ativo',
  crm: 'CRM/CRO',
  uf: 'UF do conselho',
  cpf: 'CPF',
  telefone: 'Telefone',
  dataNascimento: 'Nascimento',
  permissoesMenu: 'Permissões de menu',
  fotoUrl: 'Foto',
  titulo: 'Título',
  cabecalhoRelatorio: 'Cabeçalho dos relatórios',
  rqes: 'RQE',
  especialidades: 'Especialidades',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  cepUsuario: 'CEP',
  ufEndereco: 'UF do endereço',
  intervaloAlmocoAtivo: 'Intervalo de almoço',
  intervaloAlmocoInicio: 'Início do almoço',
  intervaloAlmocoFim: 'Fim do almoço',
  prontuarioTotal: 'Prontuário total',
  doisFatores: 'Verificação em duas etapas'
};

// Campos longos: registra só que mudaram, sem copiar o conteúdo
const SO_INDICA = new Set(['fotoUrl', 'cabecalhoRelatorio', 'permissoesMenu']);

let tabelasProntas = new Set();

function garantirTabela(db, clinicaId) {
  if (tabelasProntas.has(clinicaId)) return Promise.resolve();
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS audit_log (
        id VARCHAR(191) PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL,
        usuarioNome VARCHAR(255) NOT NULL,
        usuarioTipo VARCHAR(50),
        acao VARCHAR(50) NOT NULL,
        entidade VARCHAR(100) NOT NULL,
        entidadeId VARCHAR(191),
        pacienteId VARCHAR(191),
        pacienteNome VARCHAR(255),
        detalhes TEXT,
        ip VARCHAR(50),
        criadoEm VARCHAR(50) NOT NULL
      )`,
      [],
      () => {
        tabelasProntas.add(clinicaId);
        resolve();
      }
    );
  });
}

function normalizar(campo, valor) {
  if (valor === undefined || valor === null || valor === '') return '';
  if (['ativo', 'intervaloAlmocoAtivo', 'prontuarioTotal', 'doisFatores'].includes(campo)) {
    return Number(valor) || valor === true ? 'sim' : 'não';
  }
  return String(valor);
}

/** Lista legível do que mudou entre o registro anterior e o novo */
function diferencas(antes, depois, senhaAlterada) {
  const mudancas = [];
  for (const [campo, rotulo] of Object.entries(ROTULOS)) {
    if (!(campo in (depois || {}))) continue;
    const a = normalizar(campo, antes?.[campo]);
    const d = normalizar(campo, depois[campo]);
    if (a === d) continue;
    if (SO_INDICA.has(campo)) mudancas.push(`${rotulo}: alterado`);else
    mudancas.push(`${rotulo}: "${a || '(vazio)'}" → "${d || '(vazio)'}"`);
  }
  if (senhaAlterada) mudancas.push('Senha: redefinida');
  return mudancas;
}

async function autor(atorId) {
  const id = String(atorId || '').trim();
  if (id) {
    try {
      const u = await dbGlobal.prepare('SELECT id, nome, tipo FROM usuarios WHERE id = ?').get(id);
      if (u) return { id: u.id, nome: u.nome, tipo: u.tipo };
    } catch {

      // segue como não identificado
    }}
  return { id: 'nao_identificado', nome: 'Não identificado (tela sem identificação do autor)', tipo: '' };
}

function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').
  split(',')[0].
  trim();
}

/**
 * Registra a ação. Nunca lança: a auditoria não pode impedir o cadastro.
 * @param acao CRIACAO_USUARIO | ALTERACAO_USUARIO | EXCLUSAO_USUARIO
 */
async function registrarAuditoriaUsuario(req, { acao, alvo, detalhes, atorId, atorClinicaId }) {
  try {
    const quem = await autor(atorId);
    const clinicas = [...new Set([alvo?.clinicaId, atorClinicaId].filter(Boolean).map(String))];
    if (!clinicas.length) {
      console.warn(`⚠️ [Auditoria] ${acao} de ${alvo?.nome || alvo?.id}: sem clínica para registrar`);
      return;
    }
    const agora = new Date().toISOString();
    const ip = ipDe(req);
    const texto = `${alvo?.nome || 'Usuário'} (${alvo?.tipo || '—'}) — ${detalhes}`.slice(0, 60000);
    for (const clinicaId of clinicas) {
      try {
        const db = getClinicaDB(clinicaId);
        await garantirTabela(db, clinicaId);
        const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await new Promise((resolve) => {
          db.run(
            `INSERT INTO audit_log (id, usuarioId, usuarioNome, usuarioTipo, acao, entidade, entidadeId, pacienteId, pacienteNome, detalhes, ip, criadoEm)
             VALUES (?, ?, ?, ?, ?, 'usuario', ?, NULL, NULL, ?, ?, ?)`,
            [id, quem.id, quem.nome, quem.tipo, acao, alvo?.id || null, texto, ip, agora],
            (err) => {
              if (err) console.error(`❌ [Auditoria] Falha ao registrar em ${clinicaId}:`, err.message);
              resolve();
            }
          );
        });
      } catch (err) {
        console.error(`❌ [Auditoria] Clínica ${clinicaId}:`, err.message);
      }
    }
    console.log(`📋 [Auditoria] ${acao} · ${alvo?.nome || alvo?.id} · por ${quem.nome}`);
  } catch (err) {
    console.error('❌ [Auditoria] Erro ao registrar usuário:', err.message);
  }
}

/** Autor da requisição: corpo ou query (as telas não enviam cabeçalhos extras) */
function atorDaRequisicao(req) {
  return {
    atorId: req.body && req.body.atorId || req.query.atorId || '',
    atorClinicaId: req.body && req.body.atorClinicaId || req.query.atorClinicaId || ''
  };
}

module.exports = { registrarAuditoriaUsuario, diferencas, atorDaRequisicao };