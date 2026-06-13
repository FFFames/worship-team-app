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
          if (msg.background) setBackgroundUrl(msg.background)
          break
        case 'SHOW_BLACK':
          setMode('black')
          break
        case 'SET_BACKGROUND':
          setBackgroundUrl(msg.url)
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
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '5rem', marginBottom: 'var(--space-xl)' }}>♫</div>
            <h1 style={{ fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 300, color: 'white', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', margin: 0 }}>
              Welcome
            </h1>
            <p style={{ fontSize: '1.25rem', color: 'rgba(255, 255, 255, 0.6)', marginTop: 'var(--space-lg)' }}>
              Please stand by
            </p>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '0 var(--space-4xl)' }}>
          <div style={{ textAlign: 'center', maxWidth: '64rem' }}>
            {lyrics.split('\n').map((line, i) => (
              <p
                key={i}
                style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, color: 'white', lineHeight: 1.4, marginBottom: 'var(--space-sm)', fontFamily: 'var(--font-display)' }}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
