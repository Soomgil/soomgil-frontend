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
