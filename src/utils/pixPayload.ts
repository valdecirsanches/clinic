/**
 * Gerador de payload PIX (BR Code / EMV) — padrão Banco Central.
 *
 * Usado no pagamento da assinatura da clínica. A mesma lógica já existia
 * embutida no BoletoModal (cobrança ao paciente); aqui ela está isolada para
 * poder ser reaproveitada sem duplicar as regras do EMV.
 */

/** Monta um campo no formato ID + tamanho (2 dígitos) + valor */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/** CRC16 CCITT-FALSE, exigido pelo padrão EMV no campo 63 */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1 ^ 0x1021) & 0xffff : crc << 1 & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove acentos e caracteres não aceitos pelo BR Code */
function normalizar(texto: string, tamanhoMaximo: number): string {
  return texto.
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  replace(/[^A-Za-z0-9 .-]/g, '').
  trim().
  slice(0, tamanhoMaximo);
}

export interface DadosPix {
  /** Chave PIX do recebedor (CNPJ, e-mail, telefone ou aleatória) */
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  valor: number;
  /** Identificador da cobrança (aparece no extrato) */
  identificador?: string;
}

/**
 * Gera o código PIX copia e cola. O mesmo texto alimenta o QR Code.
 */
export function gerarPixCopiaECola({
  chave,
  nomeRecebedor,
  cidade,
  valor,
  identificador
}: DadosPix): string {
  const merchant =
  campo('00', 'BR.GOV.BCB.PIX') + campo('01', chave.trim());

  const txid = normalizar(identificador || '***', 25) || '***';

  let payload =
  campo('00', '01') + // formato do payload
  campo('26', merchant) + // conta do recebedor
  campo('52', '0000') + // categoria do comerciante
  campo('53', '986') + // moeda: BRL
  campo('54', valor.toFixed(2)) +
  campo('58', 'BR') +
  campo('59', normalizar(nomeRecebedor, 25)) +
  campo('60', normalizar(cidade, 15)) +
  campo('62', campo('05', txid));

  payload += '6304';
  return payload + crc16(payload);
}