import React from 'react';
import { OdontogramaClinico } from './odontograma/OdontogramaClinico';
import type { OdontogramaDados } from './odontograma/modelo';

// Mantido para quem ainda importa `Odontograma` (ex.: ProntuarioForm):
// agora é o mesmo odontograma do atendimento.
interface OdontogramaProps {
  value: OdontogramaDados;
  onChange: (data: OdontogramaDados) => void;
  disabled?: boolean;
  pacienteDataNascimento?: string;
}
export function Odontograma({ value, onChange, disabled = false, pacienteDataNascimento }: OdontogramaProps) {
  return (
    <OdontogramaClinico
      value={value || {}}
      onChange={onChange}
      readOnly={disabled}
      pacienteDataNascimento={pacienteDataNascimento} />);
}
