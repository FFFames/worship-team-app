/** Tag fields use one line per value and keep punctuation inside a tag. */
export function songTagsFromText(text: string): string[] {
  return [...new Set(text.split(/\r\n|[\r\n]/).map((tag) => tag.trim()).filter(Boolean))]
}
