export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
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
  state: 'complete' | 'error' | 'confirmation'
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  streaming?: boolean
  calls?: ToolCall[]
  tools?: ToolView[]
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface TransportDelta {
  content: string
  reasoning?: string
}

export interface TransportResult extends TransportDelta {
  calls: ToolCall[]
}

export interface ChatTransportRequest {
  model: string
  messages: ModelMessage[]
  tools: ToolDefinition[]
  signal: AbortSignal
  onDelta(delta: TransportDelta): void
}

export interface ChatTransport {
  stream(request: ChatTransportRequest): Promise<TransportResult>
}

export type ToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>

export interface ConfirmationResult {
  status: 'completed' | 'confirmation_required' | 'rejected' | 'error'
  command: string
  result?: unknown
  confirmation?: { id: string; summary: string; baseRevision?: number }
  error?: { code: string; message: string }
  reason?: string
}

export interface ConfirmationController {
  confirm(id: string): Promise<ConfirmationResult>
  reject(id: string, reason?: string): ConfirmationResult
}

export interface PendingConfirmation {
  id: string
  summary: string
  command: string
  toolName: string
  input: Record<string, unknown>
}

export interface ChatRuntime {
  commandBus: ConfirmationController & {
    getToolDefinitions(): ToolDefinition[]
  }
  getToolHandlers(options?: { source?: string }): Record<string, ToolHandler>
  getModelContext(): unknown
}

export type ChatModel = readonly [id: string, label: string]
