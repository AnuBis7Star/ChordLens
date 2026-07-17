import { describe, expect, it } from 'vitest'
import { CHORD_SMOOTHING_DELAY_MS, getChordSmoothingDelay } from './smoothing'

describe('getChordSmoothingDelay', () => {
  it('delays only non-empty live note sets when enabled', () => {
    expect(getChordSmoothingDelay(false, 3)).toBe(0)
    expect(getChordSmoothingDelay(true, 0)).toBe(0)
    expect(getChordSmoothingDelay(true, 3)).toBe(CHORD_SMOOTHING_DELAY_MS)
  })
})
