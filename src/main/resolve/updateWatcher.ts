import { Notification } from 'electron'
import { getAppConfig } from '../config'
import { t } from '../utils/i18n'
import { checkUpdate } from './autoUpdater'
import { showMainWindow } from '..'

// Checks for a new release from the main process, so it keeps working while the window is closed
// or unloaded (lightweight mode), and tells the user once per version with a system notification.
// The tray menu reads the result through getAvailableUpdate(); nothing is downloaded or installed here.
const FIRST_CHECK_DELAY_MS = 90_000
const CHECK_INTERVAL_MS = 30 * 60_000

let started = false
let notifiedVersion: string | undefined

function notifyUpdate(version: string): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: t('tray.updateAvailable'),
    body: `VelumVPN ${version}`
  })
  notification.on('click', () => {
    void showMainWindow()
  })
  notification.show()
}

async function tick(): Promise<void> {
  try {
    const { autoCheckUpdate = true } = await getAppConfig()
    if (autoCheckUpdate) {
      const update = await checkUpdate()
      if (update && update.version !== notifiedVersion) {
        notifiedVersion = update.version
        notifyUpdate(update.version)
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
