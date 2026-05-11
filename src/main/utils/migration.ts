import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { dataDir, logPath } from './dirs'
import { parseYaml } from './yaml'
import { addProfileItem } from '../config'

const OLD_APP_ID = 'io.github.koala-clash'
const MIGRATION_DONE_MARKER = '.migration-done'
const MIGRATION_FILE = '.migration-profiles.yaml'

interface OldPrfItem {
  uid?: string
  type?: string
  name?: string
  url?: string
  desc?: string
  file?: string
  updated?: number
  extra?: {
    upload?: number
    download?: number
    total?: number
    expire?: number
  }
}

interface OldProfiles {
  current?: string
  items?: OldPrfItem[]
}

function getOldConfigDir(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(app.getPath('appData'), OLD_APP_ID)
    case 'darwin':
      return path.join(app.getPath('home'), 'Library', 'Application Support', OLD_APP_ID)
    case 'linux':
      return path.join(
        process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share'),
        OLD_APP_ID
      )
    default:
      return ''
  }
}

function getMigrationMarkerPath(): string {
  return path.join(dataDir(), MIGRATION_DONE_MARKER)
}

function getMigrationFilePath(): string {
  return path.join(dataDir(), MIGRATION_FILE)
}

function parseOldProfiles(yamlContent: string): OldPrfItem[] {
  const parsed = parseYaml<OldProfiles>(yamlContent)
  if (!parsed?.items || !Array.isArray(parsed.items)) return []

  return parsed.items.filter(
    (item) => item.type === 'remote' && item.url && item.url.trim().length > 0
  )
}

async function log(message: string): Promise<void> {
  try {
    await writeFile(logPath(), `[Migration]: ${message}\n`, { flag: 'a' })
  } catch {
    // ignore
  }
}

export async function migrateFromOldApp(): Promise<void> {
  if (existsSync(getMigrationMarkerPath())) return

  let yamlContent: string | null = null

  // On Windows, NSIS installer may have placed a migration file
  if (process.platform === 'win32') {
    const migrationFile = getMigrationFilePath()
    if (existsSync(migrationFile)) {
      try {
        yamlContent = await readFile(migrationFile, 'utf-8')
        await log('Found NSIS migration file')
      } catch {
        await log('Failed to read NSIS migration file')
      }
    }
  }

  // Fallback / macOS / Linux: read from old config directory
  if (!yamlContent) {
    const oldDir = getOldConfigDir()
    if (!oldDir) {
      await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
      return
    }
    const oldProfilesPath = path.join(oldDir, 'profiles.yaml')
    if (existsSync(oldProfilesPath)) {
      try {
        yamlContent = await readFile(oldProfilesPath, 'utf-8')
        await log(`Found old profiles.yaml at ${oldProfilesPath}`)
      } catch {
        await log(`Failed to read old profiles.yaml at ${oldProfilesPath}`)
      }
    }
  }

  if (!yamlContent) {
    await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
    return
  }

  const remoteProfiles = parseOldProfiles(yamlContent)
  if (remoteProfiles.length === 0) {
    await log('No remote profiles found in old config')
    await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
    return
  }

  await log(`Found ${remoteProfiles.length} remote profile(s) to migrate`)

  let successCount = 0
  let failCount = 0

  for (const oldItem of remoteProfiles) {
    try {
      await addProfileItem({
        type: 'remote',
        url: oldItem.url,
        name: oldItem.name || 'Migrated Profile'
      })
      successCount++
      await log(`Migrated profile "${oldItem.name || oldItem.uid}" (${oldItem.url})`)
    } catch (e) {
      failCount++
      await log(
        `Failed to migrate profile "${oldItem.name || oldItem.uid}" (${oldItem.url}): ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  await log(`Migration complete: ${successCount} succeeded, ${failCount} failed`)
  await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
}
