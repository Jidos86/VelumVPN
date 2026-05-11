import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { dataDir } from '../utils/dirs'

export interface CustomRules {
  domains: string[]
  processes: string[]
}

function customRulesPath(): string {
  return path.join(dataDir(), 'custom-rules.json')
}

export async function getCustomRules(): Promise<CustomRules> {
  const p = customRulesPath()
  if (!existsSync(p)) return { domains: [], processes: [] }
  try {
    const data = await readFile(p, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
      processes: Array.isArray(parsed.processes) ? parsed.processes : []
    }
  } catch {
    return { domains: [], processes: [] }
  }
}

export async function setCustomRules(rules: CustomRules): Promise<void> {
  await writeFile(customRulesPath(), JSON.stringify(rules, null, 2), 'utf-8')
}
