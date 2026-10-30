import { useState, useCallback } from 'react';
import { ToastType } from '../components/ui/Toast';
interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}
export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const addToast = useCallback((type: ToastType, title: string, message?: string, duration: number = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastData = {
      id,
      type,
      title,
      message,
      duration
    };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);
  const success = useCallback((title: string, message?: string, duration?: number) => {
    return addToast('success', title, message, duration);
  }, [addToast]);
  const error = useCallback((title: string, message?: string, duration?: number) => {
    return addToast('error', title, message, duration);
  }, [addToast]);
  const warning = useCallback((title: string, message?: string, duration?: number) => {
    return addToast('warning', title, message, duration);
  }, [addToast]);
  const info = useCallback((title: string, message?: string, duration?: number) => {
    return addToast('info', title, message, duration);
  }, [addToast]);
  return {
    toasts,
    removeToast,
    success,
    error,
    warning,
    info
  };
}