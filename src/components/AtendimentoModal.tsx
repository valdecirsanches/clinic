import React, { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ClockIcon, PlayIcon, PauseIcon, FileTextIcon, PillIcon, SaveIcon } from 'lucide-react';
import { Consulta, Paciente } from '../types';
import { MemedPrescricaoModal } from './MemedPrescricaoModal';
import { MemedConfig, MemedProfissional } from '../types/memed';
import { API_BASE_URL } from '../config/api';
interface AtendimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  consulta: Consulta;
  paciente: Paciente;
  onSalvarProntuario: (prontuario: {
    consultaId: string;
    anamnese: string;
    exameFisico: string;
    diagnostico: string;
    conduta: string;
    observacoes: string;
    tempoAtendimento: number;
  }) => void;
}
export function AtendimentoModal({
  isOpen,
  onClose,
  consulta,
  paciente,
  onSalvarProntuario
}: AtendimentoModalProps) {
  // Cronômetro
  const [tempoDecorrido, setTempoDecorrido] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Prontuário
  const [anamnese, setAnamnese] = useState('');
  const [exameFisico, setExameFisico] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [conduta, setConduta] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // Memed
  const [showMemedModal, setShowMemedModal] = useState(false);
  const [memedConfig, setMemedConfig] = useState<MemedConfig | null>(null);
  const [profissional, setProfissional] = useState<MemedProfissional | null>(null);
  // Carrega config do Memed
  useEffect(() => {
    const loadMemedConfig = async () => {
      const sessao = localStorage.getItem('sessao');
      if (!sessao) return;
      const parsed = JSON.parse(sessao);
      // Carrega config GLOBAL do Memed do banco de dados
      try {
        const response = await fetch(`${API_BASE_URL}/api/configuracoes-globais/memed_config`);
        if (response.ok) {
          const data = await response.json();
          console.log('📦 [AtendimentoModal] Config Memed GLOBAL carregada do banco:', data.valor);
          console.log('🔑 [AtendimentoModal] API Key recebida:', data.valor?.apiKey ? 'SIM' : 'NÃO');
          console.log('🔑 [AtendimentoModal] API Key length:', data.valor?.apiKey?.length || 0);
          console.log('🔑 [AtendimentoModal] API Key primeiros 20 chars:', data.valor?.apiKey?.substring(0, 20));
          console.log('✅ [AtendimentoModal] Ativo?', data.valor?.ativo);
          setMemedConfig(data.valor);
        } else {
          console.log('⚠️ [AtendimentoModal] Memed não configurado');
        }
      } catch (err) {
        console.error('❌ [AtendimentoModal] Erro ao carregar Memed:', err);
      }
      // Define profissional (dados do usuário logado)
      const crmExemplo = '123456';
      const ufExemplo = 'SP';
      setProfissional({
        nome: parsed.usuario.nome,
        crm: crmExemplo,
        uf: ufExemplo,
        especialidade: parsed.usuario.tipo === 'medico' ? 'Clínico Geral' : 'Odontologia'
      });
    };
    loadMemedConfig();
  }, []);
  // Cronômetro
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setTempoDecorrido((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, isPaused]);
  // Inicia cronômetro automaticamente ao abrir
  useEffect(() => {
    if (isOpen && !isRunning) {
      setIsRunning(true);
      setIsPaused(false);
    }
  }, [isOpen]);
  const formatarTempo = (segundos: number) => {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor(segundos % 3600 / 60);
    const segs = segundos % 60;
    return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
  };
  const handleIniciarPausar = () => {
    if (!isRunning) {
      setIsRunning(true);
      setIsPaused(false);
    } else {
      setIsPaused(!isPaused);
    }
  };
  const handleParar = () => {
    setIsRunning(false);
    setIsPaused(false);
  };
  const handleSalvar = () => {
    onSalvarProntuario({
      consultaId: consulta.id,
      anamnese,
      exameFisico,
      diagnostico,
      conduta,
      observacoes,
      tempoAtendimento: tempoDecorrido
    });
    onClose();
  };
  const handlePrescricaoCriada = (prescricaoId: string, pdfUrl: string) => {
    console.log('✅ Prescrição criada:', prescricaoId, pdfUrl);
    // Adiciona prescrição às observações
    setObservacoes((prev) => prev + `\n\n📋 Prescrição Memed: ${prescricaoId}\n🔗 PDF: ${pdfUrl}`);
    setShowMemedModal(false);
  };
  const memedDisponivel = memedConfig?.ativo && profissional;
  return <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Atendimento - ${paciente.nome}`} size="large">
        
        <div className="space-y-6">
          {/* Cronômetro */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Tempo de Atendimento
                </h3>
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-blue-600" />
                  <span className="text-3xl font-bold text-gray-900 font-mono">
                    {formatarTempo(tempoDecorrido)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleIniciarPausar} variant={isPaused ? 'primary' : 'secondary'} size="sm">
                  
                  {isPaused ? <>
                      <PlayIcon className="w-4 h-4 mr-1" />
                      Retomar
                    </> : <>
                      <PauseIcon className="w-4 h-4 mr-1" />
                      Pausar
                    </>}
                </Button>

                <Button onClick={handleParar} variant="ghost" size="sm">
                  <div className="w-4 h-4 mr-1" />
                  Parar
                </Button>
              </div>
            </div>

            {isPaused && <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                ⏸️ Cronômetro pausado
              </div>}
          </Card>

          {/* Informações da Consulta */}
          <Card>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Paciente:</span>
                <p className="font-medium text-gray-900">{paciente.nome}</p>
              </div>
              <div>
                <span className="text-gray-500">Data:</span>
                <p className="font-medium text-gray-900">
                  {new Date(consulta.data).toLocaleDateString('pt-BR')} às{' '}
                  {consulta.horario}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Tipo:</span>
                <p className="font-medium text-gray-900">{consulta.tipo}</p>
              </div>
              <div>
                <span className="text-gray-500">Profissional:</span>
                <p className="font-medium text-gray-900">
                  {consulta.profissional}
                </p>
              </div>
            </div>
          </Card>

          {/* Prontuário */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileTextIcon className="w-5 h-5 text-blue-600" />
              Prontuário
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Anamnese
              </label>
              <textarea value={anamnese} onChange={(e) => setAnamnese(e.target.value)} placeholder="Queixa principal, história da doença atual, antecedentes..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]" />
              
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exame Físico
              </label>
              <textarea value={exameFisico} onChange={(e) => setExameFisico(e.target.value)} placeholder="Sinais vitais, exame físico geral e específico..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]" />
              
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Diagnóstico / Hipótese Diagnóstica
              </label>
              <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder="CID-10, diagnóstico clínico..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]" />
              
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Conduta / Plano Terapêutico
              </label>
              <textarea value={conduta} onChange={(e) => setConduta(e.target.value)} placeholder="Tratamento, exames solicitados, orientações..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]" />
              
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observações
              </label>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais, prescrições..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]" />
              
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={() => setShowMemedModal(true)} variant="secondary" disabled={!memedDisponivel} className="flex-1">
              
              <PillIcon className="w-4 h-4 mr-2" />
              {memedDisponivel ? 'Prescrever Medicamentos' : 'Memed não configurado'}
            </Button>

            <Button onClick={handleSalvar} className="flex-1">
              <SaveIcon className="w-4 h-4 mr-2" />
              Salvar Prontuário
            </Button>
          </div>

          {!memedDisponivel && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              💡 Configure o Memed em <strong>Configurações</strong> para
              habilitar prescrições digitais
            </div>}
        </div>
      </Modal>

      {/* Modal Memed */}
      {showMemedModal && memedConfig && profissional && <MemedPrescricaoModal isOpen={showMemedModal} onClose={() => setShowMemedModal(false)} paciente={paciente} profissional={profissional} config={memedConfig} onPrescricaoCriada={handlePrescricaoCriada} />}
    </>;
}