// ==================== CONVITE DA CONSULTA ONLINE ====================
// Reenvia ao paciente o link da sala de vídeo: WhatsApp da clínica (WAHA),
// WhatsApp oficial (Meta) ou SMS, nessa ordem. Extraído de
// pages/ProntuarioAtendimentoPage.tsx.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_BASE_URL } from '../../config/api';
import {
  gerarLinkSalaVideo,
  montarMensagemConsultaOnline,
  formatarDataConsultaSimples } from
'../../utils/videoConsulta';
import { montarMensagemConsultaOnlineSms } from '../../utils/videoConsultaSms';
import { enviarSmsApi } from '../../utils/smsApi';
import { enviarWhatsappMetaApi, metaDisponivelApi } from '../../utils/whatsappMetaApi';

export interface ContextoConviteConsultaOnline {
  clinicaId: any;
  consultaIdReal: any;
  consulta: any;
  paciente: any;
  toastSuccess: any;
  toastError: any;
  toastWarning: any;
  /** Nome do profissional ativo no momento do envio. */
  nomeProfissional: string;
}

export async function reenviarConviteConsultaOnline(ctx: ContextoConviteConsultaOnline): Promise<boolean> {
  const {
    clinicaId,
    consultaIdReal,
    consulta,
    paciente,
    toastSuccess,
    toastError,
    toastWarning,
    nomeProfissional,
  } = ctx;
    const idConsulta = consultaIdReal || consulta?.id || '';
  // Link do PACIENTE (attendee) — é o que ele acessa pelo WhatsApp.
  const linkPaciente = gerarLinkSalaVideo({
    clinicaId: clinicaId || 'default',
    consultaId: idConsulta,
    linkExistente: consulta?.linkVideo,
    role: 'attendee',
    nome: paciente?.nome || consulta?.pacienteNome || ''
  });
  // Telefone do paciente: usa o que já temos em memória, senão busca na API.
  let telefone =
  (consulta as any)?.pacienteTelefone || paciente?.telefone || '';
  if (!telefone && paciente?.id) {
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/pacientes/${paciente.id}?clinicaId=${clinicaId}`
      );
      if (resp.ok) {
        const data = await resp.json();
        telefone = data.telefone || '';
      }
    } catch (err) {
      console.error('Erro ao buscar telefone do paciente:', err);
    }
  }
  if (!telefone) {
    toastError(
      'Sem telefone',
      'Paciente sem telefone cadastrado — não foi possível reenviar o convite.'
    );
    return false;
  }
  let clinicaNome = '';
  try {
    const sessao = localStorage.getItem('sessao');
    if (sessao) clinicaNome = JSON.parse(sessao)?.clinicaAtual?.nome || '';
  } catch {

    /* ignore */}
  const mensagem = montarMensagemConsultaOnline({
    pacienteNome: paciente?.nome || consulta?.pacienteNome || '',
    profissional: nomeProfissional || consulta?.profissional,
    data: consulta?.data || undefined,
    horario: consulta?.horario,
    link: linkPaciente,
    clinicaNome
  });
  const telefoneFormatado = telefone.replace(/\D/g, '');
  const numeroCompleto = telefoneFormatado.startsWith('55') ?
  telefoneFormatado :
  `55${telefoneFormatado}`;
  // ⭐ Alternativa por SMS: sem o link o paciente NÃO entra na consulta, então
  // quando o WhatsApp da clínica não está disponível tentamos o SMS antes de
  // empurrar o profissional para o WhatsApp Web.
  const reenviarPorSms = async (motivo: string): Promise<boolean> => {
    // ⭐ Envio centralizado (utils/smsApi): tenta o POST e, se o proxy barrar a
    // requisição antes de chegar ao servidor, repete pela rota alternativa.
    const envio = await enviarSmsApi({
      clinicaId,
      telefone: numeroCompleto,
      mensagem: montarMensagemConsultaOnlineSms({
        pacienteNome: paciente?.nome || consulta?.pacienteNome || '',
        clinicaNome,
        data: consulta?.data || undefined,
        horario: consulta?.horario,
        link: linkPaciente
      }),
      pacienteId: paciente?.id,
      pacienteNome: paciente?.nome || consulta?.pacienteNome,
      consultaId: idConsulta
    });
    if (envio.success) {
      toastSuccess(
        'Convite enviado por SMS',
        `${motivo} O link da sala foi enviado ao paciente por SMS.`
      );
      return true;
    }
    console.error('Erro ao reenviar convite por SMS:', envio.error);
    return false;
  };
  // ⭐ CANAL META (WhatsApp oficial): quando a clínica configurou a Cloud API,
  // o convite vai pelo template aprovado — entregue mesmo fora da janela de 24h.
  const reenviarPorMeta = async (): Promise<boolean> => {
    const disponibilidade = await metaDisponivelApi(clinicaId);
    const template = disponibilidade.templates?.consultaOnline;
    if (!disponibilidade.disponivel || !template) return false;
    const envio = await enviarWhatsappMetaApi({
      clinicaId,
      telefone: numeroCompleto,
      template: {
        name: template.name,
        language: template.language,
        params: [
        paciente?.nome || consulta?.pacienteNome || 'Paciente',
        formatarDataConsultaSimples(consulta?.data || undefined) || '',
        consulta?.horario || ''],

        urlParam: linkPaciente
      },
      pacienteId: paciente?.id,
      pacienteNome: paciente?.nome || consulta?.pacienteNome,
      consultaId: idConsulta
    });
    if (envio.success) {
      toastSuccess(
        'Convite enviado pelo WhatsApp oficial',
        'O link da sala foi enviado ao paciente.'
      );
      return true;
    }
    console.error('Erro ao reenviar convite pela Meta:', envio.error);
    return false;
  };
  // Alternativa completa: Meta (oficial) e, se indisponível, SMS.
  const reenviarAlternativo = async (motivo: string): Promise<boolean> => {
    if (await reenviarPorMeta()) return true;
    return reenviarPorSms(motivo);
  };
  // Se a Meta é o canal preferencial da clínica, vem ANTES do WAHA.
  const metaPreferencial = await metaDisponivelApi(clinicaId);
  if (metaPreferencial.disponivel && metaPreferencial.preferencial) {
    if (await reenviarPorMeta()) return;
  }

  // Config do WhatsApp da clínica.
  let whatsappConfig: {
    serverUrl?: string;
    sessionName?: string;
  } | null = null;
  try {
    const configResponse = await fetch(
      `${API_BASE_URL}/api/whatsapp/config?clinicaId=${clinicaId}`
    );
    if (configResponse.ok) whatsappConfig = await configResponse.json();
  } catch (err) {
    console.error('Erro ao buscar config do WhatsApp:', err);
  }
  // Sem WhatsApp da clínica → cai no WhatsApp Web como último recurso.
  if (!whatsappConfig?.serverUrl || !whatsappConfig?.sessionName) {
    if (await reenviarAlternativo('WhatsApp da clínica não conectado.'))
    return true;
    window.open(
      `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`,
      '_blank'
    );
    toastWarning(
      'WhatsApp da clínica não conectado',
      'O SMS também não está disponível — abrimos o WhatsApp Web para você reenviar o link manualmente.'
    );
    return true;
  }
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/whatsapp/send-message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl: whatsappConfig.serverUrl,
          sessionName: whatsappConfig.sessionName,
          number: numeroCompleto,
          message: mensagem,
          clinicaId,
          pacienteId: paciente?.id,
          pacienteNome: paciente?.nome || consulta?.pacienteNome
        })
      }
    );
    if (response.ok) {
      toastSuccess(
        'Convite reenviado',
        `O link da sala foi reenviado ao paciente pelo WhatsApp da clínica.`
      );
      return true;
    }
    if (await reenviarAlternativo('Falha no envio pelo WhatsApp.')) return true;
    toastError(
      'Falha ao reenviar',
      'Não foi possível reenviar o link pelo WhatsApp nem por SMS.'
    );
    return false;
  } catch (err) {
    console.error('Erro ao reenviar convite:', err);
    if (await reenviarAlternativo('Falha no envio pelo WhatsApp.')) return true;
    toastError(
      'Falha ao reenviar',
      'Não foi possível reenviar o link pelo WhatsApp nem por SMS.'
    );
    return false;
  }
}
