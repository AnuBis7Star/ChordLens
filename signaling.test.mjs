import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { test } from 'vitest'
import { WebSocket } from 'ws'

import { attachChordLensSignaling } from './signaling.mjs'

function nextMessage(socket) {
  return new Promise((resolve) => socket.once('message', (data) => resolve(JSON.parse(data.toString()))))
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
