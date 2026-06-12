/* ── Notification ── */
export interface Notification {
  id: string
  recipientUserId: string
  actorUserId: string | null
  tripId: string | null
  type: string
  title: string
  body: string | null
  payload: Record<string, unknown> | null
  readAt: string | null
  createdAt: string

  /** UI 표시용 (API에서 join) */
  actorDisplayName?: string
  actorProfileImageUrl?: string
}
