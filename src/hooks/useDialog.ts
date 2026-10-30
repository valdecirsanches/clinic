import { useState, useCallback } from 'react';
import { DialogType } from '../components/ui/Dialog';
interface DialogData {
  id: string;
  type: DialogType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}
export function useDialog() {
  const [dialogs, setDialogs] = useState<DialogData[]>([]);
  const addDialog = useCallback((type: DialogType, title: string, message: string, options?: {
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) => {
    const id = `dialog-${Date.now()}-${Math.random()}`;
    const newDialog: DialogData = {
      id,
      type,
      title,
      message,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      onConfirm: options?.onConfirm,
      onCancel: options?.onCancel
    };
    setDialogs((prev) => [...prev, newDialog]);
    return id;
  }, []);
  const removeDialog = useCallback((id: string) => {
    setDialogs((prev) => prev.filter((dialog) => dialog.id !== id));
  }, []);
  const confirm = useCallback((title: string, message: string, confirmText?: string, cancelText?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      addDialog('confirm', title, message, {
        confirmText,
        cancelText,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }, [addDialog]);
  const alert = useCallback((title: string, message: string, onConfirm?: () => void) => {
    return addDialog('alert', title, message, {
      onConfirm
    });
  }, [addDialog]);
  const info = useCallback((title: string, message: string, onConfirm?: () => void) => {
    return addDialog('info', title, message, {
      onConfirm
    });
  }, [addDialog]);
  const error = useCallback((title: string, message: string, onConfirm?: () => void) => {
    return addDialog('error', title, message, {
      onConfirm
    });
  }, [addDialog]);
  return {
    dialogs,
    removeDialog,
    confirm,
    alert,
    info,
    error
  };
}