import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Bot, Check, ChevronDown, Copy, Download, History, Menu, Plus, Printer, Send, Settings, Square, Trash2, User, Wrench, X } from 'lucide-react'
import { useOpenRouterChat } from './useOpenRouterChat'

const COMPANIES = ['Walmart', 'Target', 'Amazon', 'Costco', "Macy's", 'Home Depot', 'Best Buy']
const YEARS = ['2024', '2023', '2022', '2021', '2020', '2019', '2018']
const MODELS = [['openai/gpt-4o-mini', 'GPT-4o mini'], ['anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'], ['google/gemini-2.0-flash-001', 'Gemini 2.0 Flash'], ['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B']]
const MODES = {
  'advanced-roa': ['ROA analysis', 'Break down ROA for these companies', 'Compare their margin and asset turnover', 'Explain high-margin vs high-turnover strategies'],
  'basic-financials': ['Financial basics', 'Walk me through the financial numbers', 'What does gross margin mean?', 'Explain the biggest difference between these companies'],
  'quiz-basic': ['Basics quiz', 'Quiz me on the displayed financial data', 'Test my knowledge of financial terms', 'Ask me five questions about these companies'],
  'quiz-roa': ['ROA quiz', 'Quiz me on ROA analysis', 'Test me on the Strategic Profit Model', 'Ask about margin vs turnover tradeoffs']
}
const DATA = { Walmart:[648125,15511,252399], Target:[107412,4138,55759], Amazon:[574785,30425,527854], Costco:[242290,6292,68994], "Macy's":[23509,105,16895], 'Home Depot':[152669,15143,76530], 'Best Buy':[43452,1241,15013] }
const TOOLS = [
  { type:'function', function:{ name:'get_selected_companies', description:'Get the current company and year selections.', parameters:{type:'object',properties:{}} } },
  { type:'function', function:{ name:'set_selected_companies', description:'Change one or more comparison dropdowns.', parameters:{type:'object',properties:{company1:{type:'string'},year1:{type:'string'},company2:{type:'string'},year2:{type:'string'}}} } },
  { type:'function', function:{ name:'get_financial_data', description:'Read the demonstration financial figures displayed for both companies.', parameters:{type:'object',properties:{}} } }
]
const initialSelection = { company1:'Walmart', year1:'2023', company2:'Target', year2:'2023' }

function Select({ label, value, onChange, children, className='' }) { return <label className={`field ${className}`}><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{children}</select><ChevronDown size={14}/></label> }
function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback } }

export default function App() {
  const prefs = useRef(loadJSON('retail-chat-prefs', {})).current
  const [selection, setSelection] = useState(prefs.selection || initialSelection)
  const [mode, setMode] = useState(prefs.mode || 'advanced-roa')
  const [model, setModel] = useState(prefs.model || MODELS[0][0])
  const [apiKey, setApiKey] = useState(localStorage.getItem('retail-chat-key') || '')
  const [endpoint, setEndpoint] = useState(localStorage.getItem('retail-chat-endpoint') || 'https://openrouter.ai/api/v1/chat/completions')
  const [contextOn, setContextOn] = useState(true)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [currentId, setCurrentId] = useState(null)
  const [title, setTitle] = useState('New conversation')
  const [chats, setChats] = useState(() => loadJSON('retail-chats', []))
  const scrollRef = useRef(null)
  useEffect(() => localStorage.setItem('retail-chat-prefs', JSON.stringify({ selection, mode, model })), [selection, mode, model])

  const setSelected = changes => setSelection(old => ({ ...old, ...Object.fromEntries(Object.entries(changes).filter(([key, value]) => key in old && (key.startsWith('year') ? YEARS : COMPANIES).includes(String(value))).map(([k,v]) => [k,String(v)])) }))
  const financial = company => ({ company, revenue:DATA[company][0], netIncome:DATA[company][1], assets:DATA[company][2], units:'USD millions', note:'Demonstration data; verify before use' })
  const handlers = useMemo(() => ({
    get_selected_companies: () => selection,
    set_selected_companies: args => { setSelected(args); return { success:true, requested:args } },
    get_financial_data: () => ({ first:{...financial(selection.company1),year:selection.year1}, second:{...financial(selection.company2),year:selection.year2} })
  // selection changes intentionally refresh tool closures
  }), [selection])
  const systemPrompt = `You are a concise financial education assistant. Mode: ${MODES[mode][0]}. ${contextOn ? `Current comparison: ${selection.company1} (${selection.year1}) and ${selection.company2} (${selection.year2}).` : ''} Explain calculations and uncertainty. Use tools for selections and figures. Never reveal private chain-of-thought; provide a short reasoning summary.`
  const save = finished => {
    if (!finished.some(m => m.role === 'user')) return
    const id = currentId || crypto.randomUUID(), chatTitle = finished.find(m => m.role === 'user').content.slice(0, 60)
    const next = [{ id, title:chatTitle, updated:Date.now(), messages:finished }, ...chats.filter(c => c.id !== id)].slice(0, 30)
    setCurrentId(id); setTitle(chatTitle); setChats(next); localStorage.setItem('retail-chats', JSON.stringify(next))
  }
  const chat = useOpenRouterChat({ apiKey, endpoint, model, systemPrompt, tools:TOOLS, handlers, onComplete:save })
  useEffect(() => { scrollRef.current?.scrollTo({ top:scrollRef.current.scrollHeight, behavior:'smooth' }) }, [chat.messages])
  const submit = text => { if (text.trim()) { setDraft(''); chat.send(text) } }
  const newChat = () => { chat.replaceMessages([]); setCurrentId(null); setTitle('New conversation') }
  const loadChat = item => { chat.replaceMessages(item.messages); setCurrentId(item.id); setTitle(item.title); setHistoryOpen(false) }
  const deleteChat = id => { const next=chats.filter(c=>c.id!==id); setChats(next); localStorage.setItem('retail-chats',JSON.stringify(next)); if(id===currentId)newChat() }
  const exportMarkdown = () => { const body=`# ${title}\n\n${chat.messages.map(m=>`## ${m.role==='user'?'You':'Assistant'}\n\n${m.content}`).join('\n\n')}`; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([body],{type:'text/markdown'}));a.download='retail-chat.md';a.click();URL.revokeObjectURL(a.href) }
  const saveSettings = () => { localStorage.setItem('retail-chat-key',apiKey);localStorage.setItem('retail-chat-endpoint',endpoint);setSettingsOpen(false);chat.setError('') }

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span><Bot size={20}/></span>Retail intelligence</div>
      <Select label="Analysis mode" value={mode} onChange={setMode}>{Object.entries(MODES).map(([key,value])=><option key={key} value={key}>{value[0]}</option>)}</Select>
      <div className="compare-card"><small>COMPARE</small><SelectionFields selection={selection} setSelection={setSelection}/><strong>{selection.company1} vs {selection.company2}</strong><p>{selection.year1} / {selection.year2}</p></div>
      <p className="privacy">Selections are available to the assistant through local tools. Your API key stays in this browser.</p>
    </aside>
    <main><header><div><b>AI research chat</b><small>{title}</small></div><div className="header-actions">
      <Select label="" className="model-select" value={model} onChange={setModel}>{MODELS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select>
      <button className="icon mobile" onClick={()=>setCompareOpen(true)} aria-label="Comparison"><ChevronDown/></button>
      <div className="menu-wrap"><button className="icon" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Menu"><Menu/></button>{menuOpen&&<ActionMenu close={()=>setMenuOpen(false)} actions={{new:newChat,history:()=>setHistoryOpen(true),markdown:exportMarkdown,print:()=>print(),settings:()=>setSettingsOpen(true),clear:newChat}}/>}</div>
    </div></header>
    <section className="conversation" ref={scrollRef}>{!chat.messages.length&&<div className="welcome"><small>FINANCIAL COPILOT</small><h1>What would you like to understand?</h1><p>Compare retailers, inspect financial performance, or test your knowledge. The assistant can read and update the selections.</p><div className="suggestions">{MODES[mode].slice(1).map(p=><button key={p} onClick={()=>submit(p)}>{p}</button>)}</div></div>}
      {chat.messages.map((message,index)=><Message key={index} message={message} model={MODELS.find(m=>m[0]===model)?.[1]}/>)}</section>
    <footer><div className="composer"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit(draft)}}} placeholder="Ask about the selected companies…"/><div><button className="context" onClick={()=>setContextOn(!contextOn)}>◎ Context {contextOn?'on':'off'}</button><span className="status">{chat.status==='streaming'&&'● Thinking'}</span><button className="send" onClick={()=>chat.status==='streaming'?chat.stop():submit(draft)}>{chat.status==='streaming'?<Square/>:<Send/>}</button></div></div>{chat.error&&<p className="error">{chat.error}</p>}<small>AI can make mistakes. Check important financial figures.</small></footer>
    </main>
    {settingsOpen&&<Modal title="Connection settings" close={()=>setSettingsOpen(false)}><p>Use an OpenRouter key for streamed responses. Public deployments should proxy requests through a server.</p><label>OpenRouter API key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-or-v1-…"/></label><label>API endpoint<input value={endpoint} onChange={e=>setEndpoint(e.target.value)}/></label><div className="modal-actions"><button onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="primary" onClick={saveSettings}>Save</button></div></Modal>}
    {historyOpen&&<Modal title="Conversation history" close={()=>setHistoryOpen(false)}><p>Chats are stored locally on this device.</p><div className="history-list">{chats.length?chats.map(item=><div className="history-item" key={item.id}><button onClick={()=>loadChat(item)}><b>{item.title}</b><small>{new Date(item.updated).toLocaleString()}</small></button><button className="danger" onClick={()=>deleteChat(item.id)}><Trash2/></button></div>):<p>No conversations yet.</p>}</div></Modal>}
    {compareOpen&&<Modal title="Choose comparison" close={()=>setCompareOpen(false)}><SelectionFields selection={selection} setSelection={setSelection}/><div className="modal-actions"><button className="primary" onClick={()=>setCompareOpen(false)}>Done</button></div></Modal>}
  </div>
}

function SelectionFields({selection,setSelection}) { return <div className="selection-fields">{[['Company one','company1',COMPANIES],['Year one','year1',YEARS],['Company two','company2',COMPANIES],['Year two','year2',YEARS]].map(([label,key,items])=><Select key={key} label={label} value={selection[key]} onChange={value=>setSelection(old=>({...old,[key]:value}))}>{items.map(x=><option key={x}>{x}</option>)}</Select>)}</div> }
function Message({message,model}) { return <article className={`message ${message.role}`}><div className="avatar">{message.role==='user'?<User/>:<Bot/>}</div><div className="message-body"><b>{message.role==='user'?'You':model}</b>{message.reasoning&&<details><summary>Reasoning summary</summary><p>{message.reasoning}</p></details>}{message.tools?.map((tool,i)=><details className={tool.state} key={i}><summary>{tool.state==='complete'?<Check/>:<X/>}<Wrench/> {tool.name}</summary><pre>{JSON.stringify(tool.output,null,2)}</pre></details>)}<ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{message.content}</ReactMarkdown>{message.streaming&&<span className="typing">●</span>}{message.role==='assistant'&&message.content&&<button className="copy" onClick={()=>navigator.clipboard.writeText(message.content)}><Copy/> Copy</button>}</div></article> }
function ActionMenu({close,actions}) { const rows=[[Plus,'New conversation','new'],[History,'Conversation history','history'],[Download,'Export Markdown','markdown'],[Printer,'Print / save PDF','print'],[Settings,'Settings','settings'],[Trash2,'Clear conversation','clear']];return <div className="action-menu">{rows.map(([Icon,label,key])=><button key={key} className={key==='clear'?'danger':''} onClick={()=>{actions[key]();close()}}><Icon/>{label}</button>)}</div> }
function Modal({title,close,children}) { return <div className="backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={close}><X/></button><h2>{title}</h2>{children}</section></div> }
