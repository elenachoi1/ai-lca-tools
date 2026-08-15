import { useStore } from 'zustand'

const identity = value => value

/** Creates a React hook bound to a vanilla Zustand store. */
export function createStoreHook(store) {
  if (!store?.getState || !store?.subscribe) {
    throw new TypeError('A Zustand vanilla store is required')
  }

  return function useBoundAgentStore(selector = identity) {
    return useStore(store, selector)
  }
}

/** Creates a React hook for command confirmations and audit history. */
export function createCommandRuntimeHook(commandBus) {
  if (!commandBus?.runtimeStore) {
    throw new TypeError('A command bus is required')
  }

  return createStoreHook(commandBus.runtimeStore)
}
