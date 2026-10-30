import React, { useState, Component } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MemedConfigComponent } from '../components/MemedConfig';
import { MigrationButtonCrmUf } from '../components/MigrationButtonCrmUf';
import { DadosRecebimentoForm } from '../components/assinatura/DadosRecebimentoForm';
import { PrecosAssinaturaForm } from '../components/assinatura/PrecosAssinaturaForm';
import { MemedConfig } from '../types/memed';
import { useToast } from '../hooks/useToast';
import { useConfiguracoesGlobais } from '../hooks/useConfiguracoesGlobais';
import { EyeIcon, EyeOffIcon, CreditCardIcon, SaveIcon } from 'lucide-react';
// Interface para configurações de permissões
interface PermissoesConfig {
  adminPodeVerPlanos: boolean;
}
export function ConfiguracoesGlobaisPage() {
  const { success, error } = useToast();
  // Memed config GLOBAL do banco de dados
  const memedConfigGlobal = useConfiguracoesGlobais<MemedConfig>(
    'memed_config',
    {
      apiKey: '',
      secretKey: '',
      ambiente: 'sandbox',
      ativo: false
    }
  );
  // Configurações de permissões
  const permissoesConfig = useConfiguracoesGlobais<PermissoesConfig>(
    'permissoes_config',
    {
      adminPodeVerPlanos: false
    }
  );
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false);
  // ⭐ Taxa mensal do serviço de Ponto Facial (apenas super_admin visualiza)
  const taxaPontoFacial = useConfiguracoesGlobais<number>(
    'taxa_ponto_facial',
    49.9
  );
  const [editandoTaxa, setEditandoTaxa] = useState(false);
  const [taxaTemp, setTaxaTemp] = useState('49,90');
  const handleMemedSave = async (newMemedConfig: MemedConfig) => {
    try {
      await memedConfigGlobal.salvar(newMemedConfig);
      // Atualiza cache do localStorage para o ProntuarioForm
      localStorage.setItem('memed_config', JSON.stringify(newMemedConfig));
      console.log(
        '💾 [ConfiguracoesGlobaisPage] Configuração Memed GLOBAL salva:',
        newMemedConfig
      );
      console.log('💾 [ConfiguracoesGlobaisPage] Cache localStorage atualizado');
      success(
        'Configurações Memed Salvas',
        'A integração com Memed foi configurada globalmente para todas as clínicas.'
      );
    } catch (err: any) {
      console.error('❌ [ConfiguracoesGlobaisPage] Erro ao salvar Memed:', err);
    }
  };
  const handleToggleAdminPlanos = async () => {
    setSalvandoPermissoes(true);
    try {
      const novoValor = !permissoesConfig.valor.adminPodeVerPlanos;
      await permissoesConfig.salvar({
        ...permissoesConfig.valor,
        adminPodeVerPlanos: novoValor
      });
      success(
        'Permissão Atualizada',
        novoValor ?
        'Administradores agora podem visualizar a página de Planos.' :
        'Administradores não podem mais ver a página de Planos.'
      );
    } catch (err: any) {
      console.error('❌ Erro ao salvar permissões:', err);
      error('Erro', 'Não foi possível salvar as permissões.');
    } finally {
      setSalvandoPermissoes(false);
    }
  };
  const handleSalvarTaxa = async () => {
    const valor = parseFloat(taxaTemp.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valor) || valor < 0) {
      error('Valor Inválido', 'Digite um valor numérico válido para a taxa.');
      return;
    }
    try {
      await taxaPontoFacial.salvar(valor);
      success(
        'Taxa Atualizada',
        `A taxa mensal do Ponto Facial agora é R$ ${valor.toFixed(2).replace('.', ',')}.`
      );
      setEditandoTaxa(false);
    } catch (err: any) {
      console.error('❌ Erro ao salvar taxa:', err);
      error('Erro', 'Não foi possível salvar a taxa.');
    }
  };
  if (
  memedConfigGlobal.loading ||
  permissoesConfig.loading ||
  taxaPontoFacial.loading)
  {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Configurações Globais
          </h1>
          <p className="text-gray-500 mt-1">
            Configure integrações globais do sistema
          </p>
        </div>
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-600">Carregando configurações...</p>
          </div>
        </Card>
      </div>);

  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Configurações Globais
        </h1>
        <p className="text-gray-500 mt-1">
          Configure integrações globais do sistema (disponível apenas para super
          admin)
        </p>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 font-bold text-sm">ℹ️</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              Configurações Globais
            </h3>
            <p className="text-xs text-blue-700">
              Estas configurações são compartilhadas por{' '}
              <strong>todas as clínicas</strong> do sistema. Apenas super
              administradores podem modificá-las.
            </p>
          </div>
        </div>
      </div>

      {/* Preços cobrados das clínicas por serviço */}
      <PrecosAssinaturaForm />

      {/* Dados de recebimento das assinaturas (PIX / transferência) */}
      <DadosRecebimentoForm />

      {/* Configurações de Permissões */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <CreditCardIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Permissões de Acesso
            </h3>
            <p className="text-sm text-gray-500">
              Controle o que os administradores podem ver
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Permissão: Admin pode ver Planos */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              {permissoesConfig.valor.adminPodeVerPlanos ?
              <EyeIcon className="w-5 h-5 text-green-600" /> :

              <EyeOffIcon className="w-5 h-5 text-gray-400" />
              }
              <div>
                <h4 className="font-medium text-gray-900">
                  Administradores podem ver Planos
                </h4>
                <p className="text-sm text-gray-500">
                  {permissoesConfig.valor.adminPodeVerPlanos ?
                  'Administradores podem visualizar a página de Planos (somente leitura)' :
                  'Apenas Super Admins podem acessar a página de Planos'}
                </p>
              </div>
            </div>
            <Button
              variant={
              permissoesConfig.valor.adminPodeVerPlanos ?
              'primary' :
              'secondary'
              }
              onClick={handleToggleAdminPlanos}
              disabled={salvandoPermissoes}
              className={
              permissoesConfig.valor.adminPodeVerPlanos ?
              'bg-green-600 hover:bg-green-700' :
              ''
              }>
              
              {salvandoPermissoes ?
              'Salvando...' :
              permissoesConfig.valor.adminPodeVerPlanos ?
              <>
                  <EyeIcon className="w-4 h-4 mr-2" />
                  Habilitado
                </> :

              <>
                  <EyeOffIcon className="w-4 h-4 mr-2" />
                  Desabilitado
                </>
              }
            </Button>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Nota:</strong> Mesmo quando habilitado, apenas o{' '}
              <strong>Super Admin</strong> pode criar, editar ou excluir planos.
              Os administradores terão acesso apenas para visualização e seleção
              de planos para suas clínicas.
            </p>
          </div>
        </div>
      </Card>

      {/* ⭐ Taxa do Serviço de Ponto Facial (apenas super admin) */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <CreditCardIcon className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Taxa do Serviço de Ponto Facial
            </h3>
            <p className="text-sm text-gray-500">
              Valor mensal cobrado de cada clínica que ativar o reconhecimento
              facial
            </p>
          </div>
        </div>

        <div className="p-4 bg-teal-50 rounded-lg border border-teal-200">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-gray-700 mb-1">
                Taxa mensal por clínica
              </p>
              {editandoTaxa ?
              <div className="flex items-center gap-2">
                  <span className="text-lg font-medium text-gray-700">R$</span>
                  <input
                  type="text"
                  value={taxaTemp}
                  onChange={(e) => setTaxaTemp(e.target.value)}
                  className="w-28 px-2 py-1 border border-gray-300 rounded text-lg font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  placeholder="49,90" />
                
                </div> :

              <p className="text-2xl font-bold text-teal-700">
                  R$ {taxaPontoFacial.valor.toFixed(2).replace('.', ',')}
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    /mês
                  </span>
                </p>
              }
            </div>
            <div className="flex gap-2">
              {editandoTaxa ?
              <>
                  <Button
                  variant="ghost"
                  onClick={() => {
                    setEditandoTaxa(false);
                    setTaxaTemp(
                      taxaPontoFacial.valor.toFixed(2).replace('.', ',')
                    );
                  }}>
                  
                    Cancelar
                  </Button>
                  <Button onClick={handleSalvarTaxa}>
                    <SaveIcon className="w-4 h-4 mr-2" />
                    Salvar
                  </Button>
                </> :

              <Button
                variant="secondary"
                onClick={() => {
                  setTaxaTemp(
                    taxaPontoFacial.valor.toFixed(2).replace('.', ',')
                  );
                  setEditandoTaxa(true);
                }}>
                
                  Editar Taxa
                </Button>
              }
            </div>
          </div>
          <p className="text-xs text-teal-700 mt-3">
            💡 Esta taxa é informada ao administrador no momento em que ele
            ativa o serviço de ponto facial na clínica dele. Apenas o super
            admin vê e edita este valor.
          </p>
        </div>
      </Card>

      {/* Configuração Memed */}
      <MemedConfigComponent
        config={memedConfigGlobal.valor}
        onSave={handleMemedSave} />
      

      {/* Migração CRM/UF */}
      <MigrationButtonCrmUf />
    </div>);

}