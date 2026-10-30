import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  XIcon,
  HelpCircleIcon } from
'lucide-react';
type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question';
type SweetAlertInput =
'text' |
'time' |
'date' |
'number' |
'email' |
'password' |
'textarea';
interface SweetAlertOptions {
  icon?: AlertType;
  title?: string;
  text?: string;
  html?: React.ReactNode;
  showCancelButton?: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonColor?: string;
  cancelButtonColor?: string;
  timer?: number;
  showConfirmButton?: boolean;
  preConfirm?: (value?: any) => any;
  // ⭐ Input support (subset of SweetAlert2 API)
  input?: SweetAlertInput;
  inputValue?: string;
  inputPlaceholder?: string;
  inputLabel?: string;
}
interface SweetAlertResult {
  isConfirmed: boolean;
  isDismissed: boolean;
  value?: any;
}
let showAlertFn:
((options: SweetAlertOptions) => Promise<SweetAlertResult>) |
null = null;
// ⭐ Validation message support
let setValidationMsgFn: ((msg: string) => void) | null = null;
export function SweetAlertProvider({
  children


}: {children: React.ReactNode;}) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<SweetAlertOptions>({});
  const [resolvePromise, setResolvePromise] = useState<
    ((result: SweetAlertResult) => void) | null>(
    null);
  const [validationMessage, setValidationMessage] = useState('');
  const [inputValue, setInputValue] = useState('');
  useEffect(() => {
    setValidationMsgFn = (msg: string) => setValidationMessage(msg);
    showAlertFn = (opts: SweetAlertOptions) => {
      return new Promise<SweetAlertResult>((resolve) => {
        setOptions(opts);
        setIsOpen(true);
        setValidationMessage('');
        setInputValue(opts.input ? String(opts.inputValue ?? '') : '');
        setResolvePromise(() => resolve);
        // Auto-close timer
        if (opts.timer && opts.showConfirmButton === false) {
          setTimeout(() => {
            setIsOpen(false);
            resolve({
              isConfirmed: false,
              isDismissed: true
            });
          }, opts.timer);
        }
      });
    };
    return () => {
      showAlertFn = null;
      setValidationMsgFn = null;
    };
  }, []);
  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // ⭐ Quando há um input, o "value" resolvido é o conteúdo digitado.
    const hasInput = !!options.input;
    const currentInputValue = hasInput ? inputValue : true;
    // ⭐ preConfirm support
    if (options.preConfirm) {
      const result = options.preConfirm(hasInput ? inputValue : undefined);
      if (result === false) return; // Validation failed, don't close
      setIsOpen(false);
      setValidationMessage('');
      resolvePromise?.({
        isConfirmed: true,
        isDismissed: false,
        value: result
      });
    } else {
      setIsOpen(false);
      setValidationMessage('');
      resolvePromise?.({
        isConfirmed: true,
        isDismissed: false,
        value: currentInputValue
      });
    }
  };
  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    setValidationMessage('');
    resolvePromise?.({
      isConfirmed: false,
      isDismissed: true
    });
  };
  const handleOverlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Só fecha se clicar no overlay, não no modal
    if (e.target === e.currentTarget) {
      setIsOpen(false);
      resolvePromise?.({
        isConfirmed: false,
        isDismissed: true
      });
    }
  };
  const getIcon = () => {
    const iconClass = 'w-16 h-16 mx-auto mb-4';
    switch (options.icon) {
      case 'success':
        return <CheckCircleIcon className={`${iconClass} text-green-500`} />;
      case 'error':
        return <XCircleIcon className={`${iconClass} text-red-500`} />;
      case 'warning':
        return <AlertTriangleIcon className={`${iconClass} text-amber-500`} />;
      case 'info':
        return <InfoIcon className={`${iconClass} text-blue-500`} />;
      case 'question':
        return <HelpCircleIcon className={`${iconClass} text-teal-500`} />;
      default:
        return null;
    }
  };
  const getIconBgColor = () => {
    switch (options.icon) {
      case 'success':
        return 'bg-green-50';
      case 'error':
        return 'bg-red-50';
      case 'warning':
        return 'bg-amber-50';
      case 'info':
        return 'bg-blue-50';
      case 'question':
        return 'bg-teal-50';
      default:
        return 'bg-gray-50';
    }
  };
  const alertContent = isOpen ?
  createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={handleOverlayClick}
      onMouseDown={(e) => e.stopPropagation()}>
      
          {/* Modal */}
          <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}>
        
            {/* Icon area */}
            <div className={`pt-8 pb-4 ${getIconBgColor()}`}>{getIcon()}</div>

            {/* Content */}
            <div className="px-6 pb-6 pt-2 text-center">
              {options.title &&
          <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {options.title}
                </h2>
          }

              {options.text &&
          <p className="text-gray-600 mb-4">{options.text}</p>
          }

              {options.html &&
          <div className="text-gray-600 mb-4">
                  {typeof options.html === 'string' ?
            <div
              dangerouslySetInnerHTML={{
                __html: options.html
              }} /> :


            options.html
            }
                </div>
          }

              {/* ⭐ Input field */}
              {options.input &&
          <div className="mb-4 text-left">
                  {options.inputLabel &&
            <label className="block text-sm font-medium text-gray-700 mb-1">
                      {options.inputLabel}
                    </label>
            }
                  {options.input === 'textarea' ?
            <textarea
              autoFocus
              value={inputValue}
              placeholder={options.inputPlaceholder}
              onChange={(e) => setInputValue(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" /> :


            <input
              autoFocus
              type={options.input}
              value={inputValue}
              placeholder={options.inputPlaceholder}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && options.input !== 'textarea') {
                  e.preventDefault();
                  handleConfirm(e as any);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />

            }
                </div>
          }

              {/* Validation message */}
              {validationMessage &&
          <div className="text-red-600 text-sm font-medium mb-2 bg-red-50 px-3 py-2 rounded-lg">
                  {validationMessage}
                </div>
          }

              {/* Buttons */}
              {options.showConfirmButton !== false &&
          <div className="flex gap-3 justify-center mt-6">
                  {options.showCancelButton &&
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 rounded-lg font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: options.cancelButtonColor || '#6b7280',
                color: 'white'
              }}>
              
                      {options.cancelButtonText || 'Cancelar'}
                    </button>
            }
                  <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-2.5 rounded-lg font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: options.confirmButtonColor || '#0d9488',
                color: 'white'
              }}>
              
                    {options.confirmButtonText || 'OK'}
                  </button>
                </div>
          }
            </div>
          </div>
        </div>,
    document.body
  ) :
  null;
  return (
    <>
      {children}
      {alertContent}
    </>);

}
// Swal-like API
export const Swal = {
  fire: (options: SweetAlertOptions): Promise<SweetAlertResult> => {
    if (showAlertFn) {
      return showAlertFn(options);
    }
    console.warn('SweetAlertProvider not mounted');
    return Promise.resolve({
      isConfirmed: false,
      isDismissed: true
    });
  },
  showValidationMessage: (msg: string) => {
    if (setValidationMsgFn) setValidationMsgFn(msg);
  }
};