import { create } from 'zustand'
import { getImageDataURL } from '@renderer/utils/ipc'
import { readIconCache, writeIconCache } from './icon-cache'

interface FaviconStore {
  favicons: Record<string, string>
  failed: Set<string>
  requestFavicon: (domain: string) => void
}

const CONCURRENCY = 4
const SCHEDULE_DELAY_MS = 50
const STORAGE_PREFIX = 'favicon:'

const queue = new Set<string>()
const processing = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

// Fetched through getImageDataURL, which routes the request through the app's own mixed port
// (same as the group-icon fetch in proxies.tsx), so this goes over the VPN like anything else
// instead of leaking the domain list to the favicon provider outside the tunnel.
const faviconUrl = (domain: string): string =>
  `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`

export const useFaviconStore = create<FaviconStore>((_set, get) => ({
  favicons: {},
  failed: new Set(),
  requestFavicon: (domain): void => {
    if (!domain) return
    const state = get()
    if (state.favicons[domain] || state.failed.has(domain) || processing.has(domain) || queue.has(domain)) return
    queue.add(domain)
    schedule()
  }
}))

const schedule = (): void => {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void process()
  }, SCHEDULE_DELAY_MS)
}

const process = async (): Promise<void> => {
  const slots = CONCURRENCY - processing.size
  if (slots <= 0 || queue.size === 0) return
  const toProcess = Array.from(queue).slice(0, slots)
  toProcess.forEach((d) => queue.delete(d))

  await Promise.all(
    toProcess.map(async (domain) => {
      processing.add(domain)
      try {
        const key = STORAGE_PREFIX + domain
        const cached = await readIconCache(key, key)
        if (cached) {
          useFaviconStore.setState((s) => ({ favicons: { ...s.favicons, [domain]: cached } }))
          return
        }
        const dataURL = await getImageDataURL(faviconUrl(domain))
        // Google's fallback favicon (the generic globe) is a tiny handful of bytes; treat it as
        // "no real icon" so the badge letter shows instead of a blank globe for every unknown domain.
        if (!dataURL || dataURL.length < 400) {
          useFaviconStore.setState((s) => ({ failed: new Set(s.failed).add(domain) }))
          return
        }
        useFaviconStore.setState((s) => ({ favicons: { ...s.favicons, [domain]: dataURL } }))
        await writeIconCache(key, dataURL)
      } catch {
        useFaviconStore.setState((s) => ({ failed: new Set(s.failed).add(domain) }))
      } finally {
        processing.delete(domain)
      }
    })
  )

  if (queue.size > 0) schedule()
}
