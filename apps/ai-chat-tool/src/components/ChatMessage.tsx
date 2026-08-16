import { Bot, Check, Copy, User, Wrench, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import type { ChatMessage as ChatMessageValue } from '@/chat/useOpenRouterChat'
import { Button } from '@/components/ui/button'

interface ChatMessageProps {
  message: ChatMessageValue
  model: string
}

export function ChatMessage({ message, model }: ChatMessageProps) {
  return (
    <article className={`message ${message.role}`}>
      <div className="avatar">{message.role === 'user' ? <User /> : <Bot />}</div>
      <div className="message-body">
        <b>{message.role === 'user' ? 'You' : model}</b>
        {message.reasoning && <details><summary>Reasoning summary</summary><p>{message.reasoning}</p></details>}
        {message.tools?.map((tool, index) => (
          <details className={tool.state} key={`${tool.name}-${index}`}>
            <summary>{tool.state === 'complete' ? <Check /> : <X />}<Wrench /> {tool.name}</summary>
            <pre>{JSON.stringify(tool.output, null, 2)}</pre>
          </details>
        ))}
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {message.content}
        </ReactMarkdown>
        {message.streaming && <span className="typing">●</span>}
        {message.role === 'assistant' && message.content && (
          <Button
            variant="ghost"
            className="copy"
            title="Copy response"
            onClick={() => { void navigator.clipboard.writeText(message.content) }}
          >
            <Copy /> Copy
          </Button>
        )}
      </div>
    </article>
  )
}
