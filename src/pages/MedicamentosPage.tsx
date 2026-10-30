import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';
import {
  PlusIcon,
  SearchIcon,
  DownloadIcon,
  RefreshCwIcon,
  PillIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  UploadIcon,
  Trash2Icon } from
'lucide-react';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { API_BASE_URL } from '../config/api';
import * as XLSX from 'xlsx';
interface Medicamento {
  id: string;
  nome: string;
  principioAtivo: string;
  concentracao: string;
  formaFarmaceutica: string;
  fabricante: string;
  registroAnvisa: string;
  tarja: 'vermelha' | 'preta' | 'amarela' | 'sem_tarja';
  criadoEm: string;
}
interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
interface Estatisticas {
  total: number;
  vermelha: number;
  preta: number;
  amarela: number;
  sem_tarja: number;
}
export function MedicamentosPage() {
  const { success, error: showError } = useToast();
  const { confirm } = useDialog();
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  const [estatisticas, setEstatisticas] = useState<Estatisticas>({
    total: 0,
    vermelha: 0,
    preta: 0,
    amarela: 0,
    sem_tarja: 0
  });
  const debounceTimer = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    loadMedicamentos();
    loadEstatisticas();
  }, [pagination.page, pagination.limit, searchTerm]);
  // Busca dinâmica com debounce
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      if (searchInput !== searchTerm) {
        setSearchTerm(searchInput);
        setPagination((prev) => ({
          ...prev,
          page: 1
        }));
      }
    }, 300);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchInput]);
  const loadEstatisticas = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/medicamentos/estatisticas`
      );
      if (response.ok) {
        const data = await response.json();
        setEstatisticas(data);
      }
    } catch (err) {
      console.error('❌ Erro ao carregar estatísticas:', err);
    }
  };
  const loadMedicamentos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      });
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      console.log(
        '🔍 Carregando medicamentos de:',
        `${API_BASE_URL}/api/medicamentos?${params}`
      );
      const response = await fetch(`${API_BASE_URL}/api/medicamentos?${params}`);
      console.log('📡 Response status:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log(
          '✅ Medicamentos carregados:',
          result.data?.length || result.length,
          'registros'
        );
        // Suporta tanto o formato antigo quanto o novo com paginação
        if (result.data) {
          setMedicamentos(result.data);
          setPagination((prev) => ({
            ...prev,
            ...result.pagination
          }));
        } else {
          // Formato antigo sem paginação
          setMedicamentos(result);
          setPagination((prev) => ({
            ...prev,
            total: result.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false
          }));
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Erro na resposta:', response.status, errorText);
        showError('Erro', `Erro ${response.status}: ${errorText}`);
      }
    } catch (err) {
      console.error('❌ Erro ao carregar medicamentos:', err);
      showError(
        'Erro',
        'Não foi possível carregar os medicamentos. Verifique se o servidor está rodando.'
      );
    } finally {
      setLoading(false);
    }
  };
  const importarMedicamentos = async () => {
    setImporting(true);
    try {
      console.log(
        '📥 Importando medicamentos de:',
        `${API_BASE_URL}/api/medicamentos/importar`
      );
      const response = await fetch(
        `${API_BASE_URL}/api/medicamentos/importar`,
        {
          method: 'POST'
        }
      );
      console.log('📡 Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Importação concluída:', data);
        success(
          'Importação Concluída',
          `${data.total} medicamentos importados. Total: ${data.totalFinal || data.total}`
        );
        loadMedicamentos();
        loadEstatisticas();
      } else {
        const errorText = await response.text();
        console.error('❌ Erro na importação:', response.status, errorText);
        throw new Error(`Erro ${response.status}: ${errorText}`);
      }
    } catch (err: any) {
      console.error('❌ Erro ao importar:', err);
      showError('Erro na Importação', err.message);
    } finally {
      setImporting(false);
    }
  };
  const handleImportarPlanilha = async (
  e: React.ChangeEvent<HTMLInputElement>) =>
  {
    const file = e.target.files?.[0];
    if (!file) return;
    // Importar SUBSTITUI a base: limpa os dados antigos (com nomes possivelmente
    // incorretos de importacoes anteriores) antes de carregar a planilha nova.
    const substituir = await confirm(
      'Substituir Base',
      'A importacao vai SUBSTITUIR toda a base de medicamentos atual pela planilha selecionada.\n\nDeseja continuar?',
      'Substituir',
      'Cancelar'
    );
    if (!substituir) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setImporting(true);
    try {
      // Primeiro valida a planilha; a base atual só é removida quando houver
      // medicamentos prontos para importar, protegendo os dados existentes.
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array'
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // ⭐ PMVG tem várias linhas de "miolo" antes do cabeçalho real.
      // Lemos como matriz e localizamos a linha de cabeçalho dinamicamente.
      const matriz: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false
      });
      if (matriz.length === 0) {
        showError('Erro', 'Nenhum dado encontrado na planilha.');
        return;
      }
      // Normaliza texto: maiúsculas, sem acentos, sem espaços extras
      const norm = (v: any) =>
      (v ?? '').
      toString().
      normalize('NFD').
      replace(/[\u0300-\u036f]/g, '').
      toUpperCase().
      trim();
      // Acha a linha de cabeçalho. ⚠️ NÃO limitamos a 30 linhas: a CMED/PMVG
      // costuma ter o cabeçalho real lá embaixo (o usuário apontou a linha 54).
      // Varremos a planilha INTEIRA e escolhemos a linha que melhor parece um
      // cabeçalho (a que contém PRODUTO/APRESENTACAO E SUBSTANCIA/PRINCIPIO).
      let headerIdx = -1;
      let headerScoreMelhor = 0;
      for (let i = 0; i < matriz.length; i++) {
        const linha = matriz[i].map(norm);
        const temProduto = linha.some((c) => c === 'PRODUTO');
        const temProdutoLike = linha.some(
          (c) =>
          c.includes('PRODUTO') ||
          c.includes('APRESENTACAO') ||
          c.includes('MEDICAMENTO')
        );
        const temSubstancia = linha.some(
          (c) => c.includes('SUBSTANCIA') || c.includes('PRINCIPIO')
        );
        // Pontua: "PRODUTO" exato vale mais; cabeçalho ideal tem produto + substância.
        let score = 0;
        if (temProduto) score += 3;
        if (temProdutoLike) score += 1;
        if (temSubstancia) score += 2;
        if (score > headerScoreMelhor) {
          headerScoreMelhor = score;
          headerIdx = i;
          // Cabeçalho perfeito (PRODUTO exato + SUBSTANCIA): para a busca.
          if (temProduto && temSubstancia) break;
        }
      }
      if (headerIdx === -1) headerIdx = 0;
      console.log(
        `🧭 Cabeçalho detectado na linha ${headerIdx + 1} (score ${headerScoreMelhor}):`,
        matriz[headerIdx]
      );
      const header = matriz[headerIdx].map(norm);
      // Localiza índices das colunas de interesse (primeira que casar)
      const findCol = (...alvos: string[]) =>
      header.findIndex((c) => alvos.some((a) => c.includes(a)));
      // Igualdade exata de cabeçalho (após normalização)
      const findExact = (...alvos: string[]) =>
      header.findIndex((c) => alvos.some((a) => c === a));
      // ⭐ Coluna do NOME COMERCIAL: é a coluna "PRODUTO", NÃO "TIPO DE PRODUTO"
      // (que contém Novo/Similar/Genérico). A ordem de preferência é estrita:
      //   1) cabeçalho EXATAMENTE "PRODUTO" (ou "NOME DO PRODUTO")
      //   2) contém "PRODUTO" mas NÃO "TIPO" e NÃO "SUBSTANCIA"
      //   3) "MEDICAMENTO"/"NOME COMERCIAL"
      // Esse é o nome que o médico digita na busca (ex.: "Gynazole"), então
      // ele PRECISA entrar no campo `nome`.
      let idxProduto = findExact('PRODUTO', 'NOME DO PRODUTO');
      if (idxProduto === -1) {
        idxProduto = header.findIndex(
          (c) =>
          c.includes('PRODUTO') &&
          !c.includes('TIPO') &&
          !c.includes('SUBSTANCIA')
        );
      }
      if (idxProduto === -1)
      idxProduto = findCol('NOME COMERCIAL', 'MEDICAMENTO', 'NOME');
      const idx = {
        produto: idxProduto,
        substancia: findCol('SUBSTANCIA', 'PRINCIPIO'),
        apresentacao: findCol('APRESENTACAO'),
        forma: findCol('FORMA'),
        laboratorio: findCol('LABORATORIO', 'FABRICANTE', 'DETENTOR'),
        registro: findCol('REGISTRO'),
        // A coluna de tarja na CMED/PMVG aparece com vários nomes (TARJA, LISTA,
        // RESTRIÇÃO, REGIME DE PREÇO, VENDA). Capturamos todos os candidatos.
        tarja: findCol(
          'TARJA',
          'LISTA',
          'RESTRICAO',
          'REGIME',
          'VENDA',
          'PRESCRICAO'
        )
      };
      const pick = (row: any[], i: number) =>
      i >= 0 ? (row[i] ?? '').toString().trim() : '';
      // ⭐⭐ DETECÇÃO PELOS DADOS (à prova de cabeçalho instável da CMED) ⭐⭐
      const amostraDados = matriz.slice(headerIdx + 1, headerIdx + 1 + 200);
      const ncols = matriz[headerIdx]?.length || 0;
      // 1) Coluna de APRESENTAÇÃO: a que mais contém tokens de dose/forma
      //    (ex.: "20 MG/G CREM VAG", "5 MG CAP DURA", "100 MG/ML SOL INJ").
      const reApresentacao =
      /\b(MG|ML|MCG|UI|G)\b|\b(MG\/ML|MG\/G|G\/ML)\b|\b(COM|COMP|CAP|CREM|SOL|SUS|INJ|XPE|POM|GEL|GTS|EMU|PO|SUP|VAG|DURA|REV|EFE)\b/;
      let idxApresentacaoDados = -1;
      {
        let melhor = 0;
        for (let c = 0; c < ncols; c++) {
          let cont = 0;
          for (const row of amostraDados) {
            const v = norm(row[c]);
            if (v && reApresentacao.test(v)) cont++;
          }
          if (cont > melhor) {
            melhor = cont;
            idxApresentacaoDados = c;
          }
        }
      }
      // 2) Coluna do NOME COMERCIAL (PRODUTO): fica IMEDIATAMENTE à esquerda da
      //    apresentação na CMED. Validamos que tenha texto (não vazia, não numérica).
      let idxProdutoDados = -1;
      if (idxApresentacaoDados > 0) {
        const cand = idxApresentacaoDados - 1;
        let comTexto = 0;
        for (const row of amostraDados) {
          const v = norm(row[cand]);
          // texto não vazio, com letras, e que NÃO seja só número/data/EAN
          if (v && /[A-Z]/.test(v) && !/^\d{6,}$/.test(v)) comTexto++;
        }
        if (comTexto >= amostraDados.length * 0.5) idxProdutoDados = cand;
      }
      // Índices finais.
      // APRESENTAÇÃO: cabeçalho "APRESENTACAO" é autoritativo quando existe;
      // só caímos na heurística por dados se a planilha não tiver esse cabeçalho.
      const colApresentacao =
      idx.apresentacao >= 0 ?
      idx.apresentacao :
      idxApresentacaoDados >= 0 ?
      idxApresentacaoDados :
      idx.apresentacao;
      // PRODUTO: o cabeçalho "PRODUTO" é AUTORITATIVO quando existe — é a coluna
      // que o médico busca (ex.: "Gynazole"). Só caímos na heurística por dados
      // se a planilha NÃO tiver um cabeçalho "PRODUTO" identificável.
      const colProduto =
      idx.produto >= 0 ?
      idx.produto :
      idxProdutoDados >= 0 ?
      idxProdutoDados :
      idx.produto;
      // ⭐ Detecção da coluna de TARJA pelos DADOS (à prova de cabeçalho deslocado):
      // varre as primeiras linhas e escolhe a coluna que mais contém a palavra "tarja".
      let idxTarjaDados = -1;
      {
        const amostra = matriz.slice(headerIdx + 1, headerIdx + 1 + 120);
        const ncols = matriz[headerIdx]?.length || 0;
        let melhor = 0;
        for (let c = 0; c < ncols; c++) {
          let cont = 0;
          for (const row of amostra) {
            const v = (row[c] ?? '').
            toString().
            toLowerCase().
            normalize('NFD').
            replace(/[\u0300-\u036f]/g, '');
            if (
            v.includes('tarja') ||
            /\b(vermelha|preta|amarela)\b/.test(v) ||
            v.trim() === '- (*)')
            {
              cont++;
            }
          }
          if (cont > melhor) {
            melhor = cont;
            idxTarjaDados = c;
          }
        }
      }
      const colTarja = idxTarjaDados >= 0 ? idxTarjaDados : idx.tarja;
      // ⭐ Classifica a tarja: usa a coluna detectada; se vazia, varre a linha inteira.
      const classificarTexto = (raw: string) => {
        const t = (raw || '').
        toLowerCase().
        normalize('NFD').
        replace(/[\u0300-\u036f]/g, '');
        if (t.includes('vermelha')) return 'vermelha';
        if (t.includes('preta')) return 'preta';
        if (t.includes('amarela')) return 'amarela';
        return '';
      };
      const derivarTarja = (row: any[]) => {
        const porColuna = classificarTexto(pick(row, colTarja));
        if (porColuna) return porColuna;
        const porLinha = classificarTexto(
          row.map((v) => (v ?? '').toString()).join(' | ')
        );
        return porLinha || 'sem_tarja';
      };
      // Linhas de dados = TUDO após o cabeçalho. Não aplicamos nenhum filtro de
      // conteúdo aqui — queremos 100% das linhas que tenham qualquer texto.
      const linhasDados = matriz.slice(headerIdx + 1);
      let descartadasVazias = 0;
      const medicamentos = linhasDados.
      map((row) => {
        const apresentacao = pick(row, colApresentacao);
        const produto = pick(row, colProduto);
        const substancia = pick(row, idx.substancia);
        // Texto completo da linha — usado como rede de segurança para o nome
        // (garante que o nome comercial NUNCA se perca, mesmo se a coluna
        // PRODUTO foi mal detectada) e para a classificação de tarja.
        const linhaInteira = row.
        map((v) => (v ?? '').toString().trim()).
        filter(Boolean).
        join(' ').
        trim();
        // Nome = MARCA (PRODUTO) + APRESENTAÇÃO. A coluna PRODUTO é o nome
        // comercial que o médico digita na busca (ex.: "Gynazole"), então ela
        // tem que estar SEMPRE no `nome` quando existir.
        let nome = '';
        if (produto && /[A-Za-z]/.test(produto)) {
          const ap =
          apresentacao && !norm(produto).includes(norm(apresentacao)) ?
          apresentacao :
          '';
          nome = [produto, ap].filter(Boolean).join(' ').trim();
        } else {
          nome =
          [substancia, apresentacao].filter(Boolean).join(' ').trim() ||
          substancia ||
          apresentacao;
        }
        // 🛟 Rede de segurança: se não conseguimos um nome textual confiável,
        // usa a linha INTEIRA — assim a busca nunca "perde" o item.
        if (!nome || !/[A-Za-z]/.test(nome)) {
          nome = linhaInteira.slice(0, 480);
        }
        return {
          nome,
          principioAtivo: substancia,
          concentracao: '',
          formaFarmaceutica: pick(row, idx.forma) || apresentacao,
          fabricante: pick(row, idx.laboratorio),
          registroAnvisa: pick(row, idx.registro),
          tarja: derivarTarja(row)
        };
      })
      // Só descartamos linhas TOTALMENTE vazias (sem nenhum texto). Qualquer
      // linha com texto é importada — nada de produto é silenciosamente perdido.
      .filter((m) => {
        const ok = !!(m.nome && /[A-Za-z0-9]/.test(m.nome));
        if (!ok) descartadasVazias++;
        return ok;
      });
      // ⭐ VALIDAÇÃO (atende ao pedido de comparar XML vs importado):
      // log explícito de quantas linhas existiam, quantas viraram medicamento,
      // e quantas foram descartadas por estarem totalmente vazias.
      console.log('📊 VALIDAÇÃO DE IMPORTAÇÃO', {
        linhasNaPlanilha: matriz.length,
        cabecalhoNaLinha: headerIdx + 1,
        linhasDeDados: linhasDados.length,
        medicamentosValidos: medicamentos.length,
        descartadasVazias
      });
      // Diagnóstico do termo que o médico procura (ex.: "Gynazole"): conferimos
      // se ele aparece em QUALQUER célula da planilha e se entrou na lista final.
      const termoBusca = (searchInput || searchTerm || '').trim();
      if (termoBusca) {
        const alvo = norm(termoBusca);
        const naPlanilha = linhasDados.some((row) =>
        row.some((v) => norm(v).includes(alvo))
        );
        const naImportacao = medicamentos.some((m) =>
        norm(m.nome).includes(alvo)
        );
        console.log(
          `🔎 Termo "${termoBusca}": presente na planilha = ${naPlanilha}; presente na importação = ${naImportacao}`
        );
        if (naPlanilha && !naImportacao) {
          const linhaAlvo = linhasDados.find((row) =>
          row.some((v) => norm(v).includes(alvo))
          );
          console.warn(
            `⚠️ "${termoBusca}" existe na planilha mas não no nome importado. Linha de origem:`,
            linhaAlvo
          );
        }
      }
      if (medicamentos.length === 0) {
        showError('Erro', 'Nenhum medicamento válido encontrado na planilha.');
        return;
      }
      // A substituição só ocorre depois da validação completa. Falhar ao limpar
      // interrompe o fluxo para não misturar uma base anterior com a nova.
      const limparResponse = await fetch(
        `${API_BASE_URL}/api/medicamentos/limpar`,
        {
          method: 'DELETE'
        }
      );
      if (!limparResponse.ok) {
        throw new Error('Não foi possível limpar a base atual de medicamentos.');
      }
      // ⭐ Importa em lotes para não estourar o payload do servidor
      const CHUNK = 1000;
      let importadosTotal = 0;
      let totalFinal = 0;
      for (let i = 0; i < medicamentos.length; i += CHUNK) {
        const lote = medicamentos.slice(i, i + CHUNK);
        console.log(
          `📥 Importando lote ${i / CHUNK + 1} (${lote.length} itens)...`
        );
        const response = await fetch(
          `${API_BASE_URL}/api/medicamentos/importar`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              medicamentos: lote
            })
          }
        );
        if (!response.ok) {
          throw new Error('Falha ao importar medicamentos no servidor');
        }
        const result = await response.json();
        importadosTotal += result.total || 0;
        totalFinal = result.totalFinal || totalFinal;
      }
      // Mensagem de validação: linhas da planilha x importadas (atende ao pedido
      // de comparar a origem com o destino).
      success(
        'Importação Concluída!',
        `${importadosTotal.toLocaleString()} de ${linhasDados.length.toLocaleString()} linhas da planilha importadas. ` +
        `Total na base: ${totalFinal.toLocaleString()}.` + (
        descartadasVazias > 0 ?
        ` (${descartadasVazias.toLocaleString()} linhas vazias ignoradas)` :
        '')
      );
      loadMedicamentos();
      loadEstatisticas();
    } catch (err: any) {
      console.error('❌ Erro ao importar planilha:', err);
      showError(
        'Erro na Importação',
        err.message || 'Falha ao processar planilha'
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  const limparBase = async () => {
    const confirmed1 = await confirm(
      'Limpar Base',
      'ATENÇÃO: isso irá remover TODOS os medicamentos cadastrados. Deseja continuar?',
      'Continuar',
      'Cancelar'
    );
    if (!confirmed1) return;
    const confirmed2 = await confirm(
      'Ação Irreversível',
      'Esta ação é IRREVERSÍVEL. Confirma a exclusão de toda a base?',
      'Excluir Tudo',
      'Cancelar'
    );
    if (!confirmed2) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/medicamentos/limpar`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const data = await response.json();
        success('Base Limpa', `${data.excluidos || 0} medicamentos removidos.`);
        loadMedicamentos();
        loadEstatisticas();
      } else {
        throw new Error('Falha ao limpar a base de medicamentos');
      }
    } catch (err: any) {
      showError('Erro', err.message || 'Não foi possível limpar a base');
    }
  };
  const irParaPagina = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({
        ...prev,
        page
      }));
    }
  };
  const mudarLimite = (limit: number) => {
    setPagination((prev) => ({
      ...prev,
      limit,
      page: 1
    }));
  };
  const getTarjaColor = (tarja: string) => {
    const colors: Record<string, string> = {
      vermelha: 'bg-red-100 text-red-800',
      preta: 'bg-gray-900 text-white',
      amarela: 'bg-yellow-100 text-yellow-800',
      sem_tarja: 'bg-gray-100 text-gray-800'
    };
    return colors[tarja] || colors.sem_tarja;
  };
  const getTarjaLabel = (tarja: string) => {
    const labels: Record<string, string> = {
      vermelha: 'Tarja Vermelha',
      preta: 'Tarja Preta',
      amarela: 'Tarja Amarela',
      sem_tarja: 'Sem Tarja'
    };
    return labels[tarja] || 'Sem Tarja';
  };
  const columns = [
  {
    key: 'nome',
    label: 'Medicamento',
    render: (m: Medicamento) =>
    <div>
          <p className="font-medium text-gray-900">{m.nome}</p>
          <p className="text-xs text-gray-500">{m.principioAtivo}</p>
        </div>

  },
  {
    key: 'concentracao',
    label: 'Concentração'
  },
  {
    key: 'formaFarmaceutica',
    label: 'Forma'
  },
  {
    key: 'fabricante',
    label: 'Fabricante'
  },
  {
    key: 'tarja',
    label: 'Tarja',
    render: (m: Medicamento) =>
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${getTarjaColor(m.tarja)}`}>
      
          {getTarjaLabel(m.tarja)}
        </span>

  },
  {
    key: 'registroAnvisa',
    label: 'Registro ANVISA',
    render: (m: Medicamento) =>
    <span className="text-xs text-gray-600">{m.registroAnvisa}</span>

  }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Banco de Medicamentos
          </h1>
          <p className="text-gray-500 mt-1">
            {estatisticas.total > 0 ?
            `${estatisticas.total.toLocaleString()} medicamentos registrados` :
            'Base de dados de medicamentos registrados na ANVISA'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              loadMedicamentos();
              loadEstatisticas();
            }}
            disabled={loading}>
            
            <RefreshCwIcon
              className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            
            Atualizar
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}>
            
            <UploadIcon className="w-4 h-4 mr-2" />
            Importar Planilha (XLS/XLSX)
          </Button>
          {estatisticas.total > 0 &&
          <Button
            variant="ghost"
            onClick={limparBase}
            disabled={importing || loading}
            className="text-red-600 hover:bg-red-50">
            
              <Trash2Icon className="w-4 h-4 mr-2" />
              Limpar Base
            </Button>
          }
          <Button onClick={importarMedicamentos} disabled={importing}>
            {importing ?
            <>
                <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </> :

            <>
                <DownloadIcon className="w-4 h-4 mr-2" />
                Importar Base ANVISA
              </>
            }
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx"
        onChange={handleImportarPlanilha}
        className="hidden" />
      

      {/* Estatísticas - Agora com dados do servidor */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <PillIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {estatisticas.total.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total de Medicamentos</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <div className="w-6 h-2 bg-red-600 rounded"></div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {estatisticas.vermelha.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Tarja Vermelha</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
              <div className="w-6 h-2 bg-white rounded"></div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {estatisticas.preta.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Tarja Preta</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <div className="w-6 h-2 bg-yellow-600 rounded"></div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {estatisticas.amarela.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Tarja Amarela</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Busca */}
      <Card className="p-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, princípio ativo ou fabricante... (busca automática)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          

          {loading &&
          <RefreshCwIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
          }
        </div>
        {searchTerm &&
        <p className="text-sm text-gray-600 mt-2">
            🔍 Buscando: <strong>{searchTerm}</strong> • {pagination.total}{' '}
            {pagination.total === 1 ? 'resultado' : 'resultados'}
          </p>
        }
      </Card>

      {/* Tabela */}
      <Card>
        {loading && medicamentos.length === 0 ?
        <div className="text-center py-12">
            <RefreshCwIcon className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-600">Carregando medicamentos...</p>
            <p className="text-xs text-gray-400 mt-2">
              Conectando a: {API_BASE_URL}
            </p>
          </div> :
        medicamentos.length === 0 ?
        <div className="text-center py-12">
            <PillIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              {searchTerm ?
            'Nenhum medicamento encontrado' :
            'Nenhum medicamento cadastrado'}
            </p>
            <p className="text-xs text-gray-400 mb-4">API: {API_BASE_URL}</p>
            {!searchTerm &&
          <Button
            variant="secondary"
            onClick={importarMedicamentos}
            disabled={importing}>
            
                {importing ?
            <>
                    <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </> :

            <>
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    Importar Base ANVISA
                  </>
            }
              </Button>
          }
          </div> :

        <>
            <Table columns={columns} data={medicamentos} />

            {/* Controles de Paginação */}
            <div className="p-4 border-t flex items-center justify-between">
              {/* Info da página */}
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-600">
                  Mostrando{' '}
                  <strong>
                    {(
                  (pagination.page - 1) * pagination.limit +
                  1).
                  toLocaleString()}
                  </strong>{' '}
                  a{' '}
                  <strong>
                    {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  ).toLocaleString()}
                  </strong>{' '}
                  de <strong>{pagination.total.toLocaleString()}</strong>{' '}
                  medicamentos
                </p>

                {/* Seletor de itens por página */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Por página:</label>
                  <select
                  value={pagination.limit}
                  onChange={(e) => mudarLimite(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
                  
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>

              {/* Botões de navegação */}
              <div className="flex items-center gap-2">
                <Button
                variant="ghost"
                size="sm"
                onClick={() => irParaPagina(1)}
                disabled={!pagination.hasPrev}
                title="Primeira página">
                
                  <ChevronsLeftIcon className="w-4 h-4" />
                </Button>
                <Button
                variant="ghost"
                size="sm"
                onClick={() => irParaPagina(pagination.page - 1)}
                disabled={!pagination.hasPrev}
                title="Página anterior">
                
                  <ChevronLeftIcon className="w-4 h-4" />
                </Button>

                <div className="flex items-center gap-2 px-4">
                  <span className="text-sm text-gray-600">Página</span>
                  <input
                  type="number"
                  min={1}
                  max={pagination.totalPages}
                  value={pagination.page}
                  onChange={(e) => {
                    const page = Number(e.target.value);
                    if (page >= 1 && page <= pagination.totalPages) {
                      irParaPagina(page);
                    }
                  }}
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                

                  <span className="text-sm text-gray-600">
                    de {pagination.totalPages.toLocaleString()}
                  </span>
                </div>

                <Button
                variant="ghost"
                size="sm"
                onClick={() => irParaPagina(pagination.page + 1)}
                disabled={!pagination.hasNext}
                title="Próxima página">
                
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
                <Button
                variant="ghost"
                size="sm"
                onClick={() => irParaPagina(pagination.totalPages)}
                disabled={!pagination.hasNext}
                title="Última página">
                
                  <ChevronsRightIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        }
      </Card>
    </div>);

}