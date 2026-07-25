# AI Chat Window Extraction Plan

## Objective

Extract the AI chat window from
[`calvinw/llm-chat-bus-dev`](https://github.com/calvinw/llm-chat-bus-dev)
into this repository as a reusable frontend module.

The current repository is an infrastructure and development-container template
with no frontend application. The extraction should therefore introduce a
minimal frontend workspace without copying the entire source application.

## Recommended Target

Create a standalone `packages/ai-chat-window` React package with a public
interface similar to:

```jsx
<AIChatWindow
  transport={chatTransport}
  models={models}
  tools={tools}
  conversationStore={conversationStore}
  systemPrompt={systemPrompt}
  onMessage={handleMessage}
/>
```

The reusable window should own presentation and interaction state.
Authentication, API-key provisioning, persistence, MCP connectivity, and
host-specific tools should be supplied through adapters.

## Extraction Boundary

### Extract

- Conversation and message rendering
- Streaming, loading, and error states
- Prompt input and submission
- Markdown, code, and math rendering
- Tool-call rendering
- Model selector
- Clear and retry controls
- Optional suggested prompts
- Responsive chat-only layout
- Theme tokens and required styles

### Keep Outside the Core

- Supabase authentication and Google sign-in
- Supabase conversation database implementation
- OpenRouter API-key storage and provisioning
- FIT Retail-specific prompts and branding
- BusMgmt iframe and resizable split-screen layout
- Company, year, and financial-data tools
- `postMessage` iframe bridge
- MCP settings and connection management
- Markdown and PDF export during the initial extraction

## Implementation Plan

### 1. Establish the Destination Frontend

Add a minimal React 19 and Vite application or workspace package structure,
since this repository currently has no JavaScript application.

Keep the chat package independently buildable and add a small demo application
for local development.

### 2. Freeze and Document the Source Baseline

Use the following source baseline:

- Repository: `calvinw/llm-chat-bus-dev`
- Commit: `05f17f5b66dc101920a18221b00abbdd90f0d6cb`
- Commit date: June 12, 2026
- License: MIT

Preserve the upstream license and attribution.

Do not rely solely on the source README. It describes an older
`LLMChatInterface.jsx` architecture, while the current implementation is
centered on the approximately 1,614-line `src/ChatApp.jsx`.

### 3. Define Contracts Before Moving the UI

Introduce interfaces for chat transport and persistence:

```ts
interface ChatTransport {
  send(request: ChatRequest): AsyncIterable<ChatEvent>;
  cancel?(): void;
}

interface ConversationStore {
  list(): Promise<ConversationSummary[]>;
  load(id: string): Promise<Message[]>;
  save(conversation: Conversation): Promise<string>;
  delete(id: string): Promise<void>;
}
```

Define normalized types for:

- Messages
- Content parts
- Tool calls and tool results
- Models
- Errors
- Streaming events
- Conversation summaries

These contracts prevent the UI from depending directly on OpenRouter's request
or response formats.

### 4. Extract the Visual Primitives

Bring over only components reachable from the chat window:

- `conversation.jsx`
- `message.jsx`
- `prompt-input.jsx`
- `tool.jsx`
- `loader.jsx`
- Required `components/ui/*` primitives
- `lib/utils.js`
- Relevant CSS variables and Tailwind rules

Audit `prompt-input.jsx` carefully. At approximately 1,100 lines, it pulls in
several UI primitives and optional capabilities. Split its basic
textarea-and-submit path from attachments, command menus, and other advanced
controls.

### 5. Decompose `ChatApp.jsx`

Replace the source monolith with focused components:

```text
AIChatWindow
├── ChatHeader
├── MessageList
│   ├── ChatMessage
│   └── ToolCallDisplay
├── SuggestedPrompts
├── ChatComposer
└── ChatSettings
```

Move orchestration into a `useChatController` hook. The component should
receive adapters and configuration rather than importing Supabase, OpenRouter,
or MCP modules.

### 6. Adapt the Chat Engine

Refactor `useOpenRouterChat.jsx` behind `ChatTransport`.

Preserve:

- Incremental response streaming
- Parallel tool execution
- Multiple rounds of tool calls
- Error propagation
- Conversation loading and clearing

Improve during extraction:

- Add `AbortController` cancellation
- Report malformed stream events instead of silently discarding them
- Avoid mutating assistant-message objects
- Make the 20-round tool limit configurable
- Remove direct `window.location` and branding assumptions
- Keep API credentials out of the reusable UI

### 7. Add Optional Adapters

Implement these integrations separately:

- `OpenRouterTransport`
- `SupabaseConversationStore`
- `LocalStorageConversationStore`
- `MCPToolProvider`

The demo application can use OpenRouter and local storage. Supabase and MCP
should remain optional integration packages or peer modules.

### 8. Rebuild the Source Application as a Consumer

Use the extracted package to reconstruct the original experience:

```jsx
<AIChatWindow
  transport={openRouterTransport}
  conversationStore={supabaseStore}
  tools={busManagementTools}
  systemPrompt={selectedScenario.prompt}
/>
```

Keep the following concerns in the host application:

- Iframe and split-panel layout
- Iframe bridge
- Financial tools
- Authentication
- Export features
- Scenario selection

Rebuilding the source application as a consumer demonstrates that the
extraction boundary is sound.

### 9. Test and Validate

Add automated coverage for:

- Plain-text and Markdown messages
- Streaming updates
- Stream cancellation
- Tool success and failure
- Parallel tool execution
- Multiple tool rounds
- Conversation save and load
- Missing credentials
- Network and provider errors
- Keyboard submission and focus behavior
- Mobile layout and scrolling
- Accessible names
- Screen-reader status announcements

Add a fixture transport so UI tests do not require OpenRouter credentials.

## Suggested Delivery Sequence

1. **PR 1:** Frontend and package scaffolding, types, and demo shell
2. **PR 2:** UI primitives and chat-only visual component
3. **PR 3:** Transport-independent controller and fixture transport
4. **PR 4:** OpenRouter adapter with streaming and tool support
5. **PR 5:** Persistence adapters
6. **PR 6:** Host integration for iframe, MCP, and Supabase features
7. **PR 7:** Tests, accessibility, documentation, and final source comparison

## Acceptance Criteria

The extraction is complete when:

- The chat window renders without Supabase, MCP, or an iframe.
- A host can replace OpenRouter without changing UI components.
- API credentials are supplied by the host or a backend.
- Tool definitions and handlers are injected.
- Persistence can be omitted or replaced.
- The original application can consume the extracted package.
- The package contains no FIT Retail or BusMgmt-specific text.
- A clean installation can run the demo, tests, and production build.
- MIT attribution and the source commit are recorded.

## Primary Risk

The highest-risk area is not message rendering. It is disentangling
`ChatApp.jsx` from authentication, iframe tools, persistence, and API-key
provisioning.

Define the adapter contracts before copying components so that source-specific
coupling is not carried into the new package.
