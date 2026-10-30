import React, { useEffect, useState, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ToastContainer';
import { Button } from './ui/Button';
import { Clinica } from '../types';
import {
  Loader2,
  CheckCircleIcon,
  MapPinIcon,
  ImageIcon,
  Trash2Icon,
  UploadIcon } from
'lucide-react';
import { API_BASE_URL } from '../config/api';
interface ClinicaFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (clinica: any) => void;
  clinica?: Clinica;
  operadoraId?: string;
}
export function ClinicaForm({
  isOpen,
  onClose,
  onSave,
  clinica,
  operadoraId
}: ClinicaFormProps) {
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    endereco: '',
    telefone: '',
    email: '',
    ativa: true,
    logoUrl: ''
  });
  // Estado para busca de CEP
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepEncontrado, setCepEncontrado] = useState(false);
  const [erroCep, setErroCep] = useState('');
  // Estado para upload de logo
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, removeToast, error: showError } = useToast();
  // Atualiza o formulário quando a clínica muda
  useEffect(() => {
    if (clinica) {
      setFormData({
        nome: clinica.nome || '',
        cnpj: clinica.cnpj || '',
        cep: clinica.cep || '',
        logradouro: clinica.logradouro || '',
        numero: clinica.numero || '',
        complemento: clinica.complemento || '',
        bairro: clinica.bairro || '',
        cidade: clinica.cidade || '',
        uf: clinica.uf || '',
        endereco: clinica.endereco || '',
        telefone: clinica.telefone || '',
        email: clinica.email || '',
        ativa: clinica.ativa ?? true,
        logoUrl: clinica.logoUrl || ''
      });
      setLogoPreview(clinica.logoUrl || null);
    } else {
      setFormData({
        nome: '',
        cnpj: '',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
        endereco: '',
        telefone: '',
        email: '',
        ativa: true,
        logoUrl: ''
      });
      setLogoPreview(null);
    }
    setCepEncontrado(false);
    setErroCep('');
  }, [clinica, isOpen]);
  // ⭐ BUSCA CEP NA API VIACEP
  const buscarCep = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setCepEncontrado(false);
      setErroCep('');
      return;
    }
    setBuscandoCep(true);
    setCepEncontrado(false);
    setErroCep('');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      if (data.erro) {
        setErroCep('CEP não encontrado');
        setCepEncontrado(false);
      } else {
        setFormData((prev) => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          uf: data.uf || prev.uf,
          complemento: data.complemento || prev.complemento
        }));
        setCepEncontrado(true);
        setErroCep('');
        // Foca no campo número
        setTimeout(() => {
          const campoNumero = document.getElementById('campo-numero-clinica');
          if (campoNumero) campoNumero.focus();
        }, 100);
      }
    } catch (err) {
      setErroCep('Erro ao buscar CEP');
      setCepEncontrado(false);
    } finally {
      setBuscandoCep(false);
    }
  };
  // Formata CEP
  const formatarCep = (valor: string) => {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length <= 5) return numeros;
    return `${numeros.slice(0, 5)}-${numeros.slice(5, 8)}`;
  };
  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorFormatado = formatarCep(e.target.value);
    setFormData({
      ...formData,
      cep: valorFormatado
    });
    const cepLimpo = valorFormatado.replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      buscarCep(cepLimpo);
    } else {
      setCepEncontrado(false);
      setErroCep('');
    }
  };
  // ⭐ UPLOAD DE LOGOTIPO
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validações
    if (!file.type.startsWith('image/')) {
      showError('Erro', 'Por favor, selecione uma imagem válida.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Erro', 'A imagem deve ter no máximo 2MB.');
      return;
    }
    setUploadingLogo(true);
    try {
      // Converte para base64 para preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setFormData((prev) => ({
          ...prev,
          logoUrl: base64
        }));
        setUploadingLogo(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro ao processar imagem:', err);
      setUploadingLogo(false);
    }
  };
  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setFormData((prev) => ({
      ...prev,
      logoUrl: ''
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Monta endereço completo para compatibilidade
    const enderecoCompleto = [
    formData.logradouro,
    formData.numero && `nº ${formData.numero}`,
    formData.complemento,
    formData.bairro,
    formData.cidade,
    formData.uf].

    filter(Boolean).
    join(', ');
    onSave({
      ...formData,
      endereco: enderecoCompleto || formData.endereco,
      operadoraId: clinica?.operadoraId || operadoraId
    });
    setFormData({
      nome: '',
      cnpj: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      endereco: '',
      telefone: '',
      email: '',
      ativa: true,
      logoUrl: ''
    });
    setLogoPreview(null);
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={clinica ? 'Editar Clínica' : 'Nova Clínica'}
      size="large"
      footer={
      <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            {clinica ? 'Salvar Alterações' : 'Cadastrar'}
          </Button>
        </>
      }>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ⭐ LOGOTIPO DA CLÍNICA */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Logotipo da Clínica
          </label>
          <p className="text-xs text-gray-500 mb-3">
            O logotipo será usado em documentos, relatórios e impressões.
            Recomendado: PNG ou JPG, máximo 2MB.
          </p>

          <div className="flex items-start gap-4">
            {/* Preview do logo */}
            <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white overflow-hidden">
              {logoPreview ?
              <img
                src={
                logoPreview.startsWith('data:') ?
                logoPreview :
                `${API_BASE_URL}${logoPreview}`
                }
                alt="Logo da clínica"
                className="w-full h-full object-contain" /> :


              <div className="text-center text-gray-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                  <span className="text-xs">Sem logo</span>
                </div>
              }
            </div>

            {/* Botões de ação */}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
                id="logo-upload" />
              

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}>
                
                {uploadingLogo ?
                <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </> :

                <>
                    <UploadIcon className="w-4 h-4 mr-2" />
                    {logoPreview ? 'Trocar Logo' : 'Enviar Logo'}
                  </>
                }
              </Button>

              {logoPreview &&
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveLogo}
                className="text-red-600 hover:bg-red-50">
                
                  <Trash2Icon className="w-4 h-4 mr-2" />
                  Remover
                </Button>
              }
            </div>
          </div>
        </div>

        <Input
          label="Nome da Clínica"
          value={formData.nome}
          onChange={(e) =>
          setFormData({
            ...formData,
            nome: e.target.value
          })
          }
          placeholder="Nome completo da clínica"
          required />
        

        <Input
          label="CNPJ"
          value={formData.cnpj}
          onChange={(e) =>
          setFormData({
            ...formData,
            cnpj: e.target.value
          })
          }
          placeholder="00.000.000/0000-00"
          required />
        

        {/* CEP com busca automática */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="w-40">
              <Input
                label="CEP"
                value={formData.cep}
                onChange={handleCepChange}
                placeholder="00000-000"
                maxLength={9} />
              
            </div>
            {buscandoCep &&
            <div className="flex items-end pb-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              </div>
            }
            {cepEncontrado && !buscandoCep &&
            <div className="flex items-end pb-2">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
            }
          </div>
          {erroCep && <p className="text-sm text-red-600 mt-1">{erroCep}</p>}
          {cepEncontrado &&
          <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
              <MapPinIcon className="w-4 h-4" />
              Endereço encontrado!
            </p>
          }
        </div>

        <Input
          label="Logradouro"
          value={formData.logradouro}
          onChange={(e) =>
          setFormData({
            ...formData,
            logradouro: e.target.value
          })
          }
          placeholder="Rua, Avenida, etc" />
        

        <div className="grid grid-cols-3 gap-4">
          <Input
            id="campo-numero-clinica"
            label="Número"
            value={formData.numero}
            onChange={(e) =>
            setFormData({
              ...formData,
              numero: e.target.value
            })
            }
            placeholder="Nº" />
          

          <div className="col-span-2">
            <Input
              label="Complemento"
              value={formData.complemento}
              onChange={(e) =>
              setFormData({
                ...formData,
                complemento: e.target.value
              })
              }
              placeholder="Sala, Andar, etc" />
            
          </div>
        </div>

        <Input
          label="Bairro"
          value={formData.bairro}
          onChange={(e) =>
          setFormData({
            ...formData,
            bairro: e.target.value
          })
          }
          placeholder="Bairro" />
        

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Input
              label="Cidade"
              value={formData.cidade}
              onChange={(e) =>
              setFormData({
                ...formData,
                cidade: e.target.value
              })
              }
              placeholder="Cidade" />
            
          </div>
          <Input
            label="UF"
            value={formData.uf}
            onChange={(e) =>
            setFormData({
              ...formData,
              uf: e.target.value.toUpperCase()
            })
            }
            placeholder="UF"
            maxLength={2} />
          
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Telefone"
            value={formData.telefone}
            onChange={(e) =>
            setFormData({
              ...formData,
              telefone: e.target.value
            })
            }
            placeholder="(00) 0000-0000"
            required />
          

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) =>
            setFormData({
              ...formData,
              email: e.target.value
            })
            }
            placeholder="contato@clinica.com"
            required />
          
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ativa"
            checked={formData.ativa}
            onChange={(e) =>
            setFormData({
              ...formData,
              ativa: e.target.checked
            })
            }
            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
          

          <label htmlFor="ativa" className="text-sm text-gray-700">
            Clínica ativa
          </label>
        </div>
      </form>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </Modal>);

}