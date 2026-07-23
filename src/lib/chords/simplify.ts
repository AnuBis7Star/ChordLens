import type { DetectedChord } from './types'

export type SimplifiedChord = string

const ROOT = /^[A-G](?:#|b)?$/

export function simplifyDetectedChord(chord: DetectedChord | null | undefined): SimplifiedChord | null {
  if (!chord || chord.quality === 'unknown' || !ROOT.test(chord.root)) return null
  return `${chord.root}${chord.quality === 'minor' ? 'm' : chord.quality === '7' ? '7' : ''}`
}

export function notifySimplifiedChordChange(
  previous: SimplifiedChord | null | undefined,
  next: SimplifiedChord | null,
  callback?: (chord: SimplifiedChord | null) => void,
) {
  if (previous !== next) callback?.(next)
  return next
}
