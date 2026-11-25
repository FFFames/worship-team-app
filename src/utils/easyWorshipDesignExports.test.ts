/** Verifies standalone layout packages and their per-archive asset paths. */

import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { getEasyWorshipSql } from './easyWorship'
import { reviewEasyWorshipDesigns, reviewEasyWorshipDesignExports } from './easyWorshipDesigns'
import { mediaFileHash } from './easyWorshipMedia'

async function exportedDesign(name: string, title: string, type: number, payload: string, packed: string | null = payload, revision?: string) {
  const SQL = await getEasyWorshipSql()
  const db = new SQL.Database()
  const hash = await mediaFileHash(new Blob([payload]))
  let database: Blob
  try {
    db.run(
      `CREATE TABLE presentation (presentation_uid TEXT, title TEXT, presentation_type INTEGER, group_level INTEGER, aspect_ratio TEXT, presentation_rev_uid TEXT);
       CREATE TABLE slide (presentation_id INTEGER, slide_uid TEXT, order_index INTEGER);
       CREATE TABLE element (slide_id INTEGER, element_uid TEXT, order_index INTEGER, background_resource_id INTEGER);
       CREATE TABLE resource_text (resource_id INTEGER, rtf TEXT);
       CREATE TABLE resource_image (resource_id INTEGER, file_id INTEGER, original_filename TEXT, filesize INTEGER);
       CREATE TABLE file (filename TEXT, file_hash TEXT);
       INSERT INTO slide VALUES (1, 'root-slide', 0), (2, 'dependency-slide', 0);
       INSERT INTO element VALUES (1, 'BACKGROUND', 0, 42);`,
    )
    db.run("INSERT INTO presentation VALUES (?, ?, ?, 0, '16:9', ?), ('internal', 'Embedded parent', ?, 1, '16:9', NULL)",
      ['uid-' + title, title, type, revision ?? null, type])
    db.run('INSERT INTO resource_image VALUES (42, 1, ?, ?)', ['Windows\\original.png', payload.length])
    db.run("INSERT INTO file VALUES ('packed.png', ?)", [hash])
    database = new Blob([new Uint8Array(db.export())])
  } finally { db.close() }
  const zip = new ZipWriter(new BlobWriter())
  await zip.add('main.db', new BlobReader(database))
  if (packed !== null) await zip.add('media/packed.png', new BlobReader(new Blob([packed])))
  return new File([await zip.close()], name)
}

describe('EasyWorship standalone design exports', () => {
  it('uses package-specific media, skips embedded parent rows and reports a bad file in a batch', async () => {
    const presentation = await exportedDesign('Deck.ewpx', 'Deck title', 8, 'presentation artwork')
    const theme = await exportedDesign('Other name.EWTX', 'Song theme title', 13, 'different theme artwork')
    const duplicate = new File([presentation], 'Same artwork renamed.ewpx')
    const invalid = new File(['invalid ZIP'], 'Bad.ewtx')
    const result = await reviewEasyWorshipDesigns([presentation, theme, duplicate, invalid])
    expect(result.entries?.map(({ title, kind }) => [title, kind])).toEqual([
      ['Deck title', 'presentation'], ['Song theme title', 'song-theme'],
    ])
    expect(result.warnings).toEqual([expect.stringContaining('ซ้ำกับไฟล์'), expect.stringContaining('Bad.ewtx')])
    for (const [index, entry] of result.entries!.entries()) {
      const media = entry.content.slides[0].design.layers.find((layer) => layer.kind === 'media')
      expect(media?.kind).toBe('media')
      expect(await result.withAsset!(media!.asset.sourcePath!, (file) => file.text())).toBe(index === 0 ? 'presentation artwork' : 'different theme artwork')
    }
    expect((await reviewEasyWorshipDesigns(duplicate)).entries?.[0].exportId).toBe(result.entries?.[0].exportId)
  })

  it('keeps a design with a missing verified file and rejects a presentation under the theme extension', async () => {
    const damaged = await exportedDesign('Deck.ewpx', 'Deck title', 8, 'valid bytes', 'wrong bytes')
    const rejected = new File([damaged], 'Wrong kind.ewtx')
    const result = await reviewEasyWorshipDesigns([damaged, rejected])
    expect(result.entries).toHaveLength(1)
    const content = result.entries![0].content
    expect(content.warnings).toEqual([expect.stringContaining('SHA-256')])
    const media = content.slides[0].design.layers.find((layer) => layer.kind === 'media')
    expect(media?.asset.sourcePath).toBeUndefined()
    expect(result.warnings).toEqual([expect.stringContaining('ไม่พบธีมเพลง')])
  })

  it('supplies distinct revision candidates for profile review', async () => {
    const before = await exportedDesign('Original.ewtx', 'Song theme', 13, 'blue', 'blue', 'first-version')
    const after = await exportedDesign('New.ewtx', 'Song theme', 13, 'green', 'green', 'second-version')
    const result = await reviewEasyWorshipDesignExports([before, after], { preserveRevisions: true })
    const revisions = result.entries?.map(({ exportRevisionId }) => exportRevisionId)
    expect(revisions).toHaveLength(2)
    expect(new Set(revisions).size).toBe(2)
    expect(revisions?.every(Boolean)).toBe(true)
    expect(result.entries?.[0].exportId).toBe(result.entries?.[1].exportId)
  })
})
