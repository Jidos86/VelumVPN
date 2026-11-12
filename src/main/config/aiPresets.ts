import { readFile, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import axios from 'axios'
import { dataDir, resourcesDir } from '../utils/dirs'
import { getBrand } from '../utils/brand'
import { getUserAgent } from '../utils/userAgent'

export interface AiPreset {
  id: string
  enabled: boolean
  proxy?: string
  domains: string[]
}

export interface AiPresets {
  updatedAt?: string
  presets: AiPreset[]
}

interface CatalogPreset {
  id: string
  domains: string[]
}

interface Catalog {
  url?: string
  presets: CatalogPreset[]
}

interface StoredPreset {
  enabled?: boolean
  proxy?: string
}

interface StoredFile {
  updatedAt?: string
  catalog?: Catalog
  presets?: Record<string, StoredPreset>
}

const DEFAULT_REMOTE =
  'https://raw.githubusercontent.com/Jidos86/VelumVPN/main/extra/ai-presets.json'
const STALE_MS = 24 * 60 * 60 * 1000

let storeChain: Promise<unknown> = Promise.resolve()

function withStore<T>(fn: () => Promise<T>): Promise<T> {
  const run = storeChain.then(fn, fn)
  storeChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function catalogPath(): string {
  return path.join(resourcesDir(), 'ai-presets.json')
}

function userPath(): string {
  return path.join(dataDir(), 'ai-presets.json')
}

function normalizeHosts(hosts: unknown): string[] {
  if (!Array.isArray(hosts)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of hosts) {
    if (typeof raw !== 'string') continue
    const host = raw.trim().toLowerCase().replace(/^\*\./, '')
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
  }
  return out
}

function parseCatalog(raw: unknown): Catalog | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Catalog
  if (!Array.isArray(data.presets)) return null
  const url = typeof data.url === 'string' ? data.url.trim() : undefined
  return {
    ...(url ? { url } : {}),
    presets: data.presets
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => ({ id: item.id, domains: normalizeHosts(item.domains) }))
  }
}

function loadBundled(): Catalog {
  const p = catalogPath()
  if (!existsSync(p)) return { presets: [] }
  try {
    return parseCatalog(JSON.parse(readFileSync(p, 'utf-8'))) ?? { presets: [] }
  } catch {
    return { presets: [] }
  }
}

async function readStored(): Promise<StoredFile> {
  if (!existsSync(userPath())) return {}
  try {
    return JSON.parse(await readFile(userPath(), 'utf-8')) as StoredFile
  } catch {
    return {}
  }
}

function activeCatalog(stored: StoredFile): Catalog {
  const cached = parseCatalog(stored.catalog)
  if (cached && cached.presets.length > 0) return cached
  return loadBundled()
}

function assemble(catalog: Catalog, stored: StoredFile): AiPresets {
  return {
    updatedAt: stored.updatedAt,
    presets: catalog.presets.map((c) => {
      const overlay = stored.presets?.[c.id]
      const proxy = overlay?.proxy?.trim()
      return {
        id: c.id,
        enabled: Boolean(overlay?.enabled),
        ...(proxy ? { proxy } : {}),
        domains: c.domains
      }
    })
  }
}

function remoteUrl(bundled: Catalog): string {
  const brand = getBrand() as { aiPresetsUrl?: string }
  return (brand.aiPresetsUrl || bundled.url || DEFAULT_REMOTE).trim()
}

export async function getAiPresets(): Promise<AiPresets> {
  return withStore(async () => {
    const stored = await readStored()
    return assemble(activeCatalog(stored), stored)
  })
}

export async function setAiPreset(
  id: string,
  patch: { enabled?: boolean; proxy?: string }
): Promise<AiPresets> {
  return withStore(async () => {
    const stored = await readStored()
    const catalog = activeCatalog(stored)
    if (!catalog.presets.some((p) => p.id === id)) {
      throw new Error(`Unknown AI preset: ${id}`)
    }
    const prev = stored.presets?.[id] ?? {}
    const next: StoredPreset = { ...prev }
    if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled)
    if (patch.proxy !== undefined) {
      const proxy = patch.proxy.trim()
      if (proxy) next.proxy = proxy
      else delete next.proxy
    }
    stored.presets = { ...(stored.presets ?? {}), [id]: next }
    await writeFile(userPath(), JSON.stringify(stored, null, 2), 'utf-8')
    return assemble(catalog, stored)
  })
}

function remoteFetchError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 404) {
      return new Error('AI preset list is not published on GitHub yet')
    }
    if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') {
      return new Error(err.message)
    }
    return new Error(err.message)
  }
  return err instanceof Error ? err : new Error(String(err))
}

async function fetchRemoteCatalog(): Promise<Catalog> {
  const bundled = loadBundled()
  const url = remoteUrl(bundled)
  try {
    const res = await axios.get<string>(url, {
      timeout: 20000,
      responseType: 'text',
      headers: { 'User-Agent': await getUserAgent() },
      validateStatus: (status) => status === 200
    })
    const parsed = parseCatalog(JSON.parse(res.data))
    if (!parsed || parsed.presets.length === 0) {
      throw new Error('AI preset list is empty')
    }
    return parsed
  } catch (err) {
    if (bundled.presets.length > 0) return bundled
    throw remoteFetchError(err)
  }
}

// Download extra/ai-presets.json from GitHub (same file the installer ships).
// Editing and pushing that file updates every client without a new build.
export async function refreshAiPresetDomains(): Promise<AiPresets> {
  const catalog = await fetchRemoteCatalog()
  return withStore(async () => {
    const stored = await readStored()
    const next: StoredFile = {
      updatedAt: new Date().toISOString(),
      catalog,
      presets: stored.presets ?? {}
    }
    await writeFile(userPath(), JSON.stringify(next, null, 2), 'utf-8')
    return assemble(catalog, next)
  })
}

export async function maybeRefreshAiPresetDomains(): Promise<boolean> {
  try {
    const stored = await withStore(() => readStored())
    const updated = stored.updatedAt ? Date.parse(stored.updatedAt) : 0
    if (updated && Date.now() - updated < STALE_MS) return false
    const before = JSON.stringify(activeCatalog(stored).presets)
    await refreshAiPresetDomains()
    const afterStored = await withStore(() => readStored())
    return before !== JSON.stringify(activeCatalog(afterStored).presets)
  } catch {
    return false
  }
}
