// ⭐ Mensagem de SMS da consulta online
//
// O SMS é o caminho alternativo quando o WhatsApp da clínica não está online.
// Ele é cobrado por segmento (~160 caracteres) e não aceita formatação, então o
// texto é curto, sem emoji e sem acento — acentos forçam a codificação UCS-2 e
// reduzem o segmento para 70 caracteres, dividindo a mensagem em várias partes.
import { formatarDataConsultaSimples } from './videoConsulta';

export interface MensagemConsultaOnlineSmsParams {
  pacienteNome?: string;
  clinicaNome?: string;
  data?: string;
  horario?: string;
  link: string;
}

function semAcento(texto: string): string {
  return (texto || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '');
}

export function montarMensagemConsultaOnlineSms({
  pacienteNome,
  clinicaNome,
  data,
  horario,
  link
}: MensagemConsultaOnlineSmsParams): string {
  const dataFmt = formatarDataConsultaSimples(data);
  const partes: string[] = [];
  // Identificar a origem é o que faz o paciente confiar no link.
  partes.push(semAcento(clinicaNome || 'Sua clinica'));
  const primeiroNome = semAcento(pacienteNome || '').split(' ')[0];
  partes.push(
    `${primeiroNome ? `${primeiroNome}, sua` : 'Sua'} consulta e por video${
    dataFmt ? ` em ${dataFmt}` : ''}${
    horario ? ` as ${horario}` : ''}.`
  );
  partes.push(`Entre por: ${link}`);
  return partes.join(' ');
}