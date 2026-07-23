import type { MidiState } from './midi'

export type RoomMode = 'host' | 'viewer'
export type RoomStatus = 'offline' | 'connecting' | 'hosting' | 'joined' | 'error'
export type RoomContext = { keySignature?: string; activeSongId?: string | null }

export type Signal = { type: string; [key: string]: unknown }

export type SignalingConnection = {
  send: (signal: Signal) => void
  close: () => void
}

export type CreateSignalingConnection = (options: {
  mode: RoomMode
  roomCode: string
  onSignal: (signal: Signal) => void
  onClose: () => void
  onError: (error: Error) => void
}) => Promise<SignalingConnection>

type LiveRoomOptions = {
  signalingUrl?: string
  createSignalingConnection?: CreateSignalingConnection
  onMidi: (data: number[]) => void
  onState: (state: MidiState) => void
  onContext?: (context: RoomContext) => void
  onStatus: (status: RoomStatus, message?: string) => void
  onPeerConnected: () => void
}

const rtcConfig: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
const RECONNECT_DELAY_MS = 1_000

export class LiveRoom {
  private signaling: SignalingConnection | null = null
  private peers = new Map<string, RTCPeerConnection>()
  private channels = new Map<string, RTCDataChannel>()
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>()
  private roomCode = ''
  private mode: RoomMode | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectEnabled = false
  private connectionVersion = 0

  constructor(private readonly options: LiveRoomOptions) {}

  async host(roomCode: string) {
    this.leave()
    this.reconnectEnabled = true
    await this.connect('host', roomCode)
  }

  async join(roomCode: string) {
    this.leave()
    this.reconnectEnabled = true
    await this.connect('viewer', roomCode)
  }

  sendMidi(data: ArrayLike<number>) {
    this.send({ type: 'midi', data: Array.from(data).slice(0, 3) })
  }

  sendState(state: MidiState) {
    this.send({ type: 'state', state })
  }

  sendContext(context: RoomContext) {
    this.send({ type: 'context', context })
  }

  resume() {
    if (!this.reconnectEnabled || !this.mode) return
    const mode = this.mode
    this.connectionVersion += 1
    this.disconnect()
    this.options.onStatus('offline')
    this.scheduleReconnect(mode, this.roomCode)
  }

  leave() {
    this.reconnectEnabled = false
    this.cancelReconnect()
    this.connectionVersion += 1
    this.disconnect()
    this.mode = null
    this.options.onStatus('offline')
  }

  private disconnect() {
    this.channels.forEach((channel) => channel.close())
    this.peers.forEach((peer) => peer.close())
    this.signaling?.close()
    this.channels.clear()
    this.peers.clear()
    this.pendingCandidates.clear()
    this.signaling = null
  }

  private async connect(mode: RoomMode, roomCode: string) {
    const version = ++this.connectionVersion
    this.disconnect()
    this.mode = mode
    this.roomCode = roomCode
    this.options.onStatus('connecting')
    const onClose = () => {
      if (this.connectionVersion !== version || this.mode !== mode) return
      this.options.onStatus('offline')
      this.scheduleReconnect(mode, roomCode)
    }
    const onError = (error: Error) => this.options.onStatus('error', error.message)

    try {
      this.signaling = this.options.createSignalingConnection
        ? await this.options.createSignalingConnection({ mode, roomCode, onSignal: (signal) => void this.handleSignal(signal), onClose, onError })
        : await this.createWebSocketConnection(mode, roomCode, onClose)
    } catch (error) {
      const connectionError = error instanceof Error ? error : new Error('Could not reach the live-session server.')
      onError(connectionError)
      this.scheduleReconnect(mode, roomCode)
      throw connectionError
    }
  }

  private scheduleReconnect(mode: RoomMode, roomCode: string) {
    if (!this.reconnectEnabled || this.reconnectTimer || this.mode !== mode) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.reconnectEnabled && this.mode === mode) void this.connect(mode, roomCode).catch(() => {})
    }, RECONNECT_DELAY_MS)
  }

  private cancelReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private async createWebSocketConnection(mode: RoomMode, roomCode: string, onClose: () => void) {
    const socket = new WebSocket(this.options.signalingUrl ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`)
    socket.onmessage = (event) => void this.handleSignal(JSON.parse(event.data as string) as Signal)
    socket.onclose = onClose

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () => reject(new Error('Could not reach the live-session server.'))
    }).catch((error: Error) => {
      socket.close()
      this.options.onStatus('error', error.message)
      throw error
    })

    socket.send(JSON.stringify({ type: mode, roomCode }))
    return {
      send: (signal: Signal) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...signal, roomCode }))
      },
      close: () => socket.close(),
    }
  }

  private async handleSignal(signal: Signal) {
    if (signal.type === 'hosted') {
      this.options.onStatus('hosting')
      return
    }
    if (signal.type === 'joined') return
    if (signal.type === 'error') {
      this.options.onStatus('error', String(signal.message ?? 'Unable to join that session.'))
      return
    }
    if (signal.type === 'peer-joined' && this.mode === 'host' && typeof signal.from === 'string') {
      const peer = this.createPeer(signal.from)
      const channel = peer.createDataChannel('midi', { ordered: false, maxRetransmits: 0 })
      this.channels.set(signal.from, channel)
      this.bindChannel(channel)
      await peer.setLocalDescription(await peer.createOffer())
      this.signal({ type: 'offer', to: signal.from, sdp: peer.localDescription })
      return
    }
    if (signal.type === 'offer' && this.mode === 'viewer' && typeof signal.from === 'string') {
      const peer = this.createPeer(signal.from)
      await peer.setRemoteDescription(signal.sdp as RTCSessionDescriptionInit)
      await this.flushCandidates(signal.from, peer)
      await peer.setLocalDescription(await peer.createAnswer())
      this.signal({ type: 'answer', to: signal.from, sdp: peer.localDescription })
      return
    }
    if (signal.type === 'answer' && typeof signal.from === 'string') {
      const peer = this.peers.get(signal.from)
      if (!peer) return
      await peer.setRemoteDescription(signal.sdp as RTCSessionDescriptionInit)
      await this.flushCandidates(signal.from, peer)
      return
    }
    if (signal.type === 'candidate' && typeof signal.from === 'string' && signal.candidate) {
      const candidate = signal.candidate as RTCIceCandidateInit
      const peer = this.peers.get(signal.from)
      if (peer?.remoteDescription) {
        await peer.addIceCandidate(candidate)
      } else {
        this.pendingCandidates.set(signal.from, [...(this.pendingCandidates.get(signal.from) ?? []), candidate])
      }
    }
  }

  private async flushCandidates(remoteId: string, peer: RTCPeerConnection) {
    const candidates = this.pendingCandidates.get(remoteId) ?? []
    this.pendingCandidates.delete(remoteId)
    for (const candidate of candidates) await peer.addIceCandidate(candidate)
  }

  private createPeer(remoteId: string) {
    this.peers.get(remoteId)?.close()
    const peer = new RTCPeerConnection(rtcConfig)
    this.peers.set(remoteId, peer)
    peer.onicecandidate = ({ candidate }) => { if (candidate) this.signal({ type: 'candidate', to: remoteId, candidate }) }
    peer.ondatachannel = (event) => {
      this.channels.set(remoteId, event.channel)
      this.bindChannel(event.channel)
    }
    return peer
  }

  private bindChannel(channel: RTCDataChannel) {
    const version = this.connectionVersion
    channel.onopen = () => {
      if (this.connectionVersion !== version) return
      this.cancelReconnect()
      this.options.onStatus(this.mode === 'host' ? 'hosting' : 'joined')
      this.options.onPeerConnected()
    }
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type: string; data?: number[]; state?: MidiState; context?: RoomContext }
      if (message.type === 'midi' && Array.isArray(message.data)) this.options.onMidi(message.data)
      if (message.type === 'state' && message.state) this.options.onState(message.state)
      if (message.type === 'context' && message.context && typeof message.context === 'object') this.options.onContext?.(message.context)
    }
    channel.onclose = () => {
      if (this.connectionVersion !== version || this.mode !== 'viewer') return
      this.options.onStatus('offline')
      this.scheduleReconnect('viewer', this.roomCode)
    }
  }

  private send(message: object) {
    this.channels.forEach((channel) => { if (channel.readyState === 'open') channel.send(JSON.stringify(message)) })
  }

  private signal(message: Signal) {
    this.signaling?.send({ ...message, roomCode: this.roomCode })
  }
}
