import { app, Menu, shell, dialog } from 'electron'
import { mainWindow } from '..'
import { getAppConfig } from '../config'
import { quitWithoutCore } from '../core/manager'
import { dataDir, logDir, mihomoCoreDir, mihomoWorkDir } from '../utils/dirs'
import { t } from '../utils/i18n'

export async function createApplicationMenu(): Promise<void> {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const { quitWithoutCoreShortcut = '', restartAppShortcut = '' } = await getAppConfig()

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Koala Clash',
      submenu: [
        {
          label: t('menu.about') + ' ' + 'Koala Clash',
          role: 'about'
        },
        { type: 'separator' },
        {
          label: t('menu.hide') + ' ' + 'Koala Clash',
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: t('menu.hideOthers'),
          accelerator: 'Command+Alt+H',
          role: 'hideOthers'
        },
        {
          label: t('menu.showAll'),
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: t('menu.quitKeepCore'),
          accelerator: quitWithoutCoreShortcut,
          click: () => {
            quitWithoutCore()
          }
        },
        {
          label: t('menu.restartApp'),
          accelerator: restartAppShortcut,
          click: () => {
            app.relaunch()
            app.quit()
          }
        },
        {
          label: t('menu.quitApp'),
          accelerator: 'Command+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        {
          label: t('menu.undo'),
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: t('menu.redo'),
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: t('menu.cut'),
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: t('menu.copy'),
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: t('menu.paste'),
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: t('menu.delete'),
          accelerator: 'CmdOrCtrl+Backspace',
          role: 'delete'
        },
        {
          label: t('menu.selectAll'),
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll'
        }
      ]
    },
    {
      label: t('menu.tools'),
      submenu: [
        {
          label: t('menu.openDirectory'),
          submenu: [
            {
              label: t('menu.appDirectory'),
              click: () => shell.openPath(dataDir())
            },
            {
              label: t('menu.workDirectory'),
              click: () => shell.openPath(mihomoWorkDir())
            },
            {
              label: t('menu.coreDirectory'),
              click: () => shell.openPath(mihomoCoreDir())
            },
            {
              label: t('menu.logDirectory'),
              click: () => shell.openPath(logDir())
            }
          ]
        },
        { type: 'separator' },
        {
          label: t('menu.reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload()
            }
          }
        },
        {
          label: t('menu.devTools'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools()
            }
          }
        }
      ]
    },
    {
      label: t('menu.window'),
      submenu: [
        {
          label: t('menu.minimize'),
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: t('menu.close'),
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
        { type: 'separator' },
        {
          label: t('menu.bringAllToFront'),
          role: 'front'
        }
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.learnMore'),
          click: () => {
            shell.openExternal('https://github.com/coolcoala/koala-clash')
          }
        },
        {
          label: t('menu.reportIssue'),
          click: () => {
            shell.openExternal('https://github.com/coolcoala/koala-clash/issues')
          }
        },
        { type: 'separator' },
        {
          label: t('menu.about'),
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: t('menu.aboutApp'),
              message: 'Koala Clash',
              detail: `${t('menu.version')}：${app.getVersion()}\n${t('menu.electronProxyTool')}`,
              buttons: [t('menu.ok')]
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

export async function updateApplicationMenu(): Promise<void> {
  if (process.platform === 'darwin') {
    await createApplicationMenu()
  }
}
