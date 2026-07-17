import { formatDetection } from './format'
import { normalizeNotes } from './notes'
import type { ChordDetection, ChordQuality, MidiNoteInput } from './types'

interface ChordTemplate {
  quality: ChordQuality
  suffix: string
  intervals: number[]
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  { quality: 'major', suffix: '', intervals: [0, 4, 7] },
  { quality: 'minor', suffix: 'm', intervals: [0, 3, 7] },
  { quality: 'diminished', suffix: 'dim', intervals: [0, 3, 6] },
  { quality: 'augmented', suffix: 'aug', intervals: [0, 4, 8] },
  { quality: 'open', suffix: '', intervals: [0, 7] },
  { quality: 'susb2', suffix: 'susb2', intervals: [0, 1, 7] },
  { quality: 'susb2no5', suffix: 'susb2(no5)', intervals: [0, 1] },
  { quality: 'sus2', suffix: 'sus2', intervals: [0, 2, 7] },
  { quality: 'sus2no5', suffix: 'sus2(no5)', intervals: [0, 2] },
  { quality: 'sus4', suffix: 'sus4', intervals: [0, 5, 7] },
  { quality: 'sus4no5', suffix: 'sus4(no5)', intervals: [0, 5] },
  { quality: 'sus4add9', suffix: 'sus4(add9)', intervals: [0, 2, 5, 7] },
  { quality: 'add9', suffix: 'add9', intervals: [0, 2, 4, 7] },
  { quality: 'add9', suffix: 'add9', intervals: [0, 2, 4] },
  { quality: '6', suffix: '6', intervals: [0, 4, 7, 9] },
  { quality: 'm6', suffix: 'm6', intervals: [0, 3, 7, 9] },
  { quality: '7', suffix: '7', intervals: [0, 4, 7, 10] },
  { quality: '7', suffix: '7', intervals: [0, 4, 10] },
  { quality: '7no3', suffix: '7(no3)', intervals: [0, 7, 10] },
  { quality: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { quality: 'maj7no3', suffix: 'maj7(no3)', intervals: [0, 7, 11] },
  { quality: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10] },
  { quality: 'm7', suffix: 'm7', intervals: [0, 3, 10] },
  { quality: 'm7b5', suffix: 'm7b5', intervals: [0, 3, 6, 10] },
  { quality: 'dim7', suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { quality: '9', suffix: '9', intervals: [0, 2, 4, 7, 10] },
  { quality: '9', suffix: '9', intervals: [0, 2, 4, 10] },
  { quality: 'maj9', suffix: 'maj9', intervals: [0, 2, 4, 7, 11] },
  { quality: 'm9', suffix: 'm9', intervals: [0, 2, 3, 7, 10] },
  { quality: 'madd9', suffix: 'm(add9)', intervals: [0, 2, 3, 7] },
  { quality: '11', suffix: '11', intervals: [0, 2, 4, 5, 7, 10] },
  { quality: '13', suffix: '13', intervals: [0, 2, 4, 7, 9, 10] },
]

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function detectChord(inputs: MidiNoteInput[]): ChordDetection {
  const normalized = normalizeNotes(inputs)
  const inputNotes = normalized.map((note) => note.name)
  const bassNote = normalized[0]?.name ?? null
  const pitchClasses = [...new Set(normalized.map((note) => note.pitchClass))]
  const upperPitchClasses = [...new Set(normalized.slice(1).map((note) => note.pitchClass))]
  const noteNameByPitch = new Map(normalized.map((note) => [note.pitchClass, note.name]))

  const findMatches = (candidatePitchClasses: number[]) => CHORD_TEMPLATES.flatMap((template, templateIndex) =>
    SHARP_NAMES.map((fallbackRoot, rootPitch) => {
      const expected = template.intervals.map((interval) => (rootPitch + interval) % 12)
      const exactMatch = expected.length === candidatePitchClasses.length && expected.every((pitch) => candidatePitchClasses.includes(pitch))
      if (!exactMatch) return null

      const root = noteNameByPitch.get(rootPitch) ?? fallbackRoot
      const isSlashChord = normalized[0]?.pitchClass !== rootPitch
      return {
        root,
        rootPitch,
        template,
        templateIndex,
        isSlashChord,
        // sus2 and sus4 can describe the same three pitches in different roots.
        // Prefer the sus2 name for the practical live-band reading.
        score: template.quality === 'm7' && !isSlashChord ? 100 : template.quality === 'sus2' ? 10 : 0,
        notes: expected.map((pitch) => noteNameByPitch.get(pitch) ?? SHARP_NAMES[pitch]),
      }
    }).filter((match) => match !== null),
  )

  const matches = findMatches(pitchClasses)
  const practicalMatches = matches.length > 0 ? matches : findMatches(upperPitchClasses)

  // Equivalent 6/m7 spellings are context-dependent. With no song context, use
  // the lowest possible root as a stable practical tie-breaker (C6 over Am7/C).
  const best = practicalMatches.sort((a, b) => b.score - a.score || a.rootPitch - b.rootPitch || a.templateIndex - b.templateIndex)[0]
  const detectedChord = best
    ? {
        root: best.root,
        quality: best.template.quality,
        chordWithoutBass: `${best.root}${best.template.suffix}`,
        symbol: `${best.root}${best.template.suffix}${best.isSlashChord ? `/${bassNote}` : ''}`,
        notes: best.notes,
        isSlashChord: best.isSlashChord,
      }
    : bassNote
      ? {
          root: bassNote,
          quality: 'unknown' as const,
          symbol: bassNote,
          chordWithoutBass: bassNote,
          notes: inputNotes,
          isSlashChord: false,
        }
      : null

  return {
    inputNotes,
    bassNote,
    detectedChord,
    views: formatDetection(inputNotes, bassNote, detectedChord),
  }
}
