import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { ChatMessage, ChatModel, ChatRuntime, ChatTransport } from './types.js'
import { useAiChat } from './useAiChat.js'

interface StoredConversation {
  id: string
  title: string
  updated: number
  messages: ChatMessage[]
}

export interface AiChatPanelProps {
  runtime: ChatRuntime
  transport: ChatTransport
  models: readonly ChatModel[]
  storageNamespace: string
  initialModel?: string
  title?: string
  assistantName?: string
  systemPrompt?: string | ((context: unknown) => string)
  suggestions?: readonly string[]
  className?: string
  onModelChange?(model: string): void
  onRequestSettings?(): void
}

const DEFAULT_PROMPT = 'You are a concise assistant embedded in an application. Use only the registered tools to read or change application state. Never claim access to unregistered or unexposed state.'

function readJSON<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function storageKey(namespace: string, name: string) {
  return `${namespace}:${name}`
}

function Message({ message, assistantName }: { message: ChatMessage; assistantName: string }) {
  return (
    <article className={`ai-chat-message ${message.role}`}>
      <strong>{message.role === 'user' ? 'You' : assistantName}</strong>
      {message.reasoning && <details><summary>Reasoning summary</summary><p>{message.reasoning}</p></details>}
      {message.tools?.map((tool, index) => (
        <details className={`ai-chat-tool ${tool.state}`} key={`${tool.name}-${index}`}>
          <summary>{tool.name} · {tool.state}</summary>
          <pre>{JSON.stringify(tool.output, null, 2)}</pre>
        </details>
      ))}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      {message.streaming && <span className="ai-chat-typing" aria-label="Response streaming">●</span>}
    </article>
  )
}

export function AiChatPanel({
  runtime,
  transport,
  models,
  storageNamespace,
  initialModel,
  title = 'Assistant',
  assistantName = 'Assistant',
  systemPrompt = DEFAULT_PROMPT,
  suggestions = [],
  className = '',
  onModelChange,
  onRequestSettings
}: AiChatPanelProps) {
  if (!models.length) throw new Error('AiChatPanel requires at least one model')

  const storedModel = readJSON<string | null>(storageKey(storageNamespace, 'model'), null)
  const fallbackModel = initialModel && models.some(([id]) => id === initialModel)
    ? initialModel
    : models[0][0]
  const [model, setModel] = useState(() => storedModel && models.some(([id]) => id === storedModel)
    ? storedModel
    : fallbackModel)
  const [draft, setDraft] = useState('')
  const [contextOn, setContextOn] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState('New conversation')
  const [conversations, setConversations] = useState<StoredConversation[]>(() => (
    readJSON<StoredConversation[]>(storageKey(storageNamespace, 'conversations'), [])
  ))
  const scrollRef = useRef<HTMLDivElement>(null)
  const historyCloseRef = useRef<HTMLButtonElement>(null)
  const confirmationRejectRef = useRef<HTMLButtonElement>(null)
  const confirmationDescriptionId = useId()

  const tools = useMemo(() => runtime.commandBus.getToolDefinitions(), [runtime])
  const handlers = useMemo(() => runtime.getToolHandlers({ source: 'llm' }), [runtime])
  const getSystemPrompt = useCallback(() => {
    const context = runtime.getModelContext()
    const base = typeof systemPrompt === 'function' ? systemPrompt(context) : systemPrompt
    return contextOn ? `${base}\n\nCurrent registered application context:\n${JSON.stringify(context, null, 2)}` : base
  }, [contextOn, runtime, systemPrompt])

  const saveConversation = useCallback((finished: ChatMessage[]) => {
    const firstUserMessage = finished.find(message => message.role === 'user')
    if (!firstUserMessage) return
    const id = currentId || crypto.randomUUID()
    const nextTitle = firstUserMessage.content.slice(0, 60)
    const next = [
      { id, title: nextTitle, updated: Date.now(), messages: finished },
      ...conversations.filter(conversation => conversation.id !== id)
    ].slice(0, 30)
    setCurrentId(id)
    setConversationTitle(nextTitle)
    setConversations(next)
    localStorage.setItem(storageKey(storageNamespace, 'conversations'), JSON.stringify(next))
  }, [conversations, currentId, storageNamespace])

  const chat = useAiChat({
    model,
    transport,
    getSystemPrompt,
    tools,
    handlers,
    confirmations: runtime.commandBus,
    onComplete: saveConversation
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages])
  useEffect(() => {
    if (!historyOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    historyCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus()
    }
  }, [historyOpen])
  useEffect(() => {
    if (!chat.pendingConfirmation) return
    confirmationRejectRef.current?.focus()
  }, [chat.pendingConfirmation])

  const changeModel = (value: string) => {
    setModel(value)
    localStorage.setItem(storageKey(storageNamespace, 'model'), JSON.stringify(value))
    onModelChange?.(value)
  }
  const submit = (value: string) => {
    if (!value.trim()) return
    setDraft('')
    void chat.send(value)
  }
  const newConversation = () => {
    chat.replaceMessages([])
    setCurrentId(null)
    setConversationTitle('New conversation')
  }
  const loadConversation = (conversation: StoredConversation) => {
    chat.replaceMessages(conversation.messages)
    setCurrentId(conversation.id)
    setConversationTitle(conversation.title)
    setHistoryOpen(false)
  }
  const deleteConversation = (id: string) => {
    const next = conversations.filter(conversation => conversation.id !== id)
    setConversations(next)
    localStorage.setItem(storageKey(storageNamespace, 'conversations'), JSON.stringify(next))
    if (currentId === id) newConversation()
  }

  return (
    <section className={`ai-chat-panel ${className}`.trim()} aria-label={title}>
      <header className="ai-chat-header">
        <div><strong>{title}</strong><small>{conversationTitle}</small></div>
        <label>
          <span className="ai-chat-sr-only">Model</span>
          <select value={model} onChange={event => changeModel(event.target.value)}>
            {models.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setHistoryOpen(true)}>History</button>
        {onRequestSettings && <button type="button" onClick={onRequestSettings}>Settings</button>}
        <button type="button" onClick={newConversation} disabled={chat.status !== 'idle'}>New</button>
      </header>

      <div className="ai-chat-conversation" ref={scrollRef} aria-live="polite">
        {!chat.messages.length && (
          <div className="ai-chat-welcome">
            <h2>How can I help?</h2>
            <p>I can use only the views and actions this application has registered.</p>
            <div>{suggestions.map(suggestion => (
              <button type="button" key={suggestion} onClick={() => submit(suggestion)}>{suggestion}</button>
            ))}</div>
          </div>
        )}
        {chat.messages.map((message, index) => (
          <Message message={message} assistantName={assistantName} key={index} />
        ))}
      </div>

      {chat.pendingConfirmation && (
        <aside className="ai-chat-confirmation" role="alertdialog" aria-modal="true" aria-label="Confirm assistant action" aria-describedby={confirmationDescriptionId}>
          <strong>Confirm action</strong>
          <p id={confirmationDescriptionId}>{chat.pendingConfirmation.summary}</p>
          <div>
            <button ref={confirmationRejectRef} type="button" onClick={() => { void chat.reject() }}>Reject</button>
            <button type="button" onClick={() => { void chat.confirm() }}>Confirm</button>
          </div>
        </aside>
      )}

      <footer className="ai-chat-composer">
        <label className="ai-chat-sr-only" htmlFor={`${storageNamespace}-prompt`}>Message</label>
        <textarea
          id={`${storageNamespace}-prompt`}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit(draft)
            }
          }}
          placeholder="Ask about this application…"
          disabled={chat.status === 'awaiting_confirmation'}
        />
        <div>
          <button type="button" aria-pressed={contextOn} onClick={() => setContextOn(value => !value)}>
            Context {contextOn ? 'on' : 'off'}
          </button>
          <span>{chat.status === 'streaming' ? 'Thinking…' : chat.status === 'awaiting_confirmation' ? 'Waiting for confirmation' : ''}</span>
          <button
            type="button"
            aria-label={chat.status === 'streaming' ? 'Stop response' : 'Send message'}
            onClick={() => chat.status === 'streaming' ? chat.stop() : submit(draft)}
            disabled={chat.status === 'awaiting_confirmation'}
          >
            {chat.status === 'streaming' ? 'Stop' : 'Send'}
          </button>
        </div>
        {chat.error && <p role="alert">{chat.error}</p>}
        <small>AI can make mistakes. Verify important information.</small>
      </footer>

      {historyOpen && (
        <div className="ai-chat-dialog-backdrop" role="presentation">
          <section className="ai-chat-dialog" role="dialog" aria-modal="true" aria-label="Conversation history">
            <header><strong>Conversation history</strong><button ref={historyCloseRef} type="button" onClick={() => setHistoryOpen(false)}>Close</button></header>
            {conversations.length ? conversations.map(conversation => (
              <div className="ai-chat-history-item" key={conversation.id}>
                <button type="button" onClick={() => loadConversation(conversation)}>
                  <strong>{conversation.title}</strong>
                  <small>{new Date(conversation.updated).toLocaleString()}</small>
                </button>
                <button type="button" aria-label={`Delete ${conversation.title}`} onClick={() => deleteConversation(conversation.id)}>Delete</button>
              </div>
            )) : <p>No conversations yet.</p>}
          </section>
        </div>
      )}
    </section>
  )
}
