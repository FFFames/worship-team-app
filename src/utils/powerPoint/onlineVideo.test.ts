import { describe, expect, it } from 'vitest'
import { powerPointOnlineVideoUrl } from './onlineVideo'

describe('PowerPoint online video links', () => {
  it.each([
    ['https://www.youtube.com/embed/aqz-KE-bpKQ?start=95&feature=oembed', 'https://www.youtube.com/embed/aqz-KE-bpKQ?start=95'],
    ['https://youtu.be/aqz-KE-bpKQ?t=1m35s&end=120', 'https://www.youtube.com/embed/aqz-KE-bpKQ?start=95&end=120'],
    ['//www.youtube-nocookie.com/embed/aqz-KE-bpKQ?origin=https://example.test', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
    ['https://vimeo.com/81400335/abcdef1201#t=1m2s', 'https://player.vimeo.com/video/81400335?h=abcdef1201#t=1m2s'],
    ['https://player.vimeo.com/video/81400335?h=abcdef1201&background=1', 'https://player.vimeo.com/video/81400335?h=abcdef1201'],
  ])('normalizes %s to a single player', (link, player) => {
    expect(powerPointOnlineVideoUrl(link)).toBe(player)
    expect(powerPointOnlineVideoUrl(player)).toBe(player)
  })

  it.each([
    'http://www.youtube.com/embed/aqz-KE-bpKQ',
    'https://www.youtube.com.example.test/embed/aqz-KE-bpKQ',
    'https://example.test@www.youtube.com/embed/aqz-KE-bpKQ',
    'https://www.youtube.com:8443/embed/aqz-KE-bpKQ',
    'https://www.youtube.com/redirect?q=https://example.test',
    'https://www.youtube.com/embed/videoseries?list=1234',
    'https://player.vimeo.com/external/81400335.hd.mp4',
    'file:///Videos/clip.mp4',
  ])('declines %s for provider playback', (link) => {
    expect(powerPointOnlineVideoUrl(link)).toBeUndefined()
  })
})
