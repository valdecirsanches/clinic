import React, { useEffect, useState } from 'react';
import {
  PillIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  UserIcon,
  KeyIcon,
  FileTextIcon,
  PrinterIcon,
  Loader2Icon,
  ArrowRightIcon } from
'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import { resolverConselho } from '../../../utils/especialidadeHelper';
interface MemedProfissional {
  id?: string;
  nome: string;
  crm: string;
  token?: string;
  ativo?: boolean;
}
interface PrescricaoMemed {
  id: string;
  data: string;
  paciente: string;
  medicamentos: string[];
  pdfUrl?: string;
}
interface MemedEtapaProps {
  profissional?: MemedProfissional;
  profissionalCompleto?: any;
  memedConfig?: any;
  clinicaId?: string;
  prescricoes?: PrescricaoMemed[];
  onAbrirMemed?: () => void;
  onConfigurar?: () => void;
  onStatusChange?: () => void;
  onNavigateUsuarios?: () => void;
}
export function MemedEtapa({
  profissional,
  profissionalCompleto: propProfissionalCompleto,
  memedConfig,
  clinicaId,
  prescricoes = [],
  onAbrirMemed,
  onConfigurar,
  onStatusChange,
  onNavigateUsuarios
}: MemedEtapaProps) {
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Estado local para os dados completos do profissional
  const [profissionalCompleto, setProfissionalCompleto] = useState<any>(
    propProfissionalCompleto
  );
  // Busca os dados completos do usuário se não foram passados via props
  // ⭐ FIX: Sempre busca da API se o prop não tem CPF (profissionalDaConsulta não inclui cpf)
  useEffect(() => {
    const profId = propProfissionalCompleto?.id || profissional?.id;
    // Se já tem CPF nos dados passados, usa direto
    if (propProfissionalCompleto?.cpf) {
      setProfissionalCompleto(propProfissionalCompleto);
      return;
    }
    // Busca dados completos da API (inclui cpf, telefone, dataNascimento)
    const fetchUserData = async () => {
      if (!profId) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/usuarios/${profId}`);
        if (res.ok) {
          const data = await res.json();
          setProfissionalCompleto(data);
        } else if (propProfissionalCompleto) {
          // Fallback: usa o que veio por prop mesmo sem cpf
          setProfissionalCompleto(propProfissionalCompleto);
        }
      } catch (err) {
        console.error('Erro ao buscar dados completos do profissional:', err);
        // Fallback: usa o que veio por prop
        if (propProfissionalCompleto) {
          setProfissionalCompleto(propProfissionalCompleto);
        }
      }
    };
    fetchUserData();
  }, [
  propProfissionalCompleto?.id,
  propProfissionalCompleto?.cpf,
  profissional?.id]
  );
  const isConfigured = memedConfig?.ativo && (memedConfig?.configurada || memedConfig?.apiKey);
  const hasToken = !!profissional?.token;
  const isReady = isConfigured && hasToken;
  // Verifica se tem os dados mínimos para cadastro
  const hasRequiredData = !!(
  profissionalCompleto?.crm &&
  profissionalCompleto?.uf &&
  profissionalCompleto?.cpf);

  const prescricoesExibir = prescricoes.length > 0 ? prescricoes : [];
  const handleCadastrarEBuscarToken = async () => {
    if (!profissionalCompleto) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. CADASTRAR NO MEMED
      setActionMessage('Cadastrando profissional na Memed...');
      const cpfLimpo = profissionalCompleto.cpf?.replace(/\D/g, '') || '';
      const telefoneLimpo =
      profissionalCompleto.telefone?.replace(/\D/g, '') || '';
      const nomeCompleto = profissionalCompleto.nome.split(' ');
      const nome = nomeCompleto[0] || '';
      const sobrenome = nomeCompleto.slice(1).join(' ') || '';
      // ⭐ Formata data de nascimento (DD/MM/YYYY para a Memed)
      let dataNascFormatada = '01/01/1980';
      if (profissionalCompleto.dataNascimento) {
        try {
          const dn = profissionalCompleto.dataNascimento;
          // Se vier no formato YYYY-MM-DD (do input date), converte para DD/MM/YYYY
          if (dn.includes('-') && dn.length === 10) {
            const [ano, mes, dia] = dn.split('-');
            dataNascFormatada = `${dia}/${mes}/${ano}`;
          } else if (dn.includes('/')) {
            dataNascFormatada = dn;
          }
        } catch {

          // Mantém o fallback
        }}
      // Dados do conselho
      const boardCode = profissionalCompleto.conselho || 'CRM';
      const boardState = profissionalCompleto.uf;
      const boardNumber = profissionalCompleto.crm;
      // ⭐ STEP 0: Buscar código da cidade na API Memed (obrigatório para cadastro)
      setActionMessage('Buscando dados da cidade...');
      let codigoCidade: string | null = null;
      try {
        const cidadeRes = await fetch(
          `${API_BASE_URL}/api/memed-profissionais/proxy/cidades?uf=${boardState}&q=FORTALEZA`
        );
        if (cidadeRes.ok) {
          const cidadeData = await cidadeRes.json();
          codigoCidade = cidadeData?.data?.[0]?.id || null;
          console.log('🏙️ [Memed] Cidade encontrada, ID:', codigoCidade);
        }
      } catch (err) {
        console.warn('⚠️ [Memed] Não foi possível buscar cidade:', err);
      }
      // ⭐ FIX: Payload baseado no código Python que FUNCIONA em produção
      // board é um OBJETO dentro de attributes com board_code, board_number, board_state
      // relationships inclui cidade e especialidade
      const memedPayload: any = {
        data: {
          type: 'usuarios',
          attributes: {
            external_id: `prof_${profissionalCompleto.id}`,
            nome: nome,
            sobrenome: sobrenome,
            cpf: cpfLimpo,
            telefone: telefoneLimpo,
            data_nascimento: dataNascFormatada,
            board: {
              board_code: boardCode,
              board_number: boardNumber,
              board_state: boardState
            }
          },
          relationships: {} as any
        }
      };
      // Adiciona cidade se encontrada
      if (codigoCidade) {
        memedPayload.data.relationships.cidade = {
          data: {
            type: 'cidades',
            id: codigoCidade
          }
        };
      }
      // Adiciona especialidade se disponível
      if (profissionalCompleto.especialidadeMemedId) {
        memedPayload.data.relationships.especialidade = {
          data: {
            type: 'especialidades',
            id: profissionalCompleto.especialidadeMemedId
          }
        };
      }
      const cadastrarRes = await fetch(
        `${API_BASE_URL}/api/memed-profissionais/proxy/cadastrar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(memedPayload)
        }
      );
      // ⭐ DEBUG: Log detalhado para diagnóstico
      const cadastrarText = await cadastrarRes.text();
      console.log(
        '📥 [Memed] Status:',
        cadastrarRes.status,
        '| Response:',
        cadastrarText
      );
      console.log(
        '📤 [Memed] Payload enviado:',
        JSON.stringify(memedPayload, null, 2)
      );
      // ⭐ Determina o external_id para buscar o token
      let externalIdParaToken = `prof_${profissionalCompleto.id}`;
      if (!cadastrarRes.ok) {
        let errData: any = {};
        try {
          errData = JSON.parse(cadastrarText);
        } catch {}
        const errorDetail =
        errData.errors?.[0]?.detail || errData.error || cadastrarText || '';
        // ⭐ FIX: Detecta TODAS as variações de "já cadastrado" / "já está em uso"
        const isAlreadyExists =
        errorDetail.includes('já está em uso') ||
        errorDetail.includes('ja cadastrado') ||
        errorDetail.includes('já cadastrado') ||
        errorDetail.includes('Medico ja cadastrado') ||
        errorDetail.includes('Dr(a) com o CRM') ||
        errorDetail.includes('cpf') && errorDetail.includes('cadastrado');
        if (!isAlreadyExists) {
          throw new Error(
            errorDetail ||
            `Erro ao cadastrar na Memed (HTTP ${cadastrarRes.status})`
          );
        }
        // ⭐ FIX: Extrai o external_id antigo da mensagem de erro
        // Ex: "Medico ja cadastrado para o parceiro com esse cpf. Id externo (-2259849626362495196)"
        const idMatch = errorDetail.match(/Id externo[:\s]*\(?([^)]+)\)?/);
        if (idMatch && idMatch[1]) {
          externalIdParaToken = idMatch[1].trim();
          console.log(
            '🔄 [Memed] Médico já cadastrado com external_id antigo:',
            externalIdParaToken
          );
        } else {
          console.log(
            '🔄 [Memed] Médico já cadastrado, tentando buscar token com ID atual...'
          );
        }
      }
      // 2. BUSCAR TOKEN
      setActionMessage('Buscando token de acesso...');
      // Aguarda um pouco para a Memed processar
      await new Promise((r) => setTimeout(r, 1500));
      console.log(
        '🔍 [Memed] Buscando token com external_id:',
        externalIdParaToken
      );
      const tokenRes = await fetch(
        `${API_BASE_URL}/api/memed-profissionais/proxy/token/${externalIdParaToken}`
      );
      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao buscar token da Memed');
      }
      const tokenData = await tokenRes.json();
      const token = tokenData.data?.attributes?.token;
      if (!token) {
        throw new Error(
          'Token não retornado pela Memed. O cadastro pode estar em análise.'
        );
      }
      // 3. SALVAR NO BANCO
      setActionMessage('Salvando configurações...');
      const saveRes = await fetch(`${API_BASE_URL}/api/memed-profissionais`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usuarioId: profissionalCompleto.id,
          external_id: externalIdParaToken,
          nome,
          sobrenome,
          cpf: cpfLimpo,
          email: profissionalCompleto.email || '',
          telefone: telefoneLimpo,
          board_code: boardCode,
          board_number: boardNumber,
          board_state: boardState,
          token: token,
          status: 'Ativo'
        })
      });
      if (!saveRes.ok) {
        throw new Error('Erro ao salvar token no banco de dados local');
      }
      setSuccess('Integração concluída com sucesso! Você já pode prescrever.');
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      console.error('Erro no fluxo Memed:', err);
      setError(err.message || 'Ocorreu um erro inesperado');
    } finally {
      setLoading(false);
      setActionMessage('');
    }
  };
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-light text-teal-700">Memed</h2>
          <span className="bg-teal-500 text-white text-xs font-bold px-2 py-1 rounded">
            DIGITAL
          </span>
        </div>

        {isReady ?
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
            <CheckCircleIcon className="w-4 h-4" />
            Pronto para uso
          </span> :

        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
            <AlertCircleIcon className="w-4 h-4" />
            Requer Configuração
          </span>
        }
      </div>

      {/* Card Principal */}
      <div
        className={`border rounded-xl p-6 transition-all ${isReady ? 'bg-gradient-to-br from-teal-50 to-blue-50 border-teal-100' : 'bg-white border-gray-200 shadow-sm'}`}>
        
        {/* ESTADO 1: TUDO PRONTO */}
        {isReady &&
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
              <PillIcon className="w-8 h-8 text-teal-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Prescrição Digital Memed
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Prescreva medicamentos com segurança e envie receitas digitais
                com validade legal diretamente para o WhatsApp do paciente.
              </p>
              <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200 mb-4">
                <UserIcon className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {profissionalCompleto?.titulo ?
                  `${profissionalCompleto.titulo} ` :
                  ''}
                    {profissional?.nome}
                  </p>
                  <p className="text-xs text-gray-500">
                    {resolverConselho(
                    profissionalCompleto?.tipo,
                    (profissionalCompleto as any)?.especialidade,
                    (profissionalCompleto as any)?.especialidades,
                    (profissionalCompleto as any)?.crm
                  )}
                    : {profissional?.crm}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-medium">
                  <KeyIcon className="w-3 h-3" />
                  Token Ativo
                </span>
              </div>
              <button
              onClick={onAbrirMemed}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium shadow-sm hover:shadow">
              
                <PillIcon className="w-5 h-5" />
                Abrir Nova Prescrição Memed
                <ExternalLinkIcon className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        }

        {/* ESTADO 2: FALTA CONFIGURAÇÃO GLOBAL */}
        {!isReady && !isConfigured &&
        <div className="text-center py-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircleIcon className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Memed não está ativada na clínica
            </h3>
            <p className="text-gray-600 max-w-lg mx-auto mb-6">
              Para utilizar a prescrição digital, o administrador da clínica
              precisa configurar a integração com a Memed nas Configurações
              Globais do sistema.
            </p>
            <div className="p-4 bg-gray-50 rounded-lg inline-block text-left border border-gray-200">
              <p className="text-sm font-medium text-gray-800 mb-2">
                O que fazer?
              </p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>
                  Peça ao administrador para acessar{' '}
                  <strong>Configurações Globais</strong>
                </li>
                <li>Inserir a API Key e Secret Key da Memed</li>
                <li>Ativar a integração</li>
              </ol>
            </div>
          </div>
        }

        {/* ESTADO 3: CONFIGURADO MAS FALTA TOKEN/CADASTRO DO MÉDICO */}
        {!isReady && isConfigured &&
        <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  Ative sua conta Memed
                </h3>
                <p className="text-gray-600">
                  Falta pouco! Você precisa vincular seu usuário à plataforma
                  Memed para prescrever.
                </p>
              </div>
            </div>

            {error &&
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-800">
                    Não foi possível ativar
                  </p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
          }

            {success &&
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-green-800">Sucesso!</p>
                  <p className="text-sm text-green-700 mt-1">{success}</p>
                </div>
              </div>
          }

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
              <h4 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider">
                Verificação de Dados
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                  {profissionalCompleto?.crm ?
                <CheckCircleIcon className="w-5 h-5 text-green-500" /> :

                <AlertCircleIcon className="w-5 h-5 text-amber-500" />
                }
                  <div>
                    <p className="text-xs text-gray-500">CRM</p>
                    <p className="text-sm font-medium text-gray-900">
                      {profissionalCompleto?.crm || 'Faltando'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                  {profissionalCompleto?.uf ?
                <CheckCircleIcon className="w-5 h-5 text-green-500" /> :

                <AlertCircleIcon className="w-5 h-5 text-amber-500" />
                }
                  <div>
                    <p className="text-xs text-gray-500">UF do Conselho</p>
                    <p className="text-sm font-medium text-gray-900">
                      {profissionalCompleto?.uf || 'Faltando'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                  {profissionalCompleto?.cpf ?
                <CheckCircleIcon className="w-5 h-5 text-green-500" /> :

                <AlertCircleIcon className="w-5 h-5 text-amber-500" />
                }
                  <div>
                    <p className="text-xs text-gray-500">CPF</p>
                    <p className="text-sm font-medium text-gray-900">
                      {profissionalCompleto?.cpf || 'Faltando'}
                    </p>
                  </div>
                </div>
              </div>

              {!hasRequiredData &&
            <div className="mt-4 p-3 bg-amber-100 text-amber-800 text-sm rounded-lg border border-amber-200">
                  <strong>Atenção:</strong> Você precisa preencher seu CRM, UF e
                  CPF no seu perfil antes de ativar a Memed.{' '}
                  {onNavigateUsuarios ?
              <button
                onClick={onNavigateUsuarios}
                className="inline-flex items-center gap-1.5 font-bold text-amber-900 underline hover:text-amber-700 transition-colors cursor-pointer bg-amber-200 px-2 py-0.5 rounded"
                title="Editar cadastro do profissional">
                
                      ✏️ Editar Cadastro do Profissional
                    </button> :

              <>
                      Vá em <strong>Administração → Usuários</strong> e edite
                      seu cadastro.
                    </>
              }
                </div>
            }
            </div>

            {hasRequiredData && !success &&
          <div className="flex flex-col items-center justify-center p-6 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-blue-900 font-medium mb-4 text-center">
                  Seus dados estão corretos! Clique no botão abaixo para criar
                  sua conta na Memed e gerar seu token de acesso
                  automaticamente.
                </p>
                <button
              onClick={handleCadastrarEBuscarToken}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-lg shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed">
              
                  {loading ?
              <>
                      <Loader2Icon className="w-6 h-6 animate-spin" />
                      {actionMessage || 'Processando...'}
                    </> :

              <>
                      Ativar Prescrição Memed Agora
                      <ArrowRightIcon className="w-5 h-5" />
                    </>
              }
                </button>
              </div>
          }
          </div>
        }
      </div>

      {/* Histórico de Prescrições Memed (Só mostra se estiver pronto) */}
      {isReady && prescricoesExibir.length > 0 &&
      <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Prescrições Memed Recentes
          </h3>
          <div className="space-y-2">
            {prescricoesExibir.map((prescricao) =>
          <div
            key={prescricao.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                    <PillIcon className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {prescricao.medicamentos.join(', ')}
                    </p>
                    <p className="text-xs text-gray-500">{prescricao.data}</p>
                  </div>
                </div>
                {prescricao.pdfUrl &&
            <button
              onClick={() => window.open(prescricao.pdfUrl, '_blank')}
              className="p-2 text-gray-400 hover:text-teal-600 transition-colors"
              title="Imprimir PDF">
              
                    <PrinterIcon className="w-4 h-4" />
                  </button>
            }
              </div>
          )}
          </div>
        </div>
      }
    </div>);

}