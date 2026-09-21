import { Notification } from 'electron'
import { getAppConfig, patchAppConfig } from '../config'
import { t } from '../utils/i18n'
import { autoInstallSupported, checkUpdate, downloadUpdate } from './autoUpdater'
import { showMainWindow } from '..'

// Checks for a new release from the main process, so it keeps working while the window is closed
// or unloaded (lightweight mode), and tells the user once per version with a system notification.
// "Once" survives restarts: the version that was announced is stored in the config, so a user who
// ignores an update is not reminded on every launch (the tray card and the home screen still show it).
// With automatic updates on (Windows installer build) the installer is also downloaded and verified
// in the background; it is then installed on the next exit or launch (see autoUpdater.ts).
// The tray menu reads the result through getAvailableUpdate().
const FIRST_CHECK_DELAY_MS = 90_000
const CHECK_INTERVAL_MS = 30 * 60_000

let started = false

function notifyUpdate(version: string, downloaded: boolean): void {
  if (!Notification.isSupported()) return
  const notification = new Notification(
    downloaded
      ? {
          title: t('notification.updateReadyTitle'),
          body: `VelumVPN ${version} — ${t('notification.updateReadyHint')}`
        }
      : { title: t('tray.updateAvailable'), body: `VelumVPN ${version}` }
  )
  notification.on('click', () => {
    void showMainWindow()
  })
  notification.show()
}

async function tick(): Promise<void> {
  try {
    const { autoCheckUpdate = true, autoUpdate = true, lastNotifiedUpdate } = await getAppConfig()
    if (autoCheckUpdate) {
      const update = await checkUpdate()
      if (update) {
        const auto = autoUpdate && autoInstallSupported()
        let downloaded = false
        if (auto) {
          try {
            await downloadUpdate(update.version, true)
            downloaded = true
          } catch {
            // offline or GitHub unreachable: the download is retried on the next tick
          }
        }
        // announce once the update is really ready (or right away when it is a manual one)
        if ((!auto || downloaded) && update.version !== lastNotifiedUpdate) {
          // remember first: if saving fails we would rather skip a notification than repeat it forever
          await patchAppConfig({ lastNotifiedUpdate: update.version })
          notifyUpdate(update.version, downloaded)
        }
      }
    }
  } catch {
    // offline or GitHub unreachable: try again on the next tick
  } finally {
    setTimeout(tick, CHECK_INTERVAL_MS)
  }
}

export function initUpdateWatcher(): void {
  if (started) return
  started = true
  setTimeout(tick, FIRST_CHECK_DELAY_MS)
}
