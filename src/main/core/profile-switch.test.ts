import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyProfileChange, resolveProfileId, type ProfileSwitchCore } from './profile-switch.ts'

function core(partial: Partial<ProfileSwitchCore> & { stopped?: boolean }): ProfileSwitchCore {
  return {
    generate: async () => undefined,
    check: async () => undefined,
    hotReload: async () => undefined,
    restart: async () => undefined,
    closeConnections: async () => undefined,
    stoppedDuringApply: () => partial.stopped ?? false,
    ...partial
  }
}

describe('resolveProfileId', () => {
  it('keeps the saved profile when a reload passes the IPC event', () => {
    const event = { sender: {}, preventDefault() {} }
    assert.equal(resolveProfileId(event, 'profile-a'), 'profile-a')
    assert.equal(resolveProfileId(undefined, 'profile-a'), 'profile-a')
    assert.equal(resolveProfileId('profile-b', 'profile-a'), 'profile-b')
  })
})

describe('applyProfileChange', () => {
  it('keeps the working profile when the new one fails validation', async () => {
    let current = 'A'
    let work = 'work-A'
    const calls: string[] = []
    await assert.rejects(
      applyProfileChange({
        nextId: 'B',
        previousId: 'A',
        useHotReload: true,
        readWork: async () => work,
        writeWork: async (body) => {
          work = body
        },
        commitCurrent: async (id) => {
          current = id ?? ''
        },
        core: core({
          generate: async (id) => {
            calls.push(`generate:${id}`)
            work = `work-${id}`
          },
          check: async () => {
            throw new Error('invalid')
          },
          restart: async () => {
            calls.push('restart')
          }
        }),
        restoreFailedMessage: 'restore failed'
      })
    )
    assert.equal(current, 'A')
    assert.equal(work, 'work-A')
    assert.deepEqual(calls, ['generate:B'])
  })

  it('restarts the previous profile when reload and restart both fail', async () => {
    let current = 'A'
    const calls: string[] = []
    await assert.rejects(
      applyProfileChange({
        nextId: 'B',
        previousId: 'A',
        useHotReload: true,
        readWork: async () => 'work-A',
        writeWork: async () => undefined,
        commitCurrent: async (id) => {
          current = id ?? ''
          calls.push(`commit:${id}`)
        },
        core: core({
          stopped: true,
          hotReload: async () => {
            throw new Error('hot')
          },
          restart: async (id) => {
            calls.push(`restart:${id}`)
            if (id === 'B') throw new Error('start B')
          }
        }),
        restoreFailedMessage: 'restore failed'
      }),
      /start B/
    )
    assert.equal(current, 'A')
    assert.deepEqual(calls, ['restart:B', 'commit:A', 'restart:A'])
  })

  it('reports both causes when restoring the previous profile also fails', async () => {
    await assert.rejects(
      applyProfileChange({
        nextId: 'B',
        previousId: 'A',
        useHotReload: false,
        readWork: async () => null,
        writeWork: async () => undefined,
        commitCurrent: async () => undefined,
        core: core({
          stopped: true,
          restart: async (id) => {
            throw new Error(id === 'B' ? 'start B' : 'start A')
          }
        }),
        restoreFailedMessage: 'core unavailable'
      }),
      /start B[\s\S]*core unavailable[\s\S]*start A/
    )
  })

  it('commits only after the new profile is applied', async () => {
    const order: string[] = []
    await applyProfileChange({
      nextId: 'B',
      previousId: 'A',
      useHotReload: true,
      readWork: async () => 'work-A',
      writeWork: async () => undefined,
      commitCurrent: async () => {
        order.push('commit')
      },
      core: core({
        hotReload: async () => {
          order.push('reload')
        },
        closeConnections: async () => {
          order.push('close')
        }
      }),
      restoreFailedMessage: 'restore failed'
    })
    assert.deepEqual(order, ['reload', 'commit', 'close'])
  })
})
