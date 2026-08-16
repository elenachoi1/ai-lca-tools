export const STORAGE_PREFIX = 'ai-chat-tool'

export const MODELS = [
  ['openai/gpt-4o-mini', 'GPT-4o mini'],
  ['openai/gpt-5.6-luna', 'GPT-5.6 Luna']
] as const

export const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export function storageKey(name: string) {
  return `${STORAGE_PREFIX}:${name}`
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : JSON.parse(stored) as T
  } catch {
    return fallback
  }
}
