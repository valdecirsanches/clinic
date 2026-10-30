import React, { useEffect } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from './Button';
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string | React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'default' | 'large' | 'fullscreen';
}
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'default'
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const sizeClasses = {
    default: 'max-w-2xl w-full',
    large: 'max-w-6xl w-full',
    fullscreen: 'max-w-[98vw] w-[98vw] h-[96vh]'
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className={`relative bg-white rounded-lg shadow-xl ${sizeClasses[size]} max-h-[96vh] overflow-hidden flex flex-col`}>
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          {typeof title === 'string' ? <h2 className="text-xl font-semibold text-gray-900">{title}</h2> : title}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            {footer}
          </div>}
      </div>
    </div>;
}