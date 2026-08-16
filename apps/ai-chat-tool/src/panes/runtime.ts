import {
  createBrowserJSONStorage,
  createPaneRuntime,
  type PaneRuntime
} from '@ai-lca-tools/agent-state'
import { createStoreHook } from '@ai-lca-tools/agent-state/react'

import { storageKey } from '@/config'
import {
  paneDefinitions,
  type SelectionPaneActions,
  type SelectionPaneDefinition,
  type SelectionPaneState
} from '@/panes/registry'

type SelectionPaneRuntime = Omit<PaneRuntime, 'panes' | 'getPane'> & {
  panes: SelectionPaneDefinition[]
  getPane(paneId: string): SelectionPaneDefinition | undefined
}

const storage = createBrowserJSONStorage()
const paneIds = new Set(paneDefinitions.map(pane => pane.id))

export const paneRuntime = createPaneRuntime({
  panes: paneDefinitions,
  initialActivePaneId: paneDefinitions[0].id,
  persistence: storage && {
    name: storageKey('pane-state'),
    version: 1,
    storage,
    select: state => ({
      activePaneId: state.activePaneId,
      panes: state.panes
    }),
    merge: (persisted, current) => ({
      ...current,
      activePaneId: typeof persisted.activePaneId === 'string' && paneIds.has(persisted.activePaneId)
        ? persisted.activePaneId
        : current.activePaneId,
      panes: Object.fromEntries(paneDefinitions.map(pane => [
        pane.id,
        { ...current.panes[pane.id], ...(persisted.panes?.[pane.id] || {}) }
      ]))
    })
  }
}) as SelectionPaneRuntime

export const usePaneStore = createStoreHook(paneRuntime.store)
export const paneTools = paneRuntime.commandBus.getToolDefinitions()
export const paneToolHandlers = paneRuntime.getToolHandlers()

export function getSelectionPaneState(paneId: string) {
  return paneRuntime.store.getState().data.panes[paneId] as SelectionPaneState
}

export function getSelectionPaneActions(paneId: string) {
  return paneRuntime.store.getState().actions.panes[paneId] as SelectionPaneActions
}
