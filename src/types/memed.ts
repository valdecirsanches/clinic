// Tipos para integração com Memed

export interface MemedConfig {
  apiKey: string;
  secretKey: string;
  ambiente: 'producao' | 'sandbox';
  ativo: boolean;
}
export interface MemedPrescricao {
  id: string;
  pacienteId: string;
  prontuarioId: string;
  profissionalNome: string;
  profissionalCRM: string;
  data: string;
  medicamentos: MemedMedicamento[];
  pdfUrl?: string;
  status: 'rascunho' | 'assinada' | 'enviada';
}
export interface MemedMedicamento {
  nome: string;
  principioAtivo: string;
  dosagem: string;
  posologia: string;
  quantidade: number;
  viaAdministracao: string;
}
export interface MemedPaciente {
  nome: string;
  cpf?: string;
  dataNascimento: string;
  telefone?: string;
  email?: string;
  sexo?: 'M' | 'F';
}
export interface MemedProfissional {
  nome: string;
  crm: string;
  uf: string;
  especialidade?: string;
  titulo?: string;
  token: string; // Token JWT do profissional gerado pelo Memed
}