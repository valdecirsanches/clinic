import React, { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Input, Textarea } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Procedimento, TipoConsulta } from '../types';
interface ProcedimentoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (procedimento: Omit<Procedimento, 'id' | 'criadoEm' | 'clinicaId'>) => void;
  procedimento?: Procedimento | null;
}
export function ProcedimentoForm({
  isOpen,
  onClose,
  onSave,
  procedimento
}: ProcedimentoFormProps) {
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'medica' as TipoConsulta,
    duracao: 30,
    valor: '',
    descricao: '',
    ativo: true
  });
  useEffect(() => {
    if (procedimento) {
      setFormData({
        nome: procedimento.nome,
        tipo: procedimento.tipo,
        duracao: procedimento.duracao,
        valor: procedimento.valor?.toString() || '',
        descricao: procedimento.descricao || '',
        ativo: procedimento.ativo
      });
    } else {
      setFormData({
        nome: '',
        tipo: 'medica',
        duracao: 30,
        valor: '',
        descricao: '',
        ativo: true
      });
    }
  }, [procedimento, isOpen]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      nome: formData.nome,
      tipo: formData.tipo,
      duracao: formData.duracao,
      valor: formData.valor ? parseFloat(formData.valor) : undefined,
      descricao: formData.descricao || undefined,
      ativo: formData.ativo
    });
    onClose();
  };
  // Durações pré-definidas
  const duracoesDisponiveis = [{
    value: '5',
    label: '5 minutos'
  }, {
    value: '10',
    label: '10 minutos'
  }, {
    value: '15',
    label: '15 minutos'
  }, {
    value: '20',
    label: '20 minutos'
  }, {
    value: '25',
    label: '25 minutos'
  }, {
    value: '30',
    label: '30 minutos'
  }, {
    value: '35',
    label: '35 minutos'
  }, {
    value: '40',
    label: '40 minutos'
  }, {
    value: '45',
    label: '45 minutos'
  }, {
    value: '60',
    label: '1 hora'
  }, {
    value: '90',
    label: '1h 30min'
  }, {
    value: '120',
    label: '2 horas'
  }];
  return <Modal isOpen={isOpen} onClose={onClose} title={procedimento ? 'Editar Procedimento' : 'Novo Procedimento'} footer={<>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            {procedimento ? 'Salvar Alterações' : 'Cadastrar'}
          </Button>
        </>}>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nome do Procedimento" value={formData.nome} onChange={(e) => setFormData({
        ...formData,
        nome: e.target.value
      })} placeholder="Ex: Consulta de Rotina, Limpeza Dental..." required />
        

        <Select label="Tipo" value={formData.tipo} onChange={(e) => setFormData({
        ...formData,
        tipo: e.target.value as TipoConsulta
      })} options={[{
        value: 'medica',
        label: '🩺 Médico'
      }, {
        value: 'odontologica',
        label: '🦷 Odontológico'
      }]} />
        

        <Select label="Duração Padrão" value={formData.duracao.toString()} onChange={(e) => setFormData({
        ...formData,
        duracao: parseInt(e.target.value)
      })} options={duracoesDisponiveis} />
        

        <Input label="Valor (R$)" type="number" step="0.01" min="0" value={formData.valor} onChange={(e) => setFormData({
        ...formData,
        valor: e.target.value
      })} placeholder="Ex: 150.00 (opcional)" />
        

        <Textarea label="Descrição" value={formData.descricao} onChange={(e) => setFormData({
        ...formData,
        descricao: e.target.value
      })} placeholder="Descrição do procedimento (opcional)" rows={3} />
        

        <div className="flex items-center gap-2">
          <input type="checkbox" id="ativo" checked={formData.ativo} onChange={(e) => setFormData({
          ...formData,
          ativo: e.target.checked
        })} className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
          
          <label htmlFor="ativo" className="text-sm text-gray-700">
            Procedimento ativo (disponível para agendamento)
          </label>
        </div>
      </form>
    </Modal>;
}