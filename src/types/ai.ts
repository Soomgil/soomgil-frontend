/* ── Enums ── */
export type AiSessionStatus = 'ACTIVE' | 'DELETED'
export type AiMessageRole = 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL'
export type ToolExecutionPolicy = 'READ' | 'REVERSIBLE_WRITE' | 'BLOCKED_HIGH_RISK'
export type ToolCallStatus = 'REQUESTED' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED'

/* ── AI Chat Session ── */
export interface AiChatSession {
  id: string
  tripId: string
  status: AiSessionStatus
  summary: string | null
  summaryUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

/* ── AI Chat Message ── */
export interface AiChatMessage {
  id: string
  sessionId: string
  requesterUserId: string | null
  role: AiMessageRole
  content: string
  toolCallId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/* ── AI Tool Call ── */
export interface AiToolCall {
  id: string
  sessionId: string
  tripId: string
  requestMessageId: string | null
  resultMessageId: string | null
  requestedByUserId: string
  toolName: string
  executionPolicy: ToolExecutionPolicy
  arguments: Record<string, unknown>
  result: Record<string, unknown> | null
  status: ToolCallStatus
  versionBefore: number | null
  versionAfter: number | null
  undoRedoAvailable: boolean
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

/* ── Request Types ── */
export interface AiChatRequest {
  message: string
}

export interface AiRouteDraftRequest {
  preferences?: Record<string, unknown>
}
