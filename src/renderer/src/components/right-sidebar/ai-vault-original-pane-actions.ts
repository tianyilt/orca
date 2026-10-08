import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { findStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { getAiVaultResumeWorkspaceExecutionHostId } from '@/lib/ai-vault-resume-target'
import type { AiVaultSessionResumeTargetState } from './ai-vault-session-resume'
import { translate } from '@/i18n/i18n'
import { findOriginalAiVaultSessionPane } from './ai-vault-original-pane'
import {
	createLazyAiVaultOriginalPaneIndex,
	findAiVaultSessionLiveStateInIndex,
	isAiVaultSessionBoundToWorktree,
	findOriginalAiVaultSessionPaneInIndex
} from './ai-vault-original-pane-index'

export function useAiVaultOriginalPaneActions(targetState: AiVaultSessionResumeTargetState): {
	getOriginalPaneTarget: (
		session: AiVaultSession
	) => ReturnType<typeof findOriginalAiVaultSessionPane>
	getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
	isStructuredSessionOpen: (session: AiVaultSession) => boolean
	isSessionBoundToActiveWorktree: (session: AiVaultSession) => boolean
	jumpToOriginalPane: (session: AiVaultSession) => void
	jumpToWorktree: (worktreeId: string) => void
} {
	const activeWorktreeId = useActiveWorktreeId()
	const activeWorktree = useActiveWorktree()
	const worktreeId = activeWorktreeId ?? activeWorktree?.id ?? null
	const originalPaneLookupState = useAppStore(
		useShallow((s) => ({
			agentStatusByPaneKey: s.agentStatusByPaneKey,
			retainedAgentsByPaneKey: s.retainedAgentsByPaneKey,
			sleepingAgentSessionsByPaneKey: s.sleepingAgentSessionsByPaneKey,
			tabsByWorktree: s.tabsByWorktree,
			terminalLayoutsByTabId: s.terminalLayoutsByTabId,
			unifiedTabsByWorktree: s.unifiedTabsByWorktree
		}))
	)

	const isStructuredSessionOpen = useCallback(
		(session: AiVaultSession): boolean => {
			const structured = session.structuredSession
			return structured
				? Boolean(
						findStructuredAgentSessionTab(originalPaneLookupState.unifiedTabsByWorktree, {
							workspaceId: structured.workspaceId,
							sessionId: structured.sessionId
						})
					)
				: false
		},
		[originalPaneLookupState.unifiedTabsByWorktree]
	)
	// Why: loading, filtered, or collapsed views may render no session rows.
	// Build once on the first actual lookup, then share it across visible rows.
	const getOriginalPaneIndex = useMemo(
		() => createLazyAiVaultOriginalPaneIndex(originalPaneLookupState),
		[originalPaneLookupState]
	)

	const getOriginalPaneTarget = useCallback(
		(session: AiVaultSession) =>
			findOriginalAiVaultSessionPaneInIndex(getOriginalPaneIndex(), session),
		[getOriginalPaneIndex]
	)

	const getSessionLiveState = useCallback(
		(session: AiVaultSession) =>
			findAiVaultSessionLiveStateInIndex(getOriginalPaneIndex(), session),
		[getOriginalPaneIndex]
	)

	const executionHostId = getAiVaultResumeWorkspaceExecutionHostId(targetState, worktreeId)
	const isSessionBoundToActiveWorktree = useCallback(
		(session: AiVaultSession) =>
			Boolean(
				worktreeId &&
				executionHostId &&
				session.executionHostId === executionHostId &&
				((session.structuredSession?.workspaceId === worktreeId &&
					isStructuredSessionOpen(session)) ||
					isAiVaultSessionBoundToWorktree(
						getOriginalPaneIndex(),
						session,
						worktreeId,
						executionHostId
					))
			),
		[getOriginalPaneIndex, isStructuredSessionOpen, worktreeId, executionHostId]
	)

	const jumpToOriginalPane = useCallback(
		(session: AiVaultSession): void => {
			if (session.structuredSession && isStructuredSessionOpen(session)) {
				void activateAiVaultStructuredSession(session)
				return
			}
			const target = findOriginalAiVaultSessionPane(useAppStore.getState(), session)
			if (!target) {
				toast.error(
					translate(
						'auto.components.right.sidebar.AiVaultPanel.originalPaneUnavailable',
						'Original pane is no longer available.'
					)
				)
				return
			}

			if (!activateAndRevealWorktree(target.worktreeId)) {
				toast.error(
					translate(
						'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
						'Worktree is no longer available.'
					)
				)
				return
			}
			const state = useAppStore.getState()
			state.setActiveTabType('terminal', target.worktreeId)
			activateTabAndFocusPane(target.tabId, target.leafId, {
				flashFocusedPane: true,
				scrollToBottomIfOutputSinceLastView: true
			})
		},
		[isStructuredSessionOpen]
	)

	const jumpToWorktree = useCallback((worktreeId: string): void => {
		if (!activateAndRevealWorktree(worktreeId)) {
			toast.error(
				translate(
					'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
					'Worktree is no longer available.'
				)
			)
		}
	}, [])

	return {
		getOriginalPaneTarget,
		getSessionLiveState,
		isStructuredSessionOpen,
		isSessionBoundToActiveWorktree,
		jumpToOriginalPane,
		jumpToWorktree
	}
}
