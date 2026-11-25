/** Creates stable UUIDs for imports whose original content is unchanged. */

const HASH_CHUNK_BYTES = 4 * 1024 * 1024

export async function mediaFileHash(file: Blob) {
  const { sha256 } = await import('@noble/hashes/sha2.js')
  const hash = sha256.create()
  const reader = file.stream().getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      hash.update(value)
    }
    return Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    reader.releaseLock()
  }
}

export async function importIdentity(value: unknown, databaseBytes?: Uint8Array<ArrayBuffer>): Promise<string> {
  const databaseHash = databaseBytes && Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', databaseBytes)))
  const bytes = new TextEncoder().encode(JSON.stringify(databaseHash ? [value, databaseHash] : value))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x80
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Includes the file bytes in an import identity without reading the entire file at once. */
export async function importBlobIdentity(value: unknown, blob: Blob): Promise<string> {
  const [identity] = await importBlobIdentities([value], blob)
  return identity
}

/** Reuses the byte hashes when a file has both an attachment and a library identity. */
export async function importBlobIdentities(values: readonly unknown[], blob: Blob): Promise<string[]> {
  const hashes = new Uint8Array(Math.ceil(blob.size / HASH_CHUNK_BYTES) * 32)
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK_BYTES) {
    const bytes = await blob.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer()
    hashes.set(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), offset / HASH_CHUNK_BYTES * 32)
  }
  return Promise.all(values.map((value) => importIdentity(value, hashes)))
}
