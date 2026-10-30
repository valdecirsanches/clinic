import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { PasswordInput } from './ui/PasswordInput';
import { Button } from './ui/Button';
import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';
import { DuasEtapasConfig } from './DuasEtapasConfig';

interface TrocaSenhaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrocarSenha: (senhaAtual: string, novaSenha: string) => boolean | Promise<boolean>;
}

type Aba = 'senha' | 'duasEtapas';

/** Segurança da conta: troca de senha e verificação em duas etapas */
export function TrocaSenhaModal({ isOpen, onClose, onTrocarSenha }: TrocaSenhaModalProps) {
  const [aba, setAba] = useState<Aba>('senha');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }
    setSalvando(true);
    // Antes o resultado (uma Promise) era tratado como sucesso sempre
    const ok = await Promise.resolve(onTrocarSenha(senhaAtual, novaSenha)).catch(() => false);
    setSalvando(false);
    if (ok) {
      setSucesso(true);
      setTimeout(() => {
        setSucesso(false);
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        onClose();
      }, 2000);
    } else {
      setErro('Senha atual incorreta');
    }
  };

  const handleClose = () => {
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setErro('');
    setSucesso(false);
    setAba('senha');
    onClose();
  };

  const rodape =
  aba === 'senha' && !sucesso ?
  <>
        <Button variant="ghost" onClick={handleClose}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={salvando}>
          {salvando ? 'Alterando...' : 'Alterar Senha'}
        </Button>
      </> :

  <Button variant="ghost" onClick={handleClose}>
        Fechar
      </Button>;


  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Segurança da conta" footer={rodape}>
      <div className="flex gap-1 border-b border-gray-200 mb-4" role="tablist">
        {([
        { id: 'senha', nome: 'Trocar senha' },
        { id: 'duasEtapas', nome: 'Verificação em duas etapas' }] as
        const).map((a) =>
        <button
          key={a.id}
          type="button"
          role="tab"
          aria-selected={aba === a.id}
          onClick={() => setAba(a.id)}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
          aba === a.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`
          }>
          
            {a.nome}
          </button>
        )}
      </div>

      {aba === 'duasEtapas' ?
      <DuasEtapasConfig /> :
      sucesso ?
      <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900">Senha alterada com sucesso!</p>
        </div> :

      <form onSubmit={handleSubmit} className="space-y-4">
          {erro &&
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-600">{erro}</p>
            </div>
        }
          <PasswordInput label="Senha Atual" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} placeholder="Digite sua senha atual" required />
          <PasswordInput label="Nova Senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Digite a nova senha (mínimo 6 caracteres)" required />
          <PasswordInput label="Confirmar Nova Senha" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} placeholder="Digite a nova senha novamente" required />
        </form>
      }
    </Modal>);

}