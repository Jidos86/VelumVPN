/* eslint-disable @typescript-eslint/explicit-function-return-type */
import fs from 'fs'
import AdmZip from 'adm-zip'
import path from 'path'
import zlib from 'zlib'
import { extract } from 'tar'
import { execSync } from 'child_process'

const cwd = process.cwd()
const TEMP_DIR = path.join(cwd, 'node_modules/.temp')
let arch = process.arch
const platform = process.platform
if (process.argv.slice(2).length !== 0) {
  arch = process.argv.slice(2)[0].replace('--', '')
}

if (process.env.SKIP_PREPARE === '1') {
  console.log('Skipping prepare script...')
  process.exit(0)
}

/* ======= mihomo (both channels come from our own patched fork, not official upstream, so the
   BitTorrent sniffer - see patches/mihomo/bittorrent_sniffer.go - is always present; its release
   workflow publishes assets with no version suffix, so unlike upstream there is no version.txt
   lookup needed before building the download URL) ======= */
const MIHOMO_FORK_REPO = 'Jidos86/mihomo'
const MIHOMO_ALPHA_URL_PREFIX = `https://github.com/${MIHOMO_FORK_REPO}/releases/download/Prerelease-Alpha`
const MIHOMO_URL_PREFIX = `https://github.com/${MIHOMO_FORK_REPO}/releases/latest/download`

const MIHOMO_ALPHA_MAP = JSON.parse(
  fs.readFileSync(path.join(cwd, 'src/main/core/mihomo-alpha-platform-map.json'), 'utf8')
)
const MIHOMO_MAP = MIHOMO_ALPHA_MAP

/*
 * check available
 */
if (!MIHOMO_MAP[`${platform}-${arch}`]) {
  throw new Error(`unsupported platform "${platform}-${arch}"`)
}

const includeAlphaCore = process.env.INCLUDE_ALPHA_CORE === '1'
if (includeAlphaCore && !MIHOMO_ALPHA_MAP[`${platform}-${arch}`]) {
  throw new Error(`unsupported platform "${platform}-${arch}"`)
}
if (!includeAlphaCore) {
  const leftoverAlpha = path.join(
    cwd,
    'extra',
    'sidecar',
    `mihomo-alpha${platform === 'win32' ? '.exe' : ''}`
  )
  if (fs.existsSync(leftoverAlpha)) {
    fs.rmSync(leftoverAlpha)
    console.log('[INFO]: skipped bundling mihomo-alpha (set INCLUDE_ALPHA_CORE=1 to include)')
  }
}

/**
 * core info
 */
function MihomoAlpha() {
  const name = MIHOMO_ALPHA_MAP[`${platform}-${arch}`]
  const isWin = platform === 'win32'
  const urlExt = isWin ? 'zip' : 'gz'
  const downloadURL = `${MIHOMO_ALPHA_URL_PREFIX}/${name}.${urlExt}`
  const exeFile = `${name}${isWin ? '.exe' : ''}`
  const zipFile = `${name}.${urlExt}`

  return {
    name: 'mihomo-alpha',
    targetFile: `mihomo-alpha${isWin ? '.exe' : ''}`,
    exeFile,
    zipFile,
    downloadURL
  }
}

function mihomo() {
  const name = MIHOMO_MAP[`${platform}-${arch}`]
  const isWin = platform === 'win32'
  const urlExt = isWin ? 'zip' : 'gz'
  const downloadURL = `${MIHOMO_URL_PREFIX}/${name}.${urlExt}`
  const exeFile = `${name}${isWin ? '.exe' : ''}`
  const zipFile = `${name}.${urlExt}`

  return {
    name: 'mihomo',
    targetFile: `mihomo${isWin ? '.exe' : ''}`,
    exeFile,
    zipFile,
    downloadURL
  }
}

/**
 * download sidecar and rename
 */
async function resolveSidecar(binInfo) {
  const { name, targetFile, zipFile, exeFile, downloadURL } = binInfo

  const sidecarDir = path.join(cwd, 'extra', 'sidecar')
  const sidecarPath = path.join(sidecarDir, targetFile)

  fs.mkdirSync(sidecarDir, { recursive: true })
  if (fs.existsSync(sidecarPath)) {
    fs.rmSync(sidecarPath)
  }
  const tempDir = path.join(TEMP_DIR, name)
  const tempZip = path.join(tempDir, zipFile)
  const tempExe = path.join(tempDir, exeFile)

  fs.mkdirSync(tempDir, { recursive: true })
  try {
    if (!fs.existsSync(tempZip)) {
      await downloadFile(downloadURL, tempZip)
    }

    if (zipFile.endsWith('.zip')) {
      const zip = new AdmZip(tempZip)
      zip.getEntries().forEach((entry) => {
        console.log(`[DEBUG]: "${name}" entry name`, entry.entryName)
      })
      zip.extractAllTo(tempDir, true)
      const extractedExe =
        [tempExe, path.join(tempDir, targetFile), path.join(tempDir, 'mihomo.exe')].find((p) =>
          fs.existsSync(p)
        ) ||
        (() => {
          const found = fs.readdirSync(tempDir).find((f) => /\.exe$/i.test(f) || f === 'mihomo')
          return found ? path.join(tempDir, found) : ''
        })()
      if (!extractedExe) {
        throw new Error(`Expected binary not found in ${tempDir}: ${fs.readdirSync(tempDir)}`)
      }
      fs.renameSync(extractedExe, sidecarPath)
      console.log(`[INFO]: "${name}" unzip finished`)
    } else if (zipFile.endsWith('.tgz')) {
      // tgz
      fs.mkdirSync(tempDir, { recursive: true })
      await extract({
        cwd: tempDir,
        file: tempZip
      })
      const files = fs.readdirSync(tempDir)
      console.log(`[DEBUG]: "${name}" files in tempDir:`, files)
      const extractedFile = files.find((file) => file.startsWith('虚空终端-'))
      if (extractedFile) {
        const extractedFilePath = path.join(tempDir, extractedFile)
        fs.renameSync(extractedFilePath, sidecarPath)
        console.log(`[INFO]: "${name}" file renamed to "${sidecarPath}"`)
        execSync(`chmod 755 ${sidecarPath}`)
        console.log(`[INFO]: "${name}" chmod binary finished`)
      } else {
        throw new Error(`Expected file not found in ${tempDir}`)
      }
    } else {
      // gz
      const readStream = fs.createReadStream(tempZip)
      const writeStream = fs.createWriteStream(sidecarPath)
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          console.error(`[ERROR]: "${name}" gz failed:`, error.message)
          reject(error)
        }
        readStream
          .pipe(zlib.createGunzip().on('error', onError))
          .pipe(writeStream)
          .on('finish', () => {
            console.log(`[INFO]: "${name}" gunzip finished`)
            execSync(`chmod 755 ${sidecarPath}`)
            console.log(`[INFO]: "${name}" chmod binary finished`)
            resolve()
          })
          .on('error', onError)
      })
    }
  } catch (err) {
    if (fs.existsSync(sidecarPath)) {
      fs.rmSync(sidecarPath)
    }
    throw err
  } finally {
    fs.rmSync(tempDir, { recursive: true })
  }
}

/**
 * download the file to the extra dir
 */
async function resolveResource(binInfo) {
  const { file, downloadURL, needExecutable = false } = binInfo

  const resDir = path.join(cwd, 'extra', 'files')
  const targetPath = path.join(resDir, file)

  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath)
  }

  fs.mkdirSync(resDir, { recursive: true })
  await downloadFile(downloadURL, targetPath)

  if (needExecutable && platform !== 'win32') {
    execSync(`chmod 755 ${targetPath}`)
    console.log(`[INFO]: ${file} chmod finished`)
  }

  console.log(`[INFO]: ${file} finished`)
}

/**
 * download file and save to `path`
 */
async function downloadFile(url, path) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/octet-stream' }
  })
  if (!response.ok) {
    throw new Error(`download failed ${response.status} "${url}"`)
  }
  const buffer = await response.arrayBuffer()
  fs.writeFileSync(path, new Uint8Array(buffer))

  console.log(`[INFO]: download finished "${url}"`)
}

const resolveMmdb = () =>
  resolveResource({
    file: 'country.mmdb',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country-lite.mmdb`
  })
const resolveMetadb = () =>
  resolveResource({
    file: 'geoip.metadb',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb`
  })
const resolveGeosite = () =>
  resolveResource({
    file: 'geosite.dat',
    downloadURL: `https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geosite.dat`
  })
const resolveGeoIP = () =>
  resolveResource({
    file: 'geoip.dat',
    downloadURL: `https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geoip.dat`
  })
const resolveASN = () =>
  resolveResource({
    file: 'ASN.mmdb',
    downloadURL: `https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb`
  })
const resolveEnableLoopback = () =>
  resolveResource({
    file: 'enableLoopback.exe',
    downloadURL: `https://github.com/Kuingsmile/uwp-tool/releases/download/latest/enableLoopback.exe`
  })
const resolveSparkleService = () => {
  const map = {
    'win32-x64': 'sparkle-service-windows-amd64-v1',
    'win32-ia32': 'sparkle-service-windows-386',
    'win32-arm64': 'sparkle-service-windows-arm64',
    'darwin-x64': 'sparkle-service-darwin-amd64-v1',
    'darwin-arm64': 'sparkle-service-darwin-arm64',
    'linux-x64': 'sparkle-service-linux-amd64-v1',
    'linux-arm64': 'sparkle-service-linux-arm64'
  }
  if (!map[`${platform}-${arch}`]) {
    throw new Error(`unsupported platform "${platform}-${arch}"`)
  }
  const base = map[`${platform}-${arch}`]
  const ext = platform === 'win32' ? '.exe' : ''

  return resolveResource({
    file: `sparkle-service${ext}`,
    downloadURL: `https://github.com/xishang0128/sparkle-service/releases/download/pre-release/${base}${ext}`,
    needExecutable: true
  })
}
const resolveRunner = () =>
  resolveResource({
    file: 'velumvpn-run.exe',
    downloadURL: `https://github.com/coolcoala/koala-clash-run/releases/download/${arch}/koala-clash-run.exe`
  })

const resolve7zip = () =>
  resolveResource({
    file: '7za.exe',
    downloadURL: `https://github.com/develar/7zip-bin/raw/master/win/${arch}/7za.exe`
  })

const resolveFont = async () => {
  // const targetPath = path.join(cwd, 'src', 'renderer', 'src', 'assets', 'NotoColorEmoji.ttf')
  const targetPath = path.join(cwd, 'src', 'renderer', 'src', 'assets', 'twemoji.ttf')

  if (fs.existsSync(targetPath)) {
    return
  }
  await downloadFile(
    // 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf',
    'https://github.com/Sav22999/emoji/raw/refs/heads/master/font/twemoji.ttf',
    targetPath
  )

  console.log(`[INFO]: twemoji.ttf finished`)
}

const tasks = [
  ...(includeAlphaCore
    ? [
        {
          name: 'mihomo-alpha',
          func: () => resolveSidecar(MihomoAlpha()),
          retry: 5
        }
      ]
    : []),
  {
    name: 'mihomo',
    func: () => resolveSidecar(mihomo()),
    retry: 3
  },
  { name: 'mmdb', func: resolveMmdb, retry: 5 },
  { name: 'metadb', func: resolveMetadb, retry: 5 },
  { name: 'geosite', func: resolveGeosite, retry: 5 },
  { name: 'geoip', func: resolveGeoIP, retry: 5 },
  { name: 'asn', func: resolveASN, retry: 5 },
  {
    name: 'font',
    func: resolveFont,
    retry: 5
  },
  {
    name: 'enableLoopback',
    func: resolveEnableLoopback,
    retry: 5,
    winOnly: true
  },
  {
    name: 'sparkle-service',
    func: resolveSparkleService,
    retry: 5
  },
  {
    name: 'runner',
    func: resolveRunner,
    retry: 5,
    winOnly: true
  },
  {
    name: '7zip',
    func: resolve7zip,
    retry: 5,
    winOnly: true
  }
]

async function runTask() {
  const task = tasks.shift()
  if (!task) return
  if (task.winOnly && platform !== 'win32') return runTask()
  if (task.linuxOnly && platform !== 'linux') return runTask()
  if (task.unixOnly && platform === 'win32') return runTask()

  for (let i = 0; i < task.retry; i++) {
    try {
      await task.func()
      break
    } catch (err) {
      console.error(`[ERROR]: task::${task.name} try ${i} ==`, err.message)
      if (i === task.retry - 1) throw err
    }
  }
  return runTask()
}

runTask()
runTask()
