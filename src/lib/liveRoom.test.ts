import { describe, expect, it, vi } from 'vitest'

import { LiveRoom, type CreateSignalingConnection } from './liveRoom'

function bindFakeChannel(room: LiveRoom) {
  const send = vi.fn()
  const channel = { readyState: 'open', send, close: vi.fn() } as unknown as RTCDataChannel
  const internals = room as unknown as { bindChannel: (channel: RTCDataChannel) => void; channels: Map<string, RTCDataChannel> }
  internals.channels.set('peer-1', channel)
  internals.bindChannel(channel)
  return { channel, send }
}

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

  it('rejoins after the signaling connection closes', async () => {
    vi.useFakeTimers()
    const statuses: string[] = []
    const onCloses: Array<() => void> = []
    const createSignalingConnection: CreateSignalingConnection = vi.fn(async ({ onSignal, onClose }) => {
      onCloses.push(onClose)
      queueMicrotask(() => onSignal({ type: 'hosted' }))
      return { send: vi.fn(), close: vi.fn() }
    })
    const room = new LiveRoom({
      createSignalingConnection,
      onMidi: vi.fn(),
      onState: vi.fn(),
      onStatus: (status) => statuses.push(status),
      onPeerConnected: vi.fn(),
    })

    try {
      await room.host('ABC123')
      await vi.runAllTicks()
      onCloses[0]()
      expect(statuses.at(-1)).toBe('offline')

      await vi.advanceTimersByTimeAsync(1_000)
      expect(createSignalingConnection).toHaveBeenCalledTimes(2)
      expect(statuses.slice(-2)).toEqual(['connecting', 'hosting'])

      room.resume()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(createSignalingConnection).toHaveBeenCalledTimes(3)

      room.leave()
      onCloses[2]()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(createSignalingConnection).toHaveBeenCalledTimes(3)
    } finally {
      room.leave()
      vi.useRealTimers()
    }
  })

  it('sends and receives key and active-song context without changing MIDI messages', () => {
    const onContext = vi.fn()
    const room = new LiveRoom({
      onMidi: vi.fn(),
      onState: vi.fn(),
      onContext,
      onStatus: vi.fn(),
      onPeerConnected: vi.fn(),
    })
    const { channel, send } = bindFakeChannel(room)

    room.sendContext({ keySignature: 'Db', activeSongId: 'song-1' })
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'context', context: { keySignature: 'Db', activeSongId: 'song-1' } }))

    channel.onmessage?.({ data: JSON.stringify({ type: 'context', context: { keySignature: 'Ebm', activeSongId: 'song-2' } }) } as MessageEvent)
    expect(onContext).toHaveBeenCalledWith({ keySignature: 'Ebm', activeSongId: 'song-2' })
  })
})
