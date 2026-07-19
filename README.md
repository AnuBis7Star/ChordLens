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

## Configuration and privacy

The signaling service listens on port `8787` by default. Set `VITE_SIGNALING_URL` only when it is hosted separately; this browser-visible value must never contain a password, token, or other secret.

Room codes are intended for lightweight live collaboration. Anyone with a code can request access, so do not use them to share sensitive information.

## Betel Band Planner integration

This repository is the source of truth for both the standalone app and the native Betel Band Planner tool. It exports the React application from `chordlens-midi`, the scoped stylesheet from `chordlens-midi/styles.css`, and the reusable WebSocket handler from `chordlens-midi/signaling`.

Native integrations can optionally control the notation key with the exported `ChordLensKeySignature`, `keySignature`, and `onKeySignatureChange` contract. They can also provide `activeSongId` and `onActiveSongIdChange` so the existing live room can share the host key and, when both devices opt in through Setup, the active song identifier. Controlled keys are not written over the standalone saved key.

Feature branches merge into `develop`. A tested release merges `develop` into `main`. After CI passes on `main`, the release workflow pins Betel Band Planner to that exact commit, runs Betel's compatibility checks, updates Betel `main`, and Hostinger redeploys it. Betel does not maintain a second copy of the ChordLens engine.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
