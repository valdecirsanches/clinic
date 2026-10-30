// ==================== MIGRAÇÕES DE BANCO DE DADOS ====================
// ⭐ v2.0 — Migração UNIVERSAL: define schema esperado e sincroniza TODAS as clínicas

const dbGlobal = require('../databaseGlobal');
const { getClinicaDBAsync } = require('../databaseClinica');
const { getClinicaDbName } = require('../config/mysql');

// ==================== SCHEMA ESPERADO (fonte única de verdade) ====================
// Cada tabela → lista de colunas com tipo MySQL
// Baseado no createClinicaTables de databaseClinica.js
// Se uma coluna não existe no banco, será adicionada via ALTER TABLE

const EXPECTED_SCHEMA = {
  pacientes: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'matricula', type: 'VARCHAR(50)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'pre_cadastro'" },
  { name: 'numeroContrato', type: 'VARCHAR(100)' },
  { name: 'dataInicio', type: 'VARCHAR(50)' },
  { name: 'dataNascimento', type: 'VARCHAR(50)' },
  { name: 'idade', type: 'INT' },
  { name: 'genero', type: "VARCHAR(50) DEFAULT 'nao_informar'" },
  { name: 'estadoCivil', type: "VARCHAR(50) DEFAULT 'solteiro'" },
  { name: 'dificuldadeLocomocao', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'necessidadeEspecial', type: 'TEXT' },
  { name: 'cpf', type: 'VARCHAR(20)' },
  { name: 'rg', type: 'VARCHAR(30)' },
  { name: 'emissorRg', type: 'VARCHAR(30)' },
  { name: 'cns', type: 'VARCHAR(30)' },
  { name: 'pisPasep', type: 'VARCHAR(30)' },
  { name: 'convenio', type: 'VARCHAR(255)' },
  { name: 'empresa', type: 'VARCHAR(255)' },
  { name: 'plano', type: 'VARCHAR(255)' },
  { name: 'convenioId', type: 'VARCHAR(191)' },
  { name: 'planoSaudeId', type: 'VARCHAR(191)' },
  { name: 'numeroCarteirinha', type: 'VARCHAR(100)' },
  { name: 'empresaConveniadaId', type: 'VARCHAR(191)' },
  { name: 'empresaId', type: 'VARCHAR(191)' },
  { name: 'unidadeEmpresaId', type: 'VARCHAR(191)' },
  { name: 'profissao', type: 'VARCHAR(255)' },
  { name: 'grauInstrucao', type: 'VARCHAR(100)' },
  { name: 'profissionalResponsavel', type: 'VARCHAR(255)' },
  { name: 'profissionalResponsavelId', type: 'VARCHAR(191)' },
  { name: 'nomeMae', type: 'VARCHAR(255)' },
  { name: 'nomePai', type: 'VARCHAR(255)' },
  { name: 'nomeResponsavel', type: 'VARCHAR(255)' },
  { name: 'rgResponsavel', type: 'VARCHAR(30)' },
  { name: 'cpfResponsavel', type: 'VARCHAR(20)' },
  { name: 'registroEmpresa', type: 'VARCHAR(100)' },
  { name: 'cep', type: 'VARCHAR(10)' },
  { name: 'logradouro', type: 'VARCHAR(255)' },
  { name: 'numero', type: 'VARCHAR(20)' },
  { name: 'complemento', type: 'VARCHAR(255)' },
  { name: 'bairro', type: 'VARCHAR(255)' },
  { name: 'cidade', type: 'VARCHAR(255)' },
  { name: 'uf', type: 'VARCHAR(2)' },
  { name: 'codigoIbge', type: 'VARCHAR(10)' },
  { name: 'telefoneResidencial', type: 'VARCHAR(30)' },
  { name: 'telefone', type: 'VARCHAR(30)' },
  { name: 'email', type: 'VARCHAR(255)' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'anotacoes', type: 'TEXT' },
  { name: 'dataCadastro', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'deletado', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'deletadoEm', type: 'VARCHAR(50)' },
  { name: 'fotoUrl', type: 'TEXT' },
  { name: 'endereco', type: 'TEXT' },
  // WhatsApp
  { name: 'whatsappVerificado', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'whatsappFotoUrl', type: 'TEXT' },
  { name: 'whatsappVerificadoEm', type: 'VARCHAR(50)' },
  // Financeiro / Contrato
  { name: 'tipoCobranca', type: 'VARCHAR(50)' },
  { name: 'valorMensalidade', type: 'DECIMAL(10,2)' },
  { name: 'diaVencimentoMensalidade', type: 'INT' },
  { name: 'formaPagamentoPadrao', type: 'VARCHAR(50)' },
  { name: 'profissionalFinanceiroId', type: 'VARCHAR(191)' },
  { name: 'contratoObservacoes', type: 'TEXT' },
  // Vínculo familiar (titular/dependente)
  { name: 'titularId', type: 'VARCHAR(191)' },
  { name: 'parentesco', type: 'VARCHAR(100)' },
  // Cancelamento de paciente
  { name: 'canceladoEm', type: 'VARCHAR(50)' },
  { name: 'motivoCancelamento', type: 'TEXT' },
  { name: 'cancelamentoUsuario', type: 'VARCHAR(255)' },
  // Aniversário
  { name: 'felicitarAniversario', type: 'TINYINT(1) DEFAULT 1' }],


  agendas: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissionalNome', type: 'VARCHAR(255)' },
  { name: 'especialidade', type: 'VARCHAR(100)' },
  { name: 'ativo', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  horarios_trabalho: [
  { name: 'id', type: 'INT' },
  { name: 'agendaId', type: 'VARCHAR(191)' },
  { name: 'diaSemana', type: 'INT' },
  { name: 'horaInicio', type: 'VARCHAR(10)' },
  { name: 'horaFim', type: 'VARCHAR(10)' },
  { name: 'intervaloInicio', type: 'VARCHAR(10)' },
  { name: 'intervaloFim', type: 'VARCHAR(10)' },
  { name: 'duracaoConsultaPadrao', type: 'INT' },
  { name: 'datasEspecificas', type: 'TEXT' },
  { name: 'horariosManuais', type: 'TEXT' },
  { name: 'recorrencia', type: "VARCHAR(20) DEFAULT 'toda_semana'" }],


  consultas: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'tipo', type: 'VARCHAR(50)' },
  { name: 'tipoAgendamento', type: "VARCHAR(50) DEFAULT 'normal'" },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'horario', type: 'VARCHAR(10)' },
  { name: 'duracao', type: 'INT' },
  { name: 'status', type: 'VARCHAR(50)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'motivoCancelamento', type: 'TEXT' },
  // ⭐ Data/hora informadas no cancelamento + taxa aplicada (exibidas no card)
  { name: 'dataCancelamento', type: 'VARCHAR(20)' },
  { name: 'horaCancelamento', type: 'VARCHAR(10)' },
  { name: 'taxaCancelamento', type: 'VARCHAR(120)' },
  // ⭐ Responsável e canal do cancelamento (exibidos no card da agenda)
  { name: 'canceladoPor', type: 'VARCHAR(60)' },
  { name: 'canalCancelamento', type: 'VARCHAR(40)' },
  { name: 'cor', type: 'VARCHAR(20)' },
  { name: 'lembreteEnviado', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'confirmacaoRecebidaEm', type: 'VARCHAR(50)' },
  { name: 'procedimentoId', type: 'VARCHAR(191)' },
  { name: 'procedimentoNome', type: 'VARCHAR(255)' },
  { name: 'whatsappTelefone', type: 'VARCHAR(30)' },
  { name: 'odontograma', type: 'LONGTEXT' },
  { name: 'assinaturaPaciente', type: 'LONGTEXT' },
  { name: 'dataAssinatura', type: 'VARCHAR(50)' },
  // ⭐ Fila de Atendimento
  { name: 'horaChegada', type: 'VARCHAR(50)' },
  { name: 'horaInicioAtendimento', type: 'VARCHAR(50)' },
  { name: 'horaPausaAtendimento', type: 'VARCHAR(50)' },
  { name: 'horaFimAtendimento', type: 'VARCHAR(50)' },
  { name: 'tempoTotalAtendimento', type: 'INT' },
  { name: 'statusAtendimento', type: 'VARCHAR(50)' },
  // ⭐ Valor da consulta
  { name: 'valor', type: 'DOUBLE DEFAULT 0' }],


  prontuarios: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'alergias', type: 'TEXT' },
  { name: 'doencasCronicas', type: 'TEXT' },
  { name: 'medicamentosEmUso', type: 'TEXT' },
  { name: 'historicoFamiliar', type: 'TEXT' },
  { name: 'tipoSanguineo', type: 'VARCHAR(10)' },
  { name: 'observacoesGerais', type: 'TEXT' },
  { name: 'queixaPrincipal', type: 'TEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimentos: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'prontuarioId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'tipo', type: "VARCHAR(50) DEFAULT 'medica'" },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'em_andamento'" },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'odontograma', type: 'LONGTEXT' },
  { name: 'assinaturaPaciente', type: 'LONGTEXT' },
  { name: 'dataAssinatura', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  atendimento_anamneses: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'queixaPrincipal', type: 'TEXT' },
  { name: 'historiaQueixa', type: 'TEXT' },
  { name: 'historicoDoencas', type: 'TEXT' },
  { name: 'alergias', type: 'TEXT' },
  { name: 'medicamentosEmUso', type: 'TEXT' },
  { name: 'historicoFamiliar', type: 'TEXT' },
  { name: 'habitosVida', type: 'TEXT' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_diagnosticos: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'diagnosticoPrincipalCodigo', type: 'VARCHAR(20)' },
  { name: 'diagnosticoPrincipalDescricao', type: 'TEXT' },
  { name: 'outrosDiagnosticos', type: 'TEXT' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_exames_fisicos: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'altura', type: 'VARCHAR(20)' },
  { name: 'peso', type: 'VARCHAR(20)' },
  { name: 'imc', type: 'VARCHAR(20)' },
  { name: 'pressaoArterial', type: 'VARCHAR(20)' },
  { name: 'pulso', type: 'VARCHAR(20)' },
  { name: 'temperatura', type: 'VARCHAR(20)' },
  { name: 'saturacaoO2', type: 'VARCHAR(20)' },
  { name: 'frequenciaRespiratoria', type: 'VARCHAR(20)' },
  { name: 'glicemia', type: 'VARCHAR(20)' },
  { name: 'observacoesGerais', type: 'TEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_exames_solicitados: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'medico', type: 'VARCHAR(255)' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'pedido', type: 'TEXT' },
  { name: 'justificativa', type: 'TEXT' },
  { name: 'cid10', type: 'VARCHAR(20)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  padroes_exames: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'pedido', type: 'TEXT' },
  { name: 'justificativa', type: 'TEXT' },
  { name: 'cid10', type: 'VARCHAR(20)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  padroes_prescricoes: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'controleEspecial', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'medicamentos', type: 'LONGTEXT' },
  { name: 'generico', type: 'TEXT' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_evolucoes: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'evolucao', type: 'TEXT' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_prescricoes: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'controleEspecial', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'generico', type: 'TEXT' },
  { name: 'medicamentos', type: 'LONGTEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_prescricoes_remedios: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'prescricaoId', type: 'VARCHAR(191)' },
  { name: 'remedioId', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'dosagem', type: 'VARCHAR(255)' },
  { name: 'quantidade', type: 'VARCHAR(100)' },
  { name: 'unidade', type: 'VARCHAR(100)' },
  { name: 'posologia', type: 'TEXT' },
  { name: 'tipo', type: "VARCHAR(50) DEFAULT 'medicamento'" },
  { name: 'ordem', type: 'INT DEFAULT 0' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_atestados: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'medico', type: 'VARCHAR(255)' },
  { name: 'dataEmissao', type: 'VARCHAR(50)' },
  { name: 'dataReferencia', type: 'VARCHAR(50)' },
  { name: 'solicitante', type: 'VARCHAR(255)' },
  { name: 'horaChegada', type: 'VARCHAR(10)' },
  { name: 'horaSaida', type: 'VARCHAR(10)' },
  { name: 'finalidadePresenca', type: "VARCHAR(50) DEFAULT 'consulta'" },
  { name: 'outrosComunicamos', type: "VARCHAR(100) DEFAULT 'pode_voltar'" },
  { name: 'cid10', type: 'TEXT' },
  { name: 'qtdeDias', type: 'INT DEFAULT 0' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  atendimento_relatorios: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'titulo', type: 'VARCHAR(255)' },
  { name: 'tipo', type: 'VARCHAR(100)' },
  { name: 'destinatario', type: 'VARCHAR(255)' },
  { name: 'conteudo', type: 'TEXT' },
  { name: 'cid10', type: 'TEXT' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'profissional', type: 'VARCHAR(255)' },
  { name: 'data', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  padroes_relatorios: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'titulo', type: 'VARCHAR(255)' },
  { name: 'tipo', type: 'VARCHAR(100)' },
  { name: 'destinatario', type: 'VARCHAR(255)' },
  { name: 'conteudo', type: 'TEXT' },
  { name: 'cid10', type: 'TEXT' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  parcelas: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'numeroParcela', type: 'INT' },
  { name: 'valorParcela', type: 'DOUBLE' },
  { name: 'dataVencimento', type: 'VARCHAR(50)' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'pendente'" },
  { name: 'dataPagamento', type: 'VARCHAR(50)' },
  { name: 'formaPagamento', type: 'VARCHAR(100)' },
  { name: 'linkPagamento', type: 'TEXT' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'dataEmissao', type: 'VARCHAR(50)' }],


  configuracoes_clinica: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'chave', type: 'VARCHAR(255)' },
  { name: 'valor', type: 'TEXT' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  whatsapp_config: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'clinicaId', type: 'VARCHAR(191)' },
  { name: 'provider', type: 'VARCHAR(100)' },
  { name: 'serverUrl', type: 'VARCHAR(500)' },
  { name: 'sessionName', type: 'VARCHAR(100)' },
  { name: 'apiKey', type: 'VARCHAR(255)' },
  { name: 'ativo', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'horasAntecedencia', type: 'INT DEFAULT 24' },
  { name: 'mensagemTemplate', type: 'TEXT' },
  { name: 'enviarConfirmacao', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'menuAjudaTemplate', type: 'TEXT' },
  { name: 'menuAjudaSituacoes', type: 'TEXT' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  procedimentos: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'tipo', type: 'VARCHAR(50)' },
  { name: 'duracao', type: 'INT DEFAULT 30' },
  { name: 'valor', type: 'DOUBLE' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'ativo', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  planos_saude: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'registroAns', type: 'VARCHAR(50)' },
  { name: 'tipo', type: "VARCHAR(50) DEFAULT 'individual'" },
  { name: 'cobertura', type: 'TEXT' },
  { name: 'telefone', type: 'VARCHAR(50)' },
  { name: 'email', type: 'VARCHAR(255)' },
  { name: 'site', type: 'VARCHAR(500)' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'ativo', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  empresas_conveniadas: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'cnpj', type: 'VARCHAR(20)' },
  { name: 'razaoSocial', type: 'VARCHAR(255)' },
  { name: 'telefone', type: 'VARCHAR(50)' },
  { name: 'email', type: 'VARCHAR(255)' },
  { name: 'endereco', type: 'TEXT' },
  { name: 'contato', type: 'VARCHAR(255)' },
  { name: 'desconto', type: 'DOUBLE DEFAULT 0' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'ativa', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  unidades_empresa: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'empresaConveniadaId', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'codigo', type: 'VARCHAR(50)' },
  { name: 'endereco', type: 'TEXT' },
  { name: 'cidade', type: 'VARCHAR(255)' },
  { name: 'uf', type: 'VARCHAR(2)' },
  { name: 'telefone', type: 'VARCHAR(50)' },
  { name: 'responsavel', type: 'VARCHAR(255)' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'ativa', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  audit_log: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'usuarioId', type: 'VARCHAR(191)' },
  { name: 'usuarioNome', type: 'VARCHAR(255)' },
  { name: 'usuarioTipo', type: 'VARCHAR(50)' },
  { name: 'acao', type: 'VARCHAR(50)' },
  { name: 'entidade', type: 'VARCHAR(100)' },
  { name: 'entidadeId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'detalhes', type: 'TEXT' },
  { name: 'ip', type: 'VARCHAR(50)' },
  { name: 'criadoEm', type: 'VARCHAR(50)' }],


  financeiro: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'profissionalId', type: 'VARCHAR(191)' },
  { name: 'usuarioId', type: 'VARCHAR(191)' },
  { name: 'numeroControle', type: 'INT' },
  { name: 'tipo', type: 'VARCHAR(50)' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'valor', type: 'DOUBLE' },
  { name: 'dataVencimento', type: 'VARCHAR(50)' },
  { name: 'dataPagamento', type: 'VARCHAR(50)' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'pendente'" },
  { name: 'formaPagamento', type: 'VARCHAR(100)' },
  { name: 'parcela', type: 'INT' },
  { name: 'totalParcelas', type: 'INT' },
  { name: 'observacoes', type: 'TEXT' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'dataEmissao', type: 'VARCHAR(50)' }],


  configuracoes_banco: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'banco', type: 'VARCHAR(10)' },
  { name: 'bancoNome', type: 'VARCHAR(100)' },
  { name: 'agencia', type: 'VARCHAR(10)' },
  { name: 'agenciaDigito', type: 'VARCHAR(2)' },
  { name: 'conta', type: 'VARCHAR(20)' },
  { name: 'contaDigito', type: 'VARCHAR(2)' },
  { name: 'carteira', type: 'VARCHAR(10)' },
  { name: 'convenio', type: 'VARCHAR(20)' },
  { name: 'codigoCedente', type: 'VARCHAR(20)' },
  { name: 'nomeCedente', type: 'VARCHAR(255)' },
  { name: 'cnpjCedente', type: 'VARCHAR(20)' },
  { name: 'enderecoCedente', type: 'VARCHAR(500)' },
  { name: 'cidadeCedente', type: 'VARCHAR(100)' },
  { name: 'ufCedente', type: 'VARCHAR(2)' },
  { name: 'cepCedente', type: 'VARCHAR(10)' },
  { name: 'multa', type: 'DOUBLE DEFAULT 2.0' },
  { name: 'juros', type: 'DOUBLE DEFAULT 1.0' },
  { name: 'diasProtesto', type: 'INT DEFAULT 0' },
  { name: 'instrucao1', type: 'VARCHAR(255)' },
  { name: 'instrucao2', type: 'VARCHAR(255)' },
  { name: 'instrucao3', type: 'VARCHAR(255)' },
  { name: 'ativo', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  assinaturas_pendentes: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'token', type: 'VARCHAR(255)' },
  { name: 'clinicaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'pacienteTelefone', type: 'VARCHAR(50)' },
  { name: 'tipo', type: 'VARCHAR(50)' },
  { name: 'titulo', type: 'VARCHAR(255)' },
  { name: 'descricao', type: 'TEXT' },
  { name: 'assinaturaBase64', type: 'LONGTEXT' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'pendente'" },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'assinadoEm', type: 'VARCHAR(50)' },
  { name: 'expiraEm', type: 'VARCHAR(50)' }],


  // ⭐ Exames de Rotina (lista de exames de rotina por clínica)
  atendimento_exames_rotina: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'nome', type: 'VARCHAR(255)' },
  { name: 'criadoEm', type: 'DATETIME' },
  { name: 'atualizadoEm', type: 'DATETIME' }],


  // ⭐ Mensagens WhatsApp (histórico de webhook)
  mensagens: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'clinicaId', type: 'VARCHAR(191)' },
  { name: 'chatId', type: 'VARCHAR(191)' },
  { name: 'consultaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'tipo', type: 'VARCHAR(50)' },
  { name: 'conteudo', type: 'LONGTEXT' },
  { name: 'dataHora', type: 'VARCHAR(50)' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'enviada'" },
  { name: 'erro', type: 'TEXT' },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'fechadoEm', type: 'VARCHAR(50)' }],


  // ⭐ Solicitações Pendentes (foto/documento via WhatsApp)
  solicitacoes_pendentes: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'clinicaId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'telefone', type: 'VARCHAR(50)' },
  { name: 'tipo', type: 'VARCHAR(50)' },
  { name: 'categoria', type: "VARCHAR(50) DEFAULT 'outros'" },
  { name: 'especialidade', type: 'VARCHAR(255)' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'pendente'" },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'expiraEm', type: 'VARCHAR(50)' },
  { name: 'recebidoEm', type: 'VARCHAR(50)' },
  { name: 'arquivoUrl', type: 'TEXT' }],


  // ⭐ Configuração de SMS (provedor SMSGo)
  sms_config: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'clinicaId', type: 'VARCHAR(191)' },
  { name: 'provider', type: "VARCHAR(100) DEFAULT 'smsgo'" },
  { name: 'baseUrl', type: 'VARCHAR(500)' },
  { name: 'apiKey', type: 'TEXT' },
  { name: 'bearerToken', type: 'TEXT' },
  { name: 'remetente', type: 'VARCHAR(100)' },
  { name: 'ativo', type: 'TINYINT(1) DEFAULT 0' },
  { name: 'usarComoFallback', type: 'TINYINT(1) DEFAULT 1' },
  { name: 'mensagemTemplate', type: 'TEXT' },
  { name: 'atualizadoEm', type: 'VARCHAR(50)' }],


  // ⭐ Diálogos WhatsApp (controle de diálogos ativos)
  dialogos_whatsapp: [
  { name: 'id', type: 'VARCHAR(191)' },
  { name: 'clinicaId', type: 'VARCHAR(191)' },
  { name: 'chatId', type: 'VARCHAR(191)' },
  { name: 'pacienteId', type: 'VARCHAR(191)' },
  { name: 'pacienteNome', type: 'VARCHAR(255)' },
  { name: 'status', type: "VARCHAR(50) DEFAULT 'pendente'" },
  { name: 'criadoEm', type: 'VARCHAR(50)' },
  { name: 'fechadoEm', type: 'VARCHAR(50)' }]

};


// ==================== MIGRAÇÃO UNIVERSAL ====================
// Compara schema esperado vs real para CADA clínica e adiciona colunas faltantes

async function runUniversalSchemaMigration(somenteClinicaId = null) {
  console.log('\n🔧 ========== MIGRAÇÃO UNIVERSAL DE SCHEMA ==========');
  console.log('📋 Sincronizando TODAS as tabelas de TODAS as clínicas...\n');

  try {
    const clinicas = somenteClinicaId ?
    await dbGlobal.prepare('SELECT id FROM clinicas WHERE id = ?').all(somenteClinicaId) :
    await dbGlobal.prepare('SELECT id FROM clinicas').all();
    if (!clinicas || clinicas.length === 0) {
      console.log('ℹ️ Nenhuma clínica encontrada');
      return;
    }

    console.log(`📋 ${clinicas.length} clínicas encontradas. Iniciando sincronização...\n`);

    let totalColunasAdicionadas = 0;
    let totalTabelasCriadas = 0;

    for (const clinica of clinicas) {
      try {
        const db = await getClinicaDBAsync(clinica.id);
        if (!db) {
          console.warn(`⚠️ Não foi possível conectar à clínica ${clinica.id}`);
          continue;
        }

        const pool = db.poolPromise || db;
        const dbName = db.dbName || getClinicaDbName(clinica.id);

        // 1. Lista tabelas existentes no banco
        const [existingTables] = await pool.execute(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
          [dbName]
        );
        const existingTableNames = new Set(existingTables.map((t) => t.TABLE_NAME));

        let clinicaColsAdded = 0;
        let clinicaTablesCreated = 0;

        // 2. Para cada tabela do schema esperado
        for (const [tableName, expectedColumns] of Object.entries(EXPECTED_SCHEMA)) {

          // 2a. Se a tabela não existe, o CREATE TABLE IF NOT EXISTS do databaseClinica.js já cuida
          // Mas por segurança, verificamos
          if (!existingTableNames.has(tableName)) {
            // A tabela será criada pelo createClinicaTables na próxima inicialização
            // Mas como já chamamos getClinicaDBAsync acima, ela já deveria existir
            console.log(`   ⚠️ [${clinica.id}] Tabela ${tableName} não existe (será criada automaticamente)`);
            clinicaTablesCreated++;
            continue;
          }

          // 2b. Busca colunas existentes na tabela
          const [existingColumns] = await pool.execute(
            `SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbName, tableName]
          );
          const existingColNames = new Set(existingColumns.map((c) => c.name));

          // 2c. Compara e adiciona colunas faltantes
          for (const col of expectedColumns) {
            if (!existingColNames.has(col.name)) {
              try {
                await pool.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${col.name}\` ${col.type}`);
                clinicaColsAdded++;
                console.log(`   ✅ [${clinica.id}] ${tableName}.${col.name} adicionada (${col.type})`);
              } catch (alterErr) {
                if (!alterErr.message.includes('Duplicate column')) {
                  console.error(`   ❌ [${clinica.id}] Erro ao adicionar ${tableName}.${col.name}: ${alterErr.message}`);
                }
              }
            }
          }
        }

        if (clinicaColsAdded > 0 || clinicaTablesCreated > 0) {
          console.log(`   📊 [${clinica.id}] +${clinicaColsAdded} colunas, +${clinicaTablesCreated} tabelas`);
        }

        totalColunasAdicionadas += clinicaColsAdded;
        totalTabelasCriadas += clinicaTablesCreated;

      } catch (clinicaErr) {
        console.error(`❌ Erro na clínica ${clinica.id}: ${clinicaErr.message}`);
      }
    }

    console.log(`\n✅ ========== MIGRAÇÃO UNIVERSAL CONCLUÍDA ==========`);
    console.log(`   📊 ${clinicas.length} clínicas processadas`);
    console.log(`   📊 ${totalColunasAdicionadas} colunas adicionadas no total`);
    console.log(`   📊 ${totalTabelasCriadas} tabelas criadas no total\n`);

  } catch (err) {
    console.error('❌ Erro fatal na migração universal:', err.message);
  }
}


// ==================== MIGRAÇÕES GLOBAIS (tabelas do banco principal) ====================

// Helper: migra coluna no banco global (MySQL - usa ALTER TABLE direto)
async function migrarColunaGlobal(tabela, coluna, tipo) {
  try {
    await dbGlobal.exec(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${tipo}`);
    console.log(`✅ Coluna ${coluna} adicionada em ${tabela}`);
  } catch (err) {
    // Ignora se coluna já existe (Duplicate column name)
    if (!err.message?.includes('Duplicate column') && !err.message?.includes('duplicate column')) {
      console.error(`❌ Erro ao migrar coluna ${coluna} em ${tabela}:`, err.message);
    }
  }
}

// Migrações da tabela usuarios (global)
async function runMigrations() {
  console.log('\n🔧 Verificando migrações de usuarios...\n');
  try {
    await migrarColunaGlobal('usuarios', 'crm', 'VARCHAR(50)');
    await migrarColunaGlobal('usuarios', 'uf', 'VARCHAR(2)');
    await migrarColunaGlobal('usuarios', 'cpf', 'VARCHAR(20)');
    await migrarColunaGlobal('usuarios', 'telefone', 'VARCHAR(50)');
    await migrarColunaGlobal('usuarios', 'dataNascimento', 'VARCHAR(50)');
    await migrarColunaGlobal('usuarios', 'permissoesMenu', 'TEXT');
    await migrarColunaGlobal('usuarios', 'termoPesquisa', 'TEXT');
    await migrarColunaGlobal('usuarios', 'operadoraPadraoId', 'VARCHAR(191)');
    await migrarColunaGlobal('usuarios', 'clinicaPadraoId', 'VARCHAR(191)');
    await migrarColunaGlobal('usuarios', 'especialidades', 'TEXT');
    await migrarColunaGlobal('usuarios', 'fotoUrl', 'TEXT');
    // ⭐ Campos de título, cabeçalho e RQEs (para relatórios/impressão)
    await migrarColunaGlobal('usuarios', 'titulo', 'VARCHAR(100)');
    await migrarColunaGlobal('usuarios', 'cabecalhoRelatorio', 'TEXT');
    await migrarColunaGlobal('usuarios', 'rqes', 'TEXT');
    // ⭐ Campos de endereço do profissional
    await migrarColunaGlobal('usuarios', 'endereco', 'VARCHAR(255)');
    await migrarColunaGlobal('usuarios', 'numero', 'VARCHAR(20)');
    await migrarColunaGlobal('usuarios', 'complemento', 'VARCHAR(255)');
    await migrarColunaGlobal('usuarios', 'bairro', 'VARCHAR(255)');
    await migrarColunaGlobal('usuarios', 'cidade', 'VARCHAR(255)');
    await migrarColunaGlobal('usuarios', 'cepUsuario', 'VARCHAR(10)');
    await migrarColunaGlobal('usuarios', 'ufEndereco', 'VARCHAR(2)');
    console.log('✅ Migrações de usuarios verificadas\n');
  } catch (err) {
    console.error('❌ Erro nas migrações de usuarios:', err.message);
  }
}

// Migração da tabela clinicas (global)
async function runClinicasMigrations() {
  console.log('🔧 Verificando migrações da tabela clinicas...');
  try {
    await migrarColunaGlobal('clinicas', 'plano', "VARCHAR(50) DEFAULT 'gratuito'");
    await migrarColunaGlobal('clinicas', 'cep', 'VARCHAR(10)');
    await migrarColunaGlobal('clinicas', 'logradouro', 'VARCHAR(255)');
    await migrarColunaGlobal('clinicas', 'numero', 'VARCHAR(20)');
    await migrarColunaGlobal('clinicas', 'complemento', 'VARCHAR(255)');
    await migrarColunaGlobal('clinicas', 'bairro', 'VARCHAR(255)');
    await migrarColunaGlobal('clinicas', 'cidade', 'VARCHAR(255)');
    await migrarColunaGlobal('clinicas', 'uf', 'VARCHAR(2)');
    await migrarColunaGlobal('clinicas', 'logoUrl', 'TEXT');
    await migrarColunaGlobal('clinicas', 'latitude', 'DOUBLE');
    await migrarColunaGlobal('clinicas', 'longitude', 'DOUBLE');
  } catch (err) {
    console.error('❌ Erro nas migrações de clinicas:', err.message);
  }
}

// Migração da tabela operadoras (global)
async function runOperadorasMigrations() {
  console.log('🔧 Verificando migrações da tabela operadoras...');
  try {
    const columns = await dbGlobal.pragma('table_info(operadoras)');
    const names = columns.map((c) => c.name);
    if (!names.includes('planoId')) {
      await dbGlobal.exec("ALTER TABLE operadoras ADD COLUMN planoId VARCHAR(50) DEFAULT 'gratuito'");
      await dbGlobal.prepare("UPDATE operadoras SET planoId = 'gratuito' WHERE planoId IS NULL").run();
      console.log('✅ Coluna planoId adicionada e operadoras atualizadas');
    }
  } catch (err) {
    if (!err.message?.includes('Duplicate column')) {
      console.error('❌ Erro nas migrações de operadoras:', err.message);
    }
  }
}

// Migração de especialidades (global)
async function runEspecialidadesMigration() {
  console.log('🔧 Verificando tabela de especialidades...');
  try {
    const count = await dbGlobal.prepare('SELECT COUNT(*) as count FROM especialidades').get();
    if (count.count === 0) {
      console.log('📋 Inserindo especialidades padrão...');
      const especialidadesPadrao = [
      { id: 'esp_1', nome: 'Clínica Geral', tipo: 'medica' },
      { id: 'esp_2', nome: 'Cardiologia', tipo: 'medica' },
      { id: 'esp_3', nome: 'Dermatologia', tipo: 'medica' },
      { id: 'esp_4', nome: 'Ginecologia', tipo: 'medica' },
      { id: 'esp_5', nome: 'Ortopedia', tipo: 'medica' },
      { id: 'esp_6', nome: 'Pediatria', tipo: 'medica' },
      { id: 'esp_7', nome: 'Psiquiatria', tipo: 'medica' },
      { id: 'esp_8', nome: 'Neurologia', tipo: 'medica' },
      { id: 'esp_9', nome: 'Endocrinologia', tipo: 'medica' },
      { id: 'esp_10', nome: 'Oftalmologia', tipo: 'medica' },
      { id: 'esp_11', nome: 'Odontologia Geral', tipo: 'odontologica' },
      { id: 'esp_12', nome: 'Ortodontia', tipo: 'odontologica' },
      { id: 'esp_13', nome: 'Implantodontia', tipo: 'odontologica' },
      { id: 'esp_14', nome: 'Periodontia', tipo: 'odontologica' },
      { id: 'esp_15', nome: 'Endodontia', tipo: 'odontologica' }];

      const agora = new Date().toISOString();
      for (const e of especialidadesPadrao) {
        try {
          await dbGlobal.prepare("INSERT IGNORE INTO especialidades (id, nome, tipo, ativa, criadoEm) VALUES (?, ?, ?, 1, ?)").run(e.id, e.nome, e.tipo, agora);
        } catch (err) {/* ignora duplicados */}
      }
      console.log('✅ Especialidades padrão inseridas');
    }
    await migrarColunaGlobal('usuarios', 'especialidades', 'TEXT');
  } catch (err) {
    console.error('❌ Erro na migração de especialidades:', err.message);
  }
}


// ==================== EXECUTA TODAS AS MIGRAÇÕES ====================

async function runAllMigrations() {
  console.log('\n🚀 ========== INICIANDO TODAS AS MIGRAÇÕES ==========\n');

  // 1. Migrações globais (banco principal — SQLite/better-sqlite3)
  await runMigrations();
  await runClinicasMigrations();
  await runOperadorasMigrations();
  await runEspecialidadesMigration();

  // 2. ⭐ MIGRAÇÃO UNIVERSAL: sincroniza TODAS as tabelas de TODAS as clínicas
  // Roda em BACKGROUND para não bloquear o startup do servidor
  // (initAllClinicas + createClinicaTables já cria tabelas novas via CREATE TABLE IF NOT EXISTS)
  // A migração universal adiciona COLUNAS faltantes em tabelas já existentes
  console.log('📋 Migração universal será executada em background...');
  setImmediate(async () => {
    try {
      await runUniversalSchemaMigration();
    } catch (err) {
      console.error('⚠️ Migração universal (background):', err.message);
    }
  });

  console.log('🚀 ========== MIGRAÇÕES SÍNCRONAS CONCLUÍDAS ==========\n');
}


// ==================== EXPORTS ====================

module.exports = {
  EXPECTED_SCHEMA,
  runAllMigrations,
  runMigrations,
  runClinicasMigrations,
  runOperadorasMigrations,
  runEspecialidadesMigration,
  runUniversalSchemaMigration,
  // Mantém exports antigos para compatibilidade (todos agora cobertos pela migração universal)
  runConsultasMigrations: async () => {},
  runAllConsultasMigrations: async () => {},
  runPacientesFotoUrlMigration: async () => {},
  runPacientesWhatsAppMigration: async () => {},
  runProntuariosMigration: async () => {},
  runAssinaturasMigration: async () => {},
  runAllAssinaturasMigrations: async () => {},
  runProfissionalIdMigration: async () => {},
  runProntuarioExtrasMigration: async () => {},
  runPrescricoesRemediosMigration: async () => {},
  runPacientesNumeroContratoMigration: async () => {},
  runPacientesFinanceiroMigration: async () => {},
  runAtestadosMigration: async () => {}
};