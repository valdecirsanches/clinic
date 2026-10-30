// ==================== BANCO DE DADOS POR CLÍNICA (MySQL) ====================
// Migrado de sqlite3 → mysql2
// Exporta getClinicaDB(clinicaId) que retorna objeto com API compatível: db.run/db.get/db.all

const mysql = require('mysql2');
const { MYSQL_CONFIG, GLOBAL_DB_NAME, getClinicaDbName } = require('./config/mysql');

// Cache de pools por clínica
const clinicaPools = {};

// ==================== WRAPPER COMPATÍVEL COM sqlite3 ====================
// Imita a API de callbacks do sqlite3: db.run(sql, params, cb), db.get(sql, params, cb), db.all(sql, params, cb)
// Assim as rotas NÃO precisam mudar!
// IMPORTANTE: Usa query() (protocolo texto) em vez de execute() (prepared statements binários)
// para compatibilidade máxima com código que vinha do SQLite (tipos flexíveis, DDL, etc.)

class MysqlClinicaWrapper {
  constructor(pool, poolPromise, clinicaId, dbName) {
    this.pool = pool;
    this.poolPromise = poolPromise;
    this.clinicaId = clinicaId;
    this.dbName = dbName;
  }

  // Imita sqlite3: db.run(sql, params?, callback?)
  run(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (!params) params = [];
    if (!Array.isArray(params)) params = [params];

    const mysqlSql = convertSql(sql);

    // Usa query() em vez de execute() — protocolo texto, aceita qualquer tipo
    this.poolPromise.query(mysqlSql, params).
    then(([result]) => {
      if (callback) {
        const ctx = { lastID: result.insertId, changes: result.affectedRows };
        callback.call(ctx, null);
      }
    }).
    catch((err) => {
      if (callback) callback(err);else
      console.error(`❌ [${this.dbName}] SQL Error:`, err.message);
    });
  }

  // Imita sqlite3: db.get(sql, params?, callback)
  get(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (!params) params = [];
    if (!Array.isArray(params)) params = [params];

    const mysqlSql = convertSql(sql);

    this.poolPromise.query(mysqlSql, params).
    then(([rows]) => {
      if (callback) callback(null, rows[0] || null);
    }).
    catch((err) => {
      if (callback) callback(err);else
      console.error(`❌ [${this.dbName}] SQL Error:`, err.message);
    });
  }

  // Imita sqlite3: db.all(sql, params?, callback)
  all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (!params) params = [];
    if (!Array.isArray(params)) params = [params];

    const mysqlSql = convertSql(sql);

    this.poolPromise.query(mysqlSql, params).
    then(([rows]) => {
      if (callback) callback(null, rows);
    }).
    catch((err) => {
      if (callback) callback(err);else
      console.error(`❌ [${this.dbName}] SQL Error:`, err.message);
    });
  }

  // Imita sqlite3: db.serialize(fn) — MySQL não precisa, apenas executa
  serialize(fn) {
    if (fn) fn();
  }

  // Helper para execução direta com promises
  async execute(sql, params = []) {
    const mysqlSql = convertSql(sql);
    return this.poolPromise.query(mysqlSql, params);
  }
}

// ==================== CONVERSÃO SQL SQLite → MySQL ====================
function convertSql(sql) {
  let converted = sql;

  // AUTOINCREMENT → AUTO_INCREMENT
  converted = converted.replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT');

  // INTEGER PRIMARY KEY AUTOINCREMENT → INT AUTO_INCREMENT PRIMARY KEY
  converted = converted.replace(
    /(\w+)\s+INTEGER\s+PRIMARY\s+KEY\s+AUTO_INCREMENT/gi,
    '$1 INT AUTO_INCREMENT PRIMARY KEY'
  );

  // INSERT OR IGNORE → INSERT IGNORE
  converted = converted.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE');

  // PRAGMA table_info — não deve chegar aqui, mas por segurança
  if (converted.trim().startsWith('PRAGMA')) {
    console.warn('⚠️ PRAGMA detectado no SQL, ignorando:', converted.substring(0, 50));
    return 'SELECT 1'; // No-op
  }

  return converted;
}

// ==================== CRIAÇÃO DE TABELAS POR CLÍNICA ====================
async function createClinicaTables(poolPromise, dbName, clinicaId) {
  const tables = [
  // Pacientes
  `CREATE TABLE IF NOT EXISTS pacientes (
      id VARCHAR(191) PRIMARY KEY,
      matricula VARCHAR(50),
      nome VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'pre_cadastro',
      numeroContrato VARCHAR(100),
      dataInicio VARCHAR(50),
      dataNascimento VARCHAR(50),
      idade INT,
      genero VARCHAR(50) DEFAULT 'nao_informar',
      estadoCivil VARCHAR(50) DEFAULT 'solteiro',
      dificuldadeLocomocao TINYINT(1) DEFAULT 0,
      necessidadeEspecial TEXT,
      cpf VARCHAR(20),
      rg VARCHAR(30),
      emissorRg VARCHAR(30),
      cns VARCHAR(30),
      pisPasep VARCHAR(30),
      convenio VARCHAR(255),
      empresa VARCHAR(255),
      plano VARCHAR(255),
      convenioId VARCHAR(191),
      planoSaudeId VARCHAR(191),
      numeroCarteirinha VARCHAR(100),
      empresaConveniadaId VARCHAR(191),
      empresaId VARCHAR(191),
      unidadeEmpresaId VARCHAR(191),
      profissao VARCHAR(255),
      grauInstrucao VARCHAR(100),
      profissionalResponsavel VARCHAR(255),
      profissionalResponsavelId VARCHAR(191),
      nomeMae VARCHAR(255),
      nomePai VARCHAR(255),
      nomeResponsavel VARCHAR(255),
      rgResponsavel VARCHAR(30),
      cpfResponsavel VARCHAR(20),
      registroEmpresa VARCHAR(100),
      cep VARCHAR(10),
      logradouro VARCHAR(255),
      numero VARCHAR(20),
      complemento VARCHAR(255),
      bairro VARCHAR(255),
      cidade VARCHAR(255),
      uf VARCHAR(2),
      codigoIbge VARCHAR(10),
      telefoneResidencial VARCHAR(30),
      telefone VARCHAR(30),
      email VARCHAR(255),
      observacoes TEXT,
      anotacoes TEXT,
      dataCadastro VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      deletado TINYINT(1) DEFAULT 0,
      deletadoEm VARCHAR(50),
      fotoUrl TEXT,
      endereco TEXT,
      motivoCancelamento TEXT,
      canceladoEm VARCHAR(50),
      cancelamentoUsuario VARCHAR(255),
      titularId VARCHAR(191),
      parentesco VARCHAR(100),
      felicitarAniversario TINYINT(1) DEFAULT 1
    )`,

  // Agendas
  `CREATE TABLE IF NOT EXISTS agendas (
      id VARCHAR(191) PRIMARY KEY,
      profissionalId VARCHAR(191),
      profissionalNome VARCHAR(255) NOT NULL,
      especialidade VARCHAR(100) NOT NULL,
      ativo TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL
    )`,

  // Horários de Trabalho
  `CREATE TABLE IF NOT EXISTS horarios_trabalho (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agendaId VARCHAR(191) NOT NULL,
      diaSemana INT NOT NULL,
      horaInicio VARCHAR(10) NOT NULL,
      horaFim VARCHAR(10) NOT NULL,
      intervaloInicio VARCHAR(10),
      intervaloFim VARCHAR(10),
      duracaoConsultaPadrao INT NOT NULL,
      datasEspecificas TEXT,
      horariosManuais TEXT,
      recorrencia VARCHAR(20) DEFAULT 'toda_semana'
    )`,

  // Consultas
  `CREATE TABLE IF NOT EXISTS consultas (
      id VARCHAR(191) PRIMARY KEY,
      pacienteId VARCHAR(191) NOT NULL,
      pacienteNome VARCHAR(255) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      tipoAgendamento VARCHAR(50) DEFAULT 'normal',
      data VARCHAR(50) NOT NULL,
      horario VARCHAR(10) NOT NULL,
      duracao INT NOT NULL,
      status VARCHAR(50) NOT NULL,
      profissional VARCHAR(255) NOT NULL,
      profissionalId VARCHAR(191),
      observacoes TEXT,
      motivoCancelamento TEXT,
      cor VARCHAR(20),
      lembreteEnviado TINYINT(1) DEFAULT 0,
      confirmacaoRecebidaEm VARCHAR(50),
      procedimentoId VARCHAR(191),
      procedimentoNome VARCHAR(255),
      whatsappTelefone VARCHAR(30),
      odontograma LONGTEXT,
      assinaturaPaciente LONGTEXT,
      dataAssinatura VARCHAR(50),
      horaChegada VARCHAR(50),
      horaInicioAtendimento VARCHAR(50),
      horaPausaAtendimento VARCHAR(50),
      horaFimAtendimento VARCHAR(50),
      tempoTotalAtendimento INT,
      statusAtendimento VARCHAR(50),
      valor DOUBLE DEFAULT 0,
      modalidade VARCHAR(20) DEFAULT 'presencial',
      linkVideo VARCHAR(500),
      confirmacaoToken VARCHAR(191),
      confirmacaoCanal VARCHAR(30),
      canalCancelamento VARCHAR(30)
    )`,

  // ⭐ PrintServer - Registros de impressão persistidos no banco
  `CREATE TABLE IF NOT EXISTS printserver (
      id VARCHAR(191) PRIMARY KEY,
      clientId VARCHAR(191),
      acao VARCHAR(50),
      status VARCHAR(50) DEFAULT 'queued',
      dados LONGTEXT,
      clinica VARCHAR(191),
      contrato VARCHAR(191),
      matricula VARCHAR(255),
      dentista_nome VARCHAR(255),
      nome_paciente VARCHAR(255),
      valor VARCHAR(50),
      titulo VARCHAR(255),
      procedimento VARCHAR(255),
      empresa_nome VARCHAR(255),
      login VARCHAR(255),
      clinica_fone VARCHAR(100),
      erro TEXT,
      criadoEm VARCHAR(50) NOT NULL,
      enviadoEm VARCHAR(50),
      completadoEm VARCHAR(50),
      INDEX idx_printserver_clinica (clinica),
      INDEX idx_printserver_status (status),
      INDEX idx_printserver_criado (criadoEm)
    )`,

  // Prontuários
  `CREATE TABLE IF NOT EXISTS prontuarios (
      id VARCHAR(191) PRIMARY KEY,
      pacienteId VARCHAR(191) NOT NULL,
      pacienteNome VARCHAR(255),
      alergias TEXT,
      doencasCronicas TEXT,
      medicamentosEmUso TEXT,
      historicoFamiliar TEXT,
      tipoSanguineo VARCHAR(10),
      observacoesGerais TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL,
      UNIQUE KEY unique_paciente (pacienteId)
    )`,

  // Atendimentos
  `CREATE TABLE IF NOT EXISTS atendimentos (
      id VARCHAR(191) PRIMARY KEY,
      prontuarioId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      consultaId VARCHAR(191),
      data VARCHAR(50) NOT NULL,
      tipo VARCHAR(50) NOT NULL DEFAULT 'medica',
      status VARCHAR(50) DEFAULT 'em_andamento',
      profissional VARCHAR(255),
      profissionalId VARCHAR(191),
      observacoes TEXT,
      odontograma LONGTEXT,
      assinaturaPaciente LONGTEXT,
      dataAssinatura VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL
    )`,

  // Anamneses
  `CREATE TABLE IF NOT EXISTS atendimento_anamneses (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      queixaPrincipal TEXT,
      historiaQueixa TEXT,
      historicoDoencas TEXT,
      alergias TEXT,
      medicamentosEmUso TEXT,
      historicoFamiliar TEXT,
      habitosVida TEXT,
      observacoes TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Diagnósticos
  `CREATE TABLE IF NOT EXISTS atendimento_diagnosticos (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      diagnosticoPrincipalCodigo VARCHAR(20),
      diagnosticoPrincipalDescricao TEXT,
      outrosDiagnosticos TEXT,
      observacoes TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Exames Físicos
  `CREATE TABLE IF NOT EXISTS atendimento_exames_fisicos (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      altura VARCHAR(20),
      peso VARCHAR(20),
      imc VARCHAR(20),
      pressaoArterial VARCHAR(20),
      pulso VARCHAR(20),
      temperatura VARCHAR(20),
      saturacaoO2 VARCHAR(20),
      frequenciaRespiratoria VARCHAR(20),
      glicemia VARCHAR(20),
      observacoesGerais TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Exames Solicitados
  `CREATE TABLE IF NOT EXISTS atendimento_exames_solicitados (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      medico VARCHAR(255),
      descricao TEXT,
      pedido TEXT,
      justificativa TEXT,
      cid10 VARCHAR(20),
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Padrões de Exames (nome correto usado pelas rotas)
  `CREATE TABLE IF NOT EXISTS padroes_exames (
      id VARCHAR(191) PRIMARY KEY,
      profissionalId VARCHAR(191),
      nome VARCHAR(255) NOT NULL,
      descricao TEXT,
      pedido TEXT,
      justificativa TEXT,
      cid10 VARCHAR(20),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Padrões de Prescrições
  `CREATE TABLE IF NOT EXISTS padroes_prescricoes (
      id VARCHAR(191) PRIMARY KEY,
      profissionalId VARCHAR(191),
      nome VARCHAR(255) NOT NULL,
      descricao TEXT,
      controleEspecial TINYINT(1) DEFAULT 0,
      medicamentos LONGTEXT,
      generico TEXT,
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Evoluções
  `CREATE TABLE IF NOT EXISTS atendimento_evolucoes (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      evolucao TEXT,
      observacoes TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Prescrições
  `CREATE TABLE IF NOT EXISTS atendimento_prescricoes (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      descricao TEXT,
      controleEspecial TINYINT(1) DEFAULT 0,
      data VARCHAR(50),
      generico TEXT,
      medicamentos LONGTEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Remédios da Prescrição (separada)
  `CREATE TABLE IF NOT EXISTS atendimento_prescricoes_remedios (
      id VARCHAR(191) PRIMARY KEY,
      prescricaoId VARCHAR(191) NOT NULL,
      remedioId VARCHAR(191),
      nome VARCHAR(255) NOT NULL,
      dosagem VARCHAR(255),
      quantidade VARCHAR(100),
      unidade VARCHAR(100),
      posologia TEXT,
      tipo VARCHAR(50) DEFAULT 'medicamento',
      ordem INT DEFAULT 0,
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    )`,

  // Parcelas
  `CREATE TABLE IF NOT EXISTS parcelas (
      id VARCHAR(191) PRIMARY KEY,
      pacienteId VARCHAR(191) NOT NULL,
      profissionalId VARCHAR(191),
      numeroParcela INT NOT NULL,
      valorParcela DOUBLE NOT NULL,
      dataVencimento VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pendente',
      dataPagamento VARCHAR(50),
      formaPagamento VARCHAR(100),
      linkPagamento TEXT,
      observacoes TEXT,
      criadoEm VARCHAR(50) NOT NULL,
      dataEmissao VARCHAR(50)
    )`,

  // Configurações da Clínica
  `CREATE TABLE IF NOT EXISTS configuracoes_clinica (
      id VARCHAR(191) PRIMARY KEY,
      chave VARCHAR(255) NOT NULL,
      valor TEXT NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL,
      UNIQUE KEY unique_chave (chave)
    )`,

  // WhatsApp Config
  `CREATE TABLE IF NOT EXISTS whatsapp_config (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      serverUrl VARCHAR(500),
      sessionName VARCHAR(100),
      apiKey VARCHAR(255),
      ativo TINYINT(1) DEFAULT 1,
      horasAntecedencia INT DEFAULT 24,
      mensagemTemplate TEXT,
      enviarConfirmacao TINYINT(1) DEFAULT 1,
      webhookUrl VARCHAR(1000),
      webhookAtivo TINYINT(1) DEFAULT 1,
      menuAjudaTemplate TEXT,
      menuAjudaSituacoes TEXT,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // SMS Config (provedor SMSGo)
  `CREATE TABLE IF NOT EXISTS sms_config (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      provider VARCHAR(100) NOT NULL DEFAULT 'smsgo',
      baseUrl VARCHAR(500),
      apiKey TEXT,
      bearerToken TEXT,
      remetente VARCHAR(100),
      ativo TINYINT(1) DEFAULT 0,
      usarComoFallback TINYINT(1) DEFAULT 1,
      mensagemTemplate TEXT,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Procedimentos
  `CREATE TABLE IF NOT EXISTS procedimentos (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      duracao INT NOT NULL DEFAULT 30,
      valor DOUBLE,
      descricao TEXT,
      ativo TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL
    )`,

  // Planos de Saúde
  `CREATE TABLE IF NOT EXISTS planos_saude (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      registroAns VARCHAR(50),
      tipo VARCHAR(50) DEFAULT 'individual',
      cobertura TEXT,
      telefone VARCHAR(50),
      email VARCHAR(255),
      site VARCHAR(500),
      observacoes TEXT,
      ativo TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL
    )`,

  // Empresas Conveniadas
  `CREATE TABLE IF NOT EXISTS empresas_conveniadas (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cnpj VARCHAR(20),
      razaoSocial VARCHAR(255),
      telefone VARCHAR(50),
      email VARCHAR(255),
      endereco TEXT,
      contato VARCHAR(255),
      desconto DOUBLE DEFAULT 0,
      observacoes TEXT,
      ativa TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL
    )`,

  // Unidades Empresa
  `CREATE TABLE IF NOT EXISTS unidades_empresa (
      id VARCHAR(191) PRIMARY KEY,
      empresaConveniadaId VARCHAR(191) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      codigo VARCHAR(50),
      endereco TEXT,
      cidade VARCHAR(255),
      uf VARCHAR(2),
      telefone VARCHAR(50),
      responsavel VARCHAR(255),
      observacoes TEXT,
      ativa TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL
    )`,

  // ⭐ LGPD: Log de Auditoria (quem acessou, quando, onde, o que fez)
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
      criadoEm VARCHAR(50) NOT NULL,
      INDEX idx_audit_paciente (pacienteId),
      INDEX idx_audit_usuario (usuarioId),
      INDEX idx_audit_data (criadoEm),
      INDEX idx_audit_entidade (entidade, entidadeId)
    )`,

  // Relatórios
  `CREATE TABLE IF NOT EXISTS atendimento_relatorios (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      titulo VARCHAR(255),
      tipo VARCHAR(100),
      destinatario VARCHAR(255),
      conteudo TEXT,
      cid10 TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Padrões de Relatórios
  `CREATE TABLE IF NOT EXISTS padroes_relatorios (
      id VARCHAR(191) PRIMARY KEY,
      profissionalId VARCHAR(191),
      nome VARCHAR(255) NOT NULL,
      titulo VARCHAR(255),
      tipo VARCHAR(100),
      destinatario VARCHAR(255),
      conteudo TEXT,
      cid10 TEXT,
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // Financeiro
  `CREATE TABLE IF NOT EXISTS financeiro (
      id VARCHAR(191) PRIMARY KEY,
      pacienteId VARCHAR(191) NOT NULL,
      profissionalId VARCHAR(191),
      usuarioId VARCHAR(191),
      numeroControle INT,
      tipo VARCHAR(50) NOT NULL,
      descricao TEXT,
      valor DOUBLE NOT NULL,
      dataVencimento VARCHAR(50),
      dataPagamento VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pendente',
      formaPagamento VARCHAR(100),
      parcela INT,
      totalParcelas INT,
      observacoes TEXT,
      criadoEm VARCHAR(50),
      dataEmissao VARCHAR(50)
    )`,

  // ⭐ Configurações Bancárias (para emissão de boletos registrados)
  `CREATE TABLE IF NOT EXISTS configuracoes_banco (
      id VARCHAR(191) PRIMARY KEY,
      banco VARCHAR(10) NOT NULL,
      bancoNome VARCHAR(100),
      agencia VARCHAR(10) NOT NULL,
      agenciaDigito VARCHAR(2),
      conta VARCHAR(20) NOT NULL,
      contaDigito VARCHAR(2) NOT NULL,
      carteira VARCHAR(10) NOT NULL,
      convenio VARCHAR(20),
      codigoCedente VARCHAR(20),
      nomeCedente VARCHAR(255) NOT NULL,
      cnpjCedente VARCHAR(20) NOT NULL,
      enderecoCedente VARCHAR(500),
      cidadeCedente VARCHAR(100),
      ufCedente VARCHAR(2),
      cepCedente VARCHAR(10),
      multa DOUBLE DEFAULT 2.0,
      juros DOUBLE DEFAULT 1.0,
      diasProtesto INT DEFAULT 0,
      instrucao1 VARCHAR(255),
      instrucao2 VARCHAR(255),
      instrucao3 VARCHAR(255),
      clientId VARCHAR(255),
      clientSecret VARCHAR(255),
      itauKey VARCHAR(255),
      tipoAmbiente INT DEFAULT 2,
      tokenOAuth TEXT,
      tokenValidade VARCHAR(50),
      tipoJuros INT DEFAULT 5,
      tipoMulta INT DEFAULT 3,
      boletoRegistrado TINYINT(1) DEFAULT 0,
      ativo TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,

  // ⭐ Atestados Médicos (Lei 14.724/2023)
  `CREATE TABLE IF NOT EXISTS atendimento_atestados (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      medico VARCHAR(255),
      dataEmissao VARCHAR(50),
      dataReferencia VARCHAR(50),
      solicitante VARCHAR(255),
      horaChegada VARCHAR(10),
      horaSaida VARCHAR(10),
      finalidadePresenca VARCHAR(50) DEFAULT 'consulta',
      outrosComunicamos VARCHAR(100) DEFAULT 'pode_voltar',
      cid10 TEXT,
      qtdeDias INT DEFAULT 0,
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    )`,

  // ⭐ Assinaturas Pendentes
  `CREATE TABLE IF NOT EXISTS assinaturas_pendentes (
      id VARCHAR(191) PRIMARY KEY,
      token VARCHAR(255) UNIQUE NOT NULL,
      clinicaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      pacienteNome VARCHAR(255) NOT NULL,
      pacienteTelefone VARCHAR(50) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      descricao TEXT,
      assinaturaBase64 LONGTEXT,
      status VARCHAR(50) DEFAULT 'pendente',
      criadoEm VARCHAR(50) NOT NULL,
      assinadoEm VARCHAR(50),
      expiraEm VARCHAR(50) NOT NULL
    )`,

  // ⭐ Mensagens WhatsApp (histórico de webhook)
  // ⭐⭐⭐ FIX v18.0: Adicionado campo consultaId ⭐⭐⭐
  `CREATE TABLE IF NOT EXISTS mensagens (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      chatId VARCHAR(191),
      consultaId VARCHAR(191),
      pacienteId VARCHAR(191),
      pacienteNome VARCHAR(255),
      tipo VARCHAR(50) NOT NULL,
      conteudo LONGTEXT NOT NULL,
      dataHora VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'enviada',
      erro TEXT,
      criadoEm VARCHAR(50) NOT NULL,
      fechadoEm VARCHAR(50),
      INDEX idx_mensagens_clinica (clinicaId),
      INDEX idx_mensagens_paciente (pacienteId),
      INDEX idx_mensagens_chatId (chatId),
      INDEX idx_mensagens_consultaId (consultaId),
      INDEX idx_mensagens_status (status),
      INDEX idx_mensagens_dataHora (dataHora)
    )`,

  // ⭐ Solicitações Pendentes (foto/documento via WhatsApp)
  `CREATE TABLE IF NOT EXISTS solicitacoes_pendentes (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      pacienteNome VARCHAR(255),
      telefone VARCHAR(50) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      categoria VARCHAR(50) DEFAULT 'outros',
      status VARCHAR(50) NOT NULL DEFAULT 'pendente',
      criadoEm VARCHAR(50) NOT NULL,
      expiraEm VARCHAR(50) NOT NULL,
      recebidoEm VARCHAR(50),
      arquivoUrl TEXT,
      INDEX idx_solicitacoes_status (status),
      INDEX idx_solicitacoes_telefone (telefone)
    )`,

  // ⭐ Documentos do Paciente (fotos, exames, laudos, etc.)
  `CREATE TABLE IF NOT EXISTS documentos (
      id VARCHAR(191) PRIMARY KEY,
      pacienteId VARCHAR(191) NOT NULL,
      nome VARCHAR(500) NOT NULL,
      nomeOriginal VARCHAR(500),
      tipo VARCHAR(100),
      categoria VARCHAR(100),
      caminho TEXT,
      url TEXT,
      tamanho INTEGER,
      observacoes TEXT,
      criadoPor VARCHAR(255),
      criadoEm VARCHAR(50),
      INDEX idx_documentos_paciente (pacienteId),
      INDEX idx_documentos_categoria (categoria)
    )`,

  // ⭐ Exames de Rotina (lista de exames de rotina por clínica)
  `CREATE TABLE IF NOT EXISTS atendimento_exames_rotina (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // ⭐ Diálogos WhatsApp (controle de diálogos ativos)
  `CREATE TABLE IF NOT EXISTS dialogos_whatsapp (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      chatId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191),
      pacienteNome VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'pendente',
      criadoEm VARCHAR(50) NOT NULL,
      fechadoEm VARCHAR(50),
      INDEX idx_dialogos_clinica_chat (clinicaId, chatId),
      INDEX idx_dialogos_status (status)
    )`,

  // ⭐ Ponto Biométrico - Registro de chegada/saída de funcionários
  // Alimentado pelo programa BiometriaWS (leitor instalado em outra máquina)
  // via os endpoints /api/biometria. O usuarioId referencia usuarios (banco global).
  `CREATE TABLE IF NOT EXISTS ponto_biometrico (
      id VARCHAR(191) PRIMARY KEY,
      usuarioId VARCHAR(191) NOT NULL,
      usuarioNome VARCHAR(255),
      tipo VARCHAR(20) NOT NULL,
      dataHora VARCHAR(50) NOT NULL,
      dia VARCHAR(20) NOT NULL,
      origem VARCHAR(50) DEFAULT 'biometria',
      biometriaId VARCHAR(191),
      confianca FLOAT,
      observacoes TEXT,
      criadoEm VARCHAR(50) NOT NULL,
      INDEX idx_ponto_usuario (usuarioId),
      INDEX idx_ponto_dia (dia),
      INDEX idx_ponto_tipo (tipo)
    )`];


  for (const sql of tables) {
    try {
      await poolPromise.execute(sql);
    } catch (err) {
      console.error(`❌ [${dbName}] Erro ao criar tabela:`, err.message);
    }
  }

  // ⭐ Migrações: adicionar colunas que podem não existir em bancos antigos
  const alterations = [
  'ALTER TABLE prontuarios ADD COLUMN profissionalId VARCHAR(191)',
  'ALTER TABLE prontuarios ADD COLUMN profissional VARCHAR(255)',
  'ALTER TABLE atendimento_relatorios ADD COLUMN titulo VARCHAR(255)',
  'ALTER TABLE atendimento_relatorios ADD COLUMN cid10 TEXT',
  'ALTER TABLE padroes_relatorios ADD COLUMN titulo VARCHAR(255)',
  'ALTER TABLE padroes_relatorios ADD COLUMN cid10 TEXT',
  // ⭐ Campos de cancelamento de paciente
  'ALTER TABLE pacientes ADD COLUMN motivoCancelamento TEXT',
  'ALTER TABLE pacientes ADD COLUMN canceladoEm VARCHAR(50)',
  'ALTER TABLE pacientes ADD COLUMN cancelamentoUsuario VARCHAR(255)',
  // ⭐ Campo valor na consulta (para registrar valor cobrado)
  'ALTER TABLE consultas ADD COLUMN valor DOUBLE DEFAULT 0',
  // ⭐ Modalidade do atendimento (presencial/online) e link da sala de vídeo
  `ALTER TABLE consultas ADD COLUMN modalidade VARCHAR(20) DEFAULT 'presencial'`,
  'ALTER TABLE consultas ADD COLUMN linkVideo VARCHAR(500)',
  // ⭐ Confirmação/cancelamento pelo link público enviado por SMS
  'ALTER TABLE consultas ADD COLUMN confirmacaoToken VARCHAR(191)',
  'ALTER TABLE consultas ADD COLUMN confirmacaoCanal VARCHAR(30)',
  'ALTER TABLE consultas ADD COLUMN canalCancelamento VARCHAR(30)',
  // ⭐ Campos OAuth Itaú para configuracoes_banco
  'ALTER TABLE configuracoes_banco ADD COLUMN clientId VARCHAR(255)',
  'ALTER TABLE configuracoes_banco ADD COLUMN clientSecret VARCHAR(255)',
  'ALTER TABLE configuracoes_banco ADD COLUMN itauKey VARCHAR(255)',
  'ALTER TABLE configuracoes_banco ADD COLUMN tipoAmbiente INT DEFAULT 2',
  'ALTER TABLE configuracoes_banco ADD COLUMN tokenOAuth TEXT',
  'ALTER TABLE configuracoes_banco ADD COLUMN tokenValidade VARCHAR(50)',
  'ALTER TABLE configuracoes_banco ADD COLUMN tipoJuros INT DEFAULT 5',
  'ALTER TABLE configuracoes_banco ADD COLUMN tipoMulta INT DEFAULT 3',
  'ALTER TABLE configuracoes_banco ADD COLUMN boletoRegistrado TINYINT(1) DEFAULT 0'];


  for (const sql of alterations) {
    try {
      await poolPromise.execute(sql);
    } catch (err) {
      // Ignora erro "Duplicate column name" — coluna já existe
      if (!err.message.includes('Duplicate column')) {
        console.error(`⚠️ [${dbName}] Migração:`, err.message);
      }
    }
  }

  // ⭐ ÍNDICES: clínicas com muitos pacientes (100k+) faziam full table scan
  // em CADA listagem (COUNT por `deletado` + ORDER BY `nome` + buscas por cpf/telefone),
  // gerando consultas de 200–350ms repetidas. Estes índices tornam a listagem instantânea.
  const indexes = [
  'CREATE INDEX idx_pacientes_deletado ON pacientes (deletado)',
  'CREATE INDEX idx_pacientes_nome ON pacientes (nome)',
  'CREATE INDEX idx_pacientes_cpf ON pacientes (cpf)',
  'CREATE INDEX idx_pacientes_telefone ON pacientes (telefone)',
  'CREATE INDEX idx_pacientes_titular ON pacientes (titularId)',
  'CREATE INDEX idx_pacientes_contrato ON pacientes (numeroContrato)'];

  for (const sql of indexes) {
    try {
      await poolPromise.execute(sql);
    } catch (err) {
      // Ignora "Duplicate key name" — índice já existe
      if (!err.message.includes('Duplicate key name')) {
        console.error(`⚠️ [${dbName}] Índice:`, err.message);
      }
    }
  }

  // ⭐ MIGRAÇÃO CRÍTICA: Corrige collation de TODAS as tabelas para evitar
  // "Illegal mix of collations" entre tabelas legadas (utf8mb4_0900_ai_ci)
  // e tabelas novas (utf8mb4_unicode_ci)
  try {
    await fixCollation(poolPromise, dbName);
  } catch (err) {
    console.error(`⚠️ [${dbName}] Erro ao corrigir collation:`, err.message);
  }

  console.log(`✅ Tabelas da clínica ${clinicaId} criadas/verificadas no MySQL (${dbName})`);
}

// ⭐ Converte TODAS as tabelas do banco para utf8mb4_unicode_ci
// Resolve conflito de collation entre tabelas legadas (migradas do SQLite com utf8mb4_0900_ai_ci)
// e tabelas criadas pelo schema atual (utf8mb4_unicode_ci)
// Usa query() em vez de execute() para DDL (prepared statements não funcionam bem com DDL)
async function fixCollation(poolPromise, dbName) {
  try {
    // 1. Converte o DATABASE default collation
    await poolPromise.query(
      `ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    // 2. Lista TODAS as tabelas do banco (sem filtro — converte tudo incondicionalmente)
    const [tables] = await poolPromise.query(`SHOW TABLES`);

    if (!tables || tables.length === 0) return;

    // SHOW TABLES retorna objetos com chave dinâmica (Tables_in_<dbname>)
    const tableKey = Object.keys(tables[0])[0];

    // 3. Verifica se alguma coluna tem collation diferente
    const [badCols] = await poolPromise.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
         AND COLLATION_NAME IS NOT NULL 
         AND COLLATION_NAME != 'utf8mb4_unicode_ci'
       LIMIT 1`,
      [dbName]
    );

    // Também verifica collation no nível de tabela
    const [badTables] = await poolPromise.query(
      `SELECT TABLE_NAME, TABLE_COLLATION 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? 
         AND TABLE_COLLATION IS NOT NULL 
         AND TABLE_COLLATION != 'utf8mb4_unicode_ci'
       LIMIT 1`,
      [dbName]
    );

    if ((!badCols || badCols.length === 0) && (!badTables || badTables.length === 0)) {
      return; // Tudo já está correto
    }

    console.log(`🔧 [${dbName}] Corrigindo collation de ${tables.length} tabelas...`);
    if (badCols && badCols.length > 0) {
      console.log(`   Exemplo: ${badCols[0].TABLE_NAME}.${badCols[0].COLUMN_NAME} = ${badCols[0].COLLATION_NAME}`);
    }

    // 4. Converte CADA tabela (CONVERT TO altera tabela + todas as colunas de texto)
    let converted = 0;
    for (const table of tables) {
      const tableName = table[tableKey];
      try {
        await poolPromise.query(
          `ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        converted++;
      } catch (err) {
        console.warn(`⚠️ [${dbName}] Erro ao converter tabela ${tableName}: ${err.message}`);
      }
    }

    console.log(`✅ [${dbName}] Collation corrigida: ${converted}/${tables.length} tabelas convertidas para utf8mb4_unicode_ci`);
  } catch (err) {
    console.error(`❌ [${dbName}] Erro ao corrigir collation:`, err.message);
  }
}

// ==================== getClinicaDB ====================
// Retorna wrapper compatível com sqlite3 para a clínica

async function getClinicaDBAsync(clinicaId) {
  if (clinicaPools[clinicaId]) {
    return clinicaPools[clinicaId];
  }

  const dbName = getClinicaDbName(clinicaId);

  // Cria o database se não existir
  const initPool = mysql.createPool({
    ...MYSQL_CONFIG,
    database: undefined
  }).promise();

  try {
    await initPool.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    console.error(`❌ Erro ao criar banco da clínica ${clinicaId}:`, err.message);
  } finally {
    await initPool.end();
  }

  // Cria pool para esta clínica
  const pool = mysql.createPool({
    ...MYSQL_CONFIG,
    database: dbName,
    connectionLimit: 10
  });
  const poolPromise = pool.promise();

  // Cria tabelas
  await createClinicaTables(poolPromise, dbName, clinicaId);

  // Cria wrapper compatível
  const wrapper = new MysqlClinicaWrapper(pool, poolPromise, clinicaId, dbName);

  clinicaPools[clinicaId] = wrapper;
  console.log(`✅ Conectado ao banco MySQL da CLÍNICA ${clinicaId}: ${dbName}`);

  return wrapper;
}

// ==================== getClinicaDB SÍNCRONO (compatibilidade) ====================
// As rotas chamam getClinicaDB(clinicaId) de forma síncrona.
// Retorna o wrapper do cache se já existe, ou cria sob demanda.
// Na primeira chamada, inicia a criação assíncrona e retorna um wrapper "lazy".

function getClinicaDB(clinicaId) {
  if (clinicaPools[clinicaId]) {
    return clinicaPools[clinicaId];
  }

  const dbName = getClinicaDbName(clinicaId);

  // Cria pool imediatamente (sem esperar CREATE DATABASE)
  // O MySQL cria o database automaticamente na primeira query se usarmos CREATE DATABASE antes
  const pool = mysql.createPool({
    ...MYSQL_CONFIG,
    database: dbName,
    connectionLimit: 10
  });
  const poolPromise = pool.promise();

  const wrapper = new MysqlClinicaWrapper(pool, poolPromise, clinicaId, dbName);
  clinicaPools[clinicaId] = wrapper;

  // Inicia criação do banco e tabelas em background
  (async () => {
    try {
      // Cria database se não existir
      const initPool = mysql.createPool({
        ...MYSQL_CONFIG,
        database: undefined
      }).promise();

      await initPool.execute(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await initPool.end();

      // Cria tabelas
      await createClinicaTables(poolPromise, dbName, clinicaId);
      console.log(`✅ Banco MySQL da clínica ${clinicaId} pronto: ${dbName}`);
    } catch (err) {
      console.error(`❌ Erro ao inicializar banco da clínica ${clinicaId}:`, err.message);
    }
  })();

  return wrapper;
}

// Helper para obter o nome do banco (compatibilidade com código que usava path)
function getDbPathForClinica(clinicaId) {
  return getClinicaDbName(clinicaId);
}

// ==================== PRÉ-INICIALIZAÇÃO ====================
// Chamado no start-server.js para garantir que os bancos estejam prontos

async function initAllClinicas() {
  const dbGlobal = require('./databaseGlobal');
  try {
    const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();
    console.log(`📋 Pré-inicializando ${clinicas.length} bancos de clínicas...`);
    for (const clinica of clinicas) {
      await getClinicaDBAsync(clinica.id);
    }
    console.log(`✅ Todos os bancos de clínicas inicializados!`);
  } catch (err) {
    console.error('❌ Erro ao pré-inicializar clínicas:', err.message);
  }
}

module.exports = { getClinicaDB, getClinicaDBAsync, getDbPathForClinica, initAllClinicas };