/** A UI reload passes no id. Anything that is not a profile id stays on the saved one. */
export function resolveProfileId(explicit: unknown, saved: string | undefined): string | undefined {
  return typeof explicit === 'string' && explicit.length > 0 ? explicit : saved
}

export interface ProfileSwitchCore {
  generate(id: string | undefined): Promise<void>
  check(id: string | undefined): Promise<void>
  hotReload(id: string | undefined): Promise<void>
  restart(id: string | undefined): Promise<void>
  closeConnections(): Promise<void>
  /** True when this attempt stopped the live core and did not bring it back. */
  stoppedDuringApply(): boolean
}

export async function applyProfileChange(options: {
  nextId: string
  previousId: string | undefined
  useHotReload: boolean
  readWork: () => Promise<string | null>
  writeWork: (body: string) => Promise<void>
  commitCurrent: (id: string | undefined) => Promise<void>
  core: ProfileSwitchCore
  restoreFailedMessage: string
}): Promise<void> {
  const { nextId, previousId, useHotReload, core } = options
  if (previousId === nextId) return

  const snapshot = await options.readWork()
  try {
    await core.generate(nextId)
    await core.check(nextId)
  } catch (error) {
    if (snapshot != null) await options.writeWork(snapshot)
    throw error
  }

  let applied = false
  try {
    if (useHotReload) {
      try {
        await core.hotReload(nextId)
        applied = true
      } catch {
        await core.restart(nextId)
        applied = true
      }
    } else {
      await core.restart(nextId)
      applied = true
    }
    await options.commitCurrent(nextId)
    try {
      await core.closeConnections()
    } catch {
      // the new config is already running; a missing controller must not roll it back
    }
  } catch (error) {
    try {
      if (snapshot != null) await options.writeWork(snapshot)
      await options.commitCurrent(previousId)
      if (applied || core.stoppedDuringApply()) {
        await core.generate(previousId)
        await core.restart(previousId)
      }
    } catch (restoreError) {
      throw new Error(`${error}\n${options.restoreFailedMessage}: ${restoreError}`)
    }
    throw error
  }
}
