import { describe, expect, it } from 'vitest'
import { EMPTY_MIDI_STATE, updateMidiState } from './midi'

describe('updateMidiState', () => {
  it('keeps released notes sounding until the sustain pedal is released', () => {
    let state = updateMidiState(EMPTY_MIDI_STATE, [0x90, 60, 100])
    state = updateMidiState(state, [0xb0, 64, 127])
    state = updateMidiState(state, [0x80, 60, 0])

    expect(state).toEqual({ pressedNotes: [], soundingNotes: [60], sustain: true })

    state = updateMidiState(state, [0xb0, 64, 0])
    expect(state).toEqual(EMPTY_MIDI_STATE)
  })

  it('keeps physically held notes when the pedal is released', () => {
    let state = updateMidiState(EMPTY_MIDI_STATE, [0x90, 60, 100])
    state = updateMidiState(state, [0xb0, 64, 127])
    state = updateMidiState(state, [0x90, 64, 100])
    state = updateMidiState(state, [0x80, 60, 0])
    state = updateMidiState(state, [0xb0, 64, 0])

    expect(state).toEqual({ pressedNotes: [64], soundingNotes: [64], sustain: false })
  })
})
