import { describe, expect, it } from 'vitest'
import { detectChord } from './detect'

describe('detectChord', () => {
  it.each([
    ['C E G', 'C'],
    ['E G C', 'C/E'],
    ['C E G B', 'Cmaj7'],
    ['C E G Bb', 'C7'],
    ['C E G A', 'C6'],
    ['F G C E', 'C/F'],
    ['A C E G', 'Am7'],
    ['G Bb F', 'Gm7'],
    ['C Db G', 'Csusb2'],
    ['C Db', 'Csusb2(no5)'],
    ['C G', 'C'],
    ['G C G', 'C/G'],
    ['C D G', 'Csus2'],
    ['F A# C', 'A#sus2/F'],
    ['F Bb C', 'Bbsus2/F'],
    ['C F G', 'Fsus2/C'],
    ['C D', 'Csus2(no5)'],
    ['C F', 'Csus4(no5)'],
    ['C D F G', 'Csus4(add9)'],
    ['C D E', 'Cadd9'],
    ['C D Eb G', 'Cm(add9)'],
    ['C E Bb', 'C7'],
    ['C E Bb D', 'C9'],
    ['C G Bb', 'C7(no3)'],
    ['C G B', 'Cmaj7(no3)'],
    ['C D F A', 'Dm7/C'],
    ['G B D F', 'G7'],
    ['D F A C', 'Dm7'],
    ['F A C D', 'Dm7/F'],
    ['A C D F', 'Dm7/A'],
  ])('detects %s as %s', (input, symbol) => {
    expect(detectChord(input.split(' ')).detectedChord?.symbol).toBe(symbol)
  })

  it('returns role displays for a slash chord', () => {
    const result = detectChord(['C', 'D', 'F', 'A'])

    expect(result).toMatchObject({
      bassNote: 'C',
      detectedChord: {
        root: 'D',
        quality: 'm7',
        chordWithoutBass: 'Dm7',
        notes: ['D', 'F', 'A', 'C'],
        isSlashChord: true,
      },
      views: {
        pianist: { main: 'Dm7/C', secondary: ['Bass: C', 'Notes: C D F A'] },
        guitarist: { main: 'Dm7', secondary: ['Notes: D F A C'] },
        bassist: { main: 'C', secondary: ['Chord: Dm7/C', 'Notes: C D F A'] },
      },
    })
  })

  it('uses MIDI pitch to find the bass note', () => {
    expect(detectChord([64, 60, 67]).detectedChord?.symbol).toBe('C')
  })

  it('uses the lowest MIDI pitch as bass regardless of press order', () => {
    expect(detectChord([65, 69, 72, 48]).detectedChord?.symbol).toBe('F/C')
  })

  it('falls back to the bass note when no practical quality can be determined', () => {
    expect(detectChord(['C', 'Db', 'E']).detectedChord).toMatchObject({
      symbol: 'C',
      quality: 'unknown',
    })
  })
})
