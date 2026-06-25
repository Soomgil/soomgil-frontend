export const COLLABORATION_SESSION_HEADER = 'X-Soomgil-WebSocket-Session-Id'

const sessionIds = new Set<string>()

export function registerCollaborationSessionId(sessionId: string | null | undefined) {
  const normalized = sessionId?.trim()
  if (!normalized) return null
  sessionIds.add(normalized)
  return normalized
}

export function unregisterCollaborationSessionId(sessionId: string | null | undefined) {
  const normalized = sessionId?.trim()
  if (normalized) sessionIds.delete(normalized)
}

export function getCollaborationSessionId() {
  return [...sessionIds].at(-1) ?? null
}

export function clearCollaborationSessionIds() {
  sessionIds.clear()
}
