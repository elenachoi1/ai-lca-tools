import { createJSONStorage } from 'zustand/middleware'

/** Creates a synchronous string storage compatible with Zustand middleware. */
export function createMemoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed))

  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  }
}

export function createMemoryJSONStorage(seed) {
  const storage = createMemoryStorage(seed)
  return {
    storage,
    jsonStorage: createJSONStorage(() => storage)
  }
}

export function createBrowserJSONStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return undefined
  return createJSONStorage(() => window.localStorage)
}
