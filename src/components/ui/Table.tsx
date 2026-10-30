import React from 'react';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { Button } from './Button';
interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
}
interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  onRowDoubleClick?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
}
export function Table<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  onRowDoubleClick,
  onEdit,
  onDelete
}: TableProps<T>) {
  if (data.length === 0) {
    return <div className="text-center py-12 text-gray-500">
        Nenhum registro encontrado
      </div>;
  }
  const hasActions = onEdit || onDelete;
  return <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map((column) => <th key={column.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              
                {column.label}
              </th>)}
            {hasActions && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item, index) => <tr key={index} onClick={() => onRowClick?.(item)} onDoubleClick={() => onRowDoubleClick?.(item)} className={onRowClick || onRowDoubleClick ? 'cursor-pointer hover:bg-gray-50 transition-colors' : 'hover:bg-gray-50 transition-colors'}>
            
              {columns.map((column) => <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              
                  {column.render ? column.render(item) : item[column.key]}
                </td>)}
              {hasActions && <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {onEdit && typeof onEdit === 'function' && <Button variant="ghost" size="sm" onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }} title="Editar">
                  
                        <PencilIcon className="w-4 h-4" />
                      </Button>}
                    {onDelete && typeof onDelete === 'function' && <Button variant="ghost" size="sm" onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }} title="Excluir">
                  
                        <TrashIcon className="w-4 h-4 text-red-600" />
                      </Button>}
                  </div>
                </td>}
            </tr>)}
        </tbody>
      </table>
    </div>;
}