import { useCallback, useEffect, useRef, useState } from 'react';
import { assistenteApi, ErroAssistente } from '../utils/assistenteApi';
import { useVozAssistente } from './useVozAssistente';
import { useContextoProntuario } from './useContextoProntuario';
import { entregarNaEtapa, lerContextoProntuario, NOME_CAMPO, NOME_ETAPA } from '../utils/ditadoProntuario';
import { pedirAberturaPaciente } from '../utils/aberturaPaciente';
import type { DitadoProntuario, EtapaAssistente, MensagemAssistente, ResumoDitado } from '../types/assistente';

interface Opcoes {
  clinicaId: string;
  usuarioId: string;
  onNavigate: (page: string, date?: string, profissionalId?: string) => void;
  onAbrirProntuario?: (pacienteId: string) => void;
  /** Página aberta agora (id do menu): vai como contexto para a IA. */
  telaAtual?: string;
}

export type ModoAssistente = 'agenda' | 'prontuario';

const LIMITE_AGENDA_SEG = 30;
// Ditado clínico costuma ser mais longo que um pedido de agenda.
const LIMITE_DITADO_SEG = 120;
const CHAVE_VOZ = 'assistente_voz_ativa';

const novoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function escolherMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

const MOTIVO_FALHA: Record<string, string> = {
  somente_leitura: 'o atendimento está assinado ou o seu perfil só visualiza',
  sem_campos: 'nenhum campo reconhecido',
  sem_resposta: 'a aba não abriu a tempo'
};

export function useAssistente({ clinicaId, usuarioId, onNavigate, onAbrirProntuario, telaAtual }: Opcoes) {
  const ctx = { clinicaId, usuarioId };
  // Ref: a tela muda a cada navegação e não deve recriar o envio.
  const telaRef = useRef(telaAtual);
  telaRef.current = telaAtual;
  const prontuario = useContextoProntuario();
  const [modo, setModo] = useState<ModoAssistente>(prontuario ? 'prontuario' : 'agenda');
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([]);
  const [etapa, setEtapa] = useState<EtapaAssistente>(null);
  const [segundos, setSegundos] = useState(0);
  const [vozAtiva, setVozAtiva] = useState(() => localStorage.getItem(CHAVE_VOZ) !== '0');
  const voz = useVozAssistente(ctx, vozAtiva);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const cronometro = useRef<number | null>(null);
  const mensagensRef = useRef(mensagens);
  mensagensRef.current = mensagens;
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const limiteSegundos = modo === 'prontuario' ? LIMITE_DITADO_SEG : LIMITE_AGENDA_SEG;

  useEffect(() => {
    localStorage.setItem(CHAVE_VOZ, vozAtiva ? '1' : '0');
  }, [vozAtiva]);

  // Entrou num prontuário: modo prontuário. Saiu: volta para a agenda.
  const temProntuario = Boolean(prontuario);
  useEffect(() => setModo(temProntuario ? 'prontuario' : 'agenda'), [temProntuario]);

  // Muda de clínica = conversa nova (os dados são de outra clínica).
  useEffect(() => setMensagens([]), [clinicaId]);

  const adicionar = (m: Omit<MensagemAssistente, 'id'>) => {
    const msg = { ...m, id: novoId() };
    setMensagens((atual) => [...atual, msg]);
    return msg.id;
  };

  const responderErro = (e: unknown) => {
    const texto = e instanceof Error ? e.message : 'Não consegui concluir o pedido.';
    adicionar({ autor: 'assistente', texto, erro: true });
  };

  /** Executa no navegador o que a IA entendeu do ditado. */
  const aplicarDitado = async (d: DitadoProntuario): Promise<ResumoDitado> => {
    const resumo: ResumoDitado = { preenchidos: [], falhas: [] };
    const atual = lerContextoProntuario();
    if (!atual) {
      resumo.falhas.push('Abra o atendimento do paciente para eu preencher o prontuário.');
      return resumo;
    }
    if (d.acao === 'abrir_etapa' && d.etapa) {
      atual.abrirEtapa(d.etapa);
      return resumo;
    }
    if (d.acao !== 'preencher') return resumo;
    if (atual.somenteLeitura) {
      resumo.falhas.push(`Nada foi alterado: ${MOTIVO_FALHA.somente_leitura}.`);
      return resumo;
    }
    for (const p of d.preenchimentos) {
      const agora = lerContextoProntuario();
      if (!agora) break;
      const r = await entregarNaEtapa(p.etapa, p.valores, d.modo, agora.etapaAtual, agora.abrirEtapa);
      if (r.ok) resumo.preenchidos.push({ etapa: p.etapa, campos: r.campos });else
      resumo.falhas.push(`${NOME_ETAPA[p.etapa] || p.etapa}: ${MOTIVO_FALHA[r.motivo || 'sem_campos']}.`);
    }
    return resumo;
  };

  const enviar = useCallback(
    async (texto: string, depoisDaVoz = false, modoForcado?: ModoAssistente) => {
      const limpo = texto.trim();
      if (!limpo || etapa && !depoisDaVoz) return;
      const historico = mensagensRef.current.filter((m) => !m.erro).map((m) => ({ autor: m.autor, texto: m.texto }));
      adicionar({ autor: 'usuario', texto: limpo });
      setEtapa('pensando');
      try {
        if ((modoForcado || modoRef.current) === 'prontuario') {
          const ctxP = lerContextoProntuario();
          const resultado = await assistenteApi.prontuario(ctx, limpo, historico, ctxP?.etapaAtual || '', ctxP?.paciente || '');
          if (resultado.tipo !== 'prontuario') {
            adicionar({ autor: 'assistente', texto: resultado.fala, resultado });
            voz.falar(resultado.fala);
            return;
          }
          setEtapa('preenchendo');
          const ditado = await aplicarDitado(resultado.dados);
          const falhou = resultado.dados.acao === 'preencher' && !ditado.preenchidos.length;
          const fala = falhou ? ditado.falhas[0] || 'Não consegui preencher.' : resultado.fala;
          adicionar({ autor: 'assistente', texto: fala, ditado, erro: falhou });
          voz.falar(fala);
          return;
        }
        const resultado = await assistenteApi.mensagem(ctx, limpo, historico, { tela: telaRef.current });
        adicionar({ autor: 'assistente', texto: resultado.fala, resultado });
        voz.falar(resultado.fala);
        // Ações de navegação acontecem na hora: não gravam nada.
        if (resultado.tipo === 'navegar') {
          onNavigate('agenda', resultado.dados.data, resultado.dados.profissionalId || undefined);
        } else if (resultado.tipo === 'navegar_tela') {
          onNavigate(resultado.dados.tela);
        } else if (resultado.tipo === 'abrir_cadastro') {
          abrirCadastro(resultado.dados.pacienteId);
        } else if (resultado.tipo === 'abrir_prontuario') {
          abrirProntuario(resultado.dados.pacienteId);
        } else if (resultado.tipo === 'pacientes' && resultado.dados.abrir === 'cadastro' && resultado.dados.pacientes.length === 1) {
          abrirCadastro(resultado.dados.pacientes[0].id);
        }
      } catch (e) {
        responderErro(e);
      } finally {
        setEtapa(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etapa, clinicaId, usuarioId, voz.falar, onNavigate]
  );

  const pararCronometro = () => {
    if (cronometro.current) window.clearInterval(cronometro.current);
    cronometro.current = null;
  };

  const pararGravacao = useCallback(() => {
    pararCronometro();
    if (gravador.current && gravador.current.state !== 'inactive') gravador.current.stop();
  }, []);

  const iniciarGravacao = useCallback(async () => {
    if (etapa) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      responderErro(
        new Error(
          window.isSecureContext ?
          'Este navegador não grava áudio. Use o Chrome ou o Edge, ou digite o pedido.' :
          'O microfone só funciona com o sistema aberto em https://. Digite o pedido ou acesse pelo endereço seguro.'
        )
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e: any) {
      responderErro(
        new Error(
          e?.name === 'NotAllowedError' ?
          'O microfone foi bloqueado. Clique no cadeado da barra de endereço e permita o microfone.' :
          'Nenhum microfone encontrado neste computador.'
        )
      );
      return;
    }
    voz.parar();
    const mime = escolherMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const limite = modoRef.current === 'prontuario' ? LIMITE_DITADO_SEG : LIMITE_AGENDA_SEG;
    pedacos.current = [];
    rec.ondataavailable = (ev) => ev.data.size && pedacos.current.push(ev.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const tipo = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(pedacos.current, { type: tipo });
      if (blob.size < 2000) {
        setEtapa(null);
        return;
      }
      setEtapa('transcrevendo');
      try {
        const { texto } = await assistenteApi.transcrever(ctx, await blobParaBase64(blob), tipo, modoRef.current);
        if (!texto) {
          setEtapa(null);
          responderErro(new Error('Não entendi o áudio. Tente falar mais perto do microfone.'));
          return;
        }
        await enviarRef.current(texto, true);
      } catch (e) {
        setEtapa(null);
        responderErro(e);
      }
    };
    gravador.current = rec;
    rec.start();
    setSegundos(0);
    setEtapa('ouvindo');
    cronometro.current = window.setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= limite) pararGravacao();
        return s + 1;
      });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, clinicaId, usuarioId, pararGravacao, voz.parar]);

  // A gravação termina num callback antigo: usa sempre a versão atual de `enviar`.
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;

  const concluir = (id: string) => setMensagens((atual) => atual.map((m) => m.id === id ? { ...m, concluida: true } : m));

  const confirmarMarcacao = async (
  mensagemId: string,
  dados: {pacienteId: string;profissionalId: string;data: string;horario: string;}) =>
  {
    setEtapa('gravando_consulta');
    try {
      const r = await assistenteApi.marcar(ctx, dados);
      concluir(mensagemId);
      const texto = `Consulta marcada: ${r.paciente} com ${r.profissional}, ${r.rotulo} às ${r.horario}.`;
      adicionar({ autor: 'assistente', texto });
      voz.falar('Consulta marcada.');
      window.dispatchEvent(new Event('consultas-updated'));
    } catch (e) {
      const slots = e instanceof ErroAssistente && e.slots?.length ? ` Livres: ${e.slots.slice(0, 8).join(', ')}.` : '';
      responderErro(new Error(`${e instanceof Error ? e.message : 'Falha ao marcar.'}${slots}`));
    } finally {
      setEtapa(null);
    }
  };

  const confirmarRemarcacao = async (
  mensagemId: string,
  consultaId: string,
  dados: {profissionalId: string;data: string;horario: string;}) =>
  {
    setEtapa('gravando_consulta');
    try {
      const r = await assistenteApi.remarcar(ctx, { consultaId, profissionalId: dados.profissionalId, data: dados.data, horario: dados.horario });
      concluir(mensagemId);
      adicionar({ autor: 'assistente', texto: `Remarcada: ${r.paciente} com ${r.profissional}, ${r.rotulo} às ${r.horario}. O horário antigo ficou livre.` });
      voz.falar('Consulta remarcada.');
      window.dispatchEvent(new Event('consultas-updated'));
    } catch (e) {
      const slots = e instanceof ErroAssistente && e.slots?.length ? ` Livres: ${e.slots.slice(0, 8).join(', ')}.` : '';
      responderErro(new Error(`${e instanceof Error ? e.message : 'Falha ao remarcar.'}${slots}`));
    } finally {
      setEtapa(null);
    }
  };

  function abrirCadastro(pacienteId: string | null) {
    onNavigate('pacientes');
    pedirAberturaPaciente({ pacienteId });
  }

  function abrirProntuario(pacienteId: string) {
    if (onAbrirProntuario) onAbrirProntuario(pacienteId);else
    onNavigate('prontuarios');
  }

  const confirmarCancelamento = async (mensagemId: string, consultaId: string, motivo: string) => {
    setEtapa('gravando_consulta');
    try {
      await assistenteApi.cancelar(ctx, consultaId, motivo);
      concluir(mensagemId);
      adicionar({ autor: 'assistente', texto: 'Consulta cancelada. O horário voltou a ficar livre na agenda.' });
      voz.falar('Consulta cancelada.');
      window.dispatchEvent(new Event('consultas-updated'));
    } catch (e) {
      responderErro(e);
    } finally {
      setEtapa(null);
    }
  };

  const limpar = () => {
    voz.parar();
    setMensagens([]);
  };

  useEffect(() => () => pararCronometro(), []);

  return {
    modo,
    setModo,
    prontuario,
    mensagens,
    etapa,
    segundos,
    limiteSegundos,
    vozAtiva,
    setVozAtiva,
    falar: voz.falar,
    pararVoz: voz.parar,
    falando: voz.falando,
    enviar,
    iniciarGravacao,
    pararGravacao,
    confirmarMarcacao,
    confirmarRemarcacao,
    confirmarCancelamento,
    abrirCadastro,
    abrirProntuario,
    limpar
  };
}

export const nomeCampo = (campo: string) => NOME_CAMPO[campo] || campo;
export const nomeEtapa = (etapa: string) => NOME_ETAPA[etapa] || etapa;