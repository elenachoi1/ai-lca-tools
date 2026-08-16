import { Download, History, Menu, Plus, Printer, Settings, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

interface ActionMenuProps {
  actions: {
    newConversation(): void
    history(): void
    markdown(): void
    print(): void
    settings(): void
    clear(): void
  }
}

export function ActionMenu({ actions }: ActionMenuProps) {
  const rows = [
    [Plus, 'New conversation', actions.newConversation],
    [History, 'Conversation history', actions.history],
    [Download, 'Export Markdown', actions.markdown],
    [Printer, 'Print / save PDF', actions.print],
    [Settings, 'Settings', actions.settings]
  ] as const

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="icon" aria-label="Open menu" title="Open menu">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="app-action-menu">
        {rows.map(([Icon, label, action]) => (
          <DropdownMenuItem key={label} onSelect={action}><Icon />{label}</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={actions.clear}><Trash2 />Clear conversation</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
