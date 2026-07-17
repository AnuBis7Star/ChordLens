import { describe, expect, it } from 'vitest'
import { KEY_OPTIONS, toNotationNotes } from './notation'

describe('toNotationNotes', () => {
  it('preserves an explicitly entered E-flat on the E staff position', () => {
    expect(toNotationNotes(['Eb'], 'D')[0]).toMatchObject({ key: 'eb/4', midi: 63, staff: 'treble' })
  })

  it('spells MIDI notes according to the selected key', () => {
    expect(toNotationNotes([63], 'D')[0].key).toBe('d#/4')
    expect(toNotationNotes([63], 'Eb')[0].key).toBe('eb/4')
  })

  it('places middle C on the treble staff so its ledger line is rendered', () => {
    expect(toNotationNotes(['C'], 'C')[0]).toMatchObject({ key: 'c/4', staff: 'treble' })
  })

  it('keeps chord notes at their real pitches for vertical stacking', () => {
    expect(toNotationNotes([60, 64, 67], 'C').map((note) => note.key)).toEqual(['c/4', 'e/4', 'g/4'])
  })

  it('handles enharmonic octave boundaries correctly', () => {
    expect(toNotationNotes([60], 'C#')[0].key).toBe('c/4')
  })

  it('uses only practical enharmonic note names', () => {
    expect(toNotationNotes(['Cb4', 'Fb4', 'B#4', 'E#4'], 'C').map((note) => note.key))
      .toEqual(['b/3', 'e/4', 'f/4', 'c/5'])
  })

  it('does not offer C-flat as a selectable key', () => {
    expect(KEY_OPTIONS.map((key) => key.value)).not.toContain('Cb')
  })
})
