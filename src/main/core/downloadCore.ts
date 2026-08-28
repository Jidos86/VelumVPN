import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs'
import { chmod, rename, rm, writeFile } from 'fs/promises'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import path from 'path'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { downloadedCoreDir, mihomoCorePath } from '../utils/dirs'
import { mainWindow } from '..'
import MIHOMO_ALPHA_MAP from './mihomo-alpha-platform-map.json'

const MIHOMO_ALPHA_VERSION_URL =
  'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/version.txt'
const MIHOMO_ALPHA_URL_PREFIX =
  'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha'

function sendProgress(progress: number): void {
  mainWindow?.webContents.send('alphaCoreProgress', { progress })
}

export async function ensureAlphaCore(): Promise<void> {
  const corePath = mihomoCorePath('mihomo-alpha')
  if (existsSync(corePath)) return

  const key = `${process.platform}-${process.arch}`
  const name = MIHOMO_ALPHA_MAP[key]
  if (!name) {
    throw new Error(`Unsupported platform for mihomo-alpha: ${key}`)
  }

  sendProgress(0)

  try {
    const { data: versionText } = await axios.get<string>(MIHOMO_ALPHA_VERSION_URL, {
      responseType: 'text',
      timeout: 30000
    })
    const version = versionText.trim()
    const isWin = process.platform === 'win32'
    const urlExt = isWin ? 'zip' : 'gz'
    const downloadURL = `${MIHOMO_ALPHA_URL_PREFIX}/${name}-${version}.${urlExt}`
    const exeFile = `${name}${isWin ? '.exe' : ''}`
    const destDir = downloadedCoreDir()
    mkdirSync(destDir, { recursive: true })
    const destPath = path.join(destDir, `mihomo-alpha${isWin ? '.exe' : ''}`)
    const tempDir = path.join(destDir, '.tmp-alpha')
    const tempArchive = path.join(tempDir, `${name}-${version}.${urlExt}`)

    mkdirSync(tempDir, { recursive: true })
    try {
      const response = await axios.get<ArrayBuffer>(downloadURL, {
        responseType: 'arraybuffer',
        timeout: 120000,
        onDownloadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 90) : 0
          sendProgress(pct)
        }
      })
      await writeFile(tempArchive, Buffer.from(response.data))
      sendProgress(92)

      if (urlExt === 'zip') {
        const zip = new AdmZip(tempArchive)
        zip.extractAllTo(tempDir, true)
        const extracted = path.join(tempDir, exeFile)
        if (!existsSync(extracted)) {
          throw new Error(`Extracted alpha core not found: ${exeFile}`)
        }
        await rm(destPath, { force: true })
        await rename(extracted, destPath)
      } else {
        await rm(destPath, { force: true })
        await pipeline(createReadStream(tempArchive), createGunzip(), createWriteStream(destPath))
        await chmod(destPath, 0o755)
      }
      sendProgress(100)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  } catch (error) {
    sendProgress(-1)
    throw error
  }
}
