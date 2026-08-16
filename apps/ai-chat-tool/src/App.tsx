import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Bot, Moon, PanelLeft, Send, Square, Sun, Trash2, X } from 'lucide-react'
import { useAiChat, type ChatMessage as ChatMessageValue } from '@ai-lca-tools/chat-react'

import { createOpenRouterTransport } from '@/chat/openRouterTransport'
import { ActionMenu } from '@/components/ActionMenu'
import { ChatMessage } from '@/components/ChatMessage'
import { RadioGroupControl, SelectControl } from '@/components/FormControls'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_ENDPOINT, loadJSON, MODELS, storageKey } from '@/config'
import { paneRuntime, paneToolHandlers, paneTools, usePaneStore } from '@/panes/runtime'
import type { SelectionPaneActions, SelectionPaneState } from '@/panes/registry'

const DEFAULT_SUGGESTIONS = [
  'What panes can you access?',
  'Describe the active pane state',
  'Switch to another pane'
]

interface Preferences {
  model?: string
}

interface StoredConversation {
  id: string
  title: string
  updated: number
  messages: ChatMessageValue[]
}

export default function App() {
  const preferences = useRef(loadJSON<Preferences>(storageKey('preferences'), {})).current
  const activePaneId = usePaneStore(state => state.data.activePaneId)
  const paneData = usePaneStore(state => state.data.panes)
  const paneActions = usePaneStore(state => state.actions.panes)
  const switchPane = usePaneStore(state => state.actions.switchPane)
  const activePane = paneRuntime.getPane(activePaneId)
  if (!activePane) throw new Error(`Unknown active pane: ${activePaneId}`)

  const activePaneState = paneData[activePaneId] as SelectionPaneState
  const activePaneActions = paneActions[activePaneId] as SelectionPaneActions
  const fields = Object.entries(activePane.fields)

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey('sidebar-width')))
    return Number.isFinite(saved) && saved >= 180 && saved <= 600 ? saved : 220
  })
  const [model, setModel] = useState<string>(() => (
    MODELS.some(([id]) => id === preferences.model) ? preferences.model! : MODELS[0][0]
  ))
  const [apiKey, setApiKey] = useState(localStorage.getItem(storageKey('openrouter-key')) || '')
  const [endpoint, setEndpoint] = useState(localStorage.getItem(storageKey('endpoint')) || DEFAULT_ENDPOINT)
  const [contextOn, setContextOn] = useState(true)
  const [draft, setDraft] = useState('')
  const [controlsOpen, setControlsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [title, setTitle] = useState('New conversation')
  const [chats, setChats] = useState<StoredConversation[]>(() => (
    loadJSON<StoredConversation[]>(storageKey('conversations'), [])
  ))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (
    localStorage.getItem(storageKey('theme')) === 'light' ? 'light' : 'dark'
  ))

  const scrollRef = useRef<HTMLElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const controlsTriggerRef = useRef<HTMLButtonElement>(null)
  const transport = useMemo(() => createOpenRouterTransport({
    apiKey,
    endpoint,
    appTitle: 'AI Chat Tool'
  }), [apiKey, endpoint])

  useEffect(() => {
    localStorage.setItem(storageKey('preferences'), JSON.stringify({ model }))
  }, [model])
  useEffect(() => {
    localStorage.setItem(storageKey('sidebar-width'), String(sidebarWidth))
  }, [sidebarWidth])
  useEffect(() => {
    localStorage.setItem(storageKey('theme'), theme)
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    if (!controlsOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    sidebarRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setControlsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus()
    }
  }, [controlsOpen])

  const baseSystemPrompt = 'You are a concise assistant embedded in an application. Use only the registered pane tools to read or change application state. Never claim access to an unregistered pane or unexposed state.'
  const getSystemPrompt = () => contextOn
    ? `${baseSystemPrompt}\n\nCurrent registered pane context:\n${JSON.stringify(paneRuntime.getModelContext(), null, 2)}`
    : baseSystemPrompt

  const saveConversation = (finished: ChatMessageValue[]) => {
    const firstUserMessage = finished.find(message => message.role === 'user')
    if (!firstUserMessage) return
    const id = currentId || crypto.randomUUID()
    const chatTitle = firstUserMessage.content.slice(0, 60)
    const next = [
      { id, title: chatTitle, updated: Date.now(), messages: finished },
      ...chats.filter(conversation => conversation.id !== id)
    ].slice(0, 30)
    setCurrentId(id)
    setTitle(chatTitle)
    setChats(next)
    localStorage.setItem(storageKey('conversations'), JSON.stringify(next))
  }

  const chat = useAiChat({
    model,
    transport,
    getSystemPrompt,
    tools: paneTools,
    handlers: paneToolHandlers,
    confirmations: paneRuntime.commandBus,
    onComplete: saveConversation
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages])

  const submit = (text: string) => {
    if (!text.trim()) return
    setDraft('')
    void chat.send(text)
  }
  const newChat = () => {
    chat.replaceMessages([])
    setCurrentId(null)
    setTitle('New conversation')
  }
  const loadChat = (item: StoredConversation) => {
    chat.replaceMessages(item.messages)
    setCurrentId(item.id)
    setTitle(item.title)
    setHistoryOpen(false)
  }
  const deleteChat = (id: string) => {
    const next = chats.filter(conversation => conversation.id !== id)
    setChats(next)
    localStorage.setItem(storageKey('conversations'), JSON.stringify(next))
    if (id === currentId) newChat()
  }
  const exportMarkdown = () => {
    const body = `# ${title}\n\n${chat.messages.map(message => `## ${message.role === 'user' ? 'You' : 'Assistant'}\n\n${message.content}`).join('\n\n')}`
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }))
    anchor.download = 'ai-chat-tool.md'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }
  const saveSettings = () => {
    localStorage.setItem(storageKey('openrouter-key'), apiKey)
    localStorage.setItem(storageKey('endpoint'), endpoint)
    setSettingsOpen(false)
    chat.setError('')
  }

  const resizeSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const onMove = (moveEvent: globalThis.PointerEvent) => setSidebarWidth(
      Math.min(600, Math.max(180, startWidth + moveEvent.clientX - startX))
    )
    const onUp = () => {
      document.body.classList.remove('resizing-sidebar')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    document.body.classList.add('resizing-sidebar')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const resizeSidebarWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') setSidebarWidth(180)
    else if (event.key === 'End') setSidebarWidth(600)
    else setSidebarWidth(width => Math.min(600, Math.max(180, width + (event.key === 'ArrowRight' ? 20 : -20))))
  }

  return (
    <div className="app-shell" data-theme={theme} style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
      <aside ref={sidebarRef} className={`sidebar${controlsOpen ? ' mobile-open' : ''}`} id="control-panel" aria-label="Registered panes">
        <div className="sidebar-heading">
          <b>Panes</b>
          <Button variant="ghost" size="icon" className="icon sidebar-close" onClick={() => setControlsOpen(false)} aria-label="Close panes" title="Close panes"><X /></Button>
        </div>
        <nav className="sidebar-tabs" aria-label="Application panes" role="tablist">
          {paneRuntime.panes.map(pane => (
            <div className={`sidebar-tab${activePaneId === pane.id ? ' active' : ''}`} role="presentation" key={pane.id}>
              <Button variant="ghost" role="tab" aria-selected={activePaneId === pane.id} onClick={() => switchPane(pane.id)}>{pane.title}</Button>
            </div>
          ))}
        </nav>
        <div className="tab-panel" role="tabpanel" aria-label={`${activePane.title} controls`}>
          {fields.map(([key, field]) => field.control === 'radio'
            ? <RadioGroupControl key={key} label={field.label} name={`${activePaneId}-${key}`} value={activePaneState[key]} values={field.values} onChange={value => activePaneActions.setValues({ [key]: value })} />
            : <SelectControl key={key} label={field.label} value={activePaneState[key]} values={field.values} onChange={value => activePaneActions.setValues({ [key]: value })} />)}
        </div>
      </aside>

      {controlsOpen && <Button variant="ghost" className="sidebar-backdrop" onClick={() => setControlsOpen(false)} aria-label="Close panes" />}
      <div className="sidebar-resizer" role="separator" aria-label="Resize pane panel" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={600} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={resizeSidebar} onKeyDown={resizeSidebarWithKeyboard} />

      <main>
        <header>
          <div className="app-brand">
            <div className="app-brand-line"><span className="app-brand-mark"><Bot /></span><b>AI Chat Tool</b></div>
            <small className="study-title">{title}</small>
          </div>
          <div className="header-actions">
            <SelectControl label="Model" className="model-select" value={model} values={MODELS.map(([id]) => id)} onChange={setModel} />
            <Button ref={controlsTriggerRef} variant="outline" size="icon" className="icon controls-trigger" onClick={() => setControlsOpen(true)} aria-label="Open panes" aria-controls="control-panel" aria-expanded={controlsOpen} title="Open panes"><PanelLeft /></Button>
            <Button variant="outline" size="icon" className="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun /> : <Moon />}</Button>
            <ActionMenu actions={{ newConversation: newChat, history: () => setHistoryOpen(true), markdown: exportMarkdown, print: () => window.print(), settings: () => setSettingsOpen(true), clear: newChat }} />
          </div>
        </header>

        <section className="conversation" ref={scrollRef}>
          {!chat.messages.length && (
            <div className="welcome">
              <small>REGISTERED PANE ASSISTANT</small>
              <h1>What would you like to change?</h1>
              <p>The active pane is {activePane.title}. Its exposed values are {Object.values(activePaneState).map(value => value.toLowerCase()).join(' and ')}.</p>
              <div className="suggestions">
                {(activePane.suggestions.length ? activePane.suggestions : DEFAULT_SUGGESTIONS).map(prompt => (
                  <Button variant="outline" key={prompt} onClick={() => submit(prompt)}>{prompt}</Button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((message, index) => (
            <ChatMessage key={index} message={message} model={MODELS.find(item => item[0] === model)?.[1] ?? model} />
          ))}
        </section>

        <footer>
          <div className="composer">
            <Label className="sr-only" htmlFor="chat-prompt">Message</Label>
            <textarea
              id="chat-prompt"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit(draft)
                }
              }}
              placeholder="Ask about a registered pane…"
              disabled={chat.status === 'awaiting_confirmation'}
            />
            <div>
              <Button variant="outline" className="context" aria-pressed={contextOn} onClick={() => setContextOn(!contextOn)}>Context {contextOn ? 'on' : 'off'}</Button>
              <span className="status" aria-live="polite">{chat.status === 'streaming' && <><span className="status-dot" />Thinking</>}{chat.status === 'awaiting_confirmation' && 'Waiting for confirmation'}</span>
              <Button className="send" size="icon" disabled={chat.status === 'awaiting_confirmation'} aria-label={chat.status === 'streaming' ? 'Stop response' : 'Send message'} title={chat.status === 'streaming' ? 'Stop response' : 'Send message'} onClick={() => chat.status === 'streaming' ? chat.stop() : submit(draft)}>{chat.status === 'streaming' ? <Square /> : <Send />}</Button>
            </div>
          </div>
          {chat.error && <p className="error" role="alert">{chat.error}</p>}
          <small>AI can make mistakes. Verify important information.</small>
        </footer>
      </main>

      {settingsOpen && (
        <Modal title="Connection settings" close={() => setSettingsOpen(false)}>
          <p>Use an OpenRouter key for streamed responses. Public deployments should proxy requests through a server.</p>
          <div className="dialog-field">
            <Label htmlFor="openrouter-key">OpenRouter API key</Label>
            <Input id="openrouter-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-or-v1-…" />
          </div>
          <div className="dialog-field">
            <Label htmlFor="openrouter-endpoint">API endpoint</Label>
            <Input id="openrouter-endpoint" value={endpoint} onChange={event => setEndpoint(event.target.value)} />
          </div>
          <div className="modal-actions"><Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button onClick={saveSettings}>Save</Button></div>
        </Modal>
      )}
      {historyOpen && (
        <Modal title="Conversation history" close={() => setHistoryOpen(false)}>
          <p>Chats are stored locally on this device.</p>
          <div className="history-list">
            {chats.length
              ? chats.map(item => (
                <div className="history-item" key={item.id}>
                  <Button variant="ghost" onClick={() => loadChat(item)}><span><b>{item.title}</b><small>{new Date(item.updated).toLocaleString()}</small></span></Button>
                  <Button variant="ghost" size="icon" className="danger" aria-label={`Delete ${item.title}`} onClick={() => deleteChat(item.id)}><Trash2 /></Button>
                </div>
                ))
              : <p>No conversations yet.</p>}
          </div>
        </Modal>
      )}
      {chat.pendingConfirmation && (
        <Modal title="Confirm assistant action" close={() => { void chat.reject() }}>
          <p>{chat.pendingConfirmation.summary}</p>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => { void chat.reject() }}>Reject</Button>
            <Button onClick={() => { void chat.confirm() }}>Confirm</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
