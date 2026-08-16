import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import './index.css'
import './chat-shell.css'
import './resizable-sidebar.css'
import './theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(<StrictMode><App /></StrictMode>)
