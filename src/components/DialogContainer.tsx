import React from 'react';
import { Dialog, DialogProps } from './ui/Dialog';
interface DialogContainerProps {
  dialogs: Omit<DialogProps, 'onClose'>[];
  onClose: (id: string) => void;
}
export function DialogContainer({
  dialogs,
  onClose
}: DialogContainerProps) {
  return <>
      {dialogs.map((dialog) => <Dialog key={dialog.id} {...dialog} onClose={onClose} />)}
    </>;
}