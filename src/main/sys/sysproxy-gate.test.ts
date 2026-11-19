import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSerialGate } from './sysproxy-gate.ts'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('sysproxy gate', () => {
  it('does not run an older command once a newer one has been queued', async () => {
    const gate = createSerialGate()
    const log: string[] = []
    const older = gate.bump()
    const first = gate.run(older, async () => {
      log.push('old')
      return 'old'
    })
    const newer = gate.bump()
    const second = gate.run(newer, async () => {
      log.push('new')
      return 'new'
    })
    assert.equal(await first, 'skipped')
    assert.equal(await second, 'new')
    assert.deepEqual(log, ['new'])
  })

  it('lets a command that already started finish, then applies the newer one last', async () => {
    const gate = createSerialGate()
    const log: string[] = []
    const older = gate.bump()
    const first = gate.run(older, async () => {
      log.push('old-start')
      await delay(30)
      log.push('old-end')
      return 'old'
    })
    await delay(5)
    const newer = gate.bump()
    const second = gate.run(newer, async () => {
      log.push('new')
      return 'new'
    })
    assert.equal(await first, 'old')
    assert.equal(await second, 'new')
    assert.deepEqual(log, ['old-start', 'old-end', 'new'])
  })
})
