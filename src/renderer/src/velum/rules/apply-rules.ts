import { mihomoHotReloadConfig, restartCore } from '@renderer/utils/ipc'

// Apply saved custom rules to the running core. A hot reload keeps open connections
// (calls, games) alive; a full restart is only the fallback if the reload is rejected.
export async function applyRulesChange(): Promise<void> {
  try {
    await mihomoHotReloadConfig()
  } catch {
    await restartCore()
  }
}
