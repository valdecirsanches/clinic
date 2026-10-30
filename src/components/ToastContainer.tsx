import React from 'react';
import { Toast, ToastProps } from './ui/Toast';
interface ToastContainerProps {
  toasts: Omit<ToastProps, 'onClose'>[];
  onClose: (id: string) => void;
}
export function ToastContainer({
  toasts,
  onClose
}: ToastContainerProps) {
  return <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
      {toasts.map((toast) => <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={onClose} />
        </div>)}
    </div>;
}