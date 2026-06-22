export type DayGroupType = 'DAY' | 'UNSCHEDULED'
export type ItemType = 'PLACE' | 'CUSTOM_PLACE'
export type SourceStatus = 'AVAILABLE' | 'DELETED' | 'UNKNOWN'
export type RouteMode = 'DRIVING' | 'WALKING'
export type DrawingType = 'FREEHAND' | 'LINE' | 'POLYGON' | 'MARKER' | 'TEXT'
export type GeometryFormat = 'GEOJSON'

export interface LineStringGeometry extends Record<string, unknown> {
  type: 'LineString'
  coordinates: [number, number][]
}

export interface PlaceRef {
  provider: 'KTO'
  externalPlaceId: string
}

export interface ItineraryItem {
  id: string
  itineraryDayId: string
  sortOrder: number
  itemType: ItemType
  place: PlaceRef | null
  placeName: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  sourceStatus: SourceStatus
}

export interface ItineraryDay {
  id: string
  tripId: string
  groupType: DayGroupType
  dayNumber: number | null
  date: string | null
  title: string | null
  sortOrder: number
  items: ItineraryItem[]
}

export interface TripRoute {
  id: string
  originItineraryItemId: string
  destinationItineraryItemId: string
  mode: RouteMode
  provider: string
  providerProfile: string | null
  geometryFormat: GeometryFormat
  geometry: Record<string, unknown>
  distanceMeters: number | null
  durationSeconds: number | null
  confidence: number | null
}

export interface MapDrawing {
  id: string
  itineraryDayId: string | null
  drawingType: DrawingType
  geometryFormat: GeometryFormat
  geometry: Record<string, unknown>
  style: Record<string, unknown> | null
  label: string | null
  sortOrder: number | null
  version: number
}

export interface Itinerary {
  tripId: string
  itineraryVersion: number
  days: ItineraryDay[]
  routes: TripRoute[]
  mapDrawings: MapDrawing[]
}

export interface ItineraryMutationResponse {
  tripId: string
  itineraryVersion: number
  day: ItineraryDay | null
  item: ItineraryItem | null
  route: TripRoute | null
  drawing: MapDrawing | null
  affectedRouteIds: string[]
}

export interface CreateItineraryDayRequest {
  baseVersion: number
  groupType: DayGroupType
  dayNumber?: number | null
  date?: string | null
  title?: string | null
  sortOrder?: number | null
}

export interface UpdateItineraryDayRequest {
  baseVersion: number
  dayNumber?: number | null
  date?: string | null
  title?: string | null
  sortOrder?: number | null
}

export interface CreateItineraryItemRequest {
  baseVersion: number
  itineraryDayId: string
  sortOrder: number
  itemType: ItemType
  place?: PlaceRef | null
  placeName: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  thumbnailUrl?: string | null
}

export interface UpdateItineraryItemRequest {
  baseVersion: number
  itineraryDayId?: string
  sortOrder?: number
  placeName?: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  thumbnailUrl?: string | null
}

export interface ItineraryItemOrderRequest {
  itemId: string
  sortOrder: number
}

export interface ItineraryDayOrderRequest {
  dayId: string
  sortOrder: number
  itemOrders: ItineraryItemOrderRequest[]
}

export interface ReorderItineraryRequest {
  baseVersion: number
  days: ItineraryDayOrderRequest[]
}

export interface MapMatchRouteRequest {
  baseVersion: number
  originItineraryItemId: string
  destinationItineraryItemId: string
  mode: RouteMode
  coordinates: Array<{ lng: number; lat: number }>
  radiuses?: number[] | null
  tidy?: boolean | null
}

export interface CreateMapDrawingRequest {
  baseVersion: number
  itineraryDayId?: string | null
  drawingType: DrawingType
  geometry: Record<string, unknown>
  style?: Record<string, unknown> | null
  label?: string | null
  sortOrder?: number | null
}

export type CreateItineraryDayInput = Omit<CreateItineraryDayRequest, 'baseVersion'>
export type UpdateItineraryDayInput = Omit<UpdateItineraryDayRequest, 'baseVersion'>
export type CreateItineraryItemInput = Omit<CreateItineraryItemRequest, 'baseVersion'>
export type UpdateItineraryItemInput = Omit<UpdateItineraryItemRequest, 'baseVersion'>
export type ReorderItineraryInput = Omit<ReorderItineraryRequest, 'baseVersion'>
export type MapMatchRouteInput = Omit<MapMatchRouteRequest, 'baseVersion'>
export type CreateMapDrawingInput = Omit<CreateMapDrawingRequest, 'baseVersion'>
