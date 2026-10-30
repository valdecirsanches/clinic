import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PacienteForm } from '../components/PacienteForm';
import { usePacientes } from '../hooks/usePacientes';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ToastContainer';
import { PlusIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Trash2Icon, AlertTriangleIcon, StethoscopeIcon, BanIcon, RotateCcwIcon, PrinterIcon, MessageSquareIcon } from 'lucide-react';
import { ConversaWhatsAppModal } from '../components/agenda/ConversaWhatsAppModal';
import { API_BASE_URL } from '../config/api';
// ⭐ FIX vazamento de permissão: usa helper central para verificar se o usuário
// pode acessar o prontuário antes de mostrar/disparar o botão "Prontuário".
// Sem isso, o atendente sem permissão de 'prontuarios' clicava neste botão
// e entrava direto no atendimento, contornando a Sidebar.
import { temPermissao } from '../utils/permissoes';
import { useAniversarioHabilitado } from '../hooks/useAniversarioHabilitado';
import { consumirAberturaPaciente, EVENTO_ABRIR_PACIENTE } from '../utils/aberturaPaciente';
// ⭐ Chave GLOBAL para localStorage (persiste mesmo após logout e reinício)
const STORAGE_KEY_BUSCA_PACIENTE = 'easyclin_busca_paciente_v2';
// ⭐ Função para ler do localStorage de forma segura
const lerBuscaSalva = (): string => {
  try {
    const valor = localStorage.getItem(STORAGE_KEY_BUSCA_PACIENTE);
    console.log('📖 [PacientesPage] Lendo busca do localStorage:', valor || '(vazio)');
    return valor || '';
  } catch (e) {
    console.warn('Erro ao ler busca do localStorage:', e);
    return '';
  }
};
// ⭐ Função para salvar no localStorage E no banco de dados
const salvarBusca = (termo: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY_BUSCA_PACIENTE, termo);
    console.log('💾 [PacientesPage] Salvando busca no localStorage:', termo || '(vazio)');
  } catch (e) {
    console.warn('Erro ao salvar busca no localStorage:', e);
  }
  // ⭐ PERSISTE NO BANCO via API (para funcionar em qualquer browser/dispositivo)
  try {
    const sessao = localStorage.getItem('sessao');
    if (sessao) {
      const parsed = JSON.parse(sessao);
      const userId = parsed.usuario?.id;
      if (userId) {
        fetch(`${API_BASE_URL}/api/usuarios/${userId}/preferencias`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            termoPesquisa: termo || null
          })
        }).then((res) => {
          if (res.ok) {
            console.log('💾 [PacientesPage] termoPesquisa salvo no banco:', termo || '(limpo)');
          }
        }).catch(() => {});
      }
    }
  } catch (e) {


    // Silencioso - localStorage é o fallback
  }};
export interface PacientesPageProps {
  onNavigate?: (page: string, date?: string) => void;
  onIniciarAtendimento?: (pacienteId: string, consultaId?: string) => void;
}
export function PacientesPage({
  onNavigate,
  onIniciarAtendimento
}: PacientesPageProps) {
  // ⭐ CORRIGIDO: Carrega clinicaId IMEDIATAMENTE na inicialização
  const [clinicaId, setClinicaId] = useState<string>(() => {
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        return parsed.clinicaAtual?.id || '';
      }
    } catch (e) {
      console.warn('Erro ao ler sessão:', e);
    }
    return '';
  });
  // ⭐ CORRIGIDO: Inicializa com valor do localStorage IMEDIATAMENTE
  const [searchInput, setSearchInput] = useState(() => lerBuscaSalva());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pacienteEdit, setPacienteEdit] = useState<any>(null);
  const [pacienteEditStack, setPacienteEditStack] = useState<any[]>([]); // ⭐ Pilha de navegação para "voltar ao cadastro onde estava"
  const [pacienteToDelete, setPacienteToDelete] = useState<any>(null);
  const [pacienteConversa, setPacienteConversa] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pacienteToCancelar, setPacienteToCancelar] = useState<any>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [isCancelando, setIsCancelando] = useState(false);
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const ultimaBuscaRef = useRef<string>(lerBuscaSalva()); // ⭐ Inicializa com valor salvo
  const primeiraRenderizacao = useRef(true);
  // ⭐ Felicitação de aniversário desligada nas Configurações => não oferece o botão
  const aniversarioHabilitado = useAniversarioHabilitado(clinicaId);
  // ⭐ Atualiza clinicaId se mudar na sessão.
  // ⭐ FIX vazamento entre operadoras: além da verificação inicial, escuta os
  // eventos de troca de operadora/clínica para que a lista de pacientes SEMPRE
  // reflita a clínica (e operadora) atualmente selecionada. Sem isto, ao trocar
  // de operadora a página continuava consultando o banco da clínica anterior,
  // exibindo pacientes de outra operadora.
  useEffect(() => {
    const verificarSessao = () => {
      try {
        const sessao = localStorage.getItem('sessao');
        if (sessao) {
          const parsed = JSON.parse(sessao);
          // ⭐ clinicaAtual pode ser null (ex.: logo após trocar de operadora)
          const novoClinicaId = parsed.clinicaAtual?.id || '';
          if (novoClinicaId !== clinicaId) {
            console.log('🔄 [PacientesPage] ClinicaId atualizado:', novoClinicaId || '(nenhuma)');
            setClinicaId(novoClinicaId);
          }
        }
      } catch (e) {
        console.warn('Erro ao verificar sessão:', e);
      }
    };
    // Verifica imediatamente e também após um delay (para garantir)
    verificarSessao();
    const timer = setTimeout(verificarSessao, 500);
    // ⭐ Reage à troca de operadora/clínica em tempo real
    const handleOperadoraChanged = (e: any) => {
      // Ao trocar de operadora, a clínica é limpa na sessão → zera a lista
      const novaClinicaId = e?.detail?.clinica?.id || '';
      console.log('🔄 [PacientesPage] Evento operadora-changed — clínica:', novaClinicaId || '(nenhuma)');
      setClinicaId(novaClinicaId);
    };
    const handleClinicaChanged = (e: any) => {
      const novaClinicaId = e?.detail?.clinica?.id || '';
      console.log('🔄 [PacientesPage] Evento clinica-changed:', novaClinicaId || '(nenhuma)');
      setClinicaId(novaClinicaId);
    };
    window.addEventListener('operadora-changed', handleOperadoraChanged);
    window.addEventListener('clinica-changed', handleClinicaChanged);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('operadora-changed', handleOperadoraChanged);
      window.removeEventListener('clinica-changed', handleClinicaChanged);
    };
  }, [clinicaId]);
  // ⭐ Carrega mapa de usuários (profissionais) para resolver IDs → nomes
  useEffect(() => {
    if (!clinicaId) return;
    fetch(`${API_BASE_URL}/api/usuarios?clinicaId=${clinicaId}`).then((res) => res.ok ? res.json() : []).then((data: any[]) => {
      const mapa: Record<string, string> = {};
      const lista = Array.isArray(data) ? data : (data as any)?.data || [];
      lista.forEach((u: any) => {
        if (u.id && u.nome) mapa[u.id] = u.nome;
      });
      setUsuariosMap(mapa);
    }).catch(() => {});
  }, [clinicaId]);
  // ⭐ Helper: calcula idade a partir de dataNascimento
  const calcularIdade = (dataNasc?: string): string => {
    if (!dataNasc) return '';
    try {
      const nasc = new Date(dataNasc);
      if (isNaN(nasc.getTime())) return '';
      const hoje = new Date();
      let idade = hoje.getFullYear() - nasc.getFullYear();
      const m = hoje.getMonth() - nasc.getMonth();
      if (m < 0 || m === 0 && hoje.getDate() < nasc.getDate()) idade--;
      return `${idade}a`;
    } catch {
      return '';
    }
  };
  // ⭐ Data de nascimento formatada, exibida junto da idade no cartão
  const formatarNascimento = (dataNasc?: string): string => {
    const base = String(dataNasc || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return '';
    const [ano, mes, dia] = base.split('-');
    return `${dia}/${mes}/${ano}`;
  };
  const {
    pacientes,
    pagination,
    loading,
    searchTerm,
    criar,
    atualizar,
    deletar,
    buscar,
    irParaPagina,
    mudarLimite,
    recarregar
  } = usePacientes(clinicaId);
  const {
    toasts,
    removeToast,
    success,
    error: showError
  } = useToast();
  // ⭐ Sincroniza o input com o searchTerm do hook quando ele muda (apenas na primeira vez)
  useEffect(() => {
    if (primeiraRenderizacao.current && searchTerm) {
      const termoSalvo = lerBuscaSalva();
      if (searchTerm === termoSalvo && searchInput !== termoSalvo) {
        console.log('🔄 [PacientesPage] Sincronizando input com termo do hook:', searchTerm);
        setSearchInput(searchTerm);
        ultimaBuscaRef.current = searchTerm;
      }
      primeiraRenderizacao.current = false;
    }
  }, [searchTerm]);
  // ⭐ Foca no input quando a página carrega
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        const termoSalvo = lerBuscaSalva();
        if (termoSalvo) {
          searchInputRef.current.select();
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [clinicaId]);
  // ⭐ Função de busca estável - SÓ salva e executa quando o usuário digita
  const executarBusca = useCallback((termo: string) => {
    if (ultimaBuscaRef.current === termo) {
      return;
    }
    ultimaBuscaRef.current = termo;
    console.log('🔍 [PacientesPage] Executando busca (usuário digitou):', termo);
    // Salva no localStorage SEMPRE que o usuário faz uma busca
    salvarBusca(termo);
    buscar(termo);
  }, [buscar]);
  // ⭐ Debounce para busca automática quando o usuário digita
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    // Só executa se o input mudou em relação à última busca
    if (searchInput !== ultimaBuscaRef.current) {
      debounceTimer.current = setTimeout(() => {
        executarBusca(searchInput);
      }, 400);
    }
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchInput, executarBusca]);
  const handleSearchFocus = () => {
    if (searchInputRef.current) {
      searchInputRef.current.select();
    }
  };
  const handleNovoPaciente = () => {
    setPacienteEditStack([]);
    setPacienteEdit(null);
    setIsModalOpen(true);
  };
  const handleEditarPaciente = (paciente: any) => {
    if (!clinicaId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    setPacienteEditStack([]);
    setPacienteEdit(paciente);
    setIsModalOpen(true);
  };
  // ⭐ Assistente de voz: "abrir o cadastro de X" / "cadastrar paciente novo".
  // O pedido pode chegar antes desta tela montar, por isso fica guardado.
  const clinicaIdRef = useRef(clinicaId);
  clinicaIdRef.current = clinicaId;
  useEffect(() => {
    const atender = async () => {
      const pedido = consumirAberturaPaciente();
      if (!pedido) return;
      if (!pedido.pacienteId) {
        setPacienteEditStack([]);
        setPacienteEdit(null);
        setIsModalOpen(true);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/pacientes/${pedido.pacienteId}?clinicaId=${clinicaIdRef.current}`);
        if (!res.ok) throw new Error();
        const paciente = await res.json();
        setPacienteEditStack([]);
        setPacienteEdit(paciente);
        setIsModalOpen(true);
      } catch {
        showError('Erro', 'Não foi possível abrir o cadastro pedido pelo assistente.');
      }
    };
    atender();
    window.addEventListener(EVENTO_ABRIR_PACIENTE, atender);
    return () => window.removeEventListener(EVENTO_ABRIR_PACIENTE, atender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ⭐ Navegação entre titular e dependente
  const handleAbrirRelacionado = async (pacienteId: string) => {
    if (!clinicaId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/pacientes/${pacienteId}?clinicaId=${clinicaId}`);
      if (res.ok) {
        const pacienteRelacionado = await res.json();
        setPacienteEditStack((prev) => [...prev, pacienteEdit]);
        setPacienteEdit(pacienteRelacionado);
      } else {
        showError('Erro', 'Não foi possível carregar o cadastro.');
      }
    } catch (err) {
      showError('Erro', 'Erro ao carregar o cadastro.');
    }
  };
  const handleVoltar = () => {
    if (pacienteEditStack.length > 0) {
      const prevPaciente = pacienteEditStack[pacienteEditStack.length - 1];
      setPacienteEditStack((prev) => prev.slice(0, -1));
      setPacienteEdit(prevPaciente);
    }
  };
  // ⭐ Impressão da ficha do paciente
  const handleImprimirPaciente = async (paciente: any) => {
    // Busca consultas do paciente
    let consultasHtml = '<p style="color:#94a3b8;font-style:italic">Nenhuma consulta encontrada</p>';
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultas?clinicaId=${clinicaId}&pacienteId=${paciente.id}&limit=50`);
      if (res.ok) {
        const consultas = await res.json();
        const reais = consultas.filter((c: any) => c.pacienteId !== 'disponivel');
        if (reais.length > 0) {
          consultasHtml = '<table style="width:100%;border-collapse:collapse;font-size:10px">' + '<thead><tr style="background:#0f766e;color:white"><th style="padding:4px 6px;text-align:left">Data</th><th style="padding:4px 6px;text-align:left">Horário</th><th style="padding:4px 6px;text-align:left">Profissional</th><th style="padding:4px 6px;text-align:left">Procedimento</th><th style="padding:4px 6px;text-align:left">Status</th></tr></thead><tbody>' + reais.sort((a: any, b: any) => (b.data || '').localeCompare(a.data || '')).slice(0, 30).map((c: any, i: number) => {
            const bg = i % 2 === 0 ? '#f8fafc' : '#fff';
            const dataFmt = c.data ? new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
            return `<tr style="background:${bg};border-bottom:1px solid #e2e8f0"><td style="padding:3px 6px">${dataFmt}</td><td style="padding:3px 6px">${c.horario || '—'}</td><td style="padding:3px 6px">${c.profissional || c.profissionalNome || '—'}</td><td style="padding:3px 6px">${c.procedimentoNomeJoin || c.procedimentoNome || '—'}</td><td style="padding:3px 6px">${c.status || '—'}</td></tr>`;
          }).join('') + '</tbody></table>';
        }
      }
    } catch (e) {

      /* silencioso */}
    // Busca financeiro
    let financeiroHtml = '<p style="color:#94a3b8;font-style:italic">Nenhum registro financeiro</p>';
    try {
      const res = await fetch(`${API_BASE_URL}/api/financeiro?clinicaId=${clinicaId}&pacienteId=${paciente.id}`);
      if (res.ok) {
        const registros = await res.json();
        const lista = Array.isArray(registros) ? registros : registros.registros || [];
        if (lista.length > 0) {
          financeiroHtml = '<table style="width:100%;border-collapse:collapse;font-size:10px">' + '<thead><tr style="background:#0f766e;color:white"><th style="padding:4px 6px;text-align:left">Data</th><th style="padding:4px 6px;text-align:left">Descrição</th><th style="padding:4px 6px;text-align:right">Valor</th><th style="padding:4px 6px;text-align:left">Status</th></tr></thead><tbody>' + lista.slice(0, 20).map((r: any, i: number) => {
            const bg = i % 2 === 0 ? '#f8fafc' : '#fff';
            const dataFmt = r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
            const valor = r.valor ? `R$ ${Number(r.valor).toFixed(2)}` : '—';
            return `<tr style="background:${bg};border-bottom:1px solid #e2e8f0"><td style="padding:3px 6px">${dataFmt}</td><td style="padding:3px 6px">${r.descricao || r.tipo || '—'}</td><td style="padding:3px 6px;text-align:right">${valor}</td><td style="padding:3px 6px">${r.status || '—'}</td></tr>`;
          }).join('') + '</tbody></table>';
        }
      }
    } catch (e) {

      /* silencioso */}
    // Dados da clínica
    let clinicaNome = 'Clínica';
    let clinicaLogo = '';
    try {
      const sessao = localStorage.getItem('sessao');
      if (sessao) {
        const parsed = JSON.parse(sessao);
        clinicaNome = parsed.clinicaAtual?.nome || 'Clínica';
        clinicaLogo = parsed.clinicaAtual?.logoUrl || '';
      }
    } catch (e) {}
    const logoHtml = clinicaLogo ? `<img src="${clinicaLogo}" alt="${clinicaNome}" style="width:40px;height:40px;object-fit:contain;border-radius:6px;background:white;padding:2px" />` : `<div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:white">${clinicaNome.slice(0, 2).toUpperCase()}</div>`;
    const campo = (label: string, valor: any) => valor ? `<div style="margin-bottom:4px"><span style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:0.3px">${label}</span><div style="font-size:11px;color:#1e293b;font-weight:500">${valor}</div></div>` : '';
    // ⭐ Helper para formatar datas com segurança (suporta "2024-12-10", "2024-12-10 00:00:00", ISO, etc.)
    const formatarDataSegura = (data: any): string => {
      if (!data) return '—';
      let str = String(data).trim();
      // Remove hora se presente: "2024-12-10 00:00:00" → "2024-12-10"
      if (str.includes(' ')) str = str.split(' ')[0];
      if (str.includes('T')) str = str.split('T')[0];
      // Valida formato YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const d = new Date(str + 'T12:00:00');
        if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
      }
      // Tenta parse direto
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
      return '—';
    };
    const dataNascFmt = formatarDataSegura(paciente.dataNascimento);
    const dataCadFmt = formatarDataSegura(paciente.dataCadastro);
    const generoMap: Record<string, string> = {
      masculino: 'Masculino',
      feminino: 'Feminino',
      outro: 'Outro',
      nao_informado: 'Não informado',
      M: 'Masculino',
      m: 'Masculino',
      F: 'Feminino',
      f: 'Feminino',
      O: 'Outro',
      o: 'Outro'
    };
    const estadoCivilMap: Record<string, string> = {
      solteiro: 'Solteiro(a)',
      casado: 'Casado(a)',
      divorciado: 'Divorciado(a)',
      viuvo: 'Viúvo(a)',
      uniao_estavel: 'União Estável',
      outro: 'Outro',
      '1': 'Solteiro(a)',
      '2': 'Casado(a)',
      '3': 'Divorciado(a)',
      '4': 'Viúvo(a)',
      '5': 'União Estável',
      '6': 'Outro'
    };
    const endereco = [paciente.logradouro, paciente.numero ? `nº ${paciente.numero}` : '', paciente.complemento, paciente.bairro, paciente.cidade, paciente.uf].filter(Boolean).join(', ');
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ficha - ' + paciente.nome + '</title>' + '<sty' + 'le>' + '@page{size:A4;margin:10mm}' + '*{margin:0;padding:0;box-sizing:border-box}' + 'body{font-family:"Segoe UI",Arial,sans-serif;color:#1e293b;background:#fff;line-height:1.4;font-size:11px}' + '.header{display:flex;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(135deg,#0f766e 0%,#14b8a6 100%);border-radius:8px;margin-bottom:12px;color:white}' + '.header h1{font-size:15px;font-weight:700}' + '.header .sub{font-size:10px;opacity:0.85}' + '.header .logo{width:40px;height:40px;object-fit:contain;border-radius:6px;background:white;padding:2px}' + '.section{margin-bottom:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}' + '.section-title{background:#f1f5f9;padding:6px 10px;font-size:11px;font-weight:700;color:#0f766e;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.3px}' + '.section-body{padding:8px 10px}' + '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}' + '.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 16px}' + '.campo .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.3px}' + '.campo .val{font-size:11px;color:#1e293b;font-weight:500;margin-bottom:4px}' + '.footer{text-align:center;padding-top:8px;border-top:1px solid #e2e8f0;margin-top:10px;font-size:9px;color:#94a3b8}' + '@media print{body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}' + '</sty' + 'le></head><body>' + `<div class="header">${logoHtml}<div><h1>${paciente.nome}</h1><div class="sub">${clinicaNome} • Matrícula: ${paciente.matricula || '—'} • Cadastro: ${dataCadFmt}</div></div></div>` + `

        <div class="section"><div class="section-title">Dados Pessoais</div><div class="section-body"><div class="grid3">
        ${campo('Nome Completo', paciente.nome)}
        ${campo('Data de Nascimento', dataNascFmt)}
        ${campo('Idade', paciente.idade || '')}
        ${campo('Gênero', generoMap[paciente.genero] || paciente.genero || '')}
        ${campo('Estado Civil', estadoCivilMap[String(paciente.estadoCivil)] || (paciente.estadoCivil && isNaN(Number(paciente.estadoCivil)) ? paciente.estadoCivil : '') || '')}
        ${campo('Profissão', paciente.profissao || '')}
        ${campo('Necessidade Especial', paciente.necessidadeEspecial || (paciente.dificuldadeLocomocao ? 'Dificuldade de Locomoção' : ''))}
        </div></div></div>

        <div class="section"><div class="section-title">Documentos</div><div class="section-body"><div class="grid3">
        ${campo('CPF', paciente.cpf || '')}
        ${campo('RG', paciente.rg ? `${paciente.rg}${paciente.emissorRg ? ' - ' + paciente.emissorRg : ''}` : '')}
        ${campo('CNS', paciente.cns || '')}
        ${campo('PIS/PASEP', paciente.pisPasep || '')}
        ${campo('Nº Contrato', paciente.numeroContrato || '')}
        </div></div></div>

        <div class="section"><div class="section-title">Contatos e Endereço</div><div class="section-body"><div class="grid3">
        ${campo('Celular', paciente.telefone || '')}
        ${campo('Tel. Residencial', paciente.telefoneResidencial || '')}
        ${campo('E-mail', paciente.email || '')}
        ${campo('CEP', paciente.cep || '')}
        ${campo('Endereço', endereco || '')}
        </div></div></div>

        <div class="section"><div class="section-title">Convênio / Empresa</div><div class="section-body"><div class="grid3">
        ${campo('Convênio', paciente.convenioNome || (paciente.convenio && isNaN(Number(paciente.convenio)) ? paciente.convenio : '') || '')}
        ${campo('Plano de Saúde', paciente.planoSaudeNome || (paciente.plano && isNaN(Number(paciente.plano)) ? paciente.plano : '') || '')}
        ${campo('Nº Carteirinha', paciente.numeroCarteirinha || '')}
        ${campo('Empresa Conveniada', paciente.empresaNome || paciente.empresaConveniadaNome || '')}
        ${campo('Profissional Responsável', paciente.profissionalResponsavel || '')}
        </div></div></div>

        <div class="section"><div class="section-title">Filiação / Responsável</div><div class="section-body"><div class="grid3">
        ${campo('Nome da Mãe', paciente.nomeMae || '')}
        ${campo('Nome do Pai', paciente.nomePai || '')}
        ${campo('Responsável', paciente.nomeResponsavel || '')}
        ${campo('RG Responsável', paciente.rgResponsavel || '')}
        ${campo('CPF Responsável', paciente.cpfResponsavel || '')}
        </div></div></div>

        ${paciente.observacoes || paciente.anotacoes ? `<div class="section"><div class="section-title">Observações</div><div class="section-body"><p style="font-size:11px;white-space:pre-wrap">${paciente.observacoes || ''}${paciente.anotacoes ? (paciente.observacoes ? '\n\n' : '') + paciente.anotacoes : ''}</p></div></div>` : ''}

        <div class="section"><div class="section-title">Histórico de Consultas (últimas 30)</div><div class="section-body">${consultasHtml}</div></div>

        <div class="section"><div class="section-title">Financeiro (últimos 20)</div><div class="section-body">${financeiroHtml}</div></div>

        <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')} • Sistema <strong style="color:#0f766e">EasyClin</strong></div>
        </body></html>`;
    import('../utils/pdfGenerator').then(({
      previewDocumentoPDF
    }) => {
      previewDocumentoPDF(html, {
        fileName: `Ficha_${paciente.nome.replace(/\s+/g, '_')}.pdf`
      });
    });
  };
  const handleSavePaciente = async (pacienteData: any) => {
    try {
      let savedPaciente;
      const editandoId = pacienteEdit?.id;
      if (editandoId) {
        savedPaciente = await atualizar(editandoId, pacienteData);
        success('Paciente Atualizado', 'Dados atualizados com sucesso!');
      } else {
        savedPaciente = await criar(pacienteData);
        success('Paciente Criado', 'Paciente cadastrado com sucesso!');
      }
      // ⭐ FIX: Não fecha o modal e mantém o paciente atual com os DADOS COMPLETOS.
      // A resposta da API (savedPaciente) pode vir PARCIAL (ex.: { success: true })
      // ou sem o id; sobrescrever pacienteEdit com ela apagava o id e os campos,
      // fazendo o formulário reinicializar vazio (como um paciente novo).
      // Mesclamos: base = paciente em edição, depois os dados que acabamos de
      // salvar (completos), depois quaisquer campos retornados pelo servidor, e
      // SEMPRE preservamos um id válido.
      const idFinal = editandoId || savedPaciente?.id || pacienteEdit?.id || pacienteData?.id;
      setPacienteEdit({
        ...(pacienteEdit || {}),
        ...pacienteData,
        ...(savedPaciente && typeof savedPaciente === 'object' ? savedPaciente : {}),
        id: idFinal
      });
      return savedPaciente;
    } catch (err: any) {
      showError('Erro', err.message);
      throw err; // Propaga erro para o form
    }
  };
  const handleDeletarPaciente = (paciente: any) => {
    if (!clinicaId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    setPacienteToDelete(paciente);
  };
  const handleCancelarPaciente = (paciente: any) => {
    if (!clinicaId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    setPacienteToCancelar(paciente);
    setMotivoCancelamento('');
  };
  const confirmCancelar = async () => {
    if (!pacienteToCancelar || !motivoCancelamento.trim()) return;
    setIsCancelando(true);
    try {
      // Pega nome do usuário logado
      let nomeUsuario = 'Sistema';
      try {
        const sessao = localStorage.getItem('sessao');
        if (sessao) {
          const parsed = JSON.parse(sessao);
          nomeUsuario = parsed.usuario?.nome || 'Sistema';
        }
      } catch (e) {}
      const response = await fetch(`${API_BASE_URL}/api/pacientes/${pacienteToCancelar.id}/cancelar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          motivoCancelamento: motivoCancelamento.trim(),
          cancelamentoUsuario: nomeUsuario
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao cancelar paciente');
      }
      success('Paciente Cancelado', `O cadastro de "${pacienteToCancelar.nome}" foi cancelado.`);
      setPacienteToCancelar(null);
      setMotivoCancelamento('');
      // Recarrega lista (forçado — mesmos parâmetros, mas dados mudaram)
      recarregar();
    } catch (err: any) {
      showError('Erro', err.message);
    } finally {
      setIsCancelando(false);
    }
  };
  const handleReativarPaciente = async (paciente: any) => {
    if (!clinicaId) {
      showError('Erro', 'Clínica não selecionada');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/pacientes/${paciente.id}/reativar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao reativar paciente');
      }
      success('Paciente Reativado', `"${paciente.nome}" foi reativado com sucesso!`);
      recarregar();
    } catch (err: any) {
      showError('Erro', err.message);
    }
  };
  const confirmDelete = async () => {
    if (pacienteToDelete) {
      setIsDeleting(true);
      try {
        await deletar(pacienteToDelete.id);
        success('Paciente Excluído', 'Paciente e todos os dados vinculados foram removidos!');
        setPacienteToDelete(null);
      } catch (err: any) {
        showError('Erro', err.message);
      } finally {
        setIsDeleting(false);
      }
    }
  };
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    executarBusca(searchInput);
  };
  const handleClearSearch = () => {
    setSearchInput('');
    ultimaBuscaRef.current = '';
    executarBusca('');
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 50);
  };
  // ⭐ FIX vazamento de permissão: bloqueia se o usuário não tem 'prontuarios'.
  const podeVerProntuario = temPermissao('prontuarios');
  const handleVerProntuario = (paciente: any) => {
    if (!podeVerProntuario) {
      showError('Acesso negado', 'Você não tem permissão para acessar o prontuário. Solicite ao administrador.');
      return;
    }
    if (onIniciarAtendimento) {
      onIniciarAtendimento(paciente.id);
    }
  };
  return <div className="flex flex-col h-full overflow-hidden">
      {/* Header - fixo */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pacientes</h1>
          <p className="text-gray-500 mt-1">
            {loading ? 'Carregando...' : `${pagination.total} pacientes cadastrados`}
          </p>
        </div>
        <Button onClick={handleNovoPaciente}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Novo Paciente
        </Button>
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200" style={{
      minHeight: 0,
      overflow: 'hidden'
    }}>
        
        {/* Busca - fixa */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200">
          <form onSubmit={handleSearch}>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input ref={searchInputRef} placeholder="Buscar por nome, CPF, telefone ou email..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onFocus={handleSearchFocus} icon={loading ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div> : <SearchIcon className="w-4 h-4" />} />
                
              </div>
              {searchInput && <Button variant="ghost" onClick={handleClearSearch} type="button">
                
                  Limpar
                </Button>}
            </div>
            {searchTerm && <p className="text-sm text-gray-600 mt-2">
                🔍 Buscando: <strong>{searchTerm}</strong> • {pagination.total}{' '}
                {pagination.total === 1 ? 'resultado' : 'resultados'}
              </p>}
          </form>
        </div>

        {/* Conteúdo */}
        {loading ? <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 mt-2">Carregando pacientes...</p>
          </div> : pacientes.length === 0 ? <div className="text-center py-12">
            <p className="text-gray-600">
              {searchTerm ? 'Nenhum paciente encontrado com esse termo de busca.' : 'Nenhum paciente cadastrado ainda.'}
            </p>
          </div> : <div className="flex flex-col flex-1" style={{
        minHeight: 0,
        overflow: 'hidden'
      }}>
          
            {/* Dica - fixa */}
            <div className="flex-shrink-0 p-4 pb-2">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                💡 <strong>Dica:</strong> Clique duas vezes em um paciente para
                editar o cadastro. Use os botões de ação para ver prontuário ou
                excluir.
              </div>
            </div>

            {/* Lista de Pacientes - APENAS ESTA PARTE ROLA */}
            <div className="flex-1 overflow-y-auto px-4 pb-2" style={{
          minHeight: 0
        }}>
            
              <div className="space-y-2">
                {pacientes.map((paciente) => <div key={paciente.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all">
                
                    <div className="flex-1 cursor-pointer min-w-0" onDoubleClick={() => handleEditarPaciente(paciente)}>
                  
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-semibold flex-shrink-0">
                          {paciente.nome?.charAt(0).toUpperCase() || 'P'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900">
                              {paciente.nome}
                            </p>
                            {calcularIdade(paciente.dataNascimento) && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                                {calcularIdade(paciente.dataNascimento)}
                                {formatarNascimento(paciente.dataNascimento) && <span className="text-gray-500">
                                    {' • '}
                                    {formatarNascimento(paciente.dataNascimento)}
                                  </span>}
                              </span>}
                            {paciente.numeroContrato && <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold font-mono border border-blue-200">
                                📋 {paciente.numeroContrato}
                              </span>}
                            {paciente.status === 'cancelado' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold border border-red-200">
                                🚫 CANCELADO
                              </span>}
                            {(paciente as any).titularId && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-200 uppercase tracking-wide">
                                Dep. de {(paciente as any).titularNome || '...'}
                              </span>}
                            {!(paciente as any).titularId && (paciente as any).totalDependentes > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200 uppercase tracking-wide">
                                  Titular • {(paciente as any).totalDependentes}{' '}
                                  dep.
                                </span>}
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {paciente.telefone && <span className="mr-3">
                                📞 {paciente.telefone}
                              </span>}
                            {paciente.cpf && <span className="mr-3">CPF: {paciente.cpf}</span>}
                            {paciente.email && <span>{paciente.email}</span>}
                          </p>
                          {(() => {
                      const profId = (paciente as any).profissionalResponsavelId;
                      const profNome = profId && usuariosMap[profId] ? usuariosMap[profId] : (paciente as any).profissionalResponsavel || '';
                      return profNome ? <p className="text-xs text-teal-700 mt-0.5 font-medium">
                                🩺 Dr(a). {profNome}
                              </p> : null;
                    })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* ⭐ Botão de Feliz Aniversário — aparece apenas se hoje é aniversário do paciente */}
                      {(() => {
                  // ⭐ Recurso desligado nas Configurações, ou paciente que optou
                  // por não receber: o botão não deve nem aparecer.
                  if (!aniversarioHabilitado) return null;
                  if ((paciente as any).felicitarAniversario === 0) return null;
                  const dn = paciente.dataNascimento || '';
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
                  return <Button variant="secondary" size="sm" onClick={async () => {
                    if (!paciente.telefone) {
                      showError('Sem Telefone', 'Paciente sem telefone cadastrado');
                      return;
                    }
                    try {
                      const resp = await fetch(`${API_BASE_URL}/api/aniversarios/enviar`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          clinicaId,
                          pacienteId: paciente.id,
                          pacienteNome: paciente.nome,
                          telefone: paciente.telefone
                        })
                      });
                      const result = await resp.json();
                      // Recusado por regra (desativado / opt-out / já enviado)
                      if (result.skipped) {
                        showError('Felicitação não enviada', result.message || 'O envio de felicitação está desativado.');
                      } else if (result.success) {
                        success('Felicitação Enviada! 🎂', `Mensagem de aniversário enviada para ${paciente.nome}`);
                      } else {
                        showError('Erro ao Enviar', result.error || 'Falha ao enviar felicitação');
                      }
                    } catch (err: any) {
                      showError('Erro ao Enviar', 'Erro ao enviar felicitação: ' + err.message);
                    }
                  }} className="text-pink-700 bg-pink-50 hover:bg-pink-100 border-pink-200 animate-pulse" title={`🎂 Hoje é aniversário de ${paciente.nome}! Clique para enviar felicitação via WhatsApp`}>
                        
                            <span className="mr-1">🎂</span>
                            Feliz Aniversário!
                          </Button>;
                })()}

                      {/* ⭐ FIX vazamento: só renderiza o botão se o usuário tem permissão. */}
                      {podeVerProntuario && <Button variant="secondary" size="sm" onClick={() => handleVerProntuario(paciente)} className="text-teal-700 bg-teal-50 hover:bg-teal-100 border-teal-200">
                    
                          <StethoscopeIcon className="w-4 h-4 mr-1" />
                          Prontuário
                        </Button>}

                      <Button variant="ghost" size="sm" onClick={() => handleEditarPaciente(paciente)}>
                    
                        Editar
                      </Button>

                      <Button variant="ghost" size="sm" onClick={() => handleImprimirPaciente(paciente)} title="Imprimir ficha do paciente">
                    
                        <PrinterIcon className="w-4 h-4" />
                      </Button>

                      {/* Conversa por WhatsApp (número oficial da Meta, com WAHA como alternativa) */}
                      <Button variant="ghost" size="sm" onClick={() => setPacienteConversa(paciente)} className="text-emerald-700 hover:bg-emerald-50" title="Ver mensagens e conversar por WhatsApp">
                    
                        <MessageSquareIcon className="w-4 h-4" />
                      </Button>

                      {paciente.status === 'cancelado' ? <Button variant="ghost" size="sm" onClick={() => handleReativarPaciente(paciente)} className="text-green-600 hover:bg-green-50" title={`Cancelado em ${paciente.canceladoEm ? new Date(paciente.canceladoEm).toLocaleDateString('pt-BR') : '?'}\nMotivo: ${paciente.motivoCancelamento || '?'}\nPor: ${paciente.cancelamentoUsuario || '?'}`}>
                    
                          <RotateCcwIcon className="w-4 h-4 mr-1" />
                          Reativar
                        </Button> : <Button variant="ghost" size="sm" onClick={() => handleCancelarPaciente(paciente)} className="text-orange-600 hover:bg-orange-50" title="Cancelar cadastro do paciente (preserva dados, pode reativar depois)">
                    
                          <BanIcon className="w-4 h-4" />
                        </Button>}

                      <Button variant="ghost" size="sm" onClick={() => handleDeletarPaciente(paciente)} className="text-red-600 hover:bg-red-50">
                    
                        <Trash2Icon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>)}
              </div>
            </div>

            {/* Paginação - fixa no rodapé */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    Mostrando{' '}
                    <strong>
                      {(pagination.page - 1) * pagination.limit + 1}
                    </strong>{' '}
                    a{' '}
                    <strong>
                      {Math.min(pagination.page * pagination.limit, pagination.total)}
                    </strong>{' '}
                    de <strong>{pagination.total}</strong> pacientes
                  </p>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Por página:</label>
                    <select value={pagination.limit} onChange={(e) => mudarLimite(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-sm">
                    
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => irParaPagina(1)} disabled={!pagination.hasPrev} title="Primeira página">
                  
                    <ChevronsLeftIcon className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => irParaPagina(pagination.page - 1)} disabled={!pagination.hasPrev} title="Página anterior">
                  
                    <ChevronLeftIcon className="w-4 h-4" />
                  </Button>

                  <div className="flex items-center gap-2 px-4">
                    <span className="text-sm text-gray-600">Página</span>
                    <input type="number" min={1} max={pagination.totalPages} value={pagination.page} onChange={(e) => {
                  const page = Number(e.target.value);
                  if (page >= 1 && page <= pagination.totalPages) {
                    irParaPagina(page);
                  }
                }} className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                  

                    <span className="text-sm text-gray-600">
                      de {pagination.totalPages}
                    </span>
                  </div>

                  <Button variant="ghost" size="sm" onClick={() => irParaPagina(pagination.page + 1)} disabled={!pagination.hasNext} title="Próxima página">
                  
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => irParaPagina(pagination.totalPages)} disabled={!pagination.hasNext} title="Última página">
                  
                    <ChevronsRightIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>}
      </div>

      {/* Conversa por WhatsApp a partir do resultado da pesquisa */}
      <ConversaWhatsAppModal isOpen={!!pacienteConversa} onClose={() => setPacienteConversa(null)} clinicaId={clinicaId} pacienteId={pacienteConversa?.id || ''} pacienteNome={pacienteConversa?.nome || 'Paciente'} pacienteTelefone={pacienteConversa?.telefone || pacienteConversa?.celular || ''} />

      {/* Modal de Paciente */}
      <PacienteForm isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setPacienteEdit(null);
      setPacienteEditStack([]);
    }} onSave={handleSavePaciente} paciente={pacienteEdit} onNavigate={onNavigate} onAbrirRelacionado={handleAbrirRelacionado} onVoltar={handleVoltar} temVoltar={pacienteEditStack.length > 0} />
      

      {/* Modal de Confirmação de Exclusão */}
      {pacienteToDelete && <Modal isOpen={true} onClose={() => !isDeleting && setPacienteToDelete(null)} title="⚠️ Excluir Paciente em Cascata" size="medium" footer={<>
              <Button variant="ghost" onClick={() => setPacienteToDelete(null)} disabled={isDeleting}>
            
                Cancelar
              </Button>
              <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
            
                {isDeleting ? <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Excluindo...
                  </> : <>
                    <Trash2Icon className="w-4 h-4 mr-2" />
                    Confirmar Exclusão
                  </>}
              </Button>
            </>}>
        
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-800">
                  Atenção! Esta ação é irreversível.
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  Ao excluir o paciente{' '}
                  <strong>"{pacienteToDelete.nome}"</strong>, os seguintes dados
                  serão excluídos permanentemente:
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>prontuários</strong> e históricos
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todas as <strong>consultas</strong> agendadas e realizadas
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>documentos</strong> anexados
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Todos os <strong>dados financeiros</strong>
              </p>
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                <strong>Dependentes</strong> vinculados
              </p>
            </div>

            <p className="text-sm text-gray-600 text-center">
              Tem certeza que deseja continuar?
            </p>
          </div>
        </Modal>}

      {/* Modal de Cancelamento de Paciente */}
      {pacienteToCancelar && <Modal isOpen={true} onClose={() => !isCancelando && setPacienteToCancelar(null)} title="🚫 Cancelar Cadastro do Paciente" size="medium" footer={<>
              <Button variant="ghost" onClick={() => setPacienteToCancelar(null)} disabled={isCancelando}>
            
                Voltar
              </Button>
              <Button onClick={confirmCancelar} className="bg-orange-600 hover:bg-orange-700" disabled={isCancelando || !motivoCancelamento.trim()}>
            
                {isCancelando ? <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Cancelando...
                  </> : <>
                    <BanIcon className="w-4 h-4 mr-2" />
                    Confirmar Cancelamento
                  </>}
              </Button>
            </>}>
        
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertTriangleIcon className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-orange-800">
                  Cancelar cadastro de "{pacienteToCancelar.nome}"
                </h4>
                <p className="text-sm text-orange-700 mt-1">
                  O paciente será marcado como <strong>cancelado</strong>. Os
                  dados serão preservados e o cadastro poderá ser reativado
                  posteriormente.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo do Cancelamento *
              </label>
              <textarea value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Informe o motivo do cancelamento do cadastro..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm resize-none" rows={4} autoFocus />
            

              {!motivoCancelamento.trim() && <p className="text-xs text-red-500 mt-1">
                  O motivo é obrigatório para cancelar o cadastro.
                </p>}
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">
                📋 O cancelamento ficará registrado com data, hora e nome do
                usuário que realizou a ação.
              </p>
            </div>
          </div>
        </Modal>}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>;
}