import type { PropsWithChildren } from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface ModalProps extends PropsWithChildren {
  title: string
  close(): void
}

export function Modal({ title, close, children }: ModalProps) {
  return (
    <Dialog open onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="app-dialog">
        <DialogHeader>
          <DialogTitle className="app-dialog-title">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
