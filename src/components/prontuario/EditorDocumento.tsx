import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  RedoIcon,
  EraserIcon,
  TableIcon,
  UnderlineIcon,
  UndoIcon } from
'lucide-react';
import { paraHtml } from '../../utils/htmlTexto';

interface EditorDocumentoProps {
  /** Conteúdo em HTML ou texto puro (registros antigos) */
  value: string;
  /** Recebe sempre HTML */
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Disparado quando o usuário entra na área de escrita */
  onFocus?: () => void;
  /**
   * Usa toda a largura disponível em vez de manter a proporção de uma folha A4.
   * Indicado quando o texto não é o documento impresso em si (ex.: descrição da
   * prescrição), evitando faixas cinza sem uso nas laterais.
   */
  larguraTotal?: boolean;
  /**
   * Altura do editor. `flex` (padrão) ocupa a altura que o pai oferecer — para
   * telas em que o documento é o protagonista. `compacta`/`media` dão ao editor
   * uma altura própria, para uso dentro de formulários que rolam.
   */
  altura?: 'flex' | 'compacta' | 'media';
  /**
   * No desktop, ocupa a altura útil da janela. Em telas menores mantém a
   * altura indicada em `altura`, para o formulário continuar rolando.
   */
  alturaLgFlex?: boolean;
}

const FONTES = [
{ label: 'Arial', valor: 'Arial, Helvetica, sans-serif' },
{ label: 'Times New Roman', valor: '"Times New Roman", Times, serif' },
{ label: 'Georgia', valor: 'Georgia, serif' },
{ label: 'Calibri', valor: 'Calibri, Candara, sans-serif' },
{ label: 'Courier New', valor: '"Courier New", monospace' },
{ label: 'Verdana', valor: 'Verdana, Geneva, sans-serif' }];


// execCommand('fontSize') aceita apenas 1–7; mapeamos para tamanhos legíveis
const TAMANHOS = [
{ label: '10', valor: '2' },
{ label: '12', valor: '3' },
{ label: '14', valor: '4' },
{ label: '18', valor: '5' },
{ label: '24', valor: '6' },
{ label: '32', valor: '7' }];


const ESTILOS = [
{ label: 'Texto normal', valor: 'p' },
{ label: 'Título', valor: 'h1' },
{ label: 'Subtítulo', valor: 'h2' },
{ label: 'Seção', valor: 'h3' }];


const CORES = [
'#111827',
'#374151',
'#0f766e',
'#1d4ed8',
'#b91c1c',
'#a16207',
'#166534',
'#7e22ce'];


/**
 * Editor de documento para textos clínicos longos.
 *
 * Usa `contentEditable` nativo: recortar/copiar/colar, desfazer/refazer e
 * seleção de texto são os do próprio navegador, sem dependências extras.
 * O valor é aplicado no DOM apenas quando muda por fora (carregar um registro,
 * aplicar um template), para não interromper a digitação nem mover o cursor.
 */
export function EditorDocumento({
  value,
  onChange,
  placeholder = 'Comece a escrever o documento...',
  disabled = false,
  onFocus,
  larguraTotal = false,
  altura = 'flex',
  alturaLgFlex = false
}: EditorDocumentoProps) {
  // Barra enxuta por padrão (negrito, listas, desfazer); "Aa Mais" mostra o
  // restante. A escolha vale para todos os editores deste computador.
  const [completo, setCompleto] = useState<boolean>(() => {
    try {
      return localStorage.getItem('easyclin_editor_completo') === '1';
    } catch {
      return false;
    }
  });
  const alternarCompleto = () => {
    setCompleto((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem('easyclin_editor_completo', novo ? '1' : '0');
      } catch {/* ignora */}
      window.dispatchEvent(new CustomEvent('easyclin-editor-completo', { detail: novo }));
      return novo;
    });
  };
  useEffect(() => {
    const sincronizar = (e: Event) => setCompleto(Boolean((e as CustomEvent).detail));
    window.addEventListener('easyclin-editor-completo', sincronizar);
    return () => window.removeEventListener('easyclin-editor-completo', sincronizar);
  }, []);
  const areaRef = useRef<HTMLDivElement>(null);
  const ultimoValorRef = useRef<string>('');
  const [vazio, setVazio] = useState(true);
  const [formatoAtivo, setFormatoAtivo] = useState<Record<string, boolean>>({});

  // Sincroniza apenas quando o valor vem de fora
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    if (value === ultimoValorRef.current) return;
    const html = paraHtml(value);
    if (html !== area.innerHTML) {
      area.innerHTML = html;
    }
    ultimoValorRef.current = value;
    setVazio(!area.textContent?.trim());
  }, [value]);

  const emitir = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const html = area.innerHTML;
    ultimoValorRef.current = html;
    setVazio(!area.textContent?.trim());
    onChange(html);
  }, [onChange]);

  const atualizarFormatoAtivo = useCallback(() => {
    if (disabled) return;
    try {
      setFormatoAtivo({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull')
      });
    } catch {

      /* navegador sem suporte a queryCommandState */}
  }, [disabled]);

  const executar = useCallback(
    (comando: string, valor?: string) => {
      if (disabled) return;
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      try {
        document.execCommand('styleWithCSS', false, 'true');
      } catch {

        /* ignora */}
      document.execCommand(comando, false, valor);
      atualizarFormatoAtivo();
      emitir();
    },
    [disabled, emitir, atualizarFormatoAtivo]
  );

  const inserirTabela = useCallback(() => {
    if (disabled) return;
    const colunas = 3;
    const linhas = 3;
    const celula =
    '<td style="border:1px solid #cbd5e1;padding:6px 8px;">&nbsp;</td>';
    const cabecalho =
    '<th style="border:1px solid #cbd5e1;padding:6px 8px;background:#f1f5f9;text-align:left;">&nbsp;</th>';
    const html =
    '<table style="border-collapse:collapse;width:100%;margin:12px 0;">' +
    '<thead><tr>' +
    cabecalho.repeat(colunas) +
    '</tr></thead><tbody>' +
    ('<tr>' + celula.repeat(colunas) + '</tr>').repeat(linhas) +
    '</tbody></table><p><br/></p>';
    executar('insertHTML', html);
  }, [disabled, executar]);

  // Ctrl+B / I / U já são nativos; garantimos o comportamento de parágrafo
  const aoTeclar = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === 'Tab') {
      evento.preventDefault();
      executar('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  };

  const classeBotao = (ativo?: boolean) =>
  `p-1.5 rounded transition-colors ${
  ativo ?
  'bg-teal-100 text-teal-700' :
  'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} disabled:opacity-40 disabled:hover:bg-transparent`;


  // `flex-1` só funciona quando o pai define a altura (telas de documento).
  // Em formulários que rolam (anamnese, observações) o editor precisa de uma
  // altura própria, senão colapsa e o campo fica inutilizável.
  const classeAltura =
  altura === 'compacta' ?
  'h-56' :
  altura === 'media' ?
  'h-80' :
  'flex-1 min-h-0';
  // No desktop o editor assume a altura útil da janela (descontando cabeçalho
  // do prontuário e a barra recolhida acima dele), sem depender da cadeia de
  // flex do formulário — que rola e, portanto, não tem altura definida.
  const classeAlturaFinal = alturaLgFlex ?
  `${classeAltura} lg:h-[calc(100vh-24rem)] lg:min-h-[26rem]` :
  classeAltura;

  return (
    <div
      className={`min-w-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white ${classeAlturaFinal}`}>
      
      {/* ===== BARRA DE FERRAMENTAS ===== */}
      <div
        className="flex-shrink-0 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50"
        role="toolbar"
        aria-label="Formatação do documento">
        
        {completo &&
        <>
        <select
          aria-label="Estilo do parágrafo"
          disabled={disabled}
          defaultValue="p"
          onChange={(e) => executar('formatBlock', `<${e.target.value}>`)}
          className="h-7 text-xs border border-gray-300 rounded px-1 bg-white text-gray-700 focus:outline-none focus:border-teal-500 disabled:opacity-50">
          
          {ESTILOS.map((estilo) =>
          <option key={estilo.valor} value={estilo.valor}>
              {estilo.label}
            </option>
          )}
        </select>

        <select
          aria-label="Fonte"
          disabled={disabled}
          defaultValue={FONTES[0].valor}
          onChange={(e) => executar('fontName', e.target.value)}
          className="h-7 text-xs border border-gray-300 rounded px-1 bg-white text-gray-700 focus:outline-none focus:border-teal-500 disabled:opacity-50">
          
          {FONTES.map((fonte) =>
          <option key={fonte.valor} value={fonte.valor}>
              {fonte.label}
            </option>
          )}
        </select>

        <select
          aria-label="Tamanho da fonte"
          disabled={disabled}
          defaultValue="3"
          onChange={(e) => executar('fontSize', e.target.value)}
          className="h-7 w-14 text-xs border border-gray-300 rounded px-1 bg-white text-gray-700 focus:outline-none focus:border-teal-500 disabled:opacity-50">
          
          {TAMANHOS.map((tamanho) =>
          <option key={tamanho.valor} value={tamanho.valor}>
              {tamanho.label}
            </option>
          )}
        </select>

        <span className="w-px h-5 bg-gray-300 mx-0.5" aria-hidden="true" />
        </>
        }

        <button
          type="button"
          onClick={() => executar('bold')}
          disabled={disabled}
          title="Negrito (Ctrl+B)"
          aria-label="Negrito"
          aria-pressed={!!formatoAtivo.bold}
          className={classeBotao(formatoAtivo.bold)}>
          
          <BoldIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('italic')}
          disabled={disabled}
          title="Itálico (Ctrl+I)"
          aria-label="Itálico"
          aria-pressed={!!formatoAtivo.italic}
          className={classeBotao(formatoAtivo.italic)}>
          
          <ItalicIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('underline')}
          disabled={disabled}
          title="Sublinhado (Ctrl+U)"
          aria-label="Sublinhado"
          aria-pressed={!!formatoAtivo.underline}
          className={classeBotao(formatoAtivo.underline)}>
          
          <UnderlineIcon className="w-4 h-4" />
        </button>

        {completo &&
        <>
        {/* Cor do texto */}
        <div className="flex items-center gap-0.5 pl-1">
          {CORES.map((cor) =>
          <button
            key={cor}
            type="button"
            onClick={() => executar('foreColor', cor)}
            disabled={disabled}
            title={`Cor do texto ${cor}`}
            aria-label={`Cor do texto ${cor}`}
            className="w-4 h-4 rounded-full border border-gray-300 disabled:opacity-40"
            style={{ backgroundColor: cor }} />

          )}
        </div>
        </>
        }

        {completo &&
        <>
        <span className="w-px h-5 bg-gray-300 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => executar('justifyLeft')}
          disabled={disabled}
          title="Alinhar à esquerda"
          aria-label="Alinhar à esquerda"
          aria-pressed={!!formatoAtivo.justifyLeft}
          className={classeBotao(formatoAtivo.justifyLeft)}>
          
          <AlignLeftIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('justifyCenter')}
          disabled={disabled}
          title="Centralizar"
          aria-label="Centralizar"
          aria-pressed={!!formatoAtivo.justifyCenter}
          className={classeBotao(formatoAtivo.justifyCenter)}>
          
          <AlignCenterIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('justifyRight')}
          disabled={disabled}
          title="Alinhar à direita"
          aria-label="Alinhar à direita"
          aria-pressed={!!formatoAtivo.justifyRight}
          className={classeBotao(formatoAtivo.justifyRight)}>
          
          <AlignRightIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('justifyFull')}
          disabled={disabled}
          title="Justificar"
          aria-label="Justificar"
          aria-pressed={!!formatoAtivo.justifyFull}
          className={classeBotao(formatoAtivo.justifyFull)}>
          
          <AlignJustifyIcon className="w-4 h-4" />
        </button>
        </>
        }

        <span className="w-px h-5 bg-gray-300 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => executar('insertUnorderedList')}
          disabled={disabled}
          title="Lista com marcadores"
          aria-label="Lista com marcadores"
          aria-pressed={!!formatoAtivo.insertUnorderedList}
          className={classeBotao(formatoAtivo.insertUnorderedList)}>
          
          <ListIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('insertOrderedList')}
          disabled={disabled}
          title="Lista numerada"
          aria-label="Lista numerada"
          aria-pressed={!!formatoAtivo.insertOrderedList}
          className={classeBotao(formatoAtivo.insertOrderedList)}>
          
          <ListOrderedIcon className="w-4 h-4" />
        </button>
        {completo &&
        <button
          type="button"
          onClick={inserirTabela}
          disabled={disabled}
          title="Inserir tabela 3x3"
          aria-label="Inserir tabela"
          className={classeBotao()}>
          
          <TableIcon className="w-4 h-4" />
        </button>
        }

        <span className="w-px h-5 bg-gray-300 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => executar('undo')}
          disabled={disabled}
          title="Desfazer (Ctrl+Z)"
          aria-label="Desfazer"
          className={classeBotao()}>
          
          <UndoIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => executar('redo')}
          disabled={disabled}
          title="Refazer (Ctrl+Y)"
          aria-label="Refazer"
          className={classeBotao()}>
          
          <RedoIcon className="w-4 h-4" />
        </button>
        {completo &&
        <button
          type="button"
          onClick={() => executar('removeFormat')}
          disabled={disabled}
          title="Limpar formatação"
          aria-label="Limpar formatação"
          className={classeBotao()}>
          
          <EraserIcon className="w-4 h-4" />
        </button>
        }
        <button
          type="button"
          onClick={alternarCompleto}
          title={completo ? 'Mostrar só o essencial' : 'Mais formatação: fonte, tamanho, cores, alinhamento, tabela'}
          aria-pressed={completo}
          className="ml-auto h-7 px-2 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">
          {completo ? 'Menos' : 'Aa Mais'}
        </button>
      </div>

      {/* ===== ÁREA DE VISUALIZAÇÃO (único scroll) =====
           A altura é limitada pela tela e a rolagem vive AQUI. A folha abaixo
           não tem altura máxima: ela cresce indefinidamente com o conteúdo,
           então o texto nunca é cortado, por longo que seja o relatório. */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gray-100 ${
        larguraTotal ? 'px-2 py-2 sm:px-3 sm:py-3' : 'px-3 py-4 sm:px-6 sm:py-6'}`
        }>
        
        {/* Folha: sem max-height e sem overflow, para o documento continuar
             para a 2ª, 5ª ou 10ª página.
             `larguraTotal` aproveita toda a largura disponível (sem as faixas
             cinza nas laterais); caso contrário mantém a proporção de uma A4. */}
        <div
          className={`mx-auto w-full bg-white shadow-sm ring-1 ring-gray-200 rounded-sm ${
          larguraTotal ? '' : 'max-w-[210mm]'}`
          }
          style={
          larguraTotal ?
          undefined :
          {
            // Guia discreta a cada página A4, para o usuário perceber
            // onde termina uma folha e começa a próxima. É apenas visual.
            backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent calc(297mm - 1px), #e5e7eb calc(297mm - 1px), #e5e7eb 297mm)'
          }
          }>
          
          <div className="relative">
            {vazio && !disabled &&
            <p className="pointer-events-none absolute left-8 top-8 text-sm text-gray-400 sm:left-14 sm:top-14">
                {placeholder}
              </p>
            }
            <div
              ref={areaRef}
              role="textbox"
              aria-multiline="true"
              aria-label="Conteúdo do documento"
              contentEditable={!disabled}
              suppressContentEditableWarning
              onInput={emitir}
              onFocus={onFocus}
              onBlur={emitir}
              onKeyUp={atualizarFormatoAtivo}
              onMouseUp={atualizarFormatoAtivo}
              onKeyDown={aoTeclar}
              className={`editor-documento focus:outline-none ${
              larguraTotal ?
              'min-h-full px-5 py-5 sm:px-8 sm:py-7' :
              'min-h-[297mm] px-8 py-8 sm:px-14 sm:py-14'} ${
              disabled ? 'cursor-not-allowed bg-gray-50' : ''}`} />
            
          </div>
        </div>
      </div>
    </div>);

}