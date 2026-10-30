export type TipoConsulta = 'medica' | 'odontologica';
export type StatusConsulta =
'agendada' |
'confirmada' |
'realizada' |
'cancelada' |
'aguardando_remarcacao' |
'compareceu' |
'faltou';

// ⭐ NOVO: Tipo de agendamento (normal ou encaixe)
export type TipoAgendamento = 'normal' | 'encaixe';

// ⭐ NOVO: Status do atendimento na fila
export type StatusAtendimento =
'aguardando' |
'em_atendimento' |
'pausado' |
'finalizado';
export type TipoUsuario =
'super_admin' |
'admin' |
'medico' |
'dentista' |
'atendente';
export type StatusPaciente =
'pre_cadastro' |
'ativo' |
'inativo' |
'suspenso' |
'cancelado' |
'excluido' |
'term_tratamento' |
'outros';
export type Genero = 'masculino' | 'feminino' | 'outro' | 'nao_informar';
export type EstadoCivil =
'solteiro' |
'casado' |
'divorciado' |
'viuvo' |
'uniao_estavel';
export type GrauInstrucao =
'fundamental' |
'medio' |
'superior' |
'pos_graduacao';
export type StatusParcela = 'pendente' | 'pago' | 'vencido' | 'cancelado';

// Planos - Agora armazenados no banco de dados
// Os tipos abaixo são mantidos para compatibilidade, mas os planos são carregados da API
export type TipoPlano = string; // Agora aceita qualquer string (IDs customizados)

export interface Plano {
  id: string;
  nome: string;
  preco: number;
  limitePacientes: number | null; // null = ilimitado
  recursos: string[];
  destaque?: boolean;
  ativo?: boolean;
  ordem?: number;
  criadoEm?: string;
  atualizadoEm?: string;
}

// DEPRECATED: Use a API /api/planos para obter os planos atualizados
// Esta constante é mantida apenas para compatibilidade com código legado
// Os valores reais são carregados do banco de dados
export const PLANOS: Plano[] = [
{
  id: 'gratuito',
  nome: 'Grátis',
  preco: 0,
  limitePacientes: 20,
  recursos: [
  'Até 20 pacientes',
  'Agendamento básico',
  'Prontuário eletrônico',
  'Suporte por email']

},
{
  id: 'basico',
  nome: 'Básico',
  preco: 30,
  limitePacientes: 150,
  destaque: true,
  recursos: [
  'Até 150 pacientes',
  'Agendamento completo',
  'Prontuário eletrônico',
  'Lembretes WhatsApp',
  'Relatórios básicos',
  'Suporte prioritário']

},
{
  id: 'profissional',
  nome: 'Profissional',
  preco: 120,
  limitePacientes: null,
  recursos: [
  'Pacientes ilimitados',
  'Todas as funcionalidades',
  'Integração Memed',
  'Relatórios avançados',
  'API de integração',
  'Suporte 24/7',
  'Backup automático']

}];


// ==================== CONVÊNIO ====================
export interface Convenio {
  id: string;
  clinicaId?: string;
  nome: string;
  razaoSocial?: string;
  cnpj?: string;
  registroAns?: string;
  telefone?: string;
  email?: string;
  site?: string;
  contato?: string;

  // Endereço
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;

  // Dados Bancários
  banco?: string;
  agencia?: string;
  conta?: string;

  // Cobrança
  diaCobranca?: number;
  diaPagamento?: number;
  validadeGuia?: number; // em dias

  observacoes?: string;
  ativo: boolean;
  criadoEm: string;
  planos?: PlanoSaude[];
}

// ==================== PLANO DE SAÚDE ====================
export interface PlanoSaude {
  id: string;
  clinicaId?: string;
  convenioId?: string;
  convenioNome?: string;
  nome: string;
  registroAns?: string; // Registro na ANS
  tipo: 'individual' | 'familiar' | 'empresarial' | 'coletivo';
  cobertura?: string; // Descrição da cobertura
  telefone?: string;
  email?: string;
  site?: string;
  observacoes?: string;
  ativo: boolean;
  criadoEm: string;
}

// Procedimentos médicos e odontológicos
export interface Procedimento {
  id: string;
  clinicaId: string;
  nome: string;
  tipo: TipoConsulta; // 'medica' ou 'odontologica'
  duracao: number; // em minutos
  valor?: number;
  descricao?: string;
  ativo: boolean;
  criadoEm: string;
}
export interface Parcela {
  id: string;
  pacienteId: string;
  profissionalId?: string;
  numeroParcela: number;
  valorParcela: number;
  dataVencimento: string;
  status: StatusParcela;
  dataPagamento?: string;
  formaPagamento?: 'pix' | 'cartao' | 'boleto' | 'dinheiro';
  linkPagamento?: string;
  observacoes?: string;
  criadoEm: string;
  dataEmissao?: string;
}
export interface ContratoFinanceiro {
  valorTotal: number;
  numeroParcelas: number;
  diaVencimento: number;
  formaPagamentoPadrao: 'pix' | 'cartao' | 'boleto';
}
export interface Paciente {
  id: string;
  clinicaId: string;

  // Dados Básicos
  matricula: string;
  nome: string;
  status: StatusPaciente;
  numeroContrato?: string;
  dataCadastro: string;
  dataInicio?: string;
  dataNascimento: string;
  idade?: number;
  genero: Genero;
  estadoCivil: EstadoCivil;
  dificuldadeLocomocao: boolean;
  necessidadeEspecial?: string; // ⭐ Complemento: tipo de necessidade especial

  // Foto do paciente
  fotoUrl?: string;

  // WhatsApp - Verificação de contato (para não precisar verificar toda vez)
  whatsappVerificado?: boolean;
  whatsappFotoUrl?: string;
  whatsappVerificadoEm?: string;

  // Documentos
  cpf: string;
  rg?: string;
  emissorRg?: string;
  cns?: string;
  pisPasep?: string;

  // Profissional e Convênio
  convenio?: string;
  empresa?: string;
  plano?: string;
  profissao?: string;
  grauInstrucao?: GrauInstrucao;
  profissionalResponsavel?: string;
  profissionalResponsavelId?: string; // ⭐ Linkado com usuarios (médico/dentista)

  // ⭐ NOVO: Convênio e Plano de Saúde
  convenioId?: string;
  convenioNome?: string; // Campo virtual para exibição
  planoSaudeId?: string;
  planoSaudeNome?: string; // Campo virtual para exibição
  numeroCarteirinha?: string; // Número da carteirinha do plano

  // Empresa Conveniada (parceria)
  empresaConveniadaId?: string;
  empresaId?: string; // ⭐ Alias para empresaConveniadaId (linkado com empresas_conveniadas)
  empresaConveniadaNome?: string; // Campo virtual para exibição
  empresaNome?: string; // Campo virtual para exibição (do JOIN)

  // Filiação
  nomeMae?: string;
  nomePai?: string;
  nomeResponsavel?: string;
  rgResponsavel?: string;
  cpfResponsavel?: string;
  registroEmpresa?: string;

  // Endereço
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  codigoIbge?: string;

  // Contatos
  telefoneResidencial?: string;
  telefone: string;
  email: string;

  // Observações
  observacoes?: string;
  anotacoes?: string;

  // ⭐ Cancelamento
  motivoCancelamento?: string;
  canceladoEm?: string;
  cancelamentoUsuario?: string; // Nome do usuário que cancelou

  // ⭐ Aniversário
  felicitarAniversario?: number; // 1 = enviar felicitação, 0 = não enviar

  criadoEm: string;
}
export interface Consulta {
  id: string;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  tipo: TipoConsulta;
  tipoAgendamento?: TipoAgendamento; // ⭐ NOVO: 'normal' ou 'encaixe'
  modalidade?: 'presencial' | 'online'; // ⭐ NOVO: Modalidade do atendimento
  linkVideo?: string; // ⭐ NOVO: Link da sala de vídeo (para consultas online)
  data: string;
  horario: string;
  duracao: number;
  status: StatusConsulta;
  profissionalId?: string; // ⭐ NOVO: ID do profissional (para não perder ao renomear)
  profissional: string; // Nome do profissional (para exibição)
  procedimentoId?: string; // ID do procedimento selecionado
  procedimentoNome?: string; // Nome do procedimento para exibição
  observacoes?: string;
  motivoCancelamento?: string; // ⭐ NOVO: Motivo do cancelamento (via WhatsApp ou manual)
  dataCancelamento?: string; // ⭐ NOVO: Data informada no cancelamento (YYYY-MM-DD)
  horaCancelamento?: string; // ⭐ NOVO: Hora informada no cancelamento (HH:MM)
  taxaCancelamento?: string; // ⭐ NOVO: Aviso de taxa/prazo aplicado no cancelamento
  canceladoPor?: string; // ⭐ NOVO: Responsável pelo cancelamento (Paciente, Atendente, Médico, Sistema/WhatsApp)
  canalCancelamento?: string; // ⭐ NOVO: Canal do cancelamento (WhatsApp, Agenda, Sistema)
  lembreteEnviado: boolean;
  cor?: string; // Cor personalizada para a consulta
  whatsappTelefone?: string; // ⭐ Telefone usado para comunicação WhatsApp (pode diferir do cadastro)

  // ⭐ NOVOS CAMPOS: Controle de Fila de Atendimento
  horaChegada?: string; // ISO timestamp quando paciente chegou
  horaInicioAtendimento?: string; // quando começou o atendimento
  horaPausaAtendimento?: string; // quando pausou (se pausou)
  horaFimAtendimento?: string; // quando finalizou
  tempoTotalAtendimento?: number; // tempo em segundos
  statusAtendimento?: StatusAtendimento;

  // ⭐ Dados do procedimento (via LEFT JOIN no servidor)
  procedimentoNomeJoin?: string; // Nome do procedimento via JOIN com tabela procedimentos
  procedimentoAnotacoes?: string; // Anotações do procedimento (ex: dente 18, face vestibular)

  // ⭐ Dados do paciente (via JOIN no servidor)
  pacienteDificuldadeLocomocao?: boolean | number; // 1/0 do MySQL
  pacienteNecessidadeEspecial?: string; // ex: 'CADEIRANTE', 'GESTANTE', 'IDOSO', etc.
  pacienteFotoUrl?: string; // Foto do paciente via JOIN
  pacienteDataNascimento?: string; // Data de nascimento do paciente via JOIN
  pacienteConvenio?: string; // Convênio do paciente via JOIN
  pacienteConvenioNome?: string; // Nome do convênio via JOIN
  pacienteTelefone?: string; // Telefone do paciente via JOIN

  // ⭐ FIX CRÍTICO: Dados do PROFISSIONAL (médico/dentista) via LEFT JOIN com usuarios
  // ESTES são os dados confiáveis — NUNCA usar o campo texto "profissional" para exibir
  profissionalNomeJoin?: string; // Nome REAL do médico/dentista (da tabela usuarios)
  profissionalCrm?: string; // CRM do profissional
  profissionalUf?: string; // UF do CRM
  profissionalTipo?: string; // 'medico' | 'dentista'
  profissionalEspecialidade?: string; // Especialidade
  profissionalEspecialidades?: string; // JSON de especialidades
  profissionalTitulo?: string; // Titulo do profissional (Dr., Dra., etc.)
  profissionalCabecalhoRelatorio?: string; // Cabecalho personalizado para relatórios
  profissionalRqes?: string; // JSON de RQEs do profissional

  // ⭐ Valor da consulta
  valor?: number; // Valor cobrado pela consulta (em reais)

  // ⭐ NOVO: Modalidade do atendimento (presencial ou online/telemedicina)
  // Ausente/indefinido é tratado como 'presencial' em toda a UI.
  modalidade?: 'presencial' | 'online';
  // ⭐ NOVO: Link da sala de vídeo (quando modalidade === 'online')
  linkVideo?: string;
}

// ==================== PRONTUÁRIO MÉDICO (ESTRUTURA CORRETA) ====================
// Um paciente tem UM ÚNICO prontuário por clínica
// O prontuário contém MÚLTIPLOS atendimentos (evoluções) ao longo do tempo

// Atendimento/Evolução - cada consulta gera um novo atendimento
export interface Atendimento {
  id: string;
  prontuarioId: string;
  data: string;
  tipo: TipoConsulta;
  queixaPrincipal: string;
  historico: string;
  exameFisico: string;
  diagnostico: string;
  tratamento: string;
  prescricoes?: string;
  exames?: string;
  observacoes?: string;
  profissional: string;
  odontograma?: string; // JSON stringificado do odontograma
  assinaturaPaciente?: string;
  dataAssinatura?: string;
  consultaId?: string; // Referência à consulta agendada (se houver)
  criadoEm: string;
}

// Prontuário - UM por paciente por clínica (contém histórico geral + atendimentos)
export interface Prontuario {
  id: string;
  clinicaId: string;
  pacienteId: string;
  pacienteNome?: string;

  // Histórico geral do paciente (informações permanentes)
  alergias?: string;
  doencasCronicas?: string;
  medicamentosEmUso?: string;
  historicoFamiliar?: string;
  tipoSanguineo?: string;
  observacoesGerais?: string;

  // Metadados
  criadoEm: string;
  atualizadoEm?: string;

  // Atendimentos (evoluções) - carregados separadamente
  atendimentos?: Atendimento[];

  // CAMPOS LEGADOS (para compatibilidade com dados antigos)
  // Estes campos serão migrados para atendimentos individuais
  consultaId?: string;
  data?: string;
  tipo?: TipoConsulta;
  queixaPrincipal?: string;
  historico?: string;
  exameFisico?: string;
  diagnostico?: string;
  tratamento?: string;
  prescricoes?: string;
  observacoes?: string;
  profissional?: string;
  odontograma?: string;
}

// ==================== FIM PRONTUÁRIO MÉDICO ====================

export interface ConfigWhatsApp {
  provider: 'meta' | 'session';

  // Meta (EDSSolution)
  metaApiKey?: string;
  metaPhoneNumberId?: string;

  // Sessão Própria
  serverUrl?: string;
  sessionName?: string;
  apiKey?: string; // ⭐ API Key do WAHA (autenticação)

  // Configurações gerais
  ativo: boolean;
  horasAntecedencia: number;
  mensagemTemplate: string;
  enviarConfirmacao: boolean;

  // Webhook de respostas para confirmação/cancelamento via WhatsApp
  webhookUrl?: string;
  webhookAtivo?: boolean;
}

// ⭐ RQE (Registro de Qualificação de Especialista)
export interface RqeEntry {
  especialidade: string;
  rqe: string;
}
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  senha: string;
  tipo: TipoUsuario;
  operadoraId: string | null;
  clinicaId: string | null;
  ativo: boolean;
  crm?: string;
  uf?: string;
  cpf?: string;
  telefone?: string;
  dataNascimento?: string;
  fotoUrl?: string; // ⭐ Foto de perfil do usuário
  titulo?: string; // ⭐ Título profissional (Dr, Dra, Excelência, etc.)
  cabecalhoRelatorio?: string; // ⭐ Cabeçalho para impressão em relatórios
  rqes?: RqeEntry[]; // ⭐ RQEs - Registro de Qualificação de Especialista (JSON)
  permissoesMenu?: string[]; // ⭐ Permissões customizadas do menu
  termoPesquisa?: string; // ⭐ Termo de pesquisa padrão
  operadoraPadraoId?: string; // ⭐ Operadora pré-selecionada ao logar
  clinicaPadraoId?: string; // ⭐ Clínica pré-selecionada ao logar
  // ⭐ Intervalo de almoço (ponto) — descontado das horas trabalhadas
  intervaloAlmocoAtivo?: boolean; // se o desconto de almoço está habilitado
  intervaloAlmocoInicio?: string; // "12:00"
  intervaloAlmocoFim?: string; // "13:00"
  // ⭐ Libera todas as operações do prontuário (registrar/editar/imprimir)
  //    para usuários que não são médicos ou dentistas
  prontuarioTotal?: boolean;
  criadoEm: string;
}
export interface Clinica {
  id: string;
  operadoraId: string;
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  ativa: boolean;
  criadoEm: string;
  // Novos campos de endereço detalhado
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  plano?: string;
  // Logotipo para documentos e relatórios
  logoUrl?: string;
}
export interface Sessao {
  usuario: Usuario;
  operadoraSelecionada: Operadora | null; // Para super admin selecionar operadora
  clinicaAtual: Clinica | null;
}
export interface Operadora {
  id: string;
  nome: string;
  cnpj: string; // Unique identifier
  razaoSocial: string;
  telefone: string;
  email: string;
  endereco?: string;
  ativa: boolean;
  planoId?: string; // Plano da operadora (default: 'gratuito')
  logoUrl?: string; // ⭐ Logo da operadora (base64 ou URL)
  criadoEm: string;
}
export interface Dependente {
  id: string;
  clinicaId: string;
  pacienteId: string; // ID of the titular patient

  // Basic data
  nome: string;
  dataNascimento: string;
  idade?: number;
  genero: Genero;
  cpf?: string;
  rg?: string;
  parentesco: 'conjuge' | 'filho' | 'pai' | 'mae' | 'irmao' | 'outro';
  parentescoOutro?: string;

  // Contact
  telefone?: string;
  email?: string;

  // Health info
  convenio?: string;
  numeroCarteirinha?: string;

  // Observations
  observacoes?: string;
  criadoEm: string;
}

// Empresa Conveniada - Parceria com empresas para atendimento de funcionários
export interface EmpresaConveniada {
  id: string;
  clinicaId?: string;
  nome: string;
  cnpj?: string;
  razaoSocial?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  contato?: string; // Nome do contato na empresa
  observacoes?: string;
  ativa: boolean;
  criadoEm: string;
}
export interface HorarioTrabalho {
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo, 6 = Sábado
  horaInicio: string; // "08:00"
  horaFim: string; // "18:00"
  intervaloInicio?: string; // "12:00"
  intervaloFim?: string; // "13:00"
  duracaoConsultaPadrao: number; // minutos
  datasEspecificas?: string[]; // ⭐ NOVO: Datas específicas (ex: ["2026-04-15", "2026-04-22"]) — se definido, o profissional só atende nessas datas para este dia da semana
  horariosManuais?: string[]; // ⭐ NOVO: horários avulsos exatos (ex: ['07:30','08:15']). Se definido e não-vazio, substitui o grid gerado por horaInicio/horaFim/duracao para este dia.
  recorrencia?: 'toda_semana' | 'semana_A' | 'semana_B'; // ⭐ NOVO: Rodízio por semanas alternadas (A/B)
}
export interface AgendaProfissional {
  id: string;
  profissionalId: string;
  profissionalNome: string;
  especialidade: 'medico' | 'dentista';
  horarios: HorarioTrabalho[];
  diasEspecificos?: Record<string, string[]>; // ⭐ NOVO: Mapa diaSemana → datas específicas. Ex: { "1": ["2026-04-20", "2026-04-27"] }
  ativo: boolean;
  clinicaId: string;
  criadoEm: string;
}

// ==================== ASSINATURA DIGITAL VIA WHATSAPP ====================

export type TipoAssinatura =
'termo_consentimento' |
'autorizacao_procedimento' |
'contrato' |
'outro';
export type StatusAssinatura =
'pendente' |
'assinado' |
'expirado' |
'cancelado';
export interface AssinaturaPendente {
  id: string;
  token: string;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  tipo: TipoAssinatura;
  titulo: string;
  descricao?: string;
  assinaturaBase64?: string;
  status: StatusAssinatura;
  criadoEm: string;
  assinadoEm?: string;
  expiraEm: string;
}

// ==================== PERMISSÕES DE MENU ====================
export const MENU_ITEMS_CONFIG = [
{
  id: 'dashboard',
  label: 'Dashboard',
  categoria: 'geral'
},
{
  id: 'agenda',
  label: 'Agenda',
  categoria: 'geral'
},
{
  id: 'fila_atendimento',
  label: 'Fila de Atendimento',
  categoria: 'geral'
},
{
  id: 'pacientes',
  label: 'Pacientes',
  categoria: 'geral'
},
{
  id: 'empresas_conveniadas',
  label: 'Empresas',
  categoria: 'geral'
},
{
  id: 'convenios',
  label: 'Convênios',
  categoria: 'financeiro'
},
{
  id: 'planos_saude',
  label: 'Planos de Saúde',
  categoria: 'financeiro'
},
{
  id: 'cobrancas',
  label: 'Cobranças',
  categoria: 'financeiro'
},
{
  id: 'assinatura',
  label: 'Minha Assinatura',
  categoria: 'financeiro'
},
{
  id: 'mensagens',
  label: 'Mensagens',
  categoria: 'comunicacao'
},
{
  id: 'prontuarios',
  label: 'Prontuários',
  categoria: 'clinico'
},
{
  id: 'procedimentos',
  label: 'Procedimentos',
  categoria: 'clinico'
},
{
  id: 'configuracoes',
  label: 'Configurações',
  categoria: 'sistema'
},
{
  id: 'configuracoes_globais',
  label: 'Config. Globais',
  categoria: 'sistema'
},
{
  id: 'whatsapp_meta',
  label: 'WhatsApp Oficial',
  categoria: 'comunicacao'
},
{
  id: 'planos',
  label: 'Planos Sistema',
  categoria: 'sistema'
},
{
  id: 'medicamentos',
  label: 'Medicamentos',
  categoria: 'clinico'
},
{
  id: 'memed_profissionais',
  label: 'Memed',
  categoria: 'clinico'
},
{
  id: 'importacao',
  label: 'Importação',
  categoria: 'sistema'
},
{
  id: 'operadoras',
  label: 'Operadoras',
  categoria: 'admin'
},
{
  id: 'clinicas',
  label: 'Clínicas',
  categoria: 'admin'
},
{
  id: 'usuarios',
  label: 'Usuários',
  categoria: 'admin'
},
{
  id: 'ponto',
  label: 'Ponto / Frequência',
  categoria: 'admin'
},
{
  id: 'ponto_facial',
  label: 'Kiosk Ponto Facial',
  categoria: 'admin'
},
{
  id: 'dossie',
  label: 'Dossiê de Configuração',
  categoria: 'sistema'
},
{
  id: 'assinatura_gestao',
  label: 'Gestão de Assinaturas',
  categoria: 'sistema'
},
{
  id: 'backup',
  label: 'Backup',
  categoria: 'sistema'
},
{
  id: 'video_demo',
  label: 'Vídeo de Demonstração',
  categoria: 'sistema'
}] as
const;
export type MenuItemId = (typeof MENU_ITEMS_CONFIG)[number]['id'];

// Permissões padrão por tipo de usuário
export const PERMISSOES_PADRAO: Record<TipoUsuario, MenuItemId[]> = {
  super_admin: [
  'dashboard',
  'agenda',
  'fila_atendimento',
  'pacientes',
  'empresas_conveniadas',
  'convenios',
  'planos_saude',
  'cobrancas',
  'assinatura',
  'mensagens',
  'prontuarios',
  'procedimentos',
  'importacao',
  'configuracoes',
  'configuracoes_globais',
  'whatsapp_meta',
  'planos',
  'medicamentos',
  'memed_profissionais',
  'operadoras',
  'clinicas',
  'usuarios',
  'ponto',
  'ponto_facial',
  'dossie',
  'assinatura_gestao',
  'backup',
  'video_demo'],

  admin: [
  'dashboard',
  'agenda',
  'fila_atendimento',
  'pacientes',
  'empresas_conveniadas',
  'convenios',
  'planos_saude',
  'cobrancas',
  'assinatura',
  'mensagens',
  'prontuarios',
  'procedimentos',
  'importacao',
  'configuracoes',
  'whatsapp_meta',
  'medicamentos',
  'memed_profissionais',
  'clinicas',
  'usuarios',
  'ponto',
  'ponto_facial'],

  medico: [
  'dashboard',
  'agenda',
  'fila_atendimento',
  'pacientes',
  'empresas_conveniadas',
  'convenios',
  'cobrancas',
  'mensagens',
  'prontuarios',
  'procedimentos',
  'configuracoes',
  'medicamentos'],

  dentista: [
  'dashboard',
  'agenda',
  'fila_atendimento',
  'pacientes',
  'empresas_conveniadas',
  'convenios',
  'cobrancas',
  'mensagens',
  'prontuarios',
  'procedimentos',
  'configuracoes',
  'medicamentos'],

  atendente: [
  'dashboard',
  'agenda',
  'fila_atendimento',
  'pacientes',
  'empresas_conveniadas',
  'convenios',
  'cobrancas',
  'mensagens',
  'configuracoes']

};