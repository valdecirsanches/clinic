/**
 * ⭐ Utilitário para gerar documentos PDF a partir de HTML
 * Usa jsPDF + html2canvas para gerar PDF REAL com download direto
 *
 * @version 4.0.0 - jsPDF + html2canvas direto (mais confiável)
 */

interface PDFOptions {
  /** Nome do arquivo para download */
  fileName?: string;
  /** Orientação: 'portrait' ou 'landscape' */
  orientation?: 'portrait' | 'landscape';
  /** Formato do papel */
  format?: 'a4' | 'letter';
  /** Margens em mm */
  margin?: number;
}

/**
 * Abre uma janela de preview do documento HTML.
 * O usuário pode visualizar e depois clicar em "Baixar PDF" ou "Imprimir".
 */
export function previewDocumentoPDF(htmlContent: string, options: PDFOptions = {}): void {
  const {
    fileName = 'documento.pdf'
  } = options;
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    // Popup bloqueado — gera direto
    gerarDocumentoPDF(htmlContent, options);
    return;
  }

  // Barra de ações no topo do preview
  const toolbarCSS = `
    .preview-toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      background: #1e293b; color: white; padding: 10px 20px;
      display: flex; align-items: center; justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3); font-family: Arial, sans-serif;
    }
    .preview-toolbar .title { font-size: 14px; font-weight: 600; }
    .preview-toolbar .actions { display: flex; gap: 10px; }
    .preview-toolbar button {
      padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 13px; font-weight: 600; transition: all 0.2s;
    }
    .preview-toolbar .btn-pdf { background: #3b82f6; color: white; }
    .preview-toolbar .btn-pdf:hover { background: #2563eb; }
    .preview-toolbar .btn-print { background: #10b981; color: white; }
    .preview-toolbar .btn-print:hover { background: #059669; }
    .preview-toolbar .btn-close { background: #64748b; color: white; }
    .preview-toolbar .btn-close:hover { background: #475569; }
    .preview-spacer { height: 56px; }
  `;

  // Extrai o body e style do HTML original
  let bodyContent = htmlContent;
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) bodyContent = bodyMatch[1];
  let cssContent = '';
  const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (styleMatches) {
    styleMatches.forEach((match) => {
      const cssMatch = match.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (cssMatch) cssContent += cssMatch[1] + '\n';
    });
  }
  const previewHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Preview — ${fileName}</title>
  <style>${toolbarCSS}</style>
  <style>${cssContent}</style>
  <style>
    body { background: #f1f5f9; margin: 0; padding: 0; }
    .preview-content { max-width: 210mm; margin: 20px auto; background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    @media print { .preview-toolbar { display: none !important; } .preview-spacer { display: none !important; } body { background: white; } .preview-content { box-shadow: none; margin: 0; } }
  </style>
</head>
<body>
  <div class="preview-toolbar">
    <div class="title">📄 Preview — ${fileName.replace('.pdf', '')}</div>
    <div class="actions">
      <button class="btn-pdf" onclick="baixarPDF()">⬇ Baixar PDF</button>
      <button class="btn-print" onclick="window.print()">🖨 Imprimir</button>
      <button class="btn-close" onclick="window.close()">✕ Fechar</button>
    </div>
  </div>
  <div class="preview-spacer"></div>
  <div class="preview-content">
    ${bodyContent}
  </div>
  <script>
    function baixarPDF() {
      var toolbar = document.querySelector('.preview-toolbar');
      var spacer = document.querySelector('.preview-spacer');
      var content = document.querySelector('.preview-content');
      if (toolbar) toolbar.style.display = 'none';
      if (spacer) spacer.style.display = 'none';
      if (content) { content.style.boxShadow = 'none'; content.style.margin = '0 auto'; }
      document.body.style.background = 'white';
      
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = function() {
        html2pdf().set({
          margin: 0,
          filename: '${fileName}',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(content).save().then(function() {
          if (toolbar) toolbar.style.display = 'flex';
          if (spacer) spacer.style.display = 'block';
          if (content) { content.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)'; content.style.margin = '20px auto'; }
          document.body.style.background = '#f1f5f9';
        });
      };
      document.head.appendChild(script);
    }
  </script>
</body>
</html>`;
  previewWindow.document.write(previewHTML);
  previewWindow.document.close();
}

/**
 * Gera um documento PDF real a partir de HTML e faz download direto.
 * NÃO abre janela HTML — gera o arquivo PDF e baixa automaticamente.
 */
export async function gerarDocumentoPDF(htmlContent: string, options: PDFOptions = {}): Promise<void> {
  const {
    fileName = 'documento.pdf',
    orientation = 'portrait',
    format = 'a4',
    margin = 0
  } = options;

  // Limpa o HTML (remove scripts, mantém estilos)
  const htmlLimpo = htmlContent.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Extrai o conteúdo do body
  let bodyContent = htmlLimpo;
  const bodyMatch = htmlLimpo.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  // Extrai CSS inline do HTML
  let cssContent = '';
  const styleMatches = htmlLimpo.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (styleMatches) {
    styleMatches.forEach((match) => {
      const cssMatch = match.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (cssMatch) {
        cssContent += cssMatch[1] + '\n';
      }
    });
  }

  // Cria container temporário para renderizar o HTML
  const container = document.createElement('div');
  container.id = 'pdf-render-container-' + Date.now();
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // A4 width at 96dpi
  container.style.minHeight = '1123px'; // A4 height at 96dpi
  container.style.background = 'white';
  container.style.zIndex = '-1';
  container.style.overflow = 'hidden';

  // Injeta CSS + conteúdo no container
  container.innerHTML = '<style>' + cssContent + '</style>' + bodyContent;
  document.body.appendChild(container);

  // Aguarda imagens carregarem
  await new Promise<void>((resolve) => {
    const images = container.querySelectorAll('img');
    if (images.length === 0) {
      resolve();
      return;
    }
    let loaded = 0;
    const checkDone = () => {
      loaded++;
      if (loaded >= images.length) resolve();
    };
    images.forEach((img) => {
      if (img.complete) {
        checkDone();
      } else {
        img.onload = checkDone;
        img.onerror = checkDone;
      }
    });
    // Timeout de segurança
    setTimeout(resolve, 3000);
  });

  // Pequeno delay para o browser renderizar o CSS
  await new Promise((r) => setTimeout(r, 200));
  try {
    // Tenta usar html2pdf.js se disponível globalmente (carregado via CDN)
    const html2pdfGlobal = (window as any).html2pdf;
    if (html2pdfGlobal) {
      await html2pdfGlobal().set({
        margin: margin,
        filename: fileName,
        image: {
          type: 'jpeg',
          quality: 0.98
        },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          letterRendering: true,
          logging: false,
          width: 794,
          windowWidth: 794
        },
        jsPDF: {
          unit: 'mm',
          format: format,
          orientation: orientation
        },
        pagebreak: {
          mode: ['avoid-all', 'css', 'legacy']
        }
      }).from(container).save();
      console.log('✅ [pdfGenerator] PDF gerado via html2pdf.js:', fileName);
      cleanup(container);
      return;
    }
  } catch (err) {
    console.warn('⚠️ [pdfGenerator] html2pdf.js falhou:', err);
  }
  try {
    // Fallback: jsPDF + html2canvas direto
    const [html2canvasModule, jsPDFModule] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const html2canvas = html2canvasModule.default || html2canvasModule;
    const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 794,
      windowWidth: 794,
      backgroundColor: '#ffffff'
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: format
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = canvas.height * imgWidth / canvas.width;

    // Se o conteúdo é maior que uma página, divide em múltiplas
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = -(imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(fileName);
    console.log('✅ [pdfGenerator] PDF gerado via jsPDF+html2canvas:', fileName);
    cleanup(container);
    return;
  } catch (err) {
    console.warn('⚠️ [pdfGenerator] jsPDF+html2canvas falhou:', err);
  }

  // Último fallback: abre em nova janela com CSS embutido para impressão
  cleanup(container);
  fallbackPrint(htmlLimpo, fileName);
}

/**
 * Remove o container temporário
 */
function cleanup(container: HTMLElement): void {
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

/**
 * Fallback: impressão via iframe (mais confiável que window.open)
 */
function fallbackPrint(htmlContent: string, fileName: string): void {
  // Usa iframe ao invés de window.open para garantir que CSS funcione
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    // Se iframe não funcionar, tenta window.open
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    }
    return;
  }
  iframeDoc.open();
  iframeDoc.write(htmlContent);
  iframeDoc.close();

  // Aguarda renderização e aciona impressão
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('⚠️ [pdfGenerator] Erro ao imprimir via iframe:', e);
    }
    // Remove iframe após impressão
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  }, 500);
}