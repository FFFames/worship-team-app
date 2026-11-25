/** Matches original disk paths against the directory structure supplied by the operator. */

import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

function segments(path: string) {
  if (!path || path.length > 4096 || /[\u0000-\u001f]/.test(path)) return undefined
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) return undefined
  return parts.map((part) => part.normalize('NFC').toLowerCase())
}

export function externalEasyWorshipMediaKey(path?: string) {
  if (!path) return undefined
  const normalized = path.replace(/\\/g, '/')
  const prefix = /^[a-z]:\//i.test(normalized) ? '' : normalized.startsWith('//') ? '//' : normalized.startsWith('/') ? '/' : undefined
  const parts = prefix === undefined ? undefined : segments(normalized)
  return parts?.length ? prefix + parts.join('/') : undefined
}

export function externalEasyWorshipMediaId(path: string) {
  const key = externalEasyWorshipMediaKey(path)
  return key ? bytesToHex(sha256(new TextEncoder().encode(key))) : undefined
}

export function recordEasyWorshipExternalMediaLocations() {
  const paths = new Map<string, string>()
  return {
    paths,
    locate(original: string) {
      const id = externalEasyWorshipMediaId(original)
      if (id && !paths.has(id)) paths.set(id, original)
      return id
    },
  }
}

export function suppliedEasyWorshipMediaLocation(file: File) {
  const path = file.webkitRelativePath
  const parts = path?.split('/')
  return parts?.length > 1 && parts[parts.length - 1] === file.name
    && parts.every((part) => part && !part.includes(':') && !part.includes('\\')) && segments(path) ? path : undefined
}

export function matchEasyWorshipExternalMedia<T>(candidates: Iterable<readonly [T, string]> = []) {
  const byName = new Map<string, { candidate: T; parts: string[] }[]>()
  for (const [candidate, path] of candidates) {
    const parts = segments(path)
    if (!parts || parts.length < 2) continue
    const name = parts[parts.length - 1]
    const existing = byName.get(name) ?? []
    existing.push({ candidate, parts })
    byName.set(name, existing)
  }
  return (original: string) => {
    const key = externalEasyWorshipMediaKey(original)
    if (!key) return undefined
    const source = key.split('/').filter(Boolean)
    let best = 1
    let matches: T[] = []
    for (const { candidate, parts } of byName.get(source[source.length - 1]) ?? []) {
      let common = 1
      while (common < Math.min(source.length, parts.length)
        && source[source.length - 1 - common] === parts[parts.length - 1 - common]) common++
      if (common < 2 || common < best) continue
      if (common > best) { best = common; matches = [] }
      matches.push(candidate)
    }
    if (matches.length) return { candidates: matches }
  }
}

export function matchSuppliedEasyWorshipExternalMedia(files: readonly File[]) {
  return matchEasyWorshipExternalMedia(files.flatMap((file) => {
    const location = suppliedEasyWorshipMediaLocation(file)
    return location ? [[file, location] as const] : []
  }))
}
