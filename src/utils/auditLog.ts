/**
 * ⭐ LGPD: Utilitário de Log de Auditoria
 * Registra quem acessou, quando, onde e o que fez no prontuário
 *
 * Exigências atendidas:
 * - Resolução CFM 2.299/2021 (prontuário eletrônico)
 * - LGPD Lei 13.709/2018 (registro de acesso a dados pessoais)
 */

import { API_BASE_URL } from '../config/api';

// Tipos de ação de auditoria
export type AcaoAuditoria =
'ACESSO_PRONTUARIO' |
'CRIACAO_ATENDIMENTO' |
'EDICAO_ANAMNESE' |
'EDICAO_EXAME_FISICO' |
'EDICAO_DIAGNOSTICO' |
'EDICAO_EVOLUCAO' |
'EDICAO_PRESCRICAO' |
'EDICAO_EXAMES_SOLICITADOS' |
'EDICAO_RELATORIO' |
'EDICAO_ATESTADO' |
'IMPRESSAO_PRONTUARIO' |
'VINCULACAO_PROFISSIONAL' |
'UPLOAD_DOCUMENTO' |
'EXCLUSAO_DOCUMENTO' |
'ASSINATURA_PACIENTE' |
'CRIACAO_PROCEDIMENTO' |
'EDICAO_PROCEDIMENTO' |
'EXCLUSAO_PROCEDIMENTO' |
'ASSINATURA_PROCEDIMENTO' |
'IMPRESSAO_PROCEDIMENTOS' |
'CRIACAO_AVALIACAO' |
'EDICAO_AVALIACAO' |
'EXCLUSAO_AVALIACAO' |
'IMPRESSAO_AVALIACAO' |
'CRIACAO_USUARIO' |
'ALTERACAO_USUARIO' |
'EXCLUSAO_USUARIO';

// Tipos de entidade
export type EntidadeAuditoria =
'prontuario' |
'consulta' |
'anamnese' |
'exame_fisico' |
'diagnostico' |
'evolucao' |
'prescricao' |
'exame_solicitado' |
'relatorio' |
'atestado' |
'documento' |
'procedimento' |
'avaliacao' |
'usuario';

// Labels amigáveis para exibição
export const ACAO_LABELS: Record<AcaoAuditoria, string> = {
  ACESSO_PRONTUARIO: 'Acessou prontuário',
  CRIACAO_ATENDIMENTO: 'Criou atendimento',
  EDICAO_ANAMNESE: 'Editou anamnese',
  EDICAO_EXAME_FISICO: 'Editou exame físico',
  EDICAO_DIAGNOSTICO: 'Editou diagnóstico',
  EDICAO_EVOLUCAO: 'Editou evolução',
  EDICAO_PRESCRICAO: 'Editou prescrição',
  EDICAO_EXAMES_SOLICITADOS: 'Editou exames solicitados',
  EDICAO_RELATORIO: 'Editou relatório',
  EDICAO_ATESTADO: 'Editou atestado',
  IMPRESSAO_PRONTUARIO: 'Imprimiu prontuário',
  VINCULACAO_PROFISSIONAL: 'Vinculou profissional',
  UPLOAD_DOCUMENTO: 'Enviou documento',
  EXCLUSAO_DOCUMENTO: 'Excluiu documento',
  ASSINATURA_PACIENTE: 'Paciente assinou',
  CRIACAO_PROCEDIMENTO: 'Criou procedimento',
  EDICAO_PROCEDIMENTO: 'Editou procedimento',
  EXCLUSAO_PROCEDIMENTO: 'Excluiu procedimento',
  ASSINATURA_PROCEDIMENTO: 'Assinou procedimento',
  IMPRESSAO_PROCEDIMENTOS: 'Imprimiu procedimentos',
  CRIACAO_AVALIACAO: 'Criou avaliação',
  EDICAO_AVALIACAO: 'Editou avaliação',
  EXCLUSAO_AVALIACAO: 'Excluiu avaliação',
  IMPRESSAO_AVALIACAO: 'Imprimiu avaliação',
  CRIACAO_USUARIO: 'Cadastrou usuário',
  ALTERACAO_USUARIO: 'Alterou cadastro de usuário',
  EXCLUSAO_USUARIO: 'Excluiu usuário'
};

// Ícones para cada ação
export const ACAO_ICONES: Record<AcaoAuditoria, string> = {
  ACESSO_PRONTUARIO: '👁️',
  CRIACAO_ATENDIMENTO: '🆕',
  EDICAO_ANAMNESE: '📝',
  EDICAO_EXAME_FISICO: '🩺',
  EDICAO_DIAGNOSTICO: '🔍',
  EDICAO_EVOLUCAO: '📋',
  EDICAO_PRESCRICAO: '💊',
  EDICAO_EXAMES_SOLICITADOS: '🧪',
  EDICAO_RELATORIO: '📄',
  EDICAO_ATESTADO: '📜',
  IMPRESSAO_PRONTUARIO: '🖨️',
  VINCULACAO_PROFISSIONAL: '👨‍⚕️',
  UPLOAD_DOCUMENTO: '📎',
  EXCLUSAO_DOCUMENTO: '🗑️',
  ASSINATURA_PACIENTE: '✍️',
  CRIACAO_PROCEDIMENTO: '➕',
  EDICAO_PROCEDIMENTO: '✏️',
  EXCLUSAO_PROCEDIMENTO: '🗑️',
  ASSINATURA_PROCEDIMENTO: '✍️',
  IMPRESSAO_PROCEDIMENTOS: '🖨️',
  CRIACAO_AVALIACAO: '➕',
  EDICAO_AVALIACAO: '✏️',
  EXCLUSAO_AVALIACAO: '🗑️',
  IMPRESSAO_AVALIACAO: '🖨️',
  CRIACAO_USUARIO: '👤',
  ALTERACAO_USUARIO: '✏️',
  EXCLUSAO_USUARIO: '🗑️'
};

/**
 * Autor de uma alteração de cadastro: vai junto no corpo (ou na URL) para o
 * servidor registrar na auditoria quem cadastrou, alterou ou excluiu.
 */
export function autorDaSessao(): {atorId: string;atorClinicaId: string;} {
  try {
    const sessao = JSON.parse(localStorage.getItem('sessao') || 'null');
    return {
      atorId: sessao?.usuario?.id || '',
      atorClinicaId: sessao?.clinicaAtual?.id || ''
    };
  } catch {
    return { atorId: '', atorClinicaId: '' };
  }
}

/** Mesmo autor, em formato de parâmetros de URL (para DELETE) */
export function autorNaUrl(): string {
  const { atorId, atorClinicaId } = autorDaSessao();
  return new URLSearchParams({ atorId, atorClinicaId }).toString();
}
interface RegistrarAuditoriaParams {
  clinicaId: string;
  acao: AcaoAuditoria;
  entidade: EntidadeAuditoria;
  entidadeId?: string;
  pacienteId?: string;
  pacienteNome?: string;
  detalhes?: string;
}

/**
 * Obtém dados do usuário logado da sessão
 */
function getUsuarioLogado(): {
  id: string;
  nome: string;
  tipo: string;
} | null {
  try {
    const sessao = localStorage.getItem('sessao');
    if (!sessao) return null;
    const parsed = JSON.parse(sessao);
    return {
      id: parsed.usuario?.id || '',
      nome: parsed.usuario?.nome || '',
      tipo: parsed.usuario?.tipo || ''
    };
  } catch {
    return null;
  }
}

/**
 * Registra uma ação de auditoria no servidor
 * IMPORTANTE: Nunca bloqueia o fluxo principal — erros são silenciosos
 */
export async function registrarAuditoria(
params: RegistrarAuditoriaParams)
: Promise<void> {
  const usuario = getUsuarioLogado();
  if (!usuario || !params.clinicaId) return;
  try {
    // Fire-and-forget — não espera resposta
    fetch(`${API_BASE_URL}/api/audit-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clinicaId: params.clinicaId,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        usuarioTipo: usuario.tipo,
        acao: params.acao,
        entidade: params.entidade,
        entidadeId: params.entidadeId || null,
        pacienteId: params.pacienteId || null,
        pacienteNome: params.pacienteNome || null,
        detalhes: params.detalhes || null
      })
    }).catch(() => {

      // Silencioso — auditoria nunca deve impedir o uso do sistema
    });} catch {

    // Silencioso
  }}

/**
 * Busca logs de auditoria de um paciente
 */
export async function buscarAuditoria(
clinicaId: string,
filtros?: {
  pacienteId?: string;
  usuarioId?: string;
  entidade?: string;
  acao?: string;
  dataInicio?: string;
  dataFim?: string;
  limit?: number;
  offset?: number;
})
: Promise<any[]> {
  try {
    const params = new URLSearchParams({
      clinicaId
    });
    if (filtros?.pacienteId) params.set('pacienteId', filtros.pacienteId);
    if (filtros?.usuarioId) params.set('usuarioId', filtros.usuarioId);
    if (filtros?.entidade) params.set('entidade', filtros.entidade);
    if (filtros?.acao) params.set('acao', filtros.acao);
    if (filtros?.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros?.dataFim) params.set('dataFim', filtros.dataFim);
    if (filtros?.limit) params.set('limit', String(filtros.limit));
    if (filtros?.offset) params.set('offset', String(filtros.offset));
    const response = await fetch(`${API_BASE_URL}/api/audit-log?${params}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch {
    return [];
  }
}