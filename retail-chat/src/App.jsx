import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Bot, Check, ChevronDown, Copy, Download, History, Menu, Moon, PanelLeft, Plus, Printer, Send, Settings, Square, Sun, Trash2, User, Wrench, X } from 'lucide-react'
import { useOpenRouterChat } from './useOpenRouterChat'
import prismLogo from './assets/prism-logo.png'

const COLORS = ['Red', 'Green', 'Blue']
const SIZES = ['Small', 'Medium', 'Large']
const ANSWERS = ['Yes', 'No', 'Maybe']
const BOOLEAN_VALUES = ['True', 'False']
const FRUITS = ['Apple', 'Orange', 'Banana']
const DEFAULT_TABS = ['Tab 1', 'Tab 2', 'Tab 3']
const FIELD_DEFINITIONS = {
  color: { label: 'Color', values: COLORS, control: 'select' },
  size: { label: 'Size', values: SIZES, control: 'select' },
  answer: { label: 'Answer', values: ANSWERS, control: 'select' },
  boolean: { label: 'Boolean', values: BOOLEAN_VALUES, control: 'select' },
  fruit: { label: 'Fruit', values: FRUITS, control: 'radio' }
}
const MODELS = [['openai/gpt-4o-mini', 'GPT-4o mini'], ['anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'], ['google/gemini-3.7-flash', 'Gemini 3.7 Flash']]
const SUGGESTIONS = ['Tell me about my choices', 'Suggest something that fits', 'What can I do with these options?']
const MENU_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'show_tab',
      description: 'Switch the visible left-panel tab. Use this when the user asks to show, open, view, or go to a tab.',
      parameters: {
        type: 'object',
        properties: { tab: { type: 'string', description: 'Tab name to show, such as Tab 3.' } },
        required: ['tab'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_menu_selections',
      description: 'Get the selections in a specific tab. Omit tab to read the active tab.',
      parameters: { type: 'object', properties: { tab: { type: 'string', description: 'Tab name, such as Tab 2.' } }, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_menu_selections',
      description: 'Change one or more available selections in exactly one tab. Omit tab to change only the active tab.',
      parameters: {
        type: 'object',
        properties: {
          tab: { type: 'string', description: 'Tab name to update, such as Tab 2. Defaults to the active tab.' },
          color: { type: 'string', enum: COLORS, description: 'Color selection for a color/size tab.' },
          size: { type: 'string', enum: SIZES, description: 'Size selection for a color/size tab.' },
          answer: { type: 'string', enum: ANSWERS, description: 'Yes, No, or Maybe selection for an answer/boolean tab.' },
          boolean: { type: 'string', enum: BOOLEAN_VALUES, description: 'True or False selection for an answer/boolean tab.' },
          fruit: { type: 'string', enum: FRUITS, description: 'Fruit selection for a fruit tab.' }
        },
        additionalProperties: false
      }
    }
  }
]

function Select({ label, value, onChange, children, className='' }) { return <label className={`field ${className}`}><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{children}</select><ChevronDown size={14}/></label> }
function RadioGroup({ label, name, value, values, onChange }) { return <fieldset className="radio-field"><legend>{label}</legend><div className="radio-options">{values.map(option => <label key={option}><input type="radio" name={name} value={option} checked={value === option} onChange={event => onChange(event.target.value)}/><span>{option}</span></label>)}</div></fieldset> }
function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback } }
function defaultSelection(tab, saved) {
  if (tab === 'Tab 2' || saved?.answer !== undefined || saved?.boolean !== undefined) return { answer: ANSWERS[0], boolean: BOOLEAN_VALUES[0] }
  if (tab === 'Tab 3' || saved?.fruit !== undefined) return { fruit: FRUITS[0] }
  return { color: COLORS[0], size: SIZES[0] }
}
function normalizeSelection(tab, saved) {
  const defaults = defaultSelection(tab, saved)
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, FIELD_DEFINITIONS[key].values.includes(saved?.[key]) ? saved[key] : fallback]))
}

export default function App() {
  const prefs = useRef(loadJSON('retail-chat-prefs', {})).current
  const [tabs, setTabs] = useState(() => {
    const saved = loadJSON('retail-chat-tabs', DEFAULT_TABS)
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_TABS
  })
  const [tabSelections, setTabSelections] = useState(() => {
    const saved = loadJSON('retail-chat-tab-selections', {})
    return Object.fromEntries(tabs.map(tab => [tab, tab === 'Tab 1' && !Object.keys(saved).length
      ? { color: prefs.color || COLORS[0], size: prefs.size || SIZES[0] }
      : normalizeSelection(tab, saved[tab])]))
  })
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('retail-chat-active-tab') || DEFAULT_TABS[0])
  const [editingTab, setEditingTab] = useState(null)
  const [tabNameDraft, setTabNameDraft] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('retail-chat-sidebar-width'))
    return Number.isFinite(saved) && saved >= 180 && saved <= 600 ? saved : 220
  })
  const [model, setModel] = useState(() => MODELS.some(([id]) => id === prefs.model) ? prefs.model : MODELS[0][0])
  const [apiKey, setApiKey] = useState(localStorage.getItem('retail-chat-key') || '')
  const [endpoint, setEndpoint] = useState(localStorage.getItem('retail-chat-endpoint') || 'https://openrouter.ai/api/v1/chat/completions')
  const [contextOn, setContextOn] = useState(true)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentId, setCurrentId] = useState(null)
  const [title, setTitle] = useState('New conversation')
  const [chats, setChats] = useState(() => loadJSON('retail-chats', []))
  const [theme, setTheme] = useState(() => localStorage.getItem('retail-chat-theme') === 'light' ? 'light' : 'dark')
  const scrollRef = useRef(null)
  const sidebarRef = useRef(null)
  const controlsTriggerRef = useRef(null)
  const currentSelection = tabSelections[activeTab] || defaultSelection(activeTab)
  const currentFields = Object.keys(currentSelection).map(key => [key, FIELD_DEFINITIONS[key]]).filter(([, definition]) => definition)
  useEffect(() => localStorage.setItem('retail-chat-prefs', JSON.stringify({ model })), [model])
  useEffect(() => localStorage.setItem('retail-chat-sidebar-width', String(sidebarWidth)), [sidebarWidth])
  useEffect(() => localStorage.setItem('retail-chat-active-tab', activeTab), [activeTab])
  useEffect(() => localStorage.setItem('retail-chat-tabs', JSON.stringify(tabs)), [tabs])
  useEffect(() => localStorage.setItem('retail-chat-tab-selections', JSON.stringify(tabSelections)), [tabSelections])
  useEffect(() => {
    localStorage.setItem('retail-chat-theme', theme)
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    if (!controlsOpen) return
    const previousFocus = document.activeElement
    sidebarRef.current?.querySelector('button')?.focus()
    const closeOnEscape = event => { if (event.key === 'Escape') setControlsOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus?.()
    }
  }, [controlsOpen])

  const addTab = () => {
    const usedNumbers = new Set(tabs.map(tab => Number(tab.match(/^Tab (\d+)$/)?.[1])).filter(Number.isFinite))
    let number = 1
    while (usedNumbers.has(number)) number += 1
    const newTab = `Tab ${number}`
    setTabs(current => [...current, newTab])
    setTabSelections(current => ({ ...current, [newTab]: defaultSelection(newTab) }))
    setActiveTab(newTab)
  }
  const removeTab = tabToRemove => {
    if (tabs.length === 1) return
    const removedIndex = tabs.indexOf(tabToRemove)
    const nextTabs = tabs.filter(tab => tab !== tabToRemove)
    setTabs(nextTabs)
    setTabSelections(current => {
      const { [tabToRemove]: removed, ...rest } = current
      return rest
    })
    if (activeTab === tabToRemove) setActiveTab(nextTabs[Math.min(removedIndex, nextTabs.length - 1)])
    if (editingTab === tabToRemove) cancelRenamingTab()
  }
  const startRenamingTab = tab => {
    setEditingTab(tab)
    setTabNameDraft(tab)
  }
  const finishRenamingTab = () => {
    if (!editingTab) return
    const nextName = tabNameDraft.trim()
    if (nextName && (nextName === editingTab || !tabs.includes(nextName))) {
      setTabs(current => current.map(tab => tab === editingTab ? nextName : tab))
      setTabSelections(current => {
        const { [editingTab]: selection, ...rest } = current
        return { ...rest, [nextName]: selection || defaultSelection(nextName) }
      })
      if (activeTab === editingTab) setActiveTab(nextName)
    }
    setEditingTab(null)
    setTabNameDraft('')
  }
  const cancelRenamingTab = () => {
    setEditingTab(null)
    setTabNameDraft('')
  }

  const resizeSidebar = event => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const onMove = moveEvent => setSidebarWidth(Math.min(600, Math.max(180, startWidth + moveEvent.clientX - startX)))
    const onUp = () => {
      document.body.classList.remove('resizing-sidebar')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    document.body.classList.add('resizing-sidebar')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const resizeSidebarWithKeyboard = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') setSidebarWidth(180)
    else if (event.key === 'End') setSidebarWidth(600)
    else setSidebarWidth(width => Math.min(600, Math.max(180, width + (event.key === 'ArrowRight' ? 20 : -20))))
  }

  const handlers = useMemo(() => {
    const resolveTab = requested => {
      if (!requested) return activeTab
      const match = tabs.find(tab => tab.toLowerCase() === String(requested).toLowerCase())
      if (!match) throw new Error(`Unknown tab: ${requested}. Available tabs: ${tabs.join(', ')}`)
      return match
    }
    return {
    show_tab: args => {
      const tab = resolveTab(args.tab)
      setActiveTab(tab)
      return { success: true, activeTab: tab }
    },
    get_menu_selections: args => {
      const tab = resolveTab(args.tab)
      return { tab, ...(tabSelections[tab] || defaultSelection(tab)) }
    },
    set_menu_selections: changes => {
      const tab = resolveTab(changes.tab)
      const selection = tabSelections[tab] || defaultSelection(tab)
      const updates = Object.entries(changes).filter(([key, value]) => key !== 'tab' && value !== undefined)
      if (!updates.length) throw new Error(`No selections supplied for ${tab}`)
      for (const [key, value] of updates) {
        if (!(key in selection)) throw new Error(`${key} is not available in ${tab}`)
        if (!FIELD_DEFINITIONS[key]?.values.includes(value)) throw new Error(`Invalid ${key}: ${value}`)
      }
      const nextSelection = { ...selection, ...Object.fromEntries(updates) }
      setTabSelections(current => ({ ...current, [tab]: nextSelection }))
      return {
        success: true,
        tab,
        selection: nextSelection
      }
    }
  }}, [activeTab, tabs, tabSelections])
  const tabSummary = tabs.map(tab => {
    const selection = tabSelections[tab] || defaultSelection(tab)
    return `${tab}: ${Object.entries(selection).map(([key, value]) => `${FIELD_DEFINITIONS[key]?.label || key} ${value}`).join(', ')}`
  }).join('; ')
  const systemPrompt = `You are a concise assistant. ${contextOn ? `The active tab is ${activeTab}. Tab selections are: ${tabSummary}. A request to show, open, view, or go to a tab must use show_tab. A request naming a tab applies only to that tab. A request without a tab applies only to the active tab. Use the menu tools to make changes.` : ''}`
  const save = finished => {
    if (!finished.some(m => m.role === 'user')) return
    const id = currentId || crypto.randomUUID(), chatTitle = finished.find(m => m.role === 'user').content.slice(0, 60)
    const next = [{ id, title:chatTitle, updated:Date.now(), messages:finished }, ...chats.filter(c => c.id !== id)].slice(0, 30)
    setCurrentId(id); setTitle(chatTitle); setChats(next); localStorage.setItem('retail-chats', JSON.stringify(next))
  }
  const chat = useOpenRouterChat({ apiKey, endpoint, model, systemPrompt, tools:MENU_TOOLS, handlers, onComplete:save })
  useEffect(() => { scrollRef.current?.scrollTo({ top:scrollRef.current.scrollHeight, behavior:'smooth' }) }, [chat.messages])
  const submit = text => { if (text.trim()) { setDraft(''); chat.send(text) } }
  const newChat = () => { chat.replaceMessages([]); setCurrentId(null); setTitle('New conversation') }
  const loadChat = item => { chat.replaceMessages(item.messages); setCurrentId(item.id); setTitle(item.title); setHistoryOpen(false) }
  const deleteChat = id => { const next=chats.filter(c=>c.id!==id); setChats(next); localStorage.setItem('retail-chats',JSON.stringify(next)); if(id===currentId)newChat() }
  const exportMarkdown = () => { const body=`# ${title}\n\n${chat.messages.map(m=>`## ${m.role==='user'?'You':'Assistant'}\n\n${m.content}`).join('\n\n')}`; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([body],{type:'text/markdown'}));a.download='retail-chat.md';a.click();URL.revokeObjectURL(a.href) }
  const saveSettings = () => { localStorage.setItem('retail-chat-key',apiKey);localStorage.setItem('retail-chat-endpoint',endpoint);setSettingsOpen(false);chat.setError('') }

  return <div className="app-shell" data-theme={theme} style={{ '--sidebar-width': `${sidebarWidth}px` }}>
    <aside ref={sidebarRef} className={`sidebar${controlsOpen ? ' mobile-open' : ''}`} id="control-panel" aria-label="Selection controls">
      <div className="sidebar-heading"><b>Controls</b><button type="button" className="icon sidebar-close" onClick={()=>setControlsOpen(false)} aria-label="Close controls" title="Close controls"><X/></button></div>
      <nav className="sidebar-tabs" aria-label="Data tabs" role="tablist">
        {tabs.map(tab => <div className={`sidebar-tab${activeTab === tab ? ' active' : ''}`} role="presentation" key={tab}>{editingTab === tab
          ? <input className="tab-name-input" aria-label={`Rename ${tab}`} value={tabNameDraft} onChange={event => setTabNameDraft(event.target.value)} onBlur={finishRenamingTab} onKeyDown={event => {
              if (event.key === 'Enter') finishRenamingTab()
              if (event.key === 'Escape') cancelRenamingTab()
            }} autoFocus onFocus={event => event.target.select()}/>
          : <button type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} onDoubleClick={() => startRenamingTab(tab)} title="Double-click to rename">{tab}</button>}
          {tabs.length > 1 && editingTab !== tab && <button type="button" className="remove-tab" aria-label={`Remove ${tab}`} title={`Remove ${tab}`} onClick={() => removeTab(tab)}><X/></button>}
        </div>)}
        <button type="button" className="add-tab" aria-label="Add tab" title="Add tab" onClick={addTab}>+</button>
      </nav>
      <div className="tab-panel" role="tabpanel" aria-label={`${activeTab} controls`}>
        {currentFields.map(([key, definition]) => definition.control === 'radio'
          ? <RadioGroup key={key} label={definition.label} name={`${activeTab}-${key}`} value={currentSelection[key]} values={definition.values} onChange={value => setTabSelections(current => ({ ...current, [activeTab]: { ...currentSelection, [key]: value } }))}/>
          : <Select key={key} label={definition.label} value={currentSelection[key]} onChange={value => setTabSelections(current => ({ ...current, [activeTab]: { ...currentSelection, [key]: value } }))}>{definition.values.map(value=><option key={value}>{value}</option>)}</Select>)}
      </div>
      <Select label="Model" className="mobile-model-select" value={model} onChange={setModel}>{MODELS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select>
    </aside>
    {controlsOpen&&<button type="button" className="sidebar-backdrop" onClick={()=>setControlsOpen(false)} aria-label="Close controls"/>}
    <div className="sidebar-resizer" role="separator" aria-label="Resize left panel" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="600" aria-valuenow={sidebarWidth} tabIndex="0" onPointerDown={resizeSidebar} onKeyDown={resizeSidebarWithKeyboard}/>
    <main><header><div className="app-brand"><div className="app-brand-line"><span className="app-brand-mark"><img src={prismLogo} alt=""/></span><b>PRISM AI Chat</b></div><small className="study-title">{title}</small></div><div className="header-actions">
      <Select label="Model" className="model-select" value={model} onChange={setModel}>{MODELS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select>
      <button ref={controlsTriggerRef} type="button" className="icon controls-trigger" onClick={()=>setControlsOpen(true)} aria-label="Open controls" aria-controls="control-panel" aria-expanded={controlsOpen} title="Open controls"><PanelLeft/></button>
      <button type="button" className="icon" onClick={()=>setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark'?<Sun/>:<Moon/>}</button>
      <div className="menu-wrap"><button type="button" className="icon" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Open menu" aria-expanded={menuOpen} title="Open menu"><Menu/></button>{menuOpen&&<ActionMenu close={()=>setMenuOpen(false)} actions={{new:newChat,history:()=>setHistoryOpen(true),markdown:exportMarkdown,print:()=>print(),settings:()=>setSettingsOpen(true),clear:newChat}}/>}</div>
    </div></header>
    <section className="conversation" ref={scrollRef}>{!chat.messages.length&&<div className="welcome"><small>AI ASSISTANT</small><h1>What would you like to know?</h1><p>Your current choices are {Object.values(currentSelection).map(value => value.toLowerCase()).join(' and ')}.</p><div className="suggestions">{SUGGESTIONS.map(p=><button key={p} onClick={()=>submit(p)}>{p}</button>)}</div></div>}
      {chat.messages.map((message,index)=><Message key={index} message={message} model={MODELS.find(m=>m[0]===model)?.[1]}/>)}</section>
    <footer><div className="composer"><label className="sr-only" htmlFor="chat-prompt">Message</label><textarea id="chat-prompt" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit(draft)}}} placeholder="Ask about the selected companies…"/><div><button type="button" className="context" aria-pressed={contextOn} onClick={()=>setContextOn(!contextOn)}>Context {contextOn?'on':'off'}</button><span className="status" aria-live="polite">{chat.status==='streaming'&&<><span className="status-dot"/>Thinking</>}</span><button type="button" className="send" aria-label={chat.status==='streaming'?'Stop response':'Send message'} title={chat.status==='streaming'?'Stop response':'Send message'} onClick={()=>chat.status==='streaming'?chat.stop():submit(draft)}>{chat.status==='streaming'?<Square/>:<Send/>}</button></div></div>{chat.error&&<p className="error" role="alert">{chat.error}</p>}<small>AI can make mistakes. Check important financial figures.</small></footer>
    </main>
    {settingsOpen&&<Modal title="Connection settings" close={()=>setSettingsOpen(false)}><p>Use an OpenRouter key for streamed responses. Public deployments should proxy requests through a server.</p><label>OpenRouter API key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-or-v1-…"/></label><label>API endpoint<input value={endpoint} onChange={e=>setEndpoint(e.target.value)}/></label><div className="modal-actions"><button onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="primary" onClick={saveSettings}>Save</button></div></Modal>}
    {historyOpen&&<Modal title="Conversation history" close={()=>setHistoryOpen(false)}><p>Chats are stored locally on this device.</p><div className="history-list">{chats.length?chats.map(item=><div className="history-item" key={item.id}><button onClick={()=>loadChat(item)}><b>{item.title}</b><small>{new Date(item.updated).toLocaleString()}</small></button><button className="danger" onClick={()=>deleteChat(item.id)}><Trash2/></button></div>):<p>No conversations yet.</p>}</div></Modal>}
  </div>
}

function Message({message,model}) { return <article className={`message ${message.role}`}><div className="avatar">{message.role==='user'?<User/>:<Bot/>}</div><div className="message-body"><b>{message.role==='user'?'You':model}</b>{message.reasoning&&<details><summary>Reasoning summary</summary><p>{message.reasoning}</p></details>}{message.tools?.map((tool,i)=><details className={tool.state} key={i}><summary>{tool.state==='complete'?<Check/>:<X/>}<Wrench/> {tool.name}</summary><pre>{JSON.stringify(tool.output,null,2)}</pre></details>)}<ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{message.content}</ReactMarkdown>{message.streaming&&<span className="typing">●</span>}{message.role==='assistant'&&message.content&&<button type="button" className="copy" title="Copy response" onClick={()=>navigator.clipboard.writeText(message.content)}><Copy/> Copy</button>}</div></article> }
function ActionMenu({close,actions}) { const rows=[[Plus,'New conversation','new'],[History,'Conversation history','history'],[Download,'Export Markdown','markdown'],[Printer,'Print / save PDF','print'],[Settings,'Settings','settings'],[Trash2,'Clear conversation','clear']];return <div className="action-menu">{rows.map(([Icon,label,key])=><button key={key} className={key==='clear'?'danger':''} onClick={()=>{actions[key]();close()}}><Icon/>{label}</button>)}</div> }
function Modal({title,close,children}) {
  const modalRef=useRef(null)
  const closeRef=useRef(null)
  const onCloseRef=useRef(close)
  useEffect(()=>{onCloseRef.current=close},[close])
  useEffect(()=>{
    const previousFocus=document.activeElement
    closeRef.current?.focus()
    const onKeyDown=event=>{
      if(event.key==='Escape')onCloseRef.current()
      if(event.key!=='Tab')return
      const focusable=[...modalRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      if(!focusable.length)return
      const first=focusable[0],last=focusable[focusable.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    window.addEventListener('keydown',onKeyDown)
    return()=>{window.removeEventListener('keydown',onKeyDown);previousFocus?.focus?.()}
  },[])
  return <div className="backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label={title}><button ref={closeRef} type="button" className="modal-close" aria-label={`Close ${title}`} title={`Close ${title}`} onClick={close}><X/></button><h2>{title}</h2>{children}</section></div>
}
