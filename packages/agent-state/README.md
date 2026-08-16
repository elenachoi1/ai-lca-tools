# Agent State

`@ai-lca-tools/agent-state` is a small, reusable bridge between application state, UI panels, and LLM tool calls. It uses a vanilla Zustand store so the same state can be consumed by React, other UI frameworks, services, and tool handlers.

The package is intentionally domain-neutral. Product graphs, application panes, dashboards, editors, and other applications provide their own state, named actions, validation, and tool definitions.

## Architecture

```text
Human UI action ─┐
                 ├─> named application action ─> Zustand ─> subscribed panels
LLM command ─────┘
       ↑
validation, permissions, confirmation, and audit history
```

An LLM never receives Zustand's raw `setState`. Command handlers receive only the current application data, named actions, revision information, and read-only getters.

## Create a store

```ts
import { createAgentStore } from '@ai-lca-tools/agent-state'

export const appStore = createAgentStore({
  initialState: {
    activePanel: 'graph',
    selectedId: null,
    records: {}
  },

  actions: ({ get, set }) => ({
    openPanel: activePanel => set({ activePanel }),

    selectRecord: selectedId => {
      if (selectedId !== null && !get().records[selectedId]) {
        throw new Error(`Unknown record: ${selectedId}`)
      }
      set({ selectedId })
    }
  })
})
```

Application code and human controls invoke named actions:

```js
appStore.getState().actions.openPanel('results')
```

Every successful data update increments `state.meta.revision`. The command confirmation flow uses this revision to reject proposals made against stale application state.

## Connect React panels

React support is a separate export, so non-React consumers do not load React dependencies.

```tsx
import { createStoreHook } from '@ai-lca-tools/agent-state/react'
import { appStore } from './appStore'

const useAppStore = createStoreHook(appStore)

function ResultsPanel() {
  const activePanel = useAppStore(state => state.data.activePanel)
  const openPanel = useAppStore(state => state.actions.openPanel)

  return (
    <button onClick={() => openPanel('results')}>
      Current panel: {activePanel}
    </button>
  )
}
```

Use narrow selectors so streaming messages or other frequent state changes do not rerender unrelated panels.

## Register application panes

`createPaneRuntime` is an optional layer for applications composed from tabs,
panels, pages, or other switchable panes. The application registers all panes
at startup. Only panes with an explicit `llm` object are visible to the model.

```ts
import { createPaneRuntime } from '@ai-lca-tools/agent-state'

const runtime = createPaneRuntime({
  initialActivePaneId: 'results',
  panes: [
    {
      id: 'results',
      title: 'Results',
      description: 'Calculated result filters.',
      initialState: { category: 'climate' },

      actions: ({ set }) => ({
        setCategory: category => set({ category })
      }),

      llm: {
        // This is the only state from this pane that enters model context.
        selectState: state => ({ category: state.category }),
        commands: {
          set_result_category: {
            description: 'Set the visible result category.',
            parameters: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: ['climate', 'water'] }
              },
              required: ['category'],
              additionalProperties: false
            },
            risk: 'ui',
            validate: args => args,
            execute: ({ category }, context) => {
              context.actions.setCategory(category)
              return { category: context.getState().category }
            }
          }
        }
      }
    },
    {
      id: 'private-notes',
      title: 'Private notes',
      initialState: { text: '' }
      // No `llm` contract: the model cannot list, read, switch to, or edit it.
    }
  ]
})
```

The runtime supplies three core tools according to the registered contracts:

- `list_panes` lists only LLM-enabled panes.
- `switch_pane` switches only to an LLM-enabled pane.
- `get_pane_state` reads only panes with an explicit `selectState`.

Pane-specific commands are merged with those tools and checked for name
collisions at startup:

```js
const tools = runtime.commandBus.getToolDefinitions()
const handlers = runtime.getToolHandlers()
const safePromptContext = runtime.getModelContext()
```

UI controls use the same named actions through `runtime.store`. React hosts can
bind it with `createStoreHook` from `@ai-lca-tools/agent-state/react`.

### Register panes over a host-owned store

Applications that already own their state pass their `createAgentStore` store
to the runtime. Each pane explicitly selects its internal state and the named
actions its command handlers may invoke. The runtime never receives or exposes
raw `setState`:

```ts
const runtime = createPaneRuntime({
  store: productGraphStore,
  selectActivePaneId: state => state.activeView,
  switchPane: (paneId, context) => {
    // This can preserve unsaved-work and availability guards.
    context.actions.requestViewChange(paneId)
  },
  panes: [{
    id: 'graph',
    title: 'Graph',
    selectState: state => ({
      selectedNodeId: state.selectedNodeId,
      graphMode: state.graphMode
    }),
    selectActions: actions => ({
      selectNode: actions.selectNode,
      setGraphMode: actions.setGraphMode
    }),
    llm: {
      available: () => true,
      selectState: state => state,
      commands: {
        select_graph_node: {
          risk: 'ui',
          validate: args => args,
          execute: ({ nodeId }, context) => {
            context.actions.selectNode(nodeId)
            return context.getState()
          }
        }
      }
    }
  }]
})
```

`llm.available` controls whether a registered pane can currently be read,
switched to, or acted upon. This lets result views remain registered while
unavailable until a current calculation exists. Persistence stays owned by the
host store in this mode.

## Create an LLM command bus

```ts
import { createCommandBus } from '@ai-lca-tools/agent-state'
import { appStore } from './appStore'

export const commandBus = createCommandBus({
  store: appStore,

  contextSelector: state => ({
    activePanel: state.activePanel,
    selectedId: state.selectedId
  }),

  commands: {
    open_panel: {
      description: 'Open one application panel.',
      parameters: {
        type: 'object',
        properties: {
          panel: { type: 'string', enum: ['graph', 'results'] }
        },
        required: ['panel'],
        additionalProperties: false
      },
      risk: 'ui',
      validate: args => {
        if (!['graph', 'results'].includes(args.panel)) {
          throw new Error('Unknown panel')
        }
        return args
      },
      execute: ({ panel }, context) => {
        context.actions.openPanel(panel)
        return { activePanel: context.getState().activePanel }
      }
    }
  }
})
```

Send `commandBus.getToolDefinitions()` to a model that accepts OpenAI-compatible function definitions. Execute a returned function call with:

```ts
const result = await commandBus.execute(toolName, parsedArguments)
```

The result is structured as `completed`, `confirmation_required`, or `error`.

## Risk and confirmation

Commands with a risk of `mutation`, `external`, or `destructive` require confirmation by default:

```ts
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
```

```ts
const proposal = await commandBus.execute('delete_record', { id: '42' })

// Present proposal.confirmation.summary in host-controlled UI.
const result = await commandBus.confirm(proposal.confirmation.id)
```

Confirmations are rejected if application state changed after the proposal. A command may explicitly set `allowStateChangesBeforeConfirmation: true` when revalidation inside its action is sufficient.

The host can reject a pending command with `commandBus.reject(id)`. Pending confirmations and bounded audit history are available through `commandBus.getRuntimeState()` or the React `createCommandRuntimeHook` helper.

## Selective persistence

Persistence requires an explicit selector. This prevents the default behavior from accidentally writing messages, credentials, errors, or other transient state.

```ts
import {
  createAgentStore,
  createBrowserJSONStorage
} from '@ai-lca-tools/agent-state'

const storage = createBrowserJSONStorage()

const store = createAgentStore({
  initialState,
  actions,
  persistence: storage && {
    name: 'my-app-preferences',
    version: 1,
    storage,
    select: state => ({
      theme: state.theme,
      panelSizes: state.panelSizes
    })
  }
})
```

For tests and server-side use, `createMemoryStorage` and `createMemoryJSONStorage` are included.

## Command definition reference

Each command may define:

- `description`: model-facing explanation
- `parameters`: OpenAI-compatible JSON Schema
- `validate(args)`: validates and optionally normalizes arguments
- `enabled(args, context)`: prevents execution when the command is unavailable
- `risk`: application-defined risk label
- `confirm`: explicitly requires confirmation
- `summary(args, context)`: user-facing confirmation text
- `allowStateChangesBeforeConfirmation`: disables the default revision check
- `execute(args, context)`: invokes named actions or performs a query

The execution context contains:

- `state`: state at the start of execution
- `actions`: named application actions
- `revision`: current application revision
- `getState()`: latest application data
- `getRevision()`: latest revision
- `source`: command source, defaulting to `llm`

It deliberately does not contain `setState`.

## Development

```bash
npm install
npm test
npm run check
```

The package implementation remains plain ESM JavaScript for broad runtime
compatibility. Bundled declaration files provide TypeScript consumers with the
public store, command bus, pane runtime, persistence, and React binding types.
