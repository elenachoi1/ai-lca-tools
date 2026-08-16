import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const fixture = mkdtempSync(join(tmpdir(), 'ai-lca-tools-consumer-'))
const packages = join(fixture, 'packages')

function run(command, args, cwd = repository) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

try {
  mkdirSync(packages)
  run('npm', ['run', 'build', '--workspace', '@ai-lca-tools/chat-react'])
  run('npm', ['pack', './packages/agent-state', '--pack-destination', packages])
  run('npm', ['pack', './packages/chat-react', '--pack-destination', packages])

  const archives = readdirSync(packages).map(name => join(packages, name))
  const agentState = archives.find(name => name.includes('agent-state'))
  const chatReact = archives.find(name => name.includes('chat-react'))
  if (!agentState || !chatReact) throw new Error('Expected both package archives')

  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'ai-lca-tools-consumer-smoke-test',
    private: true,
    type: 'module',
    dependencies: {
      '@ai-lca-tools/agent-state': `file:${agentState}`,
      '@ai-lca-tools/chat-react': `file:${chatReact}`,
      react: '^19.2.1',
      'react-dom': '^19.2.1',
      zustand: '^5.0.15'
    },
    devDependencies: {
      '@types/react': '^19.0.3',
      '@types/react-dom': '^19.0.2',
      typescript: '~5.7.2'
    }
  }, null, 2))
  writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true
    },
    include: ['consumer.tsx']
  }, null, 2))
  writeFileSync(join(fixture, 'consumer.tsx'), `
import { createAgentStore, createPaneRuntime } from '@ai-lca-tools/agent-state'
import { AiChatPanel, type ChatTransport } from '@ai-lca-tools/chat-react'

const store = createAgentStore({
  initialState: { activeView: 'graph', selectedNodeId: null as string | null },
  actions: ({ set }) => ({
    requestViewChange: (activeView: string) => set({ activeView }),
    selectNode: (selectedNodeId: string) => set({ selectedNodeId })
  })
})

const runtime = createPaneRuntime({
  store,
  selectActivePaneId: state => state.activeView,
  switchPane: (paneId, context) => context.actions.requestViewChange(paneId),
  panes: [{
    id: 'graph',
    selectState: state => ({ selectedNodeId: state.selectedNodeId }),
    selectActions: actions => ({ selectNode: actions.selectNode }),
    llm: { selectState: state => state }
  }]
})

const transport: ChatTransport = {
  stream: async () => ({ content: 'Ready', calls: [] })
}

export const panel = <AiChatPanel
  runtime={runtime}
  transport={transport}
  models={[["test/model", "Test model"]]}
  storageNamespace="consumer-test"
/>
`)

  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], fixture)
  const typescriptBin = join(fixture, 'node_modules', 'typescript', 'bin', 'tsc')
  run(process.execPath, [typescriptBin, '-p', 'tsconfig.json'], fixture)

  const installedAgentPackage = JSON.parse(readFileSync(join(fixture, 'node_modules/@ai-lca-tools/agent-state/package.json'), 'utf8'))
  const installedChatPackage = JSON.parse(readFileSync(join(fixture, 'node_modules/@ai-lca-tools/chat-react/package.json'), 'utf8'))
  if (!installedAgentPackage.types || !installedChatPackage.types) {
    throw new Error('Packaged consumer is missing TypeScript declarations')
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
