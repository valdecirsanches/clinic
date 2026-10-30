export interface PacienteAssistente {
  id: string;
  nome: string;
  dataNascimento: string | null;
  telefone: string;
}

export interface OpcaoData {
  data: string;
  rotulo: string;
  slots: string[];
}

export interface GrupoHorarios extends OpcaoData {
  profissionalId: string;
  profissional: string;
}

export interface ConsultaAssistente {
  id: string;
  data: string;
  rotulo: string;
  horario: string;
  status: string;
  profissional: string;
  profissionalId: string;
  paciente?: string;
}

export interface ItemAgendaAssistente {
  id: string;
  horario: string;
  status: string;
  paciente: string;
  profissional: string;
  profissionalId: string;
}

export type ResultadoAssistente =
{tipo: 'conversa';fala: string;dados: null;} |
{
  tipo: 'proposta_marcacao';
  fala: string;
  dados: {
    pacientes: PacienteAssistente[];
    profissional: {id: string;nome: string;};
    opcoes: OpcaoData[];
    selecionado: {data: string;horario: string;} | null;
    aviso: string;
  };
} |
{tipo: 'horarios';fala: string;dados: {grupos: GrupoHorarios[];};} |
{
  tipo: 'agenda';
  fala: string;
  dados: {data: string;rotulo: string;profissional: string | null;itens: ItemAgendaAssistente[];};
} |
{
  tipo: 'consultas_paciente';
  fala: string;
  dados: {pacientes: PacienteComConsultas[];};
} |
{tipo: 'proposta_cancelamento';fala: string;dados: {consultas: ConsultaAssistente[];motivo: string;};} |
{tipo: 'navegar';fala: string;dados: {data: string;profissionalId: string | null;};} |
{tipo: 'prontuario';fala: string;dados: DitadoProntuario;} |
{
  tipo: 'proposta_remarcacao';
  fala: string;
  dados: {
    pacientes: PacienteAssistente[];
    profissional: {id: string;nome: string;};
    opcoes: OpcaoData[];
    selecionado: {data: string;horario: string;} | null;
    aviso: string;
    consulta: ConsultaAssistente;
  };
} |
{
  tipo: 'pacientes';
  fala: string;
  dados: {pacientes: PacienteComConsultas[];abrir: 'cadastro' | null;};
} |
{tipo: 'abrir_cadastro';fala: string;dados: {pacienteId: string | null;nome: string;};} |
{tipo: 'abrir_prontuario';fala: string;dados: {pacienteId: string;nome: string;};} |
{tipo: 'navegar_tela';fala: string;dados: {tela: string;rotulo: string;};} |
{
  tipo: 'resumo_dia';
  fala: string;
  dados: {
    data: string;
    rotulo: string;
    total: number;
    porStatus: {status: string;quantidade: number;}[];
    porProfissional: {profissionalId: string;profissional: string;total: number;proxima: {horario: string;paciente: string;} | null;}[];
  };
};

export type PacienteComConsultas = PacienteAssistente & {consultas: ConsultaAssistente[];};

export interface DitadoProntuario {
  acao: 'preencher' | 'abrir_etapa' | 'ajuda';
  preenchimentos: {etapa: 'anamnese' | 'exame_fisico' | 'diagnostico' | 'evolucao';valores: Record<string, string>;}[];
  modo: 'acrescentar' | 'substituir';
  etapa: string | null;
  resposta: string;
}

/** O que o ditado efetivamente escreveu (ou por que não escreveu). */
export interface ResumoDitado {
  preenchidos: {etapa: string;campos: string[];}[];
  falhas: string[];
}

export interface MensagemAssistente {
  id: string;
  autor: 'usuario' | 'assistente';
  texto: string;
  resultado?: ResultadoAssistente;
  erro?: boolean;
  concluida?: boolean;
  ditado?: ResumoDitado;
}

export type EtapaAssistente = 'ouvindo' | 'transcrevendo' | 'pensando' | 'gravando_consulta' | 'preenchendo' | null;