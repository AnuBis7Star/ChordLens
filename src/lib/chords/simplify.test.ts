import { describe, expect, it, vi } from 'vitest'
import { detectChord } from './detect'
import { notifySimplifiedChordChange, simplifyDetectedChord } from './simplify'
import type { DetectedChord } from './types'

describe('simplifyDetectedChord', () => {
  it.each([
    [['C#', 'E', 'G#'], 'C#m'],
    [['C', 'E', 'G', 'Bb'], 'C7'],
    [['C', 'D', 'E'], 'C'],
    [['C', 'D', 'F', 'A'], 'D'],
  ] as const)('simplifies %s as %s', (notes, expected) => {
    expect(simplifyDetectedChord(detectChord([...notes]).detectedChord)).toBe(expected)
  })

  it('rejects missing, unknown, and malformed detections', () => {
    const malformed = { root: 'not-a-root', quality: 'major' } as DetectedChord
    expect(simplifyDetectedChord(null)).toBeNull()
    expect(simplifyDetectedChord(detectChord(['C', 'Db', 'E']).detectedChord)).toBeNull()
    expect(simplifyDetectedChord(malformed)).toBeNull()
  })
})

describe('notifySimplifiedChordChange', () => {
  it('reports changes once, including release', () => {
    const callback = vi.fn()
    let previous: string | null | undefined
    previous = notifySimplifiedChordChange(previous, 'C', callback)
    previous = notifySimplifiedChordChange(previous, 'C', callback)
    previous = notifySimplifiedChordChange(previous, null, callback)

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(1, 'C')
    expect(callback).toHaveBeenNthCalledWith(2, null)
  })
})
