import type { UserSummary } from './auth'

export type PlanningScopeType = 'TRIP' | 'DAY'

export interface Note {
  id: string
  tripId: string
  scopeType: PlanningScopeType
  itineraryDayId: string | null
  content: string
  version: number
  deletedAt: string | null
}

export interface ChecklistMemberStatus {
  user: UserSummary
  isCompleted: boolean
  completedAt: string | null
  updatedAt: string | null
}

export interface ChecklistItem {
  id: string
  checklistId: string
  sortOrder: number
  content: string
  memberStatuses: ChecklistMemberStatus[]
  deletedAt: string | null
}

export interface Checklist {
  id: string
  tripId: string
  scopeType: PlanningScopeType
  itineraryDayId: string | null
  title: string | null
  items: ChecklistItem[]
}

export interface PlanningMutationResponse {
  tripId: string
  itineraryVersion: number | null
  commandEventId: number | null
  undoAvailable: boolean
  redoAvailable: boolean
  note: Note | null
  checklist: Checklist | null
  item: ChecklistItem | null
  memberStatus: ChecklistMemberStatus | null
}

export interface PlanningScope {
  scopeType: PlanningScopeType
  itineraryDayId?: string | null
}
