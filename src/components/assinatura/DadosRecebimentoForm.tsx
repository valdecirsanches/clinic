import React, { useEffect, useState } from 'react';
import { QrCodeIcon, SaveIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useConfiguracoesGlobais } from '../../hooks/useConfiguracoesGlobais';
import { useToast } from '../../hooks/useToast';

/**
 * Dados de RECEBIMENTO da plataforma (para onde as clínicas pagam a assinatura).
 * Vivem nas Configurações Globais, na chave `dados_recebimento`.
 */
export interface DadosRecebimento {
  chavePix: string;
  tipoChavePix: 'cnpj' | 'cpf' | 'email' | 'telefone' | 'aleatoria';
  nomeRecebedor: string;
  cidade: string;
  cnpj: string;
  banco: string;
  agencia: string;
  conta: string;
  titular: string;
}

export const DADOS_RECEBIMENTO_PADRAO: DadosRecebimento = {
  chavePix: '',
  tipoChavePix: 'cnpj',
  nomeRecebedor: '',
  cidade: '',
  cnpj: '',
  banco: '',
  agencia: '',
  conta: '',
  titular: ''
};

export function DadosRecebimentoForm() {
  const { success, error } = useToast();
  const config = useConfiguracoesGlobais<DadosRecebimento>(
    'dados_recebimento',
    DADOS_RECEBIMENTO_PADRAO
  );
  const [form, setForm] = useState<DadosRecebimento>(DADOS_RECEBIMENTO_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!config.loading) {
      setForm({
        ...DADOS_RECEBIMENTO_PADRAO,
        ...config.valor
      });
    }
  }, [config.loading, config.valor]);

  const alterar = (campo: keyof DadosRecebimento, valor: string) => {
    setForm((atual) => ({
      ...atual,
      [campo]: valor
    }));
  };

  const salvar = async () => {
    if (!form.chavePix.trim() && !form.conta.trim()) {
      error(
        'Dados incompletos',
        'Informe ao menos a chave PIX ou os dados bancários para transferência.'
      );
      return;
    }
    if (form.chavePix.trim() && !form.nomeRecebedor.trim()) {
      error(
        'Dados incompletos',
        'O nome do recebedor é obrigatório para gerar o QR Code do PIX.'
      );
      return;
    }
    setSalvando(true);
    try {
      await config.salvar(form);
      success(
        'Dados salvos',
        'As clínicas passam a ver estes dados ao pagar a assinatura.'
      );
    } catch {
      error('Erro', 'Não foi possível salvar os dados de recebimento.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card
      title="Recebimento das assinaturas (PIX e transferência)"
      action={<QrCodeIcon className="w-5 h-5 text-gray-400" />}>
      
      <p className="text-sm text-gray-600 mb-4">
        Estes dados aparecem para a clínica na tela <strong>Minha Assinatura</strong>{' '}
        e alimentam o QR Code do PIX. Sem a chave PIX, o pagamento por PIX fica
        indisponível.
      </p>

      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">PIX</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Tipo da chave"
              value={form.tipoChavePix}
              onChange={(e) => alterar('tipoChavePix', e.target.value)}
              options={[
              {
                value: 'cnpj',
                label: 'CNPJ'
              },
              {
                value: 'cpf',
                label: 'CPF'
              },
              {
                value: 'email',
                label: 'E-mail'
              },
              {
                value: 'telefone',
                label: 'Telefone'
              },
              {
                value: 'aleatoria',
                label: 'Aleatória'
              }]
              } />
            
            <div className="sm:col-span-2">
              <Input
                label="Chave PIX"
                value={form.chavePix}
                onChange={(e) => alterar('chavePix', e.target.value)}
                placeholder="Ex.: 12345678000199" />
              
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nome do recebedor"
              value={form.nomeRecebedor}
              onChange={(e) => alterar('nomeRecebedor', e.target.value)}
              placeholder="Como aparece no comprovante" />
            
            <Input
              label="Cidade do recebedor"
              value={form.cidade}
              onChange={(e) => alterar('cidade', e.target.value)}
              placeholder="Ex.: Goiania" />
            
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">
            Transferência bancária
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Banco"
              value={form.banco}
              onChange={(e) => alterar('banco', e.target.value)}
              placeholder="Ex.: 341 - Itaú" />
            
            <Input
              label="Agência"
              value={form.agencia}
              onChange={(e) => alterar('agencia', e.target.value)} />
            
            <Input
              label="Conta"
              value={form.conta}
              onChange={(e) => alterar('conta', e.target.value)} />
            
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Titular"
              value={form.titular}
              onChange={(e) => alterar('titular', e.target.value)} />
            
            <Input
              label="CNPJ do titular"
              value={form.cnpj}
              onChange={(e) => alterar('cnpj', e.target.value)} />
            
          </div>
        </fieldset>

        <Button onClick={salvar} disabled={salvando || config.loading}>
          <SaveIcon className="w-4 h-4 mr-1 inline" />
          {salvando ? 'Salvando...' : 'Salvar dados de recebimento'}
        </Button>
      </div>
    </Card>);

}