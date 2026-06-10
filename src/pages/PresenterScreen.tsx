/** PresenterScreen — fullscreen display window for live presentation.
 *  Receives commands from PresentationControl via BroadcastChannel.
 *  Shows lyrics, welcome page, or black screen with optional video background. */

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
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Video background */}
      {backgroundUrl && mode !== 'black' && (
        <video
          ref={videoRef}
          src={backgroundUrl}
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          loop
          muted
          playsInline
        />
      )}

      {/* Content overlay */}
      {mode === 'black' ? (
        <div className="w-full h-full bg-black" />
      ) : mode === 'welcome' ? (
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-8xl mb-6">♫</div>
            <h1 className="text-5xl font-light text-white tracking-wide">
              Welcome
            </h1>
            <p className="text-xl text-white/60 mt-4">
              Please stand by
            </p>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex items-center justify-center h-full px-16">
          <div className="text-center max-w-4xl">
            {lyrics.split('\n').map((line, i) => (
              <p
                key={i}
                className="text-4xl md:text-5xl font-light text-white leading-relaxed mb-2"
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
