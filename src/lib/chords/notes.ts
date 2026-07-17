import type { MidiNoteInput } from './types'

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NATURAL_PITCHES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const PRACTICAL_NAMES: Record<string, string> = { Cb: 'B', Fb: 'E', 'B#': 'C', 'E#': 'F' }
const NOTE_NAME = /^([A-Ga-g])([#b]?)(-?\d+)?$/

export interface NormalizedNote {
  pitchClass: number
  name: string
  midi: number | null
  inputIndex: number
}

export function normalizeNotes(inputs: MidiNoteInput[]): NormalizedNote[] {
  if (inputs.length === 0) return []

  const notes = inputs.map((input, inputIndex) => normalizeNote(input, inputIndex))
  const allHavePitch = notes.every((note) => note.midi !== null)
  return allHavePitch
    ? notes.sort((a, b) => a.midi! - b.midi! || a.inputIndex - b.inputIndex)
    : notes
}

function normalizeNote(input: MidiNoteInput, inputIndex: number): NormalizedNote {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0 || input > 127) {
      throw new Error(`MIDI note must be an integer from 0 to 127: ${input}`)
    }
    return { pitchClass: input % 12, name: PITCH_CLASSES[input % 12], midi: input, inputIndex }
  }

  const match = NOTE_NAME.exec(input.trim())
  if (!match) throw new Error(`Invalid note name: ${input}`)

  const [, letter, accidental, octave] = match
  const naturalPitch = NATURAL_PITCHES[letter.toUpperCase()]
  const accidentalOffset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
  const pitchClass = (naturalPitch + accidentalOffset + 12) % 12
  const enteredName = `${letter.toUpperCase()}${accidental}`
  const name = PRACTICAL_NAMES[enteredName] ?? enteredName
  const midi = octave === undefined ? null : (Number(octave) + 1) * 12 + naturalPitch + accidentalOffset
  if (midi !== null && (midi < 0 || midi > 127)) throw new Error(`MIDI note name is outside 0 to 127: ${input}`)
  return { pitchClass, name, midi, inputIndex }
}
