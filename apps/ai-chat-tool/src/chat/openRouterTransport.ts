import type {
  ChatTransport,
  ModelMessage,
  ToolCall,
  ToolDefinition,
  TransportDelta,
  TransportResult
} from '@ai-lca-tools/chat-react'

interface OpenRouterTransportOptions {
  apiKey: string
  endpoint: string
  appTitle?: string
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

async function streamOpenRouter({
  apiKey,
  endpoint,
  appTitle,
  model,
  messages,
  tools,
  signal,
  onDelta
}: OpenRouterTransportOptions & {
  model: string
  messages: ModelMessage[]
  tools: ToolDefinition[]
  signal: AbortSignal
  onDelta(delta: TransportDelta): void
}): Promise<TransportResult> {
  if (!apiKey) throw new Error('Add an OpenRouter API key in Settings.')
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': location.href,
      'X-Title': appTitle || 'AI Chat Tool'
    },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', stream: true })
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
      onDelta({ content, reasoning })
    }
  }

  return { content, reasoning, calls: calls.filter((call): call is ToolCall => Boolean(call)) }
}

export function createOpenRouterTransport(options: OpenRouterTransportOptions): ChatTransport {
  return {
    stream: request => streamOpenRouter({ ...options, ...request })
  }
}
