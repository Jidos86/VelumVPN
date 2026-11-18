import { execFile } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { app } from 'electron'
import { t } from './i18n'

const execFilePromise = promisify(execFile)

let isAdminCached: boolean | null = null

async function probeAdmin(): Promise<boolean> {
  try {
    const { stdout } = await execFilePromise(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
      ],
      { timeout: 5000, windowsHide: true }
    )
    if (/^True\s*$/i.test(stdout.trim())) return true
    if (/^False\s*$/i.test(stdout.trim())) return false
  } catch {
    // fall through to net session
  }
  try {
    await execFilePromise('net', ['session'], { timeout: 2000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

export async function isRunningAsAdmin(): Promise<boolean> {
  if (isAdminCached === true) {
    return true
  }
  const ok = await probeAdmin()
  if (ok) isAdminCached = true
  return ok
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function writeDevRelaunchScript(): string {
  const exe = psQuote(process.execPath)
  const cwd = psQuote(process.cwd())
  const renderer = process.env.ELECTRON_RENDERER_URL ?? ''
  const body = [
    `$env:NODE_ENV = 'development'`,
    renderer ? `$env:ELECTRON_RENDERER_URL = ${psQuote(renderer)}` : '',
    `Start-Process -FilePath ${exe} -ArgumentList @(${cwd}) -WorkingDirectory ${cwd}`
  ]
    .filter(Boolean)
    .join('\r\n')
  const file = join(tmpdir(), `velum-relaunch-${process.pid}.ps1`)
  writeFileSync(file, body, 'utf8')
  return file
}

/** UAC relaunch. Releases the single-instance lock first so the elevated copy can start. */
export async function restartAsAdmin(): Promise<boolean> {
  if (process.platform !== 'win32') {
    throw new Error('Windows only')
  }
  if (await isRunningAsAdmin()) {
    return false
  }
  app.releaseSingleInstanceLock()
  let script: string | null = null
  try {
    const unpackaged =
      Boolean(process.env.ELECTRON_RENDERER_URL) || Boolean(process.defaultApp)
    const command = !unpackaged && app.isPackaged
      ? `Start-Process -FilePath ${psQuote(process.execPath)} -Verb RunAs`
      : (() => {
          script = writeDevRelaunchScript()
          return `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(script)})`
        })()
    await execFilePromise(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 120000, windowsHide: true }
    )
    return true
  } catch (error) {
    app.requestSingleInstanceLock()
    const message = error instanceof Error ? error.message : String(error)
    if (/canceled|cancelled|отмен|1223/i.test(message)) {
      throw new Error(t('error.windowsElevationFailed'))
    }
    throw new Error(`${t('error.windowsElevationFailed')}：${message}`)
  } finally {
    if (script) {
      try {
        unlinkSync(script)
      } catch {
        // ignore
      }
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// osascript's `do shell script` breaks on spaces in Application Support paths
// when the command is pasted in with backslash-escaped quotes.
export async function runDarwinAdmin(shellCommand: string): Promise<void> {
  await execFilePromise('osascript', [
    '-e',
    `do shell script ${appleScriptString(shellCommand)} with administrator privileges`
  ])
}

export async function execWithElevation(command: string, args: string[]): Promise<void> {
  if (process.platform === 'win32') {
    try {
      if (await isRunningAsAdmin()) {
        await execFilePromise(command, args, { timeout: 30000 })
      } else {
        const psArgs = args
          .map((arg) => {
            const escaped = arg.replace(/'/g, "''")
            return `'${escaped}'`
          })
          .join(',')
        await execFilePromise(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `& { $p = Start-Process -FilePath '${command}' -ArgumentList @(${psArgs}) -Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode }`
          ],
          { timeout: 30000 }
        )
      }
    } catch (error) {
      throw new Error(
        `${t('error.windowsElevationFailed')}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else if (process.platform === 'linux') {
    try {
      await execFilePromise('pkexec', [command, ...args])
    } catch (error) {
      throw new Error(
        `${t('error.linuxElevationFailed')}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else if (process.platform === 'darwin') {
    try {
      await runDarwinAdmin([command, ...args].map(shellQuote).join(' '))
    } catch (error) {
      throw new Error(
        `${t('error.macosElevationFailed')}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
