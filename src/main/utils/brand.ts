import { brandFilePath } from './dirs'
import { existsSync, readFileSync } from 'fs'

interface BrandConfig {
  geositeUrl?: string
  geoipUrl?: string
}

let cached: BrandConfig | null = null

export function getBrand(): BrandConfig {
  if (cached) return cached
  try {
    const p = brandFilePath()
    if (!existsSync(p)) return (cached = {})
    cached = JSON.parse(readFileSync(p, 'utf-8')) as BrandConfig
    return cached
  } catch {
    return (cached = {})
  }
}
