import { app } from 'electron'
import { join } from 'path'

// Beta flavor: gives the new-design build its own identity so it can run next to the
// released app (separate data dir, control pipe, TUN adapter, port, scheduled tasks).
// Before merging into main: set IS_BETA to false and revert the identity in electron-builder.yml.
export const IS_BETA = true

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

export const FLAVOR = IS_BETA ? beta : prod

// Runs on import, so this module must be the first import of the main entry:
// userData has to be set before anything reads it.
if (IS_BETA) {
  app.setName(FLAVOR.appName)
  app.setPath('userData', join(app.getPath('appData'), FLAVOR.dataFolder))
}
