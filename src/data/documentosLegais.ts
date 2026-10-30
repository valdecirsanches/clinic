/**
 * Textos dos documentos legais PÚBLICOS do EasyClin.
 *
 * ⚠️ Estas páginas existem por exigência da Meta: para publicar o app do
 * WhatsApp Business é obrigatório informar URLs públicas (sem login) de
 * Política de Privacidade, Termos de Serviço e Exclusão de Dados.
 *
 * Editar o conteúdo aqui: as três páginas leem deste arquivo.
 */

export interface SecaoLegal {
  titulo: string;
  paragrafos: string[];
  itens?: string[];
}

export interface DocumentoLegal {
  id: 'privacidade' | 'termos' | 'exclusao';
  titulo: string;
  resumo: string;
  secoes: SecaoLegal[];
}

/** Dados de contato do responsável pelo tratamento. Ajuste conforme necessário. */
export const CONTATO_LEGAL = {
  produto: 'EasyClin',
  responsavel: 'EasyClin — Gestão Clínica',
  email: 'valdecirsanches@msn.com',
  site: 'https://clinic.sky9.com.br'
};

export const ATUALIZADO_EM = '31 de agosto de 2026';

export const POLITICA_PRIVACIDADE: DocumentoLegal = {
  id: 'privacidade',
  titulo: 'Política de Privacidade',
  resumo:
  'Como o EasyClin coleta, usa, armazena e protege os dados pessoais tratados no sistema de gestão clínica e nas comunicações por WhatsApp.',
  secoes: [
  {
    titulo: '1. Quem somos e qual é o nosso papel',
    paragrafos: [
    `O ${CONTATO_LEGAL.produto} é um sistema de gestão para clínicas médicas e odontológicas. Ele é utilizado pelas clínicas contratantes para agendar consultas, manter prontuários, emitir documentos e se comunicar com seus pacientes.`,
    'Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), cada clínica contratante é a CONTROLADORA dos dados de seus pacientes: é ela quem decide quais dados coleta e para quê. O EasyClin atua como OPERADOR, tratando esses dados exclusivamente por conta e ordem da clínica.',
    'Se você é paciente e deseja acessar, corrigir ou excluir seus dados, o caminho mais direto é a clínica que o atende. Ainda assim, atendemos solicitações enviadas diretamente a nós, encaminhando-as à clínica responsável.']

  },
  {
    titulo: '2. Quais dados são tratados',
    paragrafos: [
    'O sistema trata apenas os dados necessários ao atendimento em saúde e à gestão da clínica:'],

    itens: [
    'Dados cadastrais do paciente: nome, data de nascimento, CPF, RG, endereço, telefone, celular, e-mail, convênio e número de carteirinha.',
    'Dados de saúde: anamnese, evolução clínica, exame físico, diagnósticos (CID-10), prescrições, atestados, relatórios, pedidos de exame e documentos anexados pelo próprio paciente ou pela clínica.',
    'Dados de agendamento: data, horário, profissional, status da consulta e respostas de confirmação ou cancelamento.',
    'Dados de comunicação: mensagens enviadas e recebidas por WhatsApp, SMS e e-mail, incluindo arquivos que o paciente envie em resposta a uma solicitação da clínica.',
    'Dados de uso do sistema pelos profissionais e funcionários da clínica: identificação do usuário, data e hora das ações, para fins de auditoria.']

  },
  {
    titulo: '3. Comunicação por WhatsApp',
    paragrafos: [
    'A clínica pode utilizar o WhatsApp para enviar lembretes de consulta, pedidos de confirmação, avisos de cancelamento, links de teleconsulta e solicitações de documentos. Esses envios usam a Plataforma do WhatsApp Business (Cloud API), fornecida pela Meta.',
    'Nesse fluxo, o número de telefone do paciente e o conteúdo da mensagem transitam pela infraestrutura da Meta, que os trata conforme a política de privacidade dela. O EasyClin não utiliza esses dados para publicidade, não os vende e não os compartilha com terceiros para fins comerciais.',
    'Quando o paciente responde (confirmando, cancelando ou enviando um arquivo), a resposta é registrada no histórico daquele paciente na clínica e usada apenas para atualizar o agendamento ou arquivar o documento solicitado.',
    'O paciente pode pedir à clínica, a qualquer momento, para não receber mais mensagens por esse canal.']

  },
  {
    titulo: '4. Para que os dados são usados',
    paragrafos: [
    'Os dados são tratados exclusivamente para as finalidades abaixo, sem uso secundário:'],

    itens: [
    'Prestar e documentar o atendimento em saúde, conforme obrigação legal e regulatória dos profissionais e da clínica.',
    'Agendar, confirmar, remarcar e cancelar consultas.',
    'Emitir documentos clínicos e financeiros (receituários, atestados, relatórios, recibos e notas).',
    'Comunicar-se com o paciente sobre o próprio atendimento.',
    'Cumprir obrigações legais, incluindo a guarda do prontuário pelo prazo exigido pela legislação e pelas resoluções dos conselhos profissionais.']

  },
  {
    titulo: '5. Com quem os dados são compartilhados',
    paragrafos: [
    'Não vendemos dados pessoais e não os cedemos para fins de marketing. O compartilhamento ocorre apenas quando necessário à prestação do serviço:'],

    itens: [
    'Meta Platforms, para o envio e recebimento das mensagens do WhatsApp Business.',
    'Provedores de SMS e de assinatura eletrônica, quando esses recursos estiverem habilitados pela clínica.',
    'Serviços de prescrição eletrônica integrados, quando utilizados pelo profissional.',
    'Autoridades públicas, quando houver obrigação legal ou ordem judicial.']

  },
  {
    titulo: '6. Segurança e retenção',
    paragrafos: [
    'O acesso ao sistema é individual, protegido por senha e registrado em trilha de auditoria. As credenciais de integrações ficam armazenadas no servidor e nunca são expostas ao navegador. O tráfego entre o navegador e o servidor é criptografado.',
    'Os dados de prontuário são mantidos pelo prazo mínimo exigido pela legislação de saúde brasileira, ainda que o paciente solicite exclusão — nesse caso, o registro é preservado apenas para cumprimento da obrigação legal, sem uso para qualquer outra finalidade.']

  },
  {
    titulo: '7. Direitos do titular',
    paragrafos: [
    'A LGPD assegura ao titular o direito de confirmar a existência de tratamento, acessar seus dados, corrigi-los, solicitar anonimização, bloqueio ou eliminação, obter portabilidade, revogar consentimento e ser informado sobre compartilhamentos.',
    `Para exercer esses direitos, procure a clínica que o atende ou escreva para ${CONTATO_LEGAL.email}. Responderemos no prazo legal.`]

  },
  {
    titulo: '8. Alterações',
    paragrafos: [
    `Esta política pode ser atualizada para refletir mudanças no sistema ou na legislação. A data da última atualização é sempre exibida no início desta página. Última atualização: ${ATUALIZADO_EM}.`]

  }]

};

export const TERMOS_SERVICO: DocumentoLegal = {
  id: 'termos',
  titulo: 'Termos de Serviço',
  resumo:
  'Condições de uso do EasyClin pelas clínicas contratantes e pelos profissionais e funcionários autorizados.',
  secoes: [
  {
    titulo: '1. Objeto',
    paragrafos: [
    `O ${CONTATO_LEGAL.produto} é um sistema de gestão clínica disponibilizado por assinatura. Ele permite agendar consultas, manter prontuários eletrônicos, emitir documentos clínicos e financeiros e comunicar-se com pacientes por WhatsApp, SMS e e-mail.`,
    'O uso do sistema pressupõe a aceitação integral destes termos e da Política de Privacidade.']

  },
  {
    titulo: '2. Cadastro e acesso',
    paragrafos: [
    'O acesso é pessoal e intransferível. Cada usuário responde pelas ações praticadas com suas credenciais e deve mantê-las em sigilo.',
    'A clínica contratante é responsável por conceder, revisar e revogar os acessos de seus profissionais e funcionários, inclusive as permissões de prontuário.']

  },
  {
    titulo: '3. Responsabilidade sobre o conteúdo clínico',
    paragrafos: [
    'O conteúdo clínico — diagnósticos, prescrições, atestados, relatórios e demais documentos — é de responsabilidade exclusiva do profissional que o emite. O sistema é ferramenta de registro e não substitui o julgamento clínico nem a conferência dos dados antes da emissão ou impressão.',
    'A clínica é responsável pela veracidade dos dados cadastrais e pela regularidade dos profissionais perante seus conselhos.']

  },
  {
    titulo: '4. Comunicação com pacientes',
    paragrafos: [
    'Ao utilizar os canais de mensagem, a clínica declara possuir base legal para contatar o paciente e compromete-se a respeitar pedidos de descadastramento.',
    'O uso do WhatsApp está sujeito às políticas da Meta, incluindo a aprovação prévia de modelos de mensagem. A indisponibilidade ou a recusa de entrega por parte da Meta não é de responsabilidade do EasyClin.']

  },
  {
    titulo: '5. Disponibilidade e suporte',
    paragrafos: [
    'Empenhamo-nos para manter o serviço disponível de forma contínua, ressalvadas manutenções programadas e eventos fora do nosso controle, como falhas de provedores de internet, energia ou serviços de terceiros integrados.']

  },
  {
    titulo: '6. Assinatura e cobrança',
    paragrafos: [
    'A assinatura é cobrada conforme o plano contratado e os serviços adicionais efetivamente habilitados pela clínica. Serviços medidos por uso são faturados pela quantidade apurada no período.',
    'O não pagamento pode acarretar suspensão do acesso, preservados os dados pelo prazo legal.']

  },
  {
    titulo: '7. Encerramento',
    paragrafos: [
    'A clínica pode encerrar a assinatura a qualquer momento. Em caso de encerramento, os dados podem ser exportados mediante solicitação, observados os prazos legais de guarda do prontuário.']

  },
  {
    titulo: '8. Foro e atualizações',
    paragrafos: [
    `Estes termos são regidos pela legislação brasileira. Podem ser atualizados a qualquer tempo, com indicação da data de revisão. Última atualização: ${ATUALIZADO_EM}.`,
    `Dúvidas: ${CONTATO_LEGAL.email}.`]

  }]

};

export const EXCLUSAO_DADOS: DocumentoLegal = {
  id: 'exclusao',
  titulo: 'Exclusão de Dados do Usuário',
  resumo:
  'Como solicitar a exclusão dos seus dados pessoais tratados no EasyClin, o que é excluído e o que a lei obriga a manter.',
  secoes: [
  {
    titulo: '1. Como solicitar',
    paragrafos: [
    'Você pode pedir a exclusão dos seus dados por dois caminhos:'],

    itens: [
    'Diretamente na clínica que o atende — é o caminho mais rápido, porque ela é a responsável pelos seus dados.',
    `Por e-mail para ${CONTATO_LEGAL.email}, informando nome completo, CPF, a clínica em que é atendido e o telefone cadastrado. Esses dados são pedidos apenas para confirmar sua identidade e evitar exclusão indevida.`]

  },
  {
    titulo: '2. Prazo',
    paragrafos: [
    'Confirmada a identidade, a solicitação é processada em até 15 dias corridos. Você recebe uma confirmação por e-mail informando o que foi excluído e o que precisou ser mantido por obrigação legal.']

  },
  {
    titulo: '3. O que é excluído',
    paragrafos: ['Mediante solicitação, são eliminados:'],
    itens: [
    'Dados cadastrais não obrigatórios: e-mail, endereço, dados de contato adicionais e fotografia.',
    'Histórico de mensagens trocadas por WhatsApp, SMS e e-mail.',
    'Documentos enviados por você e que não integrem o prontuário clínico.',
    'Seu número de telefone das listas de envio, encerrando qualquer comunicação automática.']

  },
  {
    titulo: '4. O que a lei obriga a manter',
    paragrafos: [
    'O prontuário do paciente não pode ser apagado a pedido. A legislação de saúde brasileira e as resoluções dos conselhos profissionais determinam a guarda do registro clínico por prazo mínimo, contado do último atendimento.',
    'Nesses casos, o registro é preservado exclusivamente para cumprimento da obrigação legal e da eventual defesa em processo: deixa de ser usado para comunicação, agendamento ou qualquer outra finalidade. Documentos fiscais também são mantidos pelo prazo exigido pela legislação tributária.']

  },
  {
    titulo: '5. Dados na plataforma do WhatsApp',
    paragrafos: [
    'As mensagens trocadas ficam também no aplicativo WhatsApp do seu aparelho e na infraestrutura da Meta, fora do controle do EasyClin. Para removê-las de lá, use os recursos do próprio WhatsApp e as ferramentas de privacidade da Meta.']

  }]

};

export const DOCUMENTOS_LEGAIS: Record<
  DocumentoLegal['id'],
  DocumentoLegal> =
{
  privacidade: POLITICA_PRIVACIDADE,
  termos: TERMOS_SERVICO,
  exclusao: EXCLUSAO_DADOS
};