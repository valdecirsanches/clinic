/**
 * Templates de mensagens do WhatsApp
 * Centralizados para fácil manutenção e personalização
 *
 * @version 2.0.0 - Suporte a templates customizáveis
 */

import { Consulta, Paciente } from '../types';
export interface MessageTemplate {
  type: 'lembrete' | 'confirmacao' | 'cancelamento';
  message: string;
}

/**
 * Formata data para exibição
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Formata horário
 */
function formatTime(time: string): string {
  return time;
}

/**
 * ⭐ NOVO: Aplica variáveis ao template customizado
 * Substitui {nome}, {data}, {horario}, {profissional}, {especialidade}, {duracao}, {clinica}
 */
/**
 * Gera referência curta da consulta para fácil localização
 * Ex: "CON-A1B2C3D4" (primeiros 8 chars do ID)
 */
function gerarRefConsulta(consultaId: string): string {
  if (!consultaId) return '';
  const short = consultaId.replace(/-/g, '').substring(0, 8).toUpperCase();
  return `CON-${short}`;
}
function aplicarTemplate(template: string, paciente: Paciente, consulta: Consulta, clinicaNome: string): string {
  const dataFormatada = formatDate(consulta.data);
  const tipo = consulta.tipo === 'odontologica' ? 'Consulta Odontológica' : 'Consulta Médica';
  const ref = gerarRefConsulta(consulta.id);
  return template.replace(/\{nome\}/g, paciente.nome).replace(/\{data\}/g, dataFormatada).replace(/\{horario\}/g, consulta.horario).replace(/\{profissional\}/g, consulta.profissional || '').replace(/\{especialidade\}/g, tipo).replace(/\{duracao\}/g, String(consulta.duracao || 30)).replace(/\{clinica\}/g, clinicaNome).replace(/\{ref\}/g, ref);
}

/**
 * Gera mensagem de lembrete de consulta
 * ⭐ Agora aceita template customizado
 */
export function gerarMensagemLembrete(paciente: Paciente, consulta: Consulta, nomeClinica: string, templateCustomizado?: string): string {
  // Se tem template customizado, usa ele
  if (templateCustomizado && templateCustomizado.trim().length > 10) {
    return aplicarTemplate(templateCustomizado, paciente, consulta, nomeClinica);
  }

  // Template padrão (fallback)
  const dataFormatada = new Date(consulta.data + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const ref = gerarRefConsulta(consulta.id);
  return `Olá, ${paciente.nome}! 👋

🏥 *${nomeClinica}*

📋 Lembramos que você tem uma consulta agendada:

📅 *Data:* ${dataFormatada}
🕐 *Horário:* ${consulta.horario}
👨‍⚕️ *Profissional:* ${consulta.profissional}
⏱️ *Duração:* ${consulta.duracao} minutos
🔖 *Ref:* ${ref}

Por favor, confirme sua presença respondendo esta mensagem com *SIM* ou *NÃO*.

Em caso de dúvidas, entre em contato conosco.

Aguardamos você! 😊`;
}

/**
 * Gera mensagem de confirmação
 * ⭐ v2.2: Agora usa apenas 1=Confirmar, 2=Cancelar (removido Remarcar)
 */
export function gerarMensagemConfirmacao(paciente: Paciente, consulta: Consulta, clinicaNome: string = 'Clínica', templateCustomizado?: string): string {
  // Se tem template customizado, usa ele com adição de instruções de confirmação
  if (templateCustomizado && templateCustomizado.trim().length > 10) {
    let msg = aplicarTemplate(templateCustomizado, paciente, consulta, clinicaNome);
    // Adiciona instruções de confirmação se não existirem no template
    if (!msg.includes('1️⃣') && !msg.includes('SIM') && !msg.includes('NÃO')) {
      msg += '\n\n*Responda com o número:*\n1️⃣ *Confirmar* presença\n2️⃣ *Cancelar* consulta';
    }
    return msg;
  }

  // Template padrão (fallback)
  const dataFormatada = formatDate(consulta.data);
  const horarioFormatado = formatTime(consulta.horario);
  const ref = gerarRefConsulta(consulta.id);
  return `
🏥 *${clinicaNome}*

Olá, *${paciente.nome}*! 👋

Por favor, confirme sua presença na consulta:

📅 *Data:* ${dataFormatada}
🕐 *Horário:* ${horarioFormatado}
👨‍⚕️ *Profissional:* ${consulta.profissional}
🔖 *Ref:* ${ref}

*Responda com o número:*
1️⃣ *Confirmar* presença
2️⃣ *Cancelar* consulta

Aguardamos seu retorno! 😊
  `.trim();
}

/**
 * Gera mensagem de cancelamento
 */
export function gerarMensagemCancelamento(paciente: Paciente, consulta: Consulta, clinicaNome: string = 'Clínica', motivo?: string): string {
  const dataFormatada = formatDate(consulta.data);
  const horarioFormatado = formatTime(consulta.horario);
  const ref = gerarRefConsulta(consulta.id);
  return `
🏥 *${clinicaNome}*

Olá, *${paciente.nome}*! 👋

Informamos que sua consulta foi *cancelada*:

📅 *Data:* ${dataFormatada}
🕐 *Horário:* ${horarioFormatado}
👨‍⚕️ *Profissional:* ${consulta.profissional}
🔖 *Ref:* ${ref}

${motivo ? `📋 *Motivo:* ${motivo}\n\n` : ''}Por favor, entre em contato para reagendar.

Desculpe pelo transtorno! 🙏
  `.trim();
}

/**
 * Gera mensagem de confirmação recebida
 */
export function gerarMensagemConfirmacaoRecebida(paciente: Paciente, consulta: Consulta, clinicaNome: string = 'Clínica'): string {
  const dataFormatada = formatDate(consulta.data);
  const horarioFormatado = formatTime(consulta.horario);
  const ref = gerarRefConsulta(consulta.id);
  return `
🏥 *${clinicaNome}*

Obrigado, *${paciente.nome}*! ✅

Sua consulta está *confirmada*:

📅 *Data:* ${dataFormatada}
🕐 *Horário:* ${horarioFormatado}
👨‍⚕️ *Profissional:* ${consulta.profissional}
🔖 *Ref:* ${ref}

Aguardamos você! 😊
  `.trim();
}

/**
 * ⭐ NOVO: Gera menu de ajuda com template customizado
 */
export function gerarMenuAjuda(pacienteNome: string, menuTemplateCustomizado?: string): string {
  if (menuTemplateCustomizado && menuTemplateCustomizado.trim().length > 10) {
    return menuTemplateCustomizado.replace(/\{nome\}/g, pacienteNome);
  }

  // Menu padrão
  return `👋 Olá, *${pacienteNome}*!

Como posso ajudar?

1️⃣ Minhas consultas
2️⃣ Horário de funcionamento
3️⃣ 📍 Endereço / Como chegar
4️⃣ 💰 Emissão da 2ª via de boleto
5️⃣ 📷 Trocar foto de perfil
6️⃣ 📄 Enviar documento
7️⃣ ✅ Cheguei na clínica
0️⃣ Sair

_Digite o número da opção desejada._`;
}

/**
 * ⭐ NOVO v9.6: Mapa UF → DDD padrão (código de área principal do estado)
 */
const UF_DDD_MAP: Record<string, string> = {
  AC: '68',
  AL: '82',
  AM: '92',
  AP: '96',
  BA: '71',
  CE: '85',
  DF: '61',
  ES: '27',
  GO: '62',
  MA: '98',
  MG: '31',
  MS: '67',
  MT: '65',
  PA: '91',
  PB: '83',
  PE: '81',
  PI: '86',
  PR: '41',
  RJ: '21',
  RN: '84',
  RO: '69',
  RR: '95',
  RS: '51',
  SC: '48',
  SE: '79',
  SP: '11',
  TO: '63'
};

/**
 * Valida se o número de telefone está no formato correto
 */
export function validarTelefone(telefone: string): boolean {
  if (!telefone) return false;
  const numeroLimpo = telefone.replace(/\D/g, '');
  return numeroLimpo.length >= 10 && numeroLimpo.length <= 13;
}

/**
 * ⭐ NOVO v9.6: Detecta se o número tem DDD
 */
export function telefoneTemDDD(telefone: string): boolean {
  if (!telefone) return false;
  let limpo = telefone.replace(/\D/g, '');
  // Remove prefixo 55
  if (limpo.startsWith('55') && limpo.length > 11) {
    limpo = limpo.substring(2);
  }
  // 10-11 dígitos = tem DDD, 8-9 dígitos = sem DDD
  return limpo.length >= 10;
}

/**
 * Formata telefone para o padrão do WhatsApp (sem caracteres especiais)
 * ⭐ v9.6: Agora aceita UF para adicionar DDD automaticamente
 */
export function formatarTelefoneWhatsApp(telefone: string, uf?: string): {
  numero: string;
  dddAdicionado: boolean;
  semDDD?: boolean;
  dddUsado?: string;
} {
  let numeroLimpo = telefone.replace(/\D/g, '');

  // Remove prefixo 55 para analisar
  let semPrefixo = numeroLimpo;
  if (semPrefixo.startsWith('55') && semPrefixo.length > 11) {
    semPrefixo = semPrefixo.substring(2);
  }

  // Se tem 10-11 dígitos, já tem DDD
  if (semPrefixo.length >= 10 && semPrefixo.length <= 11) {
    if (!numeroLimpo.startsWith('55')) {
      numeroLimpo = '55' + semPrefixo;
    }
    return {
      numero: numeroLimpo,
      dddAdicionado: false
    };
  }

  // Se tem 8-9 dígitos, NÃO tem DDD
  if (semPrefixo.length >= 8 && semPrefixo.length <= 9) {
    const ufUpper = (uf || '').toUpperCase().trim();
    const ddd = UF_DDD_MAP[ufUpper];
    if (ddd) {
      numeroLimpo = '55' + ddd + semPrefixo;
      return {
        numero: numeroLimpo,
        dddAdicionado: true,
        dddUsado: ddd
      };
    } else {
      // Sem UF - não consegue adicionar DDD
      if (!numeroLimpo.startsWith('55')) {
        numeroLimpo = '55' + semPrefixo;
      }
      return {
        numero: numeroLimpo,
        dddAdicionado: false,
        semDDD: true
      };
    }
  }

  // Fallback
  if (!numeroLimpo.startsWith('55') && numeroLimpo.length <= 11) {
    numeroLimpo = '55' + numeroLimpo;
  }
  return {
    numero: numeroLimpo,
    dddAdicionado: false
  };
}