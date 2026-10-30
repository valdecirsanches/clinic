import React from 'react';
import { Button } from './Button';
import { CheckCircleIcon, AlertCircleIcon, InfoIcon, XCircleIcon, XIcon } from 'lucide-react';
export type DialogType = 'confirm' | 'alert' | 'info' | 'error';
export interface DialogProps {
  id: string;
  type: DialogType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose: (id: string) => void;
}
export function Dialog({
  id,
  type,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  onClose
}: DialogProps) {
  const handleConfirm = () => {
    onConfirm?.();
    onClose(id);
  };
  const handleCancel = () => {
    onCancel?.();
    onClose(id);
  };
  const config = {
    confirm: {
      icon: AlertCircleIcon,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600'
    },
    alert: {
      icon: AlertCircleIcon,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600'
    },
    info: {
      icon: InfoIcon,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    error: {
      icon: XCircleIcon,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600'
    }
  };
  const {
    icon: Icon,
    iconBg,
    iconColor
  } = config[type];
  return <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] animate-fadeIn" onClick={handleCancel} />
      

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scaleIn" onClick={(e) => e.stopPropagation()}>
          
          {/* Close button */}
          <button onClick={handleCancel} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            
            <XIcon className="w-5 h-5 text-gray-400" />
          </button>

          {/* Icon */}
          <div className="text-center mb-4">
            <div className={`inline-flex items-center justify-center w-16 h-16 ${iconBg} rounded-full mb-4`}>
              
              <Icon className={`w-8 h-8 ${iconColor}`} />
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>

            {/* Message */}
            <p className="text-gray-600 leading-relaxed">{message}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            {type === 'confirm' && <>
                <Button variant="ghost" onClick={handleCancel} className="flex-1">
                
                  {cancelText}
                </Button>
                <Button onClick={handleConfirm} className="flex-1">
                  {confirmText}
                </Button>
              </>}

            {type !== 'confirm' && <Button onClick={handleConfirm} className="w-full">
                {confirmText}
              </Button>}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </>;
}