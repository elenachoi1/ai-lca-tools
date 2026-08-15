import { createStore } from 'zustand/vanilla'

const DEFAULT_CONFIRMATION_RISKS = new Set(['mutation', 'external', 'destructive'])
const DEFAULT_HISTORY_LIMIT = 100

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `command-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function errorResult(command, code, message) {
  return {
    status: 'error',
    command,
    error: { code, message }
  }
}

function normalizeError(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

function validateArguments(command, definition, args) {
  const input = args ?? {}
  if (!definition.validate) return input

  const result = definition.validate(input)
  if (result === false) throw new Error(`Invalid arguments for ${command}`)
  return result === true || result === undefined ? input : result
}

function toolDefinition(name, definition) {
  return {
    type: 'function',
    function: {
      name,
      description: definition.description || name,
      parameters: definition.parameters || {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  }
}

/**
 * Bridges validated LLM commands to named application actions. The execution
 * context intentionally excludes Zustand's raw setState API.
 */
export function createCommandBus({
  store,
  commands,
  contextSelector = state => state,
  confirmationRisks = DEFAULT_CONFIRMATION_RISKS,
  historyLimit = DEFAULT_HISTORY_LIMIT
}) {
  if (!store?.getState || !store?.subscribe) {
    throw new TypeError('A Zustand vanilla store is required')
  }
  if (!commands || typeof commands !== 'object') {
    throw new TypeError('commands must be an object')
  }
  for (const [name, definition] of Object.entries(commands)) {
    if (!definition || typeof definition.execute !== 'function') {
      throw new TypeError(`Command ${name} must define an execute function`)
    }
  }

  const risks = new Set(confirmationRisks)
  const runtimeStore = createStore(() => ({
    pending: {},
    history: []
  }))

  const addHistory = entry => {
    runtimeStore.setState(current => ({
      history: [entry, ...current.history].slice(0, historyLimit)
    }))
  }

  const removePending = id => {
    runtimeStore.setState(current => {
      const { [id]: removed, ...pending } = current.pending
      return { pending }
    })
  }

  const executionContext = source => {
    const current = store.getState()
    return {
      source,
      state: current.data,
      actions: current.actions,
      revision: current.meta.revision,
      getState: () => store.getState().data,
      getRevision: () => store.getState().meta.revision
    }
  }

  const record = (command, source, status, detail = {}) => {
    addHistory({
      id: createId(),
      command,
      source,
      status,
      timestamp: new Date().toISOString(),
      ...detail
    })
  }

  const run = async (name, definition, args, source) => {
    try {
      const result = await definition.execute(args, executionContext(source))
      record(name, source, 'completed')
      return { status: 'completed', command: name, result: result ?? { success: true } }
    } catch (error) {
      const message = normalizeError(error)
      record(name, source, 'error', { message })
      return errorResult(name, 'EXECUTION_FAILED', message)
    }
  }

  const execute = async (name, args = {}, options = {}) => {
    const definition = commands[name]
    const source = options.source || 'llm'
    if (!definition) return errorResult(name, 'UNKNOWN_COMMAND', `Unknown command: ${name}`)

    let validatedArgs
    try {
      validatedArgs = validateArguments(name, definition, args)
      const enabled = definition.enabled?.(validatedArgs, executionContext(source))
      if (enabled === false) {
        return errorResult(name, 'COMMAND_DISABLED', `Command is currently disabled: ${name}`)
      }
    } catch (error) {
      return errorResult(name, 'INVALID_ARGUMENTS', normalizeError(error))
    }

    const needsConfirmation = definition.confirm === true || risks.has(definition.risk)
    if (needsConfirmation) {
      const id = createId()
      let summary
      try {
        summary = typeof definition.summary === 'function'
          ? definition.summary(validatedArgs, executionContext(source))
          : definition.summary || `Run ${name}?`
      } catch (error) {
        return errorResult(name, 'INVALID_PROPOSAL', normalizeError(error))
      }
      const proposal = {
        id,
        command: name,
        args: validatedArgs,
        source,
        summary,
        baseRevision: store.getState().meta.revision,
        createdAt: new Date().toISOString(),
        allowStateChanges: definition.allowStateChangesBeforeConfirmation === true
      }
      runtimeStore.setState(current => ({
        pending: { ...current.pending, [id]: proposal }
      }))
      record(name, source, 'confirmation_required', { confirmationId: id })
      return {
        status: 'confirmation_required',
        command: name,
        confirmation: {
          id,
          summary: proposal.summary,
          baseRevision: proposal.baseRevision
        }
      }
    }

    return run(name, definition, validatedArgs, source)
  }

  const confirm = async id => {
    const proposal = runtimeStore.getState().pending[id]
    if (!proposal) return errorResult('confirm', 'UNKNOWN_CONFIRMATION', `Unknown confirmation: ${id}`)

    const definition = commands[proposal.command]
    if (!definition) {
      removePending(id)
      return errorResult(proposal.command, 'UNKNOWN_COMMAND', `Unknown command: ${proposal.command}`)
    }

    if (!proposal.allowStateChanges && store.getState().meta.revision !== proposal.baseRevision) {
      removePending(id)
      record(proposal.command, proposal.source, 'stale', { confirmationId: id })
      return errorResult(
        proposal.command,
        'STALE_CONFIRMATION',
        'Application state changed after this command was proposed'
      )
    }

    removePending(id)
    return run(proposal.command, definition, proposal.args, proposal.source)
  }

  const reject = (id, reason = 'Rejected by user') => {
    const proposal = runtimeStore.getState().pending[id]
    if (!proposal) return errorResult('reject', 'UNKNOWN_CONFIRMATION', `Unknown confirmation: ${id}`)
    removePending(id)
    record(proposal.command, proposal.source, 'rejected', { confirmationId: id })
    return { status: 'rejected', command: proposal.command, reason }
  }

  return {
    execute,
    confirm,
    reject,
    getContext: () => contextSelector(store.getState().data),
    getToolDefinitions: () => Object.entries(commands).map(([name, definition]) => toolDefinition(name, definition)),
    getRuntimeState: runtimeStore.getState,
    subscribe: runtimeStore.subscribe,
    runtimeStore
  }
}
