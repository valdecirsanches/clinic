import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { PasswordInput } from './ui/PasswordInput';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { AlertCircleIcon, CheckCircleIcon, BuildingIcon } from 'lucide-react';
import { TipoUsuario, Operadora } from '../types';
import { API_BASE_URL } from '../config/api';
interface CadastroUsuarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCadastrar: (dados: {
    operadora: Omit<Operadora, 'id' | 'criadoEm'> | null;
    operadoraExistenteId: string | null;
    usuario: {
      nome: string;
      email: string;
      senha: string;
      tipo: TipoUsuario;
    };
  }) => void;
  onBuscarOperadora: (cnpj: string) => Operadora | undefined;
}
export function CadastroUsuarioModal({
  isOpen,
  onClose,
  onCadastrar,
  onBuscarOperadora
}: CadastroUsuarioModalProps) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [cnpj, setCnpj] = useState('');
  const [operadoraEncontrada, setOperadoraEncontrada] = useState<Operadora | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [operadoraData, setOperadoraData] = useState({
    nome: '',
    razaoSocial: '',
    telefone: '',
    email: '',
    endereco: '',
    ativa: true
  });
  const [usuarioData, setUsuarioData] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    tipo: 'admin' as TipoUsuario
  });
  const handleBuscarCnpj = async () => {
    setErro('');
    setBuscando(true);
    if (!cnpj || cnpj.length < 14) {
      setErro('CNPJ inválido');
      setBuscando(false);
      return;
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const operadora = onBuscarOperadora(cnpj);
      if (operadora) {
        setOperadoraEncontrada(operadora);
        try {
          const response = await fetch(`${API_BASE_URL}/api/usuarios?operadoraId=${operadora.id}`);
          if (response.ok) {
            const usuarios = await response.json();
            const temUsuarios = usuarios.length > 0;
            if (temUsuarios) {
              setErro('Esta operadora já possui usuários cadastrados. Entre em contato com o administrador para solicitar acesso.');
              setOperadoraEncontrada(null);
              setBuscando(false);
              return;
            }
          }
        } catch (err) {
          console.error('Erro ao verificar usuários:', err);
        }
        setPasso(2);
      } else {
        setOperadoraEncontrada(null);
        setOperadoraData({
          ...operadoraData,
          nome: '',
          razaoSocial: ''
        });
      }
    } catch (error) {
      console.error('Erro ao buscar operadora:', error);
      setErro('Erro ao buscar operadora. Tente novamente.');
    } finally {
      setBuscando(false);
    }
  };
  const handleContinuar = () => {
    if (!operadoraEncontrada) {
      if (!operadoraData.nome || !operadoraData.razaoSocial) {
        setErro('Preencha os dados da operadora');
        return;
      }
    }
    setPasso(2);
  };
  const handleCadastrar = () => {
    setErro('');
    if (!usuarioData.nome || !usuarioData.email || !usuarioData.senha) {
      setErro('Preencha todos os campos obrigatórios');
      return;
    }
    if (usuarioData.senha.length < 6) {
      setErro('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (usuarioData.senha !== usuarioData.confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }
    onCadastrar({
      operadora: operadoraEncontrada ? null : {
        ...operadoraData,
        cnpj
      },
      operadoraExistenteId: operadoraEncontrada?.id || null,
      usuario: {
        nome: usuarioData.nome,
        email: usuarioData.email,
        senha: usuarioData.senha,
        tipo: usuarioData.tipo
      }
    });
    handleClose();
  };
  const handleClose = () => {
    setPasso(1);
    setCnpj('');
    setOperadoraEncontrada(null);
    setErro('');
    setOperadoraData({
      nome: '',
      razaoSocial: '',
      telefone: '',
      email: '',
      endereco: '',
      ativa: true
    });
    setUsuarioData({
      nome: '',
      email: '',
      senha: '',
      confirmarSenha: '',
      tipo: 'admin'
    });
    onClose();
  };
  return <Modal isOpen={isOpen} onClose={handleClose} title="Cadastrar Administrador da Operadora" footer={<>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          {passo === 1 ? <Button onClick={handleContinuar}>
              {operadoraEncontrada ? 'Continuar' : 'Cadastrar Operadora'}
            </Button> : <Button onClick={handleCadastrar}>Finalizar Cadastro</Button>}
        </>}>
      
      <div className="space-y-6">
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <p className="text-sm text-teal-900 font-medium mb-1">
            🎉 Primeiro Acesso
          </p>
          <p className="text-sm text-teal-700">
            Você será cadastrado como <strong>Administrador</strong> da
            operadora e poderá gerenciar usuários, clínicas e configurações.
          </p>
        </div>

        {erro && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-600">{erro}</p>
          </div>}

        {passo === 1 && <div className="space-y-4">
            <div className="text-center mb-6">
              <BuildingIcon className="w-12 h-12 text-teal-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                Identificação da Operadora
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Informe o CNPJ da operadora para vincular sua conta
              </p>
            </div>

            <Input label="CNPJ da Operadora *" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} disabled={buscando} />
          

            <Button onClick={handleBuscarCnpj} className="w-full" disabled={buscando}>
            
              {buscando ? 'Buscando...' : 'Buscar Operadora'}
            </Button>

            {operadoraEncontrada && <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">
                      Operadora Encontrada!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      <strong>{operadoraEncontrada.nome}</strong>
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {operadoraEncontrada.razaoSocial}
                    </p>
                  </div>
                </div>
              </div>}

            {cnpj && !operadoraEncontrada && cnpj.length >= 14 && <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-3">
                  Operadora não encontrada. Cadastre uma nova:
                </p>
                <div className="space-y-3">
                  <Input label="Nome da Operadora *" value={operadoraData.nome} onChange={(e) => setOperadoraData({
              ...operadoraData,
              nome: e.target.value
            })} placeholder="Nome fantasia" />
              
                  <Input label="Razão Social *" value={operadoraData.razaoSocial} onChange={(e) => setOperadoraData({
              ...operadoraData,
              razaoSocial: e.target.value
            })} placeholder="Razão social completa" />
              
                  <Input label="Telefone" value={operadoraData.telefone} onChange={(e) => setOperadoraData({
              ...operadoraData,
              telefone: e.target.value
            })} placeholder="(00) 0000-0000" />
              
                  <Input label="Email" type="email" value={operadoraData.email} onChange={(e) => setOperadoraData({
              ...operadoraData,
              email: e.target.value
            })} placeholder="contato@operadora.com" />
              
                </div>
              </div>}
          </div>}

        {passo === 2 && <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">👤</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Dados do Administrador
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Operadora:{' '}
                <strong>
                  {operadoraEncontrada?.nome || operadoraData.nome}
                </strong>
              </p>
            </div>

            <Input label="Nome Completo *" value={usuarioData.nome} onChange={(e) => setUsuarioData({
          ...usuarioData,
          nome: e.target.value
        })} placeholder="Nome completo do administrador" />
          

            <Input label="Email *" type="email" value={usuarioData.email} onChange={(e) => setUsuarioData({
          ...usuarioData,
          email: e.target.value
        })} placeholder="email@exemplo.com" />
          

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">
                <strong>Tipo de Usuário:</strong> Administrador
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Como primeiro usuário, você terá permissões de administrador
              </p>
            </div>

            <PasswordInput label="Senha *" value={usuarioData.senha} onChange={(e) => setUsuarioData({
          ...usuarioData,
          senha: e.target.value
        })} placeholder="Mínimo 6 caracteres" />
          

            <PasswordInput label="Confirmar Senha *" value={usuarioData.confirmarSenha} onChange={(e) => setUsuarioData({
          ...usuarioData,
          confirmarSenha: e.target.value
        })} placeholder="Digite a senha novamente" />
          
          </div>}
      </div>
    </Modal>;
}