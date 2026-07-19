import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { test } from 'vitest'
import { WebSocket } from 'ws'

import { attachChordLensSignaling } from './signaling.mjs'

function nextMessage(socket) {
  return nextMessages(socket).then(([message]) => message)
}

function nextMessages(socket, count = 1) {
  return new Promise((resolve) => {
    const messages = []
    const onMessage = (data) => {
      messages.push(JSON.parse(data.toString()))
      if (messages.length === count) {
        socket.off('message', onMessage)
        resolve(messages)
      }
    }
    socket.on('message', onMessage)
  })
}

test('fans signaling from one host to multiple viewers', async () => {
  const server = createServer()
  const signaling = attachChordLensSignaling(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const host = new WebSocket(`ws://127.0.0.1:${port}/signal`)
  const viewer = new WebSocket(`ws://127.0.0.1:${port}/signal`)

  await Promise.all([
    new Promise((resolve) => host.once('open', resolve)),
    new Promise((resolve) => viewer.once('open', resolve)),
  ])

  host.send(JSON.stringify({ type: 'host', roomCode: 'ABC123' }))
  assert.equal((await nextMessage(host)).type, 'hosted')
  const joined = nextMessage(viewer)
  const peerJoined = nextMessage(host)
  viewer.send(JSON.stringify({ type: 'viewer', roomCode: 'ABC123' }))
  assert.equal((await joined).type, 'joined')
  assert.equal((await peerJoined).type, 'peer-joined')

  host.terminate()
  viewer.terminate()
  signaling.close()
  await new Promise((resolve) => server.close(resolve))
})

test('keeps a room and its viewers while the host reconnects', async () => {
  const server = createServer()
  const signaling = attachChordLensSignaling(server, { hostGraceMs: 50 })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/signal`)
    await new Promise((resolve) => socket.once('open', resolve))
    return socket
  }
  const host = await connect()
  const viewer = await connect()

  host.send(JSON.stringify({ type: 'host', roomCode: 'ABC123' }))
  await nextMessage(host)
  viewer.send(JSON.stringify({ type: 'viewer', roomCode: 'ABC123' }))
  await Promise.all([nextMessage(viewer), nextMessage(host)])
  host.close()
  await new Promise((resolve) => host.once('close', resolve))

  const returningHost = await connect()
  const messages = nextMessages(returningHost, 2)
  returningHost.send(JSON.stringify({ type: 'host', roomCode: 'ABC123' }))
  assert.deepEqual((await messages).map(({ type }) => type), ['hosted', 'peer-joined'])

  returningHost.terminate()
  viewer.terminate()
  signaling.close()
  await new Promise((resolve) => server.close(resolve))
})
