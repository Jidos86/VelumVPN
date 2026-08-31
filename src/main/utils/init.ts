import {
  appConfigPath,
  controledMihomoConfigPath,
  dataDir,
  logDir,
  mihomoTestDir,
  mihomoWorkDir,
  profileConfigPath,
  profilePath,
  profilesDir,
  resourcesFilesDir,
  rulesDir,
  themesDir
} from './dirs'
import {
  defaultConfig,
  defaultControledMihomoConfig,
  defaultProfile,
  defaultProfileConfig
} from './template'
import { stringifyYaml } from './yaml'
import { mkdir, writeFile, cp, rm, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import {
  startPacServer
} from '../resolve/server'
import { triggerSysProxy } from '../sys/sysproxy'
import {
  getAppConfig,
  getControledMihomoConfig,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import { app } from 'electron'
import { startSSIDCheck } from '../sys/ssid'
import { startNetworkDetection } from '../core/manager'
import { initKeyManager } from '../service/manager'
import { migrateFromOldApp } from './migration'

async function initDirs(): Promise<void> {
  if (!existsSync(dataDir())) {
    await mkdir(dataDir())
  }
  const dirs = [
    themesDir(),
    profilesDir(),
    rulesDir(),
    mihomoWorkDir(),
    logDir(),
    mihomoTestDir(),
  ]
  await Promise.all(
    dirs.map(async (dir) => {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }
    })
  )
}

async function initConfig(): Promise<void> {
  const configTasks: Promise<void>[] = []

  if (!existsSync(appConfigPath())) {
    configTasks.push(writeFile(appConfigPath(), stringifyYaml(defaultConfig)))
  }
  if (!existsSync(profileConfigPath())) {
    configTasks.push(writeFile(profileConfigPath(), stringifyYaml(defaultProfileConfig)))
  }
  if (!existsSync(profilePath('default'))) {
    configTasks.push(writeFile(profilePath('default'), stringifyYaml(defaultProfile)))
  }
  if (!existsSync(controledMihomoConfigPath())) {
    configTasks.push(
      writeFile(controledMihomoConfigPath(), stringifyYaml(defaultControledMihomoConfig))
    )
  }

  if (configTasks.length > 0) {
    await Promise.all(configTasks)
  }
}

async function copyGeoFile(file: string): Promise<void> {
  const targetPath = path.join(mihomoWorkDir(), file)
  const testTargetPath = path.join(mihomoTestDir(), file)
  const sourcePath = path.join(resourcesFilesDir(), file)
  if (!existsSync(sourcePath)) return
  const srcSize = (await stat(sourcePath)).size
  const shouldCopy = async (dst: string): Promise<boolean> => {
    if (!existsSync(dst)) return true
    try {
      const dstSize = (await stat(dst)).size
      return srcSize > dstSize
    } catch {
      return true
    }
  }
  if (await shouldCopy(targetPath)) {
    await cp(sourcePath, targetPath, { recursive: true })
  }
  if (await shouldCopy(testTargetPath)) {
    await cp(sourcePath, testTargetPath, { recursive: true })
  }
}

async function activeGeodataFiles(): Promise<string[]> {
  let geoMode = false
  if (existsSync(controledMihomoConfigPath())) {
    try {
      const { 'geodata-mode': mode = false } = await getControledMihomoConfig()
      geoMode = !!mode
    } catch {
      // default: mmdb
    }
  }
  // ASN.mmdb is independent of geodata-mode and always referenced in geox-url.
  // geoip.dat/geosite.dat are also independent of geodata-mode: ensureRunetfreedomGeodata()
  // (factory.ts) always needs them for the ru-blocked GEOSITE/GEOIP rule categories,
  // regardless of which format the core's own matcher uses. Skipping them here left that
  // function with nothing to start from, forcing a ~90MB download (and a full core-restart
  // stall) on every session's first restart for mmdb-mode users.
  const files = geoMode
    ? ['geoip.dat', 'geosite.dat', 'ASN.mmdb']
    : ['country.mmdb', 'geoip.metadb', 'geoip.dat', 'geosite.dat', 'ASN.mmdb']
  return files
}

export async function copyGeodataFiles(): Promise<void> {
  const files = await activeGeodataFiles()
  await Promise.all(files.map(copyGeoFile))
}

async function initFiles(): Promise<void> {
  await copyGeodataFiles()
}

async function cleanup(): Promise<void> {
  // update cache
  const files = await readdir(dataDir())
  for (const file of files) {
    if (file.endsWith('.exe') || file.endsWith('.pkg') || file.endsWith('.7z')) {
      try {
        await rm(path.join(dataDir(), file))
      } catch {
        // ignore
      }
    }
  }
  // logs
  const { maxLogDays = 7 } = await getAppConfig()
  const logs = await readdir(logDir())
  for (const log of logs) {
    const date = new Date(log.split('.')[0])
    const diff = Date.now() - date.getTime()
    if (diff > maxLogDays * 24 * 60 * 60 * 1000) {
      try {
        await rm(path.join(logDir(), log))
      } catch {
        // ignore
      }
    }
  }
}

async function migration(): Promise<void> {
  const appConfig = await getAppConfig()
  const mihomoConfig = await getControledMihomoConfig()

  const mihomoConfigPatch: Partial<MihomoConfig> = {}

  if (appConfig.controlTun === false && mihomoConfig.tun?.enable) {
    mihomoConfigPatch.tun = { enable: false }
  }

  for (const key in defaultControledMihomoConfig) {
    if (
      !(key in mihomoConfig) &&
      defaultControledMihomoConfig[key as keyof MihomoConfig] !== undefined
    ) {
      ;(mihomoConfigPatch as Record<string, unknown>)[key] =
        defaultControledMihomoConfig[key as keyof MihomoConfig]
    }
  }

  // Replace blocked jsDelivr geodata URLs with GitHub direct URLs
  const geoxUrl = mihomoConfig['geox-url']
  if (geoxUrl?.geosite?.includes('jsdelivr.net') || geoxUrl?.geoip?.includes('jsdelivr.net')) {
    mihomoConfigPatch['geox-url'] = {
      ...geoxUrl,
      ...(geoxUrl?.geosite?.includes('jsdelivr.net') && {
        geosite: 'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geosite.dat'
      }),
      ...(geoxUrl?.geoip?.includes('jsdelivr.net') && {
        geoip: 'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geoip.dat'
      })
    }
  }

  // 清理已弃用的配置
  if (mihomoConfig['external-controller-pipe' as keyof MihomoConfig]) {
    mihomoConfigPatch['external-controller-pipe' as keyof MihomoConfig] = undefined as never
  }
  if (mihomoConfig['external-controller-unix' as keyof MihomoConfig]) {
    mihomoConfigPatch['external-controller-unix' as keyof MihomoConfig] = undefined as never
  }

  if (mihomoConfig['external-controller'] === undefined) {
    mihomoConfigPatch['external-controller'] = ''
  }

  if (Object.keys(mihomoConfigPatch).length > 0) {
    await patchControledMihomoConfig(mihomoConfigPatch)
  }

  const appConfigPatch: Partial<AppConfig> = {}

  for (const key in defaultConfig) {
    if (!(key in appConfig) && defaultConfig[key as keyof AppConfig] !== undefined) {
      ;(appConfigPatch as Record<string, unknown>)[key] = defaultConfig[key as keyof AppConfig]
    }
  }

  // Migrate: the old sysProxy.enable toggle now maps to the new proxyMode toggle.
  // sysProxy.enable becomes a sub-toggle (default ON) that only writes proxy to the OS.
  const legacyAppConfig = appConfig as Partial<AppConfig>
  if (!('proxyMode' in legacyAppConfig)) {
    appConfigPatch.proxyMode = legacyAppConfig.sysProxy?.enable ?? false
    if (!legacyAppConfig.sysProxy?.enable) {
      appConfigPatch.sysProxy = { ...(legacyAppConfig.sysProxy ?? {}), enable: true }
    }
  }

  if (appConfig.geositeUrl && /jsdelivr\.net|ghfast\.top|gh-proxy\.com|ghproxy/i.test(appConfig.geositeUrl)) {
    appConfigPatch.geositeUrl =
      'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geosite.dat'
  }
  if (appConfig.geoipUrl && /jsdelivr\.net|ghfast\.top|gh-proxy\.com|ghproxy/i.test(appConfig.geoipUrl)) {
    appConfigPatch.geoipUrl =
      'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geoip.dat'
  }

  if (Object.keys(appConfigPatch).length > 0) {
    await patchAppConfig(appConfigPatch)
  }
}

function initDeeplink(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('clash', process.execPath, [path.resolve(process.argv[1])])
      app.setAsDefaultProtocolClient('mihomo', process.execPath, [path.resolve(process.argv[1])])
      app.setAsDefaultProtocolClient('velumvpn', process.execPath, [
        path.resolve(process.argv[1])
      ])
    }
  } else {
    app.setAsDefaultProtocolClient('clash')
    app.setAsDefaultProtocolClient('mihomo')
    app.setAsDefaultProtocolClient('velumvpn')
  }
}

export async function init(): Promise<void> {
  await initDirs()
  await initConfig()
  await initFiles()
  try {
    await migrateFromOldApp()
  } catch {
    // migration failure should not block app startup
  }
  await migration()

  const [appConfig] = await Promise.all([
    getAppConfig(),
    initKeyManager(),
    cleanup().catch(() => {
      // ignore
    })
  ])

  const {
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false,
    networkDetection = false
  } = appConfig
  const writeSysProxy = proxyMode && sysProxy.enable

  const initTasks: Promise<void>[] = [
    startSSIDCheck()
  ]

  if (networkDetection) {
    initTasks.push(startNetworkDetection())
  }

  initTasks.push(
    (async (): Promise<void> => {
      try {
        if (writeSysProxy) {
          await startPacServer()
        }
        await triggerSysProxy(writeSysProxy, onlyActiveDevice)
      } catch {
        // ignore
      }
    })()
  )

  await Promise.all(initTasks)

  initDeeplink()
}
