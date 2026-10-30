import React, { useEffect, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, InfoIcon, XIcon } from 'lucide-react';
export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}
export function Toast({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose
}: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - elapsed / duration * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        handleClose();
      }
    }, 16);
    return () => clearInterval(interval);
  }, [duration]);
  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 300);
  };
  const config = {
    success: {
      icon: CheckCircleIcon,
      colors: {
        bg: 'bg-white',
        border: 'border-emerald-200',
        iconBg: 'bg-emerald-50',
        iconColor: 'text-emerald-600',
        progress: 'bg-emerald-500'
      }
    },
    error: {
      icon: XCircleIcon,
      colors: {
        bg: 'bg-white',
        border: 'border-red-200',
        iconBg: 'bg-red-50',
        iconColor: 'text-red-600',
        progress: 'bg-red-500'
      }
    },
    warning: {
      icon: AlertCircleIcon,
      colors: {
        bg: 'bg-white',
        border: 'border-amber-200',
        iconBg: 'bg-amber-50',
        iconColor: 'text-amber-600',
        progress: 'bg-amber-500'
      }
    },
    info: {
      icon: InfoIcon,
      colors: {
        bg: 'bg-white',
        border: 'border-blue-200',
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-600',
        progress: 'bg-blue-500'
      }
    }
  };
  const {
    icon: Icon,
    colors
  } = config[type];
  return <div className={`
        ${colors.bg} ${colors.border}
        border rounded-xl shadow-lg backdrop-blur-sm
        overflow-hidden
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full scale-95' : 'opacity-100 translate-x-0 scale-100'}
      `} style={{
    animation: isExiting ? undefined : 'slideIn 0.3s ease-out'
  }}>
      
      <div className="flex items-start gap-3 p-4 pr-12 relative">
        {/* Icon */}
        <div className={`${colors.iconBg} rounded-lg p-2 flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${colors.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 mb-0.5">
            {title}
          </h4>
          {message && <p className="text-sm text-gray-600 leading-relaxed">{message}</p>}
        </div>

        {/* Close Button */}
        <button onClick={handleClose} className="absolute top-3 right-3 p-1 rounded-lg hover:bg-gray-100 transition-colors">
          
          <XIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-gray-100">
        <div className={`h-full ${colors.progress} transition-all duration-100 ease-linear`} style={{
        width: `${progress}%`
      }} />
        
      </div>
    </div>;
}