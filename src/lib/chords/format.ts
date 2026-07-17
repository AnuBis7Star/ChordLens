import type { ChordDetection, DetectedChord } from './types'

export function formatDetection(
  inputNotes: string[],
  bassNote: string | null,
  detectedChord: DetectedChord | null,
): ChordDetection['views'] {
  if (!detectedChord || !bassNote) {
    return {
      pianist: { main: '—', secondary: ['Enter a supported chord'] },
      guitarist: { main: '—', secondary: ['Enter a supported chord'] },
      bassist: { main: '—', secondary: ['Enter a supported chord'] },
    }
  }

  const input = inputNotes.join(' ')
  return {
    pianist: { main: detectedChord.symbol, secondary: [`Bass: ${bassNote}`, `Notes: ${input}`] },
    guitarist: { main: detectedChord.chordWithoutBass, secondary: [`Notes: ${detectedChord.notes.join(' ')}`] },
    bassist: { main: bassNote, secondary: [`Chord: ${detectedChord.symbol}`, `Notes: ${input}`] },
  }
}
