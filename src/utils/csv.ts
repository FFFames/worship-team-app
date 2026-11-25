/** Formats UTF-8 CSV for spreadsheet readers, keeping imported text literal. */

export function formatCsv(rows: readonly (readonly (string | null | undefined)[])[]): string {
  return '\ufeff' + rows.map((row) => row.map((value) => {
    const text = value ?? ''
    const safe = /^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) ? "'" + text : text
    return `"${safe.replace(/"/g, '""')}"`
  }).join(',')).join('\r\n')
}
