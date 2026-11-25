/** Collects authorized profile files and verified catalog aliases for PowerPoint links. */

import type { EasyWorshipProfileReview } from './easyWorshipProfile'
import { powerPointFileLink, type PowerPointMediaCandidate } from './powerPoint/linkedMedia'

export function profilePowerPointMediaCandidates(profile: EasyWorshipProfileReview): PowerPointMediaCandidate[] {
  const paths = profile.resources.flatMap(({ path, filename, readFile, hashOnly, attached, externalPath }) =>
    hashOnly && !attached ? [] : [{ path: externalPath ?? path, filename, readFile }])
  const aliases = (profile.media?.entries ?? []).flatMap((entry) => {
    if (!entry.originalLocation || entry.kind === 'image') return []
    const link = powerPointFileLink(entry.originalLocation)
    if (!link) return []
    const known = entry.metadata?.fileHash
    const expectedHash = typeof known === 'string' && /^[a-f\d]{64}$/i.test(known) ? known : undefined
    if (!expectedHash && !entry.readFile) return []
    return [{ path: entry.originalLocation, filename: link.filename, expectedHash, readFile: entry.readFile ?? (async () => new Blob()) }]
  })
  return [...paths, ...aliases]
}
