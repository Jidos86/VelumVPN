import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs'
import { chmod, rename, rm, writeFile } from 'fs/promises'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import path from 'path'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { downloadedCoreDir, mihomoCorePath } from '../utils/dirs'
import { mainWindow } from '..'
import MIHOMO_PLATFORM_MAP from './mihomo-alpha-platform-map.json'

// Both channels are built from our own patched fork (component/sniffer/bittorrent_sniffer.go,
// see patches/mihomo/bittorrent_sniffer.go for the original overlay) instead of official
// upstream releases, so the BitTorrent sniffer is always present once a core comes from here.
// https://github.com/Jidos86/mihomo
const FORK_REPO = 'Jidos86/mihomo'

const CHANNELS = {
  // A fixed tag the fork's release workflow always re-publishes to (overwriting its assets),
  // so this URL never changes between versions - same convention the original upstream alpha
  // channel used.
  'mihomo-alpha': {
    urlPrefix: `https://github.com/${FORK_REPO}/releases/download/Prerelease-Alpha`,
    progressChannel: 'alphaCoreProgress' as const
  },
  // GitHub always resolves "latest" to the newest non-prerelease release, so this also never
  // needs a version lookup before downloading.
  mihomo: {
    urlPrefix: `https://github.com/${FORK_REPO}/releases/latest/download`,
    progressChannel: 'stableCoreProgress' as const
  }
}

type CoreChannel = keyof typeof CHANNELS

function sendProgress(channel: CoreChannel, progress: number): void {
  mainWindow?.webContents.send(CHANNELS[channel].progressChannel, { progress })
}

async function downloadCore(channel: CoreChannel): Promise<void> {
  const key = `${process.platform}-${process.arch}`
  const name = (MIHOMO_PLATFORM_MAP as Record<string, string>)[key]
  if (!name) {
    throw new Error(`Unsupported platform for ${channel}: ${key}`)
  }

  sendProgress(channel, 0)

  try {
    const isWin = process.platform === 'win32'
    const urlExt = isWin ? 'zip' : 'gz'
    const downloadURL = `${CHANNELS[channel].urlPrefix}/${name}.${urlExt}`
    const exeFile = `${name}${isWin ? '.exe' : ''}`
    const destDir = downloadedCoreDir()
    mkdirSync(destDir, { recursive: true })
    const destPath = path.join(destDir, `${channel}${isWin ? '.exe' : ''}`)
    const tempDir = path.join(destDir, `.tmp-${channel}`)
    const tempArchive = path.join(tempDir, `${name}.${urlExt}`)

    mkdirSync(tempDir, { recursive: true })
    try {
      const response = await axios.get<ArrayBuffer>(downloadURL, {
        responseType: 'arraybuffer',
        timeout: 120000,
        onDownloadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 90) : 0
          sendProgress(channel, pct)
        }
      })
      await writeFile(tempArchive, Buffer.from(response.data))
      sendProgress(channel, 92)

      if (urlExt === 'zip') {
        const zip = new AdmZip(tempArchive)
        zip.extractAllTo(tempDir, true)
        const extracted = path.join(tempDir, exeFile)
        if (!existsSync(extracted)) {
          throw new Error(`Extracted ${channel} core not found: ${exeFile}`)
        }
        await rm(destPath, { force: true })
        await rename(extracted, destPath)
      } else {
        await rm(destPath, { force: true })
        await pipeline(createReadStream(tempArchive), createGunzip(), createWriteStream(destPath))
        await chmod(destPath, 0o755)
      }
      sendProgress(channel, 100)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  } catch (error) {
    sendProgress(channel, -1)
    throw error
  }
}

export async function ensureAlphaCore(): Promise<void> {
  if (existsSync(mihomoCorePath('mihomo-alpha'))) return
  await downloadCore('mihomo-alpha')
}

// Always re-downloads from the fixed Prerelease-Alpha tag, for the explicit "Update core"
// button. Must be used instead of mihomo's own built-in self-upgrade for this channel - that
// would pull an unpatched build from the official upstream and silently drop the BitTorrent
// sniffer.
export async function downloadLatestAlphaCore(): Promise<void> {
  await downloadCore('mihomo-alpha')
}

// Fills in a missing stable core (e.g. first run of a stripped build with no bundled sidecar).
// Does not refresh an already-present core - see downloadLatestStableCore for that.
export async function ensureStableCore(): Promise<void> {
  const isWin = process.platform === 'win32'
  const downloaded = path.join(downloadedCoreDir(), `mihomo${isWin ? '.exe' : ''}`)
  if (existsSync(downloaded)) return
  await downloadCore('mihomo')
}

// Always re-downloads from the fork's latest release, for the explicit "Update core" button.
export async function downloadLatestStableCore(): Promise<void> {
  await downloadCore('mihomo')
}
