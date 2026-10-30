import { API_BASE_URL } from '../config/api';

/**
 * Salva o valor do recibo na consulta e marca nas observações
 */
export async function salvarReciboNaConsulta(params: {
  consultaId: string;
  clinicaId: string;
  valor: number;
  valorFormatado: string;
  observacoesAtuais: string;
}) {
  const {
    consultaId,
    clinicaId,
    valor,
    valorFormatado,
    observacoesAtuais
  } = params;
  const agora = new Date();
  const marca = `\n🧾 Recibo R$ ${valorFormatado} em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
  const novaObs = observacoesAtuais ? observacoesAtuais.includes('🧾 Recibo R$') ? observacoesAtuais : observacoesAtuais + marca : marca.trim();
  await fetch(`${API_BASE_URL}/api/consultas/${consultaId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clinicaId,
      valor,
      observacoes: novaObs
    })
  });
  return {
    valor,
    observacoes: novaObs
  };
}

/**
 * Verifica se uma consulta já teve recibo emitido (pela marca nas observações)
 */
export function consultaTemRecibo(observacoes: string | undefined | null): boolean {
  return !!observacoes && observacoes.includes('🧾 Recibo R$');
}