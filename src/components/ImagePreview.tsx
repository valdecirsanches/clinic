import React, { useEffect, useState, useRef, createElement } from 'react';
import { Button } from './ui/Button';
import { ZoomInIcon, ZoomOutIcon, PrinterIcon, MaximizeIcon, MinimizeIcon, MoveIcon, XIcon, RefreshCwIcon, AlertCircleIcon, DownloadIcon } from 'lucide-react';
interface ImagePreviewProps {
  src: string;
  alt: string;
  onClose?: () => void;
}
export function ImagePreview({
  src,
  alt,
  onClose
}: ImagePreviewProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({
    x: 0,
    y: 0
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({
    x: 0,
    y: 0
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Reset state when src changes
  useEffect(() => {
    setScale(1);
    setPosition({
      x: 0,
      y: 0
    });
    setImageStatus('loading');
    setRetryCount(0);
  }, [src]);
  // Handle ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isFullscreen]);
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 4));
  };
  const handleZoomOut = () => {
    setScale((prev) => {
      const newScale = Math.max(prev - 0.25, 0.5);
      if (newScale <= 1) {
        setPosition({
          x: 0,
          y: 0
        });
      }
      return newScale;
    });
  };
  const handleReset = () => {
    setScale(1);
    setPosition({
      x: 0,
      y: 0
    });
  };
  const handlePrint = () => {
    const html = '<!DOCTYPE html><html><head><title>Imprimir</title>' + '<sty' + 'le>' + '* { margin: 0; padding: 0; box-sizing: border-box; }' + 'html, body { width: 100%; height: 100%; background: white; }' + 'body { display: flex; justify-content: center; align-items: center; padding: 10mm; }' + 'img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }' + '@media print { @page { margin: 5mm; } }' + '</sty' + 'le></head><body>' + '<img src="' + src + '" alt="' + alt + '" />' + '</body></html>';
    // ⭐ Abre preview antes de salvar
    import('../utils/pdfGenerator').then(({
      previewDocumentoPDF
    }) => {
      const nomeArquivo = `Imagem_${alt.replace(/\s+/g, '_').substring(0, 30)}.pdf`;
      previewDocumentoPDF(html, {
        fileName: nomeArquivo
      });
    });
  };
  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    // Reset zoom when toggling fullscreen
    setScale(1);
    setPosition({
      x: 0,
      y: 0
    });
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  const handleMouseLeave = () => {
    setIsDragging(false);
  };
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };
  const handleRetry = () => {
    setImageStatus('loading');
    setRetryCount((prev) => prev + 1);
  };
  // Build src with cache-busting on retry
  const imageSrc = retryCount > 0 ? `${src}${src.includes('?') ? '&' : '?'}_retry=${retryCount}&t=${Date.now()}` : src;
  const imageViewer = <div className={`flex flex-col ${isFullscreen ? 'h-screen w-screen' : 'h-full w-full'} bg-gray-50 rounded-lg overflow-hidden`}>
    
      {/* Toolbar */}
      <div className={`flex items-center justify-between p-2 ${isFullscreen ? 'bg-gray-900 border-b border-gray-700' : 'bg-white border-b border-gray-200'} shadow-sm z-10`}>
      
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={scale <= 0.5} title="Diminuir Zoom" className={isFullscreen ? 'text-gray-300 hover:text-white hover:bg-gray-700' : ''}>
          
            <ZoomOutIcon className="w-4 h-4" />
          </Button>
          <span className={`text-xs font-medium w-12 text-center ${isFullscreen ? 'text-gray-300' : 'text-gray-600'}`}>
          
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={scale >= 4} title="Aumentar Zoom" className={isFullscreen ? 'text-gray-300 hover:text-white hover:bg-gray-700' : ''}>
          
            <ZoomInIcon className="w-4 h-4" />
          </Button>
          <div className={`w-px h-4 mx-1 ${isFullscreen ? 'bg-gray-600' : 'bg-gray-300'}`} />
        

          <Button variant="ghost" size="sm" onClick={handleReset} disabled={scale === 1 && position.x === 0 && position.y === 0} title="Tamanho Original" className={isFullscreen ? 'text-gray-300 hover:text-white hover:bg-gray-700' : ''}>
          
            <MaximizeIcon className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {scale > 1 && <span className={`text-xs flex items-center gap-1 mr-2 ${isFullscreen ? 'text-gray-400' : 'text-gray-500'}`}>
          
              <MoveIcon className="w-3 h-3" />
              Arraste para mover
            </span>}
          <Button variant="ghost" size="sm" onClick={handleToggleFullscreen} title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'} className={isFullscreen ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800'}>
          
            {isFullscreen ? <MinimizeIcon className="w-4 h-4" /> : <MaximizeIcon className="w-4 h-4" />}
          </Button>
          {isFullscreen && <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)} title="Fechar" className="text-gray-300 hover:text-white hover:bg-gray-700">
          
              <XIcon className="w-4 h-4" />
            </Button>}
          <Button variant="secondary" size="sm" onClick={handlePrint} title="Imprimir Imagem" className={isFullscreen ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border-gray-600' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'}>
          
            <PrinterIcon className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Image Container */}
      <div ref={containerRef} className={`flex-1 overflow-hidden relative flex items-center justify-center ${isFullscreen ? 'bg-gray-950' : 'bg-gray-100'} ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onWheel={handleWheel}>
      
        {/* ⭐ Loading state */}
        {imageStatus === 'loading' && <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-500">Carregando imagem...</p>
            </div>
          </div>}

        {/* ⭐ Error state */}
        {imageStatus === 'error' && <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center space-y-4 p-6 max-w-sm">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircleIcon className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  Não foi possível carregar a imagem
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  O arquivo pode estar indisponível ou o servidor não respondeu.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Button variant="secondary" size="sm" onClick={handleRetry}>
                  <RefreshCwIcon className="w-4 h-4 mr-2" />
                  Tentar novamente
                </Button>
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    Abrir direto
                  </Button>
                </a>
              </div>
            </div>
          </div>}

        <img key={`img_${retryCount}`} src={imageSrc} alt={alt} className={`max-w-full max-h-full transition-transform duration-200 ease-out select-none ${imageStatus !== 'loaded' ? 'opacity-0' : 'opacity-100'}`} style={{
        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        transformOrigin: 'center',
        pointerEvents: 'none'
      }} draggable={false} onLoad={() => {
        console.log(`✅ [ImagePreview] Imagem carregada: ${src.substring(0, 80)}`);
        setImageStatus('loaded');
      }} onError={() => {
        console.error(`❌ [ImagePreview] Erro ao carregar: ${src.substring(0, 80)}`);
        setImageStatus('error');
      }} />
      
      </div>
    </div>;

  // Fullscreen mode: render as fixed overlay
  if (isFullscreen) {
    return <div className="fixed inset-0 z-[9999] bg-black">{imageViewer}</div>;
  }
  return imageViewer;
}