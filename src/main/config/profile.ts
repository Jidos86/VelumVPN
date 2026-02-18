import { getControledMihomoConfig } from './controledMihomo'
import { mihomoProfileWorkDir, mihomoWorkDir, profileConfigPath, profilePath, rulePath } from '../utils/dirs'
import { addProfileUpdater, delProfileUpdater } from '../core/profileUpdater'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { restartCore } from '../core/manager'
import { getAppConfig } from './app'
import { existsSync } from 'fs'
import axios, { AxiosResponse } from 'axios'
import https from 'https'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { defaultProfile } from '../utils/template'
import { dirname, join } from 'path'
import { deepMerge } from '../utils/merge'
import { getUserAgent } from '../utils/userAgent'
import { getHWID, getDeviceOS, getOSVersion, getDeviceModel } from '../utils/deviceInfo'
import { t } from '../utils/i18n'

let profileConfig: ProfileConfig // profile.yaml

export async function getProfileConfig(force = false): Promise<ProfileConfig> {
  if (force || !profileConfig) {
    const data = await readFile(profileConfigPath(), 'utf-8')
    profileConfig = parseYaml(data) || { items: [] }
  }
  if (typeof profileConfig !== 'object') profileConfig = { items: [] }
  return profileConfig
}

export async function setProfileConfig(config: ProfileConfig): Promise<void> {
  profileConfig = config
  await writeFile(profileConfigPath(), stringifyYaml(config), 'utf-8')
}

export async function getProfileItem(id: string | undefined): Promise<ProfileItem | undefined> {
  const { items } = await getProfileConfig()
  if (!id || id === 'default') return { id: 'default', type: 'local', name: t('ui.blankSubscription') }
  return items.find((item) => item.id === id)
}

export async function changeCurrentProfile(id: string): Promise<void> {
  const config = await getProfileConfig()
  const current = config.current
  config.current = id
  await setProfileConfig(config)
  try {
    await restartCore()
  } catch (e) {
    config.current = current
    throw e
  } finally {
    await setProfileConfig(config)
  }
}

export async function updateProfileItem(item: ProfileItem): Promise<void> {
  const config = await getProfileConfig()
  const index = config.items.findIndex((i) => i.id === item.id)
  if (index === -1) {
    throw new Error('Profile not found')
  }
  config.items[index] = item
  if (!item.autoUpdate) await delProfileUpdater(item.id)
  await setProfileConfig(config)
}

export async function addProfileItem(item: Partial<ProfileItem>): Promise<void> {
  const newItem = await createProfile(item)
  const config = await getProfileConfig()
  const isExisting = !!(await getProfileItem(newItem.id))
  if (isExisting) {
    await updateProfileItem(newItem)
  } else {
    config.items.push(newItem)
    await setProfileConfig(config)
  }

  if (!isExisting || !config.current) {
    await changeCurrentProfile(newItem.id)
  }
  await addProfileUpdater(newItem)
}

export async function removeProfileItem(id: string): Promise<void> {
  const config = await getProfileConfig()
  config.items = config.items?.filter((item) => item.id !== id)
  let shouldRestart = false
  if (config.current === id) {
    shouldRestart = true
    if (config.items.length > 0) {
      config.current = config.items[0].id
    } else {
      config.current = undefined
    }
  }
  await setProfileConfig(config)
  if (existsSync(profilePath(id))) {
    await rm(profilePath(id))
  }
  if (shouldRestart) {
    await restartCore()
  }
  if (existsSync(mihomoProfileWorkDir(id))) {
    await rm(mihomoProfileWorkDir(id), { recursive: true })
  }
  await delProfileUpdater(id)
}

export async function getCurrentProfileItem(): Promise<ProfileItem> {
  const { current } = await getProfileConfig()
  return (await getProfileItem(current)) || { id: 'default', type: 'local', name: t('ui.blankSubscription') }
}

export async function createProfile(item: Partial<ProfileItem>): Promise<ProfileItem> {
  const id = item.id || new Date().getTime().toString(16)
  const newItem = {
    id,
    name: item.name || (item.type === 'remote' ? 'Remote File' : 'Local File'),
    type: item.type,
    url: item.url,
    ua: item.ua,
    verify: item.verify ?? true,
    autoUpdate: item.autoUpdate ?? true,
    interval: item.interval || 0,
    useProxy: item.useProxy || false,
    updated: new Date().getTime()
  } as ProfileItem
  switch (newItem.type) {
    case 'remote': {
      const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
      if (!item.url) throw new Error('Empty URL')
      let res: AxiosResponse
      try {
        const httpsAgent = new https.Agent()

        res = await axios.get(item.url, {
          httpsAgent,
          ...(newItem.useProxy &&
            mixedPort && {
              proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort }
            }),
          headers: {
            'User-Agent': newItem.ua || (await getUserAgent()),
            'x-hwid': getHWID(),
            'x-device-os': getDeviceOS(),
            'x-ver-os': getOSVersion(),
            'x-device-model': getDeviceModel()
          },
          responseType: 'text'
        })
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
            throw new Error(`${t('error.networkResetOrTimeout')}：${item.url}`)
          } else if (error.code === 'CERT_HAS_EXPIRED') {
            throw new Error(`${t('error.serverCertExpired')}：${item.url}`)
          } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
            throw new Error(`${t('error.unableToVerifyCert')}：${item.url}`)
          } else if (error.message.includes('Certificate verification failed')) {
            throw new Error(`${t('error.certVerificationFailed')}：${item.url}`)
          } else {
            throw new Error(`${t('error.requestFailed')}：${error.message}`)
          }
        }
        throw error
      }


      const data = res.data
      const headers = res.headers
      const contentDispositionKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('content-disposition')
      )
      if (contentDispositionKey && newItem.name === 'Remote File') {
        newItem.name = parseFilename(headers[contentDispositionKey])
      }
      const homeKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-web-page-url')
      )
      if (homeKey) {
        newItem.home = headers[homeKey]
      }
      const intervalKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-update-interval')
      )
      if (intervalKey) {
        newItem.interval = parseInt(headers[intervalKey]) * 60
        if (newItem.interval) {
          newItem.locked = true
        }
      }
      const userinfoKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('subscription-userinfo')
      )
      if (userinfoKey) {
        newItem.extra = parseSubinfo(headers[userinfoKey])
      }
      if (newItem.verify) {
        try {
          parseYaml<MihomoConfig>(data)
        } catch (error) {
          throw new Error(t('error.subscriptionFormatError') + '\n' + (error as Error).message)
        }
      }
      await setProfileStr(id, data)
      break
    }
    case 'local': {
      const data = item.file || ''
      await setProfileStr(id, data)
      break
    }
  }
  return newItem
}

export async function getProfileStr(id: string | undefined): Promise<string> {
  if (existsSync(profilePath(id || 'default'))) {
    return await readFile(profilePath(id || 'default'), 'utf-8')
  } else {
    return stringifyYaml(defaultProfile)
  }
}

export async function getProfileParseStr(id: string | undefined): Promise<string> {
  let data: string
  if (existsSync(profilePath(id || 'default'))) {
    data = await readFile(profilePath(id || 'default'), 'utf-8')
  } else {
    data = stringifyYaml(defaultProfile)
  }
  const profile = deepMerge(parseYaml<object>(data), {})
  return stringifyYaml(profile)
}

export async function setProfileStr(id: string, content: string): Promise<void> {
  const { current } = await getProfileConfig()
  await writeFile(profilePath(id), content, 'utf-8')
  if (current === id) await restartCore()
}

export async function getProfile(id: string | undefined): Promise<MihomoConfig> {
  const profile = await getProfileStr(id)
  let result = parseYaml<MihomoConfig>(profile)
  if (typeof result !== 'object') result = {} as MihomoConfig
  return result
}

// attachment;filename=xxx.yaml; filename*=UTF-8''%xx%xx%xx
function parseFilename(str: string): string {
  if (str.match(/filename\*=.*''/)) {
    return decodeURIComponent(str.split(/filename\*=.*''/)[1])
  } else {
    return str.split('filename=')[1]
  }
}

// subscription-userinfo: upload=1234; download=2234; total=1024000; expire=2218532293
function parseSubinfo(str: string): SubscriptionUserInfo {
  const parts = str.split(';')
  const obj = {} as SubscriptionUserInfo
  parts.forEach((part) => {
    const [key, value] = part.trim().split('=')
    obj[key] = parseInt(value)
  })
  return obj
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)
}

export async function getFileStr(path: string): Promise<string> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  if (isAbsolutePath(path)) {
    return await readFile(path, 'utf-8')
  } else {
    return await readFile(
      join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path),
      'utf-8'
    )
  }
}

export async function setFileStr(path: string, content: string): Promise<void> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  if (isAbsolutePath(path)) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
  } else {
    const target = join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf-8')
  }
}

export async function getRuleStr(id: string): Promise<string> {
  return await readFile(rulePath(id), 'utf-8')
}

export async function setRuleStr(id: string, str: string): Promise<void> {
  await writeFile(rulePath(id), str, 'utf-8')
}

export async function convertMrsRuleset(filePath: string, behavior: string): Promise<string> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)
  const { mihomoCorePath } = await import('../utils/dirs')
  const { getAppConfig } = await import('./app')
  const { tmpdir } = await import('os')
  const { randomBytes } = await import('crypto')
  const { unlink } = await import('fs/promises')

  const { core = 'mihomo' } = await getAppConfig()
  const corePath = mihomoCorePath(core)
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  let fullPath: string
  if (isAbsolutePath(filePath)) {
    fullPath = filePath
  } else {
    fullPath = join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), filePath)
  }

  const tempFileName = `mrs-convert-${randomBytes(8).toString('hex')}.txt`
  const tempFilePath = join(tmpdir(), tempFileName)

  try {
    // 使用 mihomo convert-ruleset 命令转换 MRS 文件为 text 格式
    // 命令格式: mihomo convert-ruleset <behavior> <format> <source>
    await execAsync(`"${corePath}" convert-ruleset ${behavior} mrs "${fullPath}" "${tempFilePath}"`)
    const content = await readFile(tempFilePath, 'utf-8')
    await unlink(tempFilePath)

    return content
  } catch (error) {
    try {
      await unlink(tempFilePath)
    } catch {
      // ignore
    }
    throw error
  }
}
