import { useCallback, useMemo, useState } from 'react'
import { useGroups } from '@renderer/hooks/use-groups'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import { lastDelay, parseServerName, ServerEntry } from './server-utils'

// Server selection for the home screen. Same wiring as the proxies page:
// the first group is the user-facing selector, its members are nodes and auto groups.
export function useServers(): {
  groupName: string | undefined
  entries: ServerEntry[]
  current: ServerEntry | undefined
  testing: Set<string>
  testingAll: boolean
  select: (name: string) => Promise<void>
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
        const { label, code } = parseServerName(item.name)
        result.push({
          name: item.name,
          label,
          code,
          delay: lastDelay(item),
          isAuto: true,
          resolvedName: item.now
        })
      } else {
        if (item.type === 'Direct' || item.type === 'Reject') continue
        const { label, code } = parseServerName(item.name)
        result.push({ name: item.name, label, code, delay: lastDelay(item), isAuto: false })
      }
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
    testOne,
    testAll
  }
}
