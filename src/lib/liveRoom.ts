import type { MidiState } from './midi'

export type RoomMode = 'host' | 'viewer'
export type RoomStatus = 'offline' | 'connecting' | 'hosting' | 'joined' | 'error'

type Signal = { type: string; [key: string]: unknown }

type LiveRoomOptions = {
  signalingUrl?: string
  onMidi: (data: number[]) => void
  onState: (state: MidiState) => void
  onStatus: (status: RoomStatus, message?: string) => void
  onPeerConnected: () => void
}

const rtcConfig: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export class LiveRoom {
  private socket: WebSocket | null = null
  private peers = new Map<string, RTCPeerConnection>()
  private channels = new Map<string, RTCDataChannel>()
  private roomCode = ''
  private mode: RoomMode | null = null

  constructor(private readonly options: LiveRoomOptions) {}

  async host(roomCode: string) {
    await this.connect('host', roomCode)
  }

  async join(roomCode: string) {
    await this.connect('viewer', roomCode)
  }

  sendMidi(data: ArrayLike<number>) {
    this.send({ type: 'midi', data: Array.from(data).slice(0, 3) })
  }

  sendState(state: MidiState) {
    this.send({ type: 'state', state })
  }

  leave() {
    this.channels.forEach((channel) => channel.close())
    this.peers.forEach((peer) => peer.close())
    this.socket?.close()
    this.channels.clear()
    this.peers.clear()
    this.socket = null
    this.mode = null
    this.options.onStatus('offline')
  }

  private async connect(mode: RoomMode, roomCode: string) {
    this.leave()
    this.mode = mode
    this.roomCode = roomCode
    this.options.onStatus('connecting')
    const socket = new WebSocket(this.options.signalingUrl ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: mode, roomCode }))
        resolve()
      }
      socket.onerror = () => reject(new Error('Could not reach the live-session server.'))
    }).catch((error: Error) => {
      this.options.onStatus('error', error.message)
      throw error
    })

    socket.onmessage = (event) => this.handleSignal(JSON.parse(event.data as string) as Signal)
    socket.onclose = () => {
      if (this.socket === socket) this.options.onStatus('offline')
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
      await peer.setLocalDescription(await peer.createAnswer())
      this.signal({ type: 'answer', to: signal.from, sdp: peer.localDescription })
      return
    }
    if (signal.type === 'answer' && typeof signal.from === 'string') {
      await this.peers.get(signal.from)?.setRemoteDescription(signal.sdp as RTCSessionDescriptionInit)
      return
    }
    if (signal.type === 'candidate' && typeof signal.from === 'string' && signal.candidate) {
      await this.peers.get(signal.from)?.addIceCandidate(signal.candidate as RTCIceCandidateInit)
    }
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
    channel.onopen = () => {
      this.options.onStatus(this.mode === 'host' ? 'hosting' : 'joined')
      this.options.onPeerConnected()
    }
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type: string; data?: number[]; state?: MidiState }
      if (message.type === 'midi' && Array.isArray(message.data)) this.options.onMidi(message.data)
      if (message.type === 'state' && message.state) this.options.onState(message.state)
    }
  }

  private send(message: object) {
    this.channels.forEach((channel) => { if (channel.readyState === 'open') channel.send(JSON.stringify(message)) })
  }

  private signal(message: Signal) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ ...message, roomCode: this.roomCode }))
  }
}
