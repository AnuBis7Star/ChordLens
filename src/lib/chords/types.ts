export type MidiNoteInput = number | string

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'sus2'
  | 'sus4'
  | 'susb2'
  | 'susb2no5'
  | 'sus2no5'
  | 'sus4no5'
  | 'sus4add9'
  | 'madd9'
  | '7no3'
  | 'maj7no3'
  | 'open'
  | 'unknown'
  | 'add9'
  | '6'
  | 'm6'
  | '7'
  | 'maj7'
  | 'm7'
  | 'm7b5'
  | 'dim7'
  | '9'
  | 'maj9'
  | 'm9'
  | '11'
  | '13'

export interface DetectedChord {
  root: string
  quality: ChordQuality
  symbol: string
  chordWithoutBass: string
  notes: string[]
  isSlashChord: boolean
}

export interface RoleView {
  main: string
  secondary: string[]
}

export interface ChordDetection {
  inputNotes: string[]
  bassNote: string | null
  detectedChord: DetectedChord | null
  views: {
    pianist: RoleView
    guitarist: RoleView
    bassist: RoleView
  }
}
