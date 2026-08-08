import { useCallback, useRef, useState } from 'react'

const MAX_TOOL_ROUNDS = 20

export function useOpenRouterChat({ apiKey, endpoint, model, systemPrompt, tools, handlers, onComplete }) {
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  const stream = useCallback(async (apiMessages) => {
    const response = await fetch(endpoint, {
      method: 'POST', signal: abortRef.current.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': location.href, 'X-Title': 'Retail AI Chat' },
      body: JSON.stringify({ model, messages: apiMessages, tools, tool_choice: 'auto', stream: true })
    })
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`)
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let buffer = '', content = '', reasoning = '', calls = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n'); buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta || {}
          content += delta.content || ''; reasoning += delta.reasoning || ''
          for (const part of delta.tool_calls || []) {
            const call = calls[part.index] ||= { id: '', type: 'function', function: { name: '', arguments: '' } }
            call.id = part.id || call.id
            call.function.name += part.function?.name || ''
            call.function.arguments += part.function?.arguments || ''
          }
          setMessages(old => old.map((m, i) => i === old.length - 1 ? { ...m, content, reasoning } : m))
        } catch { /* incomplete SSE data */ }
      }
    }
    return { content, reasoning, calls: calls.filter(Boolean) }
  }, [apiKey, endpoint, model, tools])

  const send = useCallback(async text => {
    if (!text.trim() || status === 'streaming') return
    if (!apiKey) { setError('Add an OpenRouter API key in Settings.'); return }
    const user = { role: 'user', content: text.trim() }
    let ui = [...messages, user, { role: 'assistant', content: '', streaming: true }]
    setMessages(ui); setError(''); setStatus('streaming'); abortRef.current = new AbortController()
    const api = [{ role: 'system', content: systemPrompt }, ...messages.map(({ role, content }) => ({ role, content })), user]
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await stream(api)
        const toolViews = []
        ui = ui.map((m, i) => i === ui.length - 1 ? { ...m, ...result, streaming: false, toolCalls: undefined } : m)
        setMessages(ui)
        if (!result.calls.length) break
        api.push({ role: 'assistant', content: result.content || null, tool_calls: result.calls })
        for (const call of result.calls) {
          let args = {}; try { args = JSON.parse(call.function.arguments || '{}') } catch { /* empty args */ }
          try {
            const output = await handlers[call.function.name]?.(args)
            if (output === undefined) throw new Error(`Unknown tool: ${call.function.name}`)
            toolViews.push({ name: call.function.name, input: args, output, state: 'complete' })
            api.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
          } catch (toolError) {
            toolViews.push({ name: call.function.name, input: args, output: toolError.message, state: 'error' })
            api.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: toolError.message }) })
          }
        }
        ui = ui.map((m, i) => i === ui.length - 1 ? { ...m, tools: toolViews } : m)
        ui.push({ role: 'assistant', content: '', streaming: true })
        setMessages(ui)
      }
      setMessages(current => { onComplete?.(current); return current })
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message)
      setMessages(old => old.map(m => m.streaming ? { ...m, streaming: false } : m))
    } finally { setStatus('idle'); abortRef.current = null }
  }, [apiKey, handlers, messages, onComplete, status, stream, systemPrompt])

  const stop = () => abortRef.current?.abort()
  const replaceMessages = value => setMessages(value)
  return { messages, status, error, setError, send, stop, replaceMessages }
}
