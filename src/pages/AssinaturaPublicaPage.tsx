import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { SignaturePad } from '../components/SignaturePad';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAssinaturas, AssinaturaPendente } from '../hooks/useAssinaturas';
import { CheckCircleIcon, AlertCircleIcon, FileTextIcon, Loader2Icon } from 'lucide-react';
export function AssinaturaPublicaPage() {
  const {
    token
  } = useParams<{
    token: string;
  }>();
  const {
    getAssinaturaPorToken,
    assinarDocumento,
    loading: hookLoading,
    error: hookError
  } = useAssinaturas();
  const [assinatura, setAssinatura] = useState<AssinaturaPendente | null>(null);
  const [signatureData, setSignatureData] = useState('');
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [containerWidth, setContainerWidth] = useState(300);
  const containerRef = useRef<HTMLDivElement>(null);
  // Carrega dados da assinatura
  useEffect(() => {
    if (token) {
      getAssinaturaPorToken(token).then((data) => setAssinatura(data)).catch((err) => console.error(err));
    }
  }, [token, getAssinaturaPorToken]);
  // Ajusta largura do canvas responsivamente
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        // Subtrai padding (32px)
        setContainerWidth(width - 32);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [hookLoading, success]);
  const handleSalvar = async () => {
    if (!token || !signatureData) return;
    setSaving(true);
    setSaveError(null);
    try {
      console.log('📝 Enviando assinatura...');
      await assinarDocumento(token, signatureData);
      console.log('✅ Assinatura salva com sucesso!');
      setSuccess(true);
    } catch (err: any) {
      console.error('❌ Erro ao salvar assinatura:', err);
      setSaveError(err.message || 'Erro ao salvar assinatura. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };
  // Estado de Carregamento Inicial
  if (hookLoading && !assinatura) {
    return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2Icon className="w-10 h-10 text-teal-600 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Carregando documento...</p>
      </div>;
  }
  // Estado de Erro
  if (hookError || !assinatura) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 text-center border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircleIcon className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Link Inválido ou Expirado
          </h1>
          <p className="text-gray-600 mb-6">
            Não foi possível carregar o documento. O link pode ter expirado ou
            já foi utilizado.
          </p>
          <p className="text-sm text-gray-500">
            Entre em contato com a clínica para solicitar um novo link.
          </p>
        </Card>
      </div>;
  }
  // Estado de Sucesso
  if (success || assinatura.status === 'assinado') {
    return <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center border-green-200 shadow-xl">
          {/* Ícone animado */}
          <div className="relative mb-6">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircleIcon className="w-14 h-14 text-green-600" />
            </div>
            {/* Círculos de animação */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 bg-green-200 rounded-full animate-ping opacity-30"></div>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-green-800 mb-3">
            ✅ Assinado com Sucesso!
          </h1>

          <p className="text-lg text-gray-700 mb-6">
            Obrigado,{' '}
            <strong className="text-green-700">
              {assinatura.pacienteNome.split(' ')[0]}
            </strong>
            !
            <br />
            Sua assinatura foi registrada.
          </p>

          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-left mb-6">
            <p className="text-xs text-green-600 uppercase tracking-wide font-bold mb-2">
              📄 Documento Assinado
            </p>
            <p className="font-semibold text-gray-900 text-lg">
              {assinatura.titulo}
            </p>
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-sm text-green-700 flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4" />
                Assinado em {new Date().toLocaleDateString('pt-BR')} às{' '}
                {new Date().toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              🔒 Sua assinatura foi armazenada de forma segura.
              <br />
              <span className="text-gray-500">
                Você já pode fechar esta janela.
              </span>
            </p>
          </div>
        </Card>
      </div>;
  }
  // Interface de Assinatura
  return <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6" ref={containerRef}>
        {/* Cabeçalho */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-teal-100 rounded-xl mb-4">
            <FileTextIcon className="w-6 h-6 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Assinatura Digital
          </h1>
          <p className="text-gray-600 mt-1">EasyClin</p>
        </div>

        {/* Mensagem de Erro */}
        {saveError && <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Erro ao salvar assinatura
              </p>
              <p className="text-sm text-red-600 mt-1">{saveError}</p>
            </div>
          </div>}

        {/* Card do Documento */}
        <Card className="overflow-hidden border-teal-100 shadow-md">
          <div className="bg-teal-50/50 p-4 border-b border-teal-100">
            <h2 className="font-semibold text-teal-900 flex items-center gap-2">
              <FileTextIcon className="w-4 h-4" />
              {assinatura.titulo}
            </h2>
          </div>

          <div className="p-6 space-y-6">
            {assinatura.descricao && <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 leading-relaxed border border-gray-100">
                {assinatura.descricao}
              </div>}

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Eu,{' '}
                <span className="font-bold text-gray-900">
                  {assinatura.pacienteNome}
                </span>
                , declaro que li e concordo com os termos acima.
              </p>
            </div>

            <div className="pt-2">
              <SignaturePad value={signatureData} onChange={setSignatureData} label="Sua Assinatura" width={containerWidth} height={200} />
              
            </div>

            <Button onClick={handleSalvar} className="w-full bg-teal-600 hover:bg-teal-700 text-white h-12 text-lg shadow-lg shadow-teal-200" disabled={!signatureData || saving}>
              
              {saving ? <>
                  <Loader2Icon className="w-5 h-5 mr-2 animate-spin" />
                  Salvando...
                </> : <>
                  <CheckCircleIcon className="w-5 h-5 mr-2" />
                  Confirmar Assinatura
                </>}
            </Button>

            <p className="text-xs text-center text-gray-400 mt-4">
              Ao assinar, você concorda com o processamento digital deste
              documento.
            </p>
          </div>
        </Card>
      </div>
    </div>;
}