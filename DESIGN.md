# AI Chat Tool Design

## Product intent

The example should feel like a small, portable assistant shell rather than a
domain-specific application. Its left pane represents host-owned application
state; the main area shows conversation and tool activity. A host can replace
the example pane registry without rewriting the chat transport or command bus.

## Interaction model

- The pane rail contains the host application's registered tabs and controls.
- Human changes and assistant commands invoke the same named Zustand actions.
- The assistant can only discover, read, switch, or update panes with an
  explicit model-facing contract.
- Settings, conversation history, responsive navigation, and theme controls
  remain shell concerns rather than registered domain panes.

On narrow screens the pane rail becomes an overlay. On wider screens it is
resizable. Dialogs and menus use accessible Radix behavior through shadcn/ui.

## Visual system

The implementation uses Tailwind CSS 4 and shadcn/ui's `radix-nova` style. CSS
variables provide semantic color roles for both light and dark themes:

- `background` / `foreground` for the application canvas and text.
- `card`, `popover`, and `muted` for layered surfaces.
- `primary`, `secondary`, `accent`, and `destructive` for interaction states.
- `border`, `input`, and `ring` for control boundaries and focus.

Application-specific CSS handles the split-pane layout and chat presentation;
reusable controls come from `src/components/ui`. New components should use the
semantic tokens rather than fixed light- or dark-only colors.

## Component boundaries

```text
App shell
├── registered pane rail
│   └── host controls backed by pane actions
├── conversation
│   ├── message rendering
│   ├── suggestions
│   └── composer
└── shell overlays
    ├── action menu
    ├── settings dialog
    └── history dialog
```

The shadcn primitives are source-owned components, so applications may adapt
their markup and styles while retaining consistent accessibility behavior.

## Accessibility

- All icon-only actions require accessible labels and titles where useful.
- Pane switching uses tab semantics; pane content uses a tabpanel.
- The resize separator supports pointer and keyboard input.
- Radix controls provide focus management and keyboard navigation.
- Focus indicators must remain visible in light and dark themes.
