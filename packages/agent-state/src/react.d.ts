import type { StoreApi } from 'zustand/vanilla'

export function createStoreHook<TState>(store: StoreApi<TState>): <TSelection = TState>(
  selector?: (state: TState) => TSelection
) => TSelection

export function createCommandRuntimeHook(commandBus: { runtimeStore: StoreApi<unknown> }): <TSelection = unknown>(
  selector?: (state: unknown) => TSelection
) => TSelection
