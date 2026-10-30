import React from 'react';
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
}
export function Card({
  children,
  className = '',
  title,
  action,
  noPadding = false,
  style,
  ...rest
}: CardProps) {
  // Se um background customizado foi passado via style, não aplica bg-white
  const hasCustomBg = style && ('background' in style || 'backgroundColor' in style);
  return <div className={`${hasCustomBg ? '' : 'bg-white'} rounded-lg shadow-sm border border-gray-200 ${className}`} style={style} {...rest}>
      
      {(title || action) && <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {action}
        </div>}
      {noPadding ? children : <div className="p-6">{children}</div>}
    </div>;
}