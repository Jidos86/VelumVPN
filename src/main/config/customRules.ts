import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { dataDir } from '../utils/dirs'

export interface CustomRules {
  domains: string[]
  processes: string[]
  excluded: string[]
  excludedProcesses: string[]
}

function customRulesPath(): string {
  return path.join(dataDir(), 'custom-rules.json')
}

export async function getCustomRules(): Promise<CustomRules> {
  const p = customRulesPath()
  if (!existsSync(p)) return { domains: [], processes: [], excluded: [], excludedProcesses: [] }
  try {
    const data = await readFile(p, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
      processes: Array.isArray(parsed.processes) ? parsed.processes : [],
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [],
      excludedProcesses: Array.isArray(parsed.excludedProcesses) ? parsed.excludedProcesses : []
    }
  } catch {
    return { domains: [], processes: [], excluded: [], excludedProcesses: [] }
  }
}

export async function setCustomRules(rules: CustomRules): Promise<void> {
  await writeFile(customRulesPath(), JSON.stringify(rules, null, 2), 'utf-8')
}
