import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readClaudeLiveSessionsById } from './session-scanner-claude-live'

const tempPaths: string[] = []

async function makeRegistry(entries: Record<string, unknown>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-claude-live-'))
  tempPaths.push(directory)
  await Promise.all(
    Object.entries(entries).map(([name, content]) =>
      writeFile(
        join(directory, name),
        typeof content === 'string' ? content : JSON.stringify(content)
      )
    )
  )
  return directory
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('readClaudeLiveSessionsById', () => {
  it('maps sessionId to pid/status/name for alive processes', async () => {
    const dir = await makeRegistry({
      '123.json': { pid: 123, sessionId: 'sid-alive', status: 'busy', name: 'my-task' }
    })
    const result = await readClaudeLiveSessionsById(dir, () => true)

    expect(result.get('sid-alive')).toEqual({ pid: 123, status: 'busy', name: 'my-task' })
  })

  it('drops entries whose process is dead', async () => {
    const dir = await makeRegistry({
      '123.json': { pid: 123, sessionId: 'sid-dead', status: 'idle' }
    })
    const result = await readClaudeLiveSessionsById(dir, () => false)

    expect(result.size).toBe(0)
  })

  it('skips legacy pid-less files and malformed JSON without failing the scan', async () => {
    const dir = await makeRegistry({
      'session-1700000000.json': { sessionId: 'legacy-no-pid' },
      'broken.json': '{not json',
      'nopid.json': { sessionId: 'sid-nopid' },
      '77.json': { pid: 77, sessionId: 'sid-ok', status: 'waiting', name: '' }
    })
    const result = await readClaudeLiveSessionsById(dir, () => true)

    expect([...result.keys()]).toEqual(['sid-ok'])
    // Empty CLI names normalize to null so the UI never renders a blank label.
    expect(result.get('sid-ok')).toEqual({ pid: 77, status: 'waiting', name: null })
  })

  it('returns an empty map when the registry directory is missing', async () => {
    const result = await readClaudeLiveSessionsById(
      join(tmpdir(), 'orca-claude-live-does-not-exist'),
      () => true
    )

    expect(result.size).toBe(0)
  })

  it('detects the current process as alive with the default probe', async () => {
    const dir = await makeRegistry({
      [`${process.pid}.json`]: { pid: process.pid, sessionId: 'sid-self', status: 'idle' }
    })
    const result = await readClaudeLiveSessionsById(dir)

    expect(result.has('sid-self')).toBe(true)
  })
})
