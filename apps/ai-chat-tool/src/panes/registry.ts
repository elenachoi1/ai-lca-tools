import type {
  NamedActions,
  PaneDefinition,
  PlainState
} from '@ai-lca-tools/agent-state'

const COLORS = ['Red', 'Green', 'Blue']
const SIZES = ['Small', 'Medium', 'Large']
const ANSWERS = ['Yes', 'No', 'Maybe']
const BOOLEAN_VALUES = ['True', 'False']
const FRUITS = ['Apple', 'Orange', 'Banana']

export interface PaneFieldDefinition {
  label: string
  values: string[]
  control: 'select' | 'radio'
  description?: string
}

export type SelectionPaneState = Record<string, string>

export interface SelectionPaneActions extends NamedActions {
  setValues(updates: Record<string, string | undefined>): void
}

export interface SelectionPaneDefinition extends PaneDefinition<SelectionPaneState, SelectionPaneActions> {
  fields: Record<string, PaneFieldDefinition>
  suggestions: string[]
}

interface SelectionPaneOptions {
  id: string
  title: string
  description: string
  fields: Record<string, PaneFieldDefinition>
  suggestions?: string[]
}

function createSelectionPane({
  id,
  title,
  description,
  fields,
  suggestions = []
}: SelectionPaneOptions): SelectionPaneDefinition {
  const initialState = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.values[0]])
  )
  const commandName = `set_${id}_state`

  return {
    id,
    title,
    description,
    fields,
    suggestions,
    initialState,

    actions: ({ get, set }) => ({
      setValues: updates => {
        const entries = Object.entries(updates).filter((entry): entry is [string, string] => (
          entry[1] !== undefined
        ))
        if (!entries.length) throw new Error(`No values supplied for ${title}`)

        for (const [key, value] of entries) {
          const field = fields[key]
          if (!field) throw new Error(`${key} is not available in ${title}`)
          if (!field.values.includes(value)) throw new Error(`Invalid ${key}: ${value}`)
        }

        set({ ...get(), ...Object.fromEntries(entries) }, true)
      }
    }),

    // Omitting this object makes a pane completely invisible to the LLM.
    llm: {
      description,
      selectState: state => ({ ...state }),
      commands: {
        [commandName]: {
          description: `Change one or more registered values in the ${title} pane.`,
          parameters: {
            type: 'object',
            properties: Object.fromEntries(Object.entries(fields).map(([key, field]) => [
              key,
              { type: 'string', enum: field.values, description: field.description || field.label }
            ])),
            additionalProperties: false
          },
          risk: 'ui',
          validate: (args: PlainState) => {
            const updates = Object.entries(args).filter((entry): entry is [string, string] => (
              typeof entry[1] === 'string'
            ))
            if (!updates.length) throw new Error(`No values supplied for ${title}`)
            for (const [key, value] of updates) {
              if (!fields[key]?.values.includes(value)) throw new Error(`Invalid ${key}: ${value}`)
            }
            return args
          },
          execute: (args, context) => {
            const updates = Object.fromEntries(
              Object.entries(args).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            )
            context.actions.setValues(updates)
            return { paneId: id, state: context.getState() }
          }
        }
      }
    }
  }
}

// This is the application integration point. A host registers its panes once
// at startup and explicitly chooses the state and actions each pane exposes.
export const paneDefinitions: SelectionPaneDefinition[] = [
  createSelectionPane({
    id: 'appearance',
    title: 'Appearance',
    description: 'Visual style choices for the example.',
    fields: {
      color: { label: 'Color', values: COLORS, control: 'select' },
      size: { label: 'Size', values: SIZES, control: 'select' }
    },
    suggestions: [
      'Switch to the Response pane and set the answer to Maybe',
      'Open the Fruit pane and choose Banana'
    ]
  }),
  createSelectionPane({
    id: 'response',
    title: 'Response',
    description: 'Example answer and boolean settings.',
    fields: {
      answer: { label: 'Answer', values: ANSWERS, control: 'select' },
      boolean: { label: 'Boolean', values: BOOLEAN_VALUES, control: 'select' }
    },
    suggestions: [
      'Switch to the Appearance pane and set the color to Blue and size to Large',
      'Open the Fruit pane and choose Orange'
    ]
  }),
  createSelectionPane({
    id: 'fruit',
    title: 'Fruit',
    description: 'A single-choice fruit example.',
    fields: {
      fruit: { label: 'Fruit', values: FRUITS, control: 'radio' }
    },
    suggestions: [
      'Switch to the Appearance pane and set the color to Green and size to Small',
      'Open the Response pane and set the answer to No and boolean to True'
    ]
  })
]
