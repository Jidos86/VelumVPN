import { mihomoCloseAllConnections, mihomoHotReloadConfig, restartCore } from '@renderer/utils/ipc'

// Apply saved custom rules to the running core.
// A hot reload avoids restarting the core, but connections that are already open keep the route
// they were matched with, so a new rule would not affect them. Close them after the reload (the same
// thing the route-mode switch does) so apps and sites reconnect through the new rules.
// A full restart is only the fallback if the reload itself is rejected.
export async function applyRulesChange(): Promise<void> {
  try {
    await mihomoHotReloadConfig()
  } catch {
    await restartCore()
    return
  }
  try {
    await mihomoCloseAllConnections()
  } catch {
    // The rules are already loaded; existing connections will follow them once they reconnect.
  }
}
