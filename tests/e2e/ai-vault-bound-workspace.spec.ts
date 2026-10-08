import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'

test('workspace history includes an exactly bound session outside its original directory', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  const home = await electronApp.evaluate(({ app }) => app.getPath('home'))
  const id = '11111111-2222-4333-8444-555555555555'
  const title = 'Arena migrated session outside UI checkout'
  const timestamp = new Date().toISOString()
  const sessionsDir = path.join(home, '.codex', 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  const records = [
    { timestamp, type: 'session_meta', payload: { id, cwd: '/srv/arena-original-checkout' } },
    {
      timestamp,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: title }]
      }
    }
  ]
  writeFileSync(
    path.join(sessionsDir, `rollout-${id}.jsonl`),
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
  )
  await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    store.getState().setRightSidebarOpen(true)
    store.getState().setRightSidebarTab('vault')
  })
  const historyTitle = orcaPage.locator('div[draggable="true"]').filter({ hasText: title })
  const refresh = orcaPage.getByRole('button', { name: /Refresh Session History|刷新会话历史/ })
  await expect(refresh).toBeEnabled({ timeout: 30_000 })
  await refresh.click()
  await expect(orcaPage.getByText(/^(0 of 1 sessions|0 次（共 1 次）)$/)).toBeVisible({
    timeout: 30_000
  })
  await expect(historyTitle).toHaveCount(0)
  await orcaPage.screenshot({ path: testInfo.outputPath('unbound.png') })

  await orcaPage.evaluate(
    ({ id, title }) => {
      const store = window.__store
      if (!store) {
        throw new Error('Store unavailable')
      }
      const state = store.getState()
      const worktreeId = state.activeWorktreeId
      if (!worktreeId) {
        throw new Error('Active workspace unavailable')
      }
      const tab = state.tabsByWorktree[worktreeId]?.[0]
      const leafId = tab && state.terminalLayoutsByTabId[tab.id]?.activeLeafId
      if (!tab || !leafId) {
        throw new Error('Existing terminal pane unavailable')
      }
      const paneKey = `${tab.id}:${leafId}`
      const now = Date.now()
      store.setState({
        sleepingAgentSessionsByPaneKey: {
          ...state.sleepingAgentSessionsByPaneKey,
          [paneKey]: {
            state: 'done',
            agent: 'codex',
            prompt: title,
            updatedAt: now,
            capturedAt: now,
            paneKey,
            tabId: tab.id,
            worktreeId,
            origin: 'quit',
            providerSession: { key: 'session_id', id }
          }
        }
      })
    },
    { id, title }
  )
  await expect(historyTitle).toBeVisible()
  await expect(orcaPage.getByText(/^(1 session|1 会话)$/)).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('bound.png') })
  await orcaPage.getByRole('radio', { name: /^(All|全部)$/ }).click()
  await expect(historyTitle).toBeVisible()
  await orcaPage.getByRole('radio', { name: /^(Workspace|工作区)$/ }).click()
  await expect(historyTitle).toBeVisible()
})
