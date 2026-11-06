// ==================== MODO DEMONSTRAÇÃO (?demo=1) ====================
// Usado pelo palco do Vídeo de Demonstração. Neste modo o sistema:
//   • NUNCA fala com o servidor: toda chamada de dados é respondida aqui,
//     com os dados fictícios de data/demoFicticio.ts;
//   • NÃO lê nem grava o armazenamento real do navegador (a sessão logada,
//     caches de pacientes etc.): usa um armazenamento em memória que começa
//     só com uma sessão fictícia;
//   • não abre conexões em tempo real (EventSource / WebSocket).
// Resultado: nenhum dado real pode aparecer no vídeo, em nenhuma clínica.
//
// Este arquivo precisa ser o PRIMEIRO import do index.tsx.

import {
  DEMO_CLINICA,
  DEMO_CONSULTAS,
  DEMO_CONVENIOS,
  DEMO_ESPECIALIDADES,
  DEMO_MEDICAMENTOS,
  DEMO_PLANOS,
  DEMO_MENSAGENS,
  DEMO_OPERADORA,
  DEMO_PACIENTES,
  DEMO_PROCEDIMENTOS,
  DEMO_PRONTUARIOS,
  DEMO_TEMPLATES_META,
  DEMO_USUARIOS } from
'../data/demoFicticio';

// ─── Quando o modo demonstração liga ────────────────────────────────────────
// 1) ?demo=1 → palco do Vídeo de Demonstração (sem botão, sem faixa).
// 2) Visitante: quem abre o sistema sem sessão entra direto na demonstração,
//    com o botão "Entrar" para ir à tela de login de verdade.
//    Depois que alguém escolhe entrar (ou faz login) neste navegador, a
//    preferência fica gravada e o sistema passa a abrir no login; a tela de
//    login tem o link "Ver demonstração" para voltar.
export const CHAVE_PREFERE_LOGIN = 'easyclin-abrir-no-login';

/** Links públicos (assinatura, confirmação, sala online, documentos legais) usam a API real */
const ROTAS_PUBLICAS = [
'/assinar/',
'/confirmar/',
'/consulta-online/',
'/falar/',
'/politica-de-privacidade',
'/termos-de-servico',
'/exclusao-de-dados'];

function lerArmazenamento(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarArmazenamento(chave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(chave);else
    window.localStorage.setItem(chave, valor);
  } catch {

    /* navegador sem armazenamento: segue sem lembrar a preferência */}
}

const parametros =
typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

/** Palco do Vídeo de Demonstração */
export const DEMO_VIDEO = parametros.get('demo') === '1';

// ?login=1 → o visitante clicou em "Entrar": lembra e limpa o endereço
if (typeof window !== 'undefined' && !DEMO_VIDEO && parametros.get('login') === '1') {
  gravarArmazenamento(CHAVE_PREFERE_LOGIN, '1');
  parametros.delete('login');
  const resto = parametros.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (resto ? `?${resto}` : '') + window.location.hash
  );
}

/** Visitante sem sessão vendo a demonstração (com botão de login) */
export const DEMO_VISITANTE =
typeof window !== 'undefined' &&
!DEMO_VIDEO &&
!ROTAS_PUBLICAS.some((r) => window.location.pathname.startsWith(r)) &&
!lerArmazenamento('sessao') &&
lerArmazenamento(CHAVE_PREFERE_LOGIN) !== '1';

export const MODO_DEMO = DEMO_VIDEO || DEMO_VISITANTE;

/** Sai da demonstração e abre a tela de login real (recarrega a página) */
export function irParaLogin() {
  window.location.href = '/?login=1';
}

/** Na tela de login: volta a abrir o sistema na demonstração */
export function verDemonstracao() {
  gravarArmazenamento(CHAVE_PREFERE_LOGIN, null);
  window.location.href = '/';
}

// ─── Helpers de data ────────────────────────────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, '0');
const chaveData = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Desloca N dias úteis a partir de hoje (fim de semana não tem agenda) */
function diaUtil(offset: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (offset === 0) {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  }
  const passo = offset > 0 ? 1 : -1;
  let falta = Math.abs(offset);
  while (falta > 0) {
    d.setDate(d.getDate() + passo);
    if (d.getDay() !== 0 && d.getDay() !== 6) falta -= 1;
  }
  return d;
}

// ─── Montagem dos registros ─────────────────────────────────────────────────
const usuario = (id: string) => DEMO_USUARIOS.find((u) => u.id === id)!;

const pacientes = DEMO_PACIENTES.map((p, i) => ({
  ...p,
  clinicaId: DEMO_CLINICA.id,
  matricula: String(1001 + i),
  status: 'ativo',
  cpf: `000.000.${String(101 + i).padStart(3, '0')}-00`,
  telefone: `(11) 90000-${String(1001 + i)}`,
  email: `${p.nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@exemplo.com`,
  estadoCivil: 'solteiro',
  dificuldadeLocomocao: false,
  convenio: i % 3 === 0 ? 'Particular' : 'Plano Exemplo',
  convenioNome: i % 3 === 0 ? 'Particular' : 'Plano Exemplo',
  cidade: 'São Paulo',
  uf: 'SP',
  dataCadastro: '2025-02-10',
  criadoEm: '2025-02-10T10:00:00.000Z'
}));
const paciente = (id: string) => pacientes.find((p) => p.id === id)!;

const consultas = DEMO_CONSULTAS.map((c, i) => {
  const prof = usuario(c.prof);
  const pac = paciente(c.paciente);
  const proc = DEMO_PROCEDIMENTOS.find((x) => x.id === c.proc)!;
  const data = chaveData(diaUtil(c.dia));
  const realizada = c.status === 'realizada';
  return {
    id: `demo-consulta-${i + 1}`,
    clinicaId: DEMO_CLINICA.id,
    pacienteId: pac.id,
    pacienteNome: pac.nome,
    pacienteTelefone: pac.telefone,
    pacienteDataNascimento: pac.dataNascimento,
    pacienteConvenio: pac.convenio,
    pacienteConvenioNome: pac.convenioNome,
    pacienteDificuldadeLocomocao: false,
    tipo: prof.tipo === 'dentista' ? 'odontologica' : 'medica',
    tipoAgendamento: 'normal',
    modalidade: 'presencial',
    data,
    horario: c.horario,
    duracao: 30,
    status: c.status,
    profissionalId: prof.id,
    profissional: prof.nome,
    profissionalNomeJoin: prof.nome,
    profissionalTitulo: prof.titulo,
    profissionalTipo: prof.tipo,
    profissionalCrm: prof.crm,
    profissionalUf: prof.uf,
    procedimentoId: proc.id,
    procedimentoNome: proc.nome,
    procedimentoNomeJoin: proc.nome,
    valor: proc.valor,
    lembreteEnviado: true,
    confirmacaoRecebidaEm: c.status === 'confirmada' ? `${data}T07:10:00` : null,
    canalCancelamento: c.status === 'cancelada' ? 'WhatsApp' : null,
    canceladoPor: c.status === 'cancelada' ? 'Paciente' : null,
    motivoCancelamento: c.status === 'cancelada' ? 'Imprevisto no trabalho' : null,
    horaChegada: realizada || c.status === 'aguardando' ? `${data}T${c.horario}:00` : null,
    statusAtendimento: realizada ? 'finalizado' : c.status === 'aguardando' ? 'aguardando' : null
  };
});

// ─── Cobranças (parcelas) ───────────────────────────────────────────────────
const hojeMeio = new Date();
hojeMeio.setHours(12, 0, 0, 0);
const VALORES_PARCELA = [189.9, 249, 320];
const parcelas = pacientes.slice(0, 10).flatMap((p, i) =>
[-1, 0, 1].map((mes, n) => {
  const venc = new Date(hojeMeio.getFullYear(), hojeMeio.getMonth() + mes, 5 + i * 2 % 20, 12);
  const passou = venc < hojeMeio;
  const status = mes < 0 ? 'pago' : mes === 0 && passou ? i % 3 === 0 ? 'vencido' : 'pago' : 'pendente';
  const vencimento = chaveData(venc);
  return {
    id: `demo-parcela-${i + 1}-${n + 1}`,
    pacienteId: p.id,
    profissionalId: 'demo-prof-1',
    numeroParcela: n + 1,
    valorParcela: VALORES_PARCELA[i % 3],
    dataVencimento: vencimento,
    status,
    dataPagamento: status === 'pago' ? vencimento : undefined,
    formaPagamento: status === 'pago' ? i % 2 ? 'pix' : 'cartao' : undefined,
    observacoes: 'Plano de tratamento',
    criadoEm: '2025-02-10T10:00:00.000Z',
    dataEmissao: '2025-02-10'
  };
})
);

// ─── Ponto ──────────────────────────────────────────────────────────────────
const funcionariosPonto = DEMO_USUARIOS.map((u) => ({ id: u.id, nome: u.nome, tipo: u.tipo }));
const MARCACOES = [
['entrada', '08:0'],
['saida', '12:0'],
['entrada', '13:0'],
['saida', '17:5']] as
const;
const registrosPonto = [4, 3, 2, 1, 0].
flatMap((offset) => {
  const dia = chaveData(diaUtil(-offset));
  const marcacoes = offset === 0 ? MARCACOES.slice(0, 2) : MARCACOES;
  return DEMO_USUARIOS.flatMap((u, ui) =>
  marcacoes.map(([tipo, hora], mi) => ({
    id: `demo-ponto-${dia}-${u.id}-${mi}`,
    usuarioId: u.id,
    usuarioNome: u.nome,
    tipo,
    dataHora: `${dia}T${hora}${(ui * 3 + offset + mi) % 10}:00`,
    dia
  }))
  );
}).
sort((a, b) => b.dataHora.localeCompare(a.dataHora));

function relatorioPonto(q: URLSearchParams) {
  const inicio = q.get('inicio') || '';
  const fim = q.get('fim') || '';
  const quem = q.get('usuarioId') || '';
  const minutosDe = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
  const funcionarios = DEMO_USUARIOS.filter((u) => !quem || u.id === quem).map((u) => {
    const doUsuario = registrosPonto.
    filter((r) => r.usuarioId === u.id && (!inicio || r.dia >= inicio) && (!fim || r.dia <= fim)).
    sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    const dias = [...new Set(doUsuario.map((r) => r.dia))].map((dia) => {
      const registros = doUsuario.filter((r) => r.dia === dia);
      let minutos = 0;
      for (let i = 0; i + 1 < registros.length; i += 2) {
        minutos += minutosDe(registros[i + 1].dataHora) - minutosDe(registros[i].dataHora);
      }
      return { dia, minutos, registros: registros.map(({ id, tipo, dataHora }) => ({ id, tipo, dataHora })) };
    });
    const totalMinutos = dias.reduce((s, d) => s + d.minutos, 0);
    return { usuarioId: u.id, usuarioNome: u.nome, totalMinutos, totalHoras: Math.round(totalMinutos / 60 * 10) / 10, dias };
  });
  return { periodo: { inicio, fim }, funcionarios };
}

// ─── Auditoria (LGPD) ───────────────────────────────────────────────────────
const ACOES_AUDITORIA = [
['ACESSO_PRONTUARIO', 'demo-prof-1', 'Abriu o prontuário'],
['EDICAO_ANAMNESE', 'demo-prof-1', 'Atualizou a anamnese'],
['EDICAO_PRESCRICAO', 'demo-prof-1', 'Registrou prescrição'],
['IMPRESSAO_PRONTUARIO', 'demo-prof-1', 'Imprimiu o prontuário'],
['CRIACAO_ATENDIMENTO', 'demo-recepcao', 'Iniciou atendimento'],
['ACESSO_PRONTUARIO', 'demo-prof-2', 'Abriu o prontuário'],
['EDICAO_ODONTOGRAMA', 'demo-prof-2', 'Atualizou o odontograma'],
['EDICAO_EVOLUCAO', 'demo-prof-3', 'Registrou evolução'],
['ACESSO_PRONTUARIO', 'demo-prof-3', 'Abriu o prontuário'],
['EDICAO_EXAME', 'demo-prof-3', 'Solicitou exames']] as
const;
const auditoria = Array.from({ length: 18 }, (_, i) => {
  const [acao, quem, detalhes] = ACOES_AUDITORIA[i % ACOES_AUDITORIA.length];
  const u = usuario(quem);
  const pac = pacientes[i * 5 % pacientes.length];
  const quando = new Date(Date.now() - (i * 37 + 8) * 60000);
  return {
    id: `demo-audit-${i + 1}`,
    clinicaId: DEMO_CLINICA.id,
    criadoEm: quando.toISOString(),
    usuarioId: u.id,
    usuarioNome: u.nome,
    usuarioTipo: u.tipo,
    acao,
    pacienteId: pac.id,
    pacienteNome: pac.nome,
    detalhes,
    ip: `10.0.0.${20 + i % 4}`
  };
});

const agendas = DEMO_USUARIOS.filter((u) => u.tipo !== 'admin').map((u) => ({
  id: `demo-agenda-${u.id}`,
  clinicaId: DEMO_CLINICA.id,
  profissionalId: u.id,
  profissionalNome: u.nome,
  especialidade: u.tipo,
  ativo: true,
  criadoEm: '2025-01-02T09:00:00.000Z',
  horarios: [1, 2, 3, 4, 5].map((dia) => ({
    id: `demo-horario-${u.id}-${dia}`,
    agendaId: `demo-agenda-${u.id}`,
    diaSemana: dia,
    horaInicio: '08:00',
    horaFim: '17:00',
    intervaloInicio: '12:00',
    intervaloFim: '13:00',
    duracaoConsultaPadrao: 30,
    recorrencia: 'toda_semana',
    datasEspecificas: null,
    horariosManuais: null
  }))
}));

/** Dias úteis das próximas semanas liberados (o resto fica com cadeado) */
function diasAbertos() {
  const lista: {data: string;status: string;}[] = [];
  for (let i = -10; i <= 15; i += 1) lista.push({ data: chaveData(diaUtil(i)), status: 'aberto' });
  return lista;
}

const mensagens = DEMO_MENSAGENS.map((m, i) => {
  const pac = paciente(m.paciente);
  return {
    id: `demo-msg-${i + 1}`,
    clinicaId: DEMO_CLINICA.id,
    pacienteId: pac.id,
    pacienteNome: pac.nome,
    telefone: pac.telefone,
    tipo: m.tipo,
    conteudo: m.conteudo,
    dataHora: new Date(Date.now() - m.minutos * 60000).toISOString(),
    status: m.tipo === 'enviada' ? 'lida' : 'entregue',
    canal: 'whatsapp'
  };
});

const prontuarios = DEMO_PRONTUARIOS.map((p, i) => {
  const pac = paciente(p.paciente);
  return {
    id: `demo-pront-${i + 1}`,
    clinicaId: DEMO_CLINICA.id,
    pacienteId: pac.id,
    pacienteNome: pac.nome,
    alergias: p.alergias,
    doencasCronicas: p.doencasCronicas,
    medicamentosEmUso: p.medicamentosEmUso,
    tipoSanguineo: p.tipoSanguineo,
    data: chaveData(diaUtil(-1 - i)),
    tipo: 'medica',
    profissional: 'Helena Duarte',
    queixaPrincipal: 'Consulta de rotina',
    criadoEm: '2025-03-01T10:00:00.000Z',
    atualizadoEm: new Date().toISOString(),
    atendimentos: []
  };
});

const SESSAO_DEMO = {
  usuario: DEMO_USUARIOS[0],
  operadoraSelecionada: DEMO_OPERADORA,
  clinicaAtual: DEMO_CLINICA
};

const META_CONFIG = {
  id: 'demo-meta',
  clinicaId: DEMO_CLINICA.id,
  apiVersion: 'v21.0',
  phoneNumberId: '000000000000000',
  wabaId: '000000000000000',
  accessToken: '',
  tokenConfigurado: true,
  numeroExibicao: '+55 11 90000-0000',
  ativo: true,
  preferencial: true,
  verifyToken: 'demonstracao',
  templates: {
    confirmacao: { name: 'confirma_consulta', language: 'pt_BR', temBotaoUrl: true },
    lembrete: { name: 'lembrete_consulta', language: 'pt_BR', temBotaoUrl: false },
    confirmacaoAviso: { name: 'aviso_de_confirmacao', language: 'pt_BR', temBotaoUrl: false },
    cancelamento: { name: 'aviso_cancelamento', language: 'pt_BR', temBotaoUrl: false },
    aniversario: { name: 'feliz_aniversario', language: 'pt_BR', temBotaoUrl: false }
  },
  textos: { local: '', numeroAtendimento: '', instrucoesPreConsulta: '', informacoesImportantes: '', logoUrl: '' }
};

// ─── Roteador das respostas ─────────────────────────────────────────────────
function responderGet(caminho: string, q: URLSearchParams): unknown {
  const partes = caminho.split('/').filter(Boolean);
  const [recurso, id, sub] = partes;

  switch (recurso) {
    case 'health':
      return { ok: true, status: 'ok' };
    case 'usuarios':
      if (id) return DEMO_USUARIOS.find((u) => u.id === id) || DEMO_USUARIOS[0];
      return DEMO_USUARIOS;
    case 'clinicas':
      if (id && sub) return {};
      return id ? DEMO_CLINICA : [DEMO_CLINICA];
    case 'operadoras':
      return id ? DEMO_OPERADORA : [DEMO_OPERADORA];
    case 'pacientes':{
        if (id) return pacientes.find((p) => p.id === id) || pacientes[0];
        const busca = (q.get('search') || '').toLowerCase();
        const filtrados = busca ? pacientes.filter((p) => p.nome.toLowerCase().includes(busca)) : pacientes;
        const limite = Number(q.get('limit')) || filtrados.length;
        return {
          data: filtrados.slice(0, limite),
          pagination: { total: filtrados.length, page: 1, limit: limite, totalPages: 1 }
        };
      }
    case 'consultas':{
        if (id === 'datas-com-consultas') return [...new Set(consultas.map((c) => c.data))];
        if (id) return consultas.find((c) => c.id === id) || {};
        const ini = q.get('dataInicio') || q.get('data') || '';
        const fim = q.get('dataFim') || q.get('data') || '';
        return consultas.filter((c) => (!ini || c.data >= ini) && (!fim || c.data <= fim));
      }
    case 'agendas':
      if (id === 'dias-abertos') return diasAbertos();
      return agendas;
    case 'procedimentos':
      return DEMO_PROCEDIMENTOS;
    case 'convenios':{
        const lista = DEMO_CONVENIOS.map((c) => ({
          ...c,
          clinicaId: DEMO_CLINICA.id,
          ativo: true,
          criadoEm: '2025-01-05T09:00:00.000Z',
          planos: DEMO_PLANOS.filter((pl) => pl.convenioId === c.id).map((pl) => ({ ...pl, clinicaId: DEMO_CLINICA.id, ativo: true, criadoEm: '2025-01-05T09:00:00.000Z' }))
        }));
        return id ? lista.find((c) => c.id === id) || lista[0] : lista;
      }
    case 'planos-saude':{
        const conv = q.get('convenioId');
        return DEMO_PLANOS.filter((pl) => !conv || pl.convenioId === conv).map((pl) => ({
          ...pl,
          clinicaId: DEMO_CLINICA.id,
          ativo: true,
          criadoEm: '2025-01-05T09:00:00.000Z'
        }));
      }
    case 'especialidades':
      return DEMO_ESPECIALIDADES.map((e) => ({ ...e, ativa: 1, criadoEm: '2025-01-05T09:00:00.000Z' }));
    case 'medicamentos':{
        const lista = DEMO_MEDICAMENTOS.map((m) => ({ ...m, criadoEm: '2025-01-05T09:00:00.000Z' }));
        if (id === 'estatisticas') {
          const conta = (t: string) => lista.filter((m) => m.tarja === t).length;
          return { total: lista.length, vermelha: conta('vermelha'), preta: conta('preta'), amarela: conta('amarela'), sem_tarja: conta('sem_tarja') };
        }
        if (id) return lista.find((m) => m.id === id) || lista[0];
        const busca = (q.get('search') || '').toLowerCase();
        const filtrados = busca ? lista.filter((m) => m.nome.toLowerCase().includes(busca)) : lista;
        return {
          data: filtrados,
          pagination: { page: 1, limit: 50, total: filtrados.length, totalPages: 1, hasNext: false, hasPrev: false }
        };
      }
    case 'mensagens':
      return mensagens;
    case 'prontuarios':
      if (id) return prontuarios.find((p) => p.id === id) || prontuarios[0];
      return prontuarios;
    case 'whatsapp-config':
      return {
        clinicaId: DEMO_CLINICA.id,
        provider: 'session',
        serverUrl: 'https://demonstracao.exemplo',
        sessionName: 'demonstracao',
        ativo: true,
        horasAntecedencia: 24,
        enviarConfirmacao: true,
        mensagemTemplate: ''
      };
    case 'whatsapp':
      if (id === 'status') return { status: 'WORKING', isReady: true };
      return [];
    case 'whatsapp-meta':
      if (id === 'config') return META_CONFIG;
      if (id === 'templates') return { templates: DEMO_TEMPLATES_META, total: DEMO_TEMPLATES_META.length };
      if (id === 'disponivel') return { disponivel: true, textos: META_CONFIG.textos };
      if (id === 'signup') return { disponivel: true, appId: '', configId: '', apiVersion: 'v21.0', faltando: [] };
      if (id === 'webhook-info') {
        return {
          callbackUrl: 'https://demonstracao.exemplo/api/whatsapp-meta/webhook',
          campoObrigatorio: 'messages',
          verifyTokenConfigurado: true,
          tokenConfigurado: true,
          phoneNumberId: META_CONFIG.phoneNumberId,
          wabaId: META_CONFIG.wabaId,
          assinaturaWaba: true,
          callbackRegistrado: true,
          recebimentoPronto: true,
          eventosRecebidos: 128,
          ultimoEventoEm: new Date(Date.now() - 12 * 60000).toISOString()
        };
      }
      return {};
    case 'parcelas':
      return id ? parcelas.find((p) => p.id === id) || {} : parcelas;
    case 'ponto':
      if (id === 'funcionarios') return funcionariosPonto;
      if (id === 'registros') return registrosPonto;
      if (id === 'relatorio') return relatorioPonto(q);
      return [];
    case 'audit-log':
      return auditoria;
    default:
      // Qualquer outra tela recebe "lista vazia": nunca dado real.
      return [];
  }
}

let contadorId = 0;
function responder(url: URL, metodo: string): Response {
  const caminho = url.pathname.replace(/^.*?\/api\//, '');
  const corpo =
  metodo === 'GET' || metodo === 'HEAD' ?
  responderGet(caminho, url.searchParams) :
  { ok: true, success: true, id: `demo-${++contadorId}`, mensagem: 'Demonstração: nada foi gravado.' };
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

const DOMINIOS_ANUNCIO =
/(^|\.)(googlesyndication\.com|doubleclick\.net|googleadservices\.com|googletagservices\.com|google\.com|gstatic\.com|adtrafficquality\.google)$/;

/** Só arquivos do próprio sistema (scripts, estilos) e fontes podem sair para a rede */
function podeIrParaRede(url: URL): boolean {
  if (url.pathname.includes('/api/')) return false;
  if (url.origin === window.location.origin) return true;
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return true;
  // Visitante: anúncios do AdSense precisam falar com o Google
  return DEMO_VISITANTE && DOMINIOS_ANUNCIO.test(url.hostname);
}

// ─── Instalação ─────────────────────────────────────────────────────────────
function instalar() {
  // 1) Armazenamento em memória: nada do navegador real é lido ou alterado
  const memoria = { local: new Map<string, string>(), sessao: new Map<string, string>() };
  memoria.local.set('sessao', JSON.stringify(SESSAO_DEMO));
  // Token fictício: sem ele o useAuth descarta a sessão (exige login com token)
  memoria.local.set('easyclin_auth_token', 'demonstracao');
  const localReal = window.localStorage;
  const mapa = (s: Storage) => s === localReal ? memoria.local : memoria.sessao;
  const proto = Storage.prototype;
  proto.getItem = function (this: Storage, k: string) {
    const v = mapa(this).get(String(k));
    return v === undefined ? null : v;
  };
  proto.setItem = function (this: Storage, k: string, v: string) {
    mapa(this).set(String(k), String(v));
  };
  proto.removeItem = function (this: Storage, k: string) {
    mapa(this).delete(String(k));
  };
  proto.clear = function (this: Storage) {
    mapa(this).clear();
  };
  proto.key = function (this: Storage, i: number) {
    return [...mapa(this).keys()][i] ?? null;
  };
  try {
    Object.defineProperty(proto, 'length', {
      configurable: true,
      get(this: Storage) {
        return mapa(this).size;
      }
    });
  } catch {

    // navegador não permite redefinir: getItem/setItem já bastam
  }
  // 2) Toda chamada de dados é respondida localmente
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const bruto = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const metodo = (init?.method || (entrada instanceof Request ? entrada.method : 'GET')).toUpperCase();
    let url: URL;
    try {
      url = new URL(bruto, window.location.href);
    } catch {
      return responder(new URL('/api/desconhecido', window.location.origin), metodo);
    }
    if (podeIrParaRede(url)) return fetchOriginal(entrada, init);
    return responder(url, metodo);
  };

  // 3) Sem conexões em tempo real e sem envios em segundo plano
  class ConexaoInerte extends EventTarget {
    readyState = 0;
    url: string;
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    constructor(url: string | URL) {
      super();
      this.url = String(url);
    }
    send() {}
    close() {
      this.readyState = 2;
    }
  }
  ;(window as unknown as {EventSource: unknown;}).EventSource = ConexaoInerte;
  (window as unknown as {WebSocket: unknown;}).WebSocket = ConexaoInerte;
  // No vídeo nada sai da tela; o visitante pode abrir os anúncios normalmente
  if (DEMO_VIDEO) {
    if (navigator.sendBeacon) navigator.sendBeacon = () => true;
    window.open = () => null;
  }
}

// ─── Faixa "Demonstração" com o botão Entrar (só para o visitante) ──────────
function mostrarFaixaVisitante() {
  const montar = () => {
    if (document.getElementById('easyclin-faixa-demo')) return;
    const faixa = document.createElement('div');
    faixa.id = 'easyclin-faixa-demo';
    faixa.setAttribute('role', 'region');
    faixa.setAttribute('aria-label', 'Modo demonstração');
    faixa.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483000',
    'display:flex', 'align-items:center', 'gap:12px', 'max-width:calc(100vw - 32px)',
    'padding:10px 10px 10px 16px', 'border-radius:14px',
    'background:#0f172a', 'color:#f8fafc', 'box-shadow:0 10px 30px rgba(0,0,0,.25)',
    'font:500 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif'].
    join(';');

    const texto = document.createElement('span');
    texto.innerHTML =
    '<strong style="display:block;font-size:13px">Modo demonstração</strong>' +
    '<span style="opacity:.75;font-size:12px">Dados fictícios — nada é gravado.</span>';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Entrar';
    botao.title = 'Ir para a tela de login';
    botao.style.cssText = [
    'flex:none', 'padding:9px 18px', 'border:0', 'border-radius:10px', 'cursor:pointer',
    'background:#14b8a6', 'color:#fff', 'font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif'].
    join(';');
    botao.addEventListener('mouseenter', () => botao.style.background = '#0d9488');
    botao.addEventListener('mouseleave', () => botao.style.background = '#14b8a6');
    botao.addEventListener('click', irParaLogin);

    faixa.append(texto, botao);
    document.body.appendChild(faixa);
  };
  if (document.body) montar();else
  document.addEventListener('DOMContentLoaded', montar, { once: true });

  // "Sair" dentro da demonstração leva ao login real
  window.addEventListener('user-logout', irParaLogin);
}

if (MODO_DEMO) instalar();
if (DEMO_VISITANTE) mostrarFaixaVisitante();

// Quem já entrou com login neste navegador passa a abrir no login
// (inclusive depois de sair ou de a sessão expirar).
if (!MODO_DEMO && lerArmazenamento('sessao')) gravarArmazenamento(CHAVE_PREFERE_LOGIN, '1');