import { describe, expect, it, vi } from 'vitest'

import { LiveRoom, type CreateSignalingConnection } from './liveRoom'

describe('LiveRoom signaling transport', () => {
  it('uses a host-provided signaling connection', async () => {
    const statuses: string[] = []
    const close = vi.fn()
    const createSignalingConnection: CreateSignalingConnection = async ({ mode, roomCode, onSignal }) => {
      expect(mode).toBe('host')
      expect(roomCode).toBe('ABC123')
      queueMicrotask(() => onSignal({ type: 'hosted' }))
      return { send: vi.fn(), close }
    }
    const room = new LiveRoom({
      createSignalingConnection,
      onMidi: vi.fn(),
      onState: vi.fn(),
      onStatus: (status) => statuses.push(status),
      onPeerConnected: vi.fn(),
    })

    await room.host('ABC123')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(statuses).toEqual(['offline', 'connecting', 'hosting'])

    room.leave()
    expect(close).toHaveBeenCalledOnce()
  })
})
