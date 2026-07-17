import { useEffect, useRef } from 'react'
import {
  Accidental,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} from 'vexflow/bravura'
import type { MidiNoteInput } from '../lib/chords'
import { toNotationNotes } from '../lib/notation'

interface GrandStaffProps {
  notes: MidiNoteInput[]
  keySignature: string
}

export function GrandStaff({ notes, keySignature }: GrandStaffProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const draw = () => {
      container.replaceChildren()
      const width = Math.max(300, Math.min(460, container.clientWidth || 460))
      const scale = 1.5
      const renderer = new Renderer(container, Renderer.Backends.SVG)
      renderer.resize(width, 250)
      const context = renderer.getContext()
      context.scale(scale, scale)
      const treble = new Stave(18 / scale, 6 / scale, (width - 36) / scale).addClef('treble').addKeySignature(keySignature)
      const bass = new Stave(18 / scale, 82, (width - 36) / scale).addClef('bass').addKeySignature(keySignature)

      treble.setContext(context).draw()
      bass.setContext(context).draw()
      new StaveConnector(treble, bass).setType('brace').setContext(context).draw()
      new StaveConnector(treble, bass).setType('singleLeft').setContext(context).draw()

      const notationNotes = toNotationNotes(notes, keySignature)
      drawChord(notationNotes.filter((note) => note.staff === 'treble').map((note) => note.key), treble)
      drawChord(notationNotes.filter((note) => note.staff === 'bass').map((note) => note.key), bass)

      function drawChord(keys: string[], stave: Stave) {
        if (keys.length === 0) return
        const note = new StaveNote({
          clef: stave === treble ? 'treble' : 'bass',
          keys,
          duration: 'w',
        })
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables([note])
        Accidental.applyAccidentals([voice], keySignature)
        new Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX())
        voice.draw(context, stave)
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [notes, keySignature])

  return <div ref={containerRef} className="grand-staff" aria-label={`Notes on a grand staff in ${keySignature}`} />
}
