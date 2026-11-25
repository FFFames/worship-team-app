export const maxSpeakerNotesLength = 50_000
export const invalidImportedPresentationNotes = 'โน้ตงานนำเสนอจาก EasyWorship ยาวเกินกำหนดหรือมีอักขระที่อ่านไม่ได้'

export function validOptionalSpeakerNotes(value: unknown) {
  return value === undefined || (typeof value === 'string' && !value.includes('\0') && value.length <= maxSpeakerNotesLength)
}

export function visibleNote(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** An empty saved note is an explicit clearing in the slide editor. */
export function fillMissingSpeakerNotes<T extends { speakerNotes?: string }>(saved: T, source: { speakerNotes?: string }): T {
  return saved.speakerNotes === undefined && source.speakerNotes ? { ...saved, speakerNotes: source.speakerNotes } : saved
}
