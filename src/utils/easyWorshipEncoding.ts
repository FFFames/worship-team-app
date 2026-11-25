/** Windows text encodings used in EasyWorship metadata and RTF. */

export const LEGACY_ENCODING_OPTIONS = [
  ['auto', 'ตามฐานข้อมูล'],
  ['874', 'ไทย (Windows-874)'],
  ['1252', 'ยุโรปตะวันตก (Windows-1252)'],
  ['1250', 'ยุโรปกลาง (Windows-1250)'],
  ['1251', 'ซีริลลิก (Windows-1251)'],
  ['1253', 'กรีก (Windows-1253)'],
  ['1254', 'ตุรกี (Windows-1254)'],
  ['1255', 'ฮีบรู (Windows-1255)'],
  ['1256', 'อาหรับ (Windows-1256)'],
  ['1257', 'บอลติก (Windows-1257)'],
  ['1258', 'เวียดนาม (Windows-1258)'],
  ['932', 'ญี่ปุ่น (Shift JIS)'],
  ['936', 'จีนตัวย่อ (GBK)'],
  ['949', 'เกาหลี (EUC-KR)'],
  ['950', 'จีนตัวเต็ม (Big5)'],
  ['65001', 'Unicode (UTF-8)'],
] as const

export type LegacySongEncoding = typeof LEGACY_ENCODING_OPTIONS[number][0]

const codePages: Record<string, string> = {
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
  65001: 'utf-8',
}

// Paradox tables can identify the driver by its older DOS number even when
// EasyWorship stores the actual strings in the Windows encoding.
const legacyDriverPages: Record<number, string> = {
  437: '1252', 737: '1253', 775: '1257', 850: '1252', 852: '1250',
  855: '1251', 857: '1254', 862: '1255', 866: '1251', 869: '1253',
}

const fontCharsets: Record<number, string> = {
  128: '932', 129: '949', 134: '936', 136: '950', 161: '1253', 162: '1254',
  163: '1258', 177: '1255', 178: '1256', 186: '1257', 204: '1251', 222: '874', 238: '1250',
}

export function legacySongCodePage(header: number, encoding: LegacySongEncoding = 'auto'): string {
  if (encoding !== 'auto') return encoding
  const page = String(header)
  if (page in codePages || /^125[0-8]$/.test(page)) return page
  return legacyDriverPages[header] ?? '1252'
}

export function rtfFontCodePage(charset: number | undefined): string | undefined {
  return charset === undefined ? undefined : fontCharsets[charset]
}

export function decodeEasyWorshipText(bytes: Uint8Array, page: string) {
  const label = codePages[page] ?? (/^125[0-8]$/.test(page) ? 'windows-' + page : 'windows-1252')
  return new TextDecoder(label).decode(bytes)
}
