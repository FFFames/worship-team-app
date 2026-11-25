/** Focused MIME allowlist coverage for package-local PowerPoint media. */

import { describe, expect, it } from 'vitest'
import { isPowerPointMediaMime, powerPointAssetMime } from './assets'

describe('PowerPoint media allowlist', () => {
  it('accepts presentation media while excluding macros and arbitrary package parts', () => {
    expect(powerPointAssetMime('ppt/media/photo.JPG')).toBe('image/jpeg')
    expect(powerPointAssetMime('ppt/media/movie.mp4')).toBe('video/mp4')
    expect(powerPointAssetMime('ppt/vbaProject.bin')).toBeUndefined()
    expect(isPowerPointMediaMime('image/png')).toBe(true)
    expect(isPowerPointMediaMime('application/xml')).toBe(false)
  })
})
