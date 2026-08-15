import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentStore, createCommandBus } from '../src/index.js'

function createFixture() {
  const store = createAgentStore({
    initialState: {
      activePanel: 'home',
      records: { a: { id: 'a', name: 'Alpha' } }
    },
    actions: ({ get, set }) => ({
      openPanel: activePanel => {
        if (!['home', 'graph', 'results'].includes(activePanel)) {
          throw new Error(`Unknown panel: ${activePanel}`)
        }
        set({ activePanel })
      },
      deleteRecord: id => {
        const { [id]: removed, ...records } = get().records
        if (!removed) throw new Error(`Unknown record: ${id}`)
        set({ records })
      }
    })
  })

  const commands = {
    get_context: {
      description: 'Get the current public context.',
      risk: 'query',
      execute: (_args, context) => context.state
    },
    open_panel: {
      description: 'Open a panel.',
      parameters: {
        type: 'object',
        properties: { panel: { type: 'string' } },
        required: ['panel'],
        additionalProperties: false
      },
      risk: 'ui',
      validate: args => {
        if (typeof args.panel !== 'string') throw new Error('panel is required')
        return { panel: args.panel.toLowerCase() }
      },
      execute: ({ panel }, context) => {
        context.actions.openPanel(panel)
        return { activePanel: context.getState().activePanel }
      }
    },
    delete_record: {
      description: 'Delete a record.',
      risk: 'destructive',
      validate: args => {
        if (typeof args.id !== 'string') throw new Error('id is required')
        return args
      },
      summary: args => `Delete record ${args.id}?`,
      execute: ({ id }, context) => {
        context.actions.deleteRecord(id)
        return { deleted: id }
      }
    }
  }

  const bus = createCommandBus({
    store,
    commands,
    contextSelector: state => ({ activePanel: state.activePanel })
  })

  return { store, bus }
}

test('a validated command invokes the same named action used by the UI', async () => {
  const { store, bus } = createFixture()

  const result = await bus.execute('open_panel', { panel: 'GRAPH' })

  assert.equal(result.status, 'completed')
  assert.equal(result.result.activePanel, 'graph')
  assert.equal(store.getState().data.activePanel, 'graph')
})

test('invalid arguments do not mutate state', async () => {
  const { store, bus } = createFixture()

  const result = await bus.execute('open_panel', {})

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'INVALID_ARGUMENTS')
  assert.equal(store.getState().data.activePanel, 'home')
})

test('unknown commands return structured errors', async () => {
  const { bus } = createFixture()

  const result = await bus.execute('missing_command')

  assert.deepEqual(result.error, {
    code: 'UNKNOWN_COMMAND',
    message: 'Unknown command: missing_command'
  })
})

test('every configured command must define an executor', () => {
  const { store } = createFixture()

  assert.throws(() => createCommandBus({
    store,
    commands: { invalid: { description: 'Missing executor' } }
  }), /must define an execute function/)
})

test('risky commands require confirmation before mutation', async () => {
  const { store, bus } = createFixture()

  const proposed = await bus.execute('delete_record', { id: 'a' })

  assert.equal(proposed.status, 'confirmation_required')
  assert.equal(proposed.confirmation.summary, 'Delete record a?')
  assert.ok(store.getState().data.records.a)

  const confirmed = await bus.confirm(proposed.confirmation.id)

  assert.equal(confirmed.status, 'completed')
  assert.equal(store.getState().data.records.a, undefined)
})

test('execution options cannot bypass confirmation', async () => {
  const { store, bus } = createFixture()

  const result = await bus.execute('delete_record', { id: 'a' }, { confirmed: true })

  assert.equal(result.status, 'confirmation_required')
  assert.ok(store.getState().data.records.a)
})

test('a confirmation becomes stale after application state changes', async () => {
  const { store, bus } = createFixture()
  const proposed = await bus.execute('delete_record', { id: 'a' })

  store.getState().actions.openPanel('results')
  const result = await bus.confirm(proposed.confirmation.id)

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'STALE_CONFIRMATION')
  assert.ok(store.getState().data.records.a)
})

test('pending commands can be rejected', async () => {
  const { store, bus } = createFixture()
  const proposed = await bus.execute('delete_record', { id: 'a' })

  const result = bus.reject(proposed.confirmation.id)

  assert.equal(result.status, 'rejected')
  assert.ok(store.getState().data.records.a)
  assert.equal(Object.keys(bus.getRuntimeState().pending).length, 0)
})

test('tool definitions and public context are derived from configuration', () => {
  const { bus } = createFixture()

  assert.deepEqual(bus.getContext(), { activePanel: 'home' })
  assert.deepEqual(
    bus.getToolDefinitions().map(tool => tool.function.name),
    ['get_context', 'open_panel', 'delete_record']
  )
})
