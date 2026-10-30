import React, { useEffect, useState, useRef } from 'react';
import { Button } from './ui/Button';
import { Trash2Icon, CheckIcon, PenToolIcon } from 'lucide-react';
interface SignaturePadProps {
  value?: string; // Base64 da assinatura
  onChange: (signature: string) => void;
  label?: string;
  disabled?: boolean;
  width?: number;
  height?: number;
}
export function SignaturePad({
  value,
  onChange,
  label = 'Assinatura do Paciente',
  disabled = false,
  width = 400,
  height = 150
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  // Carrega assinatura existente
  useEffect(() => {
    if (value && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          setHasSignature(true);
        };
        img.src = value;
      }
    }
  }, [value]);
  // Inicializa o canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Configura o estilo do traço
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Desenha linha de base pontilhada
    if (!value && !hasSignature) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#d1d5db';
      ctx.beginPath();
      ctx.moveTo(20, height - 30);
      ctx.lineTo(width - 20, height - 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#1f2937';
    }
  }, [width, height, value, hasSignature]);
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return {
      x: 0,
      y: 0
    };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const {
      x,
      y
    } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const {
      x,
      y
    } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Salva a assinatura como base64
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onChange(dataUrl);
    }
  };
  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange('');
    // Redesenha linha de base
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(20, height - 30);
    ctx.lineTo(width - 20, height - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#1f2937';
  };
  return <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        {hasSignature && !disabled && <Button type="button" variant="ghost" size="sm" onClick={clearSignature} className="text-red-600 hover:bg-red-50">
          
            <Trash2Icon className="w-4 h-4 mr-1" />
            Limpar
          </Button>}
      </div>

      <div className={`relative border-2 rounded-lg overflow-hidden ${disabled ? 'border-gray-200 bg-gray-50' : hasSignature ? 'border-green-300 bg-green-50/30' : 'border-gray-300 bg-white hover:border-teal-400'} transition-colors`}>
        
        <canvas ref={canvasRef} width={width} height={height} className={`w-full touch-none ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
        

        {!hasSignature && !disabled && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-400">
              <PenToolIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Assine aqui</p>
            </div>
          </div>}

        {hasSignature && <div className="absolute bottom-2 right-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              <CheckIcon className="w-3 h-3" />
              Assinado
            </div>
          </div>}
      </div>

      <p className="text-xs text-gray-500">
        {disabled ? 'Assinatura registrada' : 'Use o mouse ou toque para assinar. A assinatura será salva automaticamente.'}
      </p>
    </div>;
}