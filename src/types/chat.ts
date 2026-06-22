import type { UserSummary } from './auth'
import type { OffsetPagedItems } from './api'

export interface TripChatMessage {
  id: string
  tripId: string
  sender: UserSummary
  content: string | null
  deletedAt: string | null
  createdAt: string
}

export type PagedTripChatMessage = OffsetPagedItems<TripChatMessage>
