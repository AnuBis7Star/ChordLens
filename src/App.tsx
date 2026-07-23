import { lazy, type CSSProperties, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { detectChord } from './lib/chords'
import { EMPTY_MIDI_STATE, transposeMidiNotes, updateMidiState } from './lib/midi'
import { toNotationNotes } from './lib/notation'
import { getChordSmoothingDelay } from './lib/smoothing'
import { LiveRoom, type CreateSignalingConnection, type RoomContext, type RoomMode, type RoomStatus } from './lib/liveRoom'

export type { CreateSignalingConnection, RoomContext, Signal, SignalingConnection } from './lib/liveRoom'

const ROLES = ['pianist', 'guitarist', 'bassist'] as const
const KEY_ROOTS = [
  { label: 'C', major: 'C', minor: 'Cm' },
  { label: 'D♭', major: 'Db', minor: 'C#m' },
  { label: 'D', major: 'D', minor: 'Dm' },
  { label: 'E♭', major: 'Eb', minor: 'Ebm' },
  { label: 'E', major: 'E', minor: 'Em' },
  { label: 'F', major: 'F', minor: 'Fm' },
  { label: 'G♭', major: 'Gb', minor: 'F#m' },
  { label: 'G', major: 'G', minor: 'Gm' },
  { label: 'A♭', major: 'Ab', minor: 'G#m' },
  { label: 'A', major: 'A', minor: 'Am' },
  { label: 'B♭', major: 'Bb', minor: 'Bbm' },
  { label: 'B', major: 'B', minor: 'Bm' },
] as const
type Role = (typeof ROLES)[number]
type KeyRoot = (typeof KEY_ROOTS)[number]
export type ChordLensKeySignature = KeyRoot['major'] | KeyRoot['minor']
type Picker = 'midi' | 'key' | null
type Preferences = {
  selectedInputId?: string
  keySignature?: string
  role?: Role
  smoothingEnabled?: boolean
  scoreVisible?: boolean
  roomMode?: RoomMode
  roomCode?: string
  followHostKey?: boolean
  shareCurrentSong?: boolean
  followHostSong?: boolean
  inputTranspose?: number
  displayTranspose?: number
}

const DEFAULT_PREFERENCES_KEY = 'chordlens-midi:preferences'
const DEMO_NOTES = [36, 40, 43] as const
const VALID_KEY_SIGNATURES = new Set<ChordLensKeySignature>(KEY_ROOTS.flatMap((key) => [key.major, key.minor]))
const GrandStaff = lazy(() => import('./components/GrandStaff').then(({ GrandStaff }) => ({ default: GrandStaff })))

function loadPreferences(preferencesKey: string): Preferences {
  try {
    const preferences = JSON.parse(window.localStorage.getItem(preferencesKey) ?? '{}') as Preferences
    return {
      selectedInputId: typeof preferences.selectedInputId === 'string' ? preferences.selectedInputId : undefined,
      keySignature: VALID_KEY_SIGNATURES.has(preferences.keySignature as ChordLensKeySignature) ? preferences.keySignature : undefined,
      role: ROLES.includes(preferences.role as Role) ? preferences.role : undefined,
      smoothingEnabled: typeof preferences.smoothingEnabled === 'boolean' ? preferences.smoothingEnabled : undefined,
      scoreVisible: typeof preferences.scoreVisible === 'boolean' ? preferences.scoreVisible : undefined,
      roomMode: preferences.roomMode === 'host' || preferences.roomMode === 'viewer' ? preferences.roomMode : undefined,
      roomCode: /^[A-Z0-9]{6}$/.test(preferences.roomCode ?? '') ? preferences.roomCode : undefined,
      followHostKey: typeof preferences.followHostKey === 'boolean' ? preferences.followHostKey : undefined,
      shareCurrentSong: typeof preferences.shareCurrentSong === 'boolean' ? preferences.shareCurrentSong : undefined,
      followHostSong: typeof preferences.followHostSong === 'boolean' ? preferences.followHostSong : undefined,
      inputTranspose: Number.isInteger(preferences.inputTranspose) && Math.abs(preferences.inputTranspose!) <= 11 ? preferences.inputTranspose : undefined,
      displayTranspose: Number.isInteger(preferences.displayTranspose) && Math.abs(preferences.displayTranspose!) <= 11 ? preferences.displayTranspose : undefined,
    }
  } catch {
    return {}
  }
}

function mobileChordSize(label: string): string {
  const length = Array.from(label).length
  if (length <= 2) return 'clamp(6rem, 36vw, 14rem)'
  if (length <= 4) return 'clamp(5rem, 28vw, 10rem)'
  if (length <= 6) return 'clamp(4.3rem, 23vw, 8rem)'
  if (length <= 9) return 'clamp(3.4rem, 17vw, 6.2rem)'
  return 'clamp(2.8rem, 13vw, 5rem)'
}

function createRoomCode() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6).toUpperCase().padEnd(6, '0')
}

type ChordLensBaseProps = {
  embedded?: boolean
  homeHref?: string
  preferencesKey?: string
  signalingUrl?: string
  createSignalingConnection?: CreateSignalingConnection
  activeSongId?: string | null
  onActiveSongIdChange?: (songId: string) => void
}

export type ChordLensProps = ChordLensBaseProps & (
  | { keySignature?: undefined; onKeySignatureChange?: undefined }
  | { keySignature: ChordLensKeySignature; onKeySignatureChange: (keySignature: ChordLensKeySignature) => void }
)

export default function App({
  embedded = false,
  homeHref = '/',
  preferencesKey = DEFAULT_PREFERENCES_KEY,
  signalingUrl,
  createSignalingConnection,
  keySignature: controlledKeySignature,
  onKeySignatureChange,
  activeSongId,
  onActiveSongIdChange,
}: ChordLensProps) {
  const [preferences] = useState(() => loadPreferences(preferencesKey))
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [midiError, setMidiError] = useState<string | null>(null)
  const [deviceRevision, setDeviceRevision] = useState(0)
  const [selectedInputId, setSelectedInputId] = useState(preferences.selectedInputId ?? '')
  const [midiState, setMidiState] = useState(EMPTY_MIDI_STATE)
  const [localKeySignature, setLocalKeySignature] = useState<ChordLensKeySignature>((preferences.keySignature as ChordLensKeySignature) ?? 'C')
  const keySignature = controlledKeySignature ?? localKeySignature
  const [role, setRole] = useState<Role>(preferences.role ?? 'pianist')
  const [smoothingEnabled, setSmoothingEnabled] = useState(preferences.smoothingEnabled ?? false)
  const [scoreVisible, setScoreVisible] = useState(preferences.scoreVisible ?? true)
  const [inputTranspose, setInputTranspose] = useState(preferences.inputTranspose ?? 0)
  const [displayTranspose, setDisplayTranspose] = useState(preferences.displayTranspose ?? 0)
  const [demoPlaying, setDemoPlaying] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [showReadyPrompt, setShowReadyPrompt] = useState(true)
  const [openPicker, setOpenPicker] = useState<Picker>(null)
  const [roomMode, setRoomMode] = useState<RoomMode>(preferences.roomMode ?? 'host')
  const [roomCode, setRoomCode] = useState(preferences.roomCode ?? createRoomCode)
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('offline')
  const [roomMessage, setRoomMessage] = useState('')
  const [followHostKey, setFollowHostKey] = useState(preferences.followHostKey ?? false)
  const [shareCurrentSong, setShareCurrentSong] = useState(preferences.shareCurrentSong ?? false)
  const [followHostSong, setFollowHostSong] = useState(preferences.followHostSong ?? false)
  const setupRef = useRef<HTMLDetailsElement>(null)
  const roomRef = useRef<LiveRoom | null>(null)
  const midiStateRef = useRef(EMPTY_MIDI_STATE)
  const contextRef = useRef({ keySignature, activeSongId, followHostKey, shareCurrentSong, followHostSong, onKeySignatureChange, onActiveSongIdChange })

  contextRef.current = { keySignature, activeSongId, followHostKey, shareCurrentSong, followHostSong, onKeySignatureChange, onActiveSongIdChange }

  const changeKeySignature = (nextKeySignature: ChordLensKeySignature) => {
    if (onKeySignatureChange) onKeySignatureChange(nextKeySignature)
    else setLocalKeySignature(nextKeySignature)
  }

  useEffect(() => {
    midiStateRef.current = midiState
  }, [midiState])

  useEffect(() => () => roomRef.current?.leave(), [])

  useEffect(() => {
    const resumeRoom = () => {
      if (document.visibilityState === 'visible') roomRef.current?.resume()
    }
    document.addEventListener('visibilitychange', resumeRoom)
    window.addEventListener('pageshow', resumeRoom)
    window.addEventListener('online', resumeRoom)
    return () => {
      document.removeEventListener('visibilitychange', resumeRoom)
      window.removeEventListener('pageshow', resumeRoom)
      window.removeEventListener('online', resumeRoom)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(preferencesKey, JSON.stringify({
        selectedInputId,
        keySignature: controlledKeySignature === undefined ? keySignature : preferences.keySignature,
        role,
        smoothingEnabled,
        scoreVisible,
        roomMode,
        roomCode,
        followHostKey,
        shareCurrentSong,
        followHostSong,
        inputTranspose,
        displayTranspose,
      }))
    } catch {
      // Browser storage can be disabled; the app remains usable for this session.
    }
  }, [controlledKeySignature, displayTranspose, followHostKey, followHostSong, inputTranspose, keySignature, preferences.keySignature, preferencesKey, role, roomCode, roomMode, scoreVisible, selectedInputId, shareCurrentSong, smoothingEnabled])

  useEffect(() => {
    if (roomMode !== 'host') return
    roomRef.current?.sendContext({ keySignature, activeSongId: shareCurrentSong ? activeSongId : undefined })
  }, [activeSongId, keySignature, roomMode, shareCurrentSong])

  useEffect(() => {
    const closeSetupOnOutsideClick = (event: PointerEvent) => {
      if (setupRef.current?.open && !setupRef.current.contains(event.target as Node)) {
        setupRef.current.open = false
        setOpenPicker(null)
      }
    }
    const closeSetupOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenPicker(null)
      if (setupRef.current) setupRef.current.open = false
    }

    document.addEventListener('pointerdown', closeSetupOnOutsideClick)
    document.addEventListener('keydown', closeSetupOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeSetupOnOutsideClick)
      document.removeEventListener('keydown', closeSetupOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiError('Web MIDI is not available in this browser. Use Chrome or Edge.')
      return
    }

    let disposed = false
    navigator.requestMIDIAccess({ sysex: false }).then(
      (access) => {
        if (disposed) return
        access.onstatechange = () => setDeviceRevision((revision) => revision + 1)
        setMidiAccess(access)
      },
      () => setMidiError('MIDI access was not granted.'),
    )

    return () => { disposed = true }
  }, [])

  const inputs = useMemo(
    () => midiAccess ? [...midiAccess.inputs.values()] : [],
    [midiAccess, deviceRevision],
  )
  const selectedInput = inputs.find((input) => input.id === selectedInputId) ?? inputs[0]
  const selectedKeyRoot = KEY_ROOTS.find((key) => key.major === keySignature || key.minor === keySignature) ?? KEY_ROOTS[0]
  const isMinorKey = selectedKeyRoot.minor === keySignature
  const displayKeyRoot = KEY_ROOTS[(KEY_ROOTS.indexOf(selectedKeyRoot) + displayTranspose + 12) % 12]
  const displayKeySignature = isMinorKey ? displayKeyRoot.minor : displayKeyRoot.major
  const keyLabel = `${displayKeyRoot.label} ${isMinorKey ? 'minor' : 'major'}`

  useEffect(() => {
    if (selectedInput && selectedInput.id !== selectedInputId) setSelectedInputId(selectedInput.id)
  }, [selectedInput, selectedInputId])

  useEffect(() => {
    setMidiState(EMPTY_MIDI_STATE)
    setDemoPlaying(false)
    if (!selectedInput) return

    const onMidiMessage = (event: MIDIMessageEvent) => {
      if (!event.data) return
      setMidiState((state) => updateMidiState(state, event.data!))
      roomRef.current?.sendMidi(event.data)
    }

    selectedInput.onmidimessage = onMidiMessage
    return () => { selectedInput.onmidimessage = null }
  }, [selectedInput])

  const instrumentTranspose = inputTranspose + midiState.automaticTranspose
  const sourceNotes = useMemo(
    () => transposeMidiNotes(midiState.soundingNotes, instrumentTranspose),
    [instrumentTranspose, midiState.soundingNotes],
  )
  const isListening = sourceNotes.length === 0
  const [analysisNotes, setAnalysisNotes] = useState(sourceNotes)

  useEffect(() => {
    const delay = getChordSmoothingDelay(smoothingEnabled, sourceNotes.length)
    if (delay === 0) {
      setAnalysisNotes(sourceNotes)
      return
    }

    const timer = window.setTimeout(() => setAnalysisNotes(sourceNotes), delay)
    return () => window.clearTimeout(timer)
  }, [smoothingEnabled, sourceNotes])

  useEffect(() => {
    if (!isListening) {
      setHasPlayed(true)
      setShowReadyPrompt(false)
      return
    }
    if (!hasPlayed) return

    setShowReadyPrompt(false)
    const timer = window.setTimeout(() => setShowReadyPrompt(true), 5_000)
    return () => window.clearTimeout(timer)
  }, [hasPlayed, isListening])

  const displayNotes = useMemo(
    () => transposeMidiNotes(analysisNotes, displayTranspose),
    [analysisNotes, displayTranspose],
  )
  const chordNotes = toNotationNotes(displayNotes, displayKeySignature).map((note) => note.key.replace('/', ''))
  const result = useMemo(() => {
    try {
      return { detection: detectChord(chordNotes), error: null }
    } catch (error) {
      return { detection: null, error: error instanceof Error ? error.message : 'Could not read these notes' }
    }
  }, [displayKeySignature, displayNotes])

  const activeView = result.detection?.views[role]
  const deviceName = selectedInput?.name ?? 'No MIDI device'
  const chordLengthClass = (activeView?.main.length ?? 0) > 9 ? 'is-long' : ''
  const chordStyle = { '--mobile-chord-size': mobileChordSize(activeView?.main ?? '') } as CSSProperties
  const roomState = roomStatus === 'hosting' ? 'Running' : roomStatus === 'joined' ? 'Connected' : roomStatus === 'connecting' ? 'Connecting' : roomStatus === 'error' ? 'Error' : 'Disconnected'
  const liveStatus = roomMode === 'host' ? `Host ${roomCode || '------'} · ${roomState}` : `Connected to ${roomCode || '------'} · ${roomState}`
  const toggleDemoNotes = () => {
    DEMO_NOTES.forEach((note) => {
      const data = [demoPlaying ? 0x80 : 0x90, note, demoPlaying ? 0 : 96]
      setMidiState((state) => updateMidiState(state, data))
      roomRef.current?.sendMidi(data)
    })
    setDemoPlaying(!demoPlaying)
  }

  const startRoom = async () => {
    const code = roomCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setRoomStatus('error')
      setRoomMessage('Use a six-character room code.')
      return
    }
    const room = new LiveRoom({
      signalingUrl,
      createSignalingConnection,
      onMidi: (data) => setMidiState((state) => updateMidiState(state, data)),
      onState: setMidiState,
      onContext: (context: RoomContext) => {
        const current = contextRef.current
        if (current.followHostKey && VALID_KEY_SIGNATURES.has(context.keySignature as ChordLensKeySignature)) {
          if (current.onKeySignatureChange) current.onKeySignatureChange(context.keySignature as ChordLensKeySignature)
          else setLocalKeySignature(context.keySignature as ChordLensKeySignature)
        }
        if (current.followHostSong && typeof context.activeSongId === 'string') current.onActiveSongIdChange?.(context.activeSongId)
      },
      onStatus: (status, message = '') => { setRoomStatus(status); setRoomMessage(message) },
      onPeerConnected: () => {
        room.sendState(midiStateRef.current)
        if (roomMode !== 'host') return
        const current = contextRef.current
        room.sendContext({ keySignature: current.keySignature, activeSongId: current.shareCurrentSong ? current.activeSongId : undefined })
      },
    })
    roomRef.current = room
    try {
      if (roomMode === 'host') await room.host(code)
      else await room.join(code)
    } catch {
      // The status callback already carries the useful connection error.
    }
  }

  return (
    <div className={embedded ? 'chordlens-shell is-embedded' : 'chordlens-shell'}>
    <main className="live-app">
      <header className="live-header">
        <a className="wordmark" href={homeHref} aria-label="ChordLens MIDI home">
          ChordLens <span>MIDI</span>
        </a>

        <div className="header-tools">
          <p className="connection-status" aria-live="polite">
            <span className={roomStatus === 'hosting' || roomStatus === 'joined' ? 'status-mark connected' : 'status-mark'} />
            {liveStatus}
          </p>
          <details ref={setupRef} className="setup">
            <summary onClick={(event) => {
              event.preventDefault()
              if (setupRef.current) setupRef.current.open = !setupRef.current.open
              if (!setupRef.current?.open) setOpenPicker(null)
            }}>Setup</summary>
            <div className="setup-panel">
              <div className="setup-field">
                <span className="setup-label">MIDI input</span>
                <button className="setup-trigger" type="button" aria-expanded={openPicker === 'midi'} onClick={() => setOpenPicker(openPicker === 'midi' ? null : 'midi')}>
                  {selectedInput ? deviceName : 'No MIDI devices found'}<span aria-hidden="true">⌄</span>
                </button>
                <button className="setup-trigger demo-input" type="button" aria-pressed={demoPlaying} onClick={toggleDemoNotes}>
                  {demoPlaying ? 'Release test notes' : 'Hold low C chord'}
                </button>
                {openPicker === 'midi' && <div className="picker-menu midi-picker" role="listbox" aria-label="MIDI input">
                  {inputs.map((input) => <button key={input.id} type="button" className={input.id === selectedInput?.id ? 'picker-option active' : 'picker-option'} onClick={() => { setSelectedInputId(input.id); setOpenPicker(null) }}>
                    {input.name ?? 'Unnamed MIDI device'}{input.id === selectedInput?.id && <span aria-hidden="true">✓</span>}
                  </button>)}
                </div>}
              </div>
              <div className="setup-field">
                <span className="setup-label">Notation key</span>
                <div className="key-controls">
                  <div className="key-picker">
                    <button className="setup-trigger key-trigger" type="button" aria-expanded={openPicker === 'key'} onClick={() => setOpenPicker(openPicker === 'key' ? null : 'key')}>
                      {selectedKeyRoot.label}<span aria-hidden="true">⌄</span>
                    </button>
                    {openPicker === 'key' && <div className="picker-menu key-menu" role="listbox" aria-label="Notation key">
                      <div className="key-grid">
                        {KEY_ROOTS.map((key) => <button key={key.label} type="button" className={key.label === selectedKeyRoot.label ? 'key-option active' : 'key-option'} onClick={() => { changeKeySignature(isMinorKey ? key.minor : key.major); setOpenPicker(null) }}>
                          {key.label}
                        </button>)}
                      </div>
                    </div>}
                  </div>
                  <div className="mode-tabs" role="tablist" aria-label="Key mode">
                    <button type="button" role="tab" aria-selected={!isMinorKey} className={!isMinorKey ? 'active' : ''} onClick={() => { changeKeySignature(selectedKeyRoot.major); setOpenPicker(null) }}>Major</button>
                    <button type="button" role="tab" aria-selected={isMinorKey} className={isMinorKey ? 'active' : ''} onClick={() => { changeKeySignature(selectedKeyRoot.minor); setOpenPicker(null) }}>Minor</button>
                  </div>
                </div>
              </div>
              <label className="transpose-control">
                <span>Manual instrument transpose<small>Auto MIDI transpose: {midiState.automaticTranspose > 0 ? '+' : ''}{midiState.automaticTranspose}</small></span>
                <input aria-label="Instrument transpose in semitones" type="number" min={-11} max={11} value={inputTranspose} onChange={(event) => setInputTranspose(Math.max(-11, Math.min(11, Number(event.target.value) || 0)))} />
              </label>
              <label className="transpose-control">
                <span>Display transpose<small>Changes the chords and score shown in the app.</small></span>
                <input aria-label="Display transpose in semitones" type="number" min={-11} max={11} value={displayTranspose} onChange={(event) => setDisplayTranspose(Math.max(-11, Math.min(11, Number(event.target.value) || 0)))} />
              </label>
              <label className="toggle-control" htmlFor="score-visible">
                <span>Score display<small>{scoreVisible ? 'Shown in all views' : 'Hidden in all views'}</small></span>
                <input id="score-visible" type="checkbox" checked={scoreVisible} onChange={(event) => setScoreVisible(event.target.checked)} />
              </label>
              <label className="toggle-control" htmlFor="chord-smoothing">
                <span>Chord smoothing<small>{smoothingEnabled ? 'On · 180 ms stable read' : 'Off · instant read'}</small></span>
                <input id="chord-smoothing" type="checkbox" checked={smoothingEnabled} onChange={(event) => setSmoothingEnabled(event.target.checked)} />
              </label>
              <div className="live-session">
                <span className="setup-label">Live session</span>
                <div className="session-tabs" role="tablist" aria-label="Live session mode">
                  <button type="button" role="tab" aria-selected={roomMode === 'host'} className={roomMode === 'host' ? 'active' : ''} onClick={() => setRoomMode('host')}>Host</button>
                  <button type="button" role="tab" aria-selected={roomMode === 'viewer'} className={roomMode === 'viewer' ? 'active' : ''} onClick={() => setRoomMode('viewer')}>Join</button>
                </div>
                <div className="session-controls">
                  <input aria-label="Live session code" value={roomCode} maxLength={6} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
                  {roomStatus === 'hosting' || roomStatus === 'joined'
                    ? <button type="button" className="session-button" onClick={() => roomRef.current?.leave()}>Leave</button>
                    : <button type="button" className="session-button" onClick={startRoom}>{roomMode === 'host' ? 'Start' : 'Join'}</button>}
                </div>
                {roomMode === 'host' && activeSongId !== undefined ? <label className="toggle-control" htmlFor="share-current-song">
                  <span>Share current song<small>{shareCurrentSong ? 'On · sends the active song only' : 'Off · song changes stay local'}</small></span>
                  <input id="share-current-song" type="checkbox" checked={shareCurrentSong} onChange={(event) => setShareCurrentSong(event.target.checked)} />
                </label> : null}
                {roomMode === 'viewer' ? <label className="toggle-control" htmlFor="follow-host-key">
                  <span>Follow host key<small>{followHostKey ? 'On · notation follows the host' : 'Off · use this device key'}</small></span>
                  <input id="follow-host-key" type="checkbox" checked={followHostKey} onChange={(event) => setFollowHostKey(event.target.checked)} />
                </label> : null}
                {roomMode === 'viewer' && onActiveSongIdChange ? <label className="toggle-control" htmlFor="follow-host-song">
                  <span>Follow host song<small>{followHostSong ? 'On · opens the host active song' : 'Off · navigation stays local'}</small></span>
                  <input id="follow-host-song" type="checkbox" checked={followHostSong} onChange={(event) => setFollowHostSong(event.target.checked)} />
                </label> : null}
                <small>{roomStatus === 'hosting' ? 'Share this code. Your MIDI is sent directly to listeners.' : roomStatus === 'joined' ? 'Connected directly to the host.' : roomMessage || 'Host a code, or enter one to watch.'}</small>
              </div>
              {midiError && <p className="setup-error">{midiError}</p>}
            </div>
          </details>
        </div>
      </header>

      <section className={scoreVisible ? 'performance score-visible' : 'performance score-hidden'} aria-label="Live chord display">
        <section className={`chord-readout role-${role}`} aria-live="polite">
          <div className="role-switcher" aria-label="Band role">
            {ROLES.map((item) => (
              <button key={item} type="button" className={role === item ? 'active' : ''} onClick={() => setRole(item)}>
                {item}
              </button>
            ))}
          </div>

          {showReadyPrompt || (!isListening && analysisNotes.length > 0) ? <p className={showReadyPrompt ? 'reading-label ready-arrival ready-label' : 'reading-label'}>{showReadyPrompt ? 'Ready for input' : `${role} readout`}</p> : null}
          <output className={`${showReadyPrompt ? 'chord-symbol waiting ready-arrival ready-message' : 'chord-symbol'} ${chordLengthClass}`} style={chordStyle}>
            {showReadyPrompt ? 'Play a chord' : !isListening && analysisNotes.length > 0 ? activeView?.main : ''}
          </output>
          {showReadyPrompt || (!isListening && analysisNotes.length > 0) ? <div className={showReadyPrompt ? 'reading-detail ready-arrival ready-instruction' : 'reading-detail'}>
            {showReadyPrompt
              ? <p>Connect a keyboard, then play normally.</p>
              : activeView?.secondary.map((line) => <p key={line}>{line}</p>)}
          </div> : null}
        </section>

        {scoreVisible && <section className="notation-panel" aria-label={`Score in ${keyLabel}`}>
          <Suspense fallback={<div className="grand-staff" />}>
            <GrandStaff notes={displayNotes} keySignature={displayKeySignature} />
          </Suspense>
        </section>}
      </section>

      <footer className="live-footer">
        <p>{selectedInput ? deviceName : 'Choose a MIDI device in Setup'}</p>
        <p>Sustain pedal: <strong>{midiState.sustain ? 'Down' : 'Up'}</strong></p>
      </footer>
    </main>
    </div>
  )
}
