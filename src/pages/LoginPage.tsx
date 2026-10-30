import React, { useEffect, useState } from 'react';
import { LoginForm, type LoginFormProps } from '../components/LoginForm';
import { CadastroUsuarioModal } from '../components/CadastroUsuarioModal';
import { TutorialOnboarding } from '../components/TutorialOnboarding';
import { Button } from '../components/ui/Button';
import { UserPlusIcon, PlayCircleIcon, SparklesIcon } from 'lucide-react';
import { Operadora } from '../types';
import { APP_VERSION } from '../config/version';
import { API_BASE_URL } from '../config/api';
export interface LoginPageProps {
  onLogin: LoginFormProps['onLogin'];
  onConfirmarCodigo: LoginFormProps['onConfirmarCodigo'];
  onReenviarCodigo: LoginFormProps['onReenviarCodigo'];
  onCadastrarUsuario: (dados: {
    operadora: Omit<Operadora, 'id' | 'criadoEm'> | null;
    operadoraExistenteId: string | null;
    usuario: {
      nome: string;
      email: string;
      senha: string;
      tipo: any;
    };
  }) => void;
  onBuscarOperadora: (cnpj: string) => Operadora | undefined;
  existemUsuarios: boolean;
}
export function LoginPage({
  onLogin,
  onConfirmarCodigo,
  onReenviarCodigo,
  onCadastrarUsuario,
  onBuscarOperadora,
  existemUsuarios
}: LoginPageProps) {
  const [showCadastro, setShowCadastro] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  // Verifica se já viu o tutorial (apenas para mostrar badge "Novo")
  useEffect(() => {
    const seen = localStorage.getItem('easyclin_tutorial_seen');
    if (seen) {
      setHasSeenTutorial(true);
    }
    // REMOVIDO: Auto-abertura do tutorial na primeira visita
    // Agora o tutorial só abre quando o usuário clica no botão
  }, []);
  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('easyclin_tutorial_seen', 'true');
    setHasSeenTutorial(true);
  };
  const handleCadastroClick = () => {
    setShowCadastro(true);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-teal-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600 rounded-2xl mb-4 shadow-lg">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            EasyClin 2.0
          </h1>
          <p className="text-gray-600">Sistema de Gestão para Clínicas</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Entrar na plataforma
          </h2>
          <LoginForm
            onLogin={onLogin}
            onConfirmarCodigo={onConfirmarCodigo}
            onReenviarCodigo={onReenviarCodigo} />
          

          <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleCadastroClick}>
              
              <UserPlusIcon className="w-5 h-5 mr-2" />
              Criar Nova Conta
            </Button>

            {/* Botão do Tutorial */}
            <button
              onClick={() => setShowTutorial(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg hover:from-teal-600 hover:to-cyan-700 transition-all group">
              
              <PlayCircleIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Assistir Tutorial</span>
              {!hasSeenTutorial &&
              <span className="flex items-center gap-1 ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  <SparklesIcon className="w-3 h-3" />
                  Novo
                </span>
              }
            </button>

            <p className="text-xs text-gray-500 text-center">
              Conheça todas as funcionalidades do sistema
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          © 2024 EasyClin 2.0 ({APP_VERSION})
        </p>
        {/* API configurada — informação discreta para diagnóstico */}
        <p
          className="text-center text-[11px] text-gray-400 mt-1"
          title="Servidor de API que este ambiente está usando">
          
          API: {API_BASE_URL.replace(/^https?:\/\//, '')}
        </p>
      </div>

      <CadastroUsuarioModal
        isOpen={showCadastro}
        onClose={() => setShowCadastro(false)}
        onCadastrar={onCadastrarUsuario}
        onBuscarOperadora={onBuscarOperadora} />
      

      <TutorialOnboarding isOpen={showTutorial} onClose={handleCloseTutorial} />
    </div>);

}