import React, { useState, useEffect, Component } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { PasswordInput } from './ui/PasswordInput';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { FileTextIcon, KeyIcon, ShieldCheckIcon, CheckCircle2Icon, AlertCircleIcon, Loader2Icon } from 'lucide-react';
import { MemedConfig } from '../types/memed';
interface MemedConfigProps {
  config: MemedConfig;
  onSave: (config: MemedConfig) => void;
}
export function MemedConfigComponent({
  config,
  onSave
}: MemedConfigProps) {
  const [formData, setFormData] = useState(config);
  const [isSaving, setIsSaving] = useState(false);
  // ⭐ FIX: o estado era inicializado UMA vez. Quando a configuração chegava do
  // servidor depois da montagem, o formulário continuava com os valores antigos
  // (ou vazios) e o "Salvar" regravava esse conteúdo em cima do que estava
  // guardado — era a perda de configuração relatada.
  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);
  const [errors, setErrors] = useState<{
    apiKey?: string;
    secretKey?: string;
  }>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const validateFields = (): boolean => {
    const newErrors: {
      apiKey?: string;
      secretKey?: string;
    } = {};
    if (!formData.apiKey || formData.apiKey.trim() === '') {
      newErrors.apiKey = 'API Key é obrigatória';
    }
    if (!formData.secretKey || formData.secretKey.trim() === '') {
      newErrors.secretKey = 'Secret Key é obrigatória';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSave = async () => {
    if (!validateFields()) {
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      // ⭐ Respeita a caixa "Ativar integração": antes era forçado `true`, então
      //    desmarcar não tinha efeito — e o serviço seguia sendo cobrado.
      const configToSave = {
        ...formData,
        ativo: Boolean(formData.ativo)
      };
      console.log('💾 Salvando configuração Memed:', configToSave);
      await onSave(configToSave);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setIsSaving(false);
    }
  };
  const isConfigured = formData.apiKey && formData.secretKey;
  return <Card>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <FileTextIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Integração Memed
            </h3>
            <p className="text-sm text-gray-500">
              Prescrições médicas digitais
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {isConfigured ? <>
              <CheckCircle2Icon className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-green-700">
                Configurado
              </span>
            </> : <>
              <AlertCircleIcon className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium text-amber-700">
                Não configurado
              </span>
            </>}
        </div>
      </div>

      <div className="space-y-4">
        {/* Info Box */}
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900 mb-1">
                📋 Como obter suas credenciais Memed
              </p>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Acesse o painel do Memed (memed.com.br)</li>
                <li>Vá em Configurações → Integrações → API</li>
                <li>Copie sua API Key e Secret Key</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {saveSuccess && <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2Icon className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-800">
              Configurações salvas com sucesso!
            </p>
          </div>}

        <Select label="Ambiente" value={formData.ambiente} onChange={(e) => setFormData({
        ...formData,
        ambiente: e.target.value as 'producao' | 'sandbox'
      })} options={[{
        value: 'sandbox',
        label: '🧪 Sandbox (Testes)'
      }, {
        value: 'producao',
        label: '🚀 Produção'
      }]} />
        

        <div>
          <PasswordInput label="API Key" value={formData.apiKey} onChange={(e) => {
          setFormData({
            ...formData,
            apiKey: e.target.value
          });
          if (errors.apiKey) {
            setErrors({
              ...errors,
              apiKey: undefined
            });
          }
        }} placeholder="Sua API Key do Memed" />
          
          {errors.apiKey && <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircleIcon className="w-4 h-4" />
              {errors.apiKey}
            </p>}
        </div>

        <div>
          <PasswordInput label="Secret Key" value={formData.secretKey} onChange={(e) => {
          setFormData({
            ...formData,
            secretKey: e.target.value
          });
          if (errors.secretKey) {
            setErrors({
              ...errors,
              secretKey: undefined
            });
          }
        }} placeholder="Sua Secret Key do Memed" />
          
          {errors.secretKey && <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircleIcon className="w-4 h-4" />
              {errors.secretKey}
            </p>}
        </div>

        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <input type="checkbox" id="memedAtivo" checked={formData.ativo} onChange={(e) => setFormData({
          ...formData,
          ativo: e.target.checked
        })} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
          
          <label htmlFor="memedAtivo" className="text-sm text-gray-700 font-medium">
            
            Ativar integração com Memed
          </label>
        </div>

        <div className="pt-4">
          <Button onClick={handleSave} className="w-full" disabled={isSaving}>
            {isSaving ? <>
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </> : <>
                <FileTextIcon className="w-4 h-4 mr-2" />
                Salvar Integração Memed
              </>}
          </Button>
        </div>
      </div>
    </Card>;
}