import React, { useEffect, useState, useRef, Component } from 'react';
import { API_BASE_URL } from '../../config/api';
import { ENV_BIOMETRIA_WS_URL } from '../../config/env';
import { useToast } from '../../hooks/useToast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Swal } from '../ui/SweetAlert';
import {
  FingerprintIcon,
  Loader2Icon,
  CheckCircleIcon,
  Trash2Icon,
  DownloadIcon,
  InfoIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  XIcon,
  PlugZapIcon } from
'lucide-react';
// ⭐ FLUXO: cada clínica instala o app BiometriaDigitalPersona na PRÓPRIA máquina.
// O NAVEGADOR (que roda nessa máquina) abre o WebSocket LOCAL do leitor
// (ws://localhost:5555/biometria), envia { acao: 'cadastro', ... }, coleta as 4
// amostras + fmdXml e, ao concluir, PERSISTE no servidor central via
// POST /api/biometria/cadastrar. Assim "localhost" sempre aponta para o leitor
// daquela clínica — o servidor central nunca tenta alcançar a LAN do cliente.
const BIOMETRIA_WS_URL = ENV_BIOMETRIA_WS_URL;
// Tempo máximo aguardando o usuário posicionar o dedo no leitor (ms).
const BIOMETRIA_TIMEOUT_MS = 60000;
// Tempo máximo só para ABRIR a conexão (app aberto x fechado). Curto, para dar
// feedback rápido de "não há comunicação" sem esperar o timeout cheio de captura.
const BIOMETRIA_CONNECT_TIMEOUT_MS = 8000;
// ⭐ Monta a URL final do WS já com o comando na QUERY STRING. Muitos builds do
//    app WPF leem o comando da query no momento do "open" (e não só de uma
//    mensagem JSON posterior). Enviamos pelos DOIS caminhos para compatibilidade.
const montarWsUrlCadastro = (
clinicaId: string,
usuarioId: string,
nome: string) =>
{
  const base = BIOMETRIA_WS_URL.replace(/\/+$/, '');
  const query =
  `acao=cadastro&clinicaId=${encodeURIComponent(clinicaId)}` +
  `&clienteId=${encodeURIComponent(clinicaId)}` +
  `&funcionarioId=${encodeURIComponent(usuarioId)}` +
  `&usuarioId=${encodeURIComponent(usuarioId)}` +
  `&nome=${encodeURIComponent(nome || '')}&amostras=4`;
  return `${base}/?${query}`;
};
interface CadastroBiometrico {
  usuarioId: string;
  usuarioNome: string;
  tipo: string;
  cadastrado: boolean;
  numAmostras: number;
  atualizadoEm: string | null;
}
interface Funcionario {
  id: string;
  nome: string;
  tipo?: string;
}
interface Props {
  clinicaId: string;
  // Lista de funcionários já carregada pela PontoPage (mesma fonte das outras abas).
  funcionarios?: Funcionario[];
}
// Fases do processo de cadastro, para exibir o feedback certo ao usuário.
type EnrollFase = 'conectando' | 'aguardando_dedo' | 'salvando' | null;
// Conteúdo do painel de ajuda quando NÃO há comunicação com o leitor.
interface ConexaoErro {
  titulo: string;
  resumo: string;
  passos: string[];
  usuarioId: string;
  usuarioNome: string;
}
export function BiometriaDigitalTab({ clinicaId, funcionarios = [] }: Props) {
  const { success, error } = useToast();
  const [cadastros, setCadastros] = useState<CadastroBiometrico[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Funcionário que está em processo de captura no leitor (chamada em andamento)
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  // Fase atual da captura (para a UI mostrar "Conectando" x "Encoste o dedo").
  const [enrollFase, setEnrollFase] = useState<EnrollFase>(null);
  // Marca se a conexão de escuta de PONTO está ativa (leitor online nesta máquina).
  const [leitorOnline, setLeitorOnline] = useState(false);
  // Painel de ajuda mostrado quando o leitor não responde / não conecta.
  const [conexaoErro, setConexaoErro] = useState<ConexaoErro | null>(null);
  // Referência à conexão de escuta de PONTO, para podermos FECHÁ-LA de forma
  // SÍNCRONA antes de abrir a conexão de cadastro (o app local só aceita uma
  // conexão por vez — se a escuta continuar aberta, a mensagem de conclusão do
  // cadastro chega NELA e é ignorada).
  const listenerWsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    carregarCadastros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId, funcionarios]);
  // ⭐ Enquanto esta tela está aberta na MÁQUINA DA CLÍNICA, escuta o leitor local
  // por marcações de ponto (evento `ponto_marcado`) e as persiste no servidor
  // central via POST /api/biometria/ponto. É o navegador da clínica — não o
  // servidor central — que enxerga o ws://localhost:5555 daquela clínica.
  //
  // ⚠️ IMPORTANTE: o app local normalmente aceita UMA conexão por vez. Por isso
  //    pausamos este listener enquanto um CADASTRO está em andamento (enrollingId),
  //    senão a conexão de escuta "rouba" o canal e o cadastro nunca completa —
  //    essa era uma causa do "não está cadastrando".
  useEffect(() => {
    if (!clinicaId || typeof WebSocket === 'undefined') return;
    if (enrollingId) return; // pausa a escuta durante o cadastro
    let ws: WebSocket | null = null;
    let fechado = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const conectar = () => {
      if (fechado) return;
      try {
        ws = new WebSocket(BIOMETRIA_WS_URL);
        listenerWsRef.current = ws;
      } catch (_) {
        agendarReconexao();
        return;
      }
      ws.onopen = () => setLeitorOnline(true);
      ws.onmessage = async (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch (_) {
          return;
        }
        const evento = (msg.evento || msg.status || '').toString().toLowerCase();
        if (
        evento !== 'ponto_marcado' &&
        evento !== 'pontomarcado' &&
        evento !== 'usuario_identificado' &&
        evento !== 'identificado')
        {
          return;
        }
        const funcionarioId = msg.funcionarioId || msg.usuarioId;
        if (!funcionarioId && !msg.biometriaId) return;
        try {
          const res = await fetch(`${API_BASE_URL}/api/biometria/ponto`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clinicaId,
              usuarioId: funcionarioId,
              biometriaId: msg.biometriaId
            })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.usuarioNome) {
            success(
              'Ponto registrado',
              `${data.usuarioNome} marcou ${data.tipo === 'saida' ? 'saída' : 'entrada'} pela digital.`
            );
          }
        } catch (err) {
          console.error('Erro ao registrar ponto do leitor', err);
        }
      };
      ws.onerror = () => setLeitorOnline(false);
      ws.onclose = () => {
        setLeitorOnline(false);
        agendarReconexao();
      };
    };
    const agendarReconexao = () => {
      if (fechado) return;
      reconnectTimer = setTimeout(conectar, 15000);
    };
    conectar();
    return () => {
      fechado = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        if (ws) ws.close();
      } catch (_) {}
      if (listenerWsRef.current === ws) listenerWsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId, enrollingId]);
  const carregarCadastros = async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      // Busca o status das digitais já cadastradas (tabela biometrias / global)
      const res = await fetch(
        `${API_BASE_URL}/api/biometria/cadastros?clinicaId=${clinicaId}`
      );
      let statusList: CadastroBiometrico[] = [];
      if (res.ok) {
        statusList = await res.json();
      }
      // Se a PontoPage já carregou a lista de funcionários (mesma fonte das
      // outras abas), usa-a como base e sobrepõe o status biométrico — assim a
      // lista sempre mostra os mesmos funcionários das demais abas.
      if (funcionarios.length > 0) {
        const statusPorId = new Map(statusList.map((c) => [c.usuarioId, c]));
        const merged: CadastroBiometrico[] = funcionarios.map((f) => {
          const s = statusPorId.get(f.id);
          return {
            usuarioId: f.id,
            usuarioNome: f.nome,
            tipo: f.tipo || '',
            cadastrado: s ? s.cadastrado : false,
            numAmostras: s ? s.numAmostras : 0,
            atualizadoEm: s ? s.atualizadoEm : null
          };
        });
        setCadastros(merged);
      } else {
        setCadastros(statusList);
      }
    } catch (err) {
      console.error('Erro ao carregar cadastros biométricos', err);
      error('Erro', 'Não foi possível carregar a lista de cadastros.');
    } finally {
      setLoading(false);
    }
  };
  // ⭐ Persiste o template capturado no servidor central (banco global).
  const salvarTemplate = async (
  usuarioId: string,
  nome: string,
  payload: any) =>
  {
    setEnrollFase('salvando');
    try {
      const amostras = Array.isArray(payload.amostras) ?
      payload.amostras :
      payload.amostra ?
      [payload.amostra] :
      undefined;
      const res = await fetch(`${API_BASE_URL}/api/biometria/cadastrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usuarioId,
          biometriaId: payload.biometriaId,
          fmdXml: payload.fmdXml ?? payload.template ?? payload.fmd,
          amostras,
          numAmostras: payload.numAmostras ?? payload.total ?? payload.atual
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao salvar template biométrico');
      }
      success('Digital cadastrada', `A digital de ${nome} foi salva.`);
      carregarCadastros();
    } catch (err: any) {
      console.error('Erro ao salvar template biométrico', err);
      error(
        'Falha ao salvar',
        `A digital de ${nome} foi lida pelo leitor, mas o servidor não conseguiu salvá-la. ${err?.message || ''}`.trim()
      );
    }
  };
  // Monta o painel de ajuda detalhado quando não há comunicação com o leitor.
  const mostrarAjudaSemComunicacao = (
  usuarioId: string,
  nome: string,
  motivo: 'conexao' | 'timeout') =>
  {
    setConexaoErro({
      titulo:
      motivo === 'conexao' ?
      'Não foi possível falar com o leitor' :
      'O leitor não respondeu a tempo',
      resumo:
      motivo === 'conexao' ?
      `O navegador tentou abrir ${BIOMETRIA_WS_URL} mas não houve resposta. O cadastro de ${nome} não foi iniciado.` :
      `A conexão abriu, mas nenhuma digital de ${nome} chegou dentro do tempo limite. O cadastro foi cancelado.`,
      passos:
      motivo === 'conexao' ?
      [
      'Confirme que o aplicativo BiometriaDigitalPersona está ABERTO nesta mesma máquina (procure o ícone na bandeja do Windows).',
      'Verifique se o leitor U.are.U 4500 está conectado a uma porta USB e com a luz acesa.',
      `Confirme que o app está escutando no endereço ${BIOMETRIA_WS_URL} (mesma porta e caminho /biometria).`,
      'Se o leitor estiver em outra máquina da rede, ajuste VITE_BIOMETRIA_WS_URL no .env.local para o IP correto e recarregue a página.',
      'Verifique se o firewall/antivírus do Windows não está bloqueando a porta do app.',
      'Feche e abra novamente o aplicativo BiometriaDigitalPersona e clique em "Tentar novamente".'] :

      [
      'Peça ao funcionário para encostar o dedo no leitor assim que clicar em cadastrar — são necessárias 4 leituras.',
      'Limpe o leitor e o dedo (umidade ou poeira atrapalham a captura).',
      'Confirme que o app BiometriaDigitalPersona continua aberto e não exibiu nenhum erro.',
      'Verifique se a luz do leitor acende ao tocar — se não acender, reconecte o USB.',
      'Clique em "Tentar novamente" para reiniciar a captura.'],

      usuarioId,
      usuarioNome: nome
    });
  };
  // ⭐ Cadastra/recadastra a digital abrindo o WebSocket LOCAL do leitor a partir
  // do navegador. O app coleta as amostras (4 toques) e devolve o template, que
  // então é persistido no servidor central.
  const handleCadastrarDigital = (usuarioId: string, nome: string) => {
    if (enrollingId) return;
    if (typeof WebSocket === 'undefined') {
      error('Erro', 'Seu navegador não suporta a conexão com o leitor.');
      return;
    }
    // Limpa qualquer ajuda anterior antes de tentar novamente.
    setConexaoErro(null);
    // ⭐ FECHA a conexão de escuta de ponto de forma SÍNCRONA. O app local só
    //    aceita uma conexão por vez; se a escuta continuar aberta, o leitor
    //    devolve a conclusão do cadastro (o JSON com fmdXml) NELA e o cadastro
    //    nunca é salvo. Por isso liberamos o canal antes de iniciar.
    try {
      if (listenerWsRef.current) {
        listenerWsRef.current.onclose = null;
        listenerWsRef.current.onerror = null;
        listenerWsRef.current.close();
      }
    } catch (_) {}
    listenerWsRef.current = null;
    setLeitorOnline(false);
    setEnrollingId(usuarioId);
    setEnrollFase('conectando');
    let ws: WebSocket | null = null;
    let finalizado = false;
    let conectou = false;
    let timeoutConexao: ReturnType<typeof setTimeout> | null = null;
    let timeoutCaptura: ReturnType<typeof setTimeout> | null = null;
    const encerrar = () => {
      if (timeoutCaptura) clearTimeout(timeoutCaptura);
      if (timeoutConexao) clearTimeout(timeoutConexao);
      try {
        if (ws) ws.close();
      } catch (_) {}
      setEnrollingId(null);
      setEnrollFase(null);
    };
    const iniciar = () => {
      try {
        // Comando também na QUERY STRING (compatibilidade com o app WPF).
        ws = new WebSocket(montarWsUrlCadastro(clinicaId, usuarioId, nome));
      } catch (err) {
        console.error('Erro ao abrir WebSocket de biometria', err);
        finalizado = true;
        mostrarAjudaSemComunicacao(usuarioId, nome, 'conexao');
        encerrar();
        return;
      }
      // Timeout curto: se nem abriu a conexão, é falta de comunicação (app fechado).
      timeoutConexao = setTimeout(() => {
        if (finalizado || conectou) return;
        finalizado = true;
        mostrarAjudaSemComunicacao(usuarioId, nome, 'conexao');
        encerrar();
      }, BIOMETRIA_CONNECT_TIMEOUT_MS);
      // Timeout cheio: conectou mas o dedo nunca chegou.
      timeoutCaptura = setTimeout(() => {
        if (finalizado) return;
        finalizado = true;
        mostrarAjudaSemComunicacao(usuarioId, nome, 'timeout');
        encerrar();
      }, BIOMETRIA_TIMEOUT_MS);
      ws.onopen = () => {
        conectou = true;
        if (timeoutConexao) clearTimeout(timeoutConexao);
        setEnrollFase('aguardando_dedo');
        // Contrato do app WPF: acao=cadastro + clienteId/clinicaId + funcionarioId.
        // (também enviado na query string acima)
        try {
          ws?.send(
            JSON.stringify({
              acao: 'cadastro',
              clienteId: clinicaId,
              clinicaId,
              funcionarioId: usuarioId,
              usuarioId,
              nome,
              usuarioNome: nome,
              amostras: 4
            })
          );
        } catch (_) {}
      };
      ws.onmessage = async (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch (_) {
          return;
        }
        const evento = (msg.evento || msg.status || '').toString().toLowerCase();
        // Falha/cancelamento reportado explicitamente pelo leitor.
        if (
        evento === 'erro' ||
        evento === 'falha' ||
        evento === 'cancelado' ||
        msg.erro ||
        msg.error)
        {
          if (finalizado) return;
          finalizado = true;
          if (timeoutCaptura) clearTimeout(timeoutCaptura);
          if (timeoutConexao) clearTimeout(timeoutConexao);
          error(
            'Falha na captura',
            msg.mensagem ||
            msg.erro ||
            msg.error ||
            'O leitor não conseguiu capturar a digital. Tente novamente.'
          );
          encerrar();
          return;
        }
        // ⭐ CONCLUSÃO. O app WPF envia o resultado final podendo NÃO ter campo
        //    `evento` — apenas { usuarioId, biometriaId, fmdXml }. Por isso a
        //    presença de fmdXml/template já é suficiente para concluir e salvar.
        const concluido =
        evento === 'cadastro_concluido' ||
        evento === 'concluido' ||
        evento === 'ok' ||
        msg.final === true ||
        msg.sucesso === true ||
        Boolean(msg.fmdXml) ||
        Boolean(msg.template) ||
        Boolean(msg.fmd);
        if (concluido) {
          if (finalizado) return;
          finalizado = true;
          if (timeoutCaptura) clearTimeout(timeoutCaptura);
          if (timeoutConexao) clearTimeout(timeoutConexao);
          await salvarTemplate(usuarioId, nome, msg);
          encerrar();
          return;
        }
        // Demais mensagens (conectado / comando_recebido / captura / amostra /
        // progresso) são apenas progresso — mantém "aguardando dedo".
      };
      ws.onerror = () => {
        if (finalizado) return;
        finalizado = true;
        mostrarAjudaSemComunicacao(usuarioId, nome, 'conexao');
        encerrar();
      };
      ws.onclose = () => {
        if (!finalizado) {
          finalizado = true;
          // Fechou sem concluir nem dar erro explícito: falta de comunicação.
          if (!conectou) {
            mostrarAjudaSemComunicacao(usuarioId, nome, 'conexao');
          }
          setEnrollingId(null);
          setEnrollFase(null);
          if (timeoutCaptura) clearTimeout(timeoutCaptura);
          if (timeoutConexao) clearTimeout(timeoutConexao);
        }
      };
    };
    // Pequeno atraso para o app local liberar o slot da conexão de escuta que
    // acabamos de fechar antes de abrir a conexão de cadastro.
    setTimeout(iniciar, 250);
  };
  const handleRemoverCadastro = async (usuarioId: string, nome: string) => {
    const confirma = await Swal.fire({
      icon: 'warning',
      title: 'Remover digital?',
      text: `Tem certeza que deseja remover a digital de ${nome}? O funcionário precisará cadastrá-la novamente.`,
      showCancelButton: true,
      confirmButtonText: 'Sim, remover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    });
    if (!confirma.isConfirmed) return;
    setRemovingId(usuarioId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/biometria/cadastro/${usuarioId}`,
        {
          method: 'DELETE'
        }
      );
      if (!res.ok) throw new Error('Falha ao remover cadastro');
      success('Sucesso', 'Cadastro biométrico removido com sucesso.');
      carregarCadastros();
    } catch (err) {
      console.error('Erro ao remover cadastro', err);
      error('Erro', 'Não foi possível remover o cadastro.');
    } finally {
      setRemovingId(null);
    }
  };
  const faseLabel =
  enrollFase === 'conectando' ?
  'Conectando ao leitor...' :
  enrollFase === 'aguardando_dedo' ?
  'Encoste o dedo...' :
  enrollFase === 'salvando' ?
  'Salvando...' :
  '';
  return (
    <div className="space-y-6">
      {/* Informações e Download */}
      <Card className="p-6 bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
            <FingerprintIcon className="w-8 h-8 text-rose-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Leitor Biométrico (DigitalPersona)
            </h2>
            <p className="text-gray-700 text-sm mb-4">
              Para cadastrar novas digitais ou utilizar o leitor para marcação
              de ponto, instale o aplicativo{' '}
              <strong>BiometriaDigitalPersona</strong> nesta máquina (onde o
              leitor USB está conectado). Ao clicar em cadastrar, esta tela
              aciona o leitor local e o funcionário deve encostar o dedo algumas
              vezes.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`${API_BASE_URL}/api/downloads/arquivo/${encodeURIComponent('BiometriaDigitalPersona-Setup.exe')}`}
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-md hover:bg-rose-700 transition-colors shadow-sm">
                
                <DownloadIcon className="w-4 h-4" />
                Baixar Instalador do Leitor
              </a>
            </div>
          </div>
          <div className="bg-white/60 p-4 rounded-lg border border-rose-100 text-sm w-full md:w-64">
            <h4 className="font-semibold text-rose-900 mb-1 flex items-center gap-1">
              <InfoIcon className="w-4 h-4" /> Dados de Conexão
            </h4>
            <p className="text-gray-600 mb-1">
              <strong>ID da Clínica:</strong>{' '}
              <code className="bg-white px-1 rounded">{clinicaId}</code>
            </p>
            <p className="text-gray-600 mb-1">
              <strong>Servidor:</strong>{' '}
              <code className="bg-white px-1 rounded truncate block">
                {API_BASE_URL}
              </code>
            </p>
            <p className="text-gray-600 mb-1">
              <strong>Leitor (local):</strong>{' '}
              <code className="bg-white px-1 rounded truncate block">
                {BIOMETRIA_WS_URL}
              </code>
            </p>
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <span
                className={`w-2 h-2 rounded-full ${leitorOnline ? 'bg-green-500' : 'bg-gray-300'}`}
                aria-hidden="true" />
              
              <span
                className={leitorOnline ? 'text-green-700' : 'text-gray-500'}>
                
                {leitorOnline ? 'Leitor conectado' : 'Leitor não detectado'}
              </span>
            </p>
          </div>
        </div>
      </Card>

      {/* ⭐ Painel de ajuda detalhado quando não há comunicação com o leitor */}
      {conexaoErro &&
      <Card
        className="p-5 border-amber-300 bg-amber-50"
        role="alert"
        aria-live="assertive">
        
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangleIcon className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-amber-900">
                  {conexaoErro.titulo}
                </h3>
                <button
                type="button"
                onClick={() => setConexaoErro(null)}
                className="text-amber-500 hover:text-amber-700 flex-shrink-0"
                aria-label="Fechar aviso">
                
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-amber-800 mt-1">
                {conexaoErro.resumo}
              </p>
              <p className="text-xs font-medium text-amber-900 mt-3 mb-1">
                Verifique os passos abaixo e tente novamente:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-amber-800">
                {conexaoErro.passos.map((passo, i) =>
              <li key={i}>{passo}</li>
              )}
              </ol>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <Button
                size="sm"
                onClick={() =>
                handleCadastrarDigital(
                  conexaoErro.usuarioId,
                  conexaoErro.usuarioNome
                )
                }
                disabled={!!enrollingId}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                
                  <RefreshCwIcon className="w-4 h-4 mr-1.5" />
                  Tentar novamente
                </Button>
                <a
                href={`${API_BASE_URL}/api/downloads/arquivo/${encodeURIComponent('BiometriaDigitalPersona-Setup.exe')}`}
                download
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900">
                
                  <DownloadIcon className="w-4 h-4" />
                  Baixar o aplicativo do leitor
                </a>
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                  <PlugZapIcon className="w-3.5 h-3.5" />
                  Endereço esperado:{' '}
                  <code className="bg-white/70 px-1 rounded">
                    {BIOMETRIA_WS_URL}
                  </code>
                </span>
              </div>
            </div>
          </div>
        </Card>
      }

      {/* Lista de Cadastros */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Status dos Cadastros
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={carregarCadastros}
            disabled={loading}
            className="text-gray-600"
            title="Atualizar status">
            
            <RefreshCwIcon
              className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            
            Atualizar
          </Button>
        </div>

        {loading ?
        <div className="flex justify-center py-12">
            <Loader2Icon className="w-8 h-8 animate-spin text-teal-600" />
          </div> :
        cadastros.length === 0 ?
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            Nenhum funcionário encontrado.
          </div> :

        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="pb-3 font-medium">Funcionário</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Amostras</th>
                  <th className="pb-3 font-medium">Última Atualização</th>
                  <th className="pb-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cadastros.map((cad) =>
              <tr key={cad.usuarioId} className="hover:bg-gray-50">
                    <td className="py-3 text-gray-900 font-medium">
                      {cad.usuarioNome}
                    </td>
                    <td className="py-3">
                      {cad.cadastrado ?
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircleIcon className="w-3 h-3" />
                          Cadastrado
                        </span> :

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Pendente
                        </span>
                  }
                    </td>
                    <td className="py-3 text-gray-600">
                      {cad.cadastrado ? `${cad.numAmostras} lidas` : '-'}
                    </td>
                    <td className="py-3 text-gray-500">
                      {cad.atualizadoEm ?
                  new Date(cad.atualizadoEm).toLocaleString('pt-BR') :
                  '-'}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                      handleCadastrarDigital(
                        cad.usuarioId,
                        cad.usuarioNome
                      )
                      }
                      disabled={!!enrollingId}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      title={
                      cad.cadastrado ?
                      'Recadastrar digital no leitor' :
                      'Cadastrar digital no leitor'
                      }>
                      
                          {enrollingId === cad.usuarioId ?
                      <>
                              <Loader2Icon className="w-4 h-4 mr-1.5 animate-spin" />
                              {faseLabel}
                            </> :

                      <>
                              <FingerprintIcon className="w-4 h-4 mr-1.5" />
                              {cad.cadastrado ? 'Recadastrar' : 'Cadastrar'}
                            </>
                      }
                        </Button>
                        {cad.cadastrado &&
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                      handleRemoverCadastro(
                        cad.usuarioId,
                        cad.usuarioNome
                      )
                      }
                      disabled={
                      removingId === cad.usuarioId || !!enrollingId
                      }
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Remover digital">
                      
                            {removingId === cad.usuarioId ?
                      <Loader2Icon className="w-4 h-4 animate-spin" /> :

                      <Trash2Icon className="w-4 h-4" />
                      }
                          </Button>
                    }
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </Card>
    </div>);

}