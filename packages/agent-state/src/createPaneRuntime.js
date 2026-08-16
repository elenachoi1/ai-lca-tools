import { createAgentStore } from './createAgentStore.js'
import { createCommandBus } from './createCommandBus.js'

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-null object`)
  }
}

function normalizePanes(panes, usesHostStore) {
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
    if (usesHostStore) {
      if (typeof pane.selectState !== 'function') {
        throw new TypeError(`Pane ${pane.id} selectState must be a function when using a host store`)
      }
      if (pane.selectActions !== undefined && typeof pane.selectActions !== 'function') {
        throw new TypeError(`Pane ${pane.id} selectActions must be a function`)
      }
    } else {
      assertObject(pane.initialState, `Pane ${pane.id} initialState`)
      if (pane.actions !== undefined && typeof pane.actions !== 'function') {
        throw new TypeError(`Pane ${pane.id} actions must be a function`)
      }
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

/**
 * Creates a registered-pane application runtime. A pane is visible to the LLM
 * only when it explicitly supplies an `llm` contract.
 */
export function createPaneRuntime({
  store: hostStore,
  panes,
  initialActivePaneId,
  persistence,
  selectActivePaneId,
  switchPane,
  confirmationRisks,
  historyLimit
}) {
  const usesHostStore = hostStore !== undefined
  if (usesHostStore && (!hostStore?.getState || !hostStore?.subscribe)) {
    throw new TypeError('store must be a Zustand vanilla store')
  }
  if (usesHostStore && persistence) {
    throw new TypeError('persistence is owned by the host store when store is provided')
  }
  if (selectActivePaneId !== undefined && typeof selectActivePaneId !== 'function') {
    throw new TypeError('selectActivePaneId must be a function')
  }
  if (switchPane !== undefined && typeof switchPane !== 'function') {
    throw new TypeError('switchPane must be a function')
  }

  const definitions = normalizePanes(panes, usesHostStore)
  const paneById = new Map(definitions.map(pane => [pane.id, pane]))
  const exposedPanes = definitions.filter(pane => pane.llm)
  const readablePanes = exposedPanes.filter(pane => typeof pane.llm.selectState === 'function')
  const defaultActivePaneId = initialActivePaneId || definitions[0].id

  if (!usesHostStore && !paneById.has(defaultActivePaneId)) {
    throw new TypeError(`Unknown initial active pane: ${defaultActivePaneId}`)
  }

  const store = hostStore || createAgentStore({
    initialState: {
      activePaneId: defaultActivePaneId,
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

  const currentStoreState = store.getState()
  if (!currentStoreState?.data || !currentStoreState?.actions || !currentStoreState?.meta) {
    throw new TypeError('store must expose data, actions, and meta through createAgentStore')
  }

  const getActivePaneId = selectActivePaneId || (appState => appState.activePaneId)
  const getPaneState = (pane, appState) => {
    const state = usesHostStore
      ? pane.selectState(appState, { pane: publicPane(pane) })
      : appState.panes[pane.id]
    assertObject(state, `Pane ${pane.id} selected state`)
    return state
  }
  const getPaneActions = (pane, appActions, appState) => {
    const actions = usesHostStore
      ? pane.selectActions?.(appActions, { appState, pane: publicPane(pane) }) || {}
      : appActions.panes[pane.id]
    assertObject(actions, `Pane ${pane.id} selected actions`)
    return actions
  }
  const paneIsAvailable = (pane, appState) => pane.llm?.available
    ? pane.llm.available(getPaneState(pane, appState), {
        appState,
        pane: publicPane(pane)
      }) !== false
    : true

  const paneExecutionContext = (pane, context) => ({
    ...context,
    pane: publicPane(pane),
    state: getPaneState(pane, context.state),
    actions: getPaneActions(pane, context.actions, context.state),
    getState: () => getPaneState(pane, context.getState()),
    getAppState: context.getState
  })

  const selectPaneState = (pane, appState) => {
    if (typeof pane.llm?.selectState !== 'function') return undefined
    return pane.llm.selectState(getPaneState(pane, appState), {
      appState,
      pane: publicPane(pane)
    })
  }

  const getPaneContext = (paneId, appState = store.getState().data) => {
    const pane = paneById.get(paneId)
    if (!pane?.llm) throw new Error(`Pane is not exposed to the LLM: ${paneId}`)
    if (!paneIsAvailable(pane, appState)) throw new Error(`Pane is currently unavailable: ${paneId}`)
    if (typeof pane.llm.selectState !== 'function') {
      throw new Error(`Pane does not expose readable state: ${paneId}`)
    }
    return {
      ...publicPane(pane),
      state: selectPaneState(pane, appState)
    }
  }

  const getModelContext = appState => ({
    activePaneId: exposedPanes.some(pane => pane.id === getActivePaneId(appState))
      ? getActivePaneId(appState)
      : null,
    panes: exposedPanes.map(pane => ({
      ...publicPane(pane),
      active: pane.id === getActivePaneId(appState),
      available: paneIsAvailable(pane, appState),
      ...(typeof pane.llm.selectState === 'function' && paneIsAvailable(pane, appState)
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
        const pane = paneById.get(args.paneId)
        if (!paneIsAvailable(pane, store.getState().data)) {
          throw new Error(`Pane is currently unavailable: ${args.paneId}`)
        }
        return args
      },
      execute: async ({ paneId }, context) => {
        if (switchPane) await switchPane(paneId, context)
        else if (typeof context.actions.switchPane === 'function') context.actions.switchPane(paneId)
        else throw new Error('A switchPane adapter is required for this host store')
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
        const pane = paneById.get(args.paneId)
        if (!paneIsAvailable(pane, store.getState().data)) {
          throw new Error(`Pane is currently unavailable: ${args.paneId}`)
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
        enabled: (args, context) => paneIsAvailable(pane, context.state) && (
          definition.enabled
            ? definition.enabled(args, paneExecutionContext(pane, context))
            : true
        ),
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
