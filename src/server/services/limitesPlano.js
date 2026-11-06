// ==================== LIMITES DO PLANO ====================
// Aplicados NO SERVIDOR, no momento da criação do recurso. Planos sem limite
// definido (null/ausente) não bloqueiam nada. Nunca lança: em caso de falha na
// verificação, o recurso é permitido (não travamos a clínica por erro nosso).

const dbGlobal = require('../databaseGlobal');
const calculo = require('./assinaturaCalculo');

function bloqueio(mensagem, plano) {
  return {
    error: mensagem,
    message: mensagem,
    code: 'LIMITE_PLANO',
    plano: plano ? { id: plano.id, nome: plano.nome } : null
  };
}

/**
 * O plano "gratuito" é o VALOR PADRÃO da coluna clinicas.plano: toda clínica
 * antiga ficou com ele sem nunca ter escolhido nada. Antes de o registro
 * "Grátis" existir em `planos`, essas clínicas não tinham limite algum.
 * Os limites do Grátis só valem para quem realmente está nele:
 *   • clínica criada DEPOIS do registro do plano Grátis;
 *   • sem valor mensal contratado (contrato negociado = cliente pagante);
 *   • sem nenhuma fatura paga.
 */
async function isentaDoGratuito(clinicaId, plano) {
  if (plano.id !== 'gratuito') return false;
  try {
    const contrato = await calculo.buscarContrato(clinicaId);
    if (contrato && contrato.valorMensalFixo !== null) return true;

    const paga = await dbGlobal.
    prepare("SELECT COUNT(*) AS total FROM assinatura_faturas WHERE clinicaId = ? AND status = 'paga'").
    get(clinicaId).
    catch(() => null);
    if (Number(paga && paga.total || 0) > 0) return true;

    const registro = await dbGlobal.
    prepare("SELECT criadoEm FROM planos WHERE id = 'gratuito'").
    get().
    catch(() => null);
    const inicioGratis = Date.parse(registro && registro.criadoEm || '');
    const criadaEm = Date.parse(plano.clinicaCriadaEm || '');
    // Sem data confiável = clínica antiga: não bloqueia.
    if (!Number.isFinite(inicioGratis) || !Number.isFinite(criadaEm)) return true;
    return criadaEm < inicioGratis;
  } catch (err) {
    return true;
  }
}

/**
 * @param {string} clinicaId
 * @param {'pacientes'|'usuarios'|'armazenamento'|'sms'} recurso
 * @param {{ bytesAdicionais?: number }} [extra]
 * @returns {Promise<null | object>} null = permitido; objeto = bloqueio
 */
async function verificarLimite(clinicaId, recurso, extra = {}) {
  try {
    if (!clinicaId) return null;
    const plano = await calculo.buscarPlanoDaClinica(clinicaId);
    if (!plano || !plano.encontrado) return null;
    if (await isentaDoGratuito(clinicaId, plano)) return null;
    const limites = plano.limites || {};

    if (recurso === 'pacientes' && plano.limitePacientes) {
      const total = await calculo.contarNaClinica(
        clinicaId,
        'SELECT COUNT(*) AS total FROM pacientes',
        []
      );
      if (total >= plano.limitePacientes) {
        return bloqueio(
          `O plano ${plano.nome} permite até ${plano.limitePacientes} pacientes. Altere o plano para cadastrar mais.`,
          plano
        );
      }
    }

    if (recurso === 'usuarios' && Number(limites.usuarios) > 0) {
      const row = await dbGlobal.
      prepare('SELECT COUNT(*) AS total FROM usuarios WHERE clinicaId = ? AND ativo = 1').
      get(clinicaId);
      if (Number(row && row.total || 0) >= Number(limites.usuarios)) {
        return bloqueio(
          `O plano ${plano.nome} permite até ${limites.usuarios} usuários ativos. Altere o plano para cadastrar mais.`,
          plano
        );
      }
    }

    if (recurso === 'armazenamento' && Number(limites.armazenamentoGb) > 0) {
      const usado = await calculo.medirArmazenamentoBytes(clinicaId);
      const limiteBytes = Number(limites.armazenamentoGb) * calculo.BYTES_GB;
      if (usado + (Number(extra.bytesAdicionais) || 0) > limiteBytes) {
        return bloqueio(
          `O plano ${plano.nome} inclui ${limites.armazenamentoGb} GB de documentos e o espaço acabou. Altere o plano para enviar mais arquivos.`,
          plano
        );
      }
    }

    if (recurso === 'sms' && limites.sms === false) {
      return bloqueio(`O envio de SMS não está incluído no plano ${plano.nome}.`, plano);
    }

    return null;
  } catch (err) {
    console.warn(`📦 ⚠️ [limites] Verificação de ${recurso} ignorada: ${err.message}`);
    return null;
  }
}

/**
 * Clínica PAGANTE = plano com preço, contrato com valor mensal ou alguma fatura
 * paga. Usado para esconder anúncios (AdSense) de quem paga. Em dúvida (erro
 * de consulta), trata como pagante: melhor não mostrar anúncio a um cliente.
 */
async function clinicaPagante(clinicaId) {
  if (!clinicaId) return false;
  try {
    const plano = await calculo.buscarPlanoDaClinica(clinicaId);
    if (plano && Number(plano.preco) > 0) return true;

    const contrato = await calculo.buscarContrato(clinicaId);
    if (contrato && Number(contrato.valorMensalFixo) > 0) return true;

    const paga = await dbGlobal.
    prepare("SELECT COUNT(*) AS total FROM assinatura_faturas WHERE clinicaId = ? AND status = 'paga'").
    get(clinicaId).
    catch(() => null);
    return Number(paga && paga.total || 0) > 0;
  } catch (err) {
    console.warn(`📦 ⚠️ [anuncios] Plano de ${clinicaId} não verificado: ${err.message}`);
    return true;
  }
}

module.exports = { verificarLimite, clinicaPagante };