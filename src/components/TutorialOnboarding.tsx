import React, { useCallback, useEffect, useState, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon, XIcon, UsersIcon, CalendarIcon, FileTextIcon, MessageCircleIcon, CreditCardIcon, CheckCircleIcon, ArrowRightIcon, SparklesIcon, HeartPulseIcon, BuildingIcon, Building2Icon, UserPlusIcon, UserCogIcon, ClipboardListIcon, StethoscopeIcon, ClockIcon, BellIcon, SmartphoneIcon, CameraIcon, FolderOpenIcon, PieChartIcon, SettingsIcon, ShieldCheckIcon, ArrowDownIcon, CircleIcon } from 'lucide-react';
interface TutorialStep {
  id: number;
  title: string;
  subtitle?: string;
  description: string;
  icon: React.ReactNode;
  features: {
    icon: React.ReactNode;
    title: string;
    description: string;
  }[];
  tips?: string[];
  sequence?: {
    step: number;
    title: string;
    done?: boolean;
  }[];
  color: string;
  bgGradient: string;
}
const tutorialSteps: TutorialStep[] = [{
  id: 1,
  title: 'Bem-vindo ao EasyClin 2.0',
  subtitle: 'Sistema Completo de Gestão para Clínicas',
  description: 'O EasyClin é um sistema multi-clínicas que permite gerenciar operadoras, clínicas, profissionais e pacientes de forma integrada e eficiente.',
  icon: <HeartPulseIcon className="w-12 h-12" />,
  features: [{
    icon: <BuildingIcon className="w-5 h-5" />,
    title: 'Multi-Operadoras',
    description: 'Gerencie várias operadoras em um só sistema'
  }, {
    icon: <Building2Icon className="w-5 h-5" />,
    title: 'Multi-Clínicas',
    description: 'Cada operadora pode ter múltiplas clínicas'
  }, {
    icon: <ShieldCheckIcon className="w-5 h-5" />,
    title: 'Dados Seguros',
    description: 'Informações protegidas na nuvem'
  }, {
    icon: <SmartphoneIcon className="w-5 h-5" />,
    title: 'Acesso em Qualquer Lugar',
    description: 'Use no computador, tablet ou celular'
  }],
  color: 'text-teal-600',
  bgGradient: 'from-teal-500 to-cyan-600'
}, {
  id: 2,
  title: 'Passo 1: Cadastrar Operadora',
  subtitle: 'A estrutura começa pela Operadora',
  description: 'A Operadora é a empresa principal (matriz) que pode ter uma ou mais clínicas. É o primeiro cadastro que você deve fazer no sistema.',
  icon: <BuildingIcon className="w-12 h-12" />,
  features: [{
    icon: <FileTextIcon className="w-5 h-5" />,
    title: 'Dados da Empresa',
    description: 'CNPJ, Razão Social, Nome Fantasia'
  }, {
    icon: <MessageCircleIcon className="w-5 h-5" />,
    title: 'Contato',
    description: 'Telefone, E-mail, Endereço completo'
  }, {
    icon: <Building2Icon className="w-5 h-5" />,
    title: 'Múltiplas Clínicas',
    description: 'Uma operadora pode ter várias unidades'
  }, {
    icon: <UserCogIcon className="w-5 h-5" />,
    title: 'Usuário Admin',
    description: 'Criado automaticamente no cadastro'
  }],
  tips: ['💡 Ao criar a conta, você já cadastra a operadora e o primeiro usuário administrador', '📋 O administrador terá acesso total ao sistema'],
  sequence: [{
    step: 1,
    title: 'Operadora',
    done: true
  }, {
    step: 2,
    title: 'Clínica'
  }, {
    step: 3,
    title: 'Usuários'
  }, {
    step: 4,
    title: 'Pacientes'
  }],
  color: 'text-blue-600',
  bgGradient: 'from-blue-500 to-indigo-600'
}, {
  id: 3,
  title: 'Passo 2: Cadastrar Clínicas',
  subtitle: 'Cada unidade de atendimento',
  description: 'Após criar a operadora, cadastre as clínicas (unidades de atendimento). Cada clínica terá seus próprios pacientes, agendas e configurações.',
  icon: <Building2Icon className="w-12 h-12" />,
  features: [{
    icon: <FileTextIcon className="w-5 h-5" />,
    title: 'Dados da Clínica',
    description: 'Nome, CNPJ, Endereço da unidade'
  }, {
    icon: <SettingsIcon className="w-5 h-5" />,
    title: 'Configurações Próprias',
    description: 'WhatsApp, horários, especialidades'
  }, {
    icon: <UsersIcon className="w-5 h-5" />,
    title: 'Pacientes Separados',
    description: 'Cada clínica tem sua base de pacientes'
  }, {
    icon: <CalendarIcon className="w-5 h-5" />,
    title: 'Agendas Independentes',
    description: 'Agendas específicas por clínica'
  }],
  tips: ['💡 Acesse: Menu → Clínicas → Nova Clínica', '📋 Você pode ter clínicas em diferentes cidades', '🔄 Troque de clínica pelo seletor no topo da tela'],
  sequence: [{
    step: 1,
    title: 'Operadora',
    done: true
  }, {
    step: 2,
    title: 'Clínica',
    done: true
  }, {
    step: 3,
    title: 'Usuários'
  }, {
    step: 4,
    title: 'Pacientes'
  }],
  color: 'text-violet-600',
  bgGradient: 'from-violet-500 to-purple-600'
}, {
  id: 4,
  title: 'Passo 3: Cadastrar Usuários',
  subtitle: 'Profissionais e funcionários',
  description: 'Cadastre os usuários que terão acesso ao sistema: médicos, dentistas, secretárias e administradores. Cada um com seu nível de permissão.',
  icon: <UserPlusIcon className="w-12 h-12" />,
  features: [{
    icon: <StethoscopeIcon className="w-5 h-5" />,
    title: 'Profissionais de Saúde',
    description: 'Médicos, dentistas com CRM/CRO'
  }, {
    icon: <UserCogIcon className="w-5 h-5" />,
    title: 'Secretárias',
    description: 'Acesso à agenda e cadastros'
  }, {
    icon: <ShieldCheckIcon className="w-5 h-5" />,
    title: 'Administradores',
    description: 'Acesso total ao sistema'
  }, {
    icon: <CalendarIcon className="w-5 h-5" />,
    title: 'Agenda Própria',
    description: 'Cada profissional pode ter sua agenda'
  }],
  tips: ['💡 Acesse: Menu → Usuários → Novo Usuário', '👨‍⚕️ Profissionais precisam de CRM/CRO para prescrições', '📅 Após cadastrar, crie a agenda do profissional'],
  sequence: [{
    step: 1,
    title: 'Operadora',
    done: true
  }, {
    step: 2,
    title: 'Clínica',
    done: true
  }, {
    step: 3,
    title: 'Usuários',
    done: true
  }, {
    step: 4,
    title: 'Pacientes'
  }],
  color: 'text-amber-600',
  bgGradient: 'from-amber-500 to-orange-600'
}, {
  id: 5,
  title: 'Passo 4: Configurar Agendas',
  subtitle: 'Horários de atendimento',
  description: 'Configure as agendas dos profissionais definindo dias da semana, horários de início/fim, intervalo de almoço e duração das consultas.',
  icon: <CalendarIcon className="w-12 h-12" />,
  features: [{
    icon: <ClockIcon className="w-5 h-5" />,
    title: 'Horários Flexíveis',
    description: 'Defina horário de cada dia da semana'
  }, {
    icon: <ClipboardListIcon className="w-5 h-5" />,
    title: 'Duração da Consulta',
    description: '15, 30, 45 ou 60 minutos'
  }, {
    icon: <UsersIcon className="w-5 h-5" />,
    title: 'Múltiplas Agendas',
    description: 'Um profissional pode ter várias agendas'
  }, {
    icon: <BellIcon className="w-5 h-5" />,
    title: 'Lembretes Automáticos',
    description: 'WhatsApp avisa o paciente'
  }],
  tips: ['💡 Acesse: Menu → Configurações → Agendas', '📅 Configure cada dia da semana separadamente', '⏰ Defina intervalo de almoço se necessário'],
  sequence: [{
    step: 1,
    title: 'Operadora',
    done: true
  }, {
    step: 2,
    title: 'Clínica',
    done: true
  }, {
    step: 3,
    title: 'Usuários',
    done: true
  }, {
    step: 4,
    title: 'Agendas',
    done: true
  }],
  color: 'text-purple-600',
  bgGradient: 'from-purple-500 to-pink-600'
}, {
  id: 6,
  title: 'Passo 5: Cadastrar Pacientes',
  subtitle: 'Sua base de clientes',
  description: 'Agora você pode cadastrar os pacientes com todos os dados: informações pessoais, contato, convênio, foto e documentos.',
  icon: <UsersIcon className="w-12 h-12" />,
  features: [{
    icon: <FileTextIcon className="w-5 h-5" />,
    title: 'Ficha Completa',
    description: 'Nome, CPF, data de nascimento, endereço'
  }, {
    icon: <CameraIcon className="w-5 h-5" />,
    title: 'Foto do Paciente',
    description: 'Tire foto pela webcam ou receba via WhatsApp'
  }, {
    icon: <FolderOpenIcon className="w-5 h-5" />,
    title: 'Documentos Digitais',
    description: 'Anexe exames, laudos e receitas'
  }, {
    icon: <CreditCardIcon className="w-5 h-5" />,
    title: 'Carteirinha Digital',
    description: 'Envie pelo WhatsApp automaticamente'
  }],
  tips: ['💡 Acesse: Menu → Pacientes → Novo Paciente', '📸 A foto pode ser tirada pela câmera ou enviada pelo WhatsApp', '📱 O paciente pode enviar documentos pelo WhatsApp'],
  color: 'text-emerald-600',
  bgGradient: 'from-emerald-500 to-teal-600'
}, {
  id: 7,
  title: 'Agendamento de Consultas',
  subtitle: 'Marque consultas facilmente',
  description: 'Com tudo configurado, agende consultas clicando no horário desejado. O sistema mostra apenas horários disponíveis.',
  icon: <ClipboardListIcon className="w-12 h-12" />,
  features: [{
    icon: <CalendarIcon className="w-5 h-5" />,
    title: 'Visualização por Dia/Semana',
    description: 'Veja a agenda completa do profissional'
  }, {
    icon: <UsersIcon className="w-5 h-5" />,
    title: 'Busca de Paciente',
    description: 'Encontre rapidamente pelo nome ou telefone'
  }, {
    icon: <MessageCircleIcon className="w-5 h-5" />,
    title: 'Confirmação Automática',
    description: 'WhatsApp envia lembrete e pede confirmação'
  }, {
    icon: <CheckCircleIcon className="w-5 h-5" />,
    title: 'Status em Tempo Real',
    description: 'Confirmado, Cancelado, Aguardando'
  }],
  tips: ['💡 Clique em um horário vazio para agendar', '📱 O paciente recebe WhatsApp para confirmar', '✅ Respostas: 1=Confirma, 2=Cancela, 3=Remarcar'],
  color: 'text-sky-600',
  bgGradient: 'from-sky-500 to-blue-600'
}, {
  id: 8,
  title: 'WhatsApp Integrado',
  subtitle: 'Comunicação automatizada',
  description: 'Configure o WhatsApp para enviar lembretes, receber confirmações, cobrar parcelas e até receber fotos dos pacientes automaticamente.',
  icon: <MessageCircleIcon className="w-12 h-12" />,
  features: [{
    icon: <BellIcon className="w-5 h-5" />,
    title: 'Lembretes Automáticos',
    description: 'Avisa o paciente antes da consulta'
  }, {
    icon: <CheckCircleIcon className="w-5 h-5" />,
    title: 'Confirmação Interativa',
    description: 'Paciente confirma respondendo 1, 2 ou 3'
  }, {
    icon: <CreditCardIcon className="w-5 h-5" />,
    title: 'Cobrança de Parcelas',
    description: 'Envia cobrança com opções de pagamento'
  }, {
    icon: <CameraIcon className="w-5 h-5" />,
    title: 'Recebe Fotos',
    description: 'Paciente envia foto e salva no cadastro'
  }],
  tips: ['💡 Acesse: Menu → Configurações → WhatsApp', '🔗 Conecte escaneando o QR Code', '💬 Paciente digita "ajuda" para menu interativo'],
  color: 'text-green-600',
  bgGradient: 'from-green-500 to-emerald-600'
}, {
  id: 9,
  title: 'Prontuário Eletrônico',
  subtitle: 'Registre os atendimentos',
  description: 'Durante a consulta, registre tudo no prontuário eletrônico: anamnese, exame físico, diagnóstico, prescrições e procedimentos.',
  icon: <FileTextIcon className="w-12 h-12" />,
  features: [{
    icon: <ClipboardListIcon className="w-5 h-5" />,
    title: 'Histórico Completo',
    description: 'Todos os atendimentos do paciente'
  }, {
    icon: <StethoscopeIcon className="w-5 h-5" />,
    title: 'Prescrição Eletrônica',
    description: 'Integração com Memed para receitas'
  }, {
    icon: <FileTextIcon className="w-5 h-5" />,
    title: 'Odontograma Digital',
    description: 'Para clínicas odontológicas'
  }, {
    icon: <FolderOpenIcon className="w-5 h-5" />,
    title: 'Anexar Exames',
    description: 'Imagens, PDFs e documentos'
  }],
  tips: ['💡 Acesse: Menu → Prontuários', '📝 Clique no paciente para ver histórico', '💊 Use a prescrição Memed para receitas digitais'],
  color: 'text-indigo-600',
  bgGradient: 'from-indigo-500 to-violet-600'
}, {
  id: 10,
  title: 'Controle Financeiro',
  subtitle: 'Parcelas e cobranças',
  description: 'Gerencie contratos, parcelas e cobranças. Envie cobranças pelo WhatsApp com opções de pagamento PIX, boleto ou cartão.',
  icon: <CreditCardIcon className="w-12 h-12" />,
  features: [{
    icon: <FileTextIcon className="w-5 h-5" />,
    title: 'Contratos',
    description: 'Crie contratos com parcelamento'
  }, {
    icon: <CreditCardIcon className="w-5 h-5" />,
    title: 'Parcelas',
    description: 'Controle de vencimentos e pagamentos'
  }, {
    icon: <MessageCircleIcon className="w-5 h-5" />,
    title: 'Cobrança WhatsApp',
    description: 'Envie cobrança com menu de pagamento'
  }, {
    icon: <PieChartIcon className="w-5 h-5" />,
    title: 'Relatórios',
    description: 'Acompanhe receitas e inadimplência'
  }],
  tips: ['💡 Acesse o financeiro pelo cadastro do paciente', '💰 Crie contratos com múltiplas parcelas', '📱 Cobrança via WhatsApp com PIX automático'],
  color: 'text-amber-600',
  bgGradient: 'from-amber-500 to-orange-600'
}, {
  id: 11,
  title: 'Pronto para Começar!',
  subtitle: 'Resumo da sequência de cadastro',
  description: 'Siga esta ordem para configurar seu sistema corretamente. Cada etapa depende da anterior.',
  icon: <SparklesIcon className="w-12 h-12" />,
  features: [{
    icon: <BuildingIcon className="w-5 h-5" />,
    title: '1. Operadora',
    description: 'Cadastre a empresa matriz'
  }, {
    icon: <Building2Icon className="w-5 h-5" />,
    title: '2. Clínicas',
    description: 'Adicione as unidades de atendimento'
  }, {
    icon: <UserPlusIcon className="w-5 h-5" />,
    title: '3. Usuários + Agendas',
    description: 'Cadastre profissionais e configure horários'
  }, {
    icon: <UsersIcon className="w-5 h-5" />,
    title: '4. Pacientes',
    description: 'Comece a cadastrar seus pacientes'
  }],
  tips: ['🎉 Parabéns! Você está pronto para usar o EasyClin!', '📞 Precisa de ajuda? Entre em contato com o suporte', '🔄 Você pode rever este tutorial a qualquer momento'],
  color: 'text-rose-600',
  bgGradient: 'from-rose-500 to-pink-600'
}];
interface TutorialOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}
export function TutorialOnboarding({
  isOpen,
  onClose
}: TutorialOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const STEP_DURATION = 8000; // 8 segundos por slide (mais tempo para ler)
  const nextStep = useCallback(() => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setProgress(0);
    } else {
      setIsPlaying(false);
    }
  }, [currentStep]);
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setProgress(0);
    }
  };
  const goToStep = (index: number) => {
    setCurrentStep(index);
    setProgress(0);
  };
  // Auto-play
  useEffect(() => {
    if (!isPlaying || !isOpen) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          nextStep();
          return 0;
        }
        return prev + 100 / (STEP_DURATION / 100);
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, isOpen, nextStep]);
  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setProgress(0);
      setIsPlaying(true);
    }
  }, [isOpen]);
  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, nextStep, onClose]);
  const step = tutorialSteps[currentStep];
  return <AnimatePresence>
      {isOpen && <motion.div initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
        
          <motion.div initial={{
        scale: 0.9,
        opacity: 0
      }} animate={{
        scale: 1,
        opacity: 1
      }} exit={{
        scale: 0.9,
        opacity: 0
      }} transition={{
        type: 'spring',
        damping: 25,
        stiffness: 300
      }} className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          
            {/* Progress bars */}
            <div className="absolute top-0 left-0 right-0 z-20 flex gap-0.5 p-2 px-3">
              {tutorialSteps.map((_, index) => <div key={index} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden cursor-pointer" onClick={() => goToStep(index)}>
              
                  <motion.div className="h-full bg-white rounded-full" initial={{
              width: 0
            }} animate={{
              width: index < currentStep ? '100%' : index === currentStep ? `${progress}%` : '0%'
            }} transition={{
              duration: 0.1
            }} />
              
                </div>)}
            </div>

            {/* Close button */}
            <button onClick={onClose} className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
            
              <XIcon className="w-5 h-5 text-white" />
            </button>

            {/* Step counter */}
            <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-white/20 text-white text-sm font-medium">
              {currentStep + 1} / {tutorialSteps.length}
            </div>

            {/* Content - Scrollable */}
            <div className="relative flex-1 overflow-y-auto">
              {/* Header with gradient */}
              <motion.div key={`header-${currentStep}`} initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} transition={{
            duration: 0.5
          }} className={`bg-gradient-to-br ${step.bgGradient} pt-14 pb-8 px-8 text-white`}>
              
                <div className="flex items-center justify-center mb-4">
                  <motion.div initial={{
                scale: 0,
                rotate: -180
              }} animate={{
                scale: 1,
                rotate: 0
              }} transition={{
                type: 'spring',
                damping: 15,
                delay: 0.2
              }} className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                  
                    {step.icon}
                  </motion.div>
                </div>

                {step.subtitle && <motion.p initial={{
              y: 10,
              opacity: 0
            }} animate={{
              y: 0,
              opacity: 1
            }} transition={{
              delay: 0.25
            }} className="text-sm text-white/80 text-center uppercase tracking-wider mb-2">
                
                    {step.subtitle}
                  </motion.p>}

                <motion.h2 initial={{
              y: 20,
              opacity: 0
            }} animate={{
              y: 0,
              opacity: 1
            }} transition={{
              delay: 0.3
            }} className="text-2xl md:text-3xl font-bold text-center mb-3">
                
                  {step.title}
                </motion.h2>

                <motion.p initial={{
              y: 20,
              opacity: 0
            }} animate={{
              y: 0,
              opacity: 1
            }} transition={{
              delay: 0.4
            }} className="text-base text-white/90 text-center max-w-2xl mx-auto">
                
                  {step.description}
                </motion.p>

                {/* Sequence indicator */}
                {step.sequence && <motion.div initial={{
              y: 20,
              opacity: 0
            }} animate={{
              y: 0,
              opacity: 1
            }} transition={{
              delay: 0.5
            }} className="flex items-center justify-center gap-2 mt-6">
                
                    {step.sequence.map((seq, idx) => <Fragment key={seq.step}>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${seq.done ? 'bg-white text-gray-800' : 'bg-white/20 text-white/80'}`}>
                    
                          {seq.done ? <CheckCircleIcon className="w-4 h-4 text-green-600" /> : <CircleIcon className="w-4 h-4" />}
                          {seq.title}
                        </div>
                        {idx < step.sequence!.length - 1 && <ArrowRightIcon className="w-4 h-4 text-white/50" />}
                      </Fragment>)}
                  </motion.div>}
              </motion.div>

              {/* Features */}
              <div className="p-6 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {step.features.map((feature, index) => <motion.div key={`${currentStep}-${index}`} initial={{
                x: -20,
                opacity: 0
              }} animate={{
                x: 0,
                opacity: 1
              }} transition={{
                delay: 0.5 + index * 0.1
              }} className="flex items-start gap-3 p-4 bg-white rounded-xl shadow-sm">
                  
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${step.bgGradient} flex-shrink-0`}>
                    
                        <div className="text-white">{feature.icon}</div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800">
                          {feature.title}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {feature.description}
                        </p>
                      </div>
                    </motion.div>)}
                </div>

                {/* Tips */}
                {step.tips && step.tips.length > 0 && <motion.div initial={{
              y: 20,
              opacity: 0
            }} animate={{
              y: 0,
              opacity: 1
            }} transition={{
              delay: 0.8
            }} className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                
                    <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                      <SparklesIcon className="w-4 h-4" />
                      Dicas
                    </h4>
                    <ul className="space-y-1">
                      {step.tips.map((tip, idx) => <li key={idx} className="text-sm text-amber-700">
                          {tip}
                        </li>)}
                    </ul>
                  </motion.div>}

                {/* Step indicator dots */}
                <div className="flex items-center justify-center gap-1.5 mt-6">
                  {tutorialSteps.map((_, index) => <button key={index} onClick={() => goToStep(index)} className={`h-2 rounded-full transition-all ${index === currentStep ? `w-6 bg-gradient-to-r ${step.bgGradient}` : 'w-2 bg-gray-300 hover:bg-gray-400'}`} />)}
                </div>
              </div>
            </div>

            {/* Controls - Fixed at bottom */}
            <div className="flex items-center justify-between p-4 bg-white border-t border-gray-100 flex-shrink-0">
              <button onClick={prevStep} disabled={currentStep === 0} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              
                <ChevronLeftIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <button onClick={() => setIsPlaying(!isPlaying)} className={`p-3 rounded-full transition-all ${isPlaying ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : `bg-gradient-to-r ${step.bgGradient} text-white shadow-lg`}`}>
              
                {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
              </button>

              {currentStep === tutorialSteps.length - 1 ? <button onClick={onClose} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r ${step.bgGradient} text-white font-medium shadow-lg hover:shadow-xl transition-all`}>
              
                  Começar
                  <ArrowRightIcon className="w-5 h-5" />
                </button> : <button onClick={nextStep} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors">
              
                  <span className="hidden sm:inline">Próximo</span>
                  <ChevronRightIcon className="w-5 h-5" />
                </button>}
            </div>

            {/* Decorative elements */}
            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-gradient-to-br from-teal-200/30 to-blue-200/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl pointer-events-none" />
          </motion.div>
        </motion.div>}
    </AnimatePresence>;
}