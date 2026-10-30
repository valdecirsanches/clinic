import React from 'react';
import {
  ClockIcon,
  UserIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  StethoscopeIcon,
  ClipboardListIcon,
  ClipboardIcon,
  FolderOpenIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  VideoIcon } from
'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { resolverConselho } from '../../utils/especialidadeHelper';
export interface PacienteHeaderData {
  id: string;
  nome: string;
  dataNascimento?: string;
  convenio?: string;
  planoSaudeNome?: string;
  cidade?: string;
  profissao?: string;
  statusConsulta?: string;
  fotoUrl?: string;
  telefone?: string;
  titularId?: string;
  titularNome?: string;
  parentesco?: string;
  // ⭐ Exigidos pelos documentos legais emitidos no prontuário
  cpf?: string;
  celular?: string;
  endereco?: string;
  profissionalResponsavelId?: string;
}
interface PacienteHeaderProps {
  paciente: PacienteHeaderData;
  atendimentoId?: string;
  dataConsulta?: string;
  atendimentoNovo?: boolean;
  tempoAtendimento?: string;
  mostrarTempo?: boolean;
  semProfissional?: boolean;
  profissionalNome?: string;
  profissionalTitulo?: string;
  profissionalCrm?: string;
  profissionalUf?: string;
  profissionalTipo?: string;
  profissionalEspecialidade?: string;
  profissionalResponsavelNome?: string;
  profissionalResponsavelTitulo?: string;
  profissionalResponsavelCrm?: string;
  profissionalResponsavelUf?: string;
  profissionalResponsavelTipo?: string;
  onPacienteClick?: (pacienteId: string) => void;
  onProfissionalClick?: () => void;
  onAvaliacaoClick?: () => void;
  onProcedimentosClick?: () => void;
  showAvaliacaoActive?: boolean;
  showProcedimentosActive?: boolean;
  timerStatus?: 'idle' | 'running' | 'paused' | 'stopped';
  onStartTimer?: () => void;
  onPauseTimer?: () => void;
  onStopTimer?: () => void;
  // ⭐ NOVO: Consulta online — permite reconectar/reabrir a sala de vídeo
  // diretamente do cabeçalho do atendimento (visível em todas as abas).
  mostrarVideo?: boolean;
  onReconectarVideo?: () => void;
  /**
   * ⭐ Seleção do profissional responsável por TODO o prontuário.
   * Preenchido apenas quando o usuário logado não é um profissional clínico:
   * nesse caso ele precisa escolher em nome de quem os registros serão
   * gravados, em vez de ficar travado em "selecione um profissional".
   */
  profissionaisSelecionaveis?: {
    id: string;
    nome: string;
    tipo?: string;
    crm?: string;
    uf?: string;
    titulo?: string;
  }[];
  profissionalSelecionadoId?: string;
  onSelecionarProfissional?: (id: string) => void;
}
function formatarDataConsulta(data?: string): string | null {
  if (!data) return null;
  const limpo = String(data).trim().split('T')[0].split(' ')[0];
  const m = limpo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(data);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
  return limpo || null;
}
function calcularIdade(dataNascimento?: string): number | null {
  if (!dataNascimento) return null;
  const nascimento = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNascimento = nascimento.getMonth();
  if (
  mesAtual < mesNascimento ||
  mesAtual === mesNascimento && hoje.getDate() < nascimento.getDate())
  {
    idade--;
  }
  return idade;
}
export function PacienteHeader({
  paciente,
  atendimentoId,
  dataConsulta,
  atendimentoNovo = false,
  tempoAtendimento = '00:00',
  mostrarTempo = true,
  semProfissional = false,
  profissionalNome,
  profissionalTitulo,
  profissionalCrm,
  profissionalUf,
  profissionalTipo,
  profissionalEspecialidade,
  profissionalResponsavelNome,
  profissionalResponsavelTitulo,
  profissionalResponsavelCrm,
  profissionalResponsavelUf,
  profissionalResponsavelTipo,
  onPacienteClick,
  onProfissionalClick,
  onAvaliacaoClick,
  onProcedimentosClick,
  showAvaliacaoActive,
  showProcedimentosActive,
  timerStatus,
  onStartTimer,
  onPauseTimer,
  onStopTimer,
  mostrarVideo = false,
  onReconectarVideo,
  profissionaisSelecionaveis,
  profissionalSelecionadoId,
  onSelecionarProfissional
}: PacienteHeaderProps) {
  // O seletor só existe quando a página autoriza (usuário sem cadastro
  // clínico) e há profissionais cadastrados na clínica para escolher.
  const podeSelecionarProfissional =
  !!onSelecionarProfissional &&
  Array.isArray(profissionaisSelecionaveis) &&
  profissionaisSelecionaveis.length > 0;
  // ⭐ Monta nome com título para exibição
  const nomeComTitulo = profissionalTitulo ?
  `${profissionalTitulo} ${profissionalNome}` :
  profissionalNome;
  const nomeResponsavelComTitulo = profissionalResponsavelTitulo ?
  `${profissionalResponsavelTitulo} ${profissionalResponsavelNome}` :
  profissionalResponsavelNome;
  const idade = calcularIdade(paciente.dataNascimento);
  const dataConsultaFmt = formatarDataConsulta(dataConsulta);
  const convenio = paciente.planoSaudeNome || paciente.convenio || 'PARTICULAR';
  const statusConsulta = paciente.statusConsulta || 'PRIMEIRA CONSULTA';
  const prefixoConselho = resolverConselho(
    profissionalTipo,
    profissionalEspecialidade,
    undefined,
    profissionalCrm
  );
  const registroCompleto = profissionalCrm ?
  `${prefixoConselho} ${profissionalCrm}${profissionalUf ? '/' + profissionalUf : ''}` :
  '';
  const prefixoResponsavel = resolverConselho(
    profissionalResponsavelTipo,
    undefined,
    undefined,
    profissionalResponsavelCrm
  );
  const registroResponsavel = profissionalResponsavelCrm ?
  `${prefixoResponsavel} ${profissionalResponsavelCrm}${profissionalResponsavelUf ? '/' + profissionalResponsavelUf : ''}` :
  '';
  const fotoCompleta = paciente.fotoUrl ?
  paciente.fotoUrl.startsWith('/uploads') ?
  `${API_BASE_URL}${paciente.fotoUrl}?t=${Date.now()}` :
  paciente.fotoUrl :
  null;
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex-shrink-0">
      <div className="flex justify-between items-start">
        {/* Lado esquerdo: Foto + Nome do paciente + Profissional */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-0.5">
            {/* Foto do paciente */}
            <div
              className={`w-9 h-9 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0 ${onPacienteClick ? 'cursor-pointer hover:border-blue-400 transition-colors' : ''}`}
              onClick={() => onPacienteClick && onPacienteClick(paciente.id)}
              title={onPacienteClick ? 'Abrir cadastro do paciente' : undefined}>
              
              {fotoCompleta ?
              <img
                src={fotoCompleta}
                alt={`Foto de ${paciente.nome}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.innerHTML =
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-gray-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
                  }
                }} /> :


              <UserIcon className="w-6 h-6 text-gray-400" />
              }
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                {onPacienteClick ?
                <button
                  onClick={() => onPacienteClick(paciente.id)}
                  className="text-lg font-semibold text-gray-900 hover:text-teal-700 hover:underline underline-offset-2 transition-colors cursor-pointer text-left"
                  title="Abrir cadastro do paciente">
                  
                    {paciente.nome}
                  </button> :

                <h1 className="text-lg font-semibold text-gray-900">
                    {paciente.nome}
                  </h1>
                }

                {paciente.titularId ?
                <div className="flex flex-col justify-center">
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-200 uppercase tracking-wide w-fit">
                      Dependente
                    </span>
                    {paciente.titularNome &&
                  <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                        de: {paciente.titularNome}
                      </span>
                  }
                  </div> :

                <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold border border-teal-200 uppercase tracking-wide self-start mt-1.5">
                    Titular
                  </span>
                }
              </div>

              {profissionalResponsavelNome &&
              <div className="flex items-center gap-1.5 mt-0.5">
                  <StethoscopeIcon className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs text-purple-700 font-medium">
                    Resp: {nomeResponsavelComTitulo}
                  </span>
                  {registroResponsavel &&
                <span className="text-xs text-purple-500">
                      ({registroResponsavel})
                    </span>
                }
                </div>
              }
            </div>
            {podeSelecionarProfissional ? (
            /* ⭐ Usuário sem cadastro clínico: escolhe aqui o profissional
               responsável por todo o prontuário — é em nome dele que cada
               etapa (evolução, prescrição, atestado…) será gravada. */
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              profissionalNome ?
              'bg-teal-50 border-teal-200' :
              'bg-amber-50 border-amber-300'}`
              }>
              
                <StethoscopeIcon
                className={`w-4 h-4 flex-shrink-0 ${profissionalNome ? 'text-teal-600' : 'text-amber-600'}`} />
              
                <div className="flex flex-col min-w-0">
                  <label
                  htmlFor="prontuario-profissional-responsavel"
                  className={`text-[10px] font-semibold uppercase tracking-wide leading-none ${profissionalNome ? 'text-teal-700' : 'text-amber-700'}`}>
                  
                    Profissional responsável
                  </label>
                  <select
                  id="prontuario-profissional-responsavel"
                  value={profissionalSelecionadoId || ''}
                  onChange={(e) => onSelecionarProfissional?.(e.target.value)}
                  className={`mt-0.5 max-w-[19rem] bg-transparent text-sm font-medium border-0 p-0 pr-5 focus:outline-none focus:ring-0 cursor-pointer ${profissionalNome ? 'text-teal-800' : 'text-amber-800'}`}>
                  
                    <option value="">
                      {profissionalNome ?
                    `Atual: ${nomeComTitulo}` :
                    'Selecione o profissional…'}
                    </option>
                    {profissionaisSelecionaveis!.map((p) =>
                  <option key={p.id} value={p.id}>
                        {p.titulo ? `${p.titulo} ${p.nome}` : p.nome}
                        {p.crm ?
                    ` — ${resolverConselho(p.tipo, undefined, undefined, p.crm)} ${p.crm}${p.uf ? `/${p.uf}` : ''}` :
                    ''}
                      </option>
                  )}
                  </select>
                </div>
              </div>) :
            profissionalNome ?
            onProfissionalClick ?
            <button
              onClick={onProfissionalClick}
              className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 hover:border-teal-300 transition-colors cursor-pointer"
              title="Profissional deste atendimento — clique para editar cadastro">
              
                  <UserIcon className="w-4 h-4 text-teal-600" />
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-medium text-teal-700 leading-tight hover:text-teal-900">
                      {nomeComTitulo}
                    </span>
                    {registroCompleto &&
                <div className="flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-3 h-3 text-teal-500" />
                        <span className="text-xs text-teal-600 font-medium leading-tight">
                          {registroCompleto}
                          {profissionalEspecialidade &&
                    <span className="text-teal-500 font-normal">
                              {' '}
                              • {profissionalEspecialidade}
                            </span>
                    }
                        </span>
                      </div>
                }
                  </div>
                </button> :

            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg">
                  <UserIcon className="w-4 h-4 text-teal-600" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-teal-700 leading-tight">
                      {nomeComTitulo}
                    </span>
                    {registroCompleto &&
                <div className="flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-3 h-3 text-teal-500" />
                        <span className="text-xs text-teal-600 font-medium leading-tight">
                          {registroCompleto}
                          {profissionalEspecialidade &&
                    <span className="text-teal-500 font-normal">
                              {' '}
                              • {profissionalEspecialidade}
                            </span>
                    }
                        </span>
                      </div>
                }
                  </div>
                </div> :

            semProfissional ?
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg animate-pulse">
                <AlertTriangleIcon className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700">
                  Selecione um profissional no Prontuário
                </span>
              </div> :
            null}
          </div>

          {/* Info do paciente */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {idade !== null &&
            <>
                <span>Idade: {idade} anos</span>
                <span className="text-gray-300">/</span>
              </>
            }
            <span>{statusConsulta}</span>
            <span className="text-gray-300">/</span>
            <span>{convenio}</span>
            {paciente.cidade &&
            <>
                <span className="text-gray-300">/</span>
                <span>morador de {paciente.cidade.toUpperCase()}</span>
              </>
            }
            {paciente.profissao &&
            <>
                <span className="text-gray-300">/</span>
                <span>{paciente.profissao.toUpperCase()}</span>
              </>
            }
          </div>
        </div>

        {/* Lado direito: Data do atendimento aberto + Timer */}
        <div className="flex flex-col items-end gap-1">
          {/* ⭐ NOVO: Reconectar à consulta online (sala de vídeo) */}
          {mostrarVideo && onReconectarVideo &&
          <button
            onClick={onReconectarVideo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            title="Abrir a sala de vídeo desta consulta online dentro do app (janela sobreposta)">
            
              <VideoIcon className="w-4 h-4" />
              Reconectar consulta online
            </button>
          }
          {atendimentoNovo ?
          <div
            className="flex items-center gap-1.5 text-teal-700"
            title="Você está registrando um novo atendimento">
            
              <ClipboardIcon className="w-4 h-4 text-teal-500" />
              <span className="text-sm font-semibold">
                Novo atendimento{dataConsultaFmt ? ` • ${dataConsultaFmt}` : ''}
              </span>
            </div> :
          dataConsultaFmt ?
          <div
            className="flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1"
            title="Você está vendo/editando o atendimento desta data. Não é necessariamente o mais recente do paciente.">
            
              <FolderOpenIcon className="w-4 h-4 text-teal-500" />
              <span className="text-xs uppercase tracking-wide text-teal-500">
                Atendimento aberto
              </span>
              <span className="text-sm font-semibold">{dataConsultaFmt}</span>
            </div> :
          null}
          {mostrarTempo &&
          <div className="flex items-center gap-3">
              <div
              className={`flex items-center gap-2 ${timerStatus === 'running' ? 'text-teal-600' : 'text-gray-400'}`}
              title="Tempo decorrido deste atendimento">
              
                <ClockIcon
                className={`w-4 h-4 ${timerStatus === 'running' ? 'animate-pulse' : ''}`} />
              
                <span className="text-base font-medium font-mono tabular-nums">
                  {tempoAtendimento}
                </span>
              </div>

              {timerStatus && timerStatus !== 'stopped' &&
            <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
                  {timerStatus === 'running' ?
              <button
                onClick={onPauseTimer}
                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
                title="Pausar atendimento">
                
                      <PauseIcon className="w-4 h-4" />
                    </button> :

              <button
                onClick={onStartTimer}
                className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                title={
                timerStatus === 'idle' ?
                'Iniciar atendimento' :
                'Retomar atendimento'
                }>
                
                      <PlayIcon className="w-4 h-4" />
                    </button>
              }

                  <button
                onClick={onStopTimer}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                title="Encerrar atendimento">
                
                    <SquareIcon className="w-4 h-4" />
                  </button>
                </div>
            }
            </div>
          }
        </div>
      </div>
    </div>);

}