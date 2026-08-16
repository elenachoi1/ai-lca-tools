import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ChatMessage,
  ChatTransport,
  ConfirmationController,
  ConfirmationResult,
  ModelMessage,
  PendingConfirmation,
  ToolCall,
  ToolDefinition,
  ToolHandler,
  ToolView
} from './types.js'

const DEFAULT_MAX_TOOL_ROUNDS = 20

export interface UseAiChatOptions {
  model: string
  transport: ChatTransport
  getSystemPrompt(): string
  tools: ToolDefinition[]
  handlers: Record<string, ToolHandler>
  confirmations?: ConfirmationController
  maxToolRounds?: number
  onComplete?: (messages: ChatMessage[]) => void
}

interface Continuation {
  api: ModelMessage[]
  ui: ChatMessage[]
  round: number
  calls: ToolCall[]
  callIndex: number
  toolViews: ToolView[]
}

interface InternalPending {
  continuation: Continuation
  call: ToolCall
  input: Record<string, unknown>
  proposal: ConfirmationResult & { confirmation: { id: string; summary: string } }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isConfirmation(value: unknown): value is InternalPending['proposal'] {
  if (!value || typeof value !== 'object') return false
  const result = value as ConfirmationResult
  return result.status === 'confirmation_required' && Boolean(result.confirmation?.id)
}

function parseArguments(call: ToolCall) {
  const parsed = JSON.parse(call.function.arguments || '{}') as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Tool arguments for ${call.function.name} must be an object`)
  }
  return parsed as Record<string, unknown>
}

export function useAiChat({
  model,
  transport,
  getSystemPrompt,
  tools,
  handlers,
  confirmations,
  maxToolRounds = DEFAULT_MAX_TOOL_ROUNDS,
  onComplete
}: UseAiChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<'idle' | 'streaming' | 'awaiting_confirmation'>('idle')
  const [error, setError] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
  const messagesRef = useRef(messages)
  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef<InternalPending | null>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const publish = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const finish = useCallback((next: ChatMessage[]) => {
    publish(next.map(message => message.streaming ? { ...message, streaming: false } : message))
    setStatus('idle')
    abortRef.current = null
    onCompleteRef.current?.(messagesRef.current)
  }, [publish])

  const drive = useCallback(async (continuation: Continuation): Promise<void> => {
    try {
      while (continuation.round < maxToolRounds) {
        if (continuation.calls.length === 0 && continuation.callIndex === 0) {
          const result = await transport.stream({
            model,
            messages: continuation.api,
            tools,
            signal: abortRef.current?.signal || new AbortController().signal,
            onDelta: delta => {
              continuation.ui = continuation.ui.map((message, index) => index === continuation.ui.length - 1
                ? { ...message, content: delta.content, reasoning: delta.reasoning }
                : message)
              publish([...continuation.ui])
            }
          })

          continuation.ui = continuation.ui.map((message, index) => index === continuation.ui.length - 1
            ? { ...message, ...result, streaming: false }
            : message)
          publish([...continuation.ui])

          if (!result.calls.length) {
            finish(continuation.ui)
            return
          }

          continuation.calls = result.calls
          continuation.api.push({
            role: 'assistant',
            content: result.content || null,
            tool_calls: result.calls
          })
        }

        while (continuation.callIndex < continuation.calls.length) {
          const call = continuation.calls[continuation.callIndex]
          let input: Record<string, unknown> = {}
          try {
            input = parseArguments(call)
            const handler = handlers[call.function.name]
            if (!handler) throw new Error(`Unknown tool: ${call.function.name}`)
            const output = await handler(input)

            if (isConfirmation(output)) {
              if (!confirmations) throw new Error('The host did not provide a confirmation controller')
              continuation.toolViews.push({
                name: call.function.name,
                input,
                output,
                state: 'confirmation'
              })
              continuation.ui = continuation.ui.map((message, index) => index === continuation.ui.length - 1
                ? { ...message, tools: [...continuation.toolViews] }
                : message)
              pendingRef.current = { continuation, call, input, proposal: output }
              setPendingConfirmation({
                id: output.confirmation.id,
                summary: output.confirmation.summary,
                command: output.command,
                toolName: call.function.name,
                input
              })
              setStatus('awaiting_confirmation')
              publish([...continuation.ui])
              return
            }

            continuation.toolViews.push({ name: call.function.name, input, output, state: 'complete' })
            continuation.api.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
          } catch (toolError) {
            const message = errorMessage(toolError)
            continuation.toolViews.push({ name: call.function.name, input, output: message, state: 'error' })
            continuation.api.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: message })
            })
          }
          continuation.callIndex += 1
        }

        continuation.ui = continuation.ui.map((message, index) => index === continuation.ui.length - 1
          ? { ...message, tools: [...continuation.toolViews] }
          : message)
        continuation.ui.push({ role: 'assistant', content: '', streaming: true })
        publish([...continuation.ui])
        continuation.round += 1
        continuation.calls = []
        continuation.callIndex = 0
        continuation.toolViews = []
      }

      throw new Error(`The model exceeded ${maxToolRounds} tool rounds`)
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
        setError(errorMessage(requestError))
      }
      finish(continuation.ui)
    }
  }, [confirmations, finish, handlers, maxToolRounds, model, publish, tools, transport])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || status !== 'idle') return
    const user: ChatMessage = { role: 'user', content: text.trim() }
    const ui = [...messagesRef.current, user, { role: 'assistant' as const, content: '', streaming: true }]
    publish(ui)
    setError('')
    setStatus('streaming')
    abortRef.current = new AbortController()

    const api: ModelMessage[] = [
      { role: 'system', content: getSystemPrompt() },
      ...messagesRef.current.slice(0, -2).map(message => ({ role: message.role, content: message.content })),
      { role: 'user', content: user.content }
    ]
    await drive({ api, ui, round: 0, calls: [], callIndex: 0, toolViews: [] })
  }, [drive, getSystemPrompt, publish, status])

  const resolveConfirmation = useCallback(async (accepted: boolean) => {
    const pending = pendingRef.current
    if (!pending || !confirmations) return
    pendingRef.current = null
    setPendingConfirmation(null)
    setStatus('streaming')

    const id = pending.proposal.confirmation.id
    let output: ConfirmationResult
    try {
      output = accepted
        ? await confirmations.confirm(id)
        : confirmations.reject(id)
    } catch (confirmationError) {
      output = {
        status: 'error',
        command: pending.proposal.command,
        error: { code: 'CONFIRMATION_FAILED', message: errorMessage(confirmationError) }
      }
    }
    const view = pending.continuation.toolViews[pending.continuation.toolViews.length - 1]
    view.output = output
    view.state = output.status === 'error' ? 'error' : 'complete'
    pending.continuation.api.push({
      role: 'tool',
      tool_call_id: pending.call.id,
      content: JSON.stringify(output)
    })
    pending.continuation.callIndex += 1
    await drive(pending.continuation)
  }, [confirmations, drive])

  const stop = useCallback(() => abortRef.current?.abort(), [])
  const replaceMessages = useCallback((value: ChatMessage[]) => {
    if (status !== 'idle') return
    publish(value)
    setError('')
  }, [publish, status])

  return {
    messages,
    status,
    error,
    pendingConfirmation,
    setError,
    send,
    stop,
    replaceMessages,
    confirm: () => resolveConfirmation(true),
    reject: () => resolveConfirmation(false)
  }
}
