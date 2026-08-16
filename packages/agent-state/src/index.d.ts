import type { StoreApi } from 'zustand/vanilla'

export type PlainState = Record<string, unknown>
export type NamedActions = Record<string, unknown>

export interface AgentActionApi<TData extends PlainState> {
  get(): TData
  getRevision(): number
  set(update: Partial<TData> | ((current: TData) => Partial<TData>), replace?: boolean): void
}

export interface AgentStoreState<TData extends PlainState, TActions extends NamedActions> {
  data: TData
  meta: { revision: number }
  actions: TActions
}

export interface PersistenceStorage {
  getItem(name: string): unknown | Promise<unknown>
  setItem(name: string, value: unknown): unknown | Promise<unknown>
  removeItem(name: string): unknown | Promise<unknown>
}

export interface PersistenceOptions<TData extends PlainState> {
  name?: string
  version?: number
  storage: PersistenceStorage
  select(data: TData): PlainState
  merge?(persisted: Partial<TData>, current: TData): TData
  migrate?(persisted: unknown, version: number): unknown
}

export function createAgentStore<
  TData extends PlainState,
  TActions extends NamedActions = NamedActions
>(options: {
  initialState: TData
  actions?: (api: AgentActionApi<TData>) => TActions
  persistence?: PersistenceOptions<TData>
}): StoreApi<AgentStoreState<TData, TActions>>

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: PlainState
  }
}

export interface CommandResult {
  status: 'completed' | 'confirmation_required' | 'rejected' | 'error'
  command: string
  result?: unknown
  confirmation?: { id: string; summary: string; baseRevision: number }
  error?: { code: string; message: string }
  reason?: string
}

export interface CommandBus {
  execute(name: string, args?: PlainState, options?: { source?: string }): Promise<CommandResult>
  confirm(id: string): Promise<CommandResult>
  reject(id: string, reason?: string): CommandResult
  getContext(): unknown
  getToolDefinitions(): ToolDefinition[]
  getRuntimeState(): { pending: PlainState; history: unknown[] }
  subscribe(listener: (state: unknown, previousState: unknown) => void): () => void
  runtimeStore: StoreApi<{ pending: PlainState; history: unknown[] }>
}

export interface PaneActionApi<TState extends PlainState> {
  get(): TState
  getAppState(): PaneApplicationState
  set(update: Partial<TState> | ((current: TState) => Partial<TState>), replace?: boolean): void
}

export interface PaneCommandContext<
  TState extends PlainState = PlainState,
  TActions extends NamedActions = NamedActions,
  TAppState extends PlainState = PaneApplicationState
> {
  source: string
  pane: { id: string; title: string; description: string }
  state: TState
  actions: TActions
  revision: number
  getState(): TState
  getAppState(): TAppState
  getRevision(): number
}

export interface PaneCommandDefinition<
  TState extends PlainState = PlainState,
  TActions extends NamedActions = NamedActions,
  TAppState extends PlainState = PaneApplicationState
> {
  description?: string
  parameters?: PlainState
  risk?: string
  confirm?: boolean
  validate?(args: PlainState): PlainState | boolean | void
  enabled?(args: PlainState, context: PaneCommandContext<TState, TActions, TAppState>): boolean
  summary?: string | ((args: PlainState, context: PaneCommandContext<TState, TActions, TAppState>) => string)
  allowStateChangesBeforeConfirmation?: boolean
  execute(args: PlainState, context: PaneCommandContext<TState, TActions, TAppState>): unknown | Promise<unknown>
}

export interface PaneDefinition<
  TState extends PlainState = PlainState,
  TActions extends NamedActions = NamedActions
> {
  id: string
  title?: string
  description?: string
  initialState: TState
  actions?(api: PaneActionApi<TState>): TActions
  llm?: {
    description?: string
    available?(state: TState, context: { appState: PaneApplicationState; pane: PublicPane }): boolean
    selectState?(state: TState, context: { appState: PaneApplicationState; pane: { id: string; title: string; description: string } }): unknown
    commands?: Record<string, PaneCommandDefinition<TState, TActions>>
  }
  [key: string]: unknown
}

export interface PublicPane {
  id: string
  title: string
  description: string
}

export interface HostPaneDefinition<
  TAppState extends PlainState = PlainState,
  TAppActions extends NamedActions = NamedActions,
  TState extends PlainState = PlainState,
  TActions extends NamedActions = NamedActions
> {
  id: string
  title?: string
  description?: string
  selectState(appState: TAppState, context: { pane: PublicPane }): TState
  selectActions?(appActions: TAppActions, context: { appState: TAppState; pane: PublicPane }): TActions
  llm?: {
    description?: string
    available?(state: TState, context: { appState: TAppState; pane: PublicPane }): boolean
    selectState?(state: TState, context: { appState: TAppState; pane: PublicPane }): unknown
    commands?: Record<string, PaneCommandDefinition<TState, TActions, TAppState>>
  }
  [key: string]: unknown
}

export interface PaneApplicationState extends PlainState {
  activePaneId: string
  panes: Record<string, PlainState>
}

export interface PaneRuntimeActions extends NamedActions {
  switchPane(paneId: string): void
  panes: Record<string, NamedActions>
}

export interface PaneRuntime<
  TPane extends { id: string } = PaneDefinition<any, any>,
  TAppState extends PlainState = PaneApplicationState,
  TAppActions extends NamedActions = PaneRuntimeActions
> {
  store: StoreApi<AgentStoreState<TAppState, TAppActions>>
  commandBus: CommandBus
  panes: TPane[]
  getPane(paneId: string): TPane | undefined
  getPaneContext(paneId: string, appState?: TAppState): unknown
  getModelContext(): unknown
  getToolHandlers(options?: { source?: string }): Record<string, (args?: PlainState) => Promise<CommandResult>>
}

export function createPaneRuntime<
  TPane extends PaneDefinition<any, any> = PaneDefinition<any, any>
>(options: {
  panes: TPane[]
  initialActivePaneId?: string
  persistence?: PersistenceOptions<PaneApplicationState>
  confirmationRisks?: Iterable<string>
  historyLimit?: number
}): PaneRuntime<TPane>

export function createPaneRuntime<
  TAppState extends PlainState,
  TAppActions extends NamedActions,
  TPane extends HostPaneDefinition<TAppState, TAppActions, any, any> = HostPaneDefinition<TAppState, TAppActions>
>(options: {
  store: StoreApi<AgentStoreState<TAppState, TAppActions>>
  panes: TPane[]
  selectActivePaneId?(state: TAppState): string
  switchPane?(paneId: string, context: {
    source: string
    state: TAppState
    actions: TAppActions
    revision: number
    getState(): TAppState
    getRevision(): number
  }): unknown | Promise<unknown>
  confirmationRisks?: Iterable<string>
  historyLimit?: number
}): PaneRuntime<TPane, TAppState, TAppActions>

export function createCommandBus(options: PlainState): CommandBus
export function selectData<TData>(state: { data: TData }): TData
export function selectActions<TActions>(state: { actions: TActions }): TActions
export function selectRevision(state: { meta: { revision: number } }): number
export function identity<T>(value: T): T

export function createBrowserJSONStorage(): PersistenceStorage | undefined
export function createMemoryStorage(seed?: Record<string, string>): {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  snapshot(): Record<string, string>
}
export function createMemoryJSONStorage(seed?: Record<string, string>): {
  storage: ReturnType<typeof createMemoryStorage>
  jsonStorage: PersistenceStorage
}
