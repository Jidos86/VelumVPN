import {
  getControledMihomoConfig,
  getProfileConfig,
  getProfile,
  getProfileStr,
  getAppConfig,
  getCustomRules
} from '../config'
import {
  mihomoProfileWorkDir,
  mihomoWorkConfigPath,
  mihomoWorkDir,
  mihomoTestDir,
  rulePath,
  templatesDir,
  userTemplatesDir
} from '../utils/dirs'
import { getBrand } from '../utils/brand'
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

function resolveGeoUrls(): { geositeUrl: string; geoipUrl: string } {
  const brand = getBrand()
  // Priority: AppConfig (user) > brand.json (reseller) > runetfreedom (default)
  // AppConfig is async so we read it lazily; here we use brand for sync access.
  // Caller should pass resolved values when available (see ensureRunetfreedomGeodata).
  return {
    geositeUrl: brand.geositeUrl || RUNETFREEDOM_URLS.geosite,
    geoipUrl: brand.geoipUrl || RUNETFREEDOM_URLS.geoip
  }
}

export async function forceUpdateGeodata(): Promise<void> {
  const { geositeUrl, geoipUrl } = await (async () => {
    try {
      const cfg = await getAppConfig()
      const brand = getBrand()
      return {
        geositeUrl: cfg.geositeUrl || brand.geositeUrl || RUNETFREEDOM_URLS.geosite,
        geoipUrl: cfg.geoipUrl || brand.geoipUrl || RUNETFREEDOM_URLS.geoip
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

    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      onDownloadProgress: (e) => {
        const fileProgress = e.total ? e.loaded / e.total : 0
        const overall = (i + fileProgress) / totalFiles
        mainWindow?.webContents.send('geodataProgress', {
          file: name,
          progress: Math.round(overall * 100),
          fileIndex: i,
          totalFiles
        })
      }
    })

    await writeFile(dest, Buffer.from(res.data))

    const testDest = path.join(mihomoTestDir(), name)
    await copyFile(dest, testDest)
  }

  mainWindow?.webContents.send('geodataProgress', { file: '', progress: 100, fileIndex: totalFiles, totalFiles })
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

async function ensureRunetfreedomGeodata(): Promise<void> {
  let geositeUrl = RUNETFREEDOM_URLS.geosite
  let geoipUrl = RUNETFREEDOM_URLS.geoip
  try {
    const cfg = await getAppConfig()
    const brand = getBrand()
    geositeUrl = cfg.geositeUrl || brand.geositeUrl || RUNETFREEDOM_URLS.geosite
    geoipUrl = cfg.geoipUrl || brand.geoipUrl || RUNETFREEDOM_URLS.geoip
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
    return
  }

  const totalFiles = toDownload.length
  mainWindow?.webContents.send('geodataProgress', {
    file: toDownload[0].name, progress: 0, fileIndex: 0, totalFiles, auto: true
  })

  for (let i = 0; i < toDownload.length; i++) {
    const { url, name } = toDownload[i]
    const dest = path.join(mihomoWorkDir(), name)
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      onDownloadProgress: (e) => {
        const fileProgress = e.total ? e.loaded / e.total : 0
        const overall = (i + fileProgress) / totalFiles
        mainWindow?.webContents.send('geodataProgress', {
          file: name,
          progress: Math.round(overall * 100),
          fileIndex: i,
          totalFiles,
          auto: true
        })
      }
    })
    await writeFile(dest, Buffer.from(res.data))
    await copyFile(dest, path.join(mihomoTestDir(), name))
  }

  mainWindow?.webContents.send('geodataProgress', {
    file: '', progress: 100, fileIndex: totalFiles, totalFiles, auto: true
  })

  await Promise.all(GEO_FILES.map((f) => syncGeoToTestDir(f.name)))
}

const ROUTE_MODE_TEMPLATES: Record<string, string> = {
  blocked: 'blocked-only.yaml',
  'all-except-ru': 'all-foreign.yaml',
  all: 'all-proxy.yaml'
}

async function loadRouteTemplate(routeMode: string): Promise<MihomoConfig | null> {
  const templateFile = ROUTE_MODE_TEMPLATES[routeMode]
  if (!templateFile) return null

  // User-edited template takes priority over bundled one
  const userPath = path.join(userTemplatesDir(), templateFile)
  const bundledPath = path.join(templatesDir(), templateFile)
  const templatePath = existsSync(userPath) ? userPath : bundledPath
  if (!existsSync(templatePath)) return null

  const content = await readFile(templatePath, 'utf-8')
  return parseYaml(content) as MihomoConfig
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
  const isV6 = clean.includes(':')
  return isV6 ? `IP-CIDR6,${clean}/128,${target},no-resolve` : `IP-CIDR,${clean}/32,${target},no-resolve`
}

function injectCustomRules(template: MihomoConfig, rules: { domains: string[]; processes: string[]; excluded: string[]; excludedProcesses: string[]; ips: string[]; excludedIPs: string[] }): void {
  if (!Array.isArray(template.rules)) return
  const rulesArr = template.rules as unknown as string[]

  // Исключения (DIRECT) — в самое начало, они должны перекрывать любые гео-правила
  const directEntries = [
    ...(rules.excluded ?? []).map((d) => `DOMAIN-SUFFIX,${d},DIRECT`),
    ...(rules.excludedProcesses ?? []).map((p) => `PROCESS-NAME,${p},DIRECT`),
    ...(rules.excludedIPs ?? []).map((ip) => ipCidrRule(ip, 'DIRECT'))
  ]
  if (directEntries.length > 0) {
    rulesArr.unshift(...directEntries)
  }

  // VPN-правила — перед MATCH, чтобы не потеряться в DIRECT-фолбэке
  const matchIndex = rulesArr.findIndex((r) => r.startsWith('MATCH,'))
  const insertAt = matchIndex >= 0 ? matchIndex : rulesArr.length
  const vpnEntries = [
    ...rules.domains.map((d) => `DOMAIN-SUFFIX,${d},→ VelumVPN`),
    ...rules.processes.map((p) => `PROCESS-NAME,${p},→ VelumVPN`),
    ...(rules.ips ?? []).map((ip) => ipCidrRule(ip, '→ VelumVPN'))
  ]
  if (vpnEntries.length > 0) {
    rulesArr.splice(insertAt, 0, ...vpnEntries)
  }
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
  applyRouteMode(profile, routeMode, proxyGroup)

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
  diffWorkDir: boolean,
  current: string | undefined
): Promise<void> {
  await ensureRunetfreedomGeodata()

  const proxies = (userProfile.proxies as Array<{ name: string }>) || []
  injectProxiesIntoTemplate(template, proxies)

  const customRules = await getCustomRules()
  injectCustomRules(template, customRules)

  // Apply TUN enable state from controlled config
  if (template.tun) {
    template.tun.enable = controledMihomoConfig.tun?.enable ?? false
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
    template['mixed-port'] = controledMihomoConfig['mixed-port'] ?? 7897
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

function applyRouteMode(
  profile: MihomoConfig,
  routeMode: string,
  proxyGroup: string
): void {
  const base = [
    'GEOIP,private,DIRECT,no-resolve',
    'GEOSITE,private,DIRECT',
    'GEOSITE,category-ads-all,REJECT'
  ]

  if (routeMode === 'blocked') {
    profile.rules = [
      ...base,
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
      'GEOIP,ru,DIRECT',
      `MATCH,${proxyGroup}`
    ] as unknown as []
  } else if (routeMode === 'all') {
    profile.rules = [
      ...base,
      `MATCH,${proxyGroup}`
    ] as unknown as []
  }
}
