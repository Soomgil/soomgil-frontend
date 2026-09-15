import http from './http'
import type {
  MyVoteStickerState,
  OpenVoteSessionRequest,
  TripVoteSessionDetail,
  TripVoteSessionResult,
  TripVoteSessionState,
  VoteStickerPlacement,
} from '@/types/voting'

/**
 * 여행 방 스티커 투표 API 클라이언트.
 *
 * 모든 요청은 여행방 active member 인증이 필요하다. 투표 시작과 조기 종료는 방장 전용이다.
 */
export const votingApi = {
  /** 라우터 가드가 쓰는 단일 진입점. nextScreen 하나로 분기한다. */
  async getCurrentSession(tripId: string): Promise<TripVoteSessionState> {
    const response = await http.get<TripVoteSessionState>(`/trips/${tripId}/vote-sessions/current`)
    return response.data
  },

  async openSession(tripId: string, request: OpenVoteSessionRequest): Promise<TripVoteSessionDetail> {
    const response = await http.post<TripVoteSessionDetail>(`/trips/${tripId}/vote-sessions`, request)
    return response.data
  },

  /** 배치 전체를 치환한다. 목록에서 빠진 후보는 스티커가 회수된다. */
  async saveStickers(
    tripId: string,
    sessionId: string,
    placements: VoteStickerPlacement[],
  ): Promise<MyVoteStickerState> {
    const response = await http.put<MyVoteStickerState>(
      `/trips/${tripId}/vote-sessions/${sessionId}/my-stickers`,
      { placements },
    )
    return response.data
  },

  async submit(
    tripId: string,
    sessionId: string,
    placements?: VoteStickerPlacement[],
  ): Promise<TripVoteSessionState> {
    const response = await http.post<TripVoteSessionState>(
      `/trips/${tripId}/vote-sessions/${sessionId}/my-submission`,
      placements ? { placements } : {},
    )
    return response.data
  },

  async closeSession(
    tripId: string,
    sessionId: string,
    acknowledgeUnvotedParticipants: boolean,
  ): Promise<TripVoteSessionResult> {
    const response = await http.post<TripVoteSessionResult>(
      `/trips/${tripId}/vote-sessions/${sessionId}/completion`,
      { acknowledgeUnvotedParticipants },
    )
    return response.data
  },

  async getResult(tripId: string, sessionId: string): Promise<TripVoteSessionResult> {
    const response = await http.get<TripVoteSessionResult>(
      `/trips/${tripId}/vote-sessions/${sessionId}/result`,
    )
    return response.data
  },
}
