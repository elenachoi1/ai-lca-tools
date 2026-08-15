# General Agent State Plan

## Objective

Provide a reusable Zustand-based state and command package inside this repository. It must work across different applications and panels without containing retail-chat, LCA, React-component, or other product-specific assumptions.

The shared architecture is:

```text
Human UI action ─┐
                 ├─> named application action ─> Zustand ─> subscribed consumers
LLM command ─────┘
       ↑
validation, availability checks, confirmation, and audit history
```

Applications supply their own state shape, actions, selectors, validators, and commands. The package supplies state creation, safe persistence, the LLM command boundary, confirmation lifecycle, and optional React bindings.

## Package Boundary

The implementation lives in `packages/agent-state` and is independently installable and testable.

```text
packages/agent-state/
├── src/
│   ├── createAgentStore.js
│   ├── createCommandBus.js
│   ├── storage.js
│   ├── react.js
│   └── index.js
├── test/
├── README.md
└── package.json
```

The default export surface does not import React. React applications use the separate `@ai-lca-tools/agent-state/react` entry point.

## State Store

`createAgentStore` accepts:

- `initialState`: application-owned data
- `actions`: a factory for named and validated application actions
- `persistence`: optional, explicitly selected persistence configuration

The resulting vanilla Zustand state contains:

```js
{
  data: applicationState,
  meta: { revision: 0 },
  actions: applicationActions
}
```

Actions receive a restricted API:

- `get()`: current application data
- `getRevision()`: current revision
- `set(update, replace?)`: update application data and increment the revision

The application should keep business rules in named actions. Human controls and LLM commands call those same actions, preventing two competing mutation paths.

## State Ownership

Good shared state includes:

- Active panels or views
- Cross-panel selections
- Shared filters
- Loaded domain data
- Calculation or request status
- Conversation state used by multiple surfaces
- User preferences needed across sessions

Keep these outside shared state unless the host has a specific reason:

- DOM nodes and refs
- Abort controllers and stream readers
- Hover and animation state
- Unsubmitted form drafts owned by one component
- Credentials and secrets

## LLM Command Bus

`createCommandBus` maps model-facing command names to application-defined execution functions. A command may specify:

- Model-facing description
- JSON Schema parameters
- Runtime validation and normalization
- Availability rules
- Risk category
- Confirmation summary
- Execution function

The execution context contains current data, named actions, revision information, and read-only getters. It deliberately excludes Zustand's raw `setState`.

The public result statuses are:

- `completed`
- `confirmation_required`
- `rejected`
- `error`

Errors contain stable codes so UI and model adapters do not need to parse error text.

## Confirmations

Commands marked `mutation`, `external`, or `destructive` require confirmation by default. Applications can configure the risk set or mark an individual command with `confirm: true`.

The initial execution creates a pending proposal with:

- Unique confirmation ID
- Command and validated arguments
- User-facing summary
- Source
- Creation time
- Application revision

Only `commandBus.confirm(id)` can execute the proposal. There is no public execution option that bypasses confirmation.

By default, confirmation fails if application state changed after the proposal. A command may allow intervening state changes when its own action performs sufficient revalidation.

## Context and Tool Definitions

Applications provide a `contextSelector` that exposes only the state appropriate for the model:

```js
const commandBus = createCommandBus({
  store,
  contextSelector: state => ({
    activePanel: state.activePanel,
    selectedId: state.selectedId
  }),
  commands
})
```

`commandBus.getContext()` returns that safe projection. Detailed or sensitive data should be accessed through specific query commands.

`commandBus.getToolDefinitions()` produces OpenAI-compatible function definitions from the same command configuration used for validation and execution.

## Persistence

Persistence is opt-in and requires an explicit `select` function. This makes it difficult to accidentally persist secrets, request state, transient errors, or full conversations.

```js
persistence: {
  name: 'application-preferences',
  version: 1,
  storage,
  select: state => ({
    theme: state.theme,
    panelSizes: state.panelSizes
  })
}
```

Browser JSON storage and in-memory test storage helpers are provided. Hosts own schema migrations and custom merge behavior.

## React Integration

`createStoreHook(store)` binds any vanilla store to React. Panels should use narrow selectors:

```js
const selectedId = useAppStore(state => state.data.selectedId)
const selectRecord = useAppStore(state => state.actions.selectRecord)
```

`createCommandRuntimeHook(commandBus)` gives confirmation and audit panels reactive access to command runtime state.

Other frameworks can use the vanilla `getState` and `subscribe` methods without React.

## Verification

Automated tests must cover:

- Named action updates and revision tracking
- Isolation between store instances
- Invalid state updates
- Explicit persistence selection
- Successful validated command execution
- Invalid and unknown commands
- Mandatory command executors
- Confirmation requirements and rejection
- Inability to bypass confirmation through execution options
- Stale confirmation protection
- Tool definition and context generation

The package is complete when its test suite and syntax checks pass independently and its README documents vanilla, React, command, confirmation, and persistence usage.
