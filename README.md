# ChordLens MIDI

ChordLens reads a connected MIDI keyboard and shows the detected chord instantly for piano, guitar, and bass players.

It can also host a live session: the pianist's MIDI events are sent directly to connected viewers, so a band can follow along from their own devices.

## Run locally

```bash
npm install
npm run live-server
```

In another terminal:

```bash
npm run dev
```

Open the app at the URL Vite prints. Use Chrome or Edge for Web MIDI support.

## Live sessions

For a local network session, start Vite with `npm run dev -- --host`, then share the host machine's Vite URL. The host starts a room from Setup; listeners enter the six-character code.

For public sharing, expose the Vite server with a HTTPS tunnel or deploy it with the signaling service. The client uses `/signal` for WebSocket signaling and sends MIDI directly between the host and listeners using WebRTC.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
