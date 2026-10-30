import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}
export function PasswordInput({
  label,
  error,
  className = '',
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  return <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>}
      <div className="relative">
        <input type={showPassword ? 'text' : 'password'} className={`w-full px-3 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${error ? 'border-red-500' : 'border-gray-300'} ${className}`} {...props} />
        
        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors" tabIndex={-1} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
          
          {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>;
}