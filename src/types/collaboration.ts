import type { LngLat } from './geo'

export type DrawingPreviewPhase = 'UPDATE' | 'END' | 'CANCEL'

export interface DrawingPreviewEvent {
  previewId: string
  sequence: number
  phase: DrawingPreviewPhase
  coordinates: LngLat[]
  color: string
  width: number
}

export interface DrawingPreviewMessage extends DrawingPreviewEvent {
  /**
   * 한 획 안에서 이 구간의 시작 좌표 번호. 없으면 기존 전체 미리보기 메시지다.
   * 구간 메시지의 END는 해당 구간의 확정이며, CANCEL은 획 전체를 취소한다.
   * 같은 sequence의 서로 다른 구간은 함께 수신할 수 있다.
   */
  coordinateOffset?: number
  tripId: string
  clientId: string
  sentAt: string
}

export interface TripRealtimeEvent {
  tripId: string
  itineraryVersion?: number | null
  [key: string]: unknown
}

export interface TripPresenceEvent extends TripRealtimeEvent {
  eventType: 'presence.snapshot'
  activeUserIds: string[]
}

export interface CollaborationCommandEvent extends TripRealtimeEvent {
  commandEventId: number
  actorUserId: string
  websocketSessionId: string | null
  source: string
  commandType: string
  aggregateType: string
  aggregateId: string
  versionBefore: number
  versionAfter: number
  payload: string
  createdAt: string
}
