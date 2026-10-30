import React, { useEffect, useMemo, useState } from 'react';
import {
  PlusIcon,
  UsersIcon,
  PencilIcon,
  Trash2Icon,
  RefreshCwIcon,
  ClockIcon,
  SearchIcon,
  XIcon } from
'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { UsuarioForm } from '../components/UsuarioForm';
import { HorariosModal } from '../components/HorariosModal';
import { Usuario, Clinica } from '../types';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { API_BASE_URL } from '../config/api';
export interface UsuariosPageProps {
  usuarios: Usuario[];
  clinicas: Clinica[];
  onAddUsuario: (usuario: any) => Promise<any>;
  onUpdateUsuario: (id: string, usuario: any) => Promise<void>;
  onDeleteUsuario: (id: string) => void;
  isSuperAdmin: boolean;
  tipoUsuarioLogado?: string;
  usuarioLogadoId?: string;
  clinicaAtualId?: string;
  operadoraId?: string;
}
export function UsuariosPage({
  usuarios,
  clinicas,
  onAddUsuario,
  onUpdateUsuario,
  onDeleteUsuario,
  isSuperAdmin,
  tipoUsuarioLogado,
  usuarioLogadoId,
  clinicaAtualId,
  operadoraId
}: UsuariosPageProps) {
  const { success, error: showError } = useToast();
  const { confirm } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [usuarioEdit, setUsuarioEdit] = useState<Usuario | null>(null);
  const [usuarioToDelete, setUsuarioToDelete] = useState<string | null>(null);
  // Estados para filtros
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroEmail, setFiltroEmail] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  // Estados para integração Memed
  const [profissionaisMemed, setProfissionaisMemed] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<{
    [key: string]: boolean;
  }>({});
  const [memedConfig, setMemedConfig] = useState<any>(null);
  // Modal de horários
  const [isHorariosModalOpen, setIsHorariosModalOpen] = useState(false);
  const [profissionalSelecionado, setProfissionalSelecionado] =
  useState<Usuario | null>(null);
  // FILTRO BASE: Visibilidade por tipo de usuário logado
  // ⭐ Regra:
  //   - Se uma CLÍNICA está selecionada (clinicaAtualId), mostra SOMENTE os
  //     usuários dessa clínica (independente do tipo de quem está logado),
  //     conforme pedido: "ao entrar em uma clínica, mostre somente os
  //     usuários desta".
  //   - Sem clínica selecionada:
  //       super_admin → toda a operadora + super_admins.
  //       admin       → toda a operadora, exceto super_admins.
  //       outros      → vazio (não deveria acontecer — outros sempre têm
  //                      clinicaAtualId).
  const isAdmin = tipoUsuarioLogado === 'admin';
  const usuariosBase = clinicaAtualId ?
  usuarios.filter(
    (u) =>
    // super_admin pode aparecer mesmo sem clinicaId — só esconde para
    // não-super_admins.
    u.clinicaId === clinicaAtualId && (
    isSuperAdmin || u.tipo !== 'super_admin')
  ) :
  isSuperAdmin ?
  usuarios.filter(
    (u) => u.operadoraId === operadoraId || u.tipo === 'super_admin'
  ) :
  isAdmin ?
  usuarios.filter(
    (u) => u.operadoraId === operadoraId && u.tipo !== 'super_admin'
  ) :
  usuarios.filter(
    (u) => u.clinicaId === clinicaAtualId && u.tipo !== 'super_admin'
  );
  // FILTRO ADICIONAL: Por nome, email e tipo
  const usuariosFiltrados = useMemo(() => {
    return usuariosBase.filter((u) => {
      const matchNome = filtroNome ?
      u.nome.toLowerCase().includes(filtroNome.toLowerCase()) :
      true;
      const matchEmail = filtroEmail ?
      u.email.toLowerCase().includes(filtroEmail.toLowerCase()) :
      true;
      const matchTipo = filtroTipo ? u.tipo === filtroTipo : true;
      return matchNome && matchEmail && matchTipo;
    });
  }, [usuariosBase, filtroNome, filtroEmail, filtroTipo]);
  // Verifica se há filtros ativos
  const temFiltrosAtivos = filtroNome || filtroEmail || filtroTipo;
  // Limpa todos os filtros
  const limparFiltros = () => {
    setFiltroNome('');
    setFiltroEmail('');
    setFiltroTipo('');
  };
  // Opções de tipo para o select
  // ⭐ Super Admin só aparece no filtro para super_admin
  const tiposUsuario = [
  {
    value: '',
    label: 'Todos os tipos'
  },
  ...(isSuperAdmin ?
  [
  {
    value: 'super_admin',
    label: 'Super Admin'
  }] :

  []),
  {
    value: 'admin',
    label: 'Administrador'
  },
  {
    value: 'medico',
    label: 'Médico'
  },
  {
    value: 'dentista',
    label: 'Dentista'
  },
  {
    value: 'atendente',
    label: 'Atendente'
  }];

  // Carrega configuração Memed e profissionais
  useEffect(() => {
    loadMemedConfig();
    loadProfissionaisMemed();
  }, []);
  const loadMemedConfig = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/configuracoes-globais/memed_config`
      );
      if (response.ok) {
        const data = await response.json();
        setMemedConfig(data.valor);
      }
    } catch (err) {
      console.error('Erro ao carregar config Memed:', err);
    }
  };
  const loadProfissionaisMemed = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/memed-profissionais`);
      if (response.ok) {
        const data = await response.json();
        setProfissionaisMemed(data);
      }
    } catch (err) {
      console.error('Erro ao carregar profissionais Memed:', err);
    }
  };
  const isProfissionalMemed = (usuarioId: string) => {
    return profissionaisMemed.some(
      (p) => p.usuarioId === usuarioId && p.status === 'Ativo'
    );
  };
  const cadastrarNoMemed = async (usuario: Usuario) => {
    if (!memedConfig) {
      showError('Erro', 'Configure o Memed em Configurações Globais primeiro');
      return;
    }
    if (!usuario.crm || !usuario.uf || !usuario.cpf) {
      showError(
        'Dados Incompletos',
        'Preencha CRM, UF e CPF antes de cadastrar no Memed'
      );
      return;
    }
    setActionLoading((prev) => ({
      ...prev,
      [`memed_${usuario.id}`]: true
    }));
    try {
      const nomeCompleto = usuario.nome.split(' ');
      const nome = nomeCompleto[0];
      const sobrenome = nomeCompleto.slice(1).join(' ');
      const payload = {
        data: {
          type: 'usuarios',
          attributes: {
            external_id: usuario.id,
            nome,
            sobrenome,
            cpf: usuario.cpf.replace(/\D/g, ''),
            board: {
              board_code: usuario.tipo === 'medico' ? 'CRM' : 'CRO',
              board_number: usuario.crm,
              board_state: usuario.uf
            },
            email: usuario.email,
            telefone: usuario.telefone?.replace(/\D/g, '') || '',
            sexo: 'M',
            data_nascimento: usuario.dataNascimento ?
            usuario.dataNascimento.split('-').reverse().join('/') :
            '01/01/1980'
          }
        }
      };
      // ⭐ Usa proxy do backend para evitar CORS
      const response = await fetch(
        `${API_BASE_URL}/api/memed-profissionais/proxy/cadastrar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );
      if (response.ok) {
        // ⭐ Busca token via proxy
        const tokenResponse = await fetch(
          `${API_BASE_URL}/api/memed-profissionais/proxy/token/${usuario.id}`
        );
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const token = tokenData.data?.attributes?.token;
          if (token) {
            await fetch(`${API_BASE_URL}/api/memed-profissionais`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                usuarioId: usuario.id,
                external_id: usuario.id,
                nome,
                sobrenome,
                cpf: usuario.cpf,
                email: usuario.email,
                telefone: usuario.telefone,
                board_code: usuario.tipo === 'medico' ? 'CRM' : 'CRO',
                board_number: usuario.crm,
                board_state: usuario.uf,
                token,
                status: 'Ativo'
              })
            });
            success(
              'Cadastrado no Memed!',
              `${usuario.nome} foi cadastrado com sucesso`
            );
            loadProfissionaisMemed();
          }
        }
      } else {
        let errorMessage = 'Erro ao cadastrar';
        try {
          const errorText = await response.text();
          const errorData = JSON.parse(errorText);
          errorMessage =
          errorData.errors?.[0]?.detail || errorData.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      showError('Erro ao Cadastrar no Memed', err.message);
    } finally {
      setActionLoading((prev) => ({
        ...prev,
        [`memed_${usuario.id}`]: false
      }));
    }
  };
  const excluirDoMemed = async (usuario: Usuario) => {
    if (!memedConfig) {
      showError('Erro', 'Configure o Memed em Configurações Globais primeiro');
      return;
    }
    const confirmed = await confirm(
      'Excluir do Memed',
      `Tem certeza que deseja excluir ${usuario.nome} do Memed?`,
      'Excluir',
      'Cancelar'
    );
    if (!confirmed) {
      return;
    }
    setActionLoading((prev) => ({
      ...prev,
      [`memed_${usuario.id}`]: true
    }));
    try {
      // ⭐ Usa proxy do backend para evitar CORS
      const response = await fetch(
        `${API_BASE_URL}/api/memed-profissionais/proxy/excluir/${usuario.id}`,
        {
          method: 'DELETE'
        }
      );
      if (response.ok) {
        await fetch(`${API_BASE_URL}/api/memed-profissionais/${usuario.id}`, {
          method: 'DELETE'
        });
        success('Excluído do Memed', `${usuario.nome} foi removido`);
        loadProfissionaisMemed();
      }
    } catch (err: any) {
      showError('Erro ao Excluir', err.message);
    } finally {
      setActionLoading((prev) => ({
        ...prev,
        [`memed_${usuario.id}`]: false
      }));
    }
  };
  const handleConfigurarHorarios = (usuario: Usuario) => {
    if (!clinicaAtualId) {
      showError(
        'Clínica não selecionada',
        'Selecione uma clínica antes de configurar horários'
      );
      return;
    }
    setProfissionalSelecionado(usuario);
    setIsHorariosModalOpen(true);
  };
  console.log('🔍 [UsuariosPage] Filtro de usuários:', {
    isSuperAdmin,
    operadoraId,
    clinicaAtualId,
    totalUsuarios: usuarios.length,
    usuariosBase: usuariosBase.length,
    usuariosFiltrados: usuariosFiltrados.length
  });
  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrador',
      medico: 'Médico',
      dentista: 'Dentista',
      atendente: 'Atendente'
    };
    return labels[tipo] || tipo;
  };
  const getClinicaNome = (clinicaId: string | null) => {
    if (!clinicaId) return 'Todas';
    return clinicas.find((c) => c.id === clinicaId)?.nome || '-';
  };
  const handleEdit = (usuario: Usuario) => {
    setUsuarioEdit(usuario);
    setIsModalOpen(true);
  };
  const handleDelete = (id: string) => {
    setUsuarioToDelete(id);
  };
  const confirmDelete = () => {
    if (usuarioToDelete) {
      onDeleteUsuario(usuarioToDelete);
      setUsuarioToDelete(null);
    }
  };
  const handleSave = async (usuarioData: any): Promise<void> => {
    if (usuarioEdit) {
      // ⭐ FIX: NÃO reenvia a senha antiga (a listagem não traz o campo senha,
      // então usuarioEdit.senha é undefined e apagaria a senha no banco).
      // Quando o campo de senha está vazio, o servidor mantém a senha atual.
      const dataToSave = usuarioData;
      await onUpdateUsuario(usuarioEdit.id, dataToSave);
      // ⭐ FIX: Se o usuário editado é o usuário logado, atualiza localStorage
      try {
        const sessaoStr = localStorage.getItem('sessao');
        if (sessaoStr) {
          const sessao = JSON.parse(sessaoStr);
          if (sessao.usuario?.id === usuarioEdit.id) {
            // Atualiza termoPesquisa no localStorage de busca
            if (usuarioData.termoPesquisa !== undefined) {
              localStorage.setItem(
                'easyclin_busca_paciente_v2',
                usuarioData.termoPesquisa || ''
              );
              console.log(
                '💾 [UsuariosPage] termoPesquisa atualizado no localStorage:',
                usuarioData.termoPesquisa
              );
            }
            // Atualiza dados do usuário na sessão
            // ⭐ Não sobrescreve a senha da sessão com valor vazio
            const { senha: _senhaEditada, ...dadosSemSenhaVazia } = dataToSave;
            sessao.usuario = {
              ...sessao.usuario,
              ...(dataToSave.senha ? dataToSave : dadosSemSenhaVazia),
              id: usuarioEdit.id
            };
            localStorage.setItem('sessao', JSON.stringify(sessao));
            // ⭐ Dispara evento para que useAuth re-sincronize o estado React (atualiza avatar no Header)
            window.dispatchEvent(new Event('sessao-updated'));
            console.log(
              '💾 [UsuariosPage] Sessão atualizada com dados do usuário logado (avatar sincronizado)'
            );
          }
        }
      } catch (e) {
        console.warn('Erro ao atualizar sessão após salvar usuário:', e);
      }
      success(
        'Usuário Atualizado',
        `${usuarioData.nome} foi atualizado com sucesso`
      );
    } else {
      await onAddUsuario(usuarioData);
      success(
        'Usuário Cadastrado',
        `${usuarioData.nome} foi cadastrado com sucesso`
      );
    }
    handleCloseModal();
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setUsuarioEdit(null);
  };
  const columns = [
  {
    key: 'nome',
    label: 'Nome'
  },
  {
    key: 'email',
    label: 'Email'
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (u: Usuario) => getTipoLabel(u.tipo)
  },
  {
    key: 'ativo',
    label: 'Status',
    render: (u: Usuario) =>
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${u.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
      
          {u.ativo ? 'Ativo' : 'Inativo'}
        </span>

  },
  {
    key: 'acoes',
    label: 'Ações',
    render: (u: Usuario) =>
    <div className="flex items-center gap-2">
          <button
        onClick={() => handleEdit(u)}
        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="Editar usuário">
        
            <PencilIcon className="w-4 h-4" />
          </button>

          {['medico', 'dentista'].includes(u.tipo) &&
      <>
              <button
          onClick={() => handleConfigurarHorarios(u)}
          className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
          title="Configurar horários">
          
                <ClockIcon className="w-4 h-4" />
              </button>

              {isProfissionalMemed(u.id) ?
        <button
          onClick={() => excluirDoMemed(u)}
          disabled={actionLoading[`memed_${u.id}`]}
          className="p-2 hover:bg-purple-50 rounded-lg transition-colors relative"
          title="Excluir do Memed">
          
                  {actionLoading[`memed_${u.id}`] ?
          <RefreshCwIcon className="w-4 h-4 animate-spin text-purple-600" /> :

          <img
            src="/image.png"
            alt="Memed"
            className="w-4 h-4 object-contain opacity-50 hover:opacity-100" />

          }
                </button> :

        <button
          onClick={() => cadastrarNoMemed(u)}
          disabled={actionLoading[`memed_${u.id}`]}
          className="p-2 hover:bg-purple-50 rounded-lg transition-colors relative"
          title="Cadastrar no Memed">
          
                  {actionLoading[`memed_${u.id}`] ?
          <RefreshCwIcon className="w-4 h-4 animate-spin text-purple-600" /> :

          <div className="relative">
                      <img
              src="/image.png"
              alt="Memed"
              className="w-4 h-4 object-contain" />
            

                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center">
                        <PlusIcon
                className="w-2 h-2 text-purple-600"
                strokeWidth={3} />
              
                      </div>
                    </div>
          }
                </button>
        }
            </>
      }

          <button
        onClick={() => handleDelete(u.id)}
        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title={
        u.id === usuarioLogadoId ?
        'Não é possível excluir a si mesmo' :
        u.tipo === 'super_admin' ?
        'Super Admin não pode ser excluído' :
        isAdmin && u.tipo === 'admin' && u.id !== usuarioLogadoId ?
        'Admin não pode excluir outro admin' :
        'Excluir usuário'
        }
        disabled={
        u.tipo === 'super_admin' ||
        u.id === usuarioLogadoId ||
        isAdmin &&
        !isSuperAdmin &&
        u.tipo === 'admin' &&
        u.id !== usuarioLogadoId
        }>
        
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>

  }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Gerenciar Usuários
          </h1>
          <p className="text-gray-500 mt-1">
            Administração de usuários e integração Memed
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <PlusIcon className="w-5 h-5 mr-2" />
          Novo Usuário
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <SearchIcon className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">Filtros</span>
          {temFiltrosAtivos &&
          <button
            onClick={limparFiltros}
            className="ml-auto flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            
              <XIcon className="w-4 h-4" />
              Limpar filtros
            </button>
          }
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Buscar por nome..."
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)} />
          

          <Input
            placeholder="Buscar por email..."
            value={filtroEmail}
            onChange={(e) => setFiltroEmail(e.target.value)} />
          

          <Select
            options={tiposUsuario}
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)} />
          
        </div>
        {temFiltrosAtivos &&
        <div className="mt-3 text-sm text-gray-500">
            Mostrando {usuariosFiltrados.length} de {usuariosBase.length}{' '}
            usuários
          </div>
        }
      </Card>

      <Card>
        {usuariosFiltrados.length === 0 ?
        <div className="text-center py-12">
            <UsersIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            {temFiltrosAtivos ?
          <>
                <p className="text-gray-500 mb-4">
                  Nenhum usuário encontrado com os filtros aplicados
                </p>
                <Button variant="secondary" onClick={limparFiltros}>
                  Limpar Filtros
                </Button>
              </> :

          <>
                <p className="text-gray-500 mb-4">Nenhum usuário cadastrado</p>
                <Button
              variant="secondary"
              onClick={() => setIsModalOpen(true)}>
              
                  Cadastrar Primeiro Usuário
                </Button>
              </>
          }
          </div> :

        <Table
          data={usuariosFiltrados}
          columns={columns}
          onRowDoubleClick={(usuario: Usuario) => handleEdit(usuario)} />

        }
      </Card>

      <UsuarioForm
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        clinicas={clinicas}
        isSuperAdmin={isSuperAdmin}
        usuarioEdit={usuarioEdit}
        clinicaAtualId={clinicaAtualId}
        operadoraAtualId={operadoraId} />
      

      {isHorariosModalOpen && profissionalSelecionado && clinicaAtualId &&
      <HorariosModal
        isOpen={isHorariosModalOpen}
        onClose={() => {
          setIsHorariosModalOpen(false);
          setProfissionalSelecionado(null);
        }}
        profissionalId={profissionalSelecionado.id}
        profissionalNome={profissionalSelecionado.nome}
        especialidade={
        profissionalSelecionado.tipo === 'medico' ? 'medico' : 'dentista'
        }
        clinicaId={clinicaAtualId} />

      }

      {usuarioToDelete &&
      <>
          <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setUsuarioToDelete(null)} />
        

          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Confirmar Exclusão
              </h3>
              <p className="text-gray-600 mb-6">
                Tem certeza que deseja excluir este usuário? Esta ação não pode
                ser desfeita.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                variant="ghost"
                onClick={() => setUsuarioToDelete(null)}>
                
                  Cancelar
                </Button>
                <Button
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700">
                
                  Excluir
                </Button>
              </div>
            </div>
          </div>
        </>
      }
    </div>);

}