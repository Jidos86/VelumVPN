import { getAppConfig } from '../config'
import { version } from '../../../package.json'

export async function getUserAgent(): Promise<string> {
  const { userAgent } = await getAppConfig()
  if (userAgent) {
    return userAgent
  }

  return `koala-clash/${version}`
}
