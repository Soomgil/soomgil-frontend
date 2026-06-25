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
