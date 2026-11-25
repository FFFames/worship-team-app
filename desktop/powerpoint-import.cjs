/** Converts local PowerPoint decks in an isolated LibreOffice profile. */

const { execFile } = require('node:child_process')
const { existsSync } = require('node:fs')
const { mkdir, mkdtemp, readFile, rm, stat, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { promisify } = require('node:util')

const run = promisify(execFile)
const maxBytes = 128 * 1024 * 1024
const compoundSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const pdfSignature = Buffer.from('%PDF-')
const settings = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
  <item oor:path="/org.openoffice.Office.Common/Security/Scripting">
    <prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>
    <prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop>
  </item>
</oor:items>`

const errors = {
  invalid: 'ไฟล์นี้ไม่ใช่ PowerPoint .ppt ที่อ่านได้ หรือมีขนาดเกิน 128 MB',
  unavailable: 'ไม่พบ LibreOffice กรุณาติดตั้ง LibreOffice Impress หรือแนบไฟล์ .pptx ที่แปลงแล้ว',
  failed: 'แปลง PowerPoint .ppt ไม่สำเร็จ กรุณาตรวจไฟล์ต้นฉบับหรือแนบไฟล์ .pptx ที่แปลงแล้ว',
  timeout: 'แปลง PowerPoint .ppt ใช้เวลานานเกินไป กรุณาแนบไฟล์ .pptx ที่แปลงแล้ว',
  cancelled: 'ยกเลิกการแปลง PowerPoint แล้ว',
}

const renderedErrors = {
  ...errors,
  invalid: 'ไฟล์ PowerPoint อ่านไม่ได้หรือมีขนาดเกิน 128 MB',
  unavailable: 'ไม่พบ LibreOffice Impress สำหรับสร้างภาพสไลด์',
  failed: 'สร้างภาพสไลด์ด้วย LibreOffice Impress ไม่สำเร็จ',
  timeout: 'LibreOffice Impress ใช้เวลาสร้างภาพสไลด์นานเกินไป',
}

function libreOfficeExecutable() {
  if (process.env.WORSHIP_POWERPOINT_SOFFICE) return process.env.WORSHIP_POWERPOINT_SOFFICE
  if (process.platform === 'darwin') {
    const installed = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    if (existsSync(installed)) return installed
  }
  if (process.platform === 'win32') {
    for (const folder of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const program = path.join(folder, 'LibreOffice', 'program')
      for (const command of ['soffice.com', 'soffice.exe']) {
        const installed = path.join(program, command)
        if (existsSync(installed)) return installed
      }
    }
    return 'soffice.exe'
  }
  return 'soffice'
}

async function convertPowerPoint(bytes, legacy, render, signal, executable = libreOfficeExecutable()) {
  const messages = render ? renderedErrors : errors
  const inputSignature = legacy ? compoundSignature : zipSignature
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < (legacy ? 512 : 22) || bytes.byteLength > maxBytes
    || !Buffer.from(bytes.buffer, bytes.byteOffset, inputSignature.length).equals(inputSignature)) throw Error(messages.invalid)
  const format = render ? 'pdf' : 'pptx'
  const outputSignature = render ? pdfSignature : zipSignature
  const inputFilter = legacy ? 'MS PowerPoint 97' : 'Impress MS PowerPoint 2007 XML'
  const outputFilter = render ? 'impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}' : 'Impress MS PowerPoint 2007 XML'
  const folder = await mkdtemp(path.join(os.tmpdir(), 'worshipteam-ppt-'))
  try {
    const profile = path.join(folder, 'profile')
    const user = path.join(profile, 'user')
    const input = path.join(folder, legacy ? 'input.ppt' : 'input.pptx')
    const output = path.join(folder, `input.${format}`)
    await mkdir(user, { recursive: true })
    await Promise.all([
      writeFile(input, bytes, { mode: 0o600 }),
      writeFile(path.join(user, 'registrymodifications.xcu'), settings, { mode: 0o600 }),
    ])
    try {
      await run(executable, [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless', '--norestore', '--nodefault', `--infilter=${inputFilter}`,
        '--convert-to', `${format}:${outputFilter}`, '--outdir', folder, input,
      ], { cwd: folder, windowsHide: true, timeout: 60_000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024, signal })
    } catch (error) {
      if (signal?.aborted) throw Error(messages.cancelled)
      if (error.code === 'ENOENT') throw Error(messages.unavailable)
      throw Error(error.killed ? messages.timeout : messages.failed)
    }
    if (signal?.aborted) throw Error(messages.cancelled)
    const info = await stat(output).catch(() => undefined)
    if (!info?.isFile() || info.size < outputSignature.length || info.size > maxBytes) throw Error(messages.failed)
    const converted = await readFile(output)
    if (!converted.subarray(0, outputSignature.length).equals(outputSignature)) throw Error(messages.failed)
    return Uint8Array.from(converted)
  } finally {
    await rm(folder, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 })
  }
}

function convertLegacyPowerPoint(bytes, signal, executable) {
  return convertPowerPoint(bytes, true, false, signal, executable)
}

function renderPowerPointPdf(bytes, legacy, signal, executable) {
  if (typeof legacy !== 'boolean') throw Error(renderedErrors.invalid)
  return convertPowerPoint(bytes, legacy, true, signal, executable)
}

function registerPowerPointImport({ ipcMain, allowed }) {
  let active
  async function convert(event, run) {
    if (!allowed(event)) throw Error('เปิดหน้านำเข้า PowerPoint ในหน้าหลักของแอป Desktop')
    if (active) throw Error('กำลังแปลงไฟล์ PowerPoint อีกไฟล์ กรุณารอให้เสร็จ')
    const controller = new AbortController()
    active = controller
    try { return await run(controller.signal) }
    finally { active = undefined }
  }
  ipcMain.handle('powerpoint:convert-legacy', (event, bytes) =>
    convert(event, (signal) => convertLegacyPowerPoint(bytes, signal)))
  ipcMain.handle('powerpoint:render-pdf', (event, bytes, legacy) =>
    convert(event, (signal) => renderPowerPointPdf(bytes, legacy, signal)))
  return { close: () => active?.abort() }
}

module.exports = { convertLegacyPowerPoint, renderPowerPointPdf, registerPowerPointImport }
