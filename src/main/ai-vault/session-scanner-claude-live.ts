import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AiVaultSessionLiveInfo } from '../../shared/ai-vault-types'

// Claude Code writes one <pid>.json per interactive window into this registry
// (pid, sessionId, cwd, status, CLI card name) and it is the only place that
// links a transcript to a LIVE process — transcript files alone can't tell a
// running session from an abandoned one.
const CLAUDE_SESSIONS_REGISTRY_DIR = join(homedir(), '.claude', 'sessions')

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to another user — still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function parseRegistryEntry(raw: string): (AiVaultSessionLiveInfo & { sessionId: string }) | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const entry = data as Record<string, unknown>
  const pid = typeof entry.pid === 'number' ? entry.pid : null
  const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : null
  if (!pid || !sessionId) {
    return null
  }
  return {
    sessionId,
    pid,
    status: typeof entry.status === 'string' ? entry.status : 'unknown',
    name: typeof entry.name === 'string' && entry.name.length > 0 ? entry.name : null
  }
}

/**
 * Read Claude Code's live-session pid registry and return sessionId → live
 * info for every entry whose process is still alive. Never throws: a missing
 * registry dir or a malformed entry yields an empty/partial map — liveness is
 * an enrichment, not a scan dependency.
 * @param registryDir - Override for tests; defaults to ~/.claude/sessions.
 * @param checkPidAlive - Override for tests; defaults to a kill(pid, 0) probe.
 */
export async function readClaudeLiveSessionsById(
  registryDir: string = CLAUDE_SESSIONS_REGISTRY_DIR,
  checkPidAlive: (pid: number) => boolean = isPidAlive
): Promise<Map<string, AiVaultSessionLiveInfo>> {
  let names: string[]
  try {
    names = await readdir(registryDir)
  } catch {
    return new Map()
  }
  const liveById = new Map<string, AiVaultSessionLiveInfo>()
  await Promise.all(
    names
      // Legacy `session-<ts>.json` files predate the pid registry and carry no pid.
      .filter((name) => name.endsWith('.json') && !name.startsWith('session-'))
      .map(async (name) => {
        let raw: string
        try {
          raw = await readFile(join(registryDir, name), 'utf8')
        } catch {
          return
        }
        const entry = parseRegistryEntry(raw)
        if (!entry || !checkPidAlive(entry.pid)) {
          return
        }
        liveById.set(entry.sessionId, {
          pid: entry.pid,
          status: entry.status,
          name: entry.name
        })
      })
  )
  return liveById
}
