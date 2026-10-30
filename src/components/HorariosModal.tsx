import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Card } from './ui/Card';
import {
  PlusIcon,
  ClockIcon,
  EditIcon,
  XIcon,
  SaveIcon,
  CalendarIcon,
  CalendarDaysIcon } from
'lucide-react';
import { useAgendaProfissional } from '../hooks/useAgendaProfissional';
import { useToast } from '../hooks/useToast';
import { HorarioTrabalho } from '../types';
import {
  getLabelRecorrencia,
  getRecorrenciaOposta } from
'../utils/recorrenciaAgenda';
interface HorariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  profissionalId: string;
  profissionalNome: string;
  especialidade: 'medico' | 'dentista';
  clinicaId: string;
}
const DIAS_SEMANA = [
{
  valor: 0,
  nome: 'Domingo'
},
{
  valor: 1,
  nome: 'Segunda-feira'
},
{
  valor: 2,
  nome: 'Terça-feira'
},
{
  valor: 3,
  nome: 'Quarta-feira'
},
{
  valor: 4,
  nome: 'Quinta-feira'
},
{
  valor: 5,
  nome: 'Sexta-feira'
},
{
  valor: 6,
  nome: 'Sábado'
}];

const DEFAULT_HORARIO: HorarioTrabalho = {
  diaSemana: 1,
  horaInicio: '08:00',
  horaFim: '18:00',
  intervaloInicio: '12:00',
  intervaloFim: '13:00',
  duracaoConsultaPadrao: 30,
  recorrencia: 'toda_semana'
};
export function HorariosModal({
  isOpen,
  onClose,
  profissionalId,
  profissionalNome,
  especialidade,
  clinicaId
}: HorariosModalProps) {
  const { agendas, addAgenda, updateAgenda } = useAgendaProfissional(clinicaId);
  const { success, error: toastError } = useToast();
  // Log quando o modal abre
  useEffect(() => {
    if (isOpen) {
      console.log('🚪 [HorariosModal] MODAL ABERTO!');
      console.log('📋 [HorariosModal] Props recebidas:', {
        profissionalId,
        profissionalNome,
        especialidade,
        clinicaId
      });
      console.log(
        '📊 [HorariosModal] Total de agendas carregadas:',
        agendas.length
      );
    }
  }, [
  isOpen,
  profissionalId,
  profissionalNome,
  especialidade,
  clinicaId,
  agendas]
  );
  // ⭐ BUSCA AGENDA APENAS POR ID - NUNCA POR NOME
  const agendaExistente = useMemo(() => {
    console.log(
      '🔍 [HorariosModal] Buscando agenda APENAS por ID:',
      profissionalId
    );
    console.log(
      '🔍 [HorariosModal] Agendas disponíveis:',
      agendas.map((a) => ({
        id: a.id,
        profissionalId: a.profissionalId,
        profissionalNome: a.profissionalNome,
        totalHorarios: a.horarios?.length || 0
      }))
    );
    // ⭐ BUSCA POR profissionalId COM FALLBACK POR NOME (resolve IDs divergentes pós-migração)
    let agenda = agendas.find(
      (a) => String(a.profissionalId) === String(profissionalId)
    );
    if (!agenda && profissionalNome) {
      const nomeNorm = profissionalNome.trim().toUpperCase();
      agenda = agendas.find(
        (a) => a.profissionalNome?.trim().toUpperCase() === nomeNorm
      );
      if (agenda) {
        console.warn(
          `⚠️ [HorariosModal] Agenda encontrada por NOME ("${profissionalNome}") — IDs divergentes: agenda.profissionalId="${agenda.profissionalId}" vs prop="${profissionalId}"`
        );
      }
    }
    if (agenda) {
      console.log('✅ [HorariosModal] Agenda encontrada por ID:', {
        id: agenda.id,
        profissionalId: agenda.profissionalId,
        profissionalNome: agenda.profissionalNome,
        totalHorarios: agenda.horarios?.length || 0
      });
      return agenda;
    }
    console.log(
      '❌ [HorariosModal] Nenhuma agenda encontrada para profissionalId:',
      profissionalId
    );
    return undefined;
  }, [agendas, profissionalId]);
  const [horarios, setHorarios] = useState<HorarioTrabalho[]>([]);
  const [currentSlot, setCurrentSlot] =
  useState<HorarioTrabalho>(DEFAULT_HORARIO);
  const [isEditingSlot, setIsEditingSlot] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // ⭐ NOVO: Estado para datas específicas do slot atual
  const [usarDatasEspecificas, setUsarDatasEspecificas] = useState(false);
  const [datasEspecificasInput, setDatasEspecificasInput] = useState('');
  const [datasEspecificasList, setDatasEspecificasList] = useState<string[]>([]);
  // ⭐ NOVO: Estado para horários manuais (avulsos)
  const [usarHorariosManuais, setUsarHorariosManuais] = useState(false);
  const [horarioManualInput, setHorarioManualInput] = useState('');
  const [horariosManuaisList, setHorariosManuaisList] = useState<string[]>([]);
  // Atualiza horários quando a agenda existente carregar
  useEffect(() => {
    if (agendaExistente) {
      if (agendaExistente.horarios && Array.isArray(agendaExistente.horarios)) {
        console.log(
          '✅ [HorariosModal] Carregando horários da agenda:',
          agendaExistente.horarios.length
        );
        setHorarios(agendaExistente.horarios);
      } else {
        setHorarios([]);
      }
    } else {
      setHorarios([]);
    }
  }, [agendaExistente]);
  // ⭐ NOVO: Adicionar data específica à lista
  const handleAddDataEspecifica = () => {
    if (!datasEspecificasInput) return;
    // Datas específicas são exceções absolutas: a regra canônica as aplica
    // independentemente do dia semanal e da recorrência configurados no turno.
    const date = new Date(datasEspecificasInput + 'T12:00:00');
    if (datasEspecificasList.includes(datasEspecificasInput)) {
      toastError('Data duplicada', 'Esta data já foi adicionada');
      return;
    }
    // Valida se não é data passada
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (date < hoje) {
      toastError('Data passada', 'Selecione uma data futura');
      return;
    }
    setDatasEspecificasList((prev) => [...prev, datasEspecificasInput].sort());
    setDatasEspecificasInput('');
  };
  // ⭐ NOVO: Remover data específica
  const handleRemoveDataEspecifica = (data: string) => {
    setDatasEspecificasList((prev) => prev.filter((d) => d !== data));
  };
  // ⭐ NOVO: Adicionar horário manual
  const handleAddHorarioManual = () => {
    if (!horarioManualInput) return;
    if (horariosManuaisList.includes(horarioManualInput)) {
      toastError('Horário duplicado', 'Este horário já foi adicionado');
      return;
    }
    setHorariosManuaisList((prev) => [...prev, horarioManualInput].sort());
    setHorarioManualInput('');
  };
  // ⭐ NOVO: Remover horário manual
  const handleRemoveHorarioManual = (horario: string) => {
    setHorariosManuaisList((prev) => prev.filter((h) => h !== horario));
  };
  const handleAddSlot = () => {
    if (currentSlot.horaInicio >= currentSlot.horaFim) {
      toastError(
        'Horário inválido',
        'A hora de início deve ser anterior à hora de fim'
      );
      return;
    }
    // ⭐ FIX: Prepara o slot — intervalo é OPCIONAL
    const slotParaSalvar: HorarioTrabalho = {
      ...currentSlot
    };
    const temIntervaloInicio =
    currentSlot.intervaloInicio && currentSlot.intervaloInicio.trim() !== '';
    const temIntervaloFim =
    currentSlot.intervaloFim && currentSlot.intervaloFim.trim() !== '';
    if (temIntervaloInicio && temIntervaloFim) {
      const [horaIni, minIni] = currentSlot.horaInicio.split(':').map(Number);
      const [horaFim, minFim] = currentSlot.horaFim.split(':').map(Number);
      const inicioMinutos = horaIni * 60 + minIni;
      const fimMinutos = horaFim * 60 + minFim;
      const [horaIntIni, minIntIni] = currentSlot.intervaloInicio.
      split(':').
      map(Number);
      const [horaIntFim, minIntFim] = currentSlot.intervaloFim.
      split(':').
      map(Number);
      const intervaloIniMinutos = horaIntIni * 60 + minIntIni;
      const intervaloFimMinutos = horaIntFim * 60 + minIntFim;
      if (intervaloIniMinutos >= intervaloFimMinutos) {
        toastError(
          'Intervalo inválido',
          'O início do intervalo deve ser anterior ao fim'
        );
        return;
      }
      // ⭐ FIX: Se intervalo fora do expediente, limpa em vez de bloquear
      if (
      intervaloIniMinutos < inicioMinutos ||
      intervaloFimMinutos > fimMinutos)
      {
        slotParaSalvar.intervaloInicio = '';
        slotParaSalvar.intervaloFim = '';
      }
    } else {
      // Se apenas um campo ou nenhum, limpa ambos
      slotParaSalvar.intervaloInicio = '';
      slotParaSalvar.intervaloFim = '';
    }
    // ⭐ NOVO: Adiciona datas específicas se ativado
    if (usarDatasEspecificas && datasEspecificasList.length > 0) {
      slotParaSalvar.datasEspecificas = [...datasEspecificasList];
    } else {
      delete slotParaSalvar.datasEspecificas;
    }
    // ⭐ NOVO: Adiciona horários manuais se ativado
    if (usarHorariosManuais && horariosManuaisList.length > 0) {
      slotParaSalvar.horariosManuais = [...horariosManuaisList];
    } else {
      delete slotParaSalvar.horariosManuais;
    }
    let novosHorarios = [...horarios];
    if (isEditingSlot && editingIndex !== null) {
      novosHorarios[editingIndex] = slotParaSalvar;
    } else {
      novosHorarios.push(slotParaSalvar);
    }
    setHorarios(novosHorarios.sort((a, b) => a.diaSemana - b.diaSemana));
    setIsEditingSlot(false);
    setEditingIndex(null);
    // ⭐ Reset datas específicas e horários manuais
    setUsarDatasEspecificas(false);
    setDatasEspecificasList([]);
    setDatasEspecificasInput('');
    setUsarHorariosManuais(false);
    setHorariosManuaisList([]);
    setHorarioManualInput('');
    const nextDay = (slotParaSalvar.diaSemana + 1) % 7;
    setCurrentSlot({
      ...slotParaSalvar,
      diaSemana: nextDay
    });
  };
  const handleEditSlot = (slot: HorarioTrabalho, index: number) => {
    setCurrentSlot(slot);
    setIsEditingSlot(true);
    setEditingIndex(index);
    // ⭐ NOVO: Carrega datas específicas ao editar
    if (slot.datasEspecificas && slot.datasEspecificas.length > 0) {
      setUsarDatasEspecificas(true);
      setDatasEspecificasList([...slot.datasEspecificas]);
    } else {
      setUsarDatasEspecificas(false);
      setDatasEspecificasList([]);
    }
    setDatasEspecificasInput('');
    // ⭐ NOVO: Carrega horários manuais ao editar
    if (slot.horariosManuais && slot.horariosManuais.length > 0) {
      setUsarHorariosManuais(true);
      setHorariosManuaisList([...slot.horariosManuais]);
    } else {
      setUsarHorariosManuais(false);
      setHorariosManuaisList([]);
    }
    setHorarioManualInput('');
  };
  const handleRemoveSlot = (index: number) => {
    setHorarios(horarios.filter((_, i) => i !== index));
    if (isEditingSlot && editingIndex === index) {
      setIsEditingSlot(false);
      setEditingIndex(null);
      setCurrentSlot(DEFAULT_HORARIO);
    }
  };
  const handleSave = async () => {
    if (horarios.length === 0) {
      toastError(
        'Agenda vazia',
        'Adicione pelo menos um horário de atendimento'
      );
      return;
    }
    console.log('💾 [HorariosModal] Salvando horários...');
    console.log('   - profissionalId:', profissionalId);
    console.log('   - profissionalNome:', profissionalNome);
    console.log('   - especialidade:', especialidade);
    console.log('   - clinicaId:', clinicaId);
    console.log('   - horarios:', horarios);
    try {
      if (agendaExistente) {
        console.log(
          '📝 [HorariosModal] Atualizando agenda existente:',
          agendaExistente.id
        );
        await updateAgenda(agendaExistente.id, {
          profissionalId,
          profissionalNome,
          especialidade,
          horarios,
          clinicaId
        });
        success(
          'Horários Atualizados',
          `Configuração de ${profissionalNome} salva com sucesso`
        );
      } else {
        console.log('➕ [HorariosModal] Criando nova agenda');
        await addAgenda({
          profissionalId,
          profissionalNome,
          especialidade,
          horarios,
          clinicaId,
          ativo: true
        });
        success(
          'Horários Criados',
          `Configuração de ${profissionalNome} criada com sucesso`
        );
      }
      onClose();
    } catch (err: any) {
      console.error('❌ [HorariosModal] Erro ao salvar:', err);
      toastError('Erro ao salvar', err.message);
    }
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Horários de ${profissionalNome}`}
      size="large">
      
      <div className="space-y-6">
        {/* Info do profissional */}
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm text-teal-900">
            <strong>Profissional:</strong> {profissionalNome} •{' '}
            <strong>Especialidade:</strong>{' '}
            {especialidade === 'medico' ? 'Médico' : 'Dentista'}
          </p>
          <p className="text-xs text-teal-700 mt-1">ID: {profissionalId}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário de Horário */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="p-4 space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-teal-600" />
                  {isEditingSlot ? 'Editar Horário' : 'Adicionar Horário'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select
                    label="Dia da Semana"
                    value={currentSlot.diaSemana.toString()}
                    onChange={(e) => {
                      setCurrentSlot({
                        ...currentSlot,
                        diaSemana: Number(e.target.value)
                      });
                      // ⭐ Limpa datas específicas ao trocar dia da semana
                      if (usarDatasEspecificas) {
                        setDatasEspecificasList([]);
                        setDatasEspecificasInput('');
                      }
                    }}
                    options={DIAS_SEMANA.map((d) => ({
                      value: d.valor.toString(),
                      label: d.nome
                    }))}
                    disabled={isEditingSlot} />
                  

                  <Select
                    label="Repetição"
                    value={currentSlot.recorrencia || 'toda_semana'}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      recorrencia: e.target.value as any
                    })
                    }
                    options={[
                    {
                      value: 'toda_semana',
                      label: 'Toda semana'
                    },
                    {
                      value: 'semana_A',
                      label: 'Semana A (Alternada)'
                    },
                    {
                      value: 'semana_B',
                      label: 'Semana B (Alternada)'
                    }]
                    } />
                  

                  <Select
                    label="Duração Consulta (min)"
                    value={currentSlot.duracaoConsultaPadrao.toString()}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      duracaoConsultaPadrao: Number(e.target.value)
                    })
                    }
                    options={[
                    5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90,
                    120].
                    map((m) => ({
                      value: m.toString(),
                      label: `${m} minutos`
                    }))} />
                  
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input
                    label="Início"
                    type="time"
                    value={currentSlot.horaInicio}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      horaInicio: e.target.value
                    })
                    } />
                  

                  <Input
                    label="Fim"
                    type="time"
                    value={currentSlot.horaFim}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      horaFim: e.target.value
                    })
                    } />
                  

                  <Input
                    label="Início Intervalo"
                    type="time"
                    value={currentSlot.intervaloInicio || ''}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      intervaloInicio: e.target.value
                    })
                    } />
                  

                  <Input
                    label="Fim Intervalo"
                    type="time"
                    value={currentSlot.intervaloFim || ''}
                    onChange={(e) =>
                    setCurrentSlot({
                      ...currentSlot,
                      intervaloFim: e.target.value
                    })
                    } />
                  
                </div>

                {/* ⭐ NOVO: Toggle para datas específicas */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={usarDatasEspecificas}
                        onChange={(e) => {
                          setUsarDatasEspecificas(e.target.checked);
                          if (!e.target.checked) {
                            setDatasEspecificasList([]);
                            setDatasEspecificasInput('');
                          }
                        }}
                        className="sr-only peer" />
                      

                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-700 group-hover:text-teal-700 flex items-center gap-1.5">
                        <CalendarDaysIcon className="w-4 h-4 text-teal-600" />
                        Apenas datas específicas
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Ative para atender apenas nas datas escolhidas. A data
                        específica prevalece sobre o dia semanal e o rodízio
                        A/B.
                      </p>
                    </div>
                  </label>

                  {usarDatasEspecificas &&
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <p className="text-xs text-amber-800 font-medium flex items-center gap-1">
                        <CalendarDaysIcon className="w-3.5 h-3.5" />
                        Adicione as datas em que este turno atenderá. Elas podem
                        ser de qualquer dia da semana e substituem a grade
                        regular.
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                        type="date"
                        value={datasEspecificasInput}
                        onChange={(e) =>
                        setDatasEspecificasInput(e.target.value)
                        }
                        className="flex-1" />
                      

                        <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddDataEspecifica}
                        disabled={!datasEspecificasInput}>
                        
                          <PlusIcon className="w-4 h-4" />
                        </Button>
                      </div>
                      {datasEspecificasList.length > 0 ?
                    <div className="flex flex-wrap gap-1.5">
                          {datasEspecificasList.map((data) =>
                      <span
                        key={data}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-medium text-amber-900">
                        
                              {data.split('-').reverse().join('/')}
                              <button
                          onClick={() => handleRemoveDataEspecifica(data)}
                          className="text-amber-500 hover:text-red-600 transition-colors">
                          
                                <XIcon className="w-3 h-3" />
                              </button>
                            </span>
                      )}
                        </div> :

                    <p className="text-xs text-amber-600 italic">
                          Nenhuma data adicionada. Adicione pelo menos uma data.
                        </p>
                    }
                    </div>
                  }
                </div>

                {/* ⭐ NOVO: Toggle para horários manuais (avulsos) */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={usarHorariosManuais}
                        onChange={(e) => {
                          setUsarHorariosManuais(e.target.checked);
                          if (!e.target.checked) {
                            setHorariosManuaisList([]);
                            setHorarioManualInput('');
                          }
                        }}
                        className="sr-only peer" />
                      

                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-700 group-hover:text-teal-700 flex items-center gap-1.5">
                        <ClockIcon className="w-4 h-4 text-teal-600" />
                        Horários manuais (avulsos)
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Ative para definir horários exatos (ex: 07:30, 08:15) em
                        vez de gerar automaticamente.
                      </p>
                    </div>
                  </label>

                  {usarHorariosManuais &&
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <p className="text-xs text-amber-800 font-medium flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5" />
                        Digite os horários exatos de atendimento:
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                        type="time"
                        value={horarioManualInput}
                        onChange={(e) =>
                        setHorarioManualInput(e.target.value)
                        }
                        className="flex-1" />
                      

                        <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddHorarioManual}
                        disabled={!horarioManualInput}>
                        
                          <PlusIcon className="w-4 h-4" />
                        </Button>
                      </div>
                      {horariosManuaisList.length > 0 ?
                    <div className="flex flex-wrap gap-1.5">
                          {horariosManuaisList.map((hora) =>
                      <span
                        key={hora}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-medium text-amber-900">
                        
                              {hora}
                              <button
                          onClick={() => handleRemoveHorarioManual(hora)}
                          className="text-amber-500 hover:text-red-600 transition-colors">
                          
                                <XIcon className="w-3 h-3" />
                              </button>
                            </span>
                      )}
                        </div> :

                    <p className="text-xs text-amber-600 italic">
                          Nenhum horário adicionado. Adicione pelo menos um
                          horário.
                        </p>
                    }
                    </div>
                  }
                </div>

                <div className="flex justify-end gap-2">
                  {isEditingSlot &&
                  <>
                      <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditingSlot(false);
                        setEditingIndex(null);
                        setCurrentSlot(DEFAULT_HORARIO);
                        setUsarDatasEspecificas(false);
                        setDatasEspecificasList([]);
                        setDatasEspecificasInput('');
                        setUsarHorariosManuais(false);
                        setHorariosManuaisList([]);
                        setHorarioManualInput('');
                      }}>
                      
                        Cancelar
                      </Button>
                      <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Duplica para a semana oposta e mantém em modo de edição
                        // para o usuário ajustar os horários do novo turno
                        setCurrentSlot({
                          ...currentSlot,
                          recorrencia: getRecorrenciaOposta(
                            currentSlot.recorrencia
                          )
                        });
                        setIsEditingSlot(false); // Volta para modo "Adicionar" com os dados copiados
                        setEditingIndex(null);
                        success(
                          'Turno duplicado',
                          'Ajuste os horários e clique em Adicionar'
                        );
                      }}
                      className="text-teal-600 hover:bg-teal-50">
                      
                        Duplicar p/ Semana Oposta
                      </Button>
                    </>
                  }
                  <Button onClick={handleAddSlot} variant="secondary">
                    {isEditingSlot ? 'Atualizar' : 'Adicionar'}
                    <PlusIcon className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Lista de Horários */}
          <div>
            <Card className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                <h3 className="font-semibold text-gray-900">
                  Horários Configurados
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {horarios.length} dias configurados
                </p>
              </div>

              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[400px]">
                {horarios.length === 0 ?
                <div className="text-center py-8 text-gray-400">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Nenhum horário adicionado</p>
                  </div> :

                horarios.map((horario, idx) =>
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${isEditingSlot && editingIndex === idx ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'} transition-colors group relative`}>
                  
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-gray-900 flex items-center flex-wrap gap-1.5">
                          {
                      DIAS_SEMANA.find(
                        (d) => d.valor === horario.diaSemana
                      )?.nome
                      }
                          {horario.recorrencia &&
                      horario.recorrencia !== 'toda_semana' &&
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-full ${horario.recorrencia === 'semana_A' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-purple-100 text-purple-700 border border-purple-200'}`}>
                        
                                {getLabelRecorrencia(horario.recorrencia)}
                              </span>
                      }
                          {horario.datasEspecificas &&
                      horario.datasEspecificas.length > 0 &&
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                <CalendarDaysIcon className="w-3 h-3" />
                                {horario.datasEspecificas.length} data
                                {horario.datasEspecificas.length > 1 ? 's' : ''}
                              </span>
                      }
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                        onClick={() => handleEditSlot(horario, idx)}
                        className="p-1 text-teal-600 hover:bg-teal-100 rounded"
                        title="Editar">
                        
                            <EditIcon className="w-3 h-3" />
                          </button>
                          <button
                        onClick={() => handleRemoveSlot(idx)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                        title="Remover">
                        
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <ClockIcon className="w-3 h-3" />
                          <span>
                            {horario.horaInicio} - {horario.horaFim}
                          </span>
                        </div>
                        {horario.intervaloInicio &&
                    <div className="text-xs text-gray-500 pl-5">
                            Intervalo: {horario.intervaloInicio} -{' '}
                            {horario.intervaloFim}
                          </div>
                    }
                        <div className="text-xs text-teal-600 pl-5 font-medium">
                          {horario.duracaoConsultaPadrao} min / consulta
                        </div>
                        {/* ⭐ NOVO: Mostra datas específicas configuradas */}
                        {horario.datasEspecificas &&
                    horario.datasEspecificas.length > 0 &&
                    <div className="pl-5 mt-1">
                              <p className="text-[10px] text-amber-700 font-medium mb-1">
                                Apenas nestas datas:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {horario.datasEspecificas.map((data) =>
                        <span
                          key={data}
                          className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 font-medium">
                          
                                    {data.split('-').reverse().join('/')}
                                  </span>
                        )}
                              </div>
                            </div>
                    }

                        {/* ⭐ NOVO: Mostra horários manuais configurados */}
                        {horario.horariosManuais &&
                    horario.horariosManuais.length > 0 &&
                    <div className="pl-5 mt-1">
                              <p className="text-[10px] text-amber-700 font-medium mb-1">
                                Horários avulsos:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {horario.horariosManuais.map((hora) =>
                        <span
                          key={hora}
                          className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 font-medium">
                          
                                    {hora}
                                  </span>
                        )}
                              </div>
                            </div>
                    }
                      </div>
                    </div>
                )
                }
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg space-y-3">
                <Button className="w-full" onClick={handleSave}>
                  <SaveIcon className="w-4 h-4 mr-2" />
                  Salvar Configuração
                </Button>
                <Button variant="ghost" className="w-full" onClick={onClose}>
                  Cancelar
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Modal>);

}