import { createServer } from 'node:http'
import { attachChordLensSignaling } from './signaling.mjs'

const port = process.env.PORT ?? 8787
const server = createServer()
attachChordLensSignaling(server)
server.listen(port, '0.0.0.0', () => console.log(`ChordLens live server on port ${port}`))
