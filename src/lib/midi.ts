export interface MidiState {
  pressedNotes: number[]
  soundingNotes: number[]
  sustain: boolean
  automaticTranspose: number
  rpn: Record<number, { msb?: number, lsb?: number }>
}

export const EMPTY_MIDI_STATE: MidiState = {
  pressedNotes: [],
  soundingNotes: [],
  sustain: false,
  automaticTranspose: 0,
  rpn: {},
}

export function transposeMidiNotes(notes: number[], semitones: number): number[] {
  return notes.map((note) => note + semitones).filter((note) => note >= 0 && note <= 127)
}

export function updateMidiState(state: MidiState, data: ArrayLike<number>): MidiState {
  const command = data[0] & 0xf0
  const noteOrController = data[1]
  const value = data[2] ?? 0

  if (command === 0xb0 && (noteOrController === 101 || noteOrController === 100)) {
    const channel = data[0] & 0x0f
    const rpn = { ...state.rpn, [channel]: { ...state.rpn[channel], [noteOrController === 101 ? 'msb' : 'lsb']: value } }
    return { ...state, rpn }
  }

  if (command === 0xb0 && noteOrController === 6) {
    const selectedRpn = state.rpn[data[0] & 0x0f]
    if (selectedRpn?.msb === 0 && selectedRpn.lsb === 2) return { ...state, automaticTranspose: value - 64 }
  }

  if (command === 0xb0 && noteOrController === 64) {
    const sustain = value >= 64
    return {
      ...state,
      sustain,
      soundingNotes: sustain
        ? state.soundingNotes
        : state.soundingNotes.filter((note) => state.pressedNotes.includes(note)),
    }
  }

  const isNoteOn = command === 0x90 && value > 0
  const isNoteOff = command === 0x80 || (command === 0x90 && value === 0)
  if (!isNoteOn && !isNoteOff) return state

  const pressedNotes = isNoteOn
    ? addNote(state.pressedNotes, noteOrController)
    : state.pressedNotes.filter((note) => note !== noteOrController)
  const soundingNotes = isNoteOn
    ? addNote(state.soundingNotes, noteOrController)
    : state.sustain
      ? state.soundingNotes
      : state.soundingNotes.filter((note) => note !== noteOrController)

  return { ...state, pressedNotes, soundingNotes }
}

function addNote(notes: number[], note: number) {
  return notes.includes(note) ? notes : [...notes, note].sort((a, b) => a - b)
}
