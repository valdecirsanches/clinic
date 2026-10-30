import React, { useEffect, useState, useRef, createElement } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { API_BASE_URL } from '../config/api';
import {
  UploadIcon,
  SearchIcon,
  Trash2Icon,
  PlusIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  DownloadIcon,
  DownloadCloudIcon,
  InfoIcon,
  ExternalLinkIcon,
  CheckCircleIcon } from
'lucide-react';
interface Cid10 {
  id: string;
  codigo: string;
  descricao: string;
  categoria?: string;
}
// ⭐ URL do arquivo CID-10 no GitHub (raw)
const CID10_GITHUB_URL =
'https://raw.githubusercontent.com/cleytonferrari/CidDataSus/master/CIDImport/Repositorio/Resources/CID-10-SUBCATEGORIAS.CSV';
export function Cid10Page() {
  const [cids, setCids] = useState<Cid10[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalCids, setTotalCids] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCid, setNewCid] = useState({
    codigo: '',
    descricao: '',
    categoria: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success, error: showError } = useToast();
  const { confirm } = useDialog();
  // Carrega CIDs
  const carregarCids = async (termo?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (termo) params.append('search', termo);
      params.append('limit', '100');
      const response = await fetch(`${API_BASE_URL}/api/cid10?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCids(data.cids || []);
        setTotalCids(data.total || 0);
      }
    } catch (err) {
      console.error('Erro ao carregar CIDs:', err);
      showError('Erro', 'Não foi possível carregar os CIDs');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    carregarCids();
  }, []);
  // Busca com debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      carregarCids(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  // ⭐ Decodifica os BYTES do arquivo respeitando a codificação.
  // Os arquivos do DataSUS vêm em Latin-1 (ISO-8859-1 / Windows-1252), não UTF-8.
  // Ler como UTF-8 transforma "ç/ã/ó" em "�" (caractere de substituição → "extra��o").
  // Estratégia: tentamos UTF-8 estrito primeiro; se falhar ou aparecer "�",
  // reinterpretamos os MESMOS bytes como Windows-1252.
  const decodificarBytes = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    // 1) Tenta UTF-8 estrito (lança se houver byte inválido)
    try {
      return new TextDecoder('utf-8', {
        fatal: true
      }).decode(bytes);
    } catch {

      // bytes não são UTF-8 válido -> cai para Latin-1
    } // 2) UTF-8 não-estrito: se NÃO contém "�", o arquivo já era UTF-8 limpo
    const utf8Loose = new TextDecoder('utf-8').decode(bytes);
    if (!utf8Loose.includes('\uFFFD')) return utf8Loose;
    // 3) Reinterpreta como Windows-1252 (superset do ISO-8859-1 usado pelo DataSUS)
    return new TextDecoder('windows-1252').decode(bytes);
  };
  // ⭐ Remove "sujeira" residual de um texto antes de gravar:
  // - caracteres de substituição (�) que tenham sobrado
  // - NUL e aspas/separadores nas pontas
  // - espaços duplicados
  const limparTexto = (raw: string): string =>
  (raw || '').
  replace(/\uFFFD/g, '') // remove qualquer "�" remanescente
  .replace(/\u0000/g, '') // remove NUL
  .replace(/^["';\s]+|["';\s]+$/g, '') // apara aspas/;/espaços nas pontas
  .replace(/\s+/g, ' ') // colapsa espaços
  .trim();
  // ⭐ Normaliza um código CID bruto do DataSUS para o formato com ponto.
  // Ex.: "A000" -> "A00.0"; "A00" -> "A00"; "A00-A09" (faixa) mantém; "8000/0" (CID-O) mantém.
  const normalizarCodigo = (raw: string): string => {
    let c = (raw || '').toUpperCase().trim().replace(/\s+/g, '');
    if (!c) return '';
    // Faixas (grupos/capítulos) e morfologia (CID-O) ficam como estão
    if (c.includes('-') || c.includes('/')) return c;
    // Já tem ponto
    if (c.includes('.')) return c;
    // Subcategoria sem ponto: letra + 3+ dígitos -> insere ponto após o 3º dígito
    const m = c.match(/^([A-Z]\d{3})(\d+)$/);
    if (m) return `${m[1]}.${m[2]}`;
    return c;
  };
  // ⭐ Função para processar texto CSV (formatos DataSUS) e extrair CIDs.
  // Detecta as colunas de código e descrição pelo cabeçalho; cai para posicional se necessário.
  const processarCSV = (
  text: string)
  : {
    codigo: string;
    descricao: string;
    categoria?: string;
  }[] => {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];
    const headerRaw = lines[0] || '';
    const separator = headerRaw.includes(';') ?
    ';' :
    headerRaw.includes('\t') ?
    '\t' :
    ',';
    const splitLine = (line: string) =>
    line.split(separator).map((p) => p.trim().replace(/^"|"$/g, ''));
    const norm = (v: string) =>
    (v || '').
    normalize('NFD').
    replace(/[\u0300-\u036f]/g, '').
    toUpperCase().
    trim();
    const headerCols = splitLine(headerRaw).map(norm);
    const temCabecalho = headerCols.some((c) =>
    [
    'SUBCAT',
    'CAT',
    'CATINIC',
    'NUMCAP',
    'DESCRICAO',
    'DESCRABREV',
    'CODIGO',
    'CID',
    'GRUPO'].
    some((alvo) => c.includes(alvo))
    );
    // Índices das colunas (quando há cabeçalho)
    let idxCodigo = -1;
    let idxDescricao = -1;
    if (temCabecalho) {
      // Código: primeira coluna que pareça código
      idxCodigo = headerCols.findIndex((c) =>
      ['SUBCAT', 'CAT', 'CATINIC', 'CODIGO', 'CID'].some((a) =>
      c.startsWith(a)
      )
      );
      // Descrição: prefere DESCRICAO; depois DESCRABREV
      idxDescricao = headerCols.findIndex((c) => c === 'DESCRICAO');
      if (idxDescricao === -1)
      idxDescricao = headerCols.findIndex((c) => c.includes('DESCRICAO'));
      if (idxDescricao === -1)
      idxDescricao = headerCols.findIndex((c) => c.includes('DESCR'));
    }
    const cidsParaImportar: {
      codigo: string;
      descricao: string;
      categoria?: string;
    }[] = [];
    const startIdx = temCabecalho ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = splitLine(line);
      if (parts.length < 2) continue;
      let codigoRaw: string;
      let descricao: string;
      if (idxCodigo >= 0 && idxDescricao >= 0) {
        codigoRaw = parts[idxCodigo] || '';
        descricao = parts[idxDescricao] || '';
      } else {
        // Fallback posicional: código na col 0; descrição = última coluna textual longa
        codigoRaw = parts[0] || '';
        // procura a coluna de texto mais longa (a descrição costuma ser a maior)
        descricao = parts.
        slice(1).
        reduce(
          (maior, atual) => atual.length > maior.length ? atual : maior,
          ''
        );
      }
      const codigo = normalizarCodigo(codigoRaw);
      descricao = limparTexto(descricao);
      if (!codigo || !descricao) continue;
      // Aceita: subcategorias/categorias (A00, A00.0), faixas (A00-A09) e CID-O (8000/0)
      const valido =
      /^[A-Z]\d{2,3}(\.\d{1,2})?$/.test(codigo) ||
      /^[A-Z]\d{2,3}-[A-Z]\d{2,3}$/.test(codigo) ||
      /^\d{3,5}\/\d$/.test(codigo);
      if (valido) {
        cidsParaImportar.push({
          codigo,
          descricao,
          categoria: ''
        });
      }
    }
    return cidsParaImportar;
  };
  // ⭐ Importar diretamente do GitHub
  const handleImportarDoGitHub = async () => {
    setIsImporting(true);
    setImportStatus('Baixando tabela CID-10 do GitHub...');
    try {
      // Baixa o arquivo do GitHub
      const response = await fetch(CID10_GITHUB_URL);
      if (!response.ok) {
        throw new Error('Não foi possível baixar o arquivo do GitHub');
      }
      // Lê os BYTES e decodifica com a codificação correta (DataSUS = Latin-1),
      // evitando que acentos virem "�".
      const buffer = await response.arrayBuffer();
      const text = decodificarBytes(buffer);
      setImportStatus('Processando dados...');
      const cidsParaImportar = processarCSV(text);
      if (cidsParaImportar.length === 0) {
        showError('Erro', 'Nenhum CID válido encontrado no arquivo');
        return;
      }
      setImportStatus(
        `Importando ${cidsParaImportar.length.toLocaleString()} CIDs...`
      );
      // Envia para o servidor
      const importResponse = await fetch(`${API_BASE_URL}/api/cid10/importar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cids: cidsParaImportar
        })
      });
      if (importResponse.ok) {
        const result = await importResponse.json();
        const importados = result.importados || cidsParaImportar.length;
        success(
          'Importação Concluída!',
          `${importados.toLocaleString()} CIDs importados com sucesso!`
        );
        carregarCids();
      } else {
        showError('Erro', 'Falha ao importar CIDs no servidor');
      }
    } catch (err) {
      console.error('Erro na importação:', err);
      showError(
        'Erro',
        'Falha ao importar do GitHub. Tente importar manualmente.'
      );
    } finally {
      setIsImporting(false);
      setImportStatus('');
    }
  };
  // Importar múltiplos arquivos CSV/TXT locais
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsImporting(true);
    try {
      let todosCids: {
        codigo: string;
        descricao: string;
        categoria?: string;
      }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setImportStatus(
          `Lendo arquivo ${i + 1} de ${files.length}: ${file.name}...`
        );
        // Lê os BYTES e decodifica com a codificação correta (DataSUS = Latin-1).
        const buffer = await file.arrayBuffer();
        const text = decodificarBytes(buffer);
        setImportStatus(`Processando dados de ${file.name}...`);
        const cidsDoArquivo = processarCSV(text);
        todosCids = [...todosCids, ...cidsDoArquivo];
      }
      // Remove duplicados pelo código
      const cidsUnicosMap = new Map();
      todosCids.forEach((cid) => {
        // Se já existe, prefere o que tem descrição maior ou categoria preenchida
        const existente = cidsUnicosMap.get(cid.codigo);
        if (!existente || !existente.categoria && cid.categoria) {
          cidsUnicosMap.set(cid.codigo, cid);
        }
      });
      const cidsParaImportar = Array.from(cidsUnicosMap.values());
      if (cidsParaImportar.length === 0) {
        showError('Erro', 'Nenhum CID válido encontrado nos arquivos.');
        return;
      }
      setImportStatus(
        `Importando ${cidsParaImportar.length.toLocaleString()} CIDs únicos...`
      );
      // Envia para o servidor
      const response = await fetch(`${API_BASE_URL}/api/cid10/importar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cids: cidsParaImportar
        })
      });
      if (response.ok) {
        const result = await response.json();
        const importados = result.importados || cidsParaImportar.length;
        success(
          'Importação Concluída!',
          `${importados.toLocaleString()} CIDs importados com sucesso!`
        );
        carregarCids();
      } else {
        showError('Erro', 'Falha ao importar CIDs no servidor');
      }
    } catch (err) {
      console.error('Erro na importação:', err);
      showError('Erro', 'Falha ao importar arquivos. Verifique o formato.');
    } finally {
      setIsImporting(false);
      setImportStatus('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  // Adicionar CID manualmente
  const handleAddCid = async () => {
    if (!newCid.codigo || !newCid.descricao) {
      showError('Erro', 'Código e descrição são obrigatórios');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/cid10`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newCid)
      });
      if (response.ok) {
        success('CID Adicionado', 'CID cadastrado com sucesso!');
        setShowAddModal(false);
        setNewCid({
          codigo: '',
          descricao: '',
          categoria: ''
        });
        carregarCids(searchTerm);
      } else {
        const err = await response.json();
        showError('Erro', err.error || 'Falha ao adicionar CID');
      }
    } catch (err) {
      showError('Erro', 'Falha ao adicionar CID');
    }
  };
  // Excluir CID
  const handleDeleteCid = async (id: string) => {
    const confirmed = await confirm(
      'Excluir CID',
      'Tem certeza que deseja excluir este CID?',
      'Excluir',
      'Cancelar'
    );
    if (!confirmed) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/cid10/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        success('CID Excluído', 'CID removido com sucesso!');
        carregarCids(searchTerm);
      }
    } catch (err) {
      showError('Erro', 'Falha ao excluir CID');
    }
  };
  // Limpar todos os CIDs
  const handleLimparTodos = async () => {
    const confirmed1 = await confirm(
      'Limpar Todos',
      'ATENÇÃO: Isso irá excluir TODOS os CIDs cadastrados. Tem certeza?',
      'Continuar',
      'Cancelar'
    );
    if (!confirmed1) return;
    const confirmed2 = await confirm(
      'Ação Irreversível',
      'Esta ação é IRREVERSÍVEL. Confirma a exclusão de todos os CIDs?',
      'Excluir Todos',
      'Cancelar'
    );
    if (!confirmed2) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/cid10/limpar`, {
        method: 'DELETE'
      });
      if (response.ok) {
        success('CIDs Excluídos', 'Todos os CIDs foram removidos!');
        carregarCids();
      }
    } catch (err) {
      showError('Erro', 'Falha ao limpar CIDs');
    }
  };
  // Download modelo CSV
  const handleDownloadModelo = () => {
    const modelo = `codigo;descricao;categoria
A00;Cólera;Doenças infecciosas
A00.0;Cólera devida a Vibrio cholerae 01, biótipo cholerae;Doenças infecciosas intestinais
J06.9;Infecção aguda das vias aéreas superiores não especificada;Doenças do aparelho respiratório
I10;Hipertensão essencial (primária);Doenças do aparelho circulatório
E11.9;Diabetes mellitus tipo 2 sem complicações;Doenças endócrinas
M54.5;Dor lombar baixa;Doenças do sistema osteomuscular`;
    const blob = new Blob([modelo], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_cid10.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">CID-10</h1>
          <p className="text-gray-500 mt-1">
            Classificação Internacional de Doenças •{' '}
            {totalCids.toLocaleString()} registros
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleDownloadModelo}>
            <DownloadIcon className="w-4 h-4 mr-2" />
            Modelo CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}>
            
            <UploadIcon className="w-4 h-4 mr-2" />
            Importar CSV
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Adicionar CID
          </Button>
        </div>
      </div>

      {/* Input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        multiple
        onChange={handleImportFile}
        className="hidden" />
      

      {/* Indicador de importação */}
      {isImporting &&
      <Card className="bg-blue-50 border-blue-200">
          <div className="flex items-center gap-4">
            <Loader2Icon className="w-6 h-6 text-blue-600 animate-spin" />
            <div>
              <p className="font-medium text-blue-800">Importando CIDs...</p>
              <p className="text-sm text-blue-600">
                {importStatus || 'Aguarde...'}
              </p>
            </div>
          </div>
        </Card>
      }

      <Card>
        {/* Busca e ações */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Buscar por código ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<SearchIcon className="w-4 h-4" />} />
            
          </div>
          {totalCids > 0 &&
          <Button
            variant="ghost"
            onClick={handleLimparTodos}
            className="text-red-600 hover:bg-red-50">
            
              <Trash2Icon className="w-4 h-4 mr-2" />
              Limpar Todos
            </Button>
          }
        </div>

        {/* Instruções quando não há CIDs */}
        {totalCids === 0 && !loading && !isImporting &&
        <div className="space-y-6">
            <div className="text-center py-8 bg-amber-50 rounded-lg border-2 border-dashed border-amber-300">
              <FileSpreadsheetIcon className="w-16 h-16 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-amber-800 mb-2">
                Tabela CID-10 não importada
              </h3>
              <p className="text-amber-700 mb-6 max-w-lg mx-auto">
                Para usar o diagnóstico com CID-10 no prontuário, importe a
                tabela completa.
              </p>

              {/* ⭐ BOTÃO PRINCIPAL - Importar do GitHub */}
              <Button
              onClick={handleImportarDoGitHub}
              disabled={isImporting}
              className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 text-lg">
              
                {isImporting ?
              <>
                    <Loader2Icon className="w-5 h-5 mr-2 animate-spin" />
                    Importando...
                  </> :

              <>
                    <DownloadCloudIcon className="w-5 h-5 mr-2" />
                    Importar CID-10 Automaticamente
                  </>
              }
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                Clique para baixar e importar ~12.000 códigos CID-10 do DataSUS
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <InfoIcon className="w-5 h-5 text-blue-600" />
                Opções de importação:
              </h4>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    <strong className="text-gray-800">
                      Automática (Recomendado)
                    </strong>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Clique no botão acima para importar automaticamente do
                    GitHub.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <UploadIcon className="w-5 h-5 text-blue-600" />
                    <strong className="text-gray-800">
                      Manual (Arquivo CSV)
                    </strong>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Baixe o arquivo e importe manualmente:
                  </p>
                  <a
                  href="https://github.com/cleytonferrari/CidDataSus/blob/master/CIDImport/Repositorio/Resources/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  
                    <ExternalLinkIcon className="w-3 h-3" />
                    GitHub - CID-10 DataSUS
                  </a>
                </div>
              </div>
            </div>
          </div>
        }

        {/* Lista de CIDs */}
        {loading ?
        <div className="text-center py-12">
            <Loader2Icon className="w-8 h-8 text-teal-600 animate-spin mx-auto" />
            <p className="text-gray-500 mt-2">Carregando...</p>
          </div> :
        cids.length > 0 ?
        <div className="space-y-1">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-600">
              <div className="col-span-2">Código</div>
              <div className="col-span-6">Descrição</div>
              <div className="col-span-3">Categoria</div>
              <div className="col-span-1 text-right">Ações</div>
            </div>
            {cids.map((cid) =>
          <div
            key={cid.id}
            className="grid grid-cols-12 gap-4 px-4 py-3 bg-white border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
            
                <div className="col-span-2 font-mono font-semibold text-teal-700">
                  {cid.codigo}
                </div>
                <div className="col-span-6 text-gray-700">{cid.descricao}</div>
                <div className="col-span-3 text-gray-500 text-sm">
                  {cid.categoria || '-'}
                </div>
                <div className="col-span-1 text-right">
                  <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteCid(cid.id)}
                className="text-red-500 hover:bg-red-50">
                
                    <Trash2Icon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
          )}
            {totalCids > cids.length &&
          <p className="text-center text-gray-500 text-sm py-4">
                Mostrando {cids.length} de {totalCids.toLocaleString()}{' '}
                registros.
              </p>
          }
          </div> :
        searchTerm ?
        <div className="text-center py-12 text-gray-500">
            Nenhum CID encontrado para "{searchTerm}"
          </div> :
        null}
      </Card>

      {/* Modal Adicionar CID */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Adicionar CID"
        footer={
        <>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddCid}>
              <PlusIcon className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </>
        }>
        
        <div className="space-y-4">
          <Input
            label="Código CID *"
            placeholder="Ex: J06.9"
            value={newCid.codigo}
            onChange={(e) =>
            setNewCid({
              ...newCid,
              codigo: e.target.value.toUpperCase()
            })
            } />
          

          <Input
            label="Descrição *"
            placeholder="Ex: Infecção aguda das vias aéreas superiores"
            value={newCid.descricao}
            onChange={(e) =>
            setNewCid({
              ...newCid,
              descricao: e.target.value
            })
            } />
          

          <Input
            label="Categoria (opcional)"
            placeholder="Ex: Doenças respiratórias"
            value={newCid.categoria}
            onChange={(e) =>
            setNewCid({
              ...newCid,
              categoria: e.target.value
            })
            } />
          
        </div>
      </Modal>
    </div>);

}