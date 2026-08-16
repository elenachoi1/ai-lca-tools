import test from 'node:test'
import assert from 'node:assert/strict'

import { createAgentStore, createPaneRuntime } from '../src/index.js'

function createFixture() {
  return createPaneRuntime({
    initialActivePaneId: 'appearance',
    panes: [
      {
        id: 'appearance',
        title: 'Appearance',
        description: 'Visual choices.',
        initialState: { color: 'red', internalToken: 'do-not-share' },
        actions: ({ get, set }) => ({
          setColor: color => set({ color }),
          reset: () => set({ ...get(), color: 'red' }, true)
        }),
        llm: {
          selectState: state => ({ color: state.color }),
          commands: {
            set_appearance_color: {
              description: 'Set the appearance color.',
              parameters: {
                type: 'object',
                properties: { color: { type: 'string', enum: ['red', 'blue'] } },
                required: ['color'],
                additionalProperties: false
              },
              risk: 'ui',
              validate: args => {
                if (!['red', 'blue'].includes(args.color)) throw new Error('Invalid color')
                return args
              },
              execute: ({ color }, context) => {
                context.actions.setColor(color)
                return { color: context.getState().color }
              }
            }
          }
        }
      },
      {
        id: 'notes',
        title: 'Notes',
        initialState: { text: 'Visible note' },
        actions: ({ set }) => ({ setText: text => set({ text }) }),
        llm: {
          description: 'Notes the model may open, but not read automatically.'
        }
      },
      {
        id: 'private',
        title: 'Private pane',
        initialState: { secret: 'hidden' }
      }
    ]
  })
}

test('registered pane actions update Zustand state and revisions', () => {
  const runtime = createFixture()

  runtime.store.getState().actions.panes.appearance.setColor('blue')

  assert.equal(runtime.store.getState().data.panes.appearance.color, 'blue')
  assert.equal(runtime.store.getState().meta.revision, 1)
})

test('only explicit LLM contracts are listed and exposed', async () => {
  const runtime = createFixture()
  const result = await runtime.commandBus.execute('list_panes')

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.result.panes.map(pane => pane.id), ['appearance', 'notes'])
  assert.deepEqual(result.result.panes[0].state, { color: 'red' })
  assert.equal('internalToken' in result.result.panes[0].state, false)
  assert.equal(runtime.commandBus.getContext().panes.some(pane => pane.id === 'private'), false)
})

test('the LLM can switch only to panes with an LLM contract', async () => {
  const runtime = createFixture()

  const switched = await runtime.commandBus.execute('switch_pane', { paneId: 'notes' })
  const rejected = await runtime.commandBus.execute('switch_pane', { paneId: 'private' })

  assert.equal(switched.status, 'completed')
  assert.equal(runtime.store.getState().data.activePaneId, 'notes')
  assert.equal(rejected.status, 'error')
  assert.equal(rejected.error.code, 'INVALID_ARGUMENTS')
})

test('read tools return only the pane-selected state', async () => {
  const runtime = createFixture()

  const result = await runtime.commandBus.execute('get_pane_state', { paneId: 'appearance' })
  const unreadable = await runtime.commandBus.execute('get_pane_state', { paneId: 'notes' })

  assert.deepEqual(result.result.state, { color: 'red' })
  assert.equal(unreadable.status, 'error')
  assert.equal(unreadable.error.code, 'INVALID_ARGUMENTS')
})

test('pane commands receive only that pane state and named actions', async () => {
  const runtime = createFixture()
  const handlers = runtime.getToolHandlers()

  const result = await handlers.set_appearance_color({ color: 'blue' })

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.result, { color: 'blue' })
  assert.equal(runtime.store.getState().data.panes.appearance.color, 'blue')
})

test('duplicate pane command names fail during startup registration', () => {
  assert.throws(() => createPaneRuntime({
    panes: [
      {
        id: 'one',
        initialState: {},
        llm: { commands: { list_panes: { execute: () => ({}) } } }
      }
    ]
  }), /Duplicate LLM command name/)
})

function createHostFixture() {
  const store = createAgentStore({
    initialState: {
      activeView: 'graph',
      selectedNodeId: null,
      resultsAvailable: false,
      secret: 'not exposed'
    },
    actions: ({ get, set }) => ({
      requestViewChange: view => {
        if (view === 'results' && !get().resultsAvailable) {
          throw new Error('Results are unavailable')
        }
        set({ activeView: view })
      },
      selectNode: selectedNodeId => set({ selectedNodeId }),
      makeResultsAvailable: () => set({ resultsAvailable: true }),
      unsafeReplaceState: value => set(value, true)
    })
  })

  const runtime = createPaneRuntime({
    store,
    selectActivePaneId: state => state.activeView,
    switchPane: (paneId, context) => context.actions.requestViewChange(paneId),
    panes: [
      {
        id: 'graph',
        title: 'Graph',
        selectState: state => ({ selectedNodeId: state.selectedNodeId }),
        selectActions: actions => ({ selectNode: actions.selectNode }),
        llm: {
          selectState: state => state,
          commands: {
            select_graph_node: {
              validate: args => {
                if (typeof args.nodeId !== 'string') throw new Error('nodeId is required')
                return args
              },
              execute: ({ nodeId }, context) => {
                context.actions.selectNode(nodeId)
                return context.getState()
              }
            }
          }
        }
      },
      {
        id: 'results',
        title: 'Results',
        selectState: state => ({ resultsAvailable: state.resultsAvailable }),
        llm: {
          available: state => state.resultsAvailable,
          selectState: state => state
        }
      }
    ]
  })

  return { runtime, store }
}

test('a host-owned store supplies pane state and registered actions', async () => {
  const { runtime, store } = createHostFixture()

  const selected = await runtime.commandBus.execute('select_graph_node', { nodeId: 'process-7' })

  assert.equal(selected.status, 'completed')
  assert.equal(store.getState().data.selectedNodeId, 'process-7')
  assert.deepEqual(selected.result, { selectedNodeId: 'process-7' })
  assert.deepEqual(runtime.getPaneContext('graph').state, { selectedNodeId: 'process-7' })
  assert.equal('secret' in runtime.commandBus.getContext().panes[0].state, false)
})

test('host panes preserve availability and guarded switching', async () => {
  const { runtime, store } = createHostFixture()

  const unavailable = await runtime.commandBus.execute('switch_pane', { paneId: 'results' })
  assert.equal(unavailable.status, 'error')
  assert.equal(unavailable.error.code, 'INVALID_ARGUMENTS')
  assert.equal(runtime.commandBus.getContext().panes.find(pane => pane.id === 'results').available, false)

  store.getState().actions.makeResultsAvailable()
  const switched = await runtime.commandBus.execute('switch_pane', { paneId: 'results' })

  assert.equal(switched.status, 'completed')
  assert.equal(store.getState().data.activeView, 'results')
  assert.equal(runtime.commandBus.getContext().panes.find(pane => pane.id === 'results').available, true)
})

test('host pane switching waits for asynchronous navigation guards', async () => {
  const store = createAgentStore({
    initialState: { activeView: 'graph' },
    actions: ({ set }) => ({ openView: activeView => set({ activeView }) })
  })
  const runtime = createPaneRuntime({
    store,
    selectActivePaneId: state => state.activeView,
    switchPane: async (paneId, context) => {
      await Promise.resolve()
      context.actions.openView(paneId)
    },
    panes: [
      { id: 'graph', selectState: state => state, llm: {} },
      { id: 'editor', selectState: state => state, llm: {} }
    ]
  })

  const result = await runtime.commandBus.execute('switch_pane', { paneId: 'editor' })

  assert.equal(result.status, 'completed')
  assert.equal(store.getState().data.activeView, 'editor')
})

test('host panes require explicit state selectors and own persistence', () => {
  const store = createAgentStore({ initialState: { activeView: 'graph' } })

  assert.throws(() => createPaneRuntime({
    store,
    panes: [{ id: 'graph', llm: {} }]
  }), /selectState must be a function/)

  assert.throws(() => createPaneRuntime({
    store,
    persistence: {},
    panes: [{ id: 'graph', selectState: state => state }]
  }), /persistence is owned by the host store/)
})
