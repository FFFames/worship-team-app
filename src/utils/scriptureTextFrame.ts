/** Creates a portable Scripture snapshot inside an independent editable text frame. */

import type { DesignLayer } from '../types/slideDesign'
import type { LocatedVerse, ScriptureEditionInfo } from '../types/scripture'
import { scripturePassageLabel, verseKey } from './scripture'
import { editDesignText } from './slideDesign'

type TextLayer = Extract<DesignLayer, { kind: 'text' }>

export function scriptureTextFrame(edition: ScriptureEditionInfo, verses: readonly LocatedVerse[], existing?: TextLayer): TextLayer | undefined {
  const selected = [...new Map(verses.filter(({ text }) => text.trim()).map((verse) => [verseKey(verse), verse])).values()]
  if (!selected.length) return undefined

  const label = `${scripturePassageLabel(selected)} · ${edition.abbreviation || edition.name}`
  const text = [...selected.map((verse) => verse.text.replace(/\s+/g, ' ').trim()), label].join('\n')
  const frame: TextLayer = existing ? editDesignText(existing, text) : {
    id: `scripture:${crypto.randomUUID()}`, kind: 'text', text,
    frame: { x: .08, y: .71, width: .84, height: .24 },
    style: { align: 'center', verticalAlign: 'center', fontSize: .047, fitText: true },
  }
  return { ...frame, scriptureSource: { editionId: edition.id, editionName: edition.name, label,
    verses: selected.map(({ bookId, chapter, verse }) => ({ bookId, chapter, verse })) } }
}
