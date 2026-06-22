/* ── Notification ── */
export interface Notification {
  id: string
  actor: import('./auth').UserSummary | null
  tripId: string | null
  type: string
  title: string
  body: string | null
  payload: {
    tripId: string
    inviteId: string
    inviteCode: string
    route: string | null
  } | null
  readAt: string | null
  createdAt: string

}
