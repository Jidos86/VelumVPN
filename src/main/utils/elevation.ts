import { execFile } from 'child_process'
import { promisify } from 'util'
import { t } from './i18n'

const execFilePromise = promisify(execFile)

let isAdminCached: boolean | null = null

async function isRunningAsAdmin(): Promise<boolean> {
  if (isAdminCached !== null) {
    return isAdminCached
  }

  try {
    await execFilePromise('net', ['session'], { timeout: 2000 })
    isAdminCached = true
    return true
  } catch {
    isAdminCached = false
    return false
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
