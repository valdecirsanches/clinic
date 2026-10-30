import React, { useEffect, useState } from 'react';
import { LockIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  EVENTO_LIMITE_PLANO,
  instalarInterceptadorLimitePlano,
  type DetalheLimitePlano } from
'../../utils/limitePlano';

interface LimitePlanoAvisoProps {
  /** Administrador pode trocar de plano e pagar; os demais são orientados */
  podeGerenciar: boolean;
  onVerPlanos: () => void;
}

/**
 * Aviso único do sistema quando uma ação esbarra no limite do plano
 * (ex.: 31º paciente no plano gratuito). Mostra o motivo exato devolvido pelo
 * servidor e leva direto à escolha de plano e ao pagamento.
 */
export function LimitePlanoAviso({ podeGerenciar, onVerPlanos }: LimitePlanoAvisoProps) {
  const [aviso, setAviso] = useState<DetalheLimitePlano | null>(null);

  useEffect(() => {
    instalarInterceptadorLimitePlano();
    const ouvir = (evento: Event) => {
      setAviso((evento as CustomEvent<DetalheLimitePlano>).detail);
    };
    window.addEventListener(EVENTO_LIMITE_PLANO, ouvir);
    return () => window.removeEventListener(EVENTO_LIMITE_PLANO, ouvir);
  }, []);

  const fechar = () => setAviso(null);

  return (
    <Modal
      isOpen={Boolean(aviso)}
      onClose={fechar}
      title="Limite do plano atingido"
      footer={
      podeGerenciar ?
      <>
            <Button variant="secondary" onClick={fechar}>
              Agora não
            </Button>
            <Button
          onClick={() => {
            fechar();
            onVerPlanos();
          }}>
          
              Escolher plano e pagar
            </Button>
          </> :

      <Button onClick={fechar}>Entendi</Button>

      }>
      
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <LockIcon className="w-5 h-5 text-amber-700" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-gray-900">{aviso?.mensagem}</p>
          {aviso?.plano &&
          <p className="text-sm text-gray-500">
              Plano atual: <strong className="text-gray-700">{aviso.plano.nome}</strong>
            </p>
          }
          <p className="text-sm text-gray-600">
            {podeGerenciar ?
            'Nada foi perdido: o que você já cadastrou continua disponível. Ao mudar de plano o limite é liberado na hora.' :
            'Peça ao administrador da clínica para mudar o plano em Administração → Financeiro → Minha Assinatura.'}
          </p>
        </div>
      </div>
    </Modal>);

}