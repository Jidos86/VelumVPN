import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronExe = require('electron')
const namedExe = join(dirname(electronExe), 'VelumVPN-DEV.exe')

if (!existsSync(namedExe) || statSync(electronExe).mtimeMs > statSync(namedExe).mtimeMs) {
  copyFileSync(electronExe, namedExe)
}

const cli = join(dirname(fileURLToPath(import.meta.url)), '../node_modules/electron-vite/bin/electron-vite.js')
const child = spawn(process.execPath, [cli, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_EXEC_PATH: namedExe,
    ELECTRON_CLI_ARGS: JSON.stringify(['noadmin'])
  },
  cwd: join(dirname(fileURLToPath(import.meta.url)), '..')
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
