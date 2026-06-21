/** PresenterScreen — Fullscreen display window for live presentation
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useState, useEffect, useRef } from 'react'
import {
  createPresenterChannel,
  type PresentationMessage,
} from '../utils/presentationChannel'

type DisplayMode = 'lyrics' | 'welcome' | 'black'

export default function PresenterScreen() {
  const [mode, setMode] = useState<DisplayMode>('welcome')
  const [lyrics, setLyrics] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [welcomeImageUrl, setWelcomeImageUrl] = useState<string>('/welcome.png')
  const [textVerticalOffset, setTextVerticalOffset] = useState<number>(50)
  const videoRef = useRef<HTMLVideoElement>(null)
  const channelRef = useRef<ReturnType<typeof createPresenterChannel> | null>(null)

  // Listen for control messages
  useEffect(() => {
    channelRef.current = createPresenterChannel((msg: PresentationMessage) => {
      switch (msg.type) {
        case 'SHOW_LYRICS':
          setMode('lyrics')
          setLyrics(msg.lyrics)
          if (msg.background) setBackgroundUrl(msg.background)
          break
        case 'SHOW_WELCOME':
          setMode('welcome')
          if (msg.welcomeImageUrl) setWelcomeImageUrl(msg.welcomeImageUrl)
          if (msg.background) setBackgroundUrl(msg.background)
          break
        case 'SHOW_BLACK':
          setMode('black')
          break
        case 'SET_BACKGROUND':
          setBackgroundUrl(msg.url)
          break
        case 'SET_TEXT_POSITION':
          setTextVerticalOffset(Math.max(0, Math.min(100, msg.offset)))
          break
        case 'CLOSE':
          window.close()
          break
      }
    })

    return () => {
      channelRef.current?.close()
    }
  }, [])

  // Play video background when URL changes
  useEffect(() => {
    if (videoRef.current && backgroundUrl) {
      videoRef.current.play().catch(() => {})
    }
  }, [backgroundUrl])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'black', overflow: 'hidden' }}>
      {/* Video background */}
      {backgroundUrl && mode !== 'black' && (
        <video
          ref={videoRef}
          src={backgroundUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }}
          loop
          muted
          playsInline
        />
      )}

      {/* Content overlay */}
      {mode === 'black' ? (
        <div style={{ width: '100%', height: '100%', background: 'black' }} />
      ) : mode === 'welcome' ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'black' }}>
          <img
            src={welcomeImageUrl}
            alt="Welcome"
            style={{ maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            padding: 'var(--space-2xl) var(--space-4xl)',
          }}
        >
          {/* Top spacer — grows as offset increases (pushes content down) */}
          <div style={{ flex: `${textVerticalOffset} 0 0` }} />
          {/* Lyric content — horizontally centered via alignSelf (not marginLeft:auto) */}
          <div style={{ alignSelf: 'center', textAlign: 'center', maxWidth: '64rem' }}>
            {lyrics.split('\n').map((line, i) => (
              <p
                key={i}
                style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, color: 'white', lineHeight: 1.4, marginBottom: 'var(--space-sm)', fontFamily: 'var(--font-display)' }}
              >
                {line}
              </p>
            ))}
          </div>
          {/* Bottom spacer — shrinks as offset increases */}
          <div style={{ flex: `${100 - textVerticalOffset} 0 0` }} />
        </div>
      )}
    </div>
  )
}
