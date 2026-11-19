export interface SerialGate {
  bump(): number
  isCurrent(generation: number): boolean
  run<T>(generation: number, job: () => Promise<T>): Promise<T | 'skipped'>
}

/** Later commands bump the generation. A job that lost the race before it started is skipped. */
export function createSerialGate(): SerialGate {
  let generation = 0
  let chain: Promise<unknown> = Promise.resolve()
  return {
    bump(): number {
      generation += 1
      return generation
    },
    isCurrent(value: number): boolean {
      return value === generation
    },
    run<T>(value: number, job: () => Promise<T>): Promise<T | 'skipped'> {
      const task = chain.then(async (): Promise<T | 'skipped'> => {
        if (value !== generation) return 'skipped'
        return job()
      })
      chain = task.then(
        () => undefined,
        () => undefined
      )
      return task
    }
  }
}
