import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAgentStore,
  createMemoryJSONStorage,
  selectRevision
} from '../src/index.js'

function createCounterStore(options = {}) {
  return createAgentStore({
    initialState: {
      count: 0,
      activePanel: 'home',
      apiKey: 'secret'
    },
    actions: ({ get, set }) => ({
      increment: () => set({ count: get().count + 1 }),
      openPanel: activePanel => set({ activePanel }),
      replace: data => set(data, true)
    }),
    ...options
  })
}

test('named actions update shared state and increment the revision', () => {
  const store = createCounterStore()

  store.getState().actions.increment()
  store.getState().actions.openPanel('results')

  assert.equal(store.getState().data.count, 1)
  assert.equal(store.getState().data.activePanel, 'results')
  assert.equal(selectRevision(store.getState()), 2)
})

test('stores do not share mutable initial state', () => {
  const first = createCounterStore()
  const second = createCounterStore()

  first.getState().actions.increment()

  assert.equal(first.getState().data.count, 1)
  assert.equal(second.getState().data.count, 0)
})

test('invalid state updates are rejected', () => {
  const store = createAgentStore({
    initialState: { ready: false },
    actions: ({ set }) => ({ breakState: () => set(null) })
  })

  assert.throws(() => store.getState().actions.breakState(), /must return an object/)
  assert.equal(store.getState().data.ready, false)
})

test('persistence requires an explicit selector', () => {
  const { jsonStorage } = createMemoryJSONStorage()

  assert.throws(() => createCounterStore({
    persistence: { storage: jsonStorage }
  }), /persistence.select is required/)
})

test('persistence stores only explicitly selected data', () => {
  const { storage, jsonStorage } = createMemoryJSONStorage()
  const store = createCounterStore({
    persistence: {
      name: 'preferences',
      storage: jsonStorage,
      select: state => ({ activePanel: state.activePanel })
    }
  })

  store.getState().actions.openPanel('graph')
  const persisted = JSON.parse(storage.getItem('preferences'))

  assert.deepEqual(persisted.state.data, { activePanel: 'graph' })
  assert.equal(JSON.stringify(persisted).includes('secret'), false)
})
