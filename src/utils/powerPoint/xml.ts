/** Reads local DrawingML and PresentationML elements across namespace prefixes. */

export function child(element: Element | undefined, name: string): Element | undefined {
  return element && Array.from(element.children).find((candidate) => candidate.localName === name)
}

export function attr(element: Element | undefined, name: string): string | undefined {
  return element?.getAttribute(name) ?? undefined
}

export function numeric(element: Element | undefined, name: string): number | undefined {
  const value = attr(element, name)
  const parsed = value === undefined ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseXml(xml: string | undefined): Element | undefined {
  if (!xml || /<!doctype/i.test(xml)) return undefined
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return doc.querySelector('parsererror') ? undefined : doc.documentElement
}

export function rgb(element: Element | undefined): string | undefined {
  const literal = attr(element, element?.localName === 'sysClr' ? 'lastClr' : 'val')
  return literal && /^[\da-f]{6}$/i.test(literal) ? `#${literal}` : undefined
}

export function paragraphText(paragraph: Element): string {
  const parts: string[] = []
  for (const element of paragraph.children) {
    if (element.localName === 'br') parts.push('\n')
    else if (element.localName === 'r' || element.localName === 'fld') parts.push(child(element, 't')?.textContent ?? '')
  }
  const bullet = attr(child(child(paragraph, 'pPr'), 'buChar'), 'char')
  return (bullet ? bullet + ' ' : '') + parts.join('')
}
