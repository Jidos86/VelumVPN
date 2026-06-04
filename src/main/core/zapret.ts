import { spawn, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { zapretDir } from '../utils/dirs'
import { safeSend } from '../utils/safeSend'
import { mainWindow } from '..'

export type ZapretSource = 'flowseal' | 'zapret2'

export interface ZapretStrategy {
  id: string
  name: string
  args: string
}

const FLOWSEAL_API = 'https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/latest'
const ZAPRET2_API =
  'https://api.github.com/repos/youtubediscord/zapret2-youtube-discord/releases/latest'

// Known Flowseal strategy args (extracted from their bat files)
const FLOWSEAL_STRATEGIES: ZapretStrategy[] = [
  {
    id: 'default',
    name: 'DEFAULT (General)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --methodeol=split --disorder-split=1 --auto-ttl=2-4-45 --min-ttl=3'
  },
  {
    id: 'alt1',
    name: 'ALT 1 (FakedspiT)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --fake-from-hex=16030100 --fake-offset=0 --disorder-split=1 --auto-ttl=2-4-45 --min-ttl=3'
  },
  {
    id: 'alt2',
    name: 'ALT 2 (Multisplit 652)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --methodeol=split --disorder-split=1 --auto-ttl=2-4-45 --min-ttl=3 --dpi-desync-split-pos=652'
  },
  {
    id: 'alt4',
    name: 'ALT 4 (BadSeq+Increment)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --disorder-split=1 --wrong-seq --wrong-chk --auto-ttl=2-4-45 --min-ttl=3'
  },
  {
    id: 'alt9',
    name: 'ALT 9 (Ozon/Google Mix)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --methodeol=split --disorder-split=1 --auto-ttl=1-4-45 --min-ttl=3 --dpi-desync-split-pos=3'
  },
  {
    id: 'alt11',
    name: 'ALT 11 (MaxRU - Aggressive)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --fake-from-hex=16030100 --fake-offset=0 --disorder-split=1 --wrong-seq --wrong-chk --auto-ttl=1-4-45 --min-ttl=3'
  },
  {
    id: 'faketls',
    name: 'FAKE TLS AUTO (Universal)',
    args: '--wf-tcp=80,443 --wf-udp=443,50000-65535 --filter-tcp=443 --fake-from-hex=16030100 --fake-offset=0 --auto-ttl=2-4-45 --min-ttl=3'
  }
]

let winwsProcess: ChildProcess | null = null
let analyzerProcess: ChildProcess | null = null

export function winwsPath(source: ZapretSource = 'flowseal'): string {
  return path.join(zapretDir(), source, 'winws.exe')
}

export function isZapretInstalled(source: ZapretSource): boolean {
  return existsSync(winwsPath(source))
}

export function getFlowsealStrategies(): ZapretStrategy[] {
  const dir = path.join(zapretDir(), 'flowseal')
  if (!existsSync(dir)) return FLOWSEAL_STRATEGIES

  // Try to parse bat files for custom/updated strategies
  try {
    const batFiles = readdirSync(dir).filter(
      (f) => f.endsWith('.bat') && !f.startsWith('service') && !f.startsWith('_')
    )
    if (batFiles.length === 0) return FLOWSEAL_STRATEGIES

    const parsed: ZapretStrategy[] = []
    for (const bat of batFiles.sort()) {
      const content = readFileSync(path.join(dir, bat), 'latin1')
      const match = content.match(/winws\.exe\s+(.+)/i)
      if (match) {
        const args = match[1].trim().replace(/\r?\n.*/s, '')
        const name = bat.replace('.bat', '').replace(/_/g, ' ').toUpperCase()
        parsed.push({ id: bat, name, args })
      }
    }
    return parsed.length > 0 ? parsed : FLOWSEAL_STRATEGIES
  } catch {
    return FLOWSEAL_STRATEGIES
  }
}

export async function downloadZapret(
  source: ZapretSource,
  onProgress?: (pct: number) => void
): Promise<void> {
  const apiUrl = source === 'flowseal' ? FLOWSEAL_API : ZAPRET2_API
  const destDir = path.join(zapretDir(), source)
  mkdirSync(destDir, { recursive: true })

  const release = await axios.get(apiUrl, {
    headers: { 'User-Agent': 'VelumVPN' }
  })

  const assets: { name: string; browser_download_url: string; size: number }[] =
    release.data.assets
  const zipAsset = assets.find((a) => a.name.endsWith('.zip'))
  if (!zipAsset) throw new Error('No .zip asset found in release')

  const response = await axios.get(zipAsset.browser_download_url, {
    responseType: 'arraybuffer',
    onDownloadProgress: (e) => {
      if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
  })

  const zip = new AdmZip(Buffer.from(response.data))
  const entries = zip.getEntries()

  // Find root folder prefix (some zips have a subfolder)
  const prefix = entries[0]?.entryName.includes('/') ? entries[0].entryName.split('/')[0] + '/' : ''

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const relPath = prefix ? entry.entryName.replace(prefix, '') : entry.entryName
    if (!relPath) continue
    const outPath = path.join(destDir, relPath)
    mkdirSync(path.dirname(outPath), { recursive: true })
    zip.extractEntryTo(entry, path.dirname(outPath), false, true)
  }
}

export function getZapretVersion(source: ZapretSource): string | null {
  const versionFile = path.join(zapretDir(), source, 'version.txt')
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, 'utf-8').trim()
  }
  return isZapretInstalled(source) ? 'installed' : null
}

export async function startZapret(source: ZapretSource, args: string): Promise<void> {
  await stopZapret()

  const bin = winwsPath(source)
  if (!existsSync(bin)) throw new Error('winws.exe not found')

  const argList = args.split(/\s+/).filter(Boolean)

  winwsProcess = spawn(bin, argList, {
    cwd: path.join(zapretDir(), source),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  winwsProcess.stdout?.on('data', (d) => {
    safeSend(mainWindow, 'zapretLog', d.toString())
  })
  winwsProcess.stderr?.on('data', (d) => {
    safeSend(mainWindow, 'zapretLog', d.toString())
  })
  winwsProcess.on('exit', (code) => {
    winwsProcess = null
    safeSend(mainWindow, 'zapretStopped', { code })
  })
}

export async function stopZapret(): Promise<void> {
  if (winwsProcess && !winwsProcess.killed) {
    winwsProcess.kill('SIGTERM')
    winwsProcess = null
  }
}

export function isZapretRunning(): boolean {
  return winwsProcess !== null && !winwsProcess.killed
}

// zapret2 analyzer: runs zapret-console.bat or analyzer script and streams output
export async function runZapret2Analyzer(): Promise<void> {
  if (analyzerProcess && !analyzerProcess.killed) {
    analyzerProcess.kill()
    analyzerProcess = null
    return
  }

  const dir = path.join(zapretDir(), 'zapret2')
  const analyzerBat = ['analyze.bat', 'zapret-console.bat', 'checker.bat']
    .map((f) => path.join(dir, f))
    .find(existsSync)

  if (!analyzerBat) throw new Error('Analyzer script not found. Please download zapret2 first.')

  analyzerProcess = spawn('cmd.exe', ['/c', analyzerBat], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  })

  safeSend(mainWindow, 'zapretAnalyzerStarted', null)

  analyzerProcess.stdout?.on('data', (d) => {
    safeSend(mainWindow, 'zapretAnalyzerLog', d.toString())
  })
  analyzerProcess.stderr?.on('data', (d) => {
    safeSend(mainWindow, 'zapretAnalyzerLog', d.toString())
  })
  analyzerProcess.on('exit', (code) => {
    analyzerProcess = null
    safeSend(mainWindow, 'zapretAnalyzerDone', { code })
  })
}

export function stopAnalyzer(): void {
  if (analyzerProcess && !analyzerProcess.killed) {
    analyzerProcess.kill()
    analyzerProcess = null
  }
}

export { FLOWSEAL_STRATEGIES }
