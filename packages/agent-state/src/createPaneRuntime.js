import { createAgentStore } from './createAgentStore.js'
import { createCommandBus } from './createCommandBus.js'

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-null object`)
  }
}

function normalizePanes(panes) {
  if (!Array.isArray(panes) || panes.length === 0) {
    throw new TypeError('panes must be a non-empty array')
  }

  const ids = new Set()
  return panes.map((pane, index) => {
    assertObject(pane, `panes[${index}]`)
    if (typeof pane.id !== 'string' || !pane.id.trim()) {
      throw new TypeError(`panes[${index}].id must be a non-empty string`)
    }
    if (ids.has(pane.id)) throw new TypeError(`Duplicate pane id: ${pane.id}`)
    ids.add(pane.id)
    assertObject(pane.initialState, `Pane ${pane.id} initialState`)
    if (pane.actions !== undefined && typeof pane.actions !== 'function') {
      throw new TypeError(`Pane ${pane.id} actions must be a function`)
    }
    if (pane.llm !== undefined) assertObject(pane.llm, `Pane ${pane.id} llm`)

    return {
      ...pane,
      title: pane.title || pane.id,
      description: pane.description || pane.llm?.description || ''
    }
  })
}

function publicPane(pane) {
  return {
    id: pane.id,
    title: pane.title,
    description: pane.llm?.description || pane.description
  }
}

function paneExecutionContext(pane, context) {
  return {
    ...context,
    pane: publicPane(pane),
    state: context.state.panes[pane.id],
    actions: context.actions.panes[pane.id],
    getState: () => context.getState().panes[pane.id],
    getAppState: context.getState
  }
}

/**
 * Creates a registered-pane application runtime. A pane is visible to the LLM
 * only when it explicitly supplies an `llm` contract.
 */
export function createPaneRuntime({
  panes,
  initialActivePaneId,
  persistence,
  confirmationRisks,
  historyLimit
}) {
  const definitions = normalizePanes(panes)
  const paneById = new Map(definitions.map(pane => [pane.id, pane]))
  const exposedPanes = definitions.filter(pane => pane.llm)
  const readablePanes = exposedPanes.filter(pane => typeof pane.llm.selectState === 'function')
  const activePaneId = initialActivePaneId || definitions[0].id

  if (!paneById.has(activePaneId)) {
    throw new TypeError(`Unknown initial active pane: ${activePaneId}`)
  }

  const store = createAgentStore({
    initialState: {
      activePaneId,
      panes: Object.fromEntries(definitions.map(pane => [pane.id, pane.initialState]))
    },
    persistence,
    actions: ({ get, set }) => {
      const paneActions = Object.fromEntries(definitions.map(pane => {
        const actionApi = {
          get: () => get().panes[pane.id],
          getAppState: get,
          set: (update, replace = false) => {
            set(appState => {
              const current = appState.panes[pane.id]
              const nextValue = typeof update === 'function' ? update(current) : update
              assertObject(nextValue, `Pane ${pane.id} state update`)
              return {
                panes: {
                  ...appState.panes,
                  [pane.id]: replace ? nextValue : { ...current, ...nextValue }
                }
              }
            })
          }
        }
        return [pane.id, pane.actions?.(actionApi) || {}]
      }))

      return {
        switchPane: paneId => {
          if (!paneById.has(paneId)) throw new Error(`Unknown pane: ${paneId}`)
          set({ activePaneId: paneId })
        },
        panes: paneActions
      }
    }
  })

  const selectPaneState = (pane, appState) => {
    if (typeof pane.llm?.selectState !== 'function') return undefined
    return pane.llm.selectState(appState.panes[pane.id], {
      appState,
      pane: publicPane(pane)
    })
  }

  const getPaneContext = (paneId, appState = store.getState().data) => {
    const pane = paneById.get(paneId)
    if (!pane?.llm) throw new Error(`Pane is not exposed to the LLM: ${paneId}`)
    if (typeof pane.llm.selectState !== 'function') {
      throw new Error(`Pane does not expose readable state: ${paneId}`)
    }
    return {
      ...publicPane(pane),
      state: selectPaneState(pane, appState)
    }
  }

  const getModelContext = appState => ({
    activePaneId: exposedPanes.some(pane => pane.id === appState.activePaneId)
      ? appState.activePaneId
      : null,
    panes: exposedPanes.map(pane => ({
      ...publicPane(pane),
      active: pane.id === appState.activePaneId,
      ...(typeof pane.llm.selectState === 'function'
        ? { state: selectPaneState(pane, appState) }
        : {})
    }))
  })

  const commands = {
    list_panes: {
      description: 'List the application panes that are registered for LLM access.',
      risk: 'read',
      execute: (_args, context) => getModelContext(context.getState())
    }
  }

  if (exposedPanes.length) {
    commands.switch_pane = {
      description: 'Switch the application to a registered pane.',
      parameters: {
        type: 'object',
        properties: {
          paneId: {
            type: 'string',
            enum: exposedPanes.map(pane => pane.id),
            description: 'The registered pane to make active.'
          }
        },
        required: ['paneId'],
        additionalProperties: false
      },
      risk: 'ui',
      validate: args => {
        if (!exposedPanes.some(pane => pane.id === args.paneId)) {
          throw new Error(`Pane is not registered for LLM access: ${args.paneId}`)
        }
        return args
      },
      execute: ({ paneId }, context) => {
        context.actions.switchPane(paneId)
        return { activePaneId: paneId }
      }
    }
  }

  if (readablePanes.length) {
    commands.get_pane_state = {
      description: 'Read the state that a registered pane explicitly exposes to the LLM.',
      parameters: {
        type: 'object',
        properties: {
          paneId: {
            type: 'string',
            enum: readablePanes.map(pane => pane.id),
            description: 'The registered pane whose exposed state should be read.'
          }
        },
        required: ['paneId'],
        additionalProperties: false
      },
      risk: 'read',
      validate: args => {
        if (!readablePanes.some(pane => pane.id === args.paneId)) {
          throw new Error(`Pane does not expose readable state: ${args.paneId}`)
        }
        return args
      },
      execute: ({ paneId }, context) => getPaneContext(paneId, context.getState())
    }
  }

  for (const pane of exposedPanes) {
    for (const [name, definition] of Object.entries(pane.llm.commands || {})) {
      if (!TOOL_NAME_PATTERN.test(name)) {
        throw new TypeError(`Invalid LLM command name: ${name}`)
      }
      if (commands[name]) throw new TypeError(`Duplicate LLM command name: ${name}`)
      assertObject(definition, `Command ${name}`)
      if (typeof definition.execute !== 'function') {
        throw new TypeError(`Command ${name} must define an execute function`)
      }

      commands[name] = {
        ...definition,
        enabled: definition.enabled
          ? (args, context) => definition.enabled(args, paneExecutionContext(pane, context))
          : undefined,
        summary: typeof definition.summary === 'function'
          ? (args, context) => definition.summary(args, paneExecutionContext(pane, context))
          : definition.summary,
        execute: (args, context) => definition.execute(args, paneExecutionContext(pane, context))
      }
    }
  }

  const commandBus = createCommandBus({
    store,
    commands,
    contextSelector: getModelContext,
    confirmationRisks,
    historyLimit
  })

  return {
    store,
    commandBus,
    panes: definitions,
    getPane: paneId => paneById.get(paneId),
    getPaneContext,
    getModelContext: () => getModelContext(store.getState().data),
    getToolHandlers: (options = {}) => Object.fromEntries(
      commandBus.getToolDefinitions().map(tool => [
        tool.function.name,
        args => commandBus.execute(tool.function.name, args, options)
      ])
    )
  }
}
