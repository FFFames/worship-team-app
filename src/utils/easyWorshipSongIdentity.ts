/** Shares the existing imported song identity between library imports and collection links. */

import type { EasyWorshipSong } from './easyWorship'
import type { PlaylistCue } from '../types/database'
import { formatLyricsOnly } from './chordParser'
import { importIdentity } from './importIdentity'

export function easyWorshipSongIdentity(song: EasyWorshipSong, rawContent = formatLyricsOnly(song.sections)) {
  if (song.wordsRecovery?.lyricsOnly) return Promise.resolve(song.wordsRecovery.recordId ?? song.wordsRecovery.id)
  return importIdentity(['easyworship', song.sourceId, song.title, song.author, song.copyright, song.ccli, rawContent])
}

export function normalizeEasyWorshipUid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const uid = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(uid) ? uid : undefined
}

export function scheduleSongSourceUid(cue: PlaylistCue) {
  return cue.kind === 'song' ? normalizeEasyWorshipUid(cue.metadata?.presentationUid) : undefined
}

export function validOptionalEasyWorshipUid(value: unknown) {
  return value == null || normalizeEasyWorshipUid(value) === value
}
