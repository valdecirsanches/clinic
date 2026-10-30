import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FingerprintIcon, Loader2Icon, CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react';
interface Funcionario {
  id: string;
  nome: string;
  tipo: string;
  temBiometria: boolean;
  numAmostras: number;
  amostrasEsperadas: number;
}
interface PontoLog {
  id: string;
  usuarioNome: string;
  tipo: string;
  dataHora: string;
  dia: string;
}
// ⭐ FIX: a clínica ativa deste app vive no localStorage ('sessao'), não no
// AuthContext. Lê o id da clínica do mesmo lugar que as demais páginas.
function getClinicaId(): string {
  try {
    const raw = localStorage.getItem('sessao');
    return raw ? JSON.parse(raw).clinicaAtual?.id || '' : '';
  } catch {
    return '';
  }
}
export function BiometriaPage() {
  const {
    success,
    error
  } = useToast();
  const [clinicaId] = useState<string>(() => getClinicaId());
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [pontos, setPontos] = useState<PontoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cadastrando, setCadastrando] = useState<string | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const carregarDados = async () => {
    // ⭐ FIX: sempre encerra o loading — antes a função saía cedo (sem clínica)
    // e deixava o spinner girando para sempre.
    if (!clinicaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [resFunc, resPonto] = await Promise.all([fetch(`${API_BASE_URL}/api/biometria/funcionarios?clinicaId=${clinicaId}`), fetch(`${API_BASE_URL}/api/biometria/ponto?clinicaId=${clinicaId}`)]);
      // ⭐ FIX: a API pode devolver um objeto de erro (ou HTML) em vez de um
      // array. Sem coagir para array, os .map/.slice/.length no render quebram
      // a página inteira ("Cannot read properties of undefined (reading 'length')").
      if (resFunc.ok) {
        const dataFunc = await resFunc.json().catch(() => []);
        setFuncionarios(Array.isArray(dataFunc) ? dataFunc : []);
      } else {
        setFuncionarios([]);
      }
      if (resPonto.ok) {
        const dataPonto = await resPonto.json().catch(() => []);
        setPontos(Array.isArray(dataPonto) ? dataPonto : []);
      } else {
        setPontos([]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados de biometria:', err);
      error('Erro', 'Falha ao carregar dados de biometria');
      setFuncionarios([]);
      setPontos([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    carregarDados();
  }, [clinicaId]);
  const handleCadastrar = async (funcionarioId: string) => {
    if (!clinicaId) return;
    setCadastrando(funcionarioId);
    try {
      // The backend will hold the connection open until 4 samples are received or timeout
      const res = await fetch(`${API_BASE_URL}/api/biometria/cadastro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          funcionarioId
        })
      });
      const data = await res.json();
      if (res.ok) {
        success('Sucesso', `Biometria cadastrada com sucesso! (${data.numAmostras} amostras)`);
        carregarDados();
      } else {
        error('Erro no Cadastro', data.error || 'Falha ao capturar biometria');
      }
    } catch (err) {
      error('Erro', 'Falha de comunicação com o servidor');
    } finally {
      setCadastrando(null);
    }
  };
  const handleTestarPonto = async () => {
    if (!clinicaId) return;
    // To test the point marking end-to-end, we simulate a reader sending a captured digital
    // For the manager UI, we will trigger a "cadastro" with 1 sample just to get a digital,
    // then send it to /identificar, then to /ponto.
    // In a real scenario, the reader does the matching and hits /ponto directly.
    setIdentificando(true);
    try {
      // 1. Capture a single sample to test
      const resCap = await fetch(`${API_BASE_URL}/api/biometria/cadastro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clinicaId,
          funcionarioId: funcionarios[0]?.id,
          numAmostras: 1
        })
      });
      const capData = await resCap.json();
      if (!resCap.ok) throw new Error(capData.error || 'Falha ao capturar digital para teste');
      // We don't have the raw digital here because /cadastro saves it and returns success.
      // To truly test /ponto from the manager without a physical device sending the request,
      // we can just prompt the user to select a funcionário and mark the point manually,
      // or explain that the physical device hits /api/biometria/ponto.
      success('Leitor Ativo', 'O leitor respondeu corretamente. Para testar o ponto real, use o dispositivo físico.');
    } catch (err: any) {
      error('Erro no Teste', err.message || 'Falha de comunicação com o leitor');
    } finally {
      setIdentificando(false);
    }
  };
  if (loading) {
    return <div className="flex items-center justify-center h-64">
        <Loader2Icon className="w-8 h-8 animate-spin text-primary" />
      </div>;
  }
  return <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Gerenciador de Biometria
          </h1>
          <p className="text-gray-500">
            Cadastre digitais e monitore os registros de ponto dos funcionários.
          </p>
        </div>
        <Button onClick={handleTestarPonto} disabled={identificando}>
          {identificando ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <FingerprintIcon className="w-4 h-4 mr-2" />}
          Testar Leitor
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de Funcionários */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Funcionários</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-2">Nome</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(funcionarios || []).map((f) => <tr key={f.id}>
                    <td className="py-3 pr-2 font-medium text-gray-900">
                      {f.nome}
                      <div className="text-xs text-gray-500 capitalize">
                        {f.tipo}
                      </div>
                    </td>
                    <td className="py-3 pr-2">
                      {f.temBiometria ? <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          <CheckCircleIcon className="mr-1 h-3 w-3" />
                          Cadastrado ({f.numAmostras}/{f.amostrasEsperadas})
                        </span> : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                          <XCircleIcon className="mr-1 h-3 w-3" />
                          Sem Digital
                        </span>}
                    </td>
                    <td className="py-3 text-right">
                      <Button variant={f.temBiometria ? 'outline' : 'primary'} size="sm" onClick={() => handleCadastrar(f.id)} disabled={cadastrando !== null}>
                      
                        {cadastrando === f.id ? <>
                            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                            Aguardando Leitor...
                          </> : <>
                            <FingerprintIcon className="mr-2 h-4 w-4" />
                            {f.temBiometria ? 'Recadastrar' : 'Cadastrar'}
                          </>}
                      </Button>
                    </td>
                  </tr>)}
                {(funcionarios || []).length === 0 && <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Log de Pontos */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <ClockIcon className="w-5 h-5 mr-2 text-gray-500" />
            Últimos Registros de Ponto
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-2">Data/Hora</th>
                  <th className="py-2 pr-2">Funcionário</th>
                  <th className="py-2">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(pontos || []).slice(0, 15).map((p) => <tr key={p.id}>
                    <td className="whitespace-nowrap py-3 pr-2 text-gray-700">
                      {new Date(p.dataHora).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 pr-2 font-medium text-gray-900">
                      {p.usuarioNome}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${p.tipo === 'chegada' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      
                        {p.tipo === 'chegada' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                  </tr>)}
                {(pontos || []).length === 0 && <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      Nenhum registro de ponto encontrado.
                    </td>
                  </tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>;
}