import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { PacienteBuscaSelectAPI } from './PacienteBuscaSelectAPI';
import {
  Paciente,
  TipoConsulta,
  StatusConsulta,
  TipoAgendamento,
  Procedimento } from
'../types';
import { API_BASE_URL } from '../config/api';
import {
  ZapIcon,
  SearchIcon,
  ClockIcon,
  DollarSignIcon,
  XIcon,
  StethoscopeIcon,
  ReceiptIcon,
  CreditCardIcon } from
'lucide-react';
import { useAgendaProfissional } from '../hooks/useAgendaProfissional';
import { ReciboModal } from './ReciboModal';
interface ConsultaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (consulta: any) => void | Promise<void>;
  pacientes: Paciente[];
  consulta?: any; // Consulta sendo editada
  preFilledData?: {
    data?: string;
    horario?: string;
    profissional?: string;
    profissionalId?: string;
    tipoAgendamento?: TipoAgendamento; // ⭐ NOVO: Permite pré-definir como encaixe
  };
}
export function ConsultaModal({
  isOpen,
  onClose,
  onSave,
  pacientes,
  consulta,
  preFilledData
}: ConsultaModalProps) {
  const [formData, setFormData] = useState({
    pacienteId: '',
    pacienteNome: '',
    tipo: 'medica' as TipoConsulta,
    tipoAgendamento: 'normal' as TipoAgendamento,
    modalidade: 'presencial' as 'presencial' | 'online',
    data: '',
    horario: '',
    duracao: 30,
    status: 'agendada' as StatusConsulta,
    profissional: '...',
    profissionalId: '',
    procedimentoId: '',
    procedimentoNome: '',
    procedimentoAnotacoes: '',
    observacoes: '',
    cor: ''
  });
  // Lista de profissionais (médicos e dentistas) da clínica
  const [profissionais, setProfissionais] = useState<
    Array<{
      id: string;
      nome: string;
      tipo: string;
    }>>(
    []);
  // Lista de procedimentos da clínica
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loadingProcedimentos, setLoadingProcedimentos] = useState(false);
  // ⭐ NOVO: Estado para busca de procedimentos
  const [buscaProcedimento, setBuscaProcedimento] = useState('');
  const [showProcedimentoDropdown, setShowProcedimentoDropdown] =
  useState(false);
  const procedimentoContainerRef = useRef<HTMLDivElement>(null);
  const procedimentoInputRef = useRef<HTMLInputElement>(null);
  // ⭐ NOVO: Estado para controlar uso único dos botões de encaixe
  const [encaixe1Usado, setEncaixe1Usado] = useState(false);
  const [encaixe2Usado, setEncaixe2Usado] = useState(false);
  // ⭐ NOVO: Estado para pagamento e recibo
  const [valorPago, setValorPago] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [showReciboModal, setShowReciboModal] = useState(false);
  const [pacienteParaRecibo, setPacienteParaRecibo] = useState<any>(null);
  // Pega clinicaId da sessão
  const clinicaId = useMemo(() => {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      return parsed.clinicaAtual?.id || '';
    }
    return '';
  }, []);
  // ⭐ NOVO: Carrega agendas para obter duração padrão da consulta do profissional
  const { agendas } = useAgendaProfissional(clinicaId || undefined);
  // ⭐ HELPER: Busca agenda por ID com fallback por nome (resolve IDs divergentes pós-migração)
  const findAgendaLocal = (profId: string) => {
    if (!profId) return undefined;
    const byId = agendas.find(
      (a) => String(a.profissionalId) === String(profId)
    );
    if (byId) return byId;
    // Fallback por nome
    const prof = profissionais?.find(
      (p: any) => String(p.id) === String(profId)
    );
    if (prof?.nome) {
      const nomeNorm = prof.nome.trim().toUpperCase();
      return agendas.find(
        (a) => a.profissionalNome?.trim().toUpperCase() === nomeNorm
      );
    }
    return undefined;
  };
  // ⭐ NOVO: Calcula a duração padrão da consulta do profissional selecionado
  const duracaoConsultaPadrao = useMemo(() => {
    if (!formData.profissionalId) return 30;
    const agenda = findAgendaLocal(formData.profissionalId);
    if (!agenda || !agenda.horarios || agenda.horarios.length === 0) return 30;
    return agenda.horarios[0]?.duracaoConsultaPadrao || 30;
  }, [agendas, formData.profissionalId]);
  // ⭐ NOVO: Calcula durações dos encaixes
  const duracaoEncaixe1 = useMemo(() => {
    return Math.max(5, Math.ceil(duracaoConsultaPadrao * 0.5));
  }, [duracaoConsultaPadrao]);
  const duracaoEncaixe2 = useMemo(() => {
    return Math.max(5, Math.ceil(duracaoEncaixe1 * 0.5));
  }, [duracaoEncaixe1]);
  // ⭐ FIX: Sincroniza duração com a configuração da agenda quando profissional muda
  // Resolve o bug de mostrar 15min/30min hardcoded em vez da duração configurada (ex: 20min)
  useEffect(() => {
    if (consulta) return; // Não altera ao editar
    if (formData.procedimentoId) return; // Procedimento define a duração
    if (!formData.profissionalId) return; // Sem profissional ainda
    const isEncaixe = formData.tipoAgendamento === 'encaixe';
    const novaDuracao = isEncaixe ? duracaoEncaixe1 : duracaoConsultaPadrao;
    if (formData.duracao !== novaDuracao) {
      setFormData((prev) => ({
        ...prev,
        duracao: novaDuracao
      }));
      console.log(
        `⏱️ [ConsultaModal] Duração ajustada para ${novaDuracao}min (agenda do profissional)`
      );
    }
  }, [
  duracaoConsultaPadrao,
  duracaoEncaixe1,
  formData.profissionalId,
  formData.tipoAgendamento,
  consulta,
  formData.procedimentoId]
  );
  // Carrega lista de profissionais da clínica
  useEffect(() => {
    const carregarProfissionais = async () => {
      if (!clinicaId) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const usuarios = await response.json();
          // Filtra apenas médicos e dentistas
          const profs = usuarios.filter(
            (u: any) => u.tipo === 'medico' || u.tipo === 'dentista'
          );
          setProfissionais(profs);
        }
      } catch (err) {
        console.error('Erro ao carregar profissionais:', err);
      }
    };
    carregarProfissionais();
  }, [clinicaId]);
  // Carrega lista de procedimentos da clínica
  useEffect(() => {
    const carregarProcedimentos = async () => {
      if (!clinicaId) return;
      setLoadingProcedimentos(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/procedimentos?clinicaId=${clinicaId}`
        );
        if (response.ok) {
          const data = await response.json();
          setProcedimentos(data.filter((p: Procedimento) => p.ativo));
        }
      } catch (err) {
        console.error('Erro ao carregar procedimentos:', err);
      } finally {
        setLoadingProcedimentos(false);
      }
    };
    carregarProcedimentos();
  }, [clinicaId]);
  // Filtra procedimentos pelo tipo de consulta (com fallback para todos se nenhum do tipo)
  const procedimentosFiltrados = useMemo(() => {
    const doTipo = procedimentos.filter((p) => p.tipo === formData.tipo);
    // ⭐ FIX: Se não há procedimentos do tipo da consulta, mostra TODOS os procedimentos
    let filtrados = doTipo.length > 0 ? doTipo : procedimentos;
    // ⭐ NOVO: Filtra também pela busca de texto
    if (buscaProcedimento.trim()) {
      const termo = buscaProcedimento.toLowerCase();
      filtrados = filtrados.filter(
        (p) =>
        p.nome.toLowerCase().includes(termo) ||
        p.descricao?.toLowerCase().includes(termo)
      );
    }
    return filtrados;
  }, [procedimentos, formData.tipo, buscaProcedimento]);
  // ⭐ Flag: está mostrando procedimentos de outro tipo como fallback
  const mostrandoFallbackTipo = useMemo(() => {
    return (
      procedimentos.filter((p) => p.tipo === formData.tipo).length === 0 &&
      procedimentos.length > 0);

  }, [procedimentos, formData.tipo]);
  // ⭐ NOVO: Fecha dropdown de procedimento ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
      procedimentoContainerRef.current &&
      !procedimentoContainerRef.current.contains(e.target as Node))
      {
        setShowProcedimentoDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Carrega dados da consulta ao editar
  useEffect(() => {
    if (consulta) {
      // ⭐ FIX: Corrige tipo baseado no profissional atual (não no tipo salvo na consulta)
      let tipoCorrigido: TipoConsulta = consulta.tipo || 'medica';
      if (consulta.profissionalId && profissionais.length > 0) {
        const prof = profissionais.find((p) => p.id === consulta.profissionalId);
        if (prof) {
          tipoCorrigido = prof.tipo === 'dentista' ? 'odontologica' : 'medica';
        }
      }
      setFormData({
        pacienteId: consulta.pacienteId || '',
        pacienteNome: consulta.pacienteNome || '',
        tipo: tipoCorrigido,
        tipoAgendamento: consulta.tipoAgendamento || 'normal',
        data: consulta.data || '',
        horario: consulta.horario || '',
        duracao: consulta.duracao || 30,
        status: consulta.status || 'agendada',
        profissional: consulta.profissional || '...',
        profissionalId: consulta.profissionalId || '',
        procedimentoId: consulta.procedimentoId || '',
        procedimentoNome:
        consulta.procedimentoNomeJoin || consulta.procedimentoNome || '',
        procedimentoAnotacoes: consulta.procedimentoAnotacoes || '',
        observacoes: consulta.observacoes || '',
        cor: consulta.cor || '',
        modalidade: consulta.modalidade === 'online' ? 'online' : 'presencial'
      });
      // Reset encaixe buttons
      setEncaixe1Usado(false);
      setEncaixe2Usado(false);
    } else if (isOpen) {
      // ⭐ CORREÇÃO: Só reseta quando abre o modal para CRIAR (não quando profissionais carregam)
      // Se não está editando, usa dados pré-preenchidos se disponíveis
      const profissionalPreenchido = preFilledData?.profissional || '';
      // Determina o tipo de consulta baseado no profissional pré-preenchido
      let tipoConsulta: TipoConsulta = 'medica';
      let profissionalIdPreenchido = preFilledData?.profissionalId || '';
      if (profissionalIdPreenchido && profissionais.length > 0) {
        const prof = profissionais.find(
          (p) => p.id === profissionalIdPreenchido
        );
        if (prof?.tipo === 'dentista') {
          tipoConsulta = 'odontologica';
        }
      }
      // ⭐ NOVO: Se é encaixe, usa cor laranja por padrão
      const isEncaixe = preFilledData?.tipoAgendamento === 'encaixe';
      setFormData((prev) => ({
        ...prev,
        pacienteId: prev.pacienteId || '',
        pacienteNome: prev.pacienteNome || '',
        tipo: tipoConsulta,
        tipoAgendamento: preFilledData?.tipoAgendamento || 'normal',
        data: preFilledData?.data || prev.data || '',
        horario: preFilledData?.horario || prev.horario || '',
        duracao: prev.procedimentoId ?
        prev.duracao :
        isEncaixe ?
        duracaoEncaixe1 :
        duracaoConsultaPadrao,
        status: 'agendada',
        profissional: profissionalPreenchido || prev.profissional || '...',
        profissionalId: profissionalIdPreenchido || prev.profissionalId || '',
        // ⭐ CORREÇÃO: Mantém procedimento se já selecionado
        procedimentoId: prev.procedimentoId || '',
        procedimentoNome: prev.procedimentoNome || '',
        observacoes: prev.observacoes || '',
        cor: isEncaixe ? prev.cor || '#F97316' : ''
      }));
    }
  }, [consulta, isOpen, profissionais]);
  // ⭐ FIX: Ao editar, corrige tipo baseado no profissional atual e resolve nome do procedimento
  useEffect(() => {
    if (consulta && profissionais.length > 0 && formData.profissionalId) {
      const prof = profissionais.find((p) => p.id === formData.profissionalId);
      if (prof) {
        const tipoCorreto =
        prof.tipo === 'dentista' ? 'odontologica' : 'medica' as TipoConsulta;
        if (formData.tipo !== tipoCorreto) {
          setFormData((prev) => ({
            ...prev,
            tipo: tipoCorreto
          }));
        }
      }
    }
  }, [consulta, profissionais, formData.profissionalId]);
  // ⭐ FIX: Resolve nome do procedimento a partir da lista quando está vazio mas tem ID
  useEffect(() => {
    if (
    formData.procedimentoId &&
    !formData.procedimentoNome &&
    procedimentos.length > 0)
    {
      const proc = procedimentos.find((p) => p.id === formData.procedimentoId);
      if (proc) {
        setFormData((prev) => ({
          ...prev,
          procedimentoNome: proc.nome
        }));
      }
    }
  }, [formData.procedimentoId, formData.procedimentoNome, procedimentos]);
  // ⭐ Atualiza tipo e profissionalId quando profissionais carregam (SOMENTE por ID)
  useEffect(() => {
    if (
    profissionais.length > 0 &&
    preFilledData?.profissionalId &&
    !consulta)
    {
      const prof = profissionais.find(
        (p) => p.id === preFilledData.profissionalId
      );
      if (prof) {
        setFormData((prev) => ({
          ...prev,
          profissionalId: prof.id,
          profissional: prof.nome,
          tipo: prof.tipo === 'dentista' ? 'odontologica' : 'medica'
        }));
      }
    }
  }, [profissionais, preFilledData?.profissionalId, consulta]);
  // Atualiza o tipo de consulta quando o profissional muda
  const handleProfissionalChange = (profissionalId: string) => {
    const prof = profissionais.find((p) => p.id === profissionalId);
    if (!prof) return;
    const novoTipo: TipoConsulta =
    prof.tipo === 'dentista' ? 'odontologica' : 'medica';
    setFormData({
      ...formData,
      profissional: prof.nome,
      profissionalId: prof.id,
      tipo: novoTipo,
      // Limpa procedimento se o tipo mudou
      procedimentoId: formData.tipo !== novoTipo ? '' : formData.procedimentoId,
      procedimentoNome:
      formData.tipo !== novoTipo ? '' : formData.procedimentoNome
    });
  };
  // Atualiza duração quando seleciona procedimento
  const handleProcedimentoChange = (procedimentoId: string) => {
    const procedimento = procedimentos.find((p) => p.id === procedimentoId);
    if (procedimento) {
      setFormData({
        ...formData,
        procedimentoId: procedimento.id,
        procedimentoNome: procedimento.nome,
        duracao: procedimento.duracao
      });
      setBuscaProcedimento('');
      setShowProcedimentoDropdown(false);
    } else {
      setFormData({
        ...formData,
        procedimentoId: '',
        procedimentoNome: ''
      });
    }
  };
  // ⭐ NOVO: Limpa procedimento selecionado
  const handleLimparProcedimento = () => {
    setFormData({
      ...formData,
      procedimentoId: '',
      procedimentoNome: '',
      procedimentoAnotacoes: '',
      duracao:
      formData.tipoAgendamento === 'encaixe' ?
      duracaoEncaixe1 :
      duracaoConsultaPadrao
    });
    setBuscaProcedimento('');
    setTimeout(() => procedimentoInputRef.current?.focus(), 50);
  };
  // ⭐ NOVO: Toggle de encaixe
  const handleTipoAgendamentoChange = (isEncaixe: boolean) => {
    setFormData({
      ...formData,
      tipoAgendamento: isEncaixe ? 'encaixe' : 'normal',
      cor: isEncaixe ? '#F97316' : '#3B82F6',
      duracao: isEncaixe ? duracaoEncaixe1 : duracaoConsultaPadrao // ⭐ FIX: Usa duração da agenda
    });
  };
  // ⭐ NOVO: Carrega dados do paciente quando editando (para ReciboModal)
  useEffect(() => {
    if (
    consulta &&
    consulta.pacienteId &&
    clinicaId &&
    consulta.pacienteId !== 'disponivel')
    {
      fetch(
        `${API_BASE_URL}/api/pacientes/${consulta.pacienteId}?clinicaId=${clinicaId}`
      ).
      then((res) => res.ok ? res.json() : null).
      then((data) => {
        if (data) {
          setPacienteParaRecibo(data);
        }
      }).
      catch(() => {});
    } else {
      setPacienteParaRecibo(null);
    }
  }, [consulta?.pacienteId, clinicaId]);
  // 6 cores padrão para consultas
  const coresDisponiveis = [
  {
    valor: '#3B82F6',
    nome: 'Azul'
  },
  {
    valor: '#10B981',
    nome: 'Verde'
  },
  {
    valor: '#F59E0B',
    nome: 'Amarelo'
  },
  {
    valor: '#F97316',
    nome: 'Laranja'
  },
  {
    valor: '#EF4444',
    nome: 'Vermelho'
  },
  {
    valor: '#8B5CF6',
    nome: 'Roxo'
  }];

  const [isSaving, setIsSaving] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ⭐ VALIDAÇÃO: Não permite agendar sem paciente
    if (!formData.pacienteId) {
      return;
    }
    // ⭐ FIX: profissionalId já deve estar no formData — não busca por nome
    if (!formData.profissionalId) {
      console.warn('⚠️ [ConsultaModal] profissionalId vazio no submit!');
    }
    // ⭐ FIX CRÍTICO: Aguarda o save completar ANTES de fechar/resetar
    // Antes: chamava onSave() sem await, resetava form e fechava modal imediatamente
    // Isso causava race condition onde o modal fechava antes do POST terminar
    setIsSaving(true);
    try {
      console.log('💾 [ConsultaModal] Salvando consulta...', {
        paciente: formData.pacienteNome,
        data: formData.data,
        horario: formData.horario,
        profissional: formData.profissional
      });
      await onSave({
        ...formData,
        profissionalId: formData.profissionalId
      });
      console.log('✅ [ConsultaModal] Consulta salva com sucesso!');
      // ⭐ NÃO reseta form nem fecha modal aqui — o AgendaPage controla isso no finally
    } catch (err) {
      console.error('❌ [ConsultaModal] Erro ao salvar:', err);
      // Erro já é tratado pelo AgendaPage no catch
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
      consulta ?
      'Editar Consulta' :
      formData.tipoAgendamento === 'encaixe' ?
      '⚡ Novo Encaixe' :
      'Nova Consulta'
      }
      footer={
      <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
          onClick={handleSubmit}
          disabled={!formData.pacienteId || isSaving}
          className={
          formData.tipoAgendamento === 'encaixe' ?
          'bg-orange-500 hover:bg-orange-600' :
          ''
          }>
          
            {isSaving ?
          '⏳ Salvando...' :
          consulta ?
          'Salvar Alterações' :
          formData.tipoAgendamento === 'encaixe' ?
          '⚡ Criar Encaixe' :
          'Agendar Consulta'}
          </Button>
        </>
      }>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ⭐ PROFISSIONAL NO TOPO - Sticky dentro do scroll do Modal */}
        <div className="p-4 bg-gradient-to-r from-teal-50 to-blue-50 border-2 border-teal-200 rounded-lg sticky top-[-16px] z-10 shadow-sm">
          <label className="block text-xs font-medium text-teal-700 mb-1">
            Profissional Responsável
          </label>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <span className="text-lg">
                {formData.tipo === 'odontologica' ? '🦷' : '🩺'}
              </span>
            </div>
            <div>
              <p className="text-gray-900 font-semibold text-lg">
                {formData.profissional ||
                preFilledData?.profissional ||
                'Profissional'}
              </p>
              <p className="text-xs text-teal-600">
                {formData.tipo === 'odontologica' ? 'Dentista' : 'Médico'} •
                Agenda do dia
              </p>
            </div>
          </div>
        </div>

        {/* ⭐ NOVO: Toggle de Encaixe */}
        {!consulta &&
        <div
          className={`p-4 rounded-lg border-2 transition-all ${formData.tipoAgendamento === 'encaixe' ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}`}>
          
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <div
                className={`p-2 rounded-lg ${formData.tipoAgendamento === 'encaixe' ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'}`}>
                
                  <ZapIcon className="w-5 h-5" />
                </div>
                <div>
                  <p
                  className={`font-medium ${formData.tipoAgendamento === 'encaixe' ? 'text-orange-900' : 'text-gray-700'}`}>
                  
                    Encaixe
                  </p>
                  <p className="text-xs text-gray-500">
                    Não ocupa slot da agenda, pode ser em qualquer horário
                  </p>
                </div>
              </div>
              <div className="relative">
                <input
                type="checkbox"
                checked={formData.tipoAgendamento === 'encaixe'}
                onChange={(e) =>
                handleTipoAgendamentoChange(e.target.checked)
                }
                className="sr-only" />
              

                <div
                className={`w-11 h-6 rounded-full transition-colors ${formData.tipoAgendamento === 'encaixe' ? 'bg-orange-500' : 'bg-gray-300'}`}>
                
                  <div
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.tipoAgendamento === 'encaixe' ? 'translate-x-5' : 'translate-x-0'}`} />
                
                </div>
              </div>
            </label>

            {formData.tipoAgendamento === 'encaixe' &&
          <div className="mt-3 p-2 bg-orange-100 rounded text-xs text-orange-800">
                ⚡ <strong>Encaixe:</strong> Este agendamento não ocupará um
                slot da agenda regular. Ideal para urgências ou retornos
                rápidos.
              </div>
          }
          </div>
        }

        {/* ⭐ NOVO: Toggle de Modalidade (Presencial / Online) */}
        <div
          className={`p-4 rounded-lg border-2 transition-all ${formData.modalidade === 'online' ? 'bg-teal-50 border-teal-300' : 'bg-gray-50 border-gray-200'}`}>
          
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${formData.modalidade === 'online' ? 'bg-teal-100 text-teal-600' : 'bg-gray-200 text-gray-500'}`}>
                
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor">
                  
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  
                </svg>
              </div>
              <div>
                <p
                  className={`font-medium ${formData.modalidade === 'online' ? 'text-teal-900' : 'text-gray-700'}`}>
                  
                  Consulta Online
                </p>
                <p className="text-xs text-gray-500">
                  Realizar atendimento por videochamada
                </p>
              </div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={formData.modalidade === 'online'}
                onChange={(e) =>
                setFormData({
                  ...formData,
                  modalidade: e.target.checked ? 'online' : 'presencial'
                })
                }
                className="sr-only" />
              
              <div
                className={`w-11 h-6 rounded-full transition-colors ${formData.modalidade === 'online' ? 'bg-teal-500' : 'bg-gray-300'}`}>
                
                <div
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.modalidade === 'online' ? 'translate-x-5' : 'translate-x-0'}`} />
                
              </div>
            </div>
          </label>

          {formData.modalidade === 'online' &&
          <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-100 text-xs text-blue-800">
              ℹ️ <strong>Sala de Vídeo:</strong> Um link seguro será gerado
              automaticamente no momento do atendimento. Você poderá enviá-lo ao
              paciente pelo WhatsApp.
            </div>
          }
        </div>

        {/* ⭐ NOVO: Botões de Encaixe Rápido - disponíveis apenas ao EDITAR uma consulta normal existente */}
        {consulta &&
        consulta.tipoAgendamento !== 'encaixe' &&
        formData.tipoAgendamento === 'normal' &&
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-4 border border-orange-200">
              <p className="text-xs font-semibold text-orange-900 mb-3 flex items-center gap-1.5">
                <ZapIcon className="w-4 h-4 text-orange-500" />
                Encaixe Rápido (consulta padrão: {duracaoConsultaPadrao} min)
              </p>
              <div className="flex gap-3">
                <button
              type="button"
              disabled={encaixe1Usado}
              onClick={() => {
                setEncaixe1Usado(true);
                setFormData((prev) => ({
                  ...prev,
                  tipoAgendamento: 'encaixe',
                  duracao: duracaoEncaixe1,
                  cor: '#F97316'
                }));
              }}
              className={`flex-1 px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all ${encaixe1Usado ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60' : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-100 hover:border-orange-400 hover:shadow-sm active:scale-95'}`}>
              
                  <div className="flex flex-col items-center gap-1">
                    <ZapIcon
                  className={`w-5 h-5 ${encaixe1Usado ? 'text-gray-400' : 'text-orange-500'}`} />
                

                    <span className="text-lg font-bold">
                      {duracaoEncaixe1} min
                    </span>
                    <span
                  className={`text-[10px] ${encaixe1Usado ? 'text-gray-400' : 'text-orange-500'}`}>
                  
                      {encaixe1Usado ? '✓ Usado' : '1º Encaixe (50%)'}
                    </span>
                  </div>
                </button>
                <button
              type="button"
              disabled={encaixe2Usado}
              onClick={() => {
                setEncaixe2Usado(true);
                setFormData((prev) => ({
                  ...prev,
                  tipoAgendamento: 'encaixe',
                  duracao: duracaoEncaixe2,
                  cor: '#EF4444'
                }));
              }}
              className={`flex-1 px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all ${encaixe2Usado ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60' : 'bg-white text-red-700 border-red-300 hover:bg-red-100 hover:border-red-400 hover:shadow-sm active:scale-95'}`}>
              
                  <div className="flex flex-col items-center gap-1">
                    <ZapIcon
                  className={`w-5 h-5 ${encaixe2Usado ? 'text-gray-400' : 'text-red-500'}`} />
                

                    <span className="text-lg font-bold">
                      {duracaoEncaixe2} min
                    </span>
                    <span
                  className={`text-[10px] ${encaixe2Usado ? 'text-gray-400' : 'text-red-500'}`}>
                  
                      {encaixe2Usado ? '✓ Usado' : '2º Encaixe (25%)'}
                    </span>
                  </div>
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 text-center">
                Cada botão pode ser usado apenas 1 vez • 1º = 50% da consulta •
                2º = 50% do 1º
              </p>
            </div>
        }

        {/* Mostra badge se estiver editando um encaixe */}
        {consulta && consulta.tipoAgendamento === 'encaixe' &&
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
            <ZapIcon className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-800">
              Este é um encaixe
            </span>
          </div>
        }

        {/* ⭐ SEMPRE usa PacienteBuscaSelectAPI - tanto em criação quanto edição */}
        <PacienteBuscaSelectAPI
          clinicaId={clinicaId}
          value={formData.pacienteId}
          onChange={(pacienteId, pacienteNome) =>
          setFormData({
            ...formData,
            pacienteId,
            pacienteNome
          })
          }
          label="Paciente"
          required
          showClearButton={true}
          autoFocus={!consulta} // ⭐ NOVO: Foca automaticamente ao criar nova consulta
        />

        {/* ⭐ Aviso se não selecionou paciente */}
        {!formData.pacienteId &&
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              ⚠️ Selecione um paciente para continuar
            </p>
          </div>
        }

        {/* Tipo de Consulta - Agora mostra o tipo baseado no profissional */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de Consulta
          </label>
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2">
            <span className="text-lg">
              {formData.tipo === 'medica' ? '🩺' : '🦷'}
            </span>
            <span className="text-gray-900 font-medium">
              {formData.tipo === 'medica' ?
              'Consulta Médica' :
              'Consulta Odontológica'}
            </span>
            <span className="text-xs text-gray-500 ml-auto">
              (definido pelo profissional)
            </span>
          </div>
        </div>

        {/* Seleção de Procedimento */}
        <div ref={procedimentoContainerRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Procedimento
          </label>
          {loadingProcedimentos ?
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-gray-500 text-sm">
                Carregando procedimentos...
              </p>
            </div> :
          procedimentos.length === 0 ?
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800 text-sm">
                Nenhum procedimento cadastrado.
                <br />
                <span className="text-xs text-amber-600">
                  Cadastre procedimentos em Configurações → Procedimentos
                </span>
              </p>
            </div> :
          formData.procedimentoId ?
          // ⭐ PROCEDIMENTO SELECIONADO - Mostra card com detalhes
          <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-purple-50 border-2 border-purple-300 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <StethoscopeIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold truncate">
                      {formData.procedimentoNome}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5" />
                        {formData.duracao} min
                      </span>
                      {procedimentos.find(
                      (p) => p.id === formData.procedimentoId
                    )?.valor &&
                    <span className="flex items-center gap-1">
                          <DollarSignIcon className="w-3.5 h-3.5" />
                          R${' '}
                          {procedimentos.
                      find((p) => p.id === formData.procedimentoId)?.
                      valor?.toFixed(2)}
                        </span>
                    }
                    </div>
                  </div>
                  <div className="text-purple-600">
                    <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor">
                    
                      <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                    
                    </svg>
                  </div>
                </div>
              </div>
              <button
              type="button"
              onClick={handleLimparProcedimento}
              className="px-3 py-3 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg transition-colors"
              title="Remover procedimento">
              
                <XIcon className="w-5 h-5" />
              </button>
            </div> :

          // ⭐ BUSCA DE PROCEDIMENTO - Campo com dropdown
          <div className="relative">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                ref={procedimentoInputRef}
                type="text"
                value={buscaProcedimento}
                onChange={(e) => {
                  setBuscaProcedimento(e.target.value);
                  setShowProcedimentoDropdown(true);
                }}
                onFocus={() => setShowProcedimentoDropdown(true)}
                placeholder="Buscar procedimento por nome..."
                className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all" />
              
              </div>

              {showProcedimentoDropdown &&
            <div className="absolute z-40 w-full mt-2 bg-white border-2 border-purple-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  <div className="sticky top-0 bg-purple-50 border-b border-purple-200 px-4 py-2">
                    <p className="text-xs font-semibold text-purple-900">
                      {buscaProcedimento ?
                  <>
                          🔍 Buscando:{' '}
                          <span className="text-purple-600">
                            "{buscaProcedimento}"
                          </span>
                        </> :

                  <>
                          📋 {procedimentosFiltrados.length} procedimento(s)
                          disponível(is)
                        </>
                  }
                    </p>
                    {mostrandoFallbackTipo &&
                <p className="text-[10px] text-amber-600 mt-0.5">
                        ⚠️ Nenhum procedimento{' '}
                        {formData.tipo === 'medica' ? 'médico' : 'odontológico'}{' '}
                        — mostrando todos
                      </p>
                }
                  </div>

                  {procedimentosFiltrados.length === 0 ?
              <div className="p-6 text-center">
                      <div className="text-3xl mb-2">🔍</div>
                      <p className="text-gray-600 text-sm">
                        Nenhum procedimento encontrado
                      </p>
                    </div> :

              <div className="py-1">
                      {procedimentosFiltrados.map((proc) =>
                <button
                  key={proc.id}
                  type="button"
                  onClick={() => handleProcedimentoChange(proc.id)}
                  className="w-full px-4 py-3 text-left hover:bg-purple-50 border-b border-gray-100 last:border-b-0 transition-colors">
                  
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                              <StethoscopeIcon className="w-4 h-4 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {proc.nome}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <ClockIcon className="w-3 h-3" />
                                  {proc.duracao} min
                                </span>
                                {proc.valor &&
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                                    <DollarSignIcon className="w-3 h-3" />
                                    R$ {proc.valor.toFixed(2)}
                                  </span>
                        }
                              </div>
                            </div>
                          </div>
                        </button>
                )}
                    </div>
              }
                </div>
            }
            </div>
          }

          {formData.procedimentoId &&
          <p className="text-xs text-purple-600 mt-2">
              ✓ Duração ajustada automaticamente para {formData.duracao} minutos
            </p>
          }

          {formData.procedimentoId &&
          <textarea
            className="mt-2 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
            rows={2}
            placeholder="Anotações do procedimento (ex: dente 18, face vestibular...)"
            value={formData.procedimentoAnotacoes || ''}
            onChange={(e) =>
            setFormData({
              ...formData,
              procedimentoAnotacoes: e.target.value
            })
            } />

          }

          {!formData.procedimentoId && procedimentos.length > 0 &&
          <p className="text-xs text-gray-500 mt-2">
              💡 Opcional - selecione para ajustar a duração automaticamente
            </p>
          }
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Data"
            type="date"
            value={formData.data}
            onChange={(e) =>
            setFormData({
              ...formData,
              data: e.target.value
            })
            }
            required />
          

          <Input
            label="Horário"
            type="time"
            value={formData.horario}
            onChange={(e) =>
            setFormData({
              ...formData,
              horario: e.target.value
            })
            }
            required />
          
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Duração (minutos)"
            value={formData.duracao.toString()}
            onChange={(e) =>
            setFormData({
              ...formData,
              duracao: parseInt(e.target.value)
            })
            }
            options={[
            5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 120].
            map((m) => ({
              value: m.toString(),
              label:
              m >= 60 ?
              `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ''}` :
              `${m} minutos`
            }))} />
          

          <Select
            label="Status"
            value={formData.status}
            onChange={(e) =>
            setFormData({
              ...formData,
              status: e.target.value as StatusConsulta
            })
            }
            options={[
            {
              value: 'agendada',
              label: 'Agendada'
            },
            {
              value: 'confirmada',
              label: 'Confirmada'
            }]
            } />
          
        </div>

        {/* Seletor de Cor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            🎨 Cor da Consulta
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            {coresDisponiveis.map((cor) =>
            <button
              key={cor.valor}
              type="button"
              onClick={() =>
              setFormData({
                ...formData,
                cor: cor.valor
              })
              }
              className={`group relative w-14 h-14 rounded-xl transition-all hover:scale-110 ${formData.cor === cor.valor ? 'ring-4 ring-offset-2 scale-110' : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'}`}
              style={{
                backgroundColor: cor.valor,
                ringColor: formData.cor === cor.valor ? cor.valor : undefined
              }}
              title={cor.nome}>
              
                {formData.cor === cor.valor &&
              <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                  className="w-6 h-6 text-white drop-shadow-lg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor">
                  
                      <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7" />
                  
                    </svg>
                  </div>
              }
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                    {cor.nome}
                  </span>
                </div>
              </button>
            )}
            {/* ⭐ Botão para resetar cor para padrão */}
            <button
              type="button"
              onClick={() =>
              setFormData({
                ...formData,
                cor: ''
              })
              }
              className={`group relative w-14 h-14 rounded-xl transition-all hover:scale-110 border-2 border-dashed ${!formData.cor ? 'border-green-400 ring-4 ring-offset-2 ring-green-200 scale-110 bg-white' : 'border-gray-300 hover:border-gray-400 bg-white hover:ring-2 hover:ring-offset-1 hover:ring-gray-200'}`}
              title="Cor padrão (sem destaque)">
              
              <div className="absolute inset-0 flex items-center justify-center">
                {!formData.cor ?
                <svg
                  className="w-6 h-6 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor">
                  
                    <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7" />
                  
                  </svg> :

                <XIcon className="w-5 h-5 text-gray-400" />
                }
              </div>
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                  Padrão
                </span>
              </div>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-8">
            {formData.tipoAgendamento === 'encaixe' ?
            '⚡ Encaixes usam laranja por padrão, mas você pode personalizar' :
            'Escolha uma cor para destacar esta consulta na agenda'}
          </p>
        </div>

        {consulta ?
        // Modo EDIÇÃO: Mostra apenas o nome do profissional (não editável)
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profissional
            </label>
            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-gray-900 font-medium">
                {formData.profissional}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ⚠️ O profissional não pode ser alterado após o agendamento
              </p>
            </div>
          </div> :

        // ⭐ FIX: Select usa ID como value em vez de nome
        <Select
          label="Profissional"
          value={formData.profissionalId}
          onChange={(e) => handleProfissionalChange(e.target.value)}
          options={
          profissionais.length > 0 ?
          [
          {
            value: '',
            label: 'Selecione um profissional...'
          },
          ...profissionais.map((p) => ({
            value: p.id,
            label: `${p.nome} (${p.tipo === 'medico' ? '🩺 Médico' : '🦷 Dentista'})`
          }))] :

          [
          {
            value: formData.profissionalId || '',
            label: formData.profissional || 'Nenhum profissional'
          }]

          } />

        }

        <Textarea
          label="Observações"
          value={formData.observacoes}
          onChange={(e) =>
          setFormData({
            ...formData,
            observacoes: e.target.value
          })
          }
          placeholder={
          formData.tipoAgendamento === 'encaixe' ?
          'Motivo do encaixe (urgência, retorno rápido, etc.)...' :
          'Observações sobre a consulta...'
          } />
        

        {/* ⭐ NOVO: Seção de Pagamento - só aparece ao EDITAR consulta */}
        {consulta &&
        <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CreditCardIcon className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-semibold text-emerald-900 text-sm">
                  Pagamento / Recibo
                </h4>
                <p className="text-[11px] text-emerald-600">
                  Registre pagamento e emita recibo sem sair da agenda
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Valor Pago (R$)
                </label>
                <input
                type="number"
                step="0.01"
                min="0"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
              
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_debito">Cartão Débito</option>
                  <option value="cartao_credito">Cartão Crédito</option>
                  <option value="boleto">Boleto</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </div>
            </div>

            {/* Valor do procedimento como referência */}
            {formData.procedimentoId &&
          <div className="mb-3 p-2 bg-white/60 rounded border border-emerald-100">
                <p className="text-xs text-emerald-700">
                  💡 Procedimento: <strong>{formData.procedimentoNome}</strong>
                  {(() => {
                const proc = procedimentos.find(
                  (p) => p.id === formData.procedimentoId
                );
                return proc?.valor ?
                ` — Valor: R$ ${proc.valor.toFixed(2)}` :
                '';
              })()}
                </p>
              </div>
          }

            <button
            type="button"
            onClick={() => setShowReciboModal(true)}
            disabled={!pacienteParaRecibo}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
            
              <ReceiptIcon className="w-4 h-4" />
              Emitir Recibo
            </button>
            {!pacienteParaRecibo &&
          <p className="text-[10px] text-gray-500 text-center mt-1">
                Carregando dados do paciente...
              </p>
          }
          </div>
        }
      </form>

      {/* ⭐ NOVO: Modal de Recibo (abre sobre o ConsultaModal) */}
      {pacienteParaRecibo &&
      <ReciboModal
        isOpen={showReciboModal}
        onClose={() => setShowReciboModal(false)}
        paciente={pacienteParaRecibo}
        clinicaId={clinicaId} />

      }
    </Modal>);

}