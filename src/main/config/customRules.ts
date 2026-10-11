import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { dataDir } from '../utils/dirs'

export interface CustomRuleItem {
  value: string
  // Optional node name. Empty = use the server currently selected in the app.
  proxy?: string
}

export interface CustomRules {
  domains: CustomRuleItem[]
  processes: CustomRuleItem[]
  excluded: CustomRuleItem[]
  excludedProcesses: CustomRuleItem[]
  ips: CustomRuleItem[]
  excludedIPs: CustomRuleItem[]
}

function customRulesPath(): string {
  return path.join(dataDir(), 'custom-rules.json')
}

export function parseRuleList(raw: unknown): CustomRuleItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CustomRuleItem[] = []
  for (const entry of raw) {
    let value = ''
    let proxy = ''
    if (typeof entry === 'string') {
      value = entry.trim()
    } else if (entry && typeof entry === 'object' && typeof (entry as CustomRuleItem).value === 'string') {
      value = (entry as CustomRuleItem).value.trim()
      const p = (entry as CustomRuleItem).proxy
      if (typeof p === 'string') proxy = p.trim()
    }
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(proxy ? { value, proxy } : { value })
  }
  return out
}

export function emptyCustomRules(): CustomRules {
  return { domains: [], processes: [], excluded: [], excludedProcesses: [], ips: [], excludedIPs: [] }
}

export async function getCustomRules(): Promise<CustomRules> {
  const p = customRulesPath()
  if (!existsSync(p)) return emptyCustomRules()
  try {
    const parsed = JSON.parse(await readFile(p, 'utf-8'))
    return {
      domains: parseRuleList(parsed.domains),
      processes: parseRuleList(parsed.processes),
      excluded: parseRuleList(parsed.excluded),
      excludedProcesses: parseRuleList(parsed.excludedProcesses),
      ips: parseRuleList(parsed.ips),
      excludedIPs: parseRuleList(parsed.excludedIPs)
    }
  } catch {
    return emptyCustomRules()
  }
}

export async function setCustomRules(rules: CustomRules): Promise<void> {
  const normalized: CustomRules = {
    domains: parseRuleList(rules.domains),
    processes: parseRuleList(rules.processes),
    excluded: parseRuleList(rules.excluded),
    excludedProcesses: parseRuleList(rules.excludedProcesses),
    ips: parseRuleList(rules.ips),
    excludedIPs: parseRuleList(rules.excludedIPs)
  }
  await writeFile(customRulesPath(), JSON.stringify(normalized, null, 2), 'utf-8')
}
