/* ── Geometry helpers (GeoJSON互換) ── */
export interface LineStringGeometry {
  type: 'LineString'
  coordinates: [number, number][]
}

export interface GenericGeometry {
  type: string
  coordinates: unknown
}

/* ── Enums ── */
export type DayGroupType = 'DAY' | 'UNSCHEDULED'
export type ItemType = 'PLACE' | 'CUSTOM_PLACE'
export type SourceStatus = 'AVAILABLE' | 'DELETED' | 'UNKNOWN'
export type RouteMode = 'DRIVING' | 'WALKING'
export type DrawingType = 'FREEHAND' | 'LINE' | 'POLYGON' | 'MARKER' | 'TEXT'

/* ── Itinerary Day ── */
export interface ItineraryDay {
  id: string
  tripId: string
  groupType: DayGroupType
  dayNumber: number | null
  date: string | null
  title: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string

  /** API에서 join해서 줄 수 있는 items */
  items?: ItineraryItem[]
}

/* ── Itinerary Item ── */
export interface ItineraryItem {
  id: string
  tripId: string
  itineraryDayId: string
  sortOrder: number
  itemType: ItemType
  placeProvider: string | null
  externalPlaceId: string | null
  placeName: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  sourceStatus: SourceStatus
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
}

/* ── Trip Route (item-to-item segment) ── */
export interface TripRoute {
  id: string
  tripId: string
  originItineraryItemId: string
  destinationItineraryItemId: string
  mode: RouteMode
  provider: string
  geometry: LineStringGeometry | null
  distanceMeters: number | null
  durationSeconds: number | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

/* ── Map Drawing ── */
export interface MapDrawing {
  id: string
  tripId: string
  itineraryDayId: string | null
  drawingType: DrawingType
  geometry: GenericGeometry
  style: Record<string, unknown> | null
  label: string | null
  sortOrder: number
  version: number
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

/* ── Request Types ── */
export interface ItineraryPutRequest {
  days: {
    id?: string
    groupType: DayGroupType
    dayNumber?: number | null
    date?: string | null
    title?: string | null
    sortOrder: number
    items: {
      id?: string
      itemType: ItemType
      placeProvider?: string | null
      externalPlaceId?: string | null
      placeName: string
      address?: string | null
      lat?: number | null
      lng?: number | null
      sortOrder: number
    }[]
  }[]
  routes: {
    originItineraryItemId: string
    destinationItineraryItemId: string
    mode: RouteMode
  }[]
}
