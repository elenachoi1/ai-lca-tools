# Repository Guide

## Purpose

This workspace provides a generic embedded AI chat and a reusable Zustand-based
command layer. Host applications register pane visibility, readable state, and
named model actions at startup. Do not expose raw store mutation to a model.

## Layout

```text
apps/ai-chat-tool/          React 19 + TypeScript + Vite example
packages/agent-state/       Framework-neutral Zustand runtime and command bus
scripts/                    Local development setup helpers
```

The original planning documents are `Plan.md`, `PLAN.local.md`, and
`zustand_plan.md`. Treat them as historical input; keep current behavior in the
README files and source code.

## Commands

Run commands from the repository root:

```bash
npm install
npm run dev
npm run lint
npm run check
npm test
npm run build
```

`./start-dev-server.sh` is an alternative launcher and accepts `HOST` and
`PORT`. `npm run setup:local-mcps` registers the repository-local shadcn MCP for
installed Claude Code and Codex CLIs; OpenCode reads `opencode.json` directly.

## Architecture rules

- Register panes in `apps/ai-chat-tool/src/panes/registry.ts`.
- Omit a pane's `llm` object when it must remain invisible to the model.
- Expose the smallest useful state shape through `llm.selectState`.
- Implement changes as validated named commands, not arbitrary Zustand writes.
- Keep provider credentials off the frontend in production deployments.
- Keep reusable state code domain-neutral and independent from React where
  possible; React bindings belong in the package's `/react` export.

## UI conventions

The app uses Tailwind CSS 4 and shadcn/ui with the `radix-nova` style. Reuse
primitives from `apps/ai-chat-tool/src/components/ui` and semantic theme tokens.
Add new registry components through the workspace-local shadcn CLI rather than
copying component code manually.
