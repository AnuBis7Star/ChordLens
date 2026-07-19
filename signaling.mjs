import { randomUUID } from 'node:crypto'

import { WebSocket, WebSocketServer } from 'ws'

export function attachChordLensSignaling(server, { path = '/signal', hostGraceMs = 30 * 60 * 1000 } = {}) {
  const rooms = new Map()
  const wss = new WebSocketServer({ noServer: true })

  const upgrade = (request, socket, head) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== path) return
    wss.handleUpgrade(request, socket, head, (websocket) => wss.emit('connection', websocket))
  }

  server.on('upgrade', upgrade)
  wss.on('connection', (socket) => {
    const id = randomUUID()
    let roomCode = ''
    let role = ''

    socket.on('message', (raw) => {
      let message
      try { message = JSON.parse(raw.toString()) } catch { return }
      if (!roomCode && (message.type === 'host' || message.type === 'viewer')) {
        roomCode = String(message.roomCode ?? '').toUpperCase()
        role = message.type
        if (!/^[A-Z0-9]{6}$/.test(roomCode)) return socket.send(JSON.stringify({ type: 'error', message: 'Use a six-character room code.' }))
        let room = rooms.get(roomCode)
        if (role === 'host') {
          if (room?.host) return socket.send(JSON.stringify({ type: 'error', message: 'That room code is already in use.' }))
          if (room) {
            clearTimeout(room.expiry)
            room.host = { id, socket }
          } else {
            room = { host: { id, socket }, viewers: new Map(), expiry: null }
            rooms.set(roomCode, room)
          }
          socket.send(JSON.stringify({ type: 'hosted', id }))
          room.viewers.forEach((viewer, viewerId) => {
            if (viewer.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'peer-joined', from: viewerId }))
          })
          return
        }
        if (!room) return socket.send(JSON.stringify({ type: 'error', message: 'That session is unavailable.' }))
        room.viewers.set(id, socket)
        socket.send(JSON.stringify({ type: 'joined', id }))
        if (room.host) room.host.socket.send(JSON.stringify({ type: 'peer-joined', from: id }))
        return
      }
      const room = rooms.get(roomCode)
      const recipient = role === 'host' ? room?.viewers.get(message.to) : room?.host?.socket
      if (recipient?.readyState === WebSocket.OPEN && ['offer', 'answer', 'candidate'].includes(message.type)) recipient.send(JSON.stringify({ ...message, from: id }))
    })

    socket.on('close', () => {
      const room = rooms.get(roomCode)
      if (!room) return
      if (role === 'host' && room.host?.id === id) {
        room.host = null
        room.expiry = setTimeout(() => rooms.delete(roomCode), hostGraceMs)
      } else if (role === 'viewer') room.viewers.delete(id)
    })
  })

  return {
    close() {
      server.off('upgrade', upgrade)
      rooms.forEach((room) => clearTimeout(room.expiry))
      rooms.clear()
      wss.close()
    },
  }
}
