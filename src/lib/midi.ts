export interface MidiState {
  pressedNotes: number[]
  soundingNotes: number[]
  sustain: boolean
}

export const EMPTY_MIDI_STATE: MidiState = {
  pressedNotes: [],
  soundingNotes: [],
  sustain: false,
}

export function updateMidiState(state: MidiState, data: ArrayLike<number>): MidiState {
  const command = data[0] & 0xf0
  const noteOrController = data[1]
  const value = data[2] ?? 0

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
