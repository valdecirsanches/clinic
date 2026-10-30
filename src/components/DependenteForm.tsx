import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { Dependente, Genero } from '../types';
interface DependenteFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dependente: any) => void;
  dependente?: Dependente;
  pacienteNome: string;
}
export function DependenteForm({
  isOpen,
  onClose,
  onSave,
  dependente,
  pacienteNome
}: DependenteFormProps) {
  const [formData, setFormData] = useState({
    nome: dependente?.nome || '',
    dataNascimento: dependente?.dataNascimento || '',
    genero: (dependente?.genero || 'nao_informar') as Genero,
    cpf: dependente?.cpf || '',
    rg: dependente?.rg || '',
    parentesco: dependente?.parentesco || 'filho',
    parentescoOutro: dependente?.parentescoOutro || '',
    telefone: dependente?.telefone || '',
    email: dependente?.email || '',
    convenio: dependente?.convenio || '',
    numeroCarteirinha: dependente?.numeroCarteirinha || '',
    observacoes: dependente?.observacoes || ''
  });
  const calcularIdade = (dataNascimento: string): number => {
    if (!dataNascimento) return 0;
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || mes === 0 && hoje.getDate() < nascimento.getDate()) {
      idade--;
    }
    return idade;
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dependenteData = {
      ...formData,
      idade: calcularIdade(formData.dataNascimento)
    };
    onSave(dependenteData);
    onClose();
  };
  return <Modal isOpen={isOpen} onClose={onClose} title={dependente ? 'Editar Dependente' : `Novo Dependente - Titular: ${pacienteNome}`} footer={<>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            {dependente ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>}>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nome Completo *" value={formData.nome} onChange={(e) => setFormData({
        ...formData,
        nome: e.target.value
      })} placeholder="Nome completo do dependente" required />
        

        <div className="grid grid-cols-3 gap-4">
          <Input label="Data Nascimento *" type="date" value={formData.dataNascimento} onChange={(e) => setFormData({
          ...formData,
          dataNascimento: e.target.value
        })} required />
          
          <Input label="Idade" value={formData.dataNascimento ? calcularIdade(formData.dataNascimento).toString() : ''} disabled placeholder="Calculada automaticamente" />
          
          <Select label="Gênero *" value={formData.genero} onChange={(e) => setFormData({
          ...formData,
          genero: e.target.value as Genero
        })} options={[{
          value: 'masculino',
          label: 'Masculino'
        }, {
          value: 'feminino',
          label: 'Feminino'
        }, {
          value: 'outro',
          label: 'Outro'
        }, {
          value: 'nao_informar',
          label: 'Prefiro não informar'
        }]} />
          
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select label="Parentesco *" value={formData.parentesco} onChange={(e) => setFormData({
          ...formData,
          parentesco: e.target.value as any
        })} options={[{
          value: 'conjuge',
          label: 'Cônjuge'
        }, {
          value: 'filho',
          label: 'Filho(a)'
        }, {
          value: 'pai',
          label: 'Pai'
        }, {
          value: 'mae',
          label: 'Mãe'
        }, {
          value: 'irmao',
          label: 'Irmão(ã)'
        }, {
          value: 'outro',
          label: 'Outro'
        }]} />
          
          {formData.parentesco === 'outro' && <Input label="Especificar Parentesco" value={formData.parentescoOutro} onChange={(e) => setFormData({
          ...formData,
          parentescoOutro: e.target.value
        })} placeholder="Ex: Sobrinho, Avô, etc" />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="CPF" value={formData.cpf} onChange={(e) => setFormData({
          ...formData,
          cpf: e.target.value
        })} placeholder="000.000.000-00" />
          
          <Input label="RG" value={formData.rg} onChange={(e) => setFormData({
          ...formData,
          rg: e.target.value
        })} placeholder="Número do RG" />
          
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Telefone" value={formData.telefone} onChange={(e) => setFormData({
          ...formData,
          telefone: e.target.value
        })} placeholder="(00) 00000-0000" />
          
          <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({
          ...formData,
          email: e.target.value
        })} placeholder="email@exemplo.com" />
          
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Convênio" value={formData.convenio} onChange={(e) => setFormData({
          ...formData,
          convenio: e.target.value
        })} placeholder="Nome do convênio" />
          
          <Input label="Nº Carteirinha" value={formData.numeroCarteirinha} onChange={(e) => setFormData({
          ...formData,
          numeroCarteirinha: e.target.value
        })} placeholder="Número da carteirinha" />
          
        </div>

        <Textarea label="Observações" value={formData.observacoes} onChange={(e) => setFormData({
        ...formData,
        observacoes: e.target.value
      })} placeholder="Informações adicionais..." rows={4} />
        
      </form>
    </Modal>;
}