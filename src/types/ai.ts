/* ── Enums ── */
export type AiSessionStatus = 'ACTIVE' | 'DELETED'
export type AiMessageRole = 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL'
export type ToolExecutionPolicy = 'READ' | 'REVERSIBLE_WRITE' | 'BLOCKED_HIGH_RISK'
export type ToolCallStatus = 'REQUESTED' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED'

/* ── AI Chat Session ── */
export interface AiChatSession {
  id: string
  tripId: string
  status: AiSessionStatus | string
  summaryUpdatedAt: string | null
  createdAt: string | null
}

/* ── AI Chat Message ── */
export interface AiChatMessage {
  id: string
  role: AiMessageRole
  requester: import('./auth').UserSummary | null
  content: string
  toolCallId: string | null
  createdAt: string
}

/* ── AI Tool Call ── */
export interface AiToolCall {
  id: string
  toolName: string
  executionPolicy: ToolExecutionPolicy
  status: ToolCallStatus
  versionBefore: number | null
  versionAfter: number | null
  undoRedoAvailable: boolean | null
  errorCode: string | null
}

/* ── Request Types ── */
export interface AiChatRequest {
  content: string
  baseVersion?: number | null
  viewport?: {
    minLng: number
    minLat: number
    maxLng: number
    maxLat: number
  } | null
}

export interface AiRouteDraftRequest {
  preferences?: Record<string, unknown>
}

export interface AiMessageResponse {
  message: AiChatMessage
  toolCalls: AiToolCall[]
  itineraryVersion: number | null
  undoAvailable: boolean | null
  redoAvailable: boolean | null
}
