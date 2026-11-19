import { isIP } from 'node:net'

export interface ProfileRuleEdits {
  prepend?: string[]
  append?: string[]
  delete?: string[]
}

export interface ParsedIp {
  version: 4 | 6
  cidr: string
}

/** Accepts an IP, a CIDR, IPv4:port, or [IPv6]:port. Returns null for anything else. */
export function parseIpInput(raw: string): ParsedIp | null {
  let value = raw.trim()
  if (!value) return null

  const bracket = value.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (bracket) {
    value = bracket[1]
  } else {
    const v4port = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
    if (v4port) value = v4port[1]
  }

  const slash = value.indexOf('/')
  const addr = slash === -1 ? value : value.slice(0, slash)
  const maskText = slash === -1 ? undefined : value.slice(slash + 1)
  if (!addr || maskText === '') return null
  const version = isIP(addr)
  if (version !== 4 && version !== 6) return null
  if (maskText === undefined) {
    return { version, cidr: `${addr}/${version === 6 ? 128 : 32}` }
  }
  if (!/^\d+$/.test(maskText)) return null
  const mask = Number(maskText)
  const max = version === 6 ? 128 : 32
  if (mask < 0 || mask > max) return null
  return { version, cidr: `${addr}/${mask}` }
}

export function ipCidrRule(ip: string, target: string): string {
  const parsed = parseIpInput(ip)
  if (!parsed) {
    throw new Error(`Invalid IP or CIDR: ${ip}`)
  }
  const kind = parsed.version === 6 ? 'IP-CIDR6' : 'IP-CIDR'
  return `${kind},${parsed.cidr},${target},no-resolve`
}

function ruleText(rule: string): string {
  return Array.isArray(rule) ? (rule as string[]).join(',') : rule
}

function applyOffset(ruleStrings: string[] | undefined, current: string[], append: boolean): string[] {
  if (!ruleStrings?.length) return current
  const rules = [...current]
  const normal: string[] = []
  for (const ruleStr of ruleStrings) {
    const parts = ruleStr.split(',')
    const firstIsNumber = !isNaN(Number(parts[0])) && parts[0].trim() !== '' && parts.length >= 3
    if (!firstIsNumber) {
      normal.push(ruleStr)
      continue
    }
    const offset = parseInt(parts[0], 10)
    const rule = parts.slice(1).join(',')
    const insertAt = append
      ? Math.max(0, rules.length - Math.min(offset, rules.length))
      : Math.min(offset, rules.length)
    rules.splice(insertAt, 0, rule)
  }
  return append ? [...rules, ...normal] : [...normal, ...rules]
}

/**
 * VPN is off and an AI preset is holding TUN.
 * The whole rule list is the preset's REJECT lines plus MATCH,DIRECT.
 * Profile prepend, append and delete are not applied: an append must not
 * route traffic through a proxy, and a delete must not remove a block.
 */
export function rulesWhileVpnOff(aiRejects: string[]): string[] {
  return [...aiRejects, 'MATCH,DIRECT']
}

/**
 * Profile prepend/append/delete applied to an already built list.
 * `aiRejects` set means the VPN switch is off: the hold list replaces the result.
 * Nothing is inserted after the final MATCH while the switch is on.
 */
export function rulesAfterProfileEdits(
  built: string[],
  edits: ProfileRuleEdits,
  aiRejects: string[] | null
): string[] {
  if (aiRejects) return rulesWhileVpnOff(aiRejects)
  return applyProfileRuleEdits(built, edits)
}

/**
 * Profile prepend/append/delete applied to an already built list.
 * `protectCount` leading rules stay in front.
 * Nothing is inserted after the final MATCH.
 */
export function applyProfileRuleEdits(
  rules: string[],
  edits: ProfileRuleEdits,
  protectCount = 0
): string[] {
  const deleted = new Set(edits.delete ?? [])
  const kept = rules.filter((rule) => !deleted.has(ruleText(rule)))
  const headCount = Math.min(Math.max(protectCount, 0), kept.length)
  const head = kept.slice(0, headCount)
  let body = kept.slice(headCount)
  body = applyOffset(edits.prepend, body, false)
  const matchAt = body.findIndex((rule) => rule.startsWith('MATCH,'))
  if (edits.append?.length) {
    if (matchAt === -1) {
      body = applyOffset(edits.append, body, true)
    } else {
      const before = body.slice(0, matchAt)
      const after = body.slice(matchAt)
      body = [...applyOffset(edits.append, before, true), ...after]
    }
  }
  return [...head, ...body]
}

export interface ProxyProviderAttachResult {
  applied: string[]
  rejected: string[]
}

export const TUN_OVERLAY_KEYS = [
  'stack',
  'device',
  'auto-route',
  'auto-redirect',
  'auto-detect-interface',
  'dns-hijack',
  'route-exclude-address',
  'route-address',
  'strict-route',
  'disable-icmp-forwarding',
  'mtu',
  'inet4-address',
  'inet6-address',
  'gso',
  'gso-max-size',
  'udp-timeout',
  'endpoint-independent-nat'
] as const

export const DNS_OVERLAY_KEYS = [
  'enable',
  'listen',
  'ipv6',
  'enhanced-mode',
  'fake-ip-range',
  'fake-ip-range6',
  'fake-ip-filter',
  'use-hosts',
  'use-system-hosts',
  'respect-rules',
  'default-nameserver',
  'nameserver',
  'fallback',
  'proxy-server-nameserver',
  'direct-nameserver',
  'nameserver-policy'
] as const

/** Copies keys the user set, including false and empty lists. Undefined keys stay as they are. */
export function overlayFields(
  target: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
  keys: readonly string[]
): void {
  if (!source) return
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key]
  }
}

/**
 * Platform constraints applied after a user TUN overlay.
 * darwin: a device that is not utun* cannot come up, and only gvisor/system stacks work.
 * Returns warning codes the UI can explain. The coerced value is what gets written.
 */
export function constrainTun(tun: Record<string, unknown>, platform: string): string[] {
  const warnings: string[] = []
  if (platform === 'darwin') {
    const device = tun.device
    if (typeof device === 'string' && device !== '' && !device.startsWith('utun')) {
      delete tun.device
      warnings.push('darwin-device')
    }
    const stack = tun.stack
    if (typeof stack === 'string' && stack !== 'gvisor' && stack !== 'system') {
      tun.stack = 'gvisor'
      warnings.push('darwin-stack')
    }
  }
  if (!tun.stack) tun.stack = platform === 'win32' ? 'mixed' : 'gvisor'
  return warnings
}

export function usableProxyProvider(def: unknown): boolean {
  if (!def || typeof def !== 'object') return false
  const record = def as Record<string, unknown>
  const type = record.type
  if (type === 'file') return typeof record.path === 'string' && record.path.length > 0
  if (type === 'http' || type === 'inline') {
    return typeof record.url === 'string' || typeof record.path === 'string' || type === 'inline'
  }
  return false
}
