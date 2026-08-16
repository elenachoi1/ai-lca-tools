# Local Development in VS Code

## Prerequisites

- Git
- A current Node.js release with npm
- VS Code

## Open the workspace

```bash
git clone <repository-url> ai-lca-tools
cd ai-lca-tools
code .
```

Install dependencies from the repository root:

```bash
npm install
```

## Run the application

```bash
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. The launcher script
is also available:

```bash
./start-dev-server.sh
```

To change its network binding:

```bash
HOST=127.0.0.1 PORT=4173 ./start-dev-server.sh
```

## Verify changes

```bash
npm run lint
npm run check
npm test
npm run build
```

## Optional shadcn MCP

The app's component registry works without an MCP. If Claude Code, Codex, or
OpenCode is installed locally and you want agent access to the shadcn registry,
run:

```bash
npm run setup:local-mcps
```

This updates supported local agent configuration. OpenCode's repository config
is already stored in `opencode.json`.
