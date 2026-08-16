import assert from 'node:assert/strict'
import test from 'node:test'

import React, { act } from 'react'
import { Window } from 'happy-dom'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'

import { AiChatPanel, useAiChat } from '../dist/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const browserWindow = new Window({ url: 'http://localhost/' })
globalThis.window = browserWindow
globalThis.document = browserWindow.document
globalThis.localStorage = browserWindow.localStorage

const tools = [{
  type: 'function',
  function: {
    name: 'change_view',
    description: 'Change the current view.',
    parameters: { type: 'object', properties: {} }
  }
}]

test('the chat panel renders without an application shell', () => {
  const runtime = {
    commandBus: {
      getToolDefinitions: () => tools,
      confirm: async () => ({ status: 'completed', command: 'change_view' }),
      reject: () => ({ status: 'rejected', command: 'change_view' })
    },
    getToolHandlers: () => ({}),
    getModelContext: () => ({ activePaneId: 'graph' })
  }
  const transport = { stream: async () => ({ content: '', calls: [] }) }

  const markup = renderToStaticMarkup(React.createElement(AiChatPanel, {
    runtime,
    transport,
    models: [['test/model', 'Test model']],
    storageNamespace: 'server-test',
    suggestions: ['Inspect the graph']
  }))

  assert.match(markup, /ai-chat-panel/)
  assert.match(markup, /Test model/)
  assert.match(markup, /Inspect the graph/)
})

test('a risky tool pauses for host confirmation and then resumes', async () => {
  let latest
  let streamCount = 0
  let confirmed = false
  const transport = {
    stream: async ({ onDelta }) => {
      streamCount += 1
      if (streamCount === 1) {
        onDelta({ content: 'I need approval.' })
        return {
          content: 'I need approval.',
          calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'change_view', arguments: '{"view":"results"}' }
          }]
        }
      }
      return { content: 'The view changed.', calls: [] }
    }
  }
  const proposal = {
    status: 'confirmation_required',
    command: 'change_view',
    confirmation: { id: 'confirmation-1', summary: 'Open results?' }
  }
  const handlers = { change_view: async () => proposal }
  const confirmations = {
    confirm: async id => {
      assert.equal(id, 'confirmation-1')
      confirmed = true
      return { status: 'completed', command: 'change_view', result: { activeView: 'results' } }
    },
    reject: () => ({ status: 'rejected', command: 'change_view' })
  }

  function Harness() {
    latest = useAiChat({
      model: 'test/model',
      transport,
      getSystemPrompt: () => 'Test prompt',
      tools,
      handlers,
      confirmations
    })
    return null
  }

  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  await act(async () => { await latest.send('Open results') })

  assert.equal(latest.status, 'awaiting_confirmation')
  assert.equal(latest.pendingConfirmation.summary, 'Open results?')
  assert.equal(confirmed, false)

  await act(async () => { await latest.confirm() })

  assert.equal(confirmed, true)
  assert.equal(latest.status, 'idle')
  assert.equal(latest.pendingConfirmation, null)
  assert.equal(latest.messages.at(-1).content, 'The view changed.')
  await act(async () => { root.unmount() })
})
