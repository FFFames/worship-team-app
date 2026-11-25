/** Builds the native sender and receiver with the installed NDI headers. */

const { mkdirSync } = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const windows = process.platform === 'win32'
const include = process.env.NDI_SDK_INCLUDE || (process.platform === 'darwin' ? '/Library/NDI SDK for Apple/include' : '')
if (!include) {
  console.error('Set NDI_SDK_INCLUDE to the include directory of the NDI SDK.')
  process.exit(1)
}

const directory = path.join(__dirname, 'build')
mkdirSync(directory, { recursive: true })
for (const name of ['ndi-sender', 'ndi-receiver']) {
  const executable = path.join(directory, windows ? name + '.exe' : name)
  const args = ['-std=c++17', '-O2', '-I', include, path.join(__dirname, name + '.cpp'), '-o', executable]
  if (process.platform === 'linux') args.push('-ldl', '-pthread')
  const result = spawnSync(process.env.CXX || 'clang++', args, { stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
