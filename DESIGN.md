# AI Chat Tool Design

## Purpose

This repository demonstrates a portable AI chat connected to host-owned
application state. The example panes exist only to show the integration. A host
application defines its own panes, readable state, actions, and layout.

## Core behavior

- Human controls and assistant commands use the same named Zustand actions.
- Only explicitly registered panes are visible to the assistant.
- Each pane chooses the exact state the assistant may read.
- Each assistant action has a schema, validation, and risk policy.
- The assistant never receives unrestricted Zustand mutation access.

## UI boundaries

The reusable `@ai-lca-tools/chat-react` UI is responsible for messages,
streaming, tool activity, the composer, model selection, history, stop behavior,
and confirmation presentation. The host application is responsible for its
domain state, pane registry, placement of the chat, provider transport,
credentials, and confirmation policy.

The example uses a resizable pane rail and conversation area. The reusable panel
does not require that shell; other applications may present it as a sidebar,
drawer, dialog, tab, or embedded panel.

## Visual system

The example uses React, Tailwind CSS 4, and shadcn/ui with Radix primitives.
Components use semantic CSS variables so light and dark themes can be replaced
by a host theme. Application-specific layout styles should remain separate from
reusable chat components.

## Accessibility

- Icon-only actions have accessible names.
- Interactive controls support keyboard navigation and visible focus.
- Dialogs and menus use accessible Radix behavior.
- Status and error messages are announced where appropriate.
- Responsive layouts preserve access to the chat and registered controls.
