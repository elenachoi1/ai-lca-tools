# AI LCA Tools

A reusable, host-configured bridge between an embedded AI chat and application
state. The example lets an LLM list, inspect, switch, and update only the panes
that the host application explicitly registers.

## Workspace

```text
apps/
└── ai-chat-tool/        React application and registered-pane example
packages/
└── agent-state/         Zustand store, command bus, and pane runtime
```

The UI stack is React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui with
Radix primitives, and Lucide icons. `@ai-lca-tools/agent-state` uses Zustand as
its state engine and exposes optional React bindings.

## How pane access works

The host owns every pane definition. A pane is invisible to the model unless it
has an explicit `llm` contract:

```text
Human control ─┐
               ├─> named pane action ─> Zustand ─> subscribed UI
LLM tool call ─┘
      ↑
registered schema, safe state selector, validation, and confirmation policy
```

This keeps the integration portable. Each host application registers its panes
at startup and chooses:

- Which panes the model can discover and switch to.
- Which state from each pane the model can read.
- Which validated, named actions the model can invoke.
- Which commands require host-controlled confirmation.

The model does not receive Zustand's raw `setState`, and a new UI pane does not
become model-accessible until the host registers an `llm` contract for it.

The example integration point is
[`apps/ai-chat-tool/src/panes/registry.ts`](./apps/ai-chat-tool/src/panes/registry.ts).
The reusable API is documented in
[`packages/agent-state`](./packages/agent-state).

## Get started

Requires a current Node.js release with npm.

```bash
npm install
npm run lint
npm run check
npm test
npm run dev
```

The development server defaults to `http://localhost:5173`. You can also run
`./start-dev-server.sh`; override `HOST` or `PORT` when needed.

Add an OpenRouter API key through **Settings** in the example. The key is kept
in browser local storage for local development. A production host should keep
provider credentials on a backend and proxy model requests.

## shadcn/ui

The app uses the `radix-nova` shadcn style. Its registry configuration is
[`apps/ai-chat-tool/components.json`](./apps/ai-chat-tool/components.json), and
generated primitives live in `apps/ai-chat-tool/src/components/ui`.

Add another primitive from the app workspace:

```bash
npm exec --workspace @ai-lca-tools/ai-chat-tool -- shadcn add tooltip
```

The repository also contains a local shadcn MCP configuration for OpenCode.
To register the same MCP with installed Claude Code and Codex CLIs, run:

```bash
npm run setup:local-mcps
```

Google Stitch skills and shadcn are separate integrations. Stitch can help
produce or translate designs; shadcn's CLI, component registry, and MCP provide
the code components used by this application.

## Useful commands

```bash
npm run dev                 # start the example
npm run lint                # ESLint for TypeScript and React
npm run check               # TypeScript and package source checks
npm test                    # agent-state tests
npm run build               # production app build
npm run setup:local-mcps    # register the local shadcn MCP where supported
```
