import { FLAVOR } from '../utils/flavor'
import { app } from 'electron'
import {
  getControledMihomoConfig,
  getProfileConfig,
  getProfile,
  getProfileStr,
  getAppConfig,
  getCustomRules,
  getAiPresets,
  maybeRefreshAiPresetDomains
} from '../config'
import type { CustomRuleItem, CustomRules } from '../config/customRules'
import type { AiPresets } from '../config/aiPresets'
import { execFileSync } from 'child_process'
import {
  logPath,
  mihomoCorePath,
  mihomoProfileWorkDir,
  mihomoWorkConfigPath,
  mihomoWorkDir,
  mihomoTestDir,
  rulePath,
  templatesDir,
  userTemplatesDir
} from '../utils/dirs'
import { getBrand } from '../utils/brand'
import { t } from '../utils/i18n'
import { mainWindow } from '..'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { copyFile, mkdir, readFile, writeFile, stat } from 'fs/promises'
import { deepMerge } from '../utils/merge'
import { existsSync } from 'fs'
import path from 'path'
import axios from 'axios'

let runtimeConfigStr: string,
  rawProfileStr: string,
  currentProfileStr: string,
  runtimeConfig: MihomoConfig

// runetfreedom geodata is larger than MetaCubeX lite — use size threshold to detect outdated files
// runetfreedom geosite.dat ~10MB (MetaCubeX ~3MB), geoip.dat ~8MB (MetaCubeX ~4MB)
const GEO_MIN_SIZE: Record<string, number> = {
  'geosite.dat': 5 * 1024 * 1024,
  'geoip.dat': 6 * 1024 * 1024
}

const RUNETFREEDOM_URLS = {
  geosite:
    'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geosite.dat',
  geoip:
    'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geoip.dat'
}

function isJsdelivrOrProxy(url: string): boolean {
  return /jsdelivr\.net|ghfast\.top|gh-proxy\.com|ghproxy/i.test(url)
}

function pickGitHubGeoUrl(override: string | undefined, github: string): string {
  if (!override || isJsdelivrOrProxy(override)) return github
  return override
}

async function downloadGeoFile(
  url: string,
  onProgress: (progress: number) => void
): Promise<ArrayBuffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    onDownloadProgress: (e) => {
      onProgress(e.total ? e.loaded / e.total : 0)
    }
  })
  return res.data
}

function resolveGeoUrls(): { geositeUrl: string; geoipUrl: string } {
  const brand = getBrand()
  return {
    geositeUrl: pickGitHubGeoUrl(brand.geositeUrl, RUNETFREEDOM_URLS.geosite),
    geoipUrl: pickGitHubGeoUrl(brand.geoipUrl, RUNETFREEDOM_URLS.geoip)
  }
}

export async function forceUpdateGeodata(): Promise<void> {
  const { geositeUrl, geoipUrl } = await (async () => {
    try {
      const cfg = await getAppConfig()
      const brand = getBrand()
      return {
        geositeUrl: pickGitHubGeoUrl(cfg.geositeUrl || brand.geositeUrl, RUNETFREEDOM_URLS.geosite),
        geoipUrl: pickGitHubGeoUrl(cfg.geoipUrl || brand.geoipUrl, RUNETFREEDOM_URLS.geoip)
      }
    } catch {
      return resolveGeoUrls()
    }
  })()

  const files = [
    { url: geositeUrl, name: 'geosite.dat' },
    { url: geoipUrl, name: 'geoip.dat' }
  ]

  const totalFiles = files.length

  for (let i = 0; i < files.length; i++) {
    const { url, name } = files[i]
    const dest = path.join(mihomoWorkDir(), name)

    mainWindow?.webContents.send('geodataProgress', { file: name, progress: 0, fileIndex: i, totalFiles })

    const data = await downloadGeoFile(url, (fileProgress) => {
      const overall = (i + fileProgress) / totalFiles
      mainWindow?.webContents.send('geodataProgress', {
        file: name,
        progress: Math.round(overall * 100),
        fileIndex: i,
        totalFiles
      })
    })

    await writeFile(dest, Buffer.from(data))

    const testDest = path.join(mihomoTestDir(), name)
    await copyFile(dest, testDest)
  }

  const catalogChanged = await maybeRefreshAiPresetDomains()
  if (catalogChanged) {
    try {
      await reloadAiRuntime(true)
    } catch {
      // Core may still be starting; the next generateProfile will pick up the catalog.
    }
  }

  mainWindow?.webContents.send('geodataProgress', { file: '', progress: 100, fileIndex: totalFiles, totalFiles })
}

export async function reloadAiRuntime(closeConnections: boolean): Promise<void> {
  const { mihomoHotReloadConfig, mihomoCloseAllConnections } = await import('./mihomoApi')
  await mihomoHotReloadConfig()
  if (!closeConnections) return
  try {
    await mihomoCloseAllConnections()
  } catch {
    // Rules are already loaded; leftover flows follow them on reconnect.
  }
}

async function geoFileNeedsUpdate(filePath: string): Promise<boolean> {
  if (!existsSync(filePath)) return true
  try {
    const { size } = await stat(filePath)
    return size < (GEO_MIN_SIZE[path.basename(filePath)] ?? 0)
  } catch {
    return true
  }
}

async function syncGeoToTestDir(fileName: string): Promise<void> {
  const src = path.join(mihomoWorkDir(), fileName)
  const dst = path.join(mihomoTestDir(), fileName)
  if (!existsSync(src)) return
  const srcStat = await stat(src)
  const dstOutdated = await geoFileNeedsUpdate(dst)
  if (dstOutdated || (existsSync(dst) && (await stat(dst)).size < srcStat.size)) {
    await copyFile(src, dst)
  }
}

async function ensureRunetfreedomGeodata(): Promise<boolean> {
  let geositeUrl = RUNETFREEDOM_URLS.geosite
  let geoipUrl = RUNETFREEDOM_URLS.geoip
  try {
    const cfg = await getAppConfig()
    const brand = getBrand()
    geositeUrl = pickGitHubGeoUrl(cfg.geositeUrl || brand.geositeUrl, RUNETFREEDOM_URLS.geosite)
    geoipUrl = pickGitHubGeoUrl(cfg.geoipUrl || brand.geoipUrl, RUNETFREEDOM_URLS.geoip)
  } catch {
    // use defaults
  }

  const GEO_FILES = [
    { url: geositeUrl, name: 'geosite.dat' },
    { url: geoipUrl, name: 'geoip.dat' }
  ]

  const toDownload = (
    await Promise.all(
      GEO_FILES.map(async (f) => ({
        ...f,
        needed: await geoFileNeedsUpdate(path.join(mihomoWorkDir(), f.name))
      }))
    )
  ).filter((f) => f.needed)

  if (toDownload.length === 0) {
    await Promise.all(GEO_FILES.map((f) => syncGeoToTestDir(f.name)))
    return true
  }

  const totalFiles = toDownload.length
  mainWindow?.webContents.send('geodataProgress', {
    file: toDownload[0].name, progress: 0, fileIndex: 0, totalFiles, auto: true
  })

  let downloadFailed = false

  for (let i = 0; i < toDownload.length; i++) {
    const { url, name } = toDownload[i]
    const dest = path.join(mihomoWorkDir(), name)
    try {
      const data = await downloadGeoFile(url, (fileProgress) => {
        const overall = (i + fileProgress) / totalFiles
        mainWindow?.webContents.send('geodataProgress', {
          file: name,
          progress: Math.round(overall * 100),
          fileIndex: i,
          totalFiles,
          auto: true
        })
      })
      await writeFile(dest, Buffer.from(data))
      await copyFile(dest, path.join(mihomoTestDir(), name))
    } catch (error) {
      downloadFailed = true
      await writeFile(
        logPath(),
        `[Factory]: geodata download failed for ${name}: ${error}\n`,
        { flag: 'a' }
      ).catch(() => {})
    }
  }

  mainWindow?.webContents.send('geodataProgress', {
    file: '', progress: 100, fileIndex: totalFiles, totalFiles, auto: true
  })

  await Promise.all(GEO_FILES.map((f) => syncGeoToTestDir(f.name)))

  if (downloadFailed) {
    mainWindow?.webContents.send(
      'showError',
      t('notification.geodataUpdateFailed'),
      t('notification.geodataUpdateFailedHint')
    )
  }

  // Check if files are still too small after download attempts
  const stillBad = await Promise.all(
    GEO_FILES.map((f) => geoFileNeedsUpdate(path.join(mihomoWorkDir(), f.name)))
  )
  return !stillBad.some(Boolean)
}

const ROUTE_MODE_TEMPLATES: Record<string, string> = {
  blocked: 'blocked-only.yaml',
  'all-except-ru': 'all-foreign.yaml',
  all: 'all-proxy.yaml'
}

const DIRECT_NODE_DNS = ['system', '77.88.8.8', '77.88.1.1']
const YANDEX_PLAIN_DNS = ['77.88.8.8', '77.88.1.1']
const BLOCKED_DOH =
  /dns\.google|cloudflare-dns\.com|mozilla\.cloudflare|(?:tls|https|quic|h3):\/\/(?:1\.1\.1\.1|1\.0\.0\.1|8\.8\.8\.8|8\.8\.4\.4)|(?:1\.1\.1\.1|1\.0\.0\.1|8\.8\.8\.8|8\.8\.4\.4)\/dns-query/i

function isEncryptedDns(server: string): boolean {
  return /^(https|tls|quic|h3):\/\//i.test(server)
}

function stripBlockedDoh(servers?: string[]): string[] {
  return (servers ?? []).filter((s) => !BLOCKED_DOH.test(s))
}

function ensureDirectNodeDns(template: MihomoConfig): void {
  const dns = template.dns
  if (!dns) return

  dns.nameserver = stripBlockedDoh(dns.nameserver)
  dns['proxy-server-nameserver'] = stripBlockedDoh(dns['proxy-server-nameserver'])
  dns['direct-nameserver'] = stripBlockedDoh(dns['direct-nameserver'])
  dns['default-nameserver'] = stripBlockedDoh(dns['default-nameserver'])

  if (!dns['proxy-server-nameserver'].length) {
    dns['proxy-server-nameserver'] = [...DIRECT_NODE_DNS]
    dns['respect-rules'] = true
  }
  if (!dns['direct-nameserver'].length) {
    dns['direct-nameserver'] = [...DIRECT_NODE_DNS]
  }
  if (!dns['default-nameserver']?.length) {
    dns['default-nameserver'] = [...YANDEX_PLAIN_DNS]
  }
  if (!dns.nameserver.length || dns.nameserver.every(isEncryptedDns)) {
    dns.nameserver = [...YANDEX_PLAIN_DNS, ...dns.nameserver]
  }
}

async function loadRouteTemplate(routeMode: string): Promise<MihomoConfig | null> {
  const templateFile = ROUTE_MODE_TEMPLATES[routeMode]
  if (!templateFile) return null

  const userPath = path.join(userTemplatesDir(), templateFile)
  const bundledPath = path.join(templatesDir(), templateFile)

  if (!existsSync(bundledPath)) return null
  const bundledContent = await readFile(bundledPath, 'utf-8')

  if (existsSync(userPath)) {
    const userContent = await readFile(userPath, 'utf-8')
    const firstLine = userContent.split('\n')[0]
    const versionMatch = firstLine.match(/^# velum-version: (.+)$/)
    const storedVersion = versionMatch?.[1]?.trim()

    if (storedVersion === app.getVersion()) {
      // Версия совпадает — используем файл пользователя целиком
      return parseYaml(userContent) as MihomoConfig
    }

    // Версия изменилась — берём свежий бандл, но переносим пользовательские правила
    const bundledTemplate = parseYaml(bundledContent) as MihomoConfig
    const userTemplate = parseYaml(userContent) as MihomoConfig & { 'x-velum-user-rules'?: string[] }
    const userCustomRules = userTemplate['x-velum-user-rules']

    if (Array.isArray(userCustomRules) && userCustomRules.length > 0) {
      const rules = (bundledTemplate.rules as unknown as string[]) ?? []
      const matchIndex = rules.findIndex((r) => r.startsWith('MATCH,') || r === 'MATCH')
      const insertAt = matchIndex >= 0 ? matchIndex : rules.length
      rules.splice(insertAt, 0, ...userCustomRules)
      bundledTemplate.rules = rules as unknown as []
    }

    return bundledTemplate
  }

  return parseYaml(bundledContent) as MihomoConfig
}

export { ROUTE_MODE_TEMPLATES }

function injectProxiesIntoTemplate(
  template: MihomoConfig,
  proxies: Array<{ name: string }>
): void {
  const proxyNames = proxies.map((p) => p.name)
  template.proxies = proxies as unknown as []

  if (!Array.isArray(template['proxy-groups'])) return

  for (const group of template['proxy-groups'] as Array<Record<string, unknown>>) {
    const remnawave = group.remnawave as { 'include-proxies'?: boolean } | undefined
    if (!remnawave?.['include-proxies']) continue

    delete group.remnawave

    const groupType = group.type as string
    if (groupType === 'url-test' || groupType === 'load-balance' || groupType === 'fallback') {
      group.proxies = proxyNames
    } else {
      const existing = (group.proxies as string[]) || []
      group.proxies = [...existing, ...proxyNames]
    }
  }
}

function ipCidrRule(ip: string, target: string): string {
  const clean = ip.replace(/:\d+$/, '').replace(/^\[(.+)\]$/, '$1')
  const hasMask = clean.includes('/')
  const isV6 = clean.split('/')[0].includes(':')
  if (hasMask) {
    return isV6 ? `IP-CIDR6,${clean},${target},no-resolve` : `IP-CIDR,${clean},${target},no-resolve`
  }
  return isV6 ? `IP-CIDR6,${clean}/128,${target},no-resolve` : `IP-CIDR,${clean}/32,${target},no-resolve`
}

const RULE_FALLBACK_PREFIX = '↳ '
const AI_REJECT_PREFIX = 'AI · '
const TORRENT_SNIFF_HOST = 'bittorrent.invalid'
// Gemini / AI Studio / Bard check the real client IP. Not GEOSITE,google — search, Gmail
// and Drive stay DIRECT in "blocked only". clients6 covers *.clients6.google.com (waa-pa, makersuite).
// geosite:google-gemini is absent from runetfreedom geosite.dat; do not add it.
const GEMINI_VPN_SUFFIXES = [
  'gemini.google.com',
  'generativelanguage.googleapis.com',
  'alkalimats-pa.googleapis.com',
  'proactivebackend-pa.googleapis.com',
  'assistant-s3-pa.googleapis.com',
  'alkaliminer-pa.googleapis.com',
  'robinfrontend-pa.googleapis.com',
  'clients6.google.com',
  'generativeai.google',
  'makersuite.google.com',
  'aistudio.google.com',
  'bard.google.com',
  'ai.google.dev',
  'ogs.google.com',
  'lh3.googleusercontent.com',
  'lh3.google.com',
  'accounts.google.com',
  'ssl.gstatic.com',
  'apis.google.com',
  'play.google.com',
  'oauthaccountmanager.googleapis.com',
  'myaccount.google.com',
  'people-pa.googleapis.com'
]
const TORRENT_PROCESSES = [
  'qbittorrent.exe',
  'qbittorrent',
  'utorrent.exe',
  'uTorrent.exe',
  'bittorrent.exe',
  'BitTorrent.exe',
  'BitComet.exe',
  'bitcomet.exe',
  'transmission-qt.exe',
  'transmission-gtk',
  'transmission-daemon',
  'transmission.exe',
  'deluge.exe',
  'deluged',
  'tixati.exe',
  'WebTorrent.exe',
  'FrostWire.exe',
  'aria2c.exe',
  'aria2c',
  'BiglyBT.exe',
  'PicoTorrent.exe',
  'vuze.exe',
  'azureus.exe',
  'rtorrent',
  'flood'
]

function ruleFallbackGroupName(proxyName: string): string {
  return `${RULE_FALLBACK_PREFIX}${proxyName}`
}

function knownOutboundNames(template: MihomoConfig): Set<string> {
  const names = new Set<string>()
  for (const p of (template.proxies as Array<{ name: string }>) || []) {
    if (p?.name) names.add(p.name)
  }
  for (const g of (template['proxy-groups'] as Array<{ name: string }>) || []) {
    if (g?.name) names.add(g.name)
  }
  names.add('DIRECT')
  names.add('REJECT')
  return names
}

function countryCodeFromProxyName(name: string): string {
  const flag = name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)
  if (flag) {
    return [...flag[0]]
      .map((ch) => String.fromCharCode((ch.codePointAt(0) ?? 0) - 0x1f1e6 + 65))
      .join('')
  }
  const tail = name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').match(/\|\s*([A-Za-z]{2})\b/)
  return tail ? tail[1].toUpperCase() : ''
}

function sameCountryProxyNames(template: MihomoConfig, selected: string): string[] {
  const names = ((template.proxies as Array<{ name: string }>) || []).map((p) => p.name).filter(Boolean)
  if (!names.includes(selected)) return []
  const code = countryCodeFromProxyName(selected)
  if (!code) return [selected]
  const same = names.filter((n) => countryCodeFromProxyName(n) === code)
  return [selected, ...same.filter((n) => n !== selected)]
}

function aiRejectGroupName(key: string): string {
  return `${AI_REJECT_PREFIX}${key}`
}

function proxyGroups(template: MihomoConfig): Array<Record<string, unknown>> {
  return ((template['proxy-groups'] as Array<Record<string, unknown>>) || []).slice()
}

function groupMembers(group: Record<string, unknown> | undefined): string[] {
  const proxies = group?.proxies
  return Array.isArray(proxies) ? proxies.filter((n): n is string => typeof n === 'string') : []
}

async function liveNow(name: string): Promise<string | undefined> {
  try {
    const { mihomoProxies } = await import('./mihomoApi')
    const detail = (await mihomoProxies()).proxies[name]
    if (detail && 'now' in detail && typeof detail.now === 'string' && detail.now) return detail.now
  } catch {
    // Core is not up yet (first generateProfile) — fall back to the YAML group.
  }
  return undefined
}

// Follow select/url-test `now` down to a real node. Used when a preset pins a country.
function isPassthroughOutbound(name: string): boolean {
  const n = name.trim().toUpperCase()
  return n === 'DIRECT' || n === 'REJECT' || n === 'PASS' || n === 'COMPATIBLE'
}

async function resolveAiAnchor(
  template: MihomoConfig,
  selected: string,
  leaf: Set<string>
): Promise<string | undefined> {
  const groups = proxyGroups(template)
  let current = selected
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    if (isPassthroughOutbound(current)) return undefined
    if (leaf.has(current)) return current
    const group = groups.find((g) => g.name === current)
    const yamlNow = typeof group?.now === 'string' ? group.now : ''
    const next = (await liveNow(current)) || yamlNow || groupMembers(group)[0]
    if (!next || next === current || isPassthroughOutbound(next)) return undefined
    current = next
  }
  return undefined
}

// AI presets never fall through to another country or DIRECT. If the chosen country
// is down, those domains are REJECT so the account IP does not jump.
async function ensureAiRejectGroups(
  template: MihomoConfig,
  keys: string[],
  defaultGroup: string
): Promise<Map<string, string>> {
  const known = knownOutboundNames(template)
  const leaf = new Set(((template.proxies as Array<{ name: string }>) || []).map((p) => p.name))
  const groups = proxyGroups(template)
  const existing = new Set(groups.map((g) => String(g.name ?? '')))
  const targets = new Map<string, string>()

  for (const key of keys) {
    const requested = key || defaultGroup
    const anchor = await resolveAiAnchor(template, requested, leaf)
    // Never put → VelumVPN / url-test / DIRECT first: that hops country or leaks. No leaf → block.
    if (!anchor || !leaf.has(anchor)) {
      targets.set(key, 'REJECT')
      continue
    }
    const chain = [...sameCountryProxyNames(template, anchor).filter((n) => known.has(n)), 'REJECT']
    const unique = [...new Set(chain)]
    if (unique.length === 1 && unique[0] === 'REJECT') {
      targets.set(key, 'REJECT')
      continue
    }
    const groupName = aiRejectGroupName(anchor)
    targets.set(key, groupName)
    if (existing.has(groupName)) continue
    groups.push({
      name: groupName,
      type: 'fallback',
      url: 'https://www.gstatic.com/generate_204',
      interval: 30,
      timeout: 5000,
      lazy: false,
      'max-failed-times': 2,
      proxies: unique,
      hidden: true
    })
    existing.add(groupName)
  }

  template['proxy-groups'] = groups as unknown as []
  return targets
}

function ensureRuleFallbackGroups(template: MihomoConfig, proxyNames: string[], fallback: string): Map<string, string> {
  const known = knownOutboundNames(template)
  const groups = ((template['proxy-groups'] as Array<Record<string, unknown>>) || []).slice()
  const existing = new Set(groups.map((g) => String(g.name ?? '')))
  const targets = new Map<string, string>()

  for (const proxy of proxyNames) {
    if (!proxy || proxy === fallback || !known.has(proxy)) continue
    const groupName = ruleFallbackGroupName(proxy)
    targets.set(proxy, groupName)
    if (existing.has(groupName)) continue
    groups.push({
      name: groupName,
      type: 'fallback',
      url: 'https://www.gstatic.com/generate_204',
      interval: 30,
      timeout: 5000,
      lazy: false,
      'max-failed-times': 2,
      proxies: [proxy, fallback],
      // Purely an internal routing detail for the per-rule server pin - the app already excludes
      // hidden groups from the home selector and the Proxies page (see mihomoGroups()), so this
      // keeps it out of both instead of leaking into the UI as a confusing "Germany: Fallback" row.
      hidden: true
    })
    existing.add(groupName)
  }

  template['proxy-groups'] = groups as unknown as []
  return targets
}

function torrentRuleEntries(): string[] {
  const target = 'DIRECT'
  // Trackers are matched by the BitTorrent sniffer (DOMAIN,bittorrent.invalid),
  // not GEOSITE lists — those names are absent from runetfreedom geosite.dat.
  return [
    `DOMAIN,${TORRENT_SNIFF_HOST},${target}`,
    `PROCESS-NAME-REGEX,(?i).*torrent.*,${target}`,
    ...TORRENT_PROCESSES.map((p) => `PROCESS-NAME,${p},${target}`),
    `DST-PORT,6881-6889,${target}`,
    `DST-PORT,51413,${target}`
  ]
}

function stripBundledTorrentProcessRules(rules: string[]): string[] {
  const names = new Set(TORRENT_PROCESSES.map((p) => p.toLowerCase()))
  return rules.filter((r) => {
    if (r.toLowerCase().startsWith(`domain,${TORRENT_SNIFF_HOST},`)) return false
    if (/^PROCESS-NAME-REGEX,\(\?i\)\.\*torrent\.\*,/i.test(r)) return false
    // Leftovers from an earlier beta that injected runetfreedom-missing tracker lists.
    if (/^GEOSITE,category-(?:public-tracker|private-tracker|pt),/i.test(r)) return false
    const m = /^PROCESS-NAME,([^,]+),/i.exec(r)
    return !m || !names.has(m[1].toLowerCase())
  })
}

function geminiLockSuffixes(ai: AiPresets): string[] {
  const fromCatalog = ai.presets.find((p) => p.id === 'google-gemini')?.domains ?? []
  return fromCatalog.length > 0 ? fromCatalog : GEMINI_VPN_SUFFIXES
}

function geminiVpnRuleEntries(target: string, suffixes: string[]): string[] {
  return suffixes.map((d) => `DOMAIN-SUFFIX,${d},${target}`)
}

function stripBundledGeminiRules(rules: string[], suffixes: string[]): string[] {
  const extra = new Set(suffixes.map((d) => d.toLowerCase()))
  return rules.filter((r) => {
    const m = /^DOMAIN-SUFFIX,([^,]+),/i.exec(r)
    if (!m) return true
    const host = m[1].toLowerCase()
    if (extra.has(host)) return false
    if (host === 'clients6.google.com' || host.endsWith('.clients6.google.com')) return false
    return true
  })
}

function coreHasBittorrentSniffer(core: string): boolean {
  try {
    const out = execFileSync(mihomoCorePath(core), ['-v'], {
      encoding: 'utf8',
      timeout: 5000
    })
    return out.includes('velum-bt')
  } catch {
    return false
  }
}

async function ensureBittorrentSniffer(profile: MihomoConfig): Promise<void> {
  if (!profile.sniffer?.enable) return
  const { core = 'mihomo' } = await getAppConfig()
  if (!coreHasBittorrentSniffer(core)) return
  const sniff = (profile.sniffer.sniff ??= {}) as NonNullable<MihomoSnifferConfig['sniff']>
  sniff.BITTORRENT = {
    ports: ['1-65535'],
    'override-destination': false
  }
}

function enabledAiPresets(ai: AiPresets): AiPresets['presets'] {
  return ai.presets.filter((p) => p.enabled && p.domains.length > 0)
}

function aiRejectOnlyEntries(ai: AiPresets): string[] {
  const entries: string[] = []
  const seen = new Set<string>()
  for (const preset of enabledAiPresets(ai)) {
    for (const host of preset.domains) {
      const key = host.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(`DOMAIN-SUFFIX,${host},REJECT`)
    }
  }
  return entries
}

function forceMatchDirect(profile: MihomoConfig): void {
  if (!Array.isArray(profile.rules)) return
  profile.rules = (profile.rules as unknown as string[]).map((rule) =>
    rule.startsWith('MATCH,') ? 'MATCH,DIRECT' : rule
  ) as unknown as []
}

async function injectAiPresetRules(
  template: MihomoConfig,
  ai: AiPresets,
  defaultGroup: string,
  extraKeys: string[] = []
): Promise<{ entries: string[]; targets: Map<string, string> }> {
  const enabled = enabledAiPresets(ai)
  const pinned = enabled.map((p) => p.proxy?.trim()).filter((name): name is string => Boolean(name))
  const keys = [...new Set([...pinned, ...extraKeys])]
  const targets =
    keys.length > 0 ? await ensureAiRejectGroups(template, keys, defaultGroup) : new Map<string, string>()
  const entries: string[] = []
  const seen = new Set<string>()
  for (const preset of enabled) {
    const pin = preset.proxy?.trim()
    // No pin: follow the app selector (country may change). Pin: that country, then REJECT.
    const target = pin ? (targets.get(pin) ?? 'REJECT') : defaultGroup
    for (const host of preset.domains) {
      const key = host.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(`DOMAIN-SUFFIX,${host},${target}`)
    }
  }
  return { entries, targets }
}

async function injectCustomRules(
  template: MihomoConfig,
  rules: CustomRules,
  routeMode: string,
  ai: AiPresets,
  protectionOn: boolean
): Promise<void> {
  if (!Array.isArray(template.rules)) return
  const fallbackGroup =
    (template['proxy-groups'] as Array<{ name: string }>)?.[0]?.name || '→ VelumVPN'
  const pinned = [
    ...rules.domains,
    ...rules.processes,
    ...(rules.ips ?? [])
  ]
    .map((item) => item.proxy?.trim())
    .filter((name): name is string => Boolean(name))
  const fallbackTargets = ensureRuleFallbackGroups(template, pinned, fallbackGroup)

  const vpnTarget = (item: CustomRuleItem): string => {
    const proxy = item.proxy?.trim()
    if (!proxy) return fallbackGroup
    return fallbackTargets.get(proxy) ?? fallbackGroup
  }

  // Domain rules outrank process rules (a VPN domain must win over "this app goes direct").
  // Torrent DIRECT sits above user process/IP VPN pins so swarm traffic does not follow a node.
  const domainEntries = [
    ...rules.domains.map((d) => `DOMAIN-SUFFIX,${d.value},${vpnTarget(d)}`),
    ...(rules.excluded ?? []).map((d) => `DOMAIN-SUFFIX,${d.value},DIRECT`)
  ]
  const torrentEntries = torrentRuleEntries()
  const googleAiOn = ai.presets.some((p) => p.id === 'google-gemini' && p.enabled)
  const geminiNeedsLock = protectionOn && !googleAiOn && routeMode === 'blocked'
  const geminiHosts = geminiLockSuffixes(ai)
  let aiEntries: string[] = []
  let geminiEntries: string[] = []
  if (!protectionOn) {
    // App is open but the user turned protection off: keep capturing via TUN and REJECT
    // enabled AI presets so the account cannot fall back to the real IP.
    aiEntries = aiRejectOnlyEntries(ai)
  } else {
    const injected = await injectAiPresetRules(
      template,
      ai,
      fallbackGroup,
      geminiNeedsLock ? [''] : []
    )
    aiEntries = injected.entries
    geminiEntries = geminiNeedsLock
      ? geminiVpnRuleEntries(injected.targets.get('') ?? 'REJECT', geminiHosts)
      : []
  }
  const processEntries = [
    ...rules.processes.map((p) => `PROCESS-NAME,${p.value},${vpnTarget(p)}`),
    ...(rules.excludedProcesses ?? []).map((p) => `PROCESS-NAME,${p.value},DIRECT`)
  ]
  const ipEntries = [
    ...(rules.ips ?? []).map((ip) => ipCidrRule(ip.value, vpnTarget(ip))),
    ...(rules.excludedIPs ?? []).map((ip) => ipCidrRule(ip.value, 'DIRECT'))
  ]
  const rest = stripBundledGeminiRules(
    stripBundledTorrentProcessRules(template.rules as unknown as string[]),
    geminiHosts
  )
  template.rules = [
    ...domainEntries,
    ...aiEntries,
    ...torrentEntries,
    ...geminiEntries,
    ...processEntries,
    ...ipEntries,
    ...rest
  ] as unknown as []
}

// 辅助函数：处理带偏移量的规则
function processRulesWithOffset(ruleStrings: string[], currentRules: string[], isAppend = false) {
  const normalRules: string[] = []
  const rules = [...currentRules]

  ruleStrings.forEach((ruleStr) => {
    const parts = ruleStr.split(',')
    const firstPartIsNumber =
      !isNaN(Number(parts[0])) && parts[0].trim() !== '' && parts.length >= 3

    if (firstPartIsNumber) {
      const offset = parseInt(parts[0])
      const rule = parts.slice(1).join(',')

      if (isAppend) {
        const insertPosition = Math.max(0, rules.length - Math.min(offset, rules.length))
        rules.splice(insertPosition, 0, rule)
      } else {
        const insertPosition = Math.min(offset, rules.length)
        rules.splice(insertPosition, 0, rule)
      }
    } else {
      normalRules.push(ruleStr)
    }
  })

  return { normalRules, insertRules: rules }
}

export async function generateProfile(): Promise<void> {
  const { current } = await getProfileConfig()
  const appConfig = await getAppConfig()
  const {
    diffWorkDir = false,
    controlDns = true,
    controlSniff = true,
    controlTun = false,
    routeMode = 'all-except-ru'
  } = appConfig
  const proxyModeEnabled = appConfig.proxyMode ?? false
  const currentProfile = await getProfile(current)
  rawProfileStr = await getProfileStr(current)
  currentProfileStr = stringifyYaml(currentProfile)
  const controledMihomoConfig = await getControledMihomoConfig()

  const template = await loadRouteTemplate(routeMode)

  if (template) {
    await generateFromTemplate(
      template,
      currentProfile,
      controledMihomoConfig,
      controlTun,
      proxyModeEnabled,
      routeMode,
      diffWorkDir,
      current
    )
    return
  }

  // Fallback: legacy profile-based generation
  const configToMerge = JSON.parse(JSON.stringify(controledMihomoConfig))
  if (!controlDns && currentProfile.dns) {
    delete configToMerge.dns
    delete configToMerge.hosts
  }
  if (!controlSniff && currentProfile.sniffer) {
    delete configToMerge.sniffer
  }
  if (!controlTun && currentProfile.tun) {
    currentProfile.tun.enable = controledMihomoConfig.tun?.enable ?? false
    delete configToMerge.tun
  }

  const ruleFilePath = rulePath(current || 'default')
  if (existsSync(ruleFilePath)) {
    const ruleFileContent = await readFile(ruleFilePath, 'utf-8')
    const ruleData = parseYaml(ruleFileContent) as {
      prepend?: string[]
      append?: string[]
      delete?: string[]
    } | null

    if (ruleData && typeof ruleData === 'object') {
      if (!currentProfile.rules) {
        currentProfile.rules = [] as unknown as []
      }

      let rules = [...currentProfile.rules] as unknown as string[]

      if (ruleData.prepend?.length) {
        const { normalRules: prependRules, insertRules } = processRulesWithOffset(
          ruleData.prepend,
          rules
        )
        rules = [...prependRules, ...insertRules]
      }

      if (ruleData.append?.length) {
        const { normalRules: appendRules, insertRules } = processRulesWithOffset(
          ruleData.append,
          rules,
          true
        )
        rules = [...insertRules, ...appendRules]
      }

      if (ruleData.delete?.length) {
        const deleteSet = new Set(ruleData.delete)
        rules = rules.filter((rule) => {
          const ruleStr = Array.isArray(rule) ? rule.join(',') : rule
          return !deleteSet.has(ruleStr)
        })
      }

      currentProfile.rules = rules as unknown as []
    }
  }

  const profile = deepMerge(JSON.parse(JSON.stringify(currentProfile)), configToMerge)

  const proxyGroup =
    (profile['proxy-groups'] as Array<{ name: string }>)?.[0]?.name || '→ VelumVPN'
  await applyRouteMode(profile, routeMode, proxyGroup)
  await ensureBittorrentSniffer(profile)

  const tunEnabled = profile.tun?.enable ?? false
  if (!tunEnabled && !proxyModeEnabled) {
    profile.port = 0
    profile['socks-port'] = 0
    profile['redir-port'] = 0
    profile['tproxy-port'] = 0
    profile['mixed-port'] = 0
  }

  await cleanProfile(profile, controlDns, controlSniff, controlTun)

  runtimeConfig = profile
  runtimeConfigStr = stringifyYaml(profile)
  if (diffWorkDir) {
    await prepareProfileWorkDir(current)
  }
  await writeFile(
    diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work'),
    runtimeConfigStr
  )
}

async function generateFromTemplate(
  template: MihomoConfig,
  userProfile: MihomoConfig,
  controledMihomoConfig: Partial<MihomoConfig>,
  controlTun: boolean,
  proxyModeEnabled: boolean,
  routeMode: string,
  diffWorkDir: boolean,
  current: string | undefined
): Promise<void> {
  const geoReady = await ensureRunetfreedomGeodata()

  const proxies = (userProfile.proxies as Array<{ name: string }>) || []
  injectProxiesIntoTemplate(template, proxies)

  if (!geoReady && Array.isArray(template.rules)) {
    // Geo files unavailable — fall back to routing all traffic through VPN
    const proxyGroupName =
      (template['proxy-groups'] as Array<{ name: string }>)?.[0]?.name || '→ VelumVPN'
    const rules = template.rules as unknown as string[]
    template.rules = [
      ...rules.filter(
        (r) => !r.startsWith('GEOSITE,') && !r.startsWith('GEOIP,') && !r.startsWith('MATCH,')
      ),
      `MATCH,${proxyGroupName}`
    ] as unknown as []
  }

  const customRules = await getCustomRules()
  const aiPresets = await getAiPresets()
  const userWantsVpn = (controledMihomoConfig.tun?.enable ?? false) || proxyModeEnabled
  await injectCustomRules(template, customRules, routeMode, aiPresets, userWantsVpn)
  const aiKillSwitch = enabledAiPresets(aiPresets).length > 0
  if (!userWantsVpn && aiKillSwitch) {
    forceMatchDirect(template)
  }
  await ensureBittorrentSniffer(template)

  // Google/Cloudflare DoH/DoT is blocked in RU; node hostnames must resolve
  // via system or Yandex DNS or every domain lookup fails (couldn't find ip).
  ensureDirectNodeDns(template)

  // Apply TUN enable state and platform-specific settings from controlled config
  if (template.tun) {
    template.tun.enable = (controledMihomoConfig.tun?.enable ?? false) || aiKillSwitch
    if (process.platform === 'linux' || process.platform === 'darwin') {
      // macOS rejects a TUN device that is not utunN. gvisor does not need one;
      // the Windows "mixed" stack and the name "velumvpn" fail to come up there.
      template.tun.stack = 'gvisor'
      if (process.platform === 'darwin') {
        delete template.tun.device
      }
      if (!template.tun['inet4-address']) {
        template.tun['inet4-address'] = ['198.18.0.1/16']
      }
    } else {
      template.tun.stack = 'mixed'
    }
  }

  // Apply port and controller settings from controlled config
  const overrideKeys = [
    'mixed-port',
    'port',
    'socks-port',
    'redir-port',
    'tproxy-port',
    'external-controller',
    'external-ui',
    'external-ui-url',
    'external-controller-cors',
    'secret',
    'bind-address',
    'interface-name'
  ] as const

  for (const key of overrideKeys) {
    const val = controledMihomoConfig[key]
    if (val !== undefined) {
      ;(template as Record<string, unknown>)[key] = val
    }
  }

  const tunEnabled = template.tun?.enable ?? false

  if (!tunEnabled && !proxyModeEnabled) {
    template.port = 0
    template['socks-port'] = 0
    template['redir-port'] = 0
    template['tproxy-port'] = 0
    template['mixed-port'] = controledMihomoConfig['mixed-port'] ?? FLAVOR.mixedPort
  }

  // Clean zero-value ports
  ;(['port', 'socks-port', 'redir-port', 'tproxy-port'] as const).forEach((key) => {
    if (template[key] === 0) delete (template as Partial<MihomoConfig>)[key]
  })

  if (!tunEnabled) {
    delete (template as Partial<MihomoConfig>).tun
  }

  runtimeConfig = template
  runtimeConfigStr = stringifyYaml(template)

  if (diffWorkDir) {
    await prepareProfileWorkDir(current)
  }
  await writeFile(
    diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work'),
    runtimeConfigStr
  )
}

async function cleanProfile(
  profile: MihomoConfig,
  controlDns: boolean,
  controlSniff: boolean,
  controlTun: boolean
): Promise<void> {
  if (!['info', 'debug'].includes(profile['log-level'])) {
    profile['log-level'] = 'info'
  }

  configureLanSettings(profile)
  cleanBooleanConfigs(profile)
  cleanNumberConfigs(profile)
  cleanStringConfigs(profile)
  cleanAuthenticationConfig(profile)
  cleanTunConfig(profile, controlTun)
  cleanDnsConfig(profile, controlDns)
  cleanSnifferConfig(profile, controlSniff)
  cleanProxyConfigs(profile)
}

function cleanBooleanConfigs(profile: MihomoConfig): void {
  if (profile.ipv6) {
    delete (profile as Partial<MihomoConfig>).ipv6
  }

  const booleanConfigs = [
    'unified-delay',
    'tcp-concurrent',
    'geodata-mode',
    'geo-auto-update',
    'disable-keep-alive'
  ]

  booleanConfigs.forEach((key) => {
    if (!profile[key]) delete (profile as Partial<MihomoConfig>)[key]
  })

  if (!profile.profile) return

  const { 'store-selected': hasStoreSelected, 'store-fake-ip': hasStoreFakeIp } = profile.profile

  if (!hasStoreSelected && !hasStoreFakeIp) {
    delete (profile as Partial<MihomoConfig>).profile
  } else {
    const profileConfig = profile.profile as MihomoProfileConfig
    if (!hasStoreSelected) delete profileConfig['store-selected']
    if (!hasStoreFakeIp) delete profileConfig['store-fake-ip']
  }
}

function cleanNumberConfigs(profile: MihomoConfig): void {
  ;[
    'port',
    'socks-port',
    'redir-port',
    'tproxy-port',
    'mixed-port',
    'keep-alive-idle',
    'keep-alive-interval'
  ].forEach((key) => {
    if (profile[key] === 0) delete (profile as Partial<MihomoConfig>)[key]
  })
}

function cleanStringConfigs(profile: MihomoConfig): void {
  const partialProfile = profile as Partial<MihomoConfig>

  if (profile.mode === 'rule') delete partialProfile.mode

  const emptyStringConfigs = ['interface-name', 'secret', 'global-client-fingerprint']
  emptyStringConfigs.forEach((key) => {
    if (profile[key] === '') delete partialProfile[key]
  })

  if (profile['external-controller'] === '') {
    delete partialProfile['external-controller']
    delete partialProfile['external-ui']
    delete partialProfile['external-ui-url']
    delete partialProfile['external-controller-cors']
  } else if (profile['external-ui'] === '') {
    delete partialProfile['external-ui']
    delete partialProfile['external-ui-url']
  }
}

function configureLanSettings(profile: MihomoConfig): void {
  const partialProfile = profile as Partial<MihomoConfig>

  if (!profile['allow-lan']) {
    delete partialProfile['lan-allowed-ips']
    delete partialProfile['lan-disallowed-ips']
    return
  }

  if (!profile['allow-lan']) {
    delete partialProfile['allow-lan']
    delete partialProfile['lan-allowed-ips']
    delete partialProfile['lan-disallowed-ips']
    return
  }

  const allowedIps = profile['lan-allowed-ips']
  if (allowedIps?.length === 0) {
    delete partialProfile['lan-allowed-ips']
  } else if (allowedIps && !allowedIps.some((ip: string) => ip.startsWith('127.0.0.1/'))) {
    allowedIps.push('127.0.0.1/8')
  }

  if (profile['lan-disallowed-ips']?.length === 0) {
    delete partialProfile['lan-disallowed-ips']
  }
}

function cleanAuthenticationConfig(profile: MihomoConfig): void {
  if (profile.authentication?.length === 0) {
    const partialProfile = profile as Partial<MihomoConfig>
    delete partialProfile.authentication
    delete partialProfile['skip-auth-prefixes']
  }
}

function cleanTunConfig(profile: MihomoConfig, controlTun: boolean): void {
  if (!controlTun) return
  if (!profile.tun?.enable) {
    delete (profile as Partial<MihomoConfig>).tun
    return
  }

  const tunConfig = profile.tun as MihomoTunConfig

  if (tunConfig['auto-route'] !== false) {
    delete tunConfig['auto-route']
  }
  if (tunConfig['auto-detect-interface'] !== false) {
    delete tunConfig['auto-detect-interface']
  }

  const tunBooleanConfigs = ['auto-redirect', 'strict-route', 'disable-icmp-forwarding']
  tunBooleanConfigs.forEach((key) => {
    if (!tunConfig[key]) delete tunConfig[key]
  })

  if (tunConfig.device === 'velumvpn') {
    // shipped default from the templates; map it to this flavor's adapter name
    tunConfig.device = FLAVOR.tunDevice
  }

  if (tunConfig.device === '') {
    delete tunConfig.device
  } else if (
    process.platform === 'darwin' &&
    tunConfig.device &&
    !tunConfig.device.startsWith('utun')
  ) {
    delete tunConfig.device
  }

  if (tunConfig['dns-hijack']?.length === 0) delete tunConfig['dns-hijack']
  if (tunConfig['route-exclude-address']?.length === 0) delete tunConfig['route-exclude-address']
}

function cleanDnsConfig(profile: MihomoConfig, controlDns: boolean): void {
  if (!controlDns) return
  if (!profile.dns?.enable) {
    delete (profile as Partial<MihomoConfig>).dns
    return
  }

  const dnsConfig = profile.dns as MihomoDNSConfig
  const dnsArrayConfigs = [
    'fake-ip-range',
    'fake-ip-range6',
    'fake-ip-filter',
    'proxy-server-nameserver',
    'direct-nameserver',
    'nameserver'
  ]

  dnsArrayConfigs.forEach((key) => {
    if (dnsConfig[key]?.length === 0) delete dnsConfig[key]
  })

  if (dnsConfig['respect-rules'] === false || dnsConfig['proxy-server-nameserver']?.length === 0) {
    delete dnsConfig['respect-rules']
  }

  if (dnsConfig['nameserver-policy'] && Object.keys(dnsConfig['nameserver-policy']).length === 0) {
    delete dnsConfig['nameserver-policy']
  }

  delete dnsConfig.fallback
  delete dnsConfig['fallback-filter']
}

function cleanSnifferConfig(profile: MihomoConfig, controlSniff: boolean): void {
  if (!controlSniff) return
  if (!profile.sniffer?.enable) {
    delete (profile as Partial<MihomoConfig>).sniffer
  }
}

function cleanProxyConfigs(profile: MihomoConfig): void {
  const partialProfile = profile as Partial<MihomoConfig>
  const arrayConfigs = ['proxies', 'proxy-groups', 'rules']
  const objectConfigs = ['proxy-providers', 'rule-providers']

  arrayConfigs.forEach((key) => {
    if (Array.isArray(profile[key]) && profile[key]?.length === 0) {
      delete partialProfile[key]
    }
  })

  objectConfigs.forEach((key) => {
    const value = profile[key]
    if (
      value === null ||
      value === undefined ||
      (value && typeof value === 'object' && Object.keys(value).length === 0)
    ) {
      delete partialProfile[key]
    }
  })
}

async function prepareProfileWorkDir(current: string | undefined): Promise<void> {
  if (!existsSync(mihomoProfileWorkDir(current))) {
    await mkdir(mihomoProfileWorkDir(current), { recursive: true })
  }
  const copy = async (file: string): Promise<void> => {
    const targetPath = path.join(mihomoProfileWorkDir(current), file)
    const sourcePath = path.join(mihomoWorkDir(), file)
    if (!existsSync(targetPath) && existsSync(sourcePath)) {
      await copyFile(sourcePath, targetPath)
    }
  }
  await Promise.all([
    copy('country.mmdb'),
    copy('geoip.metadb'),
    copy('geoip.dat'),
    copy('geosite.dat'),
    copy('ASN.mmdb')
  ])
}

export async function getRuntimeConfigStr(): Promise<string> {
  return runtimeConfigStr
}

export async function getRawProfileStr(): Promise<string> {
  return rawProfileStr
}

export async function getCurrentProfileStr(): Promise<string> {
  return currentProfileStr
}

export async function getRuntimeConfig(): Promise<MihomoConfig> {
  return runtimeConfig
}

export async function stripBittorrentSnifferIfPresent(): Promise<boolean> {
  const sniff = runtimeConfig?.sniffer?.sniff as Record<string, unknown> | undefined
  if (!sniff || !('BITTORRENT' in sniff)) return false
  delete sniff.BITTORRENT
  runtimeConfigStr = stringifyYaml(runtimeConfig)
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  await writeFile(
    diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work'),
    runtimeConfigStr
  )
  return true
}

export async function stripMissingGeositeRule(listName: string): Promise<boolean> {
  const name = listName.trim().toLowerCase()
  if (!name || !Array.isArray(runtimeConfig?.rules)) return false
  const before = runtimeConfig.rules.length
  runtimeConfig.rules = (runtimeConfig.rules as unknown as string[]).filter(
    (r) => !r.toLowerCase().startsWith(`geosite,${name},`)
  ) as unknown as []
  if (runtimeConfig.rules.length === before) return false
  runtimeConfigStr = stringifyYaml(runtimeConfig)
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  await writeFile(
    diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work'),
    runtimeConfigStr
  )
  return true
}

async function applyRouteMode(
  profile: MihomoConfig,
  routeMode: string,
  proxyGroup: string
): Promise<void> {
  const base = [
    'GEOIP,private,DIRECT,no-resolve',
    'GEOSITE,private,DIRECT',
    'GEOSITE,category-ads-all,REJECT'
  ]

  const torrentDirect = torrentRuleEntries()

  if (routeMode === 'blocked') {
    profile.rules = [
      ...base,
      ...torrentDirect,
      `AND,((NETWORK,UDP),(DST-PORT,50000-65535)),${proxyGroup}`,
      `GEOSITE,youtube,${proxyGroup}`,
      `GEOSITE,telegram,${proxyGroup}`,
      `GEOSITE,google,${proxyGroup}`,
      `GEOSITE,instagram,${proxyGroup}`,
      `GEOSITE,facebook,${proxyGroup}`,
      `GEOSITE,twitter,${proxyGroup}`,
      `GEOSITE,discord,${proxyGroup}`,
      'MATCH,DIRECT'
    ] as unknown as []
  } else if (routeMode === 'all-except-ru') {
    profile.rules = [
      ...base,
      ...torrentDirect,
      'GEOIP,ru,DIRECT',
      `MATCH,${proxyGroup}`
    ] as unknown as []
  } else if (routeMode === 'all') {
    profile.rules = [
      ...base,
      ...torrentDirect,
      `MATCH,${proxyGroup}`
    ] as unknown as []
  }

  const customRules = await getCustomRules()
  const aiPresets = await getAiPresets()
  const { proxyMode = false } = await getAppConfig()
  const protectionOn = (profile.tun?.enable ?? false) || proxyMode
  await injectCustomRules(profile, customRules, routeMode, aiPresets, protectionOn)
  if (!protectionOn && enabledAiPresets(aiPresets).length > 0) {
    forceMatchDirect(profile)
    if (profile.tun) profile.tun.enable = true
  }
}
