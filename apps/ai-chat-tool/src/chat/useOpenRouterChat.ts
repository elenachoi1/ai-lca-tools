import { useCallback, useRef, useState } from 'react'

import type { ToolDefinition } from '@ai-lca-tools/agent-state'

const MAX_TOOL_ROUNDS = 20

type ChatRole = 'user' | 'assistant'

interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolView {
  name: string
  input: Record<string, unknown>
  output: unknown
  state: 'complete' | 'error'
}

export interface ChatMessage {
  role: ChatRole
  content: string
  reasoning?: string
  streaming?: boolean
  calls?: ToolCall[]
  tools?: ToolView[]
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface StreamResult {
  content: string
  reasoning: string
  calls: ToolCall[]
}

type ToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>

interface UseOpenRouterChatOptions {
  apiKey: string
  endpoint: string
  model: string
  systemPrompt: string
  tools: ToolDefinition[]
  handlers: Record<string, ToolHandler>
  appTitle?: string
  onComplete?: (messages: ChatMessage[]) => void
}

interface StreamDelta {
  content?: string
  reasoning?: string
  tool_calls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useOpenRouterChat({
  apiKey,
  endpoint,
  model,
  systemPrompt,
  tools,
  handlers,
  appTitle = 'AI Chat Tool',
  onComplete
}: UseOpenRouterChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<'idle' | 'streaming'>('idle')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const stream = useCallback(async (apiMessages: OpenRouterMessage[]): Promise<StreamResult> => {
    if (!abortRef.current) throw new Error('Chat request is not active')

    const response = await fetch(endpoint, {
      method: 'POST',
      signal: abortRef.current.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': location.href,
        'X-Title': appTitle
      },
      body: JSON.stringify({ model, messages: apiMessages, tools, tool_choice: 'auto', stream: true })
    })
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`)
    if (!response.body) throw new Error('OpenRouter returned an empty response stream')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let reasoning = ''
    const calls: Array<ToolCall | undefined> = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const parsed = JSON.parse(line.slice(6)) as { choices?: Array<{ delta?: StreamDelta }> }
          const delta = parsed.choices?.[0]?.delta || {}
          content += delta.content || ''
          reasoning += delta.reasoning || ''
          for (const part of delta.tool_calls || []) {
            const call = calls[part.index] ||= {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' }
            }
            call.id = part.id || call.id
            call.function.name += part.function?.name || ''
            call.function.arguments += part.function?.arguments || ''
          }
          setMessages(current => current.map((message, index) => (
            index === current.length - 1 ? { ...message, content, reasoning } : message
          )))
        } catch {
          // A later SSE chunk may complete a partial JSON event.
        }
      }
    }

    return { content, reasoning, calls: calls.filter((call): call is ToolCall => Boolean(call)) }
  }, [apiKey, appTitle, endpoint, model, tools])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || status === 'streaming') return
    if (!apiKey) {
      setError('Add an OpenRouter API key in Settings.')
      return
    }

    const user: ChatMessage = { role: 'user', content: text.trim() }
    let ui: ChatMessage[] = [...messages, user, { role: 'assistant', content: '', streaming: true }]
    setMessages(ui)
    setError('')
    setStatus('streaming')
    abortRef.current = new AbortController()

    const api: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(message => ({ role: message.role, content: message.content })),
      { role: 'user', content: user.content }
    ]

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const result = await stream(api)
        const toolViews: ToolView[] = []
        ui = ui.map((message, index) => (
          index === ui.length - 1 ? { ...message, ...result, streaming: false } : message
        ))
        setMessages(ui)
        if (!result.calls.length) break

        api.push({ role: 'assistant', content: result.content || null, tool_calls: result.calls })
        for (const call of result.calls) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
          } catch {
            // The handler receives an empty object and can return a validation error.
          }

          try {
            const handler = handlers[call.function.name]
            if (!handler) throw new Error(`Unknown tool: ${call.function.name}`)
            const output = await handler(args)
            toolViews.push({ name: call.function.name, input: args, output, state: 'complete' })
            api.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
          } catch (toolError) {
            const message = errorMessage(toolError)
            toolViews.push({ name: call.function.name, input: args, output: message, state: 'error' })
            api.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: message }) })
          }
        }

        ui = ui.map((message, index) => (
          index === ui.length - 1 ? { ...message, tools: toolViews } : message
        ))
        ui.push({ role: 'assistant', content: '', streaming: true })
        setMessages(ui)
      }
      setMessages(current => {
        onComplete?.(current)
        return current
      })
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
        setError(errorMessage(requestError))
      }
      setMessages(current => current.map(message => (
        message.streaming ? { ...message, streaming: false } : message
      )))
    } finally {
      setStatus('idle')
      abortRef.current = null
    }
  }, [apiKey, handlers, messages, onComplete, status, stream, systemPrompt])

  const stop = () => abortRef.current?.abort()
  const replaceMessages = (value: ChatMessage[]) => setMessages(value)

  return { messages, status, error, setError, send, stop, replaceMessages }
}
