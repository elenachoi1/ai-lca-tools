import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Bot, Check, ChevronDown, Copy, Download, History, Menu, Plus, Printer, Send, Settings, Square, Trash2, User, Wrench, X } from 'lucide-react'
import { useOpenRouterChat } from './useOpenRouterChat'

const COLORS = ['Red', 'Green', 'Blue']
const SIZES = ['Small', 'Medium', 'Large']
const DEFAULT_TABS = ['Tab 1', 'Tab 2', 'Tab 3']
const MODELS = [['openai/gpt-4o-mini', 'GPT-4o mini'], ['anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'], ['google/gemini-2.0-flash-001', 'Gemini 2.0 Flash'], ['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B']]
const SUGGESTIONS = ['Tell me about my choices', 'Suggest something that fits', 'What can I do with these options?']
const MENU_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_menu_selections',
      description: 'Get the color and size selected in a specific tab. Omit tab to read the active tab.',
      parameters: { type: 'object', properties: { tab: { type: 'string', description: 'Tab name, such as Tab 2.' } }, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_menu_selections',
      description: 'Change one or both selections in exactly one tab. Omit tab to change only the active tab.',
      parameters: {
        type: 'object',
        properties: {
          tab: { type: 'string', description: 'Tab name to update, such as Tab 2. Defaults to the active tab.' },
          color: { type: 'string', enum: COLORS },
          size: { type: 'string', enum: SIZES }
        },
        additionalProperties: false
      }
    }
  }
]

function Select({ label, value, onChange, children, className='' }) { return <label className={`field ${className}`}><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{children}</select><ChevronDown size={14}/></label> }
function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback } }

export default function App() {
  const prefs = useRef(loadJSON('retail-chat-prefs', {})).current
  const [tabs, setTabs] = useState(() => {
    const saved = loadJSON('retail-chat-tabs', DEFAULT_TABS)
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_TABS
  })
  const [tabSelections, setTabSelections] = useState(() => {
    const saved = loadJSON('retail-chat-tab-selections', {})
    return Object.keys(saved).length ? saved : Object.fromEntries(DEFAULT_TABS.map(tab => [tab, { color: prefs.color || COLORS[0], size: prefs.size || SIZES[0] }]))
  })
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('retail-chat-active-tab') || DEFAULT_TABS[0])
  const [editingTab, setEditingTab] = useState(null)
  const [tabNameDraft, setTabNameDraft] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('retail-chat-sidebar-width'))
    return Number.isFinite(saved) && saved >= 180 && saved <= 600 ? saved : 220
  })
  const [model, setModel] = useState(prefs.model || MODELS[0][0])
  const [apiKey, setApiKey] = useState(localStorage.getItem('retail-chat-key') || '')
  const [endpoint, setEndpoint] = useState(localStorage.getItem('retail-chat-endpoint') || 'https://openrouter.ai/api/v1/chat/completions')
  const [contextOn, setContextOn] = useState(true)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentId, setCurrentId] = useState(null)
  const [title, setTitle] = useState('New conversation')
  const [chats, setChats] = useState(() => loadJSON('retail-chats', []))
  const scrollRef = useRef(null)
  const currentSelection = tabSelections[activeTab] || { color: COLORS[0], size: SIZES[0] }
  const { color, size } = currentSelection
  useEffect(() => localStorage.setItem('retail-chat-prefs', JSON.stringify({ model })), [model])
  useEffect(() => localStorage.setItem('retail-chat-sidebar-width', String(sidebarWidth)), [sidebarWidth])
  useEffect(() => localStorage.setItem('retail-chat-active-tab', activeTab), [activeTab])
  useEffect(() => localStorage.setItem('retail-chat-tabs', JSON.stringify(tabs)), [tabs])
  useEffect(() => localStorage.setItem('retail-chat-tab-selections', JSON.stringify(tabSelections)), [tabSelections])

  const addTab = () => {
    const usedNumbers = new Set(tabs.map(tab => Number(tab.match(/^Tab (\d+)$/)?.[1])).filter(Number.isFinite))
    let number = 1
    while (usedNumbers.has(number)) number += 1
    const newTab = `Tab ${number}`
    setTabs(current => [...current, newTab])
    setTabSelections(current => ({ ...current, [newTab]: { color: COLORS[0], size: SIZES[0] } }))
    setActiveTab(newTab)
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
        return { ...rest, [nextName]: selection || { color: COLORS[0], size: SIZES[0] } }
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
    get_menu_selections: args => {
      const tab = resolveTab(args.tab)
      return { tab, ...(tabSelections[tab] || { color: COLORS[0], size: SIZES[0] }) }
    },
    set_menu_selections: changes => {
      const tab = resolveTab(changes.tab)
      const selection = tabSelections[tab] || { color: COLORS[0], size: SIZES[0] }
      if (changes.color !== undefined) {
        if (!COLORS.includes(changes.color)) throw new Error(`Invalid color: ${changes.color}`)
      }
      if (changes.size !== undefined) {
        if (!SIZES.includes(changes.size)) throw new Error(`Invalid size: ${changes.size}`)
      }
      const nextSelection = { color: changes.color ?? selection.color, size: changes.size ?? selection.size }
      setTabSelections(current => ({ ...current, [tab]: nextSelection }))
      return {
        success: true,
        tab,
        selection: nextSelection
      }
    }
  }}, [activeTab, tabs, tabSelections])
  const tabSummary = tabs.map(tab => `${tab}: ${tabSelections[tab]?.color || COLORS[0]}, ${tabSelections[tab]?.size || SIZES[0]}`).join('; ')
  const systemPrompt = `You are a concise assistant. ${contextOn ? `The active tab is ${activeTab}. Tab selections are: ${tabSummary}. A request naming a tab applies only to that tab. A request without a tab applies only to the active tab. Use the menu tools to make changes.` : ''}`
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

  return <div className="app-shell" style={{ '--sidebar-width': `${sidebarWidth}px` }}>
    <aside className="sidebar">
      <nav className="sidebar-tabs" aria-label="Data tabs" role="tablist">
        {tabs.map(tab => editingTab === tab
          ? <input key={tab} className="tab-name-input" aria-label={`Rename ${tab}`} value={tabNameDraft} onChange={event => setTabNameDraft(event.target.value)} onBlur={finishRenamingTab} onKeyDown={event => {
              if (event.key === 'Enter') finishRenamingTab()
              if (event.key === 'Escape') cancelRenamingTab()
            }} autoFocus onFocus={event => event.target.select()}/>
          : <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} onDoubleClick={() => startRenamingTab(tab)} title="Double-click to rename">{tab}</button>)}
        <button type="button" className="add-tab" aria-label="Add tab" title="Add tab" onClick={addTab}>+</button>
      </nav>
      <div className="tab-panel" role="tabpanel" aria-label={`${activeTab} controls`}>
        <Select label="Color" value={color} onChange={value => setTabSelections(current => ({ ...current, [activeTab]: { ...currentSelection, color: value } }))}>{COLORS.map(value=><option key={value}>{value}</option>)}</Select>
        <Select label="Size" value={size} onChange={value => setTabSelections(current => ({ ...current, [activeTab]: { ...currentSelection, size: value } }))}>{SIZES.map(value=><option key={value}>{value}</option>)}</Select>
      </div>
    </aside>
    <div className="sidebar-resizer" role="separator" aria-label="Resize left panel" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="600" aria-valuenow={sidebarWidth} tabIndex="0" onPointerDown={resizeSidebar} onKeyDown={resizeSidebarWithKeyboard}/>
    <main><header><div><b>AI research chat</b><small>{title}</small></div><div className="header-actions">
      <Select label="" className="model-select" value={model} onChange={setModel}>{MODELS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select>
      <div className="menu-wrap"><button className="icon" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Menu"><Menu/></button>{menuOpen&&<ActionMenu close={()=>setMenuOpen(false)} actions={{new:newChat,history:()=>setHistoryOpen(true),markdown:exportMarkdown,print:()=>print(),settings:()=>setSettingsOpen(true),clear:newChat}}/>}</div>
    </div></header>
    <section className="conversation" ref={scrollRef}>{!chat.messages.length&&<div className="welcome"><small>AI ASSISTANT</small><h1>What would you like to know?</h1><p>Your current choices are {color.toLowerCase()} and {size.toLowerCase()}.</p><div className="suggestions">{SUGGESTIONS.map(p=><button key={p} onClick={()=>submit(p)}>{p}</button>)}</div></div>}
      {chat.messages.map((message,index)=><Message key={index} message={message} model={MODELS.find(m=>m[0]===model)?.[1]}/>)}</section>
    <footer><div className="composer"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit(draft)}}} placeholder="Ask about the selected companies…"/><div><button className="context" onClick={()=>setContextOn(!contextOn)}>◎ Context {contextOn?'on':'off'}</button><span className="status">{chat.status==='streaming'&&'● Thinking'}</span><button className="send" onClick={()=>chat.status==='streaming'?chat.stop():submit(draft)}>{chat.status==='streaming'?<Square/>:<Send/>}</button></div></div>{chat.error&&<p className="error">{chat.error}</p>}<small>AI can make mistakes. Check important financial figures.</small></footer>
    </main>
    {settingsOpen&&<Modal title="Connection settings" close={()=>setSettingsOpen(false)}><p>Use an OpenRouter key for streamed responses. Public deployments should proxy requests through a server.</p><label>OpenRouter API key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-or-v1-…"/></label><label>API endpoint<input value={endpoint} onChange={e=>setEndpoint(e.target.value)}/></label><div className="modal-actions"><button onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="primary" onClick={saveSettings}>Save</button></div></Modal>}
    {historyOpen&&<Modal title="Conversation history" close={()=>setHistoryOpen(false)}><p>Chats are stored locally on this device.</p><div className="history-list">{chats.length?chats.map(item=><div className="history-item" key={item.id}><button onClick={()=>loadChat(item)}><b>{item.title}</b><small>{new Date(item.updated).toLocaleString()}</small></button><button className="danger" onClick={()=>deleteChat(item.id)}><Trash2/></button></div>):<p>No conversations yet.</p>}</div></Modal>}
  </div>
}

function Message({message,model}) { return <article className={`message ${message.role}`}><div className="avatar">{message.role==='user'?<User/>:<Bot/>}</div><div className="message-body"><b>{message.role==='user'?'You':model}</b>{message.reasoning&&<details><summary>Reasoning summary</summary><p>{message.reasoning}</p></details>}{message.tools?.map((tool,i)=><details className={tool.state} key={i}><summary>{tool.state==='complete'?<Check/>:<X/>}<Wrench/> {tool.name}</summary><pre>{JSON.stringify(tool.output,null,2)}</pre></details>)}<ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{message.content}</ReactMarkdown>{message.streaming&&<span className="typing">●</span>}{message.role==='assistant'&&message.content&&<button className="copy" onClick={()=>navigator.clipboard.writeText(message.content)}><Copy/> Copy</button>}</div></article> }
function ActionMenu({close,actions}) { const rows=[[Plus,'New conversation','new'],[History,'Conversation history','history'],[Download,'Export Markdown','markdown'],[Printer,'Print / save PDF','print'],[Settings,'Settings','settings'],[Trash2,'Clear conversation','clear']];return <div className="action-menu">{rows.map(([Icon,label,key])=><button key={key} className={key==='clear'?'danger':''} onClick={()=>{actions[key]();close()}}><Icon/>{label}</button>)}</div> }
function Modal({title,close,children}) { return <div className="backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={close}><X/></button><h2>{title}</h2>{children}</section></div> }
