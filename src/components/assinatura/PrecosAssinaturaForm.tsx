import React, { useEffect, useState } from 'react';
import { DollarSignIcon, SaveIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useConfiguracoesGlobais } from '../../hooks/useConfiguracoesGlobais';
import { useToast } from '../../hooks/useToast';
import { SERVICOS_ASSINATURA } from '../../types/assinatura';
import type { ServicoAssinaturaId } from '../../types/assinatura';

export interface PrecoServico {
  valorMensal: number;
  valorUnitario: number;
  franquia: number;
}

export type PrecosAssinatura = Record<ServicoAssinaturaId, PrecoServico>;

export const PRECOS_ASSINATURA_PADRAO: PrecosAssinatura = {
  sistema: {
    valorMensal: 0,
    valorUnitario: 0,
    franquia: 0
  },
  memed: {
    valorMensal: 0,
    valorUnitario: 19.9,
    franquia: 0
  },
  whatsapp: {
    valorMensal: 49.9,
    valorUnitario: 0,
    franquia: 0
  },
  sms: {
    valorMensal: 0,
    valorUnitario: 0.18,
    franquia: 0
  },
  armazenamento: {
    valorMensal: 0,
    valorUnitario: 0,
    franquia: 5
  },
  ponto_biometrico: {
    valorMensal: 39.9,
    valorUnitario: 0,
    franquia: 0
  },
  nfse: {
    valorMensal: 0,
    valorUnitario: 0.9,
    franquia: 0
  },
  assistente_voz: {
    valorMensal: 0,
    valorUnitario: 0,
    franquia: 0
  }
};

/**
 * Converte "12,50", "1.234,50" ou "0.18" em número.
 * ⚠️ Antes, todo ponto era tratado como milhar: "0.18" virava 18 — e o valor
 * exibido (String(0.18) = "0.18") era relido como 18 ao salvar de novo.
 */
function paraNumero(texto: string): number {
  const t = texto.trim();
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

export function PrecosAssinaturaForm() {
  const { success, error } = useToast();
  const config = useConfiguracoesGlobais<PrecosAssinatura>(
    'precos_assinatura',
    PRECOS_ASSINATURA_PADRAO
  );
  const [form, setForm] = useState<PrecosAssinatura>(PRECOS_ASSINATURA_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!config.loading) {
      setForm({
        ...PRECOS_ASSINATURA_PADRAO,
        ...config.valor
      });
    }
  }, [config.loading, config.valor]);

  const alterar = (
  servico: ServicoAssinaturaId,
  campo: keyof PrecoServico,
  valor: string) =>
  {
    setForm((atual) => ({
      ...atual,
      [servico]: {
        ...atual[servico],
        [campo]: paraNumero(valor)
      }
    }));
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await config.salvar(form);
      success(
        'Preços salvos',
        'Os novos valores passam a valer nas próximas faturas em formação.'
      );
    } catch {
      error('Erro', 'Não foi possível salvar os preços.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card
      title="Preços dos serviços da assinatura"
      action={<DollarSignIcon className="w-5 h-5 text-gray-400" />}>
      
      <p className="text-sm text-gray-600 mb-4">
        Valores cobrados das clínicas por serviço. A{' '}
        <strong>taxa de uso do sistema</strong> não aparece aqui: ela vem do{' '}
        <strong>plano</strong> escolhido pela clínica em Planos Sistema.
      </p>

      <div className="space-y-4">
        {SERVICOS_ASSINATURA.filter((s) => s.id !== 'sistema').map((meta) => {
          const preco = form[meta.id] || PRECOS_ASSINATURA_PADRAO[meta.id];
          return (
            <fieldset
              key={meta.id}
              className="border border-gray-200 rounded-lg p-4">
              
              <legend className="text-sm font-semibold text-gray-900 px-1">
                {meta.nome}
              </legend>
              <p className="text-xs text-gray-500 mb-3">{meta.descricao}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {meta.modelo === 'mensal' ?
                <Input
                  label="Valor mensal (R$)"
                  value={String(preco.valorMensal)}
                  onChange={(e) =>
                  alterar(meta.id, 'valorMensal', e.target.value)
                  }
                  inputMode="decimal" /> :


                <>
                    <Input
                    label={`Valor por ${meta.unidade} (R$)`}
                    value={String(preco.valorUnitario)}
                    onChange={(e) =>
                    alterar(meta.id, 'valorUnitario', e.target.value)
                    }
                    inputMode="decimal" />
                  
                    <Input
                    label={
                    meta.id === 'armazenamento' ?
                    'Franquia isenta (GB)' :
                    'Franquia isenta'
                    }
                    value={String(preco.franquia)}
                    onChange={(e) =>
                    alterar(meta.id, 'franquia', e.target.value)
                    }
                    inputMode="numeric"
                    helperText={
                    meta.id === 'armazenamento' ?
                    'GB grátis; cobra-se o excedente medido no mês' :
                    'Quantidade grátis por mês'
                    } />
                  
                  </>
                }
              </div>
            </fieldset>);

        })}

        <Button onClick={salvar} disabled={salvando || config.loading}>
          <SaveIcon className="w-4 h-4 mr-1 inline" />
          {salvando ? 'Salvando...' : 'Salvar preços'}
        </Button>
      </div>
    </Card>);

}