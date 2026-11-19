import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { readFile, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { getAiPresets } from '../config/aiPresets'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { mihomoConfig } from '../core/mihomoApi'
import { checkCorePermission } from '../core/manager'
import { serviceStatus } from '../service/manager'
import { execWithElevation, isRunningAsAdmin } from '../utils/elevation'

const execFilePromise = promisify(execFile)

const WIN_SERVICES: { id: string; required: boolean }[] = [
  { id: 'BFE', required: true },
  { id: 'MpsSvc', required: true },
  { id: 'nsi', required: true },
  { id: 'Dhcp', required: true },
  { id: 'Dnscache', required: true },
  { id: 'PlugPlay', required: false },
  { id: 'netman', required: false }
]

const PS_PROBE = `
$wanted = @(${WIN_SERVICES.map((s) => `'${s.id}'`).join(',')})
$services = @()
foreach ($id in $wanted) {
  try {
    $s = Get-Service -Name $id -ErrorAction Stop
    $services += @{ id = $id; status = [string]$s.Status; displayName = [string]$s.DisplayName }
  } catch {
    $status = if ($_.FullyQualifiedErrorId -like 'NoServiceFoundForGivenName,*') { 'missing' } else { 'unknown' }
    $services += @{ id = $id; status = $status; displayName = $id }
  }
}
$adapters = @()
$adaptersChecked = $false
try {
  $nics = @(Get-NetAdapter -ErrorAction Stop)
  $adaptersChecked = $true
} catch { $nics = @() }
if (-not $adaptersChecked) {
  try {
    $nics = @(Get-CimInstance Win32_NetworkAdapter -ErrorAction Stop | Where-Object { $_.NetConnectionID })
    $adaptersChecked = $true
  } catch { $nics = @() }
  foreach ($n in $nics) {
    $st = switch ([int]$n.NetConnectionStatus) {
      2 { 'Up' }
      7 { 'Disconnected' }
      default { 'Unknown' }
    }
    $adapters += @{
      name = [string]$n.NetConnectionID
      description = [string]$n.Name
      status = $st
      mac = [string]$n.MACAddress
    }
  }
} else {
  foreach ($n in $nics) {
    $adapters += @{
      name = [string]$n.Name
      description = [string]$n.InterfaceDescription
      status = [string]$n.Status
      mac = [string]$n.MacAddress
    }
  }
}
$json = @{ services = @($services); adapters = @($adapters); adaptersChecked = $adaptersChecked } | ConvertTo-Json -Compress -Depth 6
[System.IO.File]::WriteAllText('__OUT__', $json, [System.Text.UTF8Encoding]::new($false))
`

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function classifyAdapter(name: string, description: string): TunHealthAdapter['kind'] {
  const t = `${name} ${description}`.toLowerCase()
  const ours = /mihomo|metacubex|clash|velum/.test(t)
  const wintun = /wintun/.test(t)
  if (ours || (wintun && !/wireguard|cloudflare|warp|tailscale/.test(t))) return 'tun'
  if (
    /radmin vpn|wireguard|cloudflare|warp|tap-windows|tap-win32|openvpn|nordlynx|tailscale|zerotier|hamachi|softether|anyconnect|vpnva|fortinet|outline|protonvpn|mullvad|tun2socks|ikev2|l2tp/.test(
      t
    )
  ) {
    return 'vpn'
  }
  return 'other'
}

function serviceRunning(status: string): boolean {
  return /^running$/i.test(status)
}

export async function startWindowsService(id: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Windows only')
  }
  const allowed = WIN_SERVICES.some((s) => s.id.toLowerCase() === id.toLowerCase())
  if (!allowed) {
    throw new Error(`Unknown service: ${id}`)
  }
  try {
    await execWithElevation('net.exe', ['start', id])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/already been started|уже запущ/i.test(message)) return
    throw error
  }
}

async function windowsProbe(): Promise<{
  services: TunHealthService[]
  adapters: TunHealthAdapter[]
  adaptersChecked: boolean
}> {
  const outFile = path.join(os.tmpdir(), `velum-health-${randomUUID()}.json`)
  const script = PS_PROBE.replace('__OUT__', outFile.replace(/'/g, "''"))
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  let parsed: {
    services?: Array<{ id: string; status: string; displayName: string }>
    adapters?: Array<{ name: string; description: string; status: string; mac?: string }>
    adaptersChecked?: boolean
  } = {}
  try {
    await execFilePromise(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 20000, windowsHide: true }
    )
    const raw = await readFile(outFile, 'utf8')
    parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim() || '{}')
  } finally {
    await rm(outFile, { force: true })
  }
  const required = new Map(WIN_SERVICES.map((s) => [s.id.toLowerCase(), s.required]))
  const services = asArray(parsed.services).map((s) => ({
    id: s.id,
    displayName: s.displayName || s.id,
    status: s.status || 'unknown',
    required: required.get(s.id.toLowerCase()) ?? false
  }))
  for (const spec of WIN_SERVICES) {
    if (!services.some((s) => s.id.toLowerCase() === spec.id.toLowerCase())) {
      services.push({
        id: spec.id,
        displayName: spec.id,
        status: 'unknown',
        required: spec.required
      })
    }
  }
  const adapters = asArray(parsed.adapters).map((a) => ({
    name: a.name || '',
    description: a.description || '',
    status: a.status || 'Unknown',
    mac: a.mac,
    kind: classifyAdapter(a.name || '', a.description || '')
  }))
  return { services, adapters, adaptersChecked: parsed.adaptersChecked === true }
}

function fallbackAdapters(): TunHealthAdapter[] {
  const nics = os.networkInterfaces()
  return Object.entries(nics).map(([name, addrs]) => {
    const live = (addrs ?? []).some((a) => !a.internal)
    return {
      name,
      description: (addrs ?? []).map((a) => a.address).join(', '),
      status: live ? 'Up' : 'Unknown',
      kind: classifyAdapter(name, '')
    }
  })
}

export async function getTunHealth(): Promise<TunHealthReport> {
  const [{ tun }, { proxyMode = false }, ai, helper] = await Promise.all([
    getControledMihomoConfig(),
    getAppConfig(),
    getAiPresets(),
    serviceStatus().catch(() => 'unknown' as const)
  ])
  const protectionOn = (tun?.enable ?? false) || proxyMode
  const aiKillSwitch = ai.presets.some((p) => p.enabled)
  const expectsTun = (tun?.enable ?? false) || aiKillSwitch
  let runtimeTun: boolean | null = null
  try {
    const live = await mihomoConfig()
    runtimeTun = Boolean(live.tun?.enable)
  } catch {
    runtimeTun = null
  }

  let admin = false
  try {
    admin = process.platform === 'win32' ? await isRunningAsAdmin() : true
  } catch {
    admin = false
  }

  let services: TunHealthService[] = []
  let adapters: TunHealthAdapter[] = []
  let adaptersChecked = false
  if (process.platform === 'win32') {
    try {
      const probed = await windowsProbe()
      services = probed.services
      adaptersChecked = probed.adaptersChecked
      adapters = adaptersChecked ? probed.adapters : fallbackAdapters()
    } catch {
      services = WIN_SERVICES.map((service) => ({
        ...service,
        displayName: service.id,
        status: 'unknown'
      }))
      adapters = fallbackAdapters()
    }
  } else {
    adapters = fallbackAdapters()
  }

  const checks: TunHealthCheck[] = []
  if (process.platform === 'win32') {
    checks.push({
      id: 'admin',
      level: admin ? 'ok' : expectsTun ? 'fail' : 'info',
      detail: admin ? 'yes' : expectsTun ? 'no' : 'not-needed'
    })
    if (services.some((svc) => svc.status === 'unknown')) {
      checks.push({ id: 'services-probe', level: 'warn' })
    }
    for (const svc of services) {
      const up = serviceRunning(svc.status)
      checks.push({
        id: `svc-${svc.id}`,
        level: up ? 'ok' : svc.status === 'unknown' ? 'info' : svc.required ? 'fail' : 'warn',
        detail: svc.status
      })
    }
  }

  checks.push({
    id: 'helper',
    level:
      helper === 'running'
        ? 'ok'
        : helper === 'not-installed'
          ? 'info'
          : helper === 'unknown'
            ? 'info'
            : 'warn',
    detail: helper
  })

  if (runtimeTun === null) {
    checks.push({ id: 'runtime-tun', level: 'warn', detail: 'offline' })
  } else if (runtimeTun && (!expectsTun || !protectionOn)) {
    checks.push({
      id: 'runtime-tun',
      level: aiKillSwitch ? 'info' : 'warn',
      detail: aiKillSwitch ? 'held' : 'unexpected'
    })
  } else if (!runtimeTun && expectsTun) {
    checks.push({ id: 'runtime-tun', level: 'fail', detail: 'missing' })
  } else {
    checks.push({
      id: 'runtime-tun',
      level: 'ok',
      detail: runtimeTun ? 'on' : 'off'
    })
  }

  if (aiKillSwitch) {
    checks.push({
      id: 'ai-tun',
      level: runtimeTun && protectionOn ? 'ok' : 'info',
      detail: !runtimeTun ? 'unverified' : protectionOn ? 'vpn' : 'reject'
    })
  }

  const tunAdapters = adapters.filter((a) => a.kind === 'tun')
  const tunUp = tunAdapters.some((a) => /^up$/i.test(a.status))
  if ((expectsTun || runtimeTun) && !tunUp && !adaptersChecked && process.platform === 'win32') {
    checks.push({ id: 'tun-adapter', level: 'warn', detail: 'unknown' })
  } else if (expectsTun || runtimeTun) {
    checks.push({
      id: 'tun-adapter',
      level: tunUp || process.platform !== 'win32' ? 'ok' : 'fail',
      detail: tunAdapters.map((a) => a.name).join(', ') || 'none'
    })
  } else if (tunUp) {
    checks.push({
      id: 'tun-adapter',
      level: aiKillSwitch ? 'info' : 'warn',
      detail: tunAdapters.map((a) => a.name).join(', ')
    })
  } else {
    checks.push({ id: 'tun-adapter', level: 'ok', detail: 'idle' })
  }

  const activeOtherVpns = adapters.filter((a) => a.kind === 'vpn' && /^up$/i.test(a.status))
  const adapterProbeFailed = process.platform === 'win32' && !adaptersChecked
  checks.push({
    id: 'competing-vpn',
    level: activeOtherVpns.length || adapterProbeFailed ? 'info' : 'ok',
    detail: activeOtherVpns.length
      ? activeOtherVpns.map((a) => a.name).join(', ')
      : adapterProbeFailed ? 'unknown' : 'none'
  })

  if (process.platform === 'linux') {
    const tunDev = existsSync('/dev/net/tun')
    checks.push({ id: 'tun-dev', level: tunDev ? 'ok' : 'fail', detail: '/dev/net/tun' })
    try {
      const perm = await checkCorePermission()
      checks.push({
        id: 'core-perm',
        level: perm.mihomo ? 'ok' : 'warn',
        detail: perm.mihomo ? 'suid' : 'none'
      })
    } catch {
      // ignore
    }
  }

  return {
    platform: process.platform,
    checkedAt: Date.now(),
    admin,
    helperService: helper,
    protectionOn,
    runtimeTun,
    aiKillSwitch,
    checks,
    adapters,
    services
  }
}
