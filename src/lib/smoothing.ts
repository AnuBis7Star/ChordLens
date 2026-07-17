export const CHORD_SMOOTHING_DELAY_MS = 180

export function getChordSmoothingDelay(enabled: boolean, noteCount: number) {
  return enabled && noteCount > 0 ? CHORD_SMOOTHING_DELAY_MS : 0
}
