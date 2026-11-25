/** Regression coverage for matching local PowerPoint links without guessing between files. */

import { describe, expect, it, vi } from 'vitest'
import { mediaFileHash } from '../importIdentity'
import { createPowerPointMediaResolver } from './linkedMedia'

const candidate = (path: string, contents: string, expectedHash?: string) => ({
  path, filename: path.split('/').pop() ?? '', expectedHash, readFile: async () => new Blob([contents]),
})

describe('PowerPoint linked media', () => {
  it('matches the longest case-insensitive Windows or UNC suffix and decodes URI escapes', async () => {
    const resolve = createPowerPointMediaResolver([
      candidate('Resources/Audio/Weekend/Worship Track.mp3', 'weekend'),
      candidate('Resources/Audio/Weekday/Worship Track.mp3', 'weekday'),
    ])
    const result = await resolve('file://church-nas/audio/Weekend/worship%20track.mp3')
    expect('match' in result && await result.match.blob.text()).toBe('weekend')
  })

  it('reports ambiguity when equally matching files differ and accepts duplicate copies', async () => {
    const correct = candidate('backup/one/clip.mp4', 'original')
    const other = candidate('backup/two/clip.mp4', 'other')
    const target = 'C:\\Users\\Public\\clip.mp4'
    await expect(createPowerPointMediaResolver([correct, other])(target)).resolves.toMatchObject({ warning: expect.stringContaining('ชื่อซ้ำ') })
    const copy = candidate('backup/two/clip.mp4', 'original')
    const result = await createPowerPointMediaResolver([correct, copy])(target)
    expect('match' in result && await result.match.blob.text()).toBe('original')
  })

  it('checks a packed file against its catalog checksum and leaves Web links unresolved', async () => {
    const hash = await mediaFileHash(new Blob(['original']))
    const path = 'media/clip.mp4'
    const readFile = vi.fn(async () => new Blob(['replacement']))
    const resolve = createPowerPointMediaResolver([{ ...candidate(path, 'replacement', hash), readFile }])
    await expect(resolve('https://example.invalid/clip.mp4')).resolves.toHaveProperty('warning')
    expect(readFile).not.toHaveBeenCalled()
    await expect(resolve('file:///C:/clip.mp4')).resolves.toMatchObject({ warning: expect.stringContaining('อ่านสื่อ') })
    expect(readFile).toHaveBeenCalledOnce()

    const repaired = await createPowerPointMediaResolver([
      candidate(path, 'replacement', hash), candidate('attached/clip.mp4', 'original'),
    ])('file:///C:/clip.mp4')
    expect('match' in repaired && repaired.match.hash).toBe(hash)
  })
})
