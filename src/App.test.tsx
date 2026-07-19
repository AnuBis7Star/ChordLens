import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ effects: [] as Array<{ effect: () => void; dependencies?: unknown[] }> }))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useEffect: (effect: () => void, dependencies?: unknown[]) => hooks.effects.push({ effect, dependencies }),
    useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()],
  }
})

import App from './App'

const storage = new Map<string, string>()

type TestProps = { children?: ReactNode; className?: string; role?: string; onClick?: () => void }

function elements(node: ReactNode): Array<ReactElement<TestProps>> {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<TestProps>(node)) return []
  return [node, ...elements(node.props.children)]
}

beforeEach(() => {
  hooks.effects = []
  storage.clear()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  })
})

describe('ChordLens key control', () => {
  it('loads the saved key when the controlled pair is omitted', () => {
    storage.set('test:preferences', JSON.stringify({ keySignature: 'Ebm' }))
    const tree = App({ preferencesKey: 'test:preferences' })
    const keyButton = elements(tree).find((element) => element.props.className === 'setup-trigger key-trigger')

    expect(Array.isArray(keyButton?.props.children) ? keyButton.props.children[0] : null).toBe('E♭')
  })

  it('renders the controlled key and reports a manual key change', () => {
    const onKeySignatureChange = vi.fn()
    const tree = App({ keySignature: 'Db', onKeySignatureChange })
    const keyButton = elements(tree).find((element) => element.props.className === 'setup-trigger key-trigger')
    const minorButton = elements(tree).find((element) => element.props.role === 'tab' && element.props.children === 'Minor')

    expect(Array.isArray(keyButton?.props.children) ? keyButton.props.children[0] : null).toBe('D♭')
    minorButton?.props.onClick?.()
    expect(onKeySignatureChange).toHaveBeenCalledWith('C#m')
  })

  it('preserves the standalone key instead of persisting a controlled song key', () => {
    storage.set('test:preferences', JSON.stringify({ keySignature: 'G', role: 'guitarist' }))
    App({ preferencesKey: 'test:preferences', keySignature: 'Db', onKeySignatureChange: vi.fn() })
    hooks.effects.find(({ dependencies }) => dependencies?.includes('test:preferences'))?.effect()

    expect(JSON.parse(storage.get('test:preferences') ?? '{}')).toMatchObject({ keySignature: 'G', role: 'guitarist' })
  })
})
