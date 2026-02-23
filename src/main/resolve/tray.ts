import {
  changeCurrentProfile,
  getAppConfig,
  getControledMihomoConfig,
  getProfileConfig,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import icoIcon from '../../../resources/icon.ico?asset'
import pngIcon from '../../../resources/icon.png?asset'
import templateIcon from '../../../resources/iconTemplate.png?asset'
import {
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoGroups,
  mihomoGroupDelay,
  patchMihomoConfig
} from '../core/mihomoApi'
import { mainWindow, setNotQuitDialog, showMainWindow, triggerMainWindow } from '..'
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray
} from 'electron'
import { triggerSysProxy } from '../sys/sysproxy'
import { quitWithoutCore, restartCore } from '../core/manager'
import { floatingWindow, triggerFloatingWindow } from './floatingWindow'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { applyTheme } from './theme'
import { t } from '../utils/i18n'

export let tray: Tray | null = null
let customTrayWindow: BrowserWindow | null = null

function formatDelayText(delay: number): string {
  if (delay === 0) {
    return 'Timeout'
  } else if (delay > 0) {
    return `${delay} ms`
  }
  return ''
}

function positionCustomTrayWindow(win: BrowserWindow): void {
  if (!tray) return
  const trayBounds = tray.getBounds()
  const { width: winW, height: winH } = win.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winW / 2)
  let y =
    process.platform === 'darwin'
      ? Math.round(trayBounds.y + trayBounds.height + 6)
      : Math.round(trayBounds.y - winH - 6)
  x = Math.min(Math.max(x, dx), dx + dw - winW)
  y = Math.min(Math.max(y, dy), dy + dh - winH)
  win.setPosition(x, y, false)
}

function hideCustomTray(): void {
  if (customTrayWindow && !customTrayWindow.isDestroyed()) {
    customTrayWindow.hide()
  }
}

async function showCustomTray(): Promise<void> {
  const { useCustomTrayMenu = false, customTheme = 'default.css' } = await getAppConfig()
  if (!useCustomTrayMenu) {
    await updateTrayMenu()
    return
  }

  if (!customTrayWindow || customTrayWindow.isDestroyed()) {
    customTrayWindow = new BrowserWindow({
      width: 380,
      height: 520,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      focusable: true,
      hasShadow: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        spellcheck: false,
        sandbox: false
      }
    })

    customTrayWindow.on('blur', () => {
      hideCustomTray()
    })
    customTrayWindow.on('close', () => {
      customTrayWindow = null
    })
    customTrayWindow.on('ready-to-show', () => {
      applyTheme(customTheme)
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await customTrayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/traymenu.html`)
    } else {
      await customTrayWindow.loadFile(join(__dirname, '../renderer/traymenu.html'))
    }
  }

  positionCustomTrayWindow(customTrayWindow)
  customTrayWindow.show()
  customTrayWindow.focus()
}

async function handleTrayClick(): Promise<void> {
  const { useCustomTrayMenu = false } = await getAppConfig()
  if (useCustomTrayMenu) {
    await showCustomTray()
  } else {
    await updateTrayMenu()
  }
}

export const buildContextMenu = async (): Promise<Menu> => {
  const { mode, tun } = await getControledMihomoConfig()
  const {
    sysProxy,
    onlyActiveDevice = false,
    autoCloseConnection,
    proxyInTray = true,
    // useCustomTrayMenu = false,
    triggerSysProxyShortcut = '',
    showFloatingWindowShortcut = '',
    showWindowShortcut = '',
    triggerTunShortcut = '',
    ruleModeShortcut = '',
    globalModeShortcut = '',
    quitWithoutCoreShortcut = '',
    restartAppShortcut = ''
  } = await getAppConfig()
  let groupsMenu: Electron.MenuItemConstructorOptions[] = []
  if (proxyInTray && process.platform !== 'linux') {
    try {
      const groups = await mihomoGroups()
      groupsMenu = groups.map((group) => {
        const currentProxy = group.all.find((proxy) => proxy.name === group.now)
        const delay = currentProxy?.history.length
          ? currentProxy.history[currentProxy.history.length - 1].delay
          : -1
        const displayDelay = formatDelayText(delay)

        return {
          id: group.name,
          label: group.name,
          sublabel: displayDelay,
          type: 'submenu',
          submenu: [
            {
              id: `${group.name}-test`,
              label: t('tray.retest'),
              type: 'normal',
              click: async (): Promise<void> => {
                try {
                  await mihomoGroupDelay(group.name, group.testUrl)
                  ipcMain.emit('updateTrayMenu')
                } catch (e) {
                  // ignore
                }
              }
            },
            { type: 'separator' },
            ...group.all.map((proxy) => {
              const proxyDelay = proxy.history.length
                ? proxy.history[proxy.history.length - 1].delay
                : -1
              const proxyDisplayDelay = formatDelayText(proxyDelay)
              return {
                id: proxy.name,
                label: proxy.name,
                sublabel: proxyDisplayDelay,
                type: 'radio' as const,
                checked: proxy.name === group.now,
                click: async (): Promise<void> => {
                  await mihomoChangeProxy(group.name, proxy.name)
                  if (autoCloseConnection) {
                    await mihomoCloseAllConnections()
                  }
                }
              }
            })
          ]
        }
      })
      groupsMenu.unshift({ type: 'separator' })
    } catch (e) {
      // ignore
      // 避免出错时无法创建托盘菜单
    }
  }
  const { current, items = [] } = await getProfileConfig()

  const contextMenu = [
    {
      id: 'show',
      accelerator: showWindowShortcut,
      label: t('tray.showWindow'),
      type: 'normal',
      click: (): void => {
        showMainWindow()
      }
    },
    {
      id: 'show-floating',
      accelerator: showFloatingWindowShortcut,
      label: floatingWindow?.isVisible() ? t('tray.hideFloatingWindow') : t('tray.showFloatingWindow'),
      type: 'normal',
      click: async (): Promise<void> => {
        await triggerFloatingWindow()
      }
    },
    // { type: 'separator' },
    // {
    //   type: 'checkbox',
    //   label: '自定义托盘菜单',
    //   checked: useCustomTrayMenu,
    //   click: async (item): Promise<void> => {
    //     await patchAppConfig({ useCustomTrayMenu: item.checked })
    //     ipcMain.emit('updateTrayMenu')
    //   }
    // },
    { type: 'separator' },
    {
      type: 'checkbox',
      label: t('tray.systemProxy'),
      accelerator: triggerSysProxyShortcut,
      checked: sysProxy.enable,
      click: async (item): Promise<void> => {
        const enable = item.checked
        try {
          await triggerSysProxy(enable, onlyActiveDevice)
          await patchAppConfig({ sysProxy: { enable } })
          mainWindow?.webContents.send('appConfigUpdated')
          floatingWindow?.webContents.send('appConfigUpdated')
        } catch (e) {
          // ignore
        } finally {
          ipcMain.emit('updateTrayMenu')
        }
      }
    },
    {
      type: 'checkbox',
      label: t('tray.virtualNetwork'),
      accelerator: triggerTunShortcut,
      checked: tun?.enable ?? false,
      click: async (item): Promise<void> => {
        const enable = item.checked
        try {
          if (enable) {
            await patchControledMihomoConfig({ tun: { enable }, dns: { enable: true } })
          } else {
            await patchControledMihomoConfig({ tun: { enable } })
          }
          mainWindow?.webContents.send('controledMihomoConfigUpdated')
          floatingWindow?.webContents.send('controledMihomoConfigUpdated')
          await restartCore()
        } catch {
          // ignore
        } finally {
          ipcMain.emit('updateTrayMenu')
        }
      }
    },
    { type: 'separator' },
    {
      type: 'submenu',
      label: `${t('tray.outboundMode')} (${mode === 'rule' ? t('tray.rule') : t('tray.global')})`,
      submenu: [
        {
          id: 'rule',
          label: t('tray.ruleMode'),
          accelerator: ruleModeShortcut,
          type: 'radio',
          checked: mode === 'rule',
          click: async (): Promise<void> => {
            await patchControledMihomoConfig({ mode: 'rule' })
            await patchMihomoConfig({ mode: 'rule' })
            mainWindow?.webContents.send('controledMihomoConfigUpdated')
            mainWindow?.webContents.send('groupsUpdated')
            ipcMain.emit('updateTrayMenu')
          }
        },
        {
          id: 'global',
          label: t('tray.globalMode'),
          accelerator: globalModeShortcut,
          type: 'radio',
          checked: mode === 'global',
          click: async (): Promise<void> => {
            await patchControledMihomoConfig({ mode: 'global' })
            await patchMihomoConfig({ mode: 'global' })
            mainWindow?.webContents.send('controledMihomoConfigUpdated')
            mainWindow?.webContents.send('groupsUpdated')
            ipcMain.emit('updateTrayMenu')
          }
        }
      ]
    },
    ...groupsMenu,
    { type: 'separator' },
    {
      type: 'submenu',
      label: t('tray.subscriptionConfig'),
      submenu: items.map((item) => {
        return {
          type: 'radio',
          label: item.name,
          checked: item.id === current,
          click: async (): Promise<void> => {
            if (item.id === current) return
            await changeCurrentProfile(item.id)
            mainWindow?.webContents.send('profileConfigUpdated')
            ipcMain.emit('updateTrayMenu')
          }
        }
      })
    },
    { type: 'separator' },
    {
      id: 'quitWithoutCore',
      label: t('tray.quitKeepCore'),
      type: 'normal',
      accelerator: quitWithoutCoreShortcut,
      click: (): void => {
        setNotQuitDialog()
        quitWithoutCore()
      }
    },
    {
      id: 'restart',
      label: t('tray.restartApp'),
      type: 'normal',
      accelerator: restartAppShortcut,
      click: (): void => {
        setNotQuitDialog()
        app.relaunch()
        app.quit()
      }
    },
    {
      id: 'quit',
      label: t('tray.quitApp'),
      type: 'normal',
      accelerator: 'CommandOrControl+Q',
      click: (): void => {
        setNotQuitDialog()
        app.quit()
      }
    }
  ] as Electron.MenuItemConstructorOptions[]
  return Menu.buildFromTemplate(contextMenu)
}

export async function createTray(): Promise<void> {
  const { useDockIcon = true } = await getAppConfig()
  if (process.platform === 'linux') {
    tray = new Tray(pngIcon)
    const menu = await buildContextMenu()
    tray.setContextMenu(menu)
  }
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(templateIcon).resize({ height: 16 })
    icon.setTemplateImage(true)
    tray = new Tray(icon)
  }
  if (process.platform === 'win32') {
    tray = new Tray(icoIcon)
  }
  tray?.setToolTip('Koala Clash')
  tray?.setIgnoreDoubleClickEvents(true)
  if (process.platform === 'darwin') {
    if (!useDockIcon && app.dock) {
      app.dock.hide()
    }
    ipcMain.on('trayIconUpdate', async (_, png: string) => {
      const image = nativeImage.createFromDataURL(png).resize({ height: 16 })
      image.setTemplateImage(true)
      tray?.setImage(image)
    })
    tray?.addListener('right-click', async () => {
      await triggerMainWindow()
    })
    tray?.addListener('click', async () => {
      await handleTrayClick()
    })
  }
  if (process.platform === 'win32') {
    tray?.addListener('click', async () => {
      await triggerMainWindow()
    })
    tray?.addListener('right-click', async () => {
      await handleTrayClick()
    })
  }
  if (process.platform === 'linux') {
    tray?.addListener('click', async () => {
      await triggerMainWindow()
    })
    ipcMain.on('updateTrayMenu', async () => {
      await updateTrayMenu()
    })
  }
}

async function updateTrayMenu(): Promise<void> {
  const menu = await buildContextMenu()
  tray?.popUpContextMenu(menu) // 弹出菜单
  if (process.platform === 'linux') {
    tray?.setContextMenu(menu)
  }
}

ipcMain.on('customTray:close', () => {
  hideCustomTray()
})

export async function copyEnv(type: 'bash' | 'cmd' | 'powershell' | 'nushell'): Promise<void> {
  const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
  const { sysProxy } = await getAppConfig()
  const { host, bypass = [] } = sysProxy
  switch (type) {
    case 'bash': {
      clipboard.writeText(
        `export https_proxy=http://${host || '127.0.0.1'}:${mixedPort} http_proxy=http://${host || '127.0.0.1'}:${mixedPort} all_proxy=http://${host || '127.0.0.1'}:${mixedPort} no_proxy=${bypass.join(',')}`
      )
      break
    }
    case 'cmd': {
      clipboard.writeText(
        `set http_proxy=http://${host || '127.0.0.1'}:${mixedPort}\r\nset https_proxy=http://${host || '127.0.0.1'}:${mixedPort}\r\nset no_proxy=${bypass.join(',')}`
      )
      break
    }
    case 'powershell': {
      clipboard.writeText(
        `$env:HTTP_PROXY="http://${host || '127.0.0.1'}:${mixedPort}"; $env:HTTPS_PROXY="http://${host || '127.0.0.1'}:${mixedPort}"; $env:no_proxy="${bypass.join(',')}"`
      )
      break
    }
    case 'nushell': {
      clipboard.writeText(
        `load-env {http_proxy:"http://${host || '127.0.0.1'}:${mixedPort}", https_proxy:"http://${host || '127.0.0.1'}:${mixedPort}", no_proxy:"${bypass.join(',')}"}`
      )
      break
    }
  }
}

export async function showTrayIcon(): Promise<void> {
  if (!tray) {
    await createTray()
  }
}

export async function closeTrayIcon(): Promise<void> {
  if (tray) {
    tray.destroy()
  }
  tray = null
  if (customTrayWindow) {
    customTrayWindow.destroy()
  }
  customTrayWindow = null
}

export function setDockVisible(visible: boolean): void {
  if (process.platform === 'darwin' && app.dock) {
    if (visible) {
      app.dock.show()
    } else {
      app.dock.hide()
    }
  }
}
