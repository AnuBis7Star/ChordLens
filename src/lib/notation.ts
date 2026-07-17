import { KeyManager } from 'vexflow'
import { normalizeNotes } from './chords/notes'
import type { MidiNoteInput } from './chords'

export const KEY_OPTIONS = [
  { value: 'A', label: 'A major' }, { value: 'Am', label: 'A minor' },
  { value: 'Ab', label: 'A♭ major' }, { value: 'Abm', label: 'A♭ minor' },
  { value: 'A#m', label: 'A♯ minor' },
  { value: 'B', label: 'B major' }, { value: 'Bm', label: 'B minor' },
  { value: 'Bb', label: 'B♭ major' }, { value: 'Bbm', label: 'B♭ minor' },
  { value: 'C', label: 'C major' }, { value: 'Cm', label: 'C minor' },
  { value: 'C#', label: 'C♯ major' }, { value: 'C#m', label: 'C♯ minor' },
  { value: 'D', label: 'D major' }, { value: 'Dm', label: 'D minor' },
  { value: 'Db', label: 'D♭ major' }, { value: 'D#m', label: 'D♯ minor' },
  { value: 'E', label: 'E major' }, { value: 'Em', label: 'E minor' },
  { value: 'Eb', label: 'E♭ major' }, { value: 'Ebm', label: 'E♭ minor' },
  { value: 'F', label: 'F major' }, { value: 'Fm', label: 'F minor' },
  { value: 'F#', label: 'F♯ major' }, { value: 'F#m', label: 'F♯ minor' },
  { value: 'G', label: 'G major' }, { value: 'Gm', label: 'G minor' },
  { value: 'Gb', label: 'G♭ major' }, { value: 'G#m', label: 'G♯ minor' },
] as const

const SHARP_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const NATURAL_PITCHES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const PRACTICAL_SPELLINGS: Record<string, string> = { cb: 'b', fb: 'e', 'b#': 'c', 'e#': 'f' }

export interface NotationNote {
  key: string
  midi: number
  name: string
  staff: 'treble' | 'bass'
}

export function toNotationNotes(inputs: MidiNoteInput[], keySignature: string): NotationNote[] {
  const keyManager = new KeyManager(keySignature)

  return normalizeNotes(inputs).map((note) => {
    const input = inputs[note.inputIndex]
    const selectedSpelling = typeof input === 'string'
      ? note.name.toLowerCase()
      : keyManager.selectNote(SHARP_NAMES[note.pitchClass]).note
    const spelling = PRACTICAL_SPELLINGS[selectedSpelling] ?? selectedSpelling
    const accidental = spelling.slice(1)
    const accidentalOffset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
    const midi = note.midi ?? 60 + note.pitchClass
    const octave = Math.floor((midi - NATURAL_PITCHES[spelling[0]] - accidentalOffset) / 12) - 1

    return {
      key: `${spelling}/${octave}`,
      midi,
      name: `${spelling[0].toUpperCase()}${accidental}`,
      staff: midi >= 60 ? 'treble' : 'bass',
    }
  })
}
