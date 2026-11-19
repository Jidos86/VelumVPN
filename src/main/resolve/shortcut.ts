import { app, globalShortcut, ipcMain, Notification } from 'electron'
import { t } from '../utils/i18n'
import { mainWindow, setNotQuitDialog, triggerMainWindow } from '..'
import { getAppConfig, getControledMihomoConfig, patchControledMihomoConfig } from '../config'
import { setProtection, setProxyModeEnabled, setTunEnabled } from '../core/protection'
import { quitWithoutCore } from '../core/manager'
import { triggerFloatingWindow } from './floatingWindow'

export async function registerShortcut(
  oldShortcut: string,
  newShortcut: string,
  action: string
): Promise<boolean> {
  if (oldShortcut !== '') {
    globalShortcut.unregister(oldShortcut)
  }
  if (newShortcut === '') {
    return true
  }
  switch (action) {
    case 'showWindowShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await triggerMainWindow()
      })
    }
    case 'showFloatingWindowShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await triggerFloatingWindow()
      })
    }
    case 'triggerSysProxyShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        const { proxyMode = false, mainSwitchMode = 'tun' } = await getAppConfig()
        const { tun } = await getControledMihomoConfig()
        const active = (tun?.enable ?? false) || proxyMode
        const enable = mainSwitchMode === 'sysproxy' ? !active : !proxyMode
        try {
          if (mainSwitchMode === 'sysproxy') await setProtection(enable)
          else await setProxyModeEnabled(enable)
          new Notification({
            title: enable ? t('notification.sysProxyEnabled') : t('notification.sysProxyDisabled')
          }).show()
        } catch (error) {
          new Notification({ title: `${error}` }).show()
        } finally {
          ipcMain.emit('updateTrayMenu')
        }
      })
    }
    case 'triggerTunShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        const { mainSwitchMode = 'tun', proxyMode = false } = await getAppConfig()
        const { tun } = await getControledMihomoConfig()
        const active = (tun?.enable ?? false) || proxyMode
        const enable = mainSwitchMode === 'tun' ? !active : !(tun?.enable ?? false)
        try {
          if (mainSwitchMode === 'tun') await setProtection(enable)
          else await setTunEnabled(enable)
          new Notification({
            title: enable ? t('notification.tunEnabled') : t('notification.tunDisabled')
          }).show()
        } catch (error) {
          new Notification({ title: `${error}` }).show()
        } finally {
          ipcMain.emit('updateTrayMenu')
        }
      })
    }
    case 'ruleModeShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await patchControledMihomoConfig({ mode: 'rule' })
        new Notification({
          title: t('notification.switchedToRuleMode')
        }).show()
        mainWindow?.webContents.send('controledMihomoConfigUpdated')
        ipcMain.emit('updateTrayMenu')
      })
    }
    case 'globalModeShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await patchControledMihomoConfig({ mode: 'global' })
        new Notification({
          title: t('notification.switchedToGlobalMode')
        }).show()
        mainWindow?.webContents.send('controledMihomoConfigUpdated')
        ipcMain.emit('updateTrayMenu')
      })
    }
    case 'directModeShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await patchControledMihomoConfig({ mode: 'direct' })
        new Notification({
          title: t('notification.switchedToDirectMode')
        }).show()
        mainWindow?.webContents.send('controledMihomoConfigUpdated')
        ipcMain.emit('updateTrayMenu')
      })
    }
    case 'quitWithoutCoreShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        setNotQuitDialog()
        await quitWithoutCore()
      })
    }
    case 'restartAppShortcut': {
      return globalShortcut.register(newShortcut, () => {
        setNotQuitDialog()
        app.relaunch()
        app.quit()
      })
    }
  }
  throw new Error('Unknown action')
}

export async function initShortcut(): Promise<void> {
  const {
    showFloatingWindowShortcut,
    showWindowShortcut,
    triggerSysProxyShortcut,
    triggerTunShortcut,
    ruleModeShortcut,
    globalModeShortcut,
    directModeShortcut,
    quitWithoutCoreShortcut,
    restartAppShortcut
  } = await getAppConfig()
  if (showWindowShortcut) {
    try {
      await registerShortcut('', showWindowShortcut, 'showWindowShortcut')
    } catch {
      // ignore
    }
  }
  if (showFloatingWindowShortcut) {
    try {
      await registerShortcut('', showFloatingWindowShortcut, 'showFloatingWindowShortcut')
    } catch {
      // ignore
    }
  }
  if (triggerSysProxyShortcut) {
    try {
      await registerShortcut('', triggerSysProxyShortcut, 'triggerSysProxyShortcut')
    } catch {
      // ignore
    }
  }
  if (triggerTunShortcut) {
    try {
      await registerShortcut('', triggerTunShortcut, 'triggerTunShortcut')
    } catch {
      // ignore
    }
  }
  if (ruleModeShortcut) {
    try {
      await registerShortcut('', ruleModeShortcut, 'ruleModeShortcut')
    } catch {
      // ignore
    }
  }
  if (globalModeShortcut) {
    try {
      await registerShortcut('', globalModeShortcut, 'globalModeShortcut')
    } catch {
      // ignore
    }
  }
  if (directModeShortcut) {
    try {
      await registerShortcut('', directModeShortcut, 'directModeShortcut')
    } catch {
      // ignore
    }
  }
  if (quitWithoutCoreShortcut) {
    try {
      await registerShortcut('', quitWithoutCoreShortcut, 'quitWithoutCoreShortcut')
    } catch {
      // ignore
    }
  }
  if (restartAppShortcut) {
    try {
      await registerShortcut('', restartAppShortcut, 'restartAppShortcut')
    } catch {
      // ignore
    }
  }
}
