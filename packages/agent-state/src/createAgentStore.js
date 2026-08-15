import { persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

const identity = value => value

function copyInitialState(initialState) {
  if (typeof structuredClone === 'function') return structuredClone(initialState)
  return JSON.parse(JSON.stringify(initialState))
}

function assertPlainState(initialState) {
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
    throw new TypeError('initialState must be a non-null object')
  }
}

function createStateCreator(initialState, createActions) {
  return (set, get) => {
    const actionApi = {
      get: () => get().data,
      getRevision: () => get().meta.revision,
      set: (update, replace = false) => {
        set(current => {
          const nextValue = typeof update === 'function'
            ? update(current.data)
            : update

          if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
            throw new TypeError('A state update must return an object')
          }

          return {
            data: replace ? nextValue : { ...current.data, ...nextValue },
            meta: { revision: current.meta.revision + 1 }
          }
        })
      }
    }

    return {
      data: copyInitialState(initialState),
      meta: { revision: 0 },
      actions: createActions ? createActions(actionApi) : {}
    }
  }
}

function withPersistence(stateCreator, persistence) {
  if (!persistence.storage) {
    throw new TypeError('persistence.storage is required when persistence is enabled')
  }
  if (typeof persistence.select !== 'function') {
    throw new TypeError('persistence.select is required to prevent accidental state or secret persistence')
  }

  const mergeData = persistence.merge || ((persisted, current) => ({
    ...current,
    ...persisted
  }))

  return persist(stateCreator, {
    name: persistence.name || 'agent-state',
    storage: persistence.storage,
    version: persistence.version ?? 1,
    migrate: persistence.migrate,
    partialize: state => ({ data: persistence.select(state.data) }),
    merge: (persistedState, currentState) => ({
      ...currentState,
      data: mergeData(persistedState?.data || {}, currentState.data)
    })
  })
}

/**
 * Creates a vanilla Zustand store whose application data and named actions can
 * be shared by UI panels, services, and an agent command bridge.
 */
export function createAgentStore({
  initialState,
  actions,
  persistence
}) {
  assertPlainState(initialState)
  const stateCreator = createStateCreator(initialState, actions)
  return createStore(persistence
    ? withPersistence(stateCreator, persistence)
    : stateCreator)
}

export function selectData(state) {
  return state.data
}

export function selectActions(state) {
  return state.actions
}

export function selectRevision(state) {
  return state.meta.revision
}

export { identity }
