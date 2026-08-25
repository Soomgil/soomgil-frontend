export type VoteSessionStatus = 'DRAFT' | 'OPEN' | 'COMPLETED'
export type VoteParticipantStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED'
export type VoteCompletionReason = 'ALL_SUBMITTED' | 'OWNER_EARLY_CLOSE'

/**
 * 여행 방 진입 시 먼저 보여줄 화면.
 *
 * 라우터 가드는 이 값 하나만 보고 분기한다. 상태 조합 해석은 서버가 담당한다.
 */
export type VoteNextScreen = 'VOTE' | 'WAITING' | 'MAP'

/** 투표 후보. stickerCount는 투표가 끝난 뒤에만 채워진다. */
export interface TripVoteCandidate {
  id: string
  rank: number
  provider: string | null
  externalPlaceId: string | null
  name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  category: string | null
  stickerCount: number | null
}

export interface TripVoteParticipantSummary {
  total: number
  submitted: number
}

export interface VoteStickerPlacement {
  candidateId: string
  stickerCount: number
}

export interface MyVoteParticipation {
  participantId: string
  status: VoteParticipantStatus
  stickerAllowance: number
  usedStickerCount: number
  remainingStickerCount: number
  placements: VoteStickerPlacement[]
  submittedAt: string | null
}

export interface TripVoteSessionDetail {
  id: string
  tripId: string
  status: VoteSessionStatus
  stickerAllowance: number
  selectionCount: number
  candidateCount: number
  openedAt: string | null
  completedAt: string | null
  completionReason: VoteCompletionReason | null
  participantSummary: TripVoteParticipantSummary | null
  candidates: TripVoteCandidate[]
}

/** 라우터 가드가 쓰는 단일 응답. */
export interface TripVoteSessionState {
  hasSession: boolean
  nextScreen: VoteNextScreen
  session: TripVoteSessionDetail | null
  myParticipation: MyVoteParticipation | null
}

export interface MyVoteStickerState {
  sessionId: string
  myParticipation: MyVoteParticipation
}

export interface TripVoteResultItem {
  candidateId: string
  provider: string | null
  externalPlaceId: string | null
  name: string | null
  thumbnailUrl: string | null
  stickerCount: number
  selected: boolean
  selectedRank: number | null
  itineraryOutcome: 'ADDED' | 'SKIPPED_DUPLICATE' | null
  itineraryItemId: string | null
}

export interface TripVoteSessionResult {
  sessionId: string
  tripId: string
  status: VoteSessionStatus
  completionReason: VoteCompletionReason | null
  completedAt: string | null
  selectionCount: number
  results: TripVoteResultItem[]
  unscheduledDayId: string | null
  itineraryVersion: number | null
}

export interface OpenVoteSessionRequest {
  stickerAllowance: number
  selectionCount: number
  candidateCount?: number
}
