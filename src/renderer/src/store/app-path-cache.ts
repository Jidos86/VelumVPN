import { create } from 'zustand'
import { useConnectionsStore } from './connections-store'

const APP_PATH_CACHE_KEY = 'customRulesAppPaths'

function readCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(APP_PATH_CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

interface AppPathCacheStore {
  paths: Record<string, string>
}

// Bare exe names (in Custom Rules) have no path of their own; borrow one from a connection with
// the same process name so an app icon can be pulled for it. Once seen, the name->path pairing is
// cached in localStorage so the icon keeps showing after a restart even while that app isn't
// connected.
export const useAppPathCacheStore = create<AppPathCacheStore>(() => ({
  paths: readCache()
}))

// Subscribed once here at module load, not inside a page component's effect: the previous version
// of this lived inside the Custom Rules page itself, so a process's path was only ever learned
// while that specific page happened to be open - connect through an app with Custom Rules closed
// and its path (and so its icon) would never get cached at all. useConnectionsStore itself is
// already attached app-wide from App.tsx, so this just needs to observe it independently of which
// page is mounted.
useConnectionsStore.subscribe((state) => {
  const prev = useAppPathCacheStore.getState().paths
  const updates: Record<string, string> = {}
  for (const c of state.active) {
    const path = c.metadata?.processPath
    const name = c.metadata?.process || path?.split(/[\\/]/).pop()
    if (name && path) {
      const key = name.toLowerCase()
      if (prev[key] !== path) updates[key] = path
    }
  }
  if (Object.keys(updates).length === 0) return
  const next = { ...prev, ...updates }
  try {
    window.localStorage.setItem(APP_PATH_CACHE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  useAppPathCacheStore.setState({ paths: next })
})
