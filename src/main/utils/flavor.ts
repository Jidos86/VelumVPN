import { app } from 'electron'
import { join } from 'path'

// Beta flavor: gives a test build its own identity so it can run next to the released app
// (separate data dir, control pipe, TUN adapter, port, scheduled tasks). Off in releases.
// To build a side-by-side beta: set this to true (here and in the renderer's velum/flavor.ts) and
// give electron-builder.yml a different appId/productName and URI scheme.
export const IS_BETA = false

const prod = {
  appName: 'VelumVPN',
  dataFolder: 'velumvpn',
  winPipe: '\\\\.\\pipe\\VelumVPN\\mihomo',
  sockSuffix: '',
  tunDevice: 'velumvpn',
  mixedPort: 7897,
  autorunTask: 'velumvpn',
  elevateTask: 'velumvpn-run',
  appUserModelId: 'velumvpn.app'
}

const beta = {
  appName: 'VelumVPN Beta',
  dataFolder: 'velumvpn-beta',
  winPipe: '\\\\.\\pipe\\VelumVPN-Beta\\mihomo',
  sockSuffix: '-beta',
  tunDevice: 'velumvpn-beta',
  mixedPort: 7899,
  autorunTask: 'velumvpn-beta',
  elevateTask: 'velumvpn-beta-run',
  appUserModelId: 'velumvpn.app.beta'
}

const dev = {
  appName: 'VelumVPN DEV',
  dataFolder: 'velumvpn-dev',
  winPipe: '\\\\.\\pipe\\VelumVPN-DEV\\mihomo',
  sockSuffix: '-dev',
  tunDevice: 'velumvpn-dev',
  mixedPort: 17897,
  autorunTask: 'velumvpn-dev',
  elevateTask: 'velumvpn-dev-run',
  appUserModelId: 'velumvpn.app.dev'
}

// Renaming electron.exe (e.g. VelumVPN-DEV.exe) makes app.isPackaged true. Vite still sets this.
export const IS_DEV_SHELL =
  Boolean(process.env.ELECTRON_RENDERER_URL) || Boolean(process.defaultApp)

export const FLAVOR = IS_DEV_SHELL ? dev : IS_BETA ? beta : prod

// Runs on import, so this module must be the first import of the main entry:
// userData has to be set before anything reads it.
if (IS_DEV_SHELL || IS_BETA) {
  app.setName(FLAVOR.appName)
  if (IS_DEV_SHELL) {
    app.setAppUserModelId(FLAVOR.appUserModelId)
  }
  app.setPath('userData', join(app.getPath('appData'), FLAVOR.dataFolder))
}
