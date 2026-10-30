// Tipos para integração com Memed

export interface MemedConfig {
  /** Só chega ao navegador do super admin (tela de configuração). */
  apiKey?: string;
  /** Só chega ao navegador do super admin (tela de configuração). */
  secretKey?: string;
  ambiente: 'producao' | 'sandbox';
  ativo: boolean;
  /** Informado pelo servidor: as chaves estão preenchidas. */
  configurada?: boolean;
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