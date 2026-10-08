import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { filterAiVaultSessions } from '../../../../shared/ai-vault-session-filters'
import type { OriginalPaneState } from './ai-vault-original-pane'
import {
  buildAiVaultOriginalPaneIndex,
  isAiVaultSessionBoundToWorktree
} from './ai-vault-original-pane-index'

const leafId = '11111111-1111-4111-8111-111111111111'
const workspaceId = 'folder:arena-ui'
const now = Date.parse('2026-10-08T06:15:00Z')
const entry: AgentStatusEntry = {
  state: 'working',
  prompt: 'Maintain arena',
  updatedAt: now,
  stateStartedAt: now,
  agentType: 'codex',
  paneKey: `arena-tab:${leafId}`,
  worktreeId: workspaceId,
  tabId: 'arena-tab',
  stateHistory: [],
  providerSession: { key: 'session_id', id: 'arena-session' }
}
const session: AiVaultSession = {
  id: 'ssh:training:codex:arena-session',
  executionHostId: 'ssh:training',
  agent: 'codex',
  sessionId: 'arena-session',
  title: 'Maintain arena',
  cwd: '/srv/workspaces/arena',
  branch: null,
  model: null,
  filePath: '/srv/home/sessions/arena-session.jsonl',
  codexHome: '/srv/home',
  createdAt: null,
  updatedAt: new Date(now).toISOString(),
  modifiedAt: new Date(now).toISOString(),
  messageCount: 1,
  totalTokens: 0,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: 'codex resume arena-session',
  subagent: null
}
function paneState(): OriginalPaneState {
  return {
    agentStatusByPaneKey: { [entry.paneKey]: entry },
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    tabsByWorktree: {
      [workspaceId]: [
        {
          id: 'arena-tab',
          ptyId: null,
          worktreeId: workspaceId,
          title: 'Arena',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: now
        }
      ]
    },
    terminalLayoutsByTabId: {
      'arena-tab': {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leafId]: 'pty-arena' }
      }
    }
  }
}
function matches(state = paneState()) {
  const index = buildAiVaultOriginalPaneIndex(state)
  return (candidate: AiVaultSession) =>
    isAiVaultSessionBoundToWorktree(index, candidate, workspaceId, 'ssh:training')
}
function visible(sessions: AiVaultSession[], state = paneState()) {
  return filterAiVaultSessions(sessions, {
    query: '',
    agents: ['codex'],
    scope: 'workspace',
    sort: 'updated',
    activeWorktreePaths: ['/srv/workspaces/arena/analysis/ui'],
    isSessionBoundToActiveWorktree: matches(state),
    hideEmptySessions: true
  }).map((candidate) => candidate.id)
}

describe('history workspace membership after resuming an existing session', () => {
  it.each(['/srv/workspaces/arena', '/srv/workspaces/arena-judge', null])(
    'includes an exactly bound session with original cwd %s',
    (cwd) => {
      expect(visible([{ ...session, cwd }])).toEqual([session.id])
    }
  )
  it('does not admit unbound parent or sibling sessions', () => {
    expect(
      visible([
        session,
        { ...session, id: 'other', sessionId: 'unbound' },
        {
          ...session,
          id: 'judge-other',
          sessionId: 'unbound-judge',
          cwd: '/srv/workspaces/arena-judge'
        }
      ])
    ).toEqual([session.id])
  })
  it('fences equal provider ids by execution host and agent', () => {
    expect(
      visible([
        session,
        { ...session, id: 'local-copy', executionHostId: 'local' },
        { ...session, id: 'other-host-copy', executionHostId: 'ssh:other' }
      ])
    ).toEqual([session.id])
    expect(matches()({ ...session, agent: 'claude' })).toBe(false)
  })
  it('requires the pane to still exist in this workspace', () => {
    const state = paneState()
    state.tabsByWorktree = { 'folder:other': state.tabsByWorktree[workspaceId] }
    expect(visible([session], state)).toEqual([])
    expect(visible([session], { ...paneState(), terminalLayoutsByTabId: {} })).toEqual([])
  })
  it('does not treat repeated prompts as a session binding', () => {
    const state = paneState()
    state.agentStatusByPaneKey = { [entry.paneKey]: { ...entry, providerSession: undefined } }
    expect(visible([session], state)).toEqual([])
  })
  it('preserves exact retained and sleeping bindings across reconnects', () => {
    const state = paneState()
    const tab = state.tabsByWorktree[workspaceId][0]
    state.agentStatusByPaneKey = {}
    state.retainedAgentsByPaneKey = {
      [entry.paneKey]: { entry, worktreeId: workspaceId, tab, agentType: 'codex', startedAt: now }
    }
    expect(visible([session], state)).toEqual([session.id])
    state.retainedAgentsByPaneKey = {}
    state.sleepingAgentSessionsByPaneKey = {
      [entry.paneKey]: {
        paneKey: entry.paneKey,
        tabId: entry.tabId,
        worktreeId: workspaceId,
        agent: 'codex',
        providerSession: { key: 'session_id', id: session.sessionId },
        prompt: entry.prompt,
        state: 'done',
        capturedAt: now,
        updatedAt: now,
        origin: 'quit'
      }
    }
    expect(visible([session], state)).toEqual([session.id])
  })
  it('keeps query, agent and empty-session filters in effect for bound sessions', () => {
    const filters = {
      query: '',
      agents: ['codex'] as const,
      scope: 'workspace' as const,
      sort: 'updated' as const,
      activeWorktreePaths: [],
      isSessionBoundToActiveWorktree: matches(),
      hideEmptySessions: true
    }
    expect(filterAiVaultSessions([session], { ...filters, query: 'missing phrase' })).toEqual([])
    expect(filterAiVaultSessions([session], { ...filters, agents: ['claude'] })).toEqual([])
    expect(filterAiVaultSessions([{ ...session, messageCount: 0 }], filters)).toEqual([])
    expect(filterAiVaultSessions([session], { ...filters, scope: 'all' })).toEqual([session])
  })
})
