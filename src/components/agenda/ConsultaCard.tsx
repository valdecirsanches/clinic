import React, { useState, useRef } from 'react';
import {
  ClockIcon,
  PlusIcon,
  PrinterIcon,
  AlertCircleIcon,
  ZapIcon,
  CheckIcon,
  CarIcon,
  UserCheckIcon,
  XIcon,
  RotateCcwIcon,
  MessageSquareIcon,
  ClipboardListIcon,
  Loader2,
  ReceiptIcon,
  DollarSignIcon,
  LockIcon,
  UnlockIcon } from
'lucide-react';
import { Consulta, Paciente } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { useAniversarioHabilitado } from '../../hooks/useAniversarioHabilitado';
import { Card } from '../ui/Card';
import { EnviarMenuAjudaButton } from '../EnviarMenuAjudaButton';
import { ConversaWhatsAppModal } from './ConversaWhatsAppModal';
import { Swal } from '../ui/SweetAlert';
import {
  salvarReciboNaConsulta,
  consultaTemRecibo } from
'../../utils/reciboRapidoHelper';
// ⭐ FIX vazamento de permissão: esconde "Iniciar atendimento" quando o
// usuário não tem permissão de 'prontuarios'.
import { temPermissao } from '../../utils/permissoes';
// ========== Pure helper functions (duplicated from AgendaPage to avoid editing it) ==========
function isValidHexColor(color: any): boolean {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}
function corValida(cor: any): string {
  return isValidHexColor(cor) ? cor.trim() : '#3B82F6';
}
function corComOpacidade(hexColor: string, opacidade: number): string {
  const cor = corValida(hexColor);
  const r = parseInt(cor.slice(1, 3), 16);
  const g = parseInt(cor.slice(3, 5), 16);
  const b = parseInt(cor.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacidade})`;
}
function corDoStatus(status: string): string {
  const cores: Record<string, string> = {
    agendada: '#FFFFFF',
    aguardando_confirmacao: '#8B5CF6',
    confirmada: '#3B82F6',
    realizada: '#6366F1',
    cancelada: '#DC2626',
    aguardando_remarcacao: '#F97316',
    compareceu: '#22C55E',
    faltou: '#EF4444'
  };
  const statusNormalizado = (status || '').toLowerCase().trim();
  return cores[statusNormalizado] || '#6B7280';
}
function corPrimariaCard(consulta: {
  cor?: string;
  status: string;
  tipoAgendamento?: string;
}): string {
  if (consulta.cor && isValidHexColor(consulta.cor)) {
    return corValida(consulta.cor);
  }
  return corDoStatus(consulta.status);
}
function corContraste(hexColor: string): string {
  const cor = corValida(hexColor);
  const r = parseInt(cor.slice(1, 3), 16);
  const g = parseInt(cor.slice(3, 5), 16);
  const b = parseInt(cor.slice(5, 7), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.55 ? '#000000' : '#FFFFFF';
}
function formatarHoraChegada(horaChegada: string): string {
  if (!horaChegada) return '--:--';
  const d = new Date(horaChegada);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  const match = horaChegada.match(/^(\d{1,2}:\d{2})/);
  if (match) return match[1];
  return horaChegada;
}
function iconeNecessidadeEspecial(necessidade: string | undefined | null): {
  emoji: string;
  label: string;
  cor: string;
} | null {
  if (!necessidade) return null;
  const mapa: Record<
    string,
    {
      emoji: string;
      label: string;
      cor: string;
    }> =
  {
    CRIANÇA: {
      emoji: '👶',
      label: 'Criança',
      cor: '#EC4899'
    },
    IDOSO: {
      emoji: '👴',
      label: 'Idoso',
      cor: '#8B5CF6'
    },
    'NECESSIDADE ESPECIAL': {
      emoji: '♿',
      label: 'Necessidade Especial',
      cor: '#3B82F6'
    },
    'RETORNO CIRURGIA': {
      emoji: '🏥',
      label: 'Retorno de Cirurgia',
      cor: '#EF4444'
    },
    GESTANTE: {
      emoji: '🤰',
      label: 'Gestante',
      cor: '#EC4899'
    },
    CADEIRANTE: {
      emoji: '♿',
      label: 'Cadeirante',
      cor: '#3B82F6'
    },
    'DEFICIENTE VISUAL': {
      emoji: '🦯',
      label: 'Deficiente Visual',
      cor: '#F59E0B'
    },
    'DEFICIENTE AUDITIVO': {
      emoji: '🦻',
      label: 'Deficiente Auditivo',
      cor: '#F97316'
    }
  };
  const upper = necessidade.toUpperCase().trim();
  return (
    mapa[upper] || {
      emoji: '⚠️',
      label: necessidade,
      cor: '#6B7280'
    });

}
function getStatusBadge(status: string, observacoes?: string) {
  let dataHoraConfirmacao = '';
  if (observacoes) {
    const match = observacoes.match(
      /📱 WhatsApp: (?:CONFIRMADO|CANCELADO|REMARCAÇÃO SOLICITADA) em (\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2})/
    );
    if (match) dataHoraConfirmacao = match[1];
  }
  const badges: Record<
    string,
    {
      label: string;
      color: string;
    }> =
  {
    agendada: {
      label: 'Agendada',
      color: 'bg-white text-gray-600 border border-gray-300'
    },
    aguardando_confirmacao: {
      label: '⏳ Aguardando',
      color: 'bg-purple-100 text-purple-800 animate-pulse'
    },
    confirmada: {
      label: dataHoraConfirmacao ?
      `Confirmada ${dataHoraConfirmacao}` :
      'Confirmada',
      color: 'bg-blue-100 text-blue-800'
    },
    realizada: {
      label: 'Realizada',
      color: 'bg-indigo-100 text-indigo-800'
    },
    cancelada: {
      label: dataHoraConfirmacao ?
      `Cancelada ${dataHoraConfirmacao}` :
      'Cancelada',
      color: 'bg-red-200 text-red-900'
    },
    aguardando_remarcacao: {
      label: dataHoraConfirmacao ?
      `Remarcar ${dataHoraConfirmacao}` :
      'Aguardando Remarcação',
      color: 'bg-orange-100 text-orange-800'
    },
    compareceu: {
      label: 'Compareceu',
      color: 'bg-green-100 text-green-800'
    },
    faltou: {
      label: 'Faltou',
      color: 'bg-red-100 text-red-800'
    }
  };
  const badge = badges[status] || badges.agendada;
  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${badge.color}`}>
      
      {badge.label}
    </span>);

}
// ========== Props ==========
export interface ConsultaCardProps {
  consulta: Consulta;
  paciente?: Paciente;
  clinicaId: string;
  clinicaIdEfetivo: string;
  usuarioLogado?: {
    id?: string;
    nome: string;
    tipo: 'super_admin' | 'admin' | 'medico' | 'dentista' | 'atendente';
  };
  recibosEmitidos: Set<string>;
  /** Paciente respondeu e a mensagem ainda não foi aberta. */
  temMensagemNova?: boolean;
  onMensagensLidas?: (pacienteId: string) => void;
  // Encaixe helpers
  encaixeJaExiste: (consultaId: string, nivel: 1 | 2) => boolean;
  calcularDuracoesEncaixe: (profissionalId: string) => {
    duracaoPadrao: number;
    encaixe1: number;
    encaixe2: number;
  };
  // Callbacks
  onEdit: (consulta: Consulta) => void;
  onDoubleClick: (consulta: Consulta) => void;
  onPacienteClick: (pacienteId: string) => void;
  onCriarEncaixeRapido: (consulta: Consulta, nivel: 1 | 2) => void;
  onUpdateConsulta: (id: string, updates: Partial<Consulta>) => void;
  onMarcarChegada: (id: string) => void;
  onConfirmar: (id: string) => void;
  onSolicitarConfirmacao: (id: string) => void;
  onIniciarAtendimento: (consulta: Consulta) => void;
  onMarcarRealizada: (id: string) => void;
  onCancelar: (id: string) => void;
  onSolicitarCancelamento?: (id: string) => void;
  onRestaurar: (id: string) => void;
  onReciboEmitido: (consultaId: string) => void;
  // Toast
  success: (title: string, message: string) => void;
  toastError: (title: string, message: string) => void;
}
export function ConsultaCard({
  consulta,
  paciente,
  clinicaId,
  clinicaIdEfetivo,
  usuarioLogado,
  recibosEmitidos,
  temMensagemNova = false,
  onMensagensLidas,
  encaixeJaExiste,
  calcularDuracoesEncaixe,
  onEdit,
  onDoubleClick,
  onPacienteClick,
  onCriarEncaixeRapido,
  onUpdateConsulta,
  onMarcarChegada,
  onConfirmar,
  onSolicitarConfirmacao,
  onIniciarAtendimento,
  onMarcarRealizada,
  onCancelar,
  onSolicitarCancelamento,
  onRestaurar,
  onReciboEmitido,
  success,
  toastError
}: ConsultaCardProps) {
  // ⭐ LOCAL state — this is the key performance win.
  // When this card opens its dropdown/popover, ONLY this card re-renders.
  const [expandedPhoto, setExpandedPhoto] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [reciboAberto, setReciboAberto] = useState(false);
  const [reciboValor, setReciboValor] = useState('');
  const [reciboLoading, setReciboLoading] = useState(false);
  const [isConversaOpen, setIsConversaOpen] = useState(false);
  const reciboInputRef = useRef<HTMLInputElement>(null);
  const isPlaceholder =
  consulta.pacienteId === 'disponivel' || consulta.pacienteId === 'livre';
  const isBloqueado = consulta.pacienteId === 'bloqueado';
  // A agenda principal recebe pacientes=[] para manter a carga leve. Por isso,
  // todo recurso do card deve usar os campos unidos da consulta como fallback.
  const dadosConsulta = consulta as Consulta & {
    pacienteEmpresaNome?: string;
    profissionalNome?: string;
  };
  const telPaciente =
  paciente?.telefone ||
  paciente?.celular ||
  consulta.whatsappTelefone ||
  consulta.pacienteTelefone ||
  '';
  const dataNascimentoPaciente =
  paciente?.dataNascimento || consulta.pacienteDataNascimento || '';
  // ⭐ Felicitação desligada nas Configurações => nem oferece o botão.
  const aniversarioHabilitado = useAniversarioHabilitado(clinicaId);
  // ⭐ Paciente que optou por não receber felicitação.
  const pacienteAceitaFelicitacao =
  (paciente as any)?.felicitarAniversario !== 0 &&
  (consulta as any)?.pacienteFelicitarAniversario !== 0;
  const convenioPaciente =
  paciente?.convenioNome ||
  consulta.pacienteConvenioNome ||
  paciente?.convenio ||
  consulta.pacienteConvenio ||
  '';
  const empresaPaciente =
  (paciente as any)?.empresaNome || dadosConsulta.pacienteEmpresaNome || '';
  const necessidadePaciente =
  paciente?.necessidadeEspecial || consulta.pacienteNecessidadeEspecial;
  const nomeProfissional =
  dadosConsulta.profissionalNome ||
  consulta.profissionalNomeJoin ||
  consulta.profissional ||
  'Profissional não informado';
  const temTelefone =
  !isPlaceholder && telPaciente.replace(/\D/g, '').length >= 10;
  const corCard = corPrimariaCard(consulta);
  // Photo URL resolution
  const rawFotoUrl = consulta.pacienteFotoUrl || paciente?.fotoUrl || null;
  const fotoSrc = rawFotoUrl ?
  rawFotoUrl.startsWith('/uploads') ?
  `${API_BASE_URL}${rawFotoUrl}` :
  rawFotoUrl :
  null;
  return (
    <Card
      className={`hover:shadow-md transition-all cursor-pointer ${isBloqueado ? 'bg-red-50/50 border-red-200 border-dashed opacity-70' : isPlaceholder ? 'bg-gray-50 border-dashed' : 'agenda-card-gradient'} ${consulta.tipoAgendamento === 'encaixe' ? 'border-l-4' : ''}`}
      style={
      !isPlaceholder ?
      {
        background: `linear-gradient(90deg, ${corComOpacidade(corCard, 0.22)} 0%, ${corComOpacidade(corCard, 0.1)} 25%, ${corComOpacidade(corCard, 0.04)} 50%, white 80%)`,
        borderLeftColor:
        consulta.tipoAgendamento === 'encaixe' ? corCard : undefined
      } :
      undefined
      }
      data-consulta-horario={consulta.horario}
      onDoubleClick={() => !isBloqueado && onDoubleClick(consulta)}>
      
      <div className="flex items-center gap-3">
        {/* Indicador de Cor */}
        {!isPlaceholder &&
        <div
          className="w-1.5 self-stretch rounded-full flex-shrink-0"
          style={{
            backgroundColor: corCard
          }}
          title={consulta.status} />

        }

        {/* Foto de perfil */}
        {!isPlaceholder &&
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpandedPhoto(!expandedPhoto);
          }}
          className="flex-shrink-0 rounded-full overflow-hidden border border-gray-200 hover:border-teal-400 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-300"
          style={{
            width: expandedPhoto ? 160 : 28,
            height: expandedPhoto ? 160 : 28,
            minWidth: expandedPhoto ? 160 : 28
          }}
          title={
          expandedPhoto ?
          'Recolher foto' :
          fotoSrc ?
          'Ampliar foto' :
          'Sem foto'
          }>
          
            {fotoSrc ?
          <img
            src={fotoSrc}
            alt={consulta.pacienteNome}
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }} /> :

          null}
            <div
            className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400"
            style={{
              display: fotoSrc ? 'none' : 'flex'
            }}>
            
              <UserCheckIcon
              className={expandedPhoto ? 'w-8 h-8' : 'w-3.5 h-3.5'} />
            
            </div>
          </button>
        }

        {/* Info do paciente */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isBloqueado ?
            <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-red-100 border border-red-300 flex items-center justify-center flex-shrink-0">
                  <LockIcon className="w-3.5 h-3.5 text-red-500" />
                </span>
                <span className="text-sm font-semibold text-red-400 line-through">
                  BLOQUEADO
                </span>
                <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const result = await Swal.fire({
                    icon: 'question',
                    title: 'Desbloquear horário?',
                    text: `Deseja liberar o horário ${consulta.horario} para agendamentos?`,
                    showCancelButton: true,
                    confirmButtonText: 'Sim, desbloquear',
                    cancelButtonText: 'Não',
                    confirmButtonColor: '#0d9488'
                  });
                  if (!result.isConfirmed) return;
                  onUpdateConsulta(consulta.id, {
                    pacienteId: 'disponivel',
                    pacienteNome: 'Disponível',
                    status: 'agendada'
                  } as any);
                }}
                className="ml-2 text-xs text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded transition-colors"
                title="Desbloquear este horário">
                
                  <UnlockIcon className="w-3 h-3 inline mr-1" />
                  Desbloquear
                </button>
              </div> :
            isPlaceholder ?
            <div className="flex items-center gap-2">
                <button
                onClick={() => onEdit(consulta)}
                className="text-sm font-medium text-gray-500 hover:text-teal-600 transition-colors truncate flex items-center gap-2">
                
                  <span className="w-6 h-6 rounded-full bg-teal-100 border border-teal-300 flex items-center justify-center flex-shrink-0">
                    <PlusIcon className="w-4 h-4 text-teal-600" />
                  </span>
                  <span className="font-semibold text-gray-600">
                    {consulta.pacienteNome}
                  </span>
                </button>
                <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateConsulta(consulta.id, {
                    pacienteId: 'bloqueado',
                    pacienteNome: 'BLOQUEADO',
                    status: 'bloqueado'
                  } as any);
                }}
                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors"
                title="Bloquear este horário">
                
                  <LockIcon className="w-3 h-3" />
                </button>
              </div> :

            <button
              onClick={() => onPacienteClick(consulta.pacienteId)}
              className="text-sm font-semibold text-gray-900 hover:text-teal-600 transition-colors border-b border-dotted border-gray-400 hover:border-teal-600 truncate flex items-center gap-1"
              title="Clique para abrir a ficha completa do paciente">
              
                <UserCheckIcon className="w-3.5 h-3.5 text-teal-600" />
                {consulta.pacienteNome}
                {consulta.pacienteId &&
              consulta.pacienteId !== 'disponivel' &&
              consulta.pacienteId !== 'livre' &&
              <span className="text-xs text-gray-400 font-normal ml-1">
                      #
                      {(consulta as any).pacienteNumeroContrato ||
                paciente?.numeroContrato ||
                consulta.pacienteId}
                    </span>
              }
                {consulta.pacienteId &&
              consulta.pacienteId !== 'disponivel' &&
              consulta.pacienteId !== 'livre' &&
              (() => {
                // A relação titular/dependente é definida exclusivamente pelo
                // vínculo cadastral titularId. Parentesco importado é apenas
                // informativo e nunca pode reclassificar um titular como DP.
                const ehDependente = Boolean(
                  (consulta as any).pacienteTitularId ||
                  (paciente as any)?.titularId
                );
                return (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${ehDependente ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-teal-100 text-teal-700 border border-teal-200'}`}
                    title={ehDependente ? 'Dependente' : 'Titular'}>
                    
                        {ehDependente ? 'DP' : 'TT'}
                      </span>);

              })()}
                {(() => {
                const necessidade =
                iconeNecessidadeEspecial(necessidadePaciente);
                if (!necessidade) return null;
                return (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0 font-bold"
                    title={necessidade.label}
                    style={{
                      fontSize: '11px',
                      backgroundColor: `${necessidade.cor}15`,
                      color: necessidade.cor,
                      border: `1.5px solid ${necessidade.cor}40`
                    }}>
                    
                      <span
                      style={{
                        fontSize: '16px',
                        lineHeight: 1
                      }}>
                      
                        {necessidade.emoji}
                      </span>
                      <span className="uppercase tracking-wide">
                        {necessidade.label}
                      </span>
                    </span>);

              })()}
              </button>
            }
            {consulta.tipoAgendamento === 'encaixe' &&
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full flex-shrink-0"
              style={{
                backgroundColor: `${corCard}20`,
                color: corCard
              }}>
              
                <ZapIcon className="w-2.5 h-2.5" />
                ENCAIXE
              </span>
            }
          </div>

          {/* Info line */}
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            {(() => {
              return (
                <span
                  className="inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-extrabold rounded-md tracking-wide shadow-sm"
                  style={{
                    backgroundColor: corCard,
                    color: corContraste(corCard)
                  }}>
                  
                  <ClockIcon className="w-3 h-3 mr-1" />
                  {consulta.horario}
                </span>);

            })()}
            <span>•</span>
            <span>{consulta.duracao}min</span>
            {((consulta as any).procedimento ||
            consulta.procedimentoNomeJoin ||
            consulta.procedimentoNome) &&
            <>
                <span>•</span>
                <span className="text-teal-700 font-semibold">
                  📋{' '}
                  {(consulta as any).procedimento ||
                consulta.procedimentoNomeJoin ||
                consulta.procedimentoNome}
                  {consulta.procedimentoAnotacoes &&
                <span className="font-normal italic text-teal-600">
                      {' '}
                      - {consulta.procedimentoAnotacoes}
                    </span>
                }
                </span>
              </>
            }
            <span>•</span>
            <span>
              {consulta.tipo === 'medica' ? '🩺' : '🦷'}{' '}
              {consulta.profissionalTitulo || 'Dr(a).'} {nomeProfissional}
            </span>
            {convenioPaciente &&
            <>
                <span>•</span>
                <span className="text-indigo-600">🏥 {convenioPaciente}</span>
              </>
            }
            {empresaPaciente &&
            <>
                <span>•</span>
                <span
                className="text-amber-700 truncate max-w-[160px]"
                title={empresaPaciente}>
                
                  🏢 {empresaPaciente}
                </span>
              </>
            }
            {telPaciente &&
            <>
                <span>•</span>
                <span>📞 {telPaciente}</span>
              </>
            }
            {!temTelefone && !isPlaceholder &&
            <span className="text-red-600 inline-flex items-center gap-0.5">
                <AlertCircleIcon className="w-3 h-3" />
                Sem tel
              </span>
            }
            {(consulta as any).confirmacaoRecebidaEm &&
            <>
                <span>•</span>
                <span className="text-green-700 bg-green-50 rounded px-1 py-0.5 inline-flex items-center gap-0.5 border border-green-100">
                  <CheckIcon className="w-3 h-3" />
                  Conf.{' '}
                  {formatarHoraChegada((consulta as any).confirmacaoRecebidaEm)}
                </span>
              </>
            }
            {consulta.horaChegada &&
            <>
                <span>•</span>
                <span className="text-purple-700 bg-purple-50 rounded px-1 py-0.5 inline-flex items-center gap-0.5 border border-purple-100">
                  <ClockIcon className="w-3 h-3" />
                  Chegou {formatarHoraChegada(consulta.horaChegada)}
                </span>
              </>
            }
            {(recibosEmitidos.has(consulta.id) ||
            consultaTemRecibo(consulta.observacoes)) &&
            <>
                <span>•</span>
                <span className="text-emerald-700 bg-emerald-50 rounded px-1 py-0.5 inline-flex items-center gap-0.5 border border-emerald-200 font-semibold">
                  <ReceiptIcon className="w-3 h-3" />
                  Recibo ✓
                </span>
              </>
            }
          </p>

          {/* Placeholder hint */}
          {isPlaceholder &&
          <p className="text-[10px] text-gray-400 mt-0.5 italic">
              Horário livre — clique para agendar um paciente
            </p>
          }

          {/* Observações e cancelamento */}
          {(() => {
            const isCancelada = consulta.status === 'cancelada';
            // Data/hora do cancelamento: usa os campos dedicados; se não vierem
            // (registros antigos), tenta extrair do texto de observações, onde
            // sempre gravamos "CANCELADO em DD/MM/AAAA às HH:MM".
            let dataHoraCancel = '';
            if (consulta.dataCancelamento || consulta.horaCancelamento) {
              const dataFmt = consulta.dataCancelamento ?
              consulta.dataCancelamento.includes('-') ?
              consulta.dataCancelamento.split('-').reverse().join('/') :
              consulta.dataCancelamento :
              '';
              dataHoraCancel = [
              dataFmt,
              consulta.horaCancelamento ?
              `às ${consulta.horaCancelamento}` :
              ''].

              filter(Boolean).
              join(' ');
            } else if (isCancelada && consulta.observacoes) {
              const m = consulta.observacoes.match(
                /CANCELADO em\s+([\d/]+\s+às\s+[\d:]+)/i
              );
              if (m) dataHoraCancel = m[1];
            }
            // ⭐ FALLBACK FINAL (sem depender do backend): no cancelamento via
            // WhatsApp o servidor grava o INSTANTE do cancelamento em
            // `confirmacaoRecebidaEm` (é o "Conf. HH:MM" do card). Se as colunas
            // dedicadas e o texto de observações não trouxeram a data/hora, usamos
            // esse timestamp — que SEMPRE chega ao front — como data/hora do
            // cancelamento. Assim o card exibe "em: DD/MM/AAAA às HH:MM" mesmo em
            // registros antigos ou quando o backend ainda não foi reiniciado.
            if (!dataHoraCancel && isCancelada) {
              const rawConf = (consulta as any).confirmacaoRecebidaEm;
              if (rawConf) {
                const d = new Date(rawConf);
                if (!isNaN(d.getTime())) {
                  const dd = String(d.getDate()).padStart(2, '0');
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const yyyy = d.getFullYear();
                  const hh = String(d.getHours()).padStart(2, '0');
                  const min = String(d.getMinutes()).padStart(2, '0');
                  dataHoraCancel = `${dd}/${mm}/${yyyy} às ${hh}:${min}`;
                }
              }
            }
            // ⭐ Mostra o bloco de cancelamento quando a consulta está cancelada
            // e há motivo OU data/hora. Cancelamento via WhatsApp grava a data/hora
            // imediatamente, mas o motivo chega em uma segunda mensagem — então o
            // bloco NÃO pode depender só do motivo, senão a data/hora não aparece.
            const temBlocoCancel =
            isCancelada && (
            !!consulta.motivoCancelamento ||
            !!dataHoraCancel ||
            !!consulta.canalCancelamento ||
            !!consulta.canceladoPor);
            // Canal e responsável do cancelamento. Se não vierem persistidos
            // (registros antigos), inferimos WhatsApp/Paciente quando o texto de
            // observações traz o marcador de cancelamento via WhatsApp.
            const veioDoWhatsApp =
            /WhatsApp|CANCELADO em/i.test(consulta.observacoes || '') ||
            !!dataHoraCancel;
            const canalCancel =
            consulta.canalCancelamento || (veioDoWhatsApp ? 'WhatsApp' : '');
            const responsavelCancel =
            consulta.canceladoPor || (
            canalCancel === 'WhatsApp' ? 'Paciente' : '');
            if (!consulta.observacoes && !temBlocoCancel) return null;
            return (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs">
                {consulta.observacoes &&
                <span
                  className="text-gray-500 truncate max-w-[200px]"
                  title={consulta.observacoes}>
                  
                    📋 {consulta.observacoes}
                  </span>
                }
                {temBlocoCancel &&
                <span className="text-red-700 bg-red-50 rounded px-2 py-1 border border-red-200 flex items-center gap-x-2 gap-y-0.5 flex-wrap leading-relaxed">
                    <span className="font-semibold whitespace-nowrap">
                      ❌ Cancelada
                      {dataHoraCancel ? ` em: ${dataHoraCancel}` : ''}
                    </span>
                    {canalCancel &&
                  <span className="whitespace-nowrap">
                        📱 Via: {canalCancel}
                      </span>
                  }
                    {responsavelCancel &&
                  <span className="whitespace-nowrap">
                        👤 Cancelado por: {responsavelCancel}
                      </span>
                  }
                    {consulta.motivoCancelamento &&
                  <span
                    className="truncate max-w-[220px]"
                    title={consulta.motivoCancelamento}>
                    
                        📝 Motivo: {consulta.motivoCancelamento}
                      </span>
                  }
                  </span>
                }
                {isCancelada && consulta.taxaCancelamento &&
                <span
                  className={`rounded px-1.5 py-0.5 border whitespace-nowrap ${/FORA DO PRAZO|Taxa/i.test(consulta.taxaCancelamento) ? 'text-amber-800 bg-amber-50 border-amber-300' : 'text-green-700 bg-green-50 border-green-200'}`}
                  title={consulta.taxaCancelamento}>
                  
                    💰 {consulta.taxaCancelamento}
                  </span>
                }
              </div>);

          })()}
        </div>

        {/* Botões de Encaixe Rápido */}
        {!isPlaceholder &&
        consulta.tipoAgendamento !== 'encaixe' &&
        consulta.status !== 'cancelada' &&
        consulta.pacienteId !== 'disponivel' &&
        consulta.pacienteId !== 'livre' &&
        <>
              <button
            onClick={(e) => {
              e.stopPropagation();
              onCriarEncaixeRapido(consulta, 1);
            }}
            disabled={encaixeJaExiste(consulta.id, 1)}
            title={
            encaixeJaExiste(consulta.id, 1) ?
            '1º Encaixe já criado (exclua-o para liberar)' :
            `Criar 1º Encaixe (${calcularDuracoesEncaixe(consulta.profissionalId || '').encaixe1} min - 50% da consulta)`
            }
            className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold transition-all ${encaixeJaExiste(consulta.id, 1) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600 hover:scale-110 active:scale-95'}`}>
            
                {encaixeJaExiste(consulta.id, 1) ? '✓' : 'E1'}
              </button>
              <button
            onClick={(e) => {
              e.stopPropagation();
              onCriarEncaixeRapido(consulta, 2);
            }}
            disabled={encaixeJaExiste(consulta.id, 2)}
            title={
            encaixeJaExiste(consulta.id, 2) ?
            '2º Encaixe já criado (exclua-o para liberar)' :
            `Criar 2º Encaixe (${calcularDuracoesEncaixe(consulta.profissionalId || '').encaixe2} min - 25% da consulta)`
            }
            className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold transition-all ${encaixeJaExiste(consulta.id, 2) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600 hover:scale-110 active:scale-95'}`}>
            
                {encaixeJaExiste(consulta.id, 2) ? '✓' : 'E2'}
              </button>
            </>
        }

        {/* Status Badge + Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Botão de Felicitação de Aniversário */}
          {!isPlaceholder &&
          aniversarioHabilitado &&
          pacienteAceitaFelicitacao &&
          (() => {
            const dn = dataNascimentoPaciente;
            if (!dn) return null;
            const hoje = new Date();
            const mesHoje = hoje.getMonth() + 1;
            const diaHoje = hoje.getDate();
            let mesNasc = 0,
              diaNasc = 0;
            if (dn.includes('-') && dn.length >= 10) {
              mesNasc = parseInt(dn.substring(5, 7), 10);
              diaNasc = parseInt(dn.substring(8, 10), 10);
            } else if (dn.includes('/') && dn.length >= 10) {
              diaNasc = parseInt(dn.substring(0, 2), 10);
              mesNasc = parseInt(dn.substring(3, 5), 10);
            }
            if (mesNasc !== mesHoje || diaNasc !== diaHoje) return null;
            return (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const tel = telPaciente;
                  if (!tel) {
                    toastError(
                      'Sem Telefone',
                      'Paciente sem telefone cadastrado'
                    );
                    return;
                  }
                  try {
                    const resp = await fetch(
                      `${API_BASE_URL}/api/aniversarios/enviar`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          clinicaId,
                          pacienteId: consulta.pacienteId,
                          pacienteNome: consulta.pacienteNome,
                          telefone: tel
                        })
                      }
                    );
                    const result = await resp.json();
                    // Envio recusado por regra (desativado / opt-out / já
                    // enviado): NÃO é sucesso — dizer "enviada" seria mentira.
                    if (result.skipped) {
                      toastError(
                        'Felicitação não enviada',
                        result.message ||
                        'O envio de felicitação está desativado.'
                      );
                    } else if (result.success) {
                      success(
                        'Felicitação Enviada! 🎂',
                        `Mensagem de aniversário enviada para ${consulta.pacienteNome}`
                      );
                    } else {
                      toastError(
                        'Erro ao Enviar',
                        result.error || 'Falha ao enviar felicitação'
                      );
                    }
                  } catch (err: any) {
                    toastError(
                      'Erro ao Enviar',
                      'Erro ao enviar felicitação: ' + err.message
                    );
                  }
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-pink-100 hover:bg-pink-200 border border-pink-300 transition-all hover:scale-110 active:scale-95"
                title={`🎂 Hoje é aniversário de ${consulta.pacienteNome}! Clique para enviar felicitação via WhatsApp`}>
                
                  <span
                  style={{
                    fontSize: '14px'
                  }}>
                  
                    🎂
                  </span>
                </button>);

          })()}

          {/* Status Badge */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isPlaceholder) setStatusDropdownOpen(!statusDropdownOpen);
              }}
              className={`cursor-pointer ${!isPlaceholder ? 'hover:opacity-80' : ''}`}
              title={!isPlaceholder ? 'Clique para alterar o status' : ''}>
              
              {getStatusBadge(consulta.status, consulta.observacoes)}
            </button>

            {/* Dropdown de mudança de status */}
            {!isPlaceholder && statusDropdownOpen &&
            <>
                <div
                className="fixed inset-0 z-[5]"
                onClick={() => setStatusDropdownOpen(false)} />
              

                <div className="absolute right-0 top-full mt-1 z-10">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[180px]">
                    <p className="text-xs text-gray-500 mb-2 px-2 font-medium">
                      Alterar status para:
                    </p>
                    {[
                  {
                    status: 'agendada',
                    label: 'Agendada',
                    dotColor: 'bg-white border border-gray-400',
                    hoverBg: 'hover:bg-gray-100',
                    activeBg: 'bg-gray-100',
                    checkColor: 'text-gray-500'
                  },
                  {
                    status: 'aguardando_confirmacao',
                    label: '⏳ Aguardando',
                    dotColor: 'bg-purple-500 animate-pulse',
                    hoverBg: 'hover:bg-purple-50',
                    activeBg: 'bg-purple-50',
                    checkColor: 'text-purple-600'
                  },
                  {
                    status: 'confirmada',
                    label: 'Confirmada',
                    dotColor: 'bg-blue-500',
                    hoverBg: 'hover:bg-blue-50',
                    activeBg: 'bg-blue-50',
                    checkColor: 'text-blue-600'
                  },
                  {
                    status: 'realizada',
                    label: 'Realizada',
                    dotColor: 'bg-indigo-500',
                    hoverBg: 'hover:bg-indigo-50',
                    activeBg: 'bg-indigo-50',
                    checkColor: 'text-indigo-600'
                  },
                  {
                    status: 'cancelada',
                    label: 'Cancelada',
                    dotColor: 'bg-red-500',
                    hoverBg: 'hover:bg-red-50',
                    activeBg: 'bg-red-50',
                    checkColor: 'text-red-600'
                  },
                  {
                    status: 'compareceu',
                    label: 'Compareceu',
                    dotColor: 'bg-green-500',
                    hoverBg: 'hover:bg-green-50',
                    activeBg: 'bg-green-50',
                    checkColor: 'text-green-600'
                  },
                  {
                    status: 'faltou',
                    label: 'Faltou',
                    dotColor: 'bg-red-500',
                    hoverBg: 'hover:bg-red-50',
                    activeBg: 'bg-red-50',
                    checkColor: 'text-red-600'
                  },
                  {
                    status: 'aguardando_remarcacao',
                    label: 'Remarcar',
                    dotColor: 'bg-orange-500',
                    hoverBg: 'hover:bg-orange-50',
                    activeBg: 'bg-orange-50',
                    checkColor: 'text-orange-600'
                  }].
                  map((item) =>
                  <button
                    key={item.status}
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatusDropdownOpen(false);
                      if (item.status === 'cancelada') {
                        if (onSolicitarCancelamento) {
                          onSolicitarCancelamento(consulta.id);
                        }
                      } else {
                        onUpdateConsulta(consulta.id, {
                          status: item.status as any
                        });
                        success(
                          'Status Alterado',
                          `Consulta marcada como ${item.label}`
                        );
                      }
                    }}
                    className={`w-full text-left px-3 py-2 text-sm ${item.hoverBg} rounded flex items-center gap-2 ${consulta.status === item.status ? `${item.activeBg} font-medium` : ''}`}>
                    
                        <span
                      className={`w-2 h-2 rounded-full ${item.dotColor}`}>
                    </span>
                        {item.label}
                        {consulta.status === item.status &&
                    <span className={`ml-auto ${item.checkColor}`}>
                            ✓
                          </span>
                    }
                      </button>
                  )}
                  </div>
                </div>
              </>
            }
          </div>

          {/* Separador visual */}
          <div className="w-px h-5 bg-gray-200 mx-0.5"></div>

          {/* Editar */}
          <button
            onClick={() => onEdit(consulta)}
            title={isPlaceholder ? 'Preencher horário' : 'Editar consulta'}
            className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors">
            
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor">
              
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              
            </svg>
          </button>

          {/* Marcar Chegada */}
          {!isPlaceholder &&
          consulta.status !== 'cancelada' &&
          consulta.pacienteId !== 'disponivel' &&
          consulta.pacienteId !== 'livre' &&
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarcarChegada(consulta.id);
            }}
            title={
            consulta.horaChegada ?
            `Chegou às ${formatarHoraChegada(consulta.horaChegada)} — clique para cancelar` :
            'Marcar chegada do paciente'
            }
            className={`p-1.5 rounded transition-colors ${consulta.horaChegada ? 'text-purple-600 hover:bg-purple-50' : 'text-orange-500 hover:bg-orange-50'}`}>
            
                <CarIcon className="w-4 h-4" />
              </button>
          }

          {/* Confirmar / Solicitar confirmação */}
          {!isPlaceholder && consulta.status === 'agendada' &&
          <>
              <button
              onClick={() => onConfirmar(consulta.id)}
              title="Confirmar"
              className="p-1.5 rounded text-green-700 hover:bg-green-50 transition-colors">
              
                <CheckIcon className="w-4 h-4" />
              </button>
              <button
              onClick={() => onSolicitarConfirmacao(consulta.id)}
              title="Solicitar confirmação via WhatsApp"
              className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors">
              
                <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor">
                
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </button>
            </>
          }

          {/* Conversa livre pelo número oficial (Meta) */}
          {!isPlaceholder &&
          <button
            onClick={() => {
              setIsConversaOpen(true);
              onMensagensLidas?.(consulta.pacienteId);
            }}
            title={
            temMensagemNova ?
            'Nova mensagem do paciente — clique para ler' :
            'Ver mensagens e conversar com o paciente'
            }
            className={`relative p-1.5 rounded transition-colors ${
            temMensagemNova ?
            'bg-emerald-100 text-emerald-800 animate-pulse motion-reduce:animate-none' :
            'text-emerald-700 hover:bg-emerald-50'}`
            }>
            
              <MessageSquareIcon className="w-4 h-4" />
              {temMensagemNova &&
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />

            }
              {temMensagemNova &&
            <span className="sr-only">Nova mensagem recebida</span>
            }
            </button>
          }

          {/* Enviar Menu de Ajuda */}
          {!isPlaceholder && consulta.status !== 'cancelada' &&
          <EnviarMenuAjudaButton
            pacienteId={consulta.pacienteId}
            pacienteNome={consulta.pacienteNome}
            pacienteTelefone={telPaciente}
            clinicaId={clinicaIdEfetivo}
            pacienteFotoUrl={rawFotoUrl || undefined}
            iconOnly />

          }

          {/* Imprimir Aviso de Consulta */}
          {!isPlaceholder &&
          consulta.status !== 'cancelada' &&
          consulta.pacienteId !== 'disponivel' &&
          consulta.pacienteId !== 'livre' &&
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const sessao = localStorage.getItem('sessao');
              const parsed = sessao ? JSON.parse(sessao) : {};
              const clinicaAtual = parsed.clinicaAtual || {};
              const usuario = parsed.usuario || {};
              const agora = new Date();
              const dataFormatadaAviso = agora.toLocaleDateString('pt-BR');
              const horaFormatada = agora.toLocaleTimeString('pt-BR');
              const dadosImpressao = [
              `<acao>TICKET</acao>`,
              `<id_printserver>${Date.now()}</id_printserver>`,
              `<clinica>${clinicaAtual.id || clinicaIdEfetivo || ''}</clinica>`,
              `<contrato>${consulta.pacienteId || ''}</contrato>`,
              `<matricula>${(consulta as any)?.pacienteMatricula || (paciente as any)?.matricula || ''}</matricula>`,
              `<data>${consulta.data ? new Date(consulta.data + 'T12:00:00').toLocaleDateString('pt-BR') : dataFormatadaAviso}</data>`,
              `<hora>${consulta.horario || ''}</hora>`,
              `<dentista_nome>${consulta.profissionalTitulo || 'Dr(a).'} ${nomeProfissional}</dentista_nome>`,
              `<dt>${dataFormatadaAviso}</dt>`,
              `<hr>${horaFormatada}</hr>`,
              `<titulo>Aviso de consulta/${clinicaAtual.cidade || clinicaAtual.nome || ''}</titulo>`,
              `<procedimento>${(consulta as any).procedimentoNomeJoin || (consulta as any).procedimentoNome || consulta.tipo || ''}</procedimento>`,
              `<empresa_nome>${clinicaAtual.razaoSocial || clinicaAtual.nome || ''}</empresa_nome>`,
              `<login>${usuario.nome || ''}</login>`,
              `<clinica_fone>${clinicaAtual.telefone || ''}</clinica_fone>`,
              `<nome>${consulta.pacienteNome || ''}</nome>`,
              `<nome_titular>${consulta.pacienteNome || ''}</nome_titular>`,
              `<nome_paciente>${consulta.pacienteNome || ''}</nome_paciente>`,
              `<valor>0,00</valor>`];

              try {
                const psClientId = clinicaAtual.id || clinicaIdEfetivo || '';
                const resp = await fetch(
                  `${API_BASE_URL}/api/printserver/imprimir`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      clientId: psClientId,
                      clinicaId: clinicaIdEfetivo || clinicaAtual.id || '',
                      dados: dadosImpressao,
                      enqueue: true
                    })
                  }
                );
                if (resp.ok) {
                  const result = await resp.json();
                  Swal.fire({
                    icon: 'success',
                    title: 'Aviso enviado!',
                    html: `<p>Aviso de consulta enviado para a impressora.</p><p class="text-sm text-gray-500 mt-1">Job: ${result.jobId || 'N/A'}</p>`,
                    timer: 3000,
                    showConfirmButton: false
                  });
                } else {
                  const err = await resp.json();
                  throw new Error(
                    err.message || err.error || 'Erro ao imprimir'
                  );
                }
              } catch (err: any) {
                console.error('Erro ao imprimir aviso:', err);
                Swal.fire({
                  icon: 'error',
                  title: 'Erro na impressão',
                  html: `<p>Não foi possível enviar o aviso.</p><p class="text-sm text-gray-500 mt-2">${err.message || 'PrintServer pode estar desconectado.'}</p>`,
                  confirmButtonColor: '#14b8a6'
                });
              }
            }}
            title="Imprimir aviso de consulta via PrintServer"
            className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors">
            
                <PrinterIcon className="w-4 h-4" />
              </button>
          }

          {/* Recibo Rápido */}
          {!isPlaceholder &&
          consulta.status !== 'cancelada' &&
          consulta.pacienteId !== 'disponivel' &&
          consulta.pacienteId !== 'livre' &&
          <div className="relative">
                <button
              onClick={(e) => {
                e.stopPropagation();
                if (reciboAberto) {
                  setReciboAberto(false);
                  setReciboValor('');
                } else {
                  setReciboAberto(true);
                  setReciboValor(
                    (consulta as any).valor > 0 ?
                    String((consulta as any).valor) :
                    ''
                  );
                  setTimeout(() => reciboInputRef.current?.focus(), 100);
                }
              }}
              title={
              recibosEmitidos.has(consulta.id) ||
              consultaTemRecibo(consulta.observacoes) ?
              'Recibo já emitido ✓ — clique para emitir outro' :
              'Emitir recibo rápido'
              }
              className={`p-1.5 rounded transition-all ${recibosEmitidos.has(consulta.id) || consultaTemRecibo(consulta.observacoes) ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200 ring-1 ring-emerald-300' : 'text-emerald-600 hover:bg-emerald-50'}`}>
              
                  <ReceiptIcon className="w-4 h-4" />
                </button>

                {/* Popover do Recibo Rápido */}
                {reciboAberto &&
            <>
                    <div
                className="fixed inset-0 z-[5]"
                onClick={() => {
                  setReciboAberto(false);
                  setReciboValor('');
                }} />
              

                    <div className="absolute right-0 top-full mt-1 z-10 animate-in slide-in-from-top-2 fade-in duration-150">
                      <div className="bg-white border border-emerald-200 rounded-xl shadow-xl p-4 min-w-[260px]">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <ReceiptIcon className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              Recibo Rápido
                            </p>
                            <p className="text-[10px] text-gray-500 truncate max-w-[180px]">
                              {consulta.pacienteNome}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1.5 flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                            <DollarSignIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span className="text-sm text-gray-400 font-medium">
                              R$
                            </span>
                            <input
                        ref={reciboInputRef}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={reciboValor}
                        onChange={(e) => setReciboValor(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                          e.key === 'Enter' &&
                          reciboValor &&
                          parseFloat(reciboValor) > 0)
                          {
                            ;(e.target as HTMLInputElement).
                            closest('.min-w-\\[260px\\]')?.
                            querySelector<HTMLButtonElement>(
                              '[data-recibo-print]'
                            )?.
                            click();
                          }
                          if (e.key === 'Escape') {
                            setReciboAberto(false);
                            setReciboValor('');
                          }
                        }}
                        className="flex-1 text-lg font-bold text-gray-900 bg-transparent outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      
                          </div>
                        </div>
                        <button
                    data-recibo-print
                    disabled={
                    !reciboValor ||
                    parseFloat(reciboValor) <= 0 ||
                    reciboLoading
                    }
                    onClick={async (e) => {
                      e.stopPropagation();
                      const valor = parseFloat(reciboValor);
                      if (!valor || valor <= 0) return;
                      setReciboLoading(true);
                      try {
                        const sessao = localStorage.getItem('sessao');
                        const parsed = sessao ? JSON.parse(sessao) : {};
                        const clinicaAtual = parsed.clinicaAtual || {};
                        const usuario = parsed.usuario || {};
                        const agora = new Date();
                        const dataFormatadaRecibo =
                        agora.toLocaleDateString('pt-BR');
                        const horaFormatada =
                        agora.toLocaleTimeString('pt-BR');
                        const valorFormatado = valor.toLocaleString(
                          'pt-BR',
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          }
                        );
                        const dadosImpressao = [
                        `<acao>RECIBO</acao>`,
                        `<id_printserver>${Date.now()}</id_printserver>`,
                        `<clinica>${clinicaAtual.id || clinicaId || ''}</clinica>`,
                        `<contrato>${consulta.pacienteId || ''}</contrato>`,
                        `<matricula>${(consulta as any)?.pacienteMatricula || (paciente as any)?.matricula || ''}</matricula>`,
                        `<data>${consulta.data ? new Date(consulta.data + 'T12:00:00').toLocaleDateString('pt-BR') : dataFormatadaRecibo}</data>`,
                        `<hora>${consulta.horario || ''}</hora>`,
                        `<dentista_nome>${consulta.profissionalTitulo || 'Dr(a).'} ${nomeProfissional}</dentista_nome>`,
                        `<dt>${dataFormatadaRecibo}</dt>`,
                        `<hr>${horaFormatada}</hr>`,
                        `<titulo>Recibo de consulta/${clinicaAtual.cidade || clinicaAtual.nome || ''}</titulo>`,
                        `<procedimento>${consulta.procedimentoNomeJoin || consulta.procedimentoNome || consulta.tipo || ''}</procedimento>`,
                        `<empresa_nome>${clinicaAtual.razaoSocial || clinicaAtual.nome || ''}</empresa_nome>`,
                        `<login>${usuario.nome || ''}</login>`,
                        `<clinica_fone>${clinicaAtual.telefone || ''}</clinica_fone>`,
                        `<nome>${consulta.pacienteNome || ''}</nome>`,
                        `<nome_titular>${consulta.pacienteNome || ''}</nome_titular>`,
                        `<nome_paciente>${consulta.pacienteNome || ''}</nome_paciente>`,
                        `<valor>${valorFormatado}</valor>`];

                        const psClientId =
                        clinicaAtual.id || clinicaId || '';
                        const resp = await fetch(
                          `${API_BASE_URL}/api/printserver/imprimir`,
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              clientId: psClientId,
                              clinicaId:
                              clinicaId || clinicaAtual.id || '',
                              dados: dadosImpressao,
                              enqueue: true
                            })
                          }
                        );
                        if (resp.ok) {
                          const result = await resp.json();
                          try {
                            const updates = await salvarReciboNaConsulta({
                              consultaId: consulta.id,
                              clinicaId: clinicaIdEfetivo,
                              valor,
                              valorFormatado,
                              observacoesAtuais:
                              consulta.observacoes || ''
                            });
                            onUpdateConsulta(consulta.id, updates as any);
                          } catch (saveErr) {
                            console.warn(
                              'Erro ao salvar recibo:',
                              saveErr
                            );
                          }
                          onReciboEmitido(consulta.id);
                          setReciboAberto(false);
                          setReciboValor('');
                          success(
                            'Recibo Emitido! 🧾',
                            `R$ ${valorFormatado} — enviado para impressora (Job: ${result.jobId || 'N/A'})`
                          );
                        } else {
                          const err = await resp.json();
                          throw new Error(
                            err.message ||
                            err.error ||
                            'Erro ao imprimir'
                          );
                        }
                      } catch (err: any) {
                        console.error(
                          'Erro ao imprimir recibo rápido:',
                          err
                        );
                        Swal.fire({
                          icon: 'error',
                          title: 'Erro na impressão',
                          html: `<p>Não foi possível enviar o recibo.</p><p class="text-sm text-gray-500 mt-2">${err.message || 'PrintServer pode estar desconectado.'}</p>`,
                          confirmButtonColor: '#14b8a6'
                        });
                      } finally {
                        setReciboLoading(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-all shadow-sm active:scale-95">
                    
                          {reciboLoading ?
                    <Loader2 className="w-4 h-4 animate-spin" /> :

                    <PrinterIcon className="w-4 h-4" />
                    }
                          {reciboLoading ? 'Enviando...' : 'Imprimir Recibo'}
                        </button>
                        {(recibosEmitidos.has(consulta.id) ||
                  consultaTemRecibo(consulta.observacoes)) &&
                  <p className="text-[10px] text-emerald-600 text-center mt-2 flex items-center justify-center gap-1">
                            <CheckIcon className="w-3 h-3" />
                            Recibo já emitido anteriormente
                          </p>
                  }
                      </div>
                    </div>
                  </>
            }
              </div>
          }

          {/* Iniciar Atendimento / Finalizar */}
          {!isPlaceholder && consulta.status === 'confirmada' &&
          <>
              {usuarioLogado && (
            usuarioLogado.tipo === 'medico' ||
            usuarioLogado.tipo === 'dentista' ||
            usuarioLogado.tipo === 'super_admin' ||
            usuarioLogado.tipo === 'admin') &&
            temPermissao('prontuarios') &&
            <button
              onClick={() => onIniciarAtendimento(consulta)}
              title="Iniciar atendimento"
              className="p-1.5 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors">
              
                    <ClipboardListIcon className="w-4 h-4" />
                  </button>
            }
              {(!usuarioLogado ||
            usuarioLogado.tipo !== 'medico' &&
            usuarioLogado.tipo !== 'dentista' &&
            usuarioLogado.tipo !== 'super_admin' &&
            usuarioLogado.tipo !== 'admin' ||
            !temPermissao('prontuarios')) &&
            <button
              onClick={() => onMarcarRealizada(consulta.id)}
              title="Finalizar"
              className="p-1.5 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors">
              
                  <CheckIcon className="w-4 h-4" />
                </button>
            }
            </>
          }

          {/* Excluir */}
          <button
            onClick={() => onCancelar(consulta.id)}
            title={isPlaceholder ? 'Remover horário' : 'Excluir consulta'}
            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors">
            
            <XIcon className="w-4 h-4" />
          </button>

          {/* Restaurar */}
          {!isPlaceholder && consulta.status === 'cancelada' &&
          <button
            onClick={() => onRestaurar(consulta.id)}
            title="Restaurar"
            className="p-1.5 rounded text-blue-700 hover:bg-blue-50 transition-colors">
            
              <RotateCcwIcon className="w-4 h-4" />
            </button>
          }

          {/* Lembrete enviado */}
          {consulta.lembreteEnviado &&
          <span title="Lembrete enviado" className="p-1 text-green-600">
              <MessageSquareIcon className="w-3.5 h-3.5" />
            </span>
          }
        </div>
      </div>

      <ConversaWhatsAppModal
        isOpen={isConversaOpen}
        onClose={() => setIsConversaOpen(false)}
        clinicaId={clinicaIdEfetivo}
        pacienteId={consulta.pacienteId}
        pacienteNome={consulta.pacienteNome || 'Paciente'}
        pacienteTelefone={telPaciente} />
      
    </Card>);

}