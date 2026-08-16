# AI Chat Tool

This is the React example for `@ai-lca-tools/agent-state`. It demonstrates an
embedded assistant that can list, inspect, switch, and update only the panes an
application explicitly exposes to it.

## Stack

- React 19 and TypeScript
- Vite 7
- Tailwind CSS 4
- shadcn/ui (`radix-nova`) and Radix primitives
- Zustand through `@ai-lca-tools/agent-state`
- Reusable conversation engine through `@ai-lca-tools/chat-react`

## Structure

```text
src/
├── chat/                  Demo-only OpenRouter transport adapter
├── components/
│   ├── ui/                shadcn-generated primitives
│   └── ...                application components
├── panes/
│   ├── registry.ts        host-owned pane definitions and LLM contracts
│   └── runtime.ts         Zustand runtime, React hook, tools, and handlers
├── config.ts              models, storage namespace, and endpoint defaults
├── App.tsx                PRISM host shell using the reusable `useAiChat` hook
└── main.tsx               React entry point
```

## Register a pane

Add a definition to `src/panes/registry.ts`. A UI-only pane omits `llm`. A pane
that the assistant may use can provide:

- `llm.description`: what the pane represents.
- `llm.selectState`: the exact safe state the assistant may read.
- `llm.commands`: validated named actions the assistant may invoke.

Pane command handlers receive that pane's selected state API and named actions;
they do not receive Zustand's raw `setState`. The shared runtime supplies the
registered `list_panes`, `switch_pane`, and `get_pane_state` tools.

## Develop

From the repository root:

```bash
npm install
npm run dev
npm run lint
npm run check
npm test
npm run build
```

The shadcn registry is configured in `components.json`. To add a primitive:

```bash
npm exec --workspace @ai-lca-tools/ai-chat-tool -- shadcn add tooltip
```

The reusable chat package does not depend on this app's shadcn primitives. This
demo deliberately keeps its PRISM/shadcn shell and uses the package's headless
hook underneath; hosts that do not need a custom shell can use `AiChatPanel`.
The demo supplies OpenRouter as one transport implementation; a production host
should pass a backend transport instead of browser credentials.
