/** The DVD volume's title, part-of-title and angle inventory from VIDEO_TS.IFO. */
const { createHash } = require('node:crypto')
const { open } = require('node:fs/promises')

const sectorBytes = 2048
const titleTablePointer = 0xc4
const tableHeaderBytes = 8
const titleEntryBytes = 12
const maxTitles = 99

async function readDvdTitleTable(manager) {
  const file = await open(manager, 'r')
  try {
    const { size, dev, ino, mtimeMs } = await file.stat()
    const header = await readExactly(file, titleTablePointer + 4, 0)
    if (header.toString('ascii', 0, 12) !== 'DVDVIDEO-VMG') throw new Error('catalog')
    const offset = header.readUInt32BE(titleTablePointer) * sectorBytes
    if (offset < sectorBytes || offset + tableHeaderBytes > size) throw new Error('catalog')
    const tableHeader = await readExactly(file, tableHeaderBytes, offset)
    const count = tableHeader.readUInt16BE(0)
    const end = tableHeader.readUInt32BE(4) + 1
    const required = tableHeaderBytes + count * titleEntryBytes
    if (!count || count > maxTitles || end < required || offset + end > size) throw new Error('catalog')
    const table = await readExactly(file, required - tableHeaderBytes, offset + tableHeaderBytes)
    const titles = []
    for (let index = 0; index < count; index++) {
      const start = index * titleEntryBytes
      const angles = table[start + 1]
      const chapters = table.readUInt16BE(start + 2)
      if (angles < 1 || angles > 9 || chapters < 1 || chapters > 999) continue
      titles.push({ number: index + 1, chapters, angles })
    }
    if (!titles.length) throw new Error('catalog')
    const fingerprint = createHash('sha256').update(`${size}:${dev}:${ino}:${mtimeMs}:`).update(header).update(tableHeader).update(table).digest('hex')
    return { titles, fingerprint }
  } finally { await file.close() }
}

async function readExactly(file, length, position) {
  const bytes = Buffer.alloc(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await file.read(bytes, offset, length - offset, position + offset)
    if (!bytesRead) throw new Error('catalog')
    offset += bytesRead
  }
  return bytes
}

module.exports = { readDvdTitleTable }
