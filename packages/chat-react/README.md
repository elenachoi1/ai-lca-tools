# `@ai-lca-tools/chat-react`

Reusable React conversation UI for a host-registered tool runtime. The package
owns conversation rendering, history, model selection, streaming tool rounds,
stop behavior, and confirmation presentation. The host owns application state,
tool registration, placement, provider credentials, and model transport.

```tsx
import { AiChatPanel } from '@ai-lca-tools/chat-react'
import '@ai-lca-tools/chat-react/styles.css'

<AiChatPanel
  runtime={productGraphRuntime}
  models={[
    ['openai/gpt-4o-mini', 'GPT-4o mini'],
    ['openai/gpt-5.6-luna', 'GPT-5.6 Luna']
  ]}
  transport={productGraphTransport}
  storageNamespace="product-graph-editor"
/>
```

`transport.stream` receives model messages, OpenAI-compatible tool definitions,
an abort signal, and an `onDelta` callback. It returns the final content,
optional reasoning, and normalized tool calls. This keeps provider credentials
and wire protocols outside the component.

Importing `styles.css` provides a small standalone layout. Hosts can omit it and
style the stable `ai-chat-*` classes with their own design system.
