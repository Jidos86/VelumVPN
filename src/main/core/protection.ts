import { BrowserWindow, ipcMain } from 'electron'
import {
  getAppConfig,
  getControledMihomoConfig,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import { mihomoCloseAllConnections, mihomoHotReloadConfig } from './mihomoApi'
import { triggerSysProxy } from '../sys/sysproxy'
import { t } from '../utils/i18n'

export type MainSwitchMode = 'tun' | 'sysproxy'

export interface ProtectionState {
  tun: boolean
  dns: boolean
  proxyMode: boolean
  mainSwitchMode: MainSwitchMode
}

let applying: Promise<void> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = applying.then(job, job)
  applying = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function notify(): Promise<void> {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('controledMihomoConfigUpdated')
    win.webContents.send('appConfigUpdated')
  }
  ipcMain.emit('updateTrayMenu')
  try {
    const { updateTrayIcon } = await import('../resolve/tray')
    await updateTrayIcon()
  } catch {
    // tray may not be ready yet
  }
}

async function readState(): Promise<ProtectionState> {
  const [controlled, app] = await Promise.all([getControledMihomoConfig(true), getAppConfig(true)])
  return {
    tun: controlled.tun?.enable ?? false,
    dns: controlled.dns?.enable ?? false,
    proxyMode: app.proxyMode ?? false,
    mainSwitchMode: (app.mainSwitchMode ?? 'tun') as MainSwitchMode
  }
}

async function writeTun(enable: boolean): Promise<void> {
  if (enable) {
    await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
  } else {
    await patchControledMihomoConfig({ tun: { enable: false } })
  }
}

async function applySysProxy(enable: boolean, onlyActiveDevice: boolean): Promise<void> {
  const result = await triggerSysProxy(enable, onlyActiveDevice)
  if (result.status === 'superseded') return
  if (enable && result.status !== 'applied') {
    throw new Error(t('error.sysProxyDeferred'))
  }
}

async function restore(previous: ProtectionState, onlyActiveDevice: boolean, writeSysProxy: boolean): Promise<void> {
  await patchControledMihomoConfig({
    tun: { enable: previous.tun },
    dns: { enable: previous.dns }
  })
  await patchAppConfig({ proxyMode: previous.proxyMode })
  await mihomoHotReloadConfig()
  if (writeSysProxy) {
    const result = await triggerSysProxy(previous.proxyMode, onlyActiveDevice)
    if (previous.proxyMode && result.status === 'deferred') {
      throw new Error(t('error.sysProxyDeferred'))
    }
  }
}

/**
 * The home button, the tray and the matching shortcut.
 * `mainSwitchMode` only chooses which transport the next ON uses.
 * OFF drops whatever is actually on and never starts the other transport.
 * An AI preset may keep the TUN adapter for REJECT rules; that does not
 * count as the VPN switch being on, because the saved tun.enable stays false.
 */
export function setProtection(enable: boolean): Promise<ProtectionState> {
  return enqueue(() => setProtectionNow(enable))
}

async function setProtectionNow(enable: boolean): Promise<ProtectionState> {
  const previous = await readState()
  const app = await getAppConfig(true)
  const onlyActiveDevice = app.onlyActiveDevice ?? false
  const writeSysProxy = app.sysProxy?.enable !== false
  const mode = app.sysProxy?.mode ?? 'manual'
  const controlled = await getControledMihomoConfig(true)
  const mixedPort = controlled['mixed-port'] ?? 0

  try {
    if (enable) {
      if (previous.mainSwitchMode === 'sysproxy') {
        if (writeSysProxy && mode === 'manual' && mixedPort === 0) {
          throw new Error(t('error.sysProxyDeferred'))
        }
        if (previous.tun) await writeTun(false)
        await patchAppConfig({ proxyMode: true })
        await mihomoHotReloadConfig()
        await mihomoCloseAllConnections()
        if (writeSysProxy) await applySysProxy(true, onlyActiveDevice)
      } else {
        await writeTun(true)
        if (previous.proxyMode) {
          if (writeSysProxy) await triggerSysProxy(false, onlyActiveDevice)
          await patchAppConfig({ proxyMode: false })
        }
        await mihomoHotReloadConfig()
        await mihomoCloseAllConnections()
      }
    } else if (previous.tun || previous.proxyMode) {
      if (previous.proxyMode && writeSysProxy) {
        await triggerSysProxy(false, onlyActiveDevice)
      }
      if (previous.proxyMode) await patchAppConfig({ proxyMode: false })
      if (previous.tun) await writeTun(false)
      await mihomoHotReloadConfig()
      await mihomoCloseAllConnections()
    }
  } catch (error) {
    try {
      await restore(previous, onlyActiveDevice, writeSysProxy)
    } catch (restoreError) {
      await notify()
      throw new Error(`${error}\n${t('error.profileRestoreFailed')}: ${restoreError}`)
    }
    await notify()
    throw error
  }

  await notify()
  return readState()
}

export function setTunEnabled(enable: boolean): Promise<ProtectionState> {
  return enqueue(async () => {
    const previous = await readState()
    try {
      await writeTun(enable)
      await mihomoHotReloadConfig()
      await mihomoCloseAllConnections()
    } catch (error) {
      try {
        await patchControledMihomoConfig({
          tun: { enable: previous.tun },
          dns: { enable: previous.dns }
        })
        await mihomoHotReloadConfig()
      } catch (restoreError) {
        await notify()
        throw new Error(`${error}\n${t('error.profileRestoreFailed')}: ${restoreError}`)
      }
      await notify()
      throw error
    }
    await notify()
    return readState()
  })
}

export function setProxyModeEnabled(enable: boolean): Promise<ProtectionState> {
  return enqueue(async () => {
    const previous = await readState()
    const app = await getAppConfig(true)
    const onlyActiveDevice = app.onlyActiveDevice ?? false
    const writeSysProxy = app.sysProxy?.enable !== false
    try {
      if (enable) {
        await patchAppConfig({ proxyMode: true })
        await mihomoHotReloadConfig()
        await mihomoCloseAllConnections()
        if (writeSysProxy) await applySysProxy(true, onlyActiveDevice)
      } else {
        if (writeSysProxy) await triggerSysProxy(false, onlyActiveDevice)
        await patchAppConfig({ proxyMode: false })
        await mihomoHotReloadConfig()
        await mihomoCloseAllConnections()
      }
    } catch (error) {
      try {
        await patchAppConfig({ proxyMode: previous.proxyMode })
        await mihomoHotReloadConfig()
        if (writeSysProxy) {
          const result = await triggerSysProxy(previous.proxyMode, onlyActiveDevice)
          if (previous.proxyMode && result.status === 'deferred') {
            throw new Error(t('error.sysProxyDeferred'))
          }
        }
      } catch (restoreError) {
        await notify()
        throw new Error(`${error}\n${t('error.profileRestoreFailed')}: ${restoreError}`)
      }
      await notify()
      throw error
    }
    await notify()
    return readState()
  })
}

export function setRouteMode(mode: string): Promise<void> {
  return enqueue(async () => {
    const { routeMode: previous = 'blocked' } = await getAppConfig(true)
    if (previous === mode) return
    await patchAppConfig({ routeMode: mode as 'blocked' | 'all-except-ru' | 'all' })
    try {
      await mihomoHotReloadConfig()
      await mihomoCloseAllConnections()
    } catch (error) {
      try {
        await patchAppConfig({ routeMode: previous })
        await mihomoHotReloadConfig()
      } catch (restoreError) {
        await notify()
        throw new Error(`${error}\n${t('error.profileRestoreFailed')}: ${restoreError}`)
      }
      await notify()
      throw error
    }
    await notify()
  })
}
