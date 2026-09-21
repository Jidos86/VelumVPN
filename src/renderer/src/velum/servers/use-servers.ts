import { useCallback, useMemo, useState } from 'react'
import { useGroups } from '@renderer/hooks/use-groups'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoProxyDelay,
  mihomoUnfixedProxy
} from '@renderer/utils/ipc'
import { lastDelay, parseServerName, ServerEntry } from './server-utils'

// The core forgets every ping when the config is reloaded (routing mode, rules, profile update),
// which would flip all servers back to "not tested". Keep the last known value until a new test replaces it.
const knownDelays = new Map<string, number>()
const rememberedDelay = (name: string, delay: number): number => {
  if (delay !== -1) {
    knownDelays.set(name, delay)
    return delay
  }
  return knownDelays.get(name) ?? -1
}

// Server selection for the home screen. Same wiring as the proxies page:
// the first group is the user-facing selector, its members are nodes and auto groups.
export function useServers(): {
  groupName: string | undefined
  entries: ServerEntry[]
  current: ServerEntry | undefined
  testing: Set<string>
  testingAll: boolean
  select: (name: string) => Promise<void>
  // node pinned inside the auto group, and a toggle for it (undefined when there is no auto group)
  pinned: string | undefined
  canPin: boolean
  togglePin: (name: string) => Promise<void>
  testOne: (name: string) => Promise<void>
  testAll: () => Promise<void>
} {
  const { groups = [], mutate } = useGroups()
  const { appConfig } = useAppConfig()
  const { autoCloseConnection = true, delayTestConcurrency = 50 } = appConfig || {}
  const group = groups[0]
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [testingAll, setTestingAll] = useState(false)

  const entries = useMemo<ServerEntry[]>(() => {
    if (!group) return []
    const result: ServerEntry[] = []
    for (const item of group.all) {
      if ('all' in item) {
        // Nested group: only auto-selecting ones (url-test / fallback / load-balance) are useful here.
        if (item.type === 'Selector') continue
        const { label, code, flag } = parseServerName(item.name)
        result.push({
          name: item.name,
          label,
          code,
          flag,
          delay: rememberedDelay(item.name, lastDelay(item)),
          isAuto: true,
          resolvedName: item.now,
          fixed: item.fixed || undefined
        })
      } else {
        if (item.type === 'Direct' || item.type === 'Reject') continue
        const { label, code, flag } = parseServerName(item.name)
        result.push({
          name: item.name,
          label,
          code,
          flag,
          delay: rememberedDelay(item.name, lastDelay(item)),
          isAuto: false
        })
      }
    }
    // An auto group has no ping of its own: show the node it currently resolves to.
    for (const e of result) {
      if (!e.isAuto || !e.resolvedName) continue
      const target = result.find((x) => x.name === e.resolvedName)
      if (target) e.delay = target.delay
    }
    return result
  }, [group])

  const current = useMemo(() => entries.find((e) => e.name === group?.now), [entries, group])

  const select = useCallback(
    async (name: string): Promise<void> => {
      if (!group) return
      await mihomoChangeProxy(group.name, name)
      if (autoCloseConnection) {
        await mihomoCloseAllConnections(group.name)
      }
      mutate()
    },
    [group, autoCloseConnection, mutate]
  )

  // Same as the proxies page: choosing a node inside an auto group pins it there,
  // and "unfixed" hands the choice back to the group.
  const autoGroup = useMemo(() => entries.find((e) => e.isAuto), [entries])
  const pinned = autoGroup?.fixed

  const togglePin = useCallback(
    async (name: string): Promise<void> => {
      if (!autoGroup) return
      if (pinned === name) {
        await mihomoUnfixedProxy(autoGroup.name)
      } else {
        await mihomoChangeProxy(autoGroup.name, name)
      }
      if (autoCloseConnection && group?.now === autoGroup.name) {
        await mihomoCloseAllConnections(group.name)
      }
      mutate()
    },
    [autoGroup, pinned, group, autoCloseConnection, mutate]
  )

  const testOne = useCallback(
    async (name: string): Promise<void> => {
      setTesting((prev) => new Set(prev).add(name))
      try {
        await mihomoProxyDelay(name, group?.testUrl)
      } catch {
        // a failed test is shown as a timeout by the refreshed history
      } finally {
        setTesting((prev) => {
          const next = new Set(prev)
          next.delete(name)
          return next
        })
        mutate()
      }
    },
    [group, mutate]
  )

  const testAll = useCallback(async (): Promise<void> => {
    const names = entries.filter((e) => !e.isAuto).map((e) => e.name)
    if (names.length === 0) return
    setTestingAll(true)
    setTesting(new Set(names))
    const queue = [...names]
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const name = queue.shift()!
        try {
          await mihomoProxyDelay(name, group?.testUrl)
        } catch {
          // ignore, see testOne
        }
        setTesting((prev) => {
          const next = new Set(prev)
          next.delete(name)
          return next
        })
      }
    }
    await Promise.all(Array.from({ length: Math.min(delayTestConcurrency || 50, names.length) }, worker))
    setTestingAll(false)
    mutate()
  }, [entries, group, delayTestConcurrency, mutate])

  return {
    groupName: group?.name,
    entries,
    current,
    testing,
    testingAll,
    select,
    pinned,
    canPin: autoGroup !== undefined,
    togglePin,
    testOne,
    testAll
  }
}
